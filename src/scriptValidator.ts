import * as fs from 'fs';
import * as path from 'path';
import { PythonScriptFinder } from './pythonScriptFinder';
import { translations } from './translations';

export interface ScriptMetadata {
    filePath: string;
    fileName: string;
    name: string;
    description: string;
    isValid: boolean;
    validationError?: string;
}

export class ScriptValidator {
    private static readonly SCRIPT_NAME_PATTERN = /(?:SCRIPT_NAME|RULE_NAME):\s*(.+?)(?:\r?\n|$)/;
    private static readonly SCRIPT_DESCRIPTION_PATTERN = /(?:SCRIPT_DESCRIPTION|RULE_DESCRIPTION):\s*(.+?)(?:\r?\n|$)/;
    private static readonly scriptFinder = new PythonScriptFinder();

    public static validateScript(filePath: string): ScriptMetadata {
        const fileName = path.basename(filePath, '.py');
        const metadata: ScriptMetadata = {
            filePath,
            fileName,
            name: this.formatFileName(fileName),
            description: '',
            isValid: false
        };

        if (!fs.existsSync(filePath)) {
            metadata.validationError = translations.validation.fileDoesNotExist;
            return metadata;
        }

        let content = '';
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            metadata.validationError = error instanceof Error ? error.message : translations.validation.cannotReadFile;
            return metadata;
        }

        const nameMatch = content.match(this.SCRIPT_NAME_PATTERN);
        if (nameMatch?.[1]) {
            metadata.name = nameMatch[1].trim();
        }

        const descriptionMatch = content.match(this.SCRIPT_DESCRIPTION_PATTERN);
        if (descriptionMatch?.[1]) {
            metadata.description = descriptionMatch[1].trim();
        }

        metadata.isValid = true;
        return metadata;
    }

    public static validateScriptsInDirectory(rootPath: string): ScriptMetadata[] {
        if (!fs.existsSync(rootPath)) {
            return [];
        }

        return this.scriptFinder.find(rootPath)
            .map(filePath => this.validateScript(filePath))
            .sort((a, b) => a.filePath.localeCompare(b.filePath));
    }

    public static getValidScripts(rootPath: string): ScriptMetadata[] {
        return this.validateScriptsInDirectory(rootPath).filter(script => script.isValid);
    }

    private static formatFileName(fileName: string): string {
        return fileName
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}
