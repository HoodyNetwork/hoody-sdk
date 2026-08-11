/**
 * Events API Types
 * Local type definitions for the Events WebSocket implementation.
 *
 * These types are defined locally (not code-generated) because the Events
 * WebSocket protocol is not part of the OpenAPI spec — it uses a custom
 * Socket.IO-based message format.
 */
/** A server-to-client event message received over the WebSocket. */
export interface EventServerMessage {
    /** Dot-separated event identifier, e.g. "container.running" or "auth.token.created". */
    event_type: string;
    /** UUID of the resource that triggered the event (container ID, project ID, etc.). */
    resource_id: string;
    /** Top-level resource category (e.g. "container", "project"). Optional for some event types. */
    resource_type?: string;
    /** ISO 8601 timestamp of when the event was emitted on the server. */
    timestamp: string;
    /** Event-specific payload; shape varies per event_type. */
    data?: any;
}
/**
 * Payload for the client-to-server `subscribe` and `unsubscribe` frames.
 *
 * The action is the Socket.IO event name, not a field: send this object as
 * `socket.emit('subscribe', payload)` or `socket.emit('unsubscribe', payload)`.
 *
 * Subscribing joins a delivery room. It does not select event types, and there is no way to do
 * so: the server broadcasts every event type to the rooms a connection holds — its own user room,
 * its realm rooms, and any project or container room joined here — so filtering by `event_type`
 * belongs on the client, which is what {@link EventsClient}'s per-type handlers do.
 *
 * This interface previously declared `action`, `event_types`, `resource_id` and `resource_type`.
 * The server reads none of those names, and nothing in this SDK ever sent one, so anybody who
 * hand-rolled a subscribe from the exported type got silence with no error. Omitting both fields
 * below is valid and joins no additional room.
 */
export interface EventClientMessage {
    /** 24-hex project id. Joins that project's delivery room. */
    projectId?: string;
    /** 24-hex container id. Joins that container's delivery room. */
    containerId?: string;
}
/**
 * Server wire-format for `message` events. Hoody API broadcasts these via
 * `io.to([...rooms]).emit('message', message)` with this shape (see
 * the Hoody API event broadcaster).
 *
 * The SDK normalises this to {@link EventServerMessage} before handing to
 * consumer callbacks, so callers continue to see `event_type` etc.
 */
interface ServerWireMessage {
    type: 'event';
    event: string;
    data?: any;
    timestamp: string;
    eventId: string;
}
/**
 * Normalise the server's wire-format into the consumer-facing shape.
 *
 * Exported so tests can exercise the mapping without instantiating a real
 * socket.io transport; also used internally by `ApiConnecteventstreamWebSocket`.
 */
export declare function normalizeServerMessage(m: ServerWireMessage): EventServerMessage;
/**
 * Socket.IO-backed WebSocket client for the Hoody Events stream.
 *
 * Wraps `socket.io-client` with the Hoody-specific surface that
 * {@link EventsManager} and {@link EventsClient} consume:
 *   - `connect()` resolves on the first `connect` event (or rejects on error)
 *   - `onEvent(cb)` normalises the server's `message` payload into
 *     {@link EventServerMessage} before invoking `cb`
 *   - `on*` lifecycle hooks return real unsubscribe functions
 *   - `disconnect()` tears down the transport
 *
 * Construction is cheap: the underlying socket is created with
 * `autoConnect: false` so consumers control when the network op starts. Call
 * `connect()` to open the transport.
 */
export declare class ApiConnecteventstreamWebSocket {
    connected: boolean;
    private readonly url;
    private readonly defaultOptions;
    private socket;
    constructor(url: string, options?: Record<string, any>);
    /**
     * Open the transport. Resolves on first `connect`, rejects on first
     * `connect_error` (the initial handshake failure).
     *
     * If called while already connected, resolves immediately.
     *
     * Per-call options (e.g. a freshly-refreshed `auth.token`) are merged onto
     * the constructor options for this connect attempt. This is how token
     * rotation before reconnect is supposed to flow through to the handshake.
     */
    connect(options?: Record<string, any>): Promise<void>;
    disconnect(_reason?: string): void;
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, data?: any): void;
    off(event: string, callback?: (...args: any[]) => void): void;
    removeAllListeners(): void;
    onConnect(callback: () => void): () => void;
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    onReconnectAttempt(callback: (attempt: number) => void): () => void;
    onReconnect(callback: (attempt: number) => void): () => void;
    onError(callback: (error: Error) => void): () => void;
    onEvent(callback: (event: EventServerMessage) => void): () => void;
}
export {};
