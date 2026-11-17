// storage.ts: the journal's only door to the browser's storage. Three request-side stores (hub_ai_req_v1, hub_ai_mig_v1,
// hub_ai_lease_v1) and the chat records (hub_ai_journal_v1) are core `partitioned()` values, one per account; the legacy
// hub_ask_v1 source is read for migration and written only by the dock, through legacyRead / legacyUpdate.
//
// Every read here is tri-state (core readTri): `missing` is an empty store, `unreadable` is NOT: nothing concludes from it and
// nothing writes over it. A store this page's shared.js does not register opens as null: every send is then refused (never
// sent unrecorded). The journal never pins `purge` (the registry rows say purge false, forget true).
import { capture, partitioned, type Partitioned, type StoreUpdate, type StoreUpdateFn, type Tri } from '@core';
import * as L from '../logic';

export const REQ_KEY = 'hub_ai_req_v1';
export const MIG_KEY = 'hub_ai_mig_v1';
export const LEASE_KEY = 'hub_ai_lease_v1';
export const JOURNAL_KEY = 'hub_ai_journal_v1';
export type { Tri, StoreUpdate, StoreUpdateFn };
/** A storage event key that says another tab changed the journal's stores or the old source (null: everything). */
export const isWatchedKey = (k: string | null): boolean => k === null || k === REQ_KEY || k === MIG_KEY || k === JOURNAL_KEY || k === L.STORE_KEY;

/** The account core shows now ('' when none). */
export function currentAccount(): string {
  try { const a = capture().account; return a == null ? '' : String(a); } catch { return ''; }
}

export interface Store {
  /** One logical read: exactly one browser read. */
  read(): Tri<unknown>;
  /** Read-modify-write on one browser read and at most one write. fn is not called when the read is unreadable. */
  update(fn: StoreUpdateFn, o?: { keepOthers?: boolean }): StoreUpdate;
}

const stores = new Map<string, Store | null>();
/** The store of a registered key; null when it cannot be opened (an older shared.js): reads are unreadable, writes fail. */
export function openStore(name: string): Store | null {
  if (stores.has(name)) return stores.get(name) ?? null;
  let s: Store | null = null;
  try {
    const p: Partitioned = partitioned(name, { scope: 'account' });
    s = {
      read: () => { try { return p.readTri(); } catch { return { s: 'unreadable' }; } },
      update: (fn, o) => { try { return p.update(fn, o); } catch { return 'failed'; } },
    };
  } catch { s = null; }
  stores.set(name, s);
  return s;
}
/** Tests only: forget the opened stores. */
export function resetStoresForTests(): void { stores.clear(); legacy = null; }

/** The store's tri-state read, or unreadable for a store that cannot be opened. */
export function readStore(name: string): Tri<unknown> {
  const s = openStore(name);
  return s ? s.read() : { s: 'unreadable' };
}
/** The store's update, or 'unreadable' for a store that cannot be opened. */
export function updateStore(name: string, fn: StoreUpdateFn, o?: { keepOthers?: boolean }): StoreUpdate {
  const s = openStore(name);
  return s ? s.update(fn, o) : 'unreadable';
}

// ---- the legacy source: hub_ask_v1, the dock's records, one array per account ----
let legacy: Partitioned | null = null;
function legacyBox(): Partitioned | null {
  try { return legacy || (legacy = partitioned(L.STORE_KEY, { scope: 'account' })); } catch { return null; }
}
const toRecords = (acct: string, list: unknown): readonly L.AskRecord[] =>
  L.parseStore(JSON.stringify({ v: 1, a: acct && Array.isArray(list) ? { [acct]: list } : {} })).a[acct] ?? [];

/** The shown account's legacy records. A value that is not a list is unreadable, never an empty source. */
export function legacyRead(): Tri<readonly L.AskRecord[]> {
  const b = legacyBox();
  if (!b) return { s: 'unreadable' };
  let r: Tri<unknown>;
  try { r = b.readTri(); } catch { return { s: 'unreadable' }; }
  if (r.s === 'unreadable') return r;
  if (r.s === 'missing') return { s: 'missing', acct: r.acct };
  return Array.isArray(r.v) ? { s: 'ok', v: toRecords(r.acct, r.v), acct: r.acct } : { s: 'unreadable' };
}
/** One read, at most one write, of the legacy list (fn gets the parsed records; return a list to store, [] to remove, null to keep). */
export function legacyUpdate(fn: (cur: readonly L.AskRecord[]) => readonly L.AskRecord[] | null): StoreUpdate {
  const b = legacyBox();
  if (!b) return 'unreadable';
  const acct = currentAccount();
  try {
    return b.update((cur) => {
      if (cur.s === 'ok' && !Array.isArray(cur.v)) throw new Error('legacy source is not a list');   // never written over: 'failed'
      const next = fn(cur.s === 'ok' ? toRecords(acct, cur.v) : []);
      if (next === null) return null;
      return next.length ? { set: next } : { remove: true };
    });
  } catch { return 'failed'; }
}
