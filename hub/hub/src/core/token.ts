// token.ts: a shared-access (token) session's check, capabilities and timers
// (the introspection answer is read by token-auth.js parseTokenIntrospection).
//
// Contract, in plain words:
//   - Capabilities: caps(intro) keeps only the permission leaves that are exactly true (at most 6 deep); the
//     events and vault flags need both halves. can(caps, cap) answers for one dotted capability; 'account' and
//     'credentials' are never part of shared access. A session holds at least computers.read and
//     projects.read, else it is invalid.
//   - can(cap) (pages): every capability in an account session; in a token session only the checked ones, and
//     nothing before the first check answered.
//   - checkToken: GET /auth/tokens/me on the base host only, with the page's bearer only while storage holds the
//     page identity, 10 s timeout. Concurrent callers share one request. One answer table: ok | realm | invalid
//     | ended | network | unavailable | busy | unknown | superseded. A 429's Retry-After (1..300 s, 30 s
//     without one) holds later checks: until it passes they answer busy and send nothing. The token must
//     allow the pinned realm (or, for 'all', no list and allow_no_realm).
//   - check() mid-session: ok stores the caps (a change is announced: notice 'changed'); unknown and busy keep
//     the session; anything else ends it through the shell's end(reason).
//   - refused(e) (api.ts token refusal, for a 401/403 of a base or realm call): a 401 is verified by a check
//     before anything ends (an unknown answer: notice 'offline'; the 30 s bound below, which the first 401 after an
//     ok recheck skips once per init); IP_NOT_ALLOWED ends as network,
//     ACCOUNT_BANNED as unavailable; INSUFFICIENT_PERMISSIONS names the leaf (the server's exact sentence, else
//     routePerms.ts) as `perm` and rechecks at most once every 30 s; a change's named refusal notices 'notAllowed' at
//     once, a read's never does, and a read's recheck announces nothing (reads never toast). The decisions read the
//     answer as it came (`raw`), before a secret route's scrub, which keeps only the leaf.
//   - tokenLack (api.ts, before a send): the leaf the read caps lack for a declared route, so the call is refused
//     unsent (TOKEN_LACKS) instead of asked of the server; nothing is decided before the caps are read. The refusal
//     rechecks too (same 30 s bound), so a right granted since is used by the next try.
//   - boot: the check, then the identity on the pinned host (it must be the record's owner), then started();
//     busy/unknown show the offline panel (busy with its wait).
//   - timers: the expiry check at expires_at + 5 s (afterwards at most every 5 minutes), a notice 24 h before
//     the end (once, re-read when due), a recheck when the page becomes visible after 5 minutes; nothing while
//     hidden, after teardown, or once storage no longer holds the page.
import { useSyncExternalStore } from 'react';
import type { HubError } from './api';
import { hostEnv } from './host-env';
import { onTeardown } from './realm';
import { LACKS_SENTENCES, routeLeaves, lackOf } from './routePerms';
import { defineRoute, type Route } from './routes';
import { API_BASE, holds, shared, type PageIdentity } from './session';
import { tokenRealm, tokenSession } from './ctx';
import { assertFixturesAllowed, transport } from './transport';

const DAY = 86400000, RECHECK = 300000, AFTER = 5000, MAX_DELAY = 2147483647, MAX_DEPTH = 6;
const HEX = /^[0-9a-fA-F]{24}$/;

// ---- the introspection (token-auth.js parseTokenIntrospection) ----

export interface TokenIntro {
  readonly id: string;
  readonly alias: string;
  readonly perms: Readonly<Record<string, unknown>>;
  readonly expiresAt: number | null;
  readonly realmIds: readonly string[];
  readonly allowNoRealm: boolean;
  readonly vaultAccess: boolean;
  readonly eventAccess: boolean;
  readonly isEnabled: boolean;
}

function plain(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;
}

// Only exact-true leaves survive; other values, prototype keys and trees deeper than 6 are dropped.
function trueLeaves(o: unknown, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!plain(o) || depth > MAX_DEPTH) return out;
  for (const k of Object.keys(o)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const v = o[k];
    if (v === true) out[k] = true;
    else if (plain(v)) { const sub = trueLeaves(v, depth + 1); if (Object.keys(sub).length) out[k] = sub; }
  }
  return out;
}

