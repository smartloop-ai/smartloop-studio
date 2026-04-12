import { Box } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef } from 'react';

interface Skill {
  name: string;
  content: string;
}

interface SkillEditorProps {
  selectedProject: any;
  projectSkills: Skill[];
  skillIndex: number;
  isSavingSkills: boolean;
  onSaveSkills: (skills: Skill[]) => void;
  isNew?: boolean;
}

const DEFAULT_SKILL_TEMPLATE = `# My Skill Name

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
    minHeight: '500px',
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

  const handleSave = () => {
    if (isNew) {
      const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/) || content.match(/^#\s+(.+)$/m);
      const name = nameMatch?.[1]?.trim() || 'Untitled Skill';
      onSaveSkills([...projectSkills, { name, content }]);
    } else {
      const updated = projectSkills.map((s, i) =>
        i === skillIndex ? { ...s, content } : s
      );
      onSaveSkills(updated);
    }
    setHasUnsavedChanges(false);
  };

  const handleChange = (value: string) => {
    setContent(value);
    setHasUnsavedChanges(true);
  };

  return (
    <Box className="h-full flex flex-col overflow-hidden" sx={{ borderLeft: '1px solid var(--sl-white-alpha-10)' }}>
      {/* Header */}
      <Box className="flex-none flex items-center px-6 py-3 border-b border-gray-800">
        <Box className="flex items-center gap-2">
          <span className="text-sm text-white font-medium">
            {isNew ? 'New Skill' : (skill?.name || 'Untitled Skill')}
          </span>
          {hasUnsavedChanges && (
            <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />
          )}
        </Box>
      </Box>

      {/* Editor */}
      <Box className="flex-1 overflow-y-auto px-6 py-4">
        <Box className="max-w-4xl mx-auto markdown-editor-container">
          <SimpleMDE
            ref={editorRef}
            value={content}
            onChange={handleChange}
            options={editorOptions}
          />
        </Box>
      </Box>
    </Box>
  );
}
