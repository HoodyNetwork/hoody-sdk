/**
 * HTTP Client
 * Handles API requests with authentication, middleware, retries, and timeouts.
 */
import { ApiError, isApiError, RETRY_SAFE_CODES, } from './errors.js';
/** undici 8, the version the SDK depends on, needs Node 22.19. */
const _NODE_TRANSPORT_MIN_NODE = [22, 19];
/** undici's own timers answer a little after the client's, so the client's timeout error is the one seen. */
const _NODE_TRANSPORT_TIMEOUT_GRACE_MS = 1000;
/** undici's default body idle timeout: a quiet stream keeps at least this long. */
const _NODE_TRANSPORT_MIN_BODY_TIMEOUT_MS = 300000;
/** The global fetch when this module loaded: a later replacement (a test double, an interceptor) is the caller's transport. */
const _FETCH_AT_LOAD = globalThis.fetch;
let _nodeTransport;
/** True on a Node that can load the SDK's transport (22.19 or later; not Bun, not Deno). */
export function nodeTransportSupported() {
    const runtime = globalThis;
    const versions = runtime.process?.versions;
    if (!versions || typeof versions.node !== 'string' || versions.bun !== undefined || runtime.Deno !== undefined)
        return false;
    const parts = versions.node.split('.');
    const major = Number.parseInt(parts[0] ?? '', 10);
    const minor = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor))
        return false;
    return major > _NODE_TRANSPORT_MIN_NODE[0] || (major === _NODE_TRANSPORT_MIN_NODE[0] && minor >= _NODE_TRANSPORT_MIN_NODE[1]);
}
const _GLOBAL_DISPATCHER_KEYS = [Symbol.for('undici.globalDispatcher.2'), Symbol.for('undici.globalDispatcher.1')];
/** The slot the built-in fetch reads its dispatcher from, and what it holds. */
function _readGlobalDispatcher(key) {
    const slots = globalThis;
    for (const candidate of key !== undefined ? [key] : _GLOBAL_DISPATCHER_KEYS) {
        const dispatcher = slots[candidate];
        if (dispatcher !== undefined && dispatcher !== null)
            return { key: candidate, dispatcher };
    }
    return undefined;
}
/**
 * A plain undici Agent constructed with no options: what Node creates for
 * itself. Read off the instance (its class name and the options it kept), so
 * it cannot see an Agent whose only difference is a custom `factory`, or a
 * compose() wrapper around one.
 */
function _looksLikeUntouchedAgent(dispatcher) {
    if (dispatcher === null || typeof dispatcher !== 'object')
        return false;
    if (dispatcher.constructor?.name !== 'Agent')
        return false;
    const optionsKey = Object.getOwnPropertySymbols(dispatcher).find((symbol) => symbol.description === 'options');
    if (optionsKey === undefined)
        return false;
    const options = dispatcher[optionsKey];
    if (options === null || typeof options !== 'object')
        return false;
    // What a no-argument Agent keeps (Node 22.19 to 26): `{ connect: undefined, interceptors: undefined }`
    // or `{ maxOrigins: Infinity, connect: undefined }`. Any option that is set is the application's.
    return Object.entries(options).every(([name, value]) => value === undefined || value === null || (name === 'maxOrigins' && value === Infinity));
}
/**
 * The dispatcher of the built-in fetch as this module found it. The SDK's own
 * transport stands in for the built-in fetch only while that dispatcher is
 * Node's default, so that an application's dispatcher (a private CA, a client
 * certificate, a proxy, interceptors) is never sent around.
 *
 * Node creates its dispatcher the first time a fetch class is touched. If the
 * slot was empty when this module loaded, the object that appears when it
 * touches one is Node's own (`ownedByNode`). If something was already there,
 * it is judged by its look (_looksLikeUntouchedAgent). Either way a later
 * replacement is a different object and is seen on the next request.
 *
 * With NODE_USE_ENV_PROXY and a proxy variable, Node's own dispatcher is an
 * EnvHttpProxyAgent: not a plain Agent, so the built-in fetch (and the proxy)
 * is used.
 *
 * The limit: a dispatcher that looks like an untouched Agent, installed before
 * this module loaded and after something had touched fetch, is taken for the
 * default. `transport: { useGlobalDispatcher: true }` (or an injected
 * `fetch`) is the way to say so.
 */
const _DISPATCHER_AT_LOAD = (() => {
    if (!nodeTransportSupported())
        return undefined;
    try {
        const emptyBefore = _readGlobalDispatcher() === undefined;
        void globalThis.Response;
        const found = _readGlobalDispatcher();
        if (!found)
            return undefined;
        const plainAgent = found.dispatcher.constructor?.name === 'Agent';
        return { ...found, isDefault: plainAgent && (emptyBefore || _looksLikeUntouchedAgent(found.dispatcher)) };
    }
    catch {
        return undefined;
    }
})();
/** The dispatcher the built-in fetch uses is still the default one this module found at load. */
function _globalDispatcherIsDefault() {
    if (_DISPATCHER_AT_LOAD === undefined || !_DISPATCHER_AT_LOAD.isDefault)
        return false;
    return _readGlobalDispatcher(_DISPATCHER_AT_LOAD.key)?.dispatcher === _DISPATCHER_AT_LOAD.dispatcher;
}
/** Whether a request sent now, by a client with no injected fetch, goes through the SDK's own transport. */
export function nodeTransportInUse() {
    return nodeTransportSupported() && _globalDispatcherIsDefault();
}
/** An HTTP/2 session or stream failure anywhere in the cause chain. */
function _isHttp2Failure(error) {
    let current = error;
    for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
        const code = current.code;
        if (typeof code === 'string' && code.startsWith('ERR_HTTP2_'))
            return true;
        current = current.cause;
    }
    return false;
}
/** undici's own timeout, anywhere in the cause chain: which one. */
function _undiciTimeoutOf(error) {
    let current = error;
    for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
        const code = current.code;
        if (code === 'UND_ERR_HEADERS_TIMEOUT')
            return 'headers';
        if (code === 'UND_ERR_BODY_TIMEOUT')
            return 'body';
        if (code === 'UND_ERR_CONNECT_TIMEOUT')
            return 'connect';
        current = current.cause;
    }
    return undefined;
}
/** Methods shouldRetry() may send again after a lost connection. */
const _IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];
/**
 * True when the request carries a non-empty value under the idempotency-key header its
 * operation declares (IRequestData.declaredIdempotencyKeyHeader). Header names are compared ignoring
 * case. A header the operation does not declare counts for nothing: the server would not
 * deduplicate on it.
 */
function _sendsIdempotencyKey(headers, declared) {
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
 * attempt. Same rule as keyedReplayOf in lib/http-wire.ts.
 *
 * The body is fixed here: bytes are copied (the caller may reuse its buffer), a Blob is
 * immutable, a string is itself, and a value the transport would JSON-encode is encoded once with
 * the transport's own encoder, so every attempt carries the same text. Returns undefined when the
 * body cannot be sent twice byte for byte: a stream or an async iterable (read once), FormData
 * (fetch writes a new multipart boundary each time), or a value the encoder refuses. Such a
 * request is not retried. Also undefined when the request sends no key.
 *
 * The headers are the ones applyRequestMiddleware returned, folded by case (one spelling per
 * name, the last value set), so the key found here is the only key fetch sends.
 */
function _keyedReplayOf(headers, declared, wire, encode) {
    if (typeof declared !== 'string' || declared.length === 0)
        return undefined;
    const wanted = declared.toLowerCase();
    const name = Object.keys(headers).find((key) => key.toLowerCase() === wanted && typeof headers[key] === 'string' && headers[key].trim().length > 0);
    if (name === undefined)
        return undefined;
    const value = headers[name];
    if (wire === undefined || wire === null || typeof wire === 'string')
        return { name, value, body: wire };
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
 * removed and the first keyed attempt's name and value put back (_keyedReplayOf).
 */
function _withKeyedReplayHeader(headers, declared, replay) {
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
 * The default retry policy, used when neither the request nor the client sets `retries`
 * (IHttpClientConfig.retries): 2 more attempts (none for responseIsFinal), a 2 s backoff base,
 * at most 10 s of waiting in all. Same values as lib/http-wire.ts.
 */
const _DEFAULT_RETRIES = 2;
const _DEFAULT_RETRY_DELAY_MS = 2000;
const _DEFAULT_RETRY_WAIT_CAP_MS = 10_000;
/**
 * A kit of a container that has just come up answers 502 BACKEND_GATEWAY_ERROR until it is
 * listening, about 10 s after the container reports `running`. Under the default policy such a
 * failure may go again, at most _KIT_STARTING_MAX_DELAY_MS apart (a Retry-After is honoured as
 * sent), within the client's kitStartingWaitMs of waiting in all (_KIT_STARTING_WAIT_MS unless
 * set; 0 turns the wait off); shouldRetry() still decides which requests may go again. When the
 * wait runs out the request fails with KIT_NOT_READY. Same values and rules as lib/http-wire.ts.
 */
const _KIT_STARTING_MAX_DELAY_MS = 5000;
const _KIT_STARTING_WAIT_MS = 20_000;
const _KIT_NOT_READY = 'KIT_NOT_READY';
export function isKitStarting(error) {
    return error.status === 502 && error.code === 'BACKEND_GATEWAY_ERROR';
}
/** The kitStartingWaitMs a client runs with: _KIT_STARTING_WAIT_MS when unset, else a whole number of milliseconds, 0 or more. */
export function resolveKitStartingWaitMs(value) {
    if (value === undefined)
        return _KIT_STARTING_WAIT_MS;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError('kitStartingWaitMs must be a number of milliseconds, 0 or more (0 turns the wait off); got ' + String(value));
    }
    return Math.floor(value);
}
/** How many more attempts a kit still starting may take within waitMs: one per _KIT_STARTING_MAX_DELAY_MS, plus one. */
export function kitStartingRetries(waitMs) {
    return waitMs > 0 ? Math.ceil(waitMs / _KIT_STARTING_MAX_DELAY_MS) + 1 : 0;
}
export function kitNotReadyMessage(waitedMs) {
    return 'The kit did not answer within ' + Math.round(waitedMs / 1000) + ' s; it may still be starting, stopped or not installed.';
}
/** Failures of opening the connection: the request was never written, so no server ran it. */
const _CONNECT_FAILURE_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'EHOSTDOWN', 'ENETUNREACH', 'ENETDOWN', 'UND_ERR_CONNECT_TIMEOUT'];
function _isConnectFailure(error) {
    if (!error || typeof error !== 'object')
        return false;
    const failure = error;
    return (typeof failure.code === 'string' && _CONNECT_FAILURE_CODES.includes(failure.code)) || failure.syscall === 'connect';
}
/**
 * The request never reached a server: somewhere in the cause chain the connection failed to
 * open. Node reports a host with several addresses as one AggregateError; it counts when every
 * attempt in it failed that way.
 */
function _neverDispatched(error) {
    let current = error?.cause;
    for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
        // A failure on a redirect hop: the first hop was answered (sendConfined marks it).
        if (current.afterDispatch === true)
            return false;
        if (_isConnectFailure(current))
            return true;
        const attempts = current.errors;
        if (Array.isArray(attempts) && attempts.length > 0 && attempts.every(_isConnectFailure))
            return true;
        current = current.cause;
    }
    return false;
}
/**
 * The cause of an ETIMEDOUT that is this client's own deadline: the AbortError its timer raised,
 * or undici's headers timeout (the same wait, answered by the transport). Neither is retried.
 */
function _isDeadline(cause) {
    if (cause instanceof Error && cause.name === 'AbortError')
        return true;
    if (typeof cause === 'object' && cause !== null && cause.code === 'ABORT_ERR')
        return true;
    return _undiciTimeoutOf(cause) === 'headers';
}
/**
 * The reason this client's deadline aborts a request with. fetch rejects with the signal's reason,
 * so toApiError can tell its own timeout from a caller abort that landed after the timer fired.
 */
