import { Box, IconButton, CircularProgress, Dialog } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CableIcon from '@mui/icons-material/Cable';
import TerminalIcon from '@mui/icons-material/Terminal';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState } from 'react';
import { McpServer } from '@/app/services/mcp-server.service';
import { dialogStyles } from '@/app/shared/utils';

interface McpServerItemProps {
  server: McpServer;
  projectId: string;
  onDelete: (server: McpServer) => void;
  onServerUpdate: (updatedServer: McpServer) => void;
  autoConnect?: boolean;
  discovering?: boolean;
}

export default function McpServerItem({
  server,
  onDelete,
  discovering = false,
}: McpServerItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const isLocal = server.server_type === 'local';
  const serverInfo = server.server_info;

  const displayUrl = isLocal
    ? server.name || 'Local Server'
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
    <>
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
                className="w-full h-full object-cover rounded-md"
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

              <Box sx={{ display: 'flex', alignItems: 'center', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                {/* Info Icon - opens tools modal */}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalOpen(true);
                  }}
                  sx={{
                    color: 'var(--sl-text-muted)',
                    padding: '4px',
                    '&:hover': {
                      color: 'var(--sl-brand-primary)',
                      bgcolor: 'var(--sl-white-alpha-5)',
                    },
                  }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                </IconButton>

                {/* Delete Icon */}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(server);
                  }}
                  sx={{
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

            {/* Description */}
            {server.description && (
              <div className="text-[10px] text-gray-400 leading-snug" title={server.description}>
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

        <div className="text-[10px] text-gray-500 mt-1 pl-[40px] flex items-center gap-1.5">
          {discovering ? (
            <>
              <CircularProgress size={8} sx={{ color: 'var(--sl-brand-primary)' }} />
              <span className="text-gray-400">Discovering tools...</span>
            </>
          ) : tools.length > 0 ? (
            <span>{tools.length} {tools.length === 1 ? 'tool' : 'tools'}</span>
          ) : null}
        </div>
      </Box>

      {/* Tools Detail Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: dialogStyles.paper
        }}
        BackdropProps={{
          sx: dialogStyles.backdrop
        }}
      >
        <Box className="relative p-6">
          <IconButton
            onClick={() => setModalOpen(false)}
            sx={{
              position: 'absolute',
              right: 12,
              top: 12,
              color: 'var(--sl-text-muted)',
              '&:hover': { bgcolor: 'var(--sl-white-alpha-5)' },
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>

          {/* Header */}
          <Box className="flex items-center gap-3 mb-4">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
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
                  className="w-full h-full object-cover rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : isLocal ? (
                <TerminalIcon sx={{ fontSize: 20, color: 'var(--sl-text-muted)' }} />
              ) : (
                <CableIcon sx={{ fontSize: 20, color: 'var(--sl-text-muted)' }} />
              )}
            </Box>
            <Box>
              <div className="text-sm text-white font-medium">{displayName}</div>
              {serverInfo?.version && (
                <div className="text-xs text-gray-500">v{serverInfo.version}</div>
              )}
            </Box>
          </Box>

          {server.description && (
            <div className="text-xs text-gray-400 mb-4 leading-relaxed">
              {server.description}
            </div>
          )}

          {/* Tools List */}
          <div className="text-xs text-gray-400 font-medium mb-2">
            Tools ({tools.length})
          </div>

          {tools.length > 0 ? (
            <Box
              sx={{
                maxHeight: 400,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {tools.map((tool: any) => (
                <Box
                  key={tool.name}
                  sx={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    bgcolor: 'var(--sl-white-alpha-2)',
                    '&:hover': { bgcolor: 'var(--sl-white-alpha-5)' },
                  }}
                >
                  <div className="text-xs text-white font-medium">{tool.name}</div>
                  {tool.description && (
                    <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                      {tool.description}
                    </div>
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <div className="text-xs text-gray-500 py-4 text-center">
              No tools available
            </div>
          )}
        </Box>
      </Dialog>
    </>
  );
}
