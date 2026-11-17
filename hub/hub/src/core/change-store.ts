// change-store.ts: the stored copy of the C9 registry's held changes (changes.ts), so a hold survives a reload
// and every tab of the account sees it.
//
// Contract, in plain words:
//   - One registered key, hub.v3.changes (registry.ts: purge false, forget true: no auth purge removes it, a
//     sign-out included; only Forget this browser removes the key; the warned sign-out removes one account's
//     records, lifecycle.ts signOutForgetting), read and written through an adapter (setChangeStoreAdapter), so the
//     bytes can move to hub-crypt's store without touching the callers.
//   - One record per change id (changes.ts: account, scope, digest): pending, the kept idempotency key (never a
//     digest of the variables: they may hold a secret), when it went pending, its metadata (base, computer, realm,
//     lockKey identity, sender: plain data, never the variables), the hold token (inc, nonce), a sending stamp
//     {tab, at} while a send is out, and a version t.
//   - Every read-modify-write runs under one cross-tab lock (navigator.locks 'hub_changes', underChangeStore).
//     Without it (no navigator.locks, or a getter or request that throws) underChangeStore rejects and runs
//     nothing: no write, no admission. One tab alone gets no exception (tests install a lock shim, test/locks.ts).
//   - The version moves on every write of a record's state. writeChanges writes what it is given, minus an older
//     build's keyBytes. An older build's records convert at one point only: the start of every store-lock turn,
//     before the turn's own function runs (underChangeStore, setTurnConversion; changes.ts "records of older
//     builds"). changes.ts writers name the send they concern by its hold token
//     (inc#nonce), at whatever version its record is now (a heartbeat moves it); only a legacy record without a
//     token is compared by the version this tab last saw. changes.ts decides what wins (a send's own pending answer
//     never makes a hold pending again once it was released or removed meanwhile).
//   - A sending stamp is renewed every SENDING_HEARTBEAT_MS while the send is out. One older than
//     SENDING_STALE_MS belongs to a tab that died mid-send: its outcome is unknown, so it reads as pending
//     (may have gone through), never as free.
//   - A write goes over a clean read only. A corrupt store (some records unreadable) is never written over, and
//     unreadable storage (readChangesState 'unreadable', not the same as empty) only by attempts.ts's step-back,
//     with the list that admission itself wrote under the same lock. The one other exception is changes.ts's
//     test-boot reset. Refused, the caller keeps its own memory; a refused lock refuses the same way.

import { hostEnv, localStore } from './host-env';
import { isRecord } from './shape';

export const CHANGE_STORE_KEY = 'hub.v3.changes';
/** The changes record format of this build (StoredChange.fmt). */
export const CHANGE_FMT = 1;
const LOCK = 'hub_changes';
export const SENDING_HEARTBEAT_MS = 30000;
export const SENDING_STALE_MS = 120000;
// Bounds: 64 held changes.ts records per account, never dropped (heldRecord); others fill up to 64 changes.ts
// records in all, newest first; attempts.ts records are bounded per account at admission and always kept; a
// record over 8 KiB as JSON is not stored.
const MAX_RECORDS = 64, MAX_RECORD = 8192;
/** attempts.ts records (a held send without an idempotency key): ids start with this; changes.ts ids start with
 *  their account, so neither reads the other's. Every one is kept (never pushed out by the cap: that would free a
 *  hold) and none counts toward MAX_RECORDS: attempts.ts admits at most MAX_ATTEMPTS per account, and refuses one
 *  over MAX_ATTEMPT_RECORD instead of losing it. */
export const ATTEMPT_PREFIX = 'attempt\u0002';
/** The longest key (and an older build's keyBytes) a stored record may carry: a hold is sized with the key at admission (changes.ts). */
export const KEY_MAX = 256;
export const MAX_ATTEMPT_RECORD = MAX_RECORD;

export interface StoredTarget { readonly project: { readonly id: string }; readonly container: { readonly id: string } }
export interface StoredMeta {
  readonly base: string; readonly target: StoredTarget | null; readonly realm: string | null;
  readonly identity?: unknown; readonly by?: string;
  /** changes.ts ChangeMeta.across (how the scope was filed); absent on an older build's record. Not checked on read:
   *  only `false` changes anything (compatScopeOf), so a bad value fails safe. */
  readonly across?: boolean;
}
/** One hold as the sign-out warning showed it: the record id and its hold token (a change: inc#nonce; an attempt:
 *  its incarnation). Never the store version: heartbeats rewrite that. The forget deletes only shown holds.
 *  `sending`: a request still out (recordSendOut: a change's send or an attempt's request with a live stamp, or this
 *  tab's own busy send). The forget keeps such a record stored, and it keeps refusing a second send until its answer settles it, so the shell can say so
 *  before the press. The forget matches refs by id and token; `sending` matters in one case: a held record sending
 *  now that the warning showed not sending (same id and token) answers 'changed' (it went live since). */
