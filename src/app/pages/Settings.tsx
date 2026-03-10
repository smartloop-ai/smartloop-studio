import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Switch, Slider, CircularProgress, TextField } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { userService } from '@/app/services/user.service';
import { storageService } from '@/app/services/storage.service';
import { API_ENDPOINT } from '@/app/constants';
import MemoryIcon from '@mui/icons-material/Memory';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

const MEMORY_POLL_INTERVAL = 30_000; // 30 seconds
const MEMORY_GRAPH_POINTS = 60; // Show last 60 data points

// SVG Line Graph component for memory usage
function MemoryLineGraph({ dataPoints, timestamps }: { dataPoints: number[]; timestamps?: string[] }) {
    if (dataPoints.length === 0) return null;

    const width = 520;
    const height = 140;
    const padding = { top: 12, right: 12, bottom: 24, left: 36 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    const maxVal = 100;
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

    const yTicks = [0, 25, 50, 75, 100];
    const lineColor = '#ec4899';

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
                        <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="monospace">{tick}%</text>
                    </g>
                );
            })}

            {/* Area fill */}
            <path d={areaD} fill="url(#memGradient)" />

            {/* Glow effect */}
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.15} filter="url(#glow)" />

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
                <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
                <filter id="glow">
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
    const [systemInfo, setSystemInfo] = useState<any>(null);
    const [memoryHistory, setMemoryHistory] = useState<{ memory_percent: number; created_at: string }[]>([]);
    const memoryPollRef = useRef<NodeJS.Timeout | null>(null);
    const [localModels, setLocalModels] = useState<any[]>([]);
    const [remoteModels, setRemoteModels] = useState<any[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [isInitializingModel, setIsInitializingModel] = useState(false);
    const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
    const [initProgress, setInitProgress] = useState<{ percent: number; status: string } | null>(null);
    const [modelSearch, setModelSearch] = useState('');

    // Fetch local models from framework /v1/models
    const fetchLocalModels = useCallback(async () => {
        try {
            const api = (window as any).electronAPI;
            if (api?.getLocalApiUrl) {
                const baseUrl = await api.getLocalApiUrl();
                if (baseUrl) {
                    const res = await fetch(`${baseUrl}/v1/models`);
                    if (res.ok) {
                        const data = await res.json();
                        const models = Array.isArray(data) ? data : (data.data || []);
                        setLocalModels(models);
                    }
                }
            }
        } catch (err) {
            console.warn('Failed to fetch local models:', err);
        }
    }, []);

    // Fetch remote models from API if logged in
    useEffect(() => {
        fetchLocalModels();

        const fetchRemote = async () => {
            try {
                const token = await storageService.getItem('token');
                if (!token) return;
                const res = await fetch(`${API_ENDPOINT}/models`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    const models = Array.isArray(data) ? data : (data.data || []);
                    setRemoteModels(models);
                }
            } catch (err) {
                console.warn('Failed to fetch remote models:', err);
            }
        };
        fetchRemote();
    }, [user, fetchLocalModels]);

    // Set selected model: load from storage first, fallback to local config
    useEffect(() => {
        const loadSelectedModel = async () => {
            const stored = await storageService.getItem('selected_model');
            if (stored) {
                setSelectedModel(stored);
            } else if (slpConfig) {
                const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);
                if (activeModel?.model_name) {
                    setSelectedModel(activeModel.model_name);
                    await storageService.setItem('selected_model', activeModel.model_name);
                }
            }
        };
        loadSelectedModel();
    }, [slpConfig]);

    // Call /v1/init with SSE progress tracking
    const callInitWithProgress = useCallback(async (modelName: string): Promise<boolean> => {
        const api = (window as any).electronAPI;
        if (!api?.getLocalApiUrl) return false;
        const baseUrl = await api.getLocalApiUrl();
        if (!baseUrl) return false;

        const token = await storageService.getItem('token');
        const devToken = await storageService.getItem('dev_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        setInitProgress({ percent: 0, status: 'Initializing...' });
        window.dispatchEvent(new CustomEvent('modelInitStatus', { detail: { loading: true, model: modelName } }));

        const body: Record<string, string> = { model_name: modelName };
        if (devToken) body.developer_token = devToken;

        return new Promise<boolean>((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${baseUrl}/v1/init`);
            // Allow progressive reading of response text
            xhr.responseType = 'text';
            for (const [key, val] of Object.entries(headers)) {
                xhr.setRequestHeader(key, val);
            }

            let lastProcessed = 0;

            const processChunk = () => {
                if (!xhr.responseText) return;
                const text = xhr.responseText.substring(lastProcessed);
                if (!text) return;
                lastProcessed = xhr.responseText.length;
                const lines = text.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    console.log('[Init SSE]', trimmed);
                    const payload = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
                    try {
                        const event = JSON.parse(payload);
                        const status = event.status || event.message || event.state;

                        // Calculate percent from downloaded/total bytes
                        if (event.downloaded !== undefined && event.total > 0) {
                            const pct = Math.round((event.downloaded / event.total) * 100);
                            const downloadedMB = (event.downloaded / (1024 * 1024)).toFixed(1);
                            const totalMB = (event.total / (1024 * 1024)).toFixed(1);
                            setInitProgress({ percent: pct, status: `Downloading... ${downloadedMB} / ${totalMB} MB` });
                        } else {
                            const pct = event.progress ?? event.percent ?? event.percentage;
                            if (pct !== undefined) {
                                setInitProgress({ percent: Number(pct), status: status || 'Downloading...' });
                            } else if (status) {
                                setInitProgress(prev => ({ percent: prev?.percent || 0, status }));
                            }
                        }

                        if (status === 'complete' || status === 'ready' || status === 'done') {
                            setInitProgress({ percent: 100, status: 'Ready' });
                        }
                    } catch {
                        // Skip non-JSON lines like "event: progress"
                    }
                }
            };

            xhr.onprogress = processChunk;

            xhr.onreadystatechange = () => {
                // LOADING state (3) = receiving data progressively
                if (xhr.readyState === 3) {
                    processChunk();
                }
            };

            xhr.onload = () => {
                // Process any remaining data
                processChunk();
                setInitProgress(null);
                window.dispatchEvent(new CustomEvent('modelInitStatus', { detail: { loading: false, model: modelName } }));
                resolve(xhr.status >= 200 && xhr.status < 300);
            };

            xhr.onerror = () => {
                console.error('Error in init request');
                setInitProgress(null);
                window.dispatchEvent(new CustomEvent('modelInitStatus', { detail: { loading: false, model: modelName } }));
                resolve(false);
            };

            xhr.send(JSON.stringify(body));
        })
    }, []);

    // Select an already-downloaded model
    const handleModelSelect = useCallback(async (modelName: string) => {
        if (modelName === selectedModel) return;
        setSelectedModel(modelName);
        // Persist selected model so chat uses it
        await storageService.setItem('selected_model', modelName);
        setIsInitializingModel(true);
        try {
            await callInitWithProgress(modelName);
        } catch (err) {
            console.error('Error initializing model:', err);
        } finally {
            setIsInitializingModel(false);
        }
    }, [selectedModel, callInitWithProgress]);

    // Download a model that isn't available locally
    const handleDownloadModel = useCallback(async (modelName: string) => {
        setDownloadingModel(modelName);
        try {
            const success = await callInitWithProgress(modelName);
            if (success) {
                // Wait briefly for server to register the new model
                await new Promise(r => setTimeout(r, 1000));
                await fetchLocalModels();
                setSelectedModel(modelName);
                await storageService.setItem('selected_model', modelName);
            }
        } catch (err) {
            console.error('Error downloading model:', err);
        } finally {
            setDownloadingModel(null);
        }
    }, [callInitWithProgress, fetchLocalModels]);

    // Load persisted memory history from DB on mount
    useEffect(() => {
        const loadHistory = async () => {
            if (!isElectron) return;
            const history = await storageService.getMemoryUsage(MEMORY_GRAPH_POINTS);
            if (history.length > 0) {
                setMemoryHistory(history);
            }
        };
        loadHistory();
    }, []);

    const fetchHealth = useCallback(async (persist = false) => {
        if (!isElectron) return;
        const api = (window as any).electronAPI;
        if (api?.getLocalApiUrl) {
            const baseUrl = await api.getLocalApiUrl();
            if (baseUrl) {
                try {
                    const res = await fetch(`${baseUrl}/health`);
                    if (res.ok) {
                        const data = await res.json();
                        setSlpHealth(data);
                        if (data.memory_percent !== undefined && persist) {
                            // Save to DB
                            await storageService.addMemoryUsage(data.memory_percent);
                            // Refresh from DB to stay in sync
                            const history = await storageService.getMemoryUsage(MEMORY_GRAPH_POINTS);
                            setMemoryHistory(history);
                        }
                    }
                } catch {}
            }
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            if (!isElectron) return;
            const api = (window as any).electronAPI;
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
            // Initial health fetch (persist immediately to start recording)
            await fetchHealth(true);
        };
        load();

        // Poll health every 30 seconds and persist to DB
        memoryPollRef.current = setInterval(() => fetchHealth(true), MEMORY_POLL_INTERVAL);

        return () => {
            if (memoryPollRef.current) clearInterval(memoryPollRef.current);
        };
    }, [fetchHealth]);

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

    const currentMemPercent = slpHealth?.memory_percent;
    const memColor = '#ec4899';

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
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Settings</h1>
                        <p className="text-gray-400 text-sm md:text-base">Model configuration and default settings</p>
                    </Box>

                    {/* Active Model Card - Redesigned */}
                    {isElectron && slpConfig && (() => {
                        const activeModel = slpConfig?.workspace?.models?.find((m: any) => m.is_active);
                        if (!activeModel) return null;

                        const quantize = activeModel.config?.quantize?.toUpperCase() || '—';
                        const ctxSize = activeModel.config?.ctx_size;
                        const ramUsed = systemInfo ? (systemInfo.totalMemGb - systemInfo.freeMemGb).toFixed(1) : null;
                        const ramTotal = systemInfo?.totalMemGb;

                        // Build model options: compare local vs remote
                        const localModelName = activeModel.model_name || '';
                        const localModelNames = new Set(localModels.map((m: any) => m.name || m.id || m.model).filter(Boolean));
                        localModelNames.add(localModelName);
                        const isPaidUser = user?.is_paid || user?.is_premium;
                        const allModelEntries: { name: string; description?: string; isLocal: boolean; details?: any }[] = [
                            { name: localModelName, isLocal: true },
                        ];
                        remoteModels.forEach((m: any) => {
                            const name = m.name || m.id || m.model;
                            const accessLevel = m.access_level || 'free';
                            if (name && !allModelEntries.find(e => e.name === name)) {
                                if (accessLevel === 'free' || isPaidUser) {
                                    allModelEntries.push({
                                        name,
                                        description: m.description || '',
                                        isLocal: localModelNames.has(name),
                                        details: m,
                                    });
                                }
                            }
                        });

                        return (
                            <Box
                                className="mb-6 md:mb-8"
                                sx={{
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    background: 'linear-gradient(145deg, rgba(20, 20, 25, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%)',
                                }}
                            >
                                {/* Active model + specs */}
                                <Box sx={{ p: { xs: 2.5, md: 3 }, pb: 0 }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.3px', color: 'white', marginBottom: '12px' }}>
                                        {selectedModel || activeModel.model_name}
                                        {isInitializingModel && (
                                            <CircularProgress size={14} sx={{ color: '#ec4899', ml: 1.5, verticalAlign: 'middle' }} />
                                        )}
                                    </h2>

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
                                                    bgcolor: 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 0.75,
                                                }}
                                            >
                                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{label}</span>
                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>

                                {/* Memory Usage Section */}
                                {(memoryHistory.length > 0 || currentMemPercent !== undefined) && (
                                    <Box sx={{
                                        mx: { xs: 2.5, md: 3 },
                                        mb: { xs: 2.5, md: 3 },
                                        p: 2,
                                        bgcolor: 'rgba(0, 0, 0, 0.4)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255, 255, 255, 0.04)',
                                    }}>
                                        <Box className="flex items-center justify-between mb-2">
                                            <Box className="flex items-center gap-1.5">
                                                <SpeedIcon sx={{ fontSize: 16, color: memColor }} />
                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.3px' }}>MEMORY PRESSURE</span>
                                            </Box>
                                            {currentMemPercent !== undefined && (
                                                <Box className="flex items-center gap-1.5">
                                                    <span style={{
                                                        fontSize: '22px',
                                                        fontWeight: 700,
                                                        fontFamily: 'monospace',
                                                        color: memColor,
                                                        lineHeight: 1,
                                                    }}>
                                                        {currentMemPercent}
                                                    </span>
                                                    <span style={{ fontSize: '12px', color: memColor, fontWeight: 500, opacity: 0.7 }}>%</span>
                                                </Box>
                                            )}
                                        </Box>
                                        {memoryHistory.length > 1 && (
                                            <MemoryLineGraph
                                                dataPoints={memoryHistory.map(h => h.memory_percent)}
                                                timestamps={memoryHistory.map(h => h.created_at)}
                                            />
                                        )}
                                        {memoryHistory.length <= 1 && currentMemPercent !== undefined && (
                                            <Box sx={{ mt: 1 }}>
                                                {/* Progress bar fallback when not enough data points */}
                                                <Box sx={{
                                                    width: '100%',
                                                    height: '6px',
                                                    bgcolor: 'rgba(255, 255, 255, 0.06)',
                                                    borderRadius: '3px',
                                                    overflow: 'hidden',
                                                }}>
                                                    <Box sx={{
                                                        width: `${currentMemPercent}%`,
                                                        height: '100%',
                                                        bgcolor: memColor,
                                                        borderRadius: '3px',
                                                        transition: 'width 0.5s ease',
                                                        boxShadow: `0 0 8px ${memColor}40`,
                                                    }} />
                                                </Box>
                                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', display: 'block', marginTop: '4px' }}>
                                                    Recording data points every 30s...
                                                </span>
                                            </Box>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })()}

                    {/* Available Models */}
                    {isElectron && (() => {
                        const localModelName = slpConfig?.workspace?.models?.find((m: any) => m.is_active)?.model_name || '';
                        const localModelNames = new Set(localModels.map((m: any) => m.name || m.id || m.model).filter(Boolean));
                        localModelNames.add(localModelName);
                        const isPaidUser = user?.is_paid || user?.is_premium;

                        // Collect all unique models from remote that aren't already the active one
                        const availableModels = remoteModels
                            .map((m: any) => ({
                                name: m.name || m.id || m.model,
                                description: m.description || '',
                                accessLevel: m.access_level || 'free',
                                isLocal: localModelNames.has(m.name || m.id || m.model),
                            }))
                            .filter(m => m.name && (m.accessLevel === 'free' || isPaidUser));

                        if (availableModels.length === 0) return null;

                        return (
                            <Box className="mb-6 md:mb-8 p-4 md:p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
                                <Box className="flex items-center gap-2 mb-4">
                                    <DownloadIcon sx={{ color: '#ec4899', fontSize: { xs: 20, md: 24 } }} />
                                    <h2 className="text-lg md:text-xl font-semibold text-white">Available Models</h2>
                                </Box>

                                {/* Search */}
                                <TextField
                                    placeholder="Search models..."
                                    variant="outlined"
                                    size="small"
                                    fullWidth
                                    onChange={(e) => {
                                        const el = e.target.closest('.model-list-container');
                                        if (el) el.setAttribute('data-filter', e.target.value.toLowerCase());
                                        // Force re-render via state isn't needed — use CSS/DOM filter
                                        // Simple approach: just use state
                                        setModelSearch(e.target.value);
                                    }}
                                    sx={{
                                        mb: 2,
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: 'rgba(0,0,0,0.3)',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            color: 'white',
                                            '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                                            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                                            '&.Mui-focused fieldset': { borderColor: 'rgba(236,72,153,0.4)' },
                                        },
                                        '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.3)', opacity: 1 },
                                    }}
                                />

                                {/* Model list */}
                                <Box className="flex flex-col gap-1.5">
                                    {availableModels
                                        .filter(m => !modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.description.toLowerCase().includes(modelSearch.toLowerCase()))
                                        .map((model) => {
                                            const isActive = selectedModel === model.name;
                                            const isDownloading = downloadingModel === model.name;
                                            return (
                                                <Box
                                                    key={model.name}
                                                    sx={{
                                                        p: 1.5,
                                                        borderRadius: '8px',
                                                        border: isActive ? '1px solid rgba(236,72,153,0.3)' : '1px solid rgba(255,255,255,0.04)',
                                                        bgcolor: isActive ? 'rgba(236,72,153,0.06)' : 'rgba(255,255,255,0.02)',
                                                        transition: 'all 0.15s ease',
                                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                                                    }}
                                                >
                                                    <Box className="flex items-center justify-between gap-3">
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            <Box className="flex items-center gap-2">
                                                                <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: isActive ? 'white' : 'rgba(255,255,255,0.8)' }}>
                                                                    {model.name}
                                                                </span>
                                                                {isActive && (
                                                                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#ec4899', padding: '1px 6px', borderRadius: '4px', background: 'rgba(236,72,153,0.15)' }}>ACTIVE</span>
                                                                )}
                                                                {!isActive && model.isLocal && (
                                                                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>DOWNLOADED</span>
                                                                )}
                                                            </Box>
                                                            {model.description && (
                                                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginTop: '2px' }}>
                                                                    {model.description.length > 100 ? model.description.substring(0, 100) + '...' : model.description}
                                                                </span>
                                                            )}
                                                            {/* Download progress for this model */}
                                                            {isDownloading && initProgress && (
                                                                <Box sx={{ mt: 1.5 }}>
                                                                    <Box sx={{
                                                                        width: '100%',
                                                                        height: 6,
                                                                        bgcolor: '#2a2a2a',
                                                                        borderRadius: '3px',
                                                                        overflow: 'hidden',
                                                                    }}>
                                                                        <Box sx={{
                                                                            height: '100%',
                                                                            width: `${initProgress.percent}%`,
                                                                            bgcolor: '#ec4899',
                                                                            borderRadius: '3px',
                                                                            transition: 'width 0.3s ease',
                                                                        }} />
                                                                    </Box>
                                                                    <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginTop: '6px' }}>
                                                                        {initProgress.status}{initProgress.percent > 0 ? ` (${Math.round(initProgress.percent)}%)` : ''}
                                                                    </span>
                                                                </Box>
                                                            )}
                                                        </Box>
                                                        {/* Action button */}
                                                        {!isActive && (
                                                            model.isLocal ? (
                                                                <button
                                                                    onClick={() => handleModelSelect(model.name)}
                                                                    disabled={isInitializingModel || !!downloadingModel}
                                                                    className="px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                                                                    style={{
                                                                        color: '#ec4899',
                                                                        border: '1px solid rgba(236,72,153,0.3)',
                                                                        background: 'rgba(236,72,153,0.08)',
                                                                    }}
                                                                >
                                                                    Use
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleDownloadModel(model.name)}
                                                                    disabled={isInitializingModel || !!downloadingModel}
                                                                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                                                                    style={{
                                                                        color: isDownloading ? 'rgba(255,255,255,0.4)' : 'white',
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                    }}
                                                                >
                                                                    {isDownloading ? (
                                                                        <CircularProgress size={10} sx={{ color: '#ec4899' }} />
                                                                    ) : (
                                                                        <DownloadIcon sx={{ fontSize: 12 }} />
                                                                    )}
                                                                    {isDownloading ? 'Downloading' : 'Download'}
                                                                </button>
                                                            )
                                                        )}
                                                    </Box>
                                                </Box>
                                            );
                                        })}
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
                                    '& .MuiSlider-thumb': { bgcolor: '#ec4899' },
                                    '& .MuiSlider-track': { bgcolor: '#ec4899' },
                                    '& .MuiSlider-rail': { bgcolor: '#374151' },
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
                                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#ec4899' },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#ec4899' },
                                }}
                            />
                        </Box>
                    </Box>

                </Box>
            </Box>
        </Box>
    );
}
