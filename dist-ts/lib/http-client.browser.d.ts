/**
 * Browser-compatible HTTP Client for Hoody SDK
 *
 * Kept in lib/ (not auto-generated). Used by the browser bundle via esbuild
 * resolution of `http-client.js` imports.
 */
import { ApiError } from '../generated/errors.js';
import { type FetchCredentialsPolicy, type FetchCredentialsMode, type FetchCacheMode } from './http-wire.js';
export { isBinaryMediaType, isKitStarting, isTextMediaType, kitNotReadyMessage, kitStartingRetries, newIdempotencyKey, parseJsonLossless, resolveKitStartingWaitMs, stringifyJsonLossless, withIdempotencyKey, } from './http-wire.js';
export type { FetchCacheMode, FetchCredentialsMode, FetchCredentialsPolicy } from './http-wire.js';
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
     * later reassignment of the global cannot change the transport (a caller that injects an
     * egress-policed fetch here can verify it through `getFetch()`). Absent → the runtime's global
     * fetch, bound.
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
     * Backoff 1-2 s, then 2-4 s (`retryDelayMs` sets the base; equal jitter),
     * Retry-After honoured, at most 10 s of waiting in all (a longer
     * Retry-After ends the retries rather than being cut short); onError does
     * not replay. Set it (0 included) and that budget applies under the full
     * rule (see shouldRetry), 250 ms base, no total cap; a Retry-After over
     * 30 s still ends the retries.
     */
    retries?: number;
    retryDelayMs?: number;
    /**
     * How long, under the default policy, a request waits for a kit that is still starting (a
     * computer that has just come up answers 502 BACKEND_GATEWAY_ERROR until its kits listen):
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
     * a TTL in milliseconds) overrides this per call. A GET to another origin
     * than the API (a kit host) is never cached, also when a request middleware
     * moved the request there.
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
    forceIpv4?: boolean;
    /**
     * Kept for parity with the Node client; ignored in the browser.
     */
    forceIpv4Cache?: IForceIpv4CacheConfig;
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
     * Global error hook — called on a request error before the retry loop
     * decides whether to continue. Return `true` to force one more retry (beyond
     * status-based retry policy); return `false` to let shouldRetry decide.
     *
     * It does not see every failure: a failure the retry policy, the keyed
     * in-progress poll or a 401 replay sends again goes back without it, and a
     * call that ends during that wait (the session changed, an abort, the keyed
     * deadline) rejects with an error the hook may not have seen. Read a call's
     * outcome where it is awaited. For 401-specific refresh, prefer
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
     * Two-factor step-up. Called when a request answers 400 `OTP_REQUIRED` and its operation takes
     * the one-time code in its body (`otp_code`): the account API's token, token-copy and
     * token-update, add-realm and remove-realm routes, an email change request, and the Bot URL
     * routes that guard a key. Return the code and the request is sent once more with it in
     * `otp_code`; return `undefined`, `null` or an empty string to give up and let the error
     * through. Opt-in, and bounded: one resend per call, so a wrong code is the call's error
     * (`INVALID_OTP_CODE`). The server refuses before it changes anything, so the resend never
     * repeats a change. Nothing is resent for a body that is not a plain object. A hook that
     * throws is logged and the original error goes to the caller. The caller keeps asking for the
     * code, the SDK never does.
     */
    onStepUp?: (error: ApiError) => string | null | undefined | Promise<string | null | undefined>;
    /**
     * The largest event-stream frame a stream from this client holds, in UTF-8
     * bytes. Default DEFAULT_MAX_STREAM_FRAME_BYTES (16 MiB); a call's
     * `maxFrameBytes` overrides it. Only a whole number above 0 is used;
     * anything else keeps the default. A larger frame ends the stream with an
     * ApiError of code STREAM_FRAME_TOO_LARGE.
     */
    maxStreamFrameBytes?: number;
    /**
     * Whether the browser sends cookies and HTTP authentication with a request: the fetch
     * `credentials` mode. Absent: none is set, and fetch uses `same-origin`. A mode (`'include'`,
     * `'same-origin'`, `'omit'`) applies to every request; a map gives one mode per namespace
     * (the kit's name, `agent`, `terminal`, ...; `api` for the account API and for a raw request on
     * the transport) with `'*'` for the rest: `{ agent: 'include', '*': 'omit' }`. A call's own
     * `fetchCredentials` overrides it. Cross-origin cookies also need the server to allow
     * credentials for your origin. A request sent with `'include'` is treated as one that carries
     * a credential: it follows no redirect to another place (a browser reports every redirect of
     * such a request as refused). Unlike the top-level `credentials` of HoodyClient (a username and
     * password), this is the fetch option.
     */
    fetchCredentials?: FetchCredentialsPolicy;
    /**
     * The fetch cache mode: how a request uses the browser's HTTP cache (`'no-store'`, `'reload'`,
     * `'no-cache'`, `'force-cache'`, `'default'`). Named apart from `cache`, the SDK's own GET
     * response cache. Absent: none is set. A call's own `fetchCache` overrides it. A mode other than
     * `'default'` makes the browser add `Cache-Control` and `Pragma` request headers (`no-store`,
     * `reload`, `no-cache`), which makes a cross-origin write non-simple (a CORS preflight): it is opt-in.
     */
    fetchCache?: FetchCacheMode;
    /**
     * The most bytes a buffered response body may have. A successful body over it is refused with an ApiError of
     * code RESPONSE_TOO_LARGE as soon as a declared Content-Length shows it, or as soon as the bytes
     * read pass it, and reading stops (the rest is cancelled). Absent: no limit. A set value that is not a whole number above 0 throws a ValidationError. A call's own `maxResponseBytes` overrides it. Not applied to `stream()`
     * (the caller reads that body) or to an event stream (see `maxStreamBytes`).
     */
    maxResponseBytes?: number;
    /**
     * The most bytes an event stream (streamEvents and the generated stream methods) may read in all,
     * frames and separators included. Past it the stream ends with an ApiError of code
     * STREAM_TOO_LARGE. Absent: no budget. A set value that is not a whole number above 0 throws a ValidationError (each frame is still bounded
     * by `maxStreamFrameBytes`). A call's own `maxStreamBytes` overrides it.
     */
    maxStreamBytes?: number;
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
     * The session a call is made in, read once when the call starts. While it returns the same value
     * (Object.is) the call runs as before. Once it returns another one, no further attempt of the
     * call starts: a retry, a keyed in-progress poll, a step-up or kit-auth resend and a 401 replay
     * fail with the error they would have retried, the 401 is not refreshed, and a token a refresh
     * brings back for the old session is not installed. HoodyClient returns its session generation,
     * so a request made under one session (before setToken, adoptSession, setSessionToken, login or
     * logout) never runs with the token of the next one, which may belong to another account.
     * Absent: nothing is held back.
     */
    sessionMark?: () => unknown;
    /**
     * Enables one-time auth retry on 401 responses.
     */
    autoRetryAuth?: boolean;
    /**
     * A keyed request (one that sends the idempotency key its operation declares) that the server
     * answers 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is asked again, with the same key and body, after
     * the answer's Retry-After, until the first request's answer comes back or the call's timeout
     * would pass. These repeats spend no retry, so `retries: 0` does not stop them. Default true;
     * `false` makes the 409 the answer. A request's own `keyedInProgressWait` overrides this.
     */
    keyedInProgressWait?: boolean;
    /**
     * Request body keys whose values never appear in an ApiError, at any depth: their values read
     * "[REDACTED]" in `error.request.body`, `error.request.query` and the query of
     * `error.url`. Matched ignoring case, on
     * top of the names the SDK always redacts (password, token, secret, ...). A request's own
     * `redactBodyKeys` adds to these.
     */
    redactBodyKeys?: string[];
    /**
     * Header names that carry a credential, beyond those the SDK recognises by name (Authorization,
     * Cookie, X-*-Token, ...). A request that sends one is treated as one that sends Authorization:
     * it never follows a redirect to another origin with the header, a request middleware that
     * moves it to another origin drops the header, and an ApiError shows the value as
     * "[REDACTED]". Use it for a secret in `headers` or one a middleware adds.
     */
    credentialHeaders?: string[];
    /**
     * Unique client instance identifier. Sent as X-Hoody-Client-ID header on every request.
     */
    clientId?: string;
    /**
     * Human-readable client name. Sent as X-Hoody-Client-Name header on every request.
     */
    clientName?: string;
    /**
     * What baseURL points at: 'account' (the default), the Hoody account API; 'kit', a kit or daemon
     * reached directly (HoodyClient passes its own target). Only an 'account' client names the SDK
     * version in X-Hoody-Client-Version: kit CORS allow-lists do not list it.
     */
    target?: 'account' | 'kit';
}
export interface IHttpClientTransportConfig {
    /**
     * Node-only setting; accepted for config parity. Not mapped to fetch `keepalive`, which means
     * "may outlive the page" and caps a request body at 64 KiB. Browser connection pooling is
     * managed by the runtime.
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
export interface IForceIpv4CacheConfig {
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
     * A GET to a kit host is never cached, whatever this says.
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
    /**
     * The least deadline this call gets: a deadline below it (the client's, or the operation's
     * x-request-timeout) is raised to it, and 0 (none) stays none. A generated method sets it 5 s
     * past the body's own deadline for the server (timeout_ms), only when the caller passes no
     * timeoutMs, so the client waits for the server's answer.
     */
    timeoutFloorMs?: number;
    retries?: number;
    retryDelayMs?: number;
    retryOnStatuses?: number[];
    middlewareContext?: Record<string, unknown>;
    authRetry?: boolean;
    /**
     * The body field that takes the one-time code of a two-factor step-up (`otp_code`), set by a
     * generated method whose spec declares both an `OTP_REQUIRED` answer and that body field. With
     * `onStepUp` on the client, a 400 `OTP_REQUIRED` is answered by one resend carrying the code.
     */
    stepUpField?: string;
    /**
     * The fetch `credentials` mode of this call (cookies and HTTP authentication): overrides the
     * client's `fetchCredentials`. A call that sends `'include'` is treated as one that carries a credential
     * (see IHttpClientConfig.fetchCredentials).
     */
    fetchCredentials?: FetchCredentialsMode;
    /**
     * The fetch cache mode of this call: overrides the client's `fetchCache`. Not the `cache` option
     * above, which is the SDK's own GET response cache.
     */
    fetchCache?: FetchCacheMode;
    /**
     * The most bytes this call's buffered response body may have, over the client's `maxResponseBytes`.
     * A longer body is refused with an ApiError of code RESPONSE_TOO_LARGE (status 0, `outcome`
     * `answered`, never sent again), and reading stops. A whole number above 0.
     */
    maxResponseBytes?: number;
    /**
     * When `true`, skip ApiResponse envelope normalization and return the raw
     * parsed body directly.
     *
     * Note on types: the declared return type of every generated SDK method
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
     * The idempotency-key header the operation declares (`Idempotency-Key` or
     * `X-Idempotency-Key`), set by the generated method. A request that sends a non-empty value
     * under it is retried as an idempotent method is, whatever its method: the server answers a
     * repeat with the same key from its record of the first one instead of doing the work again.
     * Every attempt sends the first attempt's key and body (see keyedReplayOf). The client mints a
     * key only under idempotencyKeyHeader (a create); here a call that sends none keeps its
     * method's rule.
     */
    declaredIdempotencyKeyHeader?: string;
    /**
     * The X-Expected-Length header the operation declares, set by the generated method. Each attempt
     * whose body is bytes or a Blob, and carries no header of that name, declares the body's length
     * under it, read after request middleware (see _withExpectedLength).
     */
    expectedLengthHeader?: string;
    /**
     * fetch redirect mode. 'error' refuses every redirect, same-origin ones
     * included (the request fails instead): HoodyClient sends credential-bearing
     * auth calls this way, so a redirect cannot replay their body to another
     * origin. The API does not redirect those routes. Absent: follow.
     * request(), stream() and streamEvents() all honour it.
     */
    redirect?: 'follow' | 'error';
    /**
     * Any HTTP answer to this request is final, whatever its status. For a call whose handler is
     * arbitrary code (an exec script): a 500, 502 or 429 it returned cannot be told from a
     * platform failure, and sending the request again runs the code again. With this set,
     * `retries` covers only a request that never reached a server (the connection could not be
     * opened), which a browser's fetch never reports (see lib/http-wire.ts neverDispatched).
     * A generated method sets it for an operation its spec marks x-non-idempotent; a caller can
     * set it on any call, never unset it on those.
     */
    responseIsFinal?: boolean;
    /**
     * Whether a keyed request answered 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is asked again after
     * the answer's Retry-After (see IHttpClientConfig.keyedInProgressWait). Absent: the client's
     * setting, default true.
     */
    keyedInProgressWait?: boolean;
    /**
     * Body keys whose values never appear in an ApiError from this call, added to the client's
     * `redactBodyKeys`.
     */
    redactBodyKeys?: string[];
    /**
     * The query parameters that make this call one a repeat would apply again (the operation's
     * x-non-idempotent `when`, set by the generated method). When the URL an attempt goes out to
     * carries one of them, read after request middleware, the request is responseIsFinal from that
     * attempt on.
     */
    nonIdempotentQuery?: string[];
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
     * Put the parsed body in `data` as it is: a body shaped like an envelope
     * (`{ statusCode, data }`) is not unwrapped. Set by generated methods that
     * return another party's body (curl.run's transparent response).
     */
    bodyAsData?: boolean;
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
     * WHATWG EventSource reconnect uses, and the one the proxy log stream
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
     * `{ CODE: 'its title in the spec' }`. Generated stream methods fill this
     * in. It no longer changes what is raised: an HTTP error keeps the server's
     * own code and message (see _toStreamError).
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
     * The most bytes this stream reads in all, over the client's `maxStreamBytes`. Past it the stream
     * ends with an `ApiError` of code `STREAM_TOO_LARGE`. A whole number above 0.
     */
    maxStreamBytes?: number;
    /**
     * Receives the original of every error the stream replaces. Apart from an
     * HTTP error answer (raised with the server's code, message and body, as
     * the request path raises it), a stream raises only fixed-text errors (a
     * code, a fixed sentence, the status): never a transport exception's
     * message, a 2xx body that is not an event stream, a content type or an
     * abort reason, any of which can hold a credential.
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
    /**
     * Ends the stream when the turn its request dispatched ends, and closes the
     * body then: the frame that ends it is the last one yielded. Generated
     * methods fill this in for an operation whose event stream documents the
     * turn id header and declares the turn-end frame (hoody-agent's
     * prompt:stream, which keeps delivering the session after the turn), unless
     * the caller passes `followSession: true`. Unset, the stream runs until the
     * server closes it, sends an `end` frame, or the caller closes it. See
     * IStreamTurnEnd.
     */
    turnEnd?: IStreamTurnEnd;
}
/**
 * Which frames end a stream's own turn (IStreamEventsOptions.turnEnd).
 *
 * The turn is the one `header` names on the response. Without that header
 * (a browser the server did not expose it to), it is the `turn_id` of the
 * `boundary` frame. The `done` frame whose turn id is that turn ends the
 * stream; one that names another turn (another client's, on the same session)
 * does not. So does a `discarded` frame that names it: the dispatch was
 * dropped unrun and gets no done frame. A done or discarded frame's turn id is
 * its payload's `event.data.turn_id`, else its envelope's `turn_id`.
 *
 * Without the header, the frames before the boundary are the replay, which can
 * hold another turn's done frame (this dispatch queued behind it): none of
 * them ends the stream. When the boundary names a turn the replay already
 * ended or discarded, the stream ends at the boundary. When nothing names a
 * turn (no header, and a boundary without one, or no boundary declared), the
 * first done frame after the boundary ends it. A `sessionEnd` frame ends it
 * whatever turn is running, as an `end` frame always does.
 */