/** GET /auth/tokens/me's answer, checked; null for a malformed body. */
export function parseTokenIntrospection(body: unknown): TokenIntro | null {
  const d = plain(body) && plain(body.data) ? body.data : body;
  const tk = plain(d) ? d.token : null;
  if (!plain(tk) || typeof tk.id !== 'string' || !tk.id || typeof tk.alias !== 'string') return null;
  if (!Array.isArray(tk.realm_ids) || tk.realm_ids.length > 1000 || typeof tk.allow_no_realm !== 'boolean' || !plain(tk.permissions)) return null;
  const realms: string[] = [];
  for (const r0 of tk.realm_ids as unknown[]) {
    if (typeof r0 !== 'string' || !HEX.test(r0)) return null;
    const r = r0.toLowerCase();
    if (!realms.includes(r)) realms.push(r);
  }
  let exp: number | null = null;
  if (tk.expires_at !== null && tk.expires_at !== undefined) {
    exp = typeof tk.expires_at === 'string' ? Date.parse(tk.expires_at) : NaN;
    if (!isFinite(exp)) return null;
  }
  return Object.freeze({
    id: tk.id, alias: tk.alias, perms: trueLeaves(tk.permissions, 0), expiresAt: exp, realmIds: Object.freeze(realms),
    allowNoRealm: tk.allow_no_realm, vaultAccess: tk.vault_access === true, eventAccess: tk.event_access === true,
    isEnabled: tk.is_enabled !== false,
  });
}

// ---- capabilities ----

export interface TokenCaps {
  readonly leaves: Readonly<Record<string, true>>;
  readonly events: boolean;
  readonly vault: boolean;
}

function leavesOf(tree: unknown): Record<string, true> {
  const out: Record<string, true> = Object.create(null) as Record<string, true>;
  (function walk(o: Record<string, unknown>, path: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    for (const k of Object.keys(o)) {
      const v = o[k], p = path ? path + '.' + k : k;
      if (v === true) out[p] = true;
      else if (plain(v)) walk(v, p, depth + 1);
    }
  })(plain(tree) ? tree : {}, '', 0);
  return out;
}

export function capsOf(intro: Pick<TokenIntro, 'perms' | 'eventAccess' | 'vaultAccess'> | null): TokenCaps {
  const leaves = leavesOf(intro && intro.perms);
  return Object.freeze({
    leaves: Object.freeze(leaves),
    // Flag pairs: each half alone grants nothing.
    events: !!(intro && intro.eventAccess === true && leaves['resources.events'] === true),
    vault: !!(intro && intro.vaultAccess === true && leaves['resources.vault'] === true),
  });
}

/** One capability of a capability set. 'account' and 'credentials' are never part of shared access. */
export function capsAllow(c: TokenCaps | null, cap: string): boolean {
  if (!c || !c.leaves || typeof cap !== 'string') return false;
  if (cap === 'account' || cap === 'credentials') return false;
  if (cap === 'events') return c.events === true;
  if (cap === 'vault') return c.vault === true;
  return c.leaves[cap] === true;
}

export function minimumHeld(c: TokenCaps | null): boolean { return capsAllow(c, 'computers.read') && capsAllow(c, 'projects.read'); }

// ---- the session's state ----

export type TokenEnd = 'realm' | 'invalid' | 'ended' | 'network' | 'unavailable' | 'superseded';
export type TokenAnswer = { r: 'ok'; caps: TokenCaps; intro: TokenIntro; changed?: boolean } | { r: TokenEnd } | { r: 'busy' | 'unknown'; after?: number | null };
/** notAllowed: a change this session's token may not make, by the leaf it lacks (routePerms.ts, or the server's
 *  answer), with the pinned realm ('all' or a 24-hex id). Only a named leaf notices; reads never do: their page says
 *  it in place (kit errorWords). */
export type TokenNotice = { notice: 'changed' | 'offline' } | { notice: 'notAllowed'; perm: string; realm: string } | { notice: 'ending'; leftMs: number };

