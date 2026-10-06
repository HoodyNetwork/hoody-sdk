/**
 * Remote control of a live hoody-exec script (MonoRepoStorage #674, cut V9):
 * `exec.connect(url, { token })`.
 *
 * The remote channel lives on the script's OWN URL. A marker picks the op:
 *  - one-shot ops: `X-Hoody-Remote: send|call|eval|capabilities` on a POST/GET;
 *  - events: `X-Hoody-Remote: events` on a GET whose body is an SSE stream;
 *  - attach: a WebSocket offering the subprotocol `hoody-remote.v1`.
 *
 * The default transport is SSE events + one-shot requests, the same pattern as
 * hoody-agent's prompt stream. `ws: true` moves send, call and events onto one
 * attach socket. `eval` is ALWAYS a one-shot POST: the server refuses it on
 * attach, so a future proxy rule can single it out by its header.
 *
 * The script token travels only as `X-Token` (recorded as a credential header,
 * so the HTTP client redacts it in ApiError and confines it on redirects) or,
 * on a socket, as the subprotocol entry `hoody-token.<base64url>`, which the
 * server never echoes. It is never put in a URL, an error, or a log line.
 *
 * Every refusal is raised as a typed {@link ExecRemoteError} carrying the
 * server's `details.fix` (the magic comments to add and the exact
 * magic-comments update call); its message already contains the fix lines.
 *
 * This module is web-API only (fetch bodies, TextDecoder, WebSocket) so it
 * ships in the browser bundle; the `ws` package is imported lazily on Node.
 */
import { ExecService } from '../generated/exec/exec.service.js';
import { encodeExecScriptPath } from './exec-script-execution.js';
import { recordCredentialHeader } from './redact.js';
// ---------------------------------------------------------------------------
// Wire constants (#674)
// ---------------------------------------------------------------------------
/** Request header naming the remote op. */
export const EXEC_REMOTE_HEADER = 'X-Hoody-Remote';
/** Response header every remote answer carries; its absence means the server does not speak hoody-remote. */
export const EXEC_REMOTE_VERSION_HEADER = 'X-Hoody-Remote-Version';
/** The attach subprotocol. */
export const EXEC_REMOTE_SUBPROTOCOL = 'hoody-remote.v1';
/** Prefix of the subprotocol entry that carries the token on a socket (never echoed). */
export const EXEC_REMOTE_TOKEN_PROTOCOL_PREFIX = 'hoody-token.';
/** Header the SDK sends the script token in. */
const TOKEN_HEADER = 'X-Token';
/** Largest one-shot answer body or single event frame read (the server caps results at 8 MiB). */
export const EXEC_REMOTE_MAX_BODY_BYTES = 9 * 1024 * 1024;
/** Frames queued for an events consumer that is not reading; one more closes the stream (the server's own session cap). */
export const EXEC_REMOTE_FRAME_QUEUE_CAP = 1000;
/** Largest frame the SDK sends on the attach socket; the server closes a socket (1009) that sends more. */
export const EXEC_REMOTE_MAX_FRAME_BYTES = 1024 * 1024;
/** Socket requests awaiting a reply at once. */
export const EXEC_REMOTE_MAX_PENDING = 1024;
/** Client wait for a one-shot answer when the call names no timeoutMs. */
export const EXEC_REMOTE_DEFAULT_TIMEOUT_MS = 60_000;
/** Longest wait for the `attached` frame after the socket opened (capped by the connection's timeoutMs). */
const ATTACHED_WAIT_MS = 10_000;
/** Extra client wait beyond a timeoutMs sent to the server, so the server's own 504 arrives first. */
const TIMEOUT_GRACE_MS = 5_000;
// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
/**
 * A refused or failed remote op. `code` is the server's `details.code`
 * (`REMOTE_EVAL_DISABLED`, …) or a client code; `fix` is what to change.
 * It never holds the token, the request headers or the request body.
 */
export class ExecRemoteError extends Error {
    /** HTTP status (0 when no answer arrived; the close code's status for a socket refusal). */
    status;
    /** `details.code` from the server, or a client code such as `REMOTE_CLIENT_TIMEOUT`. */
    code;
    /** Which gate refused: `token`, `capability`, `script`, … when the server says. */
    layer;
    /** The magic comments / management call that would allow the op. */
    fix;
    /** The server's `details` (without secrets, by contract). */
    details;
    /** The script URL, without query or credentials. */
    url;
    constructor(params) {
        super(withFixLines(params.message, params.fix), params.cause !== undefined ? { cause: params.cause } : undefined);
        this.name = 'ExecRemoteError';
        this.status = params.status;
        this.code = params.code;
        this.layer = params.layer;
        this.fix = params.fix;
        this.details = params.details ?? {};
        this.url = params.url;
    }
}
/** The token gate refused: 401 REMOTE_TOKEN_REQUIRED / REMOTE_TOKEN_INVALID, 403 REMOTE_TOKEN_SCOPE / REMOTE_EVAL_TOKEN_REQUIRED. */
export class ExecRemoteTokenError extends ExecRemoteError {
    /** The script's token names (never secrets). */
    tokenNames;
    constructor(params) {
        super(params);
        this.name = 'ExecRemoteTokenError';
        const names = this.details.token_names;
        this.tokenNames = Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
    }
}
/** A capability is off (`*_DISABLED`): a permission, off by default. `fix` says how to allow it. */
export class ExecRemotePermissionError extends ExecRemoteError {
    constructor(params) {
        super(params);
        this.name = 'ExecRemotePermissionError';
    }
}
/** The script's own code threw (422 REMOTE_THREW). `remote` is the script-side error. */
export class ExecRemoteThrewError extends ExecRemoteError {
    remote;
    constructor(params) {
        super(params);
        this.name = 'ExecRemoteThrewError';
        const e = (this.details.error ?? {});
        this.remote = {
            name: typeof e.name === 'string' ? e.name : 'Error',
            message: typeof e.message === 'string' ? e.message : '',
            ...(typeof e.stack === 'string' ? { stack: e.stack } : {}),
        };
    }
}
/** The op ran out of time: the server's 504 REMOTE_TIMEOUT, or the client's own wait (REMOTE_CLIENT_TIMEOUT). */
export class ExecRemoteTimeoutError extends ExecRemoteError {
    constructor(params) {
        super(params);
        this.name = 'ExecRemoteTimeoutError';
    }
}
/** The server answered without the hoody-remote version header: it predates remote ops (or is not hoody-exec). */
export class ExecRemoteUnsupportedError extends ExecRemoteError {
    constructor(params) {
        super(params);
        this.name = 'ExecRemoteUnsupportedError';
    }
}
/** No answer: the connection failed, the socket closed, or a frame broke the protocol. */
export class ExecRemoteConnectionError extends ExecRemoteError {
    constructor(params) {
        super(params);
        this.name = 'ExecRemoteConnectionError';
    }
}
/** True for every error this module raises. */
export function isExecRemoteError(error) {
    return error instanceof ExecRemoteError;
}
const TOKEN_CODES = new Set([
    'REMOTE_TOKEN_REQUIRED', 'REMOTE_TOKEN_INVALID', 'REMOTE_TOKEN_SCOPE', 'REMOTE_EVAL_TOKEN_REQUIRED',
]);
/** The server's error sentence plus one line per fix entry, so printing the message shows the fix. */
function withFixLines(message, fix) {
    const lines = formatExecRemoteFix(fix);
    return lines.length === 0 ? message : message + '\n' + lines.join('\n');
}
/**
 * Render a fix as lines: the magic comments to add, then the management call.
 * Shared by error messages and the CLI.
 */
