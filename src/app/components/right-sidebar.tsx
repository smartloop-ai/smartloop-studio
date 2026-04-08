import { Box, IconButton, CircularProgress, Tooltip, TextField, InputAdornment } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ConstructionIcon from '@mui/icons-material/Construction';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CircleIcon from '@mui/icons-material/Circle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import McpServerItem from './mcp-server-item';
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
  projectSkills?: Array<{ name: string; content: string }>;
  onSaveSkills?: (skills: Array<{ name: string; content: string }>) => void;
}

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  onAddDocument,
  onDeleteDocument,
  onColorChange,
  onRenameProject,
  activeTab,
  projectSkills = [],
  onSaveSkills,
}: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<'documents' | 'mcp' | 'skills' | 'settings' | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingDocs, setProcessingDocs] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localFolderPath, setLocalFolderPath] = useState('');
  const [localProjectName, setLocalProjectName] = useState('');

  // Inline skill editing
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);
  const [editingSkillIsNew, setEditingSkillIsNew] = useState(false);
  const [skillContent, setSkillContent] = useState('');
  const [skillHasUnsavedChanges, setSkillHasUnsavedChanges] = useState(false);
  const skillAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DEFAULT_SKILL_TEMPLATE = `---
name: my-skill-name
description: A clear description of what this skill does and when to use it
---

# My Skill Name

[Add your instructions here that Claude will follow when this skill is active]
`;

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
      const nameMatch = skillContent.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/);
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

  // Collapse sidebar only when switching to a different project
  const prevProjectIdRef = useRef<string | null>(selectedProject?.id ?? null);
  useEffect(() => {
    const newId = selectedProject?.id ?? null;
    if (prevProjectIdRef.current !== null && newId !== prevProjectIdRef.current) {
      setActiveSection(null);
    }
    prevProjectIdRef.current = newId;
  }, [selectedProject?.id]);

  // Ensure sidebar is collapsed for system projects
  useEffect(() => {
    if (selectedProject?.system && activeSection === 'documents') {
      setActiveSection(null);
    }
  }, [selectedProject?.system, activeSection]);

  // Local state for documents being uploaded/processed (not yet in currentProjectData)
  const [uploadingDocs, setUploadingDocs] = useState<any[]>([]);

  // Clear uploading docs when project changes
  useEffect(() => {
    setUploadingDocs([]);
  }, [selectedProject?.id]);

  // Merge server documents with local uploading placeholders
  const effectiveDocuments = useMemo(() => {
    const serverDocs = currentProjectData?.documents || [];
    // Filter out uploading docs whose real ID now exists in server docs
    const serverIds = new Set(serverDocs.map((d: any) => d.id));
    const pending = uploadingDocs.filter((d: any) => !serverIds.has(d.id));
    return [...serverDocs, ...pending];
  }, [currentProjectData?.documents, uploadingDocs]);

  // Load MCP servers from project data
  useEffect(() => {
    if (Array.isArray(currentProjectData?.mcp)) {
      setMcpServers((currentProjectData.mcp as McpServer[]).filter(s => !s.id.includes('__system_tools__')));
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
        const servers = result.data as McpServer[];
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
          const servers = result.data as McpServer[];
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
      });
      if (!localResult.success) {
        // Remove placeholder on failure
        setProcessingDocs(prev => { const next = new Map(prev); next.delete(placeholderId); return next; });
        setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId));
        throw new Error(localResult.error || 'Upload failed');
      }

      const uploadedDocument = localResult.data;
      const docId = uploadedDocument.id;

      // Replace placeholder with real document, keep tracking as processing
      setProcessingDocs(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        next.set(docId, 'Processing document...');
        return next;
      });
      setUploadingDocs(prev => prev.map(d => d.id === placeholderId ? { name: d.name, source: d.source, ...uploadedDocument } : d));

      // Single delayed refresh to sync document list after upload
      setTimeout(() => {
        setProcessingDocs(prev => {
          const next = new Map(prev);
          next.delete(docId);
          return next;
        });
        setUploadingDocs(prev => prev.filter(d => d.id !== docId));

        // Notify parent to refresh document list
        window.dispatchEvent(new CustomEvent('documentProcessingComplete', {
          detail: { projectId }
        }));
      }, 3000);

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
          {/* Section Title and Actions */}
          <Box className="flex items-center justify-between py-4 mb-4 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {activeSection === 'documents' ? 'Documents' : activeSection === 'mcp' ? 'MCP Servers' : activeSection === 'skills' ? 'Skills' : activeSection === 'settings' ? 'Project Settings' : ''}
            </span>
            {selectedProject && activeSection === 'documents' && (
              <button
                onClick={onAddDocument}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-normal text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400 rounded-sm transition-all"
              >
                <AddBoxIcon sx={{ fontSize: 12 }} />
                <span>Add</span>
              </button>
            )}
          </Box>


          {/* Documents Section */}
          {activeSection === 'documents' && (
            <div
              className="space-y-3"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {selectedProject ? (
                effectiveDocuments.length > 0 ? (
                  <>
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {/* Drop zone overlay when dragging */}
                    {isDragging && (
                      <Box
                        className="border-2 border-dashed border-pink-500 bg-pink-500/10 rounded-sm p-3 text-center"
                      >
                        <Box className="flex items-center justify-center gap-2">
                          <CloudUploadIcon sx={{ fontSize: 16, color: '#ec4899' }} />
                          <span className="text-pink-400 text-xs">Drop file to upload</span>
                        </Box>
                      </Box>
                    )}

                    {uploadError && (
                      <Box className="text-red-400 text-xs text-center -mt-1">
                        {uploadError}
                      </Box>
                    )}

                    {/* Search Input */}
                    <TextField
                      size="small"
                      placeholder="Search documents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 18, color: 'var(--sl-text-muted)' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        width: '100%',
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'var(--sl-white-alpha-2)',
                          fontSize: '0.75rem',
                          '& fieldset': {
                            borderColor: 'var(--sl-white-alpha-10)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'var(--sl-brand-alpha-30)',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'var(--sl-brand-primary)',
                          },
                        },
                        '& .MuiInputBase-input': {
                          color: 'var(--sl-text-primary)',
                          padding: '8px 12px',
                          '&::placeholder': {
                            color: 'var(--sl-text-muted)',
                            opacity: 1,
                          },
                        },
                      }}
                    />
                    <Box className="space-y-2">
                      {effectiveDocuments
                        .filter((doc: any) => {
                          if (!searchQuery) return true;
                          const query = searchQuery.toLowerCase();
                          const filename = ((doc.path || doc.source) ? ((doc.path || doc.source).split('/').pop() || '') : (doc.filename || doc.name || '')).toLowerCase();
                          const summary = (doc.summary || '').toLowerCase();
                          const markdown = (doc.markdown || '').toLowerCase();
                          return filename.includes(query) || summary.includes(query) || markdown.includes(query);
                        })
                        .map((doc: any, i: number) => (
                          <Box
                            key={doc.id || `doc-${i}`}
                            onMouseEnter={() => setHoveredDocId(doc.id || `doc-${i}`)}
                            onMouseLeave={() => setHoveredDocId(null)}
                            sx={{
                              padding: '10px',
                              borderRadius: '6px',
                              bgcolor: 'var(--sl-white-alpha-2)',
                              border: '1px solid var(--sl-white-alpha-5)',
                              transition: 'all 0.15s ease',
                              position: 'relative',
                            }}
                          >
                            <Box className="flex items-start gap-2">
                              {/* Document Icon */}
                              <Box
                                sx={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  bgcolor: 'var(--sl-brand-alpha-10)',
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginTop: '2px',
                                }}
                              >
                                {processingDocs.has(doc.id)
                                  ? <CircularProgress size={16} sx={{ color: 'var(--sl-brand-primary)' }} />
                                  : <InsertDriveFileIcon sx={{ fontSize: 16, color: 'var(--sl-brand-primary)' }} />
                                }
                              </Box>

                              {/* Document Content */}
                              <Box className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-xs text-white font-medium truncate">
                                    {(doc.path || doc.source) ? ((doc.path || doc.source).split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Untitled Document') : (doc.filename || doc.name || 'Untitled Document')}
                                  </span>
                                  {/* Delete Icon - Appears on Hover (hidden for uploading docs) */}
                                  {!processingDocs.has(doc.id) && (
                                    <Tooltip title="Delete Document" arrow>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDeleteDocument(doc);
                                        }}
                                        sx={{
                                          opacity: hoveredDocId === (doc.id || `doc-${i}`) ? 1 : 0,
                                          transition: 'opacity 0.15s ease',
                                          color: 'var(--sl-text-muted)',
                                          bgcolor: 'var(--sl-danger-alpha-10)',
                                          padding: '4px',
                                          '&:hover': {
                                            color: 'var(--sl-status-error)',
                                            bgcolor: 'var(--sl-danger-alpha-15)',
                                          },
                                        }}
                                      >
                                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </div>

                                {/* Uploading indicator or Document Preview */}
                                {processingDocs.has(doc.id) ? (
                                  <div className="text-[10px] text-gray-400 leading-relaxed mb-1.5">
                                    {processingDocs.get(doc.id) || 'Processing document...'}
                                  </div>
                                ) : (doc.summary || doc.markdown) ? (
                                  <div
                                    className="text-[10px] text-gray-400 leading-relaxed mb-1.5"
                                    style={{
                                      wordBreak: 'break-word',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 3,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {((s) => { const t = s.slice(0, 100); const i = t.lastIndexOf(' '); return s.length > 100 ? (i > 0 ? t.slice(0, i) : t) + '...' : t; })((doc.summary || doc.markdown || '').replace(/[#*_\[\]()>`~|]/g, '').replace(/\n/g, ' ').trim())}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gray-500 italic leading-relaxed mb-1.5">
                                    Pending processing
                                  </div>
                                )}

                                {/* Document Metadata */}
                                <div className="text-[10px] text-gray-500 flex items-center gap-2 flex-wrap">
                                </div>
                              </Box>
                            </Box>
                          </Box>
                        ))}
                    </Box>
                  </>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Box
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-sm p-8 text-center transition-all cursor-pointer ${isDragging
                        ? 'border-pink-500 bg-pink-500/10'
                        : 'border-gray-700 hover:border-pink-600 bg-gray-900/50'
                        }`}
                    >
                      <CloudUploadIcon className="text-5xl text-gray-500 mb-2" />
                      <Box className="text-gray-300 text-sm mb-1">
                        Drag and drop your file here
                      </Box>
                      <Box className="text-gray-500 text-xs mb-3">
                        or click to browse
                      </Box>
                      <Box className="text-gray-600 text-xs">
                        Supported: PDF, DOCX, TXT, CSV (Max 50MB)
                      </Box>
                    </Box>
                    {uploadError && (
                      <Box className="text-red-400 text-xs mt-2 text-center">
                        {uploadError}
                      </Box>
                    )}
                  </>
                )
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
                <Box className="flex mb-2 rounded overflow-hidden border border-gray-700">
                  <button
                    onClick={() => setMcpServerType('remote')}
                    className={`flex-1 px-3 py-1 text-[10px] font-medium transition-colors ${mcpServerType === 'remote'
                      ? 'border border-pink-500 text-pink-400 bg-transparent'
                      : 'bg-transparent text-gray-400 hover:text-gray-300'
                      }`}
                  >
                    Remote
                  </button>
                  <button
                    onClick={() => setMcpServerType('local')}
                    className={`flex-1 px-3 py-1 text-[10px] font-medium transition-colors ${mcpServerType === 'local'
                      ? 'border border-pink-500 text-pink-400 bg-transparent'
                      : 'bg-transparent text-gray-400 hover:text-gray-300'
                      }`}
                  >
                    Local
                  </button>
                </Box>

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

              {mcpServers.filter((s: any) => s.name !== '__system_mcp__' && !s.system).length > 0 ? (
                /* Server List */
                <Box className="space-y-2">
                  {mcpServers.filter((s: any) => s.name !== '__system_mcp__' && !s.system).map((server, index) => (
                    <Box
                      key={server.id || `mcp-${index}`}
                    >
                      <McpServerItem
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
                    </Box>
                  ))}
                </Box>
              ) : (
                /* Empty State */
                <Box className="flex flex-col items-center justify-center py-8 text-center">
                  <PowerOutlinedIcon sx={{ fontSize: 48, color: 'var(--sl-text-faint)', mb: 2 }} />
                  <Box className="text-gray-400 text-sm mb-1">
                    No MCP servers configured
                  </Box>
                  <Box className="text-gray-500 text-xs">
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
            <div className="space-y-3">
              {(editingSkillIndex !== null || editingSkillIsNew) ? (
                /* Inline Skill Editor */
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
                  <Box sx={{ fontSize: '10px', color: 'var(--sl-text-faint)', mb: 1 }}>Markdown</Box>
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
                </div>
              ) : (
                <>
                  {/* Add New Skill Button */}
                  <button
                    onClick={() => {
                      setEditingSkillIsNew(true);
                      setEditingSkillIndex(null);
                      setSkillContent(DEFAULT_SKILL_TEMPLATE);
                      setSkillHasUnsavedChanges(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-normal text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400 rounded-sm transition-all"
                  >
                    <AddBoxIcon sx={{ fontSize: 12 }} />
                    <span>Add Skill</span>
                  </button>

                  {projectSkills.length > 0 ? (
                    <Box className="space-y-2">
                      {projectSkills.map((skill, index) => (
                        <Box
                          key={`skill-${index}`}
                          onClick={() => {
                            setEditingSkillIndex(index);
                            setEditingSkillIsNew(false);
                            setSkillContent(skill.content || '');
                            setSkillHasUnsavedChanges(false);
                          }}
                          sx={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            bgcolor: 'var(--sl-white-alpha-2)',
                            border: '1px solid var(--sl-white-alpha-5)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              bgcolor: 'var(--sl-white-alpha-5)',
                              borderColor: 'var(--sl-white-alpha-8)',
                            },
                          }}
                        >
                          <Box className="flex items-center gap-2">
                            <ConstructionIcon sx={{ fontSize: 14, color: 'var(--sl-text-muted)' }} />
                            <span className="text-xs text-white font-medium truncate">
                              {skill.name || 'Untitled Skill'}
                            </span>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Box className="flex flex-col items-center justify-center py-8 text-center">
                      <ConstructionIcon sx={{ fontSize: 48, color: 'var(--sl-text-faint)', mb: 2 }} />
                      <Box className="text-gray-400 text-sm mb-1">No skills configured</Box>
                      <Box className="text-gray-500 text-xs">
                        Add skills to customize assistant behavior
                      </Box>
                    </Box>
                  )}
                </>
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
          gap: 1,
          bgcolor: 'var(--sl-black-alpha-20)',
        }}
      >
        <Tooltip title={selectedProject?.system ? "Documents (Disabled)" : "Documents"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => {
                if (selectedProject?.system) return;
                setActiveSection(activeSection === 'documents' ? null : 'documents');
              }}
              disabled={selectedProject?.system}
              sx={{
                color: (activeSection === 'documents' || activeTab === 'document') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                bgcolor: 'var(--sl-white-alpha-5)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? 'var(--sl-text-muted)' : 'var(--sl-brand-primary)',
                  bgcolor: selectedProject?.system ? 'var(--sl-white-alpha-5)' : 'var(--sl-brand-alpha-10)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  bgcolor: 'var(--sl-white-alpha-2)',
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
        <Tooltip title={selectedProject?.system ? "Skills (Disabled)" : "Skills"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => {
                if (selectedProject?.system) return;
                setActiveSection(activeSection === 'skills' ? null : 'skills');
              }}
              disabled={selectedProject?.system}
              sx={{
                color: (activeSection === 'skills' || activeTab === 'skill') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                bgcolor: 'var(--sl-white-alpha-5)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? 'var(--sl-text-muted)' : 'var(--sl-brand-primary)',
                  bgcolor: selectedProject?.system ? 'var(--sl-white-alpha-5)' : 'var(--sl-brand-alpha-10)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  bgcolor: 'var(--sl-white-alpha-2)',
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
                bgcolor: 'var(--sl-white-alpha-5)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                  bgcolor: 'var(--sl-brand-alpha-10)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  bgcolor: 'var(--sl-white-alpha-2)',
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
                bgcolor: 'var(--sl-white-alpha-5)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? 'var(--sl-text-muted)' : 'var(--sl-brand-primary)',
                  bgcolor: selectedProject?.system ? 'var(--sl-white-alpha-5)' : 'var(--sl-brand-alpha-10)',
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
