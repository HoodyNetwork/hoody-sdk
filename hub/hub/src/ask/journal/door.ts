// door.ts: the send door. The ONLY way a journaled POST (create, turn,
// follow-up, stop, decision, answer) leaves the page:
//
//   mint(route)   a key, recorded as minted in this Journal instance (only the instance that minted a key can admit it)
//   admit(op,tok) synchronous: ask for the key's send lock FIRST (the request is queued before the entry exists, so another tab's
//                 free-lock try, which grants only an unqueued name, sees a sender and retires nothing), then capture op
//                 once, write its entry (one update), read it back, mint the core ticket from the frozen record. The caller gets
//                 an opaque frozen `Admission {key, cancel}` (no op, no ticket).
//   post(a, go)   adopt that send lock (and take a decision's lock), scan again, hand the ticket to `go`; the claimed call's reply is
//                 classified (proof.ts) and settled (settle.ts). Every wait races the admission's cancel.
//   guardIO(io)   the engine's only io: a journaled method finds its ticket, checks it against the admission's op, the account
//                 and the destination, and only then claims the ticket and calls the real io.
//
// States of one admission: W written, A stored and read back, L posting started, R ready, C claimed, P ticket spent, X revoked.
// A revoked admission (W, A, L or R) removes only the value it wrote (neverLeft); a claimed one (C, P) is never removed by a
// cancel: the request may have left.
import { claimTickets, type Ticket, type TicketBind, type TicketCall, type TicketIssuer } from '@core';
import { destOf, routes, shareDest } from '../data';
import type { AgentIO } from '../data';
import * as L from '../logic';
import type { Entries } from './entries';
import { nameOf } from './entries';
import { sameValue } from './same';
import { classifyReply, neverLeft, unknownVerdict, type ReplyCtx, type Verdict } from './proof';
import type { Settled, Settler } from './settle';
import { currentAccount } from './storage';
import { okHandle, okRealm, seg } from './shape';
import { holdLock, holdStrict, holdChatLock, withRecsLock, chatLockName, recsLockName, locks, LOCKABLE, type Hold, type ChatHold } from './locks';
import type { Entry, Ident, NotSent, NotSentWhy, Op, Route } from './types';

/** What a claimed call settled to, once its reply is classified AND its settlement ran (never rejects). */
export interface Late { v: Verdict; settled: Settled }
/** `settled`: what the settlement of `v` returned ('owed' when it threw, 'none' when the cancel came first). `late` (only after a cancel
 *  that found the call claimed): the call's own settlement, which arrives after this outcome. */
export type Outcome = NotSent | { kind: 'sent'; v: Verdict; settled: Settled; late?: Promise<Late> };
/** Opaque and frozen: the caller can only cancel it. */
export interface Admission { readonly key: string; cancel(): void }

// ---- the send token ----
/** One send's cancel token: cancel() ends every wait of that send at once. */
export class SendToken {
  private subs = new Set<() => void>();
  private gone = false;
  get cancelled(): boolean { return this.gone; }
  onCancel(f: () => void): void { if (this.gone) f(); else this.subs.add(f); }
  cancel(): void {
    if (this.gone) return;
    this.gone = true;
    const subs = [...this.subs];
    this.subs.clear();
    for (const f of subs) { try { f(); } catch { /* a listener never blocks the others */ } }
  }
}

// ---- Web Locks ----
export { holdLock, holdStrict, holdChatLock, withRecsLock, chatLockName, recsLockName, type Hold, type ChatHold };
export const sendLockName = (key: string): string => `hub-ai-send:${key}`;
export const decideLockName = (h: string, r: string, sid: string): string => `hoody-agent-decide:${h}|${r}|${sid}`;
/** Whether any tab holds the key's send lock now. Unknown (no Web Locks, or the query failed) reads as held: a key is retired
 *  only when nobody can hold it. */
export function sendHeld(key: string): Promise<boolean> {
  const l = locks();
  if (!l || !LOCKABLE.test(sendLockName(key))) return Promise.resolve(true);
  try {
    return Promise.resolve(l.request(sendLockName(key), { ifAvailable: true }, (lock) => lock === null)).then((r) => r === true, () => true);
  } catch { return Promise.resolve(true); }
}

