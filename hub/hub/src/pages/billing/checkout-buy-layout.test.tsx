// Vitest: Buy a plan's layout (the plan, its price and the review body in the drawer's zones). The money
// flow is untouched (confirmGate, the consent, the requests); these pin only where each fact now sits:
// - no fake wizard: the subtitle names the plan and its price, never "1 Review 2 Confirm";
// - the blocked Band sits above What you get, not between the specs and the price;
// - a disabled Confirm says why in the footer, as visible text, the first failing gate in confirmGate's order, unless
//   a Band already says it (the footer never repeats a Band's fact); the reasoned Confirm is described by it either way;
// - blocked and short at once keep both facts (the blocked Band, the shortfall with Add funds), each once.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { type CheckoutQuote, type CheckoutState, confirmReason, initialCheckout, planInSubtitle } from './checkout-logic';
import { resetUnknownCheckouts } from './data';
import { cents } from './logic';
import page from './page';
import strings from './strings.en.json';

const BUY = '/billing?checkout=buy&plan=fam-plus';

async function openBuy(state?: string) {
  resetUnknownCheckouts();
  await renderPage(page, { state, path: BUY });
  const dialog = await screen.findByRole('dialog');
  const confirm = await within(dialog).findByRole('button', { name: strings['buy.confirm'] }, { timeout: 20000 });
  return { dialog, confirm };
}

