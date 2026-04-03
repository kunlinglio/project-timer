import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as os from 'os';

import { ProjectTimeInfo as V1Data } from '../V1';
import { copy } from '../../../utils';
import * as context from '../../../utils/context';
import * as refresher from '../../../utils/refresher';
import * as logger from '../../../utils/logger';
import * as config from '../../../utils/config';

import { DeviceProjectData, mergeHistory, getDeviceProjectDataKey, constructDailyRecord } from './deviceProjectData';
import { getCurrentMatchInfo, matchInfoEq, matchLocal, matchRemote, init as matchInfoInit } from './matchInfo';
import { getTotalSeconds, getTodaySeconds, getTodayLocalSeconds, init as CalculatorInit } from './calculator';
import { FLUSH_INTERVAL_MS } from '../../../constants';

/**
 * @module storage/V3
 * The version 3 of data structure and storage functions.
 */

let _cache: DeviceProjectData | undefined;
let lastFlush: number = Date.now();

export { constructDailyRecord, getTodaySeconds, getTotalSeconds, getTodayLocalSeconds, mergeHistory };
export type { DeviceProjectData };

function migrateV1Data(v1data: V1Data) {
    const projectUUID = crypto.randomUUID();
    const deviceId = vscode.env.machineId;
    const deviceProjectData: DeviceProjectData = {
        deviceId: deviceId,
        projectUUID: projectUUID,
        displayName: undefined,
        deviceName: os.hostname(),
        matchInfo: {
            folderName: v1data.project_name,
            parentPath: undefined,
            gitRemotUrl: undefined
        },
        history: v1data.history
    };
    return deviceProjectData;
}

function removeAllV1Data() {
    const ctx = context.get();
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith(`timerStorage-`)) {
            ctx.globalState.update(key, undefined);
        }
    }
}

export function init(): vscode.Disposable {
    // 1. migrate V1 data
    logger.log(`[Storage] Migrating V1 data to V2...`);
    const ctx = context.get();
    let migratedCount = 0;
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith(`timerStorage-`)) {
            const data = ctx.globalState.get<V1Data>(key);
            if (data) {
                const deviceProjectData = migrateV1Data(data);
                set(deviceProjectData);
                migratedCount++;
            }
        }
    }
    if (migratedCount > 0) {
        logger.log(`[Storage] Migration complete. Migrated ${migratedCount} items.`);
        logger.log(`[Storage] Deleting old V1 data...`);
        removeAllV1Data();
        logger.log(`[Storage] Delete success.`);
    } else {
        logger.log(`[Storage] Nothing to migrate.`);
    }
    // 2. init match info cache
    matchInfoInit();
    CalculatorInit();
    // 3. register on refresh
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
 * Get data for current project, current device.
 */
export function get(): DeviceProjectData {
    const matchInfo = getCurrentMatchInfo();
    // check cache
    if (_cache) {
        // cache hit
        const cacheMatchInfo = _cache.matchInfo;
        if (!matchLocal(cacheMatchInfo, matchInfo)) {
            logger.warn(`[Storage] Cache mismatch: expected ${JSON.stringify(cacheMatchInfo)}, got ${JSON.stringify(matchInfo)}\nTry flush cache to update.`);
            flush();
        }
        if (!matchInfoEq(cacheMatchInfo, matchInfo)) {
            // need update match info
            _cache.matchInfo = matchInfo;
            set(_cache);
        }
        return _cache;
    }
    const deviceId = vscode.env.machineId;
    const ctx = context.get();
    const cfg = config.get();
    // traverse all v2 data in global state to find the match one
    const matched: DeviceProjectData[] = [];
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith(`timerStorageV2-${deviceId}-`)) {
            let data = ctx.globalState.get(key) as DeviceProjectData;
            if (matchLocal(data.matchInfo, matchInfo)) {
                // upgrade old data: add device name
                if (data.deviceName === undefined || data.deviceName !== os.hostname()) {
                    data.deviceName = os.hostname();
                    set(data);
                }
                // upgrade old data: add sync config
                const syncKey = `${data.deviceId}-${data.projectUUID}`;
                if (cfg.synchronization.syncedProjects[syncKey] === undefined) {
                    const newSyncedProjects = { ...cfg.synchronization.syncedProjects };
                    newSyncedProjects[syncKey] = {
                        deviceId: data.deviceId,
                        projectUUID: data.projectUUID,
                        deviceName: data.deviceName,
                        projectName: data.displayName || data.matchInfo.folderName,
                        synced: cfg.synchronization.enabled
                    };
                    config.set(`synchronization.syncedProjects`, newSyncedProjects).catch(e => logger.error(`[Storage] Failed to sync config: ${e}`));
                }
                if (!matchInfoEq(data.matchInfo, matchInfo)) {
                    // need update match info
                    data.matchInfo = matchInfo;
                    set(data);
                }
                matched.push(data);
            }
        }
    }
    if (matched.length === 0) {
        // not found, create new one
        const projectUUID = crypto.randomUUID();
        const data: DeviceProjectData = {
            deviceId: deviceId,
            projectUUID: projectUUID,
            displayName: undefined,
            deviceName: os.hostname(),
            matchInfo: matchInfo,
            history: {}
        };
        set(data);
        const syncKey = `${data.deviceId}-${data.projectUUID}`;
        const newSyncedProjects = { ...cfg.synchronization.syncedProjects };
        newSyncedProjects[syncKey] = {
            deviceId: data.deviceId,
            projectUUID: data.projectUUID,
            deviceName: data.deviceName,
            projectName: data.displayName || data.matchInfo.folderName,
            synced: cfg.synchronization.enabled
        };
        config.set(`synchronization.syncedProjects`, newSyncedProjects).catch(e => logger.error(`[Storage] Failed to sync config: ${e}`));
        _cache = data;
        return data;
    }
    else if (matched.length === 1) {
        _cache = matched[0];
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
            const key = getDeviceProjectDataKey(matched[i]);
            const ctx = context.get();
            ctx.globalState.update(key, undefined);
            // update config
            const syncKey = `${matched[i].deviceId}-${matched[i].projectUUID}`;
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
        set(merged);
        _cache = merged;
        return merged;
    }
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
