// recover.ts: what proves an unsettled request's outcome after its own reply was lost. It reads by an id,
// and reads and retires BY KEY.
//   - observe(io, ev): a gate-closure or command frame the engine has already matched to its own mirror. Only entries whose
//     container is this io's destination and whose account is the shown one are selected; a closure proves the gate CLOSED
//     (never whose decision applied), a command frame settles only through the command id THIS page holds.
//   - checkById(io, h, k): one read by an id the attempt's own reply gave (`refs`), through the io of the entry's destination.
//     No id, no read: the verdict is unknown.
//   - check(io, h, k): the recovery of one unsettled request by its KEY: after a reload, in another tab, or with the replay gate shut
//     this is the only thing that runs (never a resend). It reads by key; a read MISS proves nothing, so a miss is followed by a retire
//     (which fences the key durably and never runs the request) only when this page has no admission of its own for the key and no tab
//     holds the key's send lock (door.ts withFreeSendLock). Create: `in_flight` and an `allocated` row without a session stay unknown,
//     `allocated` with a session settles (the record moves from create:<k1> to it), `admitted:"unknown"` stays unknown.
//   - readFork / retireFork: the same read and retire for the create key of a FORK, which only a holder of the fork's target
//     lock T may complete. The generic path above refuses a key whose record names a fork, or whose record
//     cannot be read, before any network call (byKey).
// Every verdict goes through settle(); nothing here removes anything.
import { destOf } from '../data';
import type { AgentIO } from '../data';
import { withFreeSendLock, type Door } from './door';
import type { Settled } from './settle';
import type { Entries } from './entries';
import type { ForkRef, ForkHold, OpScope } from './locks';
import { lockNameOf } from './locks';
import type { Records } from './records';
import { sameFk } from './records';
import { classifyClosure, classifyCommandFrame, classifyKeyRead, classifyKeyRetire, classifyReceipt, unknownVerdict, type GateRef, type Result, type Verdict } from './proof';
import type { Settler } from './settle';
import { currentAccount } from './storage';
import type { Entry, Route } from './types';

/** `{type:'gate'}`: the mirror's gateway id and generation (not the frame's own), and the realm and session the frame was for. */
export interface GateClosure { readonly type: 'gate'; readonly r: string; readonly sid: string; readonly gate: GateRef; readonly data: unknown }
export interface CommandEvent { readonly type: 'command'; readonly r: string; readonly sid: string; readonly kind: 'committed' | 'settled'; readonly ids: readonly string[]; readonly state: string }

const isCommand = (e: Entry): boolean => e.kind === 'message' || e.kind === 'interrupt' || e.kind === 'stop';
const routeOf = (e: Entry): Route => (e.kind === 'message' || e.kind === 'interrupt' || e.kind === 'stop' ? 'command' : e.kind === 'decision' ? 'confirm' : e.kind);

export interface Checked { readonly v: Verdict; readonly settled: Settled }

export class Recover {
  constructor(private readonly entries: Entries, private readonly settler: Settler, private readonly door: Door, private readonly records: Records) {}

  observe(io: AgentIO, ev: GateClosure | CommandEvent): void {
    const c = destOf(io);
    if (c === null) return;
    const sc = this.entries.scan();
    if (sc.s !== 'ok' || sc.acct !== currentAccount()) return;
    for (const e of sc.entries) {
      // A frame names its session; a session id is the agent's per realm, so the realm the engine heard it in must match too.
      if (e.ct !== c || e.s !== ev.sid || e.r !== ev.r) continue;
      const id = { acct: sc.acct, h: e.h, k: e.k, route: routeOf(e) };
      if (ev.type === 'gate') {
        const want = ev.gate.kind === 'confirm' ? 'decision' : 'answer';
        if (e.kind !== want || e.g !== ev.gate.id || (e.gn !== undefined && e.gn !== ev.gate.generation)) continue;
        void this.settler.settle(classifyClosure(id, ev.gate, ev.data));
      } else {
        if (!isCommand(e)) continue;
        const cmd = this.door.refOf(sc.acct, e.h, e.k)?.command ?? e.ci;
        const v = classifyCommandFrame(id, cmd, { type: 'command', kind: ev.kind, ids: ev.ids, state: ev.state });
        if (v.t !== 'unknown') void this.settler.settle(v);
      }
    }
  }

