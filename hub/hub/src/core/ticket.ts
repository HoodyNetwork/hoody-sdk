// ticket.ts: the one field core checks before a guarded agent call leaves (CallInput.tickets).
//
// Contract (adopted by the send journal and the approver lease):
//   - A Ticket is an opaque frozen object that only a mint from claimTickets() can make. claimTickets(kind, issuer) hands
//     back the one mint of that kind; a second claim of the same kind throws. A ticket is bound at mint to
//     {route, container, sid, idem} and is single use.
//   - checkTickets() (steps 1-4) is the last step of kit.ts admit(), after every other admission refusal; spendTickets()
//     (step 5) runs in the send, after the request's own resources (timer, in-flight entry, abort listener) are set up and
//     immediately before the request goes out. Both run before any await or network access:
//       1. input.tickets is read once. It is an array of at most 2 core-minted, unspent tickets, no kind repeated, none
//          null. A ticket on a route that declares none, or of a kind it does not declare, fails (TICKET_REFUSED).
//       2. Every kind the route declares 'required' (or whose function form returns true for the body as checked, a
//          throw counting as true) must be present (TICKET_REQUIRED).
//       3. Each ticket's bind equals the call exactly: the very Route object, the computer, the session id (null when
//          the path has none), the idempotency key (null when the call has none).
//       4. Every issuer's check() answers true (a throw is false). check() is pure: nothing is spent yet.
//       5. Only when 1-4 all pass, and only when the send's setup succeeded (a call that fails before this step leaves its
//          tickets unspent and reusable): every ticket is marked spent, then spend() runs in the fixed order journal -> lease.
//          The lease spend's value is the only source of X-Hoody-Approver-Lease (null: no header); a value that is not
//          header-safe refuses the call (TICKET_REFUSED) and the tickets stay spent.
//   - answerTickets() (step 6) hands the raw success answer to each spent ticket's issuer, before the caller's scrub and
//     before core's liveness check. A throw is SCRUB_FAILED (api.ts). Never called for an answer core did not read.
//   - settleTickets() (step 7) tells each spent ticket's issuer the call's settled outcome, exactly once per ticket, in
//     spend order, on every outcome, after any answer hook and before the caller's promise settles. A throw is ignored.
//   - The issuer sees a call whose body is parsed back from the JSON that is sent, deep-frozen: what it judges is what
//     goes out. An issuer owns the account rule: core hands it no account.
import type { Route } from './routes';

declare const brand: unique symbol;
/** Opaque and frozen: real only if a mint from claimTickets() made it. */
export interface Ticket { readonly [brand]: true }
export type TicketKind = 'journal' | 'lease';
/** How a route asks for a kind: always, never required, or required when the function says so for the body (a throw = required). */
export type Need = 'required' | 'optional' | ((body: unknown) => boolean);
export interface RouteTickets { readonly journal?: Need; readonly lease?: Need }

export interface TicketBind {
  readonly route: Route;
  readonly container: string;
  readonly sid: string | null;
  readonly idem: string | null;
}
export interface TicketCall extends TicketBind {
  readonly realm: string | undefined;
  readonly body: unknown;
}
/** The call's settled outcome, as the caller gets it. */
export type TicketSettled = { readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly err: unknown };
export interface TicketIssuer {
  /** Pure: no side effect; a throw is false. */
  check(t: Ticket, call: TicketCall): boolean;
  /** lease: the header value, or null for no header; journal: null. */
  spend(t: Ticket, call: TicketCall): string | null;
  /** Once with the raw success answer of the call that spent t, before the caller's scrub and core's liveness check. It may
   *  blank secrets in place; a throw is SCRUB_FAILED. */
  answer?(t: Ticket, raw: unknown): void;
  /** Exactly once per spent ticket, in spend order, with the call's settled outcome, after any answer hook and before the
   *  caller's promise settles. A throw is ignored. */
  settled?(t: Ticket, r: TicketSettled): void;
}

interface Rec { readonly kind: TicketKind; readonly bind: TicketBind; readonly issuer: TicketIssuer; readonly gen: number; spent: boolean }
const recs = new WeakMap<object, Rec>();
const mints = new Map<TicketKind, TicketIssuer>();
let gen = 1;
const KINDS: readonly TicketKind[] = ['journal', 'lease'];
const LEASE_VALUE = /^[\x21-\x7e]{1,512}$/;
const NEEDS = (v: unknown): v is Need => v === 'required' || v === 'optional' || typeof v === 'function';

