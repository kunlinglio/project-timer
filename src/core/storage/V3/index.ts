import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as os from 'os';

import { ProjectTimeInfo as V1Data } from '../V1';
import { copy, isMultiRootWorkspace } from '../../../utils';
import * as context from '../../../utils/context';
import * as refresher from '../../../utils/refresher';
import * as logger from '../../../utils/logger';
import * as config from '../../../utils/config';

import { DeviceProjectData, mergeHistory, getDeviceProjectDataKey, constructDailyRecord, DeviceFolderData, getDeviceFolderDataKey } from './deviceProjectData';
import { getCurrentMatchInfo, matchInfoEq, matchLocal, matchRemote, init as matchInfoInit, MatchInfo } from './matchInfo';
import { getTotalSeconds, getTodaySeconds, getTodayLocalSeconds, init as CalculatorInit } from './calculator';
import { FLUSH_INTERVAL_MS } from '../../../constants';

/**
 * @module storage/V3
 * The version 3 of data structure and storage functions.
 */

let _cache: ProjectData | undefined;
let lastFlush: number = Date.now();

type ProjectData =
    | {
        type: "multi-root";
        projectData: DeviceProjectData;
        folderData: DeviceFolderData[];
    }
    | {
        type: "single-root";
        folderData: DeviceFolderData;
    }

export { constructDailyRecord, getTodaySeconds, getTotalSeconds, getTodayLocalSeconds, mergeHistory };
export type { DeviceProjectData, ProjectData };

export function init(): vscode.Disposable {
    // migration
    logger.log(`[Storage] Migrating V1 data to V2...`);
    // TODO: migrate V1 to V2
    logger.log(`[Storage] Migration V2 data to V3...`);
    // TODO: migrate V2 to V3
    logger.log(`[Storage] Migration completed!`);

    // init match info cache
    matchInfoInit();
    CalculatorInit();
    // register on refresh
    refresher.onRefresh(() => {
        flush();
    });
    return {
        dispose: () => {
            flush();
        }
    };
}

function updateSyncKeys() {
    // TODO: support V3 data structure
    const ctx = context.get();
    const cfg = config.get();
    const keysForSync: string[] = [];
    if (cfg.synchronization.enabled) {
        for (const [_, value] of Object.entries(cfg.synchronization.syncedProjects)) {
            if (value.synced) {
                const key = `timerStorageV2-${value.deviceId}-${value.projectUUID}`;
                keysForSync.push(key);
            }
        }
    }
    ctx.globalState.setKeysForSync(keysForSync);
}

/**
 * Get data for current folder, current device.
 */
async function getFolderData(matchInfo: MatchInfo): Promise<DeviceFolderData> {
    const deviceId = vscode.env.machineId;
    const ctx = context.get();
    const cfg = config.get();
    // traverse all v2 data in global state to find the match one
    const matched: DeviceFolderData[] = [];
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith(`timerStorageV3-${deviceId}-folder_`)) {
            let data = ctx.globalState.get(key) as DeviceFolderData;
            if (matchLocal(data.matchInfo, matchInfo)) {
                if (!matchInfoEq(data.matchInfo, matchInfo)) {
                    // need update match info
                    data.matchInfo = matchInfo;
                    await setFolder(data);
                }
                matched.push(data);
            }
        }
    }
    if (matched.length === 0) {
        // not found, create new one
        const folderUUID = crypto.randomUUID();
        const data: DeviceFolderData = {
            deviceId: deviceId,
            folderUUID: folderUUID,
            displayName: undefined,
            deviceName: os.hostname(),
            matchInfo: matchInfo,
            history: {}
        };
        await setFolder(data);
        const syncKey = `${data.deviceId}-${data.folderUUID}`;
        const newSyncedProjects = { ...cfg.synchronization.syncedProjects };
        newSyncedProjects[syncKey] = {
            deviceId: data.deviceId,
            projectUUID: data.folderUUID,
            deviceName: data.deviceName,
            projectName: data.displayName || data.matchInfo.folderName,
            synced: cfg.synchronization.enabled
        };
        config.set(`synchronization.syncedProjects`, newSyncedProjects).catch(e => logger.error(`[Storage] Failed to sync config: ${e}`));
        return data;
    }
    else if (matched.length === 1) {
        return matched[0];
    } else {
        // found more than 1, need merge
        const merged = matched[0];
        // 1. merge all
        for (let i = 1; i < matched.length; i++) {
            merged.history = mergeHistory(merged.history, matched[i].history);
        }
        // 2. delete remains
        const newSyncedProjects = { ...cfg.synchronization.syncedProjects };
        let needUpdateConfig = false;
        for (let i = 1; i < matched.length; i++) {
            const key = getDeviceFolderDataKey(matched[i]);
            const ctx = context.get();
            ctx.globalState.update(key, undefined);
            // update config
            const syncKey = `${matched[i].deviceId}-${matched[i].folderUUID}`;
            if (newSyncedProjects[syncKey]) {
                delete newSyncedProjects[syncKey];
                needUpdateConfig = true;
            }
        }
        if (needUpdateConfig) {
            config.set(`synchronization.syncedProjects`, newSyncedProjects).catch(e => logger.error(`[Storage] Failed to sync config: ${e}`));
        }
        // 3. update match info
        merged.matchInfo = getCurrentMatchInfo();
        merged.displayName = getCurrentMatchInfo().folderName;
        await setFolder(merged);
        return merged;
    }
}

