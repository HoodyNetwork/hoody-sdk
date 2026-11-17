// Vitest: the Support page's pure rules. The cleaning port gives the server's own results (the API's
// own test cases, cleaning rules and script corpus); a possible match is a hint that needs the cleaned
// text, an own message and a time inside the slack; the nav count is a number only when every page it read is whole.
import { describe, expect, it } from 'vitest';
import { MATCH_SLACK_MS, cleanText, noAccessOf, possibleMatch, quotaRefusal, duplicateRefusal, sendVerdict, textRefusal, unreadCount, waitUnit, type Message, type TicketPage, type Ticket } from './logic';

const body = (s: string) => cleanText(s, false);
const subject = (s: string) => cleanText(s, true);
const cp = (n: number) => String.fromCodePoint(n);

describe('cleaning matches the server', () => {
  it.each<[string, string, string]>([
    ['C1 line breaks', 'a\r\nb\rc\u0085d\u2028e\u2029f', 'a\nb\nc\nd\ne\nf'],
    ['C2 NFC', 'Café Việt', 'Café Việt'],
    ['C3 line-end space', 'a b \t\nc 　\nd\te', 'a b\nc\nd\te'],
    ['C4 blank lines', '\n\n  indented\nx\n\n', '  indented\nx'],
    ['C5 empty-line runs', 'a\n\n\n\n\n\nb', 'a\n\n\nb'],
    ['C5 keeps two', 'a\n\n\nb', 'a\n\n\nb'],
    ['C7 ZWJ between Latin', 'a‍b', 'ab'],
    ['C7 ZWNJ between Latin', 'a‌b', 'ab'],
    ['C7 FE00', 'a︀b', 'ab'],
    ['C7 FE0F after a letter', 'a️b', 'ab'],
    ['C7 FVS after Latin', 'a᠋b', 'ab'],
    ['C7 emoji selector stays', '❤️', '❤️'],
    ['C7 Persian ZWNJ stays', 'می‌خ', 'می‌خ'],
    ['C7 doubled ZWJ', '\u{1F469}‍‍\u{1F4BB}', '\u{1F469}\u{1F4BB}'],
    ['C7 doubled ZWNJ', 'م‌‌خ', 'مخ'],
    ['Hindi ZWJ after virama', 'क्‍ष', 'क्‍ष'],
    ['Malayalam ZWJ', 'ന്‍റ', 'ന്‍റ'],
    ['Mongolian FVS', 'ᠠ᠋ᠡ', 'ᠠ᠋ᠡ'],
    ['LRM/RLM removed', 'שלום‎ (v2)‏', 'שלום (v2)'],
    ['ALM removed', 'مرحبا؜!', 'مرحبا!'],
    ['ZWJ across scripts', 'م‍क', 'مक'],
    ['BOM and ZWSP', '﻿pass​word', 'password'],
    ['joiners between Latin', 'h‍e‌l‍l‌o', 'hello'],
    ['ideographic selectors', 'a\u{E0100}b\u{E01EF}c', 'abc'],
    ['FVS after Latin', 'a᠌b᠏c', 'abc'],
    ['rainbow flag stays', 'see \u{1F3F3}️‍\u{1F308} here', 'see \u{1F3F3}️‍\u{1F308} here'],
    ['keycap stays', 'see 1️⃣ here', 'see 1️⃣ here'],
  ])('%s', (_name, raw, want) => {
    expect(body(raw)).toBe(want);
  });

  it('removes every noise code point', () => {
    for (const n of [0xad, 0x34f, 0x61c, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180e, 0x200b, 0x200e, 0x200f, 0x2060, 0x3164, 0xfeff, 0xffa0, 0xe0100, 0xe01ef]) {
      expect(body(`ab${cp(n)}cd`)).toBe('abcd');
    }
  });

  it('a single-line field is trimmed', () => {
    expect(subject('  Subject here \n')).toBe('Subject here');
  });
});

const mine = (body: string, at: number, from: Message['from'] = 'you'): Message => ({ seq: 1, from, body, createdAt: new Date(at).toISOString() }) as Message;

