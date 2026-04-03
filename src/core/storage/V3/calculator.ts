import * as vscode from 'vscode';
import * as context from '../../../utils/context';
import * as refresher from '../../../utils/refresher';
import { todayDate } from '../../../utils';
import { DeviceProjectData } from './deviceProjectData';
import { getCurrentMatchInfo, matchRemote } from './matchInfo';
import { get } from './index';
import { CALCULATOR_EXPIRY_MS } from '../../../constants';

interface Cache {
    remoteTotal: number; // Cache for total seconds for current project on remote devices.
    remoteToday: number; // Cache for today's seconds for current project on remote devices.
    localPastTotal: number; // Cache for total seconds for current project on the local device except today.
    today: string;
    timestamp: number;
}

let _cache: Cache | undefined;

function refreshCache(): Cache {
    const now = Date.now();
    const today = todayDate();
    const matchInfo = getCurrentMatchInfo();
    const local = get();
    const ctx = context.get();

    let remoteTotal = 0;
    let remoteToday = 0;
    let localPastTotal = 0;

    // 1. traverse local data
    for (const [date, record] of Object.entries(local.history)) {
        if (date !== today) {
            localPastTotal += record.seconds;
        }
    }

    // 2. traverse global state
    const machineId = vscode.env.machineId;
    for (const key of ctx.globalState.keys()) {
        if (key.startsWith('timerStorageV2-') && !key.includes(machineId)) {
            const data = ctx.globalState.get(key) as DeviceProjectData;
            if (data && matchRemote(data.matchInfo, matchInfo)) {
                for (const [date, record] of Object.entries(data.history)) {
                    remoteTotal += record.seconds;
                    if (date === today) {
                        remoteToday += record.seconds;
                    }
                }
            }
        }
    }

    _cache = { remoteTotal, remoteToday, localPastTotal, today, timestamp: now };
    return _cache;
}

function getCache(): Cache {
    const today = todayDate();
    if (!_cache || _cache.today !== today || (Date.now() - _cache.timestamp > CALCULATOR_EXPIRY_MS)) {
        return refreshCache();
    }
    return _cache;
}

export function getTotalSeconds(): number {
    const snap = getCache();
    const local = get();
    // total = remoteTotal + localPastTotal + today's seconds on local device
    return snap.remoteTotal + snap.localPastTotal + (local.history[snap.today]?.seconds || 0);
}

export function getTodaySeconds(): number {
    const snap = getCache();
    const local = get();
    // today = remoteToday + today's seconds on local device
    return snap.remoteToday + (local.history[snap.today]?.seconds || 0);
}

export function getTodayLocalSeconds(): number {
    const snap = getCache();
    const local = get();
    return local.history[snap.today]?.seconds || 0;
}

export function init() {
    refresher.onRefresh(() => {
        _cache = undefined;
    });
}