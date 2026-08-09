const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('node:path');
const storage = require('../storage');
const { applyNonActivatingPanel } = require('./nonActivatingPanel');

let mouseEventsIgnored = false;
let mcqOverlayWindow = null;
let mainWindowRef = null;
let _hiddenAt = null;

const DEFAULT_MAIN_WINDOW_SIZE = { width: 1100, height: 800 };
const MIN_WINDOW_SIZE = { width: 700, height: 320 };

function createWindow(sendToRenderer, geminiSessionRef) {
    const config = storage.getConfig();
    const savedBounds = config.windowBounds;
    let x = undefined;
    let y = undefined;
    let width = DEFAULT_MAIN_WINDOW_SIZE.width;
    let height = DEFAULT_MAIN_WINDOW_SIZE.height;

    if (savedBounds) {
        // Verify the saved position is visible on at least one display
        const displays = screen.getAllDisplays();
        const isVisible = displays.some(display => {
            const displayBounds = display.bounds;
            // Check if the center of the saved bounds is inside the display
            const centerX = savedBounds.x + savedBounds.width / 2;
            const centerY = savedBounds.y + savedBounds.height / 2;
            return (
                centerX >= displayBounds.x &&
                centerX <= displayBounds.x + displayBounds.width &&
                centerY >= displayBounds.y &&
                centerY <= displayBounds.y + displayBounds.height
            );
        });

        if (isVisible) {
            x = savedBounds.x;
            y = savedBounds.y;
            width = savedBounds.width;
            height = savedBounds.height;
        }
    }

    const mainWindow = new BrowserWindow({
        x: x,
        y: y,
        width: width,
        height: height,
        minWidth: MIN_WINDOW_SIZE.width,
        minHeight: MIN_WINDOW_SIZE.height,
        resizable: true,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        // macOS: real NSPanel window - Electron's own IsPanel() check skips
        // activateIgnoringOtherApps on show/focus, so this window can be
        // clicked/typed into without ever pulling OS focus off whatever app
        // (e.g. fullscreen Chrome) was frontmost underneath it.
        ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
        icon: path.join(__dirname, '../assets/logo.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            webviewTag: true,
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#00000000',
    });
    mainWindowRef = mainWindow;
    applyNonActivatingPanel(mainWindow);

    const { session, desktopCapturer } = require('electron');
    session.defaultSession.setDisplayMediaRequestHandler(
        (request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
                callback({ video: sources[0], audio: 'loopback' });
            });
        },
        { useSystemPicker: true }
    );

    mainWindow.setContentProtection(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Hide from Windows taskbar
    if (process.platform === 'win32') {
        try {
            mainWindow.setSkipTaskbar(true);
        } catch (error) {
            console.warn('Could not hide from taskbar:', error.message);
        }
    }

    // Hide from Mission Control on macOS
    if (process.platform === 'darwin') {
        try {
            mainWindow.setHiddenInMissionControl(true);
        } catch (error) {
            console.warn('Could not hide from Mission Control:', error.message);
        }
    }

    if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));
    mainWindow.setTitle('System Helper'); // ponytail: innocuous name in Task Manager / Activity Monitor

    // After window is created, initialize keybinds
    mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            let keybinds = defaultKeybinds;

            // Load keybinds from storage
            const savedKeybinds = storage.getKeybinds();
            if (savedKeybinds) {
                keybinds = { ...defaultKeybinds, ...savedKeybinds };
            }

            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }, 150);
    });

    let saveTimeout;
    const saveBounds = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (!mainWindow.isDestroyed()) {
                const bounds = mainWindow.getBounds();
                storage.updateConfig('windowBounds', bounds);
            }
        }, 500);
    };

    mainWindow.on('resize', saveBounds);
    mainWindow.on('move', saveBounds);

    mainWindow.on('hide', () => {
        _hiddenAt = Date.now();
        if (mcqOverlayWindow && !mcqOverlayWindow.isDestroyed()) {
            mcqOverlayWindow.webContents.send('main-window-visibility', false);
        }
        require('./windowsKeyboardHook').stopCapture();
    });
    mainWindow.on('show', () => {
        const hiddenFor = _hiddenAt ? Date.now() - _hiddenAt : 0;
        _hiddenAt = null;
        if (mcqOverlayWindow && !mcqOverlayWindow.isDestroyed()) {
            mcqOverlayWindow.webContents.send('main-window-visibility', true);
        }
        // ponytail: small delay lets Windows renderer finish painting before receiving IPC
        setTimeout(() => {
            mainWindow.webContents.send('window-shown', { hiddenFor });
        }, 80);
    });

    setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);

    return mainWindow;
}

