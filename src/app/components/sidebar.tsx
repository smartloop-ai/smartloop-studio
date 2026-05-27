import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, IconButton, Menu, MenuItem, Dialog, CircularProgress, TextField, Typography, Tooltip } from '@mui/material';
import { conversationService } from '../services/conversation.service';
import { projectService } from '../services/project.service';
import SearchIcon from '@mui/icons-material/Search';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginIcon from '@mui/icons-material/Login';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { storageService } from '@/app/services/storage.service';
import { dialogStyles } from '@/app/shared/utils';
import { DEFAULT_COLOR, PROJECT_COLORS } from '@/app/constants';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

// Get color for project - use project's color if exists, otherwise default to pink
const getColorForProject = (project: any): string => {
  if (project && project?.color) {
    return project.color;
  }
  return DEFAULT_COLOR;
};

export default function Sidebar({ user, mobileOpen, onMobileClose }: { user?: any, mobileOpen?: boolean, onMobileClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [openCreateProjectDialog, setOpenCreateProjectDialog] = useState(false);
  const [createStep, setCreateStep] = useState<'choose' | 'details'>('choose');
  const [createSource, setCreateSource] = useState<'blank' | 'existing'>('blank');
  const [createZipPath, setCreateZipPath] = useState<string | null>(null);
  const [createProjectName, setCreateProjectName] = useState('');
  const [createProjectColor, setCreateProjectColor] = useState(DEFAULT_COLOR);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState('');
  const [deleteProjectError, setDeleteProjectError] = useState('');
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [localProjects, setLocalProjects] = useState<any[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [authUser, setAuthUser] = useState<any>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loggingOutRef = useRef(false);

  // Check auth status on mount and listen for changes
  useEffect(() => {
    // Initial auth check — wait for full profile (includes is_paid) before showing user
    const checkAuth = async () => {
      if (loginPollRef.current || loggingOutRef.current) return;
      try {
        if (window.electronAPI?.slpAuthStatus) {
          const status = await window.electronAPI.slpAuthStatus();
          if (status?.success && status?.has_access_token && status?.user) {
            // Fetch full profile so we have is_paid before rendering
            const result = await window.electronAPI.slpFetchUser({ force: false });
            const fullUser = result?.success && result.user
              ? { ...status.user, ...result.user }
              : status.user;
            setAuthUser(fullUser);
            window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: true, user: fullUser } }));
          } else {
            setAuthUser(null);
          }
        }
      } catch { setAuthUser(null); }
    };
    checkAuth();

    // Listen for user profile updates broadcast from main process (handles focus refresh, login, etc.)
    const handleProfileUpdated = (event: CustomEvent) => {
      if (event.detail && !loggingOutRef.current) {
        setAuthUser((prev: any) => prev ? { ...prev, ...event.detail } : event.detail);
        window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: true, user: event.detail } }));
      }
    };
    window.addEventListener('userProfileUpdated', handleProfileUpdated as EventListener);

    return () => {
      if (loginPollRef.current) {
        clearInterval(loginPollRef.current);
        loginPollRef.current = null;
      }
      window.removeEventListener('userProfileUpdated', handleProfileUpdated as EventListener);
    };
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      if (isElectron && window.electronAPI) {
        const result = await window.electronAPI.oauthLogin() as any;
        if (result?.status === 'error') {
          console.error('Login error:', result.error);
          setIsLoggingIn(false);
          return;
        }
        // Poll auth/status until authenticated
        loginPollRef.current = setInterval(async () => {
          try {
            const status = await window.electronAPI!.slpAuthStatus();
            if (status?.success && status?.has_access_token && status?.user) {
              if (loginPollRef.current) {
                clearInterval(loginPollRef.current);
                loginPollRef.current = null;
              }
              // Fetch full profile before showing user to avoid "Free" flash
              const profileResult = await window.electronAPI!.slpFetchUser({ force: true });
              const fullUser = profileResult?.success && profileResult.user
                ? { ...status.user, ...profileResult.user }
                : status.user;
              setAuthUser(fullUser);
              setIsLoggingIn(false);
              window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: true, user: fullUser } }));
            }
          } catch { }
        }, 2000);
      }
    } catch (error) {
      console.error('Login error:', error);
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    // Stop any active login polling
    if (loginPollRef.current) {
      clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
    setIsLoggingIn(false);
    loggingOutRef.current = true;
    // Delete token first so no in-flight or subsequent checkAuth can re-read it
    if (window.electronAPI?.slpAuthLogout) {
      await window.electronAPI.slpAuthLogout();
    }
    setAuthUser(null);
    setAnchorEl(null);
    loggingOutRef.current = false;
    window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: false } }));
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Load conversations on user change
  useEffect(() => {
    if (!user) return;
    if (isElectron) {
      refreshConversations();
    } else {
      const conversations = (user?.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
      setConversations(conversations);
    }
  }, [user]);



  // Load projects from local API (enriched with local UI metadata like color)
  const loadLocalProjects = async () => {
    const projects = await projectService.getProjects();
    setLocalProjects(projects);
    return projects;
  };

  const autoSelectFirstProject = async (projects?: any[]) => {
    const hash = window.location.hash;
    const queryStart = hash.indexOf('?');
    const params = new URLSearchParams(queryStart >= 0 ? hash.slice(queryStart) : '');
    if (params.get('project') || params.get('conversation')) return;
    const list = projects ?? await projectService.getProjects();
    if (list.length === 0) return;
    const target = list.find((p: any) => p.system) ?? list[0];
    navigate(`/?project=${target.id}`, { replace: true });
  };

  // Load projects and conversations on mount and when user.projects changes
  const sidebarInitRef = useRef(false);
  useEffect(() => {
    if (!sidebarInitRef.current) {
      sidebarInitRef.current = true;
    }
    loadLocalProjects();
    refreshConversations();
  }, [user?.projects?.length]);

  // Reload when SLP service becomes ready (may fire after initial load)
  useEffect(() => {
    const handleServiceReady = async () => {
      const projects = await loadLocalProjects();
      await refreshConversations();
      await autoSelectFirstProject(projects);
    };
    window.addEventListener('slpServiceReady', handleServiceReady);
    // Also check immediately in case event already fired
    loadLocalProjects().then(autoSelectFirstProject);
    return () => window.removeEventListener('slpServiceReady', handleServiceReady);
  }, []);

  // Reload when bootstrap completes so newly downloaded models/projects appear
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onBootstrapComplete) return;
    const handleBootstrapComplete = async () => {
      const projects = await loadLocalProjects();
      await refreshConversations();
      await autoSelectFirstProject(projects);
    };
    window.electronAPI.onBootstrapComplete(handleBootstrapComplete);
    return () => window.electronAPI!.removeBootstrapCompleteListener?.();
  }, []);

  // Load conversations from SQLite (local mode) or user service (remote)
  const refreshConversations = async (): Promise<any[]> => {
    try {
      const convos = await storageService.getConversations(undefined, 'desc');
      setConversations(convos);
      return convos;
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  };

  // Listen for conversation and project changes
  useEffect(() => {
    const handleConversationChange = () => { refreshConversations(); };
    const handleProjectChanged = async () => { await loadLocalProjects(); await refreshConversations(); };

    window.addEventListener('conversationCreated', handleConversationChange);
    window.addEventListener('conversationDeleted', handleConversationChange);
    window.addEventListener('conversationUpdated', handleConversationChange);
    window.addEventListener('projectDeleted', handleProjectChanged);
    window.addEventListener('projectUpdated', handleProjectChanged);

    return () => {
      window.removeEventListener('conversationCreated', handleConversationChange);
      window.removeEventListener('conversationDeleted', handleConversationChange);
      window.removeEventListener('conversationUpdated', handleConversationChange);
      window.removeEventListener('projectDeleted', handleProjectChanged);
      window.removeEventListener('projectUpdated', handleProjectChanged);
    };
  }, []);

  const handleSettings = () => {
    navigate('/settings');
    onMobileClose?.();
  };

  const navItems: { icon: React.ReactNode, label: string, path: string }[] = [];

  // Delete conversation handler
  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteConversation = async () => {
    if (!conversationToDelete) return;

    setIsDeleting(true);

    try {
      const result = await conversationService.deleteConversation(conversationToDelete);

      if (result.success) {
        // Reload conversations from local storage
        await refreshConversations();

        // Check remaining conversation count from SQLite
        const remaining = await storageService.getConversations();

        // Dispatch event for other components to react to conversation deletion
        window.dispatchEvent(new CustomEvent('conversationDeleted', {
          detail: { conversationId: conversationToDelete }
        }));

        if (remaining.length === 0) {
          // No conversations left — go to home
          navigate('/', { replace: true });
        } else {
          // If currently viewing this conversation, navigate to most recent
          const currentPath = location.pathname + location.search;
          if (currentPath.includes(conversationToDelete)) {
            const sorted = remaining.sort((a: any, b: any) =>
              new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
            );
            const mostRecent = sorted[0];
            const projectId = mostRecent.project_id;
            if (projectId) {
              navigate(`/?conversation=${mostRecent.id}&project=${projectId}`, { replace: true });
            } else {
              navigate(`/?conversation=${mostRecent.id}`, { replace: true });
            }
          }
        }

        // Close dialog
        setDeleteDialogOpen(false);
        setConversationToDelete(null);
      } else {
        console.error('Failed to delete conversation:', result.error);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Get recent conversations from user
  const getRecentChats = () => {
    // Ensure conversations is always an array before iterating
    if (!conversations || !Array.isArray(conversations) || conversations.length === 0) return [];

    // Get conversations from local storage
    const recentConversations = conversations
      .map((conversation: any) => {
        let lastMessage = null;

        if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
          const lastMsg = conversation.messages.at(-1);
          lastMessage = lastMsg?.content || null;
        }

        return {
          id: conversation.id,
          name: conversation.title || 'Untitled Conversation',
          project_id: conversation.project_id || null,
          lastMessage,
          createdAt: conversation.created_at || new Date(),
        };
      })
      .filter((conv: any) => conv.id && conv.project_id)
      .slice(0, 3);

    return recentConversations;
  };

  const recentChats = getRecentChats();

  // Search functionality - filter projects only
  const filteredProjects = useMemo(() => {
    let projects = localProjects;

    // Apply search filter if there's a query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      projects = projects.filter((project: any) => {
        const title = (project.name || '').toLowerCase();
        return title.includes(query);
      });
    }

    // Sort projects: system projects first, then others
    return projects.sort((a: any, b: any) => {
      // System projects always come first
      if (a.system && !b.system) return -1;
      if (!a.system && b.system) return 1;

      // For non-system projects, maintain original order (or could sort by name)
      return 0;
    });
  }, [searchQuery, localProjects]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setSearchQuery('');
      searchInputRef.current?.blur();
    }
  };

  const handleProjectClick = async (projectId: string | null) => {
    // Refresh conversations first to ensure we have the latest data including newly created ones
    const freshConversations = await refreshConversations();

    // Use the returned data directly (React state may not be updated yet)
    const allConversations = (freshConversations && Array.isArray(freshConversations)) ? freshConversations : [];

    // If no projectId provided, navigate to system project
    if (!projectId) {
      // Find system project
      const systemProject = user?.projects?.find((p: any) => p.system === true);
      if (systemProject) {
        projectId = systemProject.id;
      } else {
        console.error('[Sidebar] No system project found');
        return;
      }
    }

    // For projects, auto-select the most recent conversation
    try {
      const projectConversations = allConversations.filter(
        (conv: any) => conv.project_id === projectId
      );

      if (projectConversations.length > 0) {
        // Sort by updated_at (most recent first) and navigate to the most recent
        const sorted = projectConversations.sort((a: any, b: any) => {
          const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
          const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
          return dateB - dateA;
        });
        const mostRecent = sorted[0];
        console.log('[Sidebar] Auto-selecting most recent project conversation:', mostRecent.id, 'for project:', projectId);
        navigate(`/?conversation=${mostRecent.id}&project=${projectId}`);
      } else {
        // No conversations for this project, navigate to project view
        console.log('[Sidebar] No conversations for project, showing project view');
        navigate(`/?project=${projectId}`);
      }
    } catch (error) {
      console.error('Error handling project click:', error);
      navigate(`/?project=${projectId}`);
    }

    setSearchQuery('');
    onMobileClose?.();
  };

  const handleOpenCreateProjectDialog = () => {
    setImportError('');
    setIsDragOver(false);
    setOpenCreateProjectDialog(true);
  };

  const handleCloseCreateProjectDialog = () => {
    setOpenCreateProjectDialog(false);
    setCreateStep('choose');
    setCreateSource('blank');
    setCreateZipPath(null);
    setCreateProjectName('');
    setCreateProjectColor(DEFAULT_COLOR);
    setImportError('');
    setIsDragOver(false);
  };

  const handleImportFromZip = async (zipPath: string, name?: string) => {
    setImportError('');
    setIsImporting(true);

    try {
      const resolvedName = createProjectName.trim() || name;
      const overrides: { name?: string; color: string } = { color: createProjectColor };
      if (resolvedName) overrides.name = resolvedName;
      const result = await window.electronAPI?.importProject(zipPath, overrides);

      if (!result?.success) {
        setImportError(result?.error || 'Import failed');
        setIsImporting(false);
        return;
      }

      const projectId = result.project.id;

      // Persist name and color to local SQLite metadata
      const meta: { color: string; name?: string } = { color: createProjectColor };
      if (resolvedName) meta.name = resolvedName;
      await storageService.updateProjectMeta(projectId, meta);

      const updatedProjects = await projectService.getProjects();
      setLocalProjects(updatedProjects);

      await refreshConversations();

      if (user) {
        const updatedUser = { ...user, projects: updatedProjects };
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
      }

      handleCloseCreateProjectDialog();
      navigate(`/?project=${projectId}`);
    } catch (error: any) {
      console.error('Error importing project:', error);
      setImportError(error.message || 'An error occurred while importing the project.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportBrowse = async () => {
    const filePath = await window.electronAPI?.selectFile?.([
      { name: 'ZIP Archive', extensions: ['zip'] },
    ]);
    if (!filePath) return;

    if (!filePath.endsWith('.zip')) {
      setImportError('Please select a .zip file');
      return;
    }

    const fileName = filePath.split(/[/\\]/).pop() || 'project.zip';
    const baseName = fileName.replace(/\.zip$/i, '').replace(/[_-]/g, ' ');
    setCreateZipPath(filePath);
    setCreateProjectName(baseName);
    setCreateSource('existing');
    setCreateStep('details');
  };

  const handleImportDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.zip')) {
      setImportError('Please select a .zip file');
      return;
    }

    let filePath = (file as any).path;
    if (!filePath) {
      const buffer = await file.arrayBuffer();
      filePath = await window.electronAPI?.saveTempFile(file.name, buffer);
    }
    if (!filePath) {
      setImportError('Failed to read dropped file');
      return;
    }

    const baseName = file.name.replace(/\.zip$/i, '').replace(/[_-]/g, ' ');
    setCreateZipPath(filePath);
    setCreateProjectName(baseName);
    setCreateSource('existing');
    setCreateStep('details');
  };

  const handleImportDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleImportDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    const projectName = projectToDelete.name || '';
    if (deleteProjectConfirm !== projectName) {
      setDeleteProjectError('Project name does not match');
      return;
    }

    setIsDeletingProject(true);
    setDeleteProjectError('');

    try {
      const result = await projectService.deleteProject(projectToDelete.id);

      if (result.success) {
        // Refresh projects and notify listeners that conversations were removed
        await loadLocalProjects();
        window.dispatchEvent(new CustomEvent('conversationDeleted', { detail: { projectId: projectToDelete.id } }));
        window.dispatchEvent(new CustomEvent('projectDeleted', { detail: { projectId: projectToDelete.id } }));

        // Navigate to home after deletion
        navigate('/');
        setShowDeleteProjectDialog(false);
        setProjectToDelete(null);
        setDeleteProjectConfirm('');
      } else {
        setDeleteProjectError(result.error || 'Failed to delete project');
      }
    } catch (error: any) {
      console.error('Error deleting project:', error);
      setDeleteProjectError('An error occurred while deleting the project');
    } finally {
      setIsDeletingProject(false);
    }
  };

  const sidebarContent = (
    <>
      {/* Logo with Mobile Close Button */}
      <Box sx={{
        px: 3,
        py: 2.5,
        borderBottom: '1px solid var(--sl-white-alpha-5)',
        bgcolor: 'var(--sl-white-alpha-2)',
      }}>
        <Box className="flex items-center justify-between">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            <span className="text-xl font-semibold text-white tracking-tight">smartloop</span>
            <span className="text-pink-500 text-xl font-semibold">.</span>
          </Box>
          {mobileOpen && (
            <IconButton
              onClick={onMobileClose}
              sx={{
                display: { xs: 'flex', md: 'none' },
                color: 'var(--sl-white-alpha-50)',
                '&:hover': { color: 'white', bgcolor: 'var(--sl-white-alpha-8)' },
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2.5, py: 2, position: 'relative' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'var(--sl-white-alpha-5)',
            borderRadius: '7px',
            padding: '7px 11px',
            border: '1px solid var(--sl-white-alpha-8)',
            transition: 'all 0.15s ease',
            '&:focus-within': {
              borderColor: 'var(--sl-brand-alpha-50)',
              bgcolor: 'var(--sl-white-alpha-7)',
              boxShadow: '0 0 0 3px var(--sl-brand-alpha-10)',
            }
          }}
        >
          <SearchIcon sx={{ fontSize: 17, color: 'var(--sl-white-alpha-40)' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search projects"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-none outline-none text-white text-sm flex-1 placeholder-gray-500"
          />
          {searchQuery && (
            <IconButton
              size="small"
              onClick={clearSearch}
              sx={{
                padding: '3px',
                color: 'var(--sl-white-alpha-40)',
                '&:hover': { color: 'var(--sl-text-primary)', bgcolor: 'var(--sl-white-alpha-10)' },
                borderRadius: '4px',
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
          {!searchQuery && (
            <Box sx={{
              fontSize: '11px',
              color: 'var(--sl-white-alpha-30)',
              bgcolor: 'var(--sl-white-alpha-5)',
              px: 0.7,
              py: 0.3,
              borderRadius: '3px',
              fontWeight: 500,
              letterSpacing: '0.3px',
            }}>⌘K</Box>
          )}
        </Box>
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 1 }}>
        {/* Compute URL params once for selection logic */}
        {(() => {
          const urlParams = new URLSearchParams(location.search);
          const currentProjectId = urlParams.get('project');

          return (
            <>
              {navItems.map((item, index) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));

                return (
                  <Box
                    key={index}
                    onClick={() => {
                      navigate(item.path);
                      onMobileClose?.();
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      padding: '9px 11px',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      bgcolor: isActive ? 'var(--sl-brand-alpha-10)' : 'transparent',
                      color: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-white-alpha-60)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '13.5px',
                      transition: 'all 0.12s ease',
                      border: isActive ? '1px solid var(--sl-brand-alpha-20)' : '1px solid transparent',
                      '&:hover': {
                        bgcolor: isActive ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
                        color: isActive ? 'var(--sl-brand-primary)' : 'white',
                      },
                      mb: 0.5,
                    }}
                  >
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </Box>
                );
              })}

              {/* Project list - filtered by search */}
              {filteredProjects && filteredProjects.length > 0 && (
                filteredProjects.map((project: any) => {
                  const isActive = currentProjectId === project.id;
                  const projectName = project.name || 'Untitled Project';

                  return (
                    <Box
                      key={project.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        padding: '9px 11px',
                        borderRadius: '7px',
                        bgcolor: isActive ? 'var(--sl-brand-alpha-10)' : 'transparent',
                        color: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-white-alpha-60)',
                        fontWeight: isActive ? 600 : 500,
                        fontSize: '13.5px',
                        transition: 'all 0.12s ease',
                        border: isActive ? '1px solid var(--sl-brand-alpha-20)' : '1px solid transparent',
                        '&:hover': {
                          bgcolor: isActive ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
                          color: isActive ? 'var(--sl-brand-primary)' : 'white',
                        },
                        '&:hover .delete-icon': {
                          opacity: 1,
                        },
                        mb: 0.5,
                      }}
                    >
                      <Box
                        onClick={() => handleProjectClick(project.id)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          flex: 1,
                          cursor: 'pointer',
                          minWidth: 0,
                        }}
                      >
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '2px',
                            bgcolor: getColorForProject(project),
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1 }} className="truncate">
                          {projectName}
                        </span>
                      </Box>
                      {!project.system && (
                        <DeleteOutlineIcon
                          className="delete-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(project);
                            setDeleteProjectConfirm('');
                            setDeleteProjectError('');
                            setShowDeleteProjectDialog(true);
                          }}
                          sx={{
                            fontSize: 14,
                            opacity: 0,
                            color: 'var(--sl-white-alpha-40)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              color: 'var(--sl-status-error)',
                            },
                          }}
                        />
                      )}
                    </Box>
                  );
                })
              )}
            </>
          );
        })()}

        {/* New Project button */}
        <Tooltip title={!user?.email ? "Login to create a new project" : ""} placement="right">
          <Box
            onClick={!user?.email ? undefined : handleOpenCreateProjectDialog}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              padding: '9px 11px',
              borderRadius: '7px',
              cursor: !user?.email ? 'not-allowed' : 'pointer',
              bgcolor: 'transparent',
              color: 'var(--sl-white-alpha-40)',
              opacity: !user?.email ? 0.5 : 1,
              fontWeight: 500,
              fontSize: '13.5px',
              transition: 'all 0.12s ease',
              border: '1px solid transparent',
              ...(user?.email && {
                '&:hover': {
                  bgcolor: 'var(--sl-white-alpha-5)',
                  color: 'white',
                },
              }),
              mb: 0.5,
            }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
            <span style={{ flex: 1 }}>new project</span>
          </Box>
        </Tooltip>
      </Box>

      {/* Recent Conversations Section */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        px: 2.5,
        py: 2,
        borderTop: '1px solid var(--sl-white-alpha-5)',
        bgcolor: 'var(--sl-white-alpha-2)',
      }}>
        <Box sx={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--sl-white-alpha-40)',
          mb: 1.5,
          px: 1.5,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>Recent Conversations</Box>
        {recentChats.length > 0 ? (
          recentChats.map((chat: any) => (
            <Box
              key={chat.id}
              onClick={() => {
                if (chat.project_id) {
                  navigate(`/?conversation=${chat.id}&project=${chat.project_id}`);
                } else {
                  // Conversation without project_id - find system project or navigate without project
                  const systemProject = user?.projects?.find((p: any) => p.system === true);
                  if (systemProject) {
                    navigate(`/?conversation=${chat.id}&project=${systemProject.id}`);
                  } else {
                    navigate(`/?conversation=${chat.id}`);
                  }
                }
                onMobileClose?.();
              }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                padding: '8px 11px',
                cursor: 'pointer',
                color: 'var(--sl-white-alpha-60)',
                borderRadius: '6px',
                transition: 'all 0.12s ease',
                position: 'relative',
                '&:hover': {
                  color: 'white',
                  bgcolor: 'var(--sl-white-alpha-5)',
                },
                '&:hover .delete-icon': {
                  opacity: 1,
                },
              }}
            >
              <Box className="flex items-center gap-2 justify-between">
                <Box className="flex items-center gap-2 flex-1 min-w-0">
                  <ChatBubbleOutlineIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                  <span className="text-sm font-medium truncate">{chat.name}</span>
                </Box>
                <IconButton
                  className="delete-icon"
                  size="small"
                  onClick={(e) => handleDeleteConversation(chat.id, e)}
                  sx={{
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    padding: '4px',
                    color: 'var(--sl-white-alpha-60)',
                    '&:hover': {
                      color: 'var(--sl-brand-primary)',
                      bgcolor: 'var(--sl-brand-alpha-10)',
                    },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              <span className="text-xs text-gray-600 ml-6 truncate">
                {chat.lastMessage
                  ? (chat.lastMessage.length > 50
                    ? chat.lastMessage.substring(0, 50) + '...'
                    : chat.lastMessage)
                  : (localProjects.find((p: any) => p.id === chat.project_id)?.name || 'start a conversation')}
              </span>
            </Box>
          ))
        ) : (
          <Box className="text-xs text-gray-600 px-2">
            No conversations yet
          </Box>
        )}
      </Box>

      {/* Login / User Profile */}
      {authUser ? (
        <>
          <Box sx={{
            p: 2,
            borderTop: '1px solid var(--sl-white-alpha-5)',
            bgcolor: 'var(--sl-white-alpha-2)',
          }}>
            <Box
              onClick={handleMenuClick}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: 'pointer',
                borderRadius: '8px',
                padding: '8px',
                transition: 'all 0.12s ease',
                '&:hover': {
                  bgcolor: 'var(--sl-white-alpha-5)',
                },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  bgcolor: 'var(--sl-brand-alpha-15)',
                  border: '1.5px solid var(--sl-brand-alpha-30)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="text-pink-500 text-xs font-bold">
                  {authUser.name ? authUser.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U'}
                </span>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ color: 'white', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {authUser.name || 'User'}
                </Box>
                <Box sx={{ color: 'var(--sl-white-alpha-40)', fontSize: '11px' }}>
                  {authUser.is_paid || authUser.is_premium ? 'Pro' : 'Free'} Plan
                </Box>
              </Box>
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  color: 'var(--sl-white-alpha-40)',
                  transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease'
                }}
              />
            </Box>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
            PaperProps={{
              sx: {
                bgcolor: 'rgba(0, 0, 0, 0.98)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid var(--sl-white-alpha-10)',
                borderRadius: '8px',
                minWidth: '200px',
                mt: -1,
                ml: 1,
                boxShadow: '0 8px 32px var(--sl-black-alpha-50)',
              }
            }}
          >
            <MenuItem
              onClick={() => { handleSettings(); handleMenuClose(); }}
              sx={{ color: 'var(--sl-white-alpha-85)', fontSize: '13px', fontWeight: 500, py: 1.25, px: 2, '&:hover': { bgcolor: 'var(--sl-white-alpha-8)' } }}
            >
              <SettingsIcon sx={{ fontSize: 17, mr: 1.5, color: 'var(--sl-white-alpha-50)' }} />
              Settings
            </MenuItem>
            <Box sx={{ height: '1px', bgcolor: 'var(--sl-white-alpha-5)', my: 0.5, mx: 1 }} />
            <MenuItem
              onClick={handleLogout}
              sx={{ color: 'var(--sl-status-error)', fontSize: '13px', fontWeight: 500, py: 1.25, px: 2, '&:hover': { bgcolor: 'var(--sl-danger-alpha-10)' } }}
            >
              <LogoutIcon sx={{ fontSize: 17, mr: 1.5, color: 'var(--sl-status-error)' }} />
              Logout
            </MenuItem>
          </Menu>
        </>
      ) : (
        <Box sx={{
          px: 2.5,
          py: 2,
          borderTop: '1px solid var(--sl-white-alpha-5)',
          bgcolor: 'var(--sl-white-alpha-2)',
        }}>
          <Box
            onClick={handleLogin}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              bgcolor: 'var(--sl-brand-alpha-10)',
              border: '1px solid var(--sl-brand-alpha-20)',
              borderRadius: '8px',
              cursor: isLoggingIn ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--sl-brand-primary)',
              transition: 'all 0.15s ease',
              opacity: isLoggingIn ? 0.6 : 1,
              '&:hover': {
                bgcolor: 'var(--sl-brand-alpha-20)',
                border: '1px solid var(--sl-brand-alpha-40)',
              },
            }}
          >
            {isLoggingIn ? (
              <>
                <CircularProgress size={16} sx={{ color: 'var(--sl-brand-primary)' }} />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LoginIcon sx={{ fontSize: 18 }} />
                <span>Login</span>
              </>
            )}
          </Box>

          {/* Settings link for guests */}
          <Box
            onClick={handleSettings}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 1,
              px: 2,
              py: 1,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--sl-white-alpha-40)',
              transition: 'all 0.12s ease',
              '&:hover': {
                color: 'var(--sl-white-alpha-70)',
                bgcolor: 'var(--sl-white-alpha-5)',
              },
            }}
          >
            <SettingsIcon sx={{ fontSize: 14 }} />
            <span>Settings</span>
          </Box>
        </Box>
      )}
    </>
  );

  return (
    <>
      {/* Create Project Dialog */}
      <Dialog
        open={openCreateProjectDialog}
        onClose={handleCloseCreateProjectDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: dialogStyles.paper
        }}
        BackdropProps={{
          sx: dialogStyles.backdrop
        }}
      >
        <Box className="relative p-6">
          <IconButton
            onClick={handleCloseCreateProjectDialog}
            sx={{
              position: 'absolute',
              right: 12,
              top: 12,
              color: 'var(--sl-text-disabled)',
              '&:hover': {
                color: 'var(--sl-text-primary)',
                bgcolor: 'var(--sl-bg-surface-1)',
              },
            }}
          >
            <CloseIcon />
          </IconButton>

          {createStep === 'choose' ? (
            <>
              <Box className="mb-5">
                <h3 className="text-white font-semibold text-lg mb-1">
                  Create a new project
                </h3>
                <Typography sx={{ fontSize: '13px', color: 'var(--sl-white-alpha-40)', lineHeight: 1.5 }}>
                  Organize your conversations, documents, and tools in one place.
                </Typography>
              </Box>

              <Box className="flex gap-3 mb-6">
                {/* Blank Template card */}
                <Box
                  onClick={() => {
                    setCreateSource('blank');
                    setCreateStep('details');
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5,
                    py: 4,
                    px: 2,
                    borderRadius: '10px',
                    border: createSource === 'blank'
                      ? '1.5px solid var(--sl-brand-primary)'
                      : '1.5px solid var(--sl-white-alpha-10)',
                    bgcolor: createSource === 'blank'
                      ? 'var(--sl-brand-alpha-10)'
                      : 'var(--sl-white-alpha-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: 'var(--sl-brand-alpha-40)',
                      bgcolor: 'var(--sl-white-alpha-5)',
                    },
                  }}
                >
                  <Box sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    bgcolor: 'var(--sl-brand-alpha-10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <AutoAwesomeIcon sx={{ fontSize: 24, color: 'var(--sl-brand-primary)' }} />
                  </Box>
                  <Box className="text-center">
                    <Typography sx={{ fontSize: '13.5px', color: 'var(--sl-white-alpha-85)', fontWeight: 500 }}>
                      Blank Template
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: 'var(--sl-white-alpha-30)', mt: 0.5 }}>
                      Start fresh with a new workspace
                    </Typography>
                  </Box>
                </Box>

                {/* From Existing Project — drop zone + click to browse */}
                <Box
                  onDrop={handleImportDrop}
                  onDragOver={handleImportDragOver}
                  onDragLeave={handleImportDragLeave}
                  onClick={() => {
                    handleImportBrowse();
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5,
                    py: 4,
                    px: 2,
                    borderRadius: '10px',
                    border: isDragOver
                      ? '2px dashed var(--sl-brand-primary)'
                      : createSource === 'existing'
                        ? '1.5px solid var(--sl-brand-primary)'
                        : '1.5px solid var(--sl-white-alpha-10)',
                    bgcolor: isDragOver
                      ? 'var(--sl-brand-alpha-10)'
                      : createSource === 'existing'
                        ? 'var(--sl-brand-alpha-10)'
                        : 'var(--sl-white-alpha-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: 'var(--sl-brand-alpha-40)',
                      bgcolor: 'var(--sl-white-alpha-5)',
                    },
                  }}
                >
                  <Box sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    bgcolor: isDragOver ? 'var(--sl-brand-alpha-20)' : 'var(--sl-white-alpha-5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                  }}>
                    <FileDownloadIcon sx={{ fontSize: 24, color: isDragOver ? 'var(--sl-brand-primary)' : 'var(--sl-white-alpha-50)' }} />
                  </Box>
                  <Box className="text-center">
                    <Typography sx={{ fontSize: '13.5px', color: 'var(--sl-white-alpha-85)', fontWeight: 500 }}>
                      {isDragOver ? 'Drop to import' : 'From Existing Project'}
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: 'var(--sl-white-alpha-30)', mt: 0.5 }}>
                      {isDragOver ? 'Release to import your project' : 'Drop or browse a .zip archive'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

            </>
          ) : (
            <>
              <Box className="mb-5">
                <h3 className="text-white font-semibold text-lg mb-1">
                  Project details
                </h3>
                <Typography sx={{ fontSize: '13px', color: 'var(--sl-white-alpha-40)', lineHeight: 1.5 }}>
                  Give your project a name and pick a label color.
                </Typography>
              </Box>

              {/* Project Name */}
              <Box className="mb-4">
                <TextField
                  size="small"
                  placeholder="Project name"
                  value={createProjectName}
                  onChange={(e) => setCreateProjectName(e.target.value)}
                  autoFocus
                  fullWidth
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && createProjectName.trim()) {
                      e.preventDefault();
                      // Trigger create
                      document.getElementById('create-project-continue-btn')?.click();
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'var(--sl-white-alpha-2)',
                      fontSize: '0.85rem',
                      '& fieldset': { borderColor: 'var(--sl-white-alpha-10)' },
                      '&:hover fieldset': { borderColor: 'var(--sl-brand-alpha-30)' },
                      '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
                    },
                    '& .MuiInputBase-input': {
                      color: 'var(--sl-text-primary)',
                      padding: '10px 12px',
                      '&::placeholder': { color: 'var(--sl-text-muted)', opacity: 1 },
                    },
                  }}
                />
                <Typography sx={{ fontSize: '11px', color: 'var(--sl-white-alpha-30)', mt: 0.75, pl: 0.5 }}>
                  {createProjectName.trim()
                    ? '~/smartloop/' + createProjectName.trim().toLowerCase().replace(/\s+/g, '_')
                    : '~/smartloop/<project>'}
                </Typography>
              </Box>

              {/* Color Picker */}
              <Box className="mb-5">
                <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map((color: any) => (
                    <Box
                      key={color.value}
                      onClick={() => setCreateProjectColor(color.value)}
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '6px',
                        bgcolor: color.value,
                        cursor: 'pointer',
                        border: createProjectColor === color.value ? '2px solid var(--sl-brand-primary)' : '2px solid transparent',
                        boxShadow: createProjectColor === color.value ? '0 0 0 2px var(--sl-brand-alpha-20)' : 'none',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          transform: 'scale(1.15)',
                        },
                      }}
                      title={color.name}
                    />
                  ))}
                </Box>
              </Box>

              {/* Continue Button */}
              <Box className="flex items-center gap-3">
                <Box
                  onClick={() => { setCreateStep('choose'); setCreateZipPath(null); }}
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--sl-text-muted)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      color: 'var(--sl-text-primary)',
                      bgcolor: 'var(--sl-white-alpha-5)',
                    },
                  }}
                >
                  Back
                </Box>
                <Box
                  id="create-project-continue-btn"
                  onClick={async () => {
                    if (isImporting || !createProjectName.trim()) return;
                    setIsImporting(true);
                    setImportError('');
                    try {
                      if (createSource === 'blank') {
                        const templatePath = await window.electronAPI?.getTemplateZipPath();
                        if (!templatePath) {
                          setImportError('Template not found');
                          setIsImporting(false);
                          return;
                        }
                        await handleImportFromZip(templatePath);
                      } else {
                        if (!createZipPath) {
                          setImportError('No file selected');
                          setIsImporting(false);
                          return;
                        }
                        await handleImportFromZip(createZipPath);
                      }
                    } catch (error: any) {
                      console.error('Error creating project:', error);
                      setImportError(error.message || 'An error occurred.');
                      setIsImporting(false);
                    }
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    bgcolor: (isImporting || !createProjectName.trim()) ? 'var(--sl-white-alpha-5)' : 'var(--sl-brand-alpha-10)',
                    border: (isImporting || !createProjectName.trim()) ? '1px solid var(--sl-white-alpha-8)' : '1px solid var(--sl-brand-alpha-20)',
                    borderRadius: '8px',
                    cursor: (isImporting || !createProjectName.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: (isImporting || !createProjectName.trim()) ? 'var(--sl-text-disabled)' : 'var(--sl-brand-primary)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: (isImporting || !createProjectName.trim()) ? 'var(--sl-white-alpha-5)' : 'var(--sl-brand-alpha-20)',
                      border: (isImporting || !createProjectName.trim()) ? '1px solid var(--sl-white-alpha-8)' : '1px solid var(--sl-brand-alpha-40)',
                    },
                  }}
                >
                  {isImporting ? (
                    <>
                      <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Continue</span>
                  )}
                </Box>
              </Box>
            </>
          )}

          {importError && (
            <Typography sx={{ fontSize: '12px', color: 'var(--sl-status-error)', mt: 2 }}>
              {importError}
            </Typography>
          )}
        </Box>
      </Dialog>

      {/* Desktop Sidebar */}
      <Box
        sx={{
          width: '280px',
          height: '100vh',
          bgcolor: 'var(--sl-bg-base)',
          borderRight: '1px solid var(--sl-white-alpha-5)',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 1000,
        }}
      >
        {sidebarContent}
      </Box>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <Box
            onClick={onMobileClose}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'var(--sl-black-alpha-50)',
              zIndex: 1200,
              display: { xs: 'block', md: 'none' },
            }}
          />

          {/* Drawer */}
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '280px',
              bgcolor: 'var(--sl-bg-base)',
              borderRight: '1px solid var(--sl-white-alpha-5)',
              display: { xs: 'flex', md: 'none' },
              flexDirection: 'column',
              zIndex: 1300,
              overflowY: 'auto',
              boxShadow: '4px 0 24px var(--sl-black-alpha-30)',
            }}
          >
            {sidebarContent}
          </Box>
        </>
      )}

      {/* Delete Project Confirmation Dialog */}
      <Dialog
        open={showDeleteProjectDialog}
        onClose={() => !isDeletingProject && setShowDeleteProjectDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: dialogStyles.paper
        }}
        BackdropProps={{
          sx: dialogStyles.backdrop
        }}
      >
        <Box className="relative p-6">
          <IconButton
            onClick={() => setShowDeleteProjectDialog(false)}
            disabled={isDeletingProject}
            sx={{
              position: 'absolute',
              right: 12,
              top: 12,
              color: 'var(--sl-text-disabled)',
              '&:hover': {
                color: 'var(--sl-text-primary)',
                bgcolor: 'var(--sl-bg-surface-1)',
              },
              '&:disabled': {
                color: '#3f3f3f',
              }
            }}
          >
            <CloseIcon />
          </IconButton>

          <Box className="flex items-start gap-3 mb-4">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                flexShrink: 0,
                borderRadius: '10px',
                bgcolor: 'var(--sl-danger-alpha-10)',
                border: '1px solid var(--sl-danger-alpha-20)',
              }}
            >
              <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24 }} />
            </Box>
            <Box className="flex-1">
              <h3 className="text-white font-semibold text-lg mb-1">
                Delete Project
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Are you sure you want to delete <span className="text-white font-medium">{projectToDelete?.name}</span>? This will permanently delete all conversations and documents in this project.
              </p>
            </Box>
          </Box>

          <Box className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <Box className="text-red-400 text-sm mb-3">
              <strong>Warning:</strong> This action cannot be undone. All data will be permanently deleted.
            </Box>
            <TextField
              fullWidth
              placeholder={`Type "${projectToDelete?.name}" to confirm`}
              value={deleteProjectConfirm}
              onChange={(e) => setDeleteProjectConfirm(e.target.value)}
              error={!!deleteProjectError}
              helperText={deleteProjectError}
              disabled={isDeletingProject}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  bgcolor: 'var(--sl-black-alpha-30)',
                  '& fieldset': {
                    borderColor: 'var(--sl-danger-alpha-30)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'var(--sl-danger-alpha-50)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--sl-status-error)',
                  },
                },
                '& .MuiFormHelperText-root': {
                  color: 'var(--sl-status-error)',
                },
              }}
            />
          </Box>

          <Box className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDeleteProjectDialog(false)}
              disabled={isDeletingProject}
              className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteProject}
              disabled={isDeletingProject || deleteProjectConfirm !== (projectToDelete?.name)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeletingProject ? (
                <>
                  <CircularProgress size={18} sx={{ color: 'white' }} />
                  Deleting...
                </>
              ) : (
                <>
                  <DeleteOutlineIcon fontSize="small" />
                  Delete Project
                </>
              )}
            </button>
          </Box>
        </Box>
      </Dialog>

      {/* Delete Conversation Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: dialogStyles.paper
        }}
        BackdropProps={{
          sx: dialogStyles.backdrop
        }}
      >
        <Box className="relative p-6">
          {/* Close Button */}
          <IconButton
            onClick={() => setDeleteDialogOpen(false)}
            disabled={isDeleting}
            sx={{
              position: 'absolute',
              right: 12,
              top: 12,
              color: 'var(--sl-text-disabled)',
              '&:hover': {
                color: 'var(--sl-text-primary)',
                bgcolor: 'var(--sl-bg-surface-1)',
              },
              '&:disabled': {
                color: '#3f3f3f',
              }
            }}
          >
            <CloseIcon />
          </IconButton>

          {/* Icon and Title */}
          <Box className="flex items-start gap-3 mb-4">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                flexShrink: 0,
                borderRadius: '10px',
                bgcolor: 'var(--sl-danger-alpha-10)',
                border: '1px solid var(--sl-danger-alpha-20)',
              }}
            >
              <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24 }} />
            </Box>
            <Box className="flex-1">
              <h3 className="text-white font-semibold text-lg mb-1">
                Delete Conversation
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
            </Box>
          </Box>

          {/* Warning */}
          <Box className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <Box className="text-red-400 text-sm">
              <strong>Warning:</strong> All messages in this conversation will be permanently deleted.
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteConversation}
              disabled={isDeleting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <CircularProgress size={18} sx={{ color: 'white' }} />
                  Deleting...
                </>
              ) : (
                <>
                  <DeleteOutlineIcon fontSize="small" />
                  Delete Conversation
                </>
              )}
            </button>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}

