package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
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

// `config get` prints JSON that the macOS app parses, so the file path needs its own command.
// Printing the path must not create the file, or a read-only question writes to disk.
func TestConfigPathReportsStoreFile(t *testing.T) {
	t.Setenv("FREETOKENS_CONFIG_DIR", t.TempDir())
	store, err := config.DefaultStore()
	if err != nil {
		t.Fatal(err)
	}

	out := captureStdout(t, func() error { return runConfig([]string{"path"}) })
	if !strings.Contains(out, store.Path) {
		t.Fatalf("config path printed %q, want it to name %s", out, store.Path)
	}
	if !filepath.IsAbs(store.Path) {
		t.Fatalf("config path is %q, want an absolute path", store.Path)
	}
	if _, err := os.Stat(store.Path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("config path left %s behind (stat err = %v)", store.Path, err)
	}
}

// captureStdout runs fn and returns everything it wrote to os.Stdout.
func captureStdout(t *testing.T, fn func() error) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	original := os.Stdout
	os.Stdout = w
	runErr := fn()
	os.Stdout = original
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	out, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	if runErr != nil {
		t.Fatalf("command failed: %v", runErr)
	}
	return string(out)
}
