import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { MainView } from '../views/MainView.js';
import { CustomizeView } from '../views/CustomizeView.js';
import { HelpView } from '../views/HelpView.js';
import { HistoryView } from '../views/HistoryView.js';
import { AssistantView } from '../views/AssistantView.js';
import { OnboardingView } from '../views/OnboardingView.js';
import { AICustomizeView } from '../views/AICustomizeView.js';
import { FeedbackView } from '../views/FeedbackView.js';
import { AdvancedView } from '../views/AdvancedView.js';
import { CVUploadView } from '../views/CVUploadView.js';
import { SystemDesignView } from '../views/SystemDesignView.js';

export class CheatingDaddyApp extends LitElement {
    static styles = css`
        * {
            box-sizing: border-box;
            font-family: var(--font);
            margin: 0;
            padding: 0;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 100%;
            height: 100vh;
            background: var(--bg-app);
            color: var(--text-primary);
        }

        /* ── Full app shell: top bar + sidebar/content ── */

        .app-shell {
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        .top-drag-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            height: 38px;
            background: transparent;
        }

        .drag-region {
            flex: 1;
            height: 100%;
            -webkit-app-region: drag;
        }

        .top-drag-bar.hidden {
            display: none;
        }

        .traffic-lights {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 var(--space-md);
            height: 100%;
            -webkit-app-region: no-drag;
        }

        .traffic-light {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            padding: 0;
            transition: opacity 0.15s ease;
        }

        .traffic-light:hover {
            opacity: 0.8;
        }

        .traffic-light.close {
            background: #ff5f57;
        }

        .traffic-light.minimize {
            background: #febc2e;
        }

        .traffic-light.maximize {
            background: #28c840;
        }

        .sidebar {
            width: var(--sidebar-width);
            min-width: var(--sidebar-width);
            background: var(--bg-surface);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            padding: 42px 0 var(--space-md) 0;
            transition:
                width var(--transition),
                min-width var(--transition),
                opacity var(--transition);
        }

        .sidebar.hidden {
            width: 0;
            min-width: 0;
            padding: 0;
            overflow: hidden;
            border-right: none;
            opacity: 0;
        }

        .sidebar-brand {
            padding: var(--space-sm) var(--space-lg);
            padding-top: var(--space-md);
            margin-bottom: var(--space-lg);
        }

        .sidebar-brand h1 {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            letter-spacing: -0.01em;
        }

        .sidebar-nav {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
            padding: 0 var(--space-sm);
            -webkit-app-region: no-drag;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-sm) var(--space-md);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            transition:
                color var(--transition),
                background var(--transition);
            border: none;
            background: none;
            width: 100%;
            text-align: left;
        }

        .nav-item:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }

        .nav-item.active {
            color: var(--text-primary);
            background: var(--bg-elevated);
        }

        .nav-item svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }

        .sidebar-footer {
            padding: var(--space-sm);
            margin-top: var(--space-sm);
            -webkit-app-region: no-drag;
        }

        .update-btn {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            width: 100%;
            padding: var(--space-sm) var(--space-md);
            border-radius: var(--radius-md);
            border: 1px solid rgba(239, 68, 68, 0.2);
            background: rgba(239, 68, 68, 0.08);
            color: var(--danger);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            text-align: left;
            transition:
                background var(--transition),
                border-color var(--transition);
            animation: update-wobble 5s ease-in-out infinite;
        }

        .update-btn:hover {
            background: rgba(239, 68, 68, 0.14);
            border-color: rgba(239, 68, 68, 0.35);
        }

        @keyframes update-wobble {
            0%,
            90%,
            100% {
                transform: rotate(0deg);
            }
            92% {
                transform: rotate(-2deg);
            }
            94% {
                transform: rotate(2deg);
            }
            96% {
                transform: rotate(-1.5deg);
            }
            98% {
                transform: rotate(1.5deg);
            }
        }

        .update-btn svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }

        .version-text {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            padding: var(--space-xs) var(--space-md);
        }

        /* ── Main content area ── */

        .content {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            background: var(--bg-app);
        }

        /* Live mode top bar */
        .live-bar {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 var(--space-md);
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
            height: 36px;
            -webkit-app-region: drag;
        }

        .live-bar-left {
            display: flex;
            align-items: center;
            -webkit-app-region: no-drag;
            z-index: 1;
        }

        .live-bar-back {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            cursor: pointer;
            background: none;
            border: none;
            padding: var(--space-xs);
            border-radius: var(--radius-sm);
            transition: color var(--transition);
        }

        .live-bar-back:hover {
            color: var(--text-primary);
        }

        .live-bar-back svg {
            width: 14px;
            height: 14px;
        }

        .live-bar-center {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-weight: var(--font-weight-medium);
            white-space: nowrap;
            pointer-events: none;
        }

        .live-bar-right {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            -webkit-app-region: no-drag;
            z-index: 1;
        }

        .live-bar-text {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-family: var(--font-mono);
            white-space: nowrap;
        }

        .live-bar-text.clickable {
            cursor: pointer;
            transition: color var(--transition);
        }

        .live-bar-text.clickable:hover {
            color: var(--text-primary);
        }

        /* Content inner */
        .content-inner {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .content-inner.live {
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* Onboarding fills everything */
        .fullscreen {
            position: fixed;
            inset: 0;
            z-index: 100;
            background: var(--bg-app);
        }

        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        ::-webkit-scrollbar-track {
            background: transparent;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: #444444;
        }

        /* --- Norton Security Overlay Styles --- */
        .norton-mini-btn {
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            z-index: 999999999 !important;
            background: #11294a !important;
            border: 2px solid #e0a900 !important;
            color: #ffffff !important;
            padding: 10px 16px !important;
            border-radius: 30px !important;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3) !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            transition: all 0.2s ease-in-out !important;
            user-select: none !important;
        }

        .norton-mini-btn:hover {
            transform: translateY(-2px) scale(1.03) !important;
            box-shadow: 0 6px 20px rgba(224, 169, 0, 0.4) !important;
            background: #183a68 !important;
        }

        .norton-overlay-backdrop {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.75) !important;
            backdrop-filter: blur(5px) !important;
            z-index: 1000000000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: 'Segoe UI', Arial, sans-serif !important;
        }

        .norton-window {
            width: 820px !important;
            height: 520px !important;
            background: #ffffff !important;
            border-radius: 4px !important;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6) !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            border: 1px solid #444 !important;
            position: relative !important;
        }

        /* Header styling */
        .norton-header {
            background: #162a45 !important;
            height: 40px !important;
            min-height: 40px !important;
            color: #ffffff !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 0 15px !important;
            user-select: none !important;
            border-bottom: 1px solid #112137 !important;
        }

        .norton-header-left {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }

        .norton-header-logo-icon {
            width: 20px !important;
            height: 20px !important;
            background: #ffd000 !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: #162a45 !important;
            font-weight: 900 !important;
            font-size: 14px !important;
        }

        .norton-header-title {
            font-size: 15px !important;
            font-weight: bold !important;
            color: #fff !important;
        }

        .norton-header-title span {
            font-weight: normal !important;
            color: #aaa !important;
            margin-left: 5px !important;
        }

        .norton-header-right {
            display: flex !important;
            align-items: center !important;
            gap: 20px !important;
        }

        .norton-account-btn {
            font-size: 13px !important;
            color: #ddd !important;
            cursor: pointer !important;
        }

        .norton-account-btn:hover {
            color: #fff !important;
        }

        .norton-window-controls {
            display: flex !important;
            gap: 12px !important;
        }

        .norton-ctrl-btn {
            width: 12px !important;
            height: 12px !important;
            font-size: 10px !important;
            color: #aaa !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        .norton-ctrl-btn:hover {
            color: #fff !important;
        }

        /* Secondary header (menus) */
        .norton-menu-bar {
            height: 35px !important;
            background: #f3f3f3 !important;
            border-bottom: 1px solid #e1e1e1 !important;
            display: flex !important;
            justify-content: flex-end !important;
            align-items: center !important;
            padding: 0 15px !important;
            gap: 15px !important;
            font-size: 12px !important;
            color: #555 !important;
        }

        .norton-menu-item {
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
        }

        .norton-menu-item:hover {
            color: #000 !important;
        }

        /* Body Content Area */
        .norton-body {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 20px 25px !important;
            position: relative !important;
            background: #ffffff !important;
        }

        /* Standard Status View */
        .norton-status-view {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 !important;
        }

        .norton-perf-row {
            display: flex !important;
            align-items: center !important;
            gap: 35px !important;
            margin-bottom: 25px !important;
        }

        .norton-dial-container {
            position: relative !important;
            width: 130px !important;
            height: 130px !important;
        }

        .norton-dial-svg {
            transform: rotate(-90deg) !important;
        }

        .norton-dial-bg {
            fill: none !important;
            stroke: #eee !important;
            stroke-width: 10 !important;
        }

        .norton-dial-fill {
            fill: none !important;
            stroke: #2fa13c !important;
            stroke-width: 10 !important;
            stroke-linecap: round !important;
            stroke-dasharray: 314 !important;
            stroke-dashoffset: 60 !important;
        }

        .norton-dial-needle {
            position: absolute !important;
            width: 2px !important;
            height: 55px !important;
            background: #2fa13c !important;
            top: 10px !important;
            left: 64px !important;
            transform-origin: bottom center !important;
            transform: rotate(60deg) !important;
        }

        .norton-status-text {
            flex: 1 !important;
        }

        .norton-status-headline {
            font-size: 26px !important;
            color: #2fa13c !important;
            margin: 0 0 10px 0 !important;
            font-weight: 300 !important;
        }

        .norton-status-detail {
            font-size: 13px !important;
            color: #555 !important;
            margin: 4px 0 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }

        .norton-status-val-green {
            color: #2fa13c !important;
            font-weight: 600 !important;
        }

        .norton-status-val-blue {
            color: #0078d4 !important;
            font-weight: 600 !important;
        }

        .norton-status-val-red {
            color: #d11a2a !important;
            font-weight: 600 !important;
        }

        /* 4 Action Cards Row */
        .norton-action-cards {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 15px !important;
            margin-top: auto !important;
            margin-bottom: 10px !important;
        }

        .norton-card {
            border: 1px solid #eaeaea !important;
            border-radius: 4px !important;
            padding: 15px 10px !important;
            text-align: center !important;
            cursor: pointer !important;
            transition: all 0.15s ease-in-out !important;
            background: #fafafa !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 10px !important;
        }

        .norton-card:hover {
            background: #f0f4f9 !important;
            border-color: #bcd1e6 !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05) !important;
        }

        .norton-card-icon {
            width: 32px !important;
            height: 32px !important;
            color: #666 !important;
        }

        .norton-card:hover .norton-card-icon {
            color: #1a365d !important;
        }

        .norton-card-label {
            font-size: 12px !important;
            color: #333 !important;
            font-weight: 500 !important;
        }

        /* Key Entry Mode Screen */
        .norton-key-view {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 1 !important;
        }

        .norton-lock-icon {
            width: 60px !important;
            height: 60px !important;
            color: #e0a900 !important;
            margin-bottom: 20px !important;
        }

        .norton-key-title {
            font-size: 24px !important;
            font-weight: 600 !important;
            color: #162a45 !important;
            margin: 0 0 8px 0 !important;
        }

        .norton-key-subtitle {
            font-size: 14px !important;
            color: #666 !important;
            margin: 0 0 24px 0 !important;
        }

        .norton-key-input-container {
            width: 320px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 15px !important;
        }

        .norton-key-input {
            width: 100% !important;
            padding: 12px 16px !important;
            border: 2px solid #ccc !important;
            border-radius: 6px !important;
            font-size: 16px !important;
            text-align: center !important;
            font-family: monospace !important;
            letter-spacing: 2px !important;
            transition: border-color 0.2s !important;
            color: #333 !important;
            background: #fff !important;
            outline: none !important;
        }

        .norton-key-input:focus {
            border-color: #162a45 !important;
            box-shadow: 0 0 0 3px rgba(22, 42, 69, 0.15) !important;
        }

        .norton-key-error {
            color: #d83b01 !important;
            font-size: 12px !important;
            min-height: 16px !important;
        }

        /* Bottom Tabs Bar */
        .norton-bottom-bar {
            height: 48px !important;
            min-height: 48px !important;
            background: #eaeaea !important;
            display: flex !important;
            border-top: 1px solid #dcdcdc !important;
        }

        .norton-bottom-tab {
            flex: 1 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 13px !important;
            color: #555 !important;
            cursor: pointer !important;
            border-right: 1px solid #dcdcdc !important;
            font-weight: 500 !important;
            user-select: none !important;
        }

        .norton-bottom-tab:last-child {
            border-right: none !important;
        }

        .norton-bottom-tab:hover {
            background: #f2f2f2 !important;
            color: #000 !important;
        }

        .norton-bottom-tab.active {
            background: #ffffff !important;
            color: #000 !important;
            font-weight: bold !important;
            position: relative !important;
        }

        .norton-bottom-tab.active::after {
            content: '' !important;
            position: absolute !important;
            top: -1px !important;
            left: 0 !important;
            right: 0 !important;
            height: 3px !important;
            background: #e0a900 !important;
            border-radius: 0;
        }

        /* Subscription status bar */
        .norton-sub-bar {
            height: 32px !important;
            background: #ffffff !important;
            border-top: 1px solid #eaeaea !important;
            display: flex !important;
            align-items: center !important;
            padding: 0 15px !important;
            font-size: 11px !important;
            color: #666 !important;
        }

        .norton-sub-status-val {
            color: #2fa13c !important;
            font-weight: bold !important;
            margin-left: 5px !important;
        }

        .norton-sub-status-val.inactive {
            color: #d11a2a !important;
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        isRecording: { type: Boolean },
        sessionActive: { type: Boolean },
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedScreenshotInterval: { type: String },
        selectedImageQuality: { type: String },
        layoutMode: { type: String },
        _viewInstances: { type: Object, state: true },
        _isClickThrough: { state: true },
        _awaitingNewResponse: { state: true },
        shouldAnimateResponse: { type: Boolean },
        _storageLoaded: { state: true },
        _updateAvailable: { state: true },
        _whisperDownloading: { state: true },
        audioCaptureMode: { type: String },
        isManualRecording: { type: Boolean },
        cvFilename: { type: String },
        cvCharCount: { type: Number },
        appMode: { type: String },
        nortonModeActive: { type: Boolean },
        nortonShowKeyEntry: { type: Boolean },
    };

    constructor() {
        super();
        this.currentView = 'main';
        this.statusText = '';
        this.startTime = null;
        this.isRecording = false;
        this.sessionActive = false;
        this.selectedProfile = 'interview';
        this.selectedLanguage = 'en-US';
        this.selectedScreenshotInterval = '5';
        this.selectedImageQuality = 'medium';
        this.layoutMode = 'normal';
        this.responses = [];
        this.currentResponseIndex = -1;
        this._viewInstances = new Map();
        this._isClickThrough = false;
        this._awaitingNewResponse = false;
        this._currentResponseIsComplete = true;
        this.shouldAnimateResponse = false;
        this._storageLoaded = false;
        this._timerInterval = null;
        this._updateAvailable = false;
        this._whisperDownloading = false;
        this._localVersion = '';
        this.audioCaptureMode = 'auto';
        this.isManualRecording = false;
        this.cvFilename = '';
        this.cvCharCount = 0;
        this.appMode = 'interview';
        this.nortonModeActive = false;
        this.nortonShowKeyEntry = false;

        this._loadFromStorage();
        this._checkForUpdates();
    }

    async _checkForUpdates() {
        try {
            this._localVersion = await cheatingDaddy.getVersion();
            this.requestUpdate();

            const res = await fetch('https://raw.githubusercontent.com/sohzm/cheating-daddy/refs/heads/master/package.json');
            if (!res.ok) return;
            const remote = await res.json();
            const remoteVersion = remote.version;

            const toNum = v => v.split('.').map(Number);
            const [rMaj, rMin, rPatch] = toNum(remoteVersion);
            const [lMaj, lMin, lPatch] = toNum(this._localVersion);

            if (rMaj > lMaj || (rMaj === lMaj && rMin > lMin) || (rMaj === lMaj && rMin === lMin && rPatch > lPatch)) {
                this._updateAvailable = true;
                this.requestUpdate();
            }
        } catch (e) {
            // silently ignore
        }
    }

    async _loadFromStorage() {
        try {
            const [config, prefs] = await Promise.all([cheatingDaddy.storage.getConfig(), cheatingDaddy.storage.getPreferences()]);

            this.currentView = config.onboarded ? 'main' : 'onboarding';
            this.selectedProfile = prefs.selectedProfile || 'interview';
            this.selectedLanguage = prefs.selectedLanguage || 'en-US';
            this.selectedScreenshotInterval = prefs.selectedScreenshotInterval || '5';
            this.selectedImageQuality = prefs.selectedImageQuality || 'medium';
            this.layoutMode = config.layout || 'normal';
            this.cvFilename = prefs.cvFilename || '';
            this.cvCharCount = (prefs.cvText || '').length;
            this.appMode = prefs.appMode || 'interview';
            this.nortonModeActive = prefs.nortonModeActive || false;
            this.nortonShowKeyEntry = prefs.nortonShowKeyEntry || false;

            this._storageLoaded = true;
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading from storage:', error);
            this._storageLoaded = true;
            this.requestUpdate();
        }
    }

    connectedCallback() {
        super.connectedCallback();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('new-response', (_, response) => this.addNewResponse(response));
            ipcRenderer.on('update-response', (_, response) => this.updateCurrentResponse(response));
            ipcRenderer.on('update-status', (_, status) => this.setStatus(status));
            ipcRenderer.on('click-through-toggled', (_, isEnabled) => {
                this._isClickThrough = isEnabled;
            });
            ipcRenderer.on('reconnect-failed', (_, data) => this.addNewResponse(data.message));
            ipcRenderer.on('whisper-downloading', (_, downloading) => {
                this._whisperDownloading = downloading;
            });
            ipcRenderer.on('toggle-norton-mode', () => {
                this.nortonModeActive = !this.nortonModeActive;
                this.nortonShowKeyEntry = false;
                this.requestUpdate();
                cheatingDaddy.storage.updatePreference('nortonModeActive', this.nortonModeActive);
                cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', false);
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeAllListeners('new-response');
            ipcRenderer.removeAllListeners('update-response');
            ipcRenderer.removeAllListeners('update-status');
            ipcRenderer.removeAllListeners('click-through-toggled');
            ipcRenderer.removeAllListeners('reconnect-failed');
            ipcRenderer.removeAllListeners('whisper-downloading');
            ipcRenderer.removeAllListeners('toggle-norton-mode');
        }
    }

    // ── Timer ──

    _startTimer() {
        this._stopTimer();
        if (this.startTime) {
            this._timerInterval = setInterval(() => this.requestUpdate(), 1000);
        }
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    getElapsedTime() {
        if (!this.startTime) return '0:00';
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        const pad = n => String(n).padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
        return `${m}:${pad(s)}`;
    }

    // ── Status & Responses ──

    setStatus(text) {
        this.statusText = text;
        if (text.includes('Ready') || text.includes('Listening') || text.includes('Error')) {
            this._currentResponseIsComplete = true;
        }
    }

    addNewResponse(response) {
        const wasOnLatest = this.currentResponseIndex === this.responses.length - 1;
        this.responses = [...this.responses, response];
        if (wasOnLatest || this.currentResponseIndex === -1) {
            this.currentResponseIndex = this.responses.length - 1;
        }
        this._awaitingNewResponse = false;
        this.requestUpdate();
    }

    updateCurrentResponse(response) {
        if (this.responses.length > 0) {
            this.responses = [...this.responses.slice(0, -1), response];
        } else {
            this.addNewResponse(response);
        }
        this.requestUpdate();
    }

    // ── Navigation ──

    navigate(view) {
        this.currentView = view;
        this.requestUpdate();
    }

    async handleClose() {
        if (this.currentView === 'assistant') {
            cheatingDaddy.stopCapture();
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('close-session');
                if (this.selectedProfile === 'mcq') {
                    ipcRenderer.invoke('stop-mcq-overlay');
                }
            }
            window.currentAppMode = null;
            this.sessionActive = false;
            this._stopTimer();
            this.currentView = 'main';
        } else {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('quit-application');
            }
        }
    }

    async _handleMinimize() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('window-minimize');
        }
    }

    async handleHideToggle() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('toggle-window-visibility');
        }
    }

    // ── Session start ──

    async handleStart() {
        const prefs = await cheatingDaddy.storage.getPreferences();
        const providerMode = prefs.providerMode || 'byok';

        if (providerMode === 'cloud') {
            const creds = await cheatingDaddy.storage.getCredentials();
            if (!creds.cloudToken || creds.cloudToken.trim() === '') {
                const mainView = this.shadowRoot.querySelector('main-view');
                if (mainView && mainView.triggerApiKeyError) {
                    mainView.triggerApiKeyError();
                }
                return;
            }

            const success = await cheatingDaddy.initializeCloud(this.selectedProfile);
            if (!success) {
                const mainView = this.shadowRoot.querySelector('main-view');
                if (mainView && mainView.triggerApiKeyError) {
                    mainView.triggerApiKeyError();
                }
                return;
            }
        } else if (providerMode === 'local') {
            const success = await cheatingDaddy.initializeLocal(this.selectedProfile);
            if (!success) {
                const mainView = this.shadowRoot.querySelector('main-view');
                if (mainView && mainView.triggerApiKeyError) {
                    mainView.triggerApiKeyError();
                }
                return;
            }
        } else {
            // 'byok' mode: use Gemini API key
            const apiKey = await cheatingDaddy.storage.getApiKey();
            if (!apiKey || apiKey === '') {
                const mainView = this.shadowRoot.querySelector('main-view');
                if (mainView && mainView.triggerApiKeyError) {
                    mainView.triggerApiKeyError();
                }
                return;
            }

            await cheatingDaddy.initializeGemini(this.selectedProfile, this.selectedLanguage);
        }

        cheatingDaddy.startCapture(this.selectedScreenshotInterval, this.selectedImageQuality);
        this.responses = [];
        this.currentResponseIndex = -1;
        this.startTime = Date.now();
        this.sessionActive = true;
        this.currentView = 'assistant';
        this._startTimer();

        // MCQ overlay
        window.currentAppMode = this.selectedProfile;
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (this.selectedProfile === 'mcq') {
                ipcRenderer.invoke('start-mcq-overlay');
            }
        }
    }

    async handleAPIKeyHelp() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', 'https://cheatingdaddy.com/help/api-key');
        }
    }

    async handleGroqAPIKeyHelp() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', 'https://console.groq.com/keys');
        }
    }

    // ── Settings handlers ──

    async handleProfileChange(profile) {
        this.selectedProfile = profile;
        await cheatingDaddy.storage.updatePreference('selectedProfile', profile);
    }

    async handleLanguageChange(language) {
        this.selectedLanguage = language;
        await cheatingDaddy.storage.updatePreference('selectedLanguage', language);
    }

    async handleScreenshotIntervalChange(interval) {
        this.selectedScreenshotInterval = interval;
        await cheatingDaddy.storage.updatePreference('selectedScreenshotInterval', interval);
    }

    async handleImageQualityChange(quality) {
        this.selectedImageQuality = quality;
        await cheatingDaddy.storage.updatePreference('selectedImageQuality', quality);
    }

    async handleLayoutModeChange(layoutMode) {
        this.layoutMode = layoutMode;
        await cheatingDaddy.storage.updateConfig('layout', layoutMode);
        this.requestUpdate();
    }

    async handleExternalLinkClick(url) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', url);
        }
    }

    async handleSendText(message) {
        const result = await window.cheatingDaddy.sendTextMessage(message);
        if (!result.success) {
            this.setStatus('Error sending message: ' + result.error);
        } else {
            this.setStatus('Message sent...');
            this._awaitingNewResponse = true;
        }
    }

    async handleAudioCaptureModeChange(mode) {
        this.audioCaptureMode = mode;
        this.isManualRecording = false;
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('set-audio-capture-mode', mode);
        }
        this.requestUpdate();
    }

    async handleManualRecordingChange(isRecording) {
        this.isManualRecording = isRecording;
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('toggle-manual-recording', isRecording);
        }
        this.requestUpdate();
    }

    handleResponseIndexChanged(e) {
        this.currentResponseIndex = e.detail.index;
        this.shouldAnimateResponse = false;
        this.requestUpdate();
    }

    handleOnboardingComplete() {
        this.currentView = 'main';
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('currentView') && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('view-changed', this.currentView);
        }
    }

    // ── Helpers ──

    _isLiveMode() {
        return this.currentView === 'assistant';
    }

    // ── Render ──

    renderCurrentView() {
        switch (this.currentView) {
            case 'onboarding':
                return html`
                    <onboarding-view .onComplete=${() => this.handleOnboardingComplete()} .onClose=${() => this.handleClose()}></onboarding-view>
                `;

            case 'main':
                return html`
                    <main-view
                        .selectedProfile=${this.selectedProfile}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                        .onStart=${() => this.handleStart()}
                        .onExternalLink=${url => this.handleExternalLinkClick(url)}
                        .whisperDownloading=${this._whisperDownloading}
                        .cvFilename=${this.cvFilename}
                        .cvCharCount=${this.cvCharCount}
                        .onNavigate=${view => this.navigate(view)}
                    ></main-view>
                `;

            case 'ai-customize':
                return html`
                    <ai-customize-view
                        .selectedProfile=${this.selectedProfile}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                    ></ai-customize-view>
                `;

            case 'customize':
                return html`
                    <customize-view
                        .selectedProfile=${this.selectedProfile}
                        .selectedLanguage=${this.selectedLanguage}
                        .selectedScreenshotInterval=${this.selectedScreenshotInterval}
                        .selectedImageQuality=${this.selectedImageQuality}
                        .layoutMode=${this.layoutMode}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                        .onLanguageChange=${l => this.handleLanguageChange(l)}
                        .onScreenshotIntervalChange=${i => this.handleScreenshotIntervalChange(i)}
                        .onImageQualityChange=${q => this.handleImageQualityChange(q)}
                        .onLayoutModeChange=${lm => this.handleLayoutModeChange(lm)}
                    ></customize-view>
                `;

            case 'feedback':
                return html`<feedback-view></feedback-view>`;

            case 'help':
                return html`<help-view .onExternalLinkClick=${url => this.handleExternalLinkClick(url)}></help-view>`;

            case 'history':
                return html`<history-view></history-view>`;

            case 'system-design':
                return html`<system-design-view></system-design-view>`;

            case 'advanced':
                return html`
                    <advanced-view
                        .appMode=${this.appMode}
                        @mode-changed=${e => {
                            this.appMode = e.detail.mode;
                        }}
                    ></advanced-view>
                `;

            case 'cv-upload':
                return html`
                    <cv-upload-view
                        .cvFilename=${this.cvFilename}
                        .cvCharCount=${this.cvCharCount}
                        .onBack=${() => this.navigate('main')}
                        @cv-updated=${() => this._loadFromStorage()}
                    ></cv-upload-view>
                `;

            case 'assistant':
                return html`
                    <assistant-view
                        .responses=${this.responses}
                        .currentResponseIndex=${this.currentResponseIndex}
                        .selectedProfile=${this.selectedProfile}
                        .onSendText=${msg => this.handleSendText(msg)}
                        .shouldAnimateResponse=${this.shouldAnimateResponse}
                        .audioCaptureMode=${this.audioCaptureMode}
                        .isManualRecording=${this.isManualRecording}
                        @response-index-changed=${this.handleResponseIndexChanged}
                        @audio-capture-mode-changed=${e => this.handleAudioCaptureModeChange(e.detail.mode)}
                        @manual-recording-changed=${e => this.handleManualRecordingChange(e.detail.isRecording)}
                        @response-animation-complete=${() => {
                            this.shouldAnimateResponse = false;
                            this._currentResponseIsComplete = true;
                            this.requestUpdate();
                        }}
                    ></assistant-view>
                `;

            default:
                return html`<div>Unknown view: ${this.currentView}</div>`;
        }
    }

    renderSidebar() {
        const items = [
            {
                id: 'main',
                label: 'Home',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <path
                            d="m19 8.71l-5.333-4.148a2.666 2.666 0 0 0-3.274 0L5.059 8.71a2.67 2.67 0 0 0-1.029 2.105v7.2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.2c0-.823-.38-1.6-1.03-2.105"
                        />
                        <path d="M16 15c-2.21 1.333-5.792 1.333-8 0" />
                    </g>
                </svg>`,
            },
            {
                id: 'ai-customize',
                label: 'AI Customization',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <path
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 3v7h6l-8 11v-7H5z"
                    />
                </svg>`,
            },
            {
                id: 'history',
                label: 'History',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <path
                            d="M10 20.777a9 9 0 0 1-2.48-.969M14 3.223a9.003 9.003 0 0 1 0 17.554m-9.421-3.684a9 9 0 0 1-1.227-2.592M3.124 10.5c.16-.95.468-1.85.9-2.675l.169-.305m2.714-2.941A9 9 0 0 1 10 3.223"
                        />
                        <path d="M12 8v4l3 3" />
                    </g>
                </svg>`,
            },
            {
                id: 'customize',
                label: 'Settings',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <path
                            d="M19.875 6.27A2.23 2.23 0 0 1 21 8.218v7.284c0 .809-.443 1.555-1.158 1.948l-6.75 4.27a2.27 2.27 0 0 1-2.184 0l-6.75-4.27A2.23 2.23 0 0 1 3 15.502V8.217c0-.809.443-1.554 1.158-1.947l6.75-3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98z"
                        />
                        <path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0" />
                    </g>
                </svg>`,
            },
            {
                id: 'advanced',
                label: 'Advanced Settings',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <path
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    />
                </svg>`,
            },
            {
                id: 'system-design',
                label: 'System Design',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                    </g>
                </svg>`,
            },
            {
                id: 'chatgpt-window',
                label: 'ChatGPT',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </g>
                </svg>`,
                action: () => {
                    const { ipcRenderer } = window.require('electron');
                    ipcRenderer.invoke('chatgpt-window:toggle');
                },
            },
            {
                id: 'feedback',
                label: 'Feedback',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9.5 9h.01m4.99 0h.01" />
                        <path d="M9.5 13a3.5 3.5 0 0 0 5 0" />
                    </g>
                </svg>`,
            },
            {
                id: 'help',
                label: 'Help',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9s-9-1.8-9-9s1.8-9 9-9m0 13v.01" />
                        <path d="M12 13a2 2 0 0 0 .914-3.782a1.98 1.98 0 0 0-2.414.483" />
                    </g>
                </svg>`,
            },
        ];

        return html`
            <div class="sidebar ${this._isLiveMode() ? 'hidden' : ''}">
                <div class="sidebar-brand">
                    <h1>Norton 340</h1>
                </div>
                <nav class="sidebar-nav">
                    ${items.map(
                        item => html`
                            <button
                                class="nav-item ${this.currentView === item.id ? 'active' : ''}"
                                @click=${() => (item.action ? item.action() : this.navigate(item.id))}
                                title=${item.label}
                            >
                                ${item.icon} ${item.label}
                            </button>
                        `
                    )}
                </nav>
                <div class="sidebar-footer">
                    ${
                        this._updateAvailable
                            ? html`
                                  <button class="update-btn" @click=${() => this.handleExternalLinkClick('https://cheatingdaddy.com/download')}>
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                          <path
                                              fill="none"
                                              stroke="currentColor"
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                              stroke-width="2"
                                              d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5l5-5m-5-7v12"
                                          />
                                      </svg>
                                      Update available
                                  </button>
                              `
                            : html` <div class="version-text">v${this._localVersion}</div> `
                    }
                </div>
            </div>
        `;
    }

    renderLiveBar() {
        if (!this._isLiveMode()) return '';

        const profileLabels = {
            interview: 'Interview',
            sales: 'Sales Call',
            meeting: 'Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam',
            dsa: 'DSA Interview',
            mcq: 'MCQ',
        };

        return html`
            <div class="live-bar">
                <div class="live-bar-left">
                    <button class="live-bar-back" @click=${() => this.handleClose()} title="End session">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path
                                fill-rule="evenodd"
                                d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </button>
                </div>
                <div class="live-bar-center">${profileLabels[this.selectedProfile] || 'Session'}</div>
                <div class="live-bar-right">
                    ${this.statusText ? html`<span class="live-bar-text">${this.statusText}</span>` : ''}
                    <span class="live-bar-text">${this.getElapsedTime()}</span>
                    ${this._isClickThrough ? html`<span class="live-bar-text">[click through]</span>` : ''}
                    <span
                        class="live-bar-text clickable"
                        style="margin-right: 8px;"
                        @click=${() => {
                        this.nortonModeActive = true;
                        this.nortonShowKeyEntry = false;
                        this.requestUpdate();
                    }}
                        title="Enter Norton Mode"
                        >🛡️</span
                    >
                    <span class="live-bar-text clickable" @click=${() => this.handleHideToggle()}>[hide]</span>
                </div>
            </div>
        `;
    }

    renderNortonOverlay() {
        return html`
            <div class="norton-overlay-backdrop">
                <div class="norton-window">
                    <div class="norton-header">
                        <div class="norton-header-left">
                            <div class="norton-header-logo-icon">✓</div>
                            <div class="norton-header-title">Norton<span>Security</span></div>
                        </div>
                        <div class="norton-header-right">
                            <div class="norton-account-btn">My Account ▾</div>
                            <div class="norton-window-controls">
                                <div class="norton-ctrl-btn" @click=${() => this._handleNortonMinimize()} id="norton-minimize">－</div>
                                <div class="norton-ctrl-btn" @click=${() => this._handleNortonMinimize()} id="norton-maximize">⤢</div>
                                <div class="norton-ctrl-btn" @click=${() => this._handleNortonClose()} id="norton-close">✕</div>
                            </div>
                        </div>
                    </div>

                    <div class="norton-menu-bar">
                        <div class="norton-menu-item">📅 Report Card</div>
                        <div class="norton-menu-item">⚙️ Settings</div>
                        <div class="norton-menu-item">❓ Help</div>
                        <div class="norton-menu-item">🔍</div>
                    </div>

                    <div class="norton-body">
                        ${
                            !this.nortonShowKeyEntry
                                ? html`
                                      <!-- Standard Status View -->
                                      <div class="norton-status-view" id="norton-status-view">
                                          <div class="norton-perf-row">
                                              <div class="norton-dial-container">
                                                  <svg class="norton-dial-svg" width="130" height="130">
                                                      <circle class="norton-dial-bg" cx="65" cy="65" r="50"></circle>
                                                      <circle
                                                          class="norton-dial-fill"
                                                          cx="65"
                                                          cy="65"
                                                          r="50"
                                                          style="stroke: #d11a2a !important;"
                                                      ></circle>
                                                  </svg>
                                                  <div
                                                      class="norton-dial-needle"
                                                      style="transform: rotate(-45deg) !important; background: #d11a2a !important;"
                                                  ></div>
                                              </div>
                                              <div class="norton-status-text">
                                                  <h2 class="norton-status-headline" style="color: #d11a2a !important;">Your PC is at risk</h2>
                                                  <p class="norton-status-detail">
                                                      Security Status: <span class="norton-status-val-red">Inactive</span>
                                                  </p>
                                                  <p class="norton-status-detail">
                                                      Antivirus Protection: <span class="norton-status-val-red">Disabled</span>
                                                  </p>
                                                  <p class="norton-status-detail">
                                                      CPU Usage: <span class="norton-status-val-blue">Norton 0%</span> |
                                                      <span class="norton-status-val-green">System 4%</span>
                                                  </p>
                                              </div>
                                          </div>

                                          <div class="norton-action-cards">
                                              <div
                                                  class="norton-card"
                                                  id="norton-opt-disk"
                                                  @click=${() => {
                                              this.nortonShowKeyEntry = true;
                                              this.requestUpdate();
                                              cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', true);
                                          }}
                                              >
                                                  <svg
                                                      class="norton-card-icon"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      stroke-width="2"
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                  >
                                                      <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                                      <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
                                                      <path d="M3 12A9 3 0 0 0 21 12"></path>
                                                  </svg>
                                                  <span class="norton-card-label">Optimize Disk</span>
                                              </div>
                                              <div
                                                  class="norton-card"
                                                  id="norton-file-clean"
                                                  @click=${() => {
                                              this.nortonShowKeyEntry = true;
                                              this.requestUpdate();
                                              cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', true);
                                          }}
                                              >
                                                  <svg
                                                      class="norton-card-icon"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      stroke-width="2"
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                  >
                                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                      <polyline points="14 2 14 8 20 8"></polyline>
                                                      <line x1="12" y1="18" x2="12" y2="12"></line>
                                                      <line x1="9" y1="15" x2="15" y2="15"></line>
                                                  </svg>
                                                  <span class="norton-card-label">File Cleanup</span>
                                              </div>
                                              <div
                                                  class="norton-card"
                                                  id="norton-startup-mgr"
                                                  @click=${() => {
                                              this.nortonShowKeyEntry = true;
                                              this.requestUpdate();
                                              cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', true);
                                          }}
                                              >
                                                  <svg
                                                      class="norton-card-icon"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      stroke-width="2"
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                  >
                                                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                                                      <line x1="12" y1="2" x2="12" y2="12"></line>
                                                  </svg>
                                                  <span class="norton-card-label">Startup Manager</span>
                                              </div>
                                              <div
                                                  class="norton-card"
                                                  id="norton-graphs"
                                                  @click=${() => {
                                              this.nortonShowKeyEntry = true;
                                              this.requestUpdate();
                                              cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', true);
                                          }}
                                              >
                                                  <svg
                                                      class="norton-card-icon"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      stroke-width="2"
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                  >
                                                      <line x1="18" y1="20" x2="18" y2="10"></line>
                                                      <line x1="12" y1="20" x2="12" y2="4"></line>
                                                      <line x1="6" y1="20" x2="6" y2="14"></line>
                                                  </svg>
                                                  <span class="norton-card-label">Graphs</span>
                                              </div>
                                          </div>
                                      </div>
                                  `
                                : html`
                                      <!-- Key Entry View -->
                                      <div class="norton-key-view" id="norton-key-view">
                                          <svg
                                              class="norton-lock-icon"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              stroke-width="2"
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                          >
                                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                          </svg>
                                          <h2 class="norton-key-title">Purchase Antivirus to start</h2>
                                          <p class="norton-key-subtitle">Please enter your 16-digit antivirus key to continue</p>
                                          <div class="norton-key-input-container">
                                              <input
                                                  type="text"
                                                  class="norton-key-input"
                                                  id="norton-key-input"
                                                  placeholder="XXXX-XXXX-XXXX-XXXX"
                                                  maxlength="19"
                                                  autocomplete="off"
                                                  @input=${e => this.handleNortonKeyInput(e)}
                                              />
                                              <div class="norton-key-error" id="norton-key-error"></div>
                                          </div>
                                      </div>
                                  `
                        }
                    </div>

                    <div class="norton-bottom-bar">
                        <div class="norton-bottom-tab">Security</div>
                        <div class="norton-bottom-tab">Internet Security</div>
                        <div class="norton-bottom-tab">Backup</div>
                        <div class="norton-bottom-tab active">Performance</div>
                        <div class="norton-bottom-tab">My Norton</div>
                    </div>

                    <div class="norton-sub-bar">SUBSCRIPTION STATUS: <span class="norton-sub-status-val inactive">Inactive</span></div>
                </div>
            </div>
        `;
    }

    handleNortonKeyInput(e) {
        let val = e.target.value;
        val = val.replace(/[^a-zA-Z0-9]/g, ''); // Keep alphanumeric

        let formatted = '';
        for (let i = 0; i < val.length && i < 16; i++) {
            if (i > 0 && i % 4 === 0) {
                formatted += '-';
            }
            formatted += val[i];
        }
        e.target.value = formatted.toUpperCase();

        if (val.includes('1525') || formatted.replace(/-/g, '') === '1525') {
            this.nortonModeActive = false;
            this.nortonShowKeyEntry = false;
            this.requestUpdate();
            cheatingDaddy.storage.updatePreference('nortonModeActive', false);
            cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', false);
        }
    }

    _enterNortonMode() {
        this.nortonModeActive = true;
        this.nortonShowKeyEntry = false;
        this.requestUpdate();
        cheatingDaddy.storage.updatePreference('nortonModeActive', true);
        cheatingDaddy.storage.updatePreference('nortonShowKeyEntry', false);
    }

    async _handleNortonMinimize() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('window-minimize');
        }
    }

    async _handleNortonClose() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('quit-application');
        }
    }

    render() {
        // Onboarding is fullscreen, no sidebar
        if (this.currentView === 'onboarding') {
            return html` <div class="fullscreen">${this.renderCurrentView()}</div> `;
        }

        const isLive = this._isLiveMode();

        return html`
            <div class="app-shell">
                <div class="top-drag-bar ${isLive ? 'hidden' : ''}">
                    <div class="traffic-lights">
                        <button class="traffic-light close" @click=${() => this.handleClose()} title="Close"></button>
                        <button class="traffic-light minimize" @click=${() => this._handleMinimize()} title="Minimize"></button>
                        <button class="traffic-light maximize" title="Maximize"></button>
                    </div>
                    <div class="drag-region"></div>
                    <span
                        class="norton-top-btn"
                        @click=${() => this._enterNortonMode()}
                        title="Enter Norton Mode"
                        style="-webkit-app-region: no-drag; cursor: pointer; padding: 8px 12px; margin-right: 8px; font-size: 14px; opacity: 0.6; transition: opacity 0.2s;"
                        @mouseover=${e => (e.target.style.opacity = 1)}
                        @mouseout=${e => (e.target.style.opacity = 0.6)}
                        >🛡️</span
                    >
                </div>
                ${this.renderSidebar()}
                <div class="content">
                    ${isLive ? this.renderLiveBar() : ''}
                    <div class="content-inner ${isLive ? 'live' : ''}">${this.renderCurrentView()}</div>
                </div>
            </div>

            <!-- Norton Mode Overlay -->
            ${this.nortonModeActive ? this.renderNortonOverlay() : ''}
        `;
    }
}

customElements.define('cheating-daddy-app', CheatingDaddyApp);
