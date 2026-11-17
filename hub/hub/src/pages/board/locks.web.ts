// The browser's Web Locks, the one browser read of the Boards store (split out of data.ts and closed.ts so the rest of
// both is shared with the terminal build). Read at each call, so a test's stubbed navigator.locks is seen.

/** The lock manager, or undefined where the browser has none (callers then store nothing). */
export const browserLocks = (): LockManager | undefined => (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
