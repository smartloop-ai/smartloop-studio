import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
}

interface HealthPayload {
  memory_percent?: number;
  memory?: number;
  indexing?: {
    documents?: Array<{ id?: string; status?: string }>;
  };
}

const DEFAULT_STATUS: AppStatus = { memory: null, indexingProgress: null };

const AppStatusContext = createContext<AppStatus>(DEFAULT_STATUS);

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>(DEFAULT_STATUS);
  const [searchParams] = useSearchParams();
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = searchParams.get('project');

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onHealthUpdate) return;

    const handler = (health: HealthPayload) => {
      const memPct: number | null = health?.memory_percent ?? health?.memory ?? null;
      const indexingDocs = health?.indexing?.documents;
      const projectId = projectIdRef.current;
      let indexingProgress: IndexingProgress | null = null;

      if (Array.isArray(indexingDocs) && projectId) {
        const indexingMap: Record<string, string> = {};
        let indexedCount = 0;
        let pendingCount = 0;
        for (const d of indexingDocs) {
          if (!d?.id) continue;
          indexingMap[d.id] = d.status || 'unknown';
          if (d.status === 'indexed') {
            indexedCount++;
            storageService.setDocumentProcessed(d.id, projectId);
          } else {
            pendingCount++;
          }
        }
        if (pendingCount > 0) {
          indexingProgress = {
            total: indexingDocs.length,
            indexed: indexedCount,
            pending: pendingCount,
          };
        }
        window.dispatchEvent(new CustomEvent('indexingStatusUpdate', {
          detail: { projectId, documents: indexingMap },
        }));
      }

      setStatus({ memory: memPct, indexingProgress });
    };

    api.onHealthUpdate(handler);
    return () => {
      api.removeHealthUpdateListener?.();
    };
  }, []);

  return (
    <AppStatusContext.Provider value={status}>
      {children}
    </AppStatusContext.Provider>
  );
}

export function useAppStatus(): AppStatus {
  return useContext(AppStatusContext);
}
