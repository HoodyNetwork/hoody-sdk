// tab-lock.ts: which Hoody Hub tabs this browser has open (Remove all local data).
//
// Contract:
//   - holdTabLock(): every Hub tab holds the Web Lock TAB_LOCK ('hub-tab') in shared mode for as long as it lives
//     (lifecycle.ts initLive takes it once). It asks for it while holding WIPE_LOCK ('hub-wipe') in shared mode, so
//     a tab opened while a wipe holds WIPE_LOCK exclusively does not hold TAB_LOCK until that wipe has ended (its
//     request waits; the tab itself still runs). Without navigator.locks, or when a request throws, nothing is held.
//   - tabHeld(): true once this tab holds TAB_LOCK.
//   - otherTabs(o): 'alone' only when navigator.locks answers a query in which TAB_LOCK is held exactly once and this
//     tab holds it; with `waiting` also no tab is waiting for TAB_LOCK or WIPE_LOCK (a tab being opened). Anything
//     else is 'open' (another tab holds or waits) or 'unknown' (no lock API, no query, a query that throws or answers
//     something else, or this tab does not hold its own lock yet): never taken for alone.
//   - withWipeLock(fn): runs fn holding WIPE_LOCK exclusively, only when no other tab holds or waits for it (asked
//     with ifAvailable); 'busy' otherwise, 'unknown' without the lock API. fn's own promise decides how long the lock
//     is held (navigator.locks releases it when that promise settles, or when the page goes away).
import { hostEnv } from './host-env';

export const TAB_LOCK = 'hub-tab';
export const WIPE_LOCK = 'hub-wipe';

type LockInfo = { name?: unknown; mode?: unknown; clientId?: unknown };
type LockQuery = { held?: LockInfo[]; pending?: LockInfo[] };
type Locks = {
  request: (name: string, o: { mode?: 'shared' | 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal }, cb: (lock: unknown) => unknown) => Promise<unknown>;
  query?: () => Promise<LockQuery>;
};

function locksApi(): Locks | null {
  try {
    const l = hostEnv().locks as Locks | null;
    return l && typeof l.request === 'function' ? l : null;
  } catch {
    return null;
  }
}

let asked = false;
let held = false;
// A reset (session disposal) ends what this tab asked for or holds: `epoch` fences the late grants of an earlier ask, `ask`
// aborts the requests still waiting, `release` ends the granted TAB_LOCK (navigator.locks frees it when the callback's promise settles).
let epoch = 0;
let ask: AbortController | null = null;
let release: (() => void) | null = null;

/** Hold this tab's TAB_LOCK for the life of the page (see the contract). Asked once; later calls do nothing. */
export function holdTabLock(): void {
  if (asked) return;
  const locks = locksApi();
  if (!locks) return;
  asked = true;
  const mine = epoch;
  const ctl = new AbortController();
  ask = ctl;
  try {
    void locks.request(WIPE_LOCK, { mode: 'shared', signal: ctl.signal }, () => new Promise<void>((through) => {
      if (mine !== epoch) { through(); return; }
      try {
        void locks.request(TAB_LOCK, { mode: 'shared', signal: ctl.signal }, () => {
          if (mine !== epoch) { through(); return undefined; } // a reset came between the grant and this callback: nothing is held, and the WIPE_LOCK hold this sat in ends too
          held = true;
          through();
          return new Promise<void>((end) => { release = end; }); // held until the page goes away, or a reset
        }).catch(() => through());
      } catch {
        through();
      }
    })).catch(() => { /* nothing held */ });
  } catch { /* nothing held */ }
}

/** This tab holds its TAB_LOCK. */
export function tabHeld(): boolean { return held; }

export type OtherTabs = 'alone' | 'open' | 'unknown';

/** Whether another Hub tab is open (see the contract). */
export async function otherTabs(o: { waiting?: boolean } = {}): Promise<OtherTabs> {
  const locks = locksApi();
  if (!locks || typeof locks.query !== 'function' || !held) return 'unknown';
  let q: LockQuery;
  try { q = await locks.query(); } catch { return 'unknown'; }
  if (!q || !Array.isArray(q.held) || (o.waiting && !Array.isArray(q.pending))) return 'unknown';
  const tabs = q.held.filter((l) => l && l.name === TAB_LOCK).length;
  if (tabs === 0) return 'unknown';
  if (tabs > 1) return 'open';
  if (o.waiting && (q.pending ?? []).some((l) => l && (l.name === TAB_LOCK || l.name === WIPE_LOCK))) return 'open';
  return 'alone';
}

/** Run fn holding WIPE_LOCK exclusively (see the contract). */
export function withWipeLock<T>(fn: () => Promise<T>): Promise<T | 'busy' | 'unknown'> {
  const locks = locksApi();
  if (!locks) return Promise.resolve('unknown');
  try {
    return locks.request(WIPE_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) => (lock ? fn() : 'busy')).then(
      (r) => r as T | 'busy',
      () => 'unknown' as const,
    );
  } catch {
    return Promise.resolve('unknown');
  }
}

/** This tab's lock requests aborted, its TAB_LOCK released and the asked/held marks cleared (session disposal, dispose.ts; tests). */
export function resetTabLock(): void {
  epoch++;
  const end = release;
  const ctl = ask;
  asked = false;
  held = false;
  release = null;
  ask = null;
  if (ctl) ctl.abort();
  if (end) end();
}
