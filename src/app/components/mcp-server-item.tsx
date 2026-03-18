import { Box, IconButton } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CableIcon from '@mui/icons-material/Cable';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useState } from 'react';
import { McpServer } from '@/app/services/mcp-server.service';

interface McpServerItemProps {
  server: McpServer;
  projectId: string;
  onDelete: (server: McpServer) => void;
  onServerUpdate: (updatedServer: McpServer) => void;
  autoConnect?: boolean;
}

export default function McpServerItem({
  server,
  onDelete,
}: McpServerItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isLocal = server.server_type === 'local';
  const serverInfo = server.server_info;

  const displayUrl = isLocal
    ? [server.command, ...(server.args || [])].join(' ')
    : serverInfo?.website_url || serverInfo?.websiteUrl || server.remote_config?.server_url || server.config?.url || '';

  const getHostnameFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const displayName = serverInfo?.title || serverInfo?.name || server.name || getHostnameFromUrl(displayUrl) || 'MCP Server';

  const icon = serverInfo?.icons?.[0];
  const iconUrl = icon?.src || (icon as any)?.url;

  const tools = server.tools ?? server.metadata?.tools ?? [];

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
          ) : isLocal ? (
            <TerminalIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
          ) : (
            <CableIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
          )}
        </Box>

        {/* Server Info */}
        <Box className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white font-medium truncate">
              {displayName}
            </span>

            {/* Delete Icon - appears on hover */}
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
          </div>

          {/* Description */}
          {server.description && (
            <div className="text-[10px] text-gray-400 leading-snug truncate" title={server.description}>
              {server.description}
            </div>
          )}

          {/* URL */}
          <div
            className="text-[10px] text-gray-500 leading-relaxed truncate"
            title={displayUrl}
          >
            {displayUrl}
          </div>

        </Box>
      </Box>

      {tools.length > 0 && (
        <div className="text-[10px] text-gray-500 mt-1 pl-[40px]">
          {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
        </div>
      )}
    </Box>
  );
}
