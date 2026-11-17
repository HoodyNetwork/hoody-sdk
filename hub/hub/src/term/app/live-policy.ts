// The live mount's send policy: the policy
// alone. Wiring into core's send families and the real adapter is live-wire.ts.
//
//   - `admitLive(call)` runs the admission table (rows 1-8) on the call's own arguments and, on acceptance, mints
//     an Admission: an empty frozen object known only to THIS policy (a private WeakMap), holding a frozen descriptor
//     {family, leg, method, url, headers, bodyDigest, bodyKind, sid, generation, policyGeneration}.
//   - `refuseEarly(route, family)` is the first statement of every mutation entry and the Ask journal door: rows 1, 2
//     (identity), 5, 6 (a store usable for changes at all) and 7, from route information only.
//   - `seal(adm, headers)` is stage two: a computer send's FINAL headers, after the tickets were spent. The plan's
//     headers, unchanged, plus at most `X-Hoody-Approver-Lease`.
//   - `verifyAdmission(adm, actual)` is the transport's first step: it claims the record (minted → claimed, once) and
//     compares the actual method, URL, body digest and, on a computer leg, the final headers and the cookie flag.
//     `beforeWire(adm)` checks every wire attempt of that claimed call the same way. `end(adm)` revokes it.
//   - Any refusal at the transport (no proof, an unknown or reused one, a moved session or policy generation, a
//     mismatch) is TERM_POLICY_BYPASS, reported through `onBypass` as a code only: once per record it names (which
//     ends), each time for a proof that names none.
//   - `bump()` moves the policy generation (a lock, an unlock, a realm switch, a permission recheck, a membership
//     change): every Admission minted before it is refused at claim and at every retry. `dispose()` forgets every
//     record (an Admission kept past the mount, or shown to another mount, is unknown).
// Nothing here sends, stores, logs a value or reads a clock. Values never leave it: digests and codes only.
import { createHash } from 'node:crypto';
import { declaresLease, isChangeCall, isDeclared, type KitName, type Route } from '../../core/routes';
import { familyDomains } from '../../core/hosts';
import { isRealmOrGlobal } from '../../core/realm-id';
import { attemptVerdict, boundBeforeWire, type AdmittedSend } from './live-seam';
import { destinationVerdict, type MembershipTable, type MemberSelection } from './live-membership';
import type { WireAttempt } from '../host-types';
import { isPostRead } from './post-reads';

/** The census rows that call `admitLive`, set by each calling site as a constant. */
export type Family = '0a' | '0b' | '0c' | '0d' | '0e' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '12';
export type Leg = 'hoody' | 'kit' | 'agent' | 'socket';
const LEGS_OF: Readonly<Record<Family, readonly Leg[]>> = {
  '0a': ['hoody', 'kit', 'agent'], '0b': ['agent'], '0c': ['hoody', 'kit', 'agent'], '0d': ['hoody', 'kit', 'agent'], '0e': ['hoody', 'kit', 'agent'],
  '1': ['hoody'], '2': ['kit', 'agent'], '3': ['kit'], '4': ['kit'], '5': ['kit'], '6': ['kit'], '7': ['kit', 'agent'], '8': ['agent'],
  '9': ['kit'], '10': ['socket'], '12': ['hoody'],
};

export type PolicyCode =
  | 'TERM_LOCKED' | 'TERM_STALE' | 'TERM_ROUTE_UNDECLARED' | 'TERM_DESTINATION' | 'TERM_CREDENTIAL_CLASS'
  | 'TERM_NOT_IN_TERMINAL' | 'NOT_DURABLE' | 'TERM_READ_ONLY' | 'TERM_SECRET_SCREEN';
/** A refusal: nothing was sent and nothing was done. `code` may also be core's own routing refusal (hoodyRoute). */
export interface Refusal { readonly ok: false; readonly status: 0; readonly notSent: true; readonly kind: 'not_sent' | 'stale'; readonly code: PolicyCode | string }
/** The proof of one admission: opaque, carries nothing readable. */
export type Admission = Readonly<Record<never, never>>;

