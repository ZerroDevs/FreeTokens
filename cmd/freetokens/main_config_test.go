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

// The new keys are settable from the CLI, which is the only way to change them on a headless or
// classic-tray install, and an unusable value is rejected instead of saved.
func TestConfigSetBudgetTrayTitleAndProjects(t *testing.T) {
	t.Setenv("FREETOKENS_CONFIG_DIR", t.TempDir())
	store, err := config.DefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"set", "budget-usd", "250.5"},
		{"set", "tray-title", config.TrayCost},
		{"set", "show-projects", "true"},
		{"set", "show-history", "true"},
	} {
		if err := runConfig(args); err != nil {
			t.Fatalf("config %v: %v", args, err)
		}
	}
	cfg := store.Load()
	if cfg.BudgetUSD != 250.5 || cfg.TrayTitle != config.TrayCost || !cfg.ShowProjects || !cfg.ShowHistory {
		t.Fatalf("saved = %+v", cfg)
	}
	if err := runConfig([]string{"set", "tray-title", "hourly"}); err == nil {
		t.Fatal("an unknown menu bar figure was accepted")
	}
	if err := runConfig([]string{"set", "budget-usd", "-5"}); err == nil {
		t.Fatal("a negative budget was accepted")
	}
	if got := store.Load().BudgetUSD; got != 250.5 {
		t.Fatalf("a rejected value changed the budget to %v", got)
	}
}

// A custom theme is four colours the macOS settings write one at a time, so each write has to keep
// the others and select the custom theme; a value that is not a colour is rejected, not saved.
func TestConfigSetThemeColorsSelectsCustom(t *testing.T) {
	t.Setenv("FREETOKENS_CONFIG_DIR", t.TempDir())
	store, err := config.DefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"set", "accent-color", "#ff2d55"},
		{"set", "background-color", "#101014"},
		{"set", "card-color", "#232326"},
		{"set", "text-color", "#f5f5f7"},
	} {
		if err := runConfig(args); err != nil {
			t.Fatalf("config %v: %v", args, err)
		}
	}
	cfg := store.Load()
	want := config.ThemeColors{Accent: "#ff2d55", Background: "#101014", Card: "#232326", Text: "#f5f5f7"}
	if cfg.Theme != config.ThemeCustom || cfg.CustomTheme != want {
		t.Fatalf("saved theme = %q, colours = %+v", cfg.Theme, cfg.CustomTheme)
	}
	if err := runConfig([]string{"set", "accent-color", "tomato"}); err == nil {
		t.Fatal("a colour name was accepted")
	}
	if got := store.Load().CustomTheme.Accent; got != "#ff2d55" {
		t.Fatalf("a rejected value changed the accent to %q", got)
	}
}

// The macOS app decodes `config get` with a non-optional budget, so every key it reads has to be
// present even when it is zero; an omitted key fails the whole settings load.
func TestConfigGetAlwaysWritesEveryKey(t *testing.T) {
	t.Setenv("FREETOKENS_CONFIG_DIR", t.TempDir())
	out := captureStdout(t, func() error { return runConfig([]string{"get"}) })
	for _, key := range []string{
		`"budgetUsd"`, `"trayTitle"`, `"showHistory"`, `"showProjects"`,
		`"refreshMinutes"`, `"showTimers"`, `"theme"`, `"autoUpdate"`,
	} {
		if !strings.Contains(out, key) {
			t.Fatalf("config get = %s, want %s", out, key)
		}
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
