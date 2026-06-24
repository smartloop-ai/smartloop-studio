const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const database = require('./database');

const VERSION = '1.0.0';
// SLP framework is downloaded at runtime (not bundled). Mirrors install.sh:
//   https://dl.smartloop.ai/slp/<version>/<plat>-<arch>-slp.<ext>
const SLP_BASE_URL = (process.env.SLP_BASE_URL || 'https://dl.smartloop.ai').replace(/\/+$/, '');
function getDownloadBaseUrl() { return `${SLP_BASE_URL}/slp/${VERSION}`; }

const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.smartloop');
let INSTALL_DIR = DEFAULT_INSTALL_DIR;

function getVersionDir() { return path.join(INSTALL_DIR, VERSION); }
function getCacheDir()   { return path.join(INSTALL_DIR, 'cache'); }
function getMarkerFile() { return path.join(INSTALL_DIR, '.installed-version'); }
function getHashFile()   { return path.join(INSTALL_DIR, '.binary-hash'); }
function getEtagFile()   { return path.join(INSTALL_DIR, '.archive-etag'); }

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
        return path.join(INSTALL_DIR, installed, binaryName);
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

/**
 * Run a command and invoke onLine(count) as lines arrive on stdout (verbose
 * output). Used to turn `tar -v` per-entry output into deterministic progress.
 * Reports are throttled to ~10/sec to avoid flooding the renderer.
 */
