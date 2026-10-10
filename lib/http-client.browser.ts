/**
 * Browser-compatible HTTP Client for Hoody SDK
 *
 * Kept in lib/ (not auto-generated). Used by the browser bundle via esbuild
 * resolution of `http-client.js` imports.
 */

import {
  ApiError,
  isApiError,
  type ApiErrorRequestContext,
  type ApiErrorResponseDetails,
} from '../generated/errors.js';
import {
  isBinaryMediaType,
  DEFAULT_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RETRY_WAIT_CAP_MS,
  IDEMPOTENT_METHODS,
  KIT_NOT_READY,
  KIT_STARTING_MAX_DELAY_MS,
  callerAbortMessage,
  deadlineReason,
  inWebBrowser,
  isDeadlineReason,
  resolveKitStartingWaitMs,
  isKitStarting,
  kitNotReadyMessage,
  kitStartingRetries,
  isTextMediaType,
  mergeQueryPairs,
  parseJsonLossless,
  keyedReplayOf,
  sendsIdempotencyKey,
  shouldRetryFailure,
  stringifyBody,
  withKeyedReplayHeader,
  type IKeyedReplay,
  withIdempotencyKey,
} from './http-wire.js';

// The Node client module exports these wire helpers; the browser client re-exports the shared copies.
export {
  isBinaryMediaType,
  isKitStarting,
  isTextMediaType,
  kitNotReadyMessage,
  kitStartingRetries,
  newIdempotencyKey,
  parseJsonLossless,
  resolveKitStartingWaitMs,
  stringifyJsonLossless,
  withIdempotencyKey,
} from './http-wire.js';

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
    ttl?: number; // milliseconds
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
   * fetch redirect mode. 'error' refuses every redirect, same-origin ones
   * included (the request fails instead): HoodyClient sends credential-bearing
   * auth calls this way, so a redirect cannot replay their body to another
   * origin. hoody-api does not redirect those routes. Absent: follow.
   * request(), stream() and streamEvents() all honour it.
   */
  redirect?: 'follow' | 'error';
  /**
   * Any HTTP answer to this request is final, whatever its status. For a call whose handler is
   * arbitrary code (an exec script): a 500, 502 or 429 it returned cannot be told from a
   * platform failure, and sending the request again runs the code again. With this set,
   * `retries` covers only a request that never reached a server (the connection could not be
   * opened), which a browser's fetch never reports (see lib/http-wire.ts neverDispatched).
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
}

interface ICacheEntry {
  data: unknown;
  timestamp: number;
}

type RequiredHttpClientConfig = Required<Omit<IHttpClientConfig, 'fetch' | 'middlewares' | 'finalizers' | 'onKitAuthExpired' | 'onStreamDiagnostic' | 'retries' | 'retryDelayMs'>> & {
  /** Absent: the default policy (IHttpClientConfig.retries). */
  retries?: number;
  retryDelayMs?: number;
  onStreamDiagnostic?: (error: unknown) => void;
  middlewares: IHttpClientMiddleware[];
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

/**
 * Extract values of auth-like headers from config.headers + per-request
 * headers, in a case-insensitive, stable-ordered way, so they contribute to
 * the GET cache partition key. Any header name matching
 * authorization|cookie|proxy-authorization|x-*-token|x-*-key|api-key|bearer|
 * *access-token|*refresh-token|*session-token|*id-token is mixed in.
 */
function hashAuthHeaders(
  configHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
): string {
  const merged: Record<string, string> = {};
  for (const src of [configHeaders, requestHeaders]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) merged[k.toLowerCase()] = v;
  }
  // lib/redact.ts's secret-header rule, so any credential-bearing header
  // contributes to the cache partition. A private copy of the pattern fell
  // behind it (it lacked x-*-lease), and two callers differing only in that
  // header shared one cached answer.
  const parts: string[] = [];
  for (const k of Object.keys(merged).sort()) {
    if (_isSecretHeaderName(k)) parts.push(`${k}=${merged[k]}`);
  }
  return parts.length ? parts.join('\n') : '';
}

/**
 * Redact Authorization + secret-bearing headers before embedding them in
 * ApiError request context. Observability hooks log the error object, so any
 * unredacted header would leak `Bearer <token>` / cookies / proxy-auth values
 * to whatever sink the consumer wires up.
 */
// Redaction helpers live in the shared ./redact module so the secret-key
// set, placeholder, depth limit, and cycle handling stay identical across
// browser, Node-generated, and CLI surfaces.
import { redactHeaders as _redactHeaders, redactUrl as _redactUrl, redactSensitiveValue as _redactSensitiveValue, isSecretHeaderName as _isSecretHeaderName, credentialQueryParamsOf as _credentialQueryParamsOf, credentialHeadersOf as _credentialHeadersOf } from './redact.js';

/**
 * Headers that carry a credential, for the credential-scope check in
 * applyRequestMiddleware(): the redaction set plus the kit container claim.
 * Same predicate as the Node client's, which inlines the redaction set.
 */
