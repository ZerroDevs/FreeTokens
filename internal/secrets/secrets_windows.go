//go:build windows

package secrets

import (
	"errors"
	"syscall"
	"unicode/utf16"

	"github.com/danieljoos/wincred"
)

type platformStore struct{}

// Bun writes CRED_TYPE_GENERIC with TargetName "service/name" and a UTF-8 blob.
func (platformStore) Get(service, account string, _ bool) (string, error) {
	cred, err := wincred.GetGenericCredential(service + "/" + account)
	if err != nil {
		if errors.Is(err, syscall.Errno(1168)) { // ERROR_NOT_FOUND
			return "", ErrNotFound
		}
		return "", err
	}
	return decodeBlob(cred.CredentialBlob), nil
}

// decodeBlob accepts Bun's UTF-8 blob and, defensively, a UTF-16LE blob written by other tools.
func decodeBlob(b []byte) string {
	if len(b) >= 2 && len(b)%2 == 0 && b[1] == 0 {
		u := make([]uint16, len(b)/2)
		for i := range u {
			u[i] = uint16(b[2*i]) | uint16(b[2*i+1])<<8
		}
		return string(utf16.Decode(u))
	}
	return string(b)
}
