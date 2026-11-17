// index.ts: the Journal facade. Outside ask/journal/ code imports only this file.
//   mint/admit/post   the send door (door.ts)            observe/checkById  recovery by evidence (recover.ts)
//   scan/pending      the request entries (entries.ts)   dismiss            the person clears a request (settle through proof.ts)
//   find/put/drop/view the chat records (records.ts)     migrate/dockApply/dockRemove  an earlier release's evidence, the dock's per-key writes (migrate.ts)
//   leases            the session lease ids (leases.ts)
import type { AgentIO } from '../data';
import type { AskRecord, AskStore } from '../logic';
import * as L from '../logic';
import * as C from '../conv';
import type { WriteStore } from '../engine';
import { Door, SendToken, guardIO, matches, textDigest, type Admission, type Late, type Outcome } from './door';
import { Entries, type Scan } from './entries';
import { Leases } from './leases';
import { Migrator, type ClearKey, type DockRemoveResult } from './migrate';
import { DropPend, jdropKey } from './dropPend';
import { dismissal, fromDismissal, type Accepts, type Dismissal, type Verdict } from './proof';
import { Recover, type Checked, type CommandEvent, type GateClosure } from './recover';
import { Records, recordId, type ClaimResult, type FirstState, type ForkClaim, type JRec, type K1Lookup, type PutOpts, type PutResult } from './records';
import { Settler, type Settled } from './settle';
import { dockLockAvailable, withDockLock, type ForkHold, type ForkRef, type OpScope } from './locks';
import { currentAccount, isWatchedKey, legacyRead, type Tri } from './storage';
import type { Entry, NotSent, Op, Route } from './types';
import type { Ticket } from '@core';

export { SendToken, guardIO, textDigest, dismissal, currentAccount, isWatchedKey, legacyRead, matches, recordId };
export { holdChatLock, holdIfFree, forkLockName, lockNameOf, dockLockAvailable, type ChatHold, type ForkHold, type ForkRef, type OpScope } from './locks';
export type { ClearKey, DockRemoveResult } from './migrate';
export { endedAsUnavailable, type Accepts } from './proof';
export { sameFk } from './records';
export { held, heldVerdict, type HeldDoor, type HeldOutcome } from './held';
export type { K1Lookup, Checked, Admission, Late, Settled, Outcome, Scan, Entry, NotSent, Op, Route, JRec, PutOpts, PutResult, ClaimResult, ForkClaim, FirstState, Dismissal, Verdict, GateClosure, CommandEvent, Tri, Ticket };
export type { HeldOp, NotSentWhy, Kind } from './types';
export { JOURNAL_RECS, stripEvidence } from './records';
export { okHandle, okRealm, seg } from './shape';
export { ENTRIES_MAX, MIG_IMPORT_MAX, MIG_TOTAL_MAX } from './entries';

interface Internals { door: Door; entries: Entries; records: Records; settler: Settler }
const internals = new WeakMap<object, Internals>();
/** journal/testing.ts only. */
export function internalsOf(j: Journal): Internals {
  const i = internals.get(j);
  if (!i) throw new Error('not a Journal');
  return i;
}

export class Journal {
  private readonly entries: Entries;
  private readonly records: Records;
  private readonly settler: Settler;
  private readonly door: Door;
  private readonly recover: Recover;
  private readonly mig: Migrator;
  readonly leases = new Leases();
  /** This tab's dock operations that have been asked for and have not settled, per account, in the order they were asked. */
  private readonly dockPend = new Map<string, { id: number; op: C.DockOp }[]>();
  private dockSeq = 0;
  private readonly drops = new DropPend();

  constructor(o: { now?: () => number } = {}) {
    this.entries = new Entries(o.now);
    const ok = (h?: string): readonly Entry[] => { const s = this.entries.scan(h); return s.s === 'ok' ? s.entries : []; };
    this.records = new Records(
      (h) => ok(h),
      () => {
        const s = this.entries.scan();
        return s.s === 'ok' ? new Set(s.entries.map((e) => recordId(e.h, e.r, e.s, e.c))) : null;
      },
      (h) => { const s = this.entries.scan(h); return s.s === 'ok' && s.acct === currentAccount() ? s.entries : null; },
    );
    this.settler = new Settler(this.entries, this.records);
    this.door = new Door(this.entries, this.settler, (op) => this.barredOp(op));
    this.recover = new Recover(this.entries, this.settler, this.door, this.records);
    this.mig = new Migrator(this.entries);
    internals.set(this, { door: this.door, entries: this.entries, records: this.records, settler: this.settler });
  }

