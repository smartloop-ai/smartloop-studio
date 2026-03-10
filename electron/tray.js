const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;

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
 * Rebuild the tray context menu to reflect current service state.
 *
 * @param {object} opts
 * @param {number|null} opts.localServicePort - current port or null
 * @param {() => Promise<boolean>} opts.startSlpService
 * @param {() => void} opts.stopSlpService
 * @param {() => Promise<void>} opts.unloadModel
 * @param {() => string|null} opts.getLocalBaseUrl
 * @param {BrowserWindow|null} opts.mainWindow
 */
function updateTrayMenu({ localServicePort, startSlpService, stopSlpService, unloadModel, getLocalBaseUrl, mainWindow }) {
  if (!tray) return;

  const isRunning = !!localServicePort;
  const statusLabel = isRunning ? `Running on port ${localServicePort}` : 'Stopped';

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Smartloop Studio', enabled: false },
    { type: 'separator' },
    { label: `Service: ${statusLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Start Service',
      enabled: !isRunning,
      click: async () => {
        const result = await startSlpService();
        if (result) {
          updateTrayMenu({ localServicePort, startSlpService, stopSlpService, unloadModel, getLocalBaseUrl, mainWindow });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('slp-service-ready', { port: localServicePort, baseUrl: getLocalBaseUrl() });
          }
        }
      },
    },
    {
      label: 'Stop Service',
      enabled: isRunning,
      click: async () => {
        if (getLocalBaseUrl()) await unloadModel();
        stopSlpService();
        updateTrayMenu({ localServicePort: null, startSlpService, stopSlpService, unloadModel, getLocalBaseUrl, mainWindow });
      },
    },
    {
      label: 'Restart Service',
      enabled: isRunning,
      click: async () => {
        if (getLocalBaseUrl()) await unloadModel();
        stopSlpService();
        updateTrayMenu({ localServicePort: null, startSlpService, stopSlpService, unloadModel, getLocalBaseUrl, mainWindow });
        const result = await startSlpService();
        if (result) {
          updateTrayMenu({ localServicePort, startSlpService, stopSlpService, unloadModel, getLocalBaseUrl, mainWindow });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('slp-service-ready', { port: localServicePort, baseUrl: getLocalBaseUrl() });
          }
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
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

module.exports = { createTray, updateTrayMenu };
