// Package tracker orchestrates one Freebuff refresh: live quota, hosted receipts, model catalog,
// public pricing and Desktop history, mirroring QuotaBar's FreebuffProvider.refresh.
package tracker

import (
	"context"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/tverma101/FreeTokens/internal/antigravity"
	"github.com/tverma101/FreeTokens/internal/claude"
	"github.com/tverma101/FreeTokens/internal/codex"
	"github.com/tverma101/FreeTokens/internal/freebuff"
	"github.com/tverma101/FreeTokens/internal/opencode"
	"github.com/tverma101/FreeTokens/internal/pricing"
	"github.com/tverma101/FreeTokens/internal/usage"
)

// HistorySourceNote explains what the token and dollar figures mean.
const HistorySourceNote = "Measured Freebuff usage and local Antigravity app, IDE, Agy CLI, Claude, Codex and OpenCode usage on this computer; dollars are estimated at public API rates, not what Freebuff, Antigravity or the model providers charge."

// Snapshot is one refresh result.
type Snapshot struct {
	RefreshedAt time.Time       `json:"refreshedAt"`
	Quota       *freebuff.Quota `json:"quota,omitempty"`
	// QuotaError is the live quota failure, if any.
	QuotaError string `json:"quotaError,omitempty"`
	// QuotaErrorCode classifies QuotaError for UIs: "signed-out", "expired", "approval" (the OS
	// needs the user to allow keychain access), "network" or "other".
	QuotaErrorCode string         `json:"quotaErrorCode,omitempty"`
	HistoryWarning string         `json:"historyWarning,omitempty"`
	Periods        []usage.Period `json:"periods,omitempty"`
	Days           []usage.Day    `json:"days,omitempty"`
	// Sources reports what each local reader found, so a missing total can be traced to one store.
	Sources []SourceHealth `json:"sources,omitempty"`
	// Slots is the retained window's usage by local weekday and hour.
	Slots *usage.Slots `json:"slots,omitempty"`
	// Observation is the allowlisted numeric projection of the last session body (diagnostics only).
	Observation *freebuff.Observation `json:"observation,omitempty"`
	SourceNote  string                `json:"sourceNote"`
}

// SourceHealth is one reader's coverage from the last refresh. Files counts the inputs it found
// (databases, transcripts or rollouts), and State is "ok", "partial", "error", "missing" or
// "signed-out" so the panel can explain a gap without parsing a warning sentence.
type SourceHealth struct {
	Name       string `json:"name"`
	Files      int    `json:"files"`
	Unreadable int    `json:"unreadable"`
	State      string `json:"state"`
	Detail     string `json:"detail,omitempty"`
	// LastReadAt is when this source was last read successfully, absent if it never was.
	LastReadAt *time.Time `json:"lastReadAt,omitempty"`
}

// Tracker holds caches across refreshes. Methods are safe for concurrent use; refreshes serialize.
type Tracker struct {
	Auth        freebuff.AuthStore
	Client      *freebuff.Client
	Hosted      *freebuff.HostedScanner
	Catalog     *freebuff.ModelCatalog
	Pricing     *pricing.Store
	Desktop     *freebuff.DesktopScanner
	Antigravity *antigravity.Scanner
	Claude      *claude.Scanner
	Codex       *codex.Scanner
	OpenCode    *opencode.Scanner
	Now         func() time.Time

	mu       sync.Mutex
	loggedMu sync.Mutex
	logged   map[string]bool
	// lastRead records each source's last successful read, across refreshes, for the health list.
	// Refresh holds mu for its whole run, so this map needs no lock of its own.
	lastRead map[string]time.Time
}

// New builds a tracker with caches under cacheDir.
func New(cacheDir, userAgent string, tz func() string) *Tracker {
	return &Tracker{
		Auth:        freebuff.DefaultAuthStore(),
		Client:      freebuff.NewClient(userAgent, tz),
		Hosted:      &freebuff.HostedScanner{CachePath: filepath.Join(cacheDir, "freebuff-hosted-usage.json")},
		Catalog:     &freebuff.ModelCatalog{CachePath: filepath.Join(cacheDir, "freebuff-models.json")},
		Pricing:     pricing.NewStore(filepath.Join(cacheDir, "pricing"), userAgent),
		Desktop:     &freebuff.DesktopScanner{Roots: freebuff.DesktopRoots()},
		Antigravity: antigravity.NewScanner(),
		Claude:      claude.NewScanner(),
		Codex:       codex.NewScanner(),
		OpenCode:    opencode.NewScanner(),
		Now:         time.Now,
	}
}

