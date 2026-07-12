import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class AdvancedView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .mode-selection-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: var(--space-md);
                margin-bottom: var(--space-lg);
            }

            .mode-card {
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                cursor: pointer;
                transition:
                    border-color 0.2s,
                    background 0.2s;
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
            }

            .mode-card:hover {
                border-color: var(--border-strong);
                background: var(--bg-hover);
            }

            .mode-card.active {
                border-color: var(--accent);
                background: rgba(59, 130, 246, 0.05);
            }

            .mode-card-header {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
            }

            .mode-radio {
                accent-color: var(--accent);
            }

            .mode-card-title {
                font-weight: var(--font-weight-semibold);
                color: var(--text-primary);
                font-size: var(--font-size-md);
            }

            .mode-card-desc {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                line-height: 1.4;
            }

            .limit-progress-bar-container {
                width: 100%;
                height: 8px;
                background: var(--bg-elevated);
                border-radius: 4px;
                overflow: hidden;
                margin-top: 6px;
                margin-bottom: 2px;
                border: 1px solid var(--border);
            }

            .limit-progress-bar {
                height: 100%;
                background: var(--accent);
                border-radius: 4px;
                transition: width 0.3s ease;
            }

            .limit-progress-bar.warning {
                background: var(--warning, #febc2e);
            }

            .limit-progress-bar.danger {
                background: var(--danger, #ef4444);
            }

            .limit-item {
                display: flex;
                flex-direction: column;
                padding: var(--space-sm) 0;
                border-bottom: 1px solid var(--border);
            }

            .limit-item:last-child {
                border-bottom: none;
            }

            .limit-header {
                display: flex;
                justify-content: space-between;
                font-size: var(--font-size-sm);
                color: var(--text-secondary);
            }

            .limit-name {
                font-weight: var(--font-weight-medium);
                color: var(--text-primary);
            }

            .limit-value {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
            }
        `,
    ];

    static properties = {
        appMode: { type: String },
        limits: { type: Object },
    };

    constructor() {
        super();
        this.appMode = 'interview';
        this.limits = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadSettings();
        this._startPolling();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopPolling();
    }

    async _loadSettings() {
        try {
            const prefs = await cheatingDaddy.storage.getPreferences();
            this.appMode = prefs.appMode || 'interview';
            this._fetchLimits();
        } catch (error) {
            console.error('Error loading settings in AdvancedView:', error);
        }
    }

    async _fetchLimits() {
        try {
            const response = await window.require('electron').ipcRenderer.invoke('storage:get-today-limits');
            if (response.success) {
                this.limits = response.data;
                this.requestUpdate();
            }
        } catch (error) {
            console.error('Error fetching today limits:', error);
        }
    }

    _startPolling() {
        this._pollingInterval = setInterval(() => this._fetchLimits(), 5000);
    }

    _stopPolling() {
        if (this._pollingInterval) {
            clearInterval(this._pollingInterval);
        }
    }

    async _setMode(mode) {
        this.appMode = mode;
        await cheatingDaddy.storage.updatePreference('appMode', mode);
        this.dispatchEvent(new CustomEvent('mode-changed', { detail: { mode }, bubbles: true, composed: true }));
    }

    render() {
        const flashCount = this.limits?.flash?.count || 0;
        const flashLiteCount = this.limits?.flashLite?.count || 0;
        const groqLimits = this.limits?.groq || {};

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Advanced Settings</div>
                    <div class="page-subtitle">Configure operational modes and monitor live API rate limits.</div>

                    <section class="surface">
                        <div class="surface-title">Operational Mode</div>
                        <div class="surface-subtitle">Select the behavior mode for the assistant application.</div>

                        <div class="mode-selection-grid">
                            <div class="mode-card ${this.appMode === 'interview' ? 'active' : ''}" @click=${() => this._setMode('interview')}>
                                <div class="mode-card-header">
                                    <input type="radio" class="mode-radio" name="appMode" .checked=${this.appMode === 'interview'} />
                                    <span class="mode-card-title">Interview Mode (Standard)</span>
                                </div>
                                <p class="mode-card-desc">
                                    Full assistant mode. Actively captures speaker audio and system audio for speech-to-text diarization. Ideal for
                                    interactive meetings.
                                </p>
                            </div>

                            <div class="mode-card ${this.appMode === 'coding' ? 'active' : ''}" @click=${() => this._setMode('coding')}>
                                <div class="mode-card-header">
                                    <input type="radio" class="mode-radio" name="appMode" .checked=${this.appMode === 'coding'} />
                                    <span class="mode-card-title">Coding Mode</span>
                                </div>
                                <p class="mode-card-desc">
                                    Privacy mode. Audio capture is completely disabled. Screenshots are captured on-demand (using Cmd+Enter /
                                    Ctrl+Enter) to assist with coding problems discreetly.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section class="surface">
                        <div class="surface-title">Rate Limit Monitoring</div>
                        <div class="surface-subtitle">Real-time daily usage logs for current API models.</div>

                        <div class="form-grid">
                            <div class="limit-item">
                                <div class="limit-header">
                                    <span class="limit-name">Gemini 2.5 Flash</span>
                                    <span class="limit-value">${flashCount} / 20 requests</span>
                                </div>
                                <div class="limit-progress-bar-container">
                                    <div
                                        class="limit-progress-bar ${flashCount >= 18 ? 'danger' : flashCount >= 15 ? 'warning' : ''}"
                                        style="width: ${Math.min(100, (flashCount / 20) * 100)}%"
                                    ></div>
                                </div>
                            </div>

                            <div class="limit-item">
                                <div class="limit-header">
                                    <span class="limit-name">Gemini 2.5 Flash Lite</span>
                                    <span class="limit-value">${flashLiteCount} / 20 requests</span>
                                </div>
                                <div class="limit-progress-bar-container">
                                    <div
                                        class="limit-progress-bar ${flashLiteCount >= 18 ? 'danger' : flashLiteCount >= 15 ? 'warning' : ''}"
                                        style="width: ${Math.min(100, (flashLiteCount / 20) * 100)}%"
                                    ></div>
                                </div>
                            </div>

                            ${Object.entries(groqLimits).map(([model, info]) => {
                                const percentage = info.limit > 0 ? (info.chars / info.limit) * 100 : 0;
                                return html`
                                    <div class="limit-item">
                                        <div class="limit-header">
                                            <span class="limit-name">Groq: ${model}</span>
                                            <span class="limit-value">${info.chars.toLocaleString()} / ${info.limit.toLocaleString()} chars</span>
                                        </div>
                                        <div class="limit-progress-bar-container">
                                            <div
                                                class="limit-progress-bar ${percentage >= 90 ? 'danger' : percentage >= 75 ? 'warning' : ''}"
                                                style="width: ${Math.min(100, percentage)}%"
                                            ></div>
                                        </div>
                                    </div>
                                `;
                            })}
                        </div>
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('advanced-view', AdvancedView);
