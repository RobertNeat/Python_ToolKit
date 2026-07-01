import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import { ScriptMetadata } from './scriptValidator';
import { PythonInfo } from './pythonDetector';

export interface ScriptRunResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode: number | null;
}

export class ScriptRunner {
    public static async runScript(
        script: ScriptMetadata,
        pythonPath: string,
        workspacePath: string
    ): Promise<ScriptRunResult> {
        return new Promise((resolve) => {
            childProcess.execFile(
                pythonPath,
                [script.filePath],
                {
                    cwd: workspacePath,
                    timeout: 300000,
                    maxBuffer: 10 * 1024 * 1024,
                    encoding: 'utf-8',
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                },
                (error, stdout, stderr) => {
                    const output = stdout + (stderr ? `\n${stderr}` : '');

                    if (error) {
                        resolve({
                            success: false,
                            output,
                            error: error.message,
                            exitCode: typeof error.code === 'number' ? error.code : null
                        });
                        return;
                    }

                    resolve({
                        success: true,
                        output,
                        exitCode: 0
                    });
                }
            );
        });
    }

    public static async runScriptWithProgress(
        script: ScriptMetadata,
        pythonInfo: PythonInfo,
        workspacePath: string,
        venvPythonPath?: string | null
    ): Promise<ScriptRunResult> {
        const pythonPath = venvPythonPath || pythonInfo.path;

        if (!pythonPath) {
            return {
                success: false,
                output: '',
                error: 'Python nie został wykryty',
                exitCode: null
            };
        }

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Uruchamianie: ${script.name}`,
                cancellable: false
            },
            async () => this.runScript(script, pythonPath, workspacePath)
        );
    }

    public static showResultInOutput(
        script: ScriptMetadata,
        result: ScriptRunResult,
        outputChannel: vscode.OutputChannel
    ): void {
        outputChannel.clear();
        outputChannel.appendLine(`=== ${script.name} ===`);
        outputChannel.appendLine(`Plik: ${script.filePath}`);
        outputChannel.appendLine(`Status: ${result.success ? 'Sukces' : 'Błąd'}`);
        outputChannel.appendLine('');
        outputChannel.appendLine('--- Wyjście ---');
        outputChannel.appendLine(result.output || '(brak wyjścia)');

        if (result.error) {
            outputChannel.appendLine('');
            outputChannel.appendLine('--- Błąd ---');
            outputChannel.appendLine(result.error);
        }

        outputChannel.show(true);
    }
}
