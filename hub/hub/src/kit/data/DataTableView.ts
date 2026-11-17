// useDataView: the one standard data view behind every list page: search, filter chips, sort, paging or "Show more",
// selection and the open row, handed to DataTable as `view`. Filters, sort, page and the open row live in the URL; the
// search text never does: what a person types can hold a secret, and an address keeps it in the history, in a shared
// link and in a reload. The rules are on useDataView below; the pure pipeline is DataTableViewLogic.ts.
import { type ColumnDef } from '@tanstack/react-table';
import { type ParsedLocation, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthPurge, onTeardown, useCore } from '@core';
import type { FilterChip, FilterOption } from './FilterChips.pure';
import { PageNavHoldContext } from '../navhold';
import { hostEnv } from '../../core/host-env';
import { browserEntryState, replaceBrowserEntryState } from './browserReads.web';
import { type FilterKind, type FilterValue, type SortValue, facetCounts, formatFilter, optionsFromRows, parseFilter, runPipeline } from './DataTableViewLogic';

type RowValue = string | number | readonly (string | number)[] | null | undefined;

/** One filter of a data view: how a row answers it and how its chip is drawn. */
export interface ViewFilter<T> {
  /** Also the URL key (with the view's prefix). */
  id: string;
  /** Chip name (resolved string). */
  label: string;
  /** 'single' (default): one value; 'multi': any of several; 'range': a number between min and max. */
  kind?: FilterKind;
  /** The row's value: one id, several (tags, realms), or a number for ranges. */
  value: (row: T) => RowValue;
  /** The choices; default: every value found in the rows, labelled by `optionLabel`. */
  options?: readonly FilterOption[];
  optionLabel?: (value: string) => string;
  /** Range filters: bounds, step and how a number reads ("4 GB"). */
  range?: { min?: number; max?: number; step?: number; format?: (n: number) => string };
  /** 'segmented': a single-choice filter shown as a segmented control on wide toolbars (it still
   * folds into Filters on narrow ones). Default 'chip'. */
  display?: 'chip' | 'segmented';
  /** A required single choice (an Unread | Archive switch): it always has a value, `defaultValue`
   * when the URL has none (the default is never written). No "Any", no ×, not counted as a filter,
   * kept by Clear filters; still sent in `query.filters`. */
  required?: boolean;
  defaultValue?: string;
  /** false: the value only picks what to load (the server or the page reads it); rows are not
   * filtered on the client. Default true. */
  apply?: boolean;
}

/** What a server-mode page tells the view about the current answer. */
export interface DataViewServer {
  /** How many rows match on the server (the "of M"). */
  total?: number;
  /** Cursor lists: another page exists after these rows ("Show more"). */
  hasMore?: boolean;
  isLoading?: boolean;
  error?: unknown;
  /** Search debounce in ms before the query changes (default 300). */
  debounce?: number;
}

