import { MatchInfo } from './matchInfo';
import { copy } from '../../../utils';

/**
 * Record data in single day.
 */
interface DailyRecord {
    seconds: number; // Only store the seconds on this device
    languages: Record<string, number>;
    files: Record<string, number>;
}

export function constructDailyRecord(): DailyRecord {
    return { seconds: 0, languages: {}, files: {} };
}

export function mergeHistory(a: Record<string, DailyRecord>, b: Record<string, DailyRecord>): Record<string, DailyRecord> {
    const merged: Record<string, DailyRecord> = copy(a);
    for (const [date, sourceRecord] of Object.entries(b)) {
        if (!merged[date]) {
            merged[date] = constructDailyRecord();
        }
        const targetRecord = merged[date];
        targetRecord.seconds += sourceRecord.seconds;

        // merge languages
        for (const [lang, sec] of Object.entries(sourceRecord.languages)) {
            targetRecord.languages[lang] = (targetRecord.languages[lang] || 0) + sec;
        }

        // merge files
        for (const [file, sec] of Object.entries(sourceRecord.files)) {
            targetRecord.files[file] = (targetRecord.files[file] || 0) + sec;
        }
    }
    return merged;
}

/**
 * The self described data structure of data produced by one device and related to one folder.
 * An folder may be a project itself, thus, there will be no a DeviceProjectData entry.
 * It should be atomic and has no relation with other key-value pairs, in order to guarantee consistency and atomicity.
 * 
 * Stored at globalState[`timerStorageV3-{deviceId}-folder_{projectUUID}`]
 */
export interface DeviceFolderData {
    readonly deviceId: string;
    readonly folderUUID: string;

    displayName?: string; // Only if folder itself is a project
    deviceName: string;

    matchInfo: MatchInfo;
    history: Record<string, DailyRecord>; // date -> dailyRecord data
}

export function getDeviceFolderDataKey(data: DeviceFolderData): string {
    return `timerStorageV3-${data.deviceId}-folder_${data.folderUUID}`;
}

/**
 * The data structure of data produced by one device and related to one project, which may contain multiple folders.
 * This entry is optional and only used for multi-root workspace.
 * If the workspace is anonymous (no .code-workspace file), the workspace will be regard as temporary project, and will not have a DeviceProjectData entry.
 * 
 * Stored at globalState[`timerStorageV3-{deviceId}-project_{projectUUID}`]
 */
export interface DeviceProjectData {
    readonly projectUUID: string;
    readonly deviceId: string;

    displayName?: string;
    deviceName: string;

    workspaceFilePath: string;
    workspaceFileHash: string;

    folderUUIDs: string[]; // Only used for view statistics, has no consistency guarantee
}

export function getDeviceProjectDataKey(data: DeviceProjectData): string {
    return `timerStorageV3-${data.deviceId}-project_${data.projectUUID}`;
}