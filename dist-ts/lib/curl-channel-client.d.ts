/** Execution mode passed via CurlRequest.mode. */
export type ExecutionMode = "sync" | "async";
/**
 * CurlRequest mirrors the server's serde shape (snake_case). Field set kept
 * in sync with the upstream curl protocol `CurlRequest`.
 *
 * Note: the following fields exist server-side but are REJECTED at validation
 * (`proxy`, `proxy_user`, `proxy_password`, `cacert`, `cert`, `key`) — they
 * are NOT exposed here because sending any of them returns 400. The TLS
 * client-cert fields (cacert/cert/key) accept filesystem paths; until the
 * server gets a `--cert-dir` flag they remain rejected.
 */
export interface CurlRequest {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    user_agent?: string;
    referer?: string;
    cookie?: string;
    auth_user?: string;
    auth_password?: string;
    auth_method?: "basic" | "digest" | "ntlm" | "negotiate";
    bearer_token?: string;
    data?: string;
    /**
     * Raw binary request body. SDK-internal: it is NEVER serialized into the
     * `request.start` JSON (the server would reject the unknown field). When
     * present on a binary-negotiated channel, the SDK strips it from the JSON
     * envelope and uploads the bytes in a separate binary WebSocket frame.
     * Takes precedence over `data`/`json`/`form`.
     */
    data_binary?: Uint8Array;
    json?: unknown;
    form?: Record<string, string>;
    timeout?: number;
    connect_timeout?: number;
    max_redirects?: number;
    follow_redirects?: boolean;
    max_filesize?: number;
    insecure?: boolean;
    cert_type?: "PEM" | "DER";
    compressed?: boolean;
    tcp_nodelay?: boolean;
    keepalive?: boolean;
    keepalive_time?: number;
    range?: string;
    speed_limit?: number;
    speed_time?: number;
    save?: boolean;
    save_path?: string;
    response?: "transparent" | "json";
    /** Server's ExecutionMode enum. Only meaningful on the REST /curl endpoint; the channel always streams. */
    mode?: ExecutionMode;
    job_name?: string;
    session_id?: string;
    retry_count?: number;
    retry_delay?: number;
    /** Cron expression for /schedule (not used on the channel). */
    schedule?: string;
}
export interface ResponseHeader {
    name: string;
    value: string;
}
export interface ResponseTiming {
    total: number;
    namelookup: number;
    connect: number;
    pretransfer: number;
    starttransfer: number;
    redirect: number;
}
export interface ResponseMetadata {
    effective_url: string;
    redirect_count: number;
    size_download: number;
    size_upload: number;
    speed_download: number;
    speed_upload: number;
    content_type: string | null;
}
export type ChannelClientMessage = {
    type: "request.start";
    stream_id: number;
    request: CurlRequest;
    /** When true, the request body follows in a separate binary frame. */
    binary_body?: boolean;
} | {
    type: "request.cancel";
    stream_id: number;
} | {
    type: "ping";
};
export interface ChannelLimits {
    max_concurrent_streams: number;
    max_queue: number;
    max_frame_bytes: number;
    max_request_bytes: number;
    chunk_bytes: number;
    stream_timeout_secs: number;
    idle_timeout_secs: number;
    max_outbound_messages: number;
}
export interface ChannelFeatures {
    buffered: boolean;
    streaming: boolean;
    cache: boolean;
    outbound_pooling: boolean;
    sse: boolean;
    /**
     * True when the server negotiated the binary-frame fast path (the client
     * opened the channel with `binary` enabled and the server supports it).
     * When true, response body chunks arrive as raw binary WebSocket frames
     * instead of base64-in-JSON `response.body` messages. Absent on servers
     * that predate the binary protocol.
     */
    binary_frames?: boolean;
}
export interface HelloMessage {
    type: "hello";
    version: number;
    connection_id: string;
    limits: ChannelLimits;
    features: ChannelFeatures;
}
export interface ResponseStartMessage {
    type: "response.start";
    stream_id: number;
    status_code: number;
    headers: Record<string, string>;
    raw_headers: ResponseHeader[];
    content_type: string | null;
    effective_url: string;
    body_bytes: number;
    /** True when upstream was text/event-stream and SSE promotion fired. */
    is_sse?: boolean;
}
export interface ResponseBodyMessage {
    type: "response.body";
    stream_id: number;
    offset: number;
    encoding: "base64";
    data: string;
}
export interface ResponseSseEventMessage {
    type: "response.sse_event";
    stream_id: number;
    seq: number;
    event: string;
    id?: string;
    data: string;
    retry?: number;
    data_truncated?: boolean;
}
export interface ResponseEndMessage {
    type: "response.end";
    stream_id: number;
    timing: ResponseTiming;
    metadata: ResponseMetadata;
    /** Number of SSE events emitted; only set for is_sse streams. */
    sse_events?: number;
}
export type ChannelErrorType = "validation_error" | "cancelled" | "timeout" | "queue_full" | "sse_capacity" | "sse_max_duration" | "execution_error" | "internal_error" | "protocol_error";
export interface ErrorMessage {
    type: "error";
    stream_id?: number;
    error_type: ChannelErrorType | string;
    message: string;
}
export interface PongMessage {
    type: "pong";
}
export interface AcceptedMessage {
    type: "accepted";
    stream_id: number;
}
export interface CancelledMessage {
    type: "cancelled";
    stream_id: number;
}
export type ChannelServerMessage = HelloMessage | PongMessage | AcceptedMessage | CancelledMessage | ResponseStartMessage | ResponseBodyMessage | ResponseSseEventMessage | ResponseEndMessage | ErrorMessage;
/** Parsed SSE event delivered via the typed-events iterator. */
export interface SseEvent {
    event: string;
    id?: string;
    data: string;
    retry?: number;
    /** True if the upstream event exceeded the server's per-event byte cap. */
    truncated?: boolean;
    /** Monotonic per-stream sequence number. */
    seq: number;
}
/** CurlChannel error surfaced as a JS Error. */
export declare class ChannelError extends Error {
    readonly errorType: string;
    readonly streamId?: number | undefined;
    readonly name = "ChannelError";
    constructor(message: string, errorType: string, streamId?: number | undefined);
}
/**
 * Thrown when an operation is aborted via AbortSignal or request.cancel.
 *
 * When the runtime exposes `DOMException` (modern browsers + Node 17+),
 * `createAbortError()` returns a real `DOMException` with `name="AbortError"`
 * (the WHATWG-spec shape — `instanceof DOMException` checks pass, `name` check
 * passes). On older runtimes (no global `DOMException`), it falls back to this
 * `Error` subclass with `name="AbortError"` and a `cause` field.
 *
 * Both shapes satisfy the most common `err.name === "AbortError"` test, which
 * is what the fetch spec actually requires consumers to use.
 */
