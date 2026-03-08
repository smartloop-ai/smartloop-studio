const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const Store = require('electron-store').default || require('electron-store');
const { machineId, machineIdSync } = require('node-machine-id');
const { setupSlpService, uninstallSlpService, INSTALL_DIR, VERSION: SLP_VERSION } = require('./slp-setup');
const database = require('./database');

// Load environment variables from .env files (development only)
if (process.env.NODE_ENV === 'development') {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (error) {
    console.log('dotenv not available, skipping .env file loading');
  }
}

let mainWindow;
let splashWindow;
let tokenRefreshInterval = null;
let localServicePort = null;

// Token refresh configuration
const TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes (before 15-min expiry)

const isDev = process.env.NODE_ENV === 'development';
const port = process.env.PORT || 5000;
const APP_URL = process.env.VITE_APP_URL || 'https://app.smartloop.ai';
const BASE_URL = process.env.VITE_BASE_URL || 'https://api.smartloop.ai';

// Machine ID IPC handler
ipcMain.handle('get-machine-id', async () => {
  try {
    const id = await machineId();
    return id;
  } catch (error) {
    console.error('[MachineID] Error getting machine ID:', error);
    return null;
  }
});

// Open external URL in system browser
ipcMain.handle('open-external', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// Initialize electron-store
const store = new Store({ name: 'smartloop-studio', encryptionKey: machineIdSync() });

// Storage IPC handlers
ipcMain.handle('storage-get', (event, key) => {
  return store.get(key, null);
});

ipcMain.handle('storage-set', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('storage-remove', (event, key) => {
  store.delete(key);
});

ipcMain.handle('storage-clear', () => {
  store.clear();
});

ipcMain.handle('storage-has', (event, key) => {
  return store.has(key);
});

ipcMain.handle('storage-get-all', () => {
  return store.store;
});

// IPC: save a file buffer to a temp directory so the local SLP service can read it by path
ipcMain.handle('save-temp-file', async (event, fileName, buffer) => {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

// --- SQLite database IPC handlers ---

// Projects
ipcMain.handle('db-upsert-project', (event, project) => database.upsertProject(project));
ipcMain.handle('db-get-project', (event, id) => database.getProject(id));
ipcMain.handle('db-get-all-projects', () => database.getAllProjects());
ipcMain.handle('db-update-project', (event, id, updates) => database.updateProject(id, updates));
ipcMain.handle('db-delete-project', (event, id) => database.deleteProject(id));

// Conversations
ipcMain.handle('db-create-conversation', (event, conv) => database.createConversation(conv));
ipcMain.handle('db-get-conversation', (event, id) => database.getConversation(id));
ipcMain.handle('db-get-conversations', (event, projectId) => database.getConversations(projectId));
ipcMain.handle('db-update-conversation', (event, id, updates) => database.updateConversation(id, updates));
ipcMain.handle('db-delete-conversation', (event, id) => database.deleteConversation(id));

// Messages
ipcMain.handle('db-add-message', (event, msg) => database.addMessage(msg));
ipcMain.handle('db-add-messages', (event, conversationId, msgs) => database.addMessages(conversationId, msgs));
ipcMain.handle('db-get-messages', (event, conversationId) => database.getMessages(conversationId));
ipcMain.handle('db-delete-messages', (event, conversationId) => database.deleteMessages(conversationId));

// --- Local SLP service helpers ---

function getSlpDir() {
  return path.join(os.homedir(), '.smartloop');
}

/**
 * Returns the path to the installed slp binary at ~/.smartloop/slp.
 * Downloaded and installed by slp-setup.js on first launch.
 */
function getSlpBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'slp.exe' : 'slp';
  return path.join(INSTALL_DIR, binaryName);
}

let slpProcess = null;

/**
 * Ensure the ~/.smartloop directory exists.
 * The bootstrap API endpoint handles workspace and config creation.
 */
function ensureSlpDir() {
  const slpDir = getSlpDir();
  fs.mkdirSync(slpDir, { recursive: true });
}

/**
 * Start the SLP server as a background process.
 */
async function startSlpService() {
  const slpBinary = getSlpBinaryPath();

  if (!fs.existsSync(slpBinary)) {
    console.error('[SLP] Binary not found at:', slpBinary);
    return false;
  }

  // Ensure the directory exists
  ensureSlpDir();

  // Check if already running by reading server.port
  const existingPort = readLocalServicePort();
  if (existingPort) {
    try {
      const res = await fetch(`http://localhost:${existingPort}/health`);
      if (res.ok) {
        console.log('[SLP] Service already running on port', existingPort);
        localServicePort = existingPort;
        return true;
      }
    } catch {
      // Not responding, stale port file — remove it so we can detect new port
      console.log('[SLP] Stale port file, removing and starting fresh...');
      try {
        fs.unlinkSync(path.join(getSlpDir(), 'server.port'));
      } catch {}
    }
  }

  console.log('[SLP] Starting service from:', slpBinary);

  // Start directly — more reliable than systemd/launchd for interactive startup
  slpProcess = execFile(slpBinary, ['server', 'start'], {
    env: { ...process.env },
    detached: false,
  }, (error, stdout, stderr) => {
    if (error) {
      console.error('[SLP] Server start error:', error.message);
      if (stderr) console.error('[SLP] stderr:', stderr);
    }
    if (stdout) console.log('[SLP] stdout:\n', stdout);
  });

  slpProcess.on('error', (err) => {
    console.error('[SLP] Process error:', err.message);
  });

  return new Promise((resolve) => {

    // Poll for server.port file to appear (up to 120 seconds)
    // The PyInstaller binary takes a while to unpack and load PyTorch
    let attempts = 0;
    const maxAttempts = 120;
    const pollInterval = setInterval(async () => {
      attempts++;
      const port = readLocalServicePort();
      if (port) {
        // Verify the server is actually responding
        try {
          const res = await fetch(`http://localhost:${port}/health`);
          if (res.ok) {
            clearInterval(pollInterval);
            localServicePort = port;
            console.log('[SLP] Service started on port', port);
            resolve(true);
            return;
          }
        } catch {
          // Port file exists but server not ready yet
        }
      }
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.error('[SLP] Timed out waiting for service to start');
        resolve(false);
      }
    }, 1000);
  });
}

/**
 * Stop the SLP server.
 */
function stopSlpService() {
  const slpBinary = getSlpBinaryPath();

  if (!fs.existsSync(slpBinary)) {
    console.warn('[SLP] Binary not found, cannot stop service');
    return;
  }

  try {
    console.log('[SLP] Stopping service...');
    execFileSync(slpBinary, ['server', 'stop'], {
      env: { ...process.env },
      timeout: 10000,
    });
    console.log('[SLP] Service stopped');
  } catch (error) {
    console.warn('[SLP] Error stopping service:', error.message);
  }

  slpProcess = null;
  localServicePort = null;
}

function readLocalServicePort() {
  try {
    const portFile = path.join(getSlpDir(), 'server.port');
    const portStr = fs.readFileSync(portFile, 'utf-8').trim();
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 0) {
      console.log('[SLP] Local service port:', port);
      return port;
    }
  } catch (error) {
    // Silently ignore — port file may not exist yet
  }
  return null;
}

function getLocalBaseUrl() {
  return localServicePort ? `http://localhost:${localServicePort}` : null;
}

// IPC: get local API URL
ipcMain.handle('get-local-api-url', async () => {
  if (!localServicePort) {
    localServicePort = readLocalServicePort();
  }
  return getLocalBaseUrl();
});

// IPC: get SLP config
ipcMain.handle('get-slp-config', async () => {
  try {
    const configPath = path.join(getSlpDir(), 'config.json');
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('[SLP] Could not read config.json:', error.message);
    return null;
  }
});

// IPC: start/stop SLP service from renderer
ipcMain.handle('slp-service-start', async () => {
  const result = await startSlpService();
  return { success: result, port: localServicePort };
});

ipcMain.handle('slp-service-stop', async () => {
  stopSlpService();
  return { success: true };
});

ipcMain.handle('slp-service-uninstall', async () => {
  stopSlpService();
  uninstallSlpService();
  return { success: true };
});

ipcMain.handle('slp-service-status', async () => {
  const baseUrl = getLocalBaseUrl();
  if (!baseUrl) return { running: false };
  try {
    const res = await fetch(`${baseUrl}/health`);
    const health = await res.json();
    return { running: true, port: localServicePort, health };
  } catch {
    return { running: false };
  }
});

// Bootstrap the SLP service via SSE endpoint
// Handles workspace creation, model download, project creation, and model loading
async function bootstrapSlpService(baseUrl) {
  return new Promise((resolve) => {
    console.log('[SLP] Running bootstrap...');
    const http = require('http');
    const url = new URL(`${baseUrl}/v1/bootstrap`);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      if (res.statusCode !== 200) {
        console.error('[SLP] Bootstrap request failed:', res.statusCode);
        resolve(false);
        return;
      }

      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.total > 0) {
                const pct = Math.round((data.downloaded / data.total) * 100);
                if (pct % 10 === 0) console.log(`[SLP] Bootstrap: downloading ${pct}%`);
              } else {
                console.log('[SLP] Bootstrap:', data.status, '-', data.message || '');
              }
              updateSplashProgress(data);
            } catch {
              // ignore unparseable SSE data
            }
          }
        }
      });

      res.on('end', () => {
        console.log('[SLP] Bootstrap completed');
        resolve(true);
      });

      res.on('error', (err) => {
        console.error('[SLP] Bootstrap stream error:', err.message);
        resolve(false);
      });
    });

    req.on('error', (err) => {
      console.error('[SLP] Bootstrap request error:', err.message);
      resolve(false);
    });

    req.end();
  });
}

