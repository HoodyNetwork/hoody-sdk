// A held view's Check again and resend go by target, as core adopts a kept request, so each must
// still find the very request the band named (its key). When the target adopts another kept request of the same
// family, nothing is read, no resend dialog opens and nothing is sent.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkHeldAttempt, heldAttemptShown, resendHeldAttempt } from './data';

const fx = vi.hoisted(() => ({
  adopted: 'k-mine',
  reads: 0,
  attempts: 0,
}));

vi.mock('@core', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    commerce: {
      ...(a.commerce as object),
      heldPlanEntry: () => ({ key: fx.adopted, maxCents: 1000, sig: `sig-${fx.adopted}` }),
      checkPayHold: async () => {
        fx.reads++;
        return { check: 'unknown' };
      },
      checkPlanHold: async () => {
        fx.reads++;
        return { check: 'unknown' };
      },
      createAttempt: () => {
        fx.attempts++;
        return { snapshot: () => ({ pending: true, key: fx.adopted, ceiling: 1000 }), confirm: async () => ({ ok: false, reason: 'busy' }), dispose: () => undefined };
      },
    },
  };
});

const held = (kind: 'pay' | 'buy') => ({
  key: 'k-mine',
  title: 'mine',
  target: { kind, item: kind === 'buy' ? 'plan-1' : null, sub: kind === 'pay' ? 'deadbeef' : null, subId: kind === 'pay' ? 'a'.repeat(24) : null, familyId: kind === 'buy' ? 'fam' : null, days: null },
}) as any;

beforeEach(() => {
  fx.adopted = 'k-mine';
  fx.reads = 0;
  fx.attempts = 0;
});

describe('held recovery acts only on the request the band named', () => {
  for (const kind of ['pay', 'buy'] as const) {
    it(`${kind}: the target still adopts the named request: Check again reads, the dialog opens on it`, async () => {
      expect(await checkHeldAttempt(held(kind))).toMatchObject({ check: 'unknown' });
      expect(fx.reads).toBe(1);
      expect(heldAttemptShown(held(kind))?.key).toBe('k-mine');
    });

    it(`${kind}: the target adopts another kept request of its family: nothing is read, no dialog, nothing sent`, async () => {
      fx.adopted = 'k-earlier';
      expect(await checkHeldAttempt(held(kind))).toEqual({ check: 'unknown' });
      expect(fx.reads).toBe(0);
      expect(heldAttemptShown(held(kind))).toBeNull();
      // A dialog opened on the other request (as before this fix) cannot send it for this band either.
      const shown = { key: 'k-earlier', maxCents: 1000, sig: 'sig-k-earlier' };
      // Nothing was sent, and the answer says so; the outcome stays unknown.
      expect(await resendHeldAttempt(held(kind), shown)).toEqual({ check: 'unknown', word: { k: 'held.resendNotSent' } });
      expect(fx.attempts).toBe(0);
    });
  }
});
