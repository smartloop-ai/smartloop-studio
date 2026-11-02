import { useEffect, useState } from 'react';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import { useUpgrade } from '@/app/contexts/UpgradeContext';
import type { CloudQuota } from '@/electron';

// Plan & usage: one credit pool covers cloud models and web searches, so this
// is the single meter for both — how much of this month's allowance is spent,
// as a percentage, and when it resets. Credit amounts and per-call detail live
// in the cloud console; an unmetered account has no percentage, so it shows
// the credits used when the API sends them.
//
// The card renders with the page, like the Web search section. Main keeps the
// quota cached and refreshed (window open, sign-in/out, every finished turn),
// so the first read is local and instant; 'cloud-quota-updated' carries any
// fresher copy while Settings is open.

type QuotaState = { status: 'loading' } | { status: 'ready'; quota: CloudQuota } | { status: 'error' };

// Never "0%" once anything is spent.
function percent(n: number): string {
    return n > 0 && n < 1 ? '<1%' : `${Math.round(n)}%`;
}

// The period ends at UTC midnight, which is mid-afternoon or evening in the
// Americas, so a bare date reads a day off. Name the local day and hour, and
// count hours in the last day.
function resetLabel(iso: string): string {
    const at = new Date(iso);
    const hours = Math.ceil((at.getTime() - Date.now()) / 3_600_000);
    if (hours <= 24) return `Resets in ${Math.max(hours, 1)}h`;
    return `Resets ${at.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' })}`;
}

function planLabel(plan: string): string {
    return plan === 'paid' ? 'Pro' : plan === 'plus' ? 'Plus' : plan === 'admin' ? 'Admin' : 'Free';
}

export default function PlanUsageCard({ isSignedIn, isPaid }: { isSignedIn: boolean; isPaid?: boolean }) {
    const { available: canUpgrade, product: proProduct, openUpgrade } = useUpgrade();
    const [state, setState] = useState<QuotaState>({ status: 'loading' });

    useEffect(() => {
        if (!isSignedIn) return;
        const apply = (res: { success: boolean; data?: CloudQuota } | undefined) =>
            setState(res?.success && res.data ? { status: 'ready', quota: res.data } : { status: 'error' });
        window.electronAPI?.getCloudQuota?.().then(apply);
        return window.electronAPI?.onCloudQuotaUpdated?.(apply);
    // Re-read on a plan change too: upgrading raises the allowance.
    }, [isSignedIn, isPaid]);

    const quota = isSignedIn && state.status === 'ready' ? state.quota : null;
    const unmetered = quota?.percent_used === null;
    const isFree = quota?.plan === 'free';
    const pct = quota?.percent_used ?? 0;
    const exhausted = !!quota && !unmetered && pct >= 100;
    const low = !!quota && !exhausted && pct >= 80;
    const barClass = exhausted ? 'bg-sl-status-error' : low ? 'bg-sl-status-warning' : 'bg-sl-brand';

    const body = () => {
        if (!isSignedIn) {
            return <p className="text-xs text-sl-text-disabled">Log in to see your monthly credits for cloud models and web search.</p>;
        }
        if (state.status === 'error') {
            return <p className="text-xs text-sl-text-disabled">Usage isn't available right now.</p>;
        }
        if (!quota) {
            // Same footprint as the meter, so nothing shifts when it fills in.
            return (
                <>
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="h-8 w-40 rounded bg-sl-bg-surface-3 animate-pulse" />
                        <div className="h-3 w-24 rounded bg-sl-bg-surface-3 animate-pulse" />
                    </div>
                    <div className="h-2 w-full rounded-full bg-sl-bg-surface-3 animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-sl-bg-surface-3 animate-pulse" />
                </>
            );
        }
        if (unmetered) {
            // No limit, so no percentage: show the credits spent and a full,
            // calm bar so the card reads the same as a metered one.
            return (
                <>
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-sl-text-primary tabular-nums">
                                {(quota.used ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-sm text-sl-text-muted">credits used</span>
                        </div>
                        <span className="text-xs text-sl-text-faint">{resetLabel(quota.resets_at)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden bg-sl-bg-surface-3">
                        <div className="h-full w-full rounded-full bg-sl-brand opacity-30" />
                    </div>
                    <p className="text-xs text-sl-text-disabled">
                        Unlimited credits for cloud models and web searches. Local models run on this computer and are always free.
                    </p>
                </>
            );
        }
        return (
            <>
                <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold text-sl-text-primary tabular-nums">{percent(pct)}</span>
                        <span className="text-sm text-sl-text-muted">of credits used</span>
                        {(low || exhausted) && (
                            <span className={`text-xs font-medium ${exhausted ? 'text-sl-status-error' : 'text-sl-status-warning'}`}>
                                {exhausted ? 'Allowance used' : 'Running low'}
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-sl-text-faint">{resetLabel(quota.resets_at)}</span>
                </div>
                <div className="h-2 w-full rounded-full overflow-hidden bg-sl-bg-surface-3">
                    <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }} />
                </div>
                <p className="text-xs text-sl-text-disabled">
                    {exhausted
                        ? "You've used this month's credits. Cloud models pause and answers stop reaching the web until it resets. Local models keep working."
                        : isFree
                            ? 'Credits cover web searches, one per search. Local models run on this computer and are always free.'
                            : 'Credits cover cloud models and web searches. Local models run on this computer and are always free.'}
                </p>
                {isFree && canUpgrade && (
                    <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-sl-border-subtle">
                        <span className="text-xs text-sl-text-muted">Pro unlocks cloud models and raises your monthly credits.</span>
                        <button
                            type="button"
                            onClick={openUpgrade}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-sl-text-primary border border-sl-brand transition-colors"
                            style={{ backgroundColor: 'var(--sl-brand-alpha-10)' }}
                        >
                            Upgrade · {proProduct?.formattedPrice || '$5'}/mo
                        </button>
                    </div>
                )}
            </>
        );
    };

    return (
        <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl bg-sl-bg-surface-1 border border-sl-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
                <DataUsageIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                <h2 className="text-lg md:text-xl font-semibold text-sl-text-primary">Plan &amp; usage</h2>
                {quota && (
                    <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase text-sl-brand"
                        style={{ border: '1px solid var(--sl-brand-alpha-30)', opacity: 0.7 }}
                    >
                        {planLabel(quota.plan)}
                    </span>
                )}
            </div>

            <div
                className={`flex flex-col gap-3 p-4 rounded-xl border border-sl-border-subtle ${isSignedIn ? '' : 'opacity-50'}`}
                style={{ backgroundColor: 'var(--sl-white-alpha-5)' }}
            >
                {body()}
            </div>
        </div>
    );
}
