import { describe, expect, it } from 'vitest';
import { attemptChange } from './checkout-live';
import { bonusView } from './logic';
import { purchasePhase, settleEvent } from './settle';

describe('money outcomes stay unknown, never "nothing charged"', () => {
  it('an adopted retained attempt is pending', () => {
    expect(attemptChange({ ok: false, reason: 'adopted', notSent: true }, null).outcome).toBe('pending');
  });
  it('a lost answer is pending, a pure refusal before sending is not_sent', () => {
    expect(attemptChange({ ok: false, reason: 'unknown', key: 'k' }, null).outcome).toBe('pending');
    expect(attemptChange({ ok: false, reason: 'consent' }, null).outcome).toBe('not_sent');
  });
  it('an unknown bonus claim is a read-back, not a retry', () => {
    const v = bonusView({ enabled: true, github_linked: true, amount_usd: '10.00' }, { result: 'retry' });
    expect(v?.unknown).toBe(true);
  });
});

describe('a rent that reads NOT_FOUND while reconciling', () => {
  const nf = { outcome: 'failed' as const, code: 'NOT_FOUND' };
  it('is "not confirmed", not a definite failure with Try again', () => {
    expect(settleEvent('rent', nf, purchasePhase('reconciling', nf))).toEqual({ type: 'checkNotFound' });
  });
  it('a typed refusal while sending is still a refusal', () => {
    const r = { outcome: 'failed' as const, code: 'INSUFFICIENT_BALANCE' };
    expect(purchasePhase('posting', r)).toBe('send');
  });
});

describe('a reservation retry waits for the machine own countdown', () => {
  it('carries Retry-After into the unknown event instead of a fixed wait', () => {
    expect(settleEvent('reserve', { outcome: 'pending' }, 'send', 60)).toMatchObject({ type: 'unknown', retryIn: 60 });
  });

  it('reports the real debit of the operation, never the ceiling that was authorised', () => {
    const ok = (operation: Record<string, unknown>) =>
      ({ ok: true, result: { operation, subscription: {}, replayed: false, failed: false } }) as never;
    expect(attemptChange(ok({ charge_cents: 800 }), null).data?.chargedCents).toBe(800);
    expect(attemptChange(ok({}), null).data?.chargedCents).toBeNull();
  });
});
