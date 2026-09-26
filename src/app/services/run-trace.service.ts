/**
 * What the model did on each turn, kept in memory.
 *
 * The backend narrates a turn over SSE as `chat.status` events — the model the
 * orchestrator picked, a document search, generation — and the composer paints
 * each one for a moment before the next overwrites it. That narration was
 * previously thrown away: nothing could be looked at after the fact, and a panel
 * mounted mid-turn saw nothing at all.
 *
 * This is the store behind the Logs panel: a ring buffer of the live
 * session in front of a SQLite table that survives restarts. A finished turn is written
 * to `run_traces` keyed by its assistant message id, and the buffer hydrates
 * from that table the first time anything asks for it — so opening the panel
 * after a restart shows the runs you actually did, not an empty panel.
 *
 * Only finished turns are persisted. A turn in flight exists solely in memory,
 * because a half-written run resurrected after a crash would claim to still be
 * running forever.
 */

export interface TraceStep {
  /** The backend's `step` field, when it sends one (e.g. 'model'). */
  step: string | null;
  /** The human-readable status line, as sent. */
  message: string;
  startedAt: number;
  /** Set when the next step arrives, or when the turn ends. */
  endedAt?: number;
}

export interface TraceTurn {
  /** The assistant message's id — also the primary key in `run_traces`. */
  id: string;
  /** The prompt that started the run — how a past run is recognised. */
  prompt?: string;
  /** Project the run belongs to, so the panel can show only the current one's. */
  projectId?: string;
  /** Conversation the run belongs to. Turns from different conversations now
   *  interleave, so every mutator resolves its target through this rather than
   *  through "whichever turn is newest". */
  conversationId?: string;
  startedAt: number;
  endedAt?: number;
  /** Model named by the `step === 'model'` event, if one arrived. */
  model?: string;
  /** Sources returned by `chat.citations`. */
  citations?: number;
  tokensPerSecond?: number;
  outcome?: 'done' | 'stopped' | 'error';
  steps: TraceStep[];
  /** Came back from SQLite rather than being watched live this session. */
  restored?: boolean;
}

/** Enough to see a pattern, few enough to stay cheap. */
const MAX_TURNS = 20;

// Newest first — the panel reads top-down and almost always wants turn 0.
//
// This buffer is the *live* view only. Rows are written by the main process as
// each turn finishes (electron/chat-stream.js), because a turn can complete with
// no renderer mounted at all — which is the whole point of DEV-398. Writing from
// both sides would be two writers racing on the same message_id.
let turns: TraceTurn[] = [];
const listeners = new Set<() => void>();
// Projects whose stored runs have been pulled in. Per project, not a single
// flag: switching projects has to load that project's history, and the first
// version of this hydrated once and then showed the wrong project's runs.
const hydratedProjects = new Set<string>();

const emit = () => {
  // A copy per change so React sees a new reference and repaints.
  turns = [...turns];
  listeners.forEach((fn) => fn());
};

// The newest still-open turn *for one conversation*. This used to be
// `turns[0], if open` — fine while only one turn could run, but with parallel
// tabs every status, model name and citation count from one conversation landed
// on whichever turn had started most recently.
const current = (conversationId?: string): TraceTurn | undefined =>
  turns.find((t) => !t.endedAt && t.conversationId === conversationId);

/** Rebuild a turn from its stored row, restoring absolute step timings. */
const fromRow = (row: any): TraceTurn => {
  const startedAt = Date.parse(row.started_at) || Date.now();
  const endedAt = row.ended_at ? Date.parse(row.ended_at) : startedAt + (row.duration_ms ?? 0);
  return {
    id: row.message_id,
    startedAt,
    endedAt,
    projectId: row.project_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    prompt: row.prompt ?? undefined,
    model: row.model ?? undefined,
    citations: row.citations ?? undefined,
    outcome: (row.outcome ?? 'done') as TraceTurn['outcome'],
    steps: (row.steps ?? []).map((s: any) => ({
      step: s.step ?? null,
      message: s.message ?? '',
      startedAt: startedAt + (s.at ?? 0),
      endedAt: startedAt + (s.at ?? 0) + (s.ms ?? 0),
    })),
    restored: true,
  };
};

