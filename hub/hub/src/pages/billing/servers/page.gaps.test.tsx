// Vitest: a reservation's quoted terms and what it was delivered as, and the API's server filters
// (bandwidth, traffic, unlimited traffic, RAM type and disk type), over the page's fixtures.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { listingOf } from './data';
import { diskTypesOf, money, ramTypeKey, trafficValue } from './logic';
import page from '../page';
import strings from './strings.en.json';

const holdWords = (n: number) => strings[n === 1 ? 'term.hold_one' : 'term.hold_other'].replace('{{count}}', String(n));

/** The listing rows the table shows once loaded (each case here keeps at least one). */
async function shown(path: string): Promise<string[]> {
  await renderPage(page, { path });
  const table = await screen.findByRole('table', { name: strings['tab.listings'] });
  await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1), { timeout: 10000 });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent ?? '');
}
const has = (rows: string[], name: string) => rows.some((r) => r.includes(name));

describe('the spec filters', () => {
  it('disk type keeps only the listings with that kind of disk', async () => {
    const rows = await shown('/billing?view=servers&diskType=SSD');
    expect(has(rows, 'Singapore M')).toBe(true);
    expect(has(rows, 'Frankfurt L')).toBe(false);
  });

  it('bandwidth leaves out a listing below the minimum', async () => {
    const rows = await shown('/billing?view=servers&bandwidth=600..');
    expect(has(rows, 'Singapore M')).toBe(false);
    expect(has(rows, 'Frankfurt L')).toBe(true);
  });

  it('traffic counts unlimited as more than any allowance', async () => {
    const rows = await shown('/billing?view=servers&traffic=30..');
    expect(has(rows, 'Singapore M')).toBe(false);
    expect(has(rows, 'Frankfurt L')).toBe(true);
  });

  it('"Unlimited only" leaves out a capped listing', async () => {
    const rows = await shown('/billing?view=servers&unlimited=yes');
    expect(has(rows, 'Singapore M')).toBe(false);
    expect(has(rows, 'Frankfurt L')).toBe(true);
  });

  it('RAM type keeps only that type', async () => {
    const rows = await shown('/billing?view=servers&ramType=DDR5');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.includes('Tokyo M'))).toBe(true);
  });

  it('disk kinds come from each disk, else from the summary; unlimited traffic reads as the most', () => {
    expect(diskTypesOf([{ type: 'nvme' }, { type: 'HDD' }, { type: 'tape' }], '2 x 1 TB SSD')).toEqual(['HDD', 'NVMe']);
    expect(diskTypesOf([], '2 x 1.92 TB NVMe')).toEqual(['NVMe']);
    expect(diskTypesOf([null, 3], '')).toEqual([]);
    expect(trafficValue({ trafficTb: 20, trafficUnlimited: true })).toBe(Number.MAX_SAFE_INTEGER);
    expect(trafficValue({ trafficTb: null, trafficUnlimited: false })).toBeNull();
  });
});

describe('the reservation inspector', () => {
  it('shows the terms quoted when it was paid for, the money, and the hold with the deletion', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01' });
    expect(await screen.findByText(strings['res.detail.terms'])).toBeInTheDocument();
    // The reservation's own quote (10 days, $25 setup), not the offer's terms today (14 days, $29).
    expect(screen.getByText(holdWords(10))).toBeInTheDocument();
    expect(screen.queryByText(holdWords(14))).toBeNull();
    expect(screen.getByText(strings['res.fact.setupFee'])).toBeInTheDocument();
    expect(screen.getByText(money(2500))).toBeInTheDocument();
    expect(screen.getByText(money(15300))).toBeInTheDocument();
    expect(screen.queryByText(money(2900))).toBeNull();
    expect(screen.getByText(strings['res.minutes'].replace('{{n}}', '30'))).toBeInTheDocument();
    // Pending: not delivered yet, so no delivered section.
    expect(screen.queryByText(strings['res.detail.delivered'])).toBeNull();
  });

  it('a delivered reservation names its server and rental, and opens the computers on that server', async () => {
    const { router } = await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r03' });
    expect(await screen.findByText(strings['res.detail.delivered'])).toBeInTheDocument();
    expect(screen.getByText(strings['term.hold.none'])).toBeInTheDocument();
    const section = screen.getByText(strings['res.detail.delivered']).closest('section')!;
    expect(within(section).getByText(strings['res.fact.server'])).toBeInTheDocument();
    expect(within(section).getByText(strings['res.fact.rentalId'])).toBeInTheDocument();
    // Full ids are shown masked, never written out whole.
    expect(screen.queryByText('64b0c0ffee0000000000a003')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['res.viewServer'] }));
    expect(router.state.location.pathname).toBe('/computers');
    expect(router.state.location.search).toMatchObject({ server: '64b0c0ffee0000000000a003' });
  });

  it('a reservation without quoted terms or money fields says nothing it does not know (never $0)', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r05' });
    expect(await screen.findByText(strings['res.detail.terms'])).toBeInTheDocument();
    expect(screen.queryByText(strings['res.detail.paid'])).toBeNull();
    expect(screen.queryByText(money(0))).toBeNull();
    expect(screen.queryByText(/data is deleted/)).toBeNull();
  });

  it('opening a row of the list opens its inspector', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations' });
    const table = await screen.findByRole('table', { name: strings['res.title'] });
    await userEvent.click(within(table).getAllByRole('row').find((r) => r.textContent?.includes('Singapore XL'))!);
    expect(await screen.findByText(strings['res.detail.delivered'])).toBeInTheDocument();
  });
});