const _DEADLINE_REASONS = new WeakSet();
function _deadlineReason() {
    const reason = new DOMException('The operation timed out', 'AbortError');
    _DEADLINE_REASONS.add(reason);
    return reason;
}
/** The message of a request the caller's signal aborted, with the reason it gave (if any). */
function _callerAbortMessage(reason) {
    const detail = typeof reason === 'string' ? reason
        : reason instanceof Error && reason.name !== 'AbortError' ? reason.message
            : '';
    return detail ? `Request aborted by the caller: ${detail}` : 'Request aborted by the caller';
}
const _TEXT_SUBTYPES = new Set([
    'json', 'x-ndjson', 'ndjson', 'jsonl', 'x-jsonlines', 'json-seq', 'json5',
    'xml', 'javascript', 'x-javascript', 'ecmascript', 'yaml', 'x-yaml', 'yml', 'x-yml', 'csv',
    'x-www-form-urlencoded',
]);
const _TEXT_SUFFIXES = ['+json', '+xml', '+yaml'];
/**
 * True for a media type whose body is text: text/*, or one of the subtypes or
 * structured suffixes above. Matched on the exact subtype or suffix, never on
 * a substring: `openxmlformats` (.docx, .xlsx, .pptx) contains "xml" and is a
 * zip archive, which a substring test decoded as UTF-8 and corrupted. The same
 * rule as the CLI client (cli/http-client.ts isTextMediaType).
 */
export function isTextMediaType(contentType) {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('text/'))
        return true;
    const slash = type.indexOf('/');
    if (slash === -1)
        return false;
    const subtype = type.slice(slash + 1);
    return _TEXT_SUBTYPES.has(subtype) || _TEXT_SUFFIXES.some((suffix) => subtype.endsWith(suffix));
}
const _BYTE_FAMILIES = ['application/', 'image/', 'audio/', 'video/', 'font/'];
/**
 * True for a media type whose body is bytes: any application/* type that is
 * not text (isTextMediaType), and image/*, audio/*, video/*, font/*. Bytes are
 * the default for application/*: an Office or other vendor file
 * (vnd.openxmlformats-*, vnd.ms-*, vnd.oasis.opendocument.*) served without
 * Content-Disposition: attachment was decoded as UTF-8 and corrupted. text/*,
 * the text subtypes and a missing type are not bytes. The same rule as
 * lib/http-wire.ts isBinaryMediaType.
 */
export function isBinaryMediaType(contentType) {
    if (isTextMediaType(contentType))
        return false;
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    return _BYTE_FAMILIES.some((family) => type.startsWith(family) && type.length > family.length);
}
/** An integer literal JSON.parse cannot hold exactly needs at least 16 digits. */
const _LONG_DIGIT_RUN = /\d{16}/;
/**
 * JSON.parse, except that an integer literal outside the safe range becomes a
 * bigint instead of the nearest double. Fractions and exponents are numbers,
 * as in JSON.parse. A text with no 16-digit run goes straight to JSON.parse.
 *
 * The text is scanned once outside its strings; each unsafe integer is swapped
 * for a tagged string that the reviver turns into the bigint. The tag carries
 * a per-call random part, so a string of the document cannot be mistaken for
 * one.
 */
