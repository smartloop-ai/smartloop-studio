import { getLocalApiEndpoint } from "@/app/constants";
import { storageService } from "./storage.service";

/**
 * MCP Server Service
 * Handles MCP (Model Context Protocol) server management operations
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpServerIcon {
  src: string;
  url?: string; // fallback
  mimeType?: string;
  theme?: 'light' | 'dark';
  size?: string;
}

export interface McpServerInfo {
  name?: string;
  title?: string;
  version?: string;
  website_url?: string;
  websiteUrl?: string;
  icons?: McpServerIcon[];
}

export interface McpServerMetadata {
  tools?: McpTool[];
  prompts?: McpPrompt[];
  resources?: McpResource[];
  serverInfo?: {
    name?: string;
    version?: string;
    protocolVersion?: string;
  };
}

export interface McpRemoteConfig {
  server_url?: string;
  oauth_metadata_url?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
}

export interface McpServerRegistrationResponse {
  id?: string;
  name?: string;
  auth_type: 'oauth' | 'token' | 'none';
  auth_url?: string;  // For OAuth flow - URL to redirect user
  authorization_url?: string;  // Alternative field name for auth URL
  url?: string;  // Another alternative field name
  redirect_url?: string;  // Another alternative field name
  token_endpoint?: string;  // For token flow
  server_info?: McpServerInfo;
  message?: string;
}

export interface McpServer {
  id: string;
  name: string;
  description?: string;
  /** LLM-generated topical tags for hand-added servers (1–3). */
  tags?: string[];
  server_type?: 'local' | 'remote';
  env?: Record<string, string>;
  config?: {
    url?: string;
    [key: string]: any;
  };
  remote_config?: McpRemoteConfig;
  /** Flattened remote URL as returned by GET /v1/projects/{id}/mcp */
  server_url?: string;
  status?: 'connected' | 'disconnected' | 'connecting' | 'error';
  auth_url?: string;
  metadata?: McpServerMetadata;
  server_info?: McpServerInfo;
  tools?: McpTool[];
  lastConnected?: string;
  error?: string;
}

interface McpServerServiceResponse {
  success: boolean;
  data?: McpServer | McpServer[];
  error?: string;
}

/** A curated connection from GET /v1/mcp-catalog — always remote + OAuth. */
export interface McpCatalogEntry {
  slug: string;
  display_name: string;
  description?: string;
  hosted_by?: 'external' | 'internal';
  remote_config: { server_url: string; auth_type?: string };
  icon_url?: string;
  category?: string;
  tags?: string[];
}

/**
 * Fetch the curated MCP connection catalog (proxied through main so the
 * renderer never talks to SLP directly).
 */
const getMcpCatalog = async (): Promise<{ success: boolean; entries: McpCatalogEntry[]; error?: string }> => {
  try {
    const result = await window.electronAPI?.slpMcpCatalog?.();
    if (!result?.success) {
      return { success: false, entries: [], error: result?.error || 'Failed to fetch connection catalog' };
    }
    return { success: true, entries: (result.entries || []) as McpCatalogEntry[] };
  } catch (error: any) {
    console.error('Error fetching MCP catalog:', error);
    return { success: false, entries: [], error: error.message || 'An error occurred while fetching the catalog' };
  }
};

/**
 * Normalize a server URL so catalog entries can be matched to installed servers.
 * Drops the scheme, a `www.` prefix and the transport suffix (`/mcp`, `/sse`),
 * which providers vary between the advertised and the registered URL.
 */
export const normalizeMcpUrl = (url?: string): string =>
  (url || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/\/(mcp|sse)$/, '');

/**
 * The remote URL an installed server was registered with, if any. The list
 * endpoint flattens it to a top-level `server_url`; other shapes nest it.
 */
/** Tools reported for an installed server, across the shapes the API returns. */
export const getMcpServerTools = (server?: McpServer): McpTool[] =>
  server?.tools ?? server?.metadata?.tools ?? [];

export const getMcpServerUrl = (server: McpServer): string =>
  server.server_url || server.remote_config?.server_url || server.config?.url || (server.config as any)?.server_url || '';

