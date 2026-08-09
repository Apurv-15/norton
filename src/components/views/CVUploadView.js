import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class CVUploadView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .upload-zone {
                border: 2px dashed var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-xl) var(--space-lg);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: var(--space-md);
                background: rgba(255, 255, 255, 0.01);
                cursor: pointer;
                transition:
                    border-color 0.2s,
                    background 0.2s;
            }

            .upload-zone:hover {
                border-color: var(--accent);
                background: rgba(59, 130, 246, 0.02);
            }

            .upload-icon {
                width: 48px;
                height: 48px;
                color: var(--text-muted);
            }

            .upload-zone:hover .upload-icon {
                color: var(--accent);
            }

            .upload-title {
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-semibold);
                color: var(--text-primary);
            }

            .upload-subtitle {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
            }

            .status-card {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                margin-top: var(--space-md);
            }

            .cv-info {
                display: flex;
                align-items: center;
                gap: var(--space-md);
            }

            .doc-icon {
                width: 36px;
                height: 36px;
                color: var(--accent);
            }

            .cv-details {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .cv-name {
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-semibold);
                color: var(--text-primary);
            }

            .cv-meta {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
            }

            .preview-section {
                margin-top: var(--space-lg);
            }

            .preview-box {
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                max-height: 200px;
                overflow-y: auto;
                white-space: pre-wrap;
                line-height: 1.5;
            }

            .btn-clear {
                background: transparent;
                border: 1px solid var(--danger);
                color: var(--danger);
                border-radius: var(--radius-sm);
                padding: 6px 12px;
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                transition: background 0.2s;
            }

            .btn-clear:hover {
                background: rgba(239, 68, 68, 0.1);
            }

            .btn-back {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: transparent;
                border: 1px solid var(--border);
                color: var(--text-secondary);
                padding: 6px 12px;
                border-radius: var(--radius-sm);
                font-size: var(--font-size-xs);
                cursor: pointer;
                margin-bottom: var(--space-md);
                transition:
                    color 0.2s,
                    border-color 0.2s;
            }

            .btn-back:hover {
                color: var(--text-primary);
                border-color: var(--border-strong);
            }

            .btn-back svg {
                width: 14px;
                height: 14px;
            }
            .upload-zone.drag-over {
                border-color: var(--accent);
                background: rgba(59, 130, 246, 0.08);
            }

            .error-banner {
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid var(--danger);
                color: var(--danger);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                margin-bottom: var(--space-md);
                font-size: var(--font-size-xs);
                line-height: 1.4;
            }
        `,
    ];

    static properties = {
        cvFilename: { type: String },
        cvCharCount: { type: Number },
        cvTextPreview: { type: String },
        errorMessage: { type: String },
        isDragOver: { type: Boolean },
        onBack: { type: Function },
    };

    constructor() {
        super();
        this.cvFilename = '';
        this.cvCharCount = 0;
        this.cvTextPreview = '';
        this.errorMessage = '';
        this.isDragOver = false;
        this.onBack = () => {};
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadStatus();
    }

    async _loadStatus() {
        try {
            const status = await window.require('electron').ipcRenderer.invoke('cv:status');
            if (status.success) {
                this.cvFilename = status.filename;
                this.cvCharCount = status.charCount;
                if (this.cvCharCount > 0) {
                    const prefs = await cheatingDaddy.storage.getPreferences();
                    this.cvTextPreview = (prefs.cvText || '').substring(0, 1000) + '...';
                }
            }
        } catch (error) {
            console.error('Error loading CV status:', error);
        }
    }

    async _processUpload(filePath = null) {
        this.errorMessage = '';
        try {
            const result = await window.require('electron').ipcRenderer.invoke('cv:upload', filePath);
            if (result.success) {
                this.cvFilename = result.filename;
                this.cvCharCount = result.charCount;
                const prefs = await cheatingDaddy.storage.getPreferences();
                this.cvTextPreview = (prefs.cvText || '').substring(0, 1000) + '...';
                this.dispatchEvent(new CustomEvent('cv-updated', { bubbles: true, composed: true }));
            } else if (result.error && result.error !== 'Upload canceled') {
                this.errorMessage = result.error;
            }
        } catch (error) {
            console.error('Error uploading CV:', error);
            this.errorMessage = error.message || 'Failed to parse CV file.';
        }
    }

    async _handleUploadClick() {
        await this._processUpload();
    }

    _handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragOver = true;
    }

    _handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragOver = false;
    }

    async _handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragOver = false;

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            const filePath = file.path;
            if (filePath) {
                await this._processUpload(filePath);
            }
        }
    }

    async _handleClear() {
        this.errorMessage = '';
        try {
            const result = await window.require('electron').ipcRenderer.invoke('cv:clear');
            if (result.success) {
                this.cvFilename = '';
                this.cvCharCount = 0;
                this.cvTextPreview = '';
                this.dispatchEvent(new CustomEvent('cv-updated', { bubbles: true, composed: true }));
            }
        } catch (error) {
            console.error('Error clearing CV:', error);
        }
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <button class="btn-back" @click=${this.onBack}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Home
                    </button>

                    <div class="page-title">CV / Resume Upload</div>
                    <div class="page-subtitle">Upload your CV to customize Norton's answers to your background and achievements automatically.</div>

                    ${this.errorMessage ? html`<div class="error-banner"><strong>Upload Failed:</strong> ${this.errorMessage}</div>` : ''}

                    <section class="surface">
                        ${
                            !this.cvFilename
                                ? html`
                                      <div
                                          class="upload-zone ${this.isDragOver ? 'drag-over' : ''}"
                                          @click=${this._handleUploadClick}
                                          @dragover=${this._handleDragOver}
                                          @dragleave=${this._handleDragLeave}
                                          @drop=${this._handleDrop}
                                      >
                                          <svg
                                              class="upload-icon"
                                              xmlns="http://www.w3.org/2000/svg"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                          >
                                              <path
                                                  stroke-linecap="round"
                                                  stroke-linejoin="round"
                                                  stroke-width="2"
                                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                              />
                                          </svg>
                                          <div class="upload-title">Click or Drag & Drop to upload your CV</div>
                                          <div class="upload-subtitle">Supported formats: PDF, TXT, MD. Text will be extracted locally.</div>
                                      </div>
                                  `
                                : html`
                                      <div class="status-card">
                                          <div class="cv-info">
                                              <svg
                                                  class="doc-icon"
                                                  xmlns="http://www.w3.org/2000/svg"
                                                  fill="none"
                                                  viewBox="0 0 24 24"
                                                  stroke="currentColor"
                                              >
                                                  <path
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                      stroke-width="2"
                                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                  />
                                              </svg>
                                              <div class="cv-details">
                                                  <span class="cv-name">${this.cvFilename}</span>
                                                  <span class="cv-meta">Parsed successfully: ${this.cvCharCount} characters extracted</span>
                                              </div>
                                          </div>
                                          <button class="btn-clear" @click=${this._handleClear}>Clear CV</button>
                                      </div>

                                      ${
                                      this.cvTextPreview
                                          ? html`
                                                <div class="preview-section">
                                                    <div class="surface-title">Extracted Text Preview</div>
                                                    <div class="preview-box">${this.cvTextPreview}</div>
                                                </div>
                                            `
                                          : ''
                                  }
                                  `
                        }
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('cv-upload-view', CVUploadView);
