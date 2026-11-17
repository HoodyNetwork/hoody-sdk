// Vitest: on fixture pages the Checkout drawer prices the item it was opened for. The vault walk caught "Frankfurt L"
// being rented as "Singapore M" because the fixture listing ignored the item id; the id and kind now round trip, and an
// id the market does not offer is not found (never another item's price).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const open = async (kind: 'rent' | 'reserve', item: string) => {
  await renderPage(page, { path: `/billing?checkout=${kind}&item=${item}&days=30` });
  return screen.findByRole('dialog');
};

describe('the fixture listing follows the opened item', () => {
  it('renting Frankfurt L checks out Frankfurt L, not another server', async () => {
    const dialog = await open('rent', 'l01');
    await waitFor(() => expect(within(dialog).getAllByText(/Frankfurt L/).length).toBeGreaterThan(0));
    expect(within(dialog).queryByText(/Singapore M/)).toBeNull();
  });

  it('another id prices as that item (Singapore M is l04)', async () => {
    const dialog = await open('rent', 'l04');
    await waitFor(() => expect(within(dialog).getAllByText(/Singapore M/).length).toBeGreaterThan(0));
    expect(within(dialog).queryByText(/Frankfurt/)).toBeNull();
  });

  it('reserving an offer checks out that offer (the id is looked up among the offers)', async () => {
    const dialog = await open('reserve', 'o02');
    await waitFor(() => expect(within(dialog).getAllByText(/Ashburn XL/).length).toBeGreaterThan(0));
  });

  it('an id the market does not offer is not found, and nothing else is priced in its place', async () => {
    const dialog = await open('rent', 'nope');
    await within(dialog).findByText(strings['mkt.listingGone']);
    expect(within(dialog).queryByText(/Frankfurt|Singapore|Tokyo|Ashburn/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
  });

  it('a stock id is not an offer: reserving it finds nothing', async () => {
    const dialog = await open('reserve', 'l01');
    await within(dialog).findByText(strings['mkt.listingGone']);
    expect(within(dialog).queryByText(/Frankfurt L/)).toBeNull();
  });

  it('a found item can be confirmed (so the not-found tests above look at a real difference)', async () => {
    const dialog = await open('rent', 'l01');
    expect(await within(dialog).findByRole('button', { name: strings['mkt.confirmCta'] })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.listingGone'])).toBeNull();
  });
});
