# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Norton 340 — an Electron app that captures screen and audio in real time and streams them to an AI provider (Gemini, Groq/BYOK, or local Ollama) for contextual assistance. Fork of `cheating-daddy`. Plain JavaScript, no bundler; UI is built with Lit web components loaded from vendored files in `src/assets`.

## Commands

```bash
npm install                    # install deps
node node_modules/electron/install.js   # fix ENOENT on the Electron binary if npm install didn't fetch it
npm start                      # run the app in dev (electron-forge start)
npm run package                # package for current OS
npm run make                   # build distributable installers (dmg/exe/deb/rpm)
npm run make -- --platform=win32   # cross-build Windows installer (needs mono/wine)
npx prettier --write .         # format (4-space indent, print width 150, semicolons, single quotes; src/assets and node_modules excluded)
```

`npm run lint` is a no-op placeholder. There is no test suite yet.

## Architecture

**Process split (Electron):**
- `src/index.js` — main process entry point. Wires up the window, registers all `ipcMain` handlers (storage, general app control), and initializes storage on startup.
- `src/preload.js` — empty/unused. The renderer runs with `nodeIntegration: true` and `contextIsolation: false` (see `src/utils/window.js`), so renderer code calls `ipcRenderer`/Node APIs directly instead of going through a context-bridge preload API. Keep this in mind when touching IPC — there is no sandboxing boundary today.
- `src/utils/window.js` — creates `BrowserWindow`s (main window + a separate MCQ overlay window via `createMcqOverlay`), manages global keyboard shortcuts.
- `src/storage.js` — all persisted app state (config, credentials, preferences, keybinds, usage limits, chat history) as JSON files under a per-OS `cheating-daddy-config` app-support directory. See README.md for the exact file list and paths.

**AI provider backends** (each exposes a similar start/stop/send-audio/send-image surface, invoked from `index.js`/`gemini.js`):
- `src/utils/gemini.js` — the primary provider integration (Gemini API) and also owns session lifecycle helpers (`initializeNewSession`, `saveConversationTurn`, `sendToRenderer`) that the other providers reuse.
- `src/utils/cloud.js` — a WebSocket-based cloud relay provider (BYOK / non-Gemini cloud path).
- `src/utils/localai.js` — local inference via Ollama, including PCM audio resampling (24kHz→16kHz) and voice-activity detection before sending audio to the model.
- `src/utils/prompts.js` — builds system prompts per profile (e.g. Interview/Exam modes) plus user customizations; `getSystemPrompt`/`buildSystemPrompt` are the entry points.
- `src/utils/pdfProcessor.js` — extracts text from an uploaded CV/PDF for prompt context.

**Renderer / UI:**
- `src/index.html` loads vendored Lit (`assets/lit-core*.js`), marked, and highlight.js directly as script tags — no build step for the renderer.
- `src/components/app/CheatingDaddyApp.js` is the root Lit component (`<cheating-daddy-app>`), coordinating view state; `AppHeader.js` is the header/toolbar component.
- `src/components/views/*.js` — one Lit component per screen (Onboarding, Main, Assistant, History, Customize/AICustomize, Advanced, CVUpload, Feedback, Help), each a `LitElement` subclass.
- `src/utils/renderer.js` — renderer-side glue: audio/screen capture, IPC calls into the main process, DOM/state wiring for the views.
- `src/assets/mcq-overlay.html` — separate lightweight window/page for the MCQ (multiple-choice question) overlay, created via `createMcqOverlay` in `window.js`.
- macOS system-audio capture depends on the native binary `src/assets/SystemAudioDump`, which must remain executable.

## Direction (see AGENTS.md for the full, more aspirational roadmap)

The codebase is gradually migrating toward TypeScript + React + shadcn/ui, with plans for local (whisper.cpp) transcription and dual-stream audio capture. Until that migration lands, new code in `src/` should stay consistent with the current plain-JS/Lit patterns rather than mixing paradigms speculatively — check AGENTS.md before starting any large structural change (UI framework, IPC security model, audio pipeline) since it documents the intended target architecture.
