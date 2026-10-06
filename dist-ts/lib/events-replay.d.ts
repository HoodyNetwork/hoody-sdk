/**
 * History recovery for the events stream.
 *
 * Live frames are hints: an individual socket send is never promised, and
 * frames are neither ordered nor proven. History is authoritative. So the
 * runtime keeps exactly two cursors:
 *
 *  - `confirmed`: how far history has been read. Set ONLY from a history
 *    response's `next_cursor` (or from `welcome.boundary_cursor` /
 *    `?bootstrap=true` when nothing has been read yet).
 *  - `lastLatest`: the newest row the server said is readable, from
 *    `welcome`, `tick` and every history response's `latest_cursor`.
 *
 * Cursors are opaque and scope-bound; the SDK compares them for equality
 * only and never orders them. Catch-up is `GET ?after=confirmed` until
 * `has_more:false`, bounded by `maxReplayPages`. Items already delivered
 * live are skipped through a bounded LRU of event ids.
 */
import { EventsError, type EventsGapReason } from './events-errors.js';
import { type EventHistoryItem, type HoodyEvent } from './events-types.js';
/** One cursor-mode page (success envelope, `data`). */
export interface EventsHistoryPage {
    events: EventHistoryItem[];
    has_more: boolean;
    next_cursor: string;
    latest_cursor: string;
}
/** The two history reads the runtime makes. Implemented over the client's HTTP layer by EventsClient. */
export interface EventsHistoryReader {
    /** `GET /api/v1/events?after=<cursor>&limit=<limit>`. */
    page(after: string, limit: number, signal: AbortSignal): Promise<EventsHistoryPage>;
    /** `GET /api/v1/events?bootstrap=true`: the scope's boundary and latest cursors. */
    bootstrap(signal: AbortSignal): Promise<{
        next_cursor: string;
        latest_cursor: string;
    }>;
}
/** A bounded set of recently seen ids; the oldest id is forgotten first. */
export declare class EventIdLru {
    readonly capacity: number;
    private readonly ids;
    constructor(capacity: number);
    /** Record `id`. Returns true when it was not already present. */
    add(id: string): boolean;
    has(id: string): boolean;
    clear(): void;
    get size(): number;
}
export interface EventsRecoveryOptions {
    reader: EventsHistoryReader;
    /** Page bound per catch-up (default 20); past it the runtime raises `gap{overflow}` and rebootstraps. */
    maxReplayPages?: number;
    /** Page size; 500 is the server maximum. */
    pageLimit?: number;
    /** A replayed event not seen before. */
    deliver: (event: HoodyEvent) => void;
    /** Continuity was lost; the runtime already rebootstrapped (or is about to). */
    onGap: (reason: EventsGapReason) => void;
    /** A catch-up ended with `has_more:false` (or a rebootstrap landed): history is read up to the fence. */
    onCaughtUp: () => void;
    /** History refused the credential (403, or 401 after the HTTP client's refresh). */
    onTerminal: (code: string, cause: unknown) => void;
    /** EVENTS_QUERY_CONFLICT: a bug in this SDK. Never retried. */
    onProgrammingError: (error: EventsError) => void;
    /** Retry delay for transient history failures; defaults to 1 s doubling to 30 s. */
    retryDelayMs?: (attempt: number, floorMs: number) => number;
}
/** The least wait after a 429 from history (backoff). */
export declare const HISTORY_BACKOFF_FLOOR_MS = 5000;
/**
 * The catch-up engine. One run at a time: a trigger that lands while a run is
 * in flight marks it to run again once more, so no trigger is lost and none
 * starts a parallel read.
 */
export declare class EventsRecovery {
    /** How far history has been read; null until the first welcome/bootstrap. */
    confirmed: string | null;
    /** Newest readable row the server reported. */
    lastLatest: string | null;
    /** Ids already delivered (live or replayed); sized `maxReplayPages × 500`. */
    readonly seen: EventIdLru;
    readonly maxReplayPages: number;
    private readonly pageLimit;
    private readonly opts;
    private running;
    private rerun;
    /** Bumped by reset(): a run from an older epoch discards everything it reads. */
    private epoch;
    private abort;
    private retryTimer;
    private retryAttempt;
    private stopped;
    constructor(opts: EventsRecoveryOptions);
    /** True while a catch-up is reading history. */
    get busy(): boolean;
    /**
     * Ask for a catch-up. Joins the run in flight (which then runs once more)
     * or starts one. Resolves when the run it joined or started settles.
     */
    trigger(): Promise<void>;
    /**
     * The delay before retry number `attempt` of a transient history failure
     * (`floorMs` raises it for 429). Shared with stream({after}) replays, so
     * every history read backs off the same way.
     */
    retryDelay(attempt: number, floorMs: number): number;
    /**
     * Drop every cursor and every remembered id, and abandon a run in flight
     * (F16: nothing of one session carries into another).
     */
    reset(): void;
    /** Stop for good: no further reads, no retries. */
    stop(): void;
    /** Resume after stop() (a new session after a terminal refusal). */
    restart(): void;
    private clearRetry;
    private scheduleRetry;
    private run;
    /** `?bootstrap=true` → confirmed/lastLatest. Returns false when the run must end. */
    private rebootstrap;
    /**
     * Apply the C5 HTTP row for a failed read. 'continue' means a gap was
     * raised and the boundary re-read, so the run reads on from it.
     */
    private handleFailure;
}
