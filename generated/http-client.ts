
/**
 * HTTP Client
 * Handles API requests with authentication, middleware, retries, and timeouts.
 */

import {
  ApiError,
  isApiError,
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
  forceIPv4?: boolean;
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
   * Enable explicit connection reuse (uses native fetch keepalive).
   */
  keepAlive?: boolean;
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
  cache?: boolean | number;
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

type RequiredHttpClientConfig = Required<Omit<IHttpClientConfig, 'middlewares' | 'transport' | 'forceIPv4Cache' | 'onKitAuthExpired'>> & {
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
  const AUTH_KEY_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/;
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
const _SECRET_HEADER_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/i;
// Extended credential key set; keep in sync with lib/redact.ts.
const _SECRET_FIELD_RE = /^(token|hdy[-_]?token|api[-_]?key|apikey|password|passwd|pwd|secret|auth|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|session[-_]?token|temp[-_]?token|kit[-_]?token|otp|code|device[-_]?code|code[-_]?verifier|code[-_]?challenge|authorization|cookie|private[-_]?key|client[-_]?secret|secret[-_]?access[-_]?key|aws[-_]?secret|ssh[-_]?pass(?:word)?|socks5[-_]?pass(?:word)?|proxy[-_]?pass(?:word)?|db[-_]?pass(?:word)?|kit[-_]?pass(?:word)?|local[-_]?pass(?:word)?|auth[-_]?pass(?:word)?|cur[-_]?pass(?:word)?|credential|credentials)$/i;
// URL autologin token value-shape; keep in sync with lib/redact.ts HDY_TOKEN_VALUE_RE.
// Scrubs an hdy_ token wherever it appears (path segment, non-secret param, or a
// secret param the field-name pass missed) so a launch token is never logged whole.
const _HDY_TOKEN_VALUE_RE = /hdy_[A-Za-z0-9_-]{20,}/g;
const _REDACT_PLACEHOLDER = '[REDACTED]';
const _REDACT_MAX_DEPTH = 6;

function _redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      _SECRET_HEADER_RE.test(k) ? [k, _REDACT_PLACEHOLDER] : [k, v],
    ),
  );
}

function _redactUrl(url: string): string {
  if (typeof url !== 'string' || url.length === 0) return url;
  try {
    const u = new URL(url);
    if (u.username) u.username = _REDACT_PLACEHOLDER;
    if (u.password) u.password = _REDACT_PLACEHOLDER;
    for (const key of Array.from(u.searchParams.keys())) {
      if (_SECRET_FIELD_RE.test(key)) u.searchParams.set(key, _REDACT_PLACEHOLDER);
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
    const parts = queryRaw.split('&').map(pair => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const k = pair.slice(0, eq);
      try {
        if (_SECRET_FIELD_RE.test(decodeURIComponent(k))) return k + '=' + encodeURIComponent(_REDACT_PLACEHOLDER);
      } catch { /* leave as-is on decode failure */ }
      return pair;
    });
    return (base + parts.join('&') + tail).replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
  }
}

function _redactSensitiveValue(v: unknown, _depth = 0, _seen: WeakSet<object> = new WeakSet()): unknown {
  if (_depth > _REDACT_MAX_DEPTH) return '[depth-limit]';
  if (v === null || v === undefined) return v;
  // Value-shape scrub for hdy_ launch tokens embedded in string values (keep in
  // sync with lib/redact.ts redactSensitiveValue).
  if (typeof v === 'string') return v.replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
  if (typeof v !== 'object') return v;
  if (_seen.has(v as object)) return '[Circular]';
  _seen.add(v as object);
  if (Array.isArray(v)) return v.map((x) => _redactSensitiveValue(x, _depth + 1, _seen));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = _SECRET_FIELD_RE.test(k) ? _REDACT_PLACEHOLDER : _redactSensitiveValue(val, _depth + 1, _seen);
  }
  return out;
}

// Cap the Node GET cache. Node has more memory than a browser tab, but an
// unbounded Map still leaks over long-running daemon processes. LRU
// eviction on insert when the cap is reached.
const _NODE_CACHE_MAX_ENTRIES = 1024;

export class HttpClient {
  private readonly config: RequiredHttpClientConfig;
  private cache: Map<string, ICacheEntry> = new Map();
  private readonly ipv4DnsCache: Map<string, IIpv4DnsCacheEntry> = new Map();
  private requestCounter = 0;

