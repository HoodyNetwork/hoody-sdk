/**
 * Events API Types
 * Local type definitions for the Events WebSocket implementation.
 *
 * These types are defined locally (not code-generated) because the Events
 * WebSocket protocol is not part of the OpenAPI spec — it uses a custom
 * Socket.IO-based message format.
 */

import { io, type Socket } from 'socket.io-client';

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

/** A client-to-server message sent over the WebSocket to control subscriptions. */
export interface EventClientMessage {
    /** The subscription action to perform (e.g. "subscribe", "unsubscribe"). */
    action: string;
    /** List of event type patterns to subscribe/unsubscribe from. */
    event_types?: string[];
    /** Scope the subscription to a specific resource UUID. */
    resource_id?: string;
    /** Scope the subscription to a specific resource category. */
    resource_type?: string;
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
export function normalizeServerMessage(m: ServerWireMessage): EventServerMessage {
    const payload = (m.data ?? {}) as Record<string, any>;
    // hoody-api container broadcasts send `data: { container: { id, … } }`
    // without a top-level resource_id. Read nested `container.id` /
    // `project.id` so `onContainerEvents()` and similar resource-id filters
    // don't silently drop every container event.
    const nestedContainer = (payload.container && typeof payload.container === 'object')
        ? payload.container as Record<string, any>
        : undefined;
    const nestedProject = (payload.project && typeof payload.project === 'object')
        ? payload.project as Record<string, any>
        : undefined;
    const resourceId =
        payload.resource_id ??
        payload.resourceId ??
        payload.container_id ??
        payload.project_id ??
        nestedContainer?.id ??
        nestedProject?.id ??
        payload.id ??
        '';
    const resourceType =
        payload.resource_type ??
        payload.resourceType ??
        (payload.container ? 'container' : payload.project ? 'project' : undefined);
    return {
        event_type: m.event,
        resource_id: String(resourceId),
        ...(resourceType ? { resource_type: resourceType } : {}),
        timestamp: m.timestamp,
        ...(m.data !== undefined ? { data: m.data } : {}),
    };
}

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
export class ApiConnecteventstreamWebSocket {
    public connected: boolean = false;

    private readonly url: string;
    private readonly defaultOptions: Record<string, any>;
    private socket: Socket;

    constructor(url: string, options: Record<string, any> = {}) {
        this.url = url;
        // Normalise: we own `autoConnect` so `connect()` can return a real promise.
        this.defaultOptions = { ...options, autoConnect: false };
        this.socket = io(this.url, this.defaultOptions);
        // Keep `connected` in sync with the transport.
        this.socket.on('connect', () => { this.connected = true; });
        this.socket.on('disconnect', () => { this.connected = false; });
    }

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
    connect(options: Record<string, any> = {}): Promise<void> {
        if (this.socket.connected) {
            this.connected = true;
            return Promise.resolve();
        }
        if (options && Object.keys(options).length > 0) {
            // Merge auth / query overrides onto the managed socket's options.
            // `io.opts` is the option bag used on the next connect attempt.
            const mergedAuth = { ...(this.socket.io.opts as any)?.auth, ...options.auth };
            Object.assign(this.socket.io.opts, options);
            if (options.auth) (this.socket.io.opts as any).auth = mergedAuth;
            // The Socket instance also carries its own `.auth` mirror used by
            // engine.io to populate handshake auth; update both.
            if (options.auth) (this.socket as any).auth = mergedAuth;
        }
        return new Promise<void>((resolve, reject) => {
            const onConnect = () => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                this.connected = true;
                resolve();
            };
            const onConnectError = (err: Error) => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                reject(err instanceof Error ? err : new Error(String(err)));
            };
            this.socket.on('connect', onConnect);
            this.socket.on('connect_error', onConnectError);
            this.socket.connect();
        });
    }

    disconnect(_reason?: string): void {
        this.connected = false;
        this.socket.disconnect();
    }

    on(event: string, callback: (...args: any[]) => void): void {
        this.socket.on(event as any, callback as any);
    }

    emit(event: string, data?: any): void {
        if (data === undefined) this.socket.emit(event as any);
        else this.socket.emit(event as any, data);
    }

    off(event: string, callback?: (...args: any[]) => void): void {
        if (callback === undefined) this.socket.off(event as any);
        else this.socket.off(event as any, callback as any);
    }

    removeAllListeners(): void {
        this.socket.removeAllListeners();
    }

    // --- Lifecycle hooks: each returns a single-use unsubscribe function ---
    //
    // EventsManager.cleanupWsListeners iterates the returned unsubscribers
    // on disconnect — they MUST be real functions (not no-ops) so listeners
    // detach when the manager tears down.

    onConnect(callback: () => void): () => void {
        const handler = () => callback();
        this.socket.on('connect', handler);
        return () => this.socket.off('connect', handler);
    }

    onDisconnect(callback: (code: number, reason: string) => void): () => void {
        const handler = (reason: string) => {
            // socket.io gives a reason string; there's no protocol close code at
            // this layer. Synthesize a code so the signature matches callers.
            const code = reason === 'io server disconnect' ? 1000 : 1006;
            callback(code, reason ?? 'disconnect');
        };
        this.socket.on('disconnect', handler);
        return () => this.socket.off('disconnect', handler);
    }

    onReconnectAttempt(callback: (attempt: number) => void): () => void {
        const handler = (attempt: number) => callback(attempt);
        this.socket.io.on('reconnect_attempt', handler);
        return () => this.socket.io.off('reconnect_attempt', handler);
    }

    onReconnect(callback: (attempt: number) => void): () => void {
        const handler = (attempt: number) => callback(attempt);
        this.socket.io.on('reconnect', handler);
        return () => this.socket.io.off('reconnect', handler);
    }

    onError(callback: (error: Error) => void): () => void {
        const handler = (err: unknown) => {
            callback(err instanceof Error ? err : new Error(String(err)));
        };
        this.socket.on('connect_error', handler);
        this.socket.io.on('error', handler);
        return () => {
            this.socket.off('connect_error', handler);
            this.socket.io.off('error', handler);
        };
    }

    onEvent(callback: (event: EventServerMessage) => void): () => void {
        const handler = (raw: ServerWireMessage) => {
            try {
                callback(normalizeServerMessage(raw));
            } catch {
                // Malformed payloads are dropped rather than propagating into
                // the socket error channel — isolation is the contract.
            }
        };
        this.socket.on('message', handler);
        return () => this.socket.off('message', handler);
    }
}
