// Package autostart registers FreeTokens to start at login without cgo: a LaunchAgent on macOS,
// an XDG autostart entry on Linux/BSD, and an HKCU Run value on Windows.
package autostart

// ID is the login item identifier.
const ID = "io.github.tverma101.freetokens"

// Entry is a login item.
type Entry struct {
	// Exec is the absolute executable followed by its arguments.
	Exec []string
}
