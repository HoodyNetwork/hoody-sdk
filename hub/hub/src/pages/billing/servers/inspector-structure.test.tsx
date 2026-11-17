// Vitest: the Bare metal inspectors are built from kit structure. The listing's order is a kit Ledger with its total,
// its delivery and what happens after the term are facts, "Good to know" lists its sentences in the open, and the
// footer says what the balance means in a line above its buttons, in the kit's warn look only when the balance falls
// short. The reservation's
// money is a Ledger and "View computers on this server" sits in the inspector's footer. The order footer stays a
// door to the checkout only: its button is never drawn where nothing can be bought.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from '../data';
import page from '../page';
import { money } from './logic';
import strings from './strings.en.json';
import pageLook from './parts/Detail.module.css';

const footer = () => document.querySelector<HTMLElement>('footer[class*="detailFooter"]');
// A cold page load on a busy host takes seconds: the first read of each test waits for it.
const WAIT = { timeout: 8000 };
const SLOW = 20_000;
// The page's own classes on the reason line or anything between it and the footer: a colour the kit did not choose.
const pageClasses = (el: HTMLElement): string[] => {
  const own = new Set(Object.values(pageLook as Record<string, string>));
  const hits: string[] = [];
  for (let n: HTMLElement | null = el; n && n.tagName !== 'FOOTER'; n = n.parentElement) for (const c of n.classList) if (own.has(c)) hits.push(c);
  return hits;
};
const holdWords = (n: number) => strings[n === 1 ? 'term.hold_one' : 'term.hold_other'].replace('{{count}}', String(n));

describe('the listing inspector', () => {
  it('the order is a ledger: the rental and setup rows, then the total after its rule', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03' });
    await screen.findByText(strings['buy.total'], {}, WAIT);
    const list = document.querySelector<HTMLElement>(`dl[aria-label="${strings['buy.title']}"]`)!;
    expect(list, 'the order list is named').not.toBeNull();
    expect(within(list).getByText(strings['buy.rental'])).toBeInTheDocument();
    expect(within(list).getByText(strings['buy.setup'])).toBeInTheDocument();
    const total = list.querySelector<HTMLElement>('[data-ledger-total]')!;
    expect(total).toHaveTextContent(strings['buy.total']);
    expect(total).toHaveTextContent(money(22800));
  }, SLOW);

  it('delivery and the hold after the term are facts, shown without opening anything', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    const hold = await screen.findByText(holdWords(3), {}, WAIT);
    expect(hold.closest('dd'), 'the hold is a fact value').not.toBeNull();
    expect(within(hold.closest('dl')!).getByText(strings['term.after'])).toBeInTheDocument();
    expect(within(hold.closest('dl')!).getByText(strings['detail.delivery'])).toBeInTheDocument();
  }, SLOW);

  it('"Good to know" shows every sentence without opening anything, each a row of one list', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=o01' });
    const first = await screen.findByText(strings['perk.prepaid'], {}, WAIT);
    const list = first.closest('ul')!;
    expect(list, 'the sentences are one list').not.toBeNull();
    expect(list).toHaveAttribute('aria-label', strings['detail.perks']);
    for (const key of ['perk.prepaid', 'perk.unlimited', 'perk.offer'] as const) {
      const line = within(list).getByText(strings[key]);
      expect(line, `${key} is visible`).toBeVisible();
      expect(line.closest('li'), `${key} is a row`).not.toBeNull();
    }
    expect(screen.queryByRole('button', { name: strings['detail.perks'] }), 'nothing to open').toBeNull();
    expect(list.closest('[hidden], [aria-hidden="true"]')).toBeNull();
  }, SLOW);

  it('a stock listing says nothing about pre-orders', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    await screen.findByText(strings['perk.prepaid'], {}, WAIT);
    expect(screen.getByText(strings['perk.unlimited'])).toBeVisible();
    expect(document.body).not.toHaveTextContent(strings['perk.offer']);
  }, SLOW);
});

