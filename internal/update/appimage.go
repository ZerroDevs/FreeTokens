package update

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/creativeprojects/go-selfupdate"
)

const maxAppImage = 256 << 20

// AppImageArch maps a Go architecture to the token AppImage file names use.
func AppImageArch(goarch string) string {
	switch goarch {
	case "amd64":
		return "x86_64"
	case "386":
		return "i686"
	case "arm64":
		return "aarch64"
	case "arm":
		return "armhf"
	}
	return goarch
}

// pickAppImage finds the release asset for one architecture. The updater's own filter only matches
// the CLI archives, so the AppImage has to be located by name.
func pickAppImage(assets []selfupdate.SourceAsset, arch string) selfupdate.SourceAsset {
	for _, asset := range assets {
		name := asset.GetName()
		if !strings.HasSuffix(strings.ToLower(name), ".appimage") {
			continue
		}
		if strings.Contains(name, arch) {
			return asset
		}
	}
	return nil
}

func appImageAsset(ctx context.Context, version string) (selfupdate.SourceAsset, error) {
	src, err := selfupdate.NewGitHubSource(selfupdate.GitHubConfig{})
	if err != nil {
		return nil, err
	}
	releases, err := src.ListReleases(ctx, selfupdate.ParseSlug(Repo))
	if err != nil {
		return nil, fmt.Errorf("listing GitHub releases: %w", err)
	}
	arch := AppImageArch(runtime.GOARCH)
	for _, rel := range releases {
		if Normalize(rel.GetTagName()) != Normalize(version) {
			continue
		}
		if asset := pickAppImage(rel.GetAssets(), arch); asset != nil {
			return asset, nil
		}
	}
	return nil, fmt.Errorf("release %s has no %s AppImage", Normalize(version), arch)
}

// applyAppImage replaces the AppImage file itself. The running mount is read-only, but $APPIMAGE is
// the writable file the launcher started, so the new image is written beside it and renamed into
// place; Restart then launches that file instead of the copy inside the old mount.
func applyAppImage(ctx context.Context, info *Info, path string) error {
	if info.release.ValidationAssetURL == "" {
		return errors.New("the release has no checksums.txt, so the update can't be verified")
	}
	asset, err := appImageAsset(ctx, info.Latest)
	if err != nil {
		return err
	}
	name := asset.GetName()
	data, err := fetch(ctx, asset.GetBrowserDownloadURL(), maxAppImage)
	if err != nil {
		return fmt.Errorf("downloading %s: %w", name, err)
	}
	sums, err := fetch(ctx, info.release.ValidationAssetURL, maxChecksums)
	if err != nil {
		return fmt.Errorf("downloading checksums.txt: %w", err)
	}
	if err := (&selfupdate.ChecksumValidator{UniqueFilename: "checksums.txt"}).Validate(name, data, sums); err != nil {
		return fmt.Errorf("%s failed verification: %w", name, err)
	}

	// Write beside the target so the final rename stays on one volume.
	tmp, err := os.CreateTemp(filepath.Dir(path), ".freetokens-update-*")
	if err != nil {
		if errors.Is(err, os.ErrPermission) {
			return fmt.Errorf("FreeTokens can't write next to %s. Move the AppImage to a folder you own, or download the update from the Releases page", path)
		}
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		if errors.Is(err, os.ErrPermission) {
			return fmt.Errorf("FreeTokens can't replace %s (permission denied). Download the new AppImage from the Releases page", path)
		}
		return fmt.Errorf("installing %s: %w", name, err)
	}
	return nil
}
