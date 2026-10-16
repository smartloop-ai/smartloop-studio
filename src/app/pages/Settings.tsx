import { useState, useEffect, useRef } from 'react';
import { Box, Switch, CircularProgress, Tooltip } from '@mui/material';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { useThemeContext } from '@/app/contexts/ThemeContext';

import { storageService } from '@/app/services/storage.service';
import { BOOTSTRAP_MODEL } from '@/app/constants';
import { useAppStatus } from '@/app/contexts/AppStatusContext';
import { useProjectContext } from '@/app/contexts/ProjectContext';
import { useUpgrade } from '@/app/contexts/UpgradeContext';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import DnsIcon from '@mui/icons-material/Dns';

import PaletteIcon from '@mui/icons-material/Palette';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { parseThemeYaml, isCustomThemeId } from '@/app/theme/custom-themes';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { LogoMark } from '@/app/components/logo';

import type { StorageCleanupRequest, StorageUsage, WebSearchStatus } from '@/electron';

// Categories the Clean panel draws as bands of their own, in bar order.  Keys
// match the API's category keys and the cleanup request flags.
//
// Three of the framework's categories are deliberately absent, and all three are
// still swept on every clean (see runCleanup) — they are just never drawn, because
// none of them is a decision anyone should be asked to make:
//
//   orphan_projects  a project directory only outlives its record because
//                    something left it behind.  Litter, not a choice.
//   versions         old framework payloads under <home>/<x.y.z>/.  Every packaged
//                    build runs SLP in place from the app bundle, so these are only
//                    ever created by the legacy CDN-install path and should not
//                    exist at all on a build that updates properly.
//   cache            the installer's archive staging, which it already unlinks in a
//                    finally after extracting.  Only holds bytes after a hard kill
//                    mid-install.
//
// Anything not listed here — those three, plus conversations, the bundled models
// and live projects — falls into the System band instead.
const CLEANABLE = [
    // A tint of the brand rather than a hue of its own: these are the same
    // things as the Models band beside it, in a different state, and reading as
    // one family is what makes the bar say "this much of your models is in use,
    // this much isn't".  Both tints are re-set per theme (themes.ts), so nothing
    // here is a fixed colour — the panel has to work across every theme.
    //
    // `note` says what Clean actually does to the band, because "Models" and
    // "Unused Models" differ by a word and deleting weights is not undoable in
    // the moment — the tooltip is where that difference gets spelled out.
    {
        key: 'models',
        label: 'Unused Models',
        color: 'var(--sl-brand-light)',
        note: 'Models you have downloaded but no project has switched on. Cleaning deletes them; you can download them again whenever you need them.',
    },
    {
        key: 'logs',
        label: 'Logs',
        color: 'var(--sl-status-warning)',
        note: 'Cleaning empties the current log and deletes its rotated backups. The agent keeps running and starts a fresh log.',
    },
] as const satisfies ReadonlyArray<{
    key: keyof StorageCleanupRequest; label: string; color: string; note: string;
}>;

