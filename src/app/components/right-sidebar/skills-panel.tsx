import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CircleIcon from '@mui/icons-material/Circle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../../styles/markdown-editor.css';
import { getLocalApiEndpoint } from '@/app/constants';
import { OpenTab } from '../conversation-tabs';
import { useThemeIcon } from '../theme-rail-icon';

export interface Skill {
  id?: string;
  name: string;
  content: string;
  description?: string;
}

// Deprecated built-in skills hidden from the UI (compared by normalized name).
const DEPRECATED_SKILL_NAMES = new Set(['fetchurl']);
const normSkillName = (s: string) => (s || '').replace(/[\s_-]+/g, '').toLowerCase();

/** Map a skills API response to the local shape, dropping deprecated skills. */
const mapProjectSkills = (data: any): Skill[] => {
  const list = Array.isArray(data) ? data : (data?.skills ?? []);
  return list
    .map((s: any) => ({ id: s.id || s.name, name: s.name || '', content: s.content || '', description: s.description || '' }))
    .filter((s: any) => s.name && !DEPRECATED_SKILL_NAMES.has(normSkillName(s.name)));
};

/** First few meaningful lines of a skill, for the card preview. */
const getSkillPreviewText = (content: string, description?: string) => {
  const source = (description && description.trim()) ? description : content;
  const withoutFrontMatter = source.replace(/^---[\s\S]*?---\s*/m, '').trim();
  const lines = withoutFrontMatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';
  return lines.slice(0, 3).join('\n');
};

/** The default shield, for themes that ship no skill artwork of their own. */
function DefaultSkillGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <path d="M8 1.8l5 1.8v4.5c0 3.1-2.1 5.3-5 6.3-2.9-1-5-3.2-5-6.3V3.6l5-1.8z" stroke="currentColor" strokeWidth="0.75" fill="none" strokeLinejoin="round" />
      <path d="M8.9 4.2L5.8 8.7h2.1l-.8 3.1 3.1-4.6H8.1l.8-3z" fill="currentColor" stroke="currentColor" strokeWidth="0.4" strokeLinejoin="round" />
    </svg>
  );
}

interface SkillsPanelProps {
  projectId?: string;
  onSaveSkills?: (skills: Skill[]) => void;
  /** When set, a card opens the skill as a tab instead of the inline editor. */
  onTabChange?: (tab: OpenTab) => void;
}

/**
 * Skills for the current project.
 *
 * Loads its own list rather than taking one as a prop: skills are edited here,
 * in editor tabs, and written by SLP itself when a project is created, so the
 * panel treats the API as the source of truth and refetches on the `skillsSaved`
 * event other surfaces fire.
 *
 * The panel only mounts while its rail section is open, so "load when the
 * section activates" is just "load on mount".
 */