/** Confirm as drawn now: the reasoned one (aria-disabled, no action) and the real one are different elements. */
const confirmNow = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: strings['buy.confirm'] });
/** The ids of the words a screen reader hears with Confirm. */
const describedIds = (dialog: HTMLElement) => (confirmNow(dialog).getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
/** The words a screen reader hears with Confirm. */
const described = (dialog: HTMLElement) => describedIds(dialog).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
/** Where `text` is shown: every element with it, but the reasoned Confirm's own description (not drawn; it is spoken). */
const shownText = (dialog: HTMLElement, text: string) => within(dialog).queryAllByText(text).filter((el) => !describedIds(dialog).includes(el.id));
/** The footer's visible text: without the reasoned Confirm's description. */
const footText = (dialog: HTMLElement) => {
  const foot = dialog.querySelector('footer')!.cloneNode(true) as HTMLElement;
  for (const id of describedIds(dialog)) foot.querySelector(`#${CSS.escape(id)}`)?.remove();
  return foot.textContent ?? '';
};
/** The footer's reason line, when it is drawn. */
const footLine = (dialog: HTMLElement) => dialog.querySelector('footer #billing-checkout-reason');

const quote = (o: Partial<CheckoutQuote> = {}): CheckoutQuote => ({
  chargeCents: 2500,
  balanceCents: 4000,
  blocked: null,
  warnings: [],
  notes: [],
  lines: [{ label: 'co.plan', cents: 2500 }],
  ...o,
});
const review = (q: CheckoutQuote, consent = false): CheckoutState => ({ ...initialCheckout, phase: 'review', quote: q, consent });

describe('confirmReason: the footer reason, in confirmGate order, banned first', () => {
  it('suspended comes before everything else', () => {
    expect(confirmReason(review(quote({ blocked: { k: 'buy.noRoom' } })), true)).toEqual({ k: 'mkt.suspended' });
  });
  it('while quoting there is no reason line', () => {
    expect(confirmReason({ ...initialCheckout, phase: 'quoting' }, false)).toBeNull();
  });
  it('blocked says the blocked word itself, before the balance, the shortfall and the consent', () => {
    expect(confirmReason(review(quote({ blocked: { k: 'buy.limit', v: { max: 3 } }, balanceCents: 100 })), false)).toEqual({ k: 'buy.limit', v: { max: 3 } });
  });
  it('an unreadable balance comes next', () => {
    expect(confirmReason(review(quote({ balanceCents: null })), false)).toEqual({ k: 'mkt.balanceUnavailable' });
  });
  it('a shortfall names the gate number (charge minus balance)', () => {
    expect(confirmReason(review(quote({ balanceCents: 1820 }), true), false)).toEqual({ k: 'buy.short', v: { amount: cents(680) } });
  });
  it('the consent comes last', () => {
    expect(confirmReason(review(quote()), false)).toEqual({ k: 'consent' });
  });
  it('nothing when Confirm can act', () => {
    expect(confirmReason(review(quote(), true), false)).toBeNull();
  });
});

describe('planInSubtitle: the plan and its price on every step that shows the review body', () => {
  it('buy: review, quoting, posting and reconciling', () => {
    for (const p of ['review', 'quoting', 'posting', 'reconciling'] as const) expect(planInSubtitle('buy', p)).toBe(true);
  });
  it('buy after the send has an outcome, and every other kind, keep their own subtitle', () => {
    for (const p of ['checking', 'unknown', 'done', 'already', 'failed', 'not_found', 'banned', 'quote_error'] as const) expect(planInSubtitle('buy', p)).toBe(false);
    for (const k of ['pay', 'upgrade', 'rent', 'reserve'] as const) expect(planInSubtitle(k, 'review')).toBe(false);
  });
});

describe('Buy a plan drawer', () => {
  it('has no fake wizard: the subtitle names the plan and its price', async () => {
    const { dialog } = await openBuy();
    expect(dialog.querySelector('[aria-current="step"]')).toBeNull();
    expect(within(dialog).queryByText(strings['co.steps.confirm'])).toBeNull();
    const per = strings['buy.perMonth'].split('{{')[0] ?? '';
    const sub = within(dialog).getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes(' · ') && (el.textContent ?? '').includes(per.trim() || '$'));
    expect(sub).toBeInTheDocument();
  });

  it('a disabled Confirm says why in the footer, and the reason follows the gate', async () => {
    const { dialog } = await openBuy();
    expect(confirmNow(dialog)).toHaveAttribute('aria-disabled', 'true');
    expect(footLine(dialog)?.textContent).toBe(strings.consent);
    expect(shownText(dialog, strings.consent)).toEqual([footLine(dialog)]);
    expect(described(dialog)).toContain(strings.consent);
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(confirmNow(dialog)).toBeEnabled();
    expect(confirmNow(dialog)).not.toHaveAttribute('aria-disabled');
    expect(within(dialog).queryByText(strings.consent)).toBeNull();
  });

  it('blocked: the Band sits above What you get, and the footer leaves its word to it', async () => {
    const { dialog } = await openBuy('quote-noroom');
    expect(confirmNow(dialog)).toHaveAttribute('aria-disabled', 'true');
    const [band, ...more] = shownText(dialog, strings['buy.noRoom']);
    expect(more).toHaveLength(0);
    expect(band!.closest('footer')).toBeNull();
    expect(footText(dialog)).not.toContain(strings['buy.noRoom']);
    expect(footLine(dialog)).toBeNull();
    // Confirm still says it to a screen reader, with its name.
    expect(described(dialog)).toContain(strings['buy.noRoom']);
    const facts = within(dialog).getByRole('group', { name: strings['co.whatYouGet'] });
    expect(band!.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('short: the shortfall line beside Add funds says it once, the footer does not repeat it', async () => {
    const { dialog } = await openBuy('wallet-short');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(confirmNow(dialog)).toHaveAttribute('aria-disabled', 'true');
    const short = strings['buy.short'].replace('{{amount}}', cents(320));
    expect(shownText(dialog, short)).toHaveLength(1);
    expect(shownText(dialog, short)[0]!.closest('footer')).toBeNull();
    expect(footText(dialog)).not.toContain(short);
    expect(footLine(dialog)).toBeNull();
    expect(described(dialog)).toContain(short);
  });

  it('blocked and short at once keep both facts', async () => {
    const { dialog } = await openBuy('quote-noroom-short');
    expect(confirmNow(dialog)).toHaveAttribute('aria-disabled', 'true');
    expect(shownText(dialog, strings['buy.noRoom'])).toHaveLength(1);
    expect(shownText(dialog, strings['buy.noRoom'])[0]!.closest('footer')).toBeNull();
    expect(footText(dialog)).not.toContain(strings['buy.noRoom']);
    const short = strings['buy.short'].replace('{{amount}}', cents(320));
    expect(shownText(dialog, short)).toHaveLength(1);
    expect(shownText(dialog, short)[0]!.closest('footer')).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: strings.addFunds }).length).toBeGreaterThan(0);
  });
});
