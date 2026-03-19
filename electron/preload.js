const { contextBridge, ipcRenderer } = require('electron');

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
  oauthLogin: (provider) => ipcRenderer.invoke('oauth-login', provider),
  validateToken: (token) => ipcRenderer.invoke('validate-token', token),
  onOAuthCallback: (callback) => {
    ipcRenderer.on('oauth-callback', (event, data) => callback(data));
  },
  removeOAuthCallbackListener: () => {
    ipcRenderer.removeAllListeners('oauth-callback');
  },
  // MCP authorization callback
  onMcpAuthCallback: (callback) => {
    ipcRenderer.on('mcp-auth-callback', (event, data) => callback(data));
  },
  removeMcpAuthCallbackListener: () => {
    ipcRenderer.removeAllListeners('mcp-auth-callback');
  },
  // Token refresh methods
  refreshToken: (token) => ipcRenderer.invoke('refresh-token', token),
  startTokenRefresh: () => ipcRenderer.invoke('start-token-refresh'),
  stopTokenRefresh: () => ipcRenderer.invoke('stop-token-refresh'),
  onTokenRefreshed: (callback) => {
    ipcRenderer.on('token-refreshed', (event, data) => callback(data));
  },
  removeTokenRefreshListener: () => {
    ipcRenderer.removeAllListeners('token-refreshed');
  },
  // Open external URL in default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // Storage methods - native Electron storage using electron-store
  storageGet: (key) => ipcRenderer.invoke('storage-get', key),
  storageSet: (key, value) => ipcRenderer.invoke('storage-set', key, value),
  storageRemove: (key) => ipcRenderer.invoke('storage-remove', key),
  storageClear: () => ipcRenderer.invoke('storage-clear'),
  storageHas: (key) => ipcRenderer.invoke('storage-has', key),
  storageGetAll: () => ipcRenderer.invoke('storage-get-all'),
  // Machine ID
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  // Local SLP service
  getLocalApiUrl: () => ipcRenderer.invoke('get-local-api-url'),
  slpAddDocument: (filePath, projectId) => ipcRenderer.invoke('slp-add-document', filePath, projectId),
  onSlpDocumentProgress: (callback) => {
    ipcRenderer.on('slp-document-progress', (event, data) => callback(data));
  },
  removeSlpDocumentProgressListener: () => {
    ipcRenderer.removeAllListeners('slp-document-progress');
  },
  getSlpConfig: () => ipcRenderer.invoke('get-slp-config'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  unloadModel: () => ipcRenderer.invoke('unload-model'),
  loadModel: () => ipcRenderer.invoke('load-model'),
  // SLP service lifecycle
  slpServiceStart: () => ipcRenderer.invoke('slp-service-start'),
  slpServiceStop: () => ipcRenderer.invoke('slp-service-stop'),
  slpServiceStatus: () => ipcRenderer.invoke('slp-service-status'),
  slpServiceUninstall: () => ipcRenderer.invoke('slp-service-uninstall'),
  onSlpServiceReady: (callback) => {
    ipcRenderer.on('slp-service-ready', (event, data) => callback(data));
  },
  removeSlpServiceReadyListener: () => {
    ipcRenderer.removeAllListeners('slp-service-ready');
  },
  // Bootstrap progress
  onBootstrapProgress: (callback) => {
    ipcRenderer.on('bootstrap-progress', (event, data) => callback(data));
  },
  removeBootstrapProgressListener: () => {
    ipcRenderer.removeAllListeners('bootstrap-progress');
  },
  // Save a file to a temp directory (for local SLP document upload)
  saveTempFile: (fileName, buffer) => ipcRenderer.invoke('save-temp-file', fileName, buffer),
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
  },
  // Check if running in Electron
  isElectron: true,
  // System info
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
