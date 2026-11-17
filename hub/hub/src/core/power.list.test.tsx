// power.list.test.tsx: the containers list read (computersList / computersPage) never reads an unreadable list as "no computers"
// and says whether the one page it read is the whole list (C9: an unknown list is never none).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bump, resetCore } from './ctx';
import { computerLifecycle, computerLifecycleRoute, computersList, computersPage, lifecycleVerdict } from './power';
import { queryClient } from './query';
import { containersRoute } from './computer';
import { heldChanges } from './changes';
import { reply, startFixtureMode, type FixtureRule } from './transport';

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `aaaaaaaaaaaaaaaaaaaa${String(i).padStart(4, '0')}`, status: 'running' }));
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
function mode(rules: readonly FixtureRule[]) {
  resetCore();
  startFixtureMode(rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  queryClient.clear();
}
beforeEach(() => { bump('test-boot'); });
const listOf = (body: unknown, counter?: { n: number }) => mode([reply(containersRoute, () => { if (counter) counter.n++; return { body }; })]);

describe('computersList: an unreadable list is an error, never an empty list', () => {
  for (const [name, body] of [
    ['no data', {}],
    ['data without containers', { data: {} }],
    ['containers that is not a list', { data: { computers: { a: 1 } } }],
    ['containers null', { data: { computers: null } }],
    ['a body that is a list', []],
  ] as const) {
    it(`${name}: the query is in its error state with BAD_LIST and has no data`, async () => {
      listOf(body);
      const q = renderHook(() => computersList.use(undefined), { wrapper: wrap });
      await waitFor(() => expect(q.result.current.isError).toBe(true));
      expect(q.result.current.data).toBeUndefined();
      expect(q.result.current.error).toMatchObject({ code: 'BAD_LIST' });
    });
  }

  it('a list that really is empty reads as no computers: data is [] and there is no error', async () => {
    listOf({ data: { computers: [] } });
    const q = renderHook(() => computersList.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toEqual([]));
    expect(q.result.current.isError).toBe(false);
  });
});

describe('computersPage: whether the page read is the whole list', () => {
  const page = async (body: unknown) => {
    listOf(body);
    const q = renderHook(() => computersPage.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toBeTruthy());
    return q.result.current.data!;
  };
  it('totalPages 1 is the whole list, totalPages 2 is not', async () => {
    expect((await page({ data: { computers: ids(100), pagination: { total: 100, page: 1, limit: 100, totalPages: 1 } } })).complete).toBe(true);
    expect((await page({ data: { computers: ids(100), pagination: { total: 101, page: 1, limit: 100, totalPages: 2 } } })).complete).toBe(false);
  });
  it('an empty list with totalPages 0 is the whole list', async () => {
    expect(await page({ data: { computers: [], pagination: { total: 0, page: 1, limit: 100, totalPages: 0 } } })).toEqual({ rows: [], complete: true });
  });
  it('without a usable pagination, fewer than 100 rows is the whole list and exactly 100 is not known to be', async () => {
    expect((await page({ data: { computers: ids(99) } })).complete).toBe(true);
    expect((await page({ data: { computers: ids(100) } })).complete).toBe(false);
    expect((await page({ data: { computers: ids(100), pagination: { totalPages: 'many' } } })).complete).toBe(false);
    expect((await page({ data: { computers: ids(3), pagination: { totalPages: null } } })).complete).toBe(true);
    expect((await page({ data: { computers: ids(100), pagination: null } })).complete).toBe(false);
    expect((await page({ data: { computers: ids(100), pagination: { totalPages: null } } })).complete).toBe(false);
  });
  it('computersList keeps all the rows of an incomplete page (completeness does not shrink the list)', async () => {
    listOf({ data: { computers: ids(100), pagination: { total: 250, page: 1, limit: 100, totalPages: 3 } } });
    const q = renderHook(() => computersList.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toHaveLength(100));
  });
  it('the rows are the same rows computersList gives', async () => {
    const body = { data: { computers: ids(3) } };
    expect((await page(body)).rows).toEqual(ids(3));
  });
  it('a malformed body is an error here too', async () => {
    listOf({ data: {} });
    const q = renderHook(() => computersPage.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.isError).toBe(true));
    expect(q.result.current.error).toMatchObject({ code: 'BAD_LIST' });
  });
  it('computersList and computersPage on one screen are one request', async () => {
    const calls = { n: 0 };
    listOf({ data: { computers: ids(2) } }, calls);
    const a = renderHook(() => computersList.use(undefined), { wrapper: wrap });
    const b = renderHook(() => computersPage.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(a.result.current.data).toHaveLength(2));
    await waitFor(() => expect(b.result.current.data?.rows).toHaveLength(2));
    expect(calls.n).toBe(1);
  });
});

