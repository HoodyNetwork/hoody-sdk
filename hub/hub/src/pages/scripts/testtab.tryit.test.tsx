// Vitest: Try it only moves focus to Send. It never sends, each new ask focuses Send again, the ask is
// consumed once tried (so a later remount of the tab does not take focus), and a held send stays held.
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
const sendBtn = () => screen.getByRole('button', { name: strings['test.send'] });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
  world.sends = 0;
  world.held = null;
});

describe('Try it on the Test tab', () => {
  it('each new ask focuses Send, is consumed once tried, and sends nothing', async () => {
    const consumed = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    const { rerender } = render(<TestTab item={item} comp={comp} focusSend={1} onSendFocused={consumed} />, { wrapper: CoreQueryProvider });
    await frame();
    expect(document.activeElement).toBe(sendBtn());
    expect(consumed).toHaveBeenCalledTimes(1);
    outside.focus();
    rerender(<TestTab item={item} comp={comp} focusSend={0} onSendFocused={consumed} />);
    await frame();
    expect(document.activeElement).toBe(outside);
    rerender(<TestTab item={item} comp={comp} focusSend={1} onSendFocused={consumed} />);
    await frame();
    expect(document.activeElement).toBe(sendBtn());
    expect(consumed).toHaveBeenCalledTimes(2);
    expect(world.sends).toBe(0);
    outside.remove();
  });

  it('a remount with no pending ask leaves focus where it was', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    render(<TestTab item={item} comp={comp} focusSend={0} />, { wrapper: CoreQueryProvider });
    await frame();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('a held send stays held: an ask raised once Send is locked is consumed, sends nothing, and leaves the hold', async () => {
    world.held = { method: 'GET', route: '/a', compId: 'c1' };
    const consumed = vi.fn();
    const disabled = () => sendBtn().hasAttribute('disabled') || sendBtn().getAttribute('aria-disabled') === 'true' || sendBtn().hasAttribute('data-disabled');
    const { rerender } = render(<TestTab item={item} comp={comp} focusSend={0} onSendFocused={consumed} />, { wrapper: CoreQueryProvider });
    await frame();
    expect(disabled()).toBe(true);
    expect(consumed).not.toHaveBeenCalled();
    // The ask arrives on the mounted tab after the hold is restored (the effect's render sees Send locked).
    rerender(<TestTab item={item} comp={comp} focusSend={1} onSendFocused={consumed} />);
    await frame();
    expect(consumed).toHaveBeenCalledTimes(1);
    rerender(<TestTab item={item} comp={comp} focusSend={0} onSendFocused={consumed} />);
    await frame();
    // A second press while still held is consumed as well.
    rerender(<TestTab item={item} comp={comp} focusSend={1} onSendFocused={consumed} />);
    await frame();
    expect(consumed).toHaveBeenCalledTimes(2);
    expect(disabled()).toBe(true);
    expect(world.sends).toBe(0);
    expect(screen.getByRole('button', { name: strings['test.sendAgain'] })).toBeTruthy();
  });
});
