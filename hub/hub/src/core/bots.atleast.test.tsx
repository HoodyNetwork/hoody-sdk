// bots.atleast.test.tsx: useBotsWaitingRead gives the badge its count and whether that count is only a
// lower bound. useBotsWaiting() stays its count for every other caller.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { botsListRoute, useBotsWaiting, useBotsWaitingRead, type BotsWaitingRead } from './bots';
import { bootFixtureCore } from './fixture-boot';
import { containersRoute } from './computer';
import { queryClient } from './query';
import { reply } from './transport';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); }
const box = (id: string, status: string) => ({ id, status, project_id: 'p-' + id, server_name: 's-' + id });
const gate = (id: string) => ({ id: 'b' + id, pending_gate: { gate_id: id, generation: 1, type: 'confirm', summary: 'x' } });
const page = (rows: unknown[], complete: boolean) => ({ data: { computers: rows, pagination: { total: complete ? rows.length : rows.length + 50, page: 1, limit: 100, totalPages: complete ? 1 : 2 } } });

function read(list: unknown, bots: (id: string) => { status: number; body: unknown }): { read: () => BotsWaitingRead | undefined; count: () => number | undefined } {
  bootFixtureCore({
    rules: [
      reply(containersRoute, () => ({ status: 200, body: list })),
      reply(botsListRoute, (r) => bots(r.target?.container.id ?? '-')),
    ],
  });
  queryClient.clear();
  let last: BotsWaitingRead | undefined;
  let n: number | undefined;
  function Probe() { last = useBotsWaitingRead(); n = useBotsWaiting(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { read: () => last, count: () => n };
}
const ok = (items: unknown[]) => ({ status: 200, body: { items } });

describe('useBotsWaitingRead: count and lower bound', () => {
  it('a whole list with an answer from every running computer: a plain count', async () => {
    const h = read(page([box('c1', 'running'), box('c2', 'running')], true), (id) => ok(id === 'c1' ? [gate('a'), gate('b')] : [gate('c')]));
    await flush();
    expect(h.read()).toEqual({ count: 3, atLeast: false });
    expect(h.count()).toBe(3);
  });
  it('a whole list with no waiting Bot: a plain 0', async () => {
    const h = read(page([box('c1', 'running')], true), () => ok([]));
    await flush();
    expect(h.read()).toEqual({ count: 0, atLeast: false });
  });
  it('an incomplete first page with waiting Bots: a lower bound', async () => {
    const h = read(page([box('c1', 'running')], false), () => ok([gate('a'), gate('b')]));
    await flush();
    expect(h.read()).toEqual({ count: 2, atLeast: true });
    expect(h.count()).toBe(2);
  });
  it('a running computer whose Bots read failed beside one with waiting Bots: a lower bound', async () => {
    const h = read(page([box('c1', 'running'), box('c2', 'running')], true), (id) => (id === 'c1' ? ok([gate('a')]) : { status: 503, body: {} }));
    await flush();
    expect(h.read()).toEqual({ count: 1, atLeast: true });
  });
  it('no count known (an incomplete page showing none): undefined, as useBotsWaiting', async () => {
    const h = read(page([box('c1', 'running')], false), () => ok([]));
    await flush();
    expect(h.read()).toBeUndefined();
    expect(h.count()).toBeUndefined();
  });
});
