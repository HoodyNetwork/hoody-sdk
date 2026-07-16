/**
 * SDK-side FD budget. Limits concurrent local-HTTP socket opens to avoid
 * exhausting the host process's FDs.
 */

const DEFAULT_BUDGET = 256;

function readBudget(): number {
  const env = (globalThis as any).process?.env?.HOODY_TUNNEL_SDK_MAX_LOCAL_SOCKETS;
  if (!env) return DEFAULT_BUDGET;
  const n = parseInt(env, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BUDGET;
  return Math.min(n, 4096);
}

class FdBudget {
  private capacity: number;
  private inUse = 0;
  private waiters: Array<() => void> = [];

  constructor() {
    this.capacity = readBudget();
  }

  /** Try to acquire one permit immediately. Returns true on success. */
  tryAcquire(): boolean {
    if (this.inUse >= this.capacity) return false;
    this.inUse++;
    return true;
  }

  /** Acquire one permit, waiting up to `timeoutMs`. Resolves true on acquire,
   * false on timeout. */
  acquire(timeoutMs: number = 5000): Promise<boolean> {
    if (this.tryAcquire()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      // Single `waker` closure owns the timer and resolves atomically via
      // `state`. A two-step approach (register release then wrap it, or let
      // release and timer both mutate waiters) lets a timer-waker race
      // decrement `inUse` while the woken promise resolves false — leaking
      // the permit until the budget self-exhausts.
      let state: 'pending' | 'granted' | 'timeout' = 'pending';
      let timer: ReturnType<typeof setTimeout> | null = null;

      const waker = () => {
        if (state !== 'pending') return;
        state = 'granted';
        if (timer) { clearTimeout(timer); timer = null; }
        this.inUse++;
        resolve(true);
      };

      this.waiters.push(waker);

      timer = setTimeout(() => {
        if (state !== 'pending') return;
        state = 'timeout';
        const idx = this.waiters.indexOf(waker);
        if (idx >= 0) this.waiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
    });
  }

  /** Release one permit. Wakes a waiter if any. */
  release() {
    if (this.inUse <= 0) return;
    this.inUse--;
    // Drain stale (timed-out) wakers until we find a still-pending one or
    // exhaust the queue. Each waker self-guards against the timed-out state
    // so invoking a stale one is a no-op, but stopping at one would waste
    // this release-cycle's permit. If the queue has only stale entries or is
    // empty, the permit returns to the pool (inUse stays decremented).
    const before = this.inUse;
    while (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      next(); // no-op if stale; re-increments inUse if still pending
      if (this.inUse > before) {
        // A waker actually claimed the permit — done.
        return;
      }
      // Else stale waker — keep scanning.
    }
  }

  /** Snapshot for telemetry. */
  metrics() {
    return { capacity: this.capacity, inUse: this.inUse, waiters: this.waiters.length };
  }
}

export const sdkLocalFdBudget = new FdBudget();
