// Vitest: the suspension reaches both funds surfaces through the real page, not only the
// hooks. A ?sheet=funds URL opened on a suspended account shows the drawer with Continue to payment disabled, and a
// checkout's funds step that is open when the account turns suspended stops the same way; a review that is short of
// funds offers no Add funds once suspended. No case here holds a payment, so none can show that a suspension hides
// "Send the same request again": topup-band-live.test.tsx proves that (funds-suspended-no-resend-title NIT).
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

type Client = Awaited<ReturnType<typeof renderPage>>['queryClient'];

/** Billing's identity read says banned (the page's suspendedState source the band and the drawers follow). */
async function ban(qc: Client) {
  await act(async () => {
    const qs = qc.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('identity'));
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) q.setState({ data: { banned: true }, status: 'success', fetchStatus: 'idle' });
  });
}

/** The funds body is shown in `dialog` with Continue to payment disabled. */
async function expectContinueDisabled(dialog: HTMLElement) {
  expect(within(dialog).getByText(strings['top.title'])).toBeInTheDocument();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['top.go'] })).toBeDisabled());
}

describe('?sheet=funds on a suspended account', () => {
  it('opens the drawer with Continue to payment disabled', async () => {
    const { queryClient } = await renderPage(page, { state: 'banned', path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    // Continue is disabled while the form loads too: wait until every read has settled and the amounts are drawn, so
    // the check below is the suspension's, not the loading state's.
    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll().every((q) => q.state.fetchStatus === 'idle')).toBe(true);
      expect(within(dialog).getByText('$10')).toBeInTheDocument();
    });
    expect(within(dialog).getByRole('button', { name: strings['top.go'] })).toBeDisabled();
    await expectContinueDisabled(dialog);
  });

  it('an open drawer stops when the account turns suspended', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    // Control: before the suspension the form can pay (its first amount is chosen).
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['top.go'] })).toBeEnabled());
    await ban(queryClient);
    await expectContinueDisabled(dialog);
  });
});

describe("a checkout's funds step and a suspension", () => {
  it('the open funds step stops when the account turns suspended', async () => {
    const { queryClient } = await renderPage(page, { state: 'wallet-short', path: '/billing?checkout=buy&plan=fam-plus' });
    const review = await screen.findByRole('dialog');
    await userEvent.click(await within(review).findByRole('button', { name: strings.addFunds }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['top.go'] })).toBeEnabled());
    await ban(queryClient);
    await expectContinueDisabled(dialog);
  });

  it('a review short of funds offers no Add funds once the account is suspended', async () => {
    const { queryClient } = await renderPage(page, { state: 'wallet-short', path: '/billing?checkout=buy&plan=fam-plus' });
    const review = await screen.findByRole('dialog');
    expect(await within(review).findByRole('button', { name: strings.addFunds })).toBeInTheDocument();
    await ban(queryClient);
    await waitFor(() => expect(within(screen.getByRole('dialog')).queryByRole('button', { name: strings.addFunds })).toBeNull());
  });
});
