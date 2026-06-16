const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const Store = require('electron-store').default || require('electron-store');
const { machineId, machineIdSync } = require('node-machine-id');
const { setupSlpService, uninstallSlpService, needsInstall, VERSION, listInstalledVersions, switchVersion, getCurrentVersion } = require('./slp-setup');
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

// Reveal a file in Finder / Explorer
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  if (filePath) {
    const resolved = filePath.startsWith('~')
      ? filePath.replace('~', require('os').homedir())
      : filePath;
    shell.showItemInFolder(resolved);
    return true;
  }
  return false;
});

// Initialize electron-store
const store = new Store({ name: 'smartloop-studio', encryptionKey: machineIdSync() });

// SLP install directory is always ~/.smartloop/ regardless of where the app is installed.
// This keeps the binary, config, and data in a consistent, well-known location.

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

// IPC: extract conversations from a zip file (reads conversations/*.jsonl entries)
ipcMain.handle('extract-conversations-from-zip', async (event, zipPath) => {
  try {
    const resolved = zipPath.startsWith('~')
      ? path.join(os.homedir(), zipPath.replace(/^~[/\\]?/, ''))
      : zipPath;
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found', conversations: [] };

    // List files in the zip matching conversations/*.jsonl
    const { execFileSync } = require('child_process');
    const isWin = process.platform === 'win32';
    const listOutput = isWin
      ? execFileSync('tar', ['-tf', resolved], { timeout: 10000 }).toString()
      : execFileSync('unzip', ['-l', resolved], { timeout: 10000 }).toString();
    const conversationFiles = listOutput
      .split('\n')
      .map(line => line.trim())
      .filter(line => /conversations\/[^/]+\.jsonl$/.test(line))
      .map(line => {
        if (isWin) return line || null;
        const match = line.match(/(conversations\/[^\s]+\.jsonl)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const conversations = [];
    for (const filePath of conversationFiles) {
      try {
        const content = isWin
          ? execFileSync('tar', ['-xOf', resolved, filePath], { timeout: 10000 }).toString()
          : execFileSync('unzip', ['-p', resolved, filePath], { timeout: 10000 }).toString();
        const lines = content.split('\n').filter(l => l.trim());
        const messages = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        // Derive conversation ID from filename
        const convId = path.basename(filePath, '.jsonl');
        // Use first user message as title
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

// Helper: read the SLP config.json and find the workspace project directory for a given project ID
function getSlpProjectDir(projectId) {
  const configPath = path.join(os.homedir(), '.smartloop', 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const workspaceId = config?.workspace?.id;
    if (!workspaceId) return null;
    const projects = config?.workspace?.projects || [];
    const match = projects.find(p => p.id === projectId);
    if (match?.project_dir && fs.existsSync(match.project_dir)) return match.project_dir;
    // Fallback: try the conventional path
    const conventionalDir = path.join(os.homedir(), '.smartloop', workspaceId, projectId);
    return fs.existsSync(conventionalDir) ? conventionalDir : null;
  } catch {
    return null;
  }
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
    if (process.platform === 'win32') {
      execFileSync('tar', ['-xf', slpZipPath, '-C', exportDir], { timeout: 120000 });
    } else {
      execFileSync('unzip', ['-o', slpZipPath, '-d', exportDir], { timeout: 120000 });
    }
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

    const manifest = {
      version: 2,
      exported_at: new Date().toISOString(),
      project,
      conversations: conversationsWithMessages,
      mcp_servers: mcpServers,
      folders,
      document_folders: documentFolders,
      document_status: documentStatus,
      tab_state: tabState || null,
    };

    fs.writeFileSync(path.join(exportDir, 'project.json'), JSON.stringify(manifest, null, 2));

    // Write conversations as individual JSONL files for backwards compatibility
    const convDir = path.join(exportDir, 'conversations');
    fs.mkdirSync(convDir, { recursive: true });
    for (const conv of conversationsWithMessages) {
      const lines = conv.messages.map(m => JSON.stringify(m)).join('\n');
      fs.writeFileSync(path.join(convDir, `${conv.id}.jsonl`), lines);
    }

    const slugName = (project.name || 'project').replace(/\s+/g, '_').toLowerCase();
    const zipFileName = `${slugName}.zip`;
    const zipPath = path.join(tmpDir, zipFileName);

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: exportDir, timeout: 120000 });
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
    if (process.platform === 'win32') {
      execFileSync('tar', ['-xf', resolved, '-C', tmpDir], { timeout: 120000 });
    } else {
      execFileSync('unzip', ['-o', resolved, '-d', tmpDir], { timeout: 120000 });
    }

    const manifestPath = path.join(tmpDir, 'project.json');
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (e) {
        console.warn('[Import] Failed to parse project.json:', e.message);
      }
    }

    const projectName = overrides?.name || manifest?.project?.name || 'Imported Project';
    const projectColor = overrides?.color || manifest?.project?.color || null;
    const projectSlug = projectName.trim().toLowerCase().replace(/\s+/g, '_');

    // Use cwd if provided, otherwise construct from project slug
    const newFolderPath = overrides?.cwd || path.join(os.homedir(), 'smartloop', projectSlug);

    // Register the project with the SLP backend via its import API
    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return { success: false, error: 'Local service is not running' };
    }

    const fileBuffer = fs.readFileSync(resolved);
    const fileName = path.basename(resolved);
    const file = new File([fileBuffer], fileName, { type: 'application/zip' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', projectSlug);

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
    const resolvedFolderPath = createdProject.cwd || newFolderPath;

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

// Get the path to the bundled blank project template zip
ipcMain.handle('get-template-zip-path', () => {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, 'data', 'project_1.zip');
  }
  return path.join(process.resourcesPath, 'data', 'project_1.zip');
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

// IPC: get app (package) version
ipcMain.handle('get-app-version', () => app.getVersion());

// IPC: get local API URL
ipcMain.handle('get-local-api-url', async () => {
  return slpService.getLocalBaseUrl();
});

// IPC: add document via local SLP (proxied through main process to avoid CORS/Broken Pipe)
// The POST endpoint returns an SSE stream with event types: queued, progress, done
ipcMain.handle('slp-add-document', async (event, filePath, projectId, cwd, generateFilename) => {
  const http = require('http');
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'SLP service not running' };

  const docPath = projectId ? `/v1/projects/${projectId}/documents` : '/v1/documents';
  const url = new URL(`${baseUrl}${docPath}`);
  const bodyObj = { source: filePath };
  if (cwd) bodyObj.cwd = cwd;
  if (generateFilename) bodyObj.generate_filename = true;
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

// Bootstrap the SLP service via SSE endpoint
// Handles workspace creation, model download, project creation, and model loading
const { bootstrapProgress } = require('./bootstrap-progress.js');

/**
 * Determine whether the SLP service needs bootstrapping — i.e. it has no
 * projects yet or no model loaded. Returns true on any error (assume needed).
 */
async function checkNeedsBootstrap(baseUrl) {
  try {
    const http = require('http');
    const getJson = (urlStr) => new Promise((resolve) => {
      const u = new URL(urlStr);
      http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      }).on('error', () => resolve(null));
    });

    const projectsData = await getJson(`${baseUrl}/v1/projects`);
    const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.projects || []);
    const health = (await getJson(`${baseUrl}/health`)) || {};

    const hasProjects = projects.length > 0;
    const hasModel = health.status === 'healthy';

    if (!hasProjects) console.log('[SLP] No projects found — bootstrap needed');
    if (!hasModel) console.log('[SLP] Service not healthy — bootstrap needed');

    return !hasProjects || !hasModel;
  } catch {
    return true;
  }
}

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
          mainWindow.webContents.send('bootstrap-complete');
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
      document.getElementById('status-text').textContent = 'Starting agent...';
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

// IPC: init/select a model — downloads + sets up if missing, streams SSE progress
ipcMain.handle('slp-init-model', async (event, modelName) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };

  return new Promise((resolve) => {
    const http = require('http');
    const url = new URL(`${baseUrl}/v1/init`);

    const postData = JSON.stringify({ model_name: modelName });

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

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('model-init-progress', {
                  ...progress,
                  model: modelName,
                });
              }
            } catch {
              // ignore unparseable SSE data
            }
          }
        }
      });

      res.on('end', async () => {
        // Persist selected_model in the SLP user profile
        try {
          await fetch(`${baseUrl}/v1/users/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected_model: modelName }),
          });
        } catch (err) { console.warn('Failed to persist selected_model:', err.message); }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('model-init-progress', {
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

// IPC: enable/disable a model for orchestrator selection
// If the model is not in workspace yet, downloads it first, then enables.
ipcMain.handle('slp-set-model-enabled', async (event, modelName, enabled) => {
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return { success: false, error: 'No local service' };

  // Check if model exists in workspace
  let existsInWorkspace = false;
  try {
    const wsRes = await fetch(`${baseUrl}/v1/models/workspace`);
    if (wsRes.ok) {
      const wsData = await wsRes.json();
      const wsList = Array.isArray(wsData) ? wsData : (wsData.data || wsData.models || []);
      const wsNames = wsList.map(wm => wm.model_name || wm.name);
      existsInWorkspace = wsList.some(wm => wm.model_name === modelName || wm.name === modelName);
      console.log(`[Models] set-model-enabled: looking for "${modelName}" in workspace: [${wsNames.join(', ')}] → ${existsInWorkspace}`);
      if (!existsInWorkspace && cachedModels) {
        const entry = cachedModels.find(m => (m.name || m.id || m.model) === modelName);
        if (entry) console.log(`[Models] model entry from /v1/models:`, JSON.stringify(entry));
      }
    } else {
      console.log(`[Models] set-model-enabled: workspace fetch failed: HTTP ${wsRes.status}`);
    }
  } catch (err) {
    console.log(`[Models] set-model-enabled: workspace fetch error: ${err.message}`);
  }

  if (!existsInWorkspace && enabled) {
    console.log(`[Models] ${modelName} not in workspace, downloading...`);
    try {
      const http = require('http');
      const dlUrl = new URL(`${baseUrl}/v1/models/download`);
      const postData = JSON.stringify({ model: modelName });
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: dlUrl.hostname,
          port: dlUrl.port,
          path: dlUrl.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        }, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
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
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('model-download-progress', { ...progress, model: modelName });
                  }
                } catch {}
              }
            }
          });
          res.on('end', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('model-download-progress', { model: modelName, percent: 100, status: 'Complete' });
            }
            resolve(true);
          });
          res.on('error', reject);
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      console.log(`[Models] Download complete for ${modelName}`);
    } catch (err) {
      console.error('[Models] Download error:', err.message);
      return { success: false, error: err.message };
    }

    // Re-check workspace for the new name
    try {
      const wsRes2 = await fetch(`${baseUrl}/v1/models/workspace`);
      if (wsRes2.ok) {
        const wsData2 = await wsRes2.json();
        const wsList2 = Array.isArray(wsData2) ? wsData2 : (wsData2.data || wsData2.models || []);
        const wsModel = wsList2.find(wm => (wm.name || wm.model_name || wm.model) === modelName);
        if (wsModel) {
          modelName = wsModel.name || wsModel.model_name || modelName;
        }
      }
    } catch {}
  }

  try {
    const url = `${baseUrl}/v1/models/workspace/${modelName}`;
    console.log(`[Models] PATCH ${url} enabled=${enabled}`);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const text = await res.text();
    console.log(`[Models] PATCH response: ${res.status} ${text}`);
    if (res.ok) {
      try {
        return { success: true, ...JSON.parse(text) };
      } catch {
        return { success: true };
      }
    }
    return { success: false, error: `HTTP ${res.status}: ${text}` };
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
      // Fetch user profile and models now that we have a token
      fetchUserProfile(true);
      fetchModels(true);
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
  clearCachedUser();
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

// --- Centralized user profile management ---
let cachedUserProfile = null;
let lastUserFetchTime = 0;
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchUserProfile(force = false) {
  const now = Date.now();
  if (!force && cachedUserProfile && now - lastUserFetchTime < USER_CACHE_TTL) {
    return cachedUserProfile;
  }
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/users/me`);
    if (res.ok) {
      const result = await res.json();
      cachedUserProfile = {
        email: result.email,
        name: result.name,
        verified: result.is_verified,
        admin: result.is_superuser,
        is_paid: result.is_paid || false,
        premium: result.is_paid || false,
        selected_model: result.selected_model || null,
        tokens: result.tokens,
        number_of_tokens_processed: result.number_of_tokens_processed || 0,
        projects: result.projects,
        conversations: result.conversations || [],
        default_temperature: result.default_temperature !== undefined ? result.default_temperature : 0.3,
        default_memory: result.default_memory !== undefined ? result.default_memory : true,
        onboarded: result.onboarded !== undefined ? result.onboarded : false,
      };
      lastUserFetchTime = now;
      // Broadcast to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('user-profile-updated', cachedUserProfile);
      }
      return cachedUserProfile;
    }
    return null;
  } catch (err) {
    console.error('[User] Error fetching profile:', err.message);
    return null;
  }
}

function clearCachedUser() {
  cachedUserProfile = null;
  lastUserFetchTime = 0;
  cachedModels = null;
  lastModelsFetchTime = 0;
}

// IPC: Renderer requests user profile (throttled)
ipcMain.handle('slp-fetch-user', async (event, opts) => {
  const force = opts?.force || false;
  const profile = await fetchUserProfile(force);
  return { success: !!profile, user: profile };
});

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
      const profile = await fetchUserProfile(true);
      return { success: true, user: profile };
    } else {
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Centralized model list management ---
let cachedModels = null;
let lastModelsFetchTime = 0;
const MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchModels(force = false) {
  const now = Date.now();
  if (!force && cachedModels && now - lastModelsFetchTime < MODELS_CACHE_TTL) {
    return cachedModels;
  }
  const baseUrl = slpService.getLocalBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/models`);
    if (res.ok) {
      const data = await res.json();
      cachedModels = Array.isArray(data) ? data : (data.data || data.models || []);
      lastModelsFetchTime = now;
      return cachedModels;
    }
    return cachedModels; // return stale cache on HTTP error
  } catch (err) {
    console.warn('[Models] Error fetching models:', err.message);
    return cachedModels; // return stale cache on network error
  }
}

// IPC: Fetch available models from local SLP service (cached)
ipcMain.handle('slp-list-models', async (event, force) => {
  const models = await fetchModels(force);
  if (!models) return { success: false, error: 'No local service' };

  // Merge enabled state from workspace endpoint
  const baseUrl = slpService.getLocalBaseUrl();
  if (baseUrl) {
    try {
      const wsRes = await fetch(`${baseUrl}/v1/models/workspace`);
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        const wsList = Array.isArray(wsData) ? wsData : (wsData.data || wsData.models || []);
        const wsMap = new Map();
        for (const wm of wsList) {
          wsMap.set(wm.model_name, wm);
          if (wm.name && wm.name !== wm.model_name) wsMap.set(wm.name, wm);
          if (wm.model_id) wsMap.set(wm.model_id, wm);
        }
        for (const model of models) {
          const key = model.name || model.id || model.model;
          const ws = wsMap.get(key) || wsMap.get(model.model_name) || wsMap.get(model.id);
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
      }
    } catch (err) {
      console.warn('[Models] Error fetching workspace models:', err.message);
    }
  }

  return { success: true, models };
});

// IPC: Download a model via local SLP service (SSE streaming progress)
ipcMain.handle('slp-download-model', async (event, modelName) => {
  console.log(`[Models] Download requested: ${modelName}`);
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

const splashThemes = {
  smartloop: {
    '--sl-bg-base': '#000000', '--sl-bg-surface-1': '#1a1a1a', '--sl-bg-surface-2': '#2a2a2a', '--sl-bg-surface-3': '#3a3a3a',
    '--sl-brand-primary': '#ec4899', '--sl-text-primary': '#ffffff', '--sl-text-secondary': '#e5e7eb',
    '--sl-text-disabled': '#6b7280', '--sl-text-faint': '#4b5563', '--sl-border-default': '#2a2a2a',
  },
  'smartloop-light': {
    '--sl-bg-base': '#ffffff', '--sl-bg-surface-1': '#f5f5f5', '--sl-bg-surface-2': '#ebebeb', '--sl-bg-surface-3': '#e0e0e0',
    '--sl-brand-primary': '#db2777', '--sl-text-primary': '#1a1a1a', '--sl-text-secondary': '#374151',
    '--sl-text-disabled': '#8b95a3', '--sl-text-faint': '#9ca3af', '--sl-border-default': '#d4d4d4',
  },
  rams: {
    '--sl-bg-base': '#171412', '--sl-bg-surface-1': '#211d18', '--sl-bg-surface-2': '#2d2822', '--sl-bg-surface-3': '#3d362e',
    '--sl-brand-primary': '#d35b36', '--sl-text-primary': '#f2efe9', '--sl-text-secondary': '#d4cbc3',
    '--sl-text-disabled': '#6b655e', '--sl-text-faint': '#4a4540', '--sl-border-default': '#2d2822',
  },
};

function applySplashTheme() {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const themeId = store.get('app_theme', 'smartloop');
  const vars = splashThemes[themeId] || splashThemes.smartloop;
  const css = Object.entries(vars).map(([k, v]) => `document.documentElement.style.setProperty('${k}', '${v}');`).join('\n');
  splashWindow.webContents.executeJavaScript(css).catch(() => {});
}

function createSplashWindow() {
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
  splashWindow.webContents.on('did-finish-load', applySplashTheme);
}

function createSplashScreen() {
  createSplashWindow();
}

function createStartingSplash() {
  createSplashWindow();
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

  // On focus: check auth status and refresh user profile (throttled)
  mainWindow.on('focus', async () => {
    const baseUrl = slpService.getLocalBaseUrl();
    if (!baseUrl) return;
    try {
      const res = await fetch(`${baseUrl}/v1/auth/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.has_access_token) {
          fetchUserProfile(); // throttled by TTL
        }
      }
    } catch { }
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
    // 1. Health check FIRST. If the service is already running, adopt it
    //    as-is and go straight to the main window — never touch the
    //    download/version-check path while a live service is serving.
    // 2. Service NOT running → version check. If a fresh install or an
    //    upgrade is needed, fetch SLP; otherwise reuse the installed
    //    binary. Then start the service, which is owned by (tied to) this
    //    main process and stopped when the app quits.
    // ──────────────────────────────────────────────────────────────
    const serviceReady = await slpService.checkHealth();

    if (serviceReady) {
      // Service is already running (local or external) — go straight to main
      console.log('[SLP] Service healthy — skipping download/version check, going to main window');

      // Ensure DB reflects that install is complete
      if (!database.isFullyInstalled()) {
        for (let step = 0; step < 4; step++) {
          database.setInstallStepComplete(step);
        }
      }

      const baseUrl = slpService.getLocalBaseUrl();
      refreshTray();

      const needsBootstrap = await checkNeedsBootstrap(baseUrl);

      if (mainWindow && !mainWindow.isDestroyed()) {
        setAppReady(true);
        mainWindow.show();
        mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
      }

      if (needsBootstrap) {
        console.log('[SLP] Bootstrapping in background');
        (async () => {
          try {
            await bootstrapSlpService(baseUrl);
            refreshTray();
          } catch (error) {
            console.error('[SLP] Bootstrap failed:', error.message);
          } finally {
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.close();
              splashWindow = null;
            }
          }
        })();
      } else if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
    } else {
      // Service is not running. Do the version check now: fetch/install SLP
      // only when there's nothing installed or the bundled version is newer
      // than what's on disk. Otherwise just start the installed binary.
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
            await setupSlpService((progress) => updateSplashProgress(progress));
            if (!database.isFullyInstalled()) {
              for (let step = 0; step < 4; step++) {
                database.setInstallStepComplete(step);
              }
            }
          } else if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.executeJavaScript(`
              document.querySelector('.status-text').textContent = 'Heating things up...';
            `);
          }

          // Step 2: Start the service (owned by this main process).
          updateSplashProgress({ status: 'preparing', message: 'Starting agent. This might take a while...' });

          const serviceStarted = await slpService.startService();
          if (!serviceStarted) {
            console.error('[SLP] Service failed to start');
            updateSplashProgress({ status: 'error', message: 'Failed to start service. Please restart the app.' });
            return;
          }

          const baseUrl = slpService.getLocalBaseUrl();
          refreshTray();

          const needsBootstrap = await checkNeedsBootstrap(baseUrl);

          // Show main window immediately once the service is ready; bootstrap
          // continues in the background so startup feels faster.
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            setAppReady(true);
            mainWindow.show();
            mainWindow.webContents.send('slp-service-ready', { port: slpService.getPort(), baseUrl });
            fetchModels(); // prime model cache
          }

          if (needsBootstrap) {
            console.log('[SLP] Bootstrap needed — running in background');
            (async () => {
              try {
                await bootstrapSlpService(baseUrl);
                refreshTray();
              } catch (error) {
                console.error('[SLP] Bootstrap failed:', error.message);
              }
            })();
          }
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

app.on('before-quit', () => {
  app.isQuitting = true;

  try {
    database.closeDatabase();
  } catch (error) {
    console.warn('[App] Error closing database:', error.message);
  }

  slpService.stopService().catch((error) => {
    console.warn('[App] Error stopping SLP service:', error.message);
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
