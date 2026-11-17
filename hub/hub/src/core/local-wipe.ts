// local-wipe.ts: "Remove all local data" (Account settings; fails
// closed).
//
// Contract:
//   - localWipeWarning(): what the confirm shows for the shown account, read now: its holds that may have gone through
//     (signOutHolds(), each with the page that sent it when the record says), its questions to the assistant still
//     waiting (readScriptAsks), and whether a payment's outcome is open in this browser (commerce paymentsSettled:
//     'settled', 'held' or 'unreadable', any account), and how much work runs from this tab (leave.ts leaveCount: the
//     sign-out cuts it). null without a shown account or while a sign-out runs.
//   - removeLocalData(shown): the person confirmed `shown` (and, when it named holds or asks, ticked that they will be
//     forgotten). In this order, each refusal doing nothing at all:
//       0. The host's local store must be able to remove its keys now (KeyValueStore.cannotDelete; web storage always
//          can): else 'store' with its reason. The terminal's store cannot while another Hub holds this account's store
//          ('busy') or once a write to it failed ('failed'); a removal there would only hide a key for the mount.
//          Checked first, before the session or any other store is read.
//       1. The stored session must still be this page's (another tab did not sign out or store another session), and
//          the account shown must be shown.account: else 'changed'. Checked before anything is read.
//       2. Other Hub tabs (tab-lock.ts): the wipe holds WIPE_LOCK exclusively from here until the page leaves, and
//          refuses ('tabs': "Close your other Hoody Hub tabs first") when another tab holds or waits for it, when
//          another tab holds or waits for TAB_LOCK, or when that cannot be told (no lock API, no query, this tab's own
//          lock not held). The session is checked again once the lock is held.
//       3. Every store it would remove must be readable and listable: local and session storage, the IndexedDB
//          database list (indexedDB.databases()), Cache Storage's keys, the change store, the assistant questions and
//          the payment lists. Any that is not, or that has not answered within the check's bound (4 s by default, with
//          the tab query): 'unchecked' with what could not be checked; nothing is removed, and the lock is let go (a
//          late answer starts nothing).
//       4. A payment whose outcome is open in this browser (paymentsSettled 'held'): 'payments' (the confirm links to
//          Billing). Nothing is removed.
//       5. The warning read now must be covered by `shown` (no new hold, no hold that became a send still out, no new
//          ask, no more work running from this tab than it named): else 'changed'.
//     Then 'started': lifecycle.ts signOutWiping signs out (logout(): every change in flight gets its notice, the
//     session ends server-side, the auth purge) and, as the last step before the page leaves, the wipe runs. It never
//     sends anything that changes server data.
//   - The wipe step, after the purge: wipeOriginStorage() with this admission, run after every store it removes was
//     listed and before anything is removed: a local store that can no longer remove its keys (step 0's question,
//     asked again: a write in the sign-out can fail), another Hub tab holding or waiting for TAB_LOCK or WIPE_LOCK (a
//     tab being opened), another session stored or storage that cannot tell (lifecycle's check), a payment no longer
//     settled, or anything the confirm did not show keeps everything ('kept': the page leaves as after an ordinary
//     sign-out, nothing wiped). The store, session, payment and warning checks run in the task of the clear, right
//     after the tab query.
//   - wipeOriginStorage(): first every store is listed (local and session storage keys, indexedDB.databases(), Cache
//     Storage's keys); one that cannot be listed, or a database entry without a name, removes nothing (false). Then
//     the admission; then localStorage and sessionStorage are cleared, every listed IndexedDB database deleted (the
//     crypt vault's keys among them: the account's base key is kept in its server vault; '' is a name too) and every
//     cache deleted. The sign-in fences are written again with fresh values right after the clear
//     (hub_boot_token_epoch:<uid> for each account that had one, hub_auth_rev). True only when every step answered,
//     the database list answers empty, no cache is left and then, read last, storage holds nothing but those fences.
//     Bounded (4 s by default), false on the bound, after which that run starts no further delete. A false keeps the
//     page on the sign-out's purge-failed panel, whose Try again runs the wipe step again (its admission included);
//     the page never says the data was removed.
//   - Other tabs see the clear (a storage event with no key) and sign out (lifecycle.ts onStorage). A tab opened while
//     the wipe holds WIPE_LOCK runs, without TAB_LOCK, until it ends: it waits for WIPE_LOCK, so the admission's query
//     sees it and keeps everything. One opened after that query writes after the clear, which the read-back (read last)
//     shows (false).
import { shownAccount, payments, localWipeWarning, storedWarning, warningWithin } from './local-wipe.pure';
export { localWipeWarning, warningWithin } from './local-wipe.pure';
export type { WipeHold, LocalWipeWarning, WipeCheck, LocalWipe } from './local-wipe.pure';
import type { LocalWipeWarning, WipeCheck, LocalWipe } from './local-wipe.pure';
import { readChangesState } from './change-store';
import { sessionStillOurs, signOutWiping } from './lifecycle';
import { readScriptAsks } from './script-asks';
import { otherTabs, withWipeLock } from './tab-lock';
import { hostEnv, localStore, sessionStore, type KeyValueStore } from './host-env';

