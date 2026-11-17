// listeners.ts: the listener set core's change notices share. emit runs a snapshot, so a listener may unsubscribe
// itself or add another while it runs, and a throw in one listener never reaches the emitter or the listeners after
// it. A store whose listeners take arguments or answer (lifecycle, notifications) keeps its own loop.

export interface Listeners {
  /** Adds `fn` (adding the same function again is the same entry); returns its unsubscribe. */
  add(fn: () => void): () => void;
  emit(): void;
  clear(): void;
  readonly size: number;
}

export function createListeners(): Listeners {
  const set = new Set<() => void>();
  return {
    add(fn) {
      set.add(fn);
      return () => { set.delete(fn); };
    },
    emit() {
      for (const l of [...set]) {
        try { l(); } catch { /* the listener's own */ }
      }
    },
    clear() { set.clear(); },
    get size() { return set.size; },
  };
}
