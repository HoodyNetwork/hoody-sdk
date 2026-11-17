// Vitest at the page, on the live data path: New script (/scripts/new, which opens a fresh draft) never says "No computer can take a script" while the computers
// list is still being read, failed, or is a first page of a longer list that lacks the selected computer. Those are Loading and
// the read error with Try again (the overview's states). A whole list that lacks it keeps the old answer. Replaced: the data
// source only (a query function per read, under core's key layout), as in page.liveswitch.test.tsx.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { useQuery } from '@tanstack/react-query';
import { act, renderPage, screen, userEvent } from '@app/testing';
import { snapshot } from '@core/ctx';
import { prefix } from '@core/query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  body: { computers: [] as unknown[] } as unknown,
  fail: false,
  gate: undefined as undefined | (() => void),
  hold: false,
  reads: 0,
  keyOf: undefined as unknown as (key: string) => readonly unknown[],
}));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    fixtureModeActive: () => false,
    useRealms: () => ({ selected: 'all' }),
    useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: 'c9', server_name: 's' } }),
    coreSource: () => ({
      heldBy: () => undefined,
      useMutation: () => ({ pending: false, isPending: false, mutateAsync: async () => ({ outcome: 'done' as const }), held: () => [], holdOf: async () => '', complete: async () => false, discard: async () => false, settle: async () => true }),
      useQuery: (key: string, _p: unknown, o?: { enabled?: boolean }) =>
        useQuery({
          queryKey: world.keyOf(key),
          enabled: o?.enabled ?? true,
          retry: false,
          queryFn: () => {
            if (key !== 'containers') return Promise.resolve({});
            world.reads += 1;
            if (world.hold) return new Promise((res) => { world.gate = () => res({ data: world.body }); });
            return world.fail ? Promise.reject(new Error('network')) : Promise.resolve({ data: world.body });
          },
        }),
    }),
  };
});

import page from './page';
import strings from './strings.en.json';

const row = (id: string) => ({ id, name: id, status: 'running', realm_ids: [], server_name: 's', project_id: 'p1' });
const NONE = strings['new.noComputer'];
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 80)); }); };

beforeEach(() => {
  Object.assign(world, { body: { computers: [] }, fail: false, gate: undefined, hold: false, reads: 0 });
  world.keyOf = (key) => [...prefix(snapshot()), 'src', 'scripts', key, null, key === 'containers' ? null : ['p1', 'c9'], null];
});

describe('/scripts/new when the selected computer is not in the list read', () => {
  it('while the list is still being read: loading, never "No computer can take a script"', async () => {
    world.hold = true;
    await renderPage(page, { path: '/scripts/new' });
    await settle();
    expect(screen.queryByText(NONE)).toBeNull();
    await act(async () => { world.hold = false; world.body = { computers: [row('c1')], pagination: { totalPages: 1 } }; world.gate?.(); });
    await settle();
    expect(await screen.findByText(NONE)).toBeInTheDocument();
  });

  it('a failed read: the read error with Try again, never "No computer can take a script"', async () => {
    world.fail = true;
    await renderPage(page, { path: '/scripts/new' });
    await settle();
    expect(screen.queryByText(NONE)).toBeNull();
    const again = await screen.findByRole('button', { name: 'Try again' });
    world.fail = false;
    world.body = { computers: [row('c1')], pagination: { totalPages: 1 } };
    await userEvent.click(again);
    expect(await screen.findByText(NONE)).toBeInTheDocument();
  });

  it('a first page of a longer list that lacks the computer: the read error, never "No computer can take a script"', async () => {
    world.body = { computers: [row('c1'), row('c2')], pagination: { totalPages: 2 } };
    await renderPage(page, { path: '/scripts/new' });
    await settle();
    expect(screen.queryByText(NONE)).toBeNull();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a whole list that lacks the computer: no computer can take a script', async () => {
    world.body = { computers: [row('c1')], pagination: { totalPages: 1 } };
    await renderPage(page, { path: '/scripts/new' });
    expect(await screen.findByText(NONE)).toBeInTheDocument();
  });
});
