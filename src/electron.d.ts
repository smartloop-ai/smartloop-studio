export interface UpdaterStatus {
  state: 'idle' | 'checking' | 'downloading' | 'paused' | 'downloaded' | 'error';
  percent?: number;
  version?: string | null;
  error?: string;
}

// A model download/load tracked by the main process. `kind` separates the
// project's primary orchestrator load from an auxiliary model download; both
// share one map, so consumers must filter on it.
export interface ModelDownloadState {
  model: string;
  percent: number;
  status: string;
  stage?: string;
  downloading: boolean;
  projectId?: string | null;
  kind: 'primary' | 'aux';
}

// Live progress event. Same shape as the tracked state, except terminal events
// arrive with downloading: false and are not retained in the snapshot. A download
// that failed is terminal too, and carries why: `requiresAuth` marks the 401/403
// SLP answers for weights the account isn't entitled to, which the UI turns into
// a sign-in prompt instead of an error code. `detail` is the server's own words
// for the failure, kept because "sign in" is wrong for a signed-in user whose
// plan is the problem.
export interface ModelDownloadProgress extends Omit<ModelDownloadState, 'kind'> {
  kind?: 'primary' | 'aux';
  error?: string;
  detail?: string;
  requiresAuth?: boolean;
}

// Result of a model action that can hit the entitlement gate (download, load,
// enable). `requiresAuth` is the 401/403 case — signing in or upgrading is the
// fix, and retrying is not.
export interface ModelActionResult {
  success: boolean;
  error?: string;
  detail?: string;
  code?: number;
  requiresAuth?: boolean;
}

export interface AuthResult { success: boolean; user?: any; error?: string }

