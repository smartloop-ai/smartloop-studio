'use client';

import '../styles/home.css';
import '../styles/markdown-editor.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Dialog, IconButton, CircularProgress, Typography, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DocumentUploadDialog from '@/app/components/document-upload-dialog';
import SkillEditor from '@/app/components/skill-editor';
import RightSidebar from '@/app/components/right-sidebar';
import 'easymde/dist/easymde.min.css';
import { userService } from '@/app/services/user.service';
import { conversationService } from '@/app/services/conversation.service';
import { useProjectContext } from '@/app/contexts/ProjectContext';
import { documentService } from '@/app/services/document.service';
import { storageService } from '@/app/services/storage.service';
import { dialogStyles } from '@/app/shared/utils';
import { DEFAULT_COLOR, LEGACY_PINK, getLocalApiEndpoint } from '@/app/constants';
import { bootstrapProgress } from '@/app/shared/BootstrapProgress';
import Chat from '@/app/components/chat';
import ContentTabs, { OpenTab } from '@/app/components/conversation-tabs';
import McpTab from '@/app/components/mcp-tab';
import DocumentViewer from '@/app/components/document-viewer';
import UpdatePill from '@/app/components/update-pill';
import KeybindsDialog from '@/app/components/keybinds-dialog';
import { useAuthContext } from '@/app/contexts/AuthContext';

// Deprecated built-in skills hidden everywhere (compared by normalized name).
// Kept in sync with the right sidebar so skill list indices stay aligned.
const isDeprecatedSkill = (name: string) =>
  (name || '').replace(/[\s_-]+/g, '').toLowerCase() === 'fetchurl';
const mapSkills = (list: any[]) =>
  list
    .map((s: any) => ({ id: s.id || s.name, name: s.name || '', content: s.content || '', description: s.description || '' }))
    .filter((s) => s.name && !isDeprecatedSkill(s.name));

