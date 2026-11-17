// forkRecovery.ts: recovering a pending fork - Check it, Hide it, list what is pending. No engine and no React: it is built over the
// page's Journal and an AgentIO, so the chat's engine and the AI-page list use the same code.
//
// A pending fork is a stored record (create:<k1>, with `fk`) that no session has replaced yet. Its create key k1 is the only thing that can
// say what became of it, and only a holder of the target lock T (journal/locks.ts) may complete it: read the key, retire it (a durable fence
// that proves "never made"), settle what the answer proves, then drop the record. T is only ever TRIED (never waited for): a Check that does not
// get it reads (a read can hand the record off to the new chat) and settles nothing else. Every answer is a typed ForkOutcome: the host
// chooses tone and actions from its `reason`, never from the words.
import type { AgentIO } from './data';
import { reasonKey, type ForkOutcome, type ForkReason } from './fork';
import { endedAsUnavailable, holdIfFree, lockNameOf, okHandle, sameFk, currentAccount, type Checked, type ForkHold, type JRec, type Journal, type K1Lookup, type OpScope, type Verdict } from './journal';

/** What a ForkRecovery is for: one account, one computer and realm, over the page's Journal. `acct` is the account `io` was made for: every
 *  operation is that account's, and refuses when it is no longer the shown one (an io of account A is never used to read or retire a key of
 *  account B's journal). `alive` says whether the owner that asked is still there (an ended owner finishes the proof-driven cleanup but shows
 *  nothing). */
export interface ForkRecoveryDeps { io: AgentIO; j: Journal; handle: string; realm: string; acct: string; alive(): boolean }

/** One pending fork as a list shows it. */
export interface ForkRow {
  readonly k1: string;
  readonly h: string;
  readonly r: string;
  /** The parent chat and the 0-based turn it copies through (null: the whole chat). Null parent: the stored origin could not be read. */
  readonly parent: string | null;
  readonly turn: number | null;
  readonly bad: boolean;
  readonly hidden: boolean;
  /** A press on this page's Journal is making it now. */
  readonly mine: boolean;
  readonly at: number;
}
/** The unconfirmed forks of other computers and realms in the same account, one line each. */
export interface ForkElsewhere { readonly h: string; readonly r: string; readonly n: number }

const inFlights = new WeakMap<Journal, Map<string, Promise<ForkOutcome>>>();
/** The k1s a press on this Journal is making now (engine.runFork sets and clears them). */
const making = new WeakMap<Journal, Set<string>>();
export function markMaking(j: Journal, k1: string, on: boolean): void {
  let s = making.get(j);
  if (!s) making.set(j, (s = new Set()));
  if (on) s.add(k1); else s.delete(k1);
}

/** The reason an unknown verdict stands for: what the proof could not say. */
export function unknownReason(v: Verdict): ForkReason {
  switch (v.why) {
    case 'inFlight': return 'inFlight';
    case 'account': return 'account';
    case 'unreadable': case 'recordsUnreadable': return 'unreadable';
    case 'heldElsewhere': return 'busy';
    case 'noDestination': return 'notRemembered';
    default: return 'pending';
  }
}

/** The ONE constructor of a Check's answer: the outcome plus the account it was decided for and the create key that was checked. The host's
 *  `forkNow` guard (ask/active.ts forkOutcome -> kit/agent/forkNow.ts) reads them in the turn it acts. Every Check path ends here, the engine's
 *  not-journaled refusal included, so no Check answer is unstamped. */
export function checkAnswer(o: ForkOutcome, acct: string, asked: string): ForkOutcome { return { ...o, acct, asked }; }

/** Drains the reply-pending marks (records.ts `rp`) that outlived their press: a press clears its own mark when it releases T, but a page
 *  that closed first, or a clear the store refused, leaves it on a fork already at its session (no pending row is left to Check), where it
 *  still counts toward MARKS_MAX. For each such fork T is TRIED (never waited for): taking it proves the press that made the fork ended,
 *  so the mark is cleared; a T someone else holds is left alone (fail closed). `own`: the T the caller (a press) holds now; a fork of that
 *  same target is cleared under it (the press that made that fork held the same T, so it ended). True when a mark was cleared. Never
 *  rejects. */