describe('the order footer', () => {
  it('a short balance: the reason is a warn line above the buttons, and Rent still opens the checkout', async () => {
    resetUnknownCheckouts();
    const { router } = await renderPage(page, { path: '/billing?view=servers&sel=l03', state: 'servers-balance-short' });
    const reason = await screen.findByText(/short$/, {}, WAIT);
    expect(reason.closest('[class*="footerNotice"]'), 'the reason is the footer notice').not.toBeNull();
    expect(reason.closest('[class*="pill"]'), 'a sentence is not a status pill').toBeNull();
    expect(reason.closest('[data-notice="warn"]'), 'a shortfall takes the kit warn look').not.toBeNull();
    expect(pageClasses(reason), 'no page colour').toEqual([]);
    const rent = within(footer()!).getByRole('button', { name: strings['buy.rent'] });
    expect(rent).toBeEnabled();
    expect(rent).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(footer()!).getByRole('button', { name: strings['buy.addFunds'] })).toBeInTheDocument();
    await userEvent.click(rent);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'rent', item: 'l03' }));
  }, SLOW);

  it('a balance that covers it: said in the same plain line, with no Add funds beside Rent', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    const reason = await screen.findByText(strings['buy.enough'], {}, WAIT);
    expect(reason.closest('[class*="footerNotice"]')).not.toBeNull();
    expect(reason.closest('[class*="pill"]')).toBeNull();
    expect(reason.closest('[data-notice]'), 'a covered charge is a plain line, no tone').toBeNull();
    expect(pageClasses(reason)).toEqual([]);
    expect(within(footer()!).getByRole('button', { name: strings['buy.rent'] })).toBeEnabled();
    expect(within(footer()!).queryByRole('button', { name: strings['buy.addFunds'] })).toBeNull();
  }, SLOW);

  it('a listing not for sale: the footer says so and draws no Rent or Reserve, enabled or not', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=u01' });
    const reason = await screen.findByText(strings['buy.unbuyable'], {}, WAIT);
    expect(reason.closest('[class*="footerNotice"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: strings['buy.rent'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['buy.reserve'] })).toBeNull();
    expect(within(footer()!).getByRole('button', { name: strings['buy.similar'] })).toBeInTheDocument();
  }, SLOW);

  it('a pre-order opens the reserve checkout, never the rent one', async () => {
    resetUnknownCheckouts();
    const { router } = await renderPage(page, { path: '/billing?view=servers&sel=o01' });
    const reserve = await screen.findByRole('button', { name: strings['buy.reserve'] }, WAIT);
    expect(screen.queryByRole('button', { name: strings['buy.rent'] })).toBeNull();
    await userEvent.click(reserve);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'reserve', item: 'o01' }));
  }, SLOW);
});

describe('the reservation inspector', () => {
  it('what you paid is a ledger: the quoted rows, then what was paid as its total', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01' });
    await screen.findByText(strings['res.detail.paid'], {}, WAIT);
    const list = document.querySelector<HTMLElement>(`dl[aria-label="${strings['res.detail.paid']}"]`)!;
    expect(list, 'the paid list is named').not.toBeNull();
    expect(within(list).getByText(strings['res.fact.setupFee'])).toBeInTheDocument();
    expect(within(list).getByText(money(2500))).toBeInTheDocument();
    expect(within(list).getByText(money(15300))).toBeInTheDocument();
    const total = list.querySelector<HTMLElement>('[data-ledger-total]')!;
    expect(total).toHaveTextContent(strings['col.res.paid']);
    expect(total).toHaveTextContent(money(17800));
  }, SLOW);

  it('the hold quoted with the order is a fact of its terms', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01' });
    const hold = await screen.findByText(holdWords(10), {}, WAIT);
    expect(hold.closest('dd')).not.toBeNull();
    expect(within(hold.closest('dl')!).getByText(strings['term.after'])).toBeInTheDocument();
  }, SLOW);

  it('a delivered reservation: View computers on this server is the footer action', async () => {
    const { router } = await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r03' });
    await screen.findByText(strings['res.detail.delivered'], {}, WAIT);
    const view = within(footer()!).getByRole('button', { name: strings['res.viewServer'] });
    expect(screen.getAllByRole('button', { name: strings['res.viewServer'] })).toHaveLength(1);
    await userEvent.click(view);
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(router.state.location.search).toMatchObject({ server: '64b0c0ffee0000000000a003' });
  }, SLOW);

  it('a reservation not delivered yet has no footer', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01' });
    await screen.findByText(strings['res.detail.terms'], {}, WAIT);
    expect(footer()).toBeNull();
    expect(screen.queryByRole('button', { name: strings['res.viewServer'] })).toBeNull();
  }, SLOW);
});
