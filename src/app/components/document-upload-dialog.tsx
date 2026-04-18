
import { useState, useEffect } from 'react';
import { Box, Dialog, TextField, Typography, CircularProgress, IconButton, Autocomplete } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';
import { documentService } from '@/app/services/document.service';
import { dialogStyles } from '@/app/shared/utils';

interface DocumentUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: any;
  setUser: (user: any) => void;
  preselectedProjectId?: string;
  disableProjectSelection?: boolean;
}

export default function DocumentUploadDialog({
  open,
  onClose,
  onSuccess,
  user,
  preselectedProjectId,
  disableProjectSelection = false
}: DocumentUploadDialogProps) {
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projectInputValue, setProjectInputValue] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; status: string } | null>(null);

  // Set preselected project when dialog opens
  useEffect(() => {
    if (open && preselectedProjectId && user?.projects) {
      const project = user.projects.find((p: any) => p.id === preselectedProjectId);
      if (project) {
        setSelectedProject(project);
        setProjectInputValue(project.title || project.name);
      }
    }
  }, [open, preselectedProjectId, user?.projects]);

  const handleClose = () => {
    setSelectedProject(null);
    setProjectInputValue('');
    setUploadFiles([]);
    setUploadError('');
    setIsDragging(false);
    setUploadProgress(null);
    onClose();
  };

  const validateAndSetFile = (file: File) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
      return;
    }

    if (file.size > maxSize) {
      setUploadError('File size exceeds 10MB limit');
      return;
    }

    setUploadError('');
    setUploadFiles([file]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleUploadDocument = async () => {
    if (uploadFiles.length === 0) {
      setUploadError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      if (!selectedProject) {
        throw new Error('Please select a project to upload the document');
      }

      const targetProject = selectedProject;
      const file = uploadFiles[0];

      // Save file to a temp path then upload via local SLP POST /v1/documents
      if (!window.electronAPI?.saveTempFile) {
        throw new Error('Local file upload is not available outside of the desktop app');
      }

      const buffer = await file.arrayBuffer();
      const tempPath = await window.electronAPI.saveTempFile(file.name, buffer);

      // Listen for progress updates
      setUploadProgress({ percent: 0, status: 'Uploading...' });

      const progressHandler = (data: { percent: number; status: string }) => {
        setUploadProgress({ percent: data.percent, status: data.status });
      };
      window.electronAPI?.onSlpDocumentProgress?.(progressHandler);

      try {
        await documentService.addLocalDocument(targetProject.id, tempPath, undefined, targetProject.folder_path);
        setUploadProgress({ percent: 100, status: 'Complete' });
      } catch (_err) {
        // best-effort
      } finally {
        window.electronAPI?.removeSlpDocumentProgressListener?.();
        window.dispatchEvent(new CustomEvent('documentUploaded', {
          detail: { projectId: targetProject.id },
        }));
      }

      // Brief pause to show completion, then close
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 500);
    } catch (error: any) {
      setUploadError(error.message || 'Failed to upload document');
      setIsUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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
          onClick={handleClose}
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

        {/* Title */}
        <h3 className="text-white font-semibold text-lg mb-6">
          Add New Document
        </h3>

        <Box className="space-y-6">
          {/* Project Selection */}
          {!disableProjectSelection && (
            <Box>
              <Typography className="text-gray-300 text-sm font-medium mb-3">
                Select Project
              </Typography>
              <Autocomplete
                disabled={disableProjectSelection}
                value={selectedProject}
                onChange={(_, newValue) => {
                  if (newValue && typeof newValue === 'object') {
                    setSelectedProject(newValue);
                    setProjectInputValue(newValue.title || newValue.name);
                  } else {
                    setSelectedProject(null);
                    setProjectInputValue('');
                  }
                }}
                inputValue={projectInputValue}
                onInputChange={(_, newInputValue) => {
                  setProjectInputValue(newInputValue);
                }}
                options={user?.projects || []}
                getOptionLabel={(option) => option.title || option.name}
                renderOption={(props, option) => (
                  <Box component="li" {...props} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <FolderIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 20 }} />
                    <span>{option.title || option.name}</span>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Type to search or select project..."
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: 'white',
                        bgcolor: 'var(--sl-bg-base)',
                        borderRadius: '8px',
                        '& fieldset': {
                          borderColor: 'var(--sl-border-default)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'var(--sl-border-hover)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: 'var(--sl-brand-primary)',
                        },
                      },
                      '& .MuiInputBase-input::placeholder': {
                        color: 'var(--sl-text-disabled)',
                        opacity: 1,
                      },
                      '& .MuiAutocomplete-popupIndicator': {
                        color: 'var(--sl-text-disabled)',
                      },
                    }}
                  />
                )}
                sx={{
                  '& .MuiAutocomplete-paper': {
                    bgcolor: 'var(--sl-bg-surface-1)',
                    color: 'white',
                  },
                  '& .MuiAutocomplete-listbox': {
                    bgcolor: 'var(--sl-bg-surface-1)',
                    '& .MuiAutocomplete-option': {
                      color: 'white',
                      '&:hover': {
                        bgcolor: 'var(--sl-bg-surface-2)',
                      },
                      '&[aria-selected="true"]': {
                        bgcolor: 'var(--sl-bg-surface-2)',
                      },
                    },
                  },
                }}
                ListboxProps={{
                  sx: {
                    bgcolor: 'var(--sl-bg-surface-1)',
                    '& .MuiAutocomplete-option': {
                      color: 'white',
                      '&:hover': {
                        bgcolor: 'var(--sl-bg-surface-2)',
                      },
                      '&[aria-selected="true"]': {
                        bgcolor: 'var(--sl-bg-surface-2)',
                      },
                    },
                  },
                }}
                PaperComponent={({ children }) => (
                  <Box sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)', borderRadius: '8px' }}>
                    {children}
                  </Box>
                )}
              />
            </Box>
          )}

          {/* File Upload */}
          <Box>
            <Typography className="text-gray-300 text-sm font-medium mb-3">
              Upload Document
            </Typography>

            {isUploading && uploadProgress ? (
              <Box sx={{ p: 3, bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-white-alpha-10)', borderRadius: '8px' }}>
                <Box className="flex items-center gap-3 mb-3">
                  <InsertDriveFileIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 24 }} />
                  <Box>
                    <Typography className="text-white text-sm">{uploadFiles[0]?.name}</Typography>
                    <Typography className="text-gray-400 text-xs">{uploadProgress.status}</Typography>
                  </Box>
                </Box>
                <Box sx={{ width: '100%', bgcolor: 'var(--sl-white-alpha-10)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                  <Box sx={{
                    width: `${uploadProgress.percent}%`,
                    bgcolor: 'var(--sl-brand-primary)',
                    height: '100%',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </Box>
                <Typography className="text-gray-500 text-xs mt-2 text-right">{uploadProgress.percent}%</Typography>
              </Box>
            ) : uploadFiles.length === 0 ? (
              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-gray-700 hover:border-pink-600 bg-gray-900/50'
                }`}
                onClick={() => document.getElementById('file-upload-input')?.click()}
              >
                <CloudUploadIcon sx={{ fontSize: 48, color: 'var(--sl-text-disabled)', mb: 2 }} />
                <Typography className="text-gray-300 text-sm mb-1">
                  Drag and drop your file here
                </Typography>
                <Typography className="text-gray-500 text-xs mb-3">
                  or click to browse
                </Typography>
                <Typography className="text-gray-600 text-xs">
                  Supported: PDF, DOCX, TXT, CSV (Max 50MB)
                </Typography>
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </Box>
            ) : (
              <Box className="flex items-center justify-between p-4 bg-gray-900 border border-green-500/50 rounded-lg">
                <Box className="flex items-center gap-3">
                  <InsertDriveFileIcon sx={{ color: 'var(--sl-status-success)', fontSize: 24 }} />
                  <Box>
                    <Typography className="text-white text-sm">{uploadFiles[0].name}</Typography>
                    <Typography className="text-gray-400 text-xs">
                      {(uploadFiles[0].size / 1024 / 1024).toFixed(2)} MB
                    </Typography>
                  </Box>
                </Box>
                <IconButton
                  onClick={() => setUploadFiles([])}
                  size="small"
                  sx={{ color: 'var(--sl-status-error)' }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

          {/* Error Message */}
          {uploadError && (
            <Box className="p-3 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
              <Typography className="text-red-400 text-sm">
                {uploadError}
              </Typography>
            </Box>
          )}

          {/* Action Buttons */}
          <Box className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUploadDocument}
              disabled={(!selectedProject && !disableProjectSelection) || uploadFiles.length === 0 || isUploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <CircularProgress size={18} sx={{ color: 'white' }} />
              ) : (
                <>
                  <CloudUploadIcon fontSize="small" />
                  Upload Document
                </>
              )}
            </button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
