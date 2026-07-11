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
     * response-signature metadata.
     */
    response: Response;
    data: T;
}
export interface IHttpClientMiddlewareErrorContext extends IHttpClientMiddlewareRequestContext {
    error: ApiError;
}
export interface IHttpClientMiddleware {
    onRequest?: (context: IHttpClientMiddlewareRequestContext) => IHttpClientMiddlewareRequestContext | void | Promise<IHttpClientMiddlewareRequestContext | void>;
    onResponse?: <T = unknown>(context: IHttpClientMiddlewareResponseContext<T>) => IHttpClientMiddlewareResponseContext<T> | void | Promise<IHttpClientMiddlewareResponseContext<T> | void>;
    onError?: (context: IHttpClientMiddlewareErrorContext) => void | Promise<void>;
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
        ttl?: number;
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
export declare class HttpClient {
    private readonly config;
    private cache;
    private requestCounter;
    constructor(config?: IHttpClientConfig);
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
    logout<T = unknown>(path: string, data?: IRequestData): Promise<T>;
    private parseResponseBody;
    private isJsonContentType;
    private isBinaryResponse;
    private isSameOriginAndPath;
    private buildUrl;
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
    /**
     * Single-flight token refresh. N concurrent 401s would otherwise each
     * trigger an independent `onTokenExpired` / `refreshToken` call; servers
     * that rotate per call then see last-setToken-wins races with in-flight
     * retries stranded on stale tokens. Sibling refreshes await the one
     * in-flight promise.
     */
    private refreshTokenPromise;
    private tryRefreshToken;
    private doRefreshToken;
    private applyRequestMiddleware;
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
