package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHashFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "asset.zip")
	if err := os.WriteFile(path, []byte("abc"), 0o644); err != nil {
		t.Fatal(err)
	}
	const want = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	got, err := hashFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("hashFile = %q, want %q", got, want)
	}
	if _, err := hashFile(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("hashFile accepted a missing file")
	}
}

func TestWingetInstaller(t *testing.T) {
	body := wingetInstaller("1.2.3", "FreeTokens-1.2.3-Setup-x64.exe", "abc123")
	for _, want := range []string{
		"PackageVersion: 1.2.3",
		"InstallerUrl: https://github.com/tverma101/FreeTokens/releases/download/v1.2.3/FreeTokens-1.2.3-Setup-x64.exe",
		"InstallerSha256: ABC123",
		"InstallerType: inno",
		"ProductCode: '" + innoProductCode + "'",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("installer manifest is missing %q:\n%s", want, body)
		}
	}
}

func TestScoopJSON(t *testing.T) {
	body, err := scoopJSON("1.2.3", "freetokens_1.2.3_windows_amd64.zip", "deadbeef")
	if err != nil {
		t.Fatal(err)
	}
	var parsed scoopManifest
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if parsed.Version != "1.2.3" {
		t.Errorf("version = %q", parsed.Version)
	}
	arch := parsed.Architecture["64bit"]
	if arch.Hash != "deadbeef" {
		t.Errorf("hash = %q", arch.Hash)
	}
	if !strings.HasSuffix(arch.URL, "/freetokens_1.2.3_windows_amd64.zip") {
		t.Errorf("url = %q", arch.URL)
	}
	if len(parsed.Bin) != 2 || parsed.Bin[0][0] != "freetokens.exe" {
		t.Errorf("bin = %v", parsed.Bin)
	}
	if !strings.Contains(parsed.Autoupdate.Architecture["64bit"].URL, "/v$version/") {
		t.Errorf("autoupdate url = %q", parsed.Autoupdate.Architecture["64bit"].URL)
	}
}

func TestCask(t *testing.T) {
	body := cask("1.2.3", "FreeTokens-1.2.3-macOS.zip", "cafe")
	for _, want := range []string{`version "1.2.3"`, `sha256 "cafe"`, `app "FreeTokens.app"`, "#{version}/FreeTokens-1.2.3-macOS.zip"} {
		if !strings.Contains(body, want) {
			t.Errorf("cask is missing %q:\n%s", want, body)
		}
	}
}
