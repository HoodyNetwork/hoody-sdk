// power.ts: the one computer lifecycle change (start, stop, force-stop, restart, pause, resume) that Computers,
// Bots and the Board all send, and the containers list read that proves it.
//
// Contract, in plain words:
//   - computerLifecycle is one defineMutation over POST /computers/:id/:op under the shared lock
//     'computer.lifecycle' keyed by the computer, in every realm view: while one lifecycle change of a computer may have gone through
//     (sending, or pending after an unknown outcome), every other press on that computer, from any page and for
//     any operation, is refused (BUSY or READ_BACK_FIRST) and never sent. Pages never spell the lock name: they
//     call computerLifecycle (run, use(), isPending, readBack) or spread lifecycleLock into a coreSource change.
//   - The read that proves it is computersList (GET /computers, page 1, 100 rows: the same read the shell keeps). It proves only a
//     computer it shows in the target state: a computer missing from it (an unreadable body, or one past the first 100 rows) proves nothing.
//     A fresh read-back frees a pending change only when it shows that computer in the operation's target state
//     (lifecycleVerdict: running for start and resume; stopped for stop and force-stop; paused for pause).
//     Anything else proves nothing: right after an unknown outcome the old state is what a read shows whether or
//     not the request arrived, so the change stays pending ("may have gone through", Check again: a read, never
//     a resend) until the read shows the target state or the person dismisses it. A restart has no proof here:
//     the computer reads running before and after it (the list carries no start time), so a pending restart is
//     freed only by the person's Dismiss (dismiss()).
import { useQueries, type Query } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { containersRoute } from './computer';
import { defineMutation, defineQuery, queryClient, useCore, type ReadVerdict } from './query';
import { defineRoute } from './routes';

export type LifecycleOp = 'start' | 'stop' | 'force-stop' | 'restart' | 'pause' | 'resume';
export const LIFECYCLE_OPS: readonly LifecycleOp[] = ['start', 'stop', 'force-stop', 'restart', 'pause', 'resume'];
export interface LifecycleVars { id: string; op: LifecycleOp }

/** A containers list row, the fields core reads. */
export interface ComputerWire { id?: unknown; status?: unknown; project_id?: unknown; server_name?: unknown; name?: unknown }

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** One page of the containers list and whether it is the whole list. */
export interface ComputerPage { rows: ComputerWire[]; complete: boolean }

// The page size of both reads below (their `limit`, written inline so the list-limit conformance scan ties it to the route).
const PAGE_ROWS = 100;

/**
 * The rows of one answer and whether no later page exists. A body without `data.computers` as a list is unreadable, never an empty
 * list: it throws BAD_LIST, which is the query's error state ("couldn't read"), so nothing reads it as "no computers". Complete:
 * the answer's pagination says one page (totalPages <= 1), else (no usable totalPages) fewer rows than a page; a full page without
 * pagination is not known to be the whole list.
 */
export function pageOf(r: unknown): ComputerPage {
  const p = pageAt(r, 1);
  return { rows: p.rows, complete: p.complete };
}

/** Page `page` of the list (pageOf's rules): complete = no later page (page >= totalPages, else fewer rows than a page); total = the
 *  answer's pagination.total when it is a number. */
export function pageAt(r: unknown, page: number): ComputerPage & { total?: number } {
  const d = rec(rec(r)?.data);
  const list = d?.computers;
  if (!Array.isArray(list)) throw { kind: 'unavailable', status: 0, code: 'BAD_LIST' };
  const pg = rec(d?.pagination);
  const pages = pg?.totalPages;
  const total = typeof pg?.total === 'number' ? pg.total : undefined;
  return { rows: list as ComputerWire[], complete: typeof pages === 'number' ? page >= pages : list.length < PAGE_ROWS, total };
}

