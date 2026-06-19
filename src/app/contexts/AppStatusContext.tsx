import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storageService } from '@/app/services/storage.service';

export interface IndexingProgress {
  total: number;
  indexed: number;
  pending: number;
}

export interface AppStatus {
  memory: number | null;
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

interface HealthPayload {
  memory_percent?: number;
  memory?: number;
  indexing?: {
    documents?: Array<{ id?: string; status?: string }>;
  };
}

const DEFAULT_STATUS: AppStatus = {
  memory: null,
  indexingProgress: null,
  indexingStatus: {},
  processedDates: {},
  setDocumentStatus: () => {},
  removeProcessed: () => {},
};

const AppStatusContext = createContext<AppStatus>(DEFAULT_STATUS);

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [memory, setMemory] = useState<number | null>(null);
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

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onHealthUpdate) return;

    const handler = (health: HealthPayload) => {
      setMemory(health?.memory_percent ?? health?.memory ?? null);

      const indexingDocs = health?.indexing?.documents;
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
            storageService.setDocumentProcessed(d.id, currentProjectId);
          }
        } else {
          pendingCount++;
        }
      }

      setIndexingStatus(prev => ({ ...prev, ...nextStatuses }));
      if (newlyIndexedIds.length > 0) {
        const now = new Date().toISOString();
        setProcessedDates(prev => {
          const next = { ...prev };
          for (const id of newlyIndexedIds) next[id] = now;
          return next;
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
        storageService.setDocumentProcessed(docId, pid);
        const now = new Date().toISOString();
        setProcessedDates(prev => ({ ...prev, [docId]: now }));
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
