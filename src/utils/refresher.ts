import * as vscode from 'vscode';
import * as logger from './logger';
import { FORCE_REFRESH_AFTER_STARTUP_MS, FORCE_REFRESH_MAX_MS } from '../constants';
import { addCleanup } from '.';

const callbacks: Array<() => void> = [];
var lastInterval = 0;

export function onRefresh(callback: () => void) {
    callbacks.push(callback);
}

export function init(): vscode.Disposable {
    // To avoid git extension not finishing scanning and cannot provide the correct Git remote URL.
    // And to reserve time for vscode to sync global state.
    const timeout = setTimeout(periodicRefresh, 0);
    // Clear all cache when workfolder changed.
    // This should not happened in usual, because `activationEvents: "workspaceContains:**/*"` will make VS Code call deactivate() and activate() after workspace changed.
    const changeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        logger.warn("Workspace folders changed, refreshing ALL!");
        refresh();
    });
    return vscode.Disposable.from(
        changeListener,
        {
            dispose: () => {
                clearTimeout(timeout);
            }
        }
    );
}

function periodicRefresh() {
    logger.log(`Periodic refresh triggered after ${lastInterval / 1000} seconds`);
    refresh();
    lastInterval = Math.max(lastInterval * 2, FORCE_REFRESH_AFTER_STARTUP_MS);
    if (lastInterval > FORCE_REFRESH_MAX_MS) {
        return; // stop refreshing after reaching the max interval
    }
    const interval = setTimeout(() => {
        periodicRefresh();
    }, lastInterval);
    addCleanup({
        dispose: () => {
            clearTimeout(interval);
        }
    });
    logger.log(`Next periodic refresh scheduled in ${lastInterval / 1000} seconds`);
}

export function refresh() {
    callbacks.forEach(callback => {
        try {
            callback();
        } catch (e) {
            logger.error(`Error in refresh callback: ${e}`);
        }
    });
}