/**
 * Update DeviceFolderData without cache.
 */
async function setFolder(data: DeviceFolderData) {
    if (data.deviceId !== vscode.env.machineId) {
        const err = new Error(`Device ID mismatch: expected ${vscode.env.machineId}, got ${data.deviceId}`);
        logger.error(err);
        throw err;
    }
    data = copy(data);
    const ctx = context.get();
    const key = getDeviceFolderDataKey(data);
    try {
        await ctx.globalState.update(key, data);
        updateSyncKeys();
    } catch (error: any) {
        logger.error(`[Storage] Error updating folder data: ${error}`);
    }
}

export function get(): DeviceProjectData {
    const matchInfo = getCurrentMatchInfo();
}

export function set(data: DeviceProjectData) {
    if (data.deviceId !== vscode.env.machineId) {
        const err = new Error(`Device ID mismatch: expected ${vscode.env.machineId}, got ${data.deviceId}`);
        logger.error(err);
        throw err;
    }
    _cache = data;
    if (Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
        flush(); // Do not await to avoid color function problem
    }
}

export async function flush() {
    let data = _cache;
    if (!data) {
        logger.warn(`[Storage] Warning: No data to flush!`);
        return;
    }
    data = copy(data);
    const ctx = context.get();
    const key = getDeviceProjectDataKey(data);
    try {
        await ctx.globalState.update(key, data);
        updateSyncKeys();
        lastFlush = Date.now();
        _cache = undefined; // Force merge procedure on next get
        logger.log(`[Storage] Flush successfully!`);
    } catch (error: any) {
        logger.error(`[Storage] Error flushing V2 storage: ${error}`);
    }
}


export function getProjectName(): string {
    const data = get();
    return data.displayName || data.matchInfo.folderName;
}

/**
 * Get all DeviceProjectData entries for the current project across all synced devices.
 * The local device entry is always first.
 */
export function getAllDevicesForCurrentProject(): DeviceProjectData[] {
    const matchInfo = getCurrentMatchInfo();
    const machineId = vscode.env.machineId;
    const ctx = context.get();
    const result: DeviceProjectData[] = [get()];

    for (const key of ctx.globalState.keys()) {
        if (key.startsWith('timerStorageV2-') && !key.startsWith(`timerStorageV2-${machineId}-`)) {
            const data = ctx.globalState.get<DeviceProjectData>(key);
            if (data && matchRemote(data.matchInfo, matchInfo)) {
                result.push(data);
            }
        }
    }

    return result;
}

export async function deleteAll() {
    // 1. delete cache
    _cache = undefined;
    // 2. delete from global state
    const ctx = context.get();
    const cfg = config.get();
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith(`timerStorageV2-`)) {
            const data = ctx.globalState.get<DeviceProjectData>(key);
            if (!data) {
                continue;
            }
            await ctx.globalState.update(key, undefined);
            // 3. delete from config
            const syncKey = `${data.deviceId}-${data.projectUUID}`;
            if (cfg.synchronization.syncedProjects[syncKey]) {
                const newSyncedProjects = { ...cfg.synchronization.syncedProjects };
                delete newSyncedProjects[syncKey];
                config.set(`synchronization.syncedProjects`, newSyncedProjects).catch(e => logger.error(`[Storage] Failed to sync config: ${e}`));
            }
        }
    }
    refresher.refresh();
}

export async function exportAll() {
    await flush();
    const ctx = context.get();
    const data: Record<string, DeviceProjectData> = {};
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith(`timerStorageV2-`)) {
            data[key] = ctx.globalState.get(key) as DeviceProjectData;
        }
    }
    return data;
}

/**
 * This function should support both V1 and V2 json from user.
 * Multi import on V2 file is safe, the new one will replace the old one.
 * But on V1 file, all data may be merged together.
 */
export async function importAll(data: Record<string, DeviceProjectData | V1Data>) {
    await flush();
    _cache = undefined;
    const ctx = context.get();
    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(`timerStorage-`)) { // V1
            const deviceProjectData = migrateV1Data(value as V1Data);
            const newKey = getDeviceProjectDataKey(deviceProjectData);
            await ctx.globalState.update(newKey, deviceProjectData);
        } else if (key.startsWith(`timerStorageV2-`)) { // V2
            await ctx.globalState.update(key, value);
        } else {
            const err = new Error(`Unexpected key: ${key}`);
            logger.error(err);
            throw err;
        }
    }
    refresher.refresh();
}

export async function renameCurrentProject(newName: string) {
    const data = get();
    if (data) {
        data.displayName = newName;
        set(data);
        flush();
    }
    refresher.refresh();
}
