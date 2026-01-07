'use client';

import '../styles/home.css';
import '../styles/mentions.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Dialog, IconButton, CircularProgress } from '@mui/material';
import { Mention, MentionsInput, SuggestionDataItem } from 'react-mentions';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileAttacher from '@/app/components/file-attacher';
import { userService } from '@/app/services/user.service';
import { conversationService } from '@/app/services/conversation.service';
import { dialogStyles } from '@/app/shared/utils';
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedDocument, setUploadedDocument] = useState<any>(null);
  const [messageAttachments, setMessageAttachments] = useState<Array<{ file_id: string; name: string }>>([]);
  const [clearAttachmentTrigger, setClearAttachmentTrigger] = useState(0);
  const [conversation, setConversation] = useState<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  // Handle conversation ID from URL parameter
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');

    console.log('[useEffect] URL conversation:', urlConversationId, 'showChat:', showChat, 'current conversation:', conversation?.id);

    if (urlConversationId && user) {
      console.log('Conversation ID from URL:', urlConversationId);

      // If we already have this conversation loaded, don't reload it
      if (conversation && conversation.id === urlConversationId) {
        console.log('Conversation already loaded, skipping reload');
        if (!showChat) {
          console.log('Setting showChat to true');
          setShowChat(true);
        }
        return;
      }

      // Find the conversation in user's conversations (always available in desktop app)
      const foundConversation = user.conversations?.find((c: any) => c.id === urlConversationId);

      if (foundConversation) {
        console.log('Loading conversation from user data:', foundConversation.title);
        setConversation(foundConversation);
        setShowChat(true);
      } else {
        console.warn('Invalid conversation ID in URL:', urlConversationId, 'Available conversations:', user.conversations?.map((c: any) => c.id));
        // Don't navigate away if we already have the conversation loaded
        if (!conversation || conversation.id !== urlConversationId) {
          navigate('/');
        }
      }
    }
    // Don't clear showChat when URL param is missing - it's managed explicitly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  // Clear chatMessage after it's been passed to Chat component
  useEffect(() => {
    if (chatMessage && showChat && conversation) {
      // Clear after a short delay to ensure Chat component has received it
      const timer = setTimeout(() => {
        console.log('Clearing chatMessage after initial send');
        setChatMessage(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [chatMessage, showChat, conversation]);

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

  const handleSendMessage = async () => {
    if (message.trim()) {
      // Remove @mention markup before sending the message
      // The markup format is: @[display](id)
      const cleanMessage = message.replace(/@\[([^\]]+)\]\([^)]+\)/g, '').trim();

      let activeConversationId = conversation?.id;

      // Generate title from first 5 words of message
      const words = cleanMessage.split(' ');
      const titleWords = words.slice(0, 5).join(' ');
      const conversationTitle = words.length > 5 ? `${titleWords}...` : titleWords;

      // Create or update conversation
      if (!activeConversationId) {
        // Create a new conversation
        try {
          const conversationResult = await conversationService.createConversation({
            title: conversationTitle,
            project_id: selectedProject?.id || undefined
          });

          if (conversationResult.success && conversationResult.data) {
            const newConversation = conversationResult.data;
            activeConversationId = newConversation.id;
            setConversation(newConversation);
            setShowChat(true); // Set showChat immediately to prevent navigation issues

            // Dispatch event for sidebar to refresh conversations
            window.dispatchEvent(new CustomEvent('conversationCreated', {
              detail: { conversationId: newConversation.id }
            }));

            // Refresh user data to get updated conversations
            const updatedUser = await userService.get();
            if (updatedUser) {
              setUser(updatedUser);
            }
          } else {
            console.error('Failed to create conversation');
            return;
          }
        } catch (error) {
          console.error('Failed to create conversation:', error);
          return;
        }
      }

      // File is already uploaded by FileAttacher, just navigate
      if (activeConversationId) {
        setChatMessage(cleanMessage);
        setMessage('');
        // Don't clear messageAttachments here - they need to be passed to Chat component
        // setMessageAttachments([]);
        setClearAttachmentTrigger(prev => prev + 1);

        // Navigate to conversation page
        navigate(`/?conversation=${activeConversationId}`);
      }
    }
  };

  const handleFileAttached = async (documentId: string, fileName: string) => {
    setMessageAttachments([{ file_id: `file-${documentId}`, name: fileName }]);
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
              sx: dialogStyles.paperWide
            }}
            BackdropProps={{
              sx: dialogStyles.backdrop
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
              sx: dialogStyles.paper
            }}
            BackdropProps={{
              sx: dialogStyles.backdrop
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
            }}
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
                onClick={() => {
                  setShowFileUploadDialog(false);
                  setUploadFiles([]);
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
              <Box className="mb-6">
                <label className="block text-gray-400 text-sm mb-3">
                  Select a document to analyze
                </label>
                <FileAttacher
                  conversation={conversation}
                  onSuccess={handleFileAttached}
                  onError={(error) => console.error('File upload error:', error)}
                  size="medium"
                  showDragDrop={true}
                  clearTrigger={clearAttachmentTrigger}
                />
              </Box>

              {/* Action Buttons */}
              <Box className="flex items-center gap-3 pt-2">
                <button
                    type="button"
                    onClick={() => {
                      setShowFileUploadDialog(false);
                      setUploadFiles([]);
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

          <Box className="min-h-screen bg-black text-white">
            {(() => {
              console.log('[Home Render] showChat:', showChat, 'conversation:', conversation?.id);
              return showChat && conversation;
            })() ? (
              // Chat View
              <Box className="h-screen flex flex-col bg-black">
                {/* Chat Header - matches project page style */}
                <Box className="flex-none px-4 py-4 md:py-6 border-b border-gray-900">
                  {/* MobileNav is now rendered in App.tsx for persistence across routes */}
                  {/* <MobileNav onMenuClick={() => setMobileMenuOpen(true)} /> */}
                  <Box className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        // Navigate to home without conversation parameter
                        navigate('/');

                        // Clear all states
                        setShowChat(false);
                        setChatMessage(null);
                        setMessage('');
                        setSelectedProject(null);
                        setConversation(null);
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
                    <div className="text-xl md:text-2xl font-bold text-white">
                      {conversation.title}
                    </div>
                  </Box>
                </Box>

                {/* Chat Component - full height */}
                <Box className="flex-1 overflow-hidden" style={{ height: 'calc(100vh - 89px)' }}>
                  <Chat
                    project={selectedProject}
                    initialMessage={chatMessage}
                    attachments={messageAttachments}
                    conversation={conversation}
                    onAttachmentsClear={() => {
                      setMessageAttachments([]);
                      setUploadedDocument(null);
                      setUploadFiles([]);
                      // Don't clear conversation - it should persist during chat session
                    }}
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



                  {/* Main Input Area */}
                  <Box
                    className="bg-gray-900/50 border rounded-2xl p-4 md:p-6 mb-6 relative transition-all border-gray-700 hover:border-pink-500/50"
                  >

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
                        <FileAttacher
                          conversation={conversation}
                          onSuccess={handleFileAttached}
                          onError={(error) => console.error('File upload error:', error)}
                          size="small"
                          showDragDrop={true}
                          clearTrigger={clearAttachmentTrigger}
                        />
                      </Box>

                      <button
                        disabled={message.trim().length <= 1}
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
