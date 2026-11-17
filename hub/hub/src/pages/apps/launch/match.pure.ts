// Whether a launch sits at a tile's place, the pure part (split out of match.ts so the terminal build shares it; the
// rule is described at the top of match.ts). match.ts re-exports every name here and keeps the hooks (another tab's
// storage writes are followed through a window listener). Snap is for match.ts.
import type { useOps } from '../parts/ops';
import { loadRecent, owRunsOn, recentFor, recentKey, type StoredRow } from '../parts/recent';
import { runAt, type Placement } from './placement';

export type Snap = ReturnType<typeof useOps>;

/** The Board computer fields a hold needs. */
export interface HoldComputer {
  readonly id: string;
  readonly project_id: string;
  readonly server_name?: string;
}
/** The Board tile fields a hold reads (a program tile or a port tile; anything else has none of them). */
export interface HoldTile {
  readonly program?: string;
  readonly session?: number;
  readonly protocol?: string;
  readonly port?: number;
  readonly path?: string;
}

/** Any Board tile record: the fields of HoldTile are read when present (a web address or a script has none). */
export type AnyTile = HoldTile | object;

/** The place a tile shows: a terminal or display session, or an http port; null for every other tile. */
export function placeOfTile(any: AnyTile | null | undefined): Placement | null {
  if (!any) return null;
  const tile = any as HoldTile;
  if ((tile.program === 'terminal' || tile.program === 'display') && typeof tile.session === 'number') return { kind: tile.program, session: tile.session };
  if (tile.protocol === 'http' && typeof tile.port === 'number') return { kind: 'port', port: tile.port, path: tile.path ?? '' };
  return null;
}

/** The stored launches at this place that this tab has not dismissed. Only live reads list stored rows
 *  (useLiveApps), so without them (`live` false) a stored match would never be read in: none then. */
export function storedAt(s: Snap, project: string, cid: string, at: Placement, live: boolean): StoredRow[] {
  if (!live) return [];
  const gone = new Set<string>();
  for (const k of s.forgotten) {
    const r = s.runs.get(k);
    if (r) gone.add(recentKey(r));
  }
  return recentFor(loadRecent(), project, cid).filter((r) => runAt(r, cid, at) && !gone.has(recentKey(r)));
}

/** The Open-with holds at this place, as launch rows (live reads only, as storedAt). A hold stays until its sender
 *  frees it, so a Dismiss of its row (which frees it) is what takes it off. */
export function heldAt(project: string, cid: string, at: Placement, live: boolean): StoredRow[] {
  if (!live) return [];
  return owRunsOn(project, cid).filter((r) => runAt(r, cid, at));
}
