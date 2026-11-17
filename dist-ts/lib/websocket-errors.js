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
/** A WebSocketUpgradeRefusedError from any generated client or TerminalClient. */
export function isWebSocketUpgradeRefusedError(error) {
    return error instanceof Error && error.name === 'WebSocketUpgradeRefusedError'
        && typeof error.status === 'number';
}
/** A WebSocketUpgradeFailedError from any generated client. */
export function isWebSocketUpgradeFailedError(error) {
    return error instanceof Error && error.name === 'WebSocketUpgradeFailedError'
        && typeof error.status === 'number';
}
/** A WebSocketCredentialNotSentError from any generated client. */
export function isWebSocketCredentialNotSentError(error) {
    return error instanceof Error && error.name === 'WebSocketCredentialNotSentError'
        && error.code === 'WS_CREDENTIAL_NOT_SENT';
}
