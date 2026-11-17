// Vitest: every Checkout quote builder spends general + Referral credit. The drawer tests
// cover buy and reserve end to end; this pins each branch of the two builders (buy, pay, upgrade; rent, reserve and
// the server's re-quote), so no kind can fall back to the general wallet alone.
import { describe, expect, it } from 'vitest';
import type { commerce, commerceRules } from '@core';
import { attemptQuote, purchaseQuote, type QuoteEnv } from './checkout-live';
import { shortfall } from './checkout-logic';

const env = (generalCents: number | null, referralCents: number): QuoteEnv => ({
  generalCents,
  referralCents,
  spendableCents: generalCents === null ? null : generalCents + referralCents,
  server: 'n12',
});

const attempt = { charge_cents: 1200, price_cents_per_month: 1200 } as unknown as commerce.AttemptQuote;

const row = (kind: 'stock' | 'offer') =>
  ({
    kind,
    seq: 1,
    id: 'mkt_sin_m',
    name: 'Singapore M',
    days: ['30'],
    maps:
      kind === 'offer'
        ? { pricing: { '30': 9000 }, hold: { '30': 3 }, feeCents: 2000 }
        : { tiers: { '30': { price: '10.00', total_first_payment: '12.00', hold_days: 3 } } },
  }) as unknown as commerceRules.MarketRow;

const labels = (q: { lines: { label: string; cents: number | null }[] }) => q.lines.map((l) => `${l.label}=${l.cents}`);

describe('attemptQuote: buy, pay and upgrade spend general + Referral credit', () => {
  for (const kind of ['buy', 'pay', 'upgrade'] as const) {
    it(`${kind}: general 5.00 + Referral credit 4.00 on 12.00 is short by 3.00, both lines shown`, () => {
      const q = attemptQuote(kind, attempt, env(500, 400));
      expect(q.balanceCents).toBe(900);
      expect(shortfall(q)).toBe(300);
      expect(labels(q)).toEqual(expect.arrayContaining(['buy.wallet=500', 'buy.referral=400']));
    });
    it(`${kind}: Referral credit that covers the charge leaves nothing short`, () => {
      expect(shortfall(attemptQuote(kind, attempt, env(500, 1000)))).toBe(0);
    });
    it(`${kind}: an unreadable general wallet is unknown whatever Referral credit says`, () => {
      const q = attemptQuote(kind, attempt, env(null, 1000));
      expect(q.balanceCents).toBeNull();
      expect(labels(q).some((l) => l.startsWith('buy.wallet') || l.startsWith('buy.referral'))).toBe(false);
    });
  }
  it('no Referral credit: only the wallet line', () => {
    expect(labels(attemptQuote('pay', attempt, env(500, 0))).filter((l) => l.startsWith('buy.'))).toEqual(['buy.chargeNow=1200', 'buy.wallet=500']);
  });
});

describe('purchaseQuote: rent, reserve and the re-quote spend general + Referral credit', () => {
  it('rent (stock): total 12.00 against 5.00 + 4.00 is short by 3.00', () => {
    const q = purchaseQuote(row('stock'), '30', env(500, 400))!;
    expect(q.chargeCents).toBe(1200);
    expect(q.balanceCents).toBe(900);
    expect(shortfall(q)).toBe(300);
    expect(labels(q)).toEqual(expect.arrayContaining(['buy.wallet=500', 'buy.referral=400']));
  });
  it('reserve (offer): rental 90.00 + setup 20.00 against 60.00 + 40.00 is short by 10.00', () => {
    const q = purchaseQuote(row('offer'), '30', env(6000, 4000))!;
    expect(q.chargeCents).toBe(11000);
    expect(shortfall(q)).toBe(1000);
  });
  for (const kind of ['stock', 'offer'] as const) {
    it(`re-quote (${kind}): the server's new total is compared with general + Referral credit`, () => {
      const q = purchaseQuote(row(kind), '30', env(6000, 4000), { days: '30', totalCents: 10500 })!;
      expect(q.chargeCents).toBe(10500);
      expect(q.balanceCents).toBe(10000);
      expect(shortfall(q)).toBe(500);
      expect(labels(q)).toEqual(['mkt.bdTotal=10500', 'buy.wallet=6000', 'buy.referral=4000']);
    });
  }
  it('an unreadable general wallet is unknown whatever Referral credit says', () => {
    expect(purchaseQuote(row('stock'), '30', env(null, 4000))!.balanceCents).toBeNull();
  });
});
