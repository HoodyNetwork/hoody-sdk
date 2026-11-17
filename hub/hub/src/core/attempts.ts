// attempts.ts: a hold for a send that carries no idempotency key (a create, a copy, a share), kept in core's
// change store (change-store.ts), so it survives a reload and every tab of the account sees it.
//
// Contract, in plain words:
//   - A send that cannot be read back by a key is held BEFORE it leaves: holdAttempt(lock, ...) admits it under the
//     store's cross-tab lock and refuses while any tab of the account holds the same lock (HELD), so the same
//     change is never sent twice while its outcome is unknown (C9).
//   - Only a durable hold is admitted: the record is written (marked `admitting`), read back alone under its lock,
//     then confirmed (the mark removed) and read back again. Storage that cannot be read or written, or a write
//     that does not read back, refuses (NOT_DURABLE); another hold of the lock found on read-back refuses HELD.
//     Every refusal says not sent, so the caller sends nothing. Without the cross-tab lock (no navigator.locks, or
//     a request that throws) nothing is admitted (NOT_DURABLE): uncoordinated, a tab writing a stale snapshot could
//     verify its own record after another tab's hold was admitted and sent, so read-backs alone cannot stop a
//     double send.
//   - A refused admission steps back by removing only its own record (its id, which carries its incarnation), over
//     a fresh clean read; never over a corrupt store. When storage cannot be read at all, it writes back the list it
//     wrote itself without its record: every writer holds the store lock, so nothing else was written since. When
//     that removal cannot be done, the cleanup is owed: this tab ignores the record and removes it on its next clean
//     write, and a record still marked `admitting` past ADMIT_STALE_MS is known unsent, so every tab (after a reload
//     too) ignores it and its next write removes it; subscribers are told when that time comes. A confirm write
//     that landed but could not be read back, whose removal also failed, is the one case left held after a reload
//     (three storage failures in a row); its sender's warned Dismiss frees it.
//   - Each hold has its own incarnation (part of its id, never reused) and an idempotency key minted at admission,
//     for a send that can carry one.
//   - The hold names its sender (`by`, e.g. 'keys:create') and carries the sender's plain metadata (never a
//     secret: it is stored as is). heldAttempts(lock) lists the account's holds for every page; only the sender
//     frees one: through its handle, or attemptFor(id, by) after a reload.
//   - While the request is out the hold is stamped as sending and the stamp is renewed every SENDING_HEARTBEAT_MS;
//     sent() ends the stamp (an answer came, even an unknown one). A stamp older than SENDING_STALE_MS belongs to a
//     tab that died mid-send: the hold stays (may have gone through), only `inFlight` turns false (this tab's own send
//     stays in flight until its answer, whatever its stamp's age).
//   - Freed only by release() (a known answer, or a fresh read that proves it) or the person's warned
//     dismiss(true), or by free(kind), which answers its outcome. Never by closing, a reload, a realm switch or an
//     account round trip. At most MAX_ATTEMPTS per account (FULL past it); the store never pushes one out.
//   - A handle belongs to the account shown when it was built and to its sender. Its free(kind) and
//     update(meta, expectVersion) decide inside the store lock, on the record read there: nothing is written when
//     another account is shown by then, or the record is gone or names another sender. The
//     meta has its own version (`metaVersion`, 0 at admission) that only update() bumps, so of two updates from one
//     version exactly one lands; heartbeats and sent() rewrite `t`, never that version. free(kind, { metaVersion })
//     removes only the state the caller checked (that version) and never a hold whose request is out (C9).
//   - Sign-out: only the warned sign-out removes stored holds, and only the ones the
//     person was shown. The shell's warning lists signOutHolds() (lifecycle.ts: change holds plus attemptHoldRefs());
//     signOutForgetting(account, shown) removes the account's records under the store lock only when every hold
//     stored then (attemptHoldRefsIn: stored truth, a hold being freed included) is in `shown`; otherwise it
//     removes nothing and answers 'changed'. A send still out (attemptSendOut: a live stamp; the ref is flagged
//     `sending`) keeps its stored record and this tab's copy and beat, shown or not, so no tab sends
//     it again while its outcome is unknown and its answer still settles it; dropAttemptIds drops only the shown
//     holds the forget removed. The auth purge (onAuthPurge, realm.ts), reason 'signout' included,
//     never removes a stored hold: an explicit sign-out only drops this tab's copy and beats of the leaving
//     account's holds whose sends are not still out (a send still out keeps both until its answer).
//     So a hold another tab admits after the warning, and every purge-failed Try again, keep their
//     holds; anything left behind is kept as at expiry, filed under its account. Every other purge and every
//     account bump keeps this tab's copy too. The shared purge keeps hub.v3.changes (purge: false; only Forget
//     this browser removes the key).
//   - Kept holds: a host may name locks whose holds no sign-out forget drops (setKeptAttemptLocks; the terminal's
//     boot-token mints, the only trace of a token that may exist; none on the web). Such a hold is left out of the
//     warning (attemptHoldRefs, attemptHoldRefsIn) and its stored record stays through the forget (attemptKept,
//     changes.ts AttemptsForget.keeps). It is still a hold everywhere else: it refuses its lock, pages list it
//     (heldAttempts), and only its sender frees it.
import { useSyncExternalStore } from 'react';
import { capture, loggingOut, onBump, subscribe as onCore } from './ctx';
import {
  SENDING_HEARTBEAT_MS, SENDING_STALE_MS, changeStoreCoordinated, changeStoreTab, nextVersion, readChangesState, recordSendOut, sendingLive, subscribeChangeStore,
  underChangeStore, writeChanges, ATTEMPT_PREFIX, MAX_ATTEMPT_RECORD, type HoldRef, type StoredChange,
} from './change-store';
import { newKey } from './kit';
import type { Tri } from './kit-io';
import { accountEnded, onAuthPurge } from './realm';
import type { AuthPurgeInfo } from './session';

