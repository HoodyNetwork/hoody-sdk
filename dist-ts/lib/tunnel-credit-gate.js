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
 *   - `acquire(n)` awaits until `n` bytes are available; consumes them.
 *   - `release(n)` returns `n` bytes; wakes FIFO waiters that fit.
 *   - `close(err?)` rejects every pending waiter and blocks future acquires.
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
    constructor(initial) {
        if (initial < 0)
            throw new Error(`CreditGate initial must be >= 0, got ${initial}`);
        this.available = initial;
    }
    /**
     * Await up to `n` bytes of credit. Resolves once available. Rejects if
     * the gate is closed.
     */
    async acquire(n) {
        if (n === 0)
            return;
        if (n < 0)
            throw new Error(`CreditGate.acquire: n must be >= 0, got ${n}`);
        if (this.closed) {
            throw this.closeError ?? new Error("CreditGate closed");
        }
        // Fast path: credit available AND no one else is waiting (FIFO guard).
        if (this.available >= n && this.waiters.length === 0) {
            this.available -= n;
            return;
        }
        return new Promise((resolve, reject) => {
            this.waiters.push({ needed: n, resolve, reject });
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
        while (this.waiters.length > 0 && this.available >= this.waiters[0].needed) {
            const w = this.waiters.shift();
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
    }
    /** Observability. */
    get availablePermits() { return this.available; }
    get waiterCount() { return this.waiters.length; }
    get isClosed() { return this.closed; }
}
