// A held test request found after a remount. A GET can be sent again; a POST's body was never
// kept, so its only way out is Stop tracking, and its labels must not promise a send that does not happen.
import { CoreQueryProvider, queryClient } from '@core';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

const world = vi.hoisted(() => ({ sends: 0, held: null as null | { method: string; route: string; compId: string } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({
    held: world.held,
    mutateAsync: async () => {
      world.sends++;
      return { outcome: 'done', data: { status: 200, ms: 3, body: 'ok' } };
    },
  }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const frame = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    for (let i = 0; i < 5; i++) await settle();
  });
};

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
  world.sends = 0;
  world.held = null;
});

describe('a held test request found after a remount', () => {
  const press = async (name: string) => {
    await act(async () => {
      screen.getByRole('button', { name }).click();
    });
    await frame();
  };

  it('a held POST has no body left: it offers Stop tracking, never Send again, and confirming sends nothing', async () => {
    world.held = { method: 'POST', route: '/a', compId: 'c1' };
    render(<TestTab item={item} comp={comp} focusSend={0} />, { wrapper: CoreQueryProvider });
    await frame();
    expect(screen.queryByRole('button', { name: strings['test.sendAgain'] })).toBeNull();
    await press(strings['test.stopTrack']);
    const dlg = screen.getByRole('alertdialog');
    expect(dlg).toHaveTextContent(strings['test.stopTrackTitle']);
    expect(dlg).toHaveTextContent(strings['test.stopTrackBody']);
    expect(dlg.textContent).not.toMatch(/send (it|the request) again/i);
    await press(strings['test.stopTrackConfirm']);
    expect(world.sends).toBe(0);
  });

  it('a held GET can be sent again: it offers Send again, and confirming sends it once', async () => {
    world.held = { method: 'GET', route: '/a', compId: 'c1' };
    render(<TestTab item={item} comp={comp} focusSend={0} />, { wrapper: CoreQueryProvider });
    await frame();
    expect(screen.queryByRole('button', { name: strings['test.stopTrack'] })).toBeNull();
    await press(strings['test.sendAgain']);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(strings['test.sendAgainTitle']);
    await press(strings['test.sendAgainConfirm']);
    expect(world.sends).toBe(1);
  });
});
