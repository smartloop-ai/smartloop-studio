const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const database = require('./database');

const VERSION = '1.0.16';
const BASE_URL = `https://dl.smartloop.ai/slp/${VERSION}`;
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.smartloop');
let INSTALL_DIR = DEFAULT_INSTALL_DIR;

function getVersionDir() { return path.join(INSTALL_DIR, VERSION, 'bin'); }
function getCacheDir()   { return path.join(INSTALL_DIR, 'cache'); }
function getMarkerFile() { return path.join(INSTALL_DIR, '.installed-version'); }
function getHashFile()   { return path.join(INSTALL_DIR, '.binary-hash'); }

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
    if (!fs.existsSync(installedBinary)) return true;
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
// Platform detection
// ─────────────────────────────────────────────────────────────────────────────

function detectPlatform() {
  let plat, arch;

  if (process.platform === 'darwin') plat = 'darwin';
  else if (process.platform === 'linux') plat = 'linux';
  else if (process.platform === 'win32') plat = 'windows';
  else throw new Error(`Unsupported platform: ${process.platform}`);

  if (os.arch() === 'arm64') arch = 'arm64';
  else if (os.arch() === 'x64') arch = 'amd64';
  else throw new Error(`Unsupported architecture: ${os.arch()}`);

  if (plat === 'darwin' && arch !== 'arm64') {
    throw new Error('Only Apple Silicon (arm64) is supported on macOS');
  }
  if (plat === 'linux' && arch !== 'amd64') {
    throw new Error('Only x86_64 (amd64) is supported on Linux');
  }

  return { plat, arch };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download a file from `url` to `destPath`, reporting progress via onProgress.
 * Follows up to 10 redirects (needed for GitHub releases).
 */
function downloadFile(url, destPath, onProgress, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function doRequest(currentUrl, redirectsLeft) {
      const mod = currentUrl.startsWith('https') ? https : require('http');
      mod.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectsLeft <= 0) {
            file.close();
            try { fs.unlinkSync(destPath); } catch {}
            reject(new Error('Too many redirects'));
            return;
          }
          doRequest(response.headers.location, redirectsLeft - 1);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch {}
          reject(new Error(`Download failed with HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10) || 0;
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) onProgress({ downloaded, total });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve());
        });

        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    }

    doRequest(url, maxRedirects);
  });
}

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
  const { plat, arch } = detectPlatform();

  // If binary already exists, skip
  const slpBinary = getInstalledBinaryPath();
  if (fs.existsSync(slpBinary)) {
    console.log('[SLP Setup] Version', VERSION, 'already installed, skipping download');
    if (onProgress) onProgress({ status: 'installing', message: 'Already installed.' });
    return;
  }

  for (const dir of [INSTALL_DIR, getCacheDir()]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Step 1: Determine archive name & URL ─────────────────────────────────
  const isWindows = plat === 'windows';
  const ext = isWindows ? 'zip' : 'tar.gz';
  const archiveName = `${plat}-${arch}-slp.${ext}`;
  const archiveUrl = `${BASE_URL}/${archiveName}`;
  const cachedArchive = path.join(getCacheDir(), `slp-${VERSION}-${plat}-${arch}.${ext}`);

  // ── Step 2: Download archive ──────────────────────────────────────────────
  await doDownload(archiveUrl, cachedArchive, onProgress);

  // ── Step 3: Extract ───────────────────────────────────────────────────────
  console.log('[SLP Setup] Extracting...');
  if (onProgress) onProgress({ status: 'installing', message: 'Extracting...' });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slp-extract-'));
  try {
    if (isWindows) {
      // Windows 10+ ships tar.exe (libarchive) which handles .zip and is much faster than Expand-Archive
      await runAsync('tar', ['-xf', cachedArchive, '-C', tmpDir]);
    } else {
      await runAsync('tar', ['-xzf', cachedArchive, '-C', tmpDir]);
    }

    // Copy extracted contents to version dir
    fs.mkdirSync(getVersionDir(), { recursive: true });
    const existing = fs.readdirSync(getVersionDir());
    for (const f of existing) {
      fs.rmSync(path.join(getVersionDir(), f), { recursive: true, force: true });
    }

    const extractedSlpDir = path.join(tmpDir, 'slp');
    if (fs.existsSync(extractedSlpDir)) {
      copyDirRecursive(extractedSlpDir, getVersionDir());
    } else {
      copyDirRecursive(tmpDir, getVersionDir());
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ── Step 4: Verify binary ─────────────────────────────────────────────────
  console.log('[SLP Setup] Verifying installation...');
  if (onProgress) onProgress({ status: 'installing', message: 'Verifying installation...' });

  if (!fs.existsSync(slpBinary)) {
    throw new Error(`Binary not found at ${slpBinary} after extraction`);
  }

  if (!isWindows) {
    fs.chmodSync(slpBinary, 0o755);
  }

  try {
    await runAsync(slpBinary, ['--version'], { windowsHide: true });
  } catch (err) {
    throw new Error(`Installation verification failed: 'slp --version' did not succeed: ${err.message}`);
  }

  // Store binary hash for integrity tracking on future launches
  const binaryHash = await fileSha256(slpBinary);
  fs.writeFileSync(getHashFile(), binaryHash);

  // ── Step 5: Write version tracking files ─────────────────────────────────
  if (onProgress) onProgress({ status: 'installing', message: 'Configuring...' });

  // Write version tracking files
  fs.writeFileSync(path.join(INSTALL_DIR, 'version'), VERSION);
  const installedFile = path.join(INSTALL_DIR, 'installed');
  let installedVersions = '';
  try { installedVersions = fs.readFileSync(installedFile, 'utf-8'); } catch {}
  if (!installedVersions.split('\n').includes(VERSION)) {
    fs.appendFileSync(installedFile, VERSION + '\n');
  }

  // macOS: strip quarantine attributes
  if (process.platform === 'darwin') {
    try {
      execSync(`xattr -dr com.apple.quarantine "${getVersionDir()}"`, { stdio: 'pipe' });
    } catch {}
  }

  console.log('[SLP Setup] Install complete — binary at', slpBinary);
}

/**
 * Create a throttled version of onProgress that fires at most once every intervalMs.
 * Always fires the first call immediately and flushes the last pending update on dispose.
 */
function throttleProgress(onProgress, intervalMs = 200) {
  if (!onProgress) return { fire: () => {}, dispose: () => {} };
  let lastFired = 0;
  let pending = null;
  let timer = null;

  function fire(data) {
    const now = Date.now();
    if (now - lastFired >= intervalMs) {
      lastFired = now;
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
      onProgress(data);
    } else {
      pending = data;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) {
            lastFired = Date.now();
            onProgress(pending);
            pending = null;
          }
        }, intervalMs - (now - lastFired));
      }
    }
  }

  function dispose() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) { onProgress(pending); pending = null; }
  }

  return { fire, dispose };
}

/**
 * Download a single file with progress reporting.
 */
async function doDownload(url, destPath, onProgress) {
  console.log('[SLP Setup] Downloading from', url);
  if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0, message: 'Downloading Framework... ' });

  const throttled = throttleProgress(onProgress);
  await downloadFile(url, destPath, (p) => {
    throttled.fire({ status: 'downloading', ...p, message: 'Downloading Framework... ' });
  });
  throttled.dispose();
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
