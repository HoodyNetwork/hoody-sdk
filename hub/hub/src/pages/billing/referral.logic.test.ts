// Vitest: what a server purchase can spend, as the Hub counts it. The
// server spends Referral credit first, then the general wallet (the API's spendable amount is
// serverSpendableCents = reward + balance). spendOf reads the balances answer only: what is owed is never added and
// never subtracted, and the pending credit of the Referrals page is never read. A missing or malformed Referral credit
// counts as 0 (it only ever under-promises, never a guessed amount, C9); an unreadable general balance stays unknown
// whatever Referral credit says.
import { describe, expect, it } from 'vitest';
import { type CheckoutQuote, shortfall } from './checkout-logic';
import type { Balance } from './data';
import { spendOf } from './logic';

const bal = (general: string, referral: string | null = null, owed: string | null = null): Balance => ({ general, referral, owed });

const quote = (chargeCents: number, balanceCents: number | null): CheckoutQuote => ({
  chargeCents,
  balanceCents,
  lines: [],
  notes: [],
  blocked: null,
  warnings: [],
});

describe('spendOf (what a server purchase can spend)', () => {
  it('referral_credit_covers_charge: general 5.00 + Referral credit 10.00 covers a 12.00 charge', () => {
    const m = spendOf(bal('5.00', '10.00', '0.00'));
    expect(m).toEqual({ generalCents: 500, referralCents: 1000, spendableCents: 1500 });
    expect(shortfall(quote(1200, m.spendableCents))).toBe(0);
  });

  it('partial_shortfall_uses_sum: general 5.00 + Referral credit 4.00 on a 12.00 charge is short by 3.00', () => {
    const m = spendOf(bal('5.00', '4.00', '0.00'));
    expect(m).toEqual({ generalCents: 500, referralCents: 400, spendableCents: 900 });
    expect(shortfall(quote(1200, m.spendableCents))).toBe(300);
  });

  it('owed_never_changes_spendable: the same balances with and without owed spend the same', () => {
    expect(spendOf(bal('5.00', '2.00', '3.00'))).toEqual(spendOf(bal('5.00', '2.00', '0.00')));
    expect(spendOf(bal('5.00', '2.00', '3.00')).spendableCents).toBe(700);
    // Owed above the credit is still not subtracted (a mutation case).
    expect(spendOf(bal('5.00', '0.00', '3.00')).spendableCents).toBe(500);
  });

  it('missing_referral_counts_zero: no referral field reads as the general balance alone', () => {
    expect(spendOf(bal('5.00'))).toEqual({ generalCents: 500, referralCents: 0, spendableCents: 500 });
    expect(spendOf(bal('5.00', null, '3.00')).spendableCents).toBe(500);
  });

  it('malformed_referral_counts_zero: a referral value that is not a D.CC amount counts 0, never a guess', () => {
    for (const v of ['abc', '12.5', '-1', '-1.00', '1e3', ' 1.00', '']) {
      expect(spendOf(bal('5.00', v)), v).toEqual({ generalCents: 500, referralCents: 0, spendableCents: 500 });
    }
    // A number where a string belongs (the select keeps only strings; spendOf still reads it as 0).
    expect(spendOf(bal('5.00', 12 as unknown as string)).referralCents).toBe(0);
  });

  it('largest_amounts_stay_exact: 13 dollar digits on both sides add up exactly; a 14-digit amount is refused', () => {
    const top = '9999999999999.99';
    const m = spendOf(bal(top, top));
    expect(m).toEqual({ generalCents: 999999999999999, referralCents: 999999999999999, spendableCents: 1999999999999998 });
    expect(Number.isSafeInteger(m.spendableCents)).toBe(true);
    // One digit more is not an amount the API sends: Referral credit counts 0, the general balance is unknown.
    expect(spendOf(bal('5.00', '10000000000000.00')).referralCents).toBe(0);
    expect(spendOf(bal('10000000000000.00', '1.00')).spendableCents).toBeNull();
  });

  it('unreadable_general_stays_unknown:an unreadable general balance is unknown whatever Referral credit says', () => {
    expect(spendOf(bal('', '10.00', '0.00'))).toEqual({ generalCents: null, referralCents: 1000, spendableCents: null });
    expect(spendOf(bal('abc', '10.00')).spendableCents).toBeNull();
    expect(spendOf(undefined)).toEqual({ generalCents: null, referralCents: 0, spendableCents: null });
  });

  it('pending_credit_never_spendable: spendOf reads only the balances answer, never the Referrals credit', () => {
    // A balances object carrying extra fields (as if Referrals' credit.pending leaked in) spends the same.
    const extra = { ...bal('5.00', '1.00'), pending: '50.00', credit: { pending: '50.00', available: '9.00' } } as unknown as Balance;
    expect(spendOf(extra)).toEqual(spendOf(bal('5.00', '1.00')));
  });

  it('zero everywhere is a known 0, not unknown', () => {
    expect(spendOf(bal('0.00', '0.00', '0.00'))).toEqual({ generalCents: 0, referralCents: 0, spendableCents: 0 });
  });
});