// logOnce logs a failure once until clear(key) is called, so a persistent outage doesn't spam.
func (t *Tracker) logOnce(key, format string, args ...any) {
	t.loggedMu.Lock()
	defer t.loggedMu.Unlock()
	if t.logged == nil {
		t.logged = map[string]bool{}
	}
	if !t.logged[key] {
		t.logged[key] = true
		log.Printf(format, args...)
	}
}

func (t *Tracker) clear(key string) {
	t.loggedMu.Lock()
	delete(t.logged, key)
	t.loggedMu.Unlock()
}

// Refresh runs one full refresh. interactive allows an OS credential prompt (manual refresh only).
func (t *Tracker) Refresh(ctx context.Context, interactive bool) *Snapshot {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.Now()
	snap := &Snapshot{RefreshedAt: now, SourceNote: HistorySourceNote}

	auth, authErr := t.Auth.Load(interactive)
	if auth == nil && authErr == nil {
		authErr = freebuff.ErrNotLoggedIn
	}
	if auth != nil {
		t.refreshQuota(ctx, *auth, snap)
	} else {
		snap.setQuotaError(authErr)
	}
	if ctx.Err() != nil {
		return snap
	}

	if err := t.Pricing.Refresh(ctx, now, false); err != nil {
		t.logOnce("pricing", "pricing feed refresh failed: %v", err)
	} else {
		t.clear("pricing")
	}

	var hosted []freebuff.Receipt
	incomplete := auth == nil
	hostedState, hostedDetail := "ok", ""
	// Warnings are collected per source and joined at the end: an unreadable store costs its own
	// rows, not the explanation of every other one.
	var notes []string
	note := func(msg string) {
		if msg != "" {
			notes = append(notes, msg)
		}
	}
	if auth == nil {
		note(authErr.Error())
		hostedState, hostedDetail = "signed-out", "No Freebuff sign-in, so hosted history is unavailable."
	} else {
		var err error
		hosted, err = t.Hosted.Scan(ctx, *auth, t.Client, now)
		if err != nil {
			if ctx.Err() != nil {
				return snap
			}
			t.logOnce("hosted", "hosted token history read failed: %v", err)
			hosted = t.Hosted.Cached(*auth)
			incomplete = true
			if errors.Is(err, freebuff.ErrTokenInvalid) {
				note(err.Error())
			} else {
				note("Freebuff's hosted token history couldn't be refreshed. Totals may be incomplete.")
			}
			hostedState, hostedDetail = "cached", "Hosted history couldn't be refreshed; the saved copy is shown."
		} else {
			t.clear("hosted")
			t.markRead("hosted", now)
		}
		if len(hosted) > 0 || t.Desktop.HasHistory() {
			if err := t.Catalog.Refresh(ctx, *auth, t.Client, now); err != nil {
				if ctx.Err() != nil {
					return snap
				}
				t.logOnce("catalog", "model catalog refresh failed: %v", err)
				note("Freebuff model names couldn't be refreshed. Saved model data is still available.")
			} else {
				t.clear("catalog")
			}
		}
	}

	// readSource runs one independent local reader. A failure is logged once, turned into a warning
	// and otherwise skipped, so a corrupt Freebuff Desktop database no longer suppresses Antigravity,
	// Claude Code, Codex or OpenCode usage computed below it.
	failed := map[string]bool{}
	readSource := func(key, logMessage, warning string, scan func() ([]usage.Day, error)) []usage.Day {
		days, err := scan()
		if err == nil {
			t.clear(key)
			t.markRead(key, now)
			return days
		}
		if ctx.Err() != nil {
			return nil
		}
		failed[key] = true
		t.logOnce(key, "%s: %v", logMessage, err)
		note(warning)
		return nil
	}

	var desktopDays []usage.Day
	if t.Desktop != nil {
		desktopDays = readSource("history", "token history read failed", freebuff.ErrLocalHistory.Error(), func() ([]usage.Day, error) {
			fold, err := t.Desktop.Scan(ctx, now, t.Pricing.Current(), t.Catalog.Current(), hosted)
			if err != nil {
				return nil, err
			}
			return fold.Days, nil
		})
	}
	var antigravityDays []usage.Day
	if t.Antigravity != nil {
		antigravityDays = readSource("antigravity", "antigravity history read failed", "Antigravity's local history couldn't be read, so its usage may be missing.", func() ([]usage.Day, error) {
			return t.Antigravity.Scan(ctx, now, t.Pricing.Current())
		})
	}
	var claudeDays []usage.Day
	if t.Claude != nil {
		claudeDays = readSource("claude", "claude code history read failed", "Claude Code history couldn't be read, so its usage may be missing.", func() ([]usage.Day, error) {
			return t.Claude.Scan(ctx, now, t.Pricing.Current())
		})
	}
	var codexDays []usage.Day
	if t.Codex != nil {
		codexDays = readSource("codex", "codex cli history read failed", "Codex history couldn't be read, so its usage may be missing.", func() ([]usage.Day, error) {
			return t.Codex.Scan(ctx, now, t.Pricing.Current())
		})
	}
	var opencodeDays []usage.Day
	if t.OpenCode != nil {
		opencodeDays = readSource("opencode", "opencode history read failed", "OpenCode history couldn't be read, so its usage may be missing.", func() ([]usage.Day, error) {
			return t.OpenCode.Scan(ctx, now, t.Pricing.Current())
		})
	}
	if ctx.Err() != nil {
		return snap
	}

	// A source that skipped files still returns the days it could read, so its totals are a lower
	// bound rather than a failure. Report that provenance here instead of leaving it in the log.
	noteUnreadable := func(name, one, many string, n int) {
		if n > 0 {
			note(fmt.Sprintf("%d %s %s couldn't be read, so totals are missing their usage.", n, name, plural(n, one, many)))
		}
	}
	if t.Desktop != nil {
		noteUnreadable("Freebuff", "history row", "history rows", t.Desktop.Unreadable())
		noteUnreadable("Freebuff", "history database", "history databases", t.Desktop.UnreadableDatabases())
	}
	if t.Antigravity != nil {
		noteUnreadable("Antigravity", "conversation database", "conversation databases", t.Antigravity.Unreadable())
		if approx, reused, total := t.Antigravity.Placement(); approx+reused > 0 {
			note(fmt.Sprintf("%d of %d Antigravity generations had no step with matching token counts. Their tokens are dated at the nearest step, so Antigravity's per-day split is approximate.", approx+reused, total))
		}
	}
	if t.Claude != nil {
		noteUnreadable("Claude Code", "transcript", "transcripts", t.Claude.Unreadable())
	}
	if t.Codex != nil {
		noteUnreadable("Codex", "session rollout", "session rollouts", t.Codex.Unreadable())
	}

	// A missing or failing Freebuff login only makes Freebuff's own contribution a lower bound:
	// Claude, Codex and OpenCode measured their days completely and must keep that. Marking the
	// merged days instead would flag a Claude-only day as partial because Freebuff was signed out.
	if incomplete {
		for i := range desktopDays {
			desktopDays[i].Partial = true
		}
	}
	days := usage.MergeDays(desktopDays, antigravityDays, claudeDays, codexDays, opencodeDays)
	first := usage.DayKey(now.AddDate(0, 0, -29))
	today := usage.DayKey(now)
	for _, d := range days {
		if d.Partial && d.Date >= first && d.Date <= today {
			note("Some usage has no complete receipt. Totals include only measured usage.")
			break
		}
	}
	snap.HistoryWarning = joinNotes(notes)
	snap.Days = days
	snap.Periods = usage.StandardPeriods(days, now)
	snap.Sources = t.sourceHealth(failed, hostedState, hostedDetail)
	snap.Slots = usage.BuildSlots(days)
	return snap
}

