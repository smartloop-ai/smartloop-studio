import { Box, CircularProgress } from '@mui/material';
import { LogoMark } from '@/app/components/logo';

/**
 * The app's transient state: something is happening, here is what.
 *
 * Two shapes, one look. Inline (`mark` off) is a spinner beside a label, for
 * work happening within a screen — the size and colour the rest of the app
 * already uses for that (see the import button in sidebar.tsx). Branded
 * (`mark` on) puts the Smartloop mark above it, for the moments that take a
 * whole window: arriving from sign-in, waiting on a provider, opening the main
 * view.
 *
 * The branded shape exists because a bare spinner filling a window is
 * anonymous — it could belong to anything, and these are precisely the moments
 * the user is handing over trust. The mark takes --sl-brand-mark and the dot
 * --sl-brand-primary, so it re-tints with the theme rather than pinning the
 * screen to one palette.
 */
export default function LoadingState({
  label,
  mark = false,
}: {
  label?: string;
  /** Show the Smartloop mark above the spinner — for full-window waits. */
  mark?: boolean;
}) {
  const row = (
    <Box className="flex items-center justify-center gap-2">
      <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
      {label && <span className="text-[13px] text-sl-text-muted">{label}</span>}
    </Box>
  );

  if (!mark) return row;

  return (
    <Box className="flex flex-col items-center justify-center gap-4">
      <LogoMark className="h-8 w-8" />
      {row}
    </Box>
  );
}