/** A computer the call goes to, as captured with the call (never read again from a page). */
export interface CallTarget { readonly project: string; readonly computer: string; readonly server: string }
export interface PolicyCall {
  readonly family: Family;
  readonly leg: Leg;
  readonly route: unknown;
  readonly method: string;
  /** The absolute URL the call will be sent to, query included. */
  readonly url: string;
  /** The built body: null for none; an object for a Hoody JSON body; a string or bytes for a computer body (the plan's). */
  readonly body: unknown;
  /** A streamed upload: bound to its source and declared length, the body is then null. */
  readonly stream?: { readonly path: string; readonly size: number; readonly mtimeMs: number; readonly length: number };
  /** The plan's headers (a computer leg), or the headers core hands the client on the Hoody leg. */
  readonly headers?: Readonly<Record<string, string>> | null;
  /** A run route only: the person's own headers, as core's callerHeaders admitted them. */
  readonly callerHeaders?: Readonly<Record<string, string>> | null;
  /** A computer leg: the captured target. */
  readonly target?: CallTarget | null;
  /** A kit route's port index. */
  readonly index?: number;
  /** Row 6: the durable record of this change (core's guarded record, or a listed direct change's own). */
  readonly record?: unknown;
}

export interface PolicyDeps {
  readonly places: { readonly apiOrigin: string; readonly realmApiDomain: string; readonly proxyDomain: string | null };
  /** Row 1: the mount is live and unlocked, and the session is the captured one. */
  state(): 'live' | 'locked' | 'stale';
  session(): { readonly sid: string; readonly generation: number };
  account(): string;
  /** core's routing decision (api.ts hoodyRoute). */
  hoodyRoute(method: string, path: string, body: unknown, scope: 'base' | 'realm', realm: string, baseOnly: boolean): { base: string } | { refused: string };
  /** The realm core routes a realm-scoped call to: the selection, or the token's pin. */
  realm(): string;
  tokenSession(): boolean;
  /** `GET /auth/tokens/me` by identity. */
  readonly introspection: unknown;
  /** The agent sign-in route (POST /hoody/auth/bootstrap) by identity: the one route whose body may carry the boot token. */
  readonly bootstrap: unknown;
  /** Secret routes whose answer is never shown, by identity: only routes no page sends (a page's secret is shown). */
  readonly unshownSecrets: ReadonlySet<unknown>;
  /** Row 7 for one call of a route a page also sends: its record is one the terminal handed its own call, whose answer
   *  is never shown (the boot-token mint's; the Keys page mints on the same route and shows its key). Absent: none. */
  unshownRecord?(record: unknown): boolean;
  readonly members: MembershipTable;
  selection(): MemberSelection;
  routingAllows(computer: string, server: string | null | undefined): boolean;
  /** core's address of the target's program (hosts.ts buildPortUrl / agentBaseFor), '' when it has none. */
  computerOrigin(leg: 'kit' | 'agent', target: CallTarget, route: Route, index: number | undefined): string;
  /** Row 6: 'none' (no usable store, or marked failed), 'ro' (a second Hub, or read-only by choice), 'rw'. */
  storeMode(): 'none' | 'ro' | 'rw';
  /** Row 6: this record exists and was fsynced. */
  recordKept(record: unknown): boolean;
  /** Row 7: the secret-safe screen is available. */
  secretReveal(): boolean;
  onBypass(code: 'TERM_POLICY_BYPASS'): void;
}

/** What `descriptor()` hands out: the descriptor with its URL replaced by the URL's digest. */
export type DescriptorView = Readonly<Omit<Descriptor, 'url'> & { urlDigest: string }>;
interface Descriptor extends AdmittedSend {
  readonly family: Family;
  readonly leg: Leg;
  readonly bodyKind: 'none' | 'json' | 'bytes' | 'stream';
  readonly sid: string;
  readonly generation: number;
  readonly policyGeneration: number;
}
interface Rec { desc: Descriptor; state: 'minted' | 'claimed' | 'ended'; sealed: boolean; readonly lease: boolean; reported?: boolean }

/**
 * Row 5: the kits whose every route serves a graphical surface the terminal cannot show (the Board's framed
 * browser, display and code programs). Names from core's kit registry (`KitName`: a renamed kit fails the typecheck).
 * The terminal, files, notes and agent kits stay: their routes serve terminal pages (AI shell tools, computer desktop
 * sessions, Files, Notes, Ask); their screens are frame addresses, which never go through this policy.
 */
export const LEFT_OUT_KITS = ['browser', 'display', 'code'] as const satisfies readonly KitName[];
const LEFT_OUT: ReadonlySet<string> = new Set(LEFT_OUT_KITS);
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(['authorization', 'proxy-authorization', 'cookie', 'cookie2']);
const LEASE = 'x-hoody-approver-lease';

