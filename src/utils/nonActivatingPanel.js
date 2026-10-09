// Windows: set WS_EX_NOACTIVATE on the HWND via User32, so this overlay
// window can receive keyboard/mouse input without ever activating this app -
// whatever app was frontmost underneath (e.g. a fullscreen browser) keeps OS
// focus. macOS gets non-activating panel behavior via Objective-C FFI setting
// NSWindowStyleMaskNonactivatingPanel (1 << 7) and related NSPanel properties.

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

function applyWin32NonActivatingPanel(win) {
    try {
        const hwnd = win.getNativeWindowHandle().readBigUInt64LE();
        const { GetWindowLongPtrW, SetWindowLongPtrW } = getUser32();
        const currentStyle = BigInt(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, currentStyle | WS_EX_NOACTIVATE);
    } catch (error) {
        console.warn('Could not make Windows window non-activating:', error.message);
    }
}

let macObjc = null;
function getMacObjc() {
    if (!macObjc) {
        const koffi = require('koffi');
        const lib = koffi.load('/usr/lib/libobjc.dylib');
        const sel = lib.func('void* sel_registerName(const char* str)');
        const objc_msgSend = lib.symbol('objc_msgSend');
        macObjc = {
            sel,
            msgSend: koffi.decode(objc_msgSend, koffi.proto('void* msgSend(void* self, void* op)')),
            msgSendULong: koffi.decode(objc_msgSend, koffi.proto('uintptr_t msgSendULong(void* self, void* op)')),
            msgSendSetULong: koffi.decode(objc_msgSend, koffi.proto('void msgSendSetULong(void* self, void* op, uintptr_t val)')),
            msgSendSetBool: koffi.decode(objc_msgSend, koffi.proto('void msgSendSetBool(void* self, void* op, bool val)')),
        };
    }
    return macObjc;
}

// On macOS, apply deep NSWindow stealth on top of Electron's native NSPanel.
// This hides the window from CGWindowListCopyWindowInfo (used by proctor browsers),
// Mission Control/Exposé, and the application windows menu.
function applyMacNonActivatingPanel(win) {
    try {
        const { sel, msgSendSetULong, msgSendSetBool, msgSendULong } = getMacObjc();

        const hwndBuf = win.getNativeWindowHandle();
        // The native handle buffer contains a pointer-sized integer. On 64-bit
        // macOS this is always a BigUInt64; fall back to UInt32 for safety.
        const nsView = hwndBuf.readBigUInt64LE
            ? Number(hwndBuf.readBigUInt64LE())
            : hwndBuf.readUInt32LE();

        if (!nsView) return;

        // Electron's getNativeWindowHandle() returns a pointer to an NSView on macOS.
        // We must call [view window] to get the actual NSWindow before sending window messages.
        const selWindow = sel('window');
        const nsWindow = msgSendULong(nsView, selWindow);

        if (!nsWindow) return;

        // (We rely on Electron's setContentProtection(true) elsewhere for NSWindowSharingNone)

        // NSWindowCollectionBehaviorCanJoinAllSpaces  = 1  (show on every Space)
        // NSWindowCollectionBehaviorStationary        = 16 (invisible to Exposé / Mission Control)
        // NSWindowCollectionBehaviorFullScreenAuxiliary = 256 (stays visible over fullscreen apps)
        const selSetCollBehavior = sel('setCollectionBehavior:');
        msgSendSetULong(nsWindow, selSetCollBehavior, 1 | 16 | 256);

        // Removed _setExcludedFromWindowsMenu: as it crashes on ElectronNSPanel
    } catch (e) {
        // FFI failures are non-fatal; the window still works, just with less stealth.
        console.warn('[nonActivatingPanel] macOS FFI warning:', e.message);
    }
}

function applyNonActivatingPanel(win) {
    if (!win) return;
    if (process.platform === 'win32') {
        applyWin32NonActivatingPanel(win);
    } else if (process.platform === 'darwin') {
        applyMacNonActivatingPanel(win);
    }
}

module.exports = { applyNonActivatingPanel };
