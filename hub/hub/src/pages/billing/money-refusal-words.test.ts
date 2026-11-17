// What a refusal after Confirm says about the money and the next try. A rate-limit answer may name its own wait, so the
// words promise no fixed time; the requote band appears only after a definite refusal, so it says nothing was charged;
// a top-up the page stopped tracking points to a way to tell whether THAT payment was credited, not to the balance alone.
import { describe, expect, it } from 'vitest';
import { checkoutReducer, initialCheckout, type CheckoutEvent, type CheckoutQuote } from './checkout-logic';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const quote = (o: Partial<CheckoutQuote> = {}): CheckoutQuote => ({ chargeCents: 1200, lines: [], balanceCents: 4250, notes: [], blocked: null, warnings: [], ...o });
const run = (events: CheckoutEvent[]) => events.reduce(checkoutReducer, initialCheckout);

describe('money words after Confirm', () => {
  it('a rate-limited purchase promises no fixed wait', () => {
    for (const k of ['buy.rateLimited', 'mkt.tooMany']) {
      expect(S[k], k).toMatch(/nothing was charged/i);
      expect(S[k], k).not.toMatch(/in a minute|\d+\s*(second|minute)s?/i);
    }
  });

  it('the requote band comes only from a definite refusal, and says nothing was charged', () => {
    expect(S['co.requoted']).toMatch(/nothing was charged/i);
    const posting = run([{ type: 'quoted', quote: quote() }, { type: 'consent', on: true }, { type: 'confirmed' }]);
    // A new quote alone (no send refused) never raises the band.
    expect(run([{ type: 'quoted', quote: quote() }, { type: 'quoted', quote: quote({ chargeCents: 1500 }) }]).requote).toBeNull();
    expect([{ type: 'refused', word: { k: 'buy.priceChanged' }, requote: 1400 } as CheckoutEvent].reduce(checkoutReducer, posting).requote).toBe(1400);
  });

  it('a top-up no longer tracked names a way to tell whether that payment was credited', () => {
    for (const k of ['top.forgetBody', 'top.resolved', 'faq.stopTracking.a']) expect(S[k], k).toMatch(/ask support whether (it|a payment) was credited/i);
  });
});
