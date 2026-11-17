// testing.ts: what tests (and accept/seam.ts) need of the journal's internals. Imported only by test files and by
// pages/apps/github/testing.ts (journal.conformance.test.ts checks it). Nothing here is reachable from production code.
import { withDest, type Dest } from '../data';
import { type Journal, internalsOf } from './index';
import { dismissal, type Dismissal } from './proof';
import { resetDoorForTests } from './door';
import { resetHeldForTests } from './held';
import { validEntry } from './entries';
import { currentAccount, resetStoresForTests } from './storage';
import type { Entry } from './types';

export { resetDoorForTests, resetHeldForTests, resetStoresForTests };
export { evidenceOf } from './evidence';
export const recordsForTests = (j: Journal) => internalsOf(j).records;
export const dismissalForTests = (): Dismissal => dismissal();
/** Marks `key` as minted by `j`, as if mint() had returned it. */
export function mintForTests(j: Journal, key: string): void { internalsOf(j).door.mintForTests(key); }
/** Plants a stored request entry (a request another tab or an earlier page life wrote), without the door. */
export function seedEntryForTests(j: Journal, e: Entry): 'ok' | 'account' | 'exists' | 'full' | 'unreadable' | 'failed' {
  const v = validEntry(e);
  const { entries } = internalsOf(j);
  return v ? entries.put(v, currentAccount()) : 'failed';
}
export { bindDestForTests, resetPageForTests } from './pageReset';
export { withDest, type Dest };
