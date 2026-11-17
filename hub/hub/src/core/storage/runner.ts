// Runs one change at a time and exposes its C9 outcome for a drawer or dialog footer. Moved here from the computers
// page (pages/computers/parts/runner.ts) unchanged, so Storage (and Files) run changes with the same C9 rules; the
// one difference is how a hold's sender is told: `heldBy` (a page source's heldBy for its change key) replaces the
// page-bound `change` key.
// A refusal because an earlier send of the same change is still unread (READ_BACK_FIRST) is that earlier send's
// unknown outcome ("may have gone through"), never "not sent". Check again reads back, it never resends.
// With a `lock` the unknown state is core's held change (heldChanges), not this hook's state: a drawer that is
// closed and reopened, or remounted, still shows what was sent and offers no second send; only a read that proves
// it, or an explicit Dismiss, ends it. A change another page sent (heldBy 'other', or a press refused with
// HELD_BY_OTHER) is that page's to settle: `elsewhere` names it, and Dismiss here frees nothing, so none is offered.
import { useCallback, useMemo, useState } from 'react';
import type { Outcome as OutcomeKind } from '../api';
import { heldChanges, useChangesVersion, type HeldChange, type HeldFrom } from '../changes';
import { useRealms } from '../realms';

/** The kit's OutcomeLike, as the runner keeps it (core does not import the kit; the shapes are the same). */
export interface RunnerOutcome { kind: OutcomeKind; code?: string; message?: string }

export interface RunnerMutation<V> {
  mutateAsync: (v: V) => Promise<{ outcome: OutcomeKind; code?: string; data?: unknown } & RefusalFacts>;
  /** Check again; with `only.hold`, only the change holding that send token (core/source.ts readBackNow). */
  readBack?: (only?: { hold: string }) => Promise<boolean>;
  /** No arguments: every change this mount sent (unlocked runners only). With variables: only the send `hold` names (HeldChange.hold). */
  dismiss?: { (): Promise<boolean>; (vars: V, hold: string): Promise<boolean> };
  discard?: { (): Promise<boolean>; (vars: V, hold: string): Promise<boolean> };
  complete?: (vars: V, hold: string) => Promise<boolean>;
}

/** What core keeps about a refused send besides its code (SourceResult): Details shows it, and the kit's words read
 *  the status (a definite refusal never reads as "no answer"). */
export interface RefusalFacts {
  status?: number;
  retryAfter?: number;
  traceId?: string;
  route?: string;
}
const factsOf = (r: { outcome: OutcomeKind } & RefusalFacts): RefusalFacts => ({
  ...(typeof r.status === 'number' ? { status: r.status } : {}),
  ...(typeof r.retryAfter === 'number' ? { retryAfter: r.retryAfter } : {}),
  ...(typeof r.traceId === 'string' ? { traceId: r.traceId } : {}),
  ...(typeof r.route === 'string' ? { route: r.route } : {}),
});

export interface RunnerResult {
  outcome: OutcomeKind;
  code?: string;
  data?: unknown;
}

/** An unread earlier send shows as unknown: this page's (READ_BACK_FIRST) or another page's (HELD_BY_OTHER). */
export const asUnknown = <T extends { outcome: OutcomeKind; code?: string }>(r: T): T =>
  r.outcome === 'not_sent' && (r.code === 'READ_BACK_FIRST' || r.code === 'HELD_BY_OTHER') ? { ...r, outcome: 'pending' as OutcomeKind } : r;

/** A refusal's facts for a footer's `error=`: the kit's words for its code (the Hub's own refusals, such as a token
 *  session's or a framed page's, say why nothing was sent) and the code under Details. Nothing for done or unknown:
 *  those keep their own words (C9). */
export const refusal = (o: (RunnerOutcome & { facts?: RefusalFacts }) | undefined): ({ outcome: OutcomeKind; code?: string } & RefusalFacts) | undefined =>
  o && (o.kind === 'failed' || o.kind === 'not_sent' || o.kind === 'stale') ? { outcome: o.kind, ...(o.code ? { code: o.code } : {}), ...o.facts } : undefined;

export interface HeldOpts<V> {
  /** The change's shared lock name (a defineMutation `lock`). */
  lock: string;
  /** Which held changes belong to this place (default: all of the lock). */
  pick?: (identity: Record<string, unknown>) => boolean;
  /** The variables that name a held identity again (for Dismiss). */
  vars?: (identity: Record<string, unknown>) => V;
  /** This page's own change: its source's heldBy for its change key (coreSource(...).heldBy(key, h)), so a hold of
   *  this page is told from another page's. */
  heldBy?: (h: HeldChange) => 'self' | 'other' | undefined;
  /** The sender of a hold core cannot attribute (recorded before core named senders); default this page. */
  guess?: (identity: Record<string, unknown>) => HeldFrom | null;
}

/** The realm shown now: holds sent in another realm are left out (a page can neither check nor dismiss them here),
 *  except those of a change that names its own realm (query.ts MutationOpts explicitRealm, e.g. Global): they show in
 *  every realm view, and `pick` keeps the ones this place shows. */
export const useShownRealm = (): string => useRealms().selected;

