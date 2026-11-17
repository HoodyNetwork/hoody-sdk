// The dock keeps its engine (and its conversation) when the computer's row
// withholds server_name, says "Can't reach this computer right now." instead of showing an address, and goes on with the same
// engine once the row names the server again. Through the real AskPanel and registry on the fixture core.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, chooseComputer, fixtureWorld, noteComputerRows } from '@core';
import { snapshot } from '@core/shell';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { ShellDataProvider, type ShellData } from '../shell/context';
import { AskPanel } from './AskPanel';
import { allEngines, resetRegistryForTests } from './registry';

const atlas = fixtureWorld.computers[0]!;
const shell: ShellData = { realms: [], realmId: 'r1', computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };
const WITHHELD = "Can't reach this computer right now.";

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
const note = (server_name: unknown) => act(() => { noteComputerRows(snapshot().account, [{ id: atlas.id, server_name }]); });

describe('the dock across a row that withholds the server', () => {
  it('keeps its engine, shows the unavailable line, and goes on with the same engine once the server is named again', async () => {
    bootFixtureCore({});
    act(() => { chooseComputer(atlas); });
    await mount();
    const first = dockEngine();
    expect(first?.slot.server).toBe(atlas.server_name);
    expect(screen.queryByText(WITHHELD)).toBeNull();
    note(null);
    await act(async () => { await Promise.resolve(); });
    expect(snapshot().target?.container.server_name).toBeUndefined();
    expect(dockEngine(), 'the same engine, its conversation kept').toBe(first);
    expect(first!.getSnapshot().phase).not.toBe('ended');
    expect(screen.getByText(WITHHELD)).toBeTruthy();
    note(atlas.server_name);
    await act(async () => { await Promise.resolve(); });
    expect(dockEngine()).toBe(first);
    expect(screen.queryByText(WITHHELD)).toBeNull();
  });
});
