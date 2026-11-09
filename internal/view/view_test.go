package view

import (
	"strings"
	"testing"
	"time"

	"github.com/tverma101/FreeTokens/internal/freebuff"
	"github.com/tverma101/FreeTokens/internal/tracker"
	"github.com/tverma101/FreeTokens/internal/usage"
)

// The status text is copied into bug reports and printed by `freetokens status`, so its shape is
// the contract: a formatting change here should be a deliberate edit to this expectation.
func TestText(t *testing.T) {
	now := time.Date(2026, 3, 4, 15, 4, 0, 0, time.Local)
	hoursReset := now.Add(2*time.Hour + 5*time.Minute)
	session := now.Add(45 * time.Minute)
	periodCost, modelCost, balance := 2.5, 2.0, 12.5
	snap := &tracker.Snapshot{
		RefreshedAt: now,
		Quota: &freebuff.Quota{
			Plan: "Pro",
			Meters: []freebuff.Meter{
				{Label: "Daily Hours", Used: 6, Limit: 40, Unit: "hours", ResetsAt: &hoursReset},
				{Label: "Sessions", Used: 2, Limit: 3, Unit: "sessions"},
			},
			HoursBalance:   &balance,
			ActiveSessions: []time.Time{session},
		},
		Periods: []usage.Period{
			{
				Label: "Today", Tokens: 1_234_567, CostUSD: &periodCost, CostLowerBound: true,
				Partial: true, HasData: true, UnknownModels: []string{"Mystery 1"},
				Models: []usage.ModelRow{
					{Name: "Claude Opus 4.5", Tokens: 1_000_000, CostUSD: &modelCost, CostComplete: true},
					{Name: "Local Model", Tokens: 234_567},
				},
			},
			{Label: "Yesterday"},
		},
		HistoryWarning: "Some receipts are missing.",
	}

	want := strings.Join([]string{
		"Freebuff · Pro",
		"  Daily Hours: 34 h left of 40 h · resets in 2h 05m",
		"  Hours Balance: 12.5 h",
		"  Sessions: 2 / 3 sessions",
		"  Session 1: 45m left",
		"",
		"Tokens (estimated at public API rates)",
		"  Today: 1.23M tokens · ≥$2.50 (partial)",
		"    Claude Opus 4.5: 1M · ~$2.00",
		"    Local Model: 234.6K · unpriced",
		"    unrecognized models: Mystery 1",
		"  Yesterday: no usage",
		"",
		"! Some receipts are missing.",
		"",
		"Updated Mar 4 15:04",
		"",
	}, "\n")

	if got := Text(snap, now); got != want {
		t.Fatalf("Text() mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// A quota failure and the history warning can be the same sentence; printing it twice makes the
// report look like two problems.
func TestTextPrintsARepeatedWarningOnce(t *testing.T) {
	now := time.Date(2026, 3, 4, 15, 4, 0, 0, time.Local)
	snap := &tracker.Snapshot{RefreshedAt: now, QuotaError: "signed out", HistoryWarning: "signed out"}

	got := Text(snap, now)
	if n := strings.Count(got, "signed out"); n != 1 {
		t.Fatalf("warning appears %d times, want 1:\n%s", n, got)
	}
	if !strings.Contains(got, "  ! signed out") {
		t.Fatalf("quota error line missing:\n%s", got)
	}
}

func TestTokens(t *testing.T) {
	for _, tc := range []struct {
		n    int64
		want string
	}{
		{0, "0"},
		{950, "950"},
		{1000, "1K"},
		{1234, "1.2K"},
		{1_234_567, "1.23M"},
		{4_560_000, "4.56M"},
		{1_000_000_000, "1B"},
	} {
		if got := Tokens(tc.n); got != tc.want {
			t.Errorf("Tokens(%d) = %q, want %q", tc.n, got, tc.want)
		}
	}
}

func TestUSD(t *testing.T) {
	for _, tc := range []struct {
		v          float64
		lowerBound bool
		want       string
	}{
		{0, false, "~$0.00"},
		{0.004, true, "<$0.01"},
		{12.3, false, "~$12.30"},
		{12.3, true, "≥$12.30"},
	} {
		if got := USD(tc.v, tc.lowerBound); got != tc.want {
			t.Errorf("USD(%v, %v) = %q, want %q", tc.v, tc.lowerBound, got, tc.want)
		}
	}
}

func TestHours(t *testing.T) {
	for _, tc := range []struct {
		v    float64
		want string
	}{
		{0, "0 h"},
		{40, "40 h"},
		{0.5, "0.5 h"},
		{2.5, "2.5 h"},
	} {
		if got := Hours(tc.v); got != tc.want {
			t.Errorf("Hours(%v) = %q, want %q", tc.v, got, tc.want)
		}
	}
}

func TestDuration(t *testing.T) {
	for _, tc := range []struct {
		d    time.Duration
		want string
	}{
		{-time.Minute, "0m"},
		{45 * time.Minute, "45m"},
		{2*time.Hour + 5*time.Minute, "2h 05m"},
		{49 * time.Hour, "2d 1h"},
	} {
		if got := Duration(tc.d); got != tc.want {
			t.Errorf("Duration(%v) = %q, want %q", tc.d, got, tc.want)
		}
	}
}

func TestClock(t *testing.T) {
	for _, tc := range []struct {
		d    time.Duration
		want string
	}{
		{45 * time.Minute, "45m"},
		{65 * time.Minute, "1:05"},
		{3 * time.Hour, "3:00"},
	} {
		if got := Clock(tc.d); got != tc.want {
			t.Errorf("Clock(%v) = %q, want %q", tc.d, got, tc.want)
		}
	}
}

func TestAgo(t *testing.T) {
	for _, tc := range []struct {
		d    time.Duration
		want string
	}{
		{30 * time.Second, "just now"},
		{4 * time.Minute, "4 min ago"},
		{2 * time.Hour, "2 hr ago"},
		{30 * time.Hour, "30 hr ago"},
		{50 * time.Hour, "2 days ago"},
	} {
		if got := Ago(tc.d); got != tc.want {
			t.Errorf("Ago(%v) = %q, want %q", tc.d, got, tc.want)
		}
	}
}

// A reset time in the past is stale data, not a countdown: it must not print "resets in 0m".
func TestMeterSkipsPastReset(t *testing.T) {
	now := time.Date(2026, 3, 4, 15, 4, 0, 0, time.Local)
	past := now.Add(-time.Hour)
	m := freebuff.Meter{Label: "Weekly", Used: 1, Limit: 2, Unit: "sessions", ResetsAt: &past, Detail: "shared"}

	got := Meter(m, now)
	if want := "Weekly: 1 / 2 sessions (shared)"; got != want {
		t.Fatalf("Meter() = %q, want %q", got, want)
	}
}
