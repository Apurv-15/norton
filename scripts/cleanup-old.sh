#!/usr/bin/env bash
echo "Unloading LaunchAgents..."
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.apple.audio.SpeechAssistantHelper.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.apple.audio.SpeechAssistantHelper.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.apple.audio.SpeechAssistant.plist 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.apple.audio.SpeechAssistantHelper.plist
rm -f ~/Library/LaunchAgents/com.apple.audio.SpeechAssistant.plist

echo "Terminating old processes..."
pkill -9 -f "CoreAudioAssistant" 2>/dev/null || true
pkill -9 -f "NortonHelper" 2>/dev/null || true
pkill -9 -f "NortonSecurityExtension" 2>/dev/null || true
pkill -9 -f "SystemAudioDump" 2>/dev/null || true

echo "Removing installed application..."
rm -rf /Applications/CoreAudioAssistant.app

echo "Cleanup completed."
