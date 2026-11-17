import { describe, expect, it } from 'vitest';
import { attemptChange } from './checkout-live';
import { checkoutReducer, initialCheckout } from './checkout-logic';
import { attemptWords, upgradeWords } from './logic';
import { settleEvent } from './settle';

// A browser without Web Locks sends nothing, and the drawer says why.
describe('noLocks refusal words', () => {
  it('a noLocks confirm becomes a not_sent change carrying the noLocks code', () => {
    expect(attemptChange({ ok: false, reason: 'noLocks', notSent: true }, null)).toEqual({ outcome: 'not_sent', code: 'noLocks' });
  });
  it('any other not-sent refusal carries its own reason, never the noLocks code or the server error code', () => {
    expect(attemptChange({ ok: false, reason: 'store', notSent: true }, null)).toEqual({ outcome: 'not_sent', code: 'store' });
    expect(attemptChange({ ok: false, reason: 'refused', definitive: false }, 'X')).toEqual({ outcome: 'not_sent', code: 'refused' });
  });
  it('the noLocks reason has its own words for buy, pay and upgrade', () => {
    expect(attemptWords({ reason: 'noLocks' }, false)).toEqual({ word: { k: 'noLocks' } });
    expect(attemptWords({ reason: 'noLocks' }, true)).toEqual({ word: { k: 'noLocks' } });
    expect(upgradeWords({ reason: 'noLocks' })).toEqual({ word: { k: 'noLocks' } });
  });
  it.each(['buy', 'upgrade', 'pay'] as const)('%s: a noLocks not_sent shows the noLocks sentence', (kind) => {
    expect(settleEvent(kind, { outcome: 'not_sent', code: 'noLocks' }, 'send')).toEqual({ type: 'notSent', word: { k: 'noLocks' } });
  });
  it.each(['buy', 'upgrade', 'pay'] as const)('%s: any other not_sent keeps the generic word', (kind) => {
    const generic = settleEvent(kind, { outcome: 'not_sent' }, 'send');
    expect(generic).toMatchObject({ type: 'notSent' });
    expect((generic as { word: { k: string } }).word.k).not.toBe('noLocks');
    expect(settleEvent(kind, { outcome: 'not_sent', code: 'OTHER' }, 'send')).toEqual(generic);
    expect(settleEvent(kind, { outcome: 'stale', code: 'noLocks' }, 'send')).toEqual(generic);
  });
});

// A retained buy, pay or upgrade whose kept key another tab drops before or during
// Check again gets core's noLocks refusal. The check stays unknown (an earlier payment may still have gone through)
// and the drawer says why this browser cannot send it.
describe('noLocks on Check again', () => {
  it.each(['buy', 'upgrade', 'pay'] as const)('%s: a noLocks check stays unknown and carries the noLocks word', (kind) => {
    expect(settleEvent(kind, attemptChange({ ok: false, reason: 'noLocks', notSent: true }, null), 'check')).toEqual({ type: 'checkUnknown', word: { k: 'noLocks' } });
  });
  it.each(['buy', 'upgrade', 'pay'] as const)('%s: any other not_sent or stale check is a plain checkUnknown', (kind) => {
    expect(settleEvent(kind, { outcome: 'not_sent' }, 'check')).toEqual({ type: 'checkUnknown' });
    expect(settleEvent(kind, { outcome: 'not_sent', code: 'OTHER' }, 'check')).toEqual({ type: 'checkUnknown' });
    expect(settleEvent(kind, { outcome: 'stale', code: 'noLocks' }, 'check')).toEqual({ type: 'checkUnknown' });
  });
  it('the reducer keeps the unknown outcome, shows the word as the notice, and a later plain check clears it', () => {
    const checking = { ...initialCheckout, phase: 'checking' as const, keyKept: true };
    const a = checkoutReducer(checking, { type: 'checkUnknown', word: { k: 'noLocks' } });
    expect(a).toMatchObject({ phase: 'unknown', stillUnknown: true, keyKept: true, notice: { k: 'noLocks' } });
    const b = checkoutReducer(checkoutReducer(a, { type: 'checkStarted' }), { type: 'checkUnknown' });
    expect(b).toMatchObject({ phase: 'unknown', notice: null });
  });
});
