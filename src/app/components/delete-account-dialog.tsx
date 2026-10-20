import { Dialog, Box, IconButton, CircularProgress, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useEffect, useState } from 'react';
import { dialogStyles } from '@/app/shared/utils';

/**
 * Account deletion, in-app and self-serve (App Review guideline 5.1.1(v)).
 *
 * The delete itself runs in the main process (`auth-delete-account` in
 * main.js) through the local service, which holds the token: the cloud
 * removes the account and everything it owns, and the service drops the
 * stored credentials so the app is signed out. On success the dialog fires
 * `onDeleted` straight away — the rest of the UI signs out behind it — and
 * stays open on a confirmation so the person sees that it happened.
 */

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  /** Signed-in user; the email is what the person types to confirm. */
  user?: { email?: string; name?: string } | null;
  /** Fired once the account is gone, before the dialog closes. */
  onDeleted: () => void;
}

export default function DeleteAccountDialog({ open, onClose, user, onDeleted }: DeleteAccountDialogProps) {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(false);

  // Typing the address is the confirmation step; the word stands in for an
  // account whose profile carried no email.
  const phrase = user?.email || 'DELETE';
  const canDelete = confirm.trim() === phrase && !deleting;

  useEffect(() => {
    if (!open) return;
    setConfirm('');
    setError('');
    setDeleted(false);
    setDeleting(false);
  }, [open]);

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError('');
    try {
      const res = await window.electronAPI?.authDeleteAccount?.();
      if (res?.success) {
        setDeleted(true);
        onDeleted();
      } else {
        setError(res?.error || 'Could not delete your account. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !deleting && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: dialogStyles.paper }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box className="relative p-6">
        <IconButton
          onClick={onClose}
          disabled={deleting}
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

        {deleted ? (
          <Box className="flex flex-col items-center text-center gap-2 py-6">
            <CheckCircleOutlineIcon sx={{ fontSize: 32, color: 'var(--sl-brand-primary)' }} />
            <span className="text-[13px] font-semibold text-sl-text-primary">Account deleted</span>
            <span className="text-[11px] text-sl-text-muted">
              Your Smartloop account has been removed and you've been signed out. Everything on this computer is still here.
            </span>
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
            <Box className="flex items-start gap-3 mb-4">
              <Box
                className="flex items-center justify-center shrink-0 w-10 h-10 rounded-[10px]"
                sx={{ bgcolor: 'var(--sl-danger-alpha-10)', border: '1px solid var(--sl-danger-alpha-20)' }}
              >
                <DeleteOutlineIcon sx={{ color: 'var(--sl-status-error)', fontSize: 24 }} />
              </Box>
              <Box className="flex-1">
                <h3 className="text-sl-text-primary font-semibold text-lg mb-1">Delete account</h3>
                <p className="text-sl-text-muted text-sm leading-relaxed">
                  This permanently deletes your Smartloop account
                  {user?.email ? <> <span className="text-sl-text-primary font-medium">{user.email}</span></> : null}
                  {' '}and everything stored with it: your profile, your Pro plan if you have one, and any web search credits.
                  Projects, documents and conversations live only on this computer and are not removed.
                </p>
              </Box>
            </Box>

            <Box className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--sl-danger-alpha-10)', border: '1px solid var(--sl-danger-alpha-30)' }}>
              <Box className="text-sl-status-error text-sm mb-3">
                <strong>Warning:</strong> This cannot be undone. Type <span className="font-mono">{phrase}</span> to confirm.
              </Box>
              <TextField
                fullWidth
                placeholder={phrase}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(); }}
                error={!!error}
                helperText={error}
                disabled={deleting}
                autoComplete="off"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'var(--sl-text-primary)',
                    bgcolor: 'var(--sl-bg-surface-1)',
                    '& fieldset': { borderColor: 'var(--sl-danger-alpha-30)' },
                    '&:hover fieldset': { borderColor: 'var(--sl-danger-alpha-50)' },
                    '&.Mui-focused fieldset': { borderColor: 'var(--sl-status-error)' },
                  },
                  '& .MuiFormHelperText-root': { color: 'var(--sl-status-error)' },
                }}
              />
            </Box>

            <Box className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary rounded-lg border border-sl-border-default transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sl-status-error hover:opacity-90 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <CircularProgress size={18} sx={{ color: 'white' }} />
                    Deleting…
                  </>
                ) : (
                  <>
                    <DeleteOutlineIcon fontSize="small" />
                    Delete account
                  </>
                )}
              </button>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
}
