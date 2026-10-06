/**
 * Browser-compatible HTTP Client for Hoody SDK
 *
 * Kept in lib/ (not auto-generated). Used by the browser bundle via esbuild
 * resolution of `http-client.js` imports.
 */
import { ApiError } from '../generated/errors.js';
export interface IHttpClientMiddlewareRequestContext {
    requestId: string;
    attempt: number;
    method: string;
    path: string;
    url: string;
    query?: Record<string, unknown>;
    headers: Record<string, string>;
    body?: unknown;
    timeoutMs: number;
    retries: number;
    middlewareContext?: Record<string, unknown>;
}
export interface IHttpClientMiddlewareResponseContext<T = unknown> extends IHttpClientMiddlewareRequestContext {
    /**
     * Raw fetch Response.
     *
     * Use `response.headers.get('x-hoody-signature')` when you need Hoody
     * response-signature metadata. The body is UNREAD: the client parses its
     * own copy, so a middleware may read this one (`await context.response.text()`).
     */
    response: Response;
    data: T;
    /**
     * The exact response bytes, before any parsing. Present only when
     * `captureRawBody` is set on the client config or the request: what a
     * signature check over the body needs (lib/signing.ts), since re-serialising
     * the parsed data does not reproduce the signed bytes.
     */
    rawBody?: Uint8Array;
}
export interface IHttpClientMiddlewareErrorContext extends IHttpClientMiddlewareRequestContext {
    error: ApiError;
}
/**
 * Request, response and error hooks. An onRequest hook may change the request,
 * its destination included. A middleware that sends a request to another host
 * sends it there with whatever body the call carries (a new password, for
 * instance): the client withholds only credentials it adds itself (the
 * bearer and kit credentials it set for the original destination, and the
 * refresh token), and refuses its own login, 2FA and token calls outside the
 * API. Routing a request elsewhere is the middleware's decision, and so is
 * what that destination receives.
 */