describe('a possible match is a hint', () => {
  const start = Date.parse('2026-11-03T08:00:00Z');
  it('matches the cleaned draft of an own message inside the slack', () => {
    expect(possibleMatch([mine('pass word', start - MATCH_SLACK_MS + 1000)], 'pass​ word \n', start)).not.toBeNull();
  });
  it('never matches support’s message, an older one or other text', () => {
    expect(possibleMatch([mine('hello', start, 'support')], 'hello', start)).toBeNull();
    expect(possibleMatch([mine('hello', start - MATCH_SLACK_MS - 1000)], 'hello', start)).toBeNull();
    expect(possibleMatch([mine('hello there', start)], 'hello', start)).toBeNull();
  });
});

const page = (tickets: Partial<Ticket>[], nextCursor: string | null, dropped = 0): TicketPage => ({ tickets: tickets as Ticket[], nextCursor, dropped });

describe('the nav count is whole or absent', () => {
  it('counts unread tickets across pages, closed included', () => {
    expect(unreadCount([page([{ unread: true }, { unread: false }], 'c'), page([{ unread: true, status: 'closed' }], null)])).toBe(2);
  });
  it('is absent while a page is missing, when a page dropped rows, or at the bound with a cursor left', () => {
    expect(unreadCount([page([{ unread: true }], 'c'), undefined])).toBeNull();
    expect(unreadCount([page([{ unread: true }], null, 1)])).toBeNull();
    expect(unreadCount([page([], 'a'), page([], 'b')], 2)).toBeNull();
  });
});

describe('send verdicts', () => {
  it('busy and unavailable are definite even when the outcome reads pending', () => {
    expect(sendVerdict('pending', 'SUPPORT_BUSY')).toBe('busy');
    expect(sendVerdict('pending', 'SUPPORT_STORAGE_FULL')).toBe('unavailable');
    expect(sendVerdict('pending', 'SUPPORT_UNAVAILABLE')).toBe('unavailable');
    expect(sendVerdict('pending', undefined)).toBe('unknown');
    expect(sendVerdict('failed', 'SUPPORT_TICKET_EXPIRED')).toBe('closedForGood');
    expect(sendVerdict('failed', 'SUPPORT_DUPLICATE')).toBe('duplicate');
    expect(sendVerdict('pending', 'SUPPORT_DUPLICATE')).toBe('duplicate');
    expect(sendVerdict('done', undefined)).toBe('sent');
  });
  it('reads refusal facts from data, never from the message', () => {
    expect(textRefusal({ field: 'body', rule: 'bidi_control', at: 'input', index: 12 })).toEqual({ field: 'body', key: 'text.hidden', index: 12, cleaned: false });
    expect(textRefusal({ field: 'body', rule: 'something_new' })).toBeNull();
    expect(quotaRefusal({ limit: 'open', tier: 'banned' })).toEqual({ limit: 'open', banned: true, retryAfterS: null });
    expect(duplicateRefusal({ ticket_id: 't1', message_id: 'm1', retry_after_s: 42 })).toEqual({ ticketId: 't1', retryAfterS: 42 });
    expect(duplicateRefusal({ data: { ticket_id: 't1', retry_after_s: 1 } })).toEqual({ ticketId: 't1', retryAfterS: 1 });
    expect(duplicateRefusal({ ticket_id: 5, retry_after_s: '42' })).toEqual({ ticketId: null, retryAfterS: null });
    expect(duplicateRefusal({ ticket_id: '' })).toEqual({ ticketId: null, retryAfterS: null });
    expect(duplicateRefusal(null)).toEqual({ ticketId: null, retryAfterS: null });
  });
  it('maps the access refusals', () => {
    expect(noAccessOf('SUPPORT_NOT_FOR_ACCOUNT', 403)).toBe('member');
    expect(noAccessOf('INSUFFICIENT_PERMISSIONS', 403)).toBe('token');
    expect(noAccessOf(undefined, 403)).toBe('signIn');
    expect(noAccessOf('SUPPORT_UNAVAILABLE', 500)).toBeNull();
  });
  it('rounds waits up to one unit', () => {
    expect(waitUnit(1500)).toEqual({ unit: 'seconds', count: 2 });
    expect(waitUnit(5400_000)).toEqual({ unit: 'hours', count: 2 });
    expect(waitUnit(600_000)).toEqual({ unit: 'minutes', count: 10 });
  });
});
