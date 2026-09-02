// Initialize logging first so everything below (including early startup
// failures) is captured to the OS-standard log file. Overrides console.*.
require('./logger');
const { app, BrowserWindow, Menu, screen, shell, ipcMain, dialog, nativeTheme } = require('electron');
const { setupTitlebarAndAttachToWindow } = require('custom-electron-titlebar/main');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const AdmZip = require('adm-zip');
const Store = require('electron-store').default || require('electron-store');
const { machineId, machineIdSync } = require('node-machine-id');
const { setupSlpService, uninstallSlpService, needsInstall, verifyFramework, VERSION, listInstalledVersions, switchVersion, getCurrentVersion, checkRemoteArchiveHash, getInstallDir, setInstallDir, getCommandLineStatus, installCommandLine, uninstallCommandLine } = require('./slp-setup');
const { isSandboxed, useBundledSlp, bundledModelFiles, hasBundledModel } = require('./build-mode');
const database = require('./database');
const { createTray, destroyTray, setMainWindow, setCreateWindow, setAppReady, refreshTray, setTrayProgress, setSetupHandler } = require('./tray');
const slpService = require('./slp-service');
const healthMonitor = require('./health-monitor');
const releaseChecker = require('./release-checker');

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
// Marketing-site intake the in-app contact form posts to. The request runs here
// in the main process, not the renderer: the endpoint sends no
// Access-Control-Allow-Origin, so a renderer fetch is blocked by Chromium.
const CONTACT_API_URL = process.env.VITE_CONTACT_API_URL || 'https://smartloop.ai/api/early-access';

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
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// Submit the in-app contact form. Keeping this in main means the app never
// links out to a web form (which App Store review treats poorly) and sidesteps
// the endpoint's missing CORS headers. Returns { success } or { success: false, error }.
ipcMain.handle('contact-submit', async (event, payload) => {
  const name = String(payload?.name || '').trim();
  const email = String(payload?.email || '').trim();
  const notes = String(payload?.notes || '').trim();

  if (!name || !email || !notes) {
    return { success: false, error: 'Name, email and message are all required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'That email address doesn\'t look right.' };
  }

  try {
    const res = await fetch(CONTACT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, notes }),
    });

    if (res.ok) return { success: true };

    // Surface the server's own message when it sends one; a bare status is
    // useless to the person staring at the form.
    const detail = await res.json().catch(() => null);
    const message = detail?.error || detail?.message || detail?.detail;
    console.warn('[Contact] Submit failed:', res.status, message || '(no message)');
    return { success: false, error: message || `Couldn't send your message (${res.status}). Please try again.` };
  } catch (err) {
    console.error('[Contact] Error submitting form:', err.message);
    return { success: false, error: 'Could not reach Smartloop. Check your connection and try again.' };
  }
});

// Open a folder in the system file manager (Finder on macOS)
// Expand a leading ~ to the home directory. Paths reach the main process from
// the renderer and from SLP responses in both forms.
function resolveHomePath(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.replace(/^~[/\\]?/, '')) : p;
}

// Chromium launches the platform opener (xdg-open, Finder, Explorer) with the
// target's PARENT DIRECTORY as the child process's working directory. If that
// directory is missing the launch fails a CHECK — "Check failed:
// chdir(current_directory) == 0" — which aborts the whole app, not just the
// open. So nothing may reach shell.openPath / showItemInFolder unverified.
function pathOpenable(resolved) {
  try {
    return fs.existsSync(resolved) && fs.existsSync(path.dirname(resolved));
  } catch (err) {
    return false;
  }
}

ipcMain.handle('open-in-finder', async (event, folderPath, options) => {
  if (folderPath) {
    const resolved = resolveHomePath(folderPath);
    // SLP creates a project's directory lazily — on the first document or file
    // written into it — so a fresh project points at a path that isn't on disk
    // yet and shell.openPath would fail ("No such file or directory"). Callers
    // opening a project directory pass createIfMissing so the click lands
    // somewhere real; file paths (citations, downloads) never do.
    if (options?.createIfMissing && !fs.existsSync(resolved)) {
      try {
        fs.mkdirSync(resolved, { recursive: true });
      } catch (err) {
        console.warn('[open-in-finder] Failed to create', resolved, err.message);
        return false;
      }
    }
    if (!pathOpenable(resolved)) {
      console.warn('[open-in-finder] Path does not exist:', resolved);
      return false;
    }
    await shell.openPath(resolved);
    return true;
  }
  return false;
});

