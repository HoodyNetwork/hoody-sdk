/**
 * Pipe Browser — browser data transfer through the Hoody Pipe service.
 *
 * The browser counterpart of PipeStream (lib/pipe-stream.ts, which is
 * Node-only):
 *
 *   const pipe = PipeBrowser.fromClient(client, container);
 *   await pipe.sendFile('report', file, { onProgress: (p) => show(p.loaded / p.total) });
 *   const { body } = await pipe.receive('report');        // a ReadableStream
 *   pipe.download('report');                               // the browser's download manager
 *   for await (const ev of pipe.subscribeProgress('report')) { ... }
 *   pipe.openPage('receive', 'report', { autostart: true }); // the kit's own receive page
 *
 * sendFile uploads with XMLHttpRequest, for real upload progress. A
 * PipeBrowser built with a transport (fromClient on a HoodyClient, or
 * `config.transport`) sends through it instead, because XHR cannot carry the
 * client's kitAuth or injected fetch; its progress then comes from the
 * server's ?progress events (bytes forwarded to the receivers).
 *
 * Browser-only (XMLHttpRequest, document) and free of Node imports. Not
 * exported from the Node.js entry point (lib/index.ts).
 */

import { globalFetchPipeTransport, pipeTransportFromClient, type PipeTransport } from './pipe-transport.js';
import { parseSseStream, type SseEvent } from './sse-stream.js';
import { clientKitAuth } from './kit-ws-auth.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { openPipeDuplex, toWebSocketUrl, type PipeConnectOptions, type PipeDuplex } from './pipe-ws.js';
import { PipeTransferError, StatusLines, checkTransferId, errorText, pipeContentDisposition, safeCall, type PipeStatusMessage } from './pipe-status.js';
import type { PipeStatus } from './pipe-stream.js';
export type { PipeStatus };
import {
  buildPipePageUrl,
  encodePipeName,
  openPipePage,
  refuseReservedPipeName,
  withCacheBuster,
  type PipeOpenPageOptions,
  type PipePage,
  type PipePageOptionsMap,
} from './pipe-media.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipeBrowserConfig {
  /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
  pipeBaseUrl: string;
  /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
  basePath?: string;
  /**
   * Sends every request, sendFile's upload included. `fromClient()` supplies
   * the client's transport (injected fetch + kitAuth). Omitted, receive and
   * subscribeProgress use the global `fetch` and sendFile uses XMLHttpRequest.
   */
  transport?: PipeTransport;
  /**
   * Kit credential for connect()'s WebSocket upgrade. A browser socket cannot
   * send headers: a token rule's `param` (or `?token=`) carries it; a
   * containerClaim credential is refused. `fromClient()` takes the client's.
   */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
}

/** What sendFile sends. A File's name becomes the download name unless `filename` says otherwise. */
export type PipeSendData = Blob | string | ArrayBuffer | ArrayBufferView;

export { PipeTransferError, type PipeStatusMessage };

export interface PipeUploadProgress {
  /** Bytes sent so far. */
  loaded: number;
  /** Bytes in total. */
  total: number;
}

export interface PipeSendFileOptions {
  /** Receivers the transfer waits for (1-256). */
  n?: number;
  /** Download name for the receivers (Content-Disposition). Default: the File's name; `null` sends none. */
  filename?: string | null;
  /** Content-Type. Default: the Blob's type, `text/plain; charset=utf-8` for a string, else application/octet-stream. */
  contentType?: string;
  /** This transfer's id (`?transfer=`, 16-64 characters of A-Z a-z 0-9 `_` `-`); the kit refuses one in use (409). */
  transfer?: string;
  /** Upload progress. */
  onProgress?: (progress: PipeUploadProgress) => void;
  /** Each status line of the sender's response, as it arrives. */
  onStatus?: (message: PipeStatusMessage) => void;
  /** Cancels the upload; the transfer then fails for its receivers. */
  signal?: AbortSignal;
}

export interface PipeSendFileResult {
  /** HTTP status of the upload. */
  status: number;
  /** Bytes sent. */
  bytes: number;
  /** Every status line of the sender's response. */
  messages: PipeStatusMessage[];
}

export interface PipeReceiveOptions {
  /** Receivers the transfer waits for; must match the sender (1-256). */
  n?: number;
  /** Watch a live stream (`?live`) from now on; not with `n` above 1. */
  live?: boolean;
  signal?: AbortSignal;
}

