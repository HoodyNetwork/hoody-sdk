// Vitest: the Plans view's Free column reads GET /rentals through the real core and the page's own selector (the same
// `kinds` read the checkout and the AI usage use: no second request). The free row's server.computer_capacity.max is its
// computer count only when it is a whole number above 0; anything else is null (the column then shows no count, never a
// guessed one). A list without a free row is null; an answer that is not a list is no kinds and no free server.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import { useFreeServer, useServerKinds } from './data';

function Probe() {
  const free = useFreeServer();
  const kinds = useServerKinds();
  return <p data-testid="read">{kinds.data ? JSON.stringify({ free: free.data, kinds: kinds.data }) : 'pending'}</p>;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

let rentalsCalls = 0;
async function read(body: unknown): Promise<unknown> {
  boot();
  queryClient.clear();
  rentalsCalls = 0;
  onFetch((c) => {
    if (new URL(c.url, 'https://hub.test').pathname.endsWith('/rentals')) {
      rentalsCalls += 1;
      return { status: 200, body };
    }
    return { status: 200, body: { data: [] } };
  });
  const r = render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(flush);
  const text = screen.getByTestId('read').textContent ?? '';
  r.unmount();
  return text.startsWith('{') ? JSON.parse(text) : text;
}

const FREE = 'aa11bb22cc33dd44ee55ff66';
const PAID = '0102030405060708090a0b0c';
const row = (id: string, o: Record<string, unknown> = {}, server: Record<string, unknown> = {}) => ({ server_id: id, ...o, server: { id, name: 'ash-3', ...server } });

describe('the Free column read: GET /rentals, the kinds read', () => {
  beforeEach(() => queryClient.clear());

  it('the free row gives its computer count; both hooks share one request', async () => {
    expect(await read({ data: [row(PAID), row(FREE, { is_free_tier: true }, { computer_capacity: { used: 1, max: 3 } })] })).toEqual({
      free: { max: 3 },
      kinds: { [PAID]: 'bare_metal', [FREE]: 'free' },
    });
    expect(rentalsCalls).toBe(1);
  });

  it('a capacity alone marks the row free', async () => {
    expect(await read({ data: [row(FREE, {}, { computer_capacity: { used: 0, max: 5 } })] })).toEqual({ free: { max: 5 }, kinds: { [FREE]: 'free' } });
  });

  it('a max that is not a whole number above 0 is no count', async () => {
    for (const max of [0, -1, 2.5, '3', null, Number.MAX_SAFE_INTEGER + 2]) {
      expect([max, await read({ data: [row(FREE, { is_free_tier: true }, { computer_capacity: { used: 0, max } })] })]).toEqual([
        max,
        { free: { max: null }, kinds: { [FREE]: 'free' } },
      ]);
    }
  });

  it('no free row is no free server; a body that is not a list is no kinds either', async () => {
    expect(await read({ data: [row(PAID)] })).toEqual({ free: null, kinds: { [PAID]: 'bare_metal' } });
    expect(await read({ data: { not: 'a list' } })).toEqual({ free: null, kinds: {} });
  });
});
