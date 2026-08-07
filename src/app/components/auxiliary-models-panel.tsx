import { useEffect, useState } from 'react';
import { Tooltip } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import { useLocalModels } from '../hooks/useLocalModels';
import { useAuthContext } from '../contexts/AuthContext';
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

// Model parameter count in billions. The backend doesn't send a param field, so
// we read an explicit one if present, otherwise parse it out of the model name /
// id — e.g. "gemma3-4b" → 4, "gemma-4-e2b-it" → 2, "qwen2-vl-2b" → 2.
function paramBillions(m: any): number | null {
    const explicit = m.parameters ?? m.params ?? m.param_count ?? m.param_size;
    if (explicit != null && explicit !== '') {
        if (typeof explicit === 'number') return explicit >= 1e6 ? explicit / 1e9 : explicit;
        const n = parseFloat(String(explicit));
        if (!isNaN(n)) return /m/i.test(String(explicit)) && !/b/i.test(String(explicit)) ? n / 1000 : n;
    }
    // "<digits>b" tokens in the name (e.g. the 2 in "e2b"). Pick the largest.
    const src = `${m.name || ''} ${m.model_id || m.model || m.id || ''}`;
    const vals = [...src.matchAll(/(\d+(?:\.\d+)?)\s*b\b/gi)]
        .map((x) => parseFloat(x[1]))
        .filter((v) => v > 0 && v < 1000);
    return vals.length ? Math.max(...vals) : null;
}

// Approximate the model's RAM footprint in GB. Prefers an explicit memory/size
// field (GB or raw bytes); otherwise estimates from the param count at ~1GB per
// billion params, which keeps a 4B model at ~4GB. Returns null when unknown.
function memoryGb(m: any): number | null {
    const raw = m.memory ?? m.memory_gb ?? m.memory_required ?? m.min_memory ?? m.ram ?? m.size_gb ?? m.size;
    if (raw != null && raw !== '') {
        if (typeof raw === 'number') {
            // Big enough to be bytes → GB; big enough to be MB → GB; else already GB.
            const gb = raw >= 1024 ** 3 ? raw / 1024 ** 3 : raw >= 1024 ? raw / 1024 : raw;
            if (isFinite(gb) && gb > 0) return gb;
        } else {
            const s = String(raw).trim();
            const n = parseFloat(s);
            if (!isNaN(n) && n > 0) return /mb/i.test(s) ? n / 1024 : n;
        }
    }
    const billions = paramBillions(m);
    return billions != null ? billions : null;
}

// Memory pressure = the model's estimated RAM footprint relative to the machine's
// total RAM. This is what "pressure" actually means: the same model is High on an
// 8GB laptop and Low on a 32GB workstation. Buckets: >=40% high, >10% medium,
// otherwise low. Falls back to null when we know neither the size nor the RAM.
function memoryPressure(m: any, totalRamGb: number | null): { gb: number; pct: number; label: string; color: string; border: string } | null {
    const gb = memoryGb(m);
    if (gb == null || !totalRamGb || totalRamGb <= 0) return null;
    const rounded = gb >= 10 ? Math.round(gb) : +gb.toFixed(1);
    const pct = Math.round((gb / totalRamGb) * 100);
    if (pct >= 40) return { gb: rounded, pct, label: 'High', color: '#f87171', border: 'rgba(248,113,113,0.35)' };
    if (pct > 10) return { gb: rounded, pct, label: 'Medium', color: '#fbbf24', border: 'rgba(251,191,36,0.35)' };
    return { gb: rounded, pct, label: 'Low', color: '#86efac', border: 'rgba(134,239,172,0.35)' };
}

// Normalized title used to match a model against the SSE "Selected …" status
// message. The message is built from the model_id (e.g.
// "mistralai/Ministral-3-3B-Instruct-2512" → "ministral 3 3b instruct 2512"),
// so we derive the same string from the model to test containment.
function matchTitle(m: any): string {
    const id = String(m.model_id || m.name || m.id || m.model || '');
    return id.split('/').pop()!.replace(/[-_]+/g, ' ').trim().toLowerCase();
}

// Human-readable explanation for each capability tag, shown on hover.
const CAPABILITY_INFO: Record<string, string> = {
    vision: 'Vision — understands and interprets images alongside text',
    skills: 'Skills — can invoke skills to extend what it can do',
    dp: 'Document processing — reads and reasons over your documents',
    general: 'General purpose — summarization, Q&A, and content generation',
};

