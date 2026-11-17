// bots.list.test.tsx: the Bots-waiting count never reports a number from an unreadable containers list (C9). TanStack keeps the last
// selected rows when a refetch's select throws, so the count checks the read's error, not only that rows exist.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { botsListRoute, useBotsWaiting } from './bots';
import { bootFixtureCore } from './fixture-boot';
import { containersRoute } from './computer';
import { computersList } from './power';
import { queryClient } from './query';
import { reply } from './transport';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); }
const box = (id: string, status: string) => ({ id, status, project_id: 'p-' + id, server_name: 's-' + id });
const gate = (id: string) => ({ id: 'b' + id, pending_gate: { gate_id: id, generation: 1, type: 'confirm', summary: 'x' } });

function harness(first: unknown = { data: { computers: [] } }): { current: () => number | undefined; list: { body: unknown }; bots: { status: number; items: unknown[] } } {
  const list = { body: first };
  const bots = { status: 200, items: [gate('a')] as unknown[] };
  bootFixtureCore({
    rules: [
      reply(containersRoute, () => ({ status: 200, body: list.body })),
      reply(botsListRoute, () => ({ status: bots.status, body: bots.status === 200 ? { items: bots.items } : {} })),
    ],
  });
  queryClient.clear();
  let last: number | undefined;
  function Probe() { last = useBotsWaiting(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last, list, bots };
}

describe('useBotsWaiting: an unreadable list is not a count', () => {
  it('a good empty list counts 0, and a malformed refetch after it counts nothing (undefined), never 0', async () => {
    const h = harness();
    await flush();
    expect(h.current()).toBe(0);
    h.list.body = { data: {} };
    await act(async () => { await computersList.invalidate(); });
    await flush();
    expect(h.current()).toBeUndefined();
    h.list.body = { data: { computers: [] } };
    await act(async () => { await computersList.invalidate(); });
    await flush();
    expect(h.current()).toBe(0);
  });
  it('a nonempty list then a malformed refetch no longer reports the old count', async () => {
    const h = harness({ data: { computers: [box('c1', 'running')] } });
    await flush();
    expect(h.current()).toBe(1);
    h.list.body = { data: { computers: 'nope' } };
    await act(async () => { await computersList.invalidate(); });
    await flush();
    expect(h.current()).toBeUndefined();
  });
  it('a malformed first read is undefined', async () => {
    const h = harness({ data: {} });
    await flush();
    expect(h.current()).toBeUndefined();
  });

  const refetchBots = async () => { await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[4] === botsListRoute.id }); }); await flush(); };

  it('an incomplete first page whose computers show no waiting Bot is unknown, never 0 (a computer past it may have Bots waiting)', async () => {
    const page2 = (rows: unknown[]) => ({ data: { computers: rows, pagination: { total: 150, page: 1, limit: 100, totalPages: 2 } } });
    expect((await (async () => { const h = harness(page2([])); await flush(); return h.current(); })())).toBeUndefined();
  });
  it('100 stopped computers on an incomplete page: unknown; the same page with one waiting Bot shows that count (it stands as a lower bound)', async () => {
    const stopped = Array.from({ length: 100 }, (_, i) => box('s' + i, 'stopped'));
    const h = harness({ data: { computers: stopped, pagination: { total: 101, page: 1, limit: 100, totalPages: 2 } } });
    await flush();
    expect(h.current()).toBeUndefined();
    queryClient.clear();
    const g = harness({ data: { computers: [box('c1', 'running'), ...stopped.slice(1)], pagination: { total: 101, page: 1, limit: 100, totalPages: 2 } } });
    await flush();
    expect(g.current()).toBe(1);
  });
  it('a complete list of stopped computers is a real 0', async () => {
    const h = harness({ data: { computers: [box('c1', 'stopped')], pagination: { total: 1, page: 1, limit: 100, totalPages: 1 } } });
    await flush();
    expect(h.current()).toBe(0);
  });
  it('a computer whose Bots read failed after a good one counts nothing: its last count (0 or 1) is not reported', async () => {
    const h = harness({ data: { computers: [box('c1', 'running')] } });
    h.bots.items = [];
    await flush();
    expect(h.current()).toBe(0);
    h.bots.status = 503;
    await refetchBots();
    expect(h.current()).toBeUndefined();
    h.bots.status = 200;
    h.bots.items = [gate('a')];
    await refetchBots();
    expect(h.current()).toBe(1);
    h.bots.status = 503;
    await refetchBots();
    expect(h.current()).toBeUndefined();
  });
  it('one of two running computers failing keeps the other computer count (its own failure is only unknown)', async () => {
    const calls: string[] = [];
    bootFixtureCore({
      rules: [
        reply(containersRoute, () => ({ status: 200, body: { data: { computers: [box('c1', 'running'), box('c2', 'running')] } } })),
        reply(botsListRoute, (r) => { const id = r.target?.container.id ?? '-'; calls.push(id); return id === 'c1' ? { status: 200, body: { items: [gate('a'), gate('b')] } } : { status: 503, body: {} }; }),
      ],
    });
    queryClient.clear();
    let last: number | undefined;
    function Probe() { last = useBotsWaiting(); return null; }
    render(<Probe />, { wrapper: wrap });
    await flush();
    expect(last).toBe(2);
  });
  it('zero needs an answer from every running computer: a successful empty list beside a failed read is unknown, on first load and after a waiting count', async () => {
    const seen = { c2: 'ok' as 'ok' | 'fail' };
    bootFixtureCore({
      rules: [
        reply(containersRoute, () => ({ status: 200, body: { data: { computers: [box('c1', 'running'), box('c2', 'running')] } } })),
        reply(botsListRoute, (r) => {
          const id = r.target?.container.id ?? '-';
          if (id === 'c1') return { status: 200, body: { items: [] } };
          return seen.c2 === 'fail' ? { status: 503, body: {} } : { status: 200, body: { items: [gate('a')] } };
        }),
      ],
    });
    queryClient.clear();
    seen.c2 = 'fail';
    let last: number | undefined = -1;
    function Probe() { last = useBotsWaiting(); return null; }
    render(<Probe />, { wrapper: wrap });
    await flush();
    expect(last).toBeUndefined();
    seen.c2 = 'ok';
    await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[4] === botsListRoute.id }); });
    await flush();
    expect(last).toBe(1);
    seen.c2 = 'fail';
    await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[4] === botsListRoute.id }); });
    await flush();
    expect(last).toBeUndefined();
  });
});