/**
 * "Selected Ministral 3 3B Instruct 2512 (3B) for this question" → the model
 * name alone. Falls back to the whole message, which is still more useful in the
 * panel than nothing.
 *
 * Exported because the orchestration flow labels every model hop, not just the
 * turn's headline model — a turn can route through several.
 */
export const modelNameFromStatus = (message: string): string | null => {
  const m = message.match(/^\s*(?:selected|using|routing to)\s+(.+?)(?:\s+(?:for|to)\b.*)?[.…]?\s*$/i);
  // Not every `step: 'model'` event names a model. "Loading model for document
  // processing…" is a progress line about models, and treating it as a name
  // title-cased it into "Loading Model For Document Processing" and tagged it
  // "picked by the orchestrator". So: take the name after a naming verb, or a
  // short bare id ("gemma4-e2b", "Gemma 3 4B"), and otherwise say there isn't
  // one and let it render as an ordinary step.
  const bare = message.trim();
  const candidate = m?.[1]?.trim()
    ?? (bare && bare.split(/\s+/).length <= 3 && !/[.…!?]$/.test(bare) ? bare : null);
  if (!candidate) return null;
  // The backend tags some models with their tier in parentheses — "sl-mini
  // (mini)", "sl-nano (extra mini)". The parenthetical restates the id for a
  // reader who already sees it, so it's dropped here and the raw message stays
  // available in the row's tooltip.
  return candidate.replace(/\s*\([^)]{1,24}\)\s*$/, '').trim() || candidate;
};

