import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PythonInfo {
    found: boolean;
    version: string | null;
    path: string | null;
    fullVersion: string | null;
}

export class PythonDetector {
    private static readonly PYTHON_COMMANDS = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10', 'python3.9'];

    /**
     * Detect Python installation on the system
     */
    public static async detect(): Promise<PythonInfo> {
        const platform = os.platform();

        // Try commands in PATH first
        for (const cmd of this.PYTHON_COMMANDS) {
            const result = await this.tryPythonCommand(cmd);
            if (result.found) {
                return result;
            }
        }

        // Try platform-specific locations
        const platformPaths = this.getPlatformSpecificPaths(platform);
        for (const pythonPath of platformPaths) {
            if (fs.existsSync(pythonPath)) {
                const result = await this.tryPythonCommand(pythonPath);
                if (result.found) {
                    return result;
                }
            }
        }

        return {
            found: false,
            version: null,
            path: null,
            fullVersion: null
        };
    }

    /**
     * Try to execute a Python command and get version info
     */
    private static async tryPythonCommand(command: string): Promise<PythonInfo> {
        return new Promise((resolve) => {
            try {
                // Get version
                child_process.exec(`"${command}" --version`, { timeout: 5000 }, (error, stdout, stderr) => {
                    if (error) {
                        resolve({ found: false, version: null, path: null, fullVersion: null });
                        return;
                    }

                    const versionOutput = stdout.trim() || stderr.trim();
                    const versionMatch = versionOutput.match(/Python (\d+\.\d+\.\d+)/i);

                    if (versionMatch) {
                        // Get the actual path
                        this.getPythonPath(command).then((pythonPath) => {
                            resolve({
                                found: true,
                                version: versionMatch[1],
                                fullVersion: versionOutput,
                                path: pythonPath || command
                            });
                        });
                    } else {
                        resolve({ found: false, version: null, path: null, fullVersion: null });
                    }
                });
            } catch {
                resolve({ found: false, version: null, path: null, fullVersion: null });
            }
        });
    }

    /**
     * Get the full path to Python executable
     */
    private static async getPythonPath(command: string): Promise<string | null> {
        return new Promise((resolve) => {
            const platform = os.platform();
            const whichCommand = platform === 'win32' ? 'where' : 'which';

            child_process.exec(`${whichCommand} "${command}"`, { timeout: 5000 }, (error, stdout) => {
                if (error) {
                    resolve(null);
                    return;
                }

                const paths = stdout.trim().split(/\r?\n/);
                resolve(paths[0] || null);
            });
        });
    }

    /**
     * Get platform-specific Python installation paths
     */
    private static getPlatformSpecificPaths(platform: NodeJS.Platform): string[] {
        switch (platform) {
            case 'win32':
                return this.getWindowsPaths();
            case 'darwin':
                return this.getMacOSPaths();
            case 'linux':
                return this.getLinuxPaths();
            default:
                return [];
        }
    }

    /**
     * Get common Python paths on Windows
     */
    private static getWindowsPaths(): string[] {
        const paths: string[] = [];
        const userProfile = process.env.USERPROFILE || process.env.HOME || '';
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');

        // Python Launcher
        paths.push(path.join(localAppData, 'Programs', 'Python', 'Launcher', 'py.exe'));

        // Standard Python installations
        for (const version of ['313', '312', '311', '310', '39', '38']) {
            paths.push(path.join(localAppData, 'Programs', 'Python', `Python${version}`, 'python.exe'));
            paths.push(path.join(programFiles, `Python${version}`, 'python.exe'));
            paths.push(path.join(programFilesX86, `Python${version}`, 'python.exe'));
        }

        // Anaconda/Miniconda
        paths.push(path.join(userProfile, 'Anaconda3', 'python.exe'));
        paths.push(path.join(userProfile, 'Miniconda3', 'python.exe'));
        paths.push(path.join(programFiles, 'Anaconda3', 'python.exe'));

        // Scoop
        paths.push(path.join(userProfile, 'scoop', 'apps', 'python', 'current', 'python.exe'));

        return paths;
    }

    /**
     * Get common Python paths on macOS
     */
    private static getMacOSPaths(): string[] {
        const paths: string[] = [];
        const home = process.env.HOME || '';

        // Homebrew
        paths.push('/opt/homebrew/bin/python3');
        paths.push('/usr/local/bin/python3');

        // System Python
        paths.push('/usr/bin/python3');

        // pyenv
        paths.push(path.join(home, '.pyenv', 'shims', 'python3'));
        paths.push(path.join(home, '.pyenv', 'shims', 'python'));

        // Anaconda/Miniconda
        paths.push(path.join(home, 'anaconda3', 'bin', 'python3'));
        paths.push(path.join(home, 'miniconda3', 'bin', 'python3'));
        paths.push('/opt/anaconda3/bin/python3');

        return paths;
    }

    /**
     * Get common Python paths on Linux
     */
    private static getLinuxPaths(): string[] {
        const paths: string[] = [];
        const home = process.env.HOME || '';

        // System Python
        paths.push('/usr/bin/python3');
        paths.push('/usr/bin/python');
        paths.push('/usr/local/bin/python3');

        // pyenv
        paths.push(path.join(home, '.pyenv', 'shims', 'python3'));
        paths.push(path.join(home, '.pyenv', 'shims', 'python'));

        // Anaconda/Miniconda
        paths.push(path.join(home, 'anaconda3', 'bin', 'python3'));
        paths.push(path.join(home, 'miniconda3', 'bin', 'python3'));

        // Deadsnakes PPA versions
        for (const version of ['3.12', '3.11', '3.10', '3.9']) {
            paths.push(`/usr/bin/python${version}`);
        }

        return paths;
    }
}
