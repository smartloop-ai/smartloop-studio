// Chat turns, owned by the main process.
//
// The renderer used to build an OpenAI client per send and consume the SSE
// response inside the chat component, which meant the transcript, the "is it
// streaming" flag and the AbortController were all local state in a component
// that unmounts whenever you visit /settings, open a document tab or switch
// project. A turn in flight died with it, and since messages only reached
// SQLite at the end of a turn, the partial answer was not merely hidden — it
// was gone. This is the same move ModelStatusContext describes for model
// downloads, one level up.
//
// One record per conversation, keyed by conversation id because that is
// simultaneously the dedupe key, the abort key, the event routing key, and the
// session_id the backend threads history on.
//
// NOTE: do not reuse isErrorFrame from ./sse here. It treats data.status ===
// 'error' as terminal, and a chat.status frame legitimately carries that for a
// *recoverable* failed tool call — the turn continues and still produces an
// answer. The terminal signal is the *step*: SLP emits ("tools", "error") when
// a tool call failed and ("error", "error") when the generation did, and only
// the second ends the turn. Chat does its own frame classification below.

const http = require('http');
const { readSseStream } = require('./sse');

// How often accumulated text is pushed to the renderer. The binding cost is not
// the IPC hop but React's re-render plus markdown, which cannot keep up with a
// fast local model one message per token anyway. 50ms caps the renderer at 20
// messages/sec independent of token rate — a constant, not a function of model
// speed. Frame-locked 16ms buys nothing (React batches); 100ms visibly chops.
const FLUSH_INTERVAL_MS = 50;

// How often a partial answer is written to SQLite mid-stream. This is crash
// insurance, not liveness, so it runs far slower than the UI flush: the worst
// case is losing three seconds of tokens if the app is killed mid-turn.
const PARTIAL_PERSIST_MS = 3000;

// Shortest generation worth quoting a rate for. Below this the answer arrived
// in effectively one burst and tok/s is an artefact of the flush, not a
// measurement.
const MIN_TPS_WINDOW_S = 0.5;

// How long a terminal record sticks around so a remounting renderer can restore
// the tok/s badge and error state. The messages and the trace are already in
// SQLite by then, so this is polish, not durability.
const TERMINAL_TTL_MS = 5 * 60 * 1000;
const MAX_RECORDS = 50;

// A queued turn produces no frames at all until the backend's single-worker
// executor frees up, so silence is expected rather than broken. Say so instead
// of leaving the tab looking stuck.
const QUEUED_NOTICE_MS = 90_000;

// No frame for this long on a stream that already connected means the far side
// is gone. Sits above the backend's own 300s stall timeout so its error wins.
const INACTIVITY_TIMEOUT_MS = 360_000;

const streams = new Map();
let deps = null;
let sweepTimer = null;

const TERMINAL = new Set(['done', 'aborted', 'error']);
const isTerminal = (phase) => TERMINAL.has(phase);

function init(next) {
  deps = next;
  if (!sweepTimer) {
    sweepTimer = setInterval(sweep, 60_000);
    if (sweepTimer.unref) sweepTimer.unref();
  }
}

// --- events ---------------------------------------------------------------

// Returns whether the event actually reached a renderer. Callers that advance a
// high-water mark (flush) must respect a false: a window that is mid-reload
// would otherwise have that slice of text skipped permanently.
function emit(record, event) {
  const win = deps?.getWindow?.();
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
  if (deps?.isRendererReady && !deps.isRendererReady()) return false;
  win.webContents.send('chat-stream-event', {
    conversationId: record.conversationId,
    turnId: record.turnId,
    seq: ++record.seq,
    ...event,
  });
  return true;
}

function setPhase(record, phase, label = null) {
  if (record.phase === phase && record.phaseLabel === label) return;
  record.phase = phase;
  record.phaseLabel = label;
  emit(record, { type: 'phase', phase, label });
}

function pushStatus(record, step, message) {
  if (!message) return;
  record.statuses.push({ step: step ?? null, message, at: Date.now() });
  emit(record, { type: 'status', step: step ?? null, message });
}

// --- registry -------------------------------------------------------------

function snapshotOf(r) {
  return {
    conversationId: r.conversationId,
    turnId: r.turnId,
    seq: r.seq,
    projectId: r.projectId,
    userMessageId: r.userMessageId,
    responseMessageId: r.responseMessageId,
    prompt: r.prompt,
    content: r.content,
    citations: r.citations,
    statuses: r.statuses,
    backendMessageId: r.backendMessageId,
    model: r.model,
    usage: r.usage,
    phase: r.phase,
    phaseLabel: r.phaseLabel,
    error: r.error,
    tokensPerSecond: r.tokensPerSecond,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  };
}