export interface TokenInfo {
  readonly owner: { readonly id: string; readonly username: string };
  readonly realm: string;
  readonly expiresAt: number | null;
  readonly alias: string;
  readonly tokenId: string;
}

/** What the shell gives the token session (lifecycle.ts binds it). */
export interface TokenShell {
  readonly page: PageIdentity;
  /** The pinned realm: 'all' or a 24-hex id. */
  readonly realm: string;
  end(reason: TokenEnd): void;
  panel(kind: 'offline', retryAfterS?: number): void;
  /** Says `n`; true only when a surface showed it (the shell's toast handler took it), so a page's own toast can
   *  step aside for it. */
  notice(n: TokenNotice): boolean | void;
  /** The identity read on the pinned host; null when the read failed (refused() owns the 401/403). */
  me(): Promise<{ id: string; username: string } | { failed: HubError }>;
  started(identity: { id: string; username: string }): void;
  shown(): string;
  now?(): number;
}

export const tokenMeRoute = defineRoute<unknown>({ method: 'GET', path: '/auth/tokens/me', scope: 'base' });

let S: TokenShell | null = null;
let caps: TokenCaps | null = null;
let intro: TokenIntro | null = null;
let checking: Promise<TokenAnswer> | null = null;
let recheckAt = 0, nextAt = 0;
// A 401 skips the 30 s bound once per shell init (:1051): one that comes just after a recheck that answered ok is
// verified now. After an unanswered recheck the bound holds (no storm of checks while the server cannot answer).
let unboundUsed = false, lastRecheckOk = false;
const capListeners = new Set<() => void>();
let stopTimers: (() => void) | null = null;

const now = () => (S && S.now ? S.now() : Date.now());
function setCaps(c: TokenCaps | null): void {
  caps = c;
  for (const l of [...capListeners]) { try { l(); } catch { /* the listener's own */ } }
}

function checkToken(): Promise<TokenAnswer> {
  const s = S;
  if (!s) return Promise.resolve({ r: 'unknown' });
  if (!checking && now() < nextAt) return Promise.resolve({ r: 'busy', after: Math.ceil((nextAt - now()) / 1000) });
  if (checking) return checking;
  const page = s.page;
  const meta = { route: tokenMeRoute, method: 'GET', path: '/auth/tokens/me', query: {}, body: null };
  checking = transport().hoody('GET', '/auth/tokens/me', null, { base: API_BASE, session: page, timeoutMs: 10000 }, meta).then((b): TokenAnswer => {
    if (!holds(page)) return { r: 'superseded' };
    const x = parseTokenIntrospection(b);
    if (!x) return { r: 'unknown' };
    // The server's own rule: a pinned realm needs no list or a listed realm; 'all' needs no list and allow_no_realm.
    const none = !x.realmIds.length;
    if (!(s.realm === 'all' ? none && x.allowNoRealm : none || x.realmIds.includes(s.realm))) return { r: 'realm' };
    const c = capsOf(x);
    return minimumHeld(c) ? { r: 'ok', caps: c, intro: x } : { r: 'invalid' };
  }, (err: unknown): TokenAnswer => {
    const e = err as HubError | null;
    const st = e && e.status, code = st === 403 && e ? e.code : null;
    if (!holds(page) || shared().isSupersededAuthError(e)) return { r: 'superseded' };
    if (st === 429) nextAt = now() + Math.min(Math.max(typeof e?.retryAfter === 'number' ? e.retryAfter : 30, 1), 300) * 1000;
    if (st === 401) return { r: 'ended' };
    if (code === 'IP_NOT_ALLOWED') return { r: 'network' };
    if (code === 'ACCOUNT_BANNED') return { r: 'unavailable' };
    return { r: st === 429 ? 'busy' : 'unknown', after: e ? e.retryAfter : undefined };
  }).then((res) => { checking = null; return res; });
  return checking;
}

/** Checks the token now and acts on the answer (the shell's Retry, the timers, refused()). `announce`: a change of
 *  the caps notices 'changed' (false for a recheck a read caused: reads never toast; the caps still update). */
