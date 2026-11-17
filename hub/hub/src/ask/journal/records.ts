// records.ts: the AI tab's stored chats (hub_ai_journal_v1): one RECORD per chat, keyed <handle>|<realm>|<sid> (or
// <handle>|<realm>|create:<k1> before the chat has a session). Records are STATE, not evidence:
//   - A record carries NO request evidence: w, wf, k3, c3, kw, kwf and da are stripped on every write and attached on every read
//     from the request entries (attach), so no whole-record write, merge, eviction or delete can lose a key.
//   - Past JOURNAL_RECS the oldest go, those with no entry first; a chat is then read again from the agent. An unreadable store
//     of entries says nothing, so nothing is evicted.
//   - put/drop each take one update. Unreadable or failed is 'lost'; an unreadable store is never written over.
//   - moveCreate and markUnavailable are the handoffs a settled create makes; they return the `Kept` brand (minted nowhere
//     else), which a create's removal proof needs: the entry never goes before its record has moved.
//   - A fork whose create reply proved another binding leaves a MARKER (`xb`) at create:<k1> in the update that drops it: the key is
//     final. A marker is no chat and no pending fork (no row, no capacity, no target), nothing moves onto it or replaces it, and every
//     Check refuses on it before it reads the key (the by-key receipt carries no binding). A marker is never removed (a forgotten one would
//     let a stale engine's save bring the chat back); MARKS_MAX bounds them by refusing new forks (claimFork 'marks', which counts the
//     forks whose reply may still come too: each may still become one, the `rp` mark below). A marker also names the session the reply made (`xs`, when refuseCreate knows
//     it): that session is barred by its id as well, so a pinned open of it (the agent's sessions list, a link) under a fresh create key
//     neither keeps a chat nor sends a turn. A marker written before `xs` existed bars by its key only.
//   - `rp` (reply pending): claimFork stores it on the fork's record, every write but a marker keeps it (a Check's read that hands the
//     record to its session included), and only one that held the fork's target lock T clears it (clearReplyPending): the press that
//     made the fork once its own reply is settled (it holds T until then), or a Check that took T, which proves that press ended. So
//     a fork handed to its session while its press still waits for the reply counts toward MARKS_MAX until that reply is settled.
import * as L from '../logic';
import type { WriteStore } from '../engine';
import type { AskRecord, AskStore } from '../logic';
import { JOURNAL_KEY, currentAccount, readStore, updateStore } from './storage';
import { mintKept, mintTurnKept, type Kept, type TurnKept } from './proof';
import { lockNameOf, withRecsLock, type ForkHold } from './locks';
import { EVIDENCE } from './evidence';
import { isRec, okHandle } from './shape';
import type { Entry } from './types';

export const JOURNAL_RECS = 64;
/** Forks whose create has no session yet, at most: past it a NEW fork is refused (typed words) instead of an old one being forgotten.
 *  Eviction never takes one of these, so the bound is what keeps the document bounded. */
export const FORKS_MAX = 8;
/** The keys a claim's template is validated with before its real keys are minted (never stored). */
const FORK_PROBE_K1 = 'hx-' + '0'.repeat(32), FORK_PROBE_K2 = 'hx-' + '1'.repeat(32);
/** "Bound elsewhere" markers at most: at it a NEW fork is refused (claimFork 'marks'), never a marker forgotten. */
export const MARKS_MAX = 64;
/** A create:<k1> record that says the fork's session is bound elsewhere (refuseCreate). Not a chat and not a pending fork. */
export const isMark = (r: AskRecord & { xb?: true }): boolean => r.xb === true;
/** A fork whose create is not settled: its record is create:<k1> and names a fork (a stored identity that could not be read counts). */
const unresolvedFork = (r: AskRecord & { xb?: true }): boolean => r.s === null && !!r.fk && !isMark(r);
export const sameFk = (a: AskRecord['fk'], b: AskRecord['fk']): boolean => (!a && !b) || (!!a && !!b && a.s === b.s && a.i === b.i && !a.bad === !b.bad);
export interface JRec extends AskRecord {
  h: string;
  /** k2 not yet paired: a later turn's key stored under the record's earlier turn (put's "a later key keeps the stored t"). While it is
   *  set, the save that names that key's own turn pairs them (the later-turn rule does not fold it); put alone sets and clears it, from the stored record. */
  kp?: true;
  /** The "bound elsewhere" marker (records.ts header): only refuseCreate writes it, on a create:<k1> record that names a fork. */
  xb?: true;
  /** The session a marker's fork made (refuseCreate), barred by id too. Only on a marker. */
  xs?: string;
  /** Reply pending (records.ts header): the press that claimed this fork may still settle its create reply. Never on a marker. */
  rp?: true;
}
type Doc = Record<string, JRec>;
export type PutResult = 'ok' | 'lost';
/** A save's call options, never stored. `admit`: the key the turn this save names was ADMITTED under (the request key the agent's
 *  receipt answered), from the caller that holds that answer; the only evidence that pairs a marked key with a new turn (kp, put). */
export interface PutOpts { admit?: string }
/** What a fork claim did: 'claimed' the record is kept and this tab owns the create; 'join' an unresolved fork of the same computer, realm,
 *  parent and turn already exists (any tab): the caller joins it and spends no key; 'full' too many unresolved forks (or one whose identity
 *  could not be read) for a new one; 'lost' the store did not keep it. */
/** lookupK1: the record of a create key in three states (a read that failed is never "missing"). A marker is `found` with `rec.xb`. */
export type K1Lookup = { t: 'found'; rec: JRec } | { t: 'missing' } | { t: 'unreadable' };
export type ForkClaim = { t: 'claimed'; k1: string; k2: string } | { t: 'join'; rec: JRec } | { t: 'full' } | { t: 'marks' } | { t: 'lost' };
/** What the document says about a fork's key: the record, none (the document reads and holds none), or nothing sure (it cannot be read). */
/** What a first-message claim did: 'ok' the record now carries the claim; 'taken' a turn is known (or the key is not the one asked); 'lost' the store did not keep it. */
export type ClaimResult = 'ok' | 'taken' | 'lost';
/** The durable first-message state of a chat. `K` is the key asked about. */
export type FirstState =
  | { id: 'R0' }                                  // unreadable: the records or the entries cannot be read now
  | { id: 'R1' }                                  // missing: no record for the chat
  | { id: 'R2'; rec: JRec }                       // create, not handed off
  | { id: 'R3'; rec: JRec }                       // create, unavailable
  | { id: 'R4' | 'R5' | 'R6' | 'R7'; rec: JRec; sid: string };  // owed to K / in flight / taken over / turn known