/** What a page gives useDataView: its rows and columns, and which of search, filters, sort, paging and groups it wants. */
export interface DataViewOptions<T> {
  /** All rows (client mode) or the rows of the current answer (server mode); undefined = loading. */
  rows: readonly T[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: readonly ColumnDef<T, any>[];
  getRowId: (row: T) => string;
  /** Searched fields: column ids, or a function returning the texts. Default: every column
   * whose value is text or a number. false: no search box. */
  search?: readonly string[] | ((row: T) => readonly (string | number | null | undefined)[]) | false;
  filters?: readonly ViewFilter<T>[];
  /** Default sort: a column id, '-id' for descending. */
  sort?: string;
  /** Rows per page. With `more`, the first page grows by this much per "Show more". */
  pageSize?: number;
  more?: boolean;
  /** URL key prefix, for a second view on one page. */
  param?: string;
  /** Client mode: still loading / the read failed (old rows stay with a warning band). */
  isLoading?: boolean;
  error?: unknown;
  server?: DataViewServer;
  /** What else the rows belong to beyond the core context (account, realm, generation, computer),
   * e.g. the selected Bot: a change drops the rows and the selection like a context switch. */
  context?: string | number;
  /** Group headers inside the sorted view. `key` names a row's group; `order` lists the groups first to last;
   * `label` is a group's header text (resolved string). Keep it stable (useMemo), like `filters`. */
  group?: DataViewGroup<T>;
  /** The table picks one row (DataTable `selectable: 'pickOne'`): the selection holds one id at most, the last set. */
  pickOne?: boolean;
}

/** How a grouped view names a row's group, orders the groups and words their headers (DataViewOptions.group). */
export interface DataViewGroup<T> {
  key: (row: T) => string;
  order: readonly string[];
  label: (key: string) => string;
}

/** One group of a grouped view, in order: `count` = its rows matching the search and filters (every page, client
 * mode; the rows on hand, server mode). */
export interface DataViewGroupInfo {
  id: string;
  label: string;
  count: number;
}

/** What a server-mode page keys its fetch on. Client mode fills it too (handy for tests). */
export interface DataQuery {
  q: string;
  /** URL form per filter id ("running,paused", "2..8"). */
  filters: Readonly<Record<string, string>>;
  /** 'name' or '-name'. */
  sort?: string;
  page: number;
  pageSize?: number;
}

/** What useDataView returns: the rows to show and every piece of list state, with its setters, for DataTable's `view`. */
export interface DataView<T> {
  /** The rows to show now (this page, or all shown so far with "Show more"). */
  rows: T[];
  /** Rows matching search and filters (client) or the server's total. */
  matched: number;
  /** All rows before search and filters (client) or the server's total. */
  total: number;
  query: DataQuery;
  /** The search box text (updates at once; the applied search and server query follow). Never in the URL. */
  q: string;
  /** `now`: apply it at once, cancelling a pending debounced one (a page setting a whole view, not typing). */
  setQ: (q: string, opts?: { now?: boolean }) => void;
  /** Chips ready for the toolbar, × and options wired. */
  chips: FilterChip[];
  filterValue: (id: string) => FilterValue | undefined;
  /** A person's filter change goes back to page 1; `keepPage` is for a page's own opening default, which the person
   *  did not choose, so a link's ?page survives it. */
  setFilter: (id: string, value: FilterValue | undefined, opts?: { keepPage?: boolean }) => void;
  isFiltered: boolean;
  /** Clears the search and every filter (the no-match state's "Clear filters"). */
  clearAll: () => void;
  sort: { id: string; desc: boolean } | undefined;
  setSort: (sort: { id: string; desc: boolean } | undefined) => void;
  page: number;
  pages: number;
  setPage: (page: number) => void;
  more: boolean;
  canShowMore: boolean;
  showMore: () => void;
  selected: ReadonlySet<string>;
  setSelected: (ids: Set<string>) => void;
  selectedRows: T[];
  /** The open row (?sel=), for ListDetailPage and the table's selected look. */
  activeId: string | undefined;
  open: (id: string | undefined, opts?: { replace?: boolean }) => void;
  isLoading: boolean;
  /** The rows on screen are older than the current query (a refresh is running). */
  isRefreshing: boolean;
  error: unknown;
  getRowId: (row: T) => string;
  /** The URL keys this view owns (with its prefix): search, sort, page, open row. */
  keys: { q: string; sort: string; page: string; sel: string };
  serverMode: boolean;
  pageSize?: number;
  /** Rows of the current context exist (possibly older than the query, see isRefreshing). */
  hasData: boolean;
  /** The view has a search (`search: false` turns the table's search box off). */
  searchable: boolean;
  /** Changes with the context (account, realm, generation, computer, `context`): the table
   * drops its own per-row state (expanded rows, a pending follow) when it moves. */
  contextKey: string;
  /** With `group`: the groups that have matching rows, in order, and a row's group. */
  groups?: readonly DataViewGroupInfo[];
  groupOf?: (row: T) => string;
}

type SortingFn<T> = (a: { original: T; getValue: (id: string) => unknown }, b: { original: T; getValue: (id: string) => unknown }, id: string) => number;

function colId<T>(c: ColumnDef<T, unknown>): string | undefined {
  return c.id ?? (c as { accessorKey?: string }).accessorKey;
}

function accessorOf<T>(c: ColumnDef<T, unknown>): ((row: T) => unknown) | undefined {
  const fn = (c as { accessorFn?: (row: T, i: number) => unknown }).accessorFn;
  if (fn) return (row) => fn(row, 0);
  const key = (c as { accessorKey?: string }).accessorKey;
  if (key) return (row) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), row);
  return undefined;
}

type Patch = Record<string, string | undefined>;

