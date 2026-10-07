
/**
 * HTTP Client
 * Handles API requests with authentication, middleware, retries, and timeouts.
 */

import {
  ApiError,
  isApiError,
  RETRY_SAFE_CODES,
  type ApiErrorRequestContext,
  type ApiErrorResponseDetails,
} from './errors.js';

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

export interface IHttpClientMiddlewareResponseContext<T = unknown>
  extends IHttpClientMiddlewareRequestContext {
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

export interface IHttpClientMiddlewareErrorContext
  extends IHttpClientMiddlewareRequestContext {
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
  onRequest?: (
    context: IHttpClientMiddlewareRequestContext
  ) =>
    | IHttpClientMiddlewareRequestContext
    | void
    | Promise<IHttpClientMiddlewareRequestContext | void>;
  onResponse?: <T = unknown>(
    context: IHttpClientMiddlewareResponseContext<T>
  ) =>
    | IHttpClientMiddlewareResponseContext<T>
    | void
    | Promise<IHttpClientMiddlewareResponseContext<T> | void>;
  onError?: (
    context: IHttpClientMiddlewareErrorContext
  ) => void | Promise<void>;
}

/**
 * Per-client HTTP transport.
 *
 * Structurally a subset of the WHATWG `fetch` signature, so `globalThis.fetch`
 * is assignable without a cast and any interceptor that wraps it stays typed.
 * Every request the client issues — JSON, binary and the streaming seam —
 * goes through the instance's transport, never through the global directly.
 */
export type HoodyFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

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
   * PUT, DELETE) goes again up to 2 times on a status in `retryOnStatuses` and
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
    ttl?: number; // milliseconds
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
  finalizers?: Array<(
    context: IHttpClientMiddlewareRequestContext,
    routeTag: object | undefined
  ) => IHttpClientMiddlewareRequestContext | Promise<IHttpClientMiddlewareRequestContext>>;
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
   * Any HTTP answer to this request is final, whatever its status. For a call whose handler is
   * arbitrary code (an exec script): a 500, 502 or 429 it returned cannot be told from a
   * platform failure, and sending the request again runs the code again. With this set,
   * `retries` covers only a request that never reached a server (the connection could not be
   * opened).
   */
  responseIsFinal?: boolean;
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

interface ICacheEntry {
  data: unknown;
  timestamp: number;
}

interface IIpv4DnsCacheEntry {
  address: string;
  expiresAt: number;
}

interface IResolvedHttpClientTransportConfig {
  keepAlive: boolean;
}

interface IResolvedForceIPv4CacheConfig {
  enabled: boolean;
  ttlMs: number;
}

type NodeDnsLookup = (
  hostname: string,
  options: { family: 4 }
) => Promise<{ address: string }>;

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

interface _UndiciDispatcher {
  compose(interceptor: (dispatch: (opts: Record<string, unknown>, handler: unknown) => boolean) => (opts: Record<string, unknown>, handler: unknown) => boolean): _UndiciDispatcher;
  close(): Promise<void>;
}

interface _UndiciModule {
  fetch: (input: string | URL, init?: Record<string, unknown>) => Promise<Response>;
  Agent: new (options: Record<string, unknown>) => _UndiciDispatcher;
  FormData: new () => { append(name: string, value: unknown, filename?: string): void };
}

/** undici 8, the version the SDK depends on, needs Node 22.19. */
const _NODE_TRANSPORT_MIN_NODE: readonly [number, number] = [22, 19];
/** undici's own timers answer a little after the client's, so the client's timeout error is the one seen. */
const _NODE_TRANSPORT_TIMEOUT_GRACE_MS = 1000;
/** undici's default body idle timeout: a quiet stream keeps at least this long. */
const _NODE_TRANSPORT_MIN_BODY_TIMEOUT_MS = 300000;
/** The global fetch when this module loaded: a later replacement (a test double, an interceptor) is the caller's transport. */
const _FETCH_AT_LOAD: unknown = (globalThis as { fetch?: unknown }).fetch;

let _nodeTransport: Promise<NodeTransport | null> | undefined;

/** True on a Node that can load the SDK's transport (22.19 or later; not Bun, not Deno). */
export function nodeTransportSupported(): boolean {
  const runtime = globalThis as { process?: { versions?: Record<string, string | undefined> }; Deno?: unknown };
  const versions = runtime.process?.versions;
  if (!versions || typeof versions.node !== 'string' || versions.bun !== undefined || runtime.Deno !== undefined) return false;
  const parts = versions.node.split('.');
  const major = Number.parseInt(parts[0] ?? '', 10);
  const minor = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major > _NODE_TRANSPORT_MIN_NODE[0] || (major === _NODE_TRANSPORT_MIN_NODE[0] && minor >= _NODE_TRANSPORT_MIN_NODE[1]);
}

const _GLOBAL_DISPATCHER_KEYS = [Symbol.for('undici.globalDispatcher.2'), Symbol.for('undici.globalDispatcher.1')] as const;

/** The slot the built-in fetch reads its dispatcher from, and what it holds. */
function _readGlobalDispatcher(key?: symbol): { key: symbol; dispatcher: unknown } | undefined {
  const slots = globalThis as unknown as Record<symbol, unknown>;
  for (const candidate of key !== undefined ? [key] : _GLOBAL_DISPATCHER_KEYS) {
    const dispatcher = slots[candidate];
    if (dispatcher !== undefined && dispatcher !== null) return { key: candidate, dispatcher };
  }
  return undefined;
}

/**
 * A plain undici Agent constructed with no options: what Node creates for
 * itself. Read off the instance (its class name and the options it kept), so
 * it cannot see an Agent whose only difference is a custom `factory`, or a
 * compose() wrapper around one.
 */
function _looksLikeUntouchedAgent(dispatcher: unknown): boolean {
  if (dispatcher === null || typeof dispatcher !== 'object') return false;
  if ((dispatcher as { constructor?: { name?: string } }).constructor?.name !== 'Agent') return false;
  const optionsKey = Object.getOwnPropertySymbols(dispatcher).find((symbol) => symbol.description === 'options');
  if (optionsKey === undefined) return false;
  const options = (dispatcher as Record<symbol, unknown>)[optionsKey];
  if (options === null || typeof options !== 'object') return false;
  // What a no-argument Agent keeps (Node 22.19 to 26): `{ connect: undefined, interceptors: undefined }`
  // or `{ maxOrigins: Infinity, connect: undefined }`. Any option that is set is the application's.
  return Object.entries(options as Record<string, unknown>).every(([name, value]) =>
    value === undefined || value === null || (name === 'maxOrigins' && value === Infinity));
}

/**
 * The dispatcher of the built-in fetch as this module found it. The SDK's own
 * transport stands in for the built-in fetch only while that dispatcher is
 * Node's default, so that an application's dispatcher (a private CA, a client
 * certificate, a proxy, interceptors) is never sent around.
 *
 * Node creates its dispatcher the first time a fetch class is touched. If the
 * slot was empty when this module loaded, the object that appears when it
 * touches one is Node's own (`ownedByNode`). If something was already there,
 * it is judged by its look (_looksLikeUntouchedAgent). Either way a later
 * replacement is a different object and is seen on the next request.
 *
 * With NODE_USE_ENV_PROXY and a proxy variable, Node's own dispatcher is an
 * EnvHttpProxyAgent: not a plain Agent, so the built-in fetch (and the proxy)
 * is used.
 *
 * The limit: a dispatcher that looks like an untouched Agent, installed before
 * this module loaded and after something had touched fetch, is taken for the
 * default. `transport: { useGlobalDispatcher: true }` (or an injected
 * `fetch`) is the way to say so.
 */
const _DISPATCHER_AT_LOAD: { key: symbol; dispatcher: unknown; isDefault: boolean } | undefined = (() => {
  if (!nodeTransportSupported()) return undefined;
  try {
    const emptyBefore = _readGlobalDispatcher() === undefined;
    void (globalThis as { Response?: unknown }).Response;
    const found = _readGlobalDispatcher();
    if (!found) return undefined;
    const plainAgent = (found.dispatcher as { constructor?: { name?: string } }).constructor?.name === 'Agent';
    return { ...found, isDefault: plainAgent && (emptyBefore || _looksLikeUntouchedAgent(found.dispatcher)) };
  } catch {
    return undefined;
  }
})();

/** The dispatcher the built-in fetch uses is still the default one this module found at load. */
function _globalDispatcherIsDefault(): boolean {
  if (_DISPATCHER_AT_LOAD === undefined || !_DISPATCHER_AT_LOAD.isDefault) return false;
  return _readGlobalDispatcher(_DISPATCHER_AT_LOAD.key)?.dispatcher === _DISPATCHER_AT_LOAD.dispatcher;
}

/** Whether a request sent now, by a client with no injected fetch, goes through the SDK's own transport. */
export function nodeTransportInUse(): boolean {
  return nodeTransportSupported() && _globalDispatcherIsDefault();
}

/** An HTTP/2 session or stream failure anywhere in the cause chain. */
function _isHttp2Failure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR_HTTP2_')) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** undici's own timeout, anywhere in the cause chain: which one. */
function _undiciTimeoutOf(error: unknown): 'headers' | 'body' | 'connect' | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (code === 'UND_ERR_HEADERS_TIMEOUT') return 'headers';
    if (code === 'UND_ERR_BODY_TIMEOUT') return 'body';
    if (code === 'UND_ERR_CONNECT_TIMEOUT') return 'connect';
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Methods shouldRetry() may send again after a lost connection. */
const _IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];

/**
 * The default retry policy, used when neither the request nor the client sets `retries`
 * (IHttpClientConfig.retries): 2 more attempts (none for responseIsFinal), a 2 s backoff base,
 * at most 10 s of waiting in all. Same values as lib/http-wire.ts.
 */
const _DEFAULT_RETRIES = 2;
const _DEFAULT_RETRY_DELAY_MS = 2000;
const _DEFAULT_RETRY_WAIT_CAP_MS = 10_000;

/** Failures of opening the connection: the request was never written, so no server ran it. */
const _CONNECT_FAILURE_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'EHOSTDOWN', 'ENETUNREACH', 'ENETDOWN', 'UND_ERR_CONNECT_TIMEOUT'];

function _isConnectFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: unknown; syscall?: unknown };
  return (typeof failure.code === 'string' && _CONNECT_FAILURE_CODES.includes(failure.code)) || failure.syscall === 'connect';
}

/**
 * The request never reached a server: somewhere in the cause chain the connection failed to
 * open. Node reports a host with several addresses as one AggregateError; it counts when every
 * attempt in it failed that way.
 */