/** The containers list of the shown realm (page 1, 100 rows; staleTime 30 s): the shell's read, shared. Rows only; an unreadable body is an
 *  error (see pageOf): no data on a first read, and on a refetch the error with the last rows kept (TanStack restores them), so a
 *  caller checks `isError` first. A caller that must tell "none" from "not in the first 100" reads computersPage. */
export const computersList = defineQuery(containersRoute, {
  input: () => ({ query: { page: 1, limit: 100 } }),
  select: (r): ComputerWire[] => pageOf(r).rows,
  staleTime: 30_000,
  // Its read-back (a lifecycle change's proof) is page 1 only: useComputersAll's later pages never join or fail it.
  readBack: 'own',
});

/** The same read as computersList (one request, one cache entry) with `complete`: false means the rows are not known to be the whole list
 *  (more pages, or a full page with no usable pagination), so a computer missing from `rows` is not known to be absent ("not in the
 *  first 100", never "none"). Like computersList, a refetch whose body is unreadable sets the query's error and keeps the last rows
 *  and `complete`: a caller checks `isError` before it says "none" or "not in the first 100". */
export const computersPage = defineQuery(containersRoute, {
  input: () => ({ query: { page: 1, limit: 100 } }),
  select: pageOf,
  staleTime: 30_000,
  readBack: 'own',
});

/** The most pages computersAll reads (100 rows each): a realm past 1,000 computers stays incomplete (capped). */
export const ALL_PAGES_MAX = 10;

/** Page n of the containers list, raw (page 1 is computersPage's own request and cache entry: same route and query). */
const computersPageAt = defineQuery(containersRoute, {
  input: (page: number) => ({ query: { page, limit: 100 } }),
  staleTime: 30_000,
});

/** Every page of the shown realm's containers list, up to ALL_PAGES_MAX (see the contract in useComputersAll). */
export interface ComputersAll {
  /** The rows of the pages read so far, in page order, each computer once; null until page 1 answers. */
  readonly rows: readonly ComputerWire[] | null;
  /** The whole list came in one page, one read: a computer missing from rows is not in the list. */
  readonly complete: boolean;
  /** Every page is in, but the list took several pages. Pages are read at different moments (offset paging, no list revision),
   *  so a computer created or deleted between two reads can be skipped: a computer missing from rows is unknown, never gone. */
  readonly unproven: boolean;
  /** Later pages are still being read: a computer missing from rows is not known yet. */
  readonly more: boolean;
  /** ALL_PAGES_MAX pages were read and the list goes on. */
  readonly capped: boolean;
  /** A page's last read failed or was unreadable (the rows already shown are kept). */
  readonly failed: boolean;
  readonly error: unknown;
  /** Page 1 has not answered yet. */
  readonly loading: boolean;
  /** Re-reads every page the walk needs now (never one past the end). */
  retry(): void;
}

/** Page n with every row checked: an object with a non-empty string id. Anything else makes the page unreadable (BAD_LIST). */
function readPage(r: unknown, page: number): ReturnType<typeof pageAt> {
  const p = pageAt(r, page);
  for (const row of p.rows) {
    const id = rec(row)?.id;
    if (typeof id !== 'string' || !id) throw { kind: 'unavailable', status: 0, code: 'BAD_LIST' };
  }
  return p;
}