/** Same shape as PipeStream's receive result. */
export interface PipeReceiveResult {
  /** The sender's bytes, streamed. */
  body: ReadableStream<Uint8Array>;
  /** Forwarded headers (Content-Type, Content-Length, Content-Disposition, X-Piping, X-Hoody-Pipe). */
  headers: Headers;
  status: number;
}

export interface PipeDownloadOptions {
  /** Receivers the transfer waits for; must match the sender (1-256). */
  n?: number;
  /** Download name (the server's `?filename`). */
  filename?: string;
}

export interface PipeDownload {
  /** The `?download` URL the browser receives from. */
  readonly url: string;
  /** The hidden iframe that started it. */
  readonly frame: HTMLIFrameElement;
  /**
   * Remove the iframe. Before the sender arrives this cancels the receive;
   * once the download manager has the file it keeps downloading.
   */
  remove(): void;
}

/** A `?progress` event: what PipeStream.subscribeProgress yields for the same stream, with every field set (the Node type leaves the fields added for #891 optional so older event literals still compile). */
export type PipeProgressEvent =
  | {
      kind: 'state';
      state: 'idle' | 'waiting' | 'streaming' | 'complete' | 'failed';
      ts: number;
      hasSender: boolean;
      activeReceivers: number;
      /** null on a live stream (no `n`). */
      totalReceivers: number | null;
      /** A live stream (`?live`): `activeReceivers` are the viewers watching now. */
      live: boolean;
    }
  | {
      kind: 'progress';
      bytesTransferred: number;
      speed: number;
      eta: number;
      receivers: number;
      ts: number;
      /** From the sender's Content-Length; null when it sent none. */
      totalBytes: number | null;
      elapsed: number;
      /** A live stream (`?live`): `receivers` are the viewers watching now. */
      live: boolean;
    }
  | {
      kind: 'done';
      bytesTransferred: number;
      duration: number;
      avgSpeed: number;
      ts: number;
      state: 'complete' | 'failed';
      reason?: string;
      /** SHA-256 of a completed `sha256` transfer; absent otherwise. */
      sha256?: string;
      /** The transfer's id; absent for a WebSocket pair, a live stream or an older kit. */
      transferId?: string;
    };

// ---------------------------------------------------------------------------
// PipeBrowser class
// ---------------------------------------------------------------------------

export class PipeBrowser {
  private readonly baseUrl: string;
  private readonly basePath: string;
  private readonly transport: PipeTransport;
  /** Whether a transport was supplied: sendFile then uses it, not XHR. */
  private readonly hasTransport: boolean;

  constructor(config: PipeBrowserConfig) {
    this.baseUrl = config.pipeBaseUrl.replace(/\/+$/, '');
    this.basePath = (config.basePath ?? '/api/v1/pipe').replace(/\/+$/, '');
    this.hasTransport = config.transport !== undefined;
    this.transport = config.transport ?? globalFetchPipeTransport();
    this.kitAuth = config.kitAuth;
  }

  private readonly kitAuth: ProxyAuth | ProxyAuthPolicy | undefined;

  /** `wss://…/{name}?ws[&wait=]` — the relay URL for `name` (no credential in it). */
  getWsUrl(name: string, opts: { wait?: number | undefined } = {}): string {
    return `${toWebSocketUrl(this.getUrl(name))}?ws${opts.wait !== undefined ? `&wait=${encodeURIComponent(String(opts.wait))}` : ''}`;
  }

  /**
   * Open a WebSocket relay connection on `name` (see PipeStream.connect).
   * A refused handshake is looked up on `?status` for its reason, because
   * the browser hides the HTTP status.
   */
  async connect(name: string, opts: PipeConnectOptions = {}): Promise<PipeDuplex> {
    return openPipeDuplex({
      url: this.getWsUrl(name, { wait: opts.wait }),
      kitAuth: this.kitAuth,
      options: opts,
      label: 'PipeBrowser.connect()',
      status: async () => {
        const res = await this.transport('GET', `${this.getUrl(name)}?status`, {});
        return res.ok ? (await res.json()) as { kind?: string | null; peers?: number | null } : null;
      },
    });
  }

  /**
   * Create a PipeBrowser from a HoodyClient + container: resolves the pipe kit
   * URL and sends through `client.http`, so the client's injected transport
   * and kitAuth apply (lib/pipe-transport.ts).
   */
  static fromClient(client: any, container: any, serviceIndex = 1): PipeBrowser {
    const pipeBaseUrl = client.getKitUrl('pipe', container, serviceIndex);
    const transport = pipeTransportFromClient(client);
    const kitAuth = clientKitAuth(client);
    return new PipeBrowser({ pipeBaseUrl, ...(transport ? { transport } : {}), ...(kitAuth ? { kitAuth } : {}) });
  }

