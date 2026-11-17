// Vitest: the rule for the disabled auto-renew item's reason. A change being sent reads "still being saved"; a change
// whose answer is unknown reads as the row's band does (it may have gone through), and this row's unknown answer is
// never hidden by another row's send. The page's wiring is pinned by renew-reason.page.test.tsx.
import { describe, expect, it } from 'vitest';
import strings from '../strings.en.json';
import { renewReasonKey } from './renewReason';

const none = { banned: false, unknown: false, sending: false, held: false, locked: false };

describe('renewReasonKey', () => {
  it('a suspended account wins over every lock', () => {
    expect(renewReasonKey({ banned: true, unknown: true, sending: true, held: true, locked: true })).toBe('mkt.suspended');
  });
  it("this row's change being sent is still being saved, though core already holds it", () => {
    expect(renewReasonKey({ ...none, sending: true, held: true, locked: true })).toBe('subs.renewBusy');
  });
  it("this row's unknown answer may have gone through", () => {
    expect(renewReasonKey({ ...none, unknown: true, held: true, locked: true })).toBe('renewUnknown');
  });
  it("this row's unknown answer wins over another row's send", () => {
    expect(renewReasonKey({ ...none, unknown: true, sending: true, held: true, locked: true })).toBe('renewUnknown');
  });
  it("another row's send, this row unlocked, is saving", () => {
    expect(renewReasonKey({ ...none, sending: true, held: true })).toBe('subs.renewBusy');
  });
  it('a hold restored after leaving the page may have gone through', () => {
    expect(renewReasonKey({ ...none, held: true })).toBe('renewUnknown');
  });
  it('a row lock with nothing else known is saving', () => {
    expect(renewReasonKey({ ...none, locked: true })).toBe('subs.renewBusy');
  });
  it('every key is a page string', () => {
    const table = strings as Record<string, string>;
    for (const k of ['mkt.suspended', 'subs.renewBusy', 'renewUnknown']) expect(typeof table[k]).toBe('string');
  });
});
