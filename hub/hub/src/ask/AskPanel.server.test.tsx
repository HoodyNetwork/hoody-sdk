// The dock's slot takes the SERVER of the shown computer (`target.container.server_name`), never its display name,
// and an engine made before the server was known is replaced once it is. Through the real AskPanel and registry on the fixture core.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, chooseComputer, fixtureWorld } from '@core';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { AskPanel } from './AskPanel';
import { allEngines, resetRegistryForTests, useOwedMoves } from './registry';
import * as A from './attach';

const atlas = fixtureWorld.computers[0]!;
const shell: ShellData = { realms: [], realmId: 'r1', computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

beforeEach(() => { resetApproversForTests(); });
afterEach(() => { cleanup(); resetRegistryForTests(); resetApproversForTests(); });

async function mount() {
  const router = createRouter({ routeTree: createRootRoute({ component: AskPanel }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<ShellDataProvider value={shell}><main id="hub-main"><RouterProvider router={router} /></main></ShellDataProvider>);
    await router.load();
  });
}
const dockEngine = () => allEngines().find((e) => e.slot.computer === atlas.id);

describe('the AI panel\'s slot', () => {
  it('takes the server from the shown computer\'s target, not its name', async () => {
    bootFixtureCore({});
    act(() => { chooseComputer(atlas); });
    await mount();
    const e = dockEngine();
    expect(e, 'the panel made its engine').toBeTruthy();
    expect(e!.slot.server).toBe(atlas.server_name);
    expect(e!.slot.name).toBe('atlas');
    expect((e as any).leaseRef('r', null).target.container.server_name).toBe(atlas.server_name);
  });

  it('with no server known the slot names none; the engine is replaced when the server becomes known', async () => {
    bootFixtureCore({});
    const { server_name: _s, ...bare } = atlas as any;
    act(() => { chooseComputer(bare); });
    await mount();
    const first = dockEngine();
    expect(first).toBeTruthy();
    expect(first!.slot.server).toBeUndefined();
    expect((first as any).leaseRef('r', null).target.container.server_name).toBeUndefined();
    act(() => { chooseComputer(atlas); });
    await act(async () => { await Promise.resolve(); });
    const next = dockEngine();
    expect(next!.slot.server).toBe(atlas.server_name);
    expect(next, 'a new engine, on the server').not.toBe(first);
  });

  // The dock engine holding the person's file is not ended when the row names
  // another server (it would lose the file); it moves once it is quiet, told by the registry, with no dock reopen.
  it('a busy dock engine asked for another server keeps its server, then moves on its own once it is quiet', async () => {
    const OTHER = 'node-orca';
    bootFixtureCore({});
    act(() => { chooseComputer(atlas); });
    await mount();
    const first = dockEngine()!;
    const moves = renderHook(() => useOwedMoves());
    act(() => { first.attach([A.prepare('t1', 'note.txt', new TextEncoder().encode('keep me'), () => '')], 'look'); });
    expect(first.getSnapshot().att.items).toHaveLength(1);
    act(() => { chooseComputer({ ...atlas, server_name: OTHER } as any); });
    await act(async () => { await Promise.resolve(); });
    expect(dockEngine(), 'busy: the same engine, its file kept').toBe(first);
    expect(first.slot.server).toBe(atlas.server_name);
    expect(first.getSnapshot().att.items).toHaveLength(1);
    const rev = moves.result.current;
    // Still busy (a second file): it publishes, but the dock is not told yet.
    act(() => { first.attach([A.prepare('t2', 'more.txt', new TextEncoder().encode('and me'), () => '')], 'look'); });
    expect(first.getSnapshot().att.items).toHaveLength(2);
    expect(moves.result.current, 'a busy engine\'s publish tells the dock nothing').toBe(rev);
    act(() => { first.unattach(first.getSnapshot().att.items[1]!.id); });
    expect(moves.result.current).toBe(rev);
    act(() => { first.unattach(first.getSnapshot().att.items[0]!.id); });
    expect(moves.result.current, 'quiet: told once').toBe(rev + 1);
    await act(async () => { await Promise.resolve(); });
    const next = dockEngine();
    expect(next, 'quiet: moved without the dock opening again').not.toBe(first);
    expect(next!.slot.server).toBe(OTHER);
    expect(first.getSnapshot().phase).toBe('ended');
  });
});
