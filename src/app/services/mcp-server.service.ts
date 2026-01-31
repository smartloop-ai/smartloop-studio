import { API_ENDPOINT } from "@/app/constants";
import { userService } from "./user.service";
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

export interface McpServer {
  id: string;
  name: string;
  config?: {
    url?: string;
    [key: string]: any;
  };
  remote_config?: McpRemoteConfig;
  status?: 'connected' | 'disconnected' | 'connecting' | 'error';
  auth_url?: string;
  metadata?: McpServerMetadata;
  server_info?: McpServerInfo;
  lastConnected?: string;
  error?: string;
}

interface McpServerServiceResponse {
  success: boolean;
  data?: McpServer | McpServer[];
  error?: string;
}

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

    const url = `${API_ENDPOINT}/projects/${projectId}/mcp-servers`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'GET'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200) {
      const servers = await response.json();
      return {
        success: true,
        data: servers
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to fetch MCP servers'
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
 * Initiate OAuth for a remote MCP server
 * @param projectId - ID of the project
 * @param name - Name for the MCP server
 * @param serverUrl - URL of the remote MCP server
 * @returns Promise with auth_url to redirect user for OAuth
 */
const initiateOAuth = async (projectId: string, name: string, serverUrl: string): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    if (!name || !name.trim()) {
      return {
        success: false,
        error: 'Server name is required'
      };
    }

    if (!serverUrl || !serverUrl.trim()) {
      return {
        success: false,
        error: 'Server URL is required'
      };
    }

    const apiUrl = `${API_ENDPOINT}/projects/${projectId}/mcp-servers/oauth/initiate`;
    const response = await userService.makeAuthenticatedRequest(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name.trim(),
        server_url: serverUrl.trim()
      })
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 201) {
      const data = await response.json();
      return {
        success: true,
        data
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to initiate OAuth'
    };
  } catch (error: any) {
    console.error('Error initiating OAuth:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while initiating OAuth'
    };
  }
};

/**
 * Create a new MCP server for a project (for non-OAuth servers)
 * @param projectId - ID of the project
 * @param name - Name of the MCP server
 * @param url - URL of the remote MCP server
 * @returns Promise with created server data
 */
