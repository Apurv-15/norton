if (require('electron-squirrel-startup')) {
    process.exit(0);
}

// Suppress EPIPE errors caused by broken stdout pipes (e.g. piped to `head`)
// Without this, a closed pipe crashes the entire Electron main process.
process.stdout.on('error', err => {
    if (err.code !== 'EPIPE') throw err;
});
process.stderr.on('error', err => {
    if (err.code !== 'EPIPE') throw err;
});

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const { createWindow, updateGlobalShortcuts, createMcqOverlay, destroyMcqOverlay } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const storage = require('./storage');
const { extractTextFromPDF } = require('./utils/pdfProcessor');

const geminiSessionRef = { current: null };
let mainWindow = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

// Electron drops session-only cookies (no Expires header) on app restart,
// which logs the claude.ai webview out even though the partition is "persist:".
// Round-trip them through a file across quit/start so the login survives.
const path = require('path');
const fs = require('fs');
const SYSTEM_DESIGN_COOKIES_PATH = path.join(storage.getConfigDir(), 'system-design-cookies.json');
const CHATGPT_COOKIES_PATH = path.join(storage.getConfigDir(), 'chatgpt-cookies.json');

async function restoreSystemDesignCookies() {
    try {
        const raw = fs.readFileSync(SYSTEM_DESIGN_COOKIES_PATH, 'utf-8');
        const cookies = JSON.parse(raw);
        const { session } = require('electron');
        const ses = session.fromPartition('persist:system-design');
        for (const cookie of cookies) {
            const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            await ses.cookies.set({ ...cookie, url }).catch(() => {});
        }
    } catch (e) {
        // No saved cookies yet, or partition not used before
    }
}

async function saveSystemDesignCookies() {
    try {
        const { session } = require('electron');
        const ses = session.fromPartition('persist:system-design');
        const cookies = await ses.cookies.get({});
        fs.writeFileSync(SYSTEM_DESIGN_COOKIES_PATH, JSON.stringify(cookies));
    } catch (e) {
        // Best-effort; ignore failures on quit
    }
}

async function restoreChatGPTCookies() {
    try {
        const raw = fs.readFileSync(CHATGPT_COOKIES_PATH, 'utf-8');
        const cookies = JSON.parse(raw);
        const { session } = require('electron');
        const ses = session.fromPartition('persist:chatgpt');
        for (const cookie of cookies) {
            const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            await ses.cookies.set({ ...cookie, url }).catch(() => {});
        }
    } catch (e) {
        // No saved cookies yet, or partition not used before
    }
}

async function saveChatGPTCookies() {
    try {
        const { session } = require('electron');
        const ses = session.fromPartition('persist:chatgpt');
        const cookies = await ses.cookies.get({});
        fs.writeFileSync(CHATGPT_COOKIES_PATH, JSON.stringify(cookies));
    } catch (e) {
        // Best-effort; ignore failures on quit
    }
}

