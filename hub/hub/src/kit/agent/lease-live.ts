// The attachment-lease manager's wiring to the page. kit/agent/lease.ts decides
// when a chat needs a lease and keeps it; this file is the only place that tells it the page is going or coming back, as
// approver-live.ts does for the approver lease. Callers of leases() do none of this.
//
//   - pagehide, and freeze (a frozen page runs nothing, so its renewals stop): releaseAll(). Every lease held is given back
//     with `keepalive`, nothing new is taken, and the demand is remembered by the handles.
//   - pageshow (a back/forward-cache return, and the first load, where it does nothing) and resume (thawed): resume().
//     The demand that is still there takes leases again.
//   - A change of account (core's bump `account`, `signout`, `logout`): reset(). The leases are dropped LOCALLY and no
//     DELETE goes out: the old account's identity may already be gone, a release under the wrong identity is the riskier
//     act, and a lease only keeps a chat open, so the agent's TTL ends an orphan. Every old handle goes dead; surfaces of the
//     new account track their own. A switch of realm or computer is not a change of account: a ref carries its own target.
//   - Each call to wireLeases() adds its listeners once; the returned function removes them (tests).
import { hostEnv, onBump as coreOnBump } from '@core';
import type { LeaseManager } from './lease';

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** The page's events and core's account bump; every field defaults to the page's own. */
export interface LeaseWiring {
  win?: Target | null;
  doc?: Target | null;
  onBump?: (l: (reason: string) => void) => () => void;
}

const ACCOUNT_BUMPS: ReadonlySet<string> = new Set(['account', 'signout', 'logout']);

export function wireLeases(m: LeaseManager, w: LeaseWiring = {}): () => void {
  // The page's own events exist only on a browser page (a terminal Hub is never frozen or cached: no pagehide there).
  const page = (w.win === undefined || w.doc === undefined) && hostEnv().browserPage === true;
  const win = w.win === undefined ? (page ? window : null) : w.win;
  const doc = w.doc === undefined ? (page ? document : null) : w.doc;
  const leave = (): void => m.releaseAll();
  const back = (): void => m.resume();
  const offs: Array<() => void> = [];
  const on = (t: Target | null, name: string, fn: () => void): void => {
    if (!t) return;
    t.addEventListener(name, fn);
    offs.push(() => t.removeEventListener(name, fn));
  };
  on(win, 'pagehide', leave);
  on(win, 'pageshow', back);
  on(doc, 'freeze', leave);
  on(doc, 'resume', back);
  offs.push((w.onBump ?? coreOnBump)((reason) => { if (ACCOUNT_BUMPS.has(reason)) m.reset(); }));
  return () => { for (const off of offs.splice(0)) off(); };
}
