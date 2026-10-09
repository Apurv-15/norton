#!/usr/bin/env bash
set -e

LABEL="com.norton.norton260.helper"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo "Installing LaunchAgent service..."
if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load "$PLIST_PATH"
    echo "✓ Loaded LaunchAgent $LABEL"
else
    echo "✗ LaunchAgent plist not found at $PLIST_PATH. Run the app to generate it."
fi
