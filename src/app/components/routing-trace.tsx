import { Tooltip } from '@mui/material';
import {
  buildFlow,
  fmtMs,
  fmtStamp,
  NodeKind,
  TraceTurn,
} from '@/app/services/run-trace.service';

/**
 * The routing log for one turn, as rendered in the Logs panel.
 *
 * A turn is a sequence of hops the backend narrates over SSE: the model the
 * orchestrator picked (sometimes several), a document search, generation. Read
 * as a log, newest at the bottom, stamped relative to the turn's start. The
 * chat itself stays clean — the panel is the only place this shows.
 */

/** A glyph per hop kind — identity never rests on color alone. */
export function NodeGlyph({ kind, size = 12 }: { kind: NodeKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', className: 'flex-shrink-0' };
  switch (kind) {
    case 'model':
      // A chip, not a sparkle: the sparkle is the picker's "Auto" mark and reads
      // as magic, where this row is a specific model doing specific work.
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" />
          <path d="M6.5 2.2v2.3M9.5 2.2v2.3M6.5 11.5v2.3M9.5 11.5v2.3M2.2 6.5h2.3M2.2 9.5h2.3M11.5 6.5h2.3M11.5 9.5h2.3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case 'retrieval':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.1" />
          <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'tool':
      return (
        <svg {...common}>
          <path d="M6.5 2.5v4M9.5 2.5v4M4.5 6.5h7v2a3.5 3.5 0 01-7 0v-2zM8 12v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'prompt':
      return (
        <svg {...common}>
          <path d="M2.5 4.5h11v6h-6l-3 2.5v-2.5h-2v-6z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      );
    case 'answer':
      // The sparkle lands here, on the thing the whole run was for — a tick just
      // means "no error", which is a lower bar than "here is your answer".
      return (
        <svg {...common}>
          <path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6L8 2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      );
    case 'halted':
      // Stopped or failed: a barred circle, so an unfinished run never wears the
      // same mark as a delivered answer.
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.1" />
          <path d="M5.4 8h5.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
  }
}

/**
 * The log itself: a stamped line per hop down a spine.
 *
 * Deliberately no per-hop progress bars. A bar implies a job filling toward
 * completion, and these hops are already finished by the time you read them —
 * the elapsed stamp is the honest encoding.
 */
export function FlowLog({ turn, now }: { turn: TraceTurn; now: number }) {
  const nodes = buildFlow(turn, now);

  return (
    <div className="flex flex-col">
      {nodes.map((n, i) => {
        const isModel = n.kind === 'model';
        const isTerminal = n.kind === 'answer' || n.kind === 'halted';
        const accent = isModel
          ? 'var(--sl-brand-primary)'
          : isTerminal && turn.outcome === 'error'
            ? 'var(--sl-status-error)'
            : 'var(--sl-text-muted)';
        const last = i === nodes.length - 1;
        return (
          <div key={`${n.kind}-${i}-${n.label}`} className="flex gap-2">
            {/* Spine: the glyph marks this hop, the line carries to the next. */}
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 12 }}>
              <span className="flex items-center justify-center" style={{ color: accent, height: 16 }}>
                <NodeGlyph kind={n.kind} />
              </span>
              {!last && (
                <span
                  className="flex-1 w-px my-0.5"
                  style={{ backgroundColor: 'var(--sl-border-default)', minHeight: 10 }}
                />
              )}
            </div>

            <div className={`flex-1 min-w-0 ${last ? '' : 'pb-1.5'}`}>
              <div className="flex items-baseline gap-1.5">
                {/* The stamp: mono and tabular so the column reads as a column. */}
                <span
                  className="text-[10px] font-mono tabular-nums flex-shrink-0"
                  style={{ color: 'var(--sl-text-disabled)' }}
                >
                  +{fmtStamp(n.at)}
                </span>
                <Tooltip title={n.ms != null ? `${n.label} — took ${fmtMs(n.ms)}` : n.label} placement="left" arrow>
                  {/* Wraps rather than clipping: the panel is ~300px wide and a
                      backend status line is a sentence, so truncating hid the
                      half that says what it was doing. */}
                  <span
                    className="text-[11px] cursor-default flex-1 min-w-0 break-words"
                    style={{ color: 'var(--sl-text-muted)' }}
                  >
                    {/* Verbatim from the server, and no emphasis on model rows:
                        the glyph in the spine already says which kind of hop this
                        is, so re-saying it in ink weight was the same fact twice.
                        An open hop trails an ellipsis — the "still going" signal
                        the backend's own status text uses. */}
                    {n.label}{n.running ? '…' : ''}
                  </span>
                </Tooltip>
                {n.ms != null && n.ms >= 50 && !isTerminal && (
                  <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: 'var(--sl-text-faint)' }}>
                    {fmtMs(n.ms)}
                  </span>
                )}
              </div>

              {n.detail && (
                /* Nested under its line, log-style, so it reads as belonging to
                   the hop above rather than as another event. */
                <span className="block text-[10px] pl-[34px] break-words" style={{ color: 'var(--sl-text-faint)' }}>
                  └ {n.detail}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
