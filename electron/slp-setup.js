const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const database = require('./database');

const VERSION = '1.0.2';
const INSTALL_DIR = path.join(os.homedir(), '.smartloop');
const MARKER_FILE = path.join(INSTALL_DIR, '.installed-version');

function needsInstall() {
  try {
    if (!fs.existsSync(MARKER_FILE)) return true;
    const installed = fs.readFileSync(MARKER_FILE, 'utf-8').trim();
    return installed !== VERSION;
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
 * Copy the bundled SLP binary and its _internal directory to INSTALL_DIR.
 * Uses cp/rsync in a child process so the main thread stays responsive.
 * Preserves existing data files (database, cache, port/pid files).
 */
async function installBundledBinary(onProgress = null) {
  if (onProgress) onProgress({ status: 'installing', message: 'Installing framework...' });

  const bundledDir = getBundledSlpDir();

  if (!fs.existsSync(bundledDir)) {
    throw new Error(`Bundled SLP binary not found at: ${bundledDir}`);
  }

  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  // Files/dirs to preserve during install — move them to a temp dir, then restore
  const preserve = ['cache', 'studio.db', 'studio.db-wal', 'studio.db-shm',
    'server.port', 'server.pid', '.installed-version'];
  const tmpBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'slp-backup-'));

  // Back up preserved files
  for (const name of preserve) {
    const src = path.join(INSTALL_DIR, name);
    if (fs.existsSync(src)) {
      try {
        fs.renameSync(src, path.join(tmpBackup, name));
      } catch {
        // cross-device rename — fall back to copy
        fs.cpSync(src, path.join(tmpBackup, name), { recursive: true });
      }
    }
  }

  // Clear old install dir
  const existing = fs.readdirSync(INSTALL_DIR);
  for (const entry of existing) {
    const fullPath = path.join(INSTALL_DIR, entry);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }

  // Copy bundled binary using rsync (fast, async, doesn't block main thread)
  // rsync -a ensures permissions/symlinks are preserved
  console.log('[SLP Setup] Copying bundled binary to', INSTALL_DIR);
  try {
    await runAsync('rsync', ['-a', bundledDir + '/', INSTALL_DIR + '/']);
  } catch {
    // Fallback to cp -a if rsync is not available
    await runAsync('cp', ['-a', bundledDir + '/.', INSTALL_DIR + '/']);
  }

  // Restore preserved files
  for (const name of preserve) {
    const backed = path.join(tmpBackup, name);
    if (fs.existsSync(backed)) {
      const dest = path.join(INSTALL_DIR, name);
      try {
        fs.renameSync(backed, dest);
      } catch {
        fs.cpSync(backed, dest, { recursive: true });
      }
    }
  }
  fs.rmSync(tmpBackup, { recursive: true, force: true });

  // Make binary executable
  const binaryPath = path.join(INSTALL_DIR, 'slp');
  if (fs.existsSync(binaryPath)) {
    fs.chmodSync(binaryPath, 0o755);
  }

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
