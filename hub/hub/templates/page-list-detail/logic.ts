// Pure functions of the __ID__ page (no React, no I/O): easy to unit-test. Search, filters and
// sort are NOT here: useDataView owns them.
import type { ItemStatus } from './data';

export const STATUSES: readonly ItemStatus[] = ['active', 'paused', 'failed'];

/** Attention first: failed, then paused, then active (the default order of the list). */
export function attentionRank(status: ItemStatus): number {
  return status === 'failed' ? 0 : status === 'paused' ? 1 : 2;
}
