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
import { PipeTransferError } from './pipe-status.js';
import { type PipeTransport } from './pipe-transport.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { type PipeConnectOptions, type PipeDuplex } from './pipe-ws.js';
export { PipeTransferError };
export type PipeSource = string | Buffer | Uint8Array | ReadableStream<Uint8Array> | NodeJS.ReadableStream | AsyncIterable<Uint8Array | Buffer | string> | URL | {
    tcp: {
        host: string;
        port: number;
    };
} | {
    unix: string;
};
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
    /** Seconds to wait for the receivers (1..3600; the kit's default is 300). */
    wait?: number;
    /** Have the kit hash the stream with SHA-256; the digest comes back in `sha256`. */
    sha256?: boolean;
    /**
     * Broadcast live (`?live`): streaming starts at once and any number of
     * viewers join and leave while it runs, each getting the stream from then
     * on. Not with `n` above 1 or `sha256`.
     */
    live?: boolean;
    /**
     * This transfer's id (`?transfer=`, 16-64 characters of A-Z a-z 0-9 `_` `-`):
     * `status(path, { transfer })` then reads this transfer from the start. The
     * kit refuses an id already in use (409).
     */
    transfer?: string;
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
    /**
     * Resolves when the kit confirms the transfer: `[INFO] Transfer complete.`
     * (every receiver got every byte) or, for `live`, `[INFO] Live stream ended
     * (peak N viewers).`. The kit answers 200 as soon as it takes the upload,
     * so a later failure arrives only as a status line: done rejects with a
     * PipeTransferError carrying the kit's text (`Timed out waiting for
     * receivers.`, `All receivers disconnected before transfer completed.`, an
     * idle timeout, ...) or, when the response ends without either line,
     * `pipe send failed: the response ended before the transfer completed`.
     */
    done: Promise<void>;
    /** HTTP status of the sender request. */
    status: number;
    /**
     * Settles with `done`: the kit's SHA-256 (lowercase hex) of a completed
     * hashed transfer, or null (not hashed, failed, or `done` rejected).
     * Optional only so that results built in the earlier shape still type-check.
     */
    sha256?: Promise<string | null>;
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
    /** Seconds to wait for the sender (1..3600; the kit's default is 300). */
    wait?: number;
    /**
     * Hash the body while it is read and check it against the kit's digest of
     * the transfer; the result is `verified`.
     */
    sha256?: boolean;
    /**
     * Watch a live stream (`?live`) from now on: no `Content-Length`, and the
     * body errors if the kit cuts a viewer that fell too far behind. Not with
     * `n` above 1 or `sha256`.
     */
    live?: boolean;
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
    /** The kit's id for this transfer (`X-Hoody-Pipe-Transfer-Id`); null from a kit that sends none. */
    transferId?: string | null;
    /**
     * Only with `sha256`. After `body` has been read to the end, resolves to the
     * SHA-256 (lowercase hex) once it matches the kit's receipt for the
     * transfer. Rejects with PipeIntegrityError (`mismatch`, `unavailable`,
     * or `incomplete` when `body` is cancelled or the signal aborts first), or
     * with the body's own error when the stream fails. Never unhandled.
     */
    verified?: Promise<string>;
};
/** `?status` of a name, or of one transfer with `status(path, { transfer })`. */
export type PipeStatus = {
    state: 'idle' | 'waiting' | 'streaming' | 'complete' | 'failed';
    /** What holds the name: an HTTP transfer, a WebSocket pair or a live stream; null when idle. */
    kind: 'pipe' | 'ws' | 'live' | null;
    /** WebSocket peers connected (`ws` only). */
    peers: number | null;
    transferId: string | null;
    /** null for a `ws` pair. */
    hasSender: boolean | null;
    /** Receivers (live: viewers) connected now; null for a `ws` pair. */
    activeReceivers: number | null;
    /** The `n` the transfer waits for; null for a `ws` pair and for `live`. */
    totalReceivers: number | null;
    bytesTransferred: number;
    totalBytes: number | null;
    /** Bytes per second. */
    speed: number;
    /** Seconds left; null when unknown. */
    eta: number | null;
    /** Seconds since streaming started. */
    elapsed: number;
    /** The kit's reason on `failed`. */
    reason: string | null;
    /** SHA-256 of a completed hashed transfer, else null. */
    sha256: string | null;
};
/** A `sha256` receive that could not be verified. */
export declare class PipeIntegrityError extends Error {
    /** `mismatch`: digests differ; `unavailable`: the kit has no digest for the transfer; `incomplete`: the body was not read to the end. */
    readonly kind: 'mismatch' | 'unavailable' | 'incomplete';
    /** The kit's digest, when it gave one. */
    readonly expected: string | null;
    /** The digest of the bytes read, when they were all read. */
    readonly actual: string | null;
    readonly transferId: string | null;
    constructor(
    /** `mismatch`: digests differ; `unavailable`: the kit has no digest for the transfer; `incomplete`: the body was not read to the end. */
    kind: 'mismatch' | 'unavailable' | 'incomplete', message: string, 
    /** The kit's digest, when it gave one. */
    expected: string | null, 
    /** The digest of the bytes read, when they were all read. */
    actual: string | null, transferId: string | null);
}
/**
 * A `?progress` event from subscribeProgress. Only `done` says how a transfer
 * ended (`state: 'complete' | 'failed'`): the kit's `state` events carry idle,
 * waiting and streaming (`complete` and `failed` stay in that union for older
 * kits). `ts` is when the event arrived (ms since the epoch).
 *
 * subscribeProgress always sets every field. The fields added later
 * (`hasSender`, `activeReceivers`, `totalReceivers`, `totalBytes`, `elapsed`,
 * `live`, done's `state`) are optional in this type only so that code which
 * builds events in the earlier shape (wrappers, mocks, fixtures) still
 * type-checks; a done event without `state` reads as complete.
 */
