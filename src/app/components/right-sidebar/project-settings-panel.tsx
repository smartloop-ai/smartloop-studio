import { useEffect, useState } from 'react';
import { Box, CircularProgress, InputAdornment, Switch, TextField } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
// Mirrors the FileDownloadIcon on the new-project dialog's Import card:
// arrow out for export, arrow in for import.
import FileUploadIcon from '@mui/icons-material/FileUpload';
import NotesIcon from '@mui/icons-material/Notes';
import CheckIcon from '@mui/icons-material/Check';
import Tooltip from '@mui/material/Tooltip';
import { PROJECT_COLORS } from '@/app/constants';
import { useAuthContext } from '@/app/contexts/AuthContext';

/**
 * Project Settings — name, color, folder, instructions, web search, export.
 *
 * Owns only what is genuinely transient (the rename field's local echo, the
 * export button's done-flash). Everything durable is the parent's: it holds the
 * project payload and the mutations that write it.
 */
interface ProjectSettingsPanelProps {
  project: any;
  projectData: any;
  /** The project's real directory as the backend reports it, never guessed. */
  folderPath: string;
  instructions: string;
  onRenameProject?: (name: string) => void;
  onColorChange?: (color: string) => void;
  onEditInstructions: () => void;
  /**
   * Flips the project's `web_search_enabled` flag. The chat status strip
   * mirrors it as an on/off pill; an absent handler means the toggle renders read-only
   * rather than pretending to save.
   */
  onWebSearchChange?: (enabled: boolean) => void;
}

