import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, IconButton, Dialog, TextField, Typography, CircularProgress, Menu, MenuItem, Chip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FolderIcon from '@mui/icons-material/Folder';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarViewMonthIcon from '@mui/icons-material/CalendarViewMonth';
import AddIcon from '@mui/icons-material/Add';
import SortIcon from '@mui/icons-material/Sort';
import ViewListIcon from '@mui/icons-material/ViewList';
import CheckIcon from '@mui/icons-material/Check';
import { projectService } from '@/app/services/project.service';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { dialogStyles } from '@/app/shared/utils';
import { PROJECT_COLORS, DEFAULT_COLOR } from '@/app/constants';

export default function ProjectsList() {
  const [user, setUser] = useAuthContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [projectToDelete, setProjectToDelete]: any = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // Default to grid view
  const [sortBy, setSortBy] = useState<'name' | 'lastUsed'>('lastUsed');
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();

  // Optimized search and sort using useMemo
  const filteredProjects = useMemo(() => {
    if (!user?.projects) return [];

    let projects = [...user.projects];

    // Apply search filter
    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      projects = projects.filter((project: any) => {
        // Search in title, name, description
        const searchableText = [
          project.title,
          project.name,
          project.description,
        ].filter(Boolean).join(' ').toLowerCase();

        return searchableText.includes(searchLower);
      });
    }

    // Apply sorting
    projects.sort((a: any, b: any) => {
      if (sortBy === 'name') {
        const nameA = (a.title || a.name || '').toLowerCase();
        const nameB = (b.title || b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      } else {
        // Sort by last used (updated_at)
        const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
        const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
        return dateB - dateA; // Most recent first
      }
    });

    return projects;
  }, [user?.projects, searchQuery, sortBy]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleOpenProject = (project: any, _: number = 0) => {
    navigate(`/documents?project=${project.id}`);
  };

  const handleOpenSettings = (project: any) => {
    navigate(`/project/${project.id}?tab=${1}`);
  };

  const handleOpenDeleteDialog = (project: any) => {
    // Prevent deletion of system projects
    if (project.system === true) {
      return;
    }
    setProjectToDelete(project);
    setDeleteConfirm('');
    setErrorMessage('');
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setProjectToDelete(null);
    setDeleteConfirm('');
    setErrorMessage('');
  };

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (deleteConfirm.toLowerCase() !== 'delete') {
      return;
    }

    if (!projectToDelete) return;

    // Prevent deletion of system projects
    if (projectToDelete.system === true) {
      setErrorMessage('Cannot delete system project');
      return;
    }

    setIsDeleting(true);
    setErrorMessage('');

    try {
      // Use project service to delete project and cleanup recent chats
      const result = await projectService.deleteProject(projectToDelete.id);

      if (result.success) {
        // Refresh projects from local API and update user
        const updatedProjects = await projectService.getProjects();
        const updatedUser = { ...user, projects: updatedProjects };
        setUser(updatedUser);
        handleCloseDeleteDialog();
      } else {
        setErrorMessage(result.error || 'Failed to delete project. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      setErrorMessage('An error occurred while deleting the project.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setNewProjectTitle('');
    setSelectedColor(DEFAULT_COLOR);
    setErrorMessage('');
    setOpenCreateDialog(true);
  };

  const handleCloseCreateDialog = () => {
    setOpenCreateDialog(false);
    setNewProjectTitle('');
    setSelectedColor(DEFAULT_COLOR);
    setErrorMessage('');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProjectTitle.trim()) {
      setErrorMessage('Project title is required');
      return;
    }

    setIsCreating(true);
    setErrorMessage('');

    try {
      // Use project service to create project
      const result = await projectService.createProject({
        name: newProjectTitle.trim(),
        color: selectedColor
      });

      if (result.success && result.data) {
        // Refresh projects from local API and update user
        const updatedProjects = await projectService.getProjects();
        const updatedUser = { ...user, projects: updatedProjects };
        setUser(updatedUser);
        handleCloseCreateDialog();
      } else {
        setErrorMessage(result.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      setErrorMessage('An error occurred while creating the project.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {user && (
        <>
          <Box className="min-h-screen bg-black text-white">
            <Box className="p-4">
              <Box className="max-w-6xl mx-auto mt-6 md:mt-8">
              {/* Header */}
              <Box className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
                <Box>
                  <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-1">Projects</h1>
                  <p className="text-gray-400 text-xs md:text-sm mt-2">Manage your projects and their documents</p>
                </Box>

                <Box className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
                  <Box className="flex items-center gap-1 bg-gray-900/50 border border-gray-700 rounded-lg p-1">
                    <IconButton
                      size="small"
                      onClick={() => setViewMode('grid')}
                      sx={{
                        color: viewMode === 'grid' ? '#ec4899' : '#9ca3af',
                        bgcolor: viewMode === 'grid' ? 'rgba(236, 72, 153, 0.1)' : 'transparent',
                        border: viewMode === 'grid' ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid transparent',
                        '&:hover': {
                          bgcolor: 'rgba(236, 72, 153, 0.1)',
                          borderColor: 'rgba(236, 72, 153, 0.2)',
                        },
                        padding: '8px',
                        borderRadius: '6px',
                      }}
                    >
                      <CalendarViewMonthIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setViewMode('list')}
                      sx={{
                        color: viewMode === 'list' ? '#ec4899' : '#9ca3af',
                        bgcolor: viewMode === 'list' ? 'rgba(236, 72, 153, 0.1)' : 'transparent',
                        border: viewMode === 'list' ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid transparent',
                        '&:hover': {
                          bgcolor: 'rgba(236, 72, 153, 0.1)',
                          borderColor: 'rgba(236, 72, 153, 0.2)',
                        },
                        padding: '8px',
                        borderRadius: '6px',
                      }}
                    >
                      <ViewListIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <button
                    onClick={handleOpenCreateDialog}
                    className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white rounded-lg border border-pink-500/30 transition-all shadow-lg shadow-pink-500/20"
                  >
                    <AddIcon sx={{ fontSize: { xs: 18, md: 20 } }} />
                    <span className="text-xs md:text-sm font-medium">New Project</span>
                  </button>

                  <button
                    onClick={(e) => setSortMenuAnchor(e.currentTarget)}
                    className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-gray-900/50 hover:bg-gray-800/50 text-gray-300 rounded-lg border border-gray-700 hover:border-gray-600 transition-all"
                  >
                    <span className="text-xs md:text-sm">Sort</span>
                    <SortIcon sx={{ fontSize: { xs: 16, md: 20 } }} />
                  </button>
                </Box>
              </Box>

              {/* Sort Menu */}
              <Menu
                anchorEl={sortMenuAnchor}
                open={Boolean(sortMenuAnchor)}
                onClose={() => setSortMenuAnchor(null)}
                PaperProps={{
                  sx: {
                    bgcolor: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '8px',
                    minWidth: '180px',
                    mt: 1,
                  }
                }}
              >
                <MenuItem
                  onClick={() => {
                    setSortBy('name');
                    setSortMenuAnchor(null);
                  }}
                  sx={{
                    color: '#e5e7eb',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    '&:hover': { bgcolor: '#2a2a2a' }
                  }}
                >
                  <span>By Name</span>
                  {sortBy === 'name' && <CheckIcon sx={{ fontSize: 18, color: '#ec4899', ml: 2 }} />}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setSortBy('lastUsed');
                    setSortMenuAnchor(null);
                  }}
                  sx={{
                    color: '#e5e7eb',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    '&:hover': { bgcolor: '#2a2a2a' }
                  }}
                >
                  <span>By Last Used</span>
                  {sortBy === 'lastUsed' && <CheckIcon sx={{ fontSize: 18, color: '#ec4899', ml: 2 }} />}
                </MenuItem>
              </Menu>

              {/* Search Bar */}
              <Box className="mb-6">
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    bgcolor: 'rgba(17, 24, 39, 0.5)',
                    borderRadius: '16px',
                    padding: '14px 18px',
                    border: '1px solid rgba(75, 85, 99, 0.3)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'rgba(236, 72, 153, 0.5)',
                    },
                    '&:focus-within': {
                      borderColor: '#ec4899',
                    },
                  }}
                >
                  <SearchIcon sx={{ color: '#6b7280' }} />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-white text-sm flex-1 placeholder-gray-500"
                  />
                  <span className="text-gray-500 text-xs bg-gray-800 px-2 py-1 rounded">⌘ K</span>
                </Box>
              </Box>

              {/* Projects Grid/List */}
              <Box className={filteredProjects.length > 0 ? (viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3') : ''}>
                {filteredProjects.length > 0 ? (
                  filteredProjects.map((project: any, index: number) => (
                    <Box
                      key={`${project.id}-${index}`}
                      sx={{
                        bgcolor: 'rgba(17, 24, 39, 0.6)',
                        border: '1px solid rgba(75, 85, 99, 0.3)',
                        borderRadius: '16px',
                        padding: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        height: viewMode === 'grid' ? '100%' : 'auto',
                        '&:hover': {
                          bgcolor: 'rgba(17, 24, 39, 0.8)',
                          borderColor: 'rgba(236, 72, 153, 0.4)',
                        }
                      }}
                      onClick={() => handleOpenProject(project, 0)}
                    >
                      <Box className={viewMode === 'grid' ? 'flex flex-col h-full' : 'flex items-center justify-between'}>
                        <Box className="flex-1">
                          <h3 className="text-white font-medium text-base mb-2">
                            {viewMode === 'grid'
                              ? `${(project.title || project.name || 'Untitled Project').substring(0, 20)}${(project.title || project.name || '').length > 20 ? '...' : ''}`
                              : (project.title || project.name || 'Untitled Project')
                            }
                          </h3>

                          <Box className="text-gray-500 text-xs mb-3 font-light">
                            Last updated: {formatDate(project.updated_at || project.created_at)}
                          </Box>

                          <Box className="flex items-center gap-2">
                            <Chip
                              label="#documents"
                              size="small"
                              variant="outlined"
                              sx={{
                                bgcolor: 'transparent',
                                color: '#ec4899',
                                fontSize: '11px',
                                height: '22px',
                                fontWeight: 500,
                                border: '1px solid rgba(236, 72, 153, 0.3)',
                                borderRadius: '4px',
                              }}
                            />
                            <Chip
                              label={(project.documents || []).length}
                              size="small"
                              variant="outlined"
                              sx={{
                                bgcolor: 'transparent',
                                color: '#ec4899',
                                fontSize: '11px',
                                height: '22px',
                                fontWeight: 600,
                                border: '1px solid rgba(236, 72, 153, 0.3)',
                                borderRadius: '4px',
                              }}
                            />
                          </Box>
                        </Box>

                        {/* Action Icons */}
                        <Box
                          className={viewMode === 'grid' ? 'flex items-center gap-2 mt-4 pt-4 border-t border-gray-800' : 'flex items-center gap-2'}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenProject(project, 0);
                            }}
                            sx={{
                              color: '#9ca3af',
                              bgcolor: 'rgba(236, 72, 153, 0.1)',
                              border: '1px solid rgba(236, 72, 153, 0.2)',
                              '&:hover': {
                                color: '#ec4899',
                                bgcolor: 'rgba(236, 72, 153, 0.2)',
                                borderColor: 'rgba(236, 72, 153, 0.4)',
                                transform: 'scale(1.05)',
                              },
                              transition: 'all 0.2s',
                            }}
                          >
                            <FolderIcon fontSize="small" />
                          </IconButton>

                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSettings(project);
                            }}
                            sx={{
                              color: '#9ca3af',
                              bgcolor: 'rgba(168, 85, 247, 0.1)',
                              border: '1px solid rgba(168, 85, 247, 0.2)',
                              '&:hover': {
                                color: '#a855f7',
                                bgcolor: 'rgba(168, 85, 247, 0.2)',
                                borderColor: 'rgba(168, 85, 247, 0.4)',
                                transform: 'scale(1.05)',
                              },
                              transition: 'all 0.2s',
                            }}
                          >
                            <SettingsIcon fontSize="small" />
                          </IconButton>

                          {!project.system && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeleteDialog(project);
                              }}
                              sx={{
                                color: '#9ca3af',
                                bgcolor: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                '&:hover': {
                                  color: '#ef4444',
                                  bgcolor: 'rgba(239, 68, 68, 0.2)',
                                  borderColor: 'rgba(239, 68, 68, 0.4)',
                                  transform: 'scale(1.05)',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Box className="text-center py-20">
                    <Box className="text-gray-500 text-lg mb-2">No projects yet</Box>
                    <Box className="text-gray-600 text-sm">
                      Create your first project by clicking the <strong className="text-pink-100">+ New Project</strong> button above.
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>

          {/* Delete Project Dialog */}
          <Dialog
            open={openDeleteDialog}
            onClose={handleCloseDeleteDialog}
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
                onClick={handleCloseDeleteDialog}
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

              {/* Title */}
              <h3 className="text-white font-semibold text-lg mb-6">
                Delete Project
              </h3>
              <form onSubmit={handleDeleteProject}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                    <DeleteIcon sx={{ color: '#ef4444', fontSize: 24, mt: 0.5 }} />
                    <Box>
                      <Typography className="text-red-400 font-medium mb-1">
                        Warning: This action cannot be undone
                      </Typography>
                      <Typography className="text-gray-300 text-sm">
                        Deleting "{projectToDelete?.title || projectToDelete?.name || 'this project'}" will permanently remove all documents, chat history, and associated data.
                      </Typography>
                    </Box>
                  </Box>

                  <Box>
                    <Typography className="text-gray-300 text-sm mb-3">
                      Please type <span className="px-2 py-0.5 bg-red-500 text-white font-mono text-xs rounded">delete</span> to confirm:
                    </Typography>
                    <TextField
                      autoComplete="off"
                      type="text"
                      placeholder="Type 'delete' to confirm"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      fullWidth
                      autoFocus
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: 'white',
                          bgcolor: '#000',
                          borderRadius: '8px',
                          '& fieldset': {
                            borderColor: '#2a2a2a',
                          },
                          '&:hover fieldset': {
                            borderColor: '#3a3a3a',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#ef4444',
                          },
                        },
                        '& .MuiInputBase-input::placeholder': {
                          color: '#6b7280',
                          opacity: 1,
                        },
                      }}
                    />
                  </Box>

                  {errorMessage.length > 0 && (
                    <Box className="p-3 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                      <Typography className="text-red-400 text-sm">
                        {errorMessage}
                      </Typography>
                    </Box>
                  )}

                  <Box className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseDeleteDialog}
                      className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={deleteConfirm.toLowerCase() !== 'delete' || isDeleting}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? (
                        <CircularProgress size={18} sx={{ color: 'white' }} />
                      ) : (
                        <>
                          <DeleteIcon fontSize="small" />
                          Delete Project
                        </>
                      )}
                    </button>
                  </Box>
                </Box>
              </form>
            </Box>
          </Dialog>

          {/* Create Project Dialog */}
          <Dialog
            open={openCreateDialog}
            onClose={handleCloseCreateDialog}
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
                onClick={handleCloseCreateDialog}
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

              {/* Title */}
              <h3 className="text-white font-semibold text-lg mb-6">
                Create New Project
              </h3>
              <form onSubmit={handleCreateProject}>
                <Box className="space-y-4 py-4">
                  <Box>
                    <Typography className="text-gray-300 text-sm mb-3">
                      Enter a name for your new project:
                    </Typography>
                    <TextField
                      autoComplete="off"
                      type="text"
                      placeholder="Project name"
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      fullWidth
                      autoFocus
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: 'white',
                          bgcolor: '#000',
                          borderRadius: '8px',
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
                        '& .MuiInputBase-input::placeholder': {
                          color: '#6b7280',
                          opacity: 1,
                        },
                      }}
                    />
                  </Box>

                  {/* Color Label Selector */}
                  <Box>
                    <Typography className="text-gray-300 text-sm mb-3">
                      Select a color label:
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

                  {errorMessage.length > 0 && (
                    <Box className="p-3 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                      <Typography className="text-red-400 text-sm">
                        {errorMessage}
                      </Typography>
                    </Box>
                  )}

                  <Box className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseCreateDialog}
                      className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newProjectTitle.trim() || isCreating}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20"
                    >
                      {isCreating ? (
                        <CircularProgress size={18} sx={{ color: 'white' }} />
                      ) : (
                        <>
                          <AddIcon fontSize="small" />
                          Create Project
                        </>
                      )}
                    </button>
                  </Box>
                </Box>
              </form>
            </Box>
          </Dialog>
          </Box>
        </>
      )}
    </>
  );
}
