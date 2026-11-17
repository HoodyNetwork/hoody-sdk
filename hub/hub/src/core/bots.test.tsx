// bots.test.tsx: the Bots-waiting count over every running computer of the shown realm, and the waiting rule.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { botWaiting, useBotsWaiting, useBotsWaitingRead, type BotsWaitingRead } from './bots';
import { bootFixtureCore, fixtureSession } from './fixture-boot';
import { containersRoute } from './computer';
import { botsListRoute } from './bots';
import { queryClient } from './query';
import { answers, reply, type FixtureRule } from './transport';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 1)); }); }
const box = (id: string, status: string) => ({ id, status, project_id: 'p-' + id, server_name: 's-' + id });
const gate = (id: string) => ({ id: 'b' + id, pending_gate: { gate_id: id, generation: 1, type: 'confirm', summary: 'x' } });

function harness(rules: FixtureRule[]): { current: () => number | undefined } {
  bootFixtureCore({ rules });
  queryClient.clear();
  let last: number | undefined;
  function Probe() { last = useBotsWaiting(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last };
}
function readHarness(rules: FixtureRule[]): { current: () => BotsWaitingRead | undefined } {
  bootFixtureCore({ rules });
  queryClient.clear();
  let last: BotsWaitingRead | undefined;
  function Probe() { last = useBotsWaitingRead(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last };
}

describe('botWaiting: the one gate rule', () => {
  it('a pending gate with a gate id waits; none, an empty id or a non-object does not', () => {
    expect(botWaiting(gate('g1'))).toBe(true);
    expect(botWaiting({ pending_gate: { gate_id: '' } })).toBe(false);
    expect(botWaiting({ pending_gate: null })).toBe(false);
    expect(botWaiting({})).toBe(false);
    expect(botWaiting(null)).toBe(false);
  });
});

describe('useBotsWaiting', () => {
  it('sums the waiting Bots of every running computer; stopped computers are not read', async () => {
    const asked: string[] = [];
    const h = harness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running'), box('c2', 'running'), box('c3', 'stopped')] } })),
      reply(botsListRoute, (r) => {
        const id = r.target?.container.id ?? '-';
        asked.push(id);
        return { status: 200, body: { items: id === 'c1' ? [gate('a'), gate('b'), { id: 'idle' }] : [gate('c')] } };
      }),
    ]);
    await flush();
    expect(h.current()).toBe(3);
    expect([...new Set(asked)].sort()).toEqual(['c1', 'c2']);
  });
  it('the routing node is the flat server_name only; a nested server.name (a subserver display name) never routes', async () => {
    const asked: string[] = [];
    const nodes: Record<string, string> = {};
    // c8: a flat routing node plus a nested display name; it is read at the flat node. c9: only the nested display name;
    // it has no address, so it is never read and counts nothing (no flat server_name = no address).
    const both = { id: 'c8', status: 'running', project_id: 'p-c8', server_name: 's-c8', server: { name: 'fra-7' } };
    const nested = { id: 'c9', status: 'running', project_id: 'p-c9', server: { name: 'ash-3' } };
    const h = harness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running'), both, nested] } })),
      reply(botsListRoute, (r) => {
        const id = r.target?.container.id ?? '-';
        asked.push(id);
        nodes[id] = r.target?.container.server_name ?? '';
        return { status: 200, body: { items: [gate(id)] } };
      }),
    ]);
    await flush();
    expect(h.current()).toBe(2);
    expect([...new Set(asked)].sort()).toEqual(['c1', 'c8']);
    expect(nodes).toEqual({ c1: 's-c1', c8: 's-c8' });
  });
  it('a running computer with no address was not read, so the count is only a lower bound, and zero is unknown, never 0', async () => {
    const nested = { id: 'c9', status: 'running', project_id: 'p-c9', server: { name: 'ash-3' } };
    const some = readHarness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running'), nested] } })),
      reply(botsListRoute, (r) => ({ status: 200, body: { items: [gate(r.target?.container.id ?? '-')] } })),
    ]);
    await flush();
    expect(some.current()).toEqual({ count: 1, atLeast: true });
    const none = readHarness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running'), nested] } })),
      reply(botsListRoute, { status: 200, body: { items: [] } }),
    ]);
    await flush();
    expect(none.current()).toBeUndefined();
    const only = readHarness([reply(containersRoute, answers.ok({ data: { computers: [nested] } }))]);
    await flush();
    expect(only.current()).toBeUndefined();
    // Every running computer addressed and answered: the count is whole.
    const all = readHarness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running'), { ...nested, status: 'stopped' }] } })),
      reply(botsListRoute, { status: 200, body: { items: [] } }),
    ]);
    await flush();
    expect(all.current()).toEqual({ count: 0, atLeast: false });
  });
  it('a failed computer counts nothing; every computer failing is unknown (undefined), never 0', async () => {
    const one = harness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running'), box('c2', 'running')] } })),
      reply(botsListRoute, (r) => (r.target?.container.id === 'c1' ? { status: 200, body: { items: [gate('a')] } } : { status: 503, body: {} })),
    ]);
    await flush();
    expect(one.current()).toBe(1);
    const all = harness([
      reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'running')] } })),
      reply(botsListRoute, { status: 503, body: {} }),
    ]);
    await flush();
    expect(all.current()).toBeUndefined();
  });
  it('no running computer is 0; a token session that cannot read computers never reads (undefined)', async () => {
    const none = harness([reply(containersRoute, answers.ok({ data: { computers: [box('c1', 'stopped')] } }))]);
    await flush();
    expect(none.current()).toBe(0);
    let lists = 0;
    const limited = harness([
      fixtureSession({ kind: 'token', caps: ['projects.read'] }),
      reply(containersRoute, () => { lists++; return { status: 200, body: { data: { computers: [box('c1', 'running')] } } }; }),
    ]);
    await flush();
    expect(limited.current()).toBeUndefined();
    expect(lists).toBe(0);
  });
});
