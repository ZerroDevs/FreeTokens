# Release publisher

Cut a FreeTokens release from Windows without CI: build the downloads for every platform, then
attach them to a GitHub Release. This is the local equivalent of tagging `v*` and letting
[.github/workflows/release.yml](../../.github/workflows/release.yml) run.

| File | Purpose |
| --- | --- |
| `PublishReleaseGui.ps1` | WPF window: pick targets, edit notes, build and upload |
| `BuildTargets.ps1` | Builds the archives, the Inno Setup installer and `checksums.txt` |
| `freetokens.iss` | Inno Setup 6 script (compiled by `BuildTargets.ps1`) |
| `ReleaseAssets.ps1` | Shared asset names, checksum writer and ISCC discovery |

## Requirements

- Windows 10 or later, Windows PowerShell 5.1
- Go 1.26+ and Node 22+ (`go.mod` and `ci.yml` pin the same versions)
- Inno Setup 6 for the Windows installer, from <https://jrsoftware.org/isdl.php>. Without it the x64
  zip still builds and `Setup.exe` is skipped with a warning.
- GNU `tar` and `gzip` for correct Unix file modes. Git for Windows provides both; the Windows
  `tar.exe` fallback still works but the extracted binary may need `chmod +x`.
- A GitHub personal access token with the `repo` scope to publish.

## Usage

```powershell
# GUI
powershell -ExecutionPolicy Bypass -File scripts\release\PublishReleaseGui.ps1

# Command line, no publishing
powershell -ExecutionPolicy Bypass -File scripts\release\BuildTargets.ps1 `
  -Version 1.2.3 -Targets windows-amd64,linux-amd64,linux-arm64,darwin-arm64
```

`BuildTargets.ps1` writes to `dist/` (git-ignored) and deletes any earlier artifacts for the same
version first, so a stale file can never be uploaded as new.

## Targets and artifacts

Names match GoReleaser and the in-app updater: archives must end in `_<os>_<arch>` and the macOS
app must be `FreeTokens-<version>-macOS.zip` (`internal/update.AppAssetPattern`).

| Target | Files |
| --- | --- |
| `windows-amd64` | `freetokens_<v>_windows_amd64.zip`, `FreeTokens-<v>-Setup-x64.exe` |
| `windows-arm64` | `freetokens_<v>_windows_arm64.zip` |
| `linux-amd64` | `freetokens_<v>_linux_amd64.tar.gz` |
| `linux-arm64` | `freetokens_<v>_linux_arm64.tar.gz` |
| `darwin-amd64` | `freetokens_<v>_darwin_amd64.tar.gz` (CLI engine) |
| `darwin-arm64` | `freetokens_<v>_darwin_arm64.tar.gz` (CLI engine) |
| `macos-app` | `FreeTokens-<v>-macOS.zip` |

Windows zips carry `freetokens.exe` (console/CLI) and `freetokensw.exe` (windowless popover).
Archives also include `README.md`, `LICENSE` and `NOTICE`. `checksums.txt` is SHA-256 for every
artifact and is uploaded last; the in-app updater refuses a release without it.

The installer registers the app per user, so there is no UAC prompt: `%LOCALAPPDATA%\Programs\FreeTokens`,
Start Menu shortcuts, an optional desktop shortcut and an optional Start-at-login task that writes
the same HKCU `Run` value the in-app toggle uses. Uninstalling removes that value.

## macOS

`FreeTokens-<version>-macOS.zip` needs macOS: it is a Swift package, built by
`scripts/build-macos-app.sh` with `swift`, `lipo` and an ad-hoc `codesign`. On Windows the target
reuses an existing `dist-app/FreeTokens-<version>-macOS.zip` if you have one from CI or a Mac, and
is disabled otherwise. The two `darwin` CLI archives do cross-compile; they are CGO-free, so they
have the CLI and the classic tray but no menu bar app.

## Publishing

1. Commit what you are releasing. The release tag is created at `HEAD`, and the GUI warns when the
   tree is dirty or the branch is not `main`.
2. Enter a tag like `v1.2.3`. The leading `v` is required by this repo's convention and stripped for
   asset names.
3. Paste a token once and press **Save**: it goes to `scripts/release/.release_token`, which is
   git-ignored, and it is verified against `api.github.com`.
4. **Regenerate from git** drafts notes from conventional commits since the previous tag.
5. **Build and publish** builds the selected targets, writes `checksums.txt`, then creates the
   release and uploads. An existing release for the tag is reused: its name, notes and flags are
   updated before its assets are replaced.

`Draft` creates the release unpublished; `Pre-release` marks it as such.

## Troubleshooting

- `npm error EPERM ... unlink ... .node` - a running Vite dev server or antivirus is holding
  `node_modules`. Stop the dev server, or delete `cmd/freetokens/web/node_modules` and rebuild. The
  script reuses a working `node_modules` and only reinstalls when it is missing; pass
  `-FreshInstall` to force `npm ci`.
- `Setup.exe` missing - Inno Setup 6 was not found. Install it, or use the zip.
- A target builds but nothing is uploaded - the file name no longer matches what the publisher
  discovers. Keep the naming in `Get-FreeTokensAssetNames` in sync with `BuildTargets.ps1`.
