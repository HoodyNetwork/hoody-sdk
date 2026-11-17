// Vitest on the live overview: who owns a script is read in a realm the computer belongs to, so "All realms" on a
// computer in several realms no longer leaves every script's ownership unknown. The agent's script routes still need one chosen
// realm (ideas stay waiting); and a ledger that truly cannot be read leaves ownership unknown, never "not managed".
// Through TanStack's real QueryClient; only the data source is replaced, by a query function per read that records its params.
import { queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook } from '@app/testing';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from '@core/ctx';
import { prefix } from '@core/query';
import { boot, R1, R2 } from '@core/test/env';

const world = vi.hoisted(() => ({
  selected: 'all',
  realms: [] as string[],
  instancesFail: false,
  queries: [] as Array<{ key: string; params: unknown; enabled: boolean }>,
}));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const answer = (key: string): unknown => {
    if (key === 'containers') return { data: { computers: [{ id: 'cA', name: 'atlas', status: 'running', realm_ids: world.realms }] } };
    if (key === 'list') return { scripts: [{ path: 'default/1/a.ts' }] };
    if (key === 'instances') return { instances: [{ path: 'default/1/a.ts', state: 'managed_elsewhere' }] };
    if (key === 'version') return { capabilities: [{ name: 'script_templates', supported: true, available: true }] };
    if (key === 'authStatus') return { auth_active: false };
    return {};
  };
  return {
    ...real,
    fixtureModeActive: () => false,
    useRealms: () => ({ selected: world.selected }),
    useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: 'cA', server_name: 'sv' } }),
    coreSource: () => ({
      heldBy: () => undefined,
      useMutation: () => ({}),
      useQuery: (key: string, params: unknown, o?: { enabled?: boolean }) => {
        const enabled = o?.enabled ?? true;
        world.queries.push({ key, params, enabled });
        return useQuery({
          queryKey: [...prefix(snapshot()), 'src', 'scripts', key, JSON.stringify(params ?? null), key === 'containers' ? null : ['p1', 'cA'], null],
          enabled,
          retry: false,
          queryFn: () => (key === 'instances' && world.instancesFail ? Promise.reject(new Error('503 ownership_unknown')) : Promise.resolve(answer(key))),
        });
      },
    }),
  };
});

import { useOverview } from './data';

const wrap = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
const until = async (check: () => boolean) => { for (let i = 0; i < 80 && !check(); i++) await new Promise((r) => setTimeout(r, 5)); expect(check()).toBe(true); };
const asked = (key: string) => world.queries.filter((q) => q.key === key && q.enabled);

describe('who owns a script, read on a computer in several realms with every realm shown', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    Object.assign(world, { selected: 'all', realms: [R1, R2], instancesFail: false });
    world.queries.length = 0;
  });

  it('reads the ownership list in one of the computer\'s realms, so ownership is known, while the idea routes are not offered until a realm is chosen', async () => {
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => hook.result.current.data?.computers[0]?.instances !== undefined && hook.result.current.data?.computers[0]?.instances !== null);
    const c = hook.result.current.data!.computers[0]!;
    expect(c.agentRealm).toBeNull();
    expect(c.ownerRealm).toBe(R1);
    expect(asked('instances').map((q) => q.params)).toContainEqual({ compId: 'cA', realm: R1 });
    // The agent's own report (what it lists, whose it is) replaces the old read of the template list, in any realm state.
    expect(world.queries.some((q) => q.key === 'templates')).toBe(false);
    expect(asked('version').length).toBeGreaterThan(0);
    expect(asked('authStatus').length).toBeGreaterThan(0);
    expect(c.agent.templates).toBe(true);
    expect(c.instances).not.toBeNull();
  });

  it('a ledger that cannot be read leaves ownership unknown, never an empty list', async () => {
    world.instancesFail = true;
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => asked('instances').length > 0 && hook.result.current.data?.computers[0]?.name === 'atlas');
    await new Promise((r) => setTimeout(r, 50));
    expect(hook.result.current.data!.computers[0]!.instances).toBeNull();
  });

  it('a chosen realm is the realm of both the ownership list and the agent routes', async () => {
    world.selected = R2;
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => hook.result.current.data?.computers[0]?.instances !== null && hook.result.current.data?.computers[0]?.instances !== undefined);
    const c = hook.result.current.data!.computers[0]!;
    expect(c.agentRealm).toBe(R2);
    expect(c.ownerRealm).toBe(R2);
    expect(asked('instances').map((q) => q.params)).toContainEqual({ compId: 'cA', realm: R2 });
    expect(world.queries.some((q) => q.key === 'templates')).toBe(false);
    expect(asked('version').map((q) => q.params ?? null)).toContainEqual(null);
  });

  it('a computer in one realm keeps using it', async () => {
    world.realms = [R1];
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => hook.result.current.data?.computers[0]?.instances !== null && hook.result.current.data?.computers[0]?.instances !== undefined);
    const c = hook.result.current.data!.computers[0]!;
    expect(c.agentRealm).toBe(R1);
    expect(c.ownerRealm).toBe(R1);
  });
});