// markRead records a successful read of one source for the health list.
func (t *Tracker) markRead(key string, at time.Time) {
	if t.lastRead == nil {
		t.lastRead = map[string]time.Time{}
	}
	t.lastRead[key] = at
}

// readAt is when a source last answered, or nil if it never did.
func (t *Tracker) readAt(key string) *time.Time {
	at, ok := t.lastRead[key]
	if !ok {
		return nil
	}
	return &at
}

// sourceHealth reports each reader's coverage so the panel can point at the store that is short.
func (t *Tracker) sourceHealth(failed map[string]bool, hostedState, hostedDetail string) []SourceHealth {
	out := []SourceHealth{{Name: "Freebuff", State: hostedState, Detail: hostedDetail, LastReadAt: t.readAt("hosted")}}
	if t.Desktop != nil {
		unreadable := t.Desktop.Unreadable() + t.Desktop.UnreadableDatabases()
		out = append(out, healthRow("Freebuff Desktop", t.Desktop.DatabaseCount(), unreadable, failed["history"], t.readAt("history"), "No Freebuff Desktop history found."))
	}
	if t.Antigravity != nil {
		out = append(out, healthRow("Antigravity", t.Antigravity.FileCount(), t.Antigravity.Unreadable(), failed["antigravity"], t.readAt("antigravity"), "No Antigravity conversations found."))
	}
	if t.Claude != nil {
		out = append(out, healthRow("Claude", t.Claude.FileCount(), t.Claude.Unreadable(), failed["claude"], t.readAt("claude"), "No Claude Code transcripts found."))
	}
	if t.Codex != nil {
		out = append(out, healthRow("Codex", t.Codex.FileCount(), t.Codex.Unreadable(), failed["codex"], t.readAt("codex"), "No Codex sessions found."))
	}
	if t.OpenCode != nil {
		out = append(out, healthRow("OpenCode", t.OpenCode.FileCount(), 0, failed["opencode"], t.readAt("opencode"), "No OpenCode database found."))
	}
	return out
}

