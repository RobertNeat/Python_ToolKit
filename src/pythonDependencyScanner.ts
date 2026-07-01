import * as fs from 'fs';
import { MODULE_TO_PACKAGE, STDLIB_MODULES } from './pythonDependencyCatalog';
import { PythonScriptFinder } from './pythonScriptFinder';

export class PythonDependencyScanner {
    public constructor(private readonly scriptFinder = new PythonScriptFinder()) {}

    public scanScriptsForImports(scriptsPath: string): string[] {
        if (!fs.existsSync(scriptsPath)) {
            return [];
        }

        const imports = new Set<string>();
        const files = this.scriptFinder.find(scriptsPath);

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const fileImports = this.extractImports(content);
            fileImports.forEach(imp => imports.add(imp));
        }

        return Array.from(imports)
            .filter(imp => !STDLIB_MODULES.has(imp))
            .map(imp => this.mapModuleToPackage(imp));
    }

    private mapModuleToPackage(moduleName: string): string {
        if (MODULE_TO_PACKAGE[moduleName]) {
            return MODULE_TO_PACKAGE[moduleName];
        }

        const lowerModuleName = moduleName.toLowerCase();
        const mappedKey = Object.keys(MODULE_TO_PACKAGE).find(
            key => key.toLowerCase() === lowerModuleName
        );

        return mappedKey ? MODULE_TO_PACKAGE[mappedKey] : moduleName;
    }

    private extractImports(content: string): string[] {
        const imports: string[] = [];
        const importPattern = /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
        const fromImportPattern = /^\s*from\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
        const dynamicImportPattern = /__import__\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/gm;
        const depDictPattern = /\b(?:REQUIRED|PACKAGES?|DEPEND|DEPS|IMPORTS?|LIBRARIES)\w*\s*=\s*\{([^}]*)\}/gi;
        const pipInstallPattern = /pip3?\s+install\s+([^\n{]+)/gm;

        this.collectMatches(importPattern, content, imports);
        this.collectMatches(fromImportPattern, content, imports);
        this.collectMatches(dynamicImportPattern, content, imports);
        this.collectDependencyDictionaryKeys(depDictPattern, content, imports);
        this.collectPipInstallTokens(pipInstallPattern, content, imports);

        return [...new Set(imports)];
    }

    private collectMatches(pattern: RegExp, content: string, imports: string[]): void {
        let match;

        while ((match = pattern.exec(content)) !== null) {
            imports.push(match[1]);
        }
    }

    private collectDependencyDictionaryKeys(pattern: RegExp, content: string, imports: string[]): void {
        let match;

        while ((match = pattern.exec(content)) !== null) {
            const dictContent = match[1];
            const keyPattern = /['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*:/g;
            this.collectMatches(keyPattern, dictContent, imports);
        }
    }

    private collectPipInstallTokens(pattern: RegExp, content: string, imports: string[]): void {
        let match;

        while ((match = pattern.exec(content)) !== null) {
            const tokens = match[1].trim().split(/\s+/);
            for (const token of tokens) {
                if (/^[a-zA-Z_][\w-]*$/.test(token)) {
                    imports.push(token);
                }
            }
        }
    }
}
