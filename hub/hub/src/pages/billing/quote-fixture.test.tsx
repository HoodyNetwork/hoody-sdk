// Vitest: on fixture pages a rent or reserve checkout quotes the item and term it was opened for (the vault walk showed one
// price for every listing). The pure rule (quoteForListing) and the page: the rental, setup and total lines and the
// ceiling note follow the listing and the days; a term the listing does not offer prices nothing.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { type CheckoutQuote, type ListingPrices, quoteForListing } from './checkout-logic';
import page from './page';
import strings from './strings.en.json';

const template: CheckoutQuote = {
  chargeCents: 3900,
  balanceCents: 4250,
  blocked: null,
  warnings: [],
  lines: [
    { label: 'mkt.bdRental', cents: 3900 },
    { label: 'mkt.bdSetup', cents: 0 },
    { label: 'mkt.bdTotal', cents: 3900, strong: true },
    { label: 'buy.wallet', cents: 4250 },
  ],
  notes: [{ k: 'co.ceiling', v: { amount: '$39.00' } }, { k: 'mkt.noRefunds' }],
};
const prices: ListingPrices = { 'rent:a': { '30': [1000, 250], '90': [2500, 0] }, 'reserve:b': { '30': [700, 0] } };

describe('quoteForListing', () => {
  it('prices the rental, the setup, the total, the charge and the ceiling from the listing and the term', () => {
    const q = quoteForListing(template, prices, 'rent', 'a', 30);
    expect(q?.chargeCents).toBe(1250);
    expect(q?.lines.map((l) => l.cents)).toEqual([1000, 250, 1250, 4250]);
    expect(q?.notes[0]).toEqual({ k: 'co.ceiling', v: { amount: '$12.50' } });
    expect(q?.notes[1]).toEqual({ k: 'mkt.noRefunds' });
  });

  it('a rent with no setup draws no Setup line (as live: a stock setup is only total less rental); a reservation keeps its $0.00 fee', () => {
    expect(quoteForListing(template, prices, 'rent', 'a', 90)?.lines.map((l) => l.label)).toEqual(['mkt.bdRental', 'mkt.bdTotal', 'buy.wallet']);
    expect(quoteForListing(template, prices, 'reserve', 'b', 30)?.lines.map((l) => [l.label, l.cents])).toEqual([
      ['mkt.bdRental', 700],
      ['mkt.bdSetup', 0],
      ['mkt.bdTotal', 700],
      ['buy.wallet', 4250],
    ]);
  });

  it('another term of the same listing is another price', () => {
    expect(quoteForListing(template, prices, 'rent', 'a', 90)?.chargeCents).toBe(2500);
  });

  it('a term, an id or a kind the table does not have prices nothing', () => {
    expect(quoteForListing(template, prices, 'rent', 'a', 7)).toBeNull();
    expect(quoteForListing(template, prices, 'rent', 'zz', 30)).toBeNull();
    expect(quoteForListing(template, prices, 'rent', 'b', 30)).toBeNull();
    expect(quoteForListing(template, prices, 'reserve', 'b', 30)?.chargeCents).toBe(700);
  });

  it('leaves the template untouched', () => {
    quoteForListing(template, prices, 'rent', 'a', 30);
    expect(template.chargeCents).toBe(3900);
    expect(template.lines[0]?.cents).toBe(3900);
  });
});

const open = async (kind: 'rent' | 'reserve', item: string, days: number) => {
  await renderPage(page, { path: `/billing?checkout=${kind}&item=${item}&days=${days}` });
  return screen.findByRole('dialog');
};

describe('the fixture checkout quotes the opened item', () => {
  it('Frankfurt L for 30 days is $69.00, not the one fixed price', async () => {
    const dialog = await open('rent', 'l01', 30);
    await within(dialog).findByText(strings['mkt.bdTotal']);
    await waitFor(() => expect(within(dialog).getAllByText('$69.00').length).toBeGreaterThan(0));
    expect(within(dialog).queryByText('$39.00')).toBeNull();
  });

  it('another listing and term is another price (Singapore M, 90 days, $249.00)', async () => {
    const dialog = await open('rent', 'l04', 90);
    await waitFor(() => expect(within(dialog).getAllByText('$249.00').length).toBeGreaterThan(0));
  });

  it('a one-time setup fee is its own line and part of the total (Tokyo L, 30 days: $179.00 + $49.00 = $228.00)', async () => {
    const dialog = await open('rent', 'l03', 30);
    await waitFor(() => expect(within(dialog).getAllByText('$228.00').length).toBeGreaterThan(0));
    expect(within(dialog).getAllByText('$179.00').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('$49.00').length).toBeGreaterThan(0);
  });

  it('a reservation prices its own offer (Frankfurt XL, 30 days: $149.00 + $29.00 = $178.00)', async () => {
    const dialog = await open('reserve', 'o01', 30);
    await waitFor(() => expect(within(dialog).getAllByText('$178.00').length).toBeGreaterThan(0));
  });

  it('a term the listing does not offer is not priced with another term\'s total', async () => {
    const dialog = await open('rent', 'l01', 7);
    await within(dialog).findByText(strings['buy.quoteErr']);
    expect(within(dialog).getByRole('button', { name: strings['mkt.confirmCta'] })).toBeDisabled();
    expect(within(dialog).queryByText('$69.00')).toBeNull();
    expect(within(dialog).queryByText('$39.00')).toBeNull();
  });
});
