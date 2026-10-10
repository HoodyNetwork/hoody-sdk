/**
 * Wire rules the browser HttpClient shares with the generated Node client. The Node client
 * inlines the same functions, and a parity test holds the two equal.
 *
 * No Node imports: this module is in the browser bundle.
 */
/**
 * Error codes whose refusal says nothing was done (a path held by another write), so any method
 * may be sent again. The same list as RETRY_SAFE_CODES in the emitted errors.ts; it lives here as
 * well because the checked-in generated/errors.ts predates it.
 */
export const RETRY_SAFE_CODES = ['FILE_PATH_BUSY', 'PATH_BUSY'];
/** Methods the retry rule may send again after a lost connection. */
export const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];
/**
 * True when the request carries a non-empty value under the idempotency-key header its
 * operation declares (IRequestData.declaredIdempotencyKeyHeader). Header names are compared ignoring
 * case. A header the operation does not declare counts for nothing: the server would not
 * deduplicate on it.
 */
export function sendsIdempotencyKey(headers, declared) {
    if (typeof declared !== 'string' || declared.length === 0 || !headers)
        return false;
    const wanted = declared.toLowerCase();
    return Object.entries(headers).some(([name, value]) => name.toLowerCase() === wanted && typeof value === 'string' && value.trim().length > 0);
}
/**
 * The request every attempt of a keyed request sends (IRequestData.declaredIdempotencyKeyHeader): the key
 * header as the first keyed attempt dispatched it, after request middleware, and the body as it
 * went on the wire. The server deduplicates on the key and compares the body: a retry under
 * another key runs the operation a second time, and another body under the same key is refused
 * (idempotency_key_reused). So a retry sends these two, whatever request middleware does on that
 * attempt.
 *
 * The body is fixed here: bytes are copied (the caller may reuse its buffer), a Blob is
 * immutable, a string is itself, and a value the transport would JSON-encode is encoded once with
 * `encode`, the transport's own encoder, so every attempt carries the same text. Returns
 * undefined when the body cannot be sent twice byte for byte: a stream or an async iterable (read
 * once), FormData (fetch writes a new multipart boundary each time), or a value `encode` refuses.
 * Such a request is not retried. Also undefined when the request sends no key.
 *
 * `headers` are the ones applyRequestMiddleware returned, folded by case (one spelling per name,
 * the last value set), so the key found here is the only key fetch sends.
 */
