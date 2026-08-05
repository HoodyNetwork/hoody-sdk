/**
 * service-client.ts — the ONLY network path of `hoody chat`.
 *
 * `hoody chat` asks Hoody's documentation assistant and renders what it says.
 * There is no local model: no API key, no provider tiers, no model/token/
 * temperature knobs. The answer is produced by the service and streamed
 * straight to the terminal.
 *
 * Wire format (`POST /api/chat`, `Accept: text/event-stream`):
 *   data: {"text":"…"}                        — content delta, may be many
 *   data: {"done":true,"sources":[{title,path,section}]}   — terminal success
 *   data: {"error":"…","done":true}           — terminal error
 *
 * `sources[]` entries are site-relative (`path`), never absolute — the browser
 * widget uses them as an href directly. A terminal cannot, so they are resolved
 * against DOCS_SITE_BASE here.
 *
 * Server-side limits this client is built against (chatbot's chat-handler.ts):
 *   message  ≤ 2000 chars   (CHATBOT_MAX_INPUT_LENGTH)
 *   history  ≤ 20 turns     (CHATBOT_MAX_HISTORY)
 *   30 requests/hour per IP, plus a global daily cap answered with 503.
 */
export type ChatErrorCode = 'rate-limited' | 'client-rate-limit' | 'timeout' | 'unavailable' | 'network' | 'endpoint-not-accepted' | 'bad-request' | 'failed';
export interface DocsSource {
    title: string;
    path: string;
    section?: string | undefined;
    /**
     * The service also sends an absolute URL. It is deliberately IGNORED: it
     * arrives from the same untrusted place as the answer, and validating it is
     * a trap — `new URL()` strips newlines and tabs when computing the origin, so
     * a value carrying an embedded newline passes an origin check and then emits
     * a second, forged citation into the rendered Sources block. `path` is the
     * one field we vet (SAFE_DOC_PATH), so the href is built only from that.
     */
    url?: string | undefined;
}
export interface Turn {
    role: 'user' | 'assistant';
    content: string;
}
export type AskResult = {
    text: string;
    sources: DocsSource[];
    truncated?: boolean;
} | {
    error: ChatErrorCode;
    message: string;
};
export declare const DEFAULT_SERVICE_URL = "https://chatbot.hoody.com/api/chat";
/**
 * Public docs site, used to turn a citation into a clickable link. The service
 * emits site-relative paths and has never emitted an absolute URL.
 */
export declare const DOCS_SITE_BASE = "https://docs.hoody.com";
/** Shown to the user when the answer hit the size cap. Never part of `text`. */
export declare const TRUNCATION_NOTICE = "\n\u2026[truncated, see https://docs.hoody.com for full content]";
export declare const DEFAULT_MAX_RESULT_BYTES = 16384;
export declare const DEFAULT_TIMEOUT_MS = 120000;
/**
 * The service emits nothing until retrieval finishes and the first non-think
 * token arrives: embedding can take 30s and the upstream connect another 30s,
 * with no keepalives in between. A tighter bound aborts work the server (and
 * the user's hourly quota) has already paid for. Kept under the server's own
 * 120s absolute ceiling.
 */
export declare const DEFAULT_FIRST_BYTE_MS = 65000;
export declare const DEFAULT_CLIENT_RATE_LIMIT = 30;
/**
 * Recorded in session metadata. There is exactly one answerer — the service —
 * so these are constants rather than user-selectable values.
 */
export declare const SERVICE_MODEL_LABEL = "hoody-docs-assistant";
export declare const SERVICE_TIER_LABEL = "hoody-service";
/** Server's own input cap. Rejected here so the user gets a clean message. */
export declare const MAX_MESSAGE_CHARS = 2000;
/** Server's own history cap. */
export declare const MAX_HISTORY_TURNS = 20;
/**
 * Byte budget for the whole `history` array. The server rejects request bodies
 * over 50 KB before reading them, and a character cap does not bound bytes:
 * 20 turns of 2000 CJK characters is ~120 KB. Budget in UTF-8 bytes, keeping
 * headroom for the message and JSON envelope.
 */
export declare const MAX_HISTORY_BYTES = 32000;
/**
 * Render citations as markdown links. Sources are UNTRUSTED (same provenance
 * as the answer), so both halves of the link are constrained: the path must be
 * a plain site-relative docs path, and the title cannot carry markdown-link
 * metacharacters or newlines that would break out of the `[…](…)`.
 */
export declare function renderSources(sources: readonly DocsSource[]): string;
/**
 * Rolling-window request counter. One instance per process, shared by the
 * one-shot path and the REPL so a single bucket bounds them both.
 */
export declare class RollingRateLimiter {
    private limit;
    private windowMs;
    private hits;
    constructor(limit: number, windowMs?: number);
    canProceed(now?: number): boolean;
    record(now?: number): void;
    retryAfterMs(now?: number): number;
    private prune;
}
/** Exponential backoff with jitter, honouring a server-sent Retry-After. */
export declare function computeBackoffMs(attempt: number, retryAfterSec?: number | undefined, rng?: () => number): number;
export interface AskOptions {
    /** The user's question. */
    message: string;
    /** Prior turns, oldest first. Trimmed to the server's cap. */
    history?: readonly Turn[] | undefined;
    /** Called for each content delta as it arrives. */
    onDelta?: ((chunk: string) => void) | undefined;
    /** Override for HOODY_CHAT_URL. */
    url?: string | undefined;
    maxResultBytes?: number | undefined;
    timeoutMs?: number | undefined;
    firstByteTimeoutMs?: number | undefined;
    limiter?: RollingRateLimiter | undefined;
    fetchImpl?: typeof fetch | undefined;
    sleepImpl?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
    rng?: (() => number) | undefined;
    acceptEndpointFlag?: string | undefined;
    acceptEndpointEnv?: string | undefined;
    isTty?: boolean | undefined;
    /** Private mode: never read or write the accept file. */
    sessionOnly?: boolean | undefined;
    onTtyPrompt?: ((origin: string) => Promise<boolean>) | undefined;
    signal?: AbortSignal | undefined;
}
/**
 * Ask the Hoody documentation assistant one question.
 *
 * Retries only ever happen BEFORE any delta reaches the caller: the sole
 * retryable condition is an HTTP 429, which the service answers with a status
 * line and no stream. A failure that arrives mid-stream is returned as-is —
 * re-issuing it would duplicate text the user has already seen.
 */
export declare function askHoody(opts: AskOptions): Promise<AskResult>;