export default function Home() {
  const [user, setUser] = useAuthContext();
  const {
    projects: projectsList,
    selectedProject,
    selectProject,
    updateProject: updateProjectCtx,
    deleteProject: deleteProjectCtx,
    refresh: refreshProjects,
    ready: projectsReady,
  } = useProjectContext();
  const [isLoading, setIsLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState<Array<{ file_id: string; name: string }>>([]);
  const [conversation, setConversation] = useState<any>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeybinds, setShowKeybinds] = useState(false);
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
  const [searchConfigured, setSearchConfigured] = useState<boolean>(false);
  // Primary orchestrator model for the active project — passed to the sidebar's
  // Models panel so it can filter itself out of the auxiliary list.
  const [currentModel, setCurrentModel] = useState<string>('');

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
      setCurrentModel(modelName);

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
    // Keyed on the fields this effect actually reads, not the object: any
    // project refetch (e.g. after saving a setting) hands back a new object
    // reference, which would otherwise re-run the health + /models/load round
    // trip for a project that never changed.
  }, [selectedProject?.id, selectedProject?.model_name]);

  // Check whether the web search provider (Brave) is configured so the chat
  // toggle can be disabled when no API key is registered.
  useEffect(() => {
    const checkSearchProvider = async () => {
      try {
        const api = (window as any).electronAPI;
        const baseUrl = api?.getLocalApiUrl ? await api.getLocalApiUrl() : null;
        if (!baseUrl) return;
        const res = await fetch(`${baseUrl}/v1/search/provider`);
        if (res.ok) {
          const data = await res.json();
          setSearchConfigured(!!data.configured);
        }
      } catch {
        setSearchConfigured(false);
      }
    };
    checkSearchProvider();
  }, []);

  // Project list + selection + bootstrap (auto-create/auto-select) are owned by
  // ProjectContext. Here we only dismiss the loader once the context has
  // finished its initial load. `selectedProject` is derived from the URL.
  useEffect(() => {
    if (projectsReady) setIsLoading(false);
  }, [projectsReady]);

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
        // Project is derived from the URL by ProjectContext — no need to set it here.
      };

      loadAndSetConversation();
    } else if (urlProjectId) {
      const isExplicitNew = searchParams.get('new') === '1';
      (async () => {
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
      // No URL params — restore the last-viewed project (fallback: system, then
      // first). Keyed on selected_project_id, not conversation recency. Selecting
      // ?project=X then auto-selects X's latest conversation via the branch above.
      // ProjectContext.reconcile mirrors this on its own triggers.
      const restoreProject = async () => {
        const savedId = await storageService.getSetting('selected_project_id');
        const target = (savedId && projectsList.find((p: any) => p.id === savedId))
          ?? projectsList.find((p: any) => p.system === true)
          ?? projectsList[0];
        if (target) selectProject(target.id, { replace: true });
        else { setConversation(null); setChatMessage(null); } // list not ready; reconcile will select
      };
      restoreProject();
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


  // Load project data from local API when selected project ID changes
  useEffect(() => {
    if (!selectedProject?.id) {
      setCurrentProjectData(null);
      setProjectSkills([]);
      setProjectMemory(true);
      return;
    }

    let cancelled = false;
    const projectId = selectedProject.id;

    (async () => {
      try {
        // selectedProject is the enriched project derived from the context list.
        const project = selectedProject;
        if (cancelled) return;
        if (project) {
          setCurrentProjectData(project);
          setProjectMemory(project.config?.memory !== undefined ? project.config.memory : true);
        }

        // Load skills from the API
        try {
          const base = await getLocalApiEndpoint();
          const res = await fetch(`${base}/v1/projects/${projectId}/skills`);
          if (cancelled) return;
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data?.skills ?? []);
            setProjectSkills(mapSkills(list));
          } else {
            // Nothing on disk — fetch from API and write to disk so readSkillsDir works going forward
            const localBase = await getLocalApiEndpoint();
            const skillsRes = await fetch(`${localBase}/v1/projects/${projectId}/skills`);
            if (cancelled) return;
            if (skillsRes.ok) {
              const data = await skillsRes.json();
              const apiSkills: any[] = data.skills || data || [];
              for (const s of apiSkills) {
                if (s.id && s.content) {
                  const hasFrontmatter = /^---[\s\S]*?name:/m.test(s.content);
                  const hasHeading = /^#\s/m.test(s.content);
                  let fileContent = s.content;
                  if (!hasFrontmatter && !hasHeading) {
                    const fm = [`---`, `name: ${s.name || s.id}`];
                    if (s.description) fm.push(`description: ${s.description}`);
                    fm.push(`---`, ``);
                    fileContent = fm.join('\n') + '\n' + s.content;
                  }
                  await window.electronAPI!.writeTextFile(`${project.folder_path}/skills/${s.id}/SKILL.md`, fileContent);
                }
              }
              setProjectSkills(mapSkills(apiSkills));
            } else {
              setProjectSkills([]);
            }
          }
        } catch {
          if (cancelled) return;
          setProjectSkills([]);
        }
      } catch {
        if (cancelled) return;
        setProjectSkills([]);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedProject?.id]);

  // Re-sync the per-project web-search flag whenever the project list refreshes.
  // The loader above only re-runs on an id change, so without this a value that
  // changed on the backend (or a project revisited after switching away) would
  // keep showing whatever currentProjectData was last set to.
  useEffect(() => {
    const enabled = selectedProject?.web_search_enabled;
    if (enabled === undefined) return;
    setCurrentProjectData((prev: any) =>
      prev && prev.id === selectedProject?.id && prev.web_search_enabled !== enabled
        ? { ...prev, web_search_enabled: enabled }
        : prev
    );
  }, [selectedProject?.id, selectedProject?.web_search_enabled]);

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

    // Clear tabs synchronously before async restore to prevent the save effect
    // from persisting stale tabs from the previous project under the new project's key
    setOpenTabs([]);
    setActiveTabId(null);

    const restoreTabs = async () => {
      const saved = await storageService.getSetting(`openTabs_${projectId}`);
      let tabs: OpenTab[];
      let activeId: string;

      if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
        // Deduplicate tabs by id
        const seen = new Set<string>();
        tabs = saved.tabs.filter((t: OpenTab) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });

        // Validate conversation tabs belong to this project
        const convos = await storageService.getConversations(projectId);
        const convoIds = new Set(convos.map((c: any) => c.id));
        tabs = tabs.filter((t: OpenTab) => {
          if (t.type !== 'conversation') return false; // drop document/skill/mcp tabs
          const convId = t.id.replace('conv-', '');
          return convId === 'new' || convoIds.has(convId);
        });

        if (tabs.length === 0) {
          const defaultTab: OpenTab = { id: 'conv-new', type: 'conversation', title: 'New Conversation' };
          tabs = [defaultTab];
        }
        activeId = (saved.activeTabId && tabs.some((t: OpenTab) => t.id === saved.activeTabId)) ? saved.activeTabId : tabs[0]?.id || '';
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
      projectsList.find((p: any) => p.system === true)?.id;

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

  // When SLP service comes online, reload conversations. Project re-enrichment
  // is handled by ProjectContext (selectedProject is derived from its list).
  useEffect(() => {
    const handleServiceReady = () => { loadProjectConversations(); };
    window.addEventListener('slpServiceReady', handleServiceReady);
    return () => {
      window.removeEventListener('slpServiceReady', handleServiceReady);
    };
  }, []);

  // Ctrl+Tab cycles conversations within the project; Ctrl+Shift+Tab cycles
  // projects. Ctrl (not Cmd) on purpose — Cmd+Tab is the macOS app switcher.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return;
      e.preventDefault();

      if (e.shiftKey) {
        if (projectsList.length > 1) {
          const currentIndex = projectsList.findIndex((p: any) => p.id === selectedProject?.id);
          const nextProject = projectsList[(currentIndex + 1) % projectsList.length];
          if (nextProject && nextProject.id !== selectedProject?.id) selectProject(nextProject.id);
        }
        return;
      }

      if (projectConversations.length > 1) {
        const currentIndex = projectConversations.findIndex(
          (c: any) => c.id === conversation?.id
        );
        const nextConv = projectConversations[(currentIndex + 1) % projectConversations.length];
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
  }, [projectConversations, conversation, selectedProject, navigate, projectsList, selectProject]);



  const saveProjectSkills = async (skills: Array<{ id?: string; name: string; content: string }>) => {
    if (!selectedProject) return;

    setIsSavingSkills(true);

    try {
      const projectId = selectedProject.id;
      const oldSkills = projectSkills;
      const localBase = await getLocalApiEndpoint();
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

      // Add new skills via the API (API handles file system writes)
      for (const skill of added) {
        const res = await fetch(`${localBase}/v1/projects/${projectId}/skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: skill.content }),
        });
        if (res.ok) {
          const data = await res.json();
          skill.id = data?.name || data?.id || data?.skill_id;
        }
      }

      // Update modified skills via the API
      for (const skill of updated) {
        await fetch(`${localBase}/v1/projects/${projectId}/skills/${(skill as any).id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: skill.content }),
        });
      }

      // Delete removed skills via the API and clean up any SQLite folder entry
      for (const skill of deletedSkills) {
        if ((skill as any).id) {
          await fetch(`${localBase}/v1/projects/${projectId}/skills/${(skill as any).id}`, {
            method: 'DELETE',
          });
          storageService.deleteFolder((skill as any).id).catch(() => {});
        }
      }

      // Refresh skills from the API after writes are done
      let refreshed = skills;
      try {
        const res = await fetch(`${localBase}/v1/projects/${projectId}/skills`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.skills ?? []);
          refreshed = mapSkills(list);
        }
      } catch { /* fallback to local skills array */ }
      setProjectSkills(refreshed);
      window.dispatchEvent(new CustomEvent('skillsSaved'));
      const deletedIndices = new Set(deletedSkills.map((s: any) => oldSkills.indexOf(s)));
      const deletedTabIds = new Set(deletedSkills.map((s: any) => {
        const idx = oldSkills.indexOf(s);
        return `skill-${s.id || idx}`;
      }));
      setOpenTabs((prev) => {
        const filtered = prev.filter((t) => {
          if (t.type !== 'skill') return true;
          if (deletedTabIds.has(t.id)) return false;
          const idx = t.data?.index;
          if (idx !== undefined && deletedIndices.has(idx)) return false;
          return true;
        });
        return filtered.map((t) => {
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
        });
      });
      setActiveTabId((prevId) => {
        if (!prevId) return prevId;
        const activeTab = openTabs.find((t) => t.id === prevId);
        if (!activeTab) return prevId;
        const isDeleted = deletedTabIds.has(prevId) ||
          (activeTab.type === 'skill' && activeTab.data?.index !== undefined && deletedIndices.has(activeTab.data.index));
        if (!isDeleted) return prevId;
        const remaining = openTabs.filter((t) =>
          !deletedTabIds.has(t.id) &&
          !(t.type === 'skill' && t.data?.index !== undefined && deletedIndices.has(t.data.index))
        );
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      });
    } catch (ex: any) {
      console.error('Error saving project skills:', ex);
    } finally {
      setIsSavingSkills(false);
    }
  };

  const refreshSkills = useCallback(async () => {
    if (!selectedProject?.id) return;
    try {
      const base = await getLocalApiEndpoint();
      const res = await fetch(`${base}/v1/projects/${selectedProject.id}/skills`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.skills ?? []);
        setProjectSkills(mapSkills(list));
      }
    } catch {
      // silent – keep existing skills on failure
    }
  }, [selectedProject?.id]);

  const handleFolderPathChange = async (path: string) => {
    if (!selectedProject?.id) return;
    // Color/folder are UI-only metadata (SQLite). Update meta, then refresh the
    // context list so the derived selectedProject picks up the change.
    await storageService.updateProjectMeta(selectedProject.id, { folder_path: path });
    setCurrentProjectData((prev: any) => prev ? { ...prev, folder_path: path } : prev);
    await refreshProjects();
  };

  const handleColorChange = async (color: string) => {
    if (!selectedProject?.id) return;
    await storageService.updateProjectMeta(selectedProject.id, { color });
    setCurrentProjectData((prev: any) => prev ? { ...prev, color } : prev);
    await refreshProjects();
  };

  const handleWebSearchChange = async (enabled: boolean) => {
    if (!selectedProject?.id || !searchConfigured) return;
    // Web search is a project-level flag owned by the SLP backend; patch it
    // through the API so the agent honors it on the next chat turn.
    // Field name must match the API schema (`web_search_enabled`) — anything
    // else is dropped by the PATCH and the toggle silently does nothing.
    const result = await updateProjectCtx(selectedProject.id, { web_search_enabled: enabled });
    if (result.success) {
      setCurrentProjectData((prev: any) => prev ? { ...prev, web_search_enabled: enabled } : prev);
    }
  };

  // Flip web search for the current project. Backs both the Cmd/Ctrl+Shift+S
  // shortcut and the status bar toggle in chat.tsx; undefined counts as ON, so
  // the first press on a pre-flag project turns it off rather than re-enabling.
  const toggleWebSearch = () => {
    if (!selectedProject?.id || !searchConfigured) return;
    handleWebSearchChange(currentProjectData?.web_search_enabled === false);
  };

  const handleRenameProject = async (name: string) => {
    if (!selectedProject?.id) return;
    // System projects (e.g. General) keep their name — the backend and several
    // lookups key off it, so renaming is disabled everywhere.
    if (selectedProject.system === true) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    // Name goes through the API; the context refreshes off the projects-changed broadcast.
    const result = await updateProjectCtx(selectedProject.id, { name: trimmedName });
    if (result.success) {
      const folderPath = result.data?.folder_path;
      setCurrentProjectData((prev: any) => prev ? { ...prev, name: trimmedName, ...(folderPath ? { folder_path: folderPath } : {}) } : prev);
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
            // No conversations left anywhere — select the system project so Chat
            // has a valid context.
            setConversation(null);
            const target = projectsList.find((p: any) => p.system === true) || projectsList[0];
            if (target) selectProject(target.id, { replace: true });
            else navigate('/', { replace: true });
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
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id);
      if (existing) {
        return prev.map((t) => t.id === tab.id ? { ...t, ...tab } : t);
      }
      // For conversation tabs, remove conv-new if opening a real conversation
      let updated = prev;
      if (tab.type === 'conversation' && tab.id !== 'conv-new') {
        updated = prev.filter((t) => t.id !== 'conv-new');
      }
      return [...updated, tab];
    });
    setActiveTabId(tab.id);
  };

  // Create a new skill from the standard template (name filled from the "/command")
  // and open it in the editor. If a skill with the same slug already exists we just
  // open that one instead of adding a duplicate.
  const createSkillFromTemplate = async (rawName: string) => {
    if (!selectedProject?.id) return;
    const slug = rawName.trim().replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug) return;
    const title = slug.split('-').filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const content =