// The two bands nothing can be cleaned out of.  Models is what the user is
// actually using; System is the framework's own footprint plus everything with
// no band of its own.  They are drawn and totalled like any other segment —
// that is the point, since burying active models in the remainder is what made
// the panel read as "one long System bar".
const MODELS_IN_USE_COLOR = 'var(--sl-brand-primary)';
const SYSTEM_COLOR = 'var(--sl-white-alpha-10)';



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
    const { serverHealth, appUpdate } = useAppStatus();

    // Web search is a per-project backend flag; this switch sets it on every
    // project at once. Shown on while any project still has it on (undefined
    // reads as ON, the backend default), so "off" here means off everywhere.
    // The hosted search endpoint needs a Smartloop token, so it's disabled
    // while signed out (useAuth stands in a { guest: true } placeholder).
    const { projects } = useProjectContext();
    const isSignedIn = !!user && !user.guest;
    const webSearchOn = projects.some((p: any) => p.web_search_enabled !== false);
    const [webSearchSaving, setWebSearchSaving] = useState(false);
    const handleWebSearchToggle = async (enabled: boolean) => {
        setWebSearchSaving(true);
        try {
            const res = await (window as any).electronAPI?.projects?.setWebSearch(enabled);
            if (!res?.success) console.error('[Settings] Failed to set web search:', res?.error);
        } finally {
            setWebSearchSaving(false);
        }
    };

    // The account's monthly search allowance, relayed from the cloud through
    // SLP (which holds the token). Signed-out accounts have no allowance, and
    // an SLP without the route leaves this null, which hides the meter.
    const [webSearchStatus, setWebSearchStatus] = useState<WebSearchStatus | null>(null);
    useEffect(() => {
        if (!isSignedIn) {
            setWebSearchStatus(null);
            return;
        }
        window.electronAPI?.getWebSearchStatus?.().then((res) => {
            setWebSearchStatus(res?.success && res.data ? res.data : null);
        });
    // Re-read on a plan change too: upgrading raises the allowance.
    }, [isSignedIn, user?.is_paid]);
    const webSearchQuota = webSearchStatus?.quota ?? null;
    // How a free account buys more credits: Pro, through StoreKit in the Mac
    // App Store build and Stripe Checkout elsewhere (UpgradeContext).
    const { available: canUpgrade, product: proProduct, openUpgrade } = useUpgrade();

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

    // Storage / free-up-space.  The framework reports the categories and what
    // is reclaimable in each (GET /v1/storage/usage); this panel only renders
    // them, so a new category needs no change here beyond a label and a colour.
    const [storage, setStorage] = useState<StorageUsage | null>(null);
    const [isCleaning, setIsCleaning] = useState(false);
    const [cleanupError, setCleanupError] = useState('');

    const loadStorage = async () => {
        const res = await window.electronAPI?.getStorageUsage?.();
        if (res?.success && res.data) {
            setStorage(res.data);
            setCleanupError('');
        } else {
            setStorage(null);
            setCleanupError(res?.error || 'Could not read storage usage.');
        }
    };
    useEffect(() => { loadStorage(); }, []);

    const reclaimableOf = (key: string) => storage?.categories?.[key]?.reclaimable ?? 0;
    // Everything Clean will free.  There is no per-band opt-out: choosing to
    // leave some reclaimable space behind is not a thing people want, and
    // offering it as pre-checked filters that can only be switched *off* asked
    // everyone to understand a control almost nobody needed.
    const totalReclaim = CLEANABLE.reduce((sum, c) => sum + reclaimableOf(c.key), 0);

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
        setCleanupError('');
        try {
            // Always swept, never drawn (see CLEANABLE).  None of the three is a
            // choice worth putting to someone: an orphaned project directory is
            // litter from a bug, and old version payloads and the installer's
            // archive staging should not exist at all on a build that updates
            // itself properly.  Sweeping them anyway is self-healing for the
            // machines where they do.
            //
            // A clean can therefore free slightly more than "Total to clean"
            // promised — the harmless direction, and normally zero, since all
            // three are empty unless something went wrong.
            const request: StorageCleanupRequest = {
                orphan_projects: true,
                versions: true,
                cache: true,
            };
            for (const c of CLEANABLE) {
                request[c.key] = true;
            }
            const res = await window.electronAPI?.cleanupStorage?.(request);
            if (!res?.success) {
                setCleanupError(res?.error || 'Cleanup failed.');
                return;
            }
            // The framework returns a fresh report, so there's no need to re-ask.
            if (res.data?.usage) setStorage(res.data.usage);
            if (res.data?.restart_required) {
                setCleanupError('Some files were still in use. Restart the agent to finish freeing them.');
            }
        } finally {
            setIsCleaning(false);
        }
    };

    const DOWNLOAD_URL = 'https://smartloop.ai/download/';

    const { updateAvailable, latestVersion, delivery } = appUpdate;

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

                    {/* 0. App version / updates.

                        One layout, two states. The card reads the same either way —
                        mark, name, version pill — and an available update only adds a
                        line under the name and a button beside the pill. It used to be
                        two separate cards with different icons, different version
                        treatments and different padding, so an update made the whole
                        block jump. Padding now matches every other card on this page. */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        {(() => {
                            // The only variable. 'store' (Mac App Store) and 'none' (unpackaged
                            // dev build) never report an update, so they show the plain card;
                            // 'manual' — every shipped build — shows it too until the feed says
                            // there is something newer. Nothing downloads in any state, so there
                            // is no progress, pause, restart or failure to render here.
                            const showUpdate = delivery === 'manual' && updateAvailable;

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

                                    {/* One element, either way. With nothing newer published it is
                                        the running version; once there is, the version steps aside
                                        for the thing you'd actually want to do about it. Nothing
                                        moves, nothing is added — the same slot says a different
                                        thing, so the card is one line high in both states.

                                        The running version isn't lost, just not shouted: it moves
                                        to the button's tooltip, which is where "and what am I on?"
                                        is worth answering but not worth spending the card on. */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {showUpdate ? (
                                            <button
                                                onClick={() => window.electronAPI?.openExternal?.(DOWNLOAD_URL)}
                                                title={`You're on v${appVersion}`}
                                                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm md:text-base font-semibold transition-colors whitespace-nowrap"
                                                style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                                            >
                                                <SystemUpdateAltIcon sx={{ fontSize: 18 }} />
                                                {/* Opens smartloop.ai/download/ in the browser — the
                                                    app installs nothing itself. Falls back to
                                                    "Download" if the feed ever reports an update
                                                    without naming its version. */}
                                                {latestVersion ? `Update to v${latestVersion}` : 'Download'}
                                            </button>
                                        ) : (
                                            <span
                                                className="text-sm md:text-base font-semibold font-mono px-3.5 py-1.5 rounded-lg whitespace-nowrap"
                                                style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.8 }}
                                            >
                                                v{appVersion}
                                            </span>
                                        )}
                                    </div>
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
                                                border: serverHealth?.status === 'running' ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-default)',
                                                color: serverHealth?.status === 'running' ? 'var(--sl-brand-primary)' : serverHealth?.status === 'error' ? 'var(--sl-status-error)' : 'var(--sl-text-disabled)',
                                                opacity: 0.7,
                                            }}>
                                                {serverHealth?.status === 'running' ? 'HEALTHY' : serverHealth?.status === 'error' ? 'ERROR' : serverHealth?.status === 'unreachable' ? 'UNREACHABLE' : 'UNKNOWN'}
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

                    {/* Web search — app-wide, applied to every project */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl" sx={{ bgcolor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-default)' }}>
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <TravelExploreIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--sl-text-primary)' }}>Web search</h2>
                        </Box>

                        <Box className="flex items-center justify-between gap-4 p-4" sx={{ bgcolor: 'var(--sl-white-alpha-5)', borderRadius: '12px', border: '1px solid var(--sl-border-subtle)', opacity: isSignedIn ? 1 : 0.5 }}>
                            <Box>
                                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--sl-text-primary)' }}>Enable web search</h3>
                                <p className="text-xs" style={{ color: 'var(--sl-text-disabled)' }}>
                                    {isSignedIn
                                        ? 'Let answers reach current information from the web, with sources cited. Applies to all projects.'
                                        : 'Log in to use web search.'}
                                </p>
                            </Box>
                            <Switch
                                checked={isSignedIn && webSearchOn}
                                disabled={!isSignedIn || webSearchSaving || projects.length === 0}
                                onChange={(e) => handleWebSearchToggle(e.target.checked)}
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--sl-brand-primary)' },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--sl-brand-primary)' },
                                }}
                            />
                        </Box>

                        {/* This month's search credits — mirrors the web app's Settings → Web Search. */}
                        {isSignedIn && webSearchQuota && (() => {
                            const { limit, used, remaining, resets_at, plan } = webSearchQuota;
                            const unmetered = limit === null;
                            const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                            const spent = remaining === 0;
                            // Amber before the wall, red at it.
                            const barColor = spent ? 'var(--sl-status-error)' : pct >= 80 ? 'var(--sl-status-warning)' : 'var(--sl-brand-primary)';
                            const planLabel = plan === 'paid' ? 'Pro' : plan === 'admin' ? 'Admin' : 'Free';
                            const resetsOn = new Date(resets_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
                            return (
                                <>
                                    <Box className="flex flex-col gap-2 mt-3 p-4" sx={{ bgcolor: 'var(--sl-white-alpha-5)', borderRadius: '12px', border: '1px solid var(--sl-border-subtle)' }}>
                                        <h3 className="text-sm font-medium" style={{ color: 'var(--sl-text-primary)' }}>Credits this month</h3>
                                        {unmetered ? (
                                            <Box className="flex items-center gap-2">
                                                <TravelExploreIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
                                                <span className="text-sm" style={{ color: 'var(--sl-text-muted)' }}>
                                                    {used.toLocaleString()} credits used so far — unlimited
                                                </span>
                                            </Box>
                                        ) : (
                                            <>
                                                <Box className="flex items-baseline justify-between gap-3">
                                                    <span className="text-sm" style={{ color: 'var(--sl-text-primary)' }}>
                                                        <span className="font-semibold">{used.toLocaleString()}</span>
                                                        <span style={{ color: 'var(--sl-text-faint)' }}> / {limit!.toLocaleString()} credits</span>
                                                    </span>
                                                    <span className="text-xs" style={{ color: 'var(--sl-text-faint)' }}>
                                                        {(remaining ?? 0).toLocaleString()} left
                                                    </span>
                                                </Box>
                                                <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sl-bg-surface-3)' }}>
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%`, backgroundColor: barColor }} />
                                                </div>
                                            </>
                                        )}
                                        <p className="text-xs" style={{ color: 'var(--sl-text-disabled)' }}>
                                            {unmetered
                                                ? 'This account is not metered.'
                                                : spent
                                                    ? `You've used this month's credits. Answers still work — they just stop reaching the web. Resets on ${resetsOn}.`
                                                    : `Resets on ${resetsOn}. ${planLabel} plan: ${limit!.toLocaleString()} credits a month, one per web search.`}
                                        </p>
                                        {canUpgrade && plan === 'free' && (
                                            <Box className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-sl-border-subtle">
                                                <span className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                                                    Need more? Pro includes 1,000 credits a month.
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={openUpgrade}
                                                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-sl-text-primary border transition-colors"
                                                    style={{ borderColor: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
                                                >
                                                    Upgrade · {proProduct?.formattedPrice || '$5'}/mo
                                                </button>
                                            </Box>
                                        )}
                                    </Box>
                                </>
                            );
                        })()}
                        <p className="text-xs mt-3 px-1 leading-relaxed" style={{ color: 'var(--sl-text-faint)' }}>
                            Only the search query leaves your device. Result links come back through Smartloop, then candidate pages are
                            fetched and ranked locally, so Smartloop never sees which sites you visit. Query wording, results and page
                            contents are not retained — your account records only that a search ran (when, from which app, and how many
                            results came back) and counts it against your monthly allowance.{' '}
                            <button
                                type="button"
                                onClick={() => (window as any).electronAPI?.openExternal('https://smartloop.ai/docs/web-search/')}
                                className="cursor-pointer underline"
                                style={{ color: 'var(--sl-brand-primary)' }}
                            >
                                Learn more
                            </button>
                        </p>
                    </Box>

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
                            Reclaim disk space used by Smartloop. Models you're using are kept, as are
                            <span className="font-mono"> {BOOTSTRAP_MODEL} </span> and the embedding model, which the
                            agent needs to run. The agent keeps running while it cleans up.
                        </p>

                        {(() => {
                            // Only categories the framework actually reported, so the bar
                            // never shows a segment for something this build can't clean.
                            const cats = CLEANABLE.filter((c) => storage?.categories?.[c.key]);
                            const totalFolder = storage ? storage.total : 0;
                            const models = storage?.categories?.models;

                            // Undefined on a framework older than the group
                            // subtotals.  Falling back to 0 is not a gap: those
                            // bytes stay inside the System remainder below, which
                            // is exactly how this panel read before.  Don't
                            // "fix" this to models?.kept — that includes the
                            // bundled trees, which belong to System.
                            const modelsInUse = models?.in_use ?? 0;
                            const frameworkModels = (models?.system ?? 0) + (models?.overhead ?? 0);

                            const cleanableSum = cats.reduce((sum, c) => sum + reclaimableOf(c.key), 0);
                            // One subtraction, so every byte of the footprint sits
                            // in exactly one band and none can go negative: the
                            // bundled models, conversations, live projects,
                            // config.json, studio.db — and orphaned project dirs,
                            // which are swept without ever being drawn.
                            const system = Math.max(0, totalFolder - modelsInUse - cleanableSum);
                            const pct = (n: number) => (totalFolder > 0 ? (n / totalFolder) * 100 : 0);

                            // Bar order, biggest commitment first: what is in use,
                            // then what is not, then everything untouchable.
                            const bands: {
                                key: string;
                                label: string;
                                color: string;
                                bytes: number;
                                title: string;
                            }[] = [
                                {
                                    key: 'models_in_use',
                                    label: 'Models',
                                    color: MODELS_IN_USE_COLOR,
                                    bytes: modelsInUse,
                                    title: `Models — ${formatBytes(modelsInUse)}. Switched on in at least one project, or loaded right now. Cleaning never touches these.`,
                                },
                                ...cats.map((c) => ({
                                    key: c.key,
                                    label: c.label,
                                    color: c.color,
                                    bytes: reclaimableOf(c.key),
                                    title: `${c.label} — ${formatBytes(reclaimableOf(c.key))}. ${c.note}`,
                                })),
                                {
                                    key: 'system',
                                    label: 'System',
                                    color: SYSTEM_COLOR,
                                    bytes: system,
                                    // Not "cleaning never touches any of this": the
                                    // three categories swept but never drawn (see
                                    // runCleanup) have nowhere else to sit, so their
                                    // bytes are inside this band.  They are zero on a
                                    // healthy install, and the promise that matters —
                                    // your own files survive a clean — is made about
                                    // the things it is actually made about.
                                    title: frameworkModels > 0
                                        ? `System — ${formatBytes(system)}. ${formatBytes(frameworkModels)} of that is ${BOOTSTRAP_MODEL} and the embedding model, which the agent cannot run without; the rest is your projects, chats and app data. Cleaning never touches those.`
                                        : `System — ${formatBytes(system)}. Your projects, chats and app data. Cleaning never touches those.`,
                                },
                            ];
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
                                            <span className="text-sm font-semibold font-mono" style={{ color: 'var(--sl-brand-primary)' }}>{formatBytes(totalReclaim)}</span>
                                        </div>
                                        <span className="text-sm" style={{ color: 'var(--sl-text-faint)' }}>
                                            of <span className="font-mono">{formatBytes(totalFolder)}</span> used
                                        </span>
                                    </div>

                                    {/* macOS disk-style bar.  Every band is drawn,
                                        including the two that can't be cleaned, so
                                        the bar accounts for the whole footprint
                                        rather than trailing off into a remainder. */}
                                    <div
                                        className="flex w-full h-5 rounded-md overflow-hidden gap-[2px]"
                                        style={{
                                            backgroundColor: 'var(--sl-bg-surface-3)',
                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
                                        }}
                                    >
                                        {bands.map((b) => {
                                            if (b.bytes <= 0) return null;
                                            const isSystem = b.key === 'system';
                                            return (
                                                <Tooltip key={b.key} title={b.title} arrow placement="top">
                                                <div
                                                    className={isSystem ? 'flex items-center justify-end pr-2' : undefined}
                                                    style={{
                                                        // Floor tiny slices so a few-MB band is still visible.
                                                        // Everything but System holds its width, so the rounding
                                                        // that buys those pixels comes out of the one band big
                                                        // enough not to misrepresent itself by losing them.
                                                        width: `${pct(b.bytes)}%`,
                                                        minWidth: 6,
                                                        flexShrink: isSystem ? 1 : 0,
                                                        backgroundColor: b.color,
                                                    }}
                                                >
                                                    {isSystem && (
                                                        <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: 'var(--sl-text-muted)' }}>{formatBytes(b.bytes)}</span>
                                                    )}
                                                </div>
                                                </Tooltip>
                                            );
                                        })}
                                    </div>

                                    {/* macOS-style legend — colored dot + name + size.
                                        Labels, not controls: Clean reclaims everything it
                                        safely can in one press, so there is no per-band
                                        choice to present.  The row is one tooltip target,
                                        so the dot, the name and the size all explain the
                                        band — the dot alone is a 10px target and the name
                                        is where someone actually points. */}
                                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-3">
                                        {bands.map((b) => {
                                            if (b.bytes <= 0) return null;
                                            return (
                                                <Tooltip key={b.key} title={b.title} arrow placement="top">
                                                    <span className="flex items-center gap-1.5 text-xs cursor-help">
                                                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                                                        <span style={{ color: 'var(--sl-text-secondary)' }}>{b.label}</span>
                                                        <span className="font-mono" style={{ color: 'var(--sl-text-faint)' }}>{storage ? formatBytes(b.bytes) : '—'}</span>
                                                    </span>
                                                </Tooltip>
                                            );
                                        })}
                                    </div>
                                    </div>

                                    {/* Clean action */}
                                    <div className="flex items-center gap-3 justify-start">
                                        {/* The span is load-bearing: a disabled button fires no
                                            pointer events, so without it the tooltip is silent
                                            exactly when it has something to say. */}
                                        <Tooltip
                                            arrow
                                            placement="top"
                                            title={totalReclaim === 0
                                                ? 'Nothing to reclaim right now.'
                                                : `Free ${formatBytes(totalReclaim)}. The agent keeps running, and models you are using are never removed.`}
                                        >
                                        <span className="inline-flex">
                                        <button
                                            onClick={runCleanup}
                                            disabled={isCleaning || totalReclaim === 0}
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
                                        </span>
                                        </Tooltip>
                                        {cleanupError && (
                                            <span className="text-xs" style={{ color: 'var(--sl-status-warning)' }}>
                                                {cleanupError}
                                            </span>
                                        )}
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
