// A definite failure keeps the rejection's allow-listed facts (core's errorInfo) from the machine to the drawer's failed
// outcome, so "Details / Copy details for support" can show them. Never a body or token.
import { describe, expect, it } from 'vitest';
import { errorInfo } from '@core';
import { attemptChange, purchaseChange } from './checkout-live';
import { checkoutReducer, initialCheckout } from './checkout-logic';
import { settleEvent } from './settle';

const info = errorInfo({ code: 'TIMEOUT', status: 504, traceId: 'trace-abc123' });

describe('failure facts travel to the failed state', () => {
  it('an attempt refusal carries the machine error facts into the change', () => {
    const c = attemptChange({ ok: false, reason: 'refused', definitive: true }, 'X', info);
    expect(c).toEqual({ outcome: 'failed', code: 'X', info });
  });

  it('an unsent or unknown attempt answer never carries facts (it is not a failure)', () => {
    expect(attemptChange({ ok: false, reason: 'refused', definitive: false }, 'X', info)).toEqual({ outcome: 'not_sent', code: 'refused' });
    expect(attemptChange({ ok: false, reason: 'unknown', key: 'k' }, null, info)).toEqual({ outcome: 'pending' });
  });

  it('a failed purchase machine hands its facts over, and none when it kept none', () => {
    const snap = (failure: object | null) => ({ state: 'failed', rail: 'rent', failure }) as never;
    expect(purchaseChange(snap({ code: 'Y', status: 500, info }))?.info).toBe(info);
    expect(purchaseChange(snap({ code: 'Y', status: 500 }))).not.toHaveProperty('info');
  });

  it('a send failure and a read-back failure both put the facts on the failed event', () => {
    for (const phase of ['send', 'check'] as const) {
      const e = settleEvent('buy', { outcome: 'failed', code: 'Z', info }, phase);
      expect(e).toMatchObject({ type: 'failed', info });
    }
    expect(settleEvent('buy', { outcome: 'failed', code: 'Z' }, 'send')).not.toHaveProperty('info');
  });

  it('the reducer keeps them on state.failure while posting', () => {
    const posting = { ...initialCheckout, phase: 'posting' } as typeof initialCheckout;
    const next = checkoutReducer(posting, { type: 'failed', word: { k: 'buy.refused' }, ref: null, info });
    expect(next.phase).toBe('failed');
    expect(next.failure?.info).toBe(info);
  });
});
