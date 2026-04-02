/**
 * Frequency of the main timer loop for tracking activity and active files.
 */
export const TIMER_TICK_MS = 1000; // 1 second

/**
 * Cache duration for time calculations. 
 * Controls how frequently aggregated data (including remote syncs) is re-calculated.
 */
export const CALCULATOR_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Interval to flush local tracking data to VS Code's global storage.
 */
export const FLUSH_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Interval to refresh project metadata (Git URLs, folder paths).
 * Automatically resets on workspace changes.
 * Only relevant when a Git repository is added mid-session; workspace changes trigger an immediate reset regardless.
 */
export const MATCHINFO_REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Throttle interval for re-rendering the status bar hover menu content.
 */
export const MENU_UPDATE_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Interval to update the status bar text.
 * The interval depends on the display precision of status bar item.
 */
export const STATUS_BAR_UPDATE_INTERVAL_MS = {
    "second": 1000,        // 1 second
    "minute": 60 * 1000,   // 1 minute
    "hour": 10 * 60 * 1000 // 10 minutes
};

/**
 * To avoid git extension not finishing scanning and cannot provide the correct Git remote URL.
 * And to reserve time for vscode to sync global state.
 * All caches are force-refreshed after 5 sec, 10 sec, 20 sec, ..., 60 min.
 */
export const FORCE_REFRESH_AFTER_STARTUP_MS = 5 * 1000; // 5 seconds
export const FORCE_REFRESH_MAX_MS = 60 * 60 * 1000; // 60 minutes
