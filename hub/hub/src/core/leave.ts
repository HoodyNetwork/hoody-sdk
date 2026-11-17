// Leave guard: work running from this tab holds a leave guard. While any is
// held, closing or reloading the tab asks first (the browser's own beforeunload prompt), and the shell asks before a
// realm switch or a sign-out (askLeave). In-app navigation never asks: the document lives on, so the work keeps going.
// - holdLeave(kind) returns its release. Releasing twice changes nothing; a release is the only way a hold ends.
// - The beforeunload listener is added when the first hold starts and removed when the last ends, so a tab with
//   nothing running never asks (and keeps the browser's back-forward cache). Each arming has a listener of its own that
//   answers only while it is current: a host that cannot remove one (an unsubscribe that throws, even after removing it)
//   leaves it inert, the removal is tried again later, and the next hold arms a new one.
// - askLeave() resolves true straight away while nothing runs. Otherwise the mounted shell's asker decides
//   (shell/LeaveConfirm); with none mounted nobody can be asked, so it answers Stay (the shell mounts the dialog
//   wherever a realm switch or a sign-out can start). What the person confirms only lets the switch go on:
//   the work itself is cut by its own context end, and each item then reads "may have gone through" until checked.
// - askLeave(wanted) passes the caller's own check that its question still matters (a realm switch: still the live
//   switch). The asker re-checks it on every core change and answers Stay for that caller once it is false, so a
//   switch cancelled or superseded while asked leaves no question up.
// - Unsaved work a page registered (switch-guard.ts) asks too, though nothing runs: the asker shows what it names
//   and records what it showed at the press; a true answer covers only those (a caller checks lossesCovered()).
// - The state lives on one global, so a module replaced while the page lives (the dev server's hot update) keeps the
//   holds and the one listener instead of starting from none.
import { useSyncExternalStore } from 'react';
import { hostEnv, type HostLifecycleEvent } from './host-env';
import { noteLossesConfirmed, switchLosses } from './switch-guard';

/** What runs: uploads, copies and deletes on one computer, publish steps, queued pulls. */
export type LeaveKind = 'upload' | 'copy' | 'delete' | 'publish' | 'pull';

/** One arming of the unload prompt: its listener answers only while `live`, so a listener the host failed to remove is inert. */
interface Arm { live: boolean; off: () => void }
interface LeaveState {
  holds: Map<number, LeaveKind>;
  listeners: Set<() => void>;
  seq: number;
  asker: ((count: number, wanted?: () => boolean) => Promise<boolean>) | null;
  /** The unload warning of the holds running now; null while no hold runs. */
  arm: Arm | null;
  /** Unsubscribes of earlier armings the host threw on: tried again, never relied on (their listeners are not live). */
  failed: Array<() => void>;
}
// One state per page, shared by every copy of this module; its own key, so no other layout is ever adopted.
const KEY = Symbol.for('hoody.hub.leave.3');
const g = globalThis as unknown as Record<symbol, LeaveState | undefined>;
const S: LeaveState = g[KEY] ?? (g[KEY] = {
  holds: new Map(), listeners: new Set(), seq: 0, asker: null, arm: null, failed: [],
});
const holds = S.holds;
const listeners = S.listeners;

/** Adds the unload prompt for a new run of holds: a fresh listener of its own, whatever happened to an earlier one. */
function armPrompt(): void {
  const a: Arm = { live: true, off: () => {} };
  const onBeforeUnload = (e: Extract<HostLifecycleEvent, { type: 'beforeunload' }>): void => {
    if (!a.live) return; // a prompt the host could not remove stays inert
    e.preventDefault();
    // Older engines show the prompt only for a set returnValue.
    e.setReturnValue('');
  };
  retryFailed();
  a.off = hostEnv().onLifecycle('beforeunload', onBeforeUnload);
  S.arm = a;
}

/** Tries the removals the host threw on again; those that throw again are kept. */
function retryFailed(): void {
  const again = S.failed;
  S.failed = [];
  for (const off of again) {
    try { off(); } catch { S.failed.push(off); }
  }
}

/** Ends the unload prompt of the holds that ended. The listener stops answering first; a host unsubscribe that throws
 *  is kept for a later try (it may have removed nothing) and is never taken to mean the listener is still wanted. */
function disarm(rethrow: boolean): void {
  const a = S.arm;
  if (!a) return;
  S.arm = null;
  a.live = false;
  try { a.off(); } catch (e) {
    S.failed.push(a.off);
    if (rethrow) throw e;
  }
}

function changed(before: number): void {
  const now = holds.size;
  if (before === 0 && now > 0) armPrompt();
  else if (before > 0 && now === 0) disarm(false);
  for (const l of [...listeners]) {
    try { l(); } catch { /* a listener's fault stays its own */ }
  }
}

/** Holds the leave guard for one piece of running work; call the returned function when it ends, however it ends. */
export function holdLeave(kind: LeaveKind): () => void {
  const id = ++S.seq;
  const before = holds.size;
  holds.set(id, kind);
  changed(before);
  return () => {
    if (!holds.has(id)) return;
    const b = holds.size;
    holds.delete(id);
    changed(b);
  };
}

/** How many pieces of work run from this tab now. */
export function leaveCount(): number {
  return holds.size;
}

/** Calls `fn` on every change of the count; returns the unsubscribe. */
export function onLeaveCount(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The count, live (React). */
export function useLeaveCount(): number {
  return useSyncExternalStore(onLeaveCount, leaveCount, leaveCount);
}

/** The shell registers the dialog that asks; returns the unregister (only the registered asker is removed). */
export function setLeaveAsker(fn: (count: number, wanted?: () => boolean) => Promise<boolean>): () => void {
  S.asker = fn;
  return () => { if (S.asker === fn) S.asker = null; };
}

/** Before a realm switch or a sign-out: true when nothing runs and no page names unsaved work, else what the person
 *  chose (false = stay). `wanted` (optional): false (or a throw) once the question no longer matters; then the answer
 *  is Stay, asked or not. */
export async function askLeave(wanted?: () => boolean): Promise<boolean> {
  // A caller that no longer wants an answer gets Stay first, whatever runs.
  if (wanted) { try { if (wanted() !== true) return false; } catch { return false; } }
  // What an earlier question confirmed covers nothing here (switch-guard.ts lossesCovered).
  noteLossesConfirmed([]);
  const n = holds.size;
  if (n === 0 && switchLosses().length === 0) return true;
  const ask = S.asker;
  if (!ask) return false;
  try { return (await (wanted ? ask(n, wanted) : ask(n))) === true; } catch { return false; }
}

/** Every hold ended, the unload prompt disarmed, the asker dropped and the count listeners told, then cleared (session
 *  disposal, dispose.ts; tests). Ids keep counting up, so a release function from before is a no-op. The bookkeeping is
 *  cleared first: a host unsubscribe that throws leaves no hold and no listener here (the prompt it failed to remove
 *  is no longer current, and the next hold tries the removal again), and its error is then thrown. */
export function resetLeave(): void {
  const told = [...listeners];
  holds.clear();
  S.asker = null;
  listeners.clear();
  try {
    disarm(true);
  } finally {
    for (const l of told) {
      try { l(); } catch { /* a listener's fault stays its own */ }
    }
  }
}
