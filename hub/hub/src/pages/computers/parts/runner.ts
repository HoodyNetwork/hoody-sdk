// The computers page's change runner: core's (core/storage/runner.ts, moved there from this file so Storage and Files
// run changes with the same C9 rules), one copy. The page keeps naming its own change by its key in data.ts
// (`change`); this turns it into core's `heldBy`, so a hold this page sent is told from another page's as before.
import {
  asUnknown,
  refusal,
  useHeldChangeOf,
  useHeldOf,
  useRunner as useCoreRunner,
  useShownRealm,
  type HeldChange,
  type HeldOpts as CoreHeldOpts,
  type RefusalFacts,
  type RunnerMutation,
  type RunnerResult,
} from '@core';
import { useCallback } from 'react';
import { heldBy } from '../data';

export { asUnknown, refusal, useHeldChangeOf, useHeldOf, useShownRealm, type RefusalFacts, type RunnerResult };

export interface HeldOpts<V> extends Omit<CoreHeldOpts<V>, 'heldBy'> {
  /** This page's change key (data.ts): core's heldBy tells this page's hold from another page's. */
  change?: string;
}

export function useRunner<V>(m: RunnerMutation<V>, held?: HeldOpts<V>) {
  const change = held?.change;
  // Stable per key: core's runner re-derives "elsewhere" when heldBy changes.
  const by = useCallback((h: HeldChange) => (change ? heldBy(change, h) : undefined), [change]);
  return useCoreRunner(m, held && { lock: held.lock, pick: held.pick, vars: held.vars, guess: held.guess, ...(change ? { heldBy: by } : {}) });
}
