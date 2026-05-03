const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const Store = require('electron-store').default || require('electron-store');
const { machineId, machineIdSync } = require('node-machine-id');
const { setupSlpService, uninstallSlpService } = require('./slp-setup');
const database = require('./database');
const { createTray, setMainWindow, setCreateWindow, setAppReady, refreshTray, setTrayProgress } = require('./tray');
const slpService = require('./slp-service');

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

// Open a folder in the system file manager (Finder on macOS)
ipcMain.handle('open-in-finder', async (event, folderPath) => {
  if (folderPath) {
    const resolved = folderPath.startsWith('~')
      ? folderPath.replace('~', require('os').homedir())
      : folderPath;
    await shell.openPath(resolved);
    return true;
  }
  return false;
});

// Open a document reference (citation) with the system's native viewer
ipcMain.handle('open-document-reference', async (event, filePath, documentId, projectId) => {
  console.log('[Document Reference] Opening:', { filePath, documentId, projectId });
  if (filePath) {
    const resolved = filePath.startsWith('~')
      ? filePath.replace('~', require('os').homedir())
      : filePath;
    const result = await shell.openPath(resolved);
    if (result) {
      console.warn('[Document Reference] Failed to open:', result);
      return { success: false, error: result };
    }
    return { success: true, path: resolved };
  }
  console.warn('[Document Reference] No file path provided for document:', documentId);
  return { success: false, error: 'No file path' };
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

// IPC: read a text file from disk
ipcMain.handle('read-text-file', async (event, filePath) => {
  try {
    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.replace(/^~[/\\]?/, ''))
      : filePath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' };
    const content = fs.readFileSync(resolved, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: save file via native save dialog
ipcMain.handle('save-file-dialog', async (event, defaultName, content) => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: delete a file from disk
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.replace(/^~[/\\]?/, ''))
      : filePath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' };
    fs.unlinkSync(resolved);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: recursively delete a folder from disk
ipcMain.handle('delete-folder', async (event, folderPath) => {
  try {
    const resolved = folderPath.startsWith('~')
      ? path.join(os.homedir(), folderPath.replace(/^~[/\\]?/, ''))
      : folderPath;
    if (!fs.existsSync(resolved)) return { success: true };
    fs.rmSync(resolved, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: list supported document files from a directory
ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    const resolved = dirPath.startsWith('~')
      ? path.join(os.homedir(), dirPath.replace(/^~[/\\]?/, ''))
      : dirPath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'Directory not found', files: [] };
    const supportedExts = ['.pdf', '.docx', '.txt', '.csv'];
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!supportedExts.includes(ext)) continue;
      const fullPath = path.join(resolved, entry.name);
      const stat = fs.statSync(fullPath);
      files.push({ name: entry.name, path: fullPath, size: stat.size, modified: stat.mtime.toISOString() });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
});

// IPC: select a folder using native dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC: get the OS home directory
ipcMain.handle('get-home-dir', () => os.homedir());

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
ipcMain.handle('db-get-conversations', (event, projectId, order) => database.getConversations(projectId, order));
ipcMain.handle('db-update-conversation', (event, id, updates) => database.updateConversation(id, updates));
ipcMain.handle('db-delete-conversation', (event, id) => database.deleteConversation(id));
ipcMain.handle('db-delete-conversations-by-project', (event, projectId) => database.deleteConversationsByProject(projectId));
ipcMain.handle('db-select-conversation', (event, id) => database.selectConversation(id));
ipcMain.handle('db-clear-selected-conversation', () => database.clearSelectedConversation());
ipcMain.handle('db-get-selected-conversation', () => database.getSelectedConversation());

// Messages
ipcMain.handle('db-add-message', (event, msg) => database.addMessage(msg));
ipcMain.handle('db-add-messages', (event, conversationId, msgs) => database.addMessages(conversationId, msgs));
ipcMain.handle('db-get-messages', (event, conversationId) => database.getMessages(conversationId));
ipcMain.handle('db-delete-messages', (event, conversationId) => database.deleteMessages(conversationId));

// Memory usage
ipcMain.handle('db-add-memory-usage', (event, memoryPercent) => database.addMemoryUsage(memoryPercent));
ipcMain.handle('db-get-memory-usage', (event, limit) => database.getMemoryUsage(limit));
ipcMain.handle('db-add-tps-entry', (event, tps) => database.addTpsEntry(tps));
ipcMain.handle('db-get-tps-history', (event, limit) => database.getTpsHistory(limit));

// Settings
ipcMain.handle('db-get-setting', (event, key) => database.getSetting(key));
ipcMain.handle('db-set-setting', (event, key, value) => database.setSetting(key, value));
ipcMain.handle('db-get-all-settings', () => database.getAllSettings());

// MCP Servers
ipcMain.handle('db-add-mcp-server', (event, server) => database.addMcpServer(server));
ipcMain.handle('db-get-mcp-server', (event, id) => database.getMcpServer(id));
ipcMain.handle('db-get-mcp-servers-by-project', (event, projectId) => database.getMcpServersByProject(projectId));
ipcMain.handle('db-delete-mcp-server', (event, id) => database.deleteMcpServer(id));
ipcMain.handle('db-delete-mcp-servers-by-project', (event, projectId) => database.deleteMcpServersByProject(projectId));

// Folders
ipcMain.handle('db-create-folder', (event, folder) => database.createFolder(folder));
ipcMain.handle('db-list-folders-by-project', (event, projectId) => database.listFoldersByProject(projectId));
ipcMain.handle('db-rename-folder', (event, id, name) => database.renameFolder(id, name));
ipcMain.handle('db-delete-folder', (event, id) => database.deleteFolder(id));
ipcMain.handle('db-set-document-folder', (event, mapping) => database.setDocumentFolder(mapping));
ipcMain.handle('db-clear-document-folder', (event, documentId) => database.clearDocumentFolder(documentId));
ipcMain.handle('db-get-document-folders-by-project', (event, projectId) => database.getDocumentFoldersByProject(projectId));

// Document Status
ipcMain.handle('db-set-document-processed', (event, documentId, projectId) => database.setDocumentProcessed(documentId, projectId));
ipcMain.handle('db-get-document-status-by-project', (event, projectId) => database.getDocumentStatusByProject(projectId));
ipcMain.handle('db-delete-document-status', (event, documentId) => database.deleteDocumentStatus(documentId));
ipcMain.handle('db-delete-document-status-by-project', (event, projectId) => database.deleteDocumentStatusByProject(projectId));
ipcMain.handle('db-delete-folders-by-project', (event, projectId) => database.deleteFoldersByProject(projectId));

// --- Local SLP service helpers ---


// IPC: get local API URL
ipcMain.handle('get-local-api-url', async () => {
  return slpService.getLocalBaseUrl();
});

// IPC: add document via local SLP (proxied through main process to avoid CORS/Broken Pipe)
// The POST endpoint returns an SSE stream with event types: queued, progress, done
ipcMain.handle('slp-add-document', async (event, filePath, projectId, cwd) => {
  const http = require('http');
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'SLP service not running' };

  const docPath = projectId ? `/v1/projects/${projectId}/documents` : '/v1/documents';
  const url = new URL(`${baseUrl}${docPath}`);
  const bodyObj = { source: filePath };
  if (cwd) bodyObj.cwd = cwd;
  const body = JSON.stringify(bodyObj);

  return new Promise((resolve) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buffer = '';
      let currentEvent = '';
      let lastDocuments = null;

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) { currentEvent = ''; continue; }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          const payload = trimmed.startsWith('data: ') ? trimmed.slice(6)
            : trimmed.startsWith('data:') ? trimmed.slice(5).trim() : null;
          if (payload === null) continue;

          try {
            const data = JSON.parse(payload);
            const documents = data.documents || [];
            if (documents.length > 0) lastDocuments = documents;

            let pct = 0;
            let status = 'Processing...';

            if (currentEvent === 'queued') {
              pct = 10;
              status = 'Queued';
            } else if (currentEvent === 'progress') {
              const doc = documents[0];
              const docStatus = doc?.status || '';
              if (docStatus === 'converting') { pct = 30; status = 'Converting...'; }
              else if (docStatus === 'indexing') { pct = 60; status = 'Indexing...'; }
              else { pct = 40; status = docStatus || 'Processing...'; }
            } else if (currentEvent === 'done') {
              pct = 100;
              status = 'Complete';
            } else {
              if (data.progress !== undefined) pct = Math.round(data.progress * 100);
              else pct = data.percent ?? data.percentage ?? 0;
              status = data.status || 'Processing...';
              if (data.id || data.source || data.document_id) lastDocuments = [data];
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('slp-document-progress', {
                percent: pct, status, event: currentEvent, documents,
              });
            }
            setTrayProgress(pct, status);
          } catch { /* skip non-JSON */ }
        }
      });

      res.on('end', () => {
        if (buffer.trim()) {
          try {
            const raw = buffer.trim();
            const payload = raw.startsWith('data: ') ? raw.slice(6)
              : raw.startsWith('data:') ? raw.slice(5).trim() : raw;
            const data = JSON.parse(payload);
            if (data.documents) lastDocuments = data.documents;
            else if (data.id || data.source || data.document_id) lastDocuments = [data];
          } catch { }
        }

        setTrayProgress(null, 'done');
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ success: true, data: lastDocuments?.[0] || {} });
        } else {
          resolve({ success: false, error: `Server returned ${res.statusCode}` });
        }
      });

      res.on('error', (err) => {
        setTrayProgress(null, 'error');
        resolve({ success: false, error: err.message });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.write(body);
    req.end();
  });
});

