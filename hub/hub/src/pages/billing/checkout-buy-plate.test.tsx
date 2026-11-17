// Vitest: Buy a plan's top plate (the first two zones of the drawer). A calm Verdict named
// "What you get" says what the purchase does, the quote's own co.newServer note, and, when the person has one, that
// the free server stays; its facts are the plan's spec rows. Each of those facts is said once: co.newServer leaves the
// notes list, the free-server line leaves the loose hint. Every other note still shows, under the money lines. The
// other checkouts keep their "What you get" section. The money is two Ledgers: the order
// (Plan, then Charged now as the total) and the wallet (its lines, then a "Short by" warn row with the gate's number and
// the strip: the short sentence and Add funds). The money flow is untouched.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { formatStorage } from '@kit/format';
import { cents } from './logic';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

async function open(path: string, confirm: string, state?: string) {
  resetUnknownCheckouts();
  await renderPage(page, { state, path: `/billing${path}` });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('button', { name: confirm }, { timeout: 20000 });
  return dialog;
}
const openBuy = (state?: string) => open('?checkout=buy&plan=fam-plus', strings['buy.confirm'], state);

const valueOf = (facts: HTMLElement, label: string) => within(facts).getByText(label).parentElement?.querySelector('dd')?.textContent ?? null;
const fill = (key: string, v: Record<string, string | number>) => Object.entries(v).reduce((s, [k, x]) => s.replace(`{{${k}}}`, String(x)), key);

