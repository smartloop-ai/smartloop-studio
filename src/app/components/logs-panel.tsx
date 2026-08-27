import { useEffect, useState } from 'react';
import { runTrace, turnDuration, fmtMs, TraceTurn } from '@/app/services/run-trace.service';
import { FlowLog } from './routing-trace';

/**
 * Logs — what the model did on each run.
 *
 * The question this answers is "what is it doing, and who is doing it": the
 * orchestrator picked a model (sometimes several in one turn), maybe searched
 * documents, then generated. That routing is narrated over SSE as `chat.status`
 * events, each line previously overwriting the last in the composer — so the
 * shape of a turn was never visible, only its most recent instant.
 *
 * Laid out as cards rather than a stack of hairline-ruled sections: each card is
 * one question ("what just happened", "what came before"), and a surface with a
 * border makes that grouping visible without a heading shouting it. Runs survive
 * restarts — the store hydrates finished runs from SQLite, so this is a history,
 * not just a session view.
 *
 * Speed deliberately isn't here: tok/s is a machine stat, not routing, and it
 * already has a home in the composer footer.
 */

/** How many past runs the history card lists before it stops. */
const HISTORY_SHOWN = 6;

/**
 * A log stamp that degrades the way every list of dated things does: the clock
 * for today, the date once it isn't, the year once that changes. A bare
 * `21:04` on a week-old run is a lie by omission — it reads as this evening.
 */
const stamp = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { year: '2-digit', month: 'short', day: 'numeric' });
};

/** Everything about when, for the hover: full date, time, and how long ago. */
const stampTitle = (ms: number, now: number) => `${new Date(ms).toLocaleString()} · ${relative(ms, now)}`;

/** "just now" / "4m ago" / "2h ago" — kept for hover, where "how long ago" reads
 *  better than a wall clock. */
