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

import {
    historyActionFor,
    EventsError,
    type EventsGapReason,
} from './events-errors.js';
import { toHoodyEvent, type EventHistoryItem, type HoodyEvent } from './events-types.js';

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
    bootstrap(signal: AbortSignal): Promise<{ next_cursor: string; latest_cursor: string }>;
}

/** A bounded set of recently seen ids; the oldest id is forgotten first. */
export class EventIdLru {
    private readonly ids = new Map<string, true>();

    constructor(readonly capacity: number) {}

    /** Record `id`. Returns true when it was not already present. */
    add(id: string): boolean {
        if (this.ids.has(id)) {
            // Refresh recency: an id seen live and then in history stays known.
            this.ids.delete(id);
            this.ids.set(id, true);
            return false;
        }
        this.ids.set(id, true);
        if (this.ids.size > this.capacity) {
            const oldest = this.ids.keys().next().value;
            if (oldest !== undefined) this.ids.delete(oldest);
        }
        return true;
    }

    has(id: string): boolean {
        return this.ids.has(id);
    }

    clear(): void {
        this.ids.clear();
    }

    get size(): number {
        return this.ids.size;
    }
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

const DEFAULT_MAX_REPLAY_PAGES = 20;
const SERVER_PAGE_MAX = 500;
/** The least wait after a 429 from history (backoff). */
export const HISTORY_BACKOFF_FLOOR_MS = 5000;

function defaultRetryDelay(attempt: number, floorMs: number): number {
    const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
    return Math.max(floorMs, base);
}

/**
 * The catch-up engine. One run at a time: a trigger that lands while a run is
 * in flight marks it to run again once more, so no trigger is lost and none
 * starts a parallel read.
 */
export class EventsRecovery {
    /** How far history has been read; null until the first welcome/bootstrap. */
    confirmed: string | null = null;
    /** Newest readable row the server reported. */
    lastLatest: string | null = null;
    /** Ids already delivered (live or replayed); sized `maxReplayPages × 500`. */
    readonly seen: EventIdLru;

    readonly maxReplayPages: number;
    private readonly pageLimit: number;
    private readonly opts: EventsRecoveryOptions;
    private running: Promise<void> | null = null;
    private rerun = false;
    /** Bumped by reset(): a run from an older epoch discards everything it reads. */
    private epoch = 0;
    private abort: AbortController | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryAttempt = 0;
    private stopped = false;

    constructor(opts: EventsRecoveryOptions) {
        this.opts = opts;
        this.maxReplayPages = Math.max(1, Math.floor(opts.maxReplayPages ?? DEFAULT_MAX_REPLAY_PAGES));
        this.pageLimit = Math.min(SERVER_PAGE_MAX, Math.max(1, Math.floor(opts.pageLimit ?? SERVER_PAGE_MAX)));
        this.seen = new EventIdLru(this.maxReplayPages * SERVER_PAGE_MAX);
    }

    /** True while a catch-up is reading history. */
    get busy(): boolean {
        return this.running !== null;
    }

    /**
     * Ask for a catch-up. Joins the run in flight (which then runs once more)
     * or starts one. Resolves when the run it joined or started settles.
     */
    trigger(): Promise<void> {
        if (this.stopped) return Promise.resolve();
        this.clearRetry();
        if (this.running) {
            this.rerun = true;
            return this.running;
        }
        const epoch = this.epoch;
        const run = this.run(epoch).finally(() => {
            if (this.running === run) this.running = null;
        });
        this.running = run;
        return run;
    }

    /**
     * The delay before retry number `attempt` of a transient history failure
     * (`floorMs` raises it for 429). Shared with stream({after}) replays, so
     * every history read backs off the same way.
     */
    retryDelay(attempt: number, floorMs: number): number {
        return (this.opts.retryDelayMs ?? defaultRetryDelay)(attempt, floorMs);
    }

    /**
     * Drop every cursor and every remembered id, and abandon a run in flight
     * (F16: nothing of one session carries into another).
     */
    reset(): void {
        this.epoch++;
        this.abort?.abort();
        this.abort = null;
        this.running = null;
        this.rerun = false;
        this.clearRetry();
        this.retryAttempt = 0;
        this.confirmed = null;
        this.lastLatest = null;
        this.seen.clear();
    }

    /** Stop for good: no further reads, no retries. */
    stop(): void {
        this.stopped = true;
        this.reset();
    }

    /** Resume after stop() (a new session after a terminal refusal). */
    restart(): void {
        this.stopped = false;
    }

