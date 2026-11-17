// Vitest: the two live reads the Home widget shows, through the real core and the page's own selectors. C9: a balance
// the answer did not carry is unknown (a dash), never 0; a server list that lost a row the page rejects is incomplete,
// never empty.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import { useBalance, useSubs } from './data';
import { usd } from './logic';

function Probe() {
  const balance = useBalance();
  const subs = useSubs();
  return (
    <div>
      <p data-testid="balance">{balance.data ? usd(balance.data.general) : balance.isError ? 'error' : 'pending'}</p>
      <p data-testid="subs">{subs.data ? `${subs.data.subs.length} of ${subs.data.partial ? subs.data.partial.total : 'all'}` : subs.isError ? 'error' : 'pending'}</p>
    </div>
  );
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

async function read(balance: unknown, subs: unknown) {
  boot();
  queryClient.clear();
  onFetch((c) => (c.url.includes('/wallet/balances') ? { status: 200, body: balance } : { status: 200, body: subs }));
  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(flush);
}

describe('billing widget live reads', () => {
  beforeEach(() => queryClient.clear());

  it('a balance read that carries a balance shows it', async () => {
    await read({ data: { general_balance: '42.50' } }, { data: [], total: 0 });
    expect(screen.getByTestId('balance')).toHaveTextContent('$42.50');
  });

  it.each([
    ['an empty answer', {}],
    ['no data', { data: {} }],
    ['a null balance', { data: { general_balance: null } }],
  ])('%s is an unknown balance, never $0.00', async (_n, body) => {
    await read(body, { data: [], total: 0 });
    expect(screen.getByTestId('balance')).toHaveTextContent('—');
    expect(screen.getByTestId('balance')).not.toHaveTextContent('$0');
  });

  it('a list whose only row the page rejects is incomplete even when the server sent no total', async () => {
    await read({ data: { general_balance: '1.00' } }, { data: [{ id: 'broken' }] });
    expect(screen.getByTestId('subs')).toHaveTextContent('0 of 1');
  });

  it('a list that is whole is whole', async () => {
    await read({ data: { general_balance: '1.00' } }, { data: [{ id: 's1', state: 'active' }], total: 1 });
    expect(screen.getByTestId('subs')).toHaveTextContent('1 of all');
  });
});
