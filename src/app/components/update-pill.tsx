import { Box } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useAppStatus } from '@/app/contexts/AppStatusContext';

/**
 * Sidebar footer affordance for a staged update. Renders only once
 * electron-updater has the new version on disk — while it's still downloading
 * the sidebar stays quiet and Settings carries the progress.
 *
 * Restarting is an accelerator, not a requirement: autoInstallOnAppQuit lands
 * the update on the next quit either way. The second line spells out what the
 * click does, so the row needs no trailing icon to explain itself.
 */
export default function UpdatePill() {
    const { appUpdate, installUpdate } = useAppStatus();

    if (appUpdate.state !== 'downloaded') return null;

    const version = appUpdate.stagedVersion ?? appUpdate.latestVersion;

    return (
        <Box className="p-2.5">
            <Box
                onClick={installUpdate}
                role="button"
                title="Restart now to switch to the new version — otherwise it installs the next time you quit"
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
                <AutoAwesomeIcon className="sl-sparkle" sx={{ fontSize: 16, flexShrink: 0 }} />
                <Box className="flex-1 min-w-0">
                    <Box className="text-[12px] font-semibold leading-tight truncate">
                        Update ready{version ? ` · v${version}` : ''}
                    </Box>
                    <Box className="text-[11px] leading-tight" sx={{ opacity: 0.75 }}>
                        Click to restart &amp; install
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
