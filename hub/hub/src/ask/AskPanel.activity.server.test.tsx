// The panel's activity read (the shell's Agent button count and
// Recent's phases) takes its slot from the shown computer's target WITH its server, as the dock's engine does: a slot without the
// server would keep the read on whatever connection the registry had, never moving it to the computer's server.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, chooseComputer, fixtureWorld } from '@core';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { ShellDataProvider, type ShellData } from '../shell/context';
import type * as Reg from './registry';

vi.mock('./registry', async (orig) => {
  const real = await orig<typeof Reg>();
  return { ...real, activitySource: vi.fn(real.activitySource) };
});

const R = await import('./registry');
const { useAskActivity, useAskPhases } = await import('./AskPanel');

const atlas = fixtureWorld.computers[0]!;
const OTHER = 'node-orca';
const shell: ShellData = { realms: [], realmId: 'r1', computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

beforeEach(() => { resetApproversForTests(); vi.mocked(R.activitySource).mockClear(); });
afterEach(() => { cleanup(); R.resetRegistryForTests(); resetApproversForTests(); });

function Probe() { useAskActivity(); useAskPhases(); return null; }
async function mount() {
  const router = createRouter({ routeTree: createRootRoute({ component: Probe }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<ShellDataProvider value={shell}><RouterProvider router={router} /></ShellDataProvider>);
    await router.load();
  });
}
const lastSlot = () => vi.mocked(R.activitySource).mock.calls.at(-1)![0];

describe('the panel\'s activity read', () => {
  it('reads with the shown computer\'s server, and again with the next server the row names', async () => {
    bootFixtureCore({});
    act(() => { chooseComputer(atlas); });
    await mount();
    expect(vi.mocked(R.activitySource)).toHaveBeenCalled();
    for (const [slot] of vi.mocked(R.activitySource).mock.calls) expect(slot.server).toBe(atlas.server_name);
    expect(lastSlot().name).toBe('atlas');
    act(() => { chooseComputer({ ...atlas, server_name: OTHER } as any); });
    await act(async () => { await Promise.resolve(); });
    expect(lastSlot().server).toBe(OTHER);
  });
});
