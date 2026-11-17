// The shell alerts once when the Bots waiting count rises (notify/botAlert): LiveShellData wires core's count to it,
// so the alert works on every page. The rise rules are notify/botAlert.test.tsx's; here only the wiring.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreShell from '@core/shell';

const world = vi.hoisted(() => ({ n: undefined as number | undefined, alerts: [] as unknown[][] }));
vi.mock('@core/shell', async (orig) => ({ ...(await orig<typeof CoreShell>()), useBotsWaitingRead: () => (world.n === undefined ? undefined : { count: world.n, atLeast: false }) }));
vi.mock('./notify/alert', () => ({ notifyAlert: async (...a: unknown[]) => { world.alerts.push(a); return true; } }));

const { bootFixtureCore, queryClient } = await import('@core');
const { LiveShellData } = await import('./live');

const tree = () => (
  <QueryClientProvider client={queryClient}>
    <LiveShellData>
      <p>page</p>
    </LiveShellData>
  </QueryClientProvider>
);

describe('LiveShellData Bot waiting alert', () => {
  beforeEach(() => {
    queryClient.clear();
    bootFixtureCore({ rules: [] });
    world.alerts = [];
  });
  it('the first count alerts nothing; a rise of it alerts once, as a Bot alert opening Bots', async () => {
    world.n = 1;
    const h = render(tree());
    await act(async () => {});
    expect(world.alerts).toEqual([]);
    world.n = 2;
    h.rerender(tree());
    await act(async () => {});
    expect(world.alerts).toHaveLength(1);
    expect(world.alerts[0]?.[0]).toBe('bot');
    expect(world.alerts[0]?.[1]).toMatchObject({ tag: 'waiting', to: '/bots' });
  });
});
