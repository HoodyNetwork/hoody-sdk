/**
 * Auto-Managed Events Client
 * High-level wrapper for Hoody Events API
 *
 * Provides automatic connection management - users just add listeners!
 *
 * Complete coverage: 65/65 event types (100%)
 *
 * Three subscription styles are supported:
 *
 *  1. Resource-specific listeners (onContainerEvents, onProjectEvents):
 *     Register with eventType "*" (wildcard) plus an EventFilter containing
 *     the target resourceId/resourceType. The EventsManager routes every
 *     incoming event through the wildcard bucket, and the filter narrows
 *     delivery to events matching that resource.
 *
 *  2. Lifecycle listeners (onLifecycle):
 *     Observe the WebSocket connection state itself (connected, disconnected,
 *     reconnecting, reconnected, error). These are distinct from data events
 *     and are delivered via EventsManager.addLifecycleListener, not through
 *     the data-event routing path.
 *
 *  3. Raw / typed event listeners (onContainerRunning, onAnyEvent, etc.):
 *     Each registers a listener on the exact event_type string (e.g.
 *     "container.running") or on "*" for all data events.
 */

import type { EventsService } from '../generated/api/events.service.js';
import { ApiError } from '../generated/errors.js';
import {
    EventsManager,
    type EventFilter,
    type EventsConnectionState,
    type EventsStateEvent,
} from './events-manager.js';
import type { EventHistoryItem, EventServerMessage, HoodyEvent, HoodyStreamEvent } from './events-types.js';
import { ApiConnecteventstreamWebSocket } from './events-types.js';
import { EventsError } from './events-errors.js';
import type { EventsHistoryPage, EventsHistoryReader } from './events-replay.js';
import type { EventsSession } from './events-session.js';
import { isEventPattern, type EventPattern, type EventTypesMatching } from './events-catalog.js';

/** Options of the §5 runtime behind an EventsClient. */
export interface EventsClientOptions {
    /** The client session the stream is bound to; `client.events` passes it. */
    session?: EventsSession;
    /**
     * C5 "refresh + reconnect". Defaults to the service HTTP client's own
     * single-flight 401 refresh, so the socket and REST refresh the same way.
     */
    refreshToken?: () => Promise<string | undefined>;
    /** Obtain a token when there is none yet (`client.events` runs the client's lazy login). */
    prepareCredential?: () => Promise<unknown>;
    /** Called for `scope_changed`; `client.events` clears the HTTP GET cache. */
    onScopeChanged?: (projectId: string) => void;
    /** Replay bound per catch-up, in 500-event pages (default 20). */
    maxReplayPages?: number;
    /** Deadline for the server's `welcome` after the socket connects (default 10 s). */
    welcomeTimeoutMs?: number;
    /** Reconnect backoff (default 1 s doubling to 30 s). */
    backoff?: { initialMs?: number; maxMs?: number };
    /** Where a throwing handler's error goes; nothing is logged by default. */
    onListenerError?: (error: unknown, event: HoodyEvent) => void;
    debug?: boolean;
}

/** Options of `on()`. */
export interface EventsOnOptions {
    signal?: AbortSignal;
    /** Let wildcards (`'*'`, `'x.*'`) deliver live-only types such as `activity.logged`. */
    includeEphemeral?: boolean;
    filter?: EventFilter;
}

/** Options of `waitFor()` and `prepareWait()`. */
export interface EventsWaitOptions {
    signal?: AbortSignal;
    /** Overall deadline, including connecting and catching up. */
    timeoutMs?: number;
    includeEphemeral?: boolean;
}

/** Options of `stream()`. */
export interface EventsStreamOptions<P extends EventPattern = EventPattern> {
    /** Patterns to deliver; all persisted types when omitted. */
    types?: readonly P[];
    /**
     * Resume point: a `resume_after` saved from an event this stream (or an
     * earlier one) yielded. Not `event.cursor`: see HoodyStreamEvent.
     */
    after?: string;
    filter?: EventFilter;
    signal?: AbortSignal;
    /** Byte bound of the buffer (default 8 MiB); past it the oldest buffered events are dropped. */
    maxBytes?: number;
    includeEphemeral?: boolean;
    /** `'throw'` ends the iterator with EventsGapError on any gap; `'continue'` (default) keeps going. */
    onGap?: 'continue' | 'throw';
}

/** A `waitFor` filter: an EventFilter, or a predicate. */
export type EventsWaitFilter<T extends HoodyEvent = HoodyEvent> = EventFilter | ((event: T) => boolean);

function toFilter(filter: EventsWaitFilter<any> | undefined): EventFilter | undefined {
    if (!filter) return undefined;
    if (typeof filter === 'function') return { where: filter as (event: HoodyEvent) => boolean };
    return filter;
}

function toPatterns(pattern: string | readonly string[]): string[] {
    const list = typeof pattern === 'string' ? [pattern] : [...pattern];
    if (list.length === 0) throw new TypeError('At least one event type or pattern is required');
    for (const p of list) {
        // A typo must not become a handler that silently never fires.
        if (typeof p !== 'string' || !isEventPattern(p)) throw new TypeError(`Unknown event type or pattern "${String(p)}"`);
    }
    return list;
}

