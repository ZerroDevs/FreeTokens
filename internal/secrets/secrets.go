// Package secrets reads the item the Freebuff CLI stores through Bun.secrets in the OS credential
// store. Bun's layouts differ from common Go keyring libraries, so each platform reads Bun's exact
// format: macOS generic password (service, account), Windows generic credential "service/account",
// and a Secret Service item with attributes {service, account}.
package secrets

import "errors"

var (
	// ErrNotFound means the store has no such item.
	ErrNotFound = errors.New("secret not found")
	// ErrInteractionRequired means the item exists but reading it needs a user prompt or unlock.
	ErrInteractionRequired = errors.New("secret requires user interaction")
	// ErrUnavailable means this platform or session has no usable credential store.
	ErrUnavailable = errors.New("credential store unavailable")
)

// Store reads one generic secret. interactive=false must never show UI.
type Store interface {
	Get(service, account string, interactive bool) (string, error)
}

// Default returns the platform credential store.
func Default() Store { return platformStore{} }
