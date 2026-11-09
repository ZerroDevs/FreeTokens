package main

import "github.com/tverma101/FreeTokens/internal/tracker"

// nearlySpentHours is the daily-hours remainder that counts as running out.
const nearlySpentHours = 1.0

// trayNeedsAttention reports whether the tray icon should carry its alert dot: a login FreeTokens
// can't read, a failed quota fetch, or less than an hour of the daily budget left. It stays false
// before the first refresh so a slow start doesn't look like a problem.
func trayNeedsAttention(snap *tracker.Snapshot) bool {
	if snap == nil {
		return false
	}
	if snap.QuotaError != "" {
		return true
	}
	q := snap.Quota
	if q == nil {
		return true
	}
	if m := q.Meter("Daily Hours"); m != nil && m.Limit > 0 {
		return m.Limit-m.Used < nearlySpentHours
	}
	return false
}
