import '@/app/styles/documents.css';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, IconButton, Chip, Dialog, TextField, Typography, CircularProgress, Menu, MenuItem, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FolderIcon from '@mui/icons-material/Folder';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewListIcon from '@mui/icons-material/ViewList';
import AddIcon from '@mui/icons-material/Add';
import SortIcon from '@mui/icons-material/Sort';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import WarningIcon from '@mui/icons-material/Warning';
import MobileNav from '@/app/components/mobile-nav';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
import { userService } from '@/app/services/user.service';
import { projectService } from '@/app/services/project.service';
import { API_ENDPOINT } from '@/app/constants';
import Sidebar from '@/app/components/sidebar';
import { useAuth } from '@/app/hooks/useAuth';
import { dialogStyles } from '@/app/shared/utils';

function DocumentsListContent() {
  const [user, setUser] = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [allDocuments, setAllDocuments]: any = useState([]);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete]: any = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'lastUpdated'>('lastUpdated');
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');

  const startPolling = () => {
    // Clear any existing interval first
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const interval = setInterval(async () => {
      try {
        const updatedUser = await userService.get();
        if (updatedUser) {
          // Force a new object reference to trigger React re-render
          setUser({ ...updatedUser });

          // Check if all documents are processed
          let hasProcessing = false;
          (updatedUser.projects || []).forEach((project: any) => {
            if (!projectId || project.id === projectId) {
              (project.documents || []).forEach((doc: any) => {
                if (!doc.num_of_tokens || doc.num_of_tokens === 0) {
                  hasProcessing = true;
                }
              });
            }
          });

          // Stop polling if no documents are processing
          if (!hasProcessing) {
            stopPolling();
          }
        }
      } catch (error) {
        console.error('Error polling for document updates:', error);
      }
    }, 3000); // Poll every 3 seconds

    setPollingInterval(interval);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  useEffect(() => {
    if (user) {
      // Collect documents from all projects or specific project
      const docs: any[] = [];
      let hasProcessing = false;

      (user.projects || []).forEach((project: any) => {
        // If projectId is provided, only include documents from that project
        if (!projectId || project.id === projectId) {
          (project.documents || []).forEach((doc: any) => {
            docs.push({
              ...doc,
              projectId: project.id,
              projectName: project.title || project.name,
            });

            // Check if this document is still processing
            if (!doc.num_of_tokens || doc.num_of_tokens === 0) {
              hasProcessing = true;
            }
          });
        }
      });
      setAllDocuments(docs);

      // Start or stop polling based on processing status
      if (hasProcessing && !pollingInterval) {
        startPolling();
      } else if (!hasProcessing && pollingInterval) {
        stopPolling();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Listen for document upload events to trigger polling
  useEffect(() => {
    const handleDocumentUploaded = async () => {
      // Refresh user data immediately after upload
      try {
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
          // Start polling to check for processing completion
          startPolling();
        }
      } catch (error) {
        console.error('Error refreshing after document upload:', error);
      }
    };

    window.addEventListener('documentUploaded', handleDocumentUploaded);

    return () => {
      window.removeEventListener('documentUploaded', handleDocumentUploaded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optimized search and sort using useMemo for faster local filtering
  const filteredDocuments = useMemo(() => {
    let documents = [...allDocuments];

    // Apply search filter
    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      documents = documents.filter((doc: any) => {
        // Search in filename, name, title, description, and project name
        const searchableText = [
          doc.filename,
          doc.name,
          doc.title,
          doc.description,
          doc.projectName
        ].filter(Boolean).join(' ').toLowerCase();

        return searchableText.includes(searchLower);
      });
    }

    // Apply sorting
    documents.sort((a: any, b: any) => {
      if (sortBy === 'name') {
        const nameA = (a.filename || a.name || a.title || '').toLowerCase();
        const nameB = (b.filename || b.name || b.title || '').toLowerCase();
        return nameA.localeCompare(nameB);
      } else {
        // Sort by last updated
        const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
        const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
        return dateB - dateA; // Most recent first
      }
    });

    return documents;
  }, [allDocuments, searchQuery, sortBy]);

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

  const handleOpenUploadDialog = () => {
    setOpenUploadDialog(true);
  };

  const handleCloseUploadDialog = () => {
    setOpenUploadDialog(false);
  };

  const handleUploadSuccess = () => {
    startPolling();
  };

  const handleOpenDocument = (doc: any) => {
    navigate(`/project/${doc.projectId}?tab=0`);
  };

  const handleOpenDeleteDialog = (doc: any) => {
    setDocumentToDelete(doc);
    setDeleteConfirm('');
    setErrorMessage('');
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setDocumentToDelete(null);
    setDeleteConfirm('');
    setErrorMessage('');
  };

  const handleDeleteDocument = async (e: React.FormEvent) => {
    e.preventDefault();

    if (deleteConfirm.toLowerCase() !== 'delete') {
      return;
    }

    if (!documentToDelete) return;

    setIsDeleting(true);
    setErrorMessage('');

    try {
      // Check if this is the only document in the project
      const project = user?.projects?.find((p: any) => p.id === documentToDelete.projectId);
      const isOnlyDocument = project && project.documents && project.documents.length === 1;

      const url = `${API_ENDPOINT}/projects/${documentToDelete.projectId}/documents/${documentToDelete.id}`;
      const response = await userService.makeAuthenticatedRequest(url, {
        method: 'DELETE',
      });

      if (response && (response.status === 200 || response.status === 204)) {
        // If this was the only document, delete the project as well
        if (isOnlyDocument) {
          // Use project service to delete project and cleanup recent chats
          const deleteResult = await projectService.deleteProject(documentToDelete.projectId, user?.email);

          if (deleteResult.success) {
            // Refresh user data to get updated projects and documents
            const updatedUser = await userService.get();
            if (updatedUser) {
              setUser(updatedUser);
            }
          }
        } else {
          // Just refresh user data for document deletion
          const updatedUser = await userService.get();
          if (updatedUser) {
            setUser(updatedUser);
          }
        }

        handleCloseDeleteDialog();
      } else {
        setErrorMessage('Failed to delete document. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      setErrorMessage('An error occurred while deleting the document.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {user && (
        <>
          <Sidebar user={user} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

          <Box className="min-h-screen bg-black text-white">
            <Box className="p-4">
              <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
              <Box className="max-w-6xl mx-auto mt-6 md:mt-8">
              {/* Header */}
              <Box className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
                <Box>
                  <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Documents</h1>
                  {projectId && user && (
                    <Box className="text-gray-400 text-xs md:text-sm mt-2 flex items-center gap-2">
                      <span className="text-pink-400">●</span>
                      <span className="truncate">Showing documents for: <span className="text-white font-medium">{user.projects?.find((p: any) => p.id === projectId)?.title || user.projects?.find((p: any) => p.id === projectId)?.name || 'Selected Project'}</span></span>
                    </Box>
                  )}
                </Box>

                <Box className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
                  <IconButton
                    sx={{
                      color: '#9ca3af',
                      bgcolor: 'rgba(236, 72, 153, 0.1)',
                      border: '1px solid rgba(236, 72, 153, 0.2)',
                      '&:hover': {
                        bgcolor: 'rgba(236, 72, 153, 0.2)',
                        borderColor: 'rgba(236, 72, 153, 0.3)',
                      },
                      padding: '10px',
                    }}
                  >
                    <ViewListIcon fontSize="small" />
                  </IconButton>

                  <button
                    onClick={handleOpenUploadDialog}
                    className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white rounded-lg border border-pink-500/30 transition-all shadow-lg shadow-pink-500/20"
                  >
                    <AddIcon sx={{ fontSize: { xs: 18, md: 20 } }} />
                    <span className="text-xs md:text-sm font-medium hidden md:inline">Add Document</span>
                    <span className="text-xs font-medium md:hidden">Add</span>
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
                    setSortBy('lastUpdated');
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
                  <span>Last Updated</span>
                  {sortBy === 'lastUpdated' && <CheckIcon sx={{ fontSize: 18, color: '#ec4899', ml: 2 }} />}
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
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-white text-sm flex-1 placeholder-gray-500"
                  />
                  <span className="text-gray-500 text-xs bg-gray-800 px-2 py-1 rounded">⌘ K</span>
                </Box>
              </Box>

              {/* Documents List */}
              <Box className="space-y-3">
                {filteredDocuments.length > 0 ? (
                  filteredDocuments.map((doc: any, index: number) => (
                    <Box
                      key={`${doc.id}-${index}`}
                      sx={{
                        bgcolor: 'rgba(17, 24, 39, 0.6)',
                        border: '1px solid rgba(75, 85, 99, 0.3)',
                        borderRadius: '16px',
                        padding: { xs: '16px', md: '24px' },
                      }}
                    >
                      <Box className="flex items-center justify-between">
                        <Box className="flex-1">
                          <h3 className="text-white font-medium text-sm md:text-base mb-2">
                            {doc.filename || doc.name || 'Untitled Document'}
                          </h3>

                          <Box className="text-gray-400 text-xs mb-1 flex items-center gap-1.5">
                            <FolderIcon sx={{ fontSize: 14 }} />
                            <span>{doc.projectName || 'Unknown Project'}</span>
                          </Box>

                          <Box className="text-gray-600 text-xs mb-3">
                            Uploaded on {formatDate(doc.updated_at || doc.created_at)}
                          </Box>

                          <Box className="flex items-center gap-2">
                            <Chip
                              icon={<MonetizationOnIcon sx={{ fontSize: '14px !important', color: '#ec4899 !important' }} />}
                              label="Credits"
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
                            {doc.num_of_tokens && doc.num_of_tokens > 0 ? (
                              <Chip
                                label={`-${Math.ceil(doc.num_of_tokens / 100)}`}
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
                            ) : doc.is_processing ? (
                              <Chip
                                label="Processing..."
                                size="small"
                                icon={<CircularProgress size={10} sx={{ color: 'white !important' }} />}
                                sx={{
                                  bgcolor: '#6b7280',
                                  color: 'white',
                                  fontSize: '11px',
                                  height: '22px',
                                  fontWeight: 600,
                                  borderRadius: '4px',
                                }}
                              />
                            ) : null}
                            {doc.is_token_limit_reached && (
                              <Chip
                                icon={<WarningIcon sx={{ fontSize: '12px !important', color: '#f59e0b !important' }} />}
                                label="Token Limit"
                                size="small"
                                sx={{
                                  bgcolor: 'rgba(245, 158, 11, 0.1)',
                                  color: '#f59e0b',
                                  fontSize: '11px',
                                  height: '22px',
                                  fontWeight: 500,
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                          </Box>
                        </Box>

                        {/* Action Icons */}
                        <Box className="flex items-center gap-2">
                          <Tooltip title="View Document" arrow>
                            <IconButton
                              size="small"
                              onClick={async () => {
                                try {
                                  setDownloadingDocId(doc.id);
                                  const url = `${API_ENDPOINT}/projects/${doc.projectId}/documents/${doc.id}/download`;
                                  const response = await userService.makeAuthenticatedRequest(url, {
                                    method: 'GET',
                                  });

                                  if (response && response.ok) {
                                    const blob = await response.blob();
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                  }
                                } catch (error) {
                                  console.error('Error opening document:', error);
                                } finally {
                                  setDownloadingDocId(null);
                                }
                              }}
                              disabled={!doc.num_of_tokens || doc.num_of_tokens === 0 || downloadingDocId === doc.id}
                              sx={{
                                color: '#9ca3af',
                                bgcolor: 'rgba(96, 165, 250, 0.1)',
                                border: '1px solid rgba(96, 165, 250, 0.2)',
                                '&:hover': {
                                  color: '#60a5fa',
                                  bgcolor: 'rgba(96, 165, 250, 0.2)',
                                  borderColor: 'rgba(96, 165, 250, 0.4)',
                                  transform: 'scale(1.05)',
                                },
                                transition: 'all 0.2s',
                                '&:disabled': {
                                  color: '#4b5563',
                                  bgcolor: 'rgba(75, 85, 99, 0.1)',
                                  border: '1px solid rgba(75, 85, 99, 0.2)',
                                },
                              }}
                            >
                              {downloadingDocId === doc.id ? (
                                <CircularProgress size={16} className="text-pink-500" />
                              ) : (
                                <VisibilityIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Open Project" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDocument(doc)}
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
                          </Tooltip>

                          <Tooltip title="Project Settings" arrow>
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/project/${doc.projectId}?tab=2`)}
                              sx={{
                                color: '#9ca3af',
                                bgcolor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                '&:hover': {
                                  color: '#3b82f6',
                                  bgcolor: 'rgba(59, 130, 246, 0.2)',
                                  borderColor: 'rgba(59, 130, 246, 0.4)',
                                  transform: 'scale(1.05)',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <SettingsIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Delete Document" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDeleteDialog(doc)}
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
                          </Tooltip>
                        </Box>
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Box className="text-center py-20">
                    <Box className="text-gray-500 text-lg mb-2">No documents found</Box>
                    <Box className="text-gray-600 text-sm">
                      {searchQuery ? 'Try adjusting your search terms' : 'Upload documents to your projects to see them here'}
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>

          {/* Delete Document Dialog */}
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
                Delete Document
              </h3>
              <form onSubmit={handleDeleteDocument}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                    <DeleteIcon sx={{ color: '#ef4444', fontSize: 24, mt: 0.5 }} />
                    <Box>
                      <Typography className="text-red-400 font-medium mb-1">
                        Warning: This action cannot be undone
                      </Typography>
                      <Typography className="text-gray-300 text-sm">
                        Deleting "{documentToDelete?.filename || documentToDelete?.name || 'this document'}" will permanently remove it from the project.
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
                          Delete Document
                        </>
                      )}
                    </button>
                  </Box>
                </Box>
              </form>
            </Box>
          </Dialog>

          {/* Upload Document Dialog */}
          <DocumentUploadDialog
            open={openUploadDialog}
            onClose={handleCloseUploadDialog}
            onSuccess={handleUploadSuccess}
            user={user}
            setUser={setUser}
            preselectedProjectId={projectId || undefined}
            disableProjectSelection={true}
          />
          </Box>
        </>
      )}
    </>
  );
}

export default function DocumentsList() {
  return (
    <Suspense fallback={
      <Box className="min-h-screen bg-black text-white flex items-center justify-center">
        <CircularProgress sx={{ color: '#ec4899' }} />
      </Box>
    }>
      <DocumentsListContent />
    </Suspense>
  );
}