`---
name: ${slug}
description: A clear description of what this skill does and when to use it
---

# ${title}

[Add your instructions here that the model will follow when this skill is active]

## Examples
- Example usage 1
- Example usage 2

## Guidelines
- Guideline 1
`;
    const norm = (s: string) => (s || '').replace(/[\s_-]+/g, '').toLowerCase();
    try {
      const base = await getLocalApiEndpoint();
      const fetchList = async () => {
        const r = await fetch(`${base}/v1/projects/${selectedProject.id}/skills`);
        if (!r.ok) return [];
        const d = await r.json();
        return mapSkills(Array.isArray(d) ? d : (d?.skills ?? []));
      };

      const before = await fetchList();
      const exists = before.find((s: any) => norm(s.name) === norm(slug));
      if (!exists) {
        const res = await fetch(`${base}/v1/projects/${selectedProject.id}/skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) return;
      }

      const list = await fetchList();
      setProjectSkills(list);
      window.dispatchEvent(new CustomEvent('skillsSaved'));
      const idx = list.findIndex((s: any) => norm(s.name) === norm(slug));
      if (idx >= 0) {
        handleOpenTab({
          id: `skill-${list[idx].id || idx}`,
          type: 'skill',
          title: list[idx].name || 'Untitled Skill',
          data: { index: idx },
        } as OpenTab);
      }
    } catch (ex) {
      console.error('Error creating skill from template:', ex);
    }
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
        // `new=1` stops the URL effect from auto-selecting the latest conversation.
        if (selectedProject) navigate(`/?project=${selectedProject.id}&new=1`, { replace: true });
      } else {
        // Point the URL at the tab so a reload lands here. `replace` because
        // stepping through tabs shouldn't pile up history entries. The URL effect
        // re-reads the conversation and persists the selection; the local load
        // below still runs so the content swaps without waiting a round trip.
        navigate(
          selectedProject
            ? `/?conversation=${convId}&project=${selectedProject.id}`
            : `/?conversation=${convId}`,
          { replace: true }
        );
        if (convId !== conversation?.id) {
          const stored = await storageService.getConversation(convId);
          if (stored) {
            const messages = await storageService.getMessages(convId);
            setConversation({ ...stored, messages: messages || [] });
          }
        }
      }
    }
    // Document/skill tabs deliberately leave the URL alone: the only URL that
    // describes them is `?project=<id>`, and the URL effect treats that as
    // "open this project" and redirects to its latest conversation — which would
    // bounce the user straight back off the tab they just selected.
  };

  const handleCloseTab = (tabId: string) => {
    const idx = openTabs.findIndex((t) => t.id === tabId);
    const closedTab = openTabs[idx];
    const newTabs = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(newTabs);

    // If it's a real conversation tab, silently delete it — same behavior as the
    // sidebar delete (handles local + remote and dispatches conversationDeleted),
    // just without the confirmation dialog.
    if (closedTab?.type === 'conversation') {
      const convId = tabId.replace('conv-', '');
      if (convId && convId !== 'new') {
        conversationService.deleteConversation(convId).catch(() => { });
        setProjectConversations(prev => prev.filter((c: any) => c.id !== convId));
      }
    }

    if (activeTabId === tabId) {
      // Switch to adjacent tab or null
      if (newTabs.length > 0) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        const nextTab = newTabs[newIdx];
        setActiveTabId(nextTab.id);

        // Update URL to reflect the new active tab so closed tabs don't reappear on reload
        if (nextTab.type === 'conversation') {
          const convId = nextTab.id.replace('conv-', '');
          if (convId === 'new') {
            if (selectedProject) {
              navigate(`/?project=${selectedProject.id}&new=1`, { replace: true });
            }
          } else if (selectedProject) {
            navigate(`/?conversation=${convId}&project=${selectedProject.id}`, { replace: true });
          } else {
            navigate(`/?conversation=${convId}`, { replace: true });
          }
        } else if (selectedProject) {
          navigate(`/?project=${selectedProject.id}`, { replace: true });
        }
      } else {
        setActiveTabId(null);
        if (selectedProject) {
          navigate(`/?project=${selectedProject.id}`, { replace: true });
        }
      }
    }
  };

  const getActiveTab = () => openTabs.find((t) => t.id === activeTabId) || null;

  // Cmd/Ctrl+W closes the active tab (Chrome-style). The key is claimed in the
  // main process because macOS's app menu owns Cmd+W — see electron/main.js.
  // Kept behind a ref so the IPC listener is registered once but always runs the
  // current handler, which closes over activeTabId / openTabs.
  const closeActiveTabRef = useRef<() => void>(() => { });
  closeActiveTabRef.current = () => { if (activeTabId) handleCloseTab(activeTabId); };

  // Same reasoning for tab selection: handleTabSelect skips reloading when the
  // target is already the open conversation, so it must see the CURRENT
  // conversation. The keyboard effect below re-registers on activeTabId, which
  // changes before the conversation finishes loading — a handler captured there
  // holds a pre-switch conversation and wrongly no-ops when you step back to the
  // tab it names. Clicks are immune (React rebinds onClick every render).
  const selectTabRef = useRef<(tabId: string) => void>(() => { });
  selectTabRef.current = handleTabSelect;

  useEffect(() => {
    window.electronAPI?.onCloseTabShortcut?.(() => closeActiveTabRef.current());
    return () => window.electronAPI?.removeCloseTabShortcutListener?.();
  }, []);

  // Shift+? opens the keybinds list — the one hint the chat status bar has
  // room for. Skipped while typing so a literal "?" still reaches the input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      setShowKeybinds((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cmd/Ctrl+T opens a new conversation tab; Cmd/Ctrl + 1..9 jumps to the nth
  // open tab; Cmd/Ctrl+Shift+[ / ] steps through them. Ctrl+Tab cycling is
  // handled by the conversation/project switcher above.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      // Cmd/Ctrl+Alt+S toggles web search for the current project. Alt rather
      // than Shift because Cmd/Ctrl+Shift+S opens the Skills rail section — the
      // Cmd/Ctrl+Shift family is reserved for panels (right-sidebar.tsx).
      // Checked before the altKey bail-out below, which guards the rest.
      if (e.code === 'KeyS' && e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleWebSearch();
        return;
      }

      if (e.altKey) return;

      // Matched on e.code so a non-QWERTY layout still triggers on the T key.
      if (e.code === 'KeyT' && !e.shiftKey) {
        e.preventDefault();
        handleStartNewConversation();
        return;
      }

      // Cmd/Ctrl+Shift+[ / ] steps to the previous / next open tab, wrapping at
      // both ends — the binding browsers use for tab navigation. Matched on
      // e.code because Shift+bracket reports '{' / '}' as e.key.
      if (e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault();
        if (openTabs.length === 0) return;
        const currentIndex = openTabs.findIndex((t) => t.id === activeTabId);
        // No active tab yet — step in from the near end rather than nowhere.
        if (currentIndex === -1) {
          selectTabRef.current(openTabs[0].id);
          return;
        }
        if (openTabs.length < 2) return;
        const delta = e.code === 'BracketLeft' ? -1 : 1;
        const nextIndex = (currentIndex + delta + openTabs.length) % openTabs.length;
        selectTabRef.current(openTabs[nextIndex].id);
        return;
      }

      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (index < openTabs.length) {
          e.preventDefault();
          selectTabRef.current(openTabs[index].id);
        }
        return;
      }

    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTabs, activeTabId, selectedProject?.id, currentProjectData?.web_search_enabled]);

  // Put the caret in the composer. Chat owns the textarea, so reach it by name the
  // same way the quote-selection flow does (chat.tsx) instead of threading a ref
  // down through Chat -> MessageInput. Retries a few frames because switching from
  // a document/skill tab mounts Chat fresh, so the textarea isn't there yet.
  const focusComposer = (framesLeft = 5) => {
    requestAnimationFrame(() => {
      const el = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement | null;
      if (el) { el.focus(); return; }
      if (framesLeft > 0) focusComposer(framesLeft - 1);
    });
  };

  const handleStartNewConversation = () => {
    // Clear current conversation to start fresh - conversation will be created when user sends first message
    setConversation(null);
    setChatMessage(null);
    handleOpenTab({ id: 'conv-new', type: 'conversation', title: 'New Conversation' });
    storageService.clearSelectedConversation();
    focusComposer();

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
      // Delete this project's conversations first (server + SQLite + events).
      const projectConvos = await storageService.getConversations(selectedProject.id);
      for (const conv of projectConvos) {
        try {
          await conversationService.deleteConversation(conv.id);
        } catch (error) {
          console.error(`Error deleting conversation ${conv.id}:`, error);
        }
      }

      // Delete the project via ProjectContext. Main cascades the remaining
      // SQLite cleanup and broadcasts projects-changed, which triggers the
      // context to refresh + auto-select a remaining project.
      const result = await deleteProjectCtx(selectedProject.id);

      if (result.success) {
        // Close dialog
        setShowDeleteProjectDialog(false);
        setDeleteProjectConfirm('');

        // Reset conversation/chat state; the context reconcile selects a
        // remaining project once the URL clears.
        navigate('/');
        setConversation(null);
        setChatMessage(null);
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
    const color = project?.color;
    if (!color || color === LEGACY_PINK) return DEFAULT_COLOR;
    return color;
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
      const docId = documentToDelete.id;
      const isFsOnly = docId?.startsWith('fs-');

      // Try to delete the document from the API backend
      if (!isFsOnly) {
        try {
          await documentService.deleteLocalDocument(selectedProject.id, docId);
        } catch (err) {
          console.warn('API delete failed, proceeding with local cleanup:', err);
        }
      }

      // Clean up all SQLite records for this document
      await storageService.deleteDocumentStatus(docId);
      await storageService.clearDocumentFolder(docId);

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

      // Remove the deleted document from the local project detail view.
      setCurrentProjectData((prev: any) =>
        prev ? { ...prev, documents: (prev.documents || []).filter((doc: any) => doc.id !== documentToDelete.id) } : prev
      );

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
            folderPath={currentProjectData?.folder_path || selectedProject?.folder_path}
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
              <h3 className="text-sl-text-primary font-semibold text-lg mb-3">
                Delete Conversation?
              </h3>
              <p className="text-sl-text-muted text-sm mb-6">
                Are you sure you want to delete this conversation? This action cannot be undone.
              </p>
              <Box className="flex items-center gap-3">
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary rounded-lg border border-sl-border-default transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConversation}
                  disabled={isDeleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sl-status-error hover:opacity-90 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                <h3 className="text-sl-text-primary text-xl font-semibold">Delete Project</h3>
                <IconButton
                  onClick={() => !isDeletingProject && setShowDeleteProjectDialog(false)}
                  sx={{
                    color: 'var(--sl-text-disabled)',
                    '&:hover': {
                      color: 'var(--sl-text-primary)',
                      bgcolor: 'var(--sl-bg-surface-1)'
                    },
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>

              <form onSubmit={handleDeleteProject}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--sl-danger-alpha-10)', border: '1px solid var(--sl-danger-alpha-30)' }}>
                    <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24, mt: 0.5 }} />
                    <Box>
                      <Typography className="text-sl-status-error font-medium mb-1">
                        Warning: This action cannot be undone
                      </Typography>
                      <Typography className="text-sl-text-tertiary text-sm">
                        Deleting "{selectedProject?.name || 'this project'}" will permanently remove all documents, conversations, and associated data.
                      </Typography>
                    </Box>
                  </Box>

                  <Box>
                    <Typography className="text-sl-text-tertiary text-sm mb-3">
                      Please type <span className="px-2 py-0.5 bg-sl-status-error text-white font-mono text-xs rounded">delete</span> to confirm:
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
                          color: 'var(--sl-text-primary)',
                          bgcolor: 'var(--sl-bg-surface-1)',
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
                      }}
                    />
                    {deleteProjectError && (
                      <Typography className="text-sl-status-error text-sm mt-2">
                        {deleteProjectError}
                      </Typography>
                    )}
                  </Box>

                  <Box className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteProjectDialog(false)}
                      disabled={isDeletingProject}
                      className="flex-1 px-4 py-2.5 bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary rounded-lg border border-sl-border-default transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDeletingProject || deleteProjectConfirm.toLowerCase() !== 'delete'}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sl-status-error hover:opacity-90 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                <h3 className="text-sl-text-primary text-xl font-semibold">Delete Document</h3>
                <IconButton
                  onClick={() => !isDeletingDoc && handleCloseDeleteDocDialog()}
                  sx={{
                    color: 'var(--sl-text-disabled)',
                    '&:hover': {
                      color: 'var(--sl-text-primary)',
                      bgcolor: 'var(--sl-bg-surface-1)'
                    },
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>

              <form onSubmit={handleDeleteDocument}>
                <Box className="space-y-4">
                  <Box className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--sl-danger-alpha-10)', border: '1px solid var(--sl-danger-alpha-30)' }}>
                    <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24, mt: 0.5 }} />
                    <Box>
                      <Typography className="text-sl-status-error font-medium mb-1">
                        Warning: This action cannot be undone
                      </Typography>
                      <Typography className="text-sl-text-tertiary text-sm">
                        Deleting "{documentToDelete?.filename || documentToDelete?.name || 'this document'}" will permanently remove it from the project.
                      </Typography>
                    </Box>
                  </Box>

                  <Box>
                    <Typography className="text-sl-text-tertiary text-sm mb-3">
                      Please type <span className="px-2 py-0.5 bg-sl-status-error text-white font-mono text-xs rounded">delete</span> to confirm:
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
                          color: 'var(--sl-text-primary)',
                          bgcolor: 'var(--sl-bg-surface-1)',
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
                      }}
                    />
                    {deleteDocError && (
                      <Typography className="text-sl-status-error text-sm mt-2">
                        {deleteDocError}
                      </Typography>
                    )}
                  </Box>

                  <Box className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseDeleteDocDialog}
                      disabled={isDeletingDoc}
                      className="flex-1 px-4 py-2.5 bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary rounded-lg border border-sl-border-default transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isDeletingDoc || deleteDocConfirm.toLowerCase() !== 'delete'}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sl-status-error hover:opacity-90 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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


          <KeybindsDialog open={showKeybinds} onClose={() => setShowKeybinds(false)} />

          <Box className="min-h-screen bg-sl-bg-base text-sl-text-primary">
            {/* Chat View with 2-column layout */}
            <Box className="h-screen flex flex-col bg-sl-bg-base">
              <>
                {/* Chat Header - matches project page style */}
                <Box className="flex-none px-4 pb-4 pt-0">
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
                        {selectedProject && selectedProject.system !== true ? (
                          <input
                            key={`${selectedProject.id}-${selectedProject.name}`}
                            defaultValue={selectedProject.name}
                            onBlur={(e) => {
                              e.currentTarget.style.borderBottomColor = 'transparent';
                              const trimmed = e.target.value.trim();
                              if (trimmed && trimmed !== selectedProject.name) {
                                handleRenameProject(trimmed);
                              } else {
                                e.target.value = selectedProject.name;
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                (e.target as HTMLInputElement).value = selectedProject.name;
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="text-xl md:text-2xl font-bold text-sl-text-primary bg-transparent border-none outline-none w-full truncate cursor-text hover:opacity-80 focus:opacity-100 focus:border-b"
                            style={{ caretColor: 'var(--sl-brand-primary)', borderColor: 'transparent' }}
                            onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--sl-brand-primary)')}
                          />
                        ) : (
                          <div className="text-xl md:text-2xl font-bold text-sl-text-primary truncate">
                            {selectedProject?.name || 'General'}
                          </div>
                        )}
                      </Box>
                    </Box>
                    {/* App-update badge — top-right, opposite the project name */}
                    <UpdatePill />
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
                  <Box className="flex-1 min-h-0 overflow-hidden">
                    {(() => {
                      const currentTab = getActiveTab();
                      if (currentTab?.type === 'document' && currentTab.data) {
                        return <DocumentViewer document={currentTab.data} projectId={selectedProject?.id} />;
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
                          onOpenTab={handleOpenTab}
                          onCreateSkill={createSkillFromTemplate}
                          webSearchEnabled={currentProjectData?.web_search_enabled}
                          searchConfigured={searchConfigured}
                          onWebSearchChange={handleWebSearchChange}
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
                    model={currentModel}
                    activeTab={getActiveTab()?.type || 'conversation'}
                    onTabChange={handleOpenTab}
                    projectSkills={projectSkills}
                    onSaveSkills={saveProjectSkills}
                    onRefreshSkills={refreshSkills}
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
