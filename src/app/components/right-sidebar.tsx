import { Box, IconButton, CircularProgress, Tooltip, TextField, InputAdornment } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CircleIcon from '@mui/icons-material/Circle';
import SaveIcon from '@mui/icons-material/Save';
import CableIcon from '@mui/icons-material/Cable';
import McpServerItem from './mcp-server-item';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { documentService } from '@/app/services/document.service';
import { mcpServerService, McpServer } from '@/app/services/mcp-server.service';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  projectRules: string;
  isSavingRules: boolean;
  onSaveRules: (rules: string) => void;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
  user: any;
}

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  projectRules,
  isSavingRules,
  onSaveRules,
  onAddDocument,
  onDeleteDocument,
}: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<'rules' | 'documents' | 'mcp' | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingDocs, setProcessingDocs] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentRulesValue, setCurrentRulesValue] = useState('');
  const initialLoadRef = useRef<boolean>(true);

  // MCP Servers state
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpError, setMcpError] = useState('');
  const [mcpPolling, setMcpPolling] = useState(false);
  const mcpServerCountRef = useRef(0);
  const [showAddMcpForm, setShowAddMcpForm] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [discoveringServerId, setDiscoveringServerId] = useState<string | null>(null);
  // mcpToDelete can be used for deletion confirmation dialog if needed
  const [, setMcpToDelete] = useState<McpServer | null>(null);
  // Local MCP server state
  const [mcpServerType, setMcpServerType] = useState<'remote' | 'local'>('remote');
  const [newMcpEnv, setNewMcpEnv] = useState('');

  // SimpleMDE editor options
  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: ["words", "lines"] as const,

    toolbar: [
      'bold',
      'italic',
      'heading',
      '|',
      'unordered-list',
      'ordered-list',
      '|',
      'quote',
    ] as const,
    minHeight: '300px',
    placeholder: 'Add skills or guidelines for this project...',
  }), [selectedProject?.id]);

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
    if (selectedProject?.system && (activeSection === 'documents')) {
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

  // Reset states when project changes
  useEffect(() => {
    initialLoadRef.current = true;
    setHasUnsavedChanges(false);
    setCurrentRulesValue(projectRules || '');
  }, [selectedProject?.id, projectRules]);

  // Load rules into editor when rules section is opened
  useEffect(() => {
    if (activeSection === 'rules' && editorRef.current) {
      setTimeout(() => {
        const codemirror = editorRef.current?.codemirror;
        if (codemirror) {
          if (initialLoadRef.current) {
            const currentValue = codemirror.getValue();
            if (currentValue !== projectRules) {
              codemirror.setValue(projectRules || '');
              codemirror.refresh();
            }
            setCurrentRulesValue(projectRules || '');
            setHasUnsavedChanges(false);
            initialLoadRef.current = false;
          }
        }
      }, 100);
    } else if (activeSection !== 'rules') {
      initialLoadRef.current = true;
      setHasUnsavedChanges(false);
    }
  }, [activeSection, projectRules]);

  // Keyboard shortcut handler for Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeSection === 'rules' && hasUnsavedChanges) {
          onSaveRules(currentRulesValue);
          setHasUnsavedChanges(false);
        }
      }
    };

    if (activeSection === 'rules') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeSection, hasUnsavedChanges, currentRulesValue, onSaveRules]);

  // Load MCP servers from project data
  useEffect(() => {
    if (Array.isArray(currentProjectData?.mcp)) {
      setMcpServers(currentProjectData.mcp as McpServer[]);
    } else if (currentProjectData?.mcp?.servers) {
      setMcpServers(currentProjectData.mcp.servers as McpServer[]);
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

  // Poll for new MCP servers while waiting (OAuth or error)
  useEffect(() => {
    if (!mcpPolling || !selectedProject?.id) return;

    const interval = setInterval(() => {
      loadMcpServers();
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
        setShowAddMcpForm(false);
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
        setShowAddMcpForm(false);
        await loadMcpServers();
        if (serverId) {
          setDiscoveringServerId(serverId);
        }
      }
    } catch (error: any) {
      console.error('[MCP] Error adding server:', error);
      setMcpError(error.message || 'An error occurred');
      mcpServerCountRef.current = mcpServers.length;
      setMcpPolling(true);
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
        setShowAddMcpForm(false);
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
      className="border-l border-gray-900 relative"
      sx={{
        width: { xs: '0', md: activeSection ? '30%' : '48px' },
        minWidth: { xs: '0', md: activeSection ? '320px' : '48px' },
        maxWidth: { xs: '0', md: activeSection ? '450px' : '48px' },
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'row',
        transition: 'width 0.3s ease',
      }}
    >
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
              {activeSection === 'documents' ? 'Documents' : activeSection === 'rules' ? 'Skills' : activeSection === 'mcp' ? 'MCP Servers' : ''}
            </span>
            {selectedProject && activeSection === 'documents' && effectiveDocuments.length > 0 && (
              <button
                onClick={onAddDocument}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-normal text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400 rounded-sm transition-all"
              >
                <AddBoxIcon sx={{ fontSize: 12 }} />
                <span>Add</span>
              </button>
            )}
            {selectedProject && activeSection === 'rules' && (
              <button
                onClick={() => {
                  if (hasUnsavedChanges && !isSavingRules) {
                    onSaveRules(currentRulesValue);
                    setHasUnsavedChanges(false);
                  }
                }}
                disabled={isSavingRules || !hasUnsavedChanges}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-normal rounded-sm transition-all ${isSavingRules
                  ? 'text-pink-400 border border-pink-400 cursor-wait'
                  : hasUnsavedChanges
                    ? 'text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400'
                    : 'text-pink-500 border border-pink-400 cursor-default'
                  }`}
              >
                {isSavingRules ? (
                  <>
                    <CircularProgress size={10} sx={{ color: 'var(--sl-brand-light)' }} />
                    <span>Saving...</span>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <SaveIcon sx={{ fontSize: 12 }} />
                    <span>Save</span>
                  </>
                ) : (
                  <>
                    <CircleIcon className="text-pink-500" sx={{ fontSize: 12 }} />
                    <span>Saved</span>
                  </>
                )}
              </button>
            )}
            {selectedProject && activeSection === 'mcp' && (
              <button
                onClick={() => setShowAddMcpForm(true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-normal text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400 rounded-sm transition-all"
              >
                <AddBoxIcon sx={{ fontSize: 12 }} />
                <span>Add</span>
              </button>
            )}
          </Box>

          {/* Project Rules Section */}
          {activeSection === 'rules' && selectedProject && currentProjectData && (
            <div className=" w-full">
              <Box className="markdown-editor-container w-full">
                <SimpleMDE
                  value={currentRulesValue}
                  onChange={(value: string) => {
                    setCurrentRulesValue(value);
                    setHasUnsavedChanges(value !== projectRules);
                  }}
                  options={editorOptions}
                  getMdeInstance={(instance) => {
                    editorRef.current = instance;
                  }}
                />
              </Box>
              <p className="text-gray-400 text-[10px] leading-relaxed">
                <ul>
                  <li>- Use markdown to format the skills.</li>
                  <li>- Clearly define guidelines for document processing.</li>
                  <li>- Examples: preferred response style, prohibited content, specific instructions.</li>
                  <li>- Press Ctrl+S (Cmd+S on Mac) to save changes.</li>
                </ul>
              </p>
            </div>
          )}

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

                    {/* Compact Drop Zone */}
                    {/* <Box
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-sm p-4 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-gray-700 hover:border-pink-500/50 bg-gray-900/30'
                  }`}
                >
                  {isUploading ? (
                    <Box className="flex items-center justify-center gap-2">
                      <CircularProgress size={16} sx={{ color: '#ec4899' }} />
                      <span className="text-gray-300 text-xs">Uploading...</span>
                    </Box>
                  ) : (
                    <Box className="flex items-center justify-center gap-2">
                      <CloudUploadIcon sx={{ fontSize: 16, color: '#9ca3af' }} />
                      <span className="text-gray-400 text-xs">Drop files here or click to upload</span>
                    </Box>
                  )}
                </Box> */}

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
                              '&:hover': {
                                bgcolor: 'var(--sl-white-alpha-5)',
                                borderColor: 'var(--sl-white-alpha-8)',
                              },
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

                                {/* Uploading indicator or Document Summary */}
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
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {doc.summary
                                      ? doc.summary
                                      : doc.markdown.replace(/\n/g, ' ').trim()}
                                  </div>
                                ) : null}

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
              {/* Add MCP Server Form */}
              {showAddMcpForm && (
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
                        ? 'bg-pink-600 text-white'
                        : 'bg-transparent text-gray-400 hover:text-gray-300'
                        }`}
                    >
                      Remote
                    </button>
                    <button
                      onClick={() => setMcpServerType('local')}
                      className={`flex-1 px-3 py-1 text-[10px] font-medium transition-colors ${mcpServerType === 'local'
                        ? 'bg-pink-600 text-white'
                        : 'bg-transparent text-gray-400 hover:text-gray-300'
                        }`}
                    >
                      Local
                    </button>
                  </Box>

                  <TextField
                    size="small"
                    autoFocus
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
                      } else if (e.key === 'Escape') {
                        setShowAddMcpForm(false);
                        setNewMcpName('');
                        setNewMcpUrl('');
                        setNewMcpEnv('');
                        setMcpServerType('remote');
                        setMcpError('');
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
                    Press Enter to add &middot; Esc to cancel
                  </Box>
                </Box>
              )}

              {/* Error Message */}
              {mcpError && (
                <Box className="text-red-400 text-xs text-center py-2">
                  {mcpError}
                </Box>
              )}

              {mcpServers.length > 0 ? (
                /* Server List */
                <Box className="space-y-2">
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
                          // Save to storage when server is updated
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
                  <CableIcon sx={{ fontSize: 48, color: 'var(--sl-text-faint)', mb: 2 }} />
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

        </Box>
      )}

      {/* Vertical Tab Bar on Right Edge */}
      <Box
        className="border-l border-gray-900"
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
              onClick={() => !selectedProject?.system && setActiveSection(activeSection === 'documents' ? null : 'documents')}
              disabled={selectedProject?.system}
              sx={{
                color: activeSection === 'documents' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                bgcolor: activeSection === 'documents' ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
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
        <Tooltip title={"Skills"} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => setActiveSection(activeSection === 'rules' ? null : 'rules')}
              sx={{
                color: activeSection === 'rules' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                bgcolor: activeSection === 'rules' ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color:  'var(--sl-brand-primary)',
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
              <RuleOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="MCP Servers" placement="left">
          <span>
            <IconButton
              onClick={() => { setShowAddMcpForm(false); setMcpError(''); setActiveSection(activeSection === 'mcp' ? null : 'mcp'); }}
              sx={{
                color: activeSection === 'mcp' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                bgcolor: activeSection === 'mcp' ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
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
              <CableIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

      </Box>
    </Box>
  );
}
