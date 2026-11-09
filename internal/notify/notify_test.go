package notify

import (
	"testing"
	"time"

	"github.com/tverma101/FreeTokens/internal/freebuff"
)

func quota(limit, used float64, resetsAt *time.Time) *freebuff.Quota {
	return &freebuff.Quota{Meters: []freebuff.Meter{
		{Label: "Daily Hours", Used: used, Limit: limit, Unit: "hours", ResetsAt: resetsAt},
	}}
}

func TestCheckPostsOncePerWindow(t *testing.T) {
	now := time.Date(2026, 11, 10, 13, 0, 0, 0, time.UTC)
	reset := now.Add(3 * time.Hour)
	n := &Notifier{post: func(string, string) error { return nil }}
	var posts int
	n.post = func(title, body string) error {
		posts++
		if title != "FreeTokens" {
			t.Errorf("title = %q", title)
		}
		return nil
	}

	q := quota(40, 39.5, &reset)
	if !n.Check(q, now) {
		t.Fatal("first low-hours check did not post")
	}
	if n.Check(q, now.Add(time.Minute)) {
		t.Fatal("second check in the same window posted again")
	}
	if posts != 1 {
		t.Fatalf("posted %d notifications, want 1", posts)
	}

	// A new reset window is a new announcement.
	later := reset.Add(time.Minute)
	if !n.Check(quota(40, 39.5, &later), later) {
		t.Fatal("check after the reset window changed did not post")
	}
}

func TestCheckIgnoresHealthyBudget(t *testing.T) {
	now := time.Date(2026, 11, 10, 13, 0, 0, 0, time.UTC)
	reset := now.Add(3 * time.Hour)
	n := &Notifier{post: func(string, string) error { return nil }}
	if n.Check(quota(40, 20, &reset), now) {
		t.Fatal("posted with half the budget left")
	}
	if n.Check(nil, now) {
		t.Fatal("posted without a quota")
	}
	if n.Check(&freebuff.Quota{}, now) {
		t.Fatal("posted without a daily hours meter")
	}
}