  /** Full pipe URL for a name; each segment percent-encoded, a reserved name refused (see PipeMedia.getUrl). */
  getUrl(path: string): string {
    const encoded = encodePipeName(path);
    refuseReservedPipeName(path);
    return `${this.baseUrl}${this.basePath}/${encoded}`;
  }

  /** URL of one of the kit's browser pages, settings pre-filled. See PipeMedia.getPageUrl. */
  getPageUrl<P extends PipePage>(page: P, name?: string, options?: PipePageOptionsMap[P]): string {
    return buildPipePageUrl(`${this.baseUrl}${this.basePath}`, page, name, options);
  }

  /** Open a page with window.open. See PipeMedia.openPage. */
  openPage<P extends PipePage>(
    page: P,
    name?: string,
    options?: PipePageOptionsMap[P],
    open?: PipeOpenPageOptions,
  ): Window | null {
    return openPipePage(this.getPageUrl(page, name, options), open);
  }

  // -------------------------------------------------------------------------
  // Send
  // -------------------------------------------------------------------------

  /**
   * Send a File, Blob, string or bytes to pipe `path`. Resolves when the
   * server reports `Transfer complete.` (every receiver has the data).
   * Rejects with PipeTransferError on an `[ERROR]` line, a refused request,
   * a transfer the receivers left, or a response that ends without
   * completing; with an AbortError when `signal` aborts. With a client
   * transport, a refused request throws the client's ApiError.
   */
  async sendFile(path: string, data: PipeSendData, opts: PipeSendFileOptions = {}): Promise<PipeSendFileResult> {
    const n = checkedN(opts.n);
    const blob = toBlob(data);
    const filename = opts.filename === undefined
      ? (typeof File !== 'undefined' && data instanceof File ? data.name : undefined)
      : (opts.filename ?? undefined);
    const headers: Record<string, string> = {
      'Content-Type': opts.contentType ?? (blob.type || 'application/octet-stream'),
    };
    if (filename) headers['Content-Disposition'] = pipeContentDisposition(filename);
    const query = [
      ...(n > 1 ? [`n=${n}`] : []),
      ...(opts.transfer !== undefined ? [`transfer=${checkTransferId(opts.transfer)}`] : []),
    ];
    const url = this.getUrl(path) + (query.length > 0 ? `?${query.join('&')}` : '');
    if (opts.signal?.aborted) throw abortReason(opts.signal);
    return this.hasTransport
      ? this.sendThroughTransport(path, url, blob, headers, opts)
      : this.sendThroughXhr(url, blob, headers, opts);
  }

  private sendThroughXhr(
    url: string,
    blob: Blob,
    headers: Record<string, string>,
    opts: PipeSendFileOptions,
  ): Promise<PipeSendFileResult> {
    const Xhr = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
    if (typeof Xhr !== 'function') {
      return Promise.reject(new Error('sendFile needs XMLHttpRequest (a browser) or a transport'));
    }
    return new Promise<PipeSendFileResult>((resolve, reject) => {
      const xhr = new Xhr();
      const status = new StatusLines(opts.onStatus);
      let settled = false;
      const onAbort = () => xhr.abort();
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        opts.signal?.removeEventListener('abort', onAbort);
        xhr.upload.onprogress = null;
        xhr.onprogress = xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
        if (error !== undefined) reject(error);
        else resolve({ status: xhr.status, bytes: blob.size, messages: status.messages });
      };

      xhr.open('POST', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      if (opts.onProgress) {
        const onProgress = opts.onProgress;
        xhr.upload.onprogress = (e) => {
          safeCall(onProgress, { loaded: e.loaded, total: e.lengthComputable ? e.total : blob.size });
        };
      }
      // The response streams status lines while the transfer runs.
      xhr.onprogress = () => status.feed(xhr.responseText, false);
      xhr.onload = () => {
        status.feed(xhr.responseText, true);
        settle(status.failure(xhr.status, 'pipe send'));
      };
      xhr.onerror = () => settle(new PipeTransferError('pipe send failed: network error', 0, status.messages));
      xhr.ontimeout = () => settle(new PipeTransferError('pipe send failed: timed out', 0, status.messages));
      xhr.onabort = () => settle(opts.signal?.aborted ? abortReason(opts.signal) : new PipeTransferError('pipe send aborted', 0, status.messages));
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      xhr.send(blob);
    });
  }

