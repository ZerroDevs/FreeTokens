package freebuff

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"

	"github.com/tverma101/FreeTokens/internal/pricing"
)

// CatalogEntry is one public model identity; never handles or credentials.
type CatalogEntry struct {
	Key           string   `json:"key"`
	DisplayName   string   `json:"displayName"`
	LegacyDigests []string `json:"legacyDigests,omitempty"`
}

// ModelCatalog caches Freebuff's model identities, refreshing at most hourly (failures too).
type ModelCatalog struct {
	CachePath   string
	mu          sync.Mutex
	fetchedAt   time.Time
	entries     []CatalogEntry
	lastAttempt time.Time
	lastErr     error
	loaded      bool
}

const catalogInterval = time.Hour

type catalogCache struct {
	FetchedAt time.Time      `json:"fetchedAt"`
	Entries   []CatalogEntry `json:"entries"`
}

func (m *ModelCatalog) load() {
	if m.loaded {
		return
	}
	m.loaded = true
	if data, err := os.ReadFile(m.CachePath); err == nil {
		var c catalogCache
		if json.Unmarshal(data, &c) == nil {
			m.fetchedAt, m.entries = c.FetchedAt, c.Entries
		}
	}
}

// Current returns entries keyed by opaque model key.
func (m *ModelCatalog) Current() map[string]CatalogEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.load()
	out := map[string]CatalogEntry{}
	for _, e := range m.entries {
		out[e.Key] = e
	}
	return out
}

// Refresh fetches the catalogue when stale.
func (m *ModelCatalog) Refresh(ctx context.Context, a Auth, c *Client, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.load()
	if !m.fetchedAt.IsZero() && now.Sub(m.fetchedAt) < catalogInterval {
		return nil
	}
	if !m.lastAttempt.IsZero() && now.Sub(m.lastAttempt) < catalogInterval {
		return m.lastErr
	}
	m.lastAttempt = now
	resp, err := c.FetchModelCatalog(ctx, a)
	if err != nil {
		if ctx.Err() != nil {
			m.lastAttempt = time.Time{}
			return err
		}
		m.lastErr = err
		return err
	}
	if resp.Status < 200 || resp.Status > 299 {
		m.lastErr = RequestFailed{resp.Status}
		return m.lastErr
	}
	var wire struct {
		Protocol int            `json:"protocol"`
		Rows     []CatalogEntry `json:"rows"`
	}
	keys := map[string]bool{}
	valid := json.Unmarshal(resp.Body, &wire) == nil && wire.Protocol == 1 && len(wire.Rows) > 0
	for _, r := range wire.Rows {
		if r.Key == "" || r.DisplayName == "" || keys[r.Key] {
			valid = false
		}
		keys[r.Key] = true
	}
	if !valid {
		m.lastErr = ErrInvalidResponse
		return m.lastErr
	}
	m.fetchedAt, m.entries, m.lastErr = now, wire.Rows, nil
	if data, err := json.Marshal(catalogCache{now, wire.Rows}); err == nil && m.CachePath != "" {
		_ = writeFileAtomic(m.CachePath, data)
	}
	return nil
}

var (
	contextSuffix100k = regexp.MustCompile(`(?i)\s*(?:[·•]\s*)?100k\s+context$`)
	contextSuffixAny  = regexp.MustCompile(`(?i)\s*(?:[·•]\s*)?\d+k\s+context$`)
	buildDateSuffix   = regexp.MustCompile(`\s+\d{1,2}/\d{1,2}$`)
	modeSuffix        = regexp.MustCompile(`(?i)\s+(?:Fast|Slow)$`)
)

