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

const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    createWindow,
    updateGlobalShortcuts,
    createMcqOverlay,
    destroyMcqOverlay,
    createMenuBarWindow,
    positionMenuBarWindow,
    getMenuBarWindow,
} = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const storage = require('./storage');
const { extractTextFromPDF } = require('./utils/pdfProcessor');

const geminiSessionRef = { current: null };
let mainWindow = null;
let tray = null;

let latestResponseText = '';
let latestStatusText = 'Ready';

function updateTrayStatus(status) {
    if (!status) return;
    latestStatusText = typeof status === 'string' ? status : JSON.stringify(status);
    if (tray && !tray.isDestroyed()) {
        try {
            tray.setToolTip(`Norton Helper - ${latestStatusText}`);
        } catch (e) {}
    }
    rebuildTrayMenu();
}

function rebuildTrayMenu() {
    if (!tray) return;

    const preferences = storage.getPreferences();
    const layoutMode = preferences.appLayoutMode || 'full';

    let responseSnippet = 'No responses yet';
    if (latestResponseText && latestResponseText.trim()) {
        const clean = latestResponseText.replace(/\s+/g, ' ').trim();
        responseSnippet = clean.length > 50 ? clean.substring(0, 47) + '...' : clean;
    }

    let statusIcon = '💡';
    const lower = latestStatusText.toLowerCase();
    if (lower.includes('error') || lower.includes('failed') || lower.includes('limit') || lower.includes('locked')) {
        statusIcon = '⚠️';
    } else if (
        lower.includes('think') ||
        lower.includes('transcrib') ||
        lower.includes('connect') ||
        lower.includes('switch') ||
        lower.includes('record')
    ) {
        statusIcon = '⏳';
    } else if (lower.includes('listen') || lower.includes('ready')) {
        statusIcon = '🟢';
    }

    const activeProvider = preferences.activeProvider || 'auto';
    const ocrFirstEnabled = preferences.ocrFirstEnabled !== false;

    const stealthTrayIcon = preferences.stealthTrayIcon === true;

    const menuItems = [
        {
            label: `${statusIcon} Status: ${latestStatusText}`,
            enabled: false,
        },
        { type: 'separator' },
        {
            label: '📸 Stealth Capture',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: () => {
                triggerStealthCapture();
            },
        },
        {
            label: '⚡ Start/Stop Session',
            accelerator: 'CmdOrCtrl+Shift+E',
            click: () => {
                triggerToggleSession();
            },
        },
        {
            label: '👁️ Toggle HUD Overlay',
            accelerator: 'CmdOrCtrl+Shift+H',
            click: () => {
                toggleHUDOverlay();
            },
        },
        { type: 'separator' },
        {
            label: '🧠 Active AI Provider',
            submenu: [
                {
                    label: `⚡ Auto (Failover Chain) ${activeProvider === 'auto' ? '✓' : ''}`,
                    type: 'radio',
                    checked: activeProvider === 'auto',
                    click: () => {
                        storage.updatePreference('activeProvider', 'auto');
                        rebuildTrayMenu();
                    },
                },
                {
                    label: `✨ Google Gemini (Multi-Key) ${activeProvider === 'gemini' ? '✓' : ''}`,
                    type: 'radio',
                    checked: activeProvider === 'gemini',
                    click: () => {
                        storage.updatePreference('activeProvider', 'gemini');
                        rebuildTrayMenu();
                    },
                },
                {
                    label: `🌐 OpenRouter (Open Source) ${activeProvider === 'openrouter' ? '✓' : ''}`,
                    type: 'radio',
                    checked: activeProvider === 'openrouter',
                    click: () => {
                        storage.updatePreference('activeProvider', 'openrouter');
                        rebuildTrayMenu();
                    },
                },
                {
                    label: `⚡ Groq (Llama / Mixtral) ${activeProvider === 'groq' ? '✓' : ''}`,
                    type: 'radio',
                    checked: activeProvider === 'groq',
                    click: () => {
                        storage.updatePreference('activeProvider', 'groq');
                        rebuildTrayMenu();
                    },
                },
            ],
        },
        {
            label: `⚡ Save Tokens (OCR First) ${ocrFirstEnabled ? '✓' : ''}`,
            type: 'checkbox',
            checked: ocrFirstEnabled,
            click: () => {
                storage.updatePreference('ocrFirstEnabled', !ocrFirstEnabled);
                rebuildTrayMenu();
            },
        },
        {
            label: `🫥 Invisible Stealth Tray Icon ${stealthTrayIcon ? '✓' : ''}`,
            type: 'checkbox',
            checked: stealthTrayIcon,
            click: () => {
                const newVal = !stealthTrayIcon;
                storage.updatePreference('stealthTrayIcon', newVal);
                updateTrayIconVisual();
                rebuildTrayMenu();
            },
        },
        { type: 'separator' },
        {
            label: `📜 AI Response: ${responseSnippet}`,
            enabled: !!latestResponseText,
            click: () => {
                const { clipboard } = require('electron');
                if (latestResponseText) {
                    clipboard.writeText(latestResponseText);
                }
                toggleHUDOverlay(true);
            },
        },
        { type: 'separator' },
    ];

    if (layoutMode === 'menubar') {
        menuItems.push({
            label: '↔️ Switch to Full App Window',
            click: () => {
                switchToFullMode();
            },
        });
    } else {
        menuItems.push({
            label: '📌 Switch to Stealth Menu Bar HUD',
            click: () => {
                switchToMenuBarMode();
            },
        });
    }

    menuItems.push(
        { type: 'separator' },
        {
            label: '❌ Quit Helper',
            accelerator: 'CmdOrCtrl+Q',
            role: 'quit',
        }
    );

    const contextMenu = Menu.buildFromTemplate(menuItems);
    if (process.platform !== 'darwin') {
        tray.setContextMenu(contextMenu);
    } else {
        // Save for manual popUpContextMenu on right click only
        tray._contextMenu = contextMenu;
    }
    updateTrayIconVisual();
}

