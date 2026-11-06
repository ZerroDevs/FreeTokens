package autostart

import (
	"bytes"
	"encoding/xml"
	"os"
	"path/filepath"
)

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", ID+".plist")
}

// Enabled reports whether the login item exists.
func Enabled() bool {
	_, err := os.Stat(plistPath())
	return err == nil
}

func esc(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// Enable writes the LaunchAgent.
func Enable(e Entry) error {
	var args bytes.Buffer
	for _, a := range e.Exec {
		args.WriteString("    <string>" + esc(a) + "</string>\n")
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>` + ID + `</string>
  <key>ProgramArguments</key>
  <array>
` + args.String() + `  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`
	if err := os.MkdirAll(filepath.Dir(plistPath()), 0o755); err != nil {
		return err
	}
	return os.WriteFile(plistPath(), []byte(plist), 0o644)
}

// Disable removes the LaunchAgent.
func Disable() error {
	err := os.Remove(plistPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
