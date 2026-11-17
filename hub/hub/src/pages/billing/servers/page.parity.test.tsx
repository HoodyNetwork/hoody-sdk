// Vitest: the market facts and orders the Market page keeps. The hold
// after the term always says what happens to the data; the CPU benchmark shows with its name; the list opens in
// the classic Featured order; reservations past what core's walk reads at once are reached with Load more.
import { afterEach, describe, expect, it } from 'vitest';
import { commerce } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { listings, pollReads, slowReads } from './fixtures';
import { featuredOrder } from './logic';
import page from '../page';
import strings from './strings.en.json';
import { listingRules } from '@core';

const W = listingRules.listingFactWords;

const holdWords = (n: number) => strings[n === 1 ? 'term.hold_one' : 'term.hold_other'].replace('{{count}}', String(n));

describe('the hold after the term', () => {
  it('says how long, and that the data is deleted after it', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByText(holdWords(3))).toBeInTheDocument();
    expect(holdWords(3)).toMatch(/data is deleted/);
    await userEvent.click(screen.getByRole('radio', { name: /90 days/ }));
    expect(await screen.findByText(holdWords(7))).toBeInTheDocument();
    expect(screen.queryByText(holdWords(3))).toBeNull();
  });

  it('a 0-day hold still says the data is deleted when the term ends', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l04' });
    expect(await screen.findByText(strings['term.hold.none'])).toBeInTheDocument();
    expect(strings['term.hold.none']).toMatch(/data is deleted/);
  });

  it('a term that gives no hold says nothing about it', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=o03' });
    await screen.findByText(strings['buy.total']);
    expect(screen.queryByText(/data is deleted/)).toBeNull();
  });
});

describe('the CPU score', () => {
  it('shows the benchmark by its name, with the number', async () => {
    const a = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByText(W['fact.score.geekbench_multi'])).toBeInTheDocument();
    expect(screen.getByText('46,000')).toBeInTheDocument();
    a.unmount();
    await renderPage(page, { path: '/billing?view=servers&sel=l04' });
    expect(await screen.findByText(W['fact.score.passmark'])).toBeInTheDocument();
    expect(screen.getByText('21,000')).toBeInTheDocument();
  });

  it('a listing without a score shows no score row', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=o01' });
    await screen.findByText(strings['buy.total']);
    for (const k of ['fact.score', 'fact.score.geekbench_multi', 'fact.score.geekbench_single', 'fact.score.passmark'] as const) expect(screen.queryByText(W[k])).toBeNull();
  });
});

describe('the Featured order', () => {
  it('buyable before not for sale, in stock before pre-orders, then as listed', () => {
    const ids = featuredOrder(listings).map((l) => l.id);
    expect(ids).toEqual(['l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08', 'o01', 'o02', 'o03', 'u01']);
    // Whatever order the rails arrive in: a pre-order listed before an in-stock server still sorts after it.
    const [o, st, u] = [listings.find((l) => l.id === 'o01')!, listings.find((l) => l.id === 'l02')!, listings.find((l) => l.id === 'u01')!];
    expect(featuredOrder([u, o, st]).map((l) => l.id)).toEqual(['l02', 'o01', 'u01']);
  });

  it('is the list order until a column header sorts it', async () => {
    await renderPage(page, { path: '/billing?view=servers' });
    const table = await screen.findByRole('table', { name: strings['tab.listings'] });
    await within(table).findByRole('row', { name: /Frankfurt L/ });
    const names = () => within(table).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(names()[0]).toMatch(/^Frankfurt L/);
    expect(names().at(-1)).toMatch(/^Ashburn S/);
    expect(names().findIndex((n) => n.includes(strings['kind.offer']))).toBeGreaterThan(names().findIndex((n) => n.startsWith('Frankfurt S')));
    const header = within(table).getByRole('columnheader', { name: new RegExp(strings['col.from']) });
    await userEvent.click(within(header).getByRole('button'));
    // Cheapest or dearest first, as the header says (the kit picks the first direction).
    await waitFor(() => expect(header.getAttribute('aria-sort')).toMatch(/ascending|descending/));
    expect(names()[0]).toMatch(header.getAttribute('aria-sort') === 'ascending' ? /^Singapore S/ : /^Ashburn XL/);
  });
});

