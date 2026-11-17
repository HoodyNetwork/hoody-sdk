// A balance refresh that fails is not shown as the
// old amount and its enough/short verdict; and every failed market read offers its details for support.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, waitFor, within } from '@app/testing';
import kit from '@kit/states/strings.en.json';
import { money } from './logic';
import page from '../page';
import billingStrings from '../strings.en.json';
import strings from './strings.en.json';

/** The error surfaces that offer their Details (status, code, trace id and Copy details for support). */
const details = () => screen.queryAllByRole('button', { name: kit['err.details'] });

describe('a failed balance refresh', () => {
  it('drops the old amount and the enough verdict: the balance shows as unavailable, and the order box says it could not read it', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByText(money(25000))).toBeInTheDocument();
    expect(await screen.findByText(strings['buy.enough'])).toBeInTheDocument();
    // A failed refetch as TanStack leaves it: status error, the previous answer still in `data`.
    await act(async () => {
      const qs = queryClient.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('balance'));
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) {
        expect(q.state.data).not.toBeUndefined();
        q.setState({ status: 'error', error: Object.assign(new Error('refetch failed'), { status: 503, code: 'UNAVAILABLE' }), fetchStatus: 'idle' });
      }
    });
    await waitFor(() => expect(screen.queryByText(money(25000))).toBeNull());
    expect(screen.queryByText(strings['buy.enough'])).toBeNull();
    expect(screen.getByText(strings['balance.failed'])).toBeInTheDocument();
    expect(screen.getByText(strings['buy.noBalance'])).toBeInTheDocument();
  });
});

describe('a failed market read offers its details for support', () => {
  it('the balance read', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-balance-failed' });
    expect(await screen.findByText(strings['balance.failed'])).toBeInTheDocument();
    await waitFor(() => expect(details().length).toBe(1));
  });
  it('one rail: the warning that the other rail is shown alone', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-one-failed' });
    expect(await screen.findByText(strings['band.offers'])).toBeInTheDocument();
    await waitFor(() => expect(details().length).toBe(1));
  });
  it('both rails', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-both-failed' });
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
    await waitFor(() => expect(details().length).toBe(1));
  });
});

describe('the suspended band shows the refusal behind it', () => {
  it('a rail read refused as suspended: the band offers that refusal, ACCOUNT_BANNED, in its details', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?view=servers' });
    expect(await screen.findByText(strings['tab.listings'])).toBeInTheDocument();
    await act(async () => {
      const qs = queryClient.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('stock'));
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) q.setState({ status: 'error', error: Object.assign(new Error('refused'), { status: 403, code: 'ACCOUNT_BANNED' }), fetchStatus: 'idle' });
    });
    expect(await screen.findByText(billingStrings['band.suspendedTitle'])).toBeInTheDocument();
    await waitFor(() => expect(details().length).toBe(1));
    act(() => details()[0]!.click());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ACCOUNT_BANNED')).toBeInTheDocument();
    expect(within(dialog).getByText('403')).toBeInTheDocument();
  });
  it('the account read says banned: an account state, no failed request, so no details', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-banned' });
    expect(await screen.findByText(billingStrings['band.suspendedTitle'])).toBeInTheDocument();
    expect(details()).toHaveLength(0);
  });
});
