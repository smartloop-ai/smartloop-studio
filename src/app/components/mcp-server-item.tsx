import { Box, IconButton, CircularProgress, Dialog } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
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
  isSystem?: boolean;
}

export default function McpServerItem({
  server,
  onDelete,
  discovering = false,
  isSystem = false,
}: McpServerItemProps) {
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

  const allTools = server.tools ?? server.metadata?.tools ?? [];

  return (
    <>
      <Box
        onClick={() => setModalOpen(true)}
        sx={{
          px: 1,
          py: '6px',
          borderRadius: '6px',
          border: '1px solid var(--sl-border-subtle)',
          display: 'flex',
          gap: 0.75,
          transition: 'background 0.1s ease',
          mb: 0.75,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'var(--sl-brand-alpha-10)',
          },
        }}
      >
        {/* Leading icon */}
        {isLocal ? (
          <TerminalIcon sx={{ fontSize: 11, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '2px' }} />
        ) : (
          <PowerOutlinedIcon sx={{ fontSize: 11, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '2px' }} />
        )}

        {/* Server Info */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span className="text-[11px] text-sl-text-tertiary truncate flex-1">
              {displayName}
            </span>

            {/* Info Icon - opens tools modal */}
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setModalOpen(true);
              }}
              sx={{
                color: 'var(--sl-text-faint)',
                padding: '2px',
                '&:hover': { color: 'var(--sl-brand-primary)' },
              }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 12 }} />
            </IconButton>

            {/* Delete Icon */}
            <IconButton
              size="small"
              disabled={isSystem}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(server);
              }}
              sx={{
                color: 'var(--sl-text-faint)',
                padding: '2px',
                '&:hover': { color: isSystem ? 'var(--sl-text-faint)' : 'var(--sl-status-error)' },
                '&.Mui-disabled': { color: 'var(--sl-text-faint)', opacity: 0.3 },
              }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Box>

          {/* Description */}
          {server.description && (
            <span className="text-[10px] text-sl-text-disabled" style={{ lineHeight: 1.4 }} title={server.description}>
              {server.description}
            </span>
          )}

          {/* Metadata row: URL + tool count */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            {displayUrl && (
              <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }} title={displayUrl}>
                {displayUrl}
              </span>
            )}
            {discovering ? (
              <>
                <CircularProgress size={8} sx={{ color: 'var(--sl-brand-primary)' }} />
                <span style={{ fontSize: '9px', color: 'var(--sl-brand-primary)' }}>Discovering…</span>
              </>
            ) : allTools.length > 0 ? (
              <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-bg-surface-1)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>
                {allTools.length} {allTools.length === 1 ? 'tool' : 'tools'}
              </span>
            ) : null}
          </Box>
        </Box>
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
              '&:hover': { bgcolor: 'var(--sl-bg-surface-1)' },
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
                bgcolor: 'var(--sl-bg-surface-1)',
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
                <PowerOutlinedIcon sx={{ fontSize: 20, color: 'var(--sl-text-muted)' }} />
              )}
            </Box>
            <Box>
              <div className="text-sm text-sl-text-primary font-medium">{displayName}</div>
              {serverInfo?.version && (
                <div className="text-xs text-sl-text-disabled">v{serverInfo.version}</div>
              )}
            </Box>
          </Box>

          {server.description && (
            <div className="text-xs text-sl-text-muted mb-4 leading-relaxed">
              {server.description}
            </div>
          )}

          {/* Tools List */}
          <div className="text-xs text-sl-text-muted font-medium mb-2">
            Tools ({allTools.length})
          </div>

          {allTools.length > 0 ? (
            <Box
              sx={{
                maxHeight: 400,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {allTools.map((tool: any) => (
                <Box
                  key={tool.name}
                  sx={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    bgcolor: 'var(--sl-bg-surface-1)',
                    '&:hover': { bgcolor: 'var(--sl-bg-surface-1)' },
                  }}
                >
                  <div className="text-xs text-sl-text-primary font-medium">{tool.name}</div>
                  {tool.description && (
                    <div className="text-[11px] text-sl-text-disabled leading-snug mt-0.5">
                      {tool.description}
                    </div>
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <div className="text-xs text-sl-text-disabled py-4 text-center">
              No tools available
            </div>
          )}
        </Box>
      </Dialog>
    </>
  );
}