export interface IHttpClientMiddleware {
    onRequest?: (context: IHttpClientMiddlewareRequestContext) => IHttpClientMiddlewareRequestContext | void | Promise<IHttpClientMiddlewareRequestContext | void>;
    onResponse?: <T = unknown>(context: IHttpClientMiddlewareResponseContext<T>) => IHttpClientMiddlewareResponseContext<T> | void | Promise<IHttpClientMiddlewareResponseContext<T> | void>;
    onError?: (context: IHttpClientMiddlewareErrorContext) => void | Promise<void>;
}
/** The transport slot (parity with the generated Node client): a caller-supplied fetch. */
export type HoodyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface IHttpClientConfig {
    baseURL?: string;
    token?: string;
    /**
     * The fetch this client uses for EVERY request. Resolved once in the constructor and retained, so a
     * later reassignment of the global cannot change the transport (hoody-bot injects its egress-policed
     * fetch here and verifies it through `getFetch()`). Absent → the runtime's global fetch, bound.
     */
    fetch?: HoodyFetch;
    timeout?: number;
    retries?: number;
    retryDelayMs?: number;
    retryOnStatuses?: number[];
    headers?: Record<string, string>;
    /**
     * GET response cache. OFF unless `enabled: true`: a cached GET never reaches
     * the server, and kit GETs that change state or report it (a browser
     * start, a command's status, a screenshot) returned the first answer for
     * five seconds. A request's own `cache` option (true, false, or
     * a TTL in milliseconds) overrides this per call.
     */
    cache?: {
        enabled?: boolean;
        ttl?: number;
    };
    /**
     * Hand response middleware the exact response bytes as `rawBody`. Off by
     * default; a request can opt in alone with `captureRawBody: true`.
     */
    captureRawBody?: boolean;
    transport?: IHttpClientTransportConfig;
    /**
     * Kept for parity with the Node client; ignored in the browser.
     */
    forceIPv4?: boolean;
    /**
     * Kept for parity with the Node client; ignored in the browser.
     */
    forceIPv4Cache?: IForceIPv4CacheConfig;
    middlewares?: IHttpClientMiddleware[];
    /**
     * Request steps that run after every middleware, including middleware
     * added later with use() or setMiddlewares(), neither of which can remove or
     * reorder them. Credential confinement runs after each step, as after a
     * middleware. Each receives the request's routeTag (IRequestData.routeTag).
     *
     * Read once, at construction, into a private field: the client's config
     * does not carry them afterwards, so changing or copying config does not
     * reach them, and a new HttpClient built from another one's config has
     * none (it is a plain transport, without the SDK's routing policy).
     * HoodyClient sets this itself (realm scope, refresh credential); a value
     * passed in HoodyClientConfig is replaced.
     */
    finalizers?: Array<(context: IHttpClientMiddlewareRequestContext, routeTag: object | undefined) => IHttpClientMiddlewareRequestContext | Promise<IHttpClientMiddlewareRequestContext>>;
    /**
     * Global error hook — called on every request error before the retry loop
     * decides whether to continue. Return `true` to force one more retry (beyond
     * status-based retry policy); return `false` to let shouldRetry decide.
     *
     * Invoked once per failing attempt. For 401-specific refresh, prefer
     * `onTokenExpired`/`onKitAuthExpired`, which trigger a one-shot replay outside
     * the retry budget. Middleware `onError` hooks are a finer-grained
     * alternative for cross-cutting transforms.
     */
    onError?: (error: ApiError) => Promise<boolean>;
    /**
     * Called when a 401 is received. Return a fresh token to auto-retry once.
     */
    onTokenExpired?: (error: ApiError) => Promise<string | undefined>;
    /**
     * Called when a Kit 401 is received. Return fresh ProxyAuth to auto-retry once.
     */
    onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<unknown>;
    /**
     * The largest event-stream frame a stream from this client holds, in UTF-8
     * bytes. Default DEFAULT_MAX_STREAM_FRAME_BYTES (16 MiB); a call's
     * `maxFrameBytes` overrides it. Only a whole number above 0 is used;
     * anything else keeps the default. A larger frame ends the stream with an
     * ApiError of code STREAM_FRAME_TOO_LARGE.
     */
    maxStreamFrameBytes?: number;
    /**
     * Receives the original of every error an event stream from this client
     * replaces with fixed text, when the call passes no
     * `onDiagnostic` of its own (the generated event-stream methods pass
     * none). Route it to a diagnostic sink, redacted; never to a user, a View
     * or a model. A sink that throws is ignored.
     */
    onStreamDiagnostic?: (error: unknown) => void;
    /**
     * Fallback refresh callback when onTokenExpired is not provided.
     * Return a fresh token to auto-retry once.
     */
    refreshToken?: () => Promise<string | undefined>;
    /**
     * Asked synchronously, right before a token returned by onTokenExpired or
     * refreshToken is installed and the request replayed. Return false to drop
     * it (the request then fails with the original 401): the owner of the
     * token can decide at the last moment that the recovery it came from is no
     * longer current (HoodyClient: logout, adoptSession or setToken happened
     * while the recovery was awaiting). Defaults to accepting every token.
     */
    acceptRefreshedToken?: (token: string) => boolean;
    /**
     * Enables one-time auth retry on 401 responses.
     */
    autoRetryAuth?: boolean;
    /**
     * Unique client instance identifier. Sent as X-Hoody-Client-ID header on every request.
     */
    clientId?: string;
    /**
     * Human-readable client name. Sent as X-Hoody-Client-Name header on every request.
     */
    clientName?: string;
}
export interface IHttpClientTransportConfig {
    /**
     * Mapped to fetch keepalive. Browser connection pooling is managed by the runtime.
     */
    keepAlive?: boolean;
    /**
     * Node-only setting; accepted for config parity.
     */
    connections?: number;
    /**
     * Node-only setting; accepted for config parity.
     */
    pipelining?: number;
    /**
     * Node-only setting; accepted for config parity.
     */
    keepAliveTimeoutMs?: number;
    /**
     * Node-only setting; accepted for config parity.
     */
    keepAliveMaxTimeoutMs?: number;
    /**
     * Node-only setting; accepted for config parity.
     */
    dispatcher?: unknown;
}
export interface IForceIPv4CacheConfig {
    enabled?: boolean;
    ttlMs?: number;
}
export interface IRequestData {
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: unknown;
    /**
     * This GET's cache: `true` caches (client TTL), a number caches for that many
     * milliseconds, `false` bypasses. Absent → the client's `cache.enabled`.
     */
    cache?: boolean | number;
    /** Hand response middleware the exact response bytes as `rawBody`. */
    captureRawBody?: boolean;
    /**
     * A string body is a JSON value: it is JSON-encoded once when the request is
     * sent as JSON, and sent verbatim under any other Content-Type.
     */
    jsonStringBody?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
    retryOnStatuses?: number[];
    middlewareContext?: Record<string, unknown>;
    authRetry?: boolean;
    /**
     * When `true`, skip ApiResponse envelope normalization and return the raw
     * parsed body directly.
     *
     * ⚠️  TYPE LIE ⚠️  The declared return type of every generated SDK method
     * is the ENVELOPED shape (`ApiResponse<...>`). When `rawResponse: true`,
     * the runtime return value is the UNWRAPPED body (`T` where `T` depends on
     * `responseType`: object for `json`, string for `text`, ArrayBuffer for
     * `arrayBuffer`, Blob for `blob`). Callers MUST cast to `unknown` (or the
     * real raw shape) after the call — the TypeScript declaration cannot
     * discriminate on a runtime boolean.
     *
     * Prefer a typed wrapper in your consumer code:
     * ```ts
     * const raw = (await client.foo.bar({rawResponse: true})) as unknown as string;
     * ```
     */
    rawResponse?: boolean;
    responseType?: 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob';
    /**
     * Opaque tag a HoodyClient generated service attaches to its own request.
     * The transport hands it to the finalizers and to nothing else: request
     * middleware does not see it, so a middleware cannot copy it onto another
     * request. Code that replaces the client's request methods sees the
     * request data and so the tag; that is instrumenting the SDK's internals.
     * HoodyClient accepts a tag only from the client that issued it, and only
     * until the call it was issued for has settled (see _RouteDecision there).
     */
    routeTag?: object;
    /**
     * fetch redirect mode. 'error' refuses every redirect, same-origin ones
     * included (the request fails instead): HoodyClient sends credential-bearing
     * auth calls this way, so a redirect cannot replay their body to another
     * origin. hoody-api does not redirect those routes. Absent: follow.
     * request(), stream() and streamEvents() all honour it.
     */
    redirect?: 'follow' | 'error';
}
/**
 * Whether a Content-Type names JSON: application/json or a structured-syntax
 * +json type (application/problem+json, application/manifest+json), parameters
 * and case aside. application/json-seq, application/jsonx, text/json and two
 * types folded into one header are not JSON: such a body is read as text.
 */
