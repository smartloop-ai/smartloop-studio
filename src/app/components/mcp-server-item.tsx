import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState } from 'react';
import { McpServer, getMcpServerUrl, getMcpServerTools, TagColor, tagColorFrom } from '@/app/services/mcp-server.service';
import McpToolsDialog from './mcp-tools-dialog';

interface McpServerItemProps {
  server: McpServer;
  projectId: string;
  onDelete: (server: McpServer) => void;
  onServerUpdate: (updatedServer: McpServer) => void;
  autoConnect?: boolean;
  discovering?: boolean;
  isSystem?: boolean;
  /** Show a gold "Custom" tag marking this as a hand-added server. */
  isCustom?: boolean;
  /** Distinct colors for this server's tags, assigned across the whole list. */
  tagColors?: Map<string, TagColor>;
  deleteError?: string;
}

export default function McpServerItem({
  server,
  onDelete,
  discovering = false,
  isSystem = false,
  isCustom = false,
  tagColors,
  deleteError = '',
}: McpServerItemProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const isLocal = server.server_type === 'local';
  const serverInfo = server.server_info;

  // Remote servers show their endpoint; local ones have no URL — the package
  // name is already the title, so showing it again as a "URL" pill just
  // duplicates it. Local servers get a "Local" tag instead (below).
  const displayUrl = isLocal
    ? ''
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
        className="rounded-xl group"
        sx={{
          padding: '12px 14px',
          border: deleteError ? '1px solid var(--sl-status-error)' : '1px solid var(--sl-border-subtle)',
          // Custom cards get a subtle inset fill so they read as nested against
          // the panel, distinct from the transparent curated catalog cards.
          bgcolor: deleteError ? 'rgba(248,113,113,0.08)' : 'var(--sl-white-alpha-5)',
          display: 'flex',
          gap: 1.25,
          transition: 'box-shadow 0.15s ease, background 0.15s ease',
          cursor: 'pointer',
          '&:hover': {
            boxShadow: deleteError ? 'none' : 'inset 0 0 0 1px var(--sl-brand-alpha-30)',
            bgcolor: deleteError ? 'rgba(248,113,113,0.12)' : 'var(--sl-white-alpha-7)',
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

            {/* Row actions — fade in on card hover to keep the card clean */}
            <Box
              className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
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

              {/* Disconnect — removes the server from this project */}
              <IconButton
                size="small"
                disabled={isSystem}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(server);
                }}
                title={isSystem ? '' : 'Disconnect'}
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: isSystem ? 'var(--sl-text-faint)' : 'var(--sl-status-error)' },
                  '&.Mui-disabled': { color: 'var(--sl-text-faint)', opacity: 0.3 },
                }}
              >
                <LinkOffIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Description */}
          {server.description && (
            <span className="text-[12px] text-sl-text-muted leading-relaxed" title={server.description}>
              {server.description}
            </span>
          )}

          {/* Metadata row: Custom + Local/URL + tool count */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            {isCustom && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid color-mix(in srgb, var(--sl-status-warning) 35%, transparent)', color: 'var(--sl-status-warning)', backgroundColor: 'color-mix(in srgb, var(--sl-status-warning) 8%, transparent)' }}
              >
                Custom
              </span>
            )}
            {isLocal && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
              >
                Local
              </span>
            )}
            {(server.tags || []).map((tag) => {
              const c = tagColorFrom(tagColors ?? new Map(), tag);
              return (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                  style={{ border: `1px solid ${c.border}`, color: c.color }}
                >
                  {tag}
                </span>
              );
            })}
            {displayUrl && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide"
                style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}
                title={displayUrl}
              >
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
                style={{ border: '1px solid rgba(96,165,253,0.35)', color: '#93c5fd' }}
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
