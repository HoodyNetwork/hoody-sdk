/**
 * Auto-Managed Events Client
 * High-level wrapper for Hoody Events API
 *
 * Provides automatic connection management - users just add listeners!
 *
 * `on()` takes any event type of the catalog (`lib/events-catalog.json`) or a pattern over them;
 * the typed `on<Event>()` methods cover the common ones.
 *
 * Three subscription styles are supported:
 *
 *  1. Resource-specific listeners (onComputerEvents, onProjectEvents):
 *     Register with eventType "*" (wildcard) plus an EventFilter containing
 *     the target resourceId/resourceType. The EventsManager routes every
 *     incoming event through the wildcard bucket, and the filter narrows
 *     delivery to events matching that resource.
 *
 *  2. Connection listeners (onConnection):
 *     Observe the transport events of the WebSocket itself (connected,
 *     disconnected, reconnecting, reconnected, error). These are distinct from
 *     data events and are delivered via EventsManager.addConnectionListener,
 *     not through the data-event routing path. The lifecycle state (idle,
 *     connecting, live, recovering, offline, closed) is getLifecycleState()
 *     and onState().
 *
 *  3. Raw / typed event listeners (onComputerRunning, onAnyEvent, etc.):
 *     Each registers a listener on the exact event_type string (e.g.
 *     "computer.running") or on "*" for all data events.
 */
import { ApiError } from '../generated/errors.js';
import { EventsManager, listenByType, } from './events-manager.js';
import { EventsSocketTransport } from './events-types.js';
import { EventsError } from './events-errors.js';
import { retireAccessors, retireMethods } from './retired-accessor.js';
import { isEventPattern } from './events-catalog.js';
function toFilter(filter) {
    if (!filter)
        return undefined;
    if (typeof filter === 'function')
        return { where: filter };
    return filter;
}
function toPatterns(pattern) {
    const list = typeof pattern === 'string' ? [pattern] : [...pattern];
    if (list.length === 0)
        throw new TypeError('At least one event type or pattern is required');
    for (const p of list) {
        // A typo must not become a handler that silently never fires.
        if (typeof p !== 'string' || !isEventPattern(p))
            throw new TypeError(`Unknown event type or pattern "${String(p)}"`);
    }
    return list;
}
/** Parse a cursor-mode (or bootstrap) success body; anything else is not a cursor-capable server. */
function parseHistoryPage(body) {
    const data = body?.data;
    const pagination = data?.pagination;
    if (!data || !Array.isArray(data.events) || !pagination
        || typeof pagination.next_cursor !== 'string' || typeof pagination.latest_cursor !== 'string'
        || typeof pagination.has_more !== 'boolean') {
        throw new EventsError('EVENTS_HISTORY_MALFORMED', 'The events history response carries no cursors');
    }
    return {
        events: data.events,
        has_more: pagination.has_more,
        next_cursor: pagination.next_cursor,
        latest_cursor: pagination.latest_cursor,
    };
}
/**
 * The live event stream of an account, or of one realm on a realm-scoped
 * client. Reach it as `client.events`. It connects when the first handler,
 * stream or wait is registered and closes the socket when the last one is
 * gone; after a disconnect it reconnects and recovers the events it missed
 * from history.
 *
 * Use `on()` or the typed `on<Event>()` methods for handlers, `stream()` for
 * an async iterator that can resume from a saved point, `waitFor()` to await
 * one event around an action, and `bootstrap()` to load a starting state that
 * stays consistent with the stream. `onState()` and `onConnection()` report
 * the stream's own state. Past events are read with the REST history
 * (`client.api.events`), not here.
 */
