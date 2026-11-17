// The browser-only part of broadcaster.ts (split out so the rest is shared with the terminal build): the page
// visibility the broadcaster pauses by when its deps name none. broadcaster.ts imports it.

export function docVisibility(): { hidden(): boolean; on(fn: () => void): () => void } {
  return {
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    on: (fn) => { document.addEventListener('visibilitychange', fn); return () => document.removeEventListener('visibilitychange', fn); },
  };
}

