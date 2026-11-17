// The search text a person types into a data view never goes into the URL. It can hold
// a secret (a token pasted to find a key, a password searched in logs), and an address keeps it in the history, in a
// shared link and in a reload. The text lives in the view's memory; a link's ?q= is adopted and taken out at once.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouterState, type ParsedLocation } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wipe } from '@core/realm';
import { PageNavHoldContext, type PageNavHold } from '../navhold';
import { type DataView, type DataViewOptions, useDataView } from './DataTableView';

interface Box {
  id: string;
  name: string;
  state: string;
}
const ROWS: Box[] = [
  { id: 'a', name: 'atlas', state: 'running' },
  { id: 'b', name: 'borealis', state: 'running' },
  { id: 'c', name: 'cedar', state: 'stopped' },
  { id: 'd', name: 'dune', state: 'stopped' },
];
const col = createColumnHelper<Box>();
const COLUMNS = [col.accessor('name', { header: 'Name' }), col.accessor('state', { header: 'State' })];
const FILTERS: DataViewOptions<Box>['filters'] = [{ id: 'state', label: 'State', value: (r) => r.state }];
const SECRET = 'hk_live_EXAMPLE_NOT_A_REAL_KEY';

type Opts = Partial<DataViewOptions<Box>>;
let view: DataView<Box>;
let shown = true;
let setShown: (v: boolean) => void = () => undefined;

/** Every render's (applied search, state filter): a page keying its fetch on both must never see a mixed pair. */
let seen: [string, string | undefined][] = [];
/** Every address the history took, push or replace: a write the next render strips again still sat in an entry. */
let hrefs: string[] = [];
/** Every history.state the history took: it may carry an opaque entry id, never the text. */
let states: string[] = [];
/** Stands for the account/realm part of the view's context (a realm switch remounts the page with another one). */
let realm = 'A';
/** `folder` in the URL is the view's context (Files keys its context on the folder it shows). */
function Probe({ opts }: { opts: Opts }) {
  const folder = useRouterState({ select: (st) => (st.location.search as Record<string, unknown>).folder as string | undefined });
  view = useDataView<Box>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, search: ['name'], filters: FILTERS, sort: 'name', context: `${realm}|${folder ?? ''}`, ...opts });
  seen.push([view.query.q, view.query.filters.state]);
  return null;
}
/** The shell's page hold: null = a page that owns the live location (as outside the shell). */
let hold: PageNavHold | null = null;
function Host({ opts }: { opts: Opts }) {
  const [on, setOn] = useState(shown);
  setShown = setOn;
  return <PageNavHoldContext value={hold}>{on ? <Probe opts={opts} /> : null}</PageNavHoldContext>;
}

async function mount(path: string, opts: Opts = {}) {
  shown = true;
  seen = [];
  hrefs = [];
  states = [];
  const history = createMemoryHistory({ initialEntries: [path] });
  history.subscribe(() => {
    hrefs.push(history.location.href);
    states.push(JSON.stringify(history.location.state ?? null));
  });
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Host opts={opts} /> }),
    history,
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}
type R = Awaited<ReturnType<typeof mount>>;
/** Every way the address could carry the text: the parsed search, the raw href and the history's own location. */
const address = (router: R) => JSON.stringify([router.state.location.search, router.state.location.href, router.history.location.href, router.history.location.search]);
const settle = async (fn?: () => void) => {
  await act(async () => {
    fn?.();
    await new Promise((r) => setTimeout(r, 0));
  });
};
const ids = () => view.rows.map((r) => r.id);

afterEach(() => {
  cleanup();
  realm = 'A';
  vi.useRealTimers();
  hold = null;
});

