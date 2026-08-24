import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import { McpCatalogEntry, McpServer, getMcpServerTools } from '@/app/services/mcp-server.service';
import McpToolsDialog from './mcp-tools-dialog';
import McpIndexingPill from './mcp-indexing-pill';

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
  /** Stop waiting on an authorization the user isn't going to finish. */
  onCancelAuth: (entry: McpCatalogEntry) => void;
  /** Re-run discovery, tool indexing and the content crawl for this server. */
  onRefresh: (server: McpServer) => void;
}

export default function McpCatalogItem({
  entry,
  connected,
  connecting = false,
  awaitingAuth = false,
  error = '',
  onConnect,
  onDisconnect,
  onCancelAuth,
  onRefresh,
}: McpCatalogItemProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const isConnected = !!connected;
  const busy = connecting || awaitingAuth;
  // True from the click until the backend reports the server as working again,
  // so the button can't be pressed twice into the same queued pass.
  const reindexing = !!connected?.indexing?.in_progress;
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
        {/* Provider icon in a tinted chip, falling back to the generic glyph */}
        <Box
          sx={{
            width: 28,
            height: 28,
            mt: '1px',
            flexShrink: 0,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Deliberately identical connected or not: the provider's logo is
            // an identity, not a state, and tinting it made a connected card
            // read as selected. The "Connected" pill below carries the state.
            backgroundColor: 'var(--sl-white-alpha-7)',
            border: '1px solid',
            borderColor: 'var(--sl-border-default)',
            color: 'var(--sl-text-faint)',
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
                disabled={reindexing}
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh(connected!);
                }}
                title="Re-index this connection"
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: 'var(--sl-brand-primary)' },
                  '&.Mui-disabled': { color: 'var(--sl-text-faint)', opacity: 0.3 },
                }}
              >
                <RefreshIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}

            {/* Mid-flight, the corner is a way out. Authorization happens in a
                browser we don't control and often isn't finished — abandoned at
                the provider's login, or done in a window the user already
                closed — so waiting has to be cancellable rather than something
                to sit through. */}
            {busy && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelAuth(entry);
                }}
                title="Stop waiting for authorization"
                sx={{
                  color: 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: 'var(--sl-status-error)' },
                }}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}

            {/* Connected only, and the glyph is the action rather than the
                state: a button showing an intact link invites you to read it
                as "connected" and then wonder what clicking does. An
                unconnected card says "Click to connect" on the pill below, so
                a corner icon there would be a second control for one action. */}
            {isConnected && !busy && (
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
                <LinkOffIcon sx={{ fontSize: 14 }} />
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
            {/* Which account this is linked as — the one thing about a
                connected card that isn't already obvious from the rest of it,
                and what tells two connections to the same product apart. */}
            {isConnected && connected?.account && (
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
                title={`Linked as ${connected.account}`}
              >
                {connected.account}
              </span>
            )}

            {isConnected ? null : awaitingAuth ? (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{ border: '1px solid rgba(250,204,21,0.3)', color: 'rgb(250,204,21)' }}
              >
                Authorizing
              </span>
            ) : (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-colors"
                style={{ border: '1px solid var(--sl-white-alpha-15)', color: 'var(--sl-text-primary)' }}
              >
                Click to connect
              </span>
            )}

            {isConnected && toolCount > 0 && (
              <span
                role="button"
                title="View tools"
                onClick={(e) => {
                  e.stopPropagation();
                  setToolsOpen(true);
                }}
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide cursor-pointer transition-colors"
                style={{ border: '1px solid rgba(96,165,253,0.35)', color: '#93c5fd' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(96,165,253,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
              </span>
            )}

            {isConnected && <McpIndexingPill indexing={connected?.indexing} />}
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
