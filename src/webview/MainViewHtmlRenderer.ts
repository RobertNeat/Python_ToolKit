import * as path from "path";
import { translations } from "../translations";
import { VenvManager } from "../venvManager";
import { escapeHtml, getNonce } from "./HtmlUtils";
import { MainViewState } from "./MainViewState";

export class MainViewHtmlRenderer {
  public render(
    state: MainViewState,
    editIconUri: string,
    cspSource: string,
  ): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
        <html lang="${translations.documentLanguage}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>${translations.title}</title>
            <style>${this.getStyles()}</style>
        </head>
        <body>
            ${state.workspacePath ? this.getWorkspaceHtml(state, state.workspacePath, editIconUri) : this.getNoWorkspaceHtml(state, editIconUri)}
            <div id="toastContainer" class="toast-container"></div>
            <script nonce="${nonce}">${this.getScript()}</script>
        </body>
        </html>`;
  }

  private getNoWorkspaceHtml(
    state: MainViewState,
    editIconUri: string,
  ): string {
    return `<div class="stack">
            <h2>${translations.sections.pythonEnvironment}</h2>
            ${this.getPythonHtml(state)}

            <h2>${translations.sections.workingDirectory}</h2>
            <div class="status">
                <div class="row">
                    <span class="label">${translations.labels.status}</span>
                    <span class="value warn">${translations.statuses.noWorkingDirectory}</span>
                </div>
            </div>
            <button id="openWorkspaceBtn">${translations.buttons.openWorkingDirectory}</button>

            <h2>${translations.sections.venvEnvironment}</h2>
            <div class="status">
                <div class="row">
                    <span class="label">${translations.labels.status}</span>
                    <span class="value warn">${translations.statuses.selectWorkingDirectoryForVenv}</span>
                </div>
            </div>
            
            <h2>${translations.sections.script}</h2>
            ${this.getScriptPickerHtml("", false, editIconUri)}
        </div>`;
  }

  private getWorkspaceHtml(
    state: MainViewState,
    workspacePath: string,
    editIconUri: string,
  ): string {
    const selectedScript = state.scripts.find(
      (script) => script.filePath === state.selectedScriptPath,
    );
    const scriptOptions = state.scripts
      .map((script) => {
        const selected =
          script.filePath === state.selectedScriptPath ? " selected" : "";
        return `<option value="${escapeHtml(script.filePath)}"${selected}>${escapeHtml(path.relative(workspacePath, script.filePath))}</option>`;
      })
      .join("");

    return `<div class="stack">
            <h2>${translations.sections.pythonEnvironment}</h2>
            ${this.getPythonHtml(state)}

            <h2>${translations.sections.workingDirectory}</h2>
            <button id="openWorkspaceBtn" class="status path-panel" type="button" title="${translations.tooltips.changeWorkingDirectory}">
                <div class="row">
                    <span class="label">${translations.labels.path}</span>
                    <span class="value">${escapeHtml(workspacePath)}</span>
                </div>
            </button>
            <button id="refreshBtn" class="secondary">${translations.buttons.refresh}</button>

            <h2>${translations.sections.venvEnvironment}</h2>
            ${this.getVenvHtml(state, workspacePath)}

