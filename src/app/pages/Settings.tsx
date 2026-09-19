import { useState, useEffect, useRef } from 'react';
import { Box, Switch, CircularProgress } from '@mui/material';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { useThemeContext } from '@/app/contexts/ThemeContext';

import { storageService } from '@/app/services/storage.service';
import { useAppStatus } from '@/app/contexts/AppStatusContext';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import DnsIcon from '@mui/icons-material/Dns';

import PaletteIcon from '@mui/icons-material/Palette';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { parseThemeYaml, isCustomThemeId } from '@/app/theme/custom-themes';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { LogoMark } from '@/app/components/logo';



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
        // Translucent overlay rather than a bg token — the panel sits on a lightened
        // surface, so solid surface colors blend in and empty cells disappear
        if (val === 0) return 'var(--sl-white-alpha-8)';
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
        'var(--sl-white-alpha-8)',
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
    const { themeId, setThemeId, allThemes, addCustomTheme, removeCustomTheme } = useThemeContext();
    const [themeDragOver, setThemeDragOver] = useState(false);
    const [themeImportError, setThemeImportError] = useState('');

    // Import a dropped YAML theme file — parse, derive the full palette, save.
    const handleThemeFileDrop = (file: File) => {
        setThemeImportError('');
        if (!/\.(ya?ml)$/i.test(file.name)) {
            setThemeImportError('Drop a .yaml or .yml file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const { theme, error } = parseThemeYaml(String(reader.result || ''));
            if (error || !theme) { setThemeImportError(error || 'Could not read theme.'); return; }
            addCustomTheme(theme);
        };
        reader.onerror = () => setThemeImportError('Could not read the file.');
        reader.readAsText(file);
    };
    // Local SLP health and app-update state both come from AppStatusContext —
    // the page never fetches /health or subscribes to updater events itself.
    const { serverHealth, appUpdate, checkForUpdates, installUpdate, pauseUpdate, resumeUpdate } = useAppStatus();

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
    const appVersion = __APP_VERSION__;

    // SLP agent (framework) version, sourced from slp-setup.js VERSION via IPC —
    // distinct from the app's own version shown in the header badge.
    const [agentVersion, setAgentVersion] = useState<string>('');

    // Storage / free-up-space
    type StorageUsage = { total: number; models: number; versions: number; logsCache: number; reclaimable: number };
    const [storage, setStorage] = useState<StorageUsage | null>(null);
    const [cleanupSel, setCleanupSel] = useState({ models: true, versions: true, logsCache: true });
    const [isCleaning, setIsCleaning] = useState(false);
    // Transient restart indicator for the Agent panel (driven by a dedicated IPC
    // channel so it doesn't disturb global health/project state).
    const [agentRestarting, setAgentRestarting] = useState(false);
    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onAgentRestarting) return;
        api.onAgentRestarting(({ restarting }) => setAgentRestarting(restarting));
        return () => api.removeAgentRestartingListener?.();
    }, []);

    const loadStorage = async () => {
        const res = await window.electronAPI?.getStorageUsage?.();
        if (res?.success) {
            setStorage({
                total: res.total ?? 0,
                models: res.models ?? 0,
                versions: res.versions ?? 0,
                logsCache: res.logsCache ?? 0,
                reclaimable: res.reclaimable ?? 0,
            });
        }
    };
    useEffect(() => { loadStorage(); }, []);

    const selectedReclaim = storage
        ? (cleanupSel.models ? storage.models : 0)
        + (cleanupSel.versions ? storage.versions : 0)
        + (cleanupSel.logsCache ? storage.logsCache : 0)
        : 0;

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes < 1024) return `${bytes || 0} B`;
        const units = ['KB', 'MB', 'GB', 'TB'];
        let val = bytes / 1024;
        let i = 0;
        while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
        return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    };

    const runCleanup = async () => {
        setIsCleaning(true);
        try {
            const res = await window.electronAPI?.cleanupStorage?.(cleanupSel);
            if (res?.success) await loadStorage();
        } finally {
            setIsCleaning(false);
        }
    };

    const DOWNLOAD_URL = 'https://smartloop.ai/download/';

    const { updateAvailable, latestVersion, stagedVersion, updaterSupported, delivery, state: updaterState, percent: downloadPercent, checking: checkingUpdate, error: updaterError } = appUpdate;

    // Load persisted tok/s history from DB on mount
    useEffect(() => {
        const loadHistory = async () => {
            const history = await storageService.getTpsHistory(10000);
            if (history.length > 0) {
                setTpsHistory(history);
                setLastTps(history[history.length - 1].tokens_per_second);
            }
        };
        loadHistory();
    }, []);

    useEffect(() => {
        const api = window.electronAPI;
        api?.getSlpConfig?.().then(setSlpConfig).catch(() => {});
        api?.getSystemInfo?.().then(setSystemInfo).catch(() => {});
        api?.getFrameworkVersion?.().then((v) => { if (v) setAgentVersion(v); }).catch(() => {});
    }, []);

    // Load settings from SQLite first, then fall back to user object
    useEffect(() => {
        const loadSettings = async () => {
            const saved = await storageService.getAllSettings();
            const temp = saved.default_temperature ?? user?.default_temperature ?? DEFAULT_SETTINGS.default_temperature;
            const memory = saved.default_memory ?? user?.default_memory ?? DEFAULT_SETTINGS.default_memory;
            const analytics = saved.analytics_enabled ?? DEFAULT_SETTINGS.analytics_enabled;
            setSettings({ default_temperature: temp, default_memory: memory, analytics_enabled: analytics });
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
                    {/* No page title: a native settings window doesn't repeat its
                        own name inside itself — you got here from the gear, and
                        the section headings below say what everything is. */}

                    {/* 0. App version / updates */}
                    <Box className={`mb-6 md:mb-8 p-4 ${updaterSupported ? 'md:p-6' : ''} rounded-xl`} sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        {(() => {
                            // Store-managed (Mac App Store) and unpackaged builds have nothing to
                            // say about updates: the store delivers them, or there is no feed at
                            // all. Show a clean identity card only — the product name on the left
                            // and a large version pill on the right.
                            //
                            // Not keyed on updaterSupported, which is false for 'manual' builds
                            // too (macOS, the Linux .deb). Those fall through to the branches
                            // below, where "Version X available" + Download is exactly right.
                            if (delivery === 'store' || delivery === 'none') {
                                return (
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {/* Smartloop mark as inline SVG (transparent bg, theme-colored)
                                                so it reads cleanly on the dark surface — unlike the PNG
                                                app-icon tile, which carries its own black background. */}
                                            <div
                                                className="flex items-center justify-center shrink-0 rounded-lg p-1"
                                                style={{ border: '1px solid var(--sl-brand-alpha-30)' }}
                                            >
                                                <LogoMark className="w-5 h-5" />
                                            </div>
                                            <h2 className="text-lg md:text-xl font-semibold truncate" style={{ color: 'var(--sl-text-primary)' }}>Smartloop Studio</h2>
                                        </div>
                                        <span
                                            className="text-sm md:text-base font-semibold font-mono px-3.5 py-1.5 rounded-lg shrink-0"
                                            style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.8 }}
                                        >
                                            v{appVersion}
                                        </span>
                                    </div>
                                );
                            }

                            const checkButton = (
                                <button
                                    onClick={checkForUpdates}
                                    disabled={checkingUpdate}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                                    style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                >
                                    {checkingUpdate && <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />}
                                    {checkingUpdate ? 'Checking…' : 'Check for Updates'}
                                </button>
                            );

                            // Escape hatch to the website build. Needed wherever
                            // electron-updater can't install for us.
                            const downloadButton = (
                                <button
                                    onClick={() => window.electronAPI?.openExternal?.(DOWNLOAD_URL)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                    style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                >
                                    <SystemUpdateAltIcon sx={{ fontSize: 16 }} />
                                    Download
                                </button>
                            );

                            // Pause control. Rendered disabled during "Preparing" so the button's
                            // slot stays put through the sub-second hand-off into the live
                            // download, then enables once there's a transfer to actually pause.
                            const pauseButton = (disabled: boolean) => (
                                <button
                                    onClick={disabled ? undefined : pauseUpdate}
                                    disabled={disabled}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                                    style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                >
                                    <PauseIcon sx={{ fontSize: 16 }} />
                                    Pause
                                </button>
                            );

                            // Each state resolves to the status text (left column) and a single
                            // primary action (right column). Updates download in the background
                            // automatically, so most states need no button at all. "Check for
                            // Updates" only appears in the idle state — the one place a force-check
                            // is meaningful (and where support can pull a just-published build);
                            // every other state already knows about the update and offers the one
                            // action that moves it forward.
                            let status: React.ReactNode;
                            let actions: React.ReactNode = null;

                            // Install in progress — restarting/relaunching. Checked first so the
                            // button shows a disabled "Installing…" and repeated clicks are impossible.
                            if (updaterState === 'installing') {
                                status = (
                                    <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--sl-text-muted)' }}>
                                        <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                                        Installing update…
                                    </span>
                                );
                                actions = (
                                    <button
                                        disabled
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                                        style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                    >
                                        <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                                        Installing…
                                    </button>
                                );
                            }
                            // A build already on disk is the authoritative signal, so this is
                            // checked before updateAvailable: the feed can stop reporting the
                            // update while the staged build is still installable, and dropping
                            // the button then would strand the user on the old version.
                            else if (updaterSupported && updaterState === 'downloaded') {
                                const readyVersion = stagedVersion ?? latestVersion;
                                status = (
                                    <span className="text-sm" style={{ color: 'var(--sl-text-secondary)' }}>
                                        Update{readyVersion ? ` v${readyVersion}` : ''} ready to install
                                    </span>
                                );
                                actions = (
                                    <button
                                        onClick={installUpdate}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                        style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                    >
                                        <RefreshIcon sx={{ fontSize: 16 }} />
                                        Restart & Install
                                    </button>
                                );
                            }
                            // Self-update broke. Kept separate from the .deb case below because the
                            // wording is the only thing telling the user something went wrong —
                            // otherwise a failed auto-update looks exactly like a .deb install,
                            // where downloading by hand is simply how it works.
                            else if (updaterState === 'error') {
                                status = (
                                    <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--sl-text-secondary)' }} title={updaterError}>
                                        <ErrorOutlineIcon sx={{ fontSize: 16, color: 'var(--sl-status-error)' }} />
                                        Couldn't install the update automatically
                                    </span>
                                );
                                // Auto-install failed: Download is both the fix and the retry.
                                // Fall back to a re-check only if there's nothing to download.
                                actions = updateAvailable ? downloadButton : checkButton;
                            }
                            // A download in flight is local reality and outranks the feed, which
                            // a force-check mid-download can flip to "no update" (the backend
                            // compares against the running version, not the one being fetched).
                            // Gating this on updateAvailable would blank the progress out from
                            // under a download that is still very much running.
                            else if (updaterSupported && updaterState === 'downloading') {
                                status = (
                                    <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--sl-text-muted)' }}>
                                        <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                                        Downloading update v{stagedVersion ?? latestVersion}… {downloadPercent}%
                                    </span>
                                );
                                actions = pauseButton(false);
                            }
                            // Paused mid-download. electron-updater can't resume from a byte
                            // offset, so Resume restarts the transfer — the progress the user
                            // last saw is kept so the pause reads as a pause, not a reset.
                            else if (updaterSupported && updaterState === 'paused') {
                                status = (
                                    <span className="text-sm" style={{ color: 'var(--sl-text-muted)' }}>
                                        Update v{stagedVersion ?? latestVersion} paused{typeof downloadPercent === 'number' ? ` at ${downloadPercent}%` : ''}
                                    </span>
                                );
                                actions = (
                                    <button
                                        onClick={resumeUpdate}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                        style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                    >
                                        <PlayArrowIcon sx={{ fontSize: 16 }} />
                                        Resume
                                    </button>
                                );
                            }
                            // Feed says there's an update and we can self-install, but
                            // electron-updater hasn't reported progress yet.
                            else if (updateAvailable && updaterSupported) {
                                status = (
                                    <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--sl-text-muted)' }}>
                                        <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                                        Preparing update v{latestVersion}…
                                    </span>
                                );
                                // Disabled Pause holds the slot until the download starts.
                                actions = pauseButton(true);
                            }
                            // 'manual' builds — macOS and the Linux .deb. electron-updater never
                            // downloads anything here, so there is no progress to show: just the
                            // version and a button out to the download page.
                            else if (updateAvailable) {
                                status = <span className="text-sm" style={{ color: 'var(--sl-text-secondary)' }}>Version {latestVersion} available</span>;
                                actions = downloadButton;
                            } else {
                                status = (
                                    <span className="text-sm" style={{ color: 'var(--sl-text-muted)' }}>
                                        {latestVersion ? "You're up to date" : 'Checking for updates…'}
                                    </span>
                                );
                                actions = checkButton;
                            }

                            return (
                                <div className="flex items-center justify-between gap-4">
                                    {/* Left columns: package icon + identity/status stack */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div
                                            className="flex items-center justify-center rounded-xl shrink-0"
                                            style={{ width: 48, height: 48, backgroundColor: 'var(--sl-white-alpha-5)', border: '1px solid var(--sl-border-default)' }}
                                        >
                                            <svg
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="var(--sl-brand-primary)"
                                                strokeWidth="1.75"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="m7.5 4.27 9 5.15" />
                                                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                                                <path d="M3.3 7 12 12l8.7-5" />
                                                <path d="M12 22V12" />
                                            </svg>
                                        </div>
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Smartloop Studio</h2>
                                                <span
                                                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase"
                                                    style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}
                                                >
                                                    v{appVersion}
                                                </span>
                                                {/* Changelog link hidden until the docs page ships —
                                                    restore with CHANGELOG_URL from @/app/constants. */}
                                            </div>
                                            {status}
                                        </div>
                                    </div>

                                    {/* Right: single primary action, vertically centered against
                                        the block. Absent while an update downloads on its own. */}
                                    {actions && (
                                        <div className="flex items-center gap-2 shrink-0">
                                            {actions}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </Box>

                    {/* 1. Theme */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        <Box className="flex items-center gap-2 mb-1">
                            <PaletteIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Theme</h2>
                        </Box>
                        <p className="text-xs md:text-sm mb-4 leading-relaxed" style={{ color: 'var(--sl-text-muted)' }}>
                            Choose how Smartloop looks — switch between light and dark appearances to match your environment.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            {allThemes.map((t) => {
                                const isActive = themeId === t.id;
                                const activeMode = allThemes.find((x) => x.id === themeId)?.mode ?? 'dark';
                                const mismatch = t.mode !== activeMode;
                                const isCustom = isCustomThemeId(t.id);
                                const overlay = mismatch
                                    ? activeMode === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'
                                    : undefined;
                                return (
                                    <div
                                        key={t.id}
                                        onClick={() => setThemeId(t.id)}
                                        className="rounded-xl border-2 cursor-pointer transition-all duration-200 overflow-hidden aspect-square flex flex-col"
                                        style={{
                                            width: 172,
                                            borderColor: isActive ? 'var(--sl-brand-primary)' : 'var(--sl-border-default)',
                                            boxShadow: isActive ? '0 0 0 3px var(--sl-brand-alpha-20)' : 'none',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (isActive) return;
                                            e.currentTarget.style.borderColor = 'var(--sl-brand-alpha-30)';
                                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--sl-brand-alpha-10)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (isActive) return;
                                            e.currentTarget.style.borderColor = 'var(--sl-border-default)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        {/* Mini UI preview */}
                                        <div className="relative flex flex-1 min-h-0 rounded-lg overflow-hidden m-2" style={{ backgroundColor: t.colors.bg.base, border: `1px solid ${t.colors.border.default}` }}>
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
                                                    {isCustom && (
                                                        <button
                                                            title="Remove theme"
                                                            onClick={(e) => { e.stopPropagation(); removeCustomTheme(t.id); }}
                                                            className="flex items-center justify-center rounded transition-colors"
                                                            style={{ width: 16, height: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sl-text-muted)' }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sl-status-error)'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sl-text-muted)'; }}
                                                        >
                                                            <CloseIcon sx={{ fontSize: 13 }} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[10px] mt-0.5 leading-snug" style={{ color: mismatch ? 'var(--sl-text-muted)' : t.colors.text.muted }}>{t.description}</p>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Import tile — drop a YAML palette to add a custom theme */}
                            <div
                                onDragOver={(e) => { e.preventDefault(); setThemeDragOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setThemeDragOver(false); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setThemeDragOver(false);
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) handleThemeFileDrop(file);
                                }}
                                className="rounded-xl border-2 border-dashed cursor-default transition-all duration-200 flex flex-col items-center justify-center gap-2 aspect-square p-3 text-center"
                                style={{
                                    width: 172,
                                    borderColor: themeDragOver ? 'var(--sl-brand-primary)' : 'var(--sl-border-default)',
                                    backgroundColor: themeDragOver ? 'var(--sl-brand-alpha-10)' : 'transparent',
                                }}
                            >
                                <AddIcon sx={{ fontSize: 26, color: themeDragOver ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)' }} />
                                <span className="text-[11px] font-medium" style={{ color: 'var(--sl-text-muted)' }}>
                                    {themeDragOver ? 'Drop to import' : 'Drop a theme'}
                                </span>
                                <span className="text-[9px] leading-snug" style={{ color: 'var(--sl-text-faint)' }}>
                                    name + colors (bg, brand, text)
                                </span>
                            </div>
                        </div>
                        {themeImportError && (
                            <p className="text-[11px] mt-2" style={{ color: 'var(--sl-status-error)' }}>{themeImportError}</p>
                        )}
                    </Box>

                    {/* 2. Agent */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                            <Box className="flex items-center gap-2 mb-1">
                                <DnsIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                                <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Agent</h2>
                            </Box>
                            <p className="text-xs md:text-sm mb-4 leading-relaxed" style={{ color: 'var(--sl-text-muted)' }}>
                                The local agent service that runs your models and handles inference, document indexing, and retrieval on your machine.
                            </p>

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
                                                border: agentRestarting ? '1px solid var(--sl-status-warning)' : serverHealth?.status === 'running' ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-default)',
                                                color: agentRestarting ? 'var(--sl-status-warning)' : serverHealth?.status === 'running' ? 'var(--sl-brand-primary)' : serverHealth?.status === 'error' ? 'var(--sl-status-error)' : 'var(--sl-text-disabled)',
                                                opacity: 0.7,
                                            }}>
                                                {agentRestarting ? 'RESTARTING' : serverHealth?.status === 'running' ? 'HEALTHY' : serverHealth?.status === 'error' ? 'ERROR' : serverHealth?.status === 'unreachable' ? 'UNREACHABLE' : 'UNKNOWN'}
                                            </span>
                                        </Box>
                                    </tr>
                                    {agentVersion && (
                                        <tr>
                                            <Box component="td" sx={{ color: 'var(--sl-text-muted)', fontSize: '11px', fontWeight: 500, width: '40%' }}>
                                                Version
                                            </Box>
                                            <Box component="td">
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-muted)', fontFamily: 'monospace' }}>
                                                    {agentVersion}
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
                                        .filter(([key]) => !['status', 'model', 'flash_attn', 'quantization', 'model_name', 'indexing', 'model_loaded', 'ctx_size', 'n_ctx', 'cwd'].includes(key))
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

                    {/* 4. Active Model Card — specs + performance graph */}
                    {(() => {
                        const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);

                        const healthModelName = serverHealth?.details?.model_name || serverHealth?.details?.model;
                        const displayModel = (healthModelName && slpConfig?.workspace?.models?.find((m: any) => m.model_name === healthModelName)) || activeModel;
                        // Use health endpoint quantization (reflects what's actually running)
                        const healthQuantize = serverHealth?.details?.quantization;
                        const quantize = (healthQuantize ? String(healthQuantize).toUpperCase() : displayModel?.config?.quantize?.toUpperCase()) || null;
                        const ramUsed = systemInfo ? (systemInfo.totalMemGb - systemInfo.freeMemGb).toFixed(1) : null;
                        const ramTotal = systemInfo?.totalMemGb;

                        const specs = [
                            ...(quantize ? [{ label: 'Quantization', value: quantize }] : []),
                            ...(ramUsed && ramTotal ? [{ label: 'RAM', value: `${ramUsed} / ${ramTotal} GB` }] : []),
                            ...(systemInfo?.gpu ? [{ label: 'GPU', value: systemInfo.gpu }] : []),
                        ];

                        // Tok/s comes from the local tps_history table, not from SLP's
                        // config.json, so it must not hang off the config being readable.
                        // It isn't in the snap build — SLP's home there is not the dir the
                        // app reads config.json from — which hid the whole card, graph
                        // included, even though the history was recorded fine.
                        const hasTps = tpsHistory.length > 0 || latestTps !== null;
                        if (specs.length === 0 && !hasTps) return null;

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
                                {specs.length > 0 && (
                                <Box sx={{ p: { xs: 2.5, md: 3 }, pb: 0 }}>
                                    {/* Specs Row */}
                                    <Box className="flex flex-wrap gap-2 mb-3">
                                        {specs.map(({ label, value }) => (
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
                                )}

                                {/* Tok/s Performance Section */}
                                {hasTps && (
                                    <Box sx={{
                                        mx: { xs: 2.5, md: 3 },
                                        mt: specs.length > 0 ? 0 : { xs: 2.5, md: 3 },
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

                    {/* Analytics */}
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

                    {/* 7. Clean — reclaim disk space */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        <Box className="flex items-center gap-2 mb-1">
                            <CleaningServicesIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Clean up</h2>
                        </Box>
                        <p className="text-xs md:text-sm mb-4 leading-relaxed" style={{ color: 'var(--sl-text-muted)' }}>
                            Reclaim disk space used by Smartloop. The default <span className="font-mono">slp-orchestra</span>{' '}
                            and embedding models are always kept, and the agent restarts when you free up space.
                        </p>

                        {(() => {
                            const cats = [
                                { key: 'models' as const, label: 'Models', color: 'var(--sl-brand-primary)' },
                                { key: 'versions' as const, label: 'Versions', color: 'rgb(96,165,250)' },
                                { key: 'logsCache' as const, label: 'Logs', color: 'var(--sl-status-warning)' },
                            ];
                            const totalFolder = storage ? storage.total : 0;
                            const totalAll = storage ? storage.models + storage.versions + storage.logsCache : 0;
                            const kept = Math.max(0, totalFolder - totalAll);   // non-reclaimable footprint
                            const pct = (n: number) => (totalFolder > 0 ? (n / totalFolder) * 100 : 0);
                            return (
                                <>
                                    {/* macOS-style framed box: "X of Y used" header + disk bar */}
                                    <div
                                        className="rounded-lg p-3 mb-4"
                                        style={{ backgroundColor: 'var(--sl-bg-surface-2)', border: '1px solid var(--sl-border-subtle)' }}
                                    >
                                    {/* Header — like macOS "X of Y used": cleanable on the left,
                                        whole footprint on the right */}
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm" style={{ color: 'var(--sl-text-muted)' }}>Total to clean</span>
                                            <span className="text-sm font-semibold font-mono" style={{ color: 'var(--sl-brand-primary)' }}>{formatBytes(selectedReclaim)}</span>
                                        </div>
                                        <span className="text-sm" style={{ color: 'var(--sl-text-faint)' }}>
                                            of <span className="font-mono">{formatBytes(totalFolder)}</span> used
                                        </span>
                                    </div>

                                    {/* macOS disk-style bar — cleanable category segments, then a
                                        labeled "kept" remainder */}
                                    <div
                                        className="flex w-full h-5 rounded-md overflow-hidden gap-[2px]"
                                        style={{
                                            backgroundColor: 'var(--sl-bg-surface-3)',
                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
                                        }}
                                    >
                                        {cats.map((c) => {
                                            const size = storage ? storage[c.key] : 0;
                                            if (size <= 0) return null;
                                            return (
                                                <div
                                                    key={c.key}
                                                    title={`${c.label} — ${formatBytes(size)}`}
                                                    style={{
                                                        // Floor tiny slices so a few-MB category is still visible.
                                                        width: `${pct(size)}%`,
                                                        minWidth: 6,
                                                        backgroundColor: cleanupSel[c.key] ? c.color : 'var(--sl-white-alpha-8)',
                                                        opacity: cleanupSel[c.key] ? 1 : 0.4,
                                                        transition: 'background-color 0.15s ease, opacity 0.15s ease',
                                                    }}
                                                />
                                            );
                                        })}
                                        {kept > 0 && (
                                            <div
                                                className="flex items-center justify-end pr-2"
                                                title={`System — ${formatBytes(kept)} (can't be cleaned)`}
                                                style={{ width: `${pct(kept)}%`, minWidth: 6, backgroundColor: 'var(--sl-white-alpha-12, rgba(255,255,255,0.12))' }}
                                            >
                                                <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: 'var(--sl-text-muted)' }}>{formatBytes(kept)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* macOS-style legend — colored dot + name (+ size). Cleanable
                                        categories toggle inclusion; deselected ones dim. */}
                                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-3">
                                        {cats.map((c) => {
                                            const size = storage ? storage[c.key] : 0;
                                            // Models stays actionable at 0 B so it can still reconcile the
                                            // backend config; versions/logs have nothing to do when empty.
                                            const disabled = !storage || isCleaning || (c.key !== 'models' && size === 0);
                                            const on = cleanupSel[c.key] && !(!storage || (c.key !== 'models' && size === 0));
                                            return (
                                                <button
                                                    key={c.key}
                                                    onClick={() => setCleanupSel((s) => ({ ...s, [c.key]: !s[c.key] }))}
                                                    disabled={disabled}
                                                    className="flex items-center gap-1.5 text-xs transition-opacity"
                                                    style={{ opacity: on ? 1 : 0.4, cursor: disabled ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                                    <span style={{ color: 'var(--sl-text-secondary)' }}>{c.label}</span>
                                                    <span className="font-mono" style={{ color: 'var(--sl-text-faint)' }}>{storage ? formatBytes(size) : '—'}</span>
                                                </button>
                                            );
                                        })}
                                        {kept > 0 && (
                                            <span className="flex items-center gap-1.5 text-xs" title="System data — can't be cleaned">
                                                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--sl-white-alpha-12, rgba(255,255,255,0.12))' }} />
                                                <span style={{ color: 'var(--sl-text-secondary)' }}>System</span>
                                                <span className="font-mono" style={{ color: 'var(--sl-text-faint)' }}>{formatBytes(kept)}</span>
                                            </span>
                                        )}
                                    </div>
                                    </div>

                                    {/* Clean action */}
                                    <div className="flex justify-start">
                                        <button
                                            onClick={runCleanup}
                                            disabled={isCleaning || !(cleanupSel.models || cleanupSel.versions || cleanupSel.logsCache)}
                                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                            style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                        >
                                            {isCleaning ? (
                                                <>
                                                    <CircularProgress size={14} sx={{ color: 'var(--sl-brand-primary)' }} />
                                                    Cleaning…
                                                </>
                                            ) : (
                                                <>
                                                    <DeleteSweepIcon sx={{ fontSize: 16 }} />
                                                    Clean
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </Box>

                </Box>
            </Box>
        </Box>
    );
}