    private clearRetry(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    private scheduleRetry(epoch: number, floorMs: number): void {
        if (this.stopped || epoch !== this.epoch) return;
        this.clearRetry();
        const delay = this.retryDelay(this.retryAttempt++, floorMs);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (epoch === this.epoch) void this.trigger();
        }, delay);
    }

    private async run(epoch: number): Promise<void> {
        const stale = () => epoch !== this.epoch || this.stopped;
        const controller = new AbortController();
        this.abort = controller;
        try {
            let again = true;
            while (again) {
                this.rerun = false;
                again = false;
                if (this.confirmed === null) {
                    // Nothing read yet in this session and no welcome boundary:
                    // start at the scope's boundary (bootstrap mode).
                    if (!(await this.rebootstrap(epoch, controller.signal))) return;
                }
                let pages = 0;
                while (true) {
                    let page: EventsHistoryPage;
                    try {
                        page = await this.opts.reader.page(this.confirmed as string, this.pageLimit, controller.signal);
                    } catch (error) {
                        if (stale()) return;
                        if (await this.handleFailure(error, epoch, controller.signal) === 'stop') return;
                        // A gap was raised and the boundary re-read: read on from it.
                        again = true;
                        break;
                    }
                    if (stale()) return;
                    for (const item of page.events) {
                        const event = toHoodyEvent(item, true);
                        if (!event || event.ephemeral) continue;
                        if (!this.seen.add(event.id)) continue;
                        this.opts.deliver(event);
                        if (stale()) return;
                    }
                    // `confirmed` moves only on next_cursor, page by page,
                    // so a failure mid-run resumes after the last page applied.
                    this.confirmed = page.next_cursor;
                    this.lastLatest = page.latest_cursor;
                    this.retryAttempt = 0;
                    if (!page.has_more) break;
                    pages++;
                    if (pages >= this.maxReplayPages) {
                        // Too far behind to replay within bounds: say so and
                        // restart from the boundary rather than read forever.
                        this.opts.onGap('overflow');
                        if (stale()) return;
                        this.confirmed = null;
                        if (!(await this.rebootstrap(epoch, controller.signal))) return;
                        break;
                    }
                }
                if (stale()) return;
                if (this.rerun) again = true;
            }
            this.opts.onCaughtUp();
        } finally {
            if (this.abort === controller) this.abort = null;
        }
    }

    /** `?bootstrap=true` → confirmed/lastLatest. Returns false when the run must end. */
    private async rebootstrap(epoch: number, signal: AbortSignal): Promise<boolean> {
        try {
            const boundary = await this.opts.reader.bootstrap(signal);
            if (epoch !== this.epoch || this.stopped) return false;
            this.confirmed = boundary.next_cursor;
            this.lastLatest = boundary.latest_cursor;
            this.retryAttempt = 0;
            return true;
        } catch (error) {
            if (epoch !== this.epoch || this.stopped) return false;
            await this.handleFailure(error, epoch, signal, true);
            return false;
        }
    }

    /**
     * Apply the C5 HTTP row for a failed read. 'continue' means a gap was
     * raised and the boundary re-read, so the run reads on from it.
     */
    private async handleFailure(
        error: unknown,
        epoch: number,
        signal: AbortSignal,
        duringBootstrap = false,
    ): Promise<'continue' | 'stop'> {
        const status = (error as { status?: unknown })?.status;
        const code = (error as { code?: unknown })?.code;
        const action = historyActionFor(
            typeof status === 'number' ? status : undefined,
            typeof code === 'string' ? code : undefined,
        );
        switch (action.kind) {
            case 'gap': {
                if (duringBootstrap) {
                    // A bootstrap takes no cursor, so a cursor error here is
                    // not ours to recover from; retry like a transient failure.
                    this.scheduleRetry(epoch, 0);
                    return 'stop';
                }
                // C5: 410/400 cursor codes → gap{reason} + rebootstrap.
                this.opts.onGap(action.reason);
                if (epoch !== this.epoch || this.stopped) return 'stop';
                this.confirmed = null;
                return (await this.rebootstrap(epoch, signal)) ? 'continue' : 'stop';
            }
            case 'terminal':
                this.opts.onTerminal(action.code, error);
                return 'stop';
            case 'programming':
                this.opts.onProgrammingError(
                    new EventsError(action.code, 'The SDK sent a conflicting history query (EVENTS_QUERY_CONFLICT); this is an SDK bug', { cause: error }),
                );
                return 'stop';
            case 'backoff':
                this.scheduleRetry(epoch, HISTORY_BACKOFF_FLOOR_MS);
                return 'stop';
            case 'retry':
            default:
                if (signal.aborted) return 'stop';
                this.scheduleRetry(epoch, 0);
                return 'stop';
        }
    }
}