export function checkTokenSession(announce = true): Promise<TokenAnswer> {
  return checkToken().then((res) => {
    if (res.r === 'ok') {
      const was = caps;
      intro = res.intro;
      if (was && JSON.stringify(was) !== JSON.stringify(res.caps)) { res.changed = true; setCaps(res.caps); if (announce) S?.notice({ notice: 'changed' }); }
      else if (!was) setCaps(res.caps);
    } else if (res.r !== 'unknown' && res.r !== 'busy') S?.end(res.r);
    return res;
  });
}

// The server's 403 for a missing leaf: its message
// names the leaf. Read only when it is exactly that sentence and the leaf is one routePerms.ts knows: never shown.
const LACKS_MESSAGE = /^This token does not have permission: ([a-z_]+(?:\.[a-z_]+){1,5})$/;

/** May the token do `leaf`? The flag pairs (vault, events) need both halves, as the server checks them. */
function holdsLeaf(c: TokenCaps | null, leaf: string): boolean {
  if (leaf === 'resources.vault') return capsAllow(c, 'vault');
  if (leaf === 'resources.events') return capsAllow(c, 'events');
  return capsAllow(c, leaf);
}

/** api.ts, before a base or realm call is sent in a token session: the leaf this token lacks for it (routePerms.ts),
 *  'never' when no token is served there, null when it may send or the caps were not read yet (sent as before:
 *  never a guess). */
export function tokenLack(method: string, template: string, path: string): string | 'never' | null {
  if (!tokenSession() || !caps) return null;
  const c = caps;
  return lackOf(method, template, path, (l) => holdsLeaf(c, l), tokenRealmBound());
}

/** Whether this session's token is limited to realms: its realm list (or no realm-free use), or, for caps seeded
 *  without an introspection (fixtures), a pin on one realm. Today every route refused to such tokens is also
 *  account-only (tokenRoute refuses those first); this keeps a later route that is not answered right. */
export function tokenRealmBound(): boolean {
  return intro ? intro.realmIds.length > 0 || !intro.allowNoRealm : tokenRealm() !== 'all';
}

/** api.ts: a call refused unsent for a leaf (tokenLack). A change says so (the shell dedupes per leaf; true: said,
 *  api.ts marks the refusal tokenSaid so the page's toast steps aside); a read never does. Either rechecks the caps (at most once every 30 s), so a right the owner granted since reaches the next try. */
export function tokenLacked(perm: string, change: boolean): boolean {
  const said = change && S ? S.notice({ notice: 'notAllowed', perm, realm: S.realm }) === true : false;
  recheck(change);
  return said;
}

/** One caps recheck, at most every 30 s (shared by local refusals, 401s and 403s). A read's announces nothing:
 *  neither 'changed' nor, for a 401's check, 'offline'. An answer that ends the session still ends it, read or
 *  change (checkTokenSession). */
function recheck(change: boolean, offlineIfUnknown = false): void {
  if (now() - recheckAt < 30000) return;
  recheckAt = now();
  void checkTokenSession(change).then((res) => { lastRecheckOk = res.r === 'ok'; if (offlineIfUnknown && change && res.r === 'unknown') S?.notice({ notice: 'offline' }); });
}

/** The leaf a 403 names: only the server's own sentence (the plain form, or one of its fixed per-right sentences,
 *  routePerms.ts LACKS_SENTENCES), never a guess from the read caps (stale once the owner changed them). Any other
 *  answer names nothing: the page says it in the general words. */
function refusedLeaf(e: HubError): string | null {
  const msg = typeof e.message === 'string' ? e.message : '';
  const m = LACKS_MESSAGE.exec(msg);
  const said = m ? m[1]! : Object.hasOwn(LACKS_SENTENCES, msg) ? LACKS_SENTENCES[msg]! : null;
  return said && routeLeaves().includes(said) ? said : null;
}

/** api.ts's token refusal: a 401/403 of a base or realm call sent with the page's bearer. `_route`/`_path`: the call
 *  (unused since the leaf comes from the server's sentence only); `change`: it was a change; `raw`: the answer as it came, before a secret
 *  route's scrub (decided on, never returned). The answer gets `perm` (the leaf it names, or null; named, it carries
 *  the code INSUFFICIENT_PERMISSIONS though a scrub dropped it) and a change's named refusal notices at once (marked
 *  tokenSaid only when a surface showed it: the page's toast steps aside). */
