// SSE framing for SLP's streaming endpoints, shared by every consumer:
// bootstrap, model load/download, and chat. Lifted out of main.js once chat
// became the third caller — the framing is subtle enough (see the comments
// below) that a second copy would drift.

// Line-buffered reader for SLP's SSE streams. Owns the framing — partial
// chunks, the `event:` name that applies until the blank line closes a frame,
// keepalive comments — and hands each frame to `onFrame(data, eventName)`
// already parsed. A line that is not a parseable `data:` frame goes to `onRaw`
// instead: /v1/models/load answers some requests with a plain JSON body rather
// than a stream, and feeding that body to a progress parser invented a 0%
// download for an already-resident model.
//
// Resolves when the response ends and rejects on a transport error; what a
// half-finished stream means is the caller's to decide.
function readSseStream(res, { onFrame, onRaw } = {}) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let eventName = 'progress';

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) { eventName = 'progress'; return; }
      if (trimmed.startsWith(':')) return;  // keepalive comment
      if (trimmed.startsWith('event: ')) { eventName = trimmed.slice(7).trim(); return; }
      if (!trimmed.startsWith('data: ')) { if (onRaw) onRaw(trimmed); return; }
      let data;
      try {
        data = JSON.parse(trimmed.slice(6));
      } catch {
        // An error frame stays terminal even when its payload is malformed.
        // Passing it to onRaw instead would report the failure as a success —
        // the exact bug this framing exists to prevent.
        if (eventName === 'error') { if (onFrame) onFrame({}, eventName); return; }
        if (onRaw) onRaw(trimmed);
        return;
      }
      if (onFrame) onFrame(data, eventName);
    };

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) handleLine(line);
    });

    res.on('end', () => {
      // Flush a last line that arrived without its terminating newline. SLP's
      // SSE frames always end in \n\n, but /v1/models/load's plain JSON body
      // does not — and dropping it silently would also drop an unterminated
      // final error frame.
      if (buffer.trim()) handleLine(buffer);
      resolve();
    });
    res.on('error', (err) => reject(err));
  });
}

// A failure inside a stream that already returned 200. SLP settles entitlement
// before opening the stream, so this is a mid-transfer fault — an expired
// signed URL, a full disk, a dropped socket.
function isErrorFrame(data, eventName) {
  return eventName === 'error' || data.status === 'error';
}

// The stop the user asked for, which SLP reports on its own event name rather
// than as an error carrying 499 — to the client this is the request succeeding.
// Terminal like an error frame and matched before the progress normalizer for
// the same reason: bootstrapProgress has no branch for it and would read an
// unrecognised frame as "0%, still downloading", leaving a ring that never ends.
function isCancelledFrame(data, eventName) {
  return eventName === 'cancelled' || data.status === 'cancelled';
}

module.exports = { readSseStream, isErrorFrame, isCancelledFrame };
