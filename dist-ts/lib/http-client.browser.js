/**
 * Browser-compatible HTTP Client for Hoody SDK
 *
 * Kept in lib/ (not auto-generated). Used by the browser bundle via esbuild
 * resolution of `http-client.js` imports.
 */
import { ApiError, isApiError, refuseRetiredOptions, ValidationError, } from '../generated/errors.js';
import { SDK_VERSION } from '../generated/version.js';
import { isBinaryMediaType, DEFAULT_RETRIES, DEFAULT_RETRY_DELAY_MS, DEFAULT_RETRY_WAIT_CAP_MS, retryDelay, IDEMPOTENT_METHODS, KIT_NOT_READY, KIT_STARTING_MAX_DELAY_MS, REQUEST_REFUSED, RESPONSE_TOO_LARGE, STREAM_TOO_LARGE as _STREAM_TOO_LARGE, byteLimit, fetchCacheMode, resolveFetchCredentials, answeredWriteIsFinal, callerAbortMessage, deadlineReason, inWebBrowser, isDeadlineReason, resolveKitStartingWaitMs, isKitStarting, kitNotReadyMessage, kitStartingRetries, isTextMediaType, mergeQueryPairs, parseJsonLossless, encodedFormOf, keyedReplayOf, keyedInProgressWaitMs, keyedInProgressLimitMs, keyedAttemptTimeoutMs, keyedDeadlinePassed, neverDispatched, sleepUnlessAborted, sendsIdempotencyKey, shouldRetryFailure, stringifyBody, withKeyedReplayHeader, withIdempotencyKey, } from './http-wire.js';
// The Node client module exports these wire helpers; the browser client re-exports the shared copies.
export { isBinaryMediaType, isKitStarting, isTextMediaType, kitNotReadyMessage, kitStartingRetries, newIdempotencyKey, parseJsonLossless, resolveKitStartingWaitMs, stringifyJsonLossless, withIdempotencyKey, } from './http-wire.js';
/** Client config keys an earlier release took, each with the key that replaced it (refused by the constructor). */
const RETIRED_CLIENT_CONFIG_KEYS = [['forceIPv4', 'forceIpv4'], ['forceIPv4Cache', 'forceIpv4Cache']];
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
function hashAuthHeaders(configHeaders, requestHeaders, credentialHeaders) {
    // Headers the caller declared as credentials count whatever their name.
    const declared = new Set((credentialHeaders ?? []).map((n) => n.toLowerCase()));
    const merged = {};
    for (const src of [configHeaders, requestHeaders]) {
        if (!src)
            continue;
        for (const [k, v] of Object.entries(src))
            merged[k.toLowerCase()] = v;
    }
    // lib/redact.ts's secret-header rule, so any credential-bearing header
    // (x-*-lease included) contributes to the cache partition: two callers
    // differing only in such a header never share one cached answer.
    const parts = [];
    for (const k of Object.keys(merged).sort()) {
        if (_isSecretHeaderName(k) || declared.has(k))
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
/** The header that names the SDK version on control-plane requests (see buildHeaders). */
const _CLIENT_VERSION_HEADER = 'X-Hoody-Client-Version';
/** The request contexts a request middleware (or finalizer) refused by throwing (applyRequestMiddleware marks, request() reads). */
const _requestRefusals = new WeakSet();
/** byteLimit with this client's ValidationError, so the call shape matches the emitted Node client's `_byteLimit(name, ...values)`. */
function _byteLimit(name, ...values) {
    return byteLimit(name, (message) => { throw new ValidationError(message, name); }, ...values);
}
// Redaction helpers live in the shared ./redact module so the secret-key
// set, placeholder, depth limit, and cycle handling stay identical across
// browser, Node-generated, and CLI surfaces.
import { redactHeaders as _redactHeaders, redactUrl as _redactUrl, redactSensitiveValue as _redactSensitiveValue, isSecretHeaderName as _isSecretHeaderName, credentialQueryParamsOf as _credentialQueryParamsOf, credentialHeadersOf as _credentialHeadersOf } from './redact.js';
/**
 * Headers that carry a credential, for the credential-scope check in
 * applyRequestMiddleware(): the redaction set plus the kit computer claim under both of
 * its header spellings (X-Hoody-Computer-Claim, and the earlier X-Hoody-Container-Claim).
 * Same predicate as the Node client's, which inlines the redaction set.
 */
function _isCredentialHeader(name) {
    const lower = name.toLowerCase();
    return _isSecretHeaderName(name) || lower === 'x-hoody-computer-claim' || lower === 'x-hoody-container-claim';
}
/**
 * The body sendConfined sends on every hop of a redirect chain. A value executeRequest would
 * encode as JSON becomes that text once, so every hop that keeps the body carries the same text
 * (a toJSON() or a getter runs once). Any other body (text, bytes, a Blob, a FormData, a stream)
 * is returned as given and handed to fetch as before. Same rule as the Node client's
 * _bodyForHops.
 */
function _bodyForHops(body) {
    if (body === undefined || body === null || typeof body === 'string' || body instanceof Blob
        || body instanceof FormData || body instanceof ArrayBuffer || body instanceof Uint8Array
        || (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)) {
        return body;
    }
    return stringifyBody(body);
}
/**
 * One query value as wire text.
 *
 * A plain object or an array item that is an object is sent as JSON, never as
 * String(value): that was "[object Object]" on the wire, which hoody-browser's
 * restart({ viewport }) answered with 400 "Invalid viewport format".
 * The generated methods serialise a parameter the spec declares as deepObject
 * or form-exploded before it gets here; this is the floor for everything else.
 */
function _queryString(value) {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'object' && value !== null)
        return JSON.stringify(value);
    return String(value);
}
/**
 * The machine code of an error body: an explicit string code wins, then the
 * computers edge's errorCode (BACKEND_GATEWAY_ERROR), then a code-shaped error
 * field (the API puts its code there: TOKEN_CEILING_EXCEEDED,
 * SIGNING_NOT_CONFIGURED), then a nested error object's code. Prose in error
 * ("Bad Request", "key not found") is never promoted to a code.
 */
function _apiErrorCode(record) {
    if (typeof record.code === 'string' && record.code.length > 0)
        return record.code;
    if (typeof record.errorCode === 'string' && record.errorCode.length > 0)
        return record.errorCode;
    const error = record.error;
    if (typeof error === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(error))
        return error;
    if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
        const nested = error.code;
        if (typeof nested === 'string' && nested.length > 0)
            return nested;
    }
    return undefined;
}
/**
 * Response headers as a plain record, lower-cased names: what a HEAD request
 * returns as its data, since a HEAD answer is its headers.
 */
function _headerRecord(headers) {
    const record = {};
    headers.forEach((value, name) => {
        record[name.toLowerCase()] = value;
    });
    return record;
}
/**
 * The error code a response carries in its X-Hoody-Error-Code header, when it is
 * code-shaped. A HEAD answer has no body, so this is the only place its code can be.
 */
function _headerErrorCode(headers) {
    const value = headers.get('x-hoody-error-code');
    const code = value === null ? '' : value.trim();
    return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : undefined;
}
/**
 * One entry per header name, compared case-insensitively: the first spelling is
 * kept and the value set last wins. The same object comes back when nothing folds.
 */
function _foldHeaderCase(headers) {
    const spelling = new Map();
    const out = {};
    let folded = false;
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase();
        const first = spelling.get(lower);
        if (first === undefined) {
            spelling.set(lower, name);
            out[name] = value;
        }
        else {
            out[first] = value;
            folded = true;
        }
    }
    return folded ? out : headers;
}
function _withFoldedHeaders(context) {
    const headers = context.headers ? _foldHeaderCase(context.headers) : context.headers;
    return headers === context.headers ? context : { ...context, headers };
}
/** True when path is an absolute http(s) URL, the scheme in any case. */
function _isFullUrl(path) {
    return /^https?:[/][/]/i.test(path);
}
/**
 * The base this runtime's fetch resolves a relative URL against: the
 * document's base URL in a page, the location in a worker (its origin, when
 * that is all it carries), none elsewhere (Node's fetch refuses a relative
 * URL). Only an http(s) base counts.
 */
function _transportBase() {
    const g = globalThis;
    const candidates = [g.document ? g.document.baseURI : undefined, g.location ? g.location.href : undefined, g.location ? g.location.origin : undefined];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && /^https?:/i.test(candidate))
            return candidate;
    }
    return undefined;
}
/**
 * True when url is relative and stays on the origin of whatever base it is
 * resolved against: resolved against two unrelated bases, one per scheme, it
 * keeps each base's host. An absolute URL, a scheme-relative one, and every
 * spelling the URL parser turns into one (a backslash for a slash, a tab or
 * newline inside it, a scheme with no slashes) takes a host of its own.
 */
function _isOriginRelative(url) {
    try {
        return new URL(url, 'https://a.invalid/').host === 'a.invalid'
            && new URL(url, 'http://b.invalid/').host === 'b.invalid';
    }
    catch {
        return false;
    }
}
/**
 * The credential names a request recorded in its middlewareContext: header
 * names (_credentialHeaders) and query parameter names
 * (_credentialQueryParams), copied.
 */
function _credentialNamesOf(middlewareContext) {
    return {
        headers: _credentialHeadersOf(middlewareContext),
        params: _credentialQueryParamsOf(middlewareContext),
    };
}
/**
 * next, with every credential name recorded before a middleware step still
 * recorded after it. A step that returns a new middlewareContext without the
 * names does not make the credential ordinary: it is still confined, and
 * still redacted from an ApiError.
 */
function _carryCredentialNames(before, next) {
    const headers = _credentialHeadersOf(next.middlewareContext);
    const params = _credentialQueryParamsOf(next.middlewareContext);
    const lostHeaders = before.headers.filter((name) => !headers.includes(name));
    const lostParams = before.params.filter((name) => !params.includes(name));
    if (lostHeaders.length === 0 && lostParams.length === 0)
        return next;
    const middlewareContext = { ...(next.middlewareContext ?? {}) };
    if (lostHeaders.length > 0)
        middlewareContext._credentialHeaders = [...headers, ...lostHeaders];
    if (lostParams.length > 0)
        middlewareContext._credentialQueryParams = [...params, ...lostParams];
    return { ...next, middlewareContext };
}
/**
 * Remove every spelling of Content-Type. Header names are case-insensitive, so
 * a configured or per-request "content-type" survived a delete of
 * "Content-Type" and went out on a request with no body.
 */
function _deleteContentType(headers) {
    for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'content-type') {
            delete headers[name];
        }
    }
}
/**
 * Remove every spelling of Content-Type that still holds the default
 * application/json. A raw byte body is not JSON, but a type the caller chose
 * for it is kept.
 */
function _deleteDefaultJsonContentType(headers) {
    for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'content-type' && headers[name] === 'application/json') {
            delete headers[name];
        }
    }
}
/**
 * The body as it goes on the wire. A string the generated method marked as a
 * JSON value is JSON-encoded here, exactly once, and only when the
 * Content-Type actually being sent (after request middleware) is JSON. A
 * string sent as text (evalPost's text/plain script) or raw goes verbatim:
 * quoting it changed the program.
 */
function _wireBody(body, headers, jsonString) {
    if (jsonString !== true || typeof body !== 'string')
        return body;
    const name = Object.keys(headers).find((key) => key.toLowerCase() === 'content-type');
    return name !== undefined && isJsonContentType(String(headers[name])) ? JSON.stringify(body) : body;
}
/**
 * The headers with the body's length declared under name (the operation's
 * X-Expected-Length), read from the bytes that actually go out. Only a body
 * of bytes or a Blob has a known length here; a stream, a form or text adds
 * nothing and goes out as before. A header of that name already set, in any
 * case, is left as it is: the caller, the client's config or a middleware
 * chose it. hoody-files refuses a body that is not this long, so an upload
 * cut off on the way (some HTTP/2 clients end the body normally when aborted)
 * leaves the file as it was instead of replacing it with the part that came.
 */
function _withExpectedLength(headers, name, body) {
    if (name === undefined)
        return headers;
    const lower = name.toLowerCase();
    if (Object.keys(headers).some((key) => key.toLowerCase() === lower))
        return headers;
    const length = body instanceof Uint8Array || body instanceof ArrayBuffer ? body.byteLength
        : typeof Blob !== 'undefined' && body instanceof Blob ? body.size
            : undefined;
    return length === undefined ? headers : { ...headers, [name]: String(length) };
}
/**
 * Whether the URL a request goes out to carries any of `names` as a query parameter, with any
 * value (`?append` with none included): the x-non-idempotent `when` test, read after request
 * middleware, which may add or drop one. An unreadable URL counts as carrying them.
 */
function _carriesQuery(url, names) {
    if (names === undefined || names.length === 0)
        return false;
    let params;
    try {
        params = new URL(url, 'http://relative.invalid').searchParams;
    }
    catch {
        return true;
    }
    return names.some((name) => params.has(name));
}
/**
 * Whether a Content-Type names JSON: application/json or a structured-syntax
 * +json type (application/problem+json, application/manifest+json), parameters
 * and case aside. application/json-seq, application/jsonx, text/json and two
 * types folded into one header are not JSON: such a body is read as text.
 */
export function isJsonContentType(contentType) {
    if (!contentType)
        return false;
    const type = contentType.split(';')[0].trim().toLowerCase();
    return type === 'application/json' || /^application[/][a-z0-9_.+-]+[+]json$/.test(type);
}
/**
 * The attempt facts of an ApiError (retryAfterMs, outcome, attempts), for an error that
 * re-wraps it (KIT_NOT_READY, a renewed kit auth, an event stream's fixed text).
 */
function _attemptFactsOf(error) {
    return {
        ...(typeof error.retryAfterMs === 'number' ? { retryAfterMs: error.retryAfterMs } : {}),
        ...(error.outcome !== undefined ? { outcome: error.outcome } : {}),
        ...(typeof error.attempts === 'number' ? { attempts: error.attempts } : {}),
    };
}
/**
 * The ApiErrors this client makes inside an attempt (a refused redirect). toApiError adds the
 * attempt facts and the call's redaction names to these; an ApiError a middleware threw passes
 * through untouched.
 */
const _SDK_MADE_ERRORS = new WeakSet();
/**
 * The error readBufferedBody throws for a body over maxResponseBytes (toApiError makes it the
 * ApiError of code RESPONSE_TOO_LARGE). Fixed text and numbers only.
 */
function _responseTooLargeError(limit, read, declared) {
    return Object.assign(new Error(declared !== undefined
        ? 'The response body declares ' + declared + ' bytes, over the limit of ' + limit + ' bytes (maxResponseBytes); none of it was read'
        : 'The response body is over the limit of ' + limit + ' bytes (maxResponseBytes); reading stopped after ' + read + ' bytes'), { name: 'ResponseTooLargeError' });
}
/** A request body the step-up resend can add a field to: a plain object, not a form, a stream or an array. */
function isPlainBody(body) {
    if (typeof body !== 'object' || body === null || Array.isArray(body))
        return false;
    const proto = Object.getPrototypeOf(body);
    return proto === Object.prototype || proto === null;
}
/** A non-empty string. */
function hasText(value) {
    return typeof value === 'string' && value.length > 0;
}
/** A caller's list of names (redactBodyKeys, credentialHeaders): its non-empty strings, copied. */
function _nameList(names) {
    return Array.isArray(names) ? names.filter((n) => typeof n === 'string' && n.length > 0) : [];
}
/**
 * middlewareContext with the client's credentialHeaders recorded under _credentialHeaders, beside
 * the names already there, so confinement and redaction treat them as kitAuth's own headers.
 * Unchanged (the same object, or undefined) when the client names none.
 */
function _withCredentialHeaders(middlewareContext, names) {
    if (names.length === 0)
        return middlewareContext;
    const recorded = _credentialHeadersOf(middlewareContext);
    const missing = names.filter((name) => !recorded.some((r) => r.toLowerCase() === name.toLowerCase()));
    if (missing.length === 0)
        return middlewareContext;
    return { ...(middlewareContext ?? {}), _credentialHeaders: [...recorded, ...missing] };
}
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
/**
 * Adds `data` and `declared` to a frame (see ITypedStreamEvent). `lossless`
 * is the request's losslessIntegers: a 64-bit integer is not rounded.
 */
function _decodeStreamEvent(event, declared, lossless) {
    let data;
    let parsed = false;
    try {
        data = lossless ? parseJsonLossless(event.raw) : JSON.parse(event.raw);
        parsed = true;
    }
    catch {
        data = undefined;
    }
    return { ...event, declared: parsed && declared.has(event.event), data };
}
/** A frame's payload as a JSON object, or undefined. */
function _streamPayloadObject(raw) {
    try {
        const value = JSON.parse(raw);
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    }
    catch {
        return undefined;
    }
}
/** The turn a done or discarded frame closes: `event.data.turn_id`, else the envelope's `turn_id`. */
function _streamDoneTurn(payload) {
    const inner = payload?.['event'];
    const named = inner !== null && typeof inner === 'object' && inner.data !== null && typeof inner.data === 'object'
        ? inner.data.turn_id
        : undefined;
    if (typeof named === 'string' && named !== '')
        return named;
    const envelope = payload?.['turn_id'];
    return typeof envelope === 'string' && envelope !== '' ? envelope : undefined;
}
/**
 * The rule of IStreamTurnEnd, applied one frame at a time: returns true for
 * the frame after which the stream ends. `headerTurn` is the response's
 * header value, null when it has none.
 */
function _streamTurnTracker(rule, headerTurn) {
    let turn = headerTurn !== null && headerTurn !== '' ? headerTurn : undefined;
    // Without the header, frames before the boundary are the replay: the turns it closed wait here.
    let replay = turn === undefined && rule.boundary !== undefined;
    const closedInReplay = new Set();
    const sessionEnd = new Set(rule.sessionEnd ?? []);
    return (event) => {
        if (sessionEnd.has(event.event))
            return true;
        if (replay && event.event === rule.boundary) {
            replay = false;
            const named = _streamPayloadObject(event.raw)?.['turn_id'];
            if (typeof named !== 'string' || named === '')
                return false;
            turn = named;
            return closedInReplay.has(named);
        }
        const isDone = event.event === rule.done;
        if (!isDone && (rule.discarded === undefined || event.event !== rule.discarded))
            return false;
        const closed = _streamDoneTurn(_streamPayloadObject(event.raw));
        if (replay) {
            if (closed !== undefined)
                closedInReplay.add(closed);
            return false;
        }
        // With no turn named, only a done frame ends it: a discarded one may be another dispatch's.
        return turn === undefined ? isDone : closed === turn;
    };
}
/**
 * The frame size a stream holds when neither the call nor the client sets
 * one: 16 MiB. Without a bound a server that never ends a line, or never
 * ends a frame, grows the parser's buffer until the process runs out of
 * memory. The check runs as each chunk is parsed, so what is held at once
 * is at most this plus one read of the body.
 */