/** Runs `fn` while THIS page holds the key's send lock, but only when no tab holds it now (Web Locks `ifAvailable`): the one place a key
 *  is retired from. A tab that starts sending meanwhile waits for the lock and then meets the fence (`*_key_retired`, a definite
 *  refusal), so a live sender is never told "Not sent" by a neighbour while it can still send. 'held': a tab holds the lock, or this page
 *  cannot tell (no Web Locks, a name the browser refuses, a failed query): nothing is run. The lock is released when `fn` settles. */
export function withFreeSendLock<T>(key: string, fn: () => Promise<T>): Promise<{ ran: true; v: T } | { ran: false }> {
  const l = locks();
  if (!l || !LOCKABLE.test(sendLockName(key))) return Promise.resolve({ ran: false });
  const gone = { ran: false } as const;
  try {
    return Promise.resolve(l.request(sendLockName(key), { ifAvailable: true }, (lock) => (lock === null ? gone : fn().then((v) => ({ ran: true as const, v })))))
      .then((r) => (r as { ran: boolean }).ran ? (r as { ran: true; v: T }) : gone, () => gone);
  } catch { return Promise.resolve(gone); }
}

// ---- the op: capture and validate ----
const STR = 's', INT = 'i', BOOL = 'b';
const SCHEMA: Record<Route, ReadonlyArray<readonly [string, string]>> = {
  create: [['acct', STR], ['container', STR], ['h', STR], ['r', STR], ['key', STR]],
  turn: [['acct', STR], ['container', STR], ['h', STR], ['r', STR], ['key', STR], ['sid', STR], ['c', STR], ['files', BOOL]],
  command: [['acct', STR], ['container', STR], ['h', STR], ['r', STR], ['key', STR], ['sid', STR], ['c', STR], ['cmd', STR]],
  confirm: [['acct', STR], ['container', STR], ['h', STR], ['r', STR], ['key', STR], ['sid', STR], ['c', STR], ['gate', STR], ['gen', INT]],
  answer: [['acct', STR], ['container', STR], ['h', STR], ['r', STR], ['key', STR], ['sid', STR], ['c', STR], ['gate', STR], ['gen', INT]],
};
/** What the run's held door admits: no handle and no chat key (the hold stores the request). */
export const HELD_SCHEMA: Record<Route, ReadonlyArray<readonly [string, string]>> = {
  create: [['acct', STR], ['container', STR], ['r', STR], ['key', STR]],
  turn: [['acct', STR], ['container', STR], ['r', STR], ['key', STR], ['sid', STR]],
  command: [['acct', STR], ['container', STR], ['r', STR], ['key', STR], ['sid', STR], ['cmd', STR]],
  confirm: [['acct', STR], ['container', STR], ['r', STR], ['key', STR], ['sid', STR], ['gate', STR], ['gen', INT]],
  answer: [['acct', STR], ['container', STR], ['r', STR], ['key', STR], ['sid', STR], ['gate', STR], ['gen', INT]],
};
const ROUTE_LIST: readonly Route[] = ['create', 'turn', 'command', 'confirm', 'answer'];
/** Reads `x.route` once, then each field its route names exactly once, into a fresh frozen object. null: invalid. */
export function capture(x: unknown, schema: Record<Route, ReadonlyArray<readonly [string, string]>> = SCHEMA): Op | null {
  try {
    if (typeof x !== 'object' || x === null) return null;
    const src = x as Record<string, unknown>;
    const route = src.route;
    if (typeof route !== 'string' || !(ROUTE_LIST as readonly string[]).includes(route)) return null;
    const out: Record<string, unknown> = { route };
    for (const [f, ty] of schema[route as Route]) {
      const v = src[f];
      if (ty === STR) { if (typeof v !== 'string' || v === '') return null; }
      else if (ty === INT) { if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null; }
      else if (typeof v !== 'boolean') return null;
      out[f] = v;
    }
    // An interrupt's text digest rides in memory beside the op (valid() requires it there and nowhere else).
    if (route === 'command' && out.cmd === 'interrupt' && own(src, 'td')) out.td = src.td;
    return Object.freeze(out) as unknown as Op;
  } catch { return null; }
}
const KEY32 = /^hx-[0-9a-f]{32}$/, KEY24 = /^hx-[0-9a-f]{24}$/, TD = /^[0-9a-f]{32}$/;
const FNV_PRIME = 0x100000001b3n, MASK64 = 0xffffffffffffffffn;
const fnv64 = (bytes: Uint8Array, basis: bigint): string => {
  let h = basis;
  for (const b of bytes) h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK64;
  return h.toString(16).padStart(16, '0');
};
/** 128 bits (two FNV-1a halves over the UTF-16 code units, two bytes each) of an interrupt's text: what the ticket binds. Code units, not
 *  UTF-8: TextEncoder turns an unpaired surrogate into U+FFFD, so two different strings would share a digest. It guards against a call
 *  that is not the one admitted (a bug), not against an attacker, so a plain digest does; nothing stores it. */
