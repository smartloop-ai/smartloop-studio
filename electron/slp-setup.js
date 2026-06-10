const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const database = require('./database');

const VERSION = '1.0.28';
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.smartloop');
let INSTALL_DIR = DEFAULT_INSTALL_DIR;

function getVersionDir() { return path.join(INSTALL_DIR, VERSION, 'bin'); }
function getMarkerFile() { return path.join(INSTALL_DIR, '.installed-version'); }
function getHashFile()   { return path.join(INSTALL_DIR, '.binary-hash'); }

function getBundledBinaryDir() {
  const { app } = require('electron');
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, 'data', 'slp', VERSION);
  }
  return path.join(process.resourcesPath, 'data', 'slp', VERSION);
}

function setInstallDir(dir) {
  INSTALL_DIR = dir || DEFAULT_INSTALL_DIR;
}

function getInstallDir() {
  return INSTALL_DIR;
}

/**
 * Compare two semver strings (major.minor.patch).
 * Returns true if a >= b.
 */
function semverGte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true; // equal
}

/**
 * True when a file exists and is non-empty. A zero-byte binary (e.g. from a
 * truncated download or a bad archive extract) "exists" on disk but cannot
 * run — execution exits immediately, leaving a stale server.port and a
 * connection-refused renderer. Treat such a binary as missing so the
 * install/start paths reinstall it instead of looping on a dead process.
 */
