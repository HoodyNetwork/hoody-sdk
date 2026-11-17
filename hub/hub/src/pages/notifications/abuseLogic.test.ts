// Vitest: the parsers of the abuse-notice owner answers (one per wire shape) and the reply box's pure rules. Each field
// the section reads has a malformed row; a contradiction (resolved without its time, open with one) is unknown; a detail
// for another id is unknown. Only the owner fields are read.
import { describe, expect, it } from 'vitest';
import { parseMessage, parseNotice, parseNoticeDetail, parseNoticeList, parseReplyAnswer, refusalKey, repliesLeft, replyFits, replySize, REPLY_LIMIT, REPLY_MAX, REPLY_MAX_LINE, REPLY_MAX_LINES, type AbuseNoticeDetail } from './abuseLogic';

const ID = 'ab0000000000000000000000';
const row = {
  id: ID,
  title: 'Outgoing spam reported from your server',
  server_label: 'atlas',
  status: 'open',
  restriction: 'active',
  created_at: '2026-11-10T03:00:00.000Z',
  updated_at: '2026-11-11T03:00:00.000Z',
  resolved_at: null,
};
const msg = { seq: 1, author_kind: 'admin', body: 'Please check.', created_at: '2026-11-11T03:00:00.000Z' };
const detail = { data: { ...row, message: 'We received a report.', messages: [msg] } };

describe('parseNotice', () => {
  it('reads a real owner row', () => {
    expect(parseNotice(row)).toEqual({
      id: ID,
      title: row.title,
      serverLabel: 'atlas',
      status: 'open',
      restriction: 'active',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: null,
    });
    expect(parseNotice({ ...row, status: 'resolved', restriction: null, resolved_at: '2026-11-11T04:00:00.000Z' })?.status).toBe('resolved');
    expect(parseNotice({ ...row, restriction: 'lifted' })?.restriction).toBe('lifted');
    expect(parseNotice({ ...row, server_label: null })?.serverLabel).toBeNull();
    // The API declares the times nullable: null is read as not recorded, never as a time.
    expect(parseNotice({ ...row, created_at: null, updated_at: null })).toMatchObject({ createdAt: null, updatedAt: null });
    expect(parseNotice({ ...row, updated_at: '2026-11-11T03:00:00+08:00' })?.updatedAt).toBe('2026-11-11T03:00:00+08:00');
  });

  it.each([
    ['id missing', { id: undefined }],
    ['id empty', { id: '' }],
    ['title not text', { title: 3 }],
    ['server_label missing', { server_label: undefined }],
    ['server_label not text', { server_label: 7 }],
    ['id not 24 hex', { id: 'AB0000000000000000000000' }],
    ['status unknown', { status: 'closed' }],
    ['restriction unknown', { restriction: 'partial' }],
    ['restriction missing', { restriction: undefined }],
    ['created_at not a time', { created_at: 'yesterday' }],
    ['created_at a date alone', { created_at: '2026-11-10' }],
    ['updated_at without its zone', { updated_at: '2026-11-11T03:00:00' }],
    ['created_at a day its month lacks', { created_at: '2026-02-30T03:00:00Z' }],
    ['created_at month 13', { created_at: '2026-13-01T03:00:00Z' }],
    ['updated_at hour 24', { updated_at: '2026-11-11T24:00:00Z' }],
    ['updated_at an offset past 23 hours', { updated_at: '2026-11-11T03:00:00+24:00' }],
    ['updated_at missing', { updated_at: undefined }],
    ['resolved_at not a time', { resolved_at: 'soon' }],
    ['contradiction: resolved without its time', { status: 'resolved', resolved_at: null }],
    ['contradiction: open with a resolved time', { resolved_at: '2026-11-11T04:00:00.000Z' }],
  ])('%s: unknown', (_name, change) => {
    expect(parseNotice({ ...row, ...change })).toBeNull();
  });

  it('is not an object: unknown', () => {
    expect(parseNotice(null)).toBeNull();
    expect(parseNotice([row])).toBeNull();
  });

  it('never carries a field the owner answer must not have, even if a server sent one', () => {
    const p = parseNotice({ ...row, reason: 'internal', resolution_note: 'x', server_id: 's', suspension_id: 'y' });
    expect(Object.keys(p ?? {}).sort()).toEqual(['createdAt', 'id', 'resolvedAt', 'restriction', 'serverLabel', 'status', 'title', 'updatedAt']);
  });
});

