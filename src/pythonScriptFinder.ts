import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_IGNORED_DIRECTORIES = new Set([
    '.git',
    '.venv',
    'venv',
    'env',
    'node_modules',
    'dist',
    'out',
    '__pycache__'
]);

export class PythonScriptFinder {
    public constructor(
        private readonly ignoredDirectories: ReadonlySet<string> = DEFAULT_IGNORED_DIRECTORIES
    ) {}

    public find(directoryPath: string): string[] {
        if (!fs.existsSync(directoryPath)) {
            return [];
        }

        return this.findInExistingDirectory(directoryPath);
    }

    private findInExistingDirectory(directoryPath: string): string[] {
        const scripts: string[] = [];

        for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
            const entryPath = path.join(directoryPath, entry.name);

            if (entry.isDirectory()) {
                if (!this.ignoredDirectories.has(entry.name)) {
                    scripts.push(...this.findInExistingDirectory(entryPath));
                }
                continue;
            }

            if (entry.isFile() && entry.name.endsWith('.py')) {
                scripts.push(entryPath);
            }
        }

        return scripts;
    }
}
