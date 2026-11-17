// Custody of the approver-lease capabilities.
//
// A capability lives only in `Cap.#value`. It enters only through a lease ticket's `answer` hook (which blanks every wire copy
// first) and leaves only through the ticket's `spend`, as the header core puts on the call. It is never in state, subscribers,
// storage, the journal, logs or a reply object. A Cap leaves custody only with a proof that names the capability itself
// (409 invalid on a request that carried it; 2xx on its release) or by `abandon` on an account change. Time, order, epoch,
// generation, a 410 or a read never remove one.
//
// This module is the lease issuer: `check` is pure, `spend` stamps the send anchor, `answer` captures, `settled` closes the
// attempt (and computes the deadline anchor before it closes), then tells the machine (approver.ts) what the outcome means.
import { agent, claimTickets, outcomeOf, type Ticket, type TicketBind, type TicketCall, type TicketIssuer, type TicketSettled } from '@core';
import type { providers } from '@core';

type Settled<T> = providers.Settled<T>;

/** Core's settled hook hands the issuer the call's raw outcome (the error as the caller would catch it); the machine reads the
 *  same normalised outcome every settled Api gives (providers/call.ts: kind from `outcomeOf` as a change, a lower-case code, a
 *  numeric status). A lease call is always a change. */
export function replyOf(r: TicketSettled): Settled<unknown> {
  if (r.ok) return { ok: true, body: r.body };
  const x = (r.err && typeof r.err === 'object' ? r.err : {}) as Record<string, unknown>;
  return { ok: false, err: { kind: outcomeOf(r.err, true), code: typeof x.code === 'string' ? x.code.toLowerCase() : '', status: typeof x.status === 'number' ? x.status : 0,
    retryAfter: typeof x.retryAfter === 'number' ? x.retryAfter : null, details: {} } };
}

export type Proof = 'released' | 'invalid';
export type Op = 'acquire' | 'patch' | 'release' | 'decide' | 'mint';
/** What a request's answer means to the machine. 'required' is a decision refused for want of a lease. */
export type Class = 'granted' | 'ok' | 'held' | 'invalid' | 'expired' | 'gone' | 'required' | 'unknown';

/** The lease's life (agent-side 10 min), and how far the two browser clocks may disagree before a time reading is unsure. */
export const TTL = agent.APPROVER_TTL_MS;
export const SKEW = 5_000;
/** At most this many extending attempts are remembered per Cap; one more makes the Cap stale at spend. */
export const EXT_MAX = 16;

export interface Clock { mono(): number; wall(): number }
/** `m`/`w`: the two clocks, `gap`: the gap generation, `seq`: the Hub stamp, all taken when a request's ticket was spent. */
export interface Anchor { readonly m: number; readonly w: number; readonly gap: number; readonly seq: number }

export interface Attempt {
  readonly op: Op;
  /** The manager epoch, the shown account and the account counter it was made under (a mismatch fences it). */
  readonly mgr: number;
  readonly acct: string;
  readonly acctEpoch: number;
  /** The record it belongs to (container|sid); null for a mint from a sid-less handle until its answer names the sid. */
  key: string | null;
  readonly container: string;
  /** The capability a patch, release or decision carries. */
  cap: Cap | null;
  /** The capability an acquire presents as proof (the cur, else the newest retired one). */
  proof: Cap | null;
  sentSeq: number | null;
  sent: Anchor | null;
  /** The Hub stamp at which closing evidence arrived (the anchor); null while open and for a ghost, for good. */
  doneSeq: number | null;
  /** An extending attempt that may still be run by the agent at any later time: its Cap is stale. */
  ghost: boolean;
  /** The deadline a 2xx PATCH proves, computed in `settled` before the attempt closes (null when it proves none). */
  anchor: Anchor | null;
  granted: Cap[];
  explicit: boolean;
  /** Mint tickets only: whether the call may still go (handle open, sid, body.attach). */
  guard?: (call: TicketCall) => boolean;
  /** Whether `settled` ran for it. */
  settled: boolean;
}

