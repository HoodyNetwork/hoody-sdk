// Vitest: the Bare metal view of Plans & billing in its fixture states: the listings, the
// inspector and its order box, the failed and empty states, a suspended account, and the reservations.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { listingRules } from '@core';
import page from '../page';
import billingStrings from '../strings.en.json';
import strings from './strings.en.json';

const W = listingRules.listingFactWords;
const manifests = import.meta.glob<{ default: { path: string; nav?: unknown } }>('../../*/page.ts', { eager: true });

describe('one commerce entry', () => {
  it('Plans & billing is the only manifest with a nav entry for /billing or /market', () => {
    const navs = Object.values(manifests).filter((m) => (m.default.path === '/billing' || m.default.path === '/market') && m.default.nav);
    expect(navs.map((m) => m.default.path)).toEqual(['/billing']);
    expect(page.nav).toMatchObject({ group: 'account', order: 10, icon: 'hoody-marketplace' });
  });
});

describe('the Bare metal view', () => {
  it('lists servers and opens one with the keyboard', async () => {
    const { router } = await renderPage(page, { path: '/billing?view=servers' });
    const table = await screen.findByRole('table', { name: strings['tab.listings'] });
    await within(table).findByRole('row', { name: /Frankfurt L/ });
    const first = within(table).getAllByRole('row')[1];
    if (!first) throw new Error('no data row');
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.search).toMatchObject({ sel: 'l01' }); // the Featured order: Frankfurt L first
  });

  it('shows the specs and the buy panel of a deep-linked server', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect((await screen.findAllByText(W['fact.cpu'])).length).toBeGreaterThan(0);
    expect(await screen.findByText(strings['buy.total'])).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: strings['buy.rent'] })).toBeInTheDocument();
  });

  it('says an unbuyable listing is not for sale, in the header and the order box', async () => {
    const a = await renderPage(page, { path: '/billing?view=servers&sel=o01' });
    expect(await screen.findByRole('button', { name: strings['buy.reserve'] })).toBeInTheDocument();
    a.unmount();
    await renderPage(page, { path: '/billing?view=servers&sel=u01' });
    expect(await screen.findByText(strings['buy.unbuyable'])).toBeInTheDocument();
    expect(screen.queryByText(listingRules.instantPromise.label, { selector: '[data-status]' })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['buy.rent'] })).toBeNull();
  });

  it('says how short the balance is', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03', state: 'servers-balance-short' });
    expect(await screen.findByText(/short$/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['buy.addFunds'] }).length).toBeGreaterThan(1);
  });

  it('shows a warning when one source failed and keeps the rows', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-one-failed' });
    expect(await screen.findByText(strings['band.offers'])).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Frankfurt L/ })).toBeInTheDocument();
  });

  it('shows the error state when both sources failed', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-both-failed' });
    expect(await screen.findByText(strings['error.title'])).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    await renderPage(page, { path: '/billing?view=servers', state: 'servers-empty' });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
  });

  it('turns purchases off for a banned account', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01', state: 'servers-banned' });
    expect(await screen.findByText(billingStrings['band.suspendedTitle'])).toBeInTheDocument();
    expect(screen.getByText(strings['banned.title'])).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: strings['tab.listings'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['buy.rent'] })).toBeNull();
  });

  it('lists reservations with state and overdue', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations' });
    const table = await screen.findByRole('table', { name: strings['res.title'] });
    expect(await within(table).findByText(/2 days late/)).toBeInTheDocument();
    expect(within(table).getByText(strings['res.state.refunded'])).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: strings['res.viewRow'] }).length).toBeGreaterThan(0);
  });

  it('shows the empty reservations state', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-empty' });
    expect(await screen.findByText(strings['res.empty.title'])).toBeInTheDocument();
  });
});

describe('bare metal reservations', () => {
  it('filter by status with chips', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations' });
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    const total = screen.getAllByRole('row').length;
    await userEvent.click(await screen.findByRole('radio', { name: strings['res.state.fulfilled'] }));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeLessThan(total));
  });
});
