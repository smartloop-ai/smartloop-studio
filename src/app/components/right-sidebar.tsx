import { Box, IconButton, Tooltip } from '@mui/material';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import { useModelStatus } from '@/app/contexts/ModelStatusContext';
import { useThemeContext } from '@/app/contexts/ThemeContext';
import { usePanels } from '@/app/contexts/PanelContext';
import PixelRailIcon from './pixel-rail-icons';
import { ThemeRailIcon } from './theme-rail-icon';
import SkillsPanel from './right-sidebar/skills-panel';
import ConnectionsPanel from './right-sidebar/connections-panel';
import DocumentsPanel from './right-sidebar/documents-panel';
import ProjectSettingsPanel from './right-sidebar/project-settings-panel';
import { useProjectDocuments } from './right-sidebar/use-project-documents';
import { useMcpServers } from './right-sidebar/use-mcp-servers';
import LogsPanel from './logs-panel';
import { SIDEBAR_ANIM_MS } from './sidebar-motion';
import ProjectInstructionsDialog from './project-instructions-dialog';
import '../styles/home.css';
import { useState, useEffect, useRef, useCallback } from 'react';


import { OpenTab } from './conversation-tabs';
import { storageService } from '@/app/services/storage.service';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
  onFolderPathChange?: (path: string) => void;
  onColorChange?: (color: string) => void;
  onRenameProject?: (name: string) => void;
  onInstructionsChange?: (instructions: string) => Promise<void> | void;
  /** Flips the project's web search flag — owned by Home, surfaced in Project Settings. */
  onWebSearchChange?: (enabled: boolean) => void;
  user: any;
  activeTab: string;
  onTabChange?: (tab: OpenTab) => void;
  projectSkills?: Array<{ id?: string; name: string; content: string; description?: string }>;
  onSaveSkills?: (skills: Array<{ id?: string; name: string; content: string; description?: string }>) => void;
  onRefreshSkills?: () => void;
}

// Renders a theme's embedded rail SVG. The markup is sanitized at parse time
// (see theme-parse.ts) and uses currentColor, so it inherits the rail's states.

type RailSection = 'logs' | 'mcp' | 'documents' | 'skills' | 'settings';

// Cmd/Ctrl+Shift+<first letter of the section's label> opens a rail section —
// the VS Code convention, and unlike the digits these replaced, Shift+3/4 no
// longer collide with the macOS screenshot hotkeys. 'mcp' keys off its UI
// label, Connections. Project Settings takes Comma rather than a letter so it
// pairs with Cmd/Ctrl+, (app Settings page, sidebar.tsx) — Shift scopes it
// down to the current project.
const SECTION_HOTKEYS: Record<string, RailSection> = {
  KeyL: 'logs',
  KeyC: 'mcp',
  KeyD: 'documents',
  KeyS: 'skills',
  Comma: 'settings',
};

const IS_MAC = (window as any).electronAPI?.platform === 'darwin';

