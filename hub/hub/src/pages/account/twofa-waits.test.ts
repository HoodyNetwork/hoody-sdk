// Vitest: how long a wait is said in minutes, which refusals keep the short sentence, and what can be a password.
import { describe, expect, it } from 'vitest';
import { emailErrorKey, errorKey, errorWords, limitWords, possiblePassword, waitMinutes } from './logic';
import strings from './strings.en.json';

describe('a long wait', () => {
  it('is said in minutes up to two hours, and as "later" beyond', () => {
    expect(waitMinutes(7200)).toBe(120);
    expect(waitMinutes(7201)).toBeNull();
    expect(waitMinutes(86400)).toBeNull();
    expect(errorWords({ status: 429, retryAfter: 86400 }, 'password')).toEqual({ key: 'err.tooMany' });
    expect(errorWords({ status: 429, retryAfter: 7200 }, 'password')).toEqual({ key: 'err.tooManyWait', vars: { count: 120 } });
  });
});

describe('too many tries on a change with a short limit (password change, the key gate, an email change)', () => {
  it('names the wait when the answer carried one', () => {
    expect(limitWords({ status: 429, retryAfter: 900 })).toEqual({ key: 'err.tooManyWait', vars: { count: 15 } });
    expect(limitWords({ status: 429, retryAfter: 30 })).toEqual({ key: 'err.tooManyWait', vars: { count: 1 } });
  });
  it('a wait beyond two hours and no wait named are the one sentence that promises no time', () => {
    expect(limitWords({ status: 429, retryAfter: 86400 })).toEqual({ key: 'err.tooMany' });
    expect(limitWords({ status: 429 })).toEqual({ key: 'err.tooMany' });
    expect(limitWords(undefined)).toEqual({ key: 'err.tooMany' });
  });
});

describe('what the set-up takes as a password', () => {
  it('counts characters as the server does, not UTF-16 units', () => {
    expect(possiblePassword('\u{1F600}'.repeat(7))).toBe(false); // 14 units, 7 characters
    expect(possiblePassword('\u{1F600}'.repeat(8))).toBe(true);
    expect(possiblePassword('\u{1F600}'.repeat(100))).toBe(true); // 200 units, 100 characters
    expect(possiblePassword('\u{1F600}'.repeat(129))).toBe(false);
    expect(possiblePassword('12345678')).toBe(true);
    expect(possiblePassword('1234567')).toBe(false);
  });
});

describe('a bare 401', () => {
  it('blames one thing: there is no "the password or the code" sentence', () => {
    expect(Object.keys(strings)).not.toContain('err.both');
    expect(Object.values(strings).some((v) => /password or the code/i.test(v))).toBe(false);
    // What a caller of the old "both" would get now: the password (a wrong code is refused by name).
    expect(errorKey({ status: 401 }, 'both' as never)).toBe('err.password');
    expect(emailErrorKey({ status: 401 })).toBe('err.password');
  });
});
