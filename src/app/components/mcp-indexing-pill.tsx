import { McpIndexingState } from '@/app/services/mcp-server.service';

/**
 * Indexing state for a connection, in the same outlined-pill language the
 * document list uses for its own indexing states — a connection and a document
 * are the same promise to the user ("this is searchable now"), so they read the
 * same rather than each inventing a vocabulary.
 *
 * Renders nothing for a connection with no content to crawl (a shell or
 * weather server is complete once its tools are indexed) — a "Disabled" pill
 * there would be noise on every card that has no content by nature.
 */

// Outlined, never filled; border at ~30% of the text color. Same palette as the
// document status pills in right-sidebar.
const COLOR: Record<string, string> = {
  indexed: 'rgb(52,211,153)',
  indexing: 'rgb(250,204,21)',
  provisioning: 'rgb(250,204,21)',
  queued: 'rgb(148,163,184)',
  failed: 'rgb(248,113,113)',
};

const LABEL: Record<string, string> = {
  indexed: 'Indexed',
  indexing: 'Indexing',
  // "Provisioning" is our word for discovering and vectorizing the tools; from
  // the outside it is the same wait, so it reads as indexing too.
  provisioning: 'Indexing',
  queued: 'Queued',
  failed: 'Failed',
};

/** "2m ago" / "3h ago" — the same relative stamp an indexed document shows. */
function relativeTime(epochSeconds: number): string {
  const diffMin = Math.floor((Date.now() - epochSeconds * 1000) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function McpIndexingPill({ indexing }: { indexing?: McpIndexingState }) {
  const state = indexing?.state;
  if (!state || state === 'disabled') return null;

  const color = COLOR[state];
  if (!color) return null;

  const label = state === 'indexed' && indexing?.crawled_at
    ? relativeTime(indexing.crawled_at)
    : LABEL[state];

  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
      style={{ border: `1px solid ${color.replace('rgb(', 'rgba(').replace(')', ',0.3)')}`, color }}
      title={indexing?.error || (indexing?.documents ? `${indexing.documents} document(s) indexed` : undefined)}
    >
      {label}
    </span>
  );
}