const SIDEBAR_STATE_KEY = 'right_sidebar_section';
const SIDEBAR_CLOSED = 'closed';
const RAIL_SECTIONS: RailSection[] = ['documents', 'skills', 'mcp', 'logs', 'settings'];

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
  onWebSearchChange,
  activeTab,
  onTabChange,
  projectSkills: _projectSkills = [],
  onSaveSkills,
  onRefreshSkills,
}: RightSidebarProps) {
  const { textModelEnabled } = useModelStatus();
  const { themeId, theme } = useThemeContext();
  const isMc = themeId === 'minecraft';
  // Themed rail icon for the active theme: the theme's own embedded SVG (from
  // its YAML `icons`) wins; Minecraft keeps its pixel icons; else the default.
  const railIcon = (name: RailSection) => {
    const svg = theme.icons?.[name];
    if (svg) return <ThemeRailIcon svg={svg} />;
    return isMc ? <PixelRailIcon name={name} /> : null;
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
  // Closed on a first launch: an app that opens with a panel already taking a
  // third of the window has decided for the user what they came here to do.
  // Once they open or close it themselves that choice is remembered and
  // restored below, so this default only applies to someone who never touched it.
  const [activeSection, setActiveSection] = useState<RailSection | null>(null);
  // Section to reopen with Cmd/Ctrl+B after the panel is closed. Documents is
  // the default: it's the section a project is actually set up through, where
  // Logs is a record you consult once something has run.
  const lastSectionRef = useRef<RailSection>('documents');
  useEffect(() => {
    if (activeSection) lastSectionRef.current = activeSection;
  }, [activeSection]);

  // Publish the panel's open/closed state app-wide. The chat view lays its empty
  // conversation out differently when a panel is already taking part of the
  // window — see PanelContext.
  const { setRightOpen } = usePanels();
  useEffect(() => {
    setRightOpen(!!activeSection);
  }, [activeSection, setRightOpen]);
  // Leaving the conversation view (e.g. for Settings) unmounts the panel, so
  // clear the flag rather than leave the rest of the app believing it's open.
  useEffect(() => () => setRightOpen(false), [setRightOpen]);

  // Panels start closed unless the user has already chosen a section.
  useEffect(() => {
    let cancelled = false;
    storageService.getItem(SIDEBAR_STATE_KEY).then((saved: any) => {
      if (cancelled || !saved || saved === SIDEBAR_CLOSED) return;
      if (!RAIL_SECTIONS.includes(saved)) return;
      if (saved === 'logs') return;
      setActiveSection(saved as RailSection);
    });
    return () => { cancelled = true; };
  }, []);

  // Documents need no capability of their own: reading them is text work, so
  // the section is open whenever what's enabled can hold a text conversation —
  // no model enabled (the default model answers) or any enabled model that
  // isn't vision-only. ModelStatusContext derives this from the optimistic
  // enabled set, so a toggle takes effect before the backend confirms.
  const docSupported = textModelEnabled;
  const [localFolderPath, setLocalFolderPath] = useState('');
  // The project's directory as the backend reports it (`cwd`, mirrored into
  // folder_path). Never guessed from the project name — the real location is
  // whatever SLP chose, and a guess opens a path that doesn't exist.
  const projectFolderPath = localFolderPath || selectedProject?.folder_path || '';

  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  // Instructions are local-only project metadata (SQLite), so they arrive on the
  // enriched project rather than the API's project payload.
  const projectInstructions: string = selectedProject?.instructions || '';

  // Documents. Owned here for the same reason as Connections: an upload has to
  // survive the section being closed.
  const docs = useProjectDocuments({
    projectId: selectedProject?.id,
    folderPath: currentProjectData?.folder_path || selectedProject?.folder_path || '',
  });

  // Connections. Owned here rather than in the panel: OAuth callbacks, tool
  // discovery polling and the per-project cache all have to keep working while
  // the section is closed.
  const mcp = useMcpServers({
    projectId: selectedProject?.id,
    projectMcp: currentProjectData?.mcp,
    sectionOpen: activeSection === 'mcp',
  });

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const isResizing = useRef(false);
  // Mirrors isResizing for rendering: a width transition during a drag makes the
  // edge lag behind the cursor, so the animation is switched off while resizing.
  const [resizing, setResizing] = useState(false);

  // What the panel body is showing. Trails activeSection on close so the panel
  // collapses with its content still in it, instead of the content vanishing and
  // an empty gap sliding shut.
  const [renderedSection, setRenderedSection] = useState<RailSection | null>(null);
  useEffect(() => {
    if (activeSection) {
      setRenderedSection(activeSection);
      return;
    }
    const timer = setTimeout(() => setRenderedSection(null), SIDEBAR_ANIM_MS);
    return () => clearTimeout(timer);
  }, [activeSection]);

  // Follow the backend's folder for this project. The name field moved to the
  // settings panel, which syncs its own.
  useEffect(() => {
    setLocalFolderPath(currentProjectData?.folder_path || '');
  }, [currentProjectData?.folder_path, selectedProject?.id]);

  // Resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    setResizing(true);
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
      setResizing(false);
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
    // Not persisted: this closes the panel because the model lost a capability,
    // not because the user asked, so it must not overwrite their preference.
    if (activeSection === 'documents' && !docSupported) setActiveSection(null);
  }, [activeSection, docSupported]);

  // A project switch deliberately leaves the open section alone. Persistent
  // chrome that reshuffles itself on a context change is the thing people find
  // unpredictable — the panel holds whatever you put it on until you move it.


  // Single entry point for opening/closing a rail section, shared by the rail
  // buttons and the keyboard shortcuts so both paths run the same side effects.
  const toggleSection = useCallback((section: RailSection) => {
    if (section === 'documents' && !docSupported) return;
    if (section === 'mcp') mcp.clearError();
    const next = activeSection === section ? null : section;
    setActiveSection(next);
    storageService.setItem(SIDEBAR_STATE_KEY, next ?? SIDEBAR_CLOSED);
    if (next === 'documents') docs.refreshDocuments();
    if (next === 'mcp') mcp.refresh();
    if (next === 'skills') onRefreshSkills?.();
  }, [activeSection, docSupported, docs, mcp, onRefreshSkills]);

  // Cmd/Ctrl+B toggles the whole panel, matching the sidebar-toggle convention
  // users bring from VS Code. Reopening restores whichever section was showing
  // last (see lastSectionRef) rather than snapping back to Connections. Matched
  // on e.code so a non-QWERTY layout still triggers on the B key.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'KeyB') return;
      e.preventDefault();
      if (activeSection) {
        setActiveSection(null);
        storageService.setItem(SIDEBAR_STATE_KEY, SIDEBAR_CLOSED);
        return;
      }
      const last = lastSectionRef.current;
      // Documents is unreachable when no enabled model can process them.
      // Documents is the default section, so the fallback when it's
      // unreachable has to be something else.
      toggleSection(last === 'documents' && !docSupported ? 'mcp' : last);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSection, docSupported, toggleSection]);

  // Cmd/Ctrl+Shift+C/D/S/, toggles the rail sections. Matched on e.code so a
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
        transition: resizing ? 'none' : `width ${SIDEBAR_ANIM_MS}ms ease, min-width ${SIDEBAR_ANIM_MS}ms ease, max-width ${SIDEBAR_ANIM_MS}ms ease`,
      }}
    >
      {/* Resize Handle */}
      {renderedSection && (
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
      {renderedSection && (
        <Box
          className="flex-1 overflow-y-auto p-3 space-y-4 sidebar-scroll"
          sx={{
            // minWidth 0 lets the body squeeze to nothing as the panel closes;
            // without it the flex default (auto) holds it at its content width
            // and the rail gets pushed out of the clipped box.
            minWidth: 0,
            opacity: activeSection ? 1 : 0,
            transition: resizing ? 'none' : `opacity ${SIDEBAR_ANIM_MS}ms ease`,
          }}
        >
          {/* Section Title */}
          <Box className="flex items-center justify-between pb-3 mb-2" sx={{ borderBottom: '1px solid var(--sl-border-subtle)' }}>
            <span className="text-[10px] font-medium text-sl-text-disabled uppercase tracking-wider">
              {renderedSection === 'logs' ? 'Logs' : renderedSection === 'mcp' ? 'Connections' : renderedSection === 'documents' ? 'Documents' : renderedSection === 'skills' ? 'Skills' : renderedSection === 'settings' ? 'Project Settings' : ''}
            </span>
          </Box>


          {/* Logs — read-only, so it needs no project or capability gate: there
              is always either a run to show or an empty state. */}
          {renderedSection === 'logs' && <LogsPanel projectId={selectedProject?.id} />}

          {/* Documents Section */}
          {renderedSection === 'documents' && (
            <DocumentsPanel
              docs={docs}
              project={selectedProject}
              onDeleteDocument={onDeleteDocument}
              docIcon={docIcon}
            />
          )}

          {renderedSection === 'mcp' && (
            <ConnectionsPanel mcp={mcp} projectId={selectedProject?.id} />
          )}

          {/* Skills Section */}
          {renderedSection === 'skills' && (
            <SkillsPanel
              projectId={selectedProject?.id}
              onSaveSkills={onSaveSkills}
              onTabChange={onTabChange}
            />
          )}

          {/* Project Settings Section */}
          {renderedSection === 'settings' && selectedProject && currentProjectData && (
            <ProjectSettingsPanel
              project={selectedProject}
              projectData={currentProjectData}
              folderPath={projectFolderPath}
              instructions={projectInstructions}
              onRenameProject={onRenameProject}
              onColorChange={onColorChange}
              onEditInstructions={() => setShowInstructionsDialog(true)}
              onWebSearchChange={onWebSearchChange}
            />
          )}

        </Box>
      )}

      {/* Vertical Tab Bar on Right Edge. Top to bottom the rail reads as what
          it's doing (Activity) → what it knows (Documents) → how it behaves
          (Skills) → what it can reach (Connections), with the pinned Settings
          gear for how the project is configured. Documents sits above Skills
          because panel visits, not composer use, set the order: you open
          Documents to add files and watch indexing, while a skill is fired with
          "/" and only authored here occasionally. The hotkeys key off each
          label's first letter, so this order is purely visual. */}
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
        <Tooltip title={docSupported ? railTip('Documents', 'D') : 'Switch to a document-capable model in the composer to use documents'} placement="left">
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

        <Tooltip title={railTip('Logs', 'L')} placement="left">
          <span className={'cursor-default'}>
            <IconButton
              onClick={() => toggleSection('logs')}
              sx={{
                color: activeSection === 'logs' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': {
                  color: 'var(--sl-brand-primary)',
                },
              }}
              size="small"
            >
              {railIcon('logs') ?? (
                /* Stamped entries: dots down a spine, each with its line. The
                   orchestration glyph this replaces described the routing the
                   panel shows, but the rail now says Logs, and an icon should
                   agree with its label. */
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <circle cx="3.4" cy="3.6" r="1.3" stroke="currentColor" strokeWidth="0.9" fill="none" />
                  <circle cx="3.4" cy="8" r="1.3" fill="currentColor" />
                  <circle cx="3.4" cy="12.4" r="1.3" stroke="currentColor" strokeWidth="0.9" fill="none" />
                  <path d="M6.6 3.6h6.2M6.6 8h6.2M6.6 12.4h3.6" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
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
