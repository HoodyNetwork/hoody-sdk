// Vitest: safety checks of the market page (order summary words, suspended reads).
import { describe, expect, it } from 'vitest';
import { anySuspended } from './data';
import { splitTerm, type Term } from './logic';

const term = (priceCents: number | null, feeCents: number | null, totalCents: number): Term => ({ days: 30, priceCents, feeCents, totalCents, holdDays: null }) as Term;

describe('order summary parts', () => {
  it('shows the setup fee a stock total includes', () => {
    expect(splitTerm(term(1200, null, 3700))).toEqual({ rental: 1200, setup: 2500 });
  });
  it('derives the rental when only the setup fee is given', () => {
    expect(splitTerm(term(null, 2500, 3700))).toEqual({ rental: 1200, setup: 2500 });
  });
  it('keeps a given split and shows nothing it cannot know', () => {
    expect(splitTerm(term(1200, 2500, 3700))).toEqual({ rental: 1200, setup: 2500 });
    expect(splitTerm(term(1200, null, 1200))).toEqual({ rental: 1200, setup: null });
    expect(splitTerm(term(null, null, 3700))).toEqual({ rental: null, setup: null });
  });
});

describe('a suspended account', () => {
  it('is told by any read that answers 403 ACCOUNT_BANNED', () => {
    expect(anySuspended(null, { status: 403, code: 'ACCOUNT_BANNED' })).toBe(true);
    expect(anySuspended(null, { status: 403, code: 'FORBIDDEN' }, undefined)).toBe(false);
    expect(anySuspended()).toBe(false);
  });
});
