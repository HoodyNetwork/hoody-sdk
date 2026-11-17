// Disconnect: the page's one change, DELETE /api/v1/tunnel/sessions/{id}, sent once per press
// and never resent by the page (C9).
//
// Contract, in plain words:
//   - 202 (core: done): the kit started closing the session. The page keeps a "Disconnecting" mark for that computer and
//     session in this tab (module memory: it survives leaving the page and coming back, a reload drops it and the live
//     list is the truth). The mark ends when a read after it no longer lists the session or a listener it owns; after
//     STILL_MS still listed it reads "Still listed", with Check again (a refresh) and Disconnect offered again.
//   - 404 SESSION_NOT_FOUND: "Already disconnected", then a refresh; never shown as a failure.
//   - A lost answer (timeout, network, 5xx; core: pending): core holds the change under DISCONNECT_LOCK (it survives a
//     reload) and refuses another send of it. The session says "May have disconnected" with Check again, which only
//     reads: core's read-back judges the fresh /tunnels and /bindings answers with disconnectProved (gone → done; still
//     listed proves nothing, since the kit closes after answering, so the hold stays). Once a read at least STILL_MS
//     after the send still lists it, "Disconnect again" is offered behind a confirm that says the first may still be
//     closing it; only that press frees the hold (core's warned dismiss) and sends once more. Held disconnects show on
//     every state of the page, with or without a list read. When a read shows a held session gone, the page reads
//     back by itself (reads only, never a refresh), at most once per hold per POLL_MS and one at a time per hold.
//   - Any other answer: "Could not disconnect" with its details (a definite refusal: the action comes back), or "Not
//     sent" (nothing left the browser); the list names the session with its details, outside any control row.
//   - A list cut at its bound proves nothing (logic.ts stillListed: unknown): a held disconnect then stays "May have
//     disconnected", never settled either way, and no Disconnect again is offered on it (C9).
//   - The marks belong to the account shown: an account change or a sign-out drops them, mounted or not (core's
//     rule, keepsChanges), and a press made before it leaves no mark, whatever it answers.
import { defineMutation, heldChanges, keepsChanges, onBump, useChangesVersion, type HeldChange, type Target } from '@core';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { bindingsQ, POLL_MS, tunnelsQ } from './data';
import { disconnectProved, disconnectState, markEnded, stillListed, STILL_MS, type DisconnectMark, type DisconnectState, type Snapshot } from './logic';
import { routes } from './routes';

/** The lock of a session's disconnect (one per computer and session; core files kit locks under the computer). */
export const DISCONNECT_LOCK = 'tunnel.session';
/** After a 202, the page reads again at once and once more this much later (the kit closes within about a second). */
export const FOLLOW_UP_MS = 3_000;

export interface DisconnectVars {
  computer: string;
  id: string;
  target: Target;
}

export const disconnectM = defineMutation<DisconnectVars>(routes.disconnect, {
  input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id } }),
  reads: [tunnelsQ, bindingsQ],
  lock: DISCONNECT_LOCK,
  lockKey: (v) => ({ computer: v.computer, id: v.id }),
  proves: disconnectProved,
  page: 'tunnels',
});

// ── This tab's marks ────────────────────────────────────────────────────────────────