export default function ProjectSettingsPanel({
  project,
  projectData,
  folderPath,
  instructions,
  onRenameProject,
  onColorChange,
  onEditInstructions,
  onWebSearchChange,
}: ProjectSettingsPanelProps) {
  // System projects (e.g. General) have a fixed name — the field is read-only.
  const isSystemProject = project?.system === true;
  const [localProjectName, setLocalProjectName] = useState(project?.name || '');
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  // Export is account-gated. Signed out is NOT a null user: useAuth stands in a
  // guest placeholder ({ name: 'Local', guest: true }), so the guest flag is
  // what decides.
  const [user] = useAuthContext();
  const isSignedIn = !!user && !user.guest;
  const canExport = isSignedIn;
  const exportBlocked = exporting || !canExport;

  // Web search is a backend project flag. Undefined reads as ON — projects
  // created before the flag existed behave as the backend does for them.
  const webSearchOn = projectData?.web_search_enabled !== false;
  // The hosted search endpoint needs a Smartloop token, so signed out the
  // switch is disabled (as are the chat footer toggle and the hotkey).
  const webSearchBlocked = !isSignedIn || !onWebSearchChange;

  // Follow the selected project, so the field never shows the last one's name.
  useEffect(() => {
    setLocalProjectName(project?.name || '');
  }, [project?.id, project?.name]);

  return (
  <div className="space-y-6">
    {/* Project Name */}
    <div>
      <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Project Name</div>
      <TextField
        size="small"
        value={localProjectName}
        disabled={isSystemProject}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalProjectName(e.target.value)}
        onBlur={() => {
          if (isSystemProject) return;
          const trimmed = localProjectName.trim();
          if (trimmed && trimmed !== project?.name) {
            onRenameProject?.(trimmed);
          }
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            if (!isSystemProject) {
              const trimmed = localProjectName.trim();
              if (trimmed && trimmed !== project?.name) {
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
                  if (!folderPath) return;
                  (window as any).electronAPI?.openInFinder?.(folderPath, { createIfMissing: true });
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
              border: (project?.color || projectData?.color) === color.value ? '2px solid var(--sl-brand-primary)' : '2px solid transparent',
              boxShadow: (project?.color || projectData?.color) === color.value ? '0 0 0 2px var(--sl-brand-alpha-20)' : 'none',
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
        onClick={() => onEditInstructions()}
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
        {instructions ? (
          <span className="text-xs text-[var(--sl-text-primary)] line-clamp-3 whitespace-pre-wrap break-words">
            {instructions}
          </span>
        ) : (
          <span className="text-xs text-[var(--sl-text-muted)]">Add instructions</span>
        )}
      </Box>
      <div className="flex items-center justify-between gap-2 mt-1 px-1">
        <p className="text-sl-text-disabled text-[10px] leading-relaxed">
          Saved in this project's memory.
        </p>
        {instructions && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase flex-shrink-0"
            style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}
          >
            Active
          </span>
        )}
      </div>
    </div>

    {/* Web search — one boolean, so it gets one row and no section header: a
        header plus a label plus a caption is three pieces of text explaining a
        switch. Also flipped by the search pill in the chat status strip and the
        Cmd/Ctrl+Alt+S hotkey (Home.tsx). */}
    <Tooltip title={isSignedIn ? '' : 'Log in to use web search'} placement="top" arrow>
    <div>
      <Box
        className="flex items-center justify-between gap-2"
        sx={{
          padding: '4px 8px 4px 12px',
          borderRadius: '6px',
          backgroundColor: 'var(--sl-bg-surface-1)',
          border: '1px solid var(--sl-border-default)',
          opacity: webSearchBlocked ? 0.5 : 1,
        }}
      >
        <Box className="flex items-center gap-2 min-w-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
            style={{ color: !webSearchBlocked && webSearchOn ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)' }}>
            <circle cx="12" cy="12" r="9.5" />
            <line x1="2.5" y1="12" x2="21.5" y2="12" />
            <path d="M12 2.5a14.5 14.5 0 0 1 3.8 9.5 14.5 14.5 0 0 1-3.8 9.5 14.5 14.5 0 0 1-3.8-9.5A14.5 14.5 0 0 1 12 2.5z" />
          </svg>
          <span className="text-xs text-[var(--sl-text-primary)] truncate">Web search</span>
        </Box>
        <Switch
          size="small"
          checked={!webSearchBlocked && webSearchOn}
          disabled={webSearchBlocked}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onWebSearchChange?.(e.target.checked)}
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--sl-brand-primary)' },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--sl-brand-primary)' },
          }}
        />
      </Box>
    </div>
    </Tooltip>

    {/* Export Project — pairs with Import in the new-project dialog
        (sidebar.tsx), so it uses the same word for the same .zip. Not
        available for the general/system project. */}
    <div>
      <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-2">Export</div>
      <Tooltip title={canExport ? '' : 'Log in to export this project'} placement="top" arrow>
      <Box
        onClick={async () => {
          if (exportBlocked || !project?.id) return;
          setExporting(true);
          setExportDone(false);
          try {
            const result = await (window as any).electronAPI.exportProject(project.id);
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
          cursor: exportBlocked ? 'not-allowed' : 'pointer',
          opacity: exportBlocked ? 0.5 : 1,
          '&:hover': {
            backgroundColor: 'var(--sl-bg-surface-1)',
            borderColor: exportBlocked ? 'var(--sl-border-default)' : 'var(--sl-brand-alpha-30)',
          },
        }}
      >
        {exporting ? (
          <CircularProgress size={16} sx={{ color: 'var(--sl-text-muted)' }} />
        ) : exportDone ? (
          <CheckIcon sx={{ fontSize: 16, color: 'var(--sl-brand-primary)' }} />
        ) : (
          <FileUploadIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
        )}
        <span className="text-xs text-[var(--sl-text-primary)]">
          {exporting ? 'Exporting...' : exportDone ? 'Exported' : (
            <>Export <span className="text-[var(--sl-text-muted)] bg-[var(--sl-bg-surface-1)] px-1.5 py-0.5 rounded text-[11px]">{project.name || 'Project'}</span></>
          )}
        </span>
      </Box>
      </Tooltip>
      <p className="text-sl-text-disabled text-[10px] leading-relaxed mt-1 px-1">
        {canExport ? 'Chats, docs and tools included, as a .zip.' : 'Log in to export this project as a .zip.'}
      </p>
    </div>
  </div>
  );
}
