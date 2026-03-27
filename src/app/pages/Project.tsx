import '../styles/markdown-editor.css';

import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { userService } from '@/app/services/user.service';
import { useAuthContext } from '@/app/contexts/AuthContext';

import CloseIcon from '@mui/icons-material/Close';
import AddBoxIcon from '@mui/icons-material/AddBox';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MenuIcon from '@mui/icons-material/Menu';
import WarningIcon from '@mui/icons-material/Warning';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';

import Box from '@mui/material/Box';
import {Chip, CircularProgress, IconButton, TextField, Typography, Switch } from '@mui/material';

import { Dialog, DialogContent, DialogTitle } from "@mui/material";

import { API_ENDPOINT, getLocalApiEndpoint } from '@/app/constants';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
import { documentService } from '@/app/services/document.service';
import { dialogStyles } from '@/app/shared/utils';

// Import SimpleMDE directly for desktop app (no lazy loading)
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// DocumentUploadDialog is now imported from components

function ProjectSection(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`project-file-${index}`}
      aria-labelledby={`project-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ color: 'inherit', height: 'auto' }}>{children}</Box>}
    </div>
  );
}

export default function Project() {
  const [user, setUser] = useAuthContext();
  const [current, setCurrent]: any = useState({});
  const [openDocumentUploadDialog, setOpenDocumentUploadDialog] = useState(false);
  const [openProjectDeleteDialog, setOpenProjectDeleteDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty] = useState(false)
  const [title, setTitle] = useState("");
  const [, setFiles]: any = useState([]);
  const [value, setValue] = useState(0);
  const [projectRules, setProjectRules] = useState("");
  const [memory, setMemory]: any = useState(true);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRulesRef = useRef<string>("");
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const [formData, setFormData] = useState({
    title: "",
    confirm: ""
  });

  // SimpleMDE editor options
  const editorOptions = useMemo(() => {
    return {
      spellChecker: false,
      placeholder: "Add project-specific skills and guidelines that will be included with every message...",
      status: false,
      toolbar: [
        "bold", "italic", "heading", "|",
        "quote", "unordered-list", "ordered-list", "|",
        "link", "code", "|",
        "preview", "guide"
      ] as any,
      minHeight: "200px",
      maxHeight: "400px",
    } as any;
  }, []);

  const handleOpenUploadDocumentDialog = () => {
    if (value === 1) {
      return;
    }

    setErrorMessage("");
    setIsLoading(false);
    setFiles([]); // Reset files to an empty array
    setOpenDocumentUploadDialog(true);
  }

  const handleCloseUploadDocumentDialog = () => {
    setOpenDocumentUploadDialog(false);
  };

  const handleKeypress = (e: any) => {
    if (e.which === 13) {
      e.currentTarget.blur();
    }
  }

  const handleProjectDelete = () => {
    setErrorMessage("");
    setOpenProjectDeleteDialog(true);
  }

  const handleCloseProjectDeleteDialog = () => {
    setOpenProjectDeleteDialog(false);
  };

  const deleteProject = async (e: any) => {
    e.preventDefault();

    setErrorMessage("");

    if (current !== null) {
      // Prevent deletion of system projects
      if (current.system === true) {
        setErrorMessage('Cannot delete system project');
        return;
      }

      if (formData.confirm.toLowerCase() !== 'delete') {
        return;
      }

      const id = current.id;
      const url = `${API_ENDPOINT}/projects/${id}`;

      setIsLoading(true);

      const options = {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${userService.token()}`
        }
      }
      await fetch(url, options);

      const updatedUser = await userService.get();
      setUser(updatedUser);

      // Dispatch events to refresh sidebar conversations and projects
      window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
      window.dispatchEvent(new CustomEvent('projectDeleted', { detail: { projectId: id } }));

      setIsLoading(false);

      // send to home
      navigate("/", { replace: true });
    }

    setOpenProjectDeleteDialog(false);
    setFormData({
      title: '',
      confirm: ''
    })

  }

  const handleSave = async (e: any) => {
    const titleToSave = title || e.target.value;
    if (titleToSave.length <= 1) {
      setTitle(current.title);
    } else {
      const url = `${API_ENDPOINT}/projects/${current.id}`;

      const options = {
        // Just updating "title" only so patching the object
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userService.token()}`
        },
        body: JSON.stringify({
          title: titleToSave,
        })
      }

      try {
        await fetch(url, options);
      } catch (ex: any) {
        console.error(ex);
      }
    }
  }

  const handleInput = (e: any) => {
    const fieldName = e.target.name;
    const fieldValue = e.target.value;

    setFormData((prevState) => ({
      ...prevState,
      [fieldName]: fieldValue
    }));
  }

  const updateProjectSettings = async (config: {
    rules?: string,
    memory?: boolean | null
  }) => {
    setIsLoading(true);

    try {
      const localBase = await getLocalApiEndpoint();

      if (config.rules !== undefined && current?.id) {
        const url = `${localBase}/v1/projects/${current.id}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules: [{ content: config.rules }] }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw result.detail || result.message || 'Failed to save rules';
        }
      }
    } catch (ex: any) {
      setIsLoading(false);
      setErrorMessage(ex);
    }
  }

  const handleMemoryChange = async (event: any) => {
    const newMemoryValue = event.target.checked;
    setMemory(newMemoryValue);

    await updateProjectSettings({
      rules: projectRules || '',
      memory: newMemoryValue
    });
  }

  const autoSaveProjectRules = async (rules: string) => {
    // Skip if the value hasn't changed from last save
    if (rules === lastSavedRulesRef.current) {
      return;
    }

    setIsSavingRules(true);

    try {
      const localBase = await getLocalApiEndpoint();
      const url = `${localBase}/v1/projects/${current?.id}`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: [{ content: rules }] }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw result.detail || result.message || 'Failed to save rules';
      }

      lastSavedRulesRef.current = rules;
    } catch (ex: any) {
      console.error('Error saving project rules:', ex);
    } finally {
      setIsSavingRules(false);
    }
  }

  const deleteDocument = async (documentId: string) => {
    try {
      setIsLoading(true);
      const deleteResult = await documentService.deleteLocalDocument(current.id, documentId);

      if (deleteResult.success) {
        // Remove document from local state without remote fetch
        if (current) {
          const updatedDocs = (current.documents || []).filter((d: any) => d.id !== documentId);
          const updatedProject = { ...current, documents: updatedDocs };
          setCurrent(updatedProject);
          if (user) {
            const updatedProjects = user.projects.map((p: any) =>
              p.id === current.id ? updatedProject : p
            );
            setUser({ ...user, projects: updatedProjects });
          }
        }
      } else {
        setErrorMessage(deleteResult.error || 'Failed to delete document');
      }
    } catch (ex: any) {
      setErrorMessage(ex.message || ex);
      console.error('Error deleting document:', ex);
    } finally {
      setIsLoading(false);
    }
  };

  const hasProcessingDocuments = (project: any) => {
    if (!project || !project.documents) return false;
    return project.documents.some((doc: any) => !doc.num_of_tokens || doc.num_of_tokens === 0);
  };

  const loadProject = async () => {
    if (!user || !slug) return;

    setIsLoading(true);
    try {
      const project = user.projects.find((p: any) => p.id === slug);

      if (!project) {
        console.error('Project not found:', slug);
        navigate('/projects');
        return;
      }

      // Load memory setting from config
      if (typeof project.config?.memory !== 'undefined') {
        setMemory(project.config.memory);
      }

      setCurrent(project);

      // Extract rules from project data
      const rules = (project.rules || []).map((r: any) => r.content).join('\n\n');
      setProjectRules(rules);
      lastSavedRulesRef.current = rules;
      setIsLoading(false);

      // Start polling if there are processing documents
      if (hasProcessingDocuments(project)) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch (error) {
      console.error('Project page: Error loading project:', error);
      navigate('/login');
    }
  };

  const startPolling = () => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll every 3 seconds
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);

          // Find the current project in the updated user data
          const updatedProject = updatedUser.projects.find((p: any) => p.id === slug);

          // Stop polling if all documents are processed
          if (updatedProject && !hasProcessingDocuments(updatedProject)) {
            stopPolling();
          }
        }
      } catch (error) {
        console.error('Error polling for document updates:', error);
      }
    }, 3000); // Poll every 3 seconds
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const updateProject = async () => {

  }

  useEffect(() => {
    if (user) {
      loadProject();
    }

    // Cleanup polling on unmount
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setValue(parseInt(tab));
    }
  }, [searchParams]);

  const selectTab = (tablIndex: number) => {
    setValue(tablIndex);
  };

  return (
    <>
      {user && (
        <>
          <IconButton
            sx={{
              position: 'fixed',
              top: 16,
              left: 16,
              zIndex: 1100,
              display: { xs: 'flex', md: 'none' },
              color: 'white',
              '&:hover': {
                color: 'var(--sl-brand-primary)',
              },
            }}
          >
            <MenuIcon />
          </IconButton>
          <DocumentUploadDialog
            open={openDocumentUploadDialog}
            onClose={handleCloseUploadDocumentDialog}
            onSuccess={() => {
              // Refresh will happen via window event
            }}
            user={user}
            setUser={setUser}
            preselectedProjectId={current?.id}
            disableProjectSelection={true}
          />

          <Box className="bg-black text-white" sx={{ display: 'flex', flexDirection: 'column' }}>
            <Box className="p-4 flex-shrink-0">
            <main className="page projects files relative bg-black flex-1 overflow-hidden flex flex-col">
              <Box className="flex flex-col">
                <Box className="mb-4 md:mb-6 mt-6 md:mt-8">
                  {current && (
                    <Box className="flex items-center gap-2 md:gap-4">
                      <button
                        onClick={() => {
                          navigate(-1);
                        }}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <ArrowBackIosIcon fontSize="small" />
                      </button>
                      <Box className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={title || current.title || ""}
                          maxLength={300}
                          onKeyDown={handleKeypress}
                          onChange={(e) => setTitle(e.target.value)}
                          className="text-xl md:text-2xl font-bold text-white outline-none hover:bg-gray-900 px-2 py-1 rounded cursor-text bg-transparent border-none flex-1"
                          onBlur={handleSave}
                          placeholder="---"
                        />
                        <div className="text-xs text-gray-500 whitespace-nowrap px-2">
                        </div>
                      </Box>
                    </Box>
                  )}
                </Box>

                <Box className="projects-page__body w-full" >
                  <Box className="projects-tabs relative flex flex-col">
                    <Box className="px-2 flex items-center justify-between mb-4 md:mb-6">


                      {value === 0 && (
                        <button
                          className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white rounded-lg border border-pink-500/30 transition-all shadow-lg shadow-pink-500/20"
                          onClick={handleOpenUploadDocumentDialog}
                        >
                          <AddBoxIcon sx={{ fontSize: { xs: 18, md: 20 } }} />
                          <span className="text-xs md:text-sm font-medium hidden md:inline">Add Document</span>
                          <span className="text-xs font-medium md:hidden">Add</span>
                        </button>
                      )}
                    </Box>

                    <Box className="projects-tabs__content relative flex-1" sx={{ overflow: value === 1 ? 'hidden' : 'auto' }}>
                      <ProjectSection value={value} index={0}>
                        <Box className="h-full p-2">
                          {(current && current.documents || []).length > 0 ? (
                            <Box className="space-y-3">
                              {current && (current.documents || []).map((doc: any, i: number) => {
                                return (
                                  <Box
                                    key={`doc-${i}`}
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

                                        <Box className="text-gray-500 text-sm mb-3">
                                          Last updated: {doc.updated_at ? new Date(doc.updated_at).toLocaleString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                          }) : 'N/A'}
                                        </Box>

                                        <Box className="flex items-center gap-2 flex-wrap">
                                          <Chip
                                            icon={<MonetizationOnIcon sx={{ fontSize: '14px !important', color: 'var(--sl-brand-primary) !important' }} />}
                                            label="Credits"
                                            size="small"
                                            variant="outlined"
                                            sx={{
                                              bgcolor: 'transparent',
                                              color: 'var(--sl-brand-primary)',
                                              fontSize: '11px',
                                              height: '22px',
                                              fontWeight: 500,
                                              border: '1px solid var(--sl-brand-alpha-30)',
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
                                                color: 'var(--sl-brand-primary)',
                                                fontSize: '11px',
                                                height: '22px',
                                                fontWeight: 600,
                                                border: '1px solid var(--sl-brand-alpha-30)',
                                                borderRadius: '4px',
                                              }}
                                            />
                                          ) : doc.is_processing ? (
                                            <Chip
                                              label="Processing..."
                                              size="small"
                                              icon={<CircularProgress size={10} sx={{ color: 'white !important' }} />}
                                              sx={{
                                                bgcolor: 'var(--sl-text-disabled)',
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
                                              icon={<WarningIcon sx={{ fontSize: '12px !important', color: 'var(--sl-status-warning) !important' }} />}
                                              label="Token Limit"
                                              size="small"
                                              sx={{
                                                bgcolor: 'color-mix(in srgb, var(--sl-status-warning) 10%, transparent)',
                                                color: 'var(--sl-status-warning)',
                                                fontSize: '11px',
                                                height: '22px',
                                                fontWeight: 500,
                                                border: '1px solid color-mix(in srgb, var(--sl-status-warning) 30%, transparent)',
                                                borderRadius: '4px',
                                              }}
                                            />
                                          )}
                                        </Box>
                                      </Box>

                                      {/* Action Icons */}
                                      <Box className="flex items-center gap-2">
                                        <IconButton
                                          size="small"
                                          onClick={() => navigate(`/documents?project=${current.id}`)}
                                          sx={{
                                            color: 'var(--sl-text-muted)',
                                            bgcolor: 'var(--sl-brand-alpha-10)',
                                            border: '1px solid var(--sl-brand-alpha-20)',
                                            '&:hover': {
                                              color: 'var(--sl-brand-primary)',
                                              bgcolor: 'var(--sl-brand-alpha-20)',
                                              borderColor: 'var(--sl-brand-alpha-40)',
                                              transform: 'scale(1.05)',
                                            },
                                            transition: 'all 0.2s',
                                          }}
                                        >
                                          <FolderIcon fontSize="small" />
                                        </IconButton>

                                        <IconButton
                                          size="small"
                                          onClick={() => selectTab(1)}
                                          sx={{
                                            color: 'var(--sl-text-muted)',
                                            bgcolor: 'rgba(59, 130, 246, 0.1)',
                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                            '&:hover': {
                                              color: 'var(--sl-status-info)',
                                              bgcolor: 'rgba(59, 130, 246, 0.2)',
                                              borderColor: 'rgba(59, 130, 246, 0.4)',
                                              transform: 'scale(1.05)',
                                            },
                                            transition: 'all 0.2s',
                                          }}
                                        >
                                          <SettingsIcon fontSize="small" />
                                        </IconButton>

                                        <IconButton
                                          size="small"
                                          onClick={async () => {
                                            // Handle delete
                                            if (confirm('Are you sure you want to delete this document?')) {
                                              await deleteDocument(doc.id);
                                            }
                                          }}
                                          sx={{
                                            color: 'var(--sl-text-muted)',
                                            bgcolor: 'var(--sl-danger-alpha-10)',
                                            border: '1px solid var(--sl-danger-alpha-20)',
                                            '&:hover': {
                                              color: 'var(--sl-status-error)',
                                              bgcolor: 'var(--sl-danger-alpha-20)',
                                              borderColor: 'var(--sl-danger-alpha-50)',
                                              transform: 'scale(1.05)',
                                            },
                                            transition: 'all 0.2s',
                                          }}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Box>
                                    </Box>
                                  </Box>
                                )
                              })}
                            </Box>
                          ) : (
                            (isLoading && !isDirty) ?
                              <div className="my-10 flex items-center gap-2 text-gray-400">
                                <CircularProgress size={16} sx={{ color: 'var(--sl-status-success)' }} /> please wait...
                              </div> :
                              <Box className="flex flex-col items-center justify-center py-16 px-6">
                                <Box className="text-center max-w-md">
                                  <Box className="mb-4">
                                    <InsertDriveFileIcon sx={{ fontSize: 64, color: 'var(--sl-text-faint)' }} />
                                  </Box>
                                  <h3 className="text-xl font-medium text-white mb-2">No documents yet</h3>
                                  <p className="text-gray-400 mb-6">
                                    Upload documents to start chatting with your project
                                  </p>
                                  <button
                                    onClick={handleOpenUploadDocumentDialog}
                                    className="flex items-center gap-2 px-6 py-3 bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 rounded-xl transition-colors font-medium mx-auto"
                                  >
                                    <AddBoxIcon /> Add Documents
                                  </button>
                                </Box>
                              </Box>
                          )}
                        </Box>
                      </ProjectSection>

                      <ProjectSection value={value} index={1}>
                        <Dialog
                          id="deleteProjectDialog"
                          open={openProjectDeleteDialog}
                          onClose={handleCloseProjectDeleteDialog}
                          maxWidth="sm"
                          fullWidth
                          PaperProps={{
                            sx: dialogStyles.paper
                          }}
                          BackdropProps={{
                            sx: dialogStyles.backdrop
                          }}
                        >
                          <DialogTitle sx={{ m: 0, p: 3, bgcolor: 'var(--sl-bg-base)', borderBottom: '1px solid var(--sl-bg-surface-1)' }}>
                            <Box className="flex items-center justify-between">
                              <span className="text-white text-xl font-semibold">Delete Project</span>
                              <IconButton
                                aria-label="close"
                                onClick={handleCloseProjectDeleteDialog}
                                sx={{
                                  color: 'var(--sl-text-disabled)',
                                  '&:hover': {
                                    color: 'white',
                                    bgcolor: 'var(--sl-bg-surface-1)'
                                  },
                                }}
                              >
                                <CloseIcon />
                              </IconButton>
                            </Box>
                          </DialogTitle>
                          <DialogContent sx={{ bgcolor: 'var(--sl-bg-base)', p: 3 }}>
                            <form onSubmit={deleteProject}>
                              <Box className="space-y-4">
                                <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                                  <DeleteIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24, mt: 0.5 }} />
                                  <Box>
                                    <Typography className="text-red-400 font-medium mb-1">
                                      Warning: This action cannot be undone
                                    </Typography>
                                    <Typography className="text-gray-300 text-sm">
                                      Deleting this project will permanently remove all documents, chat history, and associated data.
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
                                    id="confirm"
                                    name="confirm"
                                    placeholder="Type 'delete' to confirm"
                                    value={formData.confirm}
                                    onChange={handleInput}
                                    fullWidth
                                    autoFocus
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
                                          borderColor: 'var(--sl-status-error)',
                                        },
                                      },
                                      '& .MuiInputBase-input::placeholder': {
                                        color: 'var(--sl-text-disabled)',
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
                                    type="reset"
                                    onClick={handleCloseProjectDeleteDialog}
                                    className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={formData.confirm.toLowerCase() !== 'delete' || isLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isLoading ? (
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
                          </DialogContent>
                        </Dialog>
                        <Box className="h-full overflow-auto">
                          <Box className="max-w-6xl mx-auto mt-6 md:mt-8">
                            <Box className="mb-6 md:mb-8">
                              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                                Configuration
                              </h1>
                              <p className="text-sm md:text-base text-gray-400">Use the configuration below to adjust project settings</p>
                            </Box>

                            <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                              <form className="popup__form" onSubmit={updateProject}>
                                {
                                  current && current.config &&
                                  <Box className="space-y-6">
                                    <div className="space-y-3">
                                      <Box className="flex items-center justify-between mb-2">
                                        <label className="text-white text-sm font-medium">Project Skills (.smartlooprules)</label>
                                        <span className="text-xs text-gray-500">
                                          {projectRules.length}/300
                                        </span>
                                      </Box>
                                      <Box className="relative">
                                        {isSavingRules && (
                                          <Box
                                            sx={{
                                              position: 'absolute',
                                              top: '12px',
                                              right: '12px',
                                              zIndex: 10,
                                              bgcolor: 'var(--sl-black-alpha-50)',
                                              borderRadius: '50%',
                                              padding: '4px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                          >
                                            <CircularProgress size={16} sx={{ color: 'var(--sl-brand-primary)' }} />
                                          </Box>
                                        )}
                                        <Box className="markdown-editor-container">
                                          <SimpleMDE
                                            value={projectRules}
                                            onChange={(value: any) => {
                                              setProjectRules(value);

                                              // Debounce autosave
                                              if (autoSaveTimerRef.current) {
                                                clearTimeout(autoSaveTimerRef.current);
                                              }

                                              autoSaveTimerRef.current = setTimeout(() => {
                                                autoSaveProjectRules(value);
                                              }, 3000);
                                            }}
                                            options={editorOptions}
                                          />
                                        </Box>
                                      </Box>
                                      <p className="text-xs text-gray-500">Project skills will be automatically saved and included with every message sent to the AI. Use this to define guidelines, constraints, or context that should always be considered.</p>
                                    </div>
                                    <div className="space-y-3">
                                      <Box className="flex items-center justify-between">
                                        <label className="text-white text-sm font-medium">Memory</label>
                                        <Switch
                                          sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': {
                                              color: 'var(--sl-status-success)'
                                            },
                                            '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': {
                                              backgroundColor: 'var(--sl-status-success)'
                                            }
                                          }}
                                          aria-label='Conversation Memory'
                                          checked={memory}
                                          onChange={handleMemoryChange}
                                        />
                                      </Box>
                                      <p className="text-xs text-gray-500">
                                        When enabled, model will have the context of conversations up to 4096 tokens or 5 messages. By default memory is enabled, if you disable the memory at anytime it will lose the context of previous conversations
                                      </p>
                                    </div>
                                  </Box>
                                }
                              </form>
                            </Box>

                            <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                              <p className="text-sm text-gray-400 mb-6">Deleting the project will remove all the documents and histories and can not be undone</p>

                              {!current?.system && (
                                <button
                                  onClick={handleProjectDelete}
                                  className="px-4 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-500 hover:bg-opacity-10 transition-colors text-sm font-medium"
                                >
                                  Delete
                                </button>
                              )}
                              {current?.system && (
                                <p className="text-xs text-gray-500 italic">System projects cannot be deleted</p>
                              )}
                            </Box>

                            <div className="py-5"></div>

                          </Box>
                        </Box>

                      </ProjectSection>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </main>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}
