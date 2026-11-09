//go:build darwin || windows

package autostart

import "errors"

// errNoLauncher explains why this platform has nothing to install. Windows shortcuts come from the
// installer, and FreeTokens.app is itself the launcher in /Applications or wherever it was copied.
var errNoLauncher = errors.New("this platform has no app-menu entry to install: the Windows installer adds Start Menu shortcuts, and the macOS app is launched from Finder")

// LauncherPath is empty here: nothing is written.
func LauncherPath() (string, error) { return "", errNoLauncher }

// LauncherInstalled is always false here.
func LauncherInstalled() bool { return false }

// InstallLauncher reports that the platform needs no entry.
func InstallLauncher(string) error { return errNoLauncher }

// RemoveLauncher reports that there is nothing to remove.
func RemoveLauncher() error { return errNoLauncher }