/**
 * Row 4: a header the WEB plan sends on this route, lower case. Each line names the code that sends it:
 * kit.ts admit (Accept :290, Content-Type :291/:295, the idempotency header :292, X-Hoody-Cwd :263, If-Match :267,
 * a file route's checked headers :183-189, sent by upload.ts sendFile :265), kit-io.ts upload :293 (X-Hoody-Pipe, and
 * X-Hoody-Pipe-Sender-Key on a senderKey route; core/pipe.ts `live` is the one such route today). The lease
 * (kit.ts :494) is never on a plan: only at seal, on a route that declares a lease ticket.
 */
function planHeaderAllowed(n: string, route: Route, leg: Leg, hasBody: boolean): boolean {
  if (n === 'accept') return true;
  if (n === 'content-type') return hasBody || route.file === true || route.upload === true;
  if (typeof route.idem === 'string' && n === route.idem.toLowerCase()) return true;
  if (n === 'x-hoody-cwd') return leg === 'agent' && route.cwd === true;
  if (n === 'if-match') return route.cas?.via === 'etag' || route.file === true;
  if (n === 'if-none-match' || n === 'x-expected-length') return route.file === true;
  if (n === 'x-hoody-pipe') return leg === 'kit' && route.upload === true;
  if (n === 'x-hoody-pipe-sender-key') return leg === 'kit' && route.upload === true && route.senderKey === true;
  return false;
}
const API = '/api/v1';

