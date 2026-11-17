// navigator.locks with shared/exclusive modes, ifAvailable and query(), for the tab lock tests (test/locks.ts, the
// suite's default, is exclusive-only and has no query): host-locks-memory.ts's manager put on navigator.locks. Every
// request is made as the current client: asClient(id, fn) makes the requests fn starts synchronously another tab's,
// and closeClient(id) releases what that tab held and drops what it waited for, as closing the tab does. Grants are
// asynchronous and first come, first served per name.
import { createMemoryLocks, type MemoryLocks } from '../host-locks-memory';

export type WebLocks = Pick<MemoryLocks, 'asClient' | 'closeClient' | 'held'>;

export function installWebLocks(o: { noQuery?: boolean } = {}): WebLocks {
  const m = createMemoryLocks(o);
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, writable: true, value: m.locks });
  return { asClient: m.asClient, closeClient: m.closeClient, held: m.held };
}

/** Another tab opening: it takes the Hub tab lock as tab-lock.ts holdTabLock does (hub-wipe shared, then hub-tab
 *  shared, held), as client `id`. */
export function openOtherTab(l: WebLocks, id: string): void {
  l.asClient(id, () => {
    const locks = (globalThis.navigator as unknown as { locks: { request: (n: string, o: object, cb: () => unknown) => Promise<unknown> } }).locks;
    void locks.request('hub-wipe', { mode: 'shared' }, () => new Promise<void>((through) => {
      l.asClient(id, () => {
        void locks.request('hub-tab', { mode: 'shared' }, () => { through(); return new Promise<void>(() => {}); });
      });
    }));
  });
}
