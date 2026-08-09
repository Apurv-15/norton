// Windows-only: captures keystrokes system-wide via a WH_KEYBOARD_LL hook
// while a Norton text input is focused, and replays them directly into the
// renderer's own input pipeline via webContents.sendInputEvent - which
// bypasses OS window routing entirely, so the real foreground app (and its
// OS-level focus) never changes even while the user types into Norton.
//
// Only active while explicitly told a Norton input is focused (see the
// 'text-input-focus' IPC in window.js). Any modified key combo (Ctrl/Alt/Win
// held) is always passed through untouched and never swallowed, so system
// shortcuts (Alt+Tab, Win+*, Ctrl+Alt+Del, etc.) always keep working, and
// Escape always immediately releases capture as a manual escape hatch.
//
// UNVERIFIED ON REAL WINDOWS HARDWARE - this repo has no Windows dev machine.
// Test carefully; a misbehaving low-level keyboard hook can make typing feel
// broken system-wide until unhooked, though it can never survive process exit
// (Windows auto-removes hooks owned by a dead process).
'use strict';

const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12; // Alt
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;
const VK_CAPITAL = 0x14;
const VK_ESCAPE = 0x1b;

const WH_KEYBOARD_LL = 13;
const HC_ACTION = 0;
const WM_KEYDOWN = 0x0100;
const WM_SYSKEYDOWN = 0x0104;

// Keys with no printable character: forwarded as named keyDown/keyUp events.
const NAV_KEYS = {
    0x08: 'Backspace',
    0x09: 'Tab',
    0x0d: 'Enter',
    0x21: 'PageUp',
    0x22: 'PageDown',
    0x23: 'End',
    0x24: 'Home',
    0x25: 'Left',
    0x26: 'Up',
    0x27: 'Right',
    0x28: 'Down',
    0x2e: 'Delete',
};

let win32 = null;
function getWin32() {
    if (win32) return win32;

    const koffi = require('koffi');
    const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
        vkCode: 'uint32_t',
        scanCode: 'uint32_t',
        flags: 'uint32_t',
        time: 'uint32_t',
        dwExtraInfo: 'uintptr_t',
    });
    // lParam is kept as a raw pointer (not auto-decoded) so the exact same
    // value can be forwarded to CallNextHookEx untouched.
    const HookProc = koffi.proto('intptr_t __stdcall HookProc(int nCode, uintptr_t wParam, void *lParam)');

    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    win32 = {
        koffi,
        HookProc,
        KBDLLHOOKSTRUCT,
        SetWindowsHookExW: user32.func('void * __stdcall SetWindowsHookExW(int idHook, void *lpfn, void *hMod, uint32_t threadId)'),
        UnhookWindowsHookEx: user32.func('bool __stdcall UnhookWindowsHookEx(void *hhk)'),
        CallNextHookEx: user32.func('intptr_t __stdcall CallNextHookEx(void *hhk, int nCode, uintptr_t wParam, void *lParam)'),
        GetAsyncKeyState: user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)'),
        GetKeyState: user32.func('int16_t __stdcall GetKeyState(int vKey)'),
        GetKeyboardLayout: user32.func('void * __stdcall GetKeyboardLayout(uint32_t idThread)'),
        ToUnicodeEx: user32.func(
            'int __stdcall ToUnicodeEx(uint32_t vk, uint32_t scanCode, uint8_t *keyState, _Out_ uint16_t *buff, int buffSize, uint32_t flags, void *hkl)'
        ),
        GetModuleHandleW: kernel32.func('void * __stdcall GetModuleHandleW(void *lpModuleName)'),
    };
    return win32;
}

let hookHandle = null;
let callbackId = null;
let targetWebContents = null;
let releaseTimer = null;

function isDown(w32, vk) {
    return (w32.GetAsyncKeyState(vk) & 0x8000) !== 0;
}

