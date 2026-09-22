import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  mcpServerService,
  McpServer,
  McpCatalogEntry,
  normalizeMcpUrl,
  getMcpServerUrl,
  getMcpServerTools,
  buildTagColorMap,
  mcpNameFromUrl,
  buildMcpDefinition,
} from '@/app/services/mcp-server.service';

/**
 * Everything the Connections section knows, as one hook.
 *
 * A hook rather than state inside the panel, because none of this can be scoped
 * to "the panel is open": the OAuth callback lands whenever the browser hands it
 * back, a newly added server keeps polling for its tools, the per-project
 * snapshot has to survive switching away and back, and a project switch has to
 * refetch even with the section already open. Owned by the sidebar, so it lives
 * exactly as long as the sidebar does.
 *
 * `sectionOpen` gates only the indexing poll — the one loop that exists purely
 * to keep pills moving on screen, and so is pure waste when nobody is looking.
 */
export interface UseMcpServersArgs {
  projectId?: string;
  /** `mcp` off the enriched project payload — the only source of system servers. */
  projectMcp?: unknown;
  /** Whether the Connections section is currently showing. */
  sectionOpen: boolean;
}

/**
 * Cheap identity check for a revalidated MCP server list. A refetch that changed
 * nothing keeps the previous array reference, so the derived memos below don't
 * recompute and the list doesn't repaint on every project switch.
 */
/**
 * Everything a connection card renders, as one string. The list refresh keeps
 * the previous array when this is unchanged, so a field left out here is a
 * field whose updates never reach the screen — which is what froze the
 * indexing pill on "Queued" while the backend had long since said "indexed".
 */
const mcpServerSignature = (s: McpServer) => [
  s.id,
  getMcpServerTools(s).length,
  s.status ?? '',
  s.account ?? '',
  s.indexing?.state ?? '',
  // So the "2m ago" stamp moves when a re-crawl lands, not just when the
  // state changes.
  s.indexing?.crawled_at ?? '',
].join('|');

const sameMcpServers = (a: McpServer[], b: McpServer[]) =>
  a.length === b.length &&
  a.every((s, i) => mcpServerSignature(s) === mcpServerSignature(b[i]));

