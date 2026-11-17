// Vitest: the Bare metal view's logic (the Bare metal view under Plans & billing).
import { describe, expect, it } from 'vitest';
import { countryFlag } from '@kit';
import { listings, reservations } from './fixtures';
import { bareFromCents, delivery, fromDollars, fromTerm, money, overdue, shortfall, termFor, type Term } from './logic';

describe('bare metal logic', () => {
  it('prices from the cheapest first payment', () => {
    expect(fromTerm(listings[2]!)?.totalCents).toBe(22800);
    expect(fromTerm({ terms: [] })).toBeNull();
    expect(fromDollars(listings[2]!)).toBe(228);
    expect(fromDollars({ terms: [] })).toBeNull();
  });
  it('the price filter value keeps the cents: $9.99 is under 10 and $10.49 is over it', () => {
    const at = (totalCents: number) => fromDollars({ terms: [{ ...fromTerm(listings[2]!)!, totalCents }] });
    expect(at(999)).toBe(9.99);
    expect(at(999)!).toBeLessThan(10);
    expect(at(1049)).toBe(10.49);
    expect(at(1049)!).toBeGreaterThan(10);
    expect(at(1000)).toBe(10);
  });
  it('picks the term by days, else the shortest', () => {
    expect(termFor(listings[0]!, '90')?.days).toBe(90);
    expect(termFor(listings[0]!, 'x')?.days).toBe(30);
    expect(termFor({ terms: [] }, '30')).toBeNull();
  });
  it('words for money, delivery, flags and balance', () => {
    expect(money(3900)).toBe('$39');
    expect(money(3950)).toBe('$39.50');
    expect(delivery(0)).toEqual({ k: 'now' });
    expect(delivery(72)).toEqual({ k: 'days', n: 3 });
    expect(delivery(null)).toEqual({ k: 'unknown' });
    expect(countryFlag('DE')).not.toBe('');
    expect(countryFlag('xx1')).toBe('');
    expect(shortfall(1000, 2500)).toEqual({ ok: false, shortBy: 1500 });
    expect(shortfall(null, 2500)).toBeNull();
  });
  it('marks only pending reservations past their date overdue', () => {
    const now = Date.now();
    expect(reservations.filter((r) => overdue(r, now)).map((r) => r.id)).toEqual(['r02']);
  });
});

describe('bareFromCents', () => {
  const term = (days: number, priceCents: number | null, totalCents = priceCents ?? 0): Term => ({ days, priceCents, feeCents: null, totalCents, holdDays: null });
  it('is the cheapest 30-day rental of a buyable listing, never a setup fee or another term', () => {
    expect(bareFromCents([{ terms: [term(30, 3900), term(90, 9000)] }, { terms: [term(30, 2900, 4900)] }, { terms: [] }])).toBe(2900);
  });
  it('is null when no listing is priced by the month', () => {
    expect(bareFromCents([{ terms: [term(90, 9000)] }, { terms: [term(30, null, 100)] }, { terms: [] }])).toBeNull();
    expect(bareFromCents([])).toBeNull();
  });
});
