// Vitest: the notifications page's pure rules (filters, links and bold, what a fresh list proves). The alert rules are tested in core/alerts.test.ts.
import { describe, expect, it } from 'vitest';
import { groupOf, markAllProves, markReadProves, needsLook, noticePlainText, noticeSegments, readAllShown } from './logic';

describe('filters', () => {
  it('files notices under their group and flags warnings and errors', () => {
    expect(groupOf({ type: 'BILLING' })).toBe('paid');
    expect(groupOf({ type: undefined })).toBe('other');
    expect(needsLook({ severity: 'ERROR' })).toBe(true);
    expect(needsLook({ severity: 'SUCCESS' })).toBe(false);
  });
});

// The notice rule. CASES equal the server's (tests/utils/notice-text.test.ts): the email renders the same text.
type Seg = { text: string; href?: string; bold?: boolean };
const CASES: Array<[string, Seg[]]> = [
  ['plain text', [{ text: 'plain text' }]],
  ['a **big** sale', [{ text: 'a ' }, { text: 'big', bold: true }, { text: ' sale' }]],
  ['**a** and **b**', [{ text: 'a', bold: true }, { text: ' and ' }, { text: 'b', bold: true }]],
  ['see https://hoody.com/x. ok', [{ text: 'see ' }, { text: 'https://hoody.com/x', href: 'https://hoody.com/x' }, { text: '. ok' }]],
  ['**https://hoody.com/deal**', [{ text: 'https://hoody.com/deal', href: 'https://hoody.com/deal', bold: true }]],
  ['**go to https://hoody.com now**', [{ text: 'go to ', bold: true }, { text: 'https://hoody.com', href: 'https://hoody.com/', bold: true }, { text: ' now', bold: true }]],
  ['http://x.example and javascript:alert(1)', [{ text: 'http://x.example and javascript:alert(1)' }]],
  ['2 ** 3 and a ** b', [{ text: '2 ** 3 and a ** b' }]],
  ['**unclosed', [{ text: '**unclosed' }]],
  ['****', [{ text: '****' }]],
  ['**one\n\ntwo**', [{ text: '**one\n\ntwo**' }]],
  ['**line one\nline two**', [{ text: 'line one\nline two', bold: true }]],
  ['https://a.example/x**y**z', [{ text: 'https://a.example/x**y**z', href: 'https://a.example/x**y**z' }]],
  ['(see https://a.example/(b))', [{ text: '(see ' }, { text: 'https://a.example/(b)', href: 'https://a.example/(b)' }, { text: ')' }]],
  ['<b>not html</b>', [{ text: '<b>not html</b>' }]],
  ['**one\r\n\r\ntwo**', [{ text: '**one\n\ntwo**' }]],
  ['**line one\r\nline two**', [{ text: 'line one\nline two', bold: true }]],
  ['***x***', [{ text: '*x', bold: true }, { text: '*' }]],
  ['**a **b**', [{ text: 'a **b', bold: true }]],
  ['http://https://evil.example and x:https://evil.example', [{ text: 'http://https://evil.example and x:https://evil.example' }]],
  ['http://u@https://evil.example and http://a.example/?u=https://evil.example', [{ text: 'http://u@https://evil.example and http://a.example/?u=https://evil.example' }]],
  ['http://a.example https://b.example', [{ text: 'http://a.example ' }, { text: 'https://b.example', href: 'https://b.example/' }]],
  ['"https://a.example","https://b.example"', [{ text: '"' }, { text: 'https://a.example', href: 'https://a.example/' }, { text: '","' }, { text: 'https://b.example', href: 'https://b.example/' }, { text: '"' }]],
  ['**a**\n \n**b**', [{ text: 'a', bold: true }, { text: '\n \n' }, { text: 'b', bold: true }]],
];

