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
import { readSseFrames } from '../ai/openai-client.js';
import { checkAcceptance } from './endpoint-accept.js';
export const DEFAULT_DOCS_URL = 'https://chatbot.hoody.com/api/chat';
export const DEFAULT_MAX_RESULT_BYTES = 16_384;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_FIRST_BYTE_MS = 10_000;
export const DEFAULT_CLIENT_RATE_LIMIT = 20; // per hour
const MAX_QUERY_CHARS = 2000; // matches chatbot server's CHATBOT_MAX_INPUT_LENGTH cap
const MAX_RETRIES_429 = 4;
const BACKOFF_FLOOR_MS = 5000;
const BACKOFF_CEIL_MS = 10 * 60_000;
const JITTER_FRAC = 0.2;
// ---------------------------------------------------------------------------
// Tool schema (sent to LLM when tool is enabled)
// ---------------------------------------------------------------------------
export const HOODY_DOCS_SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'hoody_docs_search',
        description: 'Search the official Hoody documentation for product, API, CLI, architecture, or integration questions. Returns a grounded markdown answer with citations. Use for Hoody-specific factual questions.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: "The user's question, paraphrased if needed for search relevance. One sentence is best.",
                },
            },
            required: ['query'],
            additionalProperties: false,
        },
    },
};
/**
 * Validate a JSON string (as emitted by the LLM's `tool_calls[i].function.arguments`)
 * against the schema. Returns typed args on success, or a tool-result error.
 */
