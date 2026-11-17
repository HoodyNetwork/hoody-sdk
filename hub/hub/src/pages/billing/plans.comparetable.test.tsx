// Compare plans: the one table of the Plans view, between the Bare metal band and the lower sections. Columns: each
// plan on sale, then Bare metal; Free is not a column (its card says what it has). Every price and limit is the page's
// own read (the catalogue, one whole market read): a catalogue whose prices differ from the website's shows its own,
// and none of the website's. What no read gives is one dash named "Not listed". The table buys nothing.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comparison } from './logic';
import page from './page';
import { compareMinWidth, compareTable } from './plans-compare-logic';
import { bareFacts } from './plans-next';
import type * as Market from './servers/data';
import { listings as fixtureListings } from './servers/fixtures';
import { money } from './servers/logic';
import strings from './strings.en.json';
import type * as Kit from '@kit';

const fx = vi.hoisted(() => ({ plans: [] as unknown[], pending: false, error: false, paired: true, narrow: false, refetch: 0 }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePlans: () => ({
    data: fx.pending || fx.error ? undefined : fx.plans,
    isPending: fx.pending,
    isError: fx.error,
    error: fx.error ? new Error('read failed') : null,
    refetch: () => {
      fx.refetch += 1;
    },
  }),
}));
// The market's machines at prices that are not the website's "from $30".
const listings = fixtureListings.map((l) => ({ ...l, terms: l.terms.map((x) => ({ ...x, priceCents: x.priceCents === null ? null : x.priceCents + 1137 })) }));
vi.mock('./servers/data', async (importOriginal) => {
  const actual = await importOriginal<typeof Market>();
  return { ...actual, usePairedListings: () => ({ ...actual.usePairedListings(), data: { listings, failed: [] }, paired: fx.paired }) };
});
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  return { ...kit, useContainerNarrow: (px: number, ref?: Parameters<typeof kit.useContainerNarrow>[1]) => (fx.narrow ? true : kit.useContainerNarrow(px, ref)) };
});

const res = { cpu_cores: 2, ram_gb: 4, disk_limit_gb: 60, disk_io_read_mib: 400, disk_io_write_mib: 400, network_limit_mbps: 500, max_computers: 7, snapshots_per_computer: 9, ai_multiplier: 4 };
const plan = (id: string, title: string, sort: number, cents: number, over: Record<string, unknown> = {}, r: Record<string, unknown> = {}) => ({
  id: `${id}-v1`, family_id: id, price_cents_per_month: cents, hold_days: 7, ai_tier: 'plus', sort_order: sort, max_proxy_aliases: 6, max_bot_urls: 3,
  text: { title, type_label: 'Shared server' },
  ...over, resources: { ...res, ...r },
});

const WEBSITE_PRICE = /\$(?:10|25|30)(?![\d.,])/;
const section = () => screen.findByRole('region', { name: strings['plans.cmp.title'] }, { timeout: 15_000 });
const table = async () => within(await section()).findByRole('table', {}, { timeout: 15_000 });
/** A cell as read: its text, or for the no-value dash the name it carries ("Not listed", "Not included"). */
const said = (c: Element) => ((c.textContent ?? '').trim() === '' && c.querySelector('[role="img"]') ? (c.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '') : (c.textContent ?? ''));
/** The table as read: one array per row, the row's label first. */
const grid = (tb: HTMLElement) => [...tb.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('th, td')].map(said));
const row = (tb: HTMLElement, label: string) => grid(tb).find((r) => r[0] === label) ?? [];
const heads = (tb: HTMLElement) => [...tb.querySelectorAll('thead th')].map((h) => h.textContent ?? '');

beforeEach(() => {
  fx.plans = [plan('fam-a', 'Alpha', 1, 1300, { ai_tier: 'free', max_bot_urls: 0 }, { ai_multiplier: 1, snapshots_per_computer: undefined }), plan('fam-b', 'Beta', 2, 3750, {}, { cpu_cores: 8 })];
  fx.pending = false;
  fx.error = false;
  fx.paired = true;
  fx.narrow = false;
  fx.refetch = 0;
});