export function textDigest(text: string): string {
  const b = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) { const u = text.charCodeAt(i); b[2 * i] = u >> 8; b[2 * i + 1] = u & 0xff; }
  return fnv64(b, 0xcbf29ce484222325n) + fnv64(b, 0x84222325cbf29ce4n);
}
function valid(p: Op): boolean {
  if (!okHandle(p.h) || !okRealm(p.r) || !seg(p.container)) return false;
  switch (p.route) {
    case 'create': return KEY32.test(p.key);
    case 'turn': return KEY32.test(p.key) && seg(p.sid) && KEY32.test(p.c);
    case 'command':
      return KEY32.test(p.key) && seg(p.sid) && KEY32.test(p.c) && (p.cmd === 'message' || p.cmd === 'stop' || (p.cmd === 'interrupt' && typeof p.td === 'string' && TD.test(p.td)));
    default: return KEY24.test(p.key) && seg(p.sid) && KEY32.test(p.c) && seg(p.gate);
  }
}
function entryOf(p: Op, at: number): Entry {
  const e: Entry = {
    k: p.key,
    kind: p.route === 'command' ? p.cmd : p.route === 'confirm' ? 'decision' : p.route,
    h: p.h, r: p.r, s: p.route === 'create' ? null : p.sid, c: p.route === 'create' ? p.key : p.c, ct: p.container, at,
  };
  if (p.route === 'confirm' || p.route === 'answer') { e.g = p.gate; e.gn = p.gen; }
  if (p.route === 'turn' && p.files) e.f = 1;
  return e;
}

// ---- matching a call against an op ----
/** What a call looks like to the guard (from the io method's arguments) and to the issuer (from core's TicketCall). */
export interface CallView { route: unknown; sid: string | null; idem: string | null; realm: string | undefined; body: unknown }
const routeFor = (r: Route): unknown => routes[r];
const own = (o: unknown, k: string): boolean => typeof o === 'object' && o !== null && Object.prototype.hasOwnProperty.call(o, k);
const get = (o: unknown, k: string): unknown => (own(o, k) ? (o as Record<string, unknown>)[k] : undefined);
export function matches(op: Op, c: CallView): boolean {
  if (c.route !== routeFor(op.route) || c.realm !== op.r) return false;
  const b = c.body;
  switch (op.route) {
    case 'create': return c.sid === null && c.idem === op.key && !own(b, 'attach');
    case 'turn': {
      const atts = get(b, 'attachments');
      const has = Array.isArray(atts) && atts.length > 0;
      // `files` is the entry's evidence flag (any attached file, text files included: they ride in the prompt text). The wire carries
      // images only, so a call with images must be one the op declared as carrying files; a declared file without images is fine.
      return c.sid === op.sid && c.idem === op.key && (!has || op.files);
    }
    case 'command': {
      if (c.sid !== op.sid || c.idem !== op.key || get(b, 'kind') !== op.cmd) return false;
      if (op.cmd !== 'interrupt') return true;
      // The interrupt's body is exactly {kind, text} (the agent refuses an on_gate on it), and its text is the admitted one.
      const keys = typeof b === 'object' && b !== null ? Reflect.ownKeys(b).sort() : [];
      const text = get(b, 'text');
      return keys.length === 2 && keys[0] === 'kind' && keys[1] === 'text' && typeof text === 'string' && op.td !== undefined && textDigest(text) === op.td;
    }
    case 'confirm': return c.sid === op.sid && c.idem === null && get(b, 'request_id') === op.key && get(b, 'gate_id') === op.gate && get(b, 'generation') === op.gen;
    default: return c.sid === op.sid && c.idem === null && get(b, 'gate_id') === op.gate && get(b, 'generation') === op.gen;
  }
}

