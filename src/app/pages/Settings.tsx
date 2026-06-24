import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Switch, Slider, CircularProgress } from '@mui/material';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { useThemeContext } from '@/app/contexts/ThemeContext';

import { storageService } from '@/app/services/storage.service';
import { getLocalApiEndpoint } from '@/app/constants';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import DnsIcon from '@mui/icons-material/Dns';
import ViewListIcon from '@mui/icons-material/ViewList';

import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import PaletteIcon from '@mui/icons-material/Palette';
import { themes, themeList, type ThemeId } from '@/app/theme/themes';



const TPS_DAYS = 365;

function TpsHeatmapGraph({ history }: { history: { tokens_per_second: number; created_at: string }[] }) {
    const dailyMap = new Map<string, number[]>();

    for (const entry of history) {
        const dateKey = new Date(entry.created_at).toISOString().slice(0, 10);
        if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, []);
        dailyMap.get(dateKey)!.push(entry.tokens_per_second);
    }

    const today = new Date();
    const todayDay = today.getDay();
    const totalDays = TPS_DAYS + todayDay;

    const days: { date: string; avg: number; count: number; dow: number }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const vals = dailyMap.get(key);
        const avg = vals ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        days.push({ date: key, avg, count: vals?.length ?? 0, dow: d.getDay() });
    }

    const weeks: typeof days[] = [];
    let currentWeek: typeof days = [];
    for (const day of days) {
        if (day.dow === 0 && currentWeek.length > 0) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
        currentWeek.push(day);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const maxVal = Math.max(...days.map(d => d.avg), 1);
    const cell = 11;
    const gap = 3;
    const step = cell + gap;
    const labelW = 28;
    const headerH = 15;

    const getColor = (val: number) => {
        if (val === 0) return 'var(--sl-border-subtle)';
        const ratio = val / maxVal;
        if (ratio < 0.25) return 'rgba(var(--sl-brand-primary-rgb, 236,72,153), 0.25)';
        if (ratio < 0.5) return 'rgba(var(--sl-brand-primary-rgb, 236,72,153), 0.45)';
        if (ratio < 0.75) return 'rgba(var(--sl-brand-primary-rgb, 236,72,153), 0.7)';
        return 'var(--sl-brand-primary)';
    };

    const months: { label: string; col: number }[] = [];
    let lastMonth = '';
    weeks.forEach((week, wi) => {
        const m = new Date(week[0].date).toLocaleDateString([], { month: 'short' });
        if (m !== lastMonth) {
            months.push({ label: m, col: wi });
            lastMonth = m;
        }
    });

    const gridW = weeks.length * step - gap;
    const gridH = 7 * step - gap;
    const totalW = labelW + gridW;
    const totalH = headerH + gridH;

    const dayLabels = [
        { label: 'Mon', row: 1 },
        { label: 'Wed', row: 3 },
        { label: 'Fri', row: 5 },
    ];

    const legendColors = [
        'var(--sl-border-subtle)',
        'rgba(var(--sl-brand-primary-rgb, 236,72,153), 0.25)',
        'rgba(var(--sl-brand-primary-rgb, 236,72,153), 0.45)',
        'rgba(var(--sl-brand-primary-rgb, 236,72,153), 0.7)',
        'var(--sl-brand-primary)',
    ];

    return (
        <div className="flex flex-col gap-2">
            <div className="overflow-x-auto">
                <svg width={totalW} height={totalH} style={{ display: 'block' }}>
                    {months.map((m) => (
                        <text
                            key={m.col}
                            x={labelW + m.col * step}
                            y={10}
                            fill="var(--sl-text-faint)"
                            fontSize={10}
                        >
                            {m.label}
                        </text>
                    ))}
                    {dayLabels.map(({ label, row }) => (
                        <text
                            key={label}
                            x={labelW - 6}
                            y={headerH + row * step + cell * 0.75}
                            fill="var(--sl-text-faint)"
                            fontSize={10}
                            textAnchor="end"
                        >
                            {label}
                        </text>
                    ))}
                    {weeks.map((week, wi) =>
                        week.map((day) => {
                            const x = labelW + wi * step;
                            const y = headerH + day.dow * step;
                            const dateLabel = new Date(day.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
                            const title = day.count > 0
                                ? `${dateLabel} — ${day.avg.toFixed(1)} avg tok/s (${day.count} runs)`
                                : `${dateLabel} — no activity`;
                            return (
                                <rect
                                    key={day.date}
                                    x={x}
                                    y={y}
                                    width={cell}
                                    height={cell}
                                    rx={2}
                                    fill={getColor(day.avg)}
                                >
                                    <title>{title}</title>
                                </rect>
                            );
                        })
                    )}
                </svg>
            </div>
            <div className="flex items-center justify-end gap-1">
                <span style={{ fontSize: 10, color: 'var(--sl-text-faint)' }}>Less</span>
                {legendColors.map((color, i) => (
                    <div
                        key={i}
                        style={{
                            width: cell,
                            height: cell,
                            borderRadius: 2,
                            backgroundColor: color,
                        }}
                    />
                ))}
                <span style={{ fontSize: 10, color: 'var(--sl-text-faint)' }}>More</span>
            </div>
        </div>
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
    const { themeId, setThemeId } = useThemeContext();

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
    const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(new Map());
    const enabledModels = new Set(localModels.filter((m: any) => {
        const name = m.name || m.id || m.model;
        return enabledOverrides.has(name) ? enabledOverrides.get(name) : m.enabled;
    }).map((m: any) => m.name || m.id || m.model));
    const [serverHealth, setServerHealth] = useState<{ url: string; status: string; details?: Record<string, any>; error?: string } | null>(null);
    const [appVersion, setAppVersion] = useState<string | null>(null);

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
    const fetchLocalModels = useCallback(async (force = false) => {
        setLocalModelsLoading(true);
        try {
            const api = window.electronAPI;
            if (api?.slpListModels) {
                const result = await api.slpListModels(force);
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



    const [toggling, setToggling] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{ percent: number; status: string } | null>(null);
    const togglingRef = useRef<string | null>(null);

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
        await fetchLocalModels(true);
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
            await fetchLocalModels(true);
        } finally {
            togglingRef.current = null;
            setToggling(null);
            setDownloadProgress(null);
            setEnabledOverrides(prev => { const next = new Map(prev); next.delete(name); return next; });
        }
    }, [fetchLocalModels]);

    useEffect(() => {
        fetchLocalModels();
        fetchServerHealth();

        const handleAuthChange = () => fetchLocalModels(true);
        window.addEventListener('authStateChanged', handleAuthChange);
        return () => window.removeEventListener('authStateChanged', handleAuthChange);
    }, []);

    // Load persisted tok/s history from DB on mount
    useEffect(() => {
        const loadHistory = async () => {
            const history = await storageService.getTpsHistory(10000);
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
            if (api?.getAppVersion) {
                try {
                    const ver = await api.getAppVersion();
                    setAppVersion(ver);
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
        <Box className="min-h-screen" sx={{ bgcolor: 'var(--sl-bg-base)', color: 'var(--sl-text-primary)' }}>
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
                            bgcolor: 'var(--sl-bg-elevated)',
                            border: '1px solid var(--sl-border-default)',
                            borderRadius: '8px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 12px var(--sl-black-alpha-30)',
                        }}
                    >
                        {isSaving ? (
                            <>
                                <CircularProgress size={16} sx={{ color: 'var(--sl-brand-primary)' }} />
                                <span className="text-sm" style={{ color: 'var(--sl-text-secondary)' }}>Saving...</span>
                            </>
                        ) : saveMessage ? (
                            <>
                                <CheckCircleIcon sx={{ fontSize: 18, color: 'var(--sl-status-success)' }} />
                                <span className="text-sm text-sl-status-success">{saveMessage}</span>
                            </>
                        ) : null}
                    </Box>
                </Box>

                <Box className="max-w-4xl mx-auto mt-6 md:mt-8">
                    {/* Header */}
                    <Box className="mb-6 md:mb-8">
                        <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: 'var(--sl-text-primary)' }}>Settings</h1>
                        <p className="text-sm md:text-base" style={{ color: 'var(--sl-text-muted)' }}>Model configuration and default settings</p>
                    </Box>

                    {/* 1. Theme */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        <Box className="flex items-center gap-2 mb-4">
                            <PaletteIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Theme</h2>
                        </Box>
                        <div className="flex gap-4">
                            {themeList.map((t) => {
                                const isActive = themeId === t.id;
                                const activeMode = themes[themeId]?.mode ?? 'dark';
                                const mismatch = t.mode !== activeMode;
                                const overlay = mismatch
                                    ? activeMode === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'
                                    : undefined;
                                return (
                                    <div
                                        key={t.id}
                                        onClick={() => setThemeId(t.id as ThemeId)}
                                        className="rounded-xl border-2 cursor-pointer transition-all duration-200 overflow-hidden"
                                        style={{
                                            width: 200,
                                            borderColor: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-border-default)',
                                            boxShadow: isActive ? '0 0 0 3px var(--sl-brand-alpha-20)' : 'none',
                                        }}
                                    >
                                        {/* Mini UI preview */}
                                        <div className="relative flex rounded-lg overflow-hidden m-2" style={{ height: 100, backgroundColor: t.colors.bg.base, border: `1px solid ${t.colors.border.default}` }}>
                                            {overlay && (
                                                <div className="absolute inset-0 rounded-lg pointer-events-none" style={{ backgroundColor: overlay }} />
                                            )}
                                            {/* Sidebar */}
                                            <div className="relative flex flex-col gap-[5px] p-2 shrink-0" style={{ width: 52, borderRight: `1px solid ${t.colors.border.default}`, backgroundColor: t.colors.bg.surface1 }}>
                                                <div className="rounded-sm" style={{ height: 5, width: '100%', backgroundColor: t.colors.text.muted, opacity: 0.5 }} />
                                                <div className="rounded-sm" style={{ height: 5, width: '75%', backgroundColor: t.colors.brand.primary, opacity: 0.8 }} />
                                                <div className="rounded-sm" style={{ height: 5, width: '85%', backgroundColor: t.colors.text.faint, opacity: 0.4 }} />
                                                <div className="rounded-sm" style={{ height: 5, width: '65%', backgroundColor: t.colors.text.faint, opacity: 0.3 }} />
                                                <div className="mt-auto rounded-full" style={{ height: 8, width: 8, backgroundColor: t.colors.brand.primary, opacity: 0.5 }} />
                                            </div>
                                            {/* Content */}
                                            <div className="relative flex-1 flex flex-col gap-[6px] p-2">
                                                <div className="rounded-sm" style={{ height: 5, width: '50%', backgroundColor: t.colors.text.primary, opacity: 0.4 }} />
                                                <div className="flex-1 rounded p-2 flex flex-col gap-[4px]" style={{ backgroundColor: t.colors.bg.surface1 }}>
                                                    <div className="rounded-sm" style={{ height: 4, width: '90%', backgroundColor: t.colors.text.secondary, opacity: 0.25 }} />
                                                    <div className="rounded-sm" style={{ height: 4, width: '65%', backgroundColor: t.colors.text.muted, opacity: 0.2 }} />
                                                    <div className="rounded-sm" style={{ height: 4, width: '75%', backgroundColor: t.colors.text.muted, opacity: 0.15 }} />
                                                </div>
                                                <div className="rounded" style={{ height: 12, backgroundColor: t.colors.bg.input, border: `1px solid ${t.colors.border.default}` }} />
                                            </div>
                                        </div>
                                        {/* Label */}
                                        <div className="px-3 py-2" style={{ backgroundColor: mismatch ? 'var(--sl-bg-surface-1)' : t.colors.bg.surface1, borderTop: `1px solid ${mismatch ? 'var(--sl-border-default)' : t.colors.border.default}` }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold" style={{ color: mismatch ? 'var(--sl-text-primary)' : t.colors.text.primary }}>{t.name}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: mismatch ? 'var(--sl-text-muted)' : t.colors.text.muted, backgroundColor: mismatch ? 'var(--sl-bg-surface-2)' : t.colors.bg.surface2 }}>
                                                        {t.mode}
                                                    </span>
                                                    {isActive && (
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--sl-brand-primary)' }} />
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[10px] mt-0.5 leading-snug" style={{ color: mismatch ? 'var(--sl-text-muted)' : t.colors.text.muted }}>{t.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Box>

                    {/* 2. Agent */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                            <Box className="flex items-center gap-2 mb-4">
                                <DnsIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                                <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Agent</h2>
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
                                    border: '1px solid var(--sl-white-alpha-7)',
                                    '& th, & td': {
                                        px: 2,
                                        py: 1.5,
                                        textAlign: 'left',
                                        borderBottom: '1px solid var(--sl-white-alpha-7)',
                                    },
                                    '& td:first-of-type': {
                                        borderRight: '1px solid var(--sl-white-alpha-7)',
                                    },
                                    '& tr:last-child td': {
                                        borderBottom: 'none',
                                    },
                                    '& tr:hover td': {
                                        bgcolor: 'var(--sl-white-alpha-5)',
                                    },
                                }}
                            >
                                <tbody>
                                    <tr>
                                        <Box component="td" sx={{ color: 'var(--sl-text-muted)', fontSize: '11px', fontWeight: 500, width: '40%' }}>
                                            Status
                                        </Box>
                                        <Box component="td">
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase" style={{
                                                border: serverHealth?.status === 'running' ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-default)',
                                                color: serverHealth?.status === 'running' ? 'var(--sl-brand-primary)' : serverHealth?.status === 'error' ? 'var(--sl-status-error)' : 'var(--sl-text-disabled)',
                                                opacity: 0.7,
                                            }}>
                                                {serverHealth?.status === 'running' ? 'HEALTHY' : serverHealth?.status === 'error' ? 'ERROR' : serverHealth?.status === 'unreachable' ? 'UNREACHABLE' : 'UNKNOWN'}
                                            </span>
                                        </Box>
                                    </tr>
                                    {appVersion && (
                                        <tr>
                                            <Box component="td" sx={{ color: 'var(--sl-text-muted)', fontSize: '11px', fontWeight: 500, width: '40%' }}>
                                                Version
                                            </Box>
                                            <Box component="td">
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-muted)', fontFamily: 'monospace' }}>
                                                    {appVersion}
                                                </span>
                                            </Box>
                                        </tr>
                                    )}
                                    <tr>
                                        <Box component="td" sx={{ color: 'var(--sl-text-muted)', fontSize: '11px', fontWeight: 500, width: '40%' }}>
                                            Model
                                        </Box>
                                        <Box component="td">
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase" style={{
                                                border: '1px solid var(--sl-brand-alpha-30)',
                                                color: 'var(--sl-brand-primary)',
                                                opacity: 0.7,
                                            }}>
                                                {serverHealth?.details?.model_name || serverHealth?.details?.model || 'Not loaded'}
                                            </span>
                                        </Box>
                                    </tr>
                                    {/* Dynamic rows from health endpoint */}
                                    {serverHealth?.details && Object.entries(serverHealth.details)
                                        .filter(([key]) => !['status', 'model', 'flash_attn', 'quantization', 'model_name', 'indexing', 'model_loaded', 'ctx_size', 'n_ctx'].includes(key))
                                        .map(([key, value]) => {
                                            let displayValue: React.ReactNode;
                                            const keyLower = key.toLowerCase();
                                            const isLargeBytes = typeof value === 'number' && value > 1024 * 1024 && (keyLower.includes('size') || keyLower.includes('memory'));
                                            const isPercent = typeof value === 'number' && value >= 0 && value <= 100 && keyLower.includes('percent');

                                            if (typeof value === 'boolean') {
                                                displayValue = value ? 'Yes' : 'No';
                                            } else if (isPercent) {
                                                displayValue = (
                                                    <Box className="flex items-center gap-2" sx={{ width: '100%' }}>
                                                        <Box sx={{
                                                            flex: 1,
                                                            height: 8,
                                                            bgcolor: 'var(--sl-border-subtle)',
                                                            borderRadius: '2px',
                                                            overflow: 'hidden',
                                                            minWidth: 80,
                                                        }}>
                                                            <Box sx={{
                                                                height: '100%',
                                                                width: `${value}%`,
                                                                bgcolor: (value as number) > 90 ? 'var(--sl-status-error)' : (value as number) > 70 ? 'var(--sl-status-warning)' : 'var(--sl-brand-primary)',
                                                                borderRadius: '2px',
                                                                transition: 'width 0.3s ease',
                                                            }} />
                                                        </Box>
                                                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, minWidth: 36 }}>{value}%</span>
                                                    </Box>
                                                );
                                            } else if (isLargeBytes) {
                                                displayValue = `${((value as number) / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
                                                    <Box component="td" sx={{ color: 'var(--sl-text-muted)', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' }}>
                                                        {key.replace(/_/g, ' ')}
                                                    </Box>
                                                    <Box component="td" sx={{ color: 'var(--sl-text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                                                        {displayValue}
                                                    </Box>
                                                </tr>
                                            );
                                        })
                                    }
                                </tbody>
                            </Box>

                            {/* Error message (skip for unreachable — status badge already shows it) */}
                            {serverHealth?.error && serverHealth.status !== 'unreachable' && (
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

                    {/* 3. Available Models */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                            <Box className="flex items-center gap-2 mb-4">
                                <ViewListIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                                <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Available Models</h2>
                            </Box>

                            {localModels.length > 0 && (
                                <>
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
                                                const isLastEnabled = isEnabled && enabledModels.size <= 1;

                                                return (
                                                    <tr
                                                        key={name}
                                                        onClick={() => {
                                                            if (toggling) return;
                                                            const userIsFree = !(user?.is_paid || user?.is_premium);
                                                            if (accessLevel === 'pro' && userIsFree) return;
                                                            if (!model.is_accessible && accessLevel !== 'free') return;
                                                            if (!model.downloaded) {
                                                                handleToggleModel(name, workspaceName, true);
                                                            } else if (!isLastEnabled) {
                                                                handleToggleModel(name, workspaceName, !isEnabled);
                                                            }
                                                        }}
                                                        style={{ cursor: toggling || isLastEnabled || (accessLevel === 'pro' && !(user?.is_paid || user?.is_premium)) ? 'default' : 'pointer' }}
                                                    >
                                                        <Box component="td">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase cap-brand" style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}>
                                                                    {displayName}
                                                                </span>
                                                                {accessLevel === 'pro' && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ border: '1px solid rgba(234,179,8,0.3)', color: 'rgb(234,179,8)' }}>
                                                                        PRO
                                                                    </span>
                                                                )}
                                                                {accessLevel === 'free' && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold cap-neutral" style={{ border: '1px solid var(--sl-white-alpha-7)', color: 'var(--sl-text-faint)' }}>
                                                                        FREE
                                                                    </span>
                                                                )}
                                                                {accessLevel === 'internal' && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ border: '1px solid rgba(168,85,247,0.3)', color: 'rgb(168,85,247)' }}>
                                                                        INTERNAL
                                                                    </span>
                                                                )}
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
                                                            {(accessLevel === 'pro' && !(user?.is_paid || user?.is_premium)) || (!model.is_accessible && accessLevel !== 'free') ? (
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

                                </>
                            )}

                            {!localModelsLoading && localModels.length === 0 && (
                                <div className="p-6 text-center">
                                    <span className="text-[13px] text-sl-text-faint">
                                        No models available
                                    </span>
                                </div>
                            )}
                        </Box>

                    {/* 4. Active Model Card — specs + performance graph */}
                    {slpConfig && (() => {
                        const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);
                        if (!activeModel) return null;

                        const healthModelName = serverHealth?.details?.model_name || serverHealth?.details?.model;
                        const displayModel = (healthModelName && slpConfig?.workspace?.models?.find((m: any) => m.model_name === healthModelName)) || activeModel;
                        // Use health endpoint quantization (reflects what's actually running)
                        const healthQuantize = serverHealth?.details?.quantization;
                        const quantize = (healthQuantize ? String(healthQuantize).toUpperCase() : displayModel.config?.quantize?.toUpperCase()) || '—';
                        const ramUsed = systemInfo ? (systemInfo.totalMemGb - systemInfo.freeMemGb).toFixed(1) : null;
                        const ramTotal = systemInfo?.totalMemGb;

                        return (
                            <Box
                                className="mb-6 md:mb-8"
                                sx={{
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--sl-border-subtle)',
                                    background: 'var(--sl-bg-surface-1)',
                                }}
                            >
                                {/* Active model specs */}
                                <Box sx={{ p: { xs: 2.5, md: 3 }, pb: 0 }}>
                                    {/* Specs Row */}
                                    <Box className="flex flex-wrap gap-2 mb-3">
                                        {[
                                            { label: 'Quantization', value: quantize },
                                            ...(ramUsed && ramTotal ? [{ label: 'RAM', value: `${ramUsed} / ${ramTotal} GB` }] : []),
                                            ...(systemInfo?.gpu ? [{ label: 'GPU', value: systemInfo.gpu }] : []),
                                        ].map(({ label, value }) => (
                                            <Box
                                                key={label}
                                                sx={{
                                                    px: 1.5,
                                                    py: 0.75,
                                                    bgcolor: 'var(--sl-white-alpha-7)',
                                                    border: '1px solid var(--sl-border-subtle)',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 0.75,
                                                }}
                                            >
                                                <span style={{ fontSize: '11px', color: 'var(--sl-text-faint)', fontWeight: 500 }}>{label}</span>
                                                <span style={{ fontSize: '12px', color: 'var(--sl-text-secondary)', fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
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
                                        bgcolor: 'var(--sl-white-alpha-5)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--sl-border-subtle)',
                                    }}>
                                        <Box className="flex items-center justify-between mb-2">
                                            <Box className="flex items-center gap-1.5">
                                                <SpeedIcon sx={{ fontSize: 16, color: tpsColor }} />
                                                <span style={{ fontSize: '12px', color: 'var(--sl-text-disabled)', fontWeight: 600, letterSpacing: '0.3px' }}>TOKEN PERFORMANCE</span>
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
                                            <TpsHeatmapGraph history={tpsHistory} />
                                        )}
                                        {tpsHistory.length === 0 && latestTps !== null && (
                                            <Box sx={{ mt: 1 }}>
                                                <span style={{ fontSize: '10px', color: 'var(--sl-text-faint)', display: 'block' }}>
                                                    Graph will appear after more conversations...
                                                </span>
                                            </Box>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })()}

                    {/* 5. AI Model Settings */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <TuneIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>AI Model Settings</h2>
                        </Box>

                        {/* Temperature */}
                        <Box>
                            <Box className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium" style={{ color: 'var(--sl-text-secondary)' }}>
                                    Default Temperature
                                </label>
                                <span className="text-sm font-mono" style={{ color: 'var(--sl-brand-light)' }}>{settings.default_temperature}</span>
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
                            <p className="text-xs mt-1" style={{ color: 'var(--sl-text-disabled)' }}>
                                Lower values = more focused and deterministic. Higher values = more creative and random.
                            </p>
                        </Box>
                    </Box>

                    {/* 6. Analytics */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <SpeedIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Analytics</h2>
                        </Box>

                        <Box className="flex items-center justify-between p-4" sx={{ bgcolor: 'var(--sl-white-alpha-5)', borderRadius: '12px', border: '1px solid var(--sl-border-subtle)' }}>
                            <Box>
                                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--sl-text-primary)' }}>Enable Analytics</h3>
                                <p className="text-xs" style={{ color: 'var(--sl-text-disabled)' }}>
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
                        <p className="text-xs mt-3 px-1 leading-relaxed" style={{ color: 'var(--sl-text-faint)' }}>
                            Includes token usage, model performance metrics, and session activity. No conversation content or personal data is collected.
                        </p>
                    </Box>

                </Box>
            </Box>
        </Box>
    );
}