func healthRow(name string, files, unreadable int, failed bool, lastRead *time.Time, missing string) SourceHealth {
	switch {
	case failed:
		return SourceHealth{Name: name, Files: files, Unreadable: unreadable, State: "error",
			Detail: "Reading this source failed, so its usage is missing.", LastReadAt: lastRead}
	case unreadable > 0:
		return SourceHealth{Name: name, Files: files, Unreadable: unreadable, State: "partial",
			Detail: fmt.Sprintf("%d %s could not be read, so totals are missing their usage.", unreadable, plural(unreadable, "input", "inputs")), LastReadAt: lastRead}
	case files == 0:
		return SourceHealth{Name: name, State: "missing", Detail: missing, LastReadAt: lastRead}
	}
	return SourceHealth{Name: name, Files: files, State: "ok", LastReadAt: lastRead}
}

// plural picks the noun form for a count, so a detail reads "1 input" rather than "1 input(s)".
func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// joinNotes keeps every source's failure readable in one line: a note that does not already end a
// sentence gets a period before the next one starts.
func joinNotes(notes []string) string {
	var b strings.Builder
	for _, n := range notes {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		if b.Len() > 0 {
			if last := b.String()[b.Len()-1]; last != '.' && last != '!' && last != '?' {
				b.WriteByte('.')
			}
			b.WriteByte(' ')
		}
		b.WriteString(n)
	}
	return b.String()
}

func (t *Tracker) refreshQuota(ctx context.Context, auth freebuff.Auth, snap *Snapshot) {
	resp, err := t.Client.FetchSession(ctx, auth)
	if err != nil {
		t.logOnce("quota", "usage refresh failed: %v", err)
		snap.setQuotaError(freebuff.ErrConnection)
		return
	}
	switch {
	case resp.Status == 401:
		snap.setQuotaError(freebuff.ErrTokenInvalid)
		return
	case (resp.Status < 200 || resp.Status >= 300) && resp.Status != 404:
		t.logOnce("quota", "usage refresh failed: HTTP %d", resp.Status)
		snap.setQuotaError(freebuff.RequestFailed{Status: resp.Status})
		return
	}
	q, err := freebuff.MapQuota(resp.Status, resp.Body)
	if err != nil {
		t.logOnce("quota", "usage refresh failed: %v", err)
		snap.setQuotaError(err)
		return
	}
	t.clear("quota")
	obs := freebuff.Observe(resp.Body)
	snap.Quota, snap.Observation = q, &obs
}

func (s *Snapshot) setQuotaError(err error) {
	s.QuotaError = err.Error()
	s.QuotaErrorCode = ErrorCode(err)
}

// ErrorCode classifies a quota or auth error (see Snapshot.QuotaErrorCode).
func ErrorCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, freebuff.ErrNotLoggedIn), errors.Is(err, freebuff.ErrMissingDefaultProfile),
		errors.Is(err, freebuff.ErrInvalidCredentials):
		return "signed-out"
	case errors.Is(err, freebuff.ErrTokenInvalid):
		return "expired"
	case errors.Is(err, freebuff.ErrPermissionRequired):
		return "approval"
	case errors.Is(err, freebuff.ErrConnection):
		return "network"
	}
	return "other"
}
