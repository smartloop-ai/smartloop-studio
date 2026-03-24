const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const database = require('./database');

const crypto = require('crypto');

const VERSION = '1.0.1';
const INSTALL_DIR = path.join(os.homedir(), '.smartloop');
const MARKER_FILE = path.join(INSTALL_DIR, '.installed-version');

// ── GCS bucket for pre-built artifacts ──────────────────────────────────────
const GCS_BUCKET = 'https://storage.googleapis.com/smartloop-gcp-us-east-releases';

// ── Linux: single pex binary ────────────────────────────────────────────────
const LINUX_PEX_SHA256 = '106a2d569d816a9fb516276748c158b3298d44fb3f613f2e56d580ca69453017';

// ── macOS: python-build-standalone + wheels installed into a local venv ──────
const PYTHON_VERSION = '3.11.15';
const PYTHON_RELEASE = '20260320';

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getInstalledBinaryPath() {
  if (process.platform === 'darwin') {
    return path.join(INSTALL_DIR, 'venv', 'bin', 'slp-server');
  }
  return path.join(INSTALL_DIR, 'slp');
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

// ─────────────────────────────────────────────────────────────────────────────
// macOS install: download Python + wheels, create venv, pip install
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the python-build-standalone download URL for the current arch.
 */
function getPythonUrl() {
  const arch = os.arch() === 'arm64' ? 'aarch64' : 'x86_64';
  const filename = `cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-${arch}-apple-darwin-install_only.tar.gz`;
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${filename}`;
}

/**
 * GCS URL for the pre-built wheels tarball.
 * Expected layout inside the tar: wheels/*.whl
 */
function getWheelsUrl() {
  return `${GCS_BUCKET}/dist/darwin/${VERSION}/wheels.tar.gz`;
}

async function installDarwin(onProgress) {
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

  // ── Step 1: Download Python ───────────────────────────────────────────────
  const pythonUrl = getPythonUrl();
  const pythonTar = path.join(os.tmpdir(), `slp-python-${PYTHON_VERSION}.tar.gz`);

  console.log('[SLP Setup] Downloading Python from', pythonUrl);
  if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0, message: 'Downloading Python runtime...' });
  await downloadFile(pythonUrl, pythonTar, (p) => {
    if (onProgress) onProgress({ ...p, message: 'Downloading Python runtime...' });
  });

  // Extract — python-build-standalone extracts to a "python" directory
  console.log('[SLP Setup] Extracting Python...');
  if (onProgress) onProgress({ status: 'installing', message: 'Extracting Python runtime...' });
  await runAsync('tar', ['-xzf', pythonTar, '-C', INSTALL_DIR]);
  try { fs.unlinkSync(pythonTar); } catch {}

  const bundledPython = path.join(pythonDir, 'bin', 'python3');
  if (!fs.existsSync(bundledPython)) {
    throw new Error(`Bundled Python not found at ${bundledPython}`);
  }

  // ── Step 2: Download wheels ───────────────────────────────────────────────
  const wheelsUrl = getWheelsUrl();
  const wheelsTar = path.join(os.tmpdir(), `slp-wheels-${VERSION}.tar.gz`);

  console.log('[SLP Setup] Downloading wheels from', wheelsUrl);
  if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0, message: 'Downloading framework...' });
  await downloadFile(wheelsUrl, wheelsTar, (p) => {
    if (onProgress) onProgress({ ...p, message: 'Downloading framework...' });
  });

  // Extract wheels
  console.log('[SLP Setup] Extracting wheels...');
  if (onProgress) onProgress({ status: 'installing', message: 'Extracting framework...' });
  fs.mkdirSync(wheelsDir, { recursive: true });
  await runAsync('tar', ['-xzf', wheelsTar, '-C', INSTALL_DIR]);
  try { fs.unlinkSync(wheelsTar); } catch {}

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

  // Install all wheels (use pypi + extra metal index as fallback for missing/corrupt local wheels)
  const wheelFiles = fs.readdirSync(wheelsDir).filter(f => f.endsWith('.whl')).map(f => path.join(wheelsDir, f));
  await runAsync(pip, [
    'install',
    '--index-url', 'https://pypi.org/simple/',
    '--extra-index-url', 'https://abetlen.github.io/llama-cpp-python/whl/metal',
    '--find-links', wheelsDir,
    ...wheelFiles,
  ]);

  // ── Step 5: Symlink binary ────────────────────────────────────────────────
  fs.mkdirSync(binDir, { recursive: true });
  const venvBinary = path.join(venvDir, 'bin', 'slp-server');
  const binLink = path.join(binDir, 'slp-server');
  try { fs.unlinkSync(binLink); } catch {}
  fs.symlinkSync(venvBinary, binLink);

  // Remove quarantine xattr
  try {
    require('child_process').execSync(`xattr -dr com.apple.quarantine "${INSTALL_DIR}"`, { stdio: 'pipe' });
  } catch {}

  console.log('[SLP Setup] macOS install complete — binary at', venvBinary);
}

// ─────────────────────────────────────────────────────────────────────────────
// Linux install: download pex binary
// ─────────────────────────────────────────────────────────────────────────────

async function installLinux(onProgress) {
  const destBinary = path.join(INSTALL_DIR, 'slp');

  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  // Remove legacy PyInstaller _internal directory if present
  const legacyInternal = path.join(INSTALL_DIR, '_internal');
  if (fs.existsSync(legacyInternal)) {
    console.log('[SLP Setup] Removing legacy _internal directory');
    fs.rmSync(legacyInternal, { recursive: true, force: true });
  }

  const url = `${GCS_BUCKET}/pex/linux/${VERSION}/slp-server`;
  console.log('[SLP Setup] Downloading SLP binary from', url);
  if (onProgress) onProgress({ status: 'downloading', downloaded: 0, total: 0 });
  await downloadFile(url, destBinary, onProgress);

  // Verify SHA-256 hash
  console.log('[SLP Setup] Verifying hash...');
  const actualHash = sha256File(destBinary);
  if (actualHash !== LINUX_PEX_SHA256) {
    fs.unlinkSync(destBinary);
    throw new Error(`Hash mismatch! Expected ${LINUX_PEX_SHA256}, got ${actualHash}`);
  }

  fs.chmodSync(destBinary, 0o755);
  console.log('[SLP Setup] Binary downloaded and verified at', destBinary);
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
    if (process.platform === 'darwin') {
      await installDarwin(onProgress);
    } else {
      await installLinux(onProgress);
    }
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