/**
 * Update the splash screen with bootstrap/download progress.
 */
function updateSplashProgress(data) {
  if (!splashWindow || splashWindow.isDestroyed()) return;

  if (data.status === 'downloading' && data.total > 0) {
    // Show download progress bar
    const pct = Math.round((data.downloaded / data.total) * 100);
    const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(1);
    const totalMB = (data.total / (1024 * 1024)).toFixed(1);
    splashWindow.webContents.executeJavaScript(`
      (function() {
        var pb = document.getElementById('progress-bar');
        var lt = document.querySelector('.loading-text');
        if (!pb) {
          var container = document.querySelector('.splash-container');
          var wrapper = document.createElement('div');
          wrapper.className = 'progress-wrapper';
          wrapper.innerHTML = '<div class="progress-track"><div id="progress-bar" class="progress-fill" style="width:0%"></div></div>';
          container.insertBefore(wrapper, lt);
          pb = document.getElementById('progress-bar');
        }
        pb.style.width = '${pct}%';
        lt.textContent = 'Downloading model... ${downloadedMB} / ${totalMB} MB (${pct}%)';
      })();
    `).catch(() => {});
  } else {
    // Text-only status update
    const msg = data.message || data.status;
    splashWindow.webContents.executeJavaScript(`
      (function() {
        var pb = document.getElementById('progress-bar');
        if (pb) pb.parentElement.parentElement.remove();
        document.querySelector('.loading-text').textContent = ${JSON.stringify(msg)};
      })();
    `).catch(() => {});
  }
}

