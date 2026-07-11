/**
 * Auto-managed WebSocket events manager
 * Handles connection lifecycle transparently for users.
 *
 * Connection state machine:
 *
 *     +---------+    addEventListener()    +------------+    ws.connect()    +-----------+
 *     |  idle   | -----------------------> | connecting | ----------------> | connected |
 *     +---------+                          +------------+                   +-----------+
 *        ^   ^                                  |                             |       |
 *        |   |           connect() fails        |        ws disconnects       |       |
 *        |   +----------------------------------+        (unexpected)         |       |
 *        |                                               +---------------+   |       |
 *        |                                               | reconnecting  | <-+       |
 *        |                                               +---------------+           |
 *        |                                                     |   ws reconnects     |
 *        |                                                     +-------------------->+
 *        |          disconnect() called                                              |
 *        |   +---------------+                                                       |
 *        +-- | disconnecting | <-----------------------------------------------------+
 *            +---------------+
 *
 * Key Features:
 * - Lazy connection (connects when first listener added)
 * - Auto-disconnect (disconnects when last listener removed)
 * - Transparent reconnection with exponential backoff
 * - Event routing to type-specific and wildcard listeners
 * - Per-listener error isolation (one failing callback cannot break others)
 * - Memory leak prevention via unsubscribe functions
 */
import type { ApiConnecteventstreamWebSocket } from './events-types.js';
import type { EventServerMessage } from './events-types.js';
type EventCallback = (event: EventServerMessage) => void;
type LifecycleCallback = (...args: any[]) => void;
interface EventFilter {
    resourceId?: string;
    resourceType?: string;
}
export declare class EventsManager {
    private createWsClient;
    private ws;
    /**
     * Two-level Map: eventType -> (callback -> filter).
     * Outer key is the event type string (e.g. "container.running") or "*" for wildcard.
     * Inner Map uses the callback function reference as key so that the same callback
     * can be registered once per event type. The value is an optional EventFilter for
     * resource-scoped subscriptions.
     */
    private listeners;
    private lifecycleListeners;
    private state;
    private autoConnect;
    private autoReconnect;
    private debug;
    /**
     * Stores the in-flight connection promise so that concurrent calls to
     * ensureConnected() coalesce on the same connection attempt rather than
     * opening parallel WebSocket connections. Cleared in the `finally` block
     * once the attempt settles (success or failure).
     */
    private connectionPromise;
    private retryTimer;
    private retryResolver;
    private retryGeneration;
    private wsUnsubscribers;
    constructor(createWsClient: () => Promise<ApiConnecteventstreamWebSocket>, options?: {
        autoConnect?: boolean;
        autoReconnect?: boolean;
        debug?: boolean;
    });
    /**
     * Add event listener with auto-connect
     * Returns unsubscribe function
     */
    addEventListener(eventType: string, callback: EventCallback, filter?: EventFilter): Promise<() => void>;
    /**
     * Add lifecycle event listener
     */
    addLifecycleListener(event: string, callback: LifecycleCallback): () => void;
    /**
     * Remove event listener with auto-disconnect
     */
    private removeEventListener;
    /**
     * Ensure WebSocket is connected
     */
    private ensureConnected;
    /**
     * Connect to WebSocket
     */
    private connect;
    /**
     * Route an incoming server event to all matching listeners.
     *
     * Dispatch order:
     *  1. Listeners registered for the exact event_type (e.g. "container.running")
     *  2. Wildcard listeners registered under the "*" key
     *
     * Each listener is invoked inside its own try/catch so that a throwing
     * callback does not prevent other listeners from receiving the event
     * (per-listener error isolation).
     *
     * Filter matching (resourceId, resourceType) is applied before dispatch
     * so resource-scoped listeners only fire for their target resource.
     */
    private routeEvent;
    /**
     * Check if event matches filter
     */
    private matchesFilter;
    /**
     * Emit lifecycle event
     */
    private emitLifecycleEvent;
    /**
     * Should we connect?
     */
    private shouldConnect;
    /**
     * Should we disconnect?
     */
    private shouldDisconnect;
    /**
     * Disconnect from WebSocket
     */
    disconnect(): void;
    /**
     * Configure manager
     */
    configure(options: {
        autoConnect?: boolean;
        autoReconnect?: boolean;
        debug?: boolean;
    }): void;
    /**
     * Get connection state
     */
    getState(): string;
    /**
     * Get number of active listeners
     */
    getListenerCount(): number;
    /**
     * Is currently connected?
     */
    isConnected(): boolean;
    /**
     * Retry initial connection attempts with exponential backoff.
     *
     * Retry parameters:
     *  - maxAttempts: 3
     *  - base delay: 1000 ms
     *  - backoff multiplier: 1.5x per attempt
     *  - delay cap: 5000 ms
     *
     * Retries are gated on autoReconnect being enabled and at least one
     * listener still being registered (otherwise the connection is no longer
     * needed and the error propagates to the caller).
     */
    private connectWithRetry;
    /**
     * Cleanup lifecycle/event listeners on the current WebSocket
     */
    private cleanupWsListeners;
}
export {};
