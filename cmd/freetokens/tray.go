//go:build (darwin && cgo) || windows || linux || freebsd || openbsd || netbsd

package main

import (
	"github.com/tverma101/FreeTokens/internal/config"
	"github.com/tverma101/FreeTokens/internal/tracker"
	"github.com/tverma101/FreeTokens/internal/tray"
)

func runTrayUI(t *tracker.Tracker, cfg *config.Store) {
	tray.Run(tray.Options{Version: version, Tracker: t, Config: cfg})
}
