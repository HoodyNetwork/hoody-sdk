/**
 * Events runtime: one connection to the Hoody events stream, its recovery and
 * its subscribers.
 *
 * States (reported through `onState`):
 *
 *     idle ──demand──▶ connecting ──welcome──▶ recovering ──caught up──▶ live
 *       ▲                 │  ▲                     │                       │
 *       │   no demand     │  │ backoff 1 s → 30 s  ▼ transport loss        │
 *       └──────────────── │  └────────────────  offline ◀──────────────────┘
 *                         ▼
 *                       closed  (terminal code, close(); a session change reopens
 *                                a terminal close but never a close())
 *
 * Rules this file implements:
 *  - A connection is admitted by `welcome`, not by the socket `connect`:
 *    hoody-api authenticates after the namespace connect. Frames that
 *    arrive before `welcome` are buffered and replayed after it.
 *  - Control frames are never events. Every code goes through
 *    the C5 map in events-errors.ts.
 *  - socket.io's own reconnection is off; this loop owns every retry, and the
 *    token is read afresh on each attempt.
 *  - Live frames are delivered at once and de-duplicated by event id; only
 *    history moves the confirmed cursor (events-replay.ts).
 *  - Everything is bound to the client session (events-session.ts).
 */

import type { ApiConnecteventstreamWebSocket, ErrorFrame, EventsStreamGap, EventWireFrame, HoodyEvent, HoodyStreamEvent, ServerFrame, WelcomeFrame } from './events-types.js';
import { toHoodyEvent } from './events-types.js';
import {
    EventsAuthError,
    EventsClosedError,
    EventsError,
    EventsGapError,
    EventsSessionChangedError,
    EventsTimeoutError,
    historyActionFor,
    socketActionFor,
    type EventsGapReason,
} from './events-errors.js';
import { EventIdLru, EventsRecovery, HISTORY_BACKOFF_FLOOR_MS, type EventsHistoryReader } from './events-replay.js';
import type { EventsSession } from './events-session.js';

/** The transport surface the runtime needs; ApiConnecteventstreamWebSocket implements it. */
export type EventsTransport = Pick<
    ApiConnecteventstreamWebSocket,
    'connect' | 'disconnect' | 'removeAllListeners' | 'emit' | 'onFrame' | 'onSocketError' | 'onClose'
>;

/** Connection state. */
export type EventsConnectionState = 'idle' | 'connecting' | 'recovering' | 'live' | 'offline' | 'closed';

/** What `onState` listeners receive. */
export type EventsStateEvent =
    | { kind: 'state'; state: EventsConnectionState; previous: EventsConnectionState; error?: EventsError; retryInMs?: number }
    /**
     * Continuity was lost; refetch what you show. Without `stream`, the
     * runtime resumed from the scope's boundary. With `stream: true`, one
     * stream() consumer fell behind its byte bound and `dropped` persisted
     * events were dropped from its buffer only (other subscribers are whole).
     */
    | { kind: 'gap'; reason: EventsGapReason; stream?: true; dropped?: number }
    /** Access to a project changed for this user (`scope_changed`); cached reads of it are stale. */
    | { kind: 'scope_changed'; projectId: string; reason: string }
    /**
     * A non-fatal refusal: the connection stays up. Code
     * `EVENTS_HISTORY_RETRY`: a stream({after}) replay page failed
     * transiently and is read again in `delayMs`; `attempt` counts from 1
     * per page.
     */
    | { kind: 'notice'; code: string; message?: string; attempt?: number; delayMs?: number }
    /** The client session changed; state of the previous session was dropped. */
    | { kind: 'session_changed' };

/** Narrows which events a subscriber receives, on top of its type patterns. */
export interface EventFilter {
    /** The event's `resource_id`. */
    resourceId?: string;
    /** The event's `resource_type`. */
    resourceType?: string;
    /** Events of a project: `project_id` equals it, or the event is about the project itself. */
    projectId?: string;
    /** Events of a container: `container_id` equals it, or the event is about the container itself. */
    containerId?: string;
    /** Any further predicate. */
    where?: (event: HoodyEvent) => boolean;
}

export interface EventsManagerOptions {
    autoConnect?: boolean;
    autoReconnect?: boolean;
    debug?: boolean;
    /** History reads for recovery. Without it the runtime delivers live frames only (no replay). */
    history?: EventsHistoryReader;
    /**
     * The realm the stream is scoped to. When set, a `welcome` naming another
     * realm is a terminal `REALM_MISMATCH`. Not checked when absent. The
     * server admits an unscoped connection only for a token without realm
     * restrictions; a realm-restricted token on an unscoped client is refused
     * `REALM_REQUIRED` (terminal, C5): scope the client with withRealm().
     */
    realmId?: string;
    /** The client session the runtime is bound to. */
    session?: EventsSession;
    /** C5 "refresh + reconnect": obtain a fresh access token; undefined when none can be had. */
    refreshToken?: () => Promise<string | undefined>;
    /** False when there is no credential to connect with (after logout). Defaults to always true. */
    hasCredential?: () => boolean;
    /** Obtain a credential when there is none (a lazy login); tried once per session. */
    prepareCredential?: () => Promise<unknown>;
    /** Replay bound per catch-up (default 20 pages). */
    maxReplayPages?: number;
    /** Deadline for `welcome` after the socket connects (default 10 s). */
    welcomeTimeoutMs?: number;
    /** Reconnect backoff (default 1 s doubling to 30 s, with jitter). */
    backoff?: { initialMs?: number; maxMs?: number };
    /**
     * Delay between a persisted live frame and the catch-up it triggers,
     * drawn uniformly from [minMs, maxMs] (default 1–3 s). The
     * spread keeps the sockets of one change from reading history at once.
     */
    catchUpDelay?: { minMs?: number; maxMs?: number };
    /** Called for `scope_changed` ("evict the project cache"). */
    onScopeChanged?: (projectId: string) => void;
    /** Where a throwing listener's error goes. Nothing is logged by default. */
    onListenerError?: (error: unknown, event: HoodyEvent) => void;
    /** A cursor to resume from on the first welcome of the session, instead of its boundary. */
    after?: string;
    /** Source of randomness for backoff jitter (tests). */
    random?: () => number;
    /** Delay before retrying a transient history failure (default 1 s doubling to 30 s; tests). */
    historyRetryDelayMs?: (attempt: number, floorMs: number) => number;
}

type EventCallback = (event: HoodyEvent) => void;
type LifecycleCallback = (...args: any[]) => void;

interface Subscriber {
    /** Types (`container.running`), prefixes (`container.*`) or `*`. */
    patterns: readonly string[];
    includeEphemeral: boolean;
    /** Names `activity.logged`, or opts wildcards into it: the socket must opt in. */
    wantsActivity: boolean;
    filter: EventFilter | undefined;
    deliver: EventCallback;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
    settled: boolean;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const d = { settled: false } as Deferred<T>;
    d.promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    d.resolve = (value) => { if (!d.settled) { d.settled = true; resolve(value); } };
    d.reject = (error) => { if (!d.settled) { d.settled = true; reject(error); } };
    // A rejection nobody awaits (ready() never called) must not crash the host.
    d.promise.catch(() => {});
    return d;
}

interface Attempt {
    id: number;
    ws: EventsTransport | null;
    welcomed: boolean;
    dead: boolean;
    preWelcome: EventWireFrame[];
    welcomeTimer: ReturnType<typeof setTimeout> | null;
    unsubscribers: Array<() => void>;
    /** The last tick latest_cursor this connection caught up against. */
    tickReconciled: string | null;
}