describe('parseMessage', () => {
  it('a null time is not recorded, never a time', () => {
    expect(parseMessage({ ...msg, created_at: null })?.createdAt).toBeNull();
    expect(parseMessage({ ...msg, created_at: '2028-02-29T00:00:00Z' })?.createdAt).toBe('2028-02-29T00:00:00Z');
  });
  it('reads both authors', () => {
    expect(parseMessage(msg)).toEqual({ seq: 1, author: 'admin', body: 'Please check.', createdAt: msg.created_at });
    expect(parseMessage({ ...msg, author_kind: 'owner' })?.author).toBe('owner');
  });
  it('an answer still carrying an `id` parses; the id is never read', () => {
    const p = parseMessage({ ...msg, id: 987654 });
    expect(p).toEqual({ seq: 1, author: 'admin', body: 'Please check.', createdAt: msg.created_at });
    expect(p && 'id' in p).toBe(false);
    const r = parseReplyAnswer({ statusCode: 201, message: 'Reply sent', data: { message: { ...msg, id: 987654, seq: 3, author_kind: 'owner' } } });
    expect(r).toEqual({ seq: 3, author: 'owner', body: 'Please check.', createdAt: msg.created_at });
  });
  it.each([
    ['seq missing', { seq: undefined }],
    ['seq zero', { seq: 0 }],
    ['seq negative', { seq: -1 }],
    ['seq fractional', { seq: 1.5 }],
    ['seq a string', { seq: '1' }],
    ['seq too large to be exact', { seq: 2 ** 53 }],
    ['an id but no seq', { seq: undefined, id: 1 }],
    ['author_kind', { author_kind: 'staff' }],
    ['body', { body: null }],
    ['created_at', { created_at: '' }],
    ['created_at a day its month lacks', { created_at: '2026-04-31T00:00:00Z' }],
  ])('malformed %s: unknown', (_n, change) => {
    expect(parseMessage({ ...msg, ...change })).toBeNull();
  });
});

describe('parseReplyAnswer', () => {
  it('only the stored owner message proves a reply', () => {
    expect(parseReplyAnswer({ statusCode: 201, message: 'Reply sent', data: { message: { ...msg, author_kind: 'owner' } } })).toMatchObject({ seq: 1, author: 'owner' });
    const owner = { ...msg, author_kind: 'owner' };
    expect(parseReplyAnswer({ statusCode: 201, data: { message: msg } })).toBeNull();
    // The envelope must say 201 with its message: a 200/202 or a contradictory or missing status proves nothing.
    expect(parseReplyAnswer({ statusCode: 200, message: 'Reply sent', data: { message: owner } })).toBeNull();
    expect(parseReplyAnswer({ statusCode: 500, message: 'Reply sent', data: { message: owner } })).toBeNull();
    expect(parseReplyAnswer({ message: 'Reply sent', data: { message: owner } })).toBeNull();
    expect(parseReplyAnswer({ statusCode: 201, data: { message: owner } })).toBeNull();
    expect(parseReplyAnswer({ statusCode: 201, message: 'Reply sent', data: {} })).toBeNull();
    expect(parseReplyAnswer({ statusCode: 201, message: 'Reply sent', data: { message: { ...owner, seq: 'x' } } })).toBeNull();
    expect(parseReplyAnswer(null)).toBeNull();
    expect(parseReplyAnswer('')).toBeNull();
  });
});

describe('parseNoticeList', () => {
  it('reads rows, the total and whether a later page holds more', () => {
    expect(parseNoticeList({ data: [row], pagination: { page: 1, limit: 100, total: 3, has_more: true } })).toMatchObject({ total: 3, more: true, rows: [{ id: ID }] });
    expect(parseNoticeList({ data: [row], pagination: { page: 1, limit: 100, total: 1, has_more: false } })).toMatchObject({ total: 1, more: false });
  });
  it.each([
    ['data missing', { pagination: { total: 0, has_more: false } }],
    ['pagination missing', { data: [] }],
    ['total not an integer', { data: [], pagination: { total: '1', has_more: false } }],
    ['total negative', { data: [], pagination: { total: -1, has_more: false } }],
    ['has_more missing', { data: [], pagination: { total: 0 } }],
    ['has_more not a boolean', { data: [], pagination: { total: 0, has_more: 'false' } }],
    ['one malformed row', { data: [row, { ...row, status: 'x' }], pagination: { total: 2, has_more: false } }],
    ['contradiction: fewer in all than shown', { data: [row], pagination: { total: 0, has_more: false } }],
  ])('%s: unknown', (_n, raw) => {
    expect(parseNoticeList(raw)).toBeNull();
  });
});

