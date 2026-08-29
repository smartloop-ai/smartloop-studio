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

  // --- Auxiliary downloads in flight, keyed by model name ---
  // Weights are workspace-wide, so these are NOT project-scoped: a download
  // started from one project is shown as downloading in all of them. Mirrors
  // main's `activeModelDownloads` map, which can hold more than one.
  downloads: Map<string, { percent: number; status: string }>;
  isDownloading: (name: string) => boolean;
  // Why a download stopped, keyed by model name. `requiresAuth` is the 400/403
  // SLP returns for weights the account isn't entitled to — the anonymous case —
  // which the picker shows as a sign-in prompt rather than a failure.
  downloadErrors: Map<string, { message: string; requiresAuth: boolean }>;
  clearDownloadError: (name: string) => void;
  clearDownloadErrors: () => void;
  handleToggleModel: (name: string, workspaceName: string, enabled: boolean) => Promise<void>;
  handleCancelDownload: (modelName: string) => Promise<void>;

  // --- Primary orchestrator model load ---
  primaryProgress: ModelDownloadProgress | null;
  loadPrimaryModel: (modelName: string) => Promise<void>;
  // Resolves once no primary load is in flight, so a send can wait it out.
  waitForPrimaryModel: () => Promise<void>;
}

// Cap on how long a send will wait for an in-flight primary load.
const PRIMARY_WAIT_TIMEOUT_MS = 60_000;

// A failure reported as a bare status code, for the statuses that mean "this
// account isn't entitled to these weights" — 400 is what SLP answers an
// anonymous request for a gated model.
const AUTH_STATUS_MESSAGE = /\bHTTP\s*(400|401|403)\b/i;