export function formatExecRemoteFix(fix) {
    if (!fix || typeof fix !== 'object')
        return [];
    const lines = [];
    const comments = Array.isArray(fix.magic_comments)
        ? fix.magic_comments.filter((c) => typeof c === 'string')
        : [];
    if (comments.length > 0) {
        lines.push('Fix: add to the script:');
        for (const c of comments)
            lines.push('  ' + c);
    }
    const api = fix.api;
    if (api && typeof api === 'object' && typeof api.method === 'string' && typeof api.path === 'string') {
        let body = '';
        if (api.body !== undefined) {
            try {
                body = ' ' + JSON.stringify(api.body);
            }
            catch {
                body = '';
            }
        }
        lines.push((comments.length > 0 ? 'or: ' : 'Fix: ') + api.method + ' ' + api.path + body);
    }
    return lines;
}
/** Only the origin and path of a URL: no query, fragment or userinfo. */
function publicUrl(url) {
    try {
        const u = new URL(url);
        return u.origin + u.pathname;
    }
    catch {
        const cut = url.search(/[?#]/);
        return cut === -1 ? url : url.slice(0, cut);
    }
}
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
/**
 * Map a refusal body (`{ error, code, details:{ code, layer, fix } }`) to its
 * typed error. A body without a REMOTE_* code keeps the HTTP status as code.
 */
export function execRemoteErrorFromBody(status, body, url) {
    const record = asRecord(body);
    const details = asRecord(record?.details) ?? {};
    const serverCode = typeof details.code === 'string' ? details.code : undefined;
    const layer = typeof details.layer === 'string' ? details.layer : undefined;
    const fix = asRecord(details.fix);
    let message;
    if (typeof record?.error === 'string' && record.error.length > 0)
        message = record.error;
    else if (typeof record?.message === 'string' && record.message.length > 0)
        message = record.message;
    else if (typeof body === 'string' && body.trim().length > 0)
        message = body.trim().slice(0, 500);
    else
        message = 'Remote op failed with HTTP ' + status;
    const params = {
        message,
        status,
        code: serverCode ?? 'HTTP_' + status,
        layer,
        fix,
        details,
        url: url === undefined ? undefined : publicUrl(url),
    };
    if (serverCode === 'REMOTE_THREW')
        return new ExecRemoteThrewError(params);
    if (serverCode === 'REMOTE_TIMEOUT' || (serverCode === undefined && status === 504))
        return new ExecRemoteTimeoutError(params);
    if ((serverCode !== undefined && TOKEN_CODES.has(serverCode)) || layer === 'token')
        return new ExecRemoteTokenError(params);
    if (layer === 'capability' || (serverCode !== undefined && /^REMOTE_[A-Z]+_DISABLED$/.test(serverCode))) {
        return new ExecRemotePermissionError(params);
    }
    return new ExecRemoteError(params);
}
/** A transport over an SDK HttpClient (the service's namespace-wrapped client). */
export function execRemoteHttpTransport(http) {
    const client = http;
    // X-Token does not match the client's secret-header pattern: record it, so
    // ApiError redacts it and a cross-origin redirect drops it.
    const credentialContext = () => recordCredentialHeader({}, TOKEN_HEADER);
    // The client's own headers (config headers, kitAuth) must not already use
    // X-Token: they would replace the script token on the wire. Learned once per
    // URL through the request middleware, with no request sent.
    const checked = new Map();
    const assertNoClash = (url) => {
        let check = checked.get(url);
        if (!check) {
            check = client.prepareUpgrade(url, { middlewareContext: credentialContext() }).then((target) => {
                if (Object.keys(target.headers).some((h) => h.toLowerCase() === TOKEN_HEADER.toLowerCase())) {
                    throw new ExecRemoteError({
                        message: 'This client already sends an X-Token header (its kitAuth or configured headers), '
                            + 'the header the script token uses. Configure the kit credential with another header.',
                        status: 0,
                        code: 'REMOTE_TOKEN_HEADER_CLASH',
                        url: publicUrl(url),
                    });
                }
            });
            // A failed middleware run (a kitAuth token fetch) is retried by the next op; a clash is not.
            check.catch((error) => {
                if (!(error instanceof ExecRemoteError))
                    checked.delete(url);
            });
            checked.set(url, check);
        }
        return check;
    };
    return {
        async send(method, url, init) {
            await assertNoClash(url);
            try {
                const response = await client.stream(method, url, {
                    headers: init.headers,
                    ...(init.body !== undefined ? { body: init.body } : {}),
                    ...(init.query !== undefined ? { query: init.query } : {}),
                    signal: init.signal,
                    timeoutMs: init.timeoutMs,
                    retries: 0,
                    middlewareContext: credentialContext(),
                });
                return { kind: 'response', status: response.status, headers: response.headers, body: response.body };
            }
            catch (error) {
                const e = error;
                if (e && typeof e === 'object' && typeof e.status === 'number' && e.status > 0) {
                    return { kind: 'refused', status: e.status, body: e.response };
                }
                throw error;
            }
        },
        async upgrade(url) {
            await assertNoClash(url);
            return client.prepareUpgrade(url, { middlewareContext: credentialContext() });
        },
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** UTF-8 base64url without padding (the socket token entry). */
function base64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes)
        binary += String.fromCharCode(b);
    const b64 = typeof btoa === 'function'
        ? btoa(binary)
        : globalThis.Buffer
            .from(binary, 'latin1').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function hasVersionHeader(headers) {
    const v = headers.get(EXEC_REMOTE_VERSION_HEADER);
    return v !== null && v.trim().length > 0;
}
function unsupported(url, detail) {
    return new ExecRemoteUnsupportedError({
        message: 'This server does not speak hoody-remote (' + detail + '). '
            + 'The hoody-exec service predates remote ops, or the URL is not a hoody-exec script; '
            + 'an older hoody-exec may have run the script\'s normal handler for this request.',
        status: 0,
        code: 'REMOTE_UNSUPPORTED',
        url: publicUrl(url),
    });
}
/** Read a body to text, refusing more than `limit` bytes. */
async function readBoundedText(body, limit, url) {
    if (!body)
        return '';
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = '';
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > limit) {
                throw new ExecRemoteConnectionError({
                    message: 'The remote answer is larger than ' + limit + ' bytes; the SDK stopped reading it.',
                    status: 0,
                    code: 'REMOTE_ANSWER_TOO_LARGE',
                    url: publicUrl(url),
                });
            }
            text += decoder.decode(value, { stream: true });
        }
        return text + decoder.decode();
    }
    finally {
        void reader.cancel().catch(() => undefined);
        try {
            reader.releaseLock();
        }
        catch { /* a read still settling holds the lock */ }
    }
}
/** The length of the line terminator at `i`: 2 for \r\n, 1 for \n or \r, 0 for none. */
function terminatorAt(buf, i) {
    const c = buf.charCodeAt(i);
    if (c === 10 /* \n */)
        return 1;
    if (c !== 13 /* \r */)
        return 0;
    return buf.charCodeAt(i + 1) === 10 ? 2 : 1;
}
/**
 * The first SSE block separator (a blank line: two line terminators in a row,
 * each \r\n, \n or \r) at or after `from`, as [index, length], or null.
 * A \r that ends `buf` counts as \r: as the first terminator it finds
 * nothing (a rescan from 3 characters back sees it again with what follows),
 * as the second it ends the block, and a \n after it is an empty line.
 */