export class EventsClient {
    manager;
    baseURL;
    /** Realm the stream is scoped to (from the service), sent as `realm_id` on the handshake. */
    realmId;
    getToken;
    /**
     * @param eventsService - Generated EventsService instance; used as a fallback
     *   token source if `getToken` is not provided.
     * @param baseURL - HTTP(S) base URL; the constructor replaces http(s):// with
     *   ws(s):// when constructing the WebSocket URL.
     * @param getToken - Optional token resolver. If omitted, falls back to reading
     *   `eventsService.http.config.token` (the internal generated-client token path).
     *   This fallback chain allows the events client to reuse the same auth token
     *   as the REST client without requiring the caller to wire it explicitly.
     */
    constructor(eventsService, baseURL, getToken, options = {}) {
        // The stream must be scoped exactly like the service's REST calls.
        // A service from `client.withRealm(id).api.events` carries its realm
        // as `defaultRealmId` and applies it per request as a host label, while
        // its HTTP client holds the account base URL. Reading only that base
        // URL subscribed account-wide (the API joins the user room when the
        // handshake names no realm) and mixed every realm's events into a
        // realm-scoped view. So: the realm host, resolved by the service's own
        // realm routing, plus `?realm_id=` (the server's documented base-domain
        // form; it must agree with the host, which it does by construction).
        // An explicit `baseURL` argument still wins, and then no realm is added.
        const service = eventsService;
        const serviceBaseURL = service?.http?.getBaseURL?.() || service?.http?.config?.baseURL;
        const realmId = typeof service?.defaultRealmId === 'string' && service.defaultRealmId.length > 0
            ? service.defaultRealmId
            : undefined;
        let realmBaseURL;
        if (!baseURL && realmId && typeof service?.buildRealmUrl === 'function') {
            const resolved = service.buildRealmUrl('', realmId);
            if (/^https?:\/\//i.test(resolved))
                realmBaseURL = resolved;
        }
        this.realmId = baseURL ? undefined : realmId;
        this.baseURL = baseURL
            || realmBaseURL
            || serviceBaseURL
            || 'https://api.hoody.com';
        // Default token resolver reads from the underlying service HTTP client if not provided
        this.getToken = getToken ?? (() => {
            try {
                return eventsService?.http?.config?.token ?? null;
            }
            catch {
                return null;
            }
        });
        const http = service?.http;
        // History goes through the service's own HTTP layer and realm routing,
        // so it is scoped and authenticated exactly like the socket and like
        // REST (raw query because the generated list() predates `after`).
        const historyUrl = () => {
            if (typeof service?.buildRealmUrl === 'function') {
                return service.buildRealmUrl.call(service, '/api/v1/events');
            }
            return '/api/v1/events';
        };
        const historyGet = async (query, signal) => {
            if (!http || typeof http.get !== 'function') {
                throw new EventsError('EVENTS_HISTORY_UNAVAILABLE', 'The events service has no HTTP client for history reads');
            }
            return http.get(historyUrl(), { query, signal, cache: false });
        };
        const history = {
            page: async (after, limit, signal) => parseHistoryPage(await historyGet({ after, limit }, signal)),
            bootstrap: async (signal) => {
                const page = parseHistoryPage(await historyGet({ bootstrap: 'true' }, signal));
                return { next_cursor: page.next_cursor, latest_cursor: page.latest_cursor };
            },
        };
        // The "refresh + reconnect" action rides the HTTP client's own single-flight
        // 401 refresh (and, under HoodyClient, its session recovery), with the
        // same acceptance check the transport applies before installing a token.
        const refreshToken = options.refreshToken ?? (async () => {
            if (!http || typeof http.tryRefreshToken !== 'function')
                return undefined;
            const expired = new ApiError({ message: 'Events stream token expired', status: 401, code: 'JWT_EXPIRED' });
            const token = await http.tryRefreshToken.call(http, expired);
            if (!token)
                return undefined;
            const accept = http.config?.acceptRefreshedToken;
            if (typeof accept === 'function' && !accept(token))
                return undefined;
            http.setToken?.call(http, token);
            return token;
        });
        this.manager = new EventsManager(async () => {
            // Construct WebSocket URL (base URL only, path is in options)
            const wsUrl = this.baseURL.replace(/^http/, 'ws');
            const socketOptions = {
                path: '/api/v1/events', // ← Server handles both GET and WebSocket UPGRADE on this path
            };
            if (this.realmId) {
                socketOptions.query = { realm_id: this.realmId };
            }
            // `auth` as a function: socket.io-client calls it on every
            // CONNECT, so each attempt presents the CURRENT token, never
            // the one this socket was built with. The token
            // travels in the CONNECT packet, never in the URL.
            socketOptions.auth = (cb) => {
                const token = this.getToken?.();
                cb(token ? { token } : {});
            };
            // Create the wrapper but DO NOT connect here — EventsManager
            // installs lifecycle + message listeners before calling
            // `connect()` itself, so no early events can be lost to a
            // socket that handshakes before listeners attach.
            return new EventsSocketTransport(wsUrl, socketOptions);
        }, {
            autoConnect: true,
            autoReconnect: true,
            debug: options.debug ?? false,
            history,
            ...(this.realmId ? { realmId: this.realmId } : {}),
            ...(options.session ? { session: options.session } : {}),
            refreshToken,
            // After logout there is nothing to connect with; the next
            // session (login/adoptSession) reconnects the subscribers.
            hasCredential: () => !!this.getToken?.(),
            ...(options.prepareCredential ? { prepareCredential: options.prepareCredential } : {}),
            ...(options.maxReplayPages !== undefined ? { maxReplayPages: options.maxReplayPages } : {}),
            ...(options.welcomeTimeoutMs !== undefined ? { welcomeTimeoutMs: options.welcomeTimeoutMs } : {}),
            ...(options.backoff ? { backoff: options.backoff } : {}),
            ...(options.onScopeChanged ? { onScopeChanged: options.onScopeChanged } : {}),
            ...(options.onListenerError ? { onListenerError: options.onListenerError } : {}),
        });
    }
    // ============================================================================
    // Runtime surface
    // ============================================================================
    /**
     * Handle events of one or more types or patterns (`'computer.running'`,
     * `['computer.running', 'computer.stopped']`, `'computer.*'`, `'*'`).
     * Resolves with the unsubscribe function once the stream is admitted.
     *
     * Wildcards leave out live-only types unless `includeEphemeral` is set.
     * Naming `activity.logged` itself opts this connection in to the activity
     * feed. Replayed events (recovered from history after a disconnect) carry
     * `replayed: true`; an event is delivered once per subscription even when
     * both the socket and history carry it.
     */
    async on(pattern, handler, options = {}) {
        const patterns = toPatterns(pattern);
        return this.manager.subscribe(patterns, handler, {
            ...(options.filter ? { filter: options.filter } : {}),
            ...(options.includeEphemeral ? { includeEphemeral: true } : {}),
            ...(options.signal ? { signal: options.signal } : {}),
        });
    }
    /**
     * Events as an async iterator. Starts at the stream's boundary, or at
     * `after` (an event's `resume_after`, saved after handling it). Breaking out of the
     * loop unsubscribes. Byte-bounded: see EventsStreamOptions.maxBytes.
     */
    stream(options = {}) {
        const patterns = options.types ? toPatterns(options.types) : ['*'];
        return this.manager.stream(patterns, {
            ...(options.filter ? { filter: options.filter } : {}),
            ...(options.after !== undefined ? { after: options.after } : {}),
            ...(options.signal ? { signal: options.signal } : {}),
            ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
            ...(options.includeEphemeral ? { includeEphemeral: true } : {}),
            ...(options.onGap ? { onGap: options.onGap } : {}),
        });
    }
    /**
     * Resolves once history has been read up to the stream's boundary (the
     * first catch-up of this session that ends with `has_more:false`).
     * Anything committed after that is delivered to the handlers and
     * streams open at the time.
     *
     * ready() holds the connection only while it waits. On its own it does
     * not keep the stream open: with no handler, stream, wait or bootstrap
     * running, the socket closes once it resolves, and a later subscription
     * starts again from a new boundary. Register handlers first, or use
     * waitFor/prepareWait/bootstrap, which hold the connection themselves.
     */
    ready(options = {}) {
        return this.manager.ready(options);
    }
    /**
     * Wait for the first matching event. With `action`, the action runs only
     * after `ready()`, so its event cannot be missed, even on a cold start:
     *
     *     const running = await client.events.waitFor('computer.running',
     *         { resourceId: id }, () => client.api.computers.start(id));
     */
    waitFor(pattern, filter, action, options = {}) {
        const patterns = toPatterns(pattern);
        return this.manager.waitFor(patterns, toFilter(filter), action, options);
    }
    /**
     * Subscribe, then resolve after `ready()` with `{ result }`. Act, then
     * await `result`. The two-step form of `waitFor(type, filter, action)`.
     */
    prepareWait(pattern, filter, options = {}) {
        const patterns = toPatterns(pattern);
        return this.manager.prepareWait(patterns, toFilter(filter), options);
    }
    /**
     * Load a consistent starting state: waits for `ready()`, runs `readFn`
     * (your GET calls), and returns the snapshot with every resource that
     * events touched while it ran. Refetch those through GET; never apply an
     * event payload over a snapshot. A gap while reading restarts it (at most
     * 3 times, then EventsGapError).
     */
    bootstrap(readFn, options = {}) {
        return this.manager.bootstrap(readFn, options);
    }
    /**
     * Observe lifecycle state changes, gaps, `scope_changed` and non-fatal notices. A `state` event's
     * `state` and `previous` are the values `getLifecycleState()` returns. Returns an unsubscribe function.
     */
    onState(listener) {
        return this.manager.onState(listener);
    }
    /** The lifecycle state: idle, connecting, live, recovering, offline or closed. */
    getLifecycleState() {
        return this.manager.getLifecycleState();
    }
    /**
     * Close the stream for good: the socket closes, pending waits reject with
     * EventsClosedError, streams end and every handler is dropped. Idempotent.
     */
    close() {
        this.manager.close();
    }
    // ============================================================================
    // Activity Events (1 events)
    // ============================================================================
    /**
     * Listen for activity.logged events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onActivityLogged(callback) {
        return this.manager[listenByType]('activity.logged', callback);
    }
    // ============================================================================
    // Auth Events (5 events)
    // ============================================================================
    /**
     * Listen for auth.token.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenCreated(callback) {
        return this.manager[listenByType]('auth.token.created', callback);
    }
    /**
     * Listen for auth.token.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenDeleted(callback) {
        return this.manager[listenByType]('auth.token.deleted', callback);
    }
    /**
     * Listen for auth.token.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenDisabled(callback) {
        return this.manager[listenByType]('auth.token.disabled', callback);
    }
    /**
     * Listen for auth.token.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenEnabled(callback) {
        return this.manager[listenByType]('auth.token.enabled', callback);
    }
    /**
     * Listen for auth.token.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenUpdated(callback) {
        return this.manager[listenByType]('auth.token.updated', callback);
    }
    // ============================================================================
    // Computer Events (17 events)
    // ============================================================================
    /**
     * Listen for computer.autostart_disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerAutostartDisabled(callback) {
        return this.manager[listenByType]('computer.autostart_disabled', callback);
    }
    /**
     * Listen for computer.autostart_enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerAutostartEnabled(callback) {
        return this.manager[listenByType]('computer.autostart_enabled', callback);
    }
    /**
     * Listen for computer.creating events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerCreating(callback) {
        return this.manager[listenByType]('computer.creating', callback);
    }
    /**
     * Listen for computer.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerDeleted(callback) {
        return this.manager[listenByType]('computer.deleted', callback);
    }
    /**
     * Listen for computer.deleting events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerDeleting(callback) {
        return this.manager[listenByType]('computer.deleting', callback);
    }
    /**
     * Listen for computer.display.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerDisplayEnabled(callback) {
        return this.manager[listenByType]('computer.display.enabled', callback);
    }
    /**
     * Listen for computer.failed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerFailed(callback) {
        return this.manager[listenByType]('computer.failed', callback);
    }
    /**
     * Listen for computer.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerRenamed(callback) {
        return this.manager[listenByType]('computer.renamed', callback);
    }
    /**
     * Listen for computer.resource_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerResourceUpdated(callback) {
        return this.manager[listenByType]('computer.resource_updated', callback);
    }
    /**
     * Listen for computer.running events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerRunning(callback) {
        return this.manager[listenByType]('computer.running', callback);
    }
    /**
     * Listen for computer.snapshot.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerSnapshotCreated(callback) {
        return this.manager[listenByType]('computer.snapshot.created', callback);
    }
    /**
     * Listen for computer.snapshot.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerSnapshotDeleted(callback) {
        return this.manager[listenByType]('computer.snapshot.deleted', callback);
    }
    /**
     * Listen for computer.snapshot.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerSnapshotRenamed(callback) {
        return this.manager[listenByType]('computer.snapshot.renamed', callback);
    }
    /**
     * Listen for computer.snapshot.restored events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerSnapshotRestored(callback) {
        return this.manager[listenByType]('computer.snapshot.restored', callback);
    }
    /**
     * Listen for computer.ssh_key.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerSshKeyAdded(callback) {
        return this.manager[listenByType]('computer.ssh_key.added', callback);
    }
    /**
     * Listen for computer.ssh_key.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerSshKeyRemoved(callback) {
        return this.manager[listenByType]('computer.ssh_key.removed', callback);
    }
    /**
     * Listen for computer.stopped events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerStopped(callback) {
        return this.manager[listenByType]('computer.stopped', callback);
    }
    // ============================================================================
    // Firewall Events (5 events)
    // ============================================================================
    /**
     * Listen for firewall.rule.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleAdded(callback) {
        return this.manager[listenByType]('firewall.rule.added', callback);
    }
    /**
     * Listen for firewall.rule.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleDisabled(callback) {
        return this.manager[listenByType]('firewall.rule.disabled', callback);
    }
    /**
     * Listen for firewall.rule.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleEnabled(callback) {
        return this.manager[listenByType]('firewall.rule.enabled', callback);
    }
    /**
     * Listen for firewall.rule.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleRemoved(callback) {
        return this.manager[listenByType]('firewall.rule.removed', callback);
    }
    /**
     * Listen for firewall.rule.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleUpdated(callback) {
        return this.manager[listenByType]('firewall.rule.updated', callback);
    }
    // ============================================================================
    // Notification Events (3 events)
    // ============================================================================
    /**
     * Listen for notification.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationCreated(callback) {
        return this.manager[listenByType]('notification.created', callback);
    }
    /**
     * Listen for notification.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationDeleted(callback) {
        return this.manager[listenByType]('notification.deleted', callback);
    }
    /**
     * Listen for notification.read events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationRead(callback) {
        return this.manager[listenByType]('notification.read', callback);
    }
    // ============================================================================
    // Pool Events (5 events)
    // ============================================================================
    /**
     * Listen for pool.invitation_revoked events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolInvitationRevoked(callback) {
        return this.manager[listenByType]('pool.invitation_revoked', callback);
    }
    /**
     * Listen for pool.invited events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolInvited(callback) {
        return this.manager[listenByType]('pool.invited', callback);
    }
    /**
     * Listen for pool.member.joined events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberJoined(callback) {
        return this.manager[listenByType]('pool.member.joined', callback);
    }
    /**
     * Listen for pool.member.left events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberLeft(callback) {
        return this.manager[listenByType]('pool.member.left', callback);
    }
    /**
     * Listen for pool.member.role_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberRoleChanged(callback) {
        return this.manager[listenByType]('pool.member.role_changed', callback);
    }
    // ============================================================================
    // Project Events (3 events)
    // ============================================================================
    /**
     * Listen for project.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectCreated(callback) {
        return this.manager[listenByType]('project.created', callback);
    }
    /**
     * Listen for project.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectDeleted(callback) {
        return this.manager[listenByType]('project.deleted', callback);
    }
    /**
     * Listen for project.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectUpdated(callback) {
        return this.manager[listenByType]('project.updated', callback);
    }
    // ============================================================================
    // Proxy Events (12 events)
    // ============================================================================
    /**
     * Listen for proxy.alias.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasCreated(callback) {
        return this.manager[listenByType]('proxy.alias.created', callback);
    }
    /**
     * Listen for proxy.alias.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasDeleted(callback) {
        return this.manager[listenByType]('proxy.alias.deleted', callback);
    }
    /**
     * Listen for proxy.alias.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasDisabled(callback) {
        return this.manager[listenByType]('proxy.alias.disabled', callback);
    }
    /**
     * Listen for proxy.alias.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasEnabled(callback) {
        return this.manager[listenByType]('proxy.alias.enabled', callback);
    }
    /**
     * Listen for proxy.alias.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasExpired(callback) {
        return this.manager[listenByType]('proxy.alias.expired', callback);
    }
    /**
     * Listen for proxy.alias.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasExpiringSoon(callback) {
        return this.manager[listenByType]('proxy.alias.expiring_soon', callback);
    }
    /**
     * Listen for proxy.alias.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasUpdated(callback) {
        return this.manager[listenByType]('proxy.alias.updated', callback);
    }
    /**
     * Listen for proxy.permissions.default_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsDefaultChanged(callback) {
        return this.manager[listenByType]('proxy.permissions.default_changed', callback);
    }
    /**
     * Listen for proxy.permissions.group_added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupAdded(callback) {
        return this.manager[listenByType]('proxy.permissions.group_added', callback);
    }
    /**
     * Listen for proxy.permissions.group_removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupRemoved(callback) {
        return this.manager[listenByType]('proxy.permissions.group_removed', callback);
    }
    /**
     * Listen for proxy.permissions.group_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupUpdated(callback) {
        return this.manager[listenByType]('proxy.permissions.group_updated', callback);
    }
    /**
     * Listen for proxy.permissions.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsUpdated(callback) {
        return this.manager[listenByType]('proxy.permissions.updated', callback);
    }
    // ============================================================================
    // Server Events (2 events)
    // ============================================================================
    /**
     * Listen for server.health_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onServerHealthChanged(callback) {
        return this.manager[listenByType]('server.health_changed', callback);
    }
    /**
     * Listen for server.rental_expiring events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onServerRentalExpiring(callback) {
        return this.manager[listenByType]('server.rental_expiring', callback);
    }
    // ============================================================================
    // Storage Events (8 events)
    // ============================================================================
    /**
     * Listen for storage.share.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareCreated(callback) {
        return this.manager[listenByType]('storage.share.created', callback);
    }
    /**
     * Listen for storage.share.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareDeleted(callback) {
        return this.manager[listenByType]('storage.share.deleted', callback);
    }
    /**
     * Listen for storage.share.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareDisabled(callback) {
        return this.manager[listenByType]('storage.share.disabled', callback);
    }
    /**
     * Listen for storage.share.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareEnabled(callback) {
        return this.manager[listenByType]('storage.share.enabled', callback);
    }
    /**
     * Listen for storage.share.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareExpired(callback) {
        return this.manager[listenByType]('storage.share.expired', callback);
    }
    /**
     * Listen for storage.share.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareExpiringSoon(callback) {
        return this.manager[listenByType]('storage.share.expiring_soon', callback);
    }
    /**
     * Listen for storage.share.mount_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareMountChanged(callback) {
        return this.manager[listenByType]('storage.share.mount_changed', callback);
    }
    /**
     * Listen for storage.share.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareUpdated(callback) {
        return this.manager[listenByType]('storage.share.updated', callback);
    }
    // ============================================================================
    // Resource-Specific Listeners
    // ============================================================================
    // These use the wildcard event type "*" combined with an EventFilter
    // so that EventsManager.routeEvent delivers every event whose resource_id
    // and resource_type match the filter, regardless of event_type.
    /**
     * Listen to all events for a specific computer.
     * Uses wildcard "*" event type with a filter on resourceId + resourceType.
     * @param computerId Computer ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onComputerEvents(computerId, callback) {
        return this.manager[listenByType]('*', callback, {
            resourceId: computerId,
            resourceType: 'computer',
        });
    }
    /**
     * Listen to all events for a specific project
     * @param projectId Project ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectEvents(projectId, callback) {
        return this.manager[listenByType]('*', callback, {
            resourceId: projectId,
            resourceType: 'project',
        });
    }
    /**
     * Listen to ALL events (no filtering)
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAnyEvent(callback) {
        return this.manager[listenByType]('*', callback);
    }
    // ============================================================================
    // Batch Subscription
    // ==========================================================================
    /**
     * Subscribe to multiple event types at once.
     *
     * Each handler is registered sequentially (awaited one at a time) so that
     * all subscriptions coalesce on the same WebSocket connection promise.
     * The first registration triggers the connect; subsequent registrations
     * await the same in-flight connectionPromise in EventsManager.
     *
     * Returns a single unsubscribe function that removes all listeners at once.
     *
     * @param handlers Object mapping event names to callbacks
     * @returns Single unsubscribe function that removes all listeners
     */
    async subscribe(handlers) {
        const unsubscribers = [];
        // Wrap every await in a single try so a partial-failure
        // (e.g. WebSocket drop mid-batch) unwinds already-registered listeners
        // before rethrowing: the caller never receives the partial list, so a
        // listener left registered here could never be removed.
        try {
            // Special handlers
            if (handlers.onAnyEvent) {
                unsubscribers.push(await this.onAnyEvent(handlers.onAnyEvent));
            }
            // Every typed event
            if (handlers.onActivityLogged)
                unsubscribers.push(await this.onActivityLogged(handlers.onActivityLogged));
            if (handlers.onAuthTokenCreated)
                unsubscribers.push(await this.onAuthTokenCreated(handlers.onAuthTokenCreated));
            if (handlers.onAuthTokenDeleted)
                unsubscribers.push(await this.onAuthTokenDeleted(handlers.onAuthTokenDeleted));
            if (handlers.onAuthTokenDisabled)
                unsubscribers.push(await this.onAuthTokenDisabled(handlers.onAuthTokenDisabled));
            if (handlers.onAuthTokenEnabled)
                unsubscribers.push(await this.onAuthTokenEnabled(handlers.onAuthTokenEnabled));
            if (handlers.onAuthTokenUpdated)
                unsubscribers.push(await this.onAuthTokenUpdated(handlers.onAuthTokenUpdated));
            if (handlers.onComputerAutostartDisabled)
                unsubscribers.push(await this.onComputerAutostartDisabled(handlers.onComputerAutostartDisabled));
            if (handlers.onComputerAutostartEnabled)
                unsubscribers.push(await this.onComputerAutostartEnabled(handlers.onComputerAutostartEnabled));
            if (handlers.onComputerCreating)
                unsubscribers.push(await this.onComputerCreating(handlers.onComputerCreating));
            if (handlers.onComputerDeleted)
                unsubscribers.push(await this.onComputerDeleted(handlers.onComputerDeleted));
            if (handlers.onComputerDeleting)
                unsubscribers.push(await this.onComputerDeleting(handlers.onComputerDeleting));
            if (handlers.onComputerDisplayEnabled)
                unsubscribers.push(await this.onComputerDisplayEnabled(handlers.onComputerDisplayEnabled));
            if (handlers.onComputerFailed)
                unsubscribers.push(await this.onComputerFailed(handlers.onComputerFailed));
            if (handlers.onComputerRenamed)
                unsubscribers.push(await this.onComputerRenamed(handlers.onComputerRenamed));
            if (handlers.onComputerResourceUpdated)
                unsubscribers.push(await this.onComputerResourceUpdated(handlers.onComputerResourceUpdated));
            if (handlers.onComputerRunning)
                unsubscribers.push(await this.onComputerRunning(handlers.onComputerRunning));
            if (handlers.onComputerSnapshotCreated)
                unsubscribers.push(await this.onComputerSnapshotCreated(handlers.onComputerSnapshotCreated));
            if (handlers.onComputerSnapshotDeleted)
                unsubscribers.push(await this.onComputerSnapshotDeleted(handlers.onComputerSnapshotDeleted));
            if (handlers.onComputerSnapshotRenamed)
                unsubscribers.push(await this.onComputerSnapshotRenamed(handlers.onComputerSnapshotRenamed));
            if (handlers.onComputerSnapshotRestored)
                unsubscribers.push(await this.onComputerSnapshotRestored(handlers.onComputerSnapshotRestored));
            if (handlers.onComputerSshKeyAdded)
                unsubscribers.push(await this.onComputerSshKeyAdded(handlers.onComputerSshKeyAdded));
            if (handlers.onComputerSshKeyRemoved)
                unsubscribers.push(await this.onComputerSshKeyRemoved(handlers.onComputerSshKeyRemoved));
            if (handlers.onComputerStopped)
                unsubscribers.push(await this.onComputerStopped(handlers.onComputerStopped));
            if (handlers.onFirewallRuleAdded)
                unsubscribers.push(await this.onFirewallRuleAdded(handlers.onFirewallRuleAdded));
            if (handlers.onFirewallRuleDisabled)
                unsubscribers.push(await this.onFirewallRuleDisabled(handlers.onFirewallRuleDisabled));
            if (handlers.onFirewallRuleEnabled)
                unsubscribers.push(await this.onFirewallRuleEnabled(handlers.onFirewallRuleEnabled));
            if (handlers.onFirewallRuleRemoved)
                unsubscribers.push(await this.onFirewallRuleRemoved(handlers.onFirewallRuleRemoved));
            if (handlers.onFirewallRuleUpdated)
                unsubscribers.push(await this.onFirewallRuleUpdated(handlers.onFirewallRuleUpdated));
            if (handlers.onNotificationCreated)
                unsubscribers.push(await this.onNotificationCreated(handlers.onNotificationCreated));
            if (handlers.onNotificationDeleted)
                unsubscribers.push(await this.onNotificationDeleted(handlers.onNotificationDeleted));
            if (handlers.onNotificationRead)
                unsubscribers.push(await this.onNotificationRead(handlers.onNotificationRead));
            if (handlers.onPoolInvitationRevoked)
                unsubscribers.push(await this.onPoolInvitationRevoked(handlers.onPoolInvitationRevoked));
            if (handlers.onPoolInvited)
                unsubscribers.push(await this.onPoolInvited(handlers.onPoolInvited));
            if (handlers.onPoolMemberJoined)
                unsubscribers.push(await this.onPoolMemberJoined(handlers.onPoolMemberJoined));
            if (handlers.onPoolMemberLeft)
                unsubscribers.push(await this.onPoolMemberLeft(handlers.onPoolMemberLeft));
            if (handlers.onPoolMemberRoleChanged)
                unsubscribers.push(await this.onPoolMemberRoleChanged(handlers.onPoolMemberRoleChanged));
            if (handlers.onProjectCreated)
                unsubscribers.push(await this.onProjectCreated(handlers.onProjectCreated));
            if (handlers.onProjectDeleted)
                unsubscribers.push(await this.onProjectDeleted(handlers.onProjectDeleted));
            if (handlers.onProjectUpdated)
                unsubscribers.push(await this.onProjectUpdated(handlers.onProjectUpdated));
            if (handlers.onProxyAliasCreated)
                unsubscribers.push(await this.onProxyAliasCreated(handlers.onProxyAliasCreated));
            if (handlers.onProxyAliasDeleted)
                unsubscribers.push(await this.onProxyAliasDeleted(handlers.onProxyAliasDeleted));
            if (handlers.onProxyAliasDisabled)
                unsubscribers.push(await this.onProxyAliasDisabled(handlers.onProxyAliasDisabled));
            if (handlers.onProxyAliasEnabled)
                unsubscribers.push(await this.onProxyAliasEnabled(handlers.onProxyAliasEnabled));
            if (handlers.onProxyAliasExpired)
                unsubscribers.push(await this.onProxyAliasExpired(handlers.onProxyAliasExpired));
            if (handlers.onProxyAliasExpiringSoon)
                unsubscribers.push(await this.onProxyAliasExpiringSoon(handlers.onProxyAliasExpiringSoon));
            if (handlers.onProxyAliasUpdated)
                unsubscribers.push(await this.onProxyAliasUpdated(handlers.onProxyAliasUpdated));
            if (handlers.onProxyPermissionsDefaultChanged)
                unsubscribers.push(await this.onProxyPermissionsDefaultChanged(handlers.onProxyPermissionsDefaultChanged));
            if (handlers.onProxyPermissionsGroupAdded)
                unsubscribers.push(await this.onProxyPermissionsGroupAdded(handlers.onProxyPermissionsGroupAdded));
            if (handlers.onProxyPermissionsGroupRemoved)
                unsubscribers.push(await this.onProxyPermissionsGroupRemoved(handlers.onProxyPermissionsGroupRemoved));
            if (handlers.onProxyPermissionsGroupUpdated)
                unsubscribers.push(await this.onProxyPermissionsGroupUpdated(handlers.onProxyPermissionsGroupUpdated));
            if (handlers.onProxyPermissionsUpdated)
                unsubscribers.push(await this.onProxyPermissionsUpdated(handlers.onProxyPermissionsUpdated));
            if (handlers.onServerHealthChanged)
                unsubscribers.push(await this.onServerHealthChanged(handlers.onServerHealthChanged));
            if (handlers.onServerRentalExpiring)
                unsubscribers.push(await this.onServerRentalExpiring(handlers.onServerRentalExpiring));
            if (handlers.onStorageShareCreated)
                unsubscribers.push(await this.onStorageShareCreated(handlers.onStorageShareCreated));
            if (handlers.onStorageShareDeleted)
                unsubscribers.push(await this.onStorageShareDeleted(handlers.onStorageShareDeleted));
            if (handlers.onStorageShareDisabled)
                unsubscribers.push(await this.onStorageShareDisabled(handlers.onStorageShareDisabled));
            if (handlers.onStorageShareEnabled)
                unsubscribers.push(await this.onStorageShareEnabled(handlers.onStorageShareEnabled));
            if (handlers.onStorageShareExpired)
                unsubscribers.push(await this.onStorageShareExpired(handlers.onStorageShareExpired));
            if (handlers.onStorageShareExpiringSoon)
                unsubscribers.push(await this.onStorageShareExpiringSoon(handlers.onStorageShareExpiringSoon));
            if (handlers.onStorageShareMountChanged)
                unsubscribers.push(await this.onStorageShareMountChanged(handlers.onStorageShareMountChanged));
            if (handlers.onStorageShareUpdated)
                unsubscribers.push(await this.onStorageShareUpdated(handlers.onStorageShareUpdated));
            return () => {
                // Wrap each unsub individually so a single throw doesn't
                // leak the remaining listeners in the manager's map (parity with
                // the error-path cleanup below).
                for (const unsub of unsubscribers) {
                    try {
                        unsub();
                    }
                    catch { /* best effort */ }
                }
            };
        }
        catch (err) {
            // Partial-failure cleanup — unwind already-registered listeners
            // so they are NOT orphaned in the manager's map. Swallow each
            // unsub's own errors; the original error is what matters.
            for (const unsub of unsubscribers) {
                try {
                    unsub();
                }
                catch { /* best effort */ }
            }
            throw err;
        }
    }
    // ============================================================================
    // Connection Monitoring (optional)
    // ============================================================================
    /**
     * Register listeners for the transport events of the WebSocket connection.
     *
     * These are distinct from data events: connection events report on the
     * transport layer (connected, disconnected, reconnecting, reconnected,
     * error), not on server-pushed domain events. They are delivered through
     * EventsManager.addConnectionListener, which is a separate Map from the
     * data-event listeners Map. For the lifecycle state, use onState().
     *
     * Returns an array of individual unsubscribe functions (one per handler
     * registered), unlike `subscribe()` which returns a single composite
     * unsubscribe.
     */
    onConnection(handlers) {
        const unsubscribers = [];
        if (handlers.onConnected) {
            unsubscribers.push(this.manager.addConnectionListener('connected', handlers.onConnected));
        }
        if (handlers.onDisconnected) {
            unsubscribers.push(this.manager.addConnectionListener('disconnected', handlers.onDisconnected));
        }
        if (handlers.onReconnecting) {
            unsubscribers.push(this.manager.addConnectionListener('reconnecting', handlers.onReconnecting));
        }
        if (handlers.onReconnected) {
            unsubscribers.push(this.manager.addConnectionListener('reconnected', handlers.onReconnected));
        }
        if (handlers.onError) {
            unsubscribers.push(this.manager.addConnectionListener('error', handlers.onError));
        }
        return unsubscribers;
    }
    // ============================================================================
    // Configuration
    // ============================================================================
    /**
     * Change connection behaviour. `autoConnect: false` makes handler
     * registration resolve without waiting for the connection to be admitted;
     * `autoReconnect: false` stops reconnecting after a lost connection (the
     * stream goes idle and callers waiting for a connection get the error);
     * `debug` logs connection steps to the console. Omitted keys keep their
     * value.
     */
    configure(options) {
        this.manager.configure(options);
    }
    /** How many subscriptions are registered: handlers, open streams and pending waits. */
    getListenerCount() {
        return this.manager.getListenerCount();
    }
    /** True while the socket is connected and the server has admitted it. False while connecting, recovering a lost connection or closed. */
    isConnected() {
        return this.manager.isConnected();
    }
}
// The getter this read replaced refuses, naming the method.
retireAccessors(EventsClient.prototype, 'EventsClient', { state: 'getLifecycleState()' });
// getConnectionState() returned idle/connecting/connected/reconnecting; one read is left, with the six
// lifecycle values. getState() is the name EventsManager shipped for that read; both classes refuse it the same way.
retireMethods(EventsClient.prototype, 'EventsClient', {
    getConnectionState: 'getLifecycleState()',
    getState: 'getLifecycleState()',
});
// The transport-event listener is onConnection(); "lifecycle" names the six lifecycle states only.
retireMethods(EventsClient.prototype, 'EventsClient', { onLifecycle: 'onConnection()' });
// Removed; the old name refuses, naming close().
retireMethods(EventsClient.prototype, 'EventsClient', { disconnect: 'close()' });
// `await using events = …` closes the stream where the runtime has explicit
// resource management; the symbol is not in this package's ES2022 lib, so it
// is attached only when present.
const asyncDispose = Symbol.asyncDispose;
if (typeof asyncDispose === 'symbol') {
    Object.defineProperty(EventsClient.prototype, asyncDispose, {
        value: async function () { this.close(); },
        configurable: true,
        writable: true,
    });
}