export function keyedReplayOf(headers, declared, wire, encode) {
    if (typeof declared !== 'string' || declared.length === 0)
        return undefined;
    const wanted = declared.toLowerCase();
    const name = Object.keys(headers).find((key) => key.toLowerCase() === wanted && typeof headers[key] === 'string' && headers[key].trim().length > 0);
    if (name === undefined)
        return undefined;
    const value = headers[name];
    if (wire === undefined || wire === null || typeof wire === 'string')
        return { name, value, body: wire };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis;
    if (typeof g.FormData !== 'undefined' && wire instanceof g.FormData)
        return undefined;
    if (typeof g.ReadableStream !== 'undefined' && wire instanceof g.ReadableStream)
        return undefined;
    if (typeof wire[Symbol.asyncIterator] === 'function')
        return undefined;
    if (typeof g.Blob !== 'undefined' && wire instanceof g.Blob)
        return { name, value, body: wire };
    if (wire instanceof Uint8Array)
        return { name, value, body: new Uint8Array(wire) };
    if (wire instanceof ArrayBuffer)
        return { name, value, body: wire.slice(0) };
    try {
        const text = encode(wire);
        return typeof text === 'string' ? { name, value, body: text } : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * The headers of a later attempt of a keyed request: every spelling of the declared header is
 * removed and the first keyed attempt's name and value put back (keyedReplayOf).
 */
export function withKeyedReplayHeader(headers, declared, replay) {
    const wanted = declared.toLowerCase();
    const out = {};
    for (const [name, value] of Object.entries(headers))
        if (name.toLowerCase() !== wanted)
            out[name] = value;
    out[replay.name] = replay.value;
    return out;
}
/**
 * A fresh idempotency key (a random UUID). A generated POST method that declares an
 * `Idempotency-Key` header sends one per call when the caller gives none. Falls back to
 * getRandomValues where randomUUID is missing (a page served over plain http).
 */
export function newIdempotencyKey() {
    const c = globalThis.crypto;
    if (typeof c.randomUUID === 'function')
        return c.randomUUID();
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/**
 * The headers of a request that carries an idempotency key under `name`: one key per call,
 * kept across its retries. A non-blank key the caller set wins, per call or client-wide
 * (`clientHeaders`); a blank one counts as none, since the server ignores it. Otherwise the
 * call gets a fresh key.
 */
export function withIdempotencyKey(callHeaders, clientHeaders, name) {
    const lower = name.toLowerCase();
    const named = (headers) => Object.entries(headers ?? {}).filter(([header]) => header.toLowerCase() === lower);
    const isSet = (headers) => named(headers).some(([, value]) => String(value).trim() !== '');
    if (isSet(callHeaders))
        return callHeaders;
    const out = Object.fromEntries(Object.entries(callHeaders ?? {}).filter(([header]) => header.toLowerCase() !== lower));
    // Under the client's own spelling of a blank one, so the fresh key replaces it.
    if (!isSet(clientHeaders))
        out[named(clientHeaders)[0]?.[0] ?? name] = newIdempotencyKey();
    return out;
}
/**
 * The default retry policy, used when neither the request nor the client sets `retries`: up to
 * DEFAULT_RETRIES more attempts (none for a responseIsFinal request), spent as
 * shouldRetryFailure(..., byDefault = true) allows, DEFAULT_RETRY_DELAY_MS as the backoff base
 * (about 2 s, then 4 s, plus jitter) unless `retryDelayMs` is set, and at most
 * DEFAULT_RETRY_WAIT_CAP_MS of waiting in all: a wait that would pass it (a long Retry-After)
 * ends the retries instead of being cut short.
 */
export const DEFAULT_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 2000;
export const DEFAULT_RETRY_WAIT_CAP_MS = 10_000;
/**
 * A kit of a container that has just come up answers 502 BACKEND_GATEWAY_ERROR until it is
 * listening, about 10 s after the container reports `running`. Under the default policy a failure
 * isKitStarting() accepts may go again, at most KIT_STARTING_MAX_DELAY_MS apart (a Retry-After is
 * honoured as sent), within the client's `kitStartingWaitMs` of waiting in all
 * (KIT_STARTING_WAIT_MS unless set; 0 turns the wait off). Which requests may go again is still
 * shouldRetryFailure's answer: an idempotent method, never a responseIsFinal request. When the
 * wait runs out, the request fails with KIT_NOT_READY (kitNotReadyMessage).
 */
export const KIT_STARTING_MAX_DELAY_MS = 5000;
export const KIT_STARTING_WAIT_MS = 20_000;
export const KIT_NOT_READY = 'KIT_NOT_READY';
export function isKitStarting(error) {
    return error.status === 502 && error.code === 'BACKEND_GATEWAY_ERROR';
}
/** The `kitStartingWaitMs` a client runs with: KIT_STARTING_WAIT_MS when unset, else a whole number of milliseconds, 0 or more. */
export function resolveKitStartingWaitMs(value) {
    if (value === undefined)
        return KIT_STARTING_WAIT_MS;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`kitStartingWaitMs must be a number of milliseconds, 0 or more (0 turns the wait off); got ${String(value)}`);
    }
    return Math.floor(value);
}
/** How many more attempts a kit still starting may take within `waitMs`: one per KIT_STARTING_MAX_DELAY_MS, plus one. */
export function kitStartingRetries(waitMs) {
    return waitMs > 0 ? Math.ceil(waitMs / KIT_STARTING_MAX_DELAY_MS) + 1 : 0;
}
export function kitNotReadyMessage(waitedMs) {
    return `The kit did not answer within ${Math.round(waitedMs / 1000)} s; it may still be starting, stopped or not installed.`;
}
/**
 * True in a web browser's page or worker. Its fetch hides where a manual redirect leads (an
 * opaqueredirect response) and reports every network failure as a bare TypeError, so there a
 * request without credentials is left to the browser's own redirect following: "never
 * dispatched" cannot be claimed for it anyway.
 */
export function inWebBrowser() {
    const scope = globalThis;
    return (typeof scope.document === 'object' && scope.document !== null) || typeof scope.WorkerGlobalScope === 'function';
}
/** Failures of opening the connection: the request was never written, so no server ran it. */
const CONNECT_FAILURE_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'EHOSTDOWN', 'ENETUNREACH', 'ENETDOWN', 'UND_ERR_CONNECT_TIMEOUT'];
function isConnectFailure(error) {
    if (!error || typeof error !== 'object')
        return false;
    const failure = error;
    return (typeof failure.code === 'string' && CONNECT_FAILURE_CODES.includes(failure.code)) || failure.syscall === 'connect';
}
/**
 * The request never reached a server: somewhere in the cause chain the connection failed to
 * open. A host with several addresses fails as one AggregateError; it counts when every attempt
 * in it failed that way. A failure marked `afterDispatch` (a redirect hop after an answered first
 * hop, see sendConfined) never counts.
 *
 * Only a runtime whose fetch reports the cause (Node, Bun, Deno) gives an answer here. A browser's
 * fetch rejects with a bare TypeError ("Failed to fetch") for every network failure, so there this
 * is always false and the ordinary rule for a lost connection applies.
 */
