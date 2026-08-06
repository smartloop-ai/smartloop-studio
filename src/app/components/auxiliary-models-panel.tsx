import { Tooltip } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useLocalModels } from '../hooks/useLocalModels';
import ModelBrandIcon from './model-brand-icon';
import '../styles/aux-models.css';

interface AuxiliaryModelsPanelProps {
    // Label of the primary orchestrator model (filtered out of the list).
    model: string;
}

// Human-readable parameter count, e.g. "4.5B params". Backends may send it as a
// string ("4.5B") or a raw number; anything unrecognized is hidden.
function formatParams(m: any): string | null {
    const p = m.parameters ?? m.params ?? m.param_count ?? m.param_size;
    if (p == null || p === '') return null;
    if (typeof p === 'number') {
        const v = p >= 1e9 ? `${+(p / 1e9).toFixed(1)}B` : p >= 1e6 ? `${Math.round(p / 1e6)}M` : `${p}`;
        return `${v} params`;
    }
    const s = String(p);
    return /params/i.test(s) ? s : `${s} params`;
}

// Note: the main-process open-external handler only permits http(s), so this
// must be a web URL (a mailto: is silently rejected).
const contactUs = () => (window as any).electronAPI?.openExternal?.('mailto:hello@smartloop.ai');

// Sidebar panel listing the enabled auxiliary models as cards. Each card's
// leading circle reflects the model's lifecycle state (enabled, off, needs
// download, downloading, or locked); the whole card toggles/downloads on click.
// Locked (premium / plan-gated) models are dimmed and carry a Premium tag with an
// "upgrade" tooltip; at the bottom an upsell card points to pricing.
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

    // Stable order: locked last, otherwise preserve backend catalog order.
    const orderedModels = auxModels
        .map((m: any, i: number) => ({ m, i }))
        .sort((a, b) => {
            const la = a.m.is_accessible === false ? 1 : 0;
            const lb = b.m.is_accessible === false ? 1 : 0;
            return la !== lb ? la - lb : a.i - b.i;
        })
        .map(({ m }) => m);

    // Leading circular state indicator.
    const renderIndicator = (s: { enabled: boolean; needsUnlock: boolean; needsLogin: boolean; downloaded: boolean; isDownloading: boolean; percent: number }) => {
        const ring: React.CSSProperties = {
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        };
        if (s.needsUnlock) {
            return (
                <Tooltip title="Upgrade to a Pro plan to use this model" arrow placement="top">
                    <span style={{ ...ring, border: '1.5px solid var(--sl-border-default)' }}>
                        <LockOutlinedIcon sx={{ fontSize: 15, color: 'var(--sl-text-faint)' }} />
                    </span>
                </Tooltip>
            );
        }
        // Free model, but the user isn't signed in yet — show a (disabled) download
        // affordance rather than a plan-gate lock.
        if (s.needsLogin) {
            return (
                <Tooltip title="Sign in to download this model" arrow placement="top">
                    <span style={{ ...ring, border: '1.5px solid var(--sl-border-default)' }}>
                        <FileDownloadOutlinedIcon sx={{ fontSize: 15, color: 'var(--sl-text-faint)' }} />
                    </span>
                </Tooltip>
            );
        }
        if (s.isDownloading) {
            const c = 2 * Math.PI * 10;
            return (
                <span
                    role="button"
                    aria-label="Cancel download"
                    title="Cancel download"
                    onClick={(e) => { e.stopPropagation(); handleCancelDownload(); }}
                    style={{ ...ring, cursor: 'pointer' }}
                >
                    <svg width="30" height="30" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--sl-brand-primary)" strokeWidth="2" opacity="0.15" />
                        <circle
                            cx="12" cy="12" r="10" fill="none"
                            stroke="var(--sl-brand-primary)" strokeWidth="2" strokeLinecap="round"
                            strokeDasharray={c}
                            strokeDashoffset={c * (1 - s.percent / 100)}
                            transform="rotate(-90 12 12)"
                            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                        />
                    </svg>
                </span>
            );
        }
        if (!s.downloaded) {
            // Not downloaded yet — the bulb shows disabled; the download action
            // lives in the footer.
            return (
                <span style={{ ...ring, border: '1.5px solid var(--sl-border-default)', opacity: 0.5 }}>
                    <LightbulbOutlinedIcon sx={{ fontSize: 16, color: 'var(--sl-text-faint)' }} />
                </span>
            );
        }
        if (s.enabled) {
            // Lit bulb = model enabled / active.
            return (
                <span style={{ ...ring, border: '1.5px solid var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}>
                    <LightbulbIcon sx={{ fontSize: 16, color: 'var(--sl-brand-primary)' }} />
                </span>
            );
        }
        // Downloaded but off — unlit bulb.
        return (
            <span style={{ ...ring, border: '1.5px solid var(--sl-border-default)' }}>
                <LightbulbOutlinedIcon sx={{ fontSize: 16, color: 'var(--sl-text-faint)' }} />
            </span>
        );
    };

    const renderCard = (m: any) => {
        const name = m.name || m.id || m.model;
        const workspaceName = m.workspace_name || name;
        const displayName = m.display_name || name;
        const description = m.description || '';
        const enabled = isEnabled(name);
        const downloaded = !!m.downloaded;
        // Paid tiers (pro / premium / internal) require an entitlement. The
        // backend's is_accessible flag can't be trusted for these — it may report
        // true for a paid model on a free plan — so we gate them on access_level
        // directly rather than on is_accessible alone.
        // Internal models are only ever sent to eligible users, so their mere
        // presence in the list means they're downloadable — never gate them.
        const isInternal = m.access_level === 'internal';
        const isGated = m.access_level === 'pro' || m.access_level === 'premium';
        // An already-downloaded model stays usable regardless of auth/plan — the
        // gate only applies to models the user hasn't downloaded yet.
        const locked = (m.is_accessible === false || isGated) && !downloaded;
        // "Unlock" is for genuinely plan-gated (paid) models. A free model reported
        // inaccessible just because the user is signed out is a login gate —
        // surfaced as a disabled Download + tooltip, not an Unlock.
        const needsUnlock = locked && isGated;
        const needsLogin = locked && !needsUnlock;
        const isDownloading = toggling === name && !downloaded;
        const percent = downloadProgress?.percent ?? 0;
        // Tier tag shown on gated models: pro uses the brand color, internal
        // collapses into a gold "Premium". Border is ~30% of the text color.
        const tier = m.access_level === 'pro'
            ? { label: 'Pro', color: 'var(--sl-brand-primary)', border: 'var(--sl-brand-alpha-30)' }
            : isInternal
                ? { label: 'Internal', color: 'rgb(96,165,250)', border: 'rgba(96,165,250,0.3)' }
                : isGated
                    ? { label: 'Premium', color: 'rgb(251,191,36)', border: 'rgba(251,191,36,0.3)' }
                    : null;
        const paramsLabel = formatParams(m);

        const onClick = () => {
            if (locked || isDownloading || toggling) return;
            handleToggleModel(name, workspaceName, downloaded ? !enabled : true);
        };

        return (
            <div
                key={name}
                role="button"
                onClick={onClick}
                className="rounded-xl"
                style={{
                    padding: '14px 16px',
                    // Border stays a constant 1px; selection is drawn as an inset ring
                    // (box-shadow) + tint so nothing about the box size changes — the
                    // state eases in instead of popping.
                    border: '1px solid var(--sl-border-subtle)',
                    backgroundColor: enabled ? 'var(--sl-brand-alpha-10)' : 'var(--sl-bg-surface-1)',
                    boxShadow: enabled ? 'inset 0 0 0 1px var(--sl-brand-alpha-30)' : 'none',
                    opacity: locked ? 0.6 : 1,
                    cursor: locked ? 'default' : 'pointer',
                    transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                }}
            >
                {/* Header — brand icon, title, params, and the lifecycle
                    indicator (bulb / lock / download) on the right. */}
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30 }}>
                        <ModelBrandIcon name={name} size={22} />
                    </span>
                    <span className="text-[13px] font-bold text-sl-text-primary truncate">{displayName}</span>
                    <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                        {!isDownloading && paramsLabel && (
                            <span className="text-[12px]" style={{ color: 'var(--sl-text-muted)' }}>{paramsLabel}</span>
                        )}
                        {renderIndicator({ enabled, needsUnlock, needsLogin, downloaded, isDownloading, percent })}
                    </div>
                </div>

                {/* Description */}
                {description && (
                    <p className="text-[12px] leading-relaxed mt-2 mb-0" style={{ color: 'var(--sl-text-muted)' }}>{description}</p>
                )}

                {/* Download progress bar */}
                {isDownloading && (
                    <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: 'var(--sl-brand-primary)' }} />
                    </div>
                )}

                {/* Footer — capability badges and lifecycle action */}
                <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {(m.capabilities || []).map((cap: string) => {
                            const isVision = cap === 'vision';
                            const isSkills = cap === 'skills';
                            const isDp = cap === 'dp';
                            const isGeneral = cap === 'general';
                            const color = isVision ? '#93c5fd' : isSkills ? '#86efac' : isDp ? '#fdba74' : isGeneral ? '#c4b5fd' : 'var(--sl-text-muted)';
                            const border = isVision ? 'rgba(147,197,253,0.35)' : isSkills ? 'rgba(134,239,172,0.35)' : isDp ? 'rgba(253,186,116,0.35)' : isGeneral ? 'rgba(196,181,253,0.35)' : 'var(--sl-border-default)';
                            return (
                                <span
                                    key={cap}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                    style={{ border: `1px solid ${border}`, color }}
                                >
                                    {cap}
                                </span>
                            );
                        })}
                        {tier && (
                            <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                style={{ border: `1px solid ${tier.border}`, color: tier.color }}
                            >
                                {tier.label}
                            </span>
                        )}
                    </div>
                    <div className="flex-shrink-0">
                        {isDownloading ? (
                            <span className="text-[12px] font-mono tabular-nums" style={{ color: 'var(--sl-brand-primary)' }}>{percent}%</span>
                        ) : needsLogin ? (
                            <Tooltip title="Sign in to download this model" arrow placement="top">
                                <span
                                    className="flex items-center justify-center"
                                    style={{ color: 'var(--sl-text-faint)', cursor: 'default' }}
                                >
                                    <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
                                </span>
                            </Tooltip>
                        ) : (!downloaded && !locked) ? (
                            <Tooltip title="Download model" arrow placement="top">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                                    className="flex items-center justify-center"
                                    style={{ color: 'var(--sl-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
                                </button>
                            </Tooltip>
                        ) : null}
                    </div>
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
                <div className="flex flex-col gap-2.5">
                    {orderedModels.map((m: any) => renderCard(m))}
                </div>
            )}

            {/* Upsell — always shown (kept even when signed in, so users can still
                reach out to upgrade for more models / higher limits). */}
            <div
                className="rounded-xl mt-4"
                style={{ padding: '16px', backgroundColor: 'var(--sl-bg-surface-1)', border: '1px solid var(--sl-border-subtle)' }}
            >
                <h4 className="text-[14px] font-bold text-sl-text-primary m-0 mb-1">Need more power?</h4>
                <p className="text-[12px] leading-relaxed m-0 mb-3" style={{ color: 'var(--sl-text-muted)' }}>
                    Have a model you'd like us to support, or want us alongside you on your journey? Send us a message and our team will get back to you.
                </p>
                <button
                    onClick={contactUs}
                    className="text-[12px] font-semibold inline-flex items-center gap-1"
                    style={{ color: 'var(--sl-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                    Contact us <span aria-hidden>→</span>
                </button>
            </div>
        </div>
    );
}
