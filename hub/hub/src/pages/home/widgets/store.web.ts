// The browser-only part of store.ts (split out so the rest is shared with the terminal build): the Hub's own origin,
// which a widget address is judged against and cards are built with.

export const hubOrigin = (): string => {
  try { return globalThis.location?.origin ?? ''; } catch { return ''; }
};
