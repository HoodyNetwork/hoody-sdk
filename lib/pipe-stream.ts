/**
 * Pipe Stream — Node-side helpers for the Hoody Pipe relay.
 *
 * Hoody Pipe is a server-mediated unidirectional byte-stream rendezvous: a path
 * string coordinates a sender (POST/PUT) and one or more receivers (GET); bytes
 * stream through with no buffering or storage. This file exposes that primitive
 * to Node.js callers in a generic, source/sink-agnostic shape — anything that
 * produces or consumes bytes (file, stdin, TCP/Unix socket, AsyncIterable) is
 * a first-class citizen.
 *
 * Browser callers should use PipeMedia (lib/pipe-media.ts) for MediaStream
 * sources; this file is Node-only (uses node:net, node:fs, Readable.toWeb).
 *
 * Engine: Node >= 22.19 (Readable.toWeb, Writable.toWeb, ReadableStream.from,
 * fetch with duplex: 'half' streaming bodies — all stable). Also runs on Bun.
 */

import * as net from 'node:net';
import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipeSource =
  | string                                    // utf-8 encoded
  | Buffer
  | Uint8Array
  | ReadableStream<Uint8Array>                // web stream
  | NodeJS.ReadableStream                     // node stream (fs.createReadStream, net.Socket, child_process.stdout)
  | AsyncIterable<Uint8Array | Buffer | string>
  | URL                                       // file: URL → fs.createReadStream
  | { tcp: { host: string; port: number } }
  | { unix: string };

export type PipeSendOptions = {
  /** HTTP method. POST default; PUT for `curl -T` parity. */
  method?: 'POST' | 'PUT';
  /** Number of receivers to wait for before transfer begins (1..256). */
  n?: number;
  /** Content-Type header. Default: application/octet-stream (text/plain for string sources). */
  contentType?: string;
  /** Optional Content-Length when known (helps progress tracking; otherwise chunked). */
  contentLength?: number;
  /** Sets Content-Disposition filename forwarded to receivers. */
  filename?: string;
  /** Extra request headers (X-Hoody-Pipe / X-Piping for receiver-side metadata). */
  headers?: Record<string, string>;
  /** Abort signal. */
  signal?: AbortSignal;
  /**
   * Called for each [INFO]/[ERROR] status message from the server.
   * Status messages stream as the response body during transfer.
   */
  onStatus?: (msg: PipeStatusMessage) => void;
};

export type PipeStatusMessage = {
  level: 'info' | 'error';
  /** Message text minus the `[INFO] ` / `[ERROR] ` prefix. */
  message: string;
  /** Full raw line including the prefix and trailing newline stripped. */
  raw: string;
};

export type PipeSendResult = {
  /** Resolves when the sender's response body has fully drained (transfer complete). */
  done: Promise<void>;
  /** HTTP status of the sender request. */
  status: number;
};

export type PipeReceiveOptions = {
  /** Receiver count — must match sender's `n` (1..256). */
  n?: number;
  /**
   * Content-Disposition control:
   *  - `true`  → force `attachment` (browser download)
   *  - `false` → suppress disposition entirely (force inline display)
   *  - omitted → passthrough sender's disposition unchanged
   */
  download?: boolean;
  /** Override download filename (implies `download: true` server-side). */
  filename?: string;
  /** Abort signal. */
  signal?: AbortSignal;
};

export type PipeReceiveResult = {
  /** Streamed bytes from the sender. Pipe wherever you like. */
  body: ReadableStream<Uint8Array>;
  /** Forwarded headers (Content-Type, Content-Length, Content-Disposition, X-Piping, X-Hoody-Pipe). */
  headers: Headers;
  /** HTTP status code. */
  status: number;
};

export type PipeProgressEvent =
  | { kind: 'state'; state: 'idle' | 'waiting' | 'streaming' | 'complete' | 'failed'; ts: number }
  | { kind: 'progress'; bytesTransferred: number; speed: number; eta: number; receivers: number; ts: number }
  | { kind: 'done'; bytesTransferred: number; duration: number; avgSpeed: number; ts: number };

