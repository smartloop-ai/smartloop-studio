const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const database = require('./database');

const VERSION = '1.0.1';
const BASE_URL = `https://dl.smartloop.ai/${VERSION}`;
const INSTALL_DIR = path.join(os.homedir(), '.smartloop');
const VERSION_DIR = path.join(INSTALL_DIR, VERSION);
const CACHE_DIR = path.join(INSTALL_DIR, 'cache');
const MARKER_FILE = path.join(INSTALL_DIR, '.installed-version');

function getInstalledBinaryPath() {
  return path.join(VERSION_DIR, 'slp');
}

function needsInstall() {
  try {
    if (!fs.existsSync(MARKER_FILE)) return true;
    const installed = fs.readFileSync(MARKER_FILE, 'utf-8').trim();
    if (installed !== VERSION) return true;
    const installedBinary = getInstalledBinaryPath();
    if (!fs.existsSync(installedBinary)) return true;
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
 * Fetch a small text file from a URL and return its contents.
 */
function fetchText(url, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    function doRequest(currentUrl, redirectsLeft) {
      const mod = currentUrl.startsWith('https') ? https : require('http');
      mod.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          return doRequest(res.headers.location, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data.trim()));
      }).on('error', reject);
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

/**
 * Parse the checksums file into a Map of filename → sha256.
 */
function parseChecksums(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: "sha256  filename"
    const match = trimmed.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
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

  for (const dir of [INSTALL_DIR, CACHE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Step 1: Fetch checksums ───────────────────────────────────────────────
  console.log('[SLP Setup] Fetching checksums...');
  if (onProgress) onProgress({ status: 'installing', message: 'Verifying release...' });

  let checksums = new Map();
  try {
    const checksumText = await fetchText(`${BASE_URL}/checksums-sha256.txt`);
    checksums = parseChecksums(checksumText);
  } catch (err) {
    console.warn('[SLP Setup] Could not fetch checksums:', err.message);
  }

  // ── Step 2: Download archive ──────────────────────────────────────────────
  const cachedArchive = path.join(CACHE_DIR, `slp-${VERSION}-${plat}-${arch}.tar.gz`);

  if (plat === 'darwin') {
    const archiveName = `darwin-${arch}-slp.tar.gz`;
    const expectedSha = checksums.get(archiveName) || '';

    // Check cache
    if (expectedSha && fs.existsSync(cachedArchive)) {
      const localSha = await fileSha256(cachedArchive);
      if (localSha === expectedSha) {
        console.log('[SLP Setup] Using cached archive');
        if (onProgress) onProgress({ status: 'installing', message: 'Using cached download...' });
      } else {
        await doDownload(`${BASE_URL}/${archiveName}`, cachedArchive, expectedSha, onProgress);
      }
    } else {
      await doDownload(`${BASE_URL}/${archiveName}`, cachedArchive, expectedSha, onProgress);
    }
  } else if (plat === 'linux') {
    await downloadLinuxParts(arch, checksums, cachedArchive, onProgress);
  }

  // ── Step 3: Extract ───────────────────────────────────────────────────────
  console.log('[SLP Setup] Extracting...');
  if (onProgress) onProgress({ status: 'installing', message: 'Extracting...' });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slp-extract-'));
  try {
    await runAsync('tar', ['-xzf', cachedArchive, '-C', tmpDir]);

    // Copy extracted contents to version dir
    fs.mkdirSync(VERSION_DIR, { recursive: true });
    // Clear existing contents
    const existing = fs.readdirSync(VERSION_DIR);
    for (const f of existing) {
      fs.rmSync(path.join(VERSION_DIR, f), { recursive: true, force: true });
    }

    const extractedSlpDir = path.join(tmpDir, 'slp');
    if (fs.existsSync(extractedSlpDir)) {
      copyDirRecursive(extractedSlpDir, VERSION_DIR);
    } else {
      // Files may be directly in tmpDir
      copyDirRecursive(tmpDir, VERSION_DIR);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ── Step 4: Verify binary ────────────────────────────────────────────────
  console.log('[SLP Setup] Verifying installation...');
  if (onProgress) onProgress({ status: 'installing', message: 'Verifying installation...' });

  if (!fs.existsSync(slpBinary)) {
    throw new Error(`Binary not found at ${slpBinary} after extraction`);
  }

  // Make binary executable
  fs.chmodSync(slpBinary, 0o755);

  try {
    await runAsync(slpBinary, ['--version']);
  } catch (err) {
    throw new Error(`Installation verification failed: 'slp --version' did not succeed: ${err.message}`);
  }

  // ── Step 5: Set up symlinks ───────────────────────────────────────────────
  if (onProgress) onProgress({ status: 'installing', message: 'Configuring...' });

  // Symlink into base dir for PATH consistency
  const baseSlpLink = path.join(INSTALL_DIR, 'slp');
  try { fs.unlinkSync(baseSlpLink); } catch {}
  fs.symlinkSync(slpBinary, baseSlpLink);

  // Symlink into ~/.local/bin if it exists
  const localBin = path.join(os.homedir(), '.local', 'bin');
  if (fs.existsSync(localBin)) {
    const localBinLink = path.join(localBin, 'slp');
    try { fs.unlinkSync(localBinLink); } catch {}
    try { fs.symlinkSync(baseSlpLink, localBinLink); } catch {}
  }

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
      execSync(`xattr -dr com.apple.quarantine "${VERSION_DIR}"`, { stdio: 'pipe' });
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
 * Download a single file with progress and checksum verification.
 */
async function doDownload(url, destPath, expectedSha, onProgress) {
  console.log('[SLP Setup] Downloading from', url);
  if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0, message: 'Downloading Framework... ' });

  const throttled = throttleProgress(onProgress);
  await downloadFile(url, destPath, (p) => {
    throttled.fire({ status: 'downloading', ...p, message: 'Downloading Framework... ' });
  });
  throttled.dispose();

  if (expectedSha) {
    if (onProgress) onProgress({ status: 'installing', message: 'Verifying checksum...' });
    const actualSha = await fileSha256(destPath);
    if (actualSha !== expectedSha) {
      try { fs.unlinkSync(destPath); } catch {}
      throw new Error(`Checksum mismatch: expected ${expectedSha}, got ${actualSha}`);
    }
    console.log('[SLP Setup] Checksum verified');
  }
}

/**
 * Get content-length of a URL via HEAD request (follows redirects).
 */
function getContentLength(url, maxRedirects = 10) {
  return new Promise((resolve) => {
    function doHead(currentUrl, redirectsLeft) {
      const mod = currentUrl.startsWith('https') ? https : require('http');
      const req = mod.request(currentUrl, { method: 'HEAD' }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return resolve(0);
          return doHead(res.headers.location, redirectsLeft - 1);
        }
        resolve(parseInt(res.headers['content-length'], 10) || 0);
      });
      req.on('error', () => resolve(0));
      req.end();
    }
    doHead(url, maxRedirects);
  });
}

/**
 * Download Linux split parts and concatenate them.
 * Linux archives are split due to GitHub's 2GB release asset limit.
 * Shows a single combined progress bar across all parts.
 */
async function downloadLinuxParts(arch, checksums, destPath, onProgress) {
  const partPrefix = `linux-${arch}-slp.tar.gz.part-`;
  const suffixes = ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah'];

  // Discover available parts by checking which checksums exist
  const availableParts = [];
  for (const suffix of suffixes) {
    const partName = `${partPrefix}${suffix}`;
    if (checksums.has(partName)) {
      availableParts.push(suffix);
    } else {
      // Also try HEAD request as fallback
      try {
        await fetchText(`${BASE_URL}/${partName}`);
        availableParts.push(suffix);
      } catch {
        break;
      }
    }
  }

  if (availableParts.length === 0) {
    throw new Error('No download parts found for Linux');
  }

  // Get content-length of each part so we can show combined progress
  const partSizes = [];
  for (const suffix of availableParts) {
    const partName = `${partPrefix}${suffix}`;
    const size = await getContentLength(`${BASE_URL}/${partName}`);
    partSizes.push(size);
  }
  const combinedTotal = partSizes.reduce((a, b) => a + b, 0);

  const tmpPartsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slp-parts-'));
  const partFiles = [];
  let downloadedSoFar = 0;
  const throttled = throttleProgress(onProgress);

  try {
    for (let i = 0; i < availableParts.length; i++) {
      const suffix = availableParts[i];
      const partName = `${partPrefix}${suffix}`;
      const partFile = path.join(tmpPartsDir, partName);
      const expectedSha = checksums.get(partName) || '';
      const baseOffset = downloadedSoFar;

      console.log(`[SLP Setup] Downloading part ${i + 1}/${availableParts.length}`);

      await downloadFile(`${BASE_URL}/${partName}`, partFile, (p) => {
        throttled.fire({
          status: 'downloading',
          downloaded: baseOffset + p.downloaded,
          total: combinedTotal,
          message: 'Downloading Framework...',
        });
      });

      // Update cumulative offset with actual file size
      try {
        downloadedSoFar += fs.statSync(partFile).size;
      } catch {
        downloadedSoFar += partSizes[i];
      }

      if (expectedSha) {
        const actualSha = await fileSha256(partFile);
        if (actualSha !== expectedSha) {
          throw new Error(`Checksum mismatch for ${partName}`);
        }
      }

      partFiles.push(partFile);
    }

    // Flush any remaining throttled progress update
    throttled.dispose();

    // Concatenate parts
    if (onProgress) onProgress({ status: 'installing', message: 'Processing download...' });
    const writeStream = fs.createWriteStream(destPath);
    for (const partFile of partFiles) {
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(partFile);
        readStream.pipe(writeStream, { end: false });
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });
    }
    writeStream.end();
    await new Promise((resolve) => writeStream.on('finish', resolve));
  } finally {
    fs.rmSync(tmpPartsDir, { recursive: true, force: true });
  }
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

  // Remove symlinks
  try { fs.unlinkSync(path.join(os.homedir(), '.local', 'bin', 'slp')); } catch {}
  try { fs.unlinkSync(path.join(INSTALL_DIR, 'slp')); } catch {}

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
  getInstalledBinaryPath,
  INSTALL_DIR,
  VERSION,
};
