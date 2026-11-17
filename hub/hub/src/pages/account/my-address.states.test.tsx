// The address read's states the fixtures cannot reach: a refetch that fails after an
// earlier answer shows the failure, never the older address as the current one; Try again reads again; an answer that
// arrives after a failure shows the address. The hook is replaced by a controlled query; the page is real.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const S = strings;
const SLOW = { timeout: 8000 };
const ADDR = { ip: '198.51.100.9', version: 4 as const, city: 'Porto', country: 'PT' };

interface Fake {
  data: unknown;
  error: Error | null;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}
const fake = vi.hoisted(() => ({ q: null as Fake | null, listeners: new Set<() => void>() }));
vi.mock('./data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  const { useSyncExternalStore } = await import('react');
  const real = a.useMyAddress as () => unknown;
  return {
    ...a,
    useMyAddress: () => {
      const q = useSyncExternalStore(
        (fn) => (fake.listeners.add(fn), () => fake.listeners.delete(fn)),
        () => fake.q,
      );
      const live = real();
      return q ?? live;
    },
  };
});
const set = (q: Fake): void => act(() => {
  fake.q = q;
  for (const fn of fake.listeners) fn();
});
afterEach(() => {
  fake.q = null;
});
const row = async () => (await screen.findByText(S['s.ip.label'], undefined, SLOW)).closest('[class*="row"]') as HTMLElement;

describe('account: this browser\'s address, read states', () => {
  it('a failed refetch over an earlier answer shows the failure, not the older address', async () => {
    const refetch = vi.fn(async () => undefined);
    await renderPage(page, { path: '/account' });
    set({ data: ADDR, error: null, isPending: false, isFetching: false, refetch });
    expect(await within(await row()).findByText('198.51.100.9')).toBeInTheDocument();
    // TanStack keeps the last data when a later fetch fails: error and data are both set.
    set({ data: ADDR, error: new Error('server'), isPending: false, isFetching: false, refetch });
    const r = await row();
    expect(await within(r).findByText(S['s.ip.failed'])).toBeInTheDocument();
    expect(within(r).queryByText('198.51.100.9')).toBeNull();
  });

  it('Try again reads again, and the answer then shows', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn(async () => {
      set({ data: ADDR, error: null, isPending: false, isFetching: false, refetch });
    });
    await renderPage(page, { path: '/account' });
    set({ data: undefined, error: new Error('server'), isPending: false, isFetching: false, refetch });
    const r = await row();
    await user.click(await within(r).findByRole('button', { name: S['sum.tryAgain'] }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(await within(await row()).findByText('198.51.100.9')).toBeInTheDocument();
  });

  it('a pending read shows a labelled loader in the row, not a blank and not an address', async () => {
    await renderPage(page, { path: '/account' });
    set({ data: undefined, error: null, isPending: true, isFetching: true, refetch: async () => undefined });
    const r = await row();
    expect(within(r).getByRole('status', { name: S['s.ip.reading'] })).toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: S['sum.tryAgain'] })).toBeNull();
  });
});
