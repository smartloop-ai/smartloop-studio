import { Box } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAppStatus } from '@/app/contexts/AppStatusContext';

/**
 * Sidebar footer affordance for a staged update. Renders only once
 * electron-updater has the new version on disk — while it's still downloading
 * the sidebar stays quiet and Settings carries the progress.
 *
 * A single line — icon + "Update ready — restart". Restarting is an
 * accelerator, not a requirement: autoInstallOnAppQuit lands the update on the
 * next quit either way, so the version and that nuance live in the tooltip.
 */
export default function UpdatePill() {
    const { appUpdate, installUpdate } = useAppStatus();

    if (appUpdate.state !== 'downloaded') return null;

    const version = appUpdate.stagedVersion ?? appUpdate.latestVersion;

    return (
        <Box className="px-4 pb-4 pt-2">
            <Box
                onClick={installUpdate}
                role="button"
                title={`Restart now to switch to the new version${version ? ` (v${version})` : ''} — otherwise it installs the next time you quit`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer"
                sx={{
                    bgcolor: 'var(--sl-brand-alpha-10)',
                    border: '1px solid var(--sl-brand-alpha-20)',
                    color: 'var(--sl-brand-primary)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        bgcolor: 'var(--sl-brand-alpha-20)',
                        border: '1px solid var(--sl-brand-alpha-40)',
                    },
                }}
            >
                <RefreshIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                <Box className="flex-1 min-w-0 text-[12px] font-semibold leading-tight truncate">
                    Update ready — restart
                </Box>
            </Box>
        </Box>
    );
}
