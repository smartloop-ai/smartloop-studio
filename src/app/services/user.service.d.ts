// Type definitions for user.service.js

export interface UserService {
  token(): string | null;
  logout(): void;
  get(): Promise<any>;
  updateSettings(settings: any): Promise<any>;
  makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response | null>;
  initializeTokenRefresh(): void;
  stopTokenRefresh(): void;
}

declare const userService: UserService;
export { userService };

