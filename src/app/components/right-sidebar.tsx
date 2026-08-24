import { Box, IconButton, CircularProgress, Tooltip, TextField, InputAdornment } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CircleIcon from '@mui/icons-material/Circle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import CheckIcon from '@mui/icons-material/Check';
import NotesIcon from '@mui/icons-material/Notes';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AuxiliaryModelsPanel from './auxiliary-models-panel';
import { storageService } from '@/app/services/storage.service';
import { useAppStatus } from '@/app/contexts/AppStatusContext';
import { useModelStatus } from '@/app/contexts/ModelStatusContext';
import { useThemeContext } from '@/app/contexts/ThemeContext';
import PixelRailIcon from './pixel-rail-icons';
import McpServerItem from './mcp-server-item';
import ProjectInstructionsDialog from './project-instructions-dialog';
import McpCatalogItem from './mcp-catalog-item';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import '../styles/home.css';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { documentService } from '@/app/services/document.service';
import { mcpServerService, McpServer, McpCatalogEntry, normalizeMcpUrl, getMcpServerUrl, getMcpServerTools, buildTagColorMap } from '@/app/services/mcp-server.service';
import { PROJECT_COLORS, getLocalApiEndpoint } from '@/app/constants';


import { OpenTab } from './conversation-tabs';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
  onFolderPathChange?: (path: string) => void;
  onColorChange?: (color: string) => void;
  onRenameProject?: (name: string) => void;
  onInstructionsChange?: (instructions: string) => Promise<void> | void;
  user: any;
  model?: string;
  activeTab: string;
  onTabChange?: (tab: OpenTab) => void;
  projectSkills?: Array<{ id?: string; name: string; content: string; description?: string }>;
  onSaveSkills?: (skills: Array<{ id?: string; name: string; content: string; description?: string }>) => void;
  onRefreshSkills?: () => void;
}

