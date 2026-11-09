//go:build !darwin && !windows

package autostart

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/tverma101/FreeTokens/internal/update"
)

func dataHome() (string, error) {
	if d := os.Getenv("XDG_DATA_HOME"); d != "" && filepath.IsAbs(d) {
		return d, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "share"), nil
}

// LauncherPath is where the app-menu entry is written.
func LauncherPath() (string, error) {
	base, err := dataHome()
	if err != nil {
		return "", err
	}
	entry, _ := launcherFiles(base)
	return entry, nil
}

// LauncherInstalled reports whether the entry file exists.
func LauncherInstalled() bool {
	p, err := LauncherPath()
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

// InstallLauncher writes the entry and a generated icon next to it. A development build is refused
// for the same reason the login item is: the menu would point into Go's build cache.
func InstallLauncher(version string) error {
	if !update.IsRelease(version) {
		return errors.New("The app-menu entry needs an installed build. This development build runs from a temporary path, which the menu would point at")
	}
	entry, err := TrayEntry()
	if err != nil {
		return err
	}
	base, err := dataHome()
	if err != nil {
		return err
	}
	return writeLauncher(base, entry.Exec)
}

// RemoveLauncher deletes the entry and its icon.
func RemoveLauncher() error {
	base, err := dataHome()
	if err != nil {
		return err
	}
	return removeLauncher(base)
}