describe('reservations past what the walk reads at once', () => {
  // Core's walk reads RES.maxAuto pages of RES.page at once (5 x 200 live); one page here, so 450 rows need Load more.
  const { maxAuto: auto, intervalMs: interval } = commerce.RES;
  afterEach(() => {
    commerce.RES.maxAuto = auto;
    commerce.RES.intervalMs = interval;
  });
  const footer = (shown: number) => `Showing ${shown} of 450`;

  it('shows how many of the total are read, and Load more reads on until all are in', async () => {
    commerce.RES.maxAuto = 1;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-many' });
    expect(await screen.findByText(footer(200))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(footer(400))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.queryByText(/^Showing \d+ of 450$/)).toBeNull());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(await screen.findByText(/450 reservations/)).toBeInTheDocument();
  });

  it('while the next page loads, Load more stays, busy, and a second press reads nothing more', async () => {
    commerce.RES.maxAuto = 1;
    slowReads.length = 0;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-more-slow' });
    await screen.findByText(footer(200));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    const busy = await screen.findByRole('button', { name: 'Load more' });
    await waitFor(() => expect(busy).toHaveAttribute('data-pending'));
    await userEvent.click(busy);
    expect(await screen.findByText(footer(400), undefined, { timeout: 15000 })).toBeInTheDocument();
    // The second press was made while the page was out: had it read, its offset would be logged by now.
    expect(slowReads).toEqual([0, 200]);
    expect(screen.getByRole('button', { name: 'Load more' })).not.toHaveAttribute('data-pending');
  }, 30000);

  it('a Load more reading two pages keeps the page that came in when the next one fails; Try again reads on from there', async () => {
    commerce.RES.maxAuto = 1;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-more-part' });
    await screen.findByText(footer(200));
    commerce.RES.maxAuto = 2;
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(strings['res.moreFailed'])).toBeInTheDocument();
    expect(screen.getByText(footer(400))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['band.retry'] }));
    await waitFor(() => expect(screen.queryByText(/^Showing \d+ of 450$/)).toBeNull());
    expect(await screen.findByText(/450 reservations/)).toBeInTheDocument();
    expect(screen.queryByText(strings['res.moreFailed'])).toBeNull();
  });

  it('a Load more landing while a poll cycle is out starts no second cycle', async () => {
    commerce.RES.maxAuto = 1;
    commerce.RES.intervalMs = 100;
    pollReads.length = 0;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-poll-slow' });
    await screen.findByText(footer(200));
    // The first cycle's page-0 read is out (it answers after 12 s: past the rest of the test even under load, under core's 20 s read bound).
    await waitFor(() => expect(pollReads.filter((o) => o === 0)).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText(footer(400));
    // Several intervals pass with the cycle still out: no other cycle reads page 0.
    await new Promise((r) => setTimeout(r, 800));
    expect(pollReads.filter((o) => o === 0)).toHaveLength(2);
  }, 20000);

  it('a search that matches none of the rows read keeps Load more (matches may be unread)', async () => {
    commerce.RES.maxAuto = 1;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-many' });
    await screen.findByText(footer(200));
    // This server is on the second page. "Server 3000" and the like are other servers, so a digit may not follow the name.
    const name = 'Server 300';
    const named = (r: HTMLElement) => new RegExp(`${name}(?!\\d)`).test(r.textContent ?? '');
    await userEvent.click(screen.getByRole('searchbox'));
    await userEvent.paste(name);
    // None of the rows read matches: the table shows its no-match state, and Load more stays under it.
    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryAllByRole('row').filter(named)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('row').filter(named)).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    // The note counts the rows read, not the matches.
    expect(screen.getByText(footer(400))).toBeInTheDocument();
  }, 30000);

  it('a Load more that fails keeps the rows read and says so; Try again reads the page and the note moves on', async () => {
    commerce.RES.maxAuto = 1;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-more-fail' });
    expect(await screen.findByText(footer(200))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(strings['res.moreFailed'])).toBeInTheDocument();
    expect(screen.getByText(footer(200))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['band.retry'] }));
    expect(await screen.findByText(footer(400))).toBeInTheDocument();
    expect(screen.queryByText(strings['res.moreFailed'])).toBeNull();
  });
});