export const DEFAULT_MAX_STREAM_FRAME_BYTES = 16 * 1024 * 1024;
/**
 * The frame limit a stream uses: the call's `maxFrameBytes`, else the
 * client's `maxStreamFrameBytes`, else DEFAULT_MAX_STREAM_FRAME_BYTES. Only
 * a whole number above 0 counts: NaN, 0, a negative, a fraction, Infinity or a
 * non-number from untyped config is passed over, so a bad setting keeps a
 * bound instead of ending every stream or holding frames without limit.
 */
function resolveMaxFrameBytes(perCall, client) {
    for (const value of [perCall, client]) {
        if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
            return value;
    }
    return DEFAULT_MAX_STREAM_FRAME_BYTES;
}
/**
 * The errors an event stream raises: built here, from constants and numbers,
 * or from the server's answer to the request (an HTTP error, as the request
 * path raises it). Everything else is replaced by one of them before it
 * leaves the stream (_toStreamError).
 */
const _cleanStreamErrors = new WeakSet();
/**
 * The ApiErrors stream() built for an HTTP error answer (status 400 and up,
 * not an event stream) with buildApiErrorFromResponse: the request path's own
 * builder, redaction and body read (bounded by boundedErrorResponse).
 * _toStreamError raises these as they are.
 */
const _httpErrorAnswers = new WeakSet();
/** A fixed-text error with a fixed name (StreamClosedError, AbortError). */
function _streamError(name, message) {
    const error = new Error(message);
    error.name = name;
    _cleanStreamErrors.add(error);
    return error;
}
/**
 * What an event-stream error built after the response arrived says about the call
 * (ApiError.outcome, attempts): the server answered, and stream() sends one request per
 * opening (it never retries), so the call was sent once.
 */
const _STREAM_ANSWERED = { outcome: 'answered', attempts: 1 };
/** An ApiError built here from fixed text and numbers only (STREAM_FRAME_TOO_LARGE). */
function _cleanApiError(params) {
    const error = new ApiError(params);
    _cleanStreamErrors.add(error);
    return error;
}
/** The fixed sentence for each code an event-stream ApiError may carry. */
const _STREAM_ERROR_SENTENCES = {
    ABORTED: 'The event stream request was aborted by the caller',
    REQUEST_REFUSED: 'The event stream request was refused by a request middleware',
    ETIMEDOUT: 'The event stream request timed out',
    REDIRECT_REFUSED: 'The event stream request was redirected, and redirects are refused',
    NOT_AN_EVENT_STREAM: 'Expected an event stream, got a response of another content type',
    STREAM_HTTP_ERROR: 'The event stream request failed with an HTTP error status',
    STREAM_REQUEST_FAILED: 'The event stream request failed',
    STREAM_READ_FAILED: 'Reading the event stream failed',
};
/**
 * What an event stream raises in place of `error`.
 *
 * An HTTP error answer (status 400 and up, not an event stream) is raised as
 * the request path raises it: the ApiError stream() built for it with the
 * request path's builder (_httpErrorAnswers), so the server's code and
 * message, its parsed body on `response`, the redacted URL, method and
 * request, and Retry-After. A code-less answer gets code STREAM_HTTP_ERROR. A voice or
 * completions caller has to tell "this model does not stream" or
 * "unsupported_setting" (fix the request) from a 503 stream cap (wait), and
 * a resuming client "your cursor is too old" (HISTORY_GAP) from any other
 * refusal.
 *
 * Every other failure is replaced by fixed text: a transport exception, a
 * body error, a 2xx that is not an event stream (its body may be a job ack),
 * a refused redirect, an abort reason's message and name. Those can hold a
 * credential or a user's data the server never meant as an error message,
 * and a stream's errors reach logs, Views and models. The replacement keeps
 * what is safe to act on (a fixed code from _STREAM_ERROR_SENTENCES, the
 * status, the client-redacted URL and the method, Retry-After) with a fixed
 * sentence. The original goes only to `options.onDiagnostic`.
 */
function _toStreamError(error, acceptedStatus) {
    if (typeof error === 'object' && error !== null && _cleanStreamErrors.has(error))
        return error;
    if (isApiError(error)) {
        const status = Number.isInteger(error.status) && error.status > 0 ? error.status : 0;
        const retryAfterMs = error.retryAfterMs;
        if (_httpErrorAnswers.has(error)) {
            if (typeof error.code !== 'string')
                error.code = 'STREAM_HTTP_ERROR';
            return error;
        }
        const code = typeof error.code === 'string' && Object.prototype.hasOwnProperty.call(_STREAM_ERROR_SENTENCES, error.code)
            ? error.code
            : status > 0 ? 'STREAM_HTTP_ERROR' : 'STREAM_REQUEST_FAILED';
        const clean = new ApiError({
            message: _STREAM_ERROR_SENTENCES[code],
            status,
            code,
            ...(typeof error.url === 'string' ? { url: error.url } : {}),
            ...(typeof error.method === 'string' ? { method: error.method } : {}),
            ..._attemptFactsOf(error),
            ...(typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}),
        });
        _cleanStreamErrors.add(clean);
        return clean;
    }
    const code = acceptedStatus === undefined ? 'STREAM_REQUEST_FAILED' : 'STREAM_READ_FAILED';
    const clean = new ApiError({
        message: _STREAM_ERROR_SENTENCES[code],
        status: acceptedStatus ?? 0,
        code,
        // After accept() the server had answered; before it nothing here says whether it did.
        ...(acceptedStatus !== undefined ? _STREAM_ANSWERED : {}),
    });
    _cleanStreamErrors.add(clean);
    return clean;
}
/** A fresh parser state, holding frames of at most `maxFrameBytes` when given. */
export function createStreamFrameBuffer(maxFrameBytes) {
    const buffer = {
        pendingParts: [],
        afterCR: false,
        pendingHighSurrogate: false,
        atStart: true,
        eventName: '',
        dataLines: [],
        frameBytes: 0,
        pendingBytes: 0,
    };
    if (maxFrameBytes !== undefined)
        buffer.maxFrameBytes = maxFrameBytes;
    return buffer;
}
/** UTF-8 length of a string, without encoding it. A lone surrogate counts 3, as TextEncoder writes it. */
function utf8Length(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code < 0x80) {
            bytes += 1;
        }
        else if (code < 0x800) {
            bytes += 2;
        }
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
            bytes += 4;
            i++;
        }
        else {
            bytes += 3;
        }
    }
    return bytes;
}
/**
 * Adds one unterminated piece to the pending line and counts its bytes. A
 * surrogate pair split between two pieces was counted 3 + 3; it is 4.
 */
function holdPiece(buffer, piece) {
    if (piece.length === 0)
        return;
    let bytes = utf8Length(piece);
    if (buffer.pendingHighSurrogate && (piece.charCodeAt(0) & 0xfc00) === 0xdc00)
        bytes -= 2;
    buffer.pendingParts.push(piece);
    buffer.pendingBytes += bytes;
    // A high surrogate can only end a piece unpaired: its pair, if any, is the next piece's first unit.
    buffer.pendingHighSurrogate = (piece.charCodeAt(piece.length - 1) & 0xfc00) === 0xd800;
}
/** The pending line plus `tail`, and the pending state cleared. */
function takeLine(buffer, tail) {
    let line = tail;
    if (buffer.pendingParts.length > 0) {
        buffer.pendingParts.push(tail);
        line = buffer.pendingParts.join('');
        buffer.pendingParts = [];
    }
    buffer.pendingBytes = 0;
    buffer.pendingHighSurrogate = false;
    return line;
}
/** Ends parsing for good: past the limit nothing more is held. */
function overflowFrame(buffer, bytes) {
    buffer.overflowBytes = bytes;
    buffer.pendingParts = [];
    buffer.pendingBytes = 0;
    buffer.pendingHighSurrogate = false;
    buffer.dataLines = [];
    buffer.frameBytes = 0;
}
/** Dispatches the frame being built, when it has data, onto `events`. */
function dispatchFrame(buffer, events) {
    // A dispatch with no data line is not an event (WHATWG: an empty data
    // buffer means "return", not "fire"). An id-only or retry-only frame
    // therefore advances state without producing one.
    if (buffer.dataLines.length > 0) {
        const event = {
            event: buffer.eventName.length > 0 ? buffer.eventName : 'message',
            raw: buffer.dataLines.join('\n'),
        };
        if (buffer.id !== undefined) {
            event.id = buffer.id;
            const numeric = Number(buffer.id);
            if (buffer.id.length > 0 && Number.isInteger(numeric)) {
                event.seq = numeric;
            }
        }
        if (buffer.retry !== undefined) {
            event.retry = buffer.retry;
        }
        events.push(event);
    }
    buffer.eventName = '';
    buffer.dataLines = [];
    buffer.frameBytes = 0;
    delete buffer.id;
}
/**
 * One ended line: a blank one dispatches the frame, any other is charged
 * `breakBytes` for its line break and applied. False once the frame is over
 * the limit.
 */
function applyLine(buffer, line, breakBytes, events) {
    if (line.length === 0) {
        dispatchFrame(buffer, events);
        return true;
    }
    buffer.frameBytes += utf8Length(line) + breakBytes;
    const limit = buffer.maxFrameBytes;
    if (limit !== undefined && buffer.frameBytes > limit) {
        overflowFrame(buffer, buffer.frameBytes);
        return false;
    }
    if (line.charCodeAt(0) === 58) {
        // Comment / heartbeat.
        return true;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.charCodeAt(0) === 32) {
        value = value.slice(1);
    }
    if (field === 'event') {
        buffer.eventName = value;
    }
    else if (field === 'data') {
        buffer.dataLines.push(value);
    }
    else if (field === 'id') {
        // A NULL in an id is ignored per spec; everything else, including a
        // non-numeric id, is retained.
        if (value.indexOf(String.fromCharCode(0)) === -1) {
            buffer.id = value;
        }
    }
    else if (field === 'retry') {
        const ms = Number(value);
        if (Number.isInteger(ms) && ms >= 0) {
            buffer.retry = ms;
        }
    }
    // Unknown fields are ignored, as the spec requires.
    return true;
}
/**
 * Feed one decoded chunk in, get whole events out.
 *
 * Incremental by construction: a chunk that ends mid-event leaves the partial
 * line and the partially-built event on `buffer` and yields nothing, so a
 * frame split across any number of TCP segments is assembled rather than
 * dropped. Line endings may be LF, CRLF or bare CR and may differ between
 * lines of the same event. Only the new chunk is scanned, so the work is
 * linear in the bytes received however the server splits them, and the
 * result does not depend on where the chunks end.
 *
 * The frame limit counts the UTF-8 bytes of the frame's lines, one byte per
 * line break (a CRLF counts one), and the line still being read. It is
 * checked as each line ends and once more when the chunk is used up.
 *
 * Comment lines (a leading colon, which is how every heartbeat on the platform
 * is written) advance the stream without producing an event. A field with no
 * colon is a field with an empty value, per the spec.
 *
 * One deliberate departure from WHATWG: `id` is NOT inherited by a later frame
 * that carries none. On this platform `id` is the gateway's replay cursor, and
 * reporting a previous frame's cursor as this frame's `seq` would make a
 * consumer resume from the wrong place. The reconnection hint (`retry`) does
 * persist, because it describes the connection rather than an event.
 */
export function parseSseChunk(buffer, chunk) {
    const events = [];
    if (buffer.overflowBytes !== undefined || chunk.length === 0)
        return events;
    let text = chunk;
    if (buffer.atStart) {
        buffer.atStart = false;
        if (text.charCodeAt(0) === 0xfeff) {
            text = text.slice(1);
        }
    }
    let start = 0;
    if (buffer.afterCR && text.length > 0) {
        buffer.afterCR = false;
        if (text.charCodeAt(0) === 10)
            start = 1;
    }
    const breaks = /[\r\n]/g;
    breaks.lastIndex = start;
    for (let match = breaks.exec(text); match !== null; match = breaks.exec(text)) {
        const at = match.index;
        const line = takeLine(buffer, text.slice(start, at));
        if (text.charCodeAt(at) === 13) {
            if (at + 1 === text.length) {
                buffer.afterCR = true;
            }
            else if (text.charCodeAt(at + 1) === 10) {
                breaks.lastIndex = at + 2;
            }
        }
        start = breaks.lastIndex;
        if (!applyLine(buffer, line, 1, events))
            return events;
    }
    holdPiece(buffer, text.slice(start));
    const limit = buffer.maxFrameBytes;
    if (limit !== undefined && buffer.frameBytes + buffer.pendingBytes > limit) {
        overflowFrame(buffer, buffer.frameBytes + buffer.pendingBytes);
    }
    return events;
}
/**
 * End of the body: the frame the server ended by closing rather than with a
 * blank line is dispatched, its last line charged the bytes it had (no line
 * break arrived for it). Check `overflowBytes` afterwards: a frame over the
 * limit here is refused like any other, never dropped without a word.
 */
export function finishSseStream(buffer) {
    const events = [];
    if (buffer.overflowBytes !== undefined)
        return events;
    buffer.afterCR = false;
    if (buffer.pendingParts.length > 0) {
        if (!applyLine(buffer, takeLine(buffer, ''), 0, events))
            return events;
    }
    dispatchFrame(buffer, events);
    return events;
}
/**
 * The HTTP layer of the browser build: every generated service sends through one of these.
 * It adds the account token to requests for the API origin only, runs the request and
 * response middleware, retries what is safe to send again, and turns every failure into an
 * ApiError. Uses the global `fetch` as it is at each request, unless one was injected.
 */
