// Vitest: edge values of a wait on the one-file sign-in card, and what reaches it from an answer (core/signin).
import { describe, expect, it } from 'vitest';
import { requestPasswordReset, resendVerification, passwordSignIn, type SignInDeps } from '../core/signin';
import { makeT } from '@kit/strings';
import { retryWords } from './retryWords';
import strings from './strings.en.json';

// The card's own lookup, as the card says it.
const t = makeT(strings);
const say = (v: number | undefined): string => {
  const w = retryWords(v);
  return 'vars' in w ? t(w.key, w.vars) : t(w.key);
};
const deps = (err: unknown): SignInDeps => ({
  call: async () => { throw err; },
  sleep: async () => undefined,
  now: () => 0,
  origin: () => 'https://api.example.test',
  store: () => true,
  stored: () => 'none',
});

describe('retryWords thresholds', () => {
  it.each([
    [0.4, 'Wait 1 second,'], [1, 'Wait 1 second,'], [2, 'Wait 2 seconds'], [119, 'Wait 119 seconds'], [120, 'Wait 2 minutes'], [121, 'Wait 3 minutes'], [900, 'Wait 15 minutes'],
    [3600, 'Wait 60 minutes'], [7200, 'Wait 120 minutes'], [7201, 'Try again later.'], [1e12, 'Try again later.'], [Infinity, 'Try again later.'],
  ])('%s', (v, want) => { expect(say(v as number)).toContain(want); });
  it('none / 0 / NaN promise no time', () => {
    for (const v of [undefined, 0, NaN]) expect(say(v)).toBe(strings['pw.err.retryLater']);
  });
  it('EDGE negative never shows a negative number', () => { expect(say(-5)).not.toMatch(/-\d/); });
  it('EDGE fraction never shows a fraction', () => { expect(say(1.5)).not.toMatch(/\d\.\d/); expect(say(119.5)).not.toMatch(/\d\.\d/); });
  it('no sentence leaves a placeholder or a code', () => {
    for (const v of [undefined, 0, 1, 119, 120, 7200, 7201, 86400]) expect(say(v)).not.toMatch(/\{\{|undefined|NaN|null|[A-Z_]{6,}/);
  });
});

describe('what reaches retryWords from an answer (seconds, as shared.js gives them)', () => {
  it('forgot password: Retry-After 3600 (the limiter window) -> 60 minutes', async () => {
    const r = await requestPasswordReset('a@b.co', deps({ status: 429, code: null, retryAfter: 3600, data: {} }));
    expect(r).toEqual({ kind: 'refused', why: 'retry', retryAfter: 3600 });
    expect(say((r as { retryAfter?: number }).retryAfter)).toContain('Wait 60 minutes');
  });
  it('resend: a header that was an HTTP date arrives as null -> no time promised', async () => {
    const r = await resendVerification('a@b.co', deps({ status: 429, code: null, retryAfter: null, data: {} }));
    expect(r).toEqual({ kind: 'refused', why: 'retry' });
  });
  it('0, negative, NaN and a string header value name no wait', async () => {
    for (const v of [0, -3, NaN, '60']) {
      const r = await requestPasswordReset('a@b.co', deps({ status: 429, retryAfter: v, data: {} }));
      const after = (r as { retryAfter?: number }).retryAfter;
      expect(say(after)).not.toMatch(/-\d|NaN/);
      if (typeof v === 'number' && !(v > 0)) expect(after).toBeUndefined();
    }
  });
  it('sign-in 2FA lockout: body data.lockout_seconds, no header', async () => {
    const r = await passwordSignIn('ada', 'pw-pw-pw-pw', deps({ status: 429, code: 'TWOFACTOR_RATE_LIMIT', retryAfter: null, data: { statusCode: 429, error: 'TWOFACTOR_RATE_LIMIT', data: { lockout_seconds: 899.2 } } }));
    expect(r).toEqual({ kind: 'refused', why: 'retry', retryAfter: 900 });
  });
  it('a lockout of ms-looking size is capped at a day and said as later', async () => {
    const r = await passwordSignIn('ada', 'pw-pw-pw-pw', deps({ status: 429, retryAfter: null, data: { data: { lockout_seconds: 900000 } } }));
    expect((r as { retryAfter?: number }).retryAfter).toBe(86400);
    expect(say(86400)).toBe(strings['pw.err.retryLater']);
  });
  it('the typed password is in no refusal', async () => {
    const r = await passwordSignIn('ada', 'typed-pw-s3cret', deps({ status: 429, retryAfter: 30, message: 'typed-pw-s3cret', data: { password: 'typed-pw-s3cret' } }));
    expect(JSON.stringify(r)).not.toContain('s3cret');
  });
});
