/**
 * CommonJS bootstrapProgress for the Electron main process.
 * Keeps the logic in sync with src/app/shared/BootstrapProgress.ts (the source of truth).
 * If you change the normalisation rules, update BootstrapProgress.ts and mirror here.
 */

function bootstrapProgress(data) {
    const rawStatus = data.status || data.message || data.state || '';
    const model = data.model_name || data.model || '';

    let percent = 0;
    let status = 'Initializing...';
    let stage = 'initializing';

    if (data.downloaded !== undefined && data.total > 0) {
        percent = Math.round((data.downloaded / data.total) * 100);
        const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(1);
        const totalMB = (data.total / (1024 * 1024)).toFixed(1);
        status = `Downloading... ${downloadedMB} / ${totalMB} MB`;
        stage = 'downloading';
    } else {
        const pct = data.progress ?? data.percent ?? data.percentage;
        if (pct !== undefined) {
            percent = Number(pct);
            status = rawStatus || 'Downloading...';
            stage = 'downloading';
        } else if (rawStatus === 'downloading') {
            status = data.message || 'Downloading model...';
            stage = 'downloading';
        } else if (rawStatus === 'checking') {
            status = data.message || 'Checking workspace...';
            stage = 'checking';
        } else if (rawStatus === 'starting' || rawStatus === 'preparing') {
            status = data.message || 'Starting agent...';
            stage = 'preparing';
        } else if (rawStatus === 'extracting') {
            status = data.message || 'Extracting...';
            stage = 'extracting';
        } else if (rawStatus === 'verifying') {
            status = data.message || 'Verifying...';
            stage = 'verifying';
        } else if (rawStatus) {
            status = rawStatus;
        }
    }

    if (rawStatus === 'complete' || rawStatus === 'ready' || rawStatus === 'done') {
        percent = 100;
        status = 'Ready';
        stage = 'complete';
    }

    return { percent, status, model, downloading: percent < 100, stage };
}

module.exports = { bootstrapProgress };
