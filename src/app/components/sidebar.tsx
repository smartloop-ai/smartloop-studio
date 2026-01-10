import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, IconButton, Menu, MenuItem, Popover, Dialog, CircularProgress } from '@mui/material';
import { conversationService } from '../services/conversation.service';
import SearchIcon from '@mui/icons-material/Search';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import { userService } from '@/app/services/user.service';
import { dialogStyles } from '@/app/shared/utils';
import { APP_URL } from '@/app/constants';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

export default function Sidebar({ user, mobileOpen, onMobileClose }: { user?: any, mobileOpen?: boolean, onMobileClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAnchorEl, setSearchAnchorEl] = useState<null | HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOpen = Boolean(searchAnchorEl) && searchQuery.trim().length > 0;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveUser, setLiveUser] = useState(user);
  const lastTokenCount = useRef(user?.number_of_tokens_processed || 0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update live user when prop changes
  useEffect(() => {
    setLiveUser(user);
    lastTokenCount.current = user?.number_of_tokens_processed || 0;
  }, [user]);

  // Refresh user data on mount to ensure conversations are loaded
  useEffect(() => {
    refreshUserData();
  }, []);

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

    const handleConversationCreated = () => {
      refreshUserData();
    };

    const handleConversationDeleted = () => {
      refreshUserData();
    };

    window.addEventListener('refreshUserTokens', handleRefresh);
    window.addEventListener('conversationCreated', handleConversationCreated);
    window.addEventListener('conversationDeleted', handleConversationDeleted);

    return () => {
      window.removeEventListener('refreshUserTokens', handleRefresh);
      window.removeEventListener('conversationCreated', handleConversationCreated);
      window.removeEventListener('conversationDeleted', handleConversationDeleted);
    };
  }, []);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    // Only clear auth tokens, keep chat history
    localStorage.removeItem('token');
    localStorage.removeItem('u');
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

  const navItems = [
    { icon: <ChatBubbleOutlineIcon fontSize="small" />, label: 'Chat', path: '/' },
    { icon: <FolderOpenIcon fontSize="small" />, label: 'Projects', path: '/projects' },
    { icon: <DescriptionIcon fontSize="small" />, label: 'Documents', path: '/documents' },
  ];

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
        // Refresh user data to update sidebar
        const updatedUser = await userService.get();
        if (updatedUser) {
          setLiveUser(updatedUser);
        }

        // Clear localStorage for this conversation
        localStorage.removeItem(`chat_${conversationToDelete}`);

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
    if (!liveUser || !liveUser.conversations || liveUser.conversations.length === 0) return [];

    // Get conversations and enrich with localStorage chat data
    const recentConversations = liveUser.conversations
      .map((conversation: any) => {
        // Check for chat history in localStorage for this conversation
        let messageCount = 0;
        let hasMessages = false;
        let lastMessageTime = conversation.created_at || new Date();

        return {
          id: conversation.id,
          name: conversation.title || 'Untitled Conversation',
          projectId: conversation.project_id || null,
          lastMessage: conversation.last_message || null,
          createdAt: lastMessageTime,
          messageCount,
          hasMessages: hasMessages || messageCount > 0,
        };
      })
      // Filter to show all conversations (with or without messages)
      .filter((conv: any) => conv.id)
      // Sort by most recently updated (using message timestamps from localStorage)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      // Limit to 3 most recent
      .slice(0, 3);

    return recentConversations;
  };

  const recentChats = getRecentChats();

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !liveUser) return { projects: [], documents: [], allItems: [] };

    const query = searchQuery.toLowerCase();

    const projects = (liveUser.projects || []).filter((project: any) => {
      const title = (project.title || project.name || '').toLowerCase();
      return title.includes(query);
    });

    const documents = (liveUser.projects || []).flatMap((project: any) =>
      (project.documents || [])
        .filter((doc: any) => {
          const name = (doc.name || '').toLowerCase();
          return name.includes(query);
        })
        .map((doc: any) => ({
          ...doc,
          projectId: project.id,
          projectName: project.title || project.name || 'Untitled Project'
        }))
    );

    // Create a flat list for keyboard navigation
    const allItems = [
      ...projects.map((p: any) => ({ type: 'project', data: p })),
      ...documents.map((d: any) => ({ type: 'document', data: d }))
    ];

    return { projects, documents, allItems };
  }, [searchQuery, liveUser]);

  const handleSearchFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (searchQuery.trim()) {
      setSearchAnchorEl(event.currentTarget);
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
    setSelectedIndex(0);
    if (value.trim()) {
      setSearchAnchorEl(event.currentTarget);
    } else {
      setSearchAnchorEl(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen || searchResults.allItems.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) =>
          prev < searchResults.allItems.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const selected = searchResults.allItems[selectedIndex];
        if (selected) {
          if (selected.type === 'project') {
            handleProjectClick(selected.data.id);
          } else {
            handleDocumentClick(selected.data.projectId, selected.data.id);
          }
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        setSearchQuery('');
        setSearchAnchorEl(null);
        searchInputRef.current?.blur();
        break;
    }
  };

  const handleProjectClick = (projectId: string) => {
    navigate(`/project/${projectId}`);
    setSearchQuery('');
    setSearchAnchorEl(null);
    searchInputRef.current?.blur();
    onMobileClose?.();
  };

  const handleDocumentClick = (projectId: string, documentId: string) => {
    navigate(`/project/${projectId}?tab=0&doc=${documentId}`);
    setSearchQuery('');
    setSearchAnchorEl(null);
    searchInputRef.current?.blur();
    onMobileClose?.();
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchAnchorEl(null);
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
            onFocus={handleSearchFocus}
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

        {/* Search Results Popover */}
        <Popover
          open={searchOpen}
          anchorEl={searchAnchorEl}
          onClose={() => { }}
          disableAutoFocus
          disableEnforceFocus
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          PaperProps={{
            sx: {
              bgcolor: 'rgba(0, 0, 0, 0.98)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              width: searchAnchorEl?.offsetWidth || '248px',
              maxHeight: '400px',
              overflow: 'auto',
              mt: 0.5,
              pointerEvents: 'auto',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }
          }}
          sx={{
            pointerEvents: 'none',
          }}
        >
          <Box className="p-2">
            {searchResults.projects.length === 0 && searchResults.documents.length === 0 ? (
              <Box className="text-gray-500 text-sm p-3 text-center">
                No results found
              </Box>
            ) : (
              <>
                {searchResults.projects.length > 0 && (
                  <Box className="mb-2">
                    <Box className="text-xs text-gray-500 px-2 py-1 font-medium">
                      PROJECTS ({searchResults.projects.length})
                    </Box>
                    {searchResults.projects.map((project: any, index: number) => {
                      const isSelected = selectedIndex === index;
                      return (
                        <Box
                          key={project.id}
                          onClick={() => handleProjectClick(project.id)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            padding: '8px 12px',
                            cursor: 'pointer',
                            color: isSelected ? '#fff' : '#d1d5db',
                            bgcolor: isSelected ? '#2a2a2a' : 'transparent',
                            borderRadius: '6px',
                            '&:hover': {
                              bgcolor: '#2a2a2a',
                              color: '#fff',
                            },
                          }}
                        >
                          <FolderOpenIcon sx={{ fontSize: 16, color: '#ec4899' }} />
                          <span className="text-sm truncate">
                            {project.title || project.name || 'Untitled Project'}
                          </span>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {searchResults.documents.length > 0 && (
                  <Box>
                    <Box className="text-xs text-gray-500 px-2 py-1 font-medium">
                      DOCUMENTS ({searchResults.documents.length})
                    </Box>
                    {searchResults.documents.map((doc: any, index: number) => {
                      const globalIndex = searchResults.projects.length + index;
                      const isSelected = selectedIndex === globalIndex;
                      return (
                        <Box
                          key={doc.id}
                          onClick={() => handleDocumentClick(doc.projectId, doc.id)}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                            padding: '8px 12px',
                            cursor: 'pointer',
                            color: isSelected ? '#fff' : '#d1d5db',
                            bgcolor: isSelected ? '#2a2a2a' : 'transparent',
                            borderRadius: '6px',
                            '&:hover': {
                              bgcolor: '#2a2a2a',
                              color: '#fff',
                            },
                          }}
                        >
                          <Box className="flex items-center gap-1.5">
                            <DescriptionIcon sx={{ fontSize: 16, color: '#60a5fa' }} />
                            <span className="text-sm truncate">{doc.name}</span>
                          </Box>
                          <span className="text-xs text-gray-600 ml-6 truncate">
                            in {doc.projectName}
                          </span>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </>
            )}
          </Box>
        </Popover>
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 1 }}>
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
      </Box>

      {/* Chats Section */}
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
        }}>Conversations</Box>
        {recentChats.length > 0 ? (
          recentChats.map((chat: any) => (
            <Box
              key={chat.id}
              onClick={() => {
                navigate(`/?conversation=${chat.id}`);
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
                  : 'Start a conversation...'}
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
                  <span style={{ color: '#ec4899', fontSize: '13px', fontWeight: 700 }}>
                    {user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                  </span>
                ) : (
                  <span style={{ color: '#ec4899', fontSize: '13px', fontWeight: 700 }}>U</span>
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
                  {user.email || ''}
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