function updateTrayIconVisual(isCapturing = false) {
    if (!tray || tray.isDestroyed()) return;
    const { nativeImage } = require('electron');
    const preferences = storage.getPreferences();
    const isStealth = preferences.stealthTrayIcon !== false; // Default to stealth/invisible

    if (process.platform === 'darwin') {
        tray.setTitle('');
    }

    if (isCapturing || isStealth) {
        tray.setImage(nativeImage.createEmpty());
    } else {
        const iconPath = path.join(__dirname, 'assets/logoTemplate.png');
        let icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
            icon = icon.resize({ width: 16, height: 16 });
            icon.setTemplateImage(true);
            tray.setImage(icon);
        } else {
            tray.setImage(nativeImage.createEmpty());
        }
    }
}

function updateTrayResponsePreview(text) {
    if (!text) return;
    latestResponseText = text;
}

function triggerStealthCapture() {
    const preferences = storage.getPreferences();
    const layoutMode = preferences.appLayoutMode || 'full';
    if (layoutMode === 'menubar') {
        const menuBarWin = createMenuBarWindow(tray);
        menuBarWin.webContents.send('trigger-hidden-screenshot');
    } else if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('trigger-hidden-screenshot');
    }
}

function triggerToggleSession() {
    const preferences = storage.getPreferences();
    const layoutMode = preferences.appLayoutMode || 'full';
    if (layoutMode === 'menubar') {
        const menuBarWin = createMenuBarWindow(tray);
        menuBarWin.webContents.send('trigger-capture-session');
    } else if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('trigger-capture-session');
    }
}

