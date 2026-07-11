/**
 * docs-search-tool — the single allowlisted tool surface for `hoody chat`.
 *
 * Executes `hoody_docs_search({query})` against the Hoody docs-chatbot
 * service at `${HOODY_CHAT_DOCS_URL}` (default `https://chatbot.hoody.com/api/chat`).
 *
 * Contract:
 *   - Strict JSON arg schema: `{ query: string ≤ 2000 chars }`. Extras
 *     rejected, non-string `query` rejected — before fetch fires.
 *   - URL passes through the endpoint-accept gate (non-allowlisted origins
 *     require --accept-endpoint / env / persisted consent).
 *   - Client-side rate limit: `HOODY_CHAT_DOCS_RATE_LIMIT` req/hour (default 20).
 *   - Server `429` backoff: Retry-After honored (cap 10min), else floor 5s,
 *     double per retry, ±20% jitter, give up after 4 retries.
 *   - SSE envelope per chatbot wire format: `{text}` deltas, `{done, sources}`
 *     terminator, `{error, done}` failure.
 *   - Upstream status codes map to tool-result error codes (see below).
 *   - Result truncated at `HOODY_CHAT_DOCS_MAX_RESULT_BYTES` (default 16384)
 *     with a "…[truncated]" suffix. `sources` appended as markdown citations.
 *   - NO Origin header (CLI is not a browser; CORS is inapplicable — do NOT
 *     spoof).
 */
export type DocsSearchResult = {
    text: string;
} | {
    error: DocsErrorCode;
    message: string;
    partial?: string | undefined;
    _retryAfterSec?: number | undefined;
};
export type DocsErrorCode = 'docs-search-bad-request' | 'docs-search-timeout' | 'docs-search-rate-limited' | 'docs-search-client-rate-limit' | 'docs-search-unavailable' | 'docs-search-network' | 'docs-search-endpoint-not-accepted' | 'docs-search-failed' | 'docs-search-bad-args';
export declare const DEFAULT_DOCS_URL = "https://chatbot.hoody.com/api/chat";
export declare const DEFAULT_MAX_RESULT_BYTES = 16384;
export declare const DEFAULT_TIMEOUT_MS = 30000;
export declare const DEFAULT_FIRST_BYTE_MS = 10000;
export declare const DEFAULT_CLIENT_RATE_LIMIT = 20;
export declare const HOODY_DOCS_SEARCH_TOOL: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                query: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
    };
};
export interface ValidatedArgs {
    query: string;
}
/**
 * Validate a JSON string (as emitted by the LLM's `tool_calls[i].function.arguments`)
 * against the schema. Returns typed args on success, or a tool-result error.
 */
export declare function validateToolArgs(argsJson: string): ValidatedArgs | Extract<DocsSearchResult, {
    error: DocsErrorCode;
}>;
export declare class RollingRateLimiter {
    private limit;
    private windowMs;
    private hits;
    constructor(limit: number, windowMs?: number);
    /** Returns true if a new request is allowed under the limit. Does NOT record. */
    canProceed(now?: number): boolean;
    /** Record a successful/issued request. */
    record(now?: number): void;
    /** Returns ms until the oldest hit falls outside the window — 0 if under-cap. */
    retryAfterMs(now?: number): number;
    private prune;
}
/**
 * Compute the next sleep duration for a 429 retry.
 *
 *   attempt=0 → floor (5s, ±20% jitter)
 *   attempt=1 → floor × 2 (10s)
 *   …
 *   Clamped at BACKOFF_CEIL_MS (10min).
 *
 * Honors `retryAfterSec` if the server provides one (still clamped at ceil).
 */
export declare function computeBackoffMs(attempt: number, retryAfterSec: number | undefined, rng?: () => number): number;
export interface ExecuteDocsSearchOptions {
    query: string;
    /** Override for HOODY_CHAT_DOCS_URL. */
    url?: string | undefined;
    /** Max result size in bytes. Default 16384. */
    maxResultBytes?: number | undefined;
    /** Total timeout ms. Default 30s. */
    timeoutMs?: number | undefined;
    /** First-byte timeout. Default 10s. */
    firstByteTimeoutMs?: number | undefined;
    /** Shared across calls in the same process. Create ONE per process. */
    limiter?: RollingRateLimiter | undefined;
    /** For tests: override fetch implementation. */
    fetchImpl?: typeof fetch | undefined;
    /** For tests: skip real sleeps. */
    sleepImpl?: ((ms: number) => Promise<void>) | undefined;
    /** For tests: deterministic jitter. */
    rng?: (() => number) | undefined;
    /** Acceptance gate params. */
    acceptEndpointFlag?: string | undefined;
    acceptEndpointEnv?: string | undefined;
    isTty?: boolean | undefined;
    /** Private-mode contract: skip accept-file reads AND writes (flag/env still
     *  authorize in-memory for the turn). Mirrors run.ts's LLM-URL gate. */
    sessionOnly?: boolean | undefined;
    /** If TTY prompt is needed and this callback returns true, persist and proceed. */
    onTtyPrompt?: ((origin: string) => Promise<boolean>) | undefined;
    /** Caller-supplied abort (e.g., REPL SIGINT) — aborts the in-flight fetch. */
    signal?: AbortSignal | undefined;
}
export declare function executeDocsSearch(opts: ExecuteDocsSearchOptions): Promise<DocsSearchResult>;
