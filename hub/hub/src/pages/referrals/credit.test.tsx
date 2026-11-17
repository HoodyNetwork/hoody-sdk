// Vitest: Referral credit as a ledger. Available is the one big amount; On hold, Reversed and Owed are rows of
// the kit Ledger named "Credit details", whose amount is its own cell (end-aligned, tabular numerals), each the API's
// string as usdText shows it, never computed. The hold and refund hint stays visible with the release day in On hold's
// note. Withdrawal is a fact under the ledger (a Referrer) or the section's Withdraw… action (a Creator).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const ledger = async (state?: string) => {
  await renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
  await screen.findByText(strings['credit.available'], undefined, { timeout: T });
  return document.querySelector(`dl[aria-label="${strings['credit.ledger']}"]`) as HTMLElement;
};
const row = (dl: HTMLElement, term: string) => within(dl).getByText(term, { selector: 'dt' }).parentElement as HTMLElement;
const amountOf = (r: HTMLElement) => r.querySelector('dd') as HTMLElement;

describe('Referral credit ledger', () => {
  it('Available is the one big amount; On hold and Reversed are rows whose first cell is the API amount', async () => {
    const dl = await ledger();
    expect(dl).toBeTruthy();
    expect(screen.getByText('$12.40')).toBeInTheDocument();
    expect(amountOf(row(dl, strings['credit.pending']))).toHaveTextContent(/^\$8\.00$/);
    expect(amountOf(row(dl, strings['credit.reversed']))).toHaveTextContent(/^\$0\.00$/);
    // each amount is a cell of its own: the row's first dd holds the amount and nothing else
    for (const t of [strings['credit.pending'], strings['credit.reversed']]) expect(amountOf(row(dl, t)).textContent).toMatch(/^\$\d+\.\d\d$/);
    expect(within(dl).queryByText(strings['credit.owed'], { selector: 'dt' })).toBeNull();
  });

  it('a release day: the date, the hold and refund hint, and the "Why credit is held" FAQ peek, all under On hold', async () => {
    const dl = await ledger();
    const hold = row(dl, strings['credit.pending']);
    expect(within(hold).getByText('Next credit due 3 Dec')).toBeInTheDocument();
    expect(within(hold).getByText(strings['credit.releaseNote'], { exact: false })).toBeInTheDocument();
    expect(within(hold).getByText(strings['credit.holdWhy'])).toBeInTheDocument();
  });

  it('on hold without a release date: no date line, but the hold and refund hint and its FAQ peek stay', async () => {
    const dl = await ledger('heldNoDate');
    const hold = row(dl, strings['credit.pending']);
    expect(amountOf(hold)).toHaveTextContent(/^\$8\.00$/);
    expect(within(hold).queryByText(/Next credit due/)).toBeNull();
    expect(within(hold).getByText(strings['credit.releaseNote'], { exact: false })).toBeInTheDocument();
    expect(within(hold).getByText(strings['credit.holdWhy'])).toBeInTheDocument();
  });

  // releaseReferrerInTx releases nothing while the account is removed, so its due day is never shown
  // (the removed fixture keeps the member's next_release_at and $8.00 on hold)
  it('a removed account: the amount on hold stays, no due day', async () => {
    const dl = await ledger('removed');
    const hold = row(dl, strings['credit.pending']);
    expect(amountOf(hold)).toHaveTextContent(/^\$8\.00$/);
    expect(within(hold).queryByText(/Next credit due/)).toBeNull();
    // Nothing is released while removed, so no "arrive later" note and no FAQ peek promising it is due;
    // one line says it waits and can still be reversed
    expect(within(hold).getByText(strings['credit.heldRemoved'])).toBeInTheDocument();
    expect(strings['credit.heldRemoved']).toBe("Credit on hold waits while this account can't refer people, and can still be reversed.");
    expect(within(hold).queryByText(strings['credit.releaseNote'], { exact: false })).toBeNull();
    expect(within(hold).queryByText(strings['credit.holdWhy'])).toBeNull();
  });

  it('a member (not removed) never gets the removed hold line', async () => {
    const dl = await ledger();
    expect(within(row(dl, strings['credit.pending'])).queryByText(strings['credit.heldRemoved'])).toBeNull();
  });

  it('nothing on hold and no date: no hint under On hold', async () => {
    const dl = await ledger('noMonthly');
    const hold = row(dl, strings['credit.pending']);
    expect(within(hold).queryByText(strings['credit.releaseNote'], { exact: false })).toBeNull();
    expect(within(hold).queryByText(strings['credit.holdWhy'])).toBeNull();
  });

  it('Available takes its row of the strip (narrow rows) and keeps every digit of the largest amount', async () => {
    await ledger('bigCredit');
    const strip = document.querySelector(`dl[aria-label="${strings['credit.title']}"]`) as HTMLElement;
    expect(strip).toHaveAttribute('data-narrow', 'rows');
    expect(within(strip).getByText('$9,999,999,999,999.99')).toBeInTheDocument();
  });

  it('Available is muted at $0.00 and full colour above it', async () => {
    await ledger('owed');
    const zero = document.querySelector(`dl[aria-label="${strings['credit.title']}"]`) as HTMLElement;
    expect(within(zero).getByText('$0.00').className).toContain('muted');
  });

  it('Available above $0.00 is not muted', async () => {
    await ledger();
    const strip = document.querySelector(`dl[aria-label="${strings['credit.title']}"]`) as HTMLElement;
    expect(within(strip).getByText('$12.40').className).not.toContain('muted');
  });

  it('owed above 0: an Owed row with its amount and note', async () => {
    const dl = await ledger('owed');
    const owed = row(dl, strings['credit.owed']);
    expect(amountOf(owed)).toHaveTextContent(/^\$3\.00$/);
    expect(within(owed).getByText(strings['credit.owedNote'])).toBeInTheDocument();
  });

  it('a level the API did not name: the Withdrawal line says it is not known, never "You\'re a Referrer"', async () => {
    await ledger('unknownLevel');
    const w = within(document.getElementById('referral-credit') as HTMLElement).getByText(strings['withdraw.label'], { selector: 'dt' }).parentElement as HTMLElement;
    expect(within(w).getByText(strings['withdraw.lineUnknown'], { exact: false })).toBeInTheDocument();
    expect(within(w).queryByText(strings['withdraw.line'], { exact: false })).toBeNull();
    expect(within(w).queryByRole('button', { name: strings['withdraw.action'] })).toBeNull();
  });
});