  mint(route: Route): string | null { return this.door.mint(route); }
  scan(h?: string): Scan { return this.entries.scan(h); }
  pending(h?: string): readonly Entry[] { return this.entries.pending(h); }
  subscribe(fn: Parameters<Entries['subscribe']>[0]): () => void { return this.entries.subscribe(fn); }
  admit(op: Op, tok: SendToken): Admission | NotSent {
    if (this.barredOp(op)) return { kind: 'notSent', why: 'elsewhere' };
    return this.door.admit(op, tok);
  }
  /** A chat whose create key is marked bound elsewhere (records.ts), or any chat of the session a marker names (a pinned open of it
   *  under a fresh key), is sent nothing more, from any engine, however it still holds the session: a stop alone goes on (it only ends
   *  work there). Asked at admission and again by the door right before the call. */
  private barredOp(op: Op): boolean {
    return op.route !== 'create' && !(op.route === 'command' && op.cmd === 'stop') && (this.records.marked(op.h, op.r, op.c) || this.records.markedSid(op.h, op.r, op.sid));
  }
  post(a: Admission, go: (t: Ticket) => unknown, accepts?: Accepts): Promise<Outcome> { return this.door.post(a, go, accepts); }
  observe(io: AgentIO, ev: GateClosure | CommandEvent): void { this.recover.observe(io, ev); }
  checkById(io: AgentIO, h: string, k: string): Promise<Verdict> { return this.recover.checkById(io, h, k); }
  /** One unsettled request recovered by its key (a read; after a miss, when nobody can be sending it, a retire). Never a send. */
  check(io: AgentIO, h: string, k: string, alive?: () => boolean, readOnly = false): Promise<Checked> { return this.recover.check(io, h, k, alive, readOnly); }
  /** The turn the agent holds under key k of session sid, read by key (a repeatable read: nothing is settled, retired, admitted or stored; see Recover.peekTurn). */
  peekTurn(io: AgentIO, h: string, sid: string, realm: string, k: string): Promise<Verdict> { return this.recover.peekTurn(io, h, sid, realm, k); }
  /** The create of chat k1 read by key with no entry needed (a read, never a retire; see Recover.checkCreate). */
  checkCreate(io: AgentIO, h: string, realm: string, k1: string, alive?: () => boolean): Promise<Checked> { return this.recover.checkCreate(io, h, realm, k1, alive); }

  /** The person clears a request. Refused (false) only while this page holds an own admission for the key in W, A, L, R, C or P. */
  dismiss(h: string, k: string, d: Dismissal): boolean {
    const acct = currentAccount();
    if (!acct || this.door.holds(acct, h, k)) return false;
    const sc = this.entries.scan(h);
    if (sc.s !== 'ok' || sc.acct !== acct) return false;
    const e = sc.entries.find((x) => x.k === k);
    if (!e) return true;
    const p = fromDismissal(d, { acct, h, k }, e.m ? 'mig' : 'req');
    if (!p) return false;
    this.entries.remove(p);
    return true;
  }
  owed(): number { return this.entries.owed(); }
  /** Retries the shown account's owed settlements (one at a time). Settles nothing from an entry alone: only work this page queued from a
   *  verdict it holds is retried (a reloaded page holds none; its entries are resolved by a Check). */
  sweep(): Promise<void> { return this.entries.sweep(); }
  /** Another tab changed the stores: puts right what its stale write undid (the entries of requests in flight here, the removals
   *  made here on proof). Never touches a name for any other reason. */

