// Words for market values: strings go through t(), the formatting rules stay in logic.ts.
import { type Translate } from '@kit';
import { listingRules } from '@core';
import { type Delivery, type Term, money } from '../logic';
import type strings from '../strings.en.json';

export type T = Translate<typeof strings>;

/** A country's name in English, falling back to its code (core's, shared with the listing facts). */
export const countryName = listingRules.countryName;

export function deliveryText(t: T, d: Delivery): string {
  switch (d.k) {
    case 'now':
      // The stock rail's delivery: instant, with the promise the footnote explains (core's one wording).
      return listingRules.instantPromise.label;
    case 'hours':
      return t('delivery.hours', { n: d.n });
    case 'days':
      return t('delivery.days', { n: d.n });
    default:
      return t('delivery.unknown');
  }
}

/** A row's price: its cheapest first payment and the term it buys ("$27.99 for 7 days"). It is a one-time payment (setup
 *  included, renewals differ), never a rate, and a short term never reads as the toolbar's "from … /month". */
export const priceText = (t: T, term: Pick<Term, 'totalCents' | 'days'> | null): string =>
  (term === null ? t('price.none') : t('price.term', { amount: money(term.totalCents), count: term.days }));

/** "in 3 days", "2 days late", "any moment": the promised date in relative words (the absolute date goes in a tooltip). */
export function readyText(t: T, readyBy: number | null, now: number): { text: string; late: boolean } {
  if (readyBy === null) return { text: t('res.dash'), late: false };
  const diff = readyBy - now;
  const late = diff < 0;
  const hours = Math.round(Math.abs(diff) / 3600000);
  if (hours < 1) return { text: late ? t('res.late.hours', { count: 1 }) : t('res.soon'), late };
  if (hours < 48) return { text: late ? t('res.late.hours', { count: hours }) : t('res.in.hours', { count: hours }), late };
  const days = Math.round(hours / 24);
  return { text: late ? t('res.late.days', { count: days }) : t('res.in.days', { count: days }), late };
}
