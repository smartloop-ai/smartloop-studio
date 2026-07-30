import { Box, IconButton, CircularProgress, Tooltip, TextField, InputAdornment } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ConstructionIcon from '@mui/icons-material/Construction';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CircleIcon from '@mui/icons-material/Circle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SubdirectoryArrowLeftIcon from '@mui/icons-material/SubdirectoryArrowLeft';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ShareIcon from '@mui/icons-material/Share';
import CheckIcon from '@mui/icons-material/Check';
import { storageService } from '@/app/services/storage.service';
import { useAppStatus } from '@/app/contexts/AppStatusContext';
import McpServerItem from './mcp-server-item';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import '../styles/home.css';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { documentService } from '@/app/services/document.service';
import { mcpServerService, McpServer } from '@/app/services/mcp-server.service';
import { PROJECT_COLORS, getLocalApiEndpoint } from '@/app/constants';


import { OpenTab } from './conversation-tabs';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
  onFolderPathChange?: (path: string) => void;
  onColorChange?: (color: string) => void;
  onRenameProject?: (name: string) => void;
  user: any;
  activeTab: string;
  onTabChange?: (tab: OpenTab) => void;
  projectSkills?: Array<{ id?: string; name: string; content: string; description?: string }>;
  onSaveSkills?: (skills: Array<{ id?: string; name: string; content: string; description?: string }>) => void;
  onRefreshSkills?: () => void;
}

