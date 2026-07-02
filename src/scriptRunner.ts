import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import { PythonInfo } from './pythonDetector';
import { ScriptMetadata } from './scriptValidator';
import { translations } from './translations';

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
                error: translations.notifications.pythonNotDetected,
                exitCode: null
            };
        }

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: translations.output.running(script.name),
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
        outputChannel.appendLine(`${translations.output.file}: ${script.filePath}`);
        outputChannel.appendLine(`${translations.output.status}: ${result.success ? translations.output.success : translations.output.error}`);
        outputChannel.appendLine('');
        outputChannel.appendLine(translations.output.output);
        outputChannel.appendLine(result.output || translations.output.noOutput);

        if (result.error) {
            outputChannel.appendLine('');
            outputChannel.appendLine(`--- ${translations.output.error} ---`);
            outputChannel.appendLine(result.error);
        }

        outputChannel.show(true);
    }
}