/** Several search parameters written in one history step. */
function useSearchState(): [Readonly<Record<string, string>>, (patch: Patch, opts?: { replace?: boolean }) => void] {
  // The router's default parser turns ?q=12 into a number and ?x=true into a boolean: every
  // value the view reads is a string. The page's own location (PageNavHold): a page kept on screen while the next one
  // loads never reads, adopts or strips the next page's keys.
  // (navhold, not nav: tests replace nav with a partial mock; this is nav's useLocationPart rule.)
  const hold = useContext(PageNavHoldContext);
  const raw = useRouterState({
    select: (s: { location: ParsedLocation }) =>
      (hold && hold.location && !hold.owns(s.location.pathname) ? hold.location.search : s.location.search) as Record<string, unknown>,
  } as never) as Readonly<Record<string, unknown>>;
  const search = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (v !== undefined && v !== null) out[k] = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return out;
  }, [raw]);
  const navigate = useNavigate();
  const router = useRouter();
  const write = useCallback(
    (patch: Patch, opts?: { replace?: boolean }) => {
      // A page kept hidden never moves the address of the page shown (useGo, useSearchParam do the same), and a page
      // kept on screen while the next one loads never writes the next page's location (its debounce firing late would
      // clear the next page's `page`): the same ownership rule as the entry stamp below.
      if (hold?.hidden() || (hold && hold.location && !hold.owns(router.state.location.pathname))) return;
      const replace = opts?.replace ?? true;
      void navigate({
        to: '.',
        // A replace keeps the entry's history.state (the opaque id of its search, stamped there in place by
        // useEntryId: the router's location shares that state object); a new entry starts without.
        ...(replace ? { state: true } : {}),
        search: ((prev: Record<string, string>) => {
          const out: Record<string, string> = { ...prev };
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') delete out[k];
            else out[k] = v;
          }
          return out;
        }) as never,
        replace,
      });
    },
    [navigate, hold, router],
  );
  return [search, write];
}

/** history.state key of the opaque ids that name each list entry's search (one per view key: q, wq, ...). */
const HELD = 'hubSearchId';
/** The searches, by entry id, in this document's memory only: history.state holds the id, never the text, so no
 *  session history, restored session, reload or other tab ever has the words. Scoped to the view's context (account,
 *  realm, computer, page context): a realm switch never shows another realm's search. Oldest dropped past HELD_MAX;
 *  a text longer than HELD_TEXT_MAX UTF-16 code units is not kept at all (Back shows an empty box, never a cut search),
 *  and a sign-out, any other auth purge or a teardown (account end, realm switch) forgets every one (typed searches can
 *  hold a secret). */
const held = new Map<string, { scope: string; q: string }>();
const HELD_MAX = 256;
const HELD_TEXT_MAX = 1024;
let forgetHooked = false;
/** Hooks the purge and teardown clears once, on the first search kept: no module-level effect (kit stays pure), and a
 *  page that never keeps a search registers nothing. */
function hookForget(): void {
  if (forgetHooked) return;
  forgetHooked = true;
  try {
    onAuthPurge(() => held.clear());
    onTeardown(() => held.clear());
  } catch {
    /* a unit test's partial @core mock has neither; the app's core always does */
  }
}
function remember(id: string, scope: string, q: string): void {
  hookForget();
  held.delete(id);
  held.set(id, { scope, q: q.length > HELD_TEXT_MAX ? '' : q });
  if (held.size > HELD_MAX) held.delete(held.keys().next().value as string);
}
/** What this document remembers for an entry, in this context only ('' for anything else). */
function recall(id: string | undefined, scope: string): string {
  const m = id === undefined ? undefined : held.get(id);
  return m && m.scope === scope ? m.q : '';
}
const newEntryId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

type EntryState = { [HELD]?: Record<string, unknown>; __TSR_key?: string; key?: string } & Record<string, unknown>;
const entryKeyOf = (st: EntryState | undefined): string => st?.__TSR_key ?? st?.key ?? '';
const heldIdsOf = (st: EntryState | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(st?.[HELD] ?? {})) if (typeof v === 'string') out[k] = v;
  return out;
};

/**
 * Same-page moves carry the search: a push to the same path (a tab, a page step, a
 * row opened by a link) is a new history entry with no id, and a list that mounts there would start empty. So each push
 * that keeps the path takes the ids the entry it left had (its own, or the ones it carried), by the new entry's key, in
 * this document's memory only: ids, never text, the texts stay in `held` (forgotten on a purge or teardown, and scoped),
 * and nothing is written to the entry. A push to another path (a fresh visit from another page) carries nothing, nor does
 * a reload or Back (no push). Only an entry without an id of its own reads it, once, when its list mounts.
 */
