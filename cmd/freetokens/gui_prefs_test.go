//go:build gui && (windows || (linux && cgo))

package main

import (
	"testing"

	"github.com/tverma101/FreeTokens/internal/config"
)

// The popover and the tray menu both write this setting; it has to survive a reload so the strip
// comes back after a restart.
func TestSetShowHistoryPersists(t *testing.T) {
	t.Setenv("FREETOKENS_CONFIG_DIR", t.TempDir())
	store, err := config.DefaultStore()
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	a := &App{cfg: store}

	if a.GetPreferences().ShowHistory {
		t.Fatal("history should start hidden")
	}
	if err := a.SetShowHistory(true); err != nil {
		t.Fatalf("set: %v", err)
	}
	if !a.GetPreferences().ShowHistory {
		t.Fatal("preference did not read back")
	}

	reloaded, err := config.DefaultStore()
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	if !reloaded.Load().ShowHistory {
		t.Fatal("preference did not reach the config file")
	}
}
