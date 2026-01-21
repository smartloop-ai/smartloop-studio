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
  // System project initialization
  initializeSystemProject: (token) => ipcRenderer.invoke('initialize-system-project', token),
  // Storage methods - native Electron storage using electron-store
  storageGet: (key) => ipcRenderer.invoke('storage-get', key),
  storageSet: (key, value) => ipcRenderer.invoke('storage-set', key, value),
  storageRemove: (key) => ipcRenderer.invoke('storage-remove', key),
  storageClear: () => ipcRenderer.invoke('storage-clear'),
  storageHas: (key) => ipcRenderer.invoke('storage-has', key),
  storageGetAll: () => ipcRenderer.invoke('storage-get-all'),
  // Machine ID
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
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
