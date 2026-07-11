/**
 * SDK-side FD budget. Limits concurrent local-HTTP socket opens to avoid
 * exhausting the host process's FDs.
 */
declare class FdBudget {
    private capacity;
    private inUse;
    private waiters;
    constructor();
    /** Try to acquire one permit immediately. Returns true on success. */
    tryAcquire(): boolean;
    /** Acquire one permit, waiting up to `timeoutMs`. Resolves true on acquire,
     * false on timeout. */
    acquire(timeoutMs?: number): Promise<boolean>;
    /** Release one permit. Wakes a waiter if any. */
    release(): void;
    /** Snapshot for telemetry. */
    metrics(): {
        capacity: number;
        inUse: number;
        waiters: number;
    };
}
export declare const sdkLocalFdBudget: FdBudget;
export {};
