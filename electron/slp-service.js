const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { getInstallDir, getInstalledBinaryPath, isNonEmptyFile } = require('./slp-setup');
const { isSandboxed } = require('./build-mode');

const DEFAULT_SLP_PORT = 38540;

// Every /health call is bounded. A refused connection answers instantly, but a
// socket that accepts and then says nothing — a half-dead service, or an
// unrelated process squatting on the port — leaves a bare fetch hanging
// forever, and startup waits on this before it can show anything.
const HEALTH_TIMEOUT_MS = 1500;

// How long a SIGTERM'd service gets to exit before it is killed outright.
const STOP_GRACE_MS = 4000;

let serviceHealthy = false;
let serviceProcess = null;
let logStream = null;
let startedByApp = false;
let libraryCwd = null;

function getSlpDir() {
  return getInstallDir();
}

/**
 * Environment for spawning the SLP binary. SLP resolves its home/data dir from
 * the SLP_HOME env var (see smartloop/config/app_settings.py home_dir),
 * defaulting to ~/.smartloop. Setting it explicitly makes state (server.port,
 * server.log, config, models, workspaces, conversations) land in whatever
 * getSlpDir() points at. In the Developer-ID build that's still ~/.smartloop
 * (no behavior change); in the sandboxed MAS build main.js points it at the
 * app's userData container, the only writable location. SLP defaults its API
 * host to 0.0.0.0; in the bundled/sandboxed build bind loopback only.
 */
function slpEnv() {
  const env = { ...process.env, SLP_HOME: getSlpDir() };
  if (isSandboxed()) env.SLP_API_HOST = '127.0.0.1';
  return env;
}

function getSlpBinaryPath() {
  return getInstalledBinaryPath();
}

function ensureSlpDir() {
  fs.mkdirSync(getSlpDir(), { recursive: true });
}

function getLogPath() {
  return path.join(getSlpDir(), 'server.log');
}

function readLocalServicePort() {
  try {
    const portFile = path.join(getSlpDir(), 'server.port');
    const portStr = fs.readFileSync(portFile, 'utf-8').trim();
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 0) {
      console.log('[SLP] Local service port:', port);
      return port;
    }
  } catch {
    // Port file may not exist yet
  }
  return null;
}

// Returns the port the service should use: env var override > port file > default 38540
function getTargetPort() {
  if (process.env.SLP_PORT) {
    const p = parseInt(process.env.SLP_PORT, 10);
    if (!isNaN(p) && p > 0) return p;
  }
  return readLocalServicePort() || DEFAULT_SLP_PORT;
}

// Base URL for the local SLP API, or null until the service is confirmed
// healthy. Callers treat null as "not ready" and skip the request. The port
// never changes locally, so it's the constant DEFAULT_SLP_PORT once healthy.
function getLocalBaseUrl() {
  if (!serviceHealthy) return null;
  return `http://localhost:${DEFAULT_SLP_PORT}`;
}

// Whether the local service has been confirmed healthy via a passing /health.
function isServiceReady() {
  return serviceHealthy;
}

function getPort() {
  return DEFAULT_SLP_PORT;
}

function getCwd() {
  return libraryCwd;
}

/** GET /health on a port, giving up rather than hanging. Throws like fetch. */
function fetchHealth(port) {
  return fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
}

/**
 * Check if the SLP service is running and healthy.
 * Marks the service ready if healthy.
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    const res = await fetchHealth(DEFAULT_SLP_PORT);
    if (res.ok) {
      serviceHealthy = true;
      try {
        const health = await res.json();
        if (health?.cwd) libraryCwd = health.cwd;
      } catch { /* health response not JSON or no cwd */ }
      return true;
    }
  } catch {
    // Not responding
  }
  return false;
}

/**
 * Start the SLP server as a fully detached background process.
 * @returns {Promise<boolean>}
 */
