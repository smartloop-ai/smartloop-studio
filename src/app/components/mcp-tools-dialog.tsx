import { Box, IconButton, Dialog, TextField, InputAdornment } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { useEffect, useMemo, useState } from 'react';
import { McpServer, getMcpServerTools } from '@/app/services/mcp-server.service';
import { dialogStyles } from '@/app/shared/utils';

interface McpToolsDialogProps {
  open: boolean;
  onClose: () => void;
  server: McpServer;
  /** Overrides for catalog-driven entries, which have their own name/icon. */
  nameOverride?: string;
  iconOverride?: string;
}

/** Tools worth filtering rather than scanning. */
const FILTER_THRESHOLD = 8;

/**
 * Tool listing for a connected MCP server — the reference for which tool names
 * can be mentioned in chat. Shared by the catalog list and hand-added servers.
 */
export default function McpToolsDialog({ open, onClose, server, nameOverride, iconOverride }: McpToolsDialogProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  // The dialog stays mounted while closed — drop the filter so it reopens clean.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const isLocal = server.server_type === 'local';
  const serverInfo = server.server_info;
  const displayName = nameOverride || serverInfo?.title || serverInfo?.name || server.name || 'MCP Server';
  // The reference name is what the server was registered under (`server.name`) —
  // that's the identifier skills use to call this server (e.g. `yfmcp`), while
  // the title is what we display in the listing. Casing doesn't affect tool
  // resolution: the backend matches server/tool names case-insensitively.
  const serverName = server.name;
  const showServerName = Boolean(serverName && serverName !== displayName);
  const icon = serverInfo?.icons?.[0];
  const iconUrl = iconOverride || icon?.src || (icon as any)?.url;
  const tools = getMcpServerTools(server);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t: any) => t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
    );
  }, [tools, query]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          ...dialogStyles.paperWide,
          maxWidth: '760px',
          width: '92vw',
          height: '82vh',
          maxHeight: '820px',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      {/* Header */}
      <Box
        className="flex items-center gap-3 px-6 py-5 flex-shrink-0"
        sx={{ borderBottom: '1px solid var(--sl-border-subtle)' }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '10px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'var(--sl-bg-surface-1)',
            overflow: 'hidden',
          }}
        >
          {iconUrl && !iconFailed ? (
            <img
              src={iconUrl}
              alt={displayName}
              className="w-[22px] h-[22px] object-contain"
              onError={() => setIconFailed(true)}
            />
          ) : isLocal ? (
            <TerminalIcon sx={{ fontSize: 22, color: 'var(--sl-text-muted)' }} />
          ) : (
            <PowerOutlinedIcon sx={{ fontSize: 22, color: 'var(--sl-text-muted)' }} />
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <div className="text-[15px] font-bold text-sl-text-primary truncate">{displayName}</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
              style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}
            >
              {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
            </span>
            {showServerName && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  border: '1px solid var(--sl-border-default)',
                  color: 'var(--sl-text-faint)',
                  fontFamily: 'monospace',
                  letterSpacing: '0',
                }}
                title={`Referenced as ${serverName}.tool_name in skills`}
              >
                {serverName}
                <IconButton
                  size="small"
                  title={copiedTool === serverName ? 'Copied' : 'Copy reference name'}
                  onClick={() => {
                    navigator.clipboard.writeText(serverName);
                    setCopiedTool(serverName);
                    setTimeout(() => setCopiedTool(null), 1500);
                  }}
                  sx={{
                    color: copiedTool === serverName ? 'var(--sl-status-success)' : 'inherit',
                    padding: '0',
                    '&:hover': { color: 'var(--sl-brand-primary)', bgcolor: 'transparent' },
                  }}
                >
                  {copiedTool === serverName
                    ? <CheckIcon sx={{ fontSize: 10 }} />
                    : <ContentCopyIcon sx={{ fontSize: 10 }} />}
                </IconButton>
              </span>
            )}
            {serverInfo?.version && (
              <span className="text-[11px] text-sl-text-faint">v{serverInfo.version}</span>
            )}
          </div>
        </Box>

        <IconButton
          onClick={onClose}
          sx={{ color: 'var(--sl-text-muted)', flexShrink: 0, '&:hover': { bgcolor: 'var(--sl-bg-surface-1)' } }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {server.description && (
        <Box className="px-6 pt-4 flex-shrink-0">
          <p className="m-0 text-[12px] text-sl-text-muted leading-relaxed">{server.description}</p>
        </Box>
      )}

      {tools.length > FILTER_THRESHOLD && (
        <Box className="px-6 pt-4 flex-shrink-0">
          <TextField
            size="small"
            placeholder="Filter tools"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Escape clears the filter first, closing the dialog only once it's empty.
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'var(--sl-text-faint)' }} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setQuery('')}
                    title="Clear filter"
                    sx={{
                      color: 'var(--sl-text-faint)',
                      padding: '2px',
                      '&:hover': { color: 'var(--sl-brand-primary)', bgcolor: 'transparent' },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'var(--sl-white-alpha-5)',
                fontSize: '0.8125rem',
                borderRadius: '8px',
                '& fieldset': { borderColor: 'var(--sl-border-subtle)' },
                '&:hover fieldset': { borderColor: 'var(--sl-brand-alpha-30)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
              },
              '& .MuiInputBase-input': {
                color: 'var(--sl-text-primary)',
                padding: '9px 12px',
                '&::placeholder': { color: 'var(--sl-text-muted)', opacity: 1 },
              },
            }}
          />
        </Box>
      )}

      {/* Tool cards — same card treatment as the sidebar lists */}
      <Box className="flex-1 overflow-y-auto sidebar-scroll px-6 py-4">
        {filtered.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtered.map((tool: any) => {
                  const schema = tool.inputSchema || tool.input_schema;
                  const params = schema?.properties ? Object.entries(schema.properties) : [];
                  // Skills call this tool as `<server-name>.<tool-name>`, so the
                  // copy includes the prefix for a paste-ready reference.
                  const toolReference = serverName ? `${serverName}.${tool.name}` : tool.name;
                  const copied = copiedTool === tool.name;
                  return (
                <Box
                  key={tool.name}
                  className="rounded-xl"
                  sx={{
                    padding: '12px 14px',
                    border: '1px solid var(--sl-border-subtle)',
                    bgcolor: 'transparent',
                    transition: 'box-shadow 0.15s ease',
                    '&:hover': { boxShadow: 'inset 0 0 0 1px var(--sl-brand-alpha-30)' },
                  }}
                >
                  <div className="flex items-center gap-1">
                    <div className="text-[13px] font-bold font-mono text-sl-text-primary break-all">
                      {tool.name}
                    </div>
                    <IconButton
                      size="small"
                      title={copied ? 'Copied' : 'Copy tool reference'}
                      onClick={() => {
                        navigator.clipboard.writeText(toolReference);
                        setCopiedTool(tool.name);
                        setTimeout(() => setCopiedTool(null), 1500);
                      }}
                      sx={{
                        color: copied ? 'var(--sl-status-success)' : 'var(--sl-text-faint)',
                        padding: '3px',
                        flexShrink: 0,
                        '&:hover': { color: 'var(--sl-brand-primary)', bgcolor: 'transparent' },
                      }}
                    >
                      {copied
                        ? <CheckIcon sx={{ fontSize: 14 }} />
                        : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                    </IconButton>
                  </div>
                  {tool.description && (
                    // Providers ship paragraph-long descriptions (Linear's upload
                    // workflow runs ~15 lines) — clamp so the list stays scannable.
                    <p
                      className="m-0 mt-1.5 text-[12px] text-sl-text-muted leading-relaxed"
                      title={tool.description}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden',
                      }}
                    >
                      {tool.description}
                    </p>
                  )}
                  {params.length > 0 && (
                    <Box className="mt-3 pt-2.5" sx={{ borderTop: '1px solid var(--sl-border-subtle)' }}>
                      <div className="text-[10px] text-sl-text-disabled uppercase tracking-wider mb-1.5">
                        Parameters
                      </div>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {params.map(([name, spec]: [string, any]) => (
                          <div key={name} className="flex items-baseline gap-2 text-[11px]">
                            <span className="font-mono text-sl-text-tertiary">{name}</span>
                            {spec?.type && <span className="text-sl-text-faint">{spec.type}</span>}
                            {schema.required?.includes(name) && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}
                              >
                                Required
                              </span>
                            )}
                          </div>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ) : (
          <div className="text-[12px] text-sl-text-disabled py-8 text-center">
            {tools.length > 0 ? `No tools match “${query}”` : 'No tools available'}
          </div>
        )}
      </Box>
    </Dialog>
  );
}
