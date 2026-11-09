package main

import (
	"testing"

	"github.com/tverma101/FreeTokens/internal/freebuff"
	"github.com/tverma101/FreeTokens/internal/tracker"
)

func hoursQuota(limit, used float64) *freebuff.Quota {
	return &freebuff.Quota{Meters: []freebuff.Meter{{Label: "Daily Hours", Used: used, Limit: limit, Unit: "hours"}}}
}

func TestTrayNeedsAttention(t *testing.T) {
	cases := []struct {
		name string
		snap *tracker.Snapshot
		want bool
	}{
		{"no snapshot yet", nil, false},
		{"quota error", &tracker.Snapshot{QuotaError: "Your Freebuff login has expired. Sign in again with the Freebuff CLI"}, true},
		{"nothing to read", &tracker.Snapshot{}, true},
		{"hours left", &tracker.Snapshot{Quota: hoursQuota(24, 6)}, false},
		{"nearly spent", &tracker.Snapshot{Quota: hoursQuota(24, 23.5)}, true},
		{"legacy session meters", &tracker.Snapshot{Quota: &freebuff.Quota{Meters: []freebuff.Meter{
			{Label: "Daily", Used: 4, Limit: 5, Unit: "sessions"},
		}}}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := trayNeedsAttention(tc.snap); got != tc.want {
				t.Fatalf("trayNeedsAttention() = %v, want %v", got, tc.want)
			}
		})
	}
}