async function startService() {
  const slpBinary = getSlpBinaryPath();

  if (!isNonEmptyFile(slpBinary)) {
    // A missing or zero-byte binary cannot run — spawning it would exit
    // immediately and leave a stale port. Fail fast so the caller reinstalls
    // (needsInstall() also treats an empty binary as missing).
    console.error('[SLP] Binary missing or empty at:', slpBinary);
    return false;
  }

  ensureSlpDir();

  const targetPort = DEFAULT_SLP_PORT;

  // Check if already running on the target port
  try {
    const res = await fetchHealth(targetPort);
    if (res.ok) {
      console.log('[SLP] Service already running on port', targetPort);
      serviceHealthy = true;
      startedByApp = true;
      try {
        const health = await res.json();
        if (health?.cwd) libraryCwd = health.cwd;
      } catch { /* no cwd in health */ }
      return true;
    }
  } catch {
    // Not running yet
  }

  console.log('[SLP] Starting agent from:', slpBinary, 'on port', targetPort);

  // Open log file for stdout/stderr — append mode so logs persist across restarts
  const logFile = getLogPath();
  if (logStream) {
    logStream.end();
  }
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n--- Service starting at ${new Date().toISOString()} ---\n`);
  console.log('[SLP] Server logs writing to:', logFile);

  // Start as a child process — use pipe and manually redirect output to log file
  const proc = spawn(slpBinary, ['agent', 'start', '--port', String(targetPort)], {
    env: slpEnv(),
    cwd: getSlpDir(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Capture this process's stream so late stdout/stderr chunks (which can arrive
  // after the exit handler has ended/nulled the module-level `logStream`) write to
  // the right stream, and skip the write once it's no longer writable.
  const procLogStream = logStream;
  const writeLog = (data) => {
    if (procLogStream && procLogStream.writable) procLogStream.write(data);
  };
  proc.stdout.on('data', writeLog);
  proc.stderr.on('data', writeLog);

  serviceProcess = proc;
  let procExited = false;

  proc.on('error', (err) => {
    console.error('[SLP] Process error:', err.message);
    procExited = true;
  });

  proc.on('exit', (code) => {
    procExited = true;
    if (serviceProcess === proc) serviceProcess = null;
    if (code !== 0) {
      console.error(`[SLP] Process exited with code ${code}`);
    }
    if (logStream) {
      logStream.write(`--- Service exited with code ${code} at ${new Date().toISOString()} ---\n`);
      logStream.end();
      logStream = null;
    }
  });

  // Poll health endpoint until server is ready (up to 120s)
  // Abort early if the process crashes
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 120;
    const pollInterval = setInterval(async () => {
      attempts++;

      // If the process already exited, stop waiting
      if (procExited) {
        clearInterval(pollInterval);
        console.error('[SLP] Service process exited before becoming healthy');
        console.error('[SLP] Check logs at:', getLogPath());
        resolve(false);
        return;
      }

      try {
        const res = await fetchHealth(targetPort);
        if (res.ok) {
          clearInterval(pollInterval);
          serviceHealthy = true;
          startedByApp = true;
          try {
            const health = await res.json();
            if (health?.cwd) libraryCwd = health.cwd;
          } catch { /* no cwd in health */ }
          console.log('[SLP] Service started on port', targetPort);
          resolve(true);
          return;
        }
      } catch {
        // Server not ready yet
      }
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.error('[SLP] Timed out waiting for service to start');
        resolve(false);
      }
    }, 1000);
  });
}

/** Resolve true when the process exits within ms, false when it outlasts it. */
function waitForExit(proc, ms) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      proc.off('exit', onExit);
      resolve(false);
    }, ms);
    proc.once('exit', onExit);
  });
}

/**
 * Ask the SLP CLI to stop whatever is serving. This is the only way to reach a
 * service this process did not start, and it is expensive: the CLI is a second
 * copy of the whole framework, and booting it costs seconds (~6s on macOS,
 * where it's a PyInstaller bundle) purely to deliver a signal. Reserved for the
 * case where there is no child of ours to signal directly.
 */
async function stopViaCli() {
  const slpBinary = getSlpBinaryPath();
  if (!fs.existsSync(slpBinary)) return;
  try {
    await new Promise((resolve, reject) => {
      execFile(slpBinary, ['agent', 'stop'], {
        env: slpEnv(),
        cwd: getSlpDir(),
        timeout: 10000,
        windowsHide: true,
      }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    console.log('[SLP] Service stopped via CLI');
  } catch (error) {
    console.warn('[SLP] Error stopping service via CLI:', error.message);
  }
}

/**
 * Stop the SLP server.
 *
 * `agent start` does not daemonize — the child we spawned IS the server — so
 * signalling it directly ends it in milliseconds. That matters most at quit:
 * booting the CLI just to say "stop" took longer than the app had left to live,
 * so Electron exited out from under it and the server survived as an orphan
 * holding the port, which the next launch then adopted (blank screen while it
 * waited on a workspace that orphan was never going to build).
 *
 * The CLI remains the fallback for a service we don't own, and the backstop if
 * the port is still answering after our child is gone.
 */
async function stopService() {
  console.log('[SLP] Stopping service...');

  if (serviceProcess && !serviceProcess.killed) {
    const proc = serviceProcess;
    serviceProcess = null;
    try {
      proc.kill('SIGTERM');
      if (await waitForExit(proc, STOP_GRACE_MS)) {
        console.log('[SLP] Service stopped');
      } else {
        console.warn(`[SLP] Service ignored SIGTERM for ${STOP_GRACE_MS}ms — killing it`);
        proc.kill('SIGKILL');
        await waitForExit(proc, 1000);
      }
    } catch (error) {
      console.warn('[SLP] Error stopping the service process:', error.message);
    }

    // Our child is gone but something is still serving — a grandchild that
    // outlived it, or a service that was already there. The CLI is the only
    // thing that can reach it.
    if (await checkHealth()) {
      console.warn('[SLP] Port still answering after the process exited — falling back to the CLI');
      await stopViaCli();
    }
  } else {
    // Nothing of ours to signal: whatever holds the port was started elsewhere
    // (or orphaned by an earlier session).
    await stopViaCli();
  }

  // Close log stream
  if (logStream) {
    logStream.write(`--- Service stopped at ${new Date().toISOString()} ---\n`);
    logStream.end();
    logStream = null;
  }

  serviceHealthy = false;
  startedByApp = false;
}

/**
 * Returns true if this app instance owns/started the service.
 */
function isOwnedByApp() {
  return startedByApp;
}

/**
 * GET a JSON body from the running service, or null when it didn't answer with
 * one. Non-2xx is null too: SLP answers an error with a JSON body of its own
 * (`{"detail": ...}`), so parsing that as the result turns "the call failed"
 * into "the service says there is nothing" — a distinction callers act on.
 */
async function getJson(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) {
      console.warn(`[SLP] GET ${path} answered ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(`[SLP] GET ${path} failed:`, error.message);
    return null;
  }
}

/**
 * Load model via API.
 */
async function loadModel(baseUrl) {
  try {
    console.log('[SLP] Loading model...');
    const res = await fetch(`${baseUrl}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inference' })
    });
    if (res.ok) {
      console.log('[SLP] Model loaded successfully');
      return true;
    }
    console.error('[SLP] Model load failed:', res.status);
    return false;
  } catch (error) {
    console.error('[SLP] Error loading model:', error.message);
    return false;
  }
}

/**
 * Unload model via API.
 */
async function unloadModel() {
  const baseUrl = getLocalBaseUrl();
  if (!baseUrl) return;

  try {
    console.log('[SLP] Unloading model...');
    await fetch(`${baseUrl}/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('[SLP] Model unloaded');
  } catch (error) {
    console.warn('[SLP] Error unloading model:', error.message);
  }
}

module.exports = {
  getSlpDir,
  getSlpBinaryPath,
  ensureSlpDir,
  readLocalServicePort,
  getLocalBaseUrl,
  isServiceReady,
  getLogPath,
  getPort,
  getCwd,
  checkHealth,
  getJson,
  startService,
  stopService,
  isOwnedByApp,
  loadModel,
  unloadModel,
};