/** The first held change of a lock that `pick` accepts (its identity), re-read when core's changes move. */
export function useHeldOf(lock: string, pick: (identity: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  const h = useHeldChangeOf(lock, pick);
  return h ? ((h.identity ?? {}) as Record<string, unknown>) : null;
}

/** The same held change whole (its sender included: `by`, `from`). */
export function useHeldChangeOf(lock: string, pick: (identity: Record<string, unknown>) => boolean): HeldChange | null {
  const version = useChangesVersion();
  const realm = useShownRealm();
  return useMemo(
    () => heldChanges(lock, { realm }).find((x) => pick((x.identity ?? {}) as Record<string, unknown>)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lock, version, pick, realm],
  );
}

export function useRunner<V>(m: RunnerMutation<V>, held?: HeldOpts<V>) {
  const [busy, setBusy] = useState(false);
  const [local, setOutcome] = useState<(RunnerOutcome & { data?: unknown; facts?: RefusalFacts }) | undefined>(undefined);
  const version = useChangesVersion();
  const realm = useShownRealm();
  const mine = useMemo(
    () => (held ? heldChanges(held.lock, { realm }).filter((h) => !held.pick || held.pick((h.identity ?? {}) as Record<string, unknown>)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [held?.lock, held?.pick, version, realm],
  );
  const first = mine[0];
  const identity = (first?.identity ?? null) as Record<string, unknown> | null;
  const heldBy = held?.heldBy;
  const guess = held?.guess;
  const elsewhere = useMemo((): { from: HeldFrom | null } | null => {
    if (!first) return null;
    const by = heldBy ? heldBy(first) : undefined;
    if (by !== undefined) return by === 'other' ? { from: first.from } : null;
    const guessed = guess?.((first.identity ?? {}) as Record<string, unknown>) ?? null;
    return guessed ? { from: guessed } : null;
  }, [first, heldBy, guess]);
  // A locked change is pending only while core holds it.
  const outcome: (RunnerOutcome & { data?: unknown; facts?: RefusalFacts }) | undefined = held
    ? first
      ? { kind: 'pending' }
      : local?.kind === 'pending'
        ? undefined
        : local
    : local;
  const run = useCallback(
    async (v: V): Promise<RunnerResult> => {
      if (busy || outcome?.kind === 'pending') return { outcome: 'not_sent' };
      setBusy(true);
      setOutcome(undefined);
      const raw = await m.mutateAsync(v).catch(() => ({ outcome: 'pending' as OutcomeKind, code: undefined, data: undefined }));
      const r = asUnknown(raw);
      setBusy(false);
      setOutcome({ kind: r.outcome, ...(r.code ? { code: r.code } : {}), data: r.data, facts: factsOf(r) });
      return r;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, outcome?.kind, m.mutateAsync],
  );
  const reset = useCallback(() => setOutcome(undefined), []);
  // The send the band shows (this render's HeldChange.hold): what Check again reads back and Dismiss frees.
  const shownHold = first?.hold;
  /** Reads the change's declared reads again (nothing is sent); the unknown state clears only when that read proved it.
   *  A held place reads back only the send its band shows (this render's hold): never another hold of the lock, which
   *  under All realms may be another realm's. With none shown nothing is read and nothing changes (false). */
  const check = useCallback(async (): Promise<boolean> => {
    if (!m.readBack) return false;
    if (held && !shownHold) return false;
    const ok = await (held ? m.readBack({ hold: shownHold as string }) : m.readBack()).catch(() => false);
    if (ok && !held) setOutcome(undefined);
    return ok;
  }, [m, held, shownHold]);
  /** An explicit Dismiss of a held change: the person decided it did not go through. It frees the send the band
   *  showed (this render's HeldChange.hold), never a later one of the same change: a hold that moved meanwhile
   *  frees nothing (core answers false), and a band without a hold token frees nothing. A held band always names
   *  its send (`vars` and the token): without them it refuses (false, not settled), never core's no-argument
   *  Dismiss, which frees every hold this page has of the lock in the realm, ones never shown here included. */
  const dismiss = useCallback(async (): Promise<boolean> => {
    if (elsewhere) return false;
    const gone = m.dismiss ?? m.discard;
    if (held) {
      if (!held.vars || !identity || !shownHold || !gone) return false;
      const freed = await gone(held.vars(identity), shownHold);
      setOutcome(undefined);
      return freed;
    }
    const freed = gone ? await gone() : false;
    setOutcome(undefined);
    return freed;
  }, [m, held, identity, elsewhere, shownHold]);
  /** The page's own proof, for a change no declared read can prove: frees the send the band shows (its hold taken
   *  before the read) only when `proof` answers true, through core's complete; anything else keeps it held.
   *  Another page's hold is never freed here. */
  const prove = useCallback(async (proof: () => Promise<boolean>): Promise<boolean> => {
    if (!held || elsewhere || !held.vars || !identity || !shownHold || !m.complete) return false;
    const vars = held.vars(identity);
    const hold = shownHold;
    if (!(await proof().catch(() => false))) return false;
    return m.complete(vars, hold);
  }, [m, held, identity, elsewhere, shownHold]);
  return { run, busy, outcome, reset, check, dismiss, prove, held: identity, hold: shownHold, elsewhere };
}
