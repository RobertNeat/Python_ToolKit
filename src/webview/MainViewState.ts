import { PythonInfo } from '../pythonDetector';
import { ScriptMetadata } from '../scriptValidator';
import { VenvStatus } from '../venvManager';

export interface MainViewState {
    pythonInfo: PythonInfo | null;
    venvStatus: VenvStatus | null;
    scripts: ScriptMetadata[];
    selectedScriptPath: string | null;
    isDetectingPython: boolean;
    isVenvOperationInProgress: boolean;
    venvOperationMessage: string;
    workspacePath: string | null;
}
