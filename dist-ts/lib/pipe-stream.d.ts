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
export type PipeProgressEvent = {
    kind: 'state';
    state: 'idle' | 'waiting' | 'streaming' | 'complete' | 'failed';
    ts: number;
} | {
    kind: 'progress';
    bytesTransferred: number;
    speed: number;
    eta: number;
    receivers: number;
    ts: number;
} | {
    kind: 'done';
    bytesTransferred: number;
    duration: number;
    avgSpeed: number;
    ts: number;
};
export type PipeForwardTcpOptions = {
    /** Path used by THIS side to send local socket bytes → server. */
    sendPath: string;
    /** Path used by THIS side to receive server bytes → local socket. */
    recvPath: string;
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
/** Parse a single SSE event block (without trailing blank-line separator). */
export declare function parseSseEvent(block: string): SseEvent | null;
/**
 * Parse an SSE stream into discrete events. Handles partial chunks across
 * read boundaries; skips `:keepalive` comment blocks; tolerates CRLF/LF/CR.
 */
export declare function parseSseStream(stream: ReadableStream<Uint8Array>): AsyncIterable<SseEvent>;
/** Encode a boolean for ?download / ?video / ?progress query strings. */
export declare function boolQuery(v: boolean | undefined): string | undefined;
export interface PipeStreamConfig {
    /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
    pipeBaseUrl: string;
    /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
    basePath?: string;
}
export declare class PipeStream {
    private readonly baseUrl;
    private readonly basePath;
    constructor(config: PipeStreamConfig);
    /**
     * Create a PipeStream from an already-constructed HoodyClient + container.
     * Relies on `client.getKitUrl('pipe', container, serviceIndex)`.
     */
    static fromClient(client: {
        getKitUrl: (kit: string, container: unknown, idx?: number) => string;
    }, container: unknown, serviceIndex?: number): PipeStream;
    /** Build a full pipe URL for `path` with optional query params. */
    getUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string;
    /**
     * Send `source` bytes to pipe `path`. Returns once the server has accepted
     * the request and started streaming status messages; the `done` promise
     * resolves when the full transfer is complete (response body drained).
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
     * Subscribe to a separate `?progress` SSE stream for live transfer state.
     * Does NOT consume a receiver slot — spectators are independent.
     */
    subscribeProgress(path: string, opts?: {
        signal?: AbortSignal;
    }): AsyncIterable<PipeProgressEvent>;
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
    forwardTcp(opts: PipeForwardTcpOptions): PipeForwardTcpResult;
}
