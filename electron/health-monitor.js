const slpService = require('./slp-service');

const IDLE_INTERVAL_MS = 30_000;
const ACTIVE_INTERVAL_MS = 3_000;

let timeoutId = null;
let started = false;
let getWindow = null;
// Poll at the active cadence until this time even when nothing is indexing yet —
// covers the gap between a project import returning and SLP starting to index.
let activeUntil = 0;

function send(channel, data) {
  const win = getWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

async function pollOnce() {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) {
    send('health-update', { status: 'unknown' });
    return IDLE_INTERVAL_MS;
  }

  try {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) {
      send('health-update', { status: 'error', url: baseUrl, error: `HTTP ${res.status}` });
      return IDLE_INTERVAL_MS;
    }

    const health = await res.json();

    // Cadence: poll fast while anything is still being indexed.
    let nextDelay = Date.now() < activeUntil ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    const docs = health?.indexing?.documents;
    if (Array.isArray(docs)) {
      for (const d of docs) {
        if (d?.status && d.status !== 'indexed') {
          nextDelay = ACTIVE_INTERVAL_MS;
          break;
        }
      }
    }

    send('health-update', { status: 'running', url: baseUrl, details: health });
    return nextDelay;
  } catch (err) {
    // Network or parse error — surface as unreachable, back off to idle cadence.
    send('health-update', { status: 'unreachable', url: baseUrl, error: err?.message });
    return IDLE_INTERVAL_MS;
  }
}

async function tick() {
  if (!started) return;
  const next = await pollOnce();
  if (started) {
    timeoutId = setTimeout(tick, next);
  }
}

/**
 * Start polling /health. `windowGetter` is a function returning the current
 * BrowserWindow to broadcast to (passed as a getter so we always read the
 * live reference even if the window is recreated).
 */
function start(windowGetter) {
  getWindow = windowGetter;
  if (started) return;
  started = true;
  tick();
}

/**
 * Re-tick immediately. Call after a state change (e.g. service-ready) so the
 * UI doesn't wait up to 30s for the next scheduled poll.
 */
function poke() {
  if (!started) return;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  tick();
}

/**
 * Poll now and keep the fast cadence for `durationMs`. For state changes whose
 * effect lands a few seconds later (an import's documents start indexing only
 * once SLP has spun up the project agent), where a single poke is too early.
 */
function boost(durationMs) {
  activeUntil = Math.max(activeUntil, Date.now() + durationMs);
  poke();
}

function stop() {
  started = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

module.exports = { start, stop, poke, boost };