export function parseJsonLossless(text) {
    if (!_LONG_DIGIT_RUN.test(text))
        return JSON.parse(text);
    const tag = '\u0000int:' + Math.random().toString(36).slice(2) + ':';
    let out = '';
    let copied = 0;
    let swapped = false;
    const length = text.length;
    for (let i = 0; i < length;) {
        const ch = text.charCodeAt(i);
        if (ch === 0x22) {
            // A string: skip to its closing quote, minding escapes.
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
                // A fraction or an exponent: a double, as JSON.parse reads it.
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
 * JSON.stringify, except that a bigint is written as a plain integer literal
 * instead of throwing. Only reached when the value holds a bigint.
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
function _stringifyBody(body) {
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
 * For an HTML document, a one-line message: the status line plus the page's
 * <title> (or its first heading). undefined for anything that is not HTML.
 */
function _htmlErrorTitle(body, statusLine) {
    const head = body.slice(0, 512).trimStart().toLowerCase();
    if (!head.startsWith('<!doctype html') && !head.startsWith('<html'))
        return undefined;
    const found = /<title[^>]*>([^<]*)<\/title>/i.exec(body) ?? /<h1[^>]*>([^<]*)<\/h1>/i.exec(body);
    const title = found ? found[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (title.length === 0)
        return statusLine;
    return statusLine.endsWith(': ') || statusLine.endsWith(':') ? statusLine.trimEnd() + ' ' + title : statusLine + ' (' + title + ')';
}
/** Statuses whose Response takes no body. */
const _NULL_BODY_STATUSES = [101, 103, 204, 205, 304];
/**
 * undici's Response as the runtime's own class, so `instanceof Response` and
 * middleware written against the global keep working. The body is passed on
 * unread.
 */
function _asRuntimeResponse(response) {
    const RuntimeResponse = globalThis.Response;
    // (Checked through unknown: to the type checker both are Response, and a plain instanceof
    // would leave nothing to wrap.)
    if (typeof RuntimeResponse !== 'function' || response instanceof RuntimeResponse)
        return response;
    let wrapped;
    try {
        // A status the constructor refuses (below 200) throws: that response is passed on as it is.
        wrapped = new RuntimeResponse(_NULL_BODY_STATUSES.includes(response.status) ? null : response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    }
    catch {
        return response;
    }
    Object.defineProperty(wrapped, 'url', { value: response.url });
    Object.defineProperty(wrapped, 'redirected', { value: response.redirected });
    Object.defineProperty(wrapped, 'type', { value: response.type });
    return wrapped;
}
/**
 * After the undici import: undo what the import itself installed, and nothing else.
 *
 * undici 8 installs a default only when its own slot (`.2`) is empty: a fresh no-option Agent
 * there, and a Dispatcher1Wrapper of it in the legacy slot (`.1`), which is where the built-in
 * fetch of Node 22 to 24 reads its dispatcher. The legacy slot is put back only when that is what
 * it holds. Anything else in it was set by the application while the import was pending (or by an
 * earlier undici load), and is left. The limit: an application dispatcher set in the legacy slot
 * BEFORE undici evaluated is overwritten by undici itself, and what is put back is the one seen
 * before the import.
 */
function _restoreDispatcherSlots(before, loaded) {
    const slots = globalThis;
    const [ownKey, legacyKey] = _GLOBAL_DISPATCHER_KEYS;
    const ownBefore = before.find(([key]) => key === ownKey)?.[1];
    const legacyBefore = before.find(([key]) => key === legacyKey)?.[1];
    if (ownBefore !== undefined || legacyBefore === undefined)
        return;
    const undiciModule = (typeof loaded.Agent === 'function' ? loaded : loaded.default);
    const Agent = undiciModule?.Agent;
    const Wrapper = undiciModule?.Dispatcher1Wrapper;
    if (typeof Agent !== 'function' || typeof Wrapper !== 'function')
        return;
    const installed = slots[ownKey];
    if (!(installed instanceof Agent) || !_looksLikeUntouchedAgent(installed))
        return;
    const legacy = slots[legacyKey];
    if (legacy !== legacyBefore && legacy instanceof Wrapper) {
        try {
            slots[legacyKey] = legacyBefore;
        }
        catch { /* not writable: left as undici set it */ }
    }
}
async function _createNodeTransport() {
    if (!nodeTransportSupported() || !_globalDispatcherIsDefault())
        return null;
    // Importing undici 8 on a Node that bundles an older one re-points the
    // built-in fetch's dispatcher slot at undici 8's default Agent (HTTP/2 on).
    // The built-in fetch belongs to the rest of the process: put its dispatcher back.
    const slots = globalThis;
    const before = _GLOBAL_DISPATCHER_KEYS.map((key) => [key, slots[key]]);
    const specifier = 'undici';
    const loaded = await import(specifier);
    _restoreDispatcherSlots(before, loaded);
    const candidate = (typeof loaded.fetch === 'function' ? loaded : loaded.default);
    if (!candidate || typeof candidate.fetch !== 'function' || typeof candidate.Agent !== 'function' || typeof candidate.FormData !== 'function') {
        return null;
    }
    const undici = candidate;
    // HTTP/1.1 only. The timeouts are set per request (below); 0 here means a
    // request sent with no budget has none.
    const newAgent = () => new undici.Agent({ allowH2: false });
    let agent = newAgent();
    const withTimeouts = (dispatcher, timeoutMs) => {
        if (timeoutMs === undefined)
            return dispatcher;
        const budget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        const headersTimeout = budget ? timeoutMs + _NODE_TRANSPORT_TIMEOUT_GRACE_MS : 0;
        const bodyTimeout = budget ? Math.max(timeoutMs + _NODE_TRANSPORT_TIMEOUT_GRACE_MS, _NODE_TRANSPORT_MIN_BODY_TIMEOUT_MS) : 0;
        return dispatcher.compose((dispatch) => (opts, handler) => dispatch({ ...opts, headersTimeout, bodyTimeout }, handler));
    };
    // undici's fetch reads only its own FormData: the runtime's would go out as
    // the text "[object FormData]".
    const toUndiciBody = (body) => {
        if (typeof FormData === 'undefined' || !(body instanceof FormData) || body instanceof undici.FormData)
            return body;
        const form = new undici.FormData();
        for (const [name, value] of body.entries()) {
            if (typeof value === 'string')
                form.append(name, value);
            else
                form.append(name, value, typeof value.name === 'string' ? value.name : undefined);
        }
        return form;
    };
    const reset = () => {
        const stale = agent;
        agent = newAgent();
        void stale.close().catch(() => undefined);
    };
    return {
        undici,
        reset,
        fetch: async (input, init, timeoutMs) => {
            const own = init;
            const options = { ...(own ?? {}) };
            options.dispatcher = withTimeouts(own?.dispatcher ?? agent, timeoutMs);
            if (own?.body !== undefined && own.body !== null)
                options.body = toUndiciBody(own.body);
            try {
                return _asRuntimeResponse(await undici.fetch(input, options));
            }
            catch (error) {
                // A broken HTTP/2 session is reused for every later request to its
                // host: stop using the pool that holds it.
                if (own?.dispatcher === undefined && _isHttp2Failure(error))
                    reset();
                throw error;
            }
        },
    };
}
/**
 * The SDK's Node transport, created once per process; null where the built-in
 * fetch is used instead (see NodeTransport).
 */
export function loadNodeTransport() {
    if (_nodeTransport === undefined) {
        _nodeTransport = _createNodeTransport().catch(() => null);
    }
    return _nodeTransport;
}
/** The default transports that take a request's timeoutMs, by the fetch function the client holds. */
const _BUDGETED_FETCH = new WeakMap();
/**
 * The default transport on Node: the SDK's own (NodeTransport) once it has
 * loaded, the built-in fetch where it cannot be used.
 */
function _nodeDefaultFetch(builtin) {
    const send = async (input, init, timeoutMs) => {
        // undici's fetch does not read the runtime's Request class.
        if (typeof input !== 'string' && !(input instanceof URL))
            return builtin(input, init);
        // Asked on every request: an application that installs its own dispatcher
        // later is sent through it from then on.
        if (!_globalDispatcherIsDefault())
            return builtin(input, init);
        const transport = await loadNodeTransport();
        return transport ? transport.fetch(input, init, timeoutMs) : builtin(input, init);
    };
    const defaultFetch = (input, init) => send(input, init, undefined);
    _BUDGETED_FETCH.set(defaultFetch, send);
    return defaultFetch;
}
/**
 * Resolve the default transport once, at construction time.
 *
 * Bound to `globalThis` because an unbound reference to `globalThis.fetch`
 * throws "Illegal invocation" in browsers when called as a bare function.
 * When the runtime has no `fetch` at all we do NOT silently no-op: the
 * returned transport throws on first use with an actionable message, so a
 * missing transport surfaces at the request, not as an undefined call.
 */
function resolveDefaultFetch(useGlobalDispatcher = false) {
    const globalFetch = globalThis.fetch;
    if (typeof globalFetch === 'function') {
        const builtin = globalFetch.bind(globalThis);
        if (useGlobalDispatcher)
            return builtin;
        // On Node the SDK sends through its own transport (NodeTransport), unless
        // the global fetch was replaced after this module loaded: that replacement
        // is the transport the caller chose.
        return globalFetch === _FETCH_AT_LOAD && nodeTransportSupported() ? _nodeDefaultFetch(builtin) : builtin;
    }
    return () => {
        // FETCH_UNAVAILABLE: the same answer on every attempt, so shouldRetry treats it as final.
        throw Object.assign(new Error('No fetch implementation available in this runtime. Pass one explicitly: new HttpClient({ fetch: myFetch }).'), { code: 'FETCH_UNAVAILABLE' });
    };
}
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
// Extract values of auth-like headers so they contribute to the GET cache
// partition key. Without this, only config.token is keyed, so a caller
// supplying Authorization via config.headers / data.headers could receive
// a cached response baked under a different identity.
function hashAuthHeaders(configHeaders, requestHeaders) {
    const merged = {};
    for (const src of [configHeaders, requestHeaders]) {
        if (!src)
            continue;
        for (const [k, v] of Object.entries(src))
            merged[k.toLowerCase()] = v;
    }
    // Mirrors lib/redact.ts SECRET_HEADER_RE so every credential-bearing
    // header contributes to the cache partition.
    const AUTH_KEY_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-.*-lease|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/;
    const parts = [];
    for (const k of Object.keys(merged).sort()) {
        if (AUTH_KEY_RE.test(k))
            parts.push(k + '=' + merged[k]);
    }
    return parts.length ? parts.join('\n') : '';
}
/**
 * Detect one-shot request bodies (ReadableStream, async iterable) that
 * cannot be replayed safely on retry. Matches the same check in the
 * browser http-client.
 */
function _isNonReplayableBody(body) {
    if (body === undefined || body === null)
        return false;
    const g = globalThis;
    if (typeof g.ReadableStream !== 'undefined' && body instanceof g.ReadableStream)
        return true;
    if (typeof body[Symbol.asyncIterator] === 'function')
        return true;
    return false;
}
/**
 * Redaction helpers — keep in sync with lib/redact.ts.
 * Inlined here because generated/http-client.ts is self-contained.
 */
const _SECRET_HEADER_RE = /^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-.*-secret|x-.*-credential(?:s)?|x-.*-lease|x-auth(?:-.*)?|api[-_]?key|apikey|bearer|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|bearer[-_]?token|secret[-_]?key|client[-_]?secret|private[-_]?key|proxy[-_]?authorization|set[-_]?cookie)$/i;
/**
 * Headers that carry a credential, for the credential-scope check in
 * applyRequestMiddleware(): the redaction set plus the kit container claim.
 * The browser client defines the same predicate over lib/redact.ts.
 */
function _isCredentialHeader(name) {
    return _SECRET_HEADER_RE.test(name) || name.toLowerCase() === 'x-hoody-container-claim';
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
 * containers edge's errorCode (BACKEND_GATEWAY_ERROR), then a code-shaped error
 * field (hoody-api puts its code there: TOKEN_CEILING_EXCEEDED,
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
// Extended credential key set; keep in sync with lib/redact.ts.
const _SECRET_FIELD_RE = /^(token|hdy[-_]?token|api[-_]?key|apikey|password|passwd|pwd|secret|auth|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|session[-_]?token|temp[-_]?token|kit[-_]?token|otp|device[-_]?code|code[-_]?verifier|code[-_]?challenge|authorization|cookie|private[-_]?key|client[-_]?secret|secret[-_]?access[-_]?key|aws[-_]?secret|ssh[-_]?pass(?:word)?|socks5[-_]?pass(?:word)?|proxy[-_]?pass(?:word)?|db[-_]?pass(?:word)?|kit[-_]?pass(?:word)?|local[-_]?pass(?:word)?|auth[-_]?pass(?:word)?|cur[-_]?pass(?:word)?|credential|credentials|key|jwt)$/i;
// (Keep in sync with lib/redact.ts isSecretFieldName.) _SECRET_FIELD_RE is a list of whole names, so it knows only the names someone
// wrote down. The specs name credentials in many more ways (current_password,
// key_file_pass, client_credentials, sse_customer_key, confirm_token, …), all
// built the same way: qualifiers, then the noun that says what the value is.
// _isSecretFieldName reads the noun.
const _SECRET_NOUNS = ['password', 'passwd', 'pwd', 'pass', 'passphrase', 'secret', 'secrets', 'token', 'credential', 'credentials', 'cookie', 'cookies', 'jwt'];
// A leading verb makes the field a switch about the secret, not the secret (has_password, persist_credentials).
const _FLAG_PREFIXES = ['has', 'is', 'ask', 'persist', 'require', 'requires', 'cors', 'use', 'allow', 'remember'];
// "..._token" that is a paging cursor.
const _CURSOR_QUALIFIERS = ['page', 'next', 'prev', 'previous', 'continuation', 'pagination', 'cursor'];
// "..._key" that is not key material.
const _PLAIN_KEY_QUALIFIERS = ['public', 'idempotency', 'cache', 'logical', 'action', 'sort', 'partition', 'primary', 'foreign', 'host'];
// "..._code" that is a one-time credential (a bare `code` is an error code; see _isOauthCodeContext).
const _SECRET_CODE_QUALIFIERS = ['otp', 'totp', 'mfa', 'auth', 'authorization', 'device', 'verification', 'recovery', 'backup'];
// A trailing encoding says how the value is written, not what it is (sse_customer_key_base64, key_pem).
const _ENCODING_SUFFIXES = ['base64', 'b64', 'b64url', 'hex', 'pem'];
// Keys that sit beside an OAuth authorization `code`.
const _OAUTH_CODE_SIBLINGS = ['state', 'redirect_uri', 'redirecturi', 'code_verifier', 'codeverifier', 'grant_type', 'granttype', 'client_id', 'clientid'];
/** snake_case, kebab-case and camelCase names as lower-case words. */
function _nameWords(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}
/**
 * True for a body field or query parameter name that carries a credential:
 * a name in _SECRET_FIELD_RE, or one whose last word is a secret noun
 * (`current_password`, `key_file_pass`, `client_credentials`, `confirm_token`,
 * `sse_customer_key`, `otp_code`, `approver_lease`). Names that only mention a
 * secret are not (`has_password`, `token_url`, `max_tokens`, `public_key`,
 * `idempotency_key`, `next_page_token`).
 */
function _isSecretFieldName(name) {
    if (typeof name !== 'string' || name.length === 0)
        return false;
    if (_SECRET_FIELD_RE.test(name))
        return true;
    const words = _nameWords(name);
    while (words.length > 1 && _ENCODING_SUFFIXES.includes(words[words.length - 1]))
        words.pop();
    if (words.length < 2)
        return words.length === 1 && (words[0] === 'key' || _SECRET_NOUNS.includes(words[0]));
    if (_FLAG_PREFIXES.includes(words[0]))
        return false;
    const noun = words[words.length - 1];
    const qualifiers = words.slice(0, -1);
    if (noun === 'token')
        return !qualifiers.some((word) => _CURSOR_QUALIFIERS.includes(word));
    if (_SECRET_NOUNS.includes(noun))
        return true;
    if (noun === 'key')
        return !qualifiers.some((word) => _PLAIN_KEY_QUALIFIERS.includes(word));
    if (noun === 'code')
        return qualifiers.some((word) => _SECRET_CODE_QUALIFIERS.includes(word));
    if (noun === 'lease')
        return qualifiers.includes('approver');
    return false;
}
/** In a URL a signature is the credential too (a presigned link: X-Amz-Signature, sig). */
function _isSecretUrlParam(name) {
    if (_isSecretFieldName(name))
        return true;
    const words = _nameWords(name);
    const noun = words[words.length - 1];
    return noun === 'signature' || noun === 'sig';
}
/**
 * A bare `code` is an error code almost everywhere, and masking it hid every
 * server error code that was printed through the redactor. It is a credential
 * only as an OAuth authorization code, which travels with `state`,
 * `redirect_uri`, `code_verifier`, `grant_type` or `client_id`.
 */
function _isOauthCodeContext(keys) {
    return keys.some((key) => _OAUTH_CODE_SIBLINGS.includes(key.toLowerCase()));
}
/**
 * A string that is one absolute URL carrying userinfo or a secret parameter is redacted as a URL.
 * So is a relative one (it starts with `/` or `?`, has no whitespace and carries a query): its
 * query gets _redactUrl's relative rule, the OAuth-context `code` included.
 */
function _scrubUrlValue(text, extra) {
    if (/^[/?]\S*$/.test(text) && text.includes('?'))
        return _redactUrl(text, extra);
    if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(text))
        return text;
    if (text.length > 8192)
        return _scrubLongUrl(text);
    try {
        const u = new URL(text);
        const keys = Array.from(u.searchParams.keys());
        const oauth = _isOauthCodeContext(keys);
        const secret = u.username !== '' || u.password !== ''
            || keys.some((key) => _isSecretUrlParam(key) || _isExtraName(key, extra) || (oauth && key.toLowerCase() === 'code'));
        return secret ? _redactUrl(text, extra) : text;
    }
    catch {
        return text;
    }
}
// URL autologin token value-shape; keep in sync with lib/redact.ts HDY_TOKEN_VALUE_RE.
// Scrubs an hdy_ token wherever it appears (path segment, non-secret param, or a
// secret param the field-name pass missed) so a launch token is never logged whole.
const _HDY_TOKEN_VALUE_RE = /hdy_[A-Za-z0-9_-]{20,}/g;
const _REDACT_PLACEHOLDER = '[REDACTED]';
const _REDACT_MAX_DEPTH = 6;
/**
 * extraNames: header names recorded as carrying a credential (kitAuth under an
 * operator-chosen header name, lib/redact.ts redactHeaders), matched case-insensitively.
 */
function _redactHeaders(headers, extraNames) {
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => _SECRET_HEADER_RE.test(k) || _isExtraName(k, extraNames) ? [k, _REDACT_PLACEHOLDER] : [k, v]));
}
/** The credential query parameter names a request recorded (lib/redact.ts credentialQueryParamsOf). */
function _credentialQueryParamsOf(middlewareContext) {
    const v = middlewareContext?.['_credentialQueryParams'];
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.length > 0) : [];
}
/** The credential header names a request recorded (lib/redact.ts credentialHeadersOf). */
function _credentialHeadersOf(middlewareContext) {
    const v = middlewareContext?.['_credentialHeaders'];
    return Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.length > 0) : [];
}
/** Case-insensitive membership in the extra secret names (lib/redact.ts isExtraName). */
function _isExtraName(name, extra) {
    if (!extra || extra.length === 0)
        return false;
    const lower = _wellFormed(name).toLowerCase();
    return extra.some((n) => typeof n === 'string' && _wellFormed(n).toLowerCase() === lower);
}
/**
 * Lone surrogates → U+FFFD, as a URL serialiser writes them, so a configured
 * name compares equal to the key URLSearchParams decodes back (lib/redact.ts wellFormed).
 */
function _wellFormed(s) {
    const f = s.toWellFormed;
    return typeof f === 'function' ? f.call(s) : s;
}
function _escapeRegExp(s) {
    return s.replace(/[.*+?^(){}$|[\]\\]/g, '\\$&');
}
/**
 * Scrub name=value pairs for the given names anywhere in a string (lib/redact.ts
 * scrubNamedParams): raw, percent-encoded and form-encoded (a+b) spellings, matched
 * case-insensitively. It runs while an error is being built, so it never throws: a
 * failure redacts the whole value instead of masking the real error.
 */
function _scrubNamedParams(text, extra) {
    if (!extra || extra.length === 0 || typeof text !== 'string')
        return text;
    try {
        let out = text;
        for (const name of extra) {
            if (typeof name !== 'string' || name.length === 0)
                continue;
            const forms = new Set([
                name,
                // URLSearchParams never throws: a lone surrogate becomes U+FFFD, as a URL
                // serialiser writes it.
                new URLSearchParams([[name, '']]).toString().slice(0, -1),
            ]);
            try {
                forms.add(encodeURIComponent(name));
            }
            catch {
                // Lone surrogate: no URL spells the name this way.
            }
            const alternatives = [...forms].map(_escapeRegExp).join('|');
            const re = new RegExp('([?&])(' + alternatives + ')=([^&#\\s"\']*)', 'gi');
            out = out.replace(re, '$1$2=' + encodeURIComponent(_REDACT_PLACEHOLDER));
        }
        return out;
    }
    catch {
        return _REDACT_PLACEHOLDER;
    }
}
/**
 * An absolute URL too long to parse cheaply: its userinfo and its whole query
 * string go, the rest stays. One pass over the text.
 */
function _scrubLongUrl(text) {
    const authorityStart = text.indexOf('//') + 2;
    let authorityEnd = authorityStart;
    while (authorityEnd < text.length && text[authorityEnd] !== '/' && text[authorityEnd] !== '?' && text[authorityEnd] !== '#')
        authorityEnd++;
    const at = text.lastIndexOf('@', authorityEnd - 1);
    const userinfo = at >= authorityStart;
    const queryAt = text.indexOf('?', authorityEnd);
    const hashAt = text.indexOf('#', authorityEnd);
    const hasQuery = queryAt >= 0 && (hashAt < 0 || queryAt < hashAt);
    if (!userinfo && !hasQuery)
        return text.replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
    const head = text.slice(0, authorityStart) + (userinfo ? _REDACT_PLACEHOLDER + '@' + text.slice(at + 1, authorityEnd) : text.slice(authorityStart, authorityEnd));
    const pathEnd = hasQuery ? queryAt : hashAt >= 0 ? hashAt : text.length;
    const path = text.slice(authorityEnd, pathEnd);
    const query = hasQuery ? '?' + encodeURIComponent(_REDACT_PLACEHOLDER) : '';
    const fragment = hashAt >= 0 ? text.slice(hashAt) : '';
    return (head + path + query + fragment).replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
}
function _redactUrl(url, extraParamNames) {
    if (typeof url !== 'string' || url.length === 0)
        return url;
    try {
        const u = new URL(url);
        if (u.username)
            u.username = _REDACT_PLACEHOLDER;
        if (u.password)
            u.password = _REDACT_PLACEHOLDER;
        const keys = Array.from(u.searchParams.keys());
        const oauth = _isOauthCodeContext(keys);
        for (const key of keys) {
            if (_isSecretUrlParam(key) || _isExtraName(key, extraParamNames) || (oauth && key.toLowerCase() === 'code'))
                u.searchParams.set(key, _REDACT_PLACEHOLDER);
        }
        // Belt-and-suspenders: scrub any hdy_-shaped value by shape (path segments,
        // renamed params) that the field-name pass above would miss.
        return u.toString().replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
    }
    catch {
        // Relative URLs throw from the URL constructor; fall back to textual
        // query scrub so verbose logs with an empty baseURL still redact
        // secret query params.
        const qIdx = url.indexOf('?');
        if (qIdx < 0)
            return url;
        const hashIdx = url.indexOf('#', qIdx);
        const queryEnd = hashIdx >= 0 ? hashIdx : url.length;
        const base = url.slice(0, qIdx + 1);
        const queryRaw = url.slice(qIdx + 1, queryEnd);
        const tail = hashIdx >= 0 ? url.slice(hashIdx) : '';
        if (queryRaw.length === 0)
            return url;
        const pairs = queryRaw.split('&');
        // The same OAuth-context rule as the absolute branch: a code beside state, redirect_uri, ...
        // is a one-time credential.
        const decodedKeys = [];
        for (const pair of pairs) {
            const eq = pair.indexOf('=');
            try {
                decodedKeys.push(decodeURIComponent((eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, ' ')));
            }
            catch { /* not a key this rule can read */ }
        }
        const oauth = _isOauthCodeContext(decodedKeys);
        const parts = pairs.map(pair => {
            const eq = pair.indexOf('=');
            if (eq < 0)
                return pair;
            const k = pair.slice(0, eq);
            try {
                const dk = decodeURIComponent(k);
                if (_isSecretUrlParam(dk) || _isExtraName(dk, extraParamNames) || (oauth && dk.toLowerCase() === 'code'))
                    return k + '=' + encodeURIComponent(_REDACT_PLACEHOLDER);
            }
            catch { /* leave as-is on decode failure */ }
            return pair;
        });
        return (base + parts.join('&') + tail).replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER);
    }
}
// A byte or stream value is never walked: Object.entries gives a typed array
// one key per byte, and an error answer to a 4 MiB upload ran the process out
// of memory. Only its type and size are kept, read through the built-in
// getters (internal-slot checks), with a label from a fixed set (keep in sync
// with lib/redact.ts binaryPlaceholder).
const _TYPED_ARRAY_PROTO = Object.getPrototypeOf(Uint8Array.prototype);
const _typedArrayName = Object.getOwnPropertyDescriptor(_TYPED_ARRAY_PROTO, Symbol.toStringTag).get;
const _typedArrayByteLength = Object.getOwnPropertyDescriptor(_TYPED_ARRAY_PROTO, 'byteLength').get;
const _dataViewByteLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get;
const _arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const _sharedArrayBufferByteLength = typeof SharedArrayBuffer === 'function'
    ? Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')?.get
    : undefined;
/** The getter's answer for `v`, or undefined when `v` is not the type the getter belongs to. */
function _brandedSize(get, v) {
    if (get === undefined)
        return undefined;
    try {
        return get.call(v);
    }
    catch {
        return undefined;
    }
}
function _binaryPlaceholder(v) {
    if (ArrayBuffer.isView(v)) {
        const name = _typedArrayName.call(v);
        return typeof name === 'string'
            ? `[binary ${name}, ${Number(_typedArrayByteLength.call(v))} bytes]`
            : `[binary DataView, ${Number(_dataViewByteLength.call(v))} bytes]`;
    }
    // An async iterable is a stream body whatever its prototype (an object literal can be one).
    if (typeof v[Symbol.asyncIterator] === 'function')
        return '[stream]';
    // A JSON body is made of plain objects: no other byte or stream type to look for.
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null)
        return undefined;
    const ab = _brandedSize(_arrayBufferByteLength, v);
    if (ab !== undefined)
        return `[binary ArrayBuffer, ${Number(ab)} bytes]`;
    const sab = _brandedSize(_sharedArrayBufferByteLength, v);
    if (sab !== undefined)
        return `[binary SharedArrayBuffer, ${Number(sab)} bytes]`;
    const g = globalThis;
    const blob = g.Blob === undefined ? undefined : _brandedSize(Object.getOwnPropertyDescriptor(g.Blob.prototype, 'size')?.get, v);
    if (blob !== undefined)
        return `[binary ${g.File !== undefined && v instanceof g.File ? 'File' : 'Blob'}, ${Number(blob)} bytes]`;
    if (g.ReadableStream !== undefined && v instanceof g.ReadableStream)
        return '[stream]';
    return undefined;
}
function _redactSensitiveValue(v, _depth = 0, _seen = new WeakSet(), extraFieldNames) {
    if (_depth > _REDACT_MAX_DEPTH)
        return '[depth-limit]';
    if (v === null || v === undefined)
        return v;
    // Value-shape scrub for hdy_ launch tokens embedded in string values, and the
    // recorded credential parameters in any URL-like string (keep in sync with
    // lib/redact.ts redactSensitiveValue).
    if (typeof v === 'string')
        return _scrubNamedParams(_scrubUrlValue(v.replace(_HDY_TOKEN_VALUE_RE, _REDACT_PLACEHOLDER), extraFieldNames), extraFieldNames);
    if (typeof v !== 'object')
        return v;
    // An object that throws while it is read becomes [unreadable]: this runs
    // while an error is being built, and must not replace that error.
    try {
        const binary = _binaryPlaceholder(v);
        if (binary !== undefined)
            return binary;
        if (_seen.has(v))
            return '[Circular]';
        _seen.add(v);
        if (Array.isArray(v))
            return v.map((x) => _redactSensitiveValue(x, _depth + 1, _seen, extraFieldNames));
        const out = {};
        const oauth = _isOauthCodeContext(Object.keys(v));
        for (const [k, val] of Object.entries(v)) {
            out[k] = _isSecretFieldName(k) || _isExtraName(k, extraFieldNames) || (oauth && k.toLowerCase() === 'code')
                ? _REDACT_PLACEHOLDER
                : _redactSensitiveValue(val, _depth + 1, _seen, extraFieldNames);
        }
        return out;
    }
    catch {
        return '[unreadable]';
    }
}
// Cap the Node GET cache. Node has more memory than a browser tab, but an
// unbounded Map still leaks over long-running daemon processes. LRU
// eviction on insert when the cap is reached.
const _NODE_CACHE_MAX_ENTRIES = 1024;
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
 * The errors an event stream raises that hold only fixed text: built here,
 * from constants and numbers. Everything else is replaced by one of them
 * before it leaves the stream (_toStreamError).
 */