export function neverDispatched(error) {
    let current = error?.cause;
    for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
        if (current.afterDispatch === true)
            return false;
        if (isConnectFailure(current))
            return true;
        const attempts = current.errors;
        if (Array.isArray(attempts) && attempts.length > 0 && attempts.every(isConnectFailure))
            return true;
        current = current.cause;
    }
    return false;
}
function isAbortError(error) {
    if (error instanceof Error && error.name === 'AbortError')
        return true;
    return typeof error === 'object' && error !== null && error.code === 'ABORT_ERR';
}
/**
 * The reason a client's deadline aborts a request with. fetch rejects with the signal's reason, so
 * toApiError can tell its own timeout from a caller abort that landed after the timer fired.
 */
const DEADLINE_REASONS = new WeakSet();
export function deadlineReason() {
    const reason = new DOMException('The operation timed out', 'AbortError');
    DEADLINE_REASONS.add(reason);
    return reason;
}
export function isDeadlineReason(error) {
    return typeof error === 'object' && error !== null && DEADLINE_REASONS.has(error);
}
/** The message of a request the caller's signal aborted, with the reason it gave (if any). */
export function callerAbortMessage(reason) {
    const detail = typeof reason === 'string' ? reason
        : reason instanceof Error && reason.name !== 'AbortError' ? reason.message
            : '';
    return detail ? `Request aborted by the caller: ${detail}` : 'Request aborted by the caller';
}
/**
 * Whether a failed attempt may be sent again. One rule, in this order:
 *   1. The caller's abort, this client's own timeout, a refused redirect and a missing fetch are final.
 *   2. A request that never reached a server (the connection could not be opened) ran
 *      nothing: any method goes again.
 *   3. A refusal whose code says nothing was done (RETRY_SAFE_CODES): any method goes again.
 *   4. A request marked responseIsFinal stops here: its handler is arbitrary code, so a status
 *      it returned is an answer, and a lost connection may have followed a run.
 *   5. Otherwise the request may have been handled. An idempotent method (GET, HEAD, OPTIONS,
 *      PUT, DELETE) goes again on a lost connection or a status in retryOnStatuses; any
 *      other method only on 429, which refuses before handling.
 * `byDefault` (nobody set `retries`): a method that is not idempotent goes again only by rule 2.
 * `keyed`: the request sends the idempotency key its server honours (the header its operation declares),
 * so any method counts as idempotent in rule 5 and under `byDefault`: a repeat is answered from the
 * server's record.
 */