// ---- the private admission record ----
export type State = 'W' | 'A' | 'L' | 'R' | 'C' | 'P' | 'X' | 'U';
export interface Rec {
  readonly op: Op;
  readonly acct: string;
  /** The entry this admission wrote; null for a held admission (the run's hold stores the request). */
  readonly written: Entry | null;
  ticket: Ticket | null;
  state: State;
  call?: Promise<unknown>;
  /** The Journal instance (or the held door) that minted it. */
  readonly door: object;
  /** post(): told when the claimed call is set / cancelled. */
  onClaim?: (p: Promise<unknown>) => void;
  onCancel?: () => void;
  adm?: Admission;
  /** The key's send lock, requested by admit() before the entry was written; post() adopts it, and it is given back on a failed admit,
   *  a revoke and the end of post. Absent for a held admission. */
  hold?: Hold;
  /** A held admission: the run's hold and the stored version it was admitted at. */
  held?: { readonly holdId: string; readonly version: number };
}
export const byAdm = new WeakMap<object, Rec>();
const byTicket = new WeakMap<object, Rec>();
export const ident = (r: Rec): Ident & { route: Route } => ({ acct: r.acct, h: r.op.h, k: r.op.key, route: r.op.route });

// ---- the journal issuer: one per page, shared by every Journal instance ----
const issuer: TicketIssuer = {
  check(t: Ticket, call: TicketCall): boolean {
    const r = byTicket.get(t);
    if (!r || r.state !== 'C') return false;
    if (currentAccount() !== r.op.acct) return false;
    return matches(r.op, { route: call.route, sid: call.sid, idem: call.idem, realm: call.realm, body: call.body });
  },
  spend(t: Ticket): string | null {
    const r = byTicket.get(t);
    if (r && r.state === 'C') r.state = 'P';
    return null;
  },
};
let mintTicket: ((b: TicketBind) => Ticket) | null = null;
export function mintFn(): (b: TicketBind) => Ticket {
  if (!mintTicket) mintTicket = claimTickets('journal', issuer);
  return mintTicket;
}
/** Tests only: forget the lazy claim of the issuer (core's resetTickets forgets the mint). */
export function resetDoorForTests(): void { mintTicket = null; }

/** Links an admission record to its frozen `Admission` and its ticket, and wires the token's cancel. */
export function register(rec: Rec, ticket: Ticket, tok: SendToken, cancel: () => void): Admission {
  const adm: Admission = Object.freeze({ key: rec.op.key, cancel });
  rec.adm = adm;
  byAdm.set(adm, rec);
  byTicket.set(ticket, rec);
  tok.onCancel(() => adm.cancel());
  return adm;
}