function isNonEmptyFile(filePath) {
  try {
    return fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function getInstalledBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'slp.exe' : 'slp';
  try {
    if (fs.existsSync(getMarkerFile())) {
      const installed = fs.readFileSync(getMarkerFile(), 'utf-8').trim();
      if (semverGte(installed, VERSION)) {
        return path.join(INSTALL_DIR, installed, 'bin', binaryName);
      }
    }
  } catch {}
  return path.join(getVersionDir(), binaryName);
}

function needsInstall() {
  try {
    if (!fs.existsSync(getMarkerFile())) return true;
    const installed = fs.readFileSync(getMarkerFile(), 'utf-8').trim();
    if (!semverGte(installed, VERSION)) return true;
    const installedBinary = getInstalledBinaryPath();
    if (!isNonEmptyFile(installedBinary)) return true;
    if (fs.existsSync(getHashFile())) {
      const storedHash = fs.readFileSync(getHashFile(), 'utf-8').trim();
      const currentHash = crypto.createHash('sha256').update(fs.readFileSync(installedBinary)).digest('hex');
      if (storedHash !== currentHash) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * True when an SLP version is already installed but is older than (or no
 * longer matches) the bundled VERSION and must be upgraded/reinstalled.
 * Distinct from a fresh install (no version installed yet) — the marker
 * file must exist for this to return true.
 */
function needsUpgrade() {
  return fs.existsSync(getMarkerFile()) && needsInstall();
}

/**
 * Run a command asynchronously and return a promise.
 */
function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a local file.
 */
function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Install steps
// ─────────────────────────────────────────────────────────────────────────────

async function installService(onProgress) {
  const slpBinary = getInstalledBinaryPath();
  if (isNonEmptyFile(slpBinary)) {
    console.log('[SLP Setup] Version', VERSION, 'already installed, skipping');
    if (onProgress) onProgress({ status: 'installing', message: 'Already installed.' });
    return;
  }

  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  // ── Step 1: Copy bundled binary to version dir ───────────────────────────
  console.log('[SLP Setup] Installing bundled binary...');
  if (onProgress) onProgress({ status: 'installing', message: 'Installing...' });

  const bundledDir = getBundledBinaryDir();
  if (!fs.existsSync(bundledDir)) {
    throw new Error(`Bundled SLP binary not found at ${bundledDir}`);
  }

  fs.mkdirSync(getVersionDir(), { recursive: true });
  const existing = fs.readdirSync(getVersionDir());
  for (const f of existing) {
    fs.rmSync(path.join(getVersionDir(), f), { recursive: true, force: true });
  }
  copyDirRecursive(bundledDir, getVersionDir());

  // ── Step 2: Verify binary ────────────────────────────────────────────────
  console.log('[SLP Setup] Preparing for first use...');
  if (onProgress) onProgress({ status: 'installing', message: 'Preparing for first use...' });

  if (!isNonEmptyFile(slpBinary)) {
    throw new Error(`Binary missing or empty at ${slpBinary} after copy — bundled binary may be truncated`);
  }

  const isWindows = process.platform === 'win32';
  if (!isWindows) {
    fs.chmodSync(slpBinary, 0o755);
  }

  try {
    await runAsync(slpBinary, ['--version'], { windowsHide: true });
  } catch (err) {
    throw new Error(`Installation verification failed: 'slp --version' did not succeed: ${err.message}`);
  }

  const binaryHash = await fileSha256(slpBinary);
  fs.writeFileSync(getHashFile(), binaryHash);

  // ── Step 3: Write version tracking files ─────────────────────────────────
  if (onProgress) onProgress({ status: 'installing', message: 'Configuring...' });

  fs.writeFileSync(path.join(INSTALL_DIR, 'version'), VERSION);
  const installedFile = path.join(INSTALL_DIR, 'installed');
  let installedVersions = '';
  try { installedVersions = fs.readFileSync(installedFile, 'utf-8'); } catch {}
  if (!installedVersions.split('\n').includes(VERSION)) {
    fs.appendFileSync(installedFile, VERSION + '\n');
  }

  if (process.platform === 'darwin') {
    try {
      execSync(`xattr -dr com.apple.quarantine "${getVersionDir()}"`, { stdio: 'pipe' });
    } catch {}
  }

  console.log('[SLP Setup] Install complete — binary at', slpBinary);
}

/**
 * Recursively copy contents of srcDir into destDir.
 */
function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(srcPath);
      try { fs.unlinkSync(destPath); } catch {}
      fs.symlinkSync(linkTarget, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full setup: install SLP to ~/.smartloop/.
 * @param {function} onProgress - Optional callback for splash screen progress updates.
 * @returns {Promise<boolean>} true if setup was performed, false if already up-to-date.
 */
async function setupSlpService(onProgress = null) {
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

  if (!done[0]) {
    await installService(onProgress);
    database.setInstallStepComplete(0);
    console.log('[SLP Setup] Step 0 (install) complete');
  }

  // Write version marker
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.writeFileSync(getMarkerFile(), VERSION);

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

  // Remove install directory
  if (fs.existsSync(INSTALL_DIR)) {
    fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
  }

  // Reset install step tracking so setup runs fresh on next launch
  try { database.resetInstallStatus(); } catch { }

  console.log('[SLP Setup] Uninstall complete');
}

/**
 * List all installed SLP versions whose binary actually exists on disk.
 * Reads the `installed` file and filters to versions with a valid binary.
 */
function listInstalledVersions() {
  const installedFile = path.join(INSTALL_DIR, 'installed');
  if (!fs.existsSync(installedFile)) return [];

  const binaryName = process.platform === 'win32' ? 'slp.exe' : 'slp';
  const versions = fs.readFileSync(installedFile, 'utf-8')
    .split('\n')
    .map(v => v.trim())
    .filter(v => v.length > 0);

  return versions.filter(v => {
    const binaryPath = path.join(INSTALL_DIR, v, 'bin', binaryName);
    return fs.existsSync(binaryPath);
  });
}

/**
 * Switch the active SLP version by updating the `.installed-version` marker.
 * Returns { success, error? }.
 */
function switchVersion(version) {
  const binaryName = process.platform === 'win32' ? 'slp.exe' : 'slp';
  const binaryPath = path.join(INSTALL_DIR, version, 'bin', binaryName);

  if (!fs.existsSync(binaryPath)) {
    return { success: false, error: `Binary not found for version ${version}` };
  }

  try {
    fs.writeFileSync(getMarkerFile(), version);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get the current active version from the `.installed-version` marker file.
 */
function getCurrentVersion() {
  try {
    if (fs.existsSync(getMarkerFile())) {
      return fs.readFileSync(getMarkerFile(), 'utf-8').trim();
    }
  } catch {}
  return VERSION;
}

module.exports = {
  setupSlpService,
  uninstallSlpService,
  needsInstall,
  needsUpgrade,
  isNonEmptyFile,
  getInstalledBinaryPath,
  getInstallDir,
  setInstallDir,
  listInstalledVersions,
  switchVersion,
  getCurrentVersion,
  DEFAULT_INSTALL_DIR,
  get INSTALL_DIR() { return INSTALL_DIR; },
  VERSION,
};