describe('parseNoticeDetail', () => {
  it('reads the notice, what Hoody wrote and its messages', () => {
    const d = parseNoticeDetail(detail, ID);
    expect(d).toMatchObject({ id: ID, userMessage: 'We received a report.', messages: [{ seq: 1, author: 'admin' }] });
  });
  it('reads a thread numbered 1, 2, 3 in order', () => {
    const three = { data: { ...detail.data, messages: [msg, { ...msg, seq: 2, author_kind: 'owner' }, { ...msg, seq: 3 }] } };
    expect(parseNoticeDetail(three, ID)?.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
  });
  it.each([
    ['not under data', { ...detail.data }],
    ['message missing', { data: { ...detail.data, message: undefined } }],
    ['messages not a list', { data: { ...detail.data, messages: {} } }],
    ['one malformed message', { data: { ...detail.data, messages: [msg, { ...msg, author_kind: 'x' }] } }],
    ['a duplicate seq', { data: { ...detail.data, messages: [msg, { ...msg, seq: 1 }] } }],
    ['a gap in seq', { data: { ...detail.data, messages: [msg, { ...msg, seq: 3 }] } }],
    ['seq out of order', { data: { ...detail.data, messages: [{ ...msg, seq: 2 }, msg] } }],
    ['seq not starting at 1', { data: { ...detail.data, messages: [{ ...msg, seq: 2 }] } }],
    ['a malformed notice field', { data: { ...detail.data, status: 'x' } }],
  ])('%s: unknown', (_n, raw) => {
    expect(parseNoticeDetail(raw, ID)).toBeNull();
  });
  it('another notice than the one asked for: unknown', () => {
    expect(parseNoticeDetail(detail, 'ab0001000000000000000000')).toBeNull();
  });
});

describe('reply rules', () => {
  it('sends only non-blank text within the bounds', () => {
    expect(replyFits('')).toBe(false);
    expect(replyFits('  \n ')).toBe(false);
    expect(replyFits('Fixed it.')).toBe(true);
    const two = (n: number) => `${'x'.repeat(REPLY_MAX_LINE)}\n${'x'.repeat(n - REPLY_MAX_LINE - 1)}`;
    expect(replyFits(two(REPLY_MAX))).toBe(true);
    expect(replyFits(two(REPLY_MAX + 1))).toBe(false);
    expect(replyFits('a\n'.repeat(200).slice(0, -1))).toBe(true);
    expect(replyFits('a\n'.repeat(201).slice(0, -1))).toBe(false);
    // Counted in code points, as the API counts.
    expect(replyFits(`${'😀'.repeat(REPLY_MAX_LINE)}\n${'😀'.repeat(REPLY_MAX - REPLY_MAX_LINE - 1)}`)).toBe(true);
  });
  it('one line takes at most 2,000 code points (the API refuses a longer one)', () => {
    expect(replyFits('x'.repeat(REPLY_MAX_LINE))).toBe(true);
    expect(replyFits('x'.repeat(REPLY_MAX_LINE + 1))).toBe(false);
    expect(replyFits(`short\n${'x'.repeat(2500)}\nshort`)).toBe(false);
    expect(replyFits('😀'.repeat(REPLY_MAX_LINE))).toBe(true);
    expect(replySize(`ab\n${'😀'.repeat(5)}`).longestLine).toBe(5);
    expect(replySize('').longestLine).toBe(0);
  });
  it('counts every line break the API counts (CR, CRLF once, NEL, U+2028, U+2029)', () => {
    for (const br of ['\r', '\u0085', '\u2028', '\u2029']) {
      expect(replySize(`a${br}b`).lines).toBe(2);
      // 201 short lines joined by this break: over the 200-line limit, so the box refuses it.
      expect(replyFits(Array(REPLY_MAX_LINES + 1).fill('x').join(br))).toBe(false);
      expect(replyFits(Array(REPLY_MAX_LINES).fill('x').join(br))).toBe(true);
    }
    expect(replySize('a\r\nb')).toEqual({ chars: 3, lines: 2, longestLine: 1 });
    // A break other than LF splits a long text into short lines, as the API sees it.
    expect(replySize(`${'x'.repeat(1500)}\u2028${'x'.repeat(1500)}`).longestLine).toBe(1500);
  });
  it('counts only the owner replies against the limit', () => {
    const d = (owner: number, admin: number) =>
      ({ messages: [...Array.from({ length: owner }, () => ({ author: 'owner' })), ...Array.from({ length: admin }, () => ({ author: 'admin' }))] }) as unknown as AbuseNoticeDetail;
    expect(repliesLeft(d(0, 5))).toBe(REPLY_LIMIT);
    expect(repliesLeft(d(19, 3))).toBe(1);
    expect(repliesLeft(d(20, 0))).toBe(0);
    expect(repliesLeft(d(25, 0))).toBe(0);
  });
  it('maps each owner refusal code to its words, anything else to the kit sentence', () => {
    expect(refusalKey('ABUSE_NOTICE_RESOLVED')).toBe('an.err.resolved');
    expect(refusalKey('ABUSE_NOTICE_REPLY_LIMIT')).toBe('an.err.limit');
    expect(refusalKey('ABUSE_NOTICE_TEXT_INVALID')).toBe('an.err.text');
    expect(refusalKey('ABUSE_NOTICE_FIELD_INVALID')).toBe('an.err.text');
    expect(refusalKey('ABUSE_NOTICE_NOT_FOUND')).toBe('an.err.gone');
    expect(refusalKey('RATE_LIMIT_EXCEEDED')).toBeNull();
    expect(refusalKey(undefined)).toBeNull();
  });
});