  constructor(config: IHttpClientConfig = {}) {
    const transport = config.transport || {};
    const forceIPv4Cache = config.forceIPv4Cache || {};

    this.config = {
      baseURL: config.baseURL || '',
      token: config.token || '',
      // Use ?? so explicit timeout: 0 (caller opt-out) survives the
      // constructor instead of being clobbered into 30s.
      timeout: config.timeout ?? 30000,
      retries: config.retries || 0,
      retryDelayMs: config.retryDelayMs || 250,
      retryOnStatuses: config.retryOnStatuses || [408, 425, 429, 500, 502, 503, 504],
      headers: config.headers || {},
      cache: config.cache || {},
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
    const isVerbose = this.isVerboseLoggingEnabled();
    // Kit service URLs are full URLs that don't match the API baseURL origin.
    // Never send the API JWT to Kit services — they have their own auth.
    // Treat every full-URL request as external when baseURL is empty:
    // a truthy short-circuit on this.config.baseURL would skip the same-
    // origin check, so Authorization would ride out to arbitrary hosts
    // whenever the consumer omitted baseURL from HoodyClientConfig.
    const isExternalUrl = isFullUrl && (
      !this.config.baseURL || !this.isSameOriginAndPath(url, this.config.baseURL)
    );

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
      ? (data.rawResponse === true ? 'R' : 'E') + ':' + (data.responseType || 'auto')
      : '';
    const cacheKey = `${upperMethod}:${cacheIdentity}:${cacheShape}:${url}`;
    const cacheEnabled = this.config.cache.enabled !== false;
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
    // Stash the new Kit auth returned by onKitAuthExpired so the NEXT retry
    // actually uses it. Without this the callback's return value would be
    // checked only for truthiness, the replay would re-use the expired
    // creds, and 401s would loop until the retry budget drained.
    let pendingKitAuthOverride: unknown = undefined;
    // Pre-detect non-replayable bodies so auth retries skip replay when
    // the body would be empty on retry.
    const bodyIsNonReplayable = _isNonReplayableBody(data.body);

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const headers = this.buildHeaders(data.headers);
      if (isExternalUrl) {
        delete headers['Authorization'];
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
        middlewareRequest = await this.applyRequestMiddleware(requestContext);
        if (isVerbose) {
          // Route through _redactUrl so HTTP_VERBOSE never dumps
          // tokens/apikeys/ssh_passwords in query strings or userinfo.
          console.error(`[HttpClient] ${middlewareRequest.method} ${_redactUrl(middlewareRequest.url)} (attempt ${attempt}/${retries + 1})`);
        }
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
        }

        // Match browser http-client: both status-retry and onError-retry
        // skip replay when the body is a single-consumption stream.
        if (attempt <= retries && !bodyIsNonReplayable && this.shouldRetry(apiError, upperMethod, retryOnStatuses)) {
          const retryAfterMs = (apiError as ApiError & { retryAfterMs?: number }).retryAfterMs;
          await this.sleep(this.getRetryDelayMs(retryDelayMs, attempt, retryAfterMs));
          continue;
        }

        // Invoke onError on EVERY failure (including terminal ones) so
        // observability hooks see the final outcome. shouldRetry result
        // still controls whether we actually replay; onError is
        // informational unless it returns true AND we still have retry
        // budget AND the body can be replayed.
        if (this.config.onError) {
          try {
            const shouldRetry = await this.config.onError(apiError);
            if (shouldRetry && attempt <= retries && !bodyIsNonReplayable) {
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

  async logout<T = unknown>(path: string, data: IRequestData = {}): Promise<T> {
    return this.request<T>('LOGOUT', path, data);
  }

  private async parseResponseBody(
    response: Response,
    responseType: 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob' = 'auto',
    method?: string
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

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const baseUrl = this.config.baseURL.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    const normalizedPath = cleanPath ? `/${cleanPath}` : '/';

    if (!baseUrl || !this.hasAbsoluteUrlOrigin(baseUrl)) {
      return this.appendQueryParameters(this.joinRelativeUrl(baseUrl, normalizedPath), query);
    }

    const url = new URL(`${baseUrl}${normalizedPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
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

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    if (!queryString) {
      return pathOrUrl;
    }

    const separator = pathOrUrl.includes('?') ? '&' : '?';
    return `${pathOrUrl}${separator}${queryString}`;
  }

  private isVerboseLoggingEnabled(): boolean {
    const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return processRef?.env?.HTTP_VERBOSE === 'true';
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
    externalSignal?: AbortSignal
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
          : JSON.stringify(body))
        : undefined;
      if (body instanceof Blob || body instanceof FormData) {
        delete headers['Content-Type'];
      } else if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
        // Only strip the default application/json for a stream body;
        // caller-explicit Content-Type is preserved.
        if (headers['Content-Type'] === 'application/json') {
          delete headers['Content-Type'];
        }
      }
      const useKeepAlive = this.config.transport.keepAlive;
      const requestHeaders = (!useKeepAlive && !headers['Connection'])
        ? { ...headers, Connection: 'close' }
        : headers;
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: requestHeaders,
        signal: controller.signal,
        keepalive: useKeepAlive,
      };

      if (bodyValue !== undefined) {
        fetchOptions.body = bodyValue;
        // undici / Node fetch requires duplex: 'half' for streaming
        // request bodies.
        if (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream) {
          (fetchOptions as { duplex?: string }).duplex = 'half';
        }
      }

      return await fetch(requestUrl, fetchOptions);
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

    // Redact URL + body + query in both the ApiError and its attached
    // request context. Parity with the browser http-client.
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

    const message = isAbortError
      ? `Request timed out after ${request.timeoutMs}ms`
      : (error instanceof Error ? error.message : 'Request failed');

    // Redact URL/body/query; attach PARSE_ERROR code for SyntaxError
    // (parity with the browser http-client).
    const isParseError = error instanceof SyntaxError;
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
      ...(isAbortError ? { code: 'ABORTED' } : isParseError ? { code: 'PARSE_ERROR' } : {}),
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
