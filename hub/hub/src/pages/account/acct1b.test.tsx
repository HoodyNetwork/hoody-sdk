// Vitest: the SSH-key and security-history answers that are not what they should
// be (a failed read, never a shorter list). The name lock core keeps across a reload: acct1b-armed.test.tsx (live core).
import { bootFixtureCore } from '@core';
import { renderPage, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { computerKeysOf, historyPageOf, COMPUTER_KEYS_LIMIT } from './data';
import page from './page';
import strings from './strings.en.json';

const box = (i: number, extra: Record<string, unknown> = {}) => ({ id: `c${i}`, name: `box-${i}`, ssh_public_key: null, ...extra });
const keysAnswer = (computers: unknown, pagination?: unknown) => ({ data: { computers, ...(pagination === undefined ? {} : { pagination }) } });
const event = (i: number) => ({ id: i.toString(16).padStart(24, '0'), event: 'login', outcome: 'success', created_at: '2026-10-01T00:00:00Z' });

describe('the SSH-key answer', () => {
  it('a computer row without an id is a failed read, never a shorter list', () => {
    expect(() => computerKeysOf(keysAnswer([box(1), { name: 'no-id' }]))).toThrow();
    expect(() => computerKeysOf(keysAnswer([{}]))).toThrow();
    expect(() => computerKeysOf(keysAnswer(['c1']))).toThrow();
  });
  it('a key that is not text is a failed read, never "No key"', () => {
    expect(() => computerKeysOf(keysAnswer([box(1, { ssh_public_key: { k: 1 } })]))).toThrow();
    expect(() => computerKeysOf(keysAnswer([box(1, { ssh_public_key: 7 })]))).toThrow();
  });
  it('a computer without a name shows its id; no key and an empty key are "No key"', () => {
    const r = computerKeysOf(keysAnswer([{ id: 'c9' }, box(2, { ssh_public_key: '  ' })], { totalPages: 1 }));
    expect(r.rows.map((x) => [x.name, x.key])).toEqual([['c9', null], ['box-2', null]]);
    expect(r.whole).toBe(true);
  });
  it('a full page without a page count is not known to be the whole list', () => {
    const full = Array.from({ length: COMPUTER_KEYS_LIMIT }, (_, i) => box(i));
    expect(computerKeysOf(keysAnswer(full)).whole).toBe(false);
    expect(computerKeysOf(keysAnswer(full.slice(1))).whole).toBe(true);
    expect(computerKeysOf(keysAnswer(full, { totalPages: 2 })).whole).toBe(false);
  });
});

describe('the security-history answer', () => {
  it('a page count that is not a whole number of pages is a failed read', () => {
    for (const pages of ['2', -1, 1.5, Number.NaN, {}]) expect(() => historyPageOf({ data: [event(1)], metadata: { pages } })).toThrow();
  });
  it('a missing page count is unknown, and a valid one is kept', () => {
    expect(historyPageOf({ data: [event(1)] }).pages).toBeNull();
    expect(historyPageOf({ data: [event(1)], metadata: { pages: 3 } }, 2)).toMatchObject({ pages: 3, page: 2 });
  });
});

describe('history pages without a count', () => {
  it('a full page whose answer gave no page count loads on, up to the cap, and says only the newest show', async () => {
    bootFixtureCore();
    await renderPage(page, { state: 'history-uncounted' });
    expect(await screen.findByText(strings['h.capped'], {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('the SSH-key answer: an empty computer id', () => {
  it('a computer with an empty id is a failed read', () => {
    expect(() => computerKeysOf(keysAnswer([{ id: '', name: 'box' }]))).toThrow();
  });
});
