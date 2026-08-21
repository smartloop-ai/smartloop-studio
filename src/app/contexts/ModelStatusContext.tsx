import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useProjectContext } from './ProjectContext';
import type { ModelDownloadProgress } from '@/electron';

// Central model state for the renderer. The main process owns model status (see
// `modelDownloadState` in electron/main.js); this is the *single* subscriber to
// its broadcasts.
//
// It exists because the Models panel is rendered conditionally in the right
// sidebar, so switching rail sections destroys it. When download state and the
// IPC subscriptions lived in that component, a mid-download navigation lost the
// progress, showed "not downloaded", and let a re-click start a duplicate
// download. Living above every unmount boundary, this provider is also why
// preload's listeners now hand back a targeted unsubscribe — a channel-wide
// removeAllListeners from an unmounting panel used to drop chat's subscription
// too.
//
// Model *enablement* is per-project; a model's weights are workspace-level. So
// the list is keyed by project while a download is tracked by model name and
// merely tagged with the project it was started for.

export interface ModelStatusValue {
  // --- Auxiliary model list ---
  localModels: any[];
  localModelsLoading: boolean;
  enabledModels: Set<string>;
  isEnabled: (name: string) => boolean;
  // Capabilities contributed by currently-enabled models. Derived from
  // `enabledModels`, so a pending toggle is reflected optimistically — an
  // enabling model still reports enabled=false from the backend.
  enabledCapabilities: Set<string>;
  fetchLocalModels: () => Promise<void>;

  // --- Auxiliary download in flight (at most one) ---
  toggling: string | null;
  downloadProgress: { percent: number; status: string } | null;
  handleToggleModel: (name: string, workspaceName: string, enabled: boolean) => Promise<void>;
  handleCancelDownload: () => Promise<void>;

  // --- Primary orchestrator model load ---
  primaryProgress: ModelDownloadProgress | null;
  loadPrimaryModel: (modelName: string) => Promise<void>;
  // Resolves once no primary load is in flight, so a send can wait it out.
  waitForPrimaryModel: () => Promise<void>;
}

// Cap on how long a send will wait for an in-flight primary load.
const PRIMARY_WAIT_TIMEOUT_MS = 60_000;

const ModelStatusContext = createContext<ModelStatusValue | null>(null);

export function useModelStatus(): ModelStatusValue {
  const ctx = useContext(ModelStatusContext);
  if (!ctx) throw new Error('useModelStatus must be used within a ModelStatusProvider');
  return ctx;
}