            <h2>${translations.sections.script}</h2>
            ${
              state.scripts.length
                ? `
                ${this.getScriptPickerHtml(scriptOptions, Boolean(selectedScript), editIconUri)}
                ${selectedScript ? `<div class="script-meta">${escapeHtml(selectedScript.description || selectedScript.name)}</div>` : ""}
                <button id="runScriptBtn" ${state.isVenvOperationInProgress ? "disabled" : ""}>${translations.buttons.runScript}</button>
            `
                : `
                ${this.getScriptPickerHtml("", false, editIconUri)}
                <div class="status">
                    <span class="value warn">${translations.statuses.noScriptsFound}</span>
                </div>
            `
            }
        </div>`;
  }

  private getPythonHtml(state: MainViewState): string {
    if (state.isDetectingPython) {
      return `<div class="status"><span class="value">${translations.statuses.detectingPython}</span></div>`;
    }

    if (!state.pythonInfo?.found) {
      return `<div class="status"><span class="value error">${translations.statuses.noPythonDetected}</span></div>`;
    }

    return `<div class="status">
            <div class="row">
                <span class="label">${translations.labels.version}</span>
                <span class="value ok">${escapeHtml(state.pythonInfo.version || "")}</span>
            </div>
            <div class="row">
                <span class="label">${translations.labels.systemInterpreter}</span>
                <span class="value">${escapeHtml(state.pythonInfo.path || "")}</span>
            </div>
        </div>`;
  }

  private getVenvHtml(state: MainViewState, workspacePath: string): string {
    if (state.isVenvOperationInProgress) {
      return `<div class="status"><span class="value">${escapeHtml(state.venvOperationMessage)}</span></div>`;
    }

    if (state.venvStatus?.isValid) {
      return `<div class="stack">
                <div class="status">
                    <div class="row">
                        <span class="label">${translations.labels.status}</span>
                        <span class="value ok">${translations.statuses.ready}</span>
                    </div>
                    <div class="row">
                        <span class="label">${translations.labels.path}</span>
                        <span class="value">${escapeHtml(VenvManager.getVenvPath(workspacePath))}</span>
                    </div>
                    <div class="row">
                        <span class="label">${translations.labels.activeInterpreter}</span>
                        <span class="value">${escapeHtml(state.venvStatus.pythonPath || "")}</span>
                    </div>
                </div>
                <button id="installDependenciesBtn" class="secondary">${translations.buttons.installDependenciesFromImports}</button>
                <button id="reinitVenvBtn" class="secondary">${translations.buttons.removeAndReinitialize}</button>
            </div>`;
    }

    if (state.venvStatus?.exists) {
      return `<div class="stack">
                <div class="status">
                    <span class="value error">${translations.statuses.venvBroken}</span>
                    <span class="script-meta">${escapeHtml(state.venvStatus.error || "")}</span>
                </div>
                <button id="reinitVenvBtn">${translations.buttons.removeAndReinitialize}</button>
            </div>`;
    }

    return `<div class="stack">
            <div class="status"><span class="value warn">${translations.statuses.venvMissing}</span></div>
            <button id="initVenvBtn">${translations.buttons.initializeVenv}</button>
        </div>`;
  }

  private getScriptPickerHtml(
    scriptOptions: string,
    canOpenScript: boolean,
    editIconUri: string,
  ): string {
    const buttonDisabled = canOpenScript ? "" : " disabled";
    const selectDisabled = scriptOptions ? "" : " disabled";
    const options =
      scriptOptions ||
      `<option value="">${translations.statuses.noScripts}</option>`;

    return `<div class="script-picker">
                <button id="openScriptBtn" class="icon-button secondary" type="button" title="${translations.buttons.openScript}" aria-label="${translations.buttons.openScript}"${buttonDisabled}>
                    <img src="${escapeHtml(editIconUri)}" alt="">
                </button>
                <select id="scriptSelect"${selectDisabled}>${options}</select>
            </div>`;
  }

  private getStyles(): string {
    return `
                body {
                    color: var(--vscode-foreground);
                    background: var(--vscode-sideBar-background);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    margin: 0;
                    padding: 14px;
                }
                h2 {
                    font-size: 12px;
                    letter-spacing: 0;
                    margin: 18px 0 8px;
                    text-transform: uppercase;
                    color: var(--vscode-descriptionForeground);
                }
                button, select {
                    width: 100%;
                    min-height: 30px;
                    color: var(--vscode-button-foreground);
                    background: var(--vscode-button-background);
                    border: 1px solid var(--vscode-button-border, transparent);
                    border-radius: 3px;
                    padding: 5px 8px;
                    font: inherit;
                }
                button:hover:not(:disabled) {
                    background: var(--vscode-button-hoverBackground);
                    cursor: pointer;
                }
                button.secondary {
                    color: var(--vscode-button-secondaryForeground);
                    background: var(--vscode-button-secondaryBackground);
                }
                button.secondary:hover:not(:disabled) {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                button:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .icon-button {
                    align-items: center;
                    display: inline-flex;
                    justify-content: center;
                    min-height: 30px;
                    padding: 0;
                    width: 30px;
                }
                .icon-button img {
                    display: block;
                    filter: invert(1);
                    height: 14px;
                    opacity: 0.9;
                    width: 14px;
                }
                select {
                    color: var(--vscode-dropdown-foreground);
                    background: var(--vscode-dropdown-background);
                    border-color: var(--vscode-dropdown-border);
                }
                select:disabled {
                    opacity: 0.55;
                }
                .stack {
                    display: grid;
                    gap: 8px;
                }
                .status {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 9px;
                    display: grid;
                    gap: 6px;
                    background: var(--vscode-editorWidget-background);
                }
                .path-panel {
                    color: var(--vscode-foreground);
                    font: inherit;
                    min-height: auto;
                    text-align: left;
                }
                .path-panel:hover:not(:disabled) {
                    background: var(--vscode-list-hoverBackground);
                }
                .row {
                    display: grid;
                    gap: 2px;
                }
                .label {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }
                .value {
                    overflow-wrap: anywhere;
                }
                .ok {
                    color: var(--vscode-testing-iconPassed);
                }
                .warn {
                    color: var(--vscode-editorWarning-foreground);
                }
                .error {
                    color: var(--vscode-errorForeground);
                }
                .script-meta {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                    line-height: 1.4;
                    overflow-wrap: anywhere;
                }
                .script-picker {
                    align-items: stretch;
                    display: grid;
                    gap: 6px;
                    grid-template-columns: 30px minmax(0, 1fr);
                }
                .toast-container {
                    position: fixed;
                    right: 10px;
                    bottom: 10px;
                    display: grid;
                    gap: 8px;
                    z-index: 10;
                }
                .toast {
                    border-radius: 4px;
                    padding: 8px 10px;
                    color: var(--vscode-notifications-foreground);
                    background: var(--vscode-notifications-background);
                    border: 1px solid var(--vscode-notifications-border);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
                }`;
  }

  private getScript(): string {
    return `
                const vscode = acquireVsCodeApi();

                function post(type, payload = {}) {
                    vscode.postMessage({ type, ...payload });
                }

                function showToast(message, toastType) {
                    const container = document.getElementById('toastContainer');
                    const toast = document.createElement('div');
                    toast.className = 'toast ' + toastType;
                    toast.textContent = message;
                    container.appendChild(toast);
                    setTimeout(() => toast.remove(), 5000);
                }

                window.addEventListener('message', event => {
                    if (event.data.type === 'toast') {
                        showToast(event.data.message, event.data.toastType);
                    }
                });

                document.getElementById('openWorkspaceBtn')?.addEventListener('click', () => post('openWorkspace'));
                document.getElementById('refreshBtn')?.addEventListener('click', () => post('refresh'));
                document.getElementById('initVenvBtn')?.addEventListener('click', () => post('initVenv'));
                document.getElementById('reinitVenvBtn')?.addEventListener('click', () => post('reinitVenv'));
                document.getElementById('installDependenciesBtn')?.addEventListener('click', () => post('installDependencies'));
                document.getElementById('openScriptBtn')?.addEventListener('click', () => post('openScript'));
                document.getElementById('runScriptBtn')?.addEventListener('click', () => post('runScript'));
                document.getElementById('scriptSelect')?.addEventListener('change', event => {
                    post('selectScript', { scriptPath: event.target.value });
                });`;
  }
}