// IPC: get SLP config
ipcMain.handle('get-slp-config', async () => {
  try {
    const configPath = path.join(slpService.getSlpDir(), 'config.json');
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('[SLP] Could not read config.json:', error.message);
    return null;
  }
});

// IPC: get system hardware info (CPU, RAM, GPU)
ipcMain.handle('get-system-info', async () => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  let gpuName = null;

  // Try nvidia-smi first
  try {
    const result = execFileSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader,nounits'], { timeout: 3000 }).toString().trim();
    gpuName = result.split('\n')[0].trim() || null;
  } catch { }

  // Fallback: lspci on Linux
  if (!gpuName && process.platform === 'linux') {
    try {
      const { execSync } = require('child_process');
      const result = execSync("lspci 2>/dev/null | grep -i 'vga\\|3d\\|display'", { timeout: 3000, shell: true }).toString();
      const match = result.match(/:\s+(.+)$/m);
      if (match) gpuName = match[1].trim();
    } catch { }
  }

  // Fallback: system_profiler on macOS
  if (!gpuName && process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const result = execSync("system_profiler SPDisplaysDataType 2>/dev/null | grep 'Chipset Model'", { timeout: 3000, shell: true }).toString();
      const match = result.match(/Chipset Model:\s+(.+)$/m);
      if (match) gpuName = match[1].trim();
    } catch { }
  }

  return {
    cpu: cpus[0]?.model?.replace(/\s+/g, ' ').trim() || 'Unknown CPU',
    cores: cpus.length,
    totalMemGb: Math.round(totalMem / (1024 ** 3) * 10) / 10,
    freeMemGb: Math.round(freeMem / (1024 ** 3) * 10) / 10,
    gpu: gpuName || null,
  };
});