function getState() {
  sweep();
  const out = {};
  for (const [id, r] of streams) out[id] = snapshotOf(r);
  return { success: true, streams: out };
}

function sweep() {
  const now = Date.now();
  for (const [id, r] of streams) {
    if (r.terminalAt && now - r.terminalAt > TERMINAL_TTL_MS) streams.delete(id);
  }
  if (streams.size <= MAX_RECORDS) return;
  const terminal = [...streams.entries()]
    .filter(([, r]) => r.terminalAt)
    .sort((a, b) => a[1].terminalAt - b[1].terminalAt);
  for (const [id] of terminal) {
    if (streams.size <= MAX_RECORDS) break;
    streams.delete(id);
  }
}

// --- flushing and persistence --------------------------------------------

function scheduleFlush(record) {
  if (record.flushTimer) return;
  record.flushTimer = setInterval(() => flush(record), FLUSH_INTERVAL_MS);
}

function flush(record, force = false) {
  if (record.content.length > record.flushedLength) {
    const text = record.content.slice(record.flushedLength);
    // Only advance once the renderer has actually been told.
    if (emit(record, { type: 'delta', text, fullLength: record.content.length })) {
      record.flushedLength = record.content.length;
    }
  }
  // Only the throttled mid-stream save happens here. The final write is
  // finalize's, which knows the citations and message id are settled too — doing
  // it in both places wrote the same row twice on every turn.
  if (!force && Date.now() - record.lastPersistAt >= PARTIAL_PERSIST_MS
      && record.content.length !== record.persistedLength) {
    persistAssistant(record);
  }
  if (force && record.flushTimer) {
    clearInterval(record.flushTimer);
    record.flushTimer = null;
  }
}

function persistAssistant(record) {
  if (!record.content) return;
  try {
    deps.database.addMessages(record.conversationId, [{
      id: record.responseMessageId,
      message_id: record.backendMessageId,
      role: 'assistant',
      content: record.content,
      citations: record.citations,
      // Stamped after the user message so getMessages' ORDER BY created_at puts
      // them in the order they were said, rather than leaving it to rowid.
      created_at: new Date(record.startedAt + 1).toISOString(),
    }]);
    record.persistedLength = record.content.length;
    record.lastPersistAt = Date.now();
  } catch (err) {
    console.error('[Chat] Failed to persist assistant message:', err);
  }
}

function persistTrace(record, outcome) {
  try {
    deps.database.addRunTrace({
      message_id: record.responseMessageId,
      conversation_id: record.conversationId,
      project_id: record.projectId,
      model: record.model,
      started_at: new Date(record.startedAt).toISOString(),
      ended_at: new Date(record.endedAt || Date.now()).toISOString(),
      duration_ms: (record.endedAt || Date.now()) - record.startedAt,
      citations: Array.isArray(record.citations) ? record.citations.length : null,
      outcome,
      prompt: record.prompt,
      steps: record.statuses.map((s, i) => {
        const next = record.statuses[i + 1];
        return {
          step: s.step,
          message: s.message,
          at: s.at - record.startedAt,
          ms: (next ? next.at : (record.endedAt || Date.now())) - s.at,
        };
      }),
    });
  } catch (err) {
    console.error('[Chat] Failed to persist run trace:', err);
  }
}

// --- finalize -------------------------------------------------------------

// Errors are not transcript. Main persists only what the model actually
// produced; the failure travels as a code the renderer turns into prose, which
// keeps a single copy of the wording and matches what hasLocalErrorRef was
// already doing in the renderer — deliberately keeping error text out of the
// synced messages.
function classifyHttpError(status, body) {
  const text = String(body || '');
  if (status === 429 || /rate_limit_exceeded|insufficient_quota|insufficient credits/i.test(text)) {
    return { code: 'rate-limit', detail: text.slice(0, 500) };
  }
  if (status === 401 || status === 403) return { code: 'auth', detail: text.slice(0, 500) };
  if (status >= 500) return { code: 'server', detail: text.slice(0, 500) };
  if (/allocated memory|exceeded the limit|context length/i.test(text)) {
    return { code: 'context-limit', detail: text.slice(0, 500) };
  }
  return { code: 'unknown', detail: text.slice(0, 500) || `HTTP ${status}` };
}

