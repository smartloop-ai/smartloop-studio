'use client';

import '../styles/home.css';
import '../styles/mentions.css';
import '../styles/markdown-editor.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Chip, Dialog, IconButton, CircularProgress, Typography, TextField } from '@mui/material';
import { Mention, MentionsInput, SuggestionDataItem } from 'react-mentions';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FileAttacher from '@/app/components/file-attacher';
import DocumentPolling from '@/app/components/document-polling';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
import DocumentsTab from '@/app/components/documents-tab';
import RightSidebar from '@/app/components/right-sidebar';
import 'easymde/dist/easymde.min.css';
import { userService } from '@/app/services/user.service';
import { conversationService } from '@/app/services/conversation.service';
import { projectService } from '@/app/services/project.service';
import { documentService } from '@/app/services/document.service';
import { storageService } from '@/app/services/storage.service';
import { dialogStyles } from '@/app/shared/utils';
import { DEFAULT_COLOR, getLocalApiEndpoint } from '@/app/constants';
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
  const [_projectMemory, setProjectMemory] = useState(true);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [currentProjectData, setCurrentProjectData] = useState<any>(null);
  const lastSavedRulesRef = useRef<string>('');
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editedProjectName, setEditedProjectName] = useState('');
  const previousMessageRef = useRef<string>(''); // Track previous message to detect mention removal
  const [showDeleteDocDialog, setShowDeleteDocDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<any>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState('');
  const [deleteDocError, setDeleteDocError] = useState('');
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [hasConversations, setHasConversations] = useState(false);

  // Load a single project from local API (enriched with local UI metadata)
  const loadProjectFromApi = async (projectId: string) => {
    try {
      const result = await projectService.getProjects();
      if (result.success && result.data) {
        const projects = Array.isArray(result.data) ? result.data : [];
        return projects.find((p: any) => p.id === projectId) || null;
      }
    } catch {}
    return null;
  };

  // Check if any conversations exist in SQLite
  useEffect(() => {
    const checkConversations = async () => {
      const conversations = await storageService.getConversations();
      setHasConversations(conversations.length > 0);
    };

    checkConversations();

    const handleChange = () => { checkConversations(); };
    window.addEventListener('conversationCreated', handleChange);
    window.addEventListener('conversationDeleted', handleChange);

    return () => {
      window.removeEventListener('conversationCreated', handleChange);
      window.removeEventListener('conversationDeleted', handleChange);
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      setIsLoading(false);
    }
  }, [user]);

  // Listen for conversation deletion events
  useEffect(() => {
    const handleConversationDeleted = async (event: any) => {
      const deletedConversationId = event.detail?.conversationId;

      // If the deleted conversation is currently open, select the previous conversation from the same project
      if (deletedConversationId && conversation?.id === deletedConversationId) {
        console.log('Currently opened conversation was deleted');

        const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
        const currentProjectId = selectedProject?.id;

        // Get remaining conversations — from SQLite in Electron, from user object otherwise
        let projectConvos: any[] = [];
        if (isElectron && currentProjectId) {
          const allConvos = await storageService.getConversations(currentProjectId);
          projectConvos = allConvos.filter((c: any) => c.id !== deletedConversationId);
        } else {
          const remaining = (user?.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
          projectConvos = remaining.filter((conv: any) =>
            conv.project_id === currentProjectId && conv.id !== deletedConversationId
          );
        }

        if (projectConvos.length > 0) {
          // Sort by created_at descending and select the most recent from the same project
          const lastConversation = projectConvos.sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];

          console.log('Auto-selecting previous conversation from same project:', lastConversation.id);

          if (currentProjectId) {
            navigate(`/?conversation=${lastConversation.id}&project=${currentProjectId}`);
          }
        } else {
          // No conversations left in the current project, navigate to project home
          console.log('No conversations remaining in current project, navigating to project home');
          if (currentProjectId) {
            navigate(`/?project=${currentProjectId}`);
          } else if (selectedProject) {
            navigate(`/?project=${selectedProject.id}`);
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
            // Add new conversation to the end (tabs ordered by creation time)
            return [...prev, newConversation];
          });
        }
      }
    };

    window.addEventListener('conversationCreated', handleConversationCreatedEvent);

    return () => {
      window.removeEventListener('conversationCreated', handleConversationCreatedEvent);
    };
  }, [selectedProject]);


  // Handle conversation ID from URL parameter — load from SQLite and local API
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');
    const urlProjectId = searchParams.get('project');

    if (!user) return;

    if (urlConversationId) {
      const loadAndSetConversation = async () => {
        // Load conversation and messages from SQLite
        const stored = await storageService.getConversation(urlConversationId);
        if (!stored) return;

        const messages = await storageService.getMessages(urlConversationId);
        const foundConversation = { ...stored, messages: messages || [] };

        console.log('[Home] Loading conversation:', foundConversation.id, 'messages:', foundConversation.messages?.length || 0);
        setConversation({ ...foundConversation });
        setShowChat(true);
        setActiveTab(0);

        // Set project from conversation's project_id via local API (already enriched with local metadata)
        if (foundConversation.project_id) {
          const project = await loadProjectFromApi(foundConversation.project_id);
          if (project) {
            setSelectedProject(project);
          }
        }
      };

      loadAndSetConversation();
    } else if (urlProjectId) {
      setConversation(null);
      // Load project from local API (already enriched with local metadata)
      (async () => {
        const project = await loadProjectFromApi(urlProjectId);
        if (project) {
          setSelectedProject(project);
        }
      })();
    } else {
      if (urlParamsChanged) {
        // No URL params — if conversations exist, auto-select the most recent one
        const autoSelect = async () => {
          const allConversations = await storageService.getConversations();
          if (allConversations.length > 0) {
            const sorted = allConversations.sort((a: any, b: any) =>
              new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
            );
            const mostRecent = sorted[0];
            const projectId = mostRecent.project_id;
            if (projectId) {
              navigate(`/?conversation=${mostRecent.id}&project=${projectId}`, { replace: true });
            } else {
              navigate(`/?conversation=${mostRecent.id}`, { replace: true });
            }
          } else {
            setConversation(null);
            setShowChat(false);
            setChatMessage(null);
            setSelectedProject(null);
          }
        };
        autoSelect();
      }
    }
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


  // Load project data when selected, unload/load model on switch
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedProject && user) {
      const project = user.projects?.find((p: any) => p.id === selectedProject.id);
      if (project) {
        setCurrentProjectData(project);
        setProjectMemory(project.config?.memory !== undefined ? project.config.memory : true);
      }

      // Unload and reload model when switching between projects
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.unloadModel && prevProjectIdRef.current && prevProjectIdRef.current !== selectedProject.id) {
        (async () => {
          try {
            await electronAPI.unloadModel();
            await electronAPI.loadModel();
          } catch (e: any) {
            console.warn('[Home] Model reload on project switch failed:', e.message);
          }
        })();
      }
      prevProjectIdRef.current = selectedProject.id;

      // Load documents + rules from local service
      (async () => {
        try {
          const localBase = await getLocalApiEndpoint();

          // Fetch documents for this project from local SLP
          const docsRes = await fetch(`${localBase}/v1/documents`);
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            const docs: any[] = docsData.documents || docsData || [];
            setCurrentProjectData((prev: any) => prev ? { ...prev, documents: docs } : prev);
            // Keep user.projects in sync
            if (user) {
              const updatedProjects = (user.projects || []).map((p: any) =>
                p.id === selectedProject.id ? { ...p, documents: docs } : p
              );
              setUser({ ...user, projects: updatedProjects });
            }
          }

          // Fetch rules
          const res = await fetch(`${localBase}/v1/rules`);
          if (res.ok) {
            const data = await res.json();
            const rules = data.rule || data.rules || '';
            setProjectRules(rules);
            lastSavedRulesRef.current = rules;
          } else {
            setProjectRules('');
            lastSavedRulesRef.current = '';
          }
        } catch {
          setProjectRules('');
          lastSavedRulesRef.current = '';
        }
      })();
    } else {
      setCurrentProjectData(null);
      setProjectRules('');
      setProjectMemory(true);
    }
  }, [selectedProject]);

  // Load conversations for the selected project
  const loadProjectConversations = async () => {
    if (!user) return;

    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

    const projectId = selectedProject?.id ||
      user.projects?.find((p: any) => p.system === true)?.id;

    if (!projectId) {
      return;
    }

    if (isElectron) {
      // Load from SQLite — already ordered by updated_at DESC
      const convos = await storageService.getConversations(projectId);
      setProjectConversations(convos);
    } else {
      const allConversations = (user.conversations && Array.isArray(user.conversations)) ? user.conversations : [];
      const filtered = allConversations.filter(
        (conv: any) => conv.project_id === projectId
      );
      setProjectConversations(filtered);
    }
  };

  // Reload when project or user conversations change
  useEffect(() => {
    loadProjectConversations();
  }, [user?.conversations, selectedProject]);

  // In Electron mode, also refresh from SQLite when conversations are created/updated/deleted
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
    if (!isElectron) return;

    const handleRefresh = () => { loadProjectConversations(); };

    window.addEventListener('conversationCreated', handleRefresh);
    window.addEventListener('conversationUpdated', handleRefresh);
    window.addEventListener('conversationDeleted', handleRefresh);

    return () => {
      window.removeEventListener('conversationCreated', handleRefresh);
      window.removeEventListener('conversationUpdated', handleRefresh);
      window.removeEventListener('conversationDeleted', handleRefresh);
    };
  }, [selectedProject, user]);

  // Clear project selection when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      setSelectedProject(null);
    };
  }, []);


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
      // Exclude system projects
      if (project.system) return false;
      const projectName = (project.name || '').toLowerCase();
      // If no search term, show all projects
      if (!searchTerm) return true;
      // Otherwise filter by search term
      return projectName.includes(searchTerm);
    });

    const suggestions: ProjectSuggestion[] = filteredProjects.map((project: any) => ({
      id: project.id,
      display: project.name || 'Untitled Project',
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

  const saveProjectRules = async (rules: string) => {
    if (!selectedProject || !rules) return;

    console.log('Saving project rules for project:', selectedProject.id);

    setIsSavingRules(true);

    try {
      const localBase = await getLocalApiEndpoint();
      const url = `${localBase}/v1/rules`;
      const payload = { rule: rules };

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        lastSavedRulesRef.current = rules;
        setProjectRules(rules);
      } else {
        console.error('Failed to save project rules. Status:', response.status);
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
      console.log('[handleMentionChange] Project selected via mention:', project.name, project.id);
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
    // Remove /command markup before checking message
    // The markup format is: /[display](id)
    const cleanMessage = message.replace(/\/\[([^\]]+)\]\([^)]+\)/g, '').trim();

    // Only proceed if there's a valid message
    if (!cleanMessage) {
      return;
    }

    let activeConversationId = conversation?.id;

    // If no project is selected, auto-select the system project
    let projectForMessage = selectedProject;
    if (!projectForMessage && !activeConversationId) {
      const systemProject = user?.projects?.find((p: any) => p.system === true);
      if (systemProject) {
        console.log('[handleSendMessage] No project selected, auto-selecting system project:', systemProject.id);
        projectForMessage = systemProject;
        setSelectedProject(systemProject);
      }
    }

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
      if (projectForMessage?.id) {
        console.log('[handleSendMessage] Adding project as attachment (first message only):', {
          projectId: projectForMessage.id,
          projectName: projectForMessage.name,
          file_id: `project-${projectForMessage.id}`
        });
        attachmentsToSend.push({
          file_id: `project-${projectForMessage.id}`,
          name: projectForMessage.name || 'Project'
        });
      }
      console.log('[handleSendMessage] Final attachments to send (new conversation):', attachmentsToSend);
      // Create a new conversation with the selected project
      try {
        const projectId = projectForMessage?.id;
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

          // Immediately add to projectConversations so tab appears right away
          setProjectConversations(prev => {
            // Check if conversation already exists in list
            if (prev.some((c: any) => c.id === newConversation.id)) {
              return prev;
            }
            // Add new conversation to the end (tabs ordered by creation time)
            return [...prev, newConversation];
          });

          setMessageAttachments(attachmentsToSend);
          setChatMessage(cleanMessage);
          setMessage('');
          setClearAttachmentTrigger(prev => prev + 1);

          // Note: conversationCreated event is already dispatched by conversationService.createConversation()

          // Navigate to conversation page with project
          // Use replace: true to avoid adding to history and ensure URL is updated immediately
          if (projectId) {
            navigate(`/?conversation=${activeConversationId}&project=${projectId}`, { replace: true });
          } else {
            navigate(`/?conversation=${activeConversationId}`, { replace: true });
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
        const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
        let currentUser = user;
        if (!isElectron) {
          const updatedUser = await userService.get();
          if (updatedUser) {
            setUser(updatedUser);
            currentUser = updatedUser;
          }
        } else {
          // In Electron, filter out deleted conversation from local state
          const filteredConversations = (user?.conversations || []).filter(
            (c: any) => c.id !== deletedConversationId
          );
          const updatedUser = { ...user, conversations: filteredConversations };
          setUser(updatedUser);
          currentUser = updatedUser;
        }

        if (currentUser) {
          // Navigate to another conversation in the same project or clear
          // Ensure conversations is always an array before filtering
          const conversations = (currentUser.conversations && Array.isArray(currentUser.conversations)) ? currentUser.conversations : [];
          const remainingConversations = conversations.filter(
            (c: any) => c.project_id === projectId
          );

          if (remainingConversations.length > 0) {
            const nextConv = remainingConversations[0];
            navigate(`/?conversation=${nextConv.id}&project=${projectId}`);
          } else {
            // No more conversations, go to project view
            navigate(`/?project=${projectId}`);
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

        // Navigate to target conversation or welcome screen if none left
        if (targetConversation) {
          const projectId = selectedProject?.id;
          if (projectId) {
            navigate(`/?conversation=${targetConversation.id}&project=${projectId}`);
          }
        } else {
          // Check if any conversations remain globally
          const allRemaining = await storageService.getConversations();
          if (allRemaining.length === 0) {
            // No conversations left anywhere — go to welcome screen
            navigate('/', { replace: true });
            setConversation(null);
            setShowChat(false);
            setSelectedProject(null);
          } else {
            // Other projects still have conversations — select most recent
            const sorted = allRemaining.sort((a: any, b: any) =>
              new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
            );
            const mostRecent = sorted[0];
            const projectId = mostRecent.project_id;
            if (projectId) {
              navigate(`/?conversation=${mostRecent.id}&project=${projectId}`, { replace: true });
            } else {
              navigate(`/?conversation=${mostRecent.id}`, { replace: true });
            }
          }
        }
      }

      // Refresh user data to sync with server (skip in Electron — already updated locally above)
      const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
      if (!isElectron) {
        console.log('[Home] Refreshing user data after delete...');

        // Add a small delay to ensure backend has processed the delete
        await new Promise(resolve => setTimeout(resolve, 500));

        const updatedUser = await userService.get();
        if (updatedUser.success) {
          console.log('[Home] User data refreshed. Conversations count:', updatedUser.data?.conversations?.length);
          setUser(updatedUser.data);

          // Double check if deleted conversation is still in the list
          const stillExists = updatedUser.data?.conversations?.some((c: any) => c.id === convId);
          if (stillExists) {
            console.error('[Home] WARNING: Deleted conversation still exists in refreshed data!');
            setUser({
              ...updatedUser.data,
              conversations: updatedUser.data.conversations.filter((c: any) => c.id !== convId)
            });
          }
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

    // Prevent renaming system projects
    if (selectedProject.system === true) {
      setIsEditingProjectName(false);
      return;
    }

    const newName = editedProjectName.trim();
    if (newName === (selectedProject.name)) {
      setIsEditingProjectName(false);
      return;
    }

    try {
      const result = await projectService.updateProject(selectedProject.id, { name: newName });

      if (result.success) {
        // Reload project from API to get fresh state
        const updated = await loadProjectFromApi(selectedProject.id);
        if (updated) {
          setSelectedProject(updated);
        }
        // Dispatch event so sidebar reloads projects
        window.dispatchEvent(new CustomEvent('projectUpdated'));
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

    // Update URL to remove conversation param but keep project context
    if (selectedProject) {
      navigate(`/?project=${selectedProject.id}`);
    }
  };

  const handleConversationCreated = async (newConversation: any) => {
    console.log('[Home] Conversation created:', newConversation);

    // Determine project ID from conversation or selected project
    const projectId = newConversation.project_id || selectedProject?.id;

    // Navigate to the new conversation URL
    if (projectId) {
      navigate(`/?conversation=${newConversation.id}&project=${projectId}`, { replace: true });
    } else {
      navigate(`/?conversation=${newConversation.id}`, { replace: true });
    }

    // Set state immediately
    setConversation(newConversation);
    setShowChat(true);
    setActiveTab(0);

    // Dispatch conversationCreated event so sidebar refreshes from SQLite
    window.dispatchEvent(new CustomEvent('conversationCreated', {
      detail: { conversation: newConversation }
    }));

    // For remote users, also refresh user data from server (skip in Electron)
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
    if (!user?.guest && !isElectron) {
      try {
        const updatedUser = await userService.get();
        if (updatedUser) {
          setUser(updatedUser);
          window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        }
      } catch (error) {
        console.error('[Home] Failed to refresh user after conversation created:', error);
      }
    }
  };

  const handleConversationUpdate = async (updatedConversation: any) => {
    console.log('[Home] Conversation updated:', {
      id: updatedConversation.id,
      messagesCount: updatedConversation.messages?.length || 0
    });

    // Update local conversation state
    setConversation(updatedConversation);

    // Sync messages to storage
    if (updatedConversation.id && updatedConversation.messages) {
      try {
        await conversationService.updateConversationMessages(
          updatedConversation.id,
          updatedConversation.messages
        );
        console.log('[Home] Synced conversation messages');

        // Dispatch event to update sidebar conversation list
        window.dispatchEvent(new CustomEvent('conversationUpdated', {
          detail: { conversationId: updatedConversation.id }
        }));

        // For remote users, also refresh user data from server (skip in Electron)
        const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
        if (!user?.guest && !isElectron) {
          const updatedUser = await userService.get();
          if (updatedUser) {
            setUser(updatedUser);
          }
        }
      } catch (error) {
        console.error('[Home] Failed to sync conversation:', error);
      }
    }
  };

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProject) return;

    // Prevent deletion of system projects
    if (selectedProject.system === true) {
      setDeleteProjectError('Cannot delete system project');
      return;
    }

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
      const result = await projectService.deleteProject(selectedProject.id);

      if (result.success) {
        // Refresh user data (skip remote call in Electron)
        const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
        if (!isElectron) {
          const updatedUser = await userService.get();
          if (updatedUser) {
            setUser(updatedUser);
          }
        } else {
          // In Electron, remove project from local user state
          const updatedProjects = (user?.projects || []).filter((p: any) => p.id !== selectedProject.id);
          const updatedConversations = (user?.conversations || []).filter(
            (c: any) => c.project_id !== selectedProject.id
          );
          setUser({ ...user, projects: updatedProjects, conversations: updatedConversations });
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

        handleCloseDeleteDocDialog();
      } else {
        setDeleteDocError(deleteResult.error || 'Failed to delete document. Please try again.');
      }
    } catch (error: any) {
      console.error('Error deleting document:', error);
      setDeleteDocError(error.message || 'An error occurred while deleting the document.');
    } finally {
      setIsDeletingDoc(false);
    }
  };

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
              // Refresh user data (skip in Electron — state already updated locally)
              const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
              if (!isElectron) {
                userService.get().then((result) => {
                  if (result.success) {
                    setUser(result.data);
                  }
                });
              }
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
                        Deleting "{selectedProject?.name || 'this project'}" will permanently remove all documents, conversations, and associated data.
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
              // Show main view when conversations exist in database, or there's an active conversation/project
              const urlConversationId = searchParams.get('conversation');
              const urlProjectId = searchParams.get('project');
              return hasConversations || showChat || conversation || urlConversationId || urlProjectId || projectConversations.length > 0;
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
                            className={`text-xl md:text-2xl font-bold text-white truncate ${selectedProject && !selectedProject.system ? 'cursor-pointer hover:text-pink-400 transition-colors' : ''}`}
                            onClick={() => {
                              if (selectedProject && !selectedProject.system) {
                                setEditedProjectName(selectedProject.name || '');
                                setIsEditingProjectName(true);
                              }
                            }}
                            title={selectedProject && !selectedProject.system ? 'Click to rename' : undefined}
                          >
                            {selectedProject?.name || 'General'}
                          </div>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Box>

                {/* Tabs - show each conversation as tab plus Configuration */}
                {(selectedProject || searchParams.get('project') || conversation || searchParams.get('conversation')) && (
                  <ConversationTabs
                    projectConversations={projectConversations}
                    currentConversation={conversation}
                    onConversationSelect={(conversationId) => {
                      const newUrl = selectedProject
                        ? `/?conversation=${conversationId}&project=${selectedProject.id}`
                        : `/?conversation=${conversationId}`;
                      navigate(newUrl);
                    }}
                    onConversationDelete={handleDeleteConversationFromList}
                    onNewConversation={handleStartNewConversation}
                  />
                )}

                {/* Main Content Area - 2 columns */}
                <Box className="flex-1 overflow-hidden flex" style={{ height: (selectedProject || searchParams.get('project') || conversation || searchParams.get('conversation')) ? 'calc(100vh - 137px)' : 'calc(100vh - 89px)' }}>
                  {/* Left Column - Chat or Documents Tab */}
                  <Box className="flex-1 overflow-hidden" sx={{ width: { xs: '100%', md: selectedProject ? '70%' : '100%' } }}>
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
                      onSaveRules={(rules: string) => {
                        saveProjectRules(rules || '');
                      }}
                      onAddDocument={() => setShowFileUploadDialog(true)}
                      onDeleteDocument={handleOpenDeleteDocDialog}
                      user={user}
                      setUser={setUser}
                    />
                  )}
                </Box>
              </Box>
            ) : (
              // Main prompt screen with no active conversation
              <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'black' }}>
                {/* Top bar with login button for guest users */}
                {user?.guest && (
                  <Box className="flex items-center justify-end px-6 py-4">
                    <button
                      onClick={() => navigate('/login')}
                      className="px-4 py-1.5 rounded-sm border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-pink-500/50 hover:bg-gray-900/50 transition-all"
                    >
                      Login
                    </button>
                  </Box>
                )}
                <Box className="flex-1 flex items-center justify-center px-4">
                  <Box className="max-w-3xl w-full">
                    {/* Logo */}
                    <Box className="flex justify-center mb-6" sx={{ padding: '10px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <span className="text-5xl font-semibold text-white tracking-tight">smartloop</span>
                        <span className="text-pink-500 text-5xl font-semibold">.</span>
                      </Box>
                    </Box>

                    {/* Prompt input */}
                    <Box className="bg-gray-900/50 border rounded-2xl p-4 relative transition-all border-gray-700 hover:border-pink-500/50">
                      <MentionsInput
                        value={message}
                        onChange={handleMentionChange}
                        placeholder="Type your prompt.. (e.g. what are best coffee shop in San Francisco?)"
                        className="mentions"
                        allowSuggestionsAboveCursor={true}
                        style={{
                          control: { minHeight: '80px', border: 'none', outline: 'none', boxShadow: 'none' },
                          input: { color: 'white', minHeight: '80px', border: 'none', outline: 'none', boxShadow: 'none' },
                          highlighter: { minHeight: '80px', border: 'none', outline: 'none', boxShadow: 'none' },
                          suggestions: { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)', zIndex: 10000 },
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
                            const project = user?.projects?.find((p: any) => p.id === id);
                            if (project) {
                              setSelectedProject(project);
                              setMessage('');
                              previousMessageRef.current = '';
                            }
                          }}
                          style={{ backgroundColor: 'transparent' }}
                        />
                      </MentionsInput>

                      <Box className="flex items-center justify-between mt-3">
                        <Box className="flex items-center gap-2">
                          <Chip
                            icon={
                              <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: selectedProject?.color || DEFAULT_COLOR, flexShrink: 0 }} />
                            }
                            label={selectedProject?.name || 'General Chat'}
                            size="small"
                            onClick={() => {/* TODO: project picker */}}
                            sx={{
                              height: '28px', borderRadius: '2px',
                              bgcolor: 'rgba(236, 72, 153, 0.08)', color: '#9ca3af',
                              border: '1px solid rgba(107, 114, 128, 0.3)', fontSize: '12px',
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'rgba(236, 72, 153, 0.15)', borderColor: 'rgba(236, 72, 153, 0.4)', color: '#ec4899' },
                            }}
                          />
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
                    </Box>

                    {/* Footer text */}
                    <Box className="mt-4">
                      <Box className="text-xs text-gray-500 text-center">
                        Ready to assist you with anything you need.
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
