'use client';

import '../styles/home.css';
import '../styles/mentions.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Dialog, IconButton, CircularProgress, Tooltip } from '@mui/material';
import { Mention, MentionsInput, SuggestionDataItem } from 'react-mentions';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { userService } from '@/app/services/user.service';
import { projectService } from '@/app/services/project.service';
import { API_ENDPOINT } from '@/app/constants';
import Chat from '@/app/components/chat';
import LoadingSpinner from '@/app/components/loading-spinner';
import { useAuth } from '@/app/hooks/useAuth';

export default function Home() {
  const [user, setUser] = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedProject, setSelectedProject]: any = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showProjectInfoDialog, setShowProjectInfoDialog] = useState(false);
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedDocument, setUploadedDocument] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hideTokenLimit, setHideTokenLimit] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good Morning';
    } else if (hour < 18) {
      return 'Good Afternoon';
    } else {
      return 'Good Evening';
    }
  };

  useEffect(() => {
    if (user) {
      setIsLoading(false);

      // Check if user has been onboarded
      if (!user.onboarded) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  // Clear project selection when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      setSelectedProject(null);
    };
  }, []);

  const handleCloseOnboarding = async () => {
    setShowOnboarding(false);

    // Save onboarded status to user object
    try {
      const updatedUser = await userService.updateSettings({ onboarded: true });
      if (updatedUser) {
        setUser(updatedUser);
      }
    } catch (error) {
      console.error('Failed to save onboarding status:', error);
    }
  };

  // Fetch projects for mentions
  const fetchProjects = async (search: string, callback: (data: SuggestionDataItem[]) => void) => {
    if (!user?.projects) {
      callback([]);
      return;
    }

    const filteredProjects = user.projects.filter((project: any) => {
      const projectName = (project.title || project.name || '').toLowerCase();
      return projectName.includes(search.toLowerCase());
    });

    const suggestions: SuggestionDataItem[] = filteredProjects.map((project: any) => ({
      id: project.id,
      display: project.title || project.name || 'Untitled Project',
    }));

    callback(suggestions);
  };

  // Render mention suggestions
  const renderProjectSuggestion = (suggestion: SuggestionDataItem, _search: string, highlightedDisplay: React.ReactNode) => {
    const project = user?.projects?.find((p: any) => p.id === suggestion.id);
    const docsCount = project?.documents?.length || 0;

    return (
      <div className="mention-project-item">
        <FolderOpenIcon className="mention-project-icon" />
        <div className="mention-project-info">
          <div className="mention-project-name">{highlightedDisplay}</div>
          <div className="mention-project-docs">{docsCount} docs</div>
        </div>
      </div>
    );
  };

  // Handle mention changes
  const handleMentionChange = (_event: any, newValue: string, _newPlainTextValue: string, mentions: any[]) => {
    setMessage(newValue);

    // Extract mentioned projects from the mentions array
    const projectMentions = mentions
      .filter((m: any) => m && m.id)
      .map((m: any) => {
        const project = user?.projects?.find((p: any) => p.id === m.id);
        return project;
      })
      .filter(Boolean);

    console.log('Mentions detected:', mentions, 'Projects found:', projectMentions);

    // Always use the last mentioned project as the selected one
    if (projectMentions.length > 0) {
      setSelectedProject(projectMentions[projectMentions.length - 1]);
    } else {
      setSelectedProject(null);
    }
  };

  const createProject = async (projectName: string) => {
    try {
      // Use project service to create project
      const result = await projectService.createProject({
        title: projectName,
        temperature: 0.3
      });

      if (result.success && result.data) {
        console.log('Project created successfully:', result.data);

        // Refresh user data to get updated projects list
        const updatedUser = await userService.get();
        setUser(updatedUser);
        return result.data;
      }

      // Log error response
      console.error('Failed to create project:', result.error);
      return null;
    } catch (error) {
      console.error('Error in createProject:', error);
      return null;
    }
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      // Remove @mention markup before sending the message
      // The markup format is: @[display](id)
      const cleanMessage = message.replace(/@\[([^\]]+)\]\([^)]+\)/g, '').trim();

      // Show chat on the same page (works with or without project)
      setChatMessage(cleanMessage);
      setShowChat(true);
      setMessage('');
    }
  };

  // Drag and drop handlers for file upload
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
      const maxSize = 5 * 1024 * 1024;

      if (!allowedTypes.includes(file.type)) {
        setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
        return;
      }
      if (file.size > maxSize) {
        setUploadError('File size exceeds 5MB limit');
        return;
      }

      // Auto-create project if needed
      let targetProject = selectedProject;
      if (!targetProject) {
        const fileName = file.name;
        const projectName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        const newProject = await createProject(projectName);
        if (newProject) {
          setSelectedProject(newProject);
          targetProject = newProject;
        } else {
          setUploadError('Failed to create project');
          return;
        }
      }

      // Upload file
      setIsUploading(true);
      setUploadError('');
      setUploadFiles([file]);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const url = `${API_ENDPOINT}/projects/${targetProject.id}/documents`;
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${userService.token()}`
          },
          body: formData
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.detail || result.message || 'Upload failed');
        }

        const result = await response.json();
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
        }

        // Set uploaded document and start processing check
        setUploadedDocument({
          name: file.name,
          size: file.size,
          projectId: targetProject.id,
          documentId: result.id
        });

        setIsProcessing(true);

        // Poll for processing completion
        const pollInterval = setInterval(async () => {
          try {
            const updatedUser = await userService.get();
            if (updatedUser) {
              setUser(updatedUser);

              const project = updatedUser.projects.find((p: any) => p.id === targetProject.id);
              const document = project?.documents?.find((d: any) => d.id === result.id);

              if (document && ((document.num_of_tokens && document.num_of_tokens > 0) || document.is_token_limit_reached)) {
                setIsProcessing(false);
                clearInterval(pollInterval);

                // Update uploaded document with token limit status
                if (document.is_token_limit_reached) {
                  setUploadedDocument((prev: any) => ({
                    ...prev,
                    is_token_limit_reached: true
                  }));
                }
              }
            }
          } catch (error) {
            console.error('Error polling document status:', error);
          }
        }, 3000);

        setIsUploading(false);
      } catch (error: any) {
        setUploadError(error.message || 'Failed to upload document');
        setIsUploading(false);
        setUploadFiles([]);
      }
    }
  };

  const features = [
    {
      title: 'Instantly extract information',
      subtitle: 'Extract',
      icon: <ManageSearchIcon sx={{ fontSize: 20 }} />,
    },
    {
      title: 'Learn smarter, faster',
      subtitle: 'Learn',
      icon: <MenuBookIcon sx={{ fontSize: 20 }} />,
    },
    {
      title: 'Grow with AI power',
      subtitle: 'Grow',
      icon: <TrendingUpIcon sx={{ fontSize: 20 }} />,
    },
  ];

  if (isLoading) {
    return <LoadingSpinner showLogo message="Getting things ready..." size={48} />;
  }

  return (
    <>
      {user && (
        <>
          {/* Sidebar is now rendered in App.tsx for persistence across routes */}
          {/* <Sidebar user={user} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} /> */}

          {/* Onboarding Dialog */}
          <Dialog
            open={showOnboarding}
            onClose={handleCloseOnboarding}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: {
                bgcolor: 'rgba(10, 10, 10, 0.7)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                borderRadius: '16px',
                maxWidth: '600px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              }
            }}
            BackdropProps={{
              sx: {
                backdropFilter: 'blur(4px)',
                bgcolor: 'rgba(0, 0, 0, 0.4)',
              }
            }}
          >
            <Box className="relative">
              {/* Close Button */}
              <IconButton
                onClick={handleCloseOnboarding}
                sx={{
                  position: 'absolute',
                  right: 16,
                  top: 16,
                  color: '#9ca3af',
                  '&:hover': {
                    color: '#fff',
                    bgcolor: 'rgba(236, 72, 153, 0.1)',
                  },
                }}
              >
                <CloseIcon />
              </IconButton>

              {/* Header */}
              <Box className="p-8 pb-4">
                <Box className="flex items-center gap-3 mb-3">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      bgcolor: 'rgba(236, 72, 153, 0.1)',
                      border: '1px solid rgba(236, 72, 153, 0.2)',
                    }}
                  >
                    <RocketLaunchIcon sx={{ color: '#ec4899', fontSize: 28 }} />
                  </Box>
                  <h2 className="text-2xl font-bold text-white">Welcome to Smartloop!</h2>
                </Box>
                <p className="text-gray-400 text-sm">
                  Let's get you started with a quick tour of how to make the most of your AI-powered workspace
                </p>
              </Box>

              {/* Steps */}
              <Box className="px-8 pb-8 space-y-6">
                {/* Step 1 */}
                <Box className="flex gap-4">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '40px',
                      height: '40px',
                      flexShrink: 0,
                      borderRadius: '10px',
                      bgcolor: 'rgba(236, 72, 153, 0.1)',
                      border: '1px solid rgba(236, 72, 153, 0.2)',
                    }}
                  >
                    <FolderOpenIcon sx={{ color: '#ec4899', fontSize: 22 }} />
                  </Box>
                  <Box className="flex-1">
                    <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                      <span className="text-pink-400 text-sm">01</span>
                      Understand Projects
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      A project is like a folder that lets you group related documents together. Each project keeps your information organized and isolated from others.
                    </p>
                  </Box>
                </Box>

                {/* Step 2 */}
                <Box className="flex gap-4">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '40px',
                      height: '40px',
                      flexShrink: 0,
                      borderRadius: '10px',
                      bgcolor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                    }}
                  >
                    <CreateNewFolderIcon sx={{ color: '#3b82f6', fontSize: 22 }} />
                  </Box>
                  <Box className="flex-1">
                    <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                      <span className="text-blue-400 text-sm">02</span>
                      Create or Select a Project
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-2">
                      Type <span className="px-2 py-0.5 bg-gray-800 text-pink-400 rounded font-mono text-xs">/project-name</span> in the message box to select an existing project or create a new one instantly.
                    </p>
                    <p className="text-gray-500 text-xs italic">
                      Example: Type <span className="text-pink-400">/marketing</span> to create a "marketing" project
                    </p>
                  </Box>
                </Box>

                {/* Step 3 */}
                <Box className="flex gap-4">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '40px',
                      height: '40px',
                      flexShrink: 0,
                      borderRadius: '10px',
                      bgcolor: 'rgba(168, 85, 247, 0.1)',
                      border: '1px solid rgba(168, 85, 247, 0.2)',
                    }}
                  >
                    <UploadFileIcon sx={{ color: '#a855f7', fontSize: 22 }} />
                  </Box>
                  <Box className="flex-1">
                    <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                      <span className="text-purple-400 text-sm">03</span>
                      Upload Your Documents
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Add PDFs, Word documents, or text files to your project. The AI will analyze them and make the information instantly accessible.
                    </p>
                  </Box>
                </Box>

                {/* Step 4 */}
                <Box className="flex gap-4">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '40px',
                      height: '40px',
                      flexShrink: 0,
                      borderRadius: '10px',
                      bgcolor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                    }}
                  >
                    <ManageSearchIcon sx={{ color: '#22c55e', fontSize: 22 }} />
                  </Box>
                  <Box className="flex-1">
                    <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                      <span className="text-green-400 text-sm">04</span>
                      Start Extracting Information
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Ask questions, request summaries, or generate content based on your documents. The AI searches across all project files to give you accurate answers.
                    </p>
                  </Box>
                </Box>
              </Box>

              {/* Footer Button */}
              <Box className="px-8 pb-8">
                <button
                  onClick={handleCloseOnboarding}
                  className="w-full py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-pink-500/20"
                >
                  Let's Go! 🚀
                </button>
              </Box>
            </Box>
          </Dialog>

          {/* Project Selection Info Dialog */}
          <Dialog
            open={showProjectInfoDialog}
            onClose={() => setShowProjectInfoDialog(false)}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: {
                bgcolor: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '12px',
                maxWidth: '480px',
              }
            }}
            BackdropProps={{
              sx: {
                backdropFilter: 'blur(4px)',
                bgcolor: 'rgba(0, 0, 0, 0.6)',
              }
            }}
          >
            <Box className="relative p-6">
              {/* Close Button */}
              <IconButton
                onClick={() => setShowProjectInfoDialog(false)}
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
                    bgcolor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                  }}
                >
                  <InfoOutlinedIcon sx={{ color: '#3b82f6', fontSize: 24 }} />
                </Box>
                <Box className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-1">
                    Project Selection Required
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    To add files, you need to select or create a project first.
                  </p>
                </Box>
              </Box>

              {/* Instructions */}
              <Box className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-4">
                <h4 className="text-white text-sm font-medium mb-2">How to select a project:</h4>
                <Box className="space-y-2">
                  <Box className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-pink-400 font-semibold">1.</span>
                    <span>Type <span className="px-2 py-0.5 bg-gray-800 text-pink-400 rounded font-mono text-xs">/</span> in the message box</span>
                  </Box>
                  <Box className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-pink-400 font-semibold">2.</span>
                    <span>Enter a project name or select from the list</span>
                  </Box>
                  <Box className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-pink-400 font-semibold">3.</span>
                    <span>Press <span className="px-2 py-0.5 bg-gray-800 text-blue-400 rounded font-mono text-xs">Enter</span> to confirm</span>
                  </Box>
                </Box>
              </Box>

              {/* Example */}
              <Box className="bg-pink-500/5 border border-pink-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">Example:</p>
                <p className="text-sm text-gray-300">
                  Type <span className="text-pink-400 font-mono">/marketing</span> to select or create a "marketing" project
                </p>
              </Box>

              {/* Action Button */}
              <button
                onClick={() => setShowProjectInfoDialog(false)}
                className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium transition-all text-sm"
              >
                Got it!
              </button>
            </Box>
          </Dialog>

          {/* File Upload Dialog */}
          <Dialog
            open={showFileUploadDialog}
            onClose={() => {
              setShowFileUploadDialog(false);
              setUploadFiles([]);
              setUploadError('');
              setIsDragging(false);
            }}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: {
                bgcolor: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '12px',
                maxWidth: '480px',
              }
            }}
            BackdropProps={{
              sx: {
                backdropFilter: 'blur(4px)',
                bgcolor: 'rgba(0, 0, 0, 0.6)',
              }
            }}
          >
            <Box className="relative p-6">
              {/* Close Button */}
              <IconButton
                onClick={() => {
                  setShowFileUploadDialog(false);
                  setUploadFiles([]);
                  setUploadError('');
                  setIsDragging(false);
                }}
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
                Upload Document
              </h3>

              <Box className="space-y-6">
                {/* Project Info */}
                {selectedProject && (
                  <Box className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <CheckCircleIcon sx={{ color: '#10b981', fontSize: 18 }} />
                    <span className="text-green-400 text-sm">
                      Uploading to: <span className="font-semibold">{selectedProject.title || selectedProject.name}</span>
                    </span>
                  </Box>
                )}

                {/* File Upload Area */}
                <Box>
                  {uploadFiles.length === 0 ? (
                    <Box
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          const file = e.dataTransfer.files[0];
                          const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
                          const maxSize = 50 * 1024 * 1024;

                          if (!allowedTypes.includes(file.type)) {
                            setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
                            return;
                          }
                          if (file.size > maxSize) {
                            setUploadError('File size exceeds 50MB limit');
                            return;
                          }
                          setUploadError('');
                          setUploadFiles([file]);
                        }
                      }}
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-pink-500 bg-pink-500/10'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
                      }`}
                      onClick={() => document.getElementById('home-file-upload-input')?.click()}
                    >
                      <CloudUploadIcon sx={{ fontSize: 48, color: '#6b7280', mb: 2 }} />
                      <Box className="text-gray-300 text-sm mb-1">
                        Drag and drop your file here
                      </Box>
                      <Box className="text-gray-500 text-xs mb-3">
                        or click to browse
                      </Box>
                      <Box className="text-gray-600 text-xs">
                        Supported: PDF, DOCX, TXT, CSV (Max 5MB)
                      </Box>
                      <input
                        id="home-file-upload-input"
                        type="file"
                        accept=".pdf,.docx,.txt,.csv"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const file = e.target.files[0];
                            const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
                            const maxSize = 5 * 1024 * 1024;

                            if (!allowedTypes.includes(file.type)) {
                              setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
                              return;
                            }
                            if (file.size > maxSize) {
                              setUploadError('File size exceeds 5MB limit');
                              return;
                            }
                            setUploadError('');
                            setUploadFiles([file]);
                          }
                        }}
                        className="hidden"
                      />
                    </Box>
                  ) : (
                    <Box className="flex items-center justify-between p-4 bg-gray-900 border border-green-500/50 rounded-lg">
                      <Box className="flex items-center gap-3">
                        <InsertDriveFileIcon sx={{ color: '#10b981', fontSize: 24 }} />
                        <Box>
                          <Box className="text-white text-sm">{uploadFiles[0].name}</Box>
                          <Box className="text-gray-400 text-xs">
                            {(uploadFiles[0].size / 1024 / 1024).toFixed(2)} MB
                          </Box>
                        </Box>
                      </Box>
                      <IconButton
                        onClick={() => setUploadFiles([])}
                        size="small"
                        sx={{ color: '#ef4444' }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>

                {/* Error Message */}
                {uploadError && (
                  <Box className="p-3 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                    <Box className="text-red-400 text-sm">
                      {uploadError}
                    </Box>
                  </Box>
                )}

                {/* Action Buttons */}
                <Box className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFileUploadDialog(false);
                      setUploadFiles([]);
                      setUploadError('');
                      setIsDragging(false);
                    }}
                    disabled={isUploading}
                    className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedProject || uploadFiles.length === 0) return;

                      setIsUploading(true);
                      setUploadError('');

                      try {
                        const formData = new FormData();
                        formData.append('file', uploadFiles[0]);

                        const url = `${API_ENDPOINT}/projects/${selectedProject.id}/documents`;
                        const response = await fetch(url, {
                          method: 'PUT',
                          headers: {
                            'Authorization': `Bearer ${userService.token()}`
                          },
                          body: formData
                        });

                        if (!response.ok) {
                          const result = await response.json();
                          throw new Error(result.detail || result.message || 'Upload failed');
                        }

                        const updatedUser = await userService.get();
                        if (updatedUser) {
                          setUser(updatedUser);
                        }

                        // Dispatch event for other components
                        window.dispatchEvent(new CustomEvent('documentUploaded', {
                          detail: { projectId: selectedProject.id }
                        }));

                        setShowFileUploadDialog(false);
                        setUploadFiles([]);
                        setUploadError('');

                        // Navigate to project
                        navigate(`/project/${selectedProject.id}?tab=0`);
                      } catch (error: any) {
                        setUploadError(error.message || 'Failed to upload document');
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                    disabled={!selectedProject || uploadFiles.length === 0 || isUploading}
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

          <Box className="min-h-screen bg-black text-white" >
            {showChat ? (
              // Chat View
              <Box className="h-screen flex flex-col bg-black">
                {/* Chat Header - matches project page style */}
                <Box className="flex-none px-4 py-4 md:py-6 border-b border-gray-900">
                  {/* MobileNav is now rendered in App.tsx for persistence across routes */}
                  {/* <MobileNav onMenuClick={() => setMobileMenuOpen(true)} /> */}
                  <Box className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        setShowChat(false);
                        setChatMessage(null);
                        setMessage('');
                        setSelectedProject(null);
                        setUploadFiles([]);
                        setUploadedDocument(null);
                        setIsProcessing(false);
                        setUploadError('');
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                      title="Back to home"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                    <div
                      className="text-xl md:text-2xl font-bold text-white"
                    >
                      {selectedProject ? (selectedProject.title || selectedProject.name) : 'general'}
                    </div>
                  </Box>
                </Box>

                {/* Chat Component - full height */}
                <Box className="flex-1 overflow-hidden" style={{ height: 'calc(100vh - 89px)' }}>
                  <Chat
                    project={selectedProject}
                    initialMessage={chatMessage}
                    onTokenUpdate={() => {
                      // Trigger sidebar refresh via custom event
                      window.dispatchEvent(new Event('refreshUserTokens'));
                    }}
                  />
                </Box>
              </Box>
            ) : (
              // Welcome Screen
              <Box className="p-4">
                {/* MobileNav is now rendered in App.tsx for persistence across routes */}
                {/* <MobileNav onMenuClick={() => setMobileMenuOpen(true)} /> */}
                <Box className="flex items-center justify-center mt-12 md:mt-20">
                  <Box className="max-w-4xl w-full">
                    {/* Greeting */}
                    <Box className="mb-8">
                    <Box className="hidden md:flex items-center mb-4">
                      <Box className="w-12 h-12 rounded-full flex">
                        <svg width="27" height="27" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.4663 24.5027C19.6795 24.5027 24.7163 19.6266 24.7163 13.6117C24.7163 7.5968 19.6795 2.72075 13.4663 2.72075C7.25311 2.72075 2.21631 7.5968 2.21631 13.6117C2.21631 19.6266 7.25311 24.5027 13.4663 24.5027Z" stroke="url(#paint0_linear_160_831)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M8.11121 17.9681C9.29246 19.6126 11.2725 20.6908 13.5 20.6908C15.7275 20.6908 17.6962 19.6126 18.8887 17.9681" stroke="url(#paint1_linear_160_831)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <defs>
                            <linearGradient id="paint0_linear_160_831" x1="13.4663" y1="2.72075" x2="13.4663" y2="24.5027" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#D3F3FF" />
                              <stop offset="1" stopColor="white" />
                            </linearGradient>
                            <linearGradient id="paint1_linear_160_831" x1="13.5" y1="17.9681" x2="13.5" y2="20.6908" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#D3F3FF" />
                              <stop offset="1" stopColor="white" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </Box>
                    </Box>
                    <h1 className="text-2xl md:text-4xl font-light mb-2">
                      <span className="md:hidden ml-2" >{getGreeting()}, <span className="font-semibold text-pink-400">{user?.name?.split(' ')[0] || 'there'}</span>!</span>
                      <span className="hidden md:inline">{getGreeting()}, <span className="font-semibold text-pink-400">{user?.name?.split(' ')[0] || 'there'}</span>!</span>
                    </h1>
                  </Box>

                  {/* Pro Plan Banner - Only show if user is not paid */}
                  {!user?.is_paid && (
                    <Box
                      className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => navigate('/pricing')}
                    >
                      <Box className="flex items-center gap-2 text-sm">
                        <FlashOnIcon sx={{ fontSize: 18, color: '#fbbf24' }} />
                        <span>Unlock more features with <span className="font-semibold">Pro Plan</span></span>
                      </Box>
                    </Box>
                  )}

                  {/* Error Messages - Above Input Box */}
                  {(uploadError || uploadedDocument?.is_token_limit_reached) && (
                    <Box className="mb-4">
                      {uploadError && (
                        <Box className="flex items-center justify-between gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <Box className="flex items-center gap-2">
                            <ErrorIcon sx={{ color: '#ef4444', fontSize: 18 }} />
                            <Box className="text-red-400 text-sm font-medium">
                              {uploadError}
                            </Box>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={async () => {
                              // Delete the project if it was auto-created
                              if (uploadedDocument?.projectId) {
                                try {
                                  await projectService.deleteProject(uploadedDocument.projectId, user?.email);
                                  const updatedUser = await userService.get();
                                  setUser(updatedUser);
                                } catch (error) {
                                  console.error('Error deleting project:', error);
                                }
                              }

                              // Clear all upload-related states
                              setUploadError('');
                              setUploadFiles([]);
                              setUploadedDocument(null);
                              setIsProcessing(false);
                              setSelectedProject(null);
                            }}
                            sx={{ color: '#ef4444', padding: '4px' }}
                          >
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Box>
                      )}
                      {uploadedDocument?.is_token_limit_reached && !hideTokenLimit && (
                        <Box className="flex items-center justify-between gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg mt-2">
                          <Box className="flex items-center gap-2">
                            <ErrorIcon sx={{ color: '#ef4444', fontSize: 18 }} />
                            <Box className="text-red-400 text-sm font-medium">
                              Token Limit Exceeded. Please upgrade your plan to upload larger documents.
                            </Box>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={async () => {
                              setHideTokenLimit(true);
                              setIsProcessing(false);
                              setUploadError('');
                            }}
                            sx={{ color: '#ef4444', padding: '4px' }}
                          >
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Main Input Area */}
                  <Box
                    className={`bg-gray-900/50 border rounded-2xl p-4 md:p-6 mb-6 relative transition-all ${
                      isDragging
                        ? 'border-pink-500 bg-pink-500/10'
                        : 'border-gray-700 hover:border-pink-500/50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {isDragging && (
                      <Box className="absolute inset-0 flex items-center justify-center bg-pink-500/10 rounded-2xl pointer-events-none z-10">
                        <Box className="text-center">
                          <CloudUploadIcon sx={{ fontSize: 48, color: '#ec4899', mb: 1 }} />
                          <div className="text-pink-400 font-medium">
                            Drop file to upload
                          </div>
                          <div className="text-pink-300 text-sm">
                            PDF, DOCX, TXT, CSV (Max 50MB)
                          </div>
                        </Box>
                      </Box>
                    )}

                    <MentionsInput
                      value={message}
                      onChange={handleMentionChange}
                      placeholder="Enter your prompt here (e.g. what are the places to visit in Madrid)"
                      className="mentions"
                      allowSuggestionsAboveCursor={true}
                      style={{
                        control: {
                          minHeight: '100px',
                          border: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                        },
                        input: {
                          color: 'white',
                          minHeight: '100px',
                          border: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                        },
                        highlighter: {
                          minHeight: '100px',
                          border: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                        },
                        suggestions: {
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #2a2a2a',
                          borderRadius: '8px',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                          zIndex: 10000,
                        },
                      }}
                      inputRef={textareaRef}
                      onKeyDown={(e: any) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    >
                      <Mention
                        trigger="@"
                        data={fetchProjects}
                        renderSuggestion={renderProjectSuggestion}
                        displayTransform={(_id: string, display: string) => `@${display}`}
                        markup="@[__display__](__id__)"
                        appendSpaceOnAdd={true}
                        style={{
                          backgroundColor: 'rgba(236, 72, 153, 0.15)',
                        }}
                      />
                    </MentionsInput>

                    <Box className="flex items-center justify-between mt-4">
                      {/* Left side - File attachment */}
                      <Box className="flex items-center gap-2">
                        {/* File Attachment */}
                        {(uploadFiles.length > 0 || uploadedDocument) ? (
                          <Box
                            className="inline-flex items-center gap-2 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded-lg"
                            sx={{ height: '28px' }}
                          >
                            {isUploading || isProcessing ? (
                              <CircularProgress size={14} sx={{ color: '#ec4899' }} />
                            ) : uploadedDocument?.is_token_limit_reached ? (
                              <Tooltip title="Token limit reached for this document">
                                <ErrorIcon sx={{ color: '#ef4444', fontSize: 14 }} />
                              </Tooltip>
                            ) : (
                              <InsertDriveFileIcon sx={{ color: '#10b981', fontSize: 14 }} />
                            )}
                            <Box className="text-white text-xs truncate max-w-[140px]">
                              {uploadedDocument?.name || uploadFiles[0]?.name}
                            </Box>
                            {!isUploading && (
                              <IconButton
                                onClick={async () => {
                                  // Delete the project if it was auto-created using project service
                                  if (uploadedDocument?.projectId) {
                                    try {
                                      await projectService.deleteProject(uploadedDocument.projectId, user?.email);

                                      // Refresh user data
                                      const updatedUser = await userService.get();
                                      setUser(updatedUser);
                                    } catch (error) {
                                      console.error('Error deleting project:', error);
                                    }
                                  }

                                  // Clear attachment state
                                  setUploadFiles([]);
                                  setUploadedDocument(null);
                                  setIsProcessing(false);
                                  setUploadError('');
                                  setSelectedProject(null);
                                }}
                                size="small"
                                sx={{
                                  color: '#9ca3af',
                                  '&:hover': { color: '#ef4444' },
                                  padding: '2px'
                                }}
                              >
                                <CloseIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            )}
                          </Box>
                        ) : (
                          <button
                            onClick={() => {
                              document.getElementById('home-file-attach-input')?.click();
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/30 border border-gray-800/50 hover:bg-gray-800/50 hover:border-gray-700/50 text-gray-500 hover:text-gray-300 transition-all text-xs"
                            style={{ height: '28px' }}
                          >
                            <AttachFileIcon sx={{ fontSize: 14 }} />
                            <span>Attach</span>
                          </button>
                        )}
                      </Box>
                      <input
                        id="home-file-attach-input"
                        type="file"
                        accept=".pdf,.docx,.txt,.csv"
                          onChange={async (e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              const file = e.target.files[0];
                              const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
                              const maxSize = 5 * 1024 * 1024;

                              if (!allowedTypes.includes(file.type)) {
                                setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
                                return;
                              }
                              if (file.size > maxSize) {
                                setUploadError('File size exceeds 5MB limit');
                                return;
                              } // Auto-create project if needed
                            let targetProject = selectedProject;
                            if (!targetProject) {
                              // Use file name without extension as project name
                              const fileName = file.name;
                              const projectName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
                              const newProject = await createProject(projectName);
                              if (newProject) {
                                setSelectedProject(newProject);
                                targetProject = newProject;
                              } else {
                                setUploadError('Failed to create project');
                                return;
                              }
                            }

                            // Upload file
                            setIsUploading(true);
                            setUploadError('');
                            setUploadFiles([file]);

                            try {
                              const formData = new FormData();
                              formData.append('file', file);

                              const url = `${API_ENDPOINT}/projects/${targetProject.id}/documents`;
                              const response = await fetch(url, {
                                method: 'PUT',
                                headers: {
                                  'Authorization': `Bearer ${userService.token()}`
                                },
                                body: formData
                              });

                              if (!response.ok) {
                                const result = await response.json();
                                throw new Error(result.detail || result.message || 'Upload failed');
                              }

                              const result = await response.json();
                              const updatedUser = await userService.get();
                              if (updatedUser) {
                                setUser(updatedUser);
                              }

                              // Set uploaded document and start processing check
                              setUploadedDocument({
                                name: file.name,
                                size: file.size,
                                id: result.id,
                                projectId: targetProject.id
                              });
                              setIsProcessing(true);

                              // Start polling for processing status
                              const checkProcessing = setInterval(async () => {
                                const currentUser = await userService.get();
                                if (currentUser) {
                                  const project = currentUser.projects.find((p: any) => p.id === targetProject.id);
                                  if (project) {
                                    const doc = project.documents.find((d: any) => d.id === result.id);
                                    if (doc && ((doc.num_of_tokens && doc.num_of_tokens > 0) || doc.is_token_limit_reached)) {
                                      setIsProcessing(false);
                                      clearInterval(checkProcessing);

                                      // Update uploaded document with token limit status
                                      if (doc.is_token_limit_reached) {
                                        setUploadedDocument((prev: any) => ({
                                          ...prev,
                                          is_token_limit_reached: true
                                        }));
                                      }
                                    }
                                  }
                                }
                              }, 3000);

                              // Dispatch event
                              window.dispatchEvent(new CustomEvent('documentUploaded', {
                                detail: { projectId: targetProject.id }
                              }));

                            } catch (error: any) {
                              setUploadError(error.message || 'Failed to upload document');
                              setUploadFiles([]);
                            } finally {
                              setIsUploading(false);
                            }

                            // Reset file input
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                      />

                      <button
                        disabled={!message.trim() || isUploading || isProcessing || !!uploadError || uploadedDocument?.is_token_limit_reached}
                        className="rounded-full p-2 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg flex items-center justify-center"
                        onClick={handleSendMessage}

                      >
                        <ArrowUpwardIcon sx={{ color: '#fff', fontSize: 20 }} />
                      </button>
                    </Box>

                    {/* Helper Text */}
                    <Box className="mt-4 pt-4 border-t border-gray-800">
                      <Box className="text-xs text-gray-500">
                        💡 Tip: Type <span className="text-pink-400 font-mono bg-gray-800 px-1 rounded">@name</span> to mention a project (e.g., <span className="text-pink-400 font-mono bg-gray-800 px-1 rounded">@myproject</span>). Use ↑↓ to navigate, Enter to confirm.
                      </Box>
                    </Box>
                  </Box>

                  {/* Feature Cards */}
                  <Box className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
                    {features.map((feature, index) => (
                      <Box
                        key={index}
                        className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 md:p-6"
                      >
                        <Box className="mb-4">
                          <h3 className="text-sm font-medium mb-2 text-white">{feature.title}</h3>
                        </Box>
                        <Box className="flex items-center gap-2 text-gray-400">
                          {feature.icon}
                          <span className="text-sm">{feature.subtitle}</span>
                        </Box>
                      </Box>
                    ))}
                  </Box>

                  {/* Bottom Text */}
                  <Box className="text-center text-gray-400 text-sm">
                    Ready to assist you with anything you need.
                  </Box>
                </Box>
              </Box>
              </Box>
            )}
          </Box>
        </>
      )}
    </>
  );
}