export class HttpClient {
    config;
    cache = new Map();
    requestCounter = 0;
    /**
     * The INJECTED transport, or null. Kept separate from the config on purpose: with no injection the
     * client reads the runtime's CURRENT global fetch at every request (browsers and test harnesses swap
     * it after construction), while an injected one is retained and can never be swapped from outside.
     */
    fetchImpl;
    /**
     * The transport options the CALLER passed, or null. `config.transport` holds them with every
     * default filled in, so a derivation that copied it handed each child a full set of Node-only
     * knobs the caller never set, and every box client warned that they are ignored.
     */
    configuredTransport;
    /**
     * Every `config` field is optional: the timeout defaults to 30 s (`0` means none) and the GET
     * cache is off. An option name an earlier release used throws, naming its replacement.
     * Node-only transport options are accepted and ignored, with one console warning.
     */
    constructor(config = {}) {
        // The keys an earlier release took (spelled with an all-caps acronym): refused by name, never dropped.
        refuseRetiredOptions(config, 'HttpClient', RETIRED_CLIENT_CONFIG_KEYS);
        this.fetchImpl = config.fetch ?? null;
        this.configuredTransport = config.transport ? { ...config.transport } : null;
        const transport = config.transport || {};
        const forceIpv4Cache = config.forceIpv4Cache || {};
        this.#finalizers = config.finalizers ? [...config.finalizers] : [];
        this.config = {
            baseURL: config.baseURL || '',
            token: config.token || '',
            // `??` (not `||`) so `timeout: 0` survives — callers use 0 to mean
            // "no timeout, rely on upstream"; `||` would silently promote it to 30s.
            timeout: config.timeout ?? 30000,
            ...(config.retries !== undefined ? { retries: config.retries } : {}),
            ...(config.retryDelayMs ? { retryDelayMs: config.retryDelayMs } : {}),
            kitStartingWaitMs: resolveKitStartingWaitMs(config.kitStartingWaitMs),
            retryOnStatuses: config.retryOnStatuses || [408, 425, 429, 500, 502, 503, 504],
            headers: config.headers || {},
            cache: config.cache || {},
            captureRawBody: config.captureRawBody === true,
            maxStreamFrameBytes: resolveMaxFrameBytes(config.maxStreamFrameBytes),
            ...(typeof config.onStreamDiagnostic === 'function' ? { onStreamDiagnostic: config.onStreamDiagnostic } : {}),
            transport: {
                keepAlive: transport.keepAlive ?? false,
                connections: transport.connections ?? 128,
                pipelining: transport.pipelining ?? 1,
                keepAliveTimeoutMs: transport.keepAliveTimeoutMs ?? 10000,
                keepAliveMaxTimeoutMs: transport.keepAliveMaxTimeoutMs ?? 60000,
                dispatcher: transport.dispatcher,
            },
            forceIpv4: false,
            forceIpv4Cache: {
                enabled: forceIpv4Cache.enabled !== false,
                ttlMs: forceIpv4Cache.ttlMs ?? 60000,
            },
            middlewares: config.middlewares ? [...config.middlewares] : [],
            onError: config.onError || (async () => false),
            onTokenExpired: config.onTokenExpired || (async () => undefined),
            refreshToken: config.refreshToken || (async () => undefined),
            acceptRefreshedToken: config.acceptRefreshedToken || (() => true),
            sessionMark: config.sessionMark || (() => undefined),
            autoRetryAuth: config.autoRetryAuth !== false,
            keyedInProgressWait: config.keyedInProgressWait !== false,
            redactBodyKeys: _nameList(config.redactBodyKeys),
            credentialHeaders: _nameList(config.credentialHeaders),
            clientId: config.clientId || '',
            clientName: config.clientName || '',
            target: config.target === 'kit' ? 'kit' : 'account',
            // Store the onKitAuthExpired callback so the retry path can invoke
            // it on Kit 401s. Conditionally spread to keep the callback optional
            // in the resolved config shape.
            ...(config.onKitAuthExpired ? { onKitAuthExpired: config.onKitAuthExpired } : {}),
            ...(typeof config.onStepUp === 'function' ? { onStepUp: config.onStepUp } : {}),
            // fetch options, validated here so a typo is ignored rather than thrown by fetch on every request.
            ...(typeof config.fetchCredentials === 'string' || (typeof config.fetchCredentials === 'object' && config.fetchCredentials !== null)
                ? { fetchCredentials: typeof config.fetchCredentials === 'string' ? config.fetchCredentials : { ...config.fetchCredentials } }
                : {}),
            ...(fetchCacheMode(config.fetchCache) !== undefined ? { fetchCache: fetchCacheMode(config.fetchCache) } : {}),
            ...(_byteLimit('maxResponseBytes', config.maxResponseBytes) !== undefined ? { maxResponseBytes: _byteLimit('maxResponseBytes', config.maxResponseBytes) } : {}),
            ...(_byteLimit('maxStreamBytes', config.maxStreamBytes) !== undefined ? { maxStreamBytes: _byteLimit('maxStreamBytes', config.maxStreamBytes) } : {}),
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
        if (config.forceIpv4)
            nodeOnlyKnobs.push('forceIpv4');
        if (nodeOnlyKnobs.length > 0 && typeof console !== 'undefined' && console.warn) {
            console.warn(`[HoodyClient] browser HttpClient ignores Node-only transport options: ${nodeOnlyKnobs.join(', ')}. ` +
                'These are accepted for cross-runtime config parity but have no effect in the browser.');
        }
    }
    /** The transport this client will use — lets a caller assert the injection took effect. */
    getFetch() {
        if (this.fetchImpl !== null)
            return this.fetchImpl;
        const globalFetch = globalThis.fetch;
        // FETCH_UNAVAILABLE: the same answer on every attempt, so shouldRetry treats it as final.
        if (globalFetch === undefined)
            throw Object.assign(new Error('No fetch implementation available in this runtime. Pass one explicitly: new HttpClient({ fetch: myFetch }).'), { code: 'FETCH_UNAVAILABLE' });
        return globalFetch;
    }
    /**
     * The transport the CALLER injected, or `undefined` when none was.
     *
     * The one accessor every derivation uses (`withRealm`, `withComputer`, the realm-error
     * introspection client). It exists because the two HTTP implementations store the injection
     * differently — Node resolves it into `config.fetch`, the browser keeps it out of `config` on
     * purpose — so a derivation that reads `config.fetch` (an earlier version did) silently drops the injection in
     * the BROWSER build.
     *
     * Distinct from `getFetch()`: this one never reports the global. Carrying the global into a
     * derived client would bind it at derivation time and defeat the late-binding the browser
     * client deliberately keeps for the un-injected case.
     */
    getInjectedFetch() {
        return this.fetchImpl ?? undefined;
    }
    /**
     * The transport options the CALLER passed, or `undefined` when none were.
     *
     * What every derivation (`withRealm`, `withComputer`, the realm-error introspection client)
     * copies. Never the normalised `config.transport`: that one carries the defaults, and a child
     * built from it reports Node-only knobs as caller-set (the browser warns once per client).
     */
    getConfiguredTransport() {
        return this.configuredTransport === null ? undefined : { ...this.configuredTransport };
    }
    /** Drop every cached GET answer. */
    clearCache() {
        this.cache.clear();
    }
    /** Release what the client holds. In a browser that is only the GET cache; there are no connections to close. */
    async close() {
        this.clearCache();
    }
    /** The API base URL relative paths are joined onto (`''` when none was set). */
    getBaseURL() {
        return this.config.baseURL;
    }
    /** Replace the account token later requests to the API origin are sent with. */
    setToken(token) {
        this.config.token = token;
    }
    /** Add `middleware` after the ones already installed. */
    use(middleware) {
        this.config.middlewares.push(middleware);
    }
    /** Replace the whole middleware list with a copy of `middlewares`. */
    setMiddlewares(middlewares) {
        this.config.middlewares = [...middlewares];
    }
    /**
     * Send one request and resolve with its parsed answer: the response envelope, or the body
     * alone with `data.rawResponse`. A HEAD resolves with the response headers. `path` is joined
     * onto the base URL unless it is a full URL; a full URL of another origin (a kit) never gets
     * the account token.
     *
     * Rejects with an ApiError for a non-2xx answer, a network failure, a timeout or an abort,
     * after the retries the policy allows. Any method other than GET, HEAD and OPTIONS empties
     * the GET cache.
     */
    async request(method, path, data = {}) {
        if (data.idempotencyKeyHeader !== undefined) {
            data = { ...data, headers: withIdempotencyKey(data.headers, this.config.headers, data.idempotencyKeyHeader) };
        }
        // An invalid byte limit is an error whether or not a cached answer would have been returned.
        _byteLimit('maxResponseBytes', data.maxResponseBytes, this.config.maxResponseBytes);
        const upperMethod = method.toUpperCase();
        const isFullUrl = _isFullUrl(path);
        const url = isFullUrl
            ? this.buildUrlFromFull(path, data.query)
            : this.buildUrl(path, data.query);
        // Kit service URLs are full URLs that don't match the API baseURL
        // origin. Never send the API JWT to Kit services — they have their own
        // auth. An empty baseURL must treat every full URL as external,
        // otherwise the Authorization header would leak cross-origin.
        // Judged on the built URL wherever it resolves (isExternalDestination), so
        // a path spelled //elsewhere, joined onto the page's origin, is elsewhere.
        const isExternalUrl = this.isExternalDestination(isFullUrl, url);
        // Cache identity partitioning: the cache key (made after request middleware, in the attempt
        // loop) includes a hash of the token and every credential header the request goes out with,
        // so token rotation / cross-identity reuse of a single HttpClient cannot serve a response
        // baked to a different identity.
        const isGet = upperMethod === 'GET';
        // Cache key must also disambiguate envelope vs. raw body and response
        // parser (json/text/arrayBuffer/blob): a GET with `rawResponse:true`
        // followed by the same GET without it would otherwise cross-pollute shapes.
        const cacheShape = isGet
            ? (data.rawResponse === true ? 'R' : 'E') + ':' + (data.responseType || 'auto') + (data.losslessIntegers === true ? ':L' : '') + (data.bodyAsData === true ? ':B' : '')
            : '';
        // Opt-in. A default-on cache answered repeated state reads and state-
        // changing kit GETs from memory for five seconds.
        const cacheEnabled = this.config.cache.enabled === true;
        // Never for a GET to another origin than the API (a kit host); checked again after middleware.
        const requestCache = isExternalUrl ? false : data.cache !== undefined ? data.cache : cacheEnabled;
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
        // Nobody set retries: the default policy (DEFAULT_RETRIES, see IHttpClientConfig.retries).
        const explicitRetries = data.retries ?? this.config.retries;
        const retryByDefault = explicitRetries === undefined;
        const retries = Math.max(0, explicitRetries ?? (data.responseIsFinal === true ? 0 : DEFAULT_RETRIES));
        // A kit still starting may take more attempts than `retries` (decided per failure below).
        const kitStartingWaitMs = this.config.kitStartingWaitMs;
        const attemptBudget = retryByDefault ? Math.max(retries, kitStartingRetries(kitStartingWaitMs)) : retries;
        const requestedTimeoutMs = data.timeoutMs ?? this.config.timeout;
        // A deadline below the call's floor (timeoutFloorMs) is raised to it; 0 (none) stays none.
        const timeoutMs = typeof data.timeoutFloorMs === 'number' && Number.isFinite(data.timeoutFloorMs) && requestedTimeoutMs > 0
            ? Math.max(requestedTimeoutMs, data.timeoutFloorMs)
            : requestedTimeoutMs;
        const retryDelayMs = data.retryDelayMs ?? this.config.retryDelayMs ?? (retryByDefault ? DEFAULT_RETRY_DELAY_MS : 250);
        // The keyed in-progress waits (keyedInProgressWaitMs): counted from here, against timeoutMs.
        const callStartedAt = Date.now();
        let keyedInProgressWaitedMs = 0;
        // Set by the first in-progress wait: the call's deadline, which every later attempt shares.
        let keyedDeadlineAt;
        let retryWaitedMs = 0;
        const retryOnStatuses = data.retryOnStatuses ?? this.config.retryOnStatuses;
        const authRetryEnabled = data.authRetry ?? this.config.autoRetryAuth;
        const rawResponse = data.rawResponse === true;
        const responseType = data.responseType || 'auto';
        let authRetried = false;
        let kitAuthRetried = false;
        // The step-up resend (onStepUp) is spent at most once per call.
        let stepUpTried = false;
        // Set once a step-up code has been added to the request: that resend's answer is the call's answer (below).
        let stepUpSent = false;
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
        // A keyed request's key and wire body as its first keyed attempt sent them; every later
        // attempt sends exactly these (keyedReplayOf). keyedUnreplayable: it sent a key with a body
        // that cannot go out twice byte for byte, so it is not retried.
        let keyedReplay;
        let keyedUnreplayable = false;
        const keyHeader = data.declaredIdempotencyKeyHeader ?? data.idempotencyKeyHeader;
        // How many times this call has sent the request (ApiError.attempts), and the body keys its
        // errors redact beyond the default names (redactBodyKeys).
        let sends = 0;
        // The outcome of the last failed attempt that may have reached a server (ApiError.outcome).
        let mayHaveRun;
        const bodyKeys = this.bodyRedactionKeys(data);
        // The keyed in-progress poll (below): the call's choice, else the client's.
        const keyedInProgressWait = data.keyedInProgressWait ?? this.config.keyedInProgressWait;
        // The most bytes the response body may have (maxResponseBytes): the call's, else the client's.
        const maxResponseBytes = _byteLimit('maxResponseBytes', data.maxResponseBytes, this.config.maxResponseBytes);
        // The session the call is made in (sessionMark).
        const callMark = this.config.sessionMark();
        for (let attempt = 1; attempt <= attemptBudget + 1; attempt++) {
            // No attempt after the first starts once the session moved on: its token would be the next
            // session's, possibly another account's. The error in hand is the answer.
            if (lastError !== undefined && !Object.is(this.config.sessionMark(), callMark))
                throw lastError;
            // The token this attempt goes out with: a 401 is about THIS token, which may no longer be
            // the client's by the time the answer arrives.
            const tokenSent = this.config.token;
            const headers = this.buildHeaders(data.headers, isExternalUrl);
            // Whose header it is is decided here, before any middleware can change the header maps it is read from.
            const sdkAddedVersion = this.addsClientVersion(data.headers, isExternalUrl);
            if (isExternalUrl) {
                // Every spelling: a lower-case authorization survived the exact-case
                // delete. The caller's own per-request Authorization is put back.
                this.deleteAuthorization(headers, data.headers);
            }
            // No body, nothing to describe: the default JSON content type on an
            // empty DELETE or POST is refused by servers that parse by the type
            // (Fastify answers 400). Parity with stream() and prepareUpgrade(). Every
            // spelling: a caller-set lower-case content-type survived the exact-case
            // delete.
            if (data.body === undefined) {
                _deleteContentType(headers);
            }
            // Merge a per-retry kitAuth override if the caller supplied one via
            // onKitAuthExpired. Local clone so we never mutate the caller's object.
            // The client's credentialHeaders are recorded in it as kitAuth records its own.
            const mergedMiddlewareContext = _withCredentialHeaders((data.middlewareContext || pendingKitAuthOverride !== undefined)
                ? { ...(data.middlewareContext ?? {}), ...(pendingKitAuthOverride !== undefined ? { kitAuth: pendingKitAuthOverride } : {}) }
                : undefined, this.config.credentialHeaders);
            const requestContext = {
                requestId: this.nextRequestId(),
                attempt,
                method: upperMethod,
                path,
                url,
                headers,
                timeoutMs: keyedAttemptTimeoutMs(timeoutMs, keyedDeadlineAt, Date.now()),
                retries,
                ...(data.query !== undefined ? { query: data.query } : {}),
                ...(data.body !== undefined ? { body: data.body } : {}),
                ...(mergedMiddlewareContext !== undefined ? { middlewareContext: mergedMiddlewareContext } : {}),
            };
            let middlewareRequest = requestContext;
            // Set once this attempt has an answer: a failure after it (reading the body, a response
            // middleware) is never "the request did not go out", whatever its cause says.
            let answered = false;
            // Set once that answer has a 2xx status: a failure after it, whatever its status, is final
            // for an unkeyed change (answeredWriteIsFinal). An error status says the change failed.
            let answeredOk = false;
            // Set once this attempt is handed to fetch with a live signal: a failure before it (a
            // request middleware, an abort) provably sent nothing (ApiError.outcome).
            let dispatched = false;
            // Set when a request middleware (or a finalizer) threw: that is its refusal, final (REQUEST_REFUSED).
            let refused = false;
            try {
                // A later attempt of a call the caller aborted (its retry wait ended on the abort) is not
                // sent: the abort is the answer, ABORTED, not the earlier error. Checked again
                // after the request middleware, before the keyed deadline would answer with that error.
                if (lastError !== undefined && data.signal?.aborted === true)
                    throw data.signal.reason;
                middlewareRequest = await this.applyRequestMiddleware(requestContext, data.routeTag);
                // A middleware that moved a control-plane request to a kit host: the version header stays behind.
                middlewareRequest = this.withoutMovedClientVersion(middlewareRequest, url, sdkAddedVersion);
                // The GET cache is read and written under the request as middleware left it: a middleware
                // may move it to a kit host (never cached) or set its credentials, which key the entry.
                // The method the middleware left is the one sent: a GET it turned into another method is
                // neither read from nor written to the GET cache, and empties it as any change does.
                const sentMethod = middlewareRequest.method.toUpperCase();
                if (isNonMutating && sentMethod !== 'GET' && sentMethod !== 'HEAD' && sentMethod !== 'OPTIONS')
                    this.clearCache();
                // One reading of the fetch options, from the context the middleware left: the entry is keyed
                // with the credentials mode this attempt is sent with.
                const fetchExtras = this.fetchExtrasFor(data, middlewareRequest.method, middlewareRequest.middlewareContext);
                const cacheKey = isGet && sentMethod === 'GET' && requestCache && this.credentialScope(middlewareRequest.url) === 'api'
                    // The fetch credentials mode too: an answer fetched with the browser's cookies is not one
                    // fetched without them.
                    ? `${sentMethod}:${hashIdentity((tokenSent ?? '') + '|' + hashAuthHeaders(middlewareRequest.headers, undefined, this.config.credentialHeaders))}:${fetchExtras?.credentials ?? ''}:${cacheShape}:${middlewareRequest.url}`
                    : undefined;
                if (cacheKey !== undefined && this.cache.has(cacheKey)) {
                    const entry = this.cache.get(cacheKey);
                    if (Date.now() - entry.timestamp < ttl) {
                        return entry.data;
                    }
                    this.cache.delete(cacheKey);
                }
                // x-non-idempotent `when`: judged on the URL this attempt goes out to, after middleware.
                if (data.responseIsFinal !== true && _carriesQuery(middlewareRequest.url, data.nonIdempotentQuery)) {
                    data = { ...data, responseIsFinal: true };
                }
                let wire = _wireBody(middlewareRequest.body, middlewareRequest.headers, data.jsonStringBody);
                if (keyedReplay !== undefined) {
                    middlewareRequest = { ...middlewareRequest, headers: withKeyedReplayHeader(middlewareRequest.headers, keyHeader, keyedReplay) };
                    wire = keyedReplay.body;
                }
                else if (!keyedUnreplayable && sendsIdempotencyKey(middlewareRequest.headers, keyHeader)) {
                    // A form goes out as bytes encoded once, under their boundary (encodedFormOf).
                    const form = await encodedFormOf(wire);
                    keyedReplay = keyedReplayOf(middlewareRequest.headers, keyHeader, form?.body ?? wire, stringifyBody, form?.contentType);
                    if (keyedReplay === undefined)
                        keyedUnreplayable = true;
                    else {
                        wire = keyedReplay.body;
                        if (keyedReplay.contentType !== undefined) {
                            middlewareRequest = { ...middlewareRequest, headers: withKeyedReplayHeader(middlewareRequest.headers, keyHeader, keyedReplay) };
                        }
                    }
                }
                // The length of the body this attempt sends, after middleware (see _withExpectedLength);
                // none for a form, encoded or not.
                if (data.expectedLengthHeader !== undefined) {
                    middlewareRequest = { ...middlewareRequest, headers: _withExpectedLength(middlewareRequest.headers, data.expectedLengthHeader, keyedReplay?.contentType !== undefined ? undefined : wire) };
                }
                // Past the deadline the in-progress waits fixed: nothing more is sent, and what is sent gets
                // only what is left of it. Both after the middleware, which may itself have taken time.
                if (lastError !== undefined && data.signal?.aborted === true)
                    throw data.signal.reason;
                if (keyedDeadlinePassed(keyedDeadlineAt, Date.now()) && lastError !== undefined)
                    throw lastError;
                if (keyedDeadlineAt !== undefined) {
                    middlewareRequest = { ...middlewareRequest, timeoutMs: keyedAttemptTimeoutMs(middlewareRequest.timeoutMs, keyedDeadlineAt, Date.now()) };
                }
                const startedAt = Date.now();
                // fetch rejects an already-aborted signal before it sends anything.
                if (data.signal?.aborted !== true) {
                    dispatched = true;
                    sends += 1;
                }
                const received = await this.sendConfined(middlewareRequest.method, middlewareRequest.url, middlewareRequest.headers, wire, middlewareRequest.timeoutMs, data.signal, data.redirect, middlewareRequest.middlewareContext, 
                // Follow redirects here, where a failure after an answered hop is marked, whenever
                // "never dispatched" would send the request again where shouldRetry otherwise would
                // not. Not in a web browser (see inWebBrowser).
                (data.responseIsFinal === true || !IDEMPOTENT_METHODS.includes(middlewareRequest.method.toUpperCase()))
                    && !inWebBrowser(), fetchExtras);
                answered = true;
                answeredOk = received.ok;
                // The body is read inside the caller's signal and the timeout; the
                // transport lets go of both once the headers are in.
                const chunks = await this.readBufferedBody(received, data.signal, middlewareRequest.timeoutMs, startedAt, maxResponseBytes);
                const response = this.replayResponse(received, chunks);
                if (!response.ok) {
                    throw await this.buildApiErrorFromResponse(response, middlewareRequest, { attempts: sends, bodyKeys });
                }
                // A HEAD answer is its headers (size, modification time, ETag); the
                // body parser can only say null.
                const parsedResult = upperMethod === 'HEAD' && responseType === 'auto'
                    ? _headerRecord(response.headers)
                    : await this.parseResponseBody(response, responseType, upperMethod, data.losslessIntegers === true);
                const normalized = rawResponse
                    ? parsedResult
                    : this.normalizeResponseEnvelope(parsedResult, response.status, response.statusText, data.bodyAsData === true);
                const middlewareResponse = await this.applyResponseMiddleware({
                    ...middlewareRequest,
                    response: this.replayResponse(received, chunks),
                    data: normalized,
                    ...((data.captureRawBody ?? this.config.captureRawBody) ? { rawBody: this.joinChunks(chunks) } : {}),
                });
                const result = middlewareResponse.data;
                if (cacheKey !== undefined) {
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
                // A refusal by request middleware is the call's answer, never a failure to retry: running
                // the middleware again would only ask it the same question (unless the caller aborted).
                // applyRequestMiddleware marks the request it refused (_requestRefusals); it is read here, not in a try of its own
                // around the call, so a request middleware failure stays inside this block with the send.
                refused = _requestRefusals.has(requestContext) && data.signal?.aborted !== true;
                // No replay of any kind follows a refusal, or the answer to a step-up resend (it carries the one-time code).
                const noReplay = refused || stepUpSent;
                let apiError = refused
                    ? this.requestRefusedError(error, middlewareRequest, { attempts: sends, bodyKeys, mayHaveRun })
                    : this.toApiError(error, middlewareRequest, data.signal, { answered, dispatched, attempts: sends, bodyKeys, mayHaveRun });
                lastError = apiError;
                if (apiError.outcome === 'answered' || apiError.outcome === 'unknown')
                    mayHaveRun = apiError.outcome;
                try {
                    await this.applyErrorMiddleware({
                        ...middlewareRequest,
                        error: apiError,
                    });
                }
                catch {
                    // Middleware errors must not mask the original API error
                }
                // Every decision below reads the request as it was dispatched: a request middleware may
                // have sent it to another destination (an API path to a kit host, whose 401 is the
                // script's answer, not the account token's), with another method (a GET made a POST
                // that ran) or with another body (one that cannot be sent twice).
                const sentMethod = middlewareRequest.method.toUpperCase();
                const sentExternal = middlewareRequest.url === url
                    ? isExternalUrl
                    : this.isExternalDestination(_isFullUrl(middlewareRequest.url), middlewareRequest.url);
                const sentNonReplayable = bodyIsNonReplayable || keyedUnreplayable || isNonReplayableBody(middlewareRequest.body);
                const sentKeyed = sendsIdempotencyKey(middlewareRequest.headers, keyHeader);
                // The ways back into this loop, and what each does with responseIsFinal:
                //   a. 401, API scope, token already replaced  -> replay once, same session only (below)
                //   b. 401, API scope, token refreshed         -> replay once (below)
                //   c. 401, kit host, onKitAuthExpired         -> replay once; NOT for responseIsFinal
                //   d. shouldRetry(): status, network, RETRY_SAFE_CODES -> honours responseIsFinal itself
                //   e. onError returned true                   -> refused when responseIsFinal
                // a and b replay a responseIsFinal request on purpose: the API's auth layer answers
                // the 401 before any handler runs. Each happens at most once per call, and only with a
                // NEW token in hand. c does not: on a kit host the 401 may be the script's own answer,
                // given after it did its work, so the renewed auth is stored (onKitAuthExpired ran) and
                // the 401 goes back to the caller, who decides whether to send the request again.
                // Same rule as the generated Node client.
                // A 401 a response middleware threw after a 2xx answer is not the server refusing the
                // token: the change was made, so neither auth branch sends it again (answeredWriteIsFinal).
                const answeredFinal = answeredWriteIsFinal(sentMethod, answeredOk, sentKeyed);
                // A call whose session has since been replaced or ended (sessionMark) is neither replayed
                // nor refreshed: the token now in hand is the other session's, possibly another account's.
                // Its 401 is the answer.
                const sameSession = Object.is(this.config.sessionMark(), callMark);
                // On a kit client every request goes to a kit: like c, its 401 may come after the work was
                // done, so a responseIsFinal request is not replayed there either.
                const kitAnswerIsFinal = this.config.target === 'kit' && data.responseIsFinal === true;
                if (authRetryEnabled && !authRetried && !noReplay && apiError.status === 401 && !sentExternal && !kitAnswerIsFinal && !sentNonReplayable && !answeredFinal && sameSession) {
                    // The token that was refused has already been replaced: a sibling request's refresh
                    // landed while this one was in flight. Replay with the current token; refreshing again
                    // would spend a second refresh call (and, on a server that rotates the refresh token,
                    // invalidate the pair the sibling just stored).
                    if (typeof tokenSent === 'string' && tokenSent.length > 0
                        && typeof this.config.token === 'string' && this.config.token.length > 0
                        && this.config.token !== tokenSent) {
                        authRetried = true;
                        attempt -= 1;
                        continue;
                    }
                    const refreshedToken = await this.tryRefreshToken(apiError);
                    // A refresh that ended after the session changed brought back the old session's token.
                    if (refreshedToken && Object.is(this.config.sessionMark(), callMark) && this.config.acceptRefreshedToken(refreshedToken)) {
                        this.setToken(refreshedToken);
                        authRetried = true;
                        // Do not consume retry budget for auth recovery replay.
                        attempt -= 1;
                        continue;
                    }
                }
                let renewedNotReplayed;
                if (!kitAuthRetried && !noReplay && apiError.status === 401 && sentExternal
                    && middlewareRequest.middlewareContext?._kitNamespace
                    && this.config.onKitAuthExpired
                    && !sentNonReplayable && !answeredFinal) {
                    try {
                        const ns = middlewareRequest.middlewareContext._kitNamespace;
                        const newAuth = await this.config.onKitAuthExpired(ns, apiError);
                        if (newAuth && data.responseIsFinal === true) {
                            renewedNotReplayed = new ApiError({
                                message: apiError.message + ' (kit auth was renewed; the request was not repeated because it may have run)',
                                status: apiError.status,
                                ...(apiError.code !== undefined ? { code: apiError.code } : {}),
                                ...(apiError.url !== undefined ? { url: apiError.url } : {}),
                                ...(apiError.method !== undefined ? { method: apiError.method } : {}),
                                ...(apiError.request !== undefined ? { request: apiError.request } : {}),
                                response: apiError.response,
                                cause: apiError,
                                ..._attemptFactsOf(apiError),
                            });
                        }
                        else if (newAuth) {
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
                    if (renewedNotReplayed)
                        throw renewedNotReplayed;
                }
                // Two-factor step-up (onStepUp): the server refused before it changed anything, so the same
                // request goes once more with the code the hook returns, merged into the body. No retry spent.
                // A 400 a response middleware threw after a 2xx is not that refusal: the change was made.
                if (!stepUpTried && !noReplay && this.config.onStepUp && data.stepUpField !== undefined
                    && apiError.status === 400 && apiError.code === 'OTP_REQUIRED'
                    && !sentExternal && !sentNonReplayable && !sentKeyed && !answeredFinal
                    && isPlainBody(data.body) && !hasText(data.body[data.stepUpField])) {
                    stepUpTried = true;
                    let otp;
                    try {
                        otp = await this.config.onStepUp(apiError);
                    }
                    catch (cbErr) {
                        // The hook handles the one-time code: its error text could hold it, so only the error name is logged.
                        console.error('[HttpClient] onStepUp callback failed:', cbErr instanceof Error ? cbErr.name : 'non-Error');
                    }
                    if (typeof otp === 'string' && otp.length > 0) {
                        data = { ...data, body: { ...data.body, [data.stepUpField]: otp } };
                        stepUpSent = true;
                        attempt -= 1;
                        continue;
                    }
                }
                // The server is still running this key's first request: ask again after its Retry-After
                // with the same key and body (keyedReplay); the answer is the first request's. No retry spent.
                // Never for a request that must not go twice. An abort ends the wait (at once if it came
                // first), and the next attempt fails as an aborted request does.
                if (keyedInProgressWait && keyedReplay !== undefined && sentKeyed && !sentNonReplayable && !noReplay && data.responseIsFinal !== true) {
                    const pollMs = keyedInProgressWaitMs(apiError, apiError.retryAfterMs, Math.max(Date.now() - callStartedAt, keyedInProgressWaitedMs), timeoutMs);
                    if (pollMs !== undefined) {
                        keyedInProgressWaitedMs += pollMs;
                        if (keyedDeadlineAt === undefined)
                            keyedDeadlineAt = callStartedAt + keyedInProgressLimitMs(timeoutMs);
                        await this.sleep(pollMs, data.signal);
                        attempt -= 1;
                        continue;
                    }
                }
                // Don't retry when the body is a single-consumption stream
                // (ReadableStream / AsyncIterable). The first fetch() drained it,
                // so a replay would send an empty body to the server → silent data
                // loss on idempotent PUT/DELETE uploads. Surface the error now.
                // A kit still starting gets the longer default budget (kitStartingWaitMs, lib/http-wire.ts).
                const kitStarting = retryByDefault && kitStartingWaitMs > 0 && data.responseIsFinal !== true && !noReplay && isKitStarting(apiError);
                if (!noReplay && attempt <= (kitStarting ? attemptBudget : retries) && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, data.responseIsFinal === true, retryByDefault, sentKeyed, answered, answeredOk)) {
                    const retryAfterMs = apiError.retryAfterMs;
                    let delayMs = this.getRetryDelayMs(retryDelayMs, attempt, retryAfterMs);
                    if (delayMs !== undefined && kitStarting && retryAfterMs === undefined)
                        delayMs = Math.min(delayMs, KIT_STARTING_MAX_DELAY_MS);
                    // The default policy waits at most DEFAULT_RETRY_WAIT_CAP_MS in all, and no policy waits
                    // more than MAX_RETRY_DELAY_MS at once (delayMs undefined). A wait past either (a long
                    // Retry-After) ends the retries: sending sooner than the server asked is not honouring it.
                    // An abort ends this wait, and the hook's below, at once: the next attempt then fails as
                    // an aborted request does, before anything is sent.
                    if (delayMs !== undefined
                        && (!retryByDefault || retryWaitedMs + delayMs <= (kitStarting ? kitStartingWaitMs : DEFAULT_RETRY_WAIT_CAP_MS))
                        && !keyedDeadlinePassed(keyedDeadlineAt, Date.now(), delayMs)) {
                        retryWaitedMs += delayMs;
                        await this.sleep(delayMs, data.signal);
                        continue;
                    }
                }
                // The kit-starting wait ran out on a request it covered: say so, with a code to match.
                if (kitStarting && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, false, true, sentKeyed, answered, answeredOk)) {
                    apiError = new ApiError({
                        message: kitNotReadyMessage(retryWaitedMs),
                        status: apiError.status,
                        code: KIT_NOT_READY,
                        ...(apiError.url !== undefined ? { url: apiError.url } : {}),
                        ...(apiError.method !== undefined ? { method: apiError.method } : {}),
                        ...(apiError.request !== undefined ? { request: apiError.request } : {}),
                        response: apiError.response,
                        cause: apiError,
                        ..._attemptFactsOf(apiError),
                    });
                }
                // Invoke onError on every failure that gets here, terminal ones
                // included — hiding the hook from exactly the errors consumers care
                // about most would defeat observability. A failure resent above, and a
                // call that ends during its wait, do not get here (see the onError doc).
                // `shouldRetry` still controls actual replays;
                // onError is informational unless it returns true AND retry budget
                // remains.
                if (this.config.onError) {
                    try {
                        const shouldRetry = await this.config.onError(apiError);
                        // Same stream-safety guard: do not replay a consumed body. The hook asks; it does
                        // not overrule responseIsFinal (a hook that returns true for every error ran an
                        // exec script twice on its 500).
                        // Nor does it spend the default budget: before the default policy there was none.
                        // A caller's abort is never replayed: its signal stays aborted.
                        const callerAborted = apiError.status === 0 && apiError.code === 'ABORTED';
                        // The hook's retry honours the server's Retry-After too.
                        const hookDelayMs = this.getRetryDelayMs(retryDelayMs, attempt, apiError.retryAfterMs);
                        // Nor does it replay a change the server answered with success (answeredWriteIsFinal).
                        if (shouldRetry && attempt <= retries && !sentNonReplayable && !noReplay && apiError.code !== RESPONSE_TOO_LARGE && data.responseIsFinal !== true && !retryByDefault && !callerAborted
                            && !answeredWriteIsFinal(sentMethod, answeredOk, sentKeyed)
                            && hookDelayMs !== undefined && !keyedDeadlinePassed(keyedDeadlineAt, Date.now(), hookDelayMs)) {
                            await this.sleep(hookDelayMs, data.signal);
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
    /** {@link request} with method `GET`. */
    async get(path, data = {}) {
        return this.request('GET', path, data);
    }
    /** {@link request} with method `POST`. */
    async post(path, data = {}) {
        return this.request('POST', path, data);
    }
    /** {@link request} with method `PUT`. */
    async put(path, data = {}) {
        return this.request('PUT', path, data);
    }
    /** {@link request} with method `PATCH`. */
    async patch(path, data = {}) {
        return this.request('PATCH', path, data);
    }
    /** {@link request} with method `DELETE`. */
    async delete(path, data = {}) {
        return this.request('DELETE', path, data);
    }
    /** {@link request} with method `HEAD`. Resolves with the response headers. */
    async head(path, data = {}) {
        return this.request('HEAD', path, data);
    }
    /** {@link request} with method `OPTIONS`. */
    async options(path, data = {}) {
        return this.request('OPTIONS', path, data);
    }
    /** {@link request} with method `MKCOL` (WebDAV: create a folder). */
    async mkcol(path, data = {}) {
        return this.request('MKCOL', path, data);
    }
    /** {@link request} with method `COPY` (WebDAV). */
    async copy(path, data = {}) {
        return this.request('COPY', path, data);
    }
    /** {@link request} with method `MOVE` (WebDAV). */
    async move(path, data = {}) {
        return this.request('MOVE', path, data);
    }
    /** {@link request} with method `LOCK` (WebDAV). */
    async lock(path, data = {}) {
        return this.request('LOCK', path, data);
    }
    /** {@link request} with method `UNLOCK` (WebDAV). */
    async unlock(path, data = {}) {
        return this.request('UNLOCK', path, data);
    }
    /** {@link request} with method `PROPFIND` (WebDAV: read properties). */
    async propfind(path, data = {}) {
        return this.request('PROPFIND', path, data);
    }
    /** {@link request} with method `PROPPATCH` (WebDAV: change properties). */
    async proppatch(path, data = {}) {
        return this.request('PROPPATCH', path, data);
    }
    /** {@link request} with method `CHECKAUTH`. */
    async checkauth(path, data = {}) {
        return this.request('CHECKAUTH', path, data);
    }
    /**
     * Streaming seam — issue one request through the SAME injected transport,
     * URL builder and header/auth policy as request(), and hand back the raw
     * Response with its body UNDRAINED so the caller can read response.body
     * incrementally (SSE, chunked NDJSON, large downloads).
     *
     * Deliberately outside the retry / cache / envelope machinery: a stream is
     * consumed once, so replaying it is not meaningful and normalising it would
     * force a full buffer. A non-2xx response IS read here (at most 64 KiB,
     * bounded by the caller's signal and the timeout) and raised as an ApiError,
     * so callers only ever receive a readable stream.
     *
     * Cancellation is the caller's data.signal, and it keeps working after the
     * headers arrive: aborting then cancels the body and makes a pending read
     * reject. data.timeoutMs bounds the time to RESPONSE HEADERS only, never
     * the lifetime of the stream — pass timeoutMs: 0 to opt out of the header
     * budget entirely.
     *
     * Request middleware runs exactly as it does for request(): kit credentials
     * (kitAuth on withComputer()) are injected by middleware, so a stream that
     * skipped it reached a permission-guarded kit with no credentials. Error
     * middleware sees a non-2xx. Response middleware does not run: it receives
     * a parsed body, and a stream has none to give it.
     */
    async stream(method, path, data = {}) {
        const upperMethod = method.toUpperCase();
        const isFullUrl = _isFullUrl(path);
        const url = isFullUrl
            ? this.buildUrlFromFull(path, data.query)
            : this.buildUrl(path, data.query);
        const isExternalUrl = this.isExternalDestination(isFullUrl, url);
        const headers = this.buildHeaders(data.headers, isExternalUrl);
        // Whose header it is is decided here, before any middleware can change the header maps it is read from.
        const sdkAddedVersion = this.addsClientVersion(data.headers, isExternalUrl);
        if (isExternalUrl) {
            this.deleteAuthorization(headers, data.headers);
        }
        // A GET/HEAD stream has no body; the default JSON content type would be
        // a lie on the wire.
        if (data.body === undefined) {
            _deleteContentType(headers);
        }
        const requestedTimeoutMs = data.timeoutMs ?? this.config.timeout;
        // A deadline below the call's floor (timeoutFloorMs) is raised to it; 0 (none) stays none.
        const timeoutMs = typeof data.timeoutFloorMs === 'number' && Number.isFinite(data.timeoutFloorMs) && requestedTimeoutMs > 0
            ? Math.max(requestedTimeoutMs, data.timeoutFloorMs)
            : requestedTimeoutMs;
        const streamContext = _withCredentialHeaders(data.middlewareContext, this.config.credentialHeaders);
        const initialContext = {
            requestId: this.nextRequestId(),
            attempt: 1,
            method: upperMethod,
            path,
            url,
            headers,
            timeoutMs,
            retries: 0,
            ...(data.query !== undefined ? { query: data.query } : {}),
            ...(data.body !== undefined ? { body: data.body } : {}),
            ...(streamContext !== undefined ? { middlewareContext: streamContext } : {}),
        };
        // Opening the stream fails the way request() fails: a throwing request
        // middleware, a transport error, a refused connection or the header
        // timeout reaches the caller as an ApiError (status 0, redacted request
        // context, the original on cause), after error middleware saw it. It
        // escaped as a raw TypeError before, so an isApiError() catch that handled
        // the same failure on a plain GET missed it on a stream.
        let requestContext = initialContext;
        let response;
        // As in request(): whether the stream's one attempt was handed to fetch, and the body keys
        // its errors redact.
        let dispatched = false;
        const bodyKeys = this.bodyRedactionKeys(data);
        try {
            requestContext = this.withoutMovedClientVersion(await this.applyRequestMiddleware(initialContext, data.routeTag), url, sdkAddedVersion);
            const wire = _wireBody(requestContext.body, requestContext.headers, data.jsonStringBody);
            // The length of the body that goes out, after middleware (see _withExpectedLength).
            if (data.expectedLengthHeader !== undefined) {
                requestContext = { ...requestContext, headers: _withExpectedLength(requestContext.headers, data.expectedLengthHeader, wire) };
            }
            if (data.signal?.aborted !== true)
                dispatched = true;
            response = await this.sendConfined(requestContext.method, requestContext.url, requestContext.headers, wire, requestContext.timeoutMs, data.signal, data.redirect, requestContext.middlewareContext, false, this.fetchExtrasFor(data, requestContext.method));
        }
        catch (error) {
            // A request middleware that threw refused the stream (REQUEST_REFUSED), as it refuses request(); the
            // caller's abort keeps its own error.
            const streamRefused = _requestRefusals.has(initialContext) && data.signal?.aborted !== true;
            const openError = streamRefused
                ? this.requestRefusedError(error, requestContext, { attempts: 0, bodyKeys })
                : this.toApiError(error, requestContext, data.signal, { dispatched, attempts: dispatched ? 1 : 0, bodyKeys });
            try {
                await this.applyErrorMiddleware({ ...requestContext, error: openError });
            }
            catch {
                // Middleware errors must not mask the original error
            }
            throw openError;
        }
        if (!response.ok) {
            // Bounded: an error body that never ends used to hang here past both
            // the abort and the timeout, and error middleware never ran.
            const errorResponse = await this.boundedErrorResponse(response, data.signal, requestContext.timeoutMs);
            const error = await this.buildApiErrorFromResponse(errorResponse, requestContext, { attempts: 1, bodyKeys });
            // An HTTP error answer that is not an event stream: streamEvents raises it as built here,
            // as the request path does (_httpErrorAnswers).
            const answerType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
            if (response.status >= 400 && answerType !== 'text/event-stream')
                _httpErrorAnswers.add(error);
            try {
                await this.applyErrorMiddleware({ ...requestContext, error });
            }
            catch {
                // Middleware errors must not mask the original API error
            }
            throw error;
        }
        return data.signal && response.body
            ? this.abortableResponse(response, data.signal)
            : response;
    }
    /**
     * The same response, with a body that a later abort still reaches.
     *
     * The transport stops forwarding the caller's signal once the headers arrive
     * (its own timeout must not cut a live stream), so an abort after that point
     * reached nothing: a consumer parked in read() waited forever and the
     * connection stayed open. This wrapper cancels the source body and
     * makes the consumer's pending read reject with the abort reason.
     */
    abortableResponse(response, signal) {
        const source = response.body.getReader();
        let settled = false;
        let onAbort;
        const detach = () => {
            if (onAbort) {
                signal.removeEventListener('abort', onAbort);
                onAbort = undefined;
            }
        };
        // Every exit releases the source reader, so the transport's body is left
        // unlocked, as streamEvents() leaves it.
        const release = () => {
            try {
                source.releaseLock();
            }
            catch {
                // Already released; nothing to do.
            }
        };
        const body = new ReadableStream({
            start(controller) {
                onAbort = () => {
                    detach();
                    if (!settled) {
                        settled = true;
                        let reason = signal.reason;
                        if (reason === undefined) {
                            const aborted = new Error('The stream was aborted');
                            aborted.name = 'AbortError';
                            reason = aborted;
                        }
                        controller.error(reason);
                    }
                    void source.cancel(signal.reason).catch(() => undefined);
                    release();
                };
                if (signal.aborted) {
                    onAbort();
                }
                else {
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            },
            async pull(controller) {
                try {
                    const chunk = await source.read();
                    if (settled)
                        return;
                    if (chunk.done) {
                        settled = true;
                        detach();
                        release();
                        controller.close();
                        return;
                    }
                    controller.enqueue(chunk.value);
                }
                catch (error) {
                    if (settled)
                        return;
                    settled = true;
                    detach();
                    release();
                    controller.error(error);
                }
            },
            cancel(reason) {
                settled = true;
                detach();
                const cancelling = source.cancel(reason);
                release();
                return cancelling;
            },
        });
        const wrapped = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
        // Response.url cannot be passed to the constructor; keep the original so
        // error messages still name the real endpoint.
        Object.defineProperty(wrapped, 'url', { value: response.url });
        return wrapped;
    }
    /**
     * A non-2xx response with its body read to at most 64 KiB, within the
     * caller's signal and the request timeout (5 s when the timeout is 0), so
     * building the ApiError cannot hang on a body that never ends.
     * An abort surfaces as the abort, not as a protocol error.
     */
    async boundedErrorResponse(response, signal, timeoutMs) {
        const body = response.body;
        if (!body || response.status === 204 || response.status === 205 || response.status === 304) {
            return response;
        }
        const reader = body.getReader();
        const stop = () => {
            void reader.cancel().catch(() => undefined);
        };
        const budgetMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
        const timer = setTimeout(stop, budgetMs);
        if (signal) {
            if (signal.aborted) {
                stop();
            }
            else {
                signal.addEventListener('abort', stop, { once: true });
            }
        }
        const limit = 65536;
        const chunks = [];
        let taken = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                const room = limit - taken;
                if (chunk.value.length >= room) {
                    chunks.push(chunk.value.subarray(0, room));
                    taken = limit;
                    break;
                }
                chunks.push(chunk.value);
                taken += chunk.value.length;
            }
        }
        catch {
            // A body that fails mid-read still yields what arrived.
        }
        finally {
            clearTimeout(timer);
            if (signal) {
                signal.removeEventListener('abort', stop);
            }
            stop();
            try {
                reader.releaseLock();
            }
            catch {
                // A read still settling holds the lock; nothing to do.
            }
        }
        if (signal && signal.aborted) {
            if (signal.reason !== undefined)
                throw signal.reason;
            const aborted = new Error('The stream was aborted');
            aborted.name = 'AbortError';
            throw aborted;
        }
        const bytes = new Uint8Array(taken);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        const bounded = new Response(bytes, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
        Object.defineProperty(bounded, 'url', { value: response.url });
        return bounded;
    }
    /**
     * Incremental event stream.
     *
     * Issues one request through `stream()` (same injected transport, URL
     * builder, auth policy and non-2xx handling) and yields each server-sent
     * event as it arrives. Nothing is buffered beyond one partial frame, so a
     * stream that never ends is consumed in constant memory — the ordinary
     * request path awaits the whole body and would never return on one.
     *
     * Laziness is deliberate: the request is issued on the first iteration, not
     * at the call. A caller that builds the iterable and drops it issues no
     * request at all.
     *
     * Cancellation: pass `options.signal` (or `data.signal`). Aborting cancels
     * the body reader and the iteration throws. Leaving the loop with `break`,
     * `return` or a thrown error cancels the reader too, through the generator's
     * `finally`.
     *
     * Replay: `options.since` is sent as the `Last-Event-ID` request header, or
     * as a query parameter when `options.sinceParam` names one. Every yielded
     * event carries back the server's cursor as `seq`/`id`, so a consumer
     * resumes by passing the last one it saw.
     *
     * Termination: an event named `end` is yielded and then ends the iteration
     * — the hoody-agent gateway writes it when a session closes, and a consumer
     * that only watched for the socket to drop would otherwise hang until the
     * read timed out.
     *
     * Turn end: with `options.turnEnd` the stream also ends after the frame
     * that ends its own turn or the session; see IStreamTurnEnd. A body still
     * open when such a frame or an `end` frame arrives is closed before that
     * frame is yielded.
     *
     * A non-2xx never yields: `stream()` drains it and raises `ApiError`, a
     * 4xx or 5xx with the server's code, message and body, as the request path
     * does. Neither does a 2xx whose content-type is not `text/event-stream`: it
     * raises `ApiError` with code `NOT_AN_EVENT_STREAM` and the HTTP status.
     * That error holds only a fixed code, a fixed sentence and the status;
     * the server's body (for example a 202 job ack) goes to
     * `options.onDiagnostic` (or the client's `onStreamDiagnostic`), with the
     * original error.
     *
     * Response: `stream.response` resolves with the accepted stream's status
     * and headers before the first event is yielded, and carries the headers
     * `options.documentedHeaders` names on `documented`; see IEventStream.
     *
     * Typed frames: with `options.declaredEvents` each frame also carries its
     * parsed `data` and `declared`, and `TEvent` (an ITypedStreamEvent) types
     * them; see ITypedStreamEvent.
     */
    streamEvents(method, path, data = {}, options = {}) {
        // A bad budget is refused before anything is opened (a stream cut short by it would otherwise leave the response unread).
        _byteLimit('maxStreamBytes', options.maxStreamBytes);
        let settled = false;
        // The accepted response's status, once accept() has resolved response.
        let acceptedStatus;
        let resolveResponse = () => undefined;
        let rejectResponse = () => undefined;
        const response = new Promise((resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
        });
        // The iteration raises every failure itself, so a caller that never reads
        // response must not see it reported as an unhandled rejection.
        response.catch(() => undefined);
        // Built in full before anything is settled: when reading a documented
        // header throws, response is still open, and the iteration's error
        // (raised through next()) rejects it.
        const accept = (accepted) => {
            if (settled)
                return;
            const documented = {};
            for (const [name, header] of Object.entries(options.documentedHeaders ?? {})) {
                const value = accepted.headers.get(header);
                if (value !== null)
                    documented[name] = value;
            }
            const value = { status: accepted.status, headers: accepted.headers, documented: documented };
            settled = true;
            acceptedStatus = accepted.status;
            resolveResponse(value);
        };
        const refuse = (reason) => {
            if (settled)
                return;
            settled = true;
            rejectResponse(reason);
        };
        const closedError = () => _streamError('StreamClosedError', 'The event stream was closed before a response was accepted');
        // Every error the iteration raises is replaced by a fixed-text one; the
        // original goes only to onDiagnostic, which must not break the stream.
        const diagnostic = options.onDiagnostic ?? this.config.onStreamDiagnostic;
        const toStreamError = (error) => {
            const clean = _toStreamError(error, acceptedStatus);
            if (clean !== error && diagnostic) {
                try {
                    diagnostic(error);
                }
                catch {
                    // A failing diagnostic sink is not the stream's error.
                }
            }
            return clean;
        };
        // Lets return() and throw() cancel the body under a read in flight. A
        // generator queues return() behind a pending next(), so after
        // `await stream.response` (which starts the first read) a close on an
        // idle stream would wait for a frame that may never come.
        const control = { closed: false, abort: () => undefined, cancel: () => undefined };
        const close = () => {
            control.closed = true;
            control.abort();
            control.cancel();
        };
        const frames = this.streamEventFrames(method, path, data, options, accept, control);
        const declaredEvents = options.declaredEvents ? new Set(options.declaredEvents) : undefined;
        const lossless = data.losslessIntegers === true;
        // One step of the iteration, with every failure made fixed-text and
        // response settled by it.
        const step = async () => {
            let result;
            try {
                result = await frames.next();
            }
            catch (error) {
                const clean = toStreamError(error);
                refuse(clean);
                throw clean;
            }
            if (result.done) {
                refuse(closedError());
                return result;
            }
            const value = declaredEvents ? _decodeStreamEvent(result.value, declaredEvents, lossless) : result.value;
            return { done: false, value: value };
        };
        // Reading response before the first next() sends the request: the first
        // step runs then, and its result is held for that next(). Otherwise
        // `await stream.response` ahead of the loop would wait for a request
        // nothing had sent.
        let started = false;
        let held;
        const stream = {
            get response() {
                if (!started && !settled) {
                    started = true;
                    held = step();
                    held.catch(() => undefined);
                }
                return response;
            },
            [Symbol.asyncIterator]() {
                return stream;
            },
            async next() {
                started = true;
                if (held) {
                    const first = held;
                    held = undefined;
                    return first;
                }
                return step();
            },
            async return(value) {
                refuse(closedError());
                // A held first frame is not given to a next() after the close.
                held = undefined;
                close();
                return (await frames.return(value));
            },
            async throw(error) {
                refuse(error);
                held = undefined;
                close();
                return (await frames.throw(error));
            },
        };
        return stream;
    }
    /**
     * The frames of streamEvents(); accept() is told the response before the first one.
     *
     * The transport gets a signal of its own, aborted by the caller's signal or by
     * return()/throw(): a close then also reaches a request still in flight and
     * the reads of a body that is no event stream (a 200 JSON reply, a non-2xx
     * error body), which no reader of this method holds.
     */
    async *streamEventFrames(method, path, data, options, accept, control) {
        const signal = options.signal ?? data.signal;
        const transport = new AbortController();
        const forward = () => {
            transport.abort(signal?.reason);
        };
        control.abort = () => transport.abort();
        if (signal) {
            if (signal.aborted) {
                forward();
            }
            else {
                signal.addEventListener('abort', forward, { once: true });
            }
        }
        try {
            yield* this.openedEventFrames(method, path, data, options, accept, control, signal, transport.signal);
        }
        finally {
            if (signal) {
                signal.removeEventListener('abort', forward);
            }
        }
    }
    /** streamEventFrames() behind its transport signal. */
    async *openedEventFrames(method, path, data, options, accept, control, signal, transportSignal) {
        // A middlewareContext object the request middleware mutates in place, so the
        // credential query parameter names it records are known here for redaction.
        const requestData = { ...data, middlewareContext: data.middlewareContext ?? {} };
        requestData.signal = transportSignal;
        if (options.since !== undefined && options.since !== null && String(options.since).length > 0) {
            const since = String(options.since);
            if (options.sinceParam) {
                requestData.query = { ...(requestData.query ?? {}), [options.sinceParam]: since };
            }
            else {
                requestData.headers = { ...(requestData.headers ?? {}), 'Last-Event-ID': since };
            }
        }
        // Ask for frames explicitly unless the caller already set Accept. This is a
        // preference, not a switch: a route that answers either JSON or SSE may
        // choose from the request body instead (hoody-agent's headless run streams
        // only when the body sets format:"stream-json" or stream:true, and answers
        // 202 {job_id} otherwise). The content-type check below catches that case.
        if (!requestData.headers || !Object.keys(requestData.headers).some((h) => h.toLowerCase() === 'accept')) {
            requestData.headers = { ...(requestData.headers ?? {}), Accept: 'text/event-stream' };
        }
        let response;
        try {
            response = await this.stream(method, path, requestData);
        }
        catch (error) {
            // A close aborted the request or its error-body read: an end, not a failure.
            if (control.closed)
                return;
            throw error;
        }
        const body = response.body;
        // Closed while the request was in flight: nothing is read or yielded.
        if (control.closed) {
            if (body)
                void body.cancel().catch(() => undefined);
            return;
        }
        if (!body) {
            // A 2xx with no body is an empty stream, not an error: nothing to yield.
            accept(response);
            return;
        }
        // Cancelling a reader makes the pending read() RESOLVE as done, which is
        // indistinguishable from the server finishing. A consumer would treat an
        // aborted stream as a completed one and stop reconnecting, so an abort is
        // raised explicitly instead.
        // Always this fixed error, never the signal's reason: a reason is the
        // caller's value, and its message and name reach wherever the error goes.
        // The caller still holds the signal and its reason.
        const abortError = () => _streamError('AbortError', 'The event stream was aborted');
        // A 2xx that is not an event stream is refused rather than framed. Framing
        // a JSON reply as SSE yields nothing (no line starts with a known field),
        // so the iteration ended cleanly and the payload was lost: the headless
        // run's 202 {job_id} vanished this way. The caller's error carries the
        // status only; the original, with the parsed body, goes to onDiagnostic.
        // A reply with no content-type at all keeps the old behaviour and is framed.
        const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (contentType !== '' && contentType !== 'text/event-stream') {
            // Read the diagnostic body HERE rather than through parseResponseBody:
            // by this point the transport has dropped its own timeout and abort
            // forwarding, so a body that never ends (a mislabelled live stream)
            // would hang the caller and grow without bound. Take at most 64 KiB of
            // BYTES and five seconds, release the reader either way, and let a real
            // abort surface as an abort rather than as this error.
            let payload;
            let truncated = false;
            const diagnosticReader = body.getReader();
            const cancelDiagnostic = () => {
                void diagnosticReader.cancel().catch(() => undefined);
            };
            control.cancel = cancelDiagnostic;
            const diagnosticTimer = setTimeout(cancelDiagnostic, 5000);
            if (signal) {
                if (signal.aborted) {
                    cancelDiagnostic();
                }
                else {
                    signal.addEventListener('abort', cancelDiagnostic, { once: true });
                }
            }
            try {
                const diagnosticDecoder = new TextDecoder('utf-8');
                const diagnosticLimit = 65536;
                let taken = 0;
                let text = '';
                for (;;) {
                    const chunk = await diagnosticReader.read();
                    if (chunk.done) {
                        // Flush, so a body cut mid-character still decodes as one.
                        text += diagnosticDecoder.decode();
                        break;
                    }
                    const bytes = chunk.value;
                    if (taken + bytes.length >= diagnosticLimit) {
                        text += diagnosticDecoder.decode(bytes.subarray(0, diagnosticLimit - taken), { stream: true });
                        taken = diagnosticLimit;
                        truncated = true;
                        cancelDiagnostic();
                        break;
                    }
                    taken += bytes.length;
                    text += diagnosticDecoder.decode(bytes, { stream: true });
                }
                if (text.length > 0) {
                    if (truncated) {
                        payload = text;
                    }
                    else {
                        try {
                            payload = JSON.parse(text);
                        }
                        catch {
                            payload = text;
                        }
                    }
                }
            }
            catch {
                payload = undefined;
            }
            finally {
                clearTimeout(diagnosticTimer);
                if (signal) {
                    signal.removeEventListener('abort', cancelDiagnostic);
                }
                cancelDiagnostic();
                try {
                    diagnosticReader.releaseLock();
                }
                catch {
                    // Already released, or a read is still settling: nothing to do.
                }
            }
            // An abort is the caller's own decision and must not be reported as a
            // protocol error, the same way the framing loop below reports it.
            if (signal && signal.aborted) {
                throw abortError();
            }
            // return()/throw() cut the read short: the caller ended the stream itself.
            if (control.closed) {
                return;
            }
            throw new ApiError({
                message: 'Expected an event stream, got ' + contentType + ' (HTTP ' + response.status + '); the' + (truncated ? ' first 64 KiB of the' : ' parsed') + ' body is on error.response',
                status: response.status,
                code: 'NOT_AN_EVENT_STREAM',
                url: _redactUrl(response.url || path, this.redactedFieldNames(_credentialQueryParamsOf(requestData.middlewareContext), this.bodyRedactionKeys(requestData))),
                method: method.toUpperCase(),
                response: payload,
                ..._STREAM_ANSWERED,
            });
        }
        try {
            accept(response);
        }
        catch (error) {
            void body.cancel().catch(() => undefined);
            throw error;
        }
        let turnHeader = null;
        if (options.turnEnd) {
            try {
                turnHeader = response.headers.get(options.turnEnd.header);
            }
            catch {
                // A header name Headers refuses names no header: the turn comes from the boundary.
            }
        }
        const endsTurn = options.turnEnd ? _streamTurnTracker(options.turnEnd, turnHeader) : undefined;
        const reader = body.getReader();
        const decoder = new TextDecoder('utf-8');
        const maxFrameBytes = resolveMaxFrameBytes(options.maxFrameBytes, this.config.maxStreamFrameBytes);
        const buffer = createStreamFrameBuffer(maxFrameBytes);
        const frameTooLarge = () => _cleanApiError({
            message: 'An event stream frame exceeded ' + maxFrameBytes + ' bytes (maxFrameBytes); the stream was closed',
            status: response.status,
            code: 'STREAM_FRAME_TOO_LARGE',
            url: _redactUrl(response.url || path, this.redactedFieldNames(_credentialQueryParamsOf(requestData.middlewareContext), this.bodyRedactionKeys(requestData))),
            method: method.toUpperCase(),
            response: { maxFrameBytes, frameBytes: buffer.overflowBytes },
            ..._STREAM_ANSWERED,
        });
        const maxStreamBytes = _byteLimit('maxStreamBytes', options.maxStreamBytes, this.config.maxStreamBytes);
        let streamedBytes = 0;
        const streamTooLarge = () => _cleanApiError({
            message: 'The event stream read more than ' + maxStreamBytes + ' bytes (maxStreamBytes); the stream was closed',
            status: response.status,
            code: _STREAM_TOO_LARGE,
            url: _redactUrl(response.url || path, this.redactedFieldNames(_credentialQueryParamsOf(requestData.middlewareContext), this.bodyRedactionKeys(requestData))),
            method: method.toUpperCase(),
            response: { maxStreamBytes, streamedBytes },
            ..._STREAM_ANSWERED,
        });
        const idleMs = typeof options.idleTimeoutMs === 'number' && Number.isFinite(options.idleTimeoutMs) && options.idleTimeoutMs > 0
            ? options.idleTimeoutMs
            : undefined;
        let idled = false;
        let idleTimer;
        const idleTimedOut = () => _cleanApiError({
            message: 'The event stream sent nothing for ' + idleMs + ' ms (idleTimeoutMs); the stream was closed',
            status: response.status,
            code: 'ETIMEDOUT',
            url: _redactUrl(response.url || path, this.redactedFieldNames(_credentialQueryParamsOf(requestData.middlewareContext), this.bodyRedactionKeys(requestData))),
            method: method.toUpperCase(),
            ..._STREAM_ANSWERED,
        });
        const onAbort = () => {
            void reader.cancel().catch(() => undefined);
        };
        control.cancel = onAbort;
        if (signal) {
            if (signal.aborted) {
                onAbort();
            }
            else {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        }
        try {
            for (;;) {
                if (signal && signal.aborted) {
                    throw abortError();
                }
                // Typed by the assignment: whatever this environment's reader returns.
                // A declared DOM ReadableStreamReadResult is refused under @types/bun
                // with exactOptionalPropertyTypes (its done result omits value).
                let read;
                // The idle clock covers this read only: a caller still handling the
                // last frame is not the stream going quiet.
                if (idleMs !== undefined) {
                    idleTimer = setTimeout(() => {
                        idled = true;
                        onAbort();
                    }, idleMs);
                }
                try {
                    read = await reader.read();
                }
                catch (error) {
                    // A read the abort cancelled may reject rather than resolve done.
                    if (signal && signal.aborted)
                        throw abortError();
                    if (control.closed)
                        return;
                    if (idled)
                        throw idleTimedOut();
                    throw error;
                }
                finally {
                    clearTimeout(idleTimer);
                }
                const { done, value } = read;
                if (signal && signal.aborted) {
                    throw abortError();
                }
                // return() or throw() cancelled this read: the close wins over
                // whatever the cancel left in the buffer.
                if (control.closed) {
                    return;
                }
                // The idle bound cancelled it: not the server ending the stream.
                if (idled) {
                    throw idleTimedOut();
                }
                if (done) {
                    // The decoder's last bytes (a character cut by the close), then the
                    // frame the server ended by closing rather than with a blank line.
                    const events = parseSseChunk(buffer, decoder.decode());
                    if (buffer.overflowBytes === undefined)
                        events.push(...finishSseStream(buffer));
                    for (const event of events) {
                        if (endsTurn && endsTurn(event)) {
                            yield event;
                            return;
                        }
                        yield event;
                        if (event.event === 'end') {
                            return;
                        }
                    }
                    if (buffer.overflowBytes !== undefined) {
                        throw frameTooLarge();
                    }
                    return;
                }
                if (maxStreamBytes !== undefined) {
                    streamedBytes += value.byteLength;
                    if (streamedBytes > maxStreamBytes)
                        throw streamTooLarge();
                }
                const chunk = decoder.decode(value, { stream: true });
                if (chunk.length === 0) {
                    continue;
                }
                for (const event of parseSseChunk(buffer, chunk)) {
                    if (event.event === 'end' || (endsTurn && endsTurn(event))) {
                        // The stream is over: close the body now, so a caller that stops
                        // reading at this frame holds no connection open.
                        void reader.cancel().catch(() => undefined);
                        yield event;
                        return;
                    }
                    yield event;
                }
                if (buffer.overflowBytes !== undefined) {
                    throw frameTooLarge();
                }
            }
        }
        finally {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            // Idempotent: cancelling an already-cancelled or finished reader resolves.
            void reader.cancel().catch(() => undefined);
            // Release the lock as well: cancel() alone left the body locked, so
            // anything that inspected it afterwards got a TypeError.
            try {
                reader.releaseLock();
            }
            catch {
                // A read still settling holds the lock; nothing to do.
            }
        }
    }
    /**
     * The body of a buffered response, read whole inside the caller's signal and
     * an IDLE timeout: timeoutMs bounds the wait for the headers (the transport),
     * and here the same length bounds the gap between two chunks, reset on every
     * chunk. A slow but flowing download of any length completes; one that goes
     * quiet for timeoutMs fails with a body-stalled error (code ETIMEDOUT, as the
     * CLI reports it). It used to be a total deadline, so a large file, a zip or a
     * pipe receive failed after timeoutMs while data was still arriving.
     *
     * The transport stops forwarding the caller's signal and clears its timer as
     * soon as the headers arrive, so a body that never ended (an event stream
     * reached through the buffered path, a stalled download) kept request()
     * pending past both: curl sseJobEvents() ignored its abort. The
     * body is read here instead; an abort or the idle timer cancels the reader,
     * which settles a pending read on every transport, including an injected one
     * that ignores the fetch signal. A caller's abort always wins, and rejects as
     * an abort.
     *
     * Returns the chunks, or null when the response has no body. replayResponse()
     * turns them into a fresh, unread Response, so the parser, the error builder
     * and response middleware each read their own copy of the same bytes.
     */
    async readBufferedBody(response, signal, timeoutMs, _startedAt, maxBytes) {
        const body = response.body;
        if (!body || response.status === 204 || response.status === 205 || response.status === 304) {
            return null;
        }
        // maxResponseBytes: a body that declares more than the limit (and is not compressed, so the
        // length is the body's own) is refused before any of it is read. An error answer (not 2xx) is
        // never refused for its size: its status and code decide the retry, the 401 refresh and the
        // error the caller sees, so its body is read up to the limit and cut there (below).
        if (maxBytes !== undefined && response.ok) {
            const declared = Number(response.headers.get('content-length'));
            const encoded = (response.headers.get('content-encoding') ?? '').trim().toLowerCase();
            if (Number.isFinite(declared) && declared > maxBytes && (encoded === '' || encoded === 'identity')) {
                void body.cancel().catch(() => undefined);
                throw _responseTooLargeError(maxBytes, undefined, declared);
            }
        }
        const reader = body.getReader();
        let stopped;
        const stop = (why) => {
            if (stopped === undefined || why === 'abort')
                stopped = why;
            void reader.cancel().catch(() => undefined);
        };
        const onAbort = () => stop('abort');
        const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        let timer;
        const arm = () => {
            if (!hasBudget)
                return;
            if (timer !== undefined)
                clearTimeout(timer);
            timer = setTimeout(() => stop('stall'), timeoutMs);
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
            }
            else {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        }
        const chunks = [];
        let received = 0;
        let overLimit = false;
        try {
            arm();
            for (;;) {
                if (stopped !== undefined)
                    break;
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                received += chunk.value.length;
                if (maxBytes !== undefined && received > maxBytes) {
                    // Stop reading and let the rest go: the rest of the body is not kept.
                    void reader.cancel().catch(() => undefined);
                    if (response.ok) {
                        overLimit = true;
                    }
                    else {
                        // An error answer keeps its status; its body is cut at the limit.
                        const room = maxBytes - (received - chunk.value.length);
                        if (room > 0)
                            chunks.push(chunk.value.slice(0, room));
                    }
                    break;
                }
                chunks.push(chunk.value);
                arm();
            }
        }
        catch (error) {
            if (stopped === undefined)
                throw error;
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            if (signal)
                signal.removeEventListener('abort', onAbort);
            try {
                reader.releaseLock();
            }
            catch {
                // A read still settling holds the lock; nothing to do.
            }
        }
        if (overLimit && stopped !== 'abort')
            throw _responseTooLargeError(maxBytes, received);
        if (stopped === 'abort') {
            const aborted = new Error('The request was aborted while its response body was being read');
            aborted.name = 'AbortError';
            throw aborted;
        }
        if (stopped === 'stall') {
            throw Object.assign(new Error('Response body stalled: the server answered HTTP ' + response.status + ', then sent no data for ' + timeoutMs + 'ms (after ' + received + ' bytes). The transfer stopped mid-body; retry, or raise the timeout.'), { name: 'BodyStallError', code: 'ETIMEDOUT' });
        }
        return chunks;
    }
    /**
     * A fresh, unread Response over chunks readBufferedBody() already read, with
     * the original status, headers and url. The chunks are enqueued, not copied.
     */
    replayResponse(response, chunks) {
        if (chunks === null)
            return response;
        const body = new ReadableStream({
            start(controller) {
                for (const chunk of chunks)
                    controller.enqueue(chunk);
                controller.close();
            },
        });
        const replay = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
        Object.defineProperty(replay, 'url', { value: response.url });
        return replay;
    }
    /** The chunks as one byte array: the rawBody response middleware receives. */
    joinChunks(chunks) {
        let total = 0;
        for (const chunk of chunks ?? [])
            total += chunk.length;
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks ?? []) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return bytes;
    }
    /**
     * The URL and headers a WebSocket upgrade to url must carry, built exactly
     * as request() builds a GET: the same URL builder and query encoding, the
     * API bearer only inside the API's credential scope, and the same request
     * middleware, so kitAuth (injected by middleware, per namespace) reaches the
     * upgrade. Generated WebSocket clients open their socket with what this
     * returns; before, they skipped the middleware and a kit gated by a proxy
     * permission refused them even with kitAuth configured.
     *
     * Nothing is sent. Response and error middleware do not run.
     *
     * A browser WebSocket cannot send headers. The URL is the part that survives
     * there: a proxy token credential configured with a query parameter
     * (kitAuth type 'token' with param) is carried in it.
     */
    async prepareUpgrade(url, data = {}) {
        const isFullUrl = _isFullUrl(url);
        const target = isFullUrl
            ? this.buildUrlFromFull(url, data.query)
            : this.buildUrl(url, data.query);
        const isExternalUrl = this.isExternalDestination(isFullUrl, target);
        const headers = this.buildHeaders(data.headers, isExternalUrl);
        // Whose header it is is decided here, before any middleware can change the header maps it is read from.
        const sdkAddedVersion = this.addsClientVersion(data.headers, isExternalUrl);
        if (isExternalUrl) {
            this.deleteAuthorization(headers, data.headers);
        }
        // An upgrade has no body to describe.
        _deleteContentType(headers);
        const upgradeContext = _withCredentialHeaders(data.middlewareContext, this.config.credentialHeaders);
        const upgradeRequest = {
            requestId: this.nextRequestId(),
            attempt: 1,
            method: 'GET',
            path: url,
            url: target,
            headers,
            timeoutMs: data.timeoutMs ?? this.config.timeout,
            retries: 0,
            ...(data.query !== undefined ? { query: data.query } : {}),
            ...(upgradeContext !== undefined ? { middlewareContext: upgradeContext } : {}),
        };
        let context;
        try {
            context = this.withoutMovedClientVersion(await this.applyRequestMiddleware(upgradeRequest, data.routeTag), target, sdkAddedVersion);
        }
        catch (error) {
            // A request middleware that threw refused the upgrade: the same REQUEST_REFUSED as request(). A caller
            // abort keeps its own error (the raw reason, as before).
            if (_requestRefusals.has(upgradeRequest) && data.signal?.aborted !== true)
                throw this.requestRefusedError(error, upgradeRequest, { attempts: 0, bodyKeys: this.bodyRedactionKeys(data) });
            throw error;
        }
        return { url: context.url, headers: { ...context.headers } };
    }
    /** {@link request} with method `LOGOUT`. */
    async logout(path, data = {}) {
        return this.request('LOGOUT', path, data);
    }
    async parseResponseBody(response, responseType = 'auto', method, losslessIntegers = false) {
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
            return losslessIntegers ? parseJsonLossless(await response.text()) : response.json();
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
        if (isJsonContentType(contentType)) {
            if (hasNoBody)
                return null;
            // An empty body under a JSON type reads as null, as in the CLI client.
            const text = await response.text();
            if (text.trim() === '')
                return null;
            return losslessIntegers ? parseJsonLossless(text) : JSON.parse(text);
        }
        if (this.isBinaryResponse(response, contentType)) {
            return response.arrayBuffer();
        }
        return response.text();
    }
    isBinaryResponse(response, contentType) {
        // A text type is text however it is served: hoody-agent's log export is NDJSON
        // with Content-Disposition: attachment, and the attachment rule used to win and
        // hand back an ArrayBuffer. Matched on the exact subtype (lib/http-wire.ts): a
        // substring test read a .docx (openxmlformats) as text.
        if (isTextMediaType(contentType)) {
            return false;
        }
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition && /attachment/i.test(contentDisposition)) {
            return true;
        }
        return isBinaryMediaType(contentType);
    }
    /**
     * Query parameters as wire pairs, as the Node client builds them: an array
     * value is one pair per item (?source=a&source=b, OpenAPI form/explode), and
     * undefined/null (the value or an item) sends nothing. String() on an array
     * would comma-join it into ONE value (source=a%2Cb) that array-taking kits
     * reject.
     */
    queryPairs(query) {
        const pairs = [];
        if (!query)
            return pairs;
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null)
                continue;
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (item !== undefined && item !== null)
                        pairs.push([key, _queryString(item)]);
                }
            }
            else {
                pairs.push([key, _queryString(value)]);
            }
        }
        return pairs;
    }
    buildUrl(path, query) {
        const baseUrl = this.config.baseURL.replace(/\/$/, '');
        const cleanPath = path.replace(/^\//, '');
        // Empty baseURL = same-origin relative fetch (browser default). In the
        // browser, fall back to `location.origin` so the URL is absolute. If
        // `location` is missing (SSR / worker-lite), emit a path-only URL so
        // callers can still prepend their own base.
        if (!baseUrl) {
            const origin = typeof globalThis !== 'undefined' &&
                typeof globalThis.location?.origin === 'string'
                ? globalThis.location.origin
                : '';
            if (origin) {
                const url = new URL(`/${cleanPath}`, origin);
                mergeQueryPairs(url.searchParams, this.queryPairs(query));
                return url.toString();
            }
            // No origin available — emit path + manual query string. Kept on
            // encodeURIComponent (%20, not URLSearchParams' +): a path-only URL is
            // resolved by whatever the caller prepends, and a test pins this form.
            // A path that carries its own query (a route marker) is merged with it.
            const mark = cleanPath.indexOf('?');
            const pathOnly = mark === -1 ? cleanPath : cleanPath.slice(0, mark);
            const merged = new URLSearchParams(mark === -1 ? '' : cleanPath.slice(mark + 1));
            if (mark !== -1 && !mergeQueryPairs(merged, this.queryPairs(query))) {
                return `/${cleanPath}`;
            }
            const pairs = mark === -1 ? this.queryPairs(query) : [...merged];
            const qs = pairs
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            return `/${pathOnly}${qs ? `?${qs}` : ''}`;
        }
        // A relative baseURL ('/api') is joined as a path, as the Node client does;
        // `new URL('/api/x')` has no authority and threw here.
        if (!this.hasAbsoluteUrlOrigin(baseUrl)) {
            return this.appendQueryParameters(`${baseUrl}/${cleanPath}`, query);
        }
        const url = new URL(`${baseUrl}/${cleanPath}`);
        mergeQueryPairs(url.searchParams, this.queryPairs(query));
        return url.toString();
    }
    hasAbsoluteUrlOrigin(value) {
        return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
    }
    appendQueryParameters(pathOrUrl, query) {
        const mark = pathOrUrl.indexOf('?');
        const searchParams = new URLSearchParams(mark === -1 ? '' : pathOrUrl.slice(mark + 1));
        if (!mergeQueryPairs(searchParams, this.queryPairs(query))) {
            return pathOrUrl;
        }
        const queryString = searchParams.toString();
        const head = mark === -1 ? pathOrUrl : pathOrUrl.slice(0, mark);
        return queryString ? `${head}?${queryString}` : head;
    }
    buildUrlFromFull(fullUrl, query) {
        const url = new URL(fullUrl);
        mergeQueryPairs(url.searchParams, this.queryPairs(query));
        return url.toString();
    }
    sanitizeHeaderValue(value, maxLength = 128) {
        return value
            .replace(/[^\x20-\x7E]/g, '')
            .trim()
            .slice(0, maxLength);
    }
    /**
     * `external`: the request goes outside the API's credential scope (a kit, a proxy or a browser-kit
     * host). Only a control-plane request (the API base URL and its realm hosts, on a client whose target is
     * 'account') names the SDK version in X-Hoody-Client-Version: kit CORS allow-lists do not list it, so a
     * kit request never carries it, a direct-kit client's included. A value the caller or the client's
     * configured headers set for that header is kept.
     */
    buildHeaders(customHeaders, external = true) {
        const headers = {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...customHeaders,
        };
        if (this.addsClientVersion(customHeaders, external)) {
            headers[_CLIENT_VERSION_HEADER] = SDK_VERSION;
        }
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
    /**
     * The fetch options a request adds beyond the method, headers, signal and body: its credentials
     * mode (the call's, else the client's policy for the request's namespace) and its cache mode (the
     * call's, else the client's; none by default).
     */
    fetchExtrasFor(data, _method, context = data.middlewareContext) {
        const credentials = resolveFetchCredentials(data.fetchCredentials, this.config.fetchCredentials, context?._kitNamespace);
        const cache = fetchCacheMode(data.fetchCache) ?? this.config.fetchCache;
        if (credentials === undefined && cache === undefined)
            return undefined;
        return { ...(credentials !== undefined ? { credentials } : {}), ...(cache !== undefined ? { cache } : {}) };
    }
    async executeRequest(method, url, headers, body, timeoutMs, externalSignal, redirect, extras) {
        const controller = new AbortController();
        // `timeout: 0` means "no timeout" (caller opting out of our budget). A
        // 0-ms setTimeout would abort on the next tick — before fetch had even
        // dispatched — so only arm the timer for positive finite budgets.
        const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        const timeout = hasBudget
            ? setTimeout(() => controller.abort(deadlineReason()), timeoutMs)
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
                    : stringifyBody(body))
                : undefined;
            // Header names are case-insensitive: a request middleware that hands
            // back another spelling (a Headers round-trip lower-cases every name)
            // survived the exact-case delete, and a FormData upload went out as
            // application/json with no multipart boundary.
            if (body instanceof FormData) {
                _deleteContentType(headers);
            }
            else if ((typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
                || body instanceof Blob
                || body instanceof ArrayBuffer
                || body instanceof Uint8Array) {
                // Only strip the DEFAULT application/json for a raw byte body (an application/json in any
                // spelling counts as that default); any other type is kept, as in
                // generated/http-client.ts: an ArrayBuffer or Uint8Array body is never labelled
                // application/json, and a Blob keeps its type.
                _deleteDefaultJsonContentType(headers);
            }
            const fetchOptions = {
                method: method.toUpperCase(),
                headers,
                signal: controller.signal,
            };
            if (redirect)
                fetchOptions.redirect = redirect;
            if (extras?.credentials !== undefined)
                fetchOptions.credentials = extras.credentials;
            if (extras?.cache !== undefined)
                fetchOptions.cache = extras.cache;
            // transport.keepAlive is NOT passed as fetch `keepalive`. In fetch that flag means "this
            // request may outlive the page" (the beacon use), not connection reuse, and a browser
            // refuses a keepalive request whose body is over 64 KiB: an upload or a long script failed
            // outright. Connection reuse is the runtime's in a browser, as in the Node client.
            if (bodyValue !== undefined) {
                fetchOptions.body = bodyValue;
                // Chromium requires duplex: 'half' for streaming request bodies
                if (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream) {
                    fetchOptions.duplex = 'half';
                }
            }
            // No fetch at all: getFetch() throws the actionable error (a bare `fetch` was a ReferenceError).
            return await (this.fetchImpl !== null ? this.fetchImpl(url, fetchOptions) : typeof fetch === 'function' ? fetch(url, fetchOptions) : this.getFetch()(url, fetchOptions));
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
            if (externalSignal && externalAbortListener) {
                externalSignal.removeEventListener('abort', externalAbortListener);
            }
        }
    }
    async buildApiErrorFromResponse(response, request, facts = {}) {
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
                code = _apiErrorCode(record);
            }
            else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                message = parsed;
            }
        }
        catch {
            // keep default message
        }
        // No body (a HEAD answer) or no code in it: the code may be in the
        // X-Hoody-Error-Code response header (hoody-sqlite's KV HEAD 404).
        if (code === undefined)
            code = _headerErrorCode(response.headers);
        // Redact URL, body, and query before embedding in ApiError.
        // The recorded credential query parameters are redacted too, whatever
        // name the operator gave them (kitAuth token rule with a param).
        const credentialParams = _credentialQueryParamsOf(request.middlewareContext);
        const fieldNames = this.redactedFieldNames(credentialParams, facts.bodyKeys);
        const redactedUrl = _redactUrl(request.url, fieldNames);
        const apiRequest = {
            method: request.method,
            url: redactedUrl,
            ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body, 0, undefined, fieldNames) } : {}),
            ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query, 0, undefined, fieldNames) } : {}),
            ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers, _credentialHeadersOf(request.middlewareContext)) } : {}),
        };
        // Retry-After (429/503) on the error, so the retry loop honours server-directed backoff
        // instead of hammering with local exponential delay, and the caller can read it.
        const retryAfterMs = this.parseRetryAfter(response.headers);
        return new ApiError({
            message,
            status: response.status,
            ...(code !== undefined ? { code } : {}),
            url: redactedUrl,
            method: request.method,
            request: apiRequest,
            response: responseDetails,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            outcome: 'answered',
            ...(facts.attempts !== undefined ? { attempts: facts.attempts } : {}),
        });
    }
    /**
     * The extra names an ApiError's URL query, body and query are redacted by, beside the default
     * secret names: the recorded credential parameters and the call's redactBodyKeys.
     */
    redactedFieldNames(credentialParams, bodyKeys = []) {
        return bodyKeys.length > 0 ? [...credentialParams, ...bodyKeys] : credentialParams;
    }
    /** The body keys a call's errors redact beyond the default names: the client's, then the call's. */
    bodyRedactionKeys(data) {
        const own = _nameList(data.redactBodyKeys);
        return own.length === 0 ? this.config.redactBodyKeys : [...this.config.redactBodyKeys, ...own];
    }
    /**
     * ApiError.outcome from what a request loop knows (facts): answered, then failed here;
     * never handed to fetch, or the connection could not be opened (`not_sent`, unless an
     * earlier attempt may have reached the server: then that attempt's outcome); otherwise it may
     * have reached the server. An error built without facts says nothing.
     */
    outcomeOf(error, facts) {
        const last = facts.answered === true ? 'answered'
            : facts.dispatched === false || (facts.dispatched === true && neverDispatched({ cause: error })) ? 'not_sent'
                : facts.dispatched === true ? 'unknown'
                    : undefined;
        return last === 'not_sent' && facts.mayHaveRun !== undefined ? facts.mayHaveRun : last;
    }
    /**
     * An ApiError this client made inside an attempt (_SDK_MADE_ERRORS: a refused redirect), with
     * the call's attempt facts (an HTTP status is an answer) and its URLs redacted by the call's
     * redactBodyKeys too.
     */
    withAttemptFacts(error, request, facts) {
        if (error.outcome !== undefined)
            return error;
        const fieldNames = this.redactedFieldNames(_credentialQueryParamsOf(request.middlewareContext), facts.bodyKeys);
        const outcome = error.status > 0 ? 'answered' : this.outcomeOf(error.cause, facts);
        const made = new ApiError({
            message: error.message,
            status: error.status,
            ...(error.code !== undefined ? { code: error.code } : {}),
            ...(error.url !== undefined ? { url: _redactUrl(error.url, fieldNames) } : {}),
            ...(error.method !== undefined ? { method: error.method } : {}),
            ...(error.request !== undefined ? { request: { ...error.request, url: _redactUrl(error.request.url, fieldNames) } } : {}),
            ...(error.response !== undefined ? { response: error.response } : {}),
            ...(error.cause !== undefined ? { cause: error.cause } : {}),
            ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
            ...(outcome !== undefined ? { outcome } : {}),
            ...(facts.attempts !== undefined ? { attempts: facts.attempts } : {}),
        });
        _SDK_MADE_ERRORS.add(made);
        return made;
    }
    toApiError(error, request, callerSignal, facts = {}) {
        if (isApiError(error)) {
            return _SDK_MADE_ERRORS.has(error) ? this.withAttemptFacts(error, request, facts) : error;
        }
        const isAbortError = (error instanceof Error && error.name === 'AbortError')
            || (typeof error === 'object' && error !== null && error.code === 'ABORT_ERR');
        const isParseError = error instanceof SyntaxError;
        // The caller's own signal fired: fetch rejects with an AbortError, or with the signal's
        // reason when the caller gave one. ABORTED, never the timeout, so a cancel is not taken for a
        // deadline. Any other AbortError is this client's deadline: ETIMEDOUT, as in the Node and CLI clients.
        // The deadline's own reason (see deadlineReason) wins a race with a later caller abort.
        const callerAbort = !isDeadlineReason(error)
            && callerSignal?.aborted === true && (isAbortError || error === callerSignal.reason);
        const deadline = isAbortError && !callerAbort;
        const message = callerAbort
            ? callerAbortMessage(callerSignal.reason)
            : deadline ? `Request timed out after ${request.timeoutMs}ms`
                : (error instanceof Error ? error.message : 'Request failed');
        // A body that stalled after the headers (readBufferedBody): the CLI's code for it.
        const isBodyStall = error instanceof Error && error.name === 'BodyStallError';
        const isTooLarge = error instanceof Error && error.name === 'ResponseTooLargeError';
        const code = callerAbort ? 'ABORTED' : isParseError ? 'PARSE_ERROR' : deadline || isBodyStall ? 'ETIMEDOUT' : isTooLarge ? RESPONSE_TOO_LARGE : undefined;
        // Redact URL, body, and query for toApiError path too.
        // The recorded credential query parameters are redacted too, whatever
        // name the operator gave them (kitAuth token rule with a param).
        const credentialParams = _credentialQueryParamsOf(request.middlewareContext);
        const fieldNames = this.redactedFieldNames(credentialParams, facts.bodyKeys);
        const redactedUrl = _redactUrl(request.url, fieldNames);
        const apiRequest = {
            method: request.method,
            url: redactedUrl,
            ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body, 0, undefined, fieldNames) } : {}),
            ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query, 0, undefined, fieldNames) } : {}),
            ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers, _credentialHeadersOf(request.middlewareContext)) } : {}),
        };
        // Answered, then failed here; never handed to fetch, or the connection could not be opened;
        // otherwise it may have reached the server. Only a request loop knows (facts): an error
        // built without them says nothing.
        const outcome = this.outcomeOf(error, facts);
        return new ApiError({
            message,
            status: 0,
            ...(code ? { code } : {}),
            url: redactedUrl,
            method: request.method,
            request: apiRequest,
            cause: error,
            ...(outcome !== undefined ? { outcome } : {}),
            ...(facts.attempts !== undefined ? { attempts: facts.attempts } : {}),
        });
    }
    /**
     * The ApiError for a request middleware (or finalizer) that threw: its refusal. An ApiError it
     * threw is the answer as it is. Anything else becomes status 0, code REQUEST_REFUSED, with the
     * thrown value as `cause`, and `outcome` `not_sent` (nothing went out). The request loop does not
     * send a refused request again.
     */
    requestRefusedError(error, request, facts) {
        if (isApiError(error))
            return this.toApiError(error, request, undefined, facts);
        const base = this.toApiError(error, request, undefined, { ...facts, dispatched: false });
        return new ApiError({
            message: error instanceof Error && error.message ? error.message : 'Refused by a request middleware',
            status: 0,
            code: REQUEST_REFUSED,
            ...(base.url !== undefined ? { url: base.url } : {}),
            ...(base.method !== undefined ? { method: base.method } : {}),
            ...(base.request !== undefined ? { request: base.request } : {}),
            cause: error,
            ...(base.outcome !== undefined ? { outcome: base.outcome } : {}),
            ...(base.attempts !== undefined ? { attempts: base.attempts } : {}),
        });
    }
    /**
     * Whether a failed attempt may be sent again: the rule the generated Node
     * client follows, from lib/http-wire.ts (shouldRetryFailure has the order).
     */
    shouldRetry(error, method, retryOnStatuses, responseIsFinal = false, byDefault = false, keyed = false, answered = false, answeredOk = false) {
        return shouldRetryFailure(error, method, retryOnStatuses, responseIsFinal, byDefault, keyed, answered, answeredOk);
    }
    /**
     * Exponential backoff with equal jitter, or undefined: do not retry. `retryAfterMs` (from
     * parsing `Retry-After`) takes priority over local exponential delay, and one longer than the
     * 30s cap ends the retries instead of being cut short. The 30s cap keeps `retries: 15` with a
     * persistent 503 from growing retry sleeps into minutes. The rule is retryDelay in
     * lib/http-wire.ts.
     */
    getRetryDelayMs(baseDelayMs, attempt, retryAfterMs) {
        return retryDelay(baseDelayMs, attempt, retryAfterMs);
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
    /** config.finalizers, taken at construction (see IHttpClientConfig.finalizers). */
    #finalizers;
    refreshTokenPromise = null;
    tryRefreshToken(error) {
        if (this.refreshTokenPromise)
            return this.refreshTokenPromise;
        // Clear the slot only if it still holds THIS flight: an owner may have
        // dropped it (HoodyClient does on a new session generation) and a newer
        // flight may occupy it by the time this one settles.
        const flight = this.doRefreshToken(error).finally(() => {
            if (this.refreshTokenPromise === flight)
                this.refreshTokenPromise = null;
        });
        this.refreshTokenPromise = flight;
        return flight;
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
    /**
     * True when url is inside the API's credential scope: the baseURL's origin
     * and path, or a realm host of it ({realmId}.api.hoody.com).
     *
     * The path matches on a segment boundary: a base of /v1/ covers /v1 and
     * /v1/x but not /v10/x. The realm exception requires the base's scheme AND
     * port: a realm name on another port is another service. Both used to
     * match, so the API bearer went to /v10 and to realm:8443.
     *
     * A realm host is exactly one label, a 24-hex realm id, in front of the
     * base host. Any subdomain used to count, and the kit hosts withComputer()
     * derives from a base with no api. label (computers.<base host>) are
     * subdomains of it, so every kit request carried the account bearer.
     *
     * Both URLs are resolved as the transport resolves them (resolveDestination),
     * and an omitted baseURL is the page's origin, where the browser transport
     * sends a same-origin request. A URL that does not resolve is outside: a
     * string-prefix fallback here used to judge a spelling it could not parse.
     */
    isSameOriginAndPath(url, baseURL) {
        const target = this.resolveDestination(url);
        const base = this.resolveDestination(baseURL === '' ? '/' : baseURL);
        return target !== undefined && base !== undefined && this.withinBase(target, base);
    }
    /** The scope rule of isSameOriginAndPath, over two resolved URLs. */
    withinBase(target, base) {
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            return false;
        }
        const sameOrigin = target.origin === base.origin;
        const realmSubdomain = target.protocol === base.protocol
            && target.port === base.port
            && target.hostname.endsWith('.' + base.hostname)
            && /^[0-9a-f]{24}$/i.test(target.hostname.slice(0, -base.hostname.length - 1));
        if (!sameOrigin && !realmSubdomain) {
            return false;
        }
        let basePath = base.pathname;
        while (basePath.endsWith('/')) {
            basePath = basePath.slice(0, -1);
        }
        return basePath === ''
            || target.pathname === basePath
            || target.pathname.startsWith(basePath + '/');
    }
    /**
     * url resolved the way this runtime's fetch resolves it: against the page
     * (_transportBase) when there is one, as an absolute URL otherwise;
     * undefined when it does not resolve. Every scope decision goes through
     * this, so a spelling the URL parser rewrites (HTTPS://, //host, a
     * backslash for a slash, a tab inside the scheme) is judged by where the
     * request actually goes. A case-sensitive prefix test used to call
     * HTTPS://elsewhere and //elsewhere API-relative, and the API bearer went
     * with them.
     */
    resolveDestination(url) {
        try {
            const base = _transportBase();
            return base === undefined ? new URL(url) : new URL(url, base);
        }
        catch {
            return undefined;
        }
    }
    /**
     * True when a request must not carry the API bearer: the URL it was built
     * into resolves outside the API's credential scope, or it was given as a
     * full URL to a client without a baseURL. Judged on the built URL, not on
     * how the path was spelled: a path of //elsewhere, joined onto the page's
     * origin, is elsewhere.
     */
    isExternalDestination(isFullUrl, url) {
        return (isFullUrl && !this.config.baseURL) || this.credentialScope(url) !== 'api';
    }
    /**
     * Remove the client's own Authorization, in every spelling. Header names are
     * case-insensitive, so a configured "authorization" survived a delete of
     * "Authorization" and rode out to an external host. `callHeaders` are the
     * request's own headers: an Authorization there is put back (see below).
     */
    deleteAuthorization(headers, callHeaders) {
        for (const name of Object.keys(headers)) {
            if (name.toLowerCase() === 'authorization') {
                delete headers[name];
            }
        }
        // What is withheld from another host is the client's own credential (the
        // account token, a configured Authorization header). An Authorization the
        // caller put on THIS request is for this request's destination: a script
        // behind hoody-exec that reads a Bearer token has no other way to get it.
        if (callHeaders) {
            for (const [name, value] of Object.entries(callHeaders)) {
                if (name.toLowerCase() === 'authorization' && typeof value === 'string' && value.length > 0) {
                    headers.Authorization = value;
                }
            }
        }
    }
    /**
     * Whether buildHeaders adds the SDK's own X-Hoody-Client-Version to a request: only on one built for the API
     * (`external` false) of a client whose target is 'account' (on a 'kit' client the base URL is a kit or
     * daemon), and only when neither the client's configured headers nor the call's own headers name the
     * header in any case. A value the caller set is the caller's, whatever it is, the SDK version included.
     */
    addsClientVersion(customHeaders, external) {
        if (external || this.config.target === 'kit')
            return false;
        const name = _CLIENT_VERSION_HEADER.toLowerCase();
        const named = (h) => Object.keys(h ?? {}).some((n) => n.toLowerCase() === name);
        return !named(this.config.headers) && !named(customHeaders);
    }
    /**
     * The request a middleware sent, without the X-Hoody-Client-Version the SDK itself added (`sdkAdded`, from
     * addsClientVersion) when the middleware moved it from `url` to a destination outside the API's scope.
     * request(), stream() and prepareUpgrade() all apply it, so no route lets the SDK's header reach a kit host.
     * A header the caller set is never removed; neither is one a middleware put in place of the SDK's.
     */
    withoutMovedClientVersion(sent, url, sdkAdded) {
        if (!sdkAdded || sent.url === url || !this.isExternalDestination(_isFullUrl(sent.url), sent.url)) {
            return sent;
        }
        const headers = {};
        for (const [name, value] of Object.entries(sent.headers)) {
            if (name.toLowerCase() === _CLIENT_VERSION_HEADER.toLowerCase() && value === SDK_VERSION)
                continue;
            headers[name] = value;
        }
        return { ...sent, headers };
    }
    /**
     * The credential scope a URL belongs to: 'api' for the API (the baseURL and
     * its realm hosts), otherwise the origin the URL resolves to.
     *
     * A URL that does not resolve (a relative URL with no page to resolve it
     * against, which Node's fetch refuses) is the API's only when it provably
     * stays on whatever origin it is resolved against (_isOriginRelative);
     * any other has no scope and matches no other URL. A non-HTTP URL is its
     * own scope: every opaque origin serialises as "null".
     */
    credentialScope(url) {
        const target = this.resolveDestination(url);
        if (target === undefined) {
            return _isOriginRelative(url) ? 'api' : 'unresolved ' + url;
        }
        if (this.isSameOriginAndPath(target.href, this.config.baseURL)) {
            return 'api';
        }
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            return 'opaque ' + target.href;
        }
        return target.origin;
    }
    /**
     * A credential header set for one destination never follows a middleware's
     * URL rewrite to another.
     *
     * When one middleware step moves the request into another credential scope,
     * every credential header that step did not set itself (same name, same
     * value as before the step) is dropped. The step's own credential headers
     * are kept, because it chose them for the new destination, and later steps
     * may add more. Without this, the API bearer (set before any middleware)
     * and a kit credential (kit auth is the FIRST middleware) rode out to
     * whatever origin a later middleware pointed the request at.
     *
     * A credential header is one the redaction set names (_isCredentialHeader)
     * or one recorded under middlewareContext._credentialHeaders: kitAuth sent
     * under a header name the operator chose, which no pattern can know. The
     * names recorded before the step (namesBefore) are carried into the context
     * it returns, so a middleware that replaces middlewareContext cannot erase
     * them from confinement or from the ApiError redaction.
     */
    confineCredentials(urlBefore, headersBefore, namesBefore, next) {
        const context = _carryCredentialNames(namesBefore, next);
        if (context.url === urlBefore
            || this.credentialScope(context.url) === this.credentialScope(urlBefore)) {
            return context;
        }
        const recorded = new Set();
        for (const name of _credentialHeadersOf(context.middlewareContext)) {
            recorded.add(name.toLowerCase());
        }
        // Every value per lower-cased name: a header can be present in two
        // casings (config 'Authorization' plus per-request 'authorization'), and
        // a single-value map let the losing casing's credential through.
        const before = new Map();
        for (const [name, value] of Object.entries(headersBefore)) {
            const key = name.toLowerCase();
            const values = before.get(key) ?? new Set();
            values.add(value);
            before.set(key, values);
        }
        const headers = { ...context.headers };
        for (const [name, value] of Object.entries(headers)) {
            const credential = _isCredentialHeader(name) || recorded.has(name.toLowerCase());
            if (credential && before.get(name.toLowerCase())?.has(value)) {
                delete headers[name];
            }
        }
        // A credential carried as a query parameter (a kitAuth token rule with a
        // param, recorded by the proxy-auth middleware under
        // middlewareContext._credentialQueryParams) follows the same rule: a value
        // that was on the URL before this step does not travel to the new origin.
        const names = _credentialQueryParamsOf(context.middlewareContext);
        let url = context.url;
        const nextUrl = names.length > 0 ? this.resolveDestination(context.url) : undefined;
        const prevUrl = names.length > 0 ? this.resolveDestination(urlBefore) : undefined;
        if (nextUrl !== undefined && prevUrl !== undefined) {
            let changed = false;
            for (const name of names) {
                const prevValues = prevUrl.searchParams.getAll(name);
                if (prevValues.length === 0)
                    continue;
                const current = nextUrl.searchParams.getAll(name);
                const kept = current.filter((value) => !prevValues.includes(value));
                if (kept.length !== current.length) {
                    nextUrl.searchParams.delete(name);
                    for (const value of kept)
                        nextUrl.searchParams.append(name, value);
                    changed = true;
                }
            }
            if (changed)
                url = nextUrl.toString();
        }
        return { ...context, url, headers };
    }
    async applyRequestMiddleware(initialContext, routeTag) {
        // A request middleware (or finalizer) that throws has refused the request: request() reads the mark to answer
        // REQUEST_REFUSED and not to retry. Cleared on entry, because the context is reused by the next attempt.
        _requestRefusals.delete(initialContext);
        try {
            return await this.runRequestMiddlewares(initialContext, routeTag);
        }
        catch (error) {
            _requestRefusals.add(initialContext);
            throw error;
        }
    }
    async runRequestMiddlewares(initialContext, routeTag) {
        // Header names are case-insensitive: a middleware that sets content-type next to
        // the default Content-Type replaces it, it does not add a second one (which fetch
        // would join into application/json, text/plain).
        let context = _withFoldedHeaders(initialContext);
        for (const middleware of this.config.middlewares) {
            if (!middleware.onRequest)
                continue;
            // Snapshot what this step starts from: a middleware may edit the context
            // in place rather than return a new one.
            const urlBefore = context.url;
            const headersBefore = { ...context.headers };
            const namesBefore = _credentialNamesOf(context.middlewareContext);
            const nextContext = await middleware.onRequest(context);
            if (nextContext) {
                context = nextContext;
            }
            context = _withFoldedHeaders(context);
            // Scope is checked after EVERY step, so the final URL never carries a
            // credential that was chosen for a different destination.
            context = this.confineCredentials(urlBefore, headersBefore, namesBefore, context);
        }
        // Finalizers run last, whatever use() and setMiddlewares() did to the
        // middleware list, with the same confinement after each step.
        for (const finalize of this.#finalizers) {
            const urlBefore = context.url;
            const headersBefore = { ...context.headers };
            const namesBefore = _credentialNamesOf(context.middlewareContext);
            const nextContext = await finalize(context, routeTag);
            if (nextContext) {
                context = nextContext;
            }
            context = _withFoldedHeaders(context);
            context = this.confineCredentials(urlBefore, headersBefore, namesBefore, context);
        }
        return context;
    }
    /**
     * True when a request carries a credential: a header the redaction set names
     * (Authorization, Cookie, X-*-Token, the computer claim, ...), a header
     * recorded as a kit credential under a name the operator chose, or a
     * recorded credential query parameter on its URL.
     */
    carriesCredential(url, headers, middlewareContext) {
        const recorded = new Set();
        for (const name of _credentialHeadersOf(middlewareContext)) {
            recorded.add(name.toLowerCase());
        }
        for (const name of Object.keys(headers)) {
            if (_isCredentialHeader(name) || recorded.has(name.toLowerCase())) {
                return true;
            }
        }
        const params = _credentialQueryParamsOf(middlewareContext);
        if (params.length === 0) {
            return false;
        }
        const target = this.resolveDestination(url);
        return target === undefined || params.some((name) => target.searchParams.has(name));
    }
    /**
     * Send one request through executeRequest; a request that carries a
     * credential never follows a redirect blindly.
     *
     * fetch follows a redirect by default and strips only Authorization, Cookie
     * and Proxy-Authorization on a cross-origin hop, so a kit credential under
     * any other header name (X-Hoody-Token, X-Hoody-Computer-Claim, a kitAuth
     * header the operator named) and a credential query parameter reached
     * whatever origin a server's Location named. A credentialed request is sent
     * with redirect: 'manual' and its hops are followed here, at most
     * MAX_CREDENTIALED_HOPS of them, and only while each one stays in the
     * credential scope the request was addressed to (credentialScope: the API
     * and its realm hosts, or one origin). A hop anywhere else is refused with
     * an ApiError (code REDIRECT_REFUSED) and nothing is sent there. A browser
     * does not reveal where a manual redirect leads (an opaqueredirect
     * response), so there every redirect of a credentialed request is refused.
     *
     * A redirect that would send a request body to another origin (a 307 or
     * 308, or a 301 or 302 of anything but a POST) is refused the same way,
     * whatever the body holds and whether or not the request carries a
     * credential: a sign-in POST sends its password in the body with no
     * credential header. A request with a body is therefore always followed
     * here hop by hop. A redirect that turns the request into a body-less GET
     * (303, or 301 and 302 of a POST) is followed as before, and so is one that
     * stays on the same origin. In a web browser's page or worker, which does
     * not reveal where a manual redirect leads, a request with a body is
     * refused on every redirect, as a credentialed one is: there is no way to
     * tell a harmless one from one that would forward the body.
     *
     * A value sent as JSON is encoded once, before the first hop
     * (_bodyForHops), and every hop that keeps the body sends that same text: a
     * toJSON() or a getter runs once. Any other body (text, bytes, a Blob, a
     * FormData, a stream) is handed to fetch as given on every hop.
     *
     * Methods follow fetch: 303 turns anything but HEAD into a body-less GET,
     * 301 and 302 turn a POST into one, and 307 and 308 resend the method and
     * body (a streamed body, which cannot be sent twice, is refused).
     * One sent with redirect: 'error' goes out with 'manual', and any redirect it gets is refused.
     *
     * `trackHops` (request() sets it for a method that is not idempotent and
     * for a responseIsFinal request): a request without credentials follows its
     * redirects here too, wherever they lead, as fetch would (at most 20). A
     * failure after the first hop was answered is marked `afterDispatch`: a
     * script that ran and answered 3xx, whose destination then refused the
     * connection, is not "never dispatched" and is not sent again. Any other
     * request without credentials goes out unchanged.
     */
    async sendConfined(method, url, headers, body, timeoutMs, signal, redirect, middlewareContext, trackHops = false, extras) {
        // A request that sends the browser's cookies (credentials 'include') carries a credential too.
        const confined = redirect !== 'error'
            && (this.carriesCredential(url, headers, middlewareContext) || extras?.credentials === 'include');
        // A body is never resent to another origin: such a request follows its redirects here
        // (in a web browser's page or worker, an opaque redirect is refused).
        const bodyHops = body !== undefined && body !== null;
        if (redirect === 'error') {
            // Sent with 'manual' and refused here: fetch's own redirect error reads as a network
            // failure (status 0, "fetch failed"), and a caller could retry it as one.
            const response = await this.executeRequest(method, url, headers, body, timeoutMs, signal, 'manual', extras);
            const status = response.status;
            const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
            if (response.type === 'opaqueredirect'
                || (isRedirect && (response.headers?.get('location') ?? null) !== null)) {
                try {
                    await response.body?.cancel();
                }
                catch {
                    // Discarded either way.
                }
                throw this.redirectRefusal('this request never follows a redirect', status, method.toUpperCase(), url, middlewareContext);
            }
            return response;
        }
        if (!confined && !trackHops && !bodyHops) {
            return this.executeRequest(method, url, headers, body, timeoutMs, signal, redirect, extras);
        }
        const MAX_CREDENTIALED_HOPS = confined ? 5 : 20;
        // One budget for the whole chain, not one per hop: each hop gets what is
        // left of timeoutMs, and a hop with nothing left is not sent.
        const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        const deadline = hasBudget ? Date.now() + timeoutMs : 0;
        let hopMethod = method.toUpperCase();
        let hopUrl = url;
        let hopHeaders = { ...headers };
        // A JSON value is encoded once: every hop that keeps the body sends the same text.
        let hopBody = _bodyForHops(body);
        for (let hops = 0;; hops++) {
            const hopTimeoutMs = hasBudget ? deadline - Date.now() : timeoutMs;
            if (hasBudget && hopTimeoutMs <= 0) {
                const expired = new Error('The request timed out before redirect ' + hops + ' could be followed');
                expired.name = 'AbortError';
                throw expired;
            }
            let response;
            try {
                response = await this.executeRequest(hopMethod, hopUrl, { ...hopHeaders }, hopBody, hopTimeoutMs, signal, 'manual', extras);
            }
            catch (error) {
                // A server already answered this request (the redirect): a failure on a later hop,
                // even a refused connection, is after dispatch, never "nothing was sent".
                if (hops > 0 && error !== null && typeof error === 'object') {
                    try {
                        Object.defineProperty(error, 'afterDispatch', { value: true, configurable: true });
                    }
                    catch { /* frozen */ }
                }
                throw error;
            }
            if (response.type === 'opaqueredirect') {
                throw this.redirectRefusal('the server answered with a redirect, and a browser does not reveal where it leads', response.status, hopMethod, hopUrl, middlewareContext);
            }
            const status = response.status;
            const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
            // Read only on a redirect: an injected transport may answer with a bare
            // response-like object that has no headers.
            const location = isRedirect ? response.headers?.get('location') ?? null : null;
            if (location === null) {
                return response;
            }
            try {
                await response.body?.cancel();
            }
            catch {
                // The hop's body is discarded either way.
            }
            const current = this.resolveDestination(hopUrl);
            let next;
            try {
                next = current === undefined ? undefined : new URL(location, current);
            }
            catch {
                next = undefined;
            }
            if (next === undefined || (next.protocol !== 'http:' && next.protocol !== 'https:')
                || (confined && this.credentialScope(next.href) !== this.credentialScope(hopUrl))) {
                throw this.redirectRefusal('HTTP ' + status + ' points outside the destination the request was addressed to', status, hopMethod, hopUrl, middlewareContext);
            }
            if (hops + 1 > MAX_CREDENTIALED_HOPS) {
                throw this.redirectRefusal('more than ' + MAX_CREDENTIALED_HOPS + ' redirects', status, hopMethod, hopUrl, middlewareContext);
            }
            const toGet = status === 303
                ? hopMethod !== 'HEAD'
                : (status === 301 || status === 302) && hopMethod === 'POST';
            if (!toGet && hopBody !== undefined && hopBody !== null && next.origin !== current?.origin) {
                throw this.redirectRefusal('HTTP ' + status + ' would send the request body to another origin', status, hopMethod, hopUrl, middlewareContext);
            }
            if (toGet) {
                hopMethod = 'GET';
                hopBody = undefined;
                const kept = {};
                for (const [name, value] of Object.entries(hopHeaders)) {
                    const lower = name.toLowerCase();
                    if (lower !== 'content-type' && lower !== 'content-length' && lower !== 'content-encoding'
                        && lower !== 'content-language' && lower !== 'content-location') {
                        kept[name] = value;
                    }
                }
                hopHeaders = kept;
            }
            else if (typeof ReadableStream !== 'undefined' && hopBody instanceof ReadableStream) {
                throw this.redirectRefusal('HTTP ' + status + ' asks for the streamed request body again, which cannot be sent twice', status, hopMethod, hopUrl, middlewareContext);
            }
            hopUrl = next.href;
        }
    }
    /**
     * The ApiError sendConfined throws; the URL is redacted, the credentials never leave. It is one
     * of _SDK_MADE_ERRORS: toApiError adds the attempt facts and the call's redactBodyKeys.
     */
    redirectRefusal(reason, status, method, url, middlewareContext) {
        const redactedUrl = _redactUrl(url, _credentialQueryParamsOf(middlewareContext));
        const refusal = new ApiError({
            message: 'Refused to follow a redirect: ' + reason + '. The request carries credentials, '
                + 'which are sent only to the destination it was addressed to.',
            status,
            code: 'REDIRECT_REFUSED',
            url: redactedUrl,
            method,
            request: { method, url: redactedUrl },
        });
        _SDK_MADE_ERRORS.add(refusal);
        return refusal;
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
    /** With a signal, an abort ends the wait early (sleepUnlessAborted). */
    async sleep(ms, signal) {
        if (signal !== undefined)
            return sleepUnlessAborted(ms, signal);
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
    nextRequestId() {
        this.requestCounter += 1;
        return `req-${Date.now()}-${this.requestCounter}`;
    }
    /**
     * Normalize all responses into a stable API envelope: { statusCode, message, data }.
     *
     * A body that already is the envelope keeps every other top-level field it carries
     * (`propagation`, `pagination`, `total`/`limit`/`offset`, `metadata`): those are documented
     * parts of the answer, and dropping them left the caller no way to read them. Its `message`
     * may be absent (`{statusCode, data}`, the API's `/auth/available-regions`); it is filled in
     * from the status text. The generated types (RESPONSE_ENVELOPE_FIELDS) follow the same rule.
     */
    normalizeResponseEnvelope(payload, statusCode, statusText, bodyAsData = false) {
        const fallbackMessage = statusText || (statusCode >= 200 && statusCode < 300 ? 'OK' : 'Request completed');
        if (!bodyAsData && payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const record = payload;
            // Parity with the Node http-client. A numeric `statusCode`, an own `data` key, and a
            // `message` that is a string when present: a looser gate (`message` OR `data`) would
            // reshape a resource that merely has one of those field names.
            const looksLikeEnvelope = typeof record.statusCode === 'number'
                && (!Object.prototype.hasOwnProperty.call(record, 'message') || typeof record.message === 'string')
                && Object.prototype.hasOwnProperty.call(record, 'data');
            if (looksLikeEnvelope) {
                const { statusCode: envelopeStatus, message, data, ...siblings } = record;
                return {
                    statusCode: envelopeStatus,
                    message: typeof message === 'string' ? message : fallbackMessage,
                    data,
                    ...siblings,
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
