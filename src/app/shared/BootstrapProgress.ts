/**
 * BootstrapProgress — shared progress normalization.
 *
 * Used by both the Electron main process (splash screen, bootstrap IPC)
 * and the renderer (Home model-load, Chat progress bar).
 *
 * Accepts a raw SSE event object from /v1/bootstrap or /v1/models/load
 * and returns a normalised progress descriptor.
 */

export interface BootstrapProgress {
    /** 0–100 */
    percent: number;
    /** Human-readable status line */
    status: string;
    /** Model name (may be empty) */
    model: string;
    /** True while download / init is still in progress */
    downloading: boolean;
}

/**
 * Normalise a raw SSE progress event into a consistent shape.
 */
export function bootstrapProgress(data: Record<string, any>): BootstrapProgress {
    const rawStatus: string = data.status || data.message || data.state || '';
    const model: string = data.model_name || data.model || '';

    let percent = 0;
    let status = 'Initializing...';

    // Byte-level download progress (downloaded / total)
    if (data.downloaded !== undefined && data.total > 0) {
        percent = Math.round((data.downloaded / data.total) * 100);
        const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(1);
        const totalMB = (data.total / (1024 * 1024)).toFixed(1);
        status = `Downloading... ${downloadedMB} / ${totalMB} MB`;
    } else {
        // Explicit percentage fields
        const pct = data.progress ?? data.percent ?? data.percentage;
        if (pct !== undefined) {
            percent = Number(pct);
            status = rawStatus || 'Downloading...';
        } else if (rawStatus === 'downloading') {
            status = data.message || 'Downloading model...';
        } else if (rawStatus === 'checking') {
            status = data.message || 'Checking workspace...';
        } else if (rawStatus === 'starting' || rawStatus === 'preparing') {
            status = data.message || 'Starting service...';
        } else if (rawStatus) {
            status = rawStatus;
        }
    }

    // Terminal states
    if (rawStatus === 'complete' || rawStatus === 'ready' || rawStatus === 'done') {
        percent = 100;
        status = 'Ready';
    }

    return { percent, status, model, downloading: percent < 100 };
}
