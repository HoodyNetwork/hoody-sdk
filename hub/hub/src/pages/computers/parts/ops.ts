// One lifecycle press at a time per computer (C9): a second press while the first is out sends
// nothing; an answer that may have gone through stays "pending" until the list is read again. The pending state
// is core's lock ('computer.lifecycle'), not this hook's state, so a remount, another page or a closed pane keeps it.
import { capture, computerLifecycle, heldChanges, useChangesVersion, type HeldChange, type HeldFrom, type HubError, type RefusalFacts } from '@core';
import type { OutcomeKind } from '@kit';
import { useCallback, useMemo, useState } from 'react';
import { useLifecycle } from '../data';
import { asUnknown, useShownRealm } from './runner';
import type { Op } from '../logic';
import type { Computer } from '../types';

export interface OpState {
  kind: 'busy' | OutcomeKind;
  op: Op;
  code?: string;
  /** A refusal's facts (status, retry wait, trace id, route) for the banner's Details, beside `code`. */
  facts?: RefusalFacts;
  /** A held change another page sent (Home, Board, Bots): read-only here, with a link to that page (Held). */
  elsewhere?: { from: HeldFrom | null };
  /** The held change shown (core's token for that one send): Dismiss frees this hold and no other. */
  hold?: string;
}

/** The facts core kept from a refusal's answer (core's RefusalFacts), never its message. */
const refusalFacts = (e: HubError | undefined): RefusalFacts => ({
  ...(typeof e?.status === 'number' ? { status: e.status } : {}),
  ...(typeof e?.retryAfter === 'number' ? { retryAfter: e.retryAfter } : {}),
  ...(typeof e?.traceId === 'string' ? { traceId: e.traceId } : {}),
  ...(typeof e?.route === 'string' ? { route: e.route } : {}),
});

/** The pages that send a lifecycle change from this folder: the Computers page, and Home through its widget. */
export type LifecyclePage = 'computers' | 'home';
/** Another page's lifecycle change (core's heldBy for that page's sender): only the sender can dismiss it. */
export const lifecycleElsewhere = (h: HeldChange, page: LifecyclePage = 'computers'): { from: HeldFrom | null } | undefined =>
  computerLifecycle.forPage(page).heldBy(h) === 'other' ? { from: h.from } : undefined;

/** The lifecycle hold of `computer` a surface shows and acts on. Core keys the lock by the computer in every realm
 *  view, so there is at most one; the newest if ever more. Display, Check again and Dismiss all read this one. */
export function lifecycleHeldOf(computer: string, realm: string): HeldChange | null {
  const hs = heldChanges('computer.lifecycle', { realm }).filter((h) => (h.identity as { computer?: unknown } | null)?.computer === computer);
  return hs[hs.length - 1] ?? null;
}

/** The person's warned Dismiss of the hold a surface showed (`shown`, its token), sent as `page`. Read again at the
 *  press in the realm core reads now: nothing is freed unless that same hold is still there and is `page`'s own.
 *  Core then frees that one send by its token, so a hold that went pending after the press (another page's, or a
 *  later one of this page) stays held. True when the Dismiss was sent. */
export async function dismissShownLifecycle(computer: string, shown: string | undefined, page: LifecyclePage): Promise<boolean> {
  const now = lifecycleHeldOf(computer, capture().realm);
  if (!now || shown === undefined || now.hold !== shown || lifecycleElsewhere(now, page)) return false;
  const op = (now.identity as { op?: Op } | null)?.op;
  if (!op) return false;
  // Core frees the send only while `shown` still holds the lock; its answer is the outcome.
  return computerLifecycle.forPage(page).dismiss({ id: computer, op }, shown);
}

export function useLifecycleOps(reload: () => Promise<unknown>) {
  const [local, setOps] = useState<Readonly<Record<string, OpState>>>({});
  const lifecycle = useLifecycle();
  const version = useChangesVersion();
  const realm = useShownRealm();
  // Held under the shared lock: what may have gone through, whoever sent it (this hook, an earlier mount, another page).
  const ops = useMemo(() => {
    const out: Record<string, OpState> = {};
    for (const [id, o] of Object.entries(local)) if (o.kind !== 'pending') out[id] = o;
    const ids = new Set<string>();
    for (const h of heldChanges('computer.lifecycle', { realm })) {
      const id = (h.identity as { computer?: unknown } | null)?.computer;
      if (typeof id === 'string') ids.add(id);
    }
    for (const id of ids) {
      const h = lifecycleHeldOf(id, realm);
      if (!h || out[id]?.kind === 'busy') continue;
      const elsewhere = lifecycleElsewhere(h);
      out[id] = { kind: 'pending', op: (h.identity as { op?: Op } | null)?.op ?? local[id]?.op ?? 'start', ...(elsewhere ? { elsewhere } : {}), ...(h.hold !== undefined ? { hold: h.hold } : {}) };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, version, realm]);
  const set = useCallback((id: string, next: OpState | undefined) => {
    setOps((prev) => {
      const out = { ...prev };
      if (next) out[id] = next;
      else delete out[id];
      return out;
    });
  }, []);

  const run = useCallback(
    async (c: Computer, op: Op) => {
      if (ops[c.id]?.kind === 'busy' || ops[c.id]?.kind === 'pending') return;
      set(c.id, { kind: 'busy', op });
      const res = await lifecycle.run({ id: c.id, op }).catch(() => null);
      const r = asUnknown({ outcome: (res ? res.outcome : 'pending') as OutcomeKind, code: res?.error?.code ?? undefined });
      if (r.outcome === 'done') {
        set(c.id, undefined);
        await reload();
      } else if (r.outcome === 'stale') set(c.id, undefined);
      else if (r.outcome === 'pending') set(c.id, { kind: 'pending', op }); // held by core's lock; shown from there
      else set(c.id, { kind: r.outcome, op, ...(r.code ? { code: r.code } : {}), facts: refusalFacts(res?.error) });
    },
    [ops, lifecycle, reload, set],
  );

  /** Read the list again (never resend); the press is settled when the row shows the asked-for state. */
  const check = useCallback(
    async (c: Computer) => {
      // Read back first (nothing is sent); the unknown state clears only after a fresh, successful read.
      const ok = await lifecycle.readBack().catch(() => false);
      await reload();
      if (ok) set(c.id, undefined);
    },
    [reload, set, lifecycle],
  );

  /** A held change (may have gone through) is released in core's lock only after the person's warned Dismiss, and
   *  only the one shown (its token): another page's, or one that went pending since, stays (dismissShownLifecycle). */
  const dismiss = useCallback(
    async (c: Computer): Promise<boolean> => {
      const freed = await dismissShownLifecycle(c.id, ops[c.id]?.hold, 'computers');
      // The band is drawn from core's holds; this page's own pending entry goes either way, so it cannot outlive them.
      set(c.id, undefined);
      return freed;
    },
    [set, ops],
  );
  /** A definite refusal (failed, not sent) only leaves this page's banner: nothing is held, so nothing in core is freed. */
  const forget = useCallback((c: Computer) => set(c.id, undefined), [set]);
  return { ops, run, check, dismiss, forget };
}
