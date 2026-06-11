const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { getInstallDir, getInstalledBinaryPath, isNonEmptyFile } = require('./slp-setup');

const DEFAULT_SLP_PORT = 38540;

let localServicePort = null;
let serviceProcess = null;
let logStream = null;
let startedByApp = false;

function getSlpDir() {
  return getInstallDir();
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

function getLocalBaseUrl() {
  const port = localServicePort || DEFAULT_SLP_PORT;
  return `http://localhost:${port}`;
}

function getPort() {
  return localServicePort || DEFAULT_SLP_PORT;
}

/**
 * Check if the SLP service is running and healthy.
 * Updates internal port state if healthy.
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  const port = localServicePort || DEFAULT_SLP_PORT;

  try {
    const res = await fetch(`http://localhost:${port}/health`);
    if (res.ok) {
      localServicePort = port;
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
    const res = await fetch(`http://localhost:${targetPort}/health`);
    if (res.ok) {
      console.log('[SLP] Service already running on port', targetPort);
      localServicePort = targetPort;
      startedByApp = true;
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
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  proc.stdout.on('data', (data) => {
    logStream.write(data);
  });
  proc.stderr.on('data', (data) => {
    logStream.write(data);
  });

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
        const res = await fetch(`http://localhost:${targetPort}/health`);
        if (res.ok) {
          clearInterval(pollInterval);
          localServicePort = targetPort;
          startedByApp = true;
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

/**
 * Stop the SLP server.
 * Always uses the CLI `server stop` command to ensure the actual server
 * process exits cleanly, even if it was forked as a daemon.
 * Also kills the tracked child process if we still hold a reference.
 */
async function stopService() {
  console.log('[SLP] Stopping service...');

  // Always use CLI command to stop the server — this ensures the actual
  // daemon/server process is told to shut down properly.
  const slpBinary = getSlpBinaryPath();
  if (fs.existsSync(slpBinary)) {
    try {
      await new Promise((resolve, reject) => {
        execFile(slpBinary, ['agent', 'stop'], {
          env: { ...process.env },
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

  // Also kill the tracked child process if it's still alive
  if (serviceProcess && !serviceProcess.killed) {
    try {
      serviceProcess.kill('SIGTERM');
      console.log('[SLP] Child process terminated');
    } catch (error) {
      console.warn('[SLP] Error killing child process:', error.message);
    }
    serviceProcess = null;
  }

  // Close log stream
  if (logStream) {
    logStream.write(`--- Service stopped at ${new Date().toISOString()} ---\n`);
    logStream.end();
    logStream = null;
  }

  localServicePort = null;
  startedByApp = false;
}

/**
 * Returns true if this app instance owns/started the service.
 */
function isOwnedByApp() {
  return startedByApp;
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
  getLogPath,
  getPort,
  checkHealth,
  startService,
  stopService,
  isOwnedByApp,
  loadModel,
  unloadModel,
};
