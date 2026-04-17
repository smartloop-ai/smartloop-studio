'use client';

import '../styles/home.css';
import '../styles/markdown-editor.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Dialog, IconButton, CircularProgress, Typography, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
// import DocumentsTab from '@/app/components/documents-tab';
import SkillEditor from '@/app/components/skill-editor';
import RightSidebar from '@/app/components/right-sidebar';
import 'easymde/dist/easymde.min.css';
import { userService } from '@/app/services/user.service';
import { conversationService } from '@/app/services/conversation.service';
import { projectService } from '@/app/services/project.service';
import { documentService } from '@/app/services/document.service';
import { storageService } from '@/app/services/storage.service';
import { dialogStyles } from '@/app/shared/utils';
import { DEFAULT_COLOR, getLocalApiEndpoint } from '@/app/constants';
import { bootstrapProgress } from '@/app/shared/BootstrapProgress';
import Chat from '@/app/components/chat';
import ContentTabs, { OpenTab } from '@/app/components/conversation-tabs';
import McpTab from '@/app/components/mcp-tab';
import DocumentViewer from '@/app/components/document-viewer';
import { useAuthContext } from '@/app/contexts/AuthContext';

export default function Home() {
  const [user, setUser] = useAuthContext();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject]: any = useState(null);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState<Array<{ file_id: string; name: string }>>([]);
  const [conversation, setConversation] = useState<any>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState('');
  const [deleteProjectError, setDeleteProjectError] = useState('');
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [projectConversations, setProjectConversations] = useState<any[]>([]);
  const [projectSkills, setProjectSkills] = useState<Array<{ id?: string; name: string; content: string; description?: string }>>([]);
  const [_projectMemory, setProjectMemory] = useState(true);
  const [isSavingSkills, setIsSavingSkills] = useState(false);
  const [currentProjectData, setCurrentProjectData] = useState<any>(null);

  const [showDeleteDocDialog, setShowDeleteDocDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<any>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState('');
  const [deleteDocError, setDeleteDocError] = useState('');
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  // Load active model name and load model when project changes
  useEffect(() => {
    const loadModel = async () => {
      // Determine model name: project-specific or global default
      let modelName = '';
      if (selectedProject?.model_name) {
        modelName = selectedProject.model_name;
        await storageService.setItem('selected_model', modelName);
      } else {
        modelName = await storageService.getItem('selected_model') || '';
      }

      // Call /v1/models/load to ensure the model is loaded for this project
      if (modelName && selectedProject?.id) {
        const api = (window as any).electronAPI;
        const baseUrl = api?.getLocalApiUrl ? await api.getLocalApiUrl() : null;
        if (!baseUrl) return;

        window.dispatchEvent(new CustomEvent('modelInitStatus', { detail: { loading: true, model: modelName } }));

        const attemptLoad = async (retries = 3): Promise<boolean> => {
          for (let i = 0; i < retries; i++) {
            try {
              // Check health first
              const health = await fetch(`${baseUrl}/health`).catch(() => null);
              if (!health?.ok) {
                console.log(`[Home] SLP not ready, retrying (${i + 1}/${retries})...`);
                await new Promise(r => setTimeout(r, 2000));
                continue;
              }

              const res = await fetch(`${baseUrl}/v1/models/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_name: modelName }),
              });

              if (res.ok && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const text = decoder.decode(value, { stream: true });
                  const lines = text.split('\n');
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const payload = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
                    try {
                      const event = JSON.parse(payload);
                      const progress = bootstrapProgress(event);

                      console.log(`[Home] Model download progress: ${progress.percent}% — ${progress.status}`);
                      window.dispatchEvent(new CustomEvent('modelDownloadProgress', {
                        detail: { downloading: progress.downloading, model: modelName, percent: progress.percent, status: progress.status, stage: progress.stage }
                      }));
                    } catch {
                      // Non-JSON line, log raw
                      console.log('[Home] Model load:', trimmed);
                    }
                  }
                }
              }
              return true;
            } catch (err) {
              console.warn(`[Home] Load model attempt ${i + 1} failed:`, err);
              if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
            }
          }
          return false;
        };

        await attemptLoad();
        window.dispatchEvent(new CustomEvent('modelInitStatus', { detail: { loading: false, model: modelName } }));
      }
    };
    loadModel();
  }, [selectedProject]);

  // Load a single project from local SLP service (enriched with SQLite metadata)
  const loadProjectFromApi = async (projectId: string) => {
    try {
      const projects = await projectService.getProjects();
      return projects.find((p: any) => p.id === projectId) || null;
    } catch {
      return null;
    }
  };

  // Ensure a project is always selected — fall back to system project
  useEffect(() => {
    if (!selectedProject && user?.projects?.length > 0) {
      const systemProject = user.projects.find((p: any) => p.system === true);
      const fallback = systemProject || user.projects[0];
      setSelectedProject(fallback);
    }
  }, [selectedProject, user?.projects]);

  // Wait for local SLP service to load projects before dismissing loader
  useEffect(() => {
    const loadProjects = async () => {
      const projects = await projectService.getProjects();
      if (projects.length > 0) {
        setUser((prev: any) => prev ? { ...prev, projects } : prev);

        // Restore last selected conversation from SQLite if nothing is in the URL
        if (!searchParams.get('project') && !searchParams.get('conversation')) {
          const selected = await storageService.getSelectedConversation();

          if (selected) {
            const projectId = selected.project_id || projects.find((p: any) => p.system)?.id;
            navigate(`/?conversation=${selected.id}&project=${projectId}`, { replace: true });
            setIsLoading(false);
            return true;
          }

          // No stored selection — fall back to system project
          const systemProject = projects.find((p: any) => p.system === true);
          const defaultProject = systemProject || projects[0];
          setSelectedProject(defaultProject);
          navigate(`/?project=${defaultProject.id}`, { replace: true });
        }

        setIsLoading(false);
        return true;
      }

      // Service responded but no projects exist yet — dismiss loader
      // so user can see the page and create a project
      const localBase = await import('@/app/constants').then(m => m.getLocalApiEndpoint());
      if (localBase) {
        setUser((prev: any) => prev ? { ...prev, projects: [] } : prev);
        setSelectedProject(null);
        setIsLoading(false);
        return true;
      }

      return false;
    };

    // Check if SLP is already ready (event may have fired before mount)
    loadProjects().then((loaded) => {
      if (!loaded) {
        // Not ready yet — wait for the event
        const handleReady = async () => {
          await loadProjects();
          setIsLoading(false);
          window.removeEventListener('slpServiceReady', handleReady);
        };
        window.addEventListener('slpServiceReady', handleReady);
      }
    });
  }, []);

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
          setConversation(null);
          setChatMessage(null);
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


  // Track whether user has loaded at least once (avoid re-running URL effect on every user update)
  const userLoadedRef = useRef(false);
  useEffect(() => {
    if (user && !userLoadedRef.current) {
      userLoadedRef.current = true;
    }
  }, [user]);

  // Handle conversation ID from URL parameter — load from SQLite and local API
  useEffect(() => {
    if (!userLoadedRef.current && !user) return;

    const urlConversationId = searchParams.get('conversation');
    const urlProjectId = searchParams.get('project');

    if (urlConversationId) {
      const loadAndSetConversation = async () => {
        // Load conversation and messages from SQLite
        const stored = await storageService.getConversation(urlConversationId);
        if (!stored) return;

        const messages = await storageService.getMessages(urlConversationId);
        const foundConversation = { ...stored, messages: messages || [] };

        console.log('[Home] Loading conversation:', foundConversation.id, 'messages:', foundConversation.messages?.length || 0);
        setConversation({ ...foundConversation });
        // Open conversation tab
        handleOpenTab({
          id: `conv-${foundConversation.id}`,
          type: 'conversation',
          title: foundConversation.title || 'New Conversation',
        });

        // Persist selection in SQLite
        await storageService.selectConversation(urlConversationId);

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
      const isExplicitNew = searchParams.get('new') === '1';
      (async () => {
        const project = await loadProjectFromApi(urlProjectId);
        if (project) {
          setSelectedProject(project);
        }

        // Clear selection when switching to a project
        await storageService.clearSelectedConversation();

        // Auto-select latest conversation unless user explicitly started a new one
        if (!isExplicitNew) {
          const convos = await storageService.getConversations(urlProjectId);
          if (convos.length > 0) {
            const sorted = convos.sort((a: any, b: any) =>
              new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
            );
            navigate(`/?conversation=${sorted[0].id}&project=${urlProjectId}`, { replace: true });
            return;
          }
        }
        setConversation(null);
      })();
    } else {
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
          // No conversations — auto-select system project so Chat has a valid project context
          setConversation(null);
          setChatMessage(null);
          const systemProject = user?.projects?.find((p: any) => p.system === true);
          const fallbackProject = systemProject || user?.projects?.[0] || null;
          setSelectedProject(fallbackProject);
        }
      };
      autoSelect();
    }
  }, [searchParams]);

  // Clear chatMessage after it's been passed to Chat component
  useEffect(() => {
    if (chatMessage && conversation) {
      // Clear after a short delay to ensure Chat component has received it
      const timer = setTimeout(() => {
        console.log('Clearing chatMessage after initial send');
        setChatMessage(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [chatMessage, conversation]);


  // Load project data from local API when selected
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedProject) {
      (async () => {
        try {
          const project = await loadProjectFromApi(selectedProject.id);
          if (project) {
            setCurrentProjectData(project);
            setProjectMemory(project.config?.memory !== undefined ? project.config.memory : true);
          }

          prevProjectIdRef.current = selectedProject.id;

          // Load skills from dedicated endpoint
          try {
            const localBase = await getLocalApiEndpoint();
            const skillsRes = await fetch(`${localBase}/v1/projects/${selectedProject.id}/skills`);
            if (skillsRes.ok) {
              const skillsData = await skillsRes.json();
              const skills = (skillsData.skills || skillsData || []).map((s: any) => ({ id: s.id, name: s.name || '', content: s.content || '', description: s.description || '' }));
              setProjectSkills(skills);
            } else {
              const skills = (selectedProject.skills || []).map((s: any) => ({ id: s.id, name: s.name || '', content: s.content || '', description: s.description || '' }));
              setProjectSkills(skills);
            }
          } catch {
            const skills = (selectedProject.skills || []).map((s: any) => ({ id: s.id, name: s.name || '', content: s.content || '', description: s.description || '' }));
            setProjectSkills(skills);
          }
        } catch {
          setProjectSkills([]);
        }
      })();
    } else {
      setCurrentProjectData(null);
      setProjectSkills([]);
      setProjectMemory(true);
    }
  }, [selectedProject]);

  // Refresh currentProjectData.documents when a document is uploaded or processing completes
  useEffect(() => {
    const refreshDocuments = async (event: any) => {
      const projectId = event.detail?.projectId;
      if (!projectId || projectId !== selectedProject?.id) return;

      try {
        const result = await documentService.getLocalDocuments(projectId);
        if (result.success && result.data) {
          const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
          setCurrentProjectData((prev: any) => prev ? { ...prev, documents: docs } : prev);
        }
      } catch (error) {
        console.error('[Home] Error refreshing documents:', error);
      }
    };

    window.addEventListener('documentUploaded', refreshDocuments);
    window.addEventListener('documentProcessingComplete', refreshDocuments);

    return () => {
      window.removeEventListener('documentUploaded', refreshDocuments);
      window.removeEventListener('documentProcessingComplete', refreshDocuments);
    };
  }, [selectedProject?.id]);

  // Restore saved tabs when project changes, or reset if none saved
  const tabsLoadedForProjectRef = useRef<string | null>(null);
  useEffect(() => {
    const projectId = selectedProject?.id;
    if (!projectId) {
      setOpenTabs([]);
      setActiveTabId(null);
      return;
    }
    // Avoid reloading if already loaded for this project
    if (tabsLoadedForProjectRef.current === projectId) return;
    tabsLoadedForProjectRef.current = projectId;

    const restoreTabs = async () => {
      const saved = await storageService.getSetting(`openTabs_${projectId}`);
      let tabs: OpenTab[];
      let activeId: string;

      if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        tabs = saved.tabs;
        activeId = saved.activeTabId || tabs[0]?.id || '';
      } else {
        // Default: open a new conversation tab
        const defaultTab: OpenTab = { id: 'conv-new', type: 'conversation', title: 'New Conversation' };
        tabs = [defaultTab];
        activeId = defaultTab.id;
      }

      setOpenTabs(tabs);
      setActiveTabId(activeId);

      // Load content for the active tab
      const activeTab = tabs.find((t) => t.id === activeId);
      if (activeTab?.type === 'conversation') {
        const convId = activeTab.id.replace('conv-', '');
        if (convId === 'new') {
          setConversation(null);
          setChatMessage(null);
        } else {
          const stored = await storageService.getConversation(convId);
          if (stored) {
            const messages = await storageService.getMessages(convId);
            setConversation({ ...stored, messages: messages || [] });
          } else {
            setConversation(null);
          }
        }
      } else {
        // Non-conversation tab is active, clear conversation
        setConversation(null);
      }
    };
    restoreTabs();
  }, [selectedProject?.id]);

  // Persist open tabs to SQLite whenever they change
  const tabsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const projectId = selectedProject?.id;
    if (!projectId) return;
    // Don't save until we've loaded for this project
    if (tabsLoadedForProjectRef.current !== projectId) return;

    // Debounce saves to avoid excessive writes
    if (tabsSaveTimerRef.current) clearTimeout(tabsSaveTimerRef.current);
    tabsSaveTimerRef.current = setTimeout(() => {
      storageService.setSetting(`openTabs_${projectId}`, {
        tabs: openTabs,
        activeTabId,
      });
    }, 300);

    return () => {
      if (tabsSaveTimerRef.current) clearTimeout(tabsSaveTimerRef.current);
    };
  }, [openTabs, activeTabId, selectedProject?.id]);

  // Load conversations for the selected project
  const loadProjectConversations = async () => {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

    const projectId = selectedProject?.id ||
      user?.projects?.find((p: any) => p.system === true)?.id;

    if (!projectId) return;

    if (isElectron) {
      // Load from SQLite — include conversations for this project
      const convos = await storageService.getConversations(projectId);

      // Also include orphaned conversations (no project_id) and assign them to this project
      const allConvos = await storageService.getConversations();
      const orphaned = allConvos.filter((c: any) => !c.project_id);
      for (const conv of orphaned) {
        conv.project_id = projectId;
        await storageService.saveConversation(conv);
      }

      // Reload after fixing orphaned conversations
      if (orphaned.length > 0) {
        const updated = await storageService.getConversations(projectId);
        setProjectConversations(updated);
      } else {
        setProjectConversations(convos);
      }
    } else {
      if (!user) return;
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

  // When SLP service comes online, re-enrich selectedProject with API data and reload conversations
  // NOTE: Initial project/conversation selection is handled by the loadProjects effect above.
  // This handler only enriches already-selected state — it does NOT navigate.
  useEffect(() => {
    const handleServiceReady = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlProjectId = params.get('project');

      if (urlProjectId) {
        const project = await loadProjectFromApi(urlProjectId);
        if (project) {
          setSelectedProject(project);
        }
      }
      loadProjectConversations();
    };

    window.addEventListener('slpServiceReady', handleServiceReady);
    return () => {
      window.removeEventListener('slpServiceReady', handleServiceReady);
    };
  }, []);

  // Ctrl+Tab / Ctrl+Shift+Tab to switch conversation tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab' && projectConversations.length > 1) {
        e.preventDefault();
        const currentIndex = projectConversations.findIndex(
          (c: any) => c.id === conversation?.id
        );
        const len = projectConversations.length;
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + len) % len
          : (currentIndex + 1) % len;
        const nextConv = projectConversations[nextIndex];
        if (nextConv) {
          const newUrl = selectedProject
            ? `/?conversation=${nextConv.id}&project=${selectedProject.id}`
            : `/?conversation=${nextConv.id}`;
          navigate(newUrl);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projectConversations, conversation, selectedProject, navigate]);

  // Clear project selection when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      setSelectedProject(null);
    };
  }, []);


  const saveProjectSkills = async (skills: Array<{ id?: string; name: string; content: string }>) => {
    if (!selectedProject) return;

    setIsSavingSkills(true);

    try {
      const localBase = await getLocalApiEndpoint();
      const projectId = selectedProject.id;
      const oldSkills = projectSkills;

      // Detect added skills (no id or new entries beyond old length)
      const added = skills.filter(s => !s.id && !oldSkills.find(o => o.content === s.content));
      // Detect deleted skills
      const deletedSkills = oldSkills.filter(o => (o as any).id && !skills.find(s => (s as any).id === (o as any).id));
      // Detect updated skills
      const updated = skills.filter(s => {
        if (!(s as any).id) return false;
        const old = oldSkills.find(o => (o as any).id === (s as any).id);
        return old && old.content !== s.content;
      });

      // Add new skills
      for (const skill of added) {
        const res = await fetch(`${localBase}/v1/projects/${projectId}/skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: skill.content }),
        });
        if (res.ok) {
          const data = await res.json();
          skill.id = data.id;
          skill.name = data.name || skill.name;
        }
      }

      // Update modified skills
      for (const skill of updated) {
        await fetch(`${localBase}/v1/projects/${projectId}/skills/${(skill as any).id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: skill.content }),
        });
      }

      // Delete removed skills
      for (const skill of deletedSkills) {
        if ((skill as any).id) {
          await fetch(`${localBase}/v1/projects/${projectId}/skills/${(skill as any).id}`, {
            method: 'DELETE',
          });
        }
      }

      // Refresh skills from server
      const listRes = await fetch(`${localBase}/v1/projects/${projectId}/skills`);
      if (listRes.ok) {
        const data = await listRes.json();
        const refreshed = (data.skills || data || []).map((s: any) => ({ id: s.id, name: s.name, content: s.content, description: s.description || '' }));
        setProjectSkills(refreshed);
        setOpenTabs((prev) =>
          prev.map((t) => {
            if (t.type !== 'skill') return t;
            if (t.id === 'skill-new') {
              const newIndex = refreshed.length - 1;
              const saved = refreshed[newIndex];
              return { ...t, id: `skill-${newIndex}`, title: saved?.name || 'Untitled Skill', data: { skill: saved, index: newIndex } };
            }
            const idx = t.data?.index;
            if (idx !== undefined && refreshed[idx]) {
              return { ...t, title: refreshed[idx].name || 'Untitled Skill', data: { ...t.data, skill: refreshed[idx] } };
            }
            return t;
          })
        );
      } else {
        setProjectSkills(skills);
      }
    } catch (ex: any) {
      console.error('Error saving project skills:', ex);
    } finally {
      setIsSavingSkills(false);
    }
  };

  const handleFolderPathChange = async (path: string) => {
    if (!selectedProject?.id) return;
    await storageService.updateProjectMeta(selectedProject.id, { folder_path: path });
    const updated = { ...currentProjectData, folder_path: path };
    setCurrentProjectData(updated);
    setSelectedProject((prev: any) => prev ? { ...prev, folder_path: path } : prev);
  };

  const handleColorChange = async (color: string) => {
    if (!selectedProject?.id) return;
    await storageService.updateProjectMeta(selectedProject.id, { color });
    setCurrentProjectData((prev: any) => prev ? { ...prev, color } : prev);
    setSelectedProject((prev: any) => prev ? { ...prev, color } : prev);
    window.dispatchEvent(new CustomEvent('projectUpdated'));
  };

  const handleRenameProject = async (name: string) => {
    if (!selectedProject?.id) return;
    const result = await projectService.updateProject(selectedProject.id, { name });
    if (result.success) {
      // Update folder_path if it matches the old project name pattern
      const oldName = selectedProject.name;
      const currentPath = currentProjectData?.folder_path || '';
      if (oldName && currentPath) {
        const oldSlug = oldName.toLowerCase().replace(/\s+/g, '_');
        const newSlug = name.toLowerCase().replace(/\s+/g, '_');
        if (currentPath.endsWith(`/${oldSlug}`) || currentPath === oldSlug) {
          const newPath = currentPath.replace(new RegExp(`${oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), newSlug);
          await storageService.updateProjectMeta(selectedProject.id, { name, folder_path: newPath });
          setCurrentProjectData((prev: any) => prev ? { ...prev, name, folder_path: newPath } : prev);
          setSelectedProject((prev: any) => prev ? { ...prev, name, folder_path: newPath } : prev);
          window.dispatchEvent(new CustomEvent('projectUpdated'));
          return;
        }
      }
      await storageService.updateProjectMeta(selectedProject.id, { name });
      setSelectedProject((prev: any) => prev ? { ...prev, name } : prev);
      setCurrentProjectData((prev: any) => prev ? { ...prev, name } : prev);
      window.dispatchEvent(new CustomEvent('projectUpdated'));
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

  // @ts-ignore - kept for future use with tab close
  const _handleDeleteConversationFromList = async (e: React.MouseEvent, convId: string) => {
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

        // Navigate to target conversation or home if none left
        if (targetConversation) {
          const projectId = selectedProject?.id;
          if (projectId) {
            navigate(`/?conversation=${targetConversation.id}&project=${projectId}`);
          }
        } else {
          // Check if any conversations remain globally
          const allRemaining = await storageService.getConversations();
          if (allRemaining.length === 0) {
            // No conversations left anywhere — go to home with system project
            navigate('/', { replace: true });
            setConversation(null);
            const systemProject = user?.projects?.find((p: any) => p.system === true);
            setSelectedProject(systemProject || user?.projects?.[0] || null);
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



  const handleOpenTab = (tab: OpenTab) => {
    // Block document tabs for system projects
    if (tab.type === 'document' && selectedProject?.system) return;

    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id);
      if (!existing) {
        return [...prev, tab];
      }
      // Update data if tab already exists
      return prev.map((t) => t.id === tab.id ? { ...t, ...tab } : t);
    });
    setActiveTabId(tab.id);
  };

  const handleTabSelect = async (tabId: string) => {
    setActiveTabId(tabId);
    const tab = openTabs.find((t) => t.id === tabId);
    if (tab?.type === 'conversation') {
      // Extract conversation ID from tab id (format: "conv-{id}" or "conv-new")
      const convId = tab.id.replace('conv-', '');
      if (convId === 'new') {
        setConversation(null);
        setChatMessage(null);
      } else if (convId !== conversation?.id) {
        const stored = await storageService.getConversation(convId);
        if (stored) {
          const messages = await storageService.getMessages(convId);
          setConversation({ ...stored, messages: messages || [] });
        }
      }
    }
  };

  const handleCloseTab = (tabId: string) => {
    const idx = openTabs.findIndex((t) => t.id === tabId);
    const newTabs = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(newTabs);
    if (activeTabId === tabId) {
      // Switch to adjacent tab or null
      if (newTabs.length > 0) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        setActiveTabId(newTabs[newIdx].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const getActiveTab = () => openTabs.find((t) => t.id === activeTabId) || null;

  // Cmd/Ctrl + 1..9 jumps to the nth open tab; Cmd/Ctrl + Tab / Shift+Tab cycles tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.altKey) return;

      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (index < openTabs.length) {
          e.preventDefault();
          handleTabSelect(openTabs[index].id);
        }
        return;
      }

      if (e.key === 'Tab' && openTabs.length > 1) {
        e.preventDefault();
        const currentIdx = openTabs.findIndex((t) => t.id === activeTabId);
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = (currentIdx + delta + openTabs.length) % openTabs.length;
        handleTabSelect(openTabs[nextIdx].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTabs, activeTabId]);

  const handleStartNewConversation = () => {
    // Clear current conversation to start fresh - conversation will be created when user sends first message
    setConversation(null);
    setChatMessage(null);
    handleOpenTab({ id: 'conv-new', type: 'conversation', title: 'New Conversation' });
    storageService.clearSelectedConversation();

    // Update URL with new=1 to signal explicit new conversation (not auto-select)
    if (selectedProject) {
      navigate(`/?project=${selectedProject.id}&new=1`);
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

    // Set state immediately and persist selection
    setConversation(newConversation);
    // Replace the "New Conversation" tab with the actual conversation tab
    setOpenTabs((prev) => prev.map((t) =>
      t.id === 'conv-new' ? { id: `conv-${newConversation.id}`, type: 'conversation' as const, title: newConversation.title || 'Untitled' } : t
    ));
    setActiveTabId(`conv-${newConversation.id}`);
    storageService.selectConversation(newConversation.id);

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

    // Update tab title if conversation title changed
    if (updatedConversation.title) {
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.id === `conv-${updatedConversation.id}` ? { ...t, title: updatedConversation.title } : t
        )
      );
    }

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
        setConversation(null);
        setChatMessage(null);
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
      // Delete from API if the document has a real (non-filesystem) ID
      const isFsOnly = documentToDelete.id?.startsWith('fs-');
      if (!isFsOnly) {
        const deleteResult = await documentService.deleteLocalDocument(selectedProject.id, documentToDelete.id);
        if (!deleteResult.success) {
          setDeleteDocError(deleteResult.error || 'Failed to delete document. Please try again.');
          return;
        }
      }

      // Delete the file from disk
      const filePath = documentToDelete._fsFile?.path || documentToDelete.source || documentToDelete.path;
      if (filePath && window.electronAPI?.deleteFile) {
        await window.electronAPI.deleteFile(filePath);
      }

      // Close the tab if this document is open
      const docTabId = `doc-${documentToDelete.id}`;
      setOpenTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== docTabId);
        if (activeTabId === docTabId && filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].id);
        } else if (activeTabId === docTabId) {
          setActiveTabId(null);
        }
        return filtered;
      });

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

      // Trigger directory re-scan so the sidebar updates
      window.dispatchEvent(new CustomEvent('documentProcessingComplete', {
        detail: { projectId: selectedProject.id },
      }));

      handleCloseDeleteDocDialog();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      setDeleteDocError(error.message || 'An error occurred while deleting the document.');
    } finally {
      setIsDeletingDoc(false);
    }
  };


  return (
    <>
      {isLoading && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: 'default',
          }}
        />
      )}
      {user && (
        <>
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

              <form onSubmit={handleDeleteProject}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                    <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24, mt: 0.5 }} />
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
                            borderColor: 'var(--sl-white-alpha-10)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'var(--sl-white-alpha-20)',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'var(--sl-brand-primary)',
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

              <form onSubmit={handleDeleteDocument}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg">
                    <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24, mt: 0.5 }} />
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
                            borderColor: 'var(--sl-white-alpha-10)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'var(--sl-white-alpha-20)',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'var(--sl-brand-primary)',
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
            {/* Chat View with 2-column layout */}
            <Box className="h-screen flex flex-col bg-black">
              <>
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
                        <div className="text-xl md:text-2xl font-bold text-white truncate">
                          {selectedProject?.name || 'General'}
                        </div>
                      </Box>
                    </Box>
                  </Box>
                </Box>

                {/* Content Tabs */}
                {(selectedProject || searchParams.get('project') || conversation || searchParams.get('conversation')) && (
                  <ContentTabs
                    tabs={openTabs}
                    activeTabId={activeTabId}
                    onTabSelect={handleTabSelect}
                    onTabClose={handleCloseTab}
                    onNewConversation={handleStartNewConversation}
                  />
                )}

                {/* Main Content Area - 2 columns */}
                <Box className="flex-1 overflow-hidden flex" style={{ height: (selectedProject || searchParams.get('project') || conversation || searchParams.get('conversation')) ? 'calc(100vh - 137px)' : 'calc(100vh - 89px)' }}>
                  {/* Main Content Area */}
                  <Box className="flex-1 overflow-hidden">
                    {(() => {
                      const currentTab = getActiveTab();
                      if (currentTab?.type === 'document' && currentTab.data) {
                        return <DocumentViewer document={currentTab.data} projectId={selectedProject?.id} onStartConversation={(selectedText, docName) => {
                          setConversation(null);
                          setChatMessage(`> From "${docName}":\n> ${selectedText.split('\n').join('\n> ')}\n\n`);
                          handleOpenTab({ id: 'conv-new', type: 'conversation', title: 'New Conversation' });
                          storageService.clearSelectedConversation();
                        }} />;
                      }
                      if (currentTab?.type === 'skill' && selectedProject) {
                        return (
                          <SkillEditor
                            key={currentTab.id}
                            selectedProject={selectedProject}
                            projectSkills={projectSkills}
                            skillIndex={currentTab.data?.index ?? 0}
                            isSavingSkills={isSavingSkills}
                            onSaveSkills={saveProjectSkills}
                            isNew={currentTab.data?.isNew}
                          />
                        );
                      }
                      if (currentTab?.type === 'mcp' && currentTab.data) {
                        return <McpTab server={currentTab.data} />;
                      }
                      // Default: conversation view
                      return (
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
                      );
                    })()}
                  </Box>

                  {/* Right Sidebar */}
                  <RightSidebar
                    selectedProject={selectedProject}
                    currentProjectData={currentProjectData}
                    onAddDocument={() => setShowFileUploadDialog(true)}
                    onDeleteDocument={handleOpenDeleteDocDialog}
                    onFolderPathChange={handleFolderPathChange}
                    onColorChange={handleColorChange}
                    onRenameProject={handleRenameProject}
                    user={user}
                    activeTab={getActiveTab()?.type || 'conversation'}
                    onTabChange={handleOpenTab}
                    projectSkills={projectSkills}
                    onSaveSkills={saveProjectSkills}
                  />
                </Box>
              </>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}