function classifyTransportError(err) {
  const code = err?.code;
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EPIPE') {
    return { code: 'connection', detail: err.message };
  }
  return { code: 'unknown', detail: err?.message || 'Stream failed' };
}

// A failure the backend reports from inside an otherwise healthy stream. The
// message is a Python exception string, so this reads the same vocabulary
// classifyHttpError does rather than inventing a second one for the same faults.
function classifyGenerationError(message) {
  const text = String(message || '');
  if (/allocated memory|exceeded the limit|exceed context window|context length/i.test(text)) {
    return { code: 'context-limit', detail: null };
  }
  if (/rate_limit_exceeded|insufficient_quota|insufficient credits/i.test(text)) {
    return { code: 'rate-limit', detail: text.slice(0, 500) };
  }
  // Not 'server': that copy says our team has been notified, which is untrue of
  // a model that failed on this machine.
  return { code: 'unknown', detail: text.slice(0, 500) || null };
}

function finalize(record, outcome, error = null) {
  if (record.finalized) return;
  record.finalized = true;
  record.endedAt = Date.now();

  if (record.inactivityTimer) { clearTimeout(record.inactivityTimer); record.inactivityTimer = null; }
  if (record.queuedTimer) { clearTimeout(record.queuedTimer); record.queuedTimer = null; }

  // A context overflow fails during prompt evaluation, so whatever accumulated
  // is the backend narrating rather than an answer. Every other failure leaves
  // text the user watched arrive, which is worth keeping.
  if (error && error.code === 'context-limit') record.content = '';

  flush(record, true);

  // Measured from the first token, not from dispatch: now that a turn can sit
  // queued behind another conversation, counting that wait in the denominator
  // would report a rate the model never ran at. Prefer the backend's own token
  // count when the chat.usage frame supplied one — it is exact, where counting
  // deltas is an approximation.
  let tps = null;
  if (record.firstTokenAt && outcome === 'done') {
    const elapsed = (record.endedAt - record.firstTokenAt) / 1000;
    const tokens = record.usage?.completionTokens ?? record.deltaCount;
    // Needs a window long enough to be a rate. A short answer is often buffered
    // and flushed in one go, which puts the whole generation inside a millisecond
    // and divides by ~0 — the real backend reported 3000 tok/s for a four-token
    // reply. Measuring from dispatch (what this replaced) hid that by padding the
    // denominator with the queue wait, which is its own lie. No reading beats a
    // wrong one: the status strip keeps showing the last real figure.
    if (elapsed >= MIN_TPS_WINDOW_S && tokens > 0) tps = Math.round(tokens / elapsed);
  }
  record.tokensPerSecond = tps;

  if (record.content) {
    persistAssistant(record);
  } else if (record.persistedLength > 0) {
    // A partial was flushed and then everything was withdrawn (an abort before
    // any text survived the context-limit rewrite). Drop the orphan row.
    try { deps.database.deleteMessage(record.responseMessageId); } catch { /* already gone */ }
  }

  if (tps) {
    try { deps.database.addTpsEntry(tps); } catch (err) { console.error('[Chat] addTpsEntry failed:', err); }
  }

  persistTrace(record, outcome === 'done' ? (record.sawErrorStatus ? 'error' : 'done')
    : outcome === 'aborted' ? 'stopped' : 'error');

  record.phase = outcome;
  record.error = error;
  record.terminalAt = Date.now();

  if (outcome === 'done') {
    emit(record, {
      type: 'done',
      content: record.content,
      tokensPerSecond: tps,
      messageId: record.backendMessageId,
      citations: record.citations,
      model: record.model,
    });
  } else if (outcome === 'aborted') {
    emit(record, { type: 'aborted', content: record.content });
  } else {
    emit(record, {
      type: 'error',
      code: error?.code || 'unknown',
      detail: error?.detail || null,
      partialContent: record.content,
    });
  }
}

// --- frame handling -------------------------------------------------------

