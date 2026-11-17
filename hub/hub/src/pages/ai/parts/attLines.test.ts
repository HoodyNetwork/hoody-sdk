// "N lines · goes in as text" on a text attachment chip of the AI page has a singular form: a one-line file read "1 lines"
// before. The Ask dock's own table is checked beside it (ask/attLines tests): a page reaches src/ask only through @ask/io.
import { describe, expect, it } from 'vitest';
import { makeT } from '@kit';
import conv from './Conversation.strings.en.json';

describe('text attachment line count', () => {
  it('one line is "1 line"; more are "N lines" (AI page)', () => {
    expect(makeT(conv)('conv.att.lines', { count: 1, n: '1' })).toBe('1 line · goes in as text');
    expect(makeT(conv)('conv.att.lines', { count: 12, n: '12' })).toBe('12 lines · goes in as text');
  });
});