function _isCredentialHeader(name: string): boolean {
  return _isSecretHeaderName(name) || name.toLowerCase() === 'x-hoody-container-claim';
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
 * The machine code of an error body: an explicit string code wins, then the
 * containers edge's errorCode (BACKEND_GATEWAY_ERROR), then a code-shaped error
 * field (hoody-api puts its code there: TOKEN_CEILING_EXCEEDED,
 * SIGNING_NOT_CONFIGURED), then a nested error object's code. Prose in error
 * ("Bad Request", "key not found") is never promoted to a code.
 */
function _apiErrorCode(record: Record<string, unknown>): string | undefined {
  if (typeof record.code === 'string' && record.code.length > 0) return record.code;
  if (typeof record.errorCode === 'string' && record.errorCode.length > 0) return record.errorCode;
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

/**
 * Detect one-shot request bodies that cannot be replayed safely on retry.
 * ReadableStreams and AsyncIterables are single-consumption: the first
 * `fetch()` drains them, so any auth-retry would silently send an empty
 * body. Callers with such bodies get the original 401/error instead.
 */
function isNonReplayableBody(body: unknown): boolean {
  if (body === undefined || body === null) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (typeof g.ReadableStream !== 'undefined' && body instanceof g.ReadableStream) return true;
  // AsyncIterable is also single-consumption.
  if (typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function') return true;
  return false;
}

// Cap the browser GET cache. HEAD/OPTIONS don't flush it, so in CORS-heavy
// SPAs with many unique GET URLs the cache would grow monotonically over
// the page lifetime. A simple LRU with a generous cap keeps memory bounded
// without hurting hit rates for realistic workloads.
const BROWSER_CACHE_MAX_ENTRIES = 256;

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
export type ITypedStreamEvent<TFrames extends object> = Omit<IStreamEvent, 'event'> & (
  | { [K in keyof TFrames & string]: { declared: true; event: K; data: TFrames[K] } }[keyof TFrames & string]
  | { declared: false; event: string; data: unknown }
);

/**
 * Adds `data` and `declared` to a frame (see ITypedStreamEvent). `lossless`
 * is the request's losslessIntegers: a 64-bit integer is not rounded.
 */
function _decodeStreamEvent(event: IStreamEvent, declared: ReadonlySet<string>, lossless: boolean): IStreamEvent & { declared: boolean; data: unknown } {
  let data: unknown;
  let parsed = false;
  try {
    data = lossless ? parseJsonLossless(event.raw) : JSON.parse(event.raw);
    parsed = true;
  } catch {
    data = undefined;
  }
  return { ...event, declared: parsed && declared.has(event.event), data };
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
  ABORTED: 'The event stream request was aborted by the caller',
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
  private requestCounter = 0;

  /**
   * The INJECTED transport, or null. Kept separate from the config on purpose: with no injection the
   * client reads the runtime's CURRENT global fetch at every request (browsers and test harnesses swap
   * it after construction), while an injected one is retained and can never be swapped from outside.
   */
  private readonly fetchImpl: HoodyFetch | null;

  /**
   * The transport options the CALLER passed, or null. `config.transport` holds them with every
   * default filled in, so a derivation that copied it handed each child a full set of Node-only
   * knobs the caller never set, and every box client warned that they are ignored.
   */
  private readonly configuredTransport: IHttpClientTransportConfig | null;

  constructor(config: IHttpClientConfig = {}) {
    this.fetchImpl = config.fetch ?? null;
    this.configuredTransport = config.transport ? { ...config.transport } : null;
    const transport = config.transport || {};
    const forceIPv4Cache = config.forceIPv4Cache || {};

    this.#finalizers = config.finalizers ? [...config.finalizers] : [];
    this.config = {
      baseURL: config.baseURL || '',
      token: config.token || '',
      // `??` (not `||`) so `timeout: 0` survives — callers use 0 to mean
      // "no timeout, rely on upstream"; `||` would silently promote it to 30s.
      timeout: config.timeout ?? 30000,
      ...(config.retries !== undefined ? { retries: config.retries } : {}),
      ...(config.retryDelayMs ? { retryDelayMs: config.retryDelayMs } : {}),
      kitStartingWaitMs: resolveKitStartingWaitMs(config.kitStartingWaitMs),
      retryOnStatuses: config.retryOnStatuses || [408, 425, 429, 500, 502, 503, 504],
      headers: config.headers || {},
      cache: config.cache || {},
      captureRawBody: config.captureRawBody === true,
      maxStreamFrameBytes: resolveMaxFrameBytes(config.maxStreamFrameBytes),
      ...(typeof config.onStreamDiagnostic === 'function' ? { onStreamDiagnostic: config.onStreamDiagnostic } : {}),
      transport: {
        keepAlive: transport.keepAlive ?? false,
        connections: transport.connections ?? 128,
        pipelining: transport.pipelining ?? 1,
        keepAliveTimeoutMs: transport.keepAliveTimeoutMs ?? 10000,
        keepAliveMaxTimeoutMs: transport.keepAliveMaxTimeoutMs ?? 60000,
        dispatcher: transport.dispatcher,
      },
      forceIPv4: false,
      forceIPv4Cache: {
        enabled: forceIPv4Cache.enabled !== false,
        ttlMs: forceIPv4Cache.ttlMs ?? 60000,
      },
      middlewares: config.middlewares ? [...config.middlewares] : [],
      onError: config.onError || (async () => false),
      onTokenExpired: config.onTokenExpired || (async () => undefined),
      refreshToken: config.refreshToken || (async () => undefined),
      acceptRefreshedToken: config.acceptRefreshedToken || (() => true),
      autoRetryAuth: config.autoRetryAuth !== false,
      clientId: config.clientId || '',
      clientName: config.clientName || '',
      // Store the onKitAuthExpired callback so the retry path can invoke
      // it on Kit 401s. Conditionally spread to keep the callback optional
      // in the resolved config shape.
      ...(config.onKitAuthExpired ? { onKitAuthExpired: config.onKitAuthExpired } : {}),
    };

    // Node-only transport knobs are accepted for config parity but the browser
    // fetch runtime can't honour them. Warn once so devs notice a silent no-op
    // instead of wondering why their dispatcher tweak didn't land.
    const nodeOnlyKnobs: string[] = [];
    if (transport.connections !== undefined) nodeOnlyKnobs.push('connections');
    if (transport.pipelining !== undefined) nodeOnlyKnobs.push('pipelining');
    if (transport.keepAliveTimeoutMs !== undefined) nodeOnlyKnobs.push('keepAliveTimeoutMs');
    if (transport.keepAliveMaxTimeoutMs !== undefined) nodeOnlyKnobs.push('keepAliveMaxTimeoutMs');
    if (transport.dispatcher !== undefined) nodeOnlyKnobs.push('dispatcher');
    if (config.forceIPv4) nodeOnlyKnobs.push('forceIPv4');
    if (nodeOnlyKnobs.length > 0 && typeof console !== 'undefined' && console.warn) {
      console.warn(
        `[HoodyClient] browser HttpClient ignores Node-only transport options: ${nodeOnlyKnobs.join(', ')}. ` +
        'These are accepted for cross-runtime config parity but have no effect in the browser.',
      );
    }
  }

  /** The transport this client will use — lets a caller assert the injection took effect. */
  getFetch(): HoodyFetch {
    if (this.fetchImpl !== null) return this.fetchImpl;
    const globalFetch = (globalThis as { fetch?: HoodyFetch }).fetch;
    // FETCH_UNAVAILABLE: the same answer on every attempt, so shouldRetry treats it as final.
    if (globalFetch === undefined) throw Object.assign(new Error('No fetch implementation available in this runtime. Pass one explicitly: new HttpClient({ fetch: myFetch }).'), { code: 'FETCH_UNAVAILABLE' });
    return globalFetch;
  }

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
  getInjectedFetch(): HoodyFetch | undefined {
    return this.fetchImpl ?? undefined;
  }

  /**
   * The transport options the CALLER passed, or `undefined` when none were.
   *
   * What every derivation (`withRealm`, `withContainer`, the realm-error introspection client)
   * copies. Never the normalised `config.transport`: that one carries the defaults, and a child
   * built from it reports Node-only knobs as caller-set (the browser warns once per client).
   */
  getConfiguredTransport(): IHttpClientTransportConfig | undefined {
    return this.configuredTransport === null ? undefined : { ...this.configuredTransport };
  }

  clearCache(): void {
    this.cache.clear();
  }

  async close(): Promise<void> {
    this.clearCache();
  }

  getBaseURL(): string {
    return this.config.baseURL;
  }

  setToken(token: string): void {
    this.config.token = token;
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
    if (data.idempotencyKeyHeader !== undefined) {
      data = { ...data, headers: withIdempotencyKey(data.headers, this.config.headers, data.idempotencyKeyHeader) };
    }
    const upperMethod = method.toUpperCase();
    const isFullUrl = _isFullUrl(path);
    const url = isFullUrl
      ? this.buildUrlFromFull(path, data.query)
      : this.buildUrl(path, data.query);
    // Kit service URLs are full URLs that don't match the API baseURL
    // origin. Never send the API JWT to Kit services — they have their own
    // auth. An empty baseURL must treat every full URL as external,
    // otherwise the Authorization header would leak cross-origin.
    // Judged on the built URL wherever it resolves (isExternalDestination), so
    // a path spelled //elsewhere, joined onto the page's origin, is elsewhere.
    const isExternalUrl = this.isExternalDestination(isFullUrl, url);

    // Cache identity partitioning: the cache key includes a hash of the
    // Authorization header AND any per-request / per-client auth-like
    // headers (X-Api-Key, Cookie, …) that the request would have used, so
    // token rotation / cross-identity reuse of a single HttpClient cannot
    // serve a response baked to a different identity. Kit-auth uses
    // different headers and doesn't participate in this key.
    const isGet = upperMethod === 'GET';
    const headerIdentity = isGet ? hashAuthHeaders(this.config.headers, data.headers) : '';
    const cacheIdentity = isGet ? hashIdentity((this.config.token ?? '') + '|' + headerIdentity) : '';
    // Cache key must also disambiguate envelope vs. raw body and response
    // parser (json/text/arrayBuffer/blob): a GET with `rawResponse:true`
    // followed by the same GET without it would otherwise cross-pollute shapes.
    const cacheShape = isGet
      ? (data.rawResponse === true ? 'R' : 'E') + ':' + (data.responseType || 'auto') + (data.losslessIntegers === true ? ':L' : '')
      : '';
    const cacheKey = `${upperMethod}:${cacheIdentity}:${cacheShape}:${url}`;
    // Opt-in. A default-on cache answered repeated state reads and state-
    // changing kit GETs from memory for five seconds.
    const cacheEnabled = this.config.cache.enabled === true;
    const requestCache = data.cache !== undefined ? data.cache : cacheEnabled;
    // `?? 5000` preserves an explicit ttl:0 (caller asking to disable cache
    // freshness). `|| 5000` would silently coerce 0 to 5s.
    const ttl = typeof requestCache === 'number'
      ? requestCache
      : (this.config.cache.ttl ?? 5000);

    // Only GET responses are cached; every other verb is treated as
    // potentially state-changing and flushes the GET cache. HEAD and OPTIONS
    // are exempted from the flush — they fetch metadata for the same
    // resource address, so invalidating on them would force a re-fetch on
    // the very next GET and defeat the cache. WebDAV verbs
    // (MKCOL/COPY/MOVE/LOCK/UNLOCK/PROPPATCH) are mutating and do flush.
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

    // Nobody set retries: the default policy (DEFAULT_RETRIES, see IHttpClientConfig.retries).
    const explicitRetries = data.retries ?? this.config.retries;
    const retryByDefault = explicitRetries === undefined;
    const retries = Math.max(0, explicitRetries ?? (data.responseIsFinal === true ? 0 : DEFAULT_RETRIES));
    // A kit still starting may take more attempts than `retries` (decided per failure below).
    const kitStartingWaitMs = this.config.kitStartingWaitMs;
    const attemptBudget = retryByDefault ? Math.max(retries, kitStartingRetries(kitStartingWaitMs)) : retries;
    const timeoutMs = data.timeoutMs ?? this.config.timeout;
    const retryDelayMs = data.retryDelayMs ?? this.config.retryDelayMs ?? (retryByDefault ? DEFAULT_RETRY_DELAY_MS : 250);
    let retryWaitedMs = 0;
    const retryOnStatuses = data.retryOnStatuses ?? this.config.retryOnStatuses;
    const authRetryEnabled = data.authRetry ?? this.config.autoRetryAuth;
    const rawResponse = data.rawResponse === true;
    const responseType = data.responseType || 'auto';

    let authRetried = false;
    let kitAuthRetried = false;
    let lastError: ApiError | undefined;
    // New Kit auth returned from `onKitAuthExpired` is stashed here and merged
    // into the next attempt's `middlewareContext.kitAuth` so proxy-auth
    // middleware applies it; simply calling the callback isn't enough because
    // the middleware otherwise keeps injecting the stale credentials and
    // 401-loops.
    let pendingKitAuthOverride: unknown = undefined;
    // One-shot ReadableStream bodies are consumed on the first attempt; a 401
    // retry would silently send an empty body. Disable auth retry in that case
    // so the caller gets the clear 401 instead of a downstream empty-POST.
    const bodyIsNonReplayable = isNonReplayableBody(data.body);
    // A keyed request's key and wire body as its first keyed attempt sent them; every later
    // attempt sends exactly these (keyedReplayOf). keyedUnreplayable: it sent a key with a body
    // that cannot go out twice byte for byte, so it is not retried.
    let keyedReplay: IKeyedReplay | undefined;
    let keyedUnreplayable = false;
    const keyHeader = data.declaredIdempotencyKeyHeader ?? data.idempotencyKeyHeader;

    for (let attempt = 1; attempt <= attemptBudget + 1; attempt++) {
      // The token this attempt goes out with: a 401 is about THIS token, which may no longer be
      // the client's by the time the answer arrives.
      const tokenSent = this.config.token;
      const headers = this.buildHeaders(data.headers);
      if (isExternalUrl) {
        // Every spelling: a lower-case authorization survived the exact-case
        // delete. The caller's own per-request Authorization is put back.
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

      // Merge a per-retry kitAuth override if the caller supplied one via
      // onKitAuthExpired. Local clone so we never mutate the caller's object.
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

      let middlewareRequest = requestContext;
      try {
        middlewareRequest = await this.applyRequestMiddleware(requestContext, data.routeTag);
        let wire = _wireBody(middlewareRequest.body, middlewareRequest.headers, data.jsonStringBody);
        if (keyedReplay !== undefined) {
          middlewareRequest = { ...middlewareRequest, headers: withKeyedReplayHeader(middlewareRequest.headers, keyHeader!, keyedReplay) };
          wire = keyedReplay.body;
        } else if (!keyedUnreplayable && sendsIdempotencyKey(middlewareRequest.headers, keyHeader)) {
          keyedReplay = keyedReplayOf(middlewareRequest.headers, keyHeader, wire, stringifyBody);
          if (keyedReplay === undefined) keyedUnreplayable = true;
          else wire = keyedReplay.body;
        }
        const startedAt = Date.now();
        const received = await this.sendConfined(
          middlewareRequest.method,
          middlewareRequest.url,
          middlewareRequest.headers,
          wire,
          middlewareRequest.timeoutMs,
          data.signal,
          data.redirect,
          middlewareRequest.middlewareContext,
          // Follow redirects here, where a failure after an answered hop is marked, whenever
          // "never dispatched" would send the request again where shouldRetry otherwise would
          // not. Not in a web browser (see inWebBrowser).
          (data.responseIsFinal === true || !IDEMPOTENT_METHODS.includes(middlewareRequest.method.toUpperCase()))
            && !inWebBrowser()
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
          // LRU eviction when we hit the cap. Map iteration order is
          // insertion order, so the first key is the oldest entry we
          // haven't re-accessed.
          if (this.cache.size >= BROWSER_CACHE_MAX_ENTRIES) {
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
        let apiError = this.toApiError(error, middlewareRequest, data.signal);
        lastError = apiError;

        try {
          await this.applyErrorMiddleware({
            ...middlewareRequest,
            error: apiError,
          });
        } catch {
          // Middleware errors must not mask the original API error
        }

        // Every decision below reads the request as it was dispatched: a request middleware may
        // have sent it to another destination (an API path to a kit host, whose 401 is the
        // script's answer, not the account token's), with another method (a GET made a POST
        // that ran) or with another body (one that cannot be sent twice).
        const sentMethod = middlewareRequest.method.toUpperCase();
        const sentExternal = middlewareRequest.url === url
          ? isExternalUrl
          : this.isExternalDestination(_isFullUrl(middlewareRequest.url), middlewareRequest.url);
        const sentNonReplayable = bodyIsNonReplayable || keyedUnreplayable || isNonReplayableBody(middlewareRequest.body);
        const sentKeyed = sendsIdempotencyKey(middlewareRequest.headers, keyHeader);

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
        // Same rule as the generated Node client.
        if (authRetryEnabled && !authRetried && apiError.status === 401 && !sentExternal && !sentNonReplayable) {
          // The token that was refused has already been replaced: a sibling request's refresh
          // landed while this one was in flight. Replay with the current token; refreshing again
          // would spend a second refresh call (and, on a server that rotates the refresh token,
          // invalidate the pair the sibling just stored).
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
              // Stash the returned auth — the retry picks it up via
              // pendingKitAuthOverride below; just setting kitAuthRetried
              // would let the middleware keep injecting the stale credentials.
              pendingKitAuthOverride = newAuth;
              kitAuthRetried = true;
              attempt -= 1;
              continue;
            }
          } catch (cbErr) {
            // Surface callback failures — swallowing them hides auth-refresh
            // bugs that otherwise manifest only as mysterious 401-loops.
            const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
            console.error('[HttpClient] onKitAuthExpired callback failed:', msg);
          }
          if (renewedNotReplayed) throw renewedNotReplayed;
        }

        // Don't retry when the body is a single-consumption stream
        // (ReadableStream / AsyncIterable). The first fetch() drained it,
        // so a replay would send an empty body to the server → silent data
        // loss on idempotent PUT/DELETE uploads. Surface the error now.
        // A kit still starting gets the longer default budget (kitStartingWaitMs, lib/http-wire.ts).
        const kitStarting = retryByDefault && kitStartingWaitMs > 0 && data.responseIsFinal !== true && isKitStarting(apiError);
        if (attempt <= (kitStarting ? attemptBudget : retries) && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, data.responseIsFinal === true, retryByDefault, sentKeyed)) {
          const retryAfterMs = (apiError as ApiError & { retryAfterMs?: number }).retryAfterMs;
          let delayMs = this.getRetryDelayMs(retryDelayMs, attempt, retryAfterMs);
          if (kitStarting && retryAfterMs === undefined) delayMs = Math.min(delayMs, KIT_STARTING_MAX_DELAY_MS);
          // The default policy waits at most DEFAULT_RETRY_WAIT_CAP_MS in all. A wait past it
          // (a long Retry-After) ends the retries: sending sooner than the server asked is not
          // honouring it.
          if (!retryByDefault || retryWaitedMs + delayMs <= (kitStarting ? kitStartingWaitMs : DEFAULT_RETRY_WAIT_CAP_MS)) {
            retryWaitedMs += delayMs;
            await this.sleep(delayMs);
            continue;
          }
        }
        // The kit-starting wait ran out on a request it covered: say so, with a code to match.
        if (kitStarting && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, false, true, sentKeyed)) {
          apiError = new ApiError({
            message: kitNotReadyMessage(retryWaitedMs),
            status: apiError.status,
            code: KIT_NOT_READY,
            ...(apiError.url !== undefined ? { url: apiError.url } : {}),
            ...(apiError.method !== undefined ? { method: apiError.method } : {}),
            ...(apiError.request !== undefined ? { request: apiError.request } : {}),
            response: apiError.response,
            cause: apiError,
          });
        }

        // Invoke onError on EVERY failure including terminal ones — hiding
        // the hook from exactly the errors consumers care about most would
        // defeat observability. `shouldRetry` still controls actual replays;
        // onError is informational unless it returns true AND retry budget
        // remains.
        if (this.config.onError) {
          try {
            const shouldRetry = await this.config.onError(apiError);
            // Same stream-safety guard: do not replay a consumed body. The hook asks; it does
            // not overrule responseIsFinal (a hook that returns true for every error ran an
            // exec script twice on its 500).
            // Nor does it spend the default budget: before the default policy there was none.
            // A caller's abort is never replayed: its signal stays aborted.
            const callerAborted = apiError.status === 0 && apiError.code === 'ABORTED';
            if (shouldRetry && attempt <= retries && !sentNonReplayable && data.responseIsFinal !== true && !retryByDefault && !callerAborted) {
              await this.sleep(this.getRetryDelayMs(retryDelayMs, attempt));
              continue;
            }
          } catch (cbErr) {
            // Log suppressed middleware error (parity with Node).
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
      const openError = this.toApiError(error, requestContext, data.signal);
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
   *
   * Typed frames: with `options.declaredEvents` each frame also carries its
   * parsed `data` and `declared`, and `TEvent` (an ITypedStreamEvent) types
   * them; see ITypedStreamEvent.
   */
  streamEvents<TDocumented extends object = Record<never, string>, TEvent extends IStreamEvent = IStreamEvent>(
    method: string,
    path: string,
    data: IRequestData = {},
    options: IStreamEventsOptions = {}
  ): IEventStream<TDocumented, TEvent> {
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
    const declaredEvents = options.declaredEvents ? new Set(options.declaredEvents) : undefined;
    const lossless = data.losslessIntegers === true;
    // One step of the iteration, with every failure made fixed-text and
    // response settled by it.
    const step = async (): Promise<IteratorResult<TEvent, void>> => {
      let result: IteratorResult<IStreamEvent, void>;
      try {
        result = await frames.next();
      } catch (error) {
        const clean = toStreamError(error);
        refuse(clean);
        throw clean;
      }
      if (result.done) {
        refuse(closedError());
        return result;
      }
      const value = declaredEvents ? _decodeStreamEvent(result.value, declaredEvents, lossless) : result.value;
      return { done: false, value: value as TEvent };
    };
    // Reading response before the first next() sends the request: the first
    // step runs then, and its result is held for that next(). Otherwise
    // `await stream.response` ahead of the loop would wait for a request
    // nothing had sent.
    let started = false;
    let held: Promise<IteratorResult<TEvent, void>> | undefined;
    const stream: IEventStream<TDocumented, TEvent> = {
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
        return (await frames.return(value)) as IteratorResult<TEvent, void>;
      },
      async throw(error?: unknown) {
        refuse(error);
        held = undefined;
        close();
        return (await frames.throw(error)) as IteratorResult<TEvent, void>;
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
    const idleMs = typeof options.idleTimeoutMs === 'number' && Number.isFinite(options.idleTimeoutMs) && options.idleTimeoutMs > 0
      ? options.idleTimeoutMs
      : undefined;
    let idled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const idleTimedOut = (): ApiError => _cleanApiError({
      message: 'The event stream sent nothing for ' + idleMs + ' ms (idleTimeoutMs); the stream was closed',
      status: response.status,
      code: 'ETIMEDOUT',
      url: _redactUrl(response.url || path, _credentialQueryParamsOf(requestData.middlewareContext)),
      method: method.toUpperCase(),
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
        // The idle clock covers this read only: a caller still handling the
        // last frame is not the stream going quiet.
        if (idleMs !== undefined) {
          idleTimer = setTimeout(() => {
            idled = true;
            onAbort();
          }, idleMs);
        }
        try {
          read = await reader.read();
        } catch (error) {
          // A read the abort cancelled may reject rather than resolve done.
          if (signal && signal.aborted) throw abortError();
          if (control.closed) return;
          if (idled) throw idleTimedOut();
          throw error;
        } finally {
          clearTimeout(idleTimer);
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
        // The idle bound cancelled it: not the server ending the stream.
        if (idled) {
          throw idleTimedOut();
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
    losslessIntegers = false,
  ): Promise<unknown> {
    // HEAD and 204/205/304 responses have no body by spec; `response.json()`
    // on an empty body throws SyntaxError. Short-circuit to null so typed
    // callers can check for emptiness without try/catch. Also respects
    // `Content-Length: 0` because some fetch polyfills echo GET's content
    // length back on HEAD.
    const upperMethod = (method ?? '').toUpperCase();
    const hasNoBody =
      upperMethod === 'HEAD' ||
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304 ||
      response.headers.get('content-length') === '0';

    if (responseType === 'json') {
      if (hasNoBody) return null;
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
      if (hasNoBody) return null;
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
    // with Content-Disposition: attachment, and the attachment rule used to win and
    // hand back an ArrayBuffer. Matched on the exact subtype (lib/http-wire.ts): a
    // substring test read a .docx (openxmlformats) as text.
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
   * Query parameters as wire pairs, as the Node client builds them: an array
   * value is one pair per item (?source=a&source=b, OpenAPI form/explode), and
   * undefined/null (the value or an item) sends nothing. The browser used
   * String() on arrays, which comma-joins them into ONE value (source=a%2Cb)
   * that array-taking kits reject.
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
    // Empty baseURL = same-origin relative fetch (browser default). In the
    // browser, fall back to `location.origin` so the URL is absolute. If
    // `location` is missing (SSR / worker-lite), emit a path-only URL so
    // callers can still prepend their own base.
    if (!baseUrl) {
      const origin =
        typeof globalThis !== 'undefined' &&
        typeof (globalThis as any).location?.origin === 'string'
          ? (globalThis as any).location.origin
          : '';
      if (origin) {
        const url = new URL(`/${cleanPath}`, origin);
        mergeQueryPairs(url.searchParams, this.queryPairs(query));
        return url.toString();
      }
      // No origin available — emit path + manual query string. Kept on
      // encodeURIComponent (%20, not URLSearchParams' +): a path-only URL is
      // resolved by whatever the caller prepends, and DC2-18 pins this form.
      // A path that carries its own query (a route marker) is merged with it.
      const mark = cleanPath.indexOf('?');
      const pathOnly = mark === -1 ? cleanPath : cleanPath.slice(0, mark);
      const merged = new URLSearchParams(mark === -1 ? '' : cleanPath.slice(mark + 1));
      if (mark !== -1 && !mergeQueryPairs(merged, this.queryPairs(query))) {
        return `/${cleanPath}`;
      }
      const pairs = mark === -1 ? this.queryPairs(query) : [...merged];
      const qs = pairs
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      return `/${pathOnly}${qs ? `?${qs}` : ''}`;
    }
    // A relative baseURL ('/api') is joined as a path, as the Node client does;
    // `new URL('/api/x')` has no authority and threw here.
    if (!this.hasAbsoluteUrlOrigin(baseUrl)) {
      return this.appendQueryParameters(`${baseUrl}/${cleanPath}`, query);
    }
    const url = new URL(`${baseUrl}/${cleanPath}`);
    mergeQueryPairs(url.searchParams, this.queryPairs(query));
    return url.toString();
  }

  private hasAbsoluteUrlOrigin(value: string): boolean {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
  }

  private appendQueryParameters(pathOrUrl: string, query?: Record<string, unknown>): string {
    const mark = pathOrUrl.indexOf('?');
    const searchParams = new URLSearchParams(mark === -1 ? '' : pathOrUrl.slice(mark + 1));
    if (!mergeQueryPairs(searchParams, this.queryPairs(query))) {
      return pathOrUrl;
    }
    const queryString = searchParams.toString();
    const head = mark === -1 ? pathOrUrl : pathOrUrl.slice(0, mark);
    return queryString ? `${head}?${queryString}` : head;
  }

  private buildUrlFromFull(fullUrl: string, query?: Record<string, unknown>): string {
    const url = new URL(fullUrl);
    mergeQueryPairs(url.searchParams, this.queryPairs(query));
    return url.toString();
  }

  private sanitizeHeaderValue(value: string, maxLength = 128): string {
    return value
      .replace(/[^\x20-\x7E]/g, '')
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
    // `timeout: 0` means "no timeout" (caller opting out of our budget). A
    // 0-ms setTimeout would abort on the next tick — before fetch had even
    // dispatched — so only arm the timer for positive finite budgets.
    const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const timeout = hasBudget
      ? setTimeout(() => controller.abort(deadlineReason()), timeoutMs)
      : undefined;
    let externalAbortListener: (() => void) | undefined;

    try {
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
          : stringifyBody(body))
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
        // Only strip the DEFAULT application/json for a raw byte body — caller-explicit headers
        // are kept. Parity with generated/http-client.ts: ArrayBuffer and Uint8Array were missing
        // from both, so bytes went out labelled application/json.
        _deleteDefaultJsonContentType(headers);
      }
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers,
        signal: controller.signal,
      };
      if (redirect) fetchOptions.redirect = redirect;
      // transport.keepAlive is NOT passed as fetch `keepalive`. In fetch that flag means "this
      // request may outlive the page" (the beacon use), not connection reuse, and a browser
      // refuses a keepalive request whose body is over 64 KiB: an upload or a long script failed
      // outright. Connection reuse is the runtime's in a browser, as in the Node client.

      if (bodyValue !== undefined) {
        fetchOptions.body = bodyValue;
        // Chromium requires duplex: 'half' for streaming request bodies
        if (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream) {
          (fetchOptions as any).duplex = 'half';
        }
      }

      // No fetch at all: getFetch() throws the actionable error (a bare `fetch` was a ReferenceError).
      return await (this.fetchImpl !== null ? this.fetchImpl(url, fetchOptions) : typeof fetch === 'function' ? fetch(url, fetchOptions) : this.getFetch()(url, fetchOptions));
    } finally {
      if (timeout) clearTimeout(timeout);
      if (externalSignal && externalAbortListener) {
        externalSignal.removeEventListener('abort', externalAbortListener);
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
        if (typeof record.message === 'string') {
          message = record.message;
        } else if (typeof record.error === 'string') {
          message = record.error;
        }

        code = _apiErrorCode(record);
      } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
        message = parsed;
      }
    } catch {
      // keep default message
    }
    // No body (a HEAD answer) or no code in it: the code may be in the
    // X-Hoody-Error-Code response header (hoody-sqlite's KV HEAD 404).
    if (code === undefined) code = _headerErrorCode(response.headers);

    // Redact URL, body, and query before embedding in ApiError.
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
    // Parse Retry-After for 429/503 and attach to the error so the retry
    // loop honors server-directed backoff instead of hammering with local
    // exponential delay.
    const retryAfterMs = this.parseRetryAfter(response.headers);
    if (retryAfterMs !== undefined) {
      (err as ApiError & { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
    }
    return err;
  }

  private toApiError(
    error: unknown,
    request: IHttpClientMiddlewareRequestContext,
    callerSignal?: AbortSignal
  ): ApiError {
    if (isApiError(error)) {
      return error;
    }

    const isAbortError =
      (error instanceof Error && error.name === 'AbortError')
      || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ABORT_ERR');
    const isParseError = error instanceof SyntaxError;
    // The caller's own signal fired: fetch rejects with an AbortError, or with the signal's
    // reason when the caller gave one. ABORTED, never the timeout, so a cancel is not taken for a
    // deadline. Any other AbortError is this client's deadline: ETIMEDOUT, as in the Node and CLI clients.
    // The deadline's own reason (see deadlineReason) wins a race with a later caller abort.
    const callerAbort = !isDeadlineReason(error)
      && callerSignal?.aborted === true && (isAbortError || error === callerSignal.reason);
    const deadline = isAbortError && !callerAbort;

    const message = callerAbort
      ? callerAbortMessage(callerSignal!.reason)
      : deadline ? `Request timed out after ${request.timeoutMs}ms`
      : (error instanceof Error ? error.message : 'Request failed');

    // A body that stalled after the headers (readBufferedBody): the CLI's code for it.
    const isBodyStall = error instanceof Error && error.name === 'BodyStallError';
    const code = callerAbort ? 'ABORTED' : isParseError ? 'PARSE_ERROR' : deadline || isBodyStall ? 'ETIMEDOUT' : undefined;

    // Redact URL, body, and query for toApiError path too.
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

    return new ApiError({
      message,
      status: 0,
      ...(code ? { code } : {}),
      url: redactedUrl,
      method: request.method,
      request: apiRequest,
      cause: error,
    });
  }

  /**
   * Whether a failed attempt may be sent again: the rule the generated Node
   * client follows, from lib/http-wire.ts (shouldRetryFailure has the order).
   */
  private shouldRetry(
    error: ApiError,
    method: string,
    retryOnStatuses: number[],
    responseIsFinal = false,
    byDefault = false,
    keyed = false
  ): boolean {
    return shouldRetryFailure(error, method, retryOnStatuses, responseIsFinal, byDefault, keyed);
  }

  /**
   * Exponential backoff with bounded delay + jitter. `retryAfterMs` (from
   * parsing `Retry-After`) takes priority over local exponential delay. The
   * 30s cap matches the Node HttpClient so `retries: 15` with a persistent
   * 503 can't grow retry sleeps into minutes.
   */
  private getRetryDelayMs(baseDelayMs: number, attempt: number, retryAfterMs?: number): number {
    const MAX_RETRY_DELAY_MS = 30_000;
    // A server-specified delay of 0 is LEGAL per RFC 9110 §10.2.3 and means
    // "retry immediately". `>= 0` (not `> 0`) honors that vs falling through
    // to the exponential backoff.
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
    }
    const exponentialDelay = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * 50);
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
  }

  /**
   * Parse a Retry-After response header into milliseconds. RFC 9110 §10.2.3
   * allows either an HTTP-date or delta-seconds. Returns undefined if absent
   * or unparseable.
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
   * Single-flight token refresh. N concurrent 401s would otherwise each
   * trigger an independent `onTokenExpired` / `refreshToken` call; servers
   * that rotate per call then see last-setToken-wins races with in-flight
   * retries stranded on stale tokens. Sibling refreshes await the one
   * in-flight promise.
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
      && target.hostname.endsWith('.' + base.hostname)
      && /^[0-9a-f]{24}$/i.test(target.hostname.slice(0, -base.hostname.length - 1));
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
   * its realm hosts), otherwise the origin the URL resolves to.
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
   * Normalize all responses into a stable API envelope: { statusCode, message, data }.
   *
   * A body that already is the envelope keeps every other top-level field it carries
   * (`propagation`, `pagination`, `total`/`limit`/`offset`, `metadata`): those are documented
   * parts of the answer, and dropping them left the caller no way to read them. Its `message`
   * may be absent (`{statusCode, data}`, hoody-api's `/auth/available-regions`); it is filled in
   * from the status text. The generated types (RESPONSE_ENVELOPE_FIELDS) follow the same rule.
   */
  private normalizeResponseEnvelope(
    payload: unknown,
    statusCode: number,
    statusText: string
  ): { statusCode: number; message: string; data: unknown; [field: string]: unknown } {
    const fallbackMessage = statusText || (statusCode >= 200 && statusCode < 300 ? 'OK' : 'Request completed');

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      // Parity with the Node http-client. A numeric `statusCode`, an own `data` key, and a
      // `message` that is a string when present: a looser gate (`message` OR `data`) would
      // reshape a resource that merely has one of those field names.
      const looksLikeEnvelope =
        typeof record.statusCode === 'number'
        && (!Object.prototype.hasOwnProperty.call(record, 'message') || typeof record.message === 'string')
        && Object.prototype.hasOwnProperty.call(record, 'data');

      if (looksLikeEnvelope) {
        const { statusCode: envelopeStatus, message, data, ...siblings } = record;
        return {
          statusCode: envelopeStatus as number,
          message: typeof message === 'string' ? message : fallbackMessage,
          data,
          ...siblings,
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