export declare class AbortError extends Error {
    readonly name = "AbortError";
    constructor(message?: string, options?: {
        cause?: unknown;
    });
}
/**
 * Construct an abort-flavored error. Returns a real `DOMException` when the
 * runtime supports it, otherwise the `AbortError` class above. Either way,
 * `err.name === "AbortError"` is true and `err instanceof Error` is true.
 */
export declare function createAbortError(message?: string, cause?: unknown): Error;
/** A value the transport can put on the wire. Strings are JSON control/data
 * frames; binary values are pre-encoded channel binary frames. */
export type WsSendData = string | ArrayBufferLike | ArrayBufferView;
export interface WsLike {
    readonly readyState: number;
    /** Set to `"arraybuffer"` so inbound binary frames arrive as ArrayBuffers
     * (uniform across the global WebSocket and the `ws` package). */
    binaryType?: string;
    send(data: WsSendData): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: "open", listener: () => void): void;
    addEventListener(type: "message", listener: (ev: {
        data: unknown;
    }) => void): void;
    addEventListener(type: "close", listener: (ev: {
        code: number;
        reason: string;
    }) => void): void;
    addEventListener(type: "error", listener: (ev: unknown) => void): void;
}
export declare const WS_OPEN = 1;
export declare function openWebSocket(url: string): Promise<WsLike>;
/** Maximum buffered SSE events per stream before the SDK cancels the upstream and emits a `dropped` synthetic event. Protects against memory-DoS from hostile/fast upstreams. */
export declare const SSE_EVENT_QUEUE_CAP = 4096;
/** Maximum inbound WS frame size the SDK will JSON.parse. Frames larger than this drop the connection. */
export declare const MAX_INBOUND_FRAME_BYTES: number;
/** Configuration for opening a channel. */
export interface ChannelOptions {
    /** WebSocket URL, e.g. `wss://example.com/api/v1/curl/channel`. */
    url: string;
    /** Override the wait for the server's `hello` frame (default 10_000 ms). */
    helloTimeoutMs?: number;
    /** Send a `ping` every N ms to keep idle connections alive (default 25_000). 0 disables. */
    pingIntervalMs?: number;
    /**
     * Suppress the warning that fires when the channel URL is `ws://` and any
     * request includes credential fields (bearer_token, auth_password, cookie,
     * session_id). Set true ONLY if you've independently secured the transport
     * (e.g., loopback / private network).
     */
    silenceInsecureTransportWarning?: boolean;
    /**
     * Auto-reconnect policy. Default ON with exponential backoff. In-flight
     * streams at the moment of disconnect are STILL rejected — reconnect only
     * helps NEW requests issued after the WS reopens. Set `enabled: false` to
     * preserve the v0 behavior (one connection, no reconnect).
     */
    reconnect?: ReconnectOptions;
    /** Observability hooks. All optional; called inline at the relevant lifecycle point. */
    hooks?: ChannelHooks;
    /**
     * Opt into the binary-frame fast path (default `true`). When enabled the
     * SDK opens the channel with `?binary=1`; if the server advertises
     * `features.binary_frames`, response body chunks arrive as raw binary
     * WebSocket frames (no base64 inflation, no JSON parse) and binary request
     * bodies (`CurlRequest.data_binary`) upload as binary frames. Falls back
     * transparently to the text/JSON protocol against servers that don't
     * support it. Set `false` to force the legacy text protocol.
     */
    binary?: boolean;
}
/** Auto-reconnect configuration. */
export interface ReconnectOptions {
    /** Default `true`. */
    enabled?: boolean;
    /** Maximum reconnect attempts (default `Infinity`). */
    maxAttempts?: number;
    /** Initial backoff in ms (default `500`). Each failed attempt doubles up to `maxBackoffMs`. */
    initialBackoffMs?: number;
    /** Cap on backoff (default `30_000` ms). */
    maxBackoffMs?: number;
    /** Jitter range as a fraction of the computed backoff (default `0.2` = ±20%). */
    jitter?: number;
}
/** Lifecycle hooks. */
export interface ChannelHooks {
    /** Fired after the server's `hello` frame is received (initial or reconnect). */
    onOpen?: (hello: ChannelHello) => void;
    /** Fired when the WebSocket closes for any reason. */
    onClose?: (info: {
        code: number;
        reason: string;
        willReconnect: boolean;
    }) => void;
    /** Fired before each reconnect attempt (after the first failure). */
    onReconnecting?: (info: {
        attempt: number;
        backoffMs: number;
    }) => void;
    /** Fired when a request is issued via `request()`. */
    onRequestStart?: (info: {
        streamId: number;
        url: string;
        method: string;
    }) => void;
    /** Fired when the server emits `response.start` for any stream. */
    onResponseStart?: (info: {
        streamId: number;
        status: number;
        isSse: boolean;
    }) => void;
    /** Fired when the server emits `response.end` for any stream. */
    onResponseEnd?: (info: {
        streamId: number;
        totalBytes: number;
        sseEvents?: number;
    }) => void;
    /** Fired on connection-level errors (does not duplicate per-stream errors). */
    onError?: (err: Error) => void;
}
/** Server's initial `hello` advertisement (limits + features). */
export type ChannelHello = Omit<HelloMessage, "type">;
/** Per-stream handle returned by `CurlChannel.request()`. */
export declare class CurlChannelStream {
    /** Resolves once the server emits `response.start`. */
    readonly start: Promise<ResponseStartMessage>;
    /** Resolves once the server emits `response.end` (or rejects on error). */
    readonly end: Promise<ResponseEndMessage>;
    /**
     * ReadableStream of body bytes for non-SSE responses (chunked). Only ONE of
     * `bodyStream` or `body()` may be consumed — they share the same underlying
     * source. Calling `body()` locks/drains the stream.
     */
    readonly bodyStream: ReadableStream<Uint8Array>;
    /** Async iterable of typed SSE events (only meaningful when start.is_sse). */
    readonly events: AsyncIterable<SseEvent>;
    /** Trigger server-side cancellation. */
    readonly cancel: () => void;
    /** @internal */ readonly _streamId: number;
    /** @internal */ _resolveStart: (m: ResponseStartMessage) => void;
    /** @internal */ _rejectStart: (e: Error) => void;
    /** @internal */ _resolveEnd: (m: ResponseEndMessage) => void;
    /** @internal */ _rejectEnd: (e: Error) => void;
    /** @internal */ _enqueueBodyChunk: (chunk: Uint8Array) => void;
    /** @internal */ _enqueueSseEvent: (ev: SseEvent) => void;
    /** @internal */ _closeBody: () => void;
    /** @internal */ _errorBody: (e: Error) => void;
    /** @internal */ _closeEvents: () => void;
    /** @internal */ _errorEvents: (e: Error) => void;
    constructor(streamId: number, sendCancel: () => void);
    /**
     * Drain `bodyStream` into a single `Uint8Array`. Convenience for callers
     * that don't need streaming. Locks the stream — incompatible with
     * `bodyStream` direct consumption.
     */
    body(): Promise<Uint8Array>;
}
/** Per-request invocation options. */
export interface RequestOptions {
    /** AbortController integration — cancel mid-flight. */
    signal?: AbortSignal;
    /**
     * Hard cap on time-to-first-byte (server `response.start`). If exceeded, the
     * SDK fires the cancel and rejects with AbortError. Defaults to no timeout.
     * Recommended for any production code path to prevent hangs on dead WS.
     */
    timeoutMs?: number;
}
/** Main entry point: open a channel, then `.request(curlRequest, {signal})`. */
export declare class CurlChannel {
    private ws;
    private nextStreamId;
    private streams;
    private helloPromise;
    private resolveHello;
    private rejectHello;
    private helloSettled;
    private connectionReady;
    private resolveConnectionReady;
    private rejectConnectionReady;
    private hello;
    private closed;
    private closeError;
    private pingTimer;
    private reconnectTimer;
    private reconnectAttempt;
    private readonly options;
    private readonly reconnectCfg;
    private readonly hooks;
    private readonly isInsecureTransport;
    private readonly silenceInsecureWarning;
    private warnedInsecure;
    private warnedUnknownTypes;
    /** Whether the client requested the binary fast path (`?binary=1`). */
    private readonly wantBinary;
    /** The URL actually passed to the WebSocket constructor (may carry `?binary=1`). */
    private readonly connectUrl;
    /** True once the server's `hello` confirmed `features.binary_frames`. */
    private binaryNegotiated;
    private warnedBinaryFrame;
    constructor(options: ChannelOptions);
    /**
     * invoke a user hook with a try/catch so a throwing
     * callback can NEVER break the channel state machine (strand in-flight
     * streams, skip reconnect, etc.). A hook that throws gets its error
     * console.warn'd and swallowed.
     */
    private callHook;
    /** Replace `connectionReady` with a fresh pending promise for the next
     * connection cycle. Called at construction and before each reconnect.
     *
     * the PREVIOUS promise must be settled, not abandoned.
     * A request issued before the first hello binds (via `whenReady()`) to the
     * then-current instance; if we just replace it, that awaiter would hang
     * forever. We reject the old one with a `SUPERSEDED` sentinel — `whenReady`
     * recognizes it and loops onto the fresh instance instead of failing. */
    private static readonly SUPERSEDED;
    private renewConnectionReady;
    /**
     * Resolve once the CURRENT connection is ready, transparently riding
     * across reconnect cycles. Each `connectionReady` either resolves (this
     * socket's hello arrived → caller may send) or rejects: with the
     * SUPERSEDED sentinel (a reconnect renewed it → loop onto the fresh one)
     * or with a real error when the channel is permanently closed (propagate).
     */
    private whenReady;
    /** Compute backoff for the current attempt with optional jitter. */
    private nextBackoff;
    /** Schedule the next reconnect attempt, or give up + permanently close. */
    private scheduleReconnect;
    /** Terminal close: reconnect exhausted or disabled. Settles the once-only
     * helloPromise (reject if never connected) and the connectionReady signal. */
    private permanentlyClose;
    private maybeWarnInsecureTransport;
    /** Static opener; awaits the WebSocket open + `hello` frame before resolving. */
    static open(options: ChannelOptions): Promise<CurlChannel>;
    /** Promise that resolves once the server's `hello` frame arrives. */
    ready(): Promise<ChannelHello>;
    /** Issue a CurlRequest. Resolves to a CurlChannelStream you can consume. */
    request(req: CurlRequest, opts?: RequestOptions): CurlChannelStream;
    /** Close the channel (and the underlying WebSocket). */
    close(): void;
    private connect;
    /** Tear down the connection when an inbound frame exceeds the SDK's hard cap. */
    private closeForOversizeFrame;
    private warnBinaryFrameOnce;
    /** Normalize an inbound binary WS payload to bytes, then route it.
     *
     * The transport forces `binaryType = "arraybuffer"`, so frames arrive
     * synchronously as `ArrayBuffer` (or a view). A `Blob` is NOT handled: its
     * `arrayBuffer()` is async, and a `response.end` frame arriving in the
     * meantime would close the stream before the chunk could be routed —
     * silently dropping body bytes. If a runtime ever delivers a Blob despite
     * the `binaryType` request, we warn rather than corrupt the body. */
    private handleBinaryFrame;
    /** Decode a 16-byte binary frame header and hand the payload to its stream. */
    private routeBinaryFrame;
    private handleServerMessage;
}
/** Configuration for `createCurlFetch`. */
export interface CurlFetchOptions extends ChannelOptions {
    /**
     * Pre-existing channel to reuse instead of opening a new one. When set, the
     * `url` field is still required by ChannelOptions but ignored.
     */
    channel?: CurlChannel;
    /**
     * Override how fetch() converts upstream SSE responses. Default `"stream"`
     * returns a Response with a streaming body of raw SSE bytes (fetch-compatible
     * with EventSource/`res.body.getReader()`). Pass `"buffered"` to instead wait
     * for the entire SSE stream to complete and return the joined bytes (rare;
     * mostly for testing).
     */
    sseMode?: "stream" | "buffered";
    /**
     * Default options merged into every CurlRequest. Useful for setting things
     * like `session_id`, `bearer_token`, `user_agent` once. Per-call init
     * always wins.
     */
    defaults?: Partial<CurlRequest>;
    /**
     * Compress the REQUEST body before sending. `"gzip"` runs the body
     * through `CompressionStream("gzip")` and sets `Content-Encoding: gzip`
     * on the upstream request; the relay passes the bytes verbatim, so the
     * upstream sees compressed bytes and is responsible for decompression
     * (most modern servers handle it transparently when the body is large
     * enough to matter).
     *
     * Default: `"none"`. Opt-in only — auto-gzipping every body would
     * silently break upstreams that don't accept Content-Encoding on
     * requests.
     */
    requestEncoding?: "gzip" | "none";
}
/** The fetch-compatible function returned by `createCurlFetch`. */
export type CurlFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
/** Build a fetch-shaped function bound to a the upstream curl kit channel. */
export declare function createCurlFetch(options: CurlFetchOptions): CurlFetch;
