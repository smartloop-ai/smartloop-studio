import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Shared state + actions for the local auxiliary model list.
// Consumed by the Settings "Available Models" table and the chat footer
// model selector so both stay in sync (enable/disable, download, progress).
export function useLocalModels() {
    const [localModels, setLocalModels] = useState<any[]>([]);
    const [localModelsLoading, setLocalModelsLoading] = useState(false);
    const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(new Map());
    const [toggling, setToggling] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{ percent: number; status: string } | null>(null);
    const togglingRef = useRef<string | null>(null);

    const enabledModels = useMemo(() => new Set(localModels.filter((m: any) => {
        const name = m.name || m.id || m.model;
        return enabledOverrides.has(name) ? enabledOverrides.get(name) : m.enabled;
    }).map((m: any) => m.name || m.id || m.model)), [localModels, enabledOverrides]);

    const isEnabled = useCallback((name: string) => enabledModels.has(name), [enabledModels]);

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
        api?.onModelsUpdated?.(({ models }: { models: any[] }) => {
            if (Array.isArray(models)) setLocalModels(models);
        });

        return () => {
            window.removeEventListener('authStateChanged', handleAuthChange);
            api?.removeModelsUpdatedListener?.();
        };
    }, [fetchLocalModels]);

    return {
        localModels,
        localModelsLoading,
        toggling,
        downloadProgress,
        enabledModels,
        isEnabled,
        fetchLocalModels,
        handleToggleModel,
        handleCancelDownload,
    };
}