  private async sendThroughTransport(
    path: string,
    url: string,
    blob: Blob,
    headers: Record<string, string>,
    opts: PipeSendFileOptions,
  ): Promise<PipeSendFileResult> {
    // Progress from the ?progress spectator: a transport gives no upload events.
    const watch = new AbortController();
    if (opts.onProgress) {
      const onProgress = opts.onProgress;
      void (async () => {
        try {
          for await (const ev of this.subscribeProgress(path, { signal: watch.signal })) {
            if (ev.kind === 'progress') safeCall(onProgress, { loaded: Math.min(ev.bytesTransferred, blob.size), total: blob.size });
          }
        } catch {
          // Progress is best effort; the upload's own outcome decides.
        }
      })();
    }
    try {
      const res = await this.transport('POST', url, {
        headers,
        body: blob,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      const status = new StatusLines(opts.onStatus);
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        let ended = false;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            status.feed(text, false);
          }
          ended = true;
        } catch (err) {
          if (opts.signal?.aborted) throw abortReason(opts.signal);
          throw new PipeTransferError(`pipe send failed: ${errorText(err)}`, res.status, status.messages);
        } finally {
          // A read that failed leaves the response open: cancel it, then unlock.
          if (!ended) void reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        status.feed(text + decoder.decode(), true);
      }
      const failure = status.failure(res.status, 'pipe send');
      if (failure) throw failure;
      if (opts.onProgress) safeCall(opts.onProgress, { loaded: blob.size, total: blob.size });
      return { status: res.status, bytes: blob.size, messages: status.messages };
    } finally {
      watch.abort();
    }
  }

  // -------------------------------------------------------------------------
  // Receive
  // -------------------------------------------------------------------------

  /**
   * Receive from pipe `path` as a stream. Resolves when the sender arrives
   * (the response headers wait for it). Throws PipeTransferError on a refused
   * receive (with the client transport, its ApiError).
   */
  async receive(path: string, opts: PipeReceiveOptions = {}): Promise<PipeReceiveResult> {
    const n = checkedN(opts.n);
    if (opts.live === true && n > 1) throw new RangeError('pipe receive: live cannot be combined with n above 1');
    const url = this.getUrl(path) + (opts.live === true ? '?live' : n > 1 ? `?n=${n}` : '');
    const res = await this.receiveGet(url, opts.signal);
    if (!res.ok) throw await responseError('pipe receive', res);
    if (!res.body) throw new PipeTransferError(`pipe receive returned status ${res.status} with no body`, res.status);
    return { body: res.body, headers: res.headers, status: res.status };
  }

  /**
   * `?status` of `path`: one JSON snapshot, no receiver slot. With `transfer`
   * (a receiver's `X-Hoody-Pipe-Transfer-Id`), the state of that transfer:
   * a `?sha256` transfer stays readable 10 minutes after it ends. Throws
   * PipeTransferError on a refused request (404 for an unknown or expired id).
   */
  async status(path: string, opts: { transfer?: string; signal?: AbortSignal } = {}): Promise<PipeStatus> {
    const q = opts.transfer !== undefined ? `?status&transfer=${encodeURIComponent(opts.transfer)}` : '?status';
    const res = await this.receiveGet(this.getUrl(path) + q, opts.signal);
    if (!res.ok) throw await responseError('pipe status', res);
    return (await res.json()) as PipeStatus;
  }

