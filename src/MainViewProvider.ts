import * as vscode from 'vscode';
import { PythonDetector, PythonInfo } from './pythonDetector';
import { ScriptMetadata, ScriptValidator } from './scriptValidator';
import { ScriptRunner } from './scriptRunner';
import { translations } from './translations';
import { VenvManager, VenvStatus } from './venvManager';
import { MainViewHtmlRenderer } from './webview/MainViewHtmlRenderer';
import { MainViewState } from './webview/MainViewState';

type ToastType = 'info' | 'error';

interface WebviewMessage {
    type: string;
    scriptPath?: string;
}

export class MainViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'python-venv-toolkit.mainView';

    private view: vscode.WebviewView | undefined;
    private pythonInfo: PythonInfo | null = null;
    private venvStatus: VenvStatus | null = null;
    private scripts: ScriptMetadata[] = [];
    private selectedScriptPath: string | null = null;
    private isDetectingPython = false;
    private isVenvOperationInProgress = false;
    private venvOperationMessage = '';
    private readonly outputChannel: vscode.OutputChannel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly renderer = new MainViewHtmlRenderer();

    public constructor(private readonly extensionUri: vscode.Uri) {
        this.outputChannel = vscode.window.createOutputChannel('Python Venv Toolkit');
        this.bootstrap();
    }

    public dispose(): void {
        this.outputChannel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
        this.view = undefined;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        this.renderView();

        this.disposables.push(webviewView.webview.onDidReceiveMessage(async (data: WebviewMessage) => {
            await this.handleMessage(data);
        }));

        this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            await this.bootstrap();
        }));

        webviewView.onDidDispose(() => {
            this.view = undefined;
        });
    }

    private async handleMessage(data: WebviewMessage): Promise<void> {
        switch (data.type) {
            case 'openWorkspace':
                await this.openWorkspace();
                break;
            case 'refresh':
                await this.bootstrap();
                break;
            case 'selectScript':
                this.selectScript(data.scriptPath);
                break;
            case 'runScript':
                await this.runSelectedScript();
                break;
            case 'initVenv':
                await this.initializeVenv(false);
                break;
            case 'reinitVenv':
                await this.initializeVenv(true);
                break;
            case 'installDependencies':
                await this.installDependencies();
                break;
            case 'openScript':
                await this.openSelectedScript();
                break;
        }
    }

    private async bootstrap(): Promise<void> {
        await this.detectPython();
        this.loadScripts();
        await this.checkVenvStatus();

        if (this.hasWorkspace() && this.pythonInfo?.found && !this.venvStatus?.isValid) {
            await this.initializeVenv(false);
        }

        this.renderView();
    }

    private async detectPython(): Promise<void> {
        this.isDetectingPython = true;
        this.renderView();
        this.pythonInfo = await PythonDetector.detect();
        this.isDetectingPython = false;
        this.renderView();
    }

    private loadScripts(): void {
        const workspacePath = this.getWorkspacePath();
        if (!workspacePath) {
            this.scripts = [];
            this.selectedScriptPath = null;
            return;
        }

        this.scripts = ScriptValidator.getValidScripts(workspacePath);
        if (!this.selectedScriptPath || !this.scripts.some(script => script.filePath === this.selectedScriptPath)) {
            this.selectedScriptPath = this.scripts[0]?.filePath ?? null;
        }
    }

    private async checkVenvStatus(): Promise<void> {
        const workspacePath = this.getWorkspacePath();
        this.venvStatus = workspacePath ? await VenvManager.checkVenvStatus(workspacePath) : null;
    }

    private async initializeVenv(forceRecreate: boolean): Promise<void> {
        const workspacePath = this.getWorkspacePath();
        if (!workspacePath || !this.pythonInfo?.found || !this.pythonInfo.path) {
            this.sendToast(translations.notifications.openWorkspaceAndEnsurePython, 'error');
            return;
        }

        this.startVenvOperation(
            forceRecreate ? translations.progress.reinitializingVenv : translations.progress.initializingVenv
        );

        if (forceRecreate) {
            const deleteResult = await VenvManager.deleteVenv(workspacePath);
            if (!deleteResult.success) {
                this.finishVenvOperation();
                this.sendToast(deleteResult.error || translations.notifications.failedToRemoveVenv, 'error');
                return;
            }
        }

        const result = await VenvManager.ensureVenvAndInstallDependencies(
            workspacePath,
            workspacePath,
            this.pythonInfo.path,
            message => this.updateVenvOperation(message)
        );

        await this.refreshVenvAfterOperation();

        if (!result.venvResult.success) {
            this.sendToast(result.venvResult.error || translations.notifications.failedToCreateVenv, 'error');
            return;
        }

        if (result.installResult?.failed.length) {
            this.sendToast(translations.notifications.failedToInstall(result.installResult.failed.join(', ')), 'error');
            return;
        }

        this.sendToast(
            forceRecreate ? translations.notifications.venvReinitialized : translations.notifications.venvReady,
            'info'
        );
    }

    private async installDependencies(): Promise<void> {
        const workspacePath = this.getWorkspacePath();
        if (!workspacePath || !this.venvStatus?.isValid) {
            this.sendToast(translations.notifications.createValidVenvFirst, 'error');
            return;
        }

        this.startVenvOperation(translations.progress.installingDependenciesFromImports);

        const result = await VenvManager.installDependencies(
            workspacePath,
            workspacePath,
            message => this.updateVenvOperation(message)
        );

        await this.refreshVenvAfterOperation();
        this.sendToast(result.message, result.success ? 'info' : 'error');
    }

    private async runSelectedScript(): Promise<void> {
        const workspacePath = this.getWorkspacePath();
        const script = this.scripts.find(item => item.filePath === this.selectedScriptPath);

        if (!workspacePath || !script) {
            this.sendToast(translations.notifications.selectPythonScript, 'error');
            return;
        }

        if (!this.pythonInfo?.found) {
            this.sendToast(translations.notifications.pythonNotDetected, 'error');
            return;
        }

        if (!this.venvStatus?.isValid) {
            await this.initializeVenv(false);
        }

        const result = await ScriptRunner.runScriptWithProgress(
            script,
            this.pythonInfo,
            workspacePath,
            this.venvStatus?.pythonPath
        );

        ScriptRunner.showResultInOutput(script, result, this.outputChannel);
        this.sendToast(
            result.success ? translations.notifications.scriptFinished : translations.notifications.scriptFailed,
            result.success ? 'info' : 'error'
        );
    }

    private selectScript(scriptPath?: string): void {
        this.selectedScriptPath = scriptPath || null;
        this.renderView();
    }

    private async openWorkspace(): Promise<void> {
        await vscode.commands.executeCommand('vscode.openFolder');
    }

    private async openSelectedScript(): Promise<void> {
        const script = this.scripts.find(item => item.filePath === this.selectedScriptPath);
        if (!script) {
            return;
        }
        const document = await vscode.workspace.openTextDocument(script.filePath);
        await vscode.window.showTextDocument(document);
    }

    private startVenvOperation(message: string): void {
        this.isVenvOperationInProgress = true;
        this.updateVenvOperation(message);
    }

    private updateVenvOperation(message: string): void {
        this.venvOperationMessage = message;
        this.renderView();
    }

    private async refreshVenvAfterOperation(): Promise<void> {
        this.finishVenvOperation();
        await this.checkVenvStatus();
        this.renderView();
    }

    private finishVenvOperation(): void {
        this.isVenvOperationInProgress = false;
        this.renderView();
    }

    private hasWorkspace(): boolean {
        return Boolean(this.getWorkspacePath());
    }

    private getWorkspacePath(): string | null {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    }

    private sendToast(message: string, type: ToastType): void {
        if (this.view) {
            this.view.webview.postMessage({ type: 'toast', message, toastType: type });
            return;
        }

        if (type === 'error') {
            vscode.window.showErrorMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    }

    private renderView(): void {
        if (this.view) {
            const editIconUri = this.view.webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'media', 'edit_fontawesome.svg')
            ).toString();
            this.view.webview.html = this.renderer.render(this.getState(), editIconUri, this.view.webview.cspSource);
        }
    }

    private getState(): MainViewState {
        return {
            pythonInfo: this.pythonInfo,
            venvStatus: this.venvStatus,
            scripts: this.scripts,
            selectedScriptPath: this.selectedScriptPath,
            isDetectingPython: this.isDetectingPython,
            isVenvOperationInProgress: this.isVenvOperationInProgress,
            venvOperationMessage: this.venvOperationMessage,
            workspacePath: this.getWorkspacePath()
        };
    }
}
