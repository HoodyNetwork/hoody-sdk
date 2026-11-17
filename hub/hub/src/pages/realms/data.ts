// The realms page's data. Reads: every computer of the account (base host, 100 a page, at most MAX_PAGES pages)
// for the picker, and one computer's realms fresh before and after its write. The one change: a computer's whole
// realm set, under the Computers page's lock ('computer.realms', same key and proof), so a hold on either page
// holds the other. The name and the colour go through core (setRealmAlias, setRealmTint): a realm has no row.
import {
  alive, capture, computersPage, coreSource, defineQuery, loadRealms, readRealmAliases, setRealmAlias, setRealmTint,
  type RealmColor, type SourceTable,
} from '@core';
import { useEffect, useMemo, useState } from 'react';
import { MAX_PAGES, REALM_ID, rowsOf, type Io, type PickRow, type WriteResult } from './logic';
import { routes } from './routes';

export const PAGE_SIZE = 100;

const containersOf = (raw: unknown): unknown[] => {
  const d = (raw as { data?: { computers?: unknown } } | null)?.data;
  return Array.isArray(d?.computers) ? d.computers : [];
};
const realmsOf = (row: unknown): string[] => {
  const r = (row as { realm_ids?: unknown } | null)?.realm_ids;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string' && REALM_ID.test(x)) : [];
};
const sorted = (v: readonly string[]) => [...v].sort();

type SetVars = { id: string; realmIds: string[]; still?: () => boolean };
/** The PUT's input. `still` (not part of the change: the lock key and digests leave it out) is the page's own
 *  liveness, checked by the transport right before the PUT goes out, after core's lock and any sign-in wait. */
export const setRealmsInput = (v: SetVars) => ({ params: { id: v.id }, body: { realm_ids: v.realmIds }, ...(v.still ? { still: v.still } : {}) });
const table: SourceTable = {
  reads: {
    computers: { route: routes.computers, input: (p: { page: number }) => ({ query: { page: String(p.page), limit: PAGE_SIZE } }), select: containersOf },
  },
  changes: {
    // The Computers page's declaration, word for word in its lock, key and proof: only a list showing exactly
    // the sent set proves it; anything else keeps it held.
    // coreReads: the top bar's computer list reads it again once the change is proved.
    setRealms: { route: routes.setRealms, input: setRealmsInput, reads: ['computers'], coreReads: [computersPage],
      lock: 'computer.realms', lockKey: (v: { id: string; realmIds: string[] }) => ({ computer: v.id, realms: sorted(v.realmIds) }),
      proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
        const i = (identity ?? {}) as { computer?: string; realms?: string[] };
        const row = answers.flat(2).find((r) => (r as { id?: unknown } | null)?.id === i.computer);
        return row && JSON.stringify(sorted(realmsOf(row))) === JSON.stringify(i.realms ?? null) ? 'applied' : undefined;
      } },
  },
};
const source = coreSource('realms', table);

export interface Picker {
  rows: PickRow[] | undefined;
  loading: boolean;
  error: unknown;
  /** More computers than the pages read (MAX_PAGES full pages), or a later page failed: the list is not whole. */
  partial: boolean;
  /** Later pages are still being read: the list shown is not whole yet. */
  more: boolean;
  refetch: () => void;
}

/** Every computer of the account, page by page while a page comes back full. */
export function useAllComputers(): Picker {
  const [pages, setPages] = useState(1);
  const params = useMemo(() => Array.from({ length: pages }, (_, i) => ({ page: i + 1 })), [pages]);
  const qs = source.useQueries<unknown[], { page: number }>('computers', params);
  const last = qs[pages - 1]?.data;
  useEffect(() => {
    if (last && last.length >= PAGE_SIZE && pages < MAX_PAGES) setPages(pages + 1);
  }, [last, pages]);
  const first = qs[0];
  const rows = first?.data ? rowsOf(qs.flatMap((q) => q.data ?? [])) : undefined;
  const later = qs.slice(1);
  const full = (last?.length ?? 0) >= PAGE_SIZE;
  return {
    rows,
    loading: !!first?.isPending,
    error: first?.isError ? first.error : null,
    partial: later.some((q) => q.isError) || (pages === MAX_PAGES && full),
    // A later page in flight, or a full last page whose next one is about to be asked for.
    more: !!first?.data && (later.some((q) => q.isPending) || (full && pages < MAX_PAGES)),
    refetch: () => void source.invalidate(['computers']),
  };
}

export const useSetRealms = () => source.useMutation<unknown, SetVars>('setRealms');

const computerQ = defineQuery<unknown, unknown, { id: string }>(routes.computer, { input: (p) => ({ params: { id: p.id } }) });
/** A computer's realms, read fresh; null when the read did not answer. */
async function readComputerRealms(id: string): Promise<string[] | null> {
  try {
    const raw = await computerQ.fetch({ id });
    return realmsOf((raw as { data?: unknown } | null)?.data);
  } catch {
    return null;
  }
}