export async function drainReplyPending(j: Journal, acct: string, own?: ForkHold): Promise<boolean> {
  let cleared = false;
  for (const x of j.replyPendingHanded(acct) ?? []) {
    if (!x.fk || !okHandle(x.h)) continue;
    const name = lockNameOf(x, { acct, h: x.h, r: x.r });
    let hold: ForkHold | null = own && own.name === name ? own : null;
    if (!hold) {
      try { hold = await holdIfFree(name); } catch { hold = null; }
      if (!hold) continue;
      try { hold.release(); } catch { /* released */ }
    }
    try { if (await j.clearReplyPending(hold, x.h, x.r, x.k1, acct)) cleared = true; } catch { /* the mark stays */ }
  }
  return cleared;
}

export class ForkRecovery {
  constructor(private readonly d: ForkRecoveryDeps) {}

  /** Whether the shown account is still the one this recovery (and its io) was made for. */
  private bound(): boolean { return !!this.d.acct && currentAccount() === this.d.acct; }

  private unknown(k1: string, reason: ForkReason, whole: boolean): ForkOutcome { return { k: 'unknown', k1, key: reasonKey(reason, whole), reason }; }
  private refused(reason: ForkReason, whole: boolean): ForkOutcome { return { k: 'refused', key: reasonKey(reason, whole), reason }; }
  /** The key's marker (records.ts): its session is bound elsewhere, so it is never opened here, whatever its receipt says. */
  private elsewhere(): ForkOutcome { return { k: 'refused', key: 'ask.forkElsewhere', reason: 'refused' }; }
  private marked(scope: OpScope, k1: string): boolean {
    const lk = this.d.j.lookupK1(scope.h, scope.r, k1, scope.acct);
    return lk.t === 'found' && !!lk.rec.xb;
  }

  /** Checks the pending fork of create key k1: what the computer holds under the key, and, when it holds nothing and nobody can be making it,
   *  a retire that fences the key. Concurrent Checks of one key on a Journal are one. Never sends the create. Every answer goes through
   *  `checkAnswer`, the one place a Check's outcome is stamped with the account it was decided for. */
  check(k1: string): Promise<ForkOutcome> {
    const acct = this.d.acct;
    return this.flight(k1).then((o) => checkAnswer(o, acct, k1));
  }
  private flight(k1: string): Promise<ForkOutcome> {
    const { j, handle, realm, acct } = this.d;
    if (!this.bound()) return Promise.resolve(this.unknown(k1, 'account', false));
    const id = `${acct}|${handle}|${realm}|${k1}`;
    let m = inFlights.get(j);
    if (!m) inFlights.set(j, (m = new Map()));
    const flying = m.get(id);
    if (flying) return flying;
    const mine = m;
    const run: Promise<ForkOutcome> = this.run(k1, acct).then((o) => this.sealed(k1, o)).finally(() => { if (mine.get(id) === run) mine.delete(id); });
    mine.set(id, run);
    return run;
  }

  /** The last word on every outcome: a Check that ends after the account moved says only `unknown` (the page it describes is not the shown one),
   *  never a definite toast for another account's page. */
  private sealed(k1: string, o: ForkOutcome): ForkOutcome {
    if (o.k !== 'unknown' && !this.bound()) return this.unknown(k1, 'account', false);
    // A marker written while this Check ran (the press's reply, in any tab) is the last word: a Check that read the key before it never
    // opens what that reply refused.
    if (o.k !== 'refused' && this.bound() && this.marked({ acct: this.d.acct, h: this.d.handle, r: this.d.realm }, k1)) return this.elsewhere();
    // Nor a session another key's marker names (its `xs`): whatever key's record reached it, it is bound elsewhere.
    if (o.k === 'opened' && this.d.j.sessionMarked(this.d.handle, this.d.realm, o.sid)) return this.elsewhere();
    return o;
  }

