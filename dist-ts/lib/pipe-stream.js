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
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseSseStream } from './sse-stream.js';
import { PipeTransferError, checkTransferId, pipeContentDisposition, reservedPipePath, transferFailure } from './pipe-status.js';
import { globalFetchPipeTransport, pipeTransportFromClient } from './pipe-transport.js';
import { clientKitAuth, kitAuthForNamespace, kitAuthWebSocketParts, openWebSocketWithHeaders } from './kit-ws-auth.js';
import { openPipeDuplex, toWebSocketUrl } from './pipe-ws.js';
import { bridgeTcpOverWs } from './pipe-ws-forward.js';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export { PipeTransferError };
/** A `sha256` receive that could not be verified. */
export class PipeIntegrityError extends Error {
    kind;
    expected;
    actual;
    transferId;
    constructor(
    /** `mismatch`: digests differ; `unavailable`: the kit has no digest for the transfer; `incomplete`: the body was not read to the end. */
    kind, message, 
    /** The kit's digest, when it gave one. */
    expected, 
    /** The digest of the bytes read, when they were all read. */
    actual, transferId) {
        super(message);
        this.kind = kind;
        this.expected = expected;
        this.actual = actual;
        this.transferId = transferId;
        this.name = 'PipeIntegrityError';
    }
}
// Public custom error so callers can detect bodyless responses.
export class PipeReceiveEmptyBodyError extends Error {
    status;
    headers;
    constructor(status, headers) {
        super(`Pipe receive returned status ${status} with no body`);
        this.status = status;
        this.headers = headers;
        this.name = 'PipeReceiveEmptyBodyError';
    }
}
// ---------------------------------------------------------------------------
// URL building (shared with pipe-media.ts in spirit; not extracted yet)
// ---------------------------------------------------------------------------
/**
 * A path segment a URL parser resolves as "stay here" / "go up".
 *
 * Checked AFTER percent-decoding, because `%2e%2e` decodes to `..` and WHATWG
 * `URL` normalises it exactly like the literal form — rejecting only the literal
 * spelling leaves the encoded bypass open.
 */
function isPipeDotSegment(segment) {
    if (segment === '.' || segment === '..')
        return true;
    let decoded;
    try {
        decoded = decodeURIComponent(segment);
    }
    catch {
        // Malformed escape cannot decode to a dot segment, so it is not one.
        return false;
    }
    return decoded === '.' || decoded === '..';
}
/**
 * Encode a pipe path that may contain `/` separators. Each segment is
 * percent-encoded individually; literal `/` is preserved as a separator
 * (the server's router treats `/api/v1/pipe/<rest>` segment-wise).
 *
 * Preserving separators means a caller-supplied value can introduce new path
 * segments, so `.` and `..` are REFUSED rather than interpolated. Without that,
 * a pipe path walks straight out of its own route — measured:
 *
 *     getUrl('../../x')      ->  /api/v1/pipe/../../x      ->  /api/x
 *     getUrl('..')           ->  /api/v1/pipe/..           ->  /api/v1/
 *     getUrl('a/../../b')    ->                            ->  /api/v1/b
 *
 * and the request still carries the caller's bearer token. `validatePipePath`
 * does NOT cover this — it checks only length and a reserved-name set.
 *
 * Keep this rule identical to `PipeMediaClient.getUrl` in pipe-media.ts, which
 * inlines it because importing from this module pulls node:net/fs into the
 * browser bundle.
 */
