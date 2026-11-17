import { attemptQuote } from './checkout-live';
// Vitest: the Checkout drawer's state machine. C9: a send whose outcome is unknown is never resent, only read back.
import { describe, expect, it } from 'vitest';
import {
  backToReview,
  canClose,
  checkoutReducer,
  confirmGate,
  initialCheckout,
  isUnknown,
  shortfall,
  type CheckoutEvent,
  type CheckoutQuote,
  type CheckoutResult,
  type CheckoutState,
} from './checkout-logic';

const quote = (o: Partial<CheckoutQuote> = {}): CheckoutQuote => ({
  chargeCents: 1200,
  lines: [],
  balanceCents: 4250,
  notes: [],
  blocked: null,
  warnings: [],
  ...o,
});
const result = (o: Partial<CheckoutResult> = {}): CheckoutResult => ({
  chargedCents: 1200,
  at: '2026-10-23T00:00:00Z',
  replayed: false,
  setupFailed: false,
  until: null,
  readyBy: null,
  ref: null,
  ...o,
});
const run = (events: CheckoutEvent[], from: CheckoutState = initialCheckout) => events.reduce(checkoutReducer, from);
const review = (o?: Partial<CheckoutQuote>) => run([{ type: 'quoted', quote: quote(o) }]);
const posting = () => run([{ type: 'consent', on: true }, { type: 'confirmed' }], review());
const unknown = () => run([{ type: 'unknown', retryIn: 3 }], posting());

// Consent given on one price never carries over to another. After a refusal the review
// shows the old quote while the new one is read; a box ticked then must be ticked again once the money changes.
describe('consent follows the price it was given on', () => {
  it('a CHARGE_EXCEEDS_MAX refusal, consent ticked on the old quote, a higher quote arrives: consent is cleared, Confirm gated', () => {
    const refused = run([{ type: 'refused', word: { k: 'buy.priceChanged' } }], posting());
    const ticked = run([{ type: 'consent', on: true }], refused);
    expect(ticked.consent).toBe(true);
    const requoted = run([{ type: 'quoted', quote: quote({ chargeCents: 1500 }) }], ticked);
    expect(requoted).toMatchObject({ phase: 'review', consent: false });
    expect(requoted.quote?.chargeCents).toBe(1500);
    expect(confirmGate(requoted).ok).toBe(false);
    expect(run([{ type: 'confirmed' }], requoted).phase).toBe('review');
  });
  it('a new quote whose lines change (same total) clears consent too', () => {
    const ticked = run([{ type: 'consent', on: true }], review({ lines: [{ label: 'mkt.bdTotal', cents: 1000 }] }));
    expect(run([{ type: 'quoted', quote: quote({ lines: [{ label: 'mkt.bdTotal', cents: 1100 }] }) }], ticked).consent).toBe(false);
  });
  it('a re-read of the same price (only the balance moved) keeps consent', () => {
    const ticked = run([{ type: 'consent', on: true }], review());
    expect(run([{ type: 'quoted', quote: quote({ balanceCents: 9999 }) }], ticked).consent).toBe(true);
  });
  // The real builder puts the wallet balances in the lines; a balance re-read keeps consent.
  it('a balance re-read through the real quote builder (wallet + Referral credit rows) keeps consent', () => {
    const q = { charge_cents: 1200, price_cents_per_month: 1200 } as never;
    const env = (g: number, r: number) => ({ generalCents: g, referralCents: r, spendableCents: g + r, server: 's' });
    const ticked = run([{ type: 'consent', on: true }], run([{ type: 'quoted', quote: attemptQuote('buy', q, env(5000, 300)) }]));
    expect(run([{ type: 'quoted', quote: attemptQuote('buy', q, env(6000, 200)) }], ticked).consent).toBe(true);
  });
  // The same price for another purchase (a family link resolved to a new plan version) asks again.
  it('a same-price quote for another purchase (subject) clears consent', () => {
    const ticked = run([{ type: 'consent', on: true }], review({ subject: 'buy:planA:' }));
    expect(run([{ type: 'quoted', quote: quote({ subject: 'buy:planB:' }) }], ticked).consent).toBe(false);
    expect(run([{ type: 'quoted', quote: quote({ subject: 'buy:planA:' }) }], ticked).consent).toBe(true);
  });
});

