import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { documentService } from '@/app/services/document.service';
import { storageService } from '@/app/services/storage.service';
import { useAppStatus } from '@/app/contexts/AppStatusContext';

/**
 * Everything the Documents section knows, as one hook.
 *
 * Owned by the sidebar rather than the panel because an upload outlives the
 * panel being open: files keep processing, SQLite keeps the pending rows so they
 * survive navigation, and the scan/refresh loop reconciles the project folder
 * against the API on its own schedule. Closing the section must not abandon a
 * file mid-upload.
 */
export interface UseProjectDocumentsArgs {
  projectId?: string;
  /** The project's real directory, as the backend reports it. */
  folderPath?: string;
}

export function useProjectDocuments({ projectId, folderPath }: UseProjectDocumentsArgs) {
  const { indexingStatus, processedDates, setDocumentStatus, removeProcessed } = useAppStatus();
  const [isDragging, setIsDragging] = useState(false);
  const [, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingDocs, setProcessingDocs] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Documents being uploaded or processed — not yet part of the API list.
  const [uploadingDocs, setUploadingDocs] = useState<any[]>([]);
  const [directoryFiles, setDirectoryFiles] = useState<any[]>([]);

  // Load pending/processing uploads from SQLite when project changes so they survive navigation
  useEffect(() => {
    if (!projectId) { setUploadingDocs([]); setProcessingDocs(new Map()); return; }
    storageService.getDocumentsByProject(projectId).then(docs => {
      if (docs.length > 0) {
        setUploadingDocs(docs.map((d: any) => ({ id: d.id, name: d.filename, source: d.filename })));
        setProcessingDocs(new Map(docs.map((d: any) => [d.id, d.status])));
      } else {
        setUploadingDocs([]);
        setProcessingDocs(new Map());
      }
    });
  }, [projectId]);

  // Local copy of API documents, refreshed periodically
  const [apiDocuments, setApiDocuments] = useState<any[]>([]);
  // Tracks fs file path → API doc ID for files submitted for processing
  const [fsToApiMap, setFsToApiMap] = useState<Map<string, string>>(new Map());

  // Keep refs to context methods so refreshApi (a stable closure within the
  // useEffect below) can call them without putting them in the dep array.
  const setDocumentStatusRef = useRef(setDocumentStatus);
  setDocumentStatusRef.current = setDocumentStatus;
  const removeProcessedRef = useRef(removeProcessed);
  removeProcessedRef.current = removeProcessed;
  const processedDatesRef = useRef(processedDates);
  processedDatesRef.current = processedDates;

  // Scan project directory and refresh API documents.
  // Per-document indexing status and processed_at timestamps live in
  // AppStatusContext — it owns the /health-driven updates and SQLite writes.
  useEffect(() => {
    // A new project starts with a clean error slate — the last one's upload
    // failure isn't news here.
    setUploadError('');
    if (!projectId) { setApiDocuments([]); setDirectoryFiles([]); setFsToApiMap(new Map()); return; }
    setFsToApiMap(new Map());

    let cancelled = false;

    const scanDir = () => {
      if (!folderPath || !window.electronAPI?.listDirectory) return;
      window.electronAPI.listDirectory(folderPath).then((result: any) => {
        if (!cancelled && result.success) setDirectoryFiles(result.files);
      });
    };

    const refreshApi = async () => {
      const result = await documentService.getLocalDocuments(projectId);
      if (cancelled || !result.success || !result.data) return;

      const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
      setApiDocuments(docs);
      const apiDocIds = new Set<string>();
      for (const doc of docs) {
        if (!doc.id) continue;
        apiDocIds.add(doc.id);
        const status = doc.status ?? doc.indexing_status ?? doc.state ?? '';
        if (status) setDocumentStatusRef.current(doc.id, status);
      }

      // Cleanup: any doc the context still tracks but that's no longer in the
      // API has been removed — drop its processed_at and folder mapping.
      for (const docId of Object.keys(processedDatesRef.current)) {
        if (!apiDocIds.has(docId)) {
          removeProcessedRef.current(docId);
          storageService.clearDocumentFolder(docId);
        }
      }
    };

    // Initial load
    scanDir();
    refreshApi();

    // Refresh on explicit events (upload, delete, processing complete)
    const handler = () => { scanDir(); refreshApi(); };
    window.addEventListener('documentProcessingComplete', handler);
    window.addEventListener('documentUploaded', handler);

    return () => {
      cancelled = true;
      window.removeEventListener('documentProcessingComplete', handler);
      window.removeEventListener('documentUploaded', handler);
    };
  }, [folderPath, projectId]);

  // Standalone refresh for documents (called on tab switch)
  const refreshDocuments = useCallback(() => {
    if (!projectId) return;
    if (folderPath && window.electronAPI?.listDirectory) {
      window.electronAPI.listDirectory(folderPath).then((result: any) => {
        if (result.success) setDirectoryFiles(result.files);
      });
    }
    documentService.getLocalDocuments(projectId).then((result) => {
      if (result.success && result.data) {
        const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
        setApiDocuments(docs);
      }
    });
  }, [projectId, folderPath]);

  // Project folder is the source of truth; API data enriches with status/summary
  const effectiveDocuments = useMemo(() => {
    const serverDocs: any[] = apiDocuments;
    const serverIds = new Set(serverDocs.map((d: any) => d.id));
    const pending = uploadingDocs.filter((d: any) => !serverIds.has(d.id));

    // Build multiple lookups from API docs for robust matching
    const baseName = (name: string) => name.replace(/\.[^/.]+$/, '').toLowerCase();
    const apiById = new Map<string, any>();
    const apiByBase = new Map<string, any>();
    const apiByPath = new Map<string, any>();
    for (const doc of serverDocs) {
      if (doc.id) apiById.set(doc.id, doc);
      const docFileName = (doc.path || doc.source || '').split('/').pop()
        || doc.filename || doc.name || '';
      const base = baseName(docFileName);
      if (base) apiByBase.set(base, doc);
      if (doc.source) apiByPath.set(doc.source, doc);
      if (doc.path) apiByPath.set(doc.path, doc);
    }

    // If no directory files, filter API docs to only those that still exist or are processing
    if (directoryFiles.length === 0) {
      return [...serverDocs, ...pending];
    }

    // For each directory file, find matching API doc or show as unindexed
    const matchedApiIds = new Set<string>();
    const merged = directoryFiles.map((file: any) => {
      const base = baseName(file.name);
      const mappedId = fsToApiMap.get(file.path);
      const match = (mappedId ? apiById.get(mappedId) : null)
        || apiByPath.get(file.path)
        || apiByBase.get(base);
      if (match) {
        matchedApiIds.add(match.id);
        return { ...match, _fsFile: file };
      }
      // File exists on disk but not in API — show as unindexed
      return {
        id: `fs-${file.path}`,
        name: file.name,
        filename: file.name,
        source: file.path,
        size: file.size,
        _fsFile: file,
      };
    });

    // Indexed docs that don't correspond to a directory file (e.g. uploaded via
    // the picker — they live in the backend store, not the project folder) would
    // otherwise be dropped. Surface them so documents stay visible after indexing.
    const unmatched = serverDocs.filter((d: any) => d.id && !matchedApiIds.has(d.id));

    return [...merged, ...unmatched, ...pending];
  }, [apiDocuments, uploadingDocs, directoryFiles, fsToApiMap]);

  const validateFile = (file: File): boolean => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.includes(file.type) && !/\.md$/i.test(file.name)) {
      setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, MD');
      return false;
    }

    if (file.size > maxSize) {
      setUploadError('File size exceeds 50MB limit');
      return false;
    }

    return true;
  };

  const uploadSingleFile = async (file: File, placeholderId: string, projectId: string) => {
    const buffer = await file.arrayBuffer();
    const tempPath = await window.electronAPI!.saveTempFile(file.name, buffer);

    let doneHandled = false;
    let realDocId: string | null = null;

    const localResult = await documentService.addLocalDocument(
      projectId,
      tempPath,
      (progress) => {
        const doc = progress.documents?.[0];
        const apiDocId = doc?.id || doc?.document_id || null;

        if (progress.event === 'done') {
          doneHandled = true;
          const finalDocId = apiDocId || realDocId;

          setProcessingDocs(prev => {
            const next = new Map(prev);
            next.delete(placeholderId);
            if (realDocId) next.delete(realDocId);
            if (apiDocId) next.delete(apiDocId);
            return next;
          });
          setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId && d.id !== realDocId && d.id !== apiDocId));

          // Remove from SQLite — doc is now owned by the API
          storageService.deleteDocument(realDocId || placeholderId);
          if (apiDocId && apiDocId !== realDocId) storageService.deleteDocument(apiDocId);

          if (finalDocId && doc) {
            const docStatus = doc.status || 'indexed';
            setDocumentStatus(finalDocId, docStatus);
            setApiDocuments(prev => {
              const idx = prev.findIndex((d: any) => d.id === finalDocId);
              if (idx >= 0) { const next = [...prev]; next[idx] = doc; return next; }
              return [...prev, doc];
            });
          }
          window.dispatchEvent(new Event('documentUploaded'));
          return;
        }

        // Intermediate events — swap placeholder with real doc and show live status
        if (apiDocId && doc) {
          const docStatus = doc.status || 'processing';

          if (!realDocId) {
            realDocId = apiDocId;
            // Update SQLite: replace placeholder id with real API id
            storageService.updateDocumentId(placeholderId, apiDocId, docStatus);
            setUploadingDocs(prev => prev.map(d =>
              d.id === placeholderId ? { ...doc, name: file.name } : d
            ));
            setProcessingDocs(prev => {
              const next = new Map(prev);
              next.delete(placeholderId);
              next.set(apiDocId, docStatus);
              return next;
            });
          } else {
            storageService.updateDocumentStatus(apiDocId, docStatus);
            setProcessingDocs(prev => new Map(prev).set(apiDocId, docStatus));
          }
          setDocumentStatus(apiDocId, docStatus);
        } else {
          const currentId = realDocId || placeholderId;
          const currentStatus = progress.status || 'processing';
          storageService.updateDocumentStatus(currentId, currentStatus);
          setProcessingDocs(prev => new Map(prev).set(currentId, currentStatus));
        }
      },
      folderPath,
    );

    if (!localResult.success) {
      setProcessingDocs(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        if (realDocId) next.delete(realDocId);
        return next;
      });
      setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId && d.id !== realDocId));
      // Remove from SQLite on failure
      storageService.deleteDocument(placeholderId);
      if (realDocId) storageService.deleteDocument(realDocId);
      throw new Error(localResult.error || 'Upload failed');
    }

    if (!doneHandled) {
      const uploadedDocument = localResult.data;
      const docId = uploadedDocument?.id || uploadedDocument?.document_id || realDocId;
      setProcessingDocs(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        if (realDocId) next.delete(realDocId);
        if (docId) next.delete(docId);
        return next;
      });
      setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId && d.id !== realDocId && d.id !== docId));
      // Remove from SQLite — doc is now owned by the API
      storageService.deleteDocument(realDocId || placeholderId);
      if (docId) {
        const docStatus = uploadedDocument?.status || 'indexed';
        setDocumentStatus(docId, docStatus);
        setApiDocuments(prev => {
          const idx = prev.findIndex((d: any) => d.id === docId);
          if (idx >= 0) { const next = [...prev]; next[idx] = uploadedDocument; return next; }
          return [...prev, uploadedDocument];
        });
      }
      window.dispatchEvent(new Event('documentUploaded'));
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!projectId) {
      setUploadError('No project selected');
      return;
    }

    if (!window.electronAPI?.saveTempFile) {
      setUploadError('Local file upload is not available outside of the desktop app');
      return;
    }

    // Validate all files upfront, collect valid ones
    const validFiles: File[] = [];
    for (const file of files) {
      if (validateFile(file)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    setUploadError('');
    setIsUploading(true);


    // Create placeholders for all files at once so they appear immediately
    const entries = validFiles.map((file, i) => {
      const placeholderId = `uploading-${Date.now()}-${i}`;
      return { file, placeholderId };
    });

    setUploadingDocs(prev => [
      ...prev,
      ...entries.map(e => ({ id: e.placeholderId, name: e.file.name, source: e.file.name })),
    ]);
    setProcessingDocs(prev => {
      const next = new Map(prev);
      for (const e of entries) next.set(e.placeholderId, 'pending');
      return next;
    });

    // Persist to SQLite immediately so pending uploads survive navigation
    for (const e of entries) {
      await storageService.addDocument({ id: e.placeholderId, project_id: projectId, filename: e.file.name, status: 'pending' });
    }

    // Process uploads one at a time to avoid progress-listener conflicts
    for (const { file, placeholderId } of entries) {
      try {
        await uploadSingleFile(file, placeholderId, projectId);
      } catch (error: any) {
        setUploadError(error.message || 'Failed to upload document');
      }
    }

    setIsUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      e.target.value = '';
      uploadFiles(files);
    } else {
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };
  return {
    documents: effectiveDocuments,
    indexingStatus,
    processedDates,
    processingDocs,
    isDragging,
    uploadError,
    setUploadError,
    fileInputRef,
    refreshDocuments,
    uploadFiles,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}

export type DocumentsSectionState = ReturnType<typeof useProjectDocuments>;