/** Waiters released by the next `welcome`, or rejected by a terminal outcome. */
interface WelcomeWaiter {
    resolve: () => void;
    reject: (error: unknown) => void;
}

/** The C5 history action for a failed read (status and body code). */
function historyActionOf(error: unknown) {
    const status = (error as { status?: unknown } | null)?.status;
    const code = (error as { code?: unknown } | null)?.code;
    return historyActionFor(typeof status === 'number' ? status : undefined, typeof code === 'string' ? code : undefined);
}

/** What a failed history read reports: the HTTP status, else the error code, else `network`. */
function errorCodeOf(error: unknown): string {
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number') return `HTTP ${status}`;
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : 'network';
}

/** setTimeout as a promise that also settles, early, when `signal` aborts. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) return resolve();
        const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
        const onAbort = () => { clearTimeout(timer); resolve(); };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

/** Holds that keep the connection open (ready/waitFor/stream) and end with the session. */
interface Hold {
    fail: (error: unknown) => void;
    /** close(): streams end normally, waits reject. */
    finish: (error: EventsClosedError) => void;
}

/** The C5 dedupe window for a code received on both `message` and the socket `error` event. */
const CODE_DEDUPE_MS = 1000;
const ACTIVITY = 'activity.logged';

function patternMatches(pattern: string, type: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
    return pattern === type;
}

function matchesFilter(event: HoodyEvent, filter: EventFilter | undefined): boolean {
    if (!filter) return true;
    if (filter.resourceId && event.resource_id !== filter.resourceId) return false;
    if (filter.resourceType && event.resource_type !== filter.resourceType) return false;
    if (filter.projectId
        && event.project_id !== filter.projectId
        && !(event.resource_type === 'project' && event.resource_id === filter.projectId)) return false;
    if (filter.containerId
        && event.container_id !== filter.containerId
        && !(event.resource_type === 'container' && event.resource_id === filter.containerId)) return false;
    if (filter.where && !filter.where(event)) return false;
    return true;
}

function subscriberWants(sub: Subscriber, event: HoodyEvent): boolean {
    let matched = false;
    for (const pattern of sub.patterns) {
        if (!patternMatches(pattern, event.type)) continue;
        // Wildcards leave out ephemeral types unless opted in; naming the
        // type itself always selects it.
        if (event.ephemeral && pattern !== event.type && !sub.includeEphemeral) continue;
        matched = true;
        break;
    }
    return matched && matchesFilter(event, sub.filter);
}

function computeWantsActivity(patterns: readonly string[], includeEphemeral: boolean): boolean {
    return patterns.some((p) => p === ACTIVITY || (includeEphemeral && p !== ACTIVITY && patternMatches(p, ACTIVITY)));
}

export class EventsManager {
    private readonly subscribers = new Set<Subscriber>();
    /** Legacy addEventListener registrations: type → callback → subscriber (same callback once per type). */
    private readonly legacy = new Map<string, Map<EventCallback, Subscriber>>();
    private readonly lifecycleListeners = new Map<string, Set<LifecycleCallback>>();
    private readonly stateListeners = new Set<(event: EventsStateEvent) => void>();
    private readonly holds = new Set<Hold>();
    private welcomeWaiters = new Set<WelcomeWaiter>();

    private state: EventsConnectionState = 'idle';
    private closedBy: 'user' | 'terminal' | null = null;
    private autoConnect = true;
    private autoReconnect = true;
    private debug = false;
    private readonly opts: EventsManagerOptions;

    private attempt: Attempt | null = null;
    private attemptSeq = 0;
    /** Reconnect backoff timer (cancelled by disconnect(), close() and session changes). */
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryAttempt = 0;
    private everWelcomed = false;
    /** Since the last welcome: C5 "re-admit once" and one refresh per admission. */
    private readmitUsed = false;
    private refreshUsed = false;
    private refreshing = false;
    private preparing = false;
    private preparedThisSession = false;
    private boundUserId: string | null = null;
    private pendingAfter: string | undefined;
    private activitySent = false;
    private lastCode: { code: string; at: number; attempt: number } | null = null;
    private catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    private ready: Deferred<void> = deferred<void>();
    /** Bumped by every session reset; async work started under an older value is discarded. */
    private sessionEpoch = 0;
    /** Counts gap notices; bootstrap() restarts when it moves. */
    private gapCount = 0;
    private readonly recovery: EventsRecovery | null;
    /** De-dup for live frames when there is no history (legacy runtime). */
    private readonly liveSeen: EventIdLru;

    constructor(
        private createWsClient: () => Promise<EventsTransport>,
        options?: EventsManagerOptions,
    ) {
        this.opts = options ?? {};
        this.autoConnect = this.opts.autoConnect ?? true;
        this.autoReconnect = this.opts.autoReconnect ?? true;
        this.debug = this.opts.debug ?? false;
        this.pendingAfter = this.opts.after;
        this.recovery = this.opts.history
            ? new EventsRecovery({
                reader: this.opts.history,
                ...(this.opts.maxReplayPages !== undefined ? { maxReplayPages: this.opts.maxReplayPages } : {}),
                ...(this.opts.historyRetryDelayMs ? { retryDelayMs: this.opts.historyRetryDelayMs } : {}),
                deliver: (event) => this.dispatch(event),
                onGap: (reason) => this.onGap(reason),
                onCaughtUp: () => this.onCaughtUp(),
                onTerminal: (code, cause) => this.closeTerminal(new EventsAuthError(code, `Event history refused: ${code}`, { cause })),
                onProgrammingError: (error) => this.closeTerminal(error),
            })
            : null;
        this.liveSeen = this.recovery ? this.recovery.seen : new EventIdLru(10_000);
        this.opts.session?.onBump(() => this.resetSession());
    }

    // ─── Subscriptions ───────────────────────────────────────────────────────

    /**
     * Subscribe `callback` to one or more patterns. Resolves with the
     * unsubscribe function once the connection is admitted (`welcome`), or
     * at once when it already is. Rejects, and unregisters, on a terminal
     * refusal. Patterns are not validated here; EventsClient.on() validates
     * them against the catalog.
     */
    async subscribe(
        patterns: readonly string[],
        callback: EventCallback,
        opts: { filter?: EventFilter; includeEphemeral?: boolean; signal?: AbortSignal } = {},
    ): Promise<() => void> {
        if (this.state === 'closed' && this.closedBy === 'user') throw new EventsClosedError();
        const includeEphemeral = opts.includeEphemeral === true;
        const sub: Subscriber = {
            patterns: [...patterns],
            includeEphemeral,
            wantsActivity: computeWantsActivity(patterns, includeEphemeral),
            filter: opts.filter,
            deliver: callback,
        };
        return this.register(sub, opts.signal, () => this.unregister(sub));
    }

    /**
     * Legacy listener API. The same callback registers once per type; `'*'`
     * also receives `activity.logged` (legacy listeners always did) and opts
     * the socket in to it when it has no filter.
     */
    async addEventListener(eventType: string, callback: EventCallback, filter?: EventFilter): Promise<() => void> {
        if (this.debug) console.log(`[EventsManager] Adding listener for: ${eventType}`);
        let byCallback = this.legacy.get(eventType);
        if (!byCallback) {
            byCallback = new Map();
            this.legacy.set(eventType, byCallback);
        }
        const existing = byCallback.get(callback);
        if (existing) this.subscribers.delete(existing);
        const wildcard = eventType === '*' || eventType.endsWith('.*');
        const sub: Subscriber = {
            patterns: [eventType],
            includeEphemeral: true,
            wantsActivity: eventType === ACTIVITY || (wildcard && !filter && patternMatches(eventType, ACTIVITY)),
            filter,
            deliver: callback,
        };
        byCallback.set(callback, sub);
        const off = () => this.removeEventListener(eventType, callback);
        return this.register(sub, undefined, off);
    }