// IPC: start/stop SLP service from renderer
ipcMain.handle('slp-service-start', async () => {
  const result = await slpService.startService();
  refreshTray();
  return { success: result, port: slpService.getPort() };
});

ipcMain.handle('slp-service-stop', async () => {
  await slpService.stopService();
  refreshTray();
  return { success: true };
});

ipcMain.handle('slp-service-restart', async () => {
  await slpService.stopService();
  await new Promise(r => setTimeout(r, 1000));
  const result = await slpService.startService();
  refreshTray();
  return { success: result, port: slpService.getPort() };
});

ipcMain.handle('slp-service-uninstall', async () => {
  await slpService.stopService();
  uninstallSlpService();
  refreshTray();
  return { success: true };
});

ipcMain.handle('slp-service-status', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { running: false };
  try {
    const res = await fetch(`${baseUrl}/health`);
    const health = await res.json();
    return { running: true, port: slpService.getPort(), health };
  } catch {
    return { running: false };
  }
});

// Bootstrap the SLP service via SSE endpoint
// Handles workspace creation, model download, project creation, and model loading
const { bootstrapProgress } = require('./bootstrap-progress.js');

async function bootstrapSlpService(baseUrl) {
  return new Promise((resolve, reject) => {
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
        reject(new Error(`Bootstrap request failed with status ${res.statusCode}`));
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
              const progress = bootstrapProgress(data);

              if (progress.percent > 0) {
                if (progress.percent % 10 === 0) console.log(`[SLP] Bootstrap: downloading ${progress.percent}%`);
              } else {
                console.log('[SLP] Bootstrap:', progress.status);
              }

              // Send to splash screen only when main window isn't visible yet
              if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
                updateSplashProgress(data);
              }

              // Send normalised progress to renderer so the chat UI can show it
              if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
                mainWindow.webContents.send('bootstrap-progress', progress);
              }
            } catch {
              // ignore unparseable SSE data
            }
          }
        }
      });

      res.on('end', () => {
        console.log('[SLP] Bootstrap completed');

        // Send a final completed event so the renderer clears the progress UI
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
          mainWindow.webContents.send('bootstrap-progress', {
            percent: 100, status: 'Ready', model: '', downloading: false
          });
        }

        resolve(true);
      });

      res.on('error', (err) => {
        reject(new Error(`Bootstrap stream error: ${err.message}`));
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Bootstrap request error: ${err.message}`));
    });

    req.end();
  });
}

/**
 * Update the splash screen with download/install progress.
 * Single progress bar with status text.
 *
 * @param {object} data - Progress data:
 *   { status: 'downloading', downloaded: number, total: number }
 *   { status: 'installing' }
 *   { status: 'preparing', message: string }
 *   { status: 'error', message: string }
 */
function updateSplashProgress(data) {
  if (!splashWindow || splashWindow.isDestroyed()) return;

  if (data.status === 'error') {
    const msg = data.message || 'An error occurred.';
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = ${JSON.stringify(msg)};
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-fill').classList.remove('indeterminate');
    `).catch(() => { });
    return;
  }

  if (data.status === 'downloading') {
    const downloaded = data.downloaded || 0;
    const total = data.total || 0;
    // Also handle percent/progress fields from bootstrap SSE
    const explicitPct = data.percent ?? data.progress ?? data.percentage;
    const pct = total > 0
      ? Math.min(100, Math.round((downloaded / total) * 100))
      : explicitPct !== undefined ? Math.min(100, Math.round(Number(explicitPct))) : 0;
    const label = data.message || 'Downloading model...';
    let statusText;
    if (total > 0) {
      const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
      const totalMB = (total / (1024 * 1024)).toFixed(1);
      statusText = `${label} ${dlMB} / ${totalMB} MB`;
    } else if (pct > 0) {
      statusText = `${label} ${pct}%`;
    } else {
      statusText = label;
    }

    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = ${JSON.stringify(statusText)};
      document.getElementById('progress-fill').style.width = '${pct}%';
      document.getElementById('progress-fill').classList.remove('indeterminate');
    `).catch(() => { });
    return;
  }

  if (data.status === 'installing') {
    const msg = data.message || 'Installing...';
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = ${JSON.stringify(msg)};
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-fill').classList.add('indeterminate');
    `).catch(() => { });
    return;
  }

  if (data.status === 'preparing') {
    const msg = data.message || 'Starting service. This might take a while...';
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = 'Starting service...';
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-fill').classList.add('indeterminate');
    `).catch(() => { });
    return;
  }
}

// IPC: load model (called from renderer)
ipcMain.handle('load-model', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  const result = await slpService.loadModel(baseUrl);
  return { success: result };
});

// IPC: unload model (called from renderer)
ipcMain.handle('unload-model', async () => {
  await slpService.unloadModel();
  return { success: true };
});

// IPC: Set auth token on local SLP service
ipcMain.handle('slp-set-auth', async (event, { type, token }) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  try {
    const res = await fetch(`${baseUrl}/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, type: type || 'access_token' })
    });
    if (res.ok) {
      const data = await res.json();
      console.log('[SLP] Auth token set successfully');
      return { success: true, data };
    } else {
      console.error('[SLP] Failed to set auth token:', res.status);
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    console.error('[SLP] Error setting auth token:', err.message);
    return { success: false, error: err.message };
  }
});

