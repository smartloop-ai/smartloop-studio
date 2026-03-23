const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const database = require('./database');

const crypto = require('crypto');

const VERSION = '1.0.1';
const INSTALL_DIR = path.join(os.homedir(), '.smartloop');
const MARKER_FILE = path.join(INSTALL_DIR, '.installed-version');

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function needsInstall() {
  try {
    if (!fs.existsSync(MARKER_FILE)) return true;
    const installed = fs.readFileSync(MARKER_FILE, 'utf-8').trim();
    if (installed !== VERSION) return true;
    // Check if the installed binary matches the bundled one
    const installedBinary = path.join(INSTALL_DIR, 'slp');
    const bundledBinary = path.join(getBundledSlpDir(), 'slp');
    if (!fs.existsSync(installedBinary) || !fs.existsSync(bundledBinary)) return true;
    return sha256File(installedBinary) !== sha256File(bundledBinary);
  } catch {
    return true;
  }
}

/**
 * Run a command asynchronously and return a promise.
 * Optionally calls onProgress with stderr/stdout data for progress reporting.
 */
function runAsync(command, args, options = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      if (onProgress) onProgress(data.toString());
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      if (onProgress) onProgress(data.toString());
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command "${command} ${args.join(' ')}" exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Get the path to the bundled SLP binary inside the app resources.
 * In development, this is at build/slp/slp/.
 * In production (packaged), it's in the app's extraResources.
 */
function getBundledSlpDir() {
  const { app } = require('electron');
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'slp', 'slp');
  }
  // Development: use build/slp/slp/ relative to project root
  return path.join(__dirname, '..', 'build', 'slp', 'slp');
}

/**
 * Copy the bundled SLP pex binary to INSTALL_DIR.
 * Single file copy — pex is a self-contained executable.
 */
async function installBundledBinary(onProgress = null) {
  if (onProgress) onProgress({ status: 'installing', message: 'Installing framework...' });

  const bundledDir = getBundledSlpDir();
  const bundledBinary = path.join(bundledDir, 'slp');

  if (!fs.existsSync(bundledBinary)) {
    throw new Error(`Bundled SLP binary not found at: ${bundledBinary}`);
  }

  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  // Remove legacy PyInstaller _internal directory if present
  const legacyInternal = path.join(INSTALL_DIR, '_internal');
  if (fs.existsSync(legacyInternal)) {
    console.log('[SLP Setup] Removing legacy _internal directory');
    fs.rmSync(legacyInternal, { recursive: true, force: true });
  }

  // Copy the pex binary
  const destBinary = path.join(INSTALL_DIR, 'slp');
  console.log('[SLP Setup] Copying bundled binary to', destBinary);
  fs.copyFileSync(bundledBinary, destBinary);
  fs.chmodSync(destBinary, 0o755);

  console.log('[SLP Setup] Binary installed from app bundle to', INSTALL_DIR);
}

/**
 * Run the full setup: copy bundled binary to ~/.smartloop/.
 * Each sub-step is tracked in SQLite so a partial install is automatically
 * resumed on the next launch rather than restarted.
 * @param {function} onProgress - Optional callback for splash screen progress updates.
 * @returns {Promise<boolean>} true if setup was performed, false if already up-to-date.
 */
async function setupSlpService(onProgress = null) {
  // If version changed, reset all step tracking so we reinstall cleanly
  if (needsInstall()) {
    console.log('[SLP Setup] Version changed or not installed — resetting install status');
    database.resetInstallStatus();
  }

  const status = database.getInstallStatus();
  const done = status.reduce((acc, s) => { acc[s.step] = s.completed === 1; return acc; }, {});

  if (done[0]) {
    console.log('[SLP Setup] Already installed version', VERSION);
    return false;
  }

  console.log('[SLP Setup] Installing SLP service version', VERSION);

  // Step 0: Copy bundled binary
  if (!done[0]) {
    await installBundledBinary(onProgress);
    database.setInstallStepComplete(0);
    console.log('[SLP Setup] Step 0 (install_binary) complete');
  }

  // Write version marker
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.writeFileSync(MARKER_FILE, VERSION);

  console.log('[SLP Setup] Setup complete');
  return true;
}

function uninstallSlpService() {
  console.log('[SLP Setup] Uninstalling SLP service...');

  // Remove old systemd service if present
  if (process.platform === 'linux') {
    try {
      require('child_process').execSync('systemctl --user stop smartloop.service', { stdio: 'pipe' });
      require('child_process').execSync('systemctl --user disable smartloop.service', { stdio: 'pipe' });
      const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'smartloop.service');
      try { fs.unlinkSync(servicePath); } catch {}
      require('child_process').execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    } catch {}
  } else if (process.platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.smartloop.server.plist');
    try {
      require('child_process').execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
      fs.unlinkSync(plistPath);
    } catch {}
  }

  // Remove old symlink
  try { fs.unlinkSync(path.join(os.homedir(), '.local', 'bin', 'slp')); } catch {}

  // Remove install directory
  if (fs.existsSync(INSTALL_DIR)) {
    fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
  }

  // Reset install step tracking so setup runs fresh on next launch
  try { database.resetInstallStatus(); } catch { }

  console.log('[SLP Setup] Uninstall complete');
}

module.exports = {
  setupSlpService,
  uninstallSlpService,
  INSTALL_DIR,
  VERSION,
};