const getSkillPreviewText = (content: string, description?: string) => {
  const source = (description && description.trim()) ? description : content;
  const withoutFrontMatter = source.replace(/^---[\s\S]*?---\s*/m, '').trim();
  const lines = withoutFrontMatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const preview = lines.slice(0, 3).join('\n');
  return preview.length > 240 ? `${preview.slice(0, 240).trimEnd()}…` : preview;
};

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  onAddDocument: _onAddDocument,
  onDeleteDocument,
  onColorChange,
  onRenameProject,
  activeTab,
  onTabChange,
  projectSkills: _projectSkills = [],
  onSaveSkills,
  onRefreshSkills,
}: RightSidebarProps) {
  const { indexingStatus, processedDates, setDocumentStatus, removeProcessed } = useAppStatus();
  const [activeSection, setActiveSection] = useState<'documents' | 'mcp' | 'skills' | 'settings' | null>('documents');
  const [_hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery] = useState<string>('');
  const [skillSearchQuery, setSkillSearchQuery] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingDocs, setProcessingDocs] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localFolderPath, setLocalFolderPath] = useState('');
  const [localProjectName, setLocalProjectName] = useState('');

  // Inline skill editing
  const [_hoveredSkillIndex, setHoveredSkillIndex] = useState<number | null>(null);
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);
  const [editingSkillIsNew, setEditingSkillIsNew] = useState(false);
  const [skillContent, setSkillContent] = useState('');
  const [skillHasUnsavedChanges, setSkillHasUnsavedChanges] = useState(false);
  const skillAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [skillDragOver, setSkillDragOver] = useState(false);
  const [pendingSkill, setPendingSkill] = useState<{ baselineCount: number; content: string } | null>(null);
  const savingSkill = pendingSkill !== null;
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  // Skills loaded from the API
  const [localSkills, setLocalSkills] = useState<Array<{ id?: string; name: string; content: string; description?: string }>>([]);

  const loadSkillsFromDir = useCallback(async () => {
    if (!selectedProject?.id) return;
    try {
      const base = await getLocalApiEndpoint();
      const res = await fetch(`${base}/v1/projects/${selectedProject.id}/skills`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.skills ?? []);
        setLocalSkills(list.map((s: any) => ({ id: s.id || s.name, name: s.name || '', content: s.content || '', description: s.description || '' })));
      }
    } catch { /* silent */ }
  }, [selectedProject?.id]);

  // Load on project change — retry a few times to handle race where SLP writes default
  // skills to the directory shortly after the project is created/selected.
  useEffect(() => {
    let cancelled = false;
    const projectId = selectedProject?.id;
    setLocalSkills([]);
    if (!projectId) return;

    const attempt = async (retriesLeft: number) => {
      if (cancelled) return;
      try {
        const base = await getLocalApiEndpoint();
        const res = await fetch(`${base}/v1/projects/${projectId}/skills`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.skills ?? []);
          setLocalSkills(list.map((s: any) => ({ id: s.id || s.name, name: s.name || '', content: s.content || '', description: s.description || '' })));
          if (list.length === 0 && retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), 1500);
          }
        }
      } catch { /* silent */ }
    };

    attempt(3);
    return () => { cancelled = true; };
  }, [selectedProject?.id]);

  // Reload when skills panel becomes active
  useEffect(() => {
    if (activeSection === 'skills') loadSkillsFromDir();
  }, [activeSection, loadSkillsFromDir]);

  // Refresh when skills are saved elsewhere (e.g. skill editor tabs)
  useEffect(() => {
    const handler = () => loadSkillsFromDir();
    window.addEventListener('skillsSaved', handler);
    return () => window.removeEventListener('skillsSaved', handler);
  }, [loadSkillsFromDir]);

  useEffect(() => {
    if (!pendingSkill) return;
    const appeared =
      localSkills.length > pendingSkill.baselineCount ||
      localSkills.some((s) => (s.content || '').trim() === pendingSkill.content.trim());
    if (appeared) setPendingSkill(null);
  }, [localSkills, pendingSkill]);

  useEffect(() => {
    if (!pendingSkill) return;
    const timeout = setTimeout(() => setPendingSkill(null), 15000);
    return () => clearTimeout(timeout);
  }, [pendingSkill]);


  const skillEditorOptions = useMemo(() => ({
    spellChecker: false,
    status: false as const,
    toolbar: false as const,
    minHeight: '200px',
    placeholder: 'Add skills or guidelines for this project...',
  }), []);

  const handleSkillSave = useCallback(() => {
    if (!onSaveSkills) return;
    if (editingSkillIsNew) {
      const nameMatch = skillContent.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/) || skillContent.match(/^#\s+(.+)$/m);
      const name = nameMatch?.[1]?.trim() || 'Untitled Skill';
      onSaveSkills([...localSkills, { name, content: skillContent }]);
      setEditingSkillIndex(localSkills.length);
      setEditingSkillIsNew(false);
      setTimeout(() => loadSkillsFromDir(), 800);
    } else if (editingSkillIndex !== null) {
      const updated = localSkills.map((s, i) =>
        i === editingSkillIndex ? { ...s, content: skillContent } : s
      );
      onSaveSkills(updated);
      setTimeout(() => loadSkillsFromDir(), 800);
    }
    setSkillHasUnsavedChanges(false);
  }, [onSaveSkills, editingSkillIsNew, editingSkillIndex, skillContent, localSkills, loadSkillsFromDir]);

  // Auto-save skill after 1.5s
  useEffect(() => {
    if (!skillHasUnsavedChanges || !skillContent.trim()) return;
    if (skillAutoSaveTimerRef.current) clearTimeout(skillAutoSaveTimerRef.current);
    skillAutoSaveTimerRef.current = setTimeout(() => { handleSkillSave(); }, 1500);
    return () => { if (skillAutoSaveTimerRef.current) clearTimeout(skillAutoSaveTimerRef.current); };
  }, [skillContent, skillHasUnsavedChanges, handleSkillSave]);

  // Ctrl/Cmd+S for skill save
  useEffect(() => {
    if (editingSkillIndex === null && !editingSkillIsNew) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (skillHasUnsavedChanges && skillContent.trim()) handleSkillSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingSkillIndex, editingSkillIsNew, skillHasUnsavedChanges, skillContent, handleSkillSave]);

  const handleSkillFileContent = useCallback((content: string, fileName: string) => {
    const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/) || content.match(/^#\s+(.+)$/m);
    const name = nameMatch?.[1]?.trim() || fileName.replace(/\.md$/i, '');
    const normalizedContent = content.trim();

    if (onTabChange) {
      if (onSaveSkills) {
        onSaveSkills([...localSkills, { name, content: normalizedContent }]);
        setTimeout(() => loadSkillsFromDir(), 800);
      }
      return;
    }

    setEditingSkillIndex(null);
    setEditingSkillIsNew(true);
    setSkillContent(normalizedContent);
    setSkillHasUnsavedChanges(true);
  }, [onSaveSkills, onTabChange, localSkills, loadSkillsFromDir]);

  const handleSkillDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setSkillDragOver(false);
    if (!e.dataTransfer.files?.length) return;
    const file = e.dataTransfer.files[0];
    if (!file.name.endsWith('.md') && file.type !== 'text/markdown' && file.type !== 'text/plain') return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleSkillFileContent(reader.result, file.name);
      }
    };
    reader.readAsText(file);
  }, [handleSkillFileContent]);

  const handleSkillPaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files?.length) {
      const file = files[0];
      if (file.name.endsWith('.md') || file.type === 'text/markdown' || file.type === 'text/plain') {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            handleSkillFileContent(reader.result, file.name);
          }
        };
        reader.readAsText(file);
        return;
      }
    }
    const text = e.clipboardData?.getData('text/plain');
    if (text && text.includes('---') && text.includes('name:')) {
      e.preventDefault();
      handleSkillFileContent(text, 'pasted-skill');
    }
  }, [handleSkillFileContent]);


  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const isResizing = useRef(false);

  // MCP Servers state
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpError, setMcpError] = useState('');
  const [mcpPolling, setMcpPolling] = useState(false);
  const mcpServerCountRef = useRef(0);
  const [newMcpInput, setNewMcpInput] = useState('');
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [discoveringServerId, setDiscoveringServerId] = useState<string | null>(null);
  // mcpToDelete can be used for deletion confirmation dialog if needed
  const [, setMcpToDelete] = useState<McpServer | null>(null);
  // Delete errors are scoped to the server row that failed (not the add form)
  const [mcpDeleteError, setMcpDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [newMcpEnv, setNewMcpEnv] = useState('');


  // Sync local folder path and project name when project changes
  useEffect(() => {
    setLocalFolderPath(currentProjectData?.folder_path || '');
    setLocalProjectName(selectedProject?.name || '');
  }, [currentProjectData?.folder_path, selectedProject?.id, selectedProject?.name]);

  // Resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(800, Math.max(280, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // Reset transient editing/form state when switching projects
  useEffect(() => {
    setEditingSkillIndex(null);
    setEditingSkillIsNew(false);
    setSkillContent('');
    setSkillHasUnsavedChanges(false);
    setSkillSearchQuery('');
    setNewMcpInput('');
    setNewMcpEnv('');
    setIsAddingMcp(false);
    setMcpError('');
    setUploadError('');
  }, [selectedProject?.id]);



  // Local state for documents being uploaded/processed (not yet in currentProjectData)
  const [uploadingDocs, setUploadingDocs] = useState<any[]>([]);
  const [directoryFiles, setDirectoryFiles] = useState<any[]>([]);

  // Load pending/processing uploads from SQLite when project changes so they survive navigation
  useEffect(() => {
    if (!selectedProject?.id) { setUploadingDocs([]); setProcessingDocs(new Map()); return; }
    storageService.getDocumentsByProject(selectedProject.id).then(docs => {
      if (docs.length > 0) {
        setUploadingDocs(docs.map((d: any) => ({ id: d.id, name: d.filename, source: d.filename })));
        setProcessingDocs(new Map(docs.map((d: any) => [d.id, d.status])));
      } else {
        setUploadingDocs([]);
        setProcessingDocs(new Map());
      }
    });
  }, [selectedProject?.id]);

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
    const folderPath = currentProjectData?.folder_path;
    const projectId = selectedProject?.id;
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
  }, [currentProjectData?.folder_path, selectedProject?.id]);

  // Standalone refresh for documents (called on tab switch)
  const refreshDocuments = useCallback(() => {
    const projectId = selectedProject?.id;
    const folderPath = currentProjectData?.folder_path;
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
  }, [selectedProject?.id, currentProjectData?.folder_path]);

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

    return [...merged, ...pending];
  }, [apiDocuments, uploadingDocs, directoryFiles, fsToApiMap]);

  // Load MCP servers from project data
  useEffect(() => {
    if (Array.isArray(currentProjectData?.mcp)) {
      setMcpServers((currentProjectData.mcp as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__'));
    } else {
      setMcpServers([]);
    }
  }, [currentProjectData?.mcp]);

  // Listen for MCP authorization callback from Electron
  useEffect(() => {
    const electronWindow = window as any;
    if (electronWindow.electronAPI?.onMcpAuthCallback) {
      electronWindow.electronAPI.onMcpAuthCallback(async (data: { serverId?: string; error?: string }) => {
        console.log('[MCP Auth] Callback received:', data);
        if (data.error) {
          setMcpError(data.error);
        } else if (data.serverId && selectedProject?.id) {
          console.log('[MCP Auth] Server authorized, refreshing list...');
          loadMcpServers();
        }
      });

      return () => {
        electronWindow.electronAPI?.removeMcpAuthCallbackListener?.();
      };
    }
  }, [selectedProject?.id]);

  const loadMcpServers = useCallback(async () => {
    if (!selectedProject?.id) return;

    try {
      const result = await mcpServerService.getMcpServers(selectedProject.id);
      if (result.success && result.data) {
        const apiServers = (result.data as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__');
        setMcpServers(prev => {
          const systemServers = prev.filter(s => !!(s as any).system);
          const apiIds = new Set(apiServers.map(s => s.id));
          const missingSystem = systemServers.filter(s => !apiIds.has(s.id));
          const servers = [...apiServers, ...missingSystem];
          if (mcpPolling && servers.length > mcpServerCountRef.current) {
            setMcpPolling(false);
            setMcpError('');
          }
          return servers;
        });
      }
    } catch (error: any) {
      // silent during polling
      if (!mcpPolling) {
        setMcpError(error.message || 'An error occurred');
      }
    }
  }, [selectedProject?.id, mcpPolling]);

  // Poll for new MCP servers while waiting (OAuth flow)
  useEffect(() => {
    if (!mcpPolling || !selectedProject?.id) return;

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
  }, [mcpPolling, selectedProject?.id, loadMcpServers]);

  // Poll for tool discovery after adding a server
  useEffect(() => {
    if (!discoveringServerId || !selectedProject?.id) return;

    let attempts = 0;
    const maxAttempts = 20; // ~30s

    const interval = setInterval(async () => {
      attempts++;
      try {
        const result = await mcpServerService.getMcpServers(selectedProject.id);
        if (result.success && result.data) {
          const apiServers = (result.data as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__');
          setMcpServers(prev => {
            const systemServers = prev.filter(s => !!(s as any).system);
            const apiIds = new Set(apiServers.map(s => s.id));
            const missingSystem = systemServers.filter(s => !apiIds.has(s.id));
            return [...apiServers, ...missingSystem];
          });
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
  }, [discoveringServerId, selectedProject?.id]);

  const isRemoteMcpInput = (input: string): boolean => {
    const trimmed = input.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  };

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

  const handleAddMcpServer = async () => {
    const input = newMcpInput.trim();
    if (!selectedProject?.id || !input) return;

    setIsAddingMcp(true);
    setMcpError('');

    try {
      if (isRemoteMcpInput(input)) {
        console.log('[MCP] Registering remote server:', input);

        const result = await mcpServerService.registerMcpServer(
          selectedProject.id,
          {
            server_type: 'remote',
            server_url: input,
            return_url: 'smartloop://mcp-authorization',
          }
        );

        if (!result.success || !result.data) {
          setMcpError(result.error || 'Failed to register MCP server');
          return;
        }

        const data = result.data as Record<string, any>;

        if (data.auth_type === 'oauth' && data.auth_url) {
          setNewMcpInput('');
          mcpServerCountRef.current = mcpServers.length;
          setMcpPolling(true);

          console.log('[MCP] OAuth flow - opening auth URL:', data.auth_url);
          const electronWindow = window as any;
          if (electronWindow.electronAPI?.openExternal) {
            electronWindow.electronAPI.openExternal(data.auth_url);
          } else {
            window.open(data.auth_url, '_blank');
          }
        } else {
          console.log('[MCP] Server registered successfully');
          const serverId = data.id || data.server_id;
          if (serverId) {
            await persistMcpServerToDb({
              id: serverId,
              project_id: selectedProject.id,
              name: data.name || input,
              server_type: 'remote',
              config: { server_url: input },
            });
          }
          setNewMcpInput('');
          await loadMcpServers();
          if (serverId) {
            setDiscoveringServerId(serverId);
          }
        }
      } else {
        console.log('[MCP] Registering local server:', input);

        const env: Record<string, string> = {};
        if (newMcpEnv.trim()) {
          for (const line of newMcpEnv.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
              env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
            }
          }
        }

        const result = await mcpServerService.registerMcpServer(
          selectedProject.id,
          {
            server_type: 'local',
            command: 'uvx',
            args: [input],
            name: input,
            env,
          }
        );

        if (result.success) {
          const resData = result.data as Record<string, any>;
          const serverId = resData?.id || resData?.server_id;
          if (serverId) {
            await persistMcpServerToDb({
              id: serverId,
              project_id: selectedProject.id,
              name: input,
              server_type: 'local',
              config: { command: 'uvx', args: [input], env },
            });
          }
          setNewMcpInput('');
          setNewMcpEnv('');
          await loadMcpServers();
          if (serverId) {
            setDiscoveringServerId(serverId);
          }
        } else {
          setMcpError(result.error || 'Failed to add local MCP server');
        }
      }
    } catch (error: any) {
      console.error('[MCP] Error adding server:', error);
      setMcpError(error.message || 'An error occurred');
    } finally {
      setIsAddingMcp(false);
    }
  };

  const handleDeleteMcpServer = async (server: McpServer) => {
    if (!selectedProject?.id || !server.id) return;

    setMcpDeleteError(null);
    try {
      const result = await mcpServerService.deleteMcpServer(selectedProject.id, server.id);
      if (result.success) {
        setMcpServers(prev => prev.filter(s => s.id !== server.id));
        setMcpToDelete(null);
        // Remove from local storage + SQLite
        await mcpServerService.removeMcpServerFromStorage(selectedProject.id, server.id);
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


  const validateFile = (file: File): boolean => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Supported: PDF, DOCX, TXT');
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
      currentProjectData?.folder_path,
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
    if (!selectedProject) {
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

    const projectId = selectedProject.id;

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
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };


  return (
    <Box
      className="relative"
      sx={{
        width: { xs: '0', md: activeSection ? `${sidebarWidth}px` : '48px' },
        minWidth: { xs: '0', md: activeSection ? '280px' : '48px' },
        maxWidth: { xs: '0', md: activeSection ? '800px' : '48px' },
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'row',
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
        borderLeft: '1px solid',
        borderColor: 'var(--sl-border-default)',
      }}
    >
      {/* Resize Handle */}
      {activeSection && (
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            width: '4px',
            cursor: 'col-resize',
            flexShrink: 0,
            bgcolor: 'transparent',
            transition: 'background-color 0.15s ease',
            '&:hover': {
              bgcolor: 'var(--sl-brand-alpha-30)',
            },
          }}
        />
      )}
      {/* Content Area */}
      {activeSection && (
        <Box
          className="flex-1 overflow-y-auto p-3 space-y-4 sidebar-scroll"
          sx={{
            opacity: activeSection ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Section Title */}
          <Box className="flex items-center justify-between pb-3 mb-2" sx={{ borderBottom: '1px solid var(--sl-border-subtle)' }}>
            <span className="text-[10px] font-medium text-sl-text-disabled uppercase tracking-wider">
              {activeSection === 'documents' ? 'Documents' : activeSection === 'mcp' ? 'MCP Servers' : activeSection === 'skills' ? 'Skills' : activeSection === 'settings' ? 'Project Settings' : ''}
            </span>
          </Box>


          {/* Documents Section */}
          {activeSection === 'documents' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {selectedProject ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {uploadError && (
                    <Box className="text-red-400 text-xs px-2 py-1">{uploadError}</Box>
                  )}

                  {/* Drop zone */}
                  <Box
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      borderRadius: '8px',
                      border: `1px dashed ${isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-border-subtle)'}`,
                      bgcolor: isDragging ? 'var(--sl-brand-alpha-10)' : 'transparent',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      gap: 0.75,
                      py: 4,
                      px: 3,
                      '&:hover': {
                        borderColor: 'var(--sl-brand-primary)',
                        bgcolor: 'var(--sl-brand-alpha-5)',
                      },
                    }}
                  >
                    <CloudUploadOutlinedIcon sx={{
                      fontSize: 24,
                      color: isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)',
                    }} />
                    <span className="text-[12px] text-sl-text-muted font-medium">
                      {isDragging ? 'Drop files here' : 'Drop files or click to add'}
                    </span>
                    <span className="flex items-center gap-1.5 mt-1">
                      {['PDF', 'DOCX', 'TXT'].map((type) => (
                        <span
                          key={type}
                          className="text-[9px] font-medium tracking-wide px-2 py-0.5 rounded"
                          style={{
                            color: 'var(--sl-text-muted)',
                            backgroundColor: 'var(--sl-white-alpha-7)',
                            border: '1px solid var(--sl-border-subtle)',
                          }}
                        >
                          {type}
                        </span>
                      ))}
                    </span>
                  </Box>

                  {/* Document List — file-tree style with summary */}
                  {effectiveDocuments.length > 0 && (
                    <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column' }}>
                      {effectiveDocuments
                        .filter((doc: any) => {
                          if (!searchQuery) return true;
                          const query = searchQuery.toLowerCase();
                          const filename = ((doc.source || doc.path || '').split('/').pop() || doc.filename || doc.name || '').toLowerCase();
                          return filename.includes(query);
                        })
                        .map((doc: any, i: number) => {
                          const rowId = doc.id || `doc-${i}`;
                          // Use filesystem file info when available for original name/size
                          const fsFile = doc._fsFile;
                          const rawName = fsFile?.name
                            || doc.filename || doc.name
                            || (doc.source || doc.path || '').split('/').pop()
                            || '';
                          const filename = rawName ? (rawName.replace(/\.[^/.]+$/, '') || 'Untitled') : 'Untitled';
                          const ext = rawName.match(/\.([^/.]+)$/)?.[1]?.toUpperCase() || '';
                          const fileSize = fsFile?.size || doc.size || doc.file_size;
                          const fileSizeLabel = fileSize != null
                            ? fileSize >= 1024 * 1024 ? `${(fileSize / 1024 / 1024).toFixed(1)} MB` : `${(fileSize / 1024).toFixed(0)} KB`
                            : null;
                          const isFsOnly = typeof doc.id === 'string' && doc.id.startsWith('fs-');
                          const docIndexStatus = indexingStatus[doc.id];
                          const isIndexing = docIndexStatus === 'indexing';
                          const converting = docIndexStatus === 'converting';
                          const isProcessing = processingDocs.has(doc.id) || isIndexing || converting;

                          const rawSummary = !isProcessing
                            ? (doc.markdown
                              ? (() => {
                                // Extract first non-empty paragraph from markdown
                                const para = doc.markdown
                                  .replace(/^---[\s\S]*?---\n?/, '')
                                  .split(/\n{2,}/)
                                  .map((p: string) => p.replace(/^#{1,6}\s+/gm, '').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`[^`]*`/g, '').replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[([^\]]+)\]\(.*?\)/g, '$1').replace(/^\s*[-*+>]\s*/gm, '').replace(/\s+/g, ' ').trim())
                                  .find((p: string) => p.length > 20);
                                return para || null;
                              })()
                              : null)
                            : "document is being processed";
                          const summary = rawSummary
                            ? rawSummary.trim().slice(0, 120)
                            : null;
                          return (
                            <Box
                              key={rowId}
                              onMouseEnter={() => setHoveredDocId(rowId)}
                              onMouseLeave={() => setHoveredDocId(null)}
                              onClick={() => {
                                const filePath = doc._fsFile?.path || doc.source || doc.path;
                                if (filePath && window.electronAPI?.showItemInFolder) {
                                  window.electronAPI.showItemInFolder(filePath);
                                }
                              }}
                              sx={{
                                px: 1,
                                py: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                gap: 0.75,
                                transition: 'background 0.1s ease',
                                border: '1px solid var(--sl-border-subtle)',
                                borderRadius: '6px',
                                mb: 0.75,
                                '&:hover': { bgcolor: 'var(--sl-bg-surface-1)' },
                              }}
                            >
                              <InsertDriveFileIcon sx={{ fontSize: 11, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '2px' }} />
                              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <span className="text-[11px] text-sl-text-tertiary truncate flex-1">
                                    {filename}
                                  </span>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc); }}
                                    sx={{
                                      color: 'var(--sl-text-faint)',
                                      padding: '2px',
                                      '&:hover': { color: 'var(--sl-status-error)' },
                                    }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                                  </IconButton>
                                </Box>
                                {!isProcessing && summary && (
                                  <span className="text-[10px] text-sl-text-disabled" style={{ lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                                    {summary}
                                  </span>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                  {ext && (
                                    <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-bg-surface-1)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>
                                      {ext}
                                    </span>
                                  )}
                                  {fileSizeLabel && (
                                    <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)' }}>{fileSizeLabel}</span>
                                  )}
                                  {(() => {
                                    const status = isFsOnly ? 'local' : (docIndexStatus || 'pending');
                                    if (status === 'indexed') {
                                      const processedAt = processedDates[doc.id];
                                      let timeLabel = 'Indexed';
                                      if (processedAt) {
                                        const diffMs = Date.now() - new Date(processedAt).getTime();
                                        const diffMin = Math.floor(diffMs / 60000);
                                        const diffHr = Math.floor(diffMin / 60);
                                        const diffDay = Math.floor(diffHr / 24);
                                        if (diffMin < 1) timeLabel = 'Just now';
                                        else if (diffMin < 60) timeLabel = `${diffMin}m ago`;
                                        else if (diffHr < 24) timeLabel = `${diffHr}h ago`;
                                        else if (diffDay < 30) timeLabel = `${diffDay}d ago`;
                                        else timeLabel = new Date(processedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                      }
                                      return (
                                        <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)' }}>
                                          {timeLabel}
                                        </span>
                                      );
                                    }
                                    const statusBg: Record<string, string> = {
                                      local: 'rgba(139,139,245,0.12)',
                                      indexing: 'rgba(250,204,21,0.12)',
                                      converting: 'rgba(250,204,21,0.12)',
                                      processing: 'rgba(250,204,21,0.12)',
                                      pending: 'rgba(148,163,184,0.1)',
                                      unknown: 'rgba(148,163,184,0.1)',
                                      failed: 'rgba(248,113,113,0.12)',
                                      error: 'rgba(248,113,113,0.12)',
                                    };
                                    const label = status === 'failed' || status === 'error' ? 'Failed' : status === 'unknown' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1);
                                    return (
                                      <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: statusBg[status] || statusBg.pending, borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>
                                        {label}
                                      </span>
                                    );
                                  })()}

                                </Box>
                              </Box>
                            </Box>
                          );
                        })}
                    </Box>
                  )}
                </div>
              ) : (
                <Box className="text-sl-text-disabled text-xs py-4 text-center">
                  Select a project to view documents
                </Box>
              )}
            </div>
          )}

          {/* MCP Servers Section */}
          {activeSection === 'mcp' && (
            <div className="space-y-3">
              {/* Add MCP Server Form - Always Visible */}
              <Box
                sx={{
                  padding: '10px',
                  borderRadius: '6px',
                  bgcolor: 'var(--sl-white-alpha-5)',
                  border: '1px solid var(--sl-border-subtle)',
                }}
              >
                <TextField
                  size="small"
                  placeholder="URL or package name"
                  value={newMcpInput}
                  onChange={(e) => {
                    setNewMcpInput(e.target.value);
                    if (mcpError) setMcpError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAddingMcp && newMcpInput.trim()) {
                      handleAddMcpServer();
                    }
                  }}
                  disabled={isAddingMcp}
                  fullWidth
                  InputProps={{
                    endAdornment: isAddingMcp ? (
                      <InputAdornment position="end">
                        <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'var(--sl-white-alpha-5)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'var(--sl-border-subtle)' },
                      '&:hover fieldset': { borderColor: 'var(--sl-brand-alpha-30)' },
                      '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
                    },
                    '& .MuiInputBase-input': {
                      color: 'var(--sl-text-primary)',
                      padding: '8px 12px',
                      '&::placeholder': { color: 'var(--sl-text-muted)', opacity: 1 },
                    },
                  }}
                />
                {/* Fixed-height slot so swapping hint ↔ error never shifts the UI */}
                <Box className="text-[10px] mt-1 px-1" sx={{ minHeight: '58px' }}>
                  {mcpError ? (
                    <span className="text-red-400 whitespace-pre-line break-words">{mcpError}</span>
                  ) : (
                    <span className="text-sl-text-disabled">
                      Enter the url of the MCP server <br />(e.g., https://mcp.example.com) <br />or package name (e.g., yahoo-finance-mcp) <br />— Press Enter to add
                    </span>
                  )}
                </Box>
              </Box>

              {mcpServers.length > 0 && (
                <Box sx={{ mt: 0 }}>
                  {mcpServers.map((server, index) => {
                    const isSystem = !!(server as any).system;
                    return (
                      <McpServerItem
                        key={server.id || `mcp-${index}`}
                        server={server}
                        projectId={selectedProject?.id || ''}
                        onDelete={handleDeleteMcpServer}
                        discovering={discoveringServerId === server.id}
                        isSystem={isSystem}
                        deleteError={mcpDeleteError?.id === server.id ? mcpDeleteError.message : ''}
                        onServerUpdate={(updatedServer) => {
                          setMcpServers(prev => {
                            const newServers = prev.map(s =>
                              s.id === updatedServer.id ? updatedServer : s
                            );
                            if (selectedProject?.id) {
                              mcpServerService.saveMcpServersToStorage(selectedProject.id, newServers);
                            }
                            return newServers;
                          });
                        }}
                      />
                    );
                  })}
                </Box>
              )}

              {/* Help Text */}
              <p className="text-sl-text-disabled text-[10px] leading-relaxed mt-4">
                MCP (Model Context Protocol) servers extend the capabilities of your assistant by providing additional tools and resources.
              </p>
            </div>
          )}

          {/* Skills Section */}
          {activeSection === 'skills' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setSkillDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setSkillDragOver(false); }}
              onDrop={handleSkillDrop}
              onPaste={handleSkillPaste}
            >
              {(editingSkillIndex !== null || editingSkillIsNew) ? (
                /* Editing existing skill */
                <div>
                  <Box className="flex items-center gap-2 mb-3">
                    <IconButton
                      size="small"
                      onClick={() => { setEditingSkillIndex(null); setEditingSkillIsNew(false); setSkillHasUnsavedChanges(false); }}
                      sx={{ color: 'var(--sl-text-muted)', padding: '4px' }}
                    >
                      <ArrowBackIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <span className="text-xs text-sl-text-primary font-medium truncate">
                      {editingSkillIsNew ? 'New Skill' : (localSkills[editingSkillIndex!]?.name || 'Untitled Skill')}
                    </span>
                    {skillHasUnsavedChanges && (
                      <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />
                    )}
                  </Box>
                  <Box className="markdown-editor-container" sx={{
                    '& .EasyMDEContainer': { border: 'none' },
                    '& .CodeMirror': { bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)', borderRadius: '6px', color: 'var(--sl-text-primary)' },
                    '& .editor-toolbar': { borderColor: 'var(--sl-border-default)' },
                  }}>
                    <SimpleMDE
                      value={skillContent}
                      onChange={(value) => { setSkillContent(value); setSkillHasUnsavedChanges(true); }}
                      options={skillEditorOptions}
                    />
                  </Box>
                  <Box sx={{ fontSize: '10px', color: 'var(--sl-text-faint)', mt: 1, textAlign: 'right' }}>Markdown &middot; auto-saves</Box>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Quick-add textarea */}
                  <Box sx={{
                    borderRadius: '6px',
                    border: '1px solid var(--sl-border-subtle)',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease',
                    '&:focus-within': { borderColor: 'var(--sl-brand-primary)' },
                  }}>
                    <Box sx={{ position: 'relative' }}>
                      <textarea
                        value={skillSearchQuery}
                        onChange={(e) => setSkillSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && skillSearchQuery.trim()) {
                            e.preventDefault();
                            if (onSaveSkills) {
                              const content = skillSearchQuery.trim();
                              const heading = content.match(/^#\s+(.+)$/m);
                              const name = heading?.[1]?.trim() || content.split('\n')[0].slice(0, 40);
                              setPendingSkill({ baselineCount: localSkills.length, content });
                              onSaveSkills([...localSkills, { name, content }]);
                              setSkillSearchQuery('');
                              setTimeout(() => loadSkillsFromDir(), 800);
                            }
                          }
                        }}
                        rows={5}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: 'var(--sl-text-primary)',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          padding: '8px 10px',
                          resize: 'vertical',
                          minHeight: '60px',
                        }}
                      />
                      {!skillSearchQuery && (
                        <div className="absolute top-2 left-[10px] right-[10px] pointer-events-none text-[11px] font-mono leading-relaxed opacity-50 text-sl-text-muted">
                          Write a new skill in Markdown and press{' '}
                          <SubdirectoryArrowLeftIcon sx={{ fontSize: 11, verticalAlign: 'middle' }} />{' '}
                          to add. Skills are snippets of content that are injected into the assistant's context
                        </div>
                      )}
                    </Box>
                    <Box className="flex items-center justify-between px-2 py-1.5" sx={{ borderTop: '1px solid var(--sl-border-subtle)' }}>
                      <span className="text-[9px] text-sl-text-faint">Markdown</span>
                      <button
                        onClick={() => {
                          if (onSaveSkills && skillSearchQuery.trim()) {
                            const content = skillSearchQuery.trim();
                            const heading = content.match(/^#\s+(.+)$/m);
                            const name = heading?.[1]?.trim() || content.split('\n')[0].slice(0, 40);
                            setPendingSkill({ baselineCount: localSkills.length, content });
                            onSaveSkills([...localSkills, { name, content }]);
                            setSkillSearchQuery('');
                            setTimeout(() => loadSkillsFromDir(), 800);
                          }
                        }}
                        disabled={!skillSearchQuery.trim()}
                        className="text-[10px] px-2.5 py-0.5 rounded text-sl-text-disabled disabled:opacity-30 disabled:cursor-default transition-colors"
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sl-brand-light)'; e.currentTarget.style.backgroundColor = 'var(--sl-brand-alpha-10)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = ''; e.currentTarget.style.backgroundColor = ''; }}
                      >
                        Add <SubdirectoryArrowLeftIcon sx={{ fontSize: 11, verticalAlign: 'middle', ml: '2px' }} />
                      </button>
                    </Box>
                  </Box>

                  {/* Skill List */}
                  {(localSkills.length > 0 || savingSkill) && (
                    <Box sx={{ mt: 3 }}>
                      <Box sx={{
                        border: '1px solid var(--sl-border-subtle)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}>
                        {savingSkill && (
                          <Box sx={{
                            padding: '4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            borderBottom: localSkills.length > 0 ? '1px solid var(--sl-border-subtle)' : 'none',
                            bgcolor: 'var(--sl-brand-alpha-10)',
                          }}>
                            <CircularProgress size={11} sx={{ color: 'var(--sl-brand-primary)', flexShrink: 0 }} />
                            <span className="text-[11px] text-sl-text-muted">Adding skill…</span>
                          </Box>
                        )}
                        {localSkills.map((skill, index) => (
                          <Box
                            key={`skill-${index}`}
                            onMouseEnter={() => setHoveredSkillIndex(index)}
                            onMouseLeave={() => setHoveredSkillIndex(null)}
                            onClick={() => {
                              if (onTabChange) {
                                onTabChange({ id: `skill-${skill.id || index}`, type: 'skill', title: skill.name || 'Untitled Skill', data: { index } });
                              } else {
                                setEditingSkillIndex(index);
                                setEditingSkillIsNew(false);
                                setSkillContent(skill.content || '');
                                setSkillHasUnsavedChanges(false);
                              }
                            }}
                            sx={{
                              padding: '6px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 0.75,
                              transition: 'background 0.1s ease, color 0.1s ease',
                              borderBottom: '1px solid var(--sl-border-subtle)',
                              '&:last-child': { borderBottom: 'none' },
                              '&:hover': {
                                bgcolor: 'var(--sl-brand-alpha-10)',
                              },
                            }}
                          >
                            <ConstructionIcon sx={{ fontSize: 11, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '2px' }} />
                            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span className="text-[11px] text-sl-text-tertiary truncate">
                                {skill.name || 'Untitled'}
                              </span>
                              {getSkillPreviewText(skill.content || '', skill.description) && (
                                <span
                                  className="text-[10px] text-sl-text-disabled"
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical' as const,
                                    overflow: 'hidden',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.35,
                                  }}
                                >
                                  {getSkillPreviewText(skill.content || '', skill.description)}
                                </span>
                              )}
                            </Box>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSaveSkills) {
                                  onSaveSkills(localSkills.filter((_, i) => i !== index));
                                  setTimeout(() => loadSkillsFromDir(), 800);
                                }
                              }}
                              sx={{
                                color: 'var(--sl-text-faint)',
                                padding: '2px',
                                mt: '-2px',
                                '&:hover': { color: 'var(--sl-status-error)' },
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Drop hint */}
                  {skillDragOver && (
                    <Box sx={{
                      mt: 1,
                      padding: '12px',
                      borderRadius: '4px',
                      border: '1px dashed var(--sl-brand-primary)',
                      bgcolor: 'var(--sl-brand-alpha-10)',
                      textAlign: 'center',
                    }}>
                      <span className="text-[10px]" style={{ color: 'var(--sl-brand-light)' }}>Drop .md file to add as skill</span>
                    </Box>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Project Settings Section */}
          {activeSection === 'settings' && selectedProject && currentProjectData && (
            <div className="space-y-6">
              {/* Project Name */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Project Name</div>
                <TextField
                  size="small"
                  value={localProjectName}
                  onChange={(e) => setLocalProjectName(e.target.value)}
                  onBlur={() => {
                    const trimmed = localProjectName.trim();
                    if (trimmed && trimmed !== selectedProject?.name) {
                      onRenameProject?.(trimmed);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = localProjectName.trim();
                      if (trimmed && trimmed !== selectedProject?.name) {
                        onRenameProject?.(trimmed);
                      }
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Project name"
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'var(--sl-bg-surface-1)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'var(--sl-border-default)' },
                      '&:hover fieldset': { borderColor: 'var(--sl-brand-alpha-30)' },
                      '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
                    },
                    '& .MuiInputBase-input': {
                      color: 'var(--sl-text-primary)',
                      padding: '8px 12px',
                      '&::placeholder': { color: 'var(--sl-text-muted)', opacity: 1 },
                    },
                  }}
                />
                <div className="text-[10px] text-sl-text-faint mt-1">Press Enter to save</div>
              </div>

              {/* Project Color */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Label Color</div>
                <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map((color: any) => (
                    <Box
                      key={color.value}
                      onClick={() => onColorChange?.(color.value)}
                      sx={{
                        borderRadius: '6px',
                        bgcolor: color.value,
                        cursor: 'pointer',
                        flex: '1 1 auto',
                        aspectRatio: '1',
                        border: (selectedProject?.color || currentProjectData?.color) === color.value ? '2px solid var(--sl-brand-primary)' : '2px solid transparent',
                        boxShadow: (selectedProject?.color || currentProjectData?.color) === color.value ? '0 0 0 2px var(--sl-brand-alpha-20)' : 'none',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          boxShadow: '0 0 0 2px var(--sl-brand-alpha-30)',
                        },
                      }}
                      title={color.name}
                    />
                  ))}
                </Box>
              </div>

              {/* Working Directory */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Working Directory</div>
                <Box
                  onClick={() => {
                    const path = localFolderPath || `~/smartloop/${(selectedProject?.name || 'project').toLowerCase().replace(/\s+/g, '_')}`;
                    (window as any).electronAPI?.openInFinder?.(path);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--sl-bg-surface-1)',
                    border: '1px solid var(--sl-border-default)',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'var(--sl-bg-surface-1)',
                      borderColor: 'var(--sl-brand-alpha-30)',
                    },
                  }}
                >
                  <FolderOpenIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)', flexShrink: 0 }} />
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--sl-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {localFolderPath || `~/smartloop/${(selectedProject?.name || 'project').toLowerCase().replace(/\s+/g, '_')}`}
                  </span>
                </Box>
                <p className="text-sl-text-disabled text-[10px] leading-relaxed mt-1 px-1">
                  Click to open in Finder. Sent as working directory (<code>cwd</code>) with each chat message.
                </p>
              </div>

              {/* Share Project — not available for the general/system project */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Share</div>
                <Box
                  onClick={async () => {
                    if (exporting || selectedProject?.system || !selectedProject?.id) return;
                    setExporting(true);
                    setExportDone(false);
                    try {
                      const result = await (window as any).electronAPI.exportProject(selectedProject.id);
                      if (result?.success) {
                        setExportDone(true);
                        setTimeout(() => setExportDone(false), 2000);
                      }
                    } catch (err) {
                      console.error('Export failed:', err);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--sl-bg-surface-1)',
                    border: '1px solid var(--sl-border-default)',
                    cursor: (exporting || selectedProject?.system) ? 'not-allowed' : 'pointer',
                    opacity: (exporting || selectedProject?.system) ? 0.5 : 1,
                    '&:hover': {
                      backgroundColor: 'var(--sl-bg-surface-1)',
                      borderColor: (exporting || selectedProject?.system) ? 'var(--sl-border-default)' : 'var(--sl-brand-alpha-30)',
                    },
                  }}
                >
                  {exporting ? (
                    <CircularProgress size={16} sx={{ color: 'var(--sl-text-muted)' }} />
                  ) : exportDone ? (
                    <CheckIcon sx={{ fontSize: 16, color: 'var(--sl-brand-primary)' }} />
                  ) : (
                    <ShareIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
                  )}
                  <span className="text-xs text-[var(--sl-text-primary)]">
                    {exporting ? 'Sharing...' : exportDone ? 'Shared' : (
                      <>Share <span className="text-[var(--sl-text-muted)] bg-[var(--sl-bg-surface-1)] px-1.5 py-0.5 rounded text-[11px]">{selectedProject.name || 'Project'}</span></>
                    )}
                  </span>
                </Box>
                <p className="text-sl-text-disabled text-[10px] leading-relaxed mt-1 px-1">
                  {selectedProject?.system
                    ? 'The general chat project can’t be shared.'
                    : 'Share project and all its contents as a zip file.'}
                </p>
              </div>
            </div>
          )}

        </Box>
      )}

      {/* Vertical Tab Bar on Right Edge */}
      <Box
        sx={{
          width: '48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          gap: 0.5,
        }}
      >
        <Tooltip title="Documents" placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => {
                const next = activeSection === 'documents' ? null : 'documents';
                setActiveSection(next);
                if (next === 'documents') refreshDocuments();
              }}
              sx={{
                color: (activeSection === 'documents' || activeTab === 'document') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              <DescriptionOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="MCP Servers" placement="left">
          <span>
            <IconButton
              onClick={() => {
                setMcpError('');
                const next = activeSection === 'mcp' ? null : 'mcp';
                setActiveSection(next);
                if (next === 'mcp') loadMcpServers();
              }}
              sx={{
                color: (activeSection === 'mcp' || activeTab === 'mcp') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              <PowerOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={"Skills"} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => {
                const next = activeSection === 'skills' ? null : 'skills';
                setActiveSection(next);
                if (next === 'skills') onRefreshSkills?.();
              }}
              sx={{
                color: (activeSection === 'skills' || activeTab === 'skill') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              <ConstructionIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Spacer pushes Settings icon to bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Project Settings gear icon */}
        <Tooltip title="Project Settings" placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => setActiveSection(activeSection === 'settings' ? null : 'settings')}
              sx={{
                color: activeSection === 'settings' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
              }}
              size="small"
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

      </Box>

    </Box>
  );
}
