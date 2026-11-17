// Vitest: how the one-file sign-in card says a wait (sign-in, forgot password, sign-up, send the email again).
import { describe, expect, it } from 'vitest';
import { retryWords } from './retryWords';

describe('a wait on the one-file sign-in card', () => {
  it('none named: no time is promised, in the same sentence as a wait too long to count', () => {
    expect(retryWords(undefined)).toEqual({ key: 'pw.err.retryLater' });
    expect(retryWords(0)).toEqual({ key: 'pw.err.retryLater' });
  });
  it('under two minutes in seconds, then whole minutes rounded up', () => {
    expect(retryWords(42)).toEqual({ key: 'pw.err.retry', vars: { s: 42 } });
    expect(retryWords(119)).toEqual({ key: 'pw.err.retry', vars: { s: 119 } });
    expect(retryWords(120)).toEqual({ key: 'pw.err.retryMinutes', vars: { m: 2 } });
    expect(retryWords(900)).toEqual({ key: 'pw.err.retryMinutes', vars: { m: 15 } });
    expect(retryWords(7200)).toEqual({ key: 'pw.err.retryMinutes', vars: { m: 120 } });
  });
  it('beyond two hours: later, never a count of minutes', () => {
    expect(retryWords(7201)).toEqual({ key: 'pw.err.retryLater' });
    expect(retryWords(86400)).toEqual({ key: 'pw.err.retryLater' });
  });
});
