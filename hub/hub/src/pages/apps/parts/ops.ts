// What this session did to the open list (C9). Module state, never a node: a redraw, a refresh or a remount shows
// the same list. A launch that may have gone through stays "unknown" until it is read back, and holds a second
// Open of its app until then; only a confirmed Dismiss (warned it may start a second copy) lifts that (C9).
import { useSyncExternalStore } from 'react';
import { onAuthPurge } from '@core';
import type { LaunchState, OpenApp } from '../logic';
import type { StoredRow } from './recent';

/** What a request learned about a row: its state and reason, and (live) where it runs once the core admitted it. */
export interface Patch extends Partial<Pick<OpenApp, 'exitCode' | 'signal' | 'ipv6Only' | 'terminal' | 'handle' | 'urls' | 'opensIn' | 'asksCode' | 'planned' | 'p' | 'phase'>> {
  state?: LaunchState;
  code?: string;
  /** A request is in flight for this row. */
  busy?: 'stop' | 'check' | 'restart' | 'open';
  /** The access code, kept in memory only, until this page is left. */
  accessCode?: string;
  /** A one-line note in the row's action cell and the inspector: a held second
   * launch, a failed restart, a Forget that didn't go through. Replaces toasts for things with a place. */
  note?: 'held' | 'opening' | 'restartFailed' | 'restartFailedUnknown' | 'restartUnconfirmed' | 'notForgotten' | 'stopFailed' | 'execOff' | 'restartHeld' | 'restartRefused' | 'restartKept' | 'openRefused' | 'openKept' | 'removeUnconfirmed';
}

interface Snapshot {
  launches: readonly OpenApp[];
  patches: ReadonlyMap<string, Patch>;
  forgotten: ReadonlySet<string>;
  /** Starters whose sharing note was confirmed (handles only). */
  acked: ReadonlySet<string>;
  /** Live only: the core's handle of each row the core admitted (row key → its recent-list row). */
  runs: ReadonlyMap<string, StoredRow>;
  /** Moves on every reset (an account or realm switch): a request begun before it writes nothing after. */
  epoch: number;
}

let snap: Snapshot = { launches: [], patches: new Map(), forgotten: new Set(), acked: new Set(), runs: new Map(), epoch: 0 };
const listeners = new Set<() => void>();

function commit(next: Partial<Snapshot>): void {
  hookPurge();
  snap = { ...snap, ...next };
  for (const l of listeners) l();
}

// The store ends with the session, as Programs' held operations do (programs/parts/ops.ts). On the web a session's end
// is a page load, which empties module state by itself; a terminal process goes on to the next session (sign-out and
// back in, the next account), which must not show the last one's launches, notes or removed rows. Hooked at the first
// change kept: a page that never makes one registers nothing.
let purgeHooked = false;
function hookPurge(): void {
  if (purgeHooked) return;
  purgeHooked = true;
  try {
    onAuthPurge(() => { ops.reset(); });
  } catch {
    /* a unit test's partial @core mock has no purge; the app's core always does */
  }
}

export const ops = {
  get: (): Snapshot => snap,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  addLaunch(app: OpenApp, at: 'top' | 'end' = 'top'): void {
    const rest = snap.launches.filter((x) => x.key !== app.key);
    commit({ launches: at === 'top' ? [app, ...rest] : [...rest, app] });
  },
  patch(key: string, p: Patch): void {
    const cur = snap.patches.get(key) ?? {};
    const next = new Map(snap.patches);
    next.set(key, { ...cur, ...p });
    commit({ patches: next });
  },
  /** Drops a field of a patch (the busy mark when a request settles). */
  unset(key: string, field: keyof Patch): void {
    const cur = snap.patches.get(key);
    if (!cur) return;
    const { [field]: _gone, ...rest } = cur;
    const next = new Map(snap.patches);
    next.set(key, rest);
    commit({ patches: next });
  },
  forget(key: string): void {
    commit({ forgotten: new Set(snap.forgotten).add(key) });
  },
  unforget(key: string): void {
    const next = new Set(snap.forgotten);
    next.delete(key);
    commit({ forgotten: next });
  },
  /** Live: the row's handle, once the core admitted the launch. */
  bind(key: string, row: StoredRow): void {
    commit({ runs: new Map(snap.runs).set(key, row) });
  },
  /** Live: the row no longer has a handle (its launch definitely did not start). */
  unbind(key: string): void {
    const next = new Map(snap.runs);
    next.delete(key);
    commit({ runs: next });
  },
  ack(id: string): void {
    commit({ acked: new Set(snap.acked).add(id) });
  },
  /** Bumped by every wipe: a code asked for before it is dropped when it answers. */
  codeGen: 0,
  /** Forgets every access code held in memory (the page is left). */
  wipeCodes(): void {
    ops.codeGen++;
    const next = new Map<string, Patch>();
    for (const [k, p] of snap.patches) {
      const { accessCode: _c, ...rest } = p;
      next.set(k, rest);
    }
    commit({ patches: next });
  },
  reset(): void {
    snap = { launches: [], patches: new Map(), forgotten: new Set(), acked: new Set(), runs: new Map(), epoch: snap.epoch + 1 };
    for (const l of listeners) l();
  },
};

export function useOps(): Snapshot {
  return useSyncExternalStore(ops.subscribe, ops.get, ops.get);
}

/** The server's rows with this session's launches on top, patches applied, forgotten rows gone. */
export function merge(server: readonly OpenApp[] | undefined, s: Snapshot): OpenApp[] {
  const rows = [...s.launches, ...(server ?? []).filter((r) => !s.launches.some((l) => l.key === r.key))];
  return rows.filter((r) => !s.forgotten.has(r.key)).map((r) => {
    const p = s.patches.get(r.key);
    if (!p) return r;
    const { busy: _b, accessCode: _a, ...rest } = p;
    return { ...r, ...rest };
  });
}
