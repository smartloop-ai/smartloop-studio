const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store').default || require('electron-store');

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

const isDev = process.env.NODE_ENV === 'development';
const port = process.env.PORT || 5000;
const APP_URL = process.env.VITE_APP_URL || 'https://app.smartloop.ai';
const BASE_URL = process.env.VITE_BASE_URL || 'https://api.smartloop.ai';

// Initialize electron-store
const store = new Store({
  name: 'smartloop-storage',
  encryptionKey: 'smartloop-secure-key', // Optional: encrypt sensitive data
});

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
        </style>
      </head>
      <body>
        <div class="splash-container">
          <div class="logo">
            <span class="logo-text">smartloop</span><span class="logo-dot">.</span>
          </div>
          <div class="spinner"></div>
          <div class="loading-text">Warming up...</div>
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

  // Show main window when ready and close splash
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    }, 1500); // Show splash for at least 1.5 seconds
  });

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

  app.whenReady().then(() => {
    console.log('[OAuth] App is ready');
    console.log('[OAuth] Process args:', process.argv);

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

    // Show splash screen first
    createSplashScreen();

    // Create main window (hidden)
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createSplashScreen();
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

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