export interface IStreamTurnEnd {
    /** The response header that names the dispatched turn (`X-Hoody-Turn-Id`). */
    header: string;
    /** The frame that ends a turn and names it (`agent_done`). */
    done: string;
    /** The frame that ends the replay and names the watched turn as `turn_id` (`replay_boundary`). */
    boundary?: string;
    /** The frame that closes a dispatch dropped unrun, naming it (`turn_discarded`). */
    discarded?: string;
    /** Frames that end the session, and with it every turn (`quit`, `session_closed`). */
    sessionEnd?: readonly string[];
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
/**
 * The HTTP layer of the browser build: every generated service sends through one of these.
 * It adds the account token to requests for the API origin only, runs the request and
 * response middleware, retries what is safe to send again, and turns every failure into an
 * ApiError. Uses the global `fetch` as it is at each request, unless one was injected.
 */
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
    /**
     * Every `config` field is optional: the timeout defaults to 30 s (`0` means none) and the GET
     * cache is off. An option name an earlier release used throws, naming its replacement.
     * Node-only transport options are accepted and ignored, with one console warning.
     */
    constructor(config?: IHttpClientConfig);
    /** The transport this client will use — lets a caller assert the injection took effect. */
    getFetch(): HoodyFetch;
    /**
     * The transport the CALLER injected, or `undefined` when none was.
     *
     * The one accessor every derivation uses (`withRealm`, `withComputer`, the realm-error
     * introspection client). It exists because the two HTTP implementations store the injection
     * differently — Node resolves it into `config.fetch`, the browser keeps it out of `config` on
     * purpose — so a derivation that reads `config.fetch` (an earlier version did) silently drops the injection in
     * the BROWSER build.
     *
     * Distinct from `getFetch()`: this one never reports the global. Carrying the global into a
     * derived client would bind it at derivation time and defeat the late-binding the browser
     * client deliberately keeps for the un-injected case.
     */
    getInjectedFetch(): HoodyFetch | undefined;
    /**
     * The transport options the CALLER passed, or `undefined` when none were.
     *
     * What every derivation (`withRealm`, `withComputer`, the realm-error introspection client)
     * copies. Never the normalised `config.transport`: that one carries the defaults, and a child
     * built from it reports Node-only knobs as caller-set (the browser warns once per client).
     */
    getConfiguredTransport(): IHttpClientTransportConfig | undefined;
    /** Drop every cached GET answer. */
    clearCache(): void;
    /** Release what the client holds. In a browser that is only the GET cache; there are no connections to close. */
    close(): Promise<void>;
    /** The API base URL relative paths are joined onto (`''` when none was set). */
    getBaseURL(): string;
    /** Replace the account token later requests to the API origin are sent with. */
    setToken(token: string): void;
    /** Add `middleware` after the ones already installed. */
    use(middleware: IHttpClientMiddleware): void;
    /** Replace the whole middleware list with a copy of `middlewares`. */
    setMiddlewares(middlewares: IHttpClientMiddleware[]): void;
    /**
     * Send one request and resolve with its parsed answer: the response envelope, or the body
     * alone with `data.rawResponse`. A HEAD resolves with the response headers. `path` is joined
     * onto the base URL unless it is a full URL; a full URL of another origin (a kit) never gets
     * the account token.
     *
     * Rejects with an ApiError for a non-2xx answer, a network failure, a timeout or an abort,
     * after the retries the policy allows. Any method other than GET, HEAD and OPTIONS empties
     * the GET cache.
     */
    request<T = unknown>(method: string, path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `GET`. */
    get<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `POST`. */
    post<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `PUT`. */
    put<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `PATCH`. */
    patch<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `DELETE`. */
    delete<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `HEAD`. Resolves with the response headers. */
    head<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `OPTIONS`. */
    options<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `MKCOL` (WebDAV: create a folder). */
    mkcol<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `COPY` (WebDAV). */
    copy<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `MOVE` (WebDAV). */
    move<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `LOCK` (WebDAV). */
    lock<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `UNLOCK` (WebDAV). */
    unlock<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `PROPFIND` (WebDAV: read properties). */
    propfind<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `PROPPATCH` (WebDAV: change properties). */
    proppatch<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    /** {@link request} with method `CHECKAUTH`. */
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
     * (kitAuth on withComputer()) are injected by middleware, so a stream that
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
     * Turn end: with `options.turnEnd` the stream also ends after the frame
     * that ends its own turn or the session; see IStreamTurnEnd. A body still
     * open when such a frame or an `end` frame arrives is closed before that
     * frame is yielded.
     *
     * A non-2xx never yields: `stream()` drains it and raises `ApiError`, a
     * 4xx or 5xx with the server's code, message and body, as the request path
     * does. Neither does a 2xx whose content-type is not `text/event-stream`: it
     * raises `ApiError` with code `NOT_AN_EVENT_STREAM` and the HTTP status.
     * That error holds only a fixed code, a fixed sentence and the status;
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
     * pipe receive failed after timeoutMs while data was still arriving.
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
    /** {@link request} with method `LOGOUT`. */
    logout<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    private parseResponseBody;
    private isBinaryResponse;
    /**
     * Query parameters as wire pairs, as the Node client builds them: an array
     * value is one pair per item (?source=a&source=b, OpenAPI form/explode), and
     * undefined/null (the value or an item) sends nothing. String() on an array
     * would comma-join it into ONE value (source=a%2Cb) that array-taking kits
     * reject.
     */
    private queryPairs;
    private buildUrl;
    private hasAbsoluteUrlOrigin;
    private appendQueryParameters;
    private buildUrlFromFull;
    private sanitizeHeaderValue;
    /**
     * `external`: the request goes outside the API's credential scope (a kit, a proxy or a browser-kit
     * host). Only a control-plane request (the API base URL and its realm hosts, on a client whose target is
     * 'account') names the SDK version in X-Hoody-Client-Version: kit CORS allow-lists do not list it, so a
     * kit request never carries it, a direct-kit client's included. A value the caller or the client's
     * configured headers set for that header is kept.
     */
    private buildHeaders;
    /**
     * The fetch options a request adds beyond the method, headers, signal and body: its credentials
     * mode (the call's, else the client's policy for the request's namespace) and its cache mode (the
     * call's, else the client's; none by default).
     */
    private fetchExtrasFor;
    private executeRequest;
    private buildApiErrorFromResponse;
    /**
     * The extra names an ApiError's URL query, body and query are redacted by, beside the default
     * secret names: the recorded credential parameters and the call's redactBodyKeys.
     */
    private redactedFieldNames;
    /** The body keys a call's errors redact beyond the default names: the client's, then the call's. */
    private bodyRedactionKeys;
    /**
     * ApiError.outcome from what a request loop knows (facts): answered, then failed here;
     * never handed to fetch, or the connection could not be opened (`not_sent`, unless an
     * earlier attempt may have reached the server: then that attempt's outcome); otherwise it may
     * have reached the server. An error built without facts says nothing.
     */
    private outcomeOf;
    /**
     * An ApiError this client made inside an attempt (_SDK_MADE_ERRORS: a refused redirect), with
     * the call's attempt facts (an HTTP status is an answer) and its URLs redacted by the call's
     * redactBodyKeys too.
     */
    private withAttemptFacts;
    private toApiError;
    /**
     * The ApiError for a request middleware (or finalizer) that threw: its refusal. An ApiError it
     * threw is the answer as it is. Anything else becomes status 0, code REQUEST_REFUSED, with the
     * thrown value as `cause`, and `outcome` `not_sent` (nothing went out). The request loop does not
     * send a refused request again.
     */
    private requestRefusedError;
    /**
     * Whether a failed attempt may be sent again: the rule the generated Node
     * client follows, from lib/http-wire.ts (shouldRetryFailure has the order).
     */
    private shouldRetry;
    /**
     * Exponential backoff with equal jitter, or undefined: do not retry. `retryAfterMs` (from
     * parsing `Retry-After`) takes priority over local exponential delay, and one longer than the
     * 30s cap ends the retries instead of being cut short. The 30s cap keeps `retries: 15` with a
     * persistent 503 from growing retry sleeps into minutes. The rule is retryDelay in
     * lib/http-wire.ts.
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
     * and path, or a realm host of it ({realmId}.api.hoody.com).
     *
     * The path matches on a segment boundary: a base of /v1/ covers /v1 and
     * /v1/x but not /v10/x. The realm exception requires the base's scheme AND
     * port: a realm name on another port is another service. Both used to
     * match, so the API bearer went to /v10 and to realm:8443.
     *
     * A realm host is exactly one label, a 24-hex realm id, in front of the
     * base host. Any subdomain used to count, and the kit hosts withComputer()
     * derives from a base with no api. label (computers.<base host>) are
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
     * Whether buildHeaders adds the SDK's own X-Hoody-Client-Version to a request: only on one built for the API
     * (`external` false) of a client whose target is 'account' (on a 'kit' client the base URL is a kit or
     * daemon), and only when neither the client's configured headers nor the call's own headers name the
     * header in any case. A value the caller set is the caller's, whatever it is, the SDK version included.
     */
    private addsClientVersion;
    /**
     * The request a middleware sent, without the X-Hoody-Client-Version the SDK itself added (`sdkAdded`, from
     * addsClientVersion) when the middleware moved it from `url` to a destination outside the API's scope.
     * request(), stream() and prepareUpgrade() all apply it, so no route lets the SDK's header reach a kit host.
     * A header the caller set is never removed; neither is one a middleware put in place of the SDK's.
     */
    private withoutMovedClientVersion;
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
    private runRequestMiddlewares;
    /**
     * True when a request carries a credential: a header the redaction set names
     * (Authorization, Cookie, X-*-Token, the computer claim, ...), a header
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
     * any other header name (X-Hoody-Token, X-Hoody-Computer-Claim, a kitAuth
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
     * A redirect that would send a request body to another origin (a 307 or
     * 308, or a 301 or 302 of anything but a POST) is refused the same way,
     * whatever the body holds and whether or not the request carries a
     * credential: a sign-in POST sends its password in the body with no
     * credential header. A request with a body is therefore always followed
     * here hop by hop. A redirect that turns the request into a body-less GET
     * (303, or 301 and 302 of a POST) is followed as before, and so is one that
     * stays on the same origin. In a web browser's page or worker, which does
     * not reveal where a manual redirect leads, a request with a body is
     * refused on every redirect, as a credentialed one is: there is no way to
     * tell a harmless one from one that would forward the body.
     *
     * A value sent as JSON is encoded once, before the first hop
     * (_bodyForHops), and every hop that keeps the body sends that same text: a
     * toJSON() or a getter runs once. Any other body (text, bytes, a Blob, a
     * FormData, a stream) is handed to fetch as given on every hop.
     *
     * Methods follow fetch: 303 turns anything but HEAD into a body-less GET,
     * 301 and 302 turn a POST into one, and 307 and 308 resend the method and
     * body (a streamed body, which cannot be sent twice, is refused).
     * One sent with redirect: 'error' goes out with 'manual', and any redirect it gets is refused.
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
    /**
     * The ApiError sendConfined throws; the URL is redacted, the credentials never leave. It is one
     * of _SDK_MADE_ERRORS: toApiError adds the attempt facts and the call's redactBodyKeys.
     */
    private redirectRefusal;
    private applyResponseMiddleware;
    private applyErrorMiddleware;
    /** With a signal, an abort ends the wait early (sleepUnlessAborted). */
    private sleep;
    private nextRequestId;
    /**
     * Normalize all responses into a stable API envelope: { statusCode, message, data }.
     *
     * A body that already is the envelope keeps every other top-level field it carries
     * (`propagation`, `pagination`, `total`/`limit`/`offset`, `metadata`): those are documented
     * parts of the answer, and dropping them left the caller no way to read them. Its `message`
     * may be absent (`{statusCode, data}`, the API's `/auth/available-regions`); it is filled in
     * from the status text. The generated types (RESPONSE_ENVELOPE_FIELDS) follow the same rule.
     */
    private normalizeResponseEnvelope;
}
