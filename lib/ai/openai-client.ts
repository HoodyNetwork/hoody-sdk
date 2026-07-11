/**
 * OpenAI-compatible Chat Completions client — shared between `hoody chat`
 * and `ai-fix.ts`.
 *
 * Two entry points:
 *   - completeOnce(opts):  Promise<{text}>           (blocking, used by ai-fix)
 *   - streamCompletion(opts): async yields deltas     (streaming, used by chat)
 *
 * Uses native fetch (works on Node >=18 and Bun compiled binaries). Never
 * sends `tools`, `functions`, or `tool_choice` keys unless the caller
 * explicitly passes a `tools` array in opts — callers that disable the docs
 * tool must omit this field entirely (empty array is NOT equivalent — some
 * providers 400 on `tools: []`).
 *
 * Inbound `tool_calls` delta frames are surfaced back to the caller on the
 * stream path only when the caller opted in; otherwise they are silently
 * dropped before any text is emitted. This keeps `hoody chat` with the docs
 * tool disabled from ever processing a tool-call even if the model emits one.
 */

import type { Msg, ToolSpec } from './types.js';

export interface CommonOptions {
  url: string;
  key: string | undefined;
  model: string;
  messages: Msg[];
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  tools?: ToolSpec[] | undefined;
  signal?: AbortSignal | undefined;
  debug?: boolean | undefined;
  /** Test hook: override the global `fetch`. Used by unit tests to stub
   *  network traffic. Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch | undefined;
}

export interface CompleteOnceOptions extends CommonOptions {
  timeoutMs?: number | undefined; // default 8000
}

export interface StreamOptions extends CommonOptions {
  timeoutMs?: number | undefined; // default 60000 total
  firstByteTimeoutMs?: number | undefined; // default 10000
  onDelta: (delta: StreamDelta) => void;
  onDone?: ((info: StreamDoneInfo) => void) | undefined;
}

export interface StreamDelta {
  content?: string;
  tool_calls?: InboundToolCall[];
}

export interface StreamDoneInfo {
  finishReason?: string | undefined;
  usage?: Record<string, unknown> | undefined;
  aggregatedText: string;
  aggregatedToolCalls: InboundToolCall[];
}

export interface InboundToolCall {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

const DEFAULT_ONESHOT_TIMEOUT_MS = 8000;
const DEFAULT_STREAM_TIMEOUT_MS = 60_000;
const DEFAULT_FIRST_BYTE_MS = 10_000;

/**
 * Ensure the URL ends with `/chat/completions`. Accepts either the bare base
 * URL (`https://api.example.com/v1`) or the full endpoint. Auto-appends the
 * path if missing so users can set either convention in HOODY_CHAT_URL /
 * OPENAI_BASE_URL and the client hits the right place.
 */
export function resolveChatUrl(raw: string): string {
  const u = new URL(raw);
  // If the pathname already ends with /chat/completions (with or without a
  // trailing slash), leave it alone. Otherwise append.
  if (/\/chat\/completions\/?$/.test(u.pathname)) {
    return u.toString().replace(/\/$/, '');
  }
  u.pathname = u.pathname.replace(/\/$/, '') + '/chat/completions';
  return u.toString();
}

/**
 * Build the request payload. Extracted so unit tests can snapshot it.
 *
 * IMPORTANT: when opts.tools is undefined or an empty array, the `tools`
 * key is NOT included in the payload. This enforces the contract
 * that tool-disabled requests send NO tools field at all.
 */
export function buildRequestBody(opts: CommonOptions & { stream: boolean }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: opts.stream,
  };
  if (typeof opts.maxTokens === 'number') body.max_tokens = opts.maxTokens;
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
  return body;
}

/**
 * Build the fetch Headers. Extracted for unit testing.
 */
export function buildHeaders(opts: CommonOptions, stream: boolean): Headers {
  const h = new Headers({
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
  });
  if (opts.key) h.set('Authorization', `Bearer ${opts.key}`);
  return h;
}

/**
 * One-shot (non-streaming) completion. Returns the aggregated assistant text.
 */