export type PipeProgressEvent = {
    kind: 'state';
    state: 'idle' | 'waiting' | 'streaming' | 'complete' | 'failed';
    ts: number;
    /** Whether a sender is connected. */
    hasSender?: boolean;
    /** Receivers connected so far. */
    activeReceivers?: number;
    /** Receivers the transfer waits for (`n`); 0 until a sender or receiver sets it; null on a live stream. */
    totalReceivers?: number | null;
    /** A live stream (`?live`): `activeReceivers` are the viewers watching now. */
    live?: boolean;
} | {
    kind: 'progress';
    bytesTransferred: number;
    /** Bytes per second. */
    speed: number;
    /** Seconds left; 0 when unknown (no Content-Length, or no speed yet). */
    eta: number;
    /** Receivers still connected (the kit's `activeReceivers`). */
    receivers: number;
    ts: number;
    /** From the sender's Content-Length; null when it sent none. */
    totalBytes?: number | null;
    /** Seconds since streaming started. */
    elapsed?: number;
    /** A live stream (`?live`): `receivers` are the viewers watching now. */
    live?: boolean;
} | {
    kind: 'done';
    bytesTransferred: number;
    /** Seconds of streaming (one decimal); 0 when streaming never started. */
    duration: number;
    /** Bytes per second over `duration`. */
    avgSpeed: number;
    ts: number;
    /** How the transfer ended. */
    state?: 'complete' | 'failed';
    /** The kit's reason on `failed`, e.g. `Sender disconnected` or `Idle timeout`. */
    reason?: string;
    /** SHA-256 of a completed `sha256` transfer; absent otherwise. */
    sha256?: string;
    /** The transfer's id; absent for a WebSocket pair, a live stream or an older kit. */
    transferId?: string;
};
export type PipeForwardTcpOptions = {
    /**
     * `'http'` (default): two HTTP pipes, `sendPath` + `recvPath`.
     * `'ws'`: one WebSocket relay pair on `path` (`?ws`), credit flow control,
     * one hop per direction; both sides must use `'ws'` and the same `path`.
     */
    transport?: 'http' | 'ws';
    /** `transport: 'ws'` only: the one name both sides connect to. */
    path?: string;
    /** Path used by THIS side to send local socket bytes → server (`'http'`). */
    sendPath?: string;
    /** Path used by THIS side to receive server bytes → local socket (`'http'`). */
    recvPath?: string;
    /** Listen mode: bind locally; on connect, bridge through pipes. */
    listen?: {
        host?: string;
        port: number;
    };
    /** Connect mode: dial host:port; bridge that connection through pipes. */
    connect?: {
        host: string;
        port: number;
    };
    /** Receivers per pipe (default 1). */
    n?: number;
    /**
     * Idle time (ms) after which this side ends its send pipe cleanly and opens
     * a new one on the same path, so the server's 5-minute idle timeout never
     * ends a quiet tunnel. Nothing is added to the forwarded bytes: bytes the
     * local app writes meanwhile are held and sent on the new pipe. Needs a peer
     * running this SDK version or later. Once the peer's first pipe shows it is
     * an older forwarder, nothing is re-opened toward it and an idle tunnel
     * closes after about 5 minutes; before that the peer is unidentified, and an
     * older receiver takes the clean end after `keepaliveMs` as the app's
     * half-close. Must be below 300000 (the server's idle timeout). 0 disables
     * re-opening: an idle tunnel then closes after about 5 minutes.
     * Default 240000 (4 min).
     */
    keepaliveMs?: number;
    /** Abort signal — closes any active bridge. */
    signal?: AbortSignal;
};
export type PipeForwardTcpResult = {
    /**
     * Resolves when the forwarder is fully closed (server stopped, all bridges
     * drained). A bridge whose pipe ends abnormally (peer gone, server timeout)
     * closes its local socket rather than staying half-open.
     */
    done: Promise<void>;
    /** Stop accepting new connections / disconnect the active bridge. */
    close: () => void;
    /** When in listen mode, the bound local address (resolves once listening). */
    address: Promise<{
        host: string;
        port: number;
    }> | undefined;
};
export declare class PipeReceiveEmptyBodyError extends Error {
    readonly status: number;
    readonly headers: Headers;
    constructor(status: number, headers: Headers);
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
export declare function encodePipePath(path: string): string;
/** Strict client-side path validation — fail before wire round-trip. */
export declare function validatePipePath(path: string): void;
/**
 * Coerce an arbitrary `PipeSource` into a Web `ReadableStream<Uint8Array>`.
 * Throws `TypeError` for unsupported shapes.
 *
 * Note: never returns AsyncIterable — Bun's fetch streaming-body support is
 * inconsistent with raw async iterables across versions; ReadableStream is the
 * common stable substrate.
 */
export declare function coerceToReadableStream(source: PipeSource): ReadableStream<Uint8Array>;
/**
 * Parse a [INFO]/[ERROR] status line. Returns `null` for empty input.
 * Lines that don't match either prefix are returned as `level: 'info'`
 * with the full raw text so callers can still surface them.
 */
export declare function parseStatusLine(line: string): PipeStatusMessage | null;
/**
 * Stream a Web ReadableStream<Uint8Array> as `PipeStatusMessage` events,
 * handling chunk boundaries mid-line, CRLF/LF (CR alone NOT supported — the
 * pipe server always terminates with `\n`), and partial-tail-on-EOF
 * (an unterminated final line is dropped, NOT emitted, since the server
 * always terminates real status lines with `\n`).
 */
export declare function parseStatusStream(stream: ReadableStream<Uint8Array>): AsyncIterable<PipeStatusMessage>;
export { parseSseEvent, parseSseStream } from './sse-stream.js';
export type { SseEvent } from './sse-stream.js';
/** Encode a boolean for ?download / ?video / ?progress query strings. */
export declare function boolQuery(v: boolean | undefined): string | undefined;
export interface PipeStreamConfig {
    /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
    pipeBaseUrl: string;
    /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
    basePath?: string;
    /**
     * How requests are sent. `fromClient()` supplies the client's transport
     * (injected fetch + kitAuth); omitted, the global `fetch` is used with no
     * credentials.
     */
    transport?: PipeTransport;
    /**
     * Kit credential for WebSocket upgrades (connect(), forwardTcp `'ws'`),
     * which do not go through `transport`. `fromClient()` takes the client's.
     */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
}
export declare class PipeStream {
    private readonly baseUrl;
    private readonly basePath;
    private readonly transport;
    private readonly kitAuth;
    constructor(config: PipeStreamConfig);
    /**
     * Create a PipeStream from an already-constructed HoodyClient + container.
     * Relies on `client.getKitUrl('pipe', container, serviceIndex)`, and sends
     * through `client.http` so the client's injected transport and kitAuth
     * apply (lib/pipe-transport.ts).
     */
    static fromClient(client: {
        getKitUrl: (kit: string, container: unknown, idx?: number) => string;
    }, container: unknown, serviceIndex?: number): PipeStream;
    /** Build a full pipe URL for `path` with optional query params. A reserved name throws (see validatePipePath). */
    getUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string;
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
    send(path: string, source: PipeSource, opts?: PipeSendOptions): Promise<PipeSendResult>;
    /**
     * Receive bytes from pipe `path`. Returns the response body as a Web
     * ReadableStream — caller pipes to wherever (file, socket, stdout, ...).
     * Throws `PipeReceiveEmptyBodyError` if the response has no body.
     */
    receive(path: string, opts?: PipeReceiveOptions): Promise<PipeReceiveResult>;
    /**
     * The kit's `/api/v1/pipe/metrics` text (Prometheus 0.0.4): counters and
     * gauges with fixed labels, never a pipe name.
     */
    metrics(opts?: {
        signal?: AbortSignal;
    }): Promise<string>;
    /**
     * `?status` of `path` (`GET /{path}?status`): one JSON snapshot, no receiver
     * slot. With `transfer`, the state of that transfer instead: the name's
     * live record while it runs, then for a hashed transfer its receipt (kept
     * 10 minutes). An unknown or expired id throws (HTTP 404).
     */
    status(path: string, opts?: {
        transfer?: string;
        signal?: AbortSignal;
    }): Promise<PipeStatus>;
    /**
     * The `sha256` receive body: a pass-through that hashes what the caller
     * reads. Every exit reaches one settle(): EOF (then the receipt check),
     * cancel and signal abort (`incomplete`), and a source error (that error).
     */
    private verifyingBody;
    /**
     * After EOF: poll `?status&transfer=` every 100 ms (10 s at most) until the
     * transfer is terminal, then compare digests. The kit writes the receipt
     * before it closes the receivers, so the first poll is normally enough.
     */
    private checkReceipt;
    /**
     * Subscribe to a separate `?progress` SSE stream for live transfer state.
     * Does NOT consume a receiver slot — spectators are independent.
     * The stream ends after the `done` event, whose `state` says whether the
     * transfer completed or failed (with the kit's `reason`). Within 30 s after
     * a transfer on `path` ends, the kit answers 204 and this yields nothing.
     * Breaking out of the loop, or aborting `signal`, closes the connection.
     */
    subscribeProgress(path: string, opts?: {
        signal?: AbortSignal;
    }): AsyncIterable<PipeProgressEvent>;
    /** `ws(s)://…/{name}?ws[&wait=]` — the relay URL for `name` (no credential in it). */
    getWsUrl(name: string, opts?: {
        wait?: number | undefined;
    }): string;
    /**
     * Open a WebSocket relay connection on `name` (`GET /{name}?ws`). Two peers
     * on the same name exchange messages 1:1 (text stays text, binary stays
     * binary). Resolves once this peer's upgrade is accepted, before the other
     * peer arrives; messages sent meanwhile are queued by the kit (bounded).
     * Kit credentials go on the upgrade (headers via the `ws` package).
     */
    connect(name: string, opts?: PipeConnectOptions): Promise<PipeDuplex>;
    /** forwardTcp over one relay pair (wire protocol in lib/pipe-ws-forward.ts). */
    private forwardTcpWs;
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
    forwardTcp(opts: PipeForwardTcpOptions): PipeForwardTcpResult;
}
