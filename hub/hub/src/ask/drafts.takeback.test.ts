// Text taken back after a wait (Edit on a queued message answers later) joins the draft as it is NOW, never the draft of
// the render the press came from: what was typed meanwhile stays, the text comes after it on a new line.
import { afterEach, describe, expect, it } from 'vitest';
import { draftGet, draftSet, draftWithTaken, purgeDrafts } from './drafts';

afterEach(() => { purgeDrafts(null); });

describe('draftWithTaken', () => {
  it('reads the draft at the answer, not at the press', () => {
    const k = 'a|p|c';
    draftSet(k, '');
    const later = () => draftWithTaken(k, 'Also add a README');
    draftSet(k, 'typed while it was taken back');
    expect(later()).toBe('typed while it was taken back\nAlso add a README');
    expect(draftGet(k), 'it only computes; the caller writes').toBe('typed while it was taken back');
  });
  it('an empty or blank draft takes the text alone', () => {
    draftSet('b|p|c', '   ');
    expect(draftWithTaken('b|p|c', 'x')).toBe('x');
    expect(draftWithTaken('none|p|c', 'y')).toBe('y');
  });
});