// Open a document reference (citation) with the system's native viewer
ipcMain.handle('open-document-reference', async (event, filePath, documentId, projectId) => {
  console.log('[Document Reference] Opening:', { filePath, documentId, projectId });
  if (filePath) {
    const resolved = resolveHomePath(filePath);
    if (!pathOpenable(resolved)) {
      console.warn('[Document Reference] File no longer exists:', resolved);
      return { success: false, error: 'File no longer exists on disk' };
    }
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

// Reveal a file in Finder / Explorer
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  if (filePath) {
    const resolved = resolveHomePath(filePath);
    if (!pathOpenable(resolved)) {
      console.warn('[show-item-in-folder] Path does not exist:', resolved);
      return false;
    }
    shell.showItemInFolder(resolved);
    return true;
  }
  return false;
});

// IPC: download (save a copy of) an existing local file to a user-chosen location
ipcMain.handle('download-document', async (event, filePath) => {
  try {
    if (!filePath) return { success: false, error: 'No file path' };
    const { app, dialog } = require('electron');
    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.replace(/^~[/\\]?/, ''))
      : filePath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' };

    const fileName = path.basename(resolved);
    const ext = path.extname(fileName).replace('.', '');
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [
        ...(ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : []),
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    fs.copyFileSync(resolved, result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Initialize electron-store
const store = new Store({ name: 'smartloop-studio', encryptionKey: machineIdSync() });

// SLP data directory — SLP's home (SLP_HOME), not where the framework lives:
// the framework runs in place from inside the app on every platform, so this
// holds only the state SLP itself manages (server.port, server.log, config,
// models, workspaces, studio.db). In the Developer-ID build (dmg), Windows and
// Linux it stays ~/.smartloop/ (the default inside slp-setup), a consistent,
// well-known location. In the sandboxed Mac App Store build the app may only
// write inside its container, so relocate all SLP state under userData
// (~/Library/Containers/ai.smartloop.studio/Data/…).
if (isSandboxed()) {
  const slpDataDir = path.join(app.getPath('userData'), 'slp');
  setInstallDir(slpDataDir);
  console.log('[SLP] Sandboxed build — SLP data dir relocated to container:', slpDataDir);
}

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

// The titlebar is built in the preload before React exists, so it cannot wait
// on a promise for its color without painting a wrong one first. Sync by
// design, and cheap: one already-loaded store read. Same source as the native
// window's backgroundColor and the splash, so all three start in one color.
ipcMain.on('get-theme-base-color-sync', (event) => {
  try {
    event.returnValue = getPersistedBaseColor();
  } catch {
    event.returnValue = null;
  }
});

ipcMain.handle('set-native-theme', (event, mode, bgColor) => {
  nativeTheme.themeSource = mode === 'light' ? 'light' : 'dark';
  if (mainWindow && bgColor) {
    mainWindow.setBackgroundColor(bgColor);
  }
});

// IPC: save a file buffer to a temp directory so the local SLP service can read it by path
ipcMain.handle('save-temp-file', async (event, fileName, buffer) => {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

// IPC: read an uploaded SLP image asset (stored at ~/.smartloop/assets/<asset_id>/original.<ext>)
// as a data URL so the renderer can display image attachments inline
ipcMain.handle('read-asset-data-url', async (event, assetId) => {
  try {
    if (!/^[a-zA-Z0-9-]+$/.test(assetId || '')) return { success: false, error: 'Invalid asset id' };
    const assetDir = path.join(slpService.getSlpDir(), 'assets', assetId);
    const metaPath = path.join(assetDir, 'metadata.json');
    if (!fs.existsSync(metaPath)) return { success: false, error: 'Asset not found' };
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (!meta.image || !['image/png', 'image/jpeg'].includes(meta.content_type)) {
      return { success: false, error: 'Not an image asset' };
    }
    const original = fs.readdirSync(assetDir).find((f) => f.startsWith('original.'));
    if (!original) return { success: false, error: 'Asset file not found' };
    const data = fs.readFileSync(path.join(assetDir, original));
    return { success: true, dataUrl: `data:${meta.content_type};base64,${data.toString('base64')}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
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

// IPC: write a text file to a specific path on disk
ipcMain.handle('write-text-file', async (event, filePath, content) => {
  try {
    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.replace(/^~[/\\]?/, ''))
      : filePath;
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true, filePath: resolved };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: save file via native save dialog
ipcMain.handle('save-file-dialog', async (event, defaultName, content, defaultDir) => {
  try {
    const { dialog } = require('electron');
    let resolvedDir = defaultDir;
    if (resolvedDir && resolvedDir.startsWith('~')) {
      resolvedDir = path.join(os.homedir(), resolvedDir.replace(/^~[/\\]?/, ''));
    }
    if (resolvedDir) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
    const defaultPath = resolvedDir ? path.join(resolvedDir, defaultName) : defaultName;
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: save binary file via native save dialog (defaults to Downloads)
ipcMain.handle('save-binary-file', async (event, fileName, buffer) => {
  try {
    const { app, dialog } = require('electron');
    const downloadsDir = app.getPath('downloads');
    const defaultPath = path.join(downloadsDir, fileName);
    const ext = path.extname(fileName).replace('.', '');
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    fs.writeFileSync(result.filePath, Buffer.from(buffer));
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

// IPC: rename a folder on disk
ipcMain.handle('rename-folder', async (event, oldPath, newPath) => {
  try {
    const resolvedOld = oldPath.startsWith('~')
      ? path.join(os.homedir(), oldPath.replace(/^~[/\\]?/, ''))
      : oldPath;
    const resolvedNew = newPath.startsWith('~')
      ? path.join(os.homedir(), newPath.replace(/^~[/\\]?/, ''))
      : newPath;
    if (!fs.existsSync(resolvedOld)) return { success: false, error: 'Source folder not found' };
    if (fs.existsSync(resolvedNew)) return { success: false, error: 'Destination folder already exists' };
    fs.renameSync(resolvedOld, resolvedNew);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: list supported document files from a directory
// IPC: read all skills from <folderPath>/skills/<skillName>/SKILL.md
ipcMain.handle('read-skills-dir', async (event, folderPath) => {
  try {
    const resolved = folderPath.startsWith('~')
      ? path.join(os.homedir(), folderPath.replace(/^~[/\\]?/, ''))
      : folderPath;
    const dir = path.join(resolved, 'skills');
    if (!fs.existsSync(dir)) return { success: true, skills: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(dir, entry.name);
      // Prefer SKILL.md, fall back to any .md file in the subfolder
      const mdFiles = fs.readdirSync(skillDir).filter(f => f.toLowerCase().endsWith('.md'));
      if (mdFiles.length === 0) continue;
      const preferred = mdFiles.find(f => f === 'SKILL.md') || mdFiles[0];
      const content = fs.readFileSync(path.join(skillDir, preferred), 'utf-8');
      // Parse display name from YAML frontmatter or first heading
      const frontmatterName = content.match(/^---[\s\S]*?\bname:\s*(.+)/m)?.[1]?.trim();
      const headingName = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
      const name = frontmatterName || headingName || entry.name;
      const description = content.match(/^---[\s\S]*?\bdescription:\s*(.+)/m)?.[1]?.trim() || '';
      skills.push({ id: entry.name, name, folderName: entry.name, content, description });
    }
    return { success: true, skills };
  } catch (err) {
    return { success: false, error: err.message, skills: [] };
  }
});

ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    const resolved = dirPath.startsWith('~')
      ? path.join(os.homedir(), dirPath.replace(/^~[/\\]?/, ''))
      : dirPath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'Directory not found', files: [] };
    const supportedExts = ['.pdf', '.docx', '.txt', '.csv', '.md'];
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

// IPC: extract conversations from a zip file (reads workspace.json or falls back to conversations/*.jsonl)
// ── Zip handling ─────────────────────────────────────────────────────────
// In-process, via adm-zip. These used to shell out — `tar` on Windows, `unzip`
// / `zip` everywhere else — which failed two ways:
//   - Linux ships GNU tar, which cannot read a zip at all ("This does not look
//     like a tar archive") and, worse, ignores `-a` on write and emits a TAR
//     named .zip. `unzip`/`zip` are not installed by default on many distros
//     either, so creating a project died on `spawnSync unzip ENOENT`.
//   - The sandboxed MAS build cannot exec system binaries.
// Nothing here spawns a process, so every platform behaves the same.

// Read one member's text, matching either an exact name or any depth-1 wrapper
// (`*/name`) — exported archives sometimes carry a single top-level directory.
function readZipEntryText(zipFilePath, entryName) {
  const zip = new AdmZip(zipFilePath);
  const entry = zip.getEntry(entryName)
    || zip.getEntries().find((e) => !e.isDirectory && e.entryName.endsWith(`/${entryName}`));
  return entry ? zip.readAsText(entry) : null;
}

// Every file member's path within the archive.
function listZipEntries(zipFilePath) {
  return new AdmZip(zipFilePath).getEntries()
    .filter((e) => !e.isDirectory)
    .map((e) => e.entryName);
}

// Extract the whole archive into targetDir, overwriting what is there.
function extractZip(zipFilePath, targetDir) {
  new AdmZip(zipFilePath).extractAllTo(targetDir, true);
}

// Zip a directory's contents, with entries at the archive root (no "./" prefix
// and no wrapper dir — the SLP import API expects files at the top level).
// Finder droppings are skipped at every depth, not just the top.
const ZIP_JUNK = /(^|[/\\])(\.DS_Store|__MACOSX)([/\\]|$)/;
function zipDirectory(sourceDir, zipFilePath) {
  const zip = new AdmZip();
  const keep = (entryPath) => !ZIP_JUNK.test(entryPath);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!keep(entry.name)) continue;
    const full = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) zip.addLocalFolder(full, entry.name, keep);
    else zip.addLocalFile(full);
  }
  zip.writeZip(zipFilePath);
}

ipcMain.handle('extract-conversations-from-zip', async (event, zipPath) => {
  try {
    const resolved = zipPath.startsWith('~')
      ? path.join(os.homedir(), zipPath.replace(/^~[/\\]?/, ''))
      : zipPath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found', conversations: [] };

    // Try reading workspace.json (v3+), project.json (v2), or manifest.json (SLP template) from the zip
    for (const manifestName of ['workspace.json', 'project.json', 'manifest.json']) {
      try {
        const content = readZipEntryText(resolved, manifestName);
        if (content && content.trim()) {
          const manifest = JSON.parse(content);
          if (manifest.conversations && manifest.conversations.length > 0) {
            const conversations = manifest.conversations.map((conv, i) => {
              const firstUserMsg = (conv.messages || []).find(m => m.role === 'user');
              const title = conv.title || (firstUserMsg?.content
                ? (firstUserMsg.content.length > 60 ? firstUserMsg.content.substring(0, 60) + '...' : firstUserMsg.content)
                : 'Imported Conversation');
              return { id: conv.id || `conv_preview_${i}`, title, messages: conv.messages || [] };
            });
            return { success: true, conversations };
          }
        }
      } catch {
        // manifest not found in zip, try next
      }
    }

    // Legacy fallback: read conversations/*.jsonl entries
    const conversationFiles = listZipEntries(resolved)
      .filter(name => /conversations\/[^/]+\.jsonl$/.test(name));

    const conversations = [];
    for (const filePath of conversationFiles) {
      try {
        const content = readZipEntryText(resolved, filePath) || '';
        const lines = content.split('\n').filter(l => l.trim());
        const messages = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const convId = path.basename(filePath, '.jsonl');
        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg?.content
          ? (firstUserMsg.content.length > 60 ? firstUserMsg.content.substring(0, 60) + '...' : firstUserMsg.content)
          : 'Imported Conversation';
        conversations.push({ id: convId, title, messages });
      } catch (e) {
        console.warn(`[Import] Failed to read ${filePath}:`, e.message);
      }
    }
    return { success: true, conversations };
  } catch (err) {
    console.error('[Import] Error extracting conversations:', err.message);
    return { success: false, error: err.message, conversations: [] };
  }
});

// Helper: recursively copy a directory, optionally skipping certain subdirectory names
function copyDirRecursive(src, dest, skipDirs = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      copyDirRecursive(srcPath, destPath, skipDirs);
    } else {
      if (entry.name === '.DS_Store') continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper: the SLP config.json (SLP_HOME/config.json), or null if unreadable.
function readSlpConfig() {
  try {
    const configPath = path.join(slpService.getSlpDir(), 'config.json');
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

// Helper: the active workspace directory (SLP_HOME/<workspaceId>), which is
// where SLP keeps per-project dirs, the models dir, and workspace.db. Prefer
// the explicit workspace_dir config.json records; fall back to the conventional
// SLP_HOME/<workspaceId>. Null when there is no workspace yet.
function getWorkspaceDir() {
  const config = readSlpConfig();
  const recorded = config?.workspace?.workspace_dir;
  if (recorded) return resolveHomePath(recorded);
  const workspaceId = config?.workspace?.id;
  return workspaceId ? path.join(slpService.getSlpDir(), workspaceId) : null;
}

// Helper: read the SLP config.json and find the workspace project directory for
// a given project ID. Returns null unless the directory is actually on disk —
// callers that need the intended path for a project SLP hasn't materialized yet
// want resolveProjectDir() instead.
function getSlpProjectDir(projectId) {
  const config = readSlpConfig();
  if (!config) return null;
  const match = (config?.workspace?.projects || []).find(p => p.id === projectId);
  if (match?.project_dir && fs.existsSync(match.project_dir)) return match.project_dir;
  const workspaceDir = getWorkspaceDir();
  if (!workspaceDir) return null;
  const conventionalDir = path.join(workspaceDir, projectId);
  return fs.existsSync(conventionalDir) ? conventionalDir : null;
}

/**
 * Where a project's files live: <SLP_HOME>/<workspaceId>/<projectId>.
 *
 * NOT health.cwd + projectId. health.cwd is SLP_HOME (~/.smartloop) — the
 * workspace id sits between it and the project dir, so joining the two gave a
 * path one level too high. Nothing was there, and because the folder button
 * opens with createIfMissing the click silently created an empty directory
 * beside SLP's own state and opened that instead of the project. The same value
 * is sent as `cwd` on every chat turn, so file/shell skills were pointed at the
 * empty directory too.
 *
 * SLP creates a project's directory lazily (first document or file written), so
 * fall back to the conventional path when it isn't on disk yet rather than
 * giving up — that is the path SLP will use, and the one to create on click.
 * apiCwd (the API's own `cwd` field) is the last resort; it is usually "".
 */
function resolveProjectDir(projectId, apiCwd) {
  if (!projectId) return apiCwd || null;
  const onDisk = getSlpProjectDir(projectId);
  if (onDisk) return onDisk;
  const workspaceDir = getWorkspaceDir();
  if (workspaceDir) return path.join(workspaceDir, projectId);
  return apiCwd || null;
}

// IPC: export a project via SLP API + SQLite state
ipcMain.handle('export-project', async (event, projectId) => {
  try {
    const project = database.getProject(projectId);
    if (!project) return { success: false, error: 'Project not found' };

    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) return { success: false, error: 'Local service is not running' };

    const tmpDir = os.tmpdir();
    const exportDir = path.join(tmpDir, `smartloop-export-${projectId}-${Date.now()}`);
    fs.mkdirSync(exportDir, { recursive: true });

    // Call SLP export API to get the base zip (project data, documents, config)
    const exportRes = await fetch(`${baseUrl}/v1/projects/${projectId}/export`, { method: 'POST' });
    if (!exportRes.ok) {
      fs.rmSync(exportDir, { recursive: true, force: true });
      return { success: false, error: `Export failed (${exportRes.status})` };
    }

    const slpZipPath = path.join(tmpDir, `slp-export-${projectId}.zip`);
    const arrayBuf = await exportRes.arrayBuffer();
    fs.writeFileSync(slpZipPath, Buffer.from(arrayBuf));
    extractZip(slpZipPath, exportDir);
    fs.unlinkSync(slpZipPath);

    // Augment with SQLite state (conversations, messages, MCP servers, folders, tabs)
    const conversations = database.getConversations(projectId);
    const conversationsWithMessages = conversations.map(conv => ({
      ...conv,
      messages: database.getMessages(conv.id),
    }));
    const mcpServers = database.getMcpServersByProject(projectId);
    const folders = database.listFoldersByProject(projectId);
    const documentFolders = database.getDocumentFoldersByProject(projectId);
    const documentStatus = database.getDocumentStatusByProject(projectId);
    const tabState = database.getSetting(`openTabs_${projectId}`);

    const workspace = {
      version: 3,
      exported_at: new Date().toISOString(),
      project: {
        name: project.name,
        color: project.color,
        temperature: project.temperature,
      },
      conversations: conversationsWithMessages.map(conv => ({
        title: conv.title,
        messages: conv.messages.map(m => ({
          role: m.role,
          content: m.content,
          citations: m.citations || null,
          created_at: m.created_at,
        })),
        created_at: conv.created_at,
        updated_at: conv.updated_at,
      })),
      mcp_servers: mcpServers.map(s => ({
        name: s.name,
        server_type: s.server_type,
        config: s.config,
      })),
      folders: folders.map(f => ({
        id: f.id,
        name: f.name,
      })),
      document_folders: documentFolders,
      document_status: documentStatus,
      tab_state: tabState || null,
    };

    fs.writeFileSync(path.join(exportDir, 'workspace.json'), JSON.stringify(workspace, null, 2));

    const slugName = (project.name || 'project').replace(/\s+/g, '_').toLowerCase();
    const zipFileName = `${slugName}.zip`;
    const zipPath = path.join(tmpDir, zipFileName);

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    zipDirectory(exportDir, zipPath);
    fs.rmSync(exportDir, { recursive: true, force: true });

    const downloadsDir = require('electron').app.getPath('downloads');
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(downloadsDir, zipFileName),
      filters: [{ name: 'ZIP', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled || !result.filePath) {
      fs.unlinkSync(zipPath);
      return { success: false, error: 'Cancelled' };
    }

    fs.copyFileSync(zipPath, result.filePath);
    fs.unlinkSync(zipPath);

    return { success: true, filePath: result.filePath };
  } catch (err) {
    console.error('[Export] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// IPC: import a project via SLP API + SQLite state restoration
ipcMain.handle('import-project', async (event, zipPath, overrides) => {
  try {
    const resolved = zipPath.startsWith('~')
      ? path.join(os.homedir(), zipPath.replace(/^~[/\\]?/, ''))
      : zipPath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' };

    const tmpDir = path.join(os.tmpdir(), `smartloop-import-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    extractZip(resolved, tmpDir);

    // If the zip contains a single top-level directory, unwrap it
    let contentDir = tmpDir;
    const topEntries = fs.readdirSync(tmpDir).filter(e => e !== '__MACOSX' && e !== '.DS_Store');
    if (topEntries.length === 1 && fs.statSync(path.join(tmpDir, topEntries[0])).isDirectory()) {
      contentDir = path.join(tmpDir, topEntries[0]);
    }

    const workspacePath = path.join(contentDir, 'workspace.json');
    const legacyProjectPath = path.join(contentDir, 'project.json');
    const legacyManifestPath = path.join(contentDir, 'manifest.json');
    let manifest = null;
    const manifestFile = [workspacePath, legacyProjectPath, legacyManifestPath].find(p => fs.existsSync(p)) || null;
    if (manifestFile) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
      } catch (e) {
        console.warn('[Import] Failed to parse workspace manifest:', e.message);
      }
    }

    const projectName = overrides?.name || manifest?.project?.name || 'Imported Project';
    const projectColor = overrides?.color || manifest?.project?.color || null;

    // Register the project with the SLP backend via its import API
    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return { success: false, error: 'Local service is not running' };
    }

    // If the zip had a nested top-level directory, repack from contentDir so backend sees files at root
    let importZipPath = resolved;
    if (contentDir !== tmpDir) {
      importZipPath = path.join(tmpDir, 'repacked-import.zip');
      zipDirectory(contentDir, importZipPath);
    }

    const fileBuffer = fs.readFileSync(importZipPath);
    const fileName = path.basename(resolved);
    const file = new File([fileBuffer], fileName, { type: 'application/zip' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', projectName);

    const importRes = await fetch(`${baseUrl}/v1/projects/import`, {
      method: 'POST',
      body: formData,
    });

    if (!importRes.ok) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      const err = await importRes.json().catch(() => ({}));
      return { success: false, error: err.detail || err.message || `Import failed (${importRes.status})` };
    }

    const createdProject = await importRes.json();
    const newProjectId = createdProject.id;
    const resolvedFolderPath = resolveProjectDir(newProjectId, createdProject.cwd) || overrides?.cwd;

    // Save UI metadata (display name, color) to SQLite
    database.upsertProject({
      id: newProjectId,
      name: projectName,
      color: projectColor,
      temperature: manifest?.project?.temperature ?? 0.3,
      system: false,
      folder_path: resolvedFolderPath,
    });

    const importedTabs = [];

    if (manifest && manifest.conversations) {
      for (const conv of manifest.conversations) {
        const newConvId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        database.createConversation({
          id: newConvId,
          title: conv.title,
          project_id: newProjectId,
        });
        if (conv.messages && conv.messages.length > 0) {
          const messages = conv.messages.map(m => ({
            ...m,
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          }));
          database.addMessages(newConvId, messages);
        }
        importedTabs.push({ id: `conv-${newConvId}`, type: 'conversation', title: conv.title });
      }

      if (manifest.mcp_servers) {
        for (const server of manifest.mcp_servers) {
          const newId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          database.addMcpServer({
            id: newId,
            project_id: newProjectId,
            name: server.name,
            server_type: server.server_type,
            config: server.config,
          });
        }
      }

      if (manifest.folders && manifest.folders.length > 0) {
        const folderIdMap = {};
        for (const folder of manifest.folders) {
          const newFolderId = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          database.createFolder({
            id: newFolderId,
            project_id: newProjectId,
            name: folder.name,
          });
          folderIdMap[folder.id] = newFolderId;
        }

        if (manifest.document_folders) {
          for (const [docId, oldFolderId] of Object.entries(manifest.document_folders)) {
            const newFolderId = folderIdMap[oldFolderId];
            if (newFolderId) {
              database.setDocumentFolder({
                document_id: docId,
                project_id: newProjectId,
                folder_id: newFolderId,
              });
            }
          }
        }
      }

      // Note: document_status from manifest uses old document IDs that won't match
      // the new project's API documents, so we skip restoring them.
    }

    if (importedTabs.length > 0) {
      database.setSetting(`openTabs_${newProjectId}`, {
        tabs: importedTabs,
        activeTabId: importedTabs[0].id,
      });
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });

    const project = database.getProject(newProjectId);
    return { success: true, project };
  } catch (err) {
    console.error('[Import] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// IPC: select a file using native dialog (filtered by extensions)
ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select File',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC: read a file as binary (returns ArrayBuffer)
ipcMain.handle('read-binary-file', async (event, filePath) => {
  try {
    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.replace(/^~[/\\]?/, ''))
      : filePath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' };
    const buffer = fs.readFileSync(resolved);
    return { success: true, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  } catch (err) {
    return { success: false, error: err.message };
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

// Blank project template — downloaded from GitHub releases and cached locally
const TEMPLATE_VERSION = 'v1.0.0';
const TEMPLATE_RELEASE_URL = `https://github.com/smartloop-ai/blank-project-template/archive/refs/tags/${TEMPLATE_VERSION}.zip`;
const TEMPLATE_CACHE_DIR = path.join(slpService.getSlpDir(), 'templates');
const TEMPLATE_CACHE_PATH = path.join(TEMPLATE_CACHE_DIR, 'project_1.zip');

/**
 * The template that ships inside the app, if this build has one.
 *
 * electron/data/ is copied to Resources/data/ at package time, so a packaged
 * build carries it; a source checkout falls back to the repo copy, which
 * `make stage-template` fills in.
 */
function bundledTemplatePath() {
  const packaged = path.join(process.resourcesPath || '', 'data', 'templates', 'project_1.zip');
  if (fs.existsSync(packaged)) return packaged;
  const local = path.join(__dirname, 'data', 'templates', 'project_1.zip');
  return fs.existsSync(local) ? local : null;
}

async function downloadBlankTemplate() {
  if (fs.existsSync(TEMPLATE_CACHE_PATH)) return TEMPLATE_CACHE_PATH;

  fs.mkdirSync(TEMPLATE_CACHE_DIR, { recursive: true });

  // Ships in the installer, so the usual case is a copy rather than a fetch.
  // It is 7 KB — the download only ever existed because nothing had put it in
  // the bundle.
  const bundled = bundledTemplatePath();
  if (bundled) {
    try {
      fs.copyFileSync(bundled, `${TEMPLATE_CACHE_PATH}.seeding`);
      fs.renameSync(`${TEMPLATE_CACHE_PATH}.seeding`, TEMPLATE_CACHE_PATH);
      console.log('[Template] Copied the bundled project template');
      return TEMPLATE_CACHE_PATH;
    } catch (error) {
      console.warn('[Template] Could not copy the bundled template:', error.message);
    }
  }

  console.log('[Template] Downloading blank project template...');
  // No byte counts: GitHub builds release zips on demand and answers
  // content-length: 0, so a progress bar here can only ever sit at zero.
  updateSplashProgress({ status: 'preparing', message: 'Preparing project template...' });

  const res = await fetch(TEMPLATE_RELEASE_URL);
  if (!res.ok) {
    console.warn(`[Template] Failed to download template (${res.status})`);
    return null;
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  const chunks = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    if (contentLength) {
      updateSplashProgress({ status: 'downloading', message: 'Preparing project template...', downloaded, total: contentLength });
    }
  }

  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(TEMPLATE_CACHE_PATH, buffer);
  console.log('[Template] Template cached at', TEMPLATE_CACHE_PATH);
  return TEMPLATE_CACHE_PATH;
}

ipcMain.handle('get-template-zip-path', async () => {
  if (fs.existsSync(TEMPLATE_CACHE_PATH)) return TEMPLATE_CACHE_PATH;
  return downloadBlankTemplate();
});

// --- SQLite database IPC handlers ---

// Projects
ipcMain.handle('db-upsert-project', (event, project) => database.upsertProject(project));
ipcMain.handle('db-get-project', (event, id) => database.getProject(id));
ipcMain.handle('db-get-all-projects', () => database.getAllProjects());
ipcMain.handle('db-update-project', (event, id, updates) => database.updateProject(id, updates));
ipcMain.handle('db-delete-project', (event, id) => database.deleteProject(id));

// --- Projects: centralized /v1/projects access (source of truth for the
// projects list + CRUD). The renderer talks to these via electronAPI.projects.*
// and refreshes off the `projects-changed` broadcast. UI-only metadata
// (display name, color, folder_path) lives in the SQLite `projects` table. ---

// Broadcast a single "something changed" signal; the renderer refetches once.
function broadcastProjectsChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projects-changed');
  }
}

// Merge the API's project list with local UI metadata from SQLite.
function enrichProjects(apiProjects) {
  const localMeta = database.getAllProjects();
  const metaMap = new Map(localMeta.map((m) => [m.id, m]));

  const enriched = apiProjects.map((p) => {
    const meta = metaMap.get(p.id);
    // Workspace project dir → API cwd → local DB folder_path
    const folderPath = resolveProjectDir(p.id, p.cwd) || meta?.folder_path || null;

    // Ensure every project has a local metadata row so UI-only fields (color,
    // folder_path) can be persisted. The system "general_chat" project is created
    // by the SLP backend without a local row, so without this its color/label edits
    // would silently no-op (UPDATE ... WHERE id matches nothing).
    if (!meta) {
      database.upsertProject({ id: p.id, name: p.name, color: null, system: p.system, folder_path: folderPath });
    } else if (folderPath && meta.folder_path !== folderPath) {
      // Keep SQLite in step with the resolved path — it backfills a missing one
      // and repairs a stale one (rows written before project dirs were resolved
      // through the workspace point at a path that never existed).
      database.updateProject(p.id, { folder_path: folderPath });
    }

    // `instructions` is a local-only field (the SLP API has no concept of it) —
    // the renderer sends it as a system message on every chat turn.
    return { ...p, name: meta?.name || p.name, color: meta?.color || null, folder_path: folderPath, instructions: meta?.instructions || '' };
  });

  return enriched;
}

// Delete every document belonging to a project via the SLP API before the
// project itself is removed.
async function deleteProjectDocuments(baseUrl, projectId) {
  try {
    const res = await fetch(`${baseUrl}/v1/projects/${projectId}/documents`);
    if (!res.ok) return;
    const data = await res.json();
    const docs = Array.isArray(data) ? data : (Array.isArray(data?.documents) ? data.documents : []);
    for (const doc of docs) {
      if (doc?.id) {
        await fetch(`${baseUrl}/v1/projects/${projectId}/documents/${doc.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Projects] Error cleaning up documents during delete:', err.message);
  }
}

// GET /v1/projects, enriched. Returns { success: true, data } on a real answer, or
// { success: false, notReady: true } when the service can't answer yet.
ipcMain.handle('projects-list', async () => {
  // `notReady` distinguishes "the service can't answer yet" from a genuine empty list, so
  // the renderer never mistakes a startup race for "zero projects" and blanks the sidebar.
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, notReady: true };
  try {
    const res = await fetch(`${baseUrl}/v1/projects`);
    if (!res.ok) return { success: false, notReady: true };
    const data = await res.json();
    const projects = Array.isArray(data) ? data : (Array.isArray(data?.projects) ? data.projects : []);
    return { success: true, data: enrichProjects(projects) };
  } catch (err) {
    console.error('[Projects] Error listing projects:', err.message);
    return { success: false, notReady: true };
  }
});

// POST /v1/projects, then save UI metadata + auto-register a local MCP server.
ipcMain.handle('projects-create', async (event, params) => {
  try {
    const { name, color, system = false, model_name } = params || {};
    if (!name || !name.trim()) {
      return { success: false, error: 'Project name is required' };
    }

    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) return { success: false, error: 'Local API service is not ready' };

    const trimmedName = name.trim();
    const slug = trimmedName.toLowerCase().replace(/\s+/g, '_');
    const body = { name: slug, description: '', system };
    if (model_name) body.model_name = model_name;

    const res = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 200 || res.status === 201) {
      const project = await res.json();
      const folderPath = resolveProjectDir(project.id, project.cwd) || params.folder_path;

      database.upsertProject({ id: project.id, name: trimmedName, color, system, folder_path: folderPath });
      database.addMcpServer({
        id: `mcp_local_${project.id}`,
        project_id: project.id,
        name: slug,
        server_type: 'local',
        config: { name: slug },
      });

      broadcastProjectsChanged();
      return { success: true, data: { ...project, name: trimmedName, color, folder_path: folderPath } };
    }

    const errorData = await res.json().catch(() => ({}));
    return { success: false, error: errorData.detail || errorData.message || 'Failed to create project' };
  } catch (err) {
    console.error('[Projects] Error creating project:', err.message);
    return { success: false, error: err.message || 'An error occurred while creating the project' };
  }
});

// PATCH /v1/projects/{id}, then sync UI metadata.
ipcMain.handle('projects-update', async (event, projectId, updates) => {
  try {
    if (!projectId) return { success: false, error: 'Project ID is required' };

    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) return { success: false, error: 'Local API service is not ready' };

    // System projects (e.g. General) keep their name — drop any rename here so
    // every caller (UI, IPC, future automation) hits the same rule.
    const isSystemProject = !!database.getProject(projectId)?.system;
    const trimmedName = isSystemProject ? undefined : updates?.name?.trim();
    const apiUpdates = { ...updates };
    if (isSystemProject) delete apiUpdates.name;
    // Instructions live only in SQLite; the API would drop the field anyway.
    delete apiUpdates.instructions;
    if (trimmedName) apiUpdates.name = trimmedName.toLowerCase().replace(/\s+/g, '_');

    const res = await fetch(`${baseUrl}/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiUpdates),
    });

    if (res.status === 200) {
      const project = await res.json();
      const resolvedCwd = resolveProjectDir(projectId, project.cwd);

      const metaUpdates = {};
      if (trimmedName) metaUpdates.name = trimmedName;
      if (updates.color !== undefined) metaUpdates.color = updates.color;
      if (updates.instructions !== undefined) metaUpdates.instructions = updates.instructions;
      if (resolvedCwd) metaUpdates.folder_path = resolvedCwd;
      if (Object.keys(metaUpdates).length > 0) {
        database.updateProject(projectId, metaUpdates);
      }

      broadcastProjectsChanged();
      return { success: true, data: { ...project, name: trimmedName || project.name, color: updates.color ?? project.color, folder_path: resolvedCwd } };
    }

    const errorData = await res.json().catch(() => ({}));
    return { success: false, error: errorData.detail || errorData.message || 'Failed to update project' };
  } catch (err) {
    console.error('[Projects] Error updating project:', err.message);
    return { success: false, error: err.message || 'An error occurred while updating the project' };
  }
});

// DELETE /v1/projects/{id}, cascading local SQLite cleanup. Atomic, off-renderer.
ipcMain.handle('projects-delete', async (event, projectId) => {
  try {
    if (!projectId) return { success: false, error: 'Project ID is required' };

    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) return { success: false, error: 'Local API service is not ready' };

    await deleteProjectDocuments(baseUrl, projectId);

    const res = await fetch(`${baseUrl}/v1/projects/${projectId}`, { method: 'DELETE' });

    if (res.status === 200 || res.status === 204) {
      database.deleteConversationsByProject(projectId);
      database.deleteMcpServersByProject(projectId);
      database.deleteDocumentStatusByProject(projectId);
      database.deleteFoldersByProject(projectId);
      database.deleteProject(projectId);

      broadcastProjectsChanged();
      return { success: true, data: { projectId } };
    }

    const errorData = await res.json().catch(() => ({}));
    return { success: false, error: errorData.detail || errorData.message || 'Failed to delete project' };
  } catch (err) {
    console.error('[Projects] Error deleting project:', err.message);
    return { success: false, error: err.message || 'An error occurred while deleting the project' };
  }
});

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
ipcMain.handle('db-add-run-trace', (event, trace) => database.addRunTrace(trace));
ipcMain.handle('db-get-run-traces', (event, limit, projectId) => database.getRunTraces(limit, projectId));
ipcMain.handle('db-clear-run-traces', (event, projectId, keepIds) => database.clearRunTraces(projectId, keepIds));
ipcMain.handle('db-delete-run-trace', (event, messageId) => database.deleteRunTrace(messageId));

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
// Documents (local source of truth)
ipcMain.handle('db-add-document', (event, doc) => database.addDocument(doc));
ipcMain.handle('db-get-documents-by-project', (event, projectId) => database.getDocumentsByProject(projectId));
ipcMain.handle('db-update-document-status', (event, id, status) => database.updateDocumentStatus(id, status));
ipcMain.handle('db-update-document-id', (event, oldId, newId, status) => database.updateDocumentId(oldId, newId, status));
ipcMain.handle('db-delete-document', (event, id) => database.deleteDocument(id));
ipcMain.handle('db-delete-documents-by-project', (event, projectId) => database.deleteDocumentsByProject(projectId));

// --- Local SLP service helpers ---


// IPC: get framework version
ipcMain.handle('get-framework-version', () => VERSION);

// IPC: command-line (`slp`) install status + on-demand install of the PATH symlinks
ipcMain.handle('command-line-status', () => getCommandLineStatus());
ipcMain.handle('command-line-install', () => installCommandLine());
ipcMain.handle('command-line-uninstall', () => uninstallCommandLine());

// IPC: get local API URL
ipcMain.handle('get-local-api-url', async () => {
  return slpService.getLocalBaseUrl();
});

ipcMain.handle('get-slp-cwd', async () => {
  return slpService.getCwd();
});

// IPC: add document via local SLP (proxied through main process to avoid CORS/Broken Pipe)
// The POST endpoint returns an SSE stream with event types: queued, progress, done
ipcMain.handle('slp-add-document', async (event, filePath, projectId, cwd, generateFilename) => {
  const http = require('http');
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'SLP service not running' };

  // Markdown is uploaded but indexed as plain text: hand the backend a .txt so
  // it uses the text parser (the API reads `source` by file extension). Copy to
  // a temp .txt and clean it up once the request finishes (see resolve wrapper).
  // Preserve the original name via the `filename` field so the document list
  // keeps showing the .md name/extension instead of the internal .txt copy.
  let tmpTxt = null;
  let tmpDir = null;
  let displayName = filePath ? path.basename(filePath) : null;
  if (filePath && filePath.toLowerCase().endsWith('.md')) {
    try {
      // Unique temp dir so we can keep the original basename (no timestamp) —
      // the copy is `<name>.txt`, but `filename` below carries the real `<name>.md`.
      tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'slp-md-'));
      const tmp = path.join(tmpDir, `${path.basename(filePath, path.extname(filePath))}.txt`);
      fs.copyFileSync(filePath, tmp);
      filePath = tmp;
      tmpTxt = tmp;
    } catch { /* fall back to sending the .md as-is */ }
  }

  const docPath = projectId ? `/v1/projects/${projectId}/documents` : '/v1/documents';
  const url = new URL(`${baseUrl}${docPath}`);
  const bodyObj = { source: filePath };
  if (displayName) bodyObj.filename = displayName;
  if (cwd) bodyObj.cwd = cwd;
  if (generateFilename) bodyObj.generate_filename = true;
  const body = JSON.stringify(bodyObj);

  return new Promise((rawResolve) => {
    const resolve = (result) => {
      if (tmpTxt) { try { fs.unlinkSync(tmpTxt); } catch {} tmpTxt = null; }
      if (tmpDir) { try { fs.rmdirSync(tmpDir); } catch {} tmpDir = null; }
      rawResolve(result);
    };
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

/**
 * Run a command without blocking the main process. Resolves to stdout, or null
 * on any failure (missing binary, non-zero exit, timeout). Never use the sync
 * variants for hardware probes — nvidia-smi and system_profiler can take
 * seconds to return and would freeze the whole app while they do.
 */
function runCapture(cmd, args = [], timeout = 3000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, encoding: 'utf8' }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });
}

// GPU name doesn't change during a session — probe once and cache the promise
let gpuNamePromise = null;
function getGpuName() {
  if (gpuNamePromise) return gpuNamePromise;
  gpuNamePromise = (async () => {
    const nvidia = await runCapture('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader,nounits']);
    const nvidiaName = nvidia?.trim().split('\n')[0].trim();
    if (nvidiaName) return nvidiaName;

    if (process.platform === 'linux') {
      const out = await runCapture('lspci');
      const line = out?.split('\n').find((l) => /vga|3d|display/i.test(l));
      const match = line?.match(/:\s+(.+)$/);
      if (match) return match[1].trim();
    }

    if (process.platform === 'darwin') {
      const out = await runCapture('system_profiler', ['SPDisplaysDataType'], 5000);
      const match = out?.match(/Chipset Model:\s+(.+)$/m);
      if (match) return match[1].trim();
    }

    return null;
  })();
  return gpuNamePromise;
}

// IPC: get system hardware info (CPU, RAM, GPU)
ipcMain.handle('get-system-info', async () => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const gpuName = await getGpuName();

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

// IPC: list installed SLP versions
ipcMain.handle('slp-list-versions', async () => {
  try {
    const versions = listInstalledVersions();
    const current = getCurrentVersion();
    return { success: true, versions, current };
  } catch (err) {
    return { success: false, error: err.message, versions: [], current: null };
  }
});

// ── Storage / free-up-space ────────────────────────────────────────────────
// Model vendors kept when freeing space: the bundled orchestra model (default
// chat model) and the embeddings model (needed for RAG/indexing).
const KEEP_MODEL_VENDORS = ['smartloop-ai', 'embeddings'];

// Recursively sum the byte size of a file or directory. Missing paths → 0.
function dirSize(target) {
  let total = 0;
  let stat;
  try { stat = fs.lstatSync(target); } catch { return 0; }
  if (stat.isSymbolicLink()) return 0;           // don't follow / count symlinks
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let entries;
  try { entries = fs.readdirSync(target); } catch { return 0; }
  for (const name of entries) total += dirSize(path.join(target, name));
  return total;
}

// The workspace models directory (~/.smartloop/<workspaceId>/models).
// Returns null if the workspace/models dir can't be resolved.
function getModelsDir() {
  const workspaceDir = getWorkspaceDir();
  if (!workspaceDir) return null;
  const modelsDir = path.join(workspaceDir, 'models');
  return fs.existsSync(modelsDir) ? modelsDir : null;
}

// Removable model vendor dirs (everything except the kept vendors).
function getRemovableModelDirs() {
  const modelsDir = getModelsDir();
  if (!modelsDir) return [];
  let vendors;
  try { vendors = fs.readdirSync(modelsDir, { withFileTypes: true }); } catch { return []; }
  return vendors
    .filter(e => e.isDirectory() && !KEEP_MODEL_VENDORS.includes(e.name))
    .map(e => path.join(modelsDir, e.name));
}

// Installed SLP version dirs that aren't the current one (safe to delete).
function getRemovableVersionDirs() {
  const installDir = slpService.getSlpDir();
  const current = getCurrentVersion();
  let entries;
  try { entries = fs.readdirSync(installDir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => e.isDirectory() && /^\d+\.\d+\.\d+$/.test(e.name) && e.name !== current)
    .map(e => path.join(installDir, e.name));
}

// Log + cache paths that can be cleared.
function getLogCachePaths() {
  const installDir = slpService.getSlpDir();
  return {
    log: path.join(installDir, 'server.log'),
    cache: path.join(installDir, 'cache'),
  };
}

// After deleting model files, mark those models not-downloaded in config.json.
// The backend tracks download/enabled state there (workspace.models[]) and trusts
// it on startup rather than rescanning disk — without this, deleted models keep
// showing as downloaded/available in the picker. Must run while the service is
// stopped so its own shutdown-write doesn't clobber the edit. Kept models
// (orchestra + embeddings) are left untouched.
function markRemovedModelsInConfig() {
  try {
    const configPath = path.join(slpService.getSlpDir(), 'config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const models = config?.workspace?.models;
    if (!Array.isArray(models)) return;
    let changed = false;
    for (const m of models) {
      const name = String(m.model_name || m.name || '').toLowerCase();
      const keep = name.includes('orchestra') || name.includes('embed');
      if (keep || m.downloaded === false) continue;
      m.downloaded = false;
      m.enabled = false;
      m.is_active = false;
      changed = true;
      console.log(`[Storage] Marked ${m.model_name || m.name} as removed in config`);
    }
    if (changed) fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.log(`[Storage] markRemovedModelsInConfig error: ${err.message}`);
  }
}

// IPC: report reclaimable disk usage, broken down by category.
ipcMain.handle('storage-usage', async () => {
  try {
    const models = getRemovableModelDirs().reduce((sum, d) => sum + dirSize(d), 0);
    const versions = getRemovableVersionDirs().reduce((sum, d) => sum + dirSize(d), 0);
    const { log, cache } = getLogCachePaths();
    const logsCache = dirSize(log) + dirSize(cache);
    return {
      success: true,
      total: dirSize(slpService.getSlpDir()),   // whole ~/.smartloop footprint
      models,
      versions,
      logsCache,
      reclaimable: models + versions + logsCache,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: free up space. Stops the SLP service, deletes the selected categories,
// then restarts so the backend re-syncs its model list from disk.
ipcMain.handle('storage-cleanup', async (event, opts = {}) => {
  const { models = false, versions = false, logsCache = false } = opts;
  try {
    const before = dirSize(slpService.getSlpDir());
    // Pause the health poller so its scheduled ticks don't overwrite the
    // "restarting" status below with running/unreachable during the restart.
    healthMonitor.stop();
    // Stop first so file deletion + the config edit below aren't clobbered by
    // the backend's shutdown-write of config.json.
    await slpService.stopService();
    // Signal the Settings "Agent" panel that a restart is in progress. Sent on a
    // dedicated channel (not health-update) so it doesn't look like the service
    // dropped — which would make ProjectContext reconcile and reload the whole UI.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-restarting', { restarting: true });
    }
    await new Promise(r => setTimeout(r, 500));

    if (models) {
      for (const dir of getRemovableModelDirs()) fs.rmSync(dir, { recursive: true, force: true });
      // Reflect the deletion in config.json (the backend's source of truth) so
      // removed models no longer report as downloaded/available on restart.
      markRemovedModelsInConfig();
    }
    if (versions) {
      for (const dir of getRemovableVersionDirs()) fs.rmSync(dir, { recursive: true, force: true });
    }
    if (logsCache) {
      const { log, cache } = getLogCachePaths();
      try { fs.truncateSync(log, 0); } catch {}
      try {
        for (const name of fs.readdirSync(cache)) {
          fs.rmSync(path.join(cache, name), { recursive: true, force: true });
        }
      } catch {}
    }

    const started = await slpService.startService();
    refreshTray();
    // Clear the restarting flag and resume the poller. Because the poller was
    // paused across the restart, its resume tick reports `running` with the
    // previous status also `running` — so ProjectContext sees no transition and
    // doesn't reload the UI; only the Agent panel's badge updates.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-restarting', { restarting: false });
    }
    healthMonitor.start(() => mainWindow);
    // Rebuild the model list and push `models-updated` so the picker drops the
    // removed models (they now read as not-downloaded / unselected) instead of
    // still offering them from a stale cache.
    if (models) {
      invalidateModelsCache();
      refreshModelsCache();
    }
    const after = dirSize(slpService.getSlpDir());
    return { success: true, freed: Math.max(0, before - after), serviceStarted: started };
  } catch (err) {
    // Best-effort: try to bring the service back up even if deletion failed.
    try {
      await slpService.startService();
      refreshTray();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent-restarting', { restarting: false });
      healthMonitor.start(() => mainWindow);
    } catch {}
    return { success: false, error: err.message };
  }
});

// IPC: switch to a different SLP version (restarts service)
ipcMain.handle('slp-switch-version', async (event, version) => {
  try {
    const result = switchVersion(version);
    if (!result.success) return result;

    // Restart the service with the new version
    await slpService.stopService();
    await new Promise(r => setTimeout(r, 1000));
    const started = await slpService.startService();
    refreshTray();
    return { success: started, port: slpService.getPort() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: force an immediate release check (manual "Check for Updates")
ipcMain.handle('release-check-now', () => releaseChecker.checkNow());

// IPC: last known release-check result (or null)
ipcMain.handle('release-get-latest', () => releaseChecker.getLast());

// IPC: whether electron-updater can self-install on this build/platform
ipcMain.handle('updater-supported', () => releaseChecker.isUpdaterSupported());

// IPC: relaunch into the downloaded update
ipcMain.handle('updater-quit-and-install', () => releaseChecker.quitAndInstall());

// IPC: pause / resume the in-flight download
ipcMain.handle('updater-pause', () => releaseChecker.pauseDownload());
ipcMain.handle('updater-resume', () => releaseChecker.resumeDownload());

// IPC: current updater state, for renderers that mount after the last push
ipcMain.handle('updater-get-status', () => releaseChecker.getUpdaterStatus());

// Bootstrap the SLP service via SSE endpoint
// Handles workspace creation, model download, project creation, and model loading
const { bootstrapProgress } = require('./bootstrap-progress.js');

/**
 * Determine whether the SLP service needs bootstrapping — i.e. it has no
 * projects yet or no model loaded. Returns true on any error (assume needed).
 */
/** GET a JSON body from the local service, or null on any failure. */
/**
 * Projects the service reports, or null when we cannot tell. A shape we don't
 * recognise counts as "cannot tell", not as an empty workspace — callers act on
 * an empty list, so guessing wrong there is worse than admitting we don't know.
 */
async function getProjects(baseUrl) {
  const data = await slpService.getJson(baseUrl, '/v1/projects');
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.projects)) return data.projects;
  console.warn('[SLP] /v1/projects returned an unrecognised shape:', Object.keys(data).join(', '));
  return null;
}

async function checkNeedsBootstrap(baseUrl) {
  try {
    const projects = (await getProjects(baseUrl)) || [];
    const health = (await slpService.getJson(baseUrl, '/health')) || {};

    const hasProjects = projects.length > 0;
    const hasModel = health.status === 'healthy';

    if (!hasProjects) console.log('[SLP] No projects found — bootstrap needed');
    if (!hasModel) console.log('[SLP] Service not healthy — bootstrap needed');

    return !hasProjects || !hasModel;
  } catch {
    return true;
  }
}

// Line-buffered reader for SLP's SSE streams. Owns the framing — partial
// chunks, the `event:` name that applies until the blank line closes a frame,
// keepalive comments — and hands each frame to `onFrame(data, eventName)`
// already parsed. A line that is not a parseable `data:` frame goes to `onRaw`
// instead: /v1/models/load answers some requests with a plain JSON body rather
// than a stream, and feeding that body to a progress parser invented a 0%
// download for an already-resident model.
//
// Resolves when the response ends and rejects on a transport error; what a
// half-finished stream means is the caller's to decide.
function readSseStream(res, { onFrame, onRaw } = {}) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let eventName = 'progress';

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) { eventName = 'progress'; return; }
      if (trimmed.startsWith(':')) return;  // keepalive comment
      if (trimmed.startsWith('event: ')) { eventName = trimmed.slice(7).trim(); return; }
      if (!trimmed.startsWith('data: ')) { if (onRaw) onRaw(trimmed); return; }
      let data;
      try {
        data = JSON.parse(trimmed.slice(6));
      } catch {
        // An error frame stays terminal even when its payload is malformed.
        // Passing it to onRaw instead would report the failure as a success —
        // the exact bug this framing exists to prevent.
        if (eventName === 'error') { if (onFrame) onFrame({}, eventName); return; }
        if (onRaw) onRaw(trimmed);
        return;
      }
      if (onFrame) onFrame(data, eventName);
    };

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) handleLine(line);
    });

    res.on('end', () => {
      // Flush a last line that arrived without its terminating newline. SLP's
      // SSE frames always end in \n\n, but /v1/models/load's plain JSON body
      // does not — and dropping it silently would also drop an unterminated
      // final error frame.
      if (buffer.trim()) handleLine(buffer);
      resolve();
    });
    res.on('error', (err) => reject(err));
  });
}

// A failure inside a stream that already returned 200. SLP settles entitlement
// before opening the stream, so this is a mid-transfer fault — an expired
// signed URL, a full disk, a dropped socket.
function isErrorFrame(data, eventName) {
  return eventName === 'error' || data.status === 'error';
}

async function bootstrapSlpService(baseUrl, onProgress) {
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

      // A failed bootstrap arrives as an `event: error` frame inside a response
      // that already returned 200. Reading only `data:` lines made it
      // indistinguishable from a success, and the end of the stream then
      // declared it complete.
      let streamError = null;

      readSseStream(res, {
        onFrame: (frame, eventName) => {
          if (isErrorFrame(frame, eventName)) {
            if (streamError) return;
            streamError = new Error(frame.message || 'Bootstrap failed');
            streamError.code = frame.code;
            console.error('[SLP] Bootstrap failed:', streamError.message);
            return;
          }
          if (streamError) return;  // already terminal — ignore anything trailing

          // Already-seeded weights report a transfer; show "Checking" instead.
          const data = bootstrapSplashEvent(frame);

          const progress = bootstrapProgress(data);

          if (progress.percent > 0) {
            if (progress.percent % 10 === 0) console.log(`[SLP] Bootstrap: downloading ${progress.percent}%`);
          } else {
            console.log('[SLP] Bootstrap:', progress.status);
          }

          // Let the caller know the stream is alive (stall watchdog).
          if (onProgress) onProgress(progress);

          // Send to splash screen only when main window isn't visible yet
          if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
            updateSplashProgress(data);
          }

          // Send normalised progress to renderer so the chat UI can show it
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.webContents.send('bootstrap-progress', progress);
          }
        },
      }).then(() => {
        if (streamError) {
          reject(streamError);
          return;
        }
        console.log('[SLP] Bootstrap completed');

        // Send a final completed event so the renderer clears the progress UI
        // and reloads the project list (bootstrap creates the default project).
        // Not gated on window visibility: on a first run the window is still
        // hidden behind the splash here, but its renderer is loaded and
        // listening — and it is the run that most needs the reload, since the
        // project list it fetched on mount was empty.
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('bootstrap-progress', {
            percent: 100, status: 'Ready', model: '', downloading: false
          });
          mainWindow.webContents.send('bootstrap-complete');
        }

        resolve(true);
      }, (err) => {
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
      var st = document.getElementById('status-text');
      st.textContent = ${JSON.stringify(msg)};
      st.style.color = 'rgb(248,113,113)';
      st.style.fontWeight = '600';
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
    // When a deterministic percent is provided (e.g. archive extraction),
    // drive the bar fill; otherwise fall back to the indeterminate animation.
    const hasPct = data.percent !== undefined && data.percent !== null;
    const pct = hasPct ? Math.min(100, Math.max(0, Math.round(Number(data.percent)))) : 0;
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = ${JSON.stringify(msg)};
      document.getElementById('progress-fill').style.width = '${pct}%';
      document.getElementById('progress-fill').classList.${hasPct ? 'remove' : 'add'}('indeterminate');
    `).catch(() => { });
    return;
  }

  if (data.status === 'preparing') {
    const msg = data.message || 'Starting agent. This might take a while...';
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = ${JSON.stringify(msg)};
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-fill').classList.add('indeterminate');
    `).catch(() => { });
    return;
  }

  if (data.status === 'verifying') {
    const msg = data.message || 'Verifying system requirements…';
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('status-text').textContent = ${JSON.stringify(msg)};
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-fill').classList.add('indeterminate');
    `).catch(() => { });
    return;
  }

  // Anything else is a bootstrap stage (SLP streams its own status names) —
  // show it rather than sitting on the last message for the length of the run.
  const stageMessage = BOOTSTRAP_SPLASH_COPY[data.status];
  if (stageMessage) updateSplashProgress({ status: 'preparing', message: stageMessage });
}

/**
 * Splash copy for the stages SLP's bootstrap streams.
 *
 * Its status names are its own vocabulary, and none of them are the splash's —
 * without this map the text stops updating the moment bootstrap starts. They
 * are also, on a bundled build, the whole of a first run: the model is already
 * in the workspace, so `downloading` never arrives and nothing here mentions a
 * download. The stage names come from smartloop/api/routers/init.py.
 */
const BOOTSTRAP_SPLASH_COPY = {
  model_ready: 'Setting up your workspace…',
  creating_project: 'Creating your first project…',
  project_created: 'Creating your first project…',
  loading: 'Starting the assistant…',
  model_loaded: 'Starting the assistant…',
  setup: 'Setting up your project…',
  setup_complete: 'Almost ready…',
  completed: 'Ready',
};

/**
 * First-launch step: show the "verifying system requirements" phase. Nothing is
 * awaited here — the install isn't gated on hardware, so the download starts
 * immediately and the GPU label is logged from a background probe.
 */
function verifyRequirementsOnSplash() {
  updateSplashProgress({ status: 'verifying', message: 'Verifying system requirements…' });
  detectSystemCapability()
    .then((cap) => console.log('[SLP] System capability:', cap.label))
    .catch(() => { });
}

/**
 * Close the splash and bring up the main window, starting the pollers that
 * need a live renderer. Every startup path ends here, so the ordering (splash
 * down, window up, service-ready sent, pollers started) lives in one place.
 */
function revealMainWindow(baseUrl) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;

  setAppReady(true);
  mainWindow.show();
  mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
  healthMonitor.start(() => mainWindow);
  releaseChecker.start(() => mainWindow, () => refreshTray());
  fetchModels();
  refreshMcpCatalogCache();
}

// A bootstrap that stops emitting SSE progress must not trap the user behind a
// frozen splash forever — if nothing arrives for this long, give up on the
// splash and open the main window (bootstrap keeps running server-side).
const BOOTSTRAP_STALL_MS = 10 * 60 * 1000;

/** Wait for the service to stop answering /health. False if it never does. */
async function waitForServiceDown(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await slpService.checkHealth())) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Run bootstrap to completion, guarded by a stall watchdog. Never rejects: a
 * failed or stalled bootstrap hands control back so the caller can carry on and
 * open the main window.
 *
 * Returns { ok } — false when bootstrap errored, or when the watchdog gave up
 * on it and it is still running in the background. Callers that read the
 * workspace afterwards need that: an empty workspace after a bootstrap that
 * never finished says nothing about the workspace.
 */
async function runBootstrap(baseUrl) {
  return new Promise((resolve) => {
    let stallTimer = null;
    let outcome = { ok: true };
    const done = () => { clearTimeout(stallTimer); resolve(outcome); };
    const bumpStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        console.warn('[SLP] Bootstrap stalled — giving up on the splash while it continues');
        resolve({ ok: false, reason: 'stalled' });
      }, BOOTSTRAP_STALL_MS);
    };

    bumpStall();
    bootstrapSlpService(baseUrl, bumpStall)
      .then(() => { refreshTray(); })
      .catch((error) => {
        console.error('[SLP] Bootstrap failed:', error.message);
        outcome = { ok: false, reason: error.message };
      })
      .finally(done);
  });
}

// The bootstrap model, named three different ways.
//
// Locally SLP calls it `sl-mini`; the platform catalogue publishes it as
// `slp-orchestra-mini` (SLP's constants note the short name "isn't published
// upstream"); and MODEL_ID is the org-prefixed path the workspace lays weights
// out under.
const BOOTSTRAP_MODEL_NAME = 'sl-mini';
const BOOTSTRAP_MODEL_PLATFORM_NAME = 'slp-orchestra-mini';
const BOOTSTRAP_MODEL_ID = 'smartloop-ai/slp-orchestra-mini';

/**
 * Let SLP create the workspace, then put the bundled models in it before
 * bootstrap runs.
 *
 * The models ship inside the app the same way the SLP framework does, but they
 * cannot be used from there: SLP resolves the chat weights under
 * <workspace>/models/<model_id>/ and the embedding GGUF under
 * <workspace>/models/embeddings/, and a workspace is a runtime directory named
 * by a UUID that does not exist until the service has started. So this runs
 * after the service is healthy and before bootstrap, and copies them across —
 * which keeps the whole arrangement on this side of the wire. SLP is asked for
 * a workspace and handed files in the places it already looks; it needs no
 * notion of an app bundle, and no change to resolve one.
 *
 *   GET /v1/models/workspace  ->  _ensure_workspace()  ->  the workspace exists
 *
 * That route is a plain read. It builds the workspace when there isn't one
 * (Workspace._create_new_workspace makes <home>/<uuid>/models) and downloads
 * nothing, which the two routes that also build it — POST /v1/bootstrap and
 * POST /v1/init — cannot claim.
 *
 * With the chat model then sitting in the workspace, bootstrap takes its other
 * branch entirely:
 *
 *     for wm in workspace.models:
 *         if md and _gguf_exists(md): existing_model_name = wm.model_name
 *     ...
 *     if existing_model_name: yield "model_ready"      # no download
 *
 * The embedding model is not bootstrap's business at all — it is read straight
 * off disk the first time something is indexed — so seeding it here is the only
 * thing that keeps document search offline too.
 *
 * Returns true when the chat model is in place.
 */
async function ensureBootstrapModel(baseUrl, onProgress) {
  if (!baseUrl) return false;

  // Ask SLP for the workspace. The response is ignored — the point is the side
  // effect, and a failure here is not fatal: bootstrap will build one itself
  // and download, which is exactly the old behaviour.
  try {
    await fetch(`${baseUrl}/v1/models/workspace`);
  } catch (error) {
    console.warn('[Model] Could not ask SLP for a workspace:', error.message);
  }

  const workspaceDir = await findWorkspaceDir();
  if (!workspaceDir) {
    console.warn('[Model] No workspace directory appeared — bootstrap will handle the model');
    return false;
  }

  const modelsDir = path.join(workspaceDir, 'models');
  try {
    fs.mkdirSync(modelsDir, { recursive: true });
  } catch (error) {
    console.warn('[Model] Could not prepare the models directory:', error.message);
    return false;
  }

  seededModelDir = path.join(modelsDir, BOOTSTRAP_MODEL_ID);

  if (await placeBundledModels(modelsDir, onProgress)) return true;
  return downloadBootstrapModel(seededModelDir, onProgress);
}

/**
 * The workspace directory SLP is using, once it exists.
 *
 * config.json is the reliable answer but is only written when the workspace is
 * saved, which can lag its creation — so fall back to finding the directory
 * itself. A workspace is a uuid-named directory with a models/ child, which
 * nothing else in the SLP home looks like.
 */
async function findWorkspaceDir(waitMs = 15000) {
  const slpDir = slpService.getSlpDir();
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(slpDir, 'config.json'), 'utf-8'));
      if (config?.workspace?.id) return path.join(slpDir, config.workspace.id);
    } catch {
      // Not written yet.
    }

    try {
      const candidates = fs.readdirSync(slpDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name))
        .filter((entry) => fs.existsSync(path.join(slpDir, entry.name, 'models')));
      if (candidates.length === 1) return path.join(slpDir, candidates[0].name);
    } catch {
      // The home may not exist yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

/**
 * Copy the models that ship inside the app into the workspace's models/ dir,
 * each one keeping the relative path it has in the bundle.
 *
 * The copy is a COPYFILE_FICLONE, which on APFS is a clone — no second 1.2 GB
 * on disk and effectively instant. On any other filesystem the flag degrades to
 * a real copy rather than failing, which is why the splash says what it is
 * doing: on Windows and Linux this is a real write of ~1.2 GB and takes long
 * enough to look like a hang otherwise.
 *
 * Each file is written under a temporary name and renamed on success. A partial
 * .gguf at the real path reads as "downloaded" to SLP and would load as garbage.
 *
 * Returns true when the chat model ends up in place; the embedding model is
 * best-effort (without it SLP downloads it on first index, and falls back to
 * TF-IDF retrieval until then).
 */
/**
 * SLP's own test for "the weights are already here" (_gguf_exists in
 * api/routers/init.py): any .gguf in the model directory, or in its bin/.
 *
 * Any .gguf, not one particular filename — which is the point. A workspace can
 * hold a different quantisation of the same model than the one this build ships
 * or the manifest offers, and SLP will happily load it. Matching on an exact
 * name instead is what made the app announce "Downloading model..." over
 * weights that were already sitting in the workspace.
 */
function hasGguf(dir) {
  const gguf = (d) => {
    try {
      return fs.readdirSync(d).some((name) => name.endsWith('.gguf'));
    } catch {
      return false;
    }
  };
  return gguf(dir) || gguf(path.join(dir, 'bin'));
}

/**
 * Where the chat weights live once this app has put them there — the evidence
 * that lets the splash contradict bootstrap when the two disagree.
 */
let seededModelDir = null;

/**
 * What the splash should make of one bootstrap event.
 *
 * The app knows something bootstrap does not: it shipped the weights and put
 * them in the workspace folder itself. So when a bootstrap event announces a
 * download and the weights are sitting in that folder, the announcement is not
 * relayed — whatever the framework is doing there, it is not fetching a model
 * this build already has.
 *
 * This is deliberately a property of the app rather than of any framework
 * version. A framework built before the workspace-record re-check announces
 * the download step on a fresh workspace before it looks in the model
 * directory: the record it has just added carries no `downloaded` flag, so it
 * streams "Downloading model sl-mini..." and only then hands the artifact
 * downloader a directory where every file is complete — which returns in a
 * second having moved nothing. Every released framework does this, and the app
 * has to run against all of them, so the check lives here and holds for all of
 * them.
 *
 * Byte-bearing events are logged rather than shown. Nothing should be
 * transferring for a model already on disk; if something is, that belongs in
 * the log where a developer will find it, not on a splash screen promising a
 * download that this build exists to avoid.
 */
function bootstrapSplashEvent(data) {
  const announcesDownload = data.status === 'downloading' || data.status === 'download_complete';
  if (!announcesDownload) return data;
  if (!(seededModelDir && hasGguf(seededModelDir))) return data;

  if (Number(data.total) > 0) {
    console.warn('[SLP] Bootstrap reports a transfer for a model already in the workspace:',
      `${Math.round(Number(data.downloaded || 0) / 1e6)} / ${Math.round(Number(data.total) / 1e6)} MB`);
  }
  return { status: 'preparing', message: 'Checking the model…' };
}

async function placeBundledModels(modelsDir, onProgress) {
  const bundled = bundledModelFiles();
  if (!bundled.length) return false;

  let chatModelReady = false;

  for (const file of bundled) {
    const destination = path.join(modelsDir, file.relative);
    const label = file.isEmbedding ? 'document search' : 'the assistant';

    try {
      // The chat weights are resolved by directory, the embedding GGUF by
      // filename (AppSettings.embedding_gguf_file) — so what counts as "already
      // there" differs, and copying over either is 400-800 MB of waste.
      const alreadyThere = file.isEmbedding
        ? fs.existsSync(destination) && fs.statSync(destination).size > 0
        : hasGguf(path.dirname(destination));
      if (alreadyThere) {
        if (!file.isEmbedding) chatModelReady = true;
        continue;
      }

      if (onProgress) {
        onProgress({ status: 'installing', message: `Setting up ${label}…` });
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const staging = `${destination}.seeding`;
      await fs.promises.copyFile(file.path, staging, fs.constants.COPYFILE_FICLONE);
      fs.renameSync(staging, destination);
      console.log(`[Model] Placed ${file.relative}`);
      if (!file.isEmbedding) chatModelReady = true;
    } catch (error) {
      console.warn(`[Model] Could not place ${file.relative}:`, error.message);
      try { fs.unlinkSync(`${destination}.seeding`); } catch { /* nothing staged */ }
    }
  }

  return chatModelReady;
}

/**
 * Fetch the chat model straight from the platform API rather than letting SLP
 * pull it during bootstrap. Only reached by a build that ships without it.
 *
 * Owning the transfer here buys three things SLP's bootstrap stream did not:
 * real byte progress (its SSE reports stages, not always bytes), a download
 * that can be retried without re-running the whole bootstrap, and one place
 * that decides where weights land — the same place the bundled-model seeding
 * writes to.
 *
 * /v1/models/<name>/download answers with signed GCS URLs; FREE models need no
 * account. Only the .gguf is taken: the OpenVINO variant in the same response
 * is for a runtime this build does not use.
 */
async function downloadBootstrapModel(modelDir, onProgress) {
  // Checked before the manifest, not after resolving a filename from it: the
  // workspace may already hold a differently-named quantisation, which SLP
  // loads happily and which no download should replace.
  if (hasGguf(modelDir)) {
    console.log('[Model] The workspace already has weights — nothing to download');
    return true;
  }

  const manifestUrl = `${BASE_URL}/v1/models/${BOOTSTRAP_MODEL_PLATFORM_NAME}/download`;

  let manifest;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      console.warn(`[Model] Download manifest refused (HTTP ${res.status})`);
      return false;
    }
    manifest = await res.json();
  } catch (error) {
    console.warn('[Model] Could not reach the download manifest:', error.message);
    return false;
  }

  const artifacts = manifest?.artifacts || {};
  const ggufName = Object.keys(artifacts).find((name) => name.endsWith('.gguf'));
  if (!ggufName) {
    console.warn('[Model] Manifest carried no .gguf artifact');
    return false;
  }

  const destination = path.join(modelDir, path.basename(ggufName));
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) return true;

  console.log(`[Model] Downloading ${ggufName} from the platform API`);
  try {
    const res = await fetch(artifacts[ggufName]);
    if (!res.ok || !res.body) {
      console.warn(`[Model] Artifact fetch failed (HTTP ${res.status})`);
      return false;
    }

    const total = Number(res.headers.get('content-length') || 0);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    // Written under a temporary name and renamed on success: a partial .gguf at
    // the real path reads as "downloaded" and would load as garbage.
    const staging = `${destination}.downloading`;
    const handle = fs.createWriteStream(staging);

    let downloaded = 0;
    let lastReport = 0;
    for await (const chunk of res.body) {
      handle.write(chunk);
      downloaded += chunk.length;
      // Throttled: the UI cannot use more than a few updates a second, and the
      // splash bridge serialises every one of them.
      if (onProgress && Date.now() - lastReport > 200) {
        lastReport = Date.now();
        onProgress({ status: 'downloading', downloaded, total });
      }
    }
    await new Promise((resolve, reject) => handle.end((err) => (err ? reject(err) : resolve())));

    if (total && fs.statSync(staging).size !== total) {
      fs.unlinkSync(staging);
      console.warn('[Model] Download was truncated — leaving it to bootstrap');
      return false;
    }

    fs.renameSync(staging, destination);
    if (onProgress) onProgress({ status: 'downloading', downloaded: total || downloaded, total: total || downloaded });
    console.log('[Model] Bootstrap model downloaded');
    return true;
  } catch (error) {
    console.warn('[Model] Model download failed — bootstrap will try:', error.message);
    return false;
  }
}

// Approximate size of the first-run download. Bootstrap fetches the default
// model's weights; the service reports no size up front (every /v1/models entry
// carries `size: null`), and the real figure only arrives on the first SSE
// progress event — i.e. after the download has already started. So the number
// disclosed before the user consents is this constant, and it must be kept in
// step with whatever model bootstrap installs by default.
//
// App Review guideline 2.x: an app that downloads additional resources in order
// to work has to state how big they are and let the user choose. Rejected once
// for downloading the model unannounced behind the splash.
const DEFAULT_MODEL_DOWNLOAD_MB = 800;

/**
 * A window to hang the sheet on, or null for a free-standing alert. Only the
 * main window qualifies: the splash is a 400x340 frameless transparent panel,
 * and a sheet dropped onto that reads as a dialog with no owner anyway — a
 * centered app-modal alert is clearer during startup.
 */
function dialogParent() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) return mainWindow;
  return null;
}

/**
 * Ask before fetching the model, disclosing the size. Answered once per attempt
 * rather than remembered: declining leaves the app with nothing to chat with,
 * so the next launch (and the tray entry) offers it again instead of silently
 * staying broken.
 */
async function confirmModelDownload() {
  // Nothing to disclose when the model ships inside the app and is already in
  // the workspace — there is no download to consent to.
  if (hasBundledModel()) {
    console.log('[Model] Bootstrap model is bundled — no download to confirm');
    return true;
  }

  const parent = dialogParent();
  const options = {
    type: 'question',
    buttons: ['Download', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
    title: 'Download Language Model',
    message: 'Smartloop Studio needs to download a language model',
    detail:
      `Smartloop Studio answers you with a model that runs on this computer, so your chats and documents never leave it. `
      + `Setting up downloads that model once — about ${DEFAULT_MODEL_DOWNLOAD_MB} MB — over your internet connection.\n\n`
      + `Until it finishes there is nothing to chat with. You can start the download later from the Smartloop menu bar icon.`,
  };
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  return response === 0;
}

/**
 * Run the deferred first-run setup after the user declined it at launch. Fired
 * from the tray. The main window is up by now, so bootstrapSlpService routes its
 * SSE progress to the renderer (ModelStatusContext adopts it as a primary load)
 * instead of to the splash.
 */
async function runDeferredSetup() {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'Local service is not running' };
  if (!(await confirmModelDownload())) return { success: false, error: 'declined' };
  setSetupHandler(null);
  await runBootstrap(baseUrl);
  return { success: true };
}

// IPC: start the deferred setup from the renderer (same gate as the tray entry).
ipcMain.handle('slp-start-setup', async () => runDeferredSetup());

/**
 * First run: SLP is installed and answering, but has no model and no project
 * yet, so there is nothing usable behind the main window. Keep the splash up
 * and let bootstrap (which downloads the default model, ~770 MB) stream its
 * progress into it — bootstrapSlpService routes SSE progress to the splash for
 * as long as the main window stays hidden — and only return once it finishes.
 *
 * This applies to every platform. All three now bundle the SLP framework, so
 * needsInstall() is false on a fresh machine and the install splash is skipped
 * entirely; bootstrap is the only first-launch work left. Without this gate the
 * splash closed the moment the service answered and the user landed in an empty
 * chat — no model, no project — while the model downloaded invisibly.
 *
 * Returns the base URL to use from here on: the repair path below restarts the
 * service, which can hand back a different port.
 */
async function bootstrapOnSplash(baseUrl) {
  if (!splashWindow || splashWindow.isDestroyed()) createStartingSplash();

  // Consent first, and before any splash copy that implies work is underway —
  // nothing is fetched until the user has seen the size and said yes.
  if (!(await confirmModelDownload())) {
    console.log('[SLP] Model download declined — opening the app without a model');
    setSetupHandler(runDeferredSetup);
    return baseUrl;
  }

  updateSplashProgress({ status: 'preparing', message: 'Setting up your workspace...' });

  const bootstrapped = await runBootstrap(baseUrl);

  // A bootstrap that errored or is still running past the watchdog leaves the
  // workspace empty for a reason we already know, and the repair below would
  // read that as corruption — and, on a stall, kill the download still in
  // flight. Open the window and let the user retry from the tray instead.
  if (!bootstrapped.ok) {
    console.warn(`[SLP] Bootstrap did not complete (${bootstrapped.reason}) — skipping the workspace check`);
    return baseUrl;
  }

  // Bootstrap can leave the workspace empty two ways, and this repair covers
  // both. A service that kept running after its data dir was wiped (the agent
  // outlives the app) answers /health with the old model still loaded, so
  // bootstrap skips the work and returns a project it no longer has. Or the
  // download genuinely failed — runBootstrap logs that and resolves anyway, so
  // we arrive here either way. Restart the service so it re-reads what is
  // actually on disk, then bootstrap for real.
  //
  // Only an empty list counts as evidence — a failed call tells us nothing.
  const projects = await getProjects(baseUrl);
  if (projects === null || projects.length > 0) return baseUrl;

  console.warn('[SLP] Bootstrap left the workspace with no projects — restarting the service and retrying');
  updateSplashProgress({ status: 'preparing', message: 'Repairing workspace...' });

  try {
    await slpService.stopService();
    if (!(await waitForServiceDown())) {
      // Another process owns this port (an agent from a different install), so
      // restarting ours changes nothing — leave it and open the window.
      console.warn('[SLP] A service we cannot stop is holding the port — skipping the retry');
      return baseUrl;
    }
    if (!(await slpService.startService())) {
      console.error('[SLP] Service failed to restart during workspace repair');
      return baseUrl;
    }
    const repairedUrl = slpService.getLocalBaseUrl() || baseUrl;
    await runBootstrap(repairedUrl);
    return repairedUrl;
  } catch (error) {
    console.error('[SLP] Workspace repair failed:', error.message);
    return baseUrl;
  }
}

// IPC: load model (called from renderer)
ipcMain.handle('load-model', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  const result = await slpService.loadModel(baseUrl);
  return { success: result };
});

// IPC: init/select a model — downloads + sets up if missing, streams SSE progress
ipcMain.handle('slp-init-model', async (event, modelName, projectId) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };

  // Already in flight — don't stack a second request for the same model.
  if (activeModelDownloads.has(modelName)) {
    console.log(`[Models] ${modelName} already initializing; ignoring duplicate request`);
    return { success: false, error: 'already-downloading', downloading: true };
  }

  return new Promise((resolve) => {
    const http = require('http');
    const url = new URL(`${baseUrl}/v1/init`);

    const postData = JSON.stringify(projectId
      ? { model_name: modelName, project_id: projectId }
      : { model_name: modelName });

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
        failModelDownload(modelName, res, { kind: 'primary' }).then(resolve);
        return;
      }

      consumeSseStream(res, modelName, { kind: 'primary' }).then((result) => {
        resolve(result.ok
          ? { success: true, model: modelName }
          : { success: false, error: result.error, code: result.code, requiresAuth: result.requiresAuth });
      });
    });

    beginModelDownload(modelName, req, { kind: 'primary', status: 'Initializing model…' });

    req.on('error', (err) => {
      clearActiveDownload(modelName);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
});

const activeModelDownloads = new Map();
// Latest progress per in-flight download, keyed by model name. Main process is
// the source of truth so a renderer that mounts mid-download (e.g. after tab
// navigation unmounts/remounts the panel) can rehydrate instead of resetting to
// "not downloaded" and kicking off a duplicate download from 0%.
const modelDownloadState = new Map();

// Record the latest progress and broadcast it. Clears the tracked state once the
// download reaches a terminal (non-downloading) point so get-download-state stops
// reporting it as active.
// `kind` separates the project's primary orchestrator load ('primary') from an
// auxiliary model download ('aux'). Both share this map, so consumers must
// discriminate: the sidebar's aux cards would otherwise render a primary load as
// a toggling aux model.
function emitModelDownloadProgress(modelName, progress, { kind = 'aux' } = {}) {
  const percent = progress.percent ?? 0;
  const stillDownloading = progress.downloading === true
    || (progress.downloading === undefined && percent < 100);
  if (stillDownloading) {
    // Deliberately not tagged with a project: weights are workspace-wide, so a
    // download in flight serves every project and any of them may show it.
    modelDownloadState.set(modelName, {
      model: modelName,
      percent,
      status: progress.status,
      stage: progress.stage,
      downloading: true,
      kind,
    });
  } else {
    // Terminal. The downloaded flag just changed workspace-wide, so drop every
    // project's cached list, not just the one that started the download.
    modelDownloadState.delete(modelName);
    invalidateModelsCache();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('model-download-progress', { ...progress, model: modelName, kind });
  }
}

// Register a starting download: the request handle (for cancel/dedup) and a 0%
// tracked entry, paired so they can't drift. Seeding the entry here rather than
// waiting for the first SSE event is what makes get-download-state truthful for
// a download that has started but not yet reported progress — a renderer
// mounting in that window would otherwise see nothing in flight.
function beginModelDownload(name, req, { kind = 'aux', status = 'Starting…' } = {}) {
  activeModelDownloads.set(name, req);
  modelDownloadState.set(name, { model: name, percent: 0, status, downloading: true, kind });
}

// Terminal cleanup for a download's request handle + tracked progress.
function clearActiveDownload(name) {
  activeModelDownloads.delete(name);
  modelDownloadState.delete(name);
}

// SLP answers a request for weights the account isn't entitled to with 401 or
// 403: it resolves entitlement with the platform before opening its progress
// stream, so the refusal arrives as a status rather than inside a 200. There is
// nothing to retry until the user signs in or upgrades, so it's flagged apart
// from a transport failure and the renderer turns it into a sign-in prompt.
//
// 400 is deliberately not in here. The only 400s on these routes are "Unknown
// model" and "this model is always enabled" — neither is fixed by signing in,
// and treating them as auth failures hid the real reason behind a login prompt.
const AUTH_REQUIRED_STATUSES = new Set([401, 403]);

function readResponseBody(res) {
  return new Promise((resolve) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk.toString(); });
    res.on('end', () => resolve(body));
    res.on('error', () => resolve(body));
  });
}

// Terminal handling for a download that answered non-200: drain the body for a
// usable message, broadcast a terminal event so any renderer that adopted this
// download drops its ring instead of sitting at the percent it died on, and hand
// the caller back a structured failure.
async function failModelDownload(modelName, res, { kind = 'aux' } = {}) {
  const body = (await readResponseBody(res)).trim();
  const requiresAuth = AUTH_REQUIRED_STATUSES.has(res.statusCode);
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.detail || parsed?.error || parsed?.message || '';
  } catch {
    detail = body;
  }
  const error = requiresAuth
    ? 'Sign in to download this model'
    : `HTTP ${res.statusCode}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`;
  console.warn(`[Models] Download of ${modelName} failed: HTTP ${res.statusCode} ${String(detail).slice(0, 200)}`);
  // `detail` rides along even on the auth branch. A signed-in user hitting a 403
  // is not helped by "sign in", and the server already said the useful thing
  // ("Upgrade required to access this model") — dropping it left the only
  // accurate account of the failure in a console log.
  emitModelDownloadProgress(
    modelName,
    { percent: 0, status: error, downloading: false, error, detail: String(detail).slice(0, 200), requiresAuth },
    { kind },
  );
  clearActiveDownload(modelName);
  return { success: false, error, detail: String(detail).slice(0, 200), code: res.statusCode, requiresAuth };
}

// Consume one of SLP's SSE progress streams, broadcasting each frame as model
// download progress.
//
// Every reader of these streams needs the same two things, and none of them had
// either while this logic was copy-pasted per handler:
//
// 1. An error frame is terminal. Reading only `data: ` lines fed it to
//    bootstrapProgress, which has no error branch and normalised it to
//    "0%, still downloading": a spinner that never resolves.
// 2. The end of a failed stream is not a success. `res.on('end')` used to emit
//    `{percent: 100, status: 'Ready'}` unconditionally, so a refused download
//    reported completion — and in slp-set-model-enabled the caller went on to
//    PATCH the model enabled with no weights on disk.
//
// Resolves `{ ok, error, detail, code, requiresAuth }`; never rejects, so
// callers decide what a failure means to them.
function consumeSseStream(res, modelName, { kind = 'aux', doneStatus = 'Ready', logOther = false } = {}) {
  let failure = null;

  const fail = (data) => {
    if (failure) return;
    const code = typeof data.code === 'number' ? data.code : null;
    const requiresAuth = AUTH_REQUIRED_STATUSES.has(code);
    const detail = data.message || data.error || 'Download failed';
    const error = requiresAuth ? 'Sign in to download this model' : String(detail).slice(0, 200);
    failure = { ok: false, error, detail, code, requiresAuth };
    console.warn(`[Models] ${modelName} stream failed${code ? ` (${code})` : ''}: ${String(detail).slice(0, 200)}`);
    emitModelDownloadProgress(
      modelName,
      { percent: 0, status: error, downloading: false, error, detail, requiresAuth },
      { kind },
    );
    clearActiveDownload(modelName);
  };

  return readSseStream(res, {
    onFrame: (data, eventName) => {
      if (isErrorFrame(data, eventName)) { fail(data); return; }
      if (failure) return;  // already terminal — ignore anything trailing
      emitModelDownloadProgress(modelName, bootstrapProgress(data), { kind });
    },
    onRaw: (line) => { if (logOther) console.log(`[Models] ${modelName}:`, line); },
  }).then(() => {
    if (failure) return failure;
    emitModelDownloadProgress(
      modelName,
      { percent: 100, status: doneStatus, downloading: false },
      { kind },
    );
    clearActiveDownload(modelName);
    return { ok: true };
  }, (err) => {
    // A stream that dies mid-transfer has to go terminal too, or the renderer's
    // ring sits at the percent it died on until the dialog is closed.
    fail({ message: err.message });
    return failure;
  });
}

// IPC: snapshot of in-flight downloads so a freshly mounted renderer can rehydrate.
ipcMain.handle('slp-get-download-state', async () => {
  const downloads = {};
  for (const [name, state] of modelDownloadState.entries()) downloads[name] = state;
  return { success: true, downloads };
});

// IPC: load a project's primary orchestrator model (SSE streaming progress).
// Previously the renderer streamed /v1/models/load itself and re-published it as
// window CustomEvents, so the stream died on navigation and restarted on every
// project change. Owning it here means progress survives both.
ipcMain.handle('slp-load-model', async (event, modelName, projectId) => {
  if (!modelName) return { success: false, error: 'No model name' };

  // A load can be requested before SLP finishes coming up (e.g. first paint after
  // launch), so retry around a cold service instead of dropping the request.
  let baseUrl = slpService.getLocalBaseUrl();
  for (let attempt = 0; !baseUrl && attempt < 3; attempt++) {
    if (await slpService.checkHealth()) {
      baseUrl = slpService.getLocalBaseUrl();
      break;
    }
    console.log(`[Models] SLP not ready, retrying load of ${modelName} (${attempt + 1}/3)...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!baseUrl) return { success: false, error: 'No local service' };

  // Already loading — a project re-select must not stack a second stream.
  if (activeModelDownloads.has(modelName)) {
    console.log(`[Models] ${modelName} already loading; ignoring duplicate request`);
    return { success: false, error: 'already-downloading', downloading: true };
  }

  return new Promise((resolve) => {
    const http = require('http');
    const url = new URL(`${baseUrl}/v1/models/load`);
    const postData = JSON.stringify(projectId
      ? { model_name: modelName, project_id: projectId }
      : { model_name: modelName });

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
        failModelDownload(modelName, res, { kind: 'primary' }).then(resolve);
        return;
      }

      consumeSseStream(res, modelName, { kind: 'primary', logOther: true }).then((result) => {
        resolve(result.ok
          ? { success: true, model: modelName }
          : { success: false, error: result.error, code: result.code, requiresAuth: result.requiresAuth });
      });
    });

    beginModelDownload(modelName, req, { kind: 'primary', status: 'Initializing model…' });

    req.on('error', (err) => {
      clearActiveDownload(modelName);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
});

// IPC: cancel an in-progress model download
ipcMain.handle('slp-cancel-model-download', async (event, modelName, projectId) => {
  const req = activeModelDownloads.get(modelName);
  if (req) {
    console.log(`[Models] Cancelling download for ${modelName}`);
    req.destroy();
    clearActiveDownload(modelName);
    invalidateModelsCache(projectId);
    return { success: true };
  }
  return { success: false, error: 'No active download' };
});

// IPC: enable/disable a model for orchestrator selection
// If the model is not downloaded yet, downloads it first (scoped to the project
// when one is given), then enables it on that project. Falls back to the legacy
// workspace (app-default) endpoints when no project is supplied.
ipcMain.handle('slp-set-model-enabled', async (event, modelName, enabled, projectId) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };

  // Weights are workspace-wide, so a download already in flight serves every
  // project. Skip starting a second one, but still fall through to the PATCH —
  // the caller's project asked to enable the model and that intent must land.
  // The flag is settable before the weights arrive: the workspace registry holds
  // entries with downloaded=false, so the backend resolves the model and flips it.
  const alreadyDownloading = activeModelDownloads.has(modelName);
  if (alreadyDownloading) {
    console.log(`[Models] ${modelName} already downloading; enabling for this project without a second download`);
  }

  // Check the model's per-project (or workspace) downloaded state
  let existsInWorkspace = false;
  try {
    const stateUrl = projectId
      ? `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/models`
      : `${baseUrl}/v1/models/workspace`;
    const wsRes = await fetch(stateUrl);
    if (wsRes.ok) {
      const wsData = await wsRes.json();
      const wsList = Array.isArray(wsData) ? wsData : (wsData.data || wsData.models || []);
      const wsNames = wsList.map(wm => wm.model_name || wm.name);
      const wsMatch = wsList.find(wm => wm.model_name === modelName || wm.name === modelName);
      existsInWorkspace = wsMatch && wsMatch.downloaded;
      console.log(`[Models] set-model-enabled: looking for "${modelName}" in state: [${wsNames.join(', ')}] → ${existsInWorkspace}`);
    } else {
      console.log(`[Models] set-model-enabled: state fetch failed: HTTP ${wsRes.status}`);
    }
  } catch (err) {
    console.log(`[Models] set-model-enabled: state fetch error: ${err.message}`);
  }

  if (!existsInWorkspace && enabled && !alreadyDownloading) {
    console.log(`[Models] ${modelName} not downloaded, initializing via /v1/init...`);
    try {
      const http = require('http');
      const dlUrl = new URL(`${baseUrl}/v1/init`);
      const postData = JSON.stringify(projectId
        ? { model_name: modelName, project_id: projectId }
        : { model_name: modelName });
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: dlUrl.hostname,
          port: dlUrl.port,
          path: dlUrl.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        }, (res) => {
          if (res.statusCode !== 200) {
            failModelDownload(modelName, res).then((fail) => {
              const err = new Error(fail.error);
              err.code = fail.code;
              err.requiresAuth = fail.requiresAuth;
              reject(err);
            });
            return;
          }
          consumeSseStream(res, modelName, { doneStatus: 'Complete' }).then((result) => {
            if (result.ok) { resolve(true); return; }
            // Reject rather than resolve: the PATCH below would otherwise mark a
            // model enabled whose weights never arrived.
            const err = new Error(result.error);
            err.code = result.code;
            err.requiresAuth = result.requiresAuth;
            reject(err);
          });
        });
        beginModelDownload(modelName, req, { status: 'Starting download…' });
        req.on('error', (err) => {
          clearActiveDownload(modelName);
          reject(err);
        });
        req.write(postData);
        req.end();
      });
      console.log(`[Models] Download complete for ${modelName}`);
    } catch (err) {
      console.error('[Models] Download error:', err.message);
      return { success: false, error: err.message, code: err.code, requiresAuth: !!err.requiresAuth };
    }

    // No name re-resolution round trip here: both PATCH routes canonicalize the
    // model name themselves, and this fetch sat inside the window between the
    // download finishing and the model going enabled — visible as a stalled card.
  }

  try {
    const url = projectId
      ? `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}`
      : `${baseUrl}/v1/models/workspace/${encodeURIComponent(modelName)}`;
    console.log(`[Models] PATCH ${url} enabled=${enabled}`);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const text = await res.text();
    console.log(`[Models] PATCH response: ${res.status} ${text}`);
    if (res.ok) {
      // Enabling also promotes the model to a workspace app-default, so the
      // workspace-scoped entry Settings reads goes stale alongside this
      // project's — clear the whole map for that case.
      invalidateModelsCache(enabled ? undefined : projectId);
      // Repopulate before returning so the renderer's follow-up list read is a
      // fresh-cache hit rather than a cold round trip. This also pushes
      // `models-updated`, which the renderer already subscribes to.
      await refreshModelsCache(projectId);
      try {
        return { success: true, ...JSON.parse(text), downloading: alreadyDownloading };
      } catch {
        return { success: true, downloading: alreadyDownloading };
      }
    }
    // These PATCH routes do no entitlement check of their own — a gated model is
    // refused at the download above, not here. A 401/403 reaching this point is
    // the local API rejecting the request, and it is still not retryable, so it
    // is reported the same way. Broadcast it as well as returning it: a picker
    // that remounted mid-flight only learns about failures through the event.
    if (AUTH_REQUIRED_STATUSES.has(res.status)) {
      const error = 'Sign in to use this model';
      emitModelDownloadProgress(
        modelName,
        { percent: 0, status: error, downloading: false, error, detail: text.slice(0, 200), requiresAuth: true },
      );
      return { success: false, error, detail: text.slice(0, 200), code: res.status, requiresAuth: true };
    }
    const error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    emitModelDownloadProgress(
      modelName,
      { percent: 0, status: error, downloading: false, error, requiresAuth: false },
    );
    return { success: false, error, code: res.status };
  } catch (err) {
    console.error('[Models] PATCH error:', err.message);
    return { success: false, error: err.message };
  }
});

