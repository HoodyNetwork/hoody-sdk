// The browser-only part of allChats.ts (split out so the rest is shared with the terminal build): waiting for the page
// to be shown before the change feed reconnects. allChats.ts imports it.

/** Runs `go` now when the page is visible, else once it is shown again; the returned function cancels. */
export function whenVisible(go: () => void): () => void {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') { go(); return () => {}; }
  const on = () => { if (document.visibilityState !== 'hidden') { document.removeEventListener('visibilitychange', on); go(); } };
  document.addEventListener('visibilitychange', on);
  return () => document.removeEventListener('visibilitychange', on);
}