export function useMcpServers({ projectId, projectMcp, sectionOpen }: UseMcpServersArgs) {

  // MCP Servers state
  // Non-system servers, owned by GET /v1/projects/{id}/mcp. System servers get
  // their own slice below: that endpoint filters them out by design, so the two
  // sources have disjoint ownership and must never overwrite each other.
  const [apiMcpServers, setApiMcpServers] = useState<McpServer[]>([]);
  const [mcpError, setMcpError] = useState('');
  const [mcpPolling, setMcpPolling] = useState(false);
  const mcpServerCountRef = useRef(0);
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [discoveringServerId, setDiscoveringServerId] = useState<string | null>(null);
  // mcpToDelete can be used for deletion confirmation dialog if needed
  const [, setMcpToDelete] = useState<McpServer | null>(null);
  // Delete errors are scoped to the server row that failed (not the add form)
  const [mcpDeleteError, setMcpDeleteError] = useState<{ id: string; message: string } | null>(null);

  // Curated connection catalog (remote + OAuth only)
  const [mcpCatalog, setMcpCatalog] = useState<McpCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  // Registration request in flight for this catalog slug
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  // OAuth window opened for this slug — waiting on the callback
  const [awaitingAuthSlug, setAwaitingAuthSlug] = useState<string | null>(null);
  const [catalogItemError, setCatalogItemError] = useState<{ slug: string; message: string } | null>(null);

  // Last API-backed list per project. Switching back repaints from this in the
  // same tick, so the connected badges, disconnect button and tool counts are
  // there on the first frame instead of appearing a fetch later.
  const mcpServersByProjectRef = useRef<Map<string, McpServer[]>>(new Map());
  // Project id the current apiMcpServers came from, when API-backed.
  const mcpLoadedProjectRef = useRef<string | null>(null);
  // Read after awaits so a response for a project already switched away from is
  // discarded — rapid switching overlaps loads.
  const mcpProjectIdRef = useRef<string | undefined>(projectId);
  mcpProjectIdRef.current = projectId;

  // Snapshot the rendered list once it is API-backed. Declared before the switch
  // effect so on a switch it sees the *old* loaded-project id and bails, rather
  // than writing the outgoing project's servers under the incoming project's key.
  useEffect(() => {
    const pid = projectId;
    if (!pid || mcpLoadedProjectRef.current !== pid) return;
    mcpServersByProjectRef.current.set(pid, apiMcpServers);
  }, [apiMcpServers, projectId]);

  // Repaint on project switch straight from the snapshot. Deliberately does not
  // read currentProjectData: this runs before the parent's effect has swapped it,
  // so it would still hold the previous project's payload.
  useEffect(() => {
    const pid = projectId;
    const cached = pid ? mcpServersByProjectRef.current.get(pid) : undefined;
    mcpLoadedProjectRef.current = cached ? (pid ?? null) : null;
    setApiMcpServers(cached ?? []);
    // Transient form state belongs to the project you were just in.
    setIsAddingMcp(false);
    setMcpError('');
    setMcpUrlInput('');
  }, [projectId]);

  // System servers appear only in the projects-list payload, never from the /mcp
  // endpoint, so they are merged in at read time instead of into the state above.
  const systemMcpServers = useMemo<McpServer[]>(() => {
    if (!Array.isArray(projectMcp)) return [];
    return (projectMcp as McpServer[]).filter(
      (s) => !!(s as any).system && !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__',
    );
  }, [projectMcp]);

  const mcpServers = useMemo<McpServer[]>(() => {
    const ids = new Set(apiMcpServers.map((s) => s.id));
    return [...apiMcpServers, ...systemMcpServers.filter((s) => !ids.has(s.id))];
  }, [apiMcpServers, systemMcpServers]);

  // Listen for MCP authorization callback from Electron
  useEffect(() => {
    const electronWindow = window as any;
    if (electronWindow.electronAPI?.onMcpAuthCallback) {
      electronWindow.electronAPI.onMcpAuthCallback(async (data: { serverId?: string; error?: string }) => {
        console.log('[MCP Auth] Callback received:', data);
        if (data.error) {
          setMcpError(data.error);
          setAwaitingAuthSlug(null);
        } else if (data.serverId && projectId) {
          console.log('[MCP Auth] Server authorized, refreshing list...');
          loadMcpServers();
        }
      });

      return () => {
        electronWindow.electronAPI?.removeMcpAuthCallbackListener?.();
      };
    }
  }, [projectId]);

  const loadMcpServers = useCallback(async () => {
    if (!projectId) return;

    try {
      const result = await mcpServerService.getMcpServers(projectId);
      if (mcpProjectIdRef.current !== projectId) return;
      if (result.success && result.data) {
        const apiServers = (result.data as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__');
        mcpLoadedProjectRef.current = projectId;
        setApiMcpServers(prev => (sameMcpServers(prev, apiServers) ? prev : apiServers));
        if (mcpPolling && apiServers.length > mcpServerCountRef.current) {
          setMcpPolling(false);
          setMcpError('');
        }
      }
    } catch (error: any) {
      // silent during polling
      if (!mcpPolling) {
        setMcpError(error.message || 'An error occurred');
      }
    }
  }, [projectId, mcpPolling]);

  // Keep the callback in a ref so the project-switch effect below doesn't also
  // re-run whenever mcpPolling flips (loadMcpServers closes over it).
  const loadMcpServersRef = useRef(loadMcpServers);
  loadMcpServersRef.current = loadMcpServers;

  // Nothing else refetches on project switch — toggleSection only fires when
  // the panel is opened, so switching with Connections already open would leave
  // the stale project payload as the last word.
  useEffect(() => {
    if (!projectId) return;
    loadMcpServersRef.current();
  }, [projectId]);

  const loadMcpCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    const result = await mcpServerService.getMcpCatalog();
    if (result.success) {
      setMcpCatalog(result.entries);
    } else {
      setCatalogError(result.error || 'Failed to load connections');
    }
    setCatalogLoading(false);
  }, []);

  // Poll for new MCP servers while waiting (OAuth flow)
  useEffect(() => {
    if (!mcpPolling || !projectId) return;

    let attempts = 0;
    const maxAttempts = 20; // ~60s

    const interval = setInterval(() => {
      attempts++;
      loadMcpServers();
      if (attempts >= maxAttempts) {
        setMcpPolling(false);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [mcpPolling, projectId, loadMcpServers]);

  // Poll for tool discovery after adding a server
  useEffect(() => {
    if (!discoveringServerId || !projectId) return;

    let attempts = 0;
    const maxAttempts = 20; // ~30s

    const interval = setInterval(async () => {
      attempts++;
      try {
        const result = await mcpServerService.getMcpServers(projectId);
        if (result.success && result.data) {
          const apiServers = (result.data as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__');
          setApiMcpServers(prev => (sameMcpServers(prev, apiServers) ? prev : apiServers));
          const target = apiServers.find(s => s.id === discoveringServerId);
          const tools = target?.tools ?? target?.metadata?.tools ?? [];
          if (tools.length > 0 || attempts >= maxAttempts) {
            setDiscoveringServerId(null);
            clearInterval(interval);
          }
        }
      } catch {
        // keep polling
      }
      if (attempts >= maxAttempts) {
        setDiscoveringServerId(null);
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [discoveringServerId, projectId]);

  // Keep the indexing pills live. Provisioning and the content crawl run in the
  // backend's own time, so the state only moves if we ask again — but only
  // while the connections panel is open, since nothing off-screen is worth a
  // request every few seconds. Capped so a connection that stays queued (its
  // crawl deferred while the model is busy) can't poll for the whole session.
  const mcpIndexingInProgress = useMemo(
    () => mcpServers.some((s) => s.indexing?.in_progress),
    [mcpServers],
  );

  useEffect(() => {
    if (!sectionOpen || !mcpIndexingInProgress || !projectId) return;

    let attempts = 0;
    const maxAttempts = 75; // ~5 min at 4s

    const interval = setInterval(() => {
      attempts++;
      loadMcpServers();
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 4000);

    return () => clearInterval(interval);
  }, [sectionOpen, mcpIndexingInProgress, projectId, loadMcpServers]);

  // Installed servers keyed by normalized remote URL — how a catalog entry knows
  // whether it's already connected.
  const connectedByUrl = useMemo(() => {
    const map = new Map<string, McpServer>();
    mcpServers.forEach((s) => {
      const url = normalizeMcpUrl(getMcpServerUrl(s));
      if (url) map.set(url, s);
    });
    return map;
  }, [mcpServers]);


  // One color per tag across *both* lists, so a tag shared by a curated entry
  // and a hand-added server looks the same on each.
  const mcpTagColorMap = useMemo(
    () => buildTagColorMap([
      ...mcpCatalog.flatMap((e) => e.tags || []),
      ...mcpServers.flatMap((s) => s.tags || []),
    ]),
    [mcpCatalog, mcpServers],
  );


  // Servers added by hand (not in the catalog) keep the original list rendering.
  const customMcpServers = useMemo(() => {
    const catalogUrls = new Set(mcpCatalog.map((e) => normalizeMcpUrl(e.remote_config?.server_url)));
    return mcpServers.filter((s) => {
      const url = normalizeMcpUrl(getMcpServerUrl(s));
      return !url || !catalogUrls.has(url);
    });
  }, [mcpServers, mcpCatalog]);

  // Main primes the catalog at startup, so loading on mount is a cache hit and
  // the Connections list is already populated when the section first opens.
  // Background refreshes (TTL expiry, login, logout) arrive on the push channel.
  useEffect(() => {
    loadMcpCatalog();
    const electronWindow = window as any;
    const unsubscribe = electronWindow.electronAPI?.onMcpCatalogUpdated?.(
      ({ entries }: { entries: McpCatalogEntry[] }) => {
        if (Array.isArray(entries)) setMcpCatalog(entries);
      },
    );
    return () => unsubscribe?.();
  }, [loadMcpCatalog]);

  // Drop the "authorizing" state once the server lands, or when polling gives up.
  // A server that arrives without tools yet gets picked up by discovery polling.
  useEffect(() => {
    if (!awaitingAuthSlug) return;
    const entry = mcpCatalog.find((e) => e.slug === awaitingAuthSlug);
    const server = connectedByUrl.get(normalizeMcpUrl(entry?.remote_config?.server_url));
    if (server) {
      setAwaitingAuthSlug(null);
      if (getMcpServerTools(server).length === 0) setDiscoveringServerId(server.id);
    } else if (!mcpPolling) {
      setAwaitingAuthSlug(null);
    }
  }, [awaitingAuthSlug, mcpCatalog, connectedByUrl, mcpPolling]);



  // Persist a registered MCP server to SQLite (best-effort — registration with
  // the service is the source of truth, this keeps a local record).
  const persistMcpServerToDb = async (server: {
    id: string;
    project_id: string;
    name: string;
    server_type: 'local' | 'remote';
    config: Record<string, any>;
  }) => {
    try {
      await (window as any).electronAPI?.db?.addMcpServer(server);
    } catch (e) {
      console.error('[MCP] Failed to persist server to SQLite:', e);
    }
  };

  // Adding a connection by URL.
  //
  // A remote server is entirely described by where it is, so that is all the
  // card asks for. The name comes off the URL — and barely matters, since the
  // card shows whatever title the server reports about itself once discovery
  // runs. The two together become the connection file the user would
  // otherwise have had to write, installed through the same definition
  // endpoint a file on disk goes through: one install path, and a connection
  // that looks identical either way.
  const [mcpUrlInput, setMcpUrlInput] = useState('');

  const handleAddMcpUrl = async () => {
    if (!projectId || isAddingMcp) return;

    const url = mcpUrlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setMcpError('Enter the full URL, starting with http:// or https://');
      return;
    }
    const name = mcpNameFromUrl(url);
    if (!name) {
      setMcpError('That doesn’t look like a server URL.');
      return;
    }
    if (connectedByUrl.has(normalizeMcpUrl(url))) {
      setMcpError('That server is already connected.');
      return;
    }

    setIsAddingMcp(true);
    setMcpError('');
    try {
      const result = await mcpServerService.registerMcpFromDefinition(
        projectId, buildMcpDefinition(name, url), `${name}.toml`,
      );
      if (!result.success || !result.data) {
        // Already condensed to one line by the service, which logged the full
        // backend error to the console.
        setMcpError(result.error || "Couldn't add that server.");
        return;
      }

      const data = result.data as Record<string, any>;
      if (data.auth_type === 'oauth' && data.auth_url) {
        // The server wants authorizing before it will say what it can do —
        // same browser round trip a catalog entry takes.
        mcpServerCountRef.current = apiMcpServers.length;
        setMcpPolling(true);
        const electronWindow = window as any;
        electronWindow.electronAPI?.openExternal?.(data.auth_url);
      } else {
        await loadMcpServers();
        const serverId = data.id || data.server_id;
        if (serverId) setDiscoveringServerId(serverId);
      }

      setMcpUrlInput('');
    } catch (error: any) {
      console.error('[MCP] Failed to add connection:', error);
      setMcpError('Couldn’t add that server.');
    } finally {
      setIsAddingMcp(false);
    }
  };


  // Connect a curated catalog entry — same remote registration path as the URL
  // box, using the entry's own server_url.
  const handleConnectCatalogEntry = async (entry: McpCatalogEntry) => {
    const serverUrl = entry.remote_config?.server_url;
    if (!projectId || !serverUrl) return;

    cancelledAuthRef.current.delete(entry.slug);
    setCatalogItemError(null);
    setConnectingSlug(entry.slug);

    try {
      const result = await mcpServerService.registerMcpServer(projectId, {
        server_type: 'remote',
        // The slug is what makes this a curated install: the backend resolves
        // the catalog entry and stores its description and tags, so the record
        // keeps our copy instead of the vendor's and skips LLM enrichment.
        catalog_slug: entry.slug,
        server_url: serverUrl,
        name: entry.display_name,
        return_url: 'smartloop://mcp-authorization',
      });

      if (!result.success || !result.data) {
        setCatalogItemError({ slug: entry.slug, message: result.error || 'Failed to connect' });
        return;
      }

      const data = result.data as Record<string, any>;

      if (data.auth_type === 'oauth' && data.auth_url) {
        // Cancelled while the registration request was still in flight: don't
        // re-arm the wait, and above all don't open a browser the user has
        // just said they don't want.
        if (cancelledAuthRef.current.has(entry.slug)) return;

        mcpServerCountRef.current = apiMcpServers.length;
        setMcpPolling(true);
        setAwaitingAuthSlug(entry.slug);

        const electronWindow = window as any;
        if (electronWindow.electronAPI?.openExternal) {
          electronWindow.electronAPI.openExternal(data.auth_url);
        } else {
          window.open(data.auth_url, '_blank');
        }
      } else {
        const serverId = data.id || data.server_id;
        if (serverId) {
          await persistMcpServerToDb({
            id: serverId,
            project_id: projectId,
            name: data.name || entry.display_name,
            server_type: 'remote',
            config: { server_url: serverUrl },
          });
        }
        await loadMcpServers();
        if (serverId) setDiscoveringServerId(serverId);
      }
    } catch (error: any) {
      console.error('[MCP] Error connecting catalog entry:', error);
      setCatalogItemError({ slug: entry.slug, message: error.message || 'An error occurred' });
    } finally {
      setConnectingSlug(null);
    }
  };

  const handleDeleteMcpServer = async (server: McpServer) => {
    if (!projectId || !server.id) return;

    setMcpDeleteError(null);
    try {
      const result = await mcpServerService.deleteMcpServer(projectId, server.id);
      if (result.success) {
        setApiMcpServers(prev => prev.filter(s => s.id !== server.id));
        setMcpToDelete(null);
        // Remove from local storage + SQLite
        await mcpServerService.removeMcpServerFromStorage(projectId, server.id);
        try {
          await (window as any).electronAPI?.db?.deleteMcpServer(server.id);
        } catch (e) {
          console.error('[MCP] Failed to remove server from SQLite:', e);
        }
      } else {
        setMcpDeleteError({ id: server.id, message: result.error || 'Failed to delete MCP server' });
      }
    } catch (error: any) {
      setMcpDeleteError({ id: server.id, message: error.message || 'An error occurred' });
    }
  };


  // Slugs whose authorization the user backed out of. A ref, not state: the
  // in-flight connect closure has to read the current value, not the one it
  // captured before the request went out.
  const cancelledAuthRef = useRef<Set<string>>(new Set());

  const handleCancelCatalogAuth = (entry: McpCatalogEntry) => {
    cancelledAuthRef.current.add(entry.slug);
    // Client-side only, and deliberately so: the backend writes no server
    // record until the OAuth callback comes back, so there is nothing to undo.
    // If the user does finish in the browser afterwards, the callback listener
    // still picks the connection up — this cancels the waiting, not the grant.
    if (awaitingAuthSlug === entry.slug) setAwaitingAuthSlug(null);
    if (connectingSlug === entry.slug) setConnectingSlug(null);
    setMcpPolling(false);
    setCatalogItemError(null);
  };

  const handleRefreshMcpServer = async (server: McpServer) => {
    if (!projectId || !server.id) return;

    setMcpDeleteError(null);
    // Show the pass as running straight away: the request only queues the work,
    // and without this the card looks inert until the next poll lands.
    setApiMcpServers(prev => prev.map(s => (
      s.id === server.id
        ? { ...s, indexing: { ...(s.indexing ?? { crawl_enabled: true }), state: 'provisioning', in_progress: true } as McpServer['indexing'] }
        : s
    )));

    const result = await mcpServerService.refreshMcpServer(projectId, server.id);
    if (!result.success) {
      setMcpDeleteError({ id: server.id, message: result.error || 'Failed to re-index connection' });
      // Put the card back the way it was — the pass never started.
      loadMcpServers();
      return;
    }
    // The in-progress state drives the poll effect, which carries the card the
    // rest of the way to "Indexed".
    loadMcpServers();
  };
  /**
   * A card edited a server in place (renaming it, changing its index plan). The
   * list is the hook's, so the write goes through here rather than the panel
   * reaching for the setter.
   */
  const updateServer = useCallback((updated: McpServer) => {
    setApiMcpServers((prev) => {
      const next = prev.map((s) => (s.id === updated.id ? updated : s));
      if (projectId) mcpServerService.saveMcpServersToStorage(projectId, next);
      return next;
    });
  }, [projectId]);

  /** Clear the add-form error — the shell does this when the section opens. */
  const clearError = useCallback(() => setMcpError(''), []);

  return {
    // Lists
    mcpServers,
    customMcpServers,
    mcpCatalog,
    connectedByUrl,
    mcpTagColorMap,
    // In-flight / transient UI state
    isAddingMcp,
    discoveringServerId,
    connectingSlug,
    awaitingAuthSlug,
    catalogLoading,
    // Add-by-URL form
    mcpUrlInput,
    setMcpUrlInput,
    // Errors
    mcpError,
    mcpDeleteError,
    catalogError,
    catalogItemError,
    // Actions
    handleAddMcpUrl,
    handleConnectCatalogEntry,
    handleDeleteMcpServer,
    handleCancelCatalogAuth,
    handleRefreshMcpServer,
    loadMcpCatalog,
    updateServer,
    clearError,
    /** Refetch the list — the shell calls this when the section is opened. */
    refresh: loadMcpServers,
  };
}

export type McpSectionState = ReturnType<typeof useMcpServers>;
