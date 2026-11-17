// Vitest on the live overview's read-back, through TanStack's real QueryClient and QueryObserver (core's own client, and
// the real core key layout; nothing about the observer or refreshFresh is faked). A refetch started on computer A is a read of
// A's own list, sent now: when the shell switches to B while it is out, the observer follows B, but the answer is still A's.
// Only the data source is replaced: a query function per (read, computer) whose answers the test releases by hand.
import { CoreQueryProvider, queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@app/testing';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from '@core/ctx';
import { prefix } from '@core/query';
import { boot, R1 } from '@core/test/env';

const world = vi.hoisted(() => ({
  cur: 'cA',
  subs: new Set<() => void>(),
  lists: { cA: [] as string[], cB: ['default/1/probe.ts'] as string[] },
  /** Reads held for the test: "<read>|<computer>" -> resolvers of the fetches waiting. */
  hold: new Set<string>(),
  waiting: [] as Array<{ id: string; answer: () => void; fail: () => void }>,
  keyOf: undefined as unknown as (key: string, id: string) => readonly unknown[],
}));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const rows = [{ id: 'cA', name: 'atlas', status: 'running', realm_ids: [] }, { id: 'cB', name: 'borealis', status: 'running', realm_ids: [] }];
  const useCur = () => useSyncExternalStore((f) => { world.subs.add(f); return () => world.subs.delete(f); }, () => world.cur);
  const answer = (key: string, id: string): unknown => {
    if (key === 'containers') return { data: { computers: rows } };
    // The list read's selected shape (data.ts reads.list.select): folder 1's rows.
    if (key === 'list') return { exec: 1, rows: world.lists[id as 'cA'].map((path) => ({ path })) };
    return {};
  };
  return {
    ...real,
    fixtureModeActive: () => false,
    useRealms: () => ({ selected: 'all' }),
    useCurrentComputer: () => { const id = useCur(); return { project: { id: 'p1' }, container: { id, server_name: 'sv' } }; },
    coreSource: () => ({
      heldBy: () => undefined,
      useMutation: () => ({}),
      useQuery: (key: string, _p: unknown, o?: { enabled?: boolean }) => {
        const id = useCur();
        return useQuery({
          queryKey: world.keyOf(key, id),
          enabled: o?.enabled ?? true,
          queryFn: () => {
            if (!world.hold.has(`${key}|${id}`)) return Promise.resolve(answer(key, id));
            return new Promise((res, rej) => { world.waiting.push({ id: `${key}|${id}`, answer: () => res(answer(key, id)), fail: () => rej(new Error('network')) }); });
          },
        });
      },
    }),
  };
});

import { useOverview } from './data';

const switchTo = async (c: 'cA' | 'cB') => { await act(async () => { world.cur = c; world.subs.forEach((f) => f()); }); };
const settled = async (check: () => boolean) => { for (let i = 0; i < 50 && !check(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); expect(check()).toBe(true); };

describe('the live overview read-back after the shell switched computers mid-read', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    world.cur = 'cA';
    world.lists = { cA: [], cB: ['default/1/probe.ts'] };
    world.hold.clear();
    world.waiting.length = 0;
    // The key layout core gives a read: prefix(account, realm, generation), the source, the page, the read, params, the computer, the realm.
    world.keyOf = (key, id) => [...prefix(snapshot()), 'src', 'scripts', key, null, key === 'containers' ? null : ['p1', id], null];
  });

  async function start() {
    const hook = renderHook(() => useOverview(), { wrapper: CoreQueryProvider });
    // B was shown before and its list is cached (it has the path); A is shown now, without it.
    await switchTo('cB');
    await settled(() => hook.result.current.data?.computers[0]?.rows.length === 1);
    await switchTo('cA');
    await settled(() => hook.result.current.data?.computers[0]?.name === 'atlas');
    return { hook, handle: hook.result.current.data?.computers[0]?.handle ?? '' };
  }
  const press = async (hook: Awaited<ReturnType<typeof start>>['hook']) => {
    world.hold.add('list|cA');
    let pending!: Promise<unknown>;
    await act(async () => { pending = hook.result.current.refetch(); });
    await settled(() => world.waiting.some((w) => w.id === 'list|cA'));
    return { pending };
  };

  it("a read of A that answers after the switch to B is A's own list, never B's cached one under A's handle", async () => {
    const { hook, handle } = await start();
    const { pending } = await press(hook);
    await switchTo('cB');
    await act(async () => { world.waiting.forEach((w) => w.answer()); await pending; });
    expect(await pending).toEqual({ [handle]: [] });
  });

  it("A's own fresh list proves A even though the shell shows B by then", async () => {
    const { hook, handle } = await start();
    const { pending } = await press(hook);
    await switchTo('cB');
    world.lists.cA = ['default/1/other.ts'];
    await act(async () => { world.waiting.forEach((w) => w.answer()); await pending; });
    expect(await pending).toEqual({ [handle]: ['default/1/other.ts'] });
  });

  it('a read of A that fails is nothing proven, though A has a cached list', async () => {
    const { hook } = await start();
    const { pending } = await press(hook);
    await act(async () => { world.waiting.forEach((w) => w.fail()); await pending; });
    expect(await pending).toBeNull();
  });

  it('a read that finishes while A is still shown answers its list under its handle', async () => {
    const { hook, handle } = await start();
    const { pending } = await press(hook);
    world.lists.cA = ['default/1/other.ts'];
    await act(async () => { world.waiting.forEach((w) => w.answer()); await pending; });
    expect(await pending).toEqual({ [handle]: ['default/1/other.ts'] });
  });
});
