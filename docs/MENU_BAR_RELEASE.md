# Norton Menu Bar Integration & Native OCR Release Notes

## Overview
This release adds full native macOS menu bar integration, non-activating NSPanel focus isolation, silent screen OCR capabilities (via Vision framework JXA & Windows PowerShell OCR), multi-key API rate-limit rotation, and layout mode switching between full application window and compact HUD overlay.

## Key Features & Changes Included in 18 Commits:
1. **Legacy Archive Cleanup**: Removed obsolete ZIP assets.
2. **Menu Bar Status Bar Icons**: Added status bar template assets (`logoTemplate.png`, `logoTemplate@2x.png`).
3. **Silent OCR Utility**: Added native macOS Vision JXA script and Windows Media OCR script.
4. **Standalone OCR Test Script**: Created `scratch/test-ocr.js` for verifying silent text extraction.
5. **Non-activating NSPanel Focus retention**: Enhanced `nonActivatingPanel.js` for focus isolation.
6. **Menu Bar Popup Window Manager**: Implemented `createMenuBarWindow` and `positionMenuBarWindow` in `window.js`.
7. **Cloud Renderer IPC Broadcast**: Enabled event broadcasting across all active BrowserWindow instances.
8. **Storage & Preferences**: Added options for `appLayoutMode`, `menuBarBounds`, `menuBarOpacity`, and shortcuts.
9. **Gemini & Fallback Provider Utilities**: Updated model handling, response streaming, and multi-key auto-locking.
10. **Renderer Utility Updates**: Added IPC listeners and state synchronization for menu bar mode.
11. **Main Process Tray Orchestration**: Configured system tray icon and popup toggle handlers in `index.js`.
12. **Native Silent OCR Handlers**: Registered IPC handlers for silent screen capture and base64 OCR.
13. **Window Lifecycle Synchronization**: Synchronized window opacity, sizes, and layout mode transitions.
14. **Customize View Configuration UI**: Added layout mode toggle and menu bar opacity sliders.
15. **Main View Response Layout**: Refined streaming response containers and compact menu bar view.
16. **CheatingDaddyApp UI Controller**: Updated main application component for dual layout modes (Full vs HUD).
17. **Electron Forge Build Config**: Configured packaging settings for Norton build.
18. **Release & Verification Docs**: Added release verification and documentation.