let read: (c: Cap) => string = () => '';
export class Cap {
  readonly #value: string;
  readonly key: string;
  readonly acct: string;
  /** The Hub stamp at which it arrived. */
  readonly seq: number;
  /** The deadline anchor: a point at which the agent's expiry was at least TTL away. null = unknown. */
  at: Anchor | null = null;
  role: 'cur' | 'probe' | 'retire' = 'cur';
  lapsed = false;
  stale = false;
  okSeq: number | null = null;
  ext: Attempt[] = [];
  patch: Attempt | null = null;
  del: Attempt | null = null;
  dels = 0;
  tries = 0;
  removed = false;
  /** The lease generation its answer named (display and decision data, never a proof). */
  generation: number | null = null;
  constructor(value: string, key: string, acct: string, seq: number) { this.#value = value; this.key = key; this.acct = acct; this.seq = seq; }
  static { read = (c) => c.#value; }
  toJSON(): string { return '[capability]'; }
  toString(): string { return '[capability]'; }
}

/** Sure life: an anchor from requests sent after the last gap, inside TTL − SKEW on both clocks, which agree within SKEW. */
export function sureNow(c: Cap, clock: Clock, gapGen: number): boolean {
  const a = c.at;
  if (!a || a.gap !== gapGen) return false;
  const dm = clock.mono() - a.m, dw = clock.wall() - a.w;
  return dm < TTL - SKEW && dw < TTL - SKEW && Math.abs(dw - dm) <= SKEW;
}

/** The anchor: the earliest send among the requests that may have been processed last, as the proof of a 2xx PATCH. Pure. */
export function anchorOf(c: Cap, a: Attempt, gapGen: number): Anchor | null {
  // the oldest request carrying c that was sent before a and whose answer had not arrived when a was sent
  const r = c.ext.find((x) => x.sentSeq! < a.sentSeq! && (x.doneSeq === null || x.doneSeq > a.sentSeq!));
  const at = r ? r.sent! : a.sent!;
  return at.gap === gapGen ? at : null;
}

const codeOf = (r: Settled<unknown>): string => (r.ok ? '' : r.err.code);
const statusOf = (r: Settled<unknown>): number => (r.ok ? 200 : r.err.status);
const kindOf = (r: Settled<unknown>): string => (r.ok ? 'done' : r.err.kind);
const LEASE_REFUSAL = new Set(['approver_lease_invalid', 'approver_lease_expired', 'approver_lease_required']);

/** Closing evidence per operation, an allow-list; false = the agent may still run the request later (a ghost). */
export function closes(op: Op, r: Settled<unknown>): boolean {
  // A decision's documented success is `{status:"ok"}`; any other 2xx body (HTTP 202 pending, `{pending:true}`) says it was accepted but
  // not yet applied, so the agent may still touch the lease later with an earlier time sample: a ghost.
  if (r.ok) return op !== 'decide' || (!!r.body && typeof r.body === 'object' && (r.body as { status?: unknown }).status === 'ok');
  const k = kindOf(r);
  if (k === 'not_sent') return true;
  if (k === 'pending') return false;
  const st = statusOf(r), code = codeOf(r);
  if (op === 'patch') return st === 400 || st === 404 || (st === 409 && code === 'approver_lease_invalid') || (st === 410 && code === 'approver_lease_expired');
  if (op === 'decide') return LEASE_REFUSAL.has(code);
  return true;
}

/** The allow-list reading of an answer. Everything else (not sent, dead context, timeout, 5xx, 400, malformed) is unknown. */
export function classify(op: Op, r: Settled<unknown>, a: Attempt): Class {
  // a grant counts for the attempt only when it entered the attempt's own record (a foreign-session grant is the other record's)
  if (r.ok) return op === 'acquire' || op === 'mint' ? (a.granted.some((g) => a.key === null || g.key === a.key) ? 'granted' : 'ok') : 'ok';
  if (kindOf(r) === 'pending') return 'unknown';
  const st = statusOf(r), code = codeOf(r);
  if (st === 409 && code === 'approver_lease_held' && op === 'acquire') return 'held';
  if (st === 409 && code === 'approver_lease_invalid') return 'invalid';
  if (st === 410 && code === 'approver_lease_expired') return 'expired';
  if (op === 'decide' && code === 'approver_lease_required') return 'required';
  if (st === 404 && code === 'not_found' && (op === 'acquire' || op === 'patch')) return 'gone';
  return 'unknown';
}

export interface Custody {
  /** The Hub stamp: a counter that only grows. */
  stamp(): number;
  /** A new attempt under the current manager epoch and account. */
  attempt(op: Op, o: { container: string; key: string | null; cap?: Cap | null; proof?: Cap | null; explicit?: boolean; guard?: (call: TicketCall) => boolean }): Attempt;
  ticket(a: Attempt, bind: TicketBind): Ticket;
  attemptOf(t: Ticket): Attempt | null;
  /** The one removal door; callers: the settle handlers only. */
  remove(c: Cap, proof: Proof): void;
  /** Account listener only: every Cap of the account leaves custody, with no proof. Returns the record keys it touched. */
  abandon(acct: string): readonly string[];
  caps(key: string): readonly Cap[];
  /** Every key with a Cap in custody. */
  keys(): readonly string[];
  /** Whether a Cap is still held. */
  held(c: Cap): boolean;
  /** An attempt that is fenced (another account, account counter or manager epoch): it only blanks and touches nothing. */
  fenced(a: Attempt): boolean;
  /** A call core refused before it was sent, whose `settled` never ran: settles it as not sent (idempotent). */
  settleUnsent(a: Attempt, r: Settled<unknown>): void;
}

export interface CustodyDeps {
  clock: Clock;
  gapGen(): number;
  account(): string;
  acctEpoch(): number;
  /** The manager epoch (reset bumps it; an old epoch's tickets are inert). */
  mgr(): number;
  /** After an unfenced answer was captured and blanked: the machine reads the rest of it (session_id, error, epoch, generation). */
  onAnswer(a: Attempt, raw: unknown): void;
  /** After `settled` closed the attempt: what the outcome means. `removed` is the Cap the outcome's proof removed, if any. */
  onSettled(a: Attempt, r: Settled<unknown>, cls: Class, removed: Cap | null): void;
  /** Tests: another mint function (the real one is core's `claimTickets`). */
  claim?: (kind: 'lease', issuer: TicketIssuer) => (bind: TicketBind) => Ticket;
}

export function createCustody(deps: CustodyDeps): Custody {
  let seq = 0;
  const stamp = (): number => ++seq;
  const held = new Map<string, Cap[]>();
  const attempts = new WeakMap<object, Attempt>();
  const fenced = (a: Attempt): boolean => a.mgr !== deps.mgr() || a.acct !== deps.account() || a.acctEpoch !== deps.acctEpoch();
  const isHeld = (c: Cap | null): c is Cap => !!c && !c.removed && (held.get(c.key) ?? []).includes(c);
  const sureOf = (c: Cap): boolean => sureNow(c, deps.clock, deps.gapGen());

  function remove(c: Cap, _proof: Proof): void {
    const list = held.get(c.key);
    if (list) {
      const next = list.filter((x) => x !== c);
      if (next.length) held.set(c.key, next); else held.delete(c.key);
    }
    c.removed = true;
  }

  function prune(c: Cap): void {
    // A closed attempt leaves once every PATCH sent before its doneSeq is closed or a ghost; a ghost stays until its Cap goes.
    c.ext = c.ext.filter((r) => {
      if (r.doneSeq === null) return true; // open, or a ghost (a ghost never closes)
      return c.ext.some((p) => p.op === 'patch' && p.sentSeq! < r.doneSeq! && p.doneSeq === null && !p.ghost);
    });
  }

  function take(a: Attempt, value: string, key: string): Cap | null {
    const list = held.get(key) ?? [];
    for (const x of list) if (read(x) === value) return null;
    const c = new Cap(value, key, a.acct, stamp());
    // The agent mints after the request is sent: the send anchor bounds the grant's life, unless the request crossed a gap.
    c.at = a.sent && a.sent.gap === deps.gapGen() ? a.sent : null;
    held.set(key, [...list, c]);
    return c;
  }

  const issuer: TicketIssuer = {
    check(t, call) {
      const a = attempts.get(t);
      if (!a || a.sentSeq !== null || fenced(a)) return false;
      // a Cap is only ever sent for its own record: the call's container and session must be the ones the Cap was granted for
      const own = (c: Cap | null): boolean => !!c && c.key === `${call.container}|${call.sid}`;
      switch (a.op) {
        case 'acquire': return a.proof === null || (isHeld(a.proof) && own(a.proof));
        case 'patch': return isHeld(a.cap) && own(a.cap) && (a.cap.role === 'cur' || a.cap.role === 'probe');
        case 'release': return isHeld(a.cap) && own(a.cap) && a.cap.role === 'retire';
        case 'decide': return isHeld(a.cap) && own(a.cap) && a.cap.role === 'cur' && !a.cap.lapsed && sureOf(a.cap);
        case 'mint': return a.guard ? a.guard(call) : true;
      }
    },
    spend(t) {
      const a = attempts.get(t);
      if (!a) return null;
      a.sentSeq = stamp();
      a.sent = { m: deps.clock.mono(), w: deps.clock.wall(), gap: deps.gapGen(), seq: a.sentSeq };
      if ((a.op === 'patch' || a.op === 'decide') && a.cap) {
        if (a.cap.ext.length >= EXT_MAX) a.cap.stale = true; // the 17th is sent but not recorded: the deadline beyond now is unknown
        else a.cap.ext.push(a);
      }
      if (a.op === 'acquire') return a.proof ? read(a.proof) : null;
      if (a.op === 'mint') return null;
      return a.cap ? read(a.cap) : null;
    },
    answer(t, raw) {
      const a = attempts.get(t);
      const values = agent.approverGrantsOf(raw);
      agent.blankApproverGrants(raw); // every copy, always, fenced or not
      if (!a || fenced(a)) return;
      const gen = agent.approverGenerationOf(raw);
      const sid = raw && typeof raw === 'object' ? (raw as { session_id?: unknown }).session_id : undefined;
      // The session the answer names owns the grant, whatever the handle asked for (a bound handle keeps its own session).
      const key = typeof sid === 'string' && sid ? `${a.container}|${sid}` : a.key;
      if (key !== null) for (const v of values) { const c = take(a, v, key); if (c) { c.generation = gen; a.granted.push(c); } }
      deps.onAnswer(a, raw);
    },
    settled(t, tr) {
      const r = replyOf(tr);
      const a = attempts.get(t);
      if (!a || a.settled) return;
      a.settled = true;
      if (fenced(a)) return; // a fenced attempt touches nothing
      const c = a.cap;
      const cls = classify(a.op, r, a);
      // (1) the deadline a 2xx PATCH proves, before the attempt closes and before any pruning
      if (a.op === 'patch' && r.ok && c) a.anchor = anchorOf(c, a, deps.gapGen());
      // (2) close the attempt, or mark it a ghost (its Cap is stale: the agent may still run it)
      if (closes(a.op, r)) a.doneSeq = stamp();
      else { a.ghost = true; if (c && (a.op === 'patch' || a.op === 'decide')) c.stale = true; }
      // (3) prune
      if (c) prune(c);
      // the two proofs, each naming the capability the request carried
      let removed: Cap | null = null;
      const carried = a.op === 'acquire' ? a.proof : c;
      if (cls === 'invalid' && carried && isHeld(carried)) { remove(carried, 'invalid'); removed = carried; }
      else if (a.op === 'release' && r.ok && c && isHeld(c)) { remove(c, 'released'); removed = c; }
      deps.onSettled(a, r, cls, removed);
    },
  };
  const mint = (deps.claim ?? claimTickets)('lease', issuer);
  const tickets = new WeakMap<Attempt, Ticket>();

  return {
    stamp,
    attempt(op, o) {
      return { op, mgr: deps.mgr(), acct: deps.account(), acctEpoch: deps.acctEpoch(), key: o.key, container: o.container, cap: o.cap ?? null, proof: o.proof ?? null,
        sentSeq: null, sent: null, doneSeq: null, ghost: false, anchor: null, granted: [], explicit: o.explicit === true, ...(o.guard ? { guard: o.guard } : {}), settled: false };
    },
    ticket(a, bind) { const t = mint(bind); attempts.set(t, a); tickets.set(a, t); return t; },
    attemptOf: (t) => attempts.get(t) ?? null,
    remove,
    abandon(acct) {
      const keys: string[] = [];
      for (const [key, list] of [...held]) {
        const mine = list.filter((c) => c.acct === acct);
        if (!mine.length) continue;
        keys.push(key);
        for (const c of mine) { c.removed = true; }
        const rest = list.filter((c) => c.acct !== acct);
        if (rest.length) held.set(key, rest); else held.delete(key);
      }
      return keys;
    },
    caps: (key) => held.get(key) ?? [],
    keys: () => [...held.keys()],
    held: (c) => isHeld(c),
    fenced,
    settleUnsent(a, r) { const t = tickets.get(a); if (t && !a.settled) issuer.settled!(t, r); },
  };
}
