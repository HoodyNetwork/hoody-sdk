// Vitest at the page: the hold a send names is the press computer's, never the one the shell shows when the answer arrives.
// A row's Run is sent on computer A; the shell switches to B (no remount) while the answer is out, and B holds a send of the
// same path (a lock keyed by path alone). The warned Dismiss of A's send frees A's hold and never B's. (New script's own
// sends are bound to their draft's computer: new/deploy.core.test.tsx.) The real page and toast run. Replaced: the overview
// (one computer at a time, as live), the write and trigger mutations (doubles with a hold token per send, held rows that
// record the computer, and a holdOf that must never be asked), and showToast.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { useMemo, useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Toast = { tone?: string; title: string; action?: { label: string; onAction: () => unknown } };
const world = vi.hoisted(() => ({
  cur: 'A',
  subs: new Set<() => void>(),
  answers: [] as Array<(a: unknown) => void>,
  settles: [] as Array<{ hold: string }>,
  toasts: [] as unknown[],
  holdOfCalls: 0,
  // An earlier visit's send still held on A (nothing in flight in this mount).
  earlier: false,
  rows: ['A', 'B'] as Array<'A' | 'B'>,
}));
const IDS = { A: 'c0a7150000000000000000a1', B: 'c0a7150000000000000000b2' } as const;

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: unknown) => { world.toasts.push(c); return 'toast-1'; } }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const { toItems } = await import('./logic');
  const comp = (name: 'A' | 'B') => ({
    id: IDS[name], name, handle: `${name.toLowerCase()}.0000`, state: 'on', serverName: 'n1', realmIds: [], origin: '', err: null,
    caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
    agent: { templates: true, writer: false, guardedDelete: true }, rows: [{ path: 'default/1/probe.ts', magicComments: { schedule: '0 8 * * *' } }], summary: {}, instances: {}, aliases: [], deleted: [],
  });
  // Both computers hold a send of the same path: A's is the one that was sent (token hold-A), B's an earlier one (hold-B).
  const row = (n: 'A' | 'B') => ({ hold: `hold-${n}`, at: 1, identity: { path: 'default/1/probe.ts' }, target: { container: { id: IDS[n] } }, account: 'acc' });
  const mutation = (key: string) => ({
    get pending() { return key === 'write' && world.earlier; },
    isPending: false,
    mutateAsync: () => new Promise((res) => { world.answers.push(res); }),
    held: () => (key === 'write' || key === 'trigger' ? world.rows.map(row) : []),
    holdOf: async () => { world.holdOfCalls++; return 'hold-B'; },
    complete: async () => false,
    discard: async () => false,
    settle: async (_v: unknown, hold: string) => { world.settles.push({ hold }); return true; },
  });
  return {
    ...real,
    useWrite: () => mutation('write'),
    useInstantiate: () => mutation('instantiate'),
    useTrigger: () => mutation('trigger'),
    // The computer's own settle proves nothing here: Check again falls through to the list read-back, as before.
    useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
    useOverview: () => {
      const cur = useSyncExternalStore((f) => { world.subs.add(f); return () => world.subs.delete(f); }, () => world.cur) as 'A' | 'B';
      const data = useMemo(() => ({ computers: [comp(cur) as never] }), [cur]);
      const items = useMemo(() => toItems(data.computers), [data]);
      return { data, items, isPending: false, isError: false, error: null, refetch: async () => ({ [comp(cur).handle]: [] as string[] }) };
    },
  };
});

import page from './page';
import strings from './strings.en.json';

const switchTo = async (c: 'A' | 'B') => { await act(async () => { world.cur = c; world.subs.forEach((f) => f()); }); };
const answer = async (a: unknown) => { await vi.waitFor(() => expect(world.answers.length).toBeGreaterThan(0)); await act(async () => { world.answers.shift()!(a); }); };

describe('a row Run pressed on A, answered while the shell shows B, which holds the same path', () => {
  beforeEach(() => { world.earlier = false; world.rows = ['A', 'B']; world.cur = 'A'; world.answers.length = 0; world.settles.length = 0; world.toasts.length = 0; world.holdOfCalls = 0; });

  async function pressRun() {
    await renderPage(page, { state: 'many', path: '/scripts' });
    const table = await screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
    const row = (await within(table).findAllByRole('row', { name: /probe/ }))[0] as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.run'] }));
  }
  const offered = async () => {
    await vi.waitFor(() => expect(world.toasts.length).toBeGreaterThan(0));
    return world.toasts[0] as Toast;
  };

  it("the warned Dismiss names A's hold (the press computer's row), never B's", async () => {
    await pressRun();
    await switchTo('B');
    await answer({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    const toast = await offered();
    expect(toast.action).toBeTruthy();
    await act(async () => { await toast.action!.onAction(); });
    expect(world.settles).toEqual([{ hold: 'hold-A' }]);
    expect(world.holdOfCalls).toBe(0);
  });

  it('control: no switch, the same row', async () => {
    await pressRun();
    await answer({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    const toast = await offered();
    await act(async () => { await toast.action!.onAction(); });
    expect(world.settles).toEqual([{ hold: 'hold-A' }]);
  });
});
