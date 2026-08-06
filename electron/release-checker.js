const { app } = require('electron');
const { autoUpdater, CancellationToken } = require('electron-updater');
const slpService = require('./slp-service');
const appVersion = require('../package.json').version;

// Matches the backend's ~1h release cache, so an unattended app picks up a
// release within the hour without ever hitting the cloud more often than that.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CHANNEL = 'stable';

let timeoutId = null;
let started = false;
let getWindow = null;
let lastResult = null;
let onStatusChange = null;

// electron-updater state
let updaterWired = false;
let updateInFlight = null; // version currently downloading, to avoid re-triggering
let updaterStatus = { state: 'idle' };
let downloadToken = null;   // CancellationToken for the in-flight download (pause)
let downloadPaused = false; // user paused — suppresses auto-restart from polls
let stagedInfo = null;      // last update-available info, so resume can restart

function send(channel, data) {
  const win = getWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

/**
 * Query the local SLP service for the latest release on the stable channel.
 * Returns the parsed response (also cached as `lastResult`) or null on failure.
 *
 * Pass `force = true` (manual "Check for Updates") to have the backend bypass
 * its ~1h release cache and re-poll the cloud immediately. The periodic poll
 * leaves it off so it serves from cache.
 */
async function fetchLatest(force = false) {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;

  try {
    const url = `${baseUrl}/v1/releases/latest?current_version=${encodeURIComponent(appVersion)}&channel=${CHANNEL}${force ? '&force=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    lastResult = await res.json();
    return lastResult;
  } catch {
    // Network/parse error — leave the last known result in place.
    return null;
  }
}

async function pollOnce() {
  const result = await fetchLatest();
  if (result) {
    send('release-update', result);
    maybeStartUpdate(result);
  }
}

async function tick() {
  if (!started) return;
  await pollOnce();
  if (started) {
    timeoutId = setTimeout(tick, CHECK_INTERVAL_MS);
  }
}

/**
 * Start the periodic release check. `windowGetter` returns the current
 * BrowserWindow to broadcast to (a getter so we always read the live reference).
 * `statusChangeCb` fires on every updater state change so callers can react
 * outside the renderer (main.js uses it to rebuild the tray menu).
 */
function start(windowGetter, statusChangeCb) {
  getWindow = windowGetter;
  onStatusChange = statusChangeCb ?? null;
  if (started) return;
  started = true;
  // Check immediately. No startup delay is needed: fetchLatest() no-ops while
  // slpService.getLocalBaseUrl() reports the service unhealthy, so this relies
  // on the standard health gate the rest of the app uses rather than a timer.
  tick();
}

function stop() {
  started = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

/** Force an immediate check (manual "Check for Updates" button). Returns the result. */
async function checkNow() {
  const result = await fetchLatest(true);
  if (result) {
    send('release-update', result);
    maybeStartUpdate(result);
  }
  return result ?? lastResult;
}

/** Last known release-check result, or null if none yet. */
function getLast() {
  return lastResult;
}

// --- electron-updater (in-app download + install) --------------------------
// The SLP /releases response stays the "should we update?" gate; electron-updater
// only downloads + installs, seeded with the `feed_url` the backend returns.

/**
 * Whether electron-updater can actually download+install on this build/platform.
 * False in dev (no packaged app-update.yml) and for Linux .deb — only the
 * AppImage self-updates (electron sets APPIMAGE when launched from one).
 */
function updaterSupported() {
  if (!app.isPackaged) return false;
  switch (process.platform) {
    case 'darwin':
    case 'win32':
      return true;
    case 'linux':
      return !!process.env.APPIMAGE;
    default:
      return false;
  }
}

/**
 * Record the current updater state, push it to the renderer, and notify the
 * status-change callback. `version`/`percent` carry over from the previous
 * status when the incoming event omits them (download-progress has no version,
 * update-downloaded has no percent) so a late reader sees a complete picture.
 */
function setUpdaterStatus(next) {
  updaterStatus = {
    ...next,
    version: 'version' in next ? next.version : updaterStatus.version,
    percent: 'percent' in next ? next.percent : updaterStatus.percent,
  };
  send('updater-status', updaterStatus);
  onStatusChange?.();
}

/** Register electron-updater listeners once; forward normalized status to the renderer. */
function wireUpdater() {
  if (updaterWired) return;
  updaterWired = true;
  // Route electron-updater's own diagnostics to the log file. This is what
  // records the real reason an update download/install fails (e.g. a macOS
  // signature rejection that otherwise fails silently) — see logger.js.
  autoUpdater.logger = require('electron-log/main');
  // We drive downloadUpdate() ourselves so we can hold a CancellationToken and
  // pause the transfer — autoDownload would download without handing us one.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => setUpdaterStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    stagedInfo = info;
    // Honour a user pause: don't auto-start the download we just staged.
    if (downloadPaused) {
      setUpdaterStatus({ state: 'paused', version: info?.version });
      return;
    }
    setUpdaterStatus({ state: 'downloading', version: info?.version, percent: 0 });
    startDownload();
  });
  autoUpdater.on('update-not-available', () => {
    updateInFlight = null;
    stagedInfo = null;
    setUpdaterStatus({ state: 'idle', version: null, percent: 0 });
  });
  autoUpdater.on('download-progress', (p) =>
    setUpdaterStatus({ state: 'downloading', percent: Math.round(p?.percent ?? 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    downloadPaused = false;
    setUpdaterStatus({ state: 'downloaded', version: info?.version, percent: 100 });
  });
  autoUpdater.on('error', (err) => {
    // Pausing cancels the transfer, which surfaces here as an error — swallow it.
    if (isCancellation(err)) return;
    updateInFlight = null;
    setUpdaterStatus({ state: 'error', error: String(err?.message || err) });
  });
}

/** A cancelled download rejects/errrors with a cancellation message, not a real failure. */
function isCancellation(err) {
  return String(err?.message || err || '').toLowerCase().includes('cancel');
}

/** Start (or restart) the staged download, holding a token so it can be paused. */
function startDownload() {
  downloadPaused = false;
  downloadToken = new CancellationToken();
  autoUpdater.downloadUpdate(downloadToken).catch((err) => {
    if (downloadPaused || isCancellation(err)) return;
    updateInFlight = null;
    setUpdaterStatus({ state: 'error', error: String(err?.message || err) });
  });
}

/**
 * Pause the in-flight download. electron-updater can't resume from a byte
 * offset, so this cancels the transfer; resumeDownload() restarts it from the
 * top (partial data already on disk is reused where the provider allows).
 */
function pauseDownload() {
  if (updaterStatus.state !== 'downloading') return { success: false };
  downloadPaused = true;
  try { downloadToken?.cancel(); } catch { /* already settled */ }
  downloadToken = null;
  setUpdaterStatus({ state: 'paused' });
  return { success: true };
}

/** Resume a paused download by restarting the transfer for the staged version. */
function resumeDownload() {
  if (!updaterSupported()) return { success: false };
  downloadPaused = false;
  if (stagedInfo) {
    setUpdaterStatus({ state: 'downloading' });
    startDownload();
  } else {
    // Nothing staged (e.g. app restarted) — a fresh check re-stages and starts.
    autoUpdater.checkForUpdates();
  }
  return { success: true };
}

/**
 * If the SLP result reports an available update and we can self-update, point
 * electron-updater at the backend-provided feed and start a background download.
 * `feed_url` is the generic feed *directory* and already encodes the stable
 * track in its path, so we deliberately don't pass a `channel` — the metadata
 * files are named latest-*.yml (electron-builder defaults).
 */
function maybeStartUpdate(result) {
  if (!result?.update_available || !result.feed_url || !updaterSupported()) return;
  const version = result?.release?.version ?? null;
  if (updateInFlight === version) return; // already handling this version
  updateInFlight = version;
  wireUpdater();
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: result.feed_url });
    autoUpdater.checkForUpdates();
  } catch (err) {
    updateInFlight = null;
    setUpdaterStatus({ state: 'error', error: String(err?.message || err) });
  }
}

/**
 * Relaunch into the downloaded update. No-op if unsupported or nothing staged.
 * `isSilent = true` keeps Windows from showing the NSIS installer UI for what
 * the user asked to be a restart; both args are ignored on macOS.
 */
async function quitAndInstall() {
  if (!updaterSupported()) return { success: false };

  // Stop SLP and wait for it to exit before relaunching. main.js's before-quit
  // stops it too but doesn't await, so the old service can outlive the quit —
  // then the new instance adopts it and skips installing the SLP bundled with
  // this update. Awaiting here guarantees the port is free for a clean startup.
  try {
    await slpService.stopService();
  } catch (err) {
    console.warn('[Updater] Error stopping SLP before install:', err?.message || err);
  }

  setImmediate(() => {
    // The main window's close handler hides to tray unless this is set.
    let quitStarted = false;
    app.once('before-quit', () => { quitStarted = true; });
    app.isQuitting = true;
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      app.isQuitting = false;
      setUpdaterStatus({ state: 'error', error: String(err?.message || err) });
      return;
    }
    // electron-updater no-ops silently when the staged build turns out to be
    // missing or unusable — it neither throws nor emits 'error'. Not quitting
    // is the only signal, and leaving isQuitting set would stop the app hiding
    // to tray for the rest of the session.
    setTimeout(() => {
      if (quitStarted) return;
      app.isQuitting = false;
      setUpdaterStatus({ state: 'error', error: 'Update could not be installed. Try downloading it again.' });
    }, 5000);
  });
  return { success: true };
}

function isUpdaterSupported() {
  return updaterSupported();
}

/** Current electron-updater state, for renderers that mount after a push. */
function getUpdaterStatus() {
  return updaterStatus;
}

module.exports = {
  start,
  stop,
  checkNow,
  getLast,
  quitAndInstall,
  pauseDownload,
  resumeDownload,
  isUpdaterSupported,
  getUpdaterStatus,
};
