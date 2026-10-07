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
/**
 * Whether a failed attempt may be sent again. One rule, in this order:
 *   1. This client's own timeout or abort, a refused redirect and a missing fetch are final.
 *   2. A request that never reached a server (the connection could not be opened) ran
 *      nothing: any method goes again.
 *   3. A refusal whose code says nothing was done (RETRY_SAFE_CODES): any method goes again.
 *   4. A request marked responseIsFinal stops here: its handler is arbitrary code, so a status
 *      it returned is an answer, and a lost connection may have followed a run.
 *   5. Otherwise the request may have been handled. An idempotent method (GET, HEAD, OPTIONS,
 *      PUT, DELETE) goes again on a lost connection or a status in retryOnStatuses; any
 *      other method only on 429, which refuses before handling.
 * `byDefault` (nobody set `retries`): a method that is not idempotent goes again only by rule 2.
 */
export function shouldRetryFailure(error, method, retryOnStatuses, responseIsFinal = false, byDefault = false) {
    if (error.status === 0 && error.code === 'ABORTED')
        return false;
    if (error.code === 'REDIRECT_REFUSED')
        return false;
    // A runtime with no fetch: the same answer on every attempt.
    if (error.status === 0 && error.cause?.code === 'FETCH_UNAVAILABLE')
        return false;
    if (error.status === 0 && neverDispatched(error))
        return true;
    if (byDefault && !IDEMPOTENT_METHODS.includes(method))
        return false;
    if (error.status > 0 && !responseIsFinal && typeof error.code === 'string' && RETRY_SAFE_CODES.includes(error.code))
        return true;
    if (responseIsFinal)
        return false;
    const idempotentMethod = IDEMPOTENT_METHODS.includes(method);
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
