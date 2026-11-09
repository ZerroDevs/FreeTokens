package pricing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	OpenRouterURL = "https://openrouter.ai/api/v1/models"
	SupplementURL = "https://robinebers.github.io/openusage/pricing_supplement.json"
	refreshEvery  = time.Hour
	retryAfter    = 30 * time.Minute
)

// Store serves the current snapshot without blocking on the network and refreshes public feeds
// at most hourly (30 minutes after a failure). Feeds are cached on disk for offline starts.
type Store struct {
	Dir       string
	HTTP      *http.Client
	UserAgent string

	mu sync.Mutex
	// Each feed keeps its own schedule. A shared "last success" tied both feeds to OpenRouter, so
	// a network that blocks it re-downloaded the supplement on every retry.
	bundled     *Supplement
	fetchedSupp *Supplement
	openRouter  map[string]Rates
	suppSuccess time.Time
	suppAttempt time.Time
	orSuccess   time.Time
	orAttempt   time.Time
	snapshot    *Snapshot
}

type orCache struct {
	FetchedAt time.Time        `json:"fetchedAt"`
	Entries   map[string]Rates `json:"entries"`
}

// NewStore loads the bundled supplement and any cached feeds from dir.
func NewStore(dir, userAgent string) *Store {
	s := &Store{Dir: dir, HTTP: &http.Client{Timeout: 30 * time.Second}, UserAgent: userAgent, bundled: BundledSupplement()}
	if data, err := os.ReadFile(filepath.Join(dir, "pricing_supplement.json")); err == nil {
		if sup, err := DecodeSupplement(data); err == nil {
			s.fetchedSupp = sup
		}
	}
	if data, err := os.ReadFile(filepath.Join(dir, "openrouter-rates.json")); err == nil {
		var c orCache
		if json.Unmarshal(data, &c) == nil && len(c.Entries) > 0 {
			s.openRouter, s.orSuccess = c.Entries, c.FetchedAt
		}
	}
	return s
}

// Current returns the latest snapshot.
func (s *Store) Current() *Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshot == nil {
		sup := s.bundled
		if s.fetchedSupp != nil {
			sup = s.bundled.Merging(s.fetchedSupp)
		}
		s.snapshot = NewSnapshot(sup, s.openRouter)
	}
	return s.snapshot
}

// due reports whether a feed is worth fetching now: stale enough to refresh (or forced), and not
// inside the retry window that follows a failure.
func due(success, attempt, now time.Time, force bool) bool {
	if force {
		return true
	}
	if !success.IsZero() && now.Sub(success) < refreshEvery {
		return false
	}
	return attempt.IsZero() || now.Sub(attempt) >= retryAfter
}

// Refresh fetches the feeds that are due. Errors are returned for logging; the previous snapshot
// stays usable, and a feed that is not due keeps its saved data and costs no request.
func (s *Store) Refresh(ctx context.Context, now time.Time, force bool) error {
	s.mu.Lock()
	needSupp := due(s.suppSuccess, s.suppAttempt, now, force)
	needRouter := due(s.orSuccess, s.orAttempt, now, force)
	if needSupp {
		s.suppAttempt = now
	}
	if needRouter {
		s.orAttempt = now
	}
	s.mu.Unlock()
	if !needSupp && !needRouter {
		return nil
	}

	var errs []error
	if needSupp {
		if data, err := s.get(ctx, SupplementURL); err == nil {
			if sup, err := DecodeSupplement(data); err == nil {
				s.mu.Lock()
				s.fetchedSupp, s.suppSuccess, s.snapshot = sup, now, nil
				s.mu.Unlock()
				_ = writeAtomic(filepath.Join(s.Dir, "pricing_supplement.json"), data)
			} else {
				errs = append(errs, fmt.Errorf("supplement: %w", err))
			}
		} else {
			errs = append(errs, fmt.Errorf("supplement: %w", err))
		}
	}
	if needRouter {
		entries, err := s.fetchOpenRouter(ctx)
		if err == nil {
			s.mu.Lock()
			s.openRouter, s.orSuccess, s.snapshot = entries, now, nil
			s.mu.Unlock()
			if data, err := json.Marshal(orCache{FetchedAt: now, Entries: entries}); err == nil {
				_ = writeAtomic(filepath.Join(s.Dir, "openrouter-rates.json"), data)
			}
		} else {
			errs = append(errs, fmt.Errorf("openrouter: %w", err))
		}
	}
	return errors.Join(errs...)
}

func (s *Store) fetchOpenRouter(ctx context.Context) (map[string]Rates, error) {
	var models []json.RawMessage
	offset, total := 0, -1
	for i := 0; i < 50; i++ {
		u := OpenRouterURL
		if offset > 0 {
			u = fmt.Sprintf("%s?offset=%d", OpenRouterURL, offset)
		}
		data, err := s.get(ctx, u)
		if err != nil {
			return nil, err
		}
		page, err := ParseOpenRouterPage(data)
		if err != nil {
			return nil, err
		}
		models = append(models, page.Models...)
		total = page.TotalCount
		if page.NextOffset == nil {
			break
		}
		if *page.NextOffset != offset+len(page.Models) || *page.NextOffset <= offset {
			return nil, ErrIncompleteModelList
		}
		offset = *page.NextOffset
	}
	if total != len(models) {
		return nil, ErrIncompleteModelList
	}
	return CatalogFromOpenRouter(models)
}

func (s *Store) get(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if s.UserAgent != "" {
		req.Header.Set("User-Agent", s.UserAgent)
	}
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 64<<20))
}

// writeAtomic preserves the last successfully fetched pricing cache if the
// destination cannot be replaced. A temporary file is always unique so a
// concurrent refresh cannot truncate or steal another writer's staging file.
func writeAtomic(path string, data []byte) error {
	return writeAtomicWithRename(path, data, os.Rename)
}

func writeAtomicWithRename(path string, data []byte, rename func(string, string) error) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".freetokens-price-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// The old offline cache stays intact when Windows refuses a replacement.
	return rename(name, path)
}
