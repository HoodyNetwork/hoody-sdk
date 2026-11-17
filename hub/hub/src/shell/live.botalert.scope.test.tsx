// The shell scopes the Bot waiting alert by the shown account and realm: a switch of either starts a new count, so
// Bots already waiting there never alert (notify/botAlert.test.tsx). Here only the scope the shell passes.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreShell from '@core/shell';

const world = vi.hoisted(() => ({ calls: [] as [number | undefined, string][], seen: { account: null as string | null, realm: '' } }));
vi.mock('@core/shell', async (orig) => ({ ...(await orig<typeof CoreShell>()), useBotsWaitingRead: () => ({ count: 1, atLeast: false }) }));
vi.mock('./notify/botAlert', () => ({ useBotWaitingAlert: (count: number | undefined, scope: string) => { world.calls.push([count, scope]); } }));

const { bootFixtureCore, queryClient, useCore } = await import('@core');
const { LiveShellData } = await import('./live');

function Probe() {
  const c = useCore();
  world.seen = { account: c.account, realm: c.realm };
  return null;
}

describe('LiveShellData Bot waiting alert scope', () => {
  beforeEach(() => {
    queryClient.clear();
    bootFixtureCore({ rules: [] });
    world.calls = [];
  });
  it('passes the count with the shown account and realm as its scope', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LiveShellData>
          <Probe />
        </LiveShellData>
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect(world.seen.account).toBeTruthy();
    expect(world.seen.realm).toBeTruthy();
    const last = world.calls[world.calls.length - 1]!;
    expect(last).toEqual([1, `${world.seen.account}\u0000${world.seen.realm}`]);
  });
});