  async checkById(io: AgentIO, h: string, k: string): Promise<Verdict> {
    const acct = currentAccount();
    const fallback = (route: Route, why: string): Verdict => unknownVerdict('receipt', { acct, h, k, route }, why);
    const c = destOf(io);
    if (c === null || !acct) return fallback('turn', 'noDestination');
    const sc = this.entries.scan(h);
    if (sc.s !== 'ok' || sc.acct !== acct) return fallback('turn', 'unreadable');
    const e = sc.entries.find((x) => x.k === k);
    if (!e) return fallback('turn', 'noEntry');
    const route = routeOf(e);
    if (e.ct !== c || e.s === null) return fallback(route, 'wrongDestination');
    const ref = this.door.refOf(acct, h, k);
    const sid = e.s;
    let read: () => Promise<unknown>, kind: 'turn' | 'command', idRead: string;
    if (e.kind === 'turn' && ref?.turn) { kind = 'turn'; idRead = ref.turn; read = () => io.receipt(sid, idRead, e.r); }
    else if (isCommand(e) && (ref?.command ?? e.ci)) { kind = 'command'; idRead = (ref?.command ?? e.ci) as string; read = () => io.commandGet(sid, idRead, e.r); }
    else return fallback(route, 'noId');
    // Not sent when the shown account moved before the call's own microtask; after it, the answer describes another account's page.
    const res = await this.callIfShown(acct, read);
    if (res === null || currentAccount() !== acct) return fallback(route, 'account');
    const v = classifyReceipt({ acct, h, k, route }, kind, idRead, res);
    await this.settler.settle(v);
    return v;
  }
  /** One unsettled request, recovered by its key. Never sends it: a read, then (after a miss, when nobody can be sending it) a retire.
   *  `settled` is what the one consumer did with the verdict: 'owed' means a settlement the store did not keep (a create whose chat record
   *  did not move), which the caller must treat as not done. `alive`: the asker still wants it; once false nothing more is sent, retired
   *  or settled and the answer is `unknown` (why `stopped`). It is looked at in each call's own microtask (a read or a retire not yet
   *  dispatched is not sent), under the send lock before the retire, after the answers, and through the settlement (settle.ts: each record
   *  write under its lock, the entry's removal, any owed retry). A retire already dispatched when the asker stops cannot be called back:
   *  its answer is not acted on, the entry stays, and the key it fenced reads notAdmitted to the next check. `readOnly`: a key the agent
   *  is known to have admitted (the caller holds its command id); a miss is then a receipt the agent no longer keeps, which a retire
   *  cannot settle, so nothing is retired and the miss stays unknown. */
  async check(io: AgentIO, h: string, k: string, alive?: () => boolean, readOnly = false): Promise<Checked> {
    // The entry's realm names the create's record; it is read before the call because the entry may be gone by the time the answer is in.
    const sc0 = this.entries.scan(h);
    const realm = sc0.s === 'ok' ? sc0.entries.find((x) => x.k === k)?.r : undefined;
    const v = await this.byKey(io, h, k, alive, readOnly);
    if (alive && !alive()) return { v: unknownVerdict('receipt', { acct: currentAccount(), h, k, route: 'create' }, 'stopped'), settled: 'none' };
    // The key's command id comes from the verdict itself (an authenticated receipt), so a later frame can settle the entry.
    if (v.t === 'admitted' && v.ref?.command) this.door.noteRef(v.acct, v.h, v.k, { command: v.ref.command });
    const settled = await this.settler.settle(v, realm, alive);
    // A settlement Stop overtook is not reported: the asker that stopped gets unknown, as before the settlement.
    if (alive && !alive()) return { v: unknownVerdict('receipt', { acct: currentAccount(), h, k, route: 'create' }, 'stopped'), settled: 'none' };
    return { v, settled };
  }
  /** The create of chat `k1` read BY KEY with no entry needed (the entry may be gone: the person dismissed it in another tab, or a sweep
   *  settled it). A READ, never a retire. A settled create (started or allocated with a session: the record moves; started with none: the
   *  chat is marked unavailable) goes through the one consumer with the realm, so `done` means the record is there NOW; notAdmitted (a
   *  fenced key) is proved by the server; every other answer (a miss, in flight, allocated without a session, admitted "unknown", a failed
   *  read) is unknown and changes nothing. Repeatable: an owed handoff lost on a reload is redone by the next call. */
  async checkCreate(io: AgentIO, h: string, realm: string, k1: string, alive?: () => boolean): Promise<Checked> {
    const acct = currentAccount();
    const id = { acct, h, k: k1, route: 'create' as const };
    const fallback = (why: string): Checked => ({ v: unknownVerdict('receipt', id, why), settled: 'none' });
    if (destOf(io) === null || !acct) return fallback('noDestination');
    const res = await this.callIfShown(acct, () => io.createKeyGet(k1, realm), alive);
    if (alive && !alive()) return fallback('stopped');
    if (res === null || currentAccount() !== acct) return fallback('account');
    const v = classifyKeyRead(id, res);
    const settled = await this.settler.settle(v, realm, alive);
    if (alive && !alive()) return fallback('stopped');
    return { v, settled };
  }
  /** What the agent holds under turn key `k` of session `sid`, read by key and nothing else: ONE GET /sessions/{id}/turns/by-key/{k}.
   *  It needs no entry (the record's own key is asked about), settles nothing, retires nothing, admits nothing and writes no store: a
   *  repeatable read. `settled` = the agent holds a turn under that key (`body.turn_id`); a miss, a fenced key, an unreadable reply or
   *  a failed read are every one a verdict that is not `settled`, and a miss proves nothing (the request may still be on its way). */
  async peekTurn(io: AgentIO, h: string, sid: string, realm: string, k: string): Promise<Verdict> {
    const acct = currentAccount();
    const id = { acct, h, k, route: 'turn' as const };
    if (destOf(io) === null || !acct) return unknownVerdict('receipt', id, 'noDestination');
    const res = await this.callIfShown(acct, () => io.turnByKey(sid, k, realm));
    // Not sent when the shown account moved before the call's own microtask; after it, the answer describes another account's page.
    if (res === null || currentAccount() !== acct) return unknownVerdict('receipt', id, 'account');
    return classifyKeyRead(id, res);
  }
  private async byKey(io: AgentIO, h: string, k: string, alive?: () => boolean, readOnly = false): Promise<Verdict> {
    const acct = currentAccount();
    const fallback = (route: Route, why: string): Verdict => unknownVerdict('receipt', { acct, h, k, route }, why);
    const c = destOf(io);
    if (c === null || !acct) return fallback('turn', 'noDestination');
    const sc = this.entries.scan(h);
    if (sc.s !== 'ok' || sc.acct !== acct) return fallback('turn', 'unreadable');
    const e = sc.entries.find((x) => x.k === k);
    if (!e) return fallback('turn', 'noEntry');
    const route = routeOf(e);
    if (e.ct !== c) return fallback(route, 'wrongDestination');
    // A decision or an answer is not keyed on the agent: its evidence is the gate (observe), never a read by key.
    if (route !== 'create' && route !== 'turn' && route !== 'command') return fallback(route, 'noKeyRead');
    if (route !== 'create' && e.s === null) return fallback(route, 'wrongDestination');
    const id = { acct, h, k, route };
    const sid = e.s as string, realm = e.r;
    // A fork's create key is read and settled only through readFork/retireFork (under its target lock). Before any call: a key whose
    // record names a fork, or a record store that cannot be read, makes no read and settles nothing here, whatever the answer would be.
    const forkGuard = (): Verdict | null => {
      if (route !== 'create') return null;
      const lk = this.records.lookupK1(h, realm, k, acct);
      if (lk.t === 'unreadable') return fallback(route, 'recordsUnreadable');
      return lk.t === 'found' && lk.rec.fk ? fallback(route, 'forkKey') : null;
    };
    const barred = forkGuard();
    if (barred) return barred;
    const get = (): Promise<unknown> => route === 'create' ? io.createKeyGet(k, realm) : route === 'turn' ? io.turnByKey(sid, k, realm) : io.commandByKey(sid, k, realm);
    const retire = (): Promise<unknown> => route === 'create' ? io.createKeyRetire(k, realm) : route === 'turn' ? io.turnKeyRetire(sid, k, realm) : io.commandKeyRetire(sid, k, realm);
    // Each call is made only if the account is still shown, and the asker still wants it, in the call's own microtask (callIfShown:
    // null, nothing sent); the shown account moving while a call was out means the answer describes another account's page.
    const call = (f: () => Promise<unknown>): Promise<Result | null> => this.callIfShown(acct, f, alive);
    const moved = (): boolean => currentAccount() !== acct;
    const stopped = (): boolean => !!alive && !alive();
    const read = await call(get);
    if (stopped()) return fallback(route, 'stopped');
    if (read === null || moved()) return fallback(route, 'account');
    let v = classifyKeyRead(id, read);
    if (v.t === 'unknown' && v.why === 'miss' && !readOnly) {
      // A miss proves nothing (the request may still be on its way). It is settled only by a retire, and only when nobody can be sending it.
      const held = unknownVerdict('retire', id, 'heldElsewhere');
      if (this.door.holds(acct, h, k)) return held;
      const out = await withFreeSendLock(k, async () => {
        // Under the lock: this page's own admission and the entry are looked at again, and the asker must still want it.
        if (moved()) return fallback(route, 'account');
        if (alive && !alive()) return fallback(route, 'stopped');
        if (this.door.holds(acct, h, k)) return held;
        const barredNow = forkGuard();
        if (barredNow) return barredNow;
        const again = this.entries.scan(h);
        if (again.s !== 'ok' || again.acct !== acct || !again.entries.some((x) => x.k === k)) return fallback(route, 'noEntry');
        const res = await call(retire);
        if (stopped()) return fallback(route, 'stopped');
        return res === null || moved() ? fallback(route, 'account') : classifyKeyRetire(id, res);
      });
      v = out.ran ? out.v : held;
    }
    return v;
  }
  /** One io call for the account `acct`, made in its own microtask: `null` (and nothing called) when the shown account is no longer `acct`
   *  at that moment, or the asker no longer wants it (`alive`), else the call's result or the error it threw. */
  private async callIfShown(acct: string, f: () => Promise<unknown>, alive?: () => boolean): Promise<Result | null> {
    return Promise.resolve().then(async (): Promise<Result | null> => {
      if (currentAccount() !== acct || (alive && !alive())) return null;
      try { return { ok: true, b: await f() }; } catch (x) { return { ok: false, e: x }; }
    });
  }
  /** The create key of a fork read ONCE (a read, never a retire). A settled create with a session is a handoff: the one consumer moves
   *  the record (no T is needed to move it). A settled create WITHOUT a session (the chat is unavailable) is settled only by a
   *  holder of T (`hold`); without it the verdict is reported and nothing is settled. A read that says retired, or anything unknown,
   *  settles nothing: the entries and the record stay as they are. */
  async readFork(io: AgentIO, scope: OpScope, realm: string, k1: string, hold: ForkHold | null): Promise<Checked> {
    const id = { acct: scope.acct, h: scope.h, k: k1, route: 'create' as const };
    const fallback = (why: string): Checked => ({ v: unknownVerdict('receipt', id, why), settled: 'none' });
    if (destOf(io) === null || !scope.acct) return fallback('noDestination');
    if (currentAccount() !== scope.acct) return fallback('account');
    // A key marked bound elsewhere is never read: its receipt names a session, not the binding the marker proved (records.ts).
    const mk = this.records.lookupK1(scope.h, realm, k1, scope.acct);
    if (mk.t === 'found' && mk.rec.xb) return fallback('elsewhere');
    // The call runs in a later microtask than the guard above: the shown account is looked at again in the call's own turn, and a page
    // that moved in between calls nothing (`null`).
    const res = await this.callIfShown(scope.acct, () => io.createKeyGet(k1, realm));
    if (res === null || currentAccount() !== scope.acct) return fallback('account');
    const v = classifyKeyRead(id, res);
    if (v.t !== 'settled' || (v.sid === undefined && !hold)) return { v, settled: 'none' };
    return { v, settled: await this.settler.settle(v, realm) };
  }
  /** The retire of a fork's create key, by the holder of its target lock T (`hold`; null: T was not free, and nothing is called). It runs
   *  only inside the key's free send lock, and under both locks looks again: the account, this page's own admission, and the record
   *  (found, still unresolved, this k1, this fork, and the very lock `hold` holds). Anything else retires nothing. */
  async retireFork(io: AgentIO, hold: ForkHold | null, scope: OpScope, realm: string, k1: string, fk: ForkRef): Promise<Verdict> {
    const id = { acct: scope.acct, h: scope.h, k: k1, route: 'create' as const };
    const no = (why: string): Verdict => unknownVerdict('retire', id, why);
    if (!hold) return no('heldElsewhere');
    if (destOf(io) === null || !scope.acct) return no('noDestination');
    const moved = (): boolean => currentAccount() !== scope.acct;
    if (moved()) return no('account');
    const out = await withFreeSendLock(k1, async () => {
      if (moved()) return no('account');
      if (this.door.holds(scope.acct, scope.h, k1)) return no('heldElsewhere');
      const lk = this.records.lookupK1(scope.h, realm, k1, scope.acct);
      if (lk.t === 'unreadable') return no('unreadable');
      if (lk.t !== 'found' || lk.rec.xb || lk.rec.s !== null || lk.rec.k1 !== k1 || !sameFk(fk, lk.rec.fk) || lockNameOf(lk.rec, scope) !== hold.name) return no('notTracked');
      const res = await this.callIfShown(scope.acct, () => io.createKeyRetire(k1, realm));
      return res === null || moved() ? no('account') : classifyKeyRetire(id, res);
    });
    return out.ran ? out.v : no('heldElsewhere');
  }
}
