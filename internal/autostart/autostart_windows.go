package autostart

import (
	"strings"

	"golang.org/x/sys/windows/registry"
)

const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`

func quote(arg string) string {
	if arg != "" && !strings.ContainsAny(arg, " \t\"") {
		return arg
	}
	return `"` + strings.ReplaceAll(arg, `"`, `\"`) + `"`
}

// Enabled reports whether the Run value exists.
func Enabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue("FreeTokens")
	return err == nil
}

// Enable sets HKCU\...\Run\FreeTokens.
func Enable(e Entry) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	parts := make([]string, len(e.Exec))
	for i, a := range e.Exec {
		parts[i] = quote(a)
	}
	return k.SetStringValue("FreeTokens", strings.Join(parts, " "))
}

// Disable deletes the Run value.
func Disable() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return nil
	}
	defer k.Close()
	if err := k.DeleteValue("FreeTokens"); err != nil && err != registry.ErrNotExist {
		return err
	}
	return nil
}