const sha = (v: string | Uint8Array): string => createHash('sha256').update(v).digest('hex');
const refusal = (code: PolicyCode | string, kind: 'not_sent' | 'stale' = 'not_sent'): Refusal => Object.freeze({ ok: false, status: 0, notSent: true, kind, code });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Canonical JSON (sorted keys): the digest of a JSON body does not depend on key order. Null for a value JSON cannot carry. */
export function canonicalJson(v: unknown): string | null {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : null;
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (const x of v) { const s = canonicalJson(x); if (s === null) return null; parts.push(s); }
    return '[' + parts.join(',') + ']';
  }
  if (isObj(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    const parts: string[] = [];
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue;
      const s = canonicalJson(v[k]);
      if (s === null) return null;
      parts.push(JSON.stringify(k) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }
  return null;
}

// A path that wire normalisation could turn into another route: a dot segment, plain or percent-encoded.
const DOT_SEGMENT = /(?:^|\/)(?:\.|%2e){1,2}(?=\/|$)/i;
const HOODY_URL = /^(https?:\/\/[^/?#]+)\/api\/v1(\/[^?#]*)(\?[^#]*)?$/;

/** The query's parameter names, or null when it cannot be read. */
function queryKeys(q: string | undefined): string[] | null {
  if (!q || q === '?') return q === '?' ? null : [];
  try { return [...new URLSearchParams(q.slice(1)).keys()]; } catch { return null; }
}

/** The held boot token's fingerprint: a keyed rolling hash over its length, confirmed by sha256. Never the value. */
interface Held { readonly len: number; readonly sum: string; readonly roll: number; readonly base: number; readonly high: number }
const P = 2147483647;
function rollOf(s: string, base: number): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * base + s.charCodeAt(i)) % P; return h; }
function contains(text: string, held: Held): boolean {
  const n = held.len;
  if (text.length < n) return false;
  let h = rollOf(text.slice(0, n), held.base);
  for (let i = 0; ; i++) {
    if (h === held.roll && sha(text.slice(i, i + n)) === held.sum) return true;
    if (i + n >= text.length) return false;
    h = (h - (text.charCodeAt(i) * held.high) % P + P) % P;
    h = (h * held.base + text.charCodeAt(i + n)) % P;
  }
}

export class LivePolicy {
  private recs = new WeakMap<object, Rec>();
  private gen = 0;
  private disposed = false;
  private held: Held | null = null;

  constructor(private readonly deps: PolicyDeps) {}

  /** The policy generation; moved by `bump()`. */
  get policyGeneration(): number { return this.gen; }
  bump(): void { this.gen++; }

  /** Holds the boot token's fingerprint while the token is in memory: any header, URL or other body containing it is refused. */
  holdBootToken(token: string): void {
    const base = 256 + Math.floor(Math.random() * 1_000_000);
    let high = 1;
    for (let i = 1; i < token.length; i++) high = (high * base) % P;
    this.held = token.length ? Object.freeze({ len: token.length, sum: sha(token), roll: rollOf(token, base), base, high }) : null;
  }
  dropBootToken(): void { this.held = null; }

  dispose(): void { this.disposed = true; this.recs = new WeakMap(); this.held = null; }

  private rowOne(): Refusal | null {
    if (this.disposed) return refusal('TERM_STALE', 'stale');
    const s = this.deps.state();
    return s === 'live' ? null : s === 'locked' ? refusal('TERM_LOCKED') : refusal('TERM_STALE', 'stale');
  }

  private secretScreen(route: Route, record?: unknown): Refusal | null {
    const asks = route.secret === true || (route.codes ?? []).includes('OTP_REQUIRED');
    const unshown = this.deps.unshownSecrets.has(route) || (record !== undefined && this.deps.unshownRecord?.(record) === true);
    return asks && !unshown && !this.deps.secretReveal() ? refusal('TERM_SECRET_SCREEN') : null;
  }

  private leftOut(route: Route): boolean { return route.scope === 'kit' && LEFT_OUT.has(String(route.kit)); }

  /** With the store usable at all: before input capture, hashing, locks or journal writes. */
  refuseEarly(route: unknown, family: Family): Refusal | null {
    const one = this.rowOne();
    if (one) return one;
    if (!isDeclared(route) || !Object.hasOwn(LEGS_OF, family)) return refusal('TERM_ROUTE_UNDECLARED');
    const leg: Leg = route.scope === 'base' || route.scope === 'realm' ? 'hoody' : route.ws === true ? 'socket' : route.scope;
    if (!LEGS_OF[family].includes(leg)) return refusal('TERM_ROUTE_UNDECLARED');
    if (this.leftOut(route)) return refusal('TERM_NOT_IN_TERMINAL');
    if (isChangeCall(route, route.method) && !isPostRead(route)) {
      const m = this.deps.storeMode();
      if (m !== 'rw') return refusal(m === 'ro' ? 'TERM_READ_ONLY' : 'NOT_DURABLE');
    }
    return this.secretScreen(route);
  }

  /** The admission table on the call's own arguments. */
  admitLive(call: PolicyCall): { ok: true; admission: Admission } | Refusal {
    const one = this.rowOne();
    if (one) return one;
    const d = this.deps;
    const route = call.route;
    // Row 2: declared by identity, the census row's leg, the route's own method, scope and template.
    if (!isDeclared(route) || !Object.hasOwn(LEGS_OF, call.family) || !LEGS_OF[call.family].includes(call.leg)) return refusal('TERM_ROUTE_UNDECLARED');
    const method = String(call.method);
    if (method !== route.method) return refusal('TERM_ROUTE_UNDECLARED');
    const legOk = call.leg === 'hoody' ? route.scope === 'base' || route.scope === 'realm'
      : call.leg === 'socket' ? route.scope === 'agent' && route.ws === true
      : route.scope === call.leg && route.ws !== true;
    if (!legOk || typeof call.url !== 'string') return refusal('TERM_ROUTE_UNDECLARED');
    const change = isChangeCall(route, method);

    // Rows 2-3 per leg: the path against the template, then the destination.
    const dest = call.leg === 'hoody' ? this.hoodyDestination(call, route, method) : this.computerDestination(call, route);
    if (dest) return dest;

    // Row 4: the credential class.
    const cred = this.credentialClass(call, route);
    if (typeof cred !== 'object' || cred === null || 'ok' in cred) return cred as Refusal;
    // Row 5.
    if (this.leftOut(route)) return refusal('TERM_NOT_IN_TERMINAL');
    // Row 6: every change needs its durable record; a POST read (post-reads.ts) is a read here, and keeps its body (row 8).
    if (change && !isPostRead(route)) {
      const m = d.storeMode();
      if (m !== 'rw') return refusal(m === 'ro' ? 'TERM_READ_ONLY' : 'NOT_DURABLE');
      if (!d.recordKept(call.record)) return refusal('NOT_DURABLE');
    }
    // Row 7 (the call's own record may say its answer is never shown).
    const screen = this.secretScreen(route, call.record);
    if (screen) return screen;
    // Row 8: a read carries no body.
    if (!change && ((call.body !== null && call.body !== undefined) || call.stream)) return refusal('TERM_ROUTE_UNDECLARED');

    const body = this.bodyOf(call, route);
    if (!body) return refusal('TERM_ROUTE_UNDECLARED');
    const s = d.session();
    const desc: Descriptor = Object.freeze({
      family: call.family, leg: call.leg, method, url: call.url,
      headers: call.leg === 'hoody' ? undefined : cred.headers,
      bodyDigest: body.digest, bodyKind: body.kind, sid: s.sid, generation: s.generation, policyGeneration: this.gen,
    });
    const admission: Admission = Object.freeze(Object.create(null) as Admission);
    this.recs.set(admission, { desc, state: 'minted', sealed: call.leg === 'hoody', lease: declaresLease(route) });
    return { ok: true, admission };
  }

  private hoodyDestination(call: PolicyCall, route: Route, method: string): Refusal | null {
    const d = this.deps, { apiOrigin, realmApiDomain } = d.places;
    const m = HOODY_URL.exec(call.url);
    if (!m) return refusal('TERM_DESTINATION');
    const [, origin, path, query] = m as unknown as [string, string, string, string | undefined];
    if (DOT_SEGMENT.test(path) || !route.pattern.test(path)) return refusal('TERM_ROUTE_UNDECLARED');
    const keys = queryKeys(query);
    if (keys === null || keys.some((k) => !route.query.includes(k))) return refusal('TERM_ROUTE_UNDECLARED');
    // The identity of the token, by route identity, before the token session's base-only refusal.
    if (route === d.introspection) {
      return d.tokenSession() && call.url === apiOrigin + API + '/auth/tokens/me' && (call.body === null || call.body === undefined) ? null : refusal('TERM_DESTINATION');
    }
    if (route.scope !== 'base' && route.scope !== 'realm') return refusal('TERM_ROUTE_UNDECLARED');
    const realm = d.realm();
    const r = d.hoodyRoute(method, path, call.body ?? null, route.scope, realm, route.baseOnly === true);
    if ('refused' in r) return refusal(r.refused);
    let want: string;
    if (r.base === API) want = apiOrigin;
    else {
      const h = /^https:\/\/([0-9a-f]{24})\.([^/]+)\/api\/v1$/.exec(r.base);
      if (!h || h[2] !== realmApiDomain || h[1] !== realm) return refusal('TERM_DESTINATION');
      want = 'https://' + h[1] + '.' + realmApiDomain;
    }
    return origin === want ? null : refusal('TERM_DESTINATION');
  }

  private computerDestination(call: PolicyCall, route: Route): Refusal | null {
    const d = this.deps, { apiOrigin, realmApiDomain, proxyDomain } = d.places;
    const t = call.target;
    if (!t || !proxyDomain || typeof t.project !== 'string' || typeof t.computer !== 'string' || typeof t.server !== 'string' || !t.server) return refusal('TERM_DESTINATION');
    const leg = call.leg === 'kit' ? 'kit' : 'agent';
    const origin = d.computerOrigin(leg, t, route, call.index);
    const om = /^https:\/\/([^/?#:@]+)$/.exec(origin);
    if (!om) return refusal('TERM_DESTINATION');
    const host = om[1]!;
    const apiHost = apiOrigin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    // Under the proxy domain (or its family twin), on the target's own server; never the API or a realm API host, even
    // if the places overlap (seamPlaces refuses that at boot; this does not rely on it).
    if (!familyDomains(proxyDomain).some((fd) => host.endsWith('.' + t.server + '.' + fd))) return refusal('TERM_DESTINATION');
    if (host === apiHost || host === realmApiDomain || host.endsWith('.' + realmApiDomain)) return refusal('TERM_DESTINATION');
    const prefix = (call.leg === 'socket' ? origin.replace(/^https:/, 'wss:') : origin) + (leg === 'agent' ? API + '/agent' : '');
    if (!call.url.startsWith(prefix + '/')) return refusal('TERM_DESTINATION');
    const rest = /^(\/[^?#]*)(\?[^#]*)?$/.exec(call.url.slice(prefix.length));
    if (!rest) return refusal('TERM_DESTINATION');
    const [, path, query] = rest as unknown as [string, string, string | undefined];
    if (DOT_SEGMENT.test(path) || !route.pattern.test(path)) return refusal('TERM_ROUTE_UNDECLARED');
    const keys = queryKeys(query);
    const realmParam = leg === 'agent' && route.realm !== 'none';
    if (keys === null || keys.some((k) => !route.query.includes(k) && !(realmParam && k === 'realm'))) return refusal('TERM_ROUTE_UNDECLARED');
    if (realmParam && !this.agentRealmOk(route, query)) return refusal('TERM_DESTINATION');
    // Positive membership: unknown is a refusal; core's routingAllows may only refuse more.
    const v = destinationVerdict(d.members, { account: d.account(), project: t.project, computer: t.computer, server: t.server }, d.selection(), (c, s) => d.routingAllows(c, s));
    return v.ok ? null : refusal('TERM_DESTINATION');
  }

  /** Row 3, agent leg: the `realm=` value, the one core sends (kit.ts agentRealm, admit): at most one; with an access
   *  key's pin exactly the pin; otherwise a realm id or 'global' (a Global Bot shows in every realm), equal to the
   *  selected realm when one is selected; 'all' only on a 'list' route in "All realms". None only on an 'opt' route. */
  private agentRealmOk(route: Route, query: string | undefined): boolean {
    let vals: string[];
    try { vals = new URLSearchParams(query ? query.slice(1) : '').getAll('realm'); } catch { return false; }
    if (vals.length > 1) return false;
    if (vals.length === 0) return route.realm === 'opt';
    const v = vals[0]!, sel = this.deps.selection();
    if (sel.pin !== null) return v === sel.pin;
    if (v === 'all') return route.realm === 'list' && sel.realm === null;
    return isRealmOrGlobal(v) && (sel.realm === null || v === sel.realm || v === 'global');
  }

  /** Row 4. On a computer leg: the descriptor's header list (name + digest). */
  private credentialClass(call: PolicyCall, route: Route): { headers: ReadonlyArray<readonly [string, string]> } | Refusal {
    const no = refusal('TERM_CREDENTIAL_CLASS');
    const plan = call.headers ?? {};
    const caller = call.callerHeaders ?? {};
    if (!isObj(plan) || !isObj(caller)) return no;
    if (Object.keys(caller).length && !(call.leg === 'kit' && route.run === true)) return no;
    const seen = new Set<string>();
    const list: Array<readonly [string, string]> = [];
    const hasBody = (call.body !== null && call.body !== undefined) || !!call.stream;
    for (const [from, hs] of [['plan', plan], ['caller', caller]] as const) {
      for (const [k, v] of Object.entries(hs)) {
        const n = k.toLowerCase();
        if (typeof v !== 'string' || seen.has(n)) return no;
        seen.add(n);
        if (n === 'cookie' || n === 'cookie2') return no;
        if (call.leg === 'hoody') {
          if (CREDENTIAL_HEADERS.has(n)) return no;
        } else if (from === 'plan') {
          if (!planHeaderAllowed(n, route, call.leg, hasBody)) return no; // the lease too: added only at seal, from the spent ticket
        } else if (n.startsWith('x-hoody-') || n === 'proxy-authorization') return no;
        if (this.held && contains(v, this.held)) return no;
        list.push([n, sha(v)] as const);
      }
    }
    if (this.held) {
      if (contains(call.url, this.held)) return no;
      const text = typeof call.body === 'string' ? call.body : call.body instanceof Uint8Array ? null : canonicalJson(call.body ?? null);
      if (call.body instanceof Uint8Array) {
        if (contains(Buffer.from(call.body).toString('latin1'), this.held)) return no;
      } else if (text !== null && contains(text, this.held) && !(call.leg === 'agent' && route === this.deps.bootstrap)) return no;
    }
    return { headers: Object.freeze(list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
  }

  private bodyOf(call: PolicyCall, route: Route): { kind: Descriptor['bodyKind']; digest: string | null } | null {
    if (call.stream) {
      const s = call.stream;
      if (call.body !== null && call.body !== undefined) return null;
      if (call.leg !== 'kit' || route.upload !== true) return null;
      if (typeof s.path !== 'string' || ![s.size, s.mtimeMs, s.length].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
      return { kind: 'stream', digest: sha(canonicalJson({ path: s.path, size: s.size, mtimeMs: s.mtimeMs, length: s.length }) as string) };
    }
    const b = call.body;
    if (b === null || b === undefined) return { kind: 'none', digest: null };
    if (call.leg === 'hoody') {
      const j = canonicalJson(b);
      return j === null ? null : { kind: 'json', digest: sha(j) };
    }
    if (typeof b === 'string' || b instanceof Uint8Array) return { kind: 'bytes', digest: sha(b) };
    return null;
  }

  /**
   * Stage two: a computer send's final headers, once, before its transport call. Equal to the plan's (same names,
   * same values) plus at most `X-Hoody-Approver-Lease`, on a route that declares a lease ticket. False (nothing sealed) otherwise.
   */
  seal(adm: unknown, finalHeaders: Readonly<Record<string, string>>): boolean {
    const r = this.live(adm);
    if (!r || r.state !== 'minted' || r.sealed || r.desc.headers === undefined || !isObj(finalHeaders)) return false;
    const plan = new Map(r.desc.headers.map(([n, v]) => [n, v] as const));
    const fin: Array<readonly [string, string]> = [];
    const seen = new Set<string>();
    for (const [k, v] of Object.entries(finalHeaders)) {
      const n = k.toLowerCase();
      if (typeof v !== 'string' || seen.has(n)) return false;
      seen.add(n);
      const dg = sha(v);
      if (n === LEASE && !plan.has(n)) {
        if (!r.lease) return false;
        if (this.held && contains(v, this.held)) return false;
      } else if (plan.get(n) !== dg) return false;
      fin.push([n, dg] as const);
    }
    if ([...plan.keys()].some((n) => !seen.has(n))) return false;
    r.desc = Object.freeze({ ...r.desc, headers: Object.freeze(fin.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) });
    r.sealed = true;
    return true;
  }

  /** A record that is known to this mount and still of the current session and policy generation, else null. */
  private live(adm: unknown): Rec | null {
    if (this.disposed || typeof adm !== 'object' || adm === null) return null;
    const r = this.recs.get(adm);
    if (!r) return null;
    const s = this.deps.session();
    return r.desc.sid === s.sid && r.desc.generation === s.generation && r.desc.policyGeneration === this.gen ? r : null;
  }

  /** Ends the record it names and reports: once per record (a later refusal of the same record is the same bypass);
   *  a proof that names no record (forged, of another mount, disposed) is reported each time. */
  private bypass(adm: unknown): 'TERM_POLICY_BYPASS' {
    const r = typeof adm === 'object' && adm !== null ? this.recs.get(adm) : undefined;
    if (r) r.state = 'ended';
    if (!r || !r.reported) this.deps.onBypass('TERM_POLICY_BYPASS');
    if (r) r.reported = true;
    return 'TERM_POLICY_BYPASS';
  }

  /** The transport's first step. Claims the record (once) and compares the actual wire arguments. */
  verifyAdmission(adm: unknown, actual: WireAttempt): 'ok' | 'TERM_POLICY_BYPASS' {
    const r = this.live(adm);
    if (!r || r.state !== 'minted' || !r.sealed || this.deps.state() !== 'live') return this.bypass(adm);
    r.state = 'claimed';
    if (attemptVerdict(r.desc, actual) !== 'ok') return this.bypass(adm);
    return 'ok';
  }

  /** The client's `beforeWire(attempt)` for one claimed call: every attempt against the final descriptor. */
  beforeWire(adm: unknown): (attempt?: WireAttempt) => boolean {
    const r = typeof adm === 'object' && adm !== null ? this.recs.get(adm) : undefined;
    if (!r) return () => { this.bypass(adm); return false; };
    let check: ((a?: WireAttempt) => boolean) | null = null;
    return (attempt) => {
      const now = this.live(adm);
      if (!now || now.state !== 'claimed' || this.deps.state() !== 'live') { this.bypass(adm); return false; }
      check ??= boundBeforeWire(now.desc, () => true, () => { this.bypass(adm); });
      return check(attempt);
    };
  }

  /** The call ended (answer, refusal, timeout, cancellation, a trip): its Admission is dead in this mount. */
  end(adm: unknown): void {
    const r = typeof adm === 'object' && adm !== null ? this.recs.get(adm) : undefined;
    if (r) r.state = 'ended';
  }

  /** Diagnostics and tests: a known Admission's descriptor with the URL as its digest (no value leaves), else null. */
  descriptor(adm: unknown): DescriptorView | null {
    const r = typeof adm === 'object' && adm !== null && !this.disposed ? this.recs.get(adm) : undefined;
    if (!r) return null;
    const { url, ...rest } = r.desc;
    return Object.freeze({ ...rest, urlDigest: sha(url) });
  }
}
