/**
 * HTTP fetcher with AbortController-based per-attempt timeout,
 * exponential backoff, and narrow retry classification.
 *
 * Exports:
 *   - `fetchWithRetry`: foreground / `hoody update` — up to 3 attempts, 1s/3s
 *     backoff with full jitter, bounded by a total wall-clock budget
 *   - `fetchOnce`: background refresh — single shot, 30s budget, no retry
 *
 * A server `Retry-After` (408/429/503) is honored EXACTLY (clamped to [1,60]s), not
 * jittered. Neither retries on: DNS NXDOMAIN, HTTP 401/403/404, an exhausted
 * rate-limit quota, or 2xx with a malformed body.
 */
/** Retry-After header floor (seconds). */
export declare const RETRY_AFTER_MIN_SECONDS = 1;
/** Retry-After header ceiling (seconds) — prevents server-induced long waits. */
export declare const RETRY_AFTER_MAX_SECONDS = 60;
/** Per-attempt hard timeout for `fetchWithRetry`. */
export declare const FOREGROUND_ATTEMPT_TIMEOUT_MS = 10000;
/**
 * Total wall-clock budget for `fetchWithRetry`, across ALL attempts and their
 * backoff sleeps. Without this, three attempts that each sleep on a
 * `Retry-After: 60` could stall `hoody update` for ~2 minutes — the opposite of
 * "friendly". Once the budget is spent, the loop stops and throws the last
 * error instead of starting another attempt.
 */
export declare const FOREGROUND_TOTAL_BUDGET_MS = 20000;
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
    /**
     * `x-ratelimit-remaining`, when present. GitHub's unauthenticated API allows
     * 60 requests/hour PER IP, and signals exhaustion with `403` + `remaining: 0`
     * — not `429`. Without surfacing this the caller cannot tell an exhausted
     * quota (wait until reset; retrying makes it worse) from a real
     * authorization failure.
     */
    readonly rateLimitRemaining?: number | undefined;
    /** `x-ratelimit-reset` as a UNIX epoch in SECONDS, when present. */
    readonly rateLimitResetEpochSec?: number | undefined;
    constructor(msg: string, kind: FetchError['kind'], url: string, opts?: {
        status?: number | undefined;
        errno?: string | undefined;
        retryAfterSeconds?: number | undefined;
        rateLimitRemaining?: number | undefined;
        rateLimitResetEpochSec?: number | undefined;
    });
    /**
     * True when this failure is an exhausted rate-limit quota rather than a
     * transient error. Such a failure must NOT be retried against the same
     * source — the caller should fall through to the next one.
     */
    get isRateLimited(): boolean;
}
export interface FetchedResource {
    url: string;
    body: Uint8Array;
    contentType: string | null;
    /** Response status. Always 2xx unless `followRedirect: 'manual'`. */
    status: number;
    /** `Location`, present only on a 3xx returned via `followRedirect: 'manual'`. */
    location: string | null;
}
type FetchFn = typeof fetch;
export interface FetcherOptions {
    /** Injected for tests. Default: globalThis.fetch. */
    fetch?: FetchFn | undefined;
    /** User-Agent for CDN traffic distinction. */
    userAgent?: string | undefined;
    /** AbortSignal the caller can supply (e.g. process-wide cancellation). */
    signal?: AbortSignal | undefined;
    /**
     * Redirect policy. Defaults to `'error'` — the correct behaviour for every
     * trust-chain fetch, where following a redirect would let a network attacker
     * relocate the request.
     *
     * `'manual'` is opt-in for the ONE case that needs it: reading the tag out of
     * `github.com/<o>/<r>/releases/latest`, whose entire mechanism is a 302
     * `Location`. With `'error'` the fetch throws before the header is readable,
     * so this cannot be done by inspecting the error. The caller MUST validate
     * the returned `location` before using it.
     *
     * Never change the default. This module is on the update trust chain.
     */
    followRedirect?: 'error' | 'manual' | undefined;
    /** Injected for deterministic jitter in tests. Default: Math.random. */
    random?: (() => number) | undefined;
    /** Absolute deadline (epoch ms) shared across a retry loop AND, when the
     *  oracle sets it, across ALL its sources — so total wall-clock stays bounded
     *  by one budget instead of one-per-source. Default: this call's own budget. */
    deadlineMs?: number | undefined;
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
export declare function fetchWithRetry(url: string, opts?: FetcherOptions, attempts?: number, nowFn?: () => number): Promise<FetchedResource>;
export {};
