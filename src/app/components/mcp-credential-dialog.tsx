import { Dialog, Box, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { dialogStyles } from '@/app/shared/utils';
import { McpCatalogEntry } from '@/app/services/mcp-server.service';

/**
 * Collects the credential a catalog entry needs before it can connect — a
 * GitHub personal access token, for one. Shown instead of a browser OAuth flow
 * for entries whose `remote_config.credential_fields` is non-empty; the form is
 * built from those fields, so a new kind of credential needs no change here.
 *
 * Stays open while the connection is checked, so a rejected token can be
 * corrected in place rather than starting over from the tile.
 */
interface McpCredentialDialogProps {
  /** The entry being connected; the dialog is open while this is set. */
  entry: McpCatalogEntry | null;
  submitting: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

const inputClass =
  'w-full rounded-lg px-3 py-2 text-[13px] font-mono bg-sl-bg-surface-1 text-sl-text-primary border border-sl-border outline-none transition-colors focus:border-sl-brand-primary placeholder:text-sl-text-muted';

const openLink = (url: string) => {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.openExternal) {
    electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
};

export default function McpCredentialDialog({
  entry,
  submitting,
  error,
  onClose,
  onSubmit,
}: McpCredentialDialogProps) {
  const fields = entry?.remote_config?.credential_fields || [];
  const [values, setValues] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Start empty each time the dialog opens, so a credential never lingers in
  // state for the next entry.
  useEffect(() => {
    if (entry) {
      setValues({});
      const t = setTimeout(() => firstInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [entry]);

  const complete = fields.every((f) => f.required === false || values[f.key]?.trim());

  const handleSubmit = () => {
    if (submitting || !complete) return;
    onSubmit(values);
  };

  return (
    <Dialog
      open={!!entry}
      onClose={() => !submitting && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: dialogStyles.paper }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box
        component="form"
        className="p-5 flex flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <Box className="flex items-start justify-between gap-4">
          <Box className="flex flex-col gap-1">
            <h3 className="text-sl-text-primary text-sm font-semibold">
              Connect {entry?.display_name}
            </h3>
            <p className="text-[11px] text-sl-text-muted leading-relaxed">
              {entry?.display_name} connects with a credential you create on their side.
              It is stored by Smartloop on this machine and sent only to {entry?.display_name}.
            </p>
          </Box>
          <IconButton size="small" onClick={() => !submitting && onClose()} sx={{ color: 'var(--sl-text-muted)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box className="flex flex-col gap-3">
          {fields.map((field, i) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider">
                {field.label}
              </span>
              <input
                ref={i === 0 ? firstInputRef : undefined}
                className={inputClass}
                type={field.secret === false ? 'text' : 'password'}
                value={values[field.key] || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
              {(field.help || field.help_url) && (
                <span className="text-[11px] text-sl-text-muted leading-relaxed">
                  {field.help}
                  {field.help_url && (
                    <button
                      type="button"
                      onClick={() => openLink(field.help_url!)}
                      className="inline-flex items-center gap-0.5 ml-1 text-sl-brand-primary hover:underline"
                    >
                      Create one
                      <OpenInNewIcon sx={{ fontSize: 11 }} />
                    </button>
                  )}
                </span>
              )}
            </label>
          ))}
        </Box>

        {error && (
          <span className="text-[11px] text-red-400 whitespace-pre-line break-words">{error}</span>
        )}

        <Box className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary border border-sl-border transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !complete}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
          >
            {submitting && <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />}
            {submitting ? 'Connecting…' : 'Connect'}
          </button>
        </Box>
      </Box>
    </Dialog>
  );
}