describe('the reservation inspector keeps its own selection key (rsel)', () => {
  it('closing it drops rsel and keeps the listing selection', async () => {
    const { router } = await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r03&sel=l01' });
    await screen.findByText(strings['res.detail.delivered']);
    // The inspector's own close button (the Esc key runs the same close).
    const header = screen.getByRole('heading', { name: 'Singapore XL' }).closest('header')!;
    await userEvent.click(within(header).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByText(strings['res.detail.delivered'])).toBeNull());
    const search = router.state.location.search as Record<string, unknown>;
    expect(search.rsel).toBeUndefined();
    expect(search.sel).toBe('l01');
  });

  it('moving through the rows with the keyboard follows in rsel, never sel', async () => {
    const { router } = await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01' });
    await screen.findByText(strings['res.detail.terms']);
    const table = screen.getByRole('table', { name: strings['res.title'] });
    const first = within(table).getAllByRole('row').find((r) => r.getAttribute('aria-selected') === 'true' || r.className.includes('active'))!;
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).rsel).not.toBe('r01'));
    const search = router.state.location.search as Record<string, unknown>;
    expect(typeof search.rsel).toBe('string');
    expect(search.sel).toBeUndefined();
  });

  it('a reservation that is not in the list says so', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=zzz' });
    expect(await screen.findByText(strings['res.notFound'])).toBeInTheDocument();
  });
});

describe('type filters match whatever the case', () => {
  it('a lowercase link matches and is rewritten in the filter’s spelling', async () => {
    const rows = await shown('/billing?view=servers&diskType=ssd&ramType=ddr4%20ecc');
    expect(has(rows, 'Singapore M')).toBe(true);
    expect(has(rows, 'Tokyo M')).toBe(false);
  });

  it('RAM types of any case or spacing key alike', () => {
    expect(ramTypeKey(' ddr4   ecc ')).toBe('DDR4 ECC');
    expect(ramTypeKey('DDR5')).toBe('DDR5');
  });
});

describe('raw rows of both rails', () => {
  it('take disk kinds from each disk (stock config, offer disks), else the summary', () => {
    const stock = listingOf('stock', { id: 's1', name: 'S', specs: { disks: { config: [{ type: 'nvme', count: 2, capacity_gb: 500 }], total_gb: 1000, summary: '2 x 500 GB SSD' }, ram: { capacity_gb: 64, type: 'ddr4 ecc' } } }, 0);
    expect(stock.diskTypes).toEqual(['NVMe']);
    expect(ramTypeKey(stock.ramType)).toBe('DDR4 ECC');
    const offer = listingOf('offer', { id: 'o1', name: 'O', disks: [{ type: 'HDD', count: 1, capacity_gb: 4000 }] }, 1);
    expect(offer.diskTypes).toEqual(['HDD']);
    const summaryOnly = listingOf('stock', { id: 's2', name: 'S2', specs: { disks: { config: [{ count: 1, capacity_gb: 480 }], total_gb: 480, summary: '1 x 480 GB SAS' } } }, 2);
    expect(summaryOnly.diskTypes).toEqual(['SAS']);
  });
});