function findSseBoundary(buf, from) {
    for (let i = from; i < buf.length; i++) {
        const first = terminatorAt(buf, i);
        if (first === 0)
            continue;
        const second = terminatorAt(buf, i + first);
        if (second !== 0)
            return [i, first + second];
        i += first - 1;
    }
    return null;
}
/** The data payload of one SSE block (`data:` lines joined by \n), or null for a comment-only block. */
function sseBlockData(block) {
    const data = [];
    for (const line of block.split(/\r\n|\n|\r/)) {
        if (line.length === 0 || line.startsWith(':'))
            continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        if (field !== 'data')
            continue;
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' '))
            value = value.slice(1);
        data.push(value);
    }
    return data.length === 0 ? null : data.join('\n');
}
function parseFrame(text, url) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (cause) {
        throw new ExecRemoteConnectionError({
            message: 'A remote event frame is not JSON.',
            status: 0,
            code: 'REMOTE_BAD_FRAME',
            url: publicUrl(url),
            cause,
        });
    }
    const frame = asRecord(value);
    if (!frame || typeof frame.event !== 'string') {
        throw new ExecRemoteConnectionError({
            message: 'A remote event frame has no event name.',
            status: 0,
            code: 'REMOTE_BAD_FRAME',
            url: publicUrl(url),
        });
    }
    return frame;
}
/**
 * SSE frames from a body. Holds at most one partial block, refused past
 * `limit` bytes. The partial block is kept as the pieces it arrived in and
 * joined only when a separator arrives: a read without one scans that read
 * alone (plus the last 3 characters before it), so a block that trickles in
 * over many reads is copied once, and the work is linear in the stream length.
 */
async function* sseFrames(body, limit, url, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let parts = [];
    let size = 0;
    // The partial block's last 3 characters: a separator not found yet starts
    // there at the earliest.
    let tail = '';
    const onAbort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        for (;;) {
            if (signal.aborted)
                throw signal.reason;
            const { done, value } = await reader.read();
            if (signal.aborted)
                throw signal.reason;
            if (done) {
                const data = sseBlockData(parts.join('') + decoder.decode());
                if (data !== null)
                    yield parseFrame(data, url);
                return;
            }
            const text = decoder.decode(value, { stream: true });
            const edge = tail + text;
            if (findSseBoundary(edge, 0) === null) {
                parts.push(text);
                size += text.length;
                tail = edge.slice(-3);
            }
            else {
                let buf = parts.join('') + text;
                let scanFrom = Math.max(0, size - 3);
                for (;;) {
                    const hit = findSseBoundary(buf, scanFrom);
                    if (hit === null)
                        break;
                    const block = buf.slice(0, hit[0]);
                    buf = buf.slice(hit[0] + hit[1]);
                    scanFrom = 0;
                    const data = sseBlockData(block);
                    if (data !== null)
                        yield parseFrame(data, url);
                }
                parts = buf.length > 0 ? [buf] : [];
                size = buf.length;
                tail = buf.slice(-3);
            }
            // Measured in UTF-16 units; one unit is at least one byte on the wire.
            if (size > limit) {
                throw new ExecRemoteConnectionError({
                    message: 'A remote event frame is larger than ' + limit + ' bytes; the SDK closed the stream.',
                    status: 0,
                    code: 'REMOTE_FRAME_TOO_LARGE',
                    url: publicUrl(url),
                });
            }
        }
    }
    finally {
        signal.removeEventListener('abort', onAbort);
        void reader.cancel().catch(() => undefined);
        try {
            reader.releaseLock();
        }
        catch { /* a read still settling holds the lock */ }
    }
}
/** An AbortController that follows the caller's signals. */
function linkedController(...signals) {
    const controller = new AbortController();
    const unlinks = [];
    for (const s of signals) {
        if (!s)
            continue;
        if (s.aborted) {
            controller.abort(s.reason);
            break;
        }
        const onAbort = () => controller.abort(s.reason);
        s.addEventListener('abort', onAbort, { once: true });
        unlinks.push(() => s.removeEventListener('abort', onAbort));
    }
    return { controller, unlink: () => { for (const u of unlinks)
            u(); } };
}
/** `work`, or its signal's reason once `signal` aborts first; the work itself goes on (a shared socket still opening). */
function untilAborted(work, signal) {
    if (!signal)
        return work;
    if (signal.aborted)
        return Promise.reject(signal.reason);
    let onAbort;
    const aborted = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });
    return Promise.race([work, aborted]).finally(() => signal.removeEventListener('abort', onAbort));
}
const CLIENT_TIMEOUT = Symbol('hoody.exec.remote.client-timeout');
const CONNECTION_CLOSED = Symbol('hoody.exec.remote.connection-closed');
function clientTimeoutError(url, ms) {
    return new ExecRemoteTimeoutError({
        message: 'No remote answer within ' + ms + ' ms; the SDK stopped waiting. The op may still complete on the server.',
        status: 0,
        code: 'REMOTE_CLIENT_TIMEOUT',
        url: publicUrl(url),
    });
}
function closedError(url) {
    return new ExecRemoteConnectionError({
        message: 'The remote connection was closed.',
        status: 0,
        code: 'REMOTE_CONNECTION_CLOSED',
        url: publicUrl(url),
    });
}
/** The longest delay a timer takes (2^31-1 ms); a longer one fires at once. The server caps its own there too. */
export const EXEC_REMOTE_MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** The largest per-op `timeoutMs`: the client waits it plus a grace, and that must still fit a timer. */
const MAX_OP_TIMEOUT_MS = EXEC_REMOTE_MAX_TIMEOUT_MS - TIMEOUT_GRACE_MS;
function assertTimeout(value, what, max = EXEC_REMOTE_MAX_TIMEOUT_MS) {
    if (value === undefined)
        return;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
        throw new TypeError(what + ' must be a whole number of milliseconds from 1 to ' + max);
    }
}
/** Headers a browser socket may go without: nothing in them is a credential. */
const NON_CREDENTIAL_UPGRADE_HEADERS = new Set([
    'accept', 'user-agent', 'content-type', 'x-hoody-client-id', 'x-hoody-client-name',
]);
function isBrowserRuntime() {
    return typeof globalThis.window !== 'undefined'
        && typeof globalThis.document !== 'undefined';
}
async function openRemoteSocket(url, protocols, headers) {
    if (isBrowserRuntime()) {
        const credential = Object.keys(headers).find((h) => !NON_CREDENTIAL_UPGRADE_HEADERS.has(h.toLowerCase()));
        if (credential !== undefined) {
            // A browser socket cannot send headers; dropping the kit credential
            // would reach the container without it.
            throw new ExecRemoteConnectionError({
                message: 'This client\'s kit credential is a header (' + credential + '), which a browser WebSocket cannot send. '
                    + 'Use the default transport (ws: false), or a kitAuth token with a query `param`.',
                status: 0,
                code: 'REMOTE_SOCKET_NEEDS_HEADERS',
                url: publicUrl(url),
            });
        }
        const Ctor = globalThis.WebSocket;
        return new Ctor(url, protocols);
    }
    let mod;
    try {
        mod = (await import(/* @vite-ignore */ 'ws'));
    }
    catch {
        mod = undefined;
    }
    if (mod) {
        return new mod.default(url, protocols, { headers, maxPayload: EXEC_REMOTE_MAX_BODY_BYTES });
    }
    const credential = Object.keys(headers).some((h) => !NON_CREDENTIAL_UPGRADE_HEADERS.has(h.toLowerCase()));
    const Ctor = globalThis.WebSocket;
    if (!credential && typeof Ctor === 'function')
        return new Ctor(url, protocols);
    throw new ExecRemoteConnectionError({
        message: 'Attach needs the `ws` package on this runtime (npm install ws).',
        status: 0,
        code: 'REMOTE_SOCKET_UNAVAILABLE',
        url: publicUrl(url),
    });
}
/**
 * The server's final frame, `{ event: 'end', reason }`. A script may emit its own `end`
 * event, but every emitted frame carries a `generation`; the server's end frame does not.
 */
