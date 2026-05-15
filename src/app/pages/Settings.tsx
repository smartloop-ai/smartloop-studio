import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Switch, Slider, CircularProgress, IconButton, LinearProgress } from '@mui/material';
import { useAuthContext } from '@/app/contexts/AuthContext';

import { storageService } from '@/app/services/storage.service';
import { getLocalApiEndpoint } from '@/app/constants';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import DnsIcon from '@mui/icons-material/Dns';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ViewListIcon from '@mui/icons-material/ViewList';
import RefreshIcon from '@mui/icons-material/Refresh';
import { CopyToClipboard } from 'react-copy-to-clipboard';



const TPS_GRAPH_POINTS = 60; // Show last 60 data points

// SVG Line Graph component for tok/s performance
function TpsLineGraph({ dataPoints, timestamps }: { dataPoints: number[]; timestamps?: string[] }) {
    if (dataPoints.length === 0) return null;

    const width = 520;
    const height = 140;
    const padding = { top: 12, right: 12, bottom: 24, left: 36 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    const maxVal = Math.max(...dataPoints, 1);
    const points = dataPoints.map((val, i) => {
        const x = padding.left + (i / Math.max(1, dataPoints.length - 1)) * graphWidth;
        const y = padding.top + graphHeight - (val / maxVal) * graphHeight;
        return { x, y, val };
    });

    // Smooth curve using catmull-rom to bezier conversion
    const pathD = points.length <= 2
        ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        : points.map((p, i) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const p0 = points[Math.max(0, i - 2)];
            const p1 = points[i - 1];
            const p2 = p;
            const p3 = points[Math.min(points.length - 1, i + 1)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        }).join(' ');

    const areaD = pathD + ` L ${points[points.length - 1].x} ${padding.top + graphHeight} L ${points[0].x} ${padding.top + graphHeight} Z`;

    // Dynamic Y-axis ticks based on max value
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal / tickCount) * i));
    const lineColor = 'var(--sl-brand-primary)';

    // Time labels
    const showTimeLabels = timestamps && timestamps.length > 1;
    const firstTime = showTimeLabels ? new Date(timestamps![0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const lastTime = showTimeLabels ? new Date(timestamps![timestamps!.length - 1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
            {/* Grid lines */}
            {yTicks.map(tick => {
                const y = padding.top + graphHeight - (tick / maxVal) * graphHeight;
                return (
                    <g key={tick}>
                        <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                        <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="monospace">{tick}</text>
                    </g>
                );
            })}

            {/* Area fill */}
            <path d={areaD} fill="url(#tpsGradient)" />

            {/* Glow effect */}
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.15} filter="url(#tpsGlow)" />

            {/* Line */}
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

            {/* Current value dot with pulse */}
            {points.length > 0 && (
                <>
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={6} fill={lineColor} opacity={0.2}>
                        <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.2;0;0.2" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={lineColor} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
                </>
            )}

            {/* Time labels */}
            {showTimeLabels && (
                <>
                    <text x={padding.left} y={height - 4} fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="monospace">{firstTime}</text>
                    <text x={width - padding.right} y={height - 4} textAnchor="end" fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="monospace">{lastTime}</text>
                </>
            )}

            {/* Gradient & filter definitions */}
            <defs>
                <linearGradient id="tpsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
                <filter id="tpsGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
        </svg>
    );
}

interface GlobalSettings {
    default_memory: boolean;
    default_temperature: number;
    analytics_enabled: boolean;
}

const DEFAULT_SETTINGS: GlobalSettings = {
    default_memory: true,
    default_temperature: 0.3,
    analytics_enabled: true,
};

export default function SettingsPage() {
    const [user, setUser] = useAuthContext();

    // Settings state
    const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Model / hardware info
    const [slpConfig, setSlpConfig] = useState<any>(null);
    const [systemInfo, setSystemInfo] = useState<any>(null);
    const [lastTps, setLastTps] = useState<number | null>(null);
    const [tpsHistory, setTpsHistory] = useState<{ tokens_per_second: number; created_at: string }[]>([]);
    const [localModels, setLocalModels] = useState<any[]>([]);
    const [localModelsLoading, setLocalModelsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [initingModel, setInitingModel] = useState<string | null>(null);
    const [initProgress, setInitProgress] = useState<{ percent: number; status: string } | null>(null);
    const [serverHealth, setServerHealth] = useState<{ url: string; status: string; details?: Record<string, any>; error?: string } | null>(null);
    const [frameworkVersion, setFrameworkVersion] = useState<string | null>(null);

    // Fetch server health info
    const fetchServerHealth = useCallback(async () => {
        try {
            const baseUrl = await getLocalApiEndpoint();
            if (!baseUrl) { setServerHealth(null); return; }
            try {
                const res = await fetch(`${baseUrl}/health`);
                if (res.ok) {
                    const data = await res.json();
                    const health = { url: baseUrl, status: 'running', details: data };
                    setServerHealth(health);
                    await storageService.setSetting('service_health', health);
                } else {
                    setServerHealth({ url: baseUrl, status: 'error', error: `HTTP ${res.status}` });
                }
            } catch (err: any) {
                setServerHealth({ url: baseUrl, status: 'unreachable', error: err.message });
            }
        } catch {
            setServerHealth(null);
        }
    }, []);

    // Fetch models from local SLP service via IPC
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

    // Listen for model init progress events (with cleanup to prevent leaks)
    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onModelInitProgress) return;

        api.onModelInitProgress((data: any) => {
            setInitingModel((current) => {
                if (current && data.model === current) {
                    setInitProgress({ percent: data.percent, status: data.status });
                }
                return current;
            });
        });

        return () => {
            api.removeModelInitProgressListener?.();
        };
    }, []);

    // Select a model — triggers /v1/init which downloads + sets up if needed
    const handleSelectModel = useCallback(async (modelName: string) => {
        const api = window.electronAPI;
        if (!api?.slpInitModel) return;

        setSelectedModel(modelName);
        setInitingModel(modelName);
        setInitProgress({ percent: 0, status: 'Initializing...' });

        try {
            await api.slpInitModel(modelName);
        } catch (err) {
            console.error('Model init error:', err);
        } finally {
            setInitingModel(null);
            setInitProgress(null);
        }
    }, []);

    useEffect(() => {
        fetchLocalModels();
        fetchServerHealth();
    }, []);

    // Set selected model: load from storage first, fallback to local config
    // Validates stored model still exists in SLP config to avoid showing stale/deleted models
    useEffect(() => {
        const loadSelectedModel = async () => {
            const stored = await storageService.getItem('selected_model');
            const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);
            const configModelNames = new Set(
                (slpConfig?.workspace?.models || []).map((m: any) => m.model_name).filter(Boolean)
            );

            if (stored && configModelNames.has(stored)) {
                setSelectedModel(stored);
            } else {
                // Stored model not in config (deleted/stale) — fall back to active model
                if (stored) {
                    await storageService.removeItem('selected_model');
                }
                if (activeModel?.model_name) {
                    setSelectedModel(activeModel.model_name);
                    await storageService.setItem('selected_model', activeModel.model_name);
                    await storageService.setSetting('selected_model', activeModel.model_name);
                }
            }
        };
        loadSelectedModel();
    }, [slpConfig]);

    // Load persisted tok/s history from DB on mount
    useEffect(() => {
        const loadHistory = async () => {
            const history = await storageService.getTpsHistory(TPS_GRAPH_POINTS);
            if (history.length > 0) {
                setTpsHistory(history);
            }
            const lastTpsVal = await storageService.getItem('last_tokens_per_second');
            if (lastTpsVal) setLastTps(lastTpsVal);
        };
        loadHistory();
    }, []);

    useEffect(() => {
        const load = async () => {
            const api = window.electronAPI;
            if (api?.getSlpConfig) {
                const cfg = await api.getSlpConfig();
                setSlpConfig(cfg);
            }
            if (api?.getSystemInfo) {
                try {
                    const info = await api.getSystemInfo();
                    setSystemInfo(info);
                } catch {}
            }
            if (api?.getFrameworkVersion) {
                try {
                    const ver = await api.getFrameworkVersion();
                    setFrameworkVersion(ver);
                } catch {}
            }
        };
        load();
    }, []);

    // Load settings from SQLite first, then fall back to user object
    useEffect(() => {
        const loadSettings = async () => {
            const saved = await storageService.getAllSettings();
            const temp = saved.default_temperature ?? user?.default_temperature ?? DEFAULT_SETTINGS.default_temperature;
            const memory = saved.default_memory ?? user?.default_memory ?? DEFAULT_SETTINGS.default_memory;
            const analytics = saved.analytics_enabled ?? DEFAULT_SETTINGS.analytics_enabled;
            setSettings({ default_temperature: temp, default_memory: memory, analytics_enabled: analytics });

            // Restore selected model from SQLite settings
            if (saved.selected_model && !selectedModel) {
                setSelectedModel(saved.selected_model);
            }
            // Restore cached service health
            if (saved.service_health && !serverHealth) {
                setServerHealth(saved.service_health);
            }
        };
        loadSettings();
    }, [user]);

    // Auto-save function — persists to SQLite and remote API
    const autoSave = async (newSettings: GlobalSettings) => {
        setIsSaving(true);
        try {
            // Persist to SQLite
            await storageService.setSetting('default_temperature', newSettings.default_temperature);
            await storageService.setSetting('default_memory', newSettings.default_memory);
            await storageService.setSetting('analytics_enabled', newSettings.analytics_enabled);

            // Also sync API-relevant settings to remote (analytics is local-only)
            const { analytics_enabled: _local, ...apiSettings } = newSettings;
            if (window.electronAPI?.slpUpdateUserSettings) {
                const result = await window.electronAPI.slpUpdateUserSettings(apiSettings);
                if (result?.success && result.user) {
                    setUser(result.user);
                }
            }
            setSaveMessage('Settings saved');
            setTimeout(() => setSaveMessage(''), 2000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            setSaveMessage('Failed to save');
            setTimeout(() => setSaveMessage(''), 2000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (key: keyof GlobalSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(() => {
            autoSave(newSettings);
        }, 1000);
    };

    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    const tpsColor = 'var(--sl-brand-primary)';
    const latestTps = tpsHistory.length > 0 ? tpsHistory[tpsHistory.length - 1].tokens_per_second : lastTps;

    return (
        <Box className="min-h-screen bg-black text-white">
            <Box className="p-4">
                {/* Save Indicator */}
                <Box
                    sx={{
                        position: 'fixed',
                        top: { xs: 16, md: 24 },
                        right: { xs: 16, md: 24 },
                        zIndex: 1000,
                        transition: 'opacity 0.3s ease-in-out',
                        opacity: isSaving || saveMessage ? 1 : 0,
                        pointerEvents: 'none',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            px: 3,
                            py: 1.5,
                            bgcolor: 'rgba(26, 26, 26, 0.95)',
                            border: '1px solid var(--sl-border-default)',
                            borderRadius: '8px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 12px var(--sl-black-alpha-30)',
                        }}
                    >
                        {isSaving ? (
                            <>
                                <CircularProgress size={16} sx={{ color: 'var(--sl-brand-primary)' }} />
                                <span className="text-sm text-gray-300">Saving...</span>
                            </>
                        ) : saveMessage ? (
                            <>
                                <CheckCircleIcon sx={{ fontSize: 18, color: 'var(--sl-status-success)' }} />
                                <span className="text-sm text-green-400">{saveMessage}</span>
                            </>
                        ) : null}
                    </Box>
                </Box>

                <Box className="max-w-4xl mx-auto mt-6 md:mt-8">
                    {/* Header */}
                    <Box className="mb-6 md:mb-8">
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Settings</h1>
                        <p className="text-gray-400 text-sm md:text-base">Model configuration and default settings</p>
                    </Box>

                    {/* Active Model Card - Redesigned */}
                    {slpConfig && (() => {
                        const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);
                        if (!activeModel) return null;

                        // Show specs for the selected model, not just the is_active one
                        const displayModel = slpConfig?.workspace?.models?.find((m: any) => m.model_name === selectedModel) || activeModel;
                        // Use health endpoint quantization (reflects what's actually running)
                        const healthQuantize = serverHealth?.details?.quantization;
                        const quantize = (healthQuantize ? String(healthQuantize).toUpperCase() : displayModel.config?.quantize?.toUpperCase()) || '—';
                        const ctxSize = serverHealth?.details?.ctx_size ?? displayModel.config?.ctx_size;
                        const ramUsed = systemInfo ? (systemInfo.totalMemGb - systemInfo.freeMemGb).toFixed(1) : null;
                        const ramTotal = systemInfo?.totalMemGb;

                        return (
                            <Box
                                className="mb-6 md:mb-8"
                                sx={{
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--sl-white-alpha-8)',
                                    background: 'linear-gradient(145deg, rgba(20, 20, 25, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%)',
                                }}
                            >
                                {/* Active model specs */}
                                <Box sx={{ p: { xs: 2.5, md: 3 }, pb: 0 }}>
                                    {/* Specs Row */}
                                    <Box className="flex flex-wrap gap-2 mb-3">
                                        {[
                                            { label: 'Quantization', value: quantize },
                                            ...(ctxSize ? [{ label: 'Context', value: `${ctxSize.toLocaleString()} tokens` }] : []),
                                            ...(ramUsed && ramTotal ? [{ label: 'RAM', value: `${ramUsed} / ${ramTotal} GB` }] : []),
                                            ...(systemInfo?.gpu ? [{ label: 'GPU', value: systemInfo.gpu }] : []),
                                        ].map(({ label, value }) => (
                                            <Box
                                                key={label}
                                                sx={{
                                                    px: 1.5,
                                                    py: 0.75,
                                                    bgcolor: 'var(--sl-white-alpha-5)',
                                                    border: '1px solid var(--sl-white-alpha-5)',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 0.75,
                                                }}
                                            >
                                                <span style={{ fontSize: '11px', color: 'var(--sl-white-alpha-30)', fontWeight: 500 }}>{label}</span>
                                                <span style={{ fontSize: '12px', color: 'var(--sl-white-alpha-80)', fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>

                                {/* Tok/s Performance Section */}
                                {(tpsHistory.length > 0 || latestTps !== null) && (
                                    <Box sx={{
                                        mx: { xs: 2.5, md: 3 },
                                        mb: { xs: 2.5, md: 3 },
                                        p: 2,
                                        bgcolor: 'var(--sl-black-alpha-40)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--sl-white-alpha-5)',
                                    }}>
                                        <Box className="flex items-center justify-between mb-2">
                                            <Box className="flex items-center gap-1.5">
                                                <SpeedIcon sx={{ fontSize: 16, color: tpsColor }} />
                                                <span style={{ fontSize: '12px', color: 'var(--sl-white-alpha-50)', fontWeight: 600, letterSpacing: '0.3px' }}>TOKEN PERFORMANCE</span>
                                            </Box>
                                            {latestTps !== null && (
                                                <Box className="flex items-center gap-1.5">
                                                    <span style={{
                                                        fontSize: '22px',
                                                        fontWeight: 700,
                                                        fontFamily: 'monospace',
                                                        color: tpsColor,
                                                        lineHeight: 1,
                                                    }}>
                                                        {latestTps}
                                                    </span>
                                                    <span style={{ fontSize: '12px', color: tpsColor, fontWeight: 500, opacity: 0.7 }}>tok/s</span>
                                                </Box>
                                            )}
                                        </Box>
                                        {tpsHistory.length > 0 && (
                                            <TpsLineGraph
                                                dataPoints={tpsHistory.map(h => h.tokens_per_second)}
                                                timestamps={tpsHistory.map(h => h.created_at)}
                                            />
                                        )}
                                        {tpsHistory.length === 0 && latestTps !== null && (
                                            <Box sx={{ mt: 1 }}>
                                                <span style={{ fontSize: '10px', color: 'var(--sl-white-alpha-20)', display: 'block' }}>
                                                    Graph will appear after more conversations...
                                                </span>
                                            </Box>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })()}

                    {/* Service */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                            <Box className="flex items-center justify-between mb-4">
                                <Box className="flex items-center gap-2">
                                    <DnsIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                                    <h2 className="text-lg md:text-xl font-semibold text-white">Service</h2>
                                    {/* Status badge next to title */}
                                    <div
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border"
                                        style={{
                                            backgroundColor: serverHealth?.status === 'running' ? 'rgba(34, 197, 94, 0.1)' : serverHealth?.status === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'var(--sl-white-alpha-5)',
                                            borderColor: serverHealth?.status === 'running' ? 'rgba(34, 197, 94, 0.2)' : serverHealth?.status === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'var(--sl-white-alpha-8)',
                                        }}
                                    >
                                        <Box sx={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: '50%',
                                            bgcolor: serverHealth?.status === 'running' ? 'var(--sl-status-success)' : serverHealth?.status === 'error' ? 'var(--sl-status-error)' : 'var(--sl-white-alpha-20)',
                                            ...(serverHealth?.status === 'running' && {
                                                boxShadow: '0 0 6px rgba(34, 197, 94, 0.4)',
                                            }),
                                        }} />
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: serverHealth?.status === 'running' ? 'var(--sl-status-success)' : serverHealth?.status === 'error' ? 'var(--sl-status-error)' : 'var(--sl-white-alpha-50)',
                                        }}>
                                            {serverHealth?.status === 'running' ? 'Healthy' : serverHealth?.status === 'error' ? 'Error' : serverHealth?.status === 'unreachable' ? 'Unreachable' : 'Unknown'}
                                        </span>
                                    </div>
                                </Box>
                            </Box>

                            {/* Table */}
                            <Box
                                component="table"
                                sx={{
                                    width: '100%',
                                    borderCollapse: 'separate',
                                    borderSpacing: 0,
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--sl-white-alpha-8)',
                                    '& th, & td': {
                                        px: 2,
                                        py: 1.5,
                                        textAlign: 'left',
                                        borderBottom: '1px solid var(--sl-white-alpha-5)',
                                    },
                                    '& tr:last-child td': {
                                        borderBottom: 'none',
                                    },
                                    '& tr:hover td': {
                                        bgcolor: 'var(--sl-white-alpha-3)',
                                    },
                                }}
                            >
                                <tbody>
                                    <tr>
                                        <Box component="td" sx={{ color: 'var(--sl-white-alpha-40)', fontSize: '12px', fontWeight: 500, width: '40%' }}>
                                            Service URL
                                        </Box>
                                        <Box component="td" sx={{ color: 'var(--sl-white-alpha-80)', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600 }}>
                                            <Box className="flex items-center gap-1">
                                                <span>{serverHealth?.url || 'Not available'}</span>
                                                {serverHealth?.url && (
                                                    <CopyToClipboard text={`${serverHealth.url}/docs`}>
                                                        <IconButton
                                                            size="small"
                                                            sx={{
                                                                color: 'var(--sl-white-alpha-40)',
                                                                padding: '2px',
                                                                '&:hover': { color: 'var(--sl-white-alpha-80)' },
                                                            }}
                                                        >
                                                            <ContentCopyIcon sx={{ fontSize: 13 }} />
                                                        </IconButton>
                                                    </CopyToClipboard>
                                                )}
                                            </Box>
                                        </Box>
                                    </tr>
                                    {frameworkVersion && (
                                        <tr>
                                            <Box component="td" sx={{ color: 'var(--sl-white-alpha-40)', fontSize: '12px', fontWeight: 500, width: '40%' }}>
                                                Version
                                            </Box>
                                            <Box component="td" sx={{ color: 'var(--sl-white-alpha-80)', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600 }}>
                                                {frameworkVersion}
                                            </Box>
                                        </tr>
                                    )}
                                    <tr>
                                        <Box component="td" sx={{ color: 'var(--sl-white-alpha-40)', fontSize: '12px', fontWeight: 500, width: '40%' }}>
                                            Model
                                        </Box>
                                        <Box component="td">
                                            <Box component="span" sx={{
                                                display: 'inline-block',
                                                px: 1.5,
                                                py: 0.5,
                                                bgcolor: 'transparent',
                                                border: '1px solid var(--sl-brand-alpha-40)',
                                                borderRadius: '6px',
                                                color: 'var(--sl-brand-primary)',
                                                fontSize: '13px',
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                textTransform: 'lowercase',
                                            }}>
                                                {selectedModel || serverHealth?.details?.model_name || serverHealth?.details?.model || 'Not loaded'}
                                            </Box>
                                        </Box>
                                    </tr>
                                    {/* Dynamic rows from health endpoint */}
                                    {serverHealth?.details && Object.entries(serverHealth.details)
                                        .filter(([key]) => !['status', 'model', 'flash_attn', 'quantization', 'model_name', 'indexing', 'model_loaded'].includes(key))
                                        .map(([key, value]) => {
                                            // Format value for display
                                            let displayValue: React.ReactNode;
                                            const isMemoryPercent = key.toLowerCase().includes('memory') && typeof value === 'number' && value >= 0 && value <= 100;
                                            const isSizeBytes = key.toLowerCase().includes('size') && typeof value === 'number' && value > 1024 * 1024;

                                            if (typeof value === 'boolean') {
                                                displayValue = value ? 'Yes' : 'No';
                                            } else if (isMemoryPercent) {
                                                displayValue = (
                                                    <Box className="flex items-center gap-2" sx={{ width: '100%' }}>
                                                        <Box sx={{
                                                            flex: 1,
                                                            height: 8,
                                                            bgcolor: 'var(--sl-white-alpha-5)',
                                                            borderRadius: '2px',
                                                            overflow: 'hidden',
                                                            minWidth: 80,
                                                        }}>
                                                            <Box sx={{
                                                                height: '100%',
                                                                width: `${value}%`,
                                                                bgcolor: value > 90 ? 'var(--sl-status-error)' : value > 70 ? '#f59e0b' : 'var(--sl-brand-primary)',
                                                                borderRadius: '2px',
                                                                transition: 'width 0.3s ease',
                                                            }} />
                                                        </Box>
                                                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, minWidth: 36 }}>{value}%</span>
                                                    </Box>
                                                );
                                            } else if (isSizeBytes) {
                                                displayValue = `${(value as number / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                                            } else if (typeof value === 'object') {
                                                displayValue = JSON.stringify(value);
                                            } else if (String(value) === 'true') {
                                                displayValue = 'Yes';
                                            } else if (String(value) === 'false') {
                                                displayValue = 'No';
                                            } else {
                                                displayValue = String(value);
                                            }

                                            return (
                                                <tr key={key}>
                                                    <Box component="td" sx={{ color: 'var(--sl-white-alpha-40)', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' }}>
                                                        {key.replace(/_/g, ' ')}
                                                    </Box>
                                                    <Box component="td" sx={{ color: 'var(--sl-white-alpha-80)', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600 }}>
                                                        {displayValue}
                                                    </Box>
                                                </tr>
                                            );
                                        })
                                    }
                                </tbody>
                            </Box>

                            {/* Error message if any */}
                            {serverHealth?.error && (
                                <Box sx={{
                                    mt: 2,
                                    p: 2,
                                    bgcolor: 'var(--sl-danger-alpha-10)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--sl-danger-alpha-20)',
                                }}>
                                    <span style={{ fontSize: '12px', color: 'var(--sl-status-error)' }}>
                                        {serverHealth.error}
                                    </span>
                                </Box>
                            )}
                        </Box>


                    {/* Available Models */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                            <Box className="flex items-center justify-between mb-4">
                                <Box className="flex items-center gap-2">
                                    <ViewListIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                                    <h2 className="text-lg md:text-xl font-semibold text-white">Available Models</h2>
                                </Box>
                                <IconButton
                                    onClick={fetchLocalModels}
                                    disabled={localModelsLoading}
                                    size="small"
                                    title="Refresh models"
                                    sx={{ color: 'var(--sl-text-muted)', '&:hover': { color: 'var(--sl-brand-primary)' } }}
                                >
                                    {localModelsLoading
                                        ? <CircularProgress size={18} sx={{ color: 'var(--sl-brand-primary)' }} />
                                        : <RefreshIcon sx={{ fontSize: 20 }} />
                                    }
                                </IconButton>
                            </Box>

                            {localModels.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    {localModels.map((model: any) => {
                                        const name = model.name || model.id || model.model;
                                        const description = model.description || '';
                                        const size = model.size || model.file_size;
                                        const isSelected = selectedModel === name;
                                        const isIniting = initingModel === name;

                                        return (
                                            <div
                                                key={name}
                                                onClick={() => !initingModel && handleSelectModel(name)}
                                                className={`p-4 rounded-[10px] border transition-all duration-200 ${
                                                    initingModel ? 'cursor-default' : 'cursor-pointer'
                                                } ${initingModel && !isIniting ? 'opacity-50' : 'opacity-100'} ${
                                                    isSelected
                                                        ? 'bg-pink-500/10 border-pink-500/30 hover:border-pink-500/30'
                                                        : `bg-black/40 border-white/[0.08] ${!initingModel ? 'hover:border-white/15 hover:bg-white/5' : ''}`
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold font-mono text-white/80">
                                                                {name}
                                                            </span>
                                                            {isSelected && !isIniting && (
                                                                <span className="px-2 py-0.5 bg-pink-500/10 border border-pink-500/30 rounded text-[10px] font-semibold text-pink-500">
                                                                    ACTIVE
                                                                </span>
                                                            )}
                                                        </div>
                                                        {description && (
                                                            <p className="text-xs text-white/40 mt-1 mb-0">
                                                                {description}
                                                            </p>
                                                        )}
                                                        {size && (
                                                            <span className="text-[11px] text-white/30 font-mono">
                                                                {typeof size === 'number' ? `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB` : size}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Init progress bar */}
                                                {isIniting && initProgress && (
                                                    <div className="mt-3">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[11px] text-white/50">
                                                                {initProgress.status}
                                                            </span>
                                                            {initProgress.percent > 0 && (
                                                                <span className="text-[11px] text-pink-500 font-mono font-semibold">
                                                                    {initProgress.percent}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <LinearProgress
                                                            variant={initProgress.percent > 0 ? 'determinate' : 'indeterminate'}
                                                            value={initProgress.percent}
                                                            sx={{
                                                                height: 6,
                                                                borderRadius: '3px',
                                                                bgcolor: 'var(--sl-white-alpha-5)',
                                                                '& .MuiLinearProgress-bar': {
                                                                    bgcolor: 'var(--sl-brand-primary)',
                                                                    borderRadius: '3px',
                                                                },
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {!localModelsLoading && localModels.length === 0 && (
                                <div className="p-6 text-center">
                                    <span className="text-[13px] text-white/30">
                                        No models available
                                    </span>
                                </div>
                            )}
                        </Box>

                    {/* AI Model Settings */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <TuneIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold text-white">AI Model Settings</h2>
                        </Box>

                        {/* Temperature */}
                        <Box>
                            <Box className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-300">
                                    Default Temperature
                                </label>
                                <span className="text-sm text-pink-400 font-mono">{settings.default_temperature}</span>
                            </Box>
                            <Slider
                                value={settings.default_temperature}
                                onChange={(_, value) => handleChange('default_temperature', value as number)}
                                min={0}
                                max={2}
                                step={0.1}
                                sx={{
                                    color: 'var(--sl-brand-primary)',
                                    '& .MuiSlider-thumb': { bgcolor: 'var(--sl-brand-primary)' },
                                    '& .MuiSlider-track': { bgcolor: 'var(--sl-brand-primary)' },
                                    '& .MuiSlider-rail': { bgcolor: 'var(--sl-border-code)' },
                                }}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Lower values = more focused and deterministic. Higher values = more creative and random.
                            </p>
                        </Box>
                    </Box>

                    {/* Analytics */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <SpeedIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold text-white">Analytics</h2>
                        </Box>

                        <Box className="flex items-center justify-between p-4 bg-black/50 rounded-lg">
                            <Box>
                                <h3 className="text-sm font-medium text-white mb-1">Enable Analytics</h3>
                                <p className="text-xs text-gray-500">
                                    Collect usage data anonymously when logged in to render dashboards in the console
                                </p>
                            </Box>
                            <Switch
                                checked={settings.analytics_enabled}
                                onChange={(e) => handleChange('analytics_enabled', e.target.checked)}
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--sl-brand-primary)' },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--sl-brand-primary)' },
                                }}
                            />
                        </Box>
                        <p className="text-xs text-gray-600 mt-3 px-1 leading-relaxed">
                            Includes token usage, model performance metrics, and session activity. No conversation content or personal data is collected.
                        </p>
                    </Box>

                </Box>
            </Box>
        </Box>
    );
}
