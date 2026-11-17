// Vitest: a checkout opened from Wallet & usage or Bare metal keeps that view behind the drawer and returns to it on
// close: the checkout link carries the view, and a drawer without its own
// `from` goes back to that view, not to the Plans.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import serversStrings from './servers/strings.en.json';
import strings from './strings.en.json';

describe('a checkout keeps the view it was opened from', () => {
  it('Wallet & usage: Pay now keeps the wallet behind the drawer, and Cancel returns to it', async () => {
    resetUnknownCheckouts();
    const { router } = await renderPage(page, { path: '/billing?view=wallet' });
    const [pay] = await screen.findAllByRole('button', { name: new RegExp(strings['subs.payNow']) }, { timeout: 8000 });
    await userEvent.click(pay!);
    const dialog = await screen.findByRole('dialog');
    expect(router.state.location.search).toMatchObject({ checkout: 'pay', view: 'wallet' });
    expect(screen.getByRole('heading', { name: strings['subs.heading'] })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: strings.plans })).toBeNull();
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.search).toEqual({ view: 'wallet' });
    expect(screen.getByRole('heading', { name: strings['subs.heading'] })).toBeInTheDocument();
  });

  it('Bare metal: Rent this server keeps the servers behind the drawer, and Cancel returns to the listing', async () => {
    resetUnknownCheckouts();
    const { router } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    await userEvent.click(await screen.findByRole('button', { name: serversStrings['buy.rent'] }, { timeout: 8000 }));
    const dialog = await screen.findByRole('dialog');
    expect(router.state.location.search).toMatchObject({ checkout: 'rent', view: 'servers' });
    expect(screen.queryByRole('heading', { name: strings.plans })).toBeNull();
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.search).toEqual({ view: 'servers', sel: 'l01' });
    expect(await screen.findByRole('button', { name: serversStrings['buy.rent'] })).toBeInTheDocument();
  });
});
