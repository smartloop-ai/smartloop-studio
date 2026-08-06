// Centralized electron-log setup for the main process.
//
// Writes to the OS-standard log path with rotation (dir = app.name, which is
// "smartloop-studio" here — matches the userData dir):
//   macOS   ~/Library/Logs/smartloop-studio/main.log
//   Windows %USERPROFILE%\AppData\Roaming\smartloop-studio\logs\main.log
//   Linux   ~/.config/smartloop-studio/logs/main.log
//
// Required at the very top of main.js so failures during early startup — and
// electron-updater errors (autoUpdater.logger = this) — land on disk instead of
// a stdout that packaged builds discard.
const log = require('electron-log/main');

// Wire the renderer transport (electron-log/renderer) and console spying.
log.initialize();

// File is the source of truth in production. Rotate at 5 MB — electron-log
// renames the old file to main.old.log and keeps one generation.
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024;

// Still print in dev; in packaged builds stdout goes nowhere but the file
// transport captures everything regardless.
log.transports.console.level = 'debug';

// Capture the existing console.* calls across the main process (main.js,
// slp-service, slp-setup, database, …) without rewriting them — each maps to
// the matching electron-log function, so they now persist to the log file.
Object.assign(console, log.functions);

// Last resort: record anything that would otherwise crash the main process
// with no trace. No dialog — just get it on disk.
log.errorHandler.startCatching({ showDialog: false });

module.exports = log;
