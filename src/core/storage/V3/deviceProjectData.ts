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


/**
 * The self described data structure of data produced by one device and related to one project.
 * It should be atomic and has no relation with other key-value pairs, in order to guarantee consistency and atomicity.
 * This data structure does not support multi-root workspaces.
 * 
 * Stored at globalState[`timerStorageV2-{deviceId}-{projectUUID}`]
 */
export interface DeviceProjectData {
    readonly deviceId: string;
    readonly projectUUID: string;

    displayName?: string;
    deviceName?: string;

    matchInfo: MatchInfo;
    history: Record<string, DailyRecord>; // date -> dailyRecord data
}

export function getDeviceProjectDataKey(data: DeviceProjectData): string {
    return `timerStorageV2-${data.deviceId}-${data.projectUUID}`;
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
