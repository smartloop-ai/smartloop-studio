import { useEffect, useState } from 'react';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import { useUpgrade } from '@/app/contexts/UpgradeContext';
import type { CloudQuota } from '@/electron';

// Plan & usage: how much of this month's cloud model allowance is spent, as
// a percentage, and when it resets — the same shape as Claude's and Cursor's
// usage meters. Credit amounts and per-call detail live in the cloud console.
// Hidden when signed out or when the account has no cloud access (the relay
// answers `unavailable`).

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
    return plan === 'paid' ? 'Pro' : plan === 'admin' ? 'Admin' : 'Free';
}

export default function PlanUsageCard({ isSignedIn, isPaid }: { isSignedIn: boolean; isPaid?: boolean }) {
    const { available: canUpgrade, product: proProduct, openUpgrade } = useUpgrade();
    const [quota, setQuota] = useState<CloudQuota | null>(null);

    useEffect(() => {
        if (!isSignedIn) {
            setQuota(null);
            return;
        }
        window.electronAPI?.getCloudQuota?.().then((res) => {
            setQuota(res?.success && res.data ? res.data : null);
        });
    // Re-read on a plan change too: upgrading raises the allowance.
    }, [isSignedIn, isPaid]);

    if (!isSignedIn || !quota) return null;

    const unmetered = quota.percent_used === null;
    const isFree = quota.plan === 'free';
    const pct = quota.percent_used ?? 0;
    const exhausted = !unmetered && !isFree && pct >= 100;
    const low = !exhausted && pct >= 80;
    const barClass = exhausted ? 'bg-sl-status-error' : low ? 'bg-sl-status-warning' : 'bg-sl-brand';
    const resets = resetLabel(quota.resets_at);

    return (
        <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl bg-sl-bg-surface-1 border border-sl-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
                <DataUsageIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: { xs: 20, md: 24 } }} />
                <h2 className="text-lg md:text-xl font-semibold text-sl-text-primary">Plan &amp; usage</h2>
                <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase text-sl-brand"
                    style={{ border: '1px solid var(--sl-brand-alpha-30)', opacity: 0.7 }}
                >
                    {planLabel(quota.plan)}
                </span>
            </div>

            <div className="flex flex-col gap-3 p-4 rounded-xl border border-sl-border-subtle" style={{ backgroundColor: 'var(--sl-white-alpha-5)' }}>
                {isFree ? (
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-sm font-medium text-sl-text-primary">Cloud models are a Pro feature</h3>
                            <p className="text-xs text-sl-text-disabled">
                                Pro includes a monthly allowance for cloud models. Local models are always free.
                            </p>
                        </div>
                        {canUpgrade && (
                            <button
                                type="button"
                                onClick={openUpgrade}
                                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-sl-text-primary border border-sl-brand transition-colors"
                                style={{ backgroundColor: 'var(--sl-brand-alpha-10)' }}
                            >
                                Upgrade · {proProduct?.formattedPrice || '$5'}/mo
                            </button>
                        )}
                    </div>
                ) : unmetered ? (
                    <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-medium text-sl-text-primary">Cloud usage this month</h3>
                        <span className="text-xs text-sl-text-faint">Not metered</span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-baseline justify-between gap-3">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-semibold text-sl-text-primary tabular-nums">{percent(pct)}</span>
                                <span className="text-sm text-sl-text-muted">of cloud credits used</span>
                                {(low || exhausted) && (
                                    <span className={`text-xs font-medium ${exhausted ? 'text-sl-status-error' : 'text-sl-status-warning'}`}>
                                        {exhausted ? 'Allowance used' : 'Running low'}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-sl-text-faint">{resets}</span>
                        </div>
                        <div className="h-2 w-full rounded-full overflow-hidden bg-sl-bg-surface-3">
                            <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }} />
                        </div>
                        <p className="text-xs text-sl-text-disabled">
                            {exhausted
                                ? 'Cloud models are paused until the allowance resets. Local models keep working.'
                                : 'Only cloud models use credits. Local models run on this computer and are always free.'}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
