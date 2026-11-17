/**
 * The errors a WebSocket client reports when the server answers the upgrade
 * with an HTTP status instead of 101. This file is their one public home: the
 * package roots export it, the generated WebSocket clients take their types
 * from it, and TerminalClient re-exports it.
 *
 * The generated clients build these errors themselves (they have no runtime
 * imports), so the guards check `name` and a numeric `status` instead of a
 * class: an error built in any generated file passes.
 *
 * Which one arrives depends on the status alone. A refusal for good (4xx except
 * 408, 425 and 429) is a WebSocketUpgradeRefusedError and ends automatic
 * reconnect; any other status is a WebSocketUpgradeFailedError and the usual
 * reconnect rules apply. A first connect() that never opened is rejected either
 * way and starts no automatic retries.
 *
 * Only the `ws` transport (the client's choice on Node, or socketTransport
 * "ws") shows the status and body of a refused upgrade. A browser WebSocket and
 * Node's or Bun's built-in one hide both; there a refusal is learned only by
 * the refusal probe (`via: "probe"`, see refusalProbeAfter), and any other
 * status looks like a dropped connection.
 */
/**
 * The server refused the WebSocket upgrade for good: automatic reconnect has
 * stopped. `status` is the HTTP status; `code` the server's error code when
 * its answer named one, else "HTTP_<status>"; `via` says how it was learned:
 * "upgrade" (the transport showed the status) or "probe" (a plain GET after
 * repeated failures). `message` is always "WebSocket upgrade refused: HTTP
 * <status>".
 *
 * When the `ws` transport read the server's complete JSON error body,
 * `serverMessage` is its message, `details` its details object, and
 * `retryAfterSecs` its `details.retry_after_secs` (else a whole-second
 * Retry-After header).
 */
export interface WebSocketUpgradeRefusedError extends Error {
    name: 'WebSocketUpgradeRefusedError';
    status: number;
    code: string;
    via: 'upgrade' | 'probe';
    serverMessage?: string;
    details?: Record<string, unknown>;
    retryAfterSecs?: number;
}
/**
 * The server answered the upgrade with a status that is not a refusal for good
 * (1xx, 2xx, 3xx, 5xx, 408, 425 or 429; a redirect is not followed). `message`
 * is the server's message when its complete JSON error body named one, else
 * "WebSocket connection error"; `serverMessage` holds the same server message
 * (absent without one). `code`, `details` and `retryAfterSecs` come from that
 * body as for WebSocketUpgradeRefusedError, `code` only when the body named one.
 */
export interface WebSocketUpgradeFailedError extends Error {
    name: 'WebSocketUpgradeFailedError';
    status: number;
    code?: string;
    message: string;
    serverMessage?: string;
    details?: Record<string, unknown>;
    retryAfterSecs?: number;
    via: 'upgrade';
}
/** A WebSocketUpgradeRefusedError from any generated client or TerminalClient. */
export declare function isWebSocketUpgradeRefusedError(error: unknown): error is WebSocketUpgradeRefusedError;
/** A WebSocketUpgradeFailedError from any generated client. */
export declare function isWebSocketUpgradeFailedError(error: unknown): error is WebSocketUpgradeFailedError;
/**
 * A credential the caller passed for one socket cannot be sent. A browser
 * WebSocket cannot set request headers, so an Authorization, Cookie,
 * Proxy-Authorization, X-Hoody-Token or X-Hoody-Computer-Claim header given
 * for that socket (per-call kitAuth, or a header on the call) would be dropped
 * and the socket would open looking unauthenticated. connect() rejects with
 * this error instead and no reconnect follows.
 *
 * Only a credential given for the socket itself is refused. A client-level
 * kitAuth keeps the old behaviour: the dropped header names are reported once
 * with a console warning and the socket opens. A header whose name an operator
 * chose (kitAuth `header`) is not recognised here; it is dropped with the warning.
 *
 * `headers` lists the header names that were not sent; `code` is
 * "WS_CREDENTIAL_NOT_SENT".
 */
export interface WebSocketCredentialNotSentError extends Error {
    name: 'WebSocketCredentialNotSentError';
    code: 'WS_CREDENTIAL_NOT_SENT';
    headers: string[];
}
/** A WebSocketCredentialNotSentError from any generated client. */
export declare function isWebSocketCredentialNotSentError(error: unknown): error is WebSocketCredentialNotSentError;
