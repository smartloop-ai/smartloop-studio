export interface ElectronAPI {
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;
  // OAuth methods
  oauthLogin: () => Promise<{ status: string }>;
  validateToken: (token: string) => Promise<{ valid: boolean; user?: any; error?: string }>;
  onOAuthCallback: (callback: (data: { accessToken?: string; error?: string }) => void) => void;
  removeOAuthCallbackListener: () => void;
  // Token refresh methods
  refreshToken: (token: string) => Promise<{ success: boolean; token?: string; error?: string; status?: number }>;
  startTokenRefresh: () => Promise<{ success: boolean }>;
  stopTokenRefresh: () => Promise<{ success: boolean }>;
  onTokenRefreshed: (callback: (data: { success: boolean; token?: string; error?: string; requiresReauth?: boolean }) => void) => void;
  removeTokenRefreshListener: () => void;
  // Storage methods
  storageGet: (key: string) => Promise<any>;
  storageSet: (key: string, value: any) => Promise<void>;
  storageRemove: (key: string) => Promise<void>;
  storageClear: () => Promise<void>;
  storageHas: (key: string) => Promise<boolean>;
  storageGetAll: () => Promise<Record<string, any>>;
  // Machine ID
  getMachineId: () => Promise<string | null>;
  // System info
  isElectron: boolean;
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

