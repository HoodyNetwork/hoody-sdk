// When the agent's ownership read (script-instances) has no answer, the computer says why: still reading,
// or failed with the source error's kind, so the Overview can say why Make a link is off. Harness copied from page.owner.realms.test.tsx
// (TanStack's real QueryClient; only the data source is replaced).
import { queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook } from '@app/testing';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from '@core/ctx';
import { prefix } from '@core/query';
import { boot, R1 } from '@core/test/env';

const world = vi.hoisted(() => ({
  selected: 'all',
  realms: [] as string[],
  instancesFail: false,
  instancesHang: false,
  failWith: null as null | { kind: string },
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
          queryFn: () => (key === 'instances' && world.instancesHang ? new Promise<never>(() => undefined) : key === 'instances' && world.instancesFail ? Promise.reject(Object.assign(new Error('503 ownership_unknown'), world.failWith ?? {})) : Promise.resolve(answer(key))),
        });
      },
    }),
  };
});

import { useOverview } from './data';

const wrap = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
const until = async (check: () => boolean) => { for (let i = 0; i < 80 && !check(); i++) await new Promise((r) => setTimeout(r, 5)); expect(check()).toBe(true); };
const asked = (key: string) => world.queries.filter((q) => q.key === key && q.enabled);

describe('why ownership is unknown rides with the computer', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    Object.assign(world, { selected: R1, realms: [R1], instancesFail: false, instancesHang: false, failWith: null });
    world.queries.length = 0;
  });
  const comp0 = (hook: { result: { current: ReturnType<typeof useOverview> } }) => hook.result.current.data?.computers[0];

  it('a read answered: ownership known, no ownerRead', async () => {
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => !!comp0(hook)?.instances);
    expect(comp0(hook)!.ownerRead).toBeUndefined();
  });

  it('a read still going: ownerRead reading', async () => {
    world.instancesHang = true;
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => asked('instances').length > 0 && comp0(hook)?.name === 'atlas');
    expect(comp0(hook)!.instances).toBeNull();
    expect(comp0(hook)!.ownerRead).toEqual({ k: 'reading' });
  });

  for (const kind of ['network', 'forbidden', 'not_found', 'server']) {
    it(`a read that failed (${kind}): ownerRead failed with that kind`, async () => {
      Object.assign(world, { instancesFail: true, failWith: { kind } });
      const hook = renderHook(() => useOverview(), { wrapper: wrap });
      await until(() => comp0(hook)?.ownerRead?.k === 'failed');
      expect(comp0(hook)!.instances).toBeNull();
      expect(comp0(hook)!.ownerRead).toMatchObject({ k: 'failed', kind });
      expect((comp0(hook)!.ownerRead as { error?: { kind?: unknown } }).error).toMatchObject({ kind });
    });
  }

  it('a failure with no kind reads as a server failure, never as reading', async () => {
    world.instancesFail = true;
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => comp0(hook)?.ownerRead?.k === 'failed');
    expect(comp0(hook)!.ownerRead).toMatchObject({ k: 'failed', kind: 'server' });
  });
});