function bindOk(b: TicketBind | null | undefined): b is TicketBind {
  return !!b && typeof b === 'object' && !!b.route && typeof b.container === 'string' && b.container !== ''
    && (b.sid === null || typeof b.sid === 'string') && (b.idem === null || typeof b.idem === 'string');
}

/** The only mint of `kind`, for its issuer; called once per kind per page. */
export function claimTickets(kind: TicketKind, issuer: TicketIssuer): (bind: TicketBind) => Ticket {
  if (!KINDS.includes(kind) || !issuer || typeof issuer.check !== 'function' || typeof issuer.spend !== 'function') throw new Error('TICKET_ISSUER_INVALID');
  if (mints.has(kind)) throw new Error('TICKET_ALREADY_CLAIMED');
  mints.set(kind, issuer);
  const mine = gen;
  return (bind: TicketBind): Ticket => {
    if (mine !== gen) throw new Error('TICKET_MINT_RETIRED');
    if (!bindOk(bind)) throw new Error('TICKET_BIND_INVALID');
    const t = Object.freeze(Object.create(null)) as Ticket;
    recs.set(t, { kind, bind: Object.freeze({ route: bind.route, container: bind.container, sid: bind.sid, idem: bind.idem }), issuer, gen: mine, spent: false });
    return t;
  };
}

/** Forgets every claim and retires every mint and ticket made so far (session disposal, dispose.ts; tests). */
export function resetTickets(): void {
  mints.clear();
  gen++;
}