export function tokenRefused(e: HubError, _route: Route | null = null, _path = '', change = true, raw: HubError = e): HubError {
  const code = raw.code;
  if (e.status === 401) {
    // Verified by a check before anything ends (the shared bound): ended ends; a change's unknown answer says offline.
    // The first 401 inside the bound after an ok recheck is checked at once (once per shell init), so a token that
    // ended just after that recheck is not left refusing until the next timer (not while a check is out: it may
    // predate the 401).
    if (!unboundUsed && lastRecheckOk && !checking && now() - recheckAt < 30000) { unboundUsed = true; recheckAt = 0; }
    recheck(change, true);
    return { ...e };
  }
  if (code === 'IP_NOT_ALLOWED') S?.end('network');
  else if (code === 'ACCOUNT_BANNED') S?.end('unavailable');
  else if (code === 'INSUFFICIENT_PERMISSIONS') {
    const perm = refusedLeaf(raw);
    // Only a named leaf toasts; an unnamed refusal is the page's to say (its own error words), never a vague notice.
    // Said at once whatever the recheck answers: the page's own toast steps aside for it (Toast.tsx showErrorToast).
    const said = change && perm && S ? S.notice({ notice: 'notAllowed', perm, realm: S.realm }) === true : false;
    recheck(change);
    return perm ? { ...e, code: 'INSUFFICIENT_PERMISSIONS', perm, ...(said ? { tokenSaid: true } : {}) } : { ...e, perm };
  }
  return e;
}

export function tokenInfo(): TokenInfo | null {
  if (!S) return null;
  const x = intro;
  return Object.freeze({
    owner: Object.freeze({ id: S.page.uid, username: S.shown() }), realm: S.realm,
    expiresAt: x && typeof x.expiresAt === 'number' ? x.expiresAt : null, alias: (x && x.alias) || '', tokenId: (x && x.id) || '',
  });
}

/** Boot of a token session: the check, the identity (the record's owner), started(), then the timers. */
export async function bootToken(shell: TokenShell): Promise<void> {
  bindToken(shell);
  const s = shell;
  const res = await checkToken();
  if (S !== s) return;
  if (res.r === 'busy' || res.r === 'unknown') { s.panel('offline', res.r === 'busy' ? (typeof res.after === 'number' ? res.after : 30) : undefined); return; }
  if (res.r !== 'ok') { s.end(res.r); return; }
  intro = res.intro;
  setCaps(res.caps);
  const me = await s.me();
  if (S !== s) return;
  if ('failed' in me) {
    const e = me.failed;
    if (shared().isSupersededAuthError(e) || (e && e.stale)) { s.end('superseded'); return; }
    // refused() ended the session or showed its panel; whatever it keeps would leave no shell: the offline
    // panel, once refused()'s check settles.
    if (e && e.status === 403 && (e.code === 'IP_NOT_ALLOWED' || e.code === 'ACCOUNT_BANNED')) return;
    const r = await (checking || Promise.resolve(null));
    if (S !== s) return;
    if (!r || r.r === 'ok' || r.r === 'busy' || r.r === 'unknown') s.panel('offline');
    return;
  }
  if (me.id !== s.page.uid) { s.end('invalid'); return; }
  s.started(me);
  stopTimers = timers(s);
}

function bindToken(shell: TokenShell): void {
  if (stopTimers) stopTimers();
  stopTimers = null;
  S = shell; caps = null; intro = null; checking = null; recheckAt = 0; nextAt = 0; unboundUsed = false; lastRecheckOk = false;
}

// ---- timers ----

