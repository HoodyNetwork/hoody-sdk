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
   * response-signature metadata.
   */
  response: Response;
  data: T;
}

export interface IHttpClientMiddlewareErrorContext
  extends IHttpClientMiddlewareRequestContext {
  error: ApiError;
}

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

export interface IHttpClientConfig {
  baseURL?: string;
  token?: string;
  timeout?: number;
  retries?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
  headers?: Record<string, string>;
  cache?: {
    enabled?: boolean;
    ttl?: number; // milliseconds
  };
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
   * Fallback refresh callback when onTokenExpired is not provided.
   * Return a fresh token to auto-retry once.
   */
  refreshToken?: () => Promise<string | undefined>;
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
  cache?: boolean | number;
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
}

interface ICacheEntry {
  data: unknown;
  timestamp: number;
}

type RequiredHttpClientConfig = Required<Omit<IHttpClientConfig, 'middlewares' | 'onKitAuthExpired'>> & {
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
  // Mirror lib/redact.ts SECRET_HEADER_RE so any credential-bearing header
  // contributes to the cache partition. A narrower AUTH_KEY_RE would allow
  // cross-identity cache reuse when the only differing header was e.g.
  // `private-key`, `x-*-secret`, or `x-*-credential(s)`.
  const AUTH_KEY_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/;
  const parts: string[] = [];
  for (const k of Object.keys(merged).sort()) {
    if (AUTH_KEY_RE.test(k)) parts.push(`${k}=${merged[k]}`);
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
import { redactHeaders as _redactHeaders, redactUrl as _redactUrl, redactSensitiveValue as _redactSensitiveValue } from './redact.js';

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

export class HttpClient {
  private readonly config: RequiredHttpClientConfig;
  private cache: Map<string, ICacheEntry> = new Map();
  private requestCounter = 0;

  constructor(config: IHttpClientConfig = {}) {
    const transport = config.transport || {};
    const forceIPv4Cache = config.forceIPv4Cache || {};

    this.config = {
      baseURL: config.baseURL || '',
      token: config.token || '',
      // `??` (not `||`) so `timeout: 0` survives — callers use 0 to mean
      // "no timeout, rely on upstream"; `||` would silently promote it to 30s.
      timeout: config.timeout ?? 30000,
      retries: config.retries || 0,
      retryDelayMs: config.retryDelayMs || 250,
      retryOnStatuses: config.retryOnStatuses || [408, 425, 429, 500, 502, 503, 504],
      headers: config.headers || {},
      cache: config.cache || {},
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
    const upperMethod = method.toUpperCase();
    const isFullUrl = path.startsWith('http://') || path.startsWith('https://');
    const url = isFullUrl
      ? this.buildUrlFromFull(path, data.query)
      : this.buildUrl(path, data.query);
    // Kit service URLs are full URLs that don't match the API baseURL
    // origin. Never send the API JWT to Kit services — they have their own
    // auth. An empty baseURL must treat every full URL as external,
    // otherwise the Authorization header would leak cross-origin.
    const isExternalUrl = isFullUrl && (!this.config.baseURL || !this.isSameOriginAndPath(url, this.config.baseURL));

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
      ? (data.rawResponse === true ? 'R' : 'E') + ':' + (data.responseType || 'auto')
      : '';
    const cacheKey = `${upperMethod}:${cacheIdentity}:${cacheShape}:${url}`;
    const cacheEnabled = this.config.cache.enabled !== false;
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

    const retries = Math.max(0, data.retries ?? this.config.retries);
    const timeoutMs = data.timeoutMs ?? this.config.timeout;
    const retryDelayMs = data.retryDelayMs ?? this.config.retryDelayMs;
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

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const headers = this.buildHeaders(data.headers);
      if (isExternalUrl) {
        delete headers['Authorization'];
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
        middlewareRequest = await this.applyRequestMiddleware(requestContext);
        const response = await this.executeRequest(
          middlewareRequest.method,
          middlewareRequest.url,
          middlewareRequest.headers,
          middlewareRequest.body,
          middlewareRequest.timeoutMs,
          data.signal
        );

        if (!response.ok) {
          throw await this.buildApiErrorFromResponse(response, middlewareRequest);
        }

        const parsedResult = await this.parseResponseBody(response, responseType, upperMethod);
        const normalized = rawResponse
          ? (parsedResult as T)
          : this.normalizeResponseEnvelope(
              parsedResult,
              response.status,
              response.statusText
            ) as T;

        const middlewareResponse = await this.applyResponseMiddleware<T>({
          ...middlewareRequest,
          response,
          data: normalized,
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
        const apiError = this.toApiError(error, middlewareRequest);
        lastError = apiError;

        try {
          await this.applyErrorMiddleware({
            ...middlewareRequest,
            error: apiError,
          });
        } catch {
          // Middleware errors must not mask the original API error
        }

        if (authRetryEnabled && !authRetried && apiError.status === 401 && !isExternalUrl && !bodyIsNonReplayable) {
          const refreshedToken = await this.tryRefreshToken(apiError);
          if (refreshedToken) {
            this.setToken(refreshedToken);
            authRetried = true;
            // Do not consume retry budget for auth recovery replay.
            attempt -= 1;
            continue;
          }
        }

        if (!kitAuthRetried && apiError.status === 401 && isExternalUrl
            && middlewareRequest.middlewareContext?._kitNamespace
            && this.config.onKitAuthExpired
            && !bodyIsNonReplayable) {
          try {
            const ns = middlewareRequest.middlewareContext._kitNamespace as string;
            const newAuth = await this.config.onKitAuthExpired(ns, apiError);
            if (newAuth) {
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
        }

        // Don't retry when the body is a single-consumption stream
        // (ReadableStream / AsyncIterable). The first fetch() drained it,
        // so a replay would send an empty body to the server → silent data
        // loss on idempotent PUT/DELETE uploads. Surface the error now.
        if (attempt <= retries && !bodyIsNonReplayable && this.shouldRetry(apiError, upperMethod, retryOnStatuses)) {
          // Honor Retry-After when the error carries a parsed value.
          const retryAfterMs = (apiError as ApiError & { retryAfterMs?: number }).retryAfterMs;
          await this.sleep(this.getRetryDelayMs(retryDelayMs, attempt, retryAfterMs));
          continue;
        }

        // Invoke onError on EVERY failure including terminal ones — hiding
        // the hook from exactly the errors consumers care about most would
        // defeat observability. `shouldRetry` still controls actual replays;
        // onError is informational unless it returns true AND retry budget
        // remains.
        if (this.config.onError) {
          try {
            const shouldRetry = await this.config.onError(apiError);
            // Same stream-safety guard: do not replay a consumed body.
            if (shouldRetry && attempt <= retries && !bodyIsNonReplayable) {
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

  async logout<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('LOGOUT', path, data);
  }

  private async parseResponseBody(
    response: Response,
    responseType: 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob' = 'auto',
    method?: string,
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
      return response.json();
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

    if (this.isJsonContentType(contentType)) {
      if (hasNoBody) return null;
      return response.json();
    }

    if (this.isBinaryResponse(response, contentType)) {
      return response.arrayBuffer();
    }

    return response.text();
  }

  private isJsonContentType(contentType: string | null): boolean {
    if (!contentType) return false;
    return contentType.toLowerCase().includes('application/json');
  }

  private isBinaryResponse(response: Response, contentType: string | null): boolean {
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition && /attachment/i.test(contentDisposition)) {
      return true;
    }

    if (!contentType) {
      return false;
    }

    const normalized = contentType.toLowerCase();
    if (normalized.startsWith('text/')) {
      return false;
    }

    if (
      normalized.includes('json')
      || normalized.includes('xml')
      || normalized.includes('javascript')
      || normalized.includes('yaml')
      || normalized.includes('yml')
      || normalized.includes('csv')
      || normalized.includes('x-www-form-urlencoded')
    ) {
      return false;
    }

    return (
      normalized.includes('application/octet-stream')
      || normalized.includes('application/zip')
      || normalized.includes('application/x-zip')
      || normalized.includes('application/x-zip-compressed')
      || normalized.includes('application/gzip')
      || normalized.includes('application/x-gzip')
      || normalized.includes('application/x-tar')
      || normalized.includes('application/x-7z-compressed')
      || normalized.includes('application/x-rar-compressed')
      || normalized.includes('application/pdf')
      || normalized.includes('application/wasm')
      || normalized.startsWith('image/')
      || normalized.startsWith('audio/')
      || normalized.startsWith('video/')
      || normalized.startsWith('font/')
    );
  }

  private isSameOriginAndPath(url: string, baseURL: string): boolean {
    try {
      const u = new URL(url);
      const b = new URL(baseURL);
      if (u.origin === b.origin) {
        return u.pathname.startsWith(b.pathname.replace(/\/$/, '') || '/');
      }
      // Realm-scoped subdomains (e.g. {realmId}.api.hoody.com) are same-origin for auth purposes
      if (u.protocol === b.protocol && u.hostname.endsWith('.' + b.hostname)) {
        return u.pathname.startsWith(b.pathname.replace(/\/$/, '') || '/');
      }
      return false;
    } catch {
      return url.startsWith(baseURL);
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const baseUrl = this.config.baseURL.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    // Empty baseURL = same-origin relative fetch (browser default). In the
    // browser, fall back to `location.origin` so `new URL()` has an authority
    // to parse. If `location` is missing (SSR / worker-lite), emit a
    // path-only URL so callers can still prepend their own base.
    if (!baseUrl) {
      const origin =
        typeof globalThis !== 'undefined' &&
        typeof (globalThis as any).location?.origin === 'string'
          ? (globalThis as any).location.origin
          : '';
      if (origin) {
        const url = new URL(`/${cleanPath}`, origin);
        if (query) {
          for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null) {
              url.searchParams.append(key, String(value));
            }
          }
        }
        return url.toString();
      }
      // No origin available — emit path + manual query string.
      const qs = query
        ? Object.entries(query)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(
              ([k, v]) =>
                `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
            )
            .join('&')
        : '';
      return `/${cleanPath}${qs ? `?${qs}` : ''}`;
    }
    const url = new URL(`${baseUrl}/${cleanPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private buildUrlFromFull(fullUrl: string, query?: Record<string, unknown>): string {
    const url = new URL(fullUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

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
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    // `timeout: 0` means "no timeout" (caller opting out of our budget). A
    // 0-ms setTimeout would abort on the next tick — before fetch had even
    // dispatched — so only arm the timer for positive finite budgets.
    const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const timeout = hasBudget
      ? setTimeout(() => controller.abort(), timeoutMs)
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
          : JSON.stringify(body))
        : undefined;
      if (body instanceof Blob || body instanceof FormData) {
        delete headers['Content-Type'];
      } else if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
        // Only strip the default application/json for ReadableStream — caller-explicit headers are kept
        if (headers['Content-Type'] === 'application/json') {
          delete headers['Content-Type'];
        }
      }
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers,
        signal: controller.signal,
      };

      if (this.config.transport.keepAlive !== undefined) {
        fetchOptions.keepalive = this.config.transport.keepAlive;
      }

      if (bodyValue !== undefined) {
        fetchOptions.body = bodyValue;
        // Chromium requires duplex: 'half' for streaming request bodies
        if (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream) {
          (fetchOptions as any).duplex = 'half';
        }
      }

      return await fetch(url, fetchOptions);
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

        if (typeof record.code === 'string') {
          code = record.code;
        }
      } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
        message = parsed;
      }
    } catch {
      // keep default message
    }

    // Redact URL, body, and query before embedding in ApiError.
    const redactedUrl = _redactUrl(request.url);
    const apiRequest: ApiErrorRequestContext = {
      method: request.method,
      url: redactedUrl,
      ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body) } : {}),
      ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query) as Record<string, unknown> } : {}),
      ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers) } : {}),
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
    request: IHttpClientMiddlewareRequestContext
  ): ApiError {
    if (isApiError(error)) {
      return error;
    }

    const isAbortError =
      (error instanceof Error && error.name === 'AbortError')
      || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ABORT_ERR');
    const isParseError = error instanceof SyntaxError;

    const message = isAbortError
      ? `Request timed out after ${request.timeoutMs}ms`
      : (error instanceof Error ? error.message : 'Request failed');

    const code = isAbortError ? 'ABORTED' : isParseError ? 'PARSE_ERROR' : undefined;

    // Redact URL, body, and query for toApiError path too.
    const redactedUrl = _redactUrl(request.url);
    const apiRequest: ApiErrorRequestContext = {
      method: request.method,
      url: redactedUrl,
      ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body) } : {}),
      ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query) as Record<string, unknown> } : {}),
      ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers) } : {}),
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

  private shouldRetry(
    error: ApiError,
    method: string,
    retryOnStatuses: number[]
  ): boolean {
    if (error.code === 'ABORTED') {
      return false;
    }

    const idempotentMethod = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);

    // Network-level failures (status=0) may or may not have reached the
    // server. For idempotent methods retrying is safe. For POST/PATCH and
    // other non-idempotent methods the request may already have mutated state
    // — retrying can double-apply. Gate on idempotency.
    if (error.status === 0) {
      return idempotentMethod;
    }

    if (!idempotentMethod && error.status !== 429) {
      return false;
    }

    return retryOnStatuses.includes(error.status);
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
  private refreshTokenPromise: Promise<string | undefined> | null = null;
  private tryRefreshToken(error: ApiError): Promise<string | undefined> {
    if (this.refreshTokenPromise) return this.refreshTokenPromise;
    this.refreshTokenPromise = this.doRefreshToken(error).finally(() => {
      this.refreshTokenPromise = null;
    });
    return this.refreshTokenPromise;
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

  private async applyRequestMiddleware(
    initialContext: IHttpClientMiddlewareRequestContext
  ): Promise<IHttpClientMiddlewareRequestContext> {
    let context = initialContext;

    for (const middleware of this.config.middlewares) {
      if (!middleware.onRequest) continue;
      const nextContext = await middleware.onRequest(context);
      if (nextContext) {
        context = nextContext;
      }
    }

    return context;
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
      // Require the full canonical envelope shape (numeric statusCode, string
      // message, AND a `data` property) to avoid false-positives against user
      // resources that happen to have one of those field names.
      const hasStatusCode = typeof record.statusCode === 'number';
      const hasMessage = typeof record.message === 'string';
      const hasDataProp = Object.prototype.hasOwnProperty.call(record, 'data');
      const looksLikeEnvelope = hasStatusCode && hasMessage && hasDataProp;

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
