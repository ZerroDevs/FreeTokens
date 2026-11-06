// Package browser opens https URLs in the default browser.
package browser

import (
	"errors"
	"net/url"
	"os/exec"
	"runtime"
)

// Open launches the default browser. Only https URLs are accepted.
func Open(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return errors.New("refusing to open a non-https URL")
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", u.String())
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", u.String())
	default:
		cmd = exec.Command("xdg-open", u.String())
	}
	return cmd.Start()
}