  /** Hides the row of a pending fork. Display only: the record still counts, still blocks its target and is still listed (hidden). */
  async hide(k1: string): Promise<boolean> {
    const { j, handle, realm, acct } = this.d;
    if (!this.bound()) return false;
    const lk = j.lookupK1(handle, realm, k1, acct);
    if (lk.t !== 'found' || lk.rec.xb || lk.rec.s !== null || !lk.rec.fk) return false;
    return j.dismissFork(handle, realm, k1, acct, lk.rec.fk);
  }

  /** The unconfirmed forks of this computer and realm in the shown account, newest first; null when they cannot be read now. */
  pending(): ForkRow[] | null {
    const all = this.bound() ? this.d.j.forkRecords(this.d.acct) : null;
    if (!all) return null;
    const mk = making.get(this.d.j);
    return all.filter((x) => x.h === this.d.handle && x.r === this.d.realm).map((x) => rowOf(x, !!mk?.has(x.k1))).sort((a, b) => b.at - a.at);
  }
  /** The unconfirmed forks of every other computer and realm of the shown account, counted per scope. */
  pendingElsewhere(): ForkElsewhere[] | null {
    const all = this.bound() ? this.d.j.forkRecords(this.d.acct) : null;
    if (!all) return null;
    const by = new Map<string, ForkElsewhere>();
    for (const x of all) {
      if (x.h === this.d.handle && x.r === this.d.realm) continue;
      const k = x.h + '|' + x.r;
      const cur = by.get(k);
      by.set(k, { h: x.h, r: x.r, n: (cur?.n ?? 0) + 1 });
    }
    return [...by.values()];
  }

  // ---- the Check ----
  private async run(k1: string, acct: string): Promise<ForkOutcome> {
    const { j, handle: h, realm: r } = this.d;
    if (!acct || !okHandle(h)) return this.refused('notRemembered', false);
    if (!this.bound()) return this.unknown(k1, 'account', false);
    const scope: OpScope = { acct, h, r };
    const lk0 = j.lookupK1(h, r, k1, acct);
    const first = await this.dispatch(lk0, scope, k1);
    if (first !== 'unresolved') return first;
    const rec0 = (lk0 as { t: 'found'; rec: JRec }).rec;
    // A record that names no fork is not this recovery's (its key is read by the generic Check).
    if (!rec0.fk) return this.unknown(k1, 'unreadable', false);
    const whole = rec0.fk?.i === null;
    // T, tried once.
    let hold: ForkHold | null = null;
    let refused = false;
    try { hold = await holdIfFree(lockNameOf(rec0, scope)); } catch { refused = true; }
    if (!hold) return this.readOnly(scope, k1, rec0, refused, whole);
    try {
      // The late grant: the owner ended or the account moved while this waited for the microtask - nothing is called.
      if (!this.d.alive() || !this.bound()) return this.unknown(k1, !this.bound() ? 'account' : 'notRemembered', whole);
      return await this.underT(scope, k1, rec0, hold, whole);
    } finally { await this.releaseT(hold, scope, k1); }
  }
  /** The end of a Check's T: having held T proves the press that made the fork has ended (it holds T until its own reply is settled), so
   *  once T is released (its holding time is unchanged) the record's reply-pending mark is cleared (records.ts `rp`; one that cannot be
   *  cleared stays and still counts). Never rejects. */
  private async releaseT(hold: ForkHold, scope: OpScope, k1: string): Promise<void> {
    try { hold.release(); } catch { /* released */ }
    try { await this.d.j.clearReplyPending(hold, scope.h, scope.r, k1, scope.acct); } catch { /* the mark stays */ }
  }

