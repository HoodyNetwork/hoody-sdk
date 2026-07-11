/**
 * Events API Types
 * Local type definitions for the Events WebSocket implementation.
 *
 * These types are defined locally (not code-generated) because the Events
 * WebSocket protocol is not part of the OpenAPI spec — it uses a custom
 * Socket.IO-based message format.
 */
import { io } from 'socket.io-client';
/**
 * Normalise the server's wire-format into the consumer-facing shape.
 *
 * Exported so tests can exercise the mapping without instantiating a real
 * socket.io transport; also used internally by `ApiConnecteventstreamWebSocket`.
 */
export function normalizeServerMessage(m) {
    const payload = (m.data ?? {});
    // hoody-api container broadcasts send `data: { container: { id, … } }`
    // without a top-level resource_id. Read nested `container.id` /
    // `project.id` so `onContainerEvents()` and similar resource-id filters
    // don't silently drop every container event.
    const nestedContainer = (payload.container && typeof payload.container === 'object')
        ? payload.container
        : undefined;
    const nestedProject = (payload.project && typeof payload.project === 'object')
        ? payload.project
        : undefined;
    const resourceId = payload.resource_id ??
        payload.resourceId ??
        payload.container_id ??
        payload.project_id ??
        nestedContainer?.id ??
        nestedProject?.id ??
        payload.id ??
        '';
    const resourceType = payload.resource_type ??
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
    connected = false;
    url;
    defaultOptions;
    socket;
    constructor(url, options = {}) {
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
    connect(options = {}) {
        if (this.socket.connected) {
            this.connected = true;
            return Promise.resolve();
        }
        if (options && Object.keys(options).length > 0) {
            // Merge auth / query overrides onto the managed socket's options.
            // `io.opts` is the option bag used on the next connect attempt.
            const mergedAuth = { ...this.socket.io.opts?.auth, ...options.auth };
            Object.assign(this.socket.io.opts, options);
            if (options.auth)
                this.socket.io.opts.auth = mergedAuth;
            // The Socket instance also carries its own `.auth` mirror used by
            // engine.io to populate handshake auth; update both.
            if (options.auth)
                this.socket.auth = mergedAuth;
        }
        return new Promise((resolve, reject) => {
            const onConnect = () => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                this.connected = true;
                resolve();
            };
            const onConnectError = (err) => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                reject(err instanceof Error ? err : new Error(String(err)));
            };
            this.socket.on('connect', onConnect);
            this.socket.on('connect_error', onConnectError);
            this.socket.connect();
        });
    }
    disconnect(_reason) {
        this.connected = false;
        this.socket.disconnect();
    }
    on(event, callback) {
        this.socket.on(event, callback);
    }
    emit(event, data) {
        if (data === undefined)
            this.socket.emit(event);
        else
            this.socket.emit(event, data);
    }
    off(event, callback) {
        if (callback === undefined)
            this.socket.off(event);
        else
            this.socket.off(event, callback);
    }
    removeAllListeners() {
        this.socket.removeAllListeners();
    }
    // --- Lifecycle hooks: each returns a single-use unsubscribe function ---
    //
    // EventsManager.cleanupWsListeners iterates the returned unsubscribers
    // on disconnect — they MUST be real functions (not no-ops) so listeners
    // detach when the manager tears down.
    onConnect(callback) {
        const handler = () => callback();
        this.socket.on('connect', handler);
        return () => this.socket.off('connect', handler);
    }
    onDisconnect(callback) {
        const handler = (reason) => {
            // socket.io gives a reason string; there's no protocol close code at
            // this layer. Synthesize a code so the signature matches callers.
            const code = reason === 'io server disconnect' ? 1000 : 1006;
            callback(code, reason ?? 'disconnect');
        };
        this.socket.on('disconnect', handler);
        return () => this.socket.off('disconnect', handler);
    }
    onReconnectAttempt(callback) {
        const handler = (attempt) => callback(attempt);
        this.socket.io.on('reconnect_attempt', handler);
        return () => this.socket.io.off('reconnect_attempt', handler);
    }
    onReconnect(callback) {
        const handler = (attempt) => callback(attempt);
        this.socket.io.on('reconnect', handler);
        return () => this.socket.io.off('reconnect', handler);
    }
    onError(callback) {
        const handler = (err) => {
            callback(err instanceof Error ? err : new Error(String(err)));
        };
        this.socket.on('connect_error', handler);
        this.socket.io.on('error', handler);
        return () => {
            this.socket.off('connect_error', handler);
            this.socket.io.off('error', handler);
        };
    }
    onEvent(callback) {
        const handler = (raw) => {
            try {
                callback(normalizeServerMessage(raw));
            }
            catch {
                // Malformed payloads are dropped rather than propagating into
                // the socket error channel — isolation is the contract.
            }
        };
        this.socket.on('message', handler);
        return () => this.socket.off('message', handler);
    }
}
