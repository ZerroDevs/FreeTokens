package update

import (
	"os"
	"os/exec"

	"github.com/creativeprojects/go-selfupdate"
)

// Restart launches the (updated) executable with the same arguments, detached; the caller exits.
func Restart() error {
	exe, err := selfupdate.ExecutablePath()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	detach(cmd)
	return cmd.Start()
}
