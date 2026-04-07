import { Box } from '@mui/material';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import { McpServer } from '@/app/services/mcp-server.service';

interface McpTabProps {
  server: McpServer;
}

export default function McpTab({ server }: McpTabProps) {
  const isLocal = server.server_type === 'local';
  const serverInfo = server.server_info;
  const displayUrl = isLocal
    ? server.name || 'Local Server'
    : serverInfo?.website_url || (serverInfo as any)?.websiteUrl || server.remote_config?.server_url || server.config?.url || '';
  const displayName = serverInfo?.title || serverInfo?.name || server.name || 'MCP Server';
  const icon = serverInfo?.icons?.[0];
  const iconUrl = icon?.src || (icon as any)?.url;
  const allTools = server.tools ?? server.metadata?.tools ?? [];

  return (
    <Box className="h-full overflow-y-auto p-6">
      <Box className="max-w-3xl mx-auto">
        {/* Server Header */}
        <Box className="flex items-center gap-4 mb-6">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '10px',
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
              <TerminalIcon sx={{ fontSize: 24, color: 'var(--sl-text-muted)' }} />
            ) : (
              <PowerOutlinedIcon sx={{ fontSize: 24, color: 'var(--sl-text-muted)' }} />
            )}
          </Box>
          <Box>
            <div className="text-lg text-white font-medium">{displayName}</div>
            {serverInfo?.version && (
              <div className="text-xs text-gray-500">v{serverInfo.version}</div>
            )}
            {server.description && (
              <div className="text-sm text-gray-400 mt-1">{server.description}</div>
            )}
            <div className="text-xs text-gray-500 mt-0.5" title={displayUrl}>
              {displayUrl}
            </div>
          </Box>
        </Box>

        {/* Tools Section */}
        <Box className="mb-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Tools ({allTools.length})
          </div>

          {allTools.length > 0 ? (
            <Box className="space-y-2">
              {allTools.map((tool: any) => (
                <Box
                  key={tool.name}
                  sx={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    bgcolor: 'var(--sl-white-alpha-2)',
                    border: '1px solid var(--sl-white-alpha-5)',
                    '&:hover': { bgcolor: 'var(--sl-white-alpha-5)' },
                  }}
                >
                  <div className="text-sm text-white font-medium">{tool.name}</div>
                  {tool.description && (
                    <div className="text-xs text-gray-500 leading-snug mt-1">
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
      </Box>
    </Box>
  );
}
