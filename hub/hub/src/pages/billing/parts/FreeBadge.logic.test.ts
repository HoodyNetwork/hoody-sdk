// When the Free badge may show: only on a fresh, complete answer where every server of the person is a free one.
// Anything unknown, partial or paid hides it. GET /servers lists real rentals and free slices; a paid subserver is
// not in it (only in the subscriptions list), so both lists are read.
import { describe, expect, it } from 'vitest';
import { answersCurrent, FRESH_MS, freeOnly } from './FreeBadge.logic';

const free = (o: Record<string, unknown> = {}) => ({ id: 'a'.repeat(24), is_free_tier: true, status: 'active', ...o });
const rented = (o: Record<string, unknown> = {}) => ({ id: 'b'.repeat(24), is_free_tier: false, status: 'active', ...o });
const servers = (...rows: unknown[]) => ({ data: rows });
const subs = (rows: unknown[], total = rows.length) => ({ data: rows, total, limit: 200, offset: 0 });

describe('freeOnly', () => {
  it('shows for free servers only', () => {
    expect(freeOnly(servers(free(), free({ id: 'c'.repeat(24) })), subs([]))).toBe('free');
  });
  it('a rented server, whatever else is free, hides it', () => {
    expect(freeOnly(servers(free(), rented()), subs([]))).toBe('paid');
  });
  it('a paid subserver (only in the subscriptions list) hides it', () => {
    expect(freeOnly(servers(free()), subs([{ id: 's', state: 'active' }]))).toBe('paid');
    for (const state of ['provisioning', 'past_due', 'held', 'wiping', 'change_stuck', 'delivery_failed']) {
      expect(freeOnly(servers(free()), subs([{ id: 's', state }]))).toBe('paid');
    }
  });
  it('an ended subscription or an ended rental is not a server of theirs any more', () => {
    expect(
      freeOnly(
        servers(free()),
        subs([
          { id: 's', state: 'terminated' },
          { id: 't', state: 'host_wiped' },
        ]),
      ),
    ).toBe('free');
    expect(freeOnly(servers(free(), rented({ status: 'expired' }), rented({ status: 'terminated' })), subs([]))).toBe('free');
  });
  it('a rental on hold is still a paid server', () => {
    expect(freeOnly(servers(free(), rented({ status: 'hold' })), subs([]))).toBe('paid');
  });
  it('a row that does not say it is free is not free', () => {
    expect(freeOnly(servers(free({ is_free_tier: undefined })), subs([]))).toBe('paid');
    expect(freeOnly(servers(free({ is_free_tier: 'true' })), subs([]))).toBe('paid');
  });
  it('a row with no known status is not an ended one', () => {
    expect(freeOnly(servers(free(), rented({ status: undefined })), subs([]))).toBe('paid');
  });
  it('no server at all is nothing to show', () => {
    expect(freeOnly(servers(), subs([]))).toBe('none');
    expect(freeOnly(servers(rented({ status: 'expired' })), subs([]))).toBe('none');
  });
  it('an unreadable or partial answer is unknown, never free', () => {
    expect(freeOnly(undefined, subs([]))).toBe('unknown');
    expect(freeOnly(servers(free()), undefined)).toBe('unknown');
    expect(freeOnly({ data: 'x' }, subs([]))).toBe('unknown');
    expect(freeOnly(servers(free(), 'junk'), subs([]))).toBe('unknown');
    expect(freeOnly(servers(free()), { data: [{ state: 'terminated' }], total: 3 })).toBe('unknown');
    expect(freeOnly(servers(free()), { data: [] })).toBe('unknown');
  });
  it('partial subscriptions that already show a paid one are paid', () => {
    expect(freeOnly(servers(free()), { data: [{ state: 'active' }], total: 300 })).toBe('paid');
  });
});

describe('answersCurrent', () => {
  it('needs every answer read recently, by age alone', () => {
    const now = 1_000_000;
    expect(answersCurrent([now - 1000, now - 2000], now, FRESH_MS)).toBe(true);
    expect(answersCurrent([now - FRESH_MS - 1, now], now, FRESH_MS)).toBe(false);
    expect(answersCurrent([0, now], now, FRESH_MS)).toBe(false);
    // A clock set back after the read is not an old answer.
    expect(answersCurrent([now + 3_600_000], now, FRESH_MS)).toBe(true);
  });
});
