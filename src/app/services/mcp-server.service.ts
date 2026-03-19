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
  server_type?: 'local' | 'remote';
  env?: Record<string, string>;
  config?: {
    url?: string;
    [key: string]: any;
  };
  remote_config?: McpRemoteConfig;
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
  token?: string;
  env?: Record<string, string>;
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
    if (options.token) body.token = options.token.trim();
    if (options.env && Object.keys(options.env).length > 0) body.env = options.env;

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
  getMcpServers,
  getMcpServer,
  deleteMcpServer,
  registerMcpServer,
  completeOAuth,
  saveMcpServersToStorage,
  loadMcpServersFromStorage,
  removeMcpServerFromStorage,
};
