// New script's Build step, the pure part (split out of StepBuild.tsx so the terminal build shares it; the notes are at
// the top of StepBuild.tsx): the build answer's reading and the tab's repair maps (maps, repairGens, admitting: one
// instance each, the ones useBuild uses). StepBuild.tsx re-exports the public names; maps, admitting, repairGen and
// Answer are for StepBuild.tsx.
import type { useBuildApi } from '../data';
import type { ExtractError } from '../logic';
import { answerCode, type SecretMap } from './prompt';
import type { Refused } from './records';

/** Five minutes in: a note only; the reads go on. */
export const SLOW_MS = 5 * 60_000;

export type Build =
  | { k: 'idle' }
  | { k: 'starting' }
  | { k: 'running'; n: number }
  | { k: 'stopping'; n: number }
  | { k: 'ready'; n: number; code: string; summary: string; beforeStop?: boolean }
  | { k: 'no_script'; n: number; why: ExtractError | 'none' | 'map_lost' | 'unknown_placeholder' }
  | { k: 'failed'; n: number; code: string }
  | { k: 'stopped'; n: number }
  | { k: 'unknown'; n: number; stop?: boolean }
  | { k: 'refused'; why: RefusedWhy }
  | { k: 'not_sent'; n: number };

/** Why no attempt was started, or its answer is not the draft's: the words under flow.built.refused.*. */
export type RefusedWhy = 'stale' | 'full' | 'unreadable' | 'deploying' | 'input' | 'placeholder';

/** A record move's refusal as the step says it: another tab moved the draft on (stale), the draft is being made live or is
 *  done (deploying), the store is full, or the store could not be read or written (unreadable). */
export function refusedOf(why: Refused | undefined): RefusedWhy {
  if (why === 'stale') return 'stale';
  if (why === 'state') return 'deploying';
  if (why === 'full' || why === 'too_large') return 'full';
  return 'unreadable';
}

export type Answer = Awaited<ReturnType<ReturnType<typeof useBuildApi>['start']>>;

/**
 * An answer of attempt n as the step's state. `stopping`: Stop was pressed while it ran. `map`: the secret map of a fix attempt
 * as this tab holds it (prompt.ts answerCode): a fix answer without it, or with a placeholder it does not know, is never applied.
 */
export function buildOf(n: number, a: Answer | null, stopping = false, repair: { fix: boolean; map: SecretMap | null } = { fix: false, map: null }): Build {
  if (!a || a.outcome === 'pending' || a.outcome === 'stale') return { k: 'unknown', n };
  if (a.outcome === 'not_sent') return { k: 'not_sent', n };
  if (a.outcome === 'failed') return a.code === 'cancelled' ? { k: 'stopped', n } : { k: 'failed', n, code: a.code ?? '' };
  const reply = a.data?.reply;
  if (typeof reply !== 'string') return { k: 'no_script', n, why: 'none' };
  const x = answerCode(reply, repair);
  if (!x.ok) return { k: 'no_script', n, why: x.why };
  return { k: 'ready', n, code: x.code, summary: x.summary, ...(stopping ? { beforeStop: true } : {}) };
}
export const maps = new Map<string, SecretMap>();
// A fix being admitted holds the generation of its draft taken at start; dropping the draft bumps it, so an admission that
// ends after the drop keeps no map (the draft's memory is gone, and its map with it). Entries are never removed: a removed
// generation would read 0 again and match a start taken before the drop.
const repairGens = new Map<string, number>();
export const admitting = new Map<string, number>();
export const repairGen = (draftId: string) => repairGens.get(draftId) ?? 0;
/** Drops the secret maps of every draft `keep` does not keep (Flow, with the draft memory), and fences their admissions. */
export function forgetRepairs(keep: (draftId: string) => boolean): void {
  for (const k of [...maps.keys()]) if (!keep(k.slice(0, k.lastIndexOf('#')))) maps.delete(k);
  for (const id of admitting.keys()) if (!keep(id)) repairGens.set(id, repairGen(id) + 1);
}
