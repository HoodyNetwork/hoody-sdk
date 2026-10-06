/**
 * Events stream error taxonomy: the C5 code map and the error classes the
 * events runtime raises.
 *
 * hoody-api refuses or ends an events socket with a code, sent on the
 * `message` channel as `{type:'error', error}` or `{type:'revoked', reason}`
 * (and, for one release, also on the socket `error` event). History reads
 * (`GET /api/v1/events`) fail with an HTTP status and an `error` code. The
 * SDK reacts to each code in exactly one way, and this file is the only
 * place that decides which. The table mirrors the server's error contract; a contract test
 * on the server checks every code its socket files emit against it, and
 * `tests/unit/events-errors.test.ts` pins it here.
 */
/** C5 "refresh + reconnect". */
export const EVENTS_REFRESH_CODES = ['JWT_EXPIRED', 'AUTH_TOKEN_EXPIRED'];
/** C5 "re-admit once" (an unknown code is treated the same way). */
export const EVENTS_READMIT_CODES = ['TOKEN_AUTH_CHANGED', 'AUTH_FAILED'];
/** C5 "terminal". */
export const EVENTS_TERMINAL_CODES = [
    'TOKEN_DELETED',
    'AUTH_TOKEN_DELETED',
    'TOKEN_DISABLED',
    'AUTH_TOKEN_DISABLED',
    'EVENT_ACCESS_REVOKED',
    'EVENT_ACCESS_DENIED',
    'JWT_REVOKED',
    'AUTH_TOKEN_LINEAGE_REVOKED',
    'USER_BANNED',
    'USER_NOT_FOUND',
    'IP_NOT_ALLOWED',
    'IP_RESTRICTED',
    'REALM_SELECTION_CONFLICT',
    'REALM_FORBIDDEN',
    'REALM_REQUIRED',
    'REALM_CONFIG_MALFORMED',
    'INVALID_TOKEN',
    'MISSING_TOKEN',
    'JWT_REQUIRED',
];
/** C5 "backoff". */
export const EVENTS_BACKOFF_CODES = ['CONNECTION_LIMIT_EXCEEDED'];
/** C5 "non-fatal": the socket stays up. */
export const EVENTS_NONFATAL_CODES = [
    'INVALID_SUBSCRIPTION',
    'SUBSCRIPTION_NOT_ALLOWED',
    'SUBSCRIPTION_LIMIT_EXCEEDED',
    'INVALID_PROJECT_ID',
    'INVALID_CONTAINER_ID',
    'CONNECTION_NOT_FOUND',
];
/** History error codes. */
export const EVENTS_CURSOR_INVALID = 'EVENTS_CURSOR_INVALID';
export const EVENTS_QUERY_CONFLICT = 'EVENTS_QUERY_CONFLICT';
export const EVENTS_CURSOR_EXPIRED = 'EVENTS_CURSOR_EXPIRED';
export const EVENTS_HISTORY_RESET = 'EVENTS_HISTORY_RESET';
const SOCKET_ACTIONS = new Map([
    ...EVENTS_REFRESH_CODES.map((c) => [c, 'refresh']),
    ...EVENTS_READMIT_CODES.map((c) => [c, 'readmit']),
    ...EVENTS_TERMINAL_CODES.map((c) => [c, 'terminal']),
    ...EVENTS_BACKOFF_CODES.map((c) => [c, 'backoff']),
    ...EVENTS_NONFATAL_CODES.map((c) => [c, 'nonfatal']),
]);
/**
 * The action for a socket code. An unknown code (a server newer than this
 * SDK, or the legacy `UNAUTHORIZED` fallback) re-admits once: C5 puts
 * "unknown" in that row, so a code the SDK has never seen neither kills a
 * watcher outright nor loops forever.
 */
export function socketActionFor(code) {
    if (typeof code !== 'string' || code.length === 0)
        return 'readmit';
    return SOCKET_ACTIONS.get(code) ?? 'readmit';
}
/**
 * The action for a failed history read ("HTTP history codes"). `status`
 * and `code` come from the generated ApiError, whose `code` is the body's
 * `error` field when it is code-shaped.
 */
export function historyActionFor(status, code) {
    if (code === EVENTS_CURSOR_INVALID)
        return { kind: 'gap', reason: 'cursor_invalid' };
    if (code === EVENTS_CURSOR_EXPIRED)
        return { kind: 'gap', reason: 'cursor_expired' };
    if (code === EVENTS_HISTORY_RESET)
        return { kind: 'gap', reason: 'history_reset' };
    if (code === EVENTS_QUERY_CONFLICT)
        return { kind: 'programming', code };
    // A 401 reaching this layer means the HTTP client's single-flight
    // refresh already ran and produced nothing: nothing else can refresh.
    if (status === 401 || status === 403)
        return { kind: 'terminal', code: code ?? `HTTP_${status}` };
    if (status === 429)
        return { kind: 'backoff' };
    return { kind: 'retry' };
}
/** Base class of every error the events runtime raises. */
export class EventsError extends Error {
    /** The server code, or an SDK code (`EVENTS_CLOSED`, `EVENTS_TIMEOUT`, …). */
    code;
    constructor(code, message, options) {
        super(message);
        this.name = 'EventsError';
        this.code = code;
        if (options && options.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}
/**
 * The server refused or revoked the stream with a terminal code, or the token
 * could not be refreshed. The stream stays closed until the session changes
 * (login, adoptSession, setToken).
 */
export class EventsAuthError extends EventsError {
    constructor(code, message, options) {
        super(code, message || `Events stream refused: ${code}`, options);
        this.name = 'EventsAuthError';
    }
}
/** `close()` was called, or the stream ended for good; pending waits reject with this. */
export class EventsClosedError extends EventsError {
    constructor(message = 'Events stream closed') {
        super('EVENTS_CLOSED', message);
        this.name = 'EventsClosedError';
    }
}
/**
 * The client's session changed (logout, login, adoptSession, setToken, or
 * the server answered for a different user). Pending waits and streams of
 * the old session end with this; cursors of one session never carry into
 * another.
 */
export class EventsSessionChangedError extends EventsError {
    constructor(message = 'The client session changed; events state of the previous session was dropped') {
        super('EVENTS_SESSION_CHANGED', message);
        this.name = 'EventsSessionChangedError';
    }
}
/** A `waitFor`, `ready` or `prepareWait` deadline passed. */
export class EventsTimeoutError extends EventsError {
    constructor(message = 'Timed out waiting for events') {
        super('EVENTS_TIMEOUT', message);
        this.name = 'EventsTimeoutError';
    }
}
/**
 * Continuity was lost and could not be restored for this consumer: raised by
 * `bootstrap()` after three restarts, and by a `stream()` whose byte bound
 * overflowed with the `'error'` policy.
 */
export class EventsGapError extends EventsError {
    reason;
    constructor(reason, message) {
        super('EVENTS_GAP', message || `Event continuity lost (${reason})`);
        this.name = 'EventsGapError';
        this.reason = reason;
    }
}
