//go:build darwin && !cgo

package secrets

import (
	"os/exec"
	"strings"
)

type platformStore struct{}

// Without cgo the only reader is /usr/bin/security, which may show a dialog, so it runs only for
// interactive reads.
func (platformStore) Get(service, account string, interactive bool) (string, error) {
	if !interactive {
		return "", ErrInteractionRequired
	}
	out, err := exec.Command("/usr/bin/security", "find-generic-password", "-s", service, "-a", account, "-w").Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 44 {
			return "", ErrNotFound
		}
		return "", ErrInteractionRequired
	}
	return strings.TrimRight(string(out), "\n"), nil
}