/** Why the host's local store cannot remove its keys now (step 0), or null. A host with no local store at all answers
 *  null here: step 3's store check names it. A store whose answer throws cannot be trusted to remove: 'failed'. */
function cannotDelete(): 'busy' | 'failed' | null {
  let s: KeyValueStore;
  try { s = localStore(); } catch { return null; }
  if (typeof s.cannotDelete !== 'function') return null;
  try { return s.cannotDelete() ?? null; } catch { return 'failed'; }
}

/** Every key of `s` removed (Storage.clear where the store has it). */
function clearStore(s: KeyValueStore): void {
  if (s.clear) { s.clear(); return; }
  for (let i = s.length - 1; i >= 0; i--) { const k = s.key(i); if (k !== null) s.removeItem(k); }
}

type IdbList = { databases?: () => Promise<Array<{ name?: string }>> };

const LATE = Symbol('late');
/** `p`, or LATE once `deadline` (a Date.now() time) passed first. A late answer is dropped: one that settles at or after
 *  the deadline is LATE too, even when the timer has not fired yet (a late timer, a busy page), so it never counts as
 *  checked. */
function by<T>(p: Promise<T>, deadline: number): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>((resolve) => { timer = setTimeout(() => resolve(LATE), Math.max(0, deadline - Date.now())); });
  return Promise.race([p, late])
    .then((v) => (Date.now() >= deadline ? LATE : v))
    .finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/** The stores the wipe would remove that cannot be read or listed now (step 3 of the contract). One that has not
 *  answered by `deadline` (a Date.now() time) counts as one that cannot be listed. */
export async function uncheckedStores(account: string, o: { idb?: IDBFactory | null; caches?: CacheStorage | null; deadline?: number } = {}): Promise<WipeCheck[]> {
  const idb = o.idb === undefined ? hostEnv().idbFactory : o.idb;
  const cs = o.caches === undefined ? hostEnv().cacheStorage : o.caches;
  const deadline = o.deadline ?? Date.now() + 4000;
  const out: WipeCheck[] = [];
  try {
    for (let i = 0; i < localStore().length; i++) localStore().key(i);
    for (let i = 0; i < sessionStore().length; i++) sessionStore().key(i);
  } catch { out.push('storage'); }
  // A deadline already passed starts no further check: that store is one that could not be checked in time.
  if (idb) {
    const list = (idb as IdbList).databases;
    if (typeof list !== 'function' || Date.now() >= deadline) out.push('databases');
    else {
      try {
        if (dbNames(await by(list.call(idb), deadline)) === null) out.push('databases');
      } catch { out.push('databases'); }
    }
  }
  if (cs) {
    if (Date.now() >= deadline) out.push('caches');
    else {
      try {
        if (!Array.isArray(await by(cs.keys(), deadline))) out.push('caches');
      } catch { out.push('caches'); }
    }
  }
  try { if (readChangesState().state !== 'clean') out.push('changes'); } catch { out.push('changes'); }
  try { if (readScriptAsks(account) === 'unreadable') out.push('asks'); } catch { out.push('asks'); }
  if (payments() === 'unreadable') out.push('payments');
  return out;
}

/** The stores whose check waits for an answer (the database list, Cache Storage's keys), as uncheckedStores names them;
 *  'storage' when this browser has neither. */
function waited(o: { idb?: IDBFactory | null; caches?: CacheStorage | null }): WipeCheck[] {
  const idb = o.idb === undefined ? hostEnv().idbFactory : o.idb;
  const cs = o.caches === undefined ? hostEnv().cacheStorage : o.caches;
  const out: WipeCheck[] = [];
  if (idb) out.push('databases');
  if (cs) out.push('caches');
  return out.length ? out : ['storage'];
}

