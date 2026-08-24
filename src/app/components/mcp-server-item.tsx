import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useState } from 'react';
import { McpServer, getMcpServerUrl, getMcpServerTools, TagColor, tagColorFrom } from '@/app/services/mcp-server.service';
import McpToolsDialog from './mcp-tools-dialog';
import McpIndexingPill from './mcp-indexing-pill';

interface McpServerItemProps {
  server: McpServer;
  projectId: string;
  onDelete: (server: McpServer) => void;
  /** Re-run discovery, tool indexing and the content crawl for this server. */
  onRefresh: (server: McpServer) => void;
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
  onRefresh,
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
        className="rounded-xl"
        sx={{
          padding: '12px 14px',
          border: deleteError ? '1px solid var(--sl-status-error)' : '1px solid var(--sl-border-subtle)',
          // Custom cards get a subtle inset fill so they read as nested against
          // the panel, distinct from the transparent curated catalog cards.
          bgcolor: deleteError ? 'rgba(248,113,113,0.08)' : 'var(--sl-white-alpha-5)',
          transition: 'box-shadow 0.15s ease, background 0.15s ease',
          cursor: 'pointer',
          '&:hover': {
            boxShadow: deleteError ? 'none' : 'inset 0 0 0 1px var(--sl-brand-alpha-30)',
            bgcolor: deleteError ? 'rgba(248,113,113,0.12)' : 'var(--sl-white-alpha-7)',
          },
        }}
      >
        {/* Header — icon, name and actions on one line, matching the models
            list. What follows runs the full width of the card rather than
            being indented under the icon. */}
        <div className="flex items-center gap-2.5">
          {isLocal ? (
            <TerminalIcon sx={{ fontSize: 18, color: 'var(--sl-text-faint)', flexShrink: 0 }} />
          ) : (
            <PowerOutlinedIcon sx={{ fontSize: 18, color: 'var(--sl-text-faint)', flexShrink: 0 }} />
          )}

          <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1 min-w-0">
            {displayName}
          </span>

            {/* Row actions, always visible. They used to fade in on hover,
                which reads as "this card has no actions" until you happen to
                mouse over it — and the catalog cards next to it show theirs
                unconditionally, so hiding these made the two kinds of card
                look like they could do different things. */}
          <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">
              {/* Re-index — the tool count pill opens the tool list, so this
                  slot carries the one action the card can't otherwise offer. */}
              <IconButton
                size="small"
                disabled={!!server.indexing?.in_progress}
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh(server);
                }}
                title="Re-index this connection"
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: 'var(--sl-brand-primary)' },
                  '&.Mui-disabled': { color: 'var(--sl-text-faint)', opacity: 0.3 },
                }}
              >
                <RefreshIcon sx={{ fontSize: 13 }} />
              </IconButton>

              {/* A trash icon, not a link one: a hand-added server is deleted
                  outright — it and its connection file are gone, and nothing
                  reconnects it. Unlink would promise it could come back. */}
              <IconButton
                size="small"
                disabled={isSystem}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(server);
                }}
                title={isSystem ? 'Built-in connection' : 'Delete this connection'}
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: isSystem ? 'var(--sl-text-faint)' : 'var(--sl-status-error)' },
                  '&.Mui-disabled': { color: 'var(--sl-text-faint)', opacity: 0.3 },
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
          </div>
        </div>

        {/* Description */}
        {server.description && (
          <p className="text-[12px] text-sl-text-muted leading-relaxed mt-2 mb-0" title={server.description}>
            {server.description}
          </p>
        )}

        {/* Metadata row: Custom + Local/URL + tool count */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: '8px' }}>
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
            {server.account && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide"
                style={{
                  border: '1px solid rgba(52,211,153,0.3)',
                  color: 'rgb(52,211,153)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '160px',
                }}
                title={`Linked as ${server.account}`}
              >
                {server.account}
              </span>
            )}
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
                role="button"
                title="View tools"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalOpen(true);
                }}
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide cursor-pointer transition-colors"
                style={{ border: '1px solid rgba(96,165,253,0.35)', color: '#93c5fd' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(96,165,253,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {allTools.length} {allTools.length === 1 ? 'tool' : 'tools'}
              </span>
            ) : null}
            {!discovering && <McpIndexingPill indexing={server.indexing} />}
        </Box>
      </Box>
      </Tooltip>

      <McpToolsDialog open={modalOpen} onClose={() => setModalOpen(false)} server={server} />
    </>
  );
}
