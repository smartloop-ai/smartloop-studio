import { Box } from '@mui/material';
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
  const allTools = server.tools ?? server.metadata?.tools ?? [];

  return (
    <Box className="h-full overflow-y-auto p-6">
      <Box className="max-w-3xl mx-auto">
        {/* Server name as subtitle, matching document viewer */}
        <Box className="text-[11px] text-sl-text-disabled mb-1 uppercase tracking-wider">{displayName}</Box>
        {displayUrl && (
          <Box className="text-[11px] text-sl-text-faint mb-6">{displayUrl}</Box>
        )}
        {!displayUrl && <Box className="mb-6" />}

        {server.description && (
          <Box className="text-sm text-sl-text-muted mb-6 leading-relaxed">
            {server.description}
          </Box>
        )}

        {serverInfo?.version && (
          <Box className="text-xs text-sl-text-disabled mb-6">Version {serverInfo.version}</Box>
        )}

        {/* Tools Section */}
        <Box className="mb-4">
          <Box className="text-[11px] text-sl-text-disabled uppercase tracking-wider mb-4">
            Tools ({allTools.length})
          </Box>

          {allTools.length > 0 ? (
            <Box className="space-y-3">
              {allTools.map((tool: any) => (
                <Box
                  key={tool.name}
                  sx={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    bgcolor: 'var(--sl-bg-surface-1)',
                    border: '1px solid var(--sl-border-subtle)',
                  }}
                >
                  <Box className="text-sm text-sl-text-primary font-medium mb-1" sx={{ fontFamily: 'monospace' }}>
                    {tool.name}
                  </Box>
                  {tool.description && (
                    <Box className="text-xs text-sl-text-muted leading-relaxed">
                      {tool.description}
                    </Box>
                  )}
                  {tool.inputSchema?.properties && (
                    <Box className="mt-2 pt-2 border-t border-sl-border-default">
                      <Box className="text-[10px] text-sl-text-disabled uppercase tracking-wider mb-1">Parameters</Box>
                      {Object.entries(tool.inputSchema.properties).map(([name, schema]: [string, any]) => (
                        <Box key={name} className="flex items-baseline gap-2 text-xs py-0.5">
                          <span className="text-sl-text-tertiary font-mono">{name}</span>
                          {schema.type && <span className="text-sl-text-faint">{schema.type}</span>}
                          {tool.inputSchema.required?.includes(name) && (
                            <span className="text-[10px]" style={{ color: 'var(--sl-brand-light)', opacity: 0.6 }}>required</span>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <Box className="text-xs text-sl-text-disabled py-4">
              No tools available. The server may still be initializing.
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
