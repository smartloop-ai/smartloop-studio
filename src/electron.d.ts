export interface ElectronAPI {
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;
  // OAuth methods
  oauthLogin: () => Promise<{ status: string }>;
  validateToken: (token: string) => Promise<{ valid: boolean; user?: any; error?: string }>;
  onOAuthCallback: (callback: (data: { accessToken?: string; error?: string }) => void) => void;
  removeOAuthCallbackListener: () => void;
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
  // Select a folder using native file dialog
  selectFolder: () => Promise<string | null>;
  // Get the OS home directory
  getHomeDir: () => Promise<string>;
  // SLP document upload (proxied through main process)
  slpAddDocument: (filePath: string, projectId?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  onSlpDocumentProgress: (callback: (data: { percent: number; status: string }) => void) => void;
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
  slpAuthStatus: () => Promise<{ success: boolean; has_access_token?: boolean; has_developer_token?: boolean; error?: string }>;
  slpListModels: () => Promise<{ success: boolean; models?: any[]; error?: string }>;
  slpDownloadModel: (modelName: string) => Promise<{ success: boolean; model?: string; error?: string }>;
  onModelDownloadProgress: (callback: (data: { model: string; percent: number; status: string; downloading: boolean }) => void) => void;
  removeModelDownloadProgressListener: () => void;
  // SLP service ready listener cleanup
  removeSlpServiceReadyListener: () => void;
  // System hardware info
  getSystemInfo: () => Promise<{
    cpu: string;
    cores: number;
    totalMemGb: number;
    freeMemGb: number;
    gpu: string | null;
  }>;
  // System info
  isElectron: boolean;
  // Native clipboard (bypasses web clipboard restrictions in Electron)
  writeClipboard: (text: string) => void;
  readClipboard: () => string;
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

