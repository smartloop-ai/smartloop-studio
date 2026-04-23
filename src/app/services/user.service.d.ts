// Type definitions for user.service.js

export interface UserService {
  logout(): void;
  get(): Promise<any>;
  updateSettings(settings: any): Promise<any>;
  checkTokenExpiration(response: Response): boolean;
  makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response | undefined>;
  fetchAndStoreUser(): Promise<any>;
  redirectToLogin(): void;
}

declare const userService: UserService;
export { userService };
