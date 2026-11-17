// kit/cron: the preset model. pages/schedules/logic.ts re-exports it (its own tests cover it there too). A script's schedule picker and words read the same functions.
import { describe, expect, it } from 'vitest';
import * as kit from './cron';

describe('kit/cron', () => {
  it('round-trips exec presets and keeps anything else as written', () => {
    expect(kit.toExpr('exec', { k: 'weekly', h: 8, m: 0, days: [1, 5] })).toBe('0 8 * * 1,5');
    expect(kit.recognise('exec', '0 8 * * 1,5')).toEqual({ k: 'weekly', h: 8, m: 0, days: [1, 5] });
    expect(kit.recognise('exec', '0 08 * * *')).toEqual({ k: 'custom', expr: '0 08 * * *' });
  });

  it('calculates the next runs in UTC with offset 0', () => {
    const now = Date.UTC(2026, 10, 10, 7, 59);
    const pv = kit.nextRuns('0 8 * * *', now, 0, 2);
    expect(pv).toEqual({ ok: true, never: false, runs: [Date.UTC(2026, 10, 10, 8, 0), Date.UTC(2026, 10, 11, 8, 0)] });
    expect(kit.nextRuns('@daily', now, 0)).toEqual({ ok: false, field: null });
  });
});
