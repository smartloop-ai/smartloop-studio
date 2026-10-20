import { useEffect, useState } from 'react';
import { Tooltip } from '@mui/material';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { useProjectContext } from '@/app/contexts/ProjectContext';

/**
 * Web search on/off for the current project, in the composer where the turn
 * is written. Settings keeps the app-wide switch; this one flips the same
 * per-project backend flag (`web_search_enabled`) for the project in view, so
 * someone can turn search on for one project without digging into Settings.
 *
 * Signed out there is nothing to flip: the hosted search endpoint needs a
 * Smartloop token, so the pill is disabled and the tooltip says why.
 */

interface WebSearchToggleProps {
  project?: any;
  // Sends are blocked (service still starting) — the toggle follows.
  disabled?: boolean;
}

export default function WebSearchToggle({ project, disabled = false }: WebSearchToggleProps) {
  const [user] = useAuthContext();
  const { updateProject } = useProjectContext();
  const isSignedIn = !!user && !user.guest;

  // undefined reads as ON, the backend default (same rule as Settings).
  const stored = !!project && project.web_search_enabled !== false;
  // Optimistic value while the PATCH and the projects refetch are in flight;
  // cleared once the stored value catches up, or if the save fails.
  const [pending, setPending] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (pending !== null && pending === stored) setPending(null);
  }, [stored, pending]);
  const enabled = isSignedIn && (pending ?? stored);

  const handleToggle = async () => {
    if (!project?.id || saving) return;
    const next = !enabled;
    setPending(next);
    setSaving(true);
    try {
      const res = await updateProject(project.id, { web_search_enabled: next });
      if (!res?.success) {
        console.error('[WebSearchToggle] Failed to set web search:', res?.error);
        setPending(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const tip = !isSignedIn
    ? 'Log in to use web search'
    : enabled
      ? 'Web search is on for this project — click to turn it off'
      : 'Web search is off for this project — click to turn it on';

  return (
    <Tooltip title={tip} placement="top" arrow>
      {/* The span is load-bearing: a disabled button fires no pointer events,
          so without it the tooltip is silent exactly when it explains why. */}
      <span className="flex items-center">
        <button
          type="button"
          disabled={disabled || !isSignedIn || !project?.id || saving}
          onClick={handleToggle}
          aria-pressed={enabled}
          aria-label="Web search"
          // The same 28px pill as Attach, the model switcher and Send, so the
          // composer's controls line up. Brand-tinted while on, quiet while off.
          className="flex items-center justify-center flex-shrink-0 border rounded-md transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            width: '28px',
            height: '28px',
            boxSizing: 'border-box',
            color: enabled ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
            borderColor: enabled ? 'var(--sl-brand-alpha-30)' : 'var(--sl-border-default)',
            backgroundColor: enabled ? 'var(--sl-brand-alpha-10)' : 'var(--sl-white-alpha-7)',
          }}
          onMouseEnter={(e) => { if (!enabled) e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-10)'; }}
          onMouseLeave={(e) => { if (!enabled) e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-7)'; }}
        >
          <TravelExploreIcon sx={{ fontSize: 15 }} />
        </button>
      </span>
    </Tooltip>
  );
}
