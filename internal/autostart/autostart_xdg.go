//go:build !darwin && !windows

package autostart

import (
	"os"
	"path/filepath"
	"strings"
)

func desktopPath() string {
	base := os.Getenv("XDG_CONFIG_HOME")
	if base == "" || !filepath.IsAbs(base) {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "autostart", "freetokens.desktop")
}

// Enabled reports whether the autostart entry exists.
func Enabled() bool {
	_, err := os.Stat(desktopPath())
	return err == nil
}

// quote follows the Desktop Entry spec's Exec quoting rules.
func quote(arg string) string {
	if arg != "" && !strings.ContainsAny(arg, " \t\n\"'\\><~|&;$*?#()`%") {
		return arg
	}
	r := strings.NewReplacer(`\`, `\\\\`, `"`, `\\"`, "`", "\\\\`", `$`, `\\$`, `%`, `%%`)
	return `"` + r.Replace(arg) + `"`
}

// Enable writes the XDG autostart entry.
func Enable(e Entry) error {
	parts := make([]string, len(e.Exec))
	for i, a := range e.Exec {
		parts[i] = quote(a)
	}
	entry := "[Desktop Entry]\nType=Application\nName=FreeTokens\nComment=Freebuff usage tracker\n" +
		"Exec=" + strings.Join(parts, " ") + "\nX-GNOME-Autostart-enabled=true\nTerminal=false\n"
	if err := os.MkdirAll(filepath.Dir(desktopPath()), 0o755); err != nil {
		return err
	}
	return os.WriteFile(desktopPath(), []byte(entry), 0o644)
}

// Disable removes the entry.
func Disable() error {
	err := os.Remove(desktopPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
