import { Box, IconButton, TextField, InputAdornment, CircularProgress } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ConstructionIcon from '@mui/icons-material/Construction';
import SearchIcon from '@mui/icons-material/Search';
import CircleIcon from '@mui/icons-material/Circle';
import SaveIcon from '@mui/icons-material/Save';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef } from 'react';

interface Skill {
  name: string;
  content: string;
}

interface SkillsTabProps {
  selectedProject: any;
  projectSkills: Skill[];
  isSavingSkills: boolean;
  onSaveSkills: (skills: Skill[]) => void;
  setActiveTab: (tab: number) => void;
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

export default function SkillsTab({
  selectedProject,
  projectSkills,
  isSavingSkills,
  onSaveSkills,
  setActiveTab,
}: SkillsTabProps) {
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);
  const [editingSkillContent, setEditingSkillContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [hoveredSkillIndex, setHoveredSkillIndex] = useState<number | null>(null);
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
    minHeight: '400px',
    placeholder: 'Add skills or guidelines for this project...',
  }), [selectedProject?.id]);

  // Keyboard shortcut handler for Ctrl+S to save skill
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && editingSkillIndex !== null && editingSkillContent.trim()) {
          const isNew = editingSkillIndex >= projectSkills.length;
          const updated = isNew
            ? [...projectSkills, { name: newSkillName.trim(), content: editingSkillContent }]
            : projectSkills.map((s, i) => i === editingSkillIndex ? { ...s, content: editingSkillContent } : s);
          onSaveSkills(updated);
          if (isNew) setNewSkillName('');
          setHasUnsavedChanges(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, editingSkillIndex, editingSkillContent, projectSkills, onSaveSkills, newSkillName]);

  // Reset states when project changes
  useEffect(() => {
    setEditingSkillIndex(null);
    setEditingSkillContent('');
    setHasUnsavedChanges(false);
    setNewSkillName('');
  }, [selectedProject?.id]);

  const handleSave = () => {
    if (hasUnsavedChanges && !isSavingSkills && editingSkillContent.trim() && editingSkillIndex !== null) {
      const isNew = editingSkillIndex >= projectSkills.length;
      const updated = isNew
        ? [...projectSkills, { name: newSkillName.trim(), content: editingSkillContent }]
        : projectSkills.map((s, i) => i === editingSkillIndex ? { ...s, content: editingSkillContent } : s);
      onSaveSkills(updated);
      if (isNew) setNewSkillName('');
      setHasUnsavedChanges(false);
    }
  };

  return (
    <Box className="flex flex-col h-full overflow-hidden" sx={{ bgcolor: 'var(--sl-bg-primary)' }}>
      {/* Header */}
      <Box className="flex items-center justify-between px-6 py-4 border-b" sx={{ borderColor: 'var(--sl-white-alpha-10)' }}>
        <Box className="flex items-center gap-3">
          <IconButton
            size="small"
            onClick={() => setActiveTab(0)}
            sx={{ color: 'var(--sl-text-muted)', '&:hover': { color: 'var(--sl-text-primary)' } }}
          >
            <ArrowBackIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <span className="text-sm font-medium text-gray-300 uppercase tracking-wider">Skills</span>
        </Box>
        {editingSkillIndex !== null && (
          <button
            onClick={handleSave}
            disabled={isSavingSkills || !hasUnsavedChanges}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-normal rounded transition-all ${isSavingSkills
              ? 'text-pink-400 border border-pink-400 cursor-wait'
              : hasUnsavedChanges
                ? 'text-pink-400 hover:bg-pink-500/20 cursor-pointer border border-pink-400'
                : 'text-pink-500 border border-pink-400 cursor-default'
              }`}
          >
            {isSavingSkills ? (
              <>
                <CircularProgress size={12} sx={{ color: 'var(--sl-brand-light)' }} />
                <span>Saving...</span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <SaveIcon sx={{ fontSize: 14 }} />
                <span>Save</span>
              </>
            ) : (
              <>
                <CircleIcon className="text-pink-500" sx={{ fontSize: 14 }} />
                <span>Saved</span>
              </>
            )}
          </button>
        )}
      </Box>

      {/* Content */}
      <Box className="flex-1 overflow-y-auto px-6 py-4">
        {editingSkillIndex !== null ? (
          /* Skill Editor - full width */
          <div className="w-full max-w-4xl mx-auto">
            <button
              onClick={() => {
                const isNew = editingSkillIndex >= projectSkills.length;
                if (hasUnsavedChanges && editingSkillContent.trim()) {
                  const updated = isNew
                    ? [...projectSkills, { name: newSkillName.trim(), content: editingSkillContent }]
                    : projectSkills.map((s, i) => i === editingSkillIndex ? { ...s, content: editingSkillContent } : s);
                  onSaveSkills(updated);
                  if (isNew) setNewSkillName('');
                }
                setEditingSkillIndex(null);
                setEditingSkillContent('');
                setHasUnsavedChanges(false);
              }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 mb-4 transition-colors"
            >
              <span>&larr;</span>
              <span>Back to skills</span>
            </button>
            <div className="text-sm text-white font-medium mb-3">
              {editingSkillIndex < projectSkills.length
                ? projectSkills[editingSkillIndex]?.name
                : newSkillName}
            </div>
            <Box className="markdown-editor-container w-full">
              <SimpleMDE
                value={editingSkillContent}
                onChange={(value: string) => {
                  setEditingSkillContent(value);
                  const isNew = editingSkillIndex >= projectSkills.length;
                  setHasUnsavedChanges(isNew ? value.trim() !== '' : value !== projectSkills[editingSkillIndex]?.content);
                }}
                options={editorOptions}
                getMdeInstance={(instance) => {
                  editorRef.current = instance;
                }}
              />
            </Box>
            <p className="text-gray-400 text-xs leading-relaxed mt-3">
              Press Ctrl+S (Cmd+S on Mac) to save changes.
            </p>
          </div>
        ) : (
          /* Skills List */
          <div className="w-full max-w-4xl mx-auto space-y-3">
            {/* Search / Add Skill Input */}
            <TextField
              size="small"
              placeholder="Search or add a skill..."
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSkillName.trim()) {
                  const match = projectSkills.find(s => s.name.toLowerCase() === newSkillName.trim().toLowerCase());
                  if (match) {
                    const idx = projectSkills.indexOf(match);
                    setEditingSkillIndex(idx);
                    setEditingSkillContent(match.content);
                    setHasUnsavedChanges(false);
                  } else {
                    const template = DEFAULT_SKILL_TEMPLATE.replace(/my-skill-name/g, newSkillName.trim().toLowerCase().replace(/\s+/g, '-')).replace('My Skill Name', newSkillName.trim());
                    setEditingSkillIndex(projectSkills.length);
                    setEditingSkillContent(template);
                    setHasUnsavedChanges(false);
                  }
                }
              }}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'var(--sl-text-muted)' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'var(--sl-white-alpha-2)',
                  fontSize: '0.8125rem',
                  '& fieldset': { borderColor: 'var(--sl-white-alpha-10)' },
                  '&:hover fieldset': { borderColor: 'var(--sl-brand-alpha-30)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
                },
                '& .MuiInputBase-input': {
                  color: 'var(--sl-text-primary)',
                  padding: '10px 12px',
                  '&::placeholder': { color: 'var(--sl-text-muted)', opacity: 1 },
                },
              }}
            />

            {/* Skill Items */}
            {(() => {
              const query = newSkillName.trim().toLowerCase();
              const filtered = projectSkills.filter(s =>
                !(s as any).system &&
                (!query || s.name.toLowerCase().includes(query) || s.content.toLowerCase().includes(query))
              );
              return filtered.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filtered.map((skill) => {
                    const index = projectSkills.indexOf(skill);
                    return (
                      <Box
                        key={`skill-${index}`}
                        onClick={() => {
                          setEditingSkillIndex(index);
                          setEditingSkillContent(skill.content);
                          setHasUnsavedChanges(false);
                        }}
                        onMouseEnter={() => setHoveredSkillIndex(index)}
                        onMouseLeave={() => setHoveredSkillIndex(null)}
                        sx={{
                          padding: '14px',
                          borderRadius: '8px',
                          bgcolor: 'var(--sl-white-alpha-2)',
                          border: '1px solid var(--sl-white-alpha-5)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          position: 'relative',
                          '&:hover': {
                            bgcolor: 'var(--sl-white-alpha-5)',
                            borderColor: 'var(--sl-white-alpha-8)',
                          },
                        }}
                      >
                        <Box className="flex items-start gap-3">
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              bgcolor: 'var(--sl-brand-alpha-10)',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: '2px',
                            }}
                          >
                            <ConstructionIcon sx={{ fontSize: 18, color: 'var(--sl-brand-primary)' }} />
                          </Box>

                          <Box className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs text-white font-medium truncate">
                                {skill.name || 'Untitled Skill'}
                              </span>
                              <Box sx={{ display: 'flex', alignItems: 'center', opacity: hoveredSkillIndex === index ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSkillIndex(index);
                                    setEditingSkillContent(skill.content);
                                    setHasUnsavedChanges(false);
                                  }}
                                  sx={{
                                    color: 'var(--sl-text-muted)',
                                    padding: '4px',
                                    '&:hover': { color: 'var(--sl-brand-primary)', bgcolor: 'var(--sl-white-alpha-5)' },
                                  }}
                                >
                                  <EditOutlinedIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                                {!skill.name?.startsWith('system:') && (
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = projectSkills.filter((_, i) => i !== index);
                                      onSaveSkills(updated);
                                    }}
                                    sx={{
                                      color: 'var(--sl-text-muted)',
                                      padding: '4px',
                                      '&:hover': { color: 'var(--sl-status-error)', bgcolor: 'var(--sl-danger-alpha-10)' },
                                    }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                )}
                              </Box>
                            </div>
                            {skill.content && (
                              <div
                                className="text-[11px] text-gray-400 leading-relaxed"
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {skill.content.replace(/\n/g, ' ').trim()}
                              </div>
                            )}
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </div>
              ) : query ? (
                <Box className="text-center py-8">
                  <Box className="text-gray-400 text-sm mb-1">
                    No skills match "{newSkillName.trim()}"
                  </Box>
                  <Box className="text-gray-500 text-xs">
                    Press Enter to create it
                  </Box>
                </Box>
              ) : (
                <Box className="flex flex-col items-center justify-center py-16 text-center">
                  <ConstructionIcon sx={{ fontSize: 56, color: 'var(--sl-text-faint)', mb: 2 }} />
                  <Box className="text-gray-400 text-sm mb-1">
                    No skills configured
                  </Box>
                  <Box className="text-gray-500 text-xs">
                    Type a name above and press Enter to add one
                  </Box>
                </Box>
              );
            })()}
          </div>
        )}
      </Box>
    </Box>
  );
}
