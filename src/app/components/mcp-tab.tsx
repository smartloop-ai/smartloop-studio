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
        <Box className="text-[11px] text-gray-500 mb-1 uppercase tracking-wider">{displayName}</Box>
        {displayUrl && (
          <Box className="text-[11px] text-gray-600 mb-6">{displayUrl}</Box>
        )}
        {!displayUrl && <Box className="mb-6" />}

        {server.description && (
          <Box className="text-sm text-gray-400 mb-6 leading-relaxed">
            {server.description}
          </Box>
        )}

        {serverInfo?.version && (
          <Box className="text-xs text-gray-500 mb-6">Version {serverInfo.version}</Box>
        )}

        {/* Tools Section */}
        <Box className="mb-4">
          <Box className="text-[11px] text-gray-500 uppercase tracking-wider mb-4">
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
                    bgcolor: 'var(--sl-white-alpha-2)',
                    border: '1px solid var(--sl-white-alpha-5)',
                  }}
                >
                  <Box className="text-sm text-white font-medium mb-1" sx={{ fontFamily: 'monospace' }}>
                    {tool.name}
                  </Box>
                  {tool.description && (
                    <Box className="text-xs text-gray-400 leading-relaxed">
                      {tool.description}
                    </Box>
                  )}
                  {tool.inputSchema?.properties && (
                    <Box className="mt-2 pt-2 border-t border-gray-800">
                      <Box className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Parameters</Box>
                      {Object.entries(tool.inputSchema.properties).map(([name, schema]: [string, any]) => (
                        <Box key={name} className="flex items-baseline gap-2 text-xs py-0.5">
                          <span className="text-gray-300 font-mono">{name}</span>
                          {schema.type && <span className="text-gray-600">{schema.type}</span>}
                          {tool.inputSchema.required?.includes(name) && (
                            <span className="text-pink-400/60 text-[10px]">required</span>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <Box className="text-xs text-gray-500 py-4">
              No tools available. The server may still be initializing.
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