const relative = (ms: number, now: number): string => {
  const delta = Math.max(0, now - ms);
  if (delta < 45_000) return 'just now';
  const mins = Math.round(delta / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/** A panel card: one bordered group, holding one thing. */
function Card({ lead, action, children }: { lead?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    // Transparent with a hairline border and 12/14 padding — the same card the
    // Skills and Connections panels use, so Activity doesn't read as a different
    // app. A filled surface made it the loudest thing in the sidebar.
    <section
      className="rounded-xl flex flex-col gap-2.5"
      style={{ padding: '12px 14px', border: '1px solid var(--sl-border-subtle)', backgroundColor: 'transparent' }}
    >
      {(lead || action) && (
        /* No title: the rail already says Activity, and the cards are legible
           from their content — a log, then a list of past runs. What the header
           carries is identity on the left and its measure on the right, the same
           split every row in this panel uses. */
        <header className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate">{lead}</span>
          <span className="flex items-center gap-2 flex-shrink-0">{action}</span>
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Forget one run. Rows reveal it on hover so a list at rest stays quiet; the
 * current run's copy is always visible, since there is only one of it.
 */
function ForgetButton({ id, hidden = false }: { id: string; hidden?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => runTrace.remove(id)}
      title="Forget this run"
      aria-label="Forget this run"
      className="flex items-center justify-center flex-shrink-0 rounded transition-colors"
      style={{
        width: 16,
        height: 16,
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'var(--sl-text-disabled)',
        visibility: hidden ? 'hidden' : 'visible',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sl-status-error)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sl-text-disabled)'; }}
    >
      {/* A bin, not an ✕: this removes the record, where an ✕ in a list row
          usually means "close" or "dismiss from view". */}
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
        <path d="M2.8 4.3h10.4M6.3 4.3V3.1a.9.9 0 01.9-.9h1.6a.9.9 0 01.9.9v1.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M4.2 4.3l.6 8.4a1 1 0 001 .9h4.4a1 1 0 001-.9l.6-8.4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M6.8 6.9v4M9.2 6.9v4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Past runs, each expandable back into its own log. */
function History({ turns, now }: { turns: TraceTurn[]; now: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  if (turns.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-col">
        {turns.map((t, i) => {
          const open = openId === t.id;
          return (
            <div
              key={t.id}
              className={i === 0 ? '' : 'mt-1 pt-1'}
              style={i === 0 ? undefined : { borderTop: '1px solid var(--sl-border-subtle)' }}
            >
              <div
                className="flex items-center gap-2 rounded-md transition-colors"
                onMouseEnter={() => setHoverId(t.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ backgroundColor: hoverId === t.id ? 'var(--sl-white-alpha-7)' : 'transparent' }}
              >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : t.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md"
                style={{ background: 'none', border: 'none', padding: '4px 2px', color: 'inherit' }}
              >
                {/* A chevron that flips down/up, not a filled play triangle:
                    the triangle reads as "run this", and this only opens a row. */}
                <span
                  className="inline-flex flex-shrink-0 transition-transform"
                  style={{ transform: open ? 'rotate(180deg)' : 'none', color: 'var(--sl-text-disabled)' }}
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M2.4 3.9L5 6.5l2.6-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {/* A clock stamp leads each line, the way a log does. "12m ago"
                    sat here first and read oddly in a leading column: it's a
                    different width on every row and quietly changes while you
                    look at it. How long ago is on hover, where it belongs. */}
                <span
                  className="text-[10px] font-mono tabular-nums flex-shrink-0"
                  style={{ color: 'var(--sl-text-disabled)' }}
                  title={stampTitle(t.startedAt, now)}
                >
                  {stamp(t.startedAt)}
                </span>
                <span
                  className="text-[11px] truncate flex-1 min-w-0"
                  style={{ color: 'var(--sl-text-secondary)' }}
                  title={[t.prompt, t.model].filter(Boolean).join('\n\n')}
                >
                  {t.prompt?.trim() || t.model || 'Untitled run'}
                </span>
                {t.outcome && t.outcome !== 'done' && (
                  /* Plain word, not a chip — it qualifies the row it sits in
                     rather than being a badge on it. */
                  <span
                    className="text-[10px] flex-shrink-0"
                    style={{ color: t.outcome === 'error' ? 'var(--sl-status-error)' : 'var(--sl-text-faint)' }}
                  >
                    {t.outcome}
                  </span>
                )}
                <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--sl-text-faint)' }}>
                  {fmtMs(turnDuration(t, now))}
                </span>
              </button>
              {/* Kept out of the expanding button so clicking it can't also
                  toggle the log open. */}
              <ForgetButton id={t.id} hidden={hoverId !== t.id} />
              </div>
              {open && (
                <div className="pl-3 pb-2 pt-1">
                  <FlowLog turn={t} now={now} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function LogsPanel({ projectId }: { projectId?: string }) {
  const [turns, setTurns] = useState<TraceTurn[]>(() => runTrace.getTurns(projectId));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setTurns(runTrace.getTurns(projectId));
    return runTrace.subscribe(() => setTurns(runTrace.getTurns(projectId)));
  }, [projectId]);

  const live = turns.length > 0 && !turns[0].endedAt;

  // Tick while a turn is in flight so the live stamps move; otherwise once a
  // minute, which is all the "4m ago" column needs.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), live ? 500 : 60_000);
    return () => clearInterval(id);
  }, [live]);

  const latest = turns[0];
  const earlier = turns.slice(1, 1 + HISTORY_SHOWN);

  if (!latest) {
    return (
      <Card>
        <p className="m-0 text-[11px] leading-relaxed" style={{ color: 'var(--sl-text-faint)' }}>
          No runs yet. Send a prompt and the routing lands here — which model the
          orchestrator picked, what it searched, and how long each hop took.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card
        /* The prompt on the left, exactly as the history rows below read: the
           question is what identifies a run. The model rides along in the hover
           title, the same place the rows keep it, so the two cards say the same
           things in the same order. */
        lead={(
          <span className="flex items-baseline gap-2 min-w-0">
            <span
              className="text-[10px] font-mono tabular-nums flex-shrink-0"
              style={{ color: 'var(--sl-text-disabled)' }}
              title={live ? 'running now' : stampTitle(latest.startedAt, now)}
            >
              {stamp(latest.startedAt)}
            </span>
            <span
              className="text-[11px] truncate"
              style={{ color: 'var(--sl-text-secondary)' }}
              title={[latest.prompt, latest.model].filter(Boolean).join('\n\n')}
            >
              {latest.prompt?.trim() || latest.model || 'Untitled run'}
            </span>
          </span>
        )}
        action={
          <>
            <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--sl-text-faint)' }}>
              {fmtMs(turnDuration(latest, now))}
            </span>
            {/* Finished runs can be forgotten from here too, so every run is
                cleared the same way — one at a time, where it sits. */}
            {!live && <ForgetButton id={latest.id} />}
          </>
        }
      >
        <FlowLog turn={latest} now={now} />
      </Card>

      <History turns={earlier} now={now} />
    </div>
  );
}