export const recordId = (h: string, r: string, s: string | null, k1: string): string => `${h}|${r}|${s ?? 'create:' + k1}`;
const idOf = (r: JRec): string => recordId(r.h, r.r, r.s, r.k1);

/** The record without its request evidence. */
export function stripEvidence<T extends AskRecord>(r: T): T {
  const out = { ...r } as Record<string, unknown>;
  for (const f of EVIDENCE) delete out[f];
  return out as unknown as T;
}
/** One journal record as stored, or null when any field is not what the journal writes. Also the terminal store's check. */
export function validJRec(x: unknown): JRec | null {
  const base = L.validRec(x);
  if (!base || !isRec(x) || !okHandle(x.h)) return null;
  // The marker is the journal's own field: L.validRec (the dock store's) never reads it, and a document without one is unchanged.
  const xb = x.xb === true && base.s === null && !!base.fk;
  const xs = xb && typeof x.xs === 'string' && x.xs !== '' ? x.xs : null;
  const rp = x.rp === true && !xb && !!base.fk;
  return { ...stripEvidence(base), h: x.h, ...(x.kp === true ? { kp: true as const } : {}), ...(xb ? { xb: true as const } : {}), ...(xs ? { xs } : {}), ...(rp ? { rp: true as const } : {}) };
}
/** The keys a marker holds, as `h|realm|k1`. */
const markedKeys = (d: Doc): Set<string> => new Set(Object.values(d).filter(isMark).map((x) => `${x.h}|${x.r}|${x.k1}`));
/** The sessions a marker names, as `h|realm|sid`. */
const markedSids = (d: Doc): Set<string> => new Set(Object.values(d).filter((x) => isMark(x) && !!x.xs).map((x) => `${x.h}|${x.r}|${x.xs}`));
/** Whether record `r` is a marked key's chat: by its create key, or at a session a marker names. */
const barred = (keys: Set<string>, sids: Set<string>, r: JRec): boolean => keys.has(`${r.h}|${r.r}|${r.k1}`) || (r.s !== null && sids.has(`${r.h}|${r.r}|${r.s}`));
/** The validated document (invalid rows and rows whose id does not match are dropped). */
function parseDoc(raw: unknown): Doc | null {
  if (!isRec(raw)) return null;
  const out: Doc = {};
  for (const id of Object.keys(raw)) {
    if (id === '__proto__') continue;
    const r = validJRec(raw[id]);
    if (r && idOf(r) === id) out[id] = r;
  }
  return out;
}

/** The entries of a chat as scan() shows them: what attach() reads. */
export type EntriesOf = (h: string) => readonly Entry[];

export class Records {
  /** `evidence` reads the entries of a computer (an ok scan's entries; [] when the scan is unreadable). `withEntry` lists the
   *  chats that hold an entry, or null when that cannot be read (nothing is then evicted). */
  constructor(private readonly evidence: EntriesOf, private readonly withEntry: () => ReadonlySet<string> | null, private readonly scan: (h: string) => readonly Entry[] | null) {}

  /** The stored document, or null when it cannot be read (an unreadable store is not an empty one). */
  private docSure(): Doc | null {
    const r = readStore(JOURNAL_KEY);
    if (r.s === 'unreadable') return null;
    if (r.s === 'missing') return {};
    return parseDoc(r.v);
  }

  /** The record with the evidence its entries hold: the pending turn key (w), replaced ones (kw), follow-up keys (k3 with their
   *  command ids), the decisions in flight (da). */
  attach(h: string, rec: AskRecord): AskRecord { return this.attachFrom(this.evidence(h), h, rec); }
  /** The same over entries the caller already holds (an ok scan). */
  attachFrom(entries: readonly Entry[], h: string, rec: AskRecord): AskRecord {
    const out = stripEvidence(rec);
    const es = entries.filter((e) => e.h === h && e.r === rec.r && e.s === rec.s && e.c === rec.k1);
    const turns = es.filter((e) => e.kind === 'turn');
    const pending = turns.find((e) => e.k === rec.k2);
    if (pending) { out.w = true; if (pending.f) out.wf = true; }
    const kw = turns.filter((e) => e.k !== rec.k2 && e.k !== rec.k1);
    if (kw.length) { out.kw = kw.map((e) => e.k); const f = kw.filter((e) => e.f).map((e) => e.k); if (f.length) out.kwf = f; }
    const msgs = es.filter((e) => e.kind === 'message' || e.kind === 'interrupt' || e.kind === 'stop');
    if (msgs.length) {
      out.k3 = msgs.map((e) => e.k);
      const c3: Record<string, string> = {};
      for (const e of msgs) if (e.ci) c3[e.k] = e.ci;
      if (Object.keys(c3).length) out.c3 = c3;
    }
    const da: Record<string, string> = {};
    for (const e of es) if ((e.kind === 'decision' || e.kind === 'answer') && e.g) da[e.g] = e.k;
    if (Object.keys(da).length) out.da = da;
    return out;
  }

