// Type definitions for constants.jsx

export const API_ENDPOINT: string;
export const WS_ENDPOINT: string;
export const APP_URL: string;
export const PROJECT_COLORS: { [key: string]: string }[];
export const DEFAULT_COLOR: string;
export const LEGACY_PINK: string;
export const API_BASE_URL: string;
export const CHANGELOG_URL: string;
export const TERMS_URL: string;
export const SIGNUP_URL: string;
export const PRIVACY_URL: string;
export const APP_DESCRIPTION: JSX.Element;
export const getLocalApiEndpoint: () => Promise<string>;

export const BOOTSTRAP_MODEL: string;
export const BOOTSTRAP_MODEL_ALIASES: string[];
export const isBootstrapModel: (name?: string | null) => boolean;
