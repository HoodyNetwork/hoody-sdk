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
 *    the API authenticates after the namespace connect. Frames that
 *    arrive before `welcome` are buffered and replayed after it.
 *  - Control frames are never events. Every code goes through
 *    the code-to-action map in events-errors.ts.
 *  - socket.io's own reconnection is off; this loop owns every retry, and the
 *    token is read afresh on each attempt.
 *  - Live frames are delivered at once and de-duplicated by event id; only
 *    history moves the confirmed cursor (events-replay.ts).
 *  - Everything is bound to the client session (events-session.ts).
 */
import type { EventsSocketTransport, HoodyEvent, HoodyStreamEvent } from './events-types.js';
import { EventsError, type EventsGapReason } from './events-errors.js';
import { type EventsHistoryReader } from './events-replay.js';
import type { EventsSession } from './events-session.js';
/** The transport surface the runtime needs; EventsSocketTransport implements it. */
export type EventsTransport = Pick<EventsSocketTransport, 'connect' | 'disconnect' | 'removeAllListeners' | 'emit' | 'onFrame' | 'onSocketError' | 'onClose'> & Partial<Pick<EventsSocketTransport, 'onTransportError'>>;
/** The lifecycle state, as `getLifecycleState()` returns it and `onState` delivers it. */
export type EventsLifecycleState = 'idle' | 'connecting' | 'recovering' | 'live' | 'offline' | 'closed';
/**
 * A transport event of the events socket, as `addConnectionListener` delivers it: `connecting`,
 * `connected`, `reconnected` (with the attempt), `reconnecting` (with the attempt), `disconnected`
 * (with the close code and reason) and `error` (with the error). These are events, not states; the
 * state is `EventsLifecycleState`.
 */
