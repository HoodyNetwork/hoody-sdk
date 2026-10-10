/**
 * HTTP Client
 * Handles API requests with authentication, middleware, retries, and timeouts.
 */
import { ApiError } from './errors.js';
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
     * The response, with an UNREAD body: the client parses its own copy, so a
     * middleware may read this one (`await context.response.text()`).
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
/**
 * Per-client HTTP transport.
 *
 * Structurally a subset of the WHATWG `fetch` signature, so `globalThis.fetch`
 * is assignable without a cast and any interceptor that wraps it stays typed.
 * Every request the client issues — JSON, binary and the streaming seam —
 * goes through the instance's transport, never through the global directly.
 */
export type HoodyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface IHttpClientConfig {
    baseURL?: string;
    token?: string;
    /**
     * Transport used for every request this client issues. Defaults to the
     * runtime's global `fetch`, bound to `globalThis`. Supplying one here is
     * the ONLY supported injection point: the client never reads the global
     * again after construction, so a test double, a proxy-aware dispatcher
     * wrapper or a metrics interceptor applies to every HTTP, binary and
     * streaming request without monkey-patching the global.
     */
    fetch?: HoodyFetch;
    timeout?: number;
    /**
     * How many more times a failed request may be sent. Absent (here and on the
     * request): the default policy. An idempotent method (GET, HEAD, OPTIONS,
     * PUT, DELETE), or a request that sends the idempotency key its operation
     * declares, goes again up to 2 times on a status in `retryOnStatuses` and
     * when it never reached a server; any other method only when it never
     * reached a server; a `responseIsFinal` request and a streamed body never.
     * Backoff about 2 s, then 4 s, plus jitter (`retryDelayMs` sets the base),
     * Retry-After honoured, at most 10 s of waiting in all (a longer
     * Retry-After ends the retries rather than being cut short); onError does
     * not replay. Set it (0 included) and that budget applies under the full
     * rule (see shouldRetry), 250 ms base, no total cap.
     */
    retries?: number;
    retryDelayMs?: number;
    /**
     * How long, under the default policy, a request waits for a kit that is still starting (a
     * container that has just come up answers 502 BACKEND_GATEWAY_ERROR until its kits listen):
     * the retries are at most 5 s apart and wait this many milliseconds in all. Default 20000;
     * 0 turns the wait off. When it runs out the request fails with code KIT_NOT_READY. Only the
     * requests the default policy may send again wait (no POST without its declared idempotency
     * key, no responseIsFinal request).
     */
    kitStartingWaitMs?: number;
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
    forceIPv4?: boolean;
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
     * Connection reuse. On by default; `false` sends `Connection: close` with
     * every request.
     */
    keepAlive?: boolean;
    /**
     * Node only. `true` sends every request through the runtime's built-in
     * fetch and whatever dispatcher the process has installed
     * (setGlobalDispatcher), never through the SDK's own connection pool. The
     * SDK already steps aside when it sees an application dispatcher; set this
     * when yours is one it cannot tell from Node's default (an Agent that
     * differs only by a custom `factory`, or a compose() wrapper, installed
     * before the SDK was imported). Ignored when `fetch` is given.
     */
    useGlobalDispatcher?: boolean;
}
export interface IForceIPv4CacheConfig {
    /**
     * Cache DNS lookups used by forceIPv4.
     */
    enabled?: boolean;
    /**
     * DNS cache TTL in milliseconds.
     */
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
     * When true, skip ApiResponse envelope normalization and return the raw
     * parsed body directly.
     *
     * WARNING — TYPE LIE: the declared return type of every generated SDK
     * method is the ENVELOPED shape. When rawResponse is true, the runtime
     * return value is the UNWRAPPED body (object for responseType=json,
     * string for text, ArrayBuffer for arrayBuffer, Blob for blob). Callers
     * MUST cast to unknown (or the real raw shape) after the call — the
     * TypeScript declaration cannot discriminate on a runtime boolean.
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
     * The idempotency-key header the operation declares (`Idempotency-Key` or
     * `X-Idempotency-Key`), set by the generated method. A request that sends a non-empty value
     * under it is retried as an idempotent method is, whatever its method: the server answers a
     * repeat with the same key from its record of the first one instead of doing the work again.
     * Every attempt sends the first attempt's key and body (see _keyedReplayOf). The client mints a
     * key only under idempotencyKeyHeader (a create); here a call that sends none keeps its
     * method's rule.
     */
    declaredIdempotencyKeyHeader?: string;
    /**
     * Any HTTP answer to this request is final, whatever its status. For a call whose handler is
     * arbitrary code (an exec script): a 500, 502 or 429 it returned cannot be told from a
     * platform failure, and sending the request again runs the code again. With this set,
     * `retries` covers only a request that never reached a server (the connection could not be
     * opened).
     */
    responseIsFinal?: boolean;
    /**
     * The header of the idempotency key its server honours (the generated method of a POST that
     * declares `Idempotency-Key` sets this). The request carries one key per call (see
     * withIdempotencyKey), and a repeat is answered with the first result, so a lost connection or
     * a status in retryOnStatuses is retried as for an idempotent method.
     */
    idempotencyKeyHeader?: string;
    /**
     * Read the JSON answer without rounding its integers. JSON.parse turns every
     * number into a double, so an integer past Number.MAX_SAFE_INTEGER (2^53 - 1)
     * comes back as a neighbouring value: 9007199254740993 reads as
     * 9007199254740992. With this set, such an integer comes back as a
     * `bigint`; every other number is a `number` as before. A `bigint` in a
     * JSON request body is sent as a plain integer, so the value can go back.
     * Generated methods of a service whose values are 64-bit integers (sqlite)
     * set it.
     */
    losslessIntegers?: boolean;
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
 * The SDK's own HTTP transport on Node.
 *
 * Node's built-in fetch runs on a process-wide undici dispatcher with fixed
 * defaults, and three of them fail SDK calls: a 300 s headers timeout that
 * cuts any longer timeoutMs short as an uncoded "fetch failed"; HTTP/2 on
 * Node 26, where 10 MiB of buffered request bodies in flight break the
 * session and every later call to that host; and no way to drop a broken
 * connection. So on Node the client sends through undici's own fetch on an
 * Agent it owns: HTTP/1.1 only, the headers and body timeouts taken from the
 * request's timeoutMs, and replaced when an HTTP/2 failure is seen.
 *
 * undici is imported on first use, through a specifier no bundler follows, so
 * nothing here reaches a browser bundle. The built-in fetch is used instead
 * (returns null) when:
 *   - the runtime is not Node, or is a Node below 22.19 (undici 8's floor);
 *   - the process's global dispatcher is not Node's default Agent: one the
 *     application installed (a proxy agent, a mock agent, --use-env-proxy)
 *     keeps carrying the SDK's requests;
 *   - undici cannot be imported.
 * A client constructed with its own `fetch` never uses it either.
 */
export interface NodeTransport {
    /**
     * Send one request. `timeoutMs` is the request's budget (0 = none): the
     * headers timeout follows it and the body idle timeout is never below it.
     * Left out, undici's defaults apply. `init.dispatcher` (an undici dispatcher
     * built from `undici` below, e.g. a ProxyAgent) replaces the SDK's Agent for
     * this request and gets the same timeouts.
     */
    fetch: (input: string | URL, init?: RequestInit, timeoutMs?: number) => Promise<Response>;
    /** Stop using the pooled connections: the next request opens new ones. In-flight requests finish. */
    reset: () => void;
    /** The undici module this transport loaded, for building a dispatcher of the same version. */
    readonly undici: unknown;
}
/** True on a Node that can load the SDK's transport (22.19 or later; not Bun, not Deno). */
export declare function nodeTransportSupported(): boolean;
/** Whether a request sent now, by a client with no injected fetch, goes through the SDK's own transport. */
export declare function nodeTransportInUse(): boolean;
/**
 * A fresh idempotency key (a random UUID). A generated POST method that declares an
 * `Idempotency-Key` header sends one per call when the caller gives none. Falls back to
 * getRandomValues where randomUUID is missing (a page served over plain http).
 */
export declare function newIdempotencyKey(): string;
/**
 * The headers of a request that carries an idempotency key under `name`: one key per call,
 * kept across its retries. A non-blank key the caller set wins, per call or client-wide
 * (`clientHeaders`); a blank one counts as none, since the server ignores it. Otherwise the
 * call gets a fresh key.
 */
export declare function withIdempotencyKey(callHeaders: Record<string, string> | undefined, clientHeaders: Record<string, string> | undefined, name: string): Record<string, string>;
export declare function isKitStarting(error: {
    status: number;
    code?: string | undefined;
}): boolean;
/** The kitStartingWaitMs a client runs with: _KIT_STARTING_WAIT_MS when unset, else a whole number of milliseconds, 0 or more. */
export declare function resolveKitStartingWaitMs(value: unknown): number;
/** How many more attempts a kit still starting may take within waitMs: one per _KIT_STARTING_MAX_DELAY_MS, plus one. */
export declare function kitStartingRetries(waitMs: number): number;
export declare function kitNotReadyMessage(waitedMs: number): string;
/**
 * True for a media type whose body is text: text/*, or one of the subtypes or
 * structured suffixes above. Matched on the exact subtype or suffix, never on
 * a substring: `openxmlformats` (.docx, .xlsx, .pptx) contains "xml" and is a
 * zip archive, which a substring test decoded as UTF-8 and corrupted. The same
 * rule as the CLI client (cli/http-client.ts isTextMediaType).
 */
export declare function isTextMediaType(contentType: string | null | undefined): boolean;
/**
 * True for a media type whose body is bytes: any application/* type that is
 * not text (isTextMediaType), and image/*, audio/*, video/*, font/*. Bytes are
 * the default for application/*: an Office or other vendor file
 * (vnd.openxmlformats-*, vnd.ms-*, vnd.oasis.opendocument.*) served without
 * Content-Disposition: attachment was decoded as UTF-8 and corrupted. text/*,
 * the text subtypes and a missing type are not bytes. The same rule as
 * lib/http-wire.ts isBinaryMediaType.
 */
export declare function isBinaryMediaType(contentType: string | null | undefined): boolean;
/**
 * JSON.parse, except that an integer literal outside the safe range becomes a
 * bigint instead of the nearest double. Fractions and exponents are numbers,
 * as in JSON.parse. A text with no 16-digit run goes straight to JSON.parse.
 *
 * The text is scanned once outside its strings; each unsafe integer is swapped
 * for a tagged string that the reviver turns into the bigint. The tag carries
 * a per-call random part, so a string of the document cannot be mistaken for
 * one.
 */
export declare function parseJsonLossless(text: string): unknown;
/**
 * JSON.stringify, except that a bigint is written as a plain integer literal
 * instead of throwing. Only reached when the value holds a bigint.
 */
export declare function stringifyJsonLossless(value: unknown): string;
/**
 * The SDK's Node transport, created once per process; null where the built-in
 * fetch is used instead (see NodeTransport).
 */
export declare function loadNodeTransport(): Promise<NodeTransport | null>;
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
/**
 * A frame of a stream whose operation declares its event types (`TFrames`:
 * event name to payload type, from the spec's x-async-api messages). Such a
 * stream is an `IEventStream<TDocumented, ITypedStreamEvent<TFrames>>`.
 *
 * `data` is the payload parsed as JSON (undefined when it is not JSON);
 * `raw` is still the text. `declared` is true when the frame's name is one
 * the spec declares and its payload parsed: narrow on it and on `event`,
 * and `data` has the spec's type for that event:
 *
 *   if (frame.declared && frame.event === 'row') frame.data.text;
 *
 * Any other frame (a name the spec does not list, or a payload that is not
 * JSON) is still yielded, with `declared: false`. The payload is parsed, not
 * validated: the type is the spec's promise, as for a response body.
 */
export type ITypedStreamEvent<TFrames extends object> = Omit<IStreamEvent, 'event'> & ({
    [K in keyof TFrames & string]: {
        declared: true;
        event: K;
        data: TFrames[K];
    };
}[keyof TFrames & string] | {
    declared: false;
    event: string;
    data: unknown;
});
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
     * The error codes the operation's spec documents (x-error-codes), as
     * `{ CODE: 'its title in the spec' }`. An HTTP error that carries one of
     * them keeps that code, with the spec's title as its message, instead of
     * becoming STREAM_HTTP_ERROR: a resuming client has to tell "your cursor is
     * too old, re-read the state" (HISTORY_GAP, CHANGE_CURSOR_INVALID) from any
     * other refusal. Both are fixed text from the spec; the server's own message
     * and body still go only to `onDiagnostic`. Generated stream methods fill
     * this in.
     */
    documentedErrorCodes?: Record<string, string>;
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
    /**
     * The event names whose payload types the operation's spec declares. When
     * set, every frame also carries `data` and `declared` (see
     * ITypedStreamEvent); no frame is dropped or refused for its name or its
     * payload. Generated stream methods fill this in.
     */
    declaredEvents?: readonly string[];
    /**
     * Closes a stream that sends nothing for this many ms, with an `ApiError`
     * of code `ETIMEDOUT`. Any bytes count, a heartbeat comment included, so
     * set it above the server's heartbeat period (a few missed heartbeats): a
     * stream that stops sending without closing (a dead peer behind a proxy
     * that holds the connection open) otherwise waits forever. The clock runs
     * only while the stream waits for the network, never while the caller is
     * handling a frame. Unset, 0 or not a finite number: no bound.
     */
    idleTimeoutMs?: number;
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
 *
 * `TEvent` is what the stream yields: IStreamEvent, or for an operation
 * whose spec declares its frames ITypedStreamEvent (see there). Each is an
 * IStreamEvent, so a typed stream is also an IEventStream<TDocumented>.
 */
export interface IEventStream<TDocumented extends object = Record<never, string>, TEvent extends IStreamEvent = IStreamEvent> extends AsyncIterableIterator<TEvent> {
    /** Settles once the stream is accepted or has failed; see the interface. */
    readonly response: Promise<IStreamResponse<TDocumented>>;
    next(): Promise<IteratorResult<TEvent, void>>;
    return(value?: void): Promise<IteratorResult<TEvent, void>>;
    throw(error?: unknown): Promise<IteratorResult<TEvent, void>>;
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
    private readonly ipv4DnsCache;
    private requestCounter;
    /**
     * The transport the CALLER injected, or null. Kept beside `config.fetch` (which is always set,
     * to the resolved global when nothing was injected) so `getInjectedFetch()` can answer the only
     * question a derivation may ask: was one injected?
     */
    private readonly injectedFetch;
    /**
     * The transport options the CALLER passed, or null. `config.transport` holds them normalised
     * (defaults filled in), which is not what a derived client should be told the caller asked for.
     */
    private readonly configuredTransport;
    constructor(config?: IHttpClientConfig);
    clearCache(): void;
    close(): Promise<void>;
    getBaseURL(): string;
    setToken(token: string): void;
    /**
     * The transport this client was constructed with (or the resolved global
     * default). Exposed so callers can assert the injection took effect and so
     * higher layers can compose on the SAME transport instead of the global.
     */
    getFetch(): HoodyFetch;
    /**
     * The transport the CALLER injected, or `undefined` when none was.
     *
     * The one accessor every derivation uses (`withRealm`, `withContainer`, the realm-error
     * introspection client). It exists because the two HTTP implementations store the injection
     * differently — this one resolves it into `config.fetch`, the browser build keeps it out of
     * `config` on purpose — so a derivation that reads `config.fetch` silently drops the injection
     * in the browser build.
     */
    getInjectedFetch(): HoodyFetch | undefined;
    /**
     * The transport options the CALLER passed, or `undefined` when none were.
     *
     * What every derivation (`withRealm`, `withContainer`, the realm-error introspection client)
     * copies, never the normalised `config.transport`: the browser build warns about every
     * Node-only knob it is handed, and a normalised copy hands it all of them.
     */
    getConfiguredTransport(): IHttpClientTransportConfig | undefined;
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
     *
     * Typed frames: with `options.declaredEvents` each frame also carries its
     * parsed `data` and `declared`, and `TEvent` (an ITypedStreamEvent) types
     * them; see ITypedStreamEvent.
     */
    streamEvents<TDocumented extends object = Record<never, string>, TEvent extends IStreamEvent = IStreamEvent>(method: string, path: string, data?: IRequestData, options?: IStreamEventsOptions): IEventStream<TDocumented, TEvent>;
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
     * Query parameters as wire pairs. An array value is sent as one pair per
     * item (`?source=nix&source=system`): the OpenAPI default for a query array
     * (style `form`, explode `true`), and the form every kit that declares an
     * array query parameter parses. `String()` on an array comma-joins it into
     * ONE value (`?source=nix,system`), which hoody-run rejects as an unknown
     * source and hoody-browser passes to Chromium as one launch argument.
     * `undefined` and `null` (the value or an item) send nothing.
     */
    private queryPairs;
    private buildUrl;
    /**
     * Adds the query to the parameters the path already carries. A key the path
     * holds itself (a route marker: `/{archive}?extract`, `/{directory}?zip`)
     * is never sent twice: a non-empty value from the caller replaces the bare
     * marker (`?extract=src%2F`), an empty one leaves it as it is. The request
     * used to go out as `?extract=&extract=src%2F`, which only reads right on a
     * server that keeps the last value of a repeated key.
     */
    private mergeQueryPairs;
    private hasAbsoluteUrlOrigin;
    private joinRelativeUrl;
    private appendQueryParameters;
    private isVerboseLoggingEnabled;
    private buildUrlFromFull;
    private sanitizeHeaderValue;
    private buildHeaders;
    private executeRequest;
    private resolveIPv4Hostname;
    private loadNodeDnsLookup;
    private pruneExpiredIPv4Cache;
    private buildApiErrorFromResponse;
    private toApiError;
    /**
     * Whether a failed attempt may be sent again. One rule, in this order:
     *   1. The caller's abort, this client's own timeout, a refused redirect and a missing fetch are final.
     *   2. A request that never reached a server (the connection could not be opened) ran
     *      nothing: any method goes again.
     *   3. A refusal whose code says nothing was done (RETRY_SAFE_CODES): any method goes again.
     *   4. A request marked responseIsFinal stops here: its handler is arbitrary code, so a status
     *      it returned is an answer, and a lost connection may have followed a run.
     *   5. Otherwise the request may have been handled. An idempotent method (GET, HEAD, OPTIONS,
     *      PUT, DELETE) goes again on a lost connection or a status in retryOnStatuses; any
     *      other method only on 429, which refuses before handling.
     * `byDefault` (nobody set `retries`): a method that is not idempotent goes again only by rule 2.
     * `keyed`: the request sends the idempotency key its server honours (the header its operation declares),
     * so any method counts as idempotent in rule 5 and under `byDefault`: a repeat is answered from the
     * server's record.
     */
    private shouldRetry;
    /**
     * Exponential backoff with bounded cap + optional server-directed
     * Retry-After delay. Without the cap, `retries: 15` with persistent 503
     * produces multi-minute sleeps; without Retry-After, we violate RFC 9110
     * §10.2.3 by ignoring server-directed backoff.
     */
    private getRetryDelayMs;
    /**
     * Parse Retry-After header (delta-seconds or HTTP-date) into milliseconds.
     */
    private parseRetryAfter;
    private refreshTokenPromise;
    private tryRefreshToken;
    private doRefreshToken;
    /**
     * True when url is inside the API's credential scope: the baseURL's origin
     * and path, or a realm host of it ({realmId}.api.hoody.com).
     *
     * The path matches on a segment boundary: a base of /v1/ covers /v1 and
     * /v1/x but not /v10/x. The realm exception requires the base's scheme AND
     * port: a realm name on another port is another service. Both used to
     * match, so the API bearer went to /v10 and to realm:8443.
     *
     * A realm host is exactly one label, a 24-hex realm id, in front of the
     * base host. Any subdomain used to count, and the kit hosts withContainer()
     * derives from a base with no api. label (containers.<base host>) are
     * subdomains of it, so every kit request carried the account bearer.
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
     * Remove the client's own Authorization, in every spelling. Header names are
     * case-insensitive, so a configured "authorization" survived a delete of
     * "Authorization" and rode out to an external host. `callHeaders` are the
     * request's own headers: an Authorization there is put back (see below).
     */
    private deleteAuthorization;
    /**
     * The credential scope a URL belongs to: 'api' for the API (the baseURL and
     * its realm hosts), otherwise the origin the URL resolves to.
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
     * One sent with redirect: 'error' goes out unchanged.
     *
     * `trackHops` (request() sets it for a method that is not idempotent and
     * for a responseIsFinal request): a request without credentials follows its
     * redirects here too, wherever they lead, as fetch would (at most 20). A
     * failure after the first hop was answered is marked `afterDispatch`: a
     * script that ran and answered 3xx, whose destination then refused the
     * connection, is not "never dispatched" and is not sent again. Any other
     * request without credentials goes out unchanged.
     */
    private sendConfined;
    /** The ApiError sendConfined throws; the URL is redacted, the credentials never leave. */
    private redirectRefusal;
    private applyResponseMiddleware;
    private applyErrorMiddleware;
    private sleep;
    private nextRequestId;
    /**
     * Normalize all responses into a stable API envelope: { statusCode, message, data }.
     *
     * A body that already is the envelope keeps every other top-level field it carries
     * (`propagation`, `pagination`, `total`/`limit`/`offset`, `metadata`): those are documented
     * parts of the answer, and dropping them left the caller no way to read them. Its `message`
     * may be absent (`{statusCode, data}`, hoody-api's `/auth/available-regions`); it is filled in
     * from the status text. The generated types (RESPONSE_ENVELOPE_FIELDS) follow the same rule.
     */
    private normalizeResponseEnvelope;
}