/**
 * useComputersAll: the whole containers list of the shown realm, read page by page (100 rows, page 1 shared with computersPage).
 * Contract, in plain words:
 *   - Page n+1 is read only once page n is in, readable, and says a later page exists, up to ALL_PAGES_MAX pages. Rows grow as
 *     pages land; a computer read on two pages shows once. Nothing is re-read by itself: only retry() (or TanStack's own
 *     refresh of a stale page) reads again, so a walk sends at most ALL_PAGES_MAX requests.
 *   - complete is true only when page 1 is the whole list (pageOf's rule) and its read is readable and did not fail: one page is
 *     one read, so a computer missing from it is not in the list, as computersPage says today. A list that takes several pages
 *     is never complete, even with every page in: offset pages read at different moments can skip a computer while totals and
 *     counts still match. Then unproven is true, and a missing computer stays unknown ("not found yet", Check again).
 *   - more is true while a needed page has not answered; capped when ALL_PAGES_MAX pages are in and the list goes on.
 *   - failed is any needed page's last read. An unreadable page (no containers list, or a row without a string id) stops the walk
 *     there and fails, and no later page is asked for.
 *   - Rows shown only shrink through a whole walk: every page read readably up to the page that ends the list, no page failed
 *     (a capped walk is not whole: a cap ends the reading, not the list). Its rows are what shows, a shorter list included.
 *     Any other walk (still reading, capped, failed or unreadable) shows its readable pages up to where it stopped, then every
 *     row shown before in this realm view that is not among them. A page past an unreadable one never adds a row.
 *   - A whole walk also fences off the pages past its end: their cached answers are marked stale (not re-read), and until such a
 *     page answers again it counts as not answered yet (no rows, no end of the list), so an old cached page never brings back
 *     a row a shorter list removed. The fence is kept per realm view for as long as those cached pages are (not per mounted
 *     view), so a remount or a whole walk in another realm view never lifts it; a page whose cache entry was replaced since
 *     counts as answered once the new entry has an answer.
 *   - A row's fields: as its own page has them when that page answered since the rows were last shown (answer counts,
 *     TanStack's dataUpdateCount, observed as they change); else as another page answered since lists it; else as last shown.
 *     A page that has not answered since never overrides a row. Kept rows never make the list complete or unproven.
 *   - Everything is scoped to the account, realm and generation the pages are keyed by: a switch never carries rows over.
 */
/** The fence of the last whole walk in each realm view (page 1's key): its last page, every page's answer count then, and the
 *  cache entry each page had then. Kept beside the query cache, never in a mounted view; dropped once none of those entries is
 *  still in the cache. */
type Fence = { last: number; counts: readonly number[]; entries: readonly (Query | undefined)[] };
const fences = new Map<string, Fence>();
let fencesWatched = false;
function watchFences(): void {
  if (fencesWatched) return;
  fencesWatched = true;
  const cache = queryClient.getQueryCache();
  cache.subscribe((e) => {
    if (e.type !== 'removed') return;
    for (const [k, f] of fences) if (!f.entries.some((q) => q !== undefined && cache.get(q.queryHash) === q)) fences.delete(k);
  });
}

