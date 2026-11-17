// Vitest: the rent / reserve order lines in Checkout split the first payment the way the server inspector does
// (servers/logic.ts splitTerm). A stock tier carries no setup fee of its own: its setup is the total less the rental, and a
// part that cannot be derived is left out, never shown as $0.00.
import { describe, expect, it } from 'vitest';
import type { commerceRules } from '@core';
import { purchaseQuote, type QuoteEnv } from './checkout-live';

const env: QuoteEnv = { generalCents: 100_000, referralCents: 0, spendableCents: 100_000, server: 'n12' };

const stock = (tier: Record<string, string>) =>
  ({ kind: 'stock', seq: 1, id: 'mkt_sin_m', name: 'Singapore M', days: ['30'], maps: { tiers: { '30': { hold_days: 3, ...tier } } } }) as unknown as commerceRules.MarketRow;

const order = (row: commerceRules.MarketRow) =>
  purchaseQuote(row, '30', env)!.lines.filter((l) => l.label.startsWith('mkt.')).map((l) => `${l.label}=${l.cents}`);

describe('purchaseQuote: the order lines', () => {
  it('stock: a total above the rental shows the difference as the setup fee', () => {
    expect(order(stock({ price: '12.00', total_first_payment: '37.00' }))).toEqual(['mkt.bdRental=1200', 'mkt.bdSetup=2500', 'mkt.bdTotal=3700']);
  });

  it('stock with no rental price: neither part is shown, only the total', () => {
    expect(order(stock({ total_first_payment: '37.00' }))).toEqual(['mkt.bdTotal=3700']);
  });

  it('offer: its own fee is the setup line', () => {
    const offer = {
      kind: 'offer', seq: 1, id: 'mkt_sin_m', name: 'Singapore M', days: ['30'],
      maps: { pricing: { '30': 9000 }, hold: { '30': 3 }, feeCents: 2000 },
    } as unknown as commerceRules.MarketRow;
    expect(order(offer)).toEqual(['mkt.bdRental=9000', 'mkt.bdSetup=2000', 'mkt.bdTotal=11000']);
  });
});
