/**
 * Browser replacement for `socketio-node-transport.ts` (build.config.ts
 * redirects the import in every browser bundle). A browser's WebSocket is not
 * the SDK's to choose, so the transport list stays what engine.io-client's
 * browser build expects: names, or the caller's own classes, unchanged.
 */
/** The `transports` option for a browser: the caller's list, or websocket only. */
export declare function normalizeEventsTransports(transports: unknown): unknown[];
