/**
 * Browser-compatible HTTP Client for Hoody SDK
 *
 * Kept in lib/ (not auto-generated). Used by the browser bundle via esbuild
 * resolution of `http-client.js` imports.
 */
import { ApiError, isApiError, } from '../generated/errors.js';
/**
 * Stable 32-bit FNV-1a over a string, returned as hex. Used only to partition
 * the GET cache by caller identity — NOT a security primitive. Collisions are
 * not observable since we also key by method + URL.
 */
function hashIdentity(token) {
    if (!token)
        return '0';
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
function hashAuthHeaders(configHeaders, requestHeaders) {
    const merged = {};
    for (const src of [configHeaders, requestHeaders]) {
        if (!src)
            continue;
        for (const [k, v] of Object.entries(src))
            merged[k.toLowerCase()] = v;
    }
    // Mirror lib/redact.ts SECRET_HEADER_RE so any credential-bearing header
    // contributes to the cache partition. A narrower AUTH_KEY_RE would allow
    // cross-identity cache reuse when the only differing header was e.g.
    // `private-key`, `x-*-secret`, or `x-*-credential(s)`.
    const AUTH_KEY_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/;
    const parts = [];
    for (const k of Object.keys(merged).sort()) {
        if (AUTH_KEY_RE.test(k))
            parts.push(`${k}=${merged[k]}`);
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
function isNonReplayableBody(body) {
    if (body === undefined || body === null)
        return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis;
    if (typeof g.ReadableStream !== 'undefined' && body instanceof g.ReadableStream)
        return true;
    // AsyncIterable is also single-consumption.
    if (typeof body[Symbol.asyncIterator] === 'function')
        return true;
    return false;
}
// Cap the browser GET cache. HEAD/OPTIONS don't flush it, so in CORS-heavy
// SPAs with many unique GET URLs the cache would grow monotonically over
// the page lifetime. A simple LRU with a generous cap keeps memory bounded
// without hurting hit rates for realistic workloads.
const BROWSER_CACHE_MAX_ENTRIES = 256;
export class HttpClient {
    config;
    cache = new Map();
    requestCounter = 0;
    constructor(config = {}) {
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
        const nodeOnlyKnobs = [];
        if (transport.connections !== undefined)
            nodeOnlyKnobs.push('connections');
        if (transport.pipelining !== undefined)
            nodeOnlyKnobs.push('pipelining');
        if (transport.keepAliveTimeoutMs !== undefined)
            nodeOnlyKnobs.push('keepAliveTimeoutMs');
        if (transport.keepAliveMaxTimeoutMs !== undefined)
            nodeOnlyKnobs.push('keepAliveMaxTimeoutMs');
        if (transport.dispatcher !== undefined)
            nodeOnlyKnobs.push('dispatcher');
        if (config.forceIPv4)
            nodeOnlyKnobs.push('forceIPv4');
        if (nodeOnlyKnobs.length > 0 && typeof console !== 'undefined' && console.warn) {
            console.warn(`[HoodyClient] browser HttpClient ignores Node-only transport options: ${nodeOnlyKnobs.join(', ')}. ` +
                'These are accepted for cross-runtime config parity but have no effect in the browser.');
        }
    }
    clearCache() {
        this.cache.clear();
    }
    async close() {
        this.clearCache();
    }
    getBaseURL() {
        return this.config.baseURL;
    }
    setToken(token) {
        this.config.token = token;
    }
    use(middleware) {
        this.config.middlewares.push(middleware);
    }
    setMiddlewares(middlewares) {
        this.config.middlewares = [...middlewares];
    }
    async request(method, path, data = {}) {
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
            const entry = this.cache.get(cacheKey);
            if (Date.now() - entry.timestamp < ttl) {
                return entry.data;
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
        let lastError;
        // New Kit auth returned from `onKitAuthExpired` is stashed here and merged
        // into the next attempt's `middlewareContext.kitAuth` so proxy-auth
        // middleware applies it; simply calling the callback isn't enough because
        // the middleware otherwise keeps injecting the stale credentials and
        // 401-loops.
        let pendingKitAuthOverride = undefined;
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
            const requestContext = {
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
                const response = await this.executeRequest(middlewareRequest.method, middlewareRequest.url, middlewareRequest.headers, middlewareRequest.body, middlewareRequest.timeoutMs, data.signal);
                if (!response.ok) {
                    throw await this.buildApiErrorFromResponse(response, middlewareRequest);
                }
                const parsedResult = await this.parseResponseBody(response, responseType, upperMethod);
                const normalized = rawResponse
                    ? parsedResult
                    : this.normalizeResponseEnvelope(parsedResult, response.status, response.statusText);
                const middlewareResponse = await this.applyResponseMiddleware({
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
                        if (!oldest.done)
                            this.cache.delete(oldest.value);
                    }
                    this.cache.set(cacheKey, {
                        data: result,
                        timestamp: Date.now(),
                    });
                }
                return result;
            }
            catch (error) {
                const apiError = this.toApiError(error, middlewareRequest);
                lastError = apiError;
                try {
                    await this.applyErrorMiddleware({
                        ...middlewareRequest,
                        error: apiError,
                    });
                }
                catch {
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
                        const ns = middlewareRequest.middlewareContext._kitNamespace;
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
                    }
                    catch (cbErr) {
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
                    const retryAfterMs = apiError.retryAfterMs;
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
                    }
                    catch (cbErr) {
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
    async get(path, data = {}) {
        return this.request('GET', path, data);
    }
    async post(path, data = {}) {
        return this.request('POST', path, data);
    }
    async put(path, data = {}) {
        return this.request('PUT', path, data);
    }
    async patch(path, data = {}) {
        return this.request('PATCH', path, data);
    }
    async delete(path, data = {}) {
        return this.request('DELETE', path, data);
    }
    async head(path, data = {}) {
        return this.request('HEAD', path, data);
    }
    async options(path, data = {}) {
        return this.request('OPTIONS', path, data);
    }
    async mkcol(path, data = {}) {
        return this.request('MKCOL', path, data);
    }
    async copy(path, data = {}) {
        return this.request('COPY', path, data);
    }
    async move(path, data = {}) {
        return this.request('MOVE', path, data);
    }
    async lock(path, data = {}) {
        return this.request('LOCK', path, data);
    }
    async unlock(path, data = {}) {
        return this.request('UNLOCK', path, data);
    }
    async propfind(path, data = {}) {
        return this.request('PROPFIND', path, data);
    }
    async proppatch(path, data = {}) {
        return this.request('PROPPATCH', path, data);
    }
    async checkauth(path, data = {}) {
        return this.request('CHECKAUTH', path, data);
    }
    async logout(path, data = {}) {
        return this.request('LOGOUT', path, data);
    }
    async parseResponseBody(response, responseType = 'auto', method) {
        // HEAD and 204/205/304 responses have no body by spec; `response.json()`
        // on an empty body throws SyntaxError. Short-circuit to null so typed
        // callers can check for emptiness without try/catch. Also respects
        // `Content-Length: 0` because some fetch polyfills echo GET's content
        // length back on HEAD.
        const upperMethod = (method ?? '').toUpperCase();
        const hasNoBody = upperMethod === 'HEAD' ||
            response.status === 204 ||
            response.status === 205 ||
            response.status === 304 ||
            response.headers.get('content-length') === '0';
        if (responseType === 'json') {
            if (hasNoBody)
                return null;
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
            if (hasNoBody)
                return null;
            return response.json();
        }
        if (this.isBinaryResponse(response, contentType)) {
            return response.arrayBuffer();
        }
        return response.text();
    }
    isJsonContentType(contentType) {
        if (!contentType)
            return false;
        return contentType.toLowerCase().includes('application/json');
    }
    isBinaryResponse(response, contentType) {
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
        if (normalized.includes('json')
            || normalized.includes('xml')
            || normalized.includes('javascript')
            || normalized.includes('yaml')
            || normalized.includes('yml')
            || normalized.includes('csv')
            || normalized.includes('x-www-form-urlencoded')) {
            return false;
        }
        return (normalized.includes('application/octet-stream')
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
            || normalized.startsWith('font/'));
    }
    isSameOriginAndPath(url, baseURL) {
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
        }
        catch {
            return url.startsWith(baseURL);
        }
    }
    buildUrl(path, query) {
        const baseUrl = this.config.baseURL.replace(/\/$/, '');
        const cleanPath = path.replace(/^\//, '');
        // Empty baseURL = same-origin relative fetch (browser default). In the
        // browser, fall back to `location.origin` so `new URL()` has an authority
        // to parse. If `location` is missing (SSR / worker-lite), emit a
        // path-only URL so callers can still prepend their own base.
        if (!baseUrl) {
            const origin = typeof globalThis !== 'undefined' &&
                typeof globalThis.location?.origin === 'string'
                ? globalThis.location.origin
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
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
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
    buildUrlFromFull(fullUrl, query) {
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
    sanitizeHeaderValue(value, maxLength = 128) {
        return value
            .replace(/[^\x20-\x7E]/g, '')
            .trim()
            .slice(0, maxLength);
    }
    buildHeaders(customHeaders) {
        const headers = {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...customHeaders,
        };
        if (this.config.token) {
            headers['Authorization'] = `Bearer ${this.config.token}`;
        }
        if (this.config.clientId) {
            const v = this.sanitizeHeaderValue(this.config.clientId);
            if (v)
                headers['X-Hoody-Client-ID'] = v;
        }
        if (this.config.clientName) {
            const v = this.sanitizeHeaderValue(this.config.clientName);
            if (v)
                headers['X-Hoody-Client-Name'] = v;
        }
        return headers;
    }
    async executeRequest(method, url, headers, body, timeoutMs, externalSignal) {
        const controller = new AbortController();
        // `timeout: 0` means "no timeout" (caller opting out of our budget). A
        // 0-ms setTimeout would abort on the next tick — before fetch had even
        // dispatched — so only arm the timer for positive finite budgets.
        const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        const timeout = hasBudget
            ? setTimeout(() => controller.abort(), timeoutMs)
            : undefined;
        let externalAbortListener;
        try {
            if (externalSignal) {
                if (externalSignal.aborted) {
                    controller.abort();
                }
                else {
                    externalAbortListener = () => controller.abort();
                    externalSignal.addEventListener('abort', externalAbortListener, { once: true });
                }
            }
            const bodyValue = body !== undefined
                ? (body instanceof Blob || body instanceof FormData || typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Uint8Array || (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
                    ? body
                    : JSON.stringify(body))
                : undefined;
            if (body instanceof Blob || body instanceof FormData) {
                delete headers['Content-Type'];
            }
            else if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
                // Only strip the default application/json for ReadableStream — caller-explicit headers are kept
                if (headers['Content-Type'] === 'application/json') {
                    delete headers['Content-Type'];
                }
            }
            const fetchOptions = {
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
                    fetchOptions.duplex = 'half';
                }
            }
            return await fetch(url, fetchOptions);
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
            if (externalSignal && externalAbortListener) {
                externalSignal.removeEventListener('abort', externalAbortListener);
            }
        }
    }
    async buildApiErrorFromResponse(response, request) {
        let responseDetails = undefined;
        let message = `HTTP ${response.status}: ${response.statusText}`;
        let code;
        try {
            const parsed = await this.parseResponseBody(response);
            responseDetails = parsed;
            if (parsed && typeof parsed === 'object') {
                const record = parsed;
                if (typeof record.message === 'string') {
                    message = record.message;
                }
                else if (typeof record.error === 'string') {
                    message = record.error;
                }
                if (typeof record.code === 'string') {
                    code = record.code;
                }
            }
            else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                message = parsed;
            }
        }
        catch {
            // keep default message
        }
        // Redact URL, body, and query before embedding in ApiError.
        const redactedUrl = _redactUrl(request.url);
        const apiRequest = {
            method: request.method,
            url: redactedUrl,
            ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body) } : {}),
            ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query) } : {}),
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
            err.retryAfterMs = retryAfterMs;
        }
        return err;
    }
    toApiError(error, request) {
        if (isApiError(error)) {
            return error;
        }
        const isAbortError = (error instanceof Error && error.name === 'AbortError')
            || (typeof error === 'object' && error !== null && error.code === 'ABORT_ERR');
        const isParseError = error instanceof SyntaxError;
        const message = isAbortError
            ? `Request timed out after ${request.timeoutMs}ms`
            : (error instanceof Error ? error.message : 'Request failed');
        const code = isAbortError ? 'ABORTED' : isParseError ? 'PARSE_ERROR' : undefined;
        // Redact URL, body, and query for toApiError path too.
        const redactedUrl = _redactUrl(request.url);
        const apiRequest = {
            method: request.method,
            url: redactedUrl,
            ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body) } : {}),
            ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query) } : {}),
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
    shouldRetry(error, method, retryOnStatuses) {
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
    getRetryDelayMs(baseDelayMs, attempt, retryAfterMs) {
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
    parseRetryAfter(headers, nowMs = Date.now()) {
        if (!headers)
            return undefined;
        const raw = headers.get('retry-after');
        if (!raw)
            return undefined;
        const trimmed = raw.trim();
        if (/^\d+$/.test(trimmed)) {
            const secs = parseInt(trimmed, 10);
            if (Number.isFinite(secs) && secs >= 0)
                return secs * 1000;
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
    refreshTokenPromise = null;
    tryRefreshToken(error) {
        if (this.refreshTokenPromise)
            return this.refreshTokenPromise;
        this.refreshTokenPromise = this.doRefreshToken(error).finally(() => {
            this.refreshTokenPromise = null;
        });
        return this.refreshTokenPromise;
    }
    async doRefreshToken(error) {
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
    async applyRequestMiddleware(initialContext) {
        let context = initialContext;
        for (const middleware of this.config.middlewares) {
            if (!middleware.onRequest)
                continue;
            const nextContext = await middleware.onRequest(context);
            if (nextContext) {
                context = nextContext;
            }
        }
        return context;
    }
    async applyResponseMiddleware(initialContext) {
        let context = initialContext;
        for (const middleware of this.config.middlewares) {
            if (!middleware.onResponse)
                continue;
            const nextContext = await middleware.onResponse(context);
            if (nextContext) {
                context = nextContext;
            }
        }
        return context;
    }
    async applyErrorMiddleware(context) {
        for (const middleware of this.config.middlewares) {
            if (!middleware.onError)
                continue;
            await middleware.onError(context);
        }
    }
    async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
    nextRequestId() {
        this.requestCounter += 1;
        return `req-${Date.now()}-${this.requestCounter}`;
    }
    /**
     * Normalize all responses into a stable API envelope:
     * { statusCode, message, data }
     */
    normalizeResponseEnvelope(payload, statusCode, statusText) {
        const fallbackMessage = statusText || (statusCode >= 200 && statusCode < 300 ? 'OK' : 'Request completed');
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const record = payload;
            // Require the full canonical envelope shape (numeric statusCode, string
            // message, AND a `data` property) to avoid false-positives against user
            // resources that happen to have one of those field names.
            const hasStatusCode = typeof record.statusCode === 'number';
            const hasMessage = typeof record.message === 'string';
            const hasDataProp = Object.prototype.hasOwnProperty.call(record, 'data');
            const looksLikeEnvelope = hasStatusCode && hasMessage && hasDataProp;
            if (looksLikeEnvelope) {
                let data;
                if (Object.prototype.hasOwnProperty.call(record, 'data')) {
                    data = record.data;
                }
                else {
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
