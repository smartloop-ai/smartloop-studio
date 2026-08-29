import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Box, IconButton, Menu, MenuItem, Dialog, CircularProgress, TextField, Typography, Tooltip } from '@mui/material';
import { conversationService } from '../services/conversation.service';
import { useProjectContext } from '@/app/contexts/ProjectContext';
import { useModelStatus } from '@/app/contexts/ModelStatusContext';
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
import { storageService } from '@/app/services/storage.service';
import { dialogStyles } from '@/app/shared/utils';
import { DEFAULT_COLOR, LEGACY_PINK, PROJECT_COLORS } from '@/app/constants';
import { SIDEBAR_ANIM_MS } from './sidebar-motion';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

const getColorForProject = (project: any): string => {
  if (project?.color) {
    if (project.color === LEGACY_PINK) return DEFAULT_COLOR;
    return project.color;
  }
  return DEFAULT_COLOR;
};

/** The dock glyph: a panel with its left column filled — the side this hides. */
// "my_project-export.zip" → "my project export": a first guess at the project's
// name, offered only when the user hasn't typed one.
const nameFromZip = (fileName: string) => fileName.replace(/\.zip$/i, '').replace(/[_-]/g, ' ');

function DockIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
      <rect
        x={collapsed ? '1.8' : '1.8'}
        y="2.8"
        width="4.2"
        height="10.4"
        fill="currentColor"
        opacity={collapsed ? 0.35 : 0.75}
      />
    </svg>
  );
}