export type TagColor = { color: string; border: string };

// Palette for free-form tag labels (e.g. catalog categories). Text color + a
// border at ~35% of it, matching the Models panel's capability pills.
const TAG_PALETTE: TagColor[] = [
  { color: '#93c5fd', border: 'rgba(147,197,253,0.35)' }, // blue
  { color: '#86efac', border: 'rgba(134,239,172,0.35)' }, // green
  { color: '#c4b5fd', border: 'rgba(196,181,253,0.35)' }, // purple
  { color: '#fdba74', border: 'rgba(253,186,116,0.35)' }, // amber
  { color: '#f9a8d4', border: 'rgba(249,168,212,0.35)' }, // pink
  { color: '#67e8f9', border: 'rgba(103,232,249,0.35)' }, // cyan
  { color: '#fca5a5', border: 'rgba(252,165,165,0.35)' }, // red
  { color: '#bef264', border: 'rgba(190,242,100,0.35)' }, // lime
  { color: '#5eead4', border: 'rgba(94,234,212,0.35)' },  // teal
  { color: '#fcd34d', border: 'rgba(252,211,77,0.35)' },  // gold
  { color: '#a5b4fc', border: 'rgba(165,180,252,0.35)' }, // indigo
  { color: '#fb923c', border: 'rgba(251,146,60,0.35)' },  // orange
  { color: '#d8b4fe', border: 'rgba(216,180,254,0.35)' }, // violet
  { color: '#7dd3fc', border: 'rgba(125,211,252,0.35)' }, // sky
];

const TAG_FALLBACK: TagColor = { color: 'var(--sl-text-faint)', border: 'var(--sl-border-default)' };

/**
 * Assign a distinct palette color to each unique tag name in `names`, so no two
 * labels in the same list share a color (until the palette is exhausted). Names
 * are normalized + sorted first, keeping the mapping stable across renders.
 */
export const buildTagColorMap = (names: (string | undefined)[]): Map<string, TagColor> => {
  const unique = Array.from(
    new Set(names.map((n) => (n || '').trim().toLowerCase()).filter(Boolean)),
  ).sort();
  const map = new Map<string, TagColor>();
  unique.forEach((name, i) => map.set(name, TAG_PALETTE[i % TAG_PALETTE.length]));
  return map;
};

/** Look up a name's assigned color, falling back to a neutral pill. */
export const tagColorFrom = (map: Map<string, TagColor>, name?: string): TagColor =>
  map.get((name || '').trim().toLowerCase()) || TAG_FALLBACK;

/**
 * Extract error message from API response
 * Handles FastAPI/Pydantic validation errors which can be arrays of objects
 */
const extractErrorMessage = (errorData: any, fallbackMessage: string): string => {
  if (!errorData) return fallbackMessage;

  // If detail is a string, return it
  if (typeof errorData.detail === 'string') {
    return errorData.detail;
  }

  // If detail is an array (Pydantic validation errors), extract messages
  if (Array.isArray(errorData.detail)) {
    const messages = errorData.detail
      .map((err: any) => err.msg || err.message || JSON.stringify(err))
      .filter(Boolean);
    return messages.length > 0 ? messages.join('; ') : fallbackMessage;
  }

  // If detail is an object, try to get msg or message
  if (typeof errorData.detail === 'object' && errorData.detail !== null) {
    return errorData.detail.msg || errorData.detail.message || JSON.stringify(errorData.detail);
  }

  // Try message field
  if (typeof errorData.message === 'string') {
    return errorData.message;
  }

  return fallbackMessage;
};

/**
 * Get all MCP servers for a project
 * @param projectId - ID of the project
 * @returns Promise with list of MCP servers
 */