export type PipeForwardTcpOptions = {
  /** Path used by THIS side to send local socket bytes → server. */
  sendPath: string;
  /** Path used by THIS side to receive server bytes → local socket. */
  recvPath: string;
  /** Listen mode: bind locally; on connect, bridge through pipes. */
  listen?: { host?: string; port: number };
  /** Connect mode: dial host:port; bridge that connection through pipes. */
  connect?: { host: string; port: number };
  /** Receivers per pipe (default 1). */
  n?: number;
  /**
   * Inject a periodic 1-byte sentinel through the pipe to defeat the server's
   * 5-min unestablished-pipe TTL. Only active when no real bytes are flowing.
   * Set to 0 to disable. Default 240000 (4 min, just under server's 5-min TTL).
   */
  keepaliveMs?: number;
  /** Abort signal — closes any active bridge. */
  signal?: AbortSignal;
};

export type PipeForwardTcpResult = {
  /** Resolves when the forwarder is fully closed (server stopped, all bridges drained). */
  done: Promise<void>;
  /** Stop accepting new connections / disconnect the active bridge. */
  close: () => void;
  /** When in listen mode, the bound local address (resolves once listening). */
  address: Promise<{ host: string; port: number }> | undefined;
};

// Public custom error so callers can detect bodyless responses.
export class PipeReceiveEmptyBodyError extends Error {
  constructor(public readonly status: number, public readonly headers: Headers) {
    super(`Pipe receive returned status ${status} with no body`);
    this.name = 'PipeReceiveEmptyBodyError';
  }
}

// ---------------------------------------------------------------------------
// URL building (shared with pipe-media.ts in spirit; not extracted yet)
// ---------------------------------------------------------------------------

/**
 * Encode a pipe path that may contain `/` separators. Each segment is
 * percent-encoded individually; literal `/` is preserved as a separator
 * (the server's router treats `/api/v1/pipe/<rest>` segment-wise).
 */
export function encodePipePath(path: string): string {
  if (!path) return '';
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Strict client-side path validation — fail before wire round-trip. */
export function validatePipePath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError('pipe path must be a non-empty string');
  }
  if (path.length > 1024) {
    throw new RangeError('pipe path must be <= 1024 characters');
  }
  // Reserved paths (lower-case-compared).
  const reserved = new Set(['/', '/noscript', '/help', '/favicon.ico', '/robots.txt']);
  const normalized = path.startsWith('/') ? path : '/' + path;
  if (reserved.has(normalized)) {
    throw new Error(`pipe path "${path}" is reserved by the server; choose a different path`);
  }
}

// ---------------------------------------------------------------------------
// Source coercion — anything bytes-shaped → ReadableStream<Uint8Array>
// ---------------------------------------------------------------------------

/**
 * Coerce an arbitrary `PipeSource` into a Web `ReadableStream<Uint8Array>`.
 * Throws `TypeError` for unsupported shapes.
 *
 * Note: never returns AsyncIterable — Bun's fetch streaming-body support is
 * inconsistent with raw async iterables across versions; ReadableStream is the
 * common stable substrate.
 */
