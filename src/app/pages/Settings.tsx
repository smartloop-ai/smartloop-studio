import { useState, useEffect, useRef } from 'react';
import { Box, Switch, Slider, CircularProgress } from '@mui/material';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { userService } from '@/app/services/user.service';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import MemoryIcon from '@mui/icons-material/Memory';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

interface GlobalSettings {
    default_memory: boolean;
    default_temperature: number;
}

const DEFAULT_SETTINGS: GlobalSettings = {
    default_memory: true,
    default_temperature: 0.3,
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
    const [slpHealth, setSlpHealth] = useState<any>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!isElectron) return;
            const api = (window as any).electronAPI;
            if (api?.getSlpConfig) {
                const cfg = await api.getSlpConfig();
                setSlpConfig(cfg);
            }
            if (api?.getLocalApiUrl) {
                const baseUrl = await api.getLocalApiUrl();
                if (baseUrl) {
                    try {
                        const res = await fetch(`${baseUrl}/health`);
                        if (res.ok) setSlpHealth(await res.json());
                    } catch {}
                }
            }
        };
        load();
    }, []);

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 1500);
        });
    };

    // Load settings from user object
    useEffect(() => {
        if (user) {
            setSettings({
                default_memory: user.default_memory !== undefined ? user.default_memory : DEFAULT_SETTINGS.default_memory,
                default_temperature: user.default_temperature !== undefined ? user.default_temperature : DEFAULT_SETTINGS.default_temperature,
            });
        }
    }, [user]);

    // Auto-save function
    const autoSave = async (newSettings: GlobalSettings) => {
        setIsSaving(true);
        try {
            const updatedUser = await userService.updateSettings(newSettings);
            if (updatedUser) {
                setUser(updatedUser);
                setSaveMessage('Settings saved');
                setTimeout(() => setSaveMessage(''), 2000);
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            setSaveMessage('Failed to save');
            setTimeout(() => setSaveMessage(''), 2000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setSettings(DEFAULT_SETTINGS);
        await autoSave(DEFAULT_SETTINGS);
        setSaveMessage('Settings reset to defaults');
        setTimeout(() => setSaveMessage(''), 2000);
    };

    const handleChange = (key: keyof GlobalSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        // Clear existing timer
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Set new timer for auto-save (debounce)
        autoSaveTimerRef.current = setTimeout(() => {
            autoSave(newSettings);
        }, 1000);
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    return (
        <Box className="min-h-screen bg-black text-white">
            <Box className="p-4">
                {/* Unobtrusive Save Indicator */}
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
                            border: '1px solid #2a2a2a',
                            borderRadius: '8px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        }}
                    >
                        {isSaving ? (
                            <>
                                <CircularProgress size={16} sx={{ color: '#ec4899' }} />
                                <span className="text-sm text-gray-300">Saving...</span>
                            </>
                        ) : saveMessage ? (
                            <>
                                <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981' }} />
                                <span className="text-sm text-green-400">{saveMessage}</span>
                            </>
                        ) : null}
                    </Box>
                </Box>

                <Box className="max-w-4xl mx-auto mt-6 md:mt-8">
                    {/* Header */}
                    <Box className="mb-6 md:mb-8">
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Global Settings</h1>
                        <p className="text-gray-400 text-sm md:text-base">Configure default settings for new projects</p>
                    </Box>

                    {/* Active Model Info */}
                    {isElectron && slpConfig && (() => {
                        const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);
                        if (!activeModel) return null;
                        const rows: { label: string; value: string; key: string }[] = [
                            { label: 'Model', value: activeModel.model_name || '—', key: 'model_name' },
                            { label: 'Quantization', value: activeModel.config?.quantize?.toUpperCase() || '—', key: 'quantize' },
                            { label: 'Context', value: activeModel.config?.ctx_size ? `${activeModel.config.ctx_size.toLocaleString()} tokens` : '—', key: 'ctx' },
                            { label: 'Status', value: slpHealth?.model_loaded ? 'Loaded' : 'Not loaded', key: 'status' },
                            ...(slpHealth?.memory_percent !== undefined ? [{ label: 'Mem pressure', value: `${slpHealth.memory_percent}%`, key: 'mem' }] : []),
                        ];
                        return (
                            <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                                <Box className="flex items-center gap-2 mb-4">
                                    <SmartToyOutlinedIcon sx={{ color: '#ec4899', fontSize: { xs: 20, md: 22 } }} />
                                    <h2 className="text-lg md:text-xl font-semibold text-white">Active Model</h2>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: slpHealth?.model_loaded ? '#22c55e' : '#6b7280', ml: 0.5 }} />
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {rows.map(({ label, value, key }) => (
                                        <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{label}</span>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', fontFamily: key === 'model_name' || key === 'quantize' ? 'monospace' : 'inherit' }}>{value}</span>
                                                {(key === 'model_name' || key === 'quantize') && value !== '—' && (
                                                    <ContentCopyIcon
                                                        onClick={() => copyToClipboard(value, key)}
                                                        sx={{ fontSize: 14, color: copiedField === key ? '#22c55e' : 'rgba(255,255,255,0.2)', cursor: 'pointer', '&:hover': { color: 'rgba(255,255,255,0.6)' } }}
                                                    />
                                                )}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        );
                    })()}

                    {/* AI Model Settings */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <TuneIcon sx={{ color: '#ec4899', fontSize: { xs: 20, md: 24 } }} />
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
                                    color: '#ec4899',
                                    '& .MuiSlider-thumb': {
                                        bgcolor: '#ec4899',
                                    },
                                    '& .MuiSlider-track': {
                                        bgcolor: '#ec4899',
                                    },
                                    '& .MuiSlider-rail': {
                                        bgcolor: '#374151',
                                    },
                                }}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Lower values = more focused and deterministic. Higher values = more creative and random.
                            </p>
                        </Box>
                    </Box>

                    {/* Memory Settings */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <MemoryIcon sx={{ color: '#ec4899', fontSize: { xs: 20, md: 24 } }} />
                            <h2 className="text-lg md:text-xl font-semibold text-white">Memory Settings</h2>
                        </Box>

                        {/* Memory Toggle */}
                        <Box className="flex items-center justify-between p-4 bg-black/50 rounded-lg">
                            <Box>
                                <h3 className="text-sm font-medium text-white mb-1">Enable Memory by Default</h3>
                                <p className="text-xs text-gray-500">
                                    AI will remember context from previous conversations in new projects
                                </p>
                            </Box>
                            <Switch
                                checked={settings.default_memory}
                                onChange={(e) => handleChange('default_memory', e.target.checked)}
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: '#ec4899',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: '#ec4899',
                                    },
                                }}
                            />
                        </Box>
                    </Box>

                    {/* Onboarding Settings */}
                    <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                        <Box className="flex items-center gap-2 mb-4 md:mb-6">
                            <svg className="w-5 h-5 md:w-6 md:h-6 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h2 className="text-lg md:text-xl font-semibold text-white">Onboarding</h2>
                        </Box>

                        {/* Show Onboarding Button */}
                        <Box className="p-4 bg-black/50 rounded-lg">
                            <Box className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0">
                                <Box className="flex-1 md:mr-4">
                                    <h3 className="text-sm font-medium text-white mb-1">Show Welcome Guide</h3>
                                    <p className="text-xs text-gray-500">
                                        Display the onboarding dialog again to review how to use Smartloop
                                    </p>
                                </Box>
                                <button
                                    onClick={async () => {
                                        setIsSaving(true);
                                        try {
                                            const updatedUser = await userService.updateSettings({ onboarded: false });
                                            if (updatedUser) {
                                                setUser(updatedUser);
                                                setSaveMessage('Onboarding reset! Refresh to see it again.');
                                                setTimeout(() => setSaveMessage(''), 3000);
                                            }
                                        } catch (error) {
                                            console.error('Failed to reset onboarding:', error);
                                            setSaveMessage('Failed to reset');
                                            setTimeout(() => setSaveMessage(''), 2000);
                                        } finally {
                                            setIsSaving(false);
                                        }
                                    }}
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-all text-xs md:text-sm font-medium flex items-center gap-2 whitespace-nowrap w-full md:w-auto justify-center"
                                >
                                    <RestartAltIcon sx={{ fontSize: 18 }} />
                                    Show Again
                                </button>
                            </Box>
                        </Box>
                    </Box>

                    {/* Reset Button */}
                    <Box className="mt-6 mb-4">
                        <button
                            onClick={handleReset}
                            disabled={isSaving}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 text-white rounded-lg transition-all text-sm font-medium flex items-center gap-2"
                        >
                            <RestartAltIcon sx={{ fontSize: 18 }} />
                            Reset to Defaults
                        </button>
                    </Box>

                    {/* Info Note */}
                    <Box className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="text-sm text-blue-400">
                            <strong>Note:</strong> These settings will be applied to all new projects.
                            Existing projects will retain their individual settings unless manually updated.
                        </p>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