export interface HeldAttempt {
  readonly id: string;
  /** This hold's own incarnation: a later hold of the same lock has another. */
  readonly incarnation: string;
  readonly lock: string;
  /** The sender that holds it; only it may free it. */
  readonly by: string;
  /** The idempotency key minted at admission (for a send that can carry one). */
  readonly key: string;
  /** When the send began (this client's clock). */
  readonly startedAt: number;
  readonly realm: string | null;
  readonly identity: unknown;
  /** The sender's metadata, as given (plain data, never a secret). */
  readonly meta: unknown;
  /** The meta's version: 0 at admission, one more at each update() that landed. */
  readonly metaVersion: number;
  /** The request is still out (sendOutWhere), and where: 'here' (this tab's own send not answered yet), 'elsewhere'
   *  (another tab's live stamp), or false. While it is out no read may settle it. */
  readonly inFlight: 'here' | 'elsewhere' | false;
  /** Always true: only a hold that was written and read back is admitted. */
  readonly persisted: boolean;
}
export interface AttemptHold {
  readonly id: string;
  readonly incarnation: string;
  readonly key: string;
  /** The request was answered (whatever the answer): the sending stamp ends, the hold stays. */
  sent(): void;
  /** A known answer, or a fresh read that proves the outcome: the hold is freed. */
  release(): void;
  /** The person's warned Dismiss (it may have gone through): the hold is freed. */
  dismiss(confirmed: true): boolean;
  /**
   * Frees the hold the caller checked and answers what happened. Inside the store lock the record is removed only
   * while the account this handle was built under is still shown, the stored record still names this sender, its
   * meta version is still `expect.metaVersion` (the state the caller checked or the person was shown: a later update,
   * another runtime's dispatch included, refuses), and no request of it is out (this tab's own send not yet
   * answered by sent(), or any live sending stamp, this tab's own included). Otherwise nothing is written ('refused').
   * 'freed': the record is gone (removed now, or already absent from a clean read). 'unresolved': storage did not
   * read clean, refused the write, or the store lock could not be had, so the stored copy stays held. `kind` says
   * why (a known answer, a proof, the person's Dismiss) for diagnostics; the removal is the same. A call while one
   * is queued answers that one; after 'refused' or 'unresolved' a later call tries again.
   */
  free(kind: AttemptFreeKind, expect: AttemptExpect): Promise<AttemptFree>;
  /**
   * Replaces the sender's metadata when its stored version is still `expectVersion` (a compare-and-set inside the
   * store lock) and writes it at expectVersion + 1. False, nothing written: another version is stored, the record
   * is gone, another account is shown or the account is going (signing out), the stored record names another
   * sender, the record would not fit (MAX_ATTEMPT_RECORD, the admission's bound), this handle freed it or a free of
   * it is queued, or storage did not read clean or refused the write. These are read inside the store lock, so a
   * release() or free() called while the update waits refuses it. `meta` is stored as is: plain data, never a
   * secret. `sending: true` also stamps this tab as sending and (re)starts its beat, for a flow that sends again
   * after an earlier sent(); it is refused when this tab no longer keeps a copy of the hold (the sign-out purge
   * dropped it). A sent() called while the update waits ends that beat again.
   */
  update(meta: unknown, expectVersion: number, opts?: { readonly sending?: boolean }): Promise<boolean>;
}
export type AttemptFree = 'freed' | 'refused' | 'unresolved';
export type AttemptFreeKind = 'done' | 'proved' | 'dismissed';
/** The state a free removes: the meta version the caller checked or the person was shown. */
export type AttemptExpect = { readonly metaVersion: number };
export type HoldCode = 'HELD' | 'NO_ACCOUNT' | 'TOO_LARGE' | 'FULL' | 'NOT_DURABLE';
export type HoldResult =
  | { ok: true; hold: AttemptHold }
  /** Nothing was held and nothing may be sent. HELD: the lock is held (by this sender or another; `held` says
   *  which). NO_ACCOUNT: no account shown, or it is going. TOO_LARGE: the metadata does not fit a record. FULL:
   *  the account holds MAX_ATTEMPTS. NOT_DURABLE: the hold could not be stored and read back. */
  | { ok: false; code: HoldCode; notSent: true; held?: HeldAttempt };