describe('the Compare plans table', () => {
  it('is the one table of the Plans view, after the Bare metal card and before All plans', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    // The plan cards hold no table: their facts are label | value rows.
    expect(document.querySelector('[data-section="plans"] table, [data-section="plans"] [role="table"]')).toBeNull();
    const band = document.querySelector('[data-section="plans"] [data-kit="plan-card"][data-wide]') as HTMLElement;
    const all = document.getElementById('all-plans') as HTMLElement;
    expect(band.compareDocumentPosition(tb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tb.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('columns: each plan on sale in the catalogue order, then Bare metal, no Free column; rows in the fixed order with the cards labels', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(heads(tb)).toEqual([strings['plans.cmp.what'], 'Alpha', 'Beta', strings['plans.bareMetal']]);
    expect(grid(tb).map((r) => r[0])).toEqual([
      strings['col.price'],
      strings['buy.resComputers'],
      strings['buy.resCpu'],
      strings['buy.resRam'],
      strings['buy.resDisk'],
      strings['buy.resDiskIo'],
      strings['buy.resNetwork'],
      strings['plans.hardware'],
      strings['plans.regions'],
      strings['buy.resSnapshots'],
      strings['buy.resBotUrls'],
      strings['buy.resAliases'],
      strings['plans.aiLabel'],
      strings['plans.cmp.realms'],
      strings['plans.cmp.vms'],
    ]);
  });

  it('no price is hard-coded: the catalogue and the market read give them, and none of the website prices shows', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    const from = bareFacts({ listings, failed: [] });
    expect(from).not.toBeNull();
    const bare = `From ${money((from as NonNullable<typeof from>).fromCents)} a month`;
    expect(bare).not.toMatch(WEBSITE_PRICE);
    expect(row(tb, strings['col.price'])).toEqual([strings['col.price'], '$13 a month', '$37.50 a month', bare]);
    expect(tb.textContent).not.toMatch(WEBSITE_PRICE);
    // The lower sections name the plans and their prices from the same read.
    const lower = ['all-plans', 'free-limits', 'infrastructure', 'trust'].map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(lower).toContain('Alpha is $13 a month; Beta is $37.50 a month.');
    expect(lower).toContain('Free · Alpha · Beta · Bare metal');
    expect(lower).not.toMatch(WEBSITE_PRICE);
    expect(lower).not.toMatch(/\bPlus\b|\bPro\b/);
  });

  it('a market read that is not one whole read: the Bare metal column shows no number', async () => {
    fx.paired = false;
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    const no = strings['plans.notListed'];
    expect(row(tb, strings['col.price']).at(-1)).toBe(no);
    expect(row(tb, strings['buy.resCpu']).at(-1)).toBe(no);
    expect(row(tb, strings['buy.resRam']).at(-1)).toBe(no);
    expect(row(tb, strings['buy.resDisk']).at(-1)).toBe(no);
    expect(row(tb, strings['buy.resNetwork']).at(-1)).toBe(no);
    expect(tb.textContent).not.toMatch(WEBSITE_PRICE);
  });

  it("Bare metal's network: the port speeds of the machines the same read rents for 30 days, in the plans' unit", async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    const net = bareFacts({ listings, failed: [] })?.netMbps;
    expect(net).toBeTruthy();
    const [a, b] = net as readonly [number, number];
    expect(row(tb, strings['buy.resNetwork']).at(-1)).toBe(a === b ? `${a} Mbps` : `${a}–${b} Mbps`);
  });

  it('Free is not compared: no Free column, no "$0", and the Free card above still marks the plan the person has', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(heads(tb)).not.toContain(strings['plans.free']);
    expect(tb.textContent).not.toContain('$0');
    expect(tb.textContent).not.toContain(strings['plans.regionsNone']);
    const freeCard = screen.getByRole('group', { name: strings['plans.free'] });
    expect(within(freeCard).getByText(strings.yourPlan)).toBeInTheDocument();
  });

  it('no value is one dash named for a screen reader, never the words down a column', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    const cells = [...tb.querySelectorAll('tbody td')];
    expect(cells.some((c) => /Not listed|Not included/.test(c.textContent ?? ''))).toBe(false);
    const dashes = cells.filter((c) => (c.textContent ?? '').trim() === '');
    expect(dashes.length).toBeGreaterThan(0);
    for (const d of dashes) expect([strings['plans.notListed'], strings['plans.notIncluded']]).toContain(within(d as HTMLElement).getByRole('img').getAttribute('aria-label'));
  });

  it('a plan column: the catalogue values; 0 is Not included, a field left out is Not listed; the website rows in words', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(row(tb, strings['buy.resCpu']).slice(1, 3)).toEqual(['2', '8']);
    expect(row(tb, strings['buy.resComputers']).slice(1, 3)).toEqual(['7', '7']);
    expect(row(tb, strings['buy.resBotUrls']).slice(1, 3)).toEqual([strings['plans.notIncluded'], '3']);
    expect(row(tb, strings['buy.resSnapshots']).slice(1, 3)).toEqual([strings['plans.notListed'], '9']);
    expect(row(tb, strings['plans.aiLabel']).slice(1, 3)).toEqual(['Free 1×', 'Plus 4×']);
    expect(row(tb, strings['plans.aiLabel']).at(-1)).toBe(strings['aiu.tier.bare_metal']);
    expect(row(tb, strings['plans.hardware']).slice(1)).toEqual([strings['plans.cmp.shared'], strings['plans.cmp.shared'], strings['plans.cmp.dedicated']]);
    expect(row(tb, strings['plans.cmp.vms']).slice(1)).toEqual([strings['plans.notIncluded'], strings['plans.notIncluded'], strings['plans.cmp.vmsBare']]);
    // Realms per account: each paid plan 50, Bare metal 1000 (core's one table).
    expect(row(tb, strings['plans.cmp.realms']).slice(1)).toEqual(['50', '50', '1000']);
    // Each plan's locations are the API's list for that plan (the regions read; fixtures: three with room, one full).
    await waitFor(() => expect(row(tb, strings['plans.regions'])[1]).toContain('Frankfurt'));
    const regions = row(tb, strings['plans.regions']);
    // The names only: no "N locations" count line above them.
    expect(regions[1]).not.toMatch(/\d+ locations?|regionsCount/);
    // The table line holds each flag and name together with no-break spaces (regionsLine).
    expect(regions[1]).toContain('🇩🇪\u00a0Frankfurt,\u00a0Germany');
    expect(regions[1]).toContain('🇸🇬\u00a0Singapore');
    // A location with no room for the plan now is not named.
    expect(regions[1]).not.toContain('New');
    expect(regions.at(-1)).toBe(strings['plans.regionsBare']);
  });

  it('buys nothing: no button and no link in the table, and each plan keeps its one buy button on its card', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(within(tb).queryAllByRole('button')).toEqual([]);
    expect(within(tb).queryAllByRole('link')).toEqual([]);
    expect(within(await section()).queryByRole('button', { name: /^(Get|Upgrade|Buy|Choose|Browse)/ })).toBeNull();
    for (const name of ['Alpha', 'Beta']) expect(screen.getAllByRole('button', { name: strings.getNamed.replace('{{plan}}', name) })).toHaveLength(1);
  });
});

