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
export declare class HttpClient {
    private readonly config;
    private cache;
    private readonly ipv4DnsCache;
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
    private buildUrl;
    private isSameOriginAndPath;
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
    /**
     * Single-flight token refresh. Without this, N concurrent 401s each run
     * onTokenExpired/refreshToken independently — servers that rotate tokens
     * per refresh call see last-setToken-wins races with in-flight retries
     * stranded on stale tokens. Cache the in-flight refresh Promise so
     * siblings share one round-trip.
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