export function ModelStatusProvider({ children }: { children: ReactNode }) {
  const { selectedProject } = useProjectContext();
  const projectId = selectedProject?.id ?? null;

  const [localModels, setLocalModels] = useState<any[]>([]);
  const [localModelsLoading, setLocalModelsLoading] = useState(false);
  const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(new Map());
  const [toggling, setToggling] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; status: string } | null>(null);
  const [primaryProgress, setPrimaryProgress] = useState<ModelDownloadProgress | null>(null);
  const togglingRef = useRef<string | null>(null);

  const enabledModels = useMemo(() => new Set(localModels.filter((m: any) => {
    const name = m.name || m.id || m.model;
    return enabledOverrides.has(name) ? enabledOverrides.get(name) : m.enabled;
  }).map((m: any) => m.name || m.id || m.model)), [localModels, enabledOverrides]);

  const isEnabled = useCallback((name: string) => enabledModels.has(name), [enabledModels]);

  const enabledCapabilities = useMemo(() => {
    const caps = new Set<string>();
    localModels.forEach((m: any) => {
      const name = m.name || m.id || m.model;
      if (enabledModels.has(name)) (m.capabilities || []).forEach((c: string) => caps.add(c));
    });
    return caps;
  }, [localModels, enabledModels]);

  const fetchLocalModels = useCallback(async () => {
    setLocalModelsLoading(true);
    try {
      const api = window.electronAPI;
      if (api?.slpListModels) {
        const result = await api.slpListModels(projectId);
        if (result?.success && result.models) {
          setLocalModels(result.models);
        }
      }
    } catch (err) {
      console.warn('[ModelStatus] Failed to fetch local models:', err);
    } finally {
      setLocalModelsLoading(false);
    }
  }, [projectId]);

  // Read through refs inside the IPC subscription so it can mount once and stay
  // mounted, instead of resubscribing on every project change.
  const fetchRef = useRef(fetchLocalModels);
  fetchRef.current = fetchLocalModels;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const clearAuxDownload = useCallback((name: string) => {
    togglingRef.current = null;
    setToggling(null);
    setDownloadProgress(null);
    setEnabledOverrides(prev => { const next = new Map(prev); next.delete(name); return next; });
  }, []);

  // --- Primary model load coordination ---
  const primaryInFlightRef = useRef(false);
  const primaryWaitersRef = useRef<Array<() => void>>([]);

  const settlePrimary = useCallback(() => {
    primaryInFlightRef.current = false;
    setPrimaryProgress(null);
    const waiters = primaryWaitersRef.current;
    primaryWaitersRef.current = [];
    waiters.forEach(resolve => resolve());
  }, []);

  const waitForPrimaryModel = useCallback(() => {
    if (!primaryInFlightRef.current) return Promise.resolve();
    return new Promise<void>(resolve => {
      primaryWaitersRef.current.push(resolve);
      // Backstop: a load adopted from main's snapshot has no local await to
      // settle it, so a lost terminal event must not block a send forever.
      setTimeout(resolve, PRIMARY_WAIT_TIMEOUT_MS);
    });
  }, []);

  const loadPrimaryModel = useCallback(async (modelName: string) => {
    const api = window.electronAPI;
    if (!api?.slpLoadModel || !modelName) return;

    primaryInFlightRef.current = true;
    // Show something immediately — the first SSE event can take a while, and main
    // may still be retrying a cold service.
    setPrimaryProgress({ model: modelName, percent: 0, status: 'Initializing model...', downloading: true });
    // Main rejects a load it is already streaming. That existing stream still
    // owns the progress, so don't settle on its behalf — only the load that
    // actually ran here settles when its request returns.
    let adoptedByExisting = false;
    try {
      const res = await api.slpLoadModel(modelName, projectId);
      adoptedByExisting = !!res?.downloading;
    } catch (err) {
      console.warn('[ModelStatus] Primary model load failed:', err);
    } finally {
      // The terminal progress event normally settles this; do it here too so a
      // stream that dies without one can never leave a send waiting forever.
      if (!adoptedByExisting) settlePrimary();
    }
  }, [projectId, settlePrimary]);

  const isTerminal = (data: ModelDownloadProgress) =>
    data.downloading === false || (data.percent ?? 0) >= 100;

  // Shared by both primary-progress producers: `slp-load-model`/`slp-init-model`
  // on the model channel, and the first-launch bootstrap download on its own.
  const handlePrimaryProgress = useCallback((data: ModelDownloadProgress) => {
    if (isTerminal(data)) {
      settlePrimary();
      // A load can also have downloaded weights, so refresh the list.
      fetchRef.current();
    } else {
      // Mark in-flight from the event itself, not just from loadPrimaryModel —
      // the load may have been started by bootstrap, or before this mounted.
      primaryInFlightRef.current = true;
      setPrimaryProgress(data);
    }
  }, [settlePrimary]);

  // The app's only `model-download-progress` subscription. Mounted once.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onModelDownloadProgress) return;

    const unsubscribe = api.onModelDownloadProgress((data: ModelDownloadProgress) => {
      const done = isTerminal(data);

      if (data.kind === 'primary') {
        handlePrimaryProgress(data);
        return;
      }

      // Auxiliary download. Only the one this view adopted is ours to report.
      const active = togglingRef.current;
      if (!active || data.model !== active) return;
      if (done) {
        // Terminal event finalizes the toggle. The original handleToggleModel
        // await cannot be relied on — it may belong to a render that is gone.
        clearAuxDownload(active);
        fetchRef.current();
      } else {
        setDownloadProgress({ percent: data.percent, status: data.status });
      }
    });

    return unsubscribe;
  }, [clearAuxDownload, handlePrimaryProgress]);

  // First-launch bootstrap downloads the default model on its own channel. It is
  // a primary model load, so it drives the same state — without this, chat's
  // progress panel and the sidebar's load gating stay dark through first launch.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onBootstrapProgress) return;
    return api.onBootstrapProgress(handlePrimaryProgress);
  }, [handlePrimaryProgress]);

  // Adopt whatever main already has in flight: on mount, and again on project
  // change (enablement is per-project, so an aux download started elsewhere must
  // not drive this view's toggle).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.slpGetDownloadState) return;
    let cancelled = false;
    (async () => {
      const result = await api.slpGetDownloadState();
      if (cancelled || !result?.success) return;
      const all = Object.values(result.downloads || {});

      const primary = all.find(s => s.kind === 'primary');
      if (primary) {
        primaryInFlightRef.current = true;
        setPrimaryProgress(primary);
      }

      const aux = all.find(s => s.kind !== 'primary' && (s.projectId ?? null) === projectId);
      if (aux) {
        togglingRef.current = aux.model;
        setToggling(aux.model);
        setDownloadProgress({ percent: aux.percent, status: aux.status });
        setEnabledOverrides(prev => new Map(prev).set(aux.model, true));
      } else {
        // Nothing in flight for this project — drop a download adopted for the
        // project we just switched away from so its spinner doesn't linger.
        const stale = togglingRef.current;
        if (stale) clearAuxDownload(stale);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, clearAuxDownload]);

  const handleCancelDownload = useCallback(async () => {
    const api = window.electronAPI;
    const modelName = togglingRef.current;
    if (!modelName || !api?.slpCancelModelDownload) return;
    await api.slpCancelModelDownload(modelName, projectId);
    clearAuxDownload(modelName);
    await fetchLocalModels();
  }, [fetchLocalModels, projectId, clearAuxDownload]);

  const handleToggleModel = useCallback(async (name: string, workspaceName: string, enabled: boolean) => {
    const api = window.electronAPI;
    if (!api?.slpSetModelEnabled || togglingRef.current) return;

    togglingRef.current = name;
    setToggling(name);
    setDownloadProgress(null);
    // The override is the optimistic state; `enabledCapabilities` derives from it,
    // so dependent UI (documents/skills gating, vision attachments) updates now
    // rather than waiting for the backend to confirm and re-emit the list.
    setEnabledOverrides(prev => new Map(prev).set(name, enabled));

    // Main answers a model it is already downloading with `downloading: true`
    // instead of starting a second stream. In that case keep the optimistic
    // state and let the terminal progress event finalize it; otherwise this
    // resolves only after the download (if any) has completed.
    let stillDownloading = false;
    try {
      const res = await api.slpSetModelEnabled(workspaceName, enabled, projectId);
      stillDownloading = !!(res as { downloading?: boolean })?.downloading;
      if (!stillDownloading) await fetchLocalModels();
    } finally {
      if (!stillDownloading) clearAuxDownload(name);
    }
  }, [fetchLocalModels, projectId, clearAuxDownload]);

  // Initial load + refetch on project switch (per-project model settings).
  useEffect(() => { fetchLocalModels(); }, [fetchLocalModels]);

  // The app's only `models-updated` subscription.
  useEffect(() => {
    const handleAuthChange = () => fetchLocalModels();
    window.addEventListener('authStateChanged', handleAuthChange);

    const api = window.electronAPI;
    const unsubscribe = api?.onModelsUpdated?.(({ models, projectId: payloadProjectId }) => {
      // Ignore refreshes for other projects — they would clobber this view.
      if ((payloadProjectId ?? null) !== projectIdRef.current) return;
      if (Array.isArray(models)) setLocalModels(models);
    });

    return () => {
      window.removeEventListener('authStateChanged', handleAuthChange);
      unsubscribe?.();
    };
  }, [fetchLocalModels]);

  const value = useMemo<ModelStatusValue>(() => ({
    localModels,
    localModelsLoading,
    enabledModels,
    isEnabled,
    enabledCapabilities,
    fetchLocalModels,
    toggling,
    downloadProgress,
    handleToggleModel,
    handleCancelDownload,
    primaryProgress,
    loadPrimaryModel,
    waitForPrimaryModel,
  }), [
    localModels, localModelsLoading, enabledModels, isEnabled, enabledCapabilities,
    fetchLocalModels, toggling, downloadProgress, handleToggleModel, handleCancelDownload,
    primaryProgress, loadPrimaryModel, waitForPrimaryModel,
  ]);

  return <ModelStatusContext.Provider value={value}>{children}</ModelStatusContext.Provider>;
}
