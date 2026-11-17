// Pure functions of the __ID__ page (no React, no I/O): easy to unit-test.
import type { RecordStatus } from './data';

export const STATUSES: readonly RecordStatus[] = ['active', 'paused', 'failed'];

/** A rename is worth sending only when the trimmed name changed and is not blank. */
export function canRename(current: string, next: string): boolean {
  const name = next.trim();
  return name.length > 0 && name !== current;
}