export async function completeOnce(opts: CompleteOnceOptions): Promise<{ text: string }> {
  // Short-circuit pre-aborted caller signals — do NOT issue the fetch.
  if (opts.signal?.aborted) {
    throw opts.signal.reason ?? new Error('aborted');
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('timeout')),
    opts.timeoutMs ?? DEFAULT_ONESHOT_TIMEOUT_MS,
  );
  // Chain caller signal to our controller. Use {once:true} + cleanup to avoid
  // accumulating listeners on a long-lived caller signal.
  const callerAbort = opts.signal
    ? () => controller.abort(opts.signal!.reason)
    : undefined;
  if (opts.signal && callerAbort) {
    opts.signal.addEventListener('abort', callerAbort, { once: true });
  }
  try {
    const body = buildRequestBody({ ...opts, stream: false });
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(resolveChatUrl(opts.url), {
      method: 'POST',
      headers: buildHeaders(opts, false),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    // Some providers return content as an array of parts; coerce to string.
    const content = data.choices?.[0]?.message?.content;
    const raw = typeof content === 'string' ? content : coerceContent(content);
    // Strip <think>…</think> reasoning blocks that MiniMax leaks into content
    // instead of routing to reasoning_content. Mirrors the streaming path's
    // createThinkStripper so --no-stream output is clean too.
    const stripped = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text: stripped };
  } finally {
    clearTimeout(timeout);
    if (opts.signal && callerAbort) {
      opts.signal.removeEventListener('abort', callerAbort);
    }
  }
}

/**
 * Stateful `<think>…</think>` stripper for streaming content deltas.
 *
 * Some providers (MiniMax M2.x) leak reasoning tokens into the content field
 * wrapped in `<think>…</think>` instead of routing them to the canonical
 * `reasoning_content` channel. This tracks open-tag state across delta
 * boundaries and emits only the non-think portion.
 *
 * Behavior:
 *   - Outside a think block: passes content through verbatim.
 *   - Inside a think block: suppresses content until `</think>` arrives.
 *   - Partial tag spanning delta boundary (`<thi` in one delta, `nk>` next):
 *     held in `held` until we can decide whether it's a tag or literal text.
 *
 * NOT a general HTML parser — assumes `<think>…</think>` is the only tag
 * our content stream meaningfully opens. Any other `<foo>` tag is passed
 * through unchanged.
 */
export interface ThinkStripper {
  push(chunk: string): string;
  /**
   * End of stream. If we were outside a think block with a held partial-tag,
   * it turned out not to be a tag — emit it verbatim. If we were inside a
   * think block, drop everything (still reasoning).
   */
  flush(): string;
}

export function createThinkStripper(): ThinkStripper {
  let inside = false;
  let held = '';

  return {
    flush(): string {
      if (inside) {
        // Mid-think block; never resolved. Drop held content.
        held = '';
        return '';
      }
      const out = held;
      held = '';
      return out;
    },
    push(chunk: string): string {
      // Prepend any held partial-tag characters from the last delta.
      let buf = held + chunk;
      held = '';
      let out = '';
      let i = 0;
      while (i < buf.length) {
        if (!inside) {
          // Look for opening `<think>`.
          const open = buf.indexOf('<think>', i);
          if (open === -1) {
            // No open found in remainder. Check if the tail might be the start
            // of a partial tag we should hold.
            const lt = buf.lastIndexOf('<', buf.length);
            if (lt >= i && lt > buf.length - 7 /* '<think>'.length */) {
              const tail = buf.slice(lt);
              if ('<think>'.startsWith(tail)) {
                // Could be a partial open — hold it.
                out += buf.slice(i, lt);
                held = tail;
                return out;
              }
            }
            out += buf.slice(i);
            return out;
          }
          out += buf.slice(i, open);
          i = open + '<think>'.length;
          inside = true;
        } else {
          // Look for closing `</think>`.
          const close = buf.indexOf('</think>', i);
          if (close === -1) {
            // No close. Check for a partial close tag tail.
            const lt = buf.lastIndexOf('<', buf.length);
            if (lt >= i && lt > buf.length - 8 /* '</think>'.length */) {
              const tail = buf.slice(lt);
              if ('</think>'.startsWith(tail)) {
                held = tail;
                return out;
              }
            }
            // Whole remainder is think content — drop it.
            return out;
          }
          i = close + '</think>'.length;
          inside = false;
        }
      }
      return out;
    },
  };
}

