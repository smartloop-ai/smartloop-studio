import { Dialog, Box, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useEffect, useRef, useState } from 'react';
import { dialogStyles } from '@/app/shared/utils';
import MarkdownToolbar from './markdown-toolbar';

/**
 * Editor for a project's instructions — free-form text prepended to every chat
 * turn in that project as a system message (see `sendMessage` in chat.tsx).
 *
 * The text is local-only metadata (SQLite `projects.instructions`); the SLP API
 * has no field for it, so nothing here round-trips through the backend.
 */

// Instructions ride along on EVERY turn, so a long block permanently eats the
// window of a small local model. Warn past this; don't block — the user may
// genuinely want a long brief on a large-context model.
const LONG_INSTRUCTIONS_CHARS = 4000;

interface ProjectInstructionsDialogProps {
  open: boolean;
  projectName?: string;
  instructions: string;
  onClose: () => void;
  onSave: (instructions: string) => Promise<void> | void;
}

export default function ProjectInstructionsDialog({
  open,
  projectName,
  instructions,
  onClose,
  onSave,
}: ProjectInstructionsDialogProps) {
  const [draft, setDraft] = useState(instructions || '');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset the draft to the saved value each time the dialog opens, so a
  // cancelled edit never leaks into the next one.
  useEffect(() => {
    if (open) {
      setDraft(instructions || '');
      setSaving(false);
      // Focus after the dialog's mount transition so the caret lands in the box.
      const t = setTimeout(() => textareaRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, instructions]);

  const dirty = draft !== (instructions || '');

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { ...dialogStyles.paperWide, maxWidth: '720px' } }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box className="p-5 flex flex-col gap-4">
        <Box className="flex items-start justify-between gap-4">
          <Box className="flex flex-col gap-1">
            <h3 className="text-sl-text-primary text-sm font-semibold">Project instructions</h3>
            <p className="text-[11px] text-sl-text-muted leading-relaxed">
              Saved in the project memory for{' '}
              <span className="text-sl-text-secondary font-medium">{projectName || 'this project'}</span>
              {' '}— use it for role, tone, background facts, and standing rules.
            </p>
          </Box>
          <IconButton size="small" onClick={() => !saving && onClose()} sx={{ color: 'var(--sl-text-muted)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Toolbar + textarea share one bordered surface so they read as a
            single editor; the focus ring moves to the wrapper via focus-within. */}
        <Box
          className="flex flex-col rounded-lg overflow-hidden border transition-colors focus-within:border-sl-brand-primary"
          sx={{ borderColor: 'var(--sl-border-default)', backgroundColor: 'var(--sl-bg-surface-1)' }}
        >
          <MarkdownToolbar
            textareaRef={textareaRef}
            value={draft}
            onChange={setDraft}
            className="px-2 py-1"
            hint="Markdown"
            // The editor surface is surface-1, where the default subtle rule is
            // invisible in most themes (border.subtle === bg.surface1).
            dividerColor="var(--sl-border-default)"
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter saves — Enter itself has to stay a newline here.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder={'Respond as a customer service rep.\n\nAlways cite the document you took the answer from.'}
            spellCheck={false}
            className="w-full h-[320px] resize-none p-4 text-[13px] leading-relaxed bg-transparent text-sl-text-primary border-none outline-none placeholder:text-sl-text-muted"
          />
        </Box>

        <Box className="flex items-center justify-between gap-4">
          <span className="text-[10px] text-sl-text-faint">
            {draft.trim().length === 0
              ? 'Empty — nothing saved to the project memory'
              : `${draft.trim().length.toLocaleString()} characters${draft.trim().length > LONG_INSTRUCTIONS_CHARS ? ' — long instructions leave less room for the conversation' : ''}`}
          </span>
          <Box className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary border border-sl-border transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
            >
              {saving && <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />}
              Save instructions
            </button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