const getMcpServers = async (projectId: string): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}/mcp`;
    const response = await fetch(url, {
      method: 'GET'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200) {
      const result = await response.json();
      const servers = result.servers || result;
      return {
        success: true,
        data: servers
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: extractErrorMessage(errorData, 'Failed to fetch MCP servers')
    };
  } catch (error: any) {
    console.error('Error fetching MCP servers:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while fetching MCP servers'
    };
  }
};

/**
 * Register an MCP server via the unified endpoint.
 * Supports both remote (SSE/HTTP) and local (stdio) server types.
 * For remote: if no auth needed, the server is added directly. If OAuth is required, returns auth_url.
 * For local: registers a stdio-based server with optional environment variables.
 * @param projectId - ID of the project
 * @param options - Registration options
 * @returns Promise with register response (server or OAuth data)
 */
const registerMcpServer = async (projectId: string, options: {
  server_type: 'remote' | 'local';
  server_url?: string;
  name?: string;
  command?: string;
  args?: string[];
  token?: string;
  env?: Record<string, string>;
  return_url?: string;
  /** Install a curated catalog entry. The backend resolves the slug and takes
   *  the server URL, description and tags from the catalog, so curated copy
   *  can't drift; server_url is still sent as the fallback. */
  catalog_slug?: string;
}): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    if (options.server_type === 'remote' && (!options.server_url || !options.server_url.trim())) {
      return { success: false, error: 'Server URL is required for remote servers' };
    }

    if (options.server_type === 'local' && !options.name?.trim()) {
      return { success: false, error: 'Server name is required for local servers' };
    }

    const localBase = await getLocalApiEndpoint();
    const apiUrl = `${localBase}/v1/projects/${projectId}/mcp/register`;
    const body: Record<string, any> = { server_type: options.server_type };

    if (options.server_url) body.server_url = options.server_url.trim();
    if (options.name) body.name = options.name.trim();
    if (options.command) body.command = options.command;
    if (options.server_type === 'local') {
      body.args = options.args || [];
      body.env = options.env || {};
    }
    if (options.token) body.token = options.token.trim();
    if (options.return_url) body.return_url = options.return_url;
    if (options.catalog_slug) body.catalog_slug = options.catalog_slug;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response) {
      return { success: false, error: 'No response from server' };
    }

    if (response.status === 200 || response.status === 201) {
      const data = await response.json();
      return { success: true, data };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: extractErrorMessage(errorData, 'Failed to register MCP server'),
    };
  } catch (error: any) {
    console.error('Error registering MCP server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while registering the MCP server',
    };
  }
};

/**
 * Complete OAuth flow - exchange code for tokens and register the server
 * @param projectId - ID of the project
 * @param oauthData - OAuth session data from initiate + authorization code
 * @returns Promise with registered server data
 */
const completeOAuth = async (projectId: string, oauthData: {
  server_url: string;
  code: string;
  state: string;
  code_verifier: string;
  client_id: string;
  client_secret?: string;
  token_endpoint: string;
  authorization_endpoint: string;
  callback_url?: string;
}): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    const localBase = await getLocalApiEndpoint();
    const apiUrl = `${localBase}/v1/projects/${projectId}/mcp/oauth/callback`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oauthData),
    });

    if (!response) {
      return { success: false, error: 'No response from server' };
    }

    if (response.status === 200 || response.status === 201) {
      const data = await response.json();
      return { success: true, data };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: extractErrorMessage(errorData, 'Failed to complete OAuth'),
    };
  } catch (error: any) {
    console.error('Error completing OAuth:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while completing OAuth',
    };
  }
};


/**
 * Get a specific MCP server
 * @param projectId - ID of the project
 * @param serverId - ID of the MCP server
 * @returns Promise with server data
 */
const getMcpServer = async (projectId: string, serverId: string): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    if (!serverId) {
      return {
        success: false,
        error: 'Server ID is required'
      };
    }

    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}/mcp/${serverId}`;
    const response = await fetch(url, {
      method: 'GET'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200) {
      const server = await response.json();
      return {
        success: true,
        data: server
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: extractErrorMessage(errorData, 'Failed to fetch MCP server')
    };
  } catch (error: any) {
    console.error('Error fetching MCP server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while fetching the MCP server'
    };
  }
};

/**
 * Delete an MCP server
 * @param projectId - ID of the project
 * @param serverId - ID of the MCP server to delete
 * @returns Promise with success status
 */
