const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { INSTALL_DIR } = require('./slp-setup');

let localServicePort = null;
let serviceProcess = null;

function getSlpDir() {
  return path.join(os.homedir(), '.smartloop');
}

function getSlpBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'slp.exe' : 'slp';
  return path.join(INSTALL_DIR, binaryName);
}

function ensureSlpDir() {
  fs.mkdirSync(getSlpDir(), { recursive: true });
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

function getLocalBaseUrl() {
  return localServicePort ? `http://localhost:${localServicePort}` : null;
}

function getPort() {
  return localServicePort;
}

/**
 * Check if the SLP service is running and healthy.
 * Updates internal port state if healthy.
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  const port = localServicePort || readLocalServicePort();
  if (!port) return false;

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

  if (!fs.existsSync(slpBinary)) {
    console.error('[SLP] Binary not found at:', slpBinary);
    return false;
  }

  ensureSlpDir();

  // Check if already running
  const existingPort = readLocalServicePort();
  if (existingPort) {
    try {
      const res = await fetch(`http://localhost:${existingPort}/health`);
      if (res.ok) {
        console.log('[SLP] Service already running on port', existingPort);
        localServicePort = existingPort;
        return true;
      }
    } catch {
      // Stale port file — remove it
      console.log('[SLP] Stale port file, removing and starting fresh...');
      try {
        fs.unlinkSync(path.join(getSlpDir(), 'server.port'));
      } catch { }
    }
  }

  console.log('[SLP] Starting service from:', slpBinary);

  // Start as a child process — capture stderr to detect early crashes
  const proc = spawn(slpBinary, ['start'], {
    env: { ...process.env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  serviceProcess = proc;
  let stderrOutput = '';
  let procExited = false;

  proc.stderr.on('data', (data) => {
    stderrOutput += data.toString();
  });

  proc.on('error', (err) => {
    console.error('[SLP] Process error:', err.message);
    procExited = true;
  });

  proc.on('exit', (code) => {
    procExited = true;
    if (serviceProcess === proc) serviceProcess = null;
    if (code !== 0) {
      console.error(`[SLP] Process exited with code ${code}`);
      if (stderrOutput) {
        console.error('[SLP] stderr:', stderrOutput.slice(-500));
      }
    }
  });

  // Poll for server.port file + health check (up to 120s)
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
        if (stderrOutput) {
          console.error('[SLP] Last stderr:', stderrOutput.slice(-500));
        }
        resolve(false);
        return;
      }

      const port = readLocalServicePort();
      if (port) {
        try {
          const res = await fetch(`http://localhost:${port}/health`);
          if (res.ok) {
            clearInterval(pollInterval);
            localServicePort = port;
            console.log('[SLP] Service started on port', port);
            resolve(true);
            return;
          }
        } catch {
          // Port file exists but server not ready yet
        }
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
 * Kills the child process directly if we own it, falls back to CLI command.
 */
function stopService() {
  console.log('[SLP] Stopping service...');

  if (serviceProcess && !serviceProcess.killed) {
    try {
      serviceProcess.kill('SIGTERM');
      console.log('[SLP] Service process terminated');
    } catch (error) {
      console.warn('[SLP] Error killing service process:', error.message);
    }
    serviceProcess = null;
  } else {
    // Fallback: service was started externally or process ref lost
    const slpBinary = getSlpBinaryPath();
    if (fs.existsSync(slpBinary)) {
      try {
        execFileSync(slpBinary, ['stop'], {
          env: { ...process.env },
          timeout: 10000,
        });
        console.log('[SLP] Service stopped via CLI');
      } catch (error) {
        console.warn('[SLP] Error stopping service via CLI:', error.message);
      }
    }
  }

  localServicePort = null;
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
  getPort,
  checkHealth,
  startService,
  stopService,
  loadModel,
  unloadModel,
};
