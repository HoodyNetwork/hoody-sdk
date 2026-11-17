// Pure functions of the __ID__ page (no React, no I/O): easy to unit-test.
import type { OutcomeKind } from '@kit';
import type { Existing } from './data';

/** Why a name can't be used, as a strings key, or undefined when it can. */
export function nameProblem(name: string, existing: readonly Existing[]): 'name.required' | 'name.taken' | undefined {
  const n = name.trim();
  if (n === '') return 'name.required';
  return existing.some((e) => e.name === n) ? 'name.taken' : undefined;
}

/**
 * The create's outcome after a read-back (C9): an unknown create that now shows up under its
 * name is done. Anything else stays as it was; nothing is ever sent again from here.
 */
export function settle(outcome: OutcomeKind | undefined, name: string, existing: readonly Existing[] | undefined): OutcomeKind | undefined {
  if (outcome !== 'pending' || !existing) return outcome;
  return existing.some((e) => e.name === name.trim()) ? 'done' : 'pending';
}

/** "$12.00" for 1200 cents. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
