import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import { McpCatalogEntry, McpServer, getMcpServerTools, TagColor, tagColorFrom } from '@/app/services/mcp-server.service';
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
  /** Distinct colors for this entry's tags, assigned across the whole list. */
  tagColors?: Map<string, TagColor>;
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
  tagColors,
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
          cursor: busy ? 'default' : 'pointer',
          border: error ? '1px solid var(--sl-status-error)' : '1px solid var(--sl-border-subtle)',
          bgcolor: error ? 'rgba(248,113,113,0.08)' : 'transparent',
          transition: 'box-shadow 0.15s ease, background 0.15s ease',
          '&:hover': {
            boxShadow: error || busy ? 'none' : 'inset 0 0 0 1px var(--sl-brand-alpha-30)',
          },
        }}
      >
        {/* Header — icon, name and actions on one line. The description and
            pills below run the full width of the card instead of being
            indented under the icon, which is the models list's layout and
            reclaims ~38px on every row of a narrow sidebar. */}
        <div className="flex items-center gap-2.5">
        {/* Provider icon in a tinted chip, falling back to the generic glyph */}
        <Box
          sx={{
            // Sized to the one line of text beside it. The models list pairs a
            // 30px icon with a stacked title and subtitle — roughly 26px of
            // text — so it balances; here there is a single 13px name, and a
            // 28px chip next to it read as the loudest thing on the card.
            width: 22,
            height: 22,
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
              className="w-[14px] h-[14px] object-contain rounded"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <PowerOutlinedIcon sx={{ fontSize: 14 }} />
          )}
        </Box>

          <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1 min-w-0">
            {entry.display_name}
          </span>

          <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">

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

            {/* Present on every card, so the action row doesn't jump around as
                connections come and go, and the glyph reads as the link state:
                intact and green once connected, broken and faint before.
                Clicking toggles it either way. */}
            {!busy && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isConnected) return onDisconnect(connected!);
                  onConnect(entry);
                }}
                title={isConnected ? 'Connected — click to disconnect' : 'Not connected — click to connect'}
                sx={{
                  color: isConnected ? 'rgb(52,211,153)' : 'var(--sl-text-faint)',
                  padding: '2px',
                  '&:hover': { color: isConnected ? 'var(--sl-status-error)' : 'var(--sl-brand-primary)' },
                }}
              >
                {isConnected
                  ? <LinkIcon sx={{ fontSize: 14 }} />
                  : <LinkOffIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            )}
          </div>
        </div>

        {entry.description && (
          <p
            className="text-[12px] text-sl-text-muted leading-relaxed mt-2 mb-0"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}
          >
            {entry.description}
          </p>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: '8px' }}>
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

            {/* What the connection is for. The custom cards have carried these
                since they were added; a curated entry has better ones and was
                showing none, so the two kinds of card described themselves
                differently for no reason. Capped — Notion ships four, which
                wraps the row in a narrow sidebar. */}
            {(entry.tags || []).slice(0, 3).map((tag) => {
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