const carried = new Map<string, Record<string, string>>();
const CARRIED_MAX = 256;
const carrying = new WeakSet<object>();
type HistoryLike = { location: { pathname: string; state: unknown }; subscribe: (cb: (e: { location: { pathname: string; state: unknown }; action: { type: string } }) => void) => () => void };
function carrySamePage(history: HistoryLike): void {
  if (carrying.has(history)) return;
  carrying.add(history);
  let last = history.location;
  history.subscribe(({ location, action }) => {
    const from = last;
    last = location;
    if ((action.type !== 'PUSH' && action.type !== 'REPLACE') || location.pathname !== from.pathname) return;
    const fromState = from.state as EntryState | undefined;
    const ids = { ...(carried.get(entryKeyOf(fromState)) ?? {}), ...heldIdsOf(fromState) };
    const key = entryKeyOf(location.state as EntryState | undefined);
    if (!key || Object.keys(ids).length === 0) return;
    carried.delete(key);
    carried.set(key, ids);
    if (carried.size > CARRIED_MAX) carried.delete(carried.keys().next().value as string);
  });
}

/**
 * The id the live list entry carries for view key `key` (search, open a row, Back, and the search
 * is still there). [this entry's id or undefined (a new entry, or one a write replaced without it), the id a same-page
 * push carried onto this entry (only read when it has none of its own), stamp(id): put the id on the live entry; false
 * when skipped]. A page that does not own the live location (kept on screen while the next loads, or hidden) reads its
 * own entry and never stamps.
 *
 * The stamp writes the id into the entry's state in place, the way the FAQ landing mark does (nav.tsx useLandedMark): the
 * history's own state object (a memory history keeps it) and, in a browser, the browser's entry through the prototype's
 * replaceState, which the router's wrapper does not see. So a stamp is no navigation: the entry keeps its key, the router
 * neither reloads nor re-renders the page (a history.replace would give the entry a new key and remount what is keyed on
 * it), and Back or Forward to the entry finds the id. This view keeps the id it stamped for the entry it stamped.
 */
function useEntryId(key: string): [string | undefined, string | undefined, (id: string) => boolean] {
  const hold = useContext(PageNavHoldContext);
  const router = useRouter();
  const pick = useRouterState({
    select: (s: { location: ParsedLocation }) => {
      const loc = hold && hold.location && !hold.owns(s.location.pathname) ? hold.location : s.location;
      const st = loc.state as unknown as EntryState | undefined;
      const ek = entryKeyOf(st);
      return `${ek}\n${heldIdsOf(st)[key] ?? ''}\n${carried.get(ek)?.[key] ?? ''}`;
    },
  } as never) as string;
  const [ek = '', rid = '', rcarry = ''] = pick.split('\n');
  const [own, setOwn] = useState<{ ek: string; id: string } | undefined>(undefined);
  useEffect(() => carrySamePage(router.history as unknown as HistoryLike), [router]);
  const entry = rid || (own && ek !== '' && own.ek === ek ? own.id : '') || undefined;
  const stamp = useCallback(
    (id: string) => {
      if (hold?.hidden() || (hold && hold.location && !hold.owns(router.state.location.pathname))) return false;
      const h = router.history;
      const st = h.location.state as unknown as EntryState | undefined;
      const liveKey = entryKeyOf(st);
      if (!st || liveKey === '') {
        // A history that gives no key: a replace to the same address.
        h.replace(h.location.href, { ...(st ?? {}), [HELD]: { ...heldIdsOf(st), [key]: id } } as never);
        return true;
      }
      const ids = { ...heldIdsOf(st), [key]: id };
      st[HELD] = ids;
      // The browser's own entry state, only where the Hub is a web page (a terminal host has no browser history).
      if (hostEnv().browserPage === true) {
        const ws = browserEntryState() as EntryState | null;
        if (ws && entryKeyOf(ws) === liveKey) replaceBrowserEntryState({ ...ws, [HELD]: ids });
      }
      setOwn({ ek: liveKey, id });
      return true;
    },
    [hold, router, key],
  );
  return [entry, rcarry || undefined, stamp];
}