function isServerEnd(frame) {
    return frame.event === 'end' && typeof frame.reason === 'string' && !('generation' in frame);
}
/**
 * The refusal a revoked session ends with, or undefined for any other frame. On SSE the server
 * sends it as its end frame `{ event: 'end', reason: 'revoked', status, error }`; on the attach
 * socket it sends the refusal frame and closes 4000 + status, which onClose already types.
 */
function revokedError(frame, url) {
    if (!isServerEnd(frame) || frame.reason !== 'revoked')
        return undefined;
    return execRemoteErrorFromBody(typeof frame.status === 'number' ? frame.status : 0, frame.error, url);
}
/** The first frame of a stream or socket must be `attached` (v1); anything else is a server without remote ops. */
function assertAttached(frame, url) {
    if (frame?.event === 'attached' && frame.v === 1)
        return;
    throw unsupported(url, frame === undefined
        ? 'the stream ended before its attached frame'
        : 'the first frame was ' + (typeof frame.event === 'string' ? '"' + frame.event.slice(0, 40) + '"' : 'not an event') + ', not attached v1');
}
function toSocketUrl(url) {
    return url.replace(/^http(s?):/i, (_m, s) => 'ws' + s + ':');
}
/** The most frame bytes (UTF-8) kept for a socket's first reader: the server's own per-session queue (SESSION_QUEUE_MAX_BYTES). */
export const EXEC_REMOTE_EARLY_MAX_BYTES = 8 * 1024 * 1024;
/** Frames are kept for the first reader only this long after `attached`; then they are released. */
export const EXEC_REMOTE_EARLY_WINDOW_MS = 1000;
/** The UTF-8 size of a string, as the server counts its queue (a lone surrogate counts 3, as it encodes). */
function utf8Bytes(text) {
    let size = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 0x80)
            size += 1;
        else if (c < 0x800)
            size += 2;
        else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
            size += 4;
            i++;
        }
        else
            size += 3;
    }
    return size;
}
/** The status a socket close code stands for (4401 → 401 …). */
function closeStatus(code) {
    return code >= 4000 && code < 5000 ? code - 4000 : 0;
}
// A spec WebSocket accepts only 1000 and 3000-4999 from the client and throws
// on anything else, which would leave the socket open. The SDK's own closes
// use these application codes.
/** The client closed: a frame broke the protocol (not JSON, or not `attached` first, or the wrong subprotocol). */
const CLOSE_BAD_FRAME = 4002;
/** The client closed: a frame was over the size cap. */
const CLOSE_TOO_LARGE = 4009;
/** The client closed: frames piled up unread past the queue cap. */
const CLOSE_OVERLOADED = 4013;
/** A close reason is at most 123 UTF-8 bytes; a longer one throws (and `ws` is then left half-closed). */
function closeReason(reason) {
    const encoder = new TextEncoder();
    let out = reason.slice(0, 123);
    while (encoder.encode(out).byteLength > 123)
        out = out.slice(0, -1);
    return out;
}
/** Close a socket with `code` when a client may send it, else with none; never throws. */
function closeSocket(ws, code, reason) {
    const sendable = code === 1000 || (code >= 3000 && code <= 4999);
    try {
        if (sendable)
            ws.close(code, closeReason(reason));
        else
            ws.close();
    }
    catch { /* already closing */ }
}
class AttachSession {
    ws;
    url;
    defaultTimeoutMs;
    closed;
    pending = new Map();
    nextId = 1;
    consumer;
    endInfo;
    resolveClosed;
    /** A refusal sent as a frame before the close, used as the close's error. */
    refusal;
    attached;
    hello;
    helloPending;
    /** The server sent its final `end` frame: the close that follows ends frames() normally, as on SSE. */
    sawEnd = false;
    /**
     * Frames that arrived before the first frames() reader: the frames right after `attached` can
     * arrive in the same read, before any reader could register. Only the latest are kept (at most
     * EXEC_REMOTE_FRAME_QUEUE_CAP frames and EXEC_REMOTE_EARLY_MAX_BYTES of UTF-8), and only
     * for EXEC_REMOTE_EARLY_WINDOW_MS after `attached`, so a send/call-only socket keeps nothing.
     * undefined once a reader has taken them or the window has closed.
     */
    early = [];
    /** The UTF-8 size of each kept frame, and their sum. */
    earlySizes = [];
    earlyBytes = 0;
    /** The end of the keep window, on the monotonic clock (performance.now()), so a wall-clock jump cannot move it. */
    earlyUntil = Number.POSITIVE_INFINITY;
    earlyTimer;
    constructor(ws, url, defaultTimeoutMs) {
        this.ws = ws;
        this.url = url;
        this.defaultTimeoutMs = defaultTimeoutMs;
        this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
        this.hello = new Promise((resolve, reject) => { this.helloPending = { resolve, reject }; });
        // Awaited by waitAttached(); a rejection before then is not unhandled.
        this.hello.catch(() => undefined);
        ws.addEventListener('message', (event) => this.onMessage(event.data));
        ws.addEventListener('close', (event) => this.onClose(event.code ?? 1006, event.reason ?? ''));
    }
    onMessage(data) {
        if (typeof data !== 'string')
            return; // the protocol is text frames only
        if (data.length > EXEC_REMOTE_MAX_BODY_BYTES) {
            this.fail(new ExecRemoteConnectionError({
                message: 'A remote frame is larger than ' + EXEC_REMOTE_MAX_BODY_BYTES + ' bytes; the SDK closed the socket.',
                status: 0,
                code: 'REMOTE_FRAME_TOO_LARGE',
                url: publicUrl(this.url),
            }), CLOSE_TOO_LARGE);
            return;
        }
        let value;
        try {
            value = JSON.parse(data);
        }
        catch {
            value = undefined;
        }
        const record = asRecord(value);
        if (!record) {
            this.fail(new ExecRemoteConnectionError({
                message: 'A remote frame is not a JSON object.',
                status: 0,
                code: 'REMOTE_BAD_FRAME',
                url: publicUrl(this.url),
            }), CLOSE_BAD_FRAME);
            return;
        }
        const isRefusal = record.ok === false && !('id' in record);
        if (this.helloPending && !isRefusal) {
            if (record.event === 'attached' && record.v === 1) {
                this.attached = record;
                this.earlyUntil = performance.now() + EXEC_REMOTE_EARLY_WINDOW_MS;
                this.armEarlyExpiry();
                const hello = this.helloPending;
                this.helloPending = undefined;
                hello.resolve();
            }
            else {
                try {
                    assertAttached(record, this.url);
                }
                catch (error) {
                    this.fail(error, CLOSE_BAD_FRAME);
                }
            }
            return;
        }
        if (typeof record.id === 'number' && typeof record.ok === 'boolean') {
            const p = this.pending.get(record.id);
            if (!p)
                return; // a reply for a request that already timed out
            this.pending.delete(record.id);
            p.cleanup();
            if (record.ok) {
                const { id: _id, ...answer } = record;
                p.resolve(answer);
            }
            else {
                const status = typeof record.status === 'number' ? record.status : 0;
                p.reject(execRemoteErrorFromBody(status, record.error, this.url));
            }
            return;
        }
        if (typeof record.event === 'string') {
            if (isServerEnd(record))
                this.sawEnd = true;
            if (this.consumer) {
                this.consumer.push(record);
            }
            else if (this.early) {
                if (performance.now() > this.earlyUntil)
                    this.releaseEarly();
                else
                    this.keepEarly(record, utf8Bytes(data));
            }
            return;
        }
        if (isRefusal) {
            // A refusal: the server sends it as the first frame, then closes 4000+status.
            const status = typeof record.status === 'number' ? record.status : 0;
            this.refusal = execRemoteErrorFromBody(status, record.error, this.url);
        }
        // A reply with id null answers a frame the server could not parse; the SDK sends none.
    }
    /** Keep a frame for the first reader, dropping the oldest past the count or byte cap. */
    keepEarly(frame, size) {
        const early = this.early;
        early.push(frame);
        this.earlySizes.push(size);
        this.earlyBytes += size;
        while (early.length > EXEC_REMOTE_FRAME_QUEUE_CAP || this.earlyBytes > EXEC_REMOTE_EARLY_MAX_BYTES) {
            early.shift();
            this.earlyBytes -= this.earlySizes.shift();
        }
    }
    /** The kept frames, if the window is still open; nothing is kept from now on. */
    takeEarly() {
        const kept = this.early !== undefined && performance.now() <= this.earlyUntil ? this.early : [];
        this.releaseEarly();
        return kept;
    }
    releaseEarly() {
        this.early = undefined;
        this.earlySizes = [];
        this.earlyBytes = 0;
        if (this.earlyTimer !== undefined)
            clearTimeout(this.earlyTimer);
        this.earlyTimer = undefined;
    }
    /** Release the kept frames when the window closes, even if no frame arrives to notice it. */
    armEarlyExpiry() {
        if (this.early === undefined)
            return;
        const left = this.earlyUntil - performance.now();
        if (left < 0) {
            this.releaseEarly();
            return;
        }
        this.earlyTimer = setTimeout(() => this.armEarlyExpiry(), left + 1);
        this.earlyTimer.unref?.();
    }
    /** `local`: the SDK closed it (its code is not the server's refusal). */
    onClose(code, reason, local = false) {
        if (this.endInfo)
            return;
        let error = this.refusal;
        if (!error && !local && code >= 4000 && code < 5000) {
            // A refusal whose frame did not arrive: the reason is its details.code.
            const serverCode = /^[A-Z][A-Z0-9_]{0,100}$/.test(reason) ? reason : undefined;
            error = execRemoteErrorFromBody(closeStatus(code), {
                error: 'The remote socket was refused (' + code + (reason ? ': ' + reason.slice(0, 120) : '') + ').',
                ...(serverCode !== undefined ? { details: { code: serverCode } } : {}),
            }, this.url);
        }
        else if (!error && code !== 1000 && code !== 1005) {
            error = new ExecRemoteConnectionError({
                message: 'The remote socket closed (' + code + (reason ? ': ' + reason.slice(0, 200) : '') + ').',
                status: 0,
                code: code === 1013 ? 'REMOTE_SOCKET_OVERLOADED' : 'REMOTE_SOCKET_CLOSED',
                details: { closeCode: code },
                url: publicUrl(this.url),
            });
        }
        this.endInfo = { code, reason, ...(error ? { error } : {}) };
        const rejection = error ?? closedError(this.url);
        if (this.helloPending) {
            this.helloPending.reject(rejection);
            this.helloPending = undefined;
        }
        for (const [, p] of this.pending) {
            p.cleanup();
            p.reject(rejection);
        }
        this.pending.clear();
        this.consumer?.end(this.sawEnd ? undefined : error);
        this.consumer = undefined;
        // Kept frames stay for a reader that comes within the window; no timer outlives the socket.
        if (this.earlyTimer !== undefined)
            clearTimeout(this.earlyTimer);
        this.earlyTimer = undefined;
        this.resolveClosed(this.endInfo);
    }
    fail(error, code) {
        this.refusal = error;
        closeSocket(this.ws, code, error.code);
        // Some implementations deliver 'close' late or never after a local close.
        this.onClose(code, error.code, true);
    }
    request(frame, options) {
        if (this.endInfo)
            return Promise.reject(this.endInfo.error ?? closedError(this.url));
        try {
            assertTimeout(options?.timeoutMs, 'timeoutMs', MAX_OP_TIMEOUT_MS);
        }
        catch (error) {
            return Promise.reject(error);
        }
        if (this.pending.size >= EXEC_REMOTE_MAX_PENDING) {
            return Promise.reject(new ExecRemoteError({
                message: 'Too many remote requests are waiting for a reply on this socket (' + EXEC_REMOTE_MAX_PENDING + ').',
                status: 0,
                code: 'REMOTE_TOO_MANY_PENDING',
                url: publicUrl(this.url),
            }));
        }
        const signal = options?.signal;
        if (signal?.aborted)
            return Promise.reject(signal.reason);
        const id = this.nextId++;
        let text;
        try {
            text = JSON.stringify({ id, ...frame, ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) });
        }
        catch (cause) {
            return Promise.reject(cause);
        }
        if (new TextEncoder().encode(text).byteLength > EXEC_REMOTE_MAX_FRAME_BYTES) {
            // Sent, it would close the socket (1009) for every op on it.
            return Promise.reject(new ExecRemoteError({
                message: 'The remote frame is larger than ' + EXEC_REMOTE_MAX_FRAME_BYTES + ' bytes, the attach socket limit; send it as a one-shot op (ws: false).',
                status: 413,
                code: 'REMOTE_FRAME_TOO_LARGE',
                url: publicUrl(this.url),
            }));
        }
        const waitMs = options?.timeoutMs !== undefined ? options.timeoutMs + TIMEOUT_GRACE_MS : this.defaultTimeoutMs;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                cleanup();
                reject(clientTimeoutError(this.url, waitMs));
            }, waitMs);
            const onAbort = () => {
                this.pending.delete(id);
                cleanup();
                reject(signal?.reason);
            };
            const cleanup = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.pending.set(id, { resolve, reject, cleanup });
            try {
                this.ws.send(text);
            }
            catch (cause) {
                this.pending.delete(id);
                cleanup();
                reject(new ExecRemoteConnectionError({
                    message: 'The remote socket refused the frame.',
                    status: 0,
                    code: 'REMOTE_SOCKET_CLOSED',
                    url: publicUrl(this.url),
                    cause,
                }));
            }
        });
    }
    async send(message, options) {
        return (await this.request({ op: 'send', message }, options));
    }
    async call(name, args = [], options) {
        assertCallArgs(name, args);
        return (await this.request({ op: 'call', name, args }, options));
    }
    frames(options) {
        const session = this;
        return {
            [Symbol.asyncIterator]() {
                return session.iterate(options?.signal)[Symbol.asyncIterator]();
            },
        };
    }
    async *iterate(signal) {
        if (this.consumer) {
            throw new ExecRemoteError({
                message: 'This socket already has a frames() consumer; one at a time.',
                status: 0,
                code: 'REMOTE_FRAMES_BUSY',
                url: publicUrl(this.url),
            });
        }
        if (this.endInfo) {
            // Frames kept before a close are still delivered, then the close's error.
            for (const frame of this.takeEarly())
                yield frame;
            if (this.endInfo.error && !this.sawEnd)
                throw this.endInfo.error;
            return;
        }
        // The first reader takes the frames kept since `attached`; later readers see only new frames.
        const queue = this.takeEarly();
        let ended = false;
        let endError;
        let wake;
        const notify = () => { const w = wake; wake = undefined; w?.(); };
        const consumer = {
            push: (frame) => {
                if (queue.length >= EXEC_REMOTE_FRAME_QUEUE_CAP) {
                    this.fail(new ExecRemoteConnectionError({
                        message: 'More than ' + EXEC_REMOTE_FRAME_QUEUE_CAP + ' remote frames are waiting to be read; the SDK closed the socket.',
                        status: 0,
                        code: 'REMOTE_FRAME_QUEUE_FULL',
                        url: publicUrl(this.url),
                    }), CLOSE_OVERLOADED);
                    return;
                }
                queue.push(frame);
                notify();
            },
            end: (error) => { ended = true; endError = error; notify(); },
        };
        this.consumer = consumer;
        const onAbort = () => { ended = true; endError = signal?.reason; notify(); };
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            for (;;) {
                if (signal?.aborted)
                    throw signal.reason;
                const next = queue.shift();
                if (next !== undefined) {
                    yield next;
                    continue;
                }
                if (ended) {
                    if (endError !== undefined)
                        throw endError;
                    return;
                }
                await new Promise((resolve) => { wake = resolve; });
            }
        }
        finally {
            signal?.removeEventListener('abort', onAbort);
            if (this.consumer === consumer)
                this.consumer = undefined;
        }
    }
    /** Settles once the `attached` frame arrived; rejects with the refusal, or Unsupported after `ms`. */
    async waitAttached(ms) {
        let timer;
        const late = new Promise((_, reject) => {
            timer = setTimeout(() => reject(unsupported(this.url, 'no attached frame within ' + ms + ' ms')), ms);
        });
        try {
            await Promise.race([this.hello, late]);
        }
        finally {
            clearTimeout(timer);
        }
    }
    close(code = 1000, reason = '') {
        // Already closed by the server, or closing by the SDK.
        if (this.endInfo)
            return;
        closeSocket(this.ws, code, reason);
        // Settle local state now: a peer that never answers the close must not hold pending calls.
        this.onClose(code, reason, true);
    }
}
/** The socket URL with the console level the server subscribes the socket to when it opens. */
function withTail(socketUrl, tail) {
    if (tail === undefined)
        return socketUrl;
    const u = new URL(socketUrl);
    u.searchParams.set('tail', tail);
    return u.toString();
}
/**
 * Open an attach socket and wait for its `attached` frame. `timeoutMs` bounds the whole
 * handshake (upgrade, open, attached) and `signal` cancels it at any point: either closes the
 * socket at once, even one still opening, and the open rejects with the signal's reason, a
 * timeout before the socket opened, or Unsupported once it opened without `attached`.
 */