  /**
   * A GET that the browser's HTTP cache neither answers nor holds: Chromium
   * keeps a second GET of an identical URL waiting behind the first (about
   * 20 s), which stalled two tabs receiving one n>1 transfer. A supplied
   * transport may not honour `cache`, so its URL also gets a unique `_=`.
   */
  private receiveGet(url: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<Response> {
    return this.transport('GET', this.hasTransport ? withCacheBuster(url) : url, {
      ...(headers ? { headers } : {}),
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
  }

  /**
   * The `?download` URL for pipe `path`: a link the browser saves to disk.
   * Each call adds a unique `_=` (the kit ignores it), so two downloads of the
   * same pipe in one browser never wait on each other in its HTTP cache.
   */
  getDownloadUrl(path: string, opts: PipeDownloadOptions = {}): string {
    const n = checkedN(opts.n);
    let url = `${this.getUrl(path)}?download`;
    if (n > 1) url += `&n=${n}`;
    if (opts.filename) url += `&filename=${encodeURIComponent(opts.filename)}`;
    return withCacheBuster(url);
  }

  /**
   * Receive pipe `path` with the browser's download manager, so a file of any
   * size streams to disk: a hidden iframe opens the `?download` URL. The
   * download starts when the sender arrives. A browser navigation carries no
   * kitAuth headers: on a permission-guarded pipe use receive().
   */
  download(path: string, opts: PipeDownloadOptions = {}): PipeDownload {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc?.body) throw new Error('download needs a browser document');
    const url = this.getDownloadUrl(path, opts);
    const frame = doc.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.src = url;
    doc.body.appendChild(frame);
    return { url, frame, remove: () => frame.remove() };
  }

  // -------------------------------------------------------------------------
  // Progress
  // -------------------------------------------------------------------------

  /**
   * Live transfer progress of pipe `path` from its `?progress` event stream.
   * Uses no receiver slot. Ends after the `done` event, or with no event when
   * the path's transfer has just ended (the server answers 204). Breaking out
   * of the loop, or aborting `signal`, closes the connection.
   */
  async *subscribeProgress(path: string, opts: { signal?: AbortSignal } = {}): AsyncIterable<PipeProgressEvent> {
    const res = await this.receiveGet(`${this.getUrl(path)}?progress`, opts.signal, { Accept: 'text/event-stream' });
    if (!res.ok) throw await responseError('pipe progress', res);
    if (!res.body) return;
    try {
      for await (const ev of parseSseStream(res.body)) {
        const mapped = toProgressEvent(ev);
        if (mapped) yield mapped;
      }
    } finally {
      // parseSseStream released its reader; close the connection.
      void res.body.cancel().catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map one `?progress` SSE event to a PipeProgressEvent; unknown events give null. */
export function toProgressEvent(ev: SseEvent): PipeProgressEvent | null {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(ev.data);
    if (!parsed || typeof parsed !== 'object') return null;
    data = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const ts = Date.now();
  if (ev.event === 'state') {
    const state = String(data.state);
    if (state !== 'idle' && state !== 'waiting' && state !== 'streaming' && state !== 'complete' && state !== 'failed') return null;
    return {
      kind: 'state',
      state,
      ts,
      hasSender: data.hasSender === true,
      activeReceivers: num(data.activeReceivers),
      // A live stream has no `n` (null); an older kit that sends none reads 0.
      totalReceivers: data.totalReceivers === null ? null : num(data.totalReceivers),
      live: data.live === true,
    };
  }
  if (ev.event === 'progress') {
    return {
      kind: 'progress',
      bytesTransferred: num(data.bytesTransferred),
      speed: num(data.speed),
      eta: num(data.eta),
      receivers: num(data.activeReceivers ?? data.receivers),
      ts,
      totalBytes: typeof data.totalBytes === 'number' ? data.totalBytes : null,
      elapsed: num(data.elapsed),
      live: data.live === true,
    };
  }
  if (ev.event === 'done') {
    return {
      kind: 'done',
      bytesTransferred: num(data.bytesTransferred),
      duration: num(data.duration),
      avgSpeed: num(data.avgSpeed),
      ts,
      state: data.state === 'failed' ? 'failed' : 'complete',
      ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
      ...(typeof data.sha256 === 'string' ? { sha256: data.sha256 } : {}),
      ...(typeof data.transferId === 'string' ? { transferId: data.transferId } : {}),
    };
  }
  return null;
}

/** A PipeTransferError from a non-2xx response, with the server's `[ERROR]` text. */
async function responseError(what: string, res: Response): Promise<PipeTransferError> {
  let text = '';
  try { text = await res.text(); } catch { /* no body */ }
  const lines = new StatusLines();
  lines.feed(text, true);
  const error = lines.messages.find((m) => m.level === 'error');
  return new PipeTransferError(error ? error.message : `${what} failed: HTTP ${res.status}`, res.status, lines.messages);
}

function checkedN(n: number | undefined): number {
  if (n === undefined) return 1;
  if (!Number.isInteger(n) || n < 1 || n > 256) throw new RangeError(`n must be an integer from 1 to 256 (got ${n})`);
  return n;
}

function toBlob(data: PipeSendData): Blob {
  if (data instanceof Blob) return data;
  if (typeof data === 'string') return new Blob([data], { type: 'text/plain;charset=utf-8' });
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data as BlobPart]);
  throw new TypeError('sendFile sends a File, Blob, string, ArrayBuffer or typed array');
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

