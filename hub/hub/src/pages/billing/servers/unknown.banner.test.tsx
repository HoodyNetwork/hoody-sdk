// Vitest: a rent or reserve core never heard back on (C9) shows once, in the banner of Plans & billing, in the Bare
// metal view too (one UnknownBands list; the Market has no bands of its own). Read from core's own records with
// the real core and Billing's live reader: one band per purchase with Check again opening its checkout in check mode;
// another account's records show none; another tab's end clears it; a failed list still shows it.
/* eslint-disable no-restricted-globals -- the test plays core's retained purchases: the browser storage they live in */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { act, renderPage, screen, userEvent } from '@app/testing';
import page from '../page';
import billingStrings from '../strings.en.json';
import strings from './strings.en.json';

// The page reads unknown purchases from core here, as a live page does (the fixture pages read a stand-in store).
vi.mock('../data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return { ...a, useUnknownCheckouts: a.useUnknownCheckoutsLive };
});

const ME = fixtureWorld.account.id;
const KEY = (n: number) => `reserve-key-${String(n).padStart(8, '0')}`;
const reserve = (n: number, o: { user?: string; name?: string | null; at?: number; offer?: string } = {}) => ({
  user_id: o.user ?? ME,
  offer_id: o.offer ?? `o0${n}`,
  days: '30',
  ceiling: 10000,
  key: KEY(n),
  at: o.at ?? 1000 + n,
  name: o.name === undefined ? `Offer ${n}` : o.name,
});
const rent = (server: string, o: { at?: number; sending?: boolean; name?: string | null } = {}) => ({
  user_id: ME,
  server_id: server,
  name: o.name === undefined ? `Rental ${server}` : o.name,
  days: '90',
  at: o.at ?? Date.now(),
  dismissed: false,
  sending: o.sending ?? false,
  attempt: `attempt-${server}-0000000000`,
});
// The fixture boot starts from empty storage, so records are written after the page is up, as another tab would,
// with the storage event that tab's write sends.
const seed = async (reserves: unknown[], rents: unknown[] = []) => {
  localStorage.setItem('hub_market_pending', JSON.stringify(reserves));
  localStorage.setItem('hub.v3.rent_pending', JSON.stringify(rents));
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub_market_pending' }));
  });
};
const up = async (state?: string) => {
  const r = await renderPage(page, { path: '/billing?view=servers', ...(state ? { state } : {}) });
  await screen.findByRole('radio', { name: strings['tab.listings'] });
  return r;
};
const titled = (title: string) => billingStrings['band.unknownTitle'].replace('{{title}}', title);
const bands = () => screen.queryAllByText(/may have gone through\.$/);

afterEach(() => {
  localStorage.removeItem('hub_market_pending');
  localStorage.removeItem('hub.v3.rent_pending');
});

describe('a bare-metal purchase that may have gone through', () => {
  it('none: no band', async () => {
    await up();
    await screen.findByRole('table', { name: strings['tab.listings'] });
    expect(bands()).toHaveLength(0);
  });

  it('a reserve shows by name with Check again, which opens its checkout in check mode', async () => {
    const { router } = await up();
    await seed([reserve(1, { offer: 'o01', name: 'Frankfurt pre-order' })]);
    expect(await screen.findByText(titled('Frankfurt pre-order'))).toBeInTheDocument();
    expect(screen.getByText(billingStrings['band.unknownBody'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: billingStrings['buy.checkAgain'] }));
    expect(router.state.location.pathname).toBe('/billing');
    expect(router.state.location.search).toMatchObject({ checkout: 'reserve', item: 'o01', days: '30', check: 'true' });
  });

  it('a rent still being sent says so', async () => {
    await up();
    await seed([], [rent('l01', { sending: true })]);
    expect(await screen.findByText(titled('Rental l01'))).toBeInTheDocument();
    expect(screen.getByText(billingStrings['band.sendingBody'])).toBeInTheDocument();
    expect(screen.queryByText(billingStrings['band.unknownBody'])).toBeNull();
  });

  it('a rent Check again opens the rent checkout of that listing', async () => {
    const { router } = await up();
    await seed([], [rent('l02')]);
    await screen.findByText(titled('Rental l02'));
    await userEvent.click(screen.getByRole('button', { name: billingStrings['buy.checkAgain'] }));
    expect(router.state.location.search).toMatchObject({ checkout: 'rent', item: 'l02', days: '90', check: 'true' });
  });

  it('every record shows, rents and reserves alike: the page keeps no other list of them', async () => {
    await up();
    await seed([reserve(1), reserve(2), reserve(3), reserve(4)], [rent('l03')]);
    await screen.findByText(titled('Offer 4'));
    expect(bands().map((b) => b.textContent).sort()).toEqual(['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4', 'Rental l03'].map(titled).sort());
  });

  it("another account's records in the same browser show nothing", async () => {
    await up();
    await seed([reserve(1, { user: `${ME}-other` })]);
    expect(bands()).toHaveLength(0);
  });

  it("another tab's end of the purchase clears the band without a reload", async () => {
    await up();
    await seed([reserve(1)]);
    expect(await screen.findByText(titled('Offer 1'))).toBeInTheDocument();
    await seed([]);
    expect(bands()).toHaveLength(0);
  });

  it('a list that failed whole still shows the band (the records need no list)', async () => {
    await up('servers-both-failed');
    await seed([reserve(1)]);
    expect(await screen.findByText(titled('Offer 1'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: billingStrings['buy.checkAgain'] })).toBeInTheDocument();
  });

  it('the band sits in the page banner, above both panes: a selected listing keeps it', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    await screen.findByRole('button', { name: strings['buy.rent'] });
    await seed([reserve(1)]);
    const band = await screen.findByText(titled('Offer 1'));
    expect(band.closest('[data-kit-banner], [class*="banner"]')).not.toBeNull();
  });
});