export declare function isJsonContentType(contentType: string | null | undefined): boolean;
/**
 * One decoded server-sent event.
 *
 * `event` is the SSE event name, defaulting to `message` exactly as the
 * WHATWG spec does. `raw` is the event's data payload with its `data:`
 * prefixes stripped and multi-line payloads rejoined with newlines — the
 * bytes a caller would JSON.parse. `seq` is the `id:` line when it is a
 * plain integer: the hoody-agent gateway writes its monotonic cursor there,
 * and that cursor is what a resume passes back as `since`.
 */
export interface IStreamEvent {
    /** Numeric `id:` — the gateway's replay cursor, when the server sends one. */
    seq?: number;
    /** Raw `id:` line, numeric or not. Mirrors Last-Event-ID semantics. */
    id?: string;
    /** SSE event name; `message` when the server sends no `event:` line. */
    event: string;
    /** The event's data payload, `data:` prefixes stripped. */
    raw: string;
    /** The server's reconnection hint in milliseconds, from a `retry:` line. */
    retry?: number;
}
export interface IStreamEventsOptions {
    /**
     * Cancels the stream. Aborting after the response headers have arrived
     * cancels the body reader and makes the iteration throw, so a consumer that
     * wraps the loop in try/finally always runs its cleanup.
     */
    signal?: AbortSignal;
    /**
     * Replay cursor. Sent as the `Last-Event-ID` request header (the header the
     * WHATWG EventSource reconnect uses, and the one hoody-proxy's log stream
     * documents) unless `sinceParam` names a query parameter instead.
     */
    since?: string | number;
    /**
     * Send `since` as this QUERY parameter instead of the `Last-Event-ID`
     * header — the hoody-agent gateway and hoody-watch both resume that way.
     */
    sinceParam?: string;
    /**
     * The response headers the operation's spec documents, as
     * `{ name: 'Header-Name' }`. Each one the server sends is copied onto
     * `response.documented[name]`. Generated stream methods fill this in.
     */
    documentedHeaders?: Record<string, string>;
    /**
     * The largest frame this stream holds, in UTF-8 bytes of its field lines
     * (the `data:` payload and the rest of the frame). Overrides the client's
     * `maxStreamFrameBytes` when it is a whole number above 0 (anything else
     * is passed over). A frame over it ends the stream with an
     * `ApiError` of code `STREAM_FRAME_TOO_LARGE`; see
     * DEFAULT_MAX_STREAM_FRAME_BYTES.
     */
    maxFrameBytes?: number;
    /**
     * Receives the original of every error the stream replaces. A stream
     * raises only fixed-text errors (a code, a fixed sentence, the status):
     * never a transport exception's message, a server's error text or body, a
     * content type or an abort reason, any of which can hold a credential.
     * Route what this receives to a diagnostic sink, redacted; never to a
     * user, a View or a model. A sink that throws is ignored. Without it the
     * client's `onStreamDiagnostic` receives them.
     */
    onDiagnostic?: (error: unknown) => void;
}
/**
 * The frame size a stream holds when neither the call nor the client sets
 * one: 16 MiB. Without a bound a server that never ends a line, or never
 * ends a frame, grows the parser's buffer until the process runs out of
 * memory. The check runs as each chunk is parsed, so what is held at once
 * is at most this plus one read of the body.
 */
