//go:build darwin && cgo

package secrets

/*
#cgo LDFLAGS: -framework CoreFoundation -framework Security
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdlib.h>
#include <string.h>

static OSStatus ft_read(const char *service, const char *account, int interactive, char **out, long *outLen) {
	CFStringRef svc = CFStringCreateWithCString(NULL, service, kCFStringEncodingUTF8);
	CFStringRef acct = CFStringCreateWithCString(NULL, account, kCFStringEncodingUTF8);
	CFMutableDictionaryRef q = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFDictionaryAddValue(q, kSecClass, kSecClassGenericPassword);
	CFDictionaryAddValue(q, kSecAttrService, svc);
	CFDictionaryAddValue(q, kSecAttrAccount, acct);
	CFDictionaryAddValue(q, kSecReturnData, kCFBooleanTrue);
	CFDictionaryAddValue(q, kSecMatchLimit, kSecMatchLimitOne);
	if (!interactive) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
		CFDictionaryAddValue(q, kSecUseAuthenticationUI, kSecUseAuthenticationUIFail);
#pragma clang diagnostic pop
	}
	// The legacy file-based keychain (where Bun.secrets writes) ignores kSecUseAuthenticationUI;
	// its process-wide UI switch must be off for the whole call, then restored.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
	Boolean previous = true;
	OSStatus gate = SecKeychainGetUserInteractionAllowed(&previous);
	if (gate == errSecSuccess) gate = SecKeychainSetUserInteractionAllowed(interactive ? true : false);
	if (gate != errSecSuccess) {
		CFRelease(q); CFRelease(svc); CFRelease(acct);
		return gate;
	}
	CFTypeRef result = NULL;
	OSStatus status = SecItemCopyMatching(q, &result);
	if (SecKeychainSetUserInteractionAllowed(previous) != errSecSuccess) {
		SecKeychainSetUserInteractionAllowed(false);
	}
#pragma clang diagnostic pop
	if (status == errSecSuccess && result != NULL) {
		CFDataRef data = (CFDataRef)result;
		long n = (long)CFDataGetLength(data);
		*out = (char *)malloc(n + 1);
		memcpy(*out, CFDataGetBytePtr(data), n);
		(*out)[n] = 0;
		*outLen = n;
		CFRelease(result);
	}
	CFRelease(q); CFRelease(svc); CFRelease(acct);
	return status;
}
*/
import "C"

import (
	"fmt"
	"sync"
	"unsafe"
)

// gate serializes reads because the legacy keychain UI switch is process-wide.
var gate sync.Mutex

type platformStore struct{}

func (platformStore) Get(service, account string, interactive bool) (string, error) {
	cs, ca := C.CString(service), C.CString(account)
	defer C.free(unsafe.Pointer(cs))
	defer C.free(unsafe.Pointer(ca))
	var out *C.char
	var n C.long
	flag := C.int(0)
	if interactive {
		flag = 1
	}
	gate.Lock()
	status := C.ft_read(cs, ca, flag, &out, &n)
	gate.Unlock()
	if out != nil {
		defer C.free(unsafe.Pointer(out))
	}
	switch status {
	case 0:
		return C.GoStringN(out, C.int(n)), nil
	case -25300: // errSecItemNotFound
		return "", ErrNotFound
	case -25308, -25293, -128: // interaction not allowed, auth failed, user canceled
		return "", ErrInteractionRequired
	default:
		return "", fmt.Errorf("keychain status %d", int(status))
	}
}
