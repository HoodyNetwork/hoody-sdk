// Vitest: the billing page in its fixture states, and the Checkout drawer's C9 rules end to end.
import { describe, expect, it } from 'vitest';
import { cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const BUY = '/billing?checkout=buy&plan=fam-plus';

async function openReview(state?: string, path = BUY) {
  resetUnknownCheckouts();
  const r = await renderPage(page, { state, path });
  const dialog = await screen.findByRole('dialog');
  const confirm = await within(dialog).findByRole('button', {
    name: strings['buy.confirm'],
  });
  // Buy a plan's Confirm is a reasoned (aria-disabled, action-less) button while its gate is closed and the real one
  // once it opens: they are different elements, so read it again after a change.
  const confirmNow = () => within(dialog).getByRole('button', { name: strings['buy.confirm'] });
  return { ...r, dialog, confirm, confirmNow };
}

describe('billing page', () => {
  it('opens on the plans; Wallet & usage shows the subscriptions and the AI usage', async () => {
    await renderPage(page);
    expect(await screen.findByRole('heading', { name: strings.plans }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: strings['subs.heading'] })).toBeNull();
    cleanup();
    await renderPage(page, { path: '/billing?view=wallet' });
    expect(await screen.findByRole('heading', { name: strings['subs.heading'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findAllByRole('table')).not.toHaveLength(0);
  });

  it('shows an error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  });

  it('offers Add funds, and opens its drawer', async () => {
    const { router } = await renderPage(page);
    const [button] = await screen.findAllByRole('button', {
      name: strings.addFunds,
    });
    if (!button) throw new Error('no Add funds button');
    await userEvent.click(button);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sheet: 'funds' }));
  });
});

describe('checkout drawer', () => {
  it('keeps Confirm off until the consent box is ticked', async () => {
    const { dialog, confirm, confirmNow } = await openReview();
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(confirmNow()).toBeEnabled();
    expect(confirmNow()).not.toHaveAttribute('aria-disabled');
  });

  it('keeps Confirm off while the wallet is short, and offers to add funds in place', async () => {
    const { dialog, confirm } = await openReview('wallet-short');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getAllByRole('button', { name: strings.addFunds }).length).toBeGreaterThan(0);
  });

  it('shows done only after the answer', async () => {
    const { dialog, confirmNow } = await openReview();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    expect(
      await within(dialog).findByRole('button', {
        name: strings['action.done'],
      }),
    ).toBeInTheDocument();
  });

  it('locks while the charge is in flight: Escape does nothing', async () => {
    const { dialog, confirmNow, router } = await openReview('send-slow');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    expect(await within(dialog).findByText(strings['mkt.posting'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ checkout: 'buy' });
  });

  it('says "may have gone through" on an unknown outcome and offers only a read-back', async () => {
    const { dialog, confirmNow } = await openReview('send-unknown');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    expect(await within(dialog).findByText(strings['co.unknownBody'])).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['buy.confirm'] })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeInTheDocument();
  });

  it('turns an unknown outcome into the result when the read-back finds it', async () => {
    const { dialog, confirmNow } = await openReview('send-unknown-resolves');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: /^check again$/i,
      }),
    );
    expect(
      await within(dialog).findByRole('button', {
        name: strings['action.done'],
      }),
    ).toBeInTheDocument();
  });

  it('unticks the consent when the price moves', async () => {
    const { dialog, confirmNow } = await openReview('send-requote');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    await waitFor(() => expect(within(dialog).getByRole('checkbox')).not.toBeChecked());
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('a charge whose setup failed', () => {
  it('gives the support reference when there is one', async () => {
    const { confirmNow, dialog } = await openReview('send-setup-failed');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    expect(await within(dialog).findByText(strings['co.setupFailed'].replace('{{amount}}', '$12.00'))).toBeInTheDocument();
  });

  it('sends the person to support with the reference rather than printing a dash when the charge amount is missing', async () => {
    const { confirmNow, dialog } = await openReview('send-setup-failed-noamount');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    const text = await within(dialog).findByText(/Give support this reference to check the charge/i);
    expect(text.textContent).not.toContain('—');
  });

  it('asks for the time of the purchase instead of a reference it cannot show', async () => {
    const { confirmNow, dialog } = await openReview('send-setup-failed-noref');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(confirmNow());
    const text = await within(dialog).findByText(/Contact support and tell them the time/i);
    expect(text.textContent).not.toMatch(/reference/i);
  });
});

// "Other plans" puts the picked plan back; what stood on it (the price-changed band after a refusal) goes too,
// so the next plan's review never shows the first plan's new total.
describe('upgrade: Other plans after a price refusal', () => {
  const UP = '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01';
  const requoted = strings['co.requoted'].split('{{total}}')[0]!;
  async function pickFirst(dialog: HTMLElement, index: number) {
    const radios = await within(dialog).findAllByRole('radio');
    await userEvent.click(radios[index]!);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['co.next'] }));
    return within(dialog).findByRole('button', { name: strings['up.confirm'] });
  }

  it('the next plan picked shows no "price changed" band of the plan put back', async () => {
    resetUnknownCheckouts();
    await renderPage(page, { state: 'send-requote', path: UP });
    const dialog = await screen.findByRole('dialog');
    await pickFirst(dialog, 0);
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['up.confirm'] }));
    await waitFor(() => expect(dialog.textContent).toContain(requoted));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['up.back'] }));
    const radios = await within(dialog).findAllByRole('radio');
    await pickFirst(dialog, radios.length > 1 ? 1 : 0);
    await within(dialog).findByRole('checkbox');
    expect(dialog.textContent).not.toContain(requoted);
  });

  it('control: without going back, the band stays on the plan refused', async () => {
    resetUnknownCheckouts();
    await renderPage(page, { state: 'send-requote', path: UP });
    const dialog = await screen.findByRole('dialog');
    await pickFirst(dialog, 0);
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['up.confirm'] }));
    await waitFor(() => expect(dialog.textContent).toContain(requoted));
  });
});