export interface ElectronAPI {
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;
  // OAuth methods
  slpStartSetup: () => Promise<{ success: boolean; error?: string }>;
  authOtpRequest: (email: string) => Promise<{ success: boolean; code?: 'no-account'; error?: string }>;
  authOtpVerify: (email: string, code: string) => Promise<AuthResult>;
  authProviderStart: (provider: 'google' | 'apple') => Promise<{ success: boolean; error?: string }>;
  authProviderCancel: () => Promise<{ success: boolean }>;
  authDeleteAccount: () => Promise<{ success: boolean; error?: string }>;
  onAuthViewFinishing: (callback: () => void) => () => void;
  onAuthViewClosed: (callback: (data: { error?: string }) => void) => () => void;
  // Storage methods
  storageGet: (key: string) => Promise<any>;
  storageSet: (key: string, value: any) => Promise<void>;
  storageRemove: (key: string) => Promise<void>;
  storageClear: () => Promise<void>;
  storageHas: (key: string) => Promise<boolean>;
  storageGetAll: () => Promise<Record<string, any>>;
  // Open external URL in system browser
  openExternal: (url: string) => Promise<boolean>;
  // Machine ID
  getMachineId: () => Promise<string | null>;
  // Save a file to a temp directory for local SLP document upload
  saveTempFile: (fileName: string, buffer: ArrayBuffer) => Promise<string>;
  // Read an uploaded SLP image asset as a data URL (for inline image attachment display)
  readAssetDataUrl: (assetId: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
  // Read a text file from disk
  readTextFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  // Write a text file to a specific path on disk
  writeTextFile: (filePath: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  // List supported document files in a directory
  listDirectory: (dirPath: string) => Promise<{ success: boolean; files: Array<{ name: string; path: string; size: number; modified: string }>; error?: string }>;
  readSkillsDir: (folderPath: string) => Promise<{ success: boolean; skills: Array<{ id: string; name: string; folderName: string; content: string; description: string }>; error?: string }>;
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
  getSlpCwd: () => Promise<string | null>;
  onSlpServiceReady: (callback: (data: any) => void) => void;
  // Chrome-style close-tab shortcut (Cmd/Ctrl+W), forwarded from the main process
  onCloseTabShortcut: (callback: () => void) => void;
  removeCloseTabShortcutListener: () => void;
  // Bootstrap progress
  onBootstrapProgress: (callback: (data: ModelDownloadProgress) => void) => () => void;
  onBootstrapComplete: (callback: () => void) => void;
  removeBootstrapCompleteListener: () => void;
  // Model management
  commandExists: (cmd: string) => Promise<{ exists: boolean }>;
  unloadModel: () => Promise<any>;
  // SLP version management
  slpListVersions: () => Promise<{ success: boolean; versions: string[]; current: string | null; error?: string }>;
  slpSwitchVersion: (version: string) => Promise<{ success: boolean; port?: number; error?: string }>;
  // SLP service lifecycle
  slpServiceStatus: () => Promise<{ running: boolean; port?: number; health?: any }>;
  slpServiceStart: () => Promise<{ success: boolean; error?: string }>;
  slpServiceStop: () => Promise<{ success: boolean; error?: string }>;
  slpServiceUninstall: () => Promise<{ success: boolean; error?: string }>;
  // Model management (additional)
  loadModel: () => Promise<any>;
  // SLP auth and model management
  slpAuthStatus: () => Promise<{ success: boolean; has_access_token?: boolean; has_developer_token?: boolean; user?: any; error?: string }>;
  slpAuthLogout: () => Promise<{ success: boolean; error?: string }>;
  slpFetchUser: () => Promise<{ success: boolean; user?: any }>;
  slpUpdateUserSettings: (settings: Record<string, any>) => Promise<{ success: boolean; user?: any; error?: string }>;
  slpListModels: (projectId?: string | null) => Promise<{ success: boolean; models?: any[]; error?: string }>;
  slpMcpCatalog: () => Promise<{ success: boolean; entries?: any[]; error?: string }>;
  slpInitModel: (modelName: string, projectId?: string | null) => Promise<ModelActionResult>;
  slpSetModelEnabled: (modelName: string, enabled: boolean, projectId?: string | null) => Promise<ModelActionResult & { downloading?: boolean }>;
  slpLoadModel: (modelName: string, projectId?: string | null) => Promise<ModelActionResult & { model?: string; downloading?: boolean }>;
  slpCancelModelDownload: (modelName: string, projectId?: string | null) => Promise<{ success: boolean; error?: string }>;
  slpGetDownloadState: () => Promise<{ success: boolean; downloads: Record<string, ModelDownloadState> }>;
  // Both return an unsubscribe closure — call that on teardown instead of a
  // channel-wide removeAllListeners, which would drop other subscribers too.
  onModelDownloadProgress: (callback: (data: ModelDownloadProgress) => void) => () => void;
  onModelsUpdated: (callback: (data: { models: any[]; projectId?: string | null }) => void) => () => void;
  onMcpCatalogUpdated: (callback: (data: { entries: any[] }) => void) => () => void;
  // SLP service ready listener cleanup
  removeSlpServiceReadyListener: () => void;
  // Transient agent-restarting signal (e.g. during a Clean)
  onAgentRestarting: (callback: (data: { restarting: boolean }) => void) => void;
  removeAgentRestartingListener: () => void;
  // App release / update check
  checkForUpdates: () => Promise<any>;
  getLatestRelease: () => Promise<any>;
  onReleaseUpdate: (callback: (data: any) => void) => void;
  removeReleaseUpdateListener: () => void;
  // In-app updater (electron-updater)
  isUpdaterSupported: () => Promise<boolean>;
  quitAndInstallUpdate: () => Promise<{ success: boolean }>;
  pauseUpdate: () => Promise<{ success: boolean }>;
  resumeUpdate: () => Promise<{ success: boolean }>;
  onUpdaterStatus: (callback: (data: UpdaterStatus) => void) => void;
  removeUpdaterStatusListener: () => void;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  // System hardware info
  getFrameworkVersion: () => Promise<string>;
  getCommandLineStatus: () => Promise<{ supported: boolean; installed: boolean; linkPath: string | null }>;
  installCommandLine: () => Promise<{ success: boolean; supported?: boolean; linkPath?: string; error?: string }>;
  uninstallCommandLine: () => Promise<{ success: boolean; supported?: boolean; error?: string }>;
  getSystemInfo: () => Promise<{
    cpu: string;
    cores: number;
    totalMemGb: number;
    freeMemGb: number;
    gpu: string | null;
  }>;
  // Storage / free-up-space
  getStorageUsage: () => Promise<{
    success: boolean;
    total?: number;
    models?: number;
    versions?: number;
    logsCache?: number;
    reclaimable?: number;
    error?: string;
  }>;
  cleanupStorage: (opts: { models?: boolean; versions?: boolean; logsCache?: boolean }) =>
    Promise<{ success: boolean; freed?: number; serviceStarted?: boolean; error?: string }>;
  // Save file via native save dialog
  saveFileDialog: (defaultName: string, content: string, defaultDir?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  // Projects: centralized /v1/projects access (list + CRUD in main process)
  projects: {
    list: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    create: (params: any) => Promise<{ success: boolean; data?: any; error?: string }>;
    update: (id: string, updates: any) => Promise<{ success: boolean; data?: any; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  };
  // System info
  isElectron: boolean;
  // Native clipboard (bypasses web clipboard restrictions in Electron)
  writeClipboard: (text: string) => void;
  readClipboard: () => string;
  openInFinder: (filePath: string, options?: { createIfMissing?: boolean }) => void;
  showItemInFolder: (filePath: string) => Promise<boolean>;
  openDocumentReference: (filePath: string, documentId?: string, projectId?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  downloadDocument: (filePath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
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