function buildKeyState(w32) {
    const state = Buffer.alloc(256);
    if (isDown(w32, VK_SHIFT)) state[VK_SHIFT] = 0x80;
    if (isDown(w32, VK_CONTROL)) state[VK_CONTROL] = 0x80;
    if (isDown(w32, VK_MENU)) state[VK_MENU] = 0x80;
    if (w32.GetKeyState(VK_CAPITAL) & 0x0001) state[VK_CAPITAL] = 0x01;
    return state;
}

// Resolves the actual character a keystroke produces, respecting the active
// keyboard layout and modifier state (so shift/caps/AltGr layouts work).
function charForKey(w32, vkCode, scanCode) {
    const layout = w32.GetKeyboardLayout(0);
    const state = buildKeyState(w32);
    const buff = Buffer.alloc(16);
    const n = w32.ToUnicodeEx(vkCode, scanCode, state, buff, 8, 0, layout);
    if (n <= 0) return null; // 0 = no output, -1 = dead key pending (unsupported)
    return buff.toString('utf16le', 0, n * 2);
}

function hookProc(nCode, wParam, lParamPtr) {
    const w32 = getWin32();
    if (nCode !== HC_ACTION || lParamPtr == null) {
        return w32.CallNextHookEx(null, nCode, wParam, lParamPtr);
    }

    try {
        const { vkCode, scanCode } = w32.koffi.decode(lParamPtr, w32.KBDLLHOOKSTRUCT);

        if (vkCode === VK_ESCAPE) {
            stopCapture();
            return w32.CallNextHookEx(null, nCode, wParam, lParamPtr);
        }

        const isKeyDown = wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN;
        const modified = isDown(w32, VK_CONTROL) || isDown(w32, VK_MENU) || isDown(w32, VK_LWIN) || isDown(w32, VK_RWIN);
        if (!isKeyDown || modified || !targetWebContents || targetWebContents.isDestroyed()) {
            return w32.CallNextHookEx(null, nCode, wParam, lParamPtr);
        }

        const navKey = NAV_KEYS[vkCode];
        if (navKey) {
            targetWebContents.sendInputEvent({ type: 'keyDown', keyCode: navKey });
            targetWebContents.sendInputEvent({ type: 'keyUp', keyCode: navKey });
            return 1;
        }

        const char = charForKey(w32, vkCode, scanCode);
        if (char) {
            targetWebContents.sendInputEvent({ type: 'char', keyCode: char });
            return 1;
        }

        return w32.CallNextHookEx(null, nCode, wParam, lParamPtr);
    } catch (error) {
        console.warn('Keyboard capture hook error:', error.message);
        return w32.CallNextHookEx(null, nCode, wParam, lParamPtr);
    }
}

function startCapture(webContents) {
    if (process.platform !== 'win32') return;
    targetWebContents = webContents;
    if (hookHandle) return; // already installed

    try {
        const w32 = getWin32();
        callbackId = w32.koffi.register(hookProc, w32.koffi.pointer(w32.HookProc));
        const hMod = w32.GetModuleHandleW(null);
        hookHandle = w32.SetWindowsHookExW(WH_KEYBOARD_LL, callbackId, hMod, 0);
        if (!hookHandle) {
            w32.koffi.unregister(callbackId);
            callbackId = null;
            console.warn('Failed to install keyboard capture hook');
            return;
        }
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(stopCapture, 10 * 60 * 1000); // safety net against a missed release
    } catch (error) {
        console.warn('Could not start keyboard capture:', error.message);
        hookHandle = null;
    }
}

function stopCapture() {
    targetWebContents = null;
    clearTimeout(releaseTimer);
    if (!hookHandle) return;
    try {
        const w32 = getWin32();
        w32.UnhookWindowsHookEx(hookHandle);
        if (callbackId !== null) w32.koffi.unregister(callbackId);
    } catch (error) {
        console.warn('Could not stop keyboard capture:', error.message);
    } finally {
        hookHandle = null;
        callbackId = null;
    }
}

module.exports = { startCapture, stopCapture };