// Load model via API (used for subsequent loads after bootstrap)
async function loadModel(baseUrl) {
  try {
    console.log('[SLP] Loading model...');
    const res = await fetch(`${baseUrl}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inference' })
    });
    if (res.ok) {
      console.log('[SLP] Model loaded successfully');
      return true;
    }
    console.error('[SLP] Model load failed:', res.status);
    return false;
  } catch (error) {
    console.error('[SLP] Error loading model:', error.message);
    return false;
  }
}

// Unload model via API
async function unloadModel() {
  const baseUrl = getLocalBaseUrl();
  if (!baseUrl) return;

  try {
    console.log('[SLP] Unloading model...');
    await fetch(`${baseUrl}/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('[SLP] Model unloaded');
  } catch (error) {
    console.warn('[SLP] Error unloading model:', error.message);
  }
}

// IPC: load model (called from renderer)
ipcMain.handle('load-model', async () => {
  const baseUrl = getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  const result = await loadModel(baseUrl);
  return { success: result };
});

// IPC: unload model (called from renderer)
ipcMain.handle('unload-model', async () => {
  await unloadModel();
  return { success: true };
});

// Register custom protocol for OAuth callback
const PROTOCOL = 'smartloop';

function createSplashScreen() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Create splash screen HTML content
  const splashHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          .splash-container {
            text-align: center;
            background: #000000;
            border-radius: 5px;
            padding: 60px 40px;
            border: 1px solid #2a2a2a;
          }
          .logo {
            font-size: 48px;
            font-weight: bold;
            margin-bottom: 20px;
          }
          .logo-text {
            color: white;
          }
          .logo-dot {
            color: #ec4899;
          }
          .spinner {
            width: 40px;
            height: 40px;
            margin: 20px auto;
            border: 4px solid #2a2a2a;
            border-top: 4px solid #ec4899;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .loading-text {
            color: #9ca3af;
            font-size: 14px;
            margin-top: 10px;
          }
          .progress-wrapper {
            margin-top: 16px;
            width: 100%;
          }
          .progress-track {
            width: 100%;
            height: 6px;
            background: #2a2a2a;
            border-radius: 3px;
            overflow: hidden;
          }
          .progress-fill {
            height: 100%;
            background: #ec4899;
            border-radius: 3px;
            transition: width 0.3s ease;
          }
        </style>
      </head>
      <body>
        <div class="splash-container">
          <div class="logo">
            <span class="logo-text">smartloop</span><span class="logo-dot">.</span>
          </div>
          <div class="spinner"></div>
          <div class="loading-text">Getting things ready...</div>
        </div>
      </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/img/logo.png')
  });

  // Remove default menu or create custom menu
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  // Load the app
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built Vite app
    mainWindow.loadFile(path.join(__dirname, '../dist-web/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// Handle OAuth login - open in system browser
ipcMain.handle('oauth-login', async (event) => {
  console.log('[OAuth] oauth-login called');

  const authUrl = `${APP_URL}/login?mode=native`;
  console.log('[OAuth] Opening URL:', authUrl);

  // Open in system's default browser
  await shell.openExternal(authUrl);
  console.log('[OAuth] Browser opened successfully');

  // Return immediately - we'll get the callback via protocol handler
  return { status: 'browser_opened' };
});

// Handle token validation
ipcMain.handle('validate-token', async (event, token) => {
  console.log('[OAuth] Validating token:', token ? '***' + token.slice(-10) : 'none');

  try {
    // Make a request to validate the token using the /users/me endpoint
    const validateUrl = `${BASE_URL}/v1/users/me`;
    console.log('[OAuth] Validation URL:', validateUrl);

    const response = await fetch(validateUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    console.log('[OAuth] Validation response status:', response.status, response.statusText);

    if (response.ok) {
      const data = await response.json();
      console.log('[OAuth] Token validation successful, user:', data?.email || data?.id || 'unknown');
      return { valid: true, user: data };
    } else {
      const errorText = await response.text();
      console.error('[OAuth] Token validation failed:', response.status, errorText);
      return { valid: false, error: errorText };
    }
  } catch (error) {
    console.error('[OAuth] Token validation error:', error);
    return { valid: false, error: error.message };
  }
});

// Handle token refresh
ipcMain.handle('refresh-token', async (event, token) => {
  console.log('[TokenRefresh] Refreshing token...');

  try {
    const refreshUrl = `${BASE_URL}/v1/auth/jwt/refresh`;
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[TokenRefresh] Token refreshed successfully');
      return { success: true, token: data.access_token };
    } else {
      const errorText = await response.text();
      console.error('[TokenRefresh] Failed to refresh token:', response.status, errorText);
      return { success: false, error: errorText, status: response.status };
    }
  } catch (error) {
    console.error('[TokenRefresh] Error refreshing token:', error);
    return { success: false, error: error.message };
  }
});

// Note: Default project ("general_chat") is created by the SLP framework during bootstrap

// Start periodic token refresh
ipcMain.handle('start-token-refresh', async (event, token) => {
  console.log('[TokenRefresh] Starting periodic token refresh');

  // Clear any existing interval
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }

  // Function to perform token refresh
  const performRefresh = async (tokenToUse = null) => {
    if (!mainWindow) {
      console.log('[TokenRefresh] No main window, skipping refresh');
      return;
    }

    try {
      const refreshUrl = `${BASE_URL}/v1/auth/jwt/refresh`;
      const currentToken = tokenToUse || store.get('token', null);

      if (!currentToken) {
        console.log('[TokenRefresh] No token found, stopping refresh');
        stopTokenRefresh();
        return;
      }

      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[TokenRefresh] Token refreshed successfully (periodic)');

        // Send the new token to the renderer
        if (mainWindow) {
          mainWindow.webContents.send('token-refreshed', {
            success: true,
            token: data.access_token
          });
        }
      } else {
        console.error('[TokenRefresh] Failed to refresh token (periodic):', response.status);

        // If 401, token is invalid - notify renderer to re-authenticate
        if (response.status === 401) {
          stopTokenRefresh();
          if (mainWindow) {
            mainWindow.webContents.send('token-refreshed', {
              success: false,
              error: 'Token expired',
              requiresReauth: true
            });
          }
        }
      }
    } catch (error) {
      console.error('[TokenRefresh] Error during periodic refresh:', error);
    }
  };

  // Perform initial refresh with the provided token
  await performRefresh(token);

  // Set up periodic refresh (will read from storage)
  tokenRefreshInterval = setInterval(performRefresh, TOKEN_REFRESH_INTERVAL);
  console.log('[TokenRefresh] Refresh interval set to', TOKEN_REFRESH_INTERVAL / 1000 / 60, 'minutes');

  return { success: true };
});

