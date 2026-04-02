# Change Log

All notable changes to the "Project Timer" extension will be documented in this file.

## [Unreleased]
### Improved
- Optimized data synchronization reliability using an exponential backoff strategy to avoid display outdated data after startup.

## [0.5.1] - 2026-03-17
### Fixed
- Fix wrong displayed description of `project-timer.multiRootWorkspace.warningMessage.enable`.

### Added
- Added support of VS Code remote window (e.g. Remote SSH, Dev Containers).

## [0.5.0] - 2026-03-04
### Added
- Selection `Ok` and `Don't show again` to multi-root workspace warning message.
- Config `project-timer.multiRootWorkspace.warningMessage.enable` to control multi-root workspace warning message.

### Changed
- Remove console log in non debug mode.

### Fixed
- Reach max stack size when activate extension.

## [0.4.3] - 2026-02-28
### Added
- Support click and jump to file in statistics page.

### Fixed
- Fixed the statistics page keep `loading` state after reload.

## [0.4.2] - 2026-02-26
### Added
- Add `other` language to statistics view when there are languages not in the top 5.

### Changed
- Focused/unfocused do not regarded as an activity to avoid unexpected timer starting.

### Improve
- Slightly improve performance by change the sequence of fast path.

## [0.4.1] - 2026-02-25
### Changed
- Bundled the ECharts library within the extension package instead of external CDNs.

## [0.4.0] - 2026-02-24
### Added
- Add new config entry `project-timer.synchronization.syncedProjects` to manage all synced projects.
- Add new command: `project-timer.disableSyncForProject` and `project-timer.enableSyncForProject`.
- Recover sync function by default.

### Fixed
- Allow vertical scroll bar in statistics page to satisfied low resolution screens.

### Changed
- Tuned layout of statistics page.

## [0.3.2] - 2026-02-24
### Added
- Error's message and stack will be logged to VS Code `Output` panel.

### Fixed
- Cannot activate successfully on windows platform due to parent path parse error.

### Removed
- Disable sync function for now due to known issues with data consistency.

## [0.3.1] - 2026-02-23
### Fixed
- Optimized the refresh logic of status bar and menu after `project-timer.deleteAllStorage`, `project-timer.importData` and `project-timer.renameProject`.

### Changed
- Update icon color to `#007FD4`.

## [0.3.0] - 2026-02-22
### Added                 
- All cached data will be forced refresh 5 seconds after start up to avoid git extension not finishing scanning and cannot provide the correct Git remote URL.
- The logs now will be written to VS Code `Output` panel.

### Changed
- **Redesigned statistics webview** with a new UI/UX:
  - New KPI strip showing Total, Today, Avg/Day, and Best Day (with date).
  - Subtitle now shows the project start date and device count.
  - Activity chart with **7d / 30d / 90d / All** range tabs.
  - Languages panel uses a coloured dot + progress bar layout.
  - Top Files panel uses a single-line `dir / filename` format for uniform row height.
  - Devices panel appears automatically when data from multiple devices is present.

## [0.2.2] - 2026-02-22
### Fixed
- Fixed cannot get git remote url correctly.
- Fixed wrong refresh frequency when `project-timer.statusBar.displayTimeMode` is set to `Both`.

### Changed
- Further reduced refresh frequency across status bar, hover menu, and calculator to improve performance.
- The `today` value in both the status bar and hover menu now reflects local device data only, ensuring consistent display between the two.

## [0.2.1] - 2026-02-21
### Added
- Implemented MatchInfo, Calculator, and Config caching to reduce CPU overhead.

### Changed
- Reduced status bar and menu refresh frequency to improve overall performance.
- Increased status bar item priority to ensure consistent placement.
- Changed the default value of `project-timer.statusBar.displayProjectName` to `false`.

### Fixed
- Fixed time calculation to use local time instead of UTC for more accurate daily statistics.
- Fixed an issue where multi-project records were incorrectly displayed for single projects on the same device.
- Resolved latency in status bar icon refreshes.

## [0.2.0] - 2026-02-20
### Added
- Supports matching projects using Git remote URLs.
- Added a new command `Project Timer: Rename Project` and button on the status bar menu to allow personalized display names for your projects.
- Implemented a cache for status bar text to minimize CPU usage.

## [0.1.1] - 2026-02-20
### Added
- Storage cache system to improve performance.

### Fixed
- Fixed timer remaining at 0/1s when multiple windows were open simultaneously.
- Fixed issue where statistics were incorrectly merged when multiple project folders existed under the same parent directory.

## [0.1.0] - 2026-02-18
### Added
- Introduced new **V2 storage**, to support more functions.
    - New `deviceId` entry for better synchronization support.
    - New `displayName` entry to support customize project name (to be implemented in future versions).
    - Enhanced metadata to match project folders across different devices.
    - Support aggregation queries to analyze all statistics across all devices.
    - Automatic migration of legacy V1 data to V2.
- **Synchronization**: All statistics are now synchronized across devices by default via VS Code Settings Sync Service. This can be configured via new `project-timer.synchronization.enabled` setting.

### Changed
- Refactored file structure, code style, and naming conventions to improve maintainability.
- Standardized `Project Timer: Import Data` command behavior: 
    - Importing data from the **same device** overwrites existing local data.
    - Importing data from a **different device** overwrites that specific device's remote data, which is then aggregated in statistics.
    
    *Note: While multi-importing V2 files is idempotent (safe), importing the same V1 data multiple times will result in cumulative data accumulation due to backward compatibility logic.*
- Standardized `Project Timer: Export Data` command: Now exports all version-wide records from all devices, including both local and cloud-synced data.
- Standardized `Project Timer: Delete All` command: Deletes all version-wide storage across all devices, including both local and cloud-synced data.

## [0.0.2] - 2026-02-13
### Added
- Add `project-timer.timer.unfocusedThreshold` setting.
- Add `project-timer.timer.pauseWhenIdle` setting.

### Changed
- Updated default `project-timer.timer.idleThreshold` from `10` to `5` minutes to increase precision.
- Standardized behavior of `0` value for `project-timer.timer.idleThreshold`
    - Before: `0` would disable idle detection.
    - After: `0` will be treated as `0` minutes (pause immediately when idle).
- Changed project name style on status bar menu.
- Refactored `project-timer.statusBar.displayToday` into a more versatile `displayTimeMode` setting, allowing users to choose between showing `today`, `total`, or `both` time metrics.

## [0.0.1] - 2026-02-12
Initial release of Project Timer.

### Added
#### Time Tracking
- **Core Timer**: Automatic real-time tracking of coding activity, including per-language and per-file breakdowns.
- **Idle Detection**: Configurable automatic pausing when user activity is not detected.
- **Focus Awareness**: Option to pause the timer when the VS Code window loses focus.

#### Visualization
- **Status Bar Integration**: A live-updating status bar item with customizable display options.
- **Statistics Webview**: A dedicated dashboard providing visual insights into coding history and patterns.

#### Data Management
- **Local Storage**: Secure storage within VS Code's global state.
- **Data Portability**: Commands to **Export**, **Import**, and **Reset** tracking data via JSON files.