function _neverDispatched(error: unknown): boolean {
  let current: unknown = (error as { cause?: unknown } | null)?.cause;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    // A failure on a redirect hop: the first hop was answered (sendConfined marks it).
    if ((current as { afterDispatch?: unknown }).afterDispatch === true) return false;
    if (_isConnectFailure(current)) return true;
    const attempts = (current as { errors?: unknown }).errors;
    if (Array.isArray(attempts) && attempts.length > 0 && attempts.every(_isConnectFailure)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

const _TEXT_SUBTYPES: ReadonlySet<string> = new Set([
  'json', 'x-ndjson', 'ndjson', 'jsonl', 'x-jsonlines', 'json-seq', 'json5',
  'xml', 'javascript', 'x-javascript', 'ecmascript', 'yaml', 'x-yaml', 'yml', 'x-yml', 'csv',
  'x-www-form-urlencoded',
]);
const _TEXT_SUFFIXES = ['+json', '+xml', '+yaml'];

/**
 * True for a media type whose body is text: text/*, or one of the subtypes or
 * structured suffixes above. Matched on the exact subtype or suffix, never on
 * a substring: `openxmlformats` (.docx, .xlsx, .pptx) contains "xml" and is a
 * zip archive, which a substring test decoded as UTF-8 and corrupted. The same
 * rule as the CLI client (cli/http-client.ts isTextMediaType).
 */
export function isTextMediaType(contentType: string | null | undefined): boolean {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (type.startsWith('text/')) return true;
  const slash = type.indexOf('/');
  if (slash === -1) return false;
  const subtype = type.slice(slash + 1);
  return _TEXT_SUBTYPES.has(subtype) || _TEXT_SUFFIXES.some((suffix) => subtype.endsWith(suffix));
}

const _BYTE_FAMILIES = ['application/', 'image/', 'audio/', 'video/', 'font/'];

/**
 * True for a media type whose body is bytes: any application/* type that is
 * not text (isTextMediaType), and image/*, audio/*, video/*, font/*. Bytes are
 * the default for application/*: an Office or other vendor file
 * (vnd.openxmlformats-*, vnd.ms-*, vnd.oasis.opendocument.*) served without
 * Content-Disposition: attachment was decoded as UTF-8 and corrupted. text/*,
 * the text subtypes and a missing type are not bytes. The same rule as
 * lib/http-wire.ts isBinaryMediaType.
 */
export function isBinaryMediaType(contentType: string | null | undefined): boolean {
  if (isTextMediaType(contentType)) return false;
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  return _BYTE_FAMILIES.some((family) => type.startsWith(family) && type.length > family.length);
}

/** An integer literal JSON.parse cannot hold exactly needs at least 16 digits. */
const _LONG_DIGIT_RUN = /\d{16}/;

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
export function parseJsonLossless(text: string): unknown {
  if (!_LONG_DIGIT_RUN.test(text)) return JSON.parse(text);
  const tag = '\u0000int:' + Math.random().toString(36).slice(2) + ':';
  let out = '';
  let copied = 0;
  let swapped = false;
  const length = text.length;
  for (let i = 0; i < length;) {
    const ch = text.charCodeAt(i);
    if (ch === 0x22) {
      // A string: skip to its closing quote, minding escapes.
      i += 1;
      while (i < length) {
        const inner = text.charCodeAt(i);
        if (inner === 0x5c) { i += 2; continue; }
        i += 1;
        if (inner === 0x22) break;
      }
      continue;
    }
    if (ch === 0x2d || (ch >= 0x30 && ch <= 0x39)) {
      const start = i;
      if (ch === 0x2d) i += 1;
      while (i < length && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39) i += 1;
      const next = i < length ? text.charCodeAt(i) : 0;
      if (next === 0x2e || next === 0x65 || next === 0x45) {
        // A fraction or an exponent: a double, as JSON.parse reads it.
        while (i < length) {
          const c = text.charCodeAt(i);
          if ((c >= 0x30 && c <= 0x39) || c === 0x2e || c === 0x65 || c === 0x45 || c === 0x2b || c === 0x2d) i += 1;
          else break;
        }
        continue;
      }
      if (i - start >= 16) {
        const literal = text.slice(start, i);
        if (/^-?(0|[1-9]\d*)$/.test(literal) && !Number.isSafeInteger(Number(literal))) {
          out += text.slice(copied, start) + JSON.stringify(tag + literal);
          copied = i;
          swapped = true;
        }
      }
      continue;
    }
    i += 1;
  }
  if (!swapped) return JSON.parse(text);
  out += text.slice(copied);
  return JSON.parse(out, (_key, value: unknown) =>
    typeof value === 'string' && value.startsWith(tag) ? BigInt(value.slice(tag.length)) : value);
}

/**
 * JSON.stringify, except that a bigint is written as a plain integer literal
 * instead of throwing. Only reached when the value holds a bigint.
 */
export function stringifyJsonLossless(value: unknown): string {
  const tag = '\u0000int:' + Math.random().toString(36).slice(2) + ':';
  const text = JSON.stringify(value, (_key, entry: unknown) => typeof entry === 'bigint' ? tag + entry.toString() : entry);
  if (text === undefined) return text as unknown as string;
  const quoted = JSON.stringify(tag).slice(1, -1);
  return text.split('"' + quoted).map((part, index) => {
    if (index === 0) return part;
    const end = part.indexOf('"');
    return part.slice(0, end) + part.slice(end + 1);
  }).join('');
}

function _stringifyBody(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch (error) {
    // JSON.stringify refuses a bigint with a TypeError; anything else (a cycle) is the caller's.
    if (error instanceof TypeError && /bigint/i.test(error.message)) return stringifyJsonLossless(body);
    throw error;
  }
}

/**
 * For an HTML document, a one-line message: the status line plus the page's
 * <title> (or its first heading). undefined for anything that is not HTML.
 */
function _htmlErrorTitle(body: string, statusLine: string): string | undefined {
  const head = body.slice(0, 512).trimStart().toLowerCase();
  if (!head.startsWith('<!doctype html') && !head.startsWith('<html')) return undefined;
  const found = /<title[^>]*>([^<]*)<\/title>/i.exec(body) ?? /<h1[^>]*>([^<]*)<\/h1>/i.exec(body);
  const title = found ? found[1]!.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (title.length === 0) return statusLine;
  return statusLine.endsWith(': ') || statusLine.endsWith(':') ? statusLine.trimEnd() + ' ' + title : statusLine + ' (' + title + ')';
}

/** Statuses whose Response takes no body. */
const _NULL_BODY_STATUSES = [101, 103, 204, 205, 304];

/**
 * undici's Response as the runtime's own class, so `instanceof Response` and
 * middleware written against the global keep working. The body is passed on
 * unread.
 */
function _asRuntimeResponse(response: Response): Response {
  const RuntimeResponse = (globalThis as { Response?: typeof Response }).Response;
  // (Checked through unknown: to the type checker both are Response, and a plain instanceof
  // would leave nothing to wrap.)
  if (typeof RuntimeResponse !== 'function' || (response as unknown) instanceof RuntimeResponse) return response;
  let wrapped: Response;
  try {
    // A status the constructor refuses (below 200) throws: that response is passed on as it is.
    wrapped = new RuntimeResponse(_NULL_BODY_STATUSES.includes(response.status) ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as unknown as HeadersInit,
    });
  } catch {
    return response;
  }
  Object.defineProperty(wrapped, 'url', { value: response.url });
  Object.defineProperty(wrapped, 'redirected', { value: response.redirected });
  Object.defineProperty(wrapped, 'type', { value: response.type });
  return wrapped;
}

/**
 * After the undici import: undo what the import itself installed, and nothing else.
 *
 * undici 8 installs a default only when its own slot (`.2`) is empty: a fresh no-option Agent
 * there, and a Dispatcher1Wrapper of it in the legacy slot (`.1`), which is where the built-in
 * fetch of Node 22 to 24 reads its dispatcher. The legacy slot is put back only when that is what
 * it holds. Anything else in it was set by the application while the import was pending (or by an
 * earlier undici load), and is left. The limit: an application dispatcher set in the legacy slot
 * BEFORE undici evaluated is overwritten by undici itself, and what is put back is the one seen
 * before the import.
 */
function _restoreDispatcherSlots(before: ReadonlyArray<readonly [symbol, unknown]>, loaded: Record<string, unknown>): void {
  const slots = globalThis as unknown as Record<symbol, unknown>;
  const [ownKey, legacyKey] = _GLOBAL_DISPATCHER_KEYS;
  const ownBefore = before.find(([key]) => key === ownKey)?.[1];
  const legacyBefore = before.find(([key]) => key === legacyKey)?.[1];
  if (ownBefore !== undefined || legacyBefore === undefined) return;
  const undiciModule = (typeof loaded.Agent === 'function' ? loaded : loaded.default) as Record<string, unknown> | undefined;
  const Agent = undiciModule?.Agent;
  const Wrapper = undiciModule?.Dispatcher1Wrapper;
  if (typeof Agent !== 'function' || typeof Wrapper !== 'function') return;
  const installed = slots[ownKey];
  if (!(installed instanceof Agent) || !_looksLikeUntouchedAgent(installed)) return;
  const legacy = slots[legacyKey];
  if (legacy !== legacyBefore && legacy instanceof Wrapper) {
    try { slots[legacyKey] = legacyBefore; } catch { /* not writable: left as undici set it */ }
  }
}

async function _createNodeTransport(): Promise<NodeTransport | null> {
  if (!nodeTransportSupported() || !_globalDispatcherIsDefault()) return null;

  // Importing undici 8 on a Node that bundles an older one re-points the
  // built-in fetch's dispatcher slot at undici 8's default Agent (HTTP/2 on).
  // The built-in fetch belongs to the rest of the process: put its dispatcher back.
  const slots = globalThis as unknown as Record<symbol, unknown>;
  const before = _GLOBAL_DISPATCHER_KEYS.map((key) => [key, slots[key]] as const);
  const specifier = 'undici';
  const loaded = await import(specifier) as { default?: unknown } & Record<string, unknown>;
  _restoreDispatcherSlots(before, loaded);
  const candidate = (typeof loaded.fetch === 'function' ? loaded : loaded.default) as Partial<_UndiciModule> | undefined;
  if (!candidate || typeof candidate.fetch !== 'function' || typeof candidate.Agent !== 'function' || typeof candidate.FormData !== 'function') {
    return null;
  }
  const undici = candidate as _UndiciModule;

  // HTTP/1.1 only. The timeouts are set per request (below); 0 here means a
  // request sent with no budget has none.
  const newAgent = (): _UndiciDispatcher => new undici.Agent({ allowH2: false });
  let agent = newAgent();

  const withTimeouts = (dispatcher: _UndiciDispatcher, timeoutMs: number | undefined): _UndiciDispatcher => {
    if (timeoutMs === undefined) return dispatcher;
    const budget = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const headersTimeout = budget ? timeoutMs + _NODE_TRANSPORT_TIMEOUT_GRACE_MS : 0;
    const bodyTimeout = budget ? Math.max(timeoutMs + _NODE_TRANSPORT_TIMEOUT_GRACE_MS, _NODE_TRANSPORT_MIN_BODY_TIMEOUT_MS) : 0;
    return dispatcher.compose((dispatch) => (opts, handler) => dispatch({ ...opts, headersTimeout, bodyTimeout }, handler));
  };

  // undici's fetch reads only its own FormData: the runtime's would go out as
  // the text "[object FormData]".
  const toUndiciBody = (body: unknown): unknown => {
    if (typeof FormData === 'undefined' || !(body instanceof FormData) || body instanceof undici.FormData) return body;
    const form = new undici.FormData();
    for (const [name, value] of (body as unknown as { entries(): IterableIterator<[string, string | { name?: string }]> }).entries()) {
      if (typeof value === 'string') form.append(name, value);
      else form.append(name, value, typeof value.name === 'string' ? value.name : undefined);
    }
    return form;
  };

  const reset = (): void => {
    const stale = agent;
    agent = newAgent();
    void stale.close().catch(() => undefined);
  };

  return {
    undici,
    reset,
    fetch: async (input, init, timeoutMs) => {
      const own = init as (RequestInit & { dispatcher?: _UndiciDispatcher }) | undefined;
      const options: Record<string, unknown> = { ...(own ?? {}) };
      options.dispatcher = withTimeouts(own?.dispatcher ?? agent, timeoutMs);
      if (own?.body !== undefined && own.body !== null) options.body = toUndiciBody(own.body);
      try {
        return _asRuntimeResponse(await undici.fetch(input, options));
      } catch (error) {
        // A broken HTTP/2 session is reused for every later request to its
        // host: stop using the pool that holds it.
        if (own?.dispatcher === undefined && _isHttp2Failure(error)) reset();
        throw error;
      }
    },
  };
}

/**
 * The SDK's Node transport, created once per process; null where the built-in
 * fetch is used instead (see NodeTransport).
 */
export function loadNodeTransport(): Promise<NodeTransport | null> {
  if (_nodeTransport === undefined) {
    _nodeTransport = _createNodeTransport().catch(() => null);
  }
  return _nodeTransport;
}

type _BudgetedFetch = (input: string | URL | Request, init: RequestInit | undefined, timeoutMs: number | undefined) => Promise<Response>;

/** The default transports that take a request's timeoutMs, by the fetch function the client holds. */
const _BUDGETED_FETCH = new WeakMap<HoodyFetch, _BudgetedFetch>();

/**
 * The default transport on Node: the SDK's own (NodeTransport) once it has
 * loaded, the built-in fetch where it cannot be used.
 */
function _nodeDefaultFetch(builtin: HoodyFetch): HoodyFetch {
  const send: _BudgetedFetch = async (input, init, timeoutMs) => {
    // undici's fetch does not read the runtime's Request class.
    if (typeof input !== 'string' && !(input instanceof URL)) return builtin(input, init);
    // Asked on every request: an application that installs its own dispatcher
    // later is sent through it from then on.
    if (!_globalDispatcherIsDefault()) return builtin(input, init);
    const transport = await loadNodeTransport();
    return transport ? transport.fetch(input, init, timeoutMs) : builtin(input, init);
  };
  const defaultFetch: HoodyFetch = (input, init) => send(input, init, undefined);
  _BUDGETED_FETCH.set(defaultFetch, send);
  return defaultFetch;
}

/**
 * Resolve the default transport once, at construction time.
 *
 * Bound to `globalThis` because an unbound reference to `globalThis.fetch`
 * throws "Illegal invocation" in browsers when called as a bare function.
 * When the runtime has no `fetch` at all we do NOT silently no-op: the
 * returned transport throws on first use with an actionable message, so a
 * missing transport surfaces at the request, not as an undefined call.
 */
function resolveDefaultFetch(useGlobalDispatcher = false): HoodyFetch {
  const globalFetch = (globalThis as { fetch?: HoodyFetch }).fetch;
  if (typeof globalFetch === 'function') {
    const builtin = globalFetch.bind(globalThis) as HoodyFetch;
    if (useGlobalDispatcher) return builtin;
    // On Node the SDK sends through its own transport (NodeTransport), unless
    // the global fetch was replaced after this module loaded: that replacement
    // is the transport the caller chose.
    return globalFetch === _FETCH_AT_LOAD && nodeTransportSupported() ? _nodeDefaultFetch(builtin) : builtin;
  }
  return () => {
    // FETCH_UNAVAILABLE: the same answer on every attempt, so shouldRetry treats it as final.
    throw Object.assign(new Error(
      'No fetch implementation available in this runtime. Pass one explicitly: new HttpClient({ fetch: myFetch }).'
    ), { code: 'FETCH_UNAVAILABLE' });
  };
}

type RequiredHttpClientConfig = Required<Omit<IHttpClientConfig, 'middlewares' | 'finalizers' | 'transport' | 'forceIPv4Cache' | 'onKitAuthExpired' | 'onStreamDiagnostic' | 'retries' | 'retryDelayMs'>> & {
  /** Absent: the default policy (IHttpClientConfig.retries). */
  retries?: number;
  retryDelayMs?: number;
  onStreamDiagnostic?: (error: unknown) => void;
  middlewares: IHttpClientMiddleware[];
  transport: IResolvedHttpClientTransportConfig;
  forceIPv4Cache: IResolvedForceIPv4CacheConfig;
  onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<unknown>;
};

/**
 * Stable 32-bit FNV-1a over a string, returned as hex. Used only to partition
 * the GET cache by caller identity — NOT a security primitive. Collisions are
 * not observable since we also key by method + URL.
 */
function hashIdentity(token: string): string {
  if (!token) return '0';
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16);
}

// Extract values of auth-like headers so they contribute to the GET cache
// partition key. Without this, only config.token is keyed, so a caller
// supplying Authorization via config.headers / data.headers could receive
// a cached response baked under a different identity.
function hashAuthHeaders(
  configHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
): string {
  const merged: Record<string, string> = {};
  for (const src of [configHeaders, requestHeaders]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) merged[k.toLowerCase()] = v;
  }
  // Mirrors lib/redact.ts SECRET_HEADER_RE so every credential-bearing
  // header contributes to the cache partition.
  const AUTH_KEY_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-.*-lease|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/;
  const parts: string[] = [];
  for (const k of Object.keys(merged).sort()) {
    if (AUTH_KEY_RE.test(k)) parts.push(k + '=' + merged[k]);
  }
  return parts.length ? parts.join('\n') : '';
}

/**
 * Detect one-shot request bodies (ReadableStream, async iterable) that
 * cannot be replayed safely on retry. Matches the same check in the
 * browser http-client.
 */
function _isNonReplayableBody(body: unknown): boolean {
  if (body === undefined || body === null) return false;
  const g: any = globalThis as any;
  if (typeof g.ReadableStream !== 'undefined' && body instanceof g.ReadableStream) return true;
  if (typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function') return true;
  return false;
}

/**
 * Redaction helpers — keep in sync with lib/redact.ts.
 * Inlined here because generated/http-client.ts is self-contained.
 */
const _SECRET_HEADER_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-.*-lease|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/i;
/**
 * Headers that carry a credential, for the credential-scope check in
 * applyRequestMiddleware(): the redaction set plus the kit container claim.
 * The browser client defines the same predicate over lib/redact.ts.
 */
function _isCredentialHeader(name: string): boolean {
  return _SECRET_HEADER_RE.test(name) || name.toLowerCase() === 'x-hoody-container-claim';
}

/**
 * One query value as wire text.
 *
 * A plain object or an array item that is an object is sent as JSON, never as
 * String(value): that was "[object Object]" on the wire, which hoody-browser's
 * restart({ viewport }) answered with 400 "Invalid viewport format".
 * The generated methods serialise a parameter the spec declares as deepObject
 * or form-exploded before it gets here; this is the floor for everything else.
 */
function _queryString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

/**
 * The machine code of an error body: an explicit string code wins, then a
 * code-shaped error field (hoody-api puts its code there: TOKEN_CEILING_EXCEEDED,
 * SIGNING_NOT_CONFIGURED), then a nested error object's code. Prose in error
 * ("Bad Request", "key not found") is never promoted to a code.
 */
function _apiErrorCode(record: Record<string, unknown>): string | undefined {
  if (typeof record.code === 'string' && record.code.length > 0) return record.code;
  const error = record.error;
  if (typeof error === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(error)) return error;
  if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
    const nested = (error as Record<string, unknown>).code;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

/**
 * Response headers as a plain record, lower-cased names: what a HEAD request
 * returns as its data, since a HEAD answer is its headers.
 */
function _headerRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, name) => {
    record[name.toLowerCase()] = value;
  });
  return record;
}

/**
 * The error code a response carries in its X-Hoody-Error-Code header, when it is
 * code-shaped. A HEAD answer has no body, so this is the only place its code can be.
 */
function _headerErrorCode(headers: Headers): string | undefined {
  const value = headers.get('x-hoody-error-code');
  const code = value === null ? '' : value.trim();
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : undefined;
}

/**
 * One entry per header name, compared case-insensitively: the first spelling is
 * kept and the value set last wins. The same object comes back when nothing folds.
 */
function _foldHeaderCase(headers: Record<string, string>): Record<string, string> {
  const spelling = new Map<string, string>();
  const out: Record<string, string> = {};
  let folded = false;
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    const first = spelling.get(lower);
    if (first === undefined) {
      spelling.set(lower, name);
      out[name] = value;
    } else {
      out[first] = value;
      folded = true;
    }
  }
  return folded ? out : headers;
}

function _withFoldedHeaders<T extends { headers: Record<string, string> }>(context: T): T {
  const headers = context.headers ? _foldHeaderCase(context.headers) : context.headers;
  return headers === context.headers ? context : { ...context, headers };
}

/** True when path is an absolute http(s) URL, the scheme in any case. */
function _isFullUrl(path: string): boolean {
  return /^https?:[/][/]/i.test(path);
}

/**
 * The base this runtime's fetch resolves a relative URL against: the
 * document's base URL in a page, the location in a worker (its origin, when
 * that is all it carries), none elsewhere (Node's fetch refuses a relative
 * URL). Only an http(s) base counts.
 */
function _transportBase(): string | undefined {
  const g = globalThis as { document?: { baseURI?: unknown }; location?: { href?: unknown; origin?: unknown } };
  const candidates = [g.document ? g.document.baseURI : undefined, g.location ? g.location.href : undefined, g.location ? g.location.origin : undefined];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:/i.test(candidate)) return candidate;
  }
  return undefined;
}

/**
 * True when url is relative and stays on the origin of whatever base it is
 * resolved against: resolved against two unrelated bases, one per scheme, it
 * keeps each base's host. An absolute URL, a scheme-relative one, and every
 * spelling the URL parser turns into one (a backslash for a slash, a tab or
 * newline inside it, a scheme with no slashes) takes a host of its own.
 */
function _isOriginRelative(url: string): boolean {
  try {
    return new URL(url, 'https://a.invalid/').host === 'a.invalid'
      && new URL(url, 'http://b.invalid/').host === 'b.invalid';
  } catch {
    return false;
  }
}

/**
 * The credential names a request recorded in its middlewareContext: header
 * names (_credentialHeaders) and query parameter names
 * (_credentialQueryParams), copied.
 */
function _credentialNamesOf(middlewareContext: unknown): { headers: string[]; params: string[] } {
  return {
    headers: _credentialHeadersOf(middlewareContext),
    params: _credentialQueryParamsOf(middlewareContext),
  };
}

/**
 * next, with every credential name recorded before a middleware step still
 * recorded after it. A step that returns a new middlewareContext without the
 * names does not make the credential ordinary: it is still confined, and
 * still redacted from an ApiError.
 */
function _carryCredentialNames<T extends { middlewareContext?: Record<string, unknown> }>(
  before: { headers: string[]; params: string[] },
  next: T
): T {
  const headers = _credentialHeadersOf(next.middlewareContext);
  const params = _credentialQueryParamsOf(next.middlewareContext);
  const lostHeaders = before.headers.filter((name) => !headers.includes(name));
  const lostParams = before.params.filter((name) => !params.includes(name));
  if (lostHeaders.length === 0 && lostParams.length === 0) return next;
  const middlewareContext: Record<string, unknown> = { ...(next.middlewareContext ?? {}) };
  if (lostHeaders.length > 0) middlewareContext._credentialHeaders = [...headers, ...lostHeaders];
  if (lostParams.length > 0) middlewareContext._credentialQueryParams = [...params, ...lostParams];
  return { ...next, middlewareContext };
}

/**
 * Remove every spelling of Content-Type. Header names are case-insensitive, so
 * a configured or per-request "content-type" survived a delete of
 * "Content-Type" and went out on a request with no body.
 */
function _deleteContentType(headers: Record<string, string>): void {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'content-type') {
      delete headers[name];
    }
  }
}

/**
 * Remove every spelling of Content-Type that still holds the default
 * application/json. A raw byte body is not JSON, but a type the caller chose
 * for it is kept.
 */
function _deleteDefaultJsonContentType(headers: Record<string, string>): void {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'content-type' && headers[name] === 'application/json') {
      delete headers[name];
    }
  }
}

/**
 * The body as it goes on the wire. A string the generated method marked as a
 * JSON value is JSON-encoded here, exactly once, and only when the
 * Content-Type actually being sent (after request middleware) is JSON. A
 * string sent as text (evalPost's text/plain script) or raw goes verbatim:
 * quoting it changed the program.
 */
function _wireBody(body: unknown, headers: Record<string, string>, jsonString: boolean | undefined): unknown {
  if (jsonString !== true || typeof body !== 'string') return body;
  const name = Object.keys(headers).find((key) => key.toLowerCase() === 'content-type');
  return name !== undefined && isJsonContentType(String(headers[name])) ? JSON.stringify(body) : body;
}

/**
 * Whether a Content-Type names JSON: application/json or a structured-syntax
 * +json type (application/problem+json, application/manifest+json), parameters
 * and case aside. application/json-seq, application/jsonx, text/json and two
 * types folded into one header are not JSON: such a body is read as text.
 */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  return type === 'application/json' || /^application[/][a-z0-9_.+-]+[+]json$/.test(type);
}