/** A route's `tickets` declaration, checked at defineRoute (agent routes only). */
export function declaredTickets(v: unknown): RouteTickets | null {
  if (v === undefined) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('ROUTE_INVALID: tickets');
  const out: { journal?: Need; lease?: Need } = {};
  const ks = Object.keys(v as object);
  if (ks.length === 0) throw new Error('ROUTE_INVALID: tickets');
  for (const k of ks) {
    const need = (v as Record<string, unknown>)[k];
    if (!KINDS.includes(k as TicketKind) || !NEEDS(need)) throw new Error('ROUTE_INVALID: tickets');
    out[k as TicketKind] = need;
  }
  return Object.freeze(out);
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** The tickets of one call (opaque). Admission checks them; spendTickets() spends them, later, once the send has what it needs
 *  (kit.ts exchange); api.ts keeps the set to run steps 6 and 7, which see it only once it is spent. */
export interface SpentTickets {
  readonly list: readonly { readonly t: Ticket; readonly rec: Rec }[];
  readonly call: TicketCall;
  /** A lease ticket is among them: the request will carry X-Hoody-Approver-Lease when the spend yields a value. */
  readonly leases: boolean;
  spent: boolean;
  lease: string | null;
  failed: TicketCode | null;
  settledDone: boolean;
}
export type TicketCode = 'TICKET_REQUIRED' | 'TICKET_REFUSED';
export type TicketCheck =
  | { readonly ok: true; readonly set: SpentTickets | null }
  | { readonly ok: false; readonly code: TicketCode };
export type TicketSpend =
  | { readonly ok: true; readonly lease: string | null }
  | { readonly ok: false; readonly code: TicketCode };
export type TicketAdmission =
  | { readonly ok: true; readonly spent: SpentTickets | null; readonly lease: string | null }
  | { readonly ok: false; readonly code: TicketCode; readonly spent: SpentTickets | null };

const refuse = (code: TicketCode): TicketCheck => ({ ok: false, code });

/** Steps 1-4 for one call. `declared` is the route's tickets, `given` the caller's input.tickets, `bodyJson` the exact JSON
 *  that is sent (undefined: no body). Spends nothing. */
export function checkTickets(declared: RouteTickets | null, given: unknown, call: Omit<TicketCall, 'body'>, bodyJson: string | undefined): TicketCheck {
  if (given === undefined) given = [];
  // 1. The array, read once.
  if (!Array.isArray(given)) return refuse('TICKET_REFUSED');
  const src = given as readonly unknown[];
  const n = src.length;
  if (n > 2) return refuse('TICKET_REFUSED');
  const list: { t: Ticket; rec: Rec }[] = [];
  for (let i = 0; i < n; i++) {
    const t = src[i];
    const rec = t !== null && typeof t === 'object' ? recs.get(t) : undefined;
    if (!rec || rec.gen !== gen || rec.spent || !declared || declared[rec.kind] === undefined || list.some((x) => x.rec.kind === rec.kind)) return refuse('TICKET_REFUSED');
    list.push({ t: t as Ticket, rec });
  }
  // The body as the issuer and a function-form Need judge it: parsed back from what is sent.
  let body: unknown;
  const judges = list.length > 0 || (declared !== null && KINDS.some((k) => typeof declared[k] === 'function'));
  if (judges) { try { body = bodyJson === undefined ? undefined : deepFreeze(JSON.parse(bodyJson)); } catch { return refuse('TICKET_REFUSED'); } }
  // 2. Required kinds.
  if (declared) {
    for (const k of KINDS) {
      const need = declared[k];
      if (need === undefined || list.some((x) => x.rec.kind === k)) continue;
      let required: boolean;
      if (need === 'required') required = true;
      else if (need === 'optional') required = false;
      else { try { required = need(body) === true; } catch { required = true; } }
      if (required) return refuse('TICKET_REQUIRED');
    }
  }
  if (list.length === 0) return { ok: true, set: null };
  // 3. The bind, exactly.
  const tc: TicketCall = Object.freeze({ route: call.route, container: call.container, sid: call.sid, idem: call.idem, realm: call.realm, body });
  for (const { rec } of list) {
    const b = rec.bind;
    if (b.route !== call.route || b.container !== call.container || b.sid !== call.sid || b.idem !== call.idem) return refuse('TICKET_REFUSED');
  }
  // 4. Every check, before anything is spent.
  for (const { t, rec } of list) {
    let ok = false;
    try { ok = rec.issuer.check(t, tc) === true; } catch { ok = false; }
    if (!ok) return refuse('TICKET_REFUSED');
  }
  list.sort((a, b) => KINDS.indexOf(a.rec.kind) - KINDS.indexOf(b.rec.kind));
  return { ok: true, set: { list, call: tc, leases: list.some((x) => x.rec.kind === 'lease'), spent: false, lease: null, failed: null, settledDone: false } };
}

/** Step 5: spend the checked set, journal first, once. A second call answers what the first did. Until it runs the tickets are
 *  untouched (a call that fails before it can be retried with them). Once it has started they stay spent whatever it answers. */
export function spendTickets(set: SpentTickets): TicketSpend {
  if (set.spent) return set.failed ? { ok: false, code: set.failed } : { ok: true, lease: set.lease };
  // Another call may have spent one of them since the check: then nothing is spent here.
  if (set.list.some(({ rec }) => rec.spent || rec.gen !== gen)) return { ok: false, code: 'TICKET_REFUSED' };
  for (const x of set.list) x.rec.spent = true;
  set.spent = true;
  for (const { t, rec } of set.list) {
    let v: string | null;
    try { v = rec.issuer.spend(t, set.call); } catch { set.failed = 'TICKET_REFUSED'; return { ok: false, code: 'TICKET_REFUSED' }; }
    if (rec.kind === 'lease' && v !== null) {
      if (typeof v !== 'string' || !LEASE_VALUE.test(v)) { set.failed = 'TICKET_REFUSED'; return { ok: false, code: 'TICKET_REFUSED' }; }
      set.lease = v;
    }
  }
  return { ok: true, lease: set.lease };
}

/** Steps 1-5 in one go (check, then spend). The send itself uses the two halves (kit.ts). */
export function admitTickets(declared: RouteTickets | null, given: unknown, call: Omit<TicketCall, 'body'>, bodyJson: string | undefined): TicketAdmission {
  const c = checkTickets(declared, given, call, bodyJson);
  if (!c.ok) return { ok: false, code: c.code, spent: null };
  if (c.set === null) return { ok: true, spent: null, lease: null };
  const r = spendTickets(c.set);
  return r.ok ? { ok: true, spent: c.set, lease: r.lease } : { ok: false, code: r.code, spent: c.set.spent ? c.set : null };
}

/** Step 6. Throws when an issuer's answer hook throws (the caller maps it to SCRUB_FAILED). */
export function answerTickets(spent: SpentTickets | null, raw: unknown): void {
  if (!spent || !spent.spent) return;
  // Every issuer's hook gets the answer, in spend order, whatever an earlier one does; the first failure is thrown after the last.
  let failed = false, first: unknown;
  for (const { t, rec } of spent.list) {
    try {
      const h = rec.issuer.answer;
      if (typeof h === 'function') h.call(rec.issuer, t, raw);
    } catch (e) { if (!failed) { failed = true; first = e; } }
  }
  if (failed) throw first;
}

/** Step 7: exactly once for the call, whatever the outcome. */
export function settleTickets(spent: SpentTickets | null, r: TicketSettled): void {
  if (!spent || !spent.spent || spent.settledDone) return;
  spent.settledDone = true;
  for (const { t, rec } of spent.list) {
    try {
      const h = rec.issuer.settled;
      if (typeof h === 'function') h.call(rec.issuer, t, r);
    } catch { /* the issuer's own; changes nothing */ }
  }
}
