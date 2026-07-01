import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Status środowiska wirtualnego
 */
export interface VenvStatus {
    exists: boolean;
    pythonPath: string | null;
    pipPath: string | null;
    isValid: boolean;
    error?: string;
}

/**
 * Wynik instalacji bibliotek
 */
export interface InstallResult {
    success: boolean;
    installed: string[];
    failed: string[];
    alreadyInstalled: string[];
    message: string;
}

/**
 * Wynik operacji na venv
 */
export interface VenvOperationResult {
    success: boolean;
    message: string;
    error?: string;
}

/**
 * Manager środowiska wirtualnego Python dla Python Venv Toolkit.
 *
 * Zarządza środowiskiem wirtualnym `py_doc_automator_venv` w folderze roboczym,
 * skanuje skrypty w poszukiwaniu importów i instaluje wymagane biblioteki.
 */
export class VenvManager {
    public static readonly VENV_NAME = '.venv';
    private static readonly IGNORED_DIRECTORIES = new Set([
        '.git',
        '.venv',
        'venv',
        'env',
        'node_modules',
        'dist',
        'out',
        '__pycache__'
    ]);

    /**
     * Lista bibliotek standardowych Python, które nie wymagają instalacji
     */
    private static readonly STDLIB_MODULES = new Set([
        'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio', 'asyncore',
        'atexit', 'audioop', 'base64', 'bdb', 'binascii', 'binhex', 'bisect', 'builtins',
        'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd', 'code', 'codecs',
        'codeop', 'collections', 'colorsys', 'compileall', 'concurrent', 'configparser',
        'contextlib', 'contextvars', 'copy', 'copyreg', 'cProfile', 'crypt', 'csv',
        'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm', 'decimal', 'difflib',
        'dis', 'distutils', 'doctest', 'email', 'encodings', 'enum', 'errno', 'faulthandler',
        'fcntl', 'filecmp', 'fileinput', 'fnmatch', 'fractions', 'ftplib', 'functools',
        'gc', 'getopt', 'getpass', 'gettext', 'glob', 'graphlib', 'grp', 'gzip',
        'hashlib', 'heapq', 'hmac', 'html', 'http', 'idlelib', 'imaplib', 'imghdr',
        'imp', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword',
        'lib2to3', 'linecache', 'locale', 'logging', 'lzma', 'mailbox', 'mailcap',
        'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder', 'multiprocessing',
        'netrc', 'nis', 'nntplib', 'numbers', 'operator', 'optparse', 'os', 'ossaudiodev',
        'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil', 'platform',
        'plistlib', 'poplib', 'posix', 'posixpath', 'pprint', 'profile', 'pstats',
        'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri', 'random',
        're', 'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy', 'sched',
        'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal',
        'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver', 'spwd',
        'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
        'subprocess', 'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny',
        'tarfile', 'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading',
        'time', 'timeit', 'tkinter', 'token', 'tokenize', 'trace', 'traceback',
        'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing', 'unicodedata',
        'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave', 'weakref',
        'webbrowser', 'winreg', 'winsound', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc',
        'zipapp', 'zipfile', 'zipimport', 'zlib', '_thread'
    ]);

    /**
     * Mapowanie popularnych nazw modułów na nazwy pakietów pip
     */
    private static readonly MODULE_TO_PACKAGE: Record<string, string> = {
        'fitz': 'PyMuPDF',
        'PIL': 'Pillow',
        'cv2': 'opencv-python',
        'sklearn': 'scikit-learn',
        'yaml': 'PyYAML',
        'bs4': 'beautifulsoup4',
        'dotenv': 'python-dotenv',
        'win32com': 'pywin32',
        'win32api': 'pywin32',
        'win32con': 'pywin32',
        'win32gui': 'pywin32',
        'pythoncom': 'pywin32',
        'pywintypes': 'pywin32',
        'docx': 'python-docx',
        'pptx': 'python-pptx',
        'openpyxl': 'openpyxl',
        'xlrd': 'xlrd',
        'xlwt': 'xlwt',
        'numpy': 'numpy',
        'pandas': 'pandas',
        'requests': 'requests',
        'flask': 'Flask',
        'django': 'Django',
        'sqlalchemy': 'SQLAlchemy',
        'pytest': 'pytest',
        'matplotlib': 'matplotlib',
        'seaborn': 'seaborn',
        'scipy': 'scipy',
        'tensorflow': 'tensorflow',
        'torch': 'torch',
        'keras': 'keras',
        'reportlab': 'reportlab',
        'pypdf2': 'PyPDF2',
        'pypdf': 'pypdf',
        'pdfplumber': 'pdfplumber',
        'tabula': 'tabula-py',
        'camelot': 'camelot-py',
        'img2pdf': 'img2pdf',
        'pdf2image': 'pdf2image',
    };

