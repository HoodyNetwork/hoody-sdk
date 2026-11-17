// Pure functions of the __ID__ page (no React, no I/O): easy to unit-test. Search, filters and
// sort are NOT here: useDataView owns them.
import type { Item, ItemStatus } from './data';

export const STATUSES: readonly ItemStatus[] = ['active', 'paused', 'failed'];

/** Attention first: failed, then paused, then active (the default order of the list). */
export function attentionRank(status: ItemStatus): number {
  return status === 'failed' ? 0 : status === 'paused' ? 1 : 2;
}

/** The figures of the stat strip: every row, never the filtered view. */
export function summarize(rows: readonly Item[]): { count: number; failed: number; sizeBytes: number } {
  let failed = 0;
  let sizeBytes = 0;
  for (const r of rows) {
    if (r.status === 'failed') failed += 1;
    sizeBytes += r.sizeBytes;
  }
  return { count: rows.length, failed, sizeBytes };
}
