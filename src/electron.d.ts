export interface ElectronAPI {
  sendMessage: (channel: string, data: any) => void;
  receiveMessage: (channel: string, func: (...args: any[]) => void) => void;
  oauthLogin: () => Promise<{ status: string }>;
  validateToken: (token: string) => Promise<{ valid: boolean; user?: any; error?: string }>;
  onOAuthCallback: (callback: (data: { accessToken?: string; error?: string }) => void) => void;
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

export {};

