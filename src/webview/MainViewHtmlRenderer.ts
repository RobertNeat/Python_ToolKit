import * as path from "path";
import { VenvManager } from "../venvManager";
import { escapeHtml, getNonce } from "./HtmlUtils";
import { MainViewState } from "./MainViewState";

export class MainViewHtmlRenderer {
  public render(state: MainViewState): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
        <html lang="pl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>Python Venv Toolkit</title>
            <style>${this.getStyles()}</style>
        </head>
        <body>
            <h1>Python Venv Toolkit ##</h1>
            ${state.workspacePath ? this.getWorkspaceHtml(state, state.workspacePath) : this.getNoWorkspaceHtml(state)}
            <div id="toastContainer" class="toast-container"></div>
            <script nonce="${nonce}">${this.getScript()}</script>
        </body>
        </html>`;
  }

  private getNoWorkspaceHtml(state: MainViewState): string {
    return `<div class="stack">
            <h2>Python environment</h2>
            ${this.getPythonHtml(state)}

            <h2>Working directory</h2>
            <div class="status">
                <div class="row">
                    <span class="label">Status</span>
                    <span class="value warn">No working directory selected.</span>
                </div>
            </div>
            <button id="openWorkspaceBtn">Open working directory</button>

            <h2>Venv environment</h2>
            <div class="status">
                <div class="row">
                    <span class="label">Status</span>
                    <span class="value warn">Select a working directory to create .venv.</span>
                </div>
            </div>
        </div>`;
  }

  private getWorkspaceHtml(
    state: MainViewState,
    workspacePath: string,
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
            <h2>Python environment</h2>
            ${this.getPythonHtml(state)}

            <h2>Working directory</h2>
            <div class="status">
                <div class="row">
                    <span class="label">Path</span>
                    <span class="value">${escapeHtml(workspacePath)}</span>
                </div>
            </div>
            <button id="refreshBtn" class="secondary">Refresh</button>

            <h2>Venv environment</h2>
            ${this.getVenvHtml(state, workspacePath)}

            <h2>Script</h2>
            ${
              state.scripts.length
                ? `
                <select id="scriptSelect">${scriptOptions}</select>
                ${selectedScript ? `<div class="script-meta">${escapeHtml(selectedScript.description || selectedScript.name)}</div>` : ""}
                <button id="openScriptBtn" class="secondary">Open script</button>
                <button id="runScriptBtn" ${state.isVenvOperationInProgress ? "disabled" : ""}>Run script</button>
            `
                : `
                <div class="status">
                    <span class="value warn">No .py files found in the working directory.</span>
                </div>
            `
            }
        </div>`;
  }

  private getPythonHtml(state: MainViewState): string {
    if (state.isDetectingPython) {
      return `<div class="status"><span class="value">Wykrywanie Pythona...</span></div>`;
    }

    if (!state.pythonInfo?.found) {
      return `<div class="status"><span class="value error">Nie wykryto Pythona w systemie.</span></div>`;
    }

    return `<div class="status">
            <div class="row">
                <span class="label">Wersja</span>
                <span class="value ok">${escapeHtml(state.pythonInfo.version || "")}</span>
            </div>
            <div class="row">
                <span class="label">Interpreter systemowy</span>
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
                        <span class="label">Status</span>
                        <span class="value ok">Gotowe</span>
                    </div>
                    <div class="row">
                        <span class="label">Ścieżka</span>
                        <span class="value">${escapeHtml(VenvManager.getVenvPath(workspacePath))}</span>
                    </div>
                    <div class="row">
                        <span class="label">Aktywny interpreter</span>
                        <span class="value">${escapeHtml(state.venvStatus.pythonPath || "")}</span>
                    </div>
                </div>
                <button id="installDependenciesBtn" class="secondary">Zainstaluj zależności z importów</button>
                <button id="openVenvFolderBtn" class="secondary">Pokaż folder .venv</button>
                <button id="reinitVenvBtn" class="secondary">Usuń i zainicjalizuj ponownie</button>
            </div>`;
    }

    if (state.venvStatus?.exists) {
      return `<div class="stack">
                <div class="status">
                    <span class="value error">Środowisko istnieje, ale jest uszkodzone.</span>
                    <span class="script-meta">${escapeHtml(state.venvStatus.error || "")}</span>
                </div>
                <button id="reinitVenvBtn">Usuń i zainicjalizuj ponownie</button>
            </div>`;
    }

    return `<div class="stack">
            <div class="status"><span class="value warn">Środowisko nie istnieje.</span></div>
            <button id="initVenvBtn">Zainicjalizuj .venv</button>
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
                h1 {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0 0 14px;
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
                select {
                    color: var(--vscode-dropdown-foreground);
                    background: var(--vscode-dropdown-background);
                    border-color: var(--vscode-dropdown-border);
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
                document.getElementById('openVenvFolderBtn')?.addEventListener('click', () => post('openVenvFolder'));
                document.getElementById('openScriptBtn')?.addEventListener('click', () => post('openScript'));
                document.getElementById('runScriptBtn')?.addEventListener('click', () => post('runScript'));
                document.getElementById('scriptSelect')?.addEventListener('change', event => {
                    post('selectScript', { scriptPath: event.target.value });
                });`;
  }
}
