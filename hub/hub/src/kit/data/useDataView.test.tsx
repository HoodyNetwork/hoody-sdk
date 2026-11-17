// useDataView contract tests: URL keys, chips,
// sort, paging, no-match, server mode, reload. Hook-level: a probe component exposes the view.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DataView, type DataViewOptions, useDataView } from './DataTableView';

interface Box {
  id: string;
  name: string;
  state: string;
  ram: number;
  tags: string[];
}

const ROWS: Box[] = [
  { id: 'a', name: 'atlas', state: 'running', ram: 8, tags: ['web', 'db'] },
  { id: 'b', name: 'borealis', state: 'running', ram: 4, tags: ['web'] },
  { id: 'c', name: 'cedar', state: 'stopped', ram: 4, tags: [] },
  { id: 'd', name: 'dune', state: 'creating', ram: 2, tags: ['db'] },
  { id: 'e', name: 'ember 12', state: 'failed', ram: 16, tags: ['ml'] },
];
const col = createColumnHelper<Box>();
const COLUMNS = [col.accessor('name', { header: 'Name' }), col.accessor('state', { header: 'State' }), col.accessor('ram', { header: 'RAM' })];
const FILTERS: DataViewOptions<Box>['filters'] = [
  { id: 'state', label: 'State', value: (r) => r.state },
  { id: 'tag', label: 'Tag', kind: 'multi', value: (r) => r.tags },
  { id: 'ram', label: 'RAM', kind: 'range', value: (r) => r.ram },
];

type Opts = Partial<DataViewOptions<Box>>;
let view: DataView<Box>;
/** Server-mode tests swap the answer (undefined = a new request is loading). */
let setAnswer: (rows: readonly Box[] | undefined) => void = () => undefined;

function Probe({ opts }: { opts: Opts }) {
  const [answer, setA] = useState<readonly Box[] | undefined>(ROWS);
  setAnswer = setA;
  view = useDataView<Box>({ rows: answer, columns: COLUMNS, getRowId: (r) => r.id, search: ['name'], filters: FILTERS, sort: 'name', ...opts });
  return null;
}

async function mount(path: string, opts: Opts = {}) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Probe opts={opts} /> }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

/** The URL search as written by the view (string values). */
const url = (router: Awaited<ReturnType<typeof mount>>) => router.state.location.search as Record<string, unknown>;
const ids = () => view.rows.map((r) => r.id);
const step = async (fn: () => void) => {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDataView: URL keys', () => {
  it('writes filters, sort and page to their keys and drops empty ones; the search stays out of the URL', async () => {
    const router = await mount('/', { pageSize: 2 });
    await step(() => view.setQ('a'));
    expect(view.query.q).toBe('a');
    expect(url(router).q).toBeUndefined();
    await step(() => view.setFilter('state', { kind: 'single', value: 'running' } as never));
    expect(url(router).state).toBe('running');
    await step(() => view.setSort({ id: 'ram', desc: true }));
    expect(url(router).sort).toBe('-ram');
    await step(() => view.setQ(''));
    expect(view.query.q).toBe('');
    expect(url(router).q).toBeUndefined();
  });

  it('prefixes every key with `param` so two views share one URL', async () => {
    const router = await mount('/', { param: 'x' });
    await step(() => view.setQ('dune'));
    await step(() => view.chips.find((c) => c.id === 'state')?.onChange('creating'));
    expect(url(router).xq).toBeUndefined();
    expect(view.query.q).toBe('dune');
    expect(url(router).xstate).toBe('creating');
    expect(url(router).q).toBeUndefined();
  });

  it('a filter change resets the page', async () => {
    const router = await mount('/?page=2', { pageSize: 2 });
    expect(view.page).toBe(2);
    await step(() => view.chips.find((c) => c.id === 'state')?.onChange('running'));
    expect(url(router).page).toBeUndefined();
    expect(view.page).toBe(1);
  });
});

