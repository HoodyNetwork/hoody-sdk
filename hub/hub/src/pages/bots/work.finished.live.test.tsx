// Vitest on a live page: the finished tasks of the Work tab, through core's real queries over a recorded fetch. The agent lists the closed
// tasks oldest first, so the newest are on the last page: the count is one cheap read, the newest pages are read first, More reads the
// next older page, a task on two pages is listed once, and another Bot starts again.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FINISHED_PAGE, registerTargets, useFinishedDelegates } from './data';

const KEY = 'c1~global~chief';
const OTHER = 'c1~global~scout';
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};

/** `total` closed tasks "t1".."t<total>", oldest first, served by page like the agent. */
function serve(total: number) {
  onFetch((c) => {
    const u = new URL(c.url);
    if (!/\/bots\/[^/]+\/delegates$/.test(u.pathname)) return { status: 200, body: { data: {} } };
    const page = Number(u.searchParams.get('page') ?? '1');
    const limit = Number(u.searchParams.get('limit') ?? '50');
    const all = Array.from({ length: total }, (_, i) => `t${i + 1}`);
    const slice = all.slice((page - 1) * limit, page * limit);
    return { status: 200, body: { items: slice.map((id) => ({ session_id: id, title: id, state: 'closed' })), meta: { total: all.length, page, limit } } };
  });
}
const reads = () => calls.filter((c) => /\/delegates\?/.test(c.url)).map((c) => new URL(c.url).search.replace('&realm=global', ''));

beforeEach(() => {
  boot();
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});

describe('the finished tasks over the agent\'s pages', () => {
  it('the count is one one-row read, and nothing else is read until the list is opened', async () => {
    serve(25);
    const { result } = renderHook(() => useFinishedDelegates(KEY, false), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(result.current.count).toBe(25);
    expect(result.current.rows).toEqual([]);
    expect(reads()).toEqual(['?state=closed&page=1&limit=1']);
  });

  it('opening reads the newest pages first and lists the newest task first', async () => {
    serve(25);
    const { result } = renderHook(() => useFinishedDelegates(KEY, true), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(reads()).toContain(`?state=closed&page=3&limit=${FINISHED_PAGE}`);
    expect(reads()).toContain(`?state=closed&page=2&limit=${FINISHED_PAGE}`);
    expect(reads()).not.toContain(`?state=closed&page=1&limit=${FINISHED_PAGE}`);
    expect(result.current.rows.map((d) => d.sessionId)).toEqual(['t25', 't24', 't23', 't22', 't21', 't20', 't19', 't18', 't17', 't16', 't15', 't14', 't13', 't12', 't11']);
    expect(result.current.canMore).toBe(true);
  });

  it('More reaches the oldest task, past the first hundred, and then there is no more', async () => {
    serve(105);
    const { result } = renderHook(() => useFinishedDelegates(KEY, true), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(result.current.rows[0]?.sessionId).toBe('t105');
    // Ask for the next older page whenever one is offered, letting each read land first.
    for (let i = 0; i < 80 && (result.current.canMore || result.current.loading || i === 0); i++) {
      await act(async () => {
        if (result.current.canMore) result.current.more();
        await settle();
        await settle();
      });
    }
    expect(result.current.canMore).toBe(false);
    expect(result.current.rows).toHaveLength(105);
    expect(result.current.rows[104]?.sessionId).toBe('t1');
    expect(new Set(result.current.rows.map((d) => d.sessionId)).size).toBe(105);
  }, 60_000);

  it('a count that is not a number is no answer: no count and an error, never zero', async () => {
    onFetch(() => ({ status: 200, body: { items: [], meta: {} } }));
    const { result } = renderHook(() => useFinishedDelegates(KEY, true), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(result.current.count).toBeUndefined();
    expect(result.current.error).toBe(true);
  });

  it('a Bot with none counts zero and reads no page', async () => {
    serve(0);
    const { result } = renderHook(() => useFinishedDelegates(KEY, true), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(result.current.count).toBe(0);
    expect(result.current.rows).toEqual([]);
    expect(reads().filter((s) => s.includes(`limit=${FINISHED_PAGE}`))).toEqual([]);
  });

  it('another Bot starts again: its own count and its own newest pages', async () => {
    serve(25);
    const { result, rerender } = renderHook(({ k }) => useFinishedDelegates(k, true), { wrapper: CoreQueryProvider, initialProps: { k: KEY } });
    await act(flush);
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        if (result.current.canMore) result.current.more();
        await flush();
      });
    }
    expect(result.current.rows).toHaveLength(25);
    serve(40);
    rerender({ k: OTHER });
    await act(flush);
    expect(result.current.count).toBe(40);
    expect(result.current.rows.map((d) => d.sessionId).slice(0, 2)).toEqual(['t40', 't39']);
    // Its own first two pages, not the older pages asked for on the other Bot.
    expect(result.current.rows).toHaveLength(2 * FINISHED_PAGE);
  });
});