function createTray() {
    const { nativeImage } = require('electron');
    const empty = nativeImage.createEmpty();
    tray = new Tray(empty);
    tray.setToolTip('System Helper');

    // On macOS: do NOT attach tray.setContextMenu() directly.
    // Native macOS NSMenu items are drawn by the OS WindowServer and CANNOT be protected by setContentProtection.
    // Instead, left-clicking the tray toggles our custom NSPanel HUD window (which HAS setContentProtection(true) and is 100% invisible on screen shares)!
    tray.on('click', () => {
        toggleHUDOverlay();
    });

    // Right click shows settings menu if needed
    tray.on('right-click', () => {
        if (tray._contextMenu) {
            tray.popUpContextMenu(tray._contextMenu);
        }
    });

    updateTrayIconVisual();
    rebuildTrayMenu();
}

function toggleHUDOverlay(forceShow = false) {
    const menuBarWindow = createMenuBarWindow(tray);
    if (!forceShow && menuBarWindow.isVisible()) {
        menuBarWindow.hide();
    } else {
        positionMenuBarWindow(menuBarWindow, tray);
        menuBarWindow.showInactive();
    }
}

const toggleMenuBarPopup = toggleHUDOverlay;

function switchToMenuBarMode() {
    storage.updatePreference('appLayoutMode', 'menubar');
    if (process.platform === 'darwin') {
        // 'accessory' policy: app never activates on macOS, so interacting with
        // menu bar / tray icons never steals keyboard focus from Chrome / ChatGPT.
        try {
            app.setActivationPolicy('accessory');
        } catch (e) {
            console.warn('setActivationPolicy failed:', e.message);
        }
        if (app.dock) app.dock.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
    }
    toggleHUDOverlay();
    rebuildTrayMenu();
}

function switchToFullMode() {
    storage.updatePreference('appLayoutMode', 'full');
    if (process.platform === 'darwin') {
        try {
            app.setActivationPolicy('accessory');
        } catch (e) {
            console.warn('setActivationPolicy failed:', e.message);
        }
        if (app.dock) app.dock.hide();
    }
    const menuBarWindow = getMenuBarWindow();
    if (menuBarWindow && !menuBarWindow.isDestroyed()) {
        menuBarWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
    }
    rebuildTrayMenu();
}

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

// Electron drops session-only cookies (no Expires header) on app restart,
// which logs the claude.ai webview out even though the partition is "persist:".
// Round-trip them through a file across quit/start so the login survives.
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

