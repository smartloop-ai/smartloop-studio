import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState } from 'react';
import { McpServer, getMcpServerUrl, getMcpServerTools } from '@/app/services/mcp-server.service';
import McpToolsDialog from './mcp-tools-dialog';

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
    : serverInfo?.website_url || serverInfo?.websiteUrl || getMcpServerUrl(server);

  const getHostnameFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const displayName = serverInfo?.title || serverInfo?.name || server.name || getHostnameFromUrl(displayUrl) || 'MCP Server';

  const allTools = getMcpServerTools(server);

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

      <McpToolsDialog open={modalOpen} onClose={() => setModalOpen(false)} server={server} />
    </>
  );
}
