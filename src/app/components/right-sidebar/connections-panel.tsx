import { Box, CircularProgress } from '@mui/material';
import { normalizeMcpUrl } from '@/app/services/mcp-server.service';
import McpServerItem from '../mcp-server-item';
import McpCatalogItem from '../mcp-catalog-item';
import { McpSectionState } from './use-mcp-servers';

/**
 * Connections — curated catalog entries first, then servers added by hand, then
 * the box for adding one by URL.
 *
 * Pure view: every piece of state and every action comes from `useMcpServers`,
 * which the sidebar owns so that OAuth callbacks, tool-discovery polling and the
 * per-project cache keep working while this panel is closed.
 */
export default function ConnectionsPanel({ mcp, projectId }: { mcp: McpSectionState; projectId?: string }) {
  return (
    <div className="space-y-3">
      {/* Intro — what connections are, in the spirit of Claude Desktop */}
      <p className="m-0 px-1 text-[11px] leading-relaxed text-sl-text-muted">
        Connections let your assistant work with tools and data beyond this app. Connect one below to give it new capabilities through an MCP (Model Context Protocol) server.
      </p>

      {mcp.catalogLoading && mcp.mcpCatalog.length === 0 && (
        <Box className="flex items-center gap-2 py-3">
          <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />
          <span className="text-[11px] text-sl-text-disabled">Loading connections…</span>
        </Box>
      )}

      {/* Main list — curated connections first, then custom (hand-added)
          servers tagged "Custom" so they read differently from ours. */}
      {(mcp.mcpCatalog.length > 0 || mcp.customMcpServers.length > 0) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {mcp.mcpCatalog.map((entry) => {
            const connected = mcp.connectedByUrl.get(normalizeMcpUrl(entry.remote_config?.server_url));
            return (
              <McpCatalogItem
                key={entry.slug}
                entry={entry}
                connected={connected}
                connecting={mcp.connectingSlug === entry.slug}
                awaitingAuth={mcp.awaitingAuthSlug === entry.slug}
                error={
                  mcp.catalogItemError?.slug === entry.slug
                    ? mcp.catalogItemError.message
                    : (connected && mcp.mcpDeleteError?.id === connected.id ? mcp.mcpDeleteError.message : '')
                }
                onConnect={mcp.handleConnectCatalogEntry}
                onDisconnect={mcp.handleDeleteMcpServer}
                onCancelAuth={mcp.handleCancelCatalogAuth}
                onRefresh={mcp.handleRefreshMcpServer}
                tagColors={mcp.mcpTagColorMap}
              />
            );
          })}

          {/* Section header separating curated from hand-added servers */}
          {mcp.mcpCatalog.length > 0 && mcp.customMcpServers.length > 0 && (
            <h4 className="text-[11px] font-bold text-sl-text-muted uppercase tracking-widest m-0 mt-3 mb-1 px-1">
              Added by you
            </h4>
          )}

          {mcp.customMcpServers.map((server, index) => {
            const isSystem = !!(server as any).system;
            return (
              <McpServerItem
                key={server.id || `mcp-${index}`}
                server={server}
                projectId={projectId ?? ''}
                onDelete={mcp.handleDeleteMcpServer}
                onRefresh={mcp.handleRefreshMcpServer}
                discovering={mcp.discoveringServerId === server.id}
                isSystem={isSystem}
                isCustom={!isSystem}
                tagColors={mcp.mcpTagColorMap}
                deleteError={mcp.mcpDeleteError?.id === server.id ? mcp.mcpDeleteError.message : ''}
                onServerUpdate={mcp.updateServer}
              />
            );
          })}
        </Box>
      )}

      {mcp.catalogError && !mcp.catalogLoading && (
        <Box className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-sl-text-disabled">Couldn’t load connections.</span>
          <span
            role="button"
            onClick={mcp.loadMcpCatalog}
            className="text-[10px] cursor-pointer"
            style={{ color: 'var(--sl-brand-primary)' }}
          >
            Retry
          </span>
        </Box>
      )}

      {/* Add-your-own — always pinned to the bottom, styled like the
          Models panel's "Need more power?" card to set it apart. */}
      <div className="rounded-xl mt-4 p-4 bg-sl-bg-surface-1 border border-sl-border-subtle">
        <h4 className="text-[14px] font-bold text-sl-text-primary m-0 mb-1">Add your own</h4>
        <p className="text-[12px] leading-relaxed m-0 mb-3 text-sl-text-muted">
          Paste the address of an MCP server to connect it. We’ll ask the
          server what it can do once it’s added.
        </p>

        {/* One box and a button: a remote server is its URL, and the name the
            connection is filed under comes off that URL. Enter submits —
            reaching for the mouse to finish a one-field form is a nuisance.

            The field's fill is an overlay, not --sl-bg-input: that token is
            for a field on the base background, and six of the seven themes
            set it to the same colour as surface-1 — which is this card. An
            overlay is a step away from whatever is under it, so the field
            reads as a field on every theme: darker on the light ones,
            lighter on the dark. */}
        <div className="flex items-center gap-2">
          <input
            type="url"
            inputMode="url"
            spellCheck={false}
            placeholder="https://example.com/mcp"
            value={mcp.mcpUrlInput}
            onChange={(e) => mcp.setMcpUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') mcp.handleAddMcpUrl(); }}
            disabled={mcp.isAddingMcp}
            className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-[12px] font-mono bg-[var(--sl-white-alpha-7)] border border-sl-border-default text-sl-text-primary outline-none transition-colors placeholder:text-sl-text-faint focus:border-sl-brand-primary disabled:opacity-50"
          />
          <button
            type="button"
            onClick={mcp.handleAddMcpUrl}
            disabled={mcp.isAddingMcp || !mcp.mcpUrlInput.trim()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold text-[var(--sl-brand-contrast)] bg-sl-brand-primary transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mcp.isAddingMcp && <CircularProgress size={10} sx={{ color: 'inherit' }} />}
            {mcp.isAddingMcp ? 'Adding…' : 'Add'}
          </button>
        </div>

        {/* Hint and error share one grid cell, so the slot is always as tall
            as the taller of the two and swapping them never shifts the UI. */}
        <Box className="grid text-[10px] mt-2.5 px-1">
          <div className={`col-start-1 row-start-1 text-sl-text-disabled leading-snug ${mcp.mcpError ? 'invisible' : ''}`}>
            The URL is the server’s MCP endpoint — the one ending in
            <code className="font-mono text-sl-text-muted"> /mcp </code>
            or
            <code className="font-mono text-sl-text-muted"> /sse </code>.
            If it needs authorizing, a browser window will open.
            <div className="mt-2.5 italic">
              A server that runs on this machine instead of over HTTP is added by
              putting its <code className="font-mono not-italic font-bold text-sl-text-muted">.toml</code> in <code className="font-mono not-italic font-bold text-sl-text-muted">~/.smartloop/mcp.d/</code>.
            </div>
          </div>
          {mcp.mcpError && (
            <span className="col-start-1 row-start-1 text-red-400 whitespace-pre-line break-words">{mcp.mcpError}</span>
          )}
        </Box>
      </div>
    </div>
  );
}
