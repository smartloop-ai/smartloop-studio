const { contextBridge, ipcRenderer, clipboard } = require('electron');
const { createTitlebarOnDOMContentLoaded, TitlebarColor } = require('custom-electron-titlebar');

let titlebarInstance = null;

// The last color the app asked for, kept whether or not the titlebar existed
// yet to receive it. ThemeContext pushes the theme on mount and React usually
// wins that race against createTitlebarOnDOMContentLoaded's promise — and the
// old code dropped the color when it did, silently and for good: the effect
// only re-runs when the theme id changes, so the strip kept its construction
// color for the life of the window. That is the black bar.
let requestedTitlebarColor = null;

// The strip above the app is part of the app, so it starts in the app's color
// rather than a literal. A hardcoded #000000 sat a shade blacker than the
// themed window beneath it (#100c0e in the default theme) for every frame
// before ThemeContext mounted and called setNativeTheme — long enough to read
// as a black bar across the top, and permanently so on any screen that renders
// before the theme is applied. Read synchronously: the titlebar is built during
// this same tick, and a promise would put the wrong color on screen first.
function initialTitlebarColor() {
  try {
    const color = ipcRenderer.sendSync('get-theme-base-color-sync');
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  } catch { /* main not ready — fall through */ }
  return '#100c0e';
}

/**
 * Publish the titlebar's real height as a CSS variable.
 *
 * Anything sized against the viewport has to subtract this strip, and the
 * height is not ours to assume: custom-electron-titlebar sizes it per platform,
 * and it moves again with display scaling. A hardcoded guess that runs short
 * leaves the page taller than the window, which pushes the bottom of a
 * full-height layout past the frame — and since the provider consent view is a
 * native layer positioned from that layout's bounds, it gets clamped to the
 * window and stops filling its slot. Measure it instead, and keep measuring.
 */
/** Paint the strip, now or as soon as there is a strip to paint. */
function applyTitlebarColor(color) {
  requestedTitlebarColor = color;
  if (!titlebarInstance) return;
  try {
    titlebarInstance.updateBackground(TitlebarColor.fromHex(color));
  } catch { /* a color the library won't parse — keep the one on screen */ }
}

function publishTitlebarHeight() {
  const bar = document.querySelector('.cet-titlebar');
  if (!bar) return;
  const apply = () => {
    const height = Math.round(bar.getBoundingClientRect().height);
    if (height > 0) {
      document.documentElement.style.setProperty('--cet-titlebar-height', `${height}px`);
    }
  };
  apply();
  new ResizeObserver(apply).observe(bar);
}

