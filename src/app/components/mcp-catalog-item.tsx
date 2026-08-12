import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState } from 'react';
import { McpCatalogEntry, McpServer, getMcpServerTools, TagColor } from '@/app/services/mcp-server.service';
import McpToolsDialog from './mcp-tools-dialog';

interface McpCatalogItemProps {
  entry: McpCatalogEntry;
  /** The installed server this catalog entry maps to, when connected. */
  connected?: McpServer;
  connecting?: boolean;
  /** OAuth was launched for this entry and we're waiting on the callback. */
  awaitingAuth?: boolean;
  error?: string;
  onConnect: (entry: McpCatalogEntry) => void;
  onDisconnect: (server: McpServer) => void;
  /** Distinct color assigned to this entry's category by the parent list. */
  categoryColor?: TagColor;
}

export default function McpCatalogItem({
  entry,
  connected,
  connecting = false,
  awaitingAuth = false,
  error = '',
  onConnect,
  onDisconnect,
  categoryColor,
}: McpCatalogItemProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const isConnected = !!connected;
  const busy = connecting || awaitingAuth;
  const toolCount = getMcpServerTools(connected).length;

  return (
    <>
    <Tooltip title={error || ''} arrow placement="top">
      <Box
        role="button"
        onClick={() => {
          if (busy) return;
          // Connected entries open their tool list; the rest start OAuth.
          if (isConnected) return setToolsOpen(true);
          onConnect(entry);
        }}
        className="rounded-xl"
        sx={{
          padding: '12px 14px',
          display: 'flex',
          gap: 1.25,
          cursor: busy ? 'default' : 'pointer',
          border: error ? '1px solid var(--sl-status-error)' : '1px solid var(--sl-border-subtle)',
          bgcolor: error ? 'rgba(248,113,113,0.08)' : 'transparent',
          transition: 'box-shadow 0.15s ease, background 0.15s ease',
          '&:hover': {
            boxShadow: error || busy ? 'none' : 'inset 0 0 0 1px var(--sl-brand-alpha-30)',
          },
        }}
      >
        {/* Provider icon, falling back to the generic connection glyph */}
        <Box
          sx={{
            width: 22,
            height: 22,
            mt: '1px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isConnected ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)',
          }}
        >
          {entry.icon_url && !iconFailed ? (
            <img
              src={entry.icon_url}
              alt={entry.display_name}
              className="w-[18px] h-[18px] object-contain rounded"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <PowerOutlinedIcon sx={{ fontSize: 18 }} />
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1">
              {entry.display_name}
            </span>

            {busy && <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />}

            {isConnected && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setToolsOpen(true);
                }}
                title="View tools"
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: 'var(--sl-brand-primary)' },
                }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 13 }} />
              </IconButton>
            )}

            {isConnected && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnect(connected!);
                }}
                title="Disconnect"
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: 'var(--sl-status-error)' },
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>

          {entry.description && (
            <span
              className="text-[12px] text-sl-text-muted leading-relaxed"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}
            >
              {entry.description}
            </span>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: '2px' }}>
            {isConnected ? (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid rgba(52,211,153,0.3)', color: 'rgb(52,211,153)' }}
              >
                Connected
              </span>
            ) : awaitingAuth ? (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid rgba(250,204,21,0.3)', color: 'rgb(250,204,21)' }}
              >
                Authorizing
              </span>
            ) : (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)' }}
              >
                Connect
              </span>
            )}

            {isConnected && toolCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid rgba(96,165,253,0.35)', color: '#93c5fd' }}
              >
                {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
              </span>
            )}

            {entry.category && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  border: `1px solid ${categoryColor?.border || 'var(--sl-border-default)'}`,
                  color: categoryColor?.color || 'var(--sl-text-faint)',
                }}
              >
                {entry.category}
              </span>
            )}
          </Box>
        </Box>
      </Box>
    </Tooltip>

    {connected && (
      <McpToolsDialog
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        server={connected}
        nameOverride={entry.display_name}
        iconOverride={entry.icon_url}
      />
    )}
    </>
  );
}
