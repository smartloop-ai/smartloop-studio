import { Box, IconButton, CircularProgress } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import CableIcon from '@mui/icons-material/Cable';
import { useState, useEffect } from 'react';
import { mcpServerService, McpServer } from '@/app/services/mcp-server.service';

interface McpServerItemProps {
  server: McpServer;
  projectId: string;
  onDelete: (server: McpServer) => void;
  onServerUpdate: (updatedServer: McpServer) => void;
  autoConnect?: boolean;
}

export default function McpServerItem({
  server,
  projectId,
  onDelete,
  onServerUpdate,
  autoConnect = true,
}: McpServerItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localServerInfo, setLocalServerInfo] = useState(server.server_info);

  // Update local state when prop changes
  useEffect(() => {
    setLocalServerInfo(server.server_info);
  }, [server.server_info]);

  // Server is connected if it has server_info
  const isConnected = !!localServerInfo;

  // Get display values - use server_info.title as primary
  const serverInfo = localServerInfo;
  const displayUrl = serverInfo?.website_url || serverInfo?.websiteUrl || server.remote_config?.server_url || server.config?.url || '';

  // Extract hostname from URL as fallback name
  const getHostnameFromUrl = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const displayName = serverInfo?.title || serverInfo?.name || server.name || getHostnameFromUrl(displayUrl) || 'MCP Server';

  // Icon can be in src or url field
  const icon = serverInfo?.icons?.[0];
  const iconUrl = icon?.src || (icon as any)?.url;

  // Connect server
  const handleConnect = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!projectId || !server.id || isConnecting) return;

    setIsConnecting(true);

    try {
      console.log(`[McpServerItem] Connecting to ${server.name}...`);
      const connectResult = await mcpServerService.connectMcpServer(projectId, server.id);

      if (connectResult.success) {
        // Fetch the updated server to get server_info
        const serverResult = await mcpServerService.getMcpServer(projectId, server.id);
        if (serverResult.success && serverResult.data) {
          const updatedServer = serverResult.data as McpServer;
          setLocalServerInfo(updatedServer.server_info);
          onServerUpdate(updatedServer);
          console.log(`[McpServerItem] ${server.name} connected successfully`);
        }
      } else {
        console.log(`[McpServerItem] ${server.name} failed to connect:`, connectResult.error);
      }
    } catch (error) {
      console.error(`[McpServerItem] Error connecting ${server.name}:`, error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect server (clear server_info locally)
  const handleDisconnect = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLocalServerInfo(undefined);
    onServerUpdate({ ...server, server_info: undefined });
  };

  // Auto-connect on mount if not connected and autoConnect is enabled
  useEffect(() => {
    if (autoConnect && !isConnected && !isConnecting && projectId && server.id) {
      handleConnect();
    }
  }, [autoConnect]); // Run when autoConnect changes or on mount

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        padding: '8px 12px',
        borderRadius: '6px',
        bgcolor: 'var(--sl-white-alpha-2)',
        border: '1px solid var(--sl-white-alpha-5)',
        transition: 'all 0.15s ease',
        '&:hover': {
          bgcolor: 'var(--sl-white-alpha-5)',
          borderColor: 'var(--sl-white-alpha-8)',
        },
      }}
    >
      <Box className="flex items-center gap-3">
        {/* Server Icon */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '6px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'var(--sl-white-alpha-5)',
            overflow: 'hidden',
          }}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={displayName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '6px',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <CableIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
          )}
        </Box>

        {/* Server Info */}
        <Box className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-white font-medium truncate">
                {displayName}
              </span>
              {/* Status Indicator */}
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isConnecting ? (
                  <CircularProgress size={8} sx={{ color: 'var(--sl-brand-primary)' }} />
                ) : (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: isConnected ? 'var(--sl-status-online)' : 'var(--sl-text-disabled)',
                      boxShadow: isConnected ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none',
                    }}
                  />
                )}
              </Box>
            </div>

            {/* Action Icons - Appear on Hover */}
            <Box className="flex items-center gap-0.5">
              {/* Connect/Disconnect Icon */}
              {isConnected ? (
                <IconButton
                  size="small"
                  onClick={handleDisconnect}
                  sx={{
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    color: 'var(--sl-status-online)',
                    padding: '4px',
                    '&:hover': {
                      color: 'var(--sl-status-error)',
                      bgcolor: 'var(--sl-danger-alpha-10)',
                    },
                  }}
                >
                  <LinkIcon sx={{ fontSize: 14 }} />
                </IconButton>
              ) : (
                <IconButton
                  size="small"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  sx={{
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    color: 'var(--sl-text-muted)',
                    padding: '4px',
                    '&:hover': {
                      color: 'var(--sl-status-online)',
                      bgcolor: 'rgba(34, 197, 94, 0.1)',
                    },
                    '&:disabled': {
                      opacity: isHovered ? 0.5 : 0,
                    },
                  }}
                >
                  <LinkOffIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}

              {/* Delete Icon */}
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(server);
                }}
                sx={{
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                  color: 'var(--sl-text-muted)',
                  padding: '4px',
                  '&:hover': {
                    color: 'var(--sl-status-error)',
                    bgcolor: 'var(--sl-danger-alpha-10)',
                  },
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </div>

          {/* URL or placeholder */}
          <div
            className="text-[10px] text-gray-500 leading-relaxed truncate"
            title={displayUrl}
          >
            {displayUrl || (isConnecting ? 'Connecting...' : '')}
          </div>
        </Box>
      </Box>
    </Box>
  );
}