function timers(s: TokenShell): () => void {
  let stopped = false, last = now(), looked = false, toasted = false;
  const handles: { expiry: ReturnType<typeof setTimeout> | null; ending: ReturnType<typeof setTimeout> | null } = { expiry: null, ending: null };
  const validExp = (): number | null => { const x = intro && intro.expiresAt; return typeof x === 'number' && isFinite(x) ? x : null; };
  function live(): boolean { if (!stopped && (S !== s || !holds(s.page))) stop(); return !stopped; }
  function clear(k: 'expiry' | 'ending'): void { const h = handles[k]; if (h !== null) { clearTimeout(h); handles[k] = null; } }
  // One timer per kind; a wait past setTimeout's ceiling sleeps the ceiling and decides again.
  function at(k: 'expiry' | 'ending', when: number, f: () => void): void {
    clear(k);
    handles[k] = setTimeout(() => {
      handles[k] = null;
      if (!live()) return;
      if (when - now() > 0) at(k, when, f); else f();
    }, Math.min(Math.max(0, when - now()), MAX_DELAY));
  }
  const hidden = () => !hostEnv().visible();
  function check(): void {
    if (!live()) return;
    last = now(); looked = true;
    checkTokenSession().then(null, () => null).then(() => {
      // An ending is the shell's to act on; while this page still holds the session, look again later.
      if (!live()) return;
      if (hidden()) { clear('expiry'); return; }
      arm();
    });
  }
  // The expiry check waits for expires_at + 5 s. Only once that passed and a check ran is the next look the
  // 5-minute floor after the last check.
  function armExpiry(): void {
    const exp = validExp();
    if (exp === null) { clear('expiry'); return; }
    const due = exp + AFTER;
    at('expiry', looked && now() >= due ? last + RECHECK : due, check);
  }
  function armEnding(): void {
    const exp0 = validExp();
    if (exp0 === null || toasted) { clear('ending'); return; }
    at('ending', exp0 - DAY, () => {
      // The live expiry, read when the notice is due: an access extended since is re-armed, one gone is not announced.
      const exp = validExp();
      if (toasted || exp === null) return;
      const left = exp - now();
      if (left <= 0) return;
      if (left > DAY) { armEnding(); return; }
      toasted = true;
      s.notice({ notice: 'ending', leftMs: left });
    });
  }
  function arm(): void { armExpiry(); armEnding(); }
  function onVisible(): void {
    if (!hostEnv().visible() || !live()) return;
    if (now() - last >= RECHECK) check();
    else if (handles.expiry === null) arm();
  }
  const offTeardown = onTeardown(() => { stop(); });
  function stop(): void {
    if (stopped) return;
    stopped = true;
    clear('expiry'); clear('ending');
    offVisible();
    offTeardown();
  }
  const offVisible = hostEnv().onVisibilityChange(onVisible);
  if (live()) arm();
  return stop;
}

// ---- pages ----

/** May this session do `cap`? Always in an account session; in a token session only what the check granted. */
export function can(cap: string): boolean {
  return !tokenSession() || capsAllow(caps, cap);
}

const capsSnapshot = () => caps;
function onCaps(l: () => void): () => void { capListeners.add(l); return () => { capListeners.delete(l); }; }

/** The React form of can(): re-renders when the token's capabilities change. */
export function useCan(cap: string): boolean {
  useSyncExternalStore(onCaps, capsSnapshot, capsSnapshot);
  return can(cap);
}

/** Fixture mode only (fixtureSession): this token session's capabilities, as dotted leaves ('events' and
 *  'vault' set both halves of their flag pairs). Refused on a live page. */
export function seedCapsForFixtures(list: readonly string[]): void {
  assertFixturesAllowed();
  const perms: Record<string, unknown> = {};
  for (const cap of list) {
    if (cap === 'events' || cap === 'vault') continue;
    const parts = cap.split('.');
    let o = perms;
    parts.forEach((p, i) => { if (i === parts.length - 1) o[p] = true; else { if (typeof o[p] !== 'object' || o[p] === null) o[p] = {}; o = o[p] as Record<string, unknown>; } });
  }
  const events = list.includes('events'), vault = list.includes('vault');
  if (events) perms.resources = { ...(perms.resources as object | undefined), events: true };
  if (vault) perms.resources = { ...(perms.resources as object | undefined), vault: true };
  setCaps(capsOf({ perms, eventAccess: events, vaultAccess: vault }));
}

/** Stops the timers and forgets the token session state (session disposal, dispose.ts; tests). */
export function resetToken(): void {
  if (stopTimers) stopTimers();
  stopTimers = null;
  S = null; caps = null; intro = null; checking = null; recheckAt = 0; nextAt = 0; unboundUsed = false; lastRecheckOk = false;
  capListeners.clear();
}