async function openSession(transport, url, token, timeoutMs, signal, tail) {
    if (signal.aborted)
        throw signal.reason;
    let ws;
    let session;
    let opened = false;
    let cancelled = false;
    /** The fallback for an 'error' with no 'close' after it; cleared when the open settles. */
    let errorTimer;
    let stop;
    const stopped = new Promise((_, reject) => { stop = reject; });
    stopped.catch(() => undefined);
    const cancel = (error, code = 1000, reason = '') => {
        if (cancelled)
            return;
        cancelled = true;
        if (session)
            session.close(code, reason);
        else if (ws)
            closeSocket(ws, code, reason);
        stop(error);
    };
    const onAbort = () => cancel(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
        // Opened without `attached`: a protocol failure, closed as one. Not opened: the client gave up.
        if (opened)
            cancel(unsupported(url, 'no attached frame within ' + timeoutMs + ' ms'), CLOSE_BAD_FRAME, 'protocol');
        else {
            cancel(new ExecRemoteTimeoutError({
                message: 'The remote socket did not open within ' + timeoutMs + ' ms; the SDK closed it.',
                status: 0,
                code: 'REMOTE_CLIENT_TIMEOUT',
                url: publicUrl(url),
            }));
        }
    }, timeoutMs);
    const race = (step) => Promise.race([step, stopped]);
    try {
        const target = await race(transport.upgrade(url));
        const protocols = [EXEC_REMOTE_SUBPROTOCOL];
        if (token !== undefined)
            protocols.push(EXEC_REMOTE_TOKEN_PROTOCOL_PREFIX + base64Url(token));
        const socketUrl = withTail(toSocketUrl(target.url), tail);
        const socket = await race(openRemoteSocket(socketUrl, protocols, target.headers).then((created) => {
            // The `ws` package emits 'error' when a socket is closed while connecting, and an
            // EventEmitter with no 'error' listener throws it out of the process.
            created.addEventListener('error', () => undefined);
            // A socket that comes into being after the cancel is closed at once.
            if (cancelled)
                closeSocket(created, 1000, '');
            else
                ws = created;
            return created;
        }));
        // The session listens from the start, so a refusal frame or a close that
        // arrives around 'open' is never missed.
        const attachSession = session = new AttachSession(socket, url, timeoutMs);
        const isOpen = await race(new Promise((resolve) => {
            let settled = false;
            const settle = (value) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(errorTimer);
                resolve(value);
            };
            socket.addEventListener('open', () => settle(true));
            void attachSession.closed.then(() => settle(false));
            socket.addEventListener('error', () => {
                if (settled || cancelled || errorTimer !== undefined)
                    return;
                // 'close' normally follows with the code; do not wait for it forever.
                errorTimer = setTimeout(() => { attachSession.close(1006, 'error'); settle(false); }, 1000);
                errorTimer.unref?.();
            });
        }));
        if (!isOpen) {
            const info = await attachSession.closed;
            const error = info.error;
            if (error && error.code !== 'REMOTE_SOCKET_CLOSED')
                throw error;
            throw new ExecRemoteConnectionError({
                message: 'The remote socket did not open (' + info.code + (info.reason ? ': ' + info.reason.slice(0, 200) : '') + ').',
                status: 0,
                code: 'REMOTE_SOCKET_REFUSED',
                details: { closeCode: info.code },
                url: publicUrl(url),
            });
        }
        opened = true;
        if (socket.protocol !== EXEC_REMOTE_SUBPROTOCOL) {
            throw unsupported(url, 'the socket did not select ' + EXEC_REMOTE_SUBPROTOCOL);
        }
        // A server that echoes the offered protocol without remote ops never sends `attached`.
        await race(attachSession.waitAttached(ATTACHED_WAIT_MS));
        return attachSession;
    }
    catch (error) {
        // A no-op for a socket the cancel or the server already closed.
        session?.close(CLOSE_BAD_FRAME, 'protocol');
        throw error;
    }
    finally {
        clearTimeout(timer);
        clearTimeout(errorTimer);
        signal.removeEventListener('abort', onAbort);
    }
}
// ---------------------------------------------------------------------------
// The connection
// ---------------------------------------------------------------------------
function assertCallArgs(name, args) {
    if (typeof name !== 'string' || name.length === 0)
        throw new TypeError('call: name must be a non-empty string');
    if (!Array.isArray(args))
        throw new TypeError('call: args must be an array');
}
/**
 * The token travels as a header value, so it must be printable Latin-1 with no
 * spaces. Anything else is refused before any request: a transport would fail
 * on it with the header, token included, in its error text, and fetch trims
 * surrounding spaces, which would send a different token.
 */
