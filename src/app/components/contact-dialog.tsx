import { Dialog, Box, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useEffect, useRef, useState } from 'react';
import { dialogStyles } from '@/app/shared/utils';
import MarkdownToolbar from './markdown-toolbar';

/**
 * In-app "Contact us" form. Deliberately a local form rather than a link out to
 * the website's contact page: App Store review treats a link-out to a web form
 * poorly, and the endpoint sends no CORS headers anyway. The POST runs in the
 * main process (`contact-submit` in main.js) — see there for the endpoint.
 */

interface ContactDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Signed-in user, used to prefill name/email. A guest is ignored: useAuth
   * stands in `{ name: 'Local', guest: true }` when nobody is signed in, and
   * prefilling that would submit "Local" as the person's name.
   */
  user?: { name?: string; email?: string; guest?: boolean } | null;
}

const inputClass =
  'w-full rounded-lg px-3 py-2 text-[13px] bg-sl-bg-surface-1 text-sl-text-primary border border-sl-border outline-none transition-colors focus:border-sl-brand-primary placeholder:text-sl-text-muted';

export default function ContactDialog({ open, onClose, user }: ContactDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  // Prefill values, empty for a guest — resolved outside the effect so it
  // depends on plain strings rather than the whole user object.
  const prefillName = user && !user.guest ? user.name || '' : '';
  const prefillEmail = user && !user.guest ? user.email || '' : '';

  // Reset on each open, prefilling from a real signed-in user so most people
  // only have to write the message itself. Guests start from empty fields.
  useEffect(() => {
    if (!open) return;
    setName(prefillName);
    setEmail(prefillEmail);
    setNotes('');
    setError('');
    setSent(false);
    setSending(false);
  }, [open, prefillName, prefillEmail]);

  const canSend = name.trim() && email.trim() && notes.trim() && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      const res = await (window as any).electronAPI?.submitContact?.({
        name: name.trim(),
        email: email.trim(),
        notes: notes.trim(),
      });
      if (res?.success) {
        setSent(true);
      } else {
        setError(res?.error || 'Could not send your message. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !sending && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: dialogStyles.paper }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box className="p-5 flex flex-col gap-4">
        {/* Once sent, the prompt to write no longer applies — the confirmation
            below speaks for itself, so only the close affordance stays. */}
        <Box className="flex items-start justify-between gap-4">
          {!sent && (
            <Box className="flex flex-col gap-1">
              <h3 className="text-sl-text-primary text-sm font-semibold">Contact us</h3>
              <p className="text-[11px] text-sl-text-muted leading-relaxed">
                Tell us what you need — a model you'd like supported, higher limits, or help getting set up.
              </p>
            </Box>
          )}
          <IconButton
            size="small"
            onClick={() => !sending && onClose()}
            sx={{ color: 'var(--sl-text-muted)', ml: 'auto' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {sent ? (
          <Box className="flex flex-col items-center text-center gap-2 py-6">
            <CheckCircleOutlineIcon sx={{ fontSize: 32, color: 'var(--sl-brand-primary)' }} />
            <span className="text-[13px] font-semibold text-sl-text-primary">Message sent</span>
            <span className="text-[11px] text-sl-text-muted">Our team will get back to you by email.</span>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors"
              style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
            >
              Done
            </button>
          </Box>
        ) : (
          <>
            <Box className="flex flex-col gap-3">
              {/* Name and email always render, in a fixed order: a signed-in user
                  gets them prefilled from their account but can still change who
                  the reply should go to. */}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider">Name</span>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider">Email</span>
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider">Message</span>
                {/* Same editor surface as the project-instructions dialog: the shared
                    Markdown toolbar above a plain textarea, framed as one box. */}
                <Box
                  className="flex flex-col rounded-lg overflow-hidden border transition-colors focus-within:border-sl-brand-primary"
                  sx={{ borderColor: 'var(--sl-border-default)', backgroundColor: 'var(--sl-bg-surface-1)' }}
                >
                  <MarkdownToolbar
                    textareaRef={notesRef}
                    value={notes}
                    onChange={setNotes}
                    className="px-2 py-1"
                    hint="Markdown"
                    // Toolbar sits on surface-1, where the default subtle rule is
                    // invisible in most themes (border.subtle === bg.surface1).
                    dividerColor="var(--sl-border-default)"
                  />
                  <textarea
                    ref={notesRef}
                    className="w-full h-[130px] resize-none p-3 text-[13px] leading-relaxed bg-transparent text-sl-text-primary border-none outline-none placeholder:text-sl-text-muted"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => {
                      // Cmd/Ctrl+Enter sends; plain Enter stays a newline.
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="What can we help with?"
                    spellCheck={false}
                  />
                </Box>
              </div>
            </Box>

            {error && (
              <span className="text-[11px]" style={{ color: 'var(--sl-status-error)' }}>{error}</span>
            )}

            <Box className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary border border-sl-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
              >
                {sending && <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />}
                {sending ? 'Sending…' : 'Send message'}
              </button>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
}