/** The person confirmed `shown`: check, then sign out and wipe this browser's Hub storage (see the contract). */
export function removeLocalData(shown: LocalWipeWarning, o: { minWaitMs?: number; endMs?: number; wipeMs?: number; checkMs?: number; idb?: IDBFactory | null; caches?: CacheStorage | null } = {}): Promise<LocalWipe> {
  const account = shown && typeof shown.account === 'string' ? shown.account : '';
  if (!account) return Promise.resolve({ kind: 'failed' });
  // 0. A store that cannot remove its keys now would only hide them: refuse before anything is read.
  const held = cannotDelete();
  if (held) return Promise.resolve({ kind: 'store', why: held });
  // 1. Before anything is read: the stored session is still this page's, and shows the confirmed account.
  if (!sessionStillOurs() || shownAccount() !== account) return Promise.resolve({ kind: 'changed' });
  return new Promise<LocalWipe>((resolve) => {
    const run = async (): Promise<LocalWipe> => {
      if (!sessionStillOurs() || shownAccount() !== account) return { kind: 'changed' };
      // The checks are bounded: one that has not answered refuses (and the lock is let go, below).
      const deadline = Date.now() + (o.checkMs ?? 4000);
      // No check starts once the deadline has passed, the first one included (its refusal: 'tabs', as on its timeout).
      if (Date.now() >= deadline) return { kind: 'tabs' };
      if ((await by(otherTabs({ waiting: true }), deadline)) !== 'alone') return { kind: 'tabs' };
      const what = await uncheckedStores(account, { ...o, deadline });
      if (what.length) return { kind: 'unchecked', what };
      // The last checks, in this task: the payments, then (the awaits above let another tab act) the session again, then
      // the warning. The checks must still be inside their deadline when the sign-out starts: the warning check (the last
      // read) ends by reading the clock.
      const last = (): LocalWipe => {
        if (payments() !== 'settled') return { kind: 'payments' };
        if (!sessionStillOurs()) return { kind: 'changed' };
        const r = signOutWiping(
          account,
          () => {
            const now = localWipeWarning();
            const same = !!now && warningWithin(now, shown);
            return Date.now() < deadline && same;
          },
          (otherSession) => wipeStep(account, shown, otherSession, o),
          o,
        );
        return r === 'done' ? { kind: 'started' } : { kind: r };
      };
      const r = last();
      // Any refusal there is judged by the clock last: past the deadline it refuses as a store that did not answer in time
      // would ('unchecked', naming the stores whose check waits for an answer). A started sign-out is never re-read.
      return r.kind !== 'started' && Date.now() >= deadline ? { kind: 'unchecked', what: waited(o) } : r;
    };
    void withWipeLock(async () => {
      let r: LocalWipe;
      try { r = await run(); } catch { r = { kind: 'failed' }; }
      resolve(r);
      // Started: the lock is held until the page leaves (a Try again on the purge-failed panel runs under it too).
      if (r.kind === 'started') await new Promise<void>(() => { /* until the page goes away */ });
    }).then((x) => { if (x === 'busy' || x === 'unknown') resolve({ kind: 'tabs' }); });
  });
}

/** The wipe step, after the purge (see the contract). */
function wipeStep(account: string, shown: LocalWipeWarning, otherSession: () => boolean, o: { wipeMs?: number; idb?: IDBFactory | null; caches?: CacheStorage | null }): Promise<boolean | 'kept'> {
  // After every store was listed, right before the clear: the tab query (a tab waiting for a lock is one being opened),
  // then in the same task the session, the payments and the warning (wipeOriginStorage clears in the task this answers in).
  const admit = async (): Promise<boolean> => {
    if ((await otherTabs({ waiting: true })) !== 'alone') return false;
    try {
      if (cannotDelete() || otherSession() || payments() !== 'settled') return false;
      const now = storedWarning(account);
      return !!now && warningWithin(now, shown);
    } catch { return false; }
  };
  return wipeOriginStorage({ ms: o.wipeMs, idb: o.idb, caches: o.caches, admit });
}

const EPOCH_PREFIX = 'hub_boot_token_epoch:';
const AUTH_REV_KEY = 'hub_auth_rev';

function freshId(n: number): string {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join('');
}

function deleteDb(idb: IDBFactory, name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let r: IDBOpenDBRequest;
    try { r = idb.deleteDatabase(name); } catch { resolve(false); return; }
    r.onsuccess = () => resolve(true);
    r.onerror = () => resolve(false);
    // Blocked: an open connection has not closed yet; the delete still runs once it does, so this waits for success
    // or error, inside the overall bound.
  });
}

/** The database names of an indexedDB.databases() answer, or null when it is not a list or an entry names none (a
 *  list that cannot be read whole is never taken for one; '' is a name). */
function dbNames(listed: unknown): string[] | null {
  if (!Array.isArray(listed)) return null;
  const names: string[] = [];
  for (const d of listed as unknown[]) {
    const n = d && typeof d === 'object' ? (d as { name?: unknown }).name : undefined;
    if (typeof n !== 'string') return null;
    names.push(n);
  }
  return names;
}

