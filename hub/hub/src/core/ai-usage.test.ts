// Vitest: the AI lane rules Billing's usage table and the Servers cards share (core/ai-usage.ts).
// No reading is never shown as 0; percents step by 10 and stay within 0-100; the order is LANES order.
import { describe, expect, it } from 'vitest';
import { LANES, clock, laneLevel, laneWords, readLanes } from './ai-usage';

const AT = '2026-10-26T15:00:00Z';

describe('readLanes', () => {
  it('reads ok and off lanes in LANES order, whatever order the answer uses', () => {
    const got = readLanes({ speech: { status: 'off' }, chat: { status: 'ok', percent_used: 47, resets_at: AT }, search: { status: 'ok', percent_used: 0 } });
    expect(got).toEqual([
      { lane: 'chat', off: false, pct: 40, resets: AT },
      { lane: 'search', off: false, pct: 0, resets: null },
      { lane: 'speech', off: true, pct: null, resets: null },
    ]);
  });

  it('skips a lane that is missing, not an object, or neither ok nor off: no reading is never a 0', () => {
    expect(readLanes({ chat: { status: 'error', percent_used: 0 }, decisions: undefined, search: 'ok' as never, extra: { status: 'ok', percent_used: 10 } })).toEqual([]);
    expect(readLanes(null)).toEqual([]);
    expect(readLanes(undefined)).toEqual([]);
    expect(readLanes('x' as never)).toEqual([]);
  });

  it('a percent that is not a whole number from 0 to 100 has no reading; 100 stays 100', () => {
    const pct = (n: unknown) => readLanes({ chat: { status: 'ok', percent_used: n as number } })[0]?.pct;
    expect(pct(101)).toBeNull();
    expect(pct(-10)).toBeNull();
    expect(pct(12.5)).toBeNull();
    expect(pct('50')).toBeNull();
    expect(pct(undefined)).toBeNull();
    expect(pct(100)).toBe(100);
    expect(pct(99)).toBe(90);
    expect(pct(9)).toBe(0);
  });

  it('keeps the drop-back time only for a valid date on a lane with some use', () => {
    expect(readLanes({ chat: { status: 'ok', percent_used: 30, resets_at: 'soon' } })[0]?.resets).toBeNull();
    expect(readLanes({ chat: { status: 'ok', percent_used: 5, resets_at: AT } })[0]?.resets).toBeNull();
    expect(readLanes({ chat: { status: 'ok', percent_used: 30, resets_at: AT } })[0]?.resets).toBe(AT);
  });

  it('knows the five lanes', () => {
    expect(LANES).toEqual(['chat', 'decisions', 'search', 'speech', 'transcription']);
  });
});

describe('laneWords', () => {
  const r = (o: Partial<Parameters<typeof laneWords>[0]>) => laneWords({ lane: 'chat', off: false, pct: null, resets: null, ...o });
  it('says off, no reading, and not used yet apart', () => {
    expect(r({ off: true, pct: 50 })).toEqual({ k: 'aiu.off' });
    expect(r({ pct: null })).toEqual({ k: 'aiu.unknown' });
    expect(r({ pct: 0 })).toEqual({ k: 'aiu.none' });
  });
  it('says the percent, and when it drops back when known', () => {
    expect(r({ pct: 40 })).toEqual({ k: 'aiu.used', v: { pct: 40 } });
    expect(r({ pct: 40, resets: AT })).toEqual({ k: 'aiu.usedUntil', v: { pct: 40, time: clock(AT) } });
    expect(r({ pct: 100 })).toEqual({ k: 'aiu.full' });
    expect(r({ pct: 100, resets: AT })).toEqual({ k: 'aiu.fullUntil', v: { time: clock(AT) } });
    expect(r({ pct: 40, resets: 'nope' })).toEqual({ k: 'aiu.used', v: { pct: 40 } });
  });
});

describe('laneLevel and clock', () => {
  it('is high from 80 and full at 100; no reading is low', () => {
    expect([null, 0, 70, 79, 80, 90, 99, 100].map(laneLevel)).toEqual(['low', 'low', 'low', 'low', 'high', 'high', 'high', 'full']);
  });
  it('reads only a valid date string', () => {
    expect(clock(AT)).toMatch(/\d{1,2}:\d{2}/);
    expect(clock('x')).toBeNull();
    expect(clock(12)).toBeNull();
  });
});
