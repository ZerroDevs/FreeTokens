package autostart

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/tverma101/FreeTokens/internal/icon"
)

// launcherName is the desktop entry an app menu or launcher reads.
const launcherName = "freetokens.desktop"

// desktopQuote follows the Desktop Entry spec's Exec quoting rules.
func desktopQuote(arg string) string {
	if arg != "" && !strings.ContainsAny(arg, " \t\n\"'\\><~|&;$*?#()`%") {
		return arg
	}
	r := strings.NewReplacer(`\`, `\\\\`, `"`, `\\"`, "`", "\\\\`", `$`, `\\$`, `%`, `%%`)
	return `"` + r.Replace(arg) + `"`
}

// launcherText is the app-menu entry. The autostart entry is only read by login managers; this one
// is what people see in their menu, so it names the app and carries an icon.
func launcherText(exec []string, iconPath string) string {
	parts := make([]string, len(exec))
	for i, a := range exec {
		parts[i] = desktopQuote(a)
	}
	var b strings.Builder
	b.WriteString("[Desktop Entry]\nType=Application\nName=FreeTokens\n")
	b.WriteString("Comment=Freebuff usage tracker\n")
	b.WriteString("Exec=" + strings.Join(parts, " ") + "\n")
	if iconPath != "" {
		b.WriteString("Icon=" + iconPath + "\n")
	}
	b.WriteString("Terminal=false\nCategories=Utility;\n")
	return b.String()
}

// launcherFiles returns the entry and icon paths inside an XDG data directory.
func launcherFiles(dataDir string) (entry, icon string) {
	return filepath.Join(dataDir, "applications", launcherName), filepath.Join(dataDir, "icons", "freetokens.png")
}

// writeLauncher writes the entry and its icon. The icon is generated at runtime, so the archive
// needs no image file and a missing icon theme can't leave a generic square behind.
func writeLauncher(dataDir string, exec []string) error {
	entryPath, iconPath := launcherFiles(dataDir)
	for _, dir := range []string{filepath.Dir(entryPath), filepath.Dir(iconPath)} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	if err := os.WriteFile(iconPath, icon.PNG(128), 0o644); err != nil {
		return err
	}
	return os.WriteFile(entryPath, []byte(launcherText(exec, iconPath)), 0o644)
}

// removeLauncher deletes both files, tolerating ones that are already gone.
func removeLauncher(dataDir string) error {
	entryPath, iconPath := launcherFiles(dataDir)
	for _, p := range []string{entryPath, iconPath} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