// Ported from the renderer's for-await loop, branch order preserved. Several of
// these branches exist because of a specific field failure; reordering them is
// how a regression gets in.
function handleFrame(record, chunk) {
  record.lastFrameAt = Date.now();

  if (chunk.model && record.model !== chunk.model) {
    record.model = chunk.model;
    emit(record, { type: 'model', model: chunk.model });
  }

  const chunkMsgId = chunk.message_id
    || (typeof chunk.id === 'string' && chunk.id.startsWith('msg-') ? chunk.id : null)
    || (chunk.choices && chunk.choices[0] && chunk.choices[0].message_id)
    || null;
  if (!record.backendMessageId && chunkMsgId) {
    record.backendMessageId = chunkMsgId;
    emit(record, { type: 'message-id', messageId: chunkMsgId });
  }

  if (chunk.object === 'chat.citations' && chunk.citations) {
    record.citations = chunk.citations;
    emit(record, { type: 'citations', citations: chunk.citations });
    return;
  }

  if (chunk.object === 'chat.usage') {
    record.usage = {
      promptTokens: chunk.prompt_tokens ?? null,
      completionTokens: chunk.completion_tokens ?? null,
      totalTokens: chunk.total_tokens ?? null,
      maxContextTokens: chunk.max_context_tokens ?? null,
    };
    emit(record, { type: 'usage', ...record.usage });
    return;
  }

  if (chunk.object === 'chat.status') {
    // step 'error' is the generation itself failing. SLP says so in a status
    // frame, then streams the exception text as *content*, then finishes the
    // response the way a success finishes — "Response complete", finish_reason
    // stop, [DONE]. Nothing later in the stream distinguishes the two, so this
    // frame is the only place the turn can be failed. Finalizing here also puts
    // that content frame after record.finalized, where it is dropped, which is
    // what keeps the failure out of the transcript.
    if (chunk.step === 'error') {
      record.aborting = true;
      if (record.req) record.req.destroy();
      finalize(record, 'error', classifyGenerationError(chunk.message));
      return;
    }
    // status 'error' on any other step is a *recoverable* step failure (a tool
    // call that did not work). The turn continues; it only colours the trace.
    if (chunk.status === 'error') record.sawErrorStatus = true;
    pushStatus(record, chunk.step ?? null, chunk.message ?? '');
    return;
  }

  // Anything else the backend narrates — a tool invocation, an event type this
  // build does not know yet — becomes a status rather than being dropped. The
  // step vocabulary is not a fixed contract.
  if (chunk.object && chunk.object !== 'chat.completion.chunk') {
    if (chunk.message) pushStatus(record, chunk.step ?? chunk.object, chunk.message);
    return;
  }

  if (!chunk.choices || !chunk.choices[0]) return;

  // Tool calls arrive in fragments: the first carries the function name, the
  // rest only argument text. Recording on a non-empty name logs each call once.
  const toolCalls = chunk.choices[0].delta && chunk.choices[0].delta.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const name = call && call.function && call.function.name;
      if (name) pushStatus(record, 'tool', `Calling ${name}`);
    }
  }

  const content = chunk.choices[0].delta && chunk.choices[0].delta.content;
  if (content) {
    if (!record.firstTokenAt) {
      record.firstTokenAt = Date.now();
      // Promoted on the first *token*, not the first frame. Orchestration
      // (retrieval, planning, tool calls) runs on a different executor from
      // generation and overlaps freely, so status frames arrive happily while
      // this turn is still parked behind another conversation — measured at 13s
      // of them against the real backend. Nothing on the wire says "queued", so
      // the only claim that is always true is "tokens are arriving".
      setPhase(record, 'streaming');
    }
    record.content += content;
    record.deltaCount++;
    scheduleFlush(record);
  }

}

// --- dispatch -------------------------------------------------------------

function readBody(res) {
  return new Promise((resolve) => {
    let body = '';
    res.on('data', (c) => { body += c.toString(); });
    res.on('end', () => resolve(body));
    res.on('error', () => resolve(body));
  });
}

function armTimers(record) {
  if (record.queuedTimer) clearTimeout(record.queuedTimer);
  record.queuedTimer = setTimeout(() => {
    if (record.phase === 'queued') {
      pushStatus(record, 'queued', 'Still waiting — another conversation is generating');
    }
  }, QUEUED_NOTICE_MS);

  const tick = () => {
    if (record.finalized) return;
    if (Date.now() - record.lastFrameAt >= INACTIVITY_TIMEOUT_MS) {
      record.aborting = true;
      if (record.req) record.req.destroy();
      finalize(record, 'error', { code: 'connection', detail: 'The local server stopped responding.' });
      return;
    }
    record.inactivityTimer = setTimeout(tick, 30_000);
  };
  record.inactivityTimer = setTimeout(tick, 30_000);
}

