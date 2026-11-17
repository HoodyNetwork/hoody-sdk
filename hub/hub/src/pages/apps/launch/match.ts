// Whether a launch sits at a tile's place: the one rule LaunchHold holds by, read synchronously from the launch
// store and the recent list, with none of the launcher's run code. links.ts re-exports useLaunchHeld and
// placeOfTile so the Board mounts the launcher (a lazy chunk) only on a tile the launcher would hold; every other
// tile renders its frame at once.
//
// Both the store (useOps) and another tab's writes to the recent list (a storage event on its raw key, or a clear)
// are followed, so a launch another tab stores at a place holds a tile already showing its frame at once.
//
// The account's Open-with holds (core attempts, sender apps:openwith) with a handle are a third source
// as well: a hold whose handle names this place holds the tile even when its recent row was pushed
// out (cap 20) or never saved. They are read synchronously and followed through subscribeAttempts.
import { hostEnv, attemptsVersion, subscribeAttempts } from '@core';
import { useMemo, useSyncExternalStore } from 'react';
import { placeOfTile, storedAt, heldAt } from './match.pure';
import type { Snap } from './match.pure';
export { placeOfTile, storedAt, heldAt } from './match.pure';
export type { HoldComputer, HoldTile, AnyTile } from './match.pure';
import type { HoldComputer, AnyTile } from './match.pure';
import { useOps } from '../parts/ops';
import { runAt, type Placement } from './placement';

/** A launch of this session at the place (not dismissed), a stored one not listed yet (a reload, another tab), or an
 *  Open-with hold there. */
function launchMatched(s: Snap, project: string, cid: string, at: Placement, live: boolean): boolean {
  for (const l0 of s.launches) {
    const run = s.runs.get(l0.key);
    if (run && !s.forgotten.has(l0.key) && runAt(run, cid, at)) return true;
  }
  return storedAt(s, project, cid, at, live).length > 0 || heldAt(project, cid, at, live).length > 0;
}

// Another tab's writes to the recent list: one window listener while any match is mounted, and a count of the
// writes heard, which the match reads by (the stored rows themselves are read from storage, never from the event).
const storedFans = new Set<() => void>();
let storedRev = 0;
let stopStored: (() => void) | null = null;
function heardStored(key: string | null): void {
  if (key !== null && key !== 'hub_apps_recent_v2') return;
  storedRev++;
  for (const f of storedFans) f();
}
function followStored(f: () => void): () => void {
  if (storedFans.size === 0) {
    stopStored = hostEnv().onExternalChange((_area, key) => heardStored(key));
    // Nobody listened between this match's render and now: a write in that gap was not heard. A new count makes
    // React's check after subscribing render again, so storage is read once more (a later match is covered by
    // the count the listener already keeps).
    storedRev++;
  }
  storedFans.add(f);
  return () => {
    storedFans.delete(f);
    if (storedFans.size === 0) { stopStored?.(); stopStored = null; }
  };
}
const storedNow = (): number => storedRev;

/** launchMatched for a mounted tile: re-read on store changes and on another tab's write to the recent list.
 *  No place or no computer: false. */
export function useLaunchMatched(project: string, cid: string, at: Placement | null, live: boolean): boolean {
  const s = useOps();
  const rev = useSyncExternalStore(followStored, storedNow);
  const holds = useSyncExternalStore(subscribeAttempts, attemptsVersion);
  const atKey = at ? JSON.stringify(at) : '';
  return useMemo(
    () => !!at && !!cid && launchMatched(s, project, cid, at, live),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the place by value, not its object; rev: another tab's write; holds: a hold changed
    [s, rev, holds, cid, project, atKey, live],
  );
}

/** Whether the Board should mount the launcher's hold on this tile (synchronous; re-renders on store changes and
 *  on another tab's write to the recent list).
 *  `live`: whether live reads list stored rows (the build's, as data.ts LIVE; tests pass their own). */
export function useLaunchHeld(computer: HoldComputer | null | undefined, tile: AnyTile | null | undefined, live = !__HUB_FIXTURES__): boolean {
  return useLaunchMatched(computer?.project_id ?? '', computer?.id ?? '', placeOfTile(tile), live);
}
