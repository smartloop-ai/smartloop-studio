import { Dialog, Box, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { dialogStyles } from '@/app/shared/utils';
import { McpCatalogEntry } from '@/app/services/mcp-server.service';
import { DeviceSignInState } from './right-sidebar/use-mcp-servers';

/**
 * Connects a catalog entry that has no browser OAuth flow — GitHub, for one.
 *
 * An entry with `remote_config.device_flow` leads with a device sign-in: the
 * user gets a one-time code to enter on the provider's site, and the
 * connection completes once they approve it there. Its `credential_fields`
 * stay available as a collapsed "paste a token instead" form. An entry with
 * only `credential_fields` shows the form straight away; it is built from
 * those fields, so a new kind of credential needs no change here.
 *
 * Stays open while the connection is checked, so a rejected token can be
 * corrected in place rather than starting over from the tile.
 */
interface McpCredentialDialogProps {
  /** The entry being connected; the dialog is open while this is set. */
  entry: McpCatalogEntry | null;
  submitting: boolean;
  error?: string;
  deviceSignIn: DeviceSignInState;
  onStartDeviceSignIn: () => void;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

const inputClass =
  'w-full rounded-lg px-3 py-2 text-[13px] font-mono bg-sl-bg-surface-1 text-sl-text-primary border border-sl-border outline-none transition-colors focus:border-sl-brand-primary placeholder:text-sl-text-muted';

const primaryButtonClass =
  'flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const secondaryButtonClass =
  'flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-sl-bg-surface-1 hover:bg-sl-bg-surface-2 text-sl-text-primary border border-sl-border transition-colors disabled:opacity-50';

const primaryButtonStyle = { borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' };

const openLink = (url: string) => {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.openExternal) {
    electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
};

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export default function McpCredentialDialog({
  entry,
  submitting,
  error,
  deviceSignIn,
  onStartDeviceSignIn,
  onClose,
  onSubmit,
}: McpCredentialDialogProps) {
  const fields = entry?.remote_config?.credential_fields || [];
  const hasDeviceFlow = !!entry?.remote_config?.device_flow;
  const name = entry?.display_name;

  const [values, setValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const formVisible = fields.length > 0 && (!hasDeviceFlow || showForm);

  // Start empty each time the dialog opens, so a credential never lingers in
  // state for the next entry.
  useEffect(() => {
    if (entry) {
      setValues({});
      setShowForm(false);
      setCopied(false);
    }
  }, [entry]);

  useEffect(() => {
    if (!entry || !formVisible) return;
    const t = setTimeout(() => firstInputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [entry, formVisible]);

  // Tick the code's countdown while it is on screen.
  useEffect(() => {
    if (deviceSignIn.phase !== 'waiting') return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [deviceSignIn.phase]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const complete = fields.every((f) => f.required === false || values[f.key]?.trim());

  const handleSubmit = () => {
    if (submitting || !formVisible || !complete) return;
    onSubmit(values);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch (e) {
      console.error('[MCP] Could not copy sign-in code:', e);
    }
  };

  const formToggleLabel =
    fields.length === 1 ? `Use a ${fields[0].label.toLowerCase()} instead` : 'Enter credentials instead';

  const renderDeviceSignIn = () => {
    if (deviceSignIn.phase === 'waiting') {
      const remaining = deviceSignIn.expiresAt - now;
      return (
        <Box className="flex flex-col gap-3 rounded-lg border border-sl-border bg-sl-bg-surface-1 p-4">
          <span className="text-[11px] text-sl-text-muted">Enter this code on {name}:</span>
          <Box className="flex items-center gap-2">
            <span className="text-2xl font-mono font-semibold tracking-[0.2em] text-sl-text-primary select-all">
              {deviceSignIn.userCode}
            </span>
            <IconButton
              size="small"
              onClick={() => copyCode(deviceSignIn.userCode)}
              sx={{ color: 'var(--sl-text-muted)' }}
              title="Copy code"
            >
              {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Box>
          <button
            type="button"
            onClick={async () => {
              await copyCode(deviceSignIn.userCode);
              openLink(deviceSignIn.verificationUri);
            }}
            className={`${primaryButtonClass} self-start`}
            style={primaryButtonStyle}
          >
            Copy code &amp; open {name}
            <OpenInNewIcon sx={{ fontSize: 13 }} />
          </button>
          <Box className="flex items-center gap-2 text-[11px] text-sl-text-muted">
            <CircularProgress size={11} sx={{ color: 'var(--sl-brand-primary)' }} />
            <span>Waiting for you to approve in the browser…</span>
            {remaining > 0 && <span className="ml-auto font-mono">{formatRemaining(remaining)}</span>}
          </Box>
        </Box>
      );
    }

    const starting = deviceSignIn.phase === 'starting';
    return (
      <Box className="flex flex-col gap-2">
        {deviceSignIn.phase === 'failed' && (
          <span className="text-[11px] text-red-400 whitespace-pre-line break-words">{deviceSignIn.message}</span>
        )}
        <button
          type="button"
          onClick={onStartDeviceSignIn}
          disabled={starting || submitting}
          className={primaryButtonClass}
          style={primaryButtonStyle}
        >
          {starting && <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />}
          {deviceSignIn.phase === 'failed' ? 'Try again' : `Sign in with ${name}`}
        </button>
        <span className="text-[11px] text-sl-text-muted leading-relaxed">
          You'll get a one-time code to enter on {name}, then approve access there.
        </span>
      </Box>
    );
  };

  const renderFields = () => (
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
  );

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
            <h3 className="text-sl-text-primary text-sm font-semibold">Connect {name}</h3>
            <p className="text-[11px] text-sl-text-muted leading-relaxed">
              {hasDeviceFlow
                ? `Sign in with your ${name} account to connect.`
                : `${name} connects with a credential you create on their side.`}{' '}
              The access it grants is stored by Smartloop on this machine and sent only to {name}.
            </p>
          </Box>
          <IconButton size="small" onClick={() => !submitting && onClose()} sx={{ color: 'var(--sl-text-muted)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {hasDeviceFlow && renderDeviceSignIn()}

        {hasDeviceFlow && fields.length > 0 && (
          <Box className="flex flex-col gap-3 border-t border-sl-border pt-3">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              disabled={submitting}
              className="flex items-center gap-1 self-start text-[11px] text-sl-text-muted hover:text-sl-text-primary transition-colors"
            >
              <ExpandMoreIcon
                sx={{ fontSize: 14, transition: 'transform 150ms', transform: showForm ? 'none' : 'rotate(-90deg)' }}
              />
              {formToggleLabel}
            </button>
          </Box>
        )}

        {formVisible && renderFields()}

        {error && (
          <span className="text-[11px] text-red-400 whitespace-pre-line break-words">{error}</span>
        )}

        <Box className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className={secondaryButtonClass}>
            Cancel
          </button>
          {formVisible && (
            <button
              type="submit"
              disabled={submitting || !complete}
              className={primaryButtonClass}
              style={primaryButtonStyle}
            >
              {submitting && <CircularProgress size={12} sx={{ color: 'var(--sl-brand-primary)' }} />}
              {submitting ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
