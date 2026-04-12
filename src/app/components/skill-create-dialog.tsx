import { useState, useMemo, useRef, useEffect } from 'react';
import { Box, Dialog, IconButton, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { dialogStyles } from '@/app/shared/utils';

interface SkillCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (skill: { name: string; content: string }) => void;
  initialContent?: string;
  initialName?: string;
}

const DEFAULT_TEMPLATE = `[Add your instructions here]
`;

export default function SkillCreateDialog({
  open,
  onClose,
  onSave,
  initialContent,
  initialName,
}: SkillCreateDialogProps) {
  const [name, setName] = useState(initialName || '');
  const [content, setContent] = useState(initialContent || DEFAULT_TEMPLATE);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setName(initialName || '');
      setContent(initialContent || DEFAULT_TEMPLATE);
    }
  }, [open, initialContent, initialName]);

  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: false as const,
    toolbar: false as const,
    minHeight: '250px',
    placeholder: 'Write your skill instructions in markdown...',
  }), []);

  const handleSave = () => {
    const skillName = name.trim() || 'Untitled Skill';
    onSave({ name: skillName, content });
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.files?.length) return;
    const file = e.dataTransfer.files[0];
    if (!file.name.endsWith('.md') && file.type !== 'text/markdown' && file.type !== 'text/plain') return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setContent(reader.result);
        if (!name) {
          const heading = reader.result.match(/^#\s+(.+)$/m);
          setName(heading?.[1]?.trim() || file.name.replace(/\.md$/i, ''));
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: dialogStyles.paper }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box
        className="relative p-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 12,
            top: 12,
            color: 'var(--sl-text-disabled)',
            '&:hover': { color: 'var(--sl-text-primary)', bgcolor: 'var(--sl-bg-surface-1)' },
          }}
        >
          <CloseIcon />
        </IconButton>

        <h3 className="text-white font-semibold text-lg mb-5">New Skill</h3>

        <Box className="space-y-4">
          <TextField
            size="small"
            placeholder="Skill name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            sx={{
              '& .MuiOutlinedInput-root': {
                color: 'white',
                bgcolor: 'transparent',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                '& fieldset': { borderColor: 'var(--sl-white-alpha-10)' },
                '&:hover fieldset': { borderColor: 'var(--sl-white-alpha-20)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--sl-brand-primary)' },
              },
              '& .MuiInputBase-input::placeholder': { color: 'var(--sl-text-faint)', opacity: 1 },
            }}
          />

          <Box className="markdown-editor-container" sx={{
            '& .EasyMDEContainer': { border: 'none' },
            '& .CodeMirror': {
              bgcolor: 'var(--sl-white-alpha-2)',
              border: '1px solid var(--sl-white-alpha-10)',
              borderRadius: '6px',
              color: 'var(--sl-text-primary)',
            },
          }}>
            <SimpleMDE
              value={content}
              onChange={(value) => setContent(value)}
              options={editorOptions}
              getMdeInstance={(instance) => { editorRef.current = instance; }}
            />
          </Box>

          <Box className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600">Markdown &middot; Drop .md file to import</span>
            <Box className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-transparent hover:bg-gray-800 text-gray-400 rounded-lg border border-gray-800 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!content.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SaveIcon sx={{ fontSize: 16 }} />
                Save Skill
              </button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
