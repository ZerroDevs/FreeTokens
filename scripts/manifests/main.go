// Command manifests writes the winget, Scoop and Homebrew cask files for a release from the
// artifacts already in the output directory. It hashes the files it references, so a manifest can
// only be generated after those files exist and can't point at an old build.
//
//	go run ./scripts/manifests -version 1.2.3 -dist dist -out dist/manifests
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	repo       = "tverma101/FreeTokens"
	identifier = "tverma101.FreeTokens"
	// Inno Setup writes its uninstall entry under AppId plus "_is1"; winget needs it to upgrade in
	// place instead of installing a second copy.
	innoProductCode = "{7C4B1E52-9A3D-4F0B-8E61-2D5A9C0B7F31}_is1"
)

func releaseURL(version, name string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/v%s/%s", repo, version, name)
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	sum := sha256.New()
	if _, err := io.Copy(sum, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(sum.Sum(nil)), nil
}

func wingetVersion(version string) string {
	return fmt.Sprintf(`# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json
PackageIdentifier: %s
PackageVersion: %s
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
`, identifier, version)
}

func wingetInstaller(version, setupName, hash string) string {
	return fmt.Sprintf(`# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json
PackageIdentifier: %s
PackageVersion: %s
InstallerType: inno
Scope: user
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: %s
    InstallerSha256: %s
    ProductCode: '%s'
ManifestType: installer
ManifestVersion: 1.6.0
`, identifier, version, releaseURL(version, setupName), strings.ToUpper(hash), innoProductCode)
}

func wingetLocale(version string) string {
	return fmt.Sprintf(`# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.1.6.0.schema.json
PackageIdentifier: %s
PackageVersion: %s
PackageLocale: en-US
Publisher: FreeTokens contributors
PublisherUrl: https://github.com/%s
PackageName: FreeTokens
License: MIT
LicenseUrl: https://github.com/%s/blob/main/LICENSE
ShortDescription: Freebuff token usage and daily hours in the system tray.
Description: FreeTokens reads measured Freebuff, Antigravity, Claude, Codex and OpenCode usage on this computer and shows today's hours, token totals and estimated API cost.
Moniker: freetokens
Tags:
  - usage
  - tokens
  - system-tray
  - freebuff
ManifestType: defaultLocale
ManifestVersion: 1.6.0
`, identifier, version, repo, repo)
}

type scoopArch struct {
	URL  string `json:"url"`
	Hash string `json:"hash"`
}

type scoopAutoupdate struct {
	Architecture map[string]scoopArch `json:"architecture"`
}

type scoopManifest struct {
	Schema       string               `json:"$schema"`
	Version      string               `json:"version"`
	Description  string               `json:"description"`
	Homepage     string               `json:"homepage"`
	License      string               `json:"license"`
	Architecture map[string]scoopArch `json:"architecture"`
	Bin          [][]string           `json:"bin"`
	Shortcuts    [][]string           `json:"shortcuts"`
	Checkver     map[string]string    `json:"checkver"`
	Autoupdate   scoopAutoupdate      `json:"autoupdate"`
}

func scoopJSON(version, zipName, hash string) ([]byte, error) {
	m := scoopManifest{
		Schema:      "https://raw.githubusercontent.com/ScoopInstaller/Scoop/master/schema.json",
		Version:     version,
		Description: "Freebuff token usage and daily hours in the system tray",
		Homepage:    "https://github.com/" + repo,
		License:     "MIT",
		Architecture: map[string]scoopArch{
			"64bit": {URL: releaseURL(version, zipName), Hash: hash},
		},
		// freetokens is the CLI, freetokensw the windowless popover the shortcut opens.
		Bin:       [][]string{{"freetokens.exe", "freetokens"}, {"freetokensw.exe", "freetokensw"}},
		Shortcuts: [][]string{{"freetokensw.exe", "FreeTokens"}},
		Checkver:  map[string]string{"github": "https://github.com/" + repo},
		Autoupdate: scoopAutoupdate{Architecture: map[string]scoopArch{
			"64bit": {
				URL: fmt.Sprintf("%s/releases/download/v$version/freetokens_$version_windows_amd64.zip", "https://github.com/"+repo),
			},
		}},
	}
	return json.MarshalIndent(m, "", "  ")
}

func cask(version, zipName, hash string) string {
	return fmt.Sprintf(`cask "freetokens" do
  version "%s"
  sha256 "%s"

  url "https://github.com/%s/releases/download/v#{version}/%s"
  name "FreeTokens"
  desc "Freebuff token usage and daily hours in the menu bar"
  homepage "https://github.com/%s"

  app "FreeTokens.app"
end
`, version, hash, repo, zipName, repo)
}

func main() {
	version := flag.String("version", "", "release version, with or without a leading v")
	dist := flag.String("dist", "dist", "directory holding the built release files")
	out := flag.String("out", filepath.Join("dist", "manifests"), "directory to write the manifests into")
	flag.Parse()

	v := strings.TrimPrefix(strings.TrimSpace(*version), "v")
	if v == "" || !strings.ContainsAny(v, "0123456789") {
		fmt.Fprintln(os.Stderr, "manifests: -version is required, for example 1.2.3")
		os.Exit(2)
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "manifests:", err)
		os.Exit(1)
	}

	written := 0
	write := func(name, body string) {
		path := filepath.Join(*out, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			fmt.Fprintln(os.Stderr, "manifests:", err)
			os.Exit(1)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			fmt.Fprintln(os.Stderr, "manifests:", err)
			os.Exit(1)
		}
		written++
		fmt.Println("   +", path)
	}
	// A missing artifact skips its package manager with a warning instead of writing a manifest
	// with an empty or stale hash.
	artifact := func(name string) (string, bool) {
		hash, err := hashFile(filepath.Join(*dist, name))
		if err != nil {
			fmt.Fprintf(os.Stderr, "manifests: skipping %s (not built)\n", name)
			return "", false
		}
		return hash, true
	}

	// One directory per store: winget validates a folder as a multi-file manifest and rejects the
	// folder if it holds anything else, and the Scoop and Homebrew files are submitted from their
	// own repositories anyway.
	setupName := fmt.Sprintf("FreeTokens-%s-Setup-x64.exe", v)
	if hash, ok := artifact(setupName); ok {
		write("winget/tverma101.FreeTokens.yaml", wingetVersion(v))
		write("winget/tverma101.FreeTokens.installer.yaml", wingetInstaller(v, setupName, hash))
		write("winget/tverma101.FreeTokens.locale.en-US.yaml", wingetLocale(v))
	}

	zipName := fmt.Sprintf("freetokens_%s_windows_amd64.zip", v)
	if hash, ok := artifact(zipName); ok {
		body, err := scoopJSON(v, zipName, hash)
		if err != nil {
			fmt.Fprintln(os.Stderr, "manifests:", err)
			os.Exit(1)
		}
		write("scoop/freetokens.json", string(body)+"\n")
	}

	appName := fmt.Sprintf("FreeTokens-%s-macOS.zip", v)
	if hash, ok := artifact(appName); ok {
		write("homebrew/freetokens.rb", cask(v, appName, hash))
	}

	if written == 0 {
		fmt.Fprintln(os.Stderr, "manifests: no release artifacts were found in", *dist)
		os.Exit(1)
	}
}