export interface HoldRef { readonly id: string; readonly token: string; readonly sending?: true }
export interface StoredChange {
  readonly id: string;
  readonly pending: boolean;
  readonly key: string | null;
  /** Written only by older builds (a digest of the variables a key went with); changes.ts never writes or trusts it
   *  (the variables may hold a secret). Still accepted on read, so their records stay readable; writeChanges
   *  never writes it back. */
  readonly keyBytes?: string;
  readonly at?: number;
  readonly meta?: StoredMeta;
  /** changes.ts: the record format (CHANGE_FMT), on every changes record this build writes. Absent: an older
   *  build's record (changes.ts converts it; never adopted). Any other value makes the record invalid (the store
   *  corrupt), so it never passes for this build's. */
  readonly fmt?: number;
  /** A send of this change is out in tab `tab`, stamped (and renewed) at `at`. */
  readonly sending?: { readonly tab: string; readonly at: number };
  /** attempts.ts only: the sender's plain metadata (never a secret). */
  readonly attempt?: unknown;
  /** attempts.ts only: set while an admission is being verified (its time). A record still carrying it past
   *  attempts.ts's window was never admitted, so never sent: its cleanup is owed, and it holds nothing. */
  readonly admitting?: number;
  /** attempts.ts only: the sender metadata's version (0 at admission); only AttemptHold.update bumps it, under the store lock. */
  readonly metaVersion?: number;
  /** changes.ts: the hold's incarnation (random, set when the hold is admitted): a later hold of the same change
   *  has another, so a verdict or a late answer about an earlier one never moves it. */
  readonly inc?: string;
  /** changes.ts: this send's nonce (random, new at every admission, a replay of a kept key included): a hold
   *  token is inc#nonce, so another runtime's replay of the same hold moves it. */
  readonly nonce?: string;
  /** changes.ts: the send's outcome nonce (random, never derived from the change): new when the send is admitted and
   *  when its pending outcome is stored, never on a heartbeat or a release. A hold names it (`inc#nonce~oc`), so a free
   *  judged on what a caller observed refuses an outcome stored after that (changes.ts settleChange). */
  readonly oc?: string;
  readonly t: number;
}

/** Where the records live: the plain registered key by default; hub-crypt may install its own. */
export interface ChangeStoreAdapter {
  /** The stored text, null when nothing is stored; throws when storage cannot be read. */
  read(): string | null;
  /** Stores the text (null removes it); false when the browser refused. */
  write(text: string | null): boolean;
}
const plainAdapter: ChangeStoreAdapter = {
  read: () => localStore().getItem(CHANGE_STORE_KEY),
  write(text) {
    try {
      if (text === null) localStore().removeItem(CHANGE_STORE_KEY);
      else localStore().setItem(CHANGE_STORE_KEY, text);
      return true;
    } catch { return false; }
  },
};
let adapter: ChangeStoreAdapter = plainAdapter;
/** Installs another store for the records (null: back to the plain registered key). */
export function setChangeStoreAdapter(a: ChangeStoreAdapter | null): void { adapter = a || plainAdapter; }

