// Package config stores FreeTokens' own preferences. It never stores Freebuff credentials.
package config

import (
	"encoding/json"
	"errors"
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

// Config is persisted as JSON in the user config directory.
type Config struct {
	// AutoUpdate is "off" (default), "notify" (check daily, never install) or "auto" (check daily
	// and install verified releases).
	AutoUpdate string `json:"autoUpdate"`
	// RefreshMinutes is the background refresh interval (minimum 1, default 5).
	RefreshMinutes int `json:"refreshMinutes"`
	// ShowTimers puts the earliest active session countdown in the tray title (where supported).
	ShowTimers bool `json:"showTimers"`
	// LastUpdateCheck records the last automatic check.
	LastUpdateCheck time.Time `json:"lastUpdateCheck,omitempty"`
	// SkippedVersion suppresses notifications for one release.
	SkippedVersion string `json:"skippedVersion,omitempty"`
}

// Defaults returns the initial configuration.
func Defaults() Config {
	return Config{AutoUpdate: UpdateOff, RefreshMinutes: 5, ShowTimers: true}
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
	c := Defaults()
	if data, err := os.ReadFile(s.Path); err == nil {
		_ = json.Unmarshal(data, &c)
	}
	c.Normalize()
	return c
}

// Save writes the config atomically.
func (s *Store) Save(c Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c.Normalize()
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o700); err != nil {
		return err
	}
	tmp := s.Path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.Path); err != nil {
		if errors.Is(err, os.ErrExist) || os.Remove(s.Path) == nil {
			return os.Rename(tmp, s.Path)
		}
		return err
	}
	return nil
}

// Update loads, mutates and saves.
func (s *Store) Update(f func(*Config)) (Config, error) {
	c := s.Load()
	f(&c)
	return c, s.Save(c)
}
