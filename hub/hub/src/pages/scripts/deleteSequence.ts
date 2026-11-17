// The delete of a script is one sequence (its public links off, the script, its saved tests) whose state must outlive the Settings
// tab that started it: a tab left and entered again while a step is out must find the sequence still running, and the cleanup a
// pending script delete still owes must be done once whichever mount proves it. The state lives here, by script (computer and
// path); the changes themselves and their holds stay in core.
import type { Target } from '@core';
import { useSyncExternalStore } from 'react';

/**
 * running: a step is out (links, script) or the tab is between steps; script-pending: the script delete may have gone through and
 * is held; tests-running: the saved-tests delete is out; tests-pending: it may have gone through and is held.
 */
export type Stage = 'running' | 'script-pending' | 'tests-running' | 'tests-pending';

/** What the saved-tests step owes: undefined = the tests read never answered, null = answered with no saved set, else its revision. */
export type TestsOwed = string | null | undefined;

export interface Sequence {
  stage: Stage;
  tests: TestsOwed;
  /** The computer the delete was confirmed on: every step names it. */
  target: Target | null;
  /** The saved-tests step, once started: concurrent proofs await this one run. */
  cleanup?: Promise<'done' | 'pending'>;
  /** The page was told the delete is over (once). */
  told: boolean;
}

const entries = new Map<string, Sequence>();
let version = 0;
const listeners = new Set<() => void>();
const bump = (): void => { version++; for (const l of listeners) l(); };

export const sequenceKey = (compId: string, path: string): string => `${compId}\u0000${path}`;
export const sequenceOf = (key: string): Sequence | undefined => entries.get(key);
const inFlight = (e: Sequence | undefined): boolean => !!e && (e.stage === 'running' || e.stage === 'tests-running');

/**
 * Start a sequence, or null when one is in flight for this script (a step is out, the saved-tests step is out). A held stage is not
 * a reason to refuse here: core's lock on the held change keeps Delete off, and a stale held entry (its hold proven or closed
 * elsewhere) is replaced by the new press.
 */
export function beginSequence(key: string, tests: TestsOwed, target: Target | null): Sequence | null {
  if (inFlight(entries.get(key))) return null;
  const e: Sequence = { stage: 'running', tests, target, told: false };
  entries.set(key, e);
  bump();
  return e;
}

export function moveSequence(key: string, e: Sequence, stage: Stage): void {
  if (entries.get(key) !== e) return;
  e.stage = stage;
  bump();
}

/** The sequence is over (done, refused, stopped, or its hold closed by its own sender): nothing is owed any more. */
export function endSequence(key: string, e?: Sequence): void {
  const cur = entries.get(key);
  if (!cur || (e && cur !== e)) return;
  entries.delete(key);
  bump();
}

/** Is a step of this script's delete out (or the tab between steps)? Re-renders on every change. */
export function useSequenceBusy(key: string): boolean {
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => version,
  );
  return inFlight(entries.get(key));
}

export function resetSequencesForTests(): void {
  entries.clear();
  bump();
}
