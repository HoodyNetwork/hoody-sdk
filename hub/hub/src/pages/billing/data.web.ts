// The browser-only part of billing's data.ts (split out so the rest of data.ts is shared with the terminal build):
// navigating to a payment provider's page and hearing another tab's storage writes. data.ts re-exports leaveTo.

/** Leaves for the provider's page (fixture pages never navigate away). */
export function leaveTo(url: string): void {
  if (!__HUB_FIXTURES__) window.location.assign(url);
}

/** Calls `l` on every storage event (another tab's write); returns the unsubscribe. */
export function onStorage(l: () => void): () => void {
  window.addEventListener('storage', l);
  return () => window.removeEventListener('storage', l);
}
