/**
 * Events stream error taxonomy: the code-to-action map and the error classes the
 * events runtime raises.
 *
 * The API refuses or ends an events socket with a code, sent on the
 * `message` channel as `{type:'error', error}` or `{type:'revoked', reason}`
 * (and, for one release, also on the socket `error` event). History reads
 * (`GET /api/v1/events`) fail with an HTTP status and an `error` code. The
 * SDK reacts to each code in exactly one way, and this file is the only
 * place that decides which. The table mirrors the server's error contract; a contract test
 * on the server checks every code its socket files emit against it, and
 * a unit test pins it here.
 */
/** What the runtime does when the server sends a code on the socket. */
export type EventsSocketAction = 
/** Refresh the access token through the HTTP client, then reconnect. */
'refresh'
/** Reconnect once; a second refusal of this kind before a `welcome` is terminal. */
 | 'readmit'
/** Stop: the credential or the scope can no longer use the stream. */
 | 'terminal'
/** Reconnect later, on the backoff schedule with a raised floor. */
 | 'backoff'
/** Report it and keep the connection. */
 | 'nonfatal';
/** Action "refresh + reconnect". */
export declare const EVENTS_REFRESH_CODES: readonly ["JWT_EXPIRED", "AUTH_TOKEN_EXPIRED"];
/** Action "re-admit once" (an unknown code is treated the same way). */
export declare const EVENTS_READMIT_CODES: readonly ["TOKEN_AUTH_CHANGED", "AUTH_FAILED"];
/** Action "terminal". */
export declare const EVENTS_TERMINAL_CODES: readonly ["TOKEN_DELETED", "AUTH_TOKEN_DELETED", "TOKEN_DISABLED", "AUTH_TOKEN_DISABLED", "EVENT_ACCESS_REVOKED", "EVENT_ACCESS_DENIED", "JWT_REVOKED", "AUTH_TOKEN_LINEAGE_REVOKED", "USER_BANNED", "USER_NOT_FOUND", "IP_NOT_ALLOWED", "IP_RESTRICTED", "REALM_SELECTION_CONFLICT", "REALM_FORBIDDEN", "REALM_REQUIRED", "REALM_CONFIG_MALFORMED", "INVALID_TOKEN", "MISSING_TOKEN", "JWT_REQUIRED"];
/** Action "backoff". */
export declare const EVENTS_BACKOFF_CODES: readonly ["CONNECTION_LIMIT_EXCEEDED"];
/** Action "non-fatal": the socket stays up. */
export declare const EVENTS_NONFATAL_CODES: readonly ["INVALID_SUBSCRIPTION", "SUBSCRIPTION_NOT_ALLOWED", "SUBSCRIPTION_LIMIT_EXCEEDED", "INVALID_PROJECT_ID", "INVALID_COMPUTER_ID", "CONNECTION_NOT_FOUND", "UPGRADE_REQUIRED"];
/**
 * The pre-rename spelling of INVALID_COMPUTER_ID, accepted beside it. A server still on the old
 * names answers with it during deploy skew; the socket stays up exactly as for the new code. It is
 * not part of the vendored catalog's code_map, so it lives apart from EVENTS_NONFATAL_CODES.
 */
export declare const EVENTS_NONFATAL_LEGACY_CODES: readonly ["INVALID_CONTAINER_ID"];
/** History error codes. */
export declare const EVENTS_CURSOR_INVALID = "EVENTS_CURSOR_INVALID";
export declare const EVENTS_QUERY_CONFLICT = "EVENTS_QUERY_CONFLICT";
export declare const EVENTS_CURSOR_EXPIRED = "EVENTS_CURSOR_EXPIRED";
export declare const EVENTS_HISTORY_RESET = "EVENTS_HISTORY_RESET";
/**
 * The action for a socket code. An unknown code (a server newer than this
 * SDK, or the legacy `UNAUTHORIZED` fallback) re-admits once: the map puts
 * "unknown" in that row, so a code the SDK has never seen neither kills a
 * watcher outright nor loops forever.
 */
export declare function socketActionFor(code: string | undefined | null): EventsSocketAction;
/** Why history continuity was lost (the `gap` notice). */
export type EventsGapReason = 'cursor_invalid' | 'cursor_expired' | 'history_reset' | 'overflow';
/** What the runtime does with a failed history read. */
export type EventsHistoryAction = {
    kind: 'gap';
    reason: EventsGapReason;
}
/** 401 after the HTTP client's own refresh already failed, or 403. */
 | {
    kind: 'terminal';
    code: string;
}
/** 429: retry the read later with a raised floor. */
 | {
    kind: 'backoff';
}
/** EVENTS_QUERY_CONFLICT: the SDK built a bad query. Never retried. */
 | {
    kind: 'programming';
    code: string;
}
/** Network failure, 5xx, anything else: retry the read later. */
 | {
    kind: 'retry';
};
/**
 * The action for a failed history read ("HTTP history codes"). `status`
 * and `code` come from the generated ApiError, whose `code` is the body's
 * `error` field when it is code-shaped.
 */
export declare function historyActionFor(status: number | undefined, code: string | undefined): EventsHistoryAction;
/** Base class of every error the events runtime raises. */
export declare class EventsError extends Error {
    /** The server code, or an SDK code (`EVENTS_CLOSED`, `EVENTS_TIMEOUT`, …). */
    readonly code: string;
    /** `code` is the server or SDK code; `options.cause`, when given, is kept as the error's `cause`. */
    constructor(code: string, message: string, options?: {
        cause?: unknown;
    });
}
/**
 * The server refused or revoked the stream with a terminal code, or the token
 * could not be refreshed. The stream stays closed until the session changes
 * (login, adoptSession, setToken).
 */
export declare class EventsAuthError extends EventsError {
    /** `code` is the terminal code; without `message` the text is `Events stream refused: <code>`. */
    constructor(code: string, message?: string, options?: {
        cause?: unknown;
    });
}
/** `close()` was called, or the stream ended for good; pending waits reject with this. */
export declare class EventsClosedError extends EventsError {
    /** The code is always `EVENTS_CLOSED`. */
    constructor(message?: string);
}
/**
 * The client's session changed (logout, login, adoptSession, setToken, or
 * the server answered for a different user). Pending waits and streams of
 * the old session end with this; cursors of one session never carry into
 * another.
 */
export declare class EventsSessionChangedError extends EventsError {
    /** The code is always `EVENTS_SESSION_CHANGED`. */
    constructor(message?: string);
}
/** A `waitFor`, `ready` or `prepareWait` deadline passed. */
export declare class EventsTimeoutError extends EventsError {
    /** The code is always `EVENTS_TIMEOUT`. */
    constructor(message?: string);
}
/**
 * Continuity was lost and could not be restored for this consumer: raised by
 * `bootstrap()` after three restarts, and by a `stream()` whose byte bound
 * overflowed with the `'error'` policy.
 */
export declare class EventsGapError extends EventsError {
    /** Why continuity was lost. */
    readonly reason: EventsGapReason;
    /** `reason` says why continuity was lost; the code is always `EVENTS_GAP`. */
    constructor(reason: EventsGapReason, message?: string);
}