  /** The one function that maps a record lookup to an action: a final outcome, or 'unresolved' (the caller goes on). */
  /** `held`: the fork whose target lock T this Check holds now (underT); a record moved for that same fork is not busy on our own T. */
  private async dispatch(lk: K1Lookup, scope: OpScope, k1: string, whole = false, held?: JRec['fk']): Promise<ForkOutcome | 'unresolved'> {
    if (lk.t === 'unreadable') return this.unknown(k1, currentAccount() !== scope.acct ? 'account' : 'unreadable', whole);
    if (lk.t === 'missing') return this.missing(scope, k1);
    const rec = lk.rec;
    // Before any read: the key's marker refuses (records.ts).
    if (rec.xb) return this.elsewhere();
    if (rec.s !== null) return this.moved(scope, k1, rec, held);
    return 'unresolved';
  }
  /** The record is at a session already: the fork is made. `opened` only when the key itself says so and the record is read back there. */
  private async moved(scope: OpScope, k1: string, rec: JRec, held?: JRec['fk']): Promise<ForkOutcome> {
    const rd = await this.d.j.readFork(this.d.io, scope, scope.r, k1, null);
    if (rd.v.t === 'settled' && rd.v.sid === rec.s && this.certified(scope, k1, rec.s, rec.fk)) {
      // A read may have moved the record while the press that made it still waits for its reply (which alone names the session's
      // binding): opened only when the target lock is free, or held by this very Check for the same fork (no press can hold it then).
      const ours = held !== undefined && !!rec.fk && sameFk(rec.fk, held);
      return (ours || (await this.targetFree(scope, rec))) ? { k: 'opened', sid: rec.s as string, k1 } : this.unknown(k1, 'busy', rec.fk?.i === null);
    }
    return this.unknown(k1, unknownReason(rd.v), rec.fk?.i === null);
  }
  /** Whether no press or Check holds the fork's target lock T now (tried, never waited for; Web Locks refusing it is not free). */
  private async targetFree(scope: OpScope, rec: JRec): Promise<boolean> {
    if (!rec.fk) return true;
    let hold: ForkHold | null = null;
    try { hold = await holdIfFree(lockNameOf(rec, scope)); } catch { return false; }
    if (!hold) return false;
    await this.releaseT(hold, scope, rec.k1);
    return true;
  }
  /** No record: the row is stale (another press freed or dropped it, or the record was evicted or cleared). Never `opened`: the
   *  key's receipt names a session, not its binding, and with no record nothing here says the fork is this computer's. */
  private async missing(scope: OpScope, k1: string): Promise<ForkOutcome> {
    const rd = await this.d.j.readFork(this.d.io, scope, scope.r, k1, null);
    if (rd.v.t === 'unknown' && rd.v.why === 'account') return this.unknown(k1, 'account', false);
    return this.refused('untracked', false);
  }
  /** Whether the record is stored at `sid` for exactly this create key and fork (read afresh). */
  private certified(scope: OpScope, k1: string, sid: string | null, fk: JRec['fk']): boolean {
    if (!sid) return false;
    const lk = this.d.j.lookupK1(scope.h, scope.r, k1, scope.acct);
    return lk.t === 'found' && lk.rec.s === sid && lk.rec.k1 === k1 && sameFk(lk.rec.fk, fk);
  }

  /** T was not free (or Web Locks refused it): read once; never retire, never settle what only T may settle. */
  private async readOnly(scope: OpScope, k1: string, rec0: JRec, refused: boolean, whole: boolean): Promise<ForkOutcome> {
    const rd = await this.d.j.readFork(this.d.io, scope, scope.r, k1, null);
    // T is held (a press waiting for the create's reply, the only thing that names the session's binding, or a Check) or Web Locks
    // refused it: the read may have handed the record to its session, but only a Check that finds T free opens it (moved).
    if (rd.v.t === 'settled' && rd.v.sid !== undefined && this.certified(scope, k1, rd.v.sid, rec0.fk)) return this.unknown(k1, refused ? 'handoff' : 'busy', whole);
    const lk = this.d.j.lookupK1(scope.h, scope.r, k1, scope.acct);
    const next = await this.dispatch(lk, scope, k1, whole);
    if (next !== 'unresolved') return next;
    const same = lk.t === 'found' && sameFk(lk.rec.fk, rec0.fk);
    if (!same) return this.unknown(k1, 'unreadable', whole);
    return this.unknown(k1, refused ? unknownReason(rd.v) : 'busy', whole);
  }