const LOCK_RE = /^[A-Za-z0-9_.:@/-]{1,200}$/;
const BY_RE = /^[A-Za-z0-9_.:@/-]{1,128}$/;
export const MAX_ATTEMPTS = 64;
/** An admission verifies at once (one synchronous step under the store lock); a record still marked `admitting`
 *  after this long was never admitted, so never sent. */
export const ADMIT_STALE_MS = 10_000;

// The account this page last showed: the one a sign-out bump is leaving (the context may already name none).
let lastAccount: string | null = null;
/** This tab's copy of the holds it admitted or read (each verified stored once), by id. */
const mem = new Map<string, StoredChange>();
const beats = new Map<string, ReturnType<typeof setInterval>>();
/** Refused admissions of this tab whose own record may still be stored (its removal failed): never held, removed on
 *  this tab's next clean write. A reload forgets the set; the record's `admitting` mark then ages out instead. */
const owed = new Set<string>();
/** Holds this tab's sender freed whose stored record is being removed (under the store lock, so never at once):
 *  hidden here meanwhile, so a freed hold does not show again for a moment. When the removal is refused (no lock,
 *  storage refused) the id leaves this set and the stored hold shows again: never freed by accident. */
const freeing = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
function changed(): void { version++; for (const l of [...listeners]) { try { l(); } catch { /* a listener's own */ } } }