export default function Sidebar({ user, mobileOpen, onMobileClose, collapsed = false, onToggleCollapse }: { user?: any, mobileOpen?: boolean, onMobileClose?: () => void, collapsed?: boolean, onToggleCollapse?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [openCreateProjectDialog, setOpenCreateProjectDialog] = useState(false);
  // No step, and no separate "source": a project is a name and a color, and an
  // optional .zip to seed it from. `createZipPath` is that choice — set means
  // import, unset means the blank template.
  const [createZipPath, setCreateZipPath] = useState<string | null>(null);
  const [createProjectName, setCreateProjectName] = useState('');
  const [createProjectColor, setCreateProjectColor] = useState(DEFAULT_COLOR);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSidebarDragOver, setIsSidebarDragOver] = useState(false);
  const sidebarDragCounter = useRef(0);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState('');
  const [deleteProjectError, setDeleteProjectError] = useState('');
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  // Projects list + selection are owned by ProjectContext. `localProjects` is an
  // alias for the context list so existing read sites keep working.
  const {
    projects: localProjects,
    selectedProject,
    deleteProject: deleteProjectCtx,
    refresh: refreshProjects,
  } = useProjectContext();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  // True while a model is (down)loading for the first time. Settings is blocked
  // during this window so the model can't be changed mid-load.
  // A primary model (down)load in flight — covers both a project model load and
  // the first-launch bootstrap download. Settings is blocked while it runs.
  const { primaryProgress } = useModelStatus();
  const modelLoading = !!primaryProgress?.downloading;
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
            const result = await window.electronAPI.slpFetchUser();
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
              const profileResult = await window.electronAPI!.slpFetchUser();
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

  // Sign-in requested from elsewhere in the app (e.g. a model download refused
  // for an anonymous user). Routed here rather than duplicated: this is where the
  // OAuth poll and the authStateChanged broadcast already live. Read through a
  // ref so the listener mounts once instead of resubscribing every render.
  const loginRef = useRef(handleLogin);
  loginRef.current = handleLogin;
  useEffect(() => {
    const onRequest = () => { loginRef.current(); };
    window.addEventListener('requestSignIn', onRequest);
    return () => window.removeEventListener('requestSignIn', onRequest);
  }, []);

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



  // Load conversations from SQLite (local mode)
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

  // Load conversations on mount and whenever the selected project changes.
  // (The projects list, auto-select, and selected-project persistence are all
  // owned by ProjectContext now.)
  useEffect(() => {
    refreshConversations();
  }, [selectedProject?.id]);

  // Refresh conversations on conversation change events.
  useEffect(() => {
    const handleConversationChange = () => { refreshConversations(); };
    window.addEventListener('conversationCreated', handleConversationChange);
    window.addEventListener('conversationDeleted', handleConversationChange);
    window.addEventListener('conversationUpdated', handleConversationChange);
    return () => {
      window.removeEventListener('conversationCreated', handleConversationChange);
      window.removeEventListener('conversationDeleted', handleConversationChange);
      window.removeEventListener('conversationUpdated', handleConversationChange);
    };
  }, []);

  const handleSettings = () => {
    if (modelLoading) return;   // blocked while a model is loading
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

  // Cmd/Ctrl+K jumps to the project search — the shortcut the input already
  // advertises. Matched on e.code so a non-QWERTY layout still triggers on the
  // K key, and selects any existing query so typing replaces it.
  useEffect(() => {
    const handleSearchHotkey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'KeyK') return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', handleSearchHotkey);
    return () => window.removeEventListener('keydown', handleSearchHotkey);
  }, []);

  // Leave the Settings page for wherever it was opened from. location.key is
  // 'default' only for the first entry in this session's history — there is no
  // previous page to return to then, so fall back to the projects view.
  const leaveSettings = () => {
    if (location.key === 'default') navigate('/');
    else navigate(-1);
  };

  // Cmd/Ctrl+, opens the Settings page — the platform convention for
  // preferences. The Shift variant is the project-scoped counterpart and opens
  // the Project Settings rail section (right-sidebar.tsx), so bail on it here.
  // Pressing it again on Settings goes back, so the key that opened the page
  // also closes it; otherwise there is no way back to a project from the
  // keyboard. The nav button and menu item stay pure navigation — a control
  // labelled "Settings" toggling you off the page would read as a misfire.
  // Goes through handleSettings to honour the same model-loading guard as the
  // nav button.
  useEffect(() => {
    const handleSettingsHotkey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'Comma') return;
      e.preventDefault();
      if (location.pathname === '/settings') leaveSettings();
      else handleSettings();
    };
    window.addEventListener('keydown', handleSettingsHotkey);
    return () => window.removeEventListener('keydown', handleSettingsHotkey);
  }, [modelLoading, location.pathname, location.key]);

  // Esc is the other half of that gesture. Dialogs and focused fields get first
  // claim on the key — MUI closes a modal on Esc without stopping propagation,
  // so without these guards closing a dialog on the Settings page would also
  // navigate away from it.
  useEffect(() => {
    if (location.pathname !== '/settings') return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.MuiModal-root')) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      leaveSettings();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [location.pathname, location.key]);

  const handleProjectClick = async (projectId: string | null) => {
    // Resolve the target project synchronously (localProjects is already in memory)
    // so we can navigate immediately.
    if (!projectId) {
      const systemProject = localProjects.find((p: any) => p.system === true);
      if (!systemProject) {
        console.error('[Sidebar] No system project found');
        return;
      }
      projectId = systemProject.id;
    }

    // Navigate right away — the sidebar highlight is derived from the URL, so switching
    // projects feels instant instead of waiting on the conversation refresh below.
    navigate(`/?project=${projectId}`);
    setSearchQuery('');
    onMobileClose?.();

    // Then refresh conversations and, if the project has any, refine the URL to its most
    // recent conversation. `replace` so this doesn't add a second history entry.
    try {
      const freshConversations = await refreshConversations();
      const allConversations = (freshConversations && Array.isArray(freshConversations)) ? freshConversations : [];
      const projectConversations = allConversations.filter(
        (conv: any) => conv.project_id === projectId
      );

      if (projectConversations.length > 0) {
        const mostRecent = projectConversations.sort((a: any, b: any) => {
          const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
          const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
          return dateB - dateA;
        })[0];
        navigate(`/?conversation=${mostRecent.id}&project=${projectId}`, { replace: true });
      }
    } catch (error) {
      console.error('Error handling project click:', error);
    }
  };

  const handleOpenCreateProjectDialog = () => {
    setImportError('');
    setIsDragOver(false);
    setOpenCreateProjectDialog(true);
  };

  const handleCloseCreateProjectDialog = () => {
    setOpenCreateProjectDialog(false);
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

      // importProject is a separate main-process IPC that doesn't broadcast
      // projects-changed, so refresh the context list explicitly.
      await refreshProjects();
      await refreshConversations();

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
    setCreateZipPath(filePath);
    // The archive's name is a suggestion, not an override — a name already
    // typed is the one the user meant.
    setCreateProjectName(prev => prev.trim() || nameFromZip(fileName));
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

    setCreateZipPath(filePath);
    setCreateProjectName(prev => prev.trim() || nameFromZip(file.name));
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

  const handleSidebarDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sidebarDragCounter.current++;
    if (sidebarDragCounter.current === 1) {
      setIsSidebarDragOver(true);
    }
  };

  const handleSidebarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSidebarDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sidebarDragCounter.current--;
    if (sidebarDragCounter.current === 0) {
      setIsSidebarDragOver(false);
    }
  };

  const handleSidebarDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sidebarDragCounter.current = 0;
    setIsSidebarDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.zip')) return;

    let filePath = (file as any).path;
    if (!filePath) {
      const buffer = await file.arrayBuffer();
      filePath = await window.electronAPI?.saveTempFile(file.name, buffer);
    }
    if (!filePath) return;

    setCreateZipPath(filePath);
    setCreateProjectName(nameFromZip(file.name));
    setOpenCreateProjectDialog(true);
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
      const result = await deleteProjectCtx(projectToDelete.id);

      if (result.success) {
        // Context refreshes off the projects-changed broadcast; notify that
        // conversations were removed so the conversation list refreshes too.
        window.dispatchEvent(new CustomEvent('conversationDeleted', { detail: { projectId: projectToDelete.id } }));

        // Navigate to home; ProjectContext auto-selects a remaining project.
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
        pt: 4,
        pb: 2.5,
        borderBottom: '1px solid var(--sl-border-subtle)',
      }}>
        <Box className="flex items-center justify-between">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--sl-text-primary)' }}>smartloop</span>
            <span className="text-xl font-semibold" style={{ color: 'var(--sl-brand-primary)' }}>.</span>
          </Box>
          {onToggleCollapse && (
            <Tooltip title="Collapse sidebar (⌘\\)" placement="right" arrow>
              <IconButton
                onClick={onToggleCollapse}
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  color: 'var(--sl-text-disabled)',
                  '&:hover': { color: 'var(--sl-text-primary)', bgcolor: 'var(--sl-bg-surface-1)' },
                  padding: '6px',
                  borderRadius: '6px',
                }}
              >
                <DockIcon collapsed={false} />
              </IconButton>
            </Tooltip>
          )}
          {mobileOpen && (
            <IconButton
              onClick={onMobileClose}
              sx={{
                display: { xs: 'flex', md: 'none' },
                color: 'var(--sl-text-disabled)',
                '&:hover': { color: 'var(--sl-text-primary)', bgcolor: 'var(--sl-bg-surface-1)' },
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
            border: '1px solid var(--sl-border-subtle)',
            transition: 'all 0.15s ease',
            '&:focus-within': {
              borderColor: 'var(--sl-brand-alpha-50)',
              bgcolor: 'var(--sl-white-alpha-7)',
              boxShadow: '0 0 0 3px var(--sl-brand-alpha-10)',
            }
          }}
        >
          <SearchIcon sx={{ fontSize: 17, color: 'var(--sl-text-muted)' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search projects"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-none outline-none text-sm flex-1"
            style={{ color: 'var(--sl-text-primary)' }}
          />
          {searchQuery && (
            <IconButton
              size="small"
              onClick={clearSearch}
              sx={{
                padding: '3px',
                color: 'var(--sl-text-muted)',
                '&:hover': { color: 'var(--sl-text-primary)', bgcolor: 'var(--sl-bg-surface-2)' },
                borderRadius: '4px',
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 1 }}>
        {/* Compute URL params once for selection logic */}
        {(() => {
          const currentProjectId = searchParams.get('project');

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
                      color: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '13.5px',
                      transition: 'all 0.12s ease',
                      border: isActive ? '1px solid var(--sl-brand-alpha-20)' : '1px solid transparent',
                      '&:hover': {
                        bgcolor: isActive ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
                        color: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-primary)',
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
                        color: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-secondary)',
                        fontWeight: isActive ? 600 : 500,
                        fontSize: '13.5px',
                        // Only fade the background; active color/weight snap so switching feels instant.
                        transition: 'background-color 0.12s ease',
                        border: isActive ? '1px solid var(--sl-brand-alpha-20)' : '1px solid transparent',
                        '&:hover': {
                          bgcolor: isActive ? 'var(--sl-brand-alpha-15)' : 'var(--sl-white-alpha-5)',
                          color: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-primary)',
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
                            color: 'var(--sl-text-muted)',
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
        <Box
          onClick={handleOpenCreateProjectDialog}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            padding: '9px 11px',
            borderRadius: '7px',
            cursor: 'pointer',
            bgcolor: 'transparent',
            color: 'var(--sl-text-muted)',
            fontWeight: 500,
            fontSize: '13.5px',
            transition: 'all 0.12s ease',
            border: '1px solid transparent',
            '&:hover': {
              bgcolor: 'var(--sl-white-alpha-5)',
              color: 'var(--sl-text-primary)',
            },
            mb: 0.5,
          }}
        >
          <AddIcon sx={{ fontSize: 18 }} />
          <span style={{ flex: 1 }}>new project</span>
        </Box>
      </Box>

      {/* Recent Conversations Section */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        px: 2.5,
        py: 2,
        borderTop: '1px solid var(--sl-border-subtle)',
      }}>
        <Box sx={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--sl-text-muted)',
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
                  const systemProject = localProjects.find((p: any) => p.system === true);
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
                color: 'var(--sl-text-secondary)',
                borderRadius: '6px',
                transition: 'all 0.12s ease',
                position: 'relative',
                '&:hover': {
                  color: 'var(--sl-text-primary)',
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
                    color: 'var(--sl-text-secondary)',
                    '&:hover': {
                      color: 'var(--sl-brand-primary)',
                      bgcolor: 'var(--sl-brand-alpha-10)',
                    },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              {/* Last message, or the project name as a fallback. Uses muted rather
                  than faint: faint sits at ~2:1 on light themes, which is unreadable. */}
              <span className="text-xs ml-6 truncate" style={{ color: 'var(--sl-text-muted)' }}>
                {chat.lastMessage
                  ? (chat.lastMessage.length > 50
                    ? chat.lastMessage.substring(0, 50) + '...'
                    : chat.lastMessage)
                  : (localProjects.find((p: any) => p.id === chat.project_id)?.name || 'start a conversation')}
              </span>
            </Box>
          ))
        ) : (
          <Box className="text-xs text-sl-text-muted px-2">
            No conversations yet
          </Box>
        )}
      </Box>

      {/* Login / User Profile */}
      {authUser ? (
        <>
          <Box sx={{
            p: 1.5,
            borderTop: '1px solid var(--sl-border-subtle)',
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
                <span className="text-xs font-bold" style={{ color: 'var(--sl-brand-primary)' }}>
                  {authUser.name ? authUser.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U'}
                </span>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ color: 'var(--sl-text-primary)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {authUser.name || 'User'}
                </Box>
                <Box sx={{ color: 'var(--sl-text-muted)', fontSize: '11px' }}>
                  {authUser.is_paid || authUser.is_premium ? 'Pro' : 'Free'} Plan
                </Box>
              </Box>
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  color: 'var(--sl-text-muted)',
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
                bgcolor: 'var(--sl-bg-elevated)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid var(--sl-border-default)',
                borderRadius: '8px',
                minWidth: '200px',
                mt: -1,
                ml: 1,
                boxShadow: '0 8px 32px var(--sl-black-alpha-50)',
              }
            }}
          >
            <MenuItem
              disabled={modelLoading}
              onClick={() => { handleSettings(); handleMenuClose(); }}
              sx={{ color: 'var(--sl-text-primary)', fontSize: '13px', fontWeight: 500, py: 1.25, px: 2, '&:hover': { bgcolor: 'var(--sl-bg-surface-1)' }, '&.Mui-disabled': { opacity: 0.4 } }}
            >
              <SettingsIcon sx={{ fontSize: 17, mr: 1.5, color: 'var(--sl-text-disabled)' }} />
              {modelLoading ? 'Settings (loading model…)' : 'Settings'}
            </MenuItem>
            <Box sx={{ height: '1px', bgcolor: 'var(--sl-bg-surface-1)', my: 0.5, mx: 1 }} />
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
          borderTop: '1px solid var(--sl-border-subtle)',
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
              cursor: modelLoading ? 'not-allowed' : 'pointer',
              opacity: modelLoading ? 0.4 : 1,
              pointerEvents: modelLoading ? 'none' : 'auto',
              fontSize: '12px',
              color: 'var(--sl-text-muted)',
              transition: 'all 0.12s ease',
              '&:hover': {
                color: 'var(--sl-text-secondary)',
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

          {/* One form, not a wizard. A project is a name and a color; seeding
              it from a .zip is an option on that form, not a fork in the road
              that has to be answered before the form appears. */}
          <Box className="mb-5">
            <h3 className="text-sl-text-primary font-semibold text-lg mb-1">
              Create a new project
            </h3>
            <Typography sx={{ fontSize: '13px', color: 'var(--sl-text-muted)', lineHeight: 1.5 }}>
              Organize your conversations, documents, and tools in one place.
            </Typography>
          </Box>

          {/* Project name */}
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
                  document.getElementById('create-project-continue-btn')?.click();
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'var(--sl-bg-surface-1)',
                  fontSize: '0.85rem',
                  '& fieldset': { borderColor: 'var(--sl-border-default)' },
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
          </Box>

          {/* Label color */}
          <Box className="mb-4">
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

          {/* Optional starting point. One slim row rather than a pair of big
              cards: "blank" was never a decision anyone made deliberately, it
              was the answer you gave to get past the first screen. */}
          <Box
            onDrop={handleImportDrop}
            onDragOver={handleImportDragOver}
            onDragLeave={handleImportDragLeave}
            onClick={() => { if (!createZipPath) handleImportBrowse(); }}
            className="mb-5"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.75,
              py: 1.25,
              borderRadius: '8px',
              border: isDragOver
                ? '1.5px dashed var(--sl-brand-primary)'
                : createZipPath
                  ? '1px solid var(--sl-brand-alpha-30)'
                  : '1px dashed var(--sl-border-default)',
              bgcolor: isDragOver || createZipPath ? 'var(--sl-brand-alpha-10)' : 'var(--sl-white-alpha-5)',
              cursor: createZipPath ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              '&:hover': {
                borderColor: createZipPath ? 'var(--sl-brand-alpha-30)' : 'var(--sl-brand-alpha-40)',
              },
            }}
          >
            <FileDownloadIcon
              sx={{
                fontSize: 18,
                flexShrink: 0,
                color: isDragOver || createZipPath ? 'var(--sl-brand-primary)' : 'var(--sl-text-disabled)',
              }}
            />
            <Box className="flex flex-col min-w-0 flex-1">
              <Typography sx={{ fontSize: '12.5px', color: 'var(--sl-text-primary)', fontWeight: 500 }} noWrap>
                {isDragOver
                  ? 'Drop to import'
                  : createZipPath
                    ? (createZipPath.split(/[/\\]/).pop() || 'project.zip')
                    : 'Start from an existing project'}
              </Typography>
              <Typography sx={{ fontSize: '11.5px', color: 'var(--sl-text-faint)' }} noWrap>
                {isDragOver
                  ? 'Release to attach the archive'
                  : createZipPath
                    ? 'Its conversations, documents and tools come with it'
                    : 'Optional — drop or browse a .zip export'}
              </Typography>
            </Box>
            {createZipPath && !isDragOver && (
              <Tooltip title="Remove — start from a blank project instead" placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setCreateZipPath(null); setImportError(''); }}
                  sx={{
                    flexShrink: 0,
                    color: 'var(--sl-text-faint)',
                    '&:hover': { color: 'var(--sl-status-error)', bgcolor: 'transparent' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Create */}
          <Box
            id="create-project-continue-btn"
            onClick={async () => {
              if (isImporting || !createProjectName.trim()) return;
              setIsImporting(true);
              setImportError('');
              try {
                // No zip attached means the blank template, which is itself a
                // zip — so both paths land in the same importer.
                const zipPath = createZipPath || await window.electronAPI?.getTemplateZipPath();
                if (!zipPath) {
                  setImportError('Template not found');
                  setIsImporting(false);
                  return;
                }
                await handleImportFromZip(zipPath);
              } catch (error: any) {
                console.error('Error creating project:', error);
                setImportError(error.message || 'An error occurred.');
                setIsImporting(false);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              bgcolor: (isImporting || !createProjectName.trim()) ? 'var(--sl-bg-surface-1)' : 'var(--sl-brand-alpha-10)',
              border: (isImporting || !createProjectName.trim()) ? '1px solid var(--sl-border-subtle)' : '1px solid var(--sl-brand-alpha-20)',
              borderRadius: '8px',
              cursor: (isImporting || !createProjectName.trim()) ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: (isImporting || !createProjectName.trim()) ? 'var(--sl-text-disabled)' : 'var(--sl-brand-primary)',
              transition: 'all 0.15s ease',
              '&:hover': {
                bgcolor: (isImporting || !createProjectName.trim()) ? 'var(--sl-bg-surface-1)' : 'var(--sl-brand-alpha-20)',
                border: (isImporting || !createProjectName.trim()) ? '1px solid var(--sl-border-subtle)' : '1px solid var(--sl-brand-alpha-40)',
              },
            }}
          >
            {isImporting ? (
              <>
                <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create project</span>
            )}
          </Box>

          {importError && (
            <Typography sx={{ fontSize: '12px', color: 'var(--sl-status-error)', mt: 2 }}>
              {importError}
            </Typography>
          )}
        </Box>
      </Dialog>

      {/* Desktop Sidebar, collapsed to a rail: the same 48px strip the right
          sidebar leaves behind, so both edges of the window behave alike. Only
          the dock control survives — everything else in here needs width to be
          worth showing, and a row of cryptic glyphs is not a sidebar. */}
      <Box
        sx={{
          width: '48px',
          height: '100vh',
          bgcolor: 'var(--sl-bg-base)',
          borderRight: '1px solid var(--sl-border-subtle)',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          alignItems: 'center',
          pt: 4,
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 1001,
          // Cross-faded with the expanded sidebar instead of swapped for it, so
          // the panel slides between the two widths rather than snapping.
          opacity: collapsed ? 1 : 0,
          pointerEvents: collapsed ? 'auto' : 'none',
          transition: `opacity ${SIDEBAR_ANIM_MS}ms ease`,
        }}
      >
        <Tooltip title="Expand sidebar (⌘\\)" placement="right" arrow>
          <IconButton
            onClick={onToggleCollapse}
            sx={{
              color: 'var(--sl-text-disabled)',
              '&:hover': { color: 'var(--sl-text-primary)', bgcolor: 'var(--sl-bg-surface-1)' },
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <DockIcon collapsed />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Desktop Sidebar */}
      <Box
        onDragEnter={handleSidebarDragEnter}
        onDragOver={handleSidebarDragOver}
        onDragLeave={handleSidebarDragLeave}
        onDrop={handleSidebarDrop}
        sx={{
          width: collapsed ? '48px' : '280px',
          height: '100vh',
          bgcolor: 'var(--sl-bg-base)',
          borderRight: '1px solid var(--sl-border-subtle)',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 1000,
          // Clipped, not squeezed: the body below keeps its full 280px so the
          // rows slide out of view instead of reflowing on the way.
          overflow: 'hidden',
          transition: `width ${SIDEBAR_ANIM_MS}ms ease`,
        }}
      >
        <Box
          sx={{
            width: '280px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            opacity: collapsed ? 0 : 1,
            pointerEvents: collapsed ? 'none' : 'auto',
            transition: `opacity ${SIDEBAR_ANIM_MS}ms ease`,
          }}
        >
          {sidebarContent}
        </Box>
        {isSidebarDragOver && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              border: '2px dashed var(--sl-brand-primary)',
              borderRadius: '8px',
              bgcolor: 'var(--sl-brand-alpha-10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <Box className="text-center">
              <FileDownloadIcon sx={{ fontSize: 32, color: 'var(--sl-brand-primary)', mb: 1 }} />
              <Box sx={{ fontSize: '13px', fontWeight: 600, color: 'var(--sl-brand-primary)' }}>
                Drop to import project
              </Box>
              <Box sx={{ fontSize: '11px', color: 'var(--sl-text-muted)', mt: 0.5 }}>
                .zip archive
              </Box>
            </Box>
          </Box>
        )}
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
            onDragEnter={handleSidebarDragEnter}
            onDragOver={handleSidebarDragOver}
            onDragLeave={handleSidebarDragLeave}
            onDrop={handleSidebarDrop}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '280px',
              bgcolor: 'var(--sl-bg-base)',
              borderRight: '1px solid var(--sl-border-subtle)',
              display: { xs: 'flex', md: 'none' },
              flexDirection: 'column',
              zIndex: 1300,
              overflowY: 'auto',
              boxShadow: '4px 0 24px var(--sl-black-alpha-30)',
            }}
          >
            {sidebarContent}
            {isSidebarDragOver && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  border: '2px dashed var(--sl-brand-primary)',
                  borderRadius: '8px',
                  bgcolor: 'var(--sl-brand-alpha-10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              >
                <Box className="text-center">
                  <FileDownloadIcon sx={{ fontSize: 32, color: 'var(--sl-brand-primary)', mb: 1 }} />
                  <Box sx={{ fontSize: '13px', fontWeight: 600, color: 'var(--sl-brand-primary)' }}>
                    Drop to import project
                  </Box>
                  <Box sx={{ fontSize: '11px', color: 'var(--sl-text-muted)', mt: 0.5 }}>
                    .zip archive
                  </Box>
                </Box>
              </Box>
            )}
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
              <h3 className="text-sl-text-primary font-semibold text-lg mb-1">
                Delete Project
              </h3>
              <p className="text-sl-text-muted text-sm leading-relaxed">
                Are you sure you want to delete <span className="text-sl-text-primary font-medium">{projectToDelete?.name}</span>? This will permanently delete all conversations and documents in this project.
              </p>
            </Box>
          </Box>

          <Box className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--sl-danger-alpha-10)', border: '1px solid var(--sl-danger-alpha-30)' }}>
            <Box className="text-sl-status-error text-sm mb-3">
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
                  color: 'var(--sl-text-primary)',
                  bgcolor: 'var(--sl-bg-surface-1)',
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
              className="flex-1 px-4 py-2.5 bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary rounded-lg border border-sl-border-default transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteProject}
              disabled={isDeletingProject || deleteProjectConfirm !== (projectToDelete?.name)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sl-status-error hover:opacity-90 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h3 className="text-sl-text-primary font-semibold text-lg mb-1">
                Delete Conversation
              </h3>
              <p className="text-sl-text-muted text-sm leading-relaxed">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
            </Box>
          </Box>

          {/* Warning */}
          <Box className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--sl-danger-alpha-10)', border: '1px solid var(--sl-danger-alpha-30)' }}>
            <Box className="text-sl-status-error text-sm">
              <strong>Warning:</strong> All messages in this conversation will be permanently deleted.
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary rounded-lg border border-sl-border-default transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteConversation}
              disabled={isDeleting}
              className="flex-1 flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 bg-sl-status-error hover:opacity-90 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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

