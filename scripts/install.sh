#!/usr/bin/env bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
BIN_PATH="$PROJECT_ROOT/bin/NortonHelper"
LABEL="com.apple.audio.SpeechAssistantHelper"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo "Building latest binary..."
bash "$PROJECT_ROOT/scripts/build-native.sh"

echo "Configuring persistent launchd service..."
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.norton/logs" "$HOME/.norton/run"

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BIN_PATH}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NORTON_HELPER_TOKEN</key>
        <string>norton_secure_ipc_token</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>2</integer>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>$HOME/.norton/logs/launchd_stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.norton/logs/launchd_stderr.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"
echo "✓ Persistent system daemon installed and loaded as $LABEL"
echo "  launchd will auto-restart NortonHelper if terminated by any process."
