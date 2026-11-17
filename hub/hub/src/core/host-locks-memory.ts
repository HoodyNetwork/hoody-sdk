// host-locks-memory.ts: an in-process lock manager with the Web Locks semantics core relies on: shared and exclusive
// modes, ifAvailable, an abort signal, and query() with held and pending. The terminal Hub installs one per mount
// session as HostEnv.locks; test/web-locks.ts puts one on navigator.locks. Every request is made as the current
// client: asClient(id, fn) makes the requests fn starts synchronously another client's, and closeClient(id) releases
// what that client held and drops what it waited for, as closing a tab does. Grants are asynchronous (never inside
// request()) and first come, first served per name.
import type { HostLocks } from './host-env';

type Mode = 'shared' | 'exclusive';
export type MemoryHeld = { name: string; mode: Mode; clientId: string };
type Waiting = MemoryHeld & { cb: (lock: unknown) => unknown; done: (v: unknown) => void; fail: (e: unknown) => void };

export interface MemoryLocks {
  /** The manager itself: what navigator.locks is on the web. */
  readonly locks: HostLocks;
  asClient<T>(id: string, fn: () => T): T;
  closeClient(id: string): void;
  held(): MemoryHeld[];
}

const abortError = (): Error => (typeof DOMException === 'function' ? new DOMException('The lock request is aborted', 'AbortError') : Object.assign(new Error('The lock request is aborted'), { name: 'AbortError' }));

/** `noQuery`: the manager answers no query() (a host that cannot; callers read that as unknown). */
export function createMemoryLocks(o: { noQuery?: boolean } = {}): MemoryLocks {
  let current = 'self';
  const held: MemoryHeld[] = [];
  const queue: Waiting[] = [];
  const free = (r: { name: string; mode: Mode }): boolean =>
    !held.some((h) => h.name === r.name && (h.mode === 'exclusive' || r.mode === 'exclusive'));
  const grant = (w: Waiting) => {
    const h: MemoryHeld = { name: w.name, mode: w.mode, clientId: w.clientId };
    held.push(h);
    let out: unknown;
    try { out = w.cb({ name: w.name, mode: w.mode }); } catch (e) { out = Promise.reject(e); }
    Promise.resolve(out).then(
      (v) => { const i = held.indexOf(h); if (i !== -1) held.splice(i, 1); w.done(v); pump(); },
      (e) => { const i = held.indexOf(h); if (i !== -1) held.splice(i, 1); w.fail(e); pump(); },
    );
  };
  const pump = () => {
    setTimeout(() => {
      for (let i = 0; i < queue.length; i++) {
        const w = queue[i]!;
        // First come, first served: an earlier waiter for the same name goes first.
        if (queue.slice(0, i).some((x) => x.name === w.name)) continue;
        if (!free(w)) continue;
        queue.splice(i, 1);
        i--;
        grant(w);
      }
    }, 0);
  };
  const request = (name: string, ...rest: unknown[]): Promise<unknown> => {
    const cb = rest[rest.length - 1] as (lock: unknown) => unknown;
    const opts = (rest.length > 1 ? rest[0] : {}) as { mode?: Mode; ifAvailable?: boolean; signal?: AbortSignal };
    const mode: Mode = opts.mode === 'shared' ? 'shared' : 'exclusive';
    const clientId = current;
    return new Promise((done, fail) => {
      const signal = opts.signal;
      if (signal?.aborted) { fail(abortError()); return; }
      const w: Waiting = { name, mode, clientId, cb, done, fail };
      if (opts.ifAvailable) {
        setTimeout(() => {
          if (free(w) && !queue.some((x) => x.name === name)) grant(w);
          else Promise.resolve().then(() => cb(null)).then(done, fail);
        }, 0);
        return;
      }
      // An abort while the request still waits drops it (and lets the waiters behind it go); once granted it is the callback's to end.
      signal?.addEventListener('abort', () => {
        const i = queue.indexOf(w);
        if (i === -1) return;
        queue.splice(i, 1);
        fail(abortError());
        pump();
      }, { once: true });
      queue.push(w);
      pump();
    });
  };
  const api: Record<string, unknown> = { request };
  if (!o.noQuery) {
    api.query = () => Promise.resolve({
      held: held.map((h) => ({ ...h })),
      pending: queue.map((w) => ({ name: w.name, mode: w.mode, clientId: w.clientId })),
    });
  }
  return {
    locks: api as unknown as HostLocks,
    asClient(id, fn) {
      const was = current;
      current = id;
      try { return fn(); } finally { current = was; }
    },
    closeClient(id) {
      for (let i = held.length - 1; i >= 0; i--) if (held[i]!.clientId === id) held.splice(i, 1);
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.clientId === id) queue.splice(i, 1);
      pump();
    },
    held: () => held.map((h) => ({ ...h })),
  };
}
