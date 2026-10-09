#!/usr/bin/env bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Building native Swift component..."
"$SCRIPT_DIR/build-native.sh"

echo "Packaging Electron application with Electron Forge..."
cd "$PROJECT_ROOT"
npm run package
