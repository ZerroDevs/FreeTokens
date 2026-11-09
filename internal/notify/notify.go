// Package notify posts a desktop notification when the daily hours budget runs low. It fires at
// most once per reset window, so a background refresh every few minutes can't turn into a stream of
// toasts.
package notify

import (
	"fmt"
	"sync"
	"time"

	"github.com/gen2brain/beeep"

	"github.com/tverma101/FreeTokens/internal/freebuff"
	"github.com/tverma101/FreeTokens/internal/view"
)

// NearlySpent is the daily-hours remainder that counts as running out. It matches the threshold
// the tray icon uses for its alert dot, so the two never disagree.
const NearlySpent = 1.0

// Notifier remembers which reset window it last announced. The zero value is not usable; call New.
type Notifier struct {
	mu   sync.Mutex
	sent string
	post func(title, body string) error
}

// New returns a Notifier that posts real desktop notifications.
func New() *Notifier {
	return &Notifier{post: func(title, body string) error {
		return beeep.Notify(title, body, "")
	}}
}

// Check posts one notification when the daily hours meter is nearly spent, and reports whether it
// posted. Errors from the desktop are ignored: a missing notification daemon shouldn't fail a
// refresh or surface as a quota error.
func (n *Notifier) Check(q *freebuff.Quota, now time.Time) bool {
	if q == nil {
		return false
	}
	m := q.Meter("Daily Hours")
	if m == nil || m.Limit <= 0 {
		return false
	}
	left := m.Limit - m.Used
	if left >= NearlySpent {
		return false
	}

	key := now.Format("2006-01-02")
	if m.ResetsAt != nil {
		key = m.ResetsAt.UTC().Format(time.RFC3339)
	}

	n.mu.Lock()
	if n.sent == key {
		n.mu.Unlock()
		return false
	}
	n.sent = key
	post := n.post
	n.mu.Unlock()

	body := "Daily hours are used up."
	if left > 0 {
		body = fmt.Sprintf("%s of daily hours left.", view.Hours(left))
	}
	if m.ResetsAt != nil && m.ResetsAt.After(now) {
		body += " Resets in " + view.Duration(m.ResetsAt.Sub(now)) + "."
	}
	_ = post("FreeTokens", body)
	return true
}
