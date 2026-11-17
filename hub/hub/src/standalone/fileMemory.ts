// fileMemory.ts: the standalone Hub opened as a file keeps nothing on this computer.
//
// Why: a browser gives every local HTML file one shared storage, so any other file opened in the same browser could
// read what this page stores, the sign-in included. On file:// the page therefore keeps its sign-in and settings in
// memory only: closing or reloading the page signs out there (the first-run screen says so).
//
// Contract:
//   - installFileMemory runs as the FIRST inline script of the one-file build (build-single-assemble.ts puts
//     FILE_MEMORY_SCRIPT ahead of fouc.js and shared.js), before any code reads a store.
//   - On file:// it replaces localStorage and sessionStorage with in-memory stores of the same shape and removes the
//     stores no in-memory copy can stand in for (IndexedDB, Cache Storage) and BroadcastChannel (another local file
//     could listen on the same channel name); code that finds them missing already works without them.
//   - It never fails quietly: a store it cannot replace marks the page `data-hub-memory-only="failed"` and the
//     function answers 'failed' (boot.ts then refuses to sign in). Anything but file:// is left alone ('off').
//   - The function is self-contained (no import, no closure over module scope): the build inlines its source text.

export type FileMemory = 'off' | 'on' | 'failed';

/** Makes `w` (the page's window) keep nothing on disk when it was opened as a file. */
export function installFileMemory(w: Record<string, unknown>): FileMemory {
  const loc = w.location as { protocol?: unknown } | undefined;
  if (!loc || loc.protocol !== 'file:') return 'off';
  const memoryStore = () => {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; },
      key(i: number) { const k = Array.from(m.keys())[i]; return k === undefined ? null : k; },
      getItem(k: string) { const v = m.get(String(k)); return v === undefined ? null : v; },
      setItem(k: string, v: string) { m.set(String(k), String(v)); },
      removeItem(k: string) { m.delete(String(k)); },
      clear() { m.clear(); },
    };
  };
  let ok = true;
  const shadow = (name: string, value: unknown) => {
    try {
      Object.defineProperty(w, name, { value, configurable: true, enumerable: true, writable: false });
      if (w[name] !== value) ok = false;
    } catch {
      ok = false;
    }
  };
  shadow('localStorage', memoryStore());
  shadow('sessionStorage', memoryStore());
  shadow('indexedDB', undefined);
  shadow('caches', undefined);
  shadow('BroadcastChannel', undefined);
  const doc = w.document as { documentElement?: { setAttribute?: (k: string, v: string) => void } } | undefined;
  try {
    doc?.documentElement?.setAttribute?.('data-hub-memory-only', ok ? '' : 'failed');
  } catch {
    ok = false;
  }
  return ok ? 'on' : 'failed';
}

/** The classic inline script the one-file build runs first. */
export const FILE_MEMORY_SCRIPT = `(${installFileMemory.toString()})(window);`;

/** Whether this page keeps its sign-in in memory only ('on'), could not be made to ('failed'), or stores normally. */
export function fileMemoryState(doc: Document = document): FileMemory {
  const v = doc.documentElement.getAttribute('data-hub-memory-only');
  return v === null ? 'off' : v === '' ? 'on' : 'failed';
}