// normalizedName drops the 100k-context annotation, a 'v' before a version digit at a word
// boundary, case, and every non-alphanumeric character.
func normalizedName(name string) string {
	s := strings.ToLower(contextSuffix100k.ReplaceAllString(name, ""))
	runes := []rune(s)
	var b strings.Builder
	for i, r := range runes {
		if r == 'v' && i+1 < len(runes) && unicode.IsDigit(runes[i+1]) && (i == 0 || !isWordRune(runes[i-1])) {
			continue
		}
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' }

// PricingRoutes maps catalogue keys to exact public routes. Only unique normalized display-name
// matches against OpenRouter's provider/model routes, then explicit supplement aliases. No fuzzy matching.
func PricingRoutes(entries map[string]CatalogEntry, p *pricing.Snapshot) map[string]string {
	index := map[string][]string{}
	for k := range p.OpenRouter {
		if !strings.Contains(k, "/") {
			continue
		}
		parts := strings.Split(k, "/")
		n := normalizedName(parts[len(parts)-1])
		index[n] = append(index[n], k)
	}
	routes := map[string]string{}
	for key, e := range entries {
		if m := index[normalizedName(e.DisplayName)]; len(m) == 1 {
			routes[key] = m[0]
		}
	}
	for key, e := range entries {
		if _, ok := routes[key]; ok {
			continue
		}
		if canonical, ok := p.Supplement.CanonicalName(e.DisplayName); ok {
			if _, priced := p.Supplement.Pricing[canonical]; priced {
				routes[key] = canonical
			}
		}
	}
	return routes
}

// LegacyDigest matches freebuffLegacyModelDigest in Freebuff's freebuff-model-catalog.ts: two
// FNV-style accumulators over JavaScript UTF-16 code units.
func LegacyDigest(model string) string {
	first, second := uint32(0x811c9dc5), uint32(0x01000193^0x5bd1e995)
	for _, cu := range utf16.Encode([]rune("freebuff-legacy-model:" + model)) {
		first = (first ^ uint32(cu)) * 0x01000193
		second = (second ^ uint32(cu)) * 0x5bd1e995
	}
	return fmt.Sprintf("%08x%08x", first, second)
}

// GroupName drops context, build-date and Fast/Slow annotations for the compact breakdown.
func GroupName(name string) string {
	s := contextSuffixAny.ReplaceAllString(name, "")
	s = buildDateSuffix.ReplaceAllString(s, "")
	s = modeSuffix.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

// OlderUsageName labels older local records whose model label is missing or retired.
const OlderUsageName = "Older Freebuff Usage"

// Resolved is a model's price route and display identity.
type Resolved struct {
	Route, DisplayName, Group string
}

// Identity resolves receipt model strings to routes and display names.
type Identity struct {
	entries map[string]CatalogEntry
	routes  map[string]string
	legacy  map[string]*CatalogEntry
	names   map[string]string
	pricing *pricing.Snapshot
	memo    map[string]Resolved
}

// NewIdentity indexes the catalogue for one pricing snapshot.
func NewIdentity(entries map[string]CatalogEntry, p *pricing.Snapshot) *Identity {
	id := &Identity{entries: entries, routes: PricingRoutes(entries, p), legacy: map[string]*CatalogEntry{}, names: map[string]string{}, pricing: p, memo: map[string]Resolved{}}
	owners := map[string]map[string]bool{}
	for _, e := range entries {
		for _, d := range e.LegacyDigests {
			if owners[d] == nil {
				owners[d] = map[string]bool{}
			}
			owners[d][e.Key] = true
		}
	}
	for d, keys := range owners {
		if len(keys) == 1 { // a collision must not pick an arbitrary model
			for k := range keys {
				e := entries[k]
				id.legacy[d] = &e
			}
		}
	}
	byRoute := map[string]map[string]bool{}
	for key, route := range id.routes {
		if byRoute[route] == nil {
			byRoute[route] = map[string]bool{}
		}
		if e, ok := entries[key]; ok {
			byRoute[route][e.DisplayName] = true
		}
	}
	for route, names := range byRoute {
		if len(names) == 1 {
			for n := range names {
				id.names[route] = n
			}
		}
	}
	return id
}

// Resolve uses the provider's published migration contract and never guesses opaque keys.
func (id *Identity) Resolve(model string) Resolved {
	if r, ok := id.memo[model]; ok {
		return r
	}
	var entry *CatalogEntry
	if e, ok := id.entries[model]; ok {
		entry = &e
	} else if e := id.legacy[LegacyDigest(model)]; e != nil {
		entry = e
	}
	var r Resolved
	if id.pricing.HasExactRoute(model) {
		r.Route = model
	} else if entry != nil {
		r.Route = id.routes[entry.Key]
	}
	if entry != nil {
		r.DisplayName = entry.DisplayName
	} else if r.Route != "" {
		r.DisplayName = id.names[r.Route]
	}
	if r.DisplayName != "" {
		r.Group = GroupName(r.DisplayName)
	}
	if len(id.memo) < 4096 {
		id.memo[model] = r
	}
	return r
}
