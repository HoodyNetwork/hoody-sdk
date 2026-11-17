import { describe, expect, it } from 'vitest';
import type { RawSub } from './types';
import { WIDGET_ROWS, widgetSubs } from './widget.logic';

const NOW = Date.parse('2026-10-24T00:00:00Z');
const day = (n: number) => new Date(NOW + n * 86400000).toISOString();
const sub = (id: string, state: string, over: Partial<RawSub> = {}): RawSub => ({ id, state, server_name: id, paid_through: day(10), auto_renew: true, active_operation_id: null, ...over });
const ids = (subs: RawSub[], limit?: number) => widgetSubs(subs, limit, NOW).map((r) => r.host);

describe('widgetSubs', () => {
  it('lists what needs paying first, then the soonest to run out', () => {
    const subs = [sub('far', 'active', { paid_through: day(40) }), sub('soon', 'active', { paid_through: day(3) }), sub('unpaid', 'past_due', { paid_through: day(-2) }), sub('hold', 'held', { paid_through: day(-20), delete_at: day(5) })];
    expect(ids(subs, 4).slice(0, 2).sort()).toEqual(['hold', 'unpaid']);
    expect(ids(subs, 4).slice(2)).toEqual(['soon', 'far']);
  });
  it('what needs paying leads even when its date is later than a healthy server\'s', () => {
    const subs = [sub('soon', 'active', { paid_through: day(2) }), sub('unpaid', 'past_due', { paid_through: day(100) })];
    expect(ids(subs)).toEqual(['unpaid', 'soon']);
  });
  it('lists at most the limit, three by default', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((x, i) => sub(x, 'active', { paid_through: day(i + 1) }));
    expect(WIDGET_ROWS).toBe(3);
    expect(ids(many)).toEqual(['a', 'b', 'c']);
  });
  it('leaves ended servers out, and puts a server with no date after the dated ones', () => {
    const subs = [sub('gone', 'terminated'), sub('wiped', 'host_wiped'), sub('wiping', 'wiping'), sub('nodate', 'active', { paid_through: null }), sub('dated', 'active', { paid_through: day(5) })];
    expect(ids(subs)).toEqual(['dated', 'nodate']);
  });
  it('skips rows with no id or state instead of failing', () => {
    expect(ids([{ id: '', state: 'active' } as RawSub, { id: 'x' } as RawSub, sub('ok', 'active')])).toEqual(['ok']);
  });
  it('says nothing about servers it was not given', () => {
    expect(ids([])).toEqual([]);
  });
});
