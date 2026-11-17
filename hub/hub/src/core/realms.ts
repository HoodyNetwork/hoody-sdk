// realms.ts: the realm list with names, for pages (move-to-realm pickers, a row's realm chip, filters).
//
// Contract, in plain words:
//   - useRealms() → {selected, pinned, rows}: rows is null until the shell's realm list arrived, else one row per
//     realm of the list: GET /realms' realms, then those only the alias map names (a named realm with no computers
//     yet; being named proves no access, the server checks every call): {id, name, tint, computers}. A token session pinned to one realm has that one
//     row. name is the alias, else the short id (never the full 24-hex id); 'all' and "no realm" are words the
//     page supplies from its strings (name.kind 'all' / 'none').
//   - Re-renders when the list, an alias or a colour changes, and on a realm switch.
//   - Pages never switch the realm themselves: that is the shell's switcher (switchRealm).
import { useSyncExternalStore } from 'react';
import { realm as selectedRealm, subscribe } from './ctx';
import { count, displayName, list, onRealmNotice, pinnedRealm, realmCap, tint, type RealmColor } from './realm';
import { realmCapView, type RealmCapView } from './realmLimit';
import { isRealmId } from './realm-id';

export type RealmName = ReturnType<typeof displayName>;

export interface RealmRow {
  readonly id: string;
  readonly name: RealmName;
  readonly tint: RealmColor | '';
  /** Computers in this realm, from the list's usage; null while unknown. */
  readonly computers: number | null;
}

export interface RealmsView {
  /** 'all' or a 24-hex id. */
  readonly selected: string;
  /** A token session's one realm, else null. */
  readonly pinned: string | null;
  readonly rows: readonly RealmRow[] | null;
}

let cache: RealmsView | null = null;
let key = '';

function build(): RealmsView {
  const pin = pinnedRealm();
  const ids = pin !== null ? (isRealmId(pin) ? [pin] : list()) : list();
  const rows = ids ? ids.map((id) => Object.freeze({ id, name: displayName(id), tint: tint(id), computers: count(id) })) : null;
  return Object.freeze({ selected: selectedRealm(), pinned: pin, rows: rows ? Object.freeze(rows) : null });
}

/** The current view; the same object until something it shows changed. */
export function realmsView(): RealmsView {
  const next = build();
  const k = JSON.stringify(next);
  if (cache && k === key) return cache;
  cache = next; key = k;
  return next;
}

function onChange(l: () => void): () => void {
  const a = subscribe(l), b = onRealmNotice(l);
  return () => { a(); b(); };
}

export function useRealms(): RealmsView {
  return useSyncExternalStore(onChange, realmsView, realmsView);
}

/** One realm's name for a row (alias, else short id; 'all' / 'none' are the page's words). */
export function realmLabel(id: string): RealmName { return displayName(id); }

let capCache: RealmCapView = { k: 'none' };
let capKey = JSON.stringify(capCache);
/** What the realm menu shows of the account's Realm limit; the same object until it changed. */
export function realmCapShown(): RealmCapView {
  const next = realmCapView(realmCap());
  const k = JSON.stringify(next);
  if (k !== capKey) { capCache = next; capKey = k; }
  return capCache;
}
/** Use against the account's Realm limit as the realm menu shows it ({ k: 'none' } while the API reports none). */
export function useRealmCap(): RealmCapView {
  return useSyncExternalStore(onChange, realmCapShown, realmCapShown);
}
