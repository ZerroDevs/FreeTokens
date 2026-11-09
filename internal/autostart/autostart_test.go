package autostart

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// A login item must outlive the process, and an AppImage mount does not, so the entry names the
// AppImage file instead of the executable inside it.
func TestTrayEntryNamesTheAppImage(t *testing.T) {
	dir := t.TempDir()
	img := filepath.Join(dir, "FreeTokens.AppImage")
	if err := os.WriteFile(img, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("APPIMAGE", img)

	entry, err := TrayEntry()
	if err != nil {
		t.Fatal(err)
	}
	if len(entry.Exec) != 2 || entry.Exec[0] != img || entry.Exec[1] != "gui" {
		t.Fatalf("got %v, want [%s gui]", entry.Exec, img)
	}
}

// A normal install resolves its own executable and still asks for the desktop front end.
func TestTrayEntryNormalInstall(t *testing.T) {
	t.Setenv("APPIMAGE", "")

	entry, err := TrayEntry()
	if err != nil {
		t.Fatal(err)
	}
	if len(entry.Exec) != 2 || !filepath.IsAbs(entry.Exec[0]) || entry.Exec[1] != "gui" {
		t.Fatalf("got %v, want an absolute executable and the gui argument", entry.Exec)
	}
}

// A development build runs from Go's build cache, so a login item naming it stops working after
// the next clean build. EnableFor has to refuse before touching the OS, or the toggle looks broken.
func TestEnableForRefusesDevelopmentBuild(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	if err := EnableFor("dev", Entry{Exec: []string{"/bin/true"}}); !errors.Is(err, ErrDevBuild) {
		t.Fatalf("EnableFor(dev) = %v, want ErrDevBuild", err)
	}
	if Enabled() {
		t.Fatal("a refused development build still wrote a login item")
	}
}
