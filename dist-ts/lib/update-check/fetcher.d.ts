/**
 * HTTP fetcher with AbortController-based per-attempt timeout,
 * exponential backoff, and narrow retry classification.
 *
 * Exports:
 *   - `fetchWithRetry`: foreground / `hoody update` — 3 attempts, 1s+3s backoff
 *   - `fetchOnce`: background refresh — single shot, 30s budget, no retry
 *
 * Both honor `Retry-After` on HTTP 429, clamped to [1, 60] s.
 * Neither retries on: DNS NXDOMAIN, HTTP 401/403/404, 2xx with malformed body.
 */
/** Retry-After header floor (seconds). */
export declare const RETRY_AFTER_MIN_SECONDS = 1;
/** Retry-After header ceiling (seconds) — prevents server-induced long waits. */
export declare const RETRY_AFTER_MAX_SECONDS = 60;
/** Per-attempt hard timeout for `fetchWithRetry`. */
export declare const FOREGROUND_ATTEMPT_TIMEOUT_MS = 10000;
/** Single-shot timeout for `fetchOnce`. */
export declare const BACKGROUND_TOTAL_TIMEOUT_MS = 30000;
/**
 * Hard cap on response body size. channel.json is ~2 KB, .minisig is ~200 B —
 * anything beyond 256 KB is either a misconfiguration or a DoS attempt and
 * must be rejected before we allocate a huge buffer.
 */
export declare const MAX_RESPONSE_BYTES: number;
export declare class FetchError extends Error {
    /**
     * Machine-readable class:
     *   'network'         — DNS/connection/reset
     *   'http'            — non-2xx response
     *   'abort'           — per-attempt timeout fired
     *   'external-abort'  — caller-supplied AbortSignal fired (non-retryable)
     */
    readonly kind: 'network' | 'http' | 'abort' | 'external-abort';
    readonly status?: number | undefined;
    readonly errno?: string | undefined;
    readonly url: string;
    /** Retry-After value clamped to [1, 60] seconds, when the server sent one. */
    readonly retryAfterSeconds?: number | undefined;
    constructor(msg: string, kind: FetchError['kind'], url: string, opts?: {
        status?: number | undefined;
        errno?: string | undefined;
        retryAfterSeconds?: number | undefined;
    });
}
export interface FetchedResource {
    url: string;
    body: Uint8Array;
    contentType: string | null;
}
type FetchFn = typeof fetch;
export interface FetcherOptions {
    /** Injected for tests. Default: globalThis.fetch. */
    fetch?: FetchFn | undefined;
    /** User-Agent for CDN traffic distinction. */
    userAgent?: string | undefined;
    /** AbortSignal the caller can supply (e.g. process-wide cancellation). */
    signal?: AbortSignal | undefined;
}
/**
 * Fetch `url` once with a hard timeout. Throws FetchError on any failure.
 * Success: returns `{body, contentType}` with fully-drained body bytes.
 */
export declare function fetchOnce(url: string, timeoutMs: number, opts?: FetcherOptions): Promise<FetchedResource>;
/**
 * Determine if a `FetchError` is eligible for retry. Permanent failures
 * (DNS NXDOMAIN, 4xx except 408/429, abort caused by external signal) are
 * never retried.
 */
export declare function isRetryable(err: FetchError): boolean;
/** Parse a Retry-After header value. Accepts integer seconds or HTTP-date.
 *
 * Parser is now aligned with the main http-client parser
 * (integer-seconds only, matches RFC 9110 §10.2.3 delta-seconds production
 * which forbids decimals). The [RETRY_AFTER_MIN_SECONDS, RETRY_AFTER_MAX_SECONDS]
 * clamp is retained because this is a foreground-UI use case where an
 * over-eager or hostile server must not stall the CLI.
 */
export declare function parseRetryAfter(header: string | null | undefined, nowMs?: number): number | null;
/**
 * Fetch with smart retry for `hoody update` foreground use.
 *
 * 3 attempts, exponential backoff 1s + 3s, 10s per-attempt timeout.
 * Retry class: timeout, network (except NXDOMAIN), 408/429/5xx.
 * Honors Retry-After header on 429.
 */
export declare function fetchWithRetry(url: string, opts?: FetcherOptions, attempts?: number): Promise<FetchedResource>;
export {};
