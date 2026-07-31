import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import ModelBrandIcon from './model-brand-icon';
import { useLocalModels } from '../hooks/useLocalModels';
import '../styles/aux-models.css';

interface AuxiliaryModelsPanelProps {
    // Label of the primary orchestrator model (filtered out of the list).
    model: string;
}

// Sidebar panel listing the enabled auxiliary models. Lets the user
// enable/disable, download, or watch download progress inline — mirrors the
// Settings "Available Models" table but in the right sidebar. This replaces the
// former chat-footer popover so model management lives alongside documents,
// connections, and skills.
export default function AuxiliaryModelsPanel({ model }: AuxiliaryModelsPanelProps) {
    const {
        localModels,
        toggling,
        downloadProgress,
        isEnabled,
        handleToggleModel,
        handleCancelDownload,
    } = useLocalModels();

    // Auxiliary models = every local model except the primary orchestrator.
    const auxModels = localModels.filter((m: any) => {
        const name = m.name || m.id || m.model;
        return name !== model && m.workspace_name !== model;
    });

    // Keep a stable order across enable/download so rows never jump around while
    // the user interacts: sort only by the unchanging accessibility flag (locked
    // last) and otherwise preserve the backend catalog order.
    const orderedModels = auxModels
        .map((m: any, i: number) => ({ m, i }))
        .sort((a, b) => {
            const la = a.m.is_accessible === false ? 1 : 0;
            const lb = b.m.is_accessible === false ? 1 : 0;
            return la !== lb ? la - lb : a.i - b.i;
        })
        .map(({ m }) => m);

    const renderRow = (m: any, idx: number) => {
        const name = m.name || m.id || m.model;
        const workspaceName = m.workspace_name || name;
        const displayName = m.display_name || name;
        const description = m.description || '';
        const enabled = isEnabled(name);
        // Only show the download/progress UI for models that aren't on disk yet.
        // Toggling an already-downloaded model just flips its checkbox — no flicker.
        const isDownloading = toggling === name && !m.downloaded;
        const locked = m.is_accessible === false;

        return (
            <div
                key={name}
                role="button"
                onClick={() => {
                    if (locked) return;
                    if (isDownloading) return;
                    if (toggling) return;
                    handleToggleModel(name, workspaceName, m.downloaded ? !enabled : true);
                }}
                className="aux-row flex items-start gap-1.5 transition-colors hover:bg-[var(--sl-brand-alpha-10)]"
                style={{
                    padding: '6px 8px',
                    borderTop: idx > 0 ? '1px solid var(--sl-border-subtle)' : 'none',
                    cursor: locked ? 'default' : 'pointer',
                }}
            >
                {/* Leading provider brand icon (Gemma, Qwen, …) */}
                <span className="flex-shrink-0 flex items-center justify-center" style={{ marginTop: '1px', width: 14, height: 14 }}>
                    <ModelBrandIcon name={name} size={14} />
                </span>

                <div className="flex-1 min-w-0 flex flex-col gap-[1px]">
                    <span className="text-[11px] text-sl-text-tertiary truncate uppercase tracking-wide">
                        {displayName}
                    </span>
                    {description && (
                        <span
                            className="text-[11px] text-sl-text-muted"
                            style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: 1.45,
                            }}
                        >
                            {description}
                        </span>
                    )}
                    {(m.capabilities || []).length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1">
                            {(m.capabilities || []).map((cap: string) => {
                                const isVision = cap === 'vision';
                                const isSkills = cap === 'skills';
                                const isDp = cap === 'dp';
                                const isKnowledge = cap === 'knowledge';
                                // Soft pastel tints per capability type.
                                const color = isVision ? '#93c5fd' : isSkills ? '#86efac' : isDp ? '#fdba74' : isKnowledge ? '#c4b5fd' : 'var(--sl-text-muted)';
                                const border = isVision ? 'rgba(147,197,253,0.35)' : isSkills ? 'rgba(134,239,172,0.35)' : isDp ? 'rgba(253,186,116,0.35)' : isKnowledge ? 'rgba(196,181,253,0.35)' : 'var(--sl-border-default)';
                                const bg = isVision ? 'rgba(147,197,253,0.08)' : isSkills ? 'rgba(134,239,172,0.08)' : isDp ? 'rgba(253,186,116,0.08)' : isKnowledge ? 'rgba(196,181,253,0.08)' : 'transparent';
                                return (
                                    <span
                                        key={cap}
                                        className="px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wide"
                                        style={{ border: `1px solid ${border}`, color, backgroundColor: bg }}
                                    >
                                        {cap}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    {isDownloading && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}>
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${downloadProgress?.percent ?? 0}%`,
                                        backgroundColor: 'var(--sl-brand-primary)',
                                    }}
                                />
                            </div>
                            <span
                                className="flex-shrink-0 text-[10px] font-mono tabular-nums text-right"
                                style={{ color: 'var(--sl-brand-primary)', minWidth: 28 }}
                            >
                                {downloadProgress?.percent ?? 0}%
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 self-center">
                    {locked ? (
                        <LockOutlinedIcon sx={{ fontSize: 16, color: 'var(--sl-text-faint)' }} />
                    ) : isDownloading ? (
                        // While downloading, the download icon becomes a stop/cancel button —
                        // the only useful action; progress + percent live on the bar.
                        <span
                            role="button"
                            aria-label="Cancel download"
                            title="Cancel download"
                            onClick={(e) => { e.stopPropagation(); handleCancelDownload(); }}
                            className="flex items-center justify-center rounded transition-colors"
                            style={{ width: 18, height: 18, cursor: 'pointer', border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-faint)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sl-status-error)'; e.currentTarget.style.borderColor = 'var(--sl-status-error)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sl-text-faint)'; e.currentTarget.style.borderColor = 'var(--sl-border-default)'; }}
                        >
                            <span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: 'currentColor' }} />
                        </span>
                    ) : !m.downloaded ? (
                        <DownloadIcon sx={{ fontSize: 16, color: 'var(--sl-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--sl-brand-primary)' } }} />
                    ) : (
                        <span
                            className="model-checkbox flex items-center justify-center rounded select-none transition-colors"
                            style={{
                                width: 18, height: 18,
                                border: enabled ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-default)',
                                backgroundColor: enabled ? 'var(--sl-brand-alpha-10)' : 'transparent',
                            }}
                        >
                            {enabled && (
                                <span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: 'var(--sl-brand-primary)' }} />
                            )}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="aux-panel">
            <p className="m-0 mb-3 px-2 text-[11px] leading-relaxed text-sl-text-muted">
                Enable models that work together to enrich your request and produce the best results.
            </p>

            {orderedModels.length === 0 ? (
                <p className="m-0 py-2 px-2 text-xs text-sl-text-faint">No auxiliary models available</p>
            ) : (
                <div
                    className="flex flex-col overflow-hidden"
                    style={{ border: '1px solid var(--sl-border-subtle)', borderRadius: '6px' }}
                >
                    {orderedModels.map((m, idx) => renderRow(m, idx))}
                </div>
            )}
        </div>
    );
}
