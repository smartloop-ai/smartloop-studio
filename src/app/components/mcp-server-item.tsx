import { Box, IconButton, CircularProgress, Dialog, Tooltip } from '@mui/material';
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
  deleteError?: string;
}

export default function McpServerItem({
  server,
  onDelete,
  discovering = false,
  isSystem = false,
  deleteError = '',
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
      <Tooltip title={deleteError || ''} arrow placement="top">
      <Box
        onClick={() => setModalOpen(true)}
        className="rounded-xl"
        sx={{
          padding: '12px 14px',
          border: deleteError ? '1px solid var(--sl-status-error)' : '1px solid var(--sl-border-subtle)',
          bgcolor: deleteError ? 'rgba(248,113,113,0.08)' : 'transparent',
          display: 'flex',
          gap: 1.25,
          transition: 'box-shadow 0.15s ease, background 0.15s ease',
          cursor: 'pointer',
          '&:hover': {
            boxShadow: deleteError ? 'none' : 'inset 0 0 0 1px var(--sl-brand-alpha-30)',
            bgcolor: deleteError ? 'rgba(248,113,113,0.12)' : 'transparent',
          },
        }}
      >
        {/* Leading icon */}
        {isLocal ? (
          <TerminalIcon sx={{ fontSize: 18, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '1px' }} />
        ) : (
          <PowerOutlinedIcon sx={{ fontSize: 18, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '1px' }} />
        )}

        {/* Server Info */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1">
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
            <span className="text-[12px] text-sl-text-muted leading-relaxed" title={server.description}>
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
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-faint)' }}
              >
                {allTools.length} {allTools.length === 1 ? 'tool' : 'tools'}
              </span>
            ) : null}
          </Box>
        </Box>
      </Box>
      </Tooltip>

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
