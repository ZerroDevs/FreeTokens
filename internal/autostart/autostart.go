// Package autostart registers FreeTokens to start at login without cgo: a LaunchAgent on macOS,
// an XDG autostart entry on Linux/BSD, and an HKCU Run value on Windows.
package autostart

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/tverma101/FreeTokens/internal/appimage"
	"github.com/tverma101/FreeTokens/internal/bundle"
)

// ID is the login item identifier.
const ID = "io.github.tverma101.freetokens"

// Entry is a login item.
type Entry struct {
	// Exec is the absolute executable followed by its arguments.
	Exec []string
}

// WindowlessName is the GUI-subsystem build shipped beside freetokens.exe on Windows. It starts the
// tray without a console window, so login items and shortcuts should point at it.
const WindowlessName = "freetokensw.exe"

// ErrDevBuild refuses a login item for a binary that runs from Go's build cache: the registered
// path disappears at the next clean build, so the toggle would look silently broken.
var ErrDevBuild = errors.New("Start at login needs an installed build. This copy runs from Go's build cache, so a login item would stop working after the next build")

// EnableFor registers e unless its executable sits in Go's build cache, where `go run` and a bare
// `go build` leave it. Every entry point (popover, tray menu, CLI) goes through here so they agree.
func EnableFor(e Entry) error {
	if len(e.Exec) == 0 {
		return errors.New("no executable to register")
	}
	if inBuildCache(e.Exec[0]) {
		return ErrDevBuild
	}
	return Enable(e)
}

// inBuildCache reports whether path names a binary Go left in its build cache:
// $TMPDIR/go-buildNNN/b001/exe/ on Unix, %LOCALAPPDATA%\Temp\go-buildNNN\ on Windows.
func inBuildCache(path string) bool {
	for _, part := range strings.Split(filepath.ToSlash(path), "/") {
		if strings.HasPrefix(part, "go-build") {
			return true
		}
	}
	return false
}

// TrayEntry is the login item for this installation: the running executable with "gui" (which
// falls back to the classic tray on builds without the popover); on Windows, the windowless
// sibling when it is present; inside FreeTokens.app, the app itself.
func TrayEntry() (Entry, error) {
	// An AppImage mounts itself under /tmp and unmounts on exit, so a login item naming the
	// executable inside the mount would break at the next login. Name the AppImage file instead.
	if p := appimage.Path(); p != "" {
		return Entry{Exec: []string{p, "gui"}}, nil
	}
	exe, err := os.Executable()
	if err != nil {
		return Entry{}, err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	if app := bundle.AppFor(exe); app != "" {
		// LaunchServices keeps it to one instance and runs the SwiftUI menu bar app, not the engine.
		return Entry{Exec: []string{"/usr/bin/open", "-a", app}}, nil
	}
	if runtime.GOOS == "windows" {
		if w := filepath.Join(filepath.Dir(exe), WindowlessName); fileExists(w) {
			exe = w
		}
	}
	return Entry{Exec: []string{exe, "gui"}}, nil
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.Mode().IsRegular()
}
