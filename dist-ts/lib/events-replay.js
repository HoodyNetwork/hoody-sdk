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
import { historyActionFor, EventsError, } from './events-errors.js';
import { toHoodyEvent } from './events-types.js';
/** A bounded set of recently seen ids; the oldest id is forgotten first. */
export class EventIdLru {
    capacity;
    ids = new Map();
    constructor(capacity) {
        this.capacity = capacity;
    }
    /** Record `id`. Returns true when it was not already present. */
    add(id) {
        if (this.ids.has(id)) {
            // Refresh recency: an id seen live and then in history stays known.
            this.ids.delete(id);
            this.ids.set(id, true);
            return false;
        }
        this.ids.set(id, true);
        if (this.ids.size > this.capacity) {
            const oldest = this.ids.keys().next().value;
            if (oldest !== undefined)
                this.ids.delete(oldest);
        }
        return true;
    }
    has(id) {
        return this.ids.has(id);
    }
    clear() {
        this.ids.clear();
    }
    get size() {
        return this.ids.size;
    }
}
const DEFAULT_MAX_REPLAY_PAGES = 20;
const SERVER_PAGE_MAX = 500;
/** The least wait after a 429 from history (backoff). */
export const HISTORY_BACKOFF_FLOOR_MS = 5000;
function defaultRetryDelay(attempt, floorMs) {
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
    confirmed = null;
    /** Newest readable row the server reported. */
    lastLatest = null;
    /** Ids already delivered (live or replayed); sized `maxReplayPages × 500`. */
    seen;
    maxReplayPages;
    pageLimit;
    opts;
    running = null;
    rerun = false;
    /** Bumped by reset(): a run from an older epoch discards everything it reads. */
    epoch = 0;
    abort = null;
    retryTimer = null;
    retryAttempt = 0;
    stopped = false;
    constructor(opts) {
        this.opts = opts;
        this.maxReplayPages = Math.max(1, Math.floor(opts.maxReplayPages ?? DEFAULT_MAX_REPLAY_PAGES));
        this.pageLimit = Math.min(SERVER_PAGE_MAX, Math.max(1, Math.floor(opts.pageLimit ?? SERVER_PAGE_MAX)));
        this.seen = new EventIdLru(this.maxReplayPages * SERVER_PAGE_MAX);
    }
    /** True while a catch-up is reading history. */
    get busy() {
        return this.running !== null;
    }
    /**
     * Ask for a catch-up. Joins the run in flight (which then runs once more)
     * or starts one. Resolves when the run it joined or started settles.
     */
    trigger() {
        if (this.stopped)
            return Promise.resolve();
        this.clearRetry();
        if (this.running) {
            this.rerun = true;
            return this.running;
        }
        const epoch = this.epoch;
        const run = this.run(epoch).finally(() => {
            if (this.running === run)
                this.running = null;
        });
        this.running = run;
        return run;
    }
    /**
     * The delay before retry number `attempt` of a transient history failure
     * (`floorMs` raises it for 429). Shared with stream({after}) replays, so
     * every history read backs off the same way.
     */
    retryDelay(attempt, floorMs) {
        return (this.opts.retryDelayMs ?? defaultRetryDelay)(attempt, floorMs);
    }
    /**
     * Drop every cursor and every remembered id, and abandon a run in flight
     * (F16: nothing of one session carries into another).
     */
    reset() {
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
    stop() {
        this.stopped = true;
        this.reset();
    }
    /** Resume after stop() (a new session after a terminal refusal). */
    restart() {
        this.stopped = false;
    }
    clearRetry() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }
    scheduleRetry(epoch, floorMs) {
        if (this.stopped || epoch !== this.epoch)
            return;
        this.clearRetry();
        const delay = this.retryDelay(this.retryAttempt++, floorMs);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (epoch === this.epoch)
                void this.trigger();
        }, delay);
    }
    async run(epoch) {
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
                    if (!(await this.rebootstrap(epoch, controller.signal)))
                        return;
                }
                let pages = 0;
                while (true) {
                    let page;
                    try {
                        page = await this.opts.reader.page(this.confirmed, this.pageLimit, controller.signal);
                    }
                    catch (error) {
                        if (stale())
                            return;
                        if (await this.handleFailure(error, epoch, controller.signal) === 'stop')
                            return;
                        // A gap was raised and the boundary re-read: read on from it.
                        again = true;
                        break;
                    }
                    if (stale())
                        return;
                    for (const item of page.events) {
                        const event = toHoodyEvent(item, true);
                        if (!event || event.ephemeral)
                            continue;
                        if (!this.seen.add(event.id))
                            continue;
                        this.opts.deliver(event);
                        if (stale())
                            return;
                    }
                    // `confirmed` moves only on next_cursor, page by page,
                    // so a failure mid-run resumes after the last page applied.
                    this.confirmed = page.next_cursor;
                    this.lastLatest = page.latest_cursor;
                    this.retryAttempt = 0;
                    if (!page.has_more)
                        break;
                    pages++;
                    if (pages >= this.maxReplayPages) {
                        // Too far behind to replay within bounds: say so and
                        // restart from the boundary rather than read forever.
                        this.opts.onGap('overflow');
                        if (stale())
                            return;
                        this.confirmed = null;
                        if (!(await this.rebootstrap(epoch, controller.signal)))
                            return;
                        break;
                    }
                }
                if (stale())
                    return;
                if (this.rerun)
                    again = true;
            }
            this.opts.onCaughtUp();
        }
        finally {
            if (this.abort === controller)
                this.abort = null;
        }
    }
    /** `?bootstrap=true` → confirmed/lastLatest. Returns false when the run must end. */
    async rebootstrap(epoch, signal) {
        try {
            const boundary = await this.opts.reader.bootstrap(signal);
            if (epoch !== this.epoch || this.stopped)
                return false;
            this.confirmed = boundary.next_cursor;
            this.lastLatest = boundary.latest_cursor;
            this.retryAttempt = 0;
            return true;
        }
        catch (error) {
            if (epoch !== this.epoch || this.stopped)
                return false;
            await this.handleFailure(error, epoch, signal, true);
            return false;
        }
    }
    /**
     * Apply the C5 HTTP row for a failed read. 'continue' means a gap was
     * raised and the boundary re-read, so the run reads on from it.
     */
    async handleFailure(error, epoch, signal, duringBootstrap = false) {
        const status = error?.status;
        const code = error?.code;
        const action = historyActionFor(typeof status === 'number' ? status : undefined, typeof code === 'string' ? code : undefined);
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
                if (epoch !== this.epoch || this.stopped)
                    return 'stop';
                this.confirmed = null;
                return (await this.rebootstrap(epoch, signal)) ? 'continue' : 'stop';
            }
            case 'terminal':
                this.opts.onTerminal(action.code, error);
                return 'stop';
            case 'programming':
                this.opts.onProgrammingError(new EventsError(action.code, 'The SDK sent a conflicting history query (EVENTS_QUERY_CONFLICT); this is an SDK bug', { cause: error }));
                return 'stop';
            case 'backoff':
                this.scheduleRetry(epoch, HISTORY_BACKOFF_FLOOR_MS);
                return 'stop';
            case 'retry':
            default:
                if (signal.aborted)
                    return 'stop';
                this.scheduleRetry(epoch, 0);
                return 'stop';
        }
    }
}
