const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const slpService = require('./slp-service');

let tray = null;
let mainWindow = null;
let createWindowFn = null;
let appReady = false;
// Set while first-run setup (the model download) is still outstanding because
// the user declined it at launch — see confirmModelDownload in main.js. Null
// once there is nothing left to set up, which is the normal state.
let setupHandler = null;

/**
 * The menu bar / tray image.
 *
 * macOS gets a TEMPLATE image: the system tints the alpha silhouette itself, so
 * the glyph is dark on a light menu bar, light on a dark one, and inverts while
 * the menu is open. Without it the source art — which is pure white — rendered
 * as-is and all but vanished on the default light menu bar. Electron infers
 * "template" from the `Template` filename suffix and picks up the `@2x` file
 * beside it, which is what keeps the icon crisp on Retina; resizing the 128px
 * source in memory could only ever produce a 1x bitmap for the system to
 * upscale.
 *
 * Windows and Linux keep the white glyph — their panels are dark by default —
 * and are not template-aware, so they take the plain image resized to 18px.
 */
function trayIcon() {
  if (process.platform === 'darwin') {
    return nativeImage.createFromPath(path.join(__dirname, '../public/img/trayTemplate.png'));
  }
  return nativeImage
    .createFromPath(path.join(__dirname, '../public/img/tray.png'))
    .resize({ width: 18, height: 18 });
}

/**
 * Create the system tray.
 * Call once from app.whenReady().
 */
function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Smartloop Studio');

  // Left-click on the tray icon shows the window (Windows/Linux; on macOS a
  // tray with a context menu opens the menu on click instead).
  tray.on('click', () => {
    showOrCreateWindow();
  });
}

/**
 * Offer (or withdraw) the "Complete Setup" entry. Pass the function that starts
 * the deferred first-run download, or null once it is no longer needed. This is
 * the way back for a user who answered "Not Now" to the download prompt, so the
 * choice is genuinely optional rather than a one-shot the app can't recover
 * from.
 */
function setSetupHandler(fn) {
  setupHandler = fn || null;
  if (tray) refreshTray();
}

/**
 * Set the main window reference so the tray can notify it.
 */
function setMainWindow(win) {
  mainWindow = win;
}

/**
 * Mark the app as ready (splash done, main window visible).
 * Until this is called, "Show Window" in the tray does nothing.
 */
function setAppReady(ready) {
  appReady = ready;  if (ready) refreshTray();
}

/**
 * Register the createWindow function so the tray can recreate the window.
 */
function setCreateWindow(fn) {
  createWindowFn = fn;
}

/**
 * Show the main window, recreating it if it was destroyed.
 * Does nothing while the splash screen is still active.
 */
function showOrCreateWindow() {
  if (!appReady) return;
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
 * Fetch projects from the local SLP service.
 * Returns an empty array if the service isn't running.
 */
async function fetchProjects() {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return [];

  try {
    const res = await fetch(`${baseUrl}/v1/projects`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data.projects || []);
    }
  } catch {
    // Service not reachable
  }
  return [];
}

/**
 * Rebuild the tray context menu to reflect current service state.
 */
async function refreshTray() {
  if (!tray) return;

  const port = slpService.getPort();
  const isRunning = !!port;
  const statusLabel = isRunning ? `Running on port ${port}` : 'Stopped';

  // Fetch projects if service is running
  let projectItems = [];
  if (isRunning) {
    const projects = await fetchProjects();
    if (projects.length > 0) {
      projectItems = projects.map(p => ({
        label: p.name || p.id,
        click: () => {
          showOrCreateWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('navigate-to-project', p.id);
          }
        },
      }));
    }
  }

  const template = [];

  template.push(
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
  );

  // Add projects submenu if we have any
  if (projectItems.length > 0) {
    template.push({
      label: 'Projects',
      submenu: projectItems,
    });
    template.push({ type: 'separator' });
  }

  if (setupHandler) {
    template.push({
      label: 'Complete Setup…',
      click: () => { const run = setupHandler; if (run) run(); },
    });
    template.push({ type: 'separator' });
  }

  template.push({
    label: 'Show Window',
    enabled: appReady,
    click: () => {
      showOrCreateWindow();
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: 'Quit',
    click: () => app.quit(),
  });

  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);
}

/**
 * Update tray tooltip to show document processing progress.
 * Call with pct=null or status='done' to reset to default.
 */
function setTrayProgress(pct, status) {
  if (!tray) return;

  if (pct === null || status === 'done' || status === 'error') {
    tray.setToolTip('Smartloop Studio');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1); // remove progress bar
    }
  } else {
    tray.setToolTip(`Smartloop Studio - Processing document ${pct}%`);
    if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(pct / 100);
    }
  }
}

/**
 * Remove the tray icon.
 *
 * Called at the start of the quit, not left to process exit: quitting waits for
 * the local service to stop, and until then the app is still alive with its
 * windows already hidden. An icon sitting in the menu bar through that is the
 * one piece of the app the user can still see, and clicking it does nothing.
 */
function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

module.exports = { createTray, destroyTray, setMainWindow, setCreateWindow, setAppReady, refreshTray, setTrayProgress, setSetupHandler };
