package update

import (
	"os"
	"os/exec"

	"github.com/creativeprojects/go-selfupdate"

	"github.com/tverma101/FreeTokens/internal/appimage"
)

// Restart launches the (updated) program detached; the caller exits. An AppImage is restarted from
// the file the launcher started, because the executable this process runs from lives in a mount
// that is about to disappear.
func Restart() error {
	var cmd *exec.Cmd
	if path := appimage.Path(); path != "" {
		cmd = exec.Command(path)
	} else {
		exe, err := selfupdate.ExecutablePath()
		if err != nil {
			return err
		}
		cmd = exec.Command(exe, os.Args[1:]...)
	}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	detach(cmd)
	return cmd.Start()
}
