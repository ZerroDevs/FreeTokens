//go:build !darwin && !windows && !linux && !freebsd && !openbsd && !netbsd && !dragonfly

package secrets

type platformStore struct{}

func (platformStore) Get(string, string, bool) (string, error) { return "", ErrUnavailable }
