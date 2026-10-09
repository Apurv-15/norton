#!/usr/bin/env bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SWIFT_BUILD_DIR="$PROJECT_ROOT/native/NortonHelper"
DIST_DIR="$PROJECT_ROOT/bin"

echo "=========================================="
echo "Building Native Swift Helper (NortonHelper)"
echo "=========================================="

mkdir -p "$DIST_DIR"

cd "$SWIFT_BUILD_DIR"
swift build -c release

BUILD_BIN="$SWIFT_BUILD_DIR/.build/release/NortonHelper"

if [ -f "$BUILD_BIN" ]; then
    cp "$BUILD_BIN" "$DIST_DIR/NortonHelper"
    chmod +x "$DIST_DIR/NortonHelper"
    echo "✓ Built Swift NortonHelper executable at $DIST_DIR/NortonHelper"
else
    echo "✗ Error: Swift build binary not found at $BUILD_BIN"
    exit 1
fi

echo "=========================================="
echo "Building Native Security Extension Target"
echo "=========================================="

SEC_BUILD_DIR="$PROJECT_ROOT/native/NortonSecurityExtension"
cd "$SEC_BUILD_DIR"
swift build -c release

SEC_BUILD_BIN="$SEC_BUILD_DIR/.build/release/NortonSecurityExtension"

if [ -f "$SEC_BUILD_BIN" ]; then
    cp "$SEC_BUILD_BIN" "$DIST_DIR/NortonSecurityExtension"
    chmod +x "$DIST_DIR/NortonSecurityExtension"
    codesign --force -s - "$DIST_DIR/NortonSecurityExtension" 2>/dev/null || true
    echo "✓ Built Swift NortonSecurityExtension executable at $DIST_DIR/NortonSecurityExtension"
else
    echo "✗ Error: Security Extension binary not found at $SEC_BUILD_BIN"
    exit 1
fi
