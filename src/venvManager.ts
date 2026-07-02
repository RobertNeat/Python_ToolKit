import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  InstallResult,
  PythonDependencyInstaller,
} from "./pythonDependencyInstaller";
import { PythonDependencyScanner } from "./pythonDependencyScanner";
import { translations } from "./translations";

export { InstallResult } from "./pythonDependencyInstaller";

export interface VenvStatus {
  exists: boolean;
  pythonPath: string | null;
  pipPath: string | null;
  isValid: boolean;
  error?: string | undefined;
}

export interface VenvOperationResult {
  success: boolean;
  message: string;
  error?: string | undefined;
}

export class VenvManager {
  public static readonly VENV_NAME = ".venv";
  private static readonly dependencyScanner = new PythonDependencyScanner();
  private static readonly dependencyInstaller = new PythonDependencyInstaller();

  public static getVenvPath(workspacePath: string): string {
    return path.join(workspacePath, this.VENV_NAME);
  }

  public static getVenvPythonPath(workspacePath: string): string {
    const venvPath = this.getVenvPath(workspacePath);
    return os.platform() === "win32"
      ? path.join(venvPath, "Scripts", "python.exe")
      : path.join(venvPath, "bin", "python");
  }

  public static getVenvPipPath(workspacePath: string): string {
    const venvPath = this.getVenvPath(workspacePath);
    return os.platform() === "win32"
      ? path.join(venvPath, "Scripts", "pip.exe")
      : path.join(venvPath, "bin", "pip");
  }

  public static async checkVenvStatus(
    workspacePath: string,
  ): Promise<VenvStatus> {
    const venvPath = this.getVenvPath(workspacePath);
    const pythonPath = this.getVenvPythonPath(workspacePath);
    const pipPath = this.getVenvPipPath(workspacePath);

    if (!fs.existsSync(venvPath)) {
      return this.createStatus(false, null, null, false);
    }

    if (!fs.existsSync(pythonPath)) {
      return this.createStatus(
        true,
        null,
        null,
        false,
        translations.results.pythonInterpreterMissing,
      );
    }

    if (!fs.existsSync(pipPath)) {
      return this.createStatus(
        true,
        pythonPath,
        null,
        false,
        translations.results.pipMissing,
      );
    }

    const isValid = await this.verifyVenvPython(pythonPath);
    return this.createStatus(
      true,
      pythonPath,
      pipPath,
      isValid,
      isValid ? undefined : translations.results.venvBroken,
    );
  }

  public static async createVenv(
    workspacePath: string,
    systemPythonPath: string,
  ): Promise<VenvOperationResult> {
    const venvPath = this.getVenvPath(workspacePath);

    return new Promise((resolve) => {
      child_process.exec(
        `"${systemPythonPath}" -m venv "${venvPath}"`,
        { timeout: 120000 },
        (error, _stdout, stderr) => {
          if (error) {
            resolve({
              success: false,
              message: translations.results.failedToCreateVenv,
              error: stderr || error.message,
            });
            return;
          }

          resolve({
            success: true,
            message: translations.results.venvCreated,
          });
        },
      );
    });
  }

  public static async deleteVenv(
    workspacePath: string,
  ): Promise<VenvOperationResult> {
    const venvPath = this.getVenvPath(workspacePath);

    if (!fs.existsSync(venvPath)) {
      return {
        success: true,
        message: translations.results.venvMissing,
      };
    }

    try {
      fs.rmSync(venvPath, { recursive: true, force: true });
      return {
        success: true,
        message: translations.results.venvDeleted,
      };
    } catch (error) {
      return {
        success: false,
        message: translations.results.failedToRemoveVenv,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public static async reinitializeVenv(
    workspacePath: string,
    systemPythonPath: string,
  ): Promise<VenvOperationResult> {
    const deleteResult = await this.deleteVenv(workspacePath);
    return deleteResult.success
      ? this.createVenv(workspacePath, systemPythonPath)
      : deleteResult;
  }

  public static scanScriptsForImports(scriptsPath: string): string[] {
    return this.dependencyScanner.scanScriptsForImports(scriptsPath);
  }

  public static async installDependencies(
    workspacePath: string,
    scriptsPath: string,
    onProgress?: (message: string) => void,
  ): Promise<InstallResult> {
    const status = await this.checkVenvStatus(workspacePath);

    if (!status.isValid || !status.pipPath) {
      return {
        success: false,
        installed: [],
        failed: [],
        alreadyInstalled: [],
        message: translations.results.venvNotReady,
      };
    }

    return this.dependencyInstaller.installDependencies(
      status.pipPath,
      scriptsPath,
      onProgress,
    );
  }

  public static async ensureVenvAndInstallDependencies(
    workspacePath: string,
    scriptsPath: string,
    systemPythonPath: string,
    onProgress?: (message: string) => void,
  ): Promise<{
    venvResult: VenvOperationResult;
    installResult?: InstallResult;
  }> {
    onProgress?.(translations.progress.checkingVenv);
    const readyResult = await this.ensureVenv(
      workspacePath,
      systemPythonPath,
      onProgress,
    );

    if (!readyResult.success) {
      return { venvResult: readyResult };
    }

    onProgress?.(translations.progress.installingDependencies);
    const installResult = await this.installDependencies(
      workspacePath,
      scriptsPath,
      onProgress,
    );

    return {
      venvResult: {
        success: true,
        message: translations.results.venvReady,
      },
      installResult,
    };
  }

  private static async ensureVenv(
    workspacePath: string,
    systemPythonPath: string,
    onProgress?: (message: string) => void,
  ): Promise<VenvOperationResult> {
    let status = await this.checkVenvStatus(workspacePath);

    if (status.exists && !status.isValid) {
      onProgress?.(translations.progress.removingBrokenVenv);
      await this.deleteVenv(workspacePath);
      status = await this.checkVenvStatus(workspacePath);
    }

    if (status.exists && status.isValid) {
      return {
        success: true,
        message: translations.results.venvReady,
      };
    }

    onProgress?.(translations.progress.creatingVenv);
    const createResult = await this.createVenv(workspacePath, systemPythonPath);
    if (!createResult.success) {
      return createResult;
    }

    const createdStatus = await this.checkVenvStatus(workspacePath);
    if (!createdStatus.isValid) {
      return {
        success: false,
        message: translations.results.failedToVerifyVenv,
        error: createdStatus.error,
      };
    }

    return createResult;
  }

  private static async verifyVenvPython(pythonPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      child_process.exec(
        `"${pythonPath}" --version`,
        { timeout: 10000 },
        (error) => {
          resolve(!error);
        },
      );
    });
  }

  private static createStatus(
    exists: boolean,
    pythonPath: string | null,
    pipPath: string | null,
    isValid: boolean,
    error?: string,
  ): VenvStatus {
    return {
      exists,
      pythonPath,
      pipPath,
      isValid,
      error,
    };
  }
}