  list(): JRec[] {
    const d = this.docSure() ?? {};
    // A marked key's chat is no chat here, wherever its record is (one kept at its session because it holds a turn included): no engine
    // reads it, so none can send another turn to it.
    const keys = markedKeys(d), sids = markedSids(d);
    return Object.values(d).filter((r) => !barred(keys, sids, r)).map((r) => ({ ...this.attach(r.h, r), h: r.h }));
  }
  find(h: string, realm: string, sid: string): JRec | null {
    const d = this.docSure() ?? {};
    const r = d[recordId(h, realm, sid, '')];
    return r && !barred(markedKeys(d), markedSids(d), r) ? { ...this.attach(h, r), h } : null;
  }
  findCreate(h: string, realm: string, k1: string): JRec | null {
    const r = (this.docSure() ?? {})[recordId(h, realm, null, k1)];
    return r && !isMark(r) ? { ...this.attach(h, r), h } : null;
  }
  /** The record of create key k1, wherever it is now: create:<k1>, or at the session its create made. */
  byK1(h: string, realm: string, k1: string): JRec | null {
    const r = Object.values(this.docSure() ?? {}).find((x) => x.h === h && x.r === realm && x.k1 === k1 && !isMark(x));
    return r ? { ...this.attach(h, r), h } : null;
  }
  /** The record of create key k1 in three states, never a guess: found; missing (the document was read and holds none); unreadable (it
   *  could not be read, or the shown account is not `acct`). Every decision that depends on "there is no record" reads this, not byK1. */
  lookupK1(h: string, realm: string, k1: string, acct: string): K1Lookup {
    if (!acct || currentAccount() !== acct) return { t: 'unreadable' };
    const d = this.docSure();
    if (d === null) return { t: 'unreadable' };
    // The marker first: a record of the same key still at its session (one that holds a turn) never hides it.
    const all = Object.values(d).filter((x) => x.h === h && x.r === realm && x.k1 === k1);
    const r = all.find(isMark) ?? all[0];
    return r ? { t: 'found', rec: { ...this.attach(h, r), h } } : { t: 'missing' };
  }
  /** The unresolved fork of a target (computer, realm, parent, turn) in the same three states as lookupK1. A bad record (its origin could
   *  not be read) is never a target's. */
  lookupTarget(h: string, realm: string, fk: { s: string; i: number | null }, acct: string): K1Lookup {
    if (!acct || currentAccount() !== acct) return { t: 'unreadable' };
    const d = this.docSure();
    if (d === null) return { t: 'unreadable' };
    const r = Object.values(d).find((x) => unresolvedFork(x) && x.h === h && x.r === realm && !x.fk?.bad && x.fk?.s === fk.s && x.fk?.i === fk.i);
    return r ? { t: 'found', rec: { ...this.attach(h, r), h } } : { t: 'missing' };
  }
  /** Every unresolved fork of the account (any computer, any realm), or null when the document cannot be read or the shown account is not
   *  `acct`. The fork bands list these; reading them changes nothing. */
  forkRecords(acct: string): JRec[] | null {
    if (!acct || currentAccount() !== acct) return null;
    const d = this.docSure();
    if (d === null) return null;
    return Object.values(d).filter((x) => unresolvedFork(x)).map((x) => ({ ...this.attach(x.h, x), h: x.h }));
  }
  /** The forks already at their session that still carry the reply-pending mark (`rp`), in the shown account `acct`, or null when the
   *  document cannot be read. Unresolved forks are not listed: they count as such whatever the mark says. Reading them changes nothing. */
  replyPendingHanded(acct: string): JRec[] | null {
    if (!acct || currentAccount() !== acct) return null;
    const d = this.docSure();
    if (d === null) return null;
    return Object.values(d).filter((x) => x.rp === true && x.s !== null && !isMark(x)).map((x) => ({ ...x }));
  }
  /** Whether create key k1 holds a "bound elsewhere" marker (a document that cannot be read says no). */
  marked(h: string, realm: string, k1: string): boolean {
    return Object.values(this.docSure() ?? {}).some((x) => isMark(x) && x.h === h && x.r === realm && x.k1 === k1);
  }
  /** Whether a marker names session `sid` (a document that cannot be read says no, as `marked`). */
  markedSid(h: string, realm: string, sid: string): boolean {
    return Object.values(this.docSure() ?? {}).some((x) => isMark(x) && x.h === h && x.r === realm && x.xs === sid);
  }
  has(h: string, realm: string, sid: string | null, k1: string): boolean { return !!(this.docSure() ?? {})[recordId(h, realm, sid, k1)]; }

  /** Runs a record-document write under the account's record lock (hub-ai-recs:<acct>, journal/locks.ts: fails closed). The write is the
   *  synchronous `fn`; `lost` is what a write that could not run answers. The lock is defense in depth against a stale whole-document
   *  write by another tab, not a transaction (the browser has no compare-and-set). `alive`: the asker still wants the write; looked at
   *  under the lock, in the same synchronous step as the write, so an asker that stopped while the lock was awaited writes nothing. */
  private async locked<T>(lost: T, fn: (acct: string) => T, expectAcct?: string, alive?: () => boolean): Promise<T> {
    const acct = currentAccount();
    if (!acct || (expectAcct !== undefined && acct !== expectAcct)) return lost;
    const r = await withRecsLock(acct, () => (alive && !alive() ? lost : fn(acct)));
    return r.ran ? r.v : lost;
  }