describe('the review', () => {
  it('opens on the quote with consent off', () => {
    const s = review();
    expect(s.phase).toBe('review');
    expect(s.consent).toBe(false);
  });
  it('does not confirm without consent, with a shortfall, a block or an unreadable balance', () => {
    expect(confirmGate(review())).toEqual({ ok: false, reason: 'consent' });
    expect(confirmGate(run([{ type: 'consent', on: true }], review()))).toEqual({ ok: true });
    expect(confirmGate(run([{ type: 'consent', on: true }], review({ balanceCents: 880 })))).toEqual({ ok: false, reason: 'short' });
    expect(confirmGate(run([{ type: 'consent', on: true }], review({ blocked: { k: 'buy.noRoom' } })))).toEqual({ ok: false, reason: 'blocked' });
    expect(confirmGate(run([{ type: 'consent', on: true }], review({ balanceCents: null })))).toEqual({ ok: false, reason: 'balance' });
    expect(run([{ type: 'confirmed' }], review()).phase).toBe('review');
  });
  it('computes the shortfall', () => {
    expect(shortfall(quote({ balanceCents: 880 }))).toBe(320);
    expect(shortfall(quote())).toBe(0);
    expect(shortfall(quote({ balanceCents: null }))).toBe(0);
    expect(shortfall(null)).toBe(0);
  });
});

describe('a charge in flight', () => {
  it('locks the drawer while posting and reconciling, and nowhere else', () => {
    expect(canClose(posting())).toBe(false);
    expect(canClose({ ...posting(), phase: 'reconciling' })).toBe(false);
    for (const phase of ['quoting', 'review', 'unknown', 'done', 'already', 'failed', 'not_found', 'banned'] as const) {
      expect(canClose({ ...initialCheckout, phase })).toBe(true);
    }
  });
  it('keeps the key from the moment of the send', () => {
    expect(posting().keyKept).toBe(true);
  });
  it('shows done only after the answer', () => {
    expect(posting().result).toBeNull();
    const s = run([{ type: 'sent', kind: 'done', result: result() }], posting());
    expect(s.phase).toBe('done');
    expect(s.keyKept).toBe(false);
  });
  it('says "already" for a replay of an earlier request', () => {
    expect(run([{ type: 'sent', kind: 'done', result: result({ replayed: true }) }], posting()).phase).toBe('already');
  });
  it('ignores a late quote while a charge is in flight', () => {
    expect(run([{ type: 'quoted', quote: quote({ chargeCents: 1 }) }], posting()).quote?.chargeCents).toBe(1200);
  });
});

describe('an unknown outcome (C9)', () => {
  it('may have gone through: the key is kept and Confirm is not offered again', () => {
    const s = unknown();
    expect(s.phase).toBe('unknown');
    expect(s.keyKept).toBe(true);
    expect(isUnknown(s)).toBe(true);
    expect(confirmGate(s)).toEqual({ ok: false, reason: 'phase' });
    expect(run([{ type: 'confirmed' }], s).phase).toBe('unknown');
  });
  it('reads back: found shows the result, still unknown stays unknown, not found offers a fresh review', () => {
    const checking = run([{ type: 'checkStarted' }], unknown());
    expect(checking.phase).toBe('checking');
    expect(isUnknown(checking)).toBe(true);
    expect(run([{ type: 'checkFound', kind: 'done', result: result() }], checking).phase).toBe('done');
    const still = run([{ type: 'checkUnknown' }], checking);
    expect(still).toMatchObject({
      phase: 'unknown',
      stillUnknown: true,
      checks: 1,
    });
    const nf = run([{ type: 'checkNotFound' }], checking);
    expect(nf.phase).toBe('not_found');
    const fresh = backToReview(nf);
    expect(fresh).toMatchObject({
      phase: 'review',
      consent: false,
      keyKept: false,
    });
  });
  it('a failed state never goes back to a new purchase from an unknown one', () => {
    expect(run([{ type: 'again' }], unknown()).phase).toBe('unknown');
  });
  it('counts down a reservation retry, and retries with the same key only at zero', () => {
    let s = unknown();
    expect(run([{ type: 'retrying' }], s).phase).toBe('unknown');
    s = run([{ type: 'tick' }, { type: 'tick' }, { type: 'tick' }], s);
    expect(s.retryIn).toBe(0);
    expect(run([{ type: 'retrying' }], s)).toMatchObject({
      phase: 'posting',
      keyKept: true,
    });
  });
});

