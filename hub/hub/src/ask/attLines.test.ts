// "N lines · goes in as text" on a text attachment chip of the Ask dock has a singular form, the same words as the AI
// page's (pages/ai/parts/attLines tests): a one-line file read "1 lines" before.
import { describe, expect, it } from 'vitest';
import { makeT } from '@kit';
import ask from './strings.en.json';

describe('text attachment line count', () => {
  it('one line is "1 line"; more are "N lines" (Ask dock)', () => {
    expect(makeT(ask)('ask.attLines', { count: 1, n: '1' })).toBe('1 line · goes in as text');
    expect(makeT(ask)('ask.attLines', { count: 2, n: '2' })).toBe('2 lines · goes in as text');
  });
});