  /** ONE atomic claim of a fork (computer, realm, parent, turn), inside the record lock and the one document update: another tab's
   *  unresolved fork of the same four is joined (no record, no key spent), the capacity and an unreadable earlier fork refuse, and
   *  otherwise this tab's record is kept before its request leaves. The keys are minted HERE, after the decision (`mint`: the engine's
   *  own keys), so a tab that joins or is refused mints nothing. This is the only way an unresolved fork enters the document. */
  claimFork(h: string, tpl: Omit<AskRecord, 'k1' | 'k2'>, mint: () => { k1: string; k2: string } | null, expectAcct: string): Promise<ForkClaim> {
    const probe = L.validRec({ ...tpl, k1: FORK_PROBE_K1, k2: FORK_PROBE_K2 });
    if (!probe || !probe.fk || probe.fk.bad || probe.s !== null || !okHandle(h)) return Promise.resolve({ t: 'lost' });
    const fk = probe.fk;
    const keep = this.withEntry();
    return this.locked<ForkClaim>({ t: 'lost' }, (acct) => {
      const out: { v: ForkClaim } = { v: { t: 'lost' } };
      const r = updateStore(JOURNAL_KEY, (cur) => {
        out.v = { t: 'lost' };
        if (currentAccount() !== acct) return null;
        const d = cur.s === 'missing' ? {} : parseDoc(cur.v);
        if (d === null) return null;
        // A claim of this computer with NO request entry never left: the entry is written (and read back) before the request is
        // posted, and the owner re-reads its claim under THIS lock after writing it and before it posts (forkHeld). So a claim without an
        // entry that is removed here, under the lock, can never be posted afterwards - whether its owner died, failed to clean up, or is
        // still on its way - and its target is free again. An entry that cannot be read says nothing (nothing is removed).
        const ents = this.scan(h);
        const unsent = (x: JRec): boolean => ents !== null && x.h === h && !ents.some((e) => e.h === h && e.k === x.k1);
        let freed = false;
        const free = (pred: (x: JRec) => boolean): void => {
          for (const id of Object.keys(d)) { const x = d[id] as JRec; if (unresolvedFork(x) && unsent(x) && pred(x)) { delete d[id]; freed = true; } }
        };
        const target = (x: JRec): boolean => x.h === h && x.r === probe.r && !x.fk?.bad && x.fk?.s === fk.s && x.fk?.i === fk.i;
        free(target);
        let open = Object.values(d).filter((x) => unresolvedFork(x));
        const same = open.find(target);
        if (same) { out.v = { t: 'join', rec: same }; return freed ? { set: d } : null; }
        // At the capacity the claims that never left are freed first; a malformed one (its identity could not be read) is never judged.
        if (open.length >= FORKS_MAX) { free((x) => !x.fk?.bad); open = Object.values(d).filter((x) => unresolvedFork(x)); }
        if (open.length >= FORKS_MAX || open.some((x) => x.h === h && x.r === probe.r && x.fk?.bad)) { out.v = { t: 'full' }; return freed ? { set: d } : null; }
        // The markers are never forgotten, so their bound refuses a new fork instead ('marks': nothing to Check, only removing this
        // browser's local data frees it).
        // Every fork whose create reply may still come can become a marker (refuseCreate never refuses for the bound), so they count
        // against it too: the unresolved ones, and those a Check's read already handed to their session while the create's entry is
        // still there or while the press that made them still waits for the reply (`rp`: the entry may be settled by that read first;
        // an entry list that cannot be read counts every handed fork). A claim that never left is freed first, as at FORKS_MAX. Counted
        // per create key: a key's marker and its record still at the session are one.
        const owed = (): number => new Set(Object.values(d).filter((x) => isMark(x) || unresolvedFork(x) || (x.s !== null && !!x.fk && (x.rp === true || keep === null || keep.has(recordId(x.h, x.r, null, x.k1))))).map((x) => `${x.h}|${x.r}|${x.k1}`)).size;
        if (owed() >= MARKS_MAX) free((x) => !x.fk?.bad);
        if (owed() >= MARKS_MAX) { out.v = { t: 'marks' }; return freed ? { set: d } : null; }
        const keys = mint();
        const base = keys ? L.validRec({ ...tpl, ...keys }) : null;
        if (!keys || !base) return freed ? { set: d } : null;
        d[recordId(h, base.r, null, base.k1)] = { ...stripEvidence(base), h, rp: true };
        this.evict(d, recordId(h, base.r, null, base.k1), keep);
        out.v = { t: 'claimed', k1: base.k1, k2: base.k2 };
        return { set: d };
      }, { keepOthers: true });
      if (!(r === 'ok' || (r === 'same' && out.v.t !== 'claimed'))) return { t: 'lost' };
      return out.v.t === 'join' ? { t: 'join', rec: { ...this.attach(h, out.v.rec), h } } : out.v;
    }, expectAcct);
  }

  /** Whether the claim of create key k1 is still stored, read under the record lock (a lock that cannot be taken answers false). The
   *  owner of a claim asks this after its request entry is written and before it posts: a claim freed meanwhile (claimFork) is never posted. */
  forkHeld(h: string, realm: string, k1: string, expectAcct: string): Promise<boolean> {
    return this.locked<boolean>(false, () => {
      const x = (this.docSure() ?? {})[recordId(h, realm, null, k1)];
      return !!x && x.k1 === k1 && unresolvedFork(x);
    }, expectAcct);
  }

  /** Clears the reply-pending mark (`rp`, records.ts header) of create key k1's fork wherever its record is (create:<k1> or its session).
   *  Only one that held that fork's target lock T may (`hold`, checked against the record's own lock name; it may be released by now): the
   *  press that made the fork holds T until its own reply is settled, so having held T proves no reply of that press can still turn the
   *  fork into a marker (a press at its end, or a Check that took T after it). Nothing
   *  else changes. True when no record of the key carries the mark now (none to clear included); a store that cannot be read, another
   *  account, a hold of another target or a refused write keeps the mark (false: it still counts, fail closed). */
  clearReplyPending(hold: ForkHold, h: string, realm: string, k1: string, expectAcct: string): Promise<boolean> {
    return this.locked<boolean>(false, (acct) => {
      let there = false;
      const r = updateStore(JOURNAL_KEY, (cur) => {
        there = false;
        if (currentAccount() !== acct) return null;
        if (cur.s === 'missing') { there = true; return null; }
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const ids = Object.keys(d).filter((id) => { const x = d[id] as JRec; return x.h === h && x.r === realm && x.k1 === k1 && x.rp === true; });
        if (!ids.length) { there = true; return null; }
        for (const id of ids) {
          const { rp: _rp, ...rest } = d[id] as JRec;
          if (hold.name !== lockNameOf(rest, { acct, h, r: realm })) return null;
          d[id] = rest;
        }
        return { set: d };
      }, { keepOthers: true });
      return r === 'ok' || (r === 'same' && there);
    }, expectAcct);
  }

