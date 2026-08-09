// Windows: set WS_EX_NOACTIVATE on the HWND via User32, so this overlay
// window can receive keyboard/mouse input without ever activating this app -
// whatever app was frontmost underneath (e.g. a fullscreen browser) keeps OS
// focus. macOS gets the equivalent behavior for free via BrowserWindow's
// `type: 'panel'` option (see src/utils/window.js) - Electron's own NSPanel
// implementation already skips activateIgnoringOtherApps for panel windows.
const GWL_EXSTYLE = -20;
const WS_EX_NOACTIVATE = 0x08000000n;

let user32 = null;
function getUser32() {
    if (!user32) {
        const koffi = require('koffi');
        koffi.pointer('HWND', koffi.opaque());
        const lib = koffi.load('user32.dll');
        user32 = {
            GetWindowLongPtrW: lib.func('intptr_t __stdcall GetWindowLongPtrW(HWND hwnd, int index)'),
            SetWindowLongPtrW: lib.func('intptr_t __stdcall SetWindowLongPtrW(HWND hwnd, int index, intptr_t value)'),
        };
    }
    return user32;
}

function applyNonActivatingPanel(win) {
    if (process.platform !== 'win32') return;
    try {
        const hwnd = win.getNativeWindowHandle().readBigUInt64LE();
        const { GetWindowLongPtrW, SetWindowLongPtrW } = getUser32();
        const currentStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, currentStyle | WS_EX_NOACTIVATE);
    } catch (error) {
        console.warn('Could not make window non-activating:', error.message);
    }
}

module.exports = { applyNonActivatingPanel };
