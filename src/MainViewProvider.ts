import * as vscode from 'vscode';
import * as path from 'path';
import { PythonDetector, PythonInfo } from './pythonDetector';
import { ScriptMetadata, ScriptValidator } from './scriptValidator';
import { ScriptRunner } from './scriptRunner';
import { VenvManager, VenvStatus } from './venvManager';

export class MainViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'python-venv-toolkit.mainView';

    private _view?: vscode.WebviewView;
    private _pythonInfo: PythonInfo | null = null;
    private _venvStatus: VenvStatus | null = null;
    private _scripts: ScriptMetadata[] = [];
    private _selectedScriptPath: string | null = null;
    private _isDetectingPython = false;
    private _isVenvOperationInProgress = false;
    private _venvOperationMessage = '';
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._outputChannel = vscode.window.createOutputChannel('Python Venv Toolkit');
        this._bootstrap();
    }

    public dispose(): void {
        this._outputChannel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._renderView();

        this._disposables.push(webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'openWorkspace':
                    await this._openWorkspace();
                    break;
                case 'refresh':
                    await this._bootstrap();
                    break;
                case 'selectScript':
                    this._selectedScriptPath = data.scriptPath || null;
                    this._renderView();
                    break;
                case 'runScript':
                    await this._runSelectedScript();
                    break;
                case 'initVenv':
                    await this._initializeVenv(false);
                    break;
                case 'reinitVenv':
                    await this._initializeVenv(true);
                    break;
                case 'installDependencies':
                    await this._installDependencies();
                    break;
                case 'openVenvFolder':
                    await this._openVenvFolder();
                    break;
                case 'openScript':
                    await this._openSelectedScript();
                    break;
            }
        }));

        this._disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            await this._bootstrap();
        }));

        webviewView.onDidDispose(() => {
            this._view = undefined;
        });
    }

    private async _bootstrap(): Promise<void> {
        await this._detectPython();
        this._loadScripts();
        await this._checkVenvStatus();

        if (this._hasWorkspace() && this._pythonInfo?.found && !this._venvStatus?.isValid) {
            await this._initializeVenv(false);
        }

        this._renderView();
    }

    private async _detectPython(): Promise<void> {
        this._isDetectingPython = true;
        this._renderView();
        this._pythonInfo = await PythonDetector.detect();
        this._isDetectingPython = false;
        this._renderView();
    }

    private _loadScripts(): void {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) {
            this._scripts = [];
            this._selectedScriptPath = null;
            return;
        }

        this._scripts = ScriptValidator.getValidScripts(workspacePath);
        if (!this._selectedScriptPath || !this._scripts.some(script => script.filePath === this._selectedScriptPath)) {
            this._selectedScriptPath = this._scripts[0]?.filePath ?? null;
        }
    }

    private async _checkVenvStatus(): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        this._venvStatus = workspacePath ? await VenvManager.checkVenvStatus(workspacePath) : null;
    }

    private async _initializeVenv(forceRecreate: boolean): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath || !this._pythonInfo?.found || !this._pythonInfo.path) {
            this._sendToast('Otwórz folder roboczy i upewnij się, że Python jest dostępny.', 'error');
            return;
        }

        this._isVenvOperationInProgress = true;
        this._venvOperationMessage = forceRecreate ? 'Reinicjalizacja środowiska...' : 'Inicjalizacja środowiska...';
        this._renderView();

        if (forceRecreate) {
            const deleteResult = await VenvManager.deleteVenv(workspacePath);
            if (!deleteResult.success) {
                this._isVenvOperationInProgress = false;
                this._sendToast(deleteResult.error || 'Nie udało się usunąć środowiska.', 'error');
                this._renderView();
                return;
            }
        }

        const result = await VenvManager.ensureVenvAndInstallDependencies(
            workspacePath,
            workspacePath,
            this._pythonInfo.path,
            message => {
                this._venvOperationMessage = message;
                this._renderView();
            }
        );

        this._isVenvOperationInProgress = false;
        await this._checkVenvStatus();
        this._renderView();

        if (!result.venvResult.success) {
            this._sendToast(result.venvResult.error || 'Nie udało się utworzyć środowiska.', 'error');
            return;
        }

        if (result.installResult?.failed.length) {
            this._sendToast(`Nie udało się zainstalować: ${result.installResult.failed.join(', ')}`, 'error');
            return;
        }

        this._sendToast(forceRecreate ? 'Środowisko zostało zreinicjalizowane.' : 'Środowisko jest gotowe.', 'info');
    }

    private async _installDependencies(): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath || !this._venvStatus?.isValid) {
            this._sendToast('Najpierw utwórz poprawne środowisko .venv.', 'error');
            return;
        }

        this._isVenvOperationInProgress = true;
        this._venvOperationMessage = 'Instalowanie zależności z importów...';
        this._renderView();

        const result = await VenvManager.installDependencies(workspacePath, workspacePath, message => {
            this._venvOperationMessage = message;
            this._renderView();
        });

        this._isVenvOperationInProgress = false;
        await this._checkVenvStatus();
        this._renderView();

        if (!result.success) {
            this._sendToast(result.message, 'error');
            return;
        }

        this._sendToast(result.message, 'info');
    }

    private async _runSelectedScript(): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        const script = this._scripts.find(item => item.filePath === this._selectedScriptPath);

        if (!workspacePath || !script) {
            this._sendToast('Wybierz skrypt Python do uruchomienia.', 'error');
            return;
        }

        if (!this._pythonInfo?.found) {
            this._sendToast('Python nie został wykryty.', 'error');
            return;
        }

        if (!this._venvStatus?.isValid) {
            await this._initializeVenv(false);
        }

        const result = await ScriptRunner.runScriptWithProgress(
            script,
            this._pythonInfo,
            workspacePath,
            this._venvStatus?.pythonPath
        );

        ScriptRunner.showResultInOutput(script, result, this._outputChannel);
        this._sendToast(result.success ? 'Skrypt zakończył działanie.' : 'Skrypt zakończył się błędem.', result.success ? 'info' : 'error');
    }

    private async _openWorkspace(): Promise<void> {
        await vscode.commands.executeCommand('vscode.openFolder');
    }

    private async _openVenvFolder(): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) {
            return;
        }
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(VenvManager.getVenvPath(workspacePath)));
    }

    private async _openSelectedScript(): Promise<void> {
        const script = this._scripts.find(item => item.filePath === this._selectedScriptPath);
        if (!script) {
            return;
        }
        const document = await vscode.workspace.openTextDocument(script.filePath);
        await vscode.window.showTextDocument(document);
    }

    private _hasWorkspace(): boolean {
        return Boolean(this._getWorkspacePath());
    }

    private _getWorkspacePath(): string | null {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    }

    private _sendToast(message: string, type: 'info' | 'error'): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'toast', message, toastType: type });
            return;
        }

        if (type === 'error') {
            vscode.window.showErrorMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    }

    private _renderView(): void {
        if (this._view) {
            this._view.webview.html = this._getHtml();
        }
    }

    private _getHtml(): string {
        const nonce = this._getNonce();
        const workspacePath = this._getWorkspacePath();
        const selectedScript = this._scripts.find(script => script.filePath === this._selectedScriptPath);
        const canRun = Boolean(workspacePath && selectedScript && this._pythonInfo?.found && !this._isVenvOperationInProgress);

        return `<!DOCTYPE html>
        <html lang="pl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>Python Venv Toolkit</title>
            <style>
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
                }
            </style>
        </head>
        <body>
            <h1>Python Venv Toolkit</h1>
            ${workspacePath ? this._getWorkspaceHtml(workspacePath) : this._getNoWorkspaceHtml()}
            <div id="toastContainer" class="toast-container"></div>
            <script nonce="${nonce}">
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
                });
            </script>
        </body>
        </html>`;
    }

    private _getNoWorkspaceHtml(): string {
        return `<div class="stack">
            <div class="status">
                <div class="row">
                    <span class="label">Folder roboczy</span>
                    <span class="value warn">Nie otwarto folderu.</span>
                </div>
            </div>
            <button id="openWorkspaceBtn">Otwórz folder roboczy</button>
        </div>`;
    }

    private _getWorkspaceHtml(workspacePath: string): string {
        const selectedScript = this._scripts.find(script => script.filePath === this._selectedScriptPath);
        const scriptOptions = this._scripts.map(script => {
            const selected = script.filePath === this._selectedScriptPath ? ' selected' : '';
            return `<option value="${this._escapeHtml(script.filePath)}"${selected}>${this._escapeHtml(path.relative(workspacePath, script.filePath))}</option>`;
        }).join('');

        return `<div class="stack">
            <h2>Folder roboczy</h2>
            <div class="status">
                <div class="row">
                    <span class="label">Ścieżka</span>
                    <span class="value">${this._escapeHtml(workspacePath)}</span>
                </div>
            </div>
            <button id="refreshBtn" class="secondary">Odśwież</button>

            <h2>Python</h2>
            ${this._getPythonHtml()}

            <h2>Środowisko .venv</h2>
            ${this._getVenvHtml(workspacePath)}

            <h2>Skrypt</h2>
            ${this._scripts.length ? `
                <select id="scriptSelect">${scriptOptions}</select>
                ${selectedScript ? `<div class="script-meta">${this._escapeHtml(selectedScript.description || selectedScript.name)}</div>` : ''}
                <button id="openScriptBtn" class="secondary">Otwórz skrypt</button>
                <button id="runScriptBtn" ${this._isVenvOperationInProgress ? 'disabled' : ''}>Uruchom skrypt</button>
            ` : `
                <div class="status">
                    <span class="value warn">Nie znaleziono plików .py w folderze roboczym.</span>
                </div>
            `}
        </div>`;
    }

    private _getPythonHtml(): string {
        if (this._isDetectingPython) {
            return `<div class="status"><span class="value">Wykrywanie Pythona...</span></div>`;
        }

        if (!this._pythonInfo?.found) {
            return `<div class="status"><span class="value error">Nie wykryto Pythona w systemie.</span></div>`;
        }

        return `<div class="status">
            <div class="row">
                <span class="label">Wersja</span>
                <span class="value ok">${this._escapeHtml(this._pythonInfo.version || '')}</span>
            </div>
            <div class="row">
                <span class="label">Interpreter systemowy</span>
                <span class="value">${this._escapeHtml(this._pythonInfo.path || '')}</span>
            </div>
        </div>`;
    }

    private _getVenvHtml(workspacePath: string): string {
        if (this._isVenvOperationInProgress) {
            return `<div class="status"><span class="value">${this._escapeHtml(this._venvOperationMessage)}</span></div>`;
        }

        if (this._venvStatus?.isValid) {
            return `<div class="stack">
                <div class="status">
                    <div class="row">
                        <span class="label">Status</span>
                        <span class="value ok">Gotowe</span>
                    </div>
                    <div class="row">
                        <span class="label">Ścieżka</span>
                        <span class="value">${this._escapeHtml(VenvManager.getVenvPath(workspacePath))}</span>
                    </div>
                    <div class="row">
                        <span class="label">Aktywny interpreter</span>
                        <span class="value">${this._escapeHtml(this._venvStatus.pythonPath || '')}</span>
                    </div>
                </div>
                <button id="installDependenciesBtn" class="secondary">Zainstaluj zależności z importów</button>
                <button id="openVenvFolderBtn" class="secondary">Pokaż folder .venv</button>
                <button id="reinitVenvBtn" class="secondary">Usuń i zainicjalizuj ponownie</button>
            </div>`;
        }

        if (this._venvStatus?.exists) {
            return `<div class="stack">
                <div class="status">
                    <span class="value error">Środowisko istnieje, ale jest uszkodzone.</span>
                    <span class="script-meta">${this._escapeHtml(this._venvStatus.error || '')}</span>
                </div>
                <button id="reinitVenvBtn">Usuń i zainicjalizuj ponownie</button>
            </div>`;
        }

        return `<div class="stack">
            <div class="status"><span class="value warn">Środowisko nie istnieje.</span></div>
            <button id="initVenvBtn">Zainicjalizuj .venv</button>
        </div>`;
    }

    private _escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private _getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
