// Vitest: a saved test's remove confirm that is open when a change to the saved tests begins (a save still going, or
// one that may have gone through) stays open with Remove off and says why. Before, Remove closed the confirm and sent
// nothing without a word. The real tab runs on core's change source; only the tab's three reads are replaced, and the
// saved-tests lock is switched from outside (the lock itself is ops.ts's, tested in page.opcheck.test.tsx).
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET } from '@core/test/env';
import type * as Ops from './parts/ops';

const world = vi.hoisted(() => ({ locked: false, cases: [] as unknown[] }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: world.cases }, refetch: async () => undefined }),
}));
// The saved-tests change is the one made with handlers (put, delete); the send's has none.
vi.mock('./parts/ops', async (orig) => {
  const real = await orig<typeof Ops>();
  const useChange = ((...a: Parameters<typeof real.useChange>) => {
    const r = real.useChange(...a);
    return a.length > 1 && world.locked ? { ...r, locked: true } : r;
  }) as typeof real.useChange;
  return { ...real, useChange };
});

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const PATH = 'default/1/a.ts';
const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: PATH, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [{ path: PATH }], summary: {}, aliases: [], deleted: [] } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const tab = () => <TestTab item={item} comp={comp} />;
const changes = () => calls.filter((c) => c.method !== 'GET' && c.url.includes('/tests/'));
const confirm = (ask: HTMLElement) => within(ask).getByRole('button', { name: strings['test.remove'] });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  world.locked = false;
  world.cases = [{ id: 't1', name: 't1', method: 'GET', route: '/a' }, { id: 't2', name: 't2', method: 'GET', route: '/a' }];
  onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: {} } } : { status: 200, body: { data: {} } }));
  setTarget(TARGET);
});

describe('scripts: a saved test remove confirm whose tests got locked says why', () => {
  it('Remove is off with the reason, the confirm stays and nothing is sent; unlocked, it removes', async () => {
    const r = render(tab(), { wrapper: CoreQueryProvider });
    await act(async () => { fireEvent.click((await screen.findAllByRole('button', { name: strings['test.remove'] }))[0]!); await flush(); });
    const ask = await screen.findByRole('alertdialog');
    world.locked = true;
    await act(async () => { r.rerender(tab()); await flush(); });
    expect(confirm(ask)).toHaveAttribute('aria-disabled', 'true');
    expect(confirm(ask)).toHaveAccessibleDescription(strings['test.removeWait']);
    await act(async () => { fireEvent.click(confirm(ask)); await flush(); });
    expect(screen.queryByRole('alertdialog')).not.toBeNull();
    expect(changes()).toEqual([]);
    world.locked = false;
    await act(async () => { r.rerender(tab()); await flush(); });
    expect(confirm(ask)).not.toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(confirm(ask)); await flush(); });
    expect(changes()).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
