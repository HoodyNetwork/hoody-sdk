// Vitest: the pure rules behind the 2FA drawers' refusals: what a typed code is sent as, how a wait is said, and
// which refusal gets which sentence.
import { describe, expect, it } from 'vitest';
import { cleanCode, errorWords, isAppCode, isCodeOrBackup, plainBadRequest, possiblePassword, refusal, waitMinutes } from './logic';

describe('a typed code', () => {
  it('loses its spaces and hyphens, and nothing else', () => {
    expect(cleanCode(' 123 456 ')).toBe('123456');
    expect(cleanCode('123-456')).toBe('123456');
    expect(cleanCode('ab12 cd34-ef')).toBe('ab12cd34ef');
    expect(cleanCode('AB12cd34ef')).toBe('AB12cd34ef');
  });
  it('is an app code when six digits are left', () => {
    expect(isAppCode('123 456')).toBe(true);
    expect(isAppCode('123-456')).toBe(true);
    expect(isAppCode('12345')).toBe(false);
    expect(isAppCode('12345a')).toBe(false);
    expect(isCodeOrBackup(' - ')).toBe(false);
    expect(isCodeOrBackup('ab12cd34ef')).toBe(true);
  });
});

describe('a refusal', () => {
  it('says a wait in whole minutes, rounded up; no wait named is none', () => {
    expect(waitMinutes(900)).toBe(15);
    expect(waitMinutes(61)).toBe(2);
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(0)).toBeNull();
    expect(waitMinutes(undefined)).toBeNull();
    expect(waitMinutes(Number.NaN)).toBeNull();
  });
  it('too many tries names the wait when the answer carried one, and promises no time when it did not', () => {
    expect(errorWords({ status: 429, retryAfter: 900 }, 'password')).toEqual({ key: 'err.tooManyWait', vars: { count: 15 } });
    expect(errorWords({ status: 429 }, 'password')).toEqual({ key: 'err.tooMany' });
    expect(errorWords({ status: 401, retryAfter: 900 }, 'password')).toEqual({ key: 'err.password' });
    expect(errorWords({ status: 401, code: 'INVALID_OTP_CODE' }, 'password')).toEqual({ key: 'err.code' });
  });
  it('keeps its wait beside the code and status', () => {
    expect(refusal({ status: 429, retryAfter: 900 })).toEqual({ status: 429, retryAfter: 900 });
    expect(refusal({ code: 'X' })).toEqual({ code: 'X' });
    expect(refusal({})).toBeUndefined();
  });
  it('a plain 400 names no refusal of its own', () => {
    expect(plainBadRequest({ outcome: 'failed', status: 400 })).toBe(true);
    expect(plainBadRequest({ outcome: 'failed', status: 400, code: 'Bad Request' })).toBe(true);
    expect(plainBadRequest({ outcome: 'failed', status: 400, code: 'OTP_REQUIRED' })).toBe(false);
    expect(plainBadRequest({ outcome: 'pending', status: 400 })).toBe(false);
    expect(plainBadRequest({ outcome: 'failed', status: 401 })).toBe(false);
  });
  it('the set-up takes 8 to 128 characters as a password', () => {
    expect(possiblePassword('1234567')).toBe(false);
    expect(possiblePassword('12345678')).toBe(true);
    expect(possiblePassword('x'.repeat(128))).toBe(true);
    expect(possiblePassword('x'.repeat(129))).toBe(false);
  });
});
