const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

const VERSION = '1.0.1';
const BASE_URL = `https://storage.googleapis.com/smartloop-gcp-us-east-releases/${VERSION}`;
const INSTALL_DIR = path.join(os.homedir(), '.smartloop');
const MARKER_FILE = path.join(INSTALL_DIR, '.installed-version');

const CHECKSUMS = {
  'darwin-arm64': '5b9bd06168d2679bb6a59c72b9864b82f11c618f425591582f7091374b392708',
  'linux-amd64': '8b3e11076a36e746115a9477d3f908aa92cd877c50be9a2b36525a3a22ebe5d6',
};

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

function verifyChecksum(filePath, expected) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(64 * 1024);
  let bytesRead;
  while ((bytesRead = fs.readSync(fd, buf, 0, buf.length)) > 0) {
    hash.update(buf.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  const actual = hash.digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

/**
 * Download the slp archive from GCS and extract to ~/.smartloop/
 */
function downloadAndInstall() {
  const { platform, arch } = getPlatformKey();
  const key = `${platform}-${arch}`;
  const expectedHash = CHECKSUMS[key];

  if (!expectedHash) {
    throw new Error(`Unsupported platform: ${key}`);
  }

  const archiveUrl = `${BASE_URL}/${platform}/${arch}/slp.tar.gz`;
  const cacheDir = path.join(INSTALL_DIR, 'cache');
  const cachedArchive = path.join(cacheDir, `slp-${VERSION}-${key}.tar.gz`);

  fs.mkdirSync(cacheDir, { recursive: true });

  // Skip download if cached archive matches checksum
  let needsDownload = true;
  if (fs.existsSync(cachedArchive)) {
    try {
      verifyChecksum(cachedArchive, expectedHash);
      console.log('[SLP Setup] Using cached archive');
      needsDownload = false;
    } catch {
      console.log('[SLP Setup] Cached archive checksum mismatch, re-downloading');
    }
  }

  if (needsDownload) {
    console.log('[SLP Setup] Downloading slp', VERSION, 'from', archiveUrl);
    execSync(`curl -fSL -o "${cachedArchive}" "${archiveUrl}"`, {
      stdio: 'inherit',
      timeout: 300000,
    });

    verifyChecksum(cachedArchive, expectedHash);
    console.log('[SLP Setup] Checksum verified');
  }

  // Extract to a temp dir, then move to INSTALL_DIR
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slp-'));

  try {
    console.log('[SLP Setup] Extracting...');
    execSync(`tar -xzf "${cachedArchive}" -C "${tmpDir}"`, { stdio: 'pipe' });

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

  // Verify installation by running slp --help
  try {
    console.log('[SLP Setup] Verifying installation...');
    execFileSync(path.join(INSTALL_DIR, 'slp'), ['--help'], {
      timeout: 120000,
      stdio: 'pipe',
    });
    console.log('[SLP Setup] Binary verified successfully');
  } catch (error) {
    console.warn('[SLP Setup] Binary verification warning:', error.message);
  }
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

function installLinuxService() {
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
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    execSync('systemctl --user enable smartloop', { stdio: 'pipe' });
    execSync('systemctl --user restart smartloop', { stdio: 'pipe' });
    console.log('[SLP Setup] systemd service enabled and started');
  } catch (error) {
    console.warn('[SLP Setup] Could not enable systemd service:', error.message);
  }

  try {
    execSync(`loginctl enable-linger ${os.userInfo().username}`, { stdio: 'pipe' });
  } catch {}
}

function installMacService() {
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

  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' }); } catch {}

  fs.writeFileSync(plistPath, plistContent);
  console.log('[SLP Setup] launchd plist written to', plistPath);

  try {
    execSync(`launchctl load -w "${plistPath}"`, { stdio: 'pipe' });
    console.log('[SLP Setup] launchd agent loaded');
  } catch (error) {
    console.warn('[SLP Setup] Could not load launchd agent:', error.message);
  }
}

/**
 * Run the full setup: download binary from GCS, register service, configure PATH.
 * Returns true if setup was performed, false if already up-to-date.
 */
function setupSlpService() {
  if (!needsInstall()) {
    console.log('[SLP Setup] Already installed version', VERSION);
    return false;
  }

  console.log('[SLP Setup] Installing SLP service version', VERSION);

  // 1. Download and extract binary
  downloadAndInstall();

  // 2. Register platform service
  if (process.platform === 'linux') {
    installLinuxService();
  } else if (process.platform === 'darwin') {
    installMacService();
  }

  // 3. Create CLI symlink
  createSymlink();

  // 4. Add to PATH
  setupPath();

  // 5. Write version marker
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.writeFileSync(MARKER_FILE, VERSION);

  console.log('[SLP Setup] Setup complete');
  return true;
}

function uninstallSlpService() {
  console.log('[SLP Setup] Uninstalling SLP service...');

  if (process.platform === 'linux') {
    try {
      execSync('systemctl --user stop smartloop.service', { stdio: 'pipe' });
      execSync('systemctl --user disable smartloop.service', { stdio: 'pipe' });
      const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'smartloop.service');
      try { fs.unlinkSync(servicePath); } catch {}
      execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    } catch {}
  } else if (process.platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.smartloop.server.plist');
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
      fs.unlinkSync(plistPath);
    } catch {}
  }

  try { fs.unlinkSync(path.join(os.homedir(), '.local', 'bin', 'slp')); } catch {}

  if (fs.existsSync(INSTALL_DIR)) {
    fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
  }

  console.log('[SLP Setup] Uninstall complete');
}

module.exports = {
  setupSlpService,
  uninstallSlpService,
  INSTALL_DIR,
  VERSION,
};
