// Changes in a live mount (admission row 6), over the local store. The live
// boot wires it; nothing here sends.
//
//   - `storeModeOf(area, readOnlyChoice)` is row 6's store question: 'none' (no usable store: unsafe, corrupt, no
//     home, or failed after a write/fsync error), 'ro' (a second Hub holds the lock, or read-only was chosen), 'rw'.
//     It is asked at every change: a store that fails mid-mount turns changes off from then on.
//   - `recordKept(area, ref)` is row 6's record question: the change's own record (core's change store, the key
//     `hub.v3.changes`) is in the journal's durable copy, confirmed (an attempt no longer `admitting`), and is the same
//     hold (an attempt's incarnation; a change's `inc#nonce`). The copy changes only after write + fsync returned, so
//     present here means on disk.
//   - `changeStoreOver(store, recovery)` is the adapter the live boot installs with core's `setChangeStoreAdapter`:
//     core reads and writes its records through the persistent store (a write that cannot be kept answers false, so
//     core refuses the change unsent, NOT_DURABLE). After a dropped journal tail every
//     attempt record still `admitting` at open is shown as a hold: never aged out as unsent, freed only by a read
//     ("Check again") or the warned dismiss. Each line holds a whole key's value, so the dropped line cannot say which
//     hold it was for; all of them are kept. A read rewrites nothing; core's next write of the list stores what it
//     read, so such a record is then on disk as the confirmed hold it is shown as.
// No replay: a record read back after a restart is checked by a read only; core never replays a key loaded
// from storage (changes.ts), and nothing here hands one back to a sender.
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, type ChangeStoreAdapter } from '../../core/change-store';
import type { KeyValueStore } from '../../core/host-env';
import type { PersistArea } from '../env/persist';

export type StoreMode = 'none' | 'ro' | 'rw';

/** Row 6's store question, asked at every change. `area` null: the store could not be opened (unsafe, corrupt, no home). */
export function storeModeOf(area: Pick<PersistArea, 'readOnly' | 'failed'> | null, readOnlyChoice = false): StoreMode {
  if (!area || area.failed()) return 'none';
  return area.readOnly !== null || readOnlyChoice ? 'ro' : 'rw';
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const records = (text: string | null): Record<string, unknown>[] | null => {
  if (text === null) return null;
  try { const a: unknown = JSON.parse(text); return Array.isArray(a) ? a.filter(isObj) : null; } catch { return null; }
};

/**
 * Row 6's record question: `ref` ({id, token}, core's HoldRef) names a record that is durably in the journal, confirmed
 * and of the same hold. An attempt's token is its incarnation (the id's last part); a change's is `inc#nonce`
 * (an outcome suffix `~oc` is ignored: the hold is the same).
 */
export function recordKept(area: Pick<PersistArea, 'readOnly' | 'failed' | 'journalGet'> | null, ref: unknown): boolean {
  if (storeModeOf(area) !== 'rw' || !isObj(ref) || typeof ref.id !== 'string' || typeof ref.token !== 'string') return false;
  const list = records(area!.journalGet(CHANGE_STORE_KEY));
  if (!list) return false;
  const mine = list.filter((r) => r.id === ref.id);
  if (mine.length !== 1) return false;
  const r = mine[0]!;
  if (ref.id.startsWith(ATTEMPT_PREFIX)) {
    return r.admitting === undefined && ref.id.slice(ref.id.lastIndexOf('\u0000') + 1) === ref.token;
  }
  // The send token is cut at the LAST '~', as core's splitHold (changes.ts) cuts a public hold.
  const at = ref.token.lastIndexOf('~');
  return typeof r.inc === 'string' && typeof r.nonce === 'string' && (at < 0 ? ref.token : ref.token.slice(0, at)) === `${r.inc}#${r.nonce}`;
}

/**
 * The change store's adapter over the mount's persistent store (persist.ts persistentStore over the mount's store area).
 * `droppedTail`: the journal ended in a line whose write never returned. Then the attempt records still `admitting` in
 * what survived are shown confirmed (held, pending): the ids are taken once, at open, so an admission made later in
 * this mount is judged as on the web.
 */
export function changeStoreOver(store: KeyValueStore, o: { droppedTail: boolean }): ChangeStoreAdapter {
  const held = new Set<string>();
  if (o.droppedTail) {
    let raw: string | null = null;
    try { raw = store.getItem(CHANGE_STORE_KEY); } catch { raw = null; }
    for (const r of records(raw) ?? []) if (typeof r.id === 'string' && r.id.startsWith(ATTEMPT_PREFIX) && r.admitting !== undefined) held.add(r.id);
  }
  return {
    read() {
      const raw = store.getItem(CHANGE_STORE_KEY);
      if (raw === null || !held.size) return raw;
      let a: unknown;
      try { a = JSON.parse(raw); } catch { return raw; }
      if (!Array.isArray(a)) return raw;
      return JSON.stringify(a.map((r: unknown) => {
        if (!isObj(r) || typeof r.id !== 'string' || !held.has(r.id) || r.admitting === undefined) return r;
        const { admitting: _a, ...rest } = r;
        void _a;
        return rest;
      }));
    },
    write(text) {
      try {
        if (text === null) store.removeItem(CHANGE_STORE_KEY);
        else store.setItem(CHANGE_STORE_KEY, text);
        return true;
      } catch { return false; }
    },
  };
}