    private removeEventListener(eventType: string, callback: EventCallback): void {
        if (this.debug) console.log(`[EventsManager] Removing listener for: ${eventType}`);
        const byCallback = this.legacy.get(eventType);
        const sub = byCallback?.get(callback);
        if (!byCallback || !sub) return;
        byCallback.delete(callback);
        if (byCallback.size === 0) this.legacy.delete(eventType);
        this.unregister(sub);
    }

    private async register(sub: Subscriber, signal: AbortSignal | undefined, off: () => void): Promise<() => void> {
        if (signal?.aborted) throw signal.reason ?? new EventsClosedError('Aborted');
        this.subscribers.add(sub);
        this.syncActivity();
        let onAbort: (() => void) | undefined;
        if (signal) {
            onAbort = () => off();
            signal.addEventListener('abort', onAbort, { once: true });
        }
        const unsubscribe = () => {
            if (signal && onAbort) signal.removeEventListener('abort', onAbort);
            off();
        };
        try {
            await this.awaitAdmission();
        } catch (error) {
            unsubscribe();
            throw error;
        }
        return unsubscribe;
    }

    private unregister(sub: Subscriber): void {
        if (!this.subscribers.delete(sub)) return;
        this.syncActivity();
        this.releaseIfIdle();
    }

    /** Resolve once the connection is admitted; start it when needed. */
    private awaitAdmission(): Promise<void> {
        // Legacy autoConnect:false: subscribe() returns without waiting.
        if (!this.autoConnect && !this.attempt && this.state !== 'closed') return Promise.resolve();
        return this.awaitWelcome();
    }

    /**
     * Resolve at an actual welcome, whatever autoConnect says: reads that
     * must follow admission (the after-replay) cannot take the legacy
     * shortcut, or they read before the boundary exists.
     */
    private awaitWelcome(): Promise<void> {
        if (this.attempt?.welcomed) return Promise.resolve();
        if (this.state === 'closed') {
            return Promise.reject(this.closedBy === 'user' ? new EventsClosedError() : new EventsClosedError('Events stream closed after a terminal refusal'));
        }
        return new Promise<void>((resolve, reject) => {
            this.welcomeWaiters.add({ resolve, reject });
            this.ensureStarted();
        });
    }

    addLifecycleListener(event: string, callback: LifecycleCallback): () => void {
        let set = this.lifecycleListeners.get(event);
        if (!set) {
            set = new Set();
            this.lifecycleListeners.set(event, set);
        }
        set.add(callback);
        return () => { this.lifecycleListeners.get(event)?.delete(callback); };
    }

    /** Observe state changes, gaps, `scope_changed` and non-fatal notices. */
    onState(listener: (event: EventsStateEvent) => void): () => void {
        this.stateListeners.add(listener);
        return () => { this.stateListeners.delete(listener); };
    }

    // ─── ready / waits / streams ─────────────────────────────────────────────