describe('typed search text never reaches the URL', () => {
  it('client mode: the rows follow the typed text, the address never holds it', async () => {
    const router = await mount('/?state=running');
    await settle(() => view.setQ('atl'));
    expect(ids()).toEqual(['a']);
    expect(view.query.q).toBe('atl');
    expect(view.isFiltered).toBe(true);
    await settle(() => view.setQ(SECRET));
    expect(view.q).toBe(SECRET);
    expect(address(router)).not.toContain(SECRET);
    expect((router.state.location.search as Record<string, unknown>).q).toBeUndefined();
    // The rest of the view still lives in the URL.
    expect((router.state.location.search as Record<string, unknown>).state).toBe('running');
  });

  it('no history entry ever holds the typed text, not even one stripped again a render later (client, server, page step)', async () => {
    let router = await mount('/?state=running', { pageSize: 1 });
    await settle(() => view.setQ(SECRET));
    expect(view.query.q).toBe(SECRET);
    await settle(() => view.setQ(''));
    await settle(() => view.setPage(2)); // a real write after the search: the recorder saw the address move
    expect(router.state.location.search).toMatchObject({ page: '2' });
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((h) => h.includes(SECRET))).toEqual([]);
    cleanup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    router = await mount('/?page=3', { server: { total: 40, debounce: 300 } });
    await act(async () => {
      view.setQ(SECRET);
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(view.query.q).toBe(SECRET);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((h) => h.includes(SECRET))).toEqual([]);
    expect(address(router)).not.toContain(SECRET);
  });

  it('a prefixed view (param "w": the bots work list) never writes wq', async () => {
    const router = await mount('/', { param: 'w' });
    await settle(() => view.setQ(SECRET));
    const s = router.state.location.search as Record<string, unknown>;
    expect(s.wq).toBeUndefined();
    expect(address(router)).not.toContain(SECRET);
  });

  it('server mode: the debounced search reaches query.q, never the address', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const router = await mount('/?page=3', { server: { total: 40, debounce: 300 } });
    await act(async () => {
      view.setQ(SECRET);
      await Promise.resolve();
    });
    expect(view.query.q).toBe('');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(view.query.q).toBe(SECRET);
    // A new search starts at page 1.
    expect(view.query.page).toBe(1);
    expect(address(router)).not.toContain(SECRET);
  });

  it('a page step (a new history entry) after a search carries no text into any entry', async () => {
    const router = await mount('/', { pageSize: 1 });
    await settle(() => view.setQ('a'));
    expect(view.pages).toBeGreaterThan(1);
    await settle(() => view.setPage(2));
    expect((router.state.location.search as Record<string, unknown>).page).toBe('2');
    expect((router.state.location.search as Record<string, unknown>).q).toBeUndefined();
    await settle(() => router.history.back());
    expect((router.state.location.search as Record<string, unknown>).q).toBeUndefined();
    // Back moved the page only: the search stays in memory.
    expect(view.q).toBe('a');
  });

  it('a link that opens a search: the view adopts it and takes it out of the address in the same entry', async () => {
    const router = await mount('/?q=dune&state=stopped');
    // The first render already searches (no flash of every row).
    expect(view.q).toBe('dune');
    await settle();
    expect(ids()).toEqual(['d']);
    expect(view.query.q).toBe('dune');
    const s = router.state.location.search as Record<string, unknown>;
    expect(s.q).toBeUndefined();
    expect(s.state).toBe('stopped');
    expect(address(router)).not.toContain('dune');
    // Replaced, not pushed: Back does not return to the address that held it.
    expect(router.history.length).toBe(1);
  });

  it('an in-app navigation to ?q= while mounted is adopted and stripped too', async () => {
    const router = await mount('/');
    await settle(() => void router.navigate({ to: '/', search: { q: 'cedar' } as never }));
    expect(view.q).toBe('cedar');
    expect(ids()).toEqual(['c']);
    expect((router.state.location.search as Record<string, unknown>).q).toBeUndefined();
  });

  it('a view whose page draws its own box (search: false, the Logs page) holds the text the same way', async () => {
    const router = await mount('/?q=report&state=running', { search: false });
    expect(view.query.q).toBe('report');
    await settle();
    expect((router.state.location.search as Record<string, unknown>).q).toBeUndefined();
    expect((router.state.location.search as Record<string, unknown>).state).toBe('running');
    await settle(() => view.setQ(SECRET));
    expect(view.query.q).toBe(SECRET);
    expect(address(router)).not.toContain(SECRET);
  });

  it('Clear filters empties the search held in memory', async () => {
    await mount('/');
    await settle(() => view.setQ('zzz'));
    expect(view.matched).toBe(0);
    await settle(() => view.clearAll());
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
    expect(view.matched).toBe(4);
  });

  it('search, open a row (the list unmounts), Back: the same search and rows, kept in the entry, never in an address', async () => {
    const router = await mount('/?state=running');
    await settle(() => view.setQ('atl'));
    expect(ids()).toEqual(['a']);
    // Open a row: a new entry, and the page shows the row instead of the list.
    await settle(() => void router.navigate({ to: '/', search: { state: 'running', sel: 'a' } as never }));
    await settle(() => setShown(false));
    await settle(() => router.history.back());
    await settle(() => setShown(true));
    expect(view.q).toBe('atl');
    expect(view.query.q).toBe('atl');
    expect(ids()).toEqual(['a']);
    expect(address(router)).not.toContain('atl');
    expect(hrefs.filter((h) => h.includes('atl'))).toEqual([]);
    // Forward to the row, then Back again: still there.
    await settle(() => setShown(false));
    await settle(() => router.history.forward());
    await settle(() => router.history.back());
    await settle(() => setShown(true));
    expect(view.q).toBe('atl');
  });

  it('a new entry of the list (a fresh visit from another page, not Back) starts empty; Clear all empties what the entry holds', async () => {
    const router = await mount('/');
    await settle(() => view.setQ('atl'));
    await settle(() => setShown(false));
    // Another page, then the list's page again: a push to another path carries nothing (option B carries same-page pushes only).
    await settle(() => void router.navigate({ to: '/elsewhere' } as never));
    await settle(() => void router.navigate({ to: '/' }));
    await settle(() => setShown(true));
    expect(view.q).toBe('');
    expect(view.matched).toBe(4);
    await settle(() => view.setQ('dune'));
    await settle(() => view.clearAll());
    await settle(() => setShown(false));
    await settle(() => setShown(true));
    expect(view.q).toBe('');
  });

  it('option B: a same-page push (a tab away and back, the list unmounted between) carries the search to the new entry', async () => {
    const router = await mount('/');
    await settle(() => view.setQ('atl'));
    expect(ids()).toEqual(['a']);
    // Another tab of the same page: a push to the same path, and the list is not drawn there.
    await settle(() => setShown(false));
    await settle(() => void router.navigate({ to: '/', search: { tab: 'repository' } as never }));
    // Back to the list's tab: another push, the list mounts on an entry with no id of its own.
    await settle(() => void router.navigate({ to: '/' }));
    await settle(() => setShown(true));
    expect(view.q).toBe('atl');
    expect(view.query.q).toBe('atl');
    expect(ids()).toEqual(['a']);
    expect(address(router)).not.toContain('atl');
    expect(states.filter((x) => x.includes('atl'))).toEqual([]);
    // The new entry has its own id: a search there leaves the entry it came from as it was.
    await settle(() => view.setQ('dune'));
    await settle(() => setShown(false));
    await settle(() => router.history.back());
    await settle(() => router.history.back());
    await settle(() => setShown(true));
    expect(view.q).toBe('atl');
  });

  it('option B seeds only an entry without an id of its own: Back to an entry whose own search is empty keeps it empty', async () => {
    const router = await mount('/');
    await settle(() => view.setQ('atl'));
    await settle(() => setShown(false));
    await settle(() => void router.navigate({ to: '/', search: { tab: 'x' } as never }));
    await settle(() => setShown(true));
    expect(view.q).toBe('atl'); // carried onto the tab's entry
    await settle(() => view.setQ('')); // this entry's own search is now empty (its own id holds '')
    await settle(() => setShown(false));
    await settle(() => void router.navigate({ to: '/', search: { tab: 'x', sel: 'a' } as never }));
    await settle(() => router.history.back());
    await settle(() => setShown(true));
    expect(view.q).toBe(''); // its own id wins over what was carried onto it
  });

  it('option B carries ids only within this document and context: a realm switch or a forget shows an empty box', async () => {
    const router = await mount('/');
    await settle(() => view.setQ('atl'));
    await settle(() => setShown(false));
    await settle(() => void router.navigate({ to: '/', search: { tab: 'x' } as never }));
    realm = 'B';
    await settle(() => void router.navigate({ to: '/' }));
    await settle(() => setShown(true));
    expect(view.q).toBe('');
    realm = 'A';
    await settle(() => setShown(false));
    await settle(() => void router.navigate({ to: '/', search: { tab: 'y' } as never }));
    await settle(() => wipe('switch'));
    await settle(() => void router.navigate({ to: '/' }));
    await settle(() => setShown(true));
    expect(view.q).toBe('');
  });

  it('stamping the entry id is no navigation: no history write, the entry keeps its key (nothing keyed on it remounts)', async () => {
    const router = await mount('/');
    const key = () => (router.history.location.state as unknown as { __TSR_key?: string }).__TSR_key;
    const before = key();
    expect(hrefs).toEqual([]);
    expect(typeof ((router.history.location.state as unknown as { hubSearchId?: Record<string, string> }).hubSearchId ?? {}).q).toBe('string');
    expect(key()).toBe(before);
    await settle(() => view.setPage(2));
    // A page step is one push; the stamp on the new entry adds no write of its own.
    expect(hrefs).toHaveLength(1);
    expect(typeof ((router.history.location.state as unknown as { hubSearchId?: Record<string, string> }).hubSearchId ?? {}).q).toBe('string');
  });

  it('an entry id this document never held (a reload, a restored session) restores nothing', async () => {
    const router = await mount('/');
    await settle(() => setShown(false));
    await settle(() => router.history.replace(router.history.location.href, { ...router.history.location.state, hubSearchId: { q: 'from-an-earlier-document' } } as never));
    await settle(() => setShown(true));
    expect(view.q).toBe('');
    expect(view.matched).toBe(4);
  });

  it('history.state never holds the text: only an opaque id, through typing, a page step, Back and Clear all', async () => {
    const router = await mount('/', { pageSize: 1 });
    await settle(() => view.setQ(SECRET));
    await settle(() => view.setQ('a'));
    await settle(() => view.setPage(2));
    await settle(() => router.history.back());
    await settle(() => view.clearAll());
    expect(states.length).toBeGreaterThan(0);
    expect(states.filter((x) => x.includes(SECRET) || x.includes('"a"'))).toEqual([]);
  });

  it('Back and Forward while the list stays mounted: each entry shows its own search, an empty one included', async () => {
    const router = await mount('/');
    expect(view.q).toBe('');
    await settle(() => void router.navigate({ to: '/', search: { state: 'running' } as never }));
    await settle(() => view.setQ('atl'));
    expect(ids()).toEqual(['a']);
    await settle(() => router.history.back());
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
    expect(view.matched).toBe(4);
    await settle(() => router.history.forward());
    expect(view.q).toBe('atl');
    expect(ids()).toEqual(['a']);
    await settle(() => router.history.back());
    expect(view.q).toBe(''); // the empty entry kept its empty search, never took the departing one
  });

  it('Back while mounted to an entry whose id this document does not hold (evicted, another document) shows an empty search', async () => {
    const router = await mount('/');
    // Entry A gets an id this document never held (as an evicted record leaves it) while the list is away, so the id is
    // still unknown when Back reaches it: the view must not take the departing search for it.
    await settle(() => setShown(false));
    await settle(() => router.history.replace(router.history.location.href, { ...router.history.location.state, hubSearchId: { q: 'evicted-or-foreign' } } as never));
    await settle(() => void router.navigate({ to: '/', search: { state: 'running' } as never }));
    await settle(() => setShown(true));
    await settle(() => view.setQ('atl'));
    expect(view.q).toBe('atl');
    await settle(() => router.history.back());
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
    expect(view.matched).toBe(4);
    await settle(() => router.history.forward());
    expect(view.q).toBe('atl');
  });

  it('a search commit and a filter change on the same entry keep its id (a replace keeps history.state, no id churn)', async () => {
    const router = await mount('/');
    const entryId = () => ((router.history.location.state as unknown as { hubSearchId?: Record<string, string> }).hubSearchId ?? {}).q;
    const id = entryId();
    expect(typeof id).toBe('string');
    await settle(() => view.setQ('atl'));
    await settle(() => view.setFilter('state', 'running' as never));
    await settle(() => view.setQ(''));
    expect(entryId()).toBe(id);
  });

  it('server mode: Back before the debounce fires drops the pending text; it never lands on the entry Back went to', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const router = await mount('/', { server: { total: 40, debounce: 300 }, pageSize: 1 });
    await act(async () => {
      view.setPage(2);
      await Promise.resolve();
    });
    await act(async () => {
      view.setQ('pending');
      await Promise.resolve();
    });
    expect(view.q).toBe('pending');
    await act(async () => {
      router.history.back();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
    await act(async () => {
      router.history.forward();
      await Promise.resolve();
    });
    await act(async () => {
      router.history.back();
      await Promise.resolve();
    });
    expect(view.query.q).toBe('');
  });

  it('a realm switch on the same entry (the page remounts in another context) never shows the old realm\'s search', async () => {
    const router = await mount('/');
    await settle(() => view.setQ('atl'));
    await settle(() => setShown(false));
    realm = 'B';
    await settle(() => setShown(true));
    expect(view.q).toBe('');
    expect(view.matched).toBe(4);
    // Open a row and come Back in realm B: B's own (empty) search.
    await settle(() => void router.navigate({ to: '/', search: { sel: 'a' } as never }));
    await settle(() => setShown(false));
    await settle(() => router.history.back());
    await settle(() => setShown(true));
    expect(view.q).toBe('');
  });
});

