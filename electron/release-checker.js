const { app } = require('electron');
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
 * Always served from SLP's ~1h release cache. There is no force variant because
 * there is no longer anything to force: no build installs its own updates, so
 * the worst a stale cache costs is hearing about a release up to an hour late.
 */
async function fetchLatest() {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;

  try {
    const url = `${baseUrl}/v1/releases/latest?current_version=${encodeURIComponent(appVersion)}&channel=${CHANNEL}`;
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
    onStatusChange?.();
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
 * `statusChangeCb` fires whenever the known release changes so callers can react
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

/** Last known release-check result, or null if none yet. */
function getLast() {
  return lastResult;
}

/**
 * How this build gets a new version.
 *
 *   'manual'  we say one exists and point at the download; the user installs it.
 *   'store'   someone else delivers it (the Mac App Store). Say nothing — an
 *             "update available" notice the app can't act on is a dead end.
 *   'none'    unpackaged dev build. No release feed, nothing to report.
 *
 * There is deliberately no in-place option. The app used to download and
 * install updates itself through electron-updater, and on macOS that went
 * through Squirrel.Mac, which reads the whole update zip into memory before
 * unpacking it: NSURLConnection accumulates the body into a CFMutableData,
 * which grows by doubling its capacity. A payload over 1 GiB therefore asks for
 * a single 2 GiB allocation, and Electron's PartitionAlloc refuses one that
 * large — it treats an over-cap allocation as a fatal OOM and traps instead of
 * returning NULL.
 *
 * Our zip is ~1.93 GiB with the models bundled, so 1.0.45 through 1.0.48
 * crash-looped every macOS client that took an update: dead about four seconds
 * after launch, on every launch, recoverable only by reinstalling. Nothing
 * shipped in the app could fix it, because the client crashed before it could
 * install the fix.
 *
 * Windows and Linux never had that ceiling, but keeping a second delivery path
 * alive for them meant keeping the whole download/pause/resume/restart
 * machinery — and an update flow only two of three platforms exercise is one
 * only two of three platforms test. Every build now behaves the way the Mac App
 * Store build always has: it reports what it knows and leaves installing to the
 * user.
 */
function getDelivery() {
  if (!app.isPackaged) return 'none';
  if (process.mas === true) return 'store';
  return 'manual';
}

module.exports = {
  start,
  stop,
  getLast,
  getDelivery,
};
