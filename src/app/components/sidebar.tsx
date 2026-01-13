import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, IconButton, Menu, MenuItem, Dialog, CircularProgress, TextField, Typography, capitalize } from '@mui/material';
import { conversationService } from '../services/conversation.service';
import { projectService } from '../services/project.service';
import SearchIcon from '@mui/icons-material/Search';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import AddIcon from '@mui/icons-material/Add';
import { userService } from '@/app/services/user.service';
import { storageService } from '@/app/services/storage.service';
import { dialogStyles } from '@/app/shared/utils';
import { APP_URL, PROJECT_COLORS, DEFAULT_COLOR } from '@/app/constants';

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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [liveUser, setLiveUser] = useState(user);
  const lastTokenCount = useRef(user?.number_of_tokens_processed || 0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [openCreateProjectDialog, setOpenCreateProjectDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState('');

  // Update live user when prop changes
  useEffect(() => {
    setLiveUser(user);
    // Ensure conversations is always an array, never null or undefined
    const conversations = (user?.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
    setConversations(conversations);
    lastTokenCount.current = user?.number_of_tokens_processed || 0;
  }, [user]);


  // Load conversations from local storage
  const refreshConversations = async () => {
    try {
      const user = await userService.get();
      // Ensure conversations is always an array, never null or undefined
      const conversations = (user?.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
      setConversations(conversations);
    } catch (error) {
      console.error('Error loading conversations from storage:', error);
    }
  };

  // Refresh user data on demand
  const refreshUserData = async () => {
    try {
      const updatedUser = await userService.get();
      if (updatedUser) {
        setLiveUser(updatedUser);
        lastTokenCount.current = updatedUser.number_of_tokens_processed || 0;
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  // Expose refresh method via custom event
  useEffect(() => {
    const handleRefresh = () => {
      refreshUserData();
    };

    const handleUserUpdated = (event: CustomEvent) => {
      // Update user and conversations from the event detail (no need to fetch)
      if (event.detail) {
        setLiveUser(event.detail);
        const conversations = (event.detail.conversations && Array.isArray(event.detail.conversations)) ? event.detail.conversations : [];
        setConversations(conversations);
      }
    };

    const handleConversationCreated = () => {
      // No longer need to refresh - userUpdated event will handle it
      // But keep this for backward compatibility if other code depends on it
    };

    const handleConversationDeleted = () => {
      refreshConversations();
    };

    const handleConversationUpdated = () => {
      refreshConversations();
    };

    // Listen for project deletion to refresh user data and conversations
    const handleProjectDeleted = async () => {
      // Refresh user data to get updated projects list
      const updatedUser = await userService.get();
      if (updatedUser) {
        setLiveUser(updatedUser);
        setConversations(updatedUser.conversations || []);
      }
    };

    window.addEventListener('refreshUserTokens', handleRefresh);
    window.addEventListener('userUpdated', handleUserUpdated as EventListener);
    window.addEventListener('conversationCreated', handleConversationCreated);
    window.addEventListener('conversationDeleted', handleConversationDeleted);
    window.addEventListener('conversationUpdated', handleConversationUpdated);
    window.addEventListener('projectDeleted', handleProjectDeleted);

    return () => {
      window.removeEventListener('refreshUserTokens', handleRefresh);
      window.removeEventListener('userUpdated', handleUserUpdated as EventListener);
      window.removeEventListener('conversationCreated', handleConversationCreated);
      window.removeEventListener('conversationDeleted', handleConversationDeleted);
      window.removeEventListener('conversationUpdated', handleConversationUpdated);
      window.removeEventListener('projectDeleted', handleProjectDeleted);
    };
  }, []);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    // Only clear auth tokens, keep chat history
    localStorage.removeItem('token');
    localStorage.removeItem('u');
    await storageService.removeItem('token');
    await storageService.removeItem('u');
    sessionStorage.clear();
    navigate('/login');
    handleMenuClose();
  };

  const handleProfile = () => {
    navigate('/profile');
    handleMenuClose();
    onMobileClose?.();
  };

  const handleSettings = () => {
    navigate('/settings');
    handleMenuClose();
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

        // Dispatch event for other components to react to conversation deletion
        window.dispatchEvent(new CustomEvent('conversationDeleted', {
          detail: { conversationId: conversationToDelete }
        }));

        // If currently viewing this conversation, navigate to home
        const currentPath = location.pathname + location.search;
        if (currentPath.includes(conversationToDelete)) {
          navigate('/');
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
        // Get last message from either last_message field or last message in messages array
        let lastMessage = conversation.last_message;
        if (!lastMessage && Array.isArray(conversation.messages) && conversation.messages.length > 0) {
          const lastMsg = conversation.messages.at(-1);
          lastMessage = lastMsg?.content || null;
        }

        return {
          id: conversation.id,
          name: conversation.title || 'Untitled Conversation',
          projectId: conversation.project_id || null,
          lastMessage,
          createdAt: conversation.created_at || new Date(),
        };
      })
      // Filter to show all conversations
      .filter((conv: any) => conv.id)
      // Sort by most recently updated
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      // Limit to 3 most recent
      .slice(0, 3);

    return recentConversations;
  };

  const recentChats = getRecentChats();

  // Search functionality - filter projects only
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim() || !liveUser?.projects) return liveUser?.projects || [];

    const query = searchQuery.toLowerCase();

    return (liveUser.projects || []).filter((project: any) => {
      const title = (project.title || project.name || '').toLowerCase();
      return title.includes(query);
    });
  }, [searchQuery, liveUser]);

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
    await refreshConversations();

    // Use the conversations state which is now up-to-date
    const allConversations = (conversations && Array.isArray(conversations)) ? conversations : [];

    // Auto-select the most recent conversation for the project/general
    if (projectId === null || projectId === 'general') {
      // Navigate to general - auto-select most recent general conversation
      try {
        const generalConversations = allConversations.filter(
          (conv: any) => !conv.project_id
        );

        if (generalConversations.length > 0) {
          // Sort by updated_at (most recent first) and navigate to the most recent
          const sorted = generalConversations.sort((a: any, b: any) => {
            const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
            const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
            return dateB - dateA;
          });
          const mostRecent = sorted[0];
          console.log('[Sidebar] Auto-selecting most recent general conversation:', mostRecent.id);
          navigate(`/?conversation=${mostRecent.id}&general=true`);
        } else {
          // No conversations for general, navigate to welcome screen
          console.log('[Sidebar] No general conversations, showing welcome screen');
          navigate('/?general=true');
        }
      } catch (error) {
        console.error('Error handling general click:', error);
        navigate('/?general=true');
      }
    } else {
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
          // No conversations for this project, navigate to welcome screen
          console.log('[Sidebar] No conversations for project, showing welcome screen');
          navigate(`/?project=${projectId}`);
        }
      } catch (error) {
        console.error('Error handling project click:', error);
        navigate(`/?project=${projectId}`);
      }
    }

    setSearchQuery('');
    onMobileClose?.();
  };

  const handleOpenCreateProjectDialog = () => {
    setNewProjectTitle('');
    setSelectedColor(DEFAULT_COLOR);
    setCreateProjectError('');
    setOpenCreateProjectDialog(true);
  };

  const handleCloseCreateProjectDialog = () => {
    setOpenCreateProjectDialog(false);
    setNewProjectTitle('');
    setSelectedColor(DEFAULT_COLOR);
    setCreateProjectError('');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProjectTitle.trim()) {
      setCreateProjectError('Project title is required');
      return;
    }

    setIsCreatingProject(true);
    setCreateProjectError('');

    try {
      const result = await projectService.createProject({
        title: newProjectTitle.trim(),
        temperature: 0.3,
        color: selectedColor
      });

      if (result.success && result.data) {
        // Refresh user data to get updated projects list
        const updatedUser = await userService.get();
        if (updatedUser) {
          setLiveUser(updatedUser);
          // Emit event to refresh user data globally
          window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
          // Auto-select newly created project
          navigate(`/?project=${result.data.id}`);
        }
        handleCloseCreateProjectDialog();
      } else {
        setCreateProjectError(result.error || 'Failed to create project');
      }
    } catch (error: any) {
      console.error('Error creating project:', error);
      setCreateProjectError('An error occurred while creating the project.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const sidebarContent = (
    <>
      {/* Logo with Mobile Close Button */}
      <Box sx={{
        px: 3,
        py: 2.5,
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        bgcolor: 'rgba(255, 255, 255, 0.02)',
      }}>
        <Box className="flex items-center justify-between">
          <Box
            onClick={() => {
              navigate('/');
              onMobileClose?.();
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              '&:hover': {
                opacity: 0.85,
              },
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
                color: 'rgba(255, 255, 255, 0.5)',
                '&:hover': { color: 'white', bgcolor: 'rgba(255, 255, 255, 0.08)' },
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
            bgcolor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '7px',
            padding: '7px 11px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            transition: 'all 0.15s ease',
            '&:focus-within': {
              borderColor: 'rgba(236, 72, 153, 0.5)',
              bgcolor: 'rgba(255, 255, 255, 0.07)',
              boxShadow: '0 0 0 3px rgba(236, 72, 153, 0.1)',
            }
          }}
        >
          <SearchIcon sx={{ fontSize: 17, color: 'rgba(255, 255, 255, 0.4)' }} />
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
                color: 'rgba(255, 255, 255, 0.4)',
                '&:hover': { color: '#fff', bgcolor: 'rgba(255, 255, 255, 0.1)' },
                borderRadius: '4px',
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
          {!searchQuery && (
            <Box sx={{
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.3)',
              bgcolor: 'rgba(255, 255, 255, 0.05)',
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
          const hasGeneralParam = urlParams.get('general') === 'true';

          // General is active only if explicitly set via URL param
          const isGeneralActive = hasGeneralParam;

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
                      bgcolor: isActive ? 'rgba(236, 72, 153, 0.12)' : 'transparent',
                      color: isActive ? '#ec4899' : 'rgba(255, 255, 255, 0.65)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '13.5px',
                      transition: 'all 0.12s ease',
                      border: isActive ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid transparent',
                      '&:hover': {
                        bgcolor: isActive ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                        color: isActive ? '#ec4899' : 'white',
                      },
                      mb: 0.5,
                    }}
                  >
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </Box>
                );
              })}

              {/* #general option */}
              <Box
                onClick={() => handleProjectClick(null)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  padding: '9px 11px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  bgcolor: isGeneralActive ? 'rgba(236, 72, 153, 0.12)' : 'transparent',
                  color: isGeneralActive ? '#ec4899' : 'rgba(255, 255, 255, 0.65)',
                  fontWeight: isGeneralActive ? 600 : 500,
                  fontSize: '13.5px',
                  transition: 'all 0.12s ease',
                  border: isGeneralActive ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid transparent',
                  '&:hover': {
                    bgcolor: isGeneralActive ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    color: isGeneralActive ? '#ec4899' : 'white',
                  },
                  mb: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '2px',
                    bgcolor: getColorForProject(null),
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>general</span>
              </Box>

              {/* Project list - filtered by search */}
              {filteredProjects && filteredProjects.length > 0 && (
                filteredProjects.map((project: any) => {
                  const isActive = currentProjectId === project.id;
                  const projectName = project.title || project.name || 'Untitled Project';

                  return (
                    <Box
                      key={project.id}
                      onClick={() => handleProjectClick(project.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        padding: '9px 11px',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        bgcolor: isActive ? 'rgba(236, 72, 153, 0.12)' : 'transparent',
                        color: isActive ? '#ec4899' : 'rgba(255, 255, 255, 0.65)',
                        fontWeight: isActive ? 600 : 500,
                        fontSize: '13.5px',
                        transition: 'all 0.12s ease',
                        border: isActive ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid transparent',
                        '&:hover': {
                          bgcolor: isActive ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                          color: isActive ? '#ec4899' : 'white',
                        },
                        mb: 0.5,
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
            color: 'rgba(255, 255, 255, 0.45)',
            fontWeight: 500,
            fontSize: '13.5px',
            transition: 'all 0.12s ease',
            border: '1px solid transparent',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.06)',
              color: 'white',
            },
            mb: 0.5,
          }}
        >
          <AddIcon sx={{ fontSize: 18 }} />
          <span style={{ flex: 1 }}>New Project</span>
        </Box>
      </Box>

      {/* Recent Conversations Section */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        px: 2.5,
        py: 2,
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        bgcolor: 'rgba(255, 255, 255, 0.02)',
      }}>
        <Box sx={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.4)',
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
                  navigate(`/?conversation=${chat.id}&general=true`);
                }
                onMobileClose?.();
              }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                padding: '8px 11px',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.6)',
                borderRadius: '6px',
                transition: 'all 0.12s ease',
                position: 'relative',
                '&:hover': {
                  color: 'white',
                  bgcolor: 'rgba(255, 255, 255, 0.06)',
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
                    color: 'rgba(255, 255, 255, 0.6)',
                    '&:hover': {
                      color: '#ec4899',
                      bgcolor: 'rgba(236, 72, 153, 0.1)',
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
                  : 'start a conversation'}
              </span>
            </Box>
          ))
        ) : (
          <Box className="text-xs text-gray-600 px-2">
            No conversations yet
          </Box>
        )}
      </Box>

      {/* Credits & Upgrade Section */}
      {liveUser && (() => {
        // Calculate credits using the same logic as profile page
        const isPremium = liveUser.is_premium;
        const isPro = liveUser.is_paid;
        const planTokens = isPremium ? Infinity : (isPro ? 300000 : 30000);
        const totalTokens = isPremium ? Infinity : (liveUser.tokens && liveUser.tokens > 0 ? liveUser.tokens : planTokens);
        const processedTokens = liveUser.number_of_tokens_processed || 0;
        const remainingTokens = isPremium ? Infinity : Math.max(0, totalTokens - processedTokens);

        const totalCredits = isPremium ? Infinity : Math.floor(totalTokens / 100);
        const usedCredits = Math.floor(processedTokens / 100);
        const remainingCredits = isPremium ? Infinity : Math.floor(remainingTokens / 100);
        const usagePercentage = isPremium ? 0 : (totalTokens > 0 ? (processedTokens / totalTokens) * 100 : 0);

        console.log('[Upgrade] Render check - isPremium:', isPremium, 'isPro:', isPro, 'Show button:', !isPremium && !isPro);

        return (
          <Box sx={{
            px: 2.5,
            py: 2,
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            bgcolor: 'rgba(255, 255, 255, 0.02)',
          }}>
            {/* Credits Progress */}
            <Box sx={{ mb: 2 }}>
              <Box className="flex items-center justify-between mb-2">
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600, letterSpacing: '0.3px' }}>CREDITS</span>
                {isPremium ? (
                  <Box className="flex items-center gap-1">
                    <AllInclusiveIcon sx={{ fontSize: 14, color: '#ec4899' }} />
                    <span className="text-xs text-pink-400 font-medium">Unlimited</span>
                  </Box>
                ) : (
                  <span className="text-xs text-white font-medium">
                    {remainingCredits.toLocaleString()} / {totalCredits.toLocaleString()}
                  </span>
                )}
              </Box>
              <Box
                sx={{
                  width: '100%',
                  height: '4px',
                  bgcolor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    width: isPremium ? '100%' : `${100 - Math.min(100, usagePercentage)}%`,
                    height: '100%',
                    bgcolor: isPremium ? '#ec4899' : (remainingCredits > totalCredits * 0.2 ? '#ec4899' : '#ef4444'),
                    transition: 'width 0.3s ease',
                    boxShadow: isPremium ? '0 0 8px rgba(236, 72, 153, 0.5)' : 'none',
                  }}
                />
              </Box>
              <Box className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-600">Used: {usedCredits.toLocaleString()}</span>
                {isPremium ? (
                  <span className="text-xs text-pink-400">No limits</span>
                ) : (
                  <span className="text-xs text-gray-600">{Math.round(100 - usagePercentage)}% left</span>
                )}
              </Box>
            </Box>

            {/* Upgrade Button */}
            {!isPremium && !isPro && (
              <Box
                onClick={() => {
                  console.log('[Upgrade] Opening pricing page:', `${APP_URL}/pricing`);
                  if (isElectron) {
                    // For Electron, open in external browser
                    window.open(`${APP_URL}/pricing`, '_blank');
                  } else {
                    // For web, open in same window
                    window.location.href = `${APP_URL}/pricing`;
                  }
                  onMobileClose?.();
                }}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  bgcolor: '#ec4899',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'white',
                  transition: 'all 0.15s ease',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                  boxShadow: '0 2px 8px rgba(236, 72, 153, 0.25)',
                  '&:hover': {
                    bgcolor: '#db2777',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 4px 12px rgba(236, 72, 153, 0.35)',
                  },
                  '&:active': {
                    transform: 'translateY(0px)',
                  },
                }}
              >
                <RocketLaunchIcon sx={{ fontSize: 17 }} />
                <span>Upgrade to Pro</span>
              </Box>
            )}
          </Box>
        );
      })()}

      {/* User Profile at bottom */}
      {user && (
        <>
          <Box sx={{
            p: 2,
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            bgcolor: 'rgba(255, 255, 255, 0.02)',
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
                  bgcolor: 'rgba(255, 255, 255, 0.06)',
                },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '8px',
                  bgcolor: 'rgba(236, 72, 153, 0.15)',
                  border: '1.5px solid rgba(236, 72, 153, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {user.name ? (
                  <span className="text-pink-500 text-xs font-bold">
                    {user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                  </span>
                ) : (
                  <span className="text-pink-500 text-xs font-bold">U</span>
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {user.name || 'User'}
                </Box>
                <Box sx={{
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: '11px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>

                  <Box sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px' }} >{ capitalize(user.is_paid || user.is_premium ? 'pro' : 'free')} Plan</Box>
                </Box>
              </Box>
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  color: 'rgba(255, 255, 255, 0.4)',
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
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                minWidth: '200px',
                mt: -1,
                ml: 1,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              }
            }}
          >
            <MenuItem
              onClick={handleProfile}
              sx={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '13px',
                fontWeight: 500,
                py: 1.25,
                px: 2,
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
              }}
            >
              <PersonIcon sx={{ fontSize: 17, mr: 1.5, color: 'rgba(255, 255, 255, 0.5)' }} />
              Profile
            </MenuItem>
            <MenuItem
              onClick={handleSettings}
              sx={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '13px',
                fontWeight: 500,
                py: 1.25,
                px: 2,
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
              }}
            >
              <SettingsIcon sx={{ fontSize: 17, mr: 1.5, color: 'rgba(255, 255, 255, 0.5)' }} />
              Settings
            </MenuItem>
            <Box sx={{ height: '1px', bgcolor: 'rgba(255, 255, 255, 0.06)', my: 0.5, mx: 1 }} />
            <MenuItem
              onClick={handleLogout}
              sx={{
                color: '#ef4444',
                fontSize: '13px',
                fontWeight: 500,
                py: 1.25,
                px: 2,
                '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' }
              }}
            >
              <LogoutIcon sx={{ fontSize: 17, mr: 1.5, color: '#ef4444' }} />
              Logout
            </MenuItem>
          </Menu>
        </>
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
              color: '#6b7280',
              '&:hover': {
                color: '#fff',
                bgcolor: '#1a1a1a',
              },
            }}
          >
            <CloseIcon />
          </IconButton>

          <h3 className="text-white font-semibold text-lg mb-6">
            Create New Project
          </h3>
          <form onSubmit={handleCreateProject}>
            <Box className="space-y-4">
              <TextField
                autoFocus
                fullWidth
                placeholder="Project name"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                error={!!createProjectError}
                helperText={createProjectError}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    bgcolor: '#000',
                    '& fieldset': {
                      borderColor: '#2a2a2a',
                    },
                    '&:hover fieldset': {
                      borderColor: '#3a3a3a',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#ec4899',
                    },
                  },
                  '& .MuiFormHelperText-root': {
                    color: '#ef4444',
                  },
                }}
              />

              {/* Color Label Selector */}
              <Box>
                <Typography className="text-gray-400 text-sm mb-2">
                  Label
                </Typography>
                <Box className="flex flex-wrap gap-1.5">
                  {PROJECT_COLORS.map((color) => (
                    <Box
                      key={color.value}
                      onClick={() => setSelectedColor(color.value)}
                      sx={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        bgcolor: color.value,
                        cursor: 'pointer',
                        border: selectedColor === color.value ? '2px solid #ec4899' : '2px solid transparent',
                        boxShadow: selectedColor === color.value ? '0 0 0 2px rgba(236, 72, 153, 0.2)' : 'none',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          boxShadow: '0 0 0 2px rgba(236, 72, 153, 0.3)',
                        },
                      }}
                      title={color.name}
                    />
                  ))}
                </Box>
              </Box>

              <Box className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseCreateProjectDialog}
                  className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject || !newProjectTitle.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingProject ? (
                    <CircularProgress size={18} sx={{ color: 'white' }} />
                  ) : (
                    'Create Project'
                  )}
                </button>
              </Box>
            </Box>
          </form>
        </Box>
      </Dialog>

      {/* Desktop Sidebar */}
      <Box
        sx={{
          width: '280px',
          height: '100vh',
          bgcolor: 'rgba(18, 18, 18, 0.95)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 1000,
          boxShadow: '2px 0 12px rgba(0, 0, 0, 0.3)',
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
              bgcolor: 'rgba(0, 0, 0, 0.7)',
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
              bgcolor: 'rgba(18, 18, 18, 0.98)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRight: '1px solid rgba(255, 255, 255, 0.06)',
              display: { xs: 'flex', md: 'none' },
              flexDirection: 'column',
              zIndex: 1300,
              overflowY: 'auto',
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.5)',
            }}
          >
            {sidebarContent}
          </Box>
        </>
      )}

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
              color: '#6b7280',
              '&:hover': {
                color: '#fff',
                bgcolor: '#1a1a1a',
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
                bgcolor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              <DeleteOutlineIcon sx={{ color: '#ef4444', fontSize: 24 }} />
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

