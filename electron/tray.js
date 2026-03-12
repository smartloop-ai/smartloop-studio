const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const slpService = require('./slp-service');

let tray = null;
let mainWindow = null;
let createWindowFn = null;

/**
 * Create the system tray.
 * Call once from app.whenReady().
 */
function createTray() {
  const iconPath = path.join(__dirname, '../public/img/tray.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Smartloop Studio');
}

/**
 * Set the main window reference so the tray can notify it.
 */
function setMainWindow(win) {
  mainWindow = win;
}

/**
 * Register the createWindow function so the tray can recreate the window.
 */
function setCreateWindow(fn) {
  createWindowFn = fn;
}

/**
 * Show the main window, recreating it if it was destroyed.
 */
function showOrCreateWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (createWindowFn) {
      mainWindow = createWindowFn();
    }
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

/**
 * Rebuild the tray context menu to reflect current service state.
 */
function refreshTray() {
  if (!tray) return;

  const port = slpService.getPort();
  const isRunning = !!port;
  const statusLabel = isRunning ? `Running on port ${port}` : 'Stopped';

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Smartloop Studio', enabled: false },
    { type: 'separator' },
    { label: `Service: ${statusLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Start Service',
      enabled: !isRunning,
      click: async () => {
        const result = await slpService.startService();
        refreshTray();
        if (result && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('slp-service-ready', {
            port: slpService.getPort(),
            baseUrl: slpService.getLocalBaseUrl(),
          });
        }
      },
    },
    {
      label: 'Stop Service',
      enabled: isRunning,
      click: async () => {
        await slpService.unloadModel();
        slpService.stopService();
        refreshTray();
      },
    },
    {
      label: 'Restart Service',
      enabled: isRunning,
      click: async () => {
        await slpService.unloadModel();
        slpService.stopService();
        refreshTray();
        const result = await slpService.startService();
        refreshTray();
        if (result && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('slp-service-ready', {
            port: slpService.getPort(),
            baseUrl: slpService.getLocalBaseUrl(),
          });
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        showOrCreateWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

module.exports = { createTray, setMainWindow, setCreateWindow, refreshTray };
