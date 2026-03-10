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
import { useMemo, useState, useEffect, useRef } from 'react';
import { documentService } from '@/app/services/document.service';
import { mcpServerService, McpServer, McpServerRegistrationResponse } from '@/app/services/mcp-server.service';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  projectRules: string;
  isSavingRules: boolean;
  onSaveRules: (rules: string) => void;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
  user: any;
  setUser: (user: any) => void;
}

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  projectRules,
  isSavingRules,
  onSaveRules,
  onAddDocument,
  onDeleteDocument,
  user,
  setUser,
}: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<'rules' | 'documents' | 'mcp' | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; status: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentRulesValue, setCurrentRulesValue] = useState('');
  const initialLoadRef = useRef<boolean>(true);

  // MCP Servers state
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [isLoadingMcp, setIsLoadingMcp] = useState(false);
  const [mcpError, setMcpError] = useState('');
  const [showAddMcpForm, setShowAddMcpForm] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  // Token authentication state
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [mcpToken, setMcpToken] = useState('');
  const [pendingServerUrl, setPendingServerUrl] = useState('');
  // mcpToDelete can be used for deletion confirmation dialog if needed
  const [, setMcpToDelete] = useState<McpServer | null>(null);

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
      'code',
    ] as const,
    minHeight: '300px',
    placeholder: 'Add rules or guidelines for this project...',
  }), [selectedProject?.id]);

  // Collapse sidebar when project changes or when system project is selected
  useEffect(() => {
    setActiveSection(null);
  }, [selectedProject?.id]);

  // Ensure sidebar is collapsed for system projects
  useEffect(() => {
    if (selectedProject?.system && (activeSection === 'rules' || activeSection === 'documents')) {
      setActiveSection(null);
    }
  }, [selectedProject?.system, activeSection]);

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

  // Load MCP servers when section is opened
  useEffect(() => {
    if (activeSection === 'mcp' && selectedProject?.id) {
      loadMcpServers();
    }
  }, [activeSection, selectedProject?.id]);

  // Auto-connect stored MCP servers on app start/project change
  useEffect(() => {
    const initializeMcpServers = async () => {
      if (!selectedProject?.id) return;

      console.log('[MCP Init] Checking for stored MCP servers...');
      const storedServers = await mcpServerService.loadMcpServersFromStorage(selectedProject.id);

      if (storedServers.length > 0) {
        console.log(`[MCP Init] Found ${storedServers.length} stored servers, auto-connecting...`);
        setIsLoadingMcp(true);

        try {
          const results = await mcpServerService.autoConnectStoredServers(selectedProject.id);

          // Update state with connected servers
          const apiResult = await mcpServerService.getMcpServers(selectedProject.id);
          if (apiResult.success && apiResult.data) {
            setMcpServers(apiResult.data as McpServer[]);
          }

          const connectedCount = results.filter(r => r.success).length;
          console.log(`[MCP Init] Auto-connected ${connectedCount}/${storedServers.length} servers`);
        } catch (error: any) {
          console.error('[MCP Init] Error during auto-connect:', error);
        } finally {
          setIsLoadingMcp(false);
        }
      }
    };

    initializeMcpServers();
  }, [selectedProject?.id]);

  // Listen for MCP authorization callback from Electron
  useEffect(() => {
    const electronWindow = window as any;
    if (electronWindow.electronAPI?.onMcpAuthCallback) {
      electronWindow.electronAPI.onMcpAuthCallback(async (data: { serverId?: string; error?: string }) => {
        console.log('[MCP Auth] Callback received:', data);
        if (data.error) {
          setMcpError(data.error);
        } else if (data.serverId && selectedProject?.id) {
          // Fetch the server list to show the new server
          // McpServerItem will handle auto-connecting
          console.log('[MCP Auth] Fetching server list...');
          const listResult = await mcpServerService.getMcpServers(selectedProject.id);

          if (listResult.success && listResult.data) {
            const servers = listResult.data as McpServer[];
            setMcpServers(servers);

            // Save to storage so the server persists
            await mcpServerService.saveMcpServersToStorage(selectedProject.id, servers);
            console.log('[MCP Auth] Server added, auto-connect will be handled by component');
          } else {
            setMcpError(listResult.error || 'Failed to load MCP servers after authorization');
          }
        }
      });

      return () => {
        electronWindow.electronAPI?.removeMcpAuthCallbackListener?.();
      };
    }
  }, [selectedProject?.id]);

  const loadMcpServers = async () => {
    if (!selectedProject?.id) return;

    setIsLoadingMcp(true);
    setMcpError('');

    try {
      const result = await mcpServerService.getMcpServers(selectedProject.id);
      if (result.success && result.data) {
        const servers = result.data as McpServer[];
        setMcpServers(servers);
        // Save to local storage for persistence
        await mcpServerService.saveMcpServersToStorage(selectedProject.id, servers);
      } else {
        setMcpError(result.error || 'Failed to load MCP servers');
      }
    } catch (error: any) {
      setMcpError(error.message || 'An error occurred');
    } finally {
      setIsLoadingMcp(false);
    }
  };

  const handleAddMcpServer = async () => {
    if (!selectedProject?.id || !newMcpUrl.trim()) return;

    setIsAddingMcp(true);
    setMcpError('');

    try {
      // First, register the MCP server to determine auth type
      console.log('[MCP] Registering server:', newMcpUrl.trim());
      const registerResult = await mcpServerService.registerMcpServer(
        selectedProject.id,
        newMcpUrl.trim()
      );

      if (!registerResult.success || !registerResult.data) {
        setMcpError(registerResult.error || 'Failed to register MCP server');
        return;
      }

      const registrationData = registerResult.data as McpServerRegistrationResponse;
      console.log('[MCP] Registration response:', registrationData);

      const authType = registrationData.auth_type;

      if (authType === 'oauth') {
        // OAuth flow - redirect to auth URL (check multiple possible field names)
        const responseData = registrationData as Record<string, any>;
        const authUrl = responseData.auth_url || responseData.authorization_url || responseData.url || responseData.redirect_url;

        console.log('[MCP] OAuth response data:', responseData);
        console.log('[MCP] Auth URL:', authUrl);

        if (authUrl) {
          setNewMcpName('');
          setNewMcpUrl('');
          setShowAddMcpForm(false);

          console.log('[MCP] OAuth flow - opening auth URL:', authUrl);
          const electronWindow = window as any;
          if (electronWindow.electronAPI?.openExternal) {
            electronWindow.electronAPI.openExternal(authUrl);
          } else {
            window.open(authUrl, '_blank');
          }
        } else {
          console.error('[MCP] OAuth required but no auth URL found in response:', responseData);
          setMcpError('OAuth required but no authorization URL provided. Check console for details.');
        }
      } else if (authType === 'token') {
        // Token flow - show token input
        console.log('[MCP] Token flow - switching to token input mode');
        setPendingServerUrl(newMcpUrl.trim());
        setShowTokenInput(true);
        setNewMcpUrl('');
        setNewMcpName('');
      } else {
        // No auth required - server registered successfully, reload list
        console.log('[MCP] No auth required - server registered');
        setNewMcpName('');
        setNewMcpUrl('');
        setShowAddMcpForm(false);
        loadMcpServers();
      }
    } catch (error: any) {
      console.error('[MCP] Error adding server:', error);
      setMcpError(error.message || 'An error occurred');
    } finally {
      setIsAddingMcp(false);
    }
  };

  const handleTokenSubmit = async () => {
    if (!selectedProject?.id || !pendingServerUrl || !mcpToken.trim()) return;

    setIsAddingMcp(true);
    setMcpError('');

    try {
      console.log('[MCP] Submitting token for:', pendingServerUrl);
      const result = await mcpServerService.authenticateWithToken(
        selectedProject.id,
        pendingServerUrl,
        mcpToken.trim()
      );

      if (result.success) {
        console.log('[MCP] Token authentication successful');
        // Reset form state
        setShowTokenInput(false);
        setShowAddMcpForm(false);
        setMcpToken('');
        setPendingServerUrl('');
        // Reload server list
        loadMcpServers();
      } else {
        setMcpError(result.error || 'Failed to authenticate with token');
      }
    } catch (error: any) {
      console.error('[MCP] Error submitting token:', error);
      setMcpError(error.message || 'An error occurred');
    } finally {
      setIsAddingMcp(false);
    }
  };

  const handleCancelTokenInput = () => {
    setShowTokenInput(false);
    setMcpToken('');
    setPendingServerUrl('');
    setMcpError('');
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
      setUploadProgress({ percent: 0, status: 'Processing...' });
      const localResult = await documentService.addLocalDocument(tempPath, (progress) => {
        setUploadProgress(progress);
      });
      setUploadProgress(null);
      if (!localResult.success) {
        throw new Error(localResult.error || 'Upload failed');
      }

      const uploadedDocument = localResult.data;

      // Update user state
      if (user) {
        const updatedProjects = user.projects.map((p: any) => {
          if (p.id === selectedProject.id) {
            const updatedDocs = [...(p.documents || []), uploadedDocument];
            return { ...p, documents: updatedDocs };
          }
          return p;
        });

        const updatedUser = { ...user, projects: updatedProjects };
        setUser(updatedUser);
      }

      window.dispatchEvent(new CustomEvent('documentUploaded', {
        detail: { projectId: selectedProject.id }
      }));

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
              {activeSection === 'documents' ? 'Documents' : activeSection === 'rules' ? 'Rules' : activeSection === 'mcp' ? 'MCP Servers' : ''}
            </span>
            {selectedProject && activeSection === 'documents' && currentProjectData?.documents?.length > 0 && (
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
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-normal rounded-sm transition-all ${
                  isSavingRules
                    ? 'text-pink-400 border border-pink-400 cursor-wait'
                    : hasUnsavedChanges
                    ? 'text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400'
                    : 'text-pink-500 border border-pink-400 cursor-default'
                }`}
              >
                {isSavingRules ? (
                  <>
                    <CircularProgress size={10} sx={{ color: '#f9a8d4' }} />
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
            {selectedProject && activeSection === 'mcp' && !showAddMcpForm && !showTokenInput && (
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
                <li>- Use markdown to format the rules.</li>
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
            currentProjectData?.documents && currentProjectData.documents.length > 0 ? (
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
                        <SearchIcon sx={{ fontSize: 18, color: '#9ca3af' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    width: '100%',
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      fontSize: '0.75rem',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(236, 72, 153, 0.3)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#ec4899',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#fff',
                      padding: '8px 12px',
                      '&::placeholder': {
                        color: '#9ca3af',
                        opacity: 1,
                      },
                    },
                  }}
                />
              <Box className="space-y-2">
                {currentProjectData.documents
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
                      bgcolor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.04)',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
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
                          bgcolor: 'rgba(236, 72, 153, 0.12)',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '2px',
                        }}
                      >
                        <InsertDriveFileIcon sx={{ fontSize: 16, color: '#ec4899' }} />
                      </Box>

                      {/* Document Content */}
                      <Box className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-white font-medium truncate">
                            {(doc.path || doc.source) ? ((doc.path || doc.source).split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Untitled Document') : (doc.filename || doc.name || 'Untitled Document')}
                          </span>
                          {/* Delete Icon - Appears on Hover */}
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
                                color: '#9ca3af',
                                bgcolor: 'rgba(239, 68, 68, 0.08)',
                                padding: '4px',
                                '&:hover': {
                                  color: '#ef4444',
                                  bgcolor: 'rgba(239, 68, 68, 0.15)',
                                },
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </div>

                        {/* Document Summary/Markdown Preview */}
                        {(doc.summary || doc.markdown) && (
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
                  className={`border-2 border-dashed rounded-sm p-8 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-gray-700 hover:border-pink-600 bg-gray-900/50'
                  }`}
                >
                  {isUploading ? (
                    <Box className="flex flex-col items-center gap-3 py-2">
                      <CloudUploadIcon sx={{ fontSize: 40, color: '#ec4899' }} />
                      <Box className="text-gray-300 text-sm">
                        {uploadProgress ? `${uploadProgress.status}` : 'Uploading...'}
                      </Box>
                      {uploadProgress && (
                        <Box sx={{ width: '100%', px: 2 }}>
                          <Box sx={{
                            width: '100%',
                            height: 6,
                            bgcolor: '#2a2a2a',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}>
                            <Box sx={{
                              height: '100%',
                              width: `${uploadProgress.percent}%`,
                              bgcolor: '#ec4899',
                              borderRadius: '3px',
                              transition: 'width 0.3s ease',
                            }} />
                          </Box>
                          <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginTop: '6px', textAlign: 'center' }}>
                            {uploadProgress.percent > 0 ? `${uploadProgress.percent}%` : ''}
                          </span>
                        </Box>
                      )}
                      {!uploadProgress && <CircularProgress size={24} sx={{ color: '#ec4899' }} />}
                    </Box>
                  ) : (
                    <>
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
                    </>
                  )}
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
            {showAddMcpForm && !showTokenInput && (
              <Box
                sx={{
                  padding: '12px',
                  borderRadius: '6px',
                  bgcolor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <TextField
                  size="small"
                  placeholder="Server name (optional)"
                  value={newMcpName}
                  onChange={(e) => setNewMcpName(e.target.value)}
                  fullWidth
                  sx={{
                    mb: 1.5,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                      '&:hover fieldset': { borderColor: 'rgba(236, 72, 153, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#ec4899' },
                    },
                    '& .MuiInputBase-input': {
                      color: '#fff',
                      padding: '8px 12px',
                      '&::placeholder': { color: '#9ca3af', opacity: 1 },
                    },
                  }}
                />
                <TextField
                  size="small"
                  placeholder="Server URL (e.g., https://mcp.example.com)"
                  value={newMcpUrl}
                  onChange={(e) => setNewMcpUrl(e.target.value)}
                  fullWidth
                  sx={{
                    mb: 1.5,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                      '&:hover fieldset': { borderColor: 'rgba(236, 72, 153, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#ec4899' },
                    },
                    '& .MuiInputBase-input': {
                      color: '#fff',
                      padding: '8px 12px',
                      '&::placeholder': { color: '#9ca3af', opacity: 1 },
                    },
                  }}
                />
                <Box className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddMcpForm(false);
                      setNewMcpName('');
                      setNewMcpUrl('');
                      setMcpError('');
                    }}
                    className="px-3 py-1.5 text-[10px] text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddMcpServer}
                    disabled={isAddingMcp || !newMcpUrl.trim()}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[10px] rounded-sm transition-all ${
                      isAddingMcp || !newMcpUrl.trim()
                        ? 'text-gray-500 bg-gray-800 cursor-not-allowed'
                        : 'text-white bg-pink-600 hover:bg-pink-500 cursor-pointer'
                    }`}
                  >
                    {isAddingMcp ? (
                      <>
                        <CircularProgress size={10} sx={{ color: '#fff' }} />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <span>Add Server</span>
                    )}
                  </button>
                </Box>
              </Box>
            )}

            {/* Token Input Form */}
            {showTokenInput && (
              <Box
                sx={{
                  padding: '12px',
                  borderRadius: '6px',
                  bgcolor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                }}
              >
                <Box className="text-xs text-gray-300 mb-3">
                  <span className="text-pink-400 font-medium">Token Required</span>
                  <br />
                  <span className="text-gray-500 text-[10px]">
                    Server: {pendingServerUrl}
                  </span>
                </Box>
                <TextField
                  size="small"
                  placeholder="Enter authentication token"
                  value={mcpToken}
                  onChange={(e) => setMcpToken(e.target.value)}
                  type="password"
                  fullWidth
                  autoFocus
                  sx={{
                    mb: 1.5,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'rgba(236, 72, 153, 0.3)' },
                      '&:hover fieldset': { borderColor: 'rgba(236, 72, 153, 0.5)' },
                      '&.Mui-focused fieldset': { borderColor: '#ec4899' },
                    },
                    '& .MuiInputBase-input': {
                      color: '#fff',
                      padding: '8px 12px',
                      '&::placeholder': { color: '#9ca3af', opacity: 1 },
                    },
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mcpToken.trim()) {
                      handleTokenSubmit();
                    }
                  }}
                />
                <Box className="flex justify-end gap-2">
                  <button
                    onClick={handleCancelTokenInput}
                    className="px-3 py-1.5 text-[10px] text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTokenSubmit}
                    disabled={isAddingMcp || !mcpToken.trim()}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[10px] rounded-sm transition-all ${
                      isAddingMcp || !mcpToken.trim()
                        ? 'text-gray-500 bg-gray-800 cursor-not-allowed'
                        : 'text-white bg-pink-600 hover:bg-pink-500 cursor-pointer'
                    }`}
                  >
                    {isAddingMcp ? (
                      <>
                        <CircularProgress size={10} sx={{ color: '#fff' }} />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <span>Submit Token</span>
                    )}
                  </button>
                </Box>
              </Box>
            )}

            {/* Error Message */}
            {mcpError && (
              <Box className="text-red-400 text-xs text-center py-2">
                {mcpError}
              </Box>
            )}

            {/* Loading State */}
            {isLoadingMcp ? (
              <Box className="flex items-center justify-center py-8">
                <CircularProgress size={24} sx={{ color: '#ec4899' }} />
              </Box>
            ) : mcpServers.length > 0 ? (
              /* Server List */
              <Box className="space-y-2">
                {mcpServers.map((server, index) => (
                  <McpServerItem
                    key={server.id || `mcp-${index}`}
                    server={server}
                    projectId={selectedProject?.id || ''}
                    onDelete={handleDeleteMcpServer}
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
                <CableIcon sx={{ fontSize: 48, color: '#4b5563', mb: 2 }} />
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
          bgcolor: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <Tooltip title={selectedProject?.system ? "Documents (Disabled)" : "Documents"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => !selectedProject?.system && setActiveSection(activeSection === 'documents' ? null : 'documents')}
              disabled={selectedProject?.system}
              sx={{
                color: activeSection === 'documents' ? '#ec4899' : '#9ca3af',
                bgcolor: activeSection === 'documents' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? '#9ca3af' : '#ec4899',
                  bgcolor: selectedProject?.system ? 'rgba(255, 255, 255, 0.05)' : 'rgba(236, 72, 153, 0.1)',
                },
                '&.Mui-disabled': {
                  color: '#6b7280',
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
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
        <Tooltip title={selectedProject?.system ? "Rules (Disabled)" : "Rules"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => !selectedProject?.system && setActiveSection(activeSection === 'rules' ? null : 'rules')}
              disabled={selectedProject?.system}
              sx={{
                color: activeSection === 'rules' ? '#ec4899' : '#9ca3af',
                bgcolor: activeSection === 'rules' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? '#9ca3af' : '#ec4899',
                  bgcolor: selectedProject?.system ? 'rgba(255, 255, 255, 0.05)' : 'rgba(236, 72, 153, 0.1)',
                },
                '&.Mui-disabled': {
                  color: '#6b7280',
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
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
        <Tooltip title="MCP Servers (Coming Soon)" placement="left">
          <span className='cursor-not-allowed'>
            <IconButton
              onClick={() => {}}
              disabled={true}
              sx={{
                color: activeSection === 'mcp' ? '#ec4899' : '#9ca3af',
                bgcolor: activeSection === 'mcp' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                padding: '10px',
                borderRadius: '8px',
                cursor: user?.guest ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: user?.guest ? '#9ca3af' : '#ec4899',
                  bgcolor: user?.guest ? 'rgba(255, 255, 255, 0.05)' : 'rgba(236, 72, 153, 0.1)',
                },
                '&.Mui-disabled': {
                  color: '#6b7280',
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
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