// Stop token refresh
function stopTokenRefresh() {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
    console.log('[TokenRefresh] Stopped periodic token refresh');
  }
}

ipcMain.handle('stop-token-refresh', async () => {
  stopTokenRefresh();
  return { success: true };
});

// Handle deep linking for OAuth callback
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle the protocol on macOS/Linux
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[OAuth] Deep link received (macOS/Linux):', url);
  console.log('[OAuth] PROTOCOL constant:', PROTOCOL);

  // Accept any URL with our protocol
  if (url.startsWith(`${PROTOCOL}://`)) {
    console.log('[OAuth] Valid protocol URL detected, handling callback');
    handleOAuthCallback(url);
  } else {
    console.log('[OAuth] Deep link ignored - not our protocol');
  }
});

// Handle protocol on Windows
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[OAuth] Second instance detected (Windows)');
    console.log('[OAuth] Command line args:', commandLine);

    // Someone tried to run a second instance, we should focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle the protocol URL on Windows
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    console.log('[OAuth] Protocol URL from command line:', url || 'none');
    console.log('[OAuth] PROTOCOL constant:', PROTOCOL);

    // Accept any URL with our protocol
    if (url) {
      console.log('[OAuth] Valid protocol URL detected, handling callback');
      handleOAuthCallback(url);
    }
  });

  app.whenReady().then(async () => {
    console.log('[App] App is ready');
    console.log('[App] Process args:', process.argv);

    // Open SQLite database
    database.openDatabase();

    // Check for protocol URL in startup args (Windows/Linux)
    const protocolUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (protocolUrl) {
      console.log('[OAuth] Protocol URL found in startup args:', protocolUrl);
      // Delay handling until window is ready
      setTimeout(() => {
        console.log('[OAuth] Handling startup protocol URL');
        handleOAuthCallback(protocolUrl);
      }, 1000);
    }

    // Show splash screen while SLP service starts
    createSplashScreen();

    // Create main window (hidden until ready)
    createWindow();

    // Setup and start SLP service in background (non-blocking, fully async)
    (async () => {
      try {
        // Download & install SLP binary via curl (async — won't freeze the app)
        try {
          await setupSlpService((progress) => {
            updateSplashProgress(progress);
          });
        } catch (error) {
          console.warn('[SLP] Setup failed, proceeding anyway:', error.message);
        }

        updateSplashProgress({ status: 'starting', message: 'Starting SLP service...' });

        const serviceStarted = await startSlpService();
        const baseUrl = getLocalBaseUrl();

        if (serviceStarted && baseUrl) {
          // Notify renderer that the local service is ready
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('slp-service-ready', { port: localServicePort, baseUrl });
          }

          try {
            await bootstrapSlpService(baseUrl);
          } catch (error) {
            console.warn('[SLP] Bootstrap failed during startup, proceeding anyway:', error.message);
          }
        } else {
          console.warn('[SLP] Service did not start, proceeding without local service');
        }
      } catch (error) {
        console.error('[SLP] Unexpected error during startup:', error.message);
      } finally {
        // Show main window first, then close splash
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
          splashWindow = null;
        }
      }
    })();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// Handle OAuth callback