/** A name write's error, as the engine's outcome: refused before sending, stopped, refused, or may have gone through. */
export function nameOutcome(e: unknown): WriteResult {
  const x = (e ?? {}) as { notSent?: unknown; code?: unknown; status?: unknown; pending?: unknown; kind?: unknown; cancelled?: unknown; superseded?: unknown };
  const code = typeof x.code === 'string' ? x.code : undefined;
  if (x.notSent === true) return { outcome: 'failed', ...(code ? { code } : {}), notSent: true };
  if (x.cancelled === true || x.superseded === true || code === 'CANCELLED') return { outcome: 'stale' };
  if (x.pending === true || x.kind === 'pending') return { outcome: 'unknown' };
  const st = typeof x.status === 'number' ? x.status : 0;
  // The refusal itself goes with it: the page shows its mapped sentence and Details.
  if (st >= 400 && st < 500 && st !== 408 && st !== 429) return { outcome: 'failed', ...(code ? { code } : {}), error: e };
  return { outcome: 'unknown' };
}

/** The parts of useSetRealms() the engine uses: the send, and core's controls for one lost send's hold. */
export interface SetRealms {
  mutateAsync: (v: SetVars) => Promise<{ outcome: string; code?: string; hold?: string }>;
  holdOf: (v: SetVars) => Promise<string | undefined>;
  heldByOther: (v: SetVars) => Promise<unknown>;
  complete: (v: SetVars, hold: string) => Promise<boolean>;
  dismiss: (v: SetVars, hold: string) => Promise<boolean>;
}

/** The engine's outside world on a live page: `m` is useSetRealms() of this mount; `mounted` is false once the
 *  page is left, which stops the engine like a realm switch. */
export function liveIo(m: SetRealms, mounted: () => boolean): Io {
  const ctx = capture();
  return {
    // The name write: core runs this tab's renames one at a
    // time, reads the map fresh, refuses a name another realm has (NAME_TAKEN), writes with If-Match and bounds the PUT (past it: pending,
    // "may not have saved", never failed). Nothing starts once the page is left or the context moved, and core refuses
    // a queued rename across a switch or sign-out. Leaving while core's queue or its read of the names waits does not
    // stop a name already started (core checks no page liveness), so its PUT may still go out: the leave warning says
    // so. A rename in another tab or device made since the read is refused (412, nothing saved); the engine's
    // read-back after the write tells (NAME_LOST, the name not seen, or not checked), never a silent success.
    setName: async (id, alias) => {
      if (!(mounted() && alive(ctx))) return { outcome: 'failed', notSent: true };
      return setRealmAlias(id, alias).then((): WriteResult => ({ outcome: 'done' }), nameOutcome);
    },
    readNames: () => readRealmAliases(),
    setTint: (id, color) => void setRealmTint(id, color as RealmColor),
    readRealms: readComputerRealms,
    writeRealms: async (id, realmIds) => {
      // The engine checks too; this is the boundary itself: no send once the page is left or the context moved.
      const still = () => mounted() && alive(ctx);
      if (!still()) return { outcome: 'failed', notSent: true };
      const r = await m.mutateAsync({ id, realmIds, still });
      if (r.outcome === 'done') return { outcome: 'done' };
      if (r.outcome === 'stale') return { outcome: 'stale' };
      // The refusal itself goes with it (as the name's does): the results show its Details beside Refused.
      if (r.outcome === 'failed') return { outcome: 'failed', ...(r.code ? { code: r.code } : {}), error: r };
      // An earlier send of the same change still unread (here or on Computers) is that send's unknown outcome.
      if (r.outcome === 'not_sent' && r.code !== 'READ_BACK_FIRST' && r.code !== 'HELD_BY_OTHER') return { outcome: 'failed', ...(r.code ? { code: r.code } : {}), notSent: true };
      return { outcome: 'unknown', ...(r.hold ? { hold: r.hold } : {}) };
    },
    // Only this page's own hold of exactly this set: one the Computers page holds stays for that page to check.
    settleRealms: async (id, realmIds, how, hold) => {
      const v = { id, realmIds };
      if (await m.heldByOther(v)) return 'other';
      const h = hold ?? (await m.holdOf(v));
      if (!h) return 'settled';
      return (await (how === 'applied' ? m.complete(v, h) : m.dismiss(v, h))) ? 'settled' : 'kept';
    },
    alive: () => mounted() && alive(ctx),
    refresh: async () => {
      await Promise.allSettled([loadRealms(), source.invalidate(['computers'])]);
    },
  };
}

export type Names = { state: 'reading' } | { state: 'ok'; map: Readonly<Record<string, string>> } | { state: 'failed'; error: unknown };

/** Every realm name, read fresh when the page opens (the "already taken" check needs the vault's own map, not a
 *  cached one): `retry` reads again. */
export function useNames(): Names & { retry: () => void } {
  const [n, setN] = useState<Names>({ state: 'reading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let on = true;
    setN({ state: 'reading' });
    readRealmAliases().then((map) => on && setN({ state: 'ok', map }), (error: unknown) => on && setN({ state: 'failed', error }));
    return () => { on = false; };
  }, [round]);
  return { ...n, retry: () => setRound((r) => r + 1) };
}