const _cleanStreamErrors = new WeakSet();
/** A fixed-text error with a fixed name (StreamClosedError, AbortError). */
function _streamError(name, message) {
    const error = new Error(message);
    error.name = name;
    _cleanStreamErrors.add(error);
    return error;
}
/** An ApiError built here from fixed text and numbers only (STREAM_FRAME_TOO_LARGE). */
function _cleanApiError(params) {
    const error = new ApiError(params);
    _cleanStreamErrors.add(error);
    return error;
}
/** The fixed sentence for each code an event-stream ApiError may carry. */
const _STREAM_ERROR_SENTENCES = {
    ABORTED: 'The event stream request was aborted by the caller',
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
 * A thrown value's text is never passed on: a transport exception, a body
 * error, a server's error message, code or body, a content type, an abort
 * reason's message and name can each hold a credential or a user's data,
 * and a stream's errors reach logs, Views and models. The replacement keeps
 * what is safe to act on (a fixed code from _STREAM_ERROR_SENTENCES, the
 * status, the client-redacted URL and the method, Retry-After) with a fixed
 * sentence. The original goes only to `options.onDiagnostic`.
 *
 * One more code is kept: on an HTTP error, a code the operation's spec
 * documents (`documentedCodes`, from x-error-codes), with the spec's title for
 * it as the message. The code is matched against that list and the text comes
 * from the spec, so nothing the server wrote is passed on.
 */
function _toStreamError(error, acceptedStatus, documentedCodes) {
    if (typeof error === 'object' && error !== null && _cleanStreamErrors.has(error))
        return error;
    if (isApiError(error)) {
        const status = Number.isInteger(error.status) && error.status > 0 ? error.status : 0;
        const documented = status > 0 && typeof error.code === 'string' && documentedCodes !== undefined
            && Object.prototype.hasOwnProperty.call(documentedCodes, error.code) && typeof documentedCodes[error.code] === 'string';
        const code = documented
            ? error.code
            : typeof error.code === 'string' && Object.prototype.hasOwnProperty.call(_STREAM_ERROR_SENTENCES, error.code)
                ? error.code
                : status > 0 ? 'STREAM_HTTP_ERROR' : 'STREAM_REQUEST_FAILED';
        const clean = new ApiError({
            message: documented ? (documentedCodes[code] || _STREAM_ERROR_SENTENCES.STREAM_HTTP_ERROR) : _STREAM_ERROR_SENTENCES[code],
            status,
            code,
            ...(typeof error.url === 'string' ? { url: error.url } : {}),
            ...(typeof error.method === 'string' ? { method: error.method } : {}),
        });
        const retryAfterMs = error.retryAfterMs;
        if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
            clean.retryAfterMs = retryAfterMs;
        }
        _cleanStreamErrors.add(clean);
        return clean;
    }
    const code = acceptedStatus === undefined ? 'STREAM_REQUEST_FAILED' : 'STREAM_READ_FAILED';
    const clean = new ApiError({ message: _STREAM_ERROR_SENTENCES[code], status: acceptedStatus ?? 0, code });
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
export class HttpClient {
    config;
    cache = new Map();
    ipv4DnsCache = new Map();
    requestCounter = 0;
    /**
     * The transport the CALLER injected, or null. Kept beside `config.fetch` (which is always set,
     * to the resolved global when nothing was injected) so `getInjectedFetch()` can answer the only
     * question a derivation may ask: was one injected?
     */
    injectedFetch;
    /**
     * The transport options the CALLER passed, or null. `config.transport` holds them normalised
     * (defaults filled in), which is not what a derived client should be told the caller asked for.
     */
    configuredTransport;
    constructor(config = {}) {
        const transport = config.transport || {};
        const forceIPv4Cache = config.forceIPv4Cache || {};
        this.injectedFetch = config.fetch ?? null;
        this.configuredTransport = config.transport ? { ...config.transport } : null;
        this.#finalizers = config.finalizers ? [...config.finalizers] : [];
        this.config = {
            baseURL: config.baseURL || '',
            token: config.token || '',
            // Resolved ONCE. Every later request reads this field, so the client's
            // transport cannot drift from the one the caller injected even if the
            // global is replaced mid-process.
            fetch: config.fetch || resolveDefaultFetch(config.transport?.useGlobalDispatcher === true),
            // Use ?? so explicit timeout: 0 (caller opt-out) survives the
            // constructor instead of being clobbered into 30s.
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
            forceIPv4: config.forceIPv4 || false,
            forceIPv4Cache: {
                enabled: forceIPv4Cache.enabled !== false,
                ttlMs: forceIPv4Cache.ttlMs ?? 60000,
            },
            transport: {
                keepAlive: transport.keepAlive !== false,
            },
            middlewares: config.middlewares ? [...config.middlewares] : [],
            onError: config.onError || (async () => false),
            onTokenExpired: config.onTokenExpired || (async () => undefined),
            ...(config.onKitAuthExpired ? { onKitAuthExpired: config.onKitAuthExpired } : {}),
            refreshToken: config.refreshToken || (async () => undefined),
            acceptRefreshedToken: config.acceptRefreshedToken || (() => true),
            autoRetryAuth: config.autoRetryAuth !== false,
            clientId: config.clientId || '',
            clientName: config.clientName || '',
        };
    }
    clearCache() {
        this.cache.clear();
    }
    async close() {
        this.clearCache();
        this.ipv4DnsCache.clear();
    }
    getBaseURL() {
        return this.config.baseURL;
    }
    setToken(token) {
        this.config.token = token;
    }
    /**
     * The transport this client was constructed with (or the resolved global
     * default). Exposed so callers can assert the injection took effect and so
     * higher layers can compose on the SAME transport instead of the global.
     */
    getFetch() {
        return this.config.fetch;
    }
    /**
     * The transport the CALLER injected, or `undefined` when none was.
     *
     * The one accessor every derivation uses (`withRealm`, `withContainer`, the realm-error
     * introspection client). It exists because the two HTTP implementations store the injection
     * differently — this one resolves it into `config.fetch`, the browser build keeps it out of
     * `config` on purpose — so a derivation that reads `config.fetch` silently drops the injection
     * in the browser build.
     */
    getInjectedFetch() {
        return this.injectedFetch ?? undefined;
    }
    /**
     * The transport options the CALLER passed, or `undefined` when none were.
     *
     * What every derivation (`withRealm`, `withContainer`, the realm-error introspection client)
     * copies, never the normalised `config.transport`: the browser build warns about every
     * Node-only knob it is handed, and a normalised copy hands it all of them.
     */
    getConfiguredTransport() {
        return this.configuredTransport === null ? undefined : { ...this.configuredTransport };
    }
    use(middleware) {
        this.config.middlewares.push(middleware);
    }
    setMiddlewares(middlewares) {
        this.config.middlewares = [...middlewares];
    }
    async request(method, path, data = {}) {
        if (data.idempotencyKeyHeader !== undefined) {
            data = { ...data, headers: withIdempotencyKey(data.headers, this.config.headers, data.idempotencyKeyHeader) };
        }
        const upperMethod = method.toUpperCase();
        const isFullUrl = _isFullUrl(path);
        const url = isFullUrl
            ? this.buildUrlFromFull(path, data.query)
            : this.buildUrl(path, data.query);
        const isVerbose = this.isVerboseLoggingEnabled();
        // Kit service URLs are full URLs that don't match the API baseURL origin.
        // Never send the API JWT to Kit services — they have their own auth.
        // Treat every full-URL request as external when baseURL is empty:
        // a truthy short-circuit on this.config.baseURL would skip the same-
        // origin check, so Authorization would ride out to arbitrary hosts
        // whenever the consumer omitted baseURL from HoodyClientConfig.
        // Judged on the built URL wherever it resolves (isExternalDestination), so
        // a path spelled //elsewhere is elsewhere.
        const isExternalUrl = this.isExternalDestination(isFullUrl, url);
        // Cache identity partitioning: the cache key includes a hash of the
        // Authorization header the request would have used, so token rotation /
        // cross-identity reuse of a single HttpClient instance cannot serve a
        // response baked to a different identity. Kit-auth uses a different header
        // path and does not participate in this GET cache.
        const isGet = upperMethod === 'GET';
        // Mix in Authorization / X-Api-Key / etc. from config.headers +
        // data.headers so per-request auth overrides partition the cache.
        const headerIdentity = isGet ? hashAuthHeaders(this.config.headers, data.headers) : '';
        const cacheIdentity = isGet ? hashIdentity((this.config.token ?? '') + '|' + headerIdentity) : '';
        // Cache key must disambiguate envelope vs. raw body AND response parser
        // (json/text/arrayBuffer/blob). Without this a GET with rawResponse:true
        // followed by the same GET without it can serve the wrong shape to the
        // second caller (cache-shape poisoning).
        const cacheShape = isGet
            // ...and the integer reading: a lossless answer holds bigints, a plain one rounded numbers.
            ? (data.rawResponse === true ? 'R' : 'E') + ':' + (data.responseType || 'auto') + (data.losslessIntegers === true ? ':L' : '')
            : '';
        const cacheKey = `${upperMethod}:${cacheIdentity}:${cacheShape}:${url}`;
        // Opt-in. A default-on cache answered repeated state reads and state-
        // changing kit GETs from memory for five seconds.
        const cacheEnabled = this.config.cache.enabled === true;
        const requestCache = data.cache !== undefined ? data.cache : cacheEnabled;
        // ?? preserves explicit ttl:0.
        const ttl = typeof requestCache === 'number'
            ? requestCache
            : (this.config.cache.ttl ?? 5000);
        // Treat HEAD + OPTIONS as non-mutating (parity with the browser
        // http-client). A HEAD for existence-check or an OPTIONS preflight
        // must not flush the GET response cache.
        const isNonMutating = isGet || upperMethod === 'HEAD' || upperMethod === 'OPTIONS';
        if (!isNonMutating) {
            this.clearCache();
        }
        if (isGet && requestCache && this.cache.has(cacheKey)) {
            const entry = this.cache.get(cacheKey);
            if (Date.now() - entry.timestamp < ttl) {
                return entry.data;
            }
            this.cache.delete(cacheKey);
        }
        // Nobody set retries: the default policy (_DEFAULT_RETRIES, see IHttpClientConfig.retries).
        const explicitRetries = data.retries ?? this.config.retries;
        const retryByDefault = explicitRetries === undefined;
        const retries = Math.max(0, explicitRetries ?? (data.responseIsFinal === true ? 0 : _DEFAULT_RETRIES));
        // A kit still starting may take more attempts than `retries` (decided per failure below).
        const kitStartingWaitMs = this.config.kitStartingWaitMs;
        const attemptBudget = retryByDefault ? Math.max(retries, kitStartingRetries(kitStartingWaitMs)) : retries;
        const timeoutMs = data.timeoutMs ?? this.config.timeout;
        const retryDelayMs = data.retryDelayMs ?? this.config.retryDelayMs ?? (retryByDefault ? _DEFAULT_RETRY_DELAY_MS : 250);
        let retryWaitedMs = 0;
        const retryOnStatuses = data.retryOnStatuses ?? this.config.retryOnStatuses;
        const authRetryEnabled = data.authRetry ?? this.config.autoRetryAuth;
        const rawResponse = data.rawResponse === true;
        const responseType = data.responseType || 'auto';
        let authRetried = false;
        let kitAuthRetried = false;
        let lastError;
        // Stash the new Kit auth returned by onKitAuthExpired so the NEXT retry
        // actually uses it. Without this the callback's return value would be
        // checked only for truthiness, the replay would re-use the expired
        // creds, and 401s would loop until the retry budget drained.
        let pendingKitAuthOverride = undefined;
        // Pre-detect non-replayable bodies so auth retries skip replay when
        // the body would be empty on retry.
        const bodyIsNonReplayable = _isNonReplayableBody(data.body);
        // A keyed request's key and wire body as its first keyed attempt sent them; every later
        // attempt sends exactly these (_keyedReplayOf). keyedUnreplayable: it sent a key with a body
        // that cannot go out twice byte for byte, so it is not retried.
        let keyedReplay;
        let keyedUnreplayable = false;
        const keyHeader = data.declaredIdempotencyKeyHeader ?? data.idempotencyKeyHeader;
        for (let attempt = 1; attempt <= attemptBudget + 1; attempt++) {
            // The token this attempt goes out with: a 401 is about THIS token, which may no longer be
            // the client's by the time the answer arrives.
            const tokenSent = this.config.token;
            const headers = this.buildHeaders(data.headers);
            if (isExternalUrl) {
                // Every spelling: a lower-case authorization survived the exact-case
                // delete.
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
            // Inject pendingKitAuthOverride into middlewareContext on retry so
            // proxy-auth middleware picks up the fresh creds instead of
            // reinjecting the stale ones.
            const mergedMiddlewareContext = (data.middlewareContext || pendingKitAuthOverride !== undefined)
                ? { ...(data.middlewareContext ?? {}), ...(pendingKitAuthOverride !== undefined ? { kitAuth: pendingKitAuthOverride } : {}) }
                : undefined;
            const requestContext = {
                requestId: this.nextRequestId(),
                attempt,
                method: upperMethod,
                path,
                url,
                headers,
                timeoutMs,
                retries,
                ...(data.query !== undefined ? { query: data.query } : {}),
                ...(data.body !== undefined ? { body: data.body } : {}),
                ...(mergedMiddlewareContext !== undefined ? { middlewareContext: mergedMiddlewareContext } : {}),
            };
            // Wrap applyRequestMiddleware INSIDE the shared try/catch (parity
            // with the browser http-client). A throwing onRequest middleware
            // must flow through applyErrorMiddleware + retry + onError hooks,
            // not bypass them — without this, observability hooks never see
            // request-side middleware failures.
            let middlewareRequest = requestContext;
            try {
                middlewareRequest = await this.applyRequestMiddleware(requestContext, data.routeTag);
                if (isVerbose) {
                    // Route through _redactUrl so HTTP_VERBOSE never dumps
                    // tokens/apikeys/ssh_passwords in query strings or userinfo.
                    console.error(`[HttpClient] ${middlewareRequest.method} ${_redactUrl(middlewareRequest.url, _credentialQueryParamsOf(middlewareRequest.middlewareContext))} (attempt ${attempt}/${retries + 1})`);
                }
                let wire = _wireBody(middlewareRequest.body, middlewareRequest.headers, data.jsonStringBody);
                if (keyedReplay !== undefined) {
                    middlewareRequest = { ...middlewareRequest, headers: _withKeyedReplayHeader(middlewareRequest.headers, keyHeader, keyedReplay) };
                    wire = keyedReplay.body;
                }
                else if (!keyedUnreplayable && _sendsIdempotencyKey(middlewareRequest.headers, keyHeader)) {
                    keyedReplay = _keyedReplayOf(middlewareRequest.headers, keyHeader, wire, _stringifyBody);
                    if (keyedReplay === undefined)
                        keyedUnreplayable = true;
                    else
                        wire = keyedReplay.body;
                }
                const startedAt = Date.now();
                const received = await this.sendConfined(middlewareRequest.method, middlewareRequest.url, middlewareRequest.headers, wire, middlewareRequest.timeoutMs, data.signal, data.redirect, middlewareRequest.middlewareContext, 
                // Follow redirects here, where a failure after an answered hop is marked, whenever
                // "never dispatched" would send the request again where shouldRetry otherwise would not.
                data.responseIsFinal === true || !_IDEMPOTENT_METHODS.includes(middlewareRequest.method.toUpperCase()));
                // The body is read inside the caller's signal and the timeout; the
                // transport lets go of both once the headers are in.
                const chunks = await this.readBufferedBody(received, data.signal, middlewareRequest.timeoutMs, startedAt);
                const response = this.replayResponse(received, chunks);
                if (!response.ok) {
                    throw await this.buildApiErrorFromResponse(response, middlewareRequest);
                }
                // A HEAD answer is its headers (size, modification time, ETag); the
                // body parser can only say null.
                const parsedResult = upperMethod === 'HEAD' && responseType === 'auto'
                    ? _headerRecord(response.headers)
                    : await this.parseResponseBody(response, responseType, upperMethod, data.losslessIntegers === true);
                const normalized = rawResponse
                    ? parsedResult
                    : this.normalizeResponseEnvelope(parsedResult, response.status, response.statusText);
                const middlewareResponse = await this.applyResponseMiddleware({
                    ...middlewareRequest,
                    response: this.replayResponse(received, chunks),
                    data: normalized,
                    ...((data.captureRawBody ?? this.config.captureRawBody) ? { rawBody: this.joinChunks(chunks) } : {}),
                });
                const result = middlewareResponse.data;
                if (isGet && requestCache) {
                    // LRU eviction: Map iteration preserves insertion order, so the
                    // first key is the oldest entry we haven't re-inserted.
                    if (this.cache.size >= _NODE_CACHE_MAX_ENTRIES) {
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
                let apiError = this.toApiError(error, middlewareRequest, data.signal);
                lastError = apiError;
                // An error-middleware throw must NOT replace the normalized
                // apiError. Swallow its failure so consumers always see the real
                // error from the request path.
                try {
                    await this.applyErrorMiddleware({
                        ...middlewareRequest,
                        error: apiError,
                    });
                }
                catch (mwErr) {
                    const msg = mwErr instanceof Error ? mwErr.message : String(mwErr);
                    console.error('[HttpClient] error-middleware threw (suppressed to preserve original error):', msg);
                }
                // Every decision below reads the request as it was dispatched: a request middleware may
                // have sent it to another destination (an API path to a kit host, whose 401 is the
                // script's answer, not the account token's), with another method (a GET made a POST
                // that ran) or with another body (one that cannot be sent twice).
                const sentMethod = middlewareRequest.method.toUpperCase();
                const sentExternal = middlewareRequest.url === url
                    ? isExternalUrl
                    : this.isExternalDestination(_isFullUrl(middlewareRequest.url), middlewareRequest.url);
                const sentNonReplayable = bodyIsNonReplayable || keyedUnreplayable || _isNonReplayableBody(middlewareRequest.body);
                const sentKeyed = _sendsIdempotencyKey(middlewareRequest.headers, keyHeader);
                // The ways back into this loop, and what each does with responseIsFinal:
                //   a. 401, API scope, token already replaced  -> replay once (below)
                //   b. 401, API scope, token refreshed         -> replay once (below)
                //   c. 401, kit host, onKitAuthExpired         -> replay once; NOT for responseIsFinal
                //   d. shouldRetry(): status, network, RETRY_SAFE_CODES -> honours responseIsFinal itself
                //   e. onError returned true                   -> refused when responseIsFinal
                // a and b replay a responseIsFinal request on purpose: hoody-api's auth layer answers
                // the 401 before any handler runs. Each happens at most once per call, and only with a
                // NEW token in hand. c does not: on a kit host the 401 may be the script's own answer,
                // given after it did its work, so the renewed auth is stored (onKitAuthExpired ran) and
                // the 401 goes back to the caller, who decides whether to send the request again.
                if (authRetryEnabled && !authRetried && apiError.status === 401 && !sentExternal && !sentNonReplayable) {
                    // The token that was refused has already been replaced: a sibling request's refresh
                    // landed while this one was in flight. Replay with the current token; refreshing again
                    // would spend a second refresh call (and, on a server that rotates the refresh token,
                    // invalidate the pair the sibling just stored). A burst of 20 requests at expiry made
                    // 2-3 refresh calls for this reason: the in-flight promise only joins the 401s that
                    // arrive while the refresh is still running.
                    if (typeof tokenSent === 'string' && tokenSent.length > 0
                        && typeof this.config.token === 'string' && this.config.token.length > 0
                        && this.config.token !== tokenSent) {
                        authRetried = true;
                        attempt -= 1;
                        continue;
                    }
                    const refreshedToken = await this.tryRefreshToken(apiError);
                    if (refreshedToken && this.config.acceptRefreshedToken(refreshedToken)) {
                        this.setToken(refreshedToken);
                        authRetried = true;
                        // Do not consume retry budget for auth recovery replay.
                        attempt -= 1;
                        continue;
                    }
                }
                let renewedNotReplayed;
                if (!kitAuthRetried && apiError.status === 401 && sentExternal
                    && middlewareRequest.middlewareContext?._kitNamespace
                    && this.config.onKitAuthExpired
                    && !sentNonReplayable) {
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
                            });
                        }
                        else if (newAuth) {
                            // Actually apply the returned auth for the next attempt.
                            // Without this the branch sets kitAuthRetried + continues
                            // with no hint to the middleware that credentials changed,
                            // so the retry replays with the same expired creds.
                            pendingKitAuthOverride = newAuth;
                            kitAuthRetried = true;
                            // Do not consume retry budget for auth recovery replay.
                            attempt -= 1;
                            continue;
                        }
                    }
                    catch (cbErr) {
                        // Callback failure: the caller-facing error stays as the
                        // original apiError (we don't want the callback's error to
                        // clobber the 401), but surface the callback failure via
                        // console.error so observability isn't black-boxed.
                        const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
                        console.error('[HttpClient] onKitAuthExpired callback failed:', msg);
                    }
                    if (renewedNotReplayed)
                        throw renewedNotReplayed;
                }
                // Match browser http-client: both status-retry and onError-retry
                // skip replay when the body is a single-consumption stream.
                // A kit still starting gets the longer default budget (kitStartingWaitMs).
                const kitStarting = retryByDefault && kitStartingWaitMs > 0 && data.responseIsFinal !== true && isKitStarting(apiError);
                if (attempt <= (kitStarting ? attemptBudget : retries) && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, data.responseIsFinal === true, retryByDefault, sentKeyed)) {
                    const retryAfterMs = apiError.retryAfterMs;
                    let delayMs = this.getRetryDelayMs(retryDelayMs, attempt, retryAfterMs);
                    if (kitStarting && retryAfterMs === undefined)
                        delayMs = Math.min(delayMs, _KIT_STARTING_MAX_DELAY_MS);
                    // The default policy waits at most _DEFAULT_RETRY_WAIT_CAP_MS in all. A wait past it
                    // (a long Retry-After) ends the retries: sending sooner than the server asked is not
                    // honouring it.
                    if (!retryByDefault || retryWaitedMs + delayMs <= (kitStarting ? kitStartingWaitMs : _DEFAULT_RETRY_WAIT_CAP_MS)) {
                        retryWaitedMs += delayMs;
                        await this.sleep(delayMs);
                        continue;
                    }
                }
                // The kit-starting wait ran out on a request it covered: say so, with a code to match.
                if (kitStarting && !sentNonReplayable && this.shouldRetry(apiError, sentMethod, retryOnStatuses, false, true, sentKeyed)) {
                    apiError = new ApiError({
                        message: kitNotReadyMessage(retryWaitedMs),
                        status: apiError.status,
                        code: _KIT_NOT_READY,
                        ...(apiError.url !== undefined ? { url: apiError.url } : {}),
                        ...(apiError.method !== undefined ? { method: apiError.method } : {}),
                        ...(apiError.request !== undefined ? { request: apiError.request } : {}),
                        response: apiError.response,
                        cause: apiError,
                    });
                }
                // Invoke onError on EVERY failure (including terminal ones) so
                // observability hooks see the final outcome. shouldRetry result
                // still controls whether we actually replay; onError is
                // informational unless it returns true AND we still have retry
                // budget AND the body can be replayed.
                if (this.config.onError) {
                    try {
                        const shouldRetry = await this.config.onError(apiError);
                        // The hook asks; it does not overrule responseIsFinal. An answer (or a lost
                        // connection) from a handler that is arbitrary code may follow a run, and a
                        // hook that returns true for every error ran an exec script twice on its 500.
                        // The one replay such a request may have, never dispatched, was taken above.
                        // Nor does it spend the default budget: before the default policy there was none.
                        // A caller's abort is never replayed: its signal stays aborted.
                        const callerAborted = apiError.status === 0 && apiError.code === 'ABORTED';
                        if (shouldRetry && attempt <= retries && !sentNonReplayable && data.responseIsFinal !== true && !retryByDefault && !callerAborted) {
                            await this.sleep(this.getRetryDelayMs(retryDelayMs, attempt));
                            continue;
                        }
                    }
                    catch (cbErr) {
                        // Log suppressed middleware error for observability.
                        const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
                        console.error('[HttpClient] onError callback threw:', msg);
                    }
                }
                throw apiError;
            }
        }
        throw lastError ?? new ApiError({ message: 'Request failed without error context' });
    }
    async get(path, data = {}) {
        return this.request('GET', path, data);
    }
    async post(path, data = {}) {
        return this.request('POST', path, data);
    }
    async put(path, data = {}) {
        return this.request('PUT', path, data);
    }
    async patch(path, data = {}) {
        return this.request('PATCH', path, data);
    }
    async delete(path, data = {}) {
        return this.request('DELETE', path, data);
    }
    async head(path, data = {}) {
        return this.request('HEAD', path, data);
    }
    async options(path, data = {}) {
        return this.request('OPTIONS', path, data);
    }
    async mkcol(path, data = {}) {
        return this.request('MKCOL', path, data);
    }
    async copy(path, data = {}) {
        return this.request('COPY', path, data);
    }
    async move(path, data = {}) {
        return this.request('MOVE', path, data);
    }
    async lock(path, data = {}) {
        return this.request('LOCK', path, data);
    }
    async unlock(path, data = {}) {
        return this.request('UNLOCK', path, data);
    }
    async propfind(path, data = {}) {
        return this.request('PROPFIND', path, data);
    }
    async proppatch(path, data = {}) {
        return this.request('PROPPATCH', path, data);
    }
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
     * (kitAuth on withContainer()) are injected by middleware, so a stream that
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
        const headers = this.buildHeaders(data.headers);
        if (isExternalUrl) {
            this.deleteAuthorization(headers, data.headers);
        }
        // A GET/HEAD stream has no body; the default JSON content type would be
        // a lie on the wire.
        if (data.body === undefined) {
            _deleteContentType(headers);
        }
        const timeoutMs = data.timeoutMs ?? this.config.timeout;
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
            ...(data.middlewareContext !== undefined ? { middlewareContext: data.middlewareContext } : {}),
        };
        // Opening the stream fails the way request() fails: a throwing request
        // middleware, a transport error, a refused connection or the header
        // timeout reaches the caller as an ApiError (status 0, redacted request
        // context, the original on cause), after error middleware saw it. It
        // escaped as a raw TypeError before, so an isApiError() catch that handled
        // the same failure on a plain GET missed it on a stream.
        let requestContext = initialContext;
        let response;
        try {
            requestContext = await this.applyRequestMiddleware(initialContext, data.routeTag);
            response = await this.sendConfined(requestContext.method, requestContext.url, requestContext.headers, _wireBody(requestContext.body, requestContext.headers, data.jsonStringBody), requestContext.timeoutMs, data.signal, data.redirect, requestContext.middlewareContext);
        }
        catch (error) {
            const openError = this.toApiError(error, requestContext, data.signal);
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
            const error = await this.buildApiErrorFromResponse(errorResponse, requestContext);
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
     * A non-2xx never yields: `stream()` drains it and raises `ApiError`.
     * Neither does a 2xx whose content-type is not `text/event-stream`: it
     * raises `ApiError` with code `NOT_AN_EVENT_STREAM` and the HTTP status.
     * The raised error holds only a fixed code, a fixed sentence and the status;
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
            const clean = _toStreamError(error, acceptedStatus, options.documentedErrorCodes);
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
                url: _redactUrl(response.url || path, _credentialQueryParamsOf(requestData.middlewareContext)),
                method: method.toUpperCase(),
                response: payload,
            });
        }
        try {
            accept(response);
        }
        catch (error) {
            void body.cancel().catch(() => undefined);
            throw error;
        }
        const reader = body.getReader();
        const decoder = new TextDecoder('utf-8');
        const maxFrameBytes = resolveMaxFrameBytes(options.maxFrameBytes, this.config.maxStreamFrameBytes);
        const buffer = createStreamFrameBuffer(maxFrameBytes);
        const frameTooLarge = () => _cleanApiError({
            message: 'An event stream frame exceeded ' + maxFrameBytes + ' bytes (maxFrameBytes); the stream was closed',
            status: response.status,
            code: 'STREAM_FRAME_TOO_LARGE',
            url: _redactUrl(response.url || path, _credentialQueryParamsOf(requestData.middlewareContext)),
            method: method.toUpperCase(),
            response: { maxFrameBytes, frameBytes: buffer.overflowBytes },
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
            url: _redactUrl(response.url || path, _credentialQueryParamsOf(requestData.middlewareContext)),
            method: method.toUpperCase(),
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
                const chunk = decoder.decode(value, { stream: true });
                if (chunk.length === 0) {
                    continue;
                }
                for (const event of parseSseChunk(buffer, chunk)) {
                    yield event;
                    if (event.event === 'end') {
                        return;
                    }
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
     * pipe receive failed after timeoutMs while data was still arriving (L2 round 3).
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
    async readBufferedBody(response, signal, timeoutMs, _startedAt) {
        const body = response.body;
        if (!body || response.status === 204 || response.status === 205 || response.status === 304) {
            return null;
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
        try {
            arm();
            for (;;) {
                if (stopped !== undefined)
                    break;
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                chunks.push(chunk.value);
                received += chunk.value.length;
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
        const headers = this.buildHeaders(data.headers);
        if (isExternalUrl) {
            this.deleteAuthorization(headers, data.headers);
        }
        // An upgrade has no body to describe.
        _deleteContentType(headers);
        const context = await this.applyRequestMiddleware({
            requestId: this.nextRequestId(),
            attempt: 1,
            method: 'GET',
            path: url,
            url: target,
            headers,
            timeoutMs: data.timeoutMs ?? this.config.timeout,
            retries: 0,
            ...(data.query !== undefined ? { query: data.query } : {}),
            ...(data.middlewareContext !== undefined ? { middlewareContext: data.middlewareContext } : {}),
        }, data.routeTag);
        return { url: context.url, headers: { ...context.headers } };
    }
    async logout(path, data = {}) {
        return this.request('LOGOUT', path, data);
    }
    async parseResponseBody(response, responseType = 'auto', method, losslessIntegers = false) {
        // Parity with the browser http-client: HEAD / 204 / 205 / 304 /
        // Content-Length:0 have no body; calling response.json() on them
        // throws SyntaxError: Unexpected end of JSON input and surfaces as a
        // failure to the caller instead of a successful empty response.
        const upperMethod = method ? method.toUpperCase() : undefined;
        const hasNoBody = upperMethod === 'HEAD' ||
            response.status === 204 ||
            response.status === 205 ||
            response.status === 304 ||
            response.headers.get('content-length') === '0';
        if (hasNoBody) {
            if (responseType === 'text')
                return '';
            if (responseType === 'arrayBuffer')
                return new ArrayBuffer(0);
            if (responseType === 'blob')
                return new Blob([]);
            return null;
        }
        if (responseType === 'json') {
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
        // with Content-Disposition: attachment, typed string in the spec, and the
        // attachment rule used to win and hand back an ArrayBuffer.
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
     * Query parameters as wire pairs. An array value is sent as one pair per
     * item (`?source=nix&source=system`): the OpenAPI default for a query array
     * (style `form`, explode `true`), and the form every kit that declares an
     * array query parameter parses. `String()` on an array comma-joins it into
     * ONE value (`?source=nix,system`), which hoody-run rejects as an unknown
     * source and hoody-browser passes to Chromium as one launch argument.
     * `undefined` and `null` (the value or an item) send nothing.
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
        const normalizedPath = cleanPath ? `/${cleanPath}` : '/';
        if (!baseUrl || !this.hasAbsoluteUrlOrigin(baseUrl)) {
            return this.appendQueryParameters(this.joinRelativeUrl(baseUrl, normalizedPath), query);
        }
        const url = new URL(`${baseUrl}${normalizedPath}`);
        this.mergeQueryPairs(url.searchParams, query);
        return url.toString();
    }
    /**
     * Adds the query to the parameters the path already carries. A key the path
     * holds itself (a route marker: `/{archive}?extract`, `/{directory}?zip`)
     * is never sent twice: a non-empty value from the caller replaces the bare
     * marker (`?extract=src%2F`), an empty one leaves it as it is. The request
     * used to go out as `?extract=&extract=src%2F`, which only reads right on a
     * server that keeps the last value of a repeated key.
     */
    mergeQueryPairs(target, query) {
        const pairs = this.queryPairs(query);
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
    hasAbsoluteUrlOrigin(value) {
        return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
    }
    joinRelativeUrl(basePath, normalizedPath) {
        if (!basePath) {
            return normalizedPath;
        }
        const trimmedBase = basePath.endsWith('/')
            ? basePath.slice(0, -1)
            : basePath;
        return `${trimmedBase}${normalizedPath}`;
    }
    appendQueryParameters(pathOrUrl, query) {
        if (!query) {
            return pathOrUrl;
        }
        const mark = pathOrUrl.indexOf('?');
        const searchParams = new URLSearchParams(mark === -1 ? '' : pathOrUrl.slice(mark + 1));
        if (!this.mergeQueryPairs(searchParams, query)) {
            return pathOrUrl;
        }
        const queryString = searchParams.toString();
        const head = mark === -1 ? pathOrUrl : pathOrUrl.slice(0, mark);
        return queryString ? `${head}?${queryString}` : head;
    }
    isVerboseLoggingEnabled() {
        const processRef = globalThis.process;
        return processRef?.env?.HTTP_VERBOSE === 'true';
    }
    buildUrlFromFull(fullUrl, query) {
        const url = new URL(fullUrl);
        this.mergeQueryPairs(url.searchParams, query);
        return url.toString();
    }
    sanitizeHeaderValue(value, maxLength = 128) {
        return value
            .replace(/[^ -~]/g, '')
            .trim()
            .slice(0, maxLength);
    }
    buildHeaders(customHeaders) {
        const headers = {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...customHeaders,
        };
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
    async executeRequest(method, url, headers, body, timeoutMs, externalSignal, redirect) {
        const controller = new AbortController();
        // 0-ms setTimeout aborts immediately on the next tick (before fetch
        // has even dispatched). timeout: 0 means "no timeout" (caller opting
        // out of our budget). Only arm the abort timer for positive finite
        // budgets.
        const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        const timeout = hasBudget
            ? setTimeout(() => controller.abort(_deadlineReason()), timeoutMs)
            : undefined;
        let externalAbortListener;
        let requestUrl = url;
        let resolvedIP;
        try {
            if (this.config.forceIPv4) {
                try {
                    const urlObj = new URL(url);
                    const hostname = urlObj.hostname;
                    // Skip host rewrite for HTTPS URLs. Rewriting the URL to
                    // https://<IP>/... breaks TLS
                    // SNI and cert validation against any DNS-name certificate.
                    // For HTTPS we still resolve (for attachment to error.resolvedIP
                    // diagnostics) but leave the URL hostname intact; Node's resolver
                    // will follow the system preference. Use a native undici dispatcher
                    // at a higher layer if strict IPv4-only routing over TLS is needed.
                    if (urlObj.protocol === 'https:' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
                        try {
                            resolvedIP = await this.resolveIPv4Hostname(hostname);
                        }
                        catch { /* diagnostic-only */ }
                    }
                    else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
                        const address = await this.resolveIPv4Hostname(hostname);
                        resolvedIP = address;
                        urlObj.hostname = address;
                        requestUrl = urlObj.toString();
                        if (!headers['Host']) {
                            headers['Host'] = hostname;
                        }
                    }
                }
                catch {
                    // ignore resolution failures and allow fetch to attempt hostname
                }
            }
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
                    : _stringifyBody(body))
                : undefined;
            // Header names are case-insensitive: a request middleware that hands
            // back another spelling (a Headers round-trip lower-cases every name)
            // survived the exact-case delete, and a FormData upload went out as
            // application/json with no multipart boundary.
            if (body instanceof Blob || body instanceof FormData) {
                _deleteContentType(headers);
            }
            else if ((typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
                || body instanceof ArrayBuffer
                || body instanceof Uint8Array) {
                // Only strip the DEFAULT application/json for a raw byte body;
                // caller-explicit Content-Type is preserved.
                //
                // ArrayBuffer and Uint8Array were not in this list, so bytes went out
                // labelled application/json — invisible while the only way to reach the
                // branch was a hand-written call, and reachable from the typed surface
                // as soon as a binary request body became expressible (pipe.send).
                _deleteDefaultJsonContentType(headers);
            }
            // transport.keepAlive: false asks the server to close the connection.
            // The fetch `keepalive` flag is never set: it is a browser's "outlive
            // the page" switch, not connection reuse, and with it Node refuses
            // every ReadableStream body outright.
            const requestHeaders = (!this.config.transport.keepAlive && !headers['Connection'])
                ? { ...headers, Connection: 'close' }
                : headers;
            const fetchOptions = {
                method: method.toUpperCase(),
                headers: requestHeaders,
                signal: controller.signal,
            };
            if (redirect)
                fetchOptions.redirect = redirect;
            if (bodyValue !== undefined) {
                fetchOptions.body = bodyValue;
                // undici / Node fetch requires duplex: 'half' for streaming
                // request bodies.
                if (typeof ReadableStream !== 'undefined' && bodyValue instanceof ReadableStream) {
                    fetchOptions.duplex = 'half';
                }
            }
            // Instance transport, never the global. JSON, binary and streaming
            // requests all land here, so the injected transport sees all of them.
            // The SDK's own Node transport takes the request's budget, so undici's
            // timeouts follow timeoutMs instead of capping it at their defaults.
            const budgeted = _BUDGETED_FETCH.get(this.config.fetch);
            if (budgeted)
                return await budgeted(requestUrl, fetchOptions, timeoutMs);
            return await this.config.fetch(requestUrl, fetchOptions);
        }
        catch (fetchError) {
            if (fetchError && typeof fetchError === 'object' && resolvedIP !== undefined) {
                fetchError.resolvedIP = resolvedIP;
            }
            throw fetchError;
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
            if (externalSignal && externalAbortListener) {
                externalSignal.removeEventListener('abort', externalAbortListener);
            }
        }
    }
    async resolveIPv4Hostname(hostname) {
        const shouldUseCache = this.config.forceIPv4Cache.enabled && this.config.forceIPv4Cache.ttlMs > 0;
        const now = Date.now();
        if (shouldUseCache) {
            const cached = this.ipv4DnsCache.get(hostname);
            if (cached && cached.expiresAt > now) {
                return cached.address;
            }
        }
        const lookup = await this.loadNodeDnsLookup();
        const { address } = await lookup(hostname, { family: 4 });
        if (shouldUseCache) {
            this.ipv4DnsCache.set(hostname, {
                address,
                expiresAt: now + this.config.forceIPv4Cache.ttlMs,
            });
            if (this.ipv4DnsCache.size > 1024) {
                this.pruneExpiredIPv4Cache(now);
            }
        }
        return address;
    }
    async loadNodeDnsLookup() {
        const specifier = 'node:dns/promises';
        const dnsModule = await import(specifier);
        if (typeof dnsModule.lookup !== 'function') {
            throw new Error('node:dns/promises lookup is unavailable in this runtime');
        }
        return dnsModule.lookup;
    }
    pruneExpiredIPv4Cache(now) {
        for (const [hostname, entry] of this.ipv4DnsCache.entries()) {
            if (entry.expiresAt <= now) {
                this.ipv4DnsCache.delete(hostname);
            }
        }
    }
    async buildApiErrorFromResponse(response, request) {
        let responseDetails = undefined;
        let message = `HTTP ${response.status}: ${response.statusText}`;
        let code;
        try {
            const parsed = await this.parseResponseBody(response);
            responseDetails = parsed;
            if (parsed && typeof parsed === 'object') {
                const record = parsed;
                const nested = record.error !== null && typeof record.error === 'object' && !Array.isArray(record.error)
                    ? record.error
                    : undefined;
                if (typeof record.message === 'string' && record.message.length > 0) {
                    message = record.message;
                }
                else if (typeof record.error === 'string' && record.error.length > 0) {
                    message = record.error;
                }
                else if (nested && typeof nested.message === 'string' && nested.message.length > 0) {
                    // { error: { code, message } }: the message is one level down.
                    message = nested.message;
                }
                code = _apiErrorCode(record);
            }
            else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                // An HTML error page (hoody-exec's 404 and 500) is not a message: its
                // title is. The page itself stays on error.response.
                message = _htmlErrorTitle(parsed, message) ?? parsed;
            }
        }
        catch {
            // keep default message
        }
        // No body (a HEAD answer) or no code in it: the code may be in the
        // X-Hoody-Error-Code response header (hoody-sqlite's KV HEAD 404).
        if (code === undefined)
            code = _headerErrorCode(response.headers);
        // Redact URL + body + query in both the ApiError and its attached
        // request context. Parity with the browser http-client.
        // The recorded credential query parameters are redacted too, whatever
        // name the operator gave them (kitAuth token rule with a param).
        const credentialParams = _credentialQueryParamsOf(request.middlewareContext);
        const redactedUrl = _redactUrl(request.url, credentialParams);
        const apiRequest = {
            method: request.method,
            url: redactedUrl,
            ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body, 0, undefined, credentialParams) } : {}),
            ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query, 0, undefined, credentialParams) } : {}),
            ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers, _credentialHeadersOf(request.middlewareContext)) } : {}),
        };
        const err = new ApiError({
            message,
            status: response.status,
            ...(code !== undefined ? { code } : {}),
            url: redactedUrl,
            method: request.method,
            request: apiRequest,
            response: responseDetails,
        });
        // Parse Retry-After and attach to the error so the retry loop honors
        // server-directed backoff instead of hammering with local exponential
        // delay.
        const retryAfterMs = this.parseRetryAfter(response.headers);
        if (retryAfterMs !== undefined) {
            err.retryAfterMs = retryAfterMs;
        }
        return err;
    }
    toApiError(error, request, callerSignal) {
        if (isApiError(error)) {
            return error;
        }
        const isAbortError = (error instanceof Error && error.name === 'AbortError')
            || (typeof error === 'object' && error !== null && error.code === 'ABORT_ERR');
        // The caller's own signal fired: fetch rejects with an AbortError, or with the signal's
        // reason when the caller gave one. ABORTED, never the timeout, so a cancel is not taken for a
        // deadline. Any other AbortError is this client's deadline: ETIMEDOUT, as in the CLI client.
        // The deadline's own reason (see _deadlineReason) wins a race with a later caller abort.
        const callerAbort = !_DEADLINE_REASONS.has(error)
            && callerSignal?.aborted === true && (isAbortError || error === callerSignal.reason);
        const deadline = isAbortError && !callerAbort;
        // undici's own timeouts arrive as "fetch failed" (or "terminated") with
        // the reason two causes down: name them, with the client's timeout codes.
        const transportTimeout = isAbortError || callerAbort ? undefined : _undiciTimeoutOf(error);
        const message = callerAbort
            ? _callerAbortMessage(callerSignal.reason)
            : deadline ? `Request timed out after ${request.timeoutMs}ms`
                : transportTimeout === 'headers' ? 'Request timed out: the server sent no response headers in time'
                    : transportTimeout === 'body' ? 'Request timed out: the response body stalled'
                        : transportTimeout === 'connect' ? 'Request timed out: the connection could not be opened in time'
                            : (error instanceof Error ? error.message : 'Request failed');
        // Redact URL/body/query; attach PARSE_ERROR code for SyntaxError
        // (parity with the browser http-client).
        const isParseError = error instanceof SyntaxError;
        // The recorded credential query parameters are redacted too, whatever
        // name the operator gave them (kitAuth token rule with a param).
        const credentialParams = _credentialQueryParamsOf(request.middlewareContext);
        const redactedUrl = _redactUrl(request.url, credentialParams);
        const apiRequest = {
            method: request.method,
            url: redactedUrl,
            ...(request.body !== undefined ? { body: _redactSensitiveValue(request.body, 0, undefined, credentialParams) } : {}),
            ...(request.query !== undefined ? { query: _redactSensitiveValue(request.query, 0, undefined, credentialParams) } : {}),
            ...(request.headers !== undefined ? { headers: _redactHeaders(request.headers, _credentialHeadersOf(request.middlewareContext)) } : {}),
        };
        // A body that stalled after the headers (readBufferedBody): the CLI's code for it.
        const isBodyStall = error instanceof Error && error.name === 'BodyStallError';
        return new ApiError({
            message,
            status: 0,
            ...(callerAbort ? { code: 'ABORTED' }
                : isParseError ? { code: 'PARSE_ERROR' }
                    : deadline || isBodyStall || transportTimeout !== undefined ? { code: 'ETIMEDOUT' }
                        : {}),
            url: redactedUrl,
            method: request.method,
            request: apiRequest,
            cause: error,
        });
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
    shouldRetry(error, method, retryOnStatuses, responseIsFinal = false, byDefault = false, keyed = false) {
        // ABORTED at status 0 is the caller's abort, and an ETIMEDOUT from this client's
        // deadline (or the transport's headers timer) is its own timeout: both final. A
        // server's answer that names the code (body or X-Hoody-Error-Code) is retried
        // by its status like any other.
        if (error.status === 0 && error.code === 'ABORTED') {
            return false;
        }
        if (error.status === 0 && error.code === 'ETIMEDOUT' && _isDeadline(error.cause)) {
            return false;
        }
        // A redirect this client refused to follow is the same answer on every attempt.
        if (error.code === 'REDIRECT_REFUSED') {
            return false;
        }
        // So is a runtime with no fetch.
        if (error.status === 0 && error.cause?.code === 'FETCH_UNAVAILABLE') {
            return false;
        }
        if (error.status === 0 && _neverDispatched(error)) {
            return true;
        }
        const idempotentMethod = keyed || _IDEMPOTENT_METHODS.includes(method);
        if (byDefault && !idempotentMethod) {
            return false;
        }
        if (error.status > 0 && !responseIsFinal && typeof error.code === 'string' && RETRY_SAFE_CODES.includes(error.code)) {
            return true;
        }
        if (responseIsFinal) {
            return false;
        }
        // Any other network-level failure (status=0) may or may not have reached
        // the server. For idempotent methods retrying is safe. For POST/PATCH and
        // other non-idempotent methods the request may already have mutated
        // state — retrying can double-apply. Gate on idempotency.
        if (error.status === 0) {
            return idempotentMethod;
        }
        if (!idempotentMethod && error.status !== 429) {
            return false;
        }
        return retryOnStatuses.includes(error.status);
    }
    /**
     * Exponential backoff with bounded cap + optional server-directed
     * Retry-After delay. Without the cap, `retries: 15` with persistent 503
     * produces multi-minute sleeps; without Retry-After, we violate RFC 9110
     * §10.2.3 by ignoring server-directed backoff.
     */
    getRetryDelayMs(baseDelayMs, attempt, retryAfterMs) {
        const MAX_RETRY_DELAY_MS = 30000;
        if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
            return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
        }
        const exponentialDelay = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
        const jitter = Math.floor(Math.random() * 50);
        return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
    }
    /**
     * Parse Retry-After header (delta-seconds or HTTP-date) into milliseconds.
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
     * Single-flight token refresh. Without this, N concurrent 401s each run
     * onTokenExpired/refreshToken independently — servers that rotate tokens
     * per refresh call see last-setToken-wins races with in-flight retries
     * stranded on stale tokens. Cache the in-flight refresh Promise so
     * siblings share one round-trip.
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
     * base host. Any subdomain used to count, and the kit hosts withContainer()
     * derives from a base with no api. label (containers.<base host>) are
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
     * (Authorization, Cookie, X-*-Token, the container claim, ...), a header
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
     * any other header name (X-Hoody-Token, X-Hoody-Container-Claim, a kitAuth
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
     * Methods follow fetch: 303 turns anything but HEAD into a body-less GET,
     * 301 and 302 turn a POST into one, and 307 and 308 resend the method and
     * body (a streamed body, which cannot be sent twice, is refused).
     * One sent with redirect: 'error' goes out unchanged.
     *
     * `trackHops` (request() sets it for a method that is not idempotent and
     * for a responseIsFinal request): a request without credentials follows its
     * redirects here too, wherever they lead, as fetch would (at most 20). A
     * failure after the first hop was answered is marked `afterDispatch`: a
     * script that ran and answered 3xx, whose destination then refused the
     * connection, is not "never dispatched" and is not sent again. Any other
     * request without credentials goes out unchanged.
     */
    async sendConfined(method, url, headers, body, timeoutMs, signal, redirect, middlewareContext, trackHops = false) {
        const confined = redirect !== 'error' && this.carriesCredential(url, headers, middlewareContext);
        if (redirect === 'error' || (!confined && !trackHops)) {
            return this.executeRequest(method, url, headers, body, timeoutMs, signal, redirect);
        }
        const MAX_CREDENTIALED_HOPS = confined ? 5 : 20;
        // One budget for the whole chain, not one per hop: each hop gets what is
        // left of timeoutMs, and a hop with nothing left is not sent.
        const hasBudget = Number.isFinite(timeoutMs) && timeoutMs > 0;
        const deadline = hasBudget ? Date.now() + timeoutMs : 0;
        let hopMethod = method.toUpperCase();
        let hopUrl = url;
        let hopHeaders = { ...headers };
        let hopBody = body;
        for (let hops = 0;; hops++) {
            const hopTimeoutMs = hasBudget ? deadline - Date.now() : timeoutMs;
            if (hasBudget && hopTimeoutMs <= 0) {
                const expired = new Error('The request timed out before redirect ' + hops + ' could be followed');
                expired.name = 'AbortError';
                throw expired;
            }
            let response;
            try {
                response = await this.executeRequest(hopMethod, hopUrl, { ...hopHeaders }, hopBody, hopTimeoutMs, signal, 'manual');
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
    /** The ApiError sendConfined throws; the URL is redacted, the credentials never leave. */
    redirectRefusal(reason, status, method, url, middlewareContext) {
        const redactedUrl = _redactUrl(url, _credentialQueryParamsOf(middlewareContext));
        return new ApiError({
            message: 'Refused to follow a redirect: ' + reason + '. The request carries credentials, '
                + 'which are sent only to the destination it was addressed to.',
            status,
            code: 'REDIRECT_REFUSED',
            url: redactedUrl,
            method,
            request: { method, url: redactedUrl },
        });
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
    async sleep(ms) {
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
     * may be absent (`{statusCode, data}`, hoody-api's `/auth/available-regions`); it is filled in
     * from the status text. The generated types (RESPONSE_ENVELOPE_FIELDS) follow the same rule.
     */
    normalizeResponseEnvelope(payload, statusCode, statusText) {
        const fallbackMessage = statusText || (statusCode >= 200 && statusCode < 300 ? 'OK' : 'Request completed');
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const record = payload;
            // Parity with the browser http-client. A numeric `statusCode`, an own `data` key, and a
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
