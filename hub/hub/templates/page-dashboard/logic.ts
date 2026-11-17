// Pure functions of the __ID__ page (no React, no I/O): easy to unit-test.
import type { ItemStatus, Stats } from './data';

export const STATUSES: readonly ItemStatus[] = ['active', 'paused', 'failed'];

/** Runs in the last 24 hours, the caption figure under the sparkline. */
export function runsToday(stats: Stats): number {
  let n = 0;
  for (const v of stats.perHour) n += v;
  return n;
}
