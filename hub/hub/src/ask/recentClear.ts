// recentClear.ts: "Clear list" for the Ask dock's Recent popover. Clear HIDES dock references: it never
// deletes a session, a journal entry or a record of the journal, and touches only hub_ask_v1. A reference is a candidate only when every
// check below PROVES the conversation finished; anything unknown or unreadable keeps it.
//   0  no dock operation of this tab is queued for it
//   1  store: this account and slot, not the engine's current one, a session set
//   2  journal scan of its computer answers ok
//   3  the attached record: completed or gone, no evidence in flight, no scan entry about it, its create key known, no fork from or to it
//   4  no engine on this account and computer holds its session (lent or not)
//   5  (decisions) covered by 3 and 4: a session no engine holds has no decision unless the journal says so
//   6  a fresh GET /sessions/{id}/state of its own, read as `cleanIdle` (or 404), at plan time and again at confirm time
// The pure parts live here; the engine (planClear / clearRecent) only supplies its state.
import type { AgentIO } from './data';
import { cleanIdle } from './activity';
import * as C from './conv';
import * as L from './logic';
import type { AskRecord, AskStore } from './logic';
import type { ClearKey, Journal } from './journal';
import { currentAccount, type Tri } from './journal';

export type { ClearKey };
/** A Clear plan: each candidate's identity at the time of the check, which is the session the server read answered for. */
export interface ClearPlan { account: string; slot: { p: string; c: string; r: string }; gen: number; keys: readonly ClearKey[] }

/** What Clear needs from the engine and the registry. */
export interface ClearEnv {
  account: string;
  handle: string;
  slot: { p: string; c: string; r: string };
  /** The conversation this engine shows now. */
  current: string | undefined;
  j: Journal;
  /** A fresh read of the dock store (the registry's overlay: this tab's queued operations included). */
  read(): AskStore;
  /** Whether any engine of this account and computer (dock or pinned, lent or not) holds the session. */
  inUse(sid: string): boolean;
}

const finished = (ph: string): boolean => ph === 'completed' || ph === 'gone';

/** Checks 0-5 on one stored record, with a fresh journal scan. */
export function stillClearable(env: ClearEnv, rec: AskRecord): boolean {
  const { j, account, handle } = env;
  if (currentAccount() !== account) return false;
  if (rec.p !== env.slot.p || rec.c !== env.slot.c || rec.r !== env.slot.r) return false;
  if (rec.k1 === env.current || !rec.s) return false;
  if (rec.w || rec.kw?.length || rec.k3?.length || (rec.da && Object.keys(rec.da).length) || (rec.u && rec.u === rec.t)) return false;   // old evidence in the stored record itself
  if (j.dockPendingKeys(account).has(rec.k1)) return false;
  if (env.inUse(rec.s)) return false;
  const sc = j.scan(handle);
  if (sc.s !== 'ok' || sc.acct !== account) return false;
  const att = j.attach(handle, rec);
  if (!att || !att.s) return false;
  if (!finished(att.ph)) return false;
  if (att.w || att.kw?.length || att.k3?.length || (att.da && Object.keys(att.da).length) || (att.u && att.u === att.t)) return false;
  if (sc.entries.some((e) => e.c === rec.k1 || e.k === rec.k1 || e.s === att.s)) return false;
  const lk = j.lookupK1(handle, rec.r, rec.k1, account);
  if (lk.t === 'unreadable') return false;
  // The journal's own record of the create key: the same finished session, with no pending or unpaired turn, no evidence in flight.
  if (lk.t === 'found') {
    const x = lk.rec;
    if (x.t === null || x.kp || x.s !== att.s || !finished(x.ph)) return false;
    if (x.w || x.kw?.length || x.k3?.length || (x.da && Object.keys(x.da).length) || (x.u && x.u === x.t)) return false;
  }
  const forks = j.forkRecords(account);
  if (!forks) return false;
  for (const f of forks) {
    if (f.h === handle && f.r === rec.r && f.fk?.bad) return false;          // its parent is unknown: nothing on this computer and realm is safe
    if (f.fk && f.fk.s === att.s) return false;                            // a fork from this conversation
    if (f.k1 === rec.k1) return false;                                     // this conversation is itself a fork
  }
  return true;
}

/** The candidates of checks 0-5, newest first (the order the store holds). */
export function clearCandidates(env: ClearEnv): ClearKey[] {
  const out: ClearKey[] = [];
  for (const rec of C.convsFor(env.read(), env.account, env.slot)) {
    if (stillClearable(env, rec)) out.push({ k1: rec.k1, p: rec.p, c: rec.c, r: rec.r, s: rec.s as string });
  }
  return out;
}

/** Check 6: the keys whose session answers cleanly idle (or 404, gone) to a read of its own. No cap; at most `limit` reads at once; a read
 *  that fails, times out or says anything else keeps the key. `alive` ends the work (nothing more is read) when the plan is dropped. */
export async function idleKeys(io: AgentIO, keys: readonly ClearKey[], alive: () => boolean, limit = 4): Promise<ClearKey[]> {
  const ok = new Array<boolean>(keys.length).fill(false);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (alive()) {
      const i = next++;
      if (i >= keys.length) return;
      const k = keys[i] as ClearKey;
      try { ok[i] = cleanIdle(await io.state(k.s, k.r), k.s); }
      catch (e) { ok[i] = L.isObj(e) && e.status === 404; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, keys.length) }, () => worker()));
  return alive() ? keys.filter((_, i) => ok[i]) : [];
}

/** What a Clear came to. */
export type ClearOutcome =
  | { t: 'done'; removed: number }                  // removed and re-read
  | { t: 'same' }                                   // nothing left to remove: the list changed meanwhile
  | { t: 'unreadable' | 'full' | 'account' | 'refused' | 'stale' }   // nothing written (stale: the plan was dropped)
  | { t: 'none' }                                   // an uncertain write that did not land
  | { t: 'some'; removed: number }                  // an uncertain write that landed in part
  | { t: 'unconfirmed'; keys: readonly ClearKey[] };   // an uncertain write that could not be checked; `keys` are the ones submitted to the write (Check again reads these)

/** The verification read after an uncertain write (`failed`, or a throw): one `legacyRead`'s tri-state against the confirmed keys. The
 *  caller displays `base` through the dock's overlay so journal-only conversations stay listed. `acct` differing from the confirmed account
 *  is `unreadable`: that read says nothing about these keys. */
export function judgeVerification(account: string, keys: readonly ClearKey[], read: Tri<readonly AskRecord[]>): { out: ClearOutcome; base: AskStore | null } {
  if (read.s === 'unreadable' || read.acct !== account) return { out: { t: 'unconfirmed', keys }, base: null };
  const list: readonly AskRecord[] = read.s === 'ok' ? read.v : [];
  const gone = keys.filter((k) => !list.some((r) => C.sameRec(r, k)));
  const base: AskStore = { v: 1, a: read.s === 'ok' ? { [account]: [...list] } : {} };
  if (gone.length === keys.length) return { out: { t: 'done', removed: gone.length }, base };
  if (gone.length === 0) return { out: { t: 'none' }, base };
  return { out: { t: 'some', removed: gone.length }, base };
}
