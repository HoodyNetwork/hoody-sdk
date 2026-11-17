// A buy, pay or upgrade that sent nothing says why, in the page's own words: it took too long, the browser could not
// save the request, the account changed, the account could not be confirmed, or the price needs checking again. Only a
// reason with no words of its own falls back to the general "didn't go through" line. This is wording only: the event
// is the same `notSent` in every case, and a check that could not be sent stays unknown.
import { describe, expect, it } from 'vitest';
import { attemptChange } from './checkout-live';
import { settleEvent } from './settle';
import strings from './strings.en.json';

const sent = (kind: 'buy' | 'pay' | 'upgrade', r: Parameters<typeof attemptChange>[0]) => settleEvent(kind, attemptChange(r, null), 'send');

describe('a send that sent nothing keeps its reason', () => {
  it.each([
    ['timeout', 'notSentSlow'],
    ['store', 'buy.storeErr'],
    ['check', 'buy.accountCheckErr'],
    ['accountChanged', 'buy.accountChanged'],
    ['unquoted', 'requote'],
  ] as const)('%s → %s', (reason, k) => {
    expect(sent('buy', { ok: false, reason, notSent: true })).toEqual({ type: 'notSent', word: { k } });
    expect(strings[k]).toBeTruthy();
  });

  it('a changed account on a renewal uses the renewal wording', () => {
    expect(sent('pay', { ok: false, reason: 'accountChanged' })).toEqual({ type: 'notSent', word: { k: 'subs.accountChanged' } });
  });

  it('a reason with no words of its own keeps the general line', () => {
    expect(sent('buy', { ok: false, reason: 'refused', notSent: true })).toEqual({ type: 'notSent', word: { k: 'notSent' } });
    expect(sent('buy', { ok: false, reason: 'consent' })).toEqual({ type: 'notSent', word: { k: 'notSent' } });
    expect(sent('upgrade', { ok: false, reason: 'something-new', notSent: true })).toEqual({ type: 'notSent', word: { k: 'notSent' } });
  });

  it('a send given up because its account stopped being the live one is not called slow', () => {
    for (const kind of ['buy', 'pay', 'upgrade'] as const) {
      expect(sent(kind, { ok: false, reason: 'expired', notSent: true })).toEqual({ type: 'notSent', word: { k: 'notSent' } });
    }
  });

  it('the two reasons that already had words keep them', () => {
    expect(sent('buy', { ok: false, reason: 'noLocks', notSent: true })).toEqual({ type: 'notSent', word: { k: 'noLocks' } });
    expect(sent('upgrade', { ok: false, reason: 'heldUpgrade' })).toEqual({ type: 'notSent', word: { k: 'up.heldOther' } });
  });

  it('nothing else about the outcome moves: unknown stays pending, a definite refusal stays failed, a check stays unknown', () => {
    expect(attemptChange({ ok: false, reason: 'unknown' }, null)).toEqual({ outcome: 'pending' });
    expect(attemptChange({ ok: false, reason: 'adopted' }, null)).toEqual({ outcome: 'pending' });
    expect(attemptChange({ ok: false, reason: 'gone' }, null)).toEqual({ outcome: 'pending' });
    expect(attemptChange({ ok: false, reason: 'refused', kind: 'funds', definitive: true }, 'INSUFFICIENT_FUNDS').outcome).toBe('failed');
    expect(attemptChange({ ok: false, reason: 'timeout', notSent: true }, null).outcome).toBe('not_sent');
    expect(settleEvent('buy', attemptChange({ ok: false, reason: 'timeout', notSent: true }, null), 'check')).toEqual({ type: 'checkUnknown' });
  });
});