const deleteMcpServer = async (projectId: string, serverId: string): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    if (!serverId) {
      return {
        success: false,
        error: 'Server ID is required'
      };
    }

    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}/mcp/${serverId}`;
    const response = await fetch(url, {
      method: 'DELETE'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 204) {
      return {
        success: true,
        data: { id: serverId } as McpServer
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: extractErrorMessage(errorData, 'Failed to delete MCP server')
    };
  } catch (error: any) {
    console.error('Error deleting MCP server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while deleting the MCP server'
    };
  }
};


/**
 * Storage key for MCP servers
 */
const MCP_STORAGE_KEY = 'mcp_servers';

/**
 * Get the current user's identifier for storage scoping
 * @returns User email or null if not available
 */
const getCurrentUserId = async (): Promise<string | null> => {
  try {
    const userData = await storageService.getItem('u');
    if (userData) {
      const user = typeof userData === 'string' ? JSON.parse(userData) : userData;
      return user.email || null;
    }
    return null;
  } catch (error) {
    console.error('[MCP Storage] Error getting current user:', error);
    return null;
  }
};

/**
 * Save MCP servers to local storage (scoped by user and project)
 * @param projectId - ID of the project
 * @param servers - Array of MCP servers to save
 */
const saveMcpServersToStorage = async (projectId: string, servers: McpServer[]): Promise<void> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn('[MCP Storage] No user found, skipping save');
      return;
    }

    const allMcpData = await storageService.getItem(MCP_STORAGE_KEY) || {};

    // Initialize user scope if it doesn't exist
    if (!allMcpData[userId]) {
      allMcpData[userId] = {};
    }

    allMcpData[userId][projectId] = servers.map(server => ({
      id: server.id,
      name: server.name,
      config: server.config,
      server_info: server.server_info,
      lastConnected: server.lastConnected
    }));
    await storageService.setItem(MCP_STORAGE_KEY, allMcpData);
    console.log(`[MCP Storage] Saved ${servers.length} servers for user ${userId}, project ${projectId}`);
  } catch (error) {
    console.error('[MCP Storage] Error saving servers:', error);
  }
};

/**
 * Load MCP servers from local storage (scoped by user and project)
 * @param projectId - ID of the project
 * @returns Array of stored MCP servers
 */
const loadMcpServersFromStorage = async (projectId: string): Promise<McpServer[]> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn('[MCP Storage] No user found, returning empty list');
      return [];
    }

    const allMcpData = await storageService.getItem(MCP_STORAGE_KEY) || {};
    const userMcpData = allMcpData[userId] || {};
    const servers = userMcpData[projectId] || [];
    console.log(`[MCP Storage] Loaded ${servers.length} servers for user ${userId}, project ${projectId}`);
    return servers;
  } catch (error) {
    console.error('[MCP Storage] Error loading servers:', error);
    return [];
  }
};

/**
 * Remove MCP server from local storage (scoped by user and project)
 * @param projectId - ID of the project
 * @param serverId - ID of the server to remove
 */
const removeMcpServerFromStorage = async (projectId: string, serverId: string): Promise<void> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn('[MCP Storage] No user found, skipping remove');
      return;
    }

    const allMcpData = await storageService.getItem(MCP_STORAGE_KEY) || {};
    const userMcpData = allMcpData[userId];

    if (userMcpData && userMcpData[projectId]) {
      userMcpData[projectId] = userMcpData[projectId].filter((s: McpServer) => s.id !== serverId);
      allMcpData[userId] = userMcpData;
      await storageService.setItem(MCP_STORAGE_KEY, allMcpData);
      console.log(`[MCP Storage] Removed server ${serverId} for user ${userId}, project ${projectId}`);
    }
  } catch (error) {
    console.error('[MCP Storage] Error removing server:', error);
  }
};

/**
 * Auto-connect to all stored MCP servers for a project
 * @param projectId - ID of the project
 * @returns Promise with array of connection results
 */

export const mcpServerService = {
  getMcpCatalog,
  getMcpServers,
  getMcpServer,
  deleteMcpServer,
  registerMcpServer,
  completeOAuth,
  saveMcpServersToStorage,
  loadMcpServersFromStorage,
  removeMcpServerFromStorage,
};
