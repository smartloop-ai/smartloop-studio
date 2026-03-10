import { useState } from 'react';
import { Box, Dialog, IconButton, CircularProgress, Tooltip, TextField, Typography } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
import { documentService } from '@/app/services/document.service';
import { dialogStyles } from '@/app/shared/utils';

interface DocumentsTabProps {
  user: any;
  setUser: (user: any) => void;
  selectedProject: any;
  setSelectedProject: (project: any) => void;
  currentProjectData: any;
  setCurrentProjectData: (project: any) => void;
  setActiveTab: (tab: number) => void;
}

export default function DocumentsTab({
  user,
  setUser,
  selectedProject,
  setSelectedProject,
  currentProjectData,
  setCurrentProjectData,
  setActiveTab,
}: DocumentsTabProps) {
  const [openDocumentUploadDialog, setOpenDocumentUploadDialog] = useState(false);
  const [openDeleteDocDialog, setOpenDeleteDocDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<any>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState('');
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [deleteDocError, setDeleteDocError] = useState('');

  const handleOpenUploadDocumentDialog = () => {
    setOpenDocumentUploadDialog(true);
  };

  const handleCloseUploadDocumentDialog = () => {
    setOpenDocumentUploadDialog(false);
  };

  const handleOpenDeleteDocDialog = (doc: any) => {
    setDocumentToDelete(doc);
    setDeleteDocConfirm('');
    setDeleteDocError('');
    setOpenDeleteDocDialog(true);
  };

  const handleCloseDeleteDocDialog = () => {
    setOpenDeleteDocDialog(false);
    setDocumentToDelete(null);
    setDeleteDocConfirm('');
    setDeleteDocError('');
  };

  const handleDeleteDocument = async (e: React.FormEvent) => {
    e.preventDefault();

    if (deleteDocConfirm.toLowerCase() !== 'delete') {
      return;
    }

    if (!documentToDelete || !selectedProject) return;

    setIsDeletingDoc(true);
    setDeleteDocError('');

    try {
      const deleteResult = await documentService.deleteLocalDocument(documentToDelete.id);

      if (deleteResult.success) {
        // Update user state incrementally - remove the deleted document from the specific project
        if (user && selectedProject) {
          const updatedProjects = user.projects.map((p: any) => {
            if (p.id === selectedProject.id) {
              const filteredDocs = (p.documents || []).filter((doc: any) => doc.id !== documentToDelete.id);
              return { ...p, documents: filteredDocs };
            }
            return p;
          });

          const updatedUser = { ...user, projects: updatedProjects };
          setUser(updatedUser);

          // Update current project data - keep project selected even with no documents
          const updatedProject = updatedProjects.find((p: any) => p.id === selectedProject.id);
          if (updatedProject) {
            setCurrentProjectData(updatedProject);
            setSelectedProject(updatedProject);
          }
        }
        // Stay on Documents tab
        setActiveTab(1);

        handleCloseDeleteDocDialog();
      } else {
        setDeleteDocError('Failed to delete document. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      setDeleteDocError('An error occurred while deleting the document.');
    } finally {
      setIsDeletingDoc(false);
    }
  };

  return (
    <>
      <Box className="px-4 md:px-8 lg:px-12 py-4 h-full overflow-auto">
        {/* Documents Tab */}
        <Box className="max-w-4xl mx-auto">
          <Box className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-400">
              {currentProjectData?.documents?.length || 0} document{(currentProjectData?.documents?.length || 0) !== 1 ? 's' : ''}
            </span>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-md border border-gray-700/50 transition-all"
              onClick={handleOpenUploadDocumentDialog}
            >
              <AddBoxIcon sx={{ fontSize: 16 }} />
              <span>Add</span>
            </button>
          </Box>

          {currentProjectData && (currentProjectData.documents || []).length > 0 ? (
            <Box className="space-y-2">
              {currentProjectData.documents.map((doc: any, i: number) => (
                <Box
                  key={`doc-${i}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '16px',
                    borderRadius: '10px',
                    bgcolor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.04)',
                      borderColor: 'rgba(255, 255, 255, 0.08)',
                    },
                  }}
                >
                  <Box className="flex items-start gap-4 flex-1 min-w-0">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: 'rgba(236, 72, 153, 0.12)',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <InsertDriveFileIcon sx={{ fontSize: 18, color: '#ec4899' }} />
                    </Box>
                    <Box className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-white font-medium truncate">
                          {doc.path ? (doc.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Untitled Document') : (doc.filename || doc.name || 'Untitled Document')}
                        </span>
                      </div>
                      {(doc.summary || doc.markdown) && (
                        <div
                          className="text-xs text-gray-400 leading-relaxed mb-2"
                          style={{ wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {doc.summary
                            ? doc.summary
                            : doc.markdown.replace(/\n/g, ' ').trim()}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      </div>
                    </Box>
                  </Box>
                  <Box className="flex items-center gap-2 mt-1">
                    {doc.is_token_limit_reached && (
                      <WarningIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                    )}
                    {/* Delete Document Button */}
                    <Tooltip title="Delete Document" arrow>
                      <IconButton
                        size="small"
                        onClick={() => handleOpenDeleteDocDialog(doc)}
                        sx={{
                          color: '#9ca3af',
                          bgcolor: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.15)',
                          '&:hover': {
                            color: '#ef4444',
                            bgcolor: 'rgba(239, 68, 68, 0.15)',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Document Upload Dialog */}
      <DocumentUploadDialog
        open={openDocumentUploadDialog}
        onClose={handleCloseUploadDocumentDialog}
        onSuccess={() => {
          // Just start polling and stay on Documents tab
          // The dialog already dispatches documentUploaded event which triggers polling
          setActiveTab(1);
        }}
        user={user}
        setUser={setUser}
        preselectedProjectId={selectedProject?.id}
        disableProjectSelection={true}
      />

      {/* Delete Document Confirmation Dialog */}
      <Dialog
        open={openDeleteDocDialog}
        onClose={() => !isDeletingDoc && handleCloseDeleteDocDialog()}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: dialogStyles.paper
        }}
        BackdropProps={{
          sx: dialogStyles.backdrop
        }}
      >
        <Box className="p-6">
          <Box className="flex items-center justify-between mb-4">
            <h3 className="text-white text-xl font-semibold">Delete Document</h3>
            <IconButton
              onClick={() => !isDeletingDoc && handleCloseDeleteDocDialog()}
              sx={{
                color: '#6b7280',
                '&:hover': {
                  color: 'white',
                  bgcolor: '#1a1a1a'
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          <form onSubmit={handleDeleteDocument}>
            <Box className="space-y-4">
              <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                <DeleteOutlineIcon sx={{ color: '#ef4444', fontSize: 24, mt: 0.5 }} />
                <Box>
                  <Typography className="text-red-400 font-medium mb-1">
                    Warning: This action cannot be undone
                  </Typography>
                  <Typography className="text-gray-300 text-sm">
                    Deleting "{documentToDelete?.path ? (documentToDelete.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'this document') : (documentToDelete?.filename || documentToDelete?.name || 'this document')}" will permanently remove it from your project.
                  </Typography>
                </Box>
              </Box>

              <Box>
                <Typography className="text-gray-300 text-sm mb-3">
                  Please type <span className="px-2 py-0.5 bg-red-500 text-white font-mono text-xs rounded">delete</span> to confirm:
                </Typography>
                <TextField
                  autoComplete="off"
                  fullWidth
                  value={deleteDocConfirm}
                  onChange={(e) => {
                    setDeleteDocConfirm(e.target.value);
                    setDeleteDocError('');
                  }}
                  placeholder="Type 'delete' to confirm"
                  disabled={isDeletingDoc}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: 'white',
                      bgcolor: 'rgba(17, 24, 39, 0.6)',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#ec4899',
                      },
                    },
                  }}
                />
                {deleteDocError && (
                  <Typography className="text-red-400 text-sm mt-2">
                    {deleteDocError}
                  </Typography>
                )}
              </Box>

              <Box className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseDeleteDocDialog}
                  disabled={isDeletingDoc}
                  className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingDoc || deleteDocConfirm.toLowerCase() !== 'delete'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingDoc ? (
                    <CircularProgress size={18} sx={{ color: 'white' }} />
                  ) : (
                    <>
                      <DeleteOutlineIcon fontSize="small" />
                      Delete Document
                    </>
                  )}
                </button>
              </Box>
            </Box>
          </form>
        </Box>
      </Dialog>
    </>
  );
}

