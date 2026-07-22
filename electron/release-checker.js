const slpService = require('./slp-service');
const appVersion = require('../package.json').version;

// Backend caches the cloud release feed for ~1h, so a slow client cadence is fine.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CHANNEL = 'stable';

let timeoutId = null;
let started = false;
let getWindow = null;
let lastResult = null;

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
  if (result) send('release-update', result);
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
 */
function start(windowGetter) {
  getWindow = windowGetter;
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
  if (result) send('release-update', result);
  return result ?? lastResult;
}

/** Last known release-check result, or null if none yet. */
function getLast() {
  return lastResult;
}

// --- electron-updater hookup (backend stage 2) -----------------------------
// The response carries `feed_url` (e.g. https://api.smartloop.ai/v1/releases/feed/stable),
// which points at an electron-updater-compatible feed. Once the feed is live and
// `electron-updater` is added as a dependency, wire it here roughly as:
//
//   const { autoUpdater } = require('electron-updater');
//   autoUpdater.setFeedURL({ provider: 'generic', url: getFeedUrl(), channel: CHANNEL });
//   await autoUpdater.checkForUpdatesAndNotify();   // download in background
//   autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());
//
// Also requires a `publish` block in electron-builder.yml pointed at the same feed.
// TODO(stage 2): implement the download/quitAndInstall flow.
function getFeedUrl() {
  return lastResult?.feed_url ?? null;
}

module.exports = { start, stop, checkNow, getLast, getFeedUrl };