describe('a refetch that is unreadable keeps the rows but sets the error', () => {
  it('after a good list a malformed refetch is isError with BAD_LIST on both reads; a later good one clears it', async () => {
    const calls = { n: 0 };
    const list = { body: { data: { computers: ids(2) } } as unknown };
    mode([reply(containersRoute, () => { calls.n++; return { body: list.body }; })]);
    // The hooks read isError at render, as a page does: the observer re-renders on a property it uses.
    const a = renderHook(() => { const q = computersList.use(undefined); void q.isError; void q.data; return q; }, { wrapper: wrap });
    const b = renderHook(() => { const q = computersPage.use(undefined); void q.isError; void q.data; return q; }, { wrapper: wrap });
    await waitFor(() => expect(a.result.current.data).toHaveLength(2));
    await waitFor(() => expect(b.result.current.data?.rows).toHaveLength(2));
    expect(calls.n).toBe(1);
    list.body = { data: {} };
    await act(async () => { await computersList.invalidate(); });
    await waitFor(() => expect(a.result.current.isError).toBe(true));
    await waitFor(() => expect(b.result.current.isError).toBe(true));
    expect(calls.n).toBe(2);
    expect(a.result.current.error).toMatchObject({ code: 'BAD_LIST' });
    expect(b.result.current.error).toMatchObject({ code: 'BAD_LIST' });
    list.body = { data: { computers: ids(3) } };
    await act(async () => { await computersList.invalidate(); });
    await waitFor(() => expect(a.result.current.data).toHaveLength(3));
    expect(a.result.current.isError).toBe(false);
    expect(calls.n).toBe(3);
  });
});

describe('a list that is not the whole list never proves a computer absent', () => {
  it('lifecycleVerdict: an id missing from 100 rows proves nothing, never not_applied', () => {
    for (const op of ['start', 'stop', 'pause', 'resume', 'force-stop', 'restart'] as const) {
      expect(lifecycleVerdict({ computer: 'aaaaaaaaaaaaaaaaaaaaffff', op }, ids(100))).toBeUndefined();
    }
  });
  it('a pending change stays held when its read-back is an incomplete page without it, and when the read-back is unreadable', async () => {
    const C1 = 'aaaaaaaaaaaaaaaaaaaa0000';
    const answer = { body: { data: { computers: ids(100).slice(1), pagination: { total: 101, page: 1, limit: 100, totalPages: 2 } } } as unknown, status: 200 };
    let post = 0;
    mode([
      reply(containersRoute, () => ({ body: answer.body, status: answer.status })),
      reply(computerLifecycleRoute, () => { post++; return { status: 502, body: {} }; }),
    ]);
    renderHook(() => computersList.use(undefined), { wrapper: wrap });
    expect((await computerLifecycle.run({ id: C1, op: 'stop' })).outcome).toBe('pending');
    await act(async () => { expect(await computerLifecycle.readBack()).toBe(false); });
    expect(heldChanges('computer.lifecycle').map((c) => c.identity)).toEqual([{ computer: C1, op: 'stop' }]);
    answer.body = { data: {} };
    await act(async () => { expect(await computerLifecycle.readBack()).toBe(false); });
    expect(heldChanges('computer.lifecycle').map((c) => c.identity)).toEqual([{ computer: C1, op: 'stop' }]);
    expect(post).toBe(1);
  });
  it('a malformed fresh answer cannot reuse an earlier good row as proof: the change stays held until a readable list shows the target state', async () => {
    const C1 = 'aaaaaaaaaaaaaaaaaaaa0000';
    const list = { body: { data: { computers: [{ id: C1, status: 'stopped' }] } } as unknown };
    mode([
      reply(containersRoute, () => ({ body: list.body, status: 200 })),
      reply(computerLifecycleRoute, () => ({ status: 502, body: {} })),
    ]);
    const q = renderHook(() => { const r = computersList.use(undefined); void r.data; return r; }, { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toHaveLength(1));
    expect((await computerLifecycle.run({ id: C1, op: 'start' })).outcome).toBe('pending');
    // The cache now holds a row that WOULD prove the Start (running), read by the page's own refetch, not by a read-back.
    list.body = { data: { computers: [{ id: C1, status: 'running' }] } };
    await act(async () => { await computersList.invalidate(); });
    await waitFor(() => expect(q.result.current.data?.[0]?.status).toBe('running'));
    expect(heldChanges('computer.lifecycle')).toHaveLength(1);
    list.body = { data: {} };
    await act(async () => { expect(await computerLifecycle.readBack()).toBe(false); });
    expect(heldChanges('computer.lifecycle')).toHaveLength(1);
    list.body = { data: { computers: [{ id: C1, status: 'running' }] } };
    await act(async () => { expect(await computerLifecycle.readBack()).toBe(true); });
    expect(heldChanges('computer.lifecycle')).toEqual([]);
  });
});