    private static readonly BASE_PACKAGES: string[] = [];

    /**
     * Pobiera ścieżkę do folderu venv
     */
    public static getVenvPath(workspacePath: string): string {
        return path.join(workspacePath, this.VENV_NAME);
    }

    /**
     * Pobiera ścieżkę do interpretera Python w venv
     */
    public static getVenvPythonPath(workspacePath: string): string {
        const venvPath = this.getVenvPath(workspacePath);
        const platform = os.platform();

        if (platform === 'win32') {
            return path.join(venvPath, 'Scripts', 'python.exe');
        }
        return path.join(venvPath, 'bin', 'python');
    }

    /**
     * Pobiera ścieżkę do pip w venv
     */
    public static getVenvPipPath(workspacePath: string): string {
        const venvPath = this.getVenvPath(workspacePath);
        const platform = os.platform();

        if (platform === 'win32') {
            return path.join(venvPath, 'Scripts', 'pip.exe');
        }
        return path.join(venvPath, 'bin', 'pip');
    }

    /**
     * Sprawdza status środowiska wirtualnego
     */
    public static async checkVenvStatus(workspacePath: string): Promise<VenvStatus> {
        const venvPath = this.getVenvPath(workspacePath);
        const pythonPath = this.getVenvPythonPath(workspacePath);
        const pipPath = this.getVenvPipPath(workspacePath);

        // Sprawdź czy folder venv istnieje
        if (!fs.existsSync(venvPath)) {
            return {
                exists: false,
                pythonPath: null,
                pipPath: null,
                isValid: false
            };
        }

        // Sprawdź czy python istnieje w venv
        if (!fs.existsSync(pythonPath)) {
            return {
                exists: true,
                pythonPath: null,
                pipPath: null,
                isValid: false,
                error: 'Brak interpretera Python w środowisku wirtualnym'
            };
        }

        // Sprawdź czy pip istnieje w venv
        if (!fs.existsSync(pipPath)) {
            return {
                exists: true,
                pythonPath,
                pipPath: null,
                isValid: false,
                error: 'Brak pip w środowisku wirtualnym'
            };
        }

        // Weryfikacja działania Pythona w venv
        const isValid = await this.verifyVenvPython(pythonPath);

        return {
            exists: true,
            pythonPath,
            pipPath,
            isValid,
            error: isValid ? undefined : 'Środowisko wirtualne jest uszkodzone'
        };
    }