// Extended credential key set; keep in sync with lib/redact.ts.
const _SECRET_FIELD_RE = /^(token|hdy[-_]?token|api[-_]?key|apikey|password|passwd|pwd|secret|auth|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|session[-_]?token|temp[-_]?token|kit[-_]?token|otp|device[-_]?code|code[-_]?verifier|code[-_]?challenge|authorization|cookie|private[-_]?key|client[-_]?secret|secret[-_]?access[-_]?key|aws[-_]?secret|ssh[-_]?pass(?:word)?|socks5[-_]?pass(?:word)?|proxy[-_]?pass(?:word)?|db[-_]?pass(?:word)?|kit[-_]?pass(?:word)?|local[-_]?pass(?:word)?|auth[-_]?pass(?:word)?|cur[-_]?pass(?:word)?|credential|credentials|key|jwt)$/i;
// (Keep in sync with lib/redact.ts isSecretFieldName.) _SECRET_FIELD_RE is a list of whole names, so it knows only the names someone
// wrote down. The specs name credentials in many more ways (current_password,
// key_file_pass, client_credentials, sse_customer_key, confirm_token, …), all
// built the same way: qualifiers, then the noun that says what the value is.
// _isSecretFieldName reads the noun.
const _SECRET_NOUNS: readonly string[] = ['password', 'passwd', 'pwd', 'pass', 'passphrase', 'secret', 'secrets', 'token', 'credential', 'credentials', 'cookie', 'cookies', 'jwt'];
// A leading verb makes the field a switch about the secret, not the secret (has_password, persist_credentials).
const _FLAG_PREFIXES: readonly string[] = ['has', 'is', 'ask', 'persist', 'require', 'requires', 'cors', 'use', 'allow', 'remember'];
// "..._token" that is a paging cursor.
const _CURSOR_QUALIFIERS: readonly string[] = ['page', 'next', 'prev', 'previous', 'continuation', 'pagination', 'cursor'];
// "..._key" that is not key material.
const _PLAIN_KEY_QUALIFIERS: readonly string[] = ['public', 'idempotency', 'cache', 'logical', 'action', 'sort', 'partition', 'primary', 'foreign', 'host'];
// "..._code" that is a one-time credential (a bare `code` is an error code; see _isOauthCodeContext).
const _SECRET_CODE_QUALIFIERS: readonly string[] = ['otp', 'totp', 'mfa', 'auth', 'authorization', 'device', 'verification', 'recovery', 'backup'];
// A trailing encoding says how the value is written, not what it is (sse_customer_key_base64, key_pem).
const _ENCODING_SUFFIXES: readonly string[] = ['base64', 'b64', 'b64url', 'hex', 'pem'];
// Keys that sit beside an OAuth authorization `code`.
const _OAUTH_CODE_SIBLINGS: readonly string[] = ['state', 'redirect_uri', 'redirecturi', 'code_verifier', 'codeverifier', 'grant_type', 'granttype', 'client_id', 'clientid'];

/** snake_case, kebab-case and camelCase names as lower-case words. */
function _nameWords(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/**
 * True for a body field or query parameter name that carries a credential:
 * a name in _SECRET_FIELD_RE, or one whose last word is a secret noun
 * (`current_password`, `key_file_pass`, `client_credentials`, `confirm_token`,
 * `sse_customer_key`, `otp_code`, `approver_lease`). Names that only mention a
 * secret are not (`has_password`, `token_url`, `max_tokens`, `public_key`,
 * `idempotency_key`, `next_page_token`).
 */
function _isSecretFieldName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (_SECRET_FIELD_RE.test(name)) return true;
  const words = _nameWords(name);
  while (words.length > 1 && _ENCODING_SUFFIXES.includes(words[words.length - 1]!)) words.pop();
  if (words.length < 2) return words.length === 1 && (words[0] === 'key' || _SECRET_NOUNS.includes(words[0]!));
  if (_FLAG_PREFIXES.includes(words[0]!)) return false;
  const noun = words[words.length - 1]!;
  const qualifiers = words.slice(0, -1);
  if (noun === 'token') return !qualifiers.some((word) => _CURSOR_QUALIFIERS.includes(word));
  if (_SECRET_NOUNS.includes(noun)) return true;
  if (noun === 'key') return !qualifiers.some((word) => _PLAIN_KEY_QUALIFIERS.includes(word));
  if (noun === 'code') return qualifiers.some((word) => _SECRET_CODE_QUALIFIERS.includes(word));
  if (noun === 'lease') return qualifiers.includes('approver');
  return false;
}

/** In a URL a signature is the credential too (a presigned link: X-Amz-Signature, sig). */
function _isSecretUrlParam(name: string): boolean {
  if (_isSecretFieldName(name)) return true;
  const words = _nameWords(name);
  const noun = words[words.length - 1];
  return noun === 'signature' || noun === 'sig';
}

/**
 * A bare `code` is an error code almost everywhere, and masking it hid every
 * server error code that was printed through the redactor. It is a credential
 * only as an OAuth authorization code, which travels with `state`,
 * `redirect_uri`, `code_verifier`, `grant_type` or `client_id`.
 */
function _isOauthCodeContext(keys: readonly string[]): boolean {
  return keys.some((key) => _OAUTH_CODE_SIBLINGS.includes(key.toLowerCase()));
}

/**
 * A string that is one absolute URL carrying userinfo or a secret parameter is redacted as a URL.
 * So is a relative one (it starts with `/` or `?`, has no whitespace and carries a query): its
 * query gets _redactUrl's relative rule, the OAuth-context `code` included.
 */
function _scrubUrlValue(text: string, extra: readonly string[] | undefined): string {
  if (/^[/?]\S*$/.test(text) && text.includes('?')) return _redactUrl(text, extra);
  if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(text)) return text;
  if (text.length > 8192) return _scrubLongUrl(text);
  try {
    const u = new URL(text);
    const keys = Array.from(u.searchParams.keys());
    const oauth = _isOauthCodeContext(keys);
    const secret = u.username !== '' || u.password !== ''
      || keys.some((key) => _isSecretUrlParam(key) || _isExtraName(key, extra) || (oauth && key.toLowerCase() === 'code'));
    return secret ? _redactUrl(text, extra) : text;
  } catch {
    return text;
  }
}

// URL autologin token value-shape; keep in sync with lib/redact.ts HDY_TOKEN_VALUE_RE.
// Scrubs an hdy_ token wherever it appears (path segment, non-secret param, or a
// secret param the field-name pass missed) so a launch token is never logged whole.
const _HDY_TOKEN_VALUE_RE = /hdy_[A-Za-z0-9_-]{20,}/g;
const _REDACT_PLACEHOLDER = '[REDACTED]';
const _REDACT_MAX_DEPTH = 6;

/**
 * extraNames: header names recorded as carrying a credential (kitAuth under an
 * operator-chosen header name, lib/redact.ts redactHeaders), matched case-insensitively.
 */
function _redactHeaders(headers: Record<string, string>, extraNames?: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      _SECRET_HEADER_RE.test(k) || _isExtraName(k, extraNames) ? [k, _REDACT_PLACEHOLDER] : [k, v],
    ),
  );
}

/** The credential query parameter names a request recorded (lib/redact.ts credentialQueryParamsOf). */
function _credentialQueryParamsOf(middlewareContext: unknown): string[] {
  const v = (middlewareContext as Record<string, unknown> | null | undefined)?.['_credentialQueryParams'];
  return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && n.length > 0) : [];
}

/** The credential header names a request recorded (lib/redact.ts credentialHeadersOf). */
function _credentialHeadersOf(middlewareContext: unknown): string[] {
  const v = (middlewareContext as Record<string, unknown> | null | undefined)?.['_credentialHeaders'];
  return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && n.length > 0) : [];
}

/** Case-insensitive membership in the extra secret names (lib/redact.ts isExtraName). */
function _isExtraName(name: string, extra: readonly string[] | undefined): boolean {
  if (!extra || extra.length === 0) return false;
  const lower = _wellFormed(name).toLowerCase();
  return extra.some((n) => typeof n === 'string' && _wellFormed(n).toLowerCase() === lower);
}

/**
 * Lone surrogates → U+FFFD, as a URL serialiser writes them, so a configured
 * name compares equal to the key URLSearchParams decodes back (lib/redact.ts wellFormed).
 */
function _wellFormed(s: string): string {
  const f = (s as { toWellFormed?: () => string }).toWellFormed;
  return typeof f === 'function' ? f.call(s) : s;
}

function _escapeRegExp(s: string): string {
  return s.replace(/[.*+?^(){}$|[\]\\]/g, '\\$&');
}

/**
 * Scrub name=value pairs for the given names anywhere in a string (lib/redact.ts
 * scrubNamedParams): raw, percent-encoded and form-encoded (a+b) spellings, matched
 * case-insensitively. It runs while an error is being built, so it never throws: a
 * failure redacts the whole value instead of masking the real error.
 */
function _scrubNamedParams(text: string, extra: readonly string[] | undefined): string {
  if (!extra || extra.length === 0 || typeof text !== 'string') return text;
  try {
    let out = text;
    for (const name of extra) {
      if (typeof name !== 'string' || name.length === 0) continue;
      const forms = new Set<string>([
        name,
        // URLSearchParams never throws: a lone surrogate becomes U+FFFD, as a URL
        // serialiser writes it.
        new URLSearchParams([[name, '']]).toString().slice(0, -1),
      ]);
      try {
        forms.add(encodeURIComponent(name));
      } catch {
        // Lone surrogate: no URL spells the name this way.
      }
      const alternatives = [...forms].map(_escapeRegExp).join('|');
      const re = new RegExp('([?&])(' + alternatives + ')=([^&#\\s"\']*)', 'gi');
      out = out.replace(re, '$1$2=' + encodeURIComponent(_REDACT_PLACEHOLDER));
    }
    return out;
  } catch {
    return _REDACT_PLACEHOLDER;
  }
}

/**
 * An absolute URL too long to parse cheaply: its userinfo and its whole query
 * string go, the rest stays. One pass over the text.
 */
function _scrubLongUrl(text: string): string {
  const authorityStart = text.indexOf('//') + 2;
  let authorityEnd = authorityStart;
  while (authorityEnd < text.length && text[authorityEnd] !== '/' && text[authorityEnd] !== '?' && text[authorityEnd] !== '#') authorityEnd++;
  const at = text.lastIndexOf('@', authorityEnd - 1);
  const userinfo = at >= authorityStart;
  const queryAt = text.indexOf('?', authorityEnd);
  const hashAt = text.indexOf('#', authorityEnd);
  const hasQuery = queryAt >= 0 && (hashAt < 0 || queryAt < hashAt);
  if (!userinfo && !hasQuery) return text.replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
  const head = text.slice(0, authorityStart) + (userinfo ? _REDACT_PLACEHOLDER + '@' + text.slice(at + 1, authorityEnd) : text.slice(authorityStart, authorityEnd));
  const pathEnd = hasQuery ? queryAt : hashAt >= 0 ? hashAt : text.length;
  const path = text.slice(authorityEnd, pathEnd);
  const query = hasQuery ? '?' + encodeURIComponent(_REDACT_PLACEHOLDER) : '';
  const fragment = hashAt >= 0 ? text.slice(hashAt) : '';
  return (head + path + query + fragment).replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
}

function _redactUrl(url: string, extraParamNames?: readonly string[]): string {
  if (typeof url !== 'string' || url.length === 0) return url;
  try {
    const u = new URL(url);
    if (u.username) u.username = _REDACT_PLACEHOLDER;
    if (u.password) u.password = _REDACT_PLACEHOLDER;
    const keys = Array.from(u.searchParams.keys());
    const oauth = _isOauthCodeContext(keys);
    for (const key of keys) {
      if (_isSecretUrlParam(key) || _isExtraName(key, extraParamNames) || (oauth && key.toLowerCase() === 'code')) u.searchParams.set(key, _REDACT_PLACEHOLDER);
    }
    // Belt-and-suspenders: scrub any hdy_-shaped value by shape (path segments,
    // renamed params) that the field-name pass above would miss.
    return u.toString().replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
  } catch {
    // Relative URLs throw from the URL constructor; fall back to textual
    // query scrub so verbose logs with an empty baseURL still redact
    // secret query params.
    const qIdx = url.indexOf('?');
    if (qIdx < 0) return url;
    const hashIdx = url.indexOf('#', qIdx);
    const queryEnd = hashIdx >= 0 ? hashIdx : url.length;
    const base = url.slice(0, qIdx + 1);
    const queryRaw = url.slice(qIdx + 1, queryEnd);
    const tail = hashIdx >= 0 ? url.slice(hashIdx) : '';
    if (queryRaw.length === 0) return url;
    const pairs = queryRaw.split('&');
    // The same OAuth-context rule as the absolute branch: a code beside state, redirect_uri, ...
    // is a one-time credential.
    const decodedKeys: string[] = [];
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      try { decodedKeys.push(decodeURIComponent((eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, ' '))); } catch { /* not a key this rule can read */ }
    }
    const oauth = _isOauthCodeContext(decodedKeys);
    const parts = pairs.map(pair => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const k = pair.slice(0, eq);
      try {
        const dk = decodeURIComponent(k);
        if (_isSecretUrlParam(dk) || _isExtraName(dk, extraParamNames) || (oauth && dk.toLowerCase() === 'code')) return k + '=' + encodeURIComponent(_REDACT_PLACEHOLDER);
      } catch { /* leave as-is on decode failure */ }
      return pair;
    });
    return (base + parts.join('&') + tail).replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
  }
}

function _redactSensitiveValue(v: unknown, _depth = 0, _seen: WeakSet<object> = new WeakSet(), extraFieldNames?: readonly string[]): unknown {
  if (_depth > _REDACT_MAX_DEPTH) return '[depth-limit]';
  if (v === null || v === undefined) return v;
  // Value-shape scrub for hdy_ launch tokens embedded in string values, and the
  // recorded credential parameters in any URL-like string (keep in sync with
  // lib/redact.ts redactSensitiveValue).
  if (typeof v === 'string') return _scrubNamedParams(_scrubUrlValue(v.replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER), extraFieldNames), extraFieldNames);
  if (typeof v !== 'object') return v;
  if (_seen.has(v as object)) return '[Circular]';
  _seen.add(v as object);
  if (Array.isArray(v)) return v.map((x) => _redactSensitiveValue(x, _depth + 1, _seen, extraFieldNames));
  const out: Record<string, unknown> = {};
  const oauth = _isOauthCodeContext(Object.keys(v as Record<string, unknown>));
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = _isSecretFieldName(k) || _isExtraName(k, extraFieldNames) || (oauth && k.toLowerCase() === 'code')
      ? _REDACT_PLACEHOLDER
      : _redactSensitiveValue(val, _depth + 1, _seen, extraFieldNames);
  }
  return out;
}

// Cap the Node GET cache. Node has more memory than a browser tab, but an
// unbounded Map still leaks over long-running daemon processes. LRU
// eviction on insert when the cap is reached.
const _NODE_CACHE_MAX_ENTRIES = 1024;

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
}

/**
 * The frame size a stream holds when neither the call nor the client sets
 * one: 16 MiB. Without a bound a server that never ends a line, or never
 * ends a frame, grows the parser's buffer until the process runs out of
 * memory. The check runs as each chunk is parsed, so what is held at once
 * is at most this plus one read of the body.
 */
export const DEFAULT_MAX_STREAM_FRAME_BYTES = 16 * 1024 * 1024;

/**
 * The frame limit a stream uses: the call's `maxFrameBytes`, else the
 * client's `maxStreamFrameBytes`, else DEFAULT_MAX_STREAM_FRAME_BYTES. Only
 * a whole number above 0 counts: NaN, 0, a negative, a fraction, Infinity or a
 * non-number from untyped config is passed over, so a bad setting keeps a
 * bound instead of ending every stream or holding frames without limit.
 */
function resolveMaxFrameBytes(perCall: unknown, client?: unknown): number {
  for (const value of [perCall, client]) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  }
  return DEFAULT_MAX_STREAM_FRAME_BYTES;
}

/**
 * The errors an event stream raises that hold only fixed text: built here,
 * from constants and numbers. Everything else is replaced by one of them
 * before it leaves the stream (_toStreamError).
 */
const _cleanStreamErrors = new WeakSet<object>();

/** A fixed-text error with a fixed name (StreamClosedError, AbortError). */
function _streamError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  _cleanStreamErrors.add(error);
  return error;
}

/** An ApiError built here from fixed text and numbers only (STREAM_FRAME_TOO_LARGE). */
function _cleanApiError(params: ConstructorParameters<typeof ApiError>[0]): ApiError {
  const error = new ApiError(params);
  _cleanStreamErrors.add(error);
  return error;
}

/** The fixed sentence for each code an event-stream ApiError may carry. */
const _STREAM_ERROR_SENTENCES: Record<string, string> = {
  ABORTED: 'The event stream request was aborted or timed out',
  ETIMEDOUT: 'The event stream request timed out',
  REDIRECT_REFUSED: 'The event stream request was redirected, and redirects are refused',
  NOT_AN_EVENT_STREAM: 'Expected an event stream, got a response of another content type',
  STREAM_HTTP_ERROR: 'The event stream request failed with an HTTP error status',
  STREAM_REQUEST_FAILED: 'The event stream request failed',
  STREAM_READ_FAILED: 'Reading the event stream failed',
};

/**
 * What an event stream raises in place of `error`.
 *
 * A thrown value's text is never passed on: a transport exception, a body
 * error, a server's error message, code or body, a content type, an abort
 * reason's message and name can each hold a credential or a user's data,
 * and a stream's errors reach logs, Views and models. The replacement keeps
 * what is safe to act on (a fixed code from _STREAM_ERROR_SENTENCES, the
 * status, the client-redacted URL and the method, Retry-After) with a fixed
 * sentence. The original goes only to `options.onDiagnostic`.
 *
 * One more code is kept: on an HTTP error, a code the operation's spec
 * documents (`documentedCodes`, from x-error-codes), with the spec's title for
 * it as the message. The code is matched against that list and the text comes
 * from the spec, so nothing the server wrote is passed on.
 */
