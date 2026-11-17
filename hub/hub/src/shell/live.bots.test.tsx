// The Bots badge reads core's count of Bots waiting for a person (useBotsWaitingRead): its count and whether it is only a
// lower bound; unknown stays unset.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreShell from '@core/shell';

const waiting = vi.hoisted(() => ({ n: undefined as number | undefined, atLeast: false }));
vi.mock('@core/shell', async (orig) => ({ ...(await orig<typeof CoreShell>()), useBotsWaitingRead: () => (waiting.n === undefined ? undefined : { count: waiting.n, atLeast: waiting.atLeast }) }));

const { bootFixtureCore, queryClient } = await import('@core');
const { useShellData } = await import('./context');
const { LiveShellData } = await import('./live');

function Probe() {
  const d = useShellData();
  return <p data-testid="bots">{d.botsWaiting === undefined ? 'unknown' : `${d.botsWaiting}${d.botsWaitingAtLeast ? '+' : ''}`}</p>;
}

const mount = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <LiveShellData>
        <Probe />
      </LiveShellData>
    </QueryClientProvider>,
  );

describe('LiveShellData Bots badge', () => {
  beforeEach(() => {
    queryClient.clear();
    bootFixtureCore({ rules: [] });
  });
  it('passes core\'s count through, and leaves it unset while core does not know', () => {
    waiting.n = 3;
    waiting.atLeast = false;
    const a = mount();
    expect(screen.getByTestId('bots')).toHaveTextContent('3');
    a.unmount();
    waiting.n = undefined;
    mount();
    expect(screen.getByTestId('bots')).toHaveTextContent('unknown');
  });
  it('passes a lower bound through as one (atLeast)', () => {
    waiting.n = 2;
    waiting.atLeast = true;
    mount();
    expect(screen.getByTestId('bots')).toHaveTextContent('2+');
  });
});