// Layer 5: Register the main Electron app as a KeepAlive LaunchAgent.
// launchd will restart the process automatically if it is killed — even by SIGKILL.
// The label matches our camouflaged bundle ID to blend in with Apple system services.
function registerAppLaunchAgent() {
    if (process.platform !== 'darwin') return;

    const label = 'com.apple.audio.SpeechAssistant';
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    const appPath = process.execPath;
    const logDir = path.join(os.homedir(), '.norton', 'logs');

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${appPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Adaptive</string>
    <key>StandardOutPath</key>
    <string>${path.join(logDir, 'app_stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(logDir, 'app_stderr.log')}</string>
</dict>
</plist>`;

    try {
        const dir = path.dirname(plistPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(plistPath, plistContent, 'utf8');
        console.log(`[Layer5] KeepAlive LaunchAgent registered: ${plistPath}`);
    } catch (e) {
        console.warn('[Layer5] Failed to register app LaunchAgent:', e.message);
    }
}

app.whenReady().then(async () => {
    // Hide app icon from macOS Dock for complete stealth menu bar operation
    if (process.platform === 'darwin') {
        if (app.dock && typeof app.dock.hide === 'function') {
            app.dock.hide();
        }
        try {
            app.setActivationPolicy('accessory');
        } catch (e) {}
    }

    // Initialize storage (checks version, resets if needed)
    storage.initializeStorage();

    // Trigger screen recording permission prompt on macOS if not already granted
    if (process.platform === 'darwin') {
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources({ types: ['screen'] }).catch(() => {});
    }

    const { session } = require('electron');
    const userAgent =
        process.platform === 'darwin'
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    const chatgptSession = session.fromPartition('persist:chatgpt');
    chatgptSession.setUserAgent(userAgent);
    chatgptSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders;
        delete headers['X-Requested-With'];
        callback({ cancel: false, requestHeaders: headers });
    });

    await restoreSystemDesignCookies();
    await restoreChatGPTCookies();

    createMainWindow();
    createTray();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupStorageIpcHandlers();
    setupGeneralIpcHandlers();

    if (process.platform === 'darwin') {
        const { helperManager } = require('./utils/macOSHelperManager');
        helperManager.initialize().catch(err => {
            console.warn('Native helper initialization warning:', err.message);
        });

        // Layer 3: Start Endpoint Security self-protection extension.
        // Gracefully skips if binary is absent or entitlement is unavailable (dev builds).
        const { systemExtensionManager } = require('./utils/systemExtensionManager');
        systemExtensionManager.initialize().catch(err => {
            console.warn('Security extension initialization warning:', err.message);
        });

        // Layer 5: Register a KeepAlive LaunchAgent so launchd restarts the app
        // automatically if a proctor browser manages to kill the Electron process.
        registerAppLaunchAgent();

        try {
            app.setActivationPolicy('accessory');
        } catch (e) {
            console.warn('setActivationPolicy failed:', e.message);
        }
        if (app.dock) app.dock.hide();
    }

    const preferences = storage.getPreferences();
    const layoutMode = preferences.appLayoutMode || 'full';
    if (layoutMode === 'full') {
        if (mainWindow) {
            mainWindow.show();
        }
    } else {
        createMenuBarWindow(tray);
    }
});

app.on('window-all-closed', e => {
    // Keep app running in background even if windows close
    e.preventDefault();
});

app.on('before-quit', async () => {
    app.isQuitting = true;
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

    ipcMain.handle('storage:get-gemini-api-keys', async () => {
        try {
            return { success: true, data: storage.getGeminiApiKeys() };
        } catch (error) {
            console.error('Error getting Gemini API keys:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-gemini-api-keys', async (event, keys) => {
        try {
            storage.setGeminiApiKeys(keys);
            return { success: true };
        } catch (error) {
            console.error('Error setting Gemini API keys:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-locked-keys', async () => {
        try {
            return { success: true, data: storage.getLockedKeys() };
        } catch (error) {
            console.error('Error getting locked keys:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:unlock-key', async (event, key) => {
        try {
            storage.unlockKey(key);
            return { success: true };
        } catch (error) {
            console.error('Error unlocking key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:reset-key-locks', async () => {
        try {
            storage.resetKeyLocks();
            return { success: true };
        } catch (error) {
            console.error('Error resetting key locks:', error);
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

    ipcMain.handle('storage:get-openrouter-api-key', async () => {
        try {
            return { success: true, data: storage.getOpenrouterApiKey() };
        } catch (error) {
            console.error('Error getting OpenRouter API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-openrouter-api-key', async (event, openrouterApiKey) => {
        try {
            storage.setOpenrouterApiKey(openrouterApiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting OpenRouter API key:', error);
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
        const preferences = storage.getPreferences();
        const layoutMode = preferences.appLayoutMode || 'full';
        const { getMenuBarWindow } = require('./utils/window');
        const activeWindows = [];

        // In full mode only, hide mainWindow so it is not captured in the screenshot
        if (layoutMode === 'full' && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            activeWindows.push(mainWindow);
            mainWindow.hide();
            // Small delay to allow OS window server to update frame buffers
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        let result;
        if (process.platform === 'darwin') {
            const { execFile } = require('child_process');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            result = await new Promise(resolve => {
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
        } else {
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
                    result = { success: true, data: base64 };
                } else {
                    result = { success: false, error: 'No screen sources available' };
                }
            } catch (error) {
                console.error('Native screen capture error:', error);
                result = { success: false, error: error.message };
            }
        }

        // Restore windows only if in full mode
        if (layoutMode === 'full') {
            for (const win of activeWindows) {
                if (win && !win.isDestroyed()) {
                    win.showInactive();
                }
            }
        }

        return result;
    });

    ipcMain.handle('capture-clean-screenshot', async (event, quality = 'medium') => {
        const { screen, nativeImage } = require('electron');
        const preferences = storage.getPreferences();
        const layoutMode = preferences.appLayoutMode || 'full';
        const primaryDisplay = screen.getPrimaryDisplay();
        const { x, y, width, height } = primaryDisplay.workArea;

        // Temporarily make tray icon 100% transparent during screenshot capture
        updateTrayIconVisual(true);

        const activeWindows = [];

        // In full mode only, hide mainWindow so it is not in the screenshot
        if (layoutMode === 'full' && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            activeWindows.push(mainWindow);
            mainWindow.hide();
            await new Promise(resolve => setTimeout(resolve, 80));
        }

        let base64Data = null;
        if (process.platform === 'darwin') {
            const { execFile } = require('child_process');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            const buffer = await new Promise(resolve => {
                const tmpFile = path.join(os.tmpdir(), `norton-clean-cap-${Date.now()}.jpg`);
                execFile('/usr/sbin/screencapture', ['-x', '-t', 'jpg', tmpFile], err => {
                    if (err) {
                        console.error('screencapture clean failed:', err);
                        return resolve(null);
                    }
                    try {
                        if (fs.existsSync(tmpFile)) {
                            const data = fs.readFileSync(tmpFile);
                            try {
                                fs.unlinkSync(tmpFile);
                            } catch (e) {}
                            return resolve(data);
                        }
                        return resolve(null);
                    } catch (readErr) {
                        return resolve(null);
                    }
                });
            });

            if (buffer) {
                const qualityValue = quality === 'low' ? 50 : quality === 'high' ? 90 : 70;
                let image = nativeImage.createFromBuffer(buffer);
                const size = image.getSize();

                // Crop out top macOS Menu Bar (primaryDisplay.workArea.y or top ~38px)
                const menuBarHeight = Math.max(0, primaryDisplay.workArea.y || 38);
                if (menuBarHeight > 0 && size.height > menuBarHeight) {
                    const scaleY = size.height / primaryDisplay.bounds.height;
                    const cropTop = Math.round(menuBarHeight * scaleY);
                    image = image.crop({
                        x: 0,
                        y: cropTop,
                        width: size.width,
                        height: size.height - cropTop,
                    });
                }

                base64Data = image.toJPEG(qualityValue).toString('base64');
            }
        } else {
            const { desktopCapturer } = require('electron');
            try {
                const displaySize = primaryDisplay.size;
                const sources = await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: { width: Math.min(displaySize.width, 1920), height: Math.min(displaySize.height, 1080) },
                });
                if (sources && sources.length > 0) {
                    const image = sources[0].thumbnail;
                    const imageSize = image.getSize();
                    const scaleX = imageSize.width / primaryDisplay.bounds.width;
                    const scaleY = imageSize.height / primaryDisplay.bounds.height;

                    const cropRect = {
                        x: Math.round(x * scaleX),
                        y: Math.round(y * scaleY),
                        width: Math.round(width * scaleX),
                        height: Math.round(height * scaleY),
                    };

                    const croppedImage = image.crop(cropRect);
                    const qualityValue = quality === 'low' ? 50 : quality === 'high' ? 90 : 70;
                    base64Data = croppedImage.toJPEG(qualityValue).toString('base64');
                }
            } catch (error) {
                console.error('DesktopCapturer clean failed:', error);
            }
        }

        // Restore tray icon visual state after capture finishes
        updateTrayIconVisual(false);

        // Restore windows only if in full mode
        if (layoutMode === 'full') {
            for (const win of activeWindows) {
                if (win && !win.isDestroyed()) {
                    win.showInactive();
                }
            }
        }

        if (base64Data) {
            return { success: true, data: base64Data };
        }
        return { success: false, error: 'Failed to capture or crop clean screenshot' };
    });

    ipcMain.handle('capture-screen-ocr', async () => {
        try {
            const { performSilentOcr } = require('./utils/silentOcr');
            const text = await performSilentOcr();
            return { success: true, text };
        } catch (error) {
            console.error('Error in capture-screen-ocr handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    const { helperManager } = require('./utils/macOSHelperManager');

    ipcMain.handle('helper:status', async () => {
        return helperManager.getStatus();
    });

    ipcMain.handle('helper:enable', async () => {
        await helperManager.enableHelper();
        return helperManager.getStatus();
    });

    ipcMain.handle('helper:disable', async () => {
        await helperManager.disableHelper();
        return helperManager.getStatus();
    });

    ipcMain.handle('helper:uninstall', async () => {
        await helperManager.uninstallHelper();
        return helperManager.getStatus();
    });

    ipcMain.handle('helper:reinstall', async () => {
        await helperManager.reinstallHelper();
        return helperManager.getStatus();
    });

    ipcMain.handle('helper:logs', async () => {
        return helperManager.getLogs();
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

    ipcMain.handle('toggle-app-mode', async (event, mode) => {
        if (mode === 'menubar') {
            switchToMenuBarMode();
        } else {
            switchToFullMode();
        }
        return { success: true };
    });

    ipcMain.handle('hide-menubar-window', () => {
        const menuBarWindow = getMenuBarWindow();
        if (menuBarWindow && !menuBarWindow.isDestroyed()) {
            menuBarWindow.hide();
        }
        return { success: true };
    });

    ipcMain.handle('set-menubar-opacity', (event, opacity) => {
        const val = Math.max(0.15, Math.min(1.0, parseFloat(opacity)));
        const menuBarWindow = getMenuBarWindow();
        if (menuBarWindow && !menuBarWindow.isDestroyed()) {
            menuBarWindow.setOpacity(val);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setOpacity(val);
        }
        storage.updatePreference('menuBarOpacity', val);
        return { success: true, opacity: val };
    });

    ipcMain.handle('set-menubar-size', (event, { width, height }) => {
        const menuBarWindow = getMenuBarWindow();
        if (menuBarWindow && !menuBarWindow.isDestroyed()) {
            const w = Math.max(320, parseInt(width, 10));
            const h = Math.max(250, parseInt(height, 10));
            menuBarWindow.setSize(w, h);
            storage.updatePreference('menuBarBounds', { width: w, height: h });
        }
        return { success: true };
    });

    ipcMain.handle('show-main-window-inactive', () => {
        const preferences = storage.getPreferences();
        const layoutMode = preferences.appLayoutMode || 'full';
        if (layoutMode === 'full' && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.showInactive();
        }
        return { success: true };
    });

    ipcMain.handle('save-screenshot-dialog', async (event, base64Data) => {
        const { dialog } = require('electron');
        const fs = require('fs');
        const win = getMenuBarWindow() || mainWindow;
        const result = await dialog.showSaveDialog(win, {
            title: 'Save Screenshot',
            defaultPath: `screenshot-${Date.now()}.jpg`,
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
        });
        if (!result.canceled && result.filePath) {
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(result.filePath, buffer);
            return { success: true };
        }
        return { success: false };
    });

    ipcMain.handle('ocr-base64', async (event, base64Data) => {
        try {
            const { performOcrOnBase64 } = require('./utils/silentOcr');
            const text = await performOcrOnBase64(base64Data);
            return { success: true, text };
        } catch (error) {
            console.error('Error in ocr-base64 handler:', error);
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

module.exports = {
    getTray: () => tray,
    toggleHUDOverlay,
    toggleMenuBarPopup,
    updateTrayResponsePreview,
    updateTrayStatus,
};
