// Vitest: the Notes page's sentences say only what the page knows. An outcome that could not be confirmed is never
// blamed on a timeout, a check that proved nothing is not "not found", the computers notice gives no total the page
// did not read, and no string is kept that nothing draws.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const S = strings as Record<string, string>;

describe('Notes words', () => {
  it('an unconfirmed create or delete names no cause', () => {
    for (const k of ['new.pending', 'delete.pending']) {
      expect(S[k], k).toMatch(/could not confirm/);
      expect(S[k], k).not.toMatch(/in time/);
      expect(S[k], k).toMatch(/Check again/);
    }
  });

  it('a check that proved nothing is not called "not found"', () => {
    expect(S['new.unsure']).not.toMatch(/Not found/i);
  });

  it('the computers notice counts only what is shown', () => {
    expect(S.moreComputers).toContain('{{shown}}');
    expect(S.moreComputers).not.toContain('{{total}}');
  });

  it('a refused create and a refused title say what to do next', () => {
    expect(S['new.cantAdd']).toMatch(/Nothing was added\./);
    expect(S['new.cantAdd']).toMatch(/owner|another computer/);
    expect(S['err.control']).not.toMatch(/control characters/);
  });

  it('a computer the person cannot open up says who can', () => {
    expect(S['empty.c.denied']).toMatch(/Ask the owner/);
    expect(S['note.noComputerBody']).toBeTruthy();
    expect(S['note.noAddressBody']).toBeTruthy();
  });

  it('holds no string that nothing draws', () => {
    for (const k of ['col.computer', 'group.count_one', 'group.count_other', 'state.loading', 'toast.downloadBody', 'new.sendAgain']) expect(S[k], k).toBeUndefined();
  });
});
