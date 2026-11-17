// One change at a time per place (C9): a second press while the first is out sends nothing, and an answer that
// may have gone through stays "pending" until the page reads the script back. Never resends.
import type { HeldRow } from '@core';
import type { OutcomeKind } from '@kit';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Out {
  kind: 'busy' | OutcomeKind;
  code?: string;
  /** For HELD_BY_OTHER: the page that sent the held change (null = unknown). */
  from?: HeldFrom | null;
}

/** Where a change held by another page came from: its page id and route. */
export interface HeldFrom {
  page: string;
  path: string;
}

/** A refusal because another page's change holds the same lock: it may have gone through, and only that page frees it. */
export const HELD_BY_OTHER = 'HELD_BY_OTHER';
export const heldByOther = (out: Out | null): boolean => out?.code === HELD_BY_OTHER;

export interface Answer<T> {
  outcome: OutcomeKind;
  data?: T;
  code?: string;
  heldFrom?: HeldFrom | null;
  /** Pending: the hold of this very send (core records it only for the press's own pending answer). */
  hold?: string;
}

/** A mutation whose held (pending) state core keeps across a remount. */
export interface Holdable {
  pending: boolean;
  /** Core's held sends of this change from any mount (HeldRow), and the Dismiss of exactly one by its token (true once
   *  core stored the free). */
  held?(): readonly HeldRow[];
  dismissHeld?(row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean>;
}

/** What a view needs of a held row to say whether it is this view's: the lock identity and the computer the send was made on. */
export type HeldOf = Pick<HeldRow, 'identity' | 'target'>;

/**
 * A change seen through one script on one computer: its pending state, its held rows and their Dismiss cover only the holds
 * `mine` accepts. Core's `pending` is per change key, so without this another script's hold (or the same path's on another
 * computer) would show here, and its Dismiss would free a hold this view never showed.
 */
export function forScript<M extends Holdable & { readBack(): Promise<boolean> }>(m: M, mine: (row: HeldOf) => boolean) {
  const held = (): readonly HeldRow[] => (m.held?.() ?? []).filter(mine);
  return { pending: m.pending && held().length > 0, readBack: () => m.readBack(), held, dismissHeld: (row: Pick<HeldRow, 'hold' | 'account'>) => m.dismissHeld?.(row) ?? Promise.resolve(false) };
}

/**
 * The holds of one script path on one computer: the lock identity of write, restore, comments, remove, envUpdate and testsPut is
 * the path, and the row records the computer the send was made on (target.container.id). A row that records no computer, or
 * another one, is never this view's: it is not shown and its Dismiss never frees it.
 */
export const ofPath = (path: string, computerId: string) => (row: HeldOf): boolean =>
  !!row.identity && typeof row.identity === 'object' && (row.identity as { path?: unknown }).path === path && row.target?.container.id === computerId;

/**
 * The hold a send just made: the send's own (the pending answer's `hold`, which core records for the press's own send), else
 * the one held row of `m` that is this path's on the computer the send was made on (captured at the press), else none. Never
 * `holdOf(vars)` after an await: it scopes by the computer the shell shows by then, and a lock keyed by path alone would name
 * another computer's hold of the same path.
 */
export function ownHoldOf(m: { held?(): readonly HeldRow[] }, path: string, computerId: string, own?: string): string | undefined {
  if (own) return own;
  const rows = (m.held?.() ?? []).filter(ofPath(path, computerId));
  return rows.length === 1 ? rows[0]?.hold : undefined;
}

/** A view of holds by their lock identity alone (an alias link's identity names its own computer). */
export const ofIdentity = (accepts: (identity: unknown) => boolean) => (row: HeldOf): boolean => accepts(row.identity);

/** The refusals that mean "held": a change of this sender may have gone through, so they read as pending, never as not sent. */
export const HELD_CODES = ['READ_BACK_FIRST'];

/**
 * The state of one place's change: its banner (`out`), the holds the banner shows and the one-at-a-time lock. `scope` names the place
 * (the computer and script, or the computers a drawer lists). Moving to another place drops the banner, the shown rows and the
 * lock; the place found on arrival is built again from what core holds (held rows) and from the send of this mount still in
 * flight there, if any. A send owns the banner only while it is the mount's current run: an answer of a run the mount has left
 * records nothing, except that a send still out when its own place is entered again is adopted again on entry (it then owns the
 * banner and the lock, and its answer records). An answer of a run that was settled, or that is no longer the current run, never
 * records, so a place visited again never takes an old answer for its own. The hold stays in core either way and shows again
 * from held().
 */
export function useChange(scope: string, ...held: Holdable[]) {
  const [st, setSt] = useState<{ scope: string; out: Out | null }>({ scope, out: null });
  const out = st.scope === scope ? st.out : null;
  const scopeNow = useRef(scope);
  const live = useRef(false);
  // The run that owns the banner and the lock now, and every send of this mount still out (run id to the scope it was pressed in).
  const active = useRef<number | null>(null);
  const flights = useRef(new Map<number, string>());
  const seq = useRef(0);
  // The mutations of the latest render: callbacks below read them when they run, never a stale render's.
  const muts = useRef(held);
  useEffect(() => {
    muts.current = held;
  });
  // The holds the banner shows: those held() listed when the banner appeared (a remount or a place that finds one still held, a
  // press the kit refused because of one, or this mount's own pending send, listed through the filter of its press). What the
  // warned Dismiss frees, by token. Dropped whenever the place changes.
  const shown = useRef<Array<{ m: Holdable; row: HeldRow }>>([]);
  const rowsNow = (list: readonly Holdable[]) => list.flatMap((m) => (m.held?.() ?? []).map((row) => ({ m, row })));
  // Another place: drop the old banner, its rows and its lock. A send of this mount still out in the place entered owns its banner again.
  useEffect(() => {
    scopeNow.current = scope;
    shown.current = [];
    const back = [...flights.current].find(([, at]) => at === scope);
    active.current = back ? back[0] : null;
    live.current = !!back;
    setSt({ scope, out: back ? { kind: 'busy' } : null });
  }, [scope]);
  // A change still held after a remount (an earlier visit sent it) or in a place just entered shows as pending, with Check again and the warned Dismiss.
  const heldNow = held.some((m) => m.pending);
  useEffect(() => {
    if (heldNow && !live.current) {
      live.current = true;
      shown.current = rowsNow(muts.current);
      setSt({ scope, out: { kind: 'pending' } });
    }
  }, [heldNow, scope]);
  const run = useCallback(async <T,>(send: () => Promise<Answer<T>>): Promise<Answer<T> | null> => {
    if (live.current) return null;
    // The scope and the filters of the press: the answer is recorded for these, never for whatever the mount shows by then.
    const pressScope = scopeNow.current;
    const pressMuts = muts.current;
    const id = ++seq.current;
    const mine = () => active.current === id;
    flights.current.set(id, pressScope);
    active.current = id;
    live.current = true;
    setSt({ scope: pressScope, out: { kind: 'busy' } });
    try {
      const got = await send().catch((): Answer<T> => ({ outcome: 'pending' }));
      // READ_BACK_FIRST is a hold, not a refusal to send: the earlier change may have gone through (C9).
      const refused = got.outcome === 'not_sent' && got.code !== undefined && HELD_CODES.includes(got.code);
      const r: Answer<T> = refused ? { ...got, outcome: 'pending' } : got;
      if (!mine()) return r;
      // A pending answer, or the hold behind a refused press: the banner shows these rows, so its Dismiss may free exactly them.
      if (r.outcome === 'pending') shown.current = rowsNow(pressMuts);
      setSt({ scope: pressScope, out: r.outcome === 'done' || r.outcome === 'stale' ? null : { kind: r.outcome, ...(r.code ? { code: r.code } : {}), ...(r.code === HELD_BY_OTHER ? { from: r.heldFrom ?? null } : {}) } });
      // A pending answer keeps the lock until the caller reads back and calls settle().
      live.current = r.outcome === 'pending';
      if (!live.current) active.current = null;
      return r;
    } catch {
      if (mine()) {
        live.current = false;
        active.current = null;
        setSt({ scope: pressScope, out: null });
      }
      return null;
    } finally {
      flights.current.delete(id);
    }
  }, []);
  /** Start locked and pending: a request from an earlier visit may have gone through. */
  const hold = useCallback(() => {
    live.current = true;
    active.current = null;
    setSt({ scope: scopeNow.current, out: { kind: 'pending' } });
  }, []);
  const settle = useCallback(() => {
    live.current = false;
    active.current = null;
    shown.current = [];
    setSt({ scope: scopeNow.current, out: null });
  }, []);
  /**
   * The warned "Close without knowing" of a banner that shows a pending change: frees the holds the banner showed, each by its
   * token (an earlier mount's or this one's), nothing else, then closes the banner. No no-argument core settle: it would also free
   * this mount's sends of the same path on another computer.
   */
  const force = useCallback(() => {
    for (const { m, row } of shown.current) void m.dismissHeld?.(row);
    settle();
  }, [settle]);
  return { out, run, settle, force, hold, busy: out?.kind === 'busy', locked: out?.kind === 'busy' || out?.kind === 'pending' };
}

/**
 * Check again for a change that may have gone through: the change's own read-back (core's, a request sent now) and
 * unlocks only when every one answered true. A false, a failure or an unanswered read leaves it pending (C9).
 */
export function readBack(settle: () => void, ...checks: Array<Promise<boolean> | boolean>): Promise<void> {
  return Promise.all(checks.map((c) => Promise.resolve(c).then((v) => v === true, () => false))).then((ok) => {
    if (ok.length > 0 && ok.every(Boolean)) settle();
  });
}

/**
 * Check again over several changes of one place: each one that is pending is read back, and the place settles once none is
 * left pending. One click, whichever of them the person pressed. A change that is not pending is not asked.
 */
export async function readBackOf(settle: () => void, ...muts: Array<{ pending: boolean; readBack(): Promise<boolean> }>): Promise<void> {
  const open = muts.filter((m) => m.pending);
  const ok = await Promise.all(open.map((m) => m.readBack().catch(() => false)));
  if (ok.every(Boolean)) settle();
}