  /** The record with the request evidence the entries hold, or null when they cannot be read now (nothing is concluded then). */
  attach(h: string, rec: AskRecord): AskRecord | null {
    const sc = this.entries.scan(h);
    if (sc.s !== 'ok' || sc.acct !== currentAccount()) return null;
    return this.records.attachFrom(sc.entries, h, rec);
  }
  /** Whether `key` was minted by this Journal and never admitted (door.ts unspent): the proof that no request under it left. */
  unspent(key: string): boolean { return this.door.unspent(key); }
  /** Whether a request entry of computer `h` in `realm` holds `key`: true, false (read for account `acct`, and none does), or null when
   *  the entries cannot be read now or the shown account or theirs is not `acct` (never read as none). Absence alone proves nothing:
   *  a settled entry is removed and a malformed one is skipped; only unspent() proves a key fresh. */
  holdsKey(h: string, realm: string, key: string, acct: string): boolean | null {
    if (!acct || currentAccount() !== acct) return null;
    const sc = this.entries.scan(h);
    if (sc.s !== 'ok' || sc.acct !== acct) return null;
    return sc.entries.some((x) => x.h === h && x.r === realm && x.k === key);
  }
  has(h: string, realm: string, sid: string | null, k1: string): boolean { return this.records.has(h, realm, sid, k1); }
  find(h: string, realm: string, sid: string): JRec | null { return this.records.find(h, realm, sid); }
  findCreate(h: string, realm: string, k1: string): JRec | null { return this.records.findCreate(h, realm, k1); }
  /** The record of create key k1 wherever it is now (create:<k1> or at its session), or null. */
  byK1(h: string, realm: string, k1: string): JRec | null { return this.records.byK1(h, realm, k1); }
  /** The one atomic claim of a fork across tabs (records.ts claimFork). */
  claimFork(h: string, tpl: Omit<AskRecord, 'k1' | 'k2'>, mint: () => { k1: string; k2: string } | null, acct: string): Promise<ForkClaim> { return this.records.claimFork(h, tpl, mint, acct); }
  /** Whether the claim of create key k1 is still stored, read under the record lock (records.ts forkHeld). */
  forkHeld(h: string, realm: string, k1: string, acct: string): Promise<boolean> { return this.records.forkHeld(h, realm, k1, acct); }
  /** The fork's reply-pending mark cleared by one that held its target lock T (records.ts clearReplyPending); false keeps it counted. */
  /** The forks at their session that still carry the reply-pending mark (records.ts replyPendingHanded); null when unreadable. */
  replyPendingHanded(acct: string): JRec[] | null { return this.records.replyPendingHanded(acct); }
  clearReplyPending(hold: ForkHold, h: string, realm: string, k1: string, acct: string): Promise<boolean> { return this.records.clearReplyPending(hold, h, realm, k1, acct); }
  /** The record of create key k1 in three states: found, missing (read and absent), unreadable (never read as missing; records.ts lookupK1). */
  lookupK1(h: string, realm: string, k1: string, acct: string): K1Lookup { return this.records.lookupK1(h, realm, k1, acct); }
  /** Whether a marker names session `sid` (records.ts `xs`): no chat of it is opened or sent to here. */
  sessionMarked(h: string, realm: string, sid: string): boolean { return this.records.markedSid(h, realm, sid); }
  /** The unresolved fork of a target in three states (records.ts lookupTarget). */
  lookupTarget(h: string, realm: string, fk: { s: string; i: number | null }, acct: string): K1Lookup { return this.records.lookupTarget(h, realm, fk, acct); }
  /** Every unresolved fork of the account, or null when it cannot be read now (records.ts forkRecords). */
  forkRecords(acct: string): JRec[] | null { return this.records.forkRecords(acct); }
  /** The "bound elsewhere" marker of a fork's create key, written again by the press that holds its target lock while the settlement is
   *  owed (records.ts refuseCreate); null: not kept (yet). */
  markElsewhere(h: string, realm: string, k1: string, sid: string): Promise<boolean> { return this.records.refuseCreate(h, realm, k1, sid).then((k) => !!k); }
  /** The one consumer of a verdict a fork's recovery holds (settle.ts): the entry's removal, or the record's handoff, on proof only. */
  settle(v: Verdict, realm: string): Promise<Settled> { return this.settler.settle(v, realm); }
  /** Hides a fork's row: k1 joins the existing record's dk, nothing else; never inserts (records.ts dismissFork). */
  dismissFork(h: string, realm: string, k1: string, acct: string, fk?: AskRecord['fk']): Promise<boolean> { return this.records.dismissFork(h, realm, k1, acct, fk); }
  /** A fork's create key read once; a settled create without a session settles only for the holder of the target lock (recover.ts readFork). */
  readFork(io: AgentIO, scope: OpScope, realm: string, k1: string, hold: ForkHold | null): Promise<Checked> { return this.recover.readFork(io, scope, realm, k1, hold); }
  /** A fork's create key retired by the holder of the target lock, inside the key's free send lock (recover.ts retireFork). */
  retireFork(io: AgentIO, hold: ForkHold | null, scope: OpScope, realm: string, k1: string, fk: ForkRef): Promise<Verdict> { return this.recover.retireFork(io, hold, scope, realm, k1, fk); }
  /** Saves the chat record; `opts.admit` (never stored) is the key the turn this save names was admitted under (records.ts put, kp). */
  put(h: string, rec: AskRecord, opts?: PutOpts): Promise<PutResult> { return this.records.put(h, rec, opts); }
  /** The removal is registered as pending BEFORE it asks for its lock and released when it settles (kept, refused or thrown), so the dock's
   *  read never brings a record back as a journal-only row while its removal waits (dockRead). The account is the one at the call. */
  async drop(h: string, realm: string, sid: string | null, k1: string, acct?: string): Promise<boolean> {
    const a = acct ?? currentAccount();
    const key = jdropKey(h, realm, sid, k1);
    const n = a ? this.drops.registerDrop(a, key) : 0;
    try { return await this.records.drop(h, realm, sid, k1, acct); } finally { if (a) this.drops.releaseDrop(a, key, n); }
  }
  /** What the durable record and entries say about the first message of chat k1 (records.ts FirstState). Only a read under the chat lock authorizes. */
  firstState(h: string, realm: string, k1: string, K: string): FirstState { return this.records.firstState(h, realm, k1, K); }
  /** Claims the first message of a chat with a session and no known turn (key null: only dismisses the current key). */
  claimFirst(h: string, realm: string, sid: string, k1: string, key: string | null): Promise<ClaimResult> { return this.records.claimFirst(h, realm, sid, k1, key); }
  view(h: string, sid: string): WriteStore { return this.records.view(h, sid); }

