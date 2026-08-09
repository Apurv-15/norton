import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class ChatGPTView extends LitElement {
    static styles = css`
        :host {
            display: block;
            height: 100%;
        }

        webview {
            width: 100%;
            height: 100%;
            border: none;
        }
    `;

    render() {
        const userAgent =
            process.platform === 'darwin'
                ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0'
                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0';
        return html`<webview src="https://chatgpt.com" partition="persist:chatgpt" useragent=${userAgent} allowpopups></webview>`;
    }
}

customElements.define('chatgpt-view', ChatGPTView);