/**
 * The standard data view of a list page; pass the result to DataTable as `view`.
 *
 *   const view = useDataView({ rows, columns, getRowId, search: ['name', 'project'],
 *     filters: [{ id: 'state', label: t('state'), value: (r) => r.state, options }], sort: 'name', pageSize: 50 });
 *   <DataTable label={t('title')} columns={columns} view={view} actions={actions} />
 *
 * It owns search (case- and accent-insensitive, every word must match), filter chips (single, multi, range; × clears
 * one, Clear all clears them all), sort, paging or "Show more", selection and bulk, and the open row. Filters, sort,
 * page and the open row live in the URL (one key per filter, sort, page, sel; with `param: 'x'` every key gets an x
 * prefix), so Back/Forward and reload restore them. The search text never does: it lives in this document's memory. A
 * link may still open a search (`?q=…`, prefixed like the rest): the view adopts it and takes it out of the address at
 * once (replace), so the text is shown but never kept there.
 *
 * Server mode (`server: {...}`): the view filters, sorts and pages nothing itself. It debounces the search, writes the
 * rest to the URL and hands the page `view.query` to key its fetch on; the page passes back the rows of that answer,
 * `total`, and `hasMore` for cursor lists. While a new answer loads, the last rows stay on screen (the table shows its
 * refresh state, not skeletons).
 *
 * Groups (`group: {...}`): headers inside one sorted view ("Needs you", then Today / Yesterday / Older). Client mode
 * orders the matched rows by group (in `order`; a key not listed follows them, in the order it first appears in `rows`,
 * whatever the sort) before paging, keeping the sort inside each group, so a page or "Show more" never skips a group's
 * first rows. `view.groups` lists the groups with rows and their whole-match counts; DataTable draws their header rows
 * (not counted in aria-rowcount, skipped by the keys). Server mode reorders nothing: the groups follow the answer's own
 * order (each group's rows should come together; DataTable opens a header where each run of a group's rows starts).
 *
 * Context: an account, realm, generation or computer change (core), or a change of the page's own `context`, drops
 * every row of the old context, the selection and a pending search write. The table shows loading, then the new answer
 * or an error: never the old context's rows or ids. Client mode never keeps old rows: `rows: undefined` is loading.
 */