/** Coerce array/object `message.content` shapes into a string. */
function coerceContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    // OpenAI-style array of parts: [{type:"text", text:"..."}, ...]
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as any).text === 'string') {
          return (part as any).text;
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

/**
 * Streaming completion. Calls opts.onDelta for each content chunk as it
 * arrives; calls opts.onDone once at end-of-stream. Resolves after the stream
 * closes (done or aborted).
 *
 * Inbound tool_calls deltas are collected in aggregatedToolCalls and surfaced
 * ONLY via opts.onDelta (if the caller passed a tools array) and in the
 * StreamDoneInfo. Content deltas are always surfaced.
 */
export async function streamCompletion(opts: StreamOptions): Promise<void> {
  // Short-circuit pre-aborted caller signals — do NOT issue the fetch.
  if (opts.signal?.aborted) {
    throw opts.signal.reason ?? new Error('aborted');
  }
  const controller = new AbortController();
  const totalTimeout = setTimeout(
    () => controller.abort(new Error('stream-timeout')),
    opts.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
  );
  // The "first-byte" timer must fire if body never yields a frame — NOT just
  // if headers never arrive. Clear it inside the read loop on the first frame.
  let firstByteTimeout: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(new Error('first-byte-timeout')),
    opts.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_MS,
  );
  const callerAbort = opts.signal
    ? () => controller.abort(opts.signal!.reason)
    : undefined;
  if (opts.signal && callerAbort) {
    opts.signal.addEventListener('abort', callerAbort, { once: true });
  }

  const toolsEnabled = !!(opts.tools && opts.tools.length > 0);

  let aggregatedText = '';
  const aggregatedToolCalls: InboundToolCall[] = [];
  let finishReason: string | undefined;
  let usage: Record<string, unknown> | undefined;
  const thinkStripper = createThinkStripper();

  try {
    const body = buildRequestBody({ ...opts, stream: true });
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(resolveChatUrl(opts.url), {
      method: 'POST',
      headers: buildHeaders(opts, true),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // NOTE: do NOT clear firstByteTimeout here — fetch resolves on headers,
    // not first body byte. A provider that opens the stream then stalls
    // would escape the guard. Clear it on first yielded frame instead.
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    if (!res.body) throw new Error('No response body for streaming request');

    for await (const frame of readSseFrames(res.body, opts.debug)) {
      if (firstByteTimeout) {
        clearTimeout(firstByteTimeout);
        firstByteTimeout = undefined;
      }
      // Trim whitespace from the data payload so `data: [DONE]  ` still terminates.
      if (frame.trim() === '[DONE]') break;
      let payload: any;
      try {
        payload = JSON.parse(frame);
      } catch {
        if (opts.debug) process.stderr.write(`[openai-client] Skipped malformed SSE frame: ${frame.slice(0, 100)}\n`);
        continue;
      }

      const choice = payload.choices?.[0];
      if (!choice) {
        if (payload.usage) usage = payload.usage;
        continue;
      }

      const delta = choice.delta ?? {};
      if (choice.finish_reason) finishReason = choice.finish_reason;

      // Content delta — always surfaced (after stripping <think>…</think>
      // blocks that some providers like MiniMax leak into content instead of
      // placing in the canonical reasoning_content field).
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        const cleaned = thinkStripper.push(delta.content);
        if (cleaned) {
          aggregatedText += cleaned;
          opts.onDelta({ content: cleaned });
        }
      }

      // Tool-call delta — surfaced ONLY if caller opted in by passing tools.
      // When tools are disabled the array is collected in aggregatedToolCalls
      // but never passed to onDelta, so no UI/render logic ever sees it.
      //
      // Defensive typing: a non-conforming provider may emit `null` entries,
      // non-number indices, or a non-string `function.arguments` (e.g. object).
      // All shape mismatches are dropped silently — the dispatcher filters on
      // `function.name === 'hoody_docs_search'` before executing, so garbage
      // entries never reach executeDocsSearch.
      if (Array.isArray(delta.tool_calls)) {
        const accepted: InboundToolCall[] = [];
        for (const raw of delta.tool_calls as unknown[]) {
          if (!raw || typeof raw !== 'object') continue;
          const r = raw as Record<string, unknown>;
          if (typeof r.index !== 'number' || !Number.isFinite(r.index)) continue;
          const incoming: InboundToolCall = { index: r.index };
          if (typeof r.id === 'string') incoming.id = r.id;
          if (typeof r.type === 'string') incoming.type = r.type;
          if (r.function && typeof r.function === 'object') {
            const f = r.function as Record<string, unknown>;
            const fn: { name?: string; arguments?: string } = {};
            if (typeof f.name === 'string') fn.name = f.name;
            if (typeof f.arguments === 'string') fn.arguments = f.arguments;
            // If the provider hands us an object-valued `arguments`, coerce
            // to JSON so downstream validateToolArgs can report the issue
            // as a tool-result error instead of throwing TypeError.
            else if (f.arguments && typeof f.arguments === 'object') {
              try { fn.arguments = JSON.stringify(f.arguments); } catch { /* drop */ }
            }
            incoming.function = fn;
          }
          accepted.push(incoming);
        }
        for (const incoming of accepted) {
          const existing = aggregatedToolCalls.find(tc => tc.index === incoming.index);
          if (existing) {
            // Merge streaming chunks: arguments typically arrive incrementally.
            if (incoming.id) existing.id = incoming.id;
            if (incoming.type) existing.type = incoming.type;
            if (incoming.function) {
              existing.function = existing.function ?? {};
              if (incoming.function.name) existing.function.name = incoming.function.name;
              if (incoming.function.arguments) {
                existing.function.arguments = (existing.function.arguments ?? '') + incoming.function.arguments;
              }
            }
          } else {
            aggregatedToolCalls.push({ ...incoming });
          }
        }
        if (toolsEnabled && accepted.length > 0) {
          opts.onDelta({ tool_calls: accepted });
        }
      }

      // Drop reasoning_content frames silently (MiniMax can emit these; we don't render thinking).
      // delta.reasoning_content, delta.thinking, etc. — intentionally ignored.
    }
  } finally {
    if (firstByteTimeout) clearTimeout(firstByteTimeout);
    clearTimeout(totalTimeout);
    if (opts.signal && callerAbort) {
      opts.signal.removeEventListener('abort', callerAbort);
    }
    // Flush any held partial think-tag. If we ended outside a think block
    // with a held `<` that never completed a tag, emit it verbatim so we
    // don't eat user-visible text. If we ended inside a think block, drop.
    const tail = thinkStripper.flush();
    if (tail) {
      aggregatedText += tail;
      opts.onDelta({ content: tail });
    }
  }

  if (opts.onDone) {
    opts.onDone({ finishReason, usage, aggregatedText, aggregatedToolCalls });
  }
}

/**
 * Async generator: consume a ReadableStream of SSE events and yield the
 * data payload of each event as a string (after stripping the `data: ` prefix
 * and any trailing whitespace). The sentinel `[DONE]` is yielded as the
 * string `'[DONE]'` unchanged — callers should check for it before JSON.parse.
 *
 * Handles:
 *   - Split chunks across reader.read() boundaries.
 *   - Keepalive comments (lines starting with ':').
 *   - Multi-line data (concatenates `data:` continuations within one event).
 *   - CRLF and LF line endings.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
  debug = false,
): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  // Cap the per-event buffer. Without this, a peer that streams chunks
  // forever without a blank-line delimiter would grow `buf` until the
  // total timeout fired, with no graceful cancellation.
  const MAX_SSE_EVENT_BYTES = 2 * 1024 * 1024; // 2 MiB per event
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Split on double newline (event boundary).
      let eventEnd: number;
      while (true) {
        const crlfcrlf = buf.indexOf('\r\n\r\n');
        const lflf = buf.indexOf('\n\n');
        eventEnd =
          crlfcrlf === -1 ? lflf : lflf === -1 ? crlfcrlf : Math.min(crlfcrlf, lflf);
        if (eventEnd === -1) break;
        const rawEvent = buf.slice(0, eventEnd);
        buf = buf.slice(eventEnd + (buf[eventEnd] === '\r' ? 4 : 2));

        // Parse the event's data field(s). Collect `data:` lines; ignore
        // comments and unrelated fields like `event:` or `id:`.
        const dataLines: string[] = [];
        for (const rawLine of rawEvent.split(/\r?\n/)) {
          if (rawLine.startsWith(':')) continue; // keepalive comment
          if (rawLine.startsWith('data:')) {
            dataLines.push(rawLine.slice(5).replace(/^\s/, ''));
          }
        }
        if (dataLines.length === 0) continue;
        const data = dataLines.join('\n');
        yield data;
      }
      // Enforce the 2 MiB cap AFTER consuming all complete frames in this
      // chunk, so coalesced sub-MiB events don't spuriously trip the limit.
      // Only a true delimiterless residual fails.
      if (buf.length > MAX_SSE_EVENT_BYTES) {
        try { await reader.cancel(); } catch { /* best effort */ }
        throw new Error(`SSE event buffer exceeded ${MAX_SSE_EVENT_BYTES} bytes without a delimiter`);
      }
    }
    // Flush remaining buffer as the last frame only if it looks like a data event.
    buf += decoder.decode();
    if (buf.trim()) {
      const dataLines: string[] = [];
      for (const rawLine of buf.split(/\r?\n/)) {
        if (rawLine.startsWith(':')) continue;
        if (rawLine.startsWith('data:')) {
          dataLines.push(rawLine.slice(5).replace(/^\s/, ''));
        }
      }
      if (dataLines.length > 0) yield dataLines.join('\n');
    }
  } finally {
    if (debug) process.stderr.write('[openai-client] SSE stream closed\n');
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
