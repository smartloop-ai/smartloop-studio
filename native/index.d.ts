export declare const supported: boolean;
export declare const UNAVAILABLE: string;

export interface AppleCredential {
  /** Stable, app-scoped Apple user id. */
  user: string;
  identityToken: string;
  authorizationCode: string;
  /** First authorization only — Apple never resends these. */
  email?: string;
  fullName?: string;
}

export declare function startWebAuthSession(
  url: string,
  callbackScheme: string,
  options?: { ephemeral?: boolean },
): Promise<string>;

export declare function signInWithApple(options?: { nonce?: string }): Promise<AppleCredential>;
