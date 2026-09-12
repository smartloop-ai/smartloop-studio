import { Box, CircularProgress } from '@mui/material';

/**
 * The app's transient state: something is happening, here is what.
 *
 * Exists so the moments between screens look like one app. They had drifted —
 * different spinner sizes, one label in secondary and another in muted, one
 * with a logo above it and one without — which reads as three unrelated
 * screens rather than three pauses in the same one.
 *
 * Matches what the rest of the app already does for in-place work (see the
 * import button in sidebar.tsx): a 14px spinner in the brand colour with the
 * label beside it, never beneath.
 */
export default function LoadingState({ label }: { label?: string }) {
  return (
    <Box className="flex items-center justify-center gap-2">
      <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
      {label && <span className="text-[13px] text-sl-text-muted">{label}</span>}
    </Box>
  );
}
