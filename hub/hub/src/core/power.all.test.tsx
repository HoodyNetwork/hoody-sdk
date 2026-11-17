// power.all.test.tsx: useComputersAll reads the containers list page by page (100 rows), bounded by ALL_PAGES_MAX. It says the list
// is complete only when it fit one page (one read). A list read in several pages is never complete (offset pages read at different
// moments can skip a computer while totals and counts match): it is unproven. A computer missing while pages load, after a failed
// or unreadable page, past the cap, or from a list read in several pages is unknown, never gone (C9).
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bump, resetCore, setRealm, snapshot } from './ctx';
import { ALL_PAGES_MAX, computersList, computersPage, lifecycleProves, useComputersAll } from './power';
import { queryClient, type CoreReadFresh } from './query';
import { containersRoute } from './computer';
import { reply, startFixtureMode, type FixtureAnswer, type FixtureRequest, type FixtureRule } from './transport';

const id = (i: number) => `aaaaaaaaaaaaaaaaaaaa${String(i).padStart(4, '0')}`;
const rowsOf = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: id(from + i), status: 'running' }));
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
function mode(rules: readonly FixtureRule[]) {
  resetCore();
  startFixtureMode(rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  queryClient.clear();
}
beforeEach(() => { bump('test-boot'); });

/** A list of `total` computers served 100 a page with pagination; `answer` may replace a page's answer. */
function listOf(total: number, o: { answer?: (page: number, req: FixtureRequest) => FixtureAnswer | undefined; pages?: number[] } = {}) {
  const asked = o.pages ?? [];
  mode([reply(containersRoute, (req) => {
    const page = Number(req.query.page ?? 1);
    asked.push(page);
    const own = o.answer?.(page, req);
    if (own) return own;
    const from = (page - 1) * 100;
    return { body: { data: { computers: rowsOf(from, Math.max(0, Math.min(100, total - from))), pagination: { total, page, limit: 100, totalPages: Math.ceil(total / 100) } } } };
  })]);
  return asked;
}
const all = () => renderHook(() => useComputersAll(), { wrapper: wrap });

describe('useComputersAll: every page; complete only for one page', () => {
  it('150 computers: reads page 2 after page 1, every computer once; all pages in is unproven, never complete', async () => {
    const asked = listOf(150);
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(q.result.current.rows?.length).toBe(150);
    expect(new Set(q.result.current.rows?.map((r) => r.id)).size).toBe(150);
    expect(asked).toEqual([1, 2]);
    expect(q.result.current).toMatchObject({ complete: false, more: false, capped: false, failed: false });
  });

  it('one page that is the whole list: complete (one read proves absence), not unproven, no page 2 request', async () => {
    const asked = listOf(40);
    const q = all();
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    expect(q.result.current.rows?.length).toBe(40);
    expect(q.result.current.unproven).toBe(false);
    expect(asked).toEqual([1]);
  });

  it('while page 2 is out: page 1 rows show, more is true and the list is not complete', async () => {
    listOf(150, { answer: (page) => (page === 2 ? { body: { data: { computers: rowsOf(100, 50), pagination: { total: 150, page: 2, limit: 100, totalPages: 2 } } }, delayMs: 300 } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.rows?.length).toBe(100));
    expect(q.result.current).toMatchObject({ more: true, complete: false, unproven: false });
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(q.result.current).toMatchObject({ more: false, complete: false });
  });

  it('no pagination: a full page is followed by the next; a short page ends the list', async () => {
    const asked = listOf(0, { answer: (page) => ({ body: { data: { computers: page === 1 ? rowsOf(0, 100) : rowsOf(100, 3) } } }) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(q.result.current.rows?.length).toBe(103);
    expect(asked).toEqual([1, 2]);
  });

  it('retry on a whole list re-reads its pages only, never a page past the end', async () => {
    const asked = listOf(150);
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    asked.length = 0;
    act(() => q.result.current.retry());
    await waitFor(() => expect(asked.length).toBe(2));
    await new Promise((r) => setTimeout(r, 100));
    expect(asked.sort()).toEqual([1, 2]);
  });

  it('page 1 is computersPage\'s own request: mounted together they send one page-1 read', async () => {
    const asked = listOf(150);
    renderHook(() => computersPage.use(undefined), { wrapper: wrap });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(asked.filter((p) => p === 1)).toHaveLength(1);
  });
});

describe('useComputersAll: an unknown list is never complete', () => {
  it('page 2 fails: page 1 rows kept, failed, not complete, not more; retry reads it again', async () => {
    let fail = true;
    listOf(150, { answer: (page) => (page === 2 && fail ? { status: 500, body: { error: 'INTERNAL' } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current).toMatchObject({ complete: false, more: false });
    expect(q.result.current.rows?.length).toBe(100);
    fail = false;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(q.result.current).toMatchObject({ failed: false, complete: false });
    expect(q.result.current.rows?.length).toBe(150);
  });

  it('a read list whose refresh of page 2 fails: rows kept, failed, no longer unproven (it reads as failed)', async () => {
    let fail = false;
    listOf(150, { answer: (page) => (page === 2 && fail ? { status: 500, body: { error: 'INTERNAL' } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    fail = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
    expect(q.result.current.rows?.length).toBe(150);
  });

  it('a one-page list whose refresh fails: rows kept, failed, no longer complete (an old read proves no absence)', async () => {
    let fail = false;
    listOf(40, { answer: () => (fail ? { status: 500, body: { error: 'INTERNAL' } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    fail = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.complete).toBe(false);
    expect(q.result.current.rows?.length).toBe(40);
  });

  it('an unreadable page 2 (no containers list) stops there: failed, page 1 rows kept, not complete', async () => {
    listOf(150, { answer: (page) => (page === 2 ? { body: { data: {} } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current).toMatchObject({ complete: false, more: false });
    expect(q.result.current.rows?.length).toBe(100);
  });

  it('an unreadable page 1: rows are null (never an empty list), failed', async () => {
    listOf(0, { answer: () => ({ body: {} }) });
    const q = all();
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows).toBeNull();
    expect(q.result.current.complete).toBe(false);
  });

  it(`more than ${ALL_PAGES_MAX} pages: reads exactly ${ALL_PAGES_MAX}, capped, never complete`, async () => {
    const asked = listOf(1150);
    const q = all();
    await waitFor(() => expect(q.result.current.capped).toBe(true));
    expect(asked).toEqual(Array.from({ length: ALL_PAGES_MAX }, (_, i) => i + 1));
    expect(q.result.current).toMatchObject({ complete: false, more: false, failed: false });
    expect(q.result.current.rows?.length).toBe(ALL_PAGES_MAX * 100);
  });

  it('offset skip: one computer deleted from page 1 and one created at the front between reads; totals and counts match, still never complete', async () => {
    // Page 1 was read with computers 0..99 of 150. Then #5 is deleted and NEW is created first: the list is NEW, 0..4, 6..149.
    // One in, one out before offset 100, so page 2 is still 100..149: 150 distinct rows, total 150, and NEW was never read.
    listOf(150, { answer: (page) => (page === 2 ? { body: { data: { computers: rowsOf(100, 50), pagination: { total: 150, page: 2, limit: 100, totalPages: 2 } } } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(new Set(q.result.current.rows?.map((r) => r.id)).size).toBe(150);
    expect(q.result.current.complete).toBe(false);
  });

  it('pages that disagree on the total are not re-read by themselves: one request per page, never complete', async () => {
    const asked = listOf(150, { answer: (page) => (page === 2 ? { body: { data: { computers: rowsOf(100, 49), pagination: { total: 149, page: 2, limit: 100, totalPages: 2 } } } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    await new Promise((r) => setTimeout(r, 300));
    expect(asked).toEqual([1, 2]);
    expect(q.result.current.complete).toBe(false);
  });

  it('pages whose totals keep changing on every read: a retry reads each page once more, and the list is never complete on any render', async () => {
    let reads = 0;
    const seen: boolean[] = [];
    const asked = listOf(150, { answer: (page) => { const t = ++reads % 2 ? 150 : 149; return { body: { data: { computers: page === 1 ? rowsOf(0, 100) : rowsOf(100, t - 100), pagination: { total: t, page, limit: 100, totalPages: 2 } } } }; } });
    const q = renderHook(() => { const v = useComputersAll(); seen.push(v.complete); return v; }, { wrapper: wrap });
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    act(() => q.result.current.retry());
    await waitFor(() => expect(asked.length).toBe(4));
    await new Promise((r) => setTimeout(r, 300));
    expect(asked.length).toBe(4);
    expect(seen.every((c) => c === false)).toBe(true);
  });

  it('a row shifted onto the next page (read twice): each computer once, and the list is not complete', async () => {
    listOf(150, { answer: (page) => (page === 2 ? { body: { data: { computers: [{ id: id(99), status: 'running' }, ...rowsOf(101, 49)], pagination: { total: 150, page: 2, limit: 100, totalPages: 2 } } } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(q.result.current.complete).toBe(false);
    expect(new Set(q.result.current.rows?.map((r) => r.id)).size).toBe(149);
    expect(q.result.current.rows?.length).toBe(149);
  });
});

describe('useComputersAll: unreadable rows and refreshes', () => {
  it('a null row on page 1: no throw, rows null, failed, not complete', async () => {
    listOf(0, { answer: () => ({ body: { data: { computers: [null, ...rowsOf(0, 3)], pagination: { total: 4, page: 1, limit: 100, totalPages: 1 } } } }) });
    const q = all();
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current).toMatchObject({ rows: null, complete: false, unproven: false });
  });

  it('a row without a string id on page 2: no throw, page 1 rows kept, failed, walk stops, not complete', async () => {
    const asked = listOf(250, { answer: (page) => (page === 2 ? { body: { data: { computers: [{ id: 7 }, ...rowsOf(101, 99)], pagination: { total: 250, page: 2, limit: 100, totalPages: 3 } } } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current).toMatchObject({ complete: false, unproven: false, more: false });
    expect(q.result.current.rows?.length).toBe(100);
    await new Promise((r) => setTimeout(r, 100));
    expect(asked).toEqual([1, 2]);
  });

  it('a refresh of page 2 that comes back unreadable keeps its earlier rows (150, not 100), failed', async () => {
    let bad = false;
    listOf(150, { answer: (page) => (page === 2 && bad ? { body: { data: {} } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    bad = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows?.length).toBe(150);
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  for (const bad of [1, 2]) {
    it(`a three-page list whose page ${bad} refresh comes back unreadable keeps every row it showed (250), failed, asks for no later page`, async () => {
      let on = false;
      const asked = listOf(250, { answer: (page) => (on && page === bad ? { body: { data: {} } } : undefined) });
      const q = all();
      await waitFor(() => expect(q.result.current.unproven).toBe(true));
      const ids = q.result.current.rows!.map((r) => r.id);
      on = true;
      asked.length = 0;
      act(() => q.result.current.retry());
      await waitFor(() => expect(q.result.current.failed).toBe(true));
      await new Promise((r) => setTimeout(r, 100));
      expect(q.result.current.rows!.map((r) => r.id)).toEqual(ids);
      expect(q.result.current).toMatchObject({ complete: false, unproven: false, more: false });
      expect(asked.sort()).toEqual([1, 2, 3]);
    });
  }

  it('a valid shorter list after a longer one replaces it (kept rows are only for unreadable answers)', async () => {
    let total = 250;
    listOf(0, { answer: (page) => { const from = (page - 1) * 100; return { body: { data: { computers: rowsOf(from, Math.max(0, Math.min(100, total - from))), pagination: { total, page, limit: 100, totalPages: Math.ceil(total / 100) } } } }; } });
    const q = all();
    await waitFor(() => expect(q.result.current.rows?.length).toBe(250));
    total = 40;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    expect(q.result.current.rows?.length).toBe(40);
  });

  it('a refresh of a one-page list that comes back unreadable keeps its rows and is no longer complete', async () => {
    let bad = false;
    listOf(40, { answer: () => (bad ? { body: { data: { computers: [null] } } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    bad = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows?.length).toBe(40);
    expect(q.result.current.complete).toBe(false);
  });
});

describe('useComputersAll: realm view, disabled, retry', () => {
  const B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
  const bodyOf = (rows: unknown[]) => ({ data: { computers: rows, pagination: { total: rows.length, page: 1, limit: 100, totalPages: 1 } } });
  const bRows = [{ id: 'bbbbbbbbbbbbbbbbbbbb0001', status: 'running' }];

  for (const how of ['realm', 'generation'] as const) {
    it(`a ${how} switch, the old cache removed and the new page 1 seeded at the same moment: never the old rows or complete from them`, async () => {
      listOf(40);
      const seen: { ids: string[] | null; complete: boolean }[] = [];
      const q = renderHook(() => { const v = useComputersAll(); seen.push({ ids: v.rows ? v.rows.map((r) => r.id as string) : null, complete: v.complete }); return v; }, { wrapper: wrap });
      await waitFor(() => expect(q.result.current.complete).toBe(true));
      const at = queryClient.getQueryState(computersPage.key(undefined, snapshot()))!.dataUpdatedAt;
      const from = seen.length;
      act(() => {
        queryClient.removeQueries();
        if (how === 'realm') setRealm(B); else bump('test-boot');
        queryClient.setQueryData(computersPage.key(undefined, snapshot()), bodyOf(bRows), { updatedAt: at });
      });
      await waitFor(() => expect(q.result.current.rows?.map((r) => r.id)).toEqual(['bbbbbbbbbbbbbbbbbbbb0001']));
      for (const v of seen.slice(from)) expect(v.ids === null || v.ids.every((x) => x.startsWith('b'))).toBe(true);
    });
  }

  it('a realm switch whose page 2 comes back unreadable: the old realm\'s page 2 rows are never kept for it', async () => {
    let realmB = false;
    listOf(150, { answer: (page) => (realmB ? (page === 1
      ? { body: { data: { computers: Array.from({ length: 100 }, (_, i) => ({ id: `bbbbbbbbbbbbbbbbbbbb${String(i).padStart(4, '0')}`, status: 'running' })), pagination: { total: 150, page: 1, limit: 100, totalPages: 2 } } } }
      : { body: { data: {} } }) : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    realmB = true;
    act(() => { setRealm(B); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows?.length).toBe(100);
    expect(q.result.current.rows?.every((r) => (r.id as string).startsWith('b'))).toBe(true);
  });

  it('a switch to a realm whose pages are already cached (page 2 unreadable): not one render shows the old realm\'s rows', async () => {
    listOf(150);
    const seen: (string[] | null)[] = [];
    const q = renderHook(() => { const v = useComputersAll(); seen.push(v.rows ? v.rows.map((r) => r.id as string) : null); return v; }, { wrapper: wrap });
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    const from = seen.length;
    act(() => {
      setRealm(B);
      const k1 = computersPage.key(undefined, snapshot());
      const k2 = [...k1.slice(0, -3), { page: 2, limit: 100 }, ...k1.slice(-2)];
      queryClient.setQueryData(k1, { data: { computers: bRows, pagination: { total: 101, page: 1, limit: 100, totalPages: 2 } } });
      queryClient.setQueryData(k2, { data: {} });
    });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(seen.length).toBeGreaterThan(from);
    for (const ids of seen.slice(from)) expect(ids === null || ids.every((x) => x.startsWith('b'))).toBe(true);
  });

  it('disabled: no request, and retry sends none', async () => {
    const asked = listOf(150);
    const q = renderHook(() => useComputersAll({ enabled: false }), { wrapper: wrap });
    act(() => q.result.current.retry());
    await new Promise((r) => setTimeout(r, 150));
    expect(asked).toEqual([]);
    expect(q.result.current).toMatchObject({ rows: null, complete: false, unproven: false });
  });

  it('retry keeps one identity across renders and pages', async () => {
    listOf(150);
    const q = all();
    const first = q.result.current.retry;
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    expect(q.result.current.retry).toBe(first);
  });
});

describe('useComputersAll: later pages never join computersList\'s read-back (a lifecycle change\'s proof)', () => {
  for (const mounted of [true, false]) {
    it(`pages 1 and 2 cached${mounted ? '' : ', Files gone'}, page 2 now fails: the read-back reads page 1 only, is fresh, and proves the change`, async () => {
      let fail = false;
      const asked = listOf(150, { answer: (page) => (page === 2 && fail ? { status: 500, body: { error: 'INTERNAL' } } : undefined) });
      const q = all();
      await waitFor(() => expect(q.result.current.unproven).toBe(true));
      if (!mounted) q.unmount();
      fail = true;
      asked.length = 0;
      const f = await (computersList as unknown as CoreReadFresh).fresh(null);
      expect(f.state).toBe('fresh');
      expect(asked).toEqual([1]);
      expect(f.answers).toHaveLength(1);
      // Computer 0 is on page 1 and running: a start of it is proved by the fresh page 1.
      expect(lifecycleProves({ computer: id(0), op: 'start' }, [f.answers.map((a) => a.data)])).toBe('applied');
      expect(await computersList.refreshState()).toBe('fresh');
      expect(await computersPage.refreshState()).toBe('fresh');
    });
  }
});

// The rows shown are the last walk that read every page to the list's end
// (or the cap) readably. A failed or unreadable walk keeps them all; only such a readable walk to a terminal page replaces them,
// shorter lists included. Kept rows never make the list complete or unproven (C9).
describe('useComputersAll: the last whole readable walk is kept until another one replaces it', () => {
  const pageBody = (rows: unknown[], total: number, page: number) => ({ body: { data: { computers: rows, pagination: { total, page, limit: 100, totalPages: Math.max(1, Math.ceil(total / 100)) } } } });
  const strictWrap = ({ children }: { children: ReactNode }) => <StrictMode><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></StrictMode>;

  it('page 1 unreadable while a refreshed page 2 now ends the list at 150: all 250 rows stay, failed, never complete or unproven', async () => {
    let on = false;
    listOf(250, { answer: (page) => (!on ? undefined : page === 1 ? { body: { data: {} } } : page === 2 ? pageBody(rowsOf(100, 50), 150, 2) : pageBody([], 150, 3)) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    const ids = q.result.current.rows!.map((r) => r.id);
    on = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(ids);
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  it('250, then page 1 alone reads a whole list of 40, then page 1 comes back unreadable: exactly those 40 stay, never the old pages 2-3', async () => {
    let total = 250, bad = false;
    listOf(0, { answer: (page) => {
      if (bad && page === 1) return { body: { data: {} } };
      const from = (page - 1) * 100;
      return pageBody(rowsOf(from, Math.max(0, Math.min(100, total - from))), total, page);
    } });
    const q = all();
    await waitFor(() => expect(q.result.current.rows?.length).toBe(250));
    total = 40;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    expect(q.result.current.rows?.length).toBe(40);
    bad = true;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 40).map((r) => r.id));
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  it('a readable walk that now ends at page 2 (150) replaces 250; a later unreadable page 1 keeps those 150, never the old page 3', async () => {
    let total = 250, bad = false;
    listOf(0, { answer: (page) => {
      if (bad && page === 1) return { body: { data: {} } };
      const from = (page - 1) * 100;
      return pageBody(rowsOf(from, Math.max(0, Math.min(100, total - from))), total, page);
    } });
    const q = all();
    await waitFor(() => expect(q.result.current.rows?.length).toBe(250));
    total = 150;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.rows?.length).toBe(150));
    expect(q.result.current).toMatchObject({ unproven: true, failed: false });
    bad = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 150).map((r) => r.id));
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  it(`a capped walk (${ALL_PAGES_MAX} pages read, the list goes on) is kept: page 1 unreadable later keeps those ${ALL_PAGES_MAX * 100} rows`, async () => {
    let bad = false;
    listOf(1150, { answer: (page) => (bad && page === 1 ? { body: { data: {} } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.capped).toBe(true));
    bad = true;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows?.length).toBe(ALL_PAGES_MAX * 100);
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  it('rows shown by a failed walk are kept too: 40, then 100 while page 2 fails, then page 1 unreadable keeps those 100', async () => {
    let total = 40, bad1 = false;
    listOf(0, { answer: (page) => {
      if (bad1 && page === 1) return { body: { data: {} } };
      if (page === 2) return { status: 500, body: { error: 'INTERNAL' } };
      const from = (page - 1) * 100;
      return pageBody(rowsOf(from, Math.max(0, Math.min(100, total - from))), total, page);
    } });
    const q = all();
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    total = 150;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows?.length).toBe(100);
    bad1 = true;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.error).toMatchObject({ code: 'BAD_LIST' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
    expect(q.result.current).toMatchObject({ complete: false, unproven: false, failed: true });
  });

  it(`a capped walk is not whole: 50 computers inserted ahead push 950-999 past page ${ALL_PAGES_MAX}, and they stay shown`, async () => {
    let shift = 0;
    const idAt = (k: number) => (k < shift ? `bbbbbbbbbbbbbbbbbbbb${String(k).padStart(4, '0')}` : id(k - shift));
    listOf(0, { answer: (page) => { const from = (page - 1) * 100; return pageBody(Array.from({ length: 100 }, (_, k) => ({ id: idAt(from + k), status: 'running' })), 1150 + shift, page); } });
    const q = all();
    await waitFor(() => expect(q.result.current.capped).toBe(true));
    shift = 50;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.rows?.[0]?.id).toBe(idAt(0)));
    await new Promise((r) => setTimeout(r, 100));
    const ids = new Set(q.result.current.rows!.map((r) => r.id));
    expect(ids.size).toBe(ALL_PAGES_MAX * 100 + 50);
    expect(ids.has(id(999))).toBe(true);
    expect(q.result.current).toMatchObject({ capped: true, failed: false, complete: false, unproven: false });
  });

  it('a walk that reaches the end with a failed page is not whole: page 3 now ends at 200 while page 2 fails, all 250 stay', async () => {
    let on = false;
    listOf(250, { answer: (page) => (!on ? undefined : page === 2 ? { status: 500, body: { error: 'INTERNAL' } } : page === 3 ? pageBody([], 200, 3) : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    const ids = q.result.current.rows!.map((r) => r.id);
    on = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 300));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(ids);
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  it('a kept row is never updated from a page answered before it was shown: an old page 2 cache leaves the newer row as shown', async () => {
    let phase = 0;
    listOf(250, { answer: (page) => (phase === 1 && page === 1 ? pageBody([...rowsOf(0, 39), { id: id(150), status: 'stopped' }], 40, 1) : phase === 2 && page === 1 ? { body: { data: {} } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    phase = 1;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    expect(q.result.current.rows!.find((r) => r.id === id(150))?.status).toBe('stopped');
    phase = 2;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual([...rowsOf(0, 39), { id: id(150) }].map((r) => r.id));
    expect(q.result.current.rows!.find((r) => r.id === id(150))?.status).toBe('stopped');
  });

  const pageKey = (n: number) => { const k1 = computersPage.key(undefined, snapshot()); return [...k1.slice(0, -3), { page: n, limit: 100 }, ...k1.slice(-2)]; };
  const queryAt = (n: number) => queryClient.getQueryCache().find({ queryKey: pageKey(n), exact: true })!;
  /** The rows of pages 2-3 of the first 250 read (ids 100-249): gone once a whole walk ends the list sooner. */
  const old = new Set(rowsOf(100, 150).map((r) => r.id));

  it('after a whole shorter list, pages past it never bring old rows back: page 2 still failing (old data kept) adds none of them', async () => {
    let phase = 0;
    listOf(250, { answer: (page) => {
      if (phase >= 1 && page === 2) return { status: 500, body: { error: 'INTERNAL' } };
      if (phase === 2 && page === 1) return pageBody(rowsOf(0, 40), 40, 1);
      if (phase === 3 && page === 1) return pageBody(rowsOf(0, 100), 250, 1);
      return undefined;
    } });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    phase = 1;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows?.length).toBe(250);
    phase = 2;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    expect(q.result.current.rows?.length).toBe(40);
    phase = 3;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 200));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
    expect(q.result.current).toMatchObject({ complete: false, unproven: false });
  });

  for (const strict of [false, true]) {
    it(`after a whole shorter list, a page past it cached moments ago is read again before it counts: its old rows show on no render, also while it is out${strict ? ' (StrictMode)' : ''}`, async () => {
      let phase = 0;
      let release: () => void = () => {};
      const held = new Promise<void>((r) => { release = r; });
      const asked: number[] = [];
      mode([reply(containersRoute, async (req) => {
        const page = Number(req.query.page ?? 1);
        asked.push(page);
        if (phase === 1 && page === 1) return pageBody(rowsOf(0, 40), 40, 1);
        if (phase === 2 && page === 1) return pageBody(rowsOf(0, 100), 250, 1);
        if (phase === 2) { await held; return page === 2 ? pageBody(rowsOf(2000, 100), 250, 2) : pageBody(rowsOf(2100, 50), 250, 3); }
        const from = (page - 1) * 100;
        return pageBody(rowsOf(from, Math.max(0, Math.min(100, 250 - from))), 250, page);
      })]);
      const seen: string[][] = [];
      const useRecorded = () => { const v = useComputersAll(); seen.push(v.rows ? v.rows.map((r) => r.id as string) : []); return v; };
      const q = renderHook(useRecorded, { wrapper: strict ? strictWrap : wrap });
      await waitFor(() => expect(q.result.current.unproven).toBe(true));
      phase = 1;
      await act(async () => { await computersPage.refresh(); });
      await waitFor(() => expect(q.result.current.complete).toBe(true));
      const from = seen.length;
      phase = 2;
      asked.length = 0;
      await act(async () => { await computersPage.refresh(); });
      // Pages 2-3 are out (their old cached rows are 100-249): the view shows page 1's 100 and waits.
      await waitFor(() => expect(asked).toEqual(expect.arrayContaining([2, 3])));
      await new Promise((r) => setTimeout(r, 150));
      expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
      expect(q.result.current).toMatchObject({ more: true, complete: false, unproven: false });
      release();
      await waitFor(() => expect(q.result.current.unproven).toBe(true));
      expect(q.result.current.rows!.map((r) => r.id)).toEqual([...rowsOf(0, 100), ...rowsOf(2000, 150)].map((r) => r.id));
      for (const ids of seen.slice(from)) expect(ids.filter((x) => old.has(x))).toEqual([]);
      expect([...new Set(asked)].sort()).toEqual([1, 2, 3]);
      q.unmount();
    });
  }

  it('a page answered again with the same body (its answer count moves, nothing else does) still updates a kept row', async () => {
    let phase = 0;
    listOf(250, { answer: (page) => (phase === 1 && page === 1 ? pageBody([...rowsOf(0, 39), { id: id(150), status: 'stopped' }], 40, 1) : phase === 2 && page === 1 ? { body: { data: {} } } : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    const page2 = queryClient.getQueryData(pageKey(2));
    const at2 = queryClient.getQueryState(pageKey(2))!.dataUpdatedAt;
    phase = 1;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    phase = 2;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    expect(q.result.current.rows!.find((r) => r.id === id(150))?.status).toBe('stopped');
    act(() => { queryClient.setQueryData(pageKey(2), structuredClone(page2), { updatedAt: at2 }); });
    await waitFor(() => expect(q.result.current.rows!.find((r) => r.id === id(150))?.status).toBe('running'));
  });

  it('a row from an unchanged page never hides a newer answer for it: page 3 answered since says stopped, and it stays so', async () => {
    let phase = 0;
    listOf(250, { answer: (page) => (phase === 1 ? (page === 2 ? { body: { data: {} } } : page === 3 ? pageBody([...rowsOf(200, 50), { id: id(0), status: 'stopped' }], 250, 3) : undefined) : undefined) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    phase = 1;
    await act(async () => { await queryAt(2).fetch(); await queryAt(3).fetch(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await waitFor(() => expect(q.result.current.rows!.find((r) => r.id === id(0))?.status).toBe('stopped'));
    // Page 2 read again (still unreadable): the view is worked out again, page 3 is no longer new, page 1 still holds 'running'.
    await act(async () => { await queryAt(2).fetch(); });
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.find((r) => r.id === id(0))?.status).toBe('stopped');
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 250).map((r) => r.id));
  });

  it('a kept row is updated from a readable page that still lists it, and an unreadable walk adds no row from pages past it', async () => {
    let on = false;
    listOf(250, { answer: (page) => (!on ? undefined
      : page === 1 ? { body: { data: {} } }
      : page === 2 ? pageBody([{ id: id(100), status: 'stopped' }, ...rowsOf(101, 99)], 250, 2)
      : pageBody([...rowsOf(200, 50), { id: id(9999), status: 'running' }], 251, 3)) });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    const ids = q.result.current.rows!.map((r) => r.id);
    on = true;
    act(() => q.result.current.retry());
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 100));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(ids);
    expect(q.result.current.rows!.find((r) => r.id === id(100))?.status).toBe('stopped');
  });

  // The fence lives as long as the cached pages it excludes, per realm view, so neither a
  // remount nor a whole walk in another realm view lets the old pages past it count again.
  const B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
  /** 250 read in three pages; then page 1 alone reads a whole 40; then page 1 says 100 of 250 while pages 2-3 fail (old data kept). */
  async function fencedThenPartial(seen: string[][]) {
    let phase = 0;
    const flags = { realmB: false };
    listOf(250, { answer: (page) => {
      if (flags.realmB) return page === 1 ? pageBody(rowsOf(5000, 40).map((r) => ({ ...r, id: `b${r.id.slice(1)}` })), 40, 1) : undefined;
      if (phase === 1 && page === 1) return pageBody(rowsOf(0, 40), 40, 1);
      if (phase === 2) return page === 1 ? pageBody(rowsOf(0, 100), 250, 1) : { status: 500, body: { error: 'INTERNAL' } };
      return undefined;
    } });
    const useRecorded = () => { const v = useComputersAll(); seen.push(v.rows ? v.rows.map((r) => r.id as string) : []); return v; };
    const q = renderHook(useRecorded, { wrapper: wrap });
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    phase = 1;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    const from = seen.length;
    phase = 2;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 150));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
    return { q, useRecorded, from, flags };
  }

  it('a remount in the same realm view keeps the fence: pages 2-3 still failing (old data kept) bring back none of their rows', async () => {
    const seen: string[][] = [];
    const { q, useRecorded, from } = await fencedThenPartial(seen);
    q.unmount();
    // Another entry leaves the cache meanwhile: the fence stays while its own pages are cached.
    act(() => { queryClient.setQueryData(['unrelated'], 1); queryClient.removeQueries({ queryKey: ['unrelated'], exact: true }); });
    const again = renderHook(useRecorded, { wrapper: wrap });
    await waitFor(() => expect(again.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 200));
    expect(again.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
    for (const ids of seen.slice(from)) expect(ids.filter((x) => old.has(x))).toEqual([]);
    again.unmount();
  });

  it('a whole walk in another realm view leaves this one\'s fence: back on cached A, its failing pages 2-3 bring back none of their rows', async () => {
    const seen: string[][] = [];
    const { q, from, flags } = await fencedThenPartial(seen);
    flags.realmB = true;
    act(() => { setRealm(B); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    expect(q.result.current.rows!.every((r) => (r.id as string).startsWith('b'))).toBe(true);
    flags.realmB = false;
    act(() => { setRealm('aaaaaaaaaaaaaaaaaaaaaaa1'); });
    await waitFor(() => expect(q.result.current.rows?.[0]?.id).toBe(id(0)));
    await waitFor(() => expect(q.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 200));
    expect(q.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
    for (const ids of seen.slice(from)) expect(ids.filter((x) => old.has(x))).toEqual([]);
  });

  it('a fenced page whose entry comes back seeded with old data and no answer yet (hydrated, count 0) is still not answered: its rows never show, while no view was mounted at the seeding', async () => {
    let phase = 0;
    listOf(250, { answer: (page) => {
      if (phase === 1 && page === 1) return pageBody(rowsOf(0, 40), 40, 1);
      if (phase === 2) return page === 1 ? pageBody(rowsOf(0, 100), 250, 1) : { status: 500, body: { error: 'INTERNAL' } };
      return undefined;
    } });
    const seen: string[][] = [];
    const useRecorded = () => { const v = useComputersAll(); seen.push(v.rows ? v.rows.map((r) => r.id as string) : []); return v; };
    const q = renderHook(useRecorded, { wrapper: wrap });
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    const page2 = queryClient.getQueryData(pageKey(2));
    phase = 1;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    q.unmount();
    // Page 2's entry is replaced by a seeded one holding the old page (as hydration or initialData would): data, no answer.
    const seed = new QueryClient();
    seed.setQueryData(pageKey(2), page2, { updatedAt: 1 });
    const state = dehydrate(seed);
    state.queries[0]!.state.dataUpdateCount = 0;
    act(() => { queryClient.removeQueries({ queryKey: pageKey(2), exact: true }); hydrate(queryClient, state); });
    expect(queryClient.getQueryState(pageKey(2))).toMatchObject({ dataUpdateCount: 0, status: 'success' });
    phase = 2;
    await act(async () => { await computersPage.refresh(); });
    const from = seen.length;
    const again = renderHook(useRecorded, { wrapper: wrap });
    await waitFor(() => expect(again.result.current.failed).toBe(true));
    await new Promise((r) => setTimeout(r, 150));
    expect(again.result.current.rows!.map((r) => r.id)).toEqual(rowsOf(0, 100).map((r) => r.id));
    for (const ids of seen.slice(from)) expect(ids.filter((x) => old.has(x))).toEqual([]);
    again.unmount();
    seed.clear();
  });

  it('a fenced page whose cache entry was replaced while no view was mounted counts once the new entry answers: its new rows show', async () => {
    let phase = 0;
    listOf(250, { answer: (page) => {
      if (phase === 1 && page === 1) return pageBody(rowsOf(0, 40), 40, 1);
      if (phase === 2) return page === 1 ? pageBody(rowsOf(0, 100), 250, 1) : page === 2 ? pageBody(rowsOf(3000, 100), 250, 2) : pageBody(rowsOf(3100, 50), 250, 3);
      return undefined;
    } });
    const q = all();
    await waitFor(() => expect(q.result.current.unproven).toBe(true));
    // Page 2 answered three times: the new entry's count (1) stays below the fenced one, so only the entry check lets it count.
    await act(async () => { await queryAt(2).fetch(); await queryAt(2).fetch(); });
    expect(queryClient.getQueryState(pageKey(2))!.dataUpdateCount).toBe(3);
    phase = 1;
    await act(async () => { await computersPage.refresh(); });
    await waitFor(() => expect(q.result.current.complete).toBe(true));
    q.unmount();
    act(() => { queryClient.removeQueries({ queryKey: pageKey(2), exact: true }); queryClient.removeQueries({ queryKey: pageKey(3), exact: true }); });
    phase = 2;
    await act(async () => { await computersPage.refresh(); });
    const again = all();
    await waitFor(() => expect(again.result.current.unproven).toBe(true));
    expect(again.result.current.rows!.map((r) => r.id)).toEqual([...rowsOf(0, 100), ...rowsOf(3000, 150)].map((r) => r.id));
    expect(queryClient.getQueryState(pageKey(2))!.dataUpdateCount).toBe(1);
    again.unmount();
  });
});