/** Parse a C4 cursor-mode (or bootstrap) success body; anything else is not a cursor-capable server. */
function parseHistoryPage(body: unknown): EventsHistoryPage {
    const data = (body as { data?: unknown } | null)?.data as { events?: unknown; pagination?: Record<string, unknown> } | undefined;
    const pagination = data?.pagination;
    if (!data || !Array.isArray(data.events) || !pagination
        || typeof pagination.next_cursor !== 'string' || typeof pagination.latest_cursor !== 'string'
        || typeof pagination.has_more !== 'boolean') {
        throw new EventsError('EVENTS_HISTORY_MALFORMED', 'The events history response carries no cursors');
    }
    return {
        events: data.events as EventHistoryItem[],
        has_more: pagination.has_more,
        next_cursor: pagination.next_cursor,
        latest_cursor: pagination.latest_cursor,
    };
}

export class EventsClient {
    private manager: EventsManager;
    private baseURL: string;
    /** Realm the stream is scoped to (from the service), sent as `realm_id` on the handshake. */
    private realmId: string | undefined;
    private getToken: (() => string | null) | undefined;

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
    constructor(
        eventsService: EventsService,
        baseURL?: string,
        getToken?: () => string | null,
        options: EventsClientOptions = {},
    ) {
        // The stream must be scoped exactly like the service's REST calls.
        // A service from `client.withRealm(id).api.events` carries its realm
        // as `defaultRealmId` and applies it per request as a host label, while
        // its HTTP client holds the account base URL. Reading only that base
        // URL subscribed account-wide (hoody-api joins the user room when the
        // handshake names no realm) and mixed every realm's events into a
        // realm-scoped view. So: the realm host, resolved by the service's own
        // realm routing, plus `?realm_id=` (the server's documented base-domain
        // form; it must agree with the host, which it does by construction).
        // An explicit `baseURL` argument still wins, and then no realm is added.
        const service = eventsService as unknown as {
            http?: { getBaseURL?: () => string | undefined; config?: { baseURL?: string; token?: string | null } };
            defaultRealmId?: string;
            buildRealmUrl?: (path: string, realmId?: string) => string;
        } | undefined;
        const serviceBaseURL = service?.http?.getBaseURL?.() || service?.http?.config?.baseURL;
        const realmId = typeof service?.defaultRealmId === 'string' && service.defaultRealmId.length > 0
            ? service.defaultRealmId
            : undefined;
        let realmBaseURL: string | undefined;
        if (!baseURL && realmId && typeof service?.buildRealmUrl === 'function') {
            const resolved = service.buildRealmUrl('', realmId);
            if (/^https?:\/\//i.test(resolved)) realmBaseURL = resolved;
        }
        this.realmId = baseURL ? undefined : realmId;
        this.baseURL = baseURL
            || realmBaseURL
            || serviceBaseURL
            || 'https://api.hoody.com';
        // Default token resolver reads from the underlying service HTTP client if not provided
        this.getToken = getToken ?? (() => {
            try {
                return (eventsService as any)?.http?.config?.token ?? null;
            } catch {
                return null;
            }
        });

        const http = service?.http as unknown as {
            get?: (path: string, data: Record<string, unknown>) => Promise<unknown>;
            tryRefreshToken?: (error: ApiError) => Promise<string | undefined>;
            setToken?: (token: string) => void;
            config?: { acceptRefreshedToken?: (token: string) => boolean };
        } | undefined;

        // History goes through the service's own HTTP layer and realm routing,
        // so it is scoped and authenticated exactly like the socket and like
        // REST (raw query because the generated list() predates `after`).
        const historyUrl = (): string => {
            if (typeof service?.buildRealmUrl === 'function') {
                return (service.buildRealmUrl as (path: string) => string).call(service, '/api/v1/events');
            }
            return '/api/v1/events';
        };
        const historyGet = async (query: Record<string, unknown>, signal: AbortSignal): Promise<unknown> => {
            if (!http || typeof http.get !== 'function') {
                throw new EventsError('EVENTS_HISTORY_UNAVAILABLE', 'The events service has no HTTP client for history reads');
            }
            return http.get(historyUrl(), { query, signal, cache: false });
        };
        const history: EventsHistoryReader = {
            page: async (after, limit, signal) => parseHistoryPage(await historyGet({ after, limit }, signal)),
            bootstrap: async (signal) => {
                const page = parseHistoryPage(await historyGet({ bootstrap: 'true' }, signal));
                return { next_cursor: page.next_cursor, latest_cursor: page.latest_cursor };
            },
        };

        // C5 "refresh + reconnect" rides the HTTP client's own single-flight
        // 401 refresh (and, under HoodyClient, its session recovery), with the
        // same acceptance check the transport applies before installing a token.
        const refreshToken = options.refreshToken ?? (async (): Promise<string | undefined> => {
            if (!http || typeof http.tryRefreshToken !== 'function') return undefined;
            const expired = new ApiError({ message: 'Events stream token expired', status: 401, code: 'JWT_EXPIRED' });
            const token = await http.tryRefreshToken.call(http, expired);
            if (!token) return undefined;
            const accept = http.config?.acceptRefreshedToken;
            if (typeof accept === 'function' && !accept(token)) return undefined;
            http.setToken?.call(http, token);
            return token;
        });

        this.manager = new EventsManager(
            async () => {
                // Construct WebSocket URL (base URL only, path is in options)
                const wsUrl = this.baseURL.replace(/^http/, 'ws');
                const socketOptions: any = {
                    path: '/api/v1/events',  // ← Server handles both GET and WebSocket UPGRADE on this path
                };
                if (this.realmId) {
                    socketOptions.query = { realm_id: this.realmId };
                }
                // `auth` as a function: socket.io-client calls it on every
                // CONNECT, so each attempt presents the CURRENT token, never
                // the one this socket was built with. The token
                // travels in the CONNECT packet, never in the URL.
                socketOptions.auth = (cb: (data: Record<string, unknown>) => void) => {
                    const token = this.getToken?.();
                    cb(token ? { token } : {});
                };

                // Create the wrapper but DO NOT connect here — EventsManager
                // installs lifecycle + message listeners before calling
                // `connect()` itself, so no early events can be lost to a
                // socket that handshakes before listeners attach.
                return new ApiConnecteventstreamWebSocket(wsUrl, socketOptions);
            },
            {
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
            }
        );
    }

    // ============================================================================
    // Runtime surface
    // ============================================================================

    /**
     * Handle events of one or more types or patterns (`'container.running'`,
     * `['container.running', 'container.stopped']`, `'container.*'`, `'*'`).
     * Resolves with the unsubscribe function once the stream is admitted.
     *
     * Wildcards leave out live-only types unless `includeEphemeral` is set.
     * Naming `activity.logged` itself opts this connection in to the activity
     * feed. Replayed events (recovered from history after a disconnect) carry
     * `replayed: true`; an event is delivered once per subscription even when
     * both the socket and history carry it.
     */
    async on<P extends EventPattern>(
        pattern: P | readonly P[],
        handler: (event: HoodyEvent<EventTypesMatching<P>>) => void,
        options: EventsOnOptions = {},
    ): Promise<() => void> {
        const patterns = toPatterns(pattern as string | readonly string[]);
        return this.manager.subscribe(patterns, handler as (event: HoodyEvent) => void, {
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
    stream<P extends EventPattern = '*'>(
        options: EventsStreamOptions<P> = {},
    ): AsyncIterableIterator<HoodyStreamEvent<EventTypesMatching<P>>> {
        const patterns = options.types ? toPatterns(options.types as readonly string[]) : ['*'];
        return this.manager.stream(patterns, {
            ...(options.filter ? { filter: options.filter } : {}),
            ...(options.after !== undefined ? { after: options.after } : {}),
            ...(options.signal ? { signal: options.signal } : {}),
            ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
            ...(options.includeEphemeral ? { includeEphemeral: true } : {}),
            ...(options.onGap ? { onGap: options.onGap } : {}),
        }) as AsyncIterableIterator<HoodyStreamEvent<EventTypesMatching<P>>>;
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
    ready(options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<void> {
        return this.manager.whenReady(options);
    }

    /**
     * Wait for the first matching event. With `action`, the action runs only
     * after `ready()`, so its event cannot be missed, even on a cold start:
     *
     *     const running = await client.events.waitFor('container.running',
     *         { resourceId: id }, () => client.api.containers.start(id));
     */
    waitFor<P extends EventPattern>(
        pattern: P | readonly P[],
        filter?: EventsWaitFilter<HoodyEvent<EventTypesMatching<P>>>,
        action?: () => unknown,
        options: EventsWaitOptions = {},
    ): Promise<HoodyEvent<EventTypesMatching<P>>> {
        const patterns = toPatterns(pattern as string | readonly string[]);
        return this.manager.waitFor(patterns, toFilter(filter), action, options) as Promise<HoodyEvent<EventTypesMatching<P>>>;
    }

    /**
     * Subscribe, then resolve after `ready()` with `{ result }`. Act, then
     * await `result`. The two-step form of `waitFor(type, filter, action)`.
     */
    prepareWait<P extends EventPattern>(
        pattern: P | readonly P[],
        filter?: EventsWaitFilter<HoodyEvent<EventTypesMatching<P>>>,
        options: EventsWaitOptions = {},
    ): Promise<{ result: Promise<HoodyEvent<EventTypesMatching<P>>> }> {
        const patterns = toPatterns(pattern as string | readonly string[]);
        return this.manager.prepareWait(patterns, toFilter(filter), options) as Promise<{ result: Promise<HoodyEvent<EventTypesMatching<P>>> }>;
    }

    /**
     * Load a consistent starting state: waits for `ready()`, runs `readFn`
     * (your GET calls), and returns the snapshot with every resource that
     * events touched while it ran. Refetch those through GET; never apply an
     * event payload over a snapshot. A gap while reading restarts it (at most
     * 3 times, then EventsGapError).
     */
    bootstrap<S>(
        readFn: () => Promise<S> | S,
        options: { signal?: AbortSignal; timeoutMs?: number } = {},
    ): Promise<{ snapshot: S; touched: Array<{ resource_type: string; resource_id: string }> }> {
        return this.manager.bootstrap(readFn, options);
    }

    /** Observe connection state, gaps, `scope_changed` and non-fatal notices. Returns an unsubscribe function. */
    onState(listener: (event: EventsStateEvent) => void): () => void {
        return this.manager.onState(listener);
    }

    /** The §5 connection state. */
    get state(): EventsConnectionState {
        return this.manager.connectionState;
    }

    /**
     * Close the stream for good: the socket closes, pending waits reject with
     * EventsClosedError, streams end and every handler is dropped. Idempotent.
     */
    close(): void {
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
    async onActivityLogged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('activity.logged', callback);
    }

    // ============================================================================
    // Auth Events (5 events)
    // ============================================================================

    /**
     * Listen for auth.token.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.created', callback);
    }

    /**
     * Listen for auth.token.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.deleted', callback);
    }

    /**
     * Listen for auth.token.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.disabled', callback);
    }

    /**
     * Listen for auth.token.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.enabled', callback);
    }

    /**
     * Listen for auth.token.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAuthTokenUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('auth.token.updated', callback);
    }

    // ============================================================================
    // Container Events (17 events)
    // ============================================================================

    /**
     * Listen for container.autostart_disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerAutostartDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.autostart_disabled', callback);
    }

    /**
     * Listen for container.autostart_enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerAutostartEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.autostart_enabled', callback);
    }

    /**
     * Listen for container.creating events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerCreating(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.creating', callback);
    }

    /**
     * Listen for container.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.deleted', callback);
    }

    /**
     * Listen for container.deleting events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerDeleting(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.deleting', callback);
    }

    /**
     * Listen for container.display.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerDisplayEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.display.enabled', callback);
    }

    /**
     * Listen for container.failed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerFailed(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.failed', callback);
    }

    /**
     * Listen for container.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerRenamed(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.renamed', callback);
    }

    /**
     * Listen for container.resource_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerResourceUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.resource_updated', callback);
    }

    /**
     * Listen for container.running events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerRunning(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.running', callback);
    }

    /**
     * Listen for container.snapshot.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.created', callback);
    }

    /**
     * Listen for container.snapshot.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.deleted', callback);
    }

    /**
     * Listen for container.snapshot.renamed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotRenamed(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.renamed', callback);
    }

    /**
     * Listen for container.snapshot.restored events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSnapshotRestored(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.snapshot.restored', callback);
    }

    /**
     * Listen for container.ssh_key.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSshKeyAdded(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.ssh_key.added', callback);
    }

    /**
     * Listen for container.ssh_key.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerSshKeyRemoved(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.ssh_key.removed', callback);
    }

    /**
     * Listen for container.stopped events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerStopped(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('container.stopped', callback);
    }

    // ============================================================================
    // Firewall Events (5 events)
    // ============================================================================

    /**
     * Listen for firewall.rule.added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleAdded(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.added', callback);
    }

    /**
     * Listen for firewall.rule.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.disabled', callback);
    }

    /**
     * Listen for firewall.rule.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.enabled', callback);
    }

    /**
     * Listen for firewall.rule.removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleRemoved(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.removed', callback);
    }

    /**
     * Listen for firewall.rule.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onFirewallRuleUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('firewall.rule.updated', callback);
    }

    // ============================================================================
    // Notification Events (3 events)
    // ============================================================================

    /**
     * Listen for notification.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('notification.created', callback);
    }

    /**
     * Listen for notification.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('notification.deleted', callback);
    }

    /**
     * Listen for notification.read events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onNotificationRead(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('notification.read', callback);
    }

    // ============================================================================
    // Pool Events (5 events)
    // ============================================================================

    /**
     * Listen for pool.invitation_revoked events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolInvitationRevoked(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.invitation_revoked', callback);
    }

    /**
     * Listen for pool.invited events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolInvited(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.invited', callback);
    }

    /**
     * Listen for pool.member.joined events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberJoined(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.member.joined', callback);
    }

    /**
     * Listen for pool.member.left events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberLeft(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.member.left', callback);
    }

    /**
     * Listen for pool.member.role_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onPoolMemberRoleChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('pool.member.role_changed', callback);
    }

    // ============================================================================
    // Project Events (3 events)
    // ============================================================================

    /**
     * Listen for project.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('project.created', callback);
    }

    /**
     * Listen for project.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('project.deleted', callback);
    }

    /**
     * Listen for project.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('project.updated', callback);
    }

    // ============================================================================
    // Proxy Events (12 events)
    // ============================================================================

    /**
     * Listen for proxy.alias.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.created', callback);
    }

    /**
     * Listen for proxy.alias.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.deleted', callback);
    }

    /**
     * Listen for proxy.alias.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.disabled', callback);
    }

    /**
     * Listen for proxy.alias.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.enabled', callback);
    }

    /**
     * Listen for proxy.alias.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasExpired(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.expired', callback);
    }

    /**
     * Listen for proxy.alias.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasExpiringSoon(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.expiring_soon', callback);
    }

    /**
     * Listen for proxy.alias.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyAliasUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.alias.updated', callback);
    }

    /**
     * Listen for proxy.permissions.default_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsDefaultChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.default_changed', callback);
    }

    /**
     * Listen for proxy.permissions.group_added events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupAdded(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.group_added', callback);
    }

    /**
     * Listen for proxy.permissions.group_removed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupRemoved(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.group_removed', callback);
    }

    /**
     * Listen for proxy.permissions.group_updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsGroupUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.group_updated', callback);
    }

    /**
     * Listen for proxy.permissions.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProxyPermissionsUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('proxy.permissions.updated', callback);
    }

    // ============================================================================
    // Server Events (2 events)
    // ============================================================================

    /**
     * Listen for server.health_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onServerHealthChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('server.health_changed', callback);
    }

    /**
     * Listen for server.rental_expiring events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onServerRentalExpiring(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('server.rental_expiring', callback);
    }

    // ============================================================================
    // Storage Events (8 events)
    // ============================================================================

    /**
     * Listen for storage.share.created events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareCreated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.created', callback);
    }

    /**
     * Listen for storage.share.deleted events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareDeleted(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.deleted', callback);
    }

    /**
     * Listen for storage.share.disabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareDisabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.disabled', callback);
    }

    /**
     * Listen for storage.share.enabled events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareEnabled(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.enabled', callback);
    }

    /**
     * Listen for storage.share.expired events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareExpired(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.expired', callback);
    }

    /**
     * Listen for storage.share.expiring_soon events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareExpiringSoon(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.expiring_soon', callback);
    }

    /**
     * Listen for storage.share.mount_changed events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareMountChanged(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.mount_changed', callback);
    }

    /**
     * Listen for storage.share.updated events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onStorageShareUpdated(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('storage.share.updated', callback);
    }

    // ============================================================================
    // Resource-Specific Listeners
    // ============================================================================
    // These use the wildcard event type "*" combined with an EventFilter
    // so that EventsManager.routeEvent delivers every event whose resource_id
    // and resource_type match the filter, regardless of event_type.

    /**
     * Listen to all events for a specific container.
     * Uses wildcard "*" event type with a filter on resourceId + resourceType.
     * @param containerId Container ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onContainerEvents(
        containerId: string,
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('*', callback, {
            resourceId: containerId,
            resourceType: 'container',
        });
    }

    /**
     * Listen to all events for a specific project
     * @param projectId Project ID to filter events
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onProjectEvents(
        projectId: string,
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('*', callback, {
            resourceId: projectId,
            resourceType: 'project',
        });
    }

    /**
     * Listen to ALL events (no filtering)
     * @param callback Function to call when event occurs
     * @returns Unsubscribe function
     */
    async onAnyEvent(
        callback: (event: EventServerMessage) => void
    ): Promise<() => void> {
        return this.manager.addEventListener('*', callback);
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
    async subscribe(handlers: EventListeners): Promise<() => void> {
        const unsubscribers: Array<() => void> = [];

        // Wrap every await in a single try so a partial-failure
        // (e.g. WebSocket drop mid-batch) unwinds already-registered listeners
        // before rethrowing. Pre-fix the first N successful registrations were
        // trapped in a local array the caller never received, leading to a
        // permanent listener leak and forever-on connection.
        try {

        // Special handlers
        if (handlers.onAnyEvent) {
            unsubscribers.push(await this.onAnyEvent(handlers.onAnyEvent));
        }

        // All 65 event types
        if (handlers.onActivityLogged) unsubscribers.push(await this.onActivityLogged(handlers.onActivityLogged));
        if (handlers.onAuthTokenCreated) unsubscribers.push(await this.onAuthTokenCreated(handlers.onAuthTokenCreated));
        if (handlers.onAuthTokenDeleted) unsubscribers.push(await this.onAuthTokenDeleted(handlers.onAuthTokenDeleted));
        if (handlers.onAuthTokenDisabled) unsubscribers.push(await this.onAuthTokenDisabled(handlers.onAuthTokenDisabled));
        if (handlers.onAuthTokenEnabled) unsubscribers.push(await this.onAuthTokenEnabled(handlers.onAuthTokenEnabled));
        if (handlers.onAuthTokenUpdated) unsubscribers.push(await this.onAuthTokenUpdated(handlers.onAuthTokenUpdated));
        if (handlers.onContainerAutostartDisabled) unsubscribers.push(await this.onContainerAutostartDisabled(handlers.onContainerAutostartDisabled));
        if (handlers.onContainerAutostartEnabled) unsubscribers.push(await this.onContainerAutostartEnabled(handlers.onContainerAutostartEnabled));
        if (handlers.onContainerCreating) unsubscribers.push(await this.onContainerCreating(handlers.onContainerCreating));
        if (handlers.onContainerDeleted) unsubscribers.push(await this.onContainerDeleted(handlers.onContainerDeleted));
        if (handlers.onContainerDeleting) unsubscribers.push(await this.onContainerDeleting(handlers.onContainerDeleting));
        if (handlers.onContainerDisplayEnabled) unsubscribers.push(await this.onContainerDisplayEnabled(handlers.onContainerDisplayEnabled));
        if (handlers.onContainerFailed) unsubscribers.push(await this.onContainerFailed(handlers.onContainerFailed));
        if (handlers.onContainerRenamed) unsubscribers.push(await this.onContainerRenamed(handlers.onContainerRenamed));
        if (handlers.onContainerResourceUpdated) unsubscribers.push(await this.onContainerResourceUpdated(handlers.onContainerResourceUpdated));
        if (handlers.onContainerRunning) unsubscribers.push(await this.onContainerRunning(handlers.onContainerRunning));
        if (handlers.onContainerSnapshotCreated) unsubscribers.push(await this.onContainerSnapshotCreated(handlers.onContainerSnapshotCreated));
        if (handlers.onContainerSnapshotDeleted) unsubscribers.push(await this.onContainerSnapshotDeleted(handlers.onContainerSnapshotDeleted));
        if (handlers.onContainerSnapshotRenamed) unsubscribers.push(await this.onContainerSnapshotRenamed(handlers.onContainerSnapshotRenamed));
        if (handlers.onContainerSnapshotRestored) unsubscribers.push(await this.onContainerSnapshotRestored(handlers.onContainerSnapshotRestored));
        if (handlers.onContainerSshKeyAdded) unsubscribers.push(await this.onContainerSshKeyAdded(handlers.onContainerSshKeyAdded));
        if (handlers.onContainerSshKeyRemoved) unsubscribers.push(await this.onContainerSshKeyRemoved(handlers.onContainerSshKeyRemoved));
        if (handlers.onContainerStopped) unsubscribers.push(await this.onContainerStopped(handlers.onContainerStopped));
        if (handlers.onFirewallRuleAdded) unsubscribers.push(await this.onFirewallRuleAdded(handlers.onFirewallRuleAdded));
        if (handlers.onFirewallRuleDisabled) unsubscribers.push(await this.onFirewallRuleDisabled(handlers.onFirewallRuleDisabled));
        if (handlers.onFirewallRuleEnabled) unsubscribers.push(await this.onFirewallRuleEnabled(handlers.onFirewallRuleEnabled));
        if (handlers.onFirewallRuleRemoved) unsubscribers.push(await this.onFirewallRuleRemoved(handlers.onFirewallRuleRemoved));
        if (handlers.onFirewallRuleUpdated) unsubscribers.push(await this.onFirewallRuleUpdated(handlers.onFirewallRuleUpdated));
        if (handlers.onNotificationCreated) unsubscribers.push(await this.onNotificationCreated(handlers.onNotificationCreated));
        if (handlers.onNotificationDeleted) unsubscribers.push(await this.onNotificationDeleted(handlers.onNotificationDeleted));
        if (handlers.onNotificationRead) unsubscribers.push(await this.onNotificationRead(handlers.onNotificationRead));
        if (handlers.onPoolInvitationRevoked) unsubscribers.push(await this.onPoolInvitationRevoked(handlers.onPoolInvitationRevoked));
        if (handlers.onPoolInvited) unsubscribers.push(await this.onPoolInvited(handlers.onPoolInvited));
        if (handlers.onPoolMemberJoined) unsubscribers.push(await this.onPoolMemberJoined(handlers.onPoolMemberJoined));
        if (handlers.onPoolMemberLeft) unsubscribers.push(await this.onPoolMemberLeft(handlers.onPoolMemberLeft));
        if (handlers.onPoolMemberRoleChanged) unsubscribers.push(await this.onPoolMemberRoleChanged(handlers.onPoolMemberRoleChanged));
        if (handlers.onProjectCreated) unsubscribers.push(await this.onProjectCreated(handlers.onProjectCreated));
        if (handlers.onProjectDeleted) unsubscribers.push(await this.onProjectDeleted(handlers.onProjectDeleted));
        if (handlers.onProjectUpdated) unsubscribers.push(await this.onProjectUpdated(handlers.onProjectUpdated));
        if (handlers.onProxyAliasCreated) unsubscribers.push(await this.onProxyAliasCreated(handlers.onProxyAliasCreated));
        if (handlers.onProxyAliasDeleted) unsubscribers.push(await this.onProxyAliasDeleted(handlers.onProxyAliasDeleted));
        if (handlers.onProxyAliasDisabled) unsubscribers.push(await this.onProxyAliasDisabled(handlers.onProxyAliasDisabled));
        if (handlers.onProxyAliasEnabled) unsubscribers.push(await this.onProxyAliasEnabled(handlers.onProxyAliasEnabled));
        if (handlers.onProxyAliasExpired) unsubscribers.push(await this.onProxyAliasExpired(handlers.onProxyAliasExpired));
        if (handlers.onProxyAliasExpiringSoon) unsubscribers.push(await this.onProxyAliasExpiringSoon(handlers.onProxyAliasExpiringSoon));
        if (handlers.onProxyAliasUpdated) unsubscribers.push(await this.onProxyAliasUpdated(handlers.onProxyAliasUpdated));
        if (handlers.onProxyPermissionsDefaultChanged) unsubscribers.push(await this.onProxyPermissionsDefaultChanged(handlers.onProxyPermissionsDefaultChanged));
        if (handlers.onProxyPermissionsGroupAdded) unsubscribers.push(await this.onProxyPermissionsGroupAdded(handlers.onProxyPermissionsGroupAdded));
        if (handlers.onProxyPermissionsGroupRemoved) unsubscribers.push(await this.onProxyPermissionsGroupRemoved(handlers.onProxyPermissionsGroupRemoved));
        if (handlers.onProxyPermissionsGroupUpdated) unsubscribers.push(await this.onProxyPermissionsGroupUpdated(handlers.onProxyPermissionsGroupUpdated));
        if (handlers.onProxyPermissionsUpdated) unsubscribers.push(await this.onProxyPermissionsUpdated(handlers.onProxyPermissionsUpdated));
        if (handlers.onServerHealthChanged) unsubscribers.push(await this.onServerHealthChanged(handlers.onServerHealthChanged));
        if (handlers.onServerRentalExpiring) unsubscribers.push(await this.onServerRentalExpiring(handlers.onServerRentalExpiring));
        if (handlers.onStorageShareCreated) unsubscribers.push(await this.onStorageShareCreated(handlers.onStorageShareCreated));
        if (handlers.onStorageShareDeleted) unsubscribers.push(await this.onStorageShareDeleted(handlers.onStorageShareDeleted));
        if (handlers.onStorageShareDisabled) unsubscribers.push(await this.onStorageShareDisabled(handlers.onStorageShareDisabled));
        if (handlers.onStorageShareEnabled) unsubscribers.push(await this.onStorageShareEnabled(handlers.onStorageShareEnabled));
        if (handlers.onStorageShareExpired) unsubscribers.push(await this.onStorageShareExpired(handlers.onStorageShareExpired));
        if (handlers.onStorageShareExpiringSoon) unsubscribers.push(await this.onStorageShareExpiringSoon(handlers.onStorageShareExpiringSoon));
        if (handlers.onStorageShareMountChanged) unsubscribers.push(await this.onStorageShareMountChanged(handlers.onStorageShareMountChanged));
        if (handlers.onStorageShareUpdated) unsubscribers.push(await this.onStorageShareUpdated(handlers.onStorageShareUpdated));

        return () => {
            // Wrap each unsub individually so a single throw doesn't
            // leak the remaining listeners in the manager's map (parity with
            // the error-path cleanup below).
            for (const unsub of unsubscribers) {
                try { unsub(); } catch { /* best effort */ }
            }
        };
        } catch (err) {
            // Partial-failure cleanup — unwind already-registered listeners
            // so they are NOT orphaned in the manager's map. Swallow each
            // unsub's own errors; the original error is what matters.
            for (const unsub of unsubscribers) {
                try { unsub(); } catch { /* best effort */ }
            }
            throw err;
        }
    }

    // ============================================================================
    // Lifecycle Monitoring (optional)
    // ============================================================================

    /**
     * Register listeners for WebSocket connection state changes.
     *
     * These are distinct from data events: lifecycle events report on the
     * transport layer (connected, disconnected, reconnecting, reconnected,
     * error), not on server-pushed domain events. They are delivered through
     * EventsManager.addLifecycleListener, which is a separate Map from the
     * data-event listeners Map.
     *
     * Returns an array of individual unsubscribe functions (one per handler
     * registered), unlike `subscribe()` which returns a single composite
     * unsubscribe.
     */
    onLifecycle(handlers: {
        onConnected?: () => void;
        onDisconnected?: (code: number, reason: string) => void;
        onReconnecting?: (attempt: number) => void;
        onReconnected?: (attempt: number) => void;
        onError?: (error: Error) => void;
    }): (() => void)[] {
        const unsubscribers: Array<() => void> = [];

        if (handlers.onConnected) {
            unsubscribers.push(this.manager.addLifecycleListener('connected', handlers.onConnected));
        }
        if (handlers.onDisconnected) {
            unsubscribers.push(this.manager.addLifecycleListener('disconnected', handlers.onDisconnected));
        }
        if (handlers.onReconnecting) {
            unsubscribers.push(this.manager.addLifecycleListener('reconnecting', handlers.onReconnecting));
        }
        if (handlers.onReconnected) {
            unsubscribers.push(this.manager.addLifecycleListener('reconnected', handlers.onReconnected));
        }
        if (handlers.onError) {
            unsubscribers.push(this.manager.addLifecycleListener('error', handlers.onError));
        }

        return unsubscribers;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    configure(options: {
        autoConnect?: boolean;
        autoReconnect?: boolean;
        debug?: boolean;
    }): void {
        this.manager.configure(options);
    }

    getConnectionState(): string {
        return this.manager.getState();
    }

    getListenerCount(): number {
        return this.manager.getListenerCount();
    }

    isConnected(): boolean {
        return this.manager.isConnected();
    }

    disconnect(): void {
        this.manager.disconnect();
    }
}

// `await using events = …` closes the stream where the runtime has explicit
// resource management; the symbol is not in this package's ES2022 lib, so it
// is attached only when present.
const asyncDispose = (Symbol as unknown as { asyncDispose?: symbol }).asyncDispose;
if (typeof asyncDispose === 'symbol') {
    Object.defineProperty(EventsClient.prototype, asyncDispose, {
        value: async function (this: EventsClient): Promise<void> { this.close(); },
        configurable: true,
        writable: true,
    });
}

// ============================================================================
// EventListeners Interface (for subscribe() method)
// ============================================================================

/**
 * Interface for batch event subscription
 * Supports all 65 event types from the Hoody Events API
 */
export interface EventListeners {
    /** Listen to all events */
    onAnyEvent?: (event: EventServerMessage) => void;

    // Activity Events (1)
    onActivityLogged?: (event: EventServerMessage) => void;

    // Auth Events (5)
    onAuthTokenCreated?: (event: EventServerMessage) => void;
    onAuthTokenDeleted?: (event: EventServerMessage) => void;
    onAuthTokenDisabled?: (event: EventServerMessage) => void;
    onAuthTokenEnabled?: (event: EventServerMessage) => void;
    onAuthTokenUpdated?: (event: EventServerMessage) => void;

    // Container Events (17)
    onContainerAutostartDisabled?: (event: EventServerMessage) => void;
    onContainerAutostartEnabled?: (event: EventServerMessage) => void;
    onContainerCreating?: (event: EventServerMessage) => void;
    onContainerDeleted?: (event: EventServerMessage) => void;
    onContainerDeleting?: (event: EventServerMessage) => void;
    onContainerDisplayEnabled?: (event: EventServerMessage) => void;
    onContainerFailed?: (event: EventServerMessage) => void;
    onContainerRenamed?: (event: EventServerMessage) => void;
    onContainerResourceUpdated?: (event: EventServerMessage) => void;
    onContainerRunning?: (event: EventServerMessage) => void;
    onContainerSnapshotCreated?: (event: EventServerMessage) => void;
    onContainerSnapshotDeleted?: (event: EventServerMessage) => void;
    onContainerSnapshotRenamed?: (event: EventServerMessage) => void;
    onContainerSnapshotRestored?: (event: EventServerMessage) => void;
    onContainerSshKeyAdded?: (event: EventServerMessage) => void;
    onContainerSshKeyRemoved?: (event: EventServerMessage) => void;
    onContainerStopped?: (event: EventServerMessage) => void;

    // Firewall Events (5)
    onFirewallRuleAdded?: (event: EventServerMessage) => void;
    onFirewallRuleDisabled?: (event: EventServerMessage) => void;
    onFirewallRuleEnabled?: (event: EventServerMessage) => void;
    onFirewallRuleRemoved?: (event: EventServerMessage) => void;
    onFirewallRuleUpdated?: (event: EventServerMessage) => void;

    // Notification Events (3)
    onNotificationCreated?: (event: EventServerMessage) => void;
    onNotificationDeleted?: (event: EventServerMessage) => void;
    onNotificationRead?: (event: EventServerMessage) => void;

    // Pool Events (5)
    onPoolInvitationRevoked?: (event: EventServerMessage) => void;
    onPoolInvited?: (event: EventServerMessage) => void;
    onPoolMemberJoined?: (event: EventServerMessage) => void;
    onPoolMemberLeft?: (event: EventServerMessage) => void;
    onPoolMemberRoleChanged?: (event: EventServerMessage) => void;

    // Project Events (3)
    onProjectCreated?: (event: EventServerMessage) => void;
    onProjectDeleted?: (event: EventServerMessage) => void;
    onProjectUpdated?: (event: EventServerMessage) => void;

    // Proxy Events (12)
    onProxyAliasCreated?: (event: EventServerMessage) => void;
    onProxyAliasDeleted?: (event: EventServerMessage) => void;
    onProxyAliasDisabled?: (event: EventServerMessage) => void;
    onProxyAliasEnabled?: (event: EventServerMessage) => void;
    onProxyAliasExpired?: (event: EventServerMessage) => void;
    onProxyAliasExpiringSoon?: (event: EventServerMessage) => void;
    onProxyAliasUpdated?: (event: EventServerMessage) => void;
    onProxyPermissionsDefaultChanged?: (event: EventServerMessage) => void;
    onProxyPermissionsGroupAdded?: (event: EventServerMessage) => void;
    onProxyPermissionsGroupRemoved?: (event: EventServerMessage) => void;
    onProxyPermissionsGroupUpdated?: (event: EventServerMessage) => void;
    onProxyPermissionsUpdated?: (event: EventServerMessage) => void;

    // Server Events (2)
    onServerHealthChanged?: (event: EventServerMessage) => void;
    onServerRentalExpiring?: (event: EventServerMessage) => void;

    // Storage Events (8)
    onStorageShareCreated?: (event: EventServerMessage) => void;
    onStorageShareDeleted?: (event: EventServerMessage) => void;
    onStorageShareDisabled?: (event: EventServerMessage) => void;
    onStorageShareEnabled?: (event: EventServerMessage) => void;
    onStorageShareExpired?: (event: EventServerMessage) => void;
    onStorageShareExpiringSoon?: (event: EventServerMessage) => void;
    onStorageShareMountChanged?: (event: EventServerMessage) => void;
    onStorageShareUpdated?: (event: EventServerMessage) => void;
}