const MAX_MARKS = 500;
const marks = new Map<string, DisconnectMark>();
const sending = new Set<string>();
let version = 0;
const subs = new Set<() => void>();
const changed = () => {
  version++;
  for (const f of [...subs]) f();
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const keyOf = (computer: string, id: string) => `${computer}|${id}`;
function setMark(k: string, m: DisconnectMark): void {
  marks.delete(k);
  if (marks.size >= MAX_MARKS) marks.delete(marks.keys().next().value as string);
  marks.set(k, m);
  changed();
}

// Moves when the marks are dropped for another account or a sign-out: a press answers into the marks only when it
// has not moved since the press.
let marksGen = 0;
onBump((reason) => {
  if (keepsChanges(reason)) return;
  marksGen++;
  marks.clear();
  changed();
});

/** Tests only. */
export function resetDisconnectForTests(): void {
  marks.clear();
  sending.clear();
  changed();
}

const idOf = (h: HeldChange): string | null => {
  const v = h.identity && typeof h.identity === 'object' ? (h.identity as Record<string, unknown>).id : undefined;
  return typeof v === 'string' && v ? v : null;
};

/** The disconnects core holds on this computer (may have gone through), by session id. */
function holdsOn(computer: string): Map<string, HeldChange> {
  const out = new Map<string, HeldChange>();
  if (!computer) return out;
  for (const h of heldChanges(DISCONNECT_LOCK)) {
    const id = idOf(h);
    if (id && h.target?.container.id === computer && !out.has(id)) out.set(id, h);
  }
  return out;
}

export interface SessionDisconnect {
  state: DisconnectState;
  /** 'failed': the rejection (for its details); notSent when nothing left the browser. */
  error?: unknown;
  notSent?: boolean;
  /** A Check again of it is reading. */
  checking: boolean;
  /** Disconnect may be pressed (nothing in flight, nothing held, not just accepted). */
  canSend: boolean;
  /** 'pending', and a read STILL_MS or more after the send still lists the session: the hold shown (its token), for a
   *  warned Disconnect again. */
  again?: string;
}

export type DisconnectOutcome = 'done' | 'already' | 'pending' | 'failed' | 'not_sent';

/** The page's disconnects on the shown computer: each session's state, the press, Check again, Disconnect again.
 *  disconnect/again name the computer they were asked on; another computer shown by then sends nothing. */
export function useDisconnect(o: { computer: string; target: Target | null; snap: Snapshot | null; refresh: () => Promise<unknown> }) {
  useSyncExternalStore(subscribe, () => version, () => version);
  useChangesVersion();
  const { computer, target, snap } = o;
  const [, tick] = useState(0);
  const [checking, setChecking] = useState<ReadonlySet<string>>(() => new Set());
  const held = holdsOn(computer);
  const heldRef = useRef(held);
  heldRef.current = held;
  const refreshRef = useRef(o.refresh);
  useEffect(() => {
    refreshRef.current = o.refresh;
  }, [o.refresh]);

  // The follow-up reads after a 202 or a 404 end with the page, including those of an answer that comes after it left.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const all = timers.current;
    return () => {
      alive.current = false;
      for (const id of all) clearTimeout(id);
      all.clear();
    };
  }, []);

  const now = Date.now();
  // Re-render when the oldest "Disconnecting" mark of this computer turns "Still listed".
  let next = Infinity;
  for (const [k, m] of marks) if (m.kind === 'closing' && k.startsWith(computer + '|') && m.at + STILL_MS > now) next = Math.min(next, m.at + STILL_MS);
  useEffect(() => {
    if (next === Infinity) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [next]);

  const check = useCallback(
    async (id: string): Promise<void> => {
      if (!computer || !target) return;
      const k = keyOf(computer, id);
      setChecking((s) => new Set(s).add(k));
      try {
        // False when nothing was proved, read or not: the hold says so itself; a failed read shows on the page.
        if (heldRef.current.has(id)) await disconnectM.readBack({ computer, id, target });
        await refreshRef.current();
      } finally {
        setChecking((s) => {
          const n = new Set(s);
          n.delete(k);
          return n;
        });
        changed();
      }
    },
    [computer, target],
  );

  // A read after a mark may end it; a held session that a fresh read no longer lists is read back by itself: reads
  // only (never a refresh, whose new read would ask again), at most once per hold per POLL_MS, one at a time per hold.
  const tried = useRef(new Map<string, number>());
  const autoBusy = useRef(new Set<string>());
  useEffect(() => {
    if (!snap || !computer) return;
    let any = false;
    for (const [k, m] of [...marks]) {
      if (!k.startsWith(computer + '|')) continue;
      if (markEnded(m, snap, k.slice(computer.length + 1))) {
        marks.delete(k);
        any = true;
      }
    }
    if (any) changed();
    for (const [id, h] of heldRef.current) {
      const key = `${computer}|${id}|${h.hold ?? ''}`;
      const last = tried.current.get(key);
      const t = Date.now();
      if (snap.at <= h.at || autoBusy.current.has(key) || (last !== undefined && t - last < POLL_MS) || stillListed(id, snap.tunnels, snap.bindings) !== false) continue;
      if (!target) continue;
      if (tried.current.size > 200) tried.current.clear();
      tried.current.set(key, t);
      autoBusy.current.add(key);
      void disconnectM
        .readBack({ computer, id, target })
        .catch(() => false)
        .finally(() => {
          autoBusy.current.delete(key);
          changed();
        });
    }
  }, [snap, computer, target]);

  const later = useCallback(() => {
    if (!alive.current) return;
    void refreshRef.current();
    const id = setTimeout(() => {
      timers.current.delete(id);
      void refreshRef.current();
    }, FOLLOW_UP_MS);
    timers.current.add(id);
  }, []);

  // The one send of a press; the caller has put the key in `sending` (the press is busy from its first step) and
  // passes the marks generation read when the press began: the press neither sends nor answers into the marks once
  // another account (or none) is shown.
  const send = useCallback(
    async (k: string, id: string, asGen: number): Promise<DisconnectOutcome | null> => {
      if (!target || marksGen !== asGen) {
        sending.delete(k);
        changed();
        return null;
      }
      marks.delete(k);
      changed();
      let r: Awaited<ReturnType<typeof disconnectM.run>>;
      try {
        r = await disconnectM.run({ computer, id, target });
      } finally {
        sending.delete(k);
      }
      // Another account (or none) since the press: its answer leaves no mark here.
      if (marksGen !== asGen) {
        changed();
        return null;
      }
      const at = Date.now();
      const err = r.error as { code?: unknown; status?: unknown } | undefined;
      if (r.outcome === 'done') {
        setMark(k, { kind: 'closing', at });
        later();
        return 'done';
      }
      if (r.outcome === 'failed' && err?.code === 'SESSION_NOT_FOUND' && err.status === 404) {
        setMark(k, { kind: 'already', at });
        later();
        return 'already';
      }
      if (r.outcome === 'pending') {
        changed();
        return 'pending';
      }
      setMark(k, { kind: 'failed', at, error: r.error ?? null, notSent: r.outcome !== 'failed' });
      return r.outcome === 'failed' ? 'failed' : 'not_sent';
    },
    [computer, target, later],
  );

  const disconnect = useCallback(
    async (id: string, askedOn: string): Promise<DisconnectOutcome | null> => {
      if (!computer || !target || askedOn !== computer) return null;
      const k = keyOf(computer, id);
      if (sending.has(k)) return null;
      sending.add(k);
      return send(k, id, marksGen);
    },
    [computer, target, send],
  );

  // Disconnect again: the person was told the first may have gone through and may still be closing it. Frees that
  // shown hold (core's warned dismiss; nothing else frees it while listed), then one new send. Busy from the press:
  // its confirm cannot be cancelled while the hold is being freed for a send that follows.
  const again = useCallback(
    async (id: string, hold: string, askedOn: string): Promise<DisconnectOutcome | null> => {
      if (!computer || !target || askedOn !== computer) return null;
      const k = keyOf(computer, id);
      if (sending.has(k)) return null;
      sending.add(k);
      changed();
      const asGen = marksGen;
      let freed = false;
      try {
        freed = await disconnectM.dismiss({ computer, id, target }, hold);
      } catch {
        freed = false;
      }
      if (!freed) {
        sending.delete(k);
        changed();
        return null;
      }
      return send(k, id, asGen);
    },
    [computer, target, send],
  );

  const of = (id: string): SessionDisconnect => {
    const k = keyOf(computer, id);
    const mark = marks.get(k);
    const h = held.get(id);
    const state = disconnectState({ sending: sending.has(k), pending: !!h, mark, now });
    const listedLate = !!h && !!snap && snap.at - h.at >= STILL_MS && stillListed(id, snap.tunnels, snap.bindings) === true;
    return {
      state,
      ...(mark?.kind === 'failed' ? { error: mark.error, notSent: mark.notSent } : {}),
      ...(state === 'pending' && listedLate && h?.hold && target && !checking.has(k) ? { again: h.hold } : {}),
      checking: checking.has(k),
      canSend: !!target && (state === 'idle' || state === 'failed' || state === 'still'),
    };
  };
  /** Every disconnect held on this computer: every page state names them all, with or without their rows. */
  const heldIds = [...held.keys()];
  /** Sessions whose last press failed or was not sent (the list names them with the details). */
  const failed: string[] = [];
  for (const [k, m] of marks) if (m.kind === 'failed' && k.startsWith(computer + '|') && !held.has(k.slice(computer.length + 1))) failed.push(k.slice(computer.length + 1));
  return { of, disconnect, again, check, held: heldIds, failed };
}
