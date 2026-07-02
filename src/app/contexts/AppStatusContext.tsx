import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storageService } from '@/app/services/storage.service';

export interface IndexingProgress {
  total: number;
  indexed: number;
  pending: number;
}

export interface ServerHealth {
  url?: string;
  status: string;
  details?: Record<string, any>;
  error?: string;
}

export interface AppStatus {
  memory: number | null;
  // Latest local SLP service health, driven by the central health-monitor poll.
  // Consumers (e.g. Settings) read this instead of fetching /health themselves.
  serverHealth: ServerHealth | null;
  indexingProgress: IndexingProgress | null;
  // Per-document live status. Seeded from SQLite on project change,
  // updated by the /health poll and by callers (e.g. upload progress).
  indexingStatus: Record<string, string>;
  // Per-document processed_at timestamps. Seeded from SQLite, updated when a
  // doc is first seen as indexed.
  processedDates: Record<string, string>;
  // Push a status update from outside the health-poll path. If `status` is
  // 'indexed' and the doc has no processed_at yet, persist one.
  setDocumentStatus: (docId: string, status: string) => void;
  // Forget a document's processed state (used by refreshApi cleanup when a
  // doc no longer exists in the API).
  removeProcessed: (docId: string) => void;
}

interface HealthDetails {
  memory_percent?: number;
  memory?: number;
  indexing?: {
    documents?: Array<{ id?: string; status?: string }>;
  };
}

interface HealthPayload extends ServerHealth {
  details?: HealthDetails;
}

const DEFAULT_STATUS: AppStatus = {
  memory: null,
  serverHealth: null,
  indexingProgress: null,
  indexingStatus: {},
  processedDates: {},
  setDocumentStatus: () => {},
  removeProcessed: () => {},
};

const AppStatusContext = createContext<AppStatus>(DEFAULT_STATUS);

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [memory, setMemory] = useState<number | null>(null);
  const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<Record<string, string>>({});
  const [processedDates, setProcessedDates] = useState<Record<string, string>>({});

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectIdRef = useRef<string | null>(projectId);
  projectIdRef.current = projectId;
  const processedDatesRef = useRef<Record<string, string>>(processedDates);
  processedDatesRef.current = processedDates;

  // On project change, reset live state and seed from SQLite so docs indexed
  // in previous sessions render their timestamp before the health poll runs.
  useEffect(() => {
    let cancelled = false;
    setIndexingStatus({});
    setProcessedDates({});
    setIndexingProgress(null);
    if (!projectId) return;
    (async () => {
      const dates = await storageService.getDocumentStatusByProject(projectId);
      if (cancelled) return;
      setProcessedDates(dates);
      const seeded: Record<string, string> = {};
      for (const id of Object.keys(dates)) seeded[id] = 'indexed';
      setIndexingStatus(seeded);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Seed last-known health from SQLite so a cold start (before the first poll)
  // paints immediately; the live health-monitor push then keeps it current.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageService.getAllSettings();
      if (cancelled) return;
      const cached = saved?.service_health as ServerHealth | undefined;
      if (!cached) return;
      setServerHealth(prev => prev ?? cached);
      const d = cached.details;
      setMemory(prev => prev ?? (d?.memory_percent ?? d?.memory ?? null));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onHealthUpdate) return;

    const handler = (payload: HealthPayload) => {
      setServerHealth(payload);
      // Persist the last good snapshot so any consumer can paint instantly on a
      // cold start before the first poll completes.
      if (payload?.status === 'running') {
        storageService.setSetting('service_health', payload);
      }

      const details = payload?.details;
      setMemory(details?.memory_percent ?? details?.memory ?? null);

      const indexingDocs = details?.indexing?.documents;
      const currentProjectId = projectIdRef.current;
      if (!Array.isArray(indexingDocs) || !currentProjectId) {
        setIndexingProgress(null);
        return;
      }

      const nextStatuses: Record<string, string> = {};
      const newlyIndexedIds: string[] = [];
      let indexedCount = 0;
      let pendingCount = 0;

      for (const d of indexingDocs) {
        if (!d?.id) continue;
        const s = d.status || 'unknown';
        nextStatuses[d.id] = s;
        if (s === 'indexed') {
          indexedCount++;
          if (!processedDatesRef.current[d.id]) {
            newlyIndexedIds.push(d.id);
          }
        } else {
          pendingCount++;
        }
      }

      setIndexingStatus(prev => ({ ...prev, ...nextStatuses }));
      if (newlyIndexedIds.length > 0) {
        // Resolve each timestamp from SQLite — preserves the original
        // processed_at when the DB already has a row (via ON CONFLICT).
        Promise.all(
          newlyIndexedIds.map(id =>
            storageService.setDocumentProcessed(id, currentProjectId).then(stored => ({ id, stored }))
          )
        ).then(results => {
          setProcessedDates(prev => {
            const next = { ...prev };
            for (const { id, stored } of results) {
              if (stored) next[id] = stored;
            }
            return next;
          });
        });
      }
      setIndexingProgress(
        pendingCount > 0
          ? { total: indexingDocs.length, indexed: indexedCount, pending: pendingCount }
          : null
      );
    };

    api.onHealthUpdate(handler);
    return () => {
      api.removeHealthUpdateListener?.();
    };
  }, []);

  const setDocumentStatus = useCallback((docId: string, status: string) => {
    if (!docId || !status) return;
    setIndexingStatus(prev => ({ ...prev, [docId]: status }));
    if (status === 'indexed') {
      const pid = projectIdRef.current;
      if (pid && !processedDatesRef.current[docId]) {
        // Trust the DB's value, not `now`: ON CONFLICT preserves the original
        // processed_at, so a doc indexed in a previous session keeps its real
        // timestamp even after a remount or in-memory wipe.
        storageService.setDocumentProcessed(docId, pid).then(stored => {
          if (!stored) return;
          setProcessedDates(prev => ({ ...prev, [docId]: stored }));
        });
      }
    }
  }, []);

  const removeProcessed = useCallback((docId: string) => {
    if (!docId) return;
    storageService.deleteDocumentStatus(docId);
    setIndexingStatus(prev => {
      if (!(docId in prev)) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    setProcessedDates(prev => {
      if (!(docId in prev)) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  }, []);

  const value: AppStatus = {
    memory,
    serverHealth,
    indexingProgress,
    indexingStatus,
    processedDates,
    setDocumentStatus,
    removeProcessed,
  };

  return (
    <AppStatusContext.Provider value={value}>
      {children}
    </AppStatusContext.Provider>
  );
}

export function useAppStatus(): AppStatus {
  return useContext(AppStatusContext);
}