describe('Buy a plan: the What you get plate', () => {
  it('a Verdict, not a section, says the purchase adds a server and holds the plan specs', async () => {
    const dialog = await openBuy();
    const plate = within(dialog).getByRole('group', { name: strings['co.whatYouGet'] });
    expect(within(dialog).queryByRole('region', { name: strings['co.whatYouGet'] })).toBeNull();
    expect(plate.textContent).toContain(strings['co.newServer']);
    expect(valueOf(plate, strings['buy.resCpu'])).toBe('2');
    expect(valueOf(plate, strings['buy.resRam'])).toBe(formatStorage(4));
    expect(valueOf(plate, strings['buy.resAi'])).toBe('×4');
    // What you get, then what you pay.
    const summary = within(dialog).getByLabelText(strings['co.summary']);
    expect(plate.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says "adds a new server" once: the plate has it, the notes list does not', async () => {
    const dialog = await openBuy();
    expect((dialog.textContent ?? '').split(strings['co.newServer'])).toHaveLength(2);
    for (const li of dialog.querySelectorAll('li')) expect(li.textContent).not.toContain(strings['co.newServer']);
  });

  it('every other note of the quote still shows, under the money lines', async () => {
    const dialog = await openBuy();
    const summary = within(dialog).getByLabelText(strings['co.summary']);
    const renew = within(dialog).getByText(fill(strings['co.renewsFromWallet'], { date: '23 Nov 2026', price: '$12.00' }));
    const hold = within(dialog).getByText(fill(strings['buy.hold'], { days: 7 }));
    for (const n of [renew, hold]) expect(summary.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the free server line sits in the plate, once', async () => {
    const dialog = await openBuy();
    const plate = within(dialog).getByRole('group', { name: strings['co.whatYouGet'] });
    const head = strings.keepsFree.split('{{server}}')[0]!;
    expect(plate.textContent).toContain(head);
    expect((dialog.textContent ?? '').split(head)).toHaveLength(2);
  });

  it('a blocked Band still comes before the plate', async () => {
    const dialog = await openBuy('quote-noroom');
    // The reasoned Confirm also carries these words as its spoken description; the Band is the one drawn copy.
    const spoken = (within(dialog).getByRole('button', { name: strings['buy.confirm'] }).getAttribute('aria-describedby') ?? '').split(' ');
    const [band, ...more] = within(dialog).getAllByText(strings['buy.noRoom']).filter((el) => !spoken.includes(el.id));
    expect(more).toHaveLength(0);
    const plate = within(dialog).getByRole('group', { name: strings['co.whatYouGet'] });
    expect(band!.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an upgrade keeps its What you get section and makes no plate', async () => {
    const dialog = await open('?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', strings['up.confirm']);
    expect(within(dialog).getByRole('region', { name: strings['co.whatYouGet'] })).toBeTruthy();
    expect(within(dialog).queryByRole('group', { name: strings['co.whatYouGet'] })).toBeNull();
  });
});

describe('Buy a plan: the money as two Ledgers', () => {
  const rowOf = (list: HTMLElement, label: string) => [...list.querySelectorAll(':scope > div')].find((d) => d.querySelector('dt')?.textContent === label) ?? null;

  it('the order: Plan, then Charged now as the total; the wallet in its own list', async () => {
    const dialog = await openBuy();
    const order = within(dialog).getByLabelText(strings['co.summary']);
    expect(rowOf(order, strings['co.plan'])).not.toBeNull();
    const total = order.querySelector('[data-ledger-total]');
    expect(total?.querySelector('dt')?.textContent).toBe(strings['buy.chargeNow']);
    expect(order.lastElementChild).toBe(total);
    expect(rowOf(order, strings['buy.wallet'])).toBeNull();
    const wallet = within(dialog).getByLabelText(strings.wallet);
    expect(rowOf(wallet, strings['buy.wallet'])).not.toBeNull();
    expect(wallet.querySelector('[data-ledger-tone="warn"]')).toBeNull();
    expect(dialog.querySelector('[data-ledger-strip]')).toBeNull();
  });

  it('short: a Short by warn row with the gate number, and the strip holds the sentence and Add funds, once', async () => {
    const dialog = await openBuy('wallet-short');
    const wallet = within(dialog).getByLabelText(strings.wallet);
    const warn = wallet.querySelector('[data-ledger-tone="warn"]');
    expect(warn?.querySelector('dt')?.textContent).toBe(strings['buy.shortBy']);
    expect(warn?.querySelector('dd')?.textContent).toBe(cents(320));
    const strip = dialog.querySelector<HTMLElement>('[data-ledger-strip]')!;
    const sentence = strings['buy.short'].replace('{{amount}}', cents(320));
    expect(strip.textContent).toContain(sentence);
    expect(within(strip).getByRole('button', { name: strings.addFunds })).toBeEnabled();
    expect(within(dialog).getAllByRole('button', { name: strings.addFunds })).toHaveLength(1);
    expect(dialog.querySelector('[data-short]')).toBeNull();
    // The strip says what the warn row is: the list is described by it.
    expect(wallet.getAttribute('aria-describedby')).toBe(strip.id);
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toHaveAttribute('aria-disabled', 'true');
  });

  it('every money line of the quote is shown once, in the quote order', async () => {
    const dialog = await openBuy('wallet-short');
    const labels = [...dialog.querySelectorAll('dl[aria-label] dt')]
      .map((d) => d.textContent ?? '')
      .filter((l) => [strings['co.plan'], strings['buy.chargeNow'], strings['buy.wallet'], strings['buy.referral']].includes(l));
    expect(labels.slice(0, 3)).toEqual([strings['co.plan'], strings['buy.chargeNow'], strings['buy.wallet']]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('the other checkouts: their own words', () => {
  it('the plan-gone body is a full sentence, not a lead-in to a list that is not there', () => {
    expect(strings['buy.goneBody']).toBe('Pick another plan from the plans on sale now.');
  });

  it.each([
    ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', 'subs.payConfirm', 'subs.payShort'],
    ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', 'up.confirm', 'up.short'],
  ] as const)('%s: the short line names this payment, not a purchase', async (_kind, path, confirm, key) => {
    const dialog = await open(path, strings[confirm], 'wallet-short');
    const line = dialog.querySelector<HTMLElement>('[data-short]');
    expect(line?.textContent).toContain(strings[key].split('{{amount}}')[1]);
    expect(line?.textContent).not.toContain(strings['buy.short'].split('{{amount}}')[1]);
  });
});

describe('upgrade: back to Choose plan', () => {
  it('a plan picked in Choose plan offers Other plans, which goes back to the choice and sends nothing', async () => {
    resetUnknownCheckouts();
    await renderPage(page, { path: '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01' });
    const dialog = await screen.findByRole('dialog');
    const next = await within(dialog).findByRole('button', { name: strings['co.next'] }, { timeout: 20000 });
    expect(within(dialog).queryByRole('button', { name: strings['up.back'] })).toBeNull();
    await userEvent.click(within(dialog).getAllByRole('radio')[0]!);
    await userEvent.click(next);
    await within(dialog).findByRole('button', { name: strings['up.confirm'] }, { timeout: 20000 });
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['up.back'] }));
    // Back on the choice: nothing went out, and the review's consent did not come along.
    expect(await within(dialog).findByRole('button', { name: strings['co.next'] })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['up.confirm'] })).toBeNull();
    expect(within(dialog).queryByText(strings['up.doneTitle'])).toBeNull();
    await userEvent.click(within(dialog).getAllByRole('radio')[0]!);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['co.next'] }));
    await within(dialog).findByRole('button', { name: strings['up.confirm'] }, { timeout: 20000 });
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
  });

  it('a plan named by the link (a plan card) keeps its frame: no Other plans', async () => {
    const dialog = await open('?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', strings['up.confirm']);
    expect(within(dialog).queryByRole('button', { name: strings['up.back'] })).toBeNull();
  });
});