describe('noticeSegments', () => {
  it.each(CASES)('%j', (input, want) => {
    expect(noticeSegments(input)).toEqual(want);
  });

  it('joins to the input without the paired markers', () => {
    expect(noticePlainText('a **big** sale at https://hoody.com')).toBe('a big sale at https://hoody.com');
    expect(noticePlainText('2 ** 3')).toBe('2 ** 3');
  });

  it('stays linear on a long message full of markers that never close', () => {
    const text = '**a '.repeat(150_000);
    const t0 = performance.now();
    expect(noticePlainText(text)).toBe(text);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('stays fast on many bold pairs split by blank lines', () => {
    const text = '**a**\n\n'.repeat(100_000);
    const t0 = performance.now();
    expect(noticeSegments(text).filter((x) => x.bold)).toHaveLength(100_000);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('stays linear on a URL followed by a long run of closing brackets', () => {
    const text = 'https://a.example/' + ')'.repeat(100_000);
    const t0 = performance.now();
    expect(noticeSegments(text)).toEqual([{ text: 'https://a.example/', href: 'https://a.example/' }, { text: ')'.repeat(100_000) }]);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

// A fresh list answer does not say which box it is: an unread page holds unread rows, the archive read ones.
const row = (id: string, read: boolean) => ({ id, title: id, message: '', severity: 'INFO' as const, at: null, read });
const page = (rows: ReturnType<typeof row>[], total = rows.length) => ({ rows, total });

describe('what a fresh list proves about a mark-read', () => {
  it('proves it by the notice reading read, or by a whole unread box without it', () => {
    expect(markReadProves({ id: 'a' }, [[page([row('a', true)])]])).toBe('applied');
    expect(markReadProves({ id: 'a' }, [[page([row('b', false)])]])).toBe('applied');
    // The last unread one: an empty box with nothing else shown.
    expect(markReadProves({ id: 'a' }, [[page([])]])).toBe('applied');
    // Empty next to an archive page: the empty one is the unread box.
    expect(markReadProves({ id: 'a' }, [[page([]), page([row('b', true)])]])).toBe('applied');
  });
  it('proves nothing while the notice still reads unread, or the unread box is cut short', () => {
    expect(markReadProves({ id: 'a' }, [[page([row('a', false)])]])).toBeUndefined();
    expect(markReadProves({ id: 'a' }, [[page([row('b', false)], 140)]])).toBeUndefined();
    expect(markReadProves({ id: 'a' }, [[page([row('b', true)])]])).toBeUndefined();
    expect(markReadProves({ id: 'a' }, [[]])).toBeUndefined();
    expect(markReadProves(undefined, [[page([])]])).toBeUndefined();
  });
});

describe('what a fresh list proves about Mark all read', () => {
  it('judges the notices unread at the press: none of them still unread in a whole unread box', () => {
    const at = { ids: ['a', 'b'] };
    // A notice that came after the press does not hold it.
    expect(markAllProves(at, [[page([row('c', false)])]])).toBe('applied');
    expect(markAllProves(at, [[page([])]])).toBe('applied');
    // One of them still reads unread, or the box is cut short: nothing proved.
    expect(markAllProves(at, [[page([row('c', false), row('b', false)])]])).toBeUndefined();
    expect(markAllProves(at, [[page([row('c', false)], 140)]])).toBeUndefined();
    expect(markAllProves(at, [[page([row('a', true)])]])).toBeUndefined();
    expect(markAllProves(at, [[]])).toBeUndefined();
  });
  it('without a list at the press, proves it only by an empty unread box', () => {
    expect(markAllProves(undefined, [[page([])]])).toBe('applied');
    expect(markAllProves(undefined, [[page([]), page([row('b', true)])]])).toBe('applied');
    expect(markAllProves(undefined, [[page([row('b', false)])]])).toBeUndefined();
    expect(markAllProves(undefined, [[page([row('b', true)])]])).toBeUndefined();
    expect(markAllProves(undefined, [[]])).toBeUndefined();
  });
});

describe('Mark all read: what a press list can prove, and what an answer shows', () => {
  it('an empty press list is no list: only an empty unread box proves it', () => {
    expect(markAllProves({ ids: [] }, [[page([row('c', false)])]])).toBeUndefined();
    expect(markAllProves({ ids: [] }, [[page([])]])).toBe('applied');
  });
  it('BUSY changes nothing, READ_BACK_FIRST is pending, a refusal is failed', () => {
    expect(readAllShown({ outcome: 'done' })).toBe('done');
    expect(readAllShown({ outcome: 'pending' })).toBe('pending');
    expect(readAllShown({ outcome: 'not_sent', code: 'BUSY' })).toBeNull();
    expect(readAllShown({ outcome: 'not_sent', code: 'READ_BACK_FIRST' })).toBe('pending');
    expect(readAllShown({ outcome: 'stale' })).toBeNull();
    expect(readAllShown({ outcome: 'failed', code: 'ACK_FAILED' })).toBe('failed');
    expect(readAllShown({ outcome: 'not_sent', code: 'INPUT_INVALID' })).toBe('failed');
  });
});