function getDefaultKeybinds() {
    const isMac = process.platform === 'darwin';
    return {
        moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
        moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
        moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
        moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
        toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
        toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
        nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
        previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
        nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
        scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
        scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        emergencyErase: isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
        toggleNortonMode: 'Alt+N',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    console.log('Updating global shortcuts with:', keybinds);

    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX - moveIncrement, currentY);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX + moveIncrement, currentY);
        },
    };

    Object.keys(movementActions).forEach(action => {
        const keybind = keybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
                console.log(`Registered ${action}: ${keybind}`);
            } catch (error) {
                console.error(`Failed to register ${action} (${keybind}):`, error);
            }
        }
    });

    // Register toggle visibility shortcut
    if (keybinds.toggleVisibility) {
        try {
            globalShortcut.register(keybinds.toggleVisibility, () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.showInactive();
                }
            });
            console.log(`Registered toggleVisibility: ${keybinds.toggleVisibility}`);
        } catch (error) {
            console.error(`Failed to register toggleVisibility (${keybinds.toggleVisibility}):`, error);
        }
    }

    // Register toggle Norton Mode shortcut
    if (keybinds.toggleNortonMode) {
        try {
            globalShortcut.register(keybinds.toggleNortonMode, () => {
                console.log('Toggle Norton Mode shortcut triggered');
                mainWindow.webContents.send('toggle-norton-mode');
            });
            console.log(`Registered toggleNortonMode: ${keybinds.toggleNortonMode}`);
        } catch (error) {
            console.error(`Failed to register toggleNortonMode (${keybinds.toggleNortonMode}):`, error);
        }
    }

    // Register toggle click-through shortcut
    if (keybinds.toggleClickThrough) {
        try {
            globalShortcut.register(keybinds.toggleClickThrough, () => {
                mouseEventsIgnored = !mouseEventsIgnored;
                if (mouseEventsIgnored) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    console.log('Mouse events ignored');
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                    console.log('Mouse events enabled');
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
            console.log(`Registered toggleClickThrough: ${keybinds.toggleClickThrough}`);
        } catch (error) {
            console.error(`Failed to register toggleClickThrough (${keybinds.toggleClickThrough}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (keybinds.nextStep) {
        try {
            globalShortcut.register(keybinds.nextStep, async () => {
                console.log('Next step shortcut triggered');
                try {
                    // Determine the shortcut key format
                    const isMac = process.platform === 'darwin';
                    const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';

                    // Use the new handleShortcut function
                    mainWindow.webContents.executeJavaScript(`
                        cheatingDaddy.handleShortcut('${shortcutKey}');
                    `);
                } catch (error) {
                    console.error('Error handling next step shortcut:', error);
                }
            });
            console.log(`Registered nextStep: ${keybinds.nextStep}`);
        } catch (error) {
            console.error(`Failed to register nextStep (${keybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (keybinds.previousResponse) {
        try {
            globalShortcut.register(keybinds.previousResponse, () => {
                console.log('Previous response shortcut triggered');
                sendToRenderer('navigate-previous-response');
            });
            console.log(`Registered previousResponse: ${keybinds.previousResponse}`);
        } catch (error) {
            console.error(`Failed to register previousResponse (${keybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (keybinds.nextResponse) {
        try {
            globalShortcut.register(keybinds.nextResponse, () => {
                console.log('Next response shortcut triggered');
                sendToRenderer('navigate-next-response');
            });
            console.log(`Registered nextResponse: ${keybinds.nextResponse}`);
        } catch (error) {
            console.error(`Failed to register nextResponse (${keybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (keybinds.scrollUp) {
        try {
            globalShortcut.register(keybinds.scrollUp, () => {
                console.log('Scroll up shortcut triggered');
                sendToRenderer('scroll-response-up');
            });
            console.log(`Registered scrollUp: ${keybinds.scrollUp}`);
        } catch (error) {
            console.error(`Failed to register scrollUp (${keybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
    if (keybinds.scrollDown) {
        try {
            globalShortcut.register(keybinds.scrollDown, () => {
                console.log('Scroll down shortcut triggered');
                sendToRenderer('scroll-response-down');
            });
            console.log(`Registered scrollDown: ${keybinds.scrollDown}`);
        } catch (error) {
            console.error(`Failed to register scrollDown (${keybinds.scrollDown}):`, error);
        }
    }

    // Register emergency erase shortcut
    if (keybinds.emergencyErase) {
        try {
            globalShortcut.register(keybinds.emergencyErase, () => {
                console.log('Emergency Erase triggered!');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();

                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    sendToRenderer('clear-sensitive-data');

                    setTimeout(() => {
                        const { app } = require('electron');
                        app.quit();
                    }, 300);
                }
            });
            console.log(`Registered emergencyErase: ${keybinds.emergencyErase}`);
        } catch (error) {
            console.error(`Failed to register emergencyErase (${keybinds.emergencyErase}):`, error);
        }
    }
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    let chatgptLoginWindow = null;
    ipcMain.handle('chatgpt:open-login-window', () => {
        if (chatgptLoginWindow && !chatgptLoginWindow.isDestroyed()) {
            chatgptLoginWindow.focus();
            return { success: true };
        }

        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        chatgptLoginWindow = new BrowserWindow({
            width: 600,
            height: 700,
            minWidth: 400,
            minHeight: 500,
            resizable: true,
            frame: true,
            alwaysOnTop: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                partition: 'persist:chatgpt',
            },
        });

        const userAgent =
            process.platform === 'darwin'
                ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        chatgptLoginWindow.webContents.setUserAgent(userAgent);
        chatgptLoginWindow.loadURL('https://chatgpt.com/auth/login', { userAgent });

        chatgptLoginWindow.on('closed', () => {
            chatgptLoginWindow = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('chatgpt:login-complete');
            }
        });

        return { success: true };
    });

    // Windows only: while a Norton text input is focused, capture keystrokes
    // via a system-wide hook and replay them into the renderer directly, so
    // typing into Norton never makes it the OS foreground window. See
    // src/utils/windowsKeyboardHook.js for why this exists.
    ipcMain.on('text-input-focus', (event, focused) => {
        if (process.platform !== 'win32' || mainWindow.isDestroyed()) return;
        const { startCapture, stopCapture } = require('./windowsKeyboardHook');
        if (focused) {
            startCapture(mainWindow.webContents);
        } else {
            stopCapture();
        }
    });

    ipcMain.on('view-changed', (event, view) => {
        if (!mainWindow.isDestroyed()) {
            if (view !== 'assistant') {
                mainWindow.setIgnoreMouseEvents(false);
            }
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('toggle-window-visibility', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.showInactive();
            }
            if (mcqOverlayWindow && !mcqOverlayWindow.isDestroyed()) {
                mcqOverlayWindow.webContents.send('main-window-visibility', mainWindow.isVisible());
            }
            return { success: true };
        } catch (error) {
            console.error('Error toggling window visibility:', error);
            return { success: false, error: error.message };
        }
    });
}

function createMcqOverlay() {
    if (mcqOverlayWindow && !mcqOverlayWindow.isDestroyed()) return mcqOverlayWindow;

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    mcqOverlayWindow = new BrowserWindow({
        x: Math.round(width / 2 - 210),
        y: height - 70,
        width: 420,
        height: 58,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        hasShadow: false,
        resizable: false,
        skipTaskbar: true,
        ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
        webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    applyNonActivatingPanel(mcqOverlayWindow);
    mcqOverlayWindow.setContentProtection(true);
    mcqOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.platform === 'win32') mcqOverlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mcqOverlayWindow.loadFile(path.join(__dirname, '../assets/mcq-overlay.html'));
    mcqOverlayWindow.setTitle('System Helper');
    mcqOverlayWindow.webContents.once('dom-ready', () => {
        const isVisible = mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef.isVisible() : true;
        mcqOverlayWindow.webContents.send('main-window-visibility', isVisible);
    });
    mcqOverlayWindow.on('closed', () => {
        mcqOverlayWindow = null;
    });
    return mcqOverlayWindow;
}

function destroyMcqOverlay() {
    if (mcqOverlayWindow && !mcqOverlayWindow.isDestroyed()) mcqOverlayWindow.close();
    mcqOverlayWindow = null;
}

module.exports = {
    createWindow,
    getDefaultKeybinds,
    updateGlobalShortcuts,
    setupWindowIpcHandlers,
    createMcqOverlay,
    destroyMcqOverlay,
    getMcqOverlayWindow: () => mcqOverlayWindow,
};
