// Vitest on the live overview: the public links of a computer that could not be read are UNKNOWN, never "no
// links": the overview says so (`aliasesRead`), and a refetch that fails keeps the links an earlier read showed. Through
// TanStack's real QueryClient; only the data source is replaced, by a query function per read.
import { queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook } from '@app/testing';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from '@core/ctx';
import { prefix } from '@core/query';
import { boot, R1 } from '@core/test/env';

const world = vi.hoisted(() => ({ aliasesFail: false, links: true, queries: [] as unknown[], realms: [] as string[], selected: 'all' }));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const answer = (key: string): unknown => {
    if (key === 'containers') return { data: { computers: [{ id: 'cA', name: 'atlas', status: 'running', realm_ids: world.realms }] } };
    if (key === 'list') return { scripts: [{ path: 'default/1/a.ts' }] };
    if (key === 'aliases') return { data: { aliases: world.links ? [{ id: 'al1', target_path: '/a', enabled: true, program: 'exec', index: 1 }] : [] } };
    if (key === 'instances') return { instances: [{ path: 'default/1/a.ts', state: 'managed_elsewhere' }] };
    if (key === 'templates') return { templates: [] };
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
          queryFn: () => (key === 'aliases' && world.aliasesFail ? Promise.reject(new Error('503 aliases_unavailable')) : Promise.resolve(answer(key))),
        });
      },
    }),
  };
});

import { useOverview } from './data';

const wrap = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
const until = async (check: () => boolean) => { for (let i = 0; i < 120 && !check(); i++) await new Promise((r) => setTimeout(r, 5)); expect(check()).toBe(true); };
const comp = (h: { result: { current: ReturnType<typeof useOverview> } }) => h.result.current.data?.computers[0];

describe('the public links of a computer, read for the delete of a script', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    Object.assign(world, { aliasesFail: false, links: true });
  });

  it('a links read that answers is read, with its links', async () => {
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => comp(hook)?.aliasesRead === true);
    expect(comp(hook)!.aliases.map((a) => a.id)).toEqual(['al1']);
  });

  it('a links read that answers with none is read: no links, and known', async () => {
    world.links = false;
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => comp(hook)?.aliasesRead === true);
    expect(comp(hook)!.aliases).toEqual([]);
  });

  it('a links read that failed is unknown, not an empty list of links', async () => {
    world.aliasesFail = true;
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => comp(hook)?.name === 'atlas');
    await new Promise((r) => setTimeout(r, 60));
    expect(comp(hook)!.aliasesRead).toBe(false);
    expect(comp(hook)!.aliases).toEqual([]);
  });

  it('a refetch that fails after a read keeps the links that read showed', async () => {
    const hook = renderHook(() => useOverview(), { wrapper: wrap });
    await until(() => comp(hook)?.aliasesRead === true);
    world.aliasesFail = true;
    await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('aliases') });
    await new Promise((r) => setTimeout(r, 60));
    expect(comp(hook)!.aliasesRead).toBe(true);
    expect(comp(hook)!.aliases.map((a) => a.id)).toEqual(['al1']);
  });
});
