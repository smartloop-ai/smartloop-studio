import { ReactNode, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { chatStreamService } from '@/app/services/chat-stream.service';
import { runTrace } from '@/app/services/run-trace.service';
import type {
  ChatErrorCode,
  ChatPhase,
  ChatSendRequest,
  ChatStreamEvent,
  ChatStreamSnapshot,
} from '@/electron';

// Live chat turns for the whole app.
//
// The stream is owned by the main process (`electron/chat-stream.js`); this is
// the *single* subscriber to its broadcasts, and it is mounted above <Routes> so
// it outlives every unmount boundary in the app. That placement is the point:
// chat used to own its own stream, so visiting Settings unmounted the component
// and killed the turn — and because messages only reached SQLite at the end of a
// turn, the half-written answer was gone rather than merely hidden. Same story
// ModelStatusContext tells about the Models panel.
//
// It is deliberately NOT a message store. SQLite remains the source of truth for
// committed history; what lives here is only the turn currently in flight, so
// the map holds one entry per *active* conversation rather than one per open tab.

export type ChatActivity = 'queued' | 'streaming' | 'error';

export interface ChatSession {
  conversationId: string;
  turnId: string;
  projectId: string | null;
  phase: ChatPhase;
  phaseLabel: string | null;
  seq: number;
  userMessageId: string;
  responseMessageId: string;
  prompt: string;
  content: string;
  citations: any[] | null;
  lastStatus: string | null;
  model: string | null;
  backendMessageId: string | null;
  error: { code: ChatErrorCode; detail: string | null } | null;
  tokensPerSecond: number | null;
  attachments: Array<{ file_id: string; name?: string }> | null;
}

const LIVE_PHASES: ReadonlySet<ChatPhase> = new Set<ChatPhase>([
  'connecting', 'loading-model', 'reconnecting', 'queued', 'streaming',
]);

export const isLivePhase = (phase?: ChatPhase | null) => !!phase && LIVE_PHASES.has(phase);

// Main classifies the failure; the wording lives here so there is one copy of it
// and it never gets written into the transcript. (The renderer used to keep a
// `hasLocalErrorRef` purely to stop error text syncing into the messages.)
const ERROR_COPY: Record<ChatErrorCode, { message: string; iconType: string }> = {
  'context-limit': {
    message: 'This conversation has exceeded its context limit. Please start a new conversation to continue.',
    iconType: 'warning',
  },
  'rate-limit': {
    message: 'You have exceeded your usage limit or are out of credits. Please upgrade your account or contact support@smartloop.ai for assistance.',
    iconType: 'warning',
  },
  auth: { message: 'Authentication error. Please log in again.', iconType: 'lock' },
  server: { message: 'Server error. Our team has been notified. Please try again later.', iconType: 'build' },
  connection: {
    message: 'Unable to connect to the local server. Please check that the service is running.',
    iconType: 'build',
  },
  unknown: { message: 'An error occurred while processing your message. Please try again.', iconType: 'error' },
};

export const describeChatError = (code: ChatErrorCode) => ERROR_COPY[code] ?? ERROR_COPY.unknown;

// --- store ----------------------------------------------------------------
//
// A plain external store rather than React state: a fast local model emits a
// delta every few milliseconds, and holding this in useState would re-render
// every consumer of the context — the tab strip included — on every token.
// Consumers subscribe through useSyncExternalStore and get a stable reference
// back unless *their* slice changed.

let sessions = new Map<string, ChatSession>();
const listeners = new Set<() => void>();

// Bumped only when a phase changes, so the activity selectors can cache. Token
// deltas must not invalidate them or the tab strip repaints 20×/s.
let phaseEpoch = 0;
let cachedActivity: Map<string, ChatActivity> = new Map();
let cachedActivityEpoch = -1;
let cachedProjects: Set<string> = new Set();
let cachedProjectsEpoch = -1;

// Attachments for a turn that has been sent but not yet acknowledged. Main is
// told the ids it needs to strip for the wire and nothing else, so the renderer
// keeps the display copy here until `accepted` creates the session to hang it on.
const pendingAttachments = new Map<string, Array<{ file_id: string; name?: string }>>();

const notify = () => { listeners.forEach((fn) => fn()); };

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function writeSession(conversationId: string, next: ChatSession | null) {
  const prev = sessions.get(conversationId);
  if (prev?.phase !== next?.phase) phaseEpoch++;
  sessions = new Map(sessions);
  if (next) sessions.set(conversationId, next);
  else sessions.delete(conversationId);
  notify();
}

function patch(conversationId: string, changes: Partial<ChatSession>) {
  const prev = sessions.get(conversationId);
  if (!prev) return;
  writeSession(conversationId, { ...prev, ...changes });
}

const getActivity = () => {
  if (cachedActivityEpoch === phaseEpoch) return cachedActivity;
  const map = new Map<string, ChatActivity>();
  sessions.forEach((s, id) => {
    if (s.phase === 'queued' || s.phase === 'connecting' || s.phase === 'loading-model' || s.phase === 'reconnecting') {
      map.set(id, 'queued');
    } else if (s.phase === 'streaming') {
      map.set(id, 'streaming');
    } else if (s.phase === 'error') {
      map.set(id, 'error');
    }
  });
  cachedActivity = map;
  cachedActivityEpoch = phaseEpoch;
  return map;
};

const getProjectActivity = () => {
  if (cachedProjectsEpoch === phaseEpoch) return cachedProjects;
  const set = new Set<string>();
  sessions.forEach((s) => { if (isLivePhase(s.phase) && s.projectId) set.add(s.projectId); });
  cachedProjects = set;
  cachedProjectsEpoch = phaseEpoch;
  return set;
};

const getSession = (conversationId: string | null) =>
  (conversationId ? sessions.get(conversationId) ?? null : null);

function sessionFromSnapshot(snap: ChatStreamSnapshot): ChatSession {
  return {
    conversationId: snap.conversationId,
    turnId: snap.turnId,
    projectId: snap.projectId,
    phase: snap.phase,
    phaseLabel: snap.phaseLabel,
    seq: snap.seq,
    userMessageId: snap.userMessageId,
    responseMessageId: snap.responseMessageId,
    prompt: snap.prompt,
    content: snap.content,
    citations: snap.citations,
    lastStatus: snap.statuses.length ? snap.statuses[snap.statuses.length - 1].message : null,
    model: snap.model,
    backendMessageId: snap.backendMessageId,
    error: snap.error,
    tokensPerSecond: snap.tokensPerSecond,
    attachments: null,
  };
}

// --- event reducer --------------------------------------------------------

// Set while a snapshot pull is in flight so a torrent of deltas can't queue a
// pull per event.
let reconciling = false;

async function reconcile() {
  if (reconciling) return;
  reconciling = true;
  try {
    const streams = await chatStreamService.snapshot();
    let changed = false;
    const next = new Map(sessions);
    Object.values(streams).forEach((snap) => {
      const prev = next.get(snap.conversationId);
      // A snapshot only loses to a session we have *more* of; otherwise main is
      // authoritative, since it never stopped receiving.
      if (prev && prev.turnId === snap.turnId && prev.seq >= snap.seq) return;
      next.set(snap.conversationId, {
        ...sessionFromSnapshot(snap),
        attachments: prev?.attachments ?? null,
      });
      changed = true;
    });
    if (changed) {
      sessions = next;
      phaseEpoch++;
      notify();
    }
  } finally {
    reconciling = false;
  }
}

function applyEvent(event: ChatStreamEvent) {
  const { conversationId, turnId, seq } = event;

  if (event.type === 'accepted') {
    writeSession(conversationId, {
      conversationId,
      turnId,
      projectId: event.projectId,
      phase: 'connecting',
      phaseLabel: null,
      seq,
      userMessageId: event.userMessageId,
      responseMessageId: event.responseMessageId,
      prompt: event.prompt,
      content: '',
      citations: null,
      lastStatus: null,
      model: null,
      backendMessageId: null,
      error: null,
      tokensPerSecond: null,
      attachments: pendingAttachments.get(conversationId) ?? null,
    });
    pendingAttachments.delete(conversationId);
    // The Logs panel watches turns live from here. Its rows are written by main,
    // so this only has to keep the in-memory view honest.
    runTrace.begin({
      id: event.responseMessageId,
      conversationId,
      projectId: event.projectId ?? undefined,
      prompt: event.prompt,
    });
    return;
  }

  const session = sessions.get(conversationId);
  // An event for a turn we never saw start, or one we already moved past. Both
  // mean our view is behind — let the snapshot settle it rather than guessing.
  if (!session || session.turnId !== turnId) { reconcile(); return; }
  if (seq <= session.seq) return;

  switch (event.type) {
    case 'phase':
      patch(conversationId, { seq, phase: event.phase, phaseLabel: event.label });
      break;
    case 'delta': {
      const content = session.content + event.text;
      // The increment didn't land where main says it should — an event went
      // missing while the window was reloading. Take main's copy instead.
      if (content.length !== event.fullLength) { reconcile(); return; }
      patch(conversationId, { seq, content });
      break;
    }
    case 'status':
      runTrace.status(conversationId, event.step, event.message);
      patch(conversationId, { seq, lastStatus: event.message });
      break;
    case 'citations':
      runTrace.citations(conversationId, Array.isArray(event.citations) ? event.citations.length : 0);
      patch(conversationId, { seq, citations: event.citations });
      break;
    case 'message-id':
      patch(conversationId, { seq, backendMessageId: event.messageId });
      break;
    case 'model':
      runTrace.model(conversationId, event.model);
      // The aux-models panel lights up the row the orchestrator picked.
      window.dispatchEvent(new CustomEvent('activeModelChanged', { detail: { message: event.model } }));
      patch(conversationId, { seq, model: event.model });
      break;
    case 'usage':
      patch(conversationId, { seq });
      break;
    case 'done':
      runTrace.end(conversationId, { tokensPerSecond: event.tokensPerSecond, outcome: 'done' });
      window.dispatchEvent(new CustomEvent('activeModelChanged', { detail: { done: true } }));
      patch(conversationId, {
        seq,
        phase: 'done',
        content: event.content,
        citations: event.citations ?? session.citations,
        backendMessageId: event.messageId ?? session.backendMessageId,
        model: event.model ?? session.model,
        tokensPerSecond: event.tokensPerSecond,
        lastStatus: null,
      });
      break;
    case 'aborted':
      runTrace.end(conversationId, { outcome: 'stopped' });
      window.dispatchEvent(new CustomEvent('activeModelChanged', { detail: { done: true } }));
      patch(conversationId, { seq, phase: 'aborted', content: event.content, lastStatus: null });
      break;
    case 'error':
      runTrace.end(conversationId, { outcome: 'error' });
      window.dispatchEvent(new CustomEvent('activeModelChanged', { detail: { done: true } }));
      patch(conversationId, {
        seq,
        phase: 'error',
        content: event.partialContent,
        error: { code: event.code, detail: event.detail },
        lastStatus: null,
      });
      break;
  }
}

// --- provider -------------------------------------------------------------

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Subscribe before pulling the snapshot: the other order drops every event
    // that lands in the gap, which is exactly the window a reload sits in.
    const unsubscribe = chatStreamService.subscribe(applyEvent);
    reconcile();
    return unsubscribe;
  }, []);

  return <>{children}</>;
}