/** This origin's Hub storage, wiped (see the contract). `idb`, `caches` and `ms` are injectable for tests. `admit`
 *  (the wipe step's checks) runs after every store was listed and before anything is removed: false keeps everything
 *  ('kept'). */
export function wipeOriginStorage(o: { ms?: number; idb?: IDBFactory | null; caches?: CacheStorage | null; admit?: () => Promise<boolean> }): Promise<boolean | 'kept'>;
export function wipeOriginStorage(o?: { ms?: number; idb?: IDBFactory | null; caches?: CacheStorage | null }): Promise<boolean>;
export async function wipeOriginStorage(o: { ms?: number; idb?: IDBFactory | null; caches?: CacheStorage | null; admit?: () => Promise<boolean> } = {}): Promise<boolean | 'kept'> {
  const idb = o.idb === undefined ? hostEnv().idbFactory : o.idb;
  const cs = o.caches === undefined ? hostEnv().cacheStorage : o.caches;
  // Past the bound the answer is false and this run starts nothing more: each wait below is followed by this check,
  // which reads the clock as well as the timer (a busy page can run the next step before the timer fires).
  const ms = o.ms ?? 4000;
  const deadline = Date.now() + ms;
  let expiredByTimer = false;
  const past = (): boolean => expiredByTimer || Date.now() >= deadline;
  // The database list, or null when it cannot be had (no databases(), a refusal, not a whole list): never taken for empty.
  const listDbs = async (): Promise<string[] | null> => {
    const list = idb ? (idb as IdbList).databases : undefined;
    if (!idb || typeof list !== 'function') return null;
    try { return dbNames(await list.call(idb)); } catch { return null; }
  };
  const run = async (): Promise<boolean | 'kept'> => {
    // First every store is listed: one that cannot be removes nothing.
    try {
      for (let i = 0; i < sessionStore().length; i++) sessionStore().key(i);
      for (let i = 0; i < localStore().length; i++) localStore().key(i);
    } catch { return false; }
    const names = idb ? await listDbs() : [];
    if (names === null || past()) return false;
    let cacheKeys: string[] = [];
    if (cs) {
      try { cacheKeys = await cs.keys(); } catch { return false; }
      if (!Array.isArray(cacheKeys) || past()) return false;
    }
    // The wipe step's checks, last before the clear: the clear runs in the task this answers in.
    if (o.admit && !(await o.admit())) return 'kept';
    if (past()) return false;
    let ok = true;
    // The fences to write again: the accounts with a boot-token epoch, read before the clear.
    const uids: string[] = [];
    try {
      for (let i = 0; i < localStore().length; i++) {
        const k = localStore().key(i);
        if (k && k.startsWith(EPOCH_PREFIX) && k.length > EPOCH_PREFIX.length) uids.push(k.slice(EPOCH_PREFIX.length));
      }
    } catch { ok = false; }
    try { clearStore(localStore()); } catch { ok = false; }
    try { clearStore(sessionStore()); } catch { ok = false; }
    const fences = new Set<string>();
    try {
      for (const uid of uids) { localStore().setItem(EPOCH_PREFIX + uid, freshId(12)); fences.add(EPOCH_PREFIX + uid); }
      localStore().setItem(AUTH_REV_KEY, freshId(16));
      fences.add(AUTH_REV_KEY);
    } catch { ok = false; }
    if (idb) {
      const done = await Promise.all((names as string[]).map((n) => deleteDb(idb, n)));
      if (past()) return false;
      if (done.includes(false)) ok = false;
    }
    if (cs) {
      const done = await Promise.all(cacheKeys.map((k) => cs.delete(k).catch(() => false)));
      if (past()) return false;
      if (done.includes(false)) ok = false;
    }
    // Read back: the database list answers empty, no cache, then (read last, after every wait) nothing left in storage
    // but the fences.
    if (idb) {
      const left = await listDbs();
      if (left === null || left.length) ok = false;
    }
    if (cs) {
      try { if ((await cs.keys()).length) ok = false; } catch { ok = false; }
    }
    try {
      for (let i = 0; i < localStore().length; i++) { const k = localStore().key(i); if (k === null || !fences.has(k)) ok = false; }
      if (sessionStore().length !== 0) ok = false;
    } catch { ok = false; }
    return ok && !past();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<false>((resolve) => { timer = setTimeout(() => { expiredByTimer = true; resolve(false); }, ms); });
  try {
    return await Promise.race([run().catch(() => false), bound]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