    /**
     * Weryfikuje czy Python w venv działa poprawnie
     */
    private static async verifyVenvPython(pythonPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            child_process.exec(
                `"${pythonPath}" --version`,
                { timeout: 10000 },
                (error) => {
                    resolve(!error);
                }
            );
        });
    }

    /**
     * Tworzy nowe środowisko wirtualne
     */
    public static async createVenv(
        workspacePath: string,
        systemPythonPath: string
    ): Promise<VenvOperationResult> {
        const venvPath = this.getVenvPath(workspacePath);

        return new Promise((resolve) => {
            const command = `"${systemPythonPath}" -m venv "${venvPath}"`;

            child_process.exec(
                command,
                { timeout: 120000 }, // 2 minuty timeout
                (error, _stdout, stderr) => {
                    if (error) {
                        resolve({
                            success: false,
                            message: 'Nie udało się utworzyć środowiska wirtualnego',
                            error: stderr || error.message
                        });
                    } else {
                        resolve({
                            success: true,
                            message: 'Środowisko wirtualne zostało utworzone'
                        });
                    }
                }
            );
        });
    }

    /**
     * Usuwa środowisko wirtualne
     */
    public static async deleteVenv(workspacePath: string): Promise<VenvOperationResult> {
        const venvPath = this.getVenvPath(workspacePath);

        if (!fs.existsSync(venvPath)) {
            return {
                success: true,
                message: 'Środowisko wirtualne nie istnieje'
            };
        }

        return new Promise((resolve) => {
            try {
                fs.rmSync(venvPath, { recursive: true, force: true });
                resolve({
                    success: true,
                    message: 'Środowisko wirtualne zostało usunięte'
                });
            } catch (error) {
                resolve({
                    success: false,
                    message: 'Nie udało się usunąć środowiska wirtualnego',
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
    }

    /**
     * Re-inicjalizuje środowisko wirtualne (usuwa i tworzy na nowo)
     */
    public static async reinitializeVenv(
        workspacePath: string,
        systemPythonPath: string
    ): Promise<VenvOperationResult> {
        // Najpierw usuń istniejące venv
        const deleteResult = await this.deleteVenv(workspacePath);
        if (!deleteResult.success) {
            return deleteResult;
        }

        // Następnie utwórz nowe
        return this.createVenv(workspacePath, systemPythonPath);
    }

    /**
     * Skanuje skrypty Python w poszukiwaniu importów
     */
    public static scanScriptsForImports(scriptsPath: string): string[] {
        if (!fs.existsSync(scriptsPath)) {
            return [];
        }

        const imports = new Set<string>();
        const files = this.findPythonScripts(scriptsPath);

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const fileImports = this.extractImports(content);
            fileImports.forEach(imp => imports.add(imp));
        }

        // Filtruj biblioteki standardowe
        const externalImports = Array.from(imports).filter(
            imp => !this.STDLIB_MODULES.has(imp)
        );

        // Mapuj nazwy modułów na nazwy pakietów pip (case-insensitive lookup)
        return externalImports.map(imp => {
            if (this.MODULE_TO_PACKAGE[imp]) {
                return this.MODULE_TO_PACKAGE[imp];
            }
            const lowerImp = imp.toLowerCase();
            const mappedKey = Object.keys(this.MODULE_TO_PACKAGE).find(
                key => key.toLowerCase() === lowerImp
            );
            return mappedKey ? this.MODULE_TO_PACKAGE[mappedKey] : imp;
        });
    }

    /**
     * Wyciąga nazwy importowanych modułów z kodu Python
     */
    private static extractImports(content: string): string[] {
        const imports: string[] = [];

        // Pattern dla "import module" i "import module as alias" (z opcjonalnym wcięciem)
        const importPattern = /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;

        // Pattern dla "from module import something" (z opcjonalnym wcięciem)
        const fromImportPattern = /^\s*from\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;

        // Pattern dla "__import__('module')" i '__import__("module")'
        const dynamicImportPattern = /__import__\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/gm;

        // Pattern dla słowników z zależnościami (np. REQUIRED_PACKAGES = {'module': 'pip_name'})
        const depDictPattern = /\b(?:REQUIRED|PACKAGES?|DEPEND|DEPS|IMPORTS?|LIBRARIES)\w*\s*=\s*\{([^}]*)\}/gi;

        // Pattern dla "pip install package1 package2" w komentarzach/stringach
        const pipInstallPattern = /pip3?\s+install\s+([^\n{]+)/gm;

        let match;

        while ((match = importPattern.exec(content)) !== null) {
            imports.push(match[1]);
        }

        while ((match = fromImportPattern.exec(content)) !== null) {
            imports.push(match[1]);
        }

        while ((match = dynamicImportPattern.exec(content)) !== null) {
            imports.push(match[1]);
        }

        // Wyciągnij nazwy modułów ze słowników z zależnościami
        while ((match = depDictPattern.exec(content)) !== null) {
            const dictContent = match[1];
            const keyPattern = /['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*:/g;
            let keyMatch;
            while ((keyMatch = keyPattern.exec(dictContent)) !== null) {
                imports.push(keyMatch[1]);
            }
        }

        // Wyciągnij nazwy pakietów z "pip install ..." w komentarzach/stringach
        while ((match = pipInstallPattern.exec(content)) !== null) {
            const tokens = match[1].trim().split(/\s+/);
            for (const token of tokens) {
                if (/^[a-zA-Z_][\w-]*$/.test(token)) {
                    imports.push(token);
                }
            }
        }

        return [...new Set(imports)];
    }

    /**
     * Instaluje pojedynczą bibliotekę
     */
    private static async installPackage(
        pipPath: string,
        packageName: string
    ): Promise<{ success: boolean; alreadyInstalled: boolean; error?: string }> {
        return new Promise((resolve) => {
            const command = `"${pipPath}" install "${packageName}"`;

            child_process.exec(
                command,
                { timeout: 300000 }, // 5 minut timeout
                (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            success: false,
                            alreadyInstalled: false,
                            error: stderr || error.message
                        });
                    } else {
                        const alreadyInstalled = stdout.includes('already satisfied') ||
                                                  stdout.includes('Requirement already');
                        resolve({
                            success: true,
                            alreadyInstalled
                        });
                    }
                }
            );
        });
    }

    /**
     * Instaluje wszystkie wymagane biblioteki
     */
    public static async installDependencies(
        workspacePath: string,
        scriptsPath: string,
        onProgress?: (message: string) => void
    ): Promise<InstallResult> {
        const status = await this.checkVenvStatus(workspacePath);

        if (!status.isValid || !status.pipPath) {
            return {
                success: false,
                installed: [],
                failed: [],
                alreadyInstalled: [],
                message: 'Środowisko wirtualne nie jest gotowe'
            };
        }

        const scriptPackages = this.scanScriptsForImports(scriptsPath);
        // Merge base packages (required by extension) with script-detected packages
        const packagesSet = new Set([...this.BASE_PACKAGES, ...scriptPackages]);
        const packages = Array.from(packagesSet);

        if (packages.length === 0) {
            return {
                success: true,
                installed: [],
                failed: [],
                alreadyInstalled: [],
                message: 'Nie znaleziono zewnętrznych bibliotek do zainstalowania'
            };
        }

        const installed: string[] = [];
        const failed: string[] = [];
        const alreadyInstalled: string[] = [];

        // Najpierw zaktualizuj pip
        onProgress?.('Aktualizacja pip...');
        await this.upgradePip(status.pipPath);

        for (const pkg of packages) {
            onProgress?.(`Instalowanie: ${pkg}...`);

            const result = await this.installPackage(status.pipPath, pkg);

            if (result.success) {
                if (result.alreadyInstalled) {
                    alreadyInstalled.push(pkg);
                } else {
                    installed.push(pkg);
                }
            } else {
                failed.push(pkg);
            }
        }

        const success = failed.length === 0;
        let message: string;

        if (success) {
            if (installed.length === 0 && alreadyInstalled.length > 0) {
                message = 'Wszystkie biblioteki były już zainstalowane';
            } else if (installed.length > 0) {
                message = `Zainstalowano ${installed.length} bibliotek`;
            } else {
                message = 'Instalacja zakończona';
            }
        } else {
            message = `Nie udało się zainstalować ${failed.length} bibliotek: ${failed.join(', ')}`;
        }

        return {
            success,
            installed,
            failed,
            alreadyInstalled,
            message
        };
    }

    /**
     * Aktualizuje pip do najnowszej wersji
     */
    private static async upgradePip(pipPath: string): Promise<boolean> {
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

    /**
     * Pełna inicjalizacja środowiska: sprawdzenie, utworzenie i instalacja bibliotek
     */
    public static async ensureVenvAndInstallDependencies(
        workspacePath: string,
        scriptsPath: string,
        systemPythonPath: string,
        onProgress?: (message: string) => void
    ): Promise<{ venvResult: VenvOperationResult; installResult?: InstallResult }> {
        // Sprawdź status venv
        onProgress?.('Sprawdzanie środowiska wirtualnego...');
        let status = await this.checkVenvStatus(workspacePath);

        // Jeśli venv nie istnieje lub jest uszkodzone, utwórz nowe
        if (!status.exists || !status.isValid) {
            if (status.exists && !status.isValid) {
                onProgress?.('Usuwanie uszkodzonego środowiska...');
                await this.deleteVenv(workspacePath);
            }

            onProgress?.('Tworzenie środowiska wirtualnego...');
            const createResult = await this.createVenv(workspacePath, systemPythonPath);

            if (!createResult.success) {
                return { venvResult: createResult };
            }

            // Ponownie sprawdź status
            status = await this.checkVenvStatus(workspacePath);
            if (!status.isValid) {
                return {
                    venvResult: {
                        success: false,
                        message: 'Nie udało się zweryfikować środowiska wirtualnego',
                        error: status.error
                    }
                };
            }
        }

        // Zainstaluj zależności
        onProgress?.('Instalowanie bibliotek...');
        const installResult = await this.installDependencies(
            workspacePath,
            scriptsPath,
            onProgress
        );

        return {
            venvResult: {
                success: true,
                message: 'Środowisko wirtualne jest gotowe'
            },
            installResult
        };
    }

    private static findPythonScripts(directoryPath: string): string[] {
        const scripts: string[] = [];

        for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
            const entryPath = path.join(directoryPath, entry.name);

            if (entry.isDirectory()) {
                if (!this.IGNORED_DIRECTORIES.has(entry.name)) {
                    scripts.push(...this.findPythonScripts(entryPath));
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