// IPC: check if a command exists on the system
ipcMain.handle('command-exists', async (event, cmd) => {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'where' : 'which';
    execFile(shell, [cmd], (err) => {
      resolve({ exists: !err });
    });
  });
});

// IPC: unload model (called from renderer)
ipcMain.handle('unload-model', async () => {
  await slpService.unloadModel();
  return { success: true };
});

// Read credential state from the local service. Shared by the status IPC, the
// login wait and the window-focus check so the fetch isn't spelled out three times.
async function readAuthStatus() {
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
}

// IPC: Check auth status on local SLP service
ipcMain.handle('slp-auth-status', readAuthStatus);

// IPC: Logout from local SLP service (clear access token)
ipcMain.handle('slp-auth-logout', async () => {
  stopLoginWait();
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  try {
    const res = await fetch(`${baseUrl}/v1/auth/token?type=access_token`, { method: 'DELETE' });
    if (res.ok) {
      lastUserProfileEmail = null;
      invalidateModelsCache();
      refreshModelsCache();
      invalidateMcpCatalogCache();
      refreshMcpCatalogCache();
      return { success: true };
    } else {
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Force an immediate health poll (e.g. after login/logout) so the UI reflects
// model gating changes without waiting for the next scheduled poll.
ipcMain.handle('slp-health-poke', () => {
  healthMonitor.poke();
  return { success: true };
});

// Track the last known identity so we can bust the models cache on user change.
let lastUserProfileEmail = null;

// Fetch the user profile from the backend and broadcast it to the renderer.
async function fetchUserProfile() {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/users/me`);
    if (res.ok) {
      const result = await res.json();
      const profile = {
        email: result.email,
        name: result.name,
        verified: result.is_verified,
        admin: result.is_superuser,
        is_paid: result.is_paid || false,
        premium: result.is_paid || false,
        tokens: result.tokens,
        number_of_tokens_processed: result.number_of_tokens_processed || 0,
        // NOTE: `projects` is intentionally NOT copied from /users/me — that
        // embedded field is deprecated. Projects come only from /v1/projects
        // via the `projects-*` IPC handlers / ProjectContext.
        conversations: result.conversations || [],
        default_temperature: result.default_temperature !== undefined ? result.default_temperature : 0.3,
        default_memory: result.default_memory !== undefined ? result.default_memory : true,
        onboarded: result.onboarded !== undefined ? result.onboarded : false,
      };
      if (lastUserProfileEmail !== profile.email) {
        lastUserProfileEmail = profile.email;
        invalidateModelsCache();
        refreshModelsCache();
        // The catalog is user-scoped through the cloud, and this is the only
        // login hook — there is no dedicated login IPC.
        invalidateMcpCatalogCache();
        refreshMcpCatalogCache();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('user-profile-updated', profile);
      }
      return profile;
    }
    return null;
  } catch (err) {
    console.error('[User] Error fetching profile:', err.message);
    return null;
  }
}

// IPC: Renderer requests the user profile.
ipcMain.handle('slp-fetch-user', async () => {
  const profile = await fetchUserProfile();
  return { success: !!profile, user: profile };
});

// -- Login wait ---------------------------------------------------------------
// The browser OAuth flow POSTs its tokens straight to the local service, so
// nothing signals the app when they land — credential state has to be watched.
// Main owns that watch rather than the renderer, so there is exactly one of them
// and it can be bounded and cancelled.
//
// It announces only success; timing out is silent. Swap point: when the backend
// grows a blocking GET /v1/auth/wait, only waitForLogin's body changes.
// Long enough to sign in by hand. The old 90s was measured from the moment the
// provider's page opened, which is the wrong thing to bound: what happens in
// that window is a person typing an Apple ID, then a password, then a code off
// another device, and that takes as long as it takes. Running out mid-sign-in
// left nothing watching for the tokens.
const LOGIN_WAIT_TIMEOUT_MS = 5 * 60_000;
const LOGIN_WAIT_INTERVAL_MS = 2_000;

// The in-flight wait, if any. Its object identity doubles as the generation
// token: a tick whose session is no longer the current one has been cancelled or
// superseded, and drops its result.
let loginWait = null;

function sendLoginState(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('login-state', payload);
  }
}

function stopLoginWait() {
  if (loginWait && loginWait.timer) clearTimeout(loginWait.timer);
  loginWait = null;
}

function waitForLogin() {
  stopLoginWait();
  const session = {
    timer: null,
    interval: LOGIN_WAIT_INTERVAL_MS,
    tick: null,
    deadline: Date.now() + LOGIN_WAIT_TIMEOUT_MS,
    // True once the provider has handed control back — see accelerateLoginWait.
    finishing: false,
  };
  loginWait = session;

  // Self-rescheduling rather than setInterval, so a slow status call can't stack.
  const tick = async () => {
    if (loginWait !== session) return;
    const status = await readAuthStatus();
    if (loginWait !== session) return;

    if (status && status.success && status.has_access_token && status.user) {
      stopLoginWait();
      // Merge the full profile before announcing so the UI never flashes a
      // half-populated user — is_paid in particular gates the model list.
      const profile = await fetchUserProfile();
      // The user is in their browser, looking at the page that just finished.
      // Nothing else brings the app forward, and the thing they signed in to
      // should be what they are looking at when it is done.
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      sendLoginState({ state: 'success', user: { ...status.user, ...(profile || {}) } });
      healthMonitor.poke();
      return;
    }

    // Deadline is tested after the read, so the final tick doubles as a last
    // re-check: a token landing inside the closing interval still wins.
    if (Date.now() >= session.deadline) {
      const wasFinishing = session.finishing;
      stopLoginWait();
      // Which leash ran out matters when reading this back: the long one means
      // nobody finished signing in, the finishing one means they did and the
      // tokens never turned up.
      console.log(`[OAuth] Login wait timed out${wasFinishing ? ' while finishing' : ' before the provider handed back'}`);
      // Giving up is silent while the user is just sitting on the login card:
      // the button never entered a waiting state to come back from, and a token
      // that lands later is still picked up by the focus check. Once the
      // provider has handed back, though, the app is showing a spinner in place
      // of a page it hid — silence there is a permanent one.
      if (wasFinishing) {
        sendLoginState({ state: 'error', error: 'Sign-in did not complete. Please try again.' });
      }
      return;
    }

    session.timer = setTimeout(tick, session.interval);
  };

  session.tick = tick;
  session.timer = setTimeout(tick, session.interval);
}

/**
 * The provider has handed control back, so the tokens are landing now rather
 * than at some point in the next minute and a half. Poll hard until they do:
 * the user is looking at a spinner for exactly this gap, and two seconds of it
 * is the difference between "signed in" and "did that work?".
 */
const LOGIN_WAIT_FAST_INTERVAL_MS = 300;

const LOGIN_WAIT_FINISH_TIMEOUT_MS = 15_000;

function accelerateLoginWait() {
  // Same news for the renderer: the provider is done, and the card in front of
  // the user should stop telling them to go to their browser. This is the only
  // sender of that signal now the consent page is out of the app, and it is the
  // right one — "the provider handed back" is exactly what the card's second
  // half means.
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('auth-view-finishing');
  }

  // A handback can arrive after the wait has already given up, and when it does
  // it is the one signal worth trusting: the provider is done, so the tokens
  // are landing now. Restart rather than ignore it — a lapsed wait meant the
  // tokens arrived with nobody watching, and the app sat on a spinner it had no
  // way left to take down.
  if (!loginWait) {
    console.log('[OAuth] Provider handed back after the wait lapsed — resuming');
    waitForLogin();
  }
  if (!loginWait || loginWait.finishing) return;
  loginWait.finishing = true;
  loginWait.interval = LOGIN_WAIT_FAST_INTERVAL_MS;
  // A shorter leash too: the tokens are seconds away or they are not coming,
  // and a spinner that runs for a minute and a half tells the user nothing.
  loginWait.deadline = Date.now() + LOGIN_WAIT_FINISH_TIMEOUT_MS;
  if (loginWait.timer) clearTimeout(loginWait.timer);
  loginWait.timer = setTimeout(loginWait.tick, 0);
}

// IPC: Renderer requests settings update via PATCH /users/me
ipcMain.handle('slp-update-user-settings', async (event, settings) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };
  try {
    const res = await fetch(`${baseUrl}/v1/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const profile = await fetchUserProfile();
      return { success: true, user: profile };
    } else {
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Fetch the curated MCP connection catalog from SLP — active remote entries
// only, in display order. Returns null when unavailable (no service, bad
// status, network error) so a failure is never cached as an empty list.
async function fetchMcpCatalogEntries() {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/mcp-catalog`);
    if (!res.ok) {
      // 401 here just means not signed in yet — the catalog comes from the
      // cloud. The login path re-primes, so this is expected on first launch.
      console.warn(`[MCP Catalog] HTTP ${res.status} fetching catalog`);
      return null;
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.entries || data.data || []);
    return list
      .filter((e) => e && e.is_active !== false && e.remote_config?.server_url)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.display_name || '').localeCompare(String(b.display_name || '')));
  } catch (err) {
    console.error('[MCP Catalog] Error fetching catalog:', err.message);
    return null;
  }
}

// Stale-while-revalidate cache for the catalog. One slot, not a Map like
// modelsCache: the catalog is identical for every project — per-project
// "connected" state is joined in the renderer against the project-scoped
// mcp-servers list, so the payload cached here carries no project scope. If
// that merge ever moves into main, this has to become project-keyed too.
let mcpCatalogCache = null; // { data, timestamp }
let mcpCatalogRefreshPromise = null; // in-flight refresh
const MCP_CATALOG_FRESH_TTL_MS = 10 * 60 * 1000;

function refreshMcpCatalogCache() {
  if (mcpCatalogRefreshPromise) return mcpCatalogRefreshPromise;
  const promise = (async () => {
    try {
      const entries = await fetchMcpCatalogEntries();
      if (entries) {
        mcpCatalogCache = { data: entries, timestamp: Date.now() };
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('mcp-catalog-updated', { entries });
        }
      }
      return entries;
    } finally {
      mcpCatalogRefreshPromise = null;
    }
  })();
  mcpCatalogRefreshPromise = promise;
  return promise;
}

function invalidateMcpCatalogCache() {
  mcpCatalogCache = null;
}

// IPC: Curated MCP connection catalog — fresh cache returns instantly, stale
// cache returns immediately while a background refresh emits
// `mcp-catalog-updated`. Primed at startup from revealMainWindow(), so the
// Connections panel normally opens straight onto a cache hit.
ipcMain.handle('slp-mcp-catalog', async () => {
  const now = Date.now();
  if (mcpCatalogCache && now - mcpCatalogCache.timestamp < MCP_CATALOG_FRESH_TTL_MS) {
    return { success: true, entries: mcpCatalogCache.data };
  }
  if (mcpCatalogCache) {
    refreshMcpCatalogCache();
    return { success: true, entries: mcpCatalogCache.data };
  }
  const entries = await refreshMcpCatalogCache();
  if (!entries) {
    return {
      success: false,
      error: slpService.getLocalBaseUrl() ? 'Failed to fetch connection catalog' : 'No local service',
    };
  }
  return { success: true, entries };
});

// Fetch catalog + per-project model state in parallel and merge into a single
// model list. Without a project (e.g. on Settings) it falls back to the legacy
// workspace (app-default) endpoint.
async function fetchModelsWithMerge(projectId) {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;

  const stateUrl = projectId
    ? `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/models`
    : `${baseUrl}/v1/models/workspace`;

  const [modelsRes, stateRes] = await Promise.all([
    fetch(`${baseUrl}/v1/models`).catch((err) => {
      console.warn('[Models] Error fetching catalog:', err.message);
      return null;
    }),
    fetch(stateUrl).catch((err) => {
      console.warn('[Models] Error fetching model state:', err.message);
      return null;
    }),
  ]);

  if (!modelsRes || !modelsRes.ok) return null;
  const catalog = await modelsRes.json();
  const models = Array.isArray(catalog) ? catalog : (catalog.data || catalog.models || []);

  const stateMap = new Map();
  if (stateRes && stateRes.ok) {
    const stateData = await stateRes.json();
    const stateList = Array.isArray(stateData) ? stateData : (stateData.data || stateData.models || []);
    for (const wm of stateList) {
      stateMap.set(wm.model_name, wm);
      if (wm.name && wm.name !== wm.model_name) stateMap.set(wm.name, wm);
      if (wm.model_id) stateMap.set(wm.model_id, wm);
    }
  }

  for (const model of models) {
    const key = model.name || model.id || model.model;
    const ws = stateMap.get(key) || stateMap.get(model.model_name) || stateMap.get(model.id);
    if (ws) {
      model.enabled = ws.enabled === true;
      model.downloaded = ws.downloaded === true;
      model.capabilities = ws.capabilities || ws.effective_capabilities || model.capabilities || [];
      model.workspace_name = ws.model_name;
    } else {
      model.enabled = false;
      model.downloaded = false;
    }
  }
  return models;
}

// Stale-while-revalidate cache for the merged model list, keyed by project id
// (per-project model state must never bleed across projects). A null/undefined
// key is the project-less (workspace app-default) list, e.g. on Settings.
let modelsCache = new Map(); // projectId -> { data, timestamp }
let modelsRefreshPromises = new Map(); // projectId -> in-flight refresh
const MODELS_FRESH_TTL_MS = 30_000;

function refreshModelsCache(projectId) {
  if (modelsRefreshPromises.has(projectId)) return modelsRefreshPromises.get(projectId);
  const promise = (async () => {
    try {
      const models = await fetchModelsWithMerge(projectId);
      if (models) {
        modelsCache.set(projectId, { data: models, timestamp: Date.now() });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('models-updated', { models, projectId });
        }
      }
      return models;
    } finally {
      modelsRefreshPromises.delete(projectId);
    }
  })();
  modelsRefreshPromises.set(projectId, promise);
  return promise;
}

function invalidateModelsCache(projectId) {
  if (projectId === undefined) {
    modelsCache = new Map();
  } else {
    modelsCache.delete(projectId);
  }
}

// Kept for backwards-compatible startup warmup.
async function fetchModels() {
  return refreshModelsCache(undefined);
}

// IPC: Fetch available models — fresh cache returns instantly, stale cache
// returns immediately while a background refresh emits `models-updated`.
ipcMain.handle('slp-list-models', async (event, projectId) => {
  const now = Date.now();
  const cached = modelsCache.get(projectId);
  if (cached && now - cached.timestamp < MODELS_FRESH_TTL_MS) {
    return { success: true, models: cached.data };
  }
  if (cached) {
    refreshModelsCache(projectId);
    return { success: true, models: cached.data };
  }
  const models = await refreshModelsCache(projectId);
  if (!models) return { success: false, error: 'No local service' };
  return { success: true, models };
});

// Register custom protocol for OAuth callback
const PROTOCOL = 'smartloop';

const splashThemes = {
  smartloop: {
    '--sl-bg-base': '#000000', '--sl-bg-surface-1': '#1a1a1a', '--sl-bg-surface-2': '#2a2a2a', '--sl-bg-surface-3': '#3a3a3a',
    '--sl-brand-primary': '#ec4899', '--sl-text-primary': '#ffffff', '--sl-text-secondary': '#e5e7eb',
    '--sl-text-disabled': '#6b7280', '--sl-text-faint': '#4b5563', '--sl-border-default': '#2a2a2a',
  },
  'smartloop-light': {
    '--sl-bg-base': '#fdfbfc', '--sl-bg-surface-1': '#f8f4f6', '--sl-bg-surface-2': '#f1eaed', '--sl-bg-surface-3': '#e6dce0',
    '--sl-brand-primary': '#ec4899', '--sl-text-primary': '#1a1a1a', '--sl-text-secondary': '#374151',
    '--sl-text-disabled': '#8b95a3', '--sl-text-faint': '#9ca3af', '--sl-border-default': '#e6dce0',
  },
  sepia: {
    '--sl-bg-base': '#171412', '--sl-bg-surface-1': '#211d18', '--sl-bg-surface-2': '#2d2822', '--sl-bg-surface-3': '#3d362e',
    '--sl-brand-primary': '#d35b36', '--sl-text-primary': '#f2efe9', '--sl-text-secondary': '#d4cbc3',
    '--sl-text-disabled': '#6b655e', '--sl-text-faint': '#4a4540', '--sl-border-default': '#2d2822',
  },
};

/**
 * Resolve the active theme's base background color from the same persisted
 * source the splash uses, so the native window can be created already dark.
 * Without a backgroundColor the window defaults to white, which bleeds through
 * the hidden-titlebar strip on macOS — most visibly when the window is inactive.
 */
function getPersistedBaseColor() {
  try {
    const saved = store.get('app_theme_colors', null);
    const vars = saved ? (typeof saved === 'string' ? JSON.parse(saved) : saved) : null;
    if (vars && typeof vars['--sl-bg-base'] === 'string') return vars['--sl-bg-base'];
  } catch { /* malformed — fall through */ }
  const savedTheme = store.get('app_theme', 'smartloop');
  const themeId = (savedTheme === 'rams' || savedTheme === 'sepia') ? 'smartloop' : savedTheme;
  const vars = splashThemes[themeId] || splashThemes.smartloop;
  return (vars && vars['--sl-bg-base']) || '#000000';
}

/** True when a #rrggbb color is dark (so the native window chrome should be dark). */
function isDarkColor(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return true; // no/malformed color → assume dark (the common case)
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function applySplashTheme() {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  // Prefer the exact colors the renderer persisted for the active theme — this
  // covers every built-in and any user-imported custom theme. Fall back to the
  // built-in map (then smartloop) on a first-ever launch before any are saved.
  let vars = null;
  try {
    const saved = store.get('app_theme_colors', null);
    if (saved) vars = typeof saved === 'string' ? JSON.parse(saved) : saved;
  } catch { /* ignore malformed */ }
  if (!vars || typeof vars !== 'object') {
    const savedTheme = store.get('app_theme', 'smartloop');
    const themeId = (savedTheme === 'rams' || savedTheme === 'sepia') ? 'smartloop' : savedTheme;
    vars = splashThemes[themeId] || splashThemes.smartloop;
  }
  const css = Object.entries(vars)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => `document.documentElement.style.setProperty(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');
  splashWindow.webContents.executeJavaScript(css).catch(() => {});
}

let systemCapabilityPromise = null;

/**
 * Describe the machine's GPU for logging. SLP runs on Vulkan, which accelerates
 * on Apple Silicon (Metal), NVIDIA, AMD and Intel GPUs, so this is informational
 * labeling only — the install is not gated on it. Keep it OFF the startup
 * critical path: the nvidia-smi probe can take seconds on machines with NVIDIA
 * drivers installed (hybrid-graphics laptops especially), and it used to run
 * synchronously, stalling the splash before the download even began.
 * See https://www.smartloop.ai/docs/getting-started/
 */
function detectSystemCapability() {
  if (systemCapabilityPromise) return systemCapabilityPromise;

  systemCapabilityPromise = (async () => {
    // Test override: SLP_FORCE_TIER=accelerated|limited|cpu forces the result so
    // every splash/verify branch can be exercised regardless of real hardware.
    const forced = process.env.SLP_FORCE_TIER;
    if (forced === 'accelerated' || forced === 'limited' || forced === 'cpu') {
      const samples = {
        accelerated: { tier: 'accelerated', label: 'NVIDIA GPU · 8 GB', detail: 'Vulkan acceleration ready' },
        limited: { tier: 'limited', label: 'NVIDIA GPU · 2.0 GB', detail: 'Low VRAM — smaller models run best' },
        cpu: { tier: 'cpu', label: 'GPU detected', detail: 'Vulkan acceleration ready' },
      };
      return samples[forced];
    }

    if (process.platform === 'darwin' && process.arch === 'arm64') {
      // Apple Silicon (M1 or newer) — Metal GPU acceleration, no probe needed.
      return { tier: 'accelerated', label: 'Apple Silicon', detail: 'GPU acceleration ready' };
    }

    // Probe for an NVIDIA GPU purely to surface its VRAM. No output just means
    // "not NVIDIA" — AMD/Intel GPUs still run under Vulkan.
    const out = await runCapture('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits']);
    const memGb = parseInt(out?.trim().split('\n')[0].trim(), 10) / 1024;
    if (Number.isFinite(memGb) && memGb >= 4) {
      return { tier: 'accelerated', label: `NVIDIA GPU · ${Math.round(memGb)} GB`, detail: 'Vulkan acceleration ready' };
    }
    if (Number.isFinite(memGb)) {
      return { tier: 'limited', label: `NVIDIA GPU · ${memGb.toFixed(1)} GB`, detail: 'Low VRAM — smaller models run best' };
    }
    return { tier: 'accelerated', label: 'GPU', detail: 'Vulkan acceleration ready' };
  })();

  return systemCapabilityPromise;
}

function createSplashWindow() {
  // Idempotent. Startup raises the splash before it knows which branch it will
  // take, and every branch still asks for one; a second BrowserWindow here
  // would reassign splashWindow and leave the first stranded on screen with
  // nothing left holding a reference to close it.
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;

  splashWindow = new BrowserWindow({
    width: 400,
    height: 340,
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
  splashWindow.webContents.on('did-finish-load', applySplashTheme);
  return splashWindow;
}

function createSplashScreen() {
  createSplashWindow();
}

function createStartingSplash() {
  createSplashWindow();
}

function createWindow() {
  // Match the native window appearance to the theme up front. Without this,
  // themeSource stays 'system' until the renderer calls setNativeTheme, so on a
  // light-mode OS macOS draws the inactive titlebar with its light material
  // (the white strip). Seed both the appearance and the window background from
  // the persisted theme; setNativeTheme keeps them in sync on later changes.
  const baseColor = getPersistedBaseColor();
  nativeTheme.themeSource = isDarkColor(baseColor) ? 'dark' : 'light';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 920,
    minHeight: 600,
    show: false, // Don't show until ready
    titleBarStyle: 'hidden',
    // Seed the native window background with the active theme's base so the
    // hidden-titlebar strip never flashes white — including when the window is
    // inactive. setNativeTheme keeps it in sync on later theme changes.
    backgroundColor: baseColor,
    webPreferences: {
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      // Keep timers/requestIdleCallback running at full rate even when the
      // window is hidden to tray or occluded. Streamdown's markdown parsing and
      // token-reveal animation are idle-callback/setTimeout driven; with the
      // default throttling they stall after the app sits in the background,
      // so streamed responses stop rendering even though the socket is healthy.
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/img/logo.png')
  });

  setupTitlebarAndAttachToWindow(mainWindow);

  // Chrome-style tab shortcuts. Cmd/Ctrl+W has to be claimed here rather than in
  // the renderer: on macOS the default application menu binds Cmd+W to "Close
  // Window", and menu accelerators swallow the key before the page ever sees it.
  // before-input-event runs ahead of both, so we intercept and forward to the UI.
  // Shift keeps Chrome's meaning — close the window (which hides to tray here).
  // Both Cmd and Ctrl are accepted on every platform: Ctrl+W is unbound on macOS,
  // so honoring it too costs nothing and matches muscle memory either way.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt) return;
    if (!(input.meta || input.control) || (input.key || '').toLowerCase() !== 'w') return;
    event.preventDefault();
    if (input.shift) {
      mainWindow.close();
    } else {
      mainWindow.webContents.send('shortcut-close-tab');
    }
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

  // A deep link can arrive before the renderer has mounted its IPC listeners
  // (cold start, slow SLP bootstrap). Mark the renderer ready on did-finish-load
  // and flush any queued link so callbacks (e.g. mcp-auth) aren't sent into the
  // void. Fires again on reload/navigation, which is fine. See dispatchDeepLink.
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    if (pendingDeepLink) {
      const url = pendingDeepLink;
      pendingDeepLink = null;
      console.log('[DeepLink] Renderer ready, flushing queued deep link:', url);
      handleDeepLink(url);
    }
  });

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
    rendererReady = false;
    stopLoginWait();
  });

  // On focus: check auth status and refresh user profile (throttled)
  mainWindow.on('focus', async () => {
    const status = await readAuthStatus();
    if (status.success && status.has_access_token) {
      fetchUserProfile();
    }
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

// ── In-app sign-in ──────────────────────────────────────────────────────────
//
// Sign-in happens INSIDE the app. App Review guideline 4.0 rejects handing the
// user to Safari to sign in unless the handoff is an ASWebAuthenticationSession,
// which Electron has no binding for.
//
// Email and password never leave the app at all: the renderer's login page
// collects them and this process talks to the platform API directly, which also
// keeps the credentials out of a web context and sidesteps CORS.
//
// Google and Apple can't work that way — only the provider may render its own
// consent screen. That page gets a window of its own, parented to the main one:
// a plain child window rather than a modal, because on macOS a modal is
// presented as a sheet, and a sheet has no frame at all — no title bar, no
// close button, and a position the app doesn't get to choose. A child window
// keeps its frame, which is the whole point of using one: the OS draws the
// close button that cancels the flow, and the title bar names the origin the
// page came from. Neither has to be built, and neither can be styled into
// something it isn't.
//
// Windows and Linux do take `modal`, where it disables the parent without
// costing the frame, so they get it.
//
// Either way the tokens end up in the same place: POSTed to the local service's
// /v1/auth/callback, exactly as the browser flow delivered them.

/** Cloud API URL for an auth/user path (e.g. '/auth/jwt/login'). */
function platformUrl(path) {
  return `${BASE_URL}/v1${path}`;
}

/**
 * Hand a freshly issued token pair to the local service, which owns credential
 * storage. Same endpoint and body the web login page POSTs, so there is one
 * contract rather than one per sign-in route.
 */
async function deliverTokens(accessToken, refreshToken) {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'Local service is not running' };
  try {
    const res = await fetch(`${baseUrl}/v1/auth/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken || '' }),
    });
    if (!res.ok) return { success: false, error: `Local service rejected the token (HTTP ${res.status})` };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Announce a completed sign-in the same way the OAuth wait does: merge the
 * profile before broadcasting so the UI never paints a half-populated user.
 */
async function announceSignIn() {
  const status = await readAuthStatus();
  const profile = await fetchUserProfile();
  const user = { ...(status?.user || {}), ...(profile || {}) };
  sendLoginState({ state: 'success', user });
  healthMonitor.poke();
  return user;
}

/**
 * Turn a platform API error body into something a person can act on.
 * The API answers with machine codes in `detail.code`; anything it doesn't
 * recognise falls through to the detail string, then to the status.
 */
function authErrorMessage(status, body) {
  const detail = body?.detail;
  const code = typeof detail === 'string' ? detail : detail?.code;

  switch (code) {
    case 'OTP_NO_ACCOUNT':
      return 'No Smartloop account uses that email.';
    case 'OTP_INVALID':
      return 'That code is not right. Check the email and try again.';
    case 'OTP_EXPIRED':
      return 'That code has expired. Send a new one.';
    case 'OTP_TOO_MANY_ATTEMPTS':
      return 'Too many tries. Send a new code and start again.';
    case 'OTP_RATE_LIMITED':
      return 'Too many codes requested. Wait a minute and try again.';
    default:
      break;
  }
  if (typeof detail === 'string' && detail) return detail;
  if (status === 422) return 'Check the email address and try again.';
  return `Sign-in failed (HTTP ${status}).`;
}

/** POST to the platform API, returning { ok, status, body }. */
async function platformPost(path, json) {
  const res = await fetch(platformUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty or non-JSON body */ }
  return { ok: res.ok, status: res.status, body };
}

// IPC: ask the platform to email a sign-in code.
//
// There is no password anywhere in this flow and no way to create an account
// from the app — signing up happens on the web. So the one failure worth
// distinguishing is "that address has no account", which the renderer turns
// into a link out rather than a retry.
ipcMain.handle('auth-otp-request', async (event, email) => {
  try {
    const { ok, status, body } = await platformPost('/auth/otp/request', { email });
    if (!ok) {
      const detail = body?.detail;
      const code = typeof detail === 'string' ? detail : detail?.code;
      return {
        success: false,
        code: code === 'OTP_NO_ACCOUNT' ? 'no-account' : undefined,
        error: authErrorMessage(status, body),
      };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: exchange an emailed code for a session.
ipcMain.handle('auth-otp-verify', async (event, email, code) => {
  try {
    const { ok, status, body } = await platformPost('/auth/otp/verify', { email, code });
    if (!ok || !body?.access_token) {
      return { success: false, error: authErrorMessage(status, body) };
    }

    const delivered = await deliverTokens(body.access_token, body.refresh_token);
    if (!delivered.success) return delivered;

    return { success: true, user: await announceSignIn() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: permanently delete the signed-in account (guideline 5.1.1(v)). Proxied by
// the local service, which holds the access token that authorizes it.
ipcMain.handle('auth-delete-account', async () => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'Local service is not running' };
  try {
    const res = await fetch(`${baseUrl}/v1/users/me`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      let detail = '';
      try { detail = (await res.json())?.detail || ''; } catch { /* no body */ }
      return { success: false, error: detail || `Could not delete the account (HTTP ${res.status})` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  sendLoginState({ state: 'signed-out' });
  healthMonitor.poke();
  return { success: true };
});

/**
 * The message for a provider that refused or was dismissed, or null if the URL
 * carries no complaint.
 *
 * A cancel is the one outcome that must not be waited on: nothing is coming, so
 * polling for tokens would hold the user on a spinner for the whole timeout to
 * tell them what they already did. OAuth reports it on the callback URL, in the
 * vocabulary of whichever provider wrote it.
 */
function returnErrorMessage(url) {
  let error = null;
  try { error = new URL(url).searchParams.get('error'); } catch { return null; }
  if (!error) return null;
  if (error === 'access_denied' || error === 'user_cancelled_authorize' || error === 'user_cancelled') {
    return 'Sign-in was cancelled.';
  }
  return 'Sign-in did not complete. Please try again.';
}

/**
 * Send the user to the provider's consent page in their own browser.
 *
 * Every platform the app ships on already has a browser, signed in and trusted,
 * and the providers built these pages for it — Google refuses to render consent
 * in an embedded browser at all, and reproducing the rest in-app means owning a
 * window, its navigation interception, its user agent and its callback plumbing
 * on three platforms. Leaving is the flow that is the same everywhere.
 *
 * Nothing has to be held open to make it work: the API's desktop authorize route
 * signs the local service's port into the OAuth state, so the round trip finds
 * its way back to this machine on its own. The page at the end POSTs the tokens
 * to the local service, and waitForLogin sees them land.
 */
async function openAuthInBrowser(provider) {
  const port = slpService.getPort() || slpService.readLocalServicePort();
  if (!port) return { success: false, error: 'Local service is not running' };

  const url = `${platformUrl(`/auth/${provider}/desktop/authorize`)}?port=${port}`;
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.error('[OAuth] Could not open the browser:', err.message);
    return { success: false, error: 'Could not open your browser. Please try again.' };
  }
  console.log(`[OAuth] ${provider} sign-in handed to the browser`);

  // The tokens land on the local service, not here, so the watcher decides when
  // this is over — the same one the in-window flow used.
  waitForLogin();
  return { success: true };
}

// IPC: start a provider sign-in.
ipcMain.handle('auth-provider-start', async (event, provider) => {
  if (provider !== 'google' && provider !== 'apple') {
    return { success: false, error: `Unsupported provider: ${provider}` };
  }
  return openAuthInBrowser(provider);
});

// IPC: the user backed out of the provider flow. The browser tab they were
// sent to is theirs to close; all this end owns is the watch.
ipcMain.handle('auth-provider-cancel', async () => {
  stopLoginWait();
  return { success: true };
});




// Note: Default project ("general_chat") is created by the SLP framework during bootstrap


// Handle deep linking for OAuth callback
if (!process.defaultApp) {
  // Packaged build: always (re)claim smartloop:// for this app (ai.smartloop.studio).
  app.setAsDefaultProtocolClient(PROTOCOL);
} else if (process.env.SL_REGISTER_PROTOCOL === '1' && process.argv.length >= 2) {
  // Dev (`electron .`): only register when explicitly opted in. Otherwise the
  // registration would bind smartloop:// to the generic node_modules Electron
  // (bundle id com.github.Electron, shared across every Electron project), which
  // hijacks the scheme so deep links open a bare Electron instead of the app.
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
}

// Handle the protocol on macOS/Linux
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[OAuth] Deep link received (macOS/Linux):', url);
  console.log('[OAuth] PROTOCOL constant:', PROTOCOL);

  // Accept any URL with our protocol
  if (url.startsWith(`${PROTOCOL}://`)) {
    console.log('[OAuth] Valid protocol URL detected, dispatching deep link');
    dispatchDeepLink(url);
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

    // Someone tried to run a second instance (e.g. taskbar icon click while
    // A relaunch during the shutdown wait lands here: this process still holds
    // the single-instance lock, so the new one hands its arguments over and
    // exits — into an app that is on its way out and will not come back. Say
    // nothing and let the quit finish; the user's next launch gets a live app.
    if (app.isQuitting) {
      console.log('[App] Second instance arrived mid-quit — ignoring');
      return;
    }

    // the window is hidden to tray) — show and focus our window. focus()
    // alone does nothing on a hidden window.
    if (mainWindow && !(splashWindow && !splashWindow.isDestroyed())) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle the protocol URL on Windows
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    console.log('[OAuth] Protocol URL from command line:', url || 'none');
    console.log('[OAuth] PROTOCOL constant:', PROTOCOL);

    // Accept any URL with our protocol
    if (url) {
      console.log('[OAuth] Valid protocol URL detected, dispatching deep link');
      dispatchDeepLink(url);
    }
  });

  app.whenReady().then(async () => {
    console.log('[App] App is ready');
    console.log('[App] Process args:', process.argv);

    // The splash goes up FIRST, ahead of every piece of startup work below —
    // opening the database, building the main window, and above all the health
    // check and the branch it chooses. Each branch used to raise its own splash
    // after making its decision, which left the screen empty for as long as the
    // decision took: adopting an already-running service waits on
    // ensureBootstrapModel, and that polls for a workspace for up to 15s. The
    // window is cheap and its copy is generic ("Starting…"), so there is no
    // reason to know the branch before showing it.
    createStartingSplash();

    // Open SQLite database
    database.openDatabase();

    // Check for protocol URL in startup args (Windows/Linux). Queue it via
    // dispatchDeepLink — createWindow (below) flushes it on did-finish-load
    // rather than racing a fixed timer.
    const protocolUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (protocolUrl) {
      console.log('[OAuth] Protocol URL found in startup args:', protocolUrl);
      dispatchDeepLink(protocolUrl);
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
    // 1. Health check FIRST. If the service is already running, adopt it
    //    as-is and go straight to the main window — never touch the
    //    download/version-check path while a live service is serving.
    // 2. Service NOT running → version check. If a fresh install or an
    //    upgrade is needed, fetch SLP; otherwise reuse the installed
    //    binary. Then start the service, which is owned by (tied to) this
    //    main process and stopped when the app quits.
    // ──────────────────────────────────────────────────────────────
    const serviceReady = await slpService.checkHealth();

    // A live service is only worth adopting if the framework is actually on
    // disk. The two can disagree: a leftover process keeps answering the health
    // check after its framework has been deleted. Adopting it looked fine
    // (straight to the main window, no splash) right up until that orphan died,
    // and the branch below also wrote "install complete" into the DB, so the app
    // kept insisting it was installed with nothing left to run.
    //
    // verifyFramework() and not !needsInstall(): needsInstall() is also true for
    // a framework that is present and serving but a version behind, and a
    // pending upgrade is no reason to kill a healthy service at startup.
    const frameworkPresent = verifyFramework();

    if (serviceReady && frameworkPresent) {
      // Service is already running (local or external) — go straight to main
      console.log('[SLP] Service healthy — skipping download/version check, going to main window');

      // Ensure DB reflects that install is complete
      if (!database.isFullyInstalled()) {
        for (let step = 0; step < 4; step++) {
          database.setInstallStepComplete(step);
        }
      }

      let baseUrl = slpService.getLocalBaseUrl();
      refreshTray();

      // Same as the install path: a healthy service can still have an empty
      // workspace, and this is what keeps that from becoming a download.
      await ensureBootstrapModel(baseUrl, (progress) => updateSplashProgress(progress));

      const needsBootstrap = await checkNeedsBootstrap(baseUrl);

      // Download blank project template in the background
      downloadBlankTemplate().catch(err => console.warn('[Template] Background download failed:', err.message));

      // A healthy service with no model/project is still a first run: show the
      // setup progress on the splash instead of an empty chat window.
      if (needsBootstrap) {
        console.log('[SLP] Bootstrap needed — holding the splash until it completes');
        baseUrl = await bootstrapOnSplash(baseUrl);
      }

      revealMainWindow(baseUrl);
    } else {
      // Either nothing is running, or something is running that we refused to
      // adopt above. Stop the orphan first — it holds the port this process is
      // about to bind, and it is running code we no longer have on disk.
      if (serviceReady) {
        console.warn('[SLP] Service is answering but no framework is on disk — stopping it and reinstalling');
        try { await slpService.stopService(); } catch (error) {
          console.warn('[SLP] Could not stop the orphaned service:', error.message);
        }
      }

      // Do the version check now: fetch/install SLP only when there's nothing
      // installed or the bundled version is newer than what's on disk.
      // Otherwise just start the installed binary.
      const mustInstall = needsInstall();
      const isFreshInstall = !fs.existsSync(slpService.getSlpBinaryPath());

      if (mustInstall) {
        console.log(
          isFreshInstall
            ? '[SLP] First launch — installing SLP ' + VERSION
            : '[SLP] Service not running and a newer SLP is bundled — upgrading to ' + VERSION
        );
        createSplashScreen();
      } else {
        console.log('[SLP] Service not running — starting installed binary');
        if (!database.isFullyInstalled()) {
          for (let step = 0; step < 4; step++) {
            database.setInstallStepComplete(step);
          }
        }
        createStartingSplash();
      }

      (async () => {
        try {
          // Step 1: Fetch/install SLP if the version check requires it.
          if (mustInstall) {
            // Show the "verifying" beat for continuity, but don't gate the
            // install on GPU vendor: SLP now uses Vulkan, which runs on AMD,
            // Intel and NVIDIA GPUs alike, so the old NVIDIA/CUDA-only check
            // wrongly blocked capable machines. The probe runs in the
            // background — startup never waits on it.
            verifyRequirementsOnSplash();
            updateSplashProgress({ status: 'installing', message: useBundledSlp() ? 'Installing components…' : 'Downloading components…' });
            await setupSlpService((progress) => updateSplashProgress(progress));
            if (!database.isFullyInstalled()) {
              for (let step = 0; step < 4; step++) {
                database.setInstallStepComplete(step);
              }
            }
          } else if (!useBundledSlp() && splashWindow && !splashWindow.isDestroyed()) {
            // Non-bundled builds (Windows/Linux) download the framework from the
            // CDN, so check whether a newer archive is available and reinstall if
            // so. Bundled builds (macOS) ship the framework inside the app and
            // update it only via an app update — no remote version check or
            // re-download.
            const currentVersion = getCurrentVersion();
            updateSplashProgress({ status: 'preparing', message: `Checking for updates (${currentVersion})...` });
            const hasRemoteUpdate = await checkRemoteArchiveHash();
            if (hasRemoteUpdate) {
              console.log('[SLP] Remote archive changed — reinstalling');
              await slpService.stopService();
              const versionDir = path.join(getInstallDir(), VERSION);
              try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch {}
              database.resetInstallStatus();
              await setupSlpService((progress) => updateSplashProgress(progress));
              if (!database.isFullyInstalled()) {
                for (let step = 0; step < 4; step++) {
                  database.setInstallStepComplete(step);
                }
              }
            }
          }

          // Step 2: Start the service (owned by this main process).
          updateSplashProgress({ status: 'preparing', message: 'Starting agent. This might take a while...' });

          const serviceStarted = await slpService.startService();
          if (!serviceStarted) {
            console.error('[SLP] Service failed to start');
            updateSplashProgress({ status: 'error', message: 'Failed to start service. Please restart the app.' });
            return;
          }

          let baseUrl = slpService.getLocalBaseUrl();
          refreshTray();

          // Get the models into the workspace before bootstrap looks for them,
          // so bootstrap reports the model ready instead of downloading 770 MB
          // and document search works offline from the first index.
          await ensureBootstrapModel(baseUrl, (progress) => updateSplashProgress(progress));

          const needsBootstrap = await checkNeedsBootstrap(baseUrl);

          // Download blank project template while splash is still visible
          await downloadBlankTemplate().catch(err => console.warn('[Template] Download failed:', err.message));

          // First run (no model, no project): hold the splash through bootstrap
          // so the model download is visible, then open the main window. When
          // there is nothing to bootstrap, open it right away.
          if (needsBootstrap) {
            console.log('[SLP] Bootstrap needed — holding the splash until it completes');
            baseUrl = await bootstrapOnSplash(baseUrl);
          }

          revealMainWindow(baseUrl);
        } catch (error) {
          console.error('[SLP] Service start failed:', error.message);
          updateSplashProgress({ status: 'error', message: 'Setup failed. Please restart the app.' });
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
          }
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

// Deep links can arrive before the renderer has mounted its IPC listeners
// (cold start, slow SLP bootstrap). Track renderer readiness and queue the most
// recent link until did-finish-load flushes it (see createWindow), instead of
// firing on a fixed timer and dropping callbacks into the void.
let rendererReady = false;
let pendingDeepLink = null;

function dispatchDeepLink(url) {
  if (rendererReady && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    handleDeepLink(url);
  } else {
    console.log('[DeepLink] Renderer not ready — queueing:', url);
    pendingDeepLink = url;
  }
}

// Bring the main window to the foreground (handles hidden-to-tray + minimized).
function focusMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

// Guarded send — mainWindow can be truthy but destroyed during teardown.
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
    return true;
  }
  console.warn('[DeepLink] Renderer unavailable, dropped message on channel:', channel);
  return false;
}

// Handle OAuth callback
// Dispatch an incoming `smartloop://` deep link by URL host:
//   smartloop://open                → show/focus the app window
//   smartloop://oauth?…             → OAuth login callback (handleOAuthCallback)
//   smartloop://mcp-authorization?… → MCP auth callback (handleOAuthCallback)
// Anything else falls through to handleOAuthCallback for backward compatibility
// with existing callback URL shapes. Called from all three deep-link entry
// points (open-url on macOS/Linux; second-instance + startup argv on Windows).
function handleDeepLink(url) {
  let host = '';
  try { host = new URL(url).host.toLowerCase(); } catch { /* malformed — treat as callback */ }

  switch (host) {
    case 'open':
      console.log('[DeepLink] open — showing main window');
      focusMainWindow();
      return;
    default:
      handleOAuthCallback(url);
  }
}

function handleOAuthCallback(url) {
  console.log('[OAuth] Callback received:', url);

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch (err) {
    console.error('[OAuth] Malformed callback URL, ignoring:', err.message);
    return;
  }

  const action = (urlObj.hostname || urlObj.pathname.replace(/^\/+/, '')).toLowerCase();

  // MCP authorization callback. server_id / error come from an external URL that
  // any local process can invoke — treat them as untrusted. The renderer must
  // match server_id against a pending auth flow it initiated before acting on it.
  if (action === 'mcp-authorization') {
    const serverId = urlObj.searchParams.get('server_id');
    const error = urlObj.searchParams.get('error');

    console.log('[MCP Auth] Callback - server_id:', serverId || 'none', 'error:', error || 'none');

    let payload;
    if (error) payload = { error };
    else if (serverId) payload = { serverId };
    else payload = { error: 'No server_id received' };

    sendToRenderer('mcp-auth-callback', payload);
    focusMainWindow();
    return;
  }

  // All other callbacks (including "oauth"): tokens are delivered via localhost
  // POST, never through the URL scheme, so there's nothing to parse — just
  // surface the window.
  //
  // Reaching here does say something, though: the provider is done with the
  // user and has handed the browser back to us. With the consent page out in
  // the browser this is the only handback the app gets, and it means the tokens
  // are landing now rather than somewhere in the next five minutes — so stop
  // waiting patiently and poll hard for the seconds it takes.
  if (action === 'oauth') accelerateLoginWait();
  console.log('[Deep Link] Focusing window for:', action);
  focusMainWindow();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Set once the quit is committed, so the shutdown below runs exactly once.
let shuttingDown = false;

// Longest the app will wait on SLP before quitting regardless.
const QUIT_STOP_TIMEOUT_MS = 8000;

app.on('before-quit', (event) => {
  // Windows read this to decide whether close means hide-to-tray or really
  // close, so it has to be true from the first pass.
  app.isQuitting = true;

  if (shuttingDown) return;
  shuttingDown = true;

  // Hold the quit open until SLP is actually dead. Firing stopService() and
  // letting Electron exit underneath it is how the server ended up outliving
  // the app: the process is not ours to clean up once we're gone, so it kept
  // serving on the port and the next launch adopted the orphan.
  event.preventDefault();

  // Nothing below draws, and the stop can take a moment — take every trace of
  // the app off the screen now so quitting still *looks* immediate. The tray
  // icon goes with the windows: it outlives them otherwise, and a menu-bar icon
  // whose menu no longer does anything is the most visible way to look hung.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.hide();
  }
  try {
    destroyTray();
  } catch (error) {
    console.warn('[App] Error removing the tray icon:', error.message);
  }

  healthMonitor.stop();
  releaseChecker.stop();

  try {
    database.closeDatabase();
  } catch (error) {
    console.warn('[App] Error closing database:', error.message);
  }

  const stopped = slpService.stopService().catch((error) => {
    console.warn('[App] Error stopping SLP service:', error.message);
  });

  // Quitting is now gated on that stop, so it gets a ceiling: a stop that hangs
  // must not turn into an app that won't close. The stop keeps its own grace
  // periods well inside this — reaching it means something is badly stuck, and
  // leaving the process behind beats refusing to quit.
  const capped = Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(() => {
      console.warn(`[App] SLP did not stop within ${QUIT_STOP_TIMEOUT_MS}ms — quitting anyway`);
      resolve();
    }, QUIT_STOP_TIMEOUT_MS)),
  ]);

  capped.finally(() => {
    // exit() rather than quit(): the teardown this handler exists for is
    // done, and quit() would only walk back through here.
    app.exit(0);
  });
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
