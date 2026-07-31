import { useState } from 'react';
import { Popover } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import { useLocalModels } from '../hooks/useLocalModels';

interface AuxiliaryModelsMenuProps {
    // Label of the primary orchestrator model shown on the trigger pill.
    model: string;
}

// Chat footer pill that opens a popover listing the enabled auxiliary models.
// Lets the user enable/disable, download, or watch download progress inline —
// mirrors the Settings "Available Models" table but in a compact menu.
export default function AuxiliaryModelsMenu({ model }: AuxiliaryModelsMenuProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const {
        localModels,
        toggling,
        downloadProgress,
        isEnabled,
        handleToggleModel,
        handleCancelDownload,
    } = useLocalModels();

    // Auxiliary models = every local model except the primary orchestrator on the pill.
    // Order is kept STABLE across enable/download so rows never jump around while the
    // user interacts: we sort only by the unchanging accessibility flag (locked last)
    // and otherwise preserve the backend catalog order.
    const auxModels = localModels
        .filter((m: any) => {
            const name = m.name || m.id || m.model;
            return name !== model && m.workspace_name !== model;
        })
        .map((m: any, i: number) => ({ m, i }))
        .sort((a, b) => {
            const la = a.m.is_accessible === false ? 1 : 0;
            const lb = b.m.is_accessible === false ? 1 : 0;
            return la !== lb ? la - lb : a.i - b.i;
        })
        .map(({ m }) => m);

    return (
        <>
            <button
                onClick={(e) => setAnchorEl(e.currentTarget)}
                className="flex items-center gap-1.5 px-2 py-1 border border-sl-border-default rounded-md hover:border-sl-border-hover text-sl-text-muted hover:text-sl-text-tertiary transition-all text-xs"
                style={{ backgroundColor: 'var(--sl-white-alpha-7)', height: '28px' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-10)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-7)'; }}
            >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                    <path d="M2 4l6-2.5L14 4v8l-6 2.5L2 12V4z" stroke="currentColor" strokeWidth="0.75" fill="none" />
                    <path d="M8 6.5v8" stroke="currentColor" strokeWidth="0.5" />
                    <path d="M2 4l6 2.5L14 4" stroke="currentColor" strokeWidth="0.5" fill="none" />
                </svg>
                <span>Models</span>
                <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
            </button>

            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{
                    paper: {
                        sx: {
                            mt: -1,
                            // Shift left so the popover lines up with the composer box /
                            // assistant response box edge, rather than the inset "Models" button.
                            ml: '-10px',
                            width: 320,
                            bgcolor: 'var(--sl-bg-surface-1)',
                            border: '1px solid var(--sl-border-default)',
                            borderRadius: '8px',
                            backgroundImage: 'none',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
                            // Portal renders outside the app tree, so pin the app font
                            // (Poppins) here to match the chat text; mono spans override it.
                            fontFamily: 'Poppins, sans-serif',
                            // Row hover fills the outlined badges with their color — the same
                            // "inverse" effect as the Settings "Auxiliary Models" table.
                            '& .aux-row:hover .cap-brand': {
                                opacity: '1 !important',
                                backgroundColor: 'var(--sl-bg-surface-1) !important',
                                borderColor: 'var(--sl-brand-primary) !important',
                            },
                            '& .aux-row:hover .cap-neutral': {
                                color: 'var(--sl-text-secondary) !important',
                                borderColor: 'var(--sl-border-strong) !important',
                            },
                            '& .aux-row:hover .cap-vision': {
                                backgroundColor: 'rgba(96,165,250,0.15) !important',
                                borderColor: 'rgb(96,165,250) !important',
                            },
                            '& .aux-row:hover .cap-skills': {
                                backgroundColor: 'rgba(52,211,153,0.15) !important',
                                borderColor: 'rgb(52,211,153) !important',
                            },
                            '& .aux-row:hover .cap-dp': {
                                backgroundColor: 'rgba(251,146,60,0.15) !important',
                                borderColor: 'rgb(251,146,60) !important',
                            },
                            '& .aux-row:hover .model-checkbox': {
                                borderColor: 'var(--sl-brand-primary) !important',
                            },
                        },
                    },
                }}
            >
                <div className="p-3">
                    <p className="m-0 px-2 text-[10px] font-semibold uppercase tracking-wider font-mono" style={{ color: 'var(--sl-text-faint)' }}>
                        Auxiliary Models
                    </p>
                    <p className="m-0 mb-2 px-2 text-[10px] leading-snug" style={{ color: 'var(--sl-text-muted)' }}>
                        Enable models that work together to enrich your prompt.
                    </p>
                    <div className="mb-1 h-px w-full" style={{ backgroundColor: 'var(--sl-border-default)' }} />

                    {auxModels.length === 0 ? (
                        <p className="m-0 py-2 text-xs text-sl-text-faint">No auxiliary models available</p>
                    ) : (
                        <div
                            className="flex flex-col overflow-y-auto"
                            style={auxModels.length > 2 ? { maxHeight: 220 } : undefined}
                        >
                            {auxModels.map((m: any, idx: number) => {
                                const name = m.name || m.id || m.model;
                                const workspaceName = m.workspace_name || name;
                                const displayName = m.display_name || name;
                                const description = m.description || '';
                                const enabled = isEnabled(name);
                                // Only show the download/progress UI for models that aren't on disk yet.
                                // Toggling an already-downloaded model just flips its checkbox — no flicker.
                                const isDownloading = toggling === name && !m.downloaded;
                                const locked = m.is_accessible === false;

                                return (
                                    <button
                                        key={name}
                                        disabled={locked || (!!toggling && !isDownloading)}
                                        onClick={() => {
                                            if (locked) return;
                                            if (isDownloading) return;
                                            handleToggleModel(name, workspaceName, m.downloaded ? !enabled : true);
                                        }}
                                        className="aux-row flex flex-col gap-2 px-2 py-3 text-left bg-transparent transition-colors disabled:cursor-default enabled:hover:bg-[var(--sl-brand-alpha-10)]"
                                        style={{
                                            border: 'none',
                                            borderTop: idx > 0 ? '1px solid var(--sl-border-default)' : 'none',
                                            cursor: locked ? 'default' : 'pointer',
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                                <span className="cap-brand px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide transition-colors" style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)' }}>
                                                    {displayName}
                                                </span>
                                                {(m.capabilities || []).map((cap: string) => {
                                                        const isVision = cap === 'vision';
                                                        const isSkills = cap === 'skills';
                                                        const isDp = cap === 'dp';
                                                        const capColor = isVision ? 'rgb(96,165,250)' : isSkills ? 'rgb(52,211,153)' : isDp ? 'rgb(251,146,60)' : 'var(--sl-text-faint)';
                                                        const borderColor = isVision ? 'rgba(96,165,250,0.3)' : isSkills ? 'rgba(52,211,153,0.3)' : isDp ? 'rgba(251,146,60,0.3)' : 'var(--sl-border-default)';
                                                        const capClass = isVision ? 'cap-vision' : isSkills ? 'cap-skills' : isDp ? 'cap-dp' : 'cap-neutral';
                                                        return (
                                                            <span key={cap} className={`${capClass} px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase transition-colors`} style={{ border: `1px solid ${borderColor}`, color: capColor }}>
                                                                {cap}
                                                            </span>
                                                        );
                                                    })}
                                            </div>

                                            <div className="flex-shrink-0">
                                            {locked ? (
                                                <LockOutlinedIcon sx={{ fontSize: 18, color: 'var(--sl-text-faint)' }} />
                                            ) : isDownloading ? (
                                                <span className="text-[11px] font-mono" style={{ color: 'var(--sl-brand-primary)' }}>
                                                    {downloadProgress?.percent ? `${downloadProgress.percent}%` : ''}
                                                </span>
                                            ) : !m.downloaded ? (
                                                <span
                                                    className="flex items-center justify-center rounded"
                                                    style={{
                                                        width: 24, height: 24,
                                                        border: '1px solid var(--sl-brand-alpha-30)',
                                                        backgroundColor: 'var(--sl-brand-alpha-10)',
                                                    }}
                                                >
                                                    <DownloadIcon sx={{ fontSize: 15, color: 'var(--sl-brand-primary)' }} />
                                                </span>
                                            ) : (
                                                <span
                                                    className="model-checkbox flex items-center justify-center rounded select-none transition-colors"
                                                    style={{
                                                        width: 20, height: 20,
                                                        border: enabled ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-default)',
                                                        backgroundColor: enabled ? 'var(--sl-brand-alpha-10)' : 'transparent',
                                                    }}
                                                >
                                                    {enabled && (
                                                        <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--sl-brand-primary)' }} />
                                                    )}
                                                </span>
                                            )}
                                            </div>
                                        </div>

                                        {description && (
                                            <p className="m-0 text-[11px] leading-snug" style={{ color: 'var(--sl-text-muted)' }}>
                                                {description}
                                            </p>
                                        )}
                                        {isDownloading && (
                                            <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}>
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{
                                                        width: `${downloadProgress?.percent ?? 0}%`,
                                                        backgroundColor: 'var(--sl-brand-primary)',
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {toggling && downloadProgress && (
                        <button
                            onClick={handleCancelDownload}
                            className="mt-2 px-2 text-[11px] font-mono transition-colors"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sl-text-faint)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sl-brand-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sl-text-faint)'; }}
                        >
                            Cancel download
                        </button>
                    )}
                </div>
            </Popover>
        </>
    );
}
