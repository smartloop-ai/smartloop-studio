import { useEffect, useState } from 'react';
import type { ChatActivity } from '@/app/contexts/ChatSessionsContext';

/**
 * The composer strip's marker: an ASCII spinner that sits inside the monospace
 * `[ ]` bracket. Mounted only while a turn is running, so no timer runs on an
 * idle app.
 */
const SPINNER_FRAMES = ['|', '/', '-', '\\'];

export function StreamingMarker() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 120);
    return () => clearInterval(id);
  }, []);
  return (
    /* Inherits the strip's color — the motion already says "running", and
       recoloring it made the marker jump out of a line meant to sit quiet. */
    <span className="inline-block text-center" style={{ width: 6 }}>
      {SPINNER_FRAMES[frame]}
    </span>
  );
}

// "Waiting for output" rather than "Queued": nothing on the wire distinguishes
// being parked behind another conversation from doing orchestration work, and
// this phrasing is true of both.
const LABELS: Record<ChatActivity, string> = {
  queued: 'Working — waiting for output',
  streaming: 'Generating…',
  error: 'This conversation ended with an error',
};

/**
 * A tab's activity, in the slot the type icon normally occupies — the browser's
 * own favicon-to-throbber swap. A tab is 200px wide with an already-truncating
 * title, so this replaces the icon rather than joining it.
 *
 * `queued` is the same ring as `streaming`, not turning. It covers everything
 * before the first token — orchestration as well as being parked behind another
 * conversation on the backend's single generation worker, which the two are
 * indistinguishable on the wire. A turning ring therefore claims exactly one
 * thing: tokens are arriving. Motion (and value) separates the two far more
 * legibly in the dark theme than a change of hue would.
 *
 * Deliberately CSS rather than the ASCII StreamingMarker above: that glyph is
 * tuned for the monospace status strip and reads as a stray character at 13px,
 * and its 120ms interval would cost a React render per active tab.
 */
export function TabActivitySpinner({ state }: { state: ChatActivity }) {
  if (state === 'error') {
    return (
      <span
        title={LABELS.error}
        aria-label={LABELS.error}
        className="block w-[6px] h-[6px] rounded-[1px]"
        style={{ backgroundColor: 'var(--sl-status-error)' }}
      />
    );
  }

  const streaming = state === 'streaming';
  return (
    <span
      title={LABELS[state]}
      aria-label={LABELS[state]}
      className={`block w-3 h-3 rounded-full border-[1.5px] ${streaming ? 'animate-spin' : 'animate-pulse'}`}
      style={{
        borderColor: streaming ? 'var(--sl-brand-alpha-20)' : 'var(--sl-border-default)',
        // One coloured arc on an otherwise faint ring is what reads as rotation;
        // a uniform border would spin invisibly.
        borderTopColor: streaming ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)',
        animationDuration: streaming ? '0.7s' : '1.6s',
      }}
    />
  );
}
