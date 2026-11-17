// A write to a computer the API refuses for its state: one still being set up (409 computer_finalizing) says to try
// again in a moment, one held for review (403 computer_quarantined) says it can't be changed, never "it changed in the
// meantime" or "you don't have permission". A pending outcome still wins.
import { describe, expect, it } from 'vitest';
import { errorInfo, type ErrorInfo } from '@core';
import { ERROR_WORD_KEYS, errorWords } from './errorWords';
import strings from './strings.en.json';

const info = (e: Record<string, unknown>): ErrorInfo => errorInfo(e, { page: 'computers', now: new Date('2026-11-12T16:00:00Z') });
const key = (e: Record<string, unknown>) => errorWords(info(e)).key;

describe('computer state refusals', () => {
  it('still being set up: try again in a moment', () => {
    expect(info({ status: 409, code: 'computer_finalizing' }).code).toBe('computer_finalizing');
    expect(key({ status: 409, code: 'computer_finalizing' })).toBe('err.computerFinalizing');
    expect(strings['err.computerFinalizing']).toMatch(/still being set up/);
    expect(key({ pending: true, status: 409, code: 'computer_finalizing' })).toBe('err.pending');
  });

  it('held for review: it cannot be changed (the words, once core keeps the code)', () => {
    expect(ERROR_WORD_KEYS).toContain('err.computerQuarantined');
    expect(errorWords({ ...info({ status: 403 }), code: 'computer_quarantined' }).key).toBe('err.computerQuarantined');
    expect(strings['err.computerQuarantined']).toMatch(/held for review/);
  });
});
