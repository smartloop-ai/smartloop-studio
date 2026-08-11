const { contextBridge, ipcRenderer, clipboard } = require('electron');
const { createTitlebarOnDOMContentLoaded, TitlebarColor } = require('custom-electron-titlebar');

let titlebarInstance = null;

createTitlebarOnDOMContentLoaded({
  removeMenuBar: true,
  backgroundColor: TitlebarColor.fromHex('#000000'),
}).then((titlebar) => {
  titlebarInstance = titlebar;
  // On Linux and Windows, keep the left side of the titlebar blank instead of
  // rendering the favicon (broken image on Linux, redundant logo on Windows).
  if (process.platform === 'linux' || process.platform === 'win32') {
    document.querySelector('.cet-titlebar .cet-icon')?.remove();
  }
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any IPC communication methods here as needed
  // Example:
  sendMessage: (channel, data) => {
    // Whitelist channels
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receiveMessage: (channel, func) => {
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // OAuth methods
  oauthLogin: () => ipcRenderer.invoke('oauth-login'),
  // MCP authorization callback
  onMcpAuthCallback: (callback) => {
    ipcRenderer.on('mcp-auth-callback', (event, data) => callback(data));
  },
  removeMcpAuthCallbackListener: () => {
    ipcRenderer.removeAllListeners('mcp-auth-callback');
  },
  // Open external URL in default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // In-app contact form → marketing-site intake, posted from main (see main.js).
  submitContact: (payload) => ipcRenderer.invoke('contact-submit', payload),
  // Open a folder in Finder / file manager
  openInFinder: (path, options) => ipcRenderer.invoke('open-in-finder', path, options),
  // Reveal a specific file in Finder / Explorer
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  // Open a document reference (citation) with the system's native viewer
  openDocumentReference: (filePath, documentId, projectId) => ipcRenderer.invoke('open-document-reference', filePath, documentId, projectId),
  // Save a copy of a local document to a user-chosen location
  downloadDocument: (filePath) => ipcRenderer.invoke('download-document', filePath),
  // Storage methods - native Electron storage using electron-store
  storageGet: (key) => ipcRenderer.invoke('storage-get', key),
  storageSet: (key, value) => ipcRenderer.invoke('storage-set', key, value),
  storageRemove: (key) => ipcRenderer.invoke('storage-remove', key),
  storageClear: () => ipcRenderer.invoke('storage-clear'),
  storageHas: (key) => ipcRenderer.invoke('storage-has', key),
  storageGetAll: () => ipcRenderer.invoke('storage-get-all'),
  // Native theme
  setNativeTheme: (mode, bgColor) => {
    ipcRenderer.invoke('set-native-theme', mode, bgColor);
    if (titlebarInstance && bgColor) {
      // Title bar uses the main content area color (theme bg.base) so the top
      // band reads as one uniform strip with the base-colored logo header.
      titlebarInstance.updateBackground(TitlebarColor.fromHex(bgColor));
    }
  },
  // Machine ID
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  // Local SLP service
  getLocalApiUrl: () => ipcRenderer.invoke('get-local-api-url'),
  getSlpCwd: () => ipcRenderer.invoke('get-slp-cwd'),
  slpAddDocument: (filePath, projectId, cwd, generateFilename) => ipcRenderer.invoke('slp-add-document', filePath, projectId, cwd, generateFilename),
  onSlpDocumentProgress: (callback) => {
    ipcRenderer.on('slp-document-progress', (event, data) => callback(data));
  },
  removeSlpDocumentProgressListener: () => {
    ipcRenderer.removeAllListeners('slp-document-progress');
  },
  getSlpConfig: () => ipcRenderer.invoke('get-slp-config'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  // Storage / free-up-space
  getStorageUsage: () => ipcRenderer.invoke('storage-usage'),
  cleanupStorage: (opts) => ipcRenderer.invoke('storage-cleanup', opts),
  getFrameworkVersion: () => ipcRenderer.invoke('get-framework-version'),
  // Command-line tool (`slp` on PATH) — opt-in install from Settings
  getCommandLineStatus: () => ipcRenderer.invoke('command-line-status'),
  installCommandLine: () => ipcRenderer.invoke('command-line-install'),
  uninstallCommandLine: () => ipcRenderer.invoke('command-line-uninstall'),
  commandExists: (cmd) => ipcRenderer.invoke('command-exists', cmd),
  unloadModel: () => ipcRenderer.invoke('unload-model'),
  loadModel: () => ipcRenderer.invoke('load-model'),
  // SLP auth and model management
  slpAuthStatus: () => ipcRenderer.invoke('slp-auth-status'),
  slpAuthLogout: () => ipcRenderer.invoke('slp-auth-logout'),
  slpFetchUser: () => ipcRenderer.invoke('slp-fetch-user'),
  slpUpdateUserSettings: (settings) => ipcRenderer.invoke('slp-update-user-settings', settings),
  slpListModels: () => ipcRenderer.invoke('slp-list-models'),
  slpMcpCatalog: () => ipcRenderer.invoke('slp-mcp-catalog'),
  slpInitModel: (modelName) => ipcRenderer.invoke('slp-init-model', modelName),
  slpSetModelEnabled: (modelName, enabled) => ipcRenderer.invoke('slp-set-model-enabled', modelName, enabled),
  onModelInitProgress: (callback) => {
    ipcRenderer.on('model-init-progress', (event, data) => callback(data));
  },
  removeModelInitProgressListener: () => {
    ipcRenderer.removeAllListeners('model-init-progress');
  },
  slpDownloadModel: (modelName) => ipcRenderer.invoke('slp-download-model', modelName),
  slpCancelModelDownload: (modelName) => ipcRenderer.invoke('slp-cancel-model-download', modelName),
  onModelDownloadProgress: (callback) => {
    ipcRenderer.on('model-download-progress', (event, data) => callback(data));
  },
  removeModelDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('model-download-progress');
  },
  onModelsUpdated: (callback) => {
    ipcRenderer.on('models-updated', (event, data) => callback(data));
  },
  removeModelsUpdatedListener: () => {
    ipcRenderer.removeAllListeners('models-updated');
  },
  // SLP version management
  slpListVersions: () => ipcRenderer.invoke('slp-list-versions'),
  slpSwitchVersion: (version) => ipcRenderer.invoke('slp-switch-version', version),
  // SLP service lifecycle
  slpServiceStart: () => ipcRenderer.invoke('slp-service-start'),
  slpServiceStop: () => ipcRenderer.invoke('slp-service-stop'),
  slpServiceRestart: () => ipcRenderer.invoke('slp-service-restart'),
  slpServiceStatus: () => ipcRenderer.invoke('slp-service-status'),
  slpServiceUninstall: () => ipcRenderer.invoke('slp-service-uninstall'),
  onSlpServiceReady: (callback) => {
    ipcRenderer.on('slp-service-ready', (event, data) => callback(data));
  },
  removeSlpServiceReadyListener: () => {
    ipcRenderer.removeAllListeners('slp-service-ready');
  },
  pokeHealth: () => ipcRenderer.invoke('slp-health-poke'),
  onHealthUpdate: (callback) => {
    ipcRenderer.on('health-update', (event, data) => callback(data));
  },
  removeHealthUpdateListener: () => {
    ipcRenderer.removeAllListeners('health-update');
  },
  // Transient agent-restarting signal (e.g. during a Clean). Kept off the global
  // health-update channel so it doesn't trigger project/UI reconciles.
  onAgentRestarting: (callback) => {
    ipcRenderer.on('agent-restarting', (event, data) => callback(data));
  },
  removeAgentRestartingListener: () => {
    ipcRenderer.removeAllListeners('agent-restarting');
  },
  // App release / update check
  checkForUpdates: () => ipcRenderer.invoke('release-check-now'),
  getLatestRelease: () => ipcRenderer.invoke('release-get-latest'),
  onReleaseUpdate: (callback) => {
    ipcRenderer.on('release-update', (event, data) => callback(data));
  },
  removeReleaseUpdateListener: () => {
    ipcRenderer.removeAllListeners('release-update');
  },
  // In-app updater (electron-updater)
  isUpdaterSupported: () => ipcRenderer.invoke('updater-supported'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater-quit-and-install'),
  pauseUpdate: () => ipcRenderer.invoke('updater-pause'),
  resumeUpdate: () => ipcRenderer.invoke('updater-resume'),
  onUpdaterStatus: (callback) => {
    ipcRenderer.on('updater-status', (event, data) => callback(data));
  },
  removeUpdaterStatusListener: () => {
    ipcRenderer.removeAllListeners('updater-status');
  },
  getUpdaterStatus: () => ipcRenderer.invoke('updater-get-status'),
  onNavigateToProject: (callback) => {
    ipcRenderer.on('navigate-to-project', (event, projectId) => callback(projectId));
  },
  removeNavigateToProjectListener: () => {
    ipcRenderer.removeAllListeners('navigate-to-project');
  },
  // Chrome-style close-tab shortcut, forwarded from the main process
  onCloseTabShortcut: (callback) => {
    ipcRenderer.on('shortcut-close-tab', () => callback());
  },
  removeCloseTabShortcutListener: () => {
    ipcRenderer.removeAllListeners('shortcut-close-tab');
  },
  // Bootstrap progress
  onBootstrapProgress: (callback) => {
    ipcRenderer.on('bootstrap-progress', (event, data) => callback(data));
  },
  removeBootstrapProgressListener: () => {
    ipcRenderer.removeAllListeners('bootstrap-progress');
  },
  onBootstrapComplete: (callback) => {
    ipcRenderer.on('bootstrap-complete', () => callback());
  },
  removeBootstrapCompleteListener: () => {
    ipcRenderer.removeAllListeners('bootstrap-complete');
  },
  // Save a file to a temp directory (for local SLP document upload)
  saveTempFile: (fileName, buffer) => ipcRenderer.invoke('save-temp-file', fileName, buffer),
  // Read an uploaded SLP asset as a data URL (for inline image attachment display)
  readAssetDataUrl: (assetId) => ipcRenderer.invoke('read-asset-data-url', assetId),
  // Read a text file from disk
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  // Write a text file to a specific path on disk
  writeTextFile: (filePath, content) => ipcRenderer.invoke('write-text-file', filePath, content),
  // List supported document files in a directory
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  // Read all skills from ~/smartloop/<projectId>/skills/ directory
  readSkillsDir: (projectId) => ipcRenderer.invoke('read-skills-dir', projectId),
  // Delete a file from disk
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  // Recursively delete a folder from disk
  deleteFolder: (folderPath) => ipcRenderer.invoke('delete-folder', folderPath),
  // Rename a folder on disk
  renameFolder: (oldPath, newPath) => ipcRenderer.invoke('rename-folder', oldPath, newPath),
  // Extract conversations from a zip file (conversations/*.jsonl)
  extractConversationsFromZip: (zipPath) => ipcRenderer.invoke('extract-conversations-from-zip', zipPath),
  // Export a project to a zip file (fully local)
  exportProject: (projectId) => ipcRenderer.invoke('export-project', projectId),
  // Import a project from a zip file (fully local)
  importProject: (zipPath, overrides) => ipcRenderer.invoke('import-project', zipPath, overrides),
  // Select a file using native file dialog (with optional filters)
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  // Read a binary file from disk (returns { success, buffer } or { success, error })
  readBinaryFile: (filePath) => ipcRenderer.invoke('read-binary-file', filePath),
  // Select a folder using native file dialog
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  // Get the OS home directory
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  // Get the path to the bundled blank project template zip
  getTemplateZipPath: () => ipcRenderer.invoke('get-template-zip-path'),
  // Projects: centralized /v1/projects access (list + CRUD live in main.js).
  // Mutations broadcast `projects-changed` → DOM `projectsChanged` event below.
  projects: {
    list: () => ipcRenderer.invoke('projects-list'),
    create: (params) => ipcRenderer.invoke('projects-create', params),
    update: (id, updates) => ipcRenderer.invoke('projects-update', id, updates),
    delete: (id) => ipcRenderer.invoke('projects-delete', id),
  },
  // SQLite database methods
  db: {
    // Projects
    upsertProject: (project) => ipcRenderer.invoke('db-upsert-project', project),
    getProject: (id) => ipcRenderer.invoke('db-get-project', id),
    getAllProjects: () => ipcRenderer.invoke('db-get-all-projects'),
    updateProject: (id, updates) => ipcRenderer.invoke('db-update-project', id, updates),
    deleteProject: (id) => ipcRenderer.invoke('db-delete-project', id),
    // Conversations
    createConversation: (conv) => ipcRenderer.invoke('db-create-conversation', conv),
    getConversation: (id) => ipcRenderer.invoke('db-get-conversation', id),
    getConversations: (projectId, order) => ipcRenderer.invoke('db-get-conversations', projectId, order),
    updateConversation: (id, updates) => ipcRenderer.invoke('db-update-conversation', id, updates),
    deleteConversation: (id) => ipcRenderer.invoke('db-delete-conversation', id),
    deleteConversationsByProject: (projectId) => ipcRenderer.invoke('db-delete-conversations-by-project', projectId),
    selectConversation: (id) => ipcRenderer.invoke('db-select-conversation', id),
    clearSelectedConversation: () => ipcRenderer.invoke('db-clear-selected-conversation'),
    getSelectedConversation: () => ipcRenderer.invoke('db-get-selected-conversation'),
    // Messages
    addMessage: (msg) => ipcRenderer.invoke('db-add-message', msg),
    addMessages: (conversationId, msgs) => ipcRenderer.invoke('db-add-messages', conversationId, msgs),
    getMessages: (conversationId) => ipcRenderer.invoke('db-get-messages', conversationId),
    deleteMessages: (conversationId) => ipcRenderer.invoke('db-delete-messages', conversationId),
    // Memory usage
    addMemoryUsage: (memoryPercent) => ipcRenderer.invoke('db-add-memory-usage', memoryPercent),
    getMemoryUsage: (limit) => ipcRenderer.invoke('db-get-memory-usage', limit),
    // TPS history
    addTpsEntry: (tps) => ipcRenderer.invoke('db-add-tps-entry', tps),
    getTpsHistory: (limit) => ipcRenderer.invoke('db-get-tps-history', limit),
    // Settings
    getSetting: (key) => ipcRenderer.invoke('db-get-setting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db-set-setting', key, value),
    getAllSettings: () => ipcRenderer.invoke('db-get-all-settings'),
    // MCP Servers
    addMcpServer: (server) => ipcRenderer.invoke('db-add-mcp-server', server),
    getMcpServer: (id) => ipcRenderer.invoke('db-get-mcp-server', id),
    getMcpServersByProject: (projectId) => ipcRenderer.invoke('db-get-mcp-servers-by-project', projectId),
    deleteMcpServer: (id) => ipcRenderer.invoke('db-delete-mcp-server', id),
    deleteMcpServersByProject: (projectId) => ipcRenderer.invoke('db-delete-mcp-servers-by-project', projectId),
    // Folders
    createFolder: (folder) => ipcRenderer.invoke('db-create-folder', folder),
    listFoldersByProject: (projectId) => ipcRenderer.invoke('db-list-folders-by-project', projectId),
    renameFolder: (id, name) => ipcRenderer.invoke('db-rename-folder', id, name),
    deleteFolder: (id) => ipcRenderer.invoke('db-delete-folder', id),
    setDocumentFolder: (mapping) => ipcRenderer.invoke('db-set-document-folder', mapping),
    clearDocumentFolder: (documentId) => ipcRenderer.invoke('db-clear-document-folder', documentId),
    getDocumentFoldersByProject: (projectId) => ipcRenderer.invoke('db-get-document-folders-by-project', projectId),
    // Document Status
    setDocumentProcessed: (documentId, projectId) => ipcRenderer.invoke('db-set-document-processed', documentId, projectId),
    getDocumentStatusByProject: (projectId) => ipcRenderer.invoke('db-get-document-status-by-project', projectId),
    deleteDocumentStatus: (documentId) => ipcRenderer.invoke('db-delete-document-status', documentId),
    deleteDocumentStatusByProject: (projectId) => ipcRenderer.invoke('db-delete-document-status-by-project', projectId),
    deleteFoldersByProject: (projectId) => ipcRenderer.invoke('db-delete-folders-by-project', projectId),
    // Documents (local source of truth)
    addDocument: (doc) => ipcRenderer.invoke('db-add-document', doc),
    getDocumentsByProject: (projectId) => ipcRenderer.invoke('db-get-documents-by-project', projectId),
    updateDocumentStatus: (id, status) => ipcRenderer.invoke('db-update-document-status', id, status),
    updateDocumentId: (oldId, newId, status) => ipcRenderer.invoke('db-update-document-id', oldId, newId, status),
    deleteDocument: (id) => ipcRenderer.invoke('db-delete-document', id),
    deleteDocumentsByProject: (projectId) => ipcRenderer.invoke('db-delete-documents-by-project', projectId),
  },
  // Save content to a user-chosen location via native dialog
  saveFileDialog: (defaultName, content, defaultDir) => ipcRenderer.invoke('save-file-dialog', defaultName, content, defaultDir),
  saveBinaryFile: (fileName, buffer) => ipcRenderer.invoke('save-binary-file', fileName, buffer),
  // Check if running in Electron
  isElectron: true,
  // Native clipboard (bypasses web clipboard restrictions in Electron)
  writeClipboard: (text) => clipboard.writeText(text),
  readClipboard: () => clipboard.readText(),
  // System info
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

// Bridge main-process user profile updates to a DOM event
ipcRenderer.on('user-profile-updated', (event, data) => {
  window.dispatchEvent(new CustomEvent('userProfileUpdated', { detail: data }));
});

// Bridge main-process project changes to a DOM event so ProjectContext can
// subscribe with a plain window.addEventListener (single refresh trigger).
ipcRenderer.on('projects-changed', () => {
  window.dispatchEvent(new CustomEvent('projectsChanged'));
});
