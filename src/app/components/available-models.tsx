import { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';

export default function AvailableModels() {
    const [localModels, setLocalModels] = useState<any[]>([]);
    const [localModelsLoading, setLocalModelsLoading] = useState(false);
    const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(new Map());
    const [toggling, setToggling] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{ percent: number; status: string } | null>(null);
    const togglingRef = useRef<string | null>(null);

    const enabledModels = new Set(localModels.filter((m: any) => {
        const name = m.name || m.id || m.model;
        return enabledOverrides.has(name) ? enabledOverrides.get(name) : m.enabled;
    }).map((m: any) => m.name || m.id || m.model));

    const fetchLocalModels = useCallback(async () => {
        setLocalModelsLoading(true);
        try {
            const api = window.electronAPI;
            if (api?.slpListModels) {
                const result = await api.slpListModels();
                if (result?.success && result.models) {
                    setLocalModels(result.models);
                }
            }
        } catch (err) {
            console.warn('Failed to fetch local models:', err);
        } finally {
            setLocalModelsLoading(false);
        }
    }, []);

    useEffect(() => {
        const api = window.electronAPI;
        const handleProgress = (data: any) => {
            if (togglingRef.current && data.model === togglingRef.current) {
                setDownloadProgress({ percent: data.percent, status: data.status });
            }
        };
        api?.onModelDownloadProgress?.(handleProgress);
        return () => { api?.removeModelDownloadProgressListener?.(); };
    }, []);

    const handleCancelDownload = useCallback(async () => {
        const api = window.electronAPI;
        const modelName = togglingRef.current;
        if (!modelName || !api?.slpCancelModelDownload) return;
        await api.slpCancelModelDownload(modelName);
        togglingRef.current = null;
        setToggling(null);
        setDownloadProgress(null);
        setEnabledOverrides(prev => { const next = new Map(prev); next.delete(modelName); return next; });
        await fetchLocalModels();
    }, [fetchLocalModels]);

    const handleToggleModel = useCallback(async (name: string, workspaceName: string, enabled: boolean) => {
        const api = window.electronAPI;
        if (!api?.slpSetModelEnabled || togglingRef.current) return;

        togglingRef.current = name;
        setToggling(name);
        setDownloadProgress(null);
        setEnabledOverrides(prev => new Map(prev).set(name, enabled));

        try {
            await api.slpSetModelEnabled(workspaceName, enabled);
            await fetchLocalModels();
        } finally {
            togglingRef.current = null;
            setToggling(null);
            setDownloadProgress(null);
            setEnabledOverrides(prev => { const next = new Map(prev); next.delete(name); return next; });
        }
    }, [fetchLocalModels]);

    useEffect(() => {
        fetchLocalModels();

        const handleAuthChange = () => fetchLocalModels();
        window.addEventListener('authStateChanged', handleAuthChange);

        const api = window.electronAPI;
        api?.onModelsUpdated?.(({ models }) => {
            if (Array.isArray(models)) setLocalModels(models);
        });

        return () => {
            window.removeEventListener('authStateChanged', handleAuthChange);
            api?.removeModelsUpdatedListener?.();
        };
    }, [fetchLocalModels]);

    return (
        <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
            <Box className="flex items-center gap-2 mb-4">
                <ViewListIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Available Models</h2>
            </Box>

            {localModels.length > 0 && (
                <Box
                    component="table"
                    sx={{
                        width: '100%',
                        borderCollapse: 'separate',
                        borderSpacing: 0,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid var(--sl-white-alpha-7)',
                        '& th, & td': {
                            px: 2,
                            py: 1.5,
                            textAlign: 'left',
                            borderBottom: '1px solid var(--sl-white-alpha-7)',
                        },
                        '& tr:last-child td': {
                            borderBottom: 'none',
                        },
                        '& tr:hover td': {
                            bgcolor: 'var(--sl-brand-alpha-10)',
                        },
                        '& tr:hover .model-checkbox': {
                            borderColor: 'var(--sl-brand-primary) !important',
                        },
                        '& tr:hover .cap-neutral': {
                            color: 'var(--sl-text-secondary) !important',
                            borderColor: 'var(--sl-border-strong) !important',
                        },
                        '& tr:hover .cap-brand': {
                            opacity: '1 !important',
                            backgroundColor: 'var(--sl-bg-surface-1) !important',
                            borderColor: 'var(--sl-brand-primary) !important',
                        },
                        '& tr:hover .cap-vision': {
                            backgroundColor: 'rgba(96,165,250,0.15) !important',
                            borderColor: 'rgb(96,165,250) !important',
                        },
                        '& tr:hover .cap-skills': {
                            backgroundColor: 'rgba(52,211,153,0.15) !important',
                            borderColor: 'rgb(52,211,153) !important',
                        },
                        '& tr:hover .cap-dp': {
                            backgroundColor: 'rgba(251,146,60,0.15) !important',
                            borderColor: 'rgb(251,146,60) !important',
                        },
                    }}
                >
                    <tbody>
                        {localModels.map((model: any) => {
                            const name = model.name || model.id || model.model;
                            const workspaceName = model.workspace_name || name;
                            const displayName = model.display_name || name;
                            const description = model.description || '';
                            const size = model.size || model.file_size;
                            const accessLevel = model.access_level || 'free';
                            const isEnabled = enabledModels.has(name);

                            return (
                                <tr
                                    key={name}
                                    onClick={() => {
                                        if (toggling) return;
                                        if (model.is_accessible === false) return;
                                        if (!model.downloaded) {
                                            handleToggleModel(name, workspaceName, true);
                                        } else {
                                            handleToggleModel(name, workspaceName, !isEnabled);
                                        }
                                    }}
                                    style={{ cursor: toggling || model.is_accessible === false ? 'default' : 'pointer' }}
                                >
                                    <Box component="td">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase cap-brand" style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}>
                                                {displayName}
                                            </span>
                                            {(model.capabilities || []).map((cap: string) => {
                                                const isVision = cap === 'vision';
                                                const isSkills = cap === 'skills';
                                                const isDp = cap === 'dp';
                                                const capColor = isVision ? 'rgb(96,165,250)' : isSkills ? 'rgb(52,211,153)' : isDp ? 'rgb(251,146,60)' : 'var(--sl-text-muted)';
                                                const borderColor = isVision ? 'rgba(96,165,250,0.3)' : isSkills ? 'rgba(52,211,153,0.3)' : isDp ? 'rgba(251,146,60,0.3)' : 'var(--sl-border-default)';
                                                const capClass = isVision ? 'cap-vision' : isSkills ? 'cap-skills' : isDp ? 'cap-dp' : 'cap-neutral';
                                                return (
                                                    <span key={cap} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${capClass}`} style={{ border: `1px solid ${borderColor}`, color: capColor }}>
                                                        {cap}
                                                    </span>
                                                );
                                            })}
                                            {accessLevel === 'internal' && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ border: '1px solid rgba(168,85,247,0.3)', color: 'rgb(168,85,247)' }}>
                                                    INTERNAL
                                                </span>
                                            )}
                                            {size && (
                                                <span className="text-[9px]" style={{ color: 'var(--sl-text-faint)', fontFamily: 'monospace' }}>
                                                    {typeof size === 'number' ? `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB` : size}
                                                </span>
                                            )}
                                        </div>
                                        {description && (
                                            <p className="text-xs mt-0.5 mb-0 p-1" style={{ color: 'var(--sl-text-muted)' }}>{description}</p>
                                        )}
                                    </Box>
                                    <Box component="td" sx={{ textAlign: 'center', verticalAlign: 'middle', width: 90, pr: 3 }}>
                                        {model.is_accessible === false ? (
                                            <LockOutlinedIcon sx={{ fontSize: 20, color: 'var(--sl-text-faint)', display: 'block', mx: 'auto' }} />
                                        ) : !model.downloaded ? (
                                            toggling === name ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCancelDownload(); }}
                                                    className="flex items-center justify-center mx-auto"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 24, height: 24 }}
                                                >
                                                    <svg width="24" height="24" viewBox="0 0 24 24">
                                                        <circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--sl-brand-primary)" strokeWidth="2" opacity="0.15" />
                                                        {downloadProgress?.percent ? (
                                                            <circle
                                                                cx="12" cy="12" r="10.5"
                                                                fill="none"
                                                                stroke="var(--sl-brand-primary)"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeDasharray={2 * Math.PI * 10.5}
                                                                strokeDashoffset={2 * Math.PI * 10.5 * (1 - downloadProgress.percent / 100)}
                                                                transform="rotate(-90 12 12)"
                                                                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                                                            />
                                                        ) : (
                                                            <circle
                                                                cx="12" cy="12" r="10.5"
                                                                fill="none"
                                                                stroke="var(--sl-brand-primary)"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeDasharray="16.5 49.5"
                                                                transform="rotate(-90 12 12)"
                                                            >
                                                                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                                                            </circle>
                                                        )}
                                                        <rect x="9" y="9" width="6" height="6" rx="1" fill="var(--sl-brand-primary)" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <CloudDownloadOutlinedIcon
                                                    className="model-checkbox"
                                                    sx={{ fontSize: 20, color: 'var(--sl-text-faint)', display: 'block', mx: 'auto', cursor: 'pointer', '&:hover': { color: 'var(--sl-brand-primary)' } }}
                                                />
                                            )
                                        ) : (
                                            <span
                                                className="model-checkbox flex items-center justify-center rounded select-none mx-auto"
                                                style={{
                                                    width: 20, height: 20,
                                                    border: isEnabled ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-default)',
                                                    backgroundColor: isEnabled ? 'var(--sl-brand-alpha-10)' : 'transparent',
                                                }}
                                            >
                                                {isEnabled && (
                                                    <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--sl-brand-primary)' }} />
                                                )}
                                            </span>
                                        )}
                                    </Box>
                                </tr>
                            );
                        })}
                    </tbody>
                </Box>
            )}

            {!localModelsLoading && localModels.length === 0 && (
                <div className="p-6 text-center">
                    <span className="text-[13px] text-sl-text-faint">
                        No models available
                    </span>
                </div>
            )}
        </Box>
    );
}