function dispatchRequest(record) {
  const baseUrl = deps.slpService.getLocalBaseUrl();
  if (!baseUrl) {
    finalize(record, 'error', { code: 'connection', detail: 'The local server is not running.' });
    return;
  }

  const url = new URL(`${baseUrl}/v1/chat/completions`);
  const postData = JSON.stringify(record.requestBody);
  record.lastFrameAt = Date.now();

  const req = http.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      Accept: 'text/event-stream',
    },
  }, async (res) => {
    if (record.aborting) { res.destroy(); return; }

    // 503 means no model is loaded. Route the load through the same path the
    // rest of the app uses, so its progress reaches the existing UI and a load
    // already in flight is not duplicated.
    if (res.statusCode === 503 && !record.retriedAfterModelLoad) {
      record.retriedAfterModelLoad = true;
      res.resume();
      setPhase(record, 'loading-model', 'Loading model…');
      const loaded = await deps.loadPrimaryModel(record.model, record.projectId);
      if (record.aborting) return;
      if (!loaded || (!loaded.success && loaded.error !== 'already-downloading')) {
        finalize(record, 'error', { code: 'server', detail: loaded?.error || 'Could not load a model.' });
        return;
      }
      dispatchRequest(record);
      return;
    }

    if (res.statusCode !== 200) {
      const body = await readBody(res);
      finalize(record, 'error', classifyHttpError(res.statusCode, body));
      return;
    }

    // Connected, but the backend may still be queueing us behind another
    // conversation's generation — it emits nothing at all until it gets the
    // worker, so 'queued' holds until the first frame arrives.
    setPhase(record, 'queued', 'Waiting for the model…');
    armTimers(record);

    readSseStream(res, {
      onFrame: (data) => {
        if (record.finalized) return;
        handleFrame(record, data);
      },
      // [DONE] is not JSON, so it lands here rather than as a frame. The end of
      // the response is what finalizes the turn, so there is nothing to do with
      // it; anything else on this channel is worth seeing in the log.
      onRaw: (line) => {
        if (line !== 'data: [DONE]' && line !== '[DONE]') {
          console.log('[Chat] non-frame line:', line.slice(0, 200));
        }
      },
    }).then(() => {
      if (record.finalized) return;
      if (record.aborting) { finalize(record, 'aborted'); return; }
      if (!record.content) {
        finalize(record, 'error', { code: 'unknown', detail: 'The model returned an empty response.' });
        return;
      }
      finalize(record, 'done');
    }).catch((err) => {
      if (record.finalized) return;
      if (record.aborting) { finalize(record, 'aborted'); return; }
      handleTransportFailure(record, err);
    });
  });

  record.req = req;

  req.on('error', (err) => {
    if (record.finalized) return;
    if (record.aborting) { finalize(record, 'aborted'); return; }
    handleTransportFailure(record, err);
  });

  req.write(postData);
  req.end();
}

