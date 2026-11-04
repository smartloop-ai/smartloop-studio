import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { storageService } from '@/app/services/storage.service';

/**
 * ProjectContext — the single owner of the projects list and the currently
 * selected project. It is the ONLY place in the renderer that talks to
 * `window.electronAPI.projects.*`. All CRUD flows through here and refreshes
 * off the main-process `projects-changed` broadcast (DOM `projectsChanged`),
 * so components never fetch projects themselves and the old cascade of
 * per-component refetches is gone.
 *
 * Selection: the URL `?project=<id>` is the source of truth for now, hidden
 * behind `selectedProject` / `selectProject`. Consumers must go through those
 * — never navigate('/?project=') directly — so a future move to internal
 * state only touches this file.
 */

interface ProjectResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ProjectContextType {
  projects: any[];
  selectedProject: any | null;
  ready: boolean;
  refresh: () => Promise<any[]>;
  createProject: (params: any) => Promise<ProjectResult>;
  updateProject: (id: string, updates: any) => Promise<ProjectResult>;
  deleteProject: (id: string) => Promise<ProjectResult>;
  selectProject: (id: string, opts?: { replace?: boolean }) => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function useProjectContext(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlProjectId = searchParams.get('project');

  // In-flight guard so overlapping broadcasts coalesce into one refresh.
  const refreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);

  const api = () => (window as any).electronAPI;