// ---- the guard ----
const JOURNALED = new Set(['create', 'turn', 'command', 'interrupt', 'stop', 'confirm', 'answer']);
function viewOf(method: string, a: readonly unknown[]): CallView | null {
  switch (method) {
    case 'create': return { route: routes.create, sid: null, idem: str(a[1]), realm: str(a[2]) ?? undefined, body: a[0] };
    case 'turn': {
      const atts = a[4];
      return { route: routes.turn, sid: str(a[0]), idem: str(a[2]), realm: str(a[3]) ?? undefined, body: Array.isArray(atts) && atts.length ? { text: a[1], attachments: atts } : { text: a[1] } };
    }
    case 'command': return { route: routes.command, sid: str(a[0]), idem: str(a[2]), realm: str(a[3]) ?? undefined, body: { kind: 'message', text: a[1], on_gate: 'wait' } };
    case 'interrupt': return { route: routes.command, sid: str(a[0]), idem: str(a[2]), realm: str(a[3]) ?? undefined, body: { kind: 'interrupt', text: a[1] } };
    case 'stop': return { route: routes.command, sid: str(a[0]), idem: str(a[1]), realm: str(a[2]) ?? undefined, body: { kind: 'stop' } };
    case 'confirm': return { route: routes.confirm, sid: str(a[0]), idem: null, realm: str(a[2]) ?? undefined, body: a[1] };
    case 'answer': return { route: routes.answer, sid: str(a[0]), idem: null, realm: str(a[2]) ?? undefined, body: a[1] };
    default: return null;
  }
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const refuse = (code: 'TICKET_REQUIRED' | 'TICKET_REFUSED'): Promise<never> =>
  Promise.reject(Object.freeze({ kind: 'not_sent', notSent: true, code, message: code }));
/** The tickets of a call: the elements of the array arguments that this journal knows. */
function ticketOf(a: readonly unknown[]): Rec | null {
  for (const x of a) {
    if (!Array.isArray(x)) continue;
    for (const t of x) if (typeof t === 'object' && t !== null) { const r = byTicket.get(t); if (r) return r; }
  }
  return null;
}
/** AgentIO's own members, one entry each (ask/data.ts). The type makes the compiler refuse a member added to or dropped from the
 *  interface without this list: the guard hands out these names and nothing else. */
const MEMBERS: Record<keyof AgentIO, true> = {
  health: true, version: true, authStatus: true, probe: true, signIn: true, sessions: true, create: true, attach: true, turn: true,
  turns: true, receipt: true, command: true, interrupt: true, stop: true, commandGet: true, withdraw: true, acpDefault: true, createKeyGet: true, createKeyRetire: true, turnByKey: true,
  turnKeyRetire: true, commandByKey: true, commandKeyRetire: true, state: true, replay: true, transcript: true, confirm: true, answer: true,
  approval: true, yolo: true, cancel: true, stream: true, computer: true, start: true, alive: true,
};
/** The engine's only io. A journaled method needs its ticket and a matching call; every other member of AgentIO passes through,
 *  bound to the io. The guard is a frozen object with no prototype that carries exactly those members: valueOf, toString,
 *  constructor, __proto__, an own property's descriptor or any other way to the raw io (which needs no ticket) does not exist on it. */
export function guardIO<T extends AgentIO>(io: T, bind: { acct: string; container: string }): T {
  const dest = destOf(io);
  if (dest === null || dest !== bind.container) throw new Error('guardIO: the io has no destination, or not this computer');
  const member = (name: string): ((...a: unknown[]) => unknown) => {
    const m = Reflect.get(io, name, io);
    if (typeof m !== 'function') throw new TypeError('guardIO: the io has no ' + name);
    return m as (...a: unknown[]) => unknown;
  };
  const guard: Record<string, (...a: unknown[]) => unknown> = Object.create(null) as Record<string, (...a: unknown[]) => unknown>;
  for (const name of Object.keys(MEMBERS)) {
    guard[name] = !JOURNALED.has(name) ? (...args: unknown[]) => member(name).apply(io, args) : (...args: unknown[]): Promise<unknown> => {
      const r = ticketOf(args);
      if (!r) return refuse('TICKET_REQUIRED');
      const view = viewOf(name, args);
      if (!view || r.state !== 'R' || !matches(r.op, view) || bind.acct !== r.op.acct || currentAccount() !== r.op.acct || dest !== r.op.container) return refuse('TICKET_REFUSED');
      r.state = 'C';
      let p: Promise<unknown>;
      try { p = Promise.resolve(member(name).apply(io, args)); }
      catch (e) { p = Promise.reject(e); }
      r.call = p;
      try { r.onClaim?.(p); } catch { /* a listener never breaks the call */ }
      return p;
    };
  }
  // The guard reports the same destination as the io it wraps.
  return shareDest(io, Object.freeze(guard)) as unknown as T;
}

// ---- the door ----
export class Door {
  private readonly minted = new Set<string>();
  /** acct|h:k → the ids the attempt's own reply gave (a turn id, a command id), for checkById. */
  private readonly refs = new Map<string, { turn?: string; command?: string }>();
  /** acct|h:k → this page's own admission for the key. */
  private readonly own = new Map<string, Rec>();
  /** `barred`: a request the journal no longer lets leave (a chat whose create key is marked bound elsewhere, records.ts), looked at
   *  again right before the call, after every lock wait, in the same synchronous step as the call. */
  constructor(private readonly entries: Entries, private readonly settler: Settler, private readonly barred: (op: Op) => boolean = () => false) {}

  /** hx- and 32 hex characters (create, turn, command) or 24 (confirm, answer), from crypto.getRandomValues. null: this page
   *  cannot mint. */
  mint(route: Route): string | null {
    let bytes: Uint8Array;
    try {
      const c = (globalThis as { crypto?: Crypto }).crypto;
      if (!c || typeof c.getRandomValues !== 'function') return null;
      bytes = c.getRandomValues(new Uint8Array(route === 'confirm' || route === 'answer' ? 12 : 16));
    } catch { return null; }
    const key = route === 'confirm' || route === 'answer' ? L.newRequestId(bytes) : L.newKey(bytes);
    if (key) this.minted.add(key);
    return key;
  }
  /** Tests only. */
  mintForTests(key: string): void { this.minted.add(key); }
  /** Whether `key` was minted by this instance and never admitted. admit() consumes the mark once its entry write is attempted (before
   *  it can return an admission, a failed write included; a refusal before that writes and sends nothing), and only the instance that
   *  minted a key can admit it, so true proves no request under `key` was ever sent, by any tab. */
  unspent(key: string): boolean { return this.minted.has(key); }
  /** Whether this page still holds an own admission for the key in W, A, L, R, C or P (Dismiss is refused meanwhile). */
  holds(acct: string, h: string, k: string): boolean {
    const r = this.own.get(`${acct}|${h}:${k}`);
    return !!r && (r.state === 'W' || r.state === 'A' || r.state === 'L' || r.state === 'R' || r.state === 'C' || r.state === 'P');
  }
  refOf(acct: string, h: string, k: string): { turn?: string; command?: string } | undefined { return this.refs.get(`${acct}|${h}:${k}`); }
  /** Remembers the command id a read by key authenticated for the key, so a later command frame can settle the entry (only recover.ts calls it). */
  noteRef(acct: string, h: string, k: string, ref: { turn?: string; command?: string }): void { this.refs.set(`${acct}|${h}:${k}`, { ...this.refs.get(`${acct}|${h}:${k}`), ...ref }); }

  admit(op: Op, tok: SendToken): Admission | NotSent {
    const no = (why: NotSentWhy): NotSent => ({ kind: 'notSent', why });
    void this.entries.sweep();
    if (tok.cancelled) return no('cancelled');
    const p = capture(op);
    if (!p || !valid(p)) return no('invalid');
    if (!this.minted.has(p.key)) return no('notMinted');
    const acct = currentAccount();
    if (!acct || acct !== p.acct) return no('account');
    // The key's send lock is asked for BEFORE the entry is written (never awaited here: admit is synchronous). From now on any tab that
    // sees the entry also finds the name held or queued, and a free-lock try does not grant a queued name; the post adopts this hold.
    const hold = holdLock(sendLockName(p.key));
    const refuse = (why: NotSentWhy): NotSent => { hold.cancel(); return no(why); };
    const written = Object.freeze(entryOf(p, this.entries.clock())) as Entry;
    const put = this.entries.put({ ...written }, acct);
    if (put === 'account' || put === 'exists' || put === 'full' || put === 'unreadable') return refuse(put);
    // The write was attempted: the key is consumed for good.
    this.minted.delete(p.key);
    const id: Ident = { acct, h: p.h, k: p.key };
    if (put === 'failed') {
      this.entries.remove(neverLeft(id, written));
      return refuse('notKept');
    }
    const back = this.entries.peek(nameOf(p.h, p.key));
    if (back.s !== 'ok' || back.acct !== acct || !sameValue(back.entry, written)) {
      this.entries.remove(neverLeft(id, written));
      return refuse('notKept');
    }
    let ticket: Ticket;
    try {
      ticket = mintFn()({ route: routes[p.route] as TicketBind['route'], container: p.container, sid: p.route === 'create' ? null : p.sid, idem: p.route === 'create' || p.route === 'turn' || p.route === 'command' ? p.key : null });
    } catch {
      this.entries.remove(neverLeft(id, written));
      return refuse('noTicket');
    }
    const rec: Rec = { op: p, acct, written, ticket, state: 'A', door: this, hold };
    this.own.set(`${acct}|${p.h}:${p.key}`, rec);
    return register(rec, ticket, tok, () => this.cancel(rec));
  }

  /** Revokes an admission that never left (W, A, L, R): the entry it wrote goes, nothing more. A claimed one is only told. */
  private revoke(r: Rec): void {
    if (r.state === 'W' || r.state === 'A' || r.state === 'L' || r.state === 'R') {
      r.state = 'X';
      if (r.written) this.entries.remove(neverLeft({ acct: r.acct, h: r.op.h, k: r.op.key }, r.written));
      r.hold?.cancel();
    }
  }
  private cancel(r: Rec): void {
    if (r.state === 'X') return;
    const claimed = r.state === 'C' || r.state === 'P';
    if (!claimed) this.revoke(r);
    try { r.onCancel?.(); } catch { /* a listener of its own */ }
  }

  async post(a: Admission, go: (t: Ticket) => unknown, accepts?: ReplyCtx['accepts']): Promise<Outcome> {
    const r = byAdm.get(a as object);
    const no = (why: NotSentWhy): Outcome => ({ kind: 'notSent', why });
    if (!r || r.door !== this || r.state !== 'A' || !r.ticket) return no('noTicket');
    r.state = 'L';
    // The cancel of this admission ends every wait below.
    let stop: (() => void) | null = null;
    const cancelled = new Promise<'cancelled'>((res) => { stop = () => res('cancelled'); });
    r.onCancel = () => stop?.();
    const abort = (why: NotSentWhy): Outcome => { this.revoke(r); return no(why); };
    const holds: Hold[] = [];
    const releases: Array<() => void> = [];
    try {
      const names = [sendLockName(r.op.key)];
      if (r.op.route === 'confirm' || r.op.route === 'answer') names.push(decideLockName(r.op.h, r.op.r, r.op.sid));
      for (const n of names) {
        // The send lock was requested by admit (before the entry existed): adopt it. A decision's lock is taken here, after it.
        const h = n === names[0] && r.hold ? r.hold : holdLock(n);
        holds.push(h);
        const got = await Promise.race([h.held.then((rel) => ({ rel }), () => ({ refused: true as const })), cancelled]);
        if (got === 'cancelled') return abort('cancelled');
        if ('refused' in got) return abort('lockRefused');
        releases.push(got.rel);
      }
      if (stateOf(r) === 'X') return no('cancelled');
      if (currentAccount() !== r.acct) return abort('account');
      const sc = this.entries.scan(r.op.h);
      if (sc.s !== 'ok') return abort('unreadable');
      if (sc.acct !== r.acct) return abort('account');
      const own = sc.entries.find((e) => e.k === r.op.key && e.h === r.op.h);
      if (!own || own.m || !r.written || !sameValue(own, r.written)) return abort('notKept');
      if (r.op.route === 'confirm' || r.op.route === 'answer') {
        const op = r.op;
        const other = sc.entries.some((e) => e.k !== op.key && (e.kind === 'decision' || e.kind === 'answer') && e.s === op.sid && e.r === op.r && e.g === op.gate);
        if (other) return abort('decided');
      }
      // Admitted before the chat's marker was written (another tab's settlement while this waited for a lock): it never leaves.
      if (this.barred(r.op)) return abort('elsewhere');
      r.state = 'R';
      return await this.run(r, go, accepts);
    } finally {
      for (const h of holds) h.cancel();
      for (const rel of releases) { try { rel(); } catch { /* released */ } }
    }
  }
  /** From state R: calls go once, then waits for the claimed call, go's own settling, or the cancel. */
  private run(r: Rec, go: (t: Ticket) => unknown, accepts?: ReplyCtx['accepts']): Promise<Outcome> {
    const gate = r.op.route === 'confirm' || r.op.route === 'answer' ? { gate: r.op.gate, gen: r.op.gen } : {};
    // The claimed call's own settlement, for a cancel that came first: `lateDone` once it ran, else `lateRes` waits for it.
    let lateDone: Late | null = null;
    let lateRes: ((x: Late) => void) | null = null;
    return drive<Outcome>(r, go, {
      sent: async (res) => {
        r.state = 'U';
        const v = classifyReply({ ...ident(r), ...gate, ...(accepts && r.op.route === 'create' ? { accepts } : {}) }, res);
        if (v.ref) this.refs.set(`${r.acct}|${r.op.h}:${r.op.key}`, { ...this.refs.get(`${r.acct}|${r.op.h}:${r.op.key}`), ...v.ref });
        // A create's record handoff is named by its realm (an entry already gone says nothing about the record). The outcome waits for
        // the settlement: the caller sees the record as the settlement left it.
        let settled: Settled = 'owed';
        try { settled = await this.settler.settle(v, r.op.route === 'create' ? r.op.r : undefined); } catch { /* an unsettled verdict is owed, never lost */ }
        lateDone = { v, settled };
        lateRes?.(lateDone);
        return { kind: 'sent' as const, v, settled };
      },
      claimedCancel: () => {
        r.state = 'U';
        const late = lateDone ? Promise.resolve(lateDone) : new Promise<Late>((res) => { lateRes = res; });
        return { kind: 'sent', v: unknownVerdict('reply', ident(r), 'cancelled'), settled: 'none', late };
      },
      notSent: (why) => ({ kind: 'notSent', why }),
      revoke: () => this.revoke(r),
    });
  }
}

/** The state read afresh (a cancel may have changed it across an await). */
export const stateOf = (r: Rec): State => r.state;
export type Res = { readonly ok: true; readonly b: unknown } | { readonly ok: false; readonly e: unknown };
/** What drive() needs of its door. */
export interface Driver<O> {
  /** The claimed call settled (not a refusal before the ticket was spent): the final outcome. */
  sent(res: Res): O | Promise<O>;
  /** The admission was cancelled while its call was claimed: the outcome, or null to keep waiting for the call (the held door). */
  claimedCancel: (() => O) | null;
  notSent(why: NotSentWhy): O;
  /** Revokes an admission that never left. */
  revoke(): void;
}
/** From state R: calls go once, synchronously, then waits for the first of the claimed call's settling, go's own value settling
 *  while nothing is claimed (noCall), and the admission's cancel. */
export function drive<O>(r: Rec, go: (t: Ticket) => unknown, d: Driver<O>): Promise<O> {
  return new Promise<O>((resolve) => {
    let done = false;
    let goSettled = false;
    const end = (o: O): void => { if (!done) { done = true; resolve(o); } };
    const noCallNow = (): void => {
      if (done || r.state !== 'R') return;
      d.revoke();
      end(d.notSent('noCall'));
    };
    const reply = (res: Res): void => {
      // core refused before it spent the ticket: nothing left. The wait goes on for go's own value.
      if (!res.ok && r.state === 'C' && isNotSent(res.e)) { r.state = 'R'; r.call = undefined; if (goSettled) noCallNow(); return; }
      const o = d.sent(res);
      if (isThenable(o)) void (o as Promise<O>).then(end); else end(o as O);
    };
    r.onClaim = (p) => { p.then((b) => reply({ ok: true, b }), (e) => reply({ ok: false, e })); };
    r.onCancel = () => {
      if (r.state === 'C' || r.state === 'P') { if (d.claimedCancel) end(d.claimedCancel()); }
      else end(d.notSent('cancelled'));
    };
    let value: unknown;
    try { value = go(r.ticket as Ticket); }
    catch { goSettled = true; noCallNow(); return; }
    if (!isThenable(value)) { goSettled = true; noCallNow(); return; }
    const settled = (): void => { goSettled = true; noCallNow(); };
    (value as PromiseLike<unknown>).then(settled, settled);
  });
}

export function isNotSent(e: unknown): boolean {
  return typeof e === 'object' && e !== null && ((e as { kind?: unknown }).kind === 'not_sent' || (e as { notSent?: unknown }).notSent === true);
}
const isThenable = (v: unknown): boolean => typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