    /**
     * Resolves at the first catch-up of this session that ends with
     * `has_more:false`; for a runtime without history, at `welcome`.
     * Starts the connection when needed and holds it open while waiting.
     */
    whenReady(opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<void> {
        if (this.state === 'closed' && this.closedBy === 'user') return Promise.reject(new EventsClosedError());
        if (this.ready.settled) return this.ready.promise;
        const ready = this.ready;
        return this.withHold(opts, (fail) => {
            ready.promise.then(() => fail(null), (error) => fail(error));
        });
    }

    /**
     * Run `body` under a hold: the connection stays open until the returned
     * promise settles. `body` calls `settle(null | error)`; resolution value
     * comes from `result`.
     */
    private withHold<T = void>(
        opts: { signal?: AbortSignal; timeoutMs?: number },
        body: (settle: (error: unknown | null, value?: T) => void, onEnd: (fn: () => void) => void) => void,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let done = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const enders: Array<() => void> = [];
            const cleanup = () => {
                done = true;
                if (timer) clearTimeout(timer);
                if (opts.signal && onAbort) opts.signal.removeEventListener('abort', onAbort);
                for (const fn of enders) { try { fn(); } catch { /* best effort */ } }
                this.holds.delete(hold);
                this.releaseIfIdle();
            };
            const settle = (error: unknown | null, value?: T) => {
                if (done) return;
                cleanup();
                if (error) reject(error);
                else resolve(value as T);
            };
            const hold: Hold = { fail: (e) => settle(e), finish: (e) => settle(e) };
            const onAbort = opts.signal ? () => settle(opts.signal!.reason ?? new EventsClosedError('Aborted')) : undefined;
            if (opts.signal?.aborted) {
                reject(opts.signal.reason ?? new EventsClosedError('Aborted'));
                return;
            }
            if (opts.signal && onAbort) opts.signal.addEventListener('abort', onAbort, { once: true });
            if (opts.timeoutMs !== undefined && opts.timeoutMs > 0) {
                timer = setTimeout(() => settle(new EventsTimeoutError()), opts.timeoutMs);
            }
            this.holds.add(hold);
            body(settle, (fn) => { enders.push(fn); });
            if (!done) this.ensureStarted();
        });
    }

    /**
     * Wait for the first event matching `patterns` and `filter`.
     *
     * The subscription exists before anything else happens. `action`, when
     * given, runs only after `ready()`: the history boundary then already
     * lies before the action, so its event is delivered live or replayed,
     * never lost to a cold start.
     */
    waitFor(
        patterns: readonly string[],
        filter: EventFilter | undefined,
        action: (() => unknown) | undefined,
        opts: { signal?: AbortSignal; timeoutMs?: number; includeEphemeral?: boolean } = {},
    ): Promise<HoodyEvent> {
        if (this.state === 'closed' && this.closedBy === 'user') return Promise.reject(new EventsClosedError());
        return this.withHold<HoodyEvent>(opts, (settle, onEnd) => {
            const sub: Subscriber = {
                patterns: [...patterns],
                includeEphemeral: opts.includeEphemeral === true,
                wantsActivity: computeWantsActivity(patterns, opts.includeEphemeral === true),
                filter,
                deliver: (event) => settle(null, event),
            };
            // However the wait ends (event, timeout, abort, close, session
            // change), the subscriber goes with it.
            onEnd(() => this.unregister(sub));
            this.subscribers.add(sub);
            this.syncActivity();
            this.ready.promise.then(async () => {
                if (!action) return;
                try {
                    await action();
                } catch (error) {
                    settle(error);
                }
            }, (error) => settle(error));
        });
    }

    /**
     * Subscribe now, resolve after `ready()` with `{ result }`: act between the
     * two, then await `result` (`prepareWait`).
     */
    async prepareWait(
        patterns: readonly string[],
        filter: EventFilter | undefined,
        opts: { signal?: AbortSignal; timeoutMs?: number; includeEphemeral?: boolean } = {},
    ): Promise<{ result: Promise<HoodyEvent> }> {
        const result = this.waitFor(patterns, filter, undefined, opts);
        result.catch(() => {});
        // The subscription exists before ready(); once ready() resolves the
        // boundary lies behind the caller's next action. A result that
        // arrives (or fails) first settles this too.
        await Promise.race([this.whenReady(opts.signal ? { signal: opts.signal } : {}), result.then(() => {})]);
        return { result };
    }

    /**
     * Events as an async iterator, bounded by bytes (default 8 MiB). When the
     * bound is hit the oldest buffered events are dropped and a gap is
     * recorded; with `onGap: 'throw'` the iterator throws EventsGapError on
     * that and on any stream-wide gap instead.
     */
    stream(
        patterns: readonly string[],
        opts: {
            filter?: EventFilter;
            after?: string;
            signal?: AbortSignal;
            maxBytes?: number;
            includeEphemeral?: boolean;
            onGap?: 'continue' | 'throw';
        } = {},
    ): AsyncIterableIterator<HoodyStreamEvent> {
        const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
        const throwOnGap = opts.onGap === 'throw';
        // `gap`: a loss right before this entry, yielded as its gap_before.
        // `resume`: the entry's resume_after, captured when it was delivered.
        type Entry = { event: HoodyEvent; bytes: number; resume: string | null; gap?: EventsStreamGap };
        const queue: Entry[] = [];
        let queuedBytes = 0;
        // A mark still waiting for the consumer (queued or pending).
        let unreadMark = false;
        // A loss with no queued event to carry it yet: the next push takes it.
        let pendingGap: EventsStreamGap | null = null;
        /** Fold two marks: a history gap outranks overflow; buffer drops add up. */
        const mergeGap = (a: EventsStreamGap | undefined | null, b: EventsStreamGap): EventsStreamGap => {
            if (!a) return b;
            const reason = a.reason !== 'overflow' ? a.reason : b.reason;
            const dropped = a.dropped === undefined && b.dropped === undefined ? undefined : (a.dropped ?? 0) + (b.dropped ?? 0);
            return dropped === undefined ? { reason } : { reason, dropped };
        };
        /**
         * Put a loss in-band on the next event the consumer will read: the
         * queue head, or, when nothing is queued, the next event pushed.
         */
        const markGap = (gap: EventsStreamGap) => {
            unreadMark = true;
            const head = queue[0];
            if (head) head.gap = mergeGap(head.gap, gap);
            else pendingGap = mergeGap(pendingGap, gap);
        };
        /** A loss of this stream only (buffer or `after` replay): notice + mark, or end in throw mode. */
        const localGap = (reason: EventsGapReason, dropped?: number, message?: string) => {
            const notify = !unreadMark || throwOnGap;
            markGap(dropped === undefined ? { reason } : { reason, dropped });
            if (notify) {
                const total = queue[0]?.gap?.dropped ?? pendingGap?.dropped;
                this.emitState(total === undefined ? { kind: 'gap', reason, stream: true } : { kind: 'gap', reason, stream: true, dropped: total });
            }
            if (throwOnGap) end(new EventsGapError(reason, message));
        };
        let waiter: Deferred<void> | null = null;
        let ended: { error: unknown | null } | null = null;
        const seen = new EventIdLru((this.recovery?.maxReplayPages ?? 20) * 500);
        const wake = () => { const w = waiter; waiter = null; w?.resolve(); };
        const end = (error: unknown | null) => {
            if (ended) return;
            ended = { error };
            teardown();
            wake();
        };
        const sizeOf = (event: HoodyEvent) => {
            try { return JSON.stringify(event).length; } catch { return 1024; }
        };
        const enqueue = (event: HoodyEvent, resume: string | null) => {
            if (ended) return;
            if (!event.ephemeral && !seen.add(event.id)) return;
            const bytes = sizeOf(event);
            const entry: Entry = { event, bytes, resume };
            if (pendingGap) { entry.gap = pendingGap; pendingGap = null; }
            queue.push(entry);
            queuedBytes += bytes;
            // Over the bound: drop the oldest, keep the newest. A persisted
            // loss is a gap; losing an ephemeral event never is.
            let lost = 0;
            let carried: EventsStreamGap | undefined;
            while (queuedBytes > maxBytes && queue.length > 1) {
                const oldest = queue.shift()!;
                queuedBytes -= oldest.bytes;
                // A dropped entry's own mark moves on to the new head.
                if (oldest.gap) carried = mergeGap(carried, oldest.gap);
                if (!oldest.event.ephemeral) lost++;
            }
            const head = queue[0];
            if (carried && head) head.gap = mergeGap(head.gap, carried);
            if (lost > 0) {
                // One gap notice per unbroken loss: until the consumer reads
                // the marked event, further drops only add to its count.
                localGap('overflow', lost, 'stream() buffer overflowed its byte bound');
                if (ended) return;
            }
            wake();
        };
        // stream({after}) (Opus F3a): while the replay reads history, live and
        // runtime deliveries wait here, so the consumer sees history in
        // order first, then what arrived meanwhile (the id set drops what the
        // replay already yielded). Bounded like the queue.
        let replaying = opts.after !== undefined && this.opts.history !== undefined;
        const held: Array<{ event: HoodyEvent; resume: string | null; bytes: number }> = [];
        let heldBytes = 0;
        const endReplay = () => {
            if (!replaying) return;
            replaying = false;
            const items = held.splice(0);
            heldBytes = 0;
            for (const h of items) enqueue(h.event, h.resume);
        };
        /**
         * A runtime delivery (live frame or recovery page). Its resume_after
         * is the recovery's confirmed cursor NOW, before any later page
         * moves it (Opus F3b): every event at or before that cursor has
         * already been delivered to this stream, so resuming from it after
         * this event is at-least-once, never a skip, even when frame N was
         * lost and N+1 arrived live first.
         */
        const push = (event: HoodyEvent) => {
            if (ended) return;
            const resume = this.recovery?.confirmed ?? null;
            if (!replaying) { enqueue(event, resume); return; }
            const bytes = sizeOf(event);
            held.push({ event, resume, bytes });
            heldBytes += bytes;
            let lost = 0;
            while (heldBytes > maxBytes && held.length > 1) {
                const oldest = held.shift()!;
                heldBytes -= oldest.bytes;
                if (!oldest.event.ephemeral) lost++;
            }
            if (lost > 0) localGap('overflow', lost, 'stream() buffer overflowed its byte bound during the after replay');
        };
        const sub: Subscriber = {
            patterns: [...patterns],
            includeEphemeral: opts.includeEphemeral === true,
            wantsActivity: computeWantsActivity(patterns, opts.includeEphemeral === true),
            filter: opts.filter,
            deliver: push,
        };
        const hold: Hold = {
            fail: (error) => end(error),
            // close(): the iterator simply ends.
            finish: () => end(null),
        };
        const offGap = this.onState((e) => {
            // Another stream's local gap is its own loss, not this stream's.
            if (e.kind !== 'gap' || e.stream) return;
            // A runtime gap (recovery resumed from the boundary) is a loss
            // for this stream too: end, or mark it in-band. The runtime has
            // already sent the onState notice.
            if (throwOnGap) end(new EventsGapError(e.reason));
            else markGap({ reason: e.reason });
        });
        const onAbort = () => end(null);
        // Ends the after-replay with the stream (a read or a retry wait in flight).
        const replayAbort = new AbortController();
        const teardown = () => {
            replayAbort.abort();
            offGap();
            opts.signal?.removeEventListener('abort', onAbort);
            this.holds.delete(hold);
            this.unregister(sub);
        };
        if (this.state === 'closed' && this.closedBy === 'user') {
            ended = { error: new EventsClosedError() };
        } else if (opts.signal?.aborted) {
            ended = { error: null };
        } else {
            opts.signal?.addEventListener('abort', onAbort, { once: true });
            this.holds.add(hold);
            this.subscribers.add(sub);
            this.syncActivity();
            this.ensureStarted();
            if (opts.after !== undefined && !this.opts.history) {
                // No history to read from: `after` cannot be honoured, and
                // ignoring it would silently skip everything since it.
                localGap('cursor_invalid', undefined, 'stream({after}) needs event history, and this server has none');
            } else if (opts.after !== undefined) {
                void this.replayInto(opts.after, sub, replayAbort.signal, () => ended !== null, (error) => end(error), (reason) => {
                    // This stream's own `after` could not be honoured; the
                    // runtime as a whole is fine, so the gap stays local.
                    if (!ended) localGap(reason);
                }, enqueue).finally(endReplay);
            }
        }
        const iterator: AsyncIterableIterator<HoodyStreamEvent> = {
            next: async (): Promise<IteratorResult<HoodyStreamEvent>> => {
                while (true) {
                    const head = queue.shift();
                    if (head) {
                        queuedBytes -= head.bytes;
                        // A copy: the event object is shared with other subscribers.
                        const value = { ...head.event, resume_after: head.resume } as HoodyStreamEvent;
                        if (!head.gap) return { value, done: false };
                        unreadMark = pendingGap !== null || queue.some((q) => q.gap);
                        return { value: { ...value, gap_before: head.gap }, done: false };
                    }
                    if (ended) {
                        if (ended.error) {
                            const error = ended.error;
                            ended = { error: null };
                            throw error;
                        }
                        return { value: undefined, done: true };
                    }
                    waiter = deferred<void>();
                    await waiter.promise;
                }
            },
            return: async (): Promise<IteratorResult<HoodyStreamEvent>> => {
                end(null);
                queue.length = 0;
                return { value: undefined, done: true };
            },
            [Symbol.asyncIterator]() { return iterator; },
        };
        return iterator;
    }

    /**
     * stream({after}): read history from `after` into one subscriber until
     * `has_more:false`, alongside live delivery. The subscriber's own id set
     * removes the overlap.
     */
    private async replayInto(
        after: string,
        sub: Subscriber,
        signal: AbortSignal,
        isEnded: () => boolean,
        fail: (e: unknown) => void,
        gap: (reason: EventsGapReason) => void,
        deliver: (event: HoodyEvent, resumeAfter: string) => void,
    ): Promise<void> {
        const reader = this.opts.history;
        if (!reader) return;
        const epoch = this.sessionEpoch;
        // Read only after the welcome. The replay stops at the fence of its
        // last page; read before admission, a row committed between that page
        // and the welcome is behind the welcome's boundary (so recovery never
        // reads it) and was sent before the socket registered (so it never
        // came live): lost with no gap (SDK-3). After the welcome, the last
        // page's fence is at or past the boundary, and every later row is
        // sent live or read by recovery.
        try {
            await this.awaitWelcome();
        } catch {
            return; // Closed or refused: the stream's hold ends it.
        }
        if (isEnded() || epoch !== this.sessionEpoch) return;
        let cursor = after;
        const maxPages = this.recovery?.maxReplayPages ?? 20;
        const stale = () => isEnded() || signal.aborted || epoch !== this.sessionEpoch;
        let retries = 0;
        try {
            for (let pages = 0; pages < maxPages; pages++) {
                let page: Awaited<ReturnType<EventsHistoryReader['page']>>;
                while (true) {
                    try {
                        page = await reader.page(cursor, 500, signal);
                        break;
                    } catch (error) {
                        if (stale()) return;
                        const action = historyActionOf(error);
                        // A transient failure (5xx, network) or a 429 is not the
                        // end of the stream: wait as recovery does
                        // and read the same page again. Only terminal and
                        // programming errors end it; cursor codes are gaps.
                        if (action.kind !== 'retry' && action.kind !== 'backoff') throw error;
                        const floor = action.kind === 'backoff' ? HISTORY_BACKOFF_FLOOR_MS : 0;
                        const delay = this.recovery?.retryDelay(retries++, floor) ?? Math.max(floor, 1000);
                        this.emitState({
                            kind: 'notice',
                            code: 'EVENTS_HISTORY_RETRY',
                            message: `event history read failed (${errorCodeOf(error)}); retrying in ${delay} ms`,
                            attempt: retries,
                            delayMs: delay,
                        });
                        await abortableSleep(delay, signal);
                        if (stale()) return;
                    }
                }
                retries = 0;
                if (stale()) return;
                for (const item of page.events) {
                    const event = toHoodyEvent(item, true);
                    // resume_after = the cursor this page was read from: every
                    // row at or before it was yielded before this page.
                    if (event && !event.ephemeral && subscriberWants(sub, event)) deliver(event, cursor);
                }
                cursor = page.next_cursor;
                if (!page.has_more) return;
            }
            gap('overflow');
        } catch (error) {
            if (stale()) return;
            const action = historyActionOf(error);
            if (action.kind === 'gap') gap(action.reason);
            else fail(error);
        }
    }

    /**
     * §5 bootstrap: wait for `ready()`, take the snapshot, and report
     * every resource that events touched while the snapshot was being read,
     * so the caller refetches those through GET. Event payloads are never
     * applied over a snapshot. A gap while reading restarts the whole
     * bootstrap, at most 3 times; the fourth raises EventsGapError.
     */
    async bootstrap<S>(
        readFn: () => Promise<S> | S,
        opts: { signal?: AbortSignal; timeoutMs?: number } = {},
    ): Promise<{ snapshot: S; touched: Array<{ resource_type: string; resource_id: string }> }> {
        if (this.state === 'closed' && this.closedBy === 'user') throw new EventsClosedError();
        // Hold the connection for the whole body. Used alone,
        // bootstrap's only demand would be whenReady()'s own hold, which ends
        // when ready() resolves: the socket closed before readFn ran, and a
        // change committed during the read touched nothing.
        let holdError: unknown = null;
        const hold: Hold = { fail: (e) => { holdError ??= e; }, finish: (e) => { holdError ??= e; } };
        this.holds.add(hold);
        try {
            return await this.bootstrapHeld(readFn, opts, () => holdError);
        } finally {
            this.holds.delete(hold);
            this.releaseIfIdle();
        }
    }

    private async bootstrapHeld<S>(
        readFn: () => Promise<S> | S,
        opts: { signal?: AbortSignal; timeoutMs?: number },
        ended: () => unknown,
    ): Promise<{ snapshot: S; touched: Array<{ resource_type: string; resource_id: string }> }> {
        let lastReason: EventsGapReason = 'overflow';
        for (let attempt = 0; attempt < 4; attempt++) {
            await this.whenReady(opts);
            const touched = new Map<string, { resource_type: string; resource_id: string }>();
            const gapsBefore = this.gapCount;
            const offGap = this.onState((e) => { if (e.kind === 'gap' && !e.stream) lastReason = e.reason; });
            const sub: Subscriber = {
                patterns: ['*'],
                includeEphemeral: false,
                wantsActivity: false,
                filter: undefined,
                deliver: (event) => {
                    touched.set(`${event.resource_type}\u0000${event.resource_id}`, {
                        resource_type: event.resource_type,
                        resource_id: event.resource_id,
                    });
                },
            };
            this.subscribers.add(sub);
            try {
                const snapshot = await readFn();
                // A session change or close during the read: the touched set
                // belongs to a stream that no longer exists.
                if (ended()) throw ended();
                // Events already in flight for the snapshot's window land via
                // the next catch-up; waiting for it closes the window.
                await this.settleCatchUp();
                if (ended()) throw ended();
                if (this.gapCount === gapsBefore) {
                    return { snapshot, touched: [...touched.values()] };
                }
            } finally {
                offGap();
                this.unregister(sub);
            }
        }
        throw new EventsGapError(lastReason, 'bootstrap() restarted 3 times after gaps and gave up');
    }

    /** Run one catch-up to its end (no-op without history). */
    private async settleCatchUp(): Promise<void> {
        if (!this.recovery || this.recovery.confirmed === null) return;
        await this.recovery.trigger();
    }

    // ─── Connection ──────────────────────────────────────────────────────────

    private demand(): number {
        return this.subscribers.size + this.holds.size;
    }

    private ensureStarted(): void {
        if (this.state === 'closed') return;
        if (this.attempt || this.retryTimer || this.refreshing || this.preparing) return;
        if (!(this.opts.hasCredential?.() ?? true)) {
            const prepare = this.opts.prepareCredential;
            if (prepare && !this.preparedThisSession) {
                // A client built with credentials logs in lazily; its login
                // starts the session, whose bump reconnects from resetSession().
                this.preparedThisSession = true;
                this.preparing = true;
                void Promise.resolve()
                    .then(() => prepare())
                    .catch(() => undefined)
                    .finally(() => {
                        this.preparing = false;
                        // The login's own bump reset the session meanwhile
                        // (resetSessionState clears the flag). This prepare
                        // is still the one for that session: without this, a
                        // failing login would bump, prepare again, forever.
                        this.preparedThisSession = true;
                        // Connect now, whatever the epoch: the bump from the
                        // login arrived while `preparing` blocked its own
                        // ensureStarted. With no credential still,
                        // this ends in MISSING_TOKEN, not a hang.
                        if (this.state !== 'closed' && this.demand() > 0) this.ensureStarted();
                    });
                return;
            }
            // Nothing to connect with (logged out): say so instead of leaving
            // callers waiting. A new session reopens the stream.
            this.closeTerminal(new EventsAuthError('MISSING_TOKEN', 'No access token: log in (or adopt a session) to use the events stream'));
            return;
        }
        void this.connect();
    }

    private releaseIfIdle(): void {
        if (this.demand() > 0 || this.state === 'closed') return;
        if (this.attempt || this.retryTimer || this.state !== 'idle') this.disconnect();
    }

    private async connect(): Promise<void> {
        const attempt: Attempt = {
            id: ++this.attemptSeq,
            ws: null,
            welcomed: false,
            dead: false,
            preWelcome: [],
            welcomeTimer: null,
            unsubscribers: [],
            tickReconciled: null,
        };
        this.attempt = attempt;
        this.activitySent = false;
        this.setState('connecting');
        this.emitLifecycle('connecting');
        if (this.debug) console.log('[EventsManager] Connecting to event stream...');
        let ws: EventsTransport;
        try {
            ws = await this.createWsClient();
        } catch (error) {
            if (attempt.dead) return;
            this.transportLost(attempt, error);
            return;
        }
        if (attempt.dead) {
            // Nothing is attached yet; listeners still go first, as on every
            // teardown path, so no close event can reach the manager.
            try { ws.removeAllListeners(); } catch { /* best effort */ }
            try { ws.disconnect('superseded'); } catch { /* best effort */ }
            return;
        }
        attempt.ws = ws;
        try {
            attempt.unsubscribers.push(ws.onFrame((frame) => this.onFrame(attempt, frame)));
            attempt.unsubscribers.push(ws.onSocketError((frame) => this.onCode(attempt, frame.error, frame.message, 'error')));
            attempt.unsubscribers.push(ws.onClose((reason) => {
                if (!attempt.dead) this.transportLost(attempt, new EventsError('EVENTS_DISCONNECTED', `Events socket closed: ${reason}`));
            }));
            await ws.connect();
        } catch (error) {
            if (!attempt.dead) this.transportLost(attempt, error);
            return;
        }
        if (attempt.dead) return;
        // Admission is the welcome, not the connect.
        attempt.welcomeTimer = setTimeout(() => {
            if (!attempt.dead && !attempt.welcomed) {
                this.transportLost(attempt, new EventsError('EVENTS_WELCOME_TIMEOUT', 'No welcome from the events server'));
            }
        }, this.opts.welcomeTimeoutMs ?? 10_000);
    }

    private onFrame(attempt: Attempt, frame: ServerFrame): void {
        if (attempt.dead || attempt !== this.attempt) return;
        switch (frame.type) {
            case 'event':
                if (!attempt.welcomed) {
                    // Buffering starts at connect: an event may be sent
                    // between registration and the welcome.
                    attempt.preWelcome.push(frame);
                    return;
                }
                this.onLiveEvent(frame);
                return;
            case 'welcome':
                this.onWelcome(attempt, frame);
                return;
            case 'tick':
                if (this.recovery && attempt.welcomed && this.recovery.confirmed !== null
                    && typeof frame.latest_cursor === 'string'
                    && frame.latest_cursor !== this.recovery.lastLatest
                    && frame.latest_cursor !== attempt.tickReconciled) {
                    // History has rows this socket may not have delivered.
                    // A tick value is caught up against once: if the page
                    // then reports another latest, the same tick repeated must
                    // not start a catch-up every 30 s forever. Recovery retries
                    // a failed catch-up itself.
                    attempt.tickReconciled = frame.latest_cursor;
                    this.recovery.lastLatest = frame.latest_cursor;
                    void this.recovery.trigger();
                }
                return;
            case 'error':
                this.onCode(attempt, frame.error, frame.message, 'message');
                return;
            case 'revoked':
                this.onCode(attempt, frame.reason, frame.message, 'message');
                return;
            case 'scope_changed':
                this.emitState({ kind: 'scope_changed', projectId: frame.project_id, reason: frame.reason });
                try { this.opts.onScopeChanged?.(frame.project_id); } catch { /* the hook must not break the stream */ }
                return;
            case 'activity_subscribed':
            case 'pong':
            default:
                return;
        }
    }

    private onWelcome(attempt: Attempt, frame: WelcomeFrame): void {
        if (attempt.welcomed) return;
        if (attempt.welcomeTimer) { clearTimeout(attempt.welcomeTimer); attempt.welcomeTimer = null; }
        const expectedRealm = this.opts.realmId;
        if (expectedRealm && (frame.realmId ?? null) !== expectedRealm) {
            this.closeTerminal(new EventsAuthError('REALM_MISMATCH',
                `The events server admitted realm ${frame.realmId ?? 'none'}, not ${expectedRealm}`));
            return;
        }
        if (this.boundUserId !== null && frame.userId !== this.boundUserId) {
            // Another account answered: nothing of the previous one may carry
            // over. This connection belongs to the new account, so it
            // stays; everything else goes.
            this.resetSessionState(new EventsSessionChangedError(), true);
        }
        this.boundUserId = typeof frame.userId === 'string' ? frame.userId : null;
        attempt.welcomed = true;
        this.readmitUsed = false;
        this.refreshUsed = false;
        this.retryAttempt = 0;
        const reconnected = this.everWelcomed;
        this.everWelcomed = true;

        const waiters = this.welcomeWaiters;
        this.welcomeWaiters = new Set();
        for (const w of waiters) w.resolve();

        this.emitLifecycle('connected');
        if (reconnected) this.emitLifecycle('reconnected', attempt.id);
        this.syncActivity();

        const recovery = this.recovery;
        if (recovery && typeof frame.boundary_cursor === 'string') {
            if (recovery.confirmed === null) {
                // First connect of the session: resume from the caller's cursor
                // if it gave one, else from the scope's boundary.
                recovery.confirmed = this.pendingAfter ?? frame.boundary_cursor;
                this.pendingAfter = undefined;
            }
            if (typeof frame.latest_cursor === 'string') recovery.lastLatest = frame.latest_cursor;
            this.setState('recovering');
            this.flushPreWelcome(attempt);
            void recovery.trigger();
        } else {
            // A server without cursors: live delivery only.
            this.setState('live');
            this.flushPreWelcome(attempt);
            this.markReady();
        }
    }

    private flushPreWelcome(attempt: Attempt): void {
        const frames = attempt.preWelcome;
        attempt.preWelcome = [];
        for (const frame of frames) {
            if (attempt.dead || attempt !== this.attempt) return;
            this.onLiveEvent(frame);
        }
    }

    private onLiveEvent(frame: EventWireFrame): void {
        const event = toHoodyEvent(frame, false);
        if (!event) return;
        if (!event.ephemeral) {
            // Live frames are de-duplicated by id against everything already
            // delivered, live or replayed.
            if (!this.liveSeen.add(event.id)) return;
            this.scheduleCatchUp();
        }
        this.dispatch(event);
    }

    /**
     * A catch-up 1–3 s after a new persisted live frame: the frame may be one
     * of several, and the ones before it may never have come.
     * Coalesced: while one is pending, later frames ride on it, so a busy
     * stream reads history at most once per delay instead of never (a
     * debounce that restarts on every frame would starve).
     */
    private scheduleCatchUp(): void {
        if (!this.recovery || this.recovery.confirmed === null) return;
        if (this.catchUpTimer) return;
        const min = this.opts.catchUpDelay?.minMs ?? 1000;
        const max = Math.max(min, this.opts.catchUpDelay?.maxMs ?? 3000);
        const delay = Math.round(min + (this.opts.random ?? Math.random)() * (max - min));
        const epoch = this.sessionEpoch;
        this.catchUpTimer = setTimeout(() => {
            this.catchUpTimer = null;
            if (epoch === this.sessionEpoch) void this.recovery?.trigger();
        }, delay);
    }

    /** A code from an `error`/`revoked` frame or the socket `error` event. */
    private onCode(attempt: Attempt, code: string, message: string | undefined, _channel: 'message' | 'error'): void {
        if (attempt.dead || attempt !== this.attempt) return;
        // The same refusal arrives on both channels for one release; act once.
        // Only within one attempt: the same code on the NEXT attempt is a new
        // refusal (a second TOKEN_AUTH_CHANGED must end the re-admission).
        const now = Date.now();
        if (this.lastCode && this.lastCode.attempt === attempt.id && this.lastCode.code === code
            && now - this.lastCode.at < CODE_DEDUPE_MS) return;
        this.lastCode = { code, at: now, attempt: attempt.id };
        const action = socketActionFor(code);
        if (this.debug) console.log(`[EventsManager] ${code} → ${action}`);
        switch (action) {
            case 'nonfatal':
                this.emitState(message === undefined ? { kind: 'notice', code } : { kind: 'notice', code, message });
                return;
            case 'terminal':
                this.closeTerminal(new EventsAuthError(code, message));
                return;
            case 'refresh':
                this.dropAttempt(attempt, 'refresh');
                void this.refreshAndReconnect(code, message);
                return;
            case 'backoff':
                this.dropAttempt(attempt, 'backoff');
                this.scheduleReconnect(new EventsError(code, message || code), 5000);
                return;
            case 'readmit':
            default:
                this.dropAttempt(attempt, 'readmit');
                if (this.readmitUsed) {
                    // Refused again before an admission: C5 allows one re-admission.
                    this.closeTerminal(new EventsAuthError(code, message));
                    return;
                }
                this.readmitUsed = true;
                this.scheduleReconnect(new EventsError(code, message || code), 0, true);
                return;
        }
    }

    private async refreshAndReconnect(code: string, message: string | undefined): Promise<void> {
        const epoch = this.sessionEpoch;
        if (this.refreshUsed || !this.opts.refreshToken) {
            this.closeTerminal(new EventsAuthError(code, message));
            return;
        }
        this.refreshUsed = true;
        this.setState('offline');
        let token: string | undefined;
        // No connect may start with the expired token while this runs.
        this.refreshing = true;
        try {
            token = await this.opts.refreshToken();
        } catch {
            token = undefined;
        } finally {
            this.refreshing = false;
        }
        if (epoch !== this.sessionEpoch || this.state === 'closed') return;
        if (!token) {
            this.closeTerminal(new EventsAuthError(code, message || 'The access token expired and could not be refreshed'));
            return;
        }
        this.scheduleReconnect(new EventsError(code, message || code), 0, true);
    }

    /** Transport loss: connect_error, close, welcome timeout, factory failure. */
    private transportLost(attempt: Attempt, error: unknown): void {
        if (attempt !== this.attempt) return;
        const wasWelcomed = attempt.welcomed;
        this.dropAttempt(attempt, 'lost');
        this.emitLifecycle('disconnected', 1006, error instanceof Error ? error.message : String(error));
        if (!wasWelcomed) this.emitLifecycle('error', error instanceof Error ? error : new Error(String(error)));
        if (this.state === 'closed') return;
        if (!this.autoReconnect || this.demand() === 0) {
            // Nobody retries: callers still waiting for an admission get the error.
            const waiters = this.welcomeWaiters;
            this.welcomeWaiters = new Set();
            for (const w of waiters) w.reject(error);
            this.setState('idle');
            return;
        }
        this.scheduleReconnect(error instanceof EventsError ? error : new EventsError('EVENTS_DISCONNECTED', String((error as Error)?.message ?? error)), 0);
    }

    private scheduleReconnect(reason: EventsError, floorMs: number, immediate = false): void {
        if (this.state === 'closed') return;
        if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
        const initial = this.opts.backoff?.initialMs ?? 1000;
        const max = this.opts.backoff?.maxMs ?? 30_000;
        let delay = 0;
        if (!immediate) {
            const ceiling = Math.min(max, initial * 2 ** Math.min(this.retryAttempt, 16));
            const random = this.opts.random ?? Math.random;
            // Equal jitter: at least half the step, so a fleet never lines up.
            delay = Math.max(floorMs, Math.round(ceiling / 2 + random() * (ceiling / 2)));
            this.retryAttempt++;
        }
        this.setState('offline', reason, delay);
        this.emitLifecycle('reconnecting', this.retryAttempt);
        const epoch = this.sessionEpoch;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (epoch !== this.sessionEpoch || this.state === 'closed') return;
            if (this.demand() === 0 && this.welcomeWaiters.size === 0) {
                this.setState('idle');
                return;
            }
            void this.connect();
        }, delay);
    }

    /** Detach and close one attempt's socket. */
    private dropAttempt(attempt: Attempt, reason: string): void {
        attempt.dead = true;
        if (attempt.welcomeTimer) { clearTimeout(attempt.welcomeTimer); attempt.welcomeTimer = null; }
        for (const off of attempt.unsubscribers) { try { off(); } catch { /* best effort */ } }
        attempt.unsubscribers = [];
        attempt.preWelcome = [];
        const ws = attempt.ws;
        attempt.ws = null;
        if (ws) {
            try { ws.removeAllListeners(); } catch { /* best effort */ }
            try { ws.disconnect(reason); } catch { /* best effort */ }
        }
        if (this.attempt === attempt) this.attempt = null;
    }

    /** Opt the socket in to or out of activity to match the subscribers. */
    private syncActivity(): void {
        const attempt = this.attempt;
        if (!attempt?.welcomed || !attempt.ws) return;
        let wanted = false;
        for (const sub of this.subscribers) if (sub.wantsActivity) { wanted = true; break; }
        if (wanted === this.activitySent) return;
        this.activitySent = wanted;
        // E-8: the existing subscribe/unsubscribe handler, dispatched on
        // `type`. activitySent is reset per connection, so an opt-in is sent
        // after every welcome and an opt-out only to a socket that opted in.
        try { attempt.ws.emit(wanted ? 'subscribe' : 'unsubscribe', { type: 'activity' }); } catch { /* the next welcome resends */ }
    }

    // ─── Recovery callbacks ──────────────────────────────────────────────────

    private onGap(reason: EventsGapReason): void {
        this.gapCount++;
        this.emitState({ kind: 'gap', reason });
    }

    private onCaughtUp(): void {
        if (this.attempt?.welcomed && this.state === 'recovering') this.setState('live');
        this.markReady();
    }

    private markReady(): void {
        this.ready.resolve();
    }

    // ─── Dispatch ────────────────────────────────────────────────────────────

    private dispatch(event: HoodyEvent): void {
        if (this.debug) console.log(`[EventsManager] Event: ${event.type}${event.replayed ? ' (replayed)' : ''}`);
        // Snapshot: a callback may unsubscribe itself or others.
        for (const sub of [...this.subscribers]) {
            if (!this.subscribers.has(sub)) continue;
            let wants: boolean;
            try { wants = subscriberWants(sub, event); } catch { wants = false; }
            if (!wants) continue;
            try {
                sub.deliver(event);
            } catch (error) {
                if (this.opts.onListenerError) {
                    try { this.opts.onListenerError(error, event); } catch { /* ignore */ }
                } else if (this.debug) {
                    console.error(`[EventsManager] listener for ${event.type} threw:`, error);
                }
            }
        }
    }

    private setState(state: EventsConnectionState, error?: EventsError, retryInMs?: number): void {
        const previous = this.state;
        if (previous === state && !error) return;
        this.state = state;
        this.emitState({ kind: 'state', state, previous, ...(error ? { error } : {}), ...(retryInMs !== undefined ? { retryInMs } : {}) });
    }

    private emitState(event: EventsStateEvent): void {
        for (const listener of [...this.stateListeners]) {
            try { listener(event); } catch { /* isolation */ }
        }
    }

    private emitLifecycle(event: string, ...args: any[]): void {
        const set = this.lifecycleListeners.get(event);
        if (!set) return;
        for (const callback of [...set]) {
            try { callback(...args); } catch { /* isolation */ }
        }
    }

    // ─── Teardown ────────────────────────────────────────────────────────────

    /** A terminal refusal: closed until the session changes. */
    private closeTerminal(error: EventsError): void {
        if (this.state === 'closed') return;
        this.teardownConnection('terminal');
        this.recovery?.stop();
        this.closedBy = 'terminal';
        this.setState('closed', error);
        this.emitLifecycle('error', error);
        this.failWaiters(error);
    }

    private failWaiters(error: unknown): void {
        const waiters = this.welcomeWaiters;
        this.welcomeWaiters = new Set();
        for (const w of waiters) w.reject(error);
        this.ready.reject(error);
        for (const hold of [...this.holds]) hold.fail(error);
    }

    private teardownConnection(reason: string): void {
        if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
        if (this.catchUpTimer) { clearTimeout(this.catchUpTimer); this.catchUpTimer = null; }
        if (this.attempt) this.dropAttempt(this.attempt, reason);
    }

    /** The session changed: close, drop every cursor and buffer, reopen for the new session. */
    private resetSession(): void {
        // The lazy login that prepareCredential started for this stream has
        // just begun the session. Nothing was connected, delivered
        // or read yet, so there is nothing to drop: the callers waiting for
        // that login must not be told their session changed.
        const ownLogin = this.preparing && !this.everWelcomed;
        this.resetSessionState(new EventsSessionChangedError(), false, ownLogin);
        if (this.state === 'closed' && this.closedBy === 'user') return;
        if (this.closedBy === 'terminal') {
            this.closedBy = null;
            this.recovery?.restart();
        }
        this.setState('idle');
        if (this.demand() > 0) this.ensureStarted();
    }

    private resetSessionState(error: EventsSessionChangedError, keepConnection = false, ownLogin = false): void {
        this.sessionEpoch++;
        if (keepConnection) {
            if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
            if (this.catchUpTimer) { clearTimeout(this.catchUpTimer); this.catchUpTimer = null; }
        } else {
            this.teardownConnection('session changed');
        }
        this.recovery?.reset();
        if (!this.recovery) this.liveSeen.clear();
        this.boundUserId = null;
        this.everWelcomed = false;
        this.preparedThisSession = false;
        this.readmitUsed = false;
        this.refreshUsed = false;
        this.retryAttempt = 0;
        this.lastCode = null;
        if (ownLogin) return;
        this.pendingAfter = undefined;
        const ready = this.ready;
        this.ready = deferred<void>();
        ready.reject(error);
        for (const hold of [...this.holds]) hold.fail(error);
        this.emitState({ kind: 'session_changed' });
    }

    /**
     * Close for good: the socket closes, pending waits reject with
     * EventsClosedError, streams end, and every subscriber is dropped.
     * Idempotent.
     */
    close(): void {
        if (this.state === 'closed' && this.closedBy === 'user') return;
        this.teardownConnection('client close');
        this.recovery?.stop();
        this.closedBy = 'user';
        this.setState('closed');
        const error = new EventsClosedError();
        const waiters = this.welcomeWaiters;
        this.welcomeWaiters = new Set();
        for (const w of waiters) w.reject(error);
        this.ready.reject(error);
        for (const hold of [...this.holds]) hold.finish(error);
        this.subscribers.clear();
        this.legacy.clear();
        this.emitLifecycle('disconnected', 0, 'client close');
    }

    /**
     * Legacy: close the socket and go idle. Subscribers stay registered and
     * the next subscription (or ready/wait/stream) connects again, from the
     * scope's boundary: cursors are dropped, so events from before the next
     * connect are never replayed to subscribers that did not ask for them.
     */
    disconnect(): void {
        if (this.debug) console.log('[EventsManager] Disconnecting...');
        this.teardownConnection('client disconnect');
        this.recovery?.reset();
        const ready = this.ready;
        if (ready.settled) this.ready = deferred<void>();
        if (this.state !== 'closed') this.setState('idle');
        this.emitLifecycle('disconnected', 0, 'client disconnect');
    }

    configure(options: { autoConnect?: boolean; autoReconnect?: boolean; debug?: boolean }): void {
        if (options.autoConnect !== undefined) this.autoConnect = options.autoConnect;
        if (options.autoReconnect !== undefined) this.autoReconnect = options.autoReconnect;
        if (options.debug !== undefined) this.debug = options.debug;
    }

    /** The §5 state. */
    get connectionState(): EventsConnectionState {
        return this.state;
    }

    /** Legacy state names: idle, connecting, connected, reconnecting. */
    getState(): string {
        switch (this.state) {
            case 'live':
            case 'recovering':
                return 'connected';
            case 'offline':
                return 'reconnecting';
            case 'connecting':
                return 'connecting';
            default:
                return 'idle';
        }
    }

    getListenerCount(): number {
        return this.subscribers.size;
    }

    isConnected(): boolean {
        return this.attempt?.welcomed === true;
    }

    /** Test/diagnostic view of the recovery cursors. */
    get cursors(): { confirmed: string | null; lastLatest: string | null } {
        return { confirmed: this.recovery?.confirmed ?? null, lastLatest: this.recovery?.lastLatest ?? null };
    }
}