export function encodePipePath(path) {
    if (!path)
        return '';
    return path
        .split('/')
        .map(segment => {
        if (isPipeDotSegment(segment)) {
            throw new Error(`Invalid pipe path: "${path}" contains a "${segment}" path segment. ` +
                'Relative segments are not allowed because they change which endpoint is called.');
        }
        return encodeURIComponent(segment);
    })
        .join('/');
}
/** Strict client-side path validation — fail before wire round-trip. */
export function validatePipePath(path) {
    if (typeof path !== 'string' || path.length === 0) {
        throw new TypeError('pipe path must be a non-empty string');
    }
    if (path.length > 1024) {
        throw new RangeError('pipe path must be <= 1024 characters');
    }
    // Relative segments change WHICH endpoint is called, so a path carrying one is
    // never valid. Checked here as well as in encodePipePath: this function is the
    // documented "strict validation" entry point and callers reasonably expect it to
    // be the thing that catches a bad path, but it used to pass `../../admin`
    // untouched — length and reserved-name checks cannot see a traversal.
    for (const segment of path.split('/')) {
        if (isPipeDotSegment(segment)) {
            throw new Error(`pipe path "${path}" contains a "${segment}" path segment; relative segments are not allowed`);
        }
    }
    refuseReservedPipePath(path);
}
/** Names the kit answers itself (its pages, health, metrics), by the kit's own matching rule. */
function refuseReservedPipePath(path) {
    if (reservedPipePath(path) !== null) {
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
export function coerceToReadableStream(source) {
    // string → encode UTF-8 once, single-chunk stream (no Blob wrapper)
    if (typeof source === 'string') {
        const bytes = new TextEncoder().encode(source);
        return new ReadableStream({
            start(controller) {
                if (bytes.byteLength > 0)
                    controller.enqueue(bytes);
                controller.close();
            },
        });
    }
    // Buffer / Uint8Array
    if (source instanceof Uint8Array) {
        const bytes = source;
        return new ReadableStream({
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
        return source;
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
        const { host, port } = source.tcp;
        const sock = net.connect({ host, port });
        return nodeReadableToWeb(sock);
    }
    // {unix: '/path'} → net.connect → web stream (read half)
    if (typeof source === 'object' && source !== null && 'unix' in source) {
        const sock = net.connect({ path: source.unix });
        return nodeReadableToWeb(sock);
    }
    // Node Readable (fs read stream, child stdout, etc.)
    if (typeof source.pipe === 'function'
        && typeof source.on === 'function') {
        return nodeReadableToWeb(source);
    }
    // AsyncIterable — convert via ReadableStream.from (Node 22.x stable)
    if (typeof source[Symbol.asyncIterator] === 'function') {
        // ReadableStream.from coerces strings/Buffers per chunk; normalize each yield.
        const it = source[Symbol.asyncIterator]();
        return new ReadableStream({
            async pull(controller) {
                try {
                    const r = await it.next();
                    if (r.done) {
                        controller.close();
                        return;
                    }
                    const v = r.value;
                    if (v == null)
                        return;
                    if (typeof v === 'string') {
                        controller.enqueue(new TextEncoder().encode(v));
                    }
                    else if (v instanceof Uint8Array) {
                        controller.enqueue(v);
                    }
                    else {
                        controller.enqueue(new Uint8Array(v));
                    }
                }
                catch (err) {
                    controller.error(err);
                }
            },
            async cancel(reason) {
                if (typeof it.return === 'function') {
                    try {
                        await it.return(reason);
                    }
                    catch { /* ignore */ }
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
function nodeReadableToWeb(ns) {
    // node:stream's typings don't expose toWeb on the structural type alias.
    const r = ns;
    // Buffer the most recent error so toWeb's adapter sees it.
    let pendingError = null;
    r.on('error', (err) => { pendingError = err; });
    const web = Readable.toWeb(r);
    if (pendingError) {
        // toWeb may have synchronously already adapted the stream; force-error it.
        return new ReadableStream({
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
export function parseStatusLine(line) {
    // Strip trailing CR (CRLF tolerance) and any trailing whitespace.
    const trimmed = line.replace(/\r$/, '');
    if (trimmed.length === 0)
        return null;
    let m = STATUS_INFO_RE.exec(trimmed);
    if (m)
        return { level: 'info', message: m[1] ?? '', raw: trimmed };
    m = STATUS_ERROR_RE.exec(trimmed);
    if (m)
        return { level: 'error', message: m[1] ?? '', raw: trimmed };
    return { level: 'info', message: trimmed, raw: trimmed };
}
/**
 * Stream a Web ReadableStream<Uint8Array> as `PipeStatusMessage` events,
 * handling chunk boundaries mid-line, CRLF/LF (CR alone NOT supported — the
 * pipe server always terminates with `\n`), and partial-tail-on-EOF
 * (an unterminated final line is dropped, NOT emitted, since the server
 * always terminates real status lines with `\n`).
 */
export async function* parseStatusStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            // Split on LF; CR before LF gets stripped by parseStatusLine.
            while ((idx = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, idx);
                buf = buf.slice(idx + 1);
                const parsed = parseStatusLine(line);
                if (parsed)
                    yield parsed;
            }
        }
        // Flush decoder, but DROP any trailing unterminated partial line — the
        // server always terminates with `\n`, so a partial tail means the
        // connection dropped mid-line (don't emit corrupted state).
        buf += decoder.decode();
        // (intentionally ignore residual `buf` here)
    }
    finally {
        try {
            reader.releaseLock();
        }
        catch { /* ignore */ }
    }
}
// SSE parser — moved to ./sse-stream.ts (web-API only, so the browser bundle
// can carry it). Re-exported so this module's public surface is unchanged.
export { parseSseEvent, parseSseStream } from './sse-stream.js';
// ---------------------------------------------------------------------------
// Query helpers — pipe accepts string-encoded booleans
// ---------------------------------------------------------------------------
/** Encode a boolean for ?download / ?video / ?progress query strings. */
export function boolQuery(v) {
    if (v === undefined)
        return undefined;
    return v ? 'true' : 'false';
}
export class PipeStream {
    baseUrl;
    basePath;
    transport;
    kitAuth;
    constructor(config) {
        this.baseUrl = config.pipeBaseUrl.replace(/\/+$/, '');
        this.basePath = (config.basePath ?? '/api/v1/pipe').replace(/\/+$/, '');
        this.transport = config.transport ?? globalFetchPipeTransport();
        this.kitAuth = config.kitAuth;
    }
    /**
     * Create a PipeStream from an already-constructed HoodyClient + container.
     * Relies on `client.getKitUrl('pipe', container, serviceIndex)`, and sends
     * through `client.http` so the client's injected transport and kitAuth
     * apply (lib/pipe-transport.ts).
     */
    static fromClient(client, container, serviceIndex = 1) {
        const pipeBaseUrl = client.getKitUrl('pipe', container, serviceIndex);
        const transport = pipeTransportFromClient(client);
        const kitAuth = clientKitAuth(client);
        return new PipeStream({ pipeBaseUrl, ...(transport ? { transport } : {}), ...(kitAuth ? { kitAuth } : {}) });
    }
    /** Build a full pipe URL for `path` with optional query params. A reserved name throws (see validatePipePath). */
    getUrl(path, query) {
        const encoded = encodePipePath(path);
        refuseReservedPipePath(path);
        let url = `${this.baseUrl}${this.basePath}/${encoded}`;
        if (query) {
            const parts = [];
            for (const [k, v] of Object.entries(query)) {
                if (v === undefined)
                    continue;
                const sv = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
                parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(sv)}`);
            }
            if (parts.length > 0)
                url += '?' + parts.join('&');
        }
        return url;
    }
    /**
     * Send `source` bytes to pipe `path`. Returns once the server has accepted
     * the request and started streaming status messages; the `done` promise
     * resolves when the kit confirms the transfer completed and rejects with a
     * PipeTransferError when it failed (see PipeSendResult.done). A refused
     * request (non-2xx) throws a PipeTransferError with its `status`.
     *
     * Status messages are surfaced via `opts.onStatus`. If you want to drive a
     * progress UI, wire onStatus to capture `Streaming…` / `Transfer complete.`.
     */
    async send(path, source, opts = {}) {
        validatePipePath(path);
        if (opts.n !== undefined)
            validateN(opts.n);
        if (opts.wait !== undefined)
            validateWait(opts.wait);
        if (opts.live === true)
            validateLive('send', opts.n, opts.sha256);
        if (opts.transfer !== undefined)
            checkTransferId(opts.transfer);
        const stream = coerceToReadableStream(source);
        const method = opts.method ?? 'POST';
        const contentType = opts.contentType ?? (typeof source === 'string' ? 'text/plain' : 'application/octet-stream');
        const headers = {
            'Content-Type': contentType,
            ...(opts.headers ?? {}),
        };
        if (opts.contentLength !== undefined)
            headers['Content-Length'] = String(opts.contentLength);
        if (opts.filename !== undefined)
            headers['Content-Disposition'] = pipeContentDisposition(opts.filename);
        const url = this.getUrl(path, {
            n: opts.n,
            wait: opts.wait,
            sha256: opts.sha256 === true ? true : undefined,
            live: opts.live === true ? true : undefined,
            transfer: opts.transfer,
        });
        const res = await this.transport(method, url, {
            headers,
            body: stream,
            ...(opts.signal ? { signal: opts.signal } : {}),
        });
        if (!res.ok) {
            // Drain body so the connection can be reused; surface as Error.
            let bodyText = '';
            try {
                bodyText = await res.text();
            }
            catch { /* ignore */ }
            throw new PipeTransferError(`pipe send failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`, res.status);
        }
        if (!res.body) {
            // 200 with no body: no line confirms the transfer.
            const failed = Promise.reject(transferFailure([], res.status, 'pipe send'));
            return { status: res.status, done: failed, sha256: failed.then(() => null, () => null) };
        }
        // Tee the response body so we can both parse status messages AND wait for
        // full drain. Web streams support tee() natively.
        const [forParse, forDrain] = res.body.tee();
        let digest = null;
        const messages = [];
        const parsePromise = (async () => {
            for await (const msg of parseStatusStream(forParse)) {
                // `[INFO] SHA-256: <hex>` comes before `Transfer complete.`, only on a completed transfer.
                const m = msg.level === 'info' ? /^SHA-256: ([0-9a-f]{64})$/.exec(msg.message) : null;
                if (m)
                    digest = m[1];
                messages.push(msg);
                opts.onStatus?.(msg);
            }
        })();
        const drainPromise = (async () => {
            const reader = forDrain.getReader();
            try {
                while (!(await reader.read()).done) { /* drain */ }
            }
            finally {
                try {
                    reader.releaseLock();
                }
                catch { /* ignore */ }
            }
        })();
        // The response's end is not the transfer's: only the kit's last line says how it went.
        const done = Promise.all([parsePromise, drainPromise]).then(() => {
            const failed = transferFailure(messages, res.status, 'pipe send');
            if (failed)
                throw failed;
        });
        // Also keeps a `done` nobody awaits from being an unhandled rejection.
        const sha256 = done.then(() => digest, () => null);
        return { status: res.status, done, sha256 };
    }
    /**
     * Receive bytes from pipe `path`. Returns the response body as a Web
     * ReadableStream — caller pipes to wherever (file, socket, stdout, ...).
     * Throws `PipeReceiveEmptyBodyError` if the response has no body.
     */
    async receive(path, opts = {}) {
        validatePipePath(path);
        if (opts.n !== undefined)
            validateN(opts.n);
        if (opts.wait !== undefined)
            validateWait(opts.wait);
        if (opts.live === true)
            validateLive('receive', opts.n, opts.sha256);
        const url = this.getUrl(path, {
            n: opts.n,
            download: boolQuery(opts.download),
            filename: opts.filename,
            wait: opts.wait,
            sha256: opts.sha256 === true ? true : undefined,
            live: opts.live === true ? true : undefined,
        });
        const res = await this.transport('GET', url, opts.signal ? { signal: opts.signal } : {});
        if (!res.ok) {
            let bodyText = '';
            try {
                bodyText = await res.text();
            }
            catch { /* ignore */ }
            throw new Error(`pipe receive failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`);
        }
        if (!res.body) {
            throw new PipeReceiveEmptyBodyError(res.status, res.headers);
        }
        const transferId = res.headers.get('X-Hoody-Pipe-Transfer-Id');
        if (opts.sha256 !== true)
            return { body: res.body, headers: res.headers, status: res.status, transferId };
        if (transferId === null) {
            // A kit without transfer ids keeps no receipts, so nothing can be checked.
            const verified = Promise.reject(new PipeIntegrityError('unavailable', 'pipe receive: the kit sent no transfer id, so the body cannot be verified', null, null, null));
            verified.catch(() => undefined);
            return { body: res.body, headers: res.headers, status: res.status, transferId, verified };
        }
        const { body, verified } = this.verifyingBody(path, res.body, transferId, opts.signal);
        return { body, headers: res.headers, status: res.status, transferId, verified };
    }
    /**
     * The kit's `/api/v1/pipe/metrics` text (Prometheus 0.0.4): counters and
     * gauges with fixed labels, never a pipe name.
     */
    async metrics(opts = {}) {
        // Metrics exist only under /api/v1/pipe (a bare /metrics is 404), so a
        // root-route basePath ('') still asks the canonical path.
        const prefix = this.basePath.endsWith('/api/v1/pipe') ? this.basePath : '/api/v1/pipe';
        const res = await this.transport('GET', `${this.baseUrl}${prefix}/metrics`, opts.signal ? { signal: opts.signal } : {});
        const text = await res.text();
        if (!res.ok)
            throw new Error(`pipe metrics failed: HTTP ${res.status} ${res.statusText} — ${text.trim()}`);
        return text;
    }
    /**
     * `?status` of `path` (`GET /{path}?status`): one JSON snapshot, no receiver
     * slot. With `transfer`, the state of that transfer instead: the name's
     * live record while it runs, then for a hashed transfer its receipt (kept
     * 10 minutes). An unknown or expired id throws (HTTP 404).
     */
    async status(path, opts = {}) {
        validatePipePath(path);
        const res = await this.transport('GET', this.getUrl(path, { status: true, transfer: opts.transfer }), opts.signal ? { signal: opts.signal } : {});
        if (!res.ok) {
            let bodyText = '';
            try {
                bodyText = await res.text();
            }
            catch { /* ignore */ }
            throw Object.assign(new Error(`pipe status failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`), { status: res.status });
        }
        return (await res.json());
    }
    /**
     * The `sha256` receive body: a pass-through that hashes what the caller
     * reads. Every exit reaches one settle(): EOF (then the receipt check),
     * cancel and signal abort (`incomplete`), and a source error (that error).
     */
    verifyingBody(path, source, transferId, signal) {
        const reader = source.getReader();
        const hash = createHash('sha256');
        let resolveVerified;
        let rejectVerified;
        const verified = new Promise((resolve, reject) => { resolveVerified = resolve; rejectVerified = reject; });
        verified.catch(() => undefined);
        let settled = false;
        const settle = (err, hex) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            if (hex !== undefined)
                resolveVerified(hex);
            else
                rejectVerified(err);
        };
        const incomplete = () => new PipeIntegrityError('incomplete', 'pipe receive: the body was not read to the end, so it was not verified', null, null, transferId);
        const onAbort = () => {
            settle(incomplete());
            void reader.cancel(signal?.reason).catch(() => undefined);
        };
        // No read-ahead (highWaterMark 0): EOF is read, and the receipt checked,
        // only when the caller reads it, so a cancel after the last chunk is still
        // incomplete.
        const body = new ReadableStream({
            pull: async (controller) => {
                let r;
                try {
                    r = await reader.read();
                }
                catch (err) {
                    settle(err);
                    controller.error(err);
                    return;
                }
                if (r.done) {
                    controller.close();
                    if (settled)
                        return;
                    // All bytes are in; an abort from here on does not make them incomplete.
                    signal?.removeEventListener('abort', onAbort);
                    const actual = hash.digest('hex');
                    this.checkReceipt(path, transferId, actual).then((hex) => settle(null, hex), (err) => settle(err));
                    return;
                }
                hash.update(r.value);
                controller.enqueue(r.value);
            },
            cancel: (reason) => {
                settle(incomplete());
                return reader.cancel(reason);
            },
        }, { highWaterMark: 0 });
        if (signal?.aborted)
            onAbort();
        else
            signal?.addEventListener('abort', onAbort, { once: true });
        return { body, verified };
    }
    /**
     * After EOF: poll `?status&transfer=` every 100 ms (10 s at most) until the
     * transfer is terminal, then compare digests. The kit writes the receipt
     * before it closes the receivers, so the first poll is normally enough.
     */
    async checkReceipt(path, transferId, actual) {
        const unavailable = (why) => new PipeIntegrityError('unavailable', `pipe receive: ${why}, so the body cannot be verified`, null, actual, transferId);
        const deadline = Date.now() + 10_000;
        for (;;) {
            let st = null;
            try {
                st = await this.status(path, { transfer: transferId, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
            }
            catch (err) {
                if (err.status === 404)
                    throw unavailable('the kit has no record of the transfer');
            }
            if (st?.state === 'complete' || st?.state === 'failed') {
                if (st.state === 'failed' || st.sha256 === null) {
                    throw unavailable(st.state === 'failed' ? `the transfer failed (${st.reason ?? 'no reason'})` : 'the kit did not hash the transfer');
                }
                if (st.sha256 !== actual) {
                    throw new PipeIntegrityError('mismatch', `pipe receive: SHA-256 mismatch (kit ${st.sha256}, received ${actual})`, st.sha256, actual, transferId);
                }
                return actual;
            }
            if (Date.now() >= deadline)
                throw unavailable('the kit did not finish the transfer within 10 s of the end of the body');
            await new Promise((r) => setTimeout(r, 100));
        }
    }
    /**
     * Subscribe to a separate `?progress` SSE stream for live transfer state.
     * Does NOT consume a receiver slot — spectators are independent.
     * The stream ends after the `done` event, whose `state` says whether the
     * transfer completed or failed (with the kit's `reason`). Within 30 s after
     * a transfer on `path` ends, the kit answers 204 and this yields nothing.
     * Breaking out of the loop, or aborting `signal`, closes the connection.
     */
    async *subscribeProgress(path, opts = {}) {
        validatePipePath(path);
        const url = this.getUrl(path, { progress: 'true' });
        const res = await this.transport('GET', url, {
            headers: { Accept: 'text/event-stream' },
            ...(opts.signal ? { signal: opts.signal } : {}),
        });
        if (!res.ok) {
            let bodyText = '';
            try {
                bodyText = await res.text();
            }
            catch { /* ignore */ }
            throw new Error(`pipe progress failed: HTTP ${res.status} ${res.statusText} — ${bodyText.trim()}`);
        }
        if (!res.body)
            return;
        const ts = () => Date.now();
        try {
            for await (const ev of parseSseStream(res.body)) {
                const data = ev.data ? safeJsonParse(ev.data) : null;
                if (ev.event === 'state' && data && typeof data === 'object' && 'state' in data) {
                    const st = String(data.state);
                    if (st === 'idle' || st === 'waiting' || st === 'streaming' || st === 'complete' || st === 'failed') {
                        const d = data;
                        yield {
                            kind: 'state',
                            state: st,
                            ts: ts(),
                            hasSender: d.hasSender === true,
                            activeReceivers: Number(d.activeReceivers ?? 0),
                            // A live stream has no `n` (null); an older kit that sends none reads 0.
                            totalReceivers: d.totalReceivers === null ? null : Number(d.totalReceivers ?? 0),
                            live: d.live === true,
                        };
                    }
                }
                else if (ev.event === 'progress' && data && typeof data === 'object') {
                    const d = data;
                    yield {
                        kind: 'progress',
                        bytesTransferred: Number(d.bytesTransferred ?? 0),
                        speed: Number(d.speed ?? 0),
                        eta: Number(d.eta ?? 0),
                        // The kit sends `activeReceivers`; `receivers` is read only when it is absent (older kits).
                        receivers: Number(d.activeReceivers ?? d.receivers ?? 0),
                        ts: ts(),
                        totalBytes: typeof d.totalBytes === 'number' ? d.totalBytes : null,
                        elapsed: Number(d.elapsed ?? 0),
                        live: d.live === true,
                    };
                }
                else if (ev.event === 'done' && data && typeof data === 'object') {
                    const d = data;
                    yield {
                        kind: 'done',
                        bytesTransferred: Number(d.bytesTransferred ?? 0),
                        duration: Number(d.duration ?? 0),
                        avgSpeed: Number(d.avgSpeed ?? 0),
                        ts: ts(),
                        state: d.state === 'failed' ? 'failed' : 'complete',
                        ...(typeof d.reason === 'string' ? { reason: d.reason } : {}),
                        ...(typeof d.sha256 === 'string' ? { sha256: d.sha256 } : {}),
                        ...(typeof d.transferId === 'string' ? { transferId: d.transferId } : {}),
                    };
                }
                // Unknown event types are ignored.
            }
        }
        finally {
            // Every exit (the end, a throw, or a caller that stops early): parseSseStream
            // has released its reader, so cancelling the body closes the connection and
            // the kit drops this spectator. Without it the connection stays open until
            // the kit ends the stream (up to its 30-minute spectator TTL).
            void res.body.cancel().catch(() => undefined);
        }
    }
    /** `ws(s)://…/{name}?ws[&wait=]` — the relay URL for `name` (no credential in it). */
    getWsUrl(name, opts = {}) {
        const url = this.getUrl(name, { wait: opts.wait });
        return toWebSocketUrl(url) + (url.includes('?') ? '&ws' : '?ws');
    }
    /**
     * Open a WebSocket relay connection on `name` (`GET /{name}?ws`). Two peers
     * on the same name exchange messages 1:1 (text stays text, binary stays
     * binary). Resolves once this peer's upgrade is accepted, before the other
     * peer arrives; messages sent meanwhile are queued by the kit (bounded).
     * Kit credentials go on the upgrade (headers via the `ws` package).
     */
    async connect(name, opts = {}) {
        validatePipePath(name);
        return openPipeDuplex({
            url: this.getWsUrl(name, { wait: opts.wait }),
            kitAuth: this.kitAuth,
            options: opts,
            label: 'pipe.connect()',
            status: async () => {
                const res = await this.transport('GET', this.getUrl(name, { status: '' }), {});
                return res.ok ? (await res.json()) : null;
            },
        });
    }
    /** forwardTcp over one relay pair (wire protocol in lib/pipe-ws-forward.ts). */
    forwardTcpWs(opts) {
        const path = opts.path;
        if (!path || opts.sendPath !== undefined || opts.recvPath !== undefined) {
            throw new Error("forwardTcp: transport 'ws' needs path (not sendPath/recvPath)");
        }
        validatePipePath(path);
        if (opts.signal?.aborted) {
            const address = opts.listen ? Promise.reject(opts.signal.reason) : undefined;
            address?.catch(() => { });
            return { done: Promise.resolve(), close: () => { }, address };
        }
        const label = 'forwardTcp';
        const parts = kitAuthWebSocketParts(toWebSocketUrl(this.getUrl(path)) + '?ws', kitAuthForNamespace(this.kitAuth, 'pipe'), label);
        const openWs = () => openWebSocketWithHeaders(parts.url, undefined, parts.headers, label);
        let server = null;
        let active = null;
        let closed = false;
        const closeAll = () => {
            closed = true;
            try {
                active?.close();
            }
            catch { /* ignore */ }
            try {
                server?.close();
            }
            catch { /* ignore */ }
            server = null;
        };
        opts.signal?.addEventListener('abort', closeAll, { once: true });
        let done;
        let address;
        if (opts.listen) {
            const srv = net.createServer({ allowHalfOpen: true }, (sock) => {
                // One bridge at a time. A plain destroy: an Error would be emitted with no listener.
                if (active || closed) {
                    sock.destroy();
                    return;
                }
                sock.pause();
                // A reset before the bridge attaches would be an unhandled error; 'close' follows.
                sock.on('error', () => { });
                const pending = { done: Promise.resolve(), close: () => sock.destroy() };
                active = pending;
                openWs().then((ws) => {
                    // Closed, or the client left, while the socket was being created: the TCP close is already past.
                    if (closed || active !== pending || sock.destroyed) {
                        if (active === pending)
                            active = null;
                        ws.addEventListener('error', () => { });
                        try {
                            ws.close(1000);
                        }
                        catch { /* ignore */ }
                        sock.destroy();
                        return;
                    }
                    const bridge = bridgeTcpOverWs(ws, sock, label);
                    active = bridge;
                    const clear = () => { if (active === bridge)
                        active = null; };
                    bridge.done.then(clear, clear); // one failed connection does not end the listener
                }, () => { sock.destroy(); if (active === pending)
                    active = null; });
            });
            server = srv;
            address = new Promise((resolve, reject) => {
                srv.once('error', reject);
                srv.once('close', () => reject(new Error('forwardTcp: closed before listening')));
                srv.listen(opts.listen.port, opts.listen.host ?? '127.0.0.1', () => {
                    const a = srv.address();
                    resolve(typeof a === 'object' && a !== null ? { host: a.address, port: a.port } : { host: opts.listen.host ?? '127.0.0.1', port: opts.listen.port });
                });
            });
            address.catch(() => { });
            done = new Promise((resolve) => { srv.on('close', () => resolve()); });
        }
        else {
            const { host, port } = opts.connect;
            done = openWs().then((ws) => {
                if (closed) {
                    ws.addEventListener('error', () => { });
                    try {
                        ws.close(1000);
                    }
                    catch { /* ignore */ }
                    return;
                }
                // Dial the service only once the peer's hello arrived.
                const bridge = bridgeTcpOverWs(ws, () => net.connect({ host, port, allowHalfOpen: true }), label);
                active = bridge;
                return bridge.done;
            });
        }
        const removeAbort = () => opts.signal?.removeEventListener('abort', closeAll);
        done.then(removeAbort, removeAbort);
        return { done, close: closeAll, address };
    }
    /**
     * Bidirectional TCP-over-pipes forwarder.
     *
     * Half-duplex per pipe: outbound bytes use `sendPath`, inbound bytes use
     * `recvPath`. The PEER must run the same forwarder with paths SWAPPED
     * (their sendPath = our recvPath, their recvPath = our sendPath).
     *
     * Round-trip latency = 2× plain TCP because each direction is its own HTTP
     * request.
     *
     * Idle tunnels: the server ends a transfer after 5 minutes without a byte.
     * After `keepaliveMs` (default 240s) with no byte to send, each side ends its
     * send pipe with a clean EOF and, once the server reports
     * `Transfer complete.`, sends again on the same path; the peer's receiver
     * sees `X-Hoody-Pipe: kind=tcp-forward; segments=1`, takes that EOF as "next
     * pipe follows" and GETs again. The app's own half-close travels as an empty
     * pipe marked `fin=1`. A pipe from an older forwarder (no `segments=1`) keeps
     * the old meaning: its EOF is the half-close. A pipe that ends any other way
     * (timeout, peer gone, error), or a fin pipe the peer never takes, closes
     * the bridge, because bytes or the half-close may be lost.
     *
     * Pairing: re-opening only keeps an established tunnel alive. The first pipe
     * in each direction still waits for its counterpart under the server's
     * 5-minute pairing timeout, and the timeout closes the bridge. Connect mode
     * opens its pipes once its dial connects; listen mode only once a local
     * client connects to it. So both directions pair only if that local client
     * connects within 5 minutes of the connect side starting; starting the
     * peer forwarder is not enough. In Node, a send pipe reaches the server
     * only with the app's first byte, or when it is re-opened after
     * `keepaliveMs` with nothing sent (with 0, only the first byte), so the
     * peer's first receive also times out if neither happens within 5 minutes.
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
    forwardTcp(opts) {
        if ((opts.listen && opts.connect) || (!opts.listen && !opts.connect)) {
            throw new Error('forwardTcp: exactly one of listen/connect required');
        }
        if (opts.transport === 'ws')
            return this.forwardTcpWs(opts);
        if (opts.transport !== undefined && opts.transport !== 'http') {
            throw new Error(`forwardTcp: unknown transport '${String(opts.transport)}'`);
        }
        if (!opts.sendPath || !opts.recvPath || opts.path !== undefined) {
            throw new Error("forwardTcp: transport 'http' needs sendPath and recvPath (path is for transport 'ws')");
        }
        const sendPath = opts.sendPath;
        const recvPath = opts.recvPath;
        const keepaliveMs = opts.keepaliveMs ?? 240_000;
        if (!Number.isFinite(keepaliveMs) || keepaliveMs < 0) {
            throw new RangeError('forwardTcp: keepaliveMs must be a finite number >= 0');
        }
        // Already aborted: start nothing (no listener, no dial, no pipes).
        if (opts.signal?.aborted) {
            const address = opts.listen ? Promise.reject(opts.signal.reason) : undefined;
            address?.catch(() => { });
            return { done: Promise.resolve(), close: () => { }, address };
        }
        let server = null;
        let activeBridge = null;
        // Connect mode, until `connect`: close() must be able to reach the dial.
        let pendingSock = null;
        const closeAll = () => {
            try {
                pendingSock?.destroy();
            }
            catch { /* ignore */ }
            pendingSock = null;
            try {
                activeBridge?.close();
            }
            catch { /* ignore */ }
            activeBridge = null;
            try {
                server?.close();
            }
            catch { /* ignore */ }
            server = null;
        };
        if (opts.signal) {
            opts.signal.addEventListener('abort', closeAll, { once: true });
        }
        const bridgeSocket = (sock) => {
            // One controller per direction: once the app has half-closed, the send
            // direction must be free to deliver its last bytes and the fin pipe
            // even after the socket has closed.
            const inAc = new AbortController();
            const outAc = new AbortController();
            let readEnded = false;
            // Whether the peer forwarder sends `segments=1` pipes (so also reads
            // them); unknown until its first pipe arrives.
            let peerSegments;
            // Drops the fin pipe once the peer turns out to be an older forwarder.
            const finAc = new AbortController();
            // A pipe that ended without delivering everything: close the socket so
            // the app sees the connection end instead of a gap in the bytes.
            const fail = () => {
                try {
                    inAc.abort();
                }
                catch { /* ignore */ }
                try {
                    outAc.abort();
                }
                catch { /* ignore */ }
                try {
                    sock.destroy();
                }
                catch { /* ignore */ }
            };
            sock.on('error', fail);
            // `'end'` is the app's half-close: the inbound pipe must stay free to
            // flush into the socket. A close without it (reset, destroy) aborts both.
            sock.on('end', () => { readEnded = true; });
            sock.on('close', () => {
                try {
                    inAc.abort();
                }
                catch { /* ignore */ }
                if (!readEnded) {
                    try {
                        outAc.abort();
                    }
                    catch { /* ignore */ }
                }
            });
            // Sends one pipe; true only when the server confirmed every byte reached
            // every receiver (`[INFO] Transfer complete.`).
            const sendSegment = async (source, marker, signal) => {
                let complete = false;
                const sendOpts = {
                    contentType: 'application/octet-stream',
                    signal,
                    headers: { 'X-Hoody-Pipe': marker },
                    onStatus: (msg) => { if (msg.level === 'info' && msg.message === 'Transfer complete.')
                        complete = true; },
                };
                if (opts.n !== undefined)
                    sendOpts.n = opts.n;
                const result = await this.send(sendPath, source, sendOpts);
                await result.done;
                return complete;
            };
            // Outbound: socket → pipe `sendPath`, one segment at a time. A segment
            // ends with EOF when the app half-closes or after `keepaliveMs` without
            // a byte; only a confirmed segment is followed by the next one.
            //
            // CRITICAL: do NOT use `Readable.toWeb(sock)` for the source here —
            // when its consumer drains to EOF, Node calls `sock.destroy()`, which
            // closes both halves of the socket. That kills the write half before
            // `inbound` can flush the response bytes back to the peer. The feeder
            // consumes `'data'` events but never destroys.
            const feeder = new SocketSegmentFeeder(sock, keepaliveMs, () => peerSegments !== false);
            const outbound = (async () => {
                try {
                    for (;;) {
                        const segment = feeder.open();
                        if (!(await sendSegment(segment.stream, TCP_FORWARD_SEGMENT, outAc.signal))) {
                            throw new Error('forwardTcp: send pipe ended before its bytes were delivered');
                        }
                        if (segment.carriesEnd())
                            break;
                    }
                }
                catch {
                    if (!outAc.signal.aborted)
                        fail();
                    return;
                }
                finally {
                    feeder.dispose();
                }
                // Every byte up to the app's half-close is delivered. A peer that reads
                // segments half-closes on the empty fin pipe; an older peer already
                // took the EOF above as the half-close, so it is skipped (or dropped
                // once the peer's first pipe shows it is one).
                if (peerSegments === false)
                    return;
                const finSignal = AbortSignal.any([outAc.signal, finAc.signal]);
                let finDelivered = false;
                try {
                    finDelivered = await sendSegment(new Uint8Array(0), TCP_FORWARD_FIN, finSignal);
                }
                catch { /* checked below */ }
                // Undelivered, the peer app would wait forever for the half-close.
                // An abort is deliberate (older peer, or the bridge already closing).
                if (!finDelivered && !finSignal.aborted)
                    fail();
            })();
            // Inbound: pipe `recvPath` → socket, one segment at a time. EOF of a
            // `segments=1` pipe means the next one follows; a `fin=1` pipe, or EOF
            // from an older forwarder, is the peer app's half-close.
            const inbound = (async () => {
                try {
                    for (;;) {
                        const recvOpts = { signal: inAc.signal };
                        if (opts.n !== undefined)
                            recvOpts.n = opts.n;
                        const { body, headers } = await this.receive(recvPath, recvOpts);
                        const marker = parseTcpForwardHeader(headers.get('X-Hoody-Pipe'));
                        peerSegments = marker.segments;
                        if (!marker.segments)
                            finAc.abort();
                        const reader = body.getReader();
                        // A body error must close the bridge even while a write to a slow
                        // app is pending, so it is watched apart from the copy loop.
                        reader.closed.catch(() => { if (!inAc.signal.aborted)
                            fail(); });
                        const cancelBody = () => { reader.cancel().catch(() => { }); };
                        inAc.signal.addEventListener('abort', cancelBody, { once: true });
                        try {
                            for (;;) {
                                const { value, done } = await reader.read();
                                if (done)
                                    break;
                                await writeToSocket(sock, value);
                            }
                        }
                        finally {
                            inAc.signal.removeEventListener('abort', cancelBody);
                        }
                        // A cancelled body also reads as done; it is not the peer's EOF.
                        inAc.signal.throwIfAborted();
                        if (!marker.segments || marker.fin)
                            break;
                    }
                    try {
                        sock.end();
                    }
                    catch { /* ignore */ }
                }
                catch {
                    // A non-2xx answer (e.g. the pairing timeout's 408), a body error
                    // (aborted transfer) or a socket that closed under a write.
                    if (!inAc.signal.aborted)
                        fail();
                }
            })();
            const done = Promise.all([outbound, inbound]).then(() => undefined);
            return { close: fail, done };
        };
        let donePromise;
        let addressPromise;
        if (opts.listen) {
            // allowHalfOpen: true — when the peer sends FIN, do NOT auto-FIN our
            // write half. forward-tcp's inbound direction must be free to flush
            // response bytes back to the peer after our outbound direction's read
            // EOFs (e.g. peer half-closes after sending request bytes).
            // Note: createServer's `allowHalfOpen` option is unreliable across
            // runtimes — set it explicitly on each accepted socket to be safe.
            const srv = net.createServer({ allowHalfOpen: true }, (sock) => {
                sock.allowHalfOpen = true;
                // Refuse multiple concurrent connections — we only forward one at a time.
                // A plain destroy: an Error here would reach no listener and be uncaught.
                if (activeBridge) {
                    sock.destroy();
                    return;
                }
                activeBridge = bridgeSocket(sock);
                activeBridge.done.finally(() => { activeBridge = null; });
            });
            server = srv;
            const { host, port } = opts.listen;
            addressPromise = new Promise((resolve, reject) => {
                srv.once('error', reject);
                // close() before the bind: no callback follows (no-op once resolved).
                srv.once('close', () => reject(new Error('forwardTcp: closed before listening')));
                srv.listen(port, host ?? '127.0.0.1', () => {
                    const addr = srv.address();
                    if (typeof addr === 'object' && addr !== null) {
                        resolve({ host: addr.address, port: addr.port });
                    }
                    else {
                        resolve({ host: host ?? '127.0.0.1', port });
                    }
                });
            });
            // A caller that closes early may never await the address.
            addressPromise.catch(() => { });
            donePromise = new Promise((resolve) => {
                srv.on('close', () => resolve());
            });
        }
        else {
            const { host, port } = opts.connect;
            // See listen-mode comment: allowHalfOpen prevents the kernel/Node from
            // auto-FINing our write half when the upstream service half-closes us.
            const sock = net.connect({ host, port, allowHalfOpen: true });
            pendingSock = sock;
            donePromise = new Promise((resolve, reject) => {
                let bridged = false;
                sock.once('connect', () => {
                    pendingSock = null;
                    bridged = true;
                    activeBridge = bridgeSocket(sock);
                    activeBridge.done.then(() => resolve(), reject);
                });
                sock.once('error', reject);
                // Closed before a bridge started (close() during the dial): done.
                sock.once('close', () => { if (!bridged)
                    resolve(); });
            });
        }
        // The caller's signal must not keep this forwarder's listener once it ends.
        const removeAbortListener = () => opts.signal?.removeEventListener('abort', closeAll);
        donePromise.then(removeAbortListener, removeAbortListener);
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
function validateN(n) {
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new RangeError('n must be an integer');
    }
    if (n < 1 || n > 256) {
        throw new RangeError('n must be in 1..256');
    }
}
function validateWait(wait) {
    if (!Number.isInteger(wait) || wait < 1 || wait > 3600) {
        throw new RangeError('wait must be an integer in 1..3600');
    }
}
function validateLive(op, n, sha256) {
    if (n !== undefined && n > 1)
        throw new RangeError(`${op}: live cannot be combined with n above 1`);
    if (sha256 === true)
        throw new RangeError(`${op}: live cannot be combined with sha256`);
}
function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return null;
    }
}
// `X-Hoody-Pipe` values forwardTcp sends; the server forwards the header to
// the receiver. `segments=1`: the sender opens a new pipe on the same path
// after this one, so EOF ends this pipe, not the stream. `fin=1`: an empty
// pipe carrying the app's half-close. Forwarders before this one send
// `kind=tcp-forward` alone, and their EOF is the half-close.
const TCP_FORWARD_SEGMENT = 'kind=tcp-forward; segments=1';
const TCP_FORWARD_FIN = 'kind=tcp-forward; segments=1; fin=1';
function parseTcpForwardHeader(value) {
    const params = new Set((value ?? '').split(';').map((p) => p.trim().toLowerCase()));
    return { segments: params.has('segments=1'), fin: params.has('fin=1') };
}
/**
 * Reads the read half of a `net.Socket` for forwardTcp's send direction and
 * hands the bytes to one segment stream at a time. Never destroys the socket
 * (unlike `Readable.toWeb`): the write half must stay open after the read half
 * EOFs, so the bridge can flush response bytes back to the app.
 *
 * Bytes that arrive while no segment is open (between a segment's EOF and the
 * next `open()`) wait in `queue` with the socket paused, and are the first
 * bytes of the next segment. A segment closes on the socket's `'end'` or once
 * `idleMs` pass with no byte; both happen in one event-loop task, so a chunk
 * lands either before that EOF (sent by this segment) or after it (queued).
 *
 * Backpressure: pause/resume on the socket as the segment's desiredSize signals.
 */
class SocketSegmentFeeder {
    sock;
    idleMs;
    mayRotate;
    queue = [];
    current = null;
    ended = false;
    lastByteAt = 0;
    timer = null;
    constructor(sock, idleMs, mayRotate) {
        this.sock = sock;
        this.idleMs = idleMs;
        this.mayRotate = mayRotate;
        sock.on('data', this.onData);
        sock.once('end', this.onEnd);
    }
    /** Opens the next segment. `carriesEnd()` is true once it closed on the socket's end. */
    open() {
        const segment = { controller: null, carriesEnd: false };
        const stream = new ReadableStream({
            start: (controller) => {
                segment.controller = controller;
                for (const bytes of this.queue)
                    controller.enqueue(bytes);
                this.queue = [];
                if (this.ended) {
                    segment.carriesEnd = true;
                    controller.close();
                    return;
                }
                this.current = segment;
                this.lastByteAt = Date.now();
                this.arm(this.idleMs);
            },
            pull: () => {
                try {
                    this.sock.resume();
                }
                catch { /* ignore */ }
            },
            cancel: () => {
                // The request ended under us (server ended the transfer, or abort):
                // stop reading; the bridge closes, so nothing is resent.
                if (this.current === segment)
                    this.current = null;
                this.clearTimer();
                try {
                    this.sock.pause();
                }
                catch { /* ignore */ }
            },
        });
        return { stream, carriesEnd: () => segment.carriesEnd };
    }
    dispose() {
        this.clearTimer();
        this.sock.off('data', this.onData);
        this.sock.off('end', this.onEnd);
    }
    onData = (chunk) => {
        const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        const segment = this.current;
        if (!segment) {
            this.queue.push(bytes);
            try {
                this.sock.pause();
            }
            catch { /* ignore */ }
            return;
        }
        try {
            segment.controller.enqueue(bytes);
            this.lastByteAt = Date.now();
            if ((segment.controller.desiredSize ?? 0) <= 0)
                this.sock.pause();
        }
        catch { /* stream already cancelled: the bridge is closing */ }
    };
    onEnd = () => {
        this.ended = true;
        if (this.current) {
            this.current.carriesEnd = true;
            this.closeCurrent();
        }
    };
    onTimer = () => {
        this.timer = null;
        if (!this.current || !this.mayRotate())
            return;
        const idle = Date.now() - this.lastByteAt;
        if (idle < this.idleMs) {
            this.arm(this.idleMs - idle);
            return;
        }
        this.closeCurrent();
    };
    closeCurrent() {
        const segment = this.current;
        this.current = null;
        this.clearTimer();
        // Chunks already enqueued are read before this EOF.
        try {
            segment?.controller.close();
        }
        catch { /* already closed */ }
    }
    arm(ms) {
        this.clearTimer();
        if (this.idleMs > 0)
            this.timer = setTimeout(this.onTimer, ms);
    }
    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
/**
 * Writes one chunk to a socket; resolves once it is written (or, when the
 * socket buffer is full, on `'drain'`). A write stalled behind a slow reader
 * settles when the bridge is torn down: destroying a socket calls every
 * pending write callback with ERR_STREAM_DESTROYED (Node and Bun alike), and
 * a write to a destroyed socket gets the same error.
 */
function writeToSocket(sock, chunk) {
    return new Promise((resolve, reject) => {
        const onDrain = () => resolve();
        const ok = sock.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength), (err) => {
            if (err) {
                sock.off('drain', onDrain);
                reject(err);
            }
            else if (ok)
                resolve();
        });
        if (!ok)
            sock.once('drain', onDrain);
    });
}
