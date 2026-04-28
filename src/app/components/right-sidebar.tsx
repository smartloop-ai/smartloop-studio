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
import { storageService } from '@/app/services/storage.service';
import McpServerItem from './mcp-server-item';
import SkillCreateDialog from './skill-create-dialog';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { documentService } from '@/app/services/document.service';
import { mcpServerService, McpServer } from '@/app/services/mcp-server.service';
import { PROJECT_COLORS } from '@/app/constants';


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
}

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  onAddDocument: _onAddDocument,
  onDeleteDocument,
  onColorChange,
  onRenameProject,
  activeTab,
  onTabChange,
  projectSkills = [],
  onSaveSkills,
}: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<'documents' | 'mcp' | 'skills' | 'settings' | null>(null);
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

  useEffect(() => {
    if (!pendingSkill) return;
    const appeared =
      projectSkills.length > pendingSkill.baselineCount ||
      projectSkills.some((s) => (s.content || '').trim() === pendingSkill.content.trim());
    if (appeared) setPendingSkill(null);
  }, [projectSkills, pendingSkill]);

  useEffect(() => {
    if (!pendingSkill) return;
    const timeout = setTimeout(() => setPendingSkill(null), 15000);
    return () => clearTimeout(timeout);
  }, [pendingSkill]);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [skillDialogInitialContent, setSkillDialogInitialContent] = useState<string | undefined>();
  const [skillDialogInitialName, setSkillDialogInitialName] = useState<string | undefined>();


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
      onSaveSkills([...projectSkills, { name, content: skillContent }]);
      // Switch from "new" to editing the just-created skill
      setEditingSkillIndex(projectSkills.length);
      setEditingSkillIsNew(false);
    } else if (editingSkillIndex !== null) {
      const updated = projectSkills.map((s, i) =>
        i === editingSkillIndex ? { ...s, content: skillContent } : s
      );
      onSaveSkills(updated);
    }
    setSkillHasUnsavedChanges(false);
  }, [onSaveSkills, editingSkillIsNew, editingSkillIndex, skillContent, projectSkills]);

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
    setSkillDialogInitialContent(content);
    setSkillDialogInitialName(name);
    setSkillDialogOpen(true);
  }, []);

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
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [discoveringServerId, setDiscoveringServerId] = useState<string | null>(null);
  // mcpToDelete can be used for deletion confirmation dialog if needed
  const [, setMcpToDelete] = useState<McpServer | null>(null);
  // Local MCP server state
  const [mcpServerType, setMcpServerType] = useState<'remote' | 'local'>('remote');
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
    setNewMcpName('');
    setNewMcpUrl('');
    setNewMcpEnv('');
    setIsAddingMcp(false);
    setMcpError('');
    setUploadError('');
  }, [selectedProject?.id]);

  // Ensure sidebar is collapsed for system projects or when no project is selected
  useEffect(() => {
    if ((!selectedProject || selectedProject?.system) && (activeSection === 'documents')) {
      setActiveSection(null);
    }
  }, [selectedProject, activeSection]);

  // Local state for documents being uploaded/processed (not yet in currentProjectData)
  const [uploadingDocs, setUploadingDocs] = useState<any[]>([]);
  const [_processedDates, setProcessedDates] = useState<Record<string, string>>({});
  const [directoryFiles, setDirectoryFiles] = useState<any[]>([]);

  // Load processed dates when project changes
  useEffect(() => {
    if (!selectedProject?.id) { setProcessedDates({}); return; }
    const load = async () => {
      const dates = await storageService.getDocumentStatusByProject(selectedProject.id);
      setProcessedDates(dates);
    };
    load();
  }, [selectedProject?.id]);

  // Clear uploading docs when project changes
  useEffect(() => {
    setUploadingDocs([]);
  }, [selectedProject?.id]);

  // Local copy of API documents, refreshed periodically
  const [apiDocuments, setApiDocuments] = useState<any[]>([]);
  // Per-document indexing status: doc id → status string
  // Populated from SQLite (persisted) + live indexing events from chat.tsx health poll
  const [indexingStatus, setIndexingStatus] = useState<Record<string, string>>({});

  // Periodically scan directory and refresh API documents
  useEffect(() => {
    const folderPath = currentProjectData?.folder_path;
    const projectId = selectedProject?.id;
    if (!projectId) { setApiDocuments([]); setDirectoryFiles([]); setIndexingStatus({}); return; }

    let cancelled = false;

    const scanDir = () => {
      if (!folderPath || !window.electronAPI?.listDirectory) return;
      window.electronAPI.listDirectory(folderPath).then((result) => {
        if (!cancelled && result.success) setDirectoryFiles(result.files);
      });
    };

    const refreshApi = () => {
      documentService.getLocalDocuments(projectId).then((result) => {
        if (!cancelled && result.success && result.data) {
          const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
          setApiDocuments(docs);
          const apiStatus: Record<string, string> = {};
          for (const doc of docs) {
            if (!doc.id) continue;
            const status = doc.status ?? doc.indexing_status ?? doc.state ?? '';
            if (status === 'indexed' || !!doc.summary) {
              apiStatus[doc.id] = 'indexed';
              storageService.setDocumentProcessed(doc.id, projectId);
            } else if (status) {
              apiStatus[doc.id] = status;
            }
          }
          if (Object.keys(apiStatus).length > 0) {
            setIndexingStatus(prev => ({ ...prev, ...apiStatus }));
          }
        }
      });
    };

    // Load indexed status from SQLite
    const loadIndexedFromDb = async () => {
      const dates = await storageService.getDocumentStatusByProject(projectId);
      if (!cancelled) {
        const statusMap: Record<string, string> = {};
        for (const docId of Object.keys(dates)) {
          statusMap[docId] = 'indexed';
        }
        setIndexingStatus(statusMap);
      }
    };

    // Initial load
    scanDir();
    refreshApi();
    loadIndexedFromDb();

    // Listen for live indexing status updates from chat.tsx health poll
    const onIndexingUpdate = (e: any) => {
      const detail = e.detail;
      if (detail?.projectId !== projectId) return;
      const docs: Record<string, string> = detail.documents || {};
      if (!cancelled) {
        setIndexingStatus((prev) => {
          // Check if any doc just transitioned to 'indexed' — refresh API to get summaries
          let newlyIndexed = false;
          for (const [id, status] of Object.entries(docs)) {
            if (status === 'indexed' && prev[id] !== 'indexed') {
              newlyIndexed = true;
              storageService.setDocumentProcessed(id, projectId);
            }
          }
          if (newlyIndexed) refreshApi();
          return { ...prev, ...docs };
        });
      }
    };
    window.addEventListener('indexingStatusUpdate', onIndexingUpdate);

    // Refresh on explicit events (upload, delete, processing complete)
    const handler = () => { scanDir(); refreshApi(); loadIndexedFromDb(); };
    window.addEventListener('documentProcessingComplete', handler);
    window.addEventListener('documentUploaded', handler);

    return () => {
      cancelled = true;
      window.removeEventListener('indexingStatusUpdate', onIndexingUpdate);
      window.removeEventListener('documentProcessingComplete', handler);
      window.removeEventListener('documentUploaded', handler);
    };
  }, [currentProjectData?.folder_path, selectedProject?.id]);

  // Merge directory files with converted API documents and uploading placeholders
  const effectiveDocuments = useMemo(() => {
    const serverDocs: any[] = apiDocuments;
    const serverIds = new Set(serverDocs.map((d: any) => d.id));
    const pending = uploadingDocs.filter((d: any) => !serverIds.has(d.id));

    // If no directory files, fall back to API docs + pending uploads
    if (directoryFiles.length === 0) {
      return [...serverDocs, ...pending];
    }

    // Build lookup: base name (without extension) → converted doc
    const baseName = (name: string) => name.replace(/\.[^/.]+$/, '').toLowerCase();
    const convertedByBase = new Map<string, any>();
    for (const doc of serverDocs) {
      const docFileName = (doc.path || doc.source || '').split('/').pop() || '';
      const base = baseName(docFileName);
      if (base) convertedByBase.set(base, doc);
    }

    // Merge: for each directory file, attach converted doc metadata if available
    const matchedBases = new Set<string>();
    const merged = directoryFiles.map((file: any) => {
      const base = baseName(file.name);
      const converted = convertedByBase.get(base);
      if (converted) {
        matchedBases.add(base);
        return { ...converted, _fsFile: file };
      }
      // Unconverted filesystem file
      return { id: `fs-${file.path}`, name: file.name, source: file.path, _fsFile: file };
    });

    // Add any server docs not matched by directory files (e.g. uploaded from elsewhere)
    for (const doc of serverDocs) {
      const docFileName = (doc.path || doc.source || '').split('/').pop() || '';
      const base = baseName(docFileName);
      if (!matchedBases.has(base)) {
        merged.push(doc);
      }
    }

    // Append pending uploads
    return [...merged, ...pending];
  }, [apiDocuments, uploadingDocs, directoryFiles]);

  // Load MCP servers from project data
  useEffect(() => {
    if (Array.isArray(currentProjectData?.mcp)) {
      setMcpServers((currentProjectData.mcp as McpServer[]).filter(s => !s.id.includes('__system_tools__') && s.name !== '__system_mcp__' && !(s as any).system));
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
        const servers = (result.data as McpServer[]).filter(s => s.name !== '__system_mcp__' && !(s as any).system);
        setMcpServers(servers);
        // Stop polling if a new server appeared
        if (mcpPolling && servers.length > mcpServerCountRef.current) {
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
          const servers = (result.data as McpServer[]).filter(s => s.name !== '__system_mcp__' && !(s as any).system);
          setMcpServers(servers);
          const target = servers.find(s => s.id === discoveringServerId);
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

  const handleAddMcpServer = async () => {
    if (!selectedProject?.id || !newMcpUrl.trim()) return;

    setIsAddingMcp(true);
    setMcpError('');

    try {
      const serverUrl = newMcpUrl.trim();
      console.log('[MCP] Registering server:', serverUrl);

      const result = await mcpServerService.registerMcpServer(
        selectedProject.id,
        {
          server_type: 'remote',
          server_url: serverUrl,
          name: newMcpName.trim() || undefined,
          return_url: 'smartloop://mcp-authorization',
        }
      );

      if (!result.success || !result.data) {
        setMcpError(result.error || 'Failed to register MCP server');
        return;
      }

      const data = result.data as Record<string, any>;

      if (data.auth_type === 'oauth' && data.auth_url) {
        // OAuth required - open auth URL (session stored server-side)
        setNewMcpName('');
        setNewMcpUrl('');
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
        // Server registered directly
        console.log('[MCP] Server registered successfully');
        const serverId = data.id || data.server_id;
        setNewMcpName('');
        setNewMcpUrl('');
        await loadMcpServers();
        if (serverId) {
          setDiscoveringServerId(serverId);
        }
      }
    } catch (error: any) {
      console.error('[MCP] Error adding server:', error);
      setMcpError(error.message || 'An error occurred');
    } finally {
      setIsAddingMcp(false);
    }
  };

  const handleAddLocalMcpServer = async () => {
    if (!selectedProject?.id || !newMcpName.trim()) return;

    setIsAddingMcp(true);
    setMcpError('');

    try {
      // Parse env as KEY=VALUE lines
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
          name: newMcpName.trim(),
          env: Object.keys(env).length > 0 ? env : undefined,
        }
      );

      if (result.success) {
        const resData = result.data as Record<string, any>;
        const serverId = resData?.id || resData?.server_id;
        setNewMcpName('');
        setNewMcpEnv('');
        setMcpServerType('remote');
        await loadMcpServers();
        if (serverId) {
          setDiscoveringServerId(serverId);
        }
      } else {
        setMcpError(result.error || 'Failed to add local MCP server');
      }
    } catch (error: any) {
      console.error('[MCP] Error adding local server:', error);
      setMcpError(error.message || 'An error occurred');
    } finally {
      setIsAddingMcp(false);
    }
  };

  const handleDeleteMcpServer = async (server: McpServer) => {
    if (!selectedProject?.id || !server.id) return;

    try {
      const result = await mcpServerService.deleteMcpServer(selectedProject.id, server.id);
      if (result.success) {
        setMcpServers(prev => prev.filter(s => s.id !== server.id));
        setMcpToDelete(null);
        // Remove from local storage
        await mcpServerService.removeMcpServerFromStorage(selectedProject.id, server.id);
      } else {
        setMcpError(result.error || 'Failed to delete MCP server');
      }
    } catch (error: any) {
      setMcpError(error.message || 'An error occurred');
    }
  };


  const validateAndUploadFile = async (file: File) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
      return;
    }

    if (file.size > maxSize) {
      setUploadError('File size exceeds 50MB limit');
      return;
    }

    if (!selectedProject) {
      setUploadError('No project selected');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      if (!window.electronAPI?.saveTempFile) {
        throw new Error('Local file upload is not available outside of the desktop app');
      }

      const buffer = await file.arrayBuffer();
      const tempPath = await window.electronAPI.saveTempFile(file.name, buffer);

      // Add a placeholder doc to the list immediately with the filename
      const placeholderId = `uploading-${Date.now()}`;
      const placeholderDoc = { id: placeholderId, name: file.name, source: file.name };
      const projectId = selectedProject.id;

      setProcessingDocs(prev => new Map(prev).set(placeholderId, 'Uploading...'));
      setUploadingDocs(prev => [...prev, placeholderDoc]);

      const localResult = await documentService.addLocalDocument(selectedProject.id, tempPath, (progress) => {
        setProcessingDocs(prev => {
          const next = new Map(prev);
          next.set(placeholderId, progress.status || `Processing... ${progress.percent}%`);
          return next;
        });
      }, currentProjectData?.folder_path);
      if (!localResult.success) {
        // Remove placeholder on failure
        setProcessingDocs(prev => { const next = new Map(prev); next.delete(placeholderId); return next; });
        setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId));
        throw new Error(localResult.error || 'Upload failed');
      }

      const uploadedDocument = localResult.data;
      const docId = uploadedDocument.id || uploadedDocument.document_id;
      const fileName = file.name;

      if (!docId) {
        // No doc ID returned — refresh the full list to pick up the new doc
        setProcessingDocs(prev => { const next = new Map(prev); next.delete(placeholderId); return next; });
        setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId));
        window.dispatchEvent(new Event('documentUploaded'));
        setUploadError('');
        return;
      }

      // Replace placeholder with real document, keep tracking as processing
      setProcessingDocs(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        next.set(docId, 'Processing');
        return next;
      });
      setUploadingDocs(prev => prev.map(d => d.id === placeholderId ? { name: d.name, source: d.source, ...uploadedDocument } : d));

      // Poll the documents API until indexing is done
      const pollDocumentApi = () => {
        const maxAttempts = 40;
        let attempts = 0;

        const applyDoc = (updatedDoc: any) => {
          setUploadingDocs(prev => prev.filter(d => d.id !== docId));
          setProcessingDocs(prev => { const next = new Map(prev); next.delete(docId); return next; });
          setIndexingStatus(prev => ({ ...prev, [docId]: 'indexed' }));
          setApiDocuments(prev => {
            const idx = prev.findIndex((d: any) => d.id === docId);
            if (idx >= 0) { const next = [...prev]; next[idx] = updatedDoc; return next; }
            return [...prev, updatedDoc];
          });
          window.dispatchEvent(new Event('documentUploaded'));
        };

        const poll = async (): Promise<void> => {
          attempts++;
          try {
            const result = await documentService.getLocalDocuments(projectId);
            if (result.success && result.data) {
              const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
              // Match by ID or by filename as fallback
              const doc = docs.find((d: any) => d.id === docId || d.document_id === docId) ||
                docs.find((d: any) => {
                  const src = (d.path || d.source || '').split('/').pop() || '';
                  return src === fileName;
                });
              if (doc) {
                const status = doc.status ?? doc.indexing_status ?? doc.state ?? '';
                const isIndexed = status === 'indexed' || !!doc.summary;
                if (isIndexed) {
                  applyDoc(doc);
                  return;
                }
                if (status) {
                  setProcessingDocs(prev => { const next = new Map(prev); next.set(docId, status); return next; });
                }
              }
            }
          } catch { /* ignore */ }

          if (attempts < maxAttempts) {
            setTimeout(poll, 3000);
          } else {
            // Timed out — clear processing state, refresh list so doc still shows
            setProcessingDocs(prev => { const next = new Map(prev); next.delete(docId); return next; });
            setUploadingDocs(prev => prev.filter(d => d.id !== docId));
            window.dispatchEvent(new Event('documentUploaded'));
          }
        };

        setTimeout(poll, 2000);
      };

      pollDocumentApi();

      setUploadError('');
    } catch (error: any) {
      setUploadError(error.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUploadFile(e.target.files[0]);
    }
    e.target.value = '';
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
      validateAndUploadFile(e.dataTransfer.files[0]);
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
        borderLeft: '1px solid',
        borderColor: 'var(--sl-white-alpha-10)',
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
          className="flex-1 overflow-y-auto p-3 space-y-4"
          sx={{
            opacity: activeSection ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Section Title */}
          <Box className="flex items-center justify-between pb-3 mb-2" sx={{ borderBottom: '1px solid var(--sl-white-alpha-8)' }}>
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
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
                    accept=".pdf,.docx,.txt,.csv"
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
                      border: `1px dashed ${isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-white-alpha-15)'}`,
                      bgcolor: isDragging ? 'var(--sl-brand-alpha-10)' : 'var(--sl-white-alpha-2)',
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
                    <span className="text-[12px] text-gray-400 font-medium">
                      {isDragging ? 'Drop file here' : 'Drop files or click to add'}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      pdf · docx · txt · csv
                    </span>
                  </Box>

                  {/* Document List — file-tree style with summary */}
                  {effectiveDocuments.length > 0 && (
                    <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column' }}>
                    {effectiveDocuments
                      .filter((doc: any) => {
                        if (!searchQuery) return true;
                        const query = searchQuery.toLowerCase();
                        const filename = (doc._fsFile?.name || (doc.source || doc.path || '').split('/').pop() || doc.filename || doc.name || '').toLowerCase();
                        return filename.includes(query);
                      })
                      .map((doc: any, i: number) => {
                        const rowId = doc.id || `doc-${i}`;
                        const rawName = doc._fsFile?.name
                          || (doc.source || doc.path || '').split('/').pop()
                          || doc.filename || doc.name || '';
                        const filename = rawName ? (rawName.replace(/\.[^/.]+$/, '') || 'Untitled') : 'Untitled';
                        const ext = rawName.match(/\.([^/.]+)$/)?.[1]?.toUpperCase() || '';
                        const fileSize = doc._fsFile?.size;
                        const fileSizeLabel = fileSize != null
                          ? fileSize >= 1024 * 1024 ? `${(fileSize / 1024 / 1024).toFixed(1)} MB` : `${(fileSize / 1024).toFixed(0)} KB`
                          : null;
                        const isProcessing = processingDocs.has(doc.id);
                        const docIndexStatus = indexingStatus[doc.id];
                        const isIndexed = docIndexStatus === 'indexed';
                        const isIndexing = docIndexStatus === 'indexing';
                        const rawSummary = !isProcessing
                          ? (doc.summary ? doc.summary : null)
                          : "document is being processed";
                        const summary = rawSummary
                          ? rawSummary.replace(/^#+\s*/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
                          : null;
                        return (
                          <Box
                            key={rowId}
                            onMouseEnter={() => setHoveredDocId(rowId)}
                            onMouseLeave={() => setHoveredDocId(null)}
                            sx={{
                              px: 1,
                              py: '6px',
                              cursor: 'default',
                              display: 'flex',
                              gap: 0.75,
                              transition: 'background 0.1s ease',
                              border: '1px solid var(--sl-white-alpha-8)',
                              borderRadius: '6px',
                              mb: 0.75,
                            }}
                          >
                            <InsertDriveFileIcon sx={{ fontSize: 11, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '2px' }} />
                            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <span className="text-[11px] text-gray-300 truncate flex-1">
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
                                <span className="text-[10px] text-gray-500" style={{ lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                                  {summary}
                                </span>
                              )}
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                {ext && (
                                  <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-white-alpha-5)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>
                                    {ext}
                                  </span>
                                )}
                                {fileSizeLabel && (
                                  <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)' }}>{fileSizeLabel}</span>
                                )}
                                {isProcessing
                                  ? <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-white-alpha-5)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>{processingDocs.get(doc.id) || 'Extracting...'}</span>
                                  : isIndexed
                                    ? <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-white-alpha-5)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>Indexed</span>
                                    : isIndexing
                                      ? <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-white-alpha-5)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px' }}>Indexing</span>
                                      : <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)', backgroundColor: 'var(--sl-white-alpha-5)', borderRadius: '3px', padding: '0 4px', lineHeight: '16px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Pending <span className="loading-dots" style={{ display: 'inline-flex', gap: '2px' }}><span style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: 'var(--sl-text-faint)', animation: 'dotPulse 1.2s infinite', animationDelay: '0s' }} /><span style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: 'var(--sl-text-faint)', animation: 'dotPulse 1.2s infinite', animationDelay: '0.2s' }} /><span style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: 'var(--sl-text-faint)', animation: 'dotPulse 1.2s infinite', animationDelay: '0.4s' }} /></span></span>}
                              </Box>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </div>
              ) : (
                <Box className="text-gray-500 text-xs py-4 text-center">
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
                  bgcolor: 'var(--sl-white-alpha-2)',
                  border: '1px solid var(--sl-white-alpha-8)',
                }}
              >
                {/* Remote / Local toggle */}
                <div className="flex mb-2">
                  <div className="relative flex rounded bg-white/5 p-0.5">
                    <span
                      className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded bg-white/10 transition-transform duration-200 ${mcpServerType === 'local' ? 'translate-x-full' : 'translate-x-0'}`}
                      style={{ left: '2px' }}
                    />
                    <button
                      onClick={() => setMcpServerType('remote')}
                      className={`relative z-10 text-[10px] px-6 py-0.5 transition-colors focus:outline-none ${mcpServerType === 'remote' ? 'text-gray-200' : 'text-gray-600'}`}
                    >
                      Remote
                    </button>
                    <button
                      onClick={() => setMcpServerType('local')}
                      className={`relative z-10 text-[10px] px-6 py-0.5 transition-colors focus:outline-none ${mcpServerType === 'local' ? 'text-gray-200' : 'text-gray-600'}`}
                    >
                      Local
                    </button>
                  </div>
                </div>

                <TextField
                  size="small"
                  placeholder={mcpServerType === 'remote' ? 'Server URL (e.g., https://mcp.example.com)' : 'Server name'}
                  value={mcpServerType === 'remote' ? newMcpUrl : newMcpName}
                  onChange={(e) => mcpServerType === 'remote' ? setNewMcpUrl(e.target.value) : setNewMcpName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAddingMcp) {
                      if (mcpServerType === 'remote' && newMcpUrl.trim()) {
                        handleAddMcpServer();
                      } else if (mcpServerType === 'local' && newMcpName.trim()) {
                        handleAddLocalMcpServer();
                      }
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
                      backgroundColor: 'var(--sl-white-alpha-2)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'var(--sl-white-alpha-10)' },
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
                <Box className="text-gray-600 text-[10px] mt-1 px-1">
                  Press Enter to add
                </Box>
              </Box>

              {/* Error Message */}
              {mcpError && (
                <Box className="text-red-400 text-xs text-center py-2">
                  {mcpError}
                </Box>
              )}

              {mcpServers.length > 0 ? (
                /* Server List */
                <Box sx={{ mt: 0 }}>
                  {mcpServers.map((server, index) => (
                    <McpServerItem
                      key={server.id || `mcp-${index}`}
                      server={server}
                      projectId={selectedProject?.id || ''}
                      onDelete={handleDeleteMcpServer}
                      discovering={discoveringServerId === server.id}
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
                  ))}
                </Box>
              ) : (
                /* Empty State */
                <Box className="flex flex-col items-center justify-center py-8 text-center">
                  <PowerOutlinedIcon sx={{ fontSize: 48, color: 'var(--sl-text-faint)', mb: 2 }} />
                  <Box className="text-gray-400 text-xs mb-1">
                    No MCP servers configured
                  </Box>
                  <Box className="text-gray-500 text-[10px]">
                    Add an MCP server to extend capabilities
                  </Box>
                </Box>
              )}

              {/* Help Text */}
              <p className="text-gray-500 text-[10px] leading-relaxed mt-4">
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
                    <span className="text-xs text-white font-medium truncate">
                      {editingSkillIsNew ? 'New Skill' : (projectSkills[editingSkillIndex!]?.name || 'Untitled Skill')}
                    </span>
                    {skillHasUnsavedChanges && (
                      <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />
                    )}
                  </Box>
                  <Box className="markdown-editor-container" sx={{
                    '& .EasyMDEContainer': { border: 'none' },
                    '& .CodeMirror': { bgcolor: 'var(--sl-white-alpha-2)', border: '1px solid var(--sl-white-alpha-10)', borderRadius: '6px', color: 'var(--sl-text-primary)' },
                    '& .editor-toolbar': { borderColor: 'var(--sl-white-alpha-10)' },
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
                    border: '1px solid var(--sl-white-alpha-10)',
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
                            setPendingSkill({ baselineCount: projectSkills.length, content });
                            onSaveSkills([...projectSkills, { name, content }]);
                            setSkillSearchQuery('');
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
                      <div className="absolute top-2 left-[10px] right-[10px] pointer-events-none text-[11px] font-mono leading-relaxed opacity-30 text-gray-400">
                        Write a new skill in Markdown and press{' '}
                        <SubdirectoryArrowLeftIcon sx={{ fontSize: 11, verticalAlign: 'middle' }} />{' '}
                        to add. Skills are snippets of content that are injected into the assistant's context
                      </div>
                    )}
                    </Box>
                    <Box className="flex items-center justify-between px-2 py-1.5" sx={{ borderTop: '1px solid var(--sl-white-alpha-5)' }}>
                      <span className="text-[9px] text-gray-600">Markdown</span>
                      <button
                        onClick={() => {
                          if (onSaveSkills && skillSearchQuery.trim()) {
                            const content = skillSearchQuery.trim();
                            const heading = content.match(/^#\s+(.+)$/m);
                            const name = heading?.[1]?.trim() || content.split('\n')[0].slice(0, 40);
                            setPendingSkill({ baselineCount: projectSkills.length, content });
                            onSaveSkills([...projectSkills, { name, content }]);
                            setSkillSearchQuery('');
                          }
                        }}
                        disabled={!skillSearchQuery.trim()}
                        className="text-[10px] px-2.5 py-0.5 rounded text-gray-500 hover:text-pink-400 hover:bg-pink-500/10 disabled:opacity-30 disabled:cursor-default transition-colors"
                      >
                        Add <SubdirectoryArrowLeftIcon sx={{ fontSize: 11, verticalAlign: 'middle', ml: '2px' }} />
                      </button>
                    </Box>
                  </Box>

                  {/* Skill List */}
                  {(projectSkills.length > 0 || savingSkill) && (
                    <Box sx={{ mt: 3 }}>
                    <Box sx={{
                      border: '1px solid var(--sl-white-alpha-8)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}>
                      {savingSkill && (
                        <Box sx={{
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          borderBottom: projectSkills.length > 0 ? '1px solid var(--sl-white-alpha-5)' : 'none',
                          bgcolor: 'var(--sl-brand-alpha-10)',
                        }}>
                          <CircularProgress size={11} sx={{ color: 'var(--sl-brand-primary)', flexShrink: 0 }} />
                          <span className="text-[11px] text-gray-400">Adding skill…</span>
                        </Box>
                      )}
                      {projectSkills.map((skill, index) => (
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
                            borderBottom: '1px solid var(--sl-white-alpha-5)',
                            '&:last-child': { borderBottom: 'none' },
                            '&:hover': {
                              bgcolor: 'var(--sl-brand-alpha-10)',
                            },
                          }}
                        >
                          <ConstructionIcon sx={{ fontSize: 11, color: 'var(--sl-text-faint)', flexShrink: 0, mt: '2px' }} />
                          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span className="text-[11px] text-gray-300 truncate">
                              {skill.name || 'Untitled'}
                            </span>
                            {skill.description && (
                              <span className="text-[10px] text-gray-500" style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>
                                {skill.description}
                              </span>
                            )}
                          </Box>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSaveSkills) {
                                onSaveSkills(projectSkills.filter((_, i) => i !== index));
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
                      <span className="text-[10px] text-pink-400">Drop .md file to add as skill</span>
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
                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">Project Name</div>
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
                      backgroundColor: 'var(--sl-white-alpha-2)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'var(--sl-white-alpha-10)' },
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
                <div className="text-[10px] text-gray-600 mt-1">Press Enter to save</div>
              </div>

              {/* Project Color */}
              <div>
                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">Label Color</div>
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
                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">Working Directory</div>
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
                    backgroundColor: 'var(--sl-white-alpha-2)',
                    border: '1px solid var(--sl-white-alpha-10)',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'var(--sl-white-alpha-5)',
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
                <p className="text-gray-500 text-[10px] leading-relaxed mt-1 px-1">
                  Click to open in Finder. Sent as working directory (<code>cwd</code>) with each chat message.
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
        <Tooltip title={(!selectedProject || selectedProject?.system) ? "Documents (Disabled)" : "Documents"} placement="left">
          <span className={(!selectedProject || selectedProject?.system) ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => {
                if (!selectedProject || selectedProject?.system) return;
                setActiveSection(activeSection === 'documents' ? null : 'documents');
              }}
              disabled={!selectedProject || selectedProject?.system}
              sx={{
                color: (activeSection === 'documents' || activeTab === 'document') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: (!selectedProject || selectedProject?.system) ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: (!selectedProject || selectedProject?.system) ? 'var(--sl-text-muted)' : 'var(--sl-brand-primary)',
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
        <Tooltip title={"Skills"} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => {
                setActiveSection(activeSection === 'skills' ? null : 'skills');
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
        <Tooltip title="MCP Servers" placement="left">
          <span>
            <IconButton
              onClick={() => {
                setMcpError('');
                setActiveSection(activeSection === 'mcp' ? null : 'mcp');
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

        {/* Spacer pushes Settings icon to bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Project Settings gear icon */}
        <Tooltip title={selectedProject?.system ? "Settings (Disabled)" : "Project Settings"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => !selectedProject?.system && setActiveSection(activeSection === 'settings' ? null : 'settings')}
              disabled={selectedProject?.system}
              sx={{
                color: activeSection === 'settings' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? 'var(--sl-text-muted)' : 'var(--sl-brand-primary)',
                },
              }}
              size="small"
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

      </Box>

      {/* Skill Create Dialog */}
      <SkillCreateDialog
        open={skillDialogOpen}
        onClose={() => setSkillDialogOpen(false)}
        onSave={(skill) => {
          if (onSaveSkills) {
            onSaveSkills([...projectSkills, skill]);
          }
        }}
        initialContent={skillDialogInitialContent}
        initialName={skillDialogInitialName}
      />
    </Box>
  );
}