function _toStreamError(error: unknown, acceptedStatus: number | undefined, documentedCodes?: Record<string, string>): unknown {
  if (typeof error === 'object' && error !== null && _cleanStreamErrors.has(error)) return error;
  if (isApiError(error)) {
    const status = Number.isInteger(error.status) && error.status > 0 ? error.status : 0;
    const documented = status > 0 && typeof error.code === 'string' && documentedCodes !== undefined
      && Object.prototype.hasOwnProperty.call(documentedCodes, error.code) && typeof documentedCodes[error.code] === 'string';
    const code = documented
      ? error.code as string
      : typeof error.code === 'string' && Object.prototype.hasOwnProperty.call(_STREAM_ERROR_SENTENCES, error.code)
      ? error.code
      : status > 0 ? 'STREAM_HTTP_ERROR' : 'STREAM_REQUEST_FAILED';
    const clean = new ApiError({
      message: documented ? (documentedCodes![code] || _STREAM_ERROR_SENTENCES.STREAM_HTTP_ERROR!) : _STREAM_ERROR_SENTENCES[code]!,
      status,
      code,
      ...(typeof error.url === 'string' ? { url: error.url } : {}),
      ...(typeof error.method === 'string' ? { method: error.method } : {}),
    });
    const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
      (clean as ApiError & { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
    }
    _cleanStreamErrors.add(clean);
    return clean;
  }
  const code = acceptedStatus === undefined ? 'STREAM_REQUEST_FAILED' : 'STREAM_READ_FAILED';
  const clean = new ApiError({ message: _STREAM_ERROR_SENTENCES[code]!, status: acceptedStatus ?? 0, code });
  _cleanStreamErrors.add(clean);
  return clean;
}

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

/** How streamEvents() closes its frames from outside a pending read. */
interface IStreamFramesControl {
  /** Set by return()/throw(): the frames end without yielding more, and raise nothing. */
  closed: boolean;
  /** Aborts the transport's signal: a request in flight, the error-body read, the body. */
  abort: () => void;
  /** Cancels the reader that is reading the body now; a no-op until one exists. */
  cancel: () => void;
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
export function createStreamFrameBuffer(maxFrameBytes?: number): IStreamFrameBuffer {
  const buffer: IStreamFrameBuffer = {
    pendingParts: [],
    afterCR: false,
    pendingHighSurrogate: false,
    atStart: true,
    eventName: '',
    dataLines: [],
    frameBytes: 0,
    pendingBytes: 0,
  };
  if (maxFrameBytes !== undefined) buffer.maxFrameBytes = maxFrameBytes;
  return buffer;
}

/** UTF-8 length of a string, without encoding it. A lone surrogate counts 3, as TextEncoder writes it. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Adds one unterminated piece to the pending line and counts its bytes. A
 * surrogate pair split between two pieces was counted 3 + 3; it is 4.
 */
function holdPiece(buffer: IStreamFrameBuffer, piece: string): void {
  if (piece.length === 0) return;
  let bytes = utf8Length(piece);
  if (buffer.pendingHighSurrogate && (piece.charCodeAt(0) & 0xfc00) === 0xdc00) bytes -= 2;
  buffer.pendingParts.push(piece);
  buffer.pendingBytes += bytes;
  // A high surrogate can only end a piece unpaired: its pair, if any, is the next piece's first unit.
  buffer.pendingHighSurrogate = (piece.charCodeAt(piece.length - 1) & 0xfc00) === 0xd800;
}

/** The pending line plus `tail`, and the pending state cleared. */
function takeLine(buffer: IStreamFrameBuffer, tail: string): string {
  let line = tail;
  if (buffer.pendingParts.length > 0) {
    buffer.pendingParts.push(tail);
    line = buffer.pendingParts.join('');
    buffer.pendingParts = [];
  }
  buffer.pendingBytes = 0;
  buffer.pendingHighSurrogate = false;
  return line;
}

/** Ends parsing for good: past the limit nothing more is held. */
function overflowFrame(buffer: IStreamFrameBuffer, bytes: number): void {
  buffer.overflowBytes = bytes;
  buffer.pendingParts = [];
  buffer.pendingBytes = 0;
  buffer.pendingHighSurrogate = false;
  buffer.dataLines = [];
  buffer.frameBytes = 0;
}

/** Dispatches the frame being built, when it has data, onto `events`. */
function dispatchFrame(buffer: IStreamFrameBuffer, events: IStreamEvent[]): void {
  // A dispatch with no data line is not an event (WHATWG: an empty data
  // buffer means "return", not "fire"). An id-only or retry-only frame
  // therefore advances state without producing one.
  if (buffer.dataLines.length > 0) {
    const event: IStreamEvent = {
      event: buffer.eventName.length > 0 ? buffer.eventName : 'message',
      raw: buffer.dataLines.join('\n'),
    };
    if (buffer.id !== undefined) {
      event.id = buffer.id;
      const numeric = Number(buffer.id);
      if (buffer.id.length > 0 && Number.isInteger(numeric)) {
        event.seq = numeric;
      }
    }
    if (buffer.retry !== undefined) {
      event.retry = buffer.retry;
    }
    events.push(event);
  }
  buffer.eventName = '';
  buffer.dataLines = [];
  buffer.frameBytes = 0;
  delete buffer.id;
}

/**
 * One ended line: a blank one dispatches the frame, any other is charged
 * `breakBytes` for its line break and applied. False once the frame is over
 * the limit.
 */
function applyLine(buffer: IStreamFrameBuffer, line: string, breakBytes: number, events: IStreamEvent[]): boolean {
  if (line.length === 0) {
    dispatchFrame(buffer, events);
    return true;
  }
  buffer.frameBytes += utf8Length(line) + breakBytes;
  const limit = buffer.maxFrameBytes;
  if (limit !== undefined && buffer.frameBytes > limit) {
    overflowFrame(buffer, buffer.frameBytes);
    return false;
  }
  if (line.charCodeAt(0) === 58) {
    // Comment / heartbeat.
    return true;
  }
  const colon = line.indexOf(':');
  const field = colon === -1 ? line : line.slice(0, colon);
  let value = colon === -1 ? '' : line.slice(colon + 1);
  if (value.charCodeAt(0) === 32) {
    value = value.slice(1);
  }
  if (field === 'event') {
    buffer.eventName = value;
  } else if (field === 'data') {
    buffer.dataLines.push(value);
  } else if (field === 'id') {
    // A NULL in an id is ignored per spec; everything else, including a
    // non-numeric id, is retained.
    if (value.indexOf(String.fromCharCode(0)) === -1) {
      buffer.id = value;
    }
  } else if (field === 'retry') {
    const ms = Number(value);
    if (Number.isInteger(ms) && ms >= 0) {
      buffer.retry = ms;
    }
  }
  // Unknown fields are ignored, as the spec requires.
  return true;
}

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
export function parseSseChunk(buffer: IStreamFrameBuffer, chunk: string): IStreamEvent[] {
  const events: IStreamEvent[] = [];
  if (buffer.overflowBytes !== undefined || chunk.length === 0) return events;
  let text = chunk;
  if (buffer.atStart) {
    buffer.atStart = false;
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
  }
  let start = 0;
  if (buffer.afterCR && text.length > 0) {
    buffer.afterCR = false;
    if (text.charCodeAt(0) === 10) start = 1;
  }
  const breaks = /[\r\n]/g;
  breaks.lastIndex = start;
  for (let match = breaks.exec(text); match !== null; match = breaks.exec(text)) {
    const at = match.index;
    const line = takeLine(buffer, text.slice(start, at));
    if (text.charCodeAt(at) === 13) {
      if (at + 1 === text.length) {
        buffer.afterCR = true;
      } else if (text.charCodeAt(at + 1) === 10) {
        breaks.lastIndex = at + 2;
      }
    }
    start = breaks.lastIndex;
    if (!applyLine(buffer, line, 1, events)) return events;
  }
  holdPiece(buffer, text.slice(start));
  const limit = buffer.maxFrameBytes;
  if (limit !== undefined && buffer.frameBytes + buffer.pendingBytes > limit) {
    overflowFrame(buffer, buffer.frameBytes + buffer.pendingBytes);
  }
  return events;
}

/**
 * End of the body: the frame the server ended by closing rather than with a
 * blank line is dispatched, its last line charged the bytes it had (no line
 * break arrived for it). Check `overflowBytes` afterwards: a frame over the
 * limit here is refused like any other, never dropped without a word.
 */
export function finishSseStream(buffer: IStreamFrameBuffer): IStreamEvent[] {
  const events: IStreamEvent[] = [];
  if (buffer.overflowBytes !== undefined) return events;
  buffer.afterCR = false;
  if (buffer.pendingParts.length > 0) {
    if (!applyLine(buffer, takeLine(buffer, ''), 0, events)) return events;
  }
  dispatchFrame(buffer, events);
  return events;
}

export class HttpClient {
  private readonly config: RequiredHttpClientConfig;
  private cache: Map<string, ICacheEntry> = new Map();
  private readonly ipv4DnsCache: Map<string, IIpv4DnsCacheEntry> = new Map();
  private requestCounter = 0;

  /**
   * The transport the CALLER injected, or null. Kept beside `config.fetch` (which is always set,
   * to the resolved global when nothing was injected) so `getInjectedFetch()` can answer the only
   * question a derivation may ask: was one injected?
   */
  private readonly injectedFetch: HoodyFetch | null;

  /**
   * The transport options the CALLER passed, or null. `config.transport` holds them normalised
   * (defaults filled in), which is not what a derived client should be told the caller asked for.
   */
  private readonly configuredTransport: IHttpClientTransportConfig | null;

  constructor(config: IHttpClientConfig = {}) {
    const transport = config.transport || {};
    const forceIPv4Cache = config.forceIPv4Cache || {};
    this.injectedFetch = config.fetch ?? null;
    this.configuredTransport = config.transport ? { ...config.transport } : null;

    this.#finalizers = config.finalizers ? [...config.finalizers] : [];
    this.config = {
      baseURL: config.baseURL || '',
      token: config.token || '',
      // Resolved ONCE. Every later request reads this field, so the client's
      // transport cannot drift from the one the caller injected even if the
      // global is replaced mid-process.
      fetch: config.fetch || resolveDefaultFetch(config.transport?.useGlobalDispatcher === true),
      // Use ?? so explicit timeout: 0 (caller opt-out) survives the
      // constructor instead of being clobbered into 30s.
      timeout: config.timeout ?? 30000,
      ...(config.retries !== undefined ? { retries: config.retries } : {}),
      ...(config.retryDelayMs ? { retryDelayMs: config.retryDelayMs } : {}),
      retryOnStatuses: config.retryOnStatuses || [408, 425, 429, 500, 502, 503, 504],
      headers: config.headers || {},
      cache: config.cache || {},
      captureRawBody: config.captureRawBody === true,
      maxStreamFrameBytes: resolveMaxFrameBytes(config.maxStreamFrameBytes),
      ...(typeof config.onStreamDiagnostic === 'function' ? { onStreamDiagnostic: config.onStreamDiagnostic } : {}),
      forceIPv4: config.forceIPv4 || false,
      forceIPv4Cache: {
        enabled: forceIPv4Cache.enabled !== false,
        ttlMs: forceIPv4Cache.ttlMs ?? 60000,
      },
      transport: {
        keepAlive: transport.keepAlive !== false,
      },
      middlewares: config.middlewares ? [...config.middlewares] : [],
      onError: config.onError || (async () => false),
      onTokenExpired: config.onTokenExpired || (async () => undefined),
      ...(config.onKitAuthExpired ? { onKitAuthExpired: config.onKitAuthExpired } : {}),
      refreshToken: config.refreshToken || (async () => undefined),
      acceptRefreshedToken: config.acceptRefreshedToken || (() => true),
      autoRetryAuth: config.autoRetryAuth !== false,
      clientId: config.clientId || '',
      clientName: config.clientName || '',
    };

  }

  clearCache(): void {
    this.cache.clear();
  }

  async close(): Promise<void> {
    this.clearCache();
    this.ipv4DnsCache.clear();
  }

  getBaseURL(): string {
    return this.config.baseURL;
  }

  setToken(token: string): void {
    this.config.token = token;
  }

  /**
   * The transport this client was constructed with (or the resolved global
   * default). Exposed so callers can assert the injection took effect and so
   * higher layers can compose on the SAME transport instead of the global.
   */
  getFetch(): HoodyFetch {
    return this.config.fetch;
  }

  /**
   * The transport the CALLER injected, or `undefined` when none was.
   *
   * The one accessor every derivation uses (`withRealm`, `withContainer`, the realm-error
   * introspection client). It exists because the two HTTP implementations store the injection
   * differently — this one resolves it into `config.fetch`, the browser build keeps it out of
   * `config` on purpose — so a derivation that reads `config.fetch` silently drops the injection
   * in the browser build.
   */
  getInjectedFetch(): HoodyFetch | undefined {
    return this.injectedFetch ?? undefined;
  }

  /**
   * The transport options the CALLER passed, or `undefined` when none were.
   *
   * What every derivation (`withRealm`, `withContainer`, the realm-error introspection client)
   * copies, never the normalised `config.transport`: the browser build warns about every
   * Node-only knob it is handed, and a normalised copy hands it all of them.
   */
  getConfiguredTransport(): IHttpClientTransportConfig | undefined {
    return this.configuredTransport === null ? undefined : { ...this.configuredTransport };
  }

  use(middleware: IHttpClientMiddleware): void {
    this.config.middlewares.push(middleware);
  }

  setMiddlewares(middlewares: IHttpClientMiddleware[]): void {
    this.config.middlewares = [...middlewares];
  }

  async request<T = unknown>(
    method: string,
    path: string,
    data: IRequestData = {}
  ): Promise<T> {
    const upperMethod = method.toUpperCase();
    const isFullUrl = _isFullUrl(path);
    const url = isFullUrl
      ? this.buildUrlFromFull(path, data.query)
      : this.buildUrl(path, data.query);
    const isVerbose = this.isVerboseLoggingEnabled();
    // Kit service URLs are full URLs that don't match the API baseURL origin.
    // Never send the API JWT to Kit services — they have their own auth.
    // Treat every full-URL request as external when baseURL is empty:
    // a truthy short-circuit on this.config.baseURL would skip the same-
    // origin check, so Authorization would ride out to arbitrary hosts
    // whenever the consumer omitted baseURL from HoodyClientConfig.
    // Judged on the built URL wherever it resolves (isExternalDestination), so
    // a path spelled //elsewhere is elsewhere.
    const isExternalUrl = this.isExternalDestination(isFullUrl, url);

    // Cache identity partitioning: the cache key includes a hash of the
    // Authorization header the request would have used, so token rotation /
    // cross-identity reuse of a single HttpClient instance cannot serve a
    // response baked to a different identity. Kit-auth uses a different header
    // path and does not participate in this GET cache.
    const isGet = upperMethod === 'GET';
    // Mix in Authorization / X-Api-Key / etc. from config.headers +
    // data.headers so per-request auth overrides partition the cache.
    const headerIdentity = isGet ? hashAuthHeaders(this.config.headers, data.headers) : '';
    const cacheIdentity = isGet ? hashIdentity((this.config.token ?? '') + '|' + headerIdentity) : '';
    // Cache key must disambiguate envelope vs. raw body AND response parser
    // (json/text/arrayBuffer/blob). Without this a GET with rawResponse:true
    // followed by the same GET without it can serve the wrong shape to the
    // second caller (cache-shape poisoning).
    const cacheShape = isGet
      // ...and the integer reading: a lossless answer holds bigints, a plain one rounded numbers.
      ? (data.rawResponse === true ? 'R' : 'E') + ':' + (data.responseType || 'auto') + (data.losslessIntegers === true ? ':L' : '')
      : '';
    const cacheKey = `${upperMethod}:${cacheIdentity}:${cacheShape}:${url}`;
    // Opt-in. A default-on cache answered repeated state reads and state-
    // changing kit GETs from memory for five seconds.
    const cacheEnabled = this.config.cache.enabled === true;
    const requestCache = data.cache !== undefined ? data.cache : cacheEnabled;
    // ?? preserves explicit ttl:0.
    const ttl = typeof requestCache === 'number'
      ? requestCache
      : (this.config.cache.ttl ?? 5000);

    // Treat HEAD + OPTIONS as non-mutating (parity with the browser
    // http-client). A HEAD for existence-check or an OPTIONS preflight
    // must not flush the GET response cache.
    const isNonMutating = isGet || upperMethod === 'HEAD' || upperMethod === 'OPTIONS';
    if (!isNonMutating) {
      this.clearCache();
    }

    if (isGet && requestCache && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;
      if (Date.now() - entry.timestamp < ttl) {
        return entry.data as T;
      }
      this.cache.delete(cacheKey);
    }

    // Nobody set retries: the default policy (_DEFAULT_RETRIES, see IHttpClientConfig.retries).
    const explicitRetries = data.retries ?? this.config.retries;
    const retryByDefault = explicitRetries === undefined;
    const retries = Math.max(0, explicitRetries ?? (data.responseIsFinal === true ? 0 : _DEFAULT_RETRIES));
    const timeoutMs = data.timeoutMs ?? this.config.timeout;
    const retryDelayMs = data.retryDelayMs ?? this.config.retryDelayMs ?? (retryByDefault ? _DEFAULT_RETRY_DELAY_MS : 250);
    let retryWaitedMs = 0;
    const retryOnStatuses = data.retryOnStatuses ?? this.config.retryOnStatuses;
    const authRetryEnabled = data.authRetry ?? this.config.autoRetryAuth;
    const rawResponse = data.rawResponse === true;
    const responseType = data.responseType || 'auto';

    let authRetried = false;
    let kitAuthRetried = false;
    let lastError: ApiError | undefined;
    // Stash the new Kit auth returned by onKitAuthExpired so the NEXT retry
    // actually uses it. Without this the callback's return value would be
    // checked only for truthiness, the replay would re-use the expired
    // creds, and 401s would loop until the retry budget drained.
    let pendingKitAuthOverride: unknown = undefined;
    // Pre-detect non-replayable bodies so auth retries skip replay when
    // the body would be empty on retry.
    const bodyIsNonReplayable = _isNonReplayableBody(data.body);

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      // The token this attempt goes out with: a 401 is about THIS token, which may no longer be
      // the client's by the time the answer arrives.
      const tokenSent = this.config.token;
      const headers = this.buildHeaders(data.headers);
      if (isExternalUrl) {
        // Every spelling: a lower-case authorization survived the exact-case
        // delete.
        this.deleteAuthorization(headers, data.headers);
      }
      // No body, nothing to describe: the default JSON content type on an
      // empty DELETE or POST is refused by servers that parse by the type
      // (Fastify answers 400). Parity with stream() and prepareUpgrade(). Every
      // spelling: a caller-set lower-case content-type survived the exact-case
      // delete.
      if (data.body === undefined) {
        _deleteContentType(headers);
      }

      // Inject pendingKitAuthOverride into middlewareContext on retry so
      // proxy-auth middleware picks up the fresh creds instead of
      // reinjecting the stale ones.
      const mergedMiddlewareContext = (data.middlewareContext || pendingKitAuthOverride !== undefined)
        ? { ...(data.middlewareContext ?? {}), ...(pendingKitAuthOverride !== undefined ? { kitAuth: pendingKitAuthOverride } : {}) }
        : undefined;

      const requestContext: IHttpClientMiddlewareRequestContext = {
        requestId: this.nextRequestId(),
        attempt,
        method: upperMethod,
        path,
        url,
        headers,
        timeoutMs,
        retries,
        ...(data.query !== undefined ? { query: data.query } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(mergedMiddlewareContext !== undefined ? { middlewareContext: mergedMiddlewareContext } : {}),
      };

      // Wrap applyRequestMiddleware INSIDE the shared try/catch (parity
      // with the browser http-client). A throwing onRequest middleware
      // must flow through applyErrorMiddleware + retry + onError hooks,
      // not bypass them — without this, observability hooks never see
      // request-side middleware failures.
      let middlewareRequest: IHttpClientMiddlewareRequestContext = requestContext;

      try {
        middlewareRequest = await this.applyRequestMiddleware(requestContext, data.routeTag);
        if (isVerbose) {
          // Route through _redactUrl so HTTP_VERBOSE never dumps
          // tokens/apikeys/ssh_passwords in query strings or userinfo.
          console.error(`[HttpClient] ${middlewareRequest.method} ${_redactUrl(middlewareRequest.url, _credentialQueryParamsOf(middlewareRequest.middlewareContext))} (attempt ${attempt}/${retries + 1})`);
        }
        const startedAt = Date.now();
        const received = await this.sendConfined(
          middlewareRequest.method,
          middlewareRequest.url,
          middlewareRequest.headers,
          _wireBody(middlewareRequest.body, middlewareRequest.headers, data.jsonStringBody),
          middlewareRequest.timeoutMs,
          data.signal,
          data.redirect,
          middlewareRequest.middlewareContext,
          // Follow redirects here, where a failure after an answered hop is marked, whenever
          // "never dispatched" would send the request again where shouldRetry otherwise would not.
          data.responseIsFinal === true || !_IDEMPOTENT_METHODS.includes(middlewareRequest.method.toUpperCase())
        );
        // The body is read inside the caller's signal and the timeout; the
        // transport lets go of both once the headers are in.
        const chunks = await this.readBufferedBody(received, data.signal, middlewareRequest.timeoutMs, startedAt);
        const response = this.replayResponse(received, chunks);

        if (!response.ok) {
          throw await this.buildApiErrorFromResponse(response, middlewareRequest);
        }

        // A HEAD answer is its headers (size, modification time, ETag); the
        // body parser can only say null.
        const parsedResult = upperMethod === 'HEAD' && responseType === 'auto'
          ? _headerRecord(response.headers)
          : await this.parseResponseBody(response, responseType, upperMethod, data.losslessIntegers === true);
        const normalized = rawResponse
          ? (parsedResult as T)
          : this.normalizeResponseEnvelope(
              parsedResult,
              response.status,
              response.statusText
            ) as T;

        const middlewareResponse = await this.applyResponseMiddleware<T>({
          ...middlewareRequest,
          response: this.replayResponse(received, chunks),
          data: normalized,
          ...((data.captureRawBody ?? this.config.captureRawBody) ? { rawBody: this.joinChunks(chunks) } : {}),
        });

        const result = middlewareResponse.data;

        if (isGet && requestCache) {
          // LRU eviction: Map iteration preserves insertion order, so the
          // first key is the oldest entry we haven't re-inserted.
          if (this.cache.size >= _NODE_CACHE_MAX_ENTRIES) {
            const oldest = this.cache.keys().next();
            if (!oldest.done) this.cache.delete(oldest.value);
          }
          this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
          });
        }

        return result;
      } catch (error) {
        const apiError = this.toApiError(error, middlewareRequest);
        lastError = apiError;

        // An error-middleware throw must NOT replace the normalized
        // apiError. Swallow its failure so consumers always see the real
        // error from the request path.
        try {
          await this.applyErrorMiddleware({
            ...middlewareRequest,
            error: apiError,
          });
        } catch (mwErr) {
          const msg = mwErr instanceof Error ? mwErr.message : String(mwErr);
          console.error('[HttpClient] error-middleware threw (suppressed to preserve original error):', msg);
        }

        // Every decision below reads the request as it was dispatched: a request middleware may
        // have sent it to another destination (an API path to a kit host, whose 401 is the
        // script's answer, not the account token's), with another method (a GET made a POST
        // that ran) or with another body (one that cannot be sent twice).
        const sentMethod = middlewareRequest.method.toUpperCase();
        const sentExternal = middlewareRequest.url === url
          ? isExternalUrl
          : this.isExternalDestination(_isFullUrl(middlewareRequest.url), middlewareRequest.url);
        const sentNonReplayable = bodyIsNonReplayable || _isNonReplayableBody(middlewareRequest.body);

        // The ways back into this loop, and what each does with responseIsFinal:
        //   a. 401, API scope, token already replaced  -> replay once (below)
        //   b. 401, API scope, token refreshed         -> replay once (below)
        //   c. 401, kit host, onKitAuthExpired         -> replay once; NOT for responseIsFinal
        //   d. shouldRetry(): status, network, RETRY_SAFE_CODES -> honours responseIsFinal itself
        //   e. onError returned true                   -> refused when responseIsFinal
        // a and b replay a responseIsFinal request on purpose: hoody-api's auth layer answers
        // the 401 before any handler runs. Each happens at most once per call, and only with a
        // NEW token in hand. c does not: on a kit host the 401 may be the script's own answer,
        // given after it did its work, so the renewed auth is stored (onKitAuthExpired ran) and
        // the 401 goes back to the caller, who decides whether to send the request again.
        if (authRetryEnabled && !authRetried && apiError.status === 401 && !sentExternal && !sentNonReplayable) {
          // The token that was refused has already been replaced: a sibling request's refresh
          // landed while this one was in flight. Replay with the current token; refreshing again
          // would spend a second refresh call (and, on a server that rotates the refresh token,
          // invalidate the pair the sibling just stored). A burst of 20 requests at expiry made
          // 2-3 refresh calls for this reason: the in-flight promise only joins the 401s that
          // arrive while the refresh is still running.
          if (typeof tokenSent === 'string' && tokenSent.length > 0
              && typeof this.config.token === 'string' && this.config.token.length > 0
              && this.config.token !== tokenSent) {
            authRetried = true;
            attempt -= 1;
            continue;
          }
          const refreshedToken = await this.tryRefreshToken(apiError);
          if (refreshedToken && this.config.acceptRefreshedToken(refreshedToken)) {
            this.setToken(refreshedToken);
            authRetried = true;
            // Do not consume retry budget for auth recovery replay.
            attempt -= 1;
            continue;
          }
        }

        let renewedNotReplayed: ApiError | undefined;
        if (!kitAuthRetried && apiError.status === 401 && sentExternal
            && middlewareRequest.middlewareContext?._kitNamespace
            && this.config.onKitAuthExpired
            && !sentNonReplayable) {
          try {
            const ns = middlewareRequest.middlewareContext._kitNamespace as string;
            const newAuth = await this.config.onKitAuthExpired(ns, apiError);
            if (newAuth && data.responseIsFinal === true) {
              renewedNotReplayed = new ApiError({
                message: apiError.message + ' (kit auth was renewed; the request was not repeated because it may have run)',
                status: apiError.status,
                ...(apiError.code !== undefined ? { code: apiError.code } : {}),
                ...(apiError.url !== undefined ? { url: apiError.url } : {}),
                ...(apiError.method !== undefined ? { method: apiError.method } : {}),
                ...(apiError.request !== undefined ? { request: apiError.request } : {}),
                response: apiError.response,
                cause: apiError,
              });
            } else if (newAuth) {
              // Actually apply the returned auth for the next attempt.
              // Without this the branch sets kitAuthRetried + continues
              // with no hint to the middleware that credentials changed,
              // so the retry replays with the same expired creds.
              pendingKitAuthOverride = newAuth;
              kitAuthRetried = true;
              // Do not consume retry budget for auth recovery replay.
              attempt -= 1;
              continue;
            }
          } catch (cbErr) {
            // Callback failure: the caller-facing error stays as the
            // original apiError (we don't want the callback's error to
            // clobber the 401), but surface the callback failure via
            // console.error so observability isn't black-boxed.
            const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
            console.error('[HttpClient] onKitAuthExpired callback failed:', msg);
          }
          if (renewedNotReplayed) throw renewedNotReplayed;
        }

        // Match browser http-client: both status-retry and onError-retry
        // skip replay when the body is a single-consumption stream.
        if (attempt <= retries && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, data.responseIsFinal === true, retryByDefault)) {
          const retryAfterMs = (apiError as ApiError & { retryAfterMs?: number }).retryAfterMs;
          const delayMs = this.getRetryDelayMs(retryDelayMs, attempt, retryAfterMs);
          // The default policy waits at most _DEFAULT_RETRY_WAIT_CAP_MS in all. A wait past it
          // (a long Retry-After) ends the retries: sending sooner than the server asked is not
          // honouring it.
          if (!retryByDefault || retryWaitedMs + delayMs <= _DEFAULT_RETRY_WAIT_CAP_MS) {
            retryWaitedMs += delayMs;
            await this.sleep(delayMs);
            continue;
          }
        }

        // Invoke onError on EVERY failure (including terminal ones) so
        // observability hooks see the final outcome. shouldRetry result
        // still controls whether we actually replay; onError is
        // informational unless it returns true AND we still have retry
        // budget AND the body can be replayed.
        if (this.config.onError) {
          try {
            const shouldRetry = await this.config.onError(apiError);
            // The hook asks; it does not overrule responseIsFinal. An answer (or a lost
            // connection) from a handler that is arbitrary code may follow a run, and a
            // hook that returns true for every error ran an exec script twice on its 500.
            // The one replay such a request may have, never dispatched, was taken above.
            // Nor does it spend the default budget: before the default policy there was none.
            if (shouldRetry && attempt <= retries && !sentNonReplayable && data.responseIsFinal !== true && !retryByDefault) {
              await this.sleep(this.getRetryDelayMs(retryDelayMs, attempt));
              continue;
            }
          } catch (cbErr) {
            // Log suppressed middleware error for observability.
            const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
            console.error('[HttpClient] onError callback threw:', msg);
          }
        }

        throw apiError;
      }
    }

    throw lastError ?? new ApiError({ message: 'Request failed without error context' });
  }

  async get<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('GET', path, data);
  }

  async post<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('POST', path, data);
  }

  async put<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('PUT', path, data);
  }

  async patch<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('PATCH', path, data);
  }

  async delete<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('DELETE', path, data);
  }

  async head<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('HEAD', path, data);
  }

  async options<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('OPTIONS', path, data);
  }

  async mkcol<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('MKCOL', path, data);
  }

  async copy<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('COPY', path, data);
  }

  async move<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('MOVE', path, data);
  }

  async lock<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('LOCK', path, data);
  }

  async unlock<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('UNLOCK', path, data);
  }

  async propfind<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('PROPFIND', path, data);
  }

  async proppatch<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('PROPPATCH', path, data);
  }

  async checkauth<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('CHECKAUTH', path, data);
  }

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
  async stream(
    method: string,
    path: string,
    data: IRequestData = {}
  ): Promise<Response> {
    const upperMethod = method.toUpperCase();
    const isFullUrl = _isFullUrl(path);
    const url = isFullUrl
      ? this.buildUrlFromFull(path, data.query)
      : this.buildUrl(path, data.query);
    const isExternalUrl = this.isExternalDestination(isFullUrl, url);

    const headers = this.buildHeaders(data.headers);
    if (isExternalUrl) {
      this.deleteAuthorization(headers, data.headers);
    }
    // A GET/HEAD stream has no body; the default JSON content type would be
    // a lie on the wire.
    if (data.body === undefined) {
      _deleteContentType(headers);
    }

    const timeoutMs = data.timeoutMs ?? this.config.timeout;
    const initialContext: IHttpClientMiddlewareRequestContext = {
      requestId: this.nextRequestId(),
      attempt: 1,
      method: upperMethod,
      path,
      url,
      headers,
      timeoutMs,
      retries: 0,
      ...(data.query !== undefined ? { query: data.query } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.middlewareContext !== undefined ? { middlewareContext: data.middlewareContext } : {}),
    };
    // Opening the stream fails the way request() fails: a throwing request
    // middleware, a transport error, a refused connection or the header
    // timeout reaches the caller as an ApiError (status 0, redacted request
    // context, the original on cause), after error middleware saw it. It
    // escaped as a raw TypeError before, so an isApiError() catch that handled
    // the same failure on a plain GET missed it on a stream.
    let requestContext = initialContext;
    let response: Response;
    try {
      requestContext = await this.applyRequestMiddleware(initialContext, data.routeTag);
      response = await this.sendConfined(
        requestContext.method,
        requestContext.url,
        requestContext.headers,
        _wireBody(requestContext.body, requestContext.headers, data.jsonStringBody),
        requestContext.timeoutMs,
        data.signal,
        data.redirect,
        requestContext.middlewareContext
      );
    } catch (error) {
      const openError = this.toApiError(error, requestContext);
      try {
        await this.applyErrorMiddleware({ ...requestContext, error: openError });
      } catch {
        // Middleware errors must not mask the original error
      }
      throw openError;
    }

    if (!response.ok) {
      // Bounded: an error body that never ends used to hang here past both
      // the abort and the timeout, and error middleware never ran.
      const errorResponse = await this.boundedErrorResponse(response, data.signal, requestContext.timeoutMs);
      const error = await this.buildApiErrorFromResponse(errorResponse, requestContext);
      try {
        await this.applyErrorMiddleware({ ...requestContext, error });
      } catch {
        // Middleware errors must not mask the original API error
      }
      throw error;
    }

    return data.signal && response.body
      ? this.abortableResponse(response, data.signal)
      : response;
  }

  /**
   * The same response, with a body that a later abort still reaches.
   *
   * The transport stops forwarding the caller's signal once the headers arrive
   * (its own timeout must not cut a live stream), so an abort after that point
   * reached nothing: a consumer parked in read() waited forever and the
   * connection stayed open. This wrapper cancels the source body and
   * makes the consumer's pending read reject with the abort reason.
   */
  private abortableResponse(response: Response, signal: AbortSignal): Response {
    const source = response.body!.getReader();
    let settled = false;
    let onAbort: (() => void) | undefined;
    const detach = (): void => {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
        onAbort = undefined;
      }
    };
    // Every exit releases the source reader, so the transport's body is left
    // unlocked, as streamEvents() leaves it.
    const release = (): void => {
      try {
        source.releaseLock();
      } catch {
        // Already released; nothing to do.
      }
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        onAbort = (): void => {
          detach();
          if (!settled) {
            settled = true;
            let reason: unknown = signal.reason;
            if (reason === undefined) {
              const aborted = new Error('The stream was aborted');
              aborted.name = 'AbortError';
              reason = aborted;
            }
            controller.error(reason);
          }
          void source.cancel(signal.reason).catch(() => undefined);
          release();
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      },
      async pull(controller) {
        try {
          const chunk = await source.read();
          if (settled) return;
          if (chunk.done) {
            settled = true;
            detach();
            release();
            controller.close();
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          if (settled) return;
          settled = true;
          detach();
          release();
          controller.error(error);
        }
      },
      cancel(reason) {
        settled = true;
        detach();
        const cancelling = source.cancel(reason);
        release();
        return cancelling;
      },
    });
    const wrapped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // Response.url cannot be passed to the constructor; keep the original so
    // error messages still name the real endpoint.
    Object.defineProperty(wrapped, 'url', { value: response.url });
    return wrapped;
  }

  /**
   * A non-2xx response with its body read to at most 64 KiB, within the
   * caller's signal and the request timeout (5 s when the timeout is 0), so
   * building the ApiError cannot hang on a body that never ends.
   * An abort surfaces as the abort, not as a protocol error.
   */
  private async boundedErrorResponse(
    response: Response,
    signal: AbortSignal | undefined,
    timeoutMs: number
  ): Promise<Response> {
    const body = response.body;
    if (!body || response.status === 204 || response.status === 205 || response.status === 304) {
      return response;
    }
    const reader = body.getReader();
    const stop = (): void => {
      void reader.cancel().catch(() => undefined);
    };
    const budgetMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
    const timer = setTimeout(stop, budgetMs);
    if (signal) {
      if (signal.aborted) {
        stop();
      } else {
        signal.addEventListener('abort', stop, { once: true });
      }
    }
    const limit = 65536;
    const chunks: Uint8Array[] = [];
    let taken = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const room = limit - taken;
        if (chunk.value.length >= room) {
          chunks.push(chunk.value.subarray(0, room));
          taken = limit;
          break;
        }
        chunks.push(chunk.value);
        taken += chunk.value.length;
      }
    } catch {
      // A body that fails mid-read still yields what arrived.
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', stop);
      }
      stop();
      try {
        reader.releaseLock();
      } catch {
        // A read still settling holds the lock; nothing to do.
      }
    }
    if (signal && signal.aborted) {
      if (signal.reason !== undefined) throw signal.reason;
      const aborted = new Error('The stream was aborted');
      aborted.name = 'AbortError';
      throw aborted;
    }
    const bytes = new Uint8Array(taken);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const bounded = new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperty(bounded, 'url', { value: response.url });
    return bounded;
  }

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
  streamEvents<TDocumented extends object = Record<never, string>>(
    method: string,
    path: string,
    data: IRequestData = {},
    options: IStreamEventsOptions = {}
  ): IEventStream<TDocumented> {
    let settled = false;
    // The accepted response's status, once accept() has resolved response.
    let acceptedStatus: number | undefined;
    let resolveResponse: (value: IStreamResponse<TDocumented>) => void = () => undefined;
    let rejectResponse: (reason: unknown) => void = () => undefined;
    const response = new Promise<IStreamResponse<TDocumented>>((resolve, reject) => {
      resolveResponse = resolve;
      rejectResponse = reject;
    });
    // The iteration raises every failure itself, so a caller that never reads
    // response must not see it reported as an unhandled rejection.
    response.catch(() => undefined);
    // Built in full before anything is settled: when reading a documented
    // header throws, response is still open, and the iteration's error
    // (raised through next()) rejects it.
    const accept = (accepted: Response): void => {
      if (settled) return;
      const documented: Record<string, string> = {};
      for (const [name, header] of Object.entries(options.documentedHeaders ?? {})) {
        const value = accepted.headers.get(header);
        if (value !== null) documented[name] = value;
      }
      const value: IStreamResponse<TDocumented> = { status: accepted.status, headers: accepted.headers, documented: documented as TDocumented };
      settled = true;
      acceptedStatus = accepted.status;
      resolveResponse(value);
    };
    const refuse = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      rejectResponse(reason);
    };
    const closedError = (): Error => _streamError('StreamClosedError', 'The event stream was closed before a response was accepted');
    // Every error the iteration raises is replaced by a fixed-text one; the
    // original goes only to onDiagnostic, which must not break the stream.
    const diagnostic = options.onDiagnostic ?? this.config.onStreamDiagnostic;
    const toStreamError = (error: unknown): unknown => {
      const clean = _toStreamError(error, acceptedStatus, options.documentedErrorCodes);
      if (clean !== error && diagnostic) {
        try {
          diagnostic(error);
        } catch {
          // A failing diagnostic sink is not the stream's error.
        }
      }
      return clean;
    };
    // Lets return() and throw() cancel the body under a read in flight. A
    // generator queues return() behind a pending next(), so after
    // `await stream.response` (which starts the first read) a close on an
    // idle stream would wait for a frame that may never come.
    const control: IStreamFramesControl = { closed: false, abort: () => undefined, cancel: () => undefined };
    const close = (): void => {
      control.closed = true;
      control.abort();
      control.cancel();
    };
    const frames = this.streamEventFrames(method, path, data, options, accept, control);
    // One step of the iteration, with every failure made fixed-text and
    // response settled by it.
    const step = async (): Promise<IteratorResult<IStreamEvent, void>> => {
      let result: IteratorResult<IStreamEvent, void>;
      try {
        result = await frames.next();
      } catch (error) {
        const clean = toStreamError(error);
        refuse(clean);
        throw clean;
      }
      if (result.done) refuse(closedError());
      return result;
    };
    // Reading response before the first next() sends the request: the first
    // step runs then, and its result is held for that next(). Otherwise
    // `await stream.response` ahead of the loop would wait for a request
    // nothing had sent.
    let started = false;
    let held: Promise<IteratorResult<IStreamEvent, void>> | undefined;
    const stream: IEventStream<TDocumented> = {
      get response() {
        if (!started && !settled) {
          started = true;
          held = step();
          held.catch(() => undefined);
        }
        return response;
      },
      [Symbol.asyncIterator]() {
        return stream;
      },
      async next() {
        started = true;
        if (held) {
          const first = held;
          held = undefined;
          return first;
        }
        return step();
      },
      async return(value?: void) {
        refuse(closedError());
        // A held first frame is not given to a next() after the close.
        held = undefined;
        close();
        return frames.return(value);
      },
      async throw(error?: unknown) {
        refuse(error);
        held = undefined;
        close();
        return frames.throw(error);
      },
    };
    return stream;
  }

  /**
   * The frames of streamEvents(); accept() is told the response before the first one.
   *
   * The transport gets a signal of its own, aborted by the caller's signal or by
   * return()/throw(): a close then also reaches a request still in flight and
   * the reads of a body that is no event stream (a 200 JSON reply, a non-2xx
   * error body), which no reader of this method holds.
   */
  private async *streamEventFrames(
    method: string,
    path: string,
    data: IRequestData,
    options: IStreamEventsOptions,
    accept: (response: Response) => void,
    control: IStreamFramesControl
  ): AsyncGenerator<IStreamEvent, void, undefined> {
    const signal = options.signal ?? data.signal;
    const transport = new AbortController();
    const forward = (): void => {
      transport.abort(signal?.reason);
    };
    control.abort = () => transport.abort();
    if (signal) {
      if (signal.aborted) {
        forward();
      } else {
        signal.addEventListener('abort', forward, { once: true });
      }
    }
    try {
      yield* this.openedEventFrames(method, path, data, options, accept, control, signal, transport.signal);
    } finally {
      if (signal) {
        signal.removeEventListener('abort', forward);
      }
    }
  }

  /** streamEventFrames() behind its transport signal. */
  private async *openedEventFrames(
    method: string,
    path: string,
    data: IRequestData,
    options: IStreamEventsOptions,
    accept: (response: Response) => void,
    control: IStreamFramesControl,
    signal: AbortSignal | undefined,
    transportSignal: AbortSignal
  ): AsyncGenerator<IStreamEvent, void, undefined> {
    // A middlewareContext object the request middleware mutates in place, so the
    // credential query parameter names it records are known here for redaction.
    const requestData: IRequestData = { ...data, middlewareContext: data.middlewareContext ?? {} };
    requestData.signal = transportSignal;

    if (options.since !== undefined && options.since !== null && String(options.since).length > 0) {
      const since = String(options.since);
      if (options.sinceParam) {
        requestData.query = { ...(requestData.query ?? {}), [options.sinceParam]: since };
      } else {
        requestData.headers = { ...(requestData.headers ?? {}), 'Last-Event-ID': since };
      }
    }
    // Ask for frames explicitly unless the caller already set Accept. This is a
    // preference, not a switch: a route that answers either JSON or SSE may
    // choose from the request body instead (hoody-agent's headless run streams
    // only when the body sets format:"stream-json" or stream:true, and answers
    // 202 {job_id} otherwise). The content-type check below catches that case.
    if (!requestData.headers || !Object.keys(requestData.headers).some((h) => h.toLowerCase() === 'accept')) {
      requestData.headers = { ...(requestData.headers ?? {}), Accept: 'text/event-stream' };
    }

    let response: Response;
    try {
      response = await this.stream(method, path, requestData);
    } catch (error) {
      // A close aborted the request or its error-body read: an end, not a failure.
      if (control.closed) return;
      throw error;
    }
    const body = response.body;
    // Closed while the request was in flight: nothing is read or yielded.
    if (control.closed) {
      if (body) void body.cancel().catch(() => undefined);
      return;
    }
    if (!body) {
      // A 2xx with no body is an empty stream, not an error: nothing to yield.
      accept(response);
      return;
    }

    // Cancelling a reader makes the pending read() RESOLVE as done, which is
    // indistinguishable from the server finishing. A consumer would treat an
    // aborted stream as a completed one and stop reconnecting, so an abort is
    // raised explicitly instead.
    // Always this fixed error, never the signal's reason: a reason is the
    // caller's value, and its message and name reach wherever the error goes.
    // The caller still holds the signal and its reason.
    const abortError = (): Error => _streamError('AbortError', 'The event stream was aborted');
    // A 2xx that is not an event stream is refused rather than framed. Framing
    // a JSON reply as SSE yields nothing (no line starts with a known field),
    // so the iteration ended cleanly and the payload was lost: the headless
    // run's 202 {job_id} vanished this way. The caller's error carries the
    // status only; the original, with the parsed body, goes to onDiagnostic.
    // A reply with no content-type at all keeps the old behaviour and is framed.
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (contentType !== '' && contentType !== 'text/event-stream') {
      // Read the diagnostic body HERE rather than through parseResponseBody:
      // by this point the transport has dropped its own timeout and abort
      // forwarding, so a body that never ends (a mislabelled live stream)
      // would hang the caller and grow without bound. Take at most 64 KiB of
      // BYTES and five seconds, release the reader either way, and let a real
      // abort surface as an abort rather than as this error.
      let payload: unknown;
      let truncated = false;
      const diagnosticReader = body.getReader();
      const cancelDiagnostic = (): void => {
        void diagnosticReader.cancel().catch(() => undefined);
      };
      control.cancel = cancelDiagnostic;
      const diagnosticTimer = setTimeout(cancelDiagnostic, 5000);
      if (signal) {
        if (signal.aborted) {
          cancelDiagnostic();
        } else {
          signal.addEventListener('abort', cancelDiagnostic, { once: true });
        }
      }
      try {
        const diagnosticDecoder = new TextDecoder('utf-8');
        const diagnosticLimit = 65536;
        let taken = 0;
        let text = '';
        for (;;) {
          const chunk = await diagnosticReader.read();
          if (chunk.done) {
            // Flush, so a body cut mid-character still decodes as one.
            text += diagnosticDecoder.decode();
            break;
          }
          const bytes = chunk.value;
          if (taken + bytes.length >= diagnosticLimit) {
            text += diagnosticDecoder.decode(bytes.subarray(0, diagnosticLimit - taken), { stream: true });
            taken = diagnosticLimit;
            truncated = true;
            cancelDiagnostic();
            break;
          }
          taken += bytes.length;
          text += diagnosticDecoder.decode(bytes, { stream: true });
        }
        if (text.length > 0) {
          if (truncated) {
            payload = text;
          } else {
            try {
              payload = JSON.parse(text);
            } catch {
              payload = text;
            }
          }
        }
      } catch {
        payload = undefined;
      } finally {
        clearTimeout(diagnosticTimer);
        if (signal) {
          signal.removeEventListener('abort', cancelDiagnostic);
        }
        cancelDiagnostic();
        try {
          diagnosticReader.releaseLock();
        } catch {
          // Already released, or a read is still settling: nothing to do.
        }
      }
      // An abort is the caller's own decision and must not be reported as a
      // protocol error, the same way the framing loop below reports it.
      if (signal && signal.aborted) {
        throw abortError();
      }
      // return()/throw() cut the read short: the caller ended the stream itself.
      if (control.closed) {
        return;
      }
      throw new ApiError({
        message: 'Expected an event stream, got ' + contentType + ' (HTTP ' + response.status + '); the' + (truncated ? ' first 64 KiB of the' : ' parsed') + ' body is on error.response',
        status: response.status,
        code: 'NOT_AN_EVENT_STREAM',
        url: _redactUrl(response.url || path, _credentialQueryParamsOf(requestData.middlewareContext)),
        method: method.toUpperCase(),
        response: payload,
      });
    }

    try {
      accept(response);
    } catch (error) {
      void body.cancel().catch(() => undefined);
      throw error;
    }
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    const maxFrameBytes = resolveMaxFrameBytes(options.maxFrameBytes, this.config.maxStreamFrameBytes);
    const buffer = createStreamFrameBuffer(maxFrameBytes);
    const frameTooLarge = (): ApiError => _cleanApiError({
      message: 'An event stream frame exceeded ' + maxFrameBytes + ' bytes (maxFrameBytes); the stream was closed',
      status: response.status,
      code: 'STREAM_FRAME_TOO_LARGE',
      url: _redactUrl(response.url || path, _credentialQueryParamsOf(requestData.middlewareContext)),
      method: method.toUpperCase(),
      response: { maxFrameBytes, frameBytes: buffer.overflowBytes },
    });
    const onAbort = (): void => {
      void reader.cancel().catch(() => undefined);
    };
    control.cancel = onAbort;
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      for (;;) {
        if (signal && signal.aborted) {
          throw abortError();
        }
        // Typed by the assignment: whatever this environment's reader returns.
        // A declared DOM ReadableStreamReadResult is refused under @types/bun
        // with exactOptionalPropertyTypes (its done result omits value).
        let read;
        try {
          read = await reader.read();
        } catch (error) {
          // A read the abort cancelled may reject rather than resolve done.
          if (signal && signal.aborted) throw abortError();
          if (control.closed) return;
          throw error;
        }
        const { done, value } = read;
        if (signal && signal.aborted) {
          throw abortError();
        }
        // return() or throw() cancelled this read: the close wins over
        // whatever the cancel left in the buffer.
        if (control.closed) {
          return;
        }
        if (done) {
          // The decoder's last bytes (a character cut by the close), then the
          // frame the server ended by closing rather than with a blank line.
          const events = parseSseChunk(buffer, decoder.decode());
          if (buffer.overflowBytes === undefined) events.push(...finishSseStream(buffer));
          for (const event of events) {
            yield event;
            if (event.event === 'end') {
              return;
            }
          }
          if (buffer.overflowBytes !== undefined) {
            throw frameTooLarge();
          }
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.length === 0) {
          continue;
        }
        for (const event of parseSseChunk(buffer, chunk)) {
          yield event;
          if (event.event === 'end') {
            return;
          }
        }
        if (buffer.overflowBytes !== undefined) {
          throw frameTooLarge();
        }
      }
    } finally {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      // Idempotent: cancelling an already-cancelled or finished reader resolves.
      void reader.cancel().catch(() => undefined);
      // Release the lock as well: cancel() alone left the body locked, so
      // anything that inspected it afterwards got a TypeError.
      try {
        reader.releaseLock();
      } catch {
        // A read still settling holds the lock; nothing to do.
      }
    }
  }

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
  private async readBufferedBody(
    response: Response,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    _startedAt: number
  ): Promise<Uint8Array[] | null> {
    const body = response.body;
    if (!body || response.status === 204 || response.status === 205 || response.status === 304) {
      return null;
    }
    const reader = body.getReader();
    let stopped: 'stall' | 'abort' | undefined;
    const stop = (why: 'stall' | 'abort'): void => {
      if (stopped === undefined || why === 'abort') stopped = why;
      void reader.cancel().catch(() => undefined);
    };
    const onAbort = (): void => stop('abort');
    const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (!hasBudget) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => stop('stall'), timeoutMs);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      arm();
      for (;;) {
        if (stopped !== undefined) break;
        const chunk = await reader.read();
        if (chunk.done) break;
        chunks.push(chunk.value);
        received += chunk.value.length;
        arm();
      }
    } catch (error) {
      if (stopped === undefined) throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      try {
        reader.releaseLock();
      } catch {
        // A read still settling holds the lock; nothing to do.
      }
    }
    if (stopped === 'abort') {
      const aborted = new Error('The request was aborted while its response body was being read');
      aborted.name = 'AbortError';
      throw aborted;
    }
    if (stopped === 'stall') {
      throw Object.assign(
        new Error('Response body stalled: the server answered HTTP ' + response.status + ', then sent no data for ' + timeoutMs + 'ms (after ' + received + ' bytes). The transfer stopped mid-body; retry, or raise the timeout.'),
        { name: 'BodyStallError', code: 'ETIMEDOUT' }
      );
    }
    return chunks;
  }

  /**
   * A fresh, unread Response over chunks readBufferedBody() already read, with
   * the original status, headers and url. The chunks are enqueued, not copied.
   */
  private replayResponse(response: Response, chunks: Uint8Array[] | null): Response {
    if (chunks === null) return response;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const replay = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperty(replay, 'url', { value: response.url });
    return replay;
  }

  /** The chunks as one byte array: the rawBody response middleware receives. */
  private joinChunks(chunks: Uint8Array[] | null): Uint8Array {
    let total = 0;
    for (const chunk of chunks ?? []) total += chunk.length;
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks ?? []) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

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
  async prepareUpgrade(
    url: string,
    data: IRequestData = {}
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const isFullUrl = _isFullUrl(url);
    const target = isFullUrl
      ? this.buildUrlFromFull(url, data.query)
      : this.buildUrl(url, data.query);
    const isExternalUrl = this.isExternalDestination(isFullUrl, target);
    const headers = this.buildHeaders(data.headers);
    if (isExternalUrl) {
      this.deleteAuthorization(headers, data.headers);
    }
    // An upgrade has no body to describe.
    _deleteContentType(headers);
    const context = await this.applyRequestMiddleware({
      requestId: this.nextRequestId(),
      attempt: 1,
      method: 'GET',
      path: url,
      url: target,
      headers,
      timeoutMs: data.timeoutMs ?? this.config.timeout,
      retries: 0,
      ...(data.query !== undefined ? { query: data.query } : {}),
      ...(data.middlewareContext !== undefined ? { middlewareContext: data.middlewareContext } : {}),
    }, data.routeTag);
    return { url: context.url, headers: { ...context.headers } };
  }

  async logout<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('LOGOUT', path, data);
  }

  private async parseResponseBody(
    response: Response,
    responseType: 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob' = 'auto',
    method?: string,
    losslessIntegers = false
  ): Promise<unknown> {
    // Parity with the browser http-client: HEAD / 204 / 205 / 304 /
    // Content-Length:0 have no body; calling response.json() on them
    // throws SyntaxError: Unexpected end of JSON input and surfaces as a
    // failure to the caller instead of a successful empty response.
    const upperMethod = method ? method.toUpperCase() : undefined;
    const hasNoBody =
      upperMethod === 'HEAD' ||
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304 ||
      response.headers.get('content-length') === '0';
    if (hasNoBody) {
      if (responseType === 'text') return '';
      if (responseType === 'arrayBuffer') return new ArrayBuffer(0);
      if (responseType === 'blob') return new Blob([]);
      return null;
    }

    if (responseType === 'json') {
      return losslessIntegers ? parseJsonLossless(await response.text()) : response.json();
    }

    if (responseType === 'text') {
      return response.text();
    }

    if (responseType === 'arrayBuffer') {
      return response.arrayBuffer();
    }

    if (responseType === 'blob') {
      return response.blob();
    }

    const contentType = response.headers.get('content-type');

    if (isJsonContentType(contentType)) {
      // An empty body under a JSON type reads as null, as in the CLI client.
      const text = await response.text();
      if (text.trim() === '') return null;
      return losslessIntegers ? parseJsonLossless(text) : JSON.parse(text);
    }

    if (this.isBinaryResponse(response, contentType)) {
      return response.arrayBuffer();
    }

    return response.text();
  }

  private isBinaryResponse(response: Response, contentType: string | null): boolean {
    // A text type is text however it is served: hoody-agent's log export is NDJSON
    // with Content-Disposition: attachment, typed string in the spec, and the
    // attachment rule used to win and hand back an ArrayBuffer.
    if (isTextMediaType(contentType)) {
      return false;
    }

    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition && /attachment/i.test(contentDisposition)) {
      return true;
    }

    return isBinaryMediaType(contentType);
  }

  /**
   * Query parameters as wire pairs. An array value is sent as one pair per
   * item (`?source=nix&source=system`): the OpenAPI default for a query array
   * (style `form`, explode `true`), and the form every kit that declares an
   * array query parameter parses. `String()` on an array comma-joins it into
   * ONE value (`?source=nix,system`), which hoody-run rejects as an unknown
   * source and hoody-browser passes to Chromium as one launch argument.
   * `undefined` and `null` (the value or an item) send nothing.
   */
  private queryPairs(query?: Record<string, unknown>): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    if (!query) return pairs;
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null) pairs.push([key, _queryString(item)]);
        }
      } else {
        pairs.push([key, _queryString(value)]);
      }
    }
    return pairs;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const baseUrl = this.config.baseURL.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    const normalizedPath = cleanPath ? `/${cleanPath}` : '/';

    if (!baseUrl || !this.hasAbsoluteUrlOrigin(baseUrl)) {
      return this.appendQueryParameters(this.joinRelativeUrl(baseUrl, normalizedPath), query);
    }

    const url = new URL(`${baseUrl}${normalizedPath}`);
    this.mergeQueryPairs(url.searchParams, query);
    return url.toString();
  }

  /**
   * Adds the query to the parameters the path already carries. A key the path
   * holds itself (a route marker: `/{archive}?extract`, `/{directory}?zip`)
   * is never sent twice: a non-empty value from the caller replaces the bare
   * marker (`?extract=src%2F`), an empty one leaves it as it is. The request
   * used to go out as `?extract=&extract=src%2F`, which only reads right on a
   * server that keeps the last value of a repeated key.
   */
  private mergeQueryPairs(target: URLSearchParams, query?: Record<string, unknown>): boolean {
    const pairs = this.queryPairs(query);
    if (pairs.length === 0) return false;
    const inPath = new Set<string>();
    for (const key of target.keys()) inPath.add(key);
    const replaced = new Set<string>();
    for (const [key, value] of pairs) {
      if (inPath.has(key)) {
        if (value === '') continue;
        if (!replaced.has(key)) {
          target.delete(key);
          replaced.add(key);
        }
      }
      target.append(key, value);
    }
    return true;
  }

  private hasAbsoluteUrlOrigin(value: string): boolean {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
  }

  private joinRelativeUrl(basePath: string, normalizedPath: string): string {
    if (!basePath) {
      return normalizedPath;
    }

    const trimmedBase = basePath.endsWith('/')
      ? basePath.slice(0, -1)
      : basePath;

    return `${trimmedBase}${normalizedPath}`;
  }

  private appendQueryParameters(pathOrUrl: string, query?: Record<string, unknown>): string {
    if (!query) {
      return pathOrUrl;
    }

    const mark = pathOrUrl.indexOf('?');
    const searchParams = new URLSearchParams(mark === -1 ? '' : pathOrUrl.slice(mark + 1));
    if (!this.mergeQueryPairs(searchParams, query)) {
      return pathOrUrl;
    }

    const queryString = searchParams.toString();
    const head = mark === -1 ? pathOrUrl : pathOrUrl.slice(0, mark);
    return queryString ? `${head}?${queryString}` : head;
  }

  private isVerboseLoggingEnabled(): boolean {
    const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return processRef?.env?.HTTP_VERBOSE === 'true';
  }

  private buildUrlFromFull(fullUrl: string, query?: Record<string, unknown>): string {
    const url = new URL(fullUrl);
    this.mergeQueryPairs(url.searchParams, query);
    return url.toString();
  }

  private sanitizeHeaderValue(value: string, maxLength = 128): string {
    return value
      .replace(/[^ -~]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...customHeaders,
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    if (this.config.clientId) {
      const v = this.sanitizeHeaderValue(this.config.clientId);
      if (v) headers['X-Hoody-Client-ID'] = v;
    }
    if (this.config.clientName) {
      const v = this.sanitizeHeaderValue(this.config.clientName);
      if (v) headers['X-Hoody-Client-Name'] = v;
    }

    return headers;
  }

  private async executeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    externalSignal?: AbortSignal,
    redirect?: 'follow' | 'error' | 'manual'
  ): Promise<Response> {
    const controller = new AbortController();
    // 0-ms setTimeout aborts immediately on the next tick (before fetch
    // has even dispatched). timeout: 0 means "no timeout" (caller opting
    // out of our budget). Only arm the abort timer for positive finite
    // budgets.
    const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const timeout = hasBudget
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
    let externalAbortListener: (() => void) | undefined;

    let requestUrl = url;
    let resolvedIP: string | undefined;

    try {
      if (this.config.forceIPv4) {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname;

          // Skip host rewrite for HTTPS URLs. Rewriting the URL to
          // https://<IP>/... breaks TLS
          // SNI and cert validation against any DNS-name certificate.
          // For HTTPS we still resolve (for attachment to error.resolvedIP
          // diagnostics) but leave the URL hostname intact; Node's resolver
          // will follow the system preference. Use a native undici dispatcher
          // at a higher layer if strict IPv4-only routing over TLS is needed.
          if (urlObj.protocol === 'https:' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
            try {
              resolvedIP = await this.resolveIPv4Hostname(hostname);
            } catch { /* diagnostic-only */ }
          } else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
            const address = await this.resolveIPv4Hostname(hostname);
            resolvedIP = address;
            urlObj.hostname = address;
            requestUrl = urlObj.toString();
            if (!headers['Host']) {
              headers['Host'] = hostname;
            }
          }
        } catch {
          // ignore resolution failures and allow fetch to attempt hostname
        }
      }

      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalAbortListener = () => controller.abort();
          externalSignal.addEventListener('abort', externalAbortListener, { once: true });
        }
      }

      const bodyValue = body !== undefined
        ? (body instanceof Blob || body instanceof FormData || typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Uint8Array || (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
          ? body as BodyInit
          : _stringifyBody(body))
        : undefined;
      // Header names are case-insensitive: a request middleware that hands
      // back another spelling (a Headers round-trip lower-cases every name)
      // survived the exact-case delete, and a FormData upload went out as
      // application/json with no multipart boundary.
      if (body instanceof Blob || body instanceof FormData) {
        _deleteContentType(headers);
      } else if (
        (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
        || body instanceof ArrayBuffer
        || body instanceof Uint8Array
      ) {
        // Only strip the DEFAULT application/json for a raw byte body;
        // caller-explicit Content-Type is preserved.
        //
        // ArrayBuffer and Uint8Array were not in this list, so bytes went out
        // labelled application/json — invisible while the only way to reach the
        // branch was a hand-written call, and reachable from the typed surface
        // as soon as a binary request body became expressible (pipe.send).
        _deleteDefaultJsonContentType(headers);
      }
      // transport.keepAlive: false asks the server to close the connection.
      // The fetch `keepalive` flag is never set: it is a browser's "outlive
      // the page" switch, not connection reuse, and with it Node refuses
      // every ReadableStream body outright.
      const requestHeaders = (!this.config.transport.keepAlive && !headers['Connection'])
        ? { ...headers, Connection: 'close' }
        : headers;
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: requestHeaders,
        signal: controller.signal,
      };
      if (redirect) fetchOptions.redirect = redirect;

      if (bodyValue !== undefined) {
        fetchOptions.body = bodyValue;
        // undici / Node fetch requires duplex: 'half' for streaming
        // request bodies.
        if (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream) {
          (fetchOptions as { duplex?: string }).duplex = 'half';
        }
      }

      // Instance transport, never the global. JSON, binary and streaming
      // requests all land here, so the injected transport sees all of them.
      // The SDK's own Node transport takes the request's budget, so undici's
      // timeouts follow timeoutMs instead of capping it at their defaults.
      const budgeted = _BUDGETED_FETCH.get(this.config.fetch);
      if (budgeted) return await budgeted(requestUrl, fetchOptions, timeoutMs);
      return await this.config.fetch(requestUrl, fetchOptions);
    } catch (fetchError) {
      if (fetchError && typeof fetchError === 'object' && resolvedIP !== undefined) {
        (fetchError as { resolvedIP?: string }).resolvedIP = resolvedIP;
      }
      throw fetchError;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (externalSignal && externalAbortListener) {
        externalSignal.removeEventListener('abort', externalAbortListener);
      }
    }
  }

  private async resolveIPv4Hostname(hostname: string): Promise<string> {
    const shouldUseCache = this.config.forceIPv4Cache.enabled && this.config.forceIPv4Cache.ttlMs > 0;
    const now = Date.now();

    if (shouldUseCache) {
      const cached = this.ipv4DnsCache.get(hostname);
      if (cached && cached.expiresAt > now) {
        return cached.address;
      }
    }

    const lookup = await this.loadNodeDnsLookup();
    const { address } = await lookup(hostname, { family: 4 });

    if (shouldUseCache) {
      this.ipv4DnsCache.set(hostname, {
        address,
        expiresAt: now + this.config.forceIPv4Cache.ttlMs,
      });

      if (this.ipv4DnsCache.size > 1024) {
        this.pruneExpiredIPv4Cache(now);
      }
    }

    return address;
  }

  private async loadNodeDnsLookup(): Promise<NodeDnsLookup> {
    const specifier = 'node:dns/promises';
    const dnsModule = await import(specifier) as { lookup?: NodeDnsLookup };

    if (typeof dnsModule.lookup !== 'function') {
      throw new Error('node:dns/promises lookup is unavailable in this runtime');
    }

    return dnsModule.lookup;
  }

  private pruneExpiredIPv4Cache(now: number): void {
    for (const [hostname, entry] of this.ipv4DnsCache.entries()) {
      if (entry.expiresAt <= now) {
        this.ipv4DnsCache.delete(hostname);
      }
    }
  }

  private async buildApiErrorFromResponse(
    response: Response,
    request: IHttpClientMiddlewareRequestContext
  ): Promise<ApiError> {
    let responseDetails: ApiErrorResponseDetails | unknown = undefined;
    let message = `HTTP ${response.status}: ${response.statusText}`;
    let code: string | undefined;

    try {
      const parsed = await this.parseResponseBody(response);
      responseDetails = parsed;

      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        const nested = record.error !== null && typeof record.error === 'object' && !Array.isArray(record.error)
          ? record.error as Record<string, unknown>
          : undefined;
        if (typeof record.message === 'string' && record.message.length > 0) {
          message = record.message;
        } else if (typeof record.error === 'string' && record.error.length > 0) {
          message = record.error;
        } else if (nested && typeof nested.message === 'string' && nested.message.length > 0) {
          // { error: { code, message } }: the message is one level down.
          message = nested.message;
        }

        code = _apiErrorCode(record);
      } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
        // An HTML error page (hoody-exec's 404 and 500) is not a message: its
        // title is. The page itself stays on error.response.
        message = _htmlErrorTitle(parsed, message) ?? parsed;
      }
    } catch {
      // keep default message
    }
    // No body (a HEAD answer) or no code in it: the code may be in the
    // X-Hoody-Error-Code response header (hoody-sqlite's KV HEAD 404).
    if (code === undefined) code = _headerErrorCode(response.headers);

    // Redact URL + body + query in both the ApiError and its attached
    // request context. Parity with the browser http-client.
    // The recorded credential query parameters are redacted too, whatever
    // name the operator gave them (kitAuth token rule with a param).
    const credentialParams = _credentialQueryParamsOf(request.middlewareContext);
    const redactedUrl = _redactUrl(request.url, credentialParams);
    const apiRequest: ApiErrorRequestContext = {
      method: request.method,
      url: redactedUrl,
      ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body, 0, undefined, credentialParams) } : {}),
      ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query, 0, undefined, credentialParams) as Record<string, unknown> } : {}),
      ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers, _credentialHeadersOf(request.middlewareContext)) } : {}),
    };

    const err = new ApiError({
      message,
      status: response.status,
      ...(code !== undefined ? { code } : {}),
      url: redactedUrl,
      method: request.method,
      request: apiRequest,
      response: responseDetails,
    });
    // Parse Retry-After and attach to the error so the retry loop honors
    // server-directed backoff instead of hammering with local exponential
    // delay.
    const retryAfterMs = this.parseRetryAfter(response.headers);
    if (retryAfterMs !== undefined) {
      (err as ApiError & { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
    }
    return err;
  }

  private toApiError(
    error: unknown,
    request: IHttpClientMiddlewareRequestContext
  ): ApiError {
    if (isApiError(error)) {
      return error;
    }

    const isAbortError =
      (error instanceof Error && error.name === 'AbortError')
      || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ABORT_ERR');

    // undici's own timeouts arrive as "fetch failed" (or "terminated") with
    // the reason two causes down: name them, with the client's timeout codes.
    const transportTimeout = isAbortError ? undefined : _undiciTimeoutOf(error);
    const message = isAbortError
      ? `Request timed out after ${request.timeoutMs}ms`
      : transportTimeout === 'headers' ? 'Request timed out: the server sent no response headers in time'
      : transportTimeout === 'body' ? 'Request timed out: the response body stalled'
      : transportTimeout === 'connect' ? 'Request timed out: the connection could not be opened in time'
      : (error instanceof Error ? error.message : 'Request failed');

    // Redact URL/body/query; attach PARSE_ERROR code for SyntaxError
    // (parity with the browser http-client).
    const isParseError = error instanceof SyntaxError;
    // The recorded credential query parameters are redacted too, whatever
    // name the operator gave them (kitAuth token rule with a param).
    const credentialParams = _credentialQueryParamsOf(request.middlewareContext);
    const redactedUrl = _redactUrl(request.url, credentialParams);
    const apiRequest: ApiErrorRequestContext = {
      method: request.method,
      url: redactedUrl,
      ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body, 0, undefined, credentialParams) } : {}),
      ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query, 0, undefined, credentialParams) as Record<string, unknown> } : {}),
      ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers, _credentialHeadersOf(request.middlewareContext)) } : {}),
    };

    // A body that stalled after the headers (readBufferedBody): the CLI's code for it.
    const isBodyStall = error instanceof Error && error.name === 'BodyStallError';
    return new ApiError({
      message,
      status: 0,
      ...(isAbortError || transportTimeout === 'headers' ? { code: 'ABORTED' }
        : isParseError ? { code: 'PARSE_ERROR' }
        : isBodyStall || transportTimeout !== undefined ? { code: 'ETIMEDOUT' }
        : {}),
      url: redactedUrl,
      method: request.method,
      request: apiRequest,
      cause: error,
    });
  }

  /**
   * Whether a failed attempt may be sent again. One rule, in this order:
   *   1. This client's own timeout or abort, a refused redirect and a missing fetch are final.
   *   2. A request that never reached a server (the connection could not be opened) ran
   *      nothing: any method goes again.
   *   3. A refusal whose code says nothing was done (RETRY_SAFE_CODES): any method goes again.
   *   4. A request marked responseIsFinal stops here: its handler is arbitrary code, so a status
   *      it returned is an answer, and a lost connection may have followed a run.
   *   5. Otherwise the request may have been handled. An idempotent method (GET, HEAD, OPTIONS,
   *      PUT, DELETE) goes again on a lost connection or a status in retryOnStatuses; any
   *      other method only on 429, which refuses before handling.
   * `byDefault` (nobody set `retries`): a method that is not idempotent goes again only by rule 2.
   */
  private shouldRetry(
    error: ApiError,
    method: string,
    retryOnStatuses: number[],
    responseIsFinal = false,
    byDefault = false
  ): boolean {
    // ABORTED at status 0 is this client's own timeout or caller abort: final. A
    // server's answer that names the code (body or X-Hoody-Error-Code) is retried
    // by its status like any other.
    if (error.status === 0 && error.code === 'ABORTED') {
      return false;
    }
    // A redirect this client refused to follow is the same answer on every attempt.
    if (error.code === 'REDIRECT_REFUSED') {
      return false;
    }
    // So is a runtime with no fetch.
    if (error.status === 0 && (error.cause as { code?: unknown } | undefined)?.code === 'FETCH_UNAVAILABLE') {
      return false;
    }

    if (error.status === 0 && _neverDispatched(error)) {
      return true;
    }
    if (byDefault && !_IDEMPOTENT_METHODS.includes(method)) {
      return false;
    }
    if (error.status > 0 && !responseIsFinal && typeof error.code === 'string' && RETRY_SAFE_CODES.includes(error.code)) {
      return true;
    }
    if (responseIsFinal) {
      return false;
    }

    const idempotentMethod = _IDEMPOTENT_METHODS.includes(method);

    // Any other network-level failure (status=0) may or may not have reached
    // the server. For idempotent methods retrying is safe. For POST/PATCH and
    // other non-idempotent methods the request may already have mutated
    // state — retrying can double-apply. Gate on idempotency.
    if (error.status === 0) {
      return idempotentMethod;
    }

    if (!idempotentMethod && error.status !== 429) {
      return false;
    }

    return retryOnStatuses.includes(error.status);
  }

  /**
   * Exponential backoff with bounded cap + optional server-directed
   * Retry-After delay. Without the cap, `retries: 15` with persistent 503
   * produces multi-minute sleeps; without Retry-After, we violate RFC 9110
   * §10.2.3 by ignoring server-directed backoff.
   */
  private getRetryDelayMs(baseDelayMs: number, attempt: number, retryAfterMs?: number): number {
    const MAX_RETRY_DELAY_MS = 30000;
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
    }
    const exponentialDelay = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * 50);
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
  }

  /**
   * Parse Retry-After header (delta-seconds or HTTP-date) into milliseconds.
   */
  private parseRetryAfter(headers: Headers | undefined, nowMs: number = Date.now()): number | undefined {
    if (!headers) return undefined;
    const raw = headers.get('retry-after');
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const secs = parseInt(trimmed, 10);
      if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
      return undefined;
    }
    const dateMs = Date.parse(trimmed);
    if (Number.isFinite(dateMs)) {
      const delta = dateMs - nowMs;
      return delta > 0 ? delta : 0;
    }
    return undefined;
  }

  /**
   * Single-flight token refresh. Without this, N concurrent 401s each run
   * onTokenExpired/refreshToken independently — servers that rotate tokens
   * per refresh call see last-setToken-wins races with in-flight retries
   * stranded on stale tokens. Cache the in-flight refresh Promise so
   * siblings share one round-trip.
   */
  /** config.finalizers, taken at construction (see IHttpClientConfig.finalizers). */
  #finalizers: NonNullable<IHttpClientConfig['finalizers']>;
  private refreshTokenPromise: Promise<string | undefined> | null = null;
  private tryRefreshToken(error: ApiError): Promise<string | undefined> {
    if (this.refreshTokenPromise) return this.refreshTokenPromise;
    // Clear the slot only if it still holds THIS flight: an owner may have
    // dropped it (HoodyClient does on a new session generation) and a newer
    // flight may occupy it by the time this one settles.
    const flight: Promise<string | undefined> = this.doRefreshToken(error).finally(() => {
      if (this.refreshTokenPromise === flight) this.refreshTokenPromise = null;
    });
    this.refreshTokenPromise = flight;
    return flight;
  }

  private async doRefreshToken(error: ApiError): Promise<string | undefined> {
    const fromTokenExpiredHook = await this.config.onTokenExpired(error);
    if (typeof fromTokenExpiredHook === 'string' && fromTokenExpiredHook.length > 0) {
      return fromTokenExpiredHook;
    }

    const fromRefreshCallback = await this.config.refreshToken();
    if (typeof fromRefreshCallback === 'string' && fromRefreshCallback.length > 0) {
      return fromRefreshCallback;
    }

    return undefined;
  }

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
  private isSameOriginAndPath(url: string, baseURL: string): boolean {
    const target = this.resolveDestination(url);
    const base = this.resolveDestination(baseURL === '' ? '/' : baseURL);
    return target !== undefined && base !== undefined && this.withinBase(target, base);
  }

  /** The scope rule of isSameOriginAndPath, over two resolved URLs. */
  private withinBase(target: URL, base: URL): boolean {
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return false;
    }
    const sameOrigin = target.origin === base.origin;
    const realmSubdomain = target.protocol === base.protocol
      && target.port === base.port
      && target.hostname.endsWith('.' + base.hostname);
    if (!sameOrigin && !realmSubdomain) {
      return false;
    }
    let basePath = base.pathname;
    while (basePath.endsWith('/')) {
      basePath = basePath.slice(0, -1);
    }
    return basePath === ''
      || target.pathname === basePath
      || target.pathname.startsWith(basePath + '/');
  }

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
  private resolveDestination(url: string): URL | undefined {
    try {
      const base = _transportBase();
      return base === undefined ? new URL(url) : new URL(url, base);
    } catch {
      return undefined;
    }
  }

  /**
   * True when a request must not carry the API bearer: the URL it was built
   * into resolves outside the API's credential scope, or it was given as a
   * full URL to a client without a baseURL. Judged on the built URL, not on
   * how the path was spelled: a path of //elsewhere, joined onto the page's
   * origin, is elsewhere.
   */
  private isExternalDestination(isFullUrl: boolean, url: string): boolean {
    return (isFullUrl && !this.config.baseURL) || this.credentialScope(url) !== 'api';
  }

  /**
   * Remove the client's own Authorization, in every spelling. Header names are
   * case-insensitive, so a configured "authorization" survived a delete of
   * "Authorization" and rode out to an external host. `callHeaders` are the
   * request's own headers: an Authorization there is put back (see below).
   */
  private deleteAuthorization(headers: Record<string, string>, callHeaders?: Record<string, string>): void {
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'authorization') {
        delete headers[name];
      }
    }
    // What is withheld from another host is the client's own credential (the
    // account token, a configured Authorization header). An Authorization the
    // caller put on THIS request is for this request's destination: a script
    // behind hoody-exec that reads a Bearer token has no other way to get it.
    if (callHeaders) {
      for (const [name, value] of Object.entries(callHeaders)) {
        if (name.toLowerCase() === 'authorization' && typeof value === 'string' && value.length > 0) {
          headers.Authorization = value;
        }
      }
    }
  }

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
  private credentialScope(url: string): string {
    const target = this.resolveDestination(url);
    if (target === undefined) {
      return _isOriginRelative(url) ? 'api' : 'unresolved ' + url;
    }
    if (this.isSameOriginAndPath(target.href, this.config.baseURL)) {
      return 'api';
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return 'opaque ' + target.href;
    }
    return target.origin;
  }

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
  private confineCredentials(
    urlBefore: string,
    headersBefore: Record<string, string>,
    namesBefore: { headers: string[]; params: string[] },
    next: IHttpClientMiddlewareRequestContext
  ): IHttpClientMiddlewareRequestContext {
    const context = _carryCredentialNames(namesBefore, next);
    if (context.url === urlBefore
      || this.credentialScope(context.url) === this.credentialScope(urlBefore)) {
      return context;
    }
    const recorded = new Set<string>();
    for (const name of _credentialHeadersOf(context.middlewareContext)) {
      recorded.add(name.toLowerCase());
    }
    // Every value per lower-cased name: a header can be present in two
    // casings (config 'Authorization' plus per-request 'authorization'), and
    // a single-value map let the losing casing's credential through.
    const before = new Map<string, Set<string>>();
    for (const [name, value] of Object.entries(headersBefore)) {
      const key = name.toLowerCase();
      const values = before.get(key) ?? new Set<string>();
      values.add(value);
      before.set(key, values);
    }
    const headers: Record<string, string> = { ...context.headers };
    for (const [name, value] of Object.entries(headers)) {
      const credential = _isCredentialHeader(name) || recorded.has(name.toLowerCase());
      if (credential && before.get(name.toLowerCase())?.has(value)) {
        delete headers[name];
      }
    }
    // A credential carried as a query parameter (a kitAuth token rule with a
    // param, recorded by the proxy-auth middleware under
    // middlewareContext._credentialQueryParams) follows the same rule: a value
    // that was on the URL before this step does not travel to the new origin.
    const names = _credentialQueryParamsOf(context.middlewareContext);
    let url = context.url;
    const nextUrl = names.length > 0 ? this.resolveDestination(context.url) : undefined;
    const prevUrl = names.length > 0 ? this.resolveDestination(urlBefore) : undefined;
    if (nextUrl !== undefined && prevUrl !== undefined) {
      let changed = false;
      for (const name of names) {
        const prevValues = prevUrl.searchParams.getAll(name);
        if (prevValues.length === 0) continue;
        const current = nextUrl.searchParams.getAll(name);
        const kept = current.filter((value) => !prevValues.includes(value));
        if (kept.length !== current.length) {
          nextUrl.searchParams.delete(name);
          for (const value of kept) nextUrl.searchParams.append(name, value);
          changed = true;
        }
      }
      if (changed) url = nextUrl.toString();
    }
    return { ...context, url, headers };
  }

  private async applyRequestMiddleware(
    initialContext: IHttpClientMiddlewareRequestContext,
    routeTag?: object
  ): Promise<IHttpClientMiddlewareRequestContext> {
    // Header names are case-insensitive: a middleware that sets content-type next to
    // the default Content-Type replaces it, it does not add a second one (which fetch
    // would join into application/json, text/plain).
    let context = _withFoldedHeaders(initialContext);

    for (const middleware of this.config.middlewares) {
      if (!middleware.onRequest) continue;
      // Snapshot what this step starts from: a middleware may edit the context
      // in place rather than return a new one.
      const urlBefore = context.url;
      const headersBefore: Record<string, string> = { ...context.headers };
      const namesBefore = _credentialNamesOf(context.middlewareContext);
      const nextContext = await middleware.onRequest(context);
      if (nextContext) {
        context = nextContext;
      }
      context = _withFoldedHeaders(context);
      // Scope is checked after EVERY step, so the final URL never carries a
      // credential that was chosen for a different destination.
      context = this.confineCredentials(urlBefore, headersBefore, namesBefore, context);
    }

    // Finalizers run last, whatever use() and setMiddlewares() did to the
    // middleware list, with the same confinement after each step.
    for (const finalize of this.#finalizers) {
      const urlBefore = context.url;
      const headersBefore: Record<string, string> = { ...context.headers };
      const namesBefore = _credentialNamesOf(context.middlewareContext);
      const nextContext = await finalize(context, routeTag);
      if (nextContext) {
        context = nextContext;
      }
      context = _withFoldedHeaders(context);
      context = this.confineCredentials(urlBefore, headersBefore, namesBefore, context);
    }

    return context;
  }

  /**
   * True when a request carries a credential: a header the redaction set names
   * (Authorization, Cookie, X-*-Token, the container claim, ...), a header
   * recorded as a kit credential under a name the operator chose, or a
   * recorded credential query parameter on its URL.
   */
  private carriesCredential(
    url: string,
    headers: Record<string, string>,
    middlewareContext: unknown
  ): boolean {
    const recorded = new Set<string>();
    for (const name of _credentialHeadersOf(middlewareContext)) {
      recorded.add(name.toLowerCase());
    }
    for (const name of Object.keys(headers)) {
      if (_isCredentialHeader(name) || recorded.has(name.toLowerCase())) {
        return true;
      }
    }
    const params = _credentialQueryParamsOf(middlewareContext);
    if (params.length === 0) {
      return false;
    }
    const target = this.resolveDestination(url);
    return target === undefined || params.some((name) => target.searchParams.has(name));
  }

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
  private async sendConfined(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    redirect: 'follow' | 'error' | undefined,
    middlewareContext: unknown,
    trackHops = false
  ): Promise<Response> {
    const confined = redirect !== 'error' && this.carriesCredential(url, headers, middlewareContext);
    if (redirect === 'error' || (!confined && !trackHops)) {
      return this.executeRequest(method, url, headers, body, timeoutMs, signal, redirect);
    }
    const MAX_CREDENTIALED_HOPS = confined ? 5 : 20;
    // One budget for the whole chain, not one per hop: each hop gets what is
    // left of timeoutMs, and a hop with nothing left is not sent.
    const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const deadline = hasBudget ? Date.now() + timeoutMs : 0;
    let hopMethod = method.toUpperCase();
    let hopUrl = url;
    let hopHeaders: Record<string, string> = { ...headers };
    let hopBody = body;
    for (let hops = 0; ; hops++) {
      const hopTimeoutMs = hasBudget ? deadline - Date.now() : timeoutMs;
      if (hasBudget && hopTimeoutMs <= 0) {
        const expired = new Error('The request timed out before redirect ' + hops + ' could be followed');
        expired.name = 'AbortError';
        throw expired;
      }
      let response: Response;
      try {
        response = await this.executeRequest(
          hopMethod, hopUrl, { ...hopHeaders }, hopBody, hopTimeoutMs, signal, 'manual'
        );
      } catch (error) {
        // A server already answered this request (the redirect): a failure on a later hop,
        // even a refused connection, is after dispatch, never "nothing was sent".
        if (hops > 0 && error !== null && typeof error === 'object') {
          try { Object.defineProperty(error, 'afterDispatch', { value: true, configurable: true }); } catch { /* frozen */ }
        }
        throw error;
      }
      if (response.type === 'opaqueredirect') {
        throw this.redirectRefusal(
          'the server answered with a redirect, and a browser does not reveal where it leads',
          response.status, hopMethod, hopUrl, middlewareContext
        );
      }
      const status = response.status;
      const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
      // Read only on a redirect: an injected transport may answer with a bare
      // response-like object that has no headers.
      const location = isRedirect ? response.headers?.get('location') ?? null : null;
      if (location === null) {
        return response;
      }
      try {
        await response.body?.cancel();
      } catch {
        // The hop's body is discarded either way.
      }
      const current = this.resolveDestination(hopUrl);
      let next: URL | undefined;
      try {
        next = current === undefined ? undefined : new URL(location, current);
      } catch {
        next = undefined;
      }
      if (next === undefined || (next.protocol !== 'http:' && next.protocol !== 'https:')
        || (confined && this.credentialScope(next.href) !== this.credentialScope(hopUrl))) {
        throw this.redirectRefusal(
          'HTTP ' + status + ' points outside the destination the request was addressed to',
          status, hopMethod, hopUrl, middlewareContext
        );
      }
      if (hops + 1 > MAX_CREDENTIALED_HOPS) {
        throw this.redirectRefusal(
          'more than ' + MAX_CREDENTIALED_HOPS + ' redirects', status, hopMethod, hopUrl, middlewareContext
        );
      }
      const toGet = status === 303
        ? hopMethod !== 'HEAD'
        : (status === 301 || status === 302) && hopMethod === 'POST';
      if (toGet) {
        hopMethod = 'GET';
        hopBody = undefined;
        const kept: Record<string, string> = {};
        for (const [name, value] of Object.entries(hopHeaders)) {
          const lower = name.toLowerCase();
          if (lower !== 'content-type' && lower !== 'content-length' && lower !== 'content-encoding'
            && lower !== 'content-language' && lower !== 'content-location') {
            kept[name] = value;
          }
        }
        hopHeaders = kept;
      } else if (typeof ReadableStream !== 'undefined' && hopBody instanceof ReadableStream) {
        throw this.redirectRefusal(
          'HTTP ' + status + ' asks for the streamed request body again, which cannot be sent twice',
          status, hopMethod, hopUrl, middlewareContext
        );
      }
      hopUrl = next.href;
    }
  }

  /** The ApiError sendConfined throws; the URL is redacted, the credentials never leave. */
  private redirectRefusal(
    reason: string,
    status: number,
    method: string,
    url: string,
    middlewareContext: unknown
  ): ApiError {
    const redactedUrl = _redactUrl(url, _credentialQueryParamsOf(middlewareContext));
    return new ApiError({
      message: 'Refused to follow a redirect: ' + reason + '. The request carries credentials, '
        + 'which are sent only to the destination it was addressed to.',
      status,
      code: 'REDIRECT_REFUSED',
      url: redactedUrl,
      method,
      request: { method, url: redactedUrl },
    });
  }

  private async applyResponseMiddleware<T>(
    initialContext: IHttpClientMiddlewareResponseContext<T>
  ): Promise<IHttpClientMiddlewareResponseContext<T>> {
    let context = initialContext;

    for (const middleware of this.config.middlewares) {
      if (!middleware.onResponse) continue;
      const nextContext = await middleware.onResponse(context);
      if (nextContext) {
        context = nextContext;
      }
    }

    return context;
  }

  private async applyErrorMiddleware(
    context: IHttpClientMiddlewareErrorContext
  ): Promise<void> {
    for (const middleware of this.config.middlewares) {
      if (!middleware.onError) continue;
      await middleware.onError(context);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private nextRequestId(): string {
    this.requestCounter += 1;
    return `req-${Date.now()}-${this.requestCounter}`;
  }

  /**
   * Normalize all responses into a stable API envelope:
   * { statusCode, message, data }
   */
  private normalizeResponseEnvelope(
    payload: unknown,
    statusCode: number,
    statusText: string
  ): { statusCode: number; message: string; data: unknown } {
    const fallbackMessage = statusText || (statusCode >= 200 && statusCode < 300 ? 'OK' : 'Request completed');

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      // Parity with the browser http-client. An OR-gate would treat any
      // response carrying a 'message' OR 'data' field as the Hoody
      // envelope and silently reshape it; AND-gate with type checks on
      // 'statusCode' (number) and 'message' (string) plus required 'data'
      // key eliminates false positives.
      const looksLikeEnvelope =
        typeof record.statusCode === 'number'
        && typeof record.message === 'string'
        && Object.prototype.hasOwnProperty.call(record, 'data');

      if (looksLikeEnvelope) {
        let data: unknown;
        if (Object.prototype.hasOwnProperty.call(record, 'data')) {
          data = record.data;
        } else {
          const { statusCode: _statusCode, message: _message, ...rest } = record;
          data = Object.keys(rest).length > 0 ? rest : null;
        }

        return {
          statusCode: typeof record.statusCode === 'number' ? record.statusCode : statusCode,
          message: typeof record.message === 'string' ? record.message : fallbackMessage,
          data,
        };
      }
    }

    return {
      statusCode,
      message: fallbackMessage,
      data: payload ?? null,
    };
  }
}