export type EventsConnectionEvent = 'connecting' | 'connected' | 'reconnecting' | 'reconnected' | 'disconnected' | 'error';
/** What `onState` listeners receive. */
export type EventsStateEvent = {
    kind: 'state';
    state: EventsLifecycleState;
    previous: EventsLifecycleState;
    error?: EventsError;
    retryInMs?: number;
}
/**
 * Continuity was lost; refetch what you show. Without `stream`, the
 * runtime resumed from the scope's boundary. With `stream: true`, one
 * stream() consumer fell behind its byte bound and `dropped` persisted
 * events were dropped from its buffer only (other subscribers are whole).
 */
 | {
    kind: 'gap';
    reason: EventsGapReason;
    stream?: true;
    dropped?: number;
}
/** Access to a project changed for this user (`scope_changed`); cached reads of it are stale. */
 | {
    kind: 'scope_changed';
    projectId: string;
    reason: string;
}
/**
 * A non-fatal refusal: the connection stays up. Code
 * `EVENTS_HISTORY_RETRY`: a stream({after}) replay page failed
 * transiently and is read again in `delayMs`; `attempt` counts from 1
 * per page.
 */
 | {
    kind: 'notice';
    code: string;
    message?: string;
    attempt?: number;
    delayMs?: number;
}
/** The client session changed; state of the previous session was dropped. */
 | {
    kind: 'session_changed';
};
/** Narrows which events a subscriber receives, on top of its type patterns. */
export interface EventFilter {
    /** The event's `resource_id`. */
    resourceId?: string;
    /** The event's `resource_type`. */
    resourceType?: string;
    /** Events of a project: `project_id` equals it, or the event is about the project itself. */
    projectId?: string;
    /** Events of a computer: `computer_id` equals it, or the event is about the computer itself. */
    computerId?: string;
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
     * `REALM_REQUIRED` (terminal): scope the client with withRealm().
     */
    realmId?: string;
    /** The client session the runtime is bound to. */
    session?: EventsSession;
    /** Action "refresh + reconnect": obtain a fresh access token; undefined when none can be had. */
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
    backoff?: {
        initialMs?: number;
        maxMs?: number;
    };
    /**
     * Delay between a persisted live frame and the catch-up it triggers,
     * drawn uniformly from [minMs, maxMs] (default 1–3 s). The
     * spread keeps the sockets of one change from reading history at once.
     */
    catchUpDelay?: {
        minMs?: number;
        maxMs?: number;
    };
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
type ConnectionCallback = (...args: any[]) => void;
/**
 * Key of EventsManager's per-type listener (EventsClient `on<Event>()`). A symbol, not a method name:
 * it is not public API (the public listener API is EventsClient.on / onState / stream).
 */
export declare const listenByType: unique symbol;
/**
 * The runtime behind an `EventsClient`: it owns the one socket of a stream,
 * connects when there is demand, reconnects with backoff, recovers missed
 * events from history and delivers each event to the matching handlers,
 * streams and waits. `EventsClient` is the supported way to use it; construct
 * one directly only to supply your own transport.
 */
export declare class EventsManager {
    private createWsClient;
    private readonly subscribers;
    /** Per-type listener registrations ([listenByType]): type → callback → subscriber (same callback once per type). */
    private readonly legacy;
    private readonly connectionListeners;
    private readonly stateListeners;
    private readonly holds;
    private welcomeWaiters;
    private state;
    private closedBy;
    private autoConnect;
    private autoReconnect;
    private debug;
    private readonly opts;
    private attempt;
    private attemptSeq;
    /** Reconnect backoff timer (cancelled by goIdle(), close() and session changes). */
    private retryTimer;
    private retryAttempt;
    private everWelcomed;
    /** Since the last welcome: "re-admit once" and one refresh per admission. */
    private readmitUsed;
    private refreshUsed;
    private refreshing;
    private preparing;
    private preparedThisSession;
    private boundUserId;
    private pendingAfter;
    private activitySent;
    private lastCode;
    private catchUpTimer;
    private readyGate;
    /** Bumped by every session reset; async work started under an older value is discarded. */
    private sessionEpoch;
    /** Counts gap notices; bootstrap() restarts when it moves. */
    private gapCount;
    private readonly recovery;
    /** De-dup for live frames when there is no history (legacy runtime). */
    private readonly liveSeen;
    /**
     * `createWsClient` is called for every connection attempt and resolves with
     * a transport that is not yet connected. `options` set the history reader
     * used for recovery, the realm and session the stream is bound to, token
     * refresh and timing; see `EventsManagerOptions`. Nothing connects until
     * something subscribes.
     */
    constructor(createWsClient: () => Promise<EventsTransport>, options?: EventsManagerOptions);
    /**
     * Subscribe `callback` to one or more patterns. Resolves with the
     * unsubscribe function once the connection is admitted (`welcome`), or
     * at once when it already is. Rejects, and unregisters, on a terminal
     * refusal. Patterns are not validated here; EventsClient.on() validates
     * them against the catalog.
     */
    subscribe(patterns: readonly string[], callback: EventCallback, opts?: {
        filter?: EventFilter;
        includeEphemeral?: boolean;
        signal?: AbortSignal;
    }): Promise<() => void>;
    /**
     * The per-type listener behind EventsClient's `on<Event>()` methods (not public API: keyed by a
     * module symbol). The same callback registers once per type; `'*'` also receives
     * `activity.logged` and opts the socket in to it when it has no filter.
     */
    [listenByType](eventType: string, callback: EventCallback, filter?: EventFilter): Promise<() => void>;
    private removeEventListener;
    private register;
    private unregister;
    /** Resolve once the connection is admitted; start it when needed. */
    private awaitAdmission;
    /**
     * Resolve at an actual welcome, whatever autoConnect says: reads that
     * must follow admission (the after-replay) cannot take the legacy
     * shortcut, or they read before the boundary exists.
     */
    private awaitWelcome;
    /** Observe one transport event of the socket (see `EventsConnectionEvent`). Returns an unsubscribe function. */
    addConnectionListener(event: EventsConnectionEvent, callback: ConnectionCallback): () => void;
    /**
     * Observe state changes, gaps, `scope_changed` and non-fatal notices. A `state` event's `state`
     * and `previous` are the values `getLifecycleState()` returns.
     */
    onState(listener: (event: EventsStateEvent) => void): () => void;
    /**
     * Resolves at the first catch-up of this session that ends with
     * `has_more:false`; for a runtime without history, at `welcome`.
     * Starts the connection when needed and holds it open while waiting.
     */
    ready(opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<void>;
    /**
     * Run `body` under a hold: the connection stays open until the returned
     * promise settles. `body` calls `settle(null | error)`; resolution value
     * comes from `result`.
     */
    private withHold;
    /**
     * Wait for the first event matching `patterns` and `filter`.
     *
     * The subscription exists before anything else happens. `action`, when
     * given, runs only after `ready()`: the history boundary then already
     * lies before the action, so its event is delivered live or replayed,
     * never lost to a cold start.
     */
    waitFor(patterns: readonly string[], filter: EventFilter | undefined, action: (() => unknown) | undefined, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        includeEphemeral?: boolean;
    }): Promise<HoodyEvent>;
    /**
     * Subscribe now, resolve after `ready()` with `{ result }`: act between the
     * two, then await `result` (`prepareWait`).
     */
    prepareWait(patterns: readonly string[], filter: EventFilter | undefined, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        includeEphemeral?: boolean;
    }): Promise<{
        result: Promise<HoodyEvent>;
    }>;
    /**
     * Events as an async iterator, bounded by bytes (default 8 MiB). When the
     * bound is hit the oldest buffered events are dropped and a gap is
     * recorded; with `onGap: 'throw'` the iterator throws EventsGapError on
     * that and on any stream-wide gap instead.
     */
    stream(patterns: readonly string[], opts?: {
        filter?: EventFilter;
        after?: string;
        signal?: AbortSignal;
        maxBytes?: number;
        includeEphemeral?: boolean;
        onGap?: 'continue' | 'throw';
    }): AsyncIterableIterator<HoodyStreamEvent>;
    /**
     * stream({after}): read history from `after` into one subscriber until
     * `has_more:false`, alongside live delivery. The subscriber's own id set
     * removes the overlap.
     */
    private replayInto;
    /**
     * Bootstrap: wait for `ready()`, take the snapshot, and report
     * every resource that events touched while the snapshot was being read,
     * so the caller refetches those through GET. Event payloads are never
     * applied over a snapshot. A gap while reading restarts the whole
     * bootstrap, at most 3 times; the fourth raises EventsGapError.
     */
    bootstrap<S>(readFn: () => Promise<S> | S, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<{
        snapshot: S;
        touched: Array<{
            resource_type: string;
            resource_id: string;
        }>;
    }>;
    private bootstrapHeld;
    /** Run one catch-up to its end (no-op without history). */
    private settleCatchUp;
    private demand;
    private ensureStarted;
    private releaseIfIdle;
    private connect;
    private onFrame;
    private onWelcome;
    private flushPreWelcome;
    private onLiveEvent;
    /**
     * A catch-up 1–3 s after a new persisted live frame: the frame may be one
     * of several, and the ones before it may never have come.
     * Coalesced: while one is pending, later frames ride on it, so a busy
     * stream reads history at most once per delay instead of never (a
     * debounce that restarts on every frame would starve).
     */
    private scheduleCatchUp;
    /** A code from an `error`/`revoked` frame or the socket `error` event. */
    private onCode;
    private refreshAndReconnect;
    /** Transport loss: connect_error, close, welcome timeout, factory failure. */
    private transportLost;
    private scheduleReconnect;
    /** Detach and close one attempt's socket. */
    private dropAttempt;
    /** Opt the socket in to or out of activity to match the subscribers. */
    private syncActivity;
    private onGap;
    private onCaughtUp;
    private markReady;
    private dispatch;
    private setState;
    private emitState;
    private emitConnection;
    /** A terminal refusal: closed until the session changes. */
    private closeTerminal;
    private failWaiters;
    private teardownConnection;
    /** The session changed: close, drop every cursor and buffer, reopen for the new session. */
    private resetSession;
    private resetSessionState;
    /**
     * Close for good: the socket closes, pending waits reject with
     * EventsClosedError, streams end, and every subscriber is dropped.
     * Idempotent.
     */
    close(): void;
    /**
     * Close the socket and go idle (when the last demand is gone). Subscribers stay registered and
     * the next subscription (or ready/wait/stream) connects again, from the
     * scope's boundary: cursors are dropped, so events from before the next
     * connect are never replayed to subscribers that did not ask for them.
     */
    private goIdle;
    /**
     * Change connection behaviour; omitted keys keep their value. With
     * `autoConnect: false` a subscription resolves without waiting for the
     * connection to be admitted. With `autoReconnect: false` a lost connection
     * is not retried: the stream goes idle and callers waiting for admission get
     * the error. `debug` logs connection steps to the console.
     */
    configure(options: {
        autoConnect?: boolean;
        autoReconnect?: boolean;
        debug?: boolean;
    }): void;
    /** The lifecycle state: idle, connecting, live, recovering, offline or closed. */
    getLifecycleState(): EventsLifecycleState;
    /** How many subscriptions are registered: handlers, open streams and pending waits. */
    getListenerCount(): number;
    /** True while the current connection has been admitted by the server (its `welcome` arrived). */
    isConnected(): boolean;
    /** Test/diagnostic view of the recovery cursors. */
    getCursors(): {
        confirmed: string | null;
        lastLatest: string | null;
    };
}
export {};