const createMcpServer = async (projectId: string, name: string, url: string): Promise<McpServerServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    if (!name || !name.trim()) {
      return {
        success: false,
        error: 'Server name is required'
      };
    }

    if (!url || !url.trim()) {
      return {
        success: false,
        error: 'Server URL is required'
      };
    }

    const apiUrl = `${API_ENDPOINT}/projects/${projectId}/mcp-servers`;
    const response = await userService.makeAuthenticatedRequest(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name.trim(),
        config: {
          url: url.trim()
        }
      })
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 201) {
      const server = await response.json();
      return {
        success: true,
        data: server
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to create MCP server'
    };
  } catch (error: any) {
    console.error('Error creating MCP server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while creating the MCP server'
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

    const url = `${API_ENDPOINT}/projects/${projectId}/mcp-servers/${serverId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
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
      error: errorData.detail || errorData.message || 'Failed to fetch MCP server'
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

    const url = `${API_ENDPOINT}/projects/${projectId}/mcp-servers/${serverId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
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
      error: errorData.detail || errorData.message || 'Failed to delete MCP server'
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
 * Connect to an MCP server
 * @param projectId - ID of the project
 * @param serverId - ID of the MCP server to connect
 * @returns Promise with connection status
 */
const connectMcpServer = async (projectId: string, serverId: string): Promise<McpServerServiceResponse> => {
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

    const url = `${API_ENDPOINT}/projects/${projectId}/mcp-servers/${serverId}/connect`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'POST'
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
      error: errorData.detail || errorData.message || 'Failed to connect to MCP server'
    };
  } catch (error: any) {
    console.error('Error connecting to MCP server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while connecting to the MCP server'
    };
  }
};

/**
 * Storage key for MCP servers
 */
const MCP_STORAGE_KEY = 'mcp_servers';

/**
 * Save MCP servers to local storage
 * @param projectId - ID of the project
 * @param servers - Array of MCP servers to save
 */
const saveMcpServersToStorage = async (projectId: string, servers: McpServer[]): Promise<void> => {
  try {
    const allMcpData = await storageService.getItem(MCP_STORAGE_KEY) || {};
    allMcpData[projectId] = servers.map(server => ({
      id: server.id,
      name: server.name,
      config: server.config,
      server_info: server.server_info,
      lastConnected: server.lastConnected
    }));
    await storageService.setItem(MCP_STORAGE_KEY, allMcpData);
    console.log(`[MCP Storage] Saved ${servers.length} servers for project ${projectId}`);
  } catch (error) {
    console.error('[MCP Storage] Error saving servers:', error);
  }
};

/**
 * Load MCP servers from local storage
 * @param projectId - ID of the project
 * @returns Array of stored MCP servers
 */
const loadMcpServersFromStorage = async (projectId: string): Promise<McpServer[]> => {
  try {
    const allMcpData = await storageService.getItem(MCP_STORAGE_KEY) || {};
    const servers = allMcpData[projectId] || [];
    console.log(`[MCP Storage] Loaded ${servers.length} servers for project ${projectId}`);
    return servers;
  } catch (error) {
    console.error('[MCP Storage] Error loading servers:', error);
    return [];
  }
};

/**
 * Remove MCP server from local storage
 * @param projectId - ID of the project
 * @param serverId - ID of the server to remove
 */
const removeMcpServerFromStorage = async (projectId: string, serverId: string): Promise<void> => {
  try {
    const allMcpData = await storageService.getItem(MCP_STORAGE_KEY) || {};
    if (allMcpData[projectId]) {
      allMcpData[projectId] = allMcpData[projectId].filter((s: McpServer) => s.id !== serverId);
      await storageService.setItem(MCP_STORAGE_KEY, allMcpData);
      console.log(`[MCP Storage] Removed server ${serverId} from project ${projectId}`);
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
const autoConnectStoredServers = async (projectId: string): Promise<{ server: McpServer; success: boolean }[]> => {
  const results: { server: McpServer; success: boolean }[] = [];

  try {
    // First, get current servers from API to validate they still exist
    const apiResult = await getMcpServers(projectId);
    if (!apiResult.success || !apiResult.data) {
      console.log('[MCP AutoConnect] Failed to get servers from API');
      return results;
    }

    const apiServers = apiResult.data as McpServer[];
    const storedServers = await loadMcpServersFromStorage(projectId);

    // Find servers that exist in both API and storage (valid stored configs)
    for (const storedServer of storedServers) {
      const apiServer = apiServers.find(s => s.id === storedServer.id);
      if (apiServer && apiServer.status !== 'connected') {
        console.log(`[MCP AutoConnect] Attempting to connect to ${apiServer.name}...`);
        const connectResult = await connectMcpServer(projectId, apiServer.id);
        results.push({
          server: connectResult.success && connectResult.data ? connectResult.data as McpServer : apiServer,
          success: connectResult.success
        });
      } else if (apiServer && apiServer.status === 'connected') {
        results.push({ server: apiServer, success: true });
      }
    }

    // Update storage with current API servers (syncs any changes)
    await saveMcpServersToStorage(projectId, apiServers);

  } catch (error) {
    console.error('[MCP AutoConnect] Error:', error);
  }

  return results;
};

export const mcpServerService = {
  getMcpServers,
  createMcpServer,
  getMcpServer,
  deleteMcpServer,
  connectMcpServer,
  initiateOAuth,
  // Storage methods
  saveMcpServersToStorage,
  loadMcpServersFromStorage,
  removeMcpServerFromStorage,
  autoConnectStoredServers
};