function assertToken(token) {
    if (token === undefined)
        return;
    if (typeof token !== 'string' || token.length === 0)
        throw new TypeError('connect: token must be a non-empty string');
    if (!/^[\x21-\x7e\xa1-\xff]+$/.test(token)) {
        throw new TypeError('connect: the token may hold only printable Latin-1 characters (no spaces, control characters or characters above U+00FF)');
    }
}
/** What may be kept of a transport failure: its name and error codes, never its text (it can quote headers). */
function transportFailure(error) {
    const out = {};
    const word = (v, re) => (typeof v === 'string' && re.test(v) ? v : undefined);
    const e = error;
    const name = word(e?.name, /^[A-Za-z]{1,40}$/);
    const code = word(e?.code, /^[A-Z][A-Z0-9_]{0,40}$/);
    const causeCode = word(e?.cause?.code, /^[A-Z][A-Z0-9_]{0,40}$/);
    if (name !== undefined)
        out.name = name;
    if (code !== undefined)
        out.code = code;
    if (causeCode !== undefined)
        out.causeCode = causeCode;
    return out;
}
function functionSource(fn) {
    if (typeof fn !== 'function')
        throw new TypeError('evaluate: fn must be a function');
    const source = Function.prototype.toString.call(fn);
    if (/\{\s*\[native code\]\s*\}\s*$/.test(source)) {
        throw new TypeError('evaluate: a native or bound function has no source to send; pass an arrow or function expression');
    }
    return source;
}
class RemoteConnection {
    transport;
    url;
    token;
    useWs;
    defaultTimeoutMs;
    controller = new AbortController();
    session;
    sessions = new Set();
    constructor(transport, url, token, useWs, defaultTimeoutMs) {
        this.transport = transport;
        this.url = url;
        this.token = token;
        this.useWs = useWs;
        this.defaultTimeoutMs = defaultTimeoutMs;
    }
    assertOpen() {
        if (this.controller.signal.aborted)
            throw closedError(this.url);
    }
    headers(op, accept) {
        const headers = { [EXEC_REMOTE_HEADER]: op, Accept: accept };
        if (this.token !== undefined)
            headers[TOKEN_HEADER] = this.token;
        return headers;
    }
    async oneShot(method, op, body, options) {
        this.assertOpen();
        assertTimeout(options?.timeoutMs, 'timeoutMs', MAX_OP_TIMEOUT_MS);
        const waitMs = options?.timeoutMs !== undefined ? options.timeoutMs + TIMEOUT_GRACE_MS : this.defaultTimeoutMs;
        const { controller, unlink } = linkedController(options?.signal, this.controller.signal);
        const timer = setTimeout(() => controller.abort(CLIENT_TIMEOUT), waitMs);
        const payload = body === undefined
            ? undefined
            : { ...body, ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) };
        try {
            const answer = await this.transport.send(method, this.url, {
                headers: this.headers(op, 'application/json'),
                ...(payload !== undefined ? { body: payload } : {}),
                signal: controller.signal,
                timeoutMs: waitMs,
            });
            if (answer.kind === 'refused')
                throw execRemoteErrorFromBody(answer.status, answer.body, this.url);
            if (!hasVersionHeader(answer.headers)) {
                void answer.body?.cancel().catch(() => undefined);
                throw unsupported(this.url, 'no ' + EXEC_REMOTE_VERSION_HEADER + ' on a ' + answer.status + ' answer');
            }
            const text = await readBoundedText(answer.body, EXEC_REMOTE_MAX_BODY_BYTES, this.url);
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch (cause) {
                throw new ExecRemoteConnectionError({
                    message: 'The remote answer is not JSON.',
                    status: answer.status,
                    code: 'REMOTE_BAD_ANSWER',
                    url: publicUrl(this.url),
                    cause,
                });
            }
            const record = asRecord(parsed);
            if (op !== 'capabilities' && record?.ok !== true)
                throw execRemoteErrorFromBody(answer.status, parsed, this.url);
            return parsed;
        }
        catch (error) {
            throw this.settleError(error, controller.signal, waitMs);
        }
        finally {
            clearTimeout(timer);
            unlink();
        }
    }
    /** What to raise once a request failed: the reason our own signals give wins over the transport's error. */
    settleError(error, signal, waitMs) {
        if (error instanceof ExecRemoteError)
            return error;
        if (signal.aborted) {
            if (signal.reason === CLIENT_TIMEOUT)
                return clientTimeoutError(this.url, waitMs);
            return this.publicReason(signal.reason);
        }
        // Fixed text and no cause: a transport's message can quote the request's headers.
        return new ExecRemoteConnectionError({
            message: 'No remote answer: the request failed before an answer arrived (network, DNS, TLS or a refused connection).',
            status: 0,
            code: 'REMOTE_UNREACHABLE',
            details: { transport: transportFailure(error) },
            url: publicUrl(this.url),
        });
    }
    /** An abort reason as raised to the caller: the connection's own close is a typed error, never its internal symbol. */
    publicReason(reason) {
        return reason === CONNECTION_CLOSED ? closedError(this.url) : reason;
    }
    attachShared() {
        this.assertOpen();
        if (!this.session) {
            const opening = this.openTracked();
            this.session = opening;
            // A failed or closed shared socket is reopened by the next op.
            opening.then((s) => { void s.closed.then(() => { if (this.session === opening)
                this.session = undefined; }); }, () => { if (this.session === opening)
                this.session = undefined; });
        }
        return this.session;
    }
    /** Open an attach socket that close() (and `signal`, while it opens) cancels, even before it opened. */
    async openTracked(signal, tail) {
        const { controller, unlink } = linkedController(signal, this.controller.signal);
        let session;
        try {
            session = await openSession(this.transport, this.url, this.token, this.defaultTimeoutMs, controller.signal, tail);
        }
        catch (error) {
            throw controller.signal.aborted && error === controller.signal.reason ? this.publicReason(error) : error;
        }
        finally {
            unlink();
        }
        // Aborted in the turn the open settled: the linked controller holds whichever came first.
        if (controller.signal.aborted) {
            session.close();
            throw this.publicReason(controller.signal.reason);
        }
        this.sessions.add(session);
        void session.closed.then(() => this.sessions.delete(session));
        return session;
    }
    capabilities(options) {
        return this.oneShot('GET', 'capabilities', undefined, options);
    }
    async send(message, options) {
        if (this.useWs)
            return (await untilAborted(this.attachShared(), options?.signal)).send(message, options);
        return this.oneShot('POST', 'send', { message }, options);
    }
    async call(name, args = [], options) {
        assertCallArgs(name, args);
        if (this.useWs)
            return (await untilAborted(this.attachShared(), options?.signal)).call(name, args, options);
        return this.oneShot('POST', 'call', { name, args }, options);
    }
    eval(expression, options) {
        let target;
        try {
            if (typeof expression !== 'string' || expression.length === 0)
                throw new TypeError('eval: expression must be a non-empty string');
            target = evalTarget(options);
        }
        catch (error) {
            return Promise.reject(error);
        }
        return this.oneShot('POST', 'eval', { expression, ...target }, options);
    }
    evaluate(fn, args = [], options) {
        let source;
        let target;
        try {
            source = functionSource(fn);
            if (!Array.isArray(args))
                throw new TypeError('evaluate: args must be an array');
            target = evalTarget(options);
        }
        catch (error) {
            return Promise.reject(error);
        }
        return this.oneShot('POST', 'eval', { function: source, args, ...target }, options);
    }
    events(options) {
        const connection = this;
        return {
            [Symbol.asyncIterator]() {
                return (connection.useWs ? connection.wsEvents(options) : connection.sseEvents(options))[Symbol.asyncIterator]();
            },
        };
    }
    async *wsEvents(options) {
        // The server subscribes a socket to console lines when it opens (`?tail=`), so a tail gets a
        // socket of its own, closed with the iteration; without one the shared socket carries the frames.
        const own = options?.tail !== undefined ? await this.openTracked(options.signal, options.tail) : undefined;
        // The signal closes the socket at once, even while the consumer holds a frame and is not reading.
        const closeOwn = () => own?.close();
        if (own)
            options?.signal?.addEventListener('abort', closeOwn, { once: true });
        try {
            const session = own ?? await untilAborted(this.attachShared(), options?.signal);
            const { controller, unlink } = linkedController(options?.signal, this.controller.signal);
            try {
                yield* session.frames({ signal: controller.signal });
            }
            catch (error) {
                throw controller.signal.aborted && error === controller.signal.reason ? this.publicReason(error) : error;
            }
            finally {
                unlink();
            }
        }
        finally {
            options?.signal?.removeEventListener('abort', closeOwn);
            own?.close();
        }
    }
    async *sseEvents(options) {
        this.assertOpen();
        const { controller, unlink } = linkedController(options?.signal, this.controller.signal);
        try {
            let answer;
            // The connection's timeout bounds the wait for the answer, never the stream; a transport
            // that does not apply init.timeoutMs itself is cut here too.
            const timer = setTimeout(() => controller.abort(CLIENT_TIMEOUT), this.defaultTimeoutMs);
            try {
                answer = await this.transport.send('GET', this.url, {
                    headers: this.headers('events', 'text/event-stream'),
                    ...(options?.tail !== undefined ? { query: { tail: options.tail } } : {}),
                    signal: controller.signal,
                    timeoutMs: this.defaultTimeoutMs,
                });
            }
            catch (error) {
                throw this.settleError(error, controller.signal, this.defaultTimeoutMs);
            }
            finally {
                clearTimeout(timer);
            }
            if (answer.kind === 'refused')
                throw execRemoteErrorFromBody(answer.status, answer.body, this.url);
            const contentType = (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
            if (!hasVersionHeader(answer.headers) || contentType !== 'text/event-stream') {
                void answer.body?.cancel().catch(() => undefined);
                throw unsupported(this.url, hasVersionHeader(answer.headers)
                    ? 'events answered ' + (contentType || 'no content type')
                    : 'no ' + EXEC_REMOTE_VERSION_HEADER + ' on the events answer');
            }
            if (!answer.body)
                throw unsupported(this.url, 'the events answer has no body');
            const frames = sseFrames(answer.body, EXEC_REMOTE_MAX_BODY_BYTES, this.url, controller.signal);
            try {
                const first = await frames.next();
                assertAttached(first.done ? undefined : first.value, this.url);
                for await (const frame of frames) {
                    // Final: the stream ends here with the refusal, without waiting for the server's close.
                    const revoked = revokedError(frame, this.url);
                    if (revoked)
                        throw revoked;
                    yield frame;
                }
            }
            catch (error) {
                throw this.settleError(error, controller.signal, this.defaultTimeoutMs);
            }
            finally {
                await frames.return(undefined);
            }
        }
        finally {
            unlink();
        }
    }
    attach() {
        try {
            this.assertOpen();
        }
        catch (error) {
            return Promise.reject(error);
        }
        return this.openTracked();
    }
    close() {
        if (!this.controller.signal.aborted)
            this.controller.abort(CONNECTION_CLOSED);
        for (const s of this.sessions)
            s.close();
        this.sessions.clear();
        this.session = undefined;
    }
}
function evalTarget(options) {
    const out = {};
    if (options?.target !== undefined) {
        if (options.target !== 'latest' && options.target !== 'globals') {
            throw new TypeError("eval: target must be 'latest' or 'globals'");
        }
        out.target = options.target;
    }
    if (options?.start !== undefined)
        out.start = options.start === true;
    return out;
}
/**
 * Validate an absolute script URL: http(s), no credentials, no query or
 * fragment (the marker must be the only remote signal).
 */