app.whenReady().then(async () => {
    // Initialize storage (checks version, resets if needed)
    storage.initializeStorage();

    // Trigger screen recording permission prompt on macOS if not already granted
    if (process.platform === 'darwin') {
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources({ types: ['screen'] }).catch(() => {});
    }

    await restoreSystemDesignCookies();
    await restoreChatGPTCookies();

    createMainWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupStorageIpcHandlers();
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async () => {
    stopMacOSAudioCapture();
    if (process.platform === 'win32') require('./utils/windowsKeyboardHook').stopCapture();
    await saveSystemDesignCookies();
    await saveChatGPTCookies();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupStorageIpcHandlers() {
    // ============ CONFIG ============
    ipcMain.handle('storage:get-config', async () => {
        try {
            return { success: true, data: storage.getConfig() };
        } catch (error) {
            console.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-config', async (event, config) => {
        try {
            storage.setConfig(config);
            return { success: true };
        } catch (error) {
            console.error('Error setting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-config', async (event, key, value) => {
        try {
            storage.updateConfig(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CREDENTIALS ============
    ipcMain.handle('storage:get-credentials', async () => {
        try {
            return { success: true, data: storage.getCredentials() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-credentials', async (event, credentials) => {
        try {
            storage.setCredentials(credentials);
            return { success: true };
        } catch (error) {
            console.error('Error setting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-api-key', async () => {
        try {
            return { success: true, data: storage.getApiKey() };
        } catch (error) {
            console.error('Error getting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-api-key', async (event, apiKey) => {
        try {
            storage.setApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-groq-api-key', async () => {
        try {
            return { success: true, data: storage.getGroqApiKey() };
        } catch (error) {
            console.error('Error getting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-groq-api-key', async (event, groqApiKey) => {
        try {
            storage.setGroqApiKey(groqApiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-deepgram-api-key', async () => {
        try {
            return { success: true, data: storage.getDeepgramApiKey() };
        } catch (error) {
            console.error('Error getting Deepgram API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-deepgram-api-key', async (event, deepgramApiKey) => {
        try {
            storage.setDeepgramApiKey(deepgramApiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Deepgram API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ PREFERENCES ============
    ipcMain.handle('storage:get-preferences', async () => {
        try {
            return { success: true, data: storage.getPreferences() };
        } catch (error) {
            console.error('Error getting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferences', async (event, preferences) => {
        try {
            storage.setPreferences(preferences);
            return { success: true };
        } catch (error) {
            console.error('Error setting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-preference', async (event, key, value) => {
        try {
            storage.updatePreference(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating preference:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ KEYBINDS ============
    ipcMain.handle('storage:get-keybinds', async () => {
        try {
            return { success: true, data: storage.getKeybinds() };
        } catch (error) {
            console.error('Error getting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-keybinds', async (event, keybinds) => {
        try {
            storage.setKeybinds(keybinds);
            return { success: true };
        } catch (error) {
            console.error('Error setting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ HISTORY ============
    ipcMain.handle('storage:get-all-sessions', async () => {
        try {
            return { success: true, data: storage.getAllSessions() };
        } catch (error) {
            console.error('Error getting sessions:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-session', async (event, sessionId) => {
        try {
            return { success: true, data: storage.getSession(sessionId) };
        } catch (error) {
            console.error('Error getting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-session', async (event, sessionId, data) => {
        try {
            storage.saveSession(sessionId, data);
            return { success: true };
        } catch (error) {
            console.error('Error saving session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-session', async (event, sessionId) => {
        try {
            storage.deleteSession(sessionId);
            return { success: true };
        } catch (error) {
            console.error('Error deleting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-all-sessions', async () => {
        try {
            storage.deleteAllSessions();
            return { success: true };
        } catch (error) {
            console.error('Error deleting all sessions:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ LIMITS ============
    ipcMain.handle('storage:get-today-limits', async () => {
        try {
            return { success: true, data: storage.getTodayLimits() };
        } catch (error) {
            console.error('Error getting today limits:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CLEAR ALL ============
    ipcMain.handle('storage:clear-all', async () => {
        try {
            storage.clearAllData();
            return { success: true };
        } catch (error) {
            console.error('Error clearing all data:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CV MANAGEMENT ============
    ipcMain.handle('cv:upload', async (event, customPath) => {
        try {
            const path = require('path');
            let filePath = customPath;

            if (!filePath) {
                const result = await dialog.showOpenDialog(mainWindow, {
                    properties: ['openFile'],
                    filters: [
                        { name: 'Supported Documents', extensions: ['pdf', 'txt', 'md'] },
                        { name: 'PDF Files', extensions: ['pdf'] },
                        { name: 'Text Files', extensions: ['txt', 'md'] },
                    ],
                });

                if (result.canceled || result.filePaths.length === 0) {
                    return { success: false, error: 'Upload canceled' };
                }
                filePath = result.filePaths[0];
            }

            const filename = path.basename(filePath);
            const text = await extractTextFromPDF(filePath);

            storage.updatePreference('cvText', text);
            storage.updatePreference('cvFilename', filename);

            return { success: true, filename, charCount: text.length };
        } catch (error) {
            console.error('Error in cv:upload handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cv:status', async () => {
        try {
            const prefs = storage.getPreferences();
            return {
                success: true,
                filename: prefs.cvFilename || '',
                charCount: (prefs.cvText || '').length,
            };
        } catch (error) {
            console.error('Error in cv:status handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cv:clear', async () => {
        try {
            storage.updatePreference('cvText', '');
            storage.updatePreference('cvFilename', '');
            return { success: true };
        } catch (error) {
            console.error('Error in cv:clear handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-mcq-overlay', async () => {
        try {
            createMcqOverlay();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('stop-mcq-overlay', async () => {
        try {
            destroyMcqOverlay();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
}

function setupGeneralIpcHandlers() {
    ipcMain.handle('capture-screen-native', async (event, quality = 'medium') => {
        if (process.platform === 'darwin') {
            const { execFile } = require('child_process');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            return new Promise(resolve => {
                const tmpFile = path.join(os.tmpdir(), `norton-cap-${Date.now()}.jpg`);
                execFile('/usr/sbin/screencapture', ['-x', '-t', 'jpg', tmpFile], err => {
                    if (err) {
                        console.error('screencapture CLI failed:', err);
                        return resolve({ success: false, error: err.message });
                    }
                    try {
                        if (fs.existsSync(tmpFile)) {
                            const buffer = fs.readFileSync(tmpFile);
                            try {
                                fs.unlinkSync(tmpFile);
                            } catch (e) {}
                            return resolve({ success: true, data: buffer.toString('base64') });
                        }
                        return resolve({ success: false, error: 'File not created' });
                    } catch (readErr) {
                        return resolve({ success: false, error: readErr.message });
                    }
                });
            });
        }

        const { desktopCapturer, screen } = require('electron');
        try {
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.size;
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: Math.min(width, 1920), height: Math.min(height, 1080) },
            });
            if (sources && sources.length > 0) {
                const qualityValue = quality === 'low' ? 50 : quality === 'high' ? 90 : 70;
                const base64 = sources[0].thumbnail.toJPEG(qualityValue).toString('base64');
                return { success: true, data: base64 };
            }
            return { success: false, error: 'No screen sources available' };
        } catch (error) {
            console.error('Native screen capture error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            // Also save to storage
            storage.setKeybinds(newKeybinds);
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    // Debug logging from renderer
    ipcMain.on('log-message', (event, msg) => {
        console.log(msg);
    });
}
