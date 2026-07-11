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
export class EventsManager {
    createWsClient;
    ws = null;
    /**
     * Two-level Map: eventType -> (callback -> filter).
     * Outer key is the event type string (e.g. "container.running") or "*" for wildcard.
     * Inner Map uses the callback function reference as key so that the same callback
     * can be registered once per event type. The value is an optional EventFilter for
     * resource-scoped subscriptions.
     */
    listeners = new Map();
    lifecycleListeners = new Map();
    state = 'idle';
    autoConnect = true;
    autoReconnect = true;
    debug = false;
    /**
     * Stores the in-flight connection promise so that concurrent calls to
     * ensureConnected() coalesce on the same connection attempt rather than
     * opening parallel WebSocket connections. Cleared in the `finally` block
     * once the attempt settles (success or failure).
     */
    connectionPromise = null;
    // Handle + resolver + token for in-flight retry-backoff sleeps. If
    // disconnect() lands while connectWithRetry is sleeping, we both clear
    // the timer AND call the pending resolver so the awaited Promise
    // settles immediately. clearTimeout alone leaves `await new Promise(...)`
    // hanging forever because the timer callback (which held the resolve)
    // never fires.
    retryTimer = null;
    retryResolver = null;
    retryGeneration = 0;
    wsUnsubscribers = [];
    constructor(createWsClient, options) {
        this.createWsClient = createWsClient;
        if (options) {
            this.autoConnect = options.autoConnect ?? true;
            this.autoReconnect = options.autoReconnect ?? true;
            this.debug = options.debug ?? false;
        }
    }
    /**
     * Add event listener with auto-connect
     * Returns unsubscribe function
     */
    async addEventListener(eventType, callback, filter) {
        if (this.debug) {
            console.log(`[EventsManager] Adding listener for: ${eventType}`);
        }
        // Add to listener registry
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Map());
        }
        this.listeners.get(eventType).set(callback, filter);
        // Auto-connect if needed OR join an in-flight connection so every
        // caller observes the same success/failure outcome.
        //
        // A listener added while state==='connecting' must NOT skip
        // shouldConnect() and return immediately — if the in-flight
        // connection then fails, the listener would be orphaned in the map
        // with no way to detect or recover. Joining the shared
        // connectionPromise guarantees late-joining listeners see the same
        // rejection and clean themselves up.
        const shouldJoinInFlight = this.autoConnect
            && this.connectionPromise !== null
            && (this.state === 'connecting' || this.state === 'reconnecting');
        if (this.shouldConnect() || shouldJoinInFlight) {
            try {
                await this.ensureConnected();
            }
            catch (error) {
                // Cleanup the listener if connection fails (initial or late-join)
                this.listeners.get(eventType)?.delete(callback);
                if (this.listeners.get(eventType)?.size === 0) {
                    this.listeners.delete(eventType);
                }
                throw error;
            }
        }
        // Return unsubscribe function
        return () => this.removeEventListener(eventType, callback);
    }
    /**
     * Add lifecycle event listener
     */
    addLifecycleListener(event, callback) {
        if (!this.lifecycleListeners.has(event)) {
            this.lifecycleListeners.set(event, new Set());
        }
        this.lifecycleListeners.get(event).add(callback);
        return () => {
            this.lifecycleListeners.get(event)?.delete(callback);
        };
    }
    /**
     * Remove event listener with auto-disconnect
     */
    removeEventListener(eventType, callback) {
        if (this.debug) {
            console.log(`[EventsManager] Removing listener for: ${eventType}`);
        }
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) {
                this.listeners.delete(eventType);
            }
        }
        // Auto-disconnect if no more listeners
        if (this.shouldDisconnect()) {
            this.disconnect();
        }
    }
    /**
     * Ensure WebSocket is connected
     */
    async ensureConnected() {
        // Already connected
        if (this.state === 'connected' && this.ws?.connected) {
            return;
        }
        // Connection in progress - wait for it
        if (this.connectionPromise) {
            return this.connectionPromise;
        }
        // Start new connection with retries for initial attempt
        this.connectionPromise = this.connectWithRetry();
        try {
            await this.connectionPromise;
        }
        finally {
            this.connectionPromise = null;
        }
    }
    /**
     * Connect to WebSocket
     */
    async connect() {
        if (this.state === 'connecting' || this.state === 'connected') {
            return;
        }
        this.state = 'connecting';
        this.emitLifecycleEvent('connecting');
        if (this.debug) {
            console.log('[EventsManager] Connecting to event stream...');
        }
        try {
            this.ws = await this.createWsClient();
            this.wsUnsubscribers = [];
            // Setup lifecycle handlers (store unsubscribers for cleanup)
            this.wsUnsubscribers.push(this.ws.onConnect(() => {
                this.state = 'connected';
                this.emitLifecycleEvent('connected');
                if (this.debug) {
                    console.log('[EventsManager] Connected to event stream');
                }
            }));
            this.wsUnsubscribers.push(this.ws.onDisconnect((code, reason) => {
                if (this.debug) {
                    console.log(`[EventsManager] Disconnected: ${reason} (${code})`);
                }
                if (this.state !== 'disconnecting' && this.autoReconnect && this.listeners.size > 0) {
                    this.state = 'reconnecting';
                    this.emitLifecycleEvent('disconnected', code, reason);
                }
                else {
                    this.state = 'idle';
                    this.emitLifecycleEvent('disconnected', code, reason);
                }
            }));
            this.wsUnsubscribers.push(this.ws.onReconnectAttempt((attempt) => {
                this.emitLifecycleEvent('reconnecting', attempt);
                if (this.debug) {
                    console.log(`[EventsManager] Reconnecting (attempt ${attempt})...`);
                }
            }));
            this.wsUnsubscribers.push(this.ws.onReconnect((attempt) => {
                this.state = 'connected';
                this.emitLifecycleEvent('reconnected', attempt);
                if (this.debug) {
                    console.log(`[EventsManager] Reconnected after ${attempt} attempts`);
                }
            }));
            // The transport's `onError` hook listens to `connect_error`
            // (among others). On INITIAL handshake failure that hook fires AND
            // `await this.ws.connect()` rejects — without guarding we emit the
            // lifecycle `'error'` event twice for one root cause. Track whether
            // the transport already emitted so the catch block below suppresses
            // the redundant duplicate.
            let transportErrorEmitted = false;
            this.wsUnsubscribers.push(this.ws.onError((error) => {
                transportErrorEmitted = true;
                this.emitLifecycleEvent('error', error);
                if (this.debug) {
                    console.error('[EventsManager] Error:', error);
                }
            }));
            // Setup message router
            this.wsUnsubscribers.push(this.ws.onEvent((event) => {
                this.routeEvent(event);
            }));
            // Connect. The `onConnect` listener above flips state to
            // 'connected' and emits the lifecycle event, so we don't emit
            // 'connected' a second time here (consumers would see two).
            try {
                await this.ws.connect();
            }
            catch (error) {
                if (!transportErrorEmitted) {
                    this.emitLifecycleEvent('error', error);
                }
                throw error;
            }
            if (this.debug) {
                console.log('[EventsManager] Successfully connected');
            }
        }
        catch (error) {
            this.state = 'idle';
            this.cleanupWsListeners();
            if (this.ws) {
                // Uniform teardown: removeAllListeners first (so pending
                // events are dropped instead of delivered to already-torn-down
                // handlers), then disconnect. Both wrapped in try/catch so
                // one failure can't prevent the other.
                try {
                    this.ws.removeAllListeners();
                }
                catch { }
                try {
                    this.ws.disconnect('connect-failed');
                }
                catch { }
                this.ws = null;
            }
            if (this.debug) {
                console.error('[EventsManager] Connection failed:', error);
            }
            throw error;
        }
    }
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
    routeEvent(event) {
        if (this.debug) {
            console.log(`[EventsManager] Received event: ${event.event_type}`);
        }
        // Snapshot listener entries before iteration. A listener callback
        // may unsubscribe itself or sibling listeners; iterating the live
        // `Map` with `forEach` would then skip or double-dispatch during
        // mutation. Copying to an array fixes the iteration order vs the
        // moment of dispatch.
        const listeners = this.listeners.get(event.event_type);
        if (listeners) {
            const snapshot = [...listeners.entries()];
            for (const [callback, filter] of snapshot) {
                if (this.matchesFilter(event, filter)) {
                    try {
                        callback(event);
                    }
                    catch (error) {
                        console.error(`Error in event listener for ${event.event_type}:`, error);
                    }
                }
            }
        }
        // Route to wildcard listeners (registered with event type "*")
        const wildcardListeners = this.listeners.get('*');
        if (wildcardListeners) {
            const snapshot = [...wildcardListeners.entries()];
            for (const [callback, filter] of snapshot) {
                if (this.matchesFilter(event, filter)) {
                    try {
                        callback(event);
                    }
                    catch (error) {
                        console.error(`Error in wildcard event listener:`, error);
                    }
                }
            }
        }
    }
    /**
     * Check if event matches filter
     */
    matchesFilter(event, filter) {
        if (!filter) {
            return true;
        }
        if (filter.resourceId && event.resource_id !== filter.resourceId) {
            return false;
        }
        if (filter.resourceType && event.resource_type !== filter.resourceType) {
            return false;
        }
        return true;
    }
    /**
     * Emit lifecycle event
     */
    emitLifecycleEvent(event, ...args) {
        const listeners = this.lifecycleListeners.get(event);
        if (listeners) {
            // Snapshot before iterate: same rationale as routeEvent — a
            // lifecycle callback may unsubscribe siblings.
            const snapshot = [...listeners];
            for (const callback of snapshot) {
                try {
                    callback(...args);
                }
                catch (error) {
                    console.error(`Error in lifecycle listener for ${event}:`, error);
                }
            }
        }
    }
    /**
     * Should we connect?
     */
    shouldConnect() {
        return (this.autoConnect &&
            this.state === 'idle' &&
            this.listeners.size > 0);
    }
    /**
     * Should we disconnect?
     */
    shouldDisconnect() {
        return this.listeners.size === 0;
    }
    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        if (this.debug) {
            console.log('[EventsManager] Disconnecting...');
        }
        this.state = 'disconnecting';
        // Cancel any in-flight retry sleep AND resolve the awaited Promise
        // so connectWithRetry wakes immediately with state flipped to
        // 'idle'/'disconnecting', then short-circuits at the post-sleep
        // guard instead of creating a zombie connection.
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (this.retryResolver) {
            const resolver = this.retryResolver;
            this.retryResolver = null;
            resolver();
        }
        this.retryGeneration++;
        if (this.ws) {
            // Wrap BOTH removeAllListeners AND disconnect. Without
            // wrapping ws.disconnect(), a transport-level throw during
            // explicit disconnect would propagate to the caller.
            try {
                this.ws.removeAllListeners();
            }
            catch { }
            try {
                this.ws.disconnect('client disconnect');
            }
            catch { }
            this.ws = null;
        }
        this.cleanupWsListeners();
        this.state = 'idle';
        this.emitLifecycleEvent('disconnected', 0, 'client disconnect');
    }
    /**
     * Configure manager
     */
    configure(options) {
        if (options.autoConnect !== undefined) {
            this.autoConnect = options.autoConnect;
        }
        if (options.autoReconnect !== undefined) {
            this.autoReconnect = options.autoReconnect;
        }
        if (options.debug !== undefined) {
            this.debug = options.debug;
        }
    }
    /**
     * Get connection state
     */
    getState() {
        return this.state;
    }
    /**
     * Get number of active listeners
     */
    getListenerCount() {
        let count = 0;
        this.listeners.forEach(listeners => {
            count += listeners.size;
        });
        return count;
    }
    /**
     * Is currently connected?
     */
    isConnected() {
        return this.state === 'connected' && this.ws?.connected === true;
    }
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
    async connectWithRetry() {
        const maxAttempts = 3;
        let attempt = 0;
        let delay = 1000;
        const myGeneration = ++this.retryGeneration;
        while (true) {
            try {
                await this.connect();
                // Post-connect check: if disconnect() landed while
                // ws.connect() was in flight, our awaited connect succeeded
                // AFTER the user tore everything down. Bail out and hand the
                // socket back to disconnect()'s cleanup so we don't stall a
                // zombie connection.
                if (myGeneration !== this.retryGeneration) {
                    if (this.ws) {
                        try {
                            this.ws.removeAllListeners();
                        }
                        catch { }
                        try {
                            this.ws.disconnect('client disconnect');
                        }
                        catch { }
                        this.ws = null;
                    }
                    this.cleanupWsListeners();
                    this.state = 'idle';
                    return;
                }
                return;
            }
            catch (error) {
                attempt += 1;
                // Re-check retry-eligibility AND that disconnect() hasn't
                // been called since we entered the retry loop.
                //
                // Generation is the canonical "has disconnect() fired?"
                // signal — disconnect() is the only site that bumps
                // retryGeneration. We do NOT also gate on `state !== 'idle'`:
                // connect() sets state='idle' on failure, so mixing the
                // state check in would collapse legitimate retries into a
                // single attempt.
                const shouldRetry = this.autoReconnect &&
                    this.listeners.size > 0 &&
                    attempt < maxAttempts &&
                    myGeneration === this.retryGeneration &&
                    this.state !== 'disconnecting';
                if (!shouldRetry) {
                    throw error;
                }
                if (this.debug) {
                    console.log(`[EventsManager] Initial connect failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
                }
                await new Promise(res => {
                    // Store the resolver so disconnect() can wake us
                    // immediately instead of relying on the timer callback
                    // (which clearTimeout will prevent from ever running).
                    this.retryResolver = res;
                    this.retryTimer = setTimeout(() => {
                        this.retryTimer = null;
                        this.retryResolver = null;
                        res();
                    }, delay);
                });
                // Re-check after sleep — disconnect() may have fired. Again
                // only the generation check is the disconnect() signal; the
                // state alone could be 'idle' for a transient failure that
                // still deserves a retry.
                if (myGeneration !== this.retryGeneration ||
                    this.state === 'disconnecting' ||
                    this.listeners.size === 0) {
                    throw error;
                }
                delay = Math.min(Math.floor(delay * 1.5), 5000);
            }
        }
    }
    /**
     * Cleanup lifecycle/event listeners on the current WebSocket
     */
    cleanupWsListeners() {
        this.wsUnsubscribers.forEach(unsub => {
            try {
                unsub();
            }
            catch { }
        });
        this.wsUnsubscribers = [];
    }
}