// Renders a theme's embedded rail SVG. The markup is sanitized at parse time
// (see theme-parse.ts) and uses currentColor, so it inherits the rail's states.
function ThemeRailIcon({ svg, size = 18 }: { svg: string; size?: number }) {
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const getSkillPreviewText = (content: string, description?: string) => {
  const source = (description && description.trim()) ? description : content;
  const withoutFrontMatter = source.replace(/^---[\s\S]*?---\s*/m, '').trim();
  const lines = withoutFrontMatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const preview = lines.slice(0, 3).join('\n');
  return preview.length > 240 ? `${preview.slice(0, 240).trimEnd()}…` : preview;
};

// Deprecated built-in skills hidden from the UI (compared by normalized name).
const DEPRECATED_SKILL_NAMES = new Set(['fetchurl']);
const normSkillName = (s: string) => (s || '').replace(/[\s_-]+/g, '').toLowerCase();

/** Map a skills API response to the local shape, dropping deprecated skills. */
const mapProjectSkills = (data: any) => {
  const list = Array.isArray(data) ? data : (data?.skills ?? []);
  return list
    .map((s: any) => ({ id: s.id || s.name, name: s.name || '', content: s.content || '', description: s.description || '' }))
    .filter((s: any) => s.name && !DEPRECATED_SKILL_NAMES.has(normSkillName(s.name)));
};

type RailSection = 'models' | 'documents' | 'mcp' | 'skills' | 'settings';

// Cmd/Ctrl+Shift+<first letter of the section's label> opens a rail section —
// the VS Code convention, and unlike the digits these replaced, Shift+3/4 no
// longer collide with the macOS screenshot hotkeys. 'mcp' keys off its UI
// label, Connections. Project Settings takes Comma rather than a letter so it
// pairs with Cmd/Ctrl+, (app Settings page, sidebar.tsx) — Shift scopes it
// down to the current project.
const SECTION_HOTKEYS: Record<string, RailSection> = {
  KeyM: 'models',
  KeyD: 'documents',
  KeyC: 'mcp',
  KeyS: 'skills',
  Comma: 'settings',
};

const IS_MAC = (window as any).electronAPI?.platform === 'darwin';

/**
 * Cheap identity check for a revalidated MCP server list. A refetch that changed
 * nothing keeps the previous array reference, so the derived memos below don't
 * recompute and the list doesn't repaint on every project switch.
 */
const sameMcpServers = (a: McpServer[], b: McpServer[]) =>
  a.length === b.length &&
  a.every((s, i) => s.id === b[i].id && getMcpServerTools(s).length === getMcpServerTools(b[i]).length);
const hotkeyLabel = (letter: string) => (IS_MAC ? `\u2318\u21e7${letter}` : `Ctrl+Shift+${letter}`);

/** Tooltip content for a rail button: label plus its keyboard shortcut. */
const railTip = (label: string, letter?: string) => (
  <span className="flex items-center gap-1.5">
    {label}
    {letter && <span className="text-[10px] font-mono opacity-60">{hotkeyLabel(letter)}</span>}
  </span>
);

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  onAddDocument: _onAddDocument,
  onDeleteDocument,
  onColorChange,
  onRenameProject,
  onInstructionsChange,
  model,
  activeTab,
  onTabChange,
  projectSkills: _projectSkills = [],
  onSaveSkills,
  onRefreshSkills,
}: RightSidebarProps) {
  const { indexingStatus, processedDates, setDocumentStatus, removeProcessed } = useAppStatus();
  const { enabledCapabilities } = useModelStatus();
  const { themeId, theme } = useThemeContext();
  const isMc = themeId === 'minecraft';
  // Themed rail icon for the active theme: the theme's own embedded SVG (from
  // its YAML `icons`) wins; Minecraft keeps its pixel icons; else the default.
  const railIcon = (name: 'models' | 'documents' | 'mcp' | 'skills' | 'settings') => {
    const svg = theme.icons?.[name];
    if (svg) return <ThemeRailIcon svg={svg} />;
    return isMc ? <PixelRailIcon name={name} /> : null;
  };
  // The skill glyph shown on cards — the active theme's own skill icon (e.g. the
  // Catppuccin cat) when it ships one, otherwise the default shield. Inherits the
  // surrounding text color via currentColor.
  const skillIcon = (size = 18) => {
    const svg = theme.icons?.skills;
    if (svg) return <ThemeRailIcon svg={svg} size={size} />;
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path d="M8 1.8l5 1.8v4.5c0 3.1-2.1 5.3-5 6.3-2.9-1-5-3.2-5-6.3V3.6l5-1.8z" stroke="currentColor" strokeWidth="0.75" fill="none" strokeLinejoin="round" />
        <path d="M8.9 4.2L5.8 8.7h2.1l-.8 3.1 3.1-4.6H8.1l.8-3z" fill="currentColor" stroke="currentColor" strokeWidth="0.4" strokeLinejoin="round" />
      </svg>
    );
  };
  // The document glyph shown on cards / the drop zone — the active theme's own
  // document icon when it ships one, otherwise the default page. Inherits color.
  const docIcon = (size = 18) => {
    const svg = theme.icons?.documents;
    if (svg) return <ThemeRailIcon svg={svg} size={size} />;
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path d="M4 1.5h5L12.5 5v9.5H4V1.5z" stroke="currentColor" strokeWidth="0.75" fill="none" />
        <path d="M9 1.5V5h3.5" stroke="currentColor" strokeWidth="0.5" fill="none" />
        <path d="M6 8h4.5M6 10.5h4.5M6 5.5h2" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" />
      </svg>
    );
  };
  const [activeSection, setActiveSection] = useState<'models' | 'documents' | 'mcp' | 'skills' | 'settings' | null>('models');
  // Section to reopen with Cmd/Ctrl+B after the panel is closed.
  const lastSectionRef = useRef<Exclude<typeof activeSection, null>>('models');
  useEffect(() => {
    if (activeSection) lastSectionRef.current = activeSection;
  }, [activeSection]);
  // Combined capabilities of the currently ENABLED models. Documents need "dp"
  // (document processing) and Skills need "skills"; the matching rail section is
  // disabled when no enabled model provides it. The set is empty before the model
  // list loads and when no model is enabled (the app falls back to the default
  // model) — don't gate either case; only disable when models ARE enabled but
  // none provide the capability. ModelStatusContext derives this from the
  // optimistic enabled set, so a toggle takes effect before the backend confirms.
  const docSupported = enabledCapabilities.size === 0 || enabledCapabilities.has('dp');
  const [_hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [processingDocs, setProcessingDocs] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localFolderPath, setLocalFolderPath] = useState('');
  const [localProjectName, setLocalProjectName] = useState('');
  // The project's directory as the backend reports it (`cwd`, mirrored into
  // folder_path). Never guessed from the project name — the real location is
  // whatever SLP chose, and a guess opens a path that doesn't exist.
  const projectFolderPath = localFolderPath || selectedProject?.folder_path || '';
  // System projects (e.g. General) have a fixed name — the rename field is read-only.
  const isSystemProject = selectedProject?.system === true;

  // Inline skill editing
  const [_hoveredSkillIndex, setHoveredSkillIndex] = useState<number | null>(null);
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);
  const [editingSkillIsNew, setEditingSkillIsNew] = useState(false);
  const [skillContent, setSkillContent] = useState('');
  const [skillHasUnsavedChanges, setSkillHasUnsavedChanges] = useState(false);
  const skillAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  // Instructions are local-only project metadata (SQLite), so they arrive on the
  // enriched project rather than the API's project payload.
  const projectInstructions: string = selectedProject?.instructions || '';

  // Skills loaded from the API
  const [localSkills, setLocalSkills] = useState<Array<{ id?: string; name: string; content: string; description?: string }>>([]);

  const loadSkillsFromDir = useCallback(async () => {
    if (!selectedProject?.id) return;
    try {
      const base = await getLocalApiEndpoint();
      const res = await fetch(`${base}/v1/projects/${selectedProject.id}/skills`);
      if (res.ok) {
        const data = await res.json();
        setLocalSkills(mapProjectSkills(data));
      }
    } catch { /* silent */ }
  }, [selectedProject?.id]);

  // Load on project change — retry a few times to handle race where SLP writes default
  // skills to the directory shortly after the project is created/selected.
  useEffect(() => {
    let cancelled = false;
    const projectId = selectedProject?.id;
    setLocalSkills([]);
    if (!projectId) return;

    const attempt = async (retriesLeft: number) => {
      if (cancelled) return;
      try {
        const base = await getLocalApiEndpoint();
        const res = await fetch(`${base}/v1/projects/${projectId}/skills`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const mapped = mapProjectSkills(data);
          setLocalSkills(mapped);
          if (mapped.length === 0 && retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), 1500);
          }
        }
      } catch { /* silent */ }
    };

    attempt(3);
    return () => { cancelled = true; };
  }, [selectedProject?.id]);

  // Reload when skills panel becomes active
  useEffect(() => {
    if (activeSection === 'skills') loadSkillsFromDir();
  }, [activeSection, loadSkillsFromDir]);

  // Refresh when skills are saved elsewhere (e.g. skill editor tabs)
  useEffect(() => {
    const handler = () => loadSkillsFromDir();
    window.addEventListener('skillsSaved', handler);
    return () => window.removeEventListener('skillsSaved', handler);
  }, [loadSkillsFromDir]);

  const skillEditorOptions = useMemo(() => ({
    spellChecker: false,
    status: false as const,
    toolbar: false as const,
    minHeight: '200px',
    placeholder: 'Add skills or guidelines for this project...',
  }), []);

  const handleSkillSave = useCallback(() => {
    if (!onSaveSkills) return;
    if (editingSkillIsNew) {
      const nameMatch = skillContent.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/) || skillContent.match(/^#\s+(.+)$/m);
      const name = nameMatch?.[1]?.trim() || 'Untitled Skill';
      onSaveSkills([...localSkills, { name, content: skillContent }]);
      setEditingSkillIndex(localSkills.length);
      setEditingSkillIsNew(false);
      setTimeout(() => loadSkillsFromDir(), 800);
    } else if (editingSkillIndex !== null) {
      const updated = localSkills.map((s, i) =>
        i === editingSkillIndex ? { ...s, content: skillContent } : s
      );
      onSaveSkills(updated);
      setTimeout(() => loadSkillsFromDir(), 800);
    }
    setSkillHasUnsavedChanges(false);
  }, [onSaveSkills, editingSkillIsNew, editingSkillIndex, skillContent, localSkills, loadSkillsFromDir]);

  // Auto-save skill after 1.5s
  useEffect(() => {
    if (!skillHasUnsavedChanges || !skillContent.trim()) return;
    if (skillAutoSaveTimerRef.current) clearTimeout(skillAutoSaveTimerRef.current);
    skillAutoSaveTimerRef.current = setTimeout(() => { handleSkillSave(); }, 1500);
    return () => { if (skillAutoSaveTimerRef.current) clearTimeout(skillAutoSaveTimerRef.current); };
  }, [skillContent, skillHasUnsavedChanges, handleSkillSave]);

  // Ctrl/Cmd+S for skill save. e.code plus the Alt/Shift bail-out keeps this off
  // the other two S bindings — Ctrl+Alt+S (web search) and Ctrl+Shift+S (the
  // Skills section just below). Alt is the one that actually collided: on
  // Windows/Linux e.key stays 's' under Alt, so toggling web search with the
  // editor open also saved.
  useEffect(() => {
    if (editingSkillIndex === null && !editingSkillIsNew) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        if (skillHasUnsavedChanges && skillContent.trim()) handleSkillSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingSkillIndex, editingSkillIsNew, skillHasUnsavedChanges, skillContent, handleSkillSave]);


  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const isResizing = useRef(false);

  // MCP Servers state
  // Non-system servers, owned by GET /v1/projects/{id}/mcp. System servers get
  // their own slice below: that endpoint filters them out by design, so the two
  // sources have disjoint ownership and must never overwrite each other.
  const [apiMcpServers, setApiMcpServers] = useState<McpServer[]>([]);
  const [mcpError, setMcpError] = useState('');
  const [mcpPolling, setMcpPolling] = useState(false);
  const mcpServerCountRef = useRef(0);
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [discoveringServerId, setDiscoveringServerId] = useState<string | null>(null);
  // mcpToDelete can be used for deletion confirmation dialog if needed
  const [, setMcpToDelete] = useState<McpServer | null>(null);
  // Delete errors are scoped to the server row that failed (not the add form)
  const [mcpDeleteError, setMcpDeleteError] = useState<{ id: string; message: string } | null>(null);

  // Curated connection catalog (remote + OAuth only)
  const [mcpCatalog, setMcpCatalog] = useState<McpCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  // Registration request in flight for this catalog slug
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  // OAuth window opened for this slug — waiting on the callback
  const [awaitingAuthSlug, setAwaitingAuthSlug] = useState<string | null>(null);
  const [catalogItemError, setCatalogItemError] = useState<{ slug: string; message: string } | null>(null);


  // Sync local folder path and project name when project changes
  useEffect(() => {
    setLocalFolderPath(currentProjectData?.folder_path || '');
    setLocalProjectName(selectedProject?.name || '');
  }, [currentProjectData?.folder_path, selectedProject?.id, selectedProject?.name]);

  // Resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(800, Math.max(280, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // If the open section is no longer supported by the model, close it.
  useEffect(() => {
    if (activeSection === 'documents' && !docSupported) setActiveSection(null);
  }, [activeSection, docSupported]);

  // Reset transient editing/form state when switching projects
  useEffect(() => {
    setEditingSkillIndex(null);
    setEditingSkillIsNew(false);
    setSkillContent('');
    setSkillHasUnsavedChanges(false);
    setIsAddingMcp(false);
    setMcpError('');
    setUploadError('');
  }, [selectedProject?.id]);



  // Local state for documents being uploaded/processed (not yet in currentProjectData)
  const [uploadingDocs, setUploadingDocs] = useState<any[]>([]);
  const [directoryFiles, setDirectoryFiles] = useState<any[]>([]);

  // Load pending/processing uploads from SQLite when project changes so they survive navigation
  useEffect(() => {
    if (!selectedProject?.id) { setUploadingDocs([]); setProcessingDocs(new Map()); return; }
    storageService.getDocumentsByProject(selectedProject.id).then(docs => {
      if (docs.length > 0) {
        setUploadingDocs(docs.map((d: any) => ({ id: d.id, name: d.filename, source: d.filename })));
        setProcessingDocs(new Map(docs.map((d: any) => [d.id, d.status])));
      } else {
        setUploadingDocs([]);
        setProcessingDocs(new Map());
      }
    });
  }, [selectedProject?.id]);

  // Local copy of API documents, refreshed periodically
  const [apiDocuments, setApiDocuments] = useState<any[]>([]);
  // Tracks fs file path → API doc ID for files submitted for processing
  const [fsToApiMap, setFsToApiMap] = useState<Map<string, string>>(new Map());

  // Keep refs to context methods so refreshApi (a stable closure within the
  // useEffect below) can call them without putting them in the dep array.
  const setDocumentStatusRef = useRef(setDocumentStatus);
  setDocumentStatusRef.current = setDocumentStatus;
  const removeProcessedRef = useRef(removeProcessed);
  removeProcessedRef.current = removeProcessed;
  const processedDatesRef = useRef(processedDates);
  processedDatesRef.current = processedDates;

  // Scan project directory and refresh API documents.
  // Per-document indexing status and processed_at timestamps live in
  // AppStatusContext — it owns the /health-driven updates and SQLite writes.
  useEffect(() => {
    const folderPath = currentProjectData?.folder_path;
    const projectId = selectedProject?.id;
    if (!projectId) { setApiDocuments([]); setDirectoryFiles([]); setFsToApiMap(new Map()); return; }
    setFsToApiMap(new Map());

    let cancelled = false;

    const scanDir = () => {
      if (!folderPath || !window.electronAPI?.listDirectory) return;
      window.electronAPI.listDirectory(folderPath).then((result: any) => {
        if (!cancelled && result.success) setDirectoryFiles(result.files);
      });
    };

    const refreshApi = async () => {
      const result = await documentService.getLocalDocuments(projectId);
      if (cancelled || !result.success || !result.data) return;

      const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
      setApiDocuments(docs);
      const apiDocIds = new Set<string>();
      for (const doc of docs) {
        if (!doc.id) continue;
        apiDocIds.add(doc.id);
        const status = doc.status ?? doc.indexing_status ?? doc.state ?? '';
        if (status) setDocumentStatusRef.current(doc.id, status);
      }

      // Cleanup: any doc the context still tracks but that's no longer in the
      // API has been removed — drop its processed_at and folder mapping.
      for (const docId of Object.keys(processedDatesRef.current)) {
        if (!apiDocIds.has(docId)) {
          removeProcessedRef.current(docId);
          storageService.clearDocumentFolder(docId);
        }
      }
    };

    // Initial load
    scanDir();
    refreshApi();

    // Refresh on explicit events (upload, delete, processing complete)
    const handler = () => { scanDir(); refreshApi(); };
    window.addEventListener('documentProcessingComplete', handler);
    window.addEventListener('documentUploaded', handler);

    return () => {
      cancelled = true;
      window.removeEventListener('documentProcessingComplete', handler);
      window.removeEventListener('documentUploaded', handler);
    };
  }, [currentProjectData?.folder_path, selectedProject?.id]);

  // Standalone refresh for documents (called on tab switch)
  const refreshDocuments = useCallback(() => {
    const projectId = selectedProject?.id;
    const folderPath = currentProjectData?.folder_path;
    if (!projectId) return;
    if (folderPath && window.electronAPI?.listDirectory) {
      window.electronAPI.listDirectory(folderPath).then((result: any) => {
        if (result.success) setDirectoryFiles(result.files);
      });
    }
    documentService.getLocalDocuments(projectId).then((result) => {
      if (result.success && result.data) {
        const docs = Array.isArray(result.data) ? result.data : (result.data.documents || []);
        setApiDocuments(docs);
      }
    });
  }, [selectedProject?.id, currentProjectData?.folder_path]);

  // Project folder is the source of truth; API data enriches with status/summary
  const effectiveDocuments = useMemo(() => {
    const serverDocs: any[] = apiDocuments;
    const serverIds = new Set(serverDocs.map((d: any) => d.id));
    const pending = uploadingDocs.filter((d: any) => !serverIds.has(d.id));

    // Build multiple lookups from API docs for robust matching
    const baseName = (name: string) => name.replace(/\.[^/.]+$/, '').toLowerCase();
    const apiById = new Map<string, any>();
    const apiByBase = new Map<string, any>();
    const apiByPath = new Map<string, any>();
    for (const doc of serverDocs) {
      if (doc.id) apiById.set(doc.id, doc);
      const docFileName = (doc.path || doc.source || '').split('/').pop()
        || doc.filename || doc.name || '';
      const base = baseName(docFileName);
      if (base) apiByBase.set(base, doc);
      if (doc.source) apiByPath.set(doc.source, doc);
      if (doc.path) apiByPath.set(doc.path, doc);
    }

    // If no directory files, filter API docs to only those that still exist or are processing
    if (directoryFiles.length === 0) {
      return [...serverDocs, ...pending];
    }

    // For each directory file, find matching API doc or show as unindexed
    const matchedApiIds = new Set<string>();
    const merged = directoryFiles.map((file: any) => {
      const base = baseName(file.name);
      const mappedId = fsToApiMap.get(file.path);
      const match = (mappedId ? apiById.get(mappedId) : null)
        || apiByPath.get(file.path)
        || apiByBase.get(base);
      if (match) {
        matchedApiIds.add(match.id);
        return { ...match, _fsFile: file };
      }
      // File exists on disk but not in API — show as unindexed
      return {
        id: `fs-${file.path}`,
        name: file.name,
        filename: file.name,
        source: file.path,
        size: file.size,
        _fsFile: file,
      };
    });

    // Indexed docs that don't correspond to a directory file (e.g. uploaded via
    // the picker — they live in the backend store, not the project folder) would
    // otherwise be dropped. Surface them so documents stay visible after indexing.
    const unmatched = serverDocs.filter((d: any) => d.id && !matchedApiIds.has(d.id));

    return [...merged, ...unmatched, ...pending];
  }, [apiDocuments, uploadingDocs, directoryFiles, fsToApiMap]);

  // Last API-backed list per project. Switching back repaints from this in the
  // same tick, so the connected badges, disconnect button and tool counts are
  // there on the first frame instead of appearing a fetch later.
  const mcpServersByProjectRef = useRef<Map<string, McpServer[]>>(new Map());
  // Project id the current apiMcpServers came from, when API-backed.
  const mcpLoadedProjectRef = useRef<string | null>(null);
  // Read after awaits so a response for a project already switched away from is
  // discarded — rapid switching overlaps loads.
  const mcpProjectIdRef = useRef<string | undefined>(selectedProject?.id);
  mcpProjectIdRef.current = selectedProject?.id;

  // Snapshot the rendered list once it is API-backed. Declared before the switch
  // effect so on a switch it sees the *old* loaded-project id and bails, rather
  // than writing the outgoing project's servers under the incoming project's key.
  useEffect(() => {
    const pid = selectedProject?.id;
    if (!pid || mcpLoadedProjectRef.current !== pid) return;
    mcpServersByProjectRef.current.set(pid, apiMcpServers);
  }, [apiMcpServers, selectedProject?.id]);

  // Repaint on project switch straight from the snapshot. Deliberately does not
  // read currentProjectData: this runs before the parent's effect has swapped it,
  // so it would still hold the previous project's payload.
  useEffect(() => {
    const pid = selectedProject?.id;
    const cached = pid ? mcpServersByProjectRef.current.get(pid) : undefined;
    mcpLoadedProjectRef.current = cached ? (pid ?? null) : null;
    setApiMcpServers(cached ?? []);
  }, [selectedProject?.id]);

  // System servers appear only in the projects-list payload, never from the /mcp
  // endpoint, so they are merged in at read time instead of into the state above.
  const systemMcpServers = useMemo<McpServer[]>(() => {
    if (!Array.isArray(currentProjectData?.mcp)) return [];
    return (currentProjectData.mcp as McpServer[]).filter(
      (s) => !!(s as any).system && !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__',
    );
  }, [currentProjectData?.mcp]);

  const mcpServers = useMemo<McpServer[]>(() => {
    const ids = new Set(apiMcpServers.map((s) => s.id));
    return [...apiMcpServers, ...systemMcpServers.filter((s) => !ids.has(s.id))];
  }, [apiMcpServers, systemMcpServers]);

  // Listen for MCP authorization callback from Electron
  useEffect(() => {
    const electronWindow = window as any;
    if (electronWindow.electronAPI?.onMcpAuthCallback) {
      electronWindow.electronAPI.onMcpAuthCallback(async (data: { serverId?: string; error?: string }) => {
        console.log('[MCP Auth] Callback received:', data);
        if (data.error) {
          setMcpError(data.error);
          setAwaitingAuthSlug(null);
        } else if (data.serverId && selectedProject?.id) {
          console.log('[MCP Auth] Server authorized, refreshing list...');
          loadMcpServers();
        }
      });

      return () => {
        electronWindow.electronAPI?.removeMcpAuthCallbackListener?.();
      };
    }
  }, [selectedProject?.id]);

  const loadMcpServers = useCallback(async () => {
    if (!selectedProject?.id) return;
    const projectId = selectedProject.id;

    try {
      const result = await mcpServerService.getMcpServers(projectId);
      if (mcpProjectIdRef.current !== projectId) return;
      if (result.success && result.data) {
        const apiServers = (result.data as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__');
        mcpLoadedProjectRef.current = projectId;
        setApiMcpServers(prev => (sameMcpServers(prev, apiServers) ? prev : apiServers));
        if (mcpPolling && apiServers.length > mcpServerCountRef.current) {
          setMcpPolling(false);
          setMcpError('');
        }
      }
    } catch (error: any) {
      // silent during polling
      if (!mcpPolling) {
        setMcpError(error.message || 'An error occurred');
      }
    }
  }, [selectedProject?.id, mcpPolling]);

  // Keep the callback in a ref so the project-switch effect below doesn't also
  // re-run whenever mcpPolling flips (loadMcpServers closes over it).
  const loadMcpServersRef = useRef(loadMcpServers);
  loadMcpServersRef.current = loadMcpServers;

  // Nothing else refetches on project switch — toggleSection only fires when
  // the panel is opened, so switching with Connections already open would leave
  // the stale project payload as the last word.
  useEffect(() => {
    if (!selectedProject?.id) return;
    loadMcpServersRef.current();
  }, [selectedProject?.id]);

  const loadMcpCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    const result = await mcpServerService.getMcpCatalog();
    if (result.success) {
      setMcpCatalog(result.entries);
    } else {
      setCatalogError(result.error || 'Failed to load connections');
    }
    setCatalogLoading(false);
  }, []);

  // Single entry point for opening/closing a rail section, shared by the rail
  // buttons and the keyboard shortcuts so both paths run the same side effects.
  const toggleSection = useCallback((section: RailSection) => {
    if (section === 'documents' && !docSupported) return;
    if (section === 'mcp') setMcpError('');
    const next = activeSection === section ? null : section;
    setActiveSection(next);
    if (next === 'documents') refreshDocuments();
    if (next === 'mcp') loadMcpServers();
    if (next === 'skills') onRefreshSkills?.();
  }, [activeSection, docSupported, refreshDocuments, loadMcpServers, onRefreshSkills]);

  // Cmd/Ctrl+B toggles the whole panel, matching the sidebar-toggle convention
  // users bring from VS Code. Reopening restores whichever section was showing
  // last (see lastSectionRef) rather than snapping back to Models. Matched on
  // e.code so a non-QWERTY layout still triggers on the B key.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'KeyB') return;
      e.preventDefault();
      if (activeSection) {
        setActiveSection(null);
        return;
      }
      const last = lastSectionRef.current;
      // Documents is unreachable when no enabled model can process them.
      toggleSection(last === 'documents' && !docSupported ? 'models' : last);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSection, docSupported, toggleSection]);

  // Cmd/Ctrl+Shift+M/D/C/S/, toggles the rail sections. Matched on e.code so a
  // non-QWERTY layout still triggers on the same physical keys, and gated on
  // altKey so Cmd/Ctrl+Alt+S (web search, Home.tsx) doesn't open Skills.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      const section = SECTION_HOTKEYS[e.code];
      if (!section) return;
      e.preventDefault();
      toggleSection(section);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSection]);

  // Poll for new MCP servers while waiting (OAuth flow)
  useEffect(() => {
    if (!mcpPolling || !selectedProject?.id) return;

    let attempts = 0;
    const maxAttempts = 20; // ~60s

    const interval = setInterval(() => {
      attempts++;
      loadMcpServers();
      if (attempts >= maxAttempts) {
        setMcpPolling(false);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [mcpPolling, selectedProject?.id, loadMcpServers]);

  // Poll for tool discovery after adding a server
  useEffect(() => {
    if (!discoveringServerId || !selectedProject?.id) return;

    let attempts = 0;
    const maxAttempts = 20; // ~30s

    const interval = setInterval(async () => {
      attempts++;
      try {
        const result = await mcpServerService.getMcpServers(selectedProject.id);
        if (result.success && result.data) {
          const apiServers = (result.data as McpServer[]).filter(s => !s.id?.includes('__system_tools__') && s.name !== '__system_mcp__');
          setApiMcpServers(prev => (sameMcpServers(prev, apiServers) ? prev : apiServers));
          const target = apiServers.find(s => s.id === discoveringServerId);
          const tools = target?.tools ?? target?.metadata?.tools ?? [];
          if (tools.length > 0 || attempts >= maxAttempts) {
            setDiscoveringServerId(null);
            clearInterval(interval);
          }
        }
      } catch {
        // keep polling
      }
      if (attempts >= maxAttempts) {
        setDiscoveringServerId(null);
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [discoveringServerId, selectedProject?.id]);

  // Keep the indexing pills live. Provisioning and the content crawl run in the
  // backend's own time, so the state only moves if we ask again — but only
  // while the connections panel is open, since nothing off-screen is worth a
  // request every few seconds. Capped so a connection that stays queued (its
  // crawl deferred while the model is busy) can't poll for the whole session.
  const mcpIndexingInProgress = useMemo(
    () => mcpServers.some((s) => s.indexing?.in_progress),
    [mcpServers],
  );

  useEffect(() => {
    if (activeSection !== 'mcp' || !mcpIndexingInProgress || !selectedProject?.id) return;

    let attempts = 0;
    const maxAttempts = 75; // ~5 min at 4s

    const interval = setInterval(() => {
      attempts++;
      loadMcpServers();
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 4000);

    return () => clearInterval(interval);
  }, [activeSection, mcpIndexingInProgress, selectedProject?.id, loadMcpServers]);

  // Installed servers keyed by normalized remote URL — how a catalog entry knows
  // whether it's already connected.
  const connectedByUrl = useMemo(() => {
    const map = new Map<string, McpServer>();
    mcpServers.forEach((s) => {
      const url = normalizeMcpUrl(getMcpServerUrl(s));
      if (url) map.set(url, s);
    });
    return map;
  }, [mcpServers]);


  // One distinct color per LLM-generated custom-server tag, assigned across the
  // whole custom list so no two tags share a color.
  const customTagColorMap = useMemo(
    () => buildTagColorMap(mcpServers.flatMap((s) => s.tags || [])),
    [mcpServers],
  );

  // Servers added by hand (not in the catalog) keep the original list rendering.
  const customMcpServers = useMemo(() => {
    const catalogUrls = new Set(mcpCatalog.map((e) => normalizeMcpUrl(e.remote_config?.server_url)));
    return mcpServers.filter((s) => {
      const url = normalizeMcpUrl(getMcpServerUrl(s));
      return !url || !catalogUrls.has(url);
    });
  }, [mcpServers, mcpCatalog]);

  // Main primes the catalog at startup, so loading on mount is a cache hit and
  // the Connections list is already populated when the section first opens.
  // Background refreshes (TTL expiry, login, logout) arrive on the push channel.
  useEffect(() => {
    loadMcpCatalog();
    const electronWindow = window as any;
    const unsubscribe = electronWindow.electronAPI?.onMcpCatalogUpdated?.(
      ({ entries }: { entries: McpCatalogEntry[] }) => {
        if (Array.isArray(entries)) setMcpCatalog(entries);
      },
    );
    return () => unsubscribe?.();
  }, [loadMcpCatalog]);

  // Drop the "authorizing" state once the server lands, or when polling gives up.
  // A server that arrives without tools yet gets picked up by discovery polling.
  useEffect(() => {
    if (!awaitingAuthSlug) return;
    const entry = mcpCatalog.find((e) => e.slug === awaitingAuthSlug);
    const server = connectedByUrl.get(normalizeMcpUrl(entry?.remote_config?.server_url));
    if (server) {
      setAwaitingAuthSlug(null);
      if (getMcpServerTools(server).length === 0) setDiscoveringServerId(server.id);
    } else if (!mcpPolling) {
      setAwaitingAuthSlug(null);
    }
  }, [awaitingAuthSlug, mcpCatalog, connectedByUrl, mcpPolling]);


  // Fast client-side dedupe so re-adding the same server shows an inline notice
  // instead of silently creating a second entry. The backend is authoritative
  // (it 409s on a real conflict); this just spares an obvious round trip. Remote

  // Persist a registered MCP server to SQLite (best-effort — registration with
  // the service is the source of truth, this keeps a local record).
  const persistMcpServerToDb = async (server: {
    id: string;
    project_id: string;
    name: string;
    server_type: 'local' | 'remote';
    config: Record<string, any>;
  }) => {
    try {
      await (window as any).electronAPI?.db?.addMcpServer(server);
    } catch (e) {
      console.error('[MCP] Failed to persist server to SQLite:', e);
    }
  };

  // Dropping a .toml onto the Add-your-own card. The file describes the whole
  // connection — name, local command or remote url, and optionally how to index
  // it — so this is the same install as typing a URL, just with the crawl plan
  // arriving alongside instead of being derived.
  const [mcpDropActive, setMcpDropActive] = useState(false);
  const mcpTomlInputRef = useRef<HTMLInputElement>(null);

  const handleMcpFileDrop = async (file: File) => {
    if (!selectedProject?.id) return;
    if (!/\.toml$/i.test(file.name)) {
      setMcpError('Drop a .toml connection file.');
      return;
    }

    setIsAddingMcp(true);
    setMcpError('');
    try {
      const text = await file.text();
      const result = await mcpServerService.registerMcpFromDefinition(
        selectedProject.id, text, file.name,
      );
      if (!result.success || !result.data) {
        setMcpError(result.error || 'Could not read this connection file');
        return;
      }

      const data = result.data as Record<string, any>;
      if (data.auth_type === 'oauth' && data.auth_url) {
        // A remote server in the file may still need authorizing, exactly as a
        // typed-in URL would.
        mcpServerCountRef.current = apiMcpServers.length;
        setMcpPolling(true);
        const electronWindow = window as any;
        if (electronWindow.electronAPI?.openExternal) {
          electronWindow.electronAPI.openExternal(data.auth_url);
        } else {
          window.open(data.auth_url, '_blank');
        }
        return;
      }

      await loadMcpServers();
      const serverId = data.id || data.server_id;
      if (serverId) setDiscoveringServerId(serverId);
    } catch (error: any) {
      setMcpError(error?.message || 'Could not read this connection file');
    } finally {
      setIsAddingMcp(false);
    }
  };


  // Connect a curated catalog entry — same remote registration path as the URL
  // box, using the entry's own server_url.
  const handleConnectCatalogEntry = async (entry: McpCatalogEntry) => {
    const serverUrl = entry.remote_config?.server_url;
    if (!selectedProject?.id || !serverUrl) return;

    cancelledAuthRef.current.delete(entry.slug);
    setCatalogItemError(null);
    setConnectingSlug(entry.slug);

    try {
      const result = await mcpServerService.registerMcpServer(selectedProject.id, {
        server_type: 'remote',
        // The slug is what makes this a curated install: the backend resolves
        // the catalog entry and stores its description and tags, so the record
        // keeps our copy instead of the vendor's and skips LLM enrichment.
        catalog_slug: entry.slug,
        server_url: serverUrl,
        name: entry.display_name,
        return_url: 'smartloop://mcp-authorization',
      });

      if (!result.success || !result.data) {
        setCatalogItemError({ slug: entry.slug, message: result.error || 'Failed to connect' });
        return;
      }

      const data = result.data as Record<string, any>;

      if (data.auth_type === 'oauth' && data.auth_url) {
        // Cancelled while the registration request was still in flight: don't
        // re-arm the wait, and above all don't open a browser the user has
        // just said they don't want.
        if (cancelledAuthRef.current.has(entry.slug)) return;

        mcpServerCountRef.current = apiMcpServers.length;
        setMcpPolling(true);
        setAwaitingAuthSlug(entry.slug);

        const electronWindow = window as any;
        if (electronWindow.electronAPI?.openExternal) {
          electronWindow.electronAPI.openExternal(data.auth_url);
        } else {
          window.open(data.auth_url, '_blank');
        }
      } else {
        const serverId = data.id || data.server_id;
        if (serverId) {
          await persistMcpServerToDb({
            id: serverId,
            project_id: selectedProject.id,
            name: data.name || entry.display_name,
            server_type: 'remote',
            config: { server_url: serverUrl },
          });
        }
        await loadMcpServers();
        if (serverId) setDiscoveringServerId(serverId);
      }
    } catch (error: any) {
      console.error('[MCP] Error connecting catalog entry:', error);
      setCatalogItemError({ slug: entry.slug, message: error.message || 'An error occurred' });
    } finally {
      setConnectingSlug(null);
    }
  };

  const handleDeleteMcpServer = async (server: McpServer) => {
    if (!selectedProject?.id || !server.id) return;

    setMcpDeleteError(null);
    try {
      const result = await mcpServerService.deleteMcpServer(selectedProject.id, server.id);
      if (result.success) {
        setApiMcpServers(prev => prev.filter(s => s.id !== server.id));
        setMcpToDelete(null);
        // Remove from local storage + SQLite
        await mcpServerService.removeMcpServerFromStorage(selectedProject.id, server.id);
        try {
          await (window as any).electronAPI?.db?.deleteMcpServer(server.id);
        } catch (e) {
          console.error('[MCP] Failed to remove server from SQLite:', e);
        }
      } else {
        setMcpDeleteError({ id: server.id, message: result.error || 'Failed to delete MCP server' });
      }
    } catch (error: any) {
      setMcpDeleteError({ id: server.id, message: error.message || 'An error occurred' });
    }
  };


  // Slugs whose authorization the user backed out of. A ref, not state: the
  // in-flight connect closure has to read the current value, not the one it
  // captured before the request went out.
  const cancelledAuthRef = useRef<Set<string>>(new Set());

  const handleCancelCatalogAuth = (entry: McpCatalogEntry) => {
    cancelledAuthRef.current.add(entry.slug);
    // Client-side only, and deliberately so: the backend writes no server
    // record until the OAuth callback comes back, so there is nothing to undo.
    // If the user does finish in the browser afterwards, the callback listener
    // still picks the connection up — this cancels the waiting, not the grant.
    if (awaitingAuthSlug === entry.slug) setAwaitingAuthSlug(null);
    if (connectingSlug === entry.slug) setConnectingSlug(null);
    setMcpPolling(false);
    setCatalogItemError(null);
  };

  const handleRefreshMcpServer = async (server: McpServer) => {
    if (!selectedProject?.id || !server.id) return;

    setMcpDeleteError(null);
    // Show the pass as running straight away: the request only queues the work,
    // and without this the card looks inert until the next poll lands.
    setApiMcpServers(prev => prev.map(s => (
      s.id === server.id
        ? { ...s, indexing: { ...(s.indexing ?? { crawl_enabled: true }), state: 'provisioning', in_progress: true } as McpServer['indexing'] }
        : s
    )));

    const result = await mcpServerService.refreshMcpServer(selectedProject.id, server.id);
    if (!result.success) {
      setMcpDeleteError({ id: server.id, message: result.error || 'Failed to re-index connection' });
      // Put the card back the way it was — the pass never started.
      loadMcpServers();
      return;
    }
    // The in-progress state drives the poll effect, which carries the card the
    // rest of the way to "Indexed".
    loadMcpServers();
  };


  const validateFile = (file: File): boolean => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.includes(file.type) && !/\.md$/i.test(file.name)) {
      setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, MD');
      return false;
    }

    if (file.size > maxSize) {
      setUploadError('File size exceeds 50MB limit');
      return false;
    }

    return true;
  };

  const uploadSingleFile = async (file: File, placeholderId: string, projectId: string) => {
    const buffer = await file.arrayBuffer();
    const tempPath = await window.electronAPI!.saveTempFile(file.name, buffer);

    let doneHandled = false;
    let realDocId: string | null = null;

    const localResult = await documentService.addLocalDocument(
      projectId,
      tempPath,
      (progress) => {
        const doc = progress.documents?.[0];
        const apiDocId = doc?.id || doc?.document_id || null;

        if (progress.event === 'done') {
          doneHandled = true;
          const finalDocId = apiDocId || realDocId;

          setProcessingDocs(prev => {
            const next = new Map(prev);
            next.delete(placeholderId);
            if (realDocId) next.delete(realDocId);
            if (apiDocId) next.delete(apiDocId);
            return next;
          });
          setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId && d.id !== realDocId && d.id !== apiDocId));

          // Remove from SQLite — doc is now owned by the API
          storageService.deleteDocument(realDocId || placeholderId);
          if (apiDocId && apiDocId !== realDocId) storageService.deleteDocument(apiDocId);

          if (finalDocId && doc) {
            const docStatus = doc.status || 'indexed';
            setDocumentStatus(finalDocId, docStatus);
            setApiDocuments(prev => {
              const idx = prev.findIndex((d: any) => d.id === finalDocId);
              if (idx >= 0) { const next = [...prev]; next[idx] = doc; return next; }
              return [...prev, doc];
            });
          }
          window.dispatchEvent(new Event('documentUploaded'));
          return;
        }

        // Intermediate events — swap placeholder with real doc and show live status
        if (apiDocId && doc) {
          const docStatus = doc.status || 'processing';

          if (!realDocId) {
            realDocId = apiDocId;
            // Update SQLite: replace placeholder id with real API id
            storageService.updateDocumentId(placeholderId, apiDocId, docStatus);
            setUploadingDocs(prev => prev.map(d =>
              d.id === placeholderId ? { ...doc, name: file.name } : d
            ));
            setProcessingDocs(prev => {
              const next = new Map(prev);
              next.delete(placeholderId);
              next.set(apiDocId, docStatus);
              return next;
            });
          } else {
            storageService.updateDocumentStatus(apiDocId, docStatus);
            setProcessingDocs(prev => new Map(prev).set(apiDocId, docStatus));
          }
          setDocumentStatus(apiDocId, docStatus);
        } else {
          const currentId = realDocId || placeholderId;
          const currentStatus = progress.status || 'processing';
          storageService.updateDocumentStatus(currentId, currentStatus);
          setProcessingDocs(prev => new Map(prev).set(currentId, currentStatus));
        }
      },
      currentProjectData?.folder_path,
    );

    if (!localResult.success) {
      setProcessingDocs(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        if (realDocId) next.delete(realDocId);
        return next;
      });
      setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId && d.id !== realDocId));
      // Remove from SQLite on failure
      storageService.deleteDocument(placeholderId);
      if (realDocId) storageService.deleteDocument(realDocId);
      throw new Error(localResult.error || 'Upload failed');
    }

    if (!doneHandled) {
      const uploadedDocument = localResult.data;
      const docId = uploadedDocument?.id || uploadedDocument?.document_id || realDocId;
      setProcessingDocs(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        if (realDocId) next.delete(realDocId);
        if (docId) next.delete(docId);
        return next;
      });
      setUploadingDocs(prev => prev.filter(d => d.id !== placeholderId && d.id !== realDocId && d.id !== docId));
      // Remove from SQLite — doc is now owned by the API
      storageService.deleteDocument(realDocId || placeholderId);
      if (docId) {
        const docStatus = uploadedDocument?.status || 'indexed';
        setDocumentStatus(docId, docStatus);
        setApiDocuments(prev => {
          const idx = prev.findIndex((d: any) => d.id === docId);
          if (idx >= 0) { const next = [...prev]; next[idx] = uploadedDocument; return next; }
          return [...prev, uploadedDocument];
        });
      }
      window.dispatchEvent(new Event('documentUploaded'));
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!selectedProject) {
      setUploadError('No project selected');
      return;
    }

    if (!window.electronAPI?.saveTempFile) {
      setUploadError('Local file upload is not available outside of the desktop app');
      return;
    }

    // Validate all files upfront, collect valid ones
    const validFiles: File[] = [];
    for (const file of files) {
      if (validateFile(file)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    setUploadError('');
    setIsUploading(true);

    const projectId = selectedProject.id;

    // Create placeholders for all files at once so they appear immediately
    const entries = validFiles.map((file, i) => {
      const placeholderId = `uploading-${Date.now()}-${i}`;
      return { file, placeholderId };
    });

    setUploadingDocs(prev => [
      ...prev,
      ...entries.map(e => ({ id: e.placeholderId, name: e.file.name, source: e.file.name })),
    ]);
    setProcessingDocs(prev => {
      const next = new Map(prev);
      for (const e of entries) next.set(e.placeholderId, 'pending');
      return next;
    });

    // Persist to SQLite immediately so pending uploads survive navigation
    for (const e of entries) {
      await storageService.addDocument({ id: e.placeholderId, project_id: projectId, filename: e.file.name, status: 'pending' });
    }

    // Process uploads one at a time to avoid progress-listener conflicts
    for (const { file, placeholderId } of entries) {
      try {
        await uploadSingleFile(file, placeholderId, projectId);
      } catch (error: any) {
        setUploadError(error.message || 'Failed to upload document');
      }
    }

    setIsUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      e.target.value = '';
      uploadFiles(files);
    } else {
      e.target.value = '';
    }
  };

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };


  return (
    <Box
      className="relative"
      sx={{
        width: { xs: '0', md: activeSection ? `${sidebarWidth}px` : '48px' },
        minWidth: { xs: '0', md: activeSection ? '280px' : '48px' },
        maxWidth: { xs: '0', md: activeSection ? '800px' : '48px' },
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'row',
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
        borderLeft: '1px solid',
        borderColor: 'var(--sl-border-default)',
      }}
    >
      {/* Resize Handle */}
      {activeSection && (
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            width: '4px',
            cursor: 'col-resize',
            flexShrink: 0,
            bgcolor: 'transparent',
            transition: 'background-color 0.15s ease',
            '&:hover': {
              bgcolor: 'var(--sl-brand-alpha-30)',
            },
          }}
        />
      )}
      {/* Content Area */}
      {activeSection && (
        <Box
          className="flex-1 overflow-y-auto p-3 space-y-4 sidebar-scroll"
          sx={{
            opacity: activeSection ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Section Title */}
          <Box className="flex items-center justify-between pb-3 mb-2" sx={{ borderBottom: '1px solid var(--sl-border-subtle)' }}>
            <span className="text-[10px] font-medium text-sl-text-disabled uppercase tracking-wider">
              {activeSection === 'models' ? 'Available Models' : activeSection === 'documents' ? 'Documents' : activeSection === 'mcp' ? 'Connections' : activeSection === 'skills' ? 'Skills' : activeSection === 'settings' ? 'Project Settings' : ''}
            </span>
          </Box>


          {/* Models Section */}
          {activeSection === 'models' && (
            <AuxiliaryModelsPanel model={model || ''} />
          )}

          {/* Documents Section */}
          {activeSection === 'documents' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {selectedProject ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {uploadError && (
                    <Box className="text-red-400 text-xs px-2 py-1">{uploadError}</Box>
                  )}

                  {/* Drop zone */}
                  <Box
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      borderRadius: '8px',
                      border: `1px dashed ${isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-border-subtle)'}`,
                      bgcolor: isDragging ? 'var(--sl-brand-alpha-10)' : 'transparent',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      gap: 0.75,
                      py: 4,
                      px: 3,
                      '&:hover': {
                        borderColor: 'var(--sl-brand-primary)',
                        bgcolor: 'var(--sl-brand-alpha-5)',
                      },
                    }}
                  >
                    {/* Themed document glyph — files are indexed locally, so a
                        document icon fits better than a cloud upload. */}
                    <span style={{ color: isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)' }}>
                      {docIcon(24)}
                    </span>
                    <span className="text-[12px] text-sl-text-muted font-medium">
                      {isDragging ? 'Drop files here' : 'Drop files or click to add'}
                    </span>
                    <span className="flex items-center gap-1.5 mt-1">
                      {['PDF', 'DOCX', 'TXT'].map((type) => (
                        <span
                          key={type}
                          className="text-[9px] font-medium tracking-wide px-2 py-0.5 rounded"
                          style={{
                            color: 'var(--sl-text-muted)',
                            backgroundColor: 'var(--sl-white-alpha-7)',
                            border: '1px solid var(--sl-border-subtle)',
                          }}
                        >
                          {type}
                        </span>
                      ))}
                    </span>
                  </Box>

                  {/* Document List — card style, matching the Models panel */}
                  {effectiveDocuments.length > 0 && (
                    <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {effectiveDocuments
                        .map((doc: any, i: number) => {
                          const rowId = doc.id || `doc-${i}`;
                          // Use filesystem file info when available for original name/size
                          const fsFile = doc._fsFile;
                          const rawName = fsFile?.name
                            || doc.filename || doc.name
                            || (doc.source || doc.path || '').split('/').pop()
                            || '';
                          const filename = rawName ? (rawName.replace(/\.[^/.]+$/, '') || 'Untitled') : 'Untitled';
                          const ext = rawName.match(/\.([^/.]+)$/)?.[1]?.toUpperCase() || '';
                          const fileSize = fsFile?.size || doc.size || doc.file_size;
                          const fileSizeLabel = fileSize != null
                            ? fileSize >= 1024 * 1024 ? `${(fileSize / 1024 / 1024).toFixed(1)} MB` : `${(fileSize / 1024).toFixed(0)} KB`
                            : null;
                          const isFsOnly = typeof doc.id === 'string' && doc.id.startsWith('fs-');
                          const docIndexStatus = indexingStatus[doc.id];
                          const isIndexing = docIndexStatus === 'indexing';
                          const converting = docIndexStatus === 'converting';
                          const isProcessing = processingDocs.has(doc.id) || isIndexing || converting;

                          const rawSummary = !isProcessing
                            ? (doc.markdown
                              ? (() => {
                                // Extract first non-empty paragraph from markdown
                                const para = doc.markdown
                                  .replace(/^---[\s\S]*?---\n?/, '')
                                  .split(/\n{2,}/)
                                  .map((p: string) => p.replace(/^#{1,6}\s+/gm, '').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`[^`]*`/g, '').replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[([^\]]+)\]\(.*?\)/g, '$1').replace(/^\s*[-*+>]\s*/gm, '').replace(/\s+/g, ' ').trim())
                                  .find((p: string) => p.length > 20);
                                return para || null;
                              })()
                              : null)
                            : "document is being processed";
                          const summary = rawSummary
                            ? rawSummary.trim().slice(0, 120)
                            : null;
                          return (
                            <Box
                              key={rowId}
                              onMouseEnter={() => setHoveredDocId(rowId)}
                              onMouseLeave={() => setHoveredDocId(null)}
                              onClick={() => {
                                const filePath = doc._fsFile?.path || doc.source || doc.path;
                                if (filePath && window.electronAPI?.showItemInFolder) {
                                  window.electronAPI.showItemInFolder(filePath);
                                }
                              }}
                              className="rounded-xl"
                              sx={{
                                padding: '12px 14px',
                                cursor: 'pointer',
                                display: 'flex',
                                gap: 1.25,
                                transition: 'box-shadow 0.15s ease',
                                border: '1px solid var(--sl-border-subtle)',
                                bgcolor: 'transparent',
                                '&:hover': { boxShadow: 'inset 0 0 0 1px var(--sl-brand-alpha-30)' },
                              }}
                            >
                              {/* Themed document glyph — matches the sidebar rail */}
                              <span className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, marginTop: 1, color: 'var(--sl-brand-primary)' }}>
                                {docIcon(18)}
                              </span>
                              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1">
                                    {filename}
                                  </span>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc); }}
                                    sx={{
                                      color: 'var(--sl-text-faint)',
                                      padding: '2px',
                                      '&:hover': { color: 'var(--sl-status-error)' },
                                    }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                                  </IconButton>
                                </Box>
                                {!isProcessing && summary && (
                                  <span className="text-[12px] text-sl-text-muted leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                                    {summary}
                                  </span>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: '2px' }}>
                                  {ext && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                      style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-faint)' }}
                                    >
                                      {ext}
                                    </span>
                                  )}
                                  {(() => {
                                    const status = isFsOnly ? 'local' : (docIndexStatus || 'pending');
                                    if (status === 'indexed') {
                                      const processedAt = processedDates[doc.id];
                                      let timeLabel = 'Indexed';
                                      if (processedAt) {
                                        const diffMs = Date.now() - new Date(processedAt).getTime();
                                        const diffMin = Math.floor(diffMs / 60000);
                                        const diffHr = Math.floor(diffMin / 60);
                                        const diffDay = Math.floor(diffHr / 24);
                                        if (diffMin < 1) timeLabel = 'Just now';
                                        else if (diffMin < 60) timeLabel = `${diffMin}m ago`;
                                        else if (diffHr < 24) timeLabel = `${diffHr}h ago`;
                                        else if (diffDay < 30) timeLabel = `${diffDay}d ago`;
                                        else timeLabel = new Date(processedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                      }
                                      // Success — outlined green, matching the label style guide.
                                      return (
                                        <span
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                          style={{ border: '1px solid rgba(52,211,153,0.3)', color: 'rgb(52,211,153)' }}
                                        >
                                          {timeLabel}
                                        </span>
                                      );
                                    }
                                    // Distinct colors per state — outlined (border at ~30% of the text color), never filled.
                                    const statusColor: Record<string, string> = {
                                      local: 'rgb(139,139,245)',
                                      indexing: 'rgb(250,204,21)',
                                      converting: 'rgb(250,204,21)',
                                      processing: 'rgb(250,204,21)',
                                      pending: 'rgb(148,163,184)',
                                      unknown: 'rgb(148,163,184)',
                                      failed: 'rgb(248,113,113)',
                                      error: 'rgb(248,113,113)',
                                    };
                                    const c = statusColor[status] || statusColor.pending;
                                    const border = c.replace('rgb(', 'rgba(').replace(')', ',0.3)');
                                    const label = status === 'failed' || status === 'error' ? 'Failed' : status === 'unknown' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1);
                                    return (
                                      <span
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                        style={{ border: `1px solid ${border}`, color: c }}
                                      >
                                        {label}
                                      </span>
                                    );
                                  })()}
                                  {fileSizeLabel && (
                                    <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)' }}>{fileSizeLabel}</span>
                                  )}
                                </Box>
                              </Box>
                            </Box>
                          );
                        })}
                    </Box>
                  )}
                </div>
              ) : (
                <Box className="text-sl-text-disabled text-xs py-4 text-center">
                  Select a project to view documents
                </Box>
              )}
            </div>
          )}

          {/* MCP Servers Section */}
          {activeSection === 'mcp' && (
            <div className="space-y-3">
              {/* Intro — what connections are, in the spirit of Claude Desktop */}
              <p className="m-0 px-1 text-[11px] leading-relaxed text-sl-text-muted">
                Connections let your assistant work with tools and data beyond this app. Connect one below to give it new capabilities through an MCP (Model Context Protocol) server.
              </p>

              {catalogLoading && mcpCatalog.length === 0 && (
                <Box className="flex items-center gap-2 py-3">
                  <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />
                  <span className="text-[11px] text-sl-text-disabled">Loading connections…</span>
                </Box>
              )}

              {/* Main list — curated connections first, then custom (hand-added)
                  servers tagged "Custom" so they read differently from ours. */}
              {(mcpCatalog.length > 0 || customMcpServers.length > 0) && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {mcpCatalog.map((entry) => {
                    const connected = connectedByUrl.get(normalizeMcpUrl(entry.remote_config?.server_url));
                    return (
                      <McpCatalogItem
                        key={entry.slug}
                        entry={entry}
                        connected={connected}
                        connecting={connectingSlug === entry.slug}
                        awaitingAuth={awaitingAuthSlug === entry.slug}
                        error={
                          catalogItemError?.slug === entry.slug
                            ? catalogItemError.message
                            : (connected && mcpDeleteError?.id === connected.id ? mcpDeleteError.message : '')
                        }
                        onConnect={handleConnectCatalogEntry}
                        onDisconnect={handleDeleteMcpServer}
                        onCancelAuth={handleCancelCatalogAuth}
                        onRefresh={handleRefreshMcpServer}
                      />
                    );
                  })}

                  {/* Section header separating curated from hand-added servers */}
                  {mcpCatalog.length > 0 && customMcpServers.length > 0 && (
                    <h4 className="text-[11px] font-bold text-sl-text-muted uppercase tracking-widest m-0 mt-3 mb-1 px-1">
                      Added by you
                    </h4>
                  )}

                  {customMcpServers.map((server, index) => {
                    const isSystem = !!(server as any).system;
                    return (
                      <McpServerItem
                        key={server.id || `mcp-${index}`}
                        server={server}
                        projectId={selectedProject?.id || ''}
                        onDelete={handleDeleteMcpServer}
                        onRefresh={handleRefreshMcpServer}
                        discovering={discoveringServerId === server.id}
                        isSystem={isSystem}
                        isCustom={!isSystem}
                        tagColors={customTagColorMap}
                        deleteError={mcpDeleteError?.id === server.id ? mcpDeleteError.message : ''}
                        onServerUpdate={(updatedServer) => {
                          setApiMcpServers(prev => {
                            const newServers = prev.map(s =>
                              s.id === updatedServer.id ? updatedServer : s
                            );
                            if (selectedProject?.id) {
                              mcpServerService.saveMcpServersToStorage(selectedProject.id, newServers);
                            }
                            return newServers;
                          });
                        }}
                      />
                    );
                  })}
                </Box>
              )}

              {catalogError && !catalogLoading && (
                <Box className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-sl-text-disabled">Couldn’t load connections.</span>
                  <span
                    role="button"
                    onClick={loadMcpCatalog}
                    className="text-[10px] cursor-pointer"
                    style={{ color: 'var(--sl-brand-primary)' }}
                  >
                    Retry
                  </span>
                </Box>
              )}

              {/* Add-your-own — always pinned to the bottom, styled like the
                  Models panel's "Need more power?" card to set it apart. */}
              <div
                className="rounded-xl"
                onDragOver={(e) => { e.preventDefault(); if (!mcpDropActive) setMcpDropActive(true); }}
                onDragLeave={(e) => {
                  // Only when the pointer actually leaves the card — dragging over
                  // a child fires dragleave for the parent too.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setMcpDropActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setMcpDropActive(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file) handleMcpFileDrop(file);
                }}
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: mcpDropActive ? 'var(--sl-brand-alpha-10)' : 'var(--sl-bg-surface-1)',
                  border: mcpDropActive ? '1px dashed var(--sl-brand-primary)' : '1px solid var(--sl-border-subtle)',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
              >
                <h4 className="text-[14px] font-bold text-sl-text-primary m-0 mb-1">Add your own</h4>
                <p className="text-[12px] leading-relaxed m-0 mb-3" style={{ color: 'var(--sl-text-muted)' }}>
                  Drop a connection file to add any MCP server. It describes the
                  server and, optionally, how to index its content.
                </p>
                {/* Drop zone. Visible at rest, not only mid-drag: a target that
                    appears once you are already dragging is only findable by
                    someone who guessed it was there. Clicking opens the file
                    picker, so it works without a drag at all. */}
                <input
                  ref={mcpTomlInputRef}
                  type="file"
                  accept=".toml"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMcpFileDrop(file);
                    e.target.value = '';
                  }}
                />
                <div
                  role="button"
                  onClick={() => !isAddingMcp && mcpTomlInputRef.current?.click()}
                  className="rounded-lg mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    padding: '10px',
                    border: `1px dashed ${mcpDropActive ? 'var(--sl-brand-primary)' : 'var(--sl-border-default)'}`,
                    backgroundColor: mcpDropActive ? 'var(--sl-brand-alpha-10)' : 'transparent',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <UploadFileIcon sx={{ fontSize: 13, color: mcpDropActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)' }} />
                  <span className="text-[10px]" style={{ color: mcpDropActive ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)' }}>
                    {mcpDropActive ? 'Drop to add this connection' : 'Drop a .toml connection file, or click to browse'}
                  </span>
                </div>

                {/* Hint and error share one grid cell, so the slot is always as tall
                    as the taller of the two and swapping them never shifts the UI. */}
                <Box className="grid text-[10px] mt-2.5 px-1">
                  <div className={`col-start-1 row-start-1 text-sl-text-disabled leading-snug ${mcpError ? 'invisible' : ''}`}>
                    A connection file names the server and how to reach it — a
                    <code className="font-mono text-sl-text-muted"> url </code>
                    for a remote one, or a
                    <code className="font-mono text-sl-text-muted"> package </code>
                    to run locally.
                    <div className="mt-2.5 italic">Local servers require <code className="font-mono not-italic font-bold text-sl-text-muted">uv</code> to be installed on your machine.</div>
                  </div>
                  {mcpError && (
                    <span className="col-start-1 row-start-1 text-red-400 whitespace-pre-line break-words">{mcpError}</span>
                  )}
                </Box>
              </div>
            </div>
          )}

          {/* Skills Section */}
          {activeSection === 'skills' && (
            <div>
              {(editingSkillIndex !== null || editingSkillIsNew) ? (
                /* Editing existing skill */
                <div>
                  <Box className="flex items-center gap-2 mb-3">
                    <IconButton
                      size="small"
                      onClick={() => { setEditingSkillIndex(null); setEditingSkillIsNew(false); setSkillHasUnsavedChanges(false); }}
                      sx={{ color: 'var(--sl-text-muted)', padding: '4px' }}
                    >
                      <ArrowBackIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <span className="text-xs text-sl-text-primary font-medium truncate">
                      {editingSkillIsNew ? 'New Skill' : (localSkills[editingSkillIndex!]?.name || 'Untitled Skill')}
                    </span>
                    {skillHasUnsavedChanges && (
                      <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />
                    )}
                  </Box>
                  <Box className="markdown-editor-container" sx={{
                    '& .EasyMDEContainer': { border: 'none' },
                    '& .CodeMirror': { bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)', borderRadius: '6px', color: 'var(--sl-text-primary)' },
                    '& .editor-toolbar': { borderColor: 'var(--sl-border-default)' },
                  }}>
                    <SimpleMDE
                      value={skillContent}
                      onChange={(value) => { setSkillContent(value); setSkillHasUnsavedChanges(true); }}
                      options={skillEditorOptions}
                    />
                  </Box>
                  <Box sx={{ fontSize: '10px', color: 'var(--sl-text-faint)', mt: 1, textAlign: 'right' }}>Markdown &middot; auto-saves</Box>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Skill List — card style, matching the Models panel */}
                  {localSkills.length > 0 && (
                    <div className="flex flex-col gap-2.5" style={{ marginTop: 12 }}>
                      {localSkills.map((skill, index) => (
                        <Box
                          key={`skill-${index}`}
                          role="button"
                          onMouseEnter={() => setHoveredSkillIndex(index)}
                          onMouseLeave={() => setHoveredSkillIndex(null)}
                          onClick={() => {
                            if (onTabChange) {
                              onTabChange({ id: `skill-${skill.id || index}`, type: 'skill', title: skill.name || 'Untitled Skill', data: { index } });
                            } else {
                              setEditingSkillIndex(index);
                              setEditingSkillIsNew(false);
                              setSkillContent(skill.content || '');
                              setSkillHasUnsavedChanges(false);
                            }
                          }}
                          className="rounded-xl"
                          sx={{
                            padding: '12px 14px',
                            cursor: 'pointer',
                            border: '1px solid var(--sl-border-subtle)',
                            bgcolor: 'transparent',
                            transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                            '&:hover': { boxShadow: 'inset 0 0 0 1px var(--sl-brand-alpha-30)' },
                          }}
                        >
                          {/* Header — themed skill icon, title, delete */}
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, color: 'var(--sl-brand-primary)' }}>
                              {skillIcon(18)}
                            </span>
                            <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1">
                              {skill.name || 'Untitled'}
                            </span>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSaveSkills) {
                                  onSaveSkills(localSkills.filter((_, i) => i !== index));
                                  setTimeout(() => loadSkillsFromDir(), 800);
                                }
                              }}
                              sx={{
                                color: 'var(--sl-text-faint)',
                                padding: '2px',
                                flexShrink: 0,
                                '&:hover': { color: 'var(--sl-status-error)' },
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </div>
                          {getSkillPreviewText(skill.content || '', skill.description) && (
                            <p
                              className="text-[12px] leading-relaxed mt-2 mb-0"
                              style={{
                                color: 'var(--sl-text-muted)',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical' as const,
                                overflow: 'hidden',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {getSkillPreviewText(skill.content || '', skill.description)}
                            </p>
                          )}
                        </Box>
                      ))}
                    </div>
                  )}

                  {/* Empty state — keeps the panel from looking bare with no skills */}
                  {localSkills.length === 0 && (
                    <div className="flex flex-col items-center text-center gap-2" style={{ marginTop: 20, padding: '24px 16px' }}>
                      <span
                        className="flex items-center justify-center"
                        style={{
                          width: 44, height: 44, borderRadius: '50%',
                          border: '1px solid var(--sl-border-subtle)',
                          color: 'var(--sl-brand-primary)',
                          opacity: 0.85,
                        }}
                      >
                        {skillIcon(22)}
                      </span>
                      <span className="text-[12px] font-semibold text-sl-text-secondary">No skills yet</span>
                      <span className="text-[11px] leading-relaxed text-sl-text-faint" style={{ maxWidth: 220 }}>
                        Create your first skill to tailor how the assistant responds. Type{' '}
                        <span className="font-mono" style={{ color: 'var(--sl-brand-primary)' }}>/skill-name</span>{' '}
                        in the chat box to get started.
                      </span>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* Project Settings Section */}
          {activeSection === 'settings' && selectedProject && currentProjectData && (
            <div className="space-y-6">
              {/* Project Name */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Project Name</div>
                <TextField
                  size="small"
                  value={localProjectName}
                  disabled={isSystemProject}
                  onChange={(e) => setLocalProjectName(e.target.value)}
                  onBlur={() => {
                    if (isSystemProject) return;
                    const trimmed = localProjectName.trim();
                    if (trimmed && trimmed !== selectedProject?.name) {
                      onRenameProject?.(trimmed);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!isSystemProject) {
                        const trimmed = localProjectName.trim();
                        if (trimmed && trimmed !== selectedProject?.name) {
                          onRenameProject?.(trimmed);
                        }
                      }
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Project name"
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <FolderOpenIcon
                          sx={{ fontSize: 16, color: 'var(--sl-text-muted)', cursor: 'pointer', '&:hover': { color: 'var(--sl-brand-primary)' } }}
                          onClick={() => {
                            if (!projectFolderPath) return;
                            (window as any).electronAPI?.openInFinder?.(projectFolderPath, { createIfMissing: true });
                          }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'var(--sl-bg-surface-1)',
                      fontSize: '0.75rem',
                      '& fieldset': { borderColor: 'var(--sl-border-default)' },
                      '&:hover fieldset': { borderColor: 'var(--sl-brand-alpha-30)' },
                      '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
                    },
                    '& .MuiInputBase-input': {
                      color: 'var(--sl-text-primary)',
                      padding: '8px 12px',
                      '&::placeholder': { color: 'var(--sl-text-muted)', opacity: 1 },
                      '&.Mui-disabled': {
                        color: 'var(--sl-text-muted)',
                        WebkitTextFillColor: 'var(--sl-text-muted)',
                      },
                    },
                  }}
                />
                <div className="text-[10px] text-sl-text-faint mt-1">
                  {isSystemProject ? 'Default project cannot be renamed' : 'Press Enter to save'}
                </div>
              </div>

              {/* Project Color */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Label Color</div>
                <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map((color: any) => (
                    <Box
                      key={color.value}
                      onClick={() => onColorChange?.(color.value)}
                      sx={{
                        borderRadius: '6px',
                        bgcolor: color.value,
                        cursor: 'pointer',
                        flex: '1 1 auto',
                        aspectRatio: '1',
                        border: (selectedProject?.color || currentProjectData?.color) === color.value ? '2px solid var(--sl-brand-primary)' : '2px solid transparent',
                        boxShadow: (selectedProject?.color || currentProjectData?.color) === color.value ? '0 0 0 2px var(--sl-brand-alpha-20)' : 'none',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          boxShadow: '0 0 0 2px var(--sl-brand-alpha-30)',
                        },
                      }}
                      title={color.name}
                    />
                  ))}
                </Box>
              </div>

              {/* Project Instructions — free-form text sent with every message */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Instructions</div>
                <Box
                  onClick={() => setShowInstructionsDialog(true)}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--sl-bg-surface-1)',
                    border: '1px solid var(--sl-border-default)',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'var(--sl-brand-alpha-30)' },
                  }}
                >
                  <NotesIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)', flexShrink: 0, mt: '1px' }} />
                  {projectInstructions ? (
                    <span className="text-xs text-[var(--sl-text-primary)] line-clamp-3 whitespace-pre-wrap break-words">
                      {projectInstructions}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--sl-text-muted)]">Add instructions</span>
                  )}
                </Box>
                <div className="flex items-center justify-between gap-2 mt-1 px-1">
                  <p className="text-sl-text-disabled text-[10px] leading-relaxed">
                    Saved in this project's memory.
                  </p>
                  {projectInstructions && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase flex-shrink-0"
                      style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}
                    >
                      Active
                    </span>
                  )}
                </div>
              </div>

              {/* Download Project — not available for the general/system project */}
              <div>
                <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Download</div>
                <Box
                  onClick={async () => {
                    if (exporting || !selectedProject?.id) return;
                    setExporting(true);
                    setExportDone(false);
                    try {
                      const result = await (window as any).electronAPI.exportProject(selectedProject.id);
                      if (result?.success) {
                        setExportDone(true);
                        setTimeout(() => setExportDone(false), 2000);
                      }
                    } catch (err) {
                      console.error('Export failed:', err);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--sl-bg-surface-1)',
                    border: '1px solid var(--sl-border-default)',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    opacity: exporting ? 0.5 : 1,
                    '&:hover': {
                      backgroundColor: 'var(--sl-bg-surface-1)',
                      borderColor: exporting ? 'var(--sl-border-default)' : 'var(--sl-brand-alpha-30)',
                    },
                  }}
                >
                  {exporting ? (
                    <CircularProgress size={16} sx={{ color: 'var(--sl-text-muted)' }} />
                  ) : exportDone ? (
                    <CheckIcon sx={{ fontSize: 16, color: 'var(--sl-brand-primary)' }} />
                  ) : (
                    <DownloadIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
                  )}
                  <span className="text-xs text-[var(--sl-text-primary)]">
                    {exporting ? 'Downloading...' : exportDone ? 'Downloaded' : (
                      <>Download <span className="text-[var(--sl-text-muted)] bg-[var(--sl-bg-surface-1)] px-1.5 py-0.5 rounded text-[11px]">{selectedProject.name || 'Project'}</span></>
                    )}
                  </span>
                </Box>
                <p className="text-sl-text-disabled text-[10px] leading-relaxed mt-1 px-1">
                  Download the project and all its contents as a zip file.
                </p>
              </div>
            </div>
          )}

        </Box>
      )}

      {/* Vertical Tab Bar on Right Edge */}
      <Box
        sx={{
          width: '48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          gap: 0.5,
        }}
      >
        <Tooltip title={railTip('Models', 'M')} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => toggleSection('models')}
              sx={{
                color: activeSection === 'models' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
              }}
              size="small"
            >
              {railIcon('models') ?? (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                <path d="M2 4l6-2.5L14 4v8l-6 2.5L2 12V4z" stroke="currentColor" strokeWidth="0.75" fill="none" />
                <path d="M8 6.5v8" stroke="currentColor" strokeWidth="0.5" />
                <path d="M2 4l6 2.5L14 4" stroke="currentColor" strokeWidth="0.5" fill="none" />
              </svg>
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={docSupported ? railTip('Documents', 'D') : 'Enable a document-capable model to use documents'} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              disabled={!docSupported}
              onClick={() => toggleSection('documents')}
              sx={{
                color: (activeSection === 'documents' || activeTab === 'document') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              {railIcon('documents') ?? (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                <path d="M4 1.5h5L12.5 5v9.5H4V1.5z" stroke="currentColor" strokeWidth="0.75" fill="none" />
                <path d="M9 1.5V5h3.5" stroke="currentColor" strokeWidth="0.5" fill="none" />
                <path d="M6 8h4.5M6 10.5h4.5M6 5.5h2" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" />
              </svg>
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={railTip('Connections', 'C')} placement="left">
          <span>
            <IconButton
              onClick={() => toggleSection('mcp')}
              sx={{
                color: (activeSection === 'mcp' || activeTab === 'mcp') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              {railIcon('mcp') ?? <PowerOutlinedIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={railTip('Skills', 'S')} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => toggleSection('skills')}
              sx={{
                color: (activeSection === 'skills' || activeTab === 'skill') ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
                '&.Mui-disabled': {
                  color: 'var(--sl-text-disabled)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              {railIcon('skills') ?? (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                <path d="M8 1.8l5 1.8v4.5c0 3.1-2.1 5.3-5 6.3-2.9-1-5-3.2-5-6.3V3.6l5-1.8z" stroke="currentColor" strokeWidth="0.75" fill="none" strokeLinejoin="round" />
                <path d="M8.9 4.2L5.8 8.7h2.1l-.8 3.1 3.1-4.6H8.1l.8-3z" fill="currentColor" stroke="currentColor" strokeWidth="0.4" strokeLinejoin="round" />
              </svg>
              )}
            </IconButton>
          </span>
        </Tooltip>

        {/* Spacer pushes Settings icon to bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Project Settings gear icon */}
        <Tooltip title={railTip('Project Settings', ',')} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => toggleSection('settings')}
              sx={{
                color: activeSection === 'settings' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
              }}
              size="small"
            >
              {railIcon('settings') ?? <SettingsIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>

      </Box>

      {/* Rendered at the root, not inside the settings panel, so switching rail
          sections (hotkeys included) can't unmount it mid-edit. */}
      <ProjectInstructionsDialog
        open={showInstructionsDialog}
        projectName={selectedProject?.name}
        instructions={projectInstructions}
        onClose={() => setShowInstructionsDialog(false)}
        onSave={async (text) => { await onInstructionsChange?.(text); }}
      />

    </Box>
  );
}