describe('the table in each state of the catalogue', () => {
  it('loading: the kit skeleton, no rows', async () => {
    fx.pending = true;
    await renderPage(page, { path: '/billing' });
    const s = await section();
    await waitFor(() => expect(s.querySelector('[data-skeleton]')).not.toBeNull());
    expect(within(s).queryByText(strings['col.price'])).toBeNull();
  });

  it('failed: the kit error state, and Try again reads the catalogue again', async () => {
    fx.error = true;
    await renderPage(page, { path: '/billing' });
    const s = await section();
    const again = await within(s).findByRole('button', { name: /try again/i }, { timeout: 15_000 });
    expect(within(s).queryByText(strings['col.price'])).toBeNull();
    const before = fx.refetch;
    await userEvent.click(again);
    expect(fx.refetch).toBe(before + 1);
  });

  it('an empty catalogue: Bare metal still has its column', async () => {
    fx.plans = [];
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(heads(tb)).toEqual([strings['plans.cmp.what'], strings['plans.bareMetal']]);
    // Only what Bare metal itself has: the market read's ranges, the website rows; no Computers row (its count was
    // Free's) and no catalogue-only row such as Disk speed.
    const labels = grid(tb).map((r) => r[0]);
    expect(labels).toEqual([strings['col.price'], strings['buy.resCpu'], strings['buy.resRam'], strings['buy.resDisk'], strings['buy.resNetwork'], strings['plans.hardware'], strings['plans.regions'], strings['plans.aiLabel'], strings['plans.cmp.realms'], strings['plans.cmp.vms']]);
    expect(labels).not.toContain(strings['buy.resDiskIo']);
  });
});

