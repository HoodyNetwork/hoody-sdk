/**
 * CreditGate — JavaScript equivalent of a bounded semaphore for protocol
 * flow-control credit. Mirrors the kit-side `Semaphore` semantics so SDK
 * senders back-pressure correctly.
 *
 * Exactly-once FIFO: waiters are served in insertion order. A large waiter
 * blocks all later ones even if smaller requests could proceed — same as
 * tokio's `acquire_many`. This matches the kit's fairness policy.
 *
 * Lifecycle:
 *   - `constructor(initial)` sets the available pool (bytes).
 *   - `acquire(n, cancel?)` awaits until `n` bytes are available; consumes them.
 *     Aborting `cancel` while it waits takes it out of the queue and rejects it.
 *   - `release(n)` returns `n` bytes; wakes FIFO waiters that fit.
 *   - `close(err?)` rejects every pending waiter and blocks future acquires.
 *   - `closedSignal` aborts when the gate closes: the `cancel` for an acquire on
 *     another gate made on this one's behalf (a stream's send waiting for
 *     session credit ends with the stream).
 *
 * Protocol credit is ONLY released by peer WINDOW frames (call `release`
 * when a WINDOW arrives). Successful local sends do NOT release credit —
 * the peer owns the bytes and will replenish when it consumes them.
 */
export class CreditGate {
    available;
    waiters = [];
    closed = false;
    closeError = null;
    closing = null;
    constructor(initial) {
        if (initial < 0)
            throw new Error(`CreditGate initial must be >= 0, got ${initial}`);
        this.available = initial;
    }
    /**
     * Await up to `n` bytes of credit. Resolves once available. Rejects if
     * the gate is closed, or if `cancel` aborts first: the waiter leaves the
     * queue having taken nothing, and the ones behind it move up.
     */
    async acquire(n, cancel) {
        if (n === 0)
            return;
        if (n < 0)
            throw new Error(`CreditGate.acquire: n must be >= 0, got ${n}`);
        if (this.closed) {
            throw this.closeError ?? new Error("CreditGate closed");
        }
        if (cancel?.aborted)
            throw cancelled(cancel);
        // Fast path: credit available AND no one else is waiting (FIFO guard).
        if (this.available >= n && this.waiters.length === 0) {
            this.available -= n;
            return;
        }
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                const i = this.waiters.indexOf(waiter);
                if (i < 0)
                    return;
                this.waiters.splice(i, 1);
                reject(cancelled(cancel));
                // The head leaving can let the waiters behind it through.
                if (i === 0)
                    this.wake();
            };
            const waiter = {
                needed: n,
                cancel,
                resolve: () => { cancel?.removeEventListener("abort", onAbort); resolve(); },
                reject: (e) => { cancel?.removeEventListener("abort", onAbort); reject(e); },
            };
            this.waiters.push(waiter);
            cancel?.addEventListener("abort", onAbort, { once: true });
        });
    }
    /**
     * Add credit back and wake FIFO waiters that fit. Strict-FIFO: if the
     * head waiter needs more than currently available, later waiters stay
     * blocked even if their individual requests could be served.
     */
    release(n) {
        if (n === 0)
            return;
        if (n < 0)
            throw new Error(`CreditGate.release: n must be >= 0, got ${n}`);
        if (this.closed)
            return;
        this.available += n;
        this.wake();
    }
    /**
     * Serve the waiters at the head of the queue that fit, in order. One whose
     * `cancel` has aborted is rejected, never served: waiters can share a signal,
     * and the abort that wakes the queue may not have reached its listener yet.
     */
    wake() {
        if (this.closed)
            return;
        while (this.waiters.length > 0) {
            const w = this.waiters[0];
            if (w.cancel?.aborted) {
                this.waiters.shift();
                w.reject(cancelled(w.cancel));
                continue;
            }
            if (this.available < w.needed)
                break;
            this.waiters.shift();
            this.available -= w.needed;
            w.resolve();
        }
    }
    /**
     * Reject all pending waiters and reject future acquires. Called on
     * stream RESET, session close, or any other cleanup path. Idempotent.
     */
    close(err = new Error("CreditGate closed")) {
        if (this.closed)
            return;
        this.closed = true;
        this.closeError = err;
        const waiters = this.waiters.splice(0);
        for (const w of waiters)
            w.reject(err);
        this.closing?.abort(err);
    }
    /** Aborted, with the close error, once this gate closes. */
    get closedSignal() {
        if (!this.closing) {
            this.closing = new AbortController();
            if (this.closed)
                this.closing.abort(this.closeError ?? new Error("CreditGate closed"));
        }
        return this.closing.signal;
    }
    /** Observability. */
    get availablePermits() { return this.available; }
    get waiterCount() { return this.waiters.length; }
    get isClosed() { return this.closed; }
}
function cancelled(signal) {
    return signal.reason instanceof Error ? signal.reason : new Error("CreditGate acquire cancelled");
}
