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
export declare class CreditGate {
    private available;
    private waiters;
    private closed;
    private closeError;
    constructor(initial: number);
    /**
     * Await up to `n` bytes of credit. Resolves once available. Rejects if
     * the gate is closed.
     */
    acquire(n: number): Promise<void>;
    /**
     * Add credit back and wake FIFO waiters that fit. Strict-FIFO: if the
     * head waiter needs more than currently available, later waiters stay
     * blocked even if their individual requests could be served.
     */
    release(n: number): void;
    /**
     * Reject all pending waiters and reject future acquires. Called on
     * stream RESET, session close, or any other cleanup path. Idempotent.
     */
    close(err?: Error): void;
    /** Observability. */
    get availablePermits(): number;
    get waiterCount(): number;
    get isClosed(): boolean;
}
