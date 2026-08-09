import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class SystemDesignView extends LitElement {
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
        return html`<webview src="https://claude.ai" partition="persist:system-design" allowpopups></webview>`;
    }
}

customElements.define('system-design-view', SystemDesignView);