export function useComputersAll(o?: { enabled?: boolean }): ComputersAll {
  const s = useCore();
  const on = o?.enabled ?? true;
  const pages = Array.from({ length: ALL_PAGES_MAX }, (_, i) => i + 1);
  // Whether page n may be read: page n-1 is cached, readable, and says a later page exists. Read from the cache each render
  // (useQueries re-renders when any of them changes), so the walk advances as pages land.
  const cachedPage = (n: number): ReturnType<typeof pageAt> | undefined => {
    const d = queryClient.getQueryData(computersPageAt.key(n, s));
    if (d === undefined) return undefined;
    try { return readPage(d, n); } catch { return undefined; }
  };
  const needed = (n: number): boolean => {
    if (!on) return false;
    if (n === 1) return true;
    const prev = cachedPage(n - 1);
    return !!prev && !prev.complete && needed(n - 1);
  };
  const enabled = pages.map(needed);
  const results = useQueries({
    queries: pages.map((n) => ({ ...computersPageAt.options(n, s), enabled: enabled[n - 1] })),
  });
  // The realm view the pages belong to (account, realm, generation): page 1's key.
  const scope = JSON.stringify(computersPageAt.key(1, s));
  // Each page's answer count (TanStack's dataUpdateCount), observed from the query cache so that an answer equal to the last one
  // (same data, same time) still counts as new and recomputes the view.
  const entryOf = (n: number) => queryClient.getQueryCache().find({ queryKey: computersPageAt.key(n, s), exact: true });
  const countOf = (n: number) => queryClient.getQueryState(computersPageAt.key(n, s))?.dataUpdateCount ?? 0;
  const subscribe = useCallback((cb: () => void) => queryClient.getQueryCache().subscribe(cb), []);
  const countsNow = () => pages.map(countOf).join(',');
  const countsKey = useSyncExternalStore(subscribe, countsNow, countsNow);
  // The rows last shown in this realm view and each page's answer count then (see the contract); the fence is this realm
  // view's entry in `fences`. The walk only reads them; the effect below writes them after each committed render, so the memo
  // stays pure.
  const shown = useRef<{ scope: string; rows: readonly ComputerWire[]; counts: readonly number[] }>({ scope, rows: [], counts: [] });

  const view = useMemo(() => {
    const mine = shown.current.scope === scope;
    const kept = new Map<string, ComputerWire>(mine ? shown.current.rows.map((r) => [r.id as string, r]) : []);
    const then = mine ? shown.current.counts : [];
    const wall = fences.get(scope);
    // Page n past the fence has answered since: its cache entry is the fenced one and its count rose, or it is a new entry
    // (the fenced one went) that has an answer.
    const answeredSince = (n: number) => (entryOf(n) === wall!.entries[n - 1] ? counts[n - 1]! > (wall!.counts[n - 1] ?? 0) : counts[n - 1]! > 0);
    const counts = countsKey.split(',').map(Number);
    const since = (i: number) => counts[i]! > (then[i] ?? 0);
    // Each row as the pages answered since the rows were last shown list it (the first such page in page order).
    const fresh = new Map<string, ComputerWire>();
    results.forEach((q, i) => {
      if (q.data === undefined || !since(i)) return;
      try { for (const r of readPage(q.data, i + 1).rows) if (!fresh.has(r.id as string)) fresh.set(r.id as string, r); } catch { /* unreadable: nothing to update from */ }
    });
    const pick = (r: ComputerWire, own: boolean): ComputerWire => (own ? r : fresh.get(r.id as string) ?? kept.get(r.id as string) ?? r);
    const rows: ComputerWire[] = [];
    const seen = new Set<string>();
    let failed = false, error: unknown = undefined, more = false, last = false, capped = false, used = 0, any = false;
    for (const n of pages) {
      const q = results[n - 1]!;
      if (q.isError) { failed = true; error ??= q.error; }
      if (q.data === undefined) { if (!q.isError) more = n > 1 || q.isPending; break; }
      // Past the last whole walk's end and not answered since: not answered yet (it is being read again).
      if (wall && n > wall.last && !answeredSince(n)) { if (!q.isError) more = true; break; }
      let p: ReturnType<typeof pageAt>;
      // Unreadable: the walk stops here and fails, and asks for no later page.
      try { p = readPage(q.data, n); } catch (e) { failed = true; error ??= e; break; }
      used = n;
      any = true;
      for (const r of p.rows) { const k = r.id as string; if (!seen.has(k)) { seen.add(k); rows.push(pick(r, since(n - 1))); } }
      if (p.complete) { last = true; break; }
      if (n === ALL_PAGES_MAX) capped = true;
    }
    const whole = last && !failed;
    if (!whole && kept.size) {
      // Not a whole walk: every row shown before stays, after this walk's own rows (never as proof).
      any = true;
      for (const [k, r] of kept) if (!seen.has(k)) { seen.add(k); rows.push(fresh.get(k) ?? r); }
    }
    return {
      counts,
      whole: whole ? used : 0,
      rows: any ? rows : null,
      complete: last && !failed && used === 1,
      unproven: last && !failed && used > 1,
      more,
      capped,
      failed,
      error,
      loading: results[0]!.isPending,
    };
    // Recomputed on the realm view, every page's answer itself (data and error identity) and its answer count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, countsKey, ...results.flatMap((q) => [q.data, q.error, q.status, q.fetchStatus])]);
  useEffect(() => {
    // Rows kept for another realm view are never read: the memo checks the scope.
    if (view.rows) shown.current = { scope, rows: view.rows, counts: view.counts };
    if (view.whole) {
      watchFences();
      fences.set(scope, { last: view.whole, counts: view.counts, entries: pages.map(entryOf) });
      // The pages past the end: stale, so they are read again when the list reaches them (never re-read now).
      for (let n = view.whole + 1; n <= ALL_PAGES_MAX; n++) {
        void queryClient.invalidateQueries({ queryKey: computersPageAt.key(n, s), exact: true, refetchType: 'none' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, view]);

  // Every page the walk needs now (read, failed or not read yet); never a page past the end of the list. Stable across renders
  // (it reads this render's queries through a ref), so callers may keep it in memos.
  const live = useRef({ results, enabled });
  live.current = { results, enabled };
  const retry = useCallback(() => { live.current.results.forEach((q, i) => { if (live.current.enabled[i]) void q.refetch(); }); }, []);

  const { counts: _counts, whole: _whole, ...out } = view;
  return { ...out, retry };
}

/** POST /computers/:id/:op (realm). */
export const computerLifecycleRoute = defineRoute({ method: 'POST', path: '/computers/:id/:op', scope: 'realm' });

const TARGET: Readonly<Record<LifecycleOp, string>> = {
  start: 'running', resume: 'running', restart: '', stop: 'stopped', 'force-stop': 'stopped', pause: 'paused',
};

/** What a fresh containers list shows about one lifecycle change (see the contract). */
export function lifecycleVerdict(change: unknown, rows: readonly ComputerWire[]): ReadVerdict {
  const c = rec(change);
  const op = c?.op as LifecycleOp | undefined;
  if (typeof c?.computer !== 'string' || !op || !(op in TARGET)) return undefined;
  // A row that is not an object (null, a string) is no computer: skipped, never read, so a bad row cannot throw from a held change's proof.
  const row = rows.map(rec).find((x) => x?.id === c.computer);
  if (!row || !TARGET[op]) return undefined;
  return String(row.status || '').toLowerCase() === TARGET[op] ? 'applied' : undefined;
}

/** A `proves` over computersList's answers (answers[0]) for a lifecycle change's identity {computer, op}. */
export const lifecycleProves = (identity: unknown, answers: readonly (readonly unknown[])[]): ReadVerdict => {
  const rows = (answers[0] ?? []).flatMap((a) => (Array.isArray(a) ? (a as ComputerWire[]) : []));
  return lifecycleVerdict(identity, rows);
};

/** The shared lock of a computer's lifecycle, for a coreSource change or a defineMutation of the same route
 *  (variables {id, op}). Spread whole, it also records the operation as the held change's identity (heldChanges,
 *  proves), so a shared hold always says which operation it holds; add `proves: lifecycleProves` with
 *  computersList as the read, or the change stays held until dismissed. Prefer computerLifecycle itself. */
export const lifecycleLock = Object.freeze({
  lock: 'computer.lifecycle',
  lockKey: (v: { id: string }) => ({ computer: v.id }),
  // A computer is the same computer in every realm view (All realms included): its lifecycle lock is not filed
  // under the realm shown, so a hold sent in one view refuses every other view's press on that computer.
  acrossRealms: true,
  identity: (v: { id: string; op?: string }) => ({ computer: v.id, op: v.op }),
});

/** The one computer lifecycle change (see the contract). */
export const computerLifecycle = defineMutation<LifecycleVars>(computerLifecycleRoute, {
  input: (v) => {
    if (!v || typeof v.id !== 'string' || !v.id || !LIFECYCLE_OPS.includes(v.op)) throw new Error('lifecycle vars');
    return { params: { id: v.id, op: v.op } };
  },
  reads: [computersList],
  ...lifecycleLock,
  proves: lifecycleProves,
});
