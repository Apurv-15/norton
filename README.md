# Norton 340

An Electron-based real‑time assistant that captures screen and audio for contextual AI responses (a fork of `cheating-daddy`).

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Download/Install Electron Binary

If you run into `ENOENT` issues with the Electron binary on package setup, run:

```bash
node node_modules/electron/install.js
```

### 3. Run the Development App

```bash
npm start
```

### 4. Build/Package for Production

To package the app for your current operating system:

```bash
npm run package
```

To create distribution-ready installers (dmg, setup exe, etc.):

```bash
npm run make
```

To build a Windows installer setup file (`.exe`) specifically (even from macOS/Linux):

```bash
npm run make -- --platform=win32
```

_Note: Cross-compilation to Windows from macOS/Linux requires `mono` or `wine` (`brew install mono` on macOS)._

---

## Required Files & Storage Directories

All user configurations, credentials, preferences, and chat history are saved in a platform-specific application support directory named `cheating-daddy-config`.

### Configuration Directory Paths

- **Windows:** `%APPDATA%/cheating-daddy-config/` (typically `C:\Users\<Username>\AppData\Roaming\cheating-daddy-config`)
- **macOS:** `~/Library/Application Support/cheating-daddy-config/`
- **Linux:** `~/.config/cheating-daddy-config/`

### Automatically Created Files

Inside the configuration directory, the following JSON files are managed by the application:

1. **`credentials.json`**
   Stores API keys for AI providers:
    - `apiKey` (Gemini API Key)
    - `groqApiKey` (Groq API Key)
    - `deepgramApiKey` (Deepgram API Key for audio transcription)

2. **`preferences.json`**
   Stores application settings:
    - Customized prompt template
    - Provider modes (e.g., BYOK, Ollama)
    - Selected language and profiles (e.g., Interview/Exam mode)
    - Screenshot interval and quality settings
    - Whisper & Ollama local host URLs/models
    - Extracted CV text and original CV filename

3. **`config.json`**
   Tracks onboarded status and layout preferences.

4. **`keybinds.json`**
   Contains custom global keyboard shortcuts (shortcuts default to standard bounds if not present).

5. **`limits.json`**
   Handles usage quotas, character/request counts, and daily limits for various providers.

6. **`history/`** (Folder)
   Contains saved chat sessions, screenshots, and transcript logs for post-meeting analysis.

### System Requirements

- **Audio Capture on macOS:** Relies on the custom native binary situated at `src/assets/SystemAudioDump` to record system audio. Ensure this file has executable permissions.
