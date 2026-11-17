// changes.ts: the one registry of unresolved changes (C9), shared by defineMutation (run() and use()),
// useLockedChange and coreSource's useMutation.
//
// Contract, in plain words:
//   - A change is (scope, digest): the scope names the change (a route, a page's change key, a locked change's
//     id), the digest is varsDigest(identity): the lockKey value, else the variables (never the variables
//     themselves). Variables that may hold a secret need a lockKey, so the stored id is no digest of a secret.
//     The digest of the full variables a key was sent with (keyBytes) stays in this tab's memory, never stored.
//   - Its lock lives here, at module level, so it survives the hook that sent it: an unmount, a remount, a
//     drawer closed and reopened, leaving the page and coming back, a realm switch. Only an account change or
//     a sign-out (a bump whose reason is not in KEEPS) drops every lock; locks are also filed under the shown
//     account, so another account (another tab, no bump) never sees them.
//   - A realm switch keeps every lock. A realm-scoped change files its scope under the realm it was sent in
//     (realmScoped()): another realm's same change is its own, and coming back finds the first still held. An
//     account-wide change keeps a plain scope: it stays held in every realm.
//   - guarded(): one send at a time per change lock (BUSY: the lock in memory is being sent); a change that may have gone through (pending) is refused
//     (READ_BACK_FIRST) until it is released; the same change reuses its key until a send resolves it (done, or
//     a definite refusal of a first send); a replay's refusal keeps the key and answers pending again (it proves
//     nothing about the first, which stays "may have gone through").
//   - Frees (release, complete, discard) are async: each names the one send it concerns by its hold (token
//     plus the outcome nonce the caller observed, holdOf) and is judged and stored in ONE store-lock turn
//     (settleChange); memory moves only after that write lands, so until then the lock stays pending and no press of
//     it goes out. True only when this call freed it. A free cannot prove anything without the store lock (no
//     navigator.locks, a request that throws): false, memory and storage keep the hold. A free called in one context
//     (account, realm) and judged after a switch, or an account round trip X->Y->X, frees nothing.
//   - A proof (any non-warned free) frees only while the stored record still names the outcome its hold observed:
//     an answer stored after the caller's read (a new pending outcome of the same send) refuses it ('unresolved', the
//     page reads again). A record or hold without an outcome nonce (written by an older build, whose tabs answer
//     without one) is proved by nothing, even once its record is gone: only the warned Dismiss frees it. It never removes a live sending stamp, nor frees a change
//     whose request is still out in this tab. The person's warned Dismiss (`warned`: settle's dismiss, dismissHeld, a hook's dismiss()) skips those three
//     checks: it was told the change may be sent again. It still frees only the send its hold names, in this context.
//   - release(): the page proved the outcome (a fresh read-back, its own refetch), or the warned Dismiss of that shown
//     hold: the change is free again and keeps its key (a retry of the same change replays it; under a lockKey only in
//     a tab that knows its bytes, elsewhere it gets a new key; without one the identity digest is the bytes, so it
//     replays after a reload too). A read-back releases only changes that went pending before it began (`upTo`: the
//     count read at its start, pendingMark()). An older change (an older build's record converted on load, see
//     below) is the exception: only a warned Dismiss releases it, and it goes; complete() and discard() refuse it.
//   - complete(): the change is PROVEN applied (its receipt reads completed, or a read shows its effect): lock and
//     key go, so the next press is a new change with a new key. release() would keep the key, and a replay of a
//     spent key gets the old receipt back: nothing new would happen (a second restart that never restarts).
//     It also retires a change a read already released with its key kept (settle() first, proof later).
//   - discard(): the page proved the change did NOT apply (a failed receipt, an authoritative read showing no
//     effect): lock and key go, the next send is a new change. Nothing happens while the lock's own send is in
//     flight.
//   - Overlap: after an account round trip the lock is a copy re-adopted from storage while the earlier request may
//     still be out. Only the warned Dismiss frees that copy, and this tab's next press of the change is BUSY until
//     that request answers (sendsOut), so one tab never has two requests of a change out. Another tab (which knows
//     nothing of the request) may admit a new one once the record is gone; then each request owns only itself: its
//     heartbeat and outcome touch only its own record (incarnation and nonce), and a free touches only the record of
//     the send it names, whatever version a queued write of that send moved it to. The warned Dismiss keeps its
//     older compatibility: a replay of a kept key after it may go out again, which is what its warning says.
//   - Across reloads and tabs (change-store.ts): every lock that is pending, keeps a key or is being sent is
//     stored. A reload loads the account's records back (a pending one comes back pending, its key kept); another
//     tab's writes merge in on the storage event. A press is admitted under the cross-tab store lock against a
//     fresh read: a stored pending change is refused (READ_BACK_FIRST), another tab's live send is BUSY, and a send
//     whose tab died (its stamp went stale) may have gone through, so it reads as pending. While this tab sends,
//     its stamp is renewed (heartbeat). Each write names the send it concerns (incarnation and nonce) and touches
//     only that send's record: a send's own outcome (persist), a free (settleChange). An absent record or another
//     send's is left alone, so a late answer or a stale release never brings back a removed hold or overwrites a later
//     one; nor does a late pending answer make a hold released or dismissed meanwhile pending again.
import { useSyncExternalStore } from 'react';
import { onBump, snapshot, subscribe, type BumpReason } from './ctx';
import type { Outcome } from './api';
import {
  ATTEMPT_PREFIX, CHANGE_FMT, KEY_MAX, SENDING_HEARTBEAT_MS, SENDING_STALE_MS, changeStoreTab, newChangeStoreTabForTests, nextVersion, readChanges, recordSendOut, sendingLive,
  setTurnConversion, turnNow, ChangeStoreRefused, subscribeChangeStore, underChangeStoreLocked, changeStoreCoordinated, writeChanges, changesFit, readChangesState, type HoldRef, type StoredChange, type StoredMeta,
} from './change-store';
import { createListeners } from './listeners';

/** The computer a change acts on, as the lock records it (a read-back re-reads that one). */
export interface ChangeTarget { readonly project: { readonly id: string }; readonly container: { readonly id: string } }
/** Where a lock came from: the base (definition or shared lock name, without realm or computer), the
 *  computer the change was sent to, and the realm it was sent in (null: the call carries none, an account or
 *  kit change). A read-back without variables finds every pending change of a base; a read-back releases a
 *  change only when it read that change's realm (query.ts changeRealm). */
export interface ChangeMeta {
  readonly base: string; readonly target: ChangeTarget | null; readonly realm: string | null;
  /** A shared lock's identity: a copy of its lockKey value (plain JSON data, cycles dropped), taken when the
   *  change is sent. heldChanges() shows it to the pages that share the lock, so a lockKey must name only what
   *  identifies the change, never a secret (a command text, a password). Absent without a lockKey; stored as null
   *  when its copy is empty. */
  readonly identity?: unknown;
  /** Which declaration sent it (a definition, a source key, a locked id): a fresh read-back frees, by its proving
   *  verdict, only its own sender's changes (no verdict frees nothing). Another page sharing the lock reads other
   *  reads, which prove nothing about this change. */
  readonly by?: string;
  /** The page that sent it (its page id, e.g. 'computers'): another page sharing the lock links there
   *  (HeldChange.from). Absent when the declaration named none. */
  readonly page?: string;
  /** How its scope was filed (query.ts / source.ts / locked.ts, every send): true when its definition files across
   *  realms (changeScope `acrossRealms`), false when the scope is its route's own (a base, account or kit route
   *  unscoped, a realm or agent route under its realm). The reverse compat (compatScopeOf) takes only an across
   *  filing for a realm-scoped definition's own change: a natural unscoped hold of another route sharing the lock is
   *  that route's change. Absent on a record of a build before it: such a hold still matches. */
  readonly across?: boolean;
}
export interface ChangeLock {
  busy: boolean; pending: boolean; seq: number; key: string | null; meta?: ChangeMeta;
  /** The record format (StoredChange.fmt): CHANGE_FMT from this lock's first admission or adoption on (an older
   *  build's record is never adopted; see "records of older builds"). */
  fmt?: number;
  /** Under a lockKey (the identity leaves some variables out): the digest of the full variables the key was
   *  sent with. A send with other bytes gets a new key: a key never spans two request bodies. In memory only
   *  (the variables may hold a secret, and an unsalted digest of one can be guessed offline): a lock
   *  loaded from storage, after a reload or from another tab, has none, so its kept key is never replayed and
   *  the next send gets a new one. */
  keyBytes?: string;
  /** When it went pending (ms). */
  at?: number;
  /** The stored record's version this tab last wrote or loaded (undefined: never stored). */
  t?: number;
  /** Another tab is sending this change, stamped at this time (its outcome is not known here yet). */
  away?: number;
  /** When this tab's own send began (its stamp). */
  sentAt?: number;
  /** The hold's incarnation (change-store StoredChange.inc): new when a change that held nothing is admitted,
   *  kept by a replay of its kept key. Adopting another one counts as a new send (seq moves on), so a verdict or
   *  a late answer about an earlier hold never moves a later one. */
  inc?: string;
  /** This send's nonce (StoredChange.nonce): new at every admission, a replay included, and copied when adopted.
   *  With the incarnation it is the hold token (inc#nonce), the same in every runtime and tab, so a token taken
   *  before another runtime's replay of the same hold never frees the replay. */
  nonce?: string;
  /** This send's outcome nonce (StoredChange.oc): new at admission and when its pending outcome is decided here
   *  (chosen before the answer's write, which stores exactly it), copied when adopted, never moved by a heartbeat
   *  or a release. The public hold names it (holdOf), so a free judged on an observation refuses a later outcome. */
  oc?: string;
}

const reg = new Map<string, ChangeLock>();
// The change sends this runtime has out now (admitted, not yet in finally): id → the hold tokens of those requests.
// Outlives reg: an account bump clears reg while a send is still out, and that send still counts as live
// (changeSendOut), admission answers BUSY for its id (one request of a change out per tab, even after a
// warned Dismiss of its re-adopted copy), and a proof refuses to free it. Kept per request token, so each finally
// retires only its own.
const sendsOut = new Map<string, Set<string>>();
// The same requests by token, with the metadata admission installed (memory only, never stored): sendingChanges
// lists each from here until its answer, whatever became of its registry copy (an account round trip, a warned
// Dismiss of the re-adopted copy, another tab's later send under the same id), and never lends `here` to another's.
const localOut = new Map<string, { readonly id: string; readonly meta: ChangeMeta | undefined }>();
const sendOutAdd = (id: string, token: string, meta: ChangeMeta | undefined): void => { let s = sendsOut.get(id); if (!s) sendsOut.set(id, (s = new Set())); s.add(token); localOut.set(token, { id, meta }); };
const sendOutDelete = (id: string, token: string): void => { const s = sendsOut.get(id); if (s && s.delete(token) && s.size === 0) sendsOut.delete(id); if (localOut.get(token)?.id === id) localOut.delete(token); };
const clearSendsOut = (): void => { sendsOut.clear(); localOut.clear(); };
const listeners = createListeners();
let seq = 0;
let version = 0;
function changed(): void {
  version++;
  listeners.emit();
}
// The bumps that keep unresolved changes: same account, same session (a realm switch or fallback, a
// suspension, a late answer). Any other reason (account, signout, logout, a test boot) drops them.
const KEEPS: ReadonlySet<string> = new Set(['switch', 'fallback', 'suspended', 'late']);
/** True when a bump of this reason keeps account-owned unresolved state (locks, keys, markers). */
export const keepsChanges = (reason: BumpReason): boolean => KEEPS.has(reason);
// The context generation (settleChange): moves on every bump that may change the account or the realm shown (all but
// a late answer and a suspension), so a free called in one context and judged after a switch, or an account round
// trip X→Y→X, frees nothing.
let ctxGen = 0;
/** The context a free is called in (settleChange's `ctx`): capture it at the call, before any await. */
export const changeContext = (): number => ctxGen;
onBump((reason) => {
  if (reason !== 'late' && reason !== 'suspended') ctxGen++;
  if (!keepsChanges(reason)) {
    // The account ended here (endAccount: sign-out, expiry, another tab's account): its holds leave this page's
    // memory, never another account's view. The stored records stay (each is filed under its account and only
    // that account loads it), so the same account signing in again gets its unresolved changes back. A sign-out
    // and the auth purge do not remove them (C9: the key is purge:false, registry.ts; lifecycle.ts); only Forget
    // this browser (forget:true), the account's own forget, or the warned sign-out forget (forgetAccountChanges)
    // removes them. A kept record holds digests, keys and stamps, never variables and no digest of the full
    // variables (keyBytes stays in memory). A test boot is a fresh browser.
    reg.clear();
    tombs.clear();
    olderOut = new Map();
    if (reason === 'test-boot') {
      try { loadedFor = owner(); } catch { loadedFor = null; }
      // A fresh browser: no other tab shares it, so no store lock is needed (a test may run without one).
      try { const list = readChanges(); if (list && list.length) writeChanges([]); } catch { /* best effort */ }
    } else {
      // The account shown now (if any) loads its own records: the same account back again sees its holds.
      loadedFor = null;
      loadStored();
    }
  }
  changed();
});

/** The scope of a realm-scoped change: filed under the realm it is sent in (read at the call). */
export const realmScoped = (scope: string): string => scope + '@' + snapshot().realm;

const owner = (): string => (snapshot().account ?? '') + '\u0001';
const idOf = (scope: string, digest: string): string => owner() + scope + '\u0000' + digest;
const inScope = (id: string, scope: string): boolean => id.startsWith(owner() + scope + '\u0000');

