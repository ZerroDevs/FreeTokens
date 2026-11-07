package update

import (
	"os/exec"
	"syscall"
)

func detach(cmd *exec.Cmd) {
	const detachedProcess, newGroup = 0x00000008, 0x00000200
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: detachedProcess | newGroup}
}
