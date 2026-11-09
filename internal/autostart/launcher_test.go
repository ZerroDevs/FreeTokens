package autostart

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLauncherText(t *testing.T) {
	_, iconPath := launcherFiles("/data")
	text := launcherText([]string{"/opt/Free Tokens/freetokens", "gui"}, iconPath)

	for _, want := range []string{
		"[Desktop Entry]\n",
		"Type=Application\n",
		"Name=FreeTokens\n",
		"Exec=\"/opt/Free Tokens/freetokens\" gui\n",
		"Icon=" + iconPath + "\n",
		"Terminal=false\n",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("entry missing %q:\n%s", want, text)
		}
	}
	// A menu entry is not a login item: those are separate files with separate keys.
	if strings.Contains(text, "X-GNOME-Autostart-enabled") {
		t.Fatalf("menu entry carries an autostart key:\n%s", text)
	}
}

func TestWriteAndRemoveLauncher(t *testing.T) {
	base := t.TempDir()
	entryPath, iconPath := launcherFiles(base)
	if !strings.Contains(entryPath, filepath.Join("applications", launcherName)) {
		t.Fatalf("entry path = %q, want it under applications/", entryPath)
	}

	if err := writeLauncher(base, []string{"/usr/bin/freetokens", "gui"}); err != nil {
		t.Fatalf("write: %v", err)
	}
	text, err := os.ReadFile(entryPath)
	if err != nil {
		t.Fatalf("reading entry: %v", err)
	}
	if !strings.Contains(string(text), "Exec=/usr/bin/freetokens gui\n") {
		t.Fatalf("entry has the wrong command:\n%s", text)
	}
	if st, err := os.Stat(iconPath); err != nil || st.Size() == 0 {
		t.Fatalf("icon not written: %v", err)
	}

	if err := removeLauncher(base); err != nil {
		t.Fatalf("remove: %v", err)
	}
	for _, p := range []string{entryPath, iconPath} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Fatalf("%s left behind: %v", p, err)
		}
	}
	// Removing twice is not an error: the files are already gone.
	if err := removeLauncher(base); err != nil {
		t.Fatalf("second remove: %v", err)
	}
}
