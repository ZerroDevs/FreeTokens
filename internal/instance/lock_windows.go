package instance

import (
	"os"

	"golang.org/x/sys/windows"
)

func lock(path string) (*os.File, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	// Share mode 0: a second process can't open the file while this handle is alive.
	h, err := windows.CreateFile(p, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil,
		windows.OPEN_ALWAYS, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		if err == windows.ERROR_SHARING_VIOLATION {
			return nil, ErrRunning
		}
		return nil, err
	}
	return os.NewFile(uintptr(h), path), nil
}
