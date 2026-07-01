import * as vscode from 'vscode';
import { MainViewProvider } from './MainViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    console.log('Python Venv Toolkit is active.');

    const mainViewProvider = new MainViewProvider(context.extensionUri);
    const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
        MainViewProvider.viewType,
        mainViewProvider
    );

    context.subscriptions.push(viewProviderDisposable, mainViewProvider);
}

export function deactivate(): void {
    // VS Code disposes registered subscriptions automatically.
}
