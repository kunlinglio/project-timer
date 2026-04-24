import * as vscode from 'vscode';
import * as path from 'path';

import * as refresher from '../../../utils/refresher';
import * as logger from '../../../utils/logger';
import * as config from '../../../utils/config';
import { getFolderName, getFolderParentPath, getGitRemoteUrl, strictEq, isMultiRootWorkspace } from "../../../utils";
import { MATCH_INFO_REFRESH_INTERVAL_MS } from '../../../constants';

let _cache: MatchInfo[] | undefined;
let update_time = 0;

/**
 * Metadata for project matching.
 */
export interface MatchInfo {
    // Priority from high to low
    gitRemoteUrl?: string;
    parentPath: string;
    folderName: string;
}

export function matchInfoEq(left: MatchInfo, right: MatchInfo): boolean {
    if (left.gitRemoteUrl !== right.gitRemoteUrl) {
        return false;
    }
    if (left.parentPath !== right.parentPath) {
        return false;
    }
    if (left.folderName !== right.folderName) {
        return false;
    }
    return true;
}

/**
 * Check if data matched the current info in a strict way.
 * Call it when you want to check if current project 'is' the old project from same device (local).
 */
export function matchLocal(old: MatchInfo, current: MatchInfo): boolean {
    // Case 1: V1 compatible
    if (old.parentPath === undefined && old.gitRemoteUrl === undefined) {
        // old is V1 migrated data
        if (old.folderName === current.folderName) {
            return true;
        }
        // cannot confirm if they are the same project
        return false;
    }
    // Case 2: equals
    if (matchInfoEq(old, current)) {
        return true;
    }
    // Case 3: only add stronger info
    if (!old.gitRemoteUrl && current.gitRemoteUrl &&
        strictEq(old.parentPath, current.parentPath) &&
        old.folderName === current.folderName
    ) {
        return true;
    }
    // Case 4: rename or move but keep the git remote url
    if (strictEq(old.gitRemoteUrl, current.gitRemoteUrl)) {
        return true;
    }
    // Others: keep the old data
    return false;
}

/**
 * Check if data matched the current info in a loose way.
 * Call it when you want to check if data from other device (remote) can be counted as the same project.
 */
export function matchRemote(remote: MatchInfo, current: MatchInfo): boolean {
    if (strictEq(remote.gitRemoteUrl, current.gitRemoteUrl)) {
        return true;
    }
    // Avoid compare absolute path through different devices
    if (remote.folderName === current.folderName) {
        return true;
    }
    return false;
}

export function getCurrentMatchInfo(): MatchInfo[] {
    if (_cache && Date.now() - update_time < MATCH_INFO_REFRESH_INTERVAL_MS) {
        return _cache;
    }
    const urlRemoteMap = new Map<string, string>(); // folder url -> remote url
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension) {
        const git = gitExtension.exports.getAPI(1);
        for (const repository of git.repositories) {
            const remote = repository.state.remotes.find((r: any) => r.name === 'origin');
            if (remote) {
                urlRemoteMap.set(repository.rootUri.toString(), remote.fetchUrl || remote.pushUrl);
            }
        }
    } else {
        logger.warn('Git extension not found, git remote url will not be included in match info.');
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        logger.warn('No workspace folder found, match info will be empty.');
        return [];
    }
    const infos: MatchInfo[] = folders.map(f => {
        const url = urlRemoteMap.get(f.uri.toString());
        return {
            folderName: f.name,
            parentPath: path.dirname(f.uri.fsPath),
            gitRemoteUrl: url
        };
    });
    _cache = infos;
    update_time = Date.now();
    return _cache;
}

export function init(): vscode.Disposable {
    refresher.onRefresh(() => {
        _cache = undefined;
    });
    const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        _cache = undefined;
    });
    return disposable;
}