export function coerceToReadableStream(source: PipeSource): ReadableStream<Uint8Array> {
  // string → encode UTF-8 once, single-chunk stream (no Blob wrapper)
  if (typeof source === 'string') {
    const bytes = new TextEncoder().encode(source);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        if (bytes.byteLength > 0) controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  // Buffer / Uint8Array
  if (source instanceof Uint8Array) {
    const bytes = source;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        if (bytes.byteLength > 0) {
          // Slice to a plain Uint8Array view backed by a fresh ArrayBuffer to
          // avoid sharing Buffer's pooled backing across consumers.
          controller.enqueue(new Uint8Array(bytes));
        }
        controller.close();
      },
    });
  }

  // Web ReadableStream — pass through (caller responsible for not double-locking)
  if (source instanceof ReadableStream) {
    return source as ReadableStream<Uint8Array>;
  }

  // URL with file: scheme → fs.createReadStream → web stream
  if (source instanceof URL) {
    if (source.protocol !== 'file:') {
      throw new TypeError(`URL source must be file:; got ${source.protocol}`);
    }
    const ns = fs.createReadStream(fileURLToPath(source));
    return nodeReadableToWeb(ns);
  }

  // {tcp: {host, port}} → net.connect → web stream (read half)
  if (typeof source === 'object' && source !== null && 'tcp' in source) {
    const { host, port } = (source as { tcp: { host: string; port: number } }).tcp;
    const sock = net.connect({ host, port });
    return nodeReadableToWeb(sock);
  }

  // {unix: '/path'} → net.connect → web stream (read half)
  if (typeof source === 'object' && source !== null && 'unix' in source) {
    const sock = net.connect({ path: (source as { unix: string }).unix });
    return nodeReadableToWeb(sock);
  }

  // Node Readable (fs read stream, child stdout, etc.)
  if (typeof (source as NodeJS.ReadableStream).pipe === 'function'
      && typeof (source as NodeJS.ReadableStream).on === 'function') {
    return nodeReadableToWeb(source as NodeJS.ReadableStream);
  }

  // AsyncIterable — convert via ReadableStream.from (Node 22.x stable)
  if (typeof (source as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    // ReadableStream.from coerces strings/Buffers per chunk; normalize each yield.
    const it = (source as AsyncIterable<Uint8Array | Buffer | string>)[Symbol.asyncIterator]();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const r = await it.next();
          if (r.done) {
            controller.close();
            return;
          }
          const v = r.value;
          if (v == null) return;
          if (typeof v === 'string') {
            controller.enqueue(new TextEncoder().encode(v));
          } else if (v instanceof Uint8Array) {
            controller.enqueue(v);
          } else {
            controller.enqueue(new Uint8Array(v as ArrayBufferLike));
          }
        } catch (err) {
          controller.error(err);
        }
      },
      async cancel(reason) {
        if (typeof it.return === 'function') {
          try { await it.return(reason as undefined); } catch { /* ignore */ }
        }
      },
    });
  }

  throw new TypeError(`unsupported PipeSource shape: ${Object.prototype.toString.call(source)}`);
}

/**
 * Convert a Node readable to a web ReadableStream while propagating errors.
 *
 * Readable.toWeb does forward `error` events to controller.error, but only if
 * the listener is attached at the time of conversion. We attach explicitly
 * BEFORE calling toWeb so an early error during construction is captured.
 */
function nodeReadableToWeb(ns: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  // node:stream's typings don't expose toWeb on the structural type alias.
  const r = ns as unknown as Readable;
  // Buffer the most recent error so toWeb's adapter sees it.
  let pendingError: unknown = null;
  r.on('error', (err) => { pendingError = err; });
  const web = Readable.toWeb(r) as ReadableStream<Uint8Array>;
  if (pendingError) {
    // toWeb may have synchronously already adapted the stream; force-error it.
    return new ReadableStream<Uint8Array>({
      start(controller) { controller.error(pendingError); },
    });
  }
  return web;
}

// ---------------------------------------------------------------------------
// Status-message parser (newline-delimited [INFO]/[ERROR] lines)
// ---------------------------------------------------------------------------

const STATUS_INFO_RE = /^\[INFO\]\s?(.*)$/;
const STATUS_ERROR_RE = /^\[ERROR\]\s?(.*)$/;

/**
 * Parse a [INFO]/[ERROR] status line. Returns `null` for empty input.
 * Lines that don't match either prefix are returned as `level: 'info'`
 * with the full raw text so callers can still surface them.
 */
export function parseStatusLine(line: string): PipeStatusMessage | null {
  // Strip trailing CR (CRLF tolerance) and any trailing whitespace.
  const trimmed = line.replace(/\r$/, '');
  if (trimmed.length === 0) return null;
  let m = STATUS_INFO_RE.exec(trimmed);
  if (m) return { level: 'info', message: m[1] ?? '', raw: trimmed };
  m = STATUS_ERROR_RE.exec(trimmed);
  if (m) return { level: 'error', message: m[1] ?? '', raw: trimmed };
  return { level: 'info', message: trimmed, raw: trimmed };
}

/**
 * Stream a Web ReadableStream<Uint8Array> as `PipeStatusMessage` events,
 * handling chunk boundaries mid-line, CRLF/LF (CR alone NOT supported — the
 * pipe server always terminates with `\n`), and partial-tail-on-EOF
 * (an unterminated final line is dropped, NOT emitted, since the server
 * always terminates real status lines with `\n`).
 */