export function shouldRetryFailure(error, method, retryOnStatuses, responseIsFinal = false, byDefault = false, keyed = false) {
    // The caller's abort (ABORTED) and this client's own deadline (ETIMEDOUT from its timer's
    // AbortError) are final; a body stall is ETIMEDOUT too, and goes by the rules below.
    if (error.status === 0 && error.code === 'ABORTED')
        return false;
    if (error.status === 0 && error.code === 'ETIMEDOUT' && isAbortError(error.cause))
        return false;
    if (error.code === 'REDIRECT_REFUSED')
        return false;
    // A runtime with no fetch: the same answer on every attempt.
    if (error.status === 0 && error.cause?.code === 'FETCH_UNAVAILABLE')
        return false;
    if (error.status === 0 && neverDispatched(error))
        return true;
    const idempotentMethod = keyed || IDEMPOTENT_METHODS.includes(method);
    if (byDefault && !idempotentMethod)
        return false;
    if (error.status > 0 && !responseIsFinal && typeof error.code === 'string' && RETRY_SAFE_CODES.includes(error.code))
        return true;
    if (responseIsFinal)
        return false;
    if (error.status === 0)
        return idempotentMethod;
    if (!idempotentMethod && error.status !== 429)
        return false;
    return retryOnStatuses.includes(error.status);
}
const TEXT_SUBTYPES = new Set([
    'json', 'x-ndjson', 'ndjson', 'jsonl', 'x-jsonlines', 'json-seq', 'json5',
    'xml', 'javascript', 'x-javascript', 'ecmascript', 'yaml', 'x-yaml', 'yml', 'x-yml', 'csv',
    'x-www-form-urlencoded',
]);
const TEXT_SUFFIXES = ['+json', '+xml', '+yaml'];
/**
 * True for a media type whose body is text: text/*, or one of the subtypes or structured
 * suffixes above. Matched on the exact subtype or suffix, never on a substring: `openxmlformats`
 * (.docx, .xlsx, .pptx) contains "xml" and is a zip archive.
 */
export function isTextMediaType(contentType) {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('text/'))
        return true;
    const slash = type.indexOf('/');
    if (slash === -1)
        return false;
    const subtype = type.slice(slash + 1);
    return TEXT_SUBTYPES.has(subtype) || TEXT_SUFFIXES.some((suffix) => subtype.endsWith(suffix));
}
const BYTE_FAMILIES = ['application/', 'image/', 'audio/', 'video/', 'font/'];
/**
 * True for a media type whose body is bytes: any application/* type that is not text
 * (isTextMediaType), and image/*, audio/*, video/*, font/*. Bytes are the default for
 * application/*: an Office or other vendor file (vnd.openxmlformats-*, vnd.ms-*,
 * vnd.oasis.opendocument.*) served without Content-Disposition: attachment was decoded as UTF-8
 * and corrupted. text/*, the text subtypes and a missing type are not bytes.
 */
export function isBinaryMediaType(contentType) {
    if (isTextMediaType(contentType))
        return false;
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    return BYTE_FAMILIES.some((family) => type.startsWith(family) && type.length > family.length);
}
/** An integer literal JSON.parse cannot hold exactly needs at least 16 digits. */
const LONG_DIGIT_RUN = /\d{16}/;
/**
 * JSON.parse, except that an integer literal outside the safe range becomes a bigint instead of
 * the nearest double. Fractions and exponents are numbers, as in JSON.parse. A text with no
 * 16-digit run goes straight to JSON.parse.
 *
 * The text is scanned once outside its strings; each unsafe integer is swapped for a tagged
 * string that the reviver turns into the bigint. The tag carries a per-call random part, so a
 * string of the document cannot be mistaken for one.
 */