describe('no row counts servers per account', () => {
  it('the table has no "How many" row: no count of servers a plan allows, in a column or as a card', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    expect(grid(tb).map((r) => r[0])).not.toContain('How many');
    expect(tb.textContent).not.toMatch(/How many|One per person|Several/);
    expect(compareTable({ cmp: comparison(fx.plans as never), bare: null, regions: {} }).rows.map((r) => r.id)).not.toContain('howMany');
  });
  it('as cards too', async () => {
    fx.narrow = true;
    await renderPage(page, { path: '/billing' });
    expect((await table()).textContent).not.toMatch(/How many|One per person|Several/);
  });
});

describe('the AI row as bars', () => {
  const aiRow = (tb: HTMLElement) => [...tb.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('th, td')?.textContent === strings['plans.aiLabel']) as HTMLElement;
  it('each column draws its multiple on the table\'s one scale (the largest multiple read), named in words; Bare metal has no multiple and no bars', async () => {
    await renderPage(page, { path: '/billing' });
    const tr = aiRow(await table());
    const imgs = within(tr).getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('aria-label'))).toEqual([strings['plans.aiScaleBase'], 'Free AI: 4 times the Free plan']);
    expect(imgs.map((i) => [i.children.length, [...i.children].filter((c) => /scaleLit/.test(c.className)).length])).toEqual([[4, 1], [4, 4]]);
  });
  it('the scale follows the catalogue: a ×2 and a ×5 plan light 2 and 5 of 5', async () => {
    fx.plans = [plan('fam-a', 'Alpha', 1, 1300, {}, { ai_multiplier: 2 }), plan('fam-b', 'Beta', 2, 3750, { ai_tier: 'pro' }, { ai_multiplier: 5 })];
    await renderPage(page, { path: '/billing' });
    const tr = aiRow(await table());
    expect(within(tr).getAllByRole('img').map((i) => [i.children.length, [...i.children].filter((c) => /scaleLit/.test(c.className)).length])).toEqual([[5, 2], [5, 5]]);
    expect(row(await table(), strings['plans.aiLabel']).slice(1)).toEqual(['Plus 2×', 'Pro 5×', strings['aiu.tier.bare_metal']]);
  });
  it('Free AI explains itself on a plan card\'s words (hover, focus or a tap): the website\'s models and no guarantee, no limit number', async () => {
    await renderPage(page, { path: '/billing' });
    await table();
    const card = screen.getByRole('group', { name: 'Beta' });
    const tip = within(card).getByText('Plus 4×').closest('button') as HTMLElement;
    expect(tip).not.toBeNull();
    await userEvent.click(tip);
    expect(await screen.findByText(strings['plans.aiTip'])).toBeInTheDocument();
    expect(strings['plans.aiTip']).toMatch(/MiniMax, Xiaomi MiMo and GLM/);
    // The website's own words, its no-guarantee sentence whole: "may change or stop at any time".
    expect(strings['plans.aiTip']).toMatch(/not guaranteed and may change or stop at any time\.$/);
    expect(strings['plans.aiTip'].length).toBeLessThanOrEqual(200);
    expect(strings['plans.aiTip']).not.toMatch(/\d/);
  });
});

