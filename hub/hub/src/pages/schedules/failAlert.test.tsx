// Vitest: the Schedules page's browser alert (failAlert.ts). One alert per read with a newly failed run, never on a
// row's first read (a failure already there, a row that appears later, a computer switch), never for the same failure
// read again; fixed words, never the schedule's name or command. notifyAlert's own rules are shell/notify's: a spy here.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { failuresRisen, type FailSeen, useScheduleFailAlert } from './failAlert';
import type { SchedRow } from './logic';
import strings from './strings.en.json';

const world = vi.hoisted(() => ({ alerts: [] as unknown[][] }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), notifyAlert: async (...a: unknown[]) => { world.alerts.push(a); return true; } }));

const row = (key: string, k: string, at?: number | null): SchedRow =>
  ({ key, label: { text: 'nightly backup of payroll' }, last: { k, ...(at !== undefined ? { at } : {}) } }) as unknown as SchedRow;
const keys = (rs: SchedRow[]) => rs.map((r) => r.key);

beforeEach(() => { world.alerts = []; });

describe('failuresRisen', () => {
  it('a first read records every row and returns none, a failure already there included', () => {
    const seen: FailSeen = new Map();
    expect(failuresRisen(seen, [row('a', 'failed', 100), row('b', 'worked', 90)])).toEqual([]);
  });

  it('a later failure of a row returns it once; the same failure read again returns none', () => {
    const seen: FailSeen = new Map();
    failuresRisen(seen, [row('a', 'worked', 100)]);
    expect(keys(failuresRisen(seen, [row('a', 'failed', 200)]))).toEqual(['a']);
    expect(failuresRisen(seen, [row('a', 'failed', 200)])).toEqual([]);
  });

  it('a lost run counts as failed', () => {
    const seen: FailSeen = new Map();
    failuresRisen(seen, [row('a', 'worked', 100)]);
    expect(keys(failuresRisen(seen, [row('a', 'lost', 200)]))).toEqual(['a']);
  });

  it('a row already failed alerts only for a newer failure, not an older or equal one', () => {
    const seen: FailSeen = new Map();
    failuresRisen(seen, [row('a', 'failed', 100)]);
    expect(failuresRisen(seen, [row('a', 'failed', 100)])).toEqual([]);
    expect(failuresRisen(seen, [row('a', 'failed', 50)])).toEqual([]);
    expect(keys(failuresRisen(seen, [row('a', 'failed', 101)]))).toEqual(['a']);
  });

  it('a failure after a worked run, after an earlier failure, alerts', () => {
    const seen: FailSeen = new Map();
    failuresRisen(seen, [row('a', 'failed', 100)]);
    expect(failuresRisen(seen, [row('a', 'worked', 150)])).toEqual([]);
    expect(keys(failuresRisen(seen, [row('a', 'failed', 200)]))).toEqual(['a']);
  });

  it('a row that appears on a later read is only recorded, even when failed', () => {
    const seen: FailSeen = new Map();
    failuresRisen(seen, [row('a', 'worked', 100)]);
    expect(failuresRisen(seen, [row('a', 'worked', 100), row('b', 'failed', 300)])).toEqual([]);
  });

  it('a failed run without a time never alerts', () => {
    const seen: FailSeen = new Map();
    failuresRisen(seen, [row('a', 'worked', 100)]);
    expect(failuresRisen(seen, [row('a', 'failed', null)])).toEqual([]);
    expect(failuresRisen(seen, [row('a', 'failed')])).toEqual([]);
    expect(failuresRisen(seen, [row('a', 'failed', Number.NaN)])).toEqual([]);
  });
});

describe('useScheduleFailAlert', () => {
  const mount = (rows: SchedRow[] | undefined, scope: string) =>
    renderHook(({ r, s }: { r: SchedRow[] | undefined; s: string }) => useScheduleFailAlert(r, s), { initialProps: { r: rows, s: scope } });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('the first read alerts nothing; one new failure alerts once with fixed words and that schedule', async () => {
    const h = mount([row('cron:user/a1', 'failed', 100), row('cron:user/b2', 'worked', 100)], 'c1');
    await flush();
    expect(world.alerts).toEqual([]);
    h.rerender({ r: [row('cron:user/a1', 'failed', 100), row('cron:user/b2', 'failed', 200)], s: 'c1' });
    await flush();
    expect(world.alerts).toEqual([['schedule', { title: strings['alert.failTitle'], body: strings['alert.failBody'], tag: 'cron:user/b2', to: '/schedules?sel=cron%3Auser%2Fb2' }]]);
    expect(JSON.stringify(world.alerts)).not.toContain('payroll');
    h.rerender({ r: [row('cron:user/a1', 'failed', 100), row('cron:user/b2', 'failed', 200)], s: 'c1' });
    await flush();
    expect(world.alerts).toHaveLength(1);
  });

  it('two new failures in one read alert once, opening the list', async () => {
    const h = mount([row('a', 'worked', 1), row('b', 'worked', 1)], 'c1');
    h.rerender({ r: [row('a', 'failed', 2), row('b', 'failed', 2)], s: 'c1' });
    await flush();
    expect(world.alerts).toEqual([['schedule', { title: strings['alert.failTitle'], body: strings['alert.failBody'], to: '/schedules' }]]);
  });

  it('another computer\'s rows are a first read: its failures never alert', async () => {
    const h = mount([row('a', 'worked', 1)], 'c1');
    h.rerender({ r: [row('a', 'failed', 500)], s: 'c2' });
    await flush();
    expect(world.alerts).toEqual([]);
  });

  it('rows not read yet change nothing', async () => {
    const h = mount([row('a', 'worked', 1)], 'c1');
    h.rerender({ r: undefined, s: 'c1' });
    h.rerender({ r: [row('a', 'failed', 2)], s: 'c1' });
    await flush();
    expect(world.alerts).toHaveLength(1);
  });
});
