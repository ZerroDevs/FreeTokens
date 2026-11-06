// Package instance keeps a single tray process per user via an exclusive lock file.
package instance

import (
	"errors"
	"os"
	"path/filepath"
)

// ErrRunning means another FreeTokens tray holds the lock.
var ErrRunning = errors.New("FreeTokens is already running")

// Lock acquires dir/tray.lock for the life of the process.
func Lock(dir string) (*os.File, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return lock(filepath.Join(dir, "tray.lock"))
}