  /** The person hides the row of a fork: k1 joins the record's dismissed keys (dk) and nothing else changes. Only an EXISTING unresolved
   *  fork record with this k1 (and `fk`, when given) is touched - a missing one is never inserted - and a hidden record still counts
   *  toward the capacity and still blocks its target. False: nothing was written. */
  dismissFork(h: string, realm: string, k1: string, expectAcct: string, fk?: AskRecord['fk']): Promise<boolean> {
    const id = recordId(h, realm, null, k1);
    return this.locked<boolean>(false, (acct) => {
      let wrote = false;
      const r = updateStore(JOURNAL_KEY, (cur) => {
        wrote = false;
        if (currentAccount() !== acct || cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        const x = d?.[id];
        if (!d || !x || x.k1 !== k1 || !unresolvedFork(x) || (fk !== undefined && !sameFk(x.fk, fk))) return null;
        wrote = true;
        if ((x.dk ?? []).includes(k1)) return null;
        d[id] = { ...x, dk: [...(x.dk ?? []), k1].slice(-L.K3_MAX) };
        return { set: d };
      }, { keepOthers: true });
      return wrote && (r === 'ok' || r === 'same');
    }, expectAcct);
  }

  /** Stores the chat's record (evidence stripped). A record whose sid is now known replaces its create:<k1> record in the same
   *  write. Two rules at this boundary: a stored non-null `t` (and its `ph`) is never put back to null by a
   *  stale row, and an at-session record with a null `t` is never CREATED here (it comes only from moveCreate) - a missing
   *  first-message record is not rebuilt from memory. */
  put(h: string, rec: AskRecord, opts?: PutOpts): Promise<PutResult> {
    const base = L.validRec(rec);
    if (!base || !okHandle(h)) return Promise.resolve('lost');
    const row: JRec = { ...stripEvidence(base), h };
    const keep = this.withEntry();
    return this.locked<PutResult>('lost', (acct) => {
      let refused = false;
      const r = updateStore(JOURNAL_KEY, (cur) => {
        refused = false;
        // Another account shown now, or a document that is not a record document: nothing is written, and nothing is kept.
        if (currentAccount() !== acct) { refused = true; return null; }
        const d = cur.s === 'missing' ? {} : parseDoc(cur.v);
        if (d === null) { refused = true; return null; }
        // The record of this chat WHEREVER it is now (create:<k1> or its session): one chat, one record. A stale create-shaped save after
        // the handoff folds into the session record; a second session for the key, or another key at an existing session, is refused.
        // A key marked bound elsewhere is final: no save recreates its chat, at its create address or at any session.
        if (Object.values(d).some((x) => x.h === h && x.r === base.r && isMark(x) && (x.k1 === base.k1 || (base.s !== null && x.xs === base.s)))) { refused = true; return null; }
        const anywhere = Object.values(d).find((x) => x.h === h && x.r === base.r && x.k1 === base.k1);
        let at = row;
        if (anywhere && anywhere.s !== null) {
          if (row.s !== null && row.s !== anywhere.s) { refused = true; return null; }
          if (row.s === null) at = { ...row, s: anywhere.s };
        }
        const rid = recordId(h, base.r, at.s, base.k1);
        const prev = d[rid];
        if (prev && prev.k1 !== base.k1) { refused = true; return null; }
        // The record this save continues: the one at its address, else (a move from create:<k1> to its session) the one it moves from.
        // Its (t, k2, ph) unit, its fences and its fork identity are the authority either way. An UNRESOLVED fork has no other way in
        // than claimFork: a save of one that is not stored is refused (a stale save never recreates what was removed, and the capacity
        // lives in the claim alone). Nor is a fork already at its session that is not stored (dropped or evicted): its record comes only
        // from claimFork and moveCreate, so one recreated by a stale save would lack its reply-pending mark (`rp`) and its reply could then
        // write a marker past MARKS_MAX. Unlike an ordinary chat (whose save that names a known turn still writes its record again), a
        // tab that still has such a fork open gets 'lost' (not kept) for every journal save of it, and the journal no longer lists it,
        // after a reload too (a dock engine's own store, written before the journal, may still hold its row). Accepted residue: a drop
        // while the press still waits for its reply leaves no record, so a reply that then proves another binding writes no marker.
        const src = prev ?? anywhere;
        if (!src && at.fk) { refused = true; return null; }
        if (at.s !== null && at.t === null && !prev && !d[recordId(h, base.r, null, base.k1)]) { refused = true; return null; }
        // (t, k2) is ONE pair, with its phase: a save never moves one without the other. A save that knows no turn (t null) is a stale
        // copy of what the page last read, so the stored unit wins whole - a stored turn and its key, a stored claim (only
        // claimFirst / turnFenced move k2 while no turn is known). A save that names a turn but pairs it with the wrong key does not
        // move the pair either: a key this record has fenced (dk, na) never comes back as k2 - not a replacement key, and not the CURRENT
        // key while no turn is stored - and one key never names a second turn (another tab's turn learned beside
        // this page's old key), save a turn admitted under a later key not yet paired (kp, below). A key a later turn legitimately brings
        // changes k2 and keeps the stored t, or both, and passes.
        // A save that moves the chat's record from its other address (src is not the record at the target address) takes the whole unit, a
        // create-shaped source with no turn and no session included: the key and the phase it holds are the chat's, not the saved row's.
        // A save at the address that already holds the record keeps the stored key whatever it is (a create-shaped record included: its
        // key is the chat's first key, a fenced or a new one from a save never replaces it); only its own phase lands.
        // The k2-not-yet-paired mark (kp) is the stored record's, never the saved row's: a later key kept under the stored t sets it; the
        // save that names a new turn beside that key pairs them (the later-turn rule does not fold it) and clears it ONLY when the caller says that turn
        // was admitted under that very key (opts.admit === the stored k2): the mark alone proves only that the stored key moved under the
        // stored t, and another tab's turn learned beside it (a late receipt for an older key, a keyless learn) still folds and keeps it;
        // a save that keeps the pair keeps it; a key this record fenced never pairs; a turnless save neither sets nor clears it; a new pair
        // (both moved) has none.
        const moving = !prev;
        let out: JRec = at;
        let kp = src?.kp === true;
        if (src && at.t === null) {
          out = { ...at, k2: src.k2, ...(src.t !== null || moving ? { t: src.t, ph: src.ph } : {}) };
        } else if (src && at.t !== null) {
          const fenced = (src.dk ?? []).includes(at.k2) || (src.na ?? []).includes(at.k2);
          const pairs = kp && !fenced && opts?.admit === src.k2 && src.t !== null && at.t !== src.t && at.k2 === src.k2;
          if ((fenced && (at.k2 !== src.k2 || src.t === null)) || (!pairs && src.t !== null && at.t !== src.t && at.k2 === src.k2)) out = { ...at, k2: src.k2, t: src.t, ph: src.ph };
          else if (pairs) kp = false;
          else if (src.t !== null && at.t === src.t) { if (at.k2 !== src.k2) kp = true; }
          else kp = false;
        } else kp = false;
        // A fork's identity (k1, s, fk) is ONE unit, whichever address holds it: a save never drops the fork it records, changes its
        // parent or turn, or turns a chat that is not a fork into one. The stored record (at the session, else the create:<k1> one it
        // is moving from) is the authority.
        if (src) {
          const { fk: _fk, ...rest } = out;
          out = { ...rest, ...(src.fk ? { fk: src.fk } : {}) };
        }
        if (kp) out = { ...out, kp: true };
        // Reply pending is the stored record's alone (claimFork sets it, a T holder clears it): a save never sets or clears it.
        delete out.rp;
        if (src?.rp === true) out = { ...out, rp: true };
        const union = (a?: string[], b?: string[]): string[] => [...(a ?? []), ...(b ?? [])].filter((k, i, x) => x.indexOf(k) === i).slice(-L.K3_MAX);
        const dk = union(src?.dk, out.dk);
        const na = union(src?.na, out.na);
        if (na.length) out = { ...out, na };
        if (dk.length) out = { ...out, dk };
        if (out.s !== null) delete d[recordId(h, base.r, null, base.k1)];
        delete d[rid];
        d[rid] = out;
        this.evict(d, rid, keep);
        return { set: d };
      }, { keepOthers: true });
      return r === 'ok' || (r === 'same' && !refused) ? 'ok' : 'lost';
    });
  }
  /** Chat records past the limit go oldest first, those with no stored entry before those with one. A fork whose create is not settled
   *  is never one of them (its key may be the only way back to a chat that was made); FORKS_MAX bounds those. Nor is a fork whose press
   *  may still settle its reply (`rp`): an evicted one would count nowhere, a stale save could bring it back without the mark, and its
   *  reply would then write a marker past MARKS_MAX. MARKS_MAX bounds those (claimFork counts them). */
  private evict(d: Doc, keep: string, withEntry: ReadonlySet<string> | null): void {
    for (;;) {
      // Markers are no chat: they neither count toward JOURNAL_RECS nor are evicted to make room for one (claimFork bounds them).
      const ids = Object.keys(d).filter((k) => !isMark(d[k] as JRec));
      if (ids.length <= JOURNAL_RECS || !withEntry) return;
      let drop: string | null = null;
      const rank = (id: string, x: JRec): number => (withEntry.has(id) ? 1 : 0) * 1e15 + x.at;
      for (const k of ids) {
        if (k === keep || unresolvedFork(d[k] as JRec) || (d[k] as JRec).rp === true) continue;
        if (drop === null || rank(k, d[k] as JRec) < rank(drop, d[drop] as JRec)) drop = k;
      }
      if (drop === null) return;
      delete d[drop];
    }
  }
  /** Removes a chat's record (the engine's definite drop). The entries stay: only a proving read or the person removes one. */
  drop(h: string, realm: string, sid: string | null, k1: string, expectAcct?: string): Promise<boolean> {
    const id = recordId(h, realm, sid, k1);
    return this.locked(false, (acct) => {
      let refused = false;
      const r = updateStore(JOURNAL_KEY, (cur) => {
        refused = false;
        if (currentAccount() !== acct) { refused = true; return null; }
        if (cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) { refused = true; return null; }
        // No record, or the key's marker (not a chat: nothing of the chat is left to drop, and the marker stays).
        if (!d[id] || isMark(d[id] as JRec)) return null;
        // A session address holds the chat that was handed off there: another chat's record is not this drop's to remove.
        if (sid !== null && (d[id] as JRec).k1 !== k1) return null;
        delete d[id];
        return Object.keys(d).length ? { set: d } : { remove: true };
      }, { keepOthers: true });
      return r === 'ok' || (r === 'same' && !refused);
    }, expectAcct);
  }
  private dropSid(h: string, sid: string): Promise<boolean> {
    return this.locked(false, (acct) => {
      let refused = false;
      const r = updateStore(JOURNAL_KEY, (cur) => {
        refused = false;
        if (currentAccount() !== acct) { refused = true; return null; }
        if (cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) { refused = true; return null; }
        let hit = false;
        for (const k of Object.keys(d)) if ((d[k] as JRec).h === h && (d[k] as JRec).s === sid) { delete d[k]; hit = true; }
        if (!hit) return null;
        return Object.keys(d).length ? { set: d } : { remove: true };
      }, { keepOthers: true });
      return r === 'ok' || (r === 'same' && !refused);
    });
  }

  // ---- the handoffs of a settled create ----
  /** The create record of key k1 now names session `sid`. `Kept` only when a record names it now: the update moved the create
   *  record, or the destination record was already there. A store that is missing, corrupt or holds neither record keeps nothing:
   *  the handoff is owed (the engine's own save puts the record, and the retry then finds it). */
  moveCreate(h: string, r: string, k1: string, sid: string, alive?: () => boolean): Promise<Kept | null> {
    const from = recordId(h, r, null, k1), to = recordId(h, r, sid, k1);
    return this.locked<Kept | null>(null, (acct) => {
      let there = false;
      const res = updateStore(JOURNAL_KEY, (cur) => {
        there = false;
        if (currentAccount() !== acct) return null;
        if (cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const rec = d[from], dest = d[to];
        // A key marked bound elsewhere is final: nothing moves to the session, and the handoff has nothing left to do (no record
        // names the session, so no Check certifies it: they refuse on the marker).
        if (rec && isMark(rec)) { there = true; return null; }
        // The destination is certified only when it is THIS chat: the same create key and the same fork identity as the record it
        // replaces. Another chat's record there is a conflict: the source stays and nothing is kept.
        if (!rec) { there = !!dest && dest.k1 === k1; return null; }
        if (dest) {
          if (dest.k1 !== k1 || !sameFk(dest.fk, rec.fk)) return null;
          delete d[from];
          return { set: d };
        }
        delete d[from];
        d[to] = { ...rec, s: sid };
        return { set: d };
      }, { keepOthers: true });
      if (!(res === 'ok' || (res === 'same' && there))) return null;
      return mintKept({ acct, h, r, k1, sid });
    }, undefined, alive);
  }
  /** The create's reply PROVED another binding (realm, computer or owner): the chat's record is removed, never moved to that session. ONE
   *  update removes the record at the create address and this chat's record at the session address when it holds no known turn (the same
   *  `k1`: a binding the engine tests is a function of the record's own address, so every tab of this chat refuses the same reply; another
   *  chat's record there, or one that holds a turn, stays). When either names a FORK, the same update leaves the key's marker at the
   *  create address (records.ts header): the by-key receipt a later Check reads carries no binding, so the marker is what refuses it.
   *  `Kept` certifies exactly: no create-address record but the marker exists, and no record of this chat without a known turn exists at
   *  the session address. Nothing to remove (already removed by the engine's own drop, or a store the last removal emptied) is kept, so an
   *  owed retry whose entry removal failed after the record went still completes; a marker already there is kept the same way. A store
   *  that cannot be read, another account, or a write the store refused keeps nothing (owed): a fork's record then stays as it was. */
  refuseCreate(h: string, r: string, k1: string, sid: string, alive?: () => boolean): Promise<Kept | null> {
    const from = recordId(h, r, null, k1), to = recordId(h, r, sid, k1);
    return this.locked<Kept | null>(null, (acct) => {
      let there = false;
      const res = updateStore(JOURNAL_KEY, (cur) => {
        there = false;
        if (currentAccount() !== acct) return null;
        if (cur.s === 'missing') { there = true; return null; }
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const rec = d[from], dest = d[to];
        const mine = !!dest && dest.k1 === k1 && dest.t === null;
        // The fork this key made: at its create address, or already handed to its session by a Check's read - there even when it
        // holds a known turn, which keeps that record but never the key's chat (list/find hide a marked key's records, put refuses them).
        const fork = rec?.fk ? rec : dest && dest.k1 === k1 && dest.fk ? dest : null;
        const marked = !!rec && isMark(rec);
        if (!mine && (marked || (!rec && !fork))) { there = true; return null; }
        if (rec) delete d[from];
        if (mine) delete d[to];
        if (fork) { const { rp: _rp, ...f } = stripEvidence(fork); d[from] = { ...f, s: null, xb: true, xs: sid }; }
        return Object.keys(d).length ? { set: d } : { remove: true };
      }, { keepOthers: true });
      if (!(res === 'ok' || (res === 'same' && there))) return null;
      return mintKept({ acct, h, r, k1, sid, refused: true });
    }, undefined, alive);
  }
  /** The create's session is unknown and will never be: the chat is marked gone. */
  markUnavailable(h: string, r: string, k1: string, alive?: () => boolean): Promise<Kept | null> {
    const from = recordId(h, r, null, k1);
    return this.locked<Kept | null>(null, (acct) => {
      let there = false;
      const res = updateStore(JOURNAL_KEY, (cur) => {
        there = false;
        if (currentAccount() !== acct) return null;
        if (cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const rec = d[from];
        if (!rec) return null;
        if (rec.ph === 'gone') { there = true; return null; }
        d[from] = { ...rec, ph: 'gone' };
        return { set: d };
      }, { keepOthers: true });
      if (!(res === 'ok' || (res === 'same' && there))) return null;
      return mintKept({ acct, h, r, k1, sid: 'unavailable' });
    }, undefined, alive);
  }

  // ---- the first message ----
  /** What the durable record and entries say about the first message of chat `k1`. Read-only. Only a read taken under
   *  the chat lock authorizes anything; any other read picks a path. `K`: the key asked about (the row's own, or a retyped message's). */
  firstState(h: string, realm: string, k1: string, K: string): FirstState {
    const d = this.docSure();
    const acct = currentAccount();
    const sc = acct ? this.scanEntries(h) : null;
    if (d === null || !acct || sc === null) return { id: 'R0' };
    const create = d[recordId(h, realm, null, k1)];
    const at = Object.values(d).find((r) => r.h === h && r.r === realm && r.k1 === k1 && r.s !== null);
    if (!at) {
      if (!create) return { id: 'R1' };
      const rec = { ...this.attachFrom(sc, h, create), h };
      return create.ph === 'gone' ? { id: 'R3', rec } : { id: 'R2', rec };
    }
    const sid = at.s as string;
    const rec = { ...this.attachFrom(sc, h, at), h };
    if (at.t !== null) return { id: 'R7', rec, sid };
    const turns = sc.filter((e) => e.h === h && e.kind === 'turn' && ((e.r === realm && e.c === k1) || (e.r === realm && e.s === sid)));
    if (turns.length) return { id: 'R5', rec, sid };
    return at.k2 === K && !(at.dk ?? []).includes(K) ? { id: 'R4', rec, sid } : { id: 'R6', rec, sid };
  }
  /** The entries as an ok scan shows them, or null when they cannot be read now. */
  private scanEntries(h: string): readonly Entry[] | null { return this.scan(h); }

  /** The first-message claim of a chat that has a session and no known turn: the chat's current first key
   *  becomes `key` and the key it replaces is dismissed (dk), the phase is 'sending'. `key` null: the current key is only dismissed (the
   *  person dismissed a first message owed elsewhere). 'taken': a turn is known. */
  claimFirst(h: string, r: string, sid: string, k1: string, key: string | null): Promise<ClaimResult> {
    const id = recordId(h, r, sid, k1);
    return this.locked<ClaimResult>('lost', (acct) => {
      let outcome: ClaimResult = 'lost';
      const res = updateStore(JOURNAL_KEY, (cur) => {
        outcome = 'lost';
        if (currentAccount() !== acct) return null;
        if (cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const rec = d[id];
        if (!rec) return null;
        if (rec.t !== null) { outcome = 'taken'; return null; }
        const dk = [...(rec.dk ?? [])];
        // The key the claim moves or dismisses was read under the chat lock with no turn and no entry (R4/R6): it never left, and no gate
        // can send it from now on. That, not the dismissal, is what the record's `na` says.
        const na = [...(rec.na ?? [])];
        const old = rec.k2;
        if (key === null) {
          if (dk.includes(old) && na.includes(old)) { outcome = 'ok'; return null; }
          if (!dk.includes(old)) dk.push(old);
          if (!na.includes(old)) na.push(old);
          d[id] = { ...rec, dk: dk.slice(-L.K3_MAX), na: na.slice(-L.K3_MAX) };
        } else {
          if (rec.k2 === key && rec.ph === 'sending') { outcome = 'ok'; return null; }
          if (old !== key && !dk.includes(old)) dk.push(old);
          if (old !== key && !na.includes(old)) na.push(old);
          d[id] = { ...rec, k2: key, dk: dk.slice(-L.K3_MAX), ...(na.length ? { na: na.slice(-L.K3_MAX) } : {}), ph: 'sending' };
        }
        outcome = 'ok';
        return { set: d };
      }, { keepOthers: true });
      const o = outcome as ClaimResult;
      return res === 'ok' || (res === 'same' && o === 'ok') ? 'ok' : o === 'taken' ? 'taken' : 'lost';
    });
  }

  /** The turn `key` of chat `k1` settled with turn id `turnId`: the record now holds a known turn. `TurnKept` iff the record
   *  has `t !== null` after the write. A missing or unreadable record keeps nothing: the entry's removal is owed. */
  turnKept(h: string, r: string, sid: string, k1: string, key: string, turnId: string, alive?: () => boolean): Promise<TurnKept | null> {
    const id = recordId(h, r, sid, k1);
    return this.locked<TurnKept | null>(null, (acct) => {
      let there = false;
      const res = updateStore(JOURNAL_KEY, (cur) => {
        there = false;
        if (currentAccount() !== acct || cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const rec = d[id];
        if (!rec) return null;
        if (rec.t !== null) { there = true; return null; }
        d[id] = { ...rec, t: turnId, ph: 'working' };
        there = true;
        return { set: d };
      }, { keepOthers: true });
      if (!(res === 'ok' || (res === 'same' && there))) return null;
      return mintTurnKept({ kind: 'turn', acct, h, r, sid, c: k1, k: key });
    }, undefined, alive);
  }
  /** The turn `key` was fenced or refused (it never ran and never will): when the record has no known turn and `key` is its current
   *  first key, `key` joins the dismissed keys. `TurnKept` ('fence') iff the record has a known turn, or the key is dismissed, or
   *  the record does not depend on the key. A missing or unreadable record keeps nothing. */
  turnFenced(h: string, r: string, sid: string, k1: string, key: string, alive?: () => boolean): Promise<TurnKept | null> {
    const id = recordId(h, r, sid, k1);
    return this.locked<TurnKept | null>(null, (acct) => {
      let there = false;
      const res = updateStore(JOURNAL_KEY, (cur) => {
        there = false;
        if (currentAccount() !== acct || cur.s === 'missing') return null;
        const d = parseDoc(cur.v);
        if (d === null) return null;
        const rec = d[id];
        if (!rec) return null;
        if (rec.t !== null || ((rec.dk ?? []).includes(key) && (rec.na ?? []).includes(key)) || rec.k2 !== key) { there = true; return null; }
        d[id] = { ...rec, dk: [...(rec.dk ?? []), key].slice(-L.K3_MAX), na: [...(rec.na ?? []).filter((k) => k !== key), key].slice(-L.K3_MAX) };
        there = true;
        return { set: d };
      }, { keepOthers: true });
      if (!(res === 'ok' || (res === 'same' && there))) return null;
      return mintTurnKept({ kind: 'fence', acct, h, r, sid, c: k1, k: key });
    }, undefined, alive);
  }

  /** The store as the engine reads it for ONE conversation: only the record of `sid` (with its evidence), as an AskStore. A write
   *  upserts that record's state and removes it when the engine dropped it. */
  view(h: string, sid: string): WriteStore {
    return {
      // A view answers for the account it was made for and the one currently shown, never a mix: another account's reads are empty and
      // its writes are refused before anything is stored.
      read: (account: string): AskStore => {
        if (!account || account !== currentAccount()) return { v: 1, a: {} };
        const recs = this.list().filter((r) => r.h === h && r.s === sid);
        return { v: 1, a: recs.length && account ? { [account]: recs.map(({ h: _h, ...r }) => r as AskRecord) } : {} };
      },
      // A write is a put/drop under the record lock, so it is ASYNC: the answer is a promise of "kept", never a bare true. A caller that
      // authorizes a send, removes evidence or settles a turn awaits it (engine.ts save()/dropRec).
      write: (account: string, st: AskStore | null, opts?: PutOpts): Promise<boolean> | boolean => {
        if (!account || account !== currentAccount()) return false;
        const list = st && L.own(st.a, account) ? st.a[account] ?? [] : [];
        const mine = list.find((r) => r.s === sid);
        if (!mine) return this.dropSid(h, sid);
        return this.put(h, mine, opts).then((r) => r === 'ok');
      },
    };
  }
}
