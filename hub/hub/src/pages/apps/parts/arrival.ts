// The launches this tab started whose app has not shown yet (the Board tile's launch card).
//
// Contract, in plain words:
//   - A launch is marked when this tab sends its Open (live.ts liveOpen), with the time it was sent; the card counts
//     its elapsed time from there.
//   - The mark goes once the row reads `ready` (its window appeared, or its port listens), once it reads `running`
//     with ipv6Only (settled: no `ready` will come), once the row is forgotten, on an account or realm switch (the
//     ops epoch moves), when the row turns out to be a terminal app (no card is ever shown for one), or when the
//     person shows the program anyway (shown).
//   - Only this tab's launches are marked: a launch read back after a reload or listed from another tab is never,
//     since a closed window reads `running` again and the Hub cannot tell whether it already showed once.
//   - An ended launch (exited, not_started) keeps its mark, so its tile says it ended before it was there.
import { useSyncExternalStore } from 'react';
import { ops } from './ops';

const since = new Map<string, number>();
const fans = new Set<() => void>();
let version = 0;
let epoch = ops.get().epoch;

function bump(): void {
  version++;
  for (const f of fans) f();
}

/** Marks `key` as sent now (a second Open of the same row starts its time again). */
export function arriving(key: string, at = Date.now()): void {
  since.set(key, at);
  bump();
}

/** The person shows the program in the tile anyway: the card leaves; the launch is untouched. */
export function shown(key: string): void {
  if (since.delete(key)) bump();
}

/** When this tab sent the Open of `key`, while its app has not shown yet. */
export const arrivalOf = (key: string): number | undefined => since.get(key);

// Every store change: drop the marks the rows now settle.
ops.subscribe(() => {
  const s = ops.get();
  if (s.epoch !== epoch) {
    epoch = s.epoch;
    if (since.size) {
      since.clear();
      bump();
    }
    return;
  }
  let changed = false;
  for (const key of [...since.keys()]) {
    const p = s.patches.get(key);
    if (s.forgotten.has(key) || p?.opensIn === 'terminal' || p?.state === 'ready' || (p?.state === 'running' && p.ipv6Only)) {
      since.delete(key);
      changed = true;
    }
  }
  if (changed) bump();
});

function follow(f: () => void): () => void {
  fans.add(f);
  return () => fans.delete(f);
}

/** arrivalOf(key), following its changes. */
export function useArrival(key: string | undefined): number | undefined {
  useSyncExternalStore(follow, () => version);
  return key ? since.get(key) : undefined;
}

/** The time since `since`, as the card says it: whole seconds under a minute, else minutes and seconds (the
 *  strings key and its values). */
export function elapsedOf(now: number, since: number): { key: 'card.elapsed.s' | 'card.elapsed.m'; v: { m: number; s: number } } {
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return { key: secs < 60 ? 'card.elapsed.s' : 'card.elapsed.m', v: { m: Math.floor(secs / 60), s: secs < 60 ? secs : secs % 60 } };
}

/** Tests: no marks. */
export function resetArrivals(): void {
  since.clear();
  bump();
}