describe('useDataView: chips', () => {
  it('single: one value, options counted from the rows', async () => {
    await mount('/?state=running');
    expect(ids()).toEqual(['a', 'b']);
    const chip = view.chips.find((c) => c.id === 'state');
    expect(chip?.value).toBe('running');
    expect(chip?.options.find((o) => o.value === 'running')?.count).toBe(2);
  });

  it('multi: any of several values, from array-valued rows', async () => {
    await mount('/?tag=db,ml');
    expect(ids()).toEqual(['a', 'd', 'e']);
    expect(view.chips.find((c) => c.id === 'tag')?.kind).toBe('multi');
  });

  it('range: min..max inclusive, open ends allowed', async () => {
    await mount('/?ram=4..8');
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('× on a chip (onChange(undefined)) clears only that filter', async () => {
    const router = await mount('/?state=running&ram=4..8');
    await step(() => view.chips.find((c) => c.id === 'state')?.onChange(undefined));
    expect(url(router).state).toBeUndefined();
    expect(url(router).ram).toBe('4..8');
  });

  it('a malformed filter value reads as no filter', async () => {
    await mount('/?ram=lots');
    expect(ids()).toHaveLength(5);
    expect(view.isFiltered).toBe(false);
  });
});

describe('useDataView: sort', () => {
  it('uses the default sort, and the URL sort over it (descending with -)', async () => {
    await mount('/');
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    cleanup();
    await mount('/?sort=-ram');
    expect(ids()[0]).toBe('e');
    expect(view.sort).toEqual({ id: 'ram', desc: true });
  });

  it('ignores a sort on an unknown column', async () => {
    await mount('/?sort=price');
    expect(view.sort).toBeUndefined();
  });

  it('turning sort off with a default writes "none" so the default stays off', async () => {
    const router = await mount('/');
    await step(() => view.setSort(undefined));
    expect(url(router).sort).toBe('none');
    expect(view.sort).toBeUndefined();
    expect(view.query.sort).toBeUndefined();
  });

  it('choosing the default sort removes the key', async () => {
    const router = await mount('/?sort=-ram');
    await step(() => view.setSort({ id: 'name', desc: false }));
    expect(url(router).sort).toBeUndefined();
  });
});

describe('useDataView: paging', () => {
  it('slices pages and clamps a page past the end', async () => {
    await mount('/?page=9', { pageSize: 2 });
    expect(view.pages).toBe(3);
    expect(view.page).toBe(3);
    expect(ids()).toEqual(['e']);
  });

  it('a page change is a history step (Back returns to the previous page)', async () => {
    const router = await mount('/', { pageSize: 2 });
    await step(() => view.setPage(2));
    expect(ids()).toEqual(['c', 'd']);
    await act(async () => {
      router.history.back();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(view.page).toBe(1);
  });

  it('"Show more" grows the list by a page and stops at the end', async () => {
    await mount('/', { pageSize: 2, more: true });
    expect(ids()).toHaveLength(2);
    expect(view.canShowMore).toBe(true);
    await step(() => view.showMore());
    await step(() => view.showMore());
    expect(ids()).toHaveLength(5);
    expect(view.canShowMore).toBe(false);
  });
});

describe('useDataView: no match', () => {
  it('reports filtered with no rows, and Clear filters empties search and every filter', async () => {
    const router = await mount('/?q=zzz&state=running&tag=web&ram=1..2&sort=-ram');
    expect(view.matched).toBe(0);
    expect(view.isFiltered).toBe(true);
    await step(() => view.clearAll());
    const s = url(router);
    expect([s.q, s.state, s.tag, s.ram]).toEqual([undefined, undefined, undefined, undefined]);
    expect(s.sort).toBe('-ram');
    expect(view.q).toBe('');
    expect(view.matched).toBe(5);
  });

  // The router parses ?q=12 as the number 12; the view reads every search value as a string, so it
  // still searches.
  it('a numeric-looking search in the URL still works (q=12)', async () => {
    await mount('/?q=12');
    expect(ids()).toEqual(['e']);
    expect(view.isFiltered).toBe(true);
  });
});

describe('useDataView: server mode', () => {
  it('debounces the search before the query changes; the URL never holds it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const router = await mount('/', { server: { total: 40, debounce: 300 } });
    await step(() => view.setQ('at'));
    expect(view.q).toBe('at');
    expect(url(router).q).toBeUndefined();
    await step(() => view.setQ('atl'));
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(view.query.q).toBe('');
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(view.query.q).toBe('atl');
    expect(url(router).q).toBeUndefined();
  });

  it('never filters or sorts the rows itself, and takes total and hasMore from the server', async () => {
    await mount('/?state=stopped&sort=-ram', { server: { total: 40, hasMore: true } });
    expect(view.rows).toHaveLength(5);
    expect(view.matched).toBe(40);
    expect(view.canShowMore).toBe(true);
    expect(view.query.filters).toEqual({ state: 'stopped' });
    expect(view.query.sort).toBe('-ram');
  });

  it('keeps the last rows on screen while the next answer loads (refresh, not skeletons)', async () => {
    await mount('/', { server: { total: 5 } });
    await step(() => setAnswer(undefined));
    expect(view.rows).toHaveLength(5);
    expect(view.isLoading).toBe(true);
    expect(view.isRefreshing).toBe(true);
    await step(() => setAnswer(ROWS.slice(0, 2)));
    expect(view.rows).toHaveLength(2);
    expect(view.isRefreshing).toBe(false);
  });
});

describe('useDataView: reload and history', () => {
  it('a reload with the same URL restores the same rows', async () => {
    const path = '/?q=a&tag=web&sort=-ram';
    await mount(path);
    const before = ids();
    cleanup();
    await mount(path);
    expect(ids()).toEqual(before);
    expect(view.q).toBe('a');
  });

  it('a link to ?q= opens that search and leaves the address without it', async () => {
    const router = await mount('/');
    await act(async () => {
      void router.navigate({ to: '/', search: { q: 'dune' } as never });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(view.q).toBe('dune');
    expect(url(router).q).toBeUndefined();
  });
});
