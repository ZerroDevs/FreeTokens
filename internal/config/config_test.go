package config

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// The panel theme is opt-in, so a missing or unrecognized value must load as dark rather than
// leaving the popover with no palette, and a chosen theme must survive a save/load round trip.
func TestThemeDefaultsToDarkAndRoundTrips(t *testing.T) {
	store := &Store{Path: filepath.Join(t.TempDir(), "config.json")}
	if got := store.Load().Theme; got != ThemeDark {
		t.Fatalf("default theme = %q, want %q", got, ThemeDark)
	}
	if err := os.WriteFile(store.Path, []byte(`{"theme":"solarized"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := store.Load().Theme; got != ThemeDark {
		t.Fatalf("unrecognized theme = %q, want %q", got, ThemeDark)
	}
	if _, err := store.Update(func(c *Config) { c.Theme = ThemeLight }); err != nil {
		t.Fatal(err)
	}
	if got := store.Load().Theme; got != ThemeLight {
		t.Fatalf("saved theme = %q, want %q", got, ThemeLight)
	}
}

// A sharing violation or permission error during replacement must never delete
// the user's last valid settings or leave a staging file behind.
func TestConfigReplaceFailurePreservesExistingSettings(t *testing.T) {
	dir := t.TempDir()
	store := &Store{Path: filepath.Join(dir, "config.json")}
	cfg := Defaults()
	cfg.AutoUpdate = UpdateNotify
	if err := store.Save(cfg); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(store.Path)
	if err != nil {
		t.Fatal(err)
	}
	wantErr := errors.New("simulated sharing violation")
	err = replaceConfig(store.Path, []byte("replacement"), func(from, to string) error {
		if from == to || filepath.Dir(from) != dir {
			t.Fatalf("staging path = %q, target = %q", from, to)
		}
		return wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("replaceConfig error = %v", err)
	}
	after, err := os.ReadFile(store.Path)
	if err != nil || !bytes.Equal(after, before) {
		t.Fatalf("original settings changed on failed rename: err=%v", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 || entries[0].Name() != "config.json" {
		t.Fatalf("staging files leaked: entries=%v err=%v", entries, err)
	}
}

// Multiple settings mutations through the same Store must never silently lose
// updates between Load and Save, including under the race detector.
func TestStoreUpdateSerializesMutations(t *testing.T) {
	store := &Store{Path: filepath.Join(t.TempDir(), "config.json")}
	const workers = 24
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := store.Update(func(c *Config) { c.RefreshMinutes++ })
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent Update: %v", err)
		}
	}
	if got, want := store.Load().RefreshMinutes, Defaults().RefreshMinutes+workers; got != want {
		t.Fatalf("lost concurrent updates: got refreshMinutes=%d, want %d", got, want)
	}
}
