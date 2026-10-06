/**
 * SSE block parser — web-API only (fetch body `ReadableStream` + `TextDecoder`).
 *
 * Lives apart from lib/pipe-stream.ts, which imports `node:net` / `node:fs` /
 * `node:stream`: anything that imported the parser from there could not ship in
 * the browser bundle, and `streamAgentPrompt` was left out of it for exactly that
 * reason. pipe-stream.ts re-exports everything here, so its public surface is
 * unchanged.
 */

// ---------------------------------------------------------------------------
// SSE parser (W3C-compatible: handles \n\n, \r\n\r\n, \r\r, : comments)
// ---------------------------------------------------------------------------

export type SseEvent = {
  /** Event name from the `event:` field, or 'message' by default. */
  event: string;
  /** Concatenated `data:` field values (joined by `\n`). */
  data: string;
  /** Optional event id from `id:`. */
  id?: string;
  /** Optional reconnection time from `retry:`. */
  retry?: number;
};

/** Split a buffer into SSE event blocks separated by blank lines. */
function nextSseBlockBoundary(buf: string): number {
  // Per W3C SSE: events are separated by U+000D U+000A (CRLF), U+000A (LF),
  // or U+000D (CR) appearing twice in sequence. Any of \r\n\r\n / \n\n / \r\r.
  let earliest = -1;
  for (const sep of ['\r\n\r\n', '\n\n', '\r\r']) {
    const i = buf.indexOf(sep);
    if (i !== -1 && (earliest === -1 || i < earliest)) earliest = i;
  }
  return earliest;
}

function blockLengthAt(buf: string, idx: number): number {
  // Returns the length of the matched separator at idx (4, 2, or 2).
  if (buf.startsWith('\r\n\r\n', idx)) return 4;
  if (buf.startsWith('\n\n', idx)) return 2;
  if (buf.startsWith('\r\r', idx)) return 2;
  return 0;
}

/** Parse a single SSE event block (without trailing blank-line separator). */
export function parseSseEvent(block: string): SseEvent | null {
  const event: SseEvent = { event: 'message', data: '' };
  // Per W3C SSE, lines within a block are separated by CR, LF, or CRLF.
  const lines = block.split(/\r\n|\n|\r/);
  const dataParts: string[] = [];
  let hasFields = false;
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith(':')) continue; // SSE comment — ignore
    const colon = line.indexOf(':');
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colon);
      // Per spec: if value starts with a space, strip exactly one.
      value = line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }
    hasFields = true;
    if (field === 'event') event.event = value;
    else if (field === 'data') dataParts.push(value);
    else if (field === 'id') event.id = value;
    else if (field === 'retry') {
      const r = Number(value);
      if (Number.isFinite(r) && r >= 0) event.retry = r;
    }
    // unknown fields ignored
  }
  if (!hasFields) return null;
  event.data = dataParts.join('\n');
  return event;
}

/**
 * Parse an SSE stream into discrete events. Handles partial chunks across
 * read boundaries; skips `:keepalive` comment blocks; tolerates CRLF/LF/CR.
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = nextSseBlockBoundary(buf)) !== -1) {
        const block = buf.slice(0, idx);
        const sepLen = blockLengthAt(buf, idx);
        buf = buf.slice(idx + sepLen);
        const ev = parseSseEvent(block);
        if (ev) yield ev;
      }
    }
    buf += decoder.decode();
    if (buf.length > 0) {
      const ev = parseSseEvent(buf);
      if (ev) yield ev;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}