export default function SkillsPanel({ projectId, onSaveSkills, onTabChange }: SkillsPanelProps) {
  const themeIcon = useThemeIcon();
  const skillIcon = (size = 18) => themeIcon('skills', size) ?? <DefaultSkillGlyph size={size} />;

  const [skills, setSkills] = useState<Skill[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [content, setContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const base = await getLocalApiEndpoint();
      const res = await fetch(`${base}/v1/projects/${projectId}/skills`);
      if (res.ok) setSkills(mapProjectSkills(await res.json()));
    } catch { /* silent */ }
  }, [projectId]);

  // Retry a few times: SLP writes a new project's default skills to disk shortly
  // after the project itself exists, so the first read can legitimately be empty.
  useEffect(() => {
    let cancelled = false;
    setSkills([]);
    // Switching projects drops you out of the editor — the skill you were in
    // belongs to the project you just left.
    setEditingIndex(null);
    setEditingIsNew(false);
    setContent('');
    setHasUnsavedChanges(false);
    if (!projectId) return;

    const attempt = async (retriesLeft: number) => {
      if (cancelled) return;
      try {
        const base = await getLocalApiEndpoint();
        const res = await fetch(`${base}/v1/projects/${projectId}/skills`);
        if (cancelled) return;
        if (res.ok) {
          const mapped = mapProjectSkills(await res.json());
          setSkills(mapped);
          if (mapped.length === 0 && retriesLeft > 0) setTimeout(() => attempt(retriesLeft - 1), 1500);
        }
      } catch { /* silent */ }
    };

    attempt(3);
    return () => { cancelled = true; };
  }, [projectId]);

  // Refresh when skills are saved elsewhere (e.g. a skill editor tab).
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('skillsSaved', handler);
    return () => window.removeEventListener('skillsSaved', handler);
  }, [load]);

  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: false as const,
    toolbar: false as const,
    minHeight: '200px',
    placeholder: 'Add skills or guidelines for this project...',
  }), []);

  const save = useCallback(() => {
    if (!onSaveSkills) return;
    if (editingIsNew) {
      const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/) || content.match(/^#\s+(.+)$/m);
      const name = nameMatch?.[1]?.trim() || 'Untitled Skill';
      onSaveSkills([...skills, { name, content }]);
      setEditingIndex(skills.length);
      setEditingIsNew(false);
      setTimeout(() => load(), 800);
    } else if (editingIndex !== null) {
      onSaveSkills(skills.map((s, i) => (i === editingIndex ? { ...s, content } : s)));
      setTimeout(() => load(), 800);
    }
    setHasUnsavedChanges(false);
  }, [onSaveSkills, editingIsNew, editingIndex, content, skills, load]);

  // Auto-save 1.5s after typing stops.
  useEffect(() => {
    if (!hasUnsavedChanges || !content.trim()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { save(); }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [content, hasUnsavedChanges, save]);

  // Ctrl/Cmd+S for skill save. e.code plus the Alt/Shift bail-out keeps this off
  // the other two S bindings — Ctrl+Alt+S (web search) and Ctrl+Shift+S (the
  // Skills section itself). Alt is the one that actually collided: on
  // Windows/Linux e.key stays 's' under Alt, so toggling web search with the
  // editor open also saved.
  useEffect(() => {
    if (editingIndex === null && !editingIsNew) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        if (hasUnsavedChanges && content.trim()) save();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingIndex, editingIsNew, hasUnsavedChanges, content, save]);

  if (editingIndex !== null || editingIsNew) {
    return (
      <div>
        <Box className="flex items-center gap-2 mb-3">
          <IconButton
            size="small"
            onClick={() => { setEditingIndex(null); setEditingIsNew(false); setHasUnsavedChanges(false); }}
            sx={{ color: 'var(--sl-text-muted)', padding: '4px' }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <span className="text-xs text-sl-text-primary font-medium truncate">
            {editingIsNew ? 'New Skill' : (skills[editingIndex!]?.name || 'Untitled Skill')}
          </span>
          {hasUnsavedChanges && <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />}
        </Box>
        <Box className="markdown-editor-container" sx={{
          '& .EasyMDEContainer': { border: 'none' },
          '& .CodeMirror': { bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)', borderRadius: '6px', color: 'var(--sl-text-primary)' },
          '& .editor-toolbar': { borderColor: 'var(--sl-border-default)' },
        }}>
          <SimpleMDE
            value={content}
            onChange={(value) => { setContent(value); setHasUnsavedChanges(true); }}
            options={editorOptions}
          />
        </Box>
        <Box sx={{ fontSize: '10px', color: 'var(--sl-text-faint)', mt: 1, textAlign: 'right' }}>Markdown &middot; auto-saves</Box>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {skills.length > 0 && (
        <div className="flex flex-col gap-2.5" style={{ marginTop: 12 }}>
          {skills.map((skill, index) => (
            <Box
              key={`skill-${index}`}
              role="button"
              onClick={() => {
                if (onTabChange) {
                  onTabChange({ id: `skill-${skill.id || index}`, type: 'skill', title: skill.name || 'Untitled Skill', data: { index } });
                } else {
                  setEditingIndex(index);
                  setEditingIsNew(false);
                  setContent(skill.content || '');
                  setHasUnsavedChanges(false);
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
                      onSaveSkills(skills.filter((_, i) => i !== index));
                      setTimeout(() => load(), 800);
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
      {skills.length === 0 && (
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
  );
}
