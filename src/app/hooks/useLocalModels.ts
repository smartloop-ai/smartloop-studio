import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';

// Shared state + actions for the local auxiliary model list.
// Consumed by the Settings "Available Models" table and the chat footer
// model selector so both stay in sync (enable/disable, download, progress).
// Model settings are scoped to the selected project (falls back to the
// workspace/app-default list when no project is selected, e.g. on Settings).
export function useLocalModels() {
    const { selectedProject } = useProjectContext();
    const projectId = selectedProject?.id ?? null;

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
                const result = await api.slpListModels(projectId);
                if (result?.success && result.models) {
                    setLocalModels(result.models);
                }
            }
        } catch (err) {
            console.warn('Failed to fetch local models:', err);
        } finally {
            setLocalModelsLoading(false);
        }
    }, [projectId]);

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
        await api.slpCancelModelDownload(modelName, projectId);
        togglingRef.current = null;
        setToggling(null);
        setDownloadProgress(null);
        setEnabledOverrides(prev => { const next = new Map(prev); next.delete(modelName); return next; });
        await fetchLocalModels();
    }, [fetchLocalModels, projectId]);

    const handleToggleModel = useCallback(async (name: string, workspaceName: string, enabled: boolean) => {
        const api = window.electronAPI;
        if (!api?.slpSetModelEnabled || togglingRef.current) return;

        togglingRef.current = name;
        setToggling(name);
        setDownloadProgress(null);
        setEnabledOverrides(prev => new Map(prev).set(name, enabled));

        // Broadcast the optimistic enabled-capability set so other views (e.g. the
        // sidebar's document/skill gating) update instantly instead of waiting for
        // the backend to confirm + re-emit the model list.
        try {
            const enabledCaps = new Set<string>();
            localModels.forEach((m: any) => {
                const mName = m.name || m.id || m.model;
                const isOn = mName === name
                    ? enabled
                    : (enabledOverrides.has(mName) ? enabledOverrides.get(mName) : m.enabled);
                if (isOn) (m.capabilities || []).forEach((c: string) => enabledCaps.add(c));
            });
            window.dispatchEvent(new CustomEvent('localModelCapsChanged', { detail: { caps: Array.from(enabledCaps) } }));
        } catch { /* non-fatal */ }

        try {
            await api.slpSetModelEnabled(workspaceName, enabled, projectId);
            await fetchLocalModels();
        } finally {
            togglingRef.current = null;
            setToggling(null);
            setDownloadProgress(null);
            setEnabledOverrides(prev => { const next = new Map(prev); next.delete(name); return next; });
        }
    }, [fetchLocalModels, localModels, enabledOverrides, projectId]);

    // Refetch whenever the selected project changes — per-project model settings.
    useEffect(() => {
        fetchLocalModels();
    }, [fetchLocalModels]);

    useEffect(() => {
        const handleAuthChange = () => fetchLocalModels();
        window.addEventListener('authStateChanged', handleAuthChange);

        const api = window.electronAPI;
        api?.onModelsUpdated?.(({ models, projectId: payloadProjectId }: { models: any[]; projectId?: string | null }) => {
            // Only apply broadcasts for the project we're currently viewing (or the
            // project-less workspace list) — a background refresh for another
            // project must not clobber this view's per-project state.
            if (payloadProjectId === projectId && Array.isArray(models)) setLocalModels(models);
        });

        return () => {
            window.removeEventListener('authStateChanged', handleAuthChange);
            api?.removeModelsUpdatedListener?.();
        };
    }, [fetchLocalModels, projectId]);

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