const newTab = (): string => {
  try { const b = new Uint8Array(9); globalThis.crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
  catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
};
let tab = newTab();
/** This tab's id in sending stamps. */
export const changeStoreTab = (): string => tab;

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
/** The computer of a stored target: `computer` (written now), else `container` (a record an older Hub wrote). The new
 *  spelling wins when both are there. */
const targetComputer = (v: Record<string, unknown>): unknown => (v.computer !== undefined ? v.computer : v.container);
function validTarget(v: unknown): boolean {
  if (v === null) return true;
  if (!isRecord(v) || !isRecord(v.project) || !str(v.project.id, 128)) return false;
  const c = targetComputer(v);
  return isRecord(c) && str(c.id, 128);
}
/** A valid record with its target in memory shape ({project, container}), whichever spelling it was stored in. */
function fromStored(r: StoredChange): StoredChange {
  const t = r.meta?.target as (Record<string, unknown> | null | undefined);
  if (!r.meta || !t || t.computer === undefined) return r;
  const { computer, container: _old, ...rest } = t;
  void _old;
  return { ...r, meta: { ...r.meta, target: { ...rest, container: computer } as unknown as StoredTarget } };
}
/** A record as it is written: the target names its computer as `computer`. */
function toStoredRecord<T extends StoredChange>(r: T): T {
  const t = r.meta?.target;
  if (!r.meta || !t) return r;
  const { container, ...rest } = t;
  return { ...r, meta: { ...r.meta, target: { ...rest, computer: container } } } as unknown as T;
}
function validMeta(v: unknown): v is StoredMeta {
  return isRecord(v) && str(v.base, 256) && validTarget(v.target) && (v.realm === null || str(v.realm, 64))
    && (v.by === undefined || str(v.by, 256));
}
function valid(v: unknown): v is StoredChange {
  if (!isRecord(v) || !str(v.id, 1024) || typeof v.pending !== 'boolean' || !time(v.t)) return false;
  if (!(v.key === null || str(v.key, KEY_MAX)) || !(v.keyBytes === undefined || str(v.keyBytes, KEY_MAX)) || !(v.at === undefined || time(v.at))) return false;
  if (v.meta !== undefined && !validMeta(v.meta)) return false;
  if (!(v.fmt === undefined || v.fmt === CHANGE_FMT)) return false;
  if (!(v.inc === undefined || str(v.inc, 64)) || !(v.nonce === undefined || str(v.nonce, 64)) || !(v.oc === undefined || str(v.oc, 64)) || !(v.admitting === undefined || time(v.admitting))) return false;
  if (!(v.metaVersion === undefined || (Number.isSafeInteger(v.metaVersion) && (v.metaVersion as number) >= 0))) return false;
  return v.sending === undefined || (isRecord(v.sending) && str(v.sending.tab, 64) && time(v.sending.at));
}

/** What a read of the store found: every record clean; some text that did not parse or a record that did not
 *  validate (corrupt: the valid records, but an absent one may have been lost, so it proves nothing); or storage
 *  that cannot be read at all. */
export type ChangesRead =
  | { readonly state: 'clean'; readonly list: StoredChange[] }
  | { readonly state: 'corrupt'; readonly list: StoredChange[] }
  | { readonly state: 'unreadable' };
export function readChangesState(): ChangesRead {
  // A store-lock turn's first read is the read its start judged (when that start wrote nothing): one read, as
  // before the turn conversion; every later read, and any read after a write, reads storage.
  const first = turnFirstRead;
  turnFirstRead = null;
  return first ?? readStored();
}
function readStored(): ChangesRead {
  let raw: string | null;
  try { raw = adapter.read(); } catch { return { state: 'unreadable' }; }
  let a: unknown;
  // Only an absent key is an empty store: '' (an outside writer, a cut write) is corrupt, never "no holds".
  try { a = JSON.parse(raw === null ? '[]' : raw); } catch { return { state: 'corrupt', list: [] }; }
  if (!Array.isArray(a)) return { state: 'corrupt', list: [] };
  const by = new Map<string, StoredChange>();
  let bad = false;
  for (const r of a) {
    if (!valid(r)) { bad = true; continue; }
    const cur = by.get(r.id);
    if (!cur || r.t > cur.t) by.set(r.id, fromStored(r));
  }
  return { state: bad ? 'corrupt' : 'clean', list: [...by.values()] };
}
/** Every stored record (one per id, the newest version; a corrupt store gives its valid ones), or null when
 *  storage cannot be read. A caller deciding that an absent record was resolved uses readChangesState. */
export function readChanges(): StoredChange[] | null {
  const r = readChangesState();
  return r.state === 'unreadable' ? null : r.list;
}

/** A record that holds a change: an attempts.ts hold, a pending change, a kept idempotency key, or a send in
 *  flight. The cap never drops one (that would free a hold on reload); a record that is none of these may go. */
export const heldRecord = (r: StoredChange): boolean =>
  r.id.startsWith(ATTEMPT_PREFIX) || r.pending || r.key !== null || !!r.sending;

/** The account a record belongs to: the text before the first \u0001 of its id (after the attempt prefix). */
const accountOfRecord = (id: string): string => {
  const rest = id.startsWith(ATTEMPT_PREFIX) ? id.slice(ATTEMPT_PREFIX.length) : id;
  const cut = rest.indexOf('\u0001');
  return cut < 0 ? rest : rest.slice(0, cut);
};

/** Why the records cannot all be kept: one account's held changes.ts records exceed MAX_RECORDS (HOLDS_FULL: the cap
 *  is per account; attempts.ts records are not counted, they are bounded per account at their admission), or a
 *  held one is over MAX_RECORD or not storable (TOO_LARGE). Null when they fit. A caller adding a new hold refuses
 *  it on this. */
export function changesFit(list: readonly StoredChange[]): 'HOLDS_FULL' | 'TOO_LARGE' | null {
  const n = new Map<string, number>();
  for (const r of list) {
    if (!heldRecord(r)) continue;
    let j: string;
    try { j = JSON.stringify(r); } catch { return 'TOO_LARGE'; }
    if (j.length > MAX_RECORD) return 'TOO_LARGE';
    if (r.id.startsWith(ATTEMPT_PREFIX)) continue;
    const a = accountOfRecord(r.id), c = (n.get(a) ?? 0) + 1;
    if (c > MAX_RECORDS) return 'HOLDS_FULL';
    n.set(a, c);
  }
  return null;
}

/** Stores the records: every held record (attempts included), then the newest others while fewer than
 *  MAX_RECORDS changes.ts records are kept. False, and nothing written, when the browser refused or
 *  changesFit(list) is not null: a held record is never dropped. It writes the list it is given (no conversion:
 *  that happens once, at the start of the store-lock turn, underChangeStore). */
export function writeChanges(list: readonly StoredChange[]): boolean {
  turnFirstRead = null;
  if (changesFit(list)) return false;
  const kept: string[] = [];
  let n = 0;
  const sorted = [...list].sort((x, y) => Number(heldRecord(y)) - Number(heldRecord(x)) || y.t - x.t);
  for (const r of sorted) {
    const attempt = r.id.startsWith(ATTEMPT_PREFIX);
    if (!heldRecord(r) && n >= MAX_RECORDS) break;
    let j: string;
    // keyBytes (a digest of a change's variables, written by older builds) is never written back, whichever
    // record the write is for.
    const { keyBytes: _kb, ...clean } = r;
    void _kb;
    try { j = JSON.stringify(toStoredRecord(clean)); } catch { continue; }
    if (j.length > MAX_RECORD) continue;
    kept.push(j);
    if (!attempt) n++;
  }
  return adapter.write(kept.length ? '[' + kept.reverse().join(',') + ']' : null);
}

/** The next version: above every stored one and not behind the clock. */
export function nextVersion(list: readonly StoredChange[]): number {
  let t = Date.now();
  for (const r of list) if (r.t >= t) t = r.t + 1;
  return t;
}

/** True while a stamp is fresh: its tab renews it, so its send is still out. */
export const sendingLive = (s: StoredChange['sending'], now: number = Date.now()): boolean => !!s && now - s.at < SENDING_STALE_MS;
/** A request still out: a stored record, change or attempt, whose sending stamp is live (a change's send; an attempt's
 *  request, stamped at admission, renewed by its beat, cleared when answered). ONE rule for the sign-out forget's keep
 *  (the record stays until its answer settles it) and the warning's HoldRef.sending flag. */
export const recordSendOut = (r: StoredChange, now: number = Date.now()): boolean => sendingLive(r.sending, now);

/** True when tabs can coordinate (navigator.locks). Without it nothing reads-and-writes the store (underChangeStore
 *  refuses): two tabs could both be admitted, or one could write back a list that drops the other's new hold. */
export function changeStoreCoordinated(): boolean {
  try { return typeof (hostEnv().locks as { request?: unknown } | null)?.request === 'function'; } catch { return false; }
}

/** What a store-lock turn's conversion decided (changes.ts olderPlan): the converted list to store first (null:
 *  nothing to convert), and whether an older record was left in place (a live stamp of another tab), whose stale
 *  re-read the turn's follow-up arms. */
/** `deadline`: the earliest expiry of the live older stamps the turn left in place (Infinity: none). */
export type TurnPlan = { next: StoredChange[] | null; deferred: boolean; deadline?: number };
let turnConversion: ((list: readonly StoredChange[], now: number) => TurnPlan) | null = null;
let turnFollowUp: (() => void) | null = null;
let turnRefusedArm: ((deadline: number) => void) | null = null;
let turnClock: number | null = null;
let turnFirstRead: ChangesRead | null = null;
/** changes.ts: the conversion every store-lock turn runs first, with the turn's one time, and the follow-up (a load)
 *  queued after a turn that converted or left an older record in place. The only conversion site. */
export function setTurnConversion(fn: ((list: readonly StoredChange[], now: number) => TurnPlan) | null, followUp: (() => void) | null, refusedArm: ((deadline: number) => void) | null = null): void {
  turnConversion = fn;
  turnFollowUp = followUp;
  turnRefusedArm = refusedArm;
}
/** The time of the store-lock turn running now (the one its conversion judged with); outside a turn, the clock. */
export const turnNow = (): number => turnClock ?? Date.now();
/** A store-lock turn refused before its function ran: its conversion could not be stored. Nothing of the turn ran. */
export class ChangeStoreRefused extends Error {
  constructor() { super('CHANGE_STORE_REFUSED'); }
}

/** Runs fn under the cross-tab store lock (a promise of its value). Every write of the store goes through here: a
 *  write replaces the whole list, so it is only safe while no other tab can write between its read and its write.
 *  Without navigator.locks, or when reading it or request() throws, it rejects and never runs fn: the stored records
 *  stay as they are (a hold freed meanwhile shows again on the next read; nothing new is admitted).
 *  Each turn first converts an older build's records over a clean read, with one time (turnNow), and stores them
 *  before fn runs: every read fn makes is after that write, so no list fn holds or writes back predates the
 *  conversion. When that write cannot be stored (refused, or a throw whose read-back still needs converting), the
 *  turn rejects with ChangeStoreRefused and fn never runs; its read-only refused arm still runs (setTurnConversion). fn is synchronous: a thenable result rejects. */
export function underChangeStore<T>(fn: () => T): Promise<T> {
  let request: ((n: string, cb: () => T) => Promise<T>) | null = null;
  try {
    const locks = hostEnv().locks as { request?: unknown } | null;
    if (locks && typeof locks.request === 'function') {
      const l = locks as { request: (n: string, cb: () => T) => Promise<T> };
      request = (n, cb) => l.request(n, cb);
    }
  } catch { return Promise.reject(new Error('CHANGE_STORE_UNCOORDINATED')); }
  if (!request) return Promise.reject(new Error('CHANGE_STORE_UNCOORDINATED'));
  const held = (): T => {
    const now = Date.now();
    turnClock = now;
    try {
      const convert = turnConversion;
      if (convert) {
        const rd = readStored();
        turnFirstRead = rd;
        if (rd.state === 'clean') {
          const plan = convert(rd.list, now);
          if (plan.next) {
            let stored: boolean;
            try { stored = writeChanges(plan.next); } catch {
              // A throw may have landed: stored only when a clean read leaves nothing to convert.
              const back = readStored();
              stored = back.state === 'clean' && convert(back.list, now).next === null;
            }
            if (!stored) {
              // The turn runs nothing, but a live older record it would have left in place keeps its stale re-read:
              // a read-only arm, never the follow-up (which would convert again: a loop under a lasting refusal). It
              // gets the deadline this turn's clean read saw, so it never depends on reading again.
              const arm = turnRefusedArm, deadline = plan.deadline ?? Infinity;
              if (arm) queueMicrotask(() => arm(deadline));
              throw new ChangeStoreRefused();
            }
          }
          const follow = turnFollowUp;
          if (follow && (plan.next || plan.deferred)) queueMicrotask(follow);
        }
      }
      const out = fn();
      const p = out as { then?: unknown } | null;
      if (p && typeof p === 'object' && typeof p.then === 'function') throw new Error('CHANGE_STORE_ASYNC_TURN');
      return out;
    } finally { turnClock = null; turnFirstRead = null; }
  };
  try { return request(LOCK, held); } catch { return Promise.reject(new Error('CHANGE_STORE_UNCOORDINATED')); }
}

/** An older name for the same helper (an admission calls it): there is one helper, underChangeStore, which
 *  refuses without coordination for every caller. */
export const underChangeStoreLocked = underChangeStore;

/** Called when another tab changed the records (the storage event of the key, or a whole clear). */
export function subscribeChangeStore(fn: () => void): () => void {
  return hostEnv().onExternalChange((_area, key) => { if (key === CHANGE_STORE_KEY || key === null) fn(); });
}

/** Tests only: act as another tab from here on (a reload). */
export function newChangeStoreTabForTests(): string { tab = newTab(); return tab; }
