#!/usr/bin/env bash
# Builds FreeTokens-<version>-<arch>.AppImage from source. Linux only (appimagetool runs there).
#
#   scripts/build-appimage.sh 1.2.3            # x86_64
#   scripts/build-appimage.sh 1.2.3 arm64      # aarch64, on an arm64 host
#
# The AppImage carries the classic tray build, not the Wails popover: the popover needs
# webkit2gtk at build time, and a portable image shouldn't depend on the host's GTK.

set -euo pipefail

VERSION="${1:?usage: build-appimage.sh <version> [amd64|arm64]}"
GOARCH_ARG="${2:-amd64}"
case "$GOARCH_ARG" in
  amd64) ARCH=x86_64 ;;
  arm64) ARCH=aarch64 ;;
  *) echo "build-appimage: unsupported architecture $GOARCH_ARG" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/dist}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

APPDIR="$WORK/FreeTokens.AppDir"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/applications" \
  "$APPDIR/usr/share/icons/hicolor/512x512/apps"

COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo none)"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

(cd "$ROOT" && CGO_ENABLED=0 GOOS=linux GOARCH="$GOARCH_ARG" go build -trimpath \
  -ldflags "-s -w -X main.version=$VERSION -X main.commit=$COMMIT -X main.date=$DATE" \
  -o "$APPDIR/usr/bin/freetokens" ./cmd/freetokens)

cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
exec "${APPDIR:-$(dirname "$0")}/usr/bin/freetokens" "$@"
EOF
chmod 0755 "$APPDIR/AppRun"

cat > "$APPDIR/freetokens.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=FreeTokens
Comment=Freebuff token usage and daily hours
Exec=freetokens
Icon=freetokens
Terminal=false
Categories=Utility;
StartupWMClass=FreeTokens
EOF
cp "$APPDIR/freetokens.desktop" "$APPDIR/usr/share/applications/freetokens.desktop"

# The .desktop file looks up an icon named after itself, so it lives at the AppDir root too.
cp "$ROOT/cmd/freetokens/build/appicon.png" "$APPDIR/freetokens.png"
cp "$ROOT/cmd/freetokens/build/appicon.png" "$APPDIR/usr/share/icons/hicolor/512x512/apps/freetokens.png"

TOOL_ARGS=()
if command -v appimagetool >/dev/null 2>&1; then
  TOOL="$(command -v appimagetool)"
else
  TOOL="$WORK/appimagetool"
  echo "build-appimage: appimagetool not installed, downloading a copy"
  curl -fsSL -o "$TOOL" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
  chmod +x "$TOOL"
  # Runners and containers rarely have FUSE, and the tool can unpack itself instead.
  TOOL_ARGS=(--appimage-extract-and-run)
fi

mkdir -p "$OUT"
IMAGE="$OUT/FreeTokens-${VERSION#v}-${ARCH}.AppImage"
rm -f "$IMAGE"
ARCH="$ARCH" "$TOOL" "${TOOL_ARGS[@]}" "$APPDIR" "$IMAGE" >/dev/null
echo "$IMAGE"
