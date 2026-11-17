// Change shell: the kept changes, one record per computer and session (memory only, this load).
//
// Contract, in plain words:
//   - commit(k, from, to, bump) is the only writer: it writes only while the kept record of k is still `from` (a
//     compare-and-set), so an answer, a check or a cleanup replaces only the record it saw. `bump` also moves k's read
//     generation: every dialog showing k reads its sessions again, so none keeps the facts of a shell that is gone.
//     Subscribers are told after each write (useShellChange reads it through useSyncExternalStore).
//   - reserve(k, rec) keeps a new record only where none is, or over one that may be sent again (an ending that went
//     through, or an unknown start a read found nothing for). It returns what it replaced (none: undefined), so a
//     reserved send that cannot leave puts it back; null when it refused.
//   - An opening owns the records it made, from its mount effect to its cleanup (own / disown; never in a render).
//     owns(rec) is whether the opening that made rec is still mounted: only then is anything sent for it. disown
//     ends the opening and drops its own records still reading (nothing sent); a record that has sent stays,
//     ownerless, until an answer, a check or a warned Dismiss settles it.
import { useSyncExternalStore } from 'react';
import type { TermSession } from '../termSessions';

export type Phase = 'choose' | 'reading' | 'ending' | 'endUnknown' | 'start' | 'starting' | 'startUnknown';

// A kept change: the read before an ending ('reading', nothing sent), a send not answered yet ('ending',
// 'starting'), one whose outcome is unknown ('endUnknown', 'startUnknown'; `retry` once a read found nothing listed
// after a start), or an ending that went through ('start'). `owner` is the opening that made it; `over` marks a
// Start again kept over an unknown start.
export interface Held {
  readonly phase: Phase;
  readonly before: TermSession | null;
  readonly shell: string | undefined;
  readonly retry?: boolean;
  readonly owner?: object;
  readonly over?: boolean;
}

const recs = new Map<string, Held>();
const gens = new Map<string, number>();
const subs = new Set<() => void>();
const live = new Set<object>();

/** Tests: forget every kept change. */
export function resetShellChanges(): void {
  recs.clear();
  gens.clear();
  live.clear();
  for (const f of [...subs]) f();
}

export const current = (k: string): Held | undefined => recs.get(k);
export const generation = (k: string): number => gens.get(k) ?? 0;

export function commit(k: string, from: Held | undefined, to: Held | null, bump = false): boolean {
  if (recs.get(k) !== from) return false;
  if (to) recs.set(k, to);
  else recs.delete(k);
  if (bump) gens.set(k, generation(k) + 1);
  for (const f of [...subs]) f();
  return true;
}

export function reserve(k: string, rec: Held): Held | undefined | null {
  const h = recs.get(k);
  if (h && h.phase !== 'start' && !(h.phase === 'startUnknown' && h.retry)) return null;
  return commit(k, h, rec) ? h : null;
}

export function own(tok: object): void {
  live.add(tok);
}
export function disown(tok: object): void {
  live.delete(tok);
  for (const [k, h] of [...recs]) if (h.owner === tok && h.phase === 'reading') commit(k, h, null);
}
export const owns = (rec: Held): boolean => !!rec.owner && live.has(rec.owner);

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** The kept record of k and k's read generation, as of the last commit. */
export function useShellChange(k: string): { rec: Held | undefined; gen: number } {
  const rec = useSyncExternalStore(subscribe, () => recs.get(k));
  const gen = useSyncExternalStore(subscribe, () => generation(k));
  return { rec, gen };
}