describe('in less room than every column needs', () => {
  it('the kit draws one card per row, every plan named beside its value: nothing dropped', async () => {
    fx.narrow = true;
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    // As a table a row holds values only (the names are the column headers); as cards each row names every plan.
    const price = [...tb.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(strings['col.price']))?.textContent ?? '';
    for (const text of ['Alpha', '$13 a month', 'Beta', '$37.50 a month', strings['plans.bareMetal']]) expect(price).toContain(text);
    expect(price).not.toContain('$0 a month');
    const vms = [...tb.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(strings['plans.cmp.vms']))?.textContent ?? '';
    for (const text of ['Alpha', 'Beta', strings['plans.cmp.vmsBare']]) expect(vms).toContain(text);
  });
  it('with room for every column the rows hold values only: the names are the column headers', async () => {
    await renderPage(page, { path: '/billing' });
    const tb = await table();
    const price = [...tb.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(strings['col.price']))?.textContent ?? '';
    expect(price).not.toContain('Alpha');
  });
});

describe('compareTable (pure)', () => {
  const cmp = () => comparison(fx.plans as never);
  it('each plan column shows its own list; reading, unreadable and all-full say so and name no location', () => {
    const live = [{ id: 'jp-tyo', country: 'JP', name: 'Tokyo, Japan' }];
    const of = (regions: Parameters<typeof compareTable>[0]['regions']) => compareTable({ cmp: cmp(), bare: null, regions }).rows.find((r) => r.id === 'regions')?.cells ?? [];
    const cells = of({ 'fam-a-v1': { state: 'list', regions: live }, 'fam-b-v1': { state: 'loading' } });
    expect(cells[0]).toEqual({ kind: 'regions', regions: live });
    expect(cells[1]).toEqual({ kind: 'word', word: { k: 'plans.regionsLoading' } });
    // No entry for a plan (never read), or a failed read: unknown, never a location on a guess.
    expect(of({})[0]).toEqual({ kind: 'word', word: { k: 'plans.regionsUnknown' } });
    expect(of({ 'fam-a-v1': { state: 'unknown' } })[0]).toEqual({ kind: 'word', word: { k: 'plans.regionsUnknown' } });
    // A read the Hub refused itself (an access key without the right) is not "the checkout lists them": no view will.
    expect(of({ 'fam-a-v1': { state: 'refused' } })[0]).toEqual({ kind: 'word', word: { k: 'plans.regionsRefused' } });
    expect(of({ 'fam-a-v1': { state: 'list', regions: [] } })[0]).toEqual({ kind: 'word', word: { k: 'plans.regionsFull' } });
  });
  it('nothing read at all: Bare metal alone, the AI tier and the rows in words, no fact row without a value', () => {
    const t = compareTable({ cmp: null, bare: null, regions: {} });
    expect(t.columns.map((c) => c.kind)).toEqual(['bare']);
    expect(t.rows.map((r) => r.id)).toEqual(['price', 'hardware', 'regions', 'ai', 'realms', 'vms']);
  });
  it('the least width grows with the columns', () => {
    expect(compareMinWidth(5)).toBeGreaterThan(compareMinWidth(2));
  });
});
