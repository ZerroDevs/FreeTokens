package main

import (
	"testing"
	"time"

	"github.com/tverma101/FreeTokens/internal/config"
)

// `config reset` is the escape hatch for a stuck skip or a hand-edited file, so it has to put back
// the keys that no UI exposes (skipped-version, last update check) as well as the visible ones.
func TestConfigResetRestoresDefaults(t *testing.T) {
	t.Setenv("FREETOKENS_CONFIG_DIR", t.TempDir())
	store, err := config.DefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Update(func(c *config.Config) {
		c.AutoUpdate = config.UpdateAuto
		c.RefreshMinutes = 60
		c.ShowTimers = false
		c.Theme = config.ThemeLight
		c.SkippedVersion = "0.2.0"
		c.LastUpdateCheck = time.Now()
	}); err != nil {
		t.Fatal(err)
	}

	if err := runConfig([]string{"reset"}); err != nil {
		t.Fatalf("config reset: %v", err)
	}
	if got, want := store.Load(), config.Defaults(); got != want {
		t.Fatalf("after reset = %+v, want %+v", got, want)
	}
}
