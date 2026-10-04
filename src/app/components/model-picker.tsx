import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Dialog, IconButton, InputBase, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { useLocalModels } from '../hooks/useLocalModels';
import { useAuthContext } from '../contexts/AuthContext';
import ModelBrandIcon, { brandName } from './model-brand-icon';
import ContactDialog from './contact-dialog';
import { dialogStyles } from '@/app/shared/utils';
import '../styles/models.css';
import {
    CAPABILITY_INFO,
    CAPABILITY_STYLE,
    TIER_INFO,
    describeFailure,
    isLocked,
    matchTitle,
    memoryPressure,
    modelLabel,
    sizeTier,
    tierTag,
} from './model-meta';

const IS_MAC = (window as any).electronAPI?.platform === 'darwin';
// Cmd/Ctrl+Shift+M — inherited from the rail's old Models section, so the
// muscle memory that used to open the sidebar panel now opens this dialog.
const MODELS_HOTKEY = IS_MAC ? '\u2318\u21e7M' : 'Ctrl+Shift+M';

interface ModelPickerProps {
    // The primary orchestrator model — the one that reads the request and routes
    // it. It's never a row of its own; it *is* the "Auto" the trigger names.
    model: string;
    // Sends are blocked (service still starting) — the picker follows.
    disabled?: boolean;
}

// Outlined tag, per the app's label style guide: border-only, never filled.
function Tag({ label, color, border, tip, icon }: { label: string; color: string; border: string; tip?: string; icon?: React.ReactNode }) {
    const tag = (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide flex-shrink-0"
            style={{ border: `1px solid ${border}`, color }}
        >
            {icon}
            {label}
        </span>
    );
    return tip ? <Tooltip title={tip} arrow placement="top">{tag}</Tooltip> : tag;
}

/**
 * Model switcher for the composer, in the shape users know from other agent
 * tools: a small pill under the prompt that opens the model list.
 *
 * Selection is multiple, not single, because that is what the backend actually
 * models: the orchestrator reads each request and routes it to one of the models
 * enabled for the project. Ticking several is how you hand it a bench to choose
 * from — a vision model, a document model, a fast general one — and ticking
 * exactly one is how you make that choice for it. So the trigger reads "Auto"
 * whenever there is a choice to make and names the model when there isn't.
 *
 * Each model is a bulb: lit means the orchestrator may route to it, unlit means
 * it may not. The same slot carries the other states a model can be in, so there
 * is exactly one place to look for "what is this model doing" — a progress ring
 * while its weights arrive, a lock when the plan gates it, a download glyph when
 * it isn't on disk. Which means the list is the whole catalog, not just what's
 * downloaded: one click is the entire path from "never seen it" to "answering my
 * next message", which is why this replaced the sidebar's models panel.
 *
 * It opens as a dialog rather than a dropdown, with search and grouping, because
 * the catalog only grows — scanning stops being a viable way to find a model
 * well before the list stops being useful.
 */
