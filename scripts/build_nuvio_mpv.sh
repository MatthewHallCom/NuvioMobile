#!/bin/bash
# Build the libnuvio_mpv native helper library for macOS.
# This compiles the ObjC code that creates a CAMetalLayer and
# wires it to mpv's render context.
#
# Usage: ./scripts/build_nuvio_mpv.sh

set -e

NATIVE_DIR="src-tauri/native/macos"
LIBS_DIR="src-tauri/libs/mpv"
OUTPUT="$LIBS_DIR/libnuvio_mpv.dylib"

mkdir -p "$LIBS_DIR"

echo "Building libnuvio_mpv.dylib..."

clang -dynamiclib -o "$OUTPUT" \
    "$NATIVE_DIR/nuvio_mpv.m" \
    -I "$NATIVE_DIR" \
    -framework Cocoa \
    -framework QuartzCore \
    -framework Metal \
    -fobjc-arc \
    -O2 \
    -arch arm64 \
    -mmacosx-version-min=12.0 \
    -install_name @rpath/libnuvio_mpv.dylib

# Ad-hoc sign
codesign --sign - --force "$OUTPUT" 2>/dev/null || true

echo "Built: $OUTPUT"
ls -la "$OUTPUT"
echo ""
echo "To use: ensure DYLD_FALLBACK_LIBRARY_PATH includes $LIBS_DIR"