// Short explanation for each plan/access tier tag, shown on hover.
const TIER_INFO: Record<string, string> = {
    Pro: 'Pro model — included with a Pro plan',
    Premium: 'Premium model — requires an upgraded plan',
    Internal: 'Internal model — available to your account',
};

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

    // Total system RAM, used to compute each model's memory pressure relative to
    // this machine (a 4GB model is "High" on 8GB, "Low" on 32GB).
    const [totalRamGb, setTotalRamGb] = useState<number | null>(null);
    useEffect(() => {
        (window as any).electronAPI?.getSystemInfo?.()
            .then((info: any) => setTotalRamGb(info?.totalMemGb ?? null))
            .catch(() => {});
    }, []);

    // Models the orchestrator is currently using, driven by the chat SSE stream.
    // chat.tsx broadcasts each "Selected <model> for …" status as it arrives; we
    // match it to a card and light it up, then clear on the run's `done` event.
    const [activeModels, setActiveModels] = useState<Set<string>>(new Set());
    useEffect(() => {
        const onActive = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            if (detail.done) { setActiveModels(new Set()); return; }
            const msg = String(detail.message || '').toLowerCase();
            if (!msg) return;
            setActiveModels((prev) => {
                const next = new Set(prev);
                for (const m of localModels) {
                    const title = matchTitle(m);
                    const name = String(m.name || m.id || m.model || '').toLowerCase();
                    const display = String(m.display_name || '').toLowerCase();
                    if ((title && msg.includes(title)) || (display && msg.includes(display)) || (name && msg.includes(name))) {
                        next.add(m.name || m.id || m.model);
                    }
                }
                return next;
            });
        };
        window.addEventListener('activeModelChanged', onActive);
        return () => window.removeEventListener('activeModelChanged', onActive);
    }, [localModels]);

    // Admins (superusers) can download any model, including plan-gated pro/premium ones.
    const [user] = useAuthContext();
    const isAdmin = !!user?.admin;
    // Internal models are only sent to eligible users, so their presence in the
    // catalog marks the user as internal-eligible — those users can also download
    // plan-gated pro/premium models.
    const hasInternalAccess = localModels.some((m: any) => m.access_level === 'internal');
    const canDownloadGated = isAdmin || hasInternalAccess;

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
    const renderIndicator = (s: { enabled: boolean; needsUnlock: boolean; needsLogin: boolean; downloaded: boolean; isDownloading: boolean; percent: number; isActive: boolean }) => {
        const ring: React.CSSProperties = {
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        };
        // In use by the orchestrator right now — a filled, pulsing brand bulb
        // that reads clearly even at a glance, matching the card's pulsing ring.
        if (s.isActive) {
            return (
                <Tooltip title="In use for this response" arrow placement="top">
                    <span
                        style={{ ...ring, border: '1.5px solid var(--sl-brand-primary)', backgroundColor: 'var(--sl-brand-alpha-10)' }}
                    >
                        <LightbulbIcon sx={{ fontSize: 16, color: 'var(--sl-brand-primary)' }} />
                    </span>
                </Tooltip>
            );
        }
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
        // gate only applies to models the user hasn't downloaded yet. Admins and
        // internal-eligible users bypass the gate and can download any model.
        const locked = !canDownloadGated && (m.is_accessible === false || isGated) && !downloaded;
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
        const pressure = memoryPressure(m, totalRamGb);
        // Lit while the orchestrator is actively using this model (from chat SSE).
        const isActive = activeModels.has(name);

        const onClick = () => {
            if (locked || isDownloading || toggling) return;
            handleToggleModel(name, workspaceName, downloaded ? !enabled : true);
        };

        return (
            <div
                key={name}
                role="button"
                onClick={onClick}
                className={`rounded-xl${isActive ? ' aux-card-active' : ''}`}
                style={{
                    padding: '14px 16px',
                    // Border stays a constant 1px; selection is drawn as a ring
                    // (box-shadow) + tint so nothing about the box size changes — the
                    // state eases in instead of popping. An active model (in use by
                    // the orchestrator right now) gets a brand ring that slowly
                    // breathes (.aux-card-active) so it clearly reads as "working",
                    // not merely "selected", without the jarring hard pulse.
                    border: `1px solid ${isActive ? 'var(--sl-brand-primary)' : 'var(--sl-border-subtle)'}`,
                    backgroundColor: isActive ? 'var(--sl-brand-alpha-15)' : enabled ? 'var(--sl-brand-alpha-10)' : 'var(--sl-bg-surface-1)',
                    boxShadow: isActive
                        ? '0 0 0 1px var(--sl-brand-primary)'
                        : enabled ? 'inset 0 0 0 1px var(--sl-brand-alpha-30)' : 'none',
                    opacity: locked ? 0.6 : 1,
                    cursor: locked ? 'default' : 'pointer',
                    transition: 'background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
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
                        {renderIndicator({ enabled, needsUnlock, needsLogin, downloaded, isDownloading, percent, isActive })}
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
                                <Tooltip key={cap} title={CAPABILITY_INFO[cap] || cap} arrow placement="top">
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                        style={{ border: `1px solid ${border}`, color }}
                                    >
                                        {cap}
                                    </span>
                                </Tooltip>
                            );
                        })}
                        {tier && (
                            <Tooltip title={TIER_INFO[tier.label] || tier.label} arrow placement="top">
                                <span
                                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                    style={{ border: `1px solid ${tier.border}`, color: tier.color }}
                                >
                                    {tier.label}
                                </span>
                            </Tooltip>
                        )}
                        {pressure && (
                            <Tooltip title={`~${pressure.gb}GB RAM · ${pressure.pct}% of this machine's memory · ${pressure.label} pressure`} arrow placement="top">
                                <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                    style={{ border: `1px solid ${pressure.border}`, color: pressure.color }}
                                >
                                    <MemoryOutlinedIcon sx={{ fontSize: 11 }} />
                                    {pressure.label}
                                </span>
                            </Tooltip>
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