createTitlebarOnDOMContentLoaded({
  removeMenuBar: true,
  backgroundColor: TitlebarColor.fromHex(initialTitlebarColor()),
}).then((titlebar) => {
  titlebarInstance = titlebar;
  // On Linux and Windows, keep the left side of the titlebar blank instead of
  // rendering the favicon (broken image on Linux, redundant logo on Windows).
  if (process.platform === 'linux' || process.platform === 'win32') {
    document.querySelector('.cet-titlebar .cet-icon')?.remove();
  }
  // Anything asked for while this was still resolving applies now.
  if (requestedTitlebarColor) applyTitlebarColor(requestedTitlebarColor);
  publishTitlebarHeight();
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
  // In-app sign-in. Email sign-in is a one-time code handled entirely in the
  // main process (no web context, no CORS, no password anywhere); Google and
  // Apple need the provider's own consent page, which main opens in a window
  // of its own.
  authOtpRequest: (email) => ipcRenderer.invoke('auth-otp-request', email),
  authOtpVerify: (email, code) => ipcRenderer.invoke('auth-otp-verify', email, code),
  authProviderStart: (provider) => ipcRenderer.invoke('auth-provider-start', provider),
  authProviderCancel: () => ipcRenderer.invoke('auth-provider-cancel'),
  authDeleteAccount: () => ipcRenderer.invoke('auth-delete-account'),
  // Upgrade to Pro. Every build has it; main picks the payment step — StoreKit
  // in the Mac App Store build (iap.js), Stripe Checkout in the others.
  upgrade: {
    status: () => ipcRenderer.invoke('upgrade-status'),
    purchase: () => ipcRenderer.invoke('upgrade-purchase'),
    restore: () => ipcRenderer.invoke('upgrade-restore'),
    onState: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('upgrade-state', handler);
      return () => ipcRenderer.off('upgrade-state', handler);
    },
  },
  // The provider is done and the app is finishing the sign-in with its window
  // already out of the way.
  onAuthViewFinishing: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('auth-view-finishing', handler);
    return () => ipcRenderer.off('auth-view-finishing', handler);
  },
  onAuthViewClosed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auth-view-closed', handler);
    return () => ipcRenderer.off('auth-view-closed', handler);
  },
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
    // Title bar uses the main content area color (theme bg.base) so the top
    // band reads as one uniform strip with the base-colored page under it.
    if (bgColor) applyTitlebarColor(bgColor);
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
  // Web search monthly allowance (proxied through SLP)
  getWebSearchStatus: () => ipcRenderer.invoke('websearch-status'),
  // Cloud model monthly allowance (proxied through SLP)
  getCloudQuota: () => ipcRenderer.invoke('cloud-quota'),
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
  // Start the first-run model download when the user declined it at launch.
  // Re-asks for consent (size and all) before fetching anything.
  slpStartSetup: () => ipcRenderer.invoke('slp-start-setup'),
  slpAuthStatus: () => ipcRenderer.invoke('slp-auth-status'),
  slpAuthLogout: () => ipcRenderer.invoke('slp-auth-logout'),
  slpFetchUser: () => ipcRenderer.invoke('slp-fetch-user'),
  slpUpdateUserSettings: (settings) => ipcRenderer.invoke('slp-update-user-settings', settings),
  slpListModels: (projectId) => ipcRenderer.invoke('slp-list-models', projectId),
  slpMcpCatalog: () => ipcRenderer.invoke('slp-mcp-catalog'),
  slpInitModel: (modelName, projectId) => ipcRenderer.invoke('slp-init-model', modelName, projectId),
  slpSetModelEnabled: (modelName, enabled, projectId) => ipcRenderer.invoke('slp-set-model-enabled', modelName, enabled, projectId),
  slpLoadModel: (modelName, projectId) => ipcRenderer.invoke('slp-load-model', modelName, projectId),
  slpCancelModelDownload: (modelName) => ipcRenderer.invoke('slp-cancel-model-download', modelName),
  slpGetDownloadState: () => ipcRenderer.invoke('slp-get-download-state'),
  // These two return an unsubscribe closure that removes only their own
  // listener. A shared removeAllListeners() would let any unmounting component
  // silently kill every other subscriber on the channel.
  onModelDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('model-download-progress', handler);
    return () => ipcRenderer.off('model-download-progress', handler);
  },
  onModelsUpdated: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('models-updated', handler);
    return () => ipcRenderer.off('models-updated', handler);
  },
  onMcpCatalogUpdated: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('mcp-catalog-updated', handler);
    return () => ipcRenderer.off('mcp-catalog-updated', handler);
  },
  // Chat turns. The stream is owned by main, so a conversation keeps collecting
  // its answer while its tab is in the background — or while the chat component
  // is not mounted at all. `onChatStreamEvent` follows the unsubscribe-closure
  // form above for the same reason, doubly so here: a channel-wide
  // removeAllListeners from one unmounting tab would kill every other
  // conversation's stream.
  chatSend: (request) => ipcRenderer.invoke('chat-send', request),
  chatAbort: (conversationId) => ipcRenderer.invoke('chat-abort', conversationId),
  chatGetState: () => ipcRenderer.invoke('chat-get-state'),
  onChatStreamEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('chat-stream-event', handler);
    return () => ipcRenderer.off('chat-stream-event', handler);
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
  // App release / update check
  getLatestRelease: () => ipcRenderer.invoke('release-get-latest'),
  onReleaseUpdate: (callback) => {
    ipcRenderer.on('release-update', (event, data) => callback(data));
  },
  removeReleaseUpdateListener: () => {
    ipcRenderer.removeAllListeners('release-update');
  },
  // Whether this build has anything to say about updates. No build installs one
  // itself — see release-checker.js getDelivery().
  getUpdateDelivery: () => ipcRenderer.invoke('updater-delivery'),
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
  // Bootstrap progress. Returns an unsubscribe closure (see the model channels
  // above) — ModelStatusContext consumes this and must not wipe the channel.
  onBootstrapProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('bootstrap-progress', handler);
    return () => ipcRenderer.off('bootstrap-progress', handler);
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
    // Sets web_search_enabled on every project (Settings → Web search).
    setWebSearch: (enabled) => ipcRenderer.invoke('projects-set-web-search', enabled),
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
    addRunTrace: (trace) => ipcRenderer.invoke('db-add-run-trace', trace),
    getRunTraces: (limit, projectId) => ipcRenderer.invoke('db-get-run-traces', limit, projectId),
    clearRunTraces: (projectId, keepIds) => ipcRenderer.invoke('db-clear-run-traces', projectId, keepIds),
    deleteRunTrace: (messageId) => ipcRenderer.invoke('db-delete-run-trace', messageId),
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
    deleteDocumentStatus: (documentId, projectId) => ipcRenderer.invoke('db-delete-document-status', documentId, projectId),
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

// Bridge the outcome of the main-process login wait (success / timeout / cancelled)
ipcRenderer.on('login-state', (event, data) => {
  window.dispatchEvent(new CustomEvent('loginState', { detail: data }));
});

// Bridge main-process project changes to a DOM event so ProjectContext can
// subscribe with a plain window.addEventListener (single refresh trigger).
ipcRenderer.on('projects-changed', () => {
  window.dispatchEvent(new CustomEvent('projectsChanged'));
});
