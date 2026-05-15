export interface ElectronAPI {
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;
  // OAuth methods
  oauthLogin: () => Promise<{ status: string; port?: number; error?: string }>;
  // Storage methods
  storageGet: (key: string) => Promise<any>;
  storageSet: (key: string, value: any) => Promise<void>;
  storageRemove: (key: string) => Promise<void>;
  storageClear: () => Promise<void>;
  storageHas: (key: string) => Promise<boolean>;
  storageGetAll: () => Promise<Record<string, any>>;
  // Machine ID
  getMachineId: () => Promise<string | null>;
  // Save a file to a temp directory for local SLP document upload
  saveTempFile: (fileName: string, buffer: ArrayBuffer) => Promise<string>;
  // Read a text file from disk
  readTextFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  // Write a text file to a specific path on disk
  writeTextFile: (filePath: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  // List supported document files in a directory
  listDirectory: (dirPath: string) => Promise<{ success: boolean; files: Array<{ name: string; path: string; size: number; modified: string }>; error?: string }>;
  // Delete a file from disk
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  // Recursively delete a folder from disk
  deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  // Rename a folder on disk
  renameFolder: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>;
  // Extract conversations from a zip file (conversations/*.jsonl)
  extractConversationsFromZip: (zipPath: string) => Promise<{ success: boolean; conversations: Array<{ id: string; title: string; messages: any[] }>; error?: string }>;
  // Export a project to a zip file (fully local)
  exportProject: (projectId: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  // Import a project from a zip file (fully local)
  importProject: (zipPath: string, overrides?: { name?: string; color?: string }) => Promise<{ success: boolean; project?: any; error?: string }>;
  // Select a file using native file dialog (with optional filters)
  selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  // Read a binary file from disk
  readBinaryFile: (filePath: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
  // Select a folder using native file dialog
  selectFolder: () => Promise<string | null>;
  // Get the OS home directory
  getHomeDir: () => Promise<string>;
  // Get the path to the bundled blank project template zip
  getTemplateZipPath: () => Promise<string>;
  // SLP document upload (proxied through main process)
  slpAddDocument: (filePath: string, projectId?: string, cwd?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  onSlpDocumentProgress: (callback: (data: { percent: number; status: string; event?: string; documents?: any[] }) => void) => void;
  removeSlpDocumentProgressListener: () => void;
  // SLP service
  getSlpConfig: () => Promise<any>;
  getLocalApiUrl: () => Promise<string | null>;
  onSlpServiceReady: (callback: (data: any) => void) => void;
  // Bootstrap progress
  onBootstrapProgress: (callback: (data: any) => void) => void;
  removeBootstrapProgressListener: () => void;
  // Model management
  unloadModel: () => Promise<any>;
  // SLP service lifecycle
  slpServiceStatus: () => Promise<{ running: boolean; port?: number; health?: any }>;
  slpServiceStart: () => Promise<{ success: boolean; error?: string }>;
  slpServiceStop: () => Promise<{ success: boolean; error?: string }>;
  slpServiceUninstall: () => Promise<{ success: boolean; error?: string }>;
  // Model management (additional)
  loadModel: () => Promise<any>;
  // SLP auth and model management
  slpSetAuth: (params: { type: string; token: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  slpAuthStatus: () => Promise<{ success: boolean; has_access_token?: boolean; has_developer_token?: boolean; user?: any; error?: string }>;
  slpAuthLogout: () => Promise<{ success: boolean; error?: string }>;
  slpFetchUser: (opts?: { force?: boolean }) => Promise<{ success: boolean; user?: any }>;
  slpUpdateUserSettings: (settings: Record<string, any>) => Promise<{ success: boolean; user?: any; error?: string }>;
  slpListModels: () => Promise<{ success: boolean; models?: any[]; error?: string }>;
  slpInitModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
  onModelInitProgress: (callback: (data: { model: string; percent: number; status: string; downloading: boolean; stage?: string }) => void) => void;
  removeModelInitProgressListener: () => void;
  slpDownloadModel: (modelName: string) => Promise<{ success: boolean; model?: string; error?: string }>;
  onModelDownloadProgress: (callback: (data: { model: string; percent: number; status: string; downloading: boolean }) => void) => void;
  removeModelDownloadProgressListener: () => void;
  // SLP service ready listener cleanup
  removeSlpServiceReadyListener: () => void;
  // System hardware info
  getFrameworkVersion: () => Promise<string>;
  getSystemInfo: () => Promise<{
    cpu: string;
    cores: number;
    totalMemGb: number;
    freeMemGb: number;
    gpu: string | null;
  }>;
  // Save file via native save dialog
  saveFileDialog: (defaultName: string, content: string, defaultDir?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  // System info
  isElectron: boolean;
  // Native clipboard (bypasses web clipboard restrictions in Electron)
  writeClipboard: (text: string) => void;
  readClipboard: () => string;
  openInFinder: (filePath: string) => void;
  showItemInFolder: (filePath: string) => Promise<boolean>;
  openDocumentReference: (filePath: string, documentId?: string, projectId?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export { };

