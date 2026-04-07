import { Box, CircularProgress } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
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

const DEFAULT_SKILL_TEMPLATE = `---
name: my-skill-name
description: A clear description of what this skill does and when to use it
---

# My Skill Name

[Add your instructions here that Claude will follow when this skill is active]

## Examples
- Example usage 1
- Example usage 2

## Guidelines
- Guideline 1
- Guideline 2
`;

export default function SkillEditor({
  selectedProject,
  projectSkills,
  skillIndex,
  isSavingSkills,
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

  // Keyboard shortcut: Ctrl+S to save
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

  const handleSave = () => {
    if (isNew) {
      // Extract name from frontmatter
      const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)[\s\n][\s\S]*?---/);
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
    <Box className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <Box className="flex-none flex items-center justify-between px-6 py-3 border-b border-gray-800">
        <Box className="flex items-center gap-2">
          <span className="text-sm text-white font-medium">
            {isNew ? 'New Skill' : (skill?.name || 'Untitled Skill')}
          </span>
          {hasUnsavedChanges && (
            <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />
          )}
        </Box>
        <button
          onClick={handleSave}
          disabled={!hasUnsavedChanges || isSavingSkills}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-all ${
            hasUnsavedChanges && !isSavingSkills
              ? 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 cursor-pointer border border-pink-500/30'
              : 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-gray-700'
          }`}
        >
          {isSavingSkills ? (
            <CircularProgress size={12} sx={{ color: 'inherit' }} />
          ) : (
            <SaveIcon sx={{ fontSize: 14 }} />
          )}
          <span>Save</span>
        </button>
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
