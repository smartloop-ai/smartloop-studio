import { Box, CircularProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { normalizeMcpUrl } from '@/app/services/mcp-server.service';
import McpServerItem from '../mcp-server-item';
import McpCatalogItem from '../mcp-catalog-item';
import { McpSectionState } from './use-mcp-servers';

/**
 * Connections — curated catalog entries first, then servers added by hand, then
 * the drop target for a connection file.
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
      <div
        className="rounded-xl"
        onDragOver={(e) => { e.preventDefault(); if (!mcp.mcpDropActive) mcp.setMcpDropActive(true); }}
        onDragLeave={(e) => {
          // Only when the pointer actually leaves the card — dragging over
          // a child fires dragleave for the parent too.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) mcp.setMcpDropActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          mcp.setMcpDropActive(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) mcp.handleMcpFileDrop(file);
        }}
        style={{
          marginTop: '16px',
          padding: '16px',
          backgroundColor: mcp.mcpDropActive ? 'var(--sl-brand-alpha-10)' : 'var(--sl-bg-surface-1)',
          border: mcp.mcpDropActive ? '1px dashed var(--sl-brand-primary)' : '1px solid var(--sl-border-subtle)',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        <h4 className="text-[14px] font-bold text-sl-text-primary m-0 mb-1">Add your own</h4>
        <p className="text-[12px] leading-relaxed m-0 mb-3" style={{ color: 'var(--sl-text-muted)' }}>
          Drop a connection file to add any MCP server. It describes the
          server and, optionally, how to index its content.
        </p>
        {/* Drop zone. Visible at rest, not only mid-drag: a target that
            appears once you are already dragging is only findable by
            someone who guessed it was there. Clicking opens the file
            picker, so it works without a drag at all. */}
        <input
          ref={mcp.mcpTomlInputRef}
          type="file"
          accept=".toml"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) mcp.handleMcpFileDrop(file);
            e.target.value = '';
          }}
        />
        <div
          role="button"
          onClick={() => !mcp.isAddingMcp && mcp.mcpTomlInputRef.current?.click()}
          className="rounded-lg mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
          style={{
            padding: '10px',
            border: `1px dashed ${mcp.mcpDropActive ? 'var(--sl-brand-primary)' : 'var(--sl-border-default)'}`,
            backgroundColor: mcp.mcpDropActive ? 'var(--sl-brand-alpha-10)' : 'transparent',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
        >
          <UploadFileIcon sx={{ fontSize: 13, color: mcp.mcpDropActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)' }} />
          <span className="text-[10px]" style={{ color: mcp.mcpDropActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)' }}>
            {mcp.mcpDropActive ? 'Drop to add this connection' : 'Drop a .toml file or click to browse'}
          </span>
        </div>

        {/* Hint and error share one grid cell, so the slot is always as tall
            as the taller of the two and swapping them never shifts the UI. */}
        <Box className="grid text-[10px] mt-2.5 px-1">
          <div className={`col-start-1 row-start-1 text-sl-text-disabled leading-snug ${mcp.mcpError ? 'invisible' : ''}`}>
            A connection file names the server and how to reach it — a
            <code className="font-mono text-sl-text-muted"> url </code>
            for a remote one, or a
            <code className="font-mono text-sl-text-muted"> package </code>
            to run locally.
            <div className="mt-2.5 italic">Local servers require <code className="font-mono not-italic font-bold text-sl-text-muted">uv</code> to be installed on your machine.</div>
          </div>
          {mcp.mcpError && (
            <span className="col-start-1 row-start-1 text-red-400 whitespace-pre-line break-words">{mcp.mcpError}</span>
          )}
        </Box>
      </div>
    </div>
  );
}
