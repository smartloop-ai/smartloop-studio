const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const database = require('./database');

const VERSION = '1.0.1';
const INSTALL_DIR = path.join(os.homedir(), '.smartloop');
const MARKER_FILE = path.join(INSTALL_DIR, '.installed-version');

// ── GCS bucket for pre-built artifacts ──────────────────────────────────────
const GCS_BUCKET = 'https://dl.smartloop.ai';

// ── python-build-standalone + wheels installed into a local venv ─────────────
const PYTHON_VERSION = '3.11.15';
const PYTHON_RELEASE = '20260320';

/**
 * Return the path to the bundled Python tarball shipped inside the app's
 * resources directory (set up by electron-builder extraResources).
 * Returns null when running in dev mode or if the file is missing.
 */
function getBundledPythonTar() {
  try {
    const resourcesPath = process.resourcesPath; // set by Electron at runtime
    if (!resourcesPath) return null;
    const tarPath = path.join(resourcesPath, 'python.tar.gz');
    return fs.existsSync(tarPath) ? tarPath : null;
  } catch {
    return null;
  }
}

function getInstalledBinaryPath() {
  return path.join(INSTALL_DIR, 'venv', 'bin', 'slp-server');
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
 * Download a file from `url` to `destPath`, reporting progress via onProgress.
 * Follows up to 5 redirects (needed for GitHub releases).
 */
function downloadFile(url, destPath, onProgress, maxRedirects = 5) {
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
          if (onProgress) onProgress({ status: 'downloading', downloaded, total });
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
 * Fetch a small text file (e.g. .sha256) from a URL and return its contents.
 */
function fetchText(url, maxRedirects = 5) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Install: download Python + wheels, create venv, pip install
// Same flow on macOS and Linux.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the python-build-standalone download URL for the current platform/arch.
 */
function getPythonUrl() {
  const arch = os.arch() === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'darwin') {
    const filename = `cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-${arch}-apple-darwin-install_only.tar.gz`;
    return `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${filename}`;
  }
  const filename = `cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-${arch}-unknown-linux-gnu-install_only.tar.gz`;
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${filename}`;
}

/**
 * GCS URL for the pre-built wheels tarball.
 * Expected layout inside the tar: wheels/*.whl
 */
function getWheelsUrl() {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  return `${GCS_BUCKET}/dist/${platform}/${VERSION}/wheels.tar.gz`;
}

async function installService(onProgress) {
  const pythonDir = path.join(INSTALL_DIR, 'python');
  const wheelsDir = path.join(INSTALL_DIR, 'wheels');
  const venvDir = path.join(INSTALL_DIR, 'venv');
  const binDir = path.join(INSTALL_DIR, 'bin');

  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  // Clean previous install artifacts
  for (const dir of [pythonDir, wheelsDir, venvDir, binDir]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Remove legacy artifacts from older install methods (pex, PyInstaller)
  for (const legacy of ['_internal', 'slp']) {
    const legacyPath = path.join(INSTALL_DIR, legacy);
    if (fs.existsSync(legacyPath)) {
      console.log('[SLP Setup] Removing legacy artifact:', legacy);
      fs.rmSync(legacyPath, { recursive: true, force: true });
    }
  }

  // ── Step 1: Obtain Python ─────────────────────────────────────────────────
  // Prefer the pre-signed tarball bundled in the app resources (macOS/Linux).
  // Falls back to downloading from GitHub when running in dev mode or if the
  // bundled tarball is missing.
  const bundledTar = getBundledPythonTar();

  if (bundledTar) {
    console.log('[SLP Setup] Using bundled Python from', bundledTar);
    if (onProgress) onProgress({ status: 'installing', message: 'Extracting Python runtime...' });
    await runAsync('tar', ['-xzf', bundledTar, '-C', INSTALL_DIR]);
  } else {
    console.log('[SLP Setup] Bundled Python not found — downloading from GitHub');
    const pythonUrl = getPythonUrl();
    const pythonTar = path.join(os.tmpdir(), `slp-python-${PYTHON_VERSION}.tar.gz`);

    console.log('[SLP Setup] Downloading Python from', pythonUrl);
    if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0, message: 'Downloading Python runtime...' });
    await downloadFile(pythonUrl, pythonTar, (p) => {
      if (onProgress) onProgress({ ...p, message: 'Downloading Python runtime...' });
    });

    console.log('[SLP Setup] Extracting Python...');
    if (onProgress) onProgress({ status: 'installing', message: 'Extracting Python runtime...' });
    await runAsync('tar', ['-xzf', pythonTar, '-C', INSTALL_DIR]);
    try { fs.unlinkSync(pythonTar); } catch {}
  }

  const bundledPython = path.join(pythonDir, 'bin', 'python3');
  if (!fs.existsSync(bundledPython)) {
    throw new Error(`Bundled Python not found at ${bundledPython}`);
  }

  // ── Step 2: Download wheels (skip if SHA matches) ─────────────────────────
  const wheelsUrl = getWheelsUrl();
  const wheelsTar = path.join(os.tmpdir(), `slp-wheels-${VERSION}.tar.gz`);
  const localShaFile = path.join(INSTALL_DIR, '.wheels-sha256');

  let skipWheels = false;
  try {
    const remoteSha = await fetchText(`${wheelsUrl}.sha256`);
    // The .sha256 file may contain "hash  filename" or just the hash
    const remoteShaHash = remoteSha.split(/\s+/)[0];
    if (fs.existsSync(localShaFile)) {
      const localSha = fs.readFileSync(localShaFile, 'utf8').trim();
      if (localSha === remoteShaHash && fs.existsSync(wheelsDir)) {
        console.log('[SLP Setup] Wheels SHA matches — skipping download');
        skipWheels = true;
      }
    }
  } catch (err) {
    console.log('[SLP Setup] Could not fetch remote SHA, will download wheels:', err.message);
  }

  if (!skipWheels) {
    console.log('[SLP Setup] Downloading wheels from', wheelsUrl);
    if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0, message: 'Downloading framework...' });
    await downloadFile(wheelsUrl, wheelsTar, (p) => {
      if (onProgress) onProgress({ ...p, message: 'Downloading framework...' });
    });

    // Verify downloaded file SHA if we have the remote hash
    let downloadedSha;
    try {
      downloadedSha = await fileSha256(wheelsTar);
      const remoteSha = await fetchText(`${wheelsUrl}.sha256`);
      const remoteShaHash = remoteSha.split(/\s+/)[0];
      if (downloadedSha !== remoteShaHash) {
        console.warn('[SLP Setup] SHA mismatch! Expected:', remoteShaHash, 'Got:', downloadedSha);
      }
    } catch {}

    // Extract wheels
    console.log('[SLP Setup] Extracting wheels...');
    if (onProgress) onProgress({ status: 'installing', message: 'Extracting framework...' });
    if (fs.existsSync(wheelsDir)) {
      fs.rmSync(wheelsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(wheelsDir, { recursive: true });
    await runAsync('tar', ['-xzf', wheelsTar, '-C', INSTALL_DIR]);
    try { fs.unlinkSync(wheelsTar); } catch {}

    // Save the SHA for future comparisons
    if (downloadedSha) {
      fs.writeFileSync(localShaFile, downloadedSha, 'utf8');
    }
  }

  // ── Step 3: Create venv ───────────────────────────────────────────────────
  console.log('[SLP Setup] Creating virtual environment...');
  if (onProgress) onProgress({ status: 'installing', message: 'Creating virtual environment...' });
  await runAsync(bundledPython, ['-m', 'venv', venvDir]);

  // ── Step 4: pip install from bundled wheels ───────────────────────────────
  const pip = path.join(venvDir, 'bin', 'pip');
  console.log('[SLP Setup] Installing packages from wheels...');
  if (onProgress) onProgress({ status: 'installing', message: 'Installing packages...' });

  // Upgrade pip first
  try {
    await runAsync(pip, ['install', '--quiet', '--upgrade', 'pip',
      '--index-url', 'https://pypi.org/simple/',
      '--find-links', wheelsDir]);
  } catch {
    console.log('[SLP Setup] pip upgrade skipped');
  }

  // Install all wheels
  const extraIndexArgs = process.platform === 'darwin'
    ? ['--extra-index-url', 'https://abetlen.github.io/llama-cpp-python/whl/metal']
    : [];
  const wheelFiles = fs.readdirSync(wheelsDir).filter(f => f.endsWith('.whl')).map(f => path.join(wheelsDir, f));
  await runAsync(pip, [
    'install',
    '--index-url', 'https://pypi.org/simple/',
    ...extraIndexArgs,
    '--find-links', wheelsDir,
    ...wheelFiles,
  ]);

  // ── Step 5: Symlink binary ────────────────────────────────────────────────
  fs.mkdirSync(binDir, { recursive: true });
  const venvBinary = path.join(venvDir, 'bin', 'slp-server');
  const binLink = path.join(binDir, 'slp-server');
  try { fs.unlinkSync(binLink); } catch {}
  fs.symlinkSync(venvBinary, binLink);

  // macOS: ad-hoc codesign the venv binaries and shared libraries so
  // Gatekeeper allows execution under hardened runtime.  The bundled Python
  // tarball is already signed at build time, but creating a venv copies /
  // symlinks binaries that need their own signatures.
  if (process.platform === 'darwin') {
    console.log('[SLP Setup] Ad-hoc codesigning venv binaries...');
    try {
      // Sign .so / .dylib first (leaves loaded by the interpreter)
      execSync(
        `find "${venvDir}" -type f \\( -name "*.so" -o -name "*.dylib" \\) -exec codesign --force --sign - {} +`,
        { stdio: 'pipe' }
      );
      // Sign executable binaries in bin/
      execSync(
        `find "${venvDir}/bin" -type f -perm +111 -exec codesign --force --sign - {} +`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      console.warn('[SLP Setup] Ad-hoc codesign warning:', e.message);
    }

    // Also strip quarantine from any files downloaded at runtime (wheels fallback)
    try {
      execSync(`xattr -dr com.apple.quarantine "${INSTALL_DIR}"`, { stdio: 'pipe' });
    } catch {}
  }

  console.log('[SLP Setup] Install complete — binary at', venvBinary);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full setup: download and install SLP to ~/.smartloop/.
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
  getInstalledBinaryPath,
  INSTALL_DIR,
  VERSION,
};
