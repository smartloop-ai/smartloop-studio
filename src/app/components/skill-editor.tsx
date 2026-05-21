import { Box } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import ConstructionIcon from '@mui/icons-material/Construction';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef } from 'react';

interface Skill {
  name: string;
  content: string;
  description?: string;
}

interface SkillEditorProps {
  selectedProject: any;
  projectSkills: Skill[];
  skillIndex: number;
  isSavingSkills: boolean;
  onSaveSkills: (skills: Skill[]) => void;
  isNew?: boolean;
}

/** Extract display name from content (frontmatter or first heading). */
const getDisplayName = (raw: string): string => {
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const nameMatch = fmMatch[1].match(/^name:\s*(.*)$/m);
    if (nameMatch?.[1]?.trim()) return nameMatch[1].trim();
  }
  const heading = raw.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || 'Untitled Skill';
};

const DEFAULT_SKILL_TEMPLATE = `---
name: My Skill Name
description:
---

[Add your instructions here]
`;

export default function SkillEditor({
  selectedProject,
  projectSkills,
  skillIndex,
  onSaveSkills,
  isNew = false,
}: SkillEditorProps) {
  const skill = isNew ? null : projectSkills[skillIndex];
  const [content, setContent] = useState(skill?.content || DEFAULT_SKILL_TEMPLATE);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editorRef = useRef<any>(null);

  // Keep latest values in refs so unmount cleanup can flush an unsaved save
  const contentRef = useRef(content);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const projectSkillsRef = useRef(projectSkills);
  const skillIndexRef = useRef(skillIndex);
  const isNewRef = useRef(isNew);
  const onSaveSkillsRef = useRef(onSaveSkills);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { hasUnsavedChangesRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
  useEffect(() => { projectSkillsRef.current = projectSkills; }, [projectSkills]);
  useEffect(() => { skillIndexRef.current = skillIndex; }, [skillIndex]);
  useEffect(() => { isNewRef.current = isNew; }, [isNew]);
  useEffect(() => { onSaveSkillsRef.current = onSaveSkills; }, [onSaveSkills]);

  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: ["words", "lines"] as const,
    toolbar: [
      'bold',
      'italic',
      'heading',
      '|',
      'unordered-list',
      'ordered-list',
      '|',
      'quote',
    ] as const,
    minHeight: '100%',
    placeholder: 'Add skills or guidelines for this project...',
  }), [selectedProject?.id]);

  // Keyboard shortcut: Ctrl/Cmd+S to save immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && content.trim()) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, content, projectSkills, skillIndex, isNew]);

  // Auto-save after 1.5s of inactivity
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasUnsavedChanges || !content.trim()) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, hasUnsavedChanges]);

  // Flush unsaved changes on unmount (tab close/switch)
  useEffect(() => {
    return () => {
      if (!hasUnsavedChangesRef.current) return;
      const latest = contentRef.current;
      if (!latest.trim()) return;
      const save = onSaveSkillsRef.current;
      if (!save) return;
      const name = getDisplayName(latest);
      if (isNewRef.current) {
        save([...projectSkillsRef.current, { name, content: latest }]);
      } else {
        const updated = projectSkillsRef.current.map((s, i) =>
          i === skillIndexRef.current ? { ...s, name, content: latest } : s
        );
        save(updated);
      }
    };
  }, []);

  const handleSave = () => {
    const name = getDisplayName(content);
    if (isNew) {
      onSaveSkills([...projectSkills, { name, content }]);
    } else {
      const updated = projectSkills.map((s, i) =>
        i === skillIndex ? { ...s, name, content } : s
      );
      onSaveSkills(updated);
    }
    setHasUnsavedChanges(false);
  };

  const handleChange = (value: string) => {
    setContent(value);
    setHasUnsavedChanges(true);
  };

  const displayName = getDisplayName(content);

  return (
    <Box
      className="h-full flex flex-col overflow-hidden"
      sx={{
        borderLeft: '1px solid var(--sl-white-alpha-10)',
        bgcolor: 'var(--sl-bg-base)',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 5,
          py: 1.5,
          borderBottom: '1px solid var(--sl-white-alpha-8)',
          bgcolor: 'rgba(255,255,255,0.02)',
        }}
      >
        <ConstructionIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
        <Box sx={{ fontSize: '12px', color: 'var(--sl-text-secondary)', fontWeight: 500 }}>
          {displayName || (isNew ? 'New Skill' : 'Untitled Skill')}
        </Box>
        <Box
          sx={{
            fontSize: '10px',
            color: 'var(--sl-text-muted)',
            bgcolor: 'var(--sl-white-alpha-8)',
            px: 1,
            py: 0.25,
            borderRadius: '3px',
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          SKILL
        </Box>
        {hasUnsavedChanges && (
          <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)', ml: 0.5 }} />
        )}
      </Box>

      {/* Editor */}
      <Box className="flex-1 flex flex-col overflow-hidden px-6 py-4 markdown-editor-container skill-editor-fullsize">
        <SimpleMDE
          ref={editorRef}
          value={content}
          onChange={handleChange}
          options={editorOptions}
        />
        <Box sx={{ fontSize: '10px', color: 'var(--sl-text-faint)', mt: 1.5, textAlign: 'right', flexShrink: 0 }}>
          Markdown &middot; auto-saves &middot; ⌘S to save
        </Box>
      </Box>
    </Box>
  );
}