export function validateToolArgs(argsJson) {
    let parsed;
    try {
        parsed = JSON.parse(argsJson);
    }
    catch {
        return {
            error: 'docs-search-bad-args',
            message: `arguments must be valid JSON; got ${argsJson.slice(0, 80)}`,
        };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { error: 'docs-search-bad-args', message: 'arguments must be an object' };
    }
    const obj = parsed;
    const extras = Object.keys(obj).filter(k => k !== 'query');
    if (extras.length > 0) {
        return {
            error: 'docs-search-bad-args',
            message: `unexpected argument(s): ${extras.join(', ')}`,
        };
    }
    if (typeof obj.query !== 'string') {
        return {
            error: 'docs-search-bad-args',
            message: `query must be a string; got ${typeof obj.query}`,
        };
    }
    if (obj.query.length > MAX_QUERY_CHARS) {
        return {
            error: 'docs-search-bad-args',
            message: `query too long (${obj.query.length} > ${MAX_QUERY_CHARS} chars)`,
        };
    }
    return { query: obj.query };
}
// ---------------------------------------------------------------------------
// Rate limiter (per-process, rolling 1-hour window)
// ---------------------------------------------------------------------------
export class RollingRateLimiter {
    limit;
    windowMs;
    hits = [];
    constructor(limit, windowMs = 3_600_000) {
        this.limit = limit;
        this.windowMs = windowMs;
    }
    /** Returns true if a new request is allowed under the limit. Does NOT record. */
    canProceed(now = Date.now()) {
        this.prune(now);
        return this.hits.length < this.limit;
    }
    /** Record a successful/issued request. */
    record(now = Date.now()) {
        this.prune(now);
        this.hits.push(now);
    }
    /** Returns ms until the oldest hit falls outside the window — 0 if under-cap. */
    retryAfterMs(now = Date.now()) {
        this.prune(now);
        if (this.hits.length < this.limit)
            return 0;
        const oldest = this.hits[0];
        return Math.max(0, this.windowMs - (now - oldest));
    }
    prune(now) {
        const cutoff = now - this.windowMs;
        while (this.hits.length > 0 && this.hits[0] < cutoff)
            this.hits.shift();
    }
}
// ---------------------------------------------------------------------------
// Exponential backoff with jitter
// ---------------------------------------------------------------------------
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
export function computeBackoffMs(attempt, retryAfterSec, rng = Math.random) {
    let base = retryAfterSec !== undefined && retryAfterSec >= 0
        ? Math.min(retryAfterSec * 1000, BACKOFF_CEIL_MS)
        : Math.min(BACKOFF_FLOOR_MS * Math.pow(2, attempt), BACKOFF_CEIL_MS);
    // ±20% jitter.
    const jitter = (rng() * 2 - 1) * JITTER_FRAC;
    base = Math.round(base * (1 + jitter));
    return Math.max(1, base);
}
export async function executeDocsSearch(opts) {
    const url = opts.url ?? process.env.HOODY_CHAT_DOCS_URL ?? DEFAULT_DOCS_URL;
    const maxBytes = opts.maxResultBytes ?? (Number(process.env.HOODY_CHAT_DOCS_MAX_RESULT_BYTES) || DEFAULT_MAX_RESULT_BYTES);
    const totalMs = opts.timeoutMs ?? (Number(process.env.HOODY_CHAT_DOCS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
    const fetchImpl = opts.fetchImpl ?? fetch;
    const sleep = opts.sleepImpl ?? defaultSleep;
    const rng = opts.rng ?? Math.random;
    const limiter = opts.limiter; // optional — caller owns lifecycle
    // 1. Acceptance gate.
    const acceptance = await checkAcceptance(url, {
        flagValue: opts.acceptEndpointFlag,
        envValue: opts.acceptEndpointEnv,
        isTty: opts.isTty,
        sessionOnly: opts.sessionOnly,
    });
    const ok = await resolveAcceptance(acceptance, opts.onTtyPrompt, opts.sessionOnly);
    if (ok.status !== 'ok') {
        return {
            error: 'docs-search-endpoint-not-accepted',
            message: 'reason' in ok && ok.reason
                ? `Docs endpoint not accepted: ${ok.reason}`
                : `Docs endpoint not accepted: ${ok.origin}`,
        };
    }
    // 2. Rate limiter (client-side, pre-request).
    if (limiter && !limiter.canProceed()) {
        const waitMs = limiter.retryAfterMs();
        const mins = Math.max(1, Math.ceil(waitMs / 60_000));
        return {
            error: 'docs-search-client-rate-limit',
            message: `Client-side rate limit reached. Try again in ~${mins} minute(s), or /tool off.`,
        };
    }
    // 3. Validate query size (arg-schema path validates upstream; @hoody.com
    //    path flows directly here, so guard).
    if (opts.query.length > MAX_QUERY_CHARS) {
        return {
            error: 'docs-search-bad-request',
            message: `query too long (${opts.query.length} > ${MAX_QUERY_CHARS} chars)`,
        };
    }
    // 4. Fetch + retry loop for 429s.
    //    Budget accounting: a user-initiated query counts as ONE limiter slot
    //    regardless of how many 429 retries it produces. Transient 5xx/network
    //    failures ALSO count as one (we issued a request; the user's intent was
    //    served best-effort). No counting on client-side validation rejects —
    //    those never hit the network.
    let attempt = 0;
    let charged = false;
    let partial;
    while (true) {
        const result = await fetchOnce(url, opts.query, maxBytes, totalMs, opts.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_MS, fetchImpl, opts.signal);
        // Charge the limiter exactly once per user query, regardless of retries.
        if (limiter && !charged) {
            limiter.record();
            charged = true;
        }
        if ('text' in result)
            return result;
        if (result.error !== 'docs-search-rate-limited' || attempt >= MAX_RETRIES_429) {
            if (result.error === 'docs-search-rate-limited' && attempt >= MAX_RETRIES_429) {
                return {
                    error: 'docs-search-rate-limited',
                    message: `Docs search is rate-limited after ${attempt + 1} retries. Try again later or rerun with --no-tools.`,
                };
            }
            if (partial && 'error' in result) {
                return { ...result, partial };
            }
            return result;
        }
        // Honor Retry-After if the server provided it.
        const waitMs = computeBackoffMs(attempt, result._retryAfterSec, rng);
        await sleep(waitMs);
        attempt++;
    }
}
async function fetchOnce(url, query, maxBytes, totalMs, firstByteMs, fetchImpl, callerSignal) {
    // Short-circuit pre-aborted caller signals before the network hits.
    if (callerSignal?.aborted) {
        return { error: 'docs-search-network', message: 'aborted by caller' };
    }
    const controller = new AbortController();
    const totalTimer = setTimeout(() => controller.abort(new Error('timeout')), totalMs);
    let firstByteTimer = setTimeout(() => controller.abort(new Error('first-byte-timeout')), firstByteMs);
    // Chain caller-supplied signal to our controller.
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal)
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    try {
        const res = await fetchImpl(url, {
            method: 'POST',
            // No Origin header — CLI is not a browser; CORS is inapplicable.
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify({ message: query, history: [] }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return mapHttpError(res.status, res.headers.get('retry-after'), body);
        }
        if (!res.body) {
            return { error: 'docs-search-network', message: 'Empty response body from docs service.' };
        }
        let text = '';
        let truncated = false;
        let sources;
        let fatal;
        let framesSeen = 0;
        for await (const frame of readSseFrames(res.body)) {
            if (firstByteTimer) {
                clearTimeout(firstByteTimer);
                firstByteTimer = undefined;
            }
            if (frame.trim() === '[DONE]')
                break; // defensive; chatbot uses {done:true}
            let payload;
            try {
                payload = JSON.parse(frame);
            }
            catch {
                continue;
            }
            framesSeen++;
            if (typeof payload.error === 'string' && payload.error) {
                fatal = payload.error;
                break;
            }
            // Once truncated, DROP subsequent text frames (they would push text
            // past maxBytes again). Keep draining frames so we still see the
            // terminal `{done:true, sources:[...]}` frame — the whole point of
            // not break-ing early is to collect citations. Without the drop,
            // appending after truncate re-inflates text past the cap.
            if (!truncated && typeof payload.text === 'string')
                text += payload.text;
            if (payload.done === true) {
                sources = Array.isArray(payload.sources) ? payload.sources : undefined;
                break;
            }
            if (!truncated && text.length > maxBytes) {
                text = text.slice(0, maxBytes) +
                    '\n…[truncated, see https://docs.hoody.com for full content]';
                truncated = true;
                // Don't break — loop until `done` or end-of-stream so sources land.
            }
        }
        if (fatal)
            return { error: 'docs-search-failed', message: fatal };
        // Empty-stream guard: only fire when literally nothing came back.
        // A sources-only reply (valid enumerate-style response with no text
        // deltas but with a sources array) is NOT an error.
        if (framesSeen === 0 || (text === '' && (!sources || sources.length === 0))) {
            return { error: 'docs-search-network', message: 'No data received from docs service.' };
        }
        let out = text;
        if (sources && sources.length > 0) {
            const list = sources
                .filter(s => s.title && s.url)
                .map(s => `- [${s.title}](${s.url})`)
                .join('\n');
            if (list)
                out += `\n\nSources:\n${list}`;
        }
        return { text: out };
    }
    catch (err) {
        const msg = err?.message ?? String(err);
        if (/first-byte-timeout/.test(msg)) {
            return { error: 'docs-search-timeout', message: 'Docs service never started streaming.' };
        }
        if (/timeout/.test(msg)) {
            return { error: 'docs-search-timeout', message: 'Docs service timed out.' };
        }
        return { error: 'docs-search-network', message: msg.slice(0, 200) };
    }
    finally {
        if (firstByteTimer)
            clearTimeout(firstByteTimer);
        clearTimeout(totalTimer);
        if (callerSignal)
            callerSignal.removeEventListener('abort', onCallerAbort);
    }
}
function mapHttpError(status, retryAfterHeader, body) {
    const snippet = body.slice(0, 200);
    if (status === 400) {
        return { error: 'docs-search-bad-request', message: `Docs server 400: ${snippet}` };
    }
    if (status === 408) {
        return { error: 'docs-search-timeout', message: 'Docs service timed out (408).' };
    }
    if (status === 413) {
        return { error: 'docs-search-bad-request', message: 'Query too long for docs service (413).' };
    }
    if (status === 429) {
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        return {
            error: 'docs-search-rate-limited',
            message: 'Docs search is rate-limited. Try again in a moment or /tool off.',
            _retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
        };
    }
    if (status === 503) {
        return { error: 'docs-search-unavailable', message: 'Docs service temporarily unavailable.' };
    }
    return { error: 'docs-search-failed', message: `Upstream HTTP ${status}: ${snippet}` };
}
async function resolveAcceptance(initial, onTtyPrompt, sessionOnly) {
    if (initial.status === 'ok')
        return initial;
    if (initial.status === 'needs-tty-prompt' && onTtyPrompt) {
        const agreed = await onTtyPrompt(initial.origin);
        if (agreed) {
            // Private mode: don't persist; return an in-memory 'ok' without touching disk.
            if (sessionOnly)
                return { status: 'ok', origin: initial.origin, reason: 'prompt' };
            const { confirmAcceptance } = await import('./endpoint-accept.js');
            return confirmAcceptance(initial.origin);
        }
        return {
            status: 'refused',
            origin: initial.origin,
            reason: 'User declined to accept the endpoint.',
        };
    }
    return initial;
}
function defaultSleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}