export function assertScriptUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new TypeError('connect: not a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        throw new TypeError('connect: the URL must be http(s)');
    if (parsed.username !== '' || parsed.password !== '')
        throw new TypeError('connect: the URL must not carry credentials; pass { token }');
    if (parsed.search !== '' || parsed.hash !== '' || /[?#]/.test(url)) {
        throw new TypeError('connect: the URL must not carry a query or fragment');
    }
}
/**
 * Create a connection over any transport (the SDK and the CLI each supply
 * one). `url` must be absolute unless the transport resolves paths.
 */
export function createExecRemoteConnection(transport, url, options = {}) {
    assertToken(options.token);
    assertTimeout(options.timeoutMs, 'connect: timeoutMs');
    return new RemoteConnection(transport, url, options.token, options.ws === true, options.timeoutMs ?? EXEC_REMOTE_DEFAULT_TIMEOUT_MS);
}
const EXEC_REMOTE_PATCH_MARKER = Symbol.for('hoody.sdk.exec.remote.patch');
export function patchExecRemotePrototype() {
    const prototype = ExecService.prototype;
    if (prototype[EXEC_REMOTE_PATCH_MARKER])
        return;
    prototype['connect'] = function connect(urlOrPath, options = {}) {
        if (typeof urlOrPath !== 'string' || urlOrPath.length === 0)
            throw new TypeError('connect: a script URL or path is required');
        const internals = this;
        let url;
        if (/^[a-z][a-z0-9+.-]*:/i.test(urlOrPath)) {
            assertScriptUrl(urlOrPath);
            url = urlOrPath;
        }
        else {
            const encoded = encodeExecScriptPath(urlOrPath.replace(/^\/+/, ''), 'connect');
            url = internals.buildTemplateUrl('/' + encoded, (options.templateVars ?? {}));
        }
        return createExecRemoteConnection(execRemoteHttpTransport(internals.http), url, {
            token: options.token,
            ws: options.ws,
            timeoutMs: options.timeoutMs,
        });
    };
    prototype[EXEC_REMOTE_PATCH_MARKER] = true;
}
patchExecRemotePrototype();