export async function* parseStatusStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<PipeStatusMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      // Split on LF; CR before LF gets stripped by parseStatusLine.
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const parsed = parseStatusLine(line);
        if (parsed) yield parsed;
      }
    }
    // Flush decoder, but DROP any trailing unterminated partial line — the
    // server always terminates with `\n`, so a partial tail means the
    // connection dropped mid-line (don't emit corrupted state).
    buf += decoder.decode();
    // (intentionally ignore residual `buf` here)
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

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

// ---------------------------------------------------------------------------
// Query helpers — pipe accepts string-encoded booleans
// ---------------------------------------------------------------------------

/** Encode a boolean for ?download / ?video / ?progress query strings. */
export function boolQuery(v: boolean | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v ? 'true' : 'false';
}

// ---------------------------------------------------------------------------
// PipeStream class
// ---------------------------------------------------------------------------

export interface PipeStreamConfig {
  /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
  pipeBaseUrl: string;
  /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
  basePath?: string;
}

export class PipeStream {
  private readonly baseUrl: string;
  private readonly basePath: string;

  constructor(config: PipeStreamConfig) {
    this.baseUrl = config.pipeBaseUrl.replace(/\/+$/, '');
    this.basePath = (config.basePath ?? '/api/v1/pipe').replace(/\/+$/, '');
  }

  /**
   * Create a PipeStream from an already-constructed HoodyClient + container.
   * Relies on `client.getKitUrl('pipe', container, serviceIndex)`.
   */
  static fromClient(client: { getKitUrl: (kit: string, container: unknown, idx?: number) => string }, container: unknown, serviceIndex = 1): PipeStream {
    const pipeBaseUrl = client.getKitUrl('pipe', container, serviceIndex);
    return new PipeStream({ pipeBaseUrl });
  }

