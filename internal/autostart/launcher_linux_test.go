//go:build !darwin && !windows

package autostart

import (
	"os"
	"strings"
	"testing"
)

func TestInstallLauncherUsesXDGDataHome(t *testing.T) {
	base := t.TempDir()
	t.Setenv("XDG_DATA_HOME", base)
	t.Setenv("APPIMAGE", "")

	path, err := LauncherPath()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(path, base) {
		t.Fatalf("entry path = %q, want it under XDG_DATA_HOME", path)
	}
	if LauncherInstalled() {
		t.Fatal("entry reported as installed in an empty data directory")
	}
	if err := InstallLauncher("1.2.3"); err != nil {
		t.Fatalf("install: %v", err)
	}
	if !LauncherInstalled() {
		t.Fatal("install did not write the entry")
	}
	if err := RemoveLauncher(); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if LauncherInstalled() {
		t.Fatal("remove left the entry behind")
	}
}

// Like the login item, a menu entry pointing into Go's build cache would break on the next build.
func TestInstallLauncherRefusesDevelopmentBuild(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := InstallLauncher("dev"); err == nil {
		t.Fatal("a development build was installed into the app menu")
	}
	if _, err := os.Stat(mustLauncherPath(t)); !os.IsNotExist(err) {
		t.Fatalf("a refused development build still wrote the entry: %v", err)
	}
}

func mustLauncherPath(t *testing.T) string {
	t.Helper()
	path, err := LauncherPath()
	if err != nil {
		t.Fatal(err)
	}
	return path
}
