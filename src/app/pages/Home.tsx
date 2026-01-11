'use client';

import '../styles/home.css';
import '../styles/mentions.css';
import '../styles/markdown-editor.css';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Dialog, IconButton, CircularProgress, Tabs, Tab, Chip, Typography, TextField } from '@mui/material';
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import AddBoxIcon from '@mui/icons-material/AddBox';
import FileAttacher from '@/app/components/file-attacher';
import DocumentPolling from '@/app/components/document-polling';
import DocumentsTab from '@/app/components/documents-tab';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import { userService } from '@/app/services/user.service';
import { conversationService } from '@/app/services/conversation.service';
import { storageService } from '@/app/services/storage.service';
import { projectService } from '@/app/services/project.service';
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
  const [messageAttachments, setMessageAttachments] = useState<Array<{ file_id: string; name: string }>>([]);
  const [clearAttachmentTrigger, setClearAttachmentTrigger] = useState(0);
  const [conversation, setConversation] = useState<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState('');
  const [deleteProjectError, setDeleteProjectError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [projectConversations, setProjectConversations] = useState<any[]>([]);
  const [projectRules, setProjectRules] = useState('');
  const [projectMemory, setProjectMemory] = useState(true);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [currentProjectData, setCurrentProjectData] = useState<any>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRulesRef = useRef<string>('');
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editedProjectName, setEditedProjectName] = useState('');
  const previousMessageRef = useRef<string>(''); // Track previous message to detect mention removal
  const previousProjectIdRef = useRef<string | null>(null); // Track previous project ID to prevent unnecessary tab switches
  const previousConversationIdRef = useRef<string | null>(null); // Track previous conversation ID to detect actual conversation switches


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

  // Listen for conversation deletion events
  useEffect(() => {
    const handleConversationDeleted = async (event: any) => {
      const deletedConversationId = event.detail?.conversationId;

      // If the deleted conversation is currently open, select the previous conversation from the same project
      if (deletedConversationId && conversation?.id === deletedConversationId) {
        console.log('Currently opened conversation was deleted');

        // Get remaining conversations from storage
        const remaining = await storageService.getConversations();

        if (remaining && remaining.length > 0) {
          // Filter conversations by current project (or general if no project)
          const currentProjectId = selectedProject?.id;
          const projectConversations = remaining.filter((conv: any) => {
            if (currentProjectId) {
              // If we have a project selected, only show conversations from that project
              return conv.project_id === currentProjectId;
            } else {
              // If no project selected (general mode), only show conversations without project_id
              return !conv.project_id;
            }
          });

          if (projectConversations.length > 0) {
            // Sort by created_at descending and select the most recent from the same project
            const lastConversation = projectConversations.sort((a: any, b: any) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];

            console.log('Auto-selecting previous conversation from same project:', lastConversation.id);

            // Navigate to the previous conversation, keeping the same project
            if (currentProjectId) {
              navigate(`/?conversation=${lastConversation.id}&project=${currentProjectId}`);
            } else {
              navigate(`/?conversation=${lastConversation.id}&general=true`);
            }
          } else {
            // No conversations left in the current project, navigate to project/general home
            console.log('No conversations remaining in current project, navigating to project/general home');
            if (currentProjectId) {
              navigate(`/?project=${currentProjectId}`);
            } else {
              navigate('/?general=true');
            }
            setShowChat(false);
            setConversation(null);
            setChatMessage(null);
            setMessage('');
          }
        } else {
          // No conversations left at all, navigate to home
          console.log('No conversations remaining, navigating to home');
          if (selectedProject) {
            navigate(`/?project=${selectedProject.id}`);
          } else {
            navigate('/?general=true');
          }
          setShowChat(false);
          setConversation(null);
          setChatMessage(null);
          setMessage('');
        }
      }
    };

    window.addEventListener('conversationDeleted', handleConversationDeleted);

    return () => {
      window.removeEventListener('conversationDeleted', handleConversationDeleted);
    };
  }, [conversation, navigate, selectedProject]);


  // Handle conversation ID from URL parameter
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');

    console.log('[Home URL Effect] TRIGGERED:', {
      urlConversationId,
      currentConversationId: conversation?.id,
      previousConversationId: previousConversationIdRef.current,
      showChat,
      user: !!user
    });

    if (urlConversationId && user) {
      console.log('Conversation ID from URL:', urlConversationId);

      // Load the conversation from local storage
      const loadConversation = async () => {
        const result = await conversationService.getConversation(urlConversationId);

        if (result.success && result.data) {
          const foundConversation = result.data;

          // Check if we're actually switching to a different conversation or just updating the same one
          const isSwitchingConversation = previousConversationIdRef.current !== urlConversationId;

          console.log('[Home URL Effect] Loading conversation from storage:', {
            conversationId: foundConversation.id,
            conversationTitle: foundConversation.title,
            conversationProjectId: foundConversation.project_id,
            isSwitchingConversation: isSwitchingConversation,
            previousConversationId: previousConversationIdRef.current
          });

          // Always update conversation state with a NEW object reference to trigger Chat update
          // This ensures React detects the change even if the IDs are the same
          setConversation({ ...foundConversation });
          setShowChat(true);

          // Only switch to Chat tab if we're actually switching to a different conversation
          if (isSwitchingConversation) {
            setActiveTab(0); // Switch to Chat tab when switching conversations
          }

          // Update the ref to track this conversation
          previousConversationIdRef.current = urlConversationId;

          // Set the selected project based on the conversation's project_id
          if (foundConversation.project_id) {
            const project = user.projects?.find((p: any) => p.id === foundConversation.project_id);
            if (project) {
              console.log('[Home URL Effect] Setting selected project from conversation:', {
                projectId: project.id,
                projectName: project.title || project.name,
                conversationProjectId: foundConversation.project_id
              });
              setSelectedProject(project);
            } else {
              console.warn('[Home URL Effect] Project not found in user.projects for project_id:', foundConversation.project_id, 'Available projects:', user.projects?.map((p: any) => ({ id: p.id, name: p.title || p.name })));
              setSelectedProject(null);
            }
          } else {
            console.log('[Home URL Effect] Conversation has no project_id');
            setSelectedProject(null);
          }
        } else {
          console.warn('Invalid conversation ID in URL:', urlConversationId, 'Error:', result.error);
          // Don't navigate away if we already have the conversation loaded
          if (!conversation || conversation.id !== urlConversationId) {
            navigate('/');
          }
        }
      };

      loadConversation();
    } else if (!urlConversationId && user) {
      // No conversation in URL - always clear conversation state for welcome screen
      if (conversation) {
        setConversation(null);
      }
      if (showChat) {
        setShowChat(false);
      }
      if (chatMessage) {
        setChatMessage(null);
      }
      // Clear the conversation ref when no conversation in URL
      previousConversationIdRef.current = null;
    }
    // Don't clear showChat when URL param is missing - it's managed explicitly
    // Only run when searchParams changes, not when user data updates (e.g., document add/delete)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  // Handle project query param from URL
  useEffect(() => {
    if (user) {
      const projectId = searchParams.get('project');
      const urlConversationId = searchParams.get('conversation');
      const isGeneral = searchParams.get('general') === 'true' || (!projectId && !urlConversationId);

      // Always reset conversation when switching channels (project/general)
      const previousProjectId = previousProjectIdRef.current;

      if (projectId && projectId !== 'general') {
        const project = user.projects?.find((p: any) => p.id === projectId);
        if (project) {
          // Only reset state and switch tabs when actually switching to a different project
          // Don't switch tabs if it's the same project (just updating project data)
          if (previousProjectId !== project.id) {
            setSelectedProject(project);
            setActiveTab(0); // Reset to Chat tab only when switching projects
            setShowChat(false);
            setConversation(null);
            setChatMessage(null);
            setMessage('');
            setMessageAttachments([]);
            previousProjectIdRef.current = project.id;

            // If no conversation in URL, don't show chat - let user type first
          } else {
            // Same project, just update the project object (e.g., document updates)
            // Don't switch tabs - keep current tab
            setSelectedProject(project);
          }
        } else {
          setSelectedProject(null);
          previousProjectIdRef.current = null;
        }
      } else if (isGeneral) {
        // General channel - reset state when switching from project
        // Only switch tabs if actually switching from a project to general
        if (previousProjectId !== 'general' && previousProjectId !== null) {
          setSelectedProject(null);
          setActiveTab(0); // Reset to Chat tab only when switching to general
          setShowChat(false);
          setConversation(null);
          setChatMessage(null);
          setMessage('');
          setMessageAttachments([]);
          previousProjectIdRef.current = 'general';

          // If no conversation in URL, don't auto-select or show chat - let user choose from list or type
        } else if (previousProjectId === null) {
          // First time loading general, don't switch tabs
          setSelectedProject(null);
          previousProjectIdRef.current = 'general';
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load project data when selected
  useEffect(() => {
    if (selectedProject && user) {
      const project = user.projects?.find((p: any) => p.id === selectedProject.id);
      if (project) {
        setCurrentProjectData(project);
        setProjectRules(project.config?.rules || '');
        setProjectMemory(project.config?.memory !== undefined ? project.config.memory : true);
        lastSavedRulesRef.current = project.config?.rules || '';
      }
    } else {
      setCurrentProjectData(null);
      setProjectRules('');
      setProjectMemory(true);
    }
  }, [selectedProject, user]);

  // Filter conversations by selected project - show when project is selected (even without active conversation)
  useEffect(() => {
    const loadConversations = async () => {
      const allConversations = await storageService.getConversations();

      if (!selectedProject) {
        // Show only conversations for #general (project_id is null or undefined)
        const generalConversations = (allConversations || []).filter(
          (conv: any) => !conv.project_id || conv.project_id === null || conv.project_id === undefined
        );
        setProjectConversations(generalConversations);
      } else {
        // Filter by project - check both project_id and also handle null/undefined
        const filtered = (allConversations || []).filter(
          (conv: any) => {
            // Match if project_id exactly matches selected project
            return conv.project_id === selectedProject.id;
          }
        );
        console.log('[Home] Filtered conversations for project:', {
          projectId: selectedProject.id,
          projectName: selectedProject.title || selectedProject.name,
          totalConversations: allConversations?.length || 0,
          filteredCount: filtered.length,
          allConversations: allConversations?.map((c: any) => ({ id: c.id, project_id: c.project_id, title: c.title }))
        });
        setProjectConversations(filtered);
      }
    };

    loadConversations();

    // Listen for conversation updates
    const handleConversationUpdate = () => {
      loadConversations();
    };

    window.addEventListener('conversationCreated', handleConversationUpdate);
    window.addEventListener('conversationUpdated', handleConversationUpdate);
    window.addEventListener('conversationDeleted', handleConversationUpdate);

    return () => {
      window.removeEventListener('conversationCreated', handleConversationUpdate);
      window.removeEventListener('conversationUpdated', handleConversationUpdate);
      window.removeEventListener('conversationDeleted', handleConversationUpdate);
    };
  }, [selectedProject]);

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

    // Show all projects when search is empty (just typed /)
    // Otherwise filter by search term
    const searchTerm = search.toLowerCase().trim();

    const filteredProjects = user.projects.filter((project: any) => {
      const projectName = (project.title || project.name || '').toLowerCase();
      // If no search term, show all projects
      if (!searchTerm) return true;
      // Otherwise filter by search term
      return projectName.includes(searchTerm);
    });

    const suggestions: SuggestionDataItem[] = filteredProjects.map((project: any) => ({
      id: project.id,
      display: project.title || project.name || 'Untitled Project',
    }));

    callback(suggestions);
  };

  // Render mention suggestions
  const renderProjectSuggestion = (_suggestion: SuggestionDataItem, _search: string, highlightedDisplay: React.ReactNode) => {
    return (
      <div className="mention-project-item">
        <FolderOpenIcon className="mention-project-icon" />
        <div className="mention-project-name">{highlightedDisplay}</div>
      </div>
    );
  };

  // Handle mention changes
  // SimpleMDE editor options
  const editorOptions = useMemo(() => {
    return {
      spellChecker: false,
      placeholder: "Add project-specific rules and guidelines that will be included with every message...",
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

  const autoSaveProjectRules = async (rules: string) => {
    if (!selectedProject || !rules) return;

    // Skip if the value hasn't changed from last save
    if (rules === lastSavedRulesRef.current) {
      return;
    }

    setIsSavingRules(true);

    const url = `${API_ENDPOINT}/projects/${selectedProject.id}/config`;
    const payload = {
      rules: rules,
      memory: projectMemory
    };

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userService.token()}`
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 200) {
        lastSavedRulesRef.current = rules;
        // Refresh user data
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
        }
      }
    } catch (ex: any) {
      console.error('Error saving project rules:', ex);
    } finally {
      setIsSavingRules(false);
    }
  };

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

    // Check if current and previous messages contain mention markup: /[display](id)
    const hasMentionMarkup = /\/\[([^\]]+)\]\([^)]+\)/.test(newValue);
    const previousHadMentionMarkup = /\/\[([^\]]+)\]\([^)]+\)/.test(previousMessageRef.current);

    // Simple logic:
    // 1. If mentions exist → set project (typing /project adds the project)
    if (projectMentions.length > 0) {
      const project = projectMentions[projectMentions.length - 1];
      console.log('[handleMentionChange] Project selected via mention:', project.title || project.name, project.id);
      setSelectedProject(project);
    }
    // 2. If no mentions but previous message had mention markup → clear project (explicit removal)
    else if (previousHadMentionMarkup && !hasMentionMarkup) {
      console.log('[handleMentionChange] Project removed - mention markup was explicitly deleted');
      setSelectedProject(null);
    }
    // 3. Otherwise → keep current project (user is just typing normally)

    // Update previous message ref for next comparison
    previousMessageRef.current = newValue;
  };

  const handleSendMessage = async () => {
    if (message.trim()) {
      // Remove /command markup before sending the message
      // The markup format is: /[display](id)
      const cleanMessage = message.replace(/\/\[([^\]]+)\]\([^)]+\)/g, '').trim();

      let activeConversationId = conversation?.id;

      // Generate title from first 5 words of message
      const words = cleanMessage.split(' ');
      const titleWords = words.slice(0, 5).join(' ');
      const conversationTitle = words.length > 5 ? `${titleWords}...` : titleWords;

      // Prepare attachments array
      const attachmentsToSend = [...messageAttachments];

      // Create or update conversation
      if (!activeConversationId) {
        // Only add project as attachment when creating a new conversation (first message)
        // Once conversation exists, backend uses memory and project_id, so no need to send attachment again
        if (selectedProject?.id) {
          console.log('[handleSendMessage] Adding project as attachment (first message only):', {
            projectId: selectedProject.id,
            projectName: selectedProject.title || selectedProject.name,
            file_id: `project-${selectedProject.id}`
          });
          attachmentsToSend.push({
            file_id: `project-${selectedProject.id}`,
            name: selectedProject.title || selectedProject.name || 'Project'
          });
        }
        console.log('[handleSendMessage] Final attachments to send (new conversation):', attachmentsToSend);
        // Create a new conversation with the selected project
        try {
          // Ensure project_id is set if project is selected (not general)
          const projectId = selectedProject?.id ? selectedProject.id : undefined;
          const conversationResult = await conversationService.createConversation({
            title: conversationTitle,
            project_id: projectId
          });

          if (conversationResult.success && conversationResult.data) {
            const newConversation = conversationResult.data;
            activeConversationId = newConversation.id;

            // Set all state updates together before navigation to avoid race conditions
            setConversation(newConversation);
            setShowChat(true); // Set showChat immediately after creating conversation
            setMessageAttachments(attachmentsToSend);
            setChatMessage(cleanMessage);
            setMessage('');
            setClearAttachmentTrigger(prev => prev + 1);

            // Note: conversationCreated event is already dispatched by conversationService.createConversation()

            // Navigate to conversation page with project if selected
            // Use replace: true to avoid adding to history and ensure URL is updated immediately
            if (projectId) {
              navigate(`/?conversation=${activeConversationId}&project=${projectId}`, { replace: true });
            } else {
              navigate(`/?conversation=${activeConversationId}&general=true`, { replace: true });
            }
          } else {
            console.error('Failed to create conversation');
            return;
          }
        } catch (error) {
          console.error('Failed to create conversation:', error);
          return;
        }
      } else {
        // Existing conversation - filter out project attachments (backend uses memory and project_id)
        const attachmentsWithoutProject = attachmentsToSend.filter(
          (att: any) => !att.file_id || !att.file_id.startsWith('project-')
        );
        console.log('[handleSendMessage] Existing conversation - filtered attachments (no project):', attachmentsWithoutProject);
        setMessageAttachments(attachmentsWithoutProject);
        setChatMessage(cleanMessage);
        setMessage('');
        setClearAttachmentTrigger(prev => prev + 1);
      }
    }
  };

  const handleFileAttached = async (documentId: string, fileName: string) => {
    console.log('[Home handleFileAttached] Called with:', documentId, fileName);
    const newAttachments = [{ file_id: `file-${documentId}`, name: fileName }];
    console.log('[Home handleFileAttached] Setting messageAttachments to:', newAttachments);
    setMessageAttachments(newAttachments);
  };

  const handleDeleteConversation = async () => {
    if (!conversation) return;

    setIsDeleting(true);

    try {
      const result = await conversationService.deleteConversation(conversation.id);

      if (result.success) {
        // Note: conversationDeleted event is already dispatched by conversationService.deleteConversation()
        // and the sidebar will automatically refresh from local storage
        // The handleConversationDeleted event handler will handle navigation to the previous conversation

        // Close dialog
        setShowDeleteDialog(false);

        // Don't navigate here - let the handleConversationDeleted event handler do it
        // This ensures we select the previous conversation from the same project
      } else {
        console.error('Failed to delete conversation:', result.error);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteConversationFromList = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation(); // Prevent navigation when clicking delete

    try {
      const result = await conversationService.deleteConversation(convId);

      if (result.success) {
        // Update local list
        setProjectConversations(prev => prev.filter((c: any) => c.id !== convId));

        // Note: conversationDeleted event is already dispatched by conversationService.deleteConversation()
        // If the deleted conversation was the current one, the handleConversationDeleted event handler
        // will handle navigation to the previous conversation from the same project
      } else {
        console.error('Failed to delete conversation:', result.error);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const handleRenameProject = async () => {
    if (!selectedProject || !editedProjectName.trim()) {
      setIsEditingProjectName(false);
      return;
    }

    const newName = editedProjectName.trim();
    if (newName === (selectedProject.title || selectedProject.name)) {
      setIsEditingProjectName(false);
      return;
    }

    try {
      const result = await projectService.updateProject(selectedProject.id, { title: newName });

      if (result.success) {
        // Update local state
        setSelectedProject({ ...selectedProject, title: newName, name: newName });

        // Refresh user data to sync with sidebar
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
          window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        }
      } else {
        console.error('Failed to rename project:', result.error);
      }
    } catch (error) {
      console.error('Error renaming project:', error);
    }

    setIsEditingProjectName(false);
  };

  const handleStartNewConversation = () => {
    // Clear current conversation to start fresh
    setConversation(null);
    setChatMessage(null);
    setMessage('');

    // Update URL to remove conversation param but keep project/general context
    if (selectedProject) {
      navigate(`/?project=${selectedProject.id}`);
    } else {
      navigate(`/?general=true`);
    }
  };

  const handleConversationCreated = (newConversation: any) => {
    console.log('[Home] Conversation created:', newConversation);

    // Determine project ID from conversation or selected project
    const projectId = newConversation.project_id || selectedProject?.id;

    // Navigate to the new conversation URL FIRST to ensure it's selected
    // This prevents tab switching from changing the conversation
    // The URL change will trigger the useEffect that loads the conversation
    if (projectId) {
      navigate(`/?conversation=${newConversation.id}&project=${projectId}`, { replace: true });
    } else {
      navigate(`/?conversation=${newConversation.id}&general=true`, { replace: true });
    }

    // Also set state immediately to avoid any race conditions
    setConversation(newConversation);
    setShowChat(true);
    setActiveTab(0); // Switch to Chat tab
  };

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProject) return;

    if (deleteProjectConfirm.toLowerCase() !== 'delete') {
      setDeleteProjectError('Please type "delete" to confirm');
      return;
    }

    setIsDeletingProject(true);
    setDeleteProjectError('');

    try {
      // Delete all conversations for this project first
      const allConversations = await storageService.getConversations();
      const projectConversations = (allConversations || []).filter(
        (conv: any) => conv.project_id === selectedProject.id
      );

      // Delete each conversation
      for (const conv of projectConversations) {
        try {
          await conversationService.deleteConversation(conv.id);
        } catch (error) {
          console.error(`Error deleting conversation ${conv.id}:`, error);
        }
      }

      // Delete the project using project service (this also cleans up local storage)
      const result = await projectService.deleteProject(selectedProject.id, user?.email);

      if (result.success) {
        // Refresh user data
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
        }

        // Dispatch projectDeleted event to update sidebar
        window.dispatchEvent(new CustomEvent('projectDeleted', {
          detail: { projectId: selectedProject.id }
        }));

        // Close dialog
        setShowDeleteProjectDialog(false);
        setDeleteProjectConfirm('');

        // Navigate to home and reset all state
        navigate('/');
        setShowChat(false);
        setConversation(null);
        setChatMessage(null);
        setMessage('');
        setSelectedProject(null);
        setMessageAttachments([]);
        setUploadFiles([]);
      } else {
        setDeleteProjectError(result.error || 'Failed to delete project. Please try again.');
      }
    } catch (error: any) {
      console.error('Error deleting project:', error);
      setDeleteProjectError(error.message || 'An error occurred while deleting the project.');
    } finally {
      setIsDeletingProject(false);
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
      <DocumentPolling
        user={user}
        setUser={setUser}
        selectedProject={selectedProject}
        setCurrentProjectData={setCurrentProjectData}
        setSelectedProject={setSelectedProject}
      />
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

                        // Get the uploaded document from response
                        const uploadedDocument = await response.json();

                        // Update user state incrementally - only update the specific project
                        if (user && selectedProject) {
                          const updatedProjects = user.projects.map((p: any) => {
                            if (p.id === selectedProject.id) {
                              const updatedDocs = [...(p.documents || []), uploadedDocument];
                              return { ...p, documents: updatedDocs };
                            }
                            return p;
                          });

                          const updatedUser = { ...user, projects: updatedProjects };
                          setUser(updatedUser);

                          // Update current project data
                          const updatedProject = updatedProjects.find((p: any) => p.id === selectedProject.id);
                          if (updatedProject) {
                            setCurrentProjectData(updatedProject);
                            setSelectedProject(updatedProject);
                          }
                        }

                        // Dispatch event for other components
                        window.dispatchEvent(new CustomEvent('documentUploaded', {
                          detail: { projectId: selectedProject.id }
                        }));

                        setShowFileUploadDialog(false);
                        setUploadFiles([]);

                        // Stay on Documents tab
                        setActiveTab(1);
                      } catch (error: any) {
                        console.error('Upload error:', error.message || 'Failed to upload document');
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

          {/* Delete Conversation Confirmation Dialog */}
          <Dialog
            open={showDeleteDialog}
            onClose={() => !isDeleting && setShowDeleteDialog(false)}
            maxWidth="xs"
            fullWidth
            PaperProps={{
              sx: dialogStyles.paper
            }}
            BackdropProps={{
              sx: dialogStyles.backdrop
            }}
          >
            <Box className="p-6">
              <h3 className="text-white font-semibold text-lg mb-3">
                Delete Conversation?
              </h3>
              <p className="text-gray-400 text-sm mb-6">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
              <Box className="flex items-center gap-3">
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConversation}
                  disabled={isDeleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <CircularProgress size={18} sx={{ color: 'white' }} />
                  ) : (
                    <>
                      <DeleteOutlineIcon fontSize="small" />
                      Delete
                    </>
                  )}
                </button>
              </Box>
            </Box>
          </Dialog>

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
            <Box className="p-6">
              <Box className="flex items-center justify-between mb-4">
                <h3 className="text-white text-xl font-semibold">Delete Project</h3>
                <IconButton
                  onClick={() => !isDeletingProject && setShowDeleteProjectDialog(false)}
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

              <form onSubmit={handleDeleteProject}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                    <DeleteOutlineIcon sx={{ color: '#ef4444', fontSize: 24, mt: 0.5 }} />
                    <Box>
                      <Typography className="text-red-400 font-medium mb-1">
                        Warning: This action cannot be undone
                      </Typography>
                      <Typography className="text-gray-300 text-sm">
                        Deleting "{selectedProject?.title || selectedProject?.name || 'this project'}" will permanently remove all documents, conversations, and associated data.
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
                      value={deleteProjectConfirm}
                      onChange={(e) => {
                        setDeleteProjectConfirm(e.target.value);
                        setDeleteProjectError('');
                      }}
                      placeholder="Type 'delete' to confirm"
                      disabled={isDeletingProject}
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
                    {deleteProjectError && (
                      <Typography className="text-red-400 text-sm mt-2">
                        {deleteProjectError}
                      </Typography>
                    )}
                  </Box>

                  <Box className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteProjectDialog(false)}
                      disabled={isDeletingProject}
                      className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg border border-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDeletingProject || deleteProjectConfirm.toLowerCase() !== 'delete'}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeletingProject ? (
                        <CircularProgress size={18} sx={{ color: 'white' }} />
                      ) : (
                        <>
                          <DeleteOutlineIcon fontSize="small" />
                          Delete Project
                        </>
                      )}
                    </button>
                  </Box>
                </Box>
              </form>
            </Box>
          </Dialog>


          <Box className="min-h-screen bg-black text-white">
            {(() => {
              // Show chat detail view when: showChat is true, we have a conversation, or project selected from sidebar (URL param)
              const urlConversationId = searchParams.get('conversation');
              const urlProjectId = searchParams.get('project');
              return showChat || conversation || urlConversationId || urlProjectId;
            })() ? (
              // Chat View with 2-column layout
              <Box className="h-screen flex flex-col bg-black">
                {/* Chat Header - matches project page style */}
                <Box className="flex-none px-4 md:px-8 lg:px-12 py-4 md:py-6 border-b border-gray-900">
                  <Box className="flex items-center justify-between gap-4">
                    <Box className="flex items-center gap-4 flex-1 min-w-0">
                      <button
                        onClick={() => {
                          navigate('/');
                          setShowChat(false);
                          setChatMessage(null);
                          setMessage('');
                          setConversation(null);
                          setMessageAttachments([]);
                          setUploadFiles([]);
                          setClearAttachmentTrigger(prev => prev + 1);
                        }}
                        className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                        title="Back to home"
                      >
                        <ArrowBackIosIcon fontSize="small" />
                      </button>
                      <Box className="flex-1 min-w-0">
                        {isEditingProjectName && selectedProject ? (
                          <TextField
                            autoFocus
                            value={editedProjectName}
                            onChange={(e) => setEditedProjectName(e.target.value)}
                            onBlur={handleRenameProject}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameProject();
                              } else if (e.key === 'Escape') {
                                setIsEditingProjectName(false);
                              }
                            }}
                            size="small"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                color: 'white',
                                fontSize: '1.25rem',
                                fontWeight: 'bold',
                                bgcolor: 'transparent',
                                '& fieldset': {
                                  borderColor: '#ec4899',
                                },
                                '&:hover fieldset': {
                                  borderColor: '#ec4899',
                                },
                                '&.Mui-focused fieldset': {
                                  borderColor: '#ec4899',
                                },
                              },
                            }}
                          />
                        ) : (
                          <div
                            className={`text-xl md:text-2xl font-bold text-white truncate ${selectedProject ? 'cursor-pointer hover:text-pink-400 transition-colors' : ''}`}
                            onClick={() => {
                              if (selectedProject) {
                                setEditedProjectName(selectedProject.title || selectedProject.name || '');
                                setIsEditingProjectName(true);
                              }
                            }}
                            title={selectedProject ? 'Click to rename' : undefined}
                          >
                            {(() => {
                              if (selectedProject) {
                                return selectedProject.title || selectedProject.name;
                              }
                              // Check URL param for project to handle race condition
                              const urlProjectId = searchParams.get('project');
                              if (urlProjectId && user) {
                                const project = user.projects?.find((p: any) => p.id === urlProjectId);
                                if (project) {
                                  return project.title || project.name;
                                }
                              }
                              return 'General';
                            })()}
                          </div>
                        )}
                      </Box>
                    </Box>
                    <Box className="flex items-center gap-2">
                      {/* Single Delete Button - deletes project and all conversations when project is selected */}
                      {selectedProject && (
                        <IconButton
                          onClick={() => {
                            setDeleteProjectConfirm('');
                            setDeleteProjectError('');
                            setShowDeleteProjectDialog(true);
                          }}
                          sx={{
                            color: '#9ca3af',
                            '&:hover': {
                              color: '#ef4444',
                              bgcolor: 'rgba(239, 68, 68, 0.1)',
                            },
                          }}
                          title="Delete project and all conversations"
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Tabs - only show when project is selected */}
                {(selectedProject || searchParams.get('project')) && (
                  <Box className="flex-none border-b border-gray-900 px-4">
                    <Tabs
                      value={activeTab}
                      onChange={(_, newValue) => setActiveTab(newValue)}
                      sx={{
                        '& .MuiTab-root': {
                          color: 'rgba(255, 255, 255, 0.6)',
                          textTransform: 'none',
                          fontSize: '14px',
                          fontWeight: 500,
                          minHeight: '48px',
                          '&.Mui-selected': {
                            color: '#ec4899',
                          },
                        },
                        '& .MuiTabs-indicator': {
                          backgroundColor: '#ec4899',
                        },
                      }}
                    >
                      <Tab label="Chat" />
                      <Tab label="Documents" />
                      <Tab label="Configuration" />
                    </Tabs>
                  </Box>
                )}

                {/* Main Content Area - 2 columns */}
                <Box className="flex-1 overflow-hidden flex" style={{ height: selectedProject ? 'calc(100vh - 137px)' : 'calc(100vh - 89px)' }}>
                  {/* Left Column - Chat/Documents/Settings */}
                  <Box className="flex-1 overflow-hidden" sx={{ width: { xs: '100%', md: selectedProject ? '70%' : '100%' } }}>
                    {!selectedProject || activeTab === 0 ? (
                      <Chat
                        project={selectedProject}
                        initialMessage={chatMessage}
                        attachments={messageAttachments}
                        conversation={conversation}
                        isGeneral={!selectedProject && (searchParams.get('general') === 'true' || !searchParams.get('project'))}
                        onFileAttached={handleFileAttached}
                        onAttachmentsClear={() => {
                          setMessageAttachments([]);
                          setUploadFiles([]);
                        }}
                        onTokenUpdate={() => {
                          window.dispatchEvent(new Event('refreshUserTokens'));
                        }}
                        onConversationCreated={handleConversationCreated}
                      />
                    ) : activeTab === 1 ? (
                      <DocumentsTab
                        user={user}
                        setUser={setUser}
                        selectedProject={selectedProject}
                        setSelectedProject={setSelectedProject}
                        currentProjectData={currentProjectData}
                        setCurrentProjectData={setCurrentProjectData}
                        setActiveTab={setActiveTab}
                      />
                    ) : (
                      <Box className="px-4 md:px-8 lg:px-12 py-4 h-full overflow-auto">
                        {/* Configuration Tab */}
                        <Box className="max-w-4xl mx-auto">
                          {currentProjectData && (
                            <Box className="space-y-6">
                              <div className="space-y-3">
                                <Box className="flex items-center justify-between mb-2 py-2">
                                  <Box className="flex flex-col">
                                      <h4 className="text-sm text-gray-400">Project Rules:</h4>
                                  </Box>
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
                                          bgcolor: 'rgba(0, 0, 0, 0.7)',
                                          borderRadius: '50%',
                                          padding: '4px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <CircularProgress size={16} sx={{ color: '#ec4899' }} />
                                      </Box>
                                    )}
                                    <Box className="markdown-editor-container">
                                      <SimpleMDE
                                        value={projectRules}
                                        onChange={(value: any) => {
                                          setProjectRules(value);
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
                                <p className="text-gray-400 text-xs">* Project rules will be automatically saved and included with every message sent to the AI. Use this to define guidelines, constraints, or context that should always be considered.</p>
                              </div>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    )}
                  </Box>

                  {/* Right Column - Conversations (show when project or general is selected) */}
                  {(selectedProject || searchParams.get('general') === 'true') && (
                    <Box
                      className="border-l border-gray-900 overflow-y-auto"
                      sx={{
                        width: { xs: '0', md: '30%' },
                        display: { xs: 'none', md: 'block' }
                      }}
                    >
                      <Box className="p-4">
                        <Box className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-white">
                            Conversations
                          </span>
                          <IconButton
                            onClick={handleStartNewConversation}
                            size="small"
                            sx={{
                              color: '#9ca3af',
                              padding: '4px',
                              '&:hover': {
                                color: '#ec4899',
                                bgcolor: 'rgba(236, 72, 153, 0.1)',
                              },
                            }}
                            title="New conversation"
                          >
                            <AddBoxIcon fontSize="small" />
                          </IconButton>
                        </Box>
                        {projectConversations.length > 0 ? (
                          <Box className="space-y-1">
                            {projectConversations.map((conv: any) => {
                              const isActive = conversation && conversation.id === conv.id;

                              return (
                                <Box
                                  key={conv.id}
                                  onClick={() => {
                                    console.log('[Home Sidebar] Clicked conversation:', {
                                      convId: conv.id,
                                      convTitle: conv.title,
                                      currentConversationId: conversation?.id,
                                      selectedProject: selectedProject?.id
                                    });

                                    const newUrl = selectedProject
                                      ? `/?conversation=${conv.id}&project=${selectedProject.id}`
                                      : `/?conversation=${conv.id}&general=true`;

                                    console.log('[Home Sidebar] Navigating to:', newUrl);
                                    navigate(newUrl);
                                  }}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderRadius: '6px',
                                    bgcolor: isActive ? 'rgba(236, 72, 153, 0.12)' : 'transparent',
                                    color: isActive ? '#ec4899' : 'rgba(255, 255, 255, 0.6)',
                                    '&:hover': {
                                      bgcolor: 'rgba(255, 255, 255, 0.06)',
                                      color: 'white',
                                    },
                                    '&:hover .delete-btn': {
                                      opacity: 1,
                                    },
                                    mb: 0.5,
                                  }}
                                >
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <div className="text-sm font-medium truncate">{conv.title || 'Untitled'}</div>
                                    {conv.updated_at && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {new Date(conv.updated_at).toLocaleDateString()}
                                      </div>
                                    )}
                                  </Box>
                                  <Box
                                    className="delete-btn"
                                    onClick={(e) => handleDeleteConversationFromList(e, conv.id)}
                                    sx={{
                                      opacity: 0,
                                      padding: '4px',
                                      borderRadius: '4px',
                                      color: 'rgba(255, 255, 255, 0.4)',
                                      transition: 'all 0.15s ease',
                                      '&:hover': {
                                        color: '#ef4444',
                                        bgcolor: 'rgba(239, 68, 68, 0.1)',
                                      },
                                    }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                        ) : (
                          <Box className="text-gray-500 text-sm py-4 text-center">
                            No conversations yet
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              // Welcome Screen
              <Box className="h-screen flex flex-col bg-black">
                <Box className="flex-1 overflow-hidden flex">
                  {/* Welcome/Input Area */}
                  <Box className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 py-4" sx={{ width: '100%' }}>
                    <Box className="flex items-center justify-center mt-12 md:mt-20">
                      <Box className="max-w-4xl w-full">
                      {/* Greeting */}
                      <Box className="mb-8">
                        <Box className="hidden md:flex items-center mb-4">
                              <Box className="w-12 h-12 flex">
                                <svg width="48" height="48" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <g clip-path="url(#clip0_1_62)">
                                    <path d="M23 66.9683C23 84.0784 36.9216 98 54.0317 98L83.124 98C84.1946 98 85.0635 97.1311 85.0635 96.0605L85.0635 66.9683C85.0635 49.8581 71.1419 35.9365 54.0317 35.9365C36.9216 35.9365 23 49.8581 23 66.9683Z" fill="white" />
                                    <circle cx="85.4286" cy="47.254" r="18.254" fill="#FF3478" />
                                  </g>
                                  <defs>
                                    <clipPath id="clip0_1_62">
                                      <rect width="128" height="128" fill="white" />
                                    </clipPath>
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
                          placeholder="Type your message or /project to select a project"
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
                            trigger="/"
                            data={fetchProjects}
                            renderSuggestion={renderProjectSuggestion}
                            displayTransform={(_id: string, _display: string) => ''}
                            markup="/[__display__](__id__)"
                            isLoading={false}
                            onAdd={(id: string | number) => {
                              // Handle project selection when user explicitly selects from dropdown
                              const project = user?.projects?.find((p: any) => p.id === id);
                              if (project) {
                                setSelectedProject(project);
                                // Clear the /command from message after selection
                                setMessage('');
                                // Reset previous message ref so typing doesn't trigger mention removal logic
                                previousMessageRef.current = '';
                              }
                            }}
                            style={{
                              backgroundColor: 'transparent',
                            }}
                          />
                        </MentionsInput>

                        <Box className="flex items-center justify-between mt-4">
                          {/* Left side - File attachment and project label */}
                          <Box className="flex items-center gap-2">
                            <FileAttacher
                              conversation={conversation}
                              onSuccess={handleFileAttached}
                              onError={(error) => console.error('File upload error:', error)}
                              size="small"
                              showDragDrop={true}
                              clearTrigger={clearAttachmentTrigger}
                            />
                            {/* Selected project label */}
                            {selectedProject && (
                              <Chip
                                icon={<FolderOpenIcon sx={{ fontSize: 14 }} />}
                                label={selectedProject.title || selectedProject.name}
                                size="small"
                                onDelete={() => {
                                  setSelectedProject(null);
                                  previousMessageRef.current = ''; // Reset previous message tracking
                                  navigate('/');
                                }}
                                sx={{
                                  height: '28px',
                                  borderRadius: '1px',
                                  bgcolor: 'rgba(236, 72, 153, 0.1)',
                                  color: '#ec4899',
                                  border: '1px solid rgba(236, 72, 153, 0.3)',
                                  fontSize: '12px',
                                  '& .MuiChip-icon': {
                                    color: '#ec4899',
                                  },
                                  '& .MuiChip-deleteIcon': {
                                    color: 'rgba(236, 72, 153, 0.6)',
                                    fontSize: '14px',
                                    '&:hover': {
                                      color: '#ec4899',
                                    },
                                  },
                                }}
                              />
                            )}
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
                            💡 Tip: Type <span className="text-pink-400 font-mono bg-gray-800 px-1 rounded">/</span> to select a project. Use ↑↓ to navigate, Enter to confirm.
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
                </Box>
              </Box>
            )}
          </Box>
        </>
      )}
    </>
  );
}