  private async underT(scope: OpScope, k1: string, rec0: JRec, hold: ForkHold, whole: boolean): Promise<ForkOutcome> {
    const { j, io } = this.d;
    const r = scope.r;
    // 1. The record again, under T: still this fork, still unresolved, still in the shown account.
    const lk1 = j.lookupK1(scope.h, r, k1, scope.acct);
    if (lk1.t !== 'found' || lk1.rec.s !== null || lk1.rec.k1 !== k1 || !sameFk(lk1.rec.fk, rec0.fk) || !this.bound()) {
      const o = await this.dispatch(lk1, scope, k1, whole, rec0.fk);
      return o === 'unresolved' ? this.unknown(k1, 'unreadable', whole) : o;
    }
    const rec = lk1.rec;
    // 2. Read the key.
    const rd = await j.readFork(io, scope, r, k1, hold);
    const v = rd.v;
    // The read took time: the account may have moved under it, and nothing below is called for an account that is not shown.
    if (!this.bound()) return this.unknown(k1, 'account', whole);
    if (v.t === 'settled') return this.afterSettled(scope, k1, rec, v, rd.settled, whole, 'gone');
    if (v.t === 'unknown' && v.why === 'inFlight') return this.unknown(k1, 'inFlight', whole);
    const retire = (v.t === 'unknown' && (v.why === 'miss' || v.why === 'allocatedNoSession')) || v.t === 'notAdmitted';
    if (!retire) return this.unknown(k1, unknownReason(v), whole);
    // 3. Retire (the key's fence; nothing admitted can be fenced, and what is found instead is read as such).
    const rt = await j.retireFork(io, hold, scope, r, k1, rec.fk as NonNullable<JRec['fk']>);
    if (rt.t === 'notAdmitted') {
      await j.settle(rt, r);
      return (await this.drop(scope, k1)) ? this.refused('none', whole) : this.unknown(k1, 'notRemembered', whole);
    }
    if (rt.t === 'settled') return this.afterSettled(scope, k1, rec, rt, await j.settle(rt, r), whole, 'gone');
    const ended = endedAsUnavailable(rt);
    if (ended) return this.afterSettled(scope, k1, rec, ended, await j.settle(ended, r), whole, 'unconfirmed');
    return this.unknown(k1, unknownReason(rt), whole);
  }

  /** A settled create: a chat (certified at its session -> opened) or none (the chat is unavailable -> the record goes once the settlement
   *  is kept). `noSession`: the reason when it settled without one. */
  private async afterSettled(scope: OpScope, k1: string, rec: JRec, v: Verdict, settled: Checked['settled'], whole: boolean, noSession: 'gone' | 'unconfirmed'): Promise<ForkOutcome> {
    if (v.sid !== undefined) {
      return settled === 'done' && this.certified(scope, k1, v.sid, rec.fk) ? { k: 'opened', sid: v.sid, k1 } : this.unknown(k1, 'handoff', whole);
    }
    if (settled !== 'done') return this.unknown(k1, 'notRemembered', whole);
    return (await this.drop(scope, k1)) ? this.refused(noSession, whole) : this.unknown(k1, 'notRemembered', whole);
  }
  private async drop(scope: OpScope, k1: string): Promise<boolean> {
    for (let i = 0; i < 3; i++) if (await this.d.j.drop(scope.h, scope.r, null, k1, scope.acct)) return true;
    return false;
  }
}

function rowOf(x: JRec, mine: boolean): ForkRow {
  const bad = !!x.fk?.bad || !x.fk;
  return { k1: x.k1, h: x.h, r: x.r, parent: bad ? null : (x.fk as { s: string }).s, turn: bad ? null : (x.fk as { i: number | null }).i, bad, hidden: !!x.dk?.includes(x.k1), mine, at: x.at };
}