// --- selectors ------------------------------------------------------------

/** The live turn for one conversation, merged over its committed history. */
export function useChatSession(conversationId: string | null, history: any[] | null | undefined) {
  const session = useSyncExternalStore(
    subscribe,
    useCallback(() => getSession(conversationId), [conversationId]),
  );

  const messages = useMemo(() => {
    const committed = Array.isArray(history) ? history : [];
    if (!session) return committed;

    const live: any[] = [{
      id: session.userMessageId,
      role: 'user',
      content: session.prompt,
      ...(session.attachments ? { attachments: session.attachments } : {}),
    }];

    const streaming = isLivePhase(session.phase);
    const failed = session.phase === 'error' && session.error;
    // An abort before a single token arrived leaves nothing worth a bubble.
    const hasBody = !!session.content || streaming || failed;

    if (hasBody) {
      const copy = failed ? describeChatError(session.error!.code) : null;
      live.push({
        id: session.responseMessageId,
        role: 'assistant',
        content: copy ? copy.message : session.content,
        is_new: streaming,
        message_id: session.backendMessageId,
        ...(session.citations ? { citations: session.citations } : {}),
        ...(session.tokensPerSecond ? { tokens_per_second: session.tokensPerSecond } : {}),
        ...(copy ? { isError: true, errorIconType: copy.iconType } : {}),
      });
    }

    // Main persists these rows as it goes, so a reload can hand back history
    // that already contains the turn we are also holding live. Live wins.
    const liveIds = new Set(live.map((m) => m.id));
    return [...committed.filter((m: any) => !liveIds.has(m.id)), ...live];
  }, [session, history]);

  return {
    messages,
    phase: session?.phase ?? null,
    phaseLabel: session?.phaseLabel ?? null,
    lastStatus: session?.lastStatus ?? null,
    error: session?.error ?? null,
    busy: isLivePhase(session?.phase),
    tokensPerSecond: session?.tokensPerSecond ?? null,
  };
}