describe('page ownership, context and a whole view set at once', () => {
  it('a page kept on screen while the next one loads never adopts or strips the next page\'s ?q', async () => {
    let own: ParsedLocation | null = null;
    hold = { location: null, owns: () => own === null, hidden: () => false };
    const router = await mount('/?state=running');
    own = router.state.location; // the person leaves: from now on this page reads its own last location
    hold.location = own;
    await settle(() => void router.navigate({ to: '/', search: { q: 'report' } as never }));
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
    // The next page's search is still there for that page to adopt.
    expect((router.state.location.search as Record<string, unknown>).q).toBe('report');
  });

  it('a page kept hidden never writes the address', async () => {
    hold = { location: null, owns: () => true, hidden: () => true };
    const router = await mount('/?q=dune');
    await settle();
    // Adopted for its own box, but the address of the page shown is not touched.
    expect(view.q).toBe('dune');
    expect((router.state.location.search as Record<string, unknown>).q).toBe('dune');
  });

  it('a page kept on screen while the next one loads: its pending search never writes the next page\'s location', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let own: ParsedLocation | null = null;
    hold = { location: null, owns: () => own === null, hidden: () => false };
    const router = await mount('/?state=running', { server: { total: 40, debounce: 300 }, pageSize: 1 });
    await act(async () => {
      view.setQ('typed-here'); // pending: the commit would reset this page's `page`
      await Promise.resolve();
    });
    own = router.state.location; // the person leaves while the debounce runs
    hold.location = own;
    await act(async () => {
      void router.navigate({ to: '/', search: { page: '3' } as never });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect((router.state.location.search as Record<string, unknown>).page).toBe('3');
    expect(hrefs.every((h) => !h.includes('typed'))).toBe(true);
  });

  it('a search longer than 1,024 characters (UTF-16 code units) is not kept for Back (an empty box, never a cut search)', async () => {
    const router = await mount('/');
    const long = 'x'.repeat(1025);
    await settle(() => view.setQ(long));
    expect(view.q).toBe(long);
    await settle(() => void router.navigate({ to: '/', search: { state: 'running' } as never }));
    await settle(() => router.history.back());
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
  });

  it('a teardown (an account ending, a realm switch) forgets every kept search: Back then shows an empty box', async () => {
    const router = await mount('/');
    await settle(() => view.setQ('atl'));
    await settle(() => void router.navigate({ to: '/', search: { state: 'running' } as never }));
    await settle(() => view.setQ('dune'));
    await settle(() => wipe('switch'));
    await settle(() => router.history.back());
    expect(view.q).toBe('');
    expect(view.query.q).toBe('');
  });

  it('a link that changes the context and brings a search in the same step: the box and the query both follow the link', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const router = await mount('/?folder=a', { server: { total: 4, debounce: 300 } });
    await act(async () => {
      view.setQ('typed-for-a'); // pending, not applied
      await Promise.resolve();
    });
    await act(async () => {
      void router.navigate({ to: '/', search: { folder: 'b', q: 'report' } as never });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.q).toBe('report');
    expect(view.query.q).toBe('report');
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    // The search typed for the old folder never lands.
    expect(view.query.q).toBe('report');
    expect((router.state.location.search as Record<string, unknown>).q).toBeUndefined();
  });

  it('setQ(text, { now: true }) with a URL change in the same step: no render pairs the new search with the old filters', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const router = await mount('/?state=running', { server: { total: 4, debounce: 300 } });
    await act(async () => {
      view.setQ('typed'); // a pending typed search the whole view must drop
      await Promise.resolve();
    });
    seen = [];
    await act(async () => {
      view.setQ('report', { now: true });
      void router.navigate({ to: '/', search: { state: 'stopped' } as never, replace: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.query.q).toBe('report');
    expect(view.query.filters.state).toBe('stopped');
    expect(seen.filter(([sq, st]) => sq === 'report' && st !== 'stopped')).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(view.query.q).toBe('report');
  });
});