  migrate(src: Tri<readonly AskRecord[]>, handleOf: (container: string) => string | null): number { return this.mig.migrate(src, handleOf); }
  migrationDone(): boolean | null { return this.mig.migrationDone(); }
  /** The dock's synchronous, unlocked core: ONE per-key operation on the fresh stored list (migrate.ts dockApply). Tests and harnesses call it
   *  directly; the registry's store calls dockApplyLocked. */
  dockApply(account: string, op: C.DockOp): C.DockAnswer { return this.mig.dockApply(account, op); }
  /** The dock store's apply: queued here (so this tab's own reads see it, dockRead) BEFORE it asks for the dock lock, run under the lock (every
   *  writer of hub_ask_v1 in every tab takes it) and dequeued when it settles, whatever the outcome. A refused lock answers false and writes
   *  nothing. Without Web Locks it runs at once, unlocked (Clear is not offered there). The account is checked again inside the lock. */
  async dockApplyLocked(account: string, op: C.DockOp): Promise<C.DockAnswer> {
    const id = ++this.dockSeq;
    const q = this.dockPend.get(account) ?? [];
    q.push({ id, op });
    this.dockPend.set(account, q);
    try {
      if (!dockLockAvailable()) return this.mig.dockApply(account, op);
      const r = await withDockLock(account, () => this.mig.dockApply(account, op));
      return r.ran ? r.v : false;
    } catch { return false; } finally {
      const cur = this.dockPend.get(account);
      if (cur) {
        const i = cur.findIndex((x) => x.id === id);
        if (i >= 0) cur.splice(i, 1);
        if (!cur.length) this.dockPend.delete(account);
      }
    }
  }
  /** The create keys (k1) this tab has a dock operation queued for: Clear never takes such a record. */
  dockPendingKeys(account: string): ReadonlySet<string> {
    return new Set((this.dockPend.get(account) ?? []).map((x) => (x.op.k === 'put' ? x.op.rec.k1 : x.op.k1)));
  }
  /** Clear list's one removal: under the dock lock, from the fresh stored list (migrate.ts dockRemove). `refused`: the lock could not be had
   *  (nothing was written). A throw out of it may have landed: the caller reads once to verify. */
  async dockRemove(account: string, keys: readonly ClearKey[], still: (rec: AskRecord) => boolean): Promise<DockRemoveResult> {
    const r = await withDockLock(account, () => this.mig.dockRemove(account, keys, still));
    return r.ran ? r.v : { t: 'refused' };
  }
  /** The dock's StoreIO.read: the old source's records, plus the chats the dock keeps only in the journal (a create with no
   *  session yet is never written to the old source), so a reload still finds them. The source's record wins for a chat both hold
   *  (full identity). A journal-only row whose journal removal is still pending stays hidden. Then this tab's queued dock ops are
   *  applied in the order they were asked, so a read right after a write that has not settled sees it. */
  dockRead(account: string, base: AskStore): AskStore {
    if (!account || account !== currentAccount()) return base;
    const mine = L.own(base.a, account) ? base.a[account] ?? [] : [];
    const have = new Set(mine.map((r) => C.idKey(r)));
    // A fork waiting for its session is not the dock's conversation: it has no first message, and is shown by its own row.
    const extra = this.records.list()
      .filter((r) => r.s === null && !r.fk && !have.has(C.idKey(r)) && !this.drops.dropPending(account, jdropKey(r.h, r.r, r.s, r.k1)))
      .map(({ h: _h, ...r }) => r as AskRecord);
    const ops = this.dockPend.get(account) ?? [];
    if (!extra.length && !ops.length) return base;
    let list: AskRecord[] = extra.length ? [...mine, ...extra] : mine.slice();
    for (const { op } of ops) list = C.overlayOp(list, op);
    const a = { ...base.a };
    if (list.length) a[account] = list; else delete a[account];
    return { ...base, a };
  }
}