function lockOf(id: string): ChangeLock {
  let l = reg.get(id);
  if (!l) {
    l = { busy: false, pending: false, seq: 0, key: null };
    // A lock dropped here whose deletion is not stored yet keeps the version it was stored at.
    const t = tombs.get(id);
    if (t !== undefined) { l.t = t; tombs.delete(id); }
    reg.set(id, l);
  }
  return l;
}
// The stored versions of locks deleted here, until the deletion is stored (or loses to a newer record).
const tombs = new Map<string, number>();
function drop(id: string): void {
  const l = reg.get(id);
  if (!l) return;
  reg.delete(id);
  if (l.t === undefined) return;
  const k = tokenOf(l);
  // A tokened deletion matches its record by token, and the store lock runs it before any later admission, so a
  // new lock of the id needs no remembered version. Only a legacy lock (no token) keeps its version as a tomb
  // (a tomb on a fresh tokenless lock would make its refused press delete by version).
  if (k === undefined) tombs.set(id, l.t);
  persist(id, undefined, k === undefined ? undefined : { drop: k });
}
function tidy(id: string, l: ChangeLock): void {
  if (reg.get(id) === l && !l.busy && !l.pending && !l.key && l.away === undefined) drop(id);
}

// ---- the stored copy (change-store.ts) ----
// A hold's incarnation: random, never derived from the change (two holds of one change must differ).
function newInc(): string {
  try { return globalThis.crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}
// A change sent under a lockKey stores its identity (null when its copy is empty).
const plainMeta = (m: ChangeMeta | undefined): StoredMeta | undefined => (m ? { ...m, ...('identity' in m ? { identity: plainCopy(m.identity) ?? null } : {}) } : undefined);
/** A hold's token: its incarnation and its send nonce (undefined before its first admission). A replay of the
 *  same key keeps the incarnation under a new nonce, in this runtime or another, so a Dismiss or a proof of the
 *  earlier send never frees it. Unlike the tab-local seq it does not move when a hold is adopted again (a reload,
 *  an account round trip). */
const tokenOf = (l: ChangeLock): string | undefined => (l.inc === undefined ? undefined : l.inc + '#' + (l.nonce ?? ''));
/** True when `hold` names the send that holds `l` now. A missing or empty hold, or a lock with no token (a legacy
 *  record stored before incarnations), never matches: nothing is taken for "whatever holds the lock". */
const holdsBy = (l: ChangeLock, hold: unknown): boolean => typeof hold === 'string' && hold !== '' && tokenOf(l) === splitHold(hold).token;
/** The public hold of a lock (HeldChange.hold, MutationResult.hold, holdOfLock): its token and the outcome nonce this
 *  tab knows (`inc#nonce~oc`). Pages pass it back to a free as the observation the free is judged on: a send whose
 *  stored outcome moved since (another tab's answer landed) shows a new hold, and the old one frees nothing unless
 *  the person's warned Dismiss. */
const holdOf = (l: ChangeLock): string | undefined => { const k = tokenOf(l); return k === undefined ? undefined : k + '~' + (l.oc ?? ''); };
/** A public hold's parts: the send token, and the outcome nonce observed (null or '': none named, so no proof applies;
 *  holdOf writes '' for a lock whose record carries no nonce, an older build's). */
function splitHold(hold: string): { token: string; oc: string | null } {
  const at = hold.lastIndexOf('~');
  return at < 0 ? { token: hold, oc: null } : { token: hold.slice(0, at), oc: hold.slice(at + 1) };
}
/** True when the stored record is the send of hold token `k` (incarnation and nonce). A record without a token never is. */
const recordOfSend = (r: StoredChange, k: string | undefined): boolean => k !== undefined && r.inc !== undefined && r.inc + '#' + (r.nonce ?? '') === k;
function recordOf(id: string, l: ChangeLock, t: number): StoredChange {
  return {
    id, pending: l.pending, key: l.key, t,
    ...(l.at !== undefined ? { at: l.at } : {}), ...(l.fmt !== undefined ? { fmt: l.fmt } : {}),
    ...(l.meta ? { meta: plainMeta(l.meta) } : {}), ...(l.inc !== undefined ? { inc: l.inc } : {}), ...(l.nonce !== undefined ? { nonce: l.nonce } : {}),
    ...(l.oc !== undefined ? { oc: l.oc } : {}),
    ...(l.busy && l.sentAt !== undefined ? { sending: { tab: changeStoreTab(), at: l.sentAt } } : {}),
  };
}
const worthStoring = (l: ChangeLock): boolean => l.busy || l.pending || l.key !== null;
/** True while another tab's send of this change is out (its stamp is fresh). */
const awayLive = (l: ChangeLock): boolean => l.away !== undefined && Date.now() - l.away < SENDING_STALE_MS;
/** Writes the lock's current state (or its deletion) under the store lock. Which record a write may touch:
 *  - a send's own outcome (`own`): only the record its admission stored (incarnation and nonce), whatever version it
 *    is at now (its heartbeat moves it), with the outcome nonce the send chose (`intent.oc`). A pending answer never
 *    makes that hold pending again once it was released or dropped meanwhile (here or in another tab), and a gone
 *    record is never written back; this tab's lock then follows storage.
 *  - a deletion (`intent.drop`, from drop()): only the record of that same send, whatever version it is at now.
 *    Another send's record, even at the same version, is never touched.
 *    Frees do not come here: settleChange judges and writes them in its own store-lock turn.
 *  - a lock with no token (a legacy record stored before incarnations): only over the version this tab last saw.
 *  Without cross-tab coordination (no navigator.locks, or a request that throws or rejects) nothing is written: a
 *  whole-list replace could erase a hold another tab admitted meanwhile, so the stored records stay as they are
 *  (memory moves on; a reload adopts them again). */
function persist(id: string, own?: ChangeLock, intent?: { readonly drop?: string; readonly sent?: string; readonly oc?: string }): void {
  const run = () => {
    // Only over a clean read: a corrupt store's unreadable records (another build's) are never written away.
    const rd = readChangesState();
    if (rd.state !== 'clean') return;
    const list = rd.list;
    const l = own ?? reg.get(id), cur = list.find((r) => r.id === id);
    const rest = list.filter((r) => r.id !== id);
    const gone = (back: readonly StoredChange[]): boolean => !back.some((x) => x.id === id);
    if (own) {
      // `own`: a send's own outcome (from its finally), written whoever is shown now (a send a confirmed sign-out
      // kept, or one still out across an account switch, settles its record), but ONLY onto the
      // record its admission stored. Another incarnation or nonce is a later send's: left alone. Gone from a clean
      // read, it was removed since (a confirmed sign-out forget, another tab's proof, a purge, a Dismiss here), and a
      // late answer never writes that hold back. Attempts do the same (attempts.ts sent()).
      // The send's token as its finally took it (`sent`): `own` is the registry's mutable lock, and a storage event
      // while this write waited for the store lock may have adopted another send's record into it. Judged by `sent`,
      // that record is another send's (below): it is left alone and the lock follows it, so another send's record or
      // stamp is never taken for this one.
      const k = intent?.sent ?? tokenOf(own);
      if (!cur) { followStored(id, own, null); return; }
      // Another send's record (a later incarnation or nonce): left alone; this tab's lock of the send follows it
      // (a phantom pending lock otherwise).
      if (!recordOfSend(cur, k)) { followStored(id, own, cur); return; }
      if (own.pending) {
        // Without its sending stamp the record was released keeping its key while the request was out (a warned
        // Dismiss of a re-adopted copy, or a proof read in a tab that adopted a stale stamp): it stays released.
        // The same for a release of its copy here queued behind this answer: that
        // write stands. A free queued behind it is judged in its own store-lock turn
        // against what this answer stored: a warned Dismiss still frees the send by its token, a proof only while the
        // stored outcome is the one it observed.
        if (!cur.sending) { followStored(id, own, cur); return; }
        // Busy or not: a press of the released copy waiting for its admission still names this send until it is
        // admitted.
        const m = reg.get(id);
        if (m && m !== own && tokenOf(m) === k && !m.pending && m.away === undefined) return;
      }
      if (!worthStoring(own)) {
        // A 'done' or 'failed' retires its own record and key whatever version it is at now.
        if (writeOrReadBack(rest, gone)) { own.t = undefined; settleCopy(id, own, null); }
        return;
      }
      const t = nextVersion(list);
      // The outcome nonce the answer chose (`intent.oc`), never what the lock holds by now: a storage event while this
      // write waited may have adopted the send's older record (and its nonce) into it.
      const oc = intent?.oc ?? own.oc;
      const r = { ...recordOf(id, own, t), ...(oc !== undefined ? { oc } : {}) };
      if (writeOrReadBack([...rest, r], (back) => back.some((x) => x.id === id && x.t === t))) { own.t = t; own.oc = oc; settleCopy(id, own, r); }
      return;
    }
    if (intent?.drop !== undefined) {
      const k = intent.drop, now = reg.get(id);
      if (!now) tombs.delete(id);
      if (!cur || !recordOfSend(cur, k) || !writeOrReadBack(rest, gone)) return;
      // A storage event meanwhile re-adopted the dropped send into this tab's registry: that copy goes too.
      if (now && !now.busy && tokenOf(now) === k) { reg.delete(id); tombs.delete(id); changed(); }
      return;
    }
    // A legacy lock (no token): the version this tab last saw.
    const base = l ? l.t : tombs.get(id);
    if (!l || !worthStoring(l)) {
      tombs.delete(id);
      if (cur && cur.t === base && writeOrReadBack(rest, gone) && l) l.t = undefined;
      return;
    }
    // Another tab wrote this change after this tab last saw it: its record stands (the merge adopts it), unless
    // this tab holds it pending: a hold never loses to a race. A later hold of the same change (another
    // incarnation, or the same one replayed: another nonce) is never overwritten by this one.
    if (cur && cur.t !== base && (!l.pending || (cur.inc !== undefined && cur.inc !== l.inc) || (cur.nonce !== undefined && cur.nonce !== l.nonce))) return;
    const t = nextVersion(list);
    if (writeOrReadBack([...rest, recordOf(id, l, t)], (back) => back.some((x) => x.id === id && x.t === t))) l.t = t;
  };
  underChangeStoreLocked(run).catch(() => { /* uncoordinated or refused: the stored records stay; memory holds */ });
}
/** A send's own answer that storage refused to take (its record gone, released while the request was out, or
 *  another send's now): the registry's lock of that send, idle (the sender's own lock, or a re-adopted copy of the
 *  same token), follows the clean read, so no phantom pending lock stays.
 *  A busy lock, or another send's, is left alone. */
function followStored(id: string, own: ChangeLock, r: StoredChange | null): void {
  const m = reg.get(id);
  if (!m || m.busy || (m !== own && tokenOf(m) !== tokenOf(own))) return;
  // An older build's record took the id (its tab wrote over this send's record): it converts first, then loads.
  if (r && olderRecord(r)) { convertStored(); return; }
  if (r) adopt(id, r, Date.now()); else { reg.delete(id); tombs.delete(id); }
  changed();
}
/** writeChanges, for an installed adapter that may throw after its write landed (the contract says a refusal
 *  returns false, but a throw proves neither): a throw is read back under the same store lock, and the write counts
 *  as done only when that clean read shows `landed`. So the lock's version and its re-adopted copy (settleCopy)
 *  follow what storage holds. Nothing is retried. */
function writeOrReadBack(list: readonly StoredChange[], landed: (back: readonly StoredChange[]) => boolean): boolean {
  try { return writeChanges(list); } catch {
    const back = readChangesState();
    return back.state === 'clean' && landed(back.list);
  }
}
/** After a send's own outcome was written (`r`, or null for its deletion): the lock this tab's registry holds for
 *  the id now, when it is another object naming the same send (an account round trip re-adopted the record while
 *  the send was out), takes that outcome too. This tab gets no storage event for its own write, and the copy would
 *  otherwise stay pending. A later send's lock, or one being sent, is never touched. */
function settleCopy(id: string, own: ChangeLock, r: StoredChange | null): void {
  const m = reg.get(id);
  if (!m || m === own || m.busy || m.inc !== own.inc || m.nonce !== own.nonce) return;
  if (r) {
    adopt(id, r, Date.now());
    // A pending answer is a new send for a read-back that began before it: the copy
    // takes the request's own mark, so release(upTo) with an earlier mark never frees it.
    if (own.pending) { m.seq = Math.max(m.seq, own.seq); if (own.at !== undefined) m.at = own.at; }
  } else { reg.delete(id); tombs.delete(id); }
  changed();
}
/** Adopts a stored record into this tab's lock (creating it); true when anything moved. */
function adopt(id: string, r: StoredChange, now: number): boolean {
  // An older build's record never enters memory, whoever reaches it (load, admission, followStored, the quarantine
  // refusal): it converts under the store lock first.
  if (olderRecord(r)) return false;
  const l = lockOf(id);
  if (l.busy) return false;
  const away = r.sending && r.sending.tab !== changeStoreTab() && sendingLive(r.sending, now) ? r.sending.at : undefined;
  // A send whose tab died mid-way (its stamp went stale) may have gone through; so may this tab's own send that
  // no lock here runs (adopt never runs on a busy lock): an account round trip dropped the registry while it was
  // out. Its answer still lands when it comes (persist).
  const pending = r.pending || (!!r.sending && away === undefined);
  const was = l.pending;
  // Another incarnation, or another send of it (a replay elsewhere: another nonce).
  const another = r.inc !== l.inc || r.nonce !== l.nonce;
  l.pending = pending;
  // A hold that newly went pending, or another incarnation (a later send of the same change): a new send, so a
  // read-back that began before it (its mark is lower) proves nothing about it.
  // Another incarnation moves the token even when it is released keeping its key, so a stale complete(upTo)
  // never drops the new one's key.
  if ((pending && !was) || another) l.seq = ++seq;
  if (pending && (!was || another)) l.at = r.at ?? now; else if (r.at !== undefined) l.at = r.at;
  l.inc = r.inc;
  l.nonce = r.nonce;
  l.oc = r.oc;
  // keyBytes: this tab's own memory of the bytes stays only while the stored record keeps the same key; a stored
  // keyBytes (an older build's) is never trusted.
  if (r.key === null || r.key !== l.key) l.keyBytes = undefined;
  l.key = r.key;
  if (r.meta) l.meta = r.meta as ChangeMeta;
  l.fmt = r.fmt;
  l.away = away;
  l.t = r.t;
  return true;
}
let loadedFor: string | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
// The sending heartbeats of the sends out, and a count of resets (session disposal): a reset stops them, and a renewal
// already queued for the store lock checks the count first, so a disposed session never renews a stamp.
const beats = new Set<ReturnType<typeof setInterval>>();
let resets = 0;
// ---- records of older builds ----
// Older builds stored keyBytes (a digest of a change's variables), and filed a change under a digest of its full
// variables when it had no lockKey then or its lockKey threw (an identity() could be stored with it): such an id may
// be derived from a secret, and nothing in the record tells which. So every record this build writes carries
// CHANGE_FMT (StoredChange.fmt; any other value makes the store corrupt), and a changes record without it is an older
// build's, whatever its base, metadata or account. This build never adopts one into memory (adopt refuses it, for
// every caller), so it never shows, replays or writes one back. Each converts at ONE point: the start of a store-lock
// turn, before the turn's own function runs, with the turn's one time (change-store.ts underChangeStore, olderPlan
// below). Every read a turn makes comes after that write, so no writer, rollback or
// read-back check ever holds a list from before it, and a record converted once is stored marked. A load that finds
// one queues an empty turn (convertStored). An unheld one is removed; a held one (pending, or a
// stale stamp: a tab that died mid-send) becomes an older change, outcome unknown, under `scope + q~ + a fresh random
// id`, keeping where the change went and who sent it (meta without identity) and its time, nothing about what it
// was (no identity, key or keyBytes). An older change refuses every press of its scope, also filed the other way
// (quarantineRefusal), no read proves it (freeByVerdict, release without dismiss, complete and discard refuse it),
// and only a warned Dismiss frees it; it is shown only once it is stored, so a Dismiss always names stored bytes.
// One with a live stamp of another tab (an older build's tab sending it now) stays where it is until that stamp is
// answered or goes stale, and refuses every press of its scope (also filed the other way) meanwhile (BUSY), so
// that tab's heartbeat and answer still find it.
const QUARANTINE = '\u0000q~';
/** True for the digest of an older change (see above). */
export const quarantinedDigest = (digest: string): boolean => digest.startsWith('q~');
/** The scope part of a change's lock id (account included, before the digest). */
const scopeOfId = (id: string): string => id.slice(0, id.lastIndexOf('\u0000'));
/** An older build's changes record (see above). */
const olderRecord = (r: StoredChange): boolean => r.fmt === undefined && !r.id.startsWith(ATTEMPT_PREFIX);
/** An older record whose sending stamp is another tab's and live: it stays until that send is answered. */
const olderSendOut = (r: StoredChange, now: number): boolean => olderRecord(r) && !!r.sending && r.sending.tab !== changeStoreTab() && sendingLive(r.sending, now);
/** An older build's record not converted yet (a live stamp, a stale one, or pending: what conversion turns into an
 *  older change). It is never adopted, so sendingChanges lists it from here, unattributed: its lock base and realm
 *  only, plain strings from its metadata, never its identity, target or key (its id, digest included, is only this
 *  map's key, in memory). */
const olderUnresolved = (r: StoredChange): boolean => olderRecord(r) && (r.pending || !!r.sending);
interface OlderOut { readonly base: string | null; readonly realm: string | null }
const olderOutOf = (r: StoredChange): OlderOut => {
  const m = r.meta as { base?: unknown; realm?: unknown } | undefined;
  return { base: typeof m?.base === 'string' ? m.base : null, realm: typeof m?.realm === 'string' ? m.realm : null };
};
/** This account's older-build records not converted yet, by record id (loadStored). */
let olderOut = new Map<string, OlderOut>();
/** Records a turn must convert (an older record not being sent now, or an older build's keyBytes). */
const toConvert = (list: readonly StoredChange[], now: number): boolean => list.some((r) => r.keyBytes !== undefined || (olderRecord(r) && !olderSendOut(r, now)));
/** The records converted (see above); called only by olderPlan, which only a store-lock turn's start runs. */
function converted(list: readonly StoredChange[], now: number): StoredChange[] {
  return list.flatMap((r) => {
    // Kept as it is (a current record, or an older one another tab is sending now), minus an older build's keyBytes,
    // which no write keeps: so the result is what will be stored.
    if (!olderRecord(r) || olderSendOut(r, now)) { if (r.keyBytes === undefined) return [r]; const { keyBytes: _kb, ...kept } = r; void _kb; return [kept]; }
    if (!r.pending && !r.sending) return [];
    const scope = scopeOfId(r.id);
    // A record without metadata: its base is its scope without the account, up to a computer (#) or realm (@), with no
    // sender, target or realm (sendingChanges keeps listing such a change unattributed when its base names no shared
    // lock: madeUpMeta).
    const base = scope.slice(scope.indexOf('\u0001') + 1).split(/[#@]/)[0] ?? '';
    const { identity: _i, ...meta } = r.meta ?? { base, target: null, realm: null };
    void _i;
    const older: StoredChange = {
      id: scope + QUARANTINE + newInc(), pending: true, key: null, t: r.t, fmt: CHANGE_FMT, inc: newInc(), nonce: newInc(),
      ...(r.at !== undefined ? { at: r.at } : {}), meta,
    };
    return [older];
  });
}
/** What a store-lock turn converts first, with its one time (change-store.ts runs it at every turn's start, and
 *  nothing else does; loadStored asks only toConvert, which builds nothing): the converted list, or null when nothing needs
 *  converting, and whether an older record was left in place (another tab's live stamp; the turn then queues a load,
 *  which arms its stale re-read), with the earliest such stamp's expiry (`deadline`, for the refused arm). */
function olderPlan(list: readonly StoredChange[], now: number): { next: StoredChange[] | null; deferred: boolean; deadline: number } {
  let deadline = Infinity;
  for (const r of list) if (olderSendOut(r, now) && r.sending) deadline = Math.min(deadline, r.sending.at + SENDING_STALE_MS);
  return { next: toConvert(list, now) ? converted(list, now) : null, deferred: list.some((r) => olderSendOut(r, now)), deadline };
}
// The follow-up of a turn that converted (its new older changes show once stored) or left a live older record in
// place (its stale re-read is armed), whichever path opened the turn.
setTurnConversion(olderPlan, () => loadStored(), armStale);
/** A load (or followStored) that finds an older record to convert: an empty store-lock turn, whose start converts it. */
function convertStored(): void {
  underChangeStoreLocked(() => undefined).catch(() => { /* uncoordinated or refused: nothing older is shown; the next turn converts */ });
}
/** At admission (`list`: the clean read, already converted): an older record of `scope` being sent in another tab
 *  refuses the press (BUSY), and an older change of the scope refuses it as its own lock would (READ_BACK_FIRST for
 *  its sender, HELD_BY_OTHER for another). An older change this tab still holds in memory but the clean read lacks
 *  (freed in another tab, no storage event yet) goes from memory first. With `compat`, both
 *  barriers also hold in the scope filed the other way (compatScopeOf: same account and base, computer kept), whatever
 *  the digest: an older change's identity is unknown and an older record is never adopted. */
function quarantineRefusal(scope: string, by: string | undefined, list: readonly StoredChange[], now: number, compat?: Compat): Refusal | null {
  const own = owner();
  // The scope part (account removed) of a lock id is this press's scope, or with `compat` its other filing.
  const barring = (id: string, base: string | undefined, across?: unknown): boolean => {
    if (!id.startsWith(own)) return false;
    const q = id.indexOf(QUARANTINE), sc = q >= 0 ? id.slice(own.length, q) : scopeOfId(id).slice(own.length);
    return sc === scope || (!!compat && compatScopeOf(scope, sc, base, compat, across));
  };
  const quarantined = (id: string, base: string | undefined, across?: unknown): boolean => id.includes(QUARANTINE) && barring(id, base, across);
  if (list.some((r) => olderSendOut(r, now) && barring(r.id, olderOutOf(r).base ?? undefined))) return { outcome: 'not_sent', code: 'BUSY' };
  let gone = false;
  for (const [qid, q] of [...reg]) if (quarantined(qid, q.meta?.base, q.meta?.across) && !q.busy && q.t !== undefined && !list.some((r) => r.id === qid)) { reg.delete(qid); gone = true; }
  if (gone) changed();
  for (const r of list) if (quarantined(r.id, r.meta?.base, r.meta?.across) && !reg.get(r.id)?.busy) adopt(r.id, r, now);
  for (const [qid, q] of reg) if (quarantined(qid, q.meta?.base, q.meta?.across)) { const no = refusalOfLock(q, by); if (no) return no; }
  return null;
}
/** Merges the account's stored records into memory (a reload, another tab's write, an account change). True only
 *  when the store read clean (what a caller relying on the merge needs: mergeStoredChanges). */
function loadStored(): boolean {
  let own: string;
  try { own = owner(); } catch { return false; } // before the session is readable: nothing to load yet
  loadedFor = own;
  const rd = readChangesState();
  if (rd.state === 'unreadable') return false;
  const list = rd.list;
  const now = Date.now();
  // Older records are never adopted (see "records of older builds"); a clean read with any to convert queues their
  // conversion, and one sent in another tab now is read again when its stamp goes stale.
  if (rd.state === 'clean' && toConvert(list, now)) convertStored();
  let any = false, nextStale = Infinity;
  const seen = new Set<string>();
  const older = new Map<string, OlderOut>();
  for (const r of list) {
    if (olderSendOut(r, now) && r.sending) nextStale = Math.min(nextStale, r.sending.at + SENDING_STALE_MS);
    if (olderUnresolved(r) && r.id.startsWith(own) && own !== '\u0001') older.set(r.id, olderOutOf(r));
    if (!r.id.startsWith(own) || own === '\u0001' || olderRecord(r)) continue;
    seen.add(r.id);
    const l = reg.get(r.id);
    if (l && l.t !== undefined && r.t <= l.t && !(l.away !== undefined && !sendingLive(r.sending, now))) continue;
    if (!l && !r.pending && r.key === null && !r.sending) continue;
    if (adopt(r.id, r, now)) any = true;
  }
  // Stored before and gone from a clean read: resolved in another tab. A corrupt store proves no absence.
  for (const [id, l] of rd.state === 'clean' ? [...reg] : []) {
    if (!id.startsWith(own) || seen.has(id) || l.busy || l.t === undefined) continue;
    reg.delete(id);
    any = true;
  }
  // An older build's unconverted records: a clean read replaces them, so one leaves only once a read no longer lists
  // it (its answer, or its conversion, which stores the older change in the same write: one read, one notice). Not at
  // its stamp's expiry, nor while its conversion waits or is refused. A corrupt read adds what it saw and proves no
  // absence.
  const nextOlder = rd.state === 'clean' ? older : new Map([...olderOut, ...older]);
  const keys = (m: Map<string, OlderOut>): string => [...m.entries()].map(([k, v]) => k + '\u0002' + (v.base ?? '') + '\u0002' + (v.realm ?? '')).sort().join('\u0003');
  if (keys(nextOlder) !== keys(olderOut)) any = true;
  olderOut = nextOlder;
  // Every foreign stamp still out, adopted now or before (an unrelated write must not cancel its timer).
  setStaleTimer(nextStale);
  if (any) changed();
  scrubKeyBytes();
  return rd.state === 'clean';
}
/** The one stale re-read timer, at the earliest foreign stamp's expiry (adopted stamps included: an unrelated write
 *  must not cancel its timer); none when no stamp is out. */
function setStaleTimer(stored: number): void {
  let next = stored;
  for (const l of reg.values()) if (l.away !== undefined) next = Math.min(next, l.away + SENDING_STALE_MS);
  if (staleTimer) { clearTimeout(staleTimer); staleTimer = null; }
  if (next !== Infinity) staleTimer = setTimeout(() => { staleTimer = null; loadStored(); }, Math.max(0, next - Date.now()) + 50);
}
/** A turn whose conversion could not be stored (change-store.ts runs this instead of its follow-up, with `deadline`:
 *  the earliest live older stamp's expiry its clean read saw, Infinity for none): reads, never writes or converts,
 *  and re-arms the one stale re-read timer. Every arm goes through setStaleTimer, which also takes this tab's
 *  earliest remembered `away` stamp (one already expired fires about 50 ms later). Its own read unreadable: a finite
 *  `deadline` goes to setStaleTimer, an infinite one adds no timer. Readable: the earliest live older stamp still
 *  stored; when none is live, the turn saw one (finite `deadline`) and an older record still needs converting (it
 *  went stale or was released before this ran), one re-read now. When neither a stamp nor that retry gives a time,
 *  no timer, so a lasting refusal ends after the stamps go stale. */
function armStale(deadline: number): void {
  const rd = readChangesState();
  if (rd.state === 'unreadable') { if (deadline !== Infinity) setStaleTimer(deadline); return; }
  const now = Date.now();
  let next = Infinity;
  for (const r of rd.list) if (olderSendOut(r, now) && r.sending) next = Math.min(next, r.sending.at + SENDING_STALE_MS);
  if (next === Infinity && deadline !== Infinity && toConvert(rd.list, now)) next = now;
  setStaleTimer(next);
}
// An older build stored keyBytes with a record: the digest of the full variables a key went with (unsalted, a
// password change's too). Under the store lock, over a clean read, every stored record (any
// account's) loses it in place: same id, same version, nothing else moved, nothing removed. A held record keeps
// its id, so a press of the same change still refuses (READ_BACK_FIRST) and sends nothing; a kept key is
// replayed only for bytes this tab sent it with (adopt never trusts a stored keyBytes). A corrupt store is left
// as it is: its unreadable records are never written away.
const hasKeyBytes = (r: StoredChange): boolean => r.keyBytes !== undefined;
function scrubKeyBytes(): void {
  const seen = readChangesState();
  if (seen.state !== 'clean' || !seen.list.some(hasKeyBytes)) return;
  underChangeStoreLocked(() => {
    const rd = readChangesState();
    if (rd.state !== 'clean' || !rd.list.some(hasKeyBytes)) return;
    writeChanges(rd.list.map((r) => { if (!hasKeyBytes(r)) return r; const { keyBytes: _gone, ...rest } = r; return rest; }));
  }).catch(() => { /* uncoordinated or refused: the next load tries again */ });
}
subscribeChangeStore(loadStored);
// The shown account becomes known (or changes) without a bump: load its records.
subscribe(() => { try { if (owner() !== loadedFor) loadStored(); } catch { /* not booted */ } });


/** Runs one send of the change under its lock (see the contract). `send` gets the key to replay, if any. */

/** A refused press: this sender's own change is pending (READ_BACK_FIRST) or being sent (BUSY), or ANOTHER
 *  sender's change holds the lock (HELD_BY_OTHER, with the page that sent it): that one is not this page's to
 *  check or dismiss, and nothing of this press was sent. HOLDS_FULL / TOO_LARGE: the stored holds of this
 *  account are at their cap, or this change's record is too large to store; a hold is never evicted to make
 *  room, so the press is refused unsent (a pending change must be checked or dismissed first). STORE_UNAVAILABLE:
 *  the hold could not be stored and read back (storage unreadable or corrupt, a refused write), so nothing was
 *  sent: a send with no stored hold could be sent again after a reload. */
export type Refusal = { outcome: 'not_sent'; code: 'BUSY' | 'READ_BACK_FIRST' | 'HELD_BY_OTHER' | 'HOLDS_FULL' | 'TOO_LARGE' | 'STORE_UNAVAILABLE' | 'NO_COORDINATION' | 'NOT_WIRED'; heldFrom?: HeldFrom | null };
// A hold stored before a definition's sender named its route, lock and page ('q:<route id>#<n>': the load
// order) is adopted as the sender of the one definition of that route and base, bound to the page that owns it
// (the definition's own page, else the page the hold records). With no such definition, or no owning page, it
// is nobody's (undefined, as a hold recording no sender): read-only to every page, no read-back judges it, and
// a warned Dismiss from a page that declares its lock frees it. Definitions declare themselves (query.ts).
const LEGACY_SENDER = /^q:([^@]*)#\d+$/;
const definitionsOfRoute = new Map<string, Array<{ readonly base: string; readonly sender: string; readonly page?: string }>>();
/** query.ts defineMutation only: a definition's route id, lock base, sender (without a page) and own page. */
export function declareDefinition(routeId: string, base: string, sender: string, page?: string): void {
  const list = definitionsOfRoute.get(routeId) ?? [];
  list.push(Object.freeze({ base, sender, ...(page ? { page } : {}) }));
  definitionsOfRoute.set(routeId, list);
}
/** The sender a lock answers to (ChangeMeta.by, an older build's one adopted as above). */
function senderOf(m: ChangeMeta | undefined): string | undefined {
  const by = m?.by;
  const old = by === undefined ? null : LEGACY_SENDER.exec(by);
  if (!old || !m) return by;
  const defs = (definitionsOfRoute.get(old[1]!) ?? []).filter((d) => d.base === m.base);
  const page = defs.length === 1 ? defs[0]!.page ?? m.page : undefined;
  return page ? defs[0]!.sender + '/' + page : undefined;
}
// A lock base filed two ways. A definition that files across realms (query.ts changeScope `acrossRealms`) files
// `base#comp` (or `base`) where the same definition in a build without the flag files `base@realm#comp` (or
// `base@realm`). Builds of both kinds run at once (a deploy or a rollback with tabs of the other build still open),
// so each honours the other's hold of the same change, whichever was sent first: a hold of
// the same base and digest filed the other way refuses a press (refusalOf/guarded with `compat`), counts for the
// hooks (isPending/isBusy with `compat`) and is what a read-back or a Dismiss names (refusingHold). An across base
// also shows its realm-scoped holds and sends in every realm view (shownIn). Rollout precondition: a tab of a build
// without this check checks its realm-scoped id only and nothing here can change that, so a definition may turn
// acrossRealms only once no such tab still mutates: shipping a build with the check first does not reload tabs
// already open, which must be retired or reloaded before the flag turns on.
const acrossBases = new Set<string>();
/** query.ts / source.ts only: a definition of this lock base files its locks across realms. */
export function declareAcrossRealms(base: string): void { acrossBases.add(base); }
// A lock base whose changes name their own realm on every call (query.ts MutationOpts explicitRealm, e.g. the Memory
// page's Global store, which the top bar never shows): its holds and sends show in every realm view (shownIn), since
// only reads that name the change's realm judge it. Filed as before (under that realm), so a build without the
// declaration still finds, refuses and keeps the same hold; it only leaves it out of a realm view it is not filed under.
const explicitBases = new Set<string>();
/** query.ts / source.ts only: a definition of this lock base names its own realm on every call. */
export function declareExplicitRealm(base: string): void { explicitBases.add(base); }
/** A definition's other filing (query.ts / source.ts): its lock base, and whether it files across realms (its
 *  other filing is then the realm-scoped id, else the unscoped one). */
export interface Compat { readonly base: string; readonly across: boolean }
/** Why a press of (scope, digest) by `by` is refused now, or null when it may be sent. With `compat`, a hold of
 *  the same change filed the other way refuses it too. */
export function refusalOf(scope: string, digest: string, by?: string, compat?: Compat): Refusal | null {
  const l = reg.get(idOf(scope, digest));
  return (l ? refusalOfLock(l, by) : null) ?? (compat ? compatRefusal(scope, digest, by, compat) : null);
}
/** True when `other` is `scope` as it was filed before its definition turned acrossRealms (query.ts changeScope):
 *  the same scope with '@<realm>' before its computer part ('#project/container' or '#-', agent routes) or at its
 *  end (realm routes). */
function legacyScopeOf(scope: string, other: string): boolean {
  const h = scope.lastIndexOf('#');
  const onComputer = h >= 0 && /^#[^#@\u0000]*\/[^#@\u0000]*$|^#-$/.test(scope.slice(h));
  const head = onComputer ? scope.slice(0, h) : scope, tail = onComputer ? scope.slice(h) : '';
  if (other.length <= head.length + tail.length + 1 || !other.startsWith(head + '@') || !other.endsWith(tail)) return false;
  return !/[@#\u0000]/.test(other.slice(head.length + 1, other.length - tail.length));
}
/** True when `other` (a stored id's scope, with its record's base `base` and filing `across` when it records them)
 *  is `scope` filed the other way (Compat). A record of another base never matches, also when its name reads like a
 *  realm-scoped id of this one (a lock named `x@other`). For a definition without acrossRealms,
 *  an unscoped record that says it was filed naturally (across false: a base, account or kit route's, or a locked
 *  change's, sharing the lock) is another route's change, never this one filed across; one that
 *  records no filing (an older build's) still matches, so it refuses as before. A record with no metadata matches by
 *  its id alone. */
function compatScopeOf(scope: string, other: string, base: string | undefined, c: Compat, across?: unknown): boolean {
  if (base !== undefined && base !== c.base) return false;
  if (!c.across && across === false) return false;
  return c.across ? legacyScopeOf(scope, other) : legacyScopeOf(other, scope);
}
/** The locks of this account holding (scope, digest) filed the other way (compatScopeOf); any digest without one. */
function compatLocks(scope: string, digest: string | undefined, c: Compat): Array<[string, ChangeLock]> {
  const own = owner(), out: Array<[string, ChangeLock]> = [];
  for (const [id, l] of reg) {
    if (!id.startsWith(own)) continue;
    const cut = id.lastIndexOf('\u0000');
    if (digest !== undefined && id.slice(cut + 1) !== digest) continue;
    if (compatScopeOf(scope, id.slice(own.length, cut), l.meta?.base, c, l.meta?.across)) out.push([id, l]);
  }
  return out;
}
function compatRefusal(scope: string, digest: string, by: string | undefined, c: Compat): Refusal | null {
  for (const [, l] of compatLocks(scope, digest, c)) { const no = refusalOfLock(l, by); if (no) return no; }
  return null;
}
/** The held send that refuses a press of (scope, digest) (its own id, or with `compat` the same change filed the
 *  other way): its scope, computer, realm and hold, which a read-back after a READ_BACK_FIRST refusal must read,
 *  never the press's (a realm view that never showed the computer proves nothing about it), and a Dismiss names.
 *  Only a pending one: a record released keeping its key refuses nothing. Null when none. */
export function refusingHold(scope: string, digest: string, compat?: Compat): { scope: string; target: ChangeTarget | null; realm: string | null; hold: string | undefined } | null {
  const own = owner(), l = reg.get(idOf(scope, digest));
  if (l && l.pending && l.meta) return { scope, target: l.meta.target, realm: l.meta.realm, hold: holdOf(l) };
  if (!compat) return null;
  for (const [id, x] of compatLocks(scope, digest, compat)) if (x.pending && x.meta) return { scope: id.slice(own.length, id.lastIndexOf('\u0000')), target: x.meta.target, realm: x.meta.realm, hold: holdOf(x) };
  return null;
}
// Pending, being sent here, or being sent in another tab (its stamp is live): refused; by whom decides the code.
function refusalOfLock(l: ChangeLock, by?: string): Refusal | null {
  const sending = l.busy || awayLive(l);
  if (!l.pending && !sending) return null;
  const holder = senderOf(l.meta);
  if (by !== undefined && holder !== undefined && holder !== by) return { outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: heldFromMeta(l.meta) };
  return { outcome: 'not_sent', code: l.pending ? 'READ_BACK_FIRST' : 'BUSY' };
}

/** A press the session's disposal ended after its admission stored the sending stamp and before anything was sent: the
 *  stamp is taken back as any unsent press's is (persist with this press's own token: a kept key stays held, a key this
 *  press minted is dropped, and a record left with nothing worth storing is deleted). */
function giveBackUnsent(id: string, l: ChangeLock, minted: boolean): { outcome: 'stale' } {
  if (minted) { l.key = null; l.keyBytes = undefined; }
  l.busy = false;
  persist(id, l, { sent: tokenOf(l) ?? '' });
  return { outcome: 'stale' };
}

/** Runs one send of the change under its lock (see the contract). `send` gets the key to send with: a kept key
 *  to replay, or `firstKey` (the key a route that takes one is sent with), stored with the hold before the send
 *  leaves, so a send cut off mid-way (a reload, a crash) keeps a receipt to read. Nothing is sent unless the hold
 *  was stored and read back under the cross-tab lock (STORE_UNAVAILABLE otherwise). `who`: the account the press
 *  was made in (changeOwner() before the caller's first await); when another account is shown by now, or by the
 *  time the store lock is granted, the press touches no lock, sends nothing and answers stale. */
export async function guarded<T extends { outcome: Outcome; idem?: string }>(
  scope: string, digest: string, send: (replayKey: string | undefined) => Promise<T>, meta?: ChangeMeta, bytes?: string, firstKey?: string, who?: string, compat?: Compat,
): Promise<T | Refusal | { outcome: 'stale' }> {
  if (who !== undefined && owner() !== who) return { outcome: 'stale' };
  // A shared lock's send names its lock and realm, so every page sharing the lock can tell what is out
  // (sendingChanges): without them it is refused unsent, touching nothing.
  if (scope.startsWith('lock:') && (!meta || !meta.base.startsWith('lock:') || !scope.startsWith(meta.base) || !['', '@', '#'].includes(scope.charAt(meta.base.length)) || meta.realm === undefined)) return { outcome: 'not_sent', code: 'NOT_WIRED' };
  const own = owner(), id = idOf(scope, digest);
  const asked = resets; // a reset (session disposal) while admission is awaited ends this press unsent
  if (owner() !== loadedFor) loadStored();
  const l = lockOf(id);
  // A refused press never rewrites the metadata (computer, realm, sender) of the change that holds the lock.
  // `compat`: a hold of the same change filed the other way refuses it as well.
  const early = refusalOfLock(l, meta?.by) ?? (compat ? compatRefusal(scope, digest, meta?.by, compat) : null);
  if (early) return early;
  // A request of this change still out in this tab, whatever memory says (a warned Dismiss freed the copy re-adopted
  // after an account round trip while it was out): BUSY until it answers, so this tab never has two requests of one
  // change out (the header's overlap note).
  if (sendsOut.has(id)) return { outcome: 'not_sent', code: 'BUSY' };
  l.busy = true;
  changed();
  // Set when this press made the hold's key (firstKey): not a replay, and dropped again if nothing was sent.
  let minted = false;
  // Admission against a fresh, clean read of the stored records, under the cross-tab store lock: another tab's
  // pending record or live send refuses this press as refusalOfLock says (READ_BACK_FIRST / BUSY, or
  // HELD_BY_OTHER when another sender's); a send whose tab died mid-way is adopted as pending. The hold is then
  // written and read back; only then may the send leave. Storage that cannot be read, a corrupt store (an absent
  // record proves nothing there), a refused write or a failed read-back: refused unsent (STORE_UNAVAILABLE).
  const unavailable: Refusal = { outcome: 'not_sent', code: 'STORE_UNAVAILABLE' };
  const admit = (): Refusal | 'stale' | null => {
    // The account moved while the lock was awaited, or the registry replaced this lock meanwhile (an account round
    // trip reloads it as another object): this press's reservation is no longer the registry's, so it reads and
    // writes nothing (adoption and refusal must judge one object).
    if (owner() !== own || reg.get(id) !== l) return 'stale';
    const rd = readChangesState();
    if (rd.state !== 'clean') return unavailable;
    const list = rd.list;
    // The turn's one time: its start converted the older records with it (this read comes after that write), so a
    // stamp left live there stays the scope's barrier (BUSY) here; it never goes stale between the two.
    const now = turnNow();
    const barred = quarantineRefusal(scope, meta?.by, list, now, compat);
    if (barred) return barred;
    const r = list.find((x) => x.id === id);
    // Another version, another send's record (incarnation or nonce, even at the same version), or a live send of
    // another tab: adopted, then judged.
    if (r && (r.t !== l.t || r.inc !== l.inc || r.nonce !== l.nonce || (r.sending && r.sending.tab !== changeStoreTab()))) {
      l.busy = false;
      adopt(id, r, now);
      const no = refusalOfLock(l, meta?.by);
      if (no) return no;
      l.busy = true;
    }
    // A hold of this change filed the other way (Compat; by this tab or another, of this base): adopted, then
    // judged as its own record would be. Never freed or rewritten here.
    if (compat) {
      for (const x of list) {
        const rest = x.id.startsWith(own) ? x.id.slice(own.length) : '', cut = rest.lastIndexOf('\u0000');
        if (cut < 0 || rest.slice(cut + 1) !== digest || !compatScopeOf(scope, rest.slice(0, cut), x.meta?.base, compat, x.meta?.across)) continue;
        adopt(x.id, x, now);
        const no = refusalOfLock(lockOf(x.id), meta?.by);
        if (no) return no;
      }
    }
    if (!r && l.t !== undefined) {
      // Stored before and gone from this clean read (another tab's proof, a forget queued ahead): nothing of it is
      // this press's. Its key is spent: never replayed, and a refusal of this send is not a replay's.
      l.pending = false; l.key = null; l.keyBytes = undefined; l.inc = undefined; l.nonce = undefined; l.away = undefined; l.at = undefined; l.t = undefined;
    }
    const was = { meta: l.meta, sentAt: l.sentAt, key: l.key, keyBytes: l.keyBytes, inc: l.inc, nonce: l.nonce, oc: l.oc, fmt: l.fmt };
    const undo = (): void => { l.meta = was.meta; l.sentAt = was.sentAt; l.key = was.key; l.keyBytes = was.keyBytes; l.inc = was.inc; l.nonce = was.nonce; l.oc = was.oc; l.fmt = was.fmt; minted = false; };
    if (meta) l.meta = meta.identity === undefined ? meta : { ...meta, identity: plainCopy(meta.identity) };
    // A released change sent again with other bytes (same identity under a lockKey) is a new request.
    if (l.key !== null && bytes !== undefined && l.keyBytes !== bytes) { l.key = null; l.keyBytes = undefined; }
    // A change that holds nothing yet: a new incarnation, and its first key stored with it before it is sent.
    if (!l.pending && l.key === null) {
      l.inc = newInc();
      if (firstKey !== undefined) { l.key = firstKey; l.keyBytes = bytes; minted = true; }
    }
    // A lock with a kept key and no incarnation (none this build adopts: an older build's record converts instead)
    // gets one now, so its outcome can name its record.
    if (l.inc === undefined) l.inc = newInc();
    // Every record this build writes is in its format (see "records of older builds"); none it adopted is older.
    l.fmt = CHANGE_FMT;
    // Every admission is another send (a replay of a kept key included): a new nonce, so the hold token moves, and a
    // new outcome nonce.
    l.nonce = newInc();
    l.oc = newInc();
    l.sentAt = now;
    const t = nextVersion(list);
    const next = [...list.filter((x) => x.id !== id), recordOf(id, l, t)];
    // The stored holds never make room by dropping one (a reload would free it): over the cap, or a record too
    // large to store, this press is refused unsent, and the lock keeps what it had. Sized as the record will be
    // once the send went pending (the worst case: pending, its time, a key of the longest stored form,
    // no stamp), so the answer's write can never be refused for size after the request left.
    const { sending: _stamp, ...rest } = recordOf(id, l, t);
    void _stamp;
    const final: StoredChange = { ...rest, pending: true, at: now, key: 'k'.repeat(KEY_MAX) };
    const fit = changesFit(next) ?? changesFit([...list.filter((x) => x.id !== id), final]);
    if (fit) { undo(); return { outcome: 'not_sent', code: fit }; }
    // A throwing write may have landed: the read-back below decides, as for any write.
    let wrote: boolean;
    try { wrote = writeChanges(next); } catch { wrote = true; }
    if (!wrote) { undo(); return unavailable; }
    const back = readChangesState();
    if (back.state !== 'clean' || !back.list.some((x) => x.id === id && x.t === t)) {
      undo();
      // Best effort: take the unsent stamp back, so no tab reads it later as a send that may have gone through.
      try { if (back.state === 'clean') writeChanges(back.list.filter((x) => !(x.id === id && x.t === t))); } catch { /* best effort */ }
      return unavailable;
    }
    l.t = t;
    return null;
  };
  let refused: Refusal | 'stale' | null;
  // Admission runs only under the cross-tab lock: without navigator.locks, or when its request throws, it is
  // refused unsent (NO_COORDINATION): two tabs could both read "free" and both send.
  if (!changeStoreCoordinated()) refused = { outcome: 'not_sent', code: 'NO_COORDINATION' };
  else {
    // A turn whose conversion could not be stored ran nothing: refused unsent, as storage that refuses a write.
    try { refused = await underChangeStoreLocked(admit); } catch (e) { refused = e instanceof ChangeStoreRefused ? unavailable : { outcome: 'not_sent', code: 'NO_COORDINATION' }; }
  }
  if (refused) {
    l.busy = false;
    tidy(id, l);
    changed();
    return refused === 'stale' ? { outcome: 'stale' } : refused;
  }
  // Disposed between the admission and this continuation: nothing is sent and no heartbeat starts. The stamp the admission
  // stored is taken back as any unsent press's is (persist with this press's own token: a kept key stays held).
  if (asked !== resets) return giveBackUnsent(id, l, minted);
  // This request's own token (set by admission): its heartbeat, its sendsOut entry and its outcome all name it.
  const mine = { inc: l.inc, nonce: l.nonce, token: tokenOf(l) ?? '' };
  sendOutAdd(id, mine.token, l.meta);
  // Admission installed this send's metadata: a page reading sendingChanges sees the send before it leaves (the
  // notice at the press came before the metadata).
  changed();
  // A subscriber of that notice may dispose the session: checked again before the heartbeat and the request exist.
  if (asked !== resets) return giveBackUnsent(id, l, minted); // the reset also forgot the send-out entry
  // While the send is out its stamp is renewed, so another tab never reads it as a dead tab's.
  // Only under the cross-tab lock (never a whole-list replace uncoordinated); a refused beat keeps the record.
  // Only over this request's own record: an absent record, or another request's of the same change (a later
  // incarnation admitted after a warned Dismiss), is left alone.
  const born = resets;
  const beat = setInterval(() => {
    underChangeStoreLocked(() => {
      if (born !== resets) return;
      // Only over a clean read, like every other writer: a corrupt store's unreadable records (another build's,
      // possibly another tab's hold) are never written away.
      const rd = readChangesState();
      if (rd.state !== 'clean') return;
      const list = rd.list;
      const cur = list.find((x) => x.id === id);
      if (!cur || !cur.sending || cur.sending.tab !== changeStoreTab() || !l.busy || cur.inc !== mine.inc || cur.nonce !== mine.nonce) return;
      l.sentAt = Date.now();
      const t = nextVersion(list);
      // A Dismiss or proof of a re-adopted copy of this request deletes or releases its record by token, so the
      // version this beat moves never makes it lose.
      if (writeOrReadBack([...list.filter((x) => x.id !== id), recordOf(id, l, t)], (back) => back.some((x) => x.id === id && x.t === t))) l.t = t;
    }).catch(() => { /* best effort */ });
  }, SENDING_HEARTBEAT_MS);
  beats.add(beat);
  const replay = l.key !== null && !minted;
  try {
    let res = await send(l.key ?? undefined);
    // A replay of a kept key that is refused (429, 409...) says nothing about the first send, which is still
    // unproven: the change stays "may have gone through" (pending again, the key kept), never "failed".
    if (replay && res.outcome === 'failed') res = { ...res, outcome: 'pending' };
    if (res.outcome === 'pending') {
      if (res.idem) { l.key = res.idem; l.keyBytes = bytes; }
      l.pending = true;
      l.seq = ++seq;
      l.at = Date.now();
      // The outcome nonce of this pending answer, chosen now: the answer's write (persist, below) stores exactly it, and
      // its store-lock turn is requested before any free a page makes from this result, so a proof read on this hold
      // is judged against the outcome it names.
      l.oc = newInc();
      // Which hold this press left (MutationResult.hold): the page records exactly this one.
      res = { ...res, hold: holdOf(l) };
    } else if (res.outcome === 'done' || res.outcome === 'failed') {
      l.key = null;
    } else if (minted) {
      // Not sent after all (refused before the request, or stale): the key this press made goes with it.
      l.key = null; l.keyBytes = undefined;
    }
    return res;
  } finally {
    clearInterval(beat);
    beats.delete(beat);
    sendOutDelete(id, mine.token);
    l.busy = false;
    l.sentAt = undefined;
    persist(id, l, { sent: mine.token, ...(l.oc !== undefined ? { oc: l.oc } : {}) });
    tidy(id, l);
    changed();
  }
}

/** The count of changes that went pending so far: a read-back reads it when it starts. */
export const pendingMark = (): number => seq;

// ---- frees ----
// Every free names the one send it concerns (`hold`: HeldChange.hold, MutationResult.hold, holdOfLock taken before
// the caller's own read) and is judged and stored in ONE store-lock turn (settleChange), never decided in memory
// first: until the stored free lands the lock stays pending, so no press of it goes out meanwhile. Never "whatever
// holds the lock now".
//   - The hold names the send's outcome nonce as the caller observed it. A non-warned free (a proof, a settle)
//     frees only while the stored record still has that outcome: an answer another tab stored after the caller's
//     read (a new pending outcome of the same send) refuses it ('unresolved'), and the page reads again.
//   - A non-warned free never removes a live sending stamp (any tab's, this tab's included), nor frees a change
//     whose request is still out in this tab.
//   - The person's warned Dismiss (`warned`) is the one exception to both: it was told the change may be sent again.
//     It still names the account, the context and the exact send.
//   - The context (account, realm, a round trip) is captured at the call (changeContext) and checked in the turn.
// Answers: 'stored' (freed, or already removed elsewhere), 'refused' (nothing done: the send or its context moved,
// a live stamp or a request out), 'unresolved' (storage could not judge or write it, or the observation is stale):
// the hold stays shown either way, never as failed.
export type SettleResult = 'stored' | 'refused' | 'unresolved';
export interface SettleAsk {
  readonly scope: string; readonly digest: string; readonly hold: string;
  readonly kind: 'release' | 'complete' | 'discard';
  /** The person's warned Dismiss (release only). */
  readonly warned?: boolean;
  /** A read-back's pending mark (pendingMark at its start): only a send that went pending at or before it. */
  readonly upTo?: number;
  /** Only that sender's send; `nobodys` (warned only) also one recording no sender. */
  readonly by?: string; readonly nobodys?: boolean;
  /** changeContext() and changeOwner() at the call, before its first await (default: now). */
  readonly ctx?: number; readonly owner?: string;
  /** Told whether THIS call wrote the transition: `own` turns true only when the
   *  judge found the exact send's record stored and still pending, and its own write of the free landed. 'stored'
   *  alone also answers a record already removed elsewhere (another tab's proof) or already released (another tab's
   *  Dismiss), which says nothing of what this call proved. The answer itself is unchanged. */
  readonly transition?: { own: boolean };
}
export async function settleChange(ask: SettleAsk): Promise<SettleResult> {
  const own = ask.owner ?? owner(), ctx = ask.ctx ?? ctxGen;
  if (typeof ask.hold !== 'string' || !ask.hold || own !== owner() || ctx !== ctxGen) return 'refused';
  const id = idOf(ask.scope, ask.digest);
  const warned = ask.kind === 'release' && ask.warned === true;
  const seen = splitHold(ask.hold);
  if (!changeStoreCoordinated()) return 'unresolved';
  const judge = (): SettleResult => {
    // The context the call was made in, read in the turn (an account round trip or a switch while it waited).
    if (owner() !== own || ctxGen !== ctx) return 'refused';
    const l = reg.get(id);
    if (!l || !holdsBy(l, ask.hold) || l.busy) return 'refused';
    const quarantined = id.includes(QUARANTINE);
    const holder = senderOf(l.meta);
    if (ask.by !== undefined && holder !== ask.by && !(warned && ask.nobodys && holder === undefined)) return 'refused';
    if (ask.kind === 'release' && (!l.pending || (quarantined && !warned))) return 'refused';
    if (ask.kind !== 'release' && (quarantined || l.away !== undefined || (ask.kind === 'complete' && !l.pending && !l.key))) return 'refused';
    if (ask.upTo !== undefined && l.seq > ask.upTo) return 'refused';
    // A request of this change still out in this tab (whatever its stamp's age): only the warned Dismiss frees the
    // copy re-adopted meanwhile (the header's overlap note).
    if (!warned && sendsOut.has(id)) return 'refused';
    const rd = readChangesState();
    if (rd.state !== 'clean') return 'unresolved';
    const list = rd.list, cur = list.find((r) => r.id === id);
    if (!cur) {
      // A hold that names no outcome (an older build's record) is proved by nothing, whatever storage holds now: only
      // the warned Dismiss frees its memory, here too.
      if (!warned && !seen.oc) return 'unresolved';
      // Removed elsewhere (another tab's proof, a forget): what the free wanted holds; never written back. This tab's
      // idle lock of the send goes, as a load drops it.
      reg.delete(id); tombs.delete(id); changed();
      return 'stored';
    }
    // Another send's record (another incarnation or nonce): nothing of it is this free's. Memory is left as it is.
    if (!recordOfSend(cur, seen.token)) return 'refused';
    if (!warned) {
      // The outcome the caller observed is not the one stored (another tab's answer landed after the read began), or
      // either side names none: the proof does not concern it. A record without a nonce was written by an older build
      // (or converted from one), whose tabs store a newer pending answer without one: two such outcomes cannot be told
      // apart, so no proof frees it; only the warned Dismiss does.
      if (!seen.oc || !cur.oc || cur.oc !== seen.oc) return 'unresolved';
      // A live stamp: a request of it is out (another tab's renewed send, or this tab's own): never removed.
      if (cur.sending && sendingLive(cur.sending, turnNow())) return 'refused';
    }
    const keep = ask.kind === 'release' && !quarantined && cur.key !== null;
    // Still pending in storage when judged: a record another tab already released is rewritten, never this call's own.
    const wasPending = cur.pending;
    const rest = list.filter((r) => r.id !== id);
    if (keep) {
      const t = nextVersion(list);
      const { sending: _s, ...base } = cur;
      void _s;
      const next: StoredChange = { ...base, pending: false, t };
      if (!writeOrReadBack([...rest, next], (back) => back.some((x) => x.id === id && x.t === t))) return 'unresolved';
      l.pending = false; l.away = undefined; l.t = t;
      // The outcome the write kept (a warned release over another tab's newer answer keeps that answer's nonce): a hold
      // read from memory afterwards names it, so a later proof judges the stored outcome.
      l.oc = cur.oc;
      if (l.key !== cur.key) { l.key = cur.key; l.keyBytes = undefined; }
    } else {
      if (!writeOrReadBack(rest, (back) => !back.some((x) => x.id === id))) return 'unresolved';
      reg.delete(id); tombs.delete(id);
    }
    if (ask.transition && wasPending) ask.transition.own = true;
    changed();
    return 'stored';
  };
  try { return await underChangeStoreLocked(judge); } catch { return 'unresolved'; }
}
type FreeOpts = Omit<SettleAsk, 'scope' | 'digest' | 'hold' | 'kind'>;
const freed = (ask: SettleAsk): Promise<boolean> => settleChange(ask).then((r) => r === 'stored');
/** Frees the pending change (scope, digest) of send `hold`; its key stays (a later send replays it). True once the
 *  free is stored (see the frees above). `o.warned`: the person's warned Dismiss of that shown hold; only that frees
 *  an older change converted on load (it has no key, and goes), never a proof or a settle. */
export function release(scope: string, digest: string, hold: string, o: FreeOpts = {}): Promise<boolean> {
  return freed({ ...o, ctx: o.ctx ?? ctxGen, owner: o.owner ?? owner(), scope, digest, hold, kind: 'release' });
}
/** Frees the change (scope, digest) of send `hold` and drops its key: proven applied (see the contract), pending or
 *  released with its key kept (a settle() kept it, so a later proof must still retire it). Never while it is being
 *  sent, here or in another tab. True once stored. */
export function complete(scope: string, digest: string, hold: string, o: Omit<FreeOpts, 'warned' | 'nobodys'> = {}): Promise<boolean> {
  return freed({ ...o, ctx: o.ctx ?? ctxGen, owner: o.owner ?? owner(), scope, digest, hold, kind: 'complete' });
}
/** Drops the lock and key of the change (scope, digest) of send `hold`: proven not applied. Never while it is being
 *  sent, here or in another tab. True once stored. */
export function discard(scope: string, digest: string, hold: string, o: Omit<FreeOpts, 'warned' | 'nobodys' | 'upTo'> = {}): Promise<boolean> {
  return freed({ ...o, ctx: o.ctx ?? ctxGen, owner: o.owner ?? owner(), scope, digest, hold, kind: 'discard' });
}

/** The account key the registry files changes under now: an async caller captures it before its first await and
 *  acts only while it is unchanged (an account switch meanwhile frees nothing). */
export const changeOwner = (): string => owner();

/** True while some change of the scope (one digest, or any) may have gone through and is not released. With
 *  `compat`, also one filed the other way. */
export function isPending(scope: string, digest?: string, compat?: Compat): boolean {
  for (const [id, l] of reg) if (inScope(id, scope) && (digest === undefined || id === idOf(scope, digest)) && l.pending) return true;
  return !!compat && compatLocks(scope, digest, compat).some(([, l]) => l.pending);
}

/** Every pending change of a base (this account): its scope, digest, recorded computer, realm and sender. With
 *  o.kept, also the released ones that still keep their key (what complete() can retire). */
export function pendingOf(base: string, o?: { kept?: boolean }): Array<{ scope: string; digest: string; target: ChangeTarget | null; realm: string | null; by?: string; seq: number }> {
  const out: Array<{ scope: string; digest: string; target: ChangeTarget | null; realm: string | null; by?: string; seq: number }> = [];
  const own = owner();
  for (const [id, l] of reg) {
    if (!(l.pending || (o?.kept && l.key)) || !l.meta || l.meta.base !== base || !id.startsWith(own)) continue;
    const rest = id.slice(own.length);
    const cut = rest.lastIndexOf('\u0000');
    out.push({ scope: rest.slice(0, cut), digest: rest.slice(cut + 1), target: l.meta.target, realm: l.meta.realm, ...(senderOf(l.meta) !== undefined ? { by: senderOf(l.meta) } : {}), seq: l.seq });
  }
  return out;
}

/** The send token of the lock of (scope, digest): its pending count (pendingMark), moved on each send that went
 *  pending, here or adopted from another tab or a reload; 0 without a lock. A mount records it after its send
 *  and frees by proof only while it is unchanged, so an earlier mount never frees a later send of the same
 *  identity. */
export function seqOfLock(scope: string, digest: string): number { return reg.get(idOf(scope, digest))?.seq ?? 0; }
/** The public hold (incarnation#nonce~outcome) of the lock of (scope, digest) (HeldChange.hold), or undefined: what a proof
 *  or a Dismiss names, so it never frees a later send of the same change, and a proof never frees an outcome stored
 *  after it was read (release, complete and discard take it; settleChange). */
export function holdOfLock(scope: string, digest: string): string | undefined { const l = reg.get(idOf(scope, digest)); return l ? holdOf(l) : undefined; }
/** One hold instance by its token (HeldChange.hold, MutationResult.hold), this account, of `base`: its scope,
 *  digest and sender; null when no lock holds that send now (freed, or sent again since). A preliminary lookup: the
 *  free that follows waits for its store-lock turn, where settleChange checks the send, its outcome and the context
 *  again. */
export function heldInstance(base: string, hold: string, kept = false): { scope: string; digest: string; by?: string; realm: string | null } | null {
  const own = owner();
  for (const [id, l] of reg) {
    if (!id.startsWith(own) || !l.meta || l.meta.base !== base || !holdsBy(l, hold)) continue;
    if (!(l.pending || (kept && l.key))) return null;
    const rest = id.slice(own.length), cut = rest.lastIndexOf('\u0000');
    const by = senderOf(l.meta);
    return { scope: rest.slice(0, cut), digest: rest.slice(cut + 1), realm: l.meta.realm, ...(by !== undefined ? { by } : {}) };
  }
  return null;
}

/** One held send of a hook's own declaration, as the hook's held() lists it: the hold to pass back to its
 *  settleHeld/dismissHeld, when it was sent and what it was about (identity: the lockKey value, deep-frozen;
 *  undefined without one), the computer selected when it was pressed (target, deep-frozen: the call's own
 *  input.target, else the shown computer, whatever the route's scope; null only when none was selected), and the
 *  account it was read under (opaque): a call under another account frees nothing. For a computer-scoped route the
 *  target is the computer the send went to, so a page tells two sends of one identity on two computers apart by it;
 *  for an account-wide or realm route it only says what was selected, and a page must not filter by it there. */
export interface HeldRow { readonly hold: string; readonly at: number; readonly identity: unknown; readonly target: ChangeTarget | null; readonly account: string }
/** The page that sent a held change: its id and its route, for a link ("Sent from Computers"). */
export interface HeldFrom { readonly page: string; readonly path: string }
/** HeldFrom of a change's metadata; null when the declaration named no page. */
export function heldFromMeta(m: ChangeMeta | undefined): HeldFrom | null {
  return m && typeof m.page === 'string' && /^[a-z0-9-]+$/.test(m.page) ? Object.freeze({ page: m.page, path: '/' + m.page }) : null;
}

/** One pending change of a shared lock, as a page that shares the lock sees it. Only the declaration that sent
 *  it can free it (read-back, settle/dismiss, complete, discard: each checks the sender). A page that did not
 *  send it (heldBy(h) 'other') shows it read-only: no Check again, no Dismiss, a link to `from`. */
export interface HeldChange {
  /** The idempotency key it was sent with (null: its route takes none): read its receipt with it. */
  readonly key: string | null;
  /** Its identity (the lockKey value; deep-frozen copy): what the change was about, to show it. */
  readonly identity: unknown;
  readonly target: ChangeTarget | null;
  readonly realm: string | null;
  readonly at: number;
  /** Which declaration sent it (opaque; ChangeMeta.by): ask the declaration with its heldBy(h). */
  readonly by: string | undefined;
  /** The page that sent it, for a link; null when its declaration named none. */
  readonly from: HeldFrom | null;
  /** False while this hold lives only in this tab's memory (storage could not be read or written): a reload or
   *  another tab will not see it, so a page may say so ("held in this tab only"). */
  readonly persisted: boolean;
  /** Which send of the change this is (its incarnation and send token, opaque): pass it to the declaration's
   *  settle, dismiss, complete or discard, which then act on this one send only, never a later send of the same
   *  change (even one replaying the same key) and never a hold of another realm. */
  readonly hold: string | undefined;
  /** Its send token in this tab (pendingMark order): moves on each send that went pending. */
  readonly seq: number;
}
// A plain-data copy (objects, arrays, strings, finite numbers, booleans, null): a cycle or a repeated object
// on the path becomes null, functions and other values are dropped; never throws.
function plainCopy(v: unknown, path: Set<object> = new Set()): unknown {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'object') return undefined;
  if (path.has(v)) return null;
  path.add(v);
  try {
    if (Array.isArray(v)) return v.map((x) => { const c = plainCopy(x, path); return c === undefined ? null : c; });
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) { const c = plainCopy((v as Record<string, unknown>)[k], path); if (c !== undefined) out[k] = c; }
    return out;
  } catch { return null; } finally { path.delete(v); }
}
const deepFreeze = (x: unknown): unknown => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { for (const k of Object.keys(x)) deepFreeze((x as Record<string, unknown>)[k]); Object.freeze(x); } return x; };
const frozen = (v: unknown): unknown => (v === undefined ? undefined : deepFreeze(plainCopy(v)));
/** A deep-frozen plain-data copy (see plainCopy): what core hands a page of data it must never share by reference. */
export const frozenCopy = frozen;
/** A shared lock's base ('lock:' + name), the one spelling every declaration and lookup uses. A scope appends
 *  '@<realm>' and '#<computer>' to its base, so a name holding '@' or '#' could file another lock's id (across lock
 *  'x@R1' and lock 'x' in realm R1 both 'lock:x@R1'), and NUL ends the scope in a lock id: such a name throws where it
 *  is declared (lock names are code literals). No shipped name ever held one, so no stored hold needs migrating. */
export function lockBase(name: string): string {
  if (/[@#\u0000]/.test(name)) throw new Error('a lock name holds no @, # or NUL: ' + JSON.stringify(name));
  return 'lock:' + name;
}
/** The pending changes of a shared lock (defineMutation/LiveChange `lock`), this account: a page that did not
 *  send one (another page did) reads its key and identity, reads the receipt and shows it as another page's
 *  change: only its sender settles or discards it (HELD_BY_OTHER and the sender checks refuse anyone else). Never the variables: the identity is the lockKey value (which must name no secret)
 *  and every field is a deep-frozen copy, so a caller can never reach or move the registry's own data. */
export function heldChanges(lock: string, o?: { realm?: string | null }): HeldChange[] {
  return heldOfBase(lockBase(lock), o);
}
/** The held changes of a shared lock that record no sender (an older build's change converted on load: no page
 *  can name or prove it), as rows for a source's dismissHeld, which frees one only as the person's warned Dismiss.
 *  Each carries the account read now, so a row read under one account frees nothing under the next. */
export function nobodysHeld(lock: string, o?: { realm?: string | null }): HeldRow[] {
  let account: string;
  try { account = owner(); } catch { return []; }
  return heldChanges(lock, o).filter((h) => h.by === undefined && typeof h.hold === 'string' && h.hold !== '')
    .map((h) => Object.freeze({ hold: h.hold as string, at: h.at, identity: h.identity, target: h.target, account }));
}
// The view filter heldChanges and sendingChanges share: this account's locks of `base` only. o.realm (the realm
// shown; 'all' shows every realm): a change sent in another realm is left out, so a page never blocks on a hold it
// can neither check nor dismiss there. A change with no realm (account-wide, a kit call) always counts. A lock not
// filed under its realm (query.ts changeScope `acrossRealms`) holds in every view, so it always counts.
function inView(id: string, l: ChangeLock, own: string, base: string, shown: string | null): l is ChangeLock & { meta: ChangeMeta } {
  return !!l.meta && l.meta.base === base && shownIn(id, l.meta.realm, own, shown, base);
}
// This account's id, and not a change filed under a realm other than the one shown. A base filed across realms
// (declareAcrossRealms) holds in every view, its legacy realm-scoped holds included; so does a base whose changes name
// their own realm (declareExplicitRealm).
function shownIn(id: string, realm: string | null, own: string, shown: string | null, base?: string): boolean {
  if (!id.startsWith(own)) return false;
  if (base !== undefined && (acrossBases.has(base) || explicitBases.has(base))) return true;
  const filed = id.slice(own.length, id.lastIndexOf('\u0000'));
  return !(shown !== null && realm !== null && realm !== shown && filed.includes('@' + realm));
}
const shownRealm = (o?: { realm?: string | null }): string | null => (o && o.realm !== undefined && o.realm !== null && o.realm !== 'all' ? o.realm : null);
/** Merges the stored change records into memory now, as another tab's storage event would (subscribeChangeStore): a caller that has
 *  just stored a hold another tab's change must see (an upload batch's) reads heldChanges/sendingChanges after it,
 *  so a change that tab admitted before its storage event arrived here is not missed. False when the store did not
 *  read clean (unreadable, corrupt, or no session yet): what memory holds then proves no absence, so refuse. */
export function mergeStoredChanges(): boolean { return loadStored(); }
/** heldChanges() by lock base (query.ts / source.ts hooks: a definition without a shared lock has its own base). */
export function heldOfBase(base: string, o?: { realm?: string | null }): HeldChange[] {
  const own = owner(), out: HeldChange[] = [], shown = shownRealm(o);
  for (const [id, l] of reg) {
    if (!l.pending || !inView(id, l, own, base, shown)) continue;
    out.push(Object.freeze({ key: l.key, identity: frozen(l.meta.identity), target: frozen(l.meta.target) as ChangeTarget | null, realm: l.meta.realm, at: l.at ?? 0, by: senderOf(l.meta), from: heldFromMeta(l.meta), persisted: l.t !== undefined, hold: holdOf(l), seq: l.seq }));
  }
  return out.sort((a, b) => a.at - b.at);
}

/** One of this account's unresolved changes as Home lists it, of any base: read-only facts to name it and link to the
 *  page that sent it (only that page can check or free it). `ref`: opaque and stable for this send while this tab runs
 *  (another send of the same change gets another), for a list key; it names nothing. `base` is its definition's (null:
 *  a record without metadata, or an older build's record not converted yet, whose identity is never read). `held`:
 *  sent, its outcome not known (a hold); false: its send is out now (here or in another tab). Every field is a
 *  deep-frozen copy. */
export interface ChangeOverview {
  readonly ref: string;
  readonly base: string | null;
  readonly identity: unknown;
  readonly target: ChangeTarget | null;
  readonly realm: string | null;
  readonly at: number;
  readonly from: HeldFrom | null;
  readonly held: boolean;
}
const overviewRefs = new Map<string, string>();
let overviewRefN = 0;
const overviewRef = (k: string): string => {
  let r = overviewRefs.get(k);
  if (r === undefined) {
    if (overviewRefs.size >= 4096) overviewRefs.clear();
    r = 'c' + (++overviewRefN).toString(36);
    overviewRefs.set(k, r);
  }
  return r;
};
/** Every unresolved change of the shown account (pending, or out now), of every base, oldest first, with the view
 *  filter heldChanges uses (o.realm: a change filed under another realm than the one shown is left out; 'all' shows
 *  every realm). o.except: shared locks whose changes a caller shows elsewhere, left out. An older build's records
 *  not converted yet are listed too, unattributed and held, as sendingChanges lists them: a reader
 *  never loses a change core still counts. Never frees, sends or stores anything itself; an account read for the
 *  first time loads its stored records first, as every reader of the registry does (heldChanges, changeHoldRefs). */
export function changesOverview(o?: { realm?: string | null; except?: readonly string[] }): ChangeOverview[] {
  let own: string;
  try { own = owner(); } catch { return []; }
  if (own === '\u0001') return [];
  // As changeHoldRefs: an account first read now merges its stored records (a reload's holds) before they are listed.
  if (own !== loadedFor) loadStored();
  const shown = shownRealm(o), out: ChangeOverview[] = [], skip = new Set((o?.except ?? []).map(lockBase));
  const unattributed = (ref: string, realm: string | null, at: number, held: boolean): ChangeOverview => Object.freeze({ ref, base: null, identity: null, target: null, realm, at, from: null, held });
  for (const [id, l] of reg) {
    const held = l.pending;
    if (!held && !l.busy && !awayLive(l)) continue;
    const ref = overviewRef(id + '\u0000' + (tokenOf(l) ?? ''));
    // No metadata, or metadata a conversion made up from the scope (no sender, target or realm): unattributed.
    if (!l.meta || madeUpMeta(id, l)) {
      if (shownIn(id, null, own, shown)) out.push(unattributed(ref, null, l.at ?? 0, held));
      continue;
    }
    if (skip.has(l.meta.base) || !shownIn(id, l.meta.realm, own, shown, l.meta.base)) continue;
    out.push(Object.freeze({ ref, base: l.meta.base, identity: frozen(l.meta.identity) ?? null, target: (frozen(l.meta.target) ?? null) as ChangeTarget | null, realm: l.meta.realm, at: l.at ?? 0, from: heldFromMeta(l.meta), held }));
  }
  for (const [id, x] of olderOut) {
    if (x.base !== null && skip.has(x.base)) continue;
    if (shownIn(id, x.base === null ? null : x.realm, own, shown, x.base ?? undefined)) out.push(unattributed(overviewRef('older\u0000' + id), x.realm, 0, true));
  }
  return out.sort((a, b) => a.at - b.at);
}

/** An older change converted from a record without metadata whose scope names no shared lock: the conversion made its
 *  metadata from the scope (no sender, target or realm), and that base matches no lock's heldChanges. Before its
 *  conversion it was listed unattributed in every lock; it stays so. An older record whose
 *  own metadata had no sender, target or realm on such a base reads the same way, and is listed too (conservative). */
const madeUpMeta = (id: string, l: ChangeLock): boolean => !!l.meta && l.pending && quarantinedDigest(id.slice(id.lastIndexOf('\u0000') + 1))
  && l.meta.by === undefined && l.meta.target === null && l.meta.realm === null && !l.meta.base.startsWith('lock:');

/** One change of a shared lock whose send is out now, or whose outcome is unknown while heldChanges cannot show it
 *  (a record without metadata), as any page sharing the lock sees it. A page holds back what would overlap it; the
 *  row offers nothing to check or dismiss (an unknown outcome is checked or dismissed where its change is held). */
export interface SendingChange {
  /** Its identity (the lockKey value; deep-frozen copy): what the change is about, to show it. */
  readonly identity: unknown;
  readonly target: ChangeTarget | null;
  readonly realm: string | null;
  /** Which declaration sends it (opaque; ChangeMeta.by). */
  readonly by: string | undefined;
  /** The page that sends it, for a link; null when its declaration named none. */
  readonly from: HeldFrom | null;
  /** True for this tab's request while it is out (or this tab's press while admission runs); false for every
   *  other row: another tab's stamp, an older build's record, or a record without metadata whose outcome is unknown. */
  readonly here: boolean;
  /** False when core knows a send is out but not what it is about (an older build's record, whose identity is never
   *  read, or a record stored without its metadata): identity and target are null, and it is listed for every lock
   *  it may belong to (a record with no metadata: every lock and every realm view). A page holds back as for any. */
  readonly attributed: boolean;
}
/** The changes of a shared lock (defineMutation/LiveChange `lock`) whose request is out, this account, so a page
 *  that must not overlap one (a lifecycle press while a save of the same computer is out: another lock, so
 *  admission does not refuse it) holds back. heldChanges() shows a change once it is pending (its answer, or a send
 *  presumed to have gone through); read both. Listed:
 *  - this tab's press, from its admission's start (busy; the reservation may still be refused); once its request
 *    is out, from what admission recorded (localOut), until its answer, whatever became of its registry copy. A
 *    first press of a change has no metadata until admission installs it: until then it is listed unattributed,
 *    in every lock;
 *  - another tab's send, from the storage read that brings its stamp until the read that brings its answer, or the
 *    re-read at the stamp's expiry that shows it held;
 *  - unattributed (SendingChange.attributed): an older build's record until it is converted (live, stale or
 *    pending), and a record without metadata, while it is sent and while its outcome is unknown (heldChanges cannot
 *    show it), until a proof or a warned Dismiss frees it. A converted older record whose metadata names a shared
 *    lock (its own, or made from a `lock:` scope) shows in that lock's heldChanges in the same read that drops it
 *    from here; one with its own metadata on another base shows in neither list (its own sender's heldOfBase). One
 *    without metadata on any other scope stays here, unattributed, while pending (madeUpMeta), until a warned
 *    Dismiss frees it (a converted, quarantined record is never proved).
 *  The registry's copy of this tab's own request (same id and token) is listed once, from the request. Same view filter as
 *  heldChanges (account, `o.realm`), the same re-render (useChangesVersion: notified at the press, after admission,
 *  on each read that changes either list, and at the answer), and deep-frozen copies, never the variables, a key or
 *  a hold. */
export function sendingChanges(lock: string, o?: { realm?: string | null }): SendingChange[] {
  const own = owner(), out: SendingChange[] = [], shown = shownRealm(o), base = lockBase(lock);
  const unattributed = (realm: string | null, here: boolean): SendingChange => Object.freeze({ identity: null, target: null, realm, by: undefined, from: null, here, attributed: false });
  const row = (id: string, m: ChangeMeta | undefined, here: boolean): void => {
    if (!m) { if (shownIn(id, null, own, shown)) out.push(unattributed(null, here)); return; }
    if (m.base !== base || !shownIn(id, m.realm, own, shown, base)) return;
    out.push(Object.freeze({ identity: frozen(m.identity), target: frozen(m.target) as ChangeTarget | null, realm: m.realm, by: senderOf(m), from: heldFromMeta(m), here, attributed: true }));
  };
  const mineSends = new Set<string>();
  for (const [token, { id, meta }] of localOut) { mineSends.add(id + '\u0000' + token); row(id, meta, true); }
  for (const [id, l] of reg) {
    // The registry's copy of a request listed above (same id and request token, e.g. re-adopted pending after an
    // account round trip) is that request, not another row; another token under the same id is another send.
    if (mineSends.has(id + '\u0000' + (tokenOf(l) ?? ''))) continue;
    // Another tab's stamp (live or stale, until the re-read shows it held); this tab's press before its request is
    // out (admission: busy, and its token is not in localOut yet); a record without metadata whose outcome is unknown.
    const pressing = l.busy, madeUp = madeUpMeta(id, l);
    if (l.away === undefined && !pressing && !(l.pending && !l.meta) && !madeUp) continue;
    row(id, madeUp ? undefined : l.meta, pressing);
  }
  for (const [id, x] of olderOut) {
    if ((x.base === null || x.base === base) && shownIn(id, x.base === null ? null : x.realm, own, shown, x.base === null ? undefined : base)) out.push(unattributed(x.realm, false));
  }
  return out;
}

/** Which declaration sent the change whose lock this is (ChangeMeta.by), pending or keeping its key; undefined
 *  when there is no such lock. */
/** An explicit-variable settle, complete or discard of another sender's change: refused, nothing freed. */
export type HeldByOther = { readonly outcome: 'not_sent'; readonly code: 'HELD_BY_OTHER'; readonly heldFrom: HeldFrom | null };
/** HELD_BY_OTHER when the lock of (scope, digest) is recorded as another sender's than `by`, in any state
 *  (pending, being sent, or released keeping its key): only its sender may free it or drop its key. A lock that
 *  records no sender (a stored record from elsewhere) is null here, so a page's warned Dismiss (a warned release) can
 *  always free it; nothing else does: no read-back, settle or complete judges a change it cannot attribute. */
export function heldByOther(scope: string, digest: string, by: string): HeldByOther | null {
  const l = reg.get(idOf(scope, digest));
  const owner = senderOf(l?.meta);
  return l && owner !== undefined && owner !== by ? { outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: heldFromMeta(l.meta) } : null;
}
export function senderOfLock(scope: string, digest: string): string | undefined { return senderOf(reg.get(idOf(scope, digest))?.meta); }
/** True when the lock of (scope, digest) exists and is not `by`'s: another sender's, or one recording no sender
 *  (nobody's to prove: only a warned Dismiss frees it). No lock: false. */
export function foreignLock(scope: string, digest: string, by: string): boolean {
  const l = reg.get(idOf(scope, digest));
  return !!l && senderOf(l.meta) !== by;
}
/** A pending change's identity (its lockKey value, deep-frozen copy; undefined without one): what a read-back's
 *  proves() judges, never the variables. */
export function identityOfLock(scope: string, digest: string): unknown {
  const l = reg.get(idOf(scope, digest));
  return l?.meta ? frozen(l.meta.identity) : undefined;
}

// The sign-out hold predicate: ONE rule. A change is a hold while it is pending ("may
// have gone through") or a send of it is out, here or in another tab. Stored: pending, or any sending stamp (a stale
// one too: adopt reads a send whose tab died as pending). Kept-key records with neither are no holds. The warning
// (changeHoldRefs) and the forget's check (changeHoldRefsIn) both apply it to a clean storage read, so
// what the warning shows is what the forget judges: a hold an 'unknown' forget dropped from memory but storage still
// has is shown again, never left out of the shown set.
const recordIsHold = (r: StoredChange): boolean => r.pending || !!r.sending;
const lockIsHold = (l: ChangeLock): boolean => l.pending || l.busy || awayLive(l);
const recordToken = (r: StoredChange): string => (r.inc === undefined ? '' : r.inc + '#' + (r.nonce ?? ''));
// A change send still out. This tab knows its own sends (sendsOut: the record's own request is still out here,
// whatever the stamp's age: a delayed heartbeat lets it age past SENDING_STALE_MS while the request is still out),
// and a stamp this tab wrote whose request is no longer out here has ended (its
// answer's write may have been refused). Another tab's stamp: live by its age (change-store recordSendOut).
const changeSendOut = (r: StoredChange, now: number): boolean =>
  !!sendsOut.get(r.id)?.has(recordToken(r)) || (r.sending?.tab === changeStoreTab() ? false : recordSendOut(r, now));
/** The holds of `account` among `list` (a clean read), as {record id, hold token}, with `sending: true` on a send
 *  still out at `now` (changeSendOut). The forget keeps exactly the refs flagged `sending` (changes from here,
 *  attempts from AttemptsForget.holdsIn's flag): the shell names what it keeps. */
export function changeHoldRefsIn(list: readonly StoredChange[], account: string, now: number): HoldRef[] {
  if (!account) return [];
  const own = account + '\u0001';
  return list.filter((r) => r.id.startsWith(own) && recordIsHold(r)).map((r) => (changeSendOut(r, now) ? { id: r.id, token: recordToken(r), sending: true as const } : { id: r.id, token: recordToken(r) }));
}
/** The sign-out warning's view of the shown account: changeHoldRefsIn over a clean read made now, plus this tab's own
 *  sends whose record is not stored yet. While storage cannot be read clean, the holds this tab knows (the forget
 *  then answers 'failed' anyway). The shell counts these (with the attempts') and passes the same refs to the forget. */
export function changeHoldRefs(): HoldRef[] {
  let own: string;
  try { own = owner(); } catch { return []; } // no session readable: nothing of an account is held here
  if (own === '\u0001') return [];
  if (own !== loadedFor) loadStored();
  const rd = readChangesState();
  const out: HoldRef[] = rd.state === 'clean' ? changeHoldRefsIn(rd.list, own.slice(0, -1), Date.now()) : [];
  const ids = new Set(out.map((h) => h.id));
  // These are sends out by definition (this tab's busy ones; unclean, also another tab's live one), except a pending
  // lock read while storage is unclean.
  for (const [id, l] of reg) if (id.startsWith(own) && !ids.has(id) && (rd.state !== 'clean' ? lockIsHold(l) : l.busy)) out.push(l.busy || awayLive(l) ? { id, token: tokenOf(l) ?? '', sending: true } : { id, token: tokenOf(l) ?? '' });
  return out;
}

/** The forget's verdict: 'done', storage holds none of the account's records but requests still out, changes' and
 *  attempts' (read back clean) or, without Web Locks, none of its holds. Those requests (the refs flagged `sending`)
 *  stay stored and keep refusing a second send until their answers settle them: the shell says so in the warning,
 *  since 'done' signs out; 'changed', the account holds something the warning did not show (or shows a send out that
 *  the warning showed as not sending),
 *  so nothing was deleted and the shell shows the warning again (from a fresh clean read); 'failed', nothing was
 *  forgotten (storage refused, unreadable, or a removal that could not be proven was rolled back and read back
 *  whole): storage and memory keep every hold; 'unknown', the removal may have landed and the rollback was refused or
 *  could not be read back: this tab drops the shown holds it removed from memory (the person confirmed a warned forget of
 *  exactly them), storage stays the authority (admission reads it under the lock) and whatever it still holds is
 *  shown again at the next clean read. Only 'done' may sign out (lifecycle.ts). */
export type ForgetVerdict = 'done' | 'changed' | 'failed' | 'unknown';
export type { HoldRef } from './change-store';
/** The attempts side of the forget, passed in by the caller (lifecycle.ts signOutForgetting) so changes.ts does not
 *  depend on attempts.ts: `holdsIn`, the account's stored attempt holds (attempts.ts attemptHoldRefsIn), judged in the
 *  forget's own lock turn; `drop`, this tab's memory and beats of exactly the given attempt ids, never storage;
 *  `keeps`, the stored attempt records the forget never removes (attempts.ts attemptKept: the host's kept locks, which
 *  `holdsIn` leaves out too). */
export interface AttemptsForget {
  holdsIn(list: readonly StoredChange[], account: string, now: number): readonly HoldRef[];
  drop(account: string, ids: readonly string[]): void;
  keeps?(r: StoredChange): boolean;
}

/** Sign-out, after the person's warned confirm (through
 *  lifecycle.ts signOutForgetting): `shown` is exactly the hold set the warning counted (changeHoldRefs() plus the
 *  attempts'). In one store-lock turn over a clean read:
 *  - when `account` holds a change or attempt (the shared predicates, by id + token, never the store version) that
 *    is not in `shown`, or a send out now that `shown` listed without `sending` (another tab's stale stamp renewed
 *    since: the person was not told it stays), nothing is written: 'changed'. So a hold admitted after the warning, a
 *    busy send among it, keeps its stored record and refuses a second send in every tab.
 *  - otherwise every stored record of the account (its changes and attempts, holds and kept keys) is removed and read
 *    back (see ForgetVerdict), except a request still out, change or attempt (the held refs flagged
 *    `sending`, the same flag the warning shows): its record stays until its answer settles it, so a fresh tab, a
 *    reload or an account round trip never admits it again. A stale stamp of a send no tab here runs (its tab died, or
 *    its heartbeat stalled) is a shown hold like a pending one and goes; a late answer of that send then writes
 *    nothing back (persist). An attempt record `attempts.keeps` names stays too, never shown and never removed.
 *  - on 'done' and 'unknown' this tab drops from memory only the removed records and the shown holds it removed,
 *    never a busy lock, a kept request or another hold of the account; the attempts side drops the removed shown
 *    attempt ids only.
 *  Other accounts' records stay; extra refs in `shown` are a no-op. Without Web Locks nothing is written: 'done' only
 *  when a clean read finds no hold of the account (admission refuses without locks, so none can appear), else
 *  'failed'. Nothing is ever written back later.
 *  `out.removedShown` (when given): how many of the shown holds this turn's removal took out of storage, decided under
 *  the lock; set once that removal may have landed, else left at 0. A shown send still out is kept, so not counted: the
 *  sign-out says the person's changes may be forgotten only when one was (lifecycle.ts). */
export async function forgetAccountChanges(account: string, shown: readonly HoldRef[], attempts: AttemptsForget, out?: { removedShown: number }): Promise<ForgetVerdict> {
  if (typeof account !== 'string' || account === '') return 'failed';
  const own = account + '\u0001';
  const att = ATTEMPT_PREFIX + own;
  const mine = (id: string): boolean => id.startsWith(own) || id.startsWith(att);
  const shownSet = new Set(shown.map((h) => h.id + '\u0000' + h.token));
  const shownSending = new Set(shown.filter((h) => h.sending === true).map((h) => h.id + '\u0000' + h.token));
  const shownAttempts = [...new Set(shown.filter((h) => h.id.startsWith(att)).map((h) => h.id))];
  // The account's holds in `list` (both stores); null when the attempts predicate throws: no verdict.
  const heldIn = (list: readonly StoredChange[], now: number): readonly HoldRef[] | null => {
    try { return [...changeHoldRefsIn(list, account, now), ...attempts.holdsIn(list, account, now)]; } catch { return null; }
  };
  if (!changeStoreCoordinated()) {
    const rd = readChangesState();
    if (rd.state !== 'clean') return 'failed';
    const held = heldIn(rd.list, Date.now());
    return held !== null && held.length === 0 ? 'done' : 'failed';
  }
  // This tab's copy of exactly the forgotten holds leaves memory: the removed records and the shown refs. A send still
  // out keeps its lock (its answer persists); any other lock of the account stays.
  const dropMemory = (ids: ReadonlySet<string>): void => {
    let any = false;
    for (const [id, l] of [...reg]) if (ids.has(id) && !l.busy) { reg.delete(id); tombs.delete(id); any = true; }
    for (const id of [...tombs.keys()]) if (ids.has(id)) tombs.delete(id);
    // The shown attempts the forget removed (a kept request is not among `ids`).
    try { attempts.drop(account, shownAttempts.filter((id) => ids.has(id))); } catch { /* memory only: storage stays the authority */ }
    if (any) changed();
  };
  // Set once a removal may have landed: an exception after that point leaves no verdict ('unknown'), never 'failed'.
  const removing: { ids: ReadonlySet<string> | null } = { ids: null };
  const run = (): ForgetVerdict => {
    const rd = readChangesState();
    if (rd.state !== 'clean') return 'failed';
    const now = Date.now();
    const held = heldIn(rd.list, now);
    if (held === null) return 'failed';
    if (held.some((h) => !shownSet.has(h.id + '\u0000' + h.token))) return 'changed';
    // A hold the warning showed as not sending that is a send out now (another tab's stale stamp renewed by its
    // heartbeat: same id and token) was never shown as one: the person was not told it stays, so this is another
    // view ('changed'). The reverse (a send shown that has ended or gone stale since) is the shown hold.
    if (held.some((h) => h.sending === true && !shownSending.has(h.id + '\u0000' + h.token))) return 'changed';
    // A request still out keeps its record and this tab's copy of it: its answer settles it, and a fresh tab, a reload
    // or an account round trip reads it and refuses a second send. ONE rule for both prefixes: the held refs flagged
    // `sending` (changes: changeSendOut; attempts: the injected holdsIn's flag, attempts.ts attemptHoldRefsIn).
    const keep = new Set(held.filter((h) => h.sending === true).map((h) => h.id));
    // The host's kept attempt records (attempts.keeps) stay as they are: the warning never listed them.
    try { for (const x of rd.list) if (x.id.startsWith(att) && attempts.keeps?.(x) === true) keep.add(x.id); } catch { return 'failed'; }
    const gone = rd.list.filter((x) => mine(x.id) && !keep.has(x.id));
    const rest = rd.list.filter((x) => !mine(x.id) || keep.has(x.id));
    const dropIds = new Set([...gone.map((x) => x.id), ...shown.map((h) => h.id)].filter((id) => !keep.has(id)));
    if (gone.length) {
      // A write that throws (an installed adapter) may have landed: like an unproven one, it is read back.
      let wrote: boolean;
      try { wrote = writeChanges(rest); } catch { wrote = true; }
      if (!wrote) return 'failed';
      removing.ids = dropIds;
      if (out) { const ids = new Set(shown.map((h) => h.id)); out.removedShown = gone.filter((x) => ids.has(x.id)).length; }
      const back = readChangesState();
      if (back.state !== 'clean' || back.list.some((x) => mine(x.id) && !keep.has(x.id))) {
        // The removal may have landed but is unproven. Under this same lock nobody wrote since the clean read, so
        // the exact prior records go back: rd.list, read after this turn's conversion (underChangeStore), so its
        // ids are the stored ones and no write converts them again. Read back with all
        // of them, nothing was forgotten ('failed', memory untouched). A refused or unproven rollback leaves no
        // verdict: 'unknown'.
        const has = (list: readonly StoredChange[]): boolean => gone.every((g) => list.some((x) => x.id === g.id && x.t === g.t));
        let rolled = false;
        try { rolled = writeChanges(rd.list); } catch { rolled = false; } // a throwing rollback proves nothing
        if (rolled) {
          const again = readChangesState();
          if (again.state === 'clean' && has(again.list)) return 'failed';
        }
        dropMemory(dropIds);
        return 'unknown';
      }
    }
    // Storage holds none of them (read back clean, under the store lock): only now does this tab drop its copy.
    dropMemory(dropIds);
    return 'done';
  };
  try { return await underChangeStoreLocked(run); } catch {
    const ids = removing.ids;
    if (ids === null) return 'failed';
    try { dropMemory(ids); } catch { /* memory only */ }
    return 'unknown';
  }
}

/** How many of this account's changes are unresolved: changeHoldRefs().length (pending or being sent, here or in
 *  another tab). The shell's sign-out asks first while this (or an unresolved attempt) is not 0. */
export function unresolvedChanges(): number {
  return changeHoldRefs().length;
}

/** True while a send of some change of the scope (one digest, or any) is in flight. With `compat`, also one filed
 *  the other way. */
export function isBusy(scope: string, digest?: string, compat?: Compat): boolean {
  for (const [id, l] of reg) if (inScope(id, scope) && (digest === undefined || id === idOf(scope, digest)) && (l.busy || awayLive(l))) return true;
  return !!compat && compatLocks(scope, digest, compat).some(([, l]) => l.busy || awayLive(l));
}

/** For useSyncExternalStore. */
export function subscribeChanges(fn: () => void): () => void {
  return listeners.add(fn);
}
export const changesVersion = (): number => version;
/** Re-renders when a C9 lock moves (a change went pending, was released or discarded, or a bump dropped them). */
export function useChangesVersion(): number { return useSyncExternalStore(subscribeChanges, changesVersion, changesVersion); }

/** The registry, tombstones and sends-out forgotten, the stale re-read timer and the sending heartbeats stopped (session
 *  disposal, dispose.ts; tests). */
export function resetChanges(): void {
  resets++;
  for (const b of beats) clearInterval(b);
  beats.clear();
  if (staleTimer) { clearTimeout(staleTimer); staleTimer = null; }
  reg.clear(); tombs.clear(); clearSendsOut(); seq = 0; changed();
}
/** Tests only: how a lock base is filed: declared across realms (declareAcrossRealms) and/or naming its own realm
 *  (declareExplicitRealm). Reads the two declaration sets, never changes them. */
export function lockFilingForTests(base: string): { across: boolean; explicit: boolean } { return { across: acrossBases.has(base), explicit: explicitBases.has(base) }; }
/** Tests only: a fresh tab knows no request of an earlier test as still out (its answer may never come). */
export function forgetSendsOutForTests(): void { clearSendsOut(); }
/** Tests only: a reload (or another tab) from here on: memory dropped, a new tab id, the stored records loaded. */
export function reloadChangesForTests(): void { reg.clear(); tombs.clear(); clearSendsOut(); newChangeStoreTabForTests(); loadStored(); changed(); }
