#!/bin/bash
# Setup libmpv libraries for macOS development.
# Copies dylibs from Homebrew into src-tauri/libs/mpv/ for bundling.
#
# Prerequisites: brew install mpv
#
# Usage: ./scripts/setup_libs_macos.sh

set -e

LIBS_DIR="src-tauri/libs/mpv"
mkdir -p "$LIBS_DIR"

# Find libmpv
if [ -f "/opt/homebrew/lib/libmpv.2.dylib" ]; then
    MPV_LIB_DIR="/opt/homebrew/lib"
elif [ -f "/usr/local/lib/libmpv.2.dylib" ]; then
    MPV_LIB_DIR="/usr/local/lib"
else
    echo "ERROR: libmpv not found. Install it with: brew install mpv"
    exit 1
fi

echo "Found libmpv in: $MPV_LIB_DIR"

# Copy libmpv
cp "$MPV_LIB_DIR/libmpv.2.dylib" "$LIBS_DIR/"
echo "Copied libmpv.2.dylib"

# Normalize install names so the app can find them at runtime
cd "$LIBS_DIR"
install_name_tool -id @rpath/libmpv.2.dylib libmpv.2.dylib 2>/dev/null || true

# Ad-hoc sign
codesign --sign - --force libmpv.2.dylib 2>/dev/null || true

echo ""
echo "Setup complete. Libraries in $LIBS_DIR:"
ls -la *.dylib 2>/dev/null
echo ""
echo "To use in dev: set DYLD_FALLBACK_LIBRARY_PATH=$(pwd)"
