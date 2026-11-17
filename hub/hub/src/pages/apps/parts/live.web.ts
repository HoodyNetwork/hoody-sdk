// The browser-only part of live.ts (split out so the rest of live.ts is shared with the terminal build): hearing
// another tab's storage writes.

/** Calls `on` on every storage event (another tab's write); returns the unsubscribe. */
export function listenStorage(on: (e: StorageEvent) => void): () => void {
  window.addEventListener('storage', on);
  return () => window.removeEventListener('storage', on);
}