export function useDataView<T>(o: DataViewOptions<T>): DataView<T> {
  const p = o.param ?? '';
  const keys = useMemo(() => ({ q: `${p}q`, sort: `${p}sort`, page: `${p}page`, sel: `${p}sel` }), [p]);
  const [search, write] = useSearchState();
  const serverMode = o.server !== undefined;
  const filters = useMemo(() => o.filters ?? [], [o.filters]);
  const appliedFilters = useMemo(() => filters.filter((f) => f.apply !== false), [filters]);
  const core = useCore();
  const contextKey = `${core.account ?? '-'}|${core.realm}|${core.gen}|${core.target ? `${core.target.project.id}/${core.target.container.id}` : '-'}|${o.context ?? ''}`;

  // ── search: the box updates at once; the applied search follows (debounced in server mode). Both live in
  // memory only: typed text is never written to the URL.
  // `search: false` only hides the table's own box: the view still holds the text (Logs draws its own box on view.q).
  const urlQ = search[keys.q] ?? '';
  const [entry, carriedId, stamp] = useEntryId(keys.q);
  // The applied search: what the rows and `query.q` use. A link's ?q= seeds it (first render included), else the
  // search this history entry had (Back to the list after opening a row), else, for an entry without an id, the one a
  // same-page push carried onto it (a tab or a page step and back).
  const [first] = useState(() => urlQ || (entry !== undefined ? recall(entry, contextKey) : recall(carriedId, contextKey)));
  const [applied, setApplied] = useState(first);
  const [q, setQInput] = useState(first);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // One effect for both moves, so a link that changes the context and brings a search in the same update is never
  // undone by the context rule:
  // - a link (or Back/Forward to an older entry) brought search text: adopt it (a pending write is void) and take it
  //   out of the address at once, in the same history entry;
  // - the context moved: a pending debounced search was typed for the old context's list, so it is dropped with it,
  //   and the box goes back to the search that is applied, never text that was not.
  const qContext = useRef(contextKey);
  useEffect(() => {
    const moved = qContext.current !== contextKey;
    qContext.current = contextKey;
    if (urlQ !== '') {
      clearTimeout(timer.current);
      setQInput(urlQ);
      setApplied(urlQ);
      write({ [keys.q]: undefined });
    } else if (moved) {
      clearTimeout(timer.current);
      setQInput(applied);
    }
  }, [urlQ, contextKey, applied, write, keys.q]);
  // Each list entry carries an id; this document remembers the entry's applied search under it.
  // - An entry without an id (a page step, a chip, a write that replaced the state): stamp a new id holding the search
  //   that is applied, so the entry keeps what the list showed there.
  // - Another entry's id arrived (Back or Forward while the list stays mounted): show what that entry had, an empty
  //   search included; an id this document never saw (a reload, a restored session) or another context's gives ''.
  // - Otherwise the applied search is remembered for the live entry. A link's ?q wins (the effect above).
  // An id arriving that this view did not just stamp is a history step (Back/Forward) to that entry: a pending debounce
  // was typed on the entry left behind and goes with it, and the box and the search become the entry's own ('' when
  // this document holds none for it: an evicted or earlier document's id).
  const seenEntry = useRef(entry);
  const stamped = useRef<string | undefined>(undefined);
  useEffect(() => {
    const moved = entry !== seenEntry.current;
    seenEntry.current = entry;
    if (urlQ !== '') return;
    if (entry === undefined) {
      const id = newEntryId();
      remember(id, contextKey, applied);
      if (stamp(id)) stamped.current = id;
      else held.delete(id);
      return;
    }
    if (moved && entry === stamped.current) {
      stamped.current = undefined; // our own stamp landing, once: a later step back to this entry is a traversal
    } else if (moved) {
      const want = recall(entry, contextKey);
      clearTimeout(timer.current);
      setQInput(want);
      remember(entry, contextKey, want);
      if (want !== applied) setApplied(want);
      return;
    }
    remember(entry, contextKey, applied);
  }, [entry, applied, urlQ, contextKey, stamp]);
  const setQ = useCallback(
    (next: string, opts?: { now?: boolean }) => {
      setQInput(next);
      clearTimeout(timer.current);
      const commit = () => {
        setApplied(next);
        // A new search starts at page 1 (the page is in the URL; the text is not).
        write({ [keys.page]: undefined });
      };
      if (serverMode && !opts?.now) timer.current = setTimeout(commit, o.server?.debounce ?? 300);
      else commit();
    },
    [write, keys.page, serverMode, o.server?.debounce],
  );

  // ── filters, sort, page from the URL
  const filterValues = useMemo(() => {
    const out: Record<string, FilterValue | undefined> = {};
    for (const f of filters) {
      let raw = search[`${p}${f.id}`] ?? (f.required ? f.defaultValue : undefined);
      // A required switch always shows one of its options: a hand-typed ?box=bogus reads as the default.
      if (f.required && f.options?.length && !f.options.some((o) => o.value === raw)) raw = f.defaultValue ?? f.options[0]?.value;
      out[f.id] = parseFilter(f.kind ?? 'single', raw);
    }
    return out;
  }, [filters, search, p]);
  // Sortable columns: enableSorting:false keeps a column out of a URL sort too, and so does `table: false` (no header).
  const columnIds = useMemo(
    () => new Set(o.columns.filter((c) => c.enableSorting !== false && c.meta?.table !== false).map((c) => colId(c as ColumnDef<T, unknown>)).filter((x): x is string => !!x)),
    [o.columns],
  );
  const sortRaw = search[keys.sort] ?? o.sort;
  const sort = useMemo(() => {
    if (!sortRaw) return undefined;
    const desc = sortRaw.startsWith('-');
    const id = desc ? sortRaw.slice(1) : sortRaw;
    return columnIds.has(id) ? { id, desc } : undefined;
  }, [sortRaw, columnIds]);
  const page = Math.max(1, Math.floor(Number(search[keys.page] ?? '1')) || 1);

  const setFilter = useCallback(
    (id: string, v: FilterValue | undefined, opts?: { keepPage?: boolean }) =>
      write({ [`${p}${id}`]: formatFilter(v), ...(opts?.keepPage ? {} : { [keys.page]: undefined }) }),
    [write, p, keys.page],
  );
  const clearAll = useCallback(() => {
    clearTimeout(timer.current);
    setQInput('');
    setApplied('');
    const patch: Patch = { [keys.q]: undefined, [keys.page]: undefined };
    for (const f of filters) if (!f.required) patch[`${p}${f.id}`] = undefined;
    write(patch);
  }, [write, keys, filters, p]);
  const setSort = useCallback(
    (s: { id: string; desc: boolean } | undefined) => {
      const raw = s ? `${s.desc ? '-' : ''}${s.id}` : undefined;
      // The default sort is the absence of the key; turning sorting off when a default exists
      // writes "none" so the default does not come back.
      write({ [keys.sort]: raw === o.sort ? undefined : (raw ?? (o.sort ? 'none' : undefined)), [keys.page]: undefined });
    },
    [write, keys, o.sort],
  );
  const setPage = useCallback((n: number) => write({ [keys.page]: n <= 1 ? undefined : String(n) }, { replace: false }), [write, keys.page]);

  // ── rows: server mode keeps the last answer of this context on screen while a new one loads;
  // a context switch drops it (and the selection) before anything renders.
  const lastRows = useRef<{ key: string; rows: readonly T[] } | undefined>(undefined);
  if (o.rows !== undefined) lastRows.current = { key: contextKey, rows: o.rows };
  else if (lastRows.current?.key !== contextKey) lastRows.current = undefined;
  const source = o.rows ?? (serverMode ? lastRows.current?.rows : undefined);
  const error = o.server?.error ?? o.error;
  // A failed read with nothing to show is an error, not loading.
  const isLoading = (Boolean(o.server?.isLoading ?? o.isLoading) || o.rows === undefined) && !(error && source === undefined);
  const isRefreshing = isLoading && source !== undefined;

  const searchFn = useMemo(() => {
    if (o.search === false) return undefined;
    if (typeof o.search === 'function') return o.search;
    const fields = o.search;
    const cols = o.columns.filter((c) => {
      const id = colId(c as ColumnDef<T, unknown>);
      return id !== undefined && (fields === undefined || fields.includes(id));
    });
    const getters = cols.map((c) => accessorOf(c as ColumnDef<T, unknown>)).filter((g): g is (row: T) => unknown => g !== undefined);
    return (row: T) =>
      getters.flatMap((g) => {
        const v = g(row);
        if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' || typeof x === 'number') as (string | number)[];
        return typeof v === 'string' || typeof v === 'number' ? [v] : [];
      });
  }, [o.search, o.columns]);
  const sortValue = useCallback(
    (id: string) => {
      const c = o.columns.find((x) => colId(x as ColumnDef<T, unknown>) === id);
      const get = c ? accessorOf(c as ColumnDef<T, unknown>) : undefined;
      return get ? (row: T) => get(row) as SortValue : undefined;
    },
    [o.columns],
  );
  // A column's own sortingFn (a function; built-in names fall back to its values) wins.
  const sortCompare = useCallback(
    (id: string) => {
      const c = o.columns.find((x) => colId(x as ColumnDef<T, unknown>) === id);
      const fn = c?.sortingFn;
      if (typeof fn !== 'function') return undefined;
      const get = (r: T) => (k: string) => {
        const col = o.columns.find((x) => colId(x as ColumnDef<T, unknown>) === k);
        const g = col ? accessorOf(col as ColumnDef<T, unknown>) : undefined;
        return g ? g(r) : undefined;
      };
      const sfn = fn as unknown as SortingFn<T>;
      return (a: T, b: T) => sfn({ original: a, getValue: get(a) }, { original: b, getValue: get(b) }, id);
    },
    [o.columns],
  );

  const groupOpt = o.group;
  // Group ranks: the listed groups first, then any other key in the order it first appears in the rows as given
  // (never the sorted order, so a new sort moves no group). Server mode keeps the server's order: every key ranks
  // by first appearance in the answer.
  const groupRank = useMemo(() => {
    if (!groupOpt || !source) return undefined;
    const rank = new Map<string, number>();
    if (!serverMode) for (const k of groupOpt.order) if (!rank.has(k)) rank.set(k, rank.size);
    for (const r of source) {
      const k = groupOpt.key(r);
      if (!rank.has(k)) rank.set(k, rank.size);
    }
    return rank;
  }, [groupOpt, source, serverMode]);
  const matchedRows = useMemo(() => {
    if (!source) return [];
    if (serverMode) return [...source];
    const sorted = runPipeline(source, { search: searchFn, filters: appliedFilters, sortValue, sortCompare }, { q, filters: filterValues, sort });
    if (!groupOpt || !groupRank) return sorted;
    // A stable order by group: the sort holds inside each group.
    return sorted
      .map((r) => ({ r, g: groupRank.get(groupOpt.key(r)) ?? groupRank.size }))
      .sort((a, b) => a.g - b.g)
      .map((x) => x.r);
  }, [source, serverMode, searchFn, appliedFilters, sortValue, sortCompare, q, filterValues, sort, groupOpt, groupRank]);
  const groups = useMemo<DataViewGroupInfo[] | undefined>(() => {
    if (!groupOpt || !groupRank) return groupOpt ? [] : undefined;
    const counts = new Map<string, number>();
    for (const r of matchedRows) {
      const k = groupOpt.key(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.keys()]
      .sort((a, b) => (groupRank.get(a) ?? groupRank.size) - (groupRank.get(b) ?? groupRank.size))
      .map((id) => ({ id, label: groupOpt.label(id), count: counts.get(id)! }));
  }, [groupOpt, groupRank, matchedRows]);

  const size = o.pageSize;
  const matched = serverMode ? (o.server?.total ?? matchedRows.length) : matchedRows.length;
  const pages = size && !o.more ? Math.max(1, Math.ceil(matched / size)) : 1;
  const shownPage = Math.min(page, pages);
  const rows = useMemo(() => {
    if (serverMode || !size) return matchedRows;
    if (o.more) return matchedRows.slice(0, page * size);
    return matchedRows.slice((shownPage - 1) * size, shownPage * size);
  }, [serverMode, size, o.more, matchedRows, page, shownPage]);
  const canShowMore = serverMode ? Boolean(o.server?.hasMore) || (o.server?.total !== undefined && rows.length < o.server.total) : Boolean(o.more && size && rows.length < matched);
  const showMore = useCallback(() => setPage(page + 1), [setPage, page]);

  // ── chips for the toolbar
  const chips = useMemo<FilterChip[]>(
    () =>
      filters.map((f) => {
        const kind = f.kind ?? 'single';
        // Client mode counts each option against the search and the other filters; a count the page
        // gives wins, and a filter the rows don't decide (apply:false) or a server view gets none made up.
        const facets = source && !serverMode && f.apply !== false ? facetCounts(source, { search: searchFn, filters: appliedFilters }, { q, filters: filterValues }, f.id) : undefined;
        const options = f.options
          ? facets
            ? f.options.map((x) => (x.count === undefined ? { ...x, count: facets.get(x.value) ?? 0 } : x))
            : f.options
          : source
            ? optionsFromRows(source, f.value).map((x) => ({ value: x.value, label: f.optionLabel ? f.optionLabel(x.value) : x.value, count: facets ? (facets.get(x.value) ?? 0) : x.count }))
            : [];
        return {
          id: f.id,
          label: f.label,
          kind,
          options,
          display: f.display,
          required: f.required,
          range: f.range,
          filter: filterValues[f.id],
          value: formatFilter(filterValues[f.id]),
          // A required filter's default is the absence of its key.
          onChange: (raw: string | undefined) => setFilter(f.id, parseFilter(kind, f.required && raw === f.defaultValue ? undefined : raw)),
        };
      }),
    [filters, source, serverMode, searchFn, appliedFilters, q, filterValues, setFilter],
  );

  // ── selection (in memory: picks are a task, not a place) and the open row (URL)
  // The selection belongs to its context: a switch empties it in the same render, so no row or
  // bulk action ever runs on the old context's ids.
  const [picked, setPicked] = useState<{ key: string; ids: Set<string> }>(() => ({ key: contextKey, ids: new Set() }));
  const selected = useMemo(() => (picked.key === contextKey ? picked.ids : new Set<string>()), [picked, contextKey]);
  const pickOne = o.pickOne === true;
  const setSelectedState = useCallback(
    (ids: Set<string>) => setPicked({ key: contextKey, ids: pickOne && ids.size > 1 ? new Set([...ids].slice(-1)) : ids }),
    [contextKey, pickOne],
  );
  const getRowId = o.getRowId;
  const selectedRows = useMemo(() => (source ?? []).filter((r) => selected.has(getRowId(r))), [source, selected, getRowId]);
  const activeId = search[keys.sel];
  const open = useCallback((id: string | undefined, opts?: { replace?: boolean }) => write({ [keys.sel]: id }, { replace: opts?.replace ?? false }), [write, keys.sel]);

  const filterParams = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of filters) {
      const v = formatFilter(filterValues[f.id]);
      if (v !== undefined) out[f.id] = v;
    }
    return out;
  }, [filters, filterValues]);
  // The server query carries only a sort the view accepted (a sortable, known column).
  const querySort = sort ? `${sort.desc ? '-' : ''}${sort.id}` : undefined;
  const query = useMemo<DataQuery>(() => ({ q: applied, filters: filterParams, sort: querySort, page, pageSize: size }), [applied, filterParams, querySort, page, size]);

  return {
    rows,
    matched,
    total: serverMode ? (o.server?.total ?? matchedRows.length) : (source?.length ?? 0),
    query,
    q,
    setQ,
    chips,
    filterValue: (id) => filterValues[id],
    setFilter,
    isFiltered: q.trim() !== '' || filters.some((f) => !f.required && filterParams[f.id] !== undefined),
    clearAll,
    sort,
    setSort,
    page: shownPage,
    pages,
    setPage,
    more: Boolean(o.more) || (serverMode && o.server?.hasMore !== undefined),
    canShowMore,
    showMore,
    selected,
    setSelected: setSelectedState,
    selectedRows,
    activeId,
    open,
    isLoading,
    isRefreshing,
    error,
    getRowId,
    keys,
    serverMode,
    pageSize: size,
    hasData: source !== undefined,
    searchable: o.search !== false,
    contextKey,
    groups,
    groupOf: groupOpt?.key,
  };
}