export default function ModelPicker({ model, disabled = false }: ModelPickerProps) {
    const { localModels, downloads, isDownloading, downloadErrors, clearDownloadError, clearDownloadErrors, isEnabled, handleToggleModel, handleCancelDownload } = useLocalModels();
    const [user] = useAuthContext();

    const [open, setOpen] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    // Cmd/Ctrl+Shift+M opens the dialog from anywhere, matching the rail
    // sections' own Cmd/Ctrl+Shift+<letter> bindings. Matched on e.code so a
    // non-QWERTY layout still triggers on the same physical key.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
            if (e.code !== 'KeyM') return;
            e.preventDefault();
            setOpen((v) => !v);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // A fresh open is a fresh search — a stale filter would hide models the
    // user came back to find. Closing also dismisses any download refusal:
    // it's a reply to the click that earned it, not a condition of the model,
    // so it shouldn't be waiting there the next time the dialog opens.
    useEffect(() => {
        if (open) setQuery('');
        else clearDownloadErrors();
    }, [open, clearDownloadErrors]);

    // Total system RAM, used to compute each model's memory pressure relative to
    // this machine (a 4GB model is "High" on 8GB, "Low" on 32GB).
    const [totalRamGb, setTotalRamGb] = useState<number | null>(null);
    useEffect(() => {
        (window as any).electronAPI?.getSystemInfo?.()
            .then((info: any) => setTotalRamGb(info?.totalMemGb ?? null))
            .catch(() => { });
    }, []);

    // The model the orchestrator picked for the turn in flight, from chat's SSE
    // status stream — the one thing the user can't otherwise see about Auto.
    const [activeAuto, setActiveAuto] = useState<string | null>(null);
    useEffect(() => {
        const onActive = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            if (detail.done) { setActiveAuto(null); return; }
            const msg = String(detail.message || '').toLowerCase();
            if (!msg) return;
            for (const m of localModels) {
                const title = matchTitle(m);
                const name = String(m.name || m.id || m.model || '').toLowerCase();
                const display = String(m.display_name || '').toLowerCase();
                if ((title && msg.includes(title)) || (display && msg.includes(display)) || (name && msg.includes(name))) {
                    setActiveAuto(m.name || m.id || m.model);
                    return;
                }
            }
        };
        window.addEventListener('activeModelChanged', onActive);
        return () => window.removeEventListener('activeModelChanged', onActive);
    }, [localModels]);

    const canContact = !!user?.email;

    // Everything except the orchestrator — it's represented by the Auto trigger.
    const pickable = useMemo(() => localModels.filter((m: any) => {
        const name = m.name || m.id || m.model;
        return name !== model && m.workspace_name !== model;
    }), [localModels, model]);

    const selected = useMemo(
        () => pickable.filter((m: any) => isEnabled(m.name || m.id || m.model)),
        [pickable, isEnabled],
    );

    // No auxiliary model enabled for this project, so only the orchestrator can
    // answer. Per project, so a fresh install and a new project both get the cue.
    const showCue = pickable.length > 0 && selected.length === 0 && !disabled && !open;

    // Filter, then bucket. Both exist for the same reason: the catalog grows, and
    // a flat list of everything the backend offers stops being scannable well
    // before it stops being useful. Search matches what a person would actually
    // type — the friendly name, the raw id, the maker, or a capability ("vision").
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matches = (m: any) => {
            if (!q) return true;
            const hay = [
                modelLabel(m),
                m.name || m.id || m.model,
                brandName(m.name || m.id || m.model) || '',
                (m.capabilities || []).join(' '),
                m.description || '',
            ].join(' ').toLowerCase();
            return hay.includes(q);
        };

        const buckets: { key: string; title: string; hint?: string; models: any[] }[] = [
            { key: 'on', title: 'In use', hint: 'The orchestrator routes requests to these', models: [] },
            { key: 'ready', title: 'Downloaded', models: [] },
            { key: 'available', title: 'Available to download', models: [] },
            { key: 'locked', title: 'Requires an upgrade', models: [] },
        ];
        for (const m of pickable) {
            if (!matches(m)) continue;
            const name = m.name || m.id || m.model;
            // A model the plan doesn't grant is listed, not hidden. The cloud
            // returns it for exactly that reason — an anonymous caller gets the
            // whole catalog with is_accessible false on the Pro tier "so the
            // client can show pro models as signup incentive" — so dropping it
            // here would discard the one thing it was sent for. It goes in the
            // 'locked' bucket: greyed, lock icon, not clickable.
            const locked = isLocked(m);
            const key = isEnabled(name) ? 'on' : locked ? 'locked' : m.downloaded ? 'ready' : 'available';
            buckets.find((b) => b.key === key)!.models.push(m);
        }
        return buckets.filter((b) => b.models.length > 0);
    }, [pickable, query, isEnabled]);

    const matchCount = groups.reduce((n, g) => n + g.models.length, 0);

    const toggle = (m: any) => {
        const name = m.name || m.id || m.model;
        const workspaceName = m.workspace_name || name;
        // Enabling a model that isn't on disk downloads it first — see
        // `slp-set-model-enabled`. The dialog stays open either way, because with
        // multi-select the next thing you do is usually pick another one.
        handleToggleModel(name, workspaceName, m.downloaded ? !isEnabled(name) : true);
    };

    // Trigger. One model selected means the orchestrator has no choice left to
    // make, so we name it outright; anything else is genuinely Auto.
    const solo = selected.length === 1 ? selected[0] : null;
    const autoEntry = activeAuto ? localModels.find((m: any) => (m.name || m.id || m.model) === activeAuto) : null;
    const triggerIconFor = solo || autoEntry;
    const triggerLabel = solo ? modelLabel(solo) : 'Auto';
    const triggerTip = (
        <span className="flex items-center gap-1.5">
            {solo
                ? `Answering with ${solo.name || solo.id}`
                : selected.length === 0
                    ? 'Auto — no models selected, the default model answers'
                    : `Auto — the orchestrator picks from ${selected.length} selected models`}
            <span className="text-[10px] font-mono opacity-60">{MODELS_HOTKEY}</span>
        </span>
    );
    const cueTip = 'Only the orchestrator model is loaded. Click here to enable one or more of the recommended models.';

    // The row's lifecycle state, as one glyph in the header's action slot —
    // the same place, size and weight as a connection card's link/unlink toggle.
    // A bulb is the on/off switch: lit means the orchestrator may route to this
    // model, unlit means it may not. The same slot carries the other states a
    // model can be in, so there is exactly one place to look for "what is this
    // model doing" — a spinner while its weights arrive, a lock when the plan
    // gates it, a download glyph when it isn't on disk yet.
    const renderState = (st: { name: string; on: boolean; downloaded: boolean; locked: boolean; busy: boolean; isActive: boolean }) => {
        // Downloading, and a way out of it. Weights are gigabytes, so a click
        // made by mistake otherwise commits the machine to the whole transfer.
        // The spinner and the stop are one control — a square inside the turning
        // ring, as on a connection card (mcp-catalog-item.tsx) — so the slot
        // still holds exactly one thing to aim at. Indeterminate on purpose:
        // the percentage is spelled out in the bar below, and a second readout
        // of the same number in the same card says nothing extra.
        if (st.busy) {
            return (
                <Tooltip title="Stop downloading" arrow placement="top">
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleCancelDownload(st.name); }}
                        sx={{
                            color: 'var(--sl-brand-primary)',
                            padding: '2px',
                            '&:hover': { color: 'var(--sl-status-error)' },
                        }}
                    >
                        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14 }}>
                            {/* Static track, so the ring reads as a ring rather
                                than a lone arc chasing itself around nothing. */}
                            <CircularProgress
                                variant="determinate"
                                value={100}
                                size={14}
                                thickness={2.5}
                                sx={{ color: 'currentColor', opacity: 0.2, position: 'absolute' }}
                            />
                            <CircularProgress
                                size={14}
                                thickness={2.5}
                                sx={{ color: 'currentColor', position: 'absolute' }}
                            />
                            <Box sx={{ width: 5, height: 5, borderRadius: '1px', backgroundColor: 'currentColor' }} />
                        </Box>
                    </IconButton>
                </Tooltip>
            );
        }

        if (st.locked) {
            return (
                <Tooltip title="Upgrade to a Pro plan to use this model" arrow placement="top">
                    <span className="flex items-center justify-center p-[2px]" style={{ color: 'var(--sl-text-faint)' }}>
                        <LockOutlinedIcon sx={{ fontSize: 14 }} />
                    </span>
                </Tooltip>
            );
        }

        if (!st.downloaded) {
            return (
                <Tooltip title="Download and turn on this model" arrow placement="top">
                    <span className="flex items-center justify-center p-[2px]" style={{ color: 'var(--sl-brand-primary)' }}>
                        <FileDownloadOutlinedIcon sx={{ fontSize: 14 }} />
                    </span>
                </Tooltip>
            );
        }

        // In use for the turn in flight — a filled bulb that reads as "working"
        // rather than merely "on", matching the row's breathing ring.
        if (st.isActive) {
            return (
                <Tooltip title="In use for this response" arrow placement="top">
                    <span className="flex items-center justify-center p-[2px]" style={{ color: 'var(--sl-brand-primary)' }}>
                        <LightbulbIcon sx={{ fontSize: 14 }} />
                    </span>
                </Tooltip>
            );
        }

        return (
            <Tooltip title={st.on ? 'On — click to turn off' : 'Off — click to turn on'} arrow placement="top">
                <span
                    className="flex items-center justify-center p-[2px]"
                    style={{ color: st.on ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)' }}
                >
                    {st.on
                        ? <LightbulbIcon sx={{ fontSize: 14 }} />
                        : <LightbulbOutlinedIcon sx={{ fontSize: 14 }} />}
                </span>
            </Tooltip>
        );
    };

    // Deliberately the same card as a connection (mcp-catalog-item.tsx): icon,
    // name and action on one header line, then the description and the tag row
    // running the full width beneath it rather than indented under the icon.
    // Both lists describe the same kind of thing — a capability you switch on —
    // so they should not be two different shapes.
    const renderRow = (m: any) => {
        const name = m.name || m.id || m.model;
        const downloaded = !!m.downloaded;
        const busy = isDownloading(name);
        const percent = downloads.get(name)?.percent ?? 0;
        const failure = downloadErrors.get(name);
        // What to say and what to offer, decided by the status SLP answered.
        const copy = failure ? describeFailure(failure, canContact) : null;
        const locked = isLocked(m);
        const on = isEnabled(name);
        const isActive = activeAuto === name;
        const pressure = memoryPressure(m, totalRamGb);
        const size = sizeTier(m);
        const tier = tierTag(m);
        const maker = brandName(name);
        const description = m.description || '';

        return (
            <Box
                key={name}
                role="button"
                onClick={() => { if (!locked) toggle(m); }}
                className={`rounded-xl${isActive ? ' model-row-active' : ''}`}
                sx={{
                    padding: '12px 14px',
                    cursor: locked ? 'default' : 'pointer',
                    border: failure ? '1px solid var(--sl-brand-alpha-30)' : '1px solid var(--sl-border-subtle)',
                    // Deliberately identical on or off, for the same reason a
                    // connection card doesn't tint when connected: the bulb
                    // already carries the state, and tinting the card as well
                    // made an enabled row read as *selected* and turned a long
                    // list into blocks of colour.
                    bgcolor: 'transparent',
                    opacity: locked ? 0.6 : 1,
                    transition: 'box-shadow 0.15s ease, background 0.15s ease',
                    '&:hover': {
                        boxShadow: locked || failure ? 'none' : 'inset 0 0 0 1px var(--sl-brand-alpha-30)',
                    },
                }}
            >
                {/* Header — icon, name and action on one line */}
                <div className="flex items-center gap-2.5">
                    <Box
                        sx={{
                            width: 22,
                            height: 22,
                            flexShrink: 0,
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            // Identical on or off: the maker's logo is an identity,
                            // not a state. The bulb carries the state.
                            backgroundColor: 'var(--sl-white-alpha-7)',
                            border: '1px solid',
                            borderColor: 'var(--sl-border-default)',
                        }}
                    >
                        <ModelBrandIcon name={name} size={14} />
                    </Box>

                    <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1 min-w-0">
                        {modelLabel(m)}
                        {maker && <span className="ml-1.5 text-[10px] font-medium" style={{ color: 'var(--sl-text-faint)' }}>by {maker}</span>}
                    </span>

                    <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">
                        {renderState({ name, on, downloaded, locked, busy, isActive })}
                    </div>
                </div>

                {/* What the model is actually for — the line that tells a
                    non-technical user why they'd pick this one over its neighbour,
                    so it outranks every tag below it. */}
                {description && (
                    <p className="text-[12px] text-sl-text-muted leading-relaxed mt-2 mb-0">
                        {description}
                    </p>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: '8px' }}>
                    {m.recommended === true && (
                        <Tag
                            label="Recommended"
                            color="var(--sl-brand-primary)"
                            border="var(--sl-brand-alpha-30)"
                            tip="Recommended — light on this computer's memory, so it loads and answers fast"
                            icon={<StarRoundedIcon sx={{ fontSize: 10 }} />}
                        />
                    )}
                    {(m.capabilities || []).map((cap: string) => {
                        const stl = CAPABILITY_STYLE[cap] || { color: 'var(--sl-text-muted)', border: 'var(--sl-border-default)' };
                        return <Tag key={cap} label={cap} color={stl.color} border={stl.border} tip={CAPABILITY_INFO[cap] || cap} />;
                    })}
                    {size && <Tag label={size.label} color="var(--sl-text-faint)" border="var(--sl-border-default)" tip={size.tip} />}
                    {tier && <Tag label={tier.label} color={tier.color} border={tier.border} tip={TIER_INFO[tier.label] || tier.label} />}
                    {pressure && (
                        <Tag
                            label={pressure.label}
                            color={pressure.color}
                            border={pressure.border}
                            icon={<MemoryOutlinedIcon sx={{ fontSize: 10 }} />}
                            tip={pressure.fits
                                ? `~${pressure.gb}GB RAM · ${pressure.pct}% of this machine's memory · ${pressure.label} pressure`
                                : `Too large for this machine — needs ~${pressure.gb}GB (${pressure.pct}% of your memory) and likely won't run well`}
                        />
                    )}
                    <Tooltip title="Full model name" arrow placement="top">
                        <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono truncate"
                            style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-faint)', maxWidth: 170 }}
                        >
                            {name}
                        </span>
                    </Tooltip>
                </Box>

                {busy && (
                    <div className="mt-2 flex items-center gap-2">
                        <span className="flex-1 h-1 rounded-full overflow-hidden block" style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}>
                            <span className="h-full rounded-full block transition-all" style={{ width: `${percent}%`, backgroundColor: 'var(--sl-brand-primary)' }} />
                        </span>
                        <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--sl-brand-primary)' }}>{percent}%</span>
                    </div>
                )}

                {/* Why the download stopped. Set off from the card's own content
                    by a hairline rather than shouted in red: the entitlement case
                    (403 for anything the plan doesn't grant, signed in or not;
                    401 only when the token itself is bad) is not a fault, it's a
                    step the user hasn't taken yet — so it reads as a prompt with
                    an action, the same shape as a connection card's auth state.
                    A rate limit (429) or a dead transfer (502) is neither, so it
                    keeps its retry button and shows the server's own words. */}
                {!busy && copy && (
                    <div
                        className="mt-3 pt-3 flex items-start gap-2.5"
                        style={{ borderTop: '1px solid var(--sl-border-subtle)' }}
                    >
                        <Box
                            sx={{
                                width: 22,
                                height: 22,
                                flexShrink: 0,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: copy.tone === 'auth' ? 'var(--sl-brand-primary)' : 'var(--sl-status-error)',
                                backgroundColor: 'var(--sl-white-alpha-7)',
                                border: '1px solid',
                                borderColor: copy.tone === 'auth' ? 'var(--sl-brand-alpha-30)' : 'var(--sl-status-error)',
                            }}
                        >
                            {copy.tone === 'auth'
                                ? <LockOutlinedIcon sx={{ fontSize: 13 }} />
                                : <ErrorOutlineIcon sx={{ fontSize: 13 }} />}
                        </Box>

                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="text-[12px] font-semibold text-sl-text-primary">
                                {copy.headline}
                            </span>
                            <span className="text-[11px] leading-relaxed" style={{ color: 'var(--sl-text-muted)' }}>
                                {copy.body}
                            </span>
                        </div>

                        {/* Nothing to offer for a model that no longer exists, or for
                            a plan refusal we can't act on: the contact dialog needs an
                            email on the profile, and rendering "Contact us" without one
                            gave a button that closed the picker and did nothing. */}
                        {copy.action && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearDownloadError(name);
                                    if (copy.action === 'login') {
                                        // Straight into the sign-in flow the sidebar owns.
                                        setOpen(false);
                                        window.dispatchEvent(new CustomEvent('requestSignIn'));
                                    } else if (copy.action === 'contact') {
                                        setOpen(false);
                                        setContactOpen(true);
                                    } else {
                                        toggle(m);
                                    }
                                }}
                                className="flex-shrink-0 px-2.5 rounded-md text-[11px] font-semibold border transition-colors"
                                style={{
                                    height: '26px',
                                    color: 'var(--sl-brand-primary)',
                                    borderColor: 'var(--sl-brand-alpha-30)',
                                    backgroundColor: 'var(--sl-brand-alpha-10)',
                                    cursor: 'pointer',
                                }}
                            >
                                {copy.action === 'login' ? 'Log in' : copy.action === 'contact' ? 'Contact us' : 'Try again'}
                            </button>
                        )}
                    </div>
                )}
            </Box>
        );
    };

    return (
        <>
            <Tooltip title={showCue ? cueTip : triggerTip} placement="top" arrow>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    // Deliberately the same pill as Attach (file-attacher.tsx):
                    // the same 28px border-box, border, radius and fill, so the
                    // composer's controls line up. The height is the box, not a
                    // by-product of padding + line-height, because those two
                    // drift apart the moment a glyph or font size changes.
                    className={`flex items-center gap-1.5 flex-shrink-0 px-2 border rounded-md max-w-[190px] transition-all text-xs leading-4 disabled:cursor-not-allowed disabled:opacity-50${showCue ? ' model-cue-ring' : ''}`}
                    style={{
                        height: '28px',
                        boxSizing: 'border-box',
                        color: open ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                        borderColor: open ? 'var(--sl-brand-alpha-30)' : 'var(--sl-border-default)',
                        backgroundColor: open ? 'var(--sl-brand-alpha-10)' : 'var(--sl-white-alpha-7)',
                    }}
                    onMouseEnter={(e) => { if (!open) e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-10)'; }}
                    onMouseLeave={(e) => { if (!open) e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-7)'; }}
                >
                    <span className="flex items-center justify-center flex-shrink-0" style={{ width: 14, height: 14 }}>
                        {triggerIconFor
                            ? <ModelBrandIcon name={triggerIconFor.name || triggerIconFor.id} size={14} />
                            : <AutoAwesomeOutlinedIcon sx={{ fontSize: 13 }} />}
                    </span>
                    {/* Multi-select is just "Auto" — the count told you how many
                        models were eligible, which is not a thing you act on, and
                        it read as a badge on a control that isn't a counter. */}
                    <span className="font-medium truncate leading-4">{triggerLabel}</span>
                    <KeyboardArrowDownRoundedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
                </button>
            </Tooltip>

            {/* A dialog rather than a dropdown: the catalog is long enough to want
                a search field and room to breathe, and it has to be reachable from
                the keyboard without the composer being focused. */}
            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { ...dialogStyles.paper, maxWidth: '560px', height: '70vh', maxHeight: '620px' } }}
                BackdropProps={{ sx: dialogStyles.backdrop }}
            >
                <div className="flex flex-col h-full min-h-0">
                    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
                        <div className="flex flex-col gap-1 min-w-0">
                            <h3 className="text-sl-text-primary text-sm font-semibold m-0">Models</h3>
                            <p className="m-0 text-[11px] leading-relaxed" style={{ color: 'var(--sl-text-muted)' }}>
                                {autoEntry && !solo
                                    ? <>Using <span style={{ color: 'var(--sl-brand-primary)' }}>{modelLabel(autoEntry)}</span> for this request. Enable as many as you like — requests are routed to whichever one has the capability they need.</>
                                    : <>Enable as many as you like — requests are routed to whichever one has the capability they need. Enable a single model to always use it.</>}
                            </p>
                        </div>
                        <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'var(--sl-text-muted)' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </div>

                    {/* Search — the catalog only grows, so scanning can't be the
                        only way to find a model. */}
                    <div className="px-5 pb-3 flex-shrink-0">
                        <div
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                            style={{ border: '1px solid var(--sl-border-subtle)', backgroundColor: 'var(--sl-white-alpha-5)' }}
                        >
                            <SearchIcon sx={{ fontSize: 16, color: 'var(--sl-text-faint)' }} />
                            <InputBase
                                inputRef={searchRef}
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name, maker, or capability…"
                                fullWidth
                                sx={{
                                    fontSize: '13px',
                                    color: 'var(--sl-text-primary)',
                                    '& .MuiInputBase-input::placeholder': { color: 'var(--sl-text-faint)', opacity: 1 },
                                }}
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                                    className="text-[13px] leading-none px-1"
                                    style={{ color: 'var(--sl-text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                                    aria-label="Clear search"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 sidebar-scroll">
                        {matchCount === 0 ? (
                            <p className="m-0 px-2 py-6 text-center text-[12px]" style={{ color: 'var(--sl-text-faint)' }}>
                                {query ? <>No models match “{query}”</> : 'No models available'}
                            </p>
                        ) : groups.map((group) => (
                            <div key={group.key} className="flex flex-col">
                                <div className="flex items-baseline gap-2 pt-4 pb-2">
                                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--sl-text-disabled)' }}>
                                        {group.title}
                                    </span>
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--sl-text-disabled)' }}>
                                        {group.models.length}
                                    </span>
                                    {group.hint && (
                                        <span className="text-[10px] truncate" style={{ color: 'var(--sl-text-faint)' }}>{group.hint}</span>
                                    )}
                                </div>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {group.models.map(renderRow)}
                                </Box>
                            </div>
                        ))}
                    </div>

                    {/* Upsell — kept from the panel this replaced, so signed-in users
                        still have a route to ask for models or a bigger plan. */}
                    <div className="flex items-center justify-between gap-2 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--sl-border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>Need a model we don't list?</span>
                        <Tooltip title={canContact ? '' : 'Log in to send us a message'} placement="top" arrow>
                            <span className="inline-flex">
                                <button
                                    type="button"
                                    disabled={!canContact}
                                    onClick={canContact ? () => { setOpen(false); setContactOpen(true); } : undefined}
                                    className="text-[11px] font-semibold disabled:cursor-not-allowed"
                                    style={{ color: canContact ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)', background: 'none', border: 'none', padding: 0 }}
                                >
                                    Contact us <span aria-hidden>→</span>
                                </button>
                            </span>
                        </Tooltip>
                    </div>
                </div>
            </Dialog>

            <ContactDialog open={contactOpen && canContact} onClose={() => setContactOpen(false)} user={user} />
        </>
    );
}