// How long a primary load must run before its progress surfaces. Below this the
// load is imperceptible — an already-resident model answers in ~50ms — so
// showing a panel for it only flashes on the way to the empty state.
const PRIMARY_REVEAL_DELAY_MS = 600;

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
  const [downloads, setDownloads] = useState<Map<string, { percent: number; status: string }>>(new Map());
  const [downloadErrors, setDownloadErrors] = useState<Map<string, { message: string; requiresAuth: boolean }>>(new Map());
  const [primaryProgress, setPrimaryProgress] = useState<ModelDownloadProgress | null>(null);
  // Mirror of `downloads` for event handlers, which must not close over state.
  const downloadsRef = useRef(downloads);
  downloadsRef.current = downloads;
  // Models whose transition a live handleToggleModel owns. The terminal progress
  // event fires when the bytes land, before the enable PATCH, so it must not
  // tear down their UI — that is what flashes the Download button back.
  const pendingTogglesRef = useRef<Set<string>>(new Set());

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

  const setDownload = useCallback((name: string, progress: { percent: number; status: string }) => {
    setDownloads(prev => new Map(prev).set(name, progress));
  }, []);

  const clearAuxDownload = useCallback((name: string) => {
    setDownloads(prev => { const next = new Map(prev); next.delete(name); return next; });
    setEnabledOverrides(prev => { const next = new Map(prev); next.delete(name); return next; });
  }, []);

  const isDownloading = useCallback((name: string) => downloads.has(name), [downloads]);

  const setDownloadError = useCallback((name: string, message: string, requiresAuth: boolean) => {
    // Second read of the same fact: main flags the entitlement statuses, but any
    // path that still reports a bare `HTTP 400/401/403` means the same thing, and
    // showing a status code to a user who just needs to sign in helps nobody.
    const auth = requiresAuth || AUTH_STATUS_MESSAGE.test(message);
    setDownloadErrors(prev => new Map(prev).set(name, { message, requiresAuth: auth }));
  }, []);

  // Dismiss every recorded refusal at once — closing the picker, or an auth
  // change that makes all of them stale.
  const clearDownloadErrors = useCallback(() => {
    setDownloadErrors(prev => (prev.size ? new Map() : prev));
  }, []);

  const clearDownloadError = useCallback((name: string) => {
    setDownloadErrors(prev => {
      if (!prev.has(name)) return prev;
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  // --- Primary model load coordination ---
  const primaryInFlightRef = useRef(false);
  const primaryWaitersRef = useRef<Array<() => void>>([]);
  const primaryRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPrimaryReveal = useCallback(() => {
    if (primaryRevealTimerRef.current === null) return;
    clearTimeout(primaryRevealTimerRef.current);
    primaryRevealTimerRef.current = null;
  }, []);

  const settlePrimary = useCallback(() => {
    primaryInFlightRef.current = false;
    // A load that finished inside the reveal window never shows anything.
    cancelPrimaryReveal();
    setPrimaryProgress(null);
    const waiters = primaryWaitersRef.current;
    primaryWaitersRef.current = [];
    waiters.forEach(resolve => resolve());
  }, [cancelPrimaryReveal]);

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

    // Set synchronously: waitForPrimaryModel gates sends off this ref, so it must
    // be true even while nothing is on screen yet.
    primaryInFlightRef.current = true;
    // Reveal a placeholder only if the load outlasts the threshold. `prev ??`
    // keeps a real SSE event that already landed from being clobbered by it.
    cancelPrimaryReveal();
    primaryRevealTimerRef.current = setTimeout(() => {
      primaryRevealTimerRef.current = null;
      if (!primaryInFlightRef.current) return;
      setPrimaryProgress(prev => prev ?? { model: modelName, percent: 0, status: 'Initializing model...', downloading: true });
    }, PRIMARY_REVEAL_DELAY_MS);
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
  }, [projectId, settlePrimary, cancelPrimaryReveal]);

  const isTerminal = (data: ModelDownloadProgress) =>
    data.downloading === false || (data.percent ?? 0) >= 100;

  // Shared by both primary-progress producers: `slp-load-model`/`slp-init-model`
  // on the model channel, and the first-launch bootstrap download on its own.
  const handlePrimaryProgress = useCallback((data: ModelDownloadProgress) => {
    if (data.error) setDownloadError(data.model, data.error, !!data.requiresAuth);
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
  }, [settlePrimary, setDownloadError]);

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

      // Auxiliary download. Tracked for every model regardless of which project
      // started it — the weights are workspace-wide.
      if (data.error) {
        // A failure is terminal, but unlike a completion it leaves something to
        // say. Recorded here so a download started elsewhere (or before this
        // mounted) still explains itself; the caller's own result records it too.
        setDownloadError(data.model, data.error, !!data.requiresAuth);
      }
      if (done) {
        // A live handleToggleModel owns the rest of this transition: it
        // refetches and only then clears, so the card flips once. Clearing here
        // would drop the ring before the enable PATCH has even been sent.
        if (pendingTogglesRef.current.has(data.model)) return;
        // No local owner — a remount mid-download, or a download another view
        // started. Fetch truth first, then clear, so the card never renders a
        // stale not-downloaded state with the ring already gone.
        void (async () => {
          await fetchRef.current();
          clearAuxDownload(data.model);
        })();
      } else {
        setDownload(data.model, { percent: data.percent, status: data.status });
      }
    });

    return unsubscribe;
  }, [clearAuxDownload, handlePrimaryProgress, setDownload, setDownloadError]);

  // First-launch bootstrap downloads the default model on its own channel. It is
  // a primary model load, so it drives the same state — without this, chat's
  // progress panel and the sidebar's load gating stay dark through first launch.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onBootstrapProgress) return;
    return api.onBootstrapProgress(handlePrimaryProgress);
  }, [handlePrimaryProgress]);

  // Resync with whatever main has in flight: on mount, and again on project
  // change. Main is authoritative, so re-reading the snapshot on a switch is
  // self-healing rather than project-scoping — downloads apply to every project.
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

      // Adopt every in-flight download. No project filter: a download has no
      // owning project, so whichever project is open shows all of them. The
      // enabled flag is NOT inferred here — main PATCHes it when the user asks,
      // so it arrives with the per-project model list instead.
      setDownloads(new Map(all
        .filter(s => s.kind !== 'primary')
        .map(s => [s.model, { percent: s.percent, status: s.status }])));
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const handleCancelDownload = useCallback(async (modelName: string) => {
    const api = window.electronAPI;
    if (!modelName || !api?.slpCancelModelDownload) return;
    await api.slpCancelModelDownload(modelName, projectId);
    clearAuxDownload(modelName);
    await fetchLocalModels();
  }, [fetchLocalModels, projectId, clearAuxDownload]);

  const handleToggleModel = useCallback(async (name: string, workspaceName: string, enabled: boolean) => {
    const api = window.electronAPI;
    // Guard is per-model: another model downloading must not block this one.
    if (!api?.slpSetModelEnabled || downloadsRef.current.has(name)) return;

    // Claim the transition so the terminal progress event leaves it alone.
    pendingTogglesRef.current.add(name);
    // A retry starts clean — the old reason is about to be re-earned or gone.
    clearDownloadError(name);
    // The override is the optimistic state; `enabledCapabilities` derives from it,
    // so dependent UI (documents/skills gating, vision attachments) updates now
    // rather than waiting for the backend to confirm and re-emit the list.
    setEnabledOverrides(prev => new Map(prev).set(name, enabled));

    // Main reports `downloading: true` when the enable landed but weights are
    // still arriving (its own download, or one another project started). Keep
    // showing progress in that case and let the terminal event finalize it.
    let stillDownloading = false;
    try {
      const res = await api.slpSetModelEnabled(workspaceName, enabled, projectId);
      stillDownloading = !!res?.downloading;
      // A refused download (400/403 for weights this account can't have) never
      // enables anything, so drop the optimistic override with it — otherwise the
      // row reads as on until the next list refresh contradicts it.
      if (res && res.success === false) {
        setDownloadError(name, res.error || 'Download failed', !!res.requiresAuth);
        setEnabledOverrides(prev => { const next = new Map(prev); next.delete(name); return next; });
      }
      if (!stillDownloading) await fetchLocalModels();
    } finally {
      pendingTogglesRef.current.delete(name);
      if (!stillDownloading) clearAuxDownload(name);
    }
  }, [fetchLocalModels, projectId, clearAuxDownload, clearDownloadError, setDownloadError]);

  // Initial load + refetch on project switch (per-project model settings).
  useEffect(() => { fetchLocalModels(); }, [fetchLocalModels]);

  // The app's only `models-updated` subscription.
  useEffect(() => {
    // Signing in or out changes what this account is entitled to, so every
    // recorded refusal is stale — most of all the "sign in" one just acted on.
    const handleAuthChange = () => { clearDownloadErrors(); fetchLocalModels(); };
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
  }, [fetchLocalModels, clearDownloadErrors]);

  const value = useMemo<ModelStatusValue>(() => ({
    localModels,
    localModelsLoading,
    enabledModels,
    isEnabled,
    enabledCapabilities,
    fetchLocalModels,
    downloads,
    isDownloading,
    downloadErrors,
    clearDownloadError,
    clearDownloadErrors,
    handleToggleModel,
    handleCancelDownload,
    primaryProgress,
    loadPrimaryModel,
    waitForPrimaryModel,
  }), [
    localModels, localModelsLoading, enabledModels, isEnabled, enabledCapabilities,
    fetchLocalModels, downloads, isDownloading, downloadErrors, clearDownloadError,
    clearDownloadErrors, handleToggleModel, handleCancelDownload,
    primaryProgress, loadPrimaryModel, waitForPrimaryModel,
  ]);

  return <ModelStatusContext.Provider value={value}>{children}</ModelStatusContext.Provider>;
}