export function parseJsonLossless(text) {
    if (!LONG_DIGIT_RUN.test(text))
        return JSON.parse(text);
    const tag = '\u0000int:' + Math.random().toString(36).slice(2) + ':';
    let out = '';
    let copied = 0;
    let swapped = false;
    const length = text.length;
    for (let i = 0; i < length;) {
        const ch = text.charCodeAt(i);
        if (ch === 0x22) {
            i += 1;
            while (i < length) {
                const inner = text.charCodeAt(i);
                if (inner === 0x5c) {
                    i += 2;
                    continue;
                }
                i += 1;
                if (inner === 0x22)
                    break;
            }
            continue;
        }
        if (ch === 0x2d || (ch >= 0x30 && ch <= 0x39)) {
            const start = i;
            if (ch === 0x2d)
                i += 1;
            while (i < length && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39)
                i += 1;
            const next = i < length ? text.charCodeAt(i) : 0;
            if (next === 0x2e || next === 0x65 || next === 0x45) {
                while (i < length) {
                    const c = text.charCodeAt(i);
                    if ((c >= 0x30 && c <= 0x39) || c === 0x2e || c === 0x65 || c === 0x45 || c === 0x2b || c === 0x2d)
                        i += 1;
                    else
                        break;
                }
                continue;
            }
            if (i - start >= 16) {
                const literal = text.slice(start, i);
                if (/^-?(0|[1-9]\d*)$/.test(literal) && !Number.isSafeInteger(Number(literal))) {
                    out += text.slice(copied, start) + JSON.stringify(tag + literal);
                    copied = i;
                    swapped = true;
                }
            }
            continue;
        }
        i += 1;
    }
    if (!swapped)
        return JSON.parse(text);
    out += text.slice(copied);
    return JSON.parse(out, (_key, value) => typeof value === 'string' && value.startsWith(tag) ? BigInt(value.slice(tag.length)) : value);
}
/**
 * JSON.stringify, except that a bigint is written as a plain integer literal instead of
 * throwing.
 */
export function stringifyJsonLossless(value) {
    const tag = '\u0000int:' + Math.random().toString(36).slice(2) + ':';
    const text = JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? tag + entry.toString() : entry);
    if (text === undefined)
        return text;
    const quoted = JSON.stringify(tag).slice(1, -1);
    return text.split('"' + quoted).map((part, index) => {
        if (index === 0)
            return part;
        const end = part.indexOf('"');
        return part.slice(0, end) + part.slice(end + 1);
    }).join('');
}
/** A JSON request body: JSON.stringify, and the lossless writer when the value holds a bigint. */
export function stringifyBody(body) {
    try {
        return JSON.stringify(body);
    }
    catch (error) {
        // JSON.stringify refuses a bigint with a TypeError; anything else (a cycle) is the caller's.
        if (error instanceof TypeError && /bigint/i.test(error.message))
            return stringifyJsonLossless(body);
        throw error;
    }
}
/**
 * Adds query pairs to the parameters a URL already carries. A key the path holds itself (a route
 * marker: `/{archive}?extract`, `/{directory}?zip`) is never sent twice: a non-empty value from
 * the caller replaces the bare marker (`?extract=src%2F`), an empty one leaves it as it is.
 * Returns false when there was nothing to add.
 */
export function mergeQueryPairs(target, pairs) {
    if (pairs.length === 0)
        return false;
    const inPath = new Set();
    for (const key of target.keys())
        inPath.add(key);
    const replaced = new Set();
    for (const [key, value] of pairs) {
        if (inPath.has(key)) {
            if (value === '')
                continue;
            if (!replaced.has(key)) {
                target.delete(key);
                replaced.add(key);
            }
        }
        target.append(key, value);
    }
    return true;
}
