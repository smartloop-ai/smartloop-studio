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
// plan is the problem. `code` is the status SLP classified it as — 502 for a
// transfer that died with the weights still there to fetch, 500 for a failure
// retrying cannot fix — which is what decides whether to offer a retry, and
// which `requiresAuth` cannot express because it is false for both.
// `cancelled` marks the one terminal event that is not a completion and not a
// failure: the user stopped the download. It arrives without `error` on purpose,
// so nothing that keys off that renders a fault for a button the user pressed.
export interface ModelDownloadProgress extends Omit<ModelDownloadState, 'kind'> {
  kind?: 'primary' | 'aux';
  error?: string;
  detail?: string;
  code?: number | null;
  requiresAuth?: boolean;
  cancelled?: boolean;
}

// Result of a model action that can hit the entitlement gate (download, load,
// enable). `requiresAuth` is the 401/403 case — signing in or upgrading is the
// fix, and retrying is not.
export interface ModelActionResult {
  success: boolean;
  error?: string;
  detail?: string;
  code?: number | null;
  requiresAuth?: boolean;
  // success: false because nothing was enabled, but the user asked for it —
  // callers must not report it as a failure.
  cancelled?: boolean;
}

export interface AuthResult { success: boolean; user?: any; error?: string }

/** One reclaimable (or protected) item within a storage category. */
export interface StorageItem {
  path: string;
  bytes: number;
  files: number;
  removable: boolean;
  /** Why this item is being kept, when it isn't removable. */
  keep_reason: string | null;
  /** Models only. */
  model_id?: string;
  model_name?: string | null;
  downloaded?: boolean;
  enabled?: boolean;
  is_active?: boolean;
  loaded?: boolean;
  registered?: boolean;
  /**
   * Models only: which band of the usage bar these bytes belong to.
   * 'system' is the framework's own (sl-mini, embeddings), 'unused' is the
   * same set as `removable`.
   */
  group?: 'in_use' | 'system' | 'unused';
  /** Models only: a .part sidecar arrived but no servable weights did. */
  partial?: boolean;
  /** Versions only. */
  version?: string;
  /** Logs only: 'truncate' for server.log, 'delete' for its backups. */
  action?: 'truncate' | 'delete';
  /** Cache only: which regenerable directory the entry came from. */
  cache?: 'cache' | 'templates';
  /** Orphan projects only. */
  project_id?: string;
  /** Conversations only (reported, never deleted). */
  session_id?: string;
  tracked?: boolean;
}

export interface StorageCategory {
  bytes: number;
  files: number;
  reclaimable: number;
  kept: number;
  items: StorageItem[];
  /**
   * Models only, and optional because a framework older than this build does
   * not send them: the group subtotals, which partition the category as
   * `in_use + system + reclaimable + overhead === bytes`.  `reclaimable` is
   * the 'unused' total, so it is not repeated. `overhead` is what the models
   * directory holds with no item of its own — the hidden `embeddings/.locks`
   * tree and the loose embedding GGUF.
   */
  in_use?: number;
  system?: number;
  overhead?: number;
}

/** Response of GET /v1/storage/usage. */
export interface StorageUsage {
  home_dir: string;
  total: number;
  files: number;
  reclaimable: number;
  kept: number;
  categories: Record<string, StorageCategory>;
}

/** Body of POST /v1/storage/cleanup. Omitted categories are left alone. */
export interface StorageCleanupRequest {
  models?: boolean;
  /** Restrict the model sweep to these ids; omit for every removable model. */
  model_ids?: string[];
  versions?: boolean;
  logs?: boolean;
  cache?: boolean;
  orphan_projects?: boolean;
  dry_run?: boolean;
}

export interface StorageCleanupResult {
  dry_run: boolean;
  freed: number;
  freed_by_category: Record<string, number>;
  deleted: Array<{ category: string; path: string; bytes: number }>;
  failed: Array<{ category: string; path: string; error: string }>;
  models_marked: string[];
  /** Something couldn't be removed while still in use; a restart will finish it. */
  restart_required: boolean;
  usage: StorageUsage;
}

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
  // No project argument: SLP's cancel route is workspace-level and must stay
  // that way, or the supervisor proxies it to a child with an empty registry.
  slpCancelModelDownload: (modelName: string) => Promise<ModelActionResult & { status?: string | null; cancelled?: boolean }>;
  slpGetDownloadState: () => Promise<{ success: boolean; downloads: Record<string, ModelDownloadState> }>;
  // Both return an unsubscribe closure — call that on teardown instead of a
  // channel-wide removeAllListeners, which would drop other subscribers too.
  onModelDownloadProgress: (callback: (data: ModelDownloadProgress) => void) => () => void;
  onModelsUpdated: (callback: (data: { models: any[]; projectId?: string | null }) => void) => () => void;
  onMcpCatalogUpdated: (callback: (data: { entries: any[] }) => void) => () => void;
  // SLP service ready listener cleanup
  removeSlpServiceReadyListener: () => void;
  // App release / update check
  getLatestRelease: () => Promise<any>;
  onReleaseUpdate: (callback: (data: any) => void) => void;
  removeReleaseUpdateListener: () => void;
  // Whether this build has anything to say about updates. No build installs one
  // itself — see release-checker.js getDelivery().
  getUpdateDelivery: () => Promise<'manual' | 'store' | 'none'>;
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
  // Storage / free-up-space — proxied to the framework's /v1/storage endpoints
  getStorageUsage: () => Promise<{ success: boolean; data?: StorageUsage; error?: string }>;
  cleanupStorage: (opts: StorageCleanupRequest) =>
    Promise<{ success: boolean; data?: StorageCleanupResult; error?: string }>;
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
