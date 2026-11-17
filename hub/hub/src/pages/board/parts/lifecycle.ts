// Start / Resume from a tile's card (C9): only through core's shared computer lifecycle change.
//
// Contract, in plain words:
//   - powerOf(computer) says what the card offers: Resume for a paused computer, Start for a stopped one. A press
//     runs computerLifecycle (its lock is the Computers and Bots pages' too, keyed by the computer), then reads the
//     Board's computers again.
//   - busy: this page is sending, or a change of that computer may have gone through on any page (core's held
//     changes): every tile of that computer shows "Starting…" and no button. pending: the outcome is unknown, so the
//     card offers Check again, which is computerLifecycle.readBack (a read, never a resend), then the Board's read.
//   - A held change (any page, any operation: start, stop, restart, …) also makes a Power for a computer the card
//     would not offer Start for (op null): heldOp names it. Check again reads back THAT operation; a held restart
//     has no read that proves it (core), so it offers no Check again. dismiss() is the person's warned Dismiss
//     (computerLifecycle.dismiss with the shown send's hold token: core frees that one send only; the view confirms
//     first), the only other way out. holdId names that send, so the view can bind its warning to it: a warning
//     opened for one send never frees another (another tab's newer send can replace the shown one in place).
//   - The Board is its own sender (core's computerLifecycle.forPage('board')): a held change another page sent is
//     that page's to check or dismiss (core frees only a sender's own), so its Power says ownHold false, heldFrom
//     names the sending page (core's HeldChange.from), and the card sends the person there instead of offering
//     buttons that would do nothing here.
//   - A definite refusal keeps its outcome (with core's error text) until the next press; a done start shows
//     "Starting…" until the Board's read shows the computer in another state.
//   - A press that settles while a kept Board is hidden (useKeepPage: its effects stop) lands when the Board shows
//     again, never dropped: the tile does not stay "Starting…" with nothing in flight.
import { computerLifecycle as sharedLifecycle, heldChanges, lifecycleLock, LIFECYCLE_OPS, useChangesVersion, useRealms, type HeldFrom, type LifecycleOp } from '@core';
import type { OutcomeLike } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardComputer } from '../computers';

export interface Power {
  /** What the card's button sends; null when only a held change made this Power. */
  readonly op: 'start' | 'resume' | null;
  /** The held change's operation (pending), or null. */
  readonly heldOp: LifecycleOp | null;
  /** The held change is this page's own (it can check and dismiss it); false: another page sent it. */
  readonly ownHold: boolean;
  /** The shown own held send (core's hold token), or null: what dismiss() frees, the identity a warning binds to. */
  readonly holdId: string | null;
  /** The page that sent a held change another page sent (core's HeldChange.from), or null (own, none, or unnamed). */
  readonly heldFrom: HeldFrom | null;
  /** Sending here, or a change of this computer may have gone through anywhere. */
  readonly busy: boolean;
  /** The outcome is unknown (Check again). */
  readonly pending: boolean;
  /** A definite refusal (failed, not sent, stale), shown inline. */
  readonly outcome: OutcomeLike | null;
  run(): void;
  check(): Promise<boolean>;
  /** Frees the held send the view showed, named by its token (holdId as read when the warning opened), without proof
   *  (the view's warned Dismiss). False: nothing was freed (not this page's, `shown` is not the send held now, e.g.
   *  another tab replaced it, or no hold was named). */
  dismiss(shown: string | null): Promise<boolean>;
}

export const powerOp = (c: BoardComputer): 'start' | 'resume' | null => {
  const s = String(c.status ?? '').toLowerCase();
  return s === 'paused' ? 'resume' : s === 'stopped' ? 'start' : null;
};

/** This page's sender of core's shared lifecycle change. */
const computerLifecycle = sharedLifecycle.forPage('board');
const PAGE = 'board';

const isOp = (v: unknown): v is LifecycleOp => typeof v === 'string' && (LIFECYCLE_OPS as readonly string[]).includes(v);
// computer id → the held change's operation (core's identity {computer, op}; the newest one when several), as the
// realm shown sees it (core's lock is the physical computer's in every realm view). from: the sending page.
// hold: core's token of that one send (HeldChange.hold), the one the tile shows: Dismiss passes it, so core frees
// that send only, never a later send of the same change nor another realm's (core requires it).
interface Held { readonly op: LifecycleOp; readonly own: boolean; readonly from: HeldFrom | null; readonly at: number; readonly hold: string | undefined }
const heldOps = (realm: string): Map<string, Held> => {
  const out = new Map<string, Held>();
  for (const h of heldChanges(lifecycleLock.lock, { realm })) {
    const id = (h.identity as { computer?: unknown; op?: unknown } | null);
    if (!id || typeof id.computer !== 'string' || !isOp(id.op)) continue;
    const was = out.get(id.computer);
    if (!was || h.at >= was.at) out.set(id.computer, { op: id.op, own: h.from?.page === PAGE, from: h.from, at: h.at, hold: h.hold });
  }
  return out;
};