export declare const DEFAULT_MAX_STREAM_FRAME_BYTES: number;
/**
 * What an event stream's response said before its first frame.
 *
 * A stream's headers never reach response middleware (the body is still
 * open when the method returns), so this is the only place a caller can
 * read them: hoody-agent's prompt:stream sends the dispatched turn's id in
 * `X-Hoody-Turn-Id`, and that id is what a scoped cancel names.
 */
export interface IStreamResponse<TDocumented extends object = Record<never, string>> {
    /** The HTTP status of the accepted stream (a 2xx). */
    status: number;
    /**
     * Every response header the runtime lets the caller read. A browser
     * shows only the CORS-safelisted ones and those the server lists in
     * `Access-Control-Expose-Headers`.
     */
    headers: Headers;
    /**
     * The headers the operation's spec documents, by parameter-style name
     * (`X-Hoody-Turn-Id` is `XHoodyTurnId`). A header the server did not
     * send, or the browser did not expose, is absent.
     */
    documented: TDocumented;
}
/**
 * The iterator an event-stream method returns.
 *
 * It is still lazy: the request goes out on the first `next()` or the
 * first read of `response`, whichever comes first (reading `response`
 * first holds the first frame for the first `next()`). `response`
 * resolves as soon as the stream is accepted, before the first event is
 * yielded, so it can be awaited before the loop or inside it. It rejects with
 * the error the iteration throws when the request fails, and with an error
 * named `StreamClosedError` when the iterator is closed or ends before any
 * response was accepted. A rejection nobody awaits is never reported as
 * unhandled: the iteration raises it anyway. `return()` and `throw()`
 * cancel the body at once, even while a read is waiting for a frame.
 */
export interface IEventStream<TDocumented extends object = Record<never, string>> extends AsyncIterableIterator<IStreamEvent> {
    /** Settles once the stream is accepted or has failed; see the interface. */
    readonly response: Promise<IStreamResponse<TDocumented>>;
    next(): Promise<IteratorResult<IStreamEvent, void>>;
    return(value?: void): Promise<IteratorResult<IStreamEvent, void>>;
    throw(error?: unknown): Promise<IteratorResult<IStreamEvent, void>>;
}
/**
 * Parser state, carried across chunk boundaries.
 *
 * The partially-built EVENT lives here, not just the partially-read line: a
 * frame split between two TCP segments has its `event:` line in one chunk and
 * its `data:` line in the next, and state held in a local would lose the first
 * half on every split.
 */
