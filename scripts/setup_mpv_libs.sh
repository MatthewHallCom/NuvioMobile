#!/bin/bash
# Download prebuilt libmpv and dependencies for Tauri desktop builds.
# Source: https://github.com/FengZeng/mpv/releases (from soia project)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$PROJECT_ROOT/src-tauri/libs/mpv"
MPV_VERSION="v0.41.0-r0"
BASE_URL="https://github.com/FengZeng/mpv/releases/download/$MPV_VERSION"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) ARCH_SUFFIX="arm64" ;;
  x86_64)        ARCH_SUFFIX="x86_64" ;;
  *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Detect OS
OS=$(uname -s)
case "$OS" in
  Darwin) OS_SUFFIX="macos" ;;
  Linux)  OS_SUFFIX="linux" ;;
  *)      echo "Unsupported OS: $OS (use setup_mpv_libs_windows.sh for Windows)"; exit 1 ;;
esac

ASSET_NAME="libmpv-${MPV_VERSION#v}-${OS_SUFFIX}-${ARCH_SUFFIX}.tar.gz"
DOWNLOAD_URL="${BASE_URL}/${ASSET_NAME}"

# Check if already downloaded
if [ -f "$LIBS_DIR/libmpv.2.dylib" ] || [ -f "$LIBS_DIR/libmpv.so.2" ]; then
  echo "libmpv already present in $LIBS_DIR"
  echo "To re-download, remove the directory first: rm -rf $LIBS_DIR/*"
  exit 0
fi

echo "Downloading $ASSET_NAME..."
mkdir -p "$LIBS_DIR"
TMPFILE=$(mktemp /tmp/libmpv-XXXXXX.tar.gz)
curl -sL "$DOWNLOAD_URL" -o "$TMPFILE"

echo "Extracting to $LIBS_DIR..."
tar xzf "$TMPFILE" -C "$LIBS_DIR" --strip-components=2 ./lib/
rm "$TMPFILE"

# Ad-hoc sign on macOS (required for Apple Silicon)
if [ "$OS" = "Darwin" ]; then
  echo "Code signing dylibs..."
  for dylib in "$LIBS_DIR"/*.dylib; do
    codesign --force --sign - "$dylib" 2>/dev/null || true
  done
fi

echo "Done. $(ls "$LIBS_DIR"/*.dylib 2>/dev/null | wc -l | tr -d ' ') dylibs installed to $LIBS_DIR"
