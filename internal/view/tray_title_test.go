package view

import (
	"testing"
	"time"

	"github.com/tverma101/FreeTokens/internal/config"
	"github.com/tverma101/FreeTokens/internal/freebuff"
	"github.com/tverma101/FreeTokens/internal/tracker"
	"github.com/tverma101/FreeTokens/internal/usage"
)

// Each menu-bar choice comes from measured data and disappears rather than showing a stale figure
// when that data is missing; the session countdown keeps honouring the session-timer switch.
func TestTrayTitleChoices(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.Local)
	expiry := now.Add(90 * time.Minute)
	cost := 2.5
	quota := &freebuff.Quota{
		Status:         "active",
		Meters:         []freebuff.Meter{{Label: "Daily Hours", Used: 44, Limit: 53, Unit: "hours"}},
		ActiveSessions: []time.Time{expiry},
	}
	snap := &tracker.Snapshot{
		Quota: quota,
		Periods: []usage.Period{{
			Label: "Today", Tokens: 1_500_000, CostUSD: &cost, HasData: true,
		}},
	}

	cases := []struct {
		name      string
		choice    string
		timers    bool
		wantTitle string
	}{
		{"nothing", config.TrayNone, true, ""},
		{"tokens", config.TrayTokens, true, "1.5M"},
		{"cost", config.TrayCost, true, "~$2.50"},
		{"hours", config.TrayHours, true, "9 h"},
		{"session", config.TraySession, true, "1:30"},
		{"session off", config.TraySession, false, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			title, _ := TrayTitle(snap, tc.choice, tc.timers, now)
			if title != tc.wantTitle {
				t.Fatalf("title = %q, want %q", title, tc.wantTitle)
			}
		})
	}

	empty := &tracker.Snapshot{}
	if title, line := TrayTitle(empty, config.TrayTokens, true, now); title != "" || line != "" {
		t.Fatalf("a snapshot without usage produced %q / %q", title, line)
	}
	if title, _ := TrayTitle(nil, config.TrayTokens, true, now); title != "" {
		t.Fatalf("a nil snapshot produced %q", title)
	}
}
