// The held change of a lock as its place's own realm shows it. A page whose
// changes are filed under the realm they name (core/locked.ts sentIn: Global, or under All realms the computer's own) looks
// its holds up in that realm, as its own read-back already does (heldChanges(lock, { realm: at.realm })) and as a folder page
// does (folders/pulls.ts useFolderHeld). The top bar's view (core useHeldChangeOf) leaves out a hold filed under another
// realm (core changes.ts shownIn): a Global place under a realm at the top would then show no notice, no Check again and no
// Stop tracking for its own held change, while that change still blocks the place.
import { heldChanges, useChangesVersion, type HeldChange } from '@core';
import { useMemo } from 'react';

/** The first held change of `lock` that `pick` accepts, as `realm` shows it (the place's realm; null: every realm).
 *  Re-read when core's changes move. */
export function useHeldIn(lock: string, pick: (identity: Record<string, unknown>) => boolean, realm: string | null): HeldChange | null {
  const version = useChangesVersion();
  return useMemo(
    () => heldChanges(lock, { realm }).find((x) => pick((x.identity ?? {}) as Record<string, unknown>)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` moves with core's change store, which heldChanges reads
    [lock, version, pick, realm],
  );
}
