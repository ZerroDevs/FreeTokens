package main

import (
	"syscall"
	"unsafe"
)

// detachOwnConsole hides the console window when FreeTokens was started by double-click or at
// login (it then owns its console alone). Started from a terminal, the console is shared and kept.
func detachOwnConsole() {
	k := syscall.NewLazyDLL("kernel32.dll")
	list := k.NewProc("GetConsoleProcessList")
	if list.Find() != nil {
		return
	}
	var pids [2]uint32
	n, _, _ := list.Call(uintptr(unsafe.Pointer(&pids[0])), 2)
	if n == 1 {
		_, _, _ = k.NewProc("FreeConsole").Call()
	}
}