// A dead socket before any text arrived is worth one restart-and-retry. After
// text has arrived it is not: re-sending would ask the model to answer again and
// the user would get the first half twice.
function handleTransportFailure(record, err) {
  const classified = classifyTransportError(err);
  const retryable = classified.code === 'connection'
    && record.firstTokenAt === null
    && !record.retriedAfterRestart;

  if (!retryable) {
    finalize(record, 'error', classified);
    return;
  }

  record.retriedAfterRestart = true;
  setPhase(record, 'reconnecting', 'Reconnecting to the local server…');

  (async () => {
    try {
      await deps.slpService.startService();
      for (let i = 0; i < 30; i++) {
        if (record.aborting) { finalize(record, 'aborted'); return; }
        if (await deps.slpService.checkHealth()) {
          dispatchRequest(record);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (restartErr) {
      console.error('[Chat] Service restart failed:', restartErr);
    }
    finalize(record, 'error', classified);
  })();
}

// --- public API -----------------------------------------------------------

function send(input) {
  // init() runs once the service is up. A send before that has nowhere to go.
  if (!deps) return { success: false, error: 'Chat not ready', notReady: true };
  sweep();

  const conversationId = input && input.conversationId;
  if (!conversationId) return { success: false, error: 'No conversation id' };

  const existing = streams.get(conversationId);
  if (existing && !isTerminal(existing.phase)) {
    return { success: false, error: 'already-streaming', streaming: true, turnId: existing.turnId };
  }

  if (!deps.slpService.getLocalBaseUrl()) {
    return { success: false, error: 'Local service not available', notReady: true };
  }

  const startedAt = Date.now();
  const record = {
    conversationId,
    turnId: require('crypto').randomUUID(),
    seq: 0,
    userMessageId: input.userMessageId,
    responseMessageId: input.responseMessageId,
    projectId: input.projectId || null,
    prompt: input.text || '',
    content: '',
    flushedLength: 0,
    persistedLength: 0,
    citations: null,
    statuses: [],
    backendMessageId: null,
    model: input.model || null,
    usage: null,
    phase: 'connecting',
    phaseLabel: null,
    error: null,
    sawErrorStatus: false,
    tokensPerSecond: null,
    startedAt,
    firstTokenAt: null,
    endedAt: null,
    lastFrameAt: startedAt,
    lastPersistAt: 0,
    deltaCount: 0,
    req: null,
    flushTimer: null,
    queuedTimer: null,
    inactivityTimer: null,
    aborting: false,
    finalized: false,
    retriedAfterModelLoad: false,
    retriedAfterRestart: false,
    requestBody: null,
    terminalAt: null,
  };

  record.requestBody = buildRequestBody(input);
  streams.set(conversationId, record);

  // The user's own message is durable before anything can go wrong with the
  // response, and before the renderer has a chance to unmount.
  try {
    deps.database.addMessages(conversationId, [{
      id: input.userMessageId,
      role: 'user',
      content: input.text,
      attachments: input.attachments || null,
      created_at: new Date(startedAt).toISOString(),
    }]);
  } catch (err) {
    console.error('[Chat] Failed to persist user message:', err);
  }

  emit(record, {
    type: 'accepted',
    userMessageId: record.userMessageId,
    responseMessageId: record.responseMessageId,
    prompt: record.prompt,
    projectId: record.projectId,
  });
  emit(record, { type: 'phase', phase: 'connecting', label: null });

  dispatchRequest(record);

  return {
    success: true,
    data: {
      turnId: record.turnId,
      conversationId,
      userMessageId: record.userMessageId,
      responseMessageId: record.responseMessageId,
    },
  };
}

// Built here rather than in the renderer because a retry has to rebuild it with
// no renderer necessarily alive to ask.
function buildRequestBody(input) {
  const message = {
    role: 'user',
    content: input.text,
    additional_message_params: {
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: deps.getLocale ? deps.getLocale() : 'en-US',
      // Unix seconds, UTC — an unambiguous current instant.
      user_date: Math.floor(Date.now() / 1000),
    },
  };

  // SLP wants the bare asset id; the renderer carries a "file-" prefix. Project
  // attachments travel as project_id instead and are not listed here.
  const fileIds = (input.attachments || [])
    .filter((a) => a && typeof a.file_id === 'string' && a.file_id.startsWith('file-'))
    .map((a) => a.file_id.replace(/^file-/, ''));
  if (fileIds.length > 0) message.attachments = fileIds;

  // Project instructions are local-only metadata; the server folds any system
  // message in the request into its own prompt, so they ride along each turn.
  const instructions = (input.projectInstructions || '').trim();
  const messages = instructions
    ? [{ role: 'system', content: instructions }, message]
    : [message];

  const body = {
    model: input.model,
    messages,
    stream: true,
    session_id: input.conversationId,
    temperature: input.temperature,
  };
  if (input.projectId) body.project_id = String(input.projectId);
  if (input.cwd) body.cwd = input.cwd;
  return body;
}

function abort(conversationId) {
  const record = streams.get(conversationId);
  if (!record || isTerminal(record.phase)) {
    return { success: false, error: 'No active stream' };
  }
  record.aborting = true;
  // A real disconnect, not a flag the reader checks between chunks: the
  // supervisor closes the upstream response, which trips the agent's own
  // cancellation. The renderer's AbortController was never handed to the SDK,
  // so stopping used to leave the backend generating.
  if (record.req) record.req.destroy();
  finalize(record, 'aborted');
  return { success: true };
}

function abortAll(reason) {
  for (const [id, record] of streams) {
    if (isTerminal(record.phase)) continue;
    console.log(`[Chat] Aborting stream for ${id} (${reason})`);
    record.aborting = true;
    if (record.req) record.req.destroy();
    finalize(record, 'aborted');
  }
}

function abortByProject(projectId) {
  for (const [id, record] of streams) {
    if (isTerminal(record.phase) || record.projectId !== projectId) continue;
    console.log(`[Chat] Aborting stream for ${id} (project deleted)`);
    record.aborting = true;
    if (record.req) record.req.destroy();
    finalize(record, 'aborted');
  }
}

function isStreaming(conversationId) {
  const record = streams.get(conversationId);
  return !!record && !isTerminal(record.phase);
}

module.exports = {
  init,
  send,
  abort,
  abortAll,
  abortByProject,
  getState,
  isStreaming,
  FLUSH_INTERVAL_MS,
};