export function useBoardPower(rows: readonly BoardComputer[] | null, reread: () => void): (c: BoardComputer | null) => Power | null {
  const version = useChangesVersion();
  const realm = useRealms().selected;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the registry's change signal (heldOps reads it)
  const held = useMemo(() => heldOps(realm), [version, realm]);
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<Readonly<Record<string, { op: LifecycleOp; outcome: OutcomeLike | 'done' }>>>({});
  // Set on every mount: StrictMode mounts, unmounts and mounts again, and a settled press must still land. A press
  // that settles while the effects are stopped (a kept Board hidden) waits in `late` and lands on the next mount; one
  // whose Board unloaded is dropped with it.
  const live = useRef(false);
  const late = useRef<Array<() => void>>([]);
  useEffect(() => {
    live.current = true;
    for (const land of late.current.splice(0)) land();
    return () => { live.current = false; };
  }, []);
  // A done start waits for the Board's read to show the computer in another state; then it is forgotten.
  useEffect(() => {
    setResult((r) => {
      const keep = Object.entries(r).filter(([id, x]) => {
        if (x.outcome !== 'done') return true;
        const row = rows?.find((c) => c.id === id);
        return !!row && powerOp(row) !== null;
      });
      return keep.length === Object.keys(r).length ? r : Object.fromEntries(keep);
    });
  }, [rows]);
  // One send per computer from this page at a time (the button is hidden while sending, this is the backstop).
  const inFlight = useRef(new Set<string>());
  const run = useCallback(async (id: string, op: LifecycleOp) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setSending((s) => new Set(s).add(id));
    setResult(({ [id]: _, ...rest }) => rest);
    const r = await computerLifecycle.run({ id, op }).finally(() => inFlight.current.delete(id));
    const land = () => {
      setSending((s) => { const n = new Set(s); n.delete(id); return n; });
      // A refusal that only says another change holds the lock (BUSY, READ_BACK_FIRST) or that the realm moved (stale)
      // is not this computer's outcome: the held state, or the next read, shows what is true.
      const code = r.error?.code;
      const notMine = r.outcome === 'stale' || (r.outcome === 'not_sent' && (code === 'BUSY' || code === 'READ_BACK_FIRST' || code === 'HELD_BY_OTHER'));
      if (r.outcome === 'done') setResult((x) => ({ ...x, [id]: { op, outcome: 'done' } }));
      else if (r.outcome !== 'pending' && !notMine) setResult((x) => ({ ...x, [id]: { op, outcome: { kind: r.outcome, ...(r.error?.message ? { message: r.error.message } : {}) } as OutcomeLike } }));
      reread();
    };
    if (live.current) land();
    else late.current.push(land);
  }, [reread]);
  return (c) => {
    if (!c) return null;
    const op = powerOp(c);
    const hold = held.get(c.id) ?? null;
    const heldOp = hold?.op ?? null;
    if (!op && !heldOp) return null;
    const res = result[c.id];
    const pending = heldOp !== null && !sending.has(c.id);
    return {
      op,
      heldOp: pending ? heldOp : null,
      ownHold: !!hold?.own && !!hold.hold,
      holdId: pending && hold?.own && hold.hold ? hold.hold : null,
      heldFrom: pending && hold && !hold.own ? hold.from : null,
      busy: sending.has(c.id) || held.has(c.id) || res?.outcome === 'done',
      pending,
      outcome: res && res.outcome !== 'done' ? res.outcome : null,
      run: () => { if (op) void run(c.id, op); },
      check: async () => {
        if (hold && !hold.own) return false;
        const which = hold?.op ?? op;
        if (!which) return false;
        const ok = await computerLifecycle.readBack({ id: c.id, op: which });
        // Proven: hold "Starting…" until the Board's own read shows the new state, so no Start flashes in between.
        if (ok && (which === 'start' || which === 'resume')) setResult((x) => ({ ...x, [c.id]: { op: which, outcome: 'done' } }));
        reread();
        return ok;
      },
      dismiss: async (shown) => {
        // Only the send the view showed (its token): core frees that send only, never a later one.
        const ok = hold?.own && hold.hold && shown === hold.hold ? await computerLifecycle.dismiss({ id: c.id, op: hold.op }, hold.hold) : false;
        reread();
        return ok;
      },
    };
  };
}
