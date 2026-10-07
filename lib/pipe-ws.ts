/**
 * Pipe WebSocket relay client (`GET /{name}?ws`) — browser-safe, no Node imports.
 *
 * Two peers connecting to the same name get a two-way message channel: every
 * text or binary message one sends arrives at the other as one message of the
 * same type. `openPipeDuplex()` wraps the socket as a `PipeDuplex`
 * (WHATWG WebSocketStream shape) with:
 *
 *   - kit auth on the upgrade (lib/kit-ws-auth.ts: headers in Node via the
 *     `ws` package, `?token=` / a token rule's param in browsers);
 *   - a bounded receive queue: a consumer that stops reading closes the
 *     socket with 4013 instead of growing memory;
 *   - one write = one message, ≤ 1 MiB (the kit's message cap), never split.
 *
 * The relay closes both peers with 1013 when a reader falls 2 MiB behind
 * (the kit cannot pause a sender); bulk byte streams belong on the HTTP pipe
 * or forwardTcp({ transport: 'ws' }), which flow-controls end to end.
 */

import { kitAuthForNamespace, kitAuthWebSocketParts, openWebSocketWithHeaders, refusedUpgradeStatus } from './kit-ws-auth.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { redactUrl } from './redact.js';

/** The kit's per-message cap (maxPayloadLength). */
export const PIPE_WS_MAX_MESSAGE_BYTES = 1024 * 1024;
/** write() waits while the socket holds more than this. */
const WRITE_HIGH_WATER = 1024 * 1024;
const WRITE_POLL_MS = 10;
/** Close code for a local receive-queue overflow (browser-sendable range). */
export const PIPE_WS_RECEIVE_OVERFLOW = 4013;

export interface PipeConnectOptions {
  /** Seconds the first peer waits for the second (1-3600, kit default 300). */
  wait?: number;
  /** Sec-WebSocket-Protocol offer. Both peers must agree (the kit latches the first peer's choice). */
  protocols?: string | string[];
  /** Aborting closes the socket (1000 "Aborted."), or rejects connect() before open. */
  signal?: AbortSignal;
  /** Received bytes held for a slow reader before closing with 4013. Default 4 MiB. */
  maxReceiveBytes?: number;
  /** Received messages held for a slow reader before closing with 4013. Default 4096. */
  maxReceiveMessages?: number;
}

export interface PipeDuplex {
  /** One chunk per received message: string (text) or Uint8Array (binary). */
  readable: ReadableStream<string | Uint8Array>;
  /** One write = one message. Resolves once the socket's send buffer is below 1 MiB. */
  writable: WritableStream<string | Uint8Array>;
  /** The underlying socket (global WebSocket, or the `ws` package in Node with auth headers). */
  socket: WebSocket;
  /** Resolves (never rejects) with the close code and reason. */
  closed: Promise<{ code: number; reason: string }>;
  close(code?: number, reason?: string): void;
}

/** A refused handshake, a failed connection, or a close that ended a read/write. */
export class PipeWsError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = 'PipeWsError';
  }
}

/** Shape of the kit's `?status` answer the error lookup reads. */
type StatusLike = { kind?: string | null; peers?: number | null };

export interface OpenPipeDuplexParams {
  /** ws:// or wss:// URL with `?ws`. */
  url: string;
  kitAuth?: ProxyAuth | ProxyAuthPolicy | undefined;
  options?: PipeConnectOptions;
  /** Label for errors ("pipe.connect()"). */
  label?: string;
  /** Looks up `?status` for a refused handshake whose status the socket API hides. */
  status?: () => Promise<StatusLike | null>;
}

/** http(s) → ws(s); the rest of the URL is kept. */
export function toWebSocketUrl(httpUrl: string): string {
  return httpUrl.replace(/^http(s?):/i, (_m, s: string) => `ws${s}:`);
}

function byteLength(m: string | Uint8Array): number {
  return typeof m === 'string' ? new TextEncoder().encode(m).length : m.byteLength;
}