  // Retry backoff for when the SLP service isn't ready to answer yet (see refresh()).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(400);
  // Latest reconcile-inclusive refresher, so timers/health events that register once
  // still call through to the current closure without needing to re-subscribe.
  const refreshAndReconcileRef = useRef<() => void>(() => {});
  const lastHealthStatusRef = useRef<string | undefined>(undefined);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return; // one pending retry at a time
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(delay * 2, 2000);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      refreshAndReconcileRef.current();
    }, delay);
  }, []);

  const refresh = useCallback(async (): Promise<any[]> => {
    if (refreshingRef.current) {
      pendingRefreshRef.current = true;
      return projects;
    }
    refreshingRef.current = true;
    try {
      const res = await api()?.projects?.list();
      if (res?.success && Array.isArray(res.data)) {
        // A genuine answer from the service — including a legitimately empty list
        // (e.g. before bootstrap creates the default project). Safe to commit.
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        retryDelayRef.current = 400;
        // Docent's projects are folders of code it works in from the terminal;
        // they hold no documents to chat with here, so Studio leaves them out.
        // The system project is every client's, whatever its record says.
        const ours = res.data.filter((p: any) => p?.system || p?.client !== 'docent');
        setProjects(ours);
        return ours;
      }
      // Service isn't ready (notReady) or errored. Do NOT overwrite the current list
      // with an empty one — that's the blank-sidebar race. Keep what we have and retry
      // until the service can answer (the health-update listener also nudges recovery).
      scheduleRetry();
      return projects;
    } catch (err) {
      console.error('ProjectContext: refresh failed', err);
      scheduleRetry();
      return projects;
    } finally {
      refreshingRef.current = false;
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        // A change landed mid-refresh — run once more to converge.
        refresh();
      }
    }
  }, [projects, scheduleRetry]);

  const createProject = useCallback(async (params: any): Promise<ProjectResult> => {
    const res = await api()?.projects?.create(params);
    // Main broadcasts projects-changed → refresh happens via the listener.
    return res || { success: false, error: 'Local API not available' };
  }, []);

  const updateProject = useCallback(async (id: string, updates: any): Promise<ProjectResult> => {
    const res = await api()?.projects?.update(id, updates);
    return res || { success: false, error: 'Local API not available' };
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<ProjectResult> => {
    const res = await api()?.projects?.delete(id);
    return res || { success: false, error: 'Local API not available' };
  }, []);

  const selectProject = useCallback((id: string, opts?: { replace?: boolean }) => {
    if (!id) return;
    navigate(`/?project=${id}`, { replace: opts?.replace ?? false });
  }, [navigate]);

  // Auto-select a project when the URL doesn't already point at one. Runs
  // after each refresh. The default system project ("general_chat") is created
  // by the SLP backend during bootstrap — the client never creates it, so
  // there's nothing to reconcile when the list is empty (bootstrap will fill
  // it and re-trigger this via projects-changed / bootstrap-complete).
  const reconcile = useCallback(async (list: any[]) => {
    if (list.length === 0) return;

    // Auto-selection is a Home-route behavior. Only auto-pick a project when the
    // user is actually on Home — never navigate them off another page (e.g.
    // Settings) to select one. Otherwise a refresh triggered mid-session (like the
    // one fired after a Clean restart) yanks the user out of the page and remounts
    // the whole UI instead of just updating the panel they're looking at.
    const hash = window.location.hash;
    const pathPart = hash.replace(/^#/, '').split('?')[0];
    if (pathPart && pathPart !== '/') return;

    // Auto-select only when nothing is already selected via the URL.
    const queryStart = hash.indexOf('?');
    const params = new URLSearchParams(queryStart >= 0 ? hash.slice(queryStart) : '');
    if (params.get('project') || params.get('conversation')) return;

    const savedId = await storageService.getSetting('selected_project_id');
    const target = (savedId && list.find((p: any) => p.id === savedId))
      ?? list.find((p: any) => p.system)
      ?? list[0];
    if (target) selectProject(target.id, { replace: true });
  }, [selectProject]);

  const refreshAndReconcile = useCallback(async () => {
    const list = await refresh();
    await reconcile(list);
  }, [refresh, reconcile]);

  // Keep the ref pointed at the current closure so once-registered timers/listeners
  // (scheduleRetry, the health-update subscription) always call the latest version.
  refreshAndReconcileRef.current = refreshAndReconcile;

  // Initial load.
  useEffect(() => {
    (async () => {
      await refreshAndReconcile();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh on any project change broadcast from the main process.
  useEffect(() => {
    const handleChanged = () => { refreshAndReconcile(); };
    window.addEventListener('projectsChanged', handleChanged);
    return () => window.removeEventListener('projectsChanged', handleChanged);
  }, [refreshAndReconcile]);

  // When the SLP service comes online (may fire after mount), load projects.
  useEffect(() => {
    const handleReady = () => { refreshAndReconcile(); };
    window.addEventListener('slpServiceReady', handleReady);
    return () => window.removeEventListener('slpServiceReady', handleReady);
  }, [refreshAndReconcile]);

  // When bootstrap completes (newly downloaded models/projects), refresh.
  useEffect(() => {
    const electron = api();
    if (!electron?.onBootstrapComplete) return;
    electron.onBootstrapComplete(() => { refreshAndReconcile(); });
    return () => electron.removeBootstrapCompleteListener?.();
  }, [refreshAndReconcile]);

  // Recover off the central health-monitor poll. This is the repeated, self-healing
  // signal (unlike the one-shot slp-service-ready, which can be dropped if it fires
  // before the renderer is listening). Refresh when the service (re)enters a running
  // state — covering a missed ready signal at startup and mid-session restarts.
  useEffect(() => {
    const electron = api();
    if (!electron?.onHealthUpdate) return;
    electron.onHealthUpdate((payload: any) => {
      const status = payload?.status;
      const prev = lastHealthStatusRef.current;
      lastHealthStatusRef.current = status;
      if (status === 'running' && prev !== 'running') {
        refreshAndReconcileRef.current();
      }
    });
    // Deliberately no cleanup: preload's removeHealthUpdateListener is
    // removeAllListeners('health-update'), shared with AppStatusContext, and this
    // provider lives for the app's lifetime. Register once.
  }, []);

  // Clear any pending retry timer on unmount.
  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  // Persist the selected project whenever the URL project param changes.
  useEffect(() => {
    if (urlProjectId) {
      storageService.setSetting('selected_project_id', urlProjectId);
    }
  }, [urlProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p: any) => p.id === urlProjectId) ?? null,
    [projects, urlProjectId]
  );

  const value: ProjectContextType = {
    projects,
    selectedProject,
    ready,
    refresh,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}