export interface IStreamFrameBuffer {
    /**
     * The line read so far that no line break has ended yet, as the pieces it
     * arrived in. They are joined once, when the line ends, so a long line fed
     * in many small chunks is scanned and copied once rather than on every
     * chunk.
     */
    pendingParts: string[];
    /**
     * True when the last character read was a CR. It ended its line at once;
     * an LF that arrives next, in this chunk or the next one, belongs to the
     * same line break and is skipped. Where a chunk ends therefore never
     * changes what is parsed or what it costs.
     */
    afterCR: boolean;
    /** True when the last pending piece ends in a high surrogate that the next piece may pair. */
    pendingHighSurrogate: boolean;
    /** True until the first character has been inspected for a BOM. */
    atStart: boolean;
    /** The `event:` name of the frame being built. */
    eventName: string;
    /** The `data:` lines of the frame being built. */
    dataLines: string[];
    /** The `id:` of the frame being built. */
    id?: string;
    /**
     * The server's current reconnection hint, in milliseconds.
     *
     * Persists across events, as the WHATWG spec requires: `retry:` sets the
     * connection's reconnection time, and the gateway sends it once as the very
     * first frame of a stream.
     */
    retry?: number;
    /** The frame size limit in UTF-8 bytes; no limit when absent. */
    maxFrameBytes?: number;
    /** UTF-8 bytes of the lines the frame being built has ended so far, one byte per line break. */
    frameBytes: number;
    /** UTF-8 bytes of the pending pieces. */
    pendingBytes: number;
    /**
     * Set once a frame outgrew `maxFrameBytes`: the size it had reached. The
     * parser then stops, returning the events it completed before, and every
     * later call returns none.
     */
    overflowBytes?: number;
}
/** A fresh parser state, holding frames of at most `maxFrameBytes` when given. */
export declare function createStreamFrameBuffer(maxFrameBytes?: number): IStreamFrameBuffer;
/**
 * Feed one decoded chunk in, get whole events out.
 *
 * Incremental by construction: a chunk that ends mid-event leaves the partial
 * line and the partially-built event on `buffer` and yields nothing, so a
 * frame split across any number of TCP segments is assembled rather than
 * dropped. Line endings may be LF, CRLF or bare CR and may differ between
 * lines of the same event. Only the new chunk is scanned, so the work is
 * linear in the bytes received however the server splits them, and the
 * result does not depend on where the chunks end.
 *
 * The frame limit counts the UTF-8 bytes of the frame's lines, one byte per
 * line break (a CRLF counts one), and the line still being read. It is
 * checked as each line ends and once more when the chunk is used up.
 *
 * Comment lines (a leading colon, which is how every heartbeat on the platform
 * is written) advance the stream without producing an event. A field with no
 * colon is a field with an empty value, per the spec.
 *
 * One deliberate departure from WHATWG: `id` is NOT inherited by a later frame
 * that carries none. On this platform `id` is the gateway's replay cursor, and
 * reporting a previous frame's cursor as this frame's `seq` would make a
 * consumer resume from the wrong place. The reconnection hint (`retry`) does
 * persist, because it describes the connection rather than an event.
 */
export declare function parseSseChunk(buffer: IStreamFrameBuffer, chunk: string): IStreamEvent[];
/**
 * End of the body: the frame the server ended by closing rather than with a
 * blank line is dispatched, its last line charged the bytes it had (no line
 * break arrived for it). Check `overflowBytes` afterwards: a frame over the
 * limit here is refused like any other, never dropped without a word.
 */