describe('definitive answers', () => {
  it('a refusal returns to the review with consent off and the key spent', () => {
    const s = run([{ type: 'refused', word: { k: 'buy.priceChanged' }, requote: 1400 }], posting());
    expect(s).toMatchObject({
      phase: 'review',
      consent: false,
      requote: 1400,
      keyKept: false,
    });
  });
  it('a price refusal that carries the new total shows no second notice: the requote band already says it', () => {
    for (const k of ['buy.priceChanged', 'mkt.priceChanged'] as const) {
      expect(run([{ type: 'refused', word: { k }, requote: 1400 }], posting())).toMatchObject({ notice: null, requote: 1400 });
    }
  });
  it('putting the picked plan back clears its consent, requote band and notice, only before an outcome', () => {
    const refused = run([{ type: 'refused', word: { k: 'buy.refused' }, requote: 1400 }], posting());
    expect(run([{ type: 'planCleared' }], refused)).toMatchObject({ phase: 'review', consent: false, requote: null, notice: null });
    const stale = run([{ type: 'marketStale' }], refused);
    expect(run([{ type: 'planCleared' }], stale)).toMatchObject({ phase: 'quoting', requote: null, notice: null });
    const unknown = run([{ type: 'unknown' }], posting());
    expect(run([{ type: 'planCleared' }], unknown)).toBe(unknown);
  });
  it('a refusal keeps its notice when it names no new total, or is not about the price', () => {
    expect(run([{ type: 'refused', word: { k: 'buy.priceChanged' } }], posting())).toMatchObject({ notice: { k: 'buy.priceChanged' }, requote: null });
    expect(run([{ type: 'refused', word: { k: 'buy.refused' }, requote: 1400 }], posting())).toMatchObject({ notice: { k: 'buy.refused' } });
  });
  it('a send that never left the browser keeps the review and the consent', () => {
    const s = run([{ type: 'notSent', word: { k: 'notSent' } }], posting());
    expect(s).toMatchObject({ phase: 'review', consent: true, keyKept: false });
  });
  it('a failure shows its reference, and only then may a new purchase begin', () => {
    const f = run([{ type: 'failed', word: { k: 'buy.refused' }, ref: 'op_9Fq0Lm33zz71' }], posting());
    expect(f.phase).toBe('failed');
    expect(f.failure?.ref).toBe('op_9Fq0Lm33zz71');
    expect(run([{ type: 'again' }], f).phase).toBe('quoting');
  });
  it('a banned account stops at the banned body', () => {
    expect(run([{ type: 'banned' }]).phase).toBe('banned');
  });
});

describe('security fixes', () => {
  const base = {
    ...initialCheckout,
    quote: { chargeCents: 100, lines: [], balanceCents: 500, notes: [], blocked: null, warnings: [] },
    consent: true,
  };
  it('the drawer stays locked while a read-back runs', () => {
    expect(canClose({ ...base, phase: 'checking' })).toBe(false);
  });
  it('a rent that was not found can still be read back', () => {
    const s = checkoutReducer({ ...base, phase: 'not_found', keyKept: true }, { type: 'checkStarted' });
    expect(s.phase).toBe('checking');
  });
});

