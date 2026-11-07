//go:build !gui || !(windows || (darwin && cgo) || (linux && cgo))

package main

import (
	"github.com/tverma101/FreeTokens/internal/config"
	"github.com/tverma101/FreeTokens/internal/tracker"
)

// runGUIUI falls back to the classic tray menu on builds without Wails support
// (for example the portable CGO-free Linux and BSD binaries).
func runGUIUI(t *tracker.Tracker, cfg *config.Store) { runTrayUI(t, cfg) }