const accountGoing = (): boolean => { try { return loggingOut() || accountEnded(); } catch { return true; } };
function account(): string | null {
  try { const a = capture().account; return a != null && String(a) !== '' ? String(a) : null; } catch { return null; }
}
const prefixOf = (acct: string): string => ATTEMPT_PREFIX + acct + '\u0001';
const newIncarnation = (): string => {
  try { const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
  catch { return (Math.random().toString(16).slice(2) + Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 32).padEnd(32, '0'); }
};
const isAttempt = (r: StoredChange): boolean => r.id.startsWith(ATTEMPT_PREFIX);
const lockOf = (r: StoredChange): string => (r.meta ? r.meta.base : '');
/** The host's kept locks (setKeptAttemptLocks): none until a host names some. */
let keptLock: (lock: string) => boolean = () => false;
/** Names the locks whose holds no sign-out forget drops (see the contract); null: none again. Only the terminal's live
 *  wiring calls it (term/app/live-wire.ts install and dispose). */
export function setKeptAttemptLocks(test: ((lock: string) => boolean) | null): void { keptLock = test ?? (() => false); }
/** A stored attempt record that the sign-out keeps: its lock is one the host named. A test that throws keeps it (a
 *  kept record is never sent again; a dropped one may hide a token). */
export function attemptKept(r: StoredChange): boolean {
  if (!isAttempt(r)) return false;
  try { return keptLock(lockOf(r)) === true; } catch { return true; }
}
const incarnationOf = (id: string): string => id.slice(id.lastIndexOf('\u0000') + 1);
/** A stored attempt record that never became a hold: a refused admission whose cleanup is owed. */
const unsent = (r: StoredChange, now: number): boolean => owed.has(r.id) || (r.admitting !== undefined && now - r.admitting >= ADMIT_STALE_MS);
/** The account's holds in a stored list. `shown`: as this tab shows them (its own frees in progress hidden); an
 *  admission judges the stored truth (shown false), so a hold whose removal is still queued still holds its lock. */
const ofAccount = (list: readonly StoredChange[], acct: string, now: number = Date.now(), shown = true): StoredChange[] =>
  list.filter((r) => isAttempt(r) && r.id.startsWith(prefixOf(acct)) && !unsent(r, now) && !(shown && freeing.has(r.id)));

/** Where a request of the hold is out: 'here' while this tab's own send is unanswered (its beat runs: holdAttempt or
 *  update(sending) starts it; sent(), a free, the forget's drop of a removed hold or its record leaving storage ends
 *  it; the sign-out purge keeps it), whatever its stamp's age (a throttled background tab can miss beats past
 *  SENDING_STALE_MS); 'elsewhere' for another tab's live sending stamp (change-store.ts recordSendOut);
 *  otherwise false. A stamp this tab wrote whose beat has ended is no send out: its answer came (its sent() write was
 *  refused), or its hold was freed or removed (as changeSendOut reads this tab's own stamps). Another
 *  tab's stale stamp (its tab died mid-send) is a pending hold. */
const sendOutWhere = (r: StoredChange, now: number): HeldAttempt['inFlight'] =>
  (beats.has(r.id) ? 'here' : r.sending?.tab !== changeStoreTab() && recordSendOut(r, now) ? 'elsewhere' : false);

/** ONE rule (sendOutWhere) for the sign-out warning's HoldRef.sending flag and, through it, the forget's keep
 *  (changes.ts keeps exactly the refs flagged `sending`), and for HeldAttempt.inFlight: a send still out keeps its
 *  stored record and this tab's copy, shown or not. */
const attemptSendOut = (r: StoredChange, now: number): boolean => sendOutWhere(r, now) !== false;

function view(r: StoredChange): HeldAttempt {
  return {
    id: r.id, incarnation: incarnationOf(r.id), lock: lockOf(r), by: r.meta?.by ?? '', key: r.key ?? '', startedAt: r.at ?? 0,
    realm: r.meta?.realm ?? null, identity: r.meta?.identity ?? null, meta: r.attempt ?? null, metaVersion: r.metaVersion ?? 0, inFlight: sendOutWhere(r, Date.now()), persisted: true,
  };
}

// A stamp turns stale by time alone: one timer wakes the subscribers when the next one does.
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let staleAt = Infinity;
function stopStaleWatch(): void { if (staleTimer) clearTimeout(staleTimer); staleTimer = null; staleAt = Infinity; }
function watchStale(list: readonly StoredChange[]): void {
  const now = Date.now();
  let next = Infinity;
  for (const r of list) {
    if (r.sending && sendingLive(r.sending, now)) next = Math.min(next, r.sending.at + SENDING_STALE_MS);
    // A record still marked `admitting` turns unsent at ADMIT_STALE_MS: its readers are told then too.
    if (r.admitting !== undefined && now - r.admitting < ADMIT_STALE_MS) next = Math.min(next, r.admitting + ADMIT_STALE_MS);
  }
  if (next === Infinity || next >= staleAt) return;
  if (staleTimer) clearTimeout(staleTimer);
  staleAt = next;
  staleTimer = setTimeout(() => { staleTimer = null; staleAt = Infinity; changed(); }, Math.max(0, next - now) + 50);
}

/** The store's list only when it read clean: the one list a write may go over, and the only one where an absent
 *  record proves it was freed (a corrupt store's unreadable records may be holds). */
function readClean(): StoredChange[] | null {
  const rd = readChangesState();
  return rd.state === 'clean' ? rd.list : null;
}

/** The account's holds as stored (a clean read decides); while storage cannot be read, the ones this tab knows, and
 *  while it is corrupt, the readable ones plus the ones this tab knows (an absent one frees nothing there). This
 *  tab's copy and beats follow the stored truth, a hold whose free is still queued included (its free may yet be
 *  refused, and its request may still be out); this tab's frees in progress are hidden only from the list returned. */
function current(acct: string): StoredChange[] {
  lastAccount = acct;
  const pre = prefixOf(acct);
  const rd = readChangesState();
  if (rd.state === 'unreadable') return [...mem.values()].filter((r) => r.id.startsWith(pre) && !freeing.has(r.id));
  const now = Date.now();
  if (rd.state === 'clean' && rd.list.some((r) => isAttempt(r) && unsent(r, now))) settleOwed();
  const all = ofAccount(rd.list, acct, now, false);
  const seen = new Set(all.map((r) => r.id));
  for (const r of all) mem.set(r.id, r);
  if (rd.state === 'clean') {
    // Gone from a clean store: freed by its sender in another tab.
    for (const id of [...mem.keys()]) if (id.startsWith(pre) && !seen.has(id)) { mem.delete(id); stopBeat(id); }
  } else {
    for (const [id, r] of mem) if (id.startsWith(pre) && !seen.has(id)) all.push(r);
  }
  watchStale(all);
  return all.filter((r) => !freeing.has(r.id)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

/** The shown account's holds, of one lock or all; every page sees them (read-only unless it is the sender). */
export function heldAttempts(lock?: string): HeldAttempt[] {
  const acct = account();
  if (!acct) return [];
  return current(acct).filter((r) => lock === undefined || lockOf(r) === lock).map(view);
}

/** One hold as the sign-out names it (change-store.ts HoldRef): the attempt record's id, its incarnation as the
 *  token (the id carries it; never reused), and `sending: true` on a send still out (attemptSendOut). */
const refOf = (r: StoredChange, now: number): HoldRef =>
  (attemptSendOut(r, now) ? { id: r.id, token: incarnationOf(r.id), sending: true } : { id: r.id, token: incarnationOf(r.id) });
/** The sign-out's hold test over a stored list (stored truth, read under the store lock): the account's attempt
 *  holds, a hold whose removal is still queued (being freed) and a fresh `admitting` one included. A record that
 *  never became a hold (owed, or `admitting` past ADMIT_STALE_MS) is not one. The same test as the warning's
 *  attemptHoldRefs(), which hides only this tab's frees in progress (a hold missing from `shown` for that reason
 *  answers 'changed', and the next warning no longer lists it once its removal lands; a refused removal shows it
 *  again). A kept hold (attemptKept) is not listed: the forget keeps it. */
export function attemptHoldRefsIn(list: readonly StoredChange[], acct: string, now: number = Date.now()): HoldRef[] {
  return ofAccount(list, acct, now, false).filter((r) => !attemptKept(r)).map((r) => refOf(r, now));
}
/** The shown account's attempt holds as the warning lists them (heldAttempts(), by id and token). It reads storage
 *  at every call: a hold dropped from this tab's memory by an 'unknown' forget but still stored
 *  is listed again, so the next confirmed forget deletes it; no carry-over set is kept. Storage that cannot be read
 *  lists what this tab knows (a corrupt store: its readable holds plus those); the forget then refuses anyway. A kept
 *  hold (attemptKept) is not listed, as in attemptHoldRefsIn. */
export function attemptHoldRefs(): HoldRef[] {
  const acct = account();
  if (!acct) return [];
  const now = Date.now();
  return current(acct).filter((r) => !attemptKept(r)).map((r) => refOf(r, now));
}

/** Every account's stored attempt holds in this browser (all accounts, not only the shown one). No auth purge
 *  removes them (they are kept, filed under their account); only Forget this browser removes the whole key.
 *  Unreadable storage counts what this tab knows. */
export function heldAttemptsAnyAccount(): number {
  const rd = readChangesState();
  if (rd.state === 'unreadable') return mem.size;
  const now = Date.now();
  const ids = new Set(rd.list.filter((r) => isAttempt(r) && !unsent(r, now) && !freeing.has(r.id)).map((r) => r.id));
  if (rd.state !== 'clean') for (const id of mem.keys()) ids.add(id);
  return ids.size;
}

/** A clean read with every owed record left out: whatever is written from it settles those cleanups. */
function readSettling(): { list: StoredChange[]; owes: string[] } | null {
  const list = readClean();
  if (!list) return null;
  const now = Date.now();
  const owes = list.filter((r) => isAttempt(r) && unsent(r, now)).map((r) => r.id);
  return { list: owes.length ? list.filter((r) => !owes.includes(r.id)) : list, owes };
}
function settled(owes: readonly string[]): void { for (const id of owes) owed.delete(id); }

/** One read-modify-write under the store lock: fn gets the stored list (null: not a clean read; owed records left
 *  out, so the write settles them) and returns the list to write (or null: write nothing) and its answer; `wrote`
 *  says whether the write was stored. */
function rmw<T>(fn: (list: StoredChange[] | null) => { list: StoredChange[] | null; out: (wrote: boolean) => T }): Promise<T> {
  return Promise.resolve(underChangeStore(() => {
    const rd = readSettling();
    const r = fn(rd ? rd.list : null);
    const wrote = r.list ? writeChanges(r.list) : false;
    if (wrote && rd) settled(rd.owes);
    return r.out(wrote);
  }));
}
/** Removes owed records (a clean read and write); kept owed while storage refuses. Subscribers are told only when
 *  the write was stored: a refused one changes nothing they could read (and telling them would re-read and retry
 *  at once, over and over). */
let settling = false;
function settleOwed(): void {
  if (settling) return;
  settling = true;
  void rmw((list) => ({ list, out: (wrote: boolean) => wrote }))
    .then((wrote) => { settling = false; if (wrote) changed(); }, () => { settling = false; });
}
/** A refused admission steps back: only its own record, over a fresh clean read. When storage cannot be read at
 *  all, over `known`: the list this admission itself wrote under the store lock, which no other writer can have
 *  changed since (every writer holds that lock). Never over a corrupt store. False: it may still be stored (corrupt,
 *  unreadable with nothing known, or the write refused), so its cleanup is owed. */
function stepBack(id: string, known: readonly StoredChange[] | null): boolean {
  const rd = readChangesState();
  const list = rd.state === 'clean' ? rd.list : rd.state === 'unreadable' ? known : null;
  if (list && !list.some((r) => r.id === id)) return true;
  if (list && writeChanges(list.filter((r) => r.id !== id))) return true;
  owed.add(id);
  return false;
}
const none = <T>(v: T) => ({ list: null, out: () => v });

function stopBeat(id: string): void { const b = beats.get(id); if (b) clearInterval(b); beats.delete(id); }
function restamp(id: string): void {
  void rmw((list) => {
    const r = list?.find((x) => x.id === id);
    // Freed meanwhile, another tab's stamp, or storage unreadable: the beat ends (a missed beat only ages the stamp).
    if (!list || !r || !r.sending || r.sending.tab !== changeStoreTab()) { if (list) stopBeat(id); return none(undefined); }
    const next: StoredChange = { ...r, sending: { tab: changeStoreTab(), at: Date.now() }, t: nextVersion(list) };
    // A copy this tab dropped meanwhile (a free, a forget's drop) is not put back; storage stays the authority.
    return { list: list.map((x) => (x.id === id ? next : x)), out: (wrote: boolean) => { if (wrote && mem.has(id)) mem.set(id, next); } };
  }).then(null, () => { /* the next beat tries again */ });
}

function handle(r: StoredChange, acct: string): AttemptHold {
  const id = r.id;
  const by = r.meta?.by ?? '';
  let freed = false;
  let removal: Promise<AttemptFree> | null = null;
  /** Read inside the store lock: the account this handle was built under is still shown and the record still names
   *  this sender. */
  const owns = (x: StoredChange | undefined): x is StoredChange => account() === acct && !!x && x.meta?.by === by;
  const free = (): void => {
    if (freed) return;
    freed = true;
    stopBeat(id);
    mem.delete(id);
    freeing.add(id);
    changed();
    // A removal storage refuses leaves the stored copy held (it shows again on the next read): never freed by accident.
    const done = (): void => { freeing.delete(id); changed(); };
    void rmw((list) => {
      // An update queued before this free may have (re)started the beat meanwhile, and a view read while it waited
      // put this tab's copy back (reads keep copies of the stored truth).
      stopBeat(id);
      mem.delete(id);
      return list && list.some((x) => x.id === id) ? { list: list.filter((x) => x.id !== id), out: () => undefined } : none(undefined);
    }).then(done, done);
  };
  return Object.freeze({
    id, incarnation: incarnationOf(id), key: r.key ?? '',
    sent() {
      stopBeat(id);
      void rmw((list) => {
        // An update queued before this answer may have (re)started the beat meanwhile.
        stopBeat(id);
        const x = list?.find((y) => y.id === id);
        if (!list || !x || !x.sending || x.sending.tab !== changeStoreTab()) return none(undefined);
        const { sending: _s, ...rest } = x;
        const next: StoredChange = { ...rest, t: nextVersion(list) };
        // A copy the sign-out purge dropped meanwhile is not put back.
        return { list: list.map((y) => (y.id === id ? next : y)), out: (wrote: boolean) => { if (wrote && mem.has(id)) mem.set(id, next); } };
      }).then(() => changed(), () => { /* the stamp ages out */ });
    },
    release() { free(); },
    dismiss(confirmed: true) { if (confirmed !== true) return false; free(); return true; },
    free(_kind: AttemptFreeKind, expect: AttemptExpect): Promise<AttemptFree> {
      if (removal) return removal;
      // Hidden while queued. This tab's copy and beat go only once the removal landed: a refused one keeps a send
      // still out flagged here and its stamp fresh.
      freeing.add(id);
      changed();
      const settle = (out: AttemptFree): AttemptFree => {
        freeing.delete(id);
        if (out === 'freed') { freed = true; stopBeat(id); mem.delete(id); } else removal = null;
        changed();
        return out;
      };
      removal = rmw<AttemptFree>((list) => {
        if (account() !== acct) return none('refused');
        if (!list) return none('unresolved');
        const x = list.find((y) => y.id === id);
        if (!x) return none('freed');
        // No request of it out: this tab's unanswered send (its beat runs), or any live stamp, this tab's own included
        // (its sent() write may have been refused: a free goes through only once every stamp is cleared or stale).
        if (!owns(x) || (x.metaVersion ?? 0) !== expect.metaVersion || beats.has(id) || sendingLive(x.sending)) return none('refused');
        return { list: list.filter((y) => y.id !== id), out: (wrote: boolean): AttemptFree => (wrote ? 'freed' : 'unresolved') };
      }).then(settle, () => settle('unresolved'));
      return removal;
    },
    update(next: unknown, expectVersion: number, opts?: { readonly sending?: boolean }): Promise<boolean> {
      const bad = !Number.isSafeInteger(expectVersion) || expectVersion < 0 || !Number.isSafeInteger(expectVersion + 1);
      if (freed || removal || bad) return Promise.resolve(false);
      const sending = opts?.sending === true;
      return rmw<boolean>((list) => {
        if (freed || removal || freeing.has(id) || accountGoing() || (sending && !mem.has(id))) return none(false);
        const x = list?.find((y) => y.id === id);
        if (!list || !owns(x) || (x.metaVersion ?? 0) !== expectVersion) return none(false);
        const rec: StoredChange = {
          ...x, attempt: next ?? null, metaVersion: expectVersion + 1, t: nextVersion(list),
          ...(sending ? { sending: { tab: changeStoreTab(), at: Date.now() } } : {}),
        };
        let size: number;
        try { size = JSON.stringify(rec).length; } catch { size = Infinity; }
        if (size > MAX_ATTEMPT_RECORD) return none(false);
        return {
          list: list.map((y) => (y.id === id ? rec : y)),
          out: (wrote: boolean) => {
            if (!wrote) return false;
            // A copy this tab dropped meanwhile (a sign-out purge) is not put back; storage stays the authority.
            if (mem.has(id)) mem.set(id, rec);
            if (sending && !freed) { stopBeat(id); beats.set(id, setInterval(() => restamp(id), SENDING_HEARTBEAT_MS)); }
            return true;
          },
        };
      }).then((ok) => { if (ok) changed(); return ok; }, () => false);
    },
  });
}

const refused = (code: HoldCode, held?: StoredChange): HoldResult => ({ ok: false, code, notSent: true, ...(held ? { held: view(held) } : {}) });

/**
 * Holds `lock` for one send of the shown account, before the request leaves. Refused (nothing held, nothing to
 * send) while any tab of the account holds the lock, with no account shown, or when the hold is not durable.
 * `meta` is the sender's plain data (never a secret).
 */
export function holdAttempt(lock: string, o: { by: string; meta?: unknown; identity?: unknown; realm?: string | null }): Promise<HoldResult> {
  const acct = account();
  if (!acct || accountGoing()) return Promise.resolve(refused('NO_ACCOUNT'));
  lastAccount = acct;
  if (!LOCK_RE.test(lock) || !BY_RE.test(o.by)) return Promise.reject(new Error('ATTEMPT_LOCK_INVALID'));
  // Without the cross-tab lock two tabs could both be admitted: nothing is held, nothing read or written.
  if (!changeStoreCoordinated()) return Promise.resolve(refused('NOT_DURABLE'));
  const realm = typeof o.realm === 'string' && o.realm.length > 0 && o.realm.length <= 64 ? o.realm : null;
  const id = prefixOf(acct) + lock + '\u0000' + newIncarnation();
  const startedAt = Date.now();
  const base = {
    id, pending: true, key: newKey(), at: startedAt,
    meta: { base: lock, target: null, realm, identity: o.identity ?? null, by: o.by },
    attempt: o.meta ?? null, sending: { tab: changeStoreTab(), at: startedAt },
  };
  let size: number;
  try { size = JSON.stringify({ ...base, admitting: startedAt, t: startedAt }).length; } catch { size = Infinity; }
  if (size > MAX_ATTEMPT_RECORD) return Promise.resolve(refused('TOO_LARGE'));
  return Promise.resolve(underChangeStore((): HoldResult => {
    // Read again under the lock: the account may have moved while it waited. Every check below reads this one list.
    if (account() !== acct || accountGoing()) return refused('NO_ACCOUNT');
    // Only over a clean read: a corrupt store's unreadable records are never written away, and an absent hold there
    // proves nothing.
    const rd = readSettling();
    if (rd === null) return refused('NOT_DURABLE');
    const list = rd.list, now = Date.now();
    const mine = ofAccount(list, acct, now, false);
    const live = mine.find((r) => lockOf(r) === lock);
    if (live) return refused('HELD', live);
    if (mine.length >= MAX_ATTEMPTS) return refused('FULL');
    // 1. Write it marked `admitting` (owed records left out: this write settles them). A write the browser refused
    //    may still have landed: stepping back covers that too.
    const rec0: StoredChange = { ...base, admitting: now, t: nextVersion(list) };
    const wrote0 = [...list, rec0];
    if (!writeChanges(wrote0)) { stepBack(id, list); return refused('NOT_DURABLE'); }
    settled(rd.owes);
    // 2. Read it back: it must be there as written and the only hold of its lock (another tab writing without the
    //    cross-tab lock shows here). Anything else steps back (its own record only) and holds nothing.
    const back = readClean();
    const rival = back ? ofAccount(back, acct, now, false).find((r) => lockOf(r) === lock && r.id !== id) : undefined;
    if (!back || rival || !back.some((r) => r.id === id && r.t === rec0.t)) {
      stepBack(id, back ?? wrote0);
      return rival ? refused('HELD', rival) : refused('NOT_DURABLE');
    }
    // 3. Confirm (the mark removed) and read back once more: only then is it held. Until that read-back the mark
    //    stays the stored truth: a refused confirm write left rec0 (marked) in place, and a confirm that landed but
    //    did not read back is stepped back (over the list it wrote when storage cannot be read).
    const rec: StoredChange = { ...base, t: nextVersion(back) };
    const wrote1 = back.map((r) => (r.id === id ? rec : r));
    const confirmed = writeChanges(wrote1) ? readClean() : null;
    if (!confirmed || !confirmed.some((r) => r.id === id && r.t === rec.t)) {
      stepBack(id, wrote1);
      return refused('NOT_DURABLE');
    }
    mem.set(id, rec);
    return { ok: true, hold: handle(rec, acct) };
  })).then((out) => {
    if (out.ok) {
      beats.set(id, setInterval(() => restamp(id), SENDING_HEARTBEAT_MS));
      changed();
    }
    return out;
  }, (): HoldResult => {
    // The lock could not be requested (nothing ran), or the admission threw part way: its own record, if it landed,
    // is owed (ignored here, removed on the next clean write; its `admitting` mark ages out otherwise).
    owed.add(id);
    return refused('NOT_DURABLE');
  });
}

/** The sender's handle of a stored hold (after a reload, or from another mount): null when the hold is gone, of
 *  another account, or held by another sender (that sender frees it, never this one). */
export function attemptFor(id: string, by: string): AttemptHold | null {
  const acct = account();
  if (!acct || !id.startsWith(prefixOf(acct))) return null;
  const r = current(acct).find((x) => x.id === id);
  if (!r || r.meta?.by !== by) return null;
  return handle(r, acct);
}

/** One stored hold as the held door (ask/journal) judges it: the record's own fields, never a remembered copy's. */
export interface StoredHold {
  readonly id: string;
  readonly incarnation: string;
  readonly key: string;
  readonly by: string;
  readonly realm: string | null;
  readonly meta: unknown;
  readonly metaVersion: number;
  /** The STORED record's sending stamp names this tab and is live, and this tab's beat for it runs. */
  readonly stampHere: boolean;
}
/**
 * The one read an authorization may use: the hold `id` of sender `by`, from one read of the attempt store, for the shown
 * account only. `missing` with no shown account, or when `id` is not under the shown account's prefix (before any read), or
 * when a clean store has no such admitted hold of that sender (an `admitting` or owed record is no hold). `unreadable`
 * when storage cannot be read or is corrupt, whatever this tab remembers: remembered copies (`mem`) are never consulted
 * here, and heldAttempts() is a display view, never an authority.
 */
export function attemptStored(id: string, by: string): Tri<StoredHold> {
  const acct = account();
  if (!acct || typeof id !== 'string' || !id.startsWith(prefixOf(acct))) return { s: 'missing', acct: acct ?? '' };
  const rd = readChangesState();
  if (rd.state !== 'clean') return { s: 'unreadable' };
  const r = rd.list.find((x) => x.id === id && isAttempt(x));
  if (!r || r.admitting !== undefined || owed.has(r.id) || r.meta?.by !== by) return { s: 'missing', acct };
  const now = Date.now();
  const stampHere = r.sending !== undefined && r.sending.tab === changeStoreTab() && sendingLive(r.sending, now) && beats.has(r.id);
  return { s: 'ok', acct, v: { id: r.id, incarnation: incarnationOf(r.id), key: r.key ?? '', by, realm: r.meta?.realm ?? null, meta: r.attempt ?? null, metaVersion: r.metaVersion ?? 0, stampHere } };
}

export function subscribeAttempts(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const attemptsVersion = (): number => version;
/** React: re-render when any hold of any tab changes (read heldAttempts() in the render). */
export function useAttemptsVersion(): number { return useSyncExternalStore(subscribeAttempts, attemptsVersion, attemptsVersion); }

subscribeChangeStore(() => changed());

try { onCore(() => { const a = account(); if (a) lastAccount = a; }); } catch { /* not booted */ }
/** Drops one account's holds from this tab's memory and beats only, never storage: the explicit sign-out's purge
 *  as the page leaves. A hold whose send is still out here (its beat runs) keeps its copy and beat:
 *  its stamp stays fresh for other tabs and this tab still flags it, whatever the request
 *  takes, until its answer (sent()) or a free ends it; the page may stay up (a purge-failed panel). Admission
 *  still reads the clean store, so a hold still stored keeps refusing its lock, and the next clean read shows it
 *  again. */
export function dropAccountAttempts(acct: string): void {
  const pre = prefixOf(acct);
  for (const id of [...mem.keys()]) if (id.startsWith(pre) && !beats.has(id)) mem.delete(id);
  changed();
}
/** The warned sign-out's memory drop (changes.ts forgetAccountChanges, AttemptsForget.drop, on 'done' and 'unknown'):
 *  this tab's memory and beats of exactly `ids` of `acct` (the shown attempt holds the forget removed), never storage
 *  and never another hold of the account. A shown hold whose send is still out is kept by the forget and not passed
 *  here, so its sender's sent() and release() still settle it. */
export function dropAttemptIds(acct: string, ids: readonly string[]): void {
  const pre = prefixOf(acct);
  let any = false;
  for (const id of ids) if (id.startsWith(pre) && mem.has(id)) { stopBeat(id); mem.delete(id); any = true; }
  if (any) changed();
}
onBump((reason) => {
  if (reason === 'test-boot') {
    for (const id of [...beats.keys()]) stopBeat(id);
    mem.clear();
    owed.clear();
    freeing.clear();
    stopStaleWatch();
    lastAccount = null;
    changed();
    return;
  }
});
/** The auth purge (every path runs it before storage goes; reasons are shared.js's). It removes no stored hold,
 *  whatever the reason: the shell may sign out with a plain logout() and no warning,
 *  and a purge runs again on every purge-failed Try again, so removing here could drop a hold unwarned, another
 *  tab's newer one included. An explicit sign-out naming the account this page showed (its uid; a token session's
 *  owner for a token Leave) drops this tab's copy of that account's holds whose sends are not still out (a send
 *  still out keeps its copy and beat: dropAccountAttempts); anything stored stays,
 *  read-only until the account returns, as at expiry. A purge naming no account or another one, expiry, a failed
 *  refresh, entry cleanup and a purge that names no reason change nothing here. */
export function attemptsAuthPurge(info?: AuthPurgeInfo): void {
  if (!info || info.reason !== 'signout' || info.uid == null) return;
  const leaving = lastAccount ?? account();
  if (!leaving || info.uid !== leaving) return;
  dropAccountAttempts(leaving);
}
onAuthPurge(attemptsAuthPurge);

/** This tab's memory and beats cleared, storage kept (session disposal, dispose.ts; a reload in tests). */
export function resetAttempts(): void {
  for (const id of [...beats.keys()]) stopBeat(id);
  mem.clear();
  owed.clear();
  freeing.clear();
  stopStaleWatch();
  changed();
}