/** Open a relay connection; resolves on the 101 (not when the peer arrives). */
export async function openPipeDuplex(p: OpenPipeDuplexParams): Promise<PipeDuplex> {
  const opts = p.options ?? {};
  const label = p.label ?? 'pipe.connect()';
  const maxBytes = opts.maxReceiveBytes ?? 4 * 1024 * 1024;
  const maxMessages = opts.maxReceiveMessages ?? 4096;
  if (opts.signal?.aborted) throw opts.signal.reason ?? new PipeWsError(`${label}: aborted`);

  const parts = kitAuthWebSocketParts(p.url, kitAuthForNamespace(p.kitAuth, 'pipe'), label);
  const shownUrl = redactUrl(parts.url, parts.credentialQueryParams);
  // Outside a browser the `ws` package is used even without a credential, so a refusal has its status.
  const socket = await openWebSocketWithHeaders<WebSocket>(parts.url, opts.protocols, parts.headers, label, { refusalStatus: true });
  socket.binaryType = 'arraybuffer';

  // ── receive side: bounded queue drained by pull() ──
  const queue: (string | Uint8Array)[] = [];
  let queuedBytes = 0;
  let eof = false;                       // normal remote close: deliver the queue, then close
  let failure: PipeWsError | null = null;
  let waitingPull: (() => void) | null = null;
  const wake = () => { const w = waitingPull; waitingPull = null; w?.(); };

  const readable = new ReadableStream<string | Uint8Array>({
    async pull(c) {
      while (queue.length === 0 && !eof && failure === null) {
        await new Promise<void>((r) => { waitingPull = r; });
      }
      if (failure !== null) { c.error(failure); return; }
      const m = queue.shift();
      if (m !== undefined) {
        queuedBytes -= byteLength(m);
        c.enqueue(m);
        return;
      }
      if (eof) c.close();
    },
    cancel() {
      queue.length = 0;
      queuedBytes = 0;
      closeSocket(1000, '');
    },
  }, { highWaterMark: 0 });

  // ── write side ──
  const pendingWrites = new Set<(e: PipeWsError | null) => void>();   // null: the data left, resolve
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let closedInfo: { code: number; reason: string } | null = null;
  let localClosing = false;               // close() / cancel / abort started: no more writes

  const writable = new WritableStream<string | Uint8Array>({
    write(chunk, controller) {
      if (closedInfo) throw new PipeWsError(`${label}: socket closed (${closedInfo.code})`, undefined, closedInfo.code, closedInfo.reason);
      // The socket API drops a send() on a closing socket without an error.
      if (localClosing || socket.readyState !== 1) throw new PipeWsError(`${label}: socket is closing`);
      const len = byteLength(chunk);
      if (len > PIPE_WS_MAX_MESSAGE_BYTES) {
        // Splitting would change message boundaries; the kit would drop it.
        throw new RangeError(`${label}: message of ${len} bytes is over the 1 MiB limit`);
      }
      socket.send(chunk);
      if (socket.bufferedAmount < WRITE_HIGH_WATER) return;
      return new Promise<void>((resolve, reject) => {
        // writable.abort() waits for this write; the controller's signal ends it.
        const signal = (controller as { signal?: AbortSignal } | undefined)?.signal;
        const onAbort = () => {
          fail(new PipeWsError(`${label}: write aborted`));
          closeSocket(1000, '');
        };
        const fail = (e: PipeWsError | null) => {
          pendingWrites.delete(fail);
          signal?.removeEventListener('abort', onAbort);
          if (e) reject(e); else resolve();
        };
        pendingWrites.add(fail);
        signal?.addEventListener('abort', onAbort, { once: true });
        const poll = () => {
          pollTimer = null;
          if (!pendingWrites.has(fail)) return;
          if (socket.bufferedAmount < WRITE_HIGH_WATER) {
            pendingWrites.delete(fail);
            signal?.removeEventListener('abort', onAbort);
            resolve();
            return;
          }
          pollTimer = setTimeout(poll, WRITE_POLL_MS);
        };
        pollTimer = setTimeout(poll, WRITE_POLL_MS);
      });
    },
    close() { closeSocket(1000, ''); },
    abort() { closeSocket(1000, ''); },
  });

  let resolveClosed!: (v: { code: number; reason: string }) => void;
  const closed = new Promise<{ code: number; reason: string }>((r) => { resolveClosed = r; });

  function closeSocket(code: number, reason: string): void {
    if (!localClosing) {
      localClosing = true;
      if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
      const err = new PipeWsError(`${label}: socket closed locally`, undefined, code, reason);
      for (const fail of [...pendingWrites]) fail(err);
    }
    try { socket.close(code, reason); } catch { /* already closing */ }
  }

  socket.addEventListener('message', (ev: MessageEvent) => {
    if (failure !== null || eof) return;
    const d = ev.data as unknown;
    const m: string | Uint8Array = typeof d === 'string'
      ? d
      : d instanceof ArrayBuffer ? new Uint8Array(d)
      : new Uint8Array((d as ArrayBufferView).buffer, (d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteLength);
    const len = byteLength(m);
    if (queuedBytes + len > maxBytes || queue.length + 1 > maxMessages) {
      queue.length = 0;
      queuedBytes = 0;
      failure = new PipeWsError(`${label}: receive buffer full (the reader is too slow)`, undefined, PIPE_WS_RECEIVE_OVERFLOW);
      closeSocket(PIPE_WS_RECEIVE_OVERFLOW, 'Receive buffer full: the reader is too slow.');
      wake();
      return;
    }
    queue.push(m);
    queuedBytes += len;
    wake();
  });

  socket.addEventListener('close', (ev: CloseEvent) => {
    closedInfo = { code: ev.code, reason: ev.reason };
    if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
    const err = new PipeWsError(`${label}: socket closed (${ev.code}${ev.reason ? ` ${ev.reason}` : ''})`, undefined, ev.code, ev.reason);
    // A write waiting on the drain poll whose bytes all left before the close
    // was sent (the peer may close as soon as it has read them); one still
    // buffered was not. A local close() rejected its writes already.
    const flushed = socket.bufferedAmount === 0;
    for (const fail of [...pendingWrites]) fail(flushed ? null : err);
    if (failure === null) {
      if (ev.code === 1000 || ev.code === 1001) {
        eof = true;               // pulls drain what is queued, then close
      } else {
        failure = err;
        queue.length = 0;
        queuedBytes = 0;
      }
    }
    wake();
    resolveClosed(closedInfo);
  });

  // ── open / refuse ──
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      closeSocket(1000, 'Aborted.');
      reject(opts.signal?.reason ?? new PipeWsError(`${label}: aborted`));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      resolve();
    });
    const refused = (ev: Event) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      // Node's `ws` names the status in its error, Bun's reports it to the opener; the browser API hides it.
      const msg = String((ev as { message?: string }).message ?? '');
      const m = /Unexpected server response: (\d{3})/.exec(msg);
      const status = m ? Number(m[1]) : refusedUpgradeStatus(socket);
      explainRefusal(status).then(
        (why) => reject(new PipeWsError(`${label}: ${shownUrl} refused: ${why}`, status)),
        () => reject(new PipeWsError(`${label}: ${shownUrl} refused`, status)),
      );
    };
    socket.addEventListener('error', refused);
    socket.addEventListener('close', refused);   // Bun's refusal with a recorded status has no `error`
    // An abort while the socket was being created fired before onAbort existed.
    if (opts.signal?.aborted) onAbort();
    // So may the socket's own open or failure (it is created by an async helper).
    else if (socket.readyState === 1) { settled = true; opts.signal?.removeEventListener('abort', onAbort); resolve(); }
    else if (socket.readyState === 3) refused(new Event('close'));
  });

  async function explainRefusal(status: number | undefined): Promise<string> {
    if (status === 409 || status === undefined) {
      // Bounded: a refused upgrade must not wait on a server that never answers.
      const st = p.status
        ? await Promise.race([p.status().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))])
        : null;
      if (st?.kind === 'ws' && st.peers === 2) return 'the name already has two peers';
      if (st?.kind && st.kind !== 'ws') return `the name is in use by an HTTP ${st.kind === 'live' ? 'live stream' : 'transfer'}`;
      if (status === 409) return 'conflict (busy name or subprotocol mismatch)';
    }
    if (status === 429) return 'too many WebSocket pairs on the server';
    if (status === 403) return 'forbidden (Source IP Guard or edge permission)';
    if (status !== undefined) return `HTTP ${status}`;
    return 'refused (Source IP Guard, capacity, subprotocol or edge)';
  }

  // An abort between the open and this line reached neither listener.
  if (opts.signal?.aborted) {
    closeSocket(1000, 'Aborted.');
    throw opts.signal.reason ?? new PipeWsError(`${label}: aborted`);
  }
  // The caller's signal may outlive this session (one shutdown signal for many):
  // its listener goes once the socket has closed, however it closed.
  const onSessionAbort = () => closeSocket(1000, 'Aborted.');
  opts.signal?.addEventListener('abort', onSessionAbort, { once: true });
  void closed.then(() => opts.signal?.removeEventListener('abort', onSessionAbort));

  return {
    readable,
    writable,
    socket,
    closed,
    close: (code = 1000, reason = '') => closeSocket(code, reason),
  };
}
