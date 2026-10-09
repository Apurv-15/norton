#!/usr/bin/env bash
set -e

LABEL="com.norton.norton260.helper"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
SOCKET_PATH="$HOME/.norton/run/norton_helper.sock"

echo "Uninstalling Norton Native Helper..."

if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "✓ Removed LaunchAgent plist"
fi

rm -f "$SOCKET_PATH"
killall NortonHelper 2>/dev/null || true

echo "✓ Uninstallation complete."