// IPC: Check auth status on local SLP service
ipcMain.handle('slp-auth-status', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  try {
    const res = await fetch(`${baseUrl}/v1/auth/status`);
    if (res.ok) {
      const data = await res.json();
      return { success: true, ...data };
    } else {
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Logout from local SLP service (clear access token)
ipcMain.handle('slp-auth-logout', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  try {
    const res = await fetch(`${baseUrl}/v1/auth/token?type=access_token`, { method: 'DELETE' });
    if (res.ok) {
      return { success: true };
    } else {
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Fetch available models from local SLP service
ipcMain.handle('slp-list-models', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  try {
    const modelsRes = await fetch(`${baseUrl}/v1/models`);
    if (modelsRes.ok) {
      const data = await modelsRes.json();
      const models = Array.isArray(data) ? data : (data.data || data.models || []);
      return { success: true, models };
    } else {
      return { success: false, error: `HTTP ${modelsRes.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Download a model via local SLP service (SSE streaming progress)
ipcMain.handle('slp-download-model', async (event, modelName) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };

  return new Promise((resolve) => {
    const http = require('http');
    const url = new URL(`${baseUrl}/v1/models/download`);

    const postData = JSON.stringify({ model: modelName });

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }

      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const progress = bootstrapProgress(data);

              // Send download progress to renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('model-download-progress', {
                  model: modelName,
                  ...progress,
                });
              }
            } catch {
              // ignore unparseable SSE data
            }
          }
        }
      });

      res.on('end', () => {
        // Send completion event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('model-download-progress', {
            model: modelName,
            percent: 100,
            status: 'Ready',
            downloading: false,
          });
        }
        resolve({ success: true, model: modelName });
      });

      res.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
});

// Register custom protocol for OAuth callback
const PROTOCOL = 'smartloop';

function createSplashScreen() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    resizable: false,
    minimizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

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
            background: #000000;
            border-radius: 8px;
            border: 1px solid #2a2a2a;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            overflow: hidden;
            padding: 0 24px;
          }
          .splash-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            width: 100%;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 24px;
          }
          .logo-text { color: white; }
          .logo-dot { color: #ec4899; }
          .progress-track {
            width: 100%;
            height: 6px;
            background: #1a1a1a;
            border-radius: 0;
            overflow: hidden;
            position: relative;
          }
          .progress-fill {
            height: 100%;
            background: #ec4899;
            border-radius: 0;
            width: 0%;
            transition: width 0.3s ease;
          }
          .progress-fill.indeterminate {
            width: 40% !important;
            animation: slide 1.5s ease-in-out infinite;
          }
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(350%); }
          }
          .status-text {
            color: #6b7280;
            font-size: 13px;
            text-align: center;
            margin-top: 12px;
            min-height: 18px;
          }
        </style>
      </head>
      <body>
        <div class="splash-container">
          <div class="splash-body">
            <div class="logo">
              <span class="logo-text">smartloop</span><span class="logo-dot">.</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <div class="status-text" id="status-text">Getting things ready...</div>
          </div>
        </div>
      </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}


function createStartingSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    resizable: false,
    minimizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash-starting.html'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 920,
    minHeight: 600,
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

  // Window is shown explicitly after installation/setup completes

  // Hide to tray instead of destroying so re-show is instant
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Only null out on actual destroy (app quit)
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

  return mainWindow;
}

// Handle OAuth login - open in system browser with local service port
ipcMain.handle('oauth-login', async (event) => {
  console.log('[OAuth] oauth-login called');

  const port = slpService.getPort() || slpService.readLocalServicePort();
  if (!port) {
    console.error('[OAuth] No local service port available');
    return { status: 'error', error: 'Local service not running' };
  }

  const authUrl = `${APP_URL}/login/?mode=desktop&port=${port}`;
  console.log('[OAuth] Opening URL:', authUrl);

  // Open in system's default browser
  await shell.openExternal(authUrl);
  console.log('[OAuth] Browser opened successfully');

  // Return immediately - webapp will POST tokens directly to local service
  return { status: 'browser_opened', port };
});



// Note: Default project ("general_chat") is created by the SLP framework during bootstrap


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

    // Create system tray and main window (hidden until ready)
    createTray();
    createWindow();
    setMainWindow(mainWindow);
    setCreateWindow(() => {
      createWindow();
      setMainWindow(mainWindow);
      mainWindow.show();
      return mainWindow;
    });
    refreshTray();

    // ── Startup flow ──────────────────────────────────────────────
    // 1. Health check → if healthy, skip straight to main window
    // 2. Not healthy but installed → start service, then go to main
    // 3. Not installed at all → show splash for installation
    // ──────────────────────────────────────────────────────────────

    const serviceReady = await slpService.checkHealth();

    if (serviceReady) {
      // Service is already running (local or external) — go straight to main
      console.log('[SLP] Service healthy — skipping to main window');

      // Ensure DB reflects that install is complete
      if (!database.isFullyInstalled()) {
        for (let step = 0; step < 4; step++) {
          database.setInstallStepComplete(step);
        }
      }

      const baseUrl = slpService.getLocalBaseUrl();
      refreshTray();

      // Check if bootstrap is needed (e.g. no projects yet)
      let needsBootstrap = false;
      try {
        const http = require('http');
        const url = new URL(`${baseUrl}/v1/projects`);
        const projects = await new Promise((resolve) => {
          http.get({ hostname: url.hostname, port: url.port, path: url.pathname }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
              try {
                const data = JSON.parse(body);
                resolve(Array.isArray(data) ? data : (data?.projects || []));
              } catch { resolve([]); }
            });
          }).on('error', () => resolve([]));
        });
        needsBootstrap = projects.length === 0;
      } catch {
        needsBootstrap = true;
      }

      if (needsBootstrap) {
        console.log('[SLP] No projects — running bootstrap on splash');
        createStartingSplash();
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.executeJavaScript(`
            document.querySelector('.status-text').textContent = 'Downloading model...';
          `);
        }
        (async () => {
          try {
            await bootstrapSlpService(baseUrl);
            refreshTray();
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.close();
              splashWindow = null;
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              setAppReady(true);
              mainWindow.show();
              mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
            }
          } catch (error) {
            console.error('[SLP] Bootstrap failed:', error.message);
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.close();
              splashWindow = null;
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              setAppReady(true);
              mainWindow.show();
            }
          }
        })();
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) {
          setAppReady(true);
          mainWindow.show();
          mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
        }
      }
    } else if (fs.existsSync(slpService.getSlpBinaryPath())) {
      // Not healthy but binary is installed — show splash, start service, then show app
      console.log('[SLP] Service not running but binary found — starting service...');

      if (!database.isFullyInstalled()) {
        for (let step = 0; step < 4; step++) {
          database.setInstallStepComplete(step);
        }
      }

      createStartingSplash();

      (async () => {
        try {
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.executeJavaScript(`
              document.querySelector('.status-text').textContent = 'Heating things up...';
            `);
          }
          const serviceStarted = await slpService.startService();
          if (!serviceStarted) {
            console.error('[SLP] Service failed to start');
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.close();
              splashWindow = null;
            }
            return;
          }

          const baseUrl = slpService.getLocalBaseUrl();
          refreshTray();

          // Service is healthy — dismiss splash, show main window
          let needsBootstrap = false;
          try {
            const http = require('http');
            const url = new URL(`${baseUrl}/v1/projects`);
            const projects = await new Promise((resolve) => {
              http.get({ hostname: url.hostname, port: url.port, path: url.pathname }, (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => {
                  try {
                    const data = JSON.parse(body);
                    resolve(Array.isArray(data) ? data : (data?.projects || []));
                  } catch { resolve([]); }
                });
              }).on('error', () => resolve([]));
            });
            needsBootstrap = projects.length === 0;
          } catch {
            needsBootstrap = true;
          }

          if (needsBootstrap) {
            console.log('[SLP] No projects — running bootstrap on splash');
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.webContents.executeJavaScript(`
                document.querySelector('.status-text').textContent = 'Downloading model...';
              `);
            }
            await bootstrapSlpService(baseUrl);
          }

          // Bootstrap done (or not needed) — dismiss splash, show main window
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            setAppReady(true);
            mainWindow.show();
            mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
          }
        } catch (error) {
          console.error('[SLP] Service start failed:', error.message);
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
          }
        }
      })();
    } else {
      // First launch — show splash for installation
      console.log('[SLP] First launch — showing install splash...');
      createSplashScreen();

      (async () => {
        try {
          // Step 1: Download SLP binary
          const setupResult = await setupSlpService((progress) => {
            updateSplashProgress(progress);
          });

          // Step 2: Start the service
          updateSplashProgress({ status: 'preparing', message: 'Starting service. This might take a while...' });

          const serviceStarted = await slpService.startService();
          if (!serviceStarted) {
            console.error('[SLP] Service failed to start');
            updateSplashProgress({ status: 'error', message: 'Failed to start service. Please restart the app.' });
            return;
          }

          const baseUrl = slpService.getLocalBaseUrl();
          refreshTray();

          // Run bootstrap on splash screen before showing main window
          await bootstrapSlpService(baseUrl);

          // Bootstrap done — dismiss splash, show main window ready
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            setAppReady(true);
            mainWindow.show();
            mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
          }
        } catch (error) {
          console.error('[SLP] Setup failed:', error.message);
          updateSplashProgress({ status: 'error', message: 'Setup failed. Please restart the app.' });
        }
      })();
    }

    app.on('activate', () => {
      // Don't show main window while splash screen is still active
      if (splashWindow && !splashWindow.isDestroyed()) return;

      if (mainWindow) {
        mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      } else if (BrowserWindow.getAllWindows().length === 0) {
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

    // Handle all other deep links (including "open", "oauth/callback") - just focus the window
    // Tokens are delivered via localhost POST, no need to handle them via URL scheme
    console.log('[Deep Link] Focusing window for:', pathname);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
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

app.on('before-quit', (event) => {
  app.isQuitting = true;
  database.closeDatabase();
  slpService.stopService();
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