function runWithLineProgress(command, args, onLine, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let count = 0;
    let lastReport = 0;

    // GNU tar (Linux) prints the verbose file list to stdout; BSD tar (macOS)
    // prints it to stderr. Count newlines on whichever stream carries them so
    // progress works on both. stderr text is still kept for error reporting.
    const countNewlines = (chunk) => {
      const str = chunk.toString();
      for (let i = 0; i < str.length; i++) {
        if (str[i] === '\n') count++;
      }
      const now = Date.now();
      if (now - lastReport >= 100) {
        lastReport = now;
        onLine(count);
      }
    };

    proc.stdout.on('data', countNewlines);
    proc.stderr.on('data', (data) => { stderr += data.toString(); countNewlines(data); });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      onLine(count);
      if (code !== 0) {
        reject(new Error(`Command "${command} ${args.join(' ')}" exited with code ${code}: ${stderr}`));
      } else {
        resolve();
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download a file from `url` to `destPath`, reporting progress via onProgress.
 * Follows up to 10 redirects (needed for CDN/object-store redirects).
 */
function downloadFile(url, destPath, onProgress, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function doRequest(currentUrl, redirectsLeft) {
      const mod = currentUrl.startsWith('https') ? https : http;
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
 * Download the framework archive with throttled progress reporting.
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

function getArchiveUrl() {
  const { plat, arch } = detectPlatform();
  const ext = plat === 'windows' ? 'zip' : 'tar.gz';
  return `${getDownloadBaseUrl()}/${plat}-${arch}-slp.${ext}`;
}

/**
 * HEAD the remote archive and compare its ETag with the one stored at install
 * time. Returns true when the remote archive has changed (or no local ETag
 * exists yet).
 */
function checkRemoteArchiveHash() {
  const archiveUrl = getArchiveUrl();
  return new Promise((resolve) => {
    const mod = archiveUrl.startsWith('https') ? https : http;
    const req = mod.request(archiveUrl, { method: 'HEAD' }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = res.headers.location;
        const rmod = redirect.startsWith('https') ? https : http;
        const rreq = rmod.request(redirect, { method: 'HEAD' }, (rres) => {
          resolve(compareEtag(rres));
        });
        rreq.on('error', () => resolve(false));
        rreq.end();
        return;
      }
      resolve(compareEtag(res));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function storeRemoteEtag() {
  const archiveUrl = getArchiveUrl();
  return new Promise((resolve) => {
    const mod = archiveUrl.startsWith('https') ? https : http;
    const req = mod.request(archiveUrl, { method: 'HEAD' }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = res.headers.location;
        const rmod = redirect.startsWith('https') ? https : http;
        const rreq = rmod.request(redirect, { method: 'HEAD' }, (rres) => {
          saveEtag(rres);
          resolve();
        });
        rreq.on('error', () => resolve());
        rreq.end();
        return;
      }
      saveEtag(res);
      resolve();
    });
    req.on('error', () => resolve());
    req.setTimeout(10000, () => { req.destroy(); resolve(); });
    req.end();
  });
}

function saveEtag(res) {
  if (res.statusCode !== 200) return;
  const etag = (res.headers['etag'] || '').replace(/"/g, '');
  if (etag) {
    try { fs.writeFileSync(getEtagFile(), etag); } catch {}
  }
}

function compareEtag(res) {
  if (res.statusCode !== 200) return false;
  const remoteEtag = (res.headers['etag'] || '').replace(/"/g, '');
  if (!remoteEtag) return false;
  try {
    if (!fs.existsSync(getEtagFile())) return true;
    const storedEtag = fs.readFileSync(getEtagFile(), 'utf-8').trim();
    return storedEtag !== remoteEtag;
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Install steps
// ─────────────────────────────────────────────────────────────────────────────

async function installService(onProgress) {
  const { plat, arch } = detectPlatform();

  const slpBinary = getInstalledBinaryPath();
  if (isNonEmptyFile(slpBinary)) {
    console.log('[SLP Setup] Version', VERSION, 'already installed, skipping download');
    if (onProgress) onProgress({ status: 'installing', message: 'Already installed.' });
    linkBinary(slpBinary);
    return;
  }

  for (const dir of [INSTALL_DIR, getCacheDir()]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Step 1: Determine archive name & URL ─────────────────────────────────
  const isWindows = plat === 'windows';
  const ext = isWindows ? 'zip' : 'tar.gz';
  const archiveUrl = getArchiveUrl();
  const cachedArchive = path.join(getCacheDir(), `slp-${VERSION}-${plat}-${arch}.${ext}`);

  // ── Step 2: Download archive ─────────────────────────────────────────────
  await doDownload(archiveUrl, cachedArchive, onProgress);
  await storeRemoteEtag();

  // ── Step 3: Extract to version dir ───────────────────────────────────────
  console.log('[SLP Setup] Extracting...');
  if (onProgress) onProgress({ status: 'installing', message: 'Extracting...' });

  const versionRoot = path.join(INSTALL_DIR, VERSION);
  fs.mkdirSync(versionRoot, { recursive: true });
  for (const f of fs.readdirSync(versionRoot)) {
    fs.rmSync(path.join(versionRoot, f), { recursive: true, force: true });
  }

  // Extract straight into the version dir — no temp copy. The SLP bundle is
  // large (hundreds of MB), so a temp dir on a small tmpfs would overflow
  // ("Disk quota exceeded"). If the archive wraps everything in a top-level
  // slp/ dir, strip it so the binary lands at <versionRoot>/slp.
  const listFlag = isWindows ? '-tf' : '-tzf';
  const listing = await runAsync('tar', [listFlag, cachedArchive]);
  const entries = listing.split('\n').map((l) => l.trim()).filter(Boolean);
  const totalEntries = entries.length;
  const topLevel = new Set(entries.map((l) => l.split('/')[0]));
  const stripWrapper = topLevel.size === 1 && topLevel.has('slp');

  // Extract with -v so tar prints one line per entry; counting those lines
  // against the known total gives a deterministic extraction percentage.
  const extractArgs = [isWindows ? '-xvf' : '-xvzf', cachedArchive, '-C', versionRoot];
  if (stripWrapper) extractArgs.push('--strip-components=1');
  try {
    await runWithLineProgress('tar', extractArgs, (done) => {
      if (!onProgress || totalEntries === 0) return;
      const pct = Math.min(100, Math.round((done / totalEntries) * 100));
      onProgress({ status: 'installing', percent: pct, message: `Extracting Framework... ${pct}%` });
    });
  } finally {
    try { fs.unlinkSync(cachedArchive); } catch {}
  }

  // ── Step 4: Verify binary ────────────────────────────────────────────────
  console.log('[SLP Setup] Preparing for first use...');
  if (onProgress) onProgress({ status: 'installing', message: 'Preparing for first use...' });

  if (!isNonEmptyFile(slpBinary)) {
    throw new Error(`Binary missing or empty at ${slpBinary} after extraction — download may be truncated`);
  }

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

  // macOS: strip quarantine attributes so the binary can run
  if (process.platform === 'darwin') {
    try { require('child_process').execSync(`xattr -dr com.apple.quarantine "${versionRoot}"`, { stdio: 'pipe' }); } catch {}
  }

  // ── Step 5: Write version tracking files ─────────────────────────────────
  if (onProgress) onProgress({ status: 'installing', message: 'Configuring...' });

  fs.writeFileSync(path.join(INSTALL_DIR, 'version'), VERSION);
  const installedFile = path.join(INSTALL_DIR, 'installed');
  let installedVersions = '';
  try { installedVersions = fs.readFileSync(installedFile, 'utf-8'); } catch {}
  if (!installedVersions.split('\n').includes(VERSION)) {
    fs.appendFileSync(installedFile, VERSION + '\n');
  }

  // ── Step 6: Expose `slp` on the command line (mirrors install.sh) ─────────
  linkBinary(slpBinary);

  console.log('[SLP Setup] Install complete — binary at', slpBinary);
}

/**
 * Make the installed `slp` binary reachable from a shell, mirroring what
 * `curl https://smartloop.ai/install.sh` does:
 *   - symlink ~/.smartloop/slp        → the versioned binary (stable path)
 *   - symlink ~/.local/bin/slp        → the versioned binary (on most distros' PATH)
 *   - ensure ~/.local/bin is on PATH via the user's shell rc files
 * Windows has no symlink convention here; users add ~/.smartloop to PATH manually.
 */
function linkBinary(slpBinary) {
  if (process.platform === 'win32') return;

  try {
    // Stable, version-independent path inside the install dir
    const stableLink = path.join(INSTALL_DIR, 'slp');
    forceSymlink(slpBinary, stableLink);

    // ~/.local/bin is on PATH for most modern distros / shells
    const localBin = path.join(os.homedir(), '.local', 'bin');
    fs.mkdirSync(localBin, { recursive: true });
    forceSymlink(slpBinary, path.join(localBin, 'slp'));

    ensureLocalBinOnPath(localBin);
    console.log('[SLP Setup] Linked `slp` into', localBin);
  } catch (err) {
    // Command-line access is a convenience; never fail the install over it
    console.warn('[SLP Setup] Could not link `slp` onto PATH:', err.message);
  }
}

/**
 * Create (or replace) a symlink at linkPath pointing to target.
 */
function forceSymlink(target, linkPath) {
  try { fs.unlinkSync(linkPath); } catch {}
  fs.symlinkSync(target, linkPath);
}

/**
 * Append a PATH export for ~/.local/bin to the user's shell rc files if it
 * isn't already covered. Idempotent — guarded by a marker comment.
 */
function ensureLocalBinOnPath(localBin) {
  // Already reachable in the current environment — nothing to add.
  const currentPath = process.env.PATH || '';
  if (currentPath.split(path.delimiter).includes(localBin)) return;

  const marker = '# Added by Smartloop Studio (slp)';
  const line = `\n${marker}\nexport PATH="$HOME/.local/bin:$PATH"\n`;
  const home = os.homedir();
  const rcFiles = ['.bashrc', '.zshrc', '.profile'];

  for (const rc of rcFiles) {
    const rcPath = path.join(home, rc);
    try {
      let contents = '';
      try { contents = fs.readFileSync(rcPath, 'utf-8'); } catch {}
      if (contents.includes(marker)) continue;
      fs.appendFileSync(rcPath, line);
    } catch {
      // Skip rc files we can't write
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

  // Remove the command-line symlink (the stable ~/.smartloop/slp link goes
  // away with INSTALL_DIR below, but ~/.local/bin/slp lives outside it).
  if (process.platform !== 'win32') {
    try { fs.unlinkSync(path.join(os.homedir(), '.local', 'bin', 'slp')); } catch {}
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
    const binaryPath = path.join(INSTALL_DIR, v, binaryName);
    return fs.existsSync(binaryPath);
  });
}

/**
 * Switch the active SLP version by updating the `.installed-version` marker.
 * Returns { success, error? }.
 */
function switchVersion(version) {
  const binaryName = process.platform === 'win32' ? 'slp.exe' : 'slp';
  const binaryPath = path.join(INSTALL_DIR, version, binaryName);

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
  checkRemoteArchiveHash,
  DEFAULT_INSTALL_DIR,
  get INSTALL_DIR() { return INSTALL_DIR; },
  VERSION,
};
