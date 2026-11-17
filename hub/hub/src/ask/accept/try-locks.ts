// navigator.locks for the fork tests: exclusive, first come first served, microtask grants (so the manual-clock flush drives them), and
// `ifAvailable` honoured (a held name answers the callback with null at once). The suite's default lock grants every request in turn, which a
// try-lock cannot be tested against; core/test/web-locks.ts grants on real timers, which the manual-clock worlds do not drive.
// The returned function puts the previous lock back.
export function installTryLocks(): () => void {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  const run = (name: string, cb: (lock: unknown) => unknown): Promise<unknown> => {
    held.add(name);
    return Promise.resolve().then(() => cb({ name })).finally(() => { held.delete(name); const next = waiting.get(name)?.shift(); if (next) next(); });
  };
  const locks = {
    request(name: string, a: unknown, b?: unknown): Promise<unknown> {
      const opts = (typeof a === 'function' ? {} : a) as { ifAvailable?: boolean };
      const cb = (typeof a === 'function' ? a : b) as (lock: unknown) => unknown;
      if (opts.ifAvailable) return held.has(name) ? Promise.resolve().then(() => cb(null)) : run(name, cb);
      return new Promise((resolve, reject) => {
        const go = () => run(name, cb).then(resolve, reject);
        if (!held.has(name)) go(); else (waiting.get(name) ?? waiting.set(name, []).get(name)!).push(go);
      });
    },
  };
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const had = Object.getOwnPropertyDescriptor(nav, 'locks');
  Object.defineProperty(nav, 'locks', { configurable: true, writable: true, value: locks });
  return () => { if (had) Object.defineProperty(nav, 'locks', had); else delete nav.locks; };
}