/** Per-conversation activity for the tab strip. Repaints on phase, not tokens. */
export function useTabActivity(): Map<string, ChatActivity> {
  return useSyncExternalStore(subscribe, getActivity);
}

/** Projects with a turn in flight — the only way to see a stream you navigated away from. */
export function useProjectActivity(): Set<string> {
  return useSyncExternalStore(subscribe, getProjectActivity);
}

/** Start and stop turns. Stable across renders. */
export function useChatStream() {
  const sendingRef = useRef(new Set<string>());

  const send = useCallback(async (request: ChatSendRequest) => {
    if (sendingRef.current.has(request.conversationId)) {
      return { success: false as const, error: 'already-streaming' };
    }
    sendingRef.current.add(request.conversationId);
    if (request.attachments && request.attachments.length > 0) {
      pendingAttachments.set(request.conversationId, request.attachments);
    }
    try {
      const result = await chatStreamService.send(request);
      if (!result.success) pendingAttachments.delete(request.conversationId);
      return result;
    } finally {
      sendingRef.current.delete(request.conversationId);
    }
  }, []);

  const stop = useCallback((conversationId: string) => chatStreamService.stop(conversationId), []);

  return { send, stop };
}

/** Whether a conversation has a turn in flight, without subscribing to its text. */
export function useIsConversationBusy(conversationId: string | null): boolean {
  const activity = useTabActivity();
  if (!conversationId) return false;
  const state = activity.get(conversationId);
  return state === 'queued' || state === 'streaming';
}
