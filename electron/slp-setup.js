const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const database = require('./database');

const VERSION = '1.0.1';
const BASE_URL = `https://storage.googleapis.com/smartloop-gcp-us-east-releases/${VERSION}`;
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

function getPlatformKey() {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  return { platform, arch };
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
 * Download the slp archive from GCS using curl (async, non-blocking).
 * Calls onProgress with status updates for the splash screen.
 */
async function downloadAndExtract(onProgress = null) {
  const { platform, arch } = getPlatformKey();
  const key = `${platform}-${arch}`;

  const archiveUrl = `${BASE_URL}/${platform}/${arch}/slp.tar.gz`;
  const cacheDir = path.join(INSTALL_DIR, 'cache');
  const cachedArchive = path.join(cacheDir, `slp-${VERSION}-${key}.tar.gz`);

  fs.mkdirSync(cacheDir, { recursive: true });

  // Skip download if cached archive exists
  let needsDownload = !fs.existsSync(cachedArchive);

  if (needsDownload) {
    console.log('[SLP Setup] Downloading slp', VERSION, 'from', archiveUrl);
    if (onProgress) onProgress({ status: 'downloading', message: 'Downloading framework...' });

    // Use curl async — this is the key fix to prevent "not responding"
    await runAsync('curl', ['-fSL', '-o', cachedArchive, archiveUrl], { timeout: 300000 }, (data) => {
      if (onProgress) onProgress({ status: 'downloading', message: `Downloading framework...` });
    });
  } else {
    console.log('[SLP Setup] Using cached archive');
  }

  if (onProgress) onProgress({ status: 'installing', message: 'Installing framework...' });

  // Extract to a temp dir, then move to INSTALL_DIR
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slp-'));

  try {
    console.log('[SLP Setup] Extracting...');
    await runAsync('tar', ['-xzf', cachedArchive, '-C', tmpDir]);

    // Clear old install (preserve cache and studio database)
    const preserve = new Set(['cache', 'studio.db', 'studio.db-wal', 'studio.db-shm']);
    const entries = fs.readdirSync(INSTALL_DIR);
    for (const entry of entries) {
      if (preserve.has(entry)) continue;
      const fullPath = path.join(INSTALL_DIR, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }

    // Move extracted files to INSTALL_DIR
    const extractedDir = path.join(tmpDir, 'slp');
    const srcDir = fs.existsSync(extractedDir) ? extractedDir : tmpDir;
    const files = fs.readdirSync(srcDir);

    for (const file of files) {
      const src = path.join(srcDir, file);
      const dest = path.join(INSTALL_DIR, file);
      fs.renameSync(src, dest);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Make binary executable
  const binaryPath = path.join(INSTALL_DIR, 'slp');
  if (fs.existsSync(binaryPath)) {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log('[SLP Setup] Binary installed to', INSTALL_DIR);
}


function createSymlink() {
  if (process.platform === 'win32') return;

  const binaryPath = path.join(INSTALL_DIR, 'slp');
  const localBin = path.join(os.homedir(), '.local', 'bin');

  try {
    fs.mkdirSync(localBin, { recursive: true });
    const linkPath = path.join(localBin, 'slp');
    try { fs.unlinkSync(linkPath); } catch {}
    fs.symlinkSync(binaryPath, linkPath);
    console.log('[SLP Setup] Symlink created at', linkPath);
  } catch (error) {
    console.warn('[SLP Setup] Could not create symlink:', error.message);
  }
}

function setupPath() {
  if (process.platform === 'win32') return;

  const exportLine = `export PATH="${INSTALL_DIR}:$PATH"`;
  const shellConfigs = [
    path.join(os.homedir(), '.bashrc'),
    path.join(os.homedir(), '.zshrc'),
  ];

  for (const configFile of shellConfigs) {
    try {
      if (!fs.existsSync(configFile)) continue;
      const content = fs.readFileSync(configFile, 'utf-8');
      if (content.includes(INSTALL_DIR)) continue;
      fs.appendFileSync(configFile, `\n# smartloop\n${exportLine}\n`);
      console.log('[SLP Setup] PATH added to', configFile);
    } catch (error) {
      console.warn('[SLP Setup] Could not update', configFile, ':', error.message);
    }
  }

  const fishConfig = path.join(os.homedir(), '.config', 'fish', 'config.fish');
  try {
    if (fs.existsSync(fishConfig)) {
      const content = fs.readFileSync(fishConfig, 'utf-8');
      if (!content.includes(INSTALL_DIR)) {
        fs.appendFileSync(fishConfig, `\n# smartloop\nfish_add_path ${INSTALL_DIR}\n`);
        console.log('[SLP Setup] PATH added to', fishConfig);
      }
    }
  } catch {}
}

async function installLinuxService() {
  const serviceDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const servicePath = path.join(serviceDir, 'smartloop.service');
  const logDir = path.join(os.homedir(), '.local', 'log');
  const logFile = path.join(logDir, 'smartloop.log');

  fs.mkdirSync(serviceDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const serviceContent = `[Unit]
Description=Smartloop Server
After=network.target

[Service]
Type=forking
ExecStart=${INSTALL_DIR}/slp server start
ExecStop=${INSTALL_DIR}/slp server stop
PIDFile=${INSTALL_DIR}/server.pid
Restart=on-failure
RestartSec=5
WorkingDirectory=${INSTALL_DIR}
StandardOutput=append:${logFile}
StandardError=append:${logFile}

[Install]
WantedBy=default.target
`;

  fs.writeFileSync(servicePath, serviceContent);
  console.log('[SLP Setup] systemd service written to', servicePath);

  try {
    await runAsync('systemctl', ['--user', 'daemon-reload']);
    await runAsync('systemctl', ['--user', 'enable', 'smartloop']);
    await runAsync('systemctl', ['--user', 'restart', 'smartloop']);
    console.log('[SLP Setup] systemd service enabled and started');
  } catch (error) {
    console.warn('[SLP Setup] Could not enable systemd service:', error.message);
  }

  try {
    await runAsync('loginctl', ['enable-linger', os.userInfo().username]);
  } catch {}
}

async function installMacService() {
  const agentDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const plistPath = path.join(agentDir, 'com.smartloop.server.plist');
  const logFile = path.join(os.homedir(), 'Library', 'Logs', 'smartloop.log');

  fs.mkdirSync(agentDir, { recursive: true });

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.smartloop.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>${INSTALL_DIR}/slp</string>
        <string>server</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logFile}</string>
    <key>StandardErrorPath</key>
    <string>${logFile}</string>
</dict>
</plist>
`;

  try { await runAsync('launchctl', ['unload', plistPath]).catch(() => {}); } catch {}

  fs.writeFileSync(plistPath, plistContent);
  console.log('[SLP Setup] launchd plist written to', plistPath);

  try {
    await runAsync('launchctl', ['load', '-w', plistPath]);
    console.log('[SLP Setup] launchd agent loaded');
  } catch (error) {
    console.warn('[SLP Setup] Could not load launchd agent:', error.message);
  }
}

/**
 * Run the full setup: download binary from GCS, register service, configure PATH.
 * Each of the 4 sub-steps is tracked in SQLite so a partial install (e.g. crash
 * mid-setup) is automatically resumed on the next launch rather than restarted.
 * If the installed version differs from VERSION all steps are reset and re-run.
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

  if (done[0] && done[1] && done[2] && done[3]) {
    console.log('[SLP Setup] Already installed version', VERSION);
    return false;
  }

  console.log('[SLP Setup] Installing SLP service version', VERSION,
    '— steps completed:', Object.entries(done).filter(([, v]) => v).map(([k]) => k).join(',') || 'none');

  // Step 0: Download and extract binary
  if (!done[0]) {
    await downloadAndExtract(onProgress);
    database.setInstallStepComplete(0);
    console.log('[SLP Setup] Step 0 (download_extract) complete');
  } else {
    console.log('[SLP Setup] Step 0 (download_extract) already done, skipping');
  }

  if (onProgress) onProgress({ status: 'preparing', message: 'Starting service...' });

  // Step 1: Register OS service
  if (!done[1]) {
    if (process.platform === 'linux') await installLinuxService();
    else if (process.platform === 'darwin') await installMacService();
    database.setInstallStepComplete(1);
    console.log('[SLP Setup] Step 1 (service_install) complete');
  } else {
    console.log('[SLP Setup] Step 1 (service_install) already done, skipping');
  }

  // Step 2: Create symlink
  if (!done[2]) {
    createSymlink();
    database.setInstallStepComplete(2);
    console.log('[SLP Setup] Step 2 (symlink_created) complete');
  } else {
    console.log('[SLP Setup] Step 2 (symlink_created) already done, skipping');
  }

  // Step 3: Configure PATH in shell profiles
  if (!done[3]) {
    setupPath();
    database.setInstallStepComplete(3);
    console.log('[SLP Setup] Step 3 (path_configured) complete');
  } else {
    console.log('[SLP Setup] Step 3 (path_configured) already done, skipping');
  }

  // Write version marker only once all steps are done
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.writeFileSync(MARKER_FILE, VERSION);

  console.log('[SLP Setup] Setup complete');
  return true;
}

function uninstallSlpService() {
  console.log('[SLP Setup] Uninstalling SLP service...');

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

  try { fs.unlinkSync(path.join(os.homedir(), '.local', 'bin', 'slp')); } catch {}

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
