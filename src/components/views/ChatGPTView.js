import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class ChatGPTView extends LitElement {
    static styles = css`
        :host {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .login-helper-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
            padding: var(--space-sm) var(--space-md);
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
        }

        .login-helper-bar button {
            background: var(--accent);
            color: white;
            border: none;
            border-radius: var(--radius-sm);
            padding: 4px var(--space-sm);
            cursor: pointer;
            font-weight: var(--font-weight-medium);
            font-size: var(--font-size-xs);
            transition: background var(--transition);
        }

        .login-helper-bar button:hover {
            background: var(--accent-hover);
        }

        .webview-container {
            flex: 1;
            position: relative;
        }

        webview {
            width: 100%;
            height: 100%;
            border: none;
        }
    `;

    connectedCallback() {
        super.connectedCallback();
        const { ipcRenderer } = window.require('electron');
        this._onLoginComplete = () => {
            const webview = this.shadowRoot.querySelector('webview');
            if (webview) webview.reload();
        };
        ipcRenderer.on('chatgpt:login-complete', this._onLoginComplete);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.removeListener('chatgpt:login-complete', this._onLoginComplete);
    }

    _openLoginWindow() {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('chatgpt:open-login-window');
    }

    render() {
        const userAgent =
            process.platform === 'darwin'
                ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        return html`
            <div class="login-helper-bar">
                <span>Having sign-in issues?</span>
                <button @click=${this._openLoginWindow}>Open Secure Sign-In Window</button>
            </div>
            <div class="webview-container">
                <webview src="https://chatgpt.com" partition="persist:chatgpt" useragent=${userAgent} allowpopups></webview>
            </div>
        `;
    }
}

customElements.define('chatgpt-view', ChatGPTView);
