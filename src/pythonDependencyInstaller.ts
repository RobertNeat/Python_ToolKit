import * as child_process from 'child_process';
import { BASE_PACKAGES } from './pythonDependencyCatalog';
import { PythonDependencyScanner } from './pythonDependencyScanner';
import { translations } from './translations';

export interface InstallResult {
    success: boolean;
    installed: string[];
    failed: string[];
    alreadyInstalled: string[];
    message: string;
}

export class PythonDependencyInstaller {
    public constructor(private readonly dependencyScanner = new PythonDependencyScanner()) {}

    public async installDependencies(
        pipPath: string,
        scriptsPath: string,
        onProgress?: (message: string) => void
    ): Promise<InstallResult> {
        const scriptPackages = this.dependencyScanner.scanScriptsForImports(scriptsPath);
        const packages = Array.from(new Set([...BASE_PACKAGES, ...scriptPackages]));

        if (packages.length === 0) {
            return {
                success: true,
                installed: [],
                failed: [],
                alreadyInstalled: [],
                message: translations.results.noExternalPackagesFound
            };
        }

        const installed: string[] = [];
        const failed: string[] = [];
        const alreadyInstalled: string[] = [];

        onProgress?.(translations.progress.upgradingPip);
        await this.upgradePip(pipPath);

        for (const packageName of packages) {
            onProgress?.(translations.progress.installingPackage(packageName));

            const result = await this.installPackage(pipPath, packageName);

            if (result.success) {
                if (result.alreadyInstalled) {
                    alreadyInstalled.push(packageName);
                } else {
                    installed.push(packageName);
                }
            } else {
                failed.push(packageName);
            }
        }

        return {
            success: failed.length === 0,
            installed,
            failed,
            alreadyInstalled,
            message: this.buildInstallMessage(installed, failed, alreadyInstalled)
        };
    }

    private async installPackage(
        pipPath: string,
        packageName: string
    ): Promise<{ success: boolean; alreadyInstalled: boolean; error?: string }> {
        return new Promise((resolve) => {
            const command = `"${pipPath}" install "${packageName}"`;

            child_process.exec(
                command,
                { timeout: 300000 },
                (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            success: false,
                            alreadyInstalled: false,
                            error: stderr || error.message
                        });
                        return;
                    }

                    const alreadyInstalled = stdout.includes('already satisfied') ||
                                              stdout.includes('Requirement already');
                    resolve({
                        success: true,
                        alreadyInstalled
                    });
                }
            );
        });
    }

    private async upgradePip(pipPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            const command = `"${pipPath}" install --upgrade pip`;

            child_process.exec(
                command,
                { timeout: 120000 },
                (error) => {
                    resolve(!error);
                }
            );
        });
    }

    private buildInstallMessage(installed: string[], failed: string[], alreadyInstalled: string[]): string {
        if (failed.length > 0) {
            return translations.results.failedToInstallLibraries(failed.length, failed.join(', '));
        }

        if (installed.length === 0 && alreadyInstalled.length > 0) {
            return translations.results.allPackagesAlreadyInstalled;
        }

        if (installed.length > 0) {
            return translations.results.installedLibraries(installed.length);
        }

        return translations.results.installationCompleted;
    }
}