describe('a suspension that meets an outcome', () => {
  const checking = () => run([{ type: 'checkStarted' }], unknown());
  const notFound = () => run([{ type: 'checkNotFound' }], checking());
  const done = () => run([{ type: 'checkFound', kind: 'done', result: result() }], checking());
  const failed = () => run([{ type: 'failed', word: { k: 'buy.refused' }, ref: null }], posting());

  const already = () => run([{ type: 'checkFound', kind: 'already', result: result() }], checking());
  const banned = () => run([{ type: 'banned' }]);

  it('before anything went through, a suspension stops at the banned body, core holding nothing', () => {
    for (const from of [initialCheckout, { ...initialCheckout, phase: 'quote_error' as const }, review(), failed(), banned()]) {
      const s = run([{ type: 'banned' }], from);
      expect(s.phase).toBe('banned');
      expect(s.suspended).toBe(true);
    }
  });
  it('a posting step core left with nothing sent (no keep) ends at the banned body; one core still holds stays', () => {
    expect(run([{ type: 'banned' }], posting())).toMatchObject({ phase: 'banned', suspended: true });
    expect(run([{ type: 'banned', keep: true }], posting())).toMatchObject({ phase: 'posting', suspended: true });
  });
  it('while core holds a sent purchase (keep), no step is replaced, those before the outcome included', () => {
    for (const from of [initialCheckout, { ...initialCheckout, phase: 'quote_error' as const }, review(), failed(), banned()]) {
      const s = run([{ type: 'banned', keep: true }], from);
      expect(s.phase).toBe(from.phase);
      expect(s.suspended).toBe(true);
    }
  });
  it('an unknown, checking, not-found, read-back or done drawer keeps its outcome and is only marked suspended', () => {
    for (const from of [unknown(), checking(), notFound(), { ...posting(), phase: 'reconciling' as const }, done(), already()]) {
      for (const keep of [false, true]) {
        const s = run([{ type: 'banned', keep }], from);
        expect(s.phase).toBe(from.phase);
        expect(s.suspended).toBe(true);
        expect(s.keyKept).toBe(from.keyKept);
      }
    }
  });
  it('a purchase core still holds keeps the review that is about to reopen on it (keep)', () => {
    const s = run([{ type: 'banned', keep: true }], review());
    expect(s.phase).toBe('review');
    expect(s.suspended).toBe(true);
    expect(run([{ type: 'restore' }], s).phase).toBe('unknown');
  });
  it('a Check again that answers while suspended settles the outcome as usual', () => {
    const s = run([{ type: 'banned', keep: true }], checking());
    expect(run([{ type: 'checkUnknown' }], s)).toMatchObject({ phase: 'unknown', stillUnknown: true, suspended: true });
    expect(run([{ type: 'unknown' }], s)).toMatchObject({ phase: 'unknown', suspended: true });
    expect(run([{ type: 'checkNotFound' }], s)).toMatchObject({ phase: 'not_found', suspended: true });
  });
  it('the unknown resolving while suspended: done keeps the done body; a failure or a refusal ends before the outcome', () => {
    const s = run([{ type: 'banned', keep: true }], checking());
    expect(run([{ type: 'checkFound', kind: 'done', result: result() }], s)).toMatchObject({ phase: 'done', suspended: true });
    const f = run([{ type: 'failed', word: { k: 'buy.refused' }, ref: null }], s);
    expect(f).toMatchObject({ phase: 'failed', suspended: true });
    // Back from posting (a confirmed resend that is refused or not sent): a review, which the drawer shows as banned.
    const p = run([{ type: 'banned', keep: true }], posting());
    expect(run([{ type: 'refused', word: { k: 'buy.refused' } }], p)).toMatchObject({ phase: 'review', suspended: true });
    expect(run([{ type: 'notSent', word: { k: 'noLocks' } }], p)).toMatchObject({ phase: 'review', suspended: true });
  });
  it('once suspended, the drawer stays so: no later event clears it, not even a new purchase after a failure', () => {
    let s = run([{ type: 'banned', keep: true }], unknown());
    const later: CheckoutEvent[] = [
      { type: 'checkStarted' },
      { type: 'checkUnknown' },
      { type: 'tick' },
      { type: 'checkStarted' },
      { type: 'failed', word: { k: 'buy.refused' }, ref: null },
      { type: 'again' },
      { type: 'quoted', quote: quote() },
      { type: 'restore' },
      { type: 'startOver' },
    ];
    for (const e of later) {
      s = checkoutReducer(s, e);
      expect(s.suspended).toBe(true);
    }
  });
});

// Start a new purchase on a reservation whose outcome is unknown.
describe('reserveNew', () => {
  it('dropped: a fresh review of the same quote, no consent, no kept key, no countdown; Confirm is offered again', () => {
    const s = run([{ type: 'reserveNew', dropped: true }], unknown());
    expect(s).toMatchObject({ phase: 'review', consent: false, keyKept: false, checks: 0, stillUnknown: false, retryIn: 0, notice: null });
    expect(s.quote).toEqual(unknown().quote);
    expect(isUnknown(s)).toBe(false);
  });
  it('not dropped (storage kept it): still unknown, the key kept, and the reason shown', () => {
    const s = run([{ type: 'reserveNew', dropped: false }], unknown());
    expect(s).toMatchObject({ phase: 'unknown', keyKept: true, notice: { k: 'mkt.reserveNewStoreErr' } });
  });
  it('not dropped because a resend of it is on its way in some tab: still unknown, and that is the reason shown', () => {
    const s = run([{ type: 'reserveNew', dropped: false, sending: true }], unknown());
    expect(s).toMatchObject({ phase: 'unknown', keyKept: true, notice: { k: 'mkt.reserveNewSending' } });
  });
  it('only from the unknown view: a check, a send or a review is left as it is', () => {
    for (const from of [run([{ type: 'checkStarted' }], unknown()), posting(), review()])
      for (const dropped of [true, false]) expect(run([{ type: 'reserveNew', dropped }], from)).toBe(from);
  });
});
