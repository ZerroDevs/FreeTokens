package pricing

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strings"
	"testing"
	"time"
)

func ip(v int) *int         { return &v }
func fp(v float64) *float64 { return &v }

func TestUTCOverrideAppliesAtReceiptTime(t *testing.T) {
	// Off-peak lane 16:30–00:30 UTC on weekdays, wrapping midnight into the next day.
	r := Rates{Input: 1, Output: 2, CacheRead: 0.1, CacheReadExplicit: true,
		UTC: []UTCOverride{{Days: []string{"monday"}, StartMinute: ip(990), EndMinute: ip(30), Input: fp(0.5), Output: fp(1)}}}
	tok := Tokens{Input: 1_000_000, Output: 1_000_000}
	cases := []struct {
		at   time.Time
		want float64
	}{
		{time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC), 3},   // Monday noon: base
		{time.Date(2026, 11, 2, 17, 0, 0, 0, time.UTC), 1.5}, // Monday evening: discounted
		{time.Date(2026, 11, 3, 0, 15, 0, 0, time.UTC), 1.5}, // Tuesday 00:15 continues Monday's lane
		{time.Date(2026, 11, 3, 17, 0, 0, 0, time.UTC), 3},   // Tuesday evening: not listed
	}
	for _, c := range cases {
		if got := r.Cost(tok, c.at); math.Abs(got-c.want) > 1e-12 {
			t.Errorf("%s: cost %v, want %v", c.at, got, c.want)
		}
	}
}

func TestImplicitCacheReadUsesInputRate(t *testing.T) {
	r := Rates{Input: 2, Output: 0, CacheRead: 0}
	if got := r.Cost(Tokens{CacheRead: 1_000_000}, time.Time{}); got != 2 {
		t.Fatalf("cost = %v", got)
	}
}

func TestBundledSupplementAndAliasResolution(t *testing.T) {
	s := BundledSupplement()
	if len(s.Pricing) == 0 {
		t.Fatal("bundled supplement has no prices")
	}
	snap := NewSnapshot(s, map[string]Rates{"vendor/model-1-0": {Input: 3}})
	if _, ok := snap.Resolve("vendor/model-1.0"); !ok {
		t.Fatal("normalized key retry failed")
	}
	if NewSnapshot(s, nil).Token() == snap.Token() {
		t.Fatal("token must change with prices")
	}
}

func TestVendorReadsThePrefixOfThePricedRoute(t *testing.T) {
	snap := NewSnapshot(BundledSupplement(), map[string]Rates{
		"vendor/model-1-0": {Input: 3},
		"bare-model":       {Input: 1},
	})
	cases := map[string]string{
		"vendor/model-1-0": "vendor",
		"vendor/model-1.0": "vendor", // normalized retry
		"bare-model":       "",
		"nobody/knows-me":  "",
	}
	for model, want := range cases {
		if got := snap.Vendor(model); got != want {
			t.Errorf("Vendor(%q) = %q, want %q", model, got, want)
		}
	}
	var none *Snapshot
	if got := none.Vendor("vendor/model-1-0"); got != "" {
		t.Errorf("nil snapshot Vendor = %q, want empty", got)
	}
}

// A feed is fetched when it is stale, and not again inside the retry window after a failure.
func TestDueHonoursFreshnessAndRetryWindow(t *testing.T) {
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name             string
		success, attempt time.Time
		force            bool
		want             bool
	}{
		{"never fetched", time.Time{}, time.Time{}, false, true},
		{"fresh success", now.Add(-30 * time.Minute), now.Add(-30 * time.Minute), false, false},
		{"stale success", now.Add(-61 * time.Minute), now.Add(-61 * time.Minute), false, true},
		{"recent failure", time.Time{}, now.Add(-10 * time.Minute), false, false},
		{"expired retry window", time.Time{}, now.Add(-31 * time.Minute), false, true},
		{"forced", now, now, true, true},
	}
	for _, c := range cases {
		if got := due(c.success, c.attempt, now, c.force); got != c.want {
			t.Errorf("%s: due = %v, want %v", c.name, got, c.want)
		}
	}
}

// A blocked OpenRouter used to hold back the shared "last success" and re-download the supplement
// on every retry. Each feed now keeps its own schedule.
type offlineTransport struct{ hits []string }

func (o *offlineTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	o.hits = append(o.hits, req.URL.String())
	return nil, errors.New("offline in tests")
}

func TestRefreshLeavesAFreshSupplementAloneWhileOpenRouterRetries(t *testing.T) {
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	store := NewStore(t.TempDir(), "")
	transport := &offlineTransport{}
	store.HTTP = &http.Client{Transport: transport}
	// The supplement succeeded just now; OpenRouter's last failure is past its retry window.
	store.suppSuccess, store.suppAttempt = now, now
	store.orAttempt = now.Add(-31 * time.Minute)

	err := store.Refresh(context.Background(), now, false)
	if err == nil || strings.Contains(err.Error(), "supplement") {
		t.Fatalf("err = %v, want only the OpenRouter failure", err)
	}
	if len(transport.hits) == 0 {
		t.Fatal("OpenRouter was due but never attempted")
	}
	for _, hit := range transport.hits {
		if hit == SupplementURL {
			t.Fatalf("supplement fetched while fresh: %v", transport.hits)
		}
	}
}

func TestOpenRouterPagination(t *testing.T) {
	p, err := ParseOpenRouterPage([]byte(`{"data":[{}],"total_count":3,"links":{"next":"/api/v1/models?offset=1&limit=1"}}`))
	if err != nil || p.NextOffset == nil || *p.NextOffset != 1 || p.TotalCount != 3 {
		t.Fatalf("p=%+v err=%v", p, err)
	}
	if _, err := ParseOpenRouterPage([]byte(`{"nodata":1}`)); err != ErrIncompleteModelList {
		t.Fatalf("err = %v", err)
	}
}
