import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class MainView extends LitElement {
    static styles = css`
        * {
            font-family: var(--font);
            cursor: default;
            user-select: none;
            box-sizing: border-box;
        }

        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-xl) var(--space-lg);
        }

        .form-wrapper {
            width: 100%;
            max-width: 420px;
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
        }

        .page-title {
            font-size: var(--font-size-xl);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            margin-bottom: var(--space-xs);
        }

        .page-title .mode-suffix {
            opacity: 0.5;
        }

        .page-subtitle {
            font-size: var(--font-size-sm);
            color: var(--text-muted);
            margin-bottom: var(--space-md);
        }

        /* ── Cloud promo card ── */

        .cloud-promo {
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 14px 16px;
            border-radius: var(--radius-md);
            border: 1px solid rgba(59, 130, 246, 0.45);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(139, 92, 246, 0.09) 100%);
            cursor: pointer;
            transition:
                border-color 0.2s,
                background 0.2s;
        }

        .cloud-promo:hover {
            border-color: rgba(59, 130, 246, 0.65);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(139, 92, 246, 0.12) 100%);
            box-shadow:
                0 0 20px rgba(59, 130, 246, 0.15),
                0 0 40px rgba(139, 92, 246, 0.08);
        }

        .cloud-promo-glow {
            position: absolute;
            top: -40%;
            right: -20%;
            width: 120px;
            height: 120px;
            background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
            pointer-events: none;
        }

        .cloud-promo-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .cloud-promo-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
        }

        .cloud-promo-arrow {
            color: var(--accent);
            font-size: 16px;
            transition: transform 0.2s;
        }

        .cloud-promo:hover .cloud-promo-arrow {
            transform: translateX(2px);
        }

        .cloud-promo-desc {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            line-height: var(--line-height);
        }

        /* ── Form controls ── */

        .form-group {
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
        }

        .form-label {
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        input,
        select,
        textarea {
            background: var(--bg-elevated);
            color: var(--text-primary);
            border: 1px solid var(--border);
            padding: 10px 12px;
            width: 100%;
            border-radius: var(--radius-sm);
            font-size: var(--font-size-sm);
            font-family: var(--font);
            transition:
                border-color var(--transition),
                box-shadow var(--transition);
        }

        input:hover:not(:focus),
        select:hover:not(:focus),
        textarea:hover:not(:focus) {
            border-color: var(--text-muted);
        }

        input:focus,
        select:focus,
        textarea:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 1px var(--accent);
        }

        input::placeholder,
        textarea::placeholder {
            color: var(--text-muted);
        }

        input.error {
            border-color: var(--danger, #ef4444);
        }

        select {
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23999' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
            background-position: right 8px center;
            background-repeat: no-repeat;
            background-size: 14px;
            padding-right: 28px;
        }

        textarea {
            resize: vertical;
            min-height: 80px;
            line-height: var(--line-height);
        }

        .form-hint {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .form-hint a,
        .form-hint span.link {
            color: var(--accent);
            text-decoration: none;
            cursor: pointer;
        }

        .form-hint span.link:hover {
            text-decoration: underline;
        }

        .whisper-label-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .whisper-spinner {
            width: 12px;
            height: 12px;
            border: 2px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: whisper-spin 0.8s linear infinite;
        }

        @keyframes whisper-spin {
            to {
                transform: rotate(360deg);
            }
        }

        /* ── Start button ── */

        .start-button {
            position: relative;
            overflow: hidden;
            background: #e8e8e8;
            color: #111111;
            border: none;
            padding: 12px var(--space-md);
            border-radius: var(--radius-sm);
            font-size: var(--font-size-base);
            font-weight: var(--font-weight-semibold);
            cursor: pointer;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
        }

        .start-button canvas.btn-aurora {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
        }

        .start-button canvas.btn-dither {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            opacity: 0.1;
            mix-blend-mode: overlay;
            pointer-events: none;
            image-rendering: pixelated;
        }

        .start-button .btn-label {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            gap: var(--space-sm);
        }

        .start-button:hover {
            opacity: 0.9;
        }

        .start-button.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .start-button.disabled:hover {
            opacity: 0.5;
        }

        .shortcut-hint {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            opacity: 0.5;
            font-family: var(--font-mono);
        }

        /* ── Divider ── */

        .divider {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            margin: var(--space-sm) 0;
        }

        .divider-line {
            flex: 1;
            height: 1px;
            background: var(--border);
        }

        .divider-text {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            text-transform: lowercase;
        }

        /* ── Mode switch links ── */

        .mode-links {
            display: flex;
            justify-content: center;
            gap: var(--space-lg);
        }

        .mode-link {
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            transition: color var(--transition);
        }

        .mode-link:hover {
            color: var(--text-primary);
        }

        /* ── Mode option cards ── */

        .mode-cards {
            display: flex;
            gap: var(--space-sm);
        }

        .mode-card {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            background: var(--bg-elevated);
            cursor: pointer;
            transition:
                border-color 0.2s,
                background 0.2s;
        }

        .mode-card:hover {
            border-color: var(--text-muted);
            background: var(--bg-hover);
        }

        .mode-card-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
        }

        .mode-card-desc {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            line-height: var(--line-height);
        }

        /* ── Title row with help ── */

        .title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--space-xs);
        }

        .title-row .page-title {
            margin-bottom: 0;
        }

        .help-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: 4px;
            border-radius: var(--radius-sm);
            transition: color 0.2s;
            display: flex;
            align-items: center;
        }

        .help-btn:hover {
            color: var(--text-secondary);
        }

        .help-btn * {
            pointer-events: none;
        }

        /* ── Help content ── */

        .help-content {
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
            max-height: 500px;
            overflow-y: auto;
        }

        .help-section {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .help-section-title {
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
        }

        .help-section-text {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            line-height: var(--line-height);
        }

        .help-code {
            font-family: var(--font-mono);
            font-size: 11px;
            background: var(--bg-hover);
            padding: 6px 8px;
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            display: block;
        }

        .help-link {
            color: var(--accent);
            cursor: pointer;
            text-decoration: none;
        }

        .help-link:hover {
            text-decoration: underline;
        }

        .help-models {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .help-model {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            display: flex;
            justify-content: space-between;
        }

        .help-model-name {
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-primary);
        }

        .help-divider {
            border: none;
            border-top: 1px solid var(--border);
            margin: 0;
        }

        .help-cloud-btn {
            background: #e8e8e8;
            color: #111111;
            border: none;
            padding: 10px var(--space-md);
            border-radius: var(--radius-sm);
            font-size: var(--font-size-sm);
            font-family: var(--font);
            font-weight: var(--font-weight-semibold);
            cursor: pointer;
            width: 100%;
            transition: opacity 0.15s;
        }

        .help-cloud-btn:hover {
            opacity: 0.9;
        }

        .help-warn {
            font-size: var(--font-size-xs);
            color: var(--warning);
            line-height: var(--line-height);
        }

        .cv-card {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg-elevated);
            padding: 12px 14px;
            cursor: pointer;
            transition:
                border-color var(--transition),
                background var(--transition);
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: var(--space-xs);
        }

        .cv-card:hover {
            border-color: var(--border-strong);
            background: var(--bg-hover);
        }

        .cv-card.active {
            border-color: rgba(34, 197, 94, 0.4);
            background: rgba(34, 197, 94, 0.03);
        }

        .cv-card-header {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
        }

        .cv-card-icon {
            width: 16px;
            height: 16px;
            color: var(--text-secondary);
        }

        .cv-card.active .cv-card-icon {
            color: var(--success, #22c55e);
        }

        .cv-card-title {
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-semibold);
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .cv-card.active .cv-card-title {
            color: var(--success, #22c55e);
        }

        .cv-card-body {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .cv-card-filename {
            font-weight: var(--font-weight-medium);
            color: var(--text-primary);
        }

        /* ── Multi-Key Failover ── */
        .keys-accordion {
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
            margin-top: 4px;
        }

        .keys-toggle-btn {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 7px 10px;
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all var(--transition);
        }

        .keys-toggle-btn:hover {
            color: var(--text-primary);
            border-color: var(--border-strong);
            background: var(--bg-hover);
        }

        .keys-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: 12px;
            margin-top: 4px;
        }

        .key-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .key-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
        }

        .key-title {
            color: var(--text-secondary);
            font-weight: var(--font-weight-medium);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .key-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: var(--font-weight-medium);
        }

        .key-badge.active {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .key-badge.backup {
            background: rgba(255, 255, 255, 0.06);
            color: var(--text-muted);
            border: 1px solid var(--border);
        }

        .key-badge.locked {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .key-input-wrap {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .key-unlock-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            color: var(--text-primary);
            border-radius: var(--radius-sm);
            padding: 9px 10px;
            font-size: 11px;
            cursor: pointer;
            white-space: nowrap;
            transition: all var(--transition);
        }

        .key-unlock-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: var(--border-strong);
        }

        .keys-footer-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 4px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
    `;

    static properties = {
        onStart: { type: Function },
        onExternalLink: { type: Function },
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        isInitializing: { type: Boolean },
        whisperDownloading: { type: Boolean },
        onNavigate: { type: Function },
        cvFilename: { type: String },
        cvCharCount: { type: Number },
        // Internal state
        _mode: { state: true },
        _token: { state: true },
        _geminiKey: { state: true },
        _geminiKeys: { state: true },
        _lockedKeys: { state: true },
        _showBackupKeys: { state: true },
        _groqKey: { state: true },
        _deepgramKey: { state: true },
        _openrouterKey: { state: true },
        _openrouterModel: { state: true },
        _openaiKey: { state: true },
        _tokenError: { state: true },
        _keyError: { state: true },
        // Local AI state
        _ollamaHost: { state: true },
        _ollamaModel: { state: true },
        _whisperModel: { state: true },
        _showLocalHelp: { state: true },
    };

    constructor() {
        super();
        this.onStart = () => {};
        this.onExternalLink = () => {};
        this.selectedProfile = 'interview';
        this.onProfileChange = () => {};
        this.isInitializing = false;
        this.whisperDownloading = false;
        this.onNavigate = () => {};
        this.cvFilename = '';
        this.cvCharCount = 0;

        this._mode = 'byok';
        this._token = '';
        this._geminiKey = '';
        this._geminiKeys = ['', '', '', '', ''];
        this._lockedKeys = {};
        this._showBackupKeys = false;
        this._groqKey = '';
        this._deepgramKey = '';
        this._openrouterKey = '';
        this._openrouterModel = 'meta-llama/llama-3.3-70b-instruct';
        this._openaiKey = '';
        this._tokenError = false;
        this._keyError = false;
        this._showLocalHelp = false;
        this._ollamaHost = 'http://127.0.0.1:11434';
        this._ollamaModel = 'llama3.1';
        this._whisperModel = 'Xenova/whisper-small';

        this._animId = null;
        this._time = 0;
        this._mouseX = -1;
        this._mouseY = -1;

        this.boundKeydownHandler = this._handleKeydown.bind(this);
        this._loadFromStorage();
    }

    async _loadFromStorage() {
        try {
            const [prefs, creds] = await Promise.all([
                cheatingDaddy.storage.getPreferences(),
                cheatingDaddy.storage.getCredentials().catch(() => ({})),
            ]);

            const storedMode = prefs.providerMode || 'byok';
            this._mode = storedMode === 'cloud' ? 'byok' : storedMode;

            if (storedMode === 'cloud') {
                await cheatingDaddy.storage.updatePreference('providerMode', this._mode);
            }

            // Load keys
            this._token = creds.cloudToken || '';
            this._geminiKeys = (await cheatingDaddy.storage.getGeminiApiKeys().catch(() => ['', '', '', '', ''])) || ['', '', '', '', ''];
            this._geminiKey = this._geminiKeys[0] || (await cheatingDaddy.storage.getApiKey().catch(() => '')) || '';
            this._lockedKeys = (await cheatingDaddy.storage.getLockedKeys().catch(() => ({}))) || {};
            this._groqKey = (await cheatingDaddy.storage.getGroqApiKey().catch(() => '')) || '';
            this._deepgramKey = (await cheatingDaddy.storage.getDeepgramApiKey().catch(() => '')) || '';
            this._openrouterKey = (await cheatingDaddy.storage.getOpenrouterApiKey().catch(() => '')) || '';
            this._openrouterModel = prefs.openrouterModel || 'meta-llama/llama-3.3-70b-instruct';
            this._openaiKey = creds.openaiKey || '';

            // Load local AI settings
            this._ollamaHost = prefs.ollamaHost || 'http://127.0.0.1:11434';
            this._ollamaModel = prefs.ollamaModel || 'llama3.1';
            this._whisperModel = prefs.whisperModel || 'Xenova/whisper-small';

            this.requestUpdate();
        } catch (e) {
            console.error('Error loading MainView storage:', e);
        }
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this.boundKeydownHandler);
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            this._keyLockedHandler = (event, data) => {
                cheatingDaddy.storage.getLockedKeys().then(locked => {
                    this._lockedKeys = locked || {};
                    this.requestUpdate();
                });
            };
            ipcRenderer.on('key-locked', this._keyLockedHandler);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this.boundKeydownHandler);
        if (window.require && this._keyLockedHandler) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeListener('key-locked', this._keyLockedHandler);
        }
        if (this._animId) cancelAnimationFrame(this._animId);
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('_mode')) {
            // Stop old animation when switching modes
            if (this._animId) {
                cancelAnimationFrame(this._animId);
                this._animId = null;
            }
        }
    }

    _initButtonAurora() {
        const btn = this.shadowRoot.querySelector('.start-button');
        const aurora = this.shadowRoot.querySelector('canvas.btn-aurora');
        const dither = this.shadowRoot.querySelector('canvas.btn-dither');
        if (!aurora || !dither || !btn) return;

        // Mouse tracking
        this._mouseX = -1;
        this._mouseY = -1;
        btn.addEventListener('mousemove', e => {
            const rect = btn.getBoundingClientRect();
            this._mouseX = (e.clientX - rect.left) / rect.width;
            this._mouseY = (e.clientY - rect.top) / rect.height;
        });
        btn.addEventListener('mouseleave', () => {
            this._mouseX = -1;
            this._mouseY = -1;
        });

        // Dither
        const blockSize = 8;
        const cols = Math.ceil(aurora.offsetWidth / blockSize);
        const rows = Math.ceil(aurora.offsetHeight / blockSize);
        dither.width = cols;
        dither.height = rows;
        const dCtx = dither.getContext('2d');
        const img = dCtx.createImageData(cols, rows);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() > 0.5 ? 255 : 0;
            img.data[i] = v;
            img.data[i + 1] = v;
            img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        dCtx.putImageData(img, 0, 0);

        // Aurora
        const ctx = aurora.getContext('2d');
        const scale = 0.4;
        aurora.width = Math.floor(aurora.offsetWidth * scale);
        aurora.height = Math.floor(aurora.offsetHeight * scale);

        const blobs = [
            { color: [120, 160, 230], x: 0.1, y: 0.3, vx: 0.25, vy: 0.2, phase: 0 },
            { color: [150, 120, 220], x: 0.8, y: 0.5, vx: -0.2, vy: 0.25, phase: 1.5 },
            { color: [200, 140, 210], x: 0.5, y: 0.6, vx: 0.18, vy: -0.22, phase: 3.0 },
            { color: [100, 190, 190], x: 0.3, y: 0.7, vx: 0.3, vy: 0.15, phase: 4.5 },
            { color: [220, 170, 130], x: 0.7, y: 0.4, vx: -0.22, vy: -0.25, phase: 6.0 },
        ];

        const draw = () => {
            this._time += 0.008;
            const w = aurora.width;
            const h = aurora.height;
            const maxDim = Math.max(w, h);

            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, w, h);

            const hovering = this._mouseX >= 0;

            for (const blob of blobs) {
                const t = this._time;
                const cx = (blob.x + Math.sin(t * blob.vx + blob.phase) * 0.4) * w;
                const cy = (blob.y + Math.cos(t * blob.vy + blob.phase * 0.7) * 0.4) * h;
                const r = maxDim * 0.45;

                let boost = 1;
                if (hovering) {
                    const dx = cx / w - this._mouseX;
                    const dy = cy / h - this._mouseY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    boost = 1 + 2.5 * Math.max(0, 1 - dist / 0.6);
                }

                const a0 = Math.min(1, 0.18 * boost);
                const a1 = Math.min(1, 0.08 * boost);
                const a2 = Math.min(1, 0.02 * boost);

                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                grad.addColorStop(0, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a0})`);
                grad.addColorStop(0.3, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a1})`);
                grad.addColorStop(0.6, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a2})`);
                grad.addColorStop(1, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
            }

            this._animId = requestAnimationFrame(draw);
        };

        draw();
    }

    _handleKeydown(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            this._handleStart();
        }
    }

    // ── Persistence ──

    async _saveMode(mode) {
        this._mode = mode;
        this._tokenError = false;
        this._keyError = false;
        await cheatingDaddy.storage.updatePreference('providerMode', mode);
        this.requestUpdate();
    }

    async _saveToken(val) {
        this._token = val;
        this._tokenError = false;
        try {
            const creds = await cheatingDaddy.storage.getCredentials().catch(() => ({}));
            await cheatingDaddy.storage.setCredentials({ ...creds, cloudToken: val });
        } catch (e) {}
        this.requestUpdate();
    }

    async _saveGeminiKey(val) {
        this._geminiKey = val;
        this._keyError = false;
        if (!this._geminiKeys) this._geminiKeys = ['', '', '', '', ''];
        this._geminiKeys[0] = val;
        await cheatingDaddy.storage.setGeminiApiKeys(this._geminiKeys);
        this.requestUpdate();
    }

    async _saveGeminiKeyIndex(index, val) {
        if (!this._geminiKeys) this._geminiKeys = ['', '', '', '', ''];
        this._geminiKeys = [...this._geminiKeys];
        this._geminiKeys[index] = val;
        if (index === 0) {
            this._geminiKey = val;
            this._keyError = false;
        }
        await cheatingDaddy.storage.setGeminiApiKeys(this._geminiKeys);
        this.requestUpdate();
    }

    async _unlockKey(key) {
        if (!key) return;
        await cheatingDaddy.storage.unlockKey(key);
        this._lockedKeys = (await cheatingDaddy.storage.getLockedKeys().catch(() => ({}))) || {};
        this.requestUpdate();
    }

    async _resetAllLocks() {
        await cheatingDaddy.storage.resetKeyLocks();
        this._lockedKeys = {};
        this.requestUpdate();
    }

    _toggleBackupKeys() {
        this._showBackupKeys = !this._showBackupKeys;
        this.requestUpdate();
    }

    async _saveGroqKey(val) {
        this._groqKey = val;
        await cheatingDaddy.storage.setGroqApiKey(val);
        this.requestUpdate();
    }

    async _saveOpenrouterKey(val) {
        this._openrouterKey = val;
        await cheatingDaddy.storage.setOpenrouterApiKey(val);
        this.requestUpdate();
    }

    async _saveOpenrouterModel(val) {
        this._openrouterModel = val;
        await cheatingDaddy.storage.updatePreference('openrouterModel', val);
        this.requestUpdate();
    }

    async _saveDeepgramKey(val) {
        this._deepgramKey = val;
        this._keyError = false;
        await cheatingDaddy.storage.setDeepgramApiKey(val);
        this.requestUpdate();
    }

    async _saveOpenaiKey(val) {
        this._openaiKey = val;
        try {
            const creds = await cheatingDaddy.storage.getCredentials().catch(() => ({}));
            await cheatingDaddy.storage.setCredentials({ ...creds, openaiKey: val });
        } catch (e) {}
        this.requestUpdate();
    }

    async _saveOllamaHost(val) {
        this._ollamaHost = val;
        await cheatingDaddy.storage.updatePreference('ollamaHost', val);
        this.requestUpdate();
    }

    async _saveOllamaModel(val) {
        this._ollamaModel = val;
        await cheatingDaddy.storage.updatePreference('ollamaModel', val);
        this.requestUpdate();
    }

    async _saveWhisperModel(val) {
        this._whisperModel = val;
        await cheatingDaddy.storage.updatePreference('whisperModel', val);
        this.requestUpdate();
    }

    _handleProfileChange(e) {
        this.onProfileChange(e.target.value);
    }

    // ── Start ──

    _handleStart() {
        if (this.isInitializing) return;

        if (this._mode === 'byok') {
            if (!this._geminiKey.trim() && !this._deepgramKey.trim()) {
                this._keyError = true;
                this.requestUpdate();
                return;
            }
        } else if (this._mode === 'local') {
            // Local mode doesn't need API keys, just Ollama host
            if (!this._ollamaHost.trim()) {
                return;
            }
        }

        this.onStart();
    }

    triggerApiKeyError() {
        this._keyError = this._mode !== 'local';
        this.requestUpdate();
        setTimeout(() => {
            this._tokenError = false;
            this._keyError = false;
            this.requestUpdate();
        }, 2000);
    }

    // ── Render helpers ──

    _renderStartButton() {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        const cmdIcon = html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path
                d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"
            />
        </svg>`;
        const ctrlIcon = html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M6 15l6-6 6 6" />
        </svg>`;
        const enterIcon = html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M9 10l-5 5 5 5" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>`;

        return html`
            <button class="start-button ${this.isInitializing ? 'disabled' : ''}" @click=${() => this._handleStart()}>
                <canvas class="btn-aurora"></canvas>
                <canvas class="btn-dither"></canvas>
                <span class="btn-label">
                    Start Session
                    <span class="shortcut-hint">${isMac ? cmdIcon : ctrlIcon}${enterIcon}</span>
                </span>
            </button>
        `;
    }

    _renderDivider() {
        return html`
            <div class="divider">
                <div class="divider-line"></div>
                <span class="divider-text">or</span>
                <div class="divider-line"></div>
            </div>
        `;
    }

    // ── Cloud mode ──
    // Cloud UI intentionally disabled. Backend cloud wiring is still present in
    // the codebase, but the renderer no longer exposes this setup path.

    // ── BYOK mode ──

    _renderByokMode() {
        return html`
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label class="form-label">Gemini API Key (Primary #1)</label>
                    ${
                        this._lockedKeys[this._geminiKeys[0]] && this._lockedKeys[this._geminiKeys[0]].locked
                            ? html`<span class="key-badge locked">🔒 Rate Limited</span>`
                            : this._geminiKeys[0]
                              ? html`<span class="key-badge active">🟢 Ready</span>`
                              : ''
                    }
                </div>
                <div class="key-input-wrap">
                    <input
                        type="password"
                        placeholder="Required (Key #1)"
                        .value=${this._geminiKeys[0] || this._geminiKey || ''}
                        @input=${e => this._saveGeminiKeyIndex(0, e.target.value)}
                        class=${this._keyError ? 'error' : ''}
                        style="flex: 1;"
                    />
                    ${
                        this._lockedKeys[this._geminiKeys[0]] && this._lockedKeys[this._geminiKeys[0]].locked
                            ? html`<button class="key-unlock-btn" @click=${() => this._unlockKey(this._geminiKeys[0])} title="Unlock this key">
                                  Unlock
                              </button>`
                            : ''
                    }
                </div>
                <div class="form-hint" style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                    <span class="link" @click=${() => this.onExternalLink('https://aistudio.google.com/apikey')}>Get Gemini key</span>
                    <span style="color: var(--text-muted); font-size: 11px;">
                        ${this._geminiKeys.filter(k => k && k.trim()).length} of 5 keys configured
                    </span>
                </div>

                <!-- Multi-key failover accordion (Keys 2-5) -->
                <div class="keys-accordion">
                    <button class="keys-toggle-btn" @click=${() => this._toggleBackupKeys()}>
                        <span>🔄 Multi-Key Auto Failover (${this._geminiKeys.filter(k => k && k.trim()).length}/5 active)</span>
                        <span>${this._showBackupKeys ? '▲ Hide' : '▼ Manage 5 Keys'}</span>
                    </button>

                    ${
                        this._showBackupKeys
                            ? html`
                                  <div class="keys-list">
                                      ${[1, 2, 3, 4].map(idx => {
                                          const keyVal = this._geminiKeys[idx] || '';
                                          const isLocked = keyVal && this._lockedKeys[keyVal] && this._lockedKeys[keyVal].locked;
                                          const lockReason = isLocked ? this._lockedKeys[keyVal].reason : '';
                                          return html`
                                              <div class="key-row">
                                                  <div class="key-header">
                                                      <span class="key-title"> Backup Key #${idx + 1} </span>
                                                      ${
                                                          isLocked
                                                              ? html`<span class="key-badge locked" title=${lockReason || 'Quota / Rate Limit'}
                                                                    >🔒 Locked (Rate Limit)</span
                                                                >`
                                                              : keyVal
                                                                ? html`<span class="key-badge backup">⚪ Backup Ready</span>`
                                                                : html`<span style="color: var(--text-muted); font-size: 10px;">Empty</span>`
                                                      }
                                                  </div>
                                                  <div class="key-input-wrap">
                                                      <input
                                                          type="password"
                                                          placeholder="Optional Backup Gemini Key #${idx + 1}"
                                                          .value=${keyVal}
                                                          @input=${e => this._saveGeminiKeyIndex(idx, e.target.value)}
                                                          style="flex: 1;"
                                                      />
                                                      ${
                                                          isLocked
                                                              ? html`<button
                                                                    class="key-unlock-btn"
                                                                    @click=${() => this._unlockKey(keyVal)}
                                                                    title="Unlock this key"
                                                                >
                                                                    Unlock
                                                                </button>`
                                                              : ''
                                                      }
                                                  </div>
                                              </div>
                                          `;
                                      })}

                                      <div class="keys-footer-row">
                                          <span style="font-size: 11px; color: var(--text-muted);">
                                              Auto-rotates instantly when rate limit (429) or quota is hit.
                                          </span>
                                          <button class="key-unlock-btn" @click=${() => this._resetAllLocks()}>Reset All Locks</button>
                                      </div>
                                  </div>
                              `
                            : ''
                    }
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Deepgram API Key</label>
                <input
                    type="password"
                    placeholder="Optional (for ultra-fast live transcription)"
                    .value=${this._deepgramKey}
                    @input=${e => this._saveDeepgramKey(e.target.value)}
                    class=${this._keyError ? 'error' : ''}
                />
                <div class="form-hint">
                    <span class="link" @click=${() => this.onExternalLink('https://console.deepgram.com/')}>Get Deepgram key</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">OpenRouter API Key (Open Source AI Backup)</label>
                <input
                    type="password"
                    placeholder="Optional (Llama 3.3, DeepSeek, Gemini 2.0 Free)"
                    .value=${this._openrouterKey}
                    @input=${e => this._saveOpenrouterKey(e.target.value)}
                />
                <div class="form-hint" style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="link" @click=${() => this.onExternalLink('https://openrouter.ai/keys')}>Get OpenRouter key</span>
                    <select
                        .value=${this._openrouterModel}
                        @change=${e => this._saveOpenrouterModel(e.target.value)}
                        style="padding:2px 6px;font-size:11px;background:rgba(0,0,0,0.3);border:1px solid var(--border);color:var(--text-secondary);border-radius:4px;"
                    >
                        <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (Fast & Smart)</option>
                        <option value="deepseek/deepseek-chat">DeepSeek V3 (Top Reasoning)</option>
                        <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash (Unlimited)</option>
                        <option value="qwen/qwen-2.5-72b-instruct">Qwen 2.5 72B (Coding/DSA)</option>
                        <option value="mistralai/mistral-small-24b-instruct-2501">Mistral Small 24B</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Groq API Key</label>
                <input type="password" placeholder="Optional" .value=${this._groqKey} @input=${e => this._saveGroqKey(e.target.value)} />
                <div class="form-hint">
                    <span class="link" @click=${() => this.onExternalLink('https://console.groq.com/keys')}>Get Groq key</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Mode</label>
                <select @change=${this._handleProfileChange}>
                    ${[
                        ['interview', 'Job Interview'],
                        ['sales', 'Sales Call'],
                        ['meeting', 'Business Meeting'],
                        ['presentation', 'Presentation'],
                        ['negotiation', 'Negotiation'],
                        ['exam', 'Exam Assistant'],
                        ['dsa', 'DSA Interview'],
                        ['mcq', 'MCQ Auto-Solve'],
                    ].map(([v, l]) => html`<option value=${v} ?selected=${this.selectedProfile === v}>${l}</option>`)}
                </select>
            </div>

            ${this._renderStartButton()} ${this._renderDivider()}

            <!-- Cloud promo intentionally removed from the active UI. -->

            <div class="mode-links">
                <button class="mode-link" @click=${() => this._saveMode('local')}>Use local AI</button>
            </div>
        `;
    }

    // ── Local AI mode ──

    _renderLocalMode() {
        return html`
            <div class="form-group">
                <label class="form-label">Ollama Host</label>
                <input
                    type="text"
                    placeholder="http://127.0.0.1:11434"
                    .value=${this._ollamaHost}
                    @input=${e => this._saveOllamaHost(e.target.value)}
                />
                <div class="form-hint">Ollama must be running locally</div>
            </div>

            <div class="form-group">
                <label class="form-label">Ollama Model</label>
                <input type="text" placeholder="llama3.1" .value=${this._ollamaModel} @input=${e => this._saveOllamaModel(e.target.value)} />
                <div class="form-hint">
                    Run
                    <code
                        style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-elevated); padding: 1px 4px; border-radius: 3px;"
                        >ollama pull ${this._ollamaModel}</code
                    >
                    first
                </div>
            </div>

            <div class="form-group">
                <div class="whisper-label-row">
                    <label class="form-label">Whisper Model</label>
                    ${this.whisperDownloading ? html`<div class="whisper-spinner"></div>` : ''}
                </div>
                <select .value=${this._whisperModel} @change=${e => this._saveWhisperModel(e.target.value)}>
                    <option value="Xenova/whisper-tiny" ?selected=${this._whisperModel === 'Xenova/whisper-tiny'}>
                        Tiny (fastest, least accurate)
                    </option>
                    <option value="Xenova/whisper-base" ?selected=${this._whisperModel === 'Xenova/whisper-base'}>Base</option>
                    <option value="Xenova/whisper-small" ?selected=${this._whisperModel === 'Xenova/whisper-small'}>Small (recommended)</option>
                    <option value="Xenova/whisper-medium" ?selected=${this._whisperModel === 'Xenova/whisper-medium'}>
                        Medium (most accurate, slowest)
                    </option>
                </select>
                <div class="form-hint">${this.whisperDownloading ? 'Downloading model...' : 'Downloaded automatically on first use'}</div>
            </div>

            ${this._renderStartButton()} ${this._renderDivider()}

            <!-- Cloud promo intentionally removed from the active UI. -->

            <div class="mode-links">
                <button class="mode-link" @click=${() => this._saveMode('byok')}>Use own API keys</button>
            </div>
        `;
    }

    // ── Main render ──

    render() {
        const helpIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0m9 5v.01" />
                <path d="M12 13.5a1.5 1.5 0 0 1 1-1.5a2.6 2.6 0 1 0-3-4" />
            </g>
        </svg>`;
        const closeIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12" />
        </svg>`;

        return html`
            <div class="form-wrapper">
                ${
                    this._mode === 'local'
                        ? html`
                              <div class="title-row">
                                  <div class="page-title">Norton 340 <span class="mode-suffix">Local AI</span></div>
                                  <button
                                      class="help-btn"
                                      @click=${() => {
                                          this._showLocalHelp = !this._showLocalHelp;
                                      }}
                                  >
                                      ${this._showLocalHelp ? closeIcon : helpIcon}
                                  </button>
                              </div>
                          `
                        : html` <div class="page-title">${html`Norton 340 <span class="mode-suffix">BYOK</span>`}</div> `
                }
                <div class="page-subtitle">${this._mode === 'byok' ? 'Bring your own API keys' : 'Run models locally on your machine'}</div>

                ${this._renderCVCard()}

                <!-- Cloud mode render branch intentionally disabled. -->
                ${this._mode === 'byok' ? this._renderByokMode() : ''}
                ${this._mode === 'local' ? (this._showLocalHelp ? this._renderLocalHelp() : this._renderLocalMode()) : ''}
            </div>
        `;
    }

    _renderCVCard() {
        const hasCV = this.cvFilename && this.cvFilename.trim().length > 0;
        return html`
            <div class="cv-card ${hasCV ? 'active' : ''}" @click=${() => this.onNavigate('cv-upload')}>
                <div class="cv-card-header">
                    <svg class="cv-card-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    <span class="cv-card-title">${hasCV ? 'CV / Resume Loaded' : 'No CV / Resume Uploaded'}</span>
                </div>
                <div class="cv-card-body">
                    ${
                        hasCV
                            ? html`<span class="cv-card-filename">${this.cvFilename} (${this.cvCharCount.toLocaleString()} chars)</span>`
                            : html`<span class="cv-card-prompt">Click here to upload your CV / resume</span>`
                    }
                </div>
            </div>
        `;
    }

    _renderLocalHelp() {
        return html`
            <div class="help-content">
                <div class="help-section">
                    <div class="help-section-title">What is Ollama?</div>
                    <div class="help-section-text">
                        Ollama lets you run large language models locally on your machine. Everything stays on your computer — no data leaves your
                        device.
                    </div>
                </div>

                <div class="help-section">
                    <div class="help-section-title">Install Ollama</div>
                    <div class="help-section-text">
                        Download from
                        <span class="help-link" @click=${() => this.onExternalLink('https://ollama.com/download')}>ollama.com/download</span> and
                        install it.
                    </div>
                </div>

                <div class="help-section">
                    <div class="help-section-title">Ollama must be running</div>
                    <div class="help-section-text">
                        Ollama needs to be running before you start a session. If it's not running, open your terminal and type:
                    </div>
                    <code class="help-code">ollama serve</code>
                </div>

                <div class="help-section">
                    <div class="help-section-title">Pull a model</div>
                    <div class="help-section-text">Download a model before first use:</div>
                    <code class="help-code">ollama pull gemma3:4b</code>
                </div>

                <div class="help-section">
                    <div class="help-section-title">Recommended models</div>
                    <div class="help-models">
                        <div class="help-model"><span class="help-model-name">gemma3:4b</span><span>4B — fast, multimodal (images + text)</span></div>
                        <div class="help-model"><span class="help-model-name">mistral-small</span><span>8B — solid all-rounder, text only</span></div>
                    </div>
                    <div class="help-section-text">gemma3:4b and above supports images — screenshots will work with these models.</div>
                </div>

                <div class="help-section">
                    <div class="help-warn">
                        Avoid "thinking" models (e.g. deepseek-r1, qwq). Local inference is already slower — a thinking model adds extra delay before
                        responding.
                    </div>
                </div>

                <div class="help-section">
                    <div class="help-section-title">Whisper</div>
                    <div class="help-section-text">
                        The Whisper speech-to-text model is downloaded automatically the first time you start a session. This is a one-time download.
                    </div>
                </div>

                <hr class="help-divider" />

                <div class="help-section">
                    <div class="help-section-title">Computer hanging or slow?</div>
                    <div class="help-section-text">
                        Running models locally uses a lot of RAM and CPU. If your computer slows down or freezes, it's likely the LLM. Switch back to
                        BYOK mode if you want to use a hosted provider instead.
                    </div>
                </div>

                <button
                    class="help-cloud-btn"
                    @click=${() => {
                        this._showLocalHelp = false;
                        this._saveMode('byok');
                    }}
                >
                    Switch to BYOK
                </button>
            </div>
        `;
    }
}

customElements.define('main-view', MainView);
