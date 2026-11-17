// When a server's room or AI can grow. Room: a free slice always, a paid shared
// slice only from 75 % (any of its meters) or full, a whole machine never. AI: only near or full, from the highest lane.
import { describe, expect, it } from 'vitest';
import type { LaneReading } from '@core';
import { aiUpgrade, roomUpgrade } from './upgrade';

const cap = (used: number, max: number) => ({ used, max });
const lane = (pct: number | null, off = false): LaneReading => ({ lane: 'chat', off, pct, resets: null });

describe('roomUpgrade', () => {
  it('a free slice always offers it: quiet, near from 75 %, full when full', () => {
    expect(roomUpgrade({ free: true, cap: cap(1, 4) }, false)).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(roomUpgrade({ free: true, cap: null }, false)).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(roomUpgrade({ free: true, cap: cap(3, 4) }, false)).toEqual({ available: 'plan', prominence: 'near' });
    expect(roomUpgrade({ free: true, cap: cap(4, 4) }, true)).toEqual({ available: 'plan', prominence: 'full' });
  });

  it('a paid shared slice only near or full', () => {
    expect(roomUpgrade({ free: false, kind: 'subserver', cap: cap(2, 4) }, false).available).toBe('none');
    expect(roomUpgrade({ free: false, kind: 'subserver', cap: cap(3, 4) }, false)).toEqual({ available: 'plan', prominence: 'near' });
    expect(roomUpgrade({ free: false, cap: cap(3, 3) }, true)).toEqual({ available: 'plan', prominence: 'full' });
    expect(roomUpgrade({ free: false, cap: null }, false).available).toBe('none');
  });

  it('another meter beside it (CPU, memory, disk) turns it near; a missing or broken one is ignored', () => {
    expect(roomUpgrade({ free: false, cap: cap(1, 4) }, false, [80, null, 10])).toEqual({ available: 'plan', prominence: 'near' });
    expect(roomUpgrade({ free: false, cap: cap(1, 4) }, false, [null, Number.NaN, 74]).available).toBe('none');
  });

  it('a whole machine never: nothing bigger is sold for it', () => {
    expect(roomUpgrade({ free: false, kind: 'metal', cap: cap(3, 3) }, true)).toEqual({ available: 'none', prominence: 'quiet' });
  });
});

describe('aiUpgrade', () => {
  it('near from a lane at 75 % or more, full at 100 %, otherwise none (never quiet)', () => {
    expect(aiUpgrade([lane(70), lane(10)]).available).toBe('none');
    expect(aiUpgrade([lane(80), lane(10)])).toEqual({ available: 'plan', prominence: 'near' });
    expect(aiUpgrade([lane(100), lane(10)])).toEqual({ available: 'plan', prominence: 'full' });
  });

  it('a lane that is off or has no reading does not count', () => {
    expect(aiUpgrade([lane(100, true), lane(null)]).available).toBe('none');
    expect(aiUpgrade([]).available).toBe('none');
  });
});
