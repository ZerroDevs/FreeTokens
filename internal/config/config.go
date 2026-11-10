// Package config stores FreeTokens' own preferences. It never stores Freebuff credentials.
package config

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// AppName names the config and cache directories.
const AppName = "FreeTokens"

// Update policies. The default is off: FreeTokens never contacts GitHub unless the user opts in.
const (
	UpdateOff    = "off"
	UpdateNotify = "notify"
	UpdateAuto   = "auto"
)

// Panel themes. The popover ships dark; light and following the OS are opt-in from its settings.
const (
	ThemeDark   = "dark"
	ThemeLight  = "light"
	ThemeSystem = "system"
)

// Menu bar and tray title choices. "session" keeps the countdown the tray has always shown.
const (
	TraySession = "session"
	TrayHours   = "hours"
	TrayTokens  = "tokens"
	TrayCost    = "cost"
	TrayNone    = "none"
)

// Config is persisted as JSON in the user config directory.
type Config struct {
	// AutoUpdate is "off" (default), "notify" (check daily, never install) or "auto" (check daily
	// and install verified releases).
	AutoUpdate string `json:"autoUpdate"`
	// RefreshMinutes is the background refresh interval (minimum 1, default 5).
	RefreshMinutes int `json:"refreshMinutes"`
	// ShowTimers puts the earliest active session countdown in the tray title (where supported).
	ShowTimers bool `json:"showTimers"`
	// ShowHistory adds the 14-day strip and the previous-period comparison to the popover above the
	// model mix. Off by default: the popover leads with the selected period.
	ShowHistory bool `json:"showHistory"`
	// BudgetUSD is the monthly spending ceiling the popover measures the last 30 days against.
	// Zero disables the budget line. It is always written: the macOS app decodes `config get`
	// directly, and a missing key would fail its whole settings load.
	BudgetUSD float64 `json:"budgetUsd"`
	// TrayTitle is what the menu bar (macOS) or tray tooltip shows: session, hours, tokens, cost
	// or none.
	TrayTitle string `json:"trayTitle"`
	// ShowProjects reveals the project grouping in the model mix. Off by default because only some
	// local listeners record which project a run belonged to.
	ShowProjects bool `json:"showProjects"`
	// Theme is "dark" (default), "light" or "system" (follow the OS appearance).
	Theme string `json:"theme"`
	// LastUpdateCheck records the last automatic check.
	LastUpdateCheck time.Time `json:"lastUpdateCheck,omitempty"`
	// SkippedVersion suppresses notifications for one release.
	SkippedVersion string `json:"skippedVersion,omitempty"`
}

// Defaults returns the initial configuration.
func Defaults() Config {
	return Config{AutoUpdate: UpdateOff, RefreshMinutes: 5, ShowTimers: true, Theme: ThemeDark, TrayTitle: TraySession}
}

// Normalize clamps invalid values back to defaults.
func (c *Config) Normalize() {
	switch c.AutoUpdate {
	case UpdateOff, UpdateNotify, UpdateAuto:
	default:
		c.AutoUpdate = UpdateOff
	}
	if c.RefreshMinutes < 1 {
		c.RefreshMinutes = 5
	}
	if c.RefreshMinutes > 24*60 {
		c.RefreshMinutes = 24 * 60
	}
	switch c.Theme {
	case ThemeDark, ThemeLight, ThemeSystem:
	default:
		c.Theme = ThemeDark
	}
	switch c.TrayTitle {
	case TraySession, TrayHours, TrayTokens, TrayCost, TrayNone:
	default:
		c.TrayTitle = TraySession
	}
	if math.IsNaN(c.BudgetUSD) || math.IsInf(c.BudgetUSD, 0) || c.BudgetUSD < 0 {
		c.BudgetUSD = 0
	}
}

// Dir is the FreeTokens config directory (FREETOKENS_CONFIG_DIR overrides it).
func Dir() (string, error) {
	if d := os.Getenv("FREETOKENS_CONFIG_DIR"); d != "" {
		return d, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, AppName), nil
}

// CacheDir is the FreeTokens cache directory (FREETOKENS_CACHE_DIR overrides it).
func CacheDir() (string, error) {
	if d := os.Getenv("FREETOKENS_CACHE_DIR"); d != "" {
		return d, nil
	}
	base, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, AppName), nil
}

// Store loads and saves the config file.
type Store struct {
	Path string
	mu   sync.Mutex
}

// DefaultStore uses Dir()/config.json.
func DefaultStore() (*Store, error) {
	d, err := Dir()
	if err != nil {
		return nil, err
	}
	return &Store{Path: filepath.Join(d, "config.json")}, nil
}

// Load returns the saved config, or defaults when absent or unreadable.
func (s *Store) Load() Config {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *Store) loadLocked() Config {
	c := Defaults()
	if data, err := os.ReadFile(s.Path); err == nil {
		_ = json.Unmarshal(data, &c)
	}
	c.Normalize()
	return c
}

// Save replaces the config using a private staging file in the same directory.
// Rename preserves the previous config when replacement fails; on non-Unix systems
// the OS itself does not promise fully atomic renames.
func (s *Store) Save(c Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(c)
}

func (s *Store) saveLocked(c Config) error {
	c.Normalize()
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o700); err != nil {
		return err
	}
	return replaceConfig(s.Path, append(data, '\n'), os.Rename)
}

// replaceConfig writes a unique private staging file, syncs it, then replaces the
// destination. A failed rename never deletes the previous config. rename is injectable
// so failure/rollback tests don't depend on platform-specific filesystem errors.
func replaceConfig(path string, data []byte, rename func(string, string) error) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".freetokens-config-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(name)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := rename(name, path); err != nil {
		return err
	}
	committed = true
	return nil
}

// Update serializes the read-modify-write transaction within this Store. Independent
// processes or separate Store objects still require an OS-level coordination mechanism.
func (s *Store) Update(f func(*Config)) (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.loadLocked()
	f(&c)
	c.Normalize()
	return c, s.saveLocked(c)
}