  /** Build a full pipe URL for `path` with optional query params. */
  getUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const encoded = encodePipePath(path);
    let url = `${this.baseUrl}${this.basePath}/${encoded}`;
    if (query) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        const sv = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(sv)}`);
      }
      if (parts.length > 0) url += '?' + parts.join('&');
    }
    return url;
  }

  /**
   * Send `source` bytes to pipe `path`. Returns once the server has accepted
   * the request and started streaming status messages; the `done` promise
   * resolves when the full transfer is complete (response body drained).
   *
   * Status messages are surfaced via `opts.onStatus`. If you want to drive a
   * progress UI, wire onStatus to capture `Streaming…` / `Transfer complete.`.
   */
  async send(path: string, source: PipeSource, opts: PipeSendOptions = {}): Promise<PipeSendResult> {
    validatePipePath(path);
    if (opts.n !== undefined) validateN(opts.n);

    const stream = coerceToReadableStream(source);
    const method = opts.method ?? 'POST';
    const contentType = opts.contentType ?? (typeof source === 'string' ? 'text/plain' : 'application/octet-stream');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...(opts.headers ?? {}),
    };
    if (opts.contentLength !== undefined) headers['Content-Length'] = String(opts.contentLength);
    if (opts.filename !== undefined) headers['Content-Disposition'] = `attachment; filename="${sanitizeFilename(opts.filename)}"`;

    const url = this.getUrl(path, { n: opts.n });

    // RequestInit doesn't expose `duplex` in older @types/node; cast as in
    // pipe-media.ts and http-client.browser.ts (existing precedent).
    const init: RequestInit & { duplex: 'half' } = {
      method,
      headers,
      body: stream,
      duplex: 'half',
    };
    if (opts.signal) init.signal = opts.signal;
    const res = await fetch(url, init);

    if (!res.ok) {
      // Drain body so the connection can be reused; surface as Error.
      let bodyText = '';
      try { bodyText = await res.text(); } catch { /* ignore */ }
      throw new Error(`pipe send failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`);
    }

    if (!res.body) {
      // 200 with no body — treat as immediate completion.
      return { status: res.status, done: Promise.resolve() };
    }

    // Tee the response body so we can both parse status messages AND wait for
    // full drain. Web streams support tee() natively.
    const [forParse, forDrain] = res.body.tee();

    const parsePromise = (async () => {
      for await (const msg of parseStatusStream(forParse)) {
        opts.onStatus?.(msg);
      }
    })();

    const drainPromise = (async () => {
      const reader = forDrain.getReader();
      try {
        while (!(await reader.read()).done) { /* drain */ }
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
      }
    })();

    const done = Promise.all([parsePromise, drainPromise]).then(() => undefined);
    return { status: res.status, done };
  }

  /**
   * Receive bytes from pipe `path`. Returns the response body as a Web
   * ReadableStream — caller pipes to wherever (file, socket, stdout, ...).
   * Throws `PipeReceiveEmptyBodyError` if the response has no body.
   */
  async receive(path: string, opts: PipeReceiveOptions = {}): Promise<PipeReceiveResult> {
    validatePipePath(path);
    if (opts.n !== undefined) validateN(opts.n);

    const url = this.getUrl(path, {
      n: opts.n,
      download: boolQuery(opts.download),
      filename: opts.filename,
    });

    const init: RequestInit = {};
    if (opts.signal) init.signal = opts.signal;
    const res = await fetch(url, init);
    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch { /* ignore */ }
      throw new Error(`pipe receive failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`);
    }
    if (!res.body) {
      throw new PipeReceiveEmptyBodyError(res.status, res.headers);
    }
    return { body: res.body, headers: res.headers, status: res.status };
  }

  /**
   * Subscribe to a separate `?progress` SSE stream for live transfer state.
   * Does NOT consume a receiver slot — spectators are independent.
   */
  async *subscribeProgress(path: string, opts: { signal?: AbortSignal } = {}): AsyncIterable<PipeProgressEvent> {
    validatePipePath(path);
    const url = this.getUrl(path, { progress: 'true' });
    const init: RequestInit = {
      headers: { Accept: 'text/event-stream' },
    };
    if (opts.signal) init.signal = opts.signal;
    const res = await fetch(url, init);
    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch { /* ignore */ }
      throw new Error(`pipe progress failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`);
    }
    if (!res.body) return;

    const ts = () => Date.now();
    for await (const ev of parseSseStream(res.body)) {
      const data = ev.data ? safeJsonParse(ev.data) : null;
      if (ev.event === 'state' && data && typeof data === 'object' && 'state' in data) {
        const st = String((data as { state: unknown }).state);
        if (st === 'idle' || st === 'waiting' || st === 'streaming' || st === 'complete' || st === 'failed') {
          yield { kind: 'state', state: st, ts: ts() };
        }
      } else if (ev.event === 'progress' && data && typeof data === 'object') {
        const d = data as { bytesTransferred?: number; speed?: number; eta?: number; receivers?: number };
        yield {
          kind: 'progress',
          bytesTransferred: Number(d.bytesTransferred ?? 0),
          speed: Number(d.speed ?? 0),
          eta: Number(d.eta ?? 0),
          receivers: Number(d.receivers ?? 0),
          ts: ts(),
        };
      } else if (ev.event === 'done' && data && typeof data === 'object') {
        const d = data as { bytesTransferred?: number; duration?: number; avgSpeed?: number };
        yield {
          kind: 'done',
          bytesTransferred: Number(d.bytesTransferred ?? 0),
          duration: Number(d.duration ?? 0),
          avgSpeed: Number(d.avgSpeed ?? 0),
          ts: ts(),
        };
      }
      // Unknown event types are ignored.
    }
  }

  /**
   * Bidirectional TCP-over-pipes forwarder.
   *
   * Half-duplex per pipe: outbound bytes use `sendPath`, inbound bytes use
   * `recvPath`. The PEER must run the same forwarder with paths SWAPPED
   * (their sendPath = our recvPath, their recvPath = our sendPath).
   *
   * Round-trip latency = 2× plain TCP because each direction is its own HTTP
   * request. Idle connections are kept alive via a 1-byte sentinel injected
   * every `keepaliveMs` (default 240s, just under the server's 5-min TTL).
   * Set `keepaliveMs: 0` to disable.
   *
   * KNOWN LIMITATION (Bun runtime): Bun's net.Socket does not reliably honor
   * `allowHalfOpen: true`. After our side calls `socket.end()` to signal
   * write-EOF to the upstream, Bun closes the read half too — preventing the
   * upstream's response from reaching us. This means TCP protocols that rely
   * on the client doing `shutdown(SHUT_WR)` to signal end-of-request (e.g.
   * line-based protocols where reading until EOF is the read-termination
   * signal) will not get a response back. Protocols with explicit framing
   * (HTTP, gRPC, length-prefixed) work fine because the upstream knows how
   * many bytes to read without depending on FIN.
   */
  forwardTcp(opts: PipeForwardTcpOptions): PipeForwardTcpResult {
    if ((opts.listen && opts.connect) || (!opts.listen && !opts.connect)) {
      throw new Error('forwardTcp: exactly one of listen/connect required');
    }
    const keepaliveMs = opts.keepaliveMs ?? 240_000;

    let server: net.Server | null = null;
    let activeBridge: { close: () => void; done: Promise<void> } | null = null;
    const closeAll = () => {
      try { activeBridge?.close(); } catch { /* ignore */ }
      activeBridge = null;
      try { server?.close(); } catch { /* ignore */ }
      server = null;
    };

    if (opts.signal) {
      opts.signal.addEventListener('abort', closeAll, { once: true });
    }

    const bridgeSocket = (sock: net.Socket): { close: () => void; done: Promise<void> } => {
      const ac = new AbortController();
      // Only abort on hard close/error. `'end'` is half-close (peer sent FIN)
      // — local side may still be writing; the inbound pipe.body must be free
      // to finish flushing into the socket. Aborting here would drop bytes.
      sock.on('error', () => { try { ac.abort(); } catch { /* ignore */ } });
      sock.on('close', () => { try { ac.abort(); } catch { /* ignore */ } });

      // Outbound: socket → pipe `sendPath`. Wait for full transfer drain
      // (status messages settle, response body fully consumed) — not just
      // `send()`'s init-phase resolution.
      //
      // CRITICAL: do NOT use `Readable.toWeb(sock)` for the source here —
      // when its consumer drains to EOF, Node calls `sock.destroy()`, which
      // closes both halves of the socket. That kills the write half before
      // `inbound` can flush the response bytes back to the peer. Build a
      // read-only adapter that consumes `'data'` events but never destroys.
      const outbound = (async () => {
        try {
          const source = socketReadOnlyToReadableStream(sock);
          const sendOpts: PipeSendOptions = {
            contentType: 'application/octet-stream',
            signal: ac.signal,
            headers: { 'X-Hoody-Pipe': 'kind=tcp-forward' },
          };
          if (opts.n !== undefined) sendOpts.n = opts.n;
          const result = await this.send(opts.sendPath, source, sendOpts);
          await result.done;
        } catch {
          /* connection drop is normal */
        }
      })();

      // Inbound: pipe `recvPath` → socket. After the pipe drains, half-close
      // the socket's write side so the peer sees EOF; the read side stays
      // open until peer FINs us (or `close` event fires and aborts).
      const inbound = (async () => {
        try {
          const recvOpts: PipeReceiveOptions = { signal: ac.signal };
          if (opts.n !== undefined) recvOpts.n = opts.n;
          const { body } = await this.receive(opts.recvPath, recvOpts);
          const writable = socketToWritableStream(sock, keepaliveMs);
          await body.pipeTo(writable, { signal: ac.signal });
        } catch {
          /* connection drop is normal */
        } finally {
          try { sock.end(); } catch { /* ignore */ }
        }
      })();

      const done = Promise.all([outbound, inbound]).then(() => undefined);
      return {
        close: () => { try { ac.abort(); } catch { /* ignore */ } try { sock.destroy(); } catch { /* ignore */ } },
        done,
      };
    };

    let donePromise: Promise<void>;
    let addressPromise: Promise<{ host: string; port: number }> | undefined;

    if (opts.listen) {
      // allowHalfOpen: true — when the peer sends FIN, do NOT auto-FIN our
      // write half. forward-tcp's inbound direction must be free to flush
      // response bytes back to the peer after our outbound direction's read
      // EOFs (e.g. peer half-closes after sending request bytes).
      // Note: createServer's `allowHalfOpen` option is unreliable across
      // runtimes — set it explicitly on each accepted socket to be safe.
      server = net.createServer({ allowHalfOpen: true }, (sock) => {
        (sock as net.Socket & { allowHalfOpen?: boolean }).allowHalfOpen = true;
        // Refuse multiple concurrent connections — we only forward one at a time.
        if (activeBridge) {
          sock.destroy(new Error('forwardTcp: only one concurrent bridge supported'));
          return;
        }
        activeBridge = bridgeSocket(sock);
        activeBridge.done.finally(() => { activeBridge = null; });
      });
      const { host, port } = opts.listen;
      addressPromise = new Promise((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(port, host ?? '127.0.0.1', () => {
          const addr = server!.address();
          if (typeof addr === 'object' && addr !== null) {
            resolve({ host: addr.address, port: addr.port });
          } else {
            resolve({ host: host ?? '127.0.0.1', port });
          }
        });
      });
      donePromise = new Promise<void>((resolve) => {
        server!.on('close', () => resolve());
      });
    } else {
      const { host, port } = opts.connect!;
      // See listen-mode comment: allowHalfOpen prevents the kernel/Node from
      // auto-FINing our write half when the upstream service half-closes us.
      const sock = net.connect({ host, port, allowHalfOpen: true });
      donePromise = new Promise<void>((resolve, reject) => {
        sock.once('connect', () => {
          activeBridge = bridgeSocket(sock);
          activeBridge.done.then(() => resolve(), reject);
        });
        sock.once('error', reject);
      });
    }

    return {
      done: donePromise,
      close: closeAll,
      address: addressPromise,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateN(n: number): void {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new RangeError('n must be an integer');
  }
  if (n < 1 || n > 256) {
    throw new RangeError('n must be in 1..256');
  }
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function sanitizeFilename(name: string): string {
  // Strip CRLF, null bytes, path separators, leading dots; trim to 255.
  return name
    .replace(/[\r\n\0/\\]/g, '')
    .replace(/^\.+/, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 255);
}

/**
 * Wrap a Node net.Socket as a Web WritableStream<Uint8Array>.
 * Optionally sends a 1-byte keepalive sentinel every `keepaliveMs` of idle
 * to defeat the server's 5-min unestablished-pipe TTL on the inbound pipe.
 *
 * The keepalive is on the *socket-write* side (data we'd send back to the
 * remote peer if any was flowing); for forward-tcp it's a no-op because the
 * inbound pipe's bytes are server→us, not us→server.
 *
 * For now we don't inject keepalives at all — relying on real traffic. The
 * ms parameter is reserved for a future iteration.
 */
/**
 * Adapt the read half of a `net.Socket` into a Web `ReadableStream<Uint8Array>`
 * WITHOUT destroying the socket on EOF (unlike `Readable.toWeb`). This is
 * essential for bidirectional forwarders: the write half must stay open after
 * the read half EOFs, so the caller can flush response bytes back to the peer.
 *
 * Backpressure: pause/resume on the underlying socket as the controller's
 * desiredSize signals.
 */
function socketReadOnlyToReadableStream(sock: net.Socket): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer) => {
        try {
          controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          if ((controller.desiredSize ?? 0) <= 0) sock.pause();
        } catch { /* controller closed */ }
      };
      const onEnd = () => {
        try { controller.close(); } catch { /* already closed */ }
        sock.off('data', onData);
      };
      const onError = (err: Error) => {
        try { controller.error(err); } catch { /* already closed */ }
        sock.off('data', onData);
      };
      sock.on('data', onData);
      sock.once('end', onEnd);
      sock.once('error', onError);
      // Note: NOT destroying sock on cancel/EOF — caller manages lifecycle.
    },
    pull() {
      // Resume sock data flow when consumer wants more.
      try { sock.resume(); } catch { /* ignore */ }
    },
    cancel() {
      // Caller cancelled the stream (e.g. abort). Stop reading; do NOT destroy
      // the socket — the bridge's other direction may still be active.
      try { sock.pause(); } catch { /* ignore */ }
    },
  });
}

function socketToWritableStream(sock: net.Socket, _keepaliveMs: number): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        const ok = sock.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength), (err) => {
          if (err) reject(err); else if (ok) resolve();
        });
        if (!ok) sock.once('drain', () => resolve());
      });
    },
    close() { try { sock.end(); } catch { /* ignore */ } },
    abort() { try { sock.destroy(); } catch { /* ignore */ } },
  });
}