function handleOAuthCallback(url) {
  console.log('[OAuth] Callback received:', url);

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.hostname || urlObj.pathname.replace(/^\/+/, '');

    // Check if this is an MCP authorization callback
    if (pathname === 'mcp-authorization') {
      const serverId = urlObj.searchParams.get('server_id');
      const error = urlObj.searchParams.get('error');

      console.log('[MCP Auth] Callback - server_id:', serverId || 'none', 'error:', error || 'none');

      if (mainWindow) {
        if (error) {
          mainWindow.webContents.send('mcp-auth-callback', { error });
        } else if (serverId) {
          mainWindow.webContents.send('mcp-auth-callback', { serverId });
        } else {
          mainWindow.webContents.send('mcp-auth-callback', { error: 'No server_id received' });
        }

        // Focus the main window
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      return;
    }

    // Handle regular OAuth login callback
    const accessToken = urlObj.searchParams.get('token');
    const error = urlObj.searchParams.get('error');

    console.log('[OAuth] Parsed callback - token:', accessToken ? '***' + accessToken.slice(-4) : 'none', 'error:', error || 'none');

    if (mainWindow) {
      if (error) {
        console.log('[OAuth] Sending error to renderer:', error);
        mainWindow.webContents.send('oauth-callback', { error });
      } else if (accessToken) {
        console.log('[OAuth] Sending access token to renderer');
        mainWindow.webContents.send('oauth-callback', { accessToken });
      } else {
        console.log('[OAuth] No token or error received');
        mainWindow.webContents.send('oauth-callback', { error: 'No access token received' });
      }

      // Focus the main window
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      console.log('[OAuth] Main window focused');
    }
  } catch (err) {
    console.error('[OAuth] Error parsing callback URL:', err);
    if (mainWindow) {
      mainWindow.webContents.send('oauth-callback', { error: err.message });
    }
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  // Close database and clean up SLP service before quitting
  database.closeDatabase();
  if (getLocalBaseUrl()) {
    event.preventDefault();
    await unloadModel();
    stopSlpService();
    app.exit(0);
  }
});

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
