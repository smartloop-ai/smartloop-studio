import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppStatus } from '@/app/contexts/AppStatusContext';

/**
 * Update-available badge for the top-right of the chat header. Shows only when
 * there's an update; a click opens Settings, which handles everything else.
 */
export default function UpdatePill() {
    const { appUpdate } = useAppStatus();
    const navigate = useNavigate();

    // Only when there is something the user can do about it. Store-managed (Mac
    // App Store) and unpackaged builds deliver updates elsewhere, so a pill
    // there would be a dead end. 'manual' builds — macOS and the Linux .deb —
    // can't install in place but Settings shows them a Download button, so the
    // pill still earns its place by pointing there.
    const canAct = appUpdate.delivery === 'self' || appUpdate.delivery === 'manual';
    const hasUpdate = canAct && (appUpdate.updateAvailable || appUpdate.state === 'downloaded');
    if (!hasUpdate) return null;

    return (
        <Box
            onClick={() => navigate('/settings')}
            role="button"
            title="Update available — open Settings"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full cursor-pointer flex-shrink-0"
            sx={{
                bgcolor: 'var(--sl-brand-alpha-10)',
                border: '1px solid var(--sl-brand-alpha-20)',
                color: 'var(--sl-brand-primary)',
                transition: 'all 0.12s ease',
                '&:hover': { bgcolor: 'var(--sl-brand-alpha-20)', borderColor: 'var(--sl-brand-alpha-40)' },
            }}
        >
            <Box className="rounded-full flex-shrink-0" sx={{ width: 6, height: 6, bgcolor: 'var(--sl-brand-primary)' }} />
            <Box className="text-[11px] font-semibold leading-none">Update available</Box>
        </Box>
    );
}