export declare function finishSseStream(buffer: IStreamFrameBuffer): IStreamEvent[];
export declare class HttpClient {
    #private;
    private readonly config;
    private cache;
    private requestCounter;
    /**
     * The INJECTED transport, or null. Kept separate from the config on purpose: with no injection the
     * client reads the runtime's CURRENT global fetch at every request (browsers and test harnesses swap
     * it after construction), while an injected one is retained and can never be swapped from outside.
     */
    private readonly fetchImpl;
    /**
     * The transport options the CALLER passed, or null. `config.transport` holds them with every
     * default filled in, so a derivation that copied it handed each child a full set of Node-only
     * knobs the caller never set, and every box client warned that they are ignored.
     */
    private readonly configuredTransport;
    constructor(config?: IHttpClientConfig);
    /** The transport this client will use — lets a caller assert the injection took effect. */
    getFetch(): HoodyFetch;
    /**
     * The transport the CALLER injected, or `undefined` when none was.
     *
     * The one accessor every derivation uses (`withRealm`, `withContainer`, the realm-error
     * introspection client). It exists because the two HTTP implementations store the injection
     * differently — Node resolves it into `config.fetch`, the browser keeps it out of `config` on
     * purpose — so a derivation that reads `config.fetch` (an earlier version did) silently drops the injection in
     * the BROWSER build, which is the build hoody-bot bundles.
     *
     * Distinct from `getFetch()`: this one never reports the global. Carrying the global into a
     * derived client would bind it at derivation time and defeat the late-binding the browser
     * client deliberately keeps for the un-injected case.
     */
    getInjectedFetch(): HoodyFetch | undefined;
    /**
     * The transport options the CALLER passed, or `undefined` when none were.
     *
     * What every derivation (`withRealm`, `withContainer`, the realm-error introspection client)
     * copies. Never the normalised `config.transport`: that one carries the defaults, and a child
     * built from it reports Node-only knobs as caller-set (the browser warns once per client).
     */
    getConfiguredTransport(): IHttpClientTransportConfig | undefined;
    clearCache(): void;
    close(): Promise<void>;
    getBaseURL(): string;
    setToken(token: string): void;
    use(middleware: IHttpClientMiddleware): void;
    setMiddlewares(middlewares: IHttpClientMiddleware[]): void;
    request<T = unknown>(method: string, path: string, data?: IRequestData): Promise<T>;
    get<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    post<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    put<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    patch<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    delete<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    head<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    options<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    mkcol<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    copy<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    move<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    lock<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    unlock<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    propfind<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    proppatch<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    checkauth<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /**
     * Streaming seam — issue one request through the SAME injected transport,
     * URL builder and header/auth policy as request(), and hand back the raw
     * Response with its body UNDRAINED so the caller can read response.body
     * incrementally (SSE, chunked NDJSON, large downloads).
     *
     * Deliberately outside the retry / cache / envelope machinery: a stream is
     * consumed once, so replaying it is not meaningful and normalising it would
     * force a full buffer. A non-2xx response IS read here (at most 64 KiB,
     * bounded by the caller's signal and the timeout) and raised as an ApiError,
     * so callers only ever receive a readable stream.
     *
     * Cancellation is the caller's data.signal, and it keeps working after the
     * headers arrive: aborting then cancels the body and makes a pending read
     * reject. data.timeoutMs bounds the time to RESPONSE HEADERS only, never
     * the lifetime of the stream — pass timeoutMs: 0 to opt out of the header
     * budget entirely.
     *
     * Request middleware runs exactly as it does for request(): kit credentials
     * (kitAuth on withContainer()) are injected by middleware, so a stream that
     * skipped it reached a permission-guarded kit with no credentials. Error
     * middleware sees a non-2xx. Response middleware does not run: it receives
     * a parsed body, and a stream has none to give it.
     */
    stream(method: string, path: string, data?: IRequestData): Promise<Response>;
    /**
     * The same response, with a body that a later abort still reaches.
     *
     * The transport stops forwarding the caller's signal once the headers arrive
     * (its own timeout must not cut a live stream), so an abort after that point
     * reached nothing: a consumer parked in read() waited forever and the
     * connection stayed open. This wrapper cancels the source body and
     * makes the consumer's pending read reject with the abort reason.
     */
    private abortableResponse;
    /**
     * A non-2xx response with its body read to at most 64 KiB, within the
     * caller's signal and the request timeout (5 s when the timeout is 0), so
     * building the ApiError cannot hang on a body that never ends.
     * An abort surfaces as the abort, not as a protocol error.
     */
    private boundedErrorResponse;
    /**
     * Incremental event stream.
     *
     * Issues one request through `stream()` (same injected transport, URL
     * builder, auth policy and non-2xx handling) and yields each server-sent
     * event as it arrives. Nothing is buffered beyond one partial frame, so a
     * stream that never ends is consumed in constant memory — the ordinary
     * request path awaits the whole body and would never return on one.
     *
     * Laziness is deliberate: the request is issued on the first iteration, not
     * at the call. A caller that builds the iterable and drops it issues no
     * request at all.
     *
     * Cancellation: pass `options.signal` (or `data.signal`). Aborting cancels
     * the body reader and the iteration throws. Leaving the loop with `break`,
     * `return` or a thrown error cancels the reader too, through the generator's
     * `finally`.
     *
     * Replay: `options.since` is sent as the `Last-Event-ID` request header, or
     * as a query parameter when `options.sinceParam` names one. Every yielded
     * event carries back the server's cursor as `seq`/`id`, so a consumer
     * resumes by passing the last one it saw.
     *
     * Termination: an event named `end` is yielded and then ends the iteration
     * — the hoody-agent gateway writes it when a session closes, and a consumer
     * that only watched for the socket to drop would otherwise hang until the
     * read timed out.
     *
     * A non-2xx never yields: `stream()` drains it and raises `ApiError`.
     * Neither does a 2xx whose content-type is not `text/event-stream`: it
     * raises `ApiError` with code `NOT_AN_EVENT_STREAM` and the HTTP status.
     * The raised error holds only a fixed code, a fixed sentence and the status;
     * the server's body (for example a 202 job ack) goes to
     * `options.onDiagnostic` (or the client's `onStreamDiagnostic`), with the
     * original error.
     *
     * Response: `stream.response` resolves with the accepted stream's status
     * and headers before the first event is yielded, and carries the headers
     * `options.documentedHeaders` names on `documented`; see IEventStream.
     */
    streamEvents<TDocumented extends object = Record<never, string>>(method: string, path: string, data?: IRequestData, options?: IStreamEventsOptions): IEventStream<TDocumented>;
    /**
     * The frames of streamEvents(); accept() is told the response before the first one.
     *
     * The transport gets a signal of its own, aborted by the caller's signal or by
     * return()/throw(): a close then also reaches a request still in flight and
     * the reads of a body that is no event stream (a 200 JSON reply, a non-2xx
     * error body), which no reader of this method holds.
     */
    private streamEventFrames;
    /** streamEventFrames() behind its transport signal. */
    private openedEventFrames;
    /**
     * The body of a buffered response, read whole inside the caller's signal and
     * an IDLE timeout: timeoutMs bounds the wait for the headers (the transport),
     * and here the same length bounds the gap between two chunks, reset on every
     * chunk. A slow but flowing download of any length completes; one that goes
     * quiet for timeoutMs fails with a body-stalled error (code ETIMEDOUT, as the
     * CLI reports it). It used to be a total deadline, so a large file, a zip or a
     * pipe receive failed after timeoutMs while data was still arriving (L2 round 3).
     *
     * The transport stops forwarding the caller's signal and clears its timer as
     * soon as the headers arrive, so a body that never ended (an event stream
     * reached through the buffered path, a stalled download) kept request()
     * pending past both: curl sseJobEvents() ignored its abort. The
     * body is read here instead; an abort or the idle timer cancels the reader,
     * which settles a pending read on every transport, including an injected one
     * that ignores the fetch signal. A caller's abort always wins, and rejects as
     * an abort.
     *
     * Returns the chunks, or null when the response has no body. replayResponse()
     * turns them into a fresh, unread Response, so the parser, the error builder
     * and response middleware each read their own copy of the same bytes.
     */
    private readBufferedBody;
    /**
     * A fresh, unread Response over chunks readBufferedBody() already read, with
     * the original status, headers and url. The chunks are enqueued, not copied.
     */
    private replayResponse;
    /** The chunks as one byte array: the rawBody response middleware receives. */
    private joinChunks;
    /**
     * The URL and headers a WebSocket upgrade to url must carry, built exactly
     * as request() builds a GET: the same URL builder and query encoding, the
     * API bearer only inside the API's credential scope, and the same request
     * middleware, so kitAuth (injected by middleware, per namespace) reaches the
     * upgrade. Generated WebSocket clients open their socket with what this
     * returns; before, they skipped the middleware and a kit gated by a proxy
     * permission refused them even with kitAuth configured.
     *
     * Nothing is sent. Response and error middleware do not run.
     *
     * A browser WebSocket cannot send headers. The URL is the part that survives
     * there: a proxy token credential configured with a query parameter
     * (kitAuth type 'token' with param) is carried in it.
     */
    prepareUpgrade(url: string, data?: IRequestData): Promise<{
        url: string;
        headers: Record<string, string>;
    }>;
    logout<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    private parseResponseBody;
    private isBinaryResponse;
    /**
     * Query parameters as wire pairs, as the Node client builds them: an array
     * value is one pair per item (?source=a&source=b, OpenAPI form/explode), and
     * undefined/null (the value or an item) sends nothing. The browser used
     * String() on arrays, which comma-joins them into ONE value (source=a%2Cb)
     * that array-taking kits reject.
     */
    private queryPairs;
    private buildUrl;
    private hasAbsoluteUrlOrigin;
    private appendQueryParameters;
    private buildUrlFromFull;
    private sanitizeHeaderValue;
    private buildHeaders;
    private executeRequest;
    private buildApiErrorFromResponse;
    private toApiError;
    private shouldRetry;
    /**
     * Exponential backoff with bounded delay + jitter. `retryAfterMs` (from
     * parsing `Retry-After`) takes priority over local exponential delay. The
     * 30s cap matches the Node HttpClient so `retries: 15` with a persistent
     * 503 can't grow retry sleeps into minutes.
     */
    private getRetryDelayMs;
    /**
     * Parse a Retry-After response header into milliseconds. RFC 9110 §10.2.3
     * allows either an HTTP-date or delta-seconds. Returns undefined if absent
     * or unparseable.
     */
    private parseRetryAfter;
    private refreshTokenPromise;
    private tryRefreshToken;
    private doRefreshToken;
    /**
     * True when url is inside the API's credential scope: the baseURL's origin
     * and path, or a realm subdomain of its host ({realmId}.api.hoody.com).
     *
     * The path matches on a segment boundary: a base of /v1/ covers /v1 and
     * /v1/x but not /v10/x. The realm exception requires the base's scheme AND
     * port: a realm name on another port is another service. Both used to
     * match, so the API bearer went to /v10 and to realm:8443.
     *
     * Both URLs are resolved as the transport resolves them (resolveDestination),
     * and an omitted baseURL is the page's origin, where the browser transport
     * sends a same-origin request. A URL that does not resolve is outside: a
     * string-prefix fallback here used to judge a spelling it could not parse.
     */
    private isSameOriginAndPath;
    /** The scope rule of isSameOriginAndPath, over two resolved URLs. */
    private withinBase;
    /**
     * url resolved the way this runtime's fetch resolves it: against the page
     * (_transportBase) when there is one, as an absolute URL otherwise;
     * undefined when it does not resolve. Every scope decision goes through
     * this, so a spelling the URL parser rewrites (HTTPS://, //host, a
     * backslash for a slash, a tab inside the scheme) is judged by where the
     * request actually goes. A case-sensitive prefix test used to call
     * HTTPS://elsewhere and //elsewhere API-relative, and the API bearer went
     * with them.
     */
    private resolveDestination;
    /**
     * True when a request must not carry the API bearer: the URL it was built
     * into resolves outside the API's credential scope, or it was given as a
     * full URL to a client without a baseURL. Judged on the built URL, not on
     * how the path was spelled: a path of //elsewhere, joined onto the page's
     * origin, is elsewhere.
     */
    private isExternalDestination;
    /**
     * Remove every spelling of Authorization. Header names are case-insensitive,
     * so a configured or per-request "authorization" survived a delete of
     * "Authorization" and rode out to an external host.
     */
    private deleteAuthorization;
    /**
     * The credential scope a URL belongs to: 'api' for the API (the baseURL and
     * its realm subdomains), otherwise the origin the URL resolves to.
     *
     * A URL that does not resolve (a relative URL with no page to resolve it
     * against, which Node's fetch refuses) is the API's only when it provably
     * stays on whatever origin it is resolved against (_isOriginRelative);
     * any other has no scope and matches no other URL. A non-HTTP URL is its
     * own scope: every opaque origin serialises as "null".
     */
    private credentialScope;
    /**
     * A credential header set for one destination never follows a middleware's
     * URL rewrite to another.
     *
     * When one middleware step moves the request into another credential scope,
     * every credential header that step did not set itself (same name, same
     * value as before the step) is dropped. The step's own credential headers
     * are kept, because it chose them for the new destination, and later steps
     * may add more. Without this, the API bearer (set before any middleware)
     * and a kit credential (kit auth is the FIRST middleware) rode out to
     * whatever origin a later middleware pointed the request at.
     *
     * A credential header is one the redaction set names (_isCredentialHeader)
     * or one recorded under middlewareContext._credentialHeaders: kitAuth sent
     * under a header name the operator chose, which no pattern can know. The
     * names recorded before the step (namesBefore) are carried into the context
     * it returns, so a middleware that replaces middlewareContext cannot erase
     * them from confinement or from the ApiError redaction.
     */
    private confineCredentials;
    private applyRequestMiddleware;
    /**
     * True when a request carries a credential: a header the redaction set names
     * (Authorization, Cookie, X-*-Token, the container claim, ...), a header
     * recorded as a kit credential under a name the operator chose, or a
     * recorded credential query parameter on its URL.
     */
    private carriesCredential;
    /**
     * Send one request through executeRequest; a request that carries a
     * credential never follows a redirect blindly.
     *
     * fetch follows a redirect by default and strips only Authorization, Cookie
     * and Proxy-Authorization on a cross-origin hop, so a kit credential under
     * any other header name (X-Hoody-Token, X-Hoody-Container-Claim, a kitAuth
     * header the operator named) and a credential query parameter reached
     * whatever origin a server's Location named. A credentialed request is sent
     * with redirect: 'manual' and its hops are followed here, at most
     * MAX_CREDENTIALED_HOPS of them, and only while each one stays in the
     * credential scope the request was addressed to (credentialScope: the API
     * and its realm hosts, or one origin). A hop anywhere else is refused with
     * an ApiError (code REDIRECT_REFUSED) and nothing is sent there. A browser
     * does not reveal where a manual redirect leads (an opaqueredirect
     * response), so there every redirect of a credentialed request is refused.
     *
     * Methods follow fetch: 303 turns anything but HEAD into a body-less GET,
     * 301 and 302 turn a POST into one, and 307 and 308 resend the method and
     * body (a streamed body, which cannot be sent twice, is refused).
     * A request without credentials, or one sent with redirect: 'error', goes
     * out unchanged.
     */
    private sendConfined;
    /** The ApiError sendConfined throws; the URL is redacted, the credentials never leave. */
    private redirectRefusal;
    private applyResponseMiddleware;
    private applyErrorMiddleware;
    private sleep;
    private nextRequestId;
    /**
     * Normalize all responses into a stable API envelope:
     * { statusCode, message, data }
     */
    private normalizeResponseEnvelope;
}