export const runTrace = {
  /**
   * A turn started streaming. Every id it will ever need is stamped on here, at
   * the start — the previous version read a shared mutable at *persist* time,
   * which meant a turn finishing after another had begun wrote its row tagged
   * with the wrong conversation.
   */
  begin({ id, conversationId, projectId, prompt }:
        { id: string; conversationId?: string; projectId?: string; prompt?: string }) {
    turns.unshift({ id, conversationId, projectId, prompt, startedAt: Date.now(), steps: [] });
    // Never evict a turn that is still running: with several conversations going
    // at once, a busy one would otherwise drop another's live turn off the end
    // and leave its stream writing into something nothing renders.
    if (turns.length > MAX_TURNS) {
      const keep = turns.filter((t) => !t.endedAt);
      const done = turns.filter((t) => t.endedAt);
      turns = [...keep, ...done.slice(0, Math.max(0, MAX_TURNS - keep.length))]
        .sort((a, b) => b.startedAt - a.startedAt);
    }
    emit();
  },

  /** One `chat.status` event. Closes the step before it. */
  status(conversationId: string | undefined, step: string | null, message: string) {
    const turn = current(conversationId);
    if (!turn || !message) return;
    const now = Date.now();
    const prev = turn.steps[turn.steps.length - 1];
    if (prev && !prev.endedAt) prev.endedAt = now;
    turn.steps.push({ step, message, startedAt: now });
    if (step === 'model') turn.model = modelNameFromStatus(message) ?? turn.model;
    emit();
  },

  /**
   * Name the model serving this turn. The status narration doesn't reliably
   * announce a pick — the only `model` step this backend emits is "Loading
   * model for document processing…" — so the authority is the request itself
   * and the `model` field the stream echoes back on each chunk.
   */
  model(conversationId: string | undefined, name?: string | null) {
    const turn = current(conversationId);
    if (!turn || !name) return;
    if (turn.model === name) return;
    turn.model = name;
    emit();
  },

  /** `chat.citations` — how many sources the answer drew on. */
  citations(conversationId: string | undefined, count: number) {
    const turn = current(conversationId);
    if (!turn) return;
    turn.citations = count;
    emit();
  },

  /** The stream finished, was stopped, or failed. */
  end(conversationId: string | undefined, info: { tokensPerSecond?: number | null; outcome?: TraceTurn['outcome'] } = {}) {
    const turn = current(conversationId);
    if (!turn) return;
    const now = Date.now();
    const last = turn.steps[turn.steps.length - 1];
    if (last && !last.endedAt) last.endedAt = now;
    turn.endedAt = now;
    turn.outcome = info.outcome ?? 'done';
    if (info.tokensPerSecond) turn.tokensPerSecond = info.tokensPerSecond;
    emit();
  },

  /**
   * Runs to show, newest first. Scoped to a project when one is given — a run
   * belongs to the project it was made in, and mixing them would make the model
   * share read as if one project's routing were another's.
   */
  getTurns(projectId?: string): TraceTurn[] {
    if (!projectId) return turns;
    return turns.filter((t) => !t.projectId || t.projectId === projectId);
  },

  /**
   * Pull finished runs out of SQLite into the buffer. Idempotent and safe to
   * call from any mounting panel: rows already in memory win, since a live turn
   * is more current than its stored copy.
   */
  async hydrate(projectId?: string): Promise<void> {
    const key = projectId ?? '__all__';
    // Once per project, except when there's nothing to show: an empty panel
    // should always ask the table again rather than trust a flag set earlier,
    // when the answer may have been "no runs yet".
    const empty = this.getTurns(projectId).length === 0;
    if (hydratedProjects.has(key) && !empty) return;
    hydratedProjects.add(key);
    try {
      const rows = await (window as any).electronAPI?.db?.getRunTraces?.(MAX_TURNS, projectId ?? null);
      if (!Array.isArray(rows) || rows.length === 0) return;
      const known = new Set(turns.map((t) => t.id));
      const restored = rows
        .filter((r: any) => r.message_id && !known.has(r.message_id))
        .map(fromRow);
      if (restored.length === 0) return;
      // Cap per project rather than globally: two projects' histories should not
      // evict each other just because you looked at both.
      const merged = [...turns, ...restored].sort((a, b) => b.startedAt - a.startedAt);
      const perProject = new Map<string, number>();
      turns = merged.filter((t) => {
        const k = t.projectId ?? '__none__';
        const n = (perProject.get(k) ?? 0) + 1;
        perProject.set(k, n);
        return n <= MAX_TURNS;
      });
      emit();
    } catch (err) {
      // A panel with no history is worse than a panel with none plus a console
      // line — never let this take the UI down.
      console.warn('[runTrace] hydrate failed:', err);
    }
  },

  /** One turn by id — the id is the assistant message's, so the inline trace on
   *  a message can find its own routing without threading state through chat. */
  getTurn(id: string): TraceTurn | undefined {
    return turns.find((t) => t.id === id);
  },

  /**
   * Forget one run, in memory and on disk. A run still streaming is left alone:
   * the stream would keep writing into a turn nothing renders.
   */
  async remove(id: string): Promise<void> {
    const turn = turns.find((t) => t.id === id);
    if (!turn || !turn.endedAt) return;

    // Drop it now so the click feels immediate, but put it back if the delete
    // doesn't land. Swallowing the failure made the row vanish and then return
    // on the next hydrate, which reads as "delete is broken" — the UI must not
    // claim something is gone when the table still has it.
    const index = turns.indexOf(turn);
    turns = turns.filter((t) => t.id !== id);
    emit();
    try {
      const del = (window as any).electronAPI?.db?.deleteRunTrace;
      if (typeof del !== 'function') throw new Error('deleteRunTrace unavailable — restart the app to pick up main-process changes');
      await del(id);
    } catch (err) {
      console.warn('[runTrace] remove failed, restoring row:', err);
      turns = [...turns.slice(0, index), turn, ...turns.slice(index)];
      emit();
    }
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Milliseconds a step ran for — `now` while it's still open. */
export const stepDuration = (s: TraceStep, now: number): number =>
  Math.max(0, (s.endedAt ?? now) - s.startedAt);

/** Milliseconds a turn ran for — `now` while it's still streaming. */
export const turnDuration = (t: TraceTurn, now: number): number =>
  Math.max(0, (t.endedAt ?? now) - t.startedAt);

/* ─── Reading a turn as a flow ─────────────────────────────────────────────
   The shape the UI renders, derived rather than stored: the store keeps what the
   backend said, and this turns it into hops. Kept beside the store (not in the
   component) so both the panel and the inline trace import one implementation.
*/

export const fmtMs = (ms: number) => (ms < 950 ? `${Math.round(ms / 10) * 10}ms` : `${(ms / 1000).toFixed(1)}s`);

/** Log stamp, always seconds with two decimals so the column stays aligned. */
export const fmtStamp = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export type NodeKind = 'prompt' | 'model' | 'retrieval' | 'tool' | 'step' | 'answer' | 'halted';

export interface FlowNode {
  kind: NodeKind;
  label: string;
  /** Second line — what this hop actually did. */
  detail?: string;
  /** Milliseconds from the turn's start, i.e. the log stamp. */
  at: number;
  ms?: number;
  running?: boolean;
}

/**
 * Which kind of hop a status event is. `step === 'model'` is the one label the
 * backend states outright; the rest is read off the message, because the step
 * vocabulary beyond 'model' isn't contractual — an unrecognized message stays a
 * plain hop rather than being forced into a category.
 */
export const classify = (s: TraceStep): NodeKind => {
  // The backend's own vocabulary, read off recorded runs rather than guessed:
  //   model      "Loading model for document processing…"
  //   plan       "Planning the response and selecting tools"
  //   tools      "Processing..."
  //   read       "Reading document: sp97.pdf"
  //   file-write "<path it wrote>"
  //   preparing  "Preparing response..."
  //   streaming  "Generating response..."
  switch (s.step) {
    case 'model': return 'model';
    case 'tool':
    case 'tools':
    case 'file-write': return 'tool';
    case 'read': return 'retrieval';
    case 'plan':
    case 'preparing':
    case 'streaming': return 'step';
  }
  // An unrecognized step still gets a best guess from its wording rather than
  // falling flat — the vocabulary above is what this build has seen, not a
  // contract.
  const m = s.message;
  if (/search|document|retriev|index|embed|chunk|rerank|read/i.test(m)) return 'retrieval';
  if (/tool|connect|mcp|server|fetch|call/i.test(m)) return 'tool';
  return 'step';
};

/**
 * A step's text, minus the trailing ellipsis the backend puts on its status
 * lines (the UI adds its own for an open hop). Only strips when something is
 * left: a status of just "..." was reducing to an empty label, so the row
 * rendered as a bare "…" saying nothing about what was happening.
 */
const stepLabel = (message: string): string => {
  const trimmed = message.replace(/[.…\s]+$/, '').trim();
  return trimmed || message.trim() || 'Working';
};

/** The turn's hops, in order. */
export function buildFlow(turn: TraceTurn, now: number): FlowNode[] {
  const running = !turn.endedAt;
  const nodes: FlowNode[] = [{ kind: 'prompt', label: 'Your prompt', at: 0 }];

  turn.steps.forEach((s, i) => {
    // The backend's `step` decides the kind — a model event is a model event
    // even when its wording doesn't name one ("Loading model for document
    // processing…"), and second-guessing that made model hops disappear from
    // the log entirely. The label is the server's own text, untouched.
    const kind = classify(s);
    const open = !s.endedAt && running;
    const last = i === turn.steps.length - 1;
    nodes.push({
      kind,
      label: stepLabel(s.message),
      detail: undefined,
      at: Math.max(0, s.startedAt - turn.startedAt),
      ms: stepDuration(s, now),
      // Only the final open step is genuinely in flight; an earlier one without
      // an end stamp just never got closed.
      running: open && last,
    });
  });

  // Sources hang off the retrieval hop they came from, or stand alone when the
  // backend cited without narrating a search.
  if (turn.citations) {
    const label = `${turn.citations} ${turn.citations === 1 ? 'source' : 'sources'} cited`;
    const lastRetrieval = [...nodes].reverse().find((n) => n.kind === 'retrieval');
    if (lastRetrieval) lastRetrieval.detail = label;
    else nodes.push({ kind: 'retrieval', label, at: turnDuration(turn, now) });
  }

  if (!running) {
    nodes.push({
      // A run that ended early isn't an answer, and shouldn't wear the mark of one.
      kind: turn.outcome && turn.outcome !== 'done' ? 'halted' : 'answer',
      label: turn.outcome === 'stopped' ? 'Stopped' : turn.outcome === 'error' ? 'Failed' : 'Answered',
      detail: turn.tokensPerSecond ? `${turn.tokensPerSecond.toFixed(1)} tok/s` : undefined,
      at: turnDuration(turn, now),
    });
  }

  return nodes;
}
