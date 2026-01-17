'use client';

import '../styles/home.css';
import '../styles/mentions.css';
import '../styles/markdown-editor.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Dialog, IconButton, CircularProgress, Chip, Typography, TextField } from '@mui/material';
import { Mention, MentionsInput, SuggestionDataItem } from 'react-mentions';
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileAttacher from '@/app/components/file-attacher';
import DocumentPolling from '@/app/components/document-polling';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
import DocumentsTab from '@/app/components/documents-tab';
import RightSidebar from '@/app/components/right-sidebar';
import 'easymde/dist/easymde.min.css';
import { userService } from '@/app/services/user.service';
import { conversationService } from '@/app/services/conversation.service';
import { projectService } from '@/app/services/project.service';
import { dialogStyles } from '@/app/shared/utils';
import { API_ENDPOINT, DEFAULT_COLOR } from '@/app/constants';
import Chat from '@/app/components/chat';
import LoadingSpinner from '@/app/components/loading-spinner';
import ConversationTabs from '@/app/components/conversation-tabs';
import { useAuthContext } from '@/app/contexts/AuthContext';

// Extend SuggestionDataItem to include color property
interface ProjectSuggestion extends SuggestionDataItem {
  color?: string;
}

export default function Home() {
  const [user, setUser] = useAuthContext();
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedProject, setSelectedProject]: any = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showProjectInfoDialog, setShowProjectInfoDialog] = useState(false);
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
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
  const previousUrlParamsRef = useRef<string>(''); // Track previous URL params to avoid unnecessary tab changes
  const [showDeleteDocDialog, setShowDeleteDocDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<any>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState('');
  const [deleteDocError, setDeleteDocError] = useState('');
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);


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
        // Ensure conversations is always an array, never null or undefined
        const remaining = (user?.conversations && Array.isArray(user.conversations)) ? user.conversations : [];

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

  // Listen for delete project dialog event from sidebar
  useEffect(() => {
    const handleOpenDeleteProjectDialog = (event: any) => {
      const projectId = event.detail?.projectId;
      if (projectId && selectedProject?.id === projectId) {
        setDeleteProjectConfirm('');
        setDeleteProjectError('');
        setShowDeleteProjectDialog(true);
      }
    };

    window.addEventListener('openDeleteProjectDialog', handleOpenDeleteProjectDialog);
    return () => {
      window.removeEventListener('openDeleteProjectDialog', handleOpenDeleteProjectDialog);
    };
  }, [selectedProject]);

  // Listen for conversation creation events to update tab bar
  useEffect(() => {
    const handleConversationCreatedEvent = async (event: any) => {
      const newConversation = event.detail?.conversation;

      if (newConversation) {
        console.log('[Home] Conversation created event received:', newConversation);

        // Update project conversations list immediately
        const projectId = selectedProject?.id;
        const convProjectId = newConversation.project_id;

        // Add to list if it belongs to current context (project or general)
        if ((projectId && convProjectId === projectId) || (!projectId && !convProjectId)) {
          setProjectConversations(prev => {
            // Check if conversation already exists in list
            if (prev.some((c: any) => c.id === newConversation.id)) {
              return prev;
            }
            // Add new conversation to the beginning
            return [newConversation, ...prev];
          });
        }
      }
    };

    window.addEventListener('conversationCreated', handleConversationCreatedEvent);

    return () => {
      window.removeEventListener('conversationCreated', handleConversationCreatedEvent);
    };
  }, [selectedProject]);


  // Handle conversation ID from URL parameter - simple lookup from user.conversations
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');
    const urlProjectId = searchParams.get('project');
    const isGeneral = searchParams.get('general') === 'true';

    // Create a string representation of current URL params to detect actual URL changes
    const currentUrlParams = `${urlConversationId || ''}-${urlProjectId || ''}-${isGeneral}`;
    const urlParamsChanged = previousUrlParamsRef.current !== currentUrlParams;
    previousUrlParamsRef.current = currentUrlParams;

    if (!user) return;

    if (urlConversationId) {
      // Find conversation in user.conversations (source of truth)
      // Ensure conversations is always an array before using find
      const conversations = (user.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
      const foundConversation = conversations.find((c: any) => c.id === urlConversationId);

      if (foundConversation) {
        // Only update conversation if it's different from current or URL changed
        if (!conversation || conversation.id !== foundConversation.id) {
          console.log('[Home] Loading conversation:', foundConversation.id, 'messages:', foundConversation.messages?.length || 0);
          setConversation({ ...foundConversation });
          setShowChat(true);
          // Only change tab if URL actually changed
          if (urlParamsChanged) {
            setActiveTab(0);
          }
        }

        // Set project based on conversation's project_id - conversation is the source of truth
        if (foundConversation.project_id) {
          const project = user.projects?.find((p: any) => p.id === foundConversation.project_id);
          // Always update if project changed or doesn't match
          if (!selectedProject || selectedProject.id !== foundConversation.project_id) {
            console.log('[Home] Setting project from conversation:', foundConversation.project_id);
            setSelectedProject(project || null);
          }
        } else {
          // Conversation has no project - it's a general conversation
          if (selectedProject !== null) {
            console.log('[Home] Clearing project for general conversation');
            setSelectedProject(null);
          }
        }
      }
    } else if (isGeneral) {
      // General mode - no project selected
      // Only update if URL actually changed (not just user data update)
      if (urlParamsChanged) {
        setConversation(null);
        setShowChat(true);
        setActiveTab(0);
        setSelectedProject(null);
      }
    } else if (urlProjectId) {
      // Only update if URL actually changed (not just user data update)
      if (urlParamsChanged || !selectedProject || selectedProject.id !== urlProjectId) {
        setConversation(null);
        // Don't set showChat to true here - let the activeTab state control it
        // Don't change activeTab automatically - let explicit navigation control it
        // This prevents the gear icon from switching to tab 0 before going to configuration

        // Project selected but no conversation - clear conversation, set project
        const project = user.projects?.find((p: any) => p.id === urlProjectId);
        setSelectedProject(project || null);
      }

    } else {
      // No conversation or project - clear state
      // Only clear if URL actually changed
      if (urlParamsChanged) {
        setConversation(null);
        setShowChat(false);
        setChatMessage(null);
        setSelectedProject(null);
      }
    }
  }, [searchParams, user?.conversations, user?.projects]);

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
  }, [selectedProject]);

  // Filter conversations by selected project
  useEffect(() => {
    if (!user) return;

    // Ensure conversations is always an array, never null
    const allConversations = (user.conversations && Array.isArray(user.conversations)) ? user.conversations : [];

    if (!selectedProject) {
      // Show general conversations (no project_id)
      const generalConversations = allConversations.filter(
        (conv: any) => !conv.project_id
      );
      setProjectConversations(generalConversations);
    } else {
      // Filter by project
      const filtered = allConversations.filter(
        (conv: any) => conv.project_id === selectedProject.id
      );
      setProjectConversations(filtered);
    }
  }, [user?.conversations, selectedProject]);

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
  const fetchProjects = async (search: string, callback: (data: ProjectSuggestion[]) => void) => {
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

    const suggestions: ProjectSuggestion[] = filteredProjects.map((project: any) => ({
      id: project.id,
      display: project.title || project.name || 'Untitled Project',
      color: project.color || DEFAULT_COLOR
    }));

    callback(suggestions);
  };

  // Render mention suggestions
  const renderProjectSuggestion = (_suggestion: ProjectSuggestion, _search: string, highlightedDisplay: React.ReactNode) => {
    return (
      <div className="mention-project-item">
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '2px',
            bgcolor: _suggestion.color,
            flexShrink: 0,
          }}
        />
        <div className="mention-project-name">{highlightedDisplay}</div>
      </div>
    );
  };

  // Handle mention changes

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
            setActiveTab(0); // Select chat tab 0
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
    const deletedConversationId = conversation.id;
    const projectId = conversation.project_id;

    try {
      const result = await conversationService.deleteConversation(deletedConversationId);

      if (result.success) {
        // Close dialog
        setShowDeleteDialog(false);

        // Refresh user data to remove deleted conversation
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);

          // Navigate to another conversation in the same project or clear
          // Ensure conversations is always an array before filtering
          const conversations = (updatedUser.conversations && Array.isArray(updatedUser.conversations)) ? updatedUser.conversations : [];
          const remainingConversations = conversations.filter(
            (c: any) => projectId ? c.project_id === projectId : !c.project_id
          );

          if (remainingConversations.length > 0) {
            const nextConv = remainingConversations[0];
            if (projectId) {
              navigate(`/?conversation=${nextConv.id}&project=${projectId}`);
            } else {
              navigate(`/?conversation=${nextConv.id}&general=true`);
            }
          } else {
            // No more conversations, go to project/general view
            if (projectId) {
              navigate(`/?project=${projectId}`);
            } else {
              navigate(`/?general=true`);
            }
            setConversation(null);
            setShowChat(false);
          }
        }
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

    console.log('[Home] Deleting conversation:', convId);

    try {
      // Delete the conversation on server FIRST
      const result = await conversationService.deleteConversation(convId);

      console.log('[Home] Delete API response:', result);

      if (!result.success) {
        console.error('Failed to delete conversation from server:', result.error);
        alert(`Failed to delete conversation: ${result.error}`);
        return; // Don't update UI if server delete failed
      }

      console.log('[Home] Successfully deleted conversation from server');

      // Immediately update user.conversations to remove the deleted conversation
      if (user) {
        const updatedConversations = (user.conversations || []).filter((c: any) => c.id !== convId);
        setUser({
          ...user,
          conversations: updatedConversations
        });
        console.log('[Home] Immediately removed conversation from user.conversations. New count:', updatedConversations.length);
      }

      // Update local list after server confirmation
      setProjectConversations(prev => prev.filter((c: any) => c.id !== convId));

      // If deleting the current conversation, navigate to previous one
      if (conversation?.id === convId) {
        // Find the index of current conversation before it was removed
        const currentIndex = projectConversations.findIndex((c: any) => c.id === convId);

        // Find the previous conversation (prioritize previous, fall back to next)
        let targetConversation = null;
        if (currentIndex > 0) {
          targetConversation = projectConversations[currentIndex - 1];
        } else if (projectConversations.length > 1) {
          targetConversation = projectConversations[currentIndex + 1];
        }

        // Navigate to target conversation or clear if no conversations left
        if (targetConversation) {
          const projectId = selectedProject?.id;
          if (projectId) {
            navigate(`/?conversation=${targetConversation.id}&project=${projectId}`);
          } else {
            navigate(`/?conversation=${targetConversation.id}&general=true`);
          }
        } else {
          // No conversations left, navigate to project/general home
          const projectId = selectedProject?.id;
          if (projectId) {
            navigate(`/?project=${projectId}`);
          } else {
            navigate('/?general=true');
          }
          setConversation(null);
          setShowChat(false);
        }
      }

      // Refresh user data to sync with server
      console.log('[Home] Refreshing user data after delete...');

      // Add a small delay to ensure backend has processed the delete
      await new Promise(resolve => setTimeout(resolve, 500));

      const updatedUser = await userService.get();
      if (updatedUser.success) {
        console.log('[Home] User data refreshed. Conversations count:', updatedUser.data?.conversations?.length);
        console.log('[Home] Conversations after refresh:', updatedUser.data?.conversations?.map((c: any) => ({ id: c.id, title: c.title })));
        setUser(updatedUser.data);

        // Double check if deleted conversation is still in the list
        const stillExists = updatedUser.data?.conversations?.some((c: any) => c.id === convId);
        if (stillExists) {
          console.error('[Home] WARNING: Deleted conversation still exists in refreshed data!');
          // Force filter it out from the local state
          setUser({
            ...updatedUser.data,
            conversations: updatedUser.data.conversations.filter((c: any) => c.id !== convId)
          });
        }
      }

      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('conversationDeleted', { detail: { conversationId: convId } }));

      // Dispatch user update event to refresh user data everywhere
      window.dispatchEvent(new Event('userUpdated'));
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert(`Error deleting conversation: ${error}`);
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
    // Clear current conversation to start fresh - conversation will be created when user sends first message
    setConversation(null);
    setChatMessage(null);
    setMessage('');
    setShowChat(true);
    setActiveTab(0);

    // Update URL to remove conversation param but keep project/general context
    if (selectedProject) {
      navigate(`/?project=${selectedProject.id}`);
    } else {
      navigate(`/?general=true`);
    }
  };

  const handleConversationCreated = async (newConversation: any) => {
    console.log('[Home] Conversation created:', newConversation);

    // Determine project ID from conversation or selected project
    const projectId = newConversation.project_id || selectedProject?.id;

    // Navigate to the new conversation URL FIRST to ensure it's selected
    if (projectId) {
      navigate(`/?conversation=${newConversation.id}&project=${projectId}`, { replace: true });
    } else {
      navigate(`/?conversation=${newConversation.id}&general=true`, { replace: true });
    }

    // Set state immediately
    setConversation(newConversation);
    setShowChat(true);
    setActiveTab(0);

    // Refresh user data to include new conversation and dispatch event
    try {
      const updatedUser = await userService.get();
      if (updatedUser) {
        setUser(updatedUser);
        // Dispatch userUpdated event to update sidebar with the refreshed user object
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        // Also dispatch conversationCreated for other components that might need it
        window.dispatchEvent(new CustomEvent('conversationCreated', {
          detail: { conversation: newConversation }
        }));
      }
    } catch (error) {
      console.error('[Home] Failed to refresh user after conversation created:', error);
    }
  };

  const handleConversationUpdate = async (updatedConversation: any) => {
    console.log('[Home] Conversation updated:', {
      id: updatedConversation.id,
      messagesCount: updatedConversation.messages?.length || 0
    });

    // Update local conversation state
    setConversation(updatedConversation);

    // Sync messages to server using the new method that accepts messages directly
    if (updatedConversation.id && updatedConversation.messages) {
      try {
        // Sync messages directly to server (no local storage)
        await conversationService.updateConversationMessages(
          updatedConversation.id,
          updatedConversation.messages
        );
        console.log('[Home] Synced conversation to server');

        // Refresh user data to update user.conversations
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
          // Dispatch event to update sidebar
          window.dispatchEvent(new CustomEvent('conversationUpdated', {
            detail: { conversationId: updatedConversation.id }
          }));
        }
      } catch (error) {
        console.error('[Home] Failed to sync conversation:', error);
      }
    }
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
      // Ensure conversations is always an array, never null or undefined
      const allConversations = (user?.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
      const projectConversations = allConversations.filter(
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

  const getProjectColor = (project: any) => {
    return project?.color || DEFAULT_COLOR;
  };

  const handleOpenDeleteDocDialog = (doc: any) => {
    setDocumentToDelete(doc);
    setDeleteDocConfirm('');
    setDeleteDocError('');
    setShowDeleteDocDialog(true);
  };

  const handleCloseDeleteDocDialog = () => {
    setShowDeleteDocDialog(false);
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
      const url = `${API_ENDPOINT}/projects/${selectedProject.id}/documents/${documentToDelete.id}`;
      const response = await userService.makeAuthenticatedRequest(url, {
        method: 'DELETE',
      });

      if (response && (response.status === 200 || response.status === 204)) {
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

        handleCloseDeleteDocDialog();
      } else {
        setDeleteDocError('Failed to delete document. Please try again.');
      }
    } catch (error: any) {
      console.error('Error deleting document:', error);
      setDeleteDocError(error.message || 'An error occurred while deleting the document.');
    } finally {
      setIsDeletingDoc(false);
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
          <DocumentUploadDialog
            open={showFileUploadDialog}
            onClose={() => {
              setShowFileUploadDialog(false);
            }}
            onSuccess={() => {
              setShowFileUploadDialog(false);
              // Refresh user data
              userService.get().then((result) => {
                if (result.success) {
                  setUser(result.data);
                }
              });
            }}
            user={user}
            setUser={setUser}
            preselectedProjectId={selectedProject?.id}
            disableProjectSelection={true}
          />

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

          {/* Delete Document Confirmation Dialog */}
          <Dialog
            open={showDeleteDocDialog}
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
                <Box className="flex-none p-4">
                  <Box className="flex items-center justify-between gap-4">
                    <Box className="flex items-center gap-4 flex-1 min-w-0">
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '2px',
                          bgcolor: getProjectColor(selectedProject),
                          flexShrink: 0,
                        }}
                      />
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
                  </Box>
                </Box>

                {/* Tabs - show each conversation as tab plus Configuration */}
                {(selectedProject || searchParams.get('project') || searchParams.get('general') === 'true') && (
                  <ConversationTabs
                    projectConversations={projectConversations}
                    currentConversation={conversation}
                    onConversationSelect={(conversationId) => {
                      const newUrl = selectedProject
                        ? `/?conversation=${conversationId}&project=${selectedProject.id}`
                        : `/?conversation=${conversationId}&general=true`;
                      navigate(newUrl);
                    }}
                    onConversationDelete={handleDeleteConversationFromList}
                    onNewConversation={handleStartNewConversation}
                  />
                )}

                {/* Main Content Area - 2 columns */}
                <Box className="flex-1 overflow-hidden flex" style={{ height: (selectedProject || searchParams.get('project') || searchParams.get('general') === 'true') ? 'calc(100vh - 137px)' : 'calc(100vh - 89px)' }}>
                  {/* Left Column - Chat or Documents Tab */}
                  <Box className="flex-1 overflow-hidden" sx={{ width: { xs: '100%', md: (selectedProject || searchParams.get('general') === 'true') ? '70%' : '100%' } }}>
                    {activeTab === 1 && selectedProject ? (
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
                      // Show Chat component (it handles the case when conversation is null)
                      <Chat
                        project={selectedProject}
                        initialMessage={chatMessage}
                        attachments={messageAttachments}
                        conversation={conversation}
                        isGeneral={!selectedProject && (searchParams.get('general') === 'true' || !searchParams.get('project'))}
                        onFileAttached={handleFileAttached}
                        onAttachmentsClear={() => {
                          setMessageAttachments([]);
                        }}
                        onTokenUpdate={() => {
                          window.dispatchEvent(new Event('refreshUserTokens'));
                        }}
                        onConversationCreated={handleConversationCreated}
                        onConversationUpdate={handleConversationUpdate}
                      />
                    )}
                  </Box>

                  {/* Right Sidebar - Rules & Documents */}
                  {selectedProject && activeTab !== 1 && (
                    <RightSidebar
                      selectedProject={selectedProject}
                      currentProjectData={currentProjectData}
                      projectRules={projectRules}
                      isSavingRules={isSavingRules}
                      onRulesChange={(value: string) => {
                        setProjectRules(value);
                        if (autoSaveTimerRef.current) {
                          clearTimeout(autoSaveTimerRef.current);
                        }
                        autoSaveTimerRef.current = setTimeout(() => {
                          autoSaveProjectRules(value);
                        }, 3000);
                      }}
                      onAddDocument={() => setShowFileUploadDialog(true)}
                      onDeleteDocument={handleOpenDeleteDocDialog}
                    />
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
                                  icon={
                                    <Box
                                      sx={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '2px',
                                        bgcolor: selectedProject.color || DEFAULT_COLOR,
                                        flexShrink: 0,
                                      }}
                                    />
                                  }
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
