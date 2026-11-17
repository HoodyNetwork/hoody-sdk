// The live mount's send policy, wired: live-policy.ts on the real records
// (live-records.ts, live-direct.ts), the membership table fed from the session's own answers (live-membership.ts), the
// terminal's boot-token producer (boot-producer.ts) and the recovery of direct changes. The live boot installs what
// `liveWire` returns; nothing here runs before that, and nothing here reads a credential.
//
//   - Both transport legs go through the policy at the transport: `admitLive` on the transport's OWN arguments and the
//     declared route core handed over (CallMeta), `seal` with the final headers on a computer leg, `verifyAdmission`,
//     and `beforeWire(attempt)` on every wire attempt the client makes. A refusal sends nothing.
//   - Hoody leg: the URL is built here from core's base (`/api/v1` = the validated API origin; else the realm host core
//     addressed) and checked by the policy against core's own routing. The body digest is the canonical JSON's.
//   - Computer legs (kit, agent): no cookie (`credentials: 'omit'` whatever the plan says); the headers are the
//     plan's, the person's own on a run route, and the lease ticket's at the final stage; the target is the one
//     captured with the call and must be in the membership table. A body that is neither text nor bytes (a stream, a
//     form) is refused here: a streamed upload names its source at its own send site, which is not wired yet.
//   - Row 6, which record: the terminal's own sends (a direct change, a token revoke) hand their record to their own
//     call (CallInput.bind on that call's CallMeta: never matched by route or computer; a revoke's record also names
//     the token id its URL ends with); the boot-token mint's record (boot-producer.ts holds it, one at a time). A
//     page's change carries core's own guarded / holdAttempt record, which core writes and reads back before the send
//     leaves (refused unsent otherwise), as on the web: it is admitted while the store is writable, and refused
//     NOT_DURABLE on a read-only or failed store. Money stays closed at the storage seam (seamArea).
//   - Direct changes (core/live-gate.ts): the record is held before the send; refused before anything went out it
//     settles `definite`; once an attempt reached the wire, only an answered refusal is definite, anything else `unknown`.
//   - Recovery of direct changes runs at start, whenever the holds change, and on a timer while a record is waiting for
//     time to pass (a young mint or alias-write record, a request still stamped as out, a read that got no answer):
//     never only at the next start.
import { createHash } from 'node:crypto';
import { agentLoginOf, agentSignInRoutes } from '../../core/agent-signin';
import { api, hoodyRoute, outcomeOf } from '../../core/api';
import { setKeptAttemptLocks, subscribeAttempts } from '../../core/attempts';
import { tokenMintRoute } from '../../core/boot-token';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, setChangeStoreAdapter } from '../../core/change-store';
import { realm as selectedRealm, subscribe as onCore, tokenRealm, tokenSession, type Target } from '../../core/ctx';
import { agentBaseFor, buildPortUrl } from '../../core/hosts';
import { setLiveGate, type LiveGate } from '../../core/live-gate';
import { pinnedRealm, probeRoute, reloadRealmAliases, switching, vaultKeyPutRoute } from '../../core/realm';
import { RE24 } from '../../core/realm-id';
import { defineRoute, isChangeCall, isDeclared, type Route } from '../../core/routes';
import { isPostRead } from './post-reads';
import { routingAllows } from '../../core/routing';
import { API_BASE, onBeforeAuthPurge, shared } from '../../core/session';
import { tokenMeRoute } from '../../core/token';
import type { CallMeta, Transport } from '../../core/transport';
import type { TermCallOpts } from '../env/client-shared';
import type { KeyValueStore } from '../../core/host-env';
import { registryEntry } from '../../core/registry';
import { PERSISTED, persistentStore, type PersistArea } from '../env/persist';
import type { TermSession } from '../env/session';
import type { HoodyClient, WireAttempt } from '../host-types';
import { BOOT_KEYS_MAX, readBootKeys, revokeBootKeys } from './boot-keys';
import { bootMintRecord, bootMintRecords } from './lock-host';
import { termBootProducer, type TermBootProducer } from './boot-producer';
import { guardBody, type Fence } from './fence';
import {
  BOOT_LAND_MARGIN_MS, BOOT_MINT_LOCK_PREFIX, holdDirectChange, recoverDirectChanges, settleDirectChange,
  type DirectRecovery, type DirectRecoveryDeps, type ListedToken,
} from './live-direct';
import { MembershipTable, membershipCallOf, type MemberSelection } from './live-membership';
import { LivePolicy, canonicalJson, type CallTarget, type Refusal } from './live-policy';
import { changeStoreOver, recordKept, storeModeOf, type StoreMode } from './live-records';
import { seamPlaces } from './live-seam';
import type { SecretScreenAsk } from './secret-screen-ctx';

/** GET /auth/tokens/templates: the permission tree the boot-token mint is cut from. */
export const termTemplatesRoute = defineRoute<unknown>({ method: 'GET', path: '/auth/tokens/templates', scope: 'base', baseOnly: true });
/** GET /auth/tokens: the account's tokens, for the boot-token cleanup. */
export const termTokensRoute = defineRoute<unknown>({ method: 'GET', path: '/auth/tokens', scope: 'base', baseOnly: true });
/** DELETE /auth/tokens/:id: a boot token of this terminal, revoked (a stray one by name, or a kept one). */
export const termTokenRevokeRoute = defineRoute<unknown>({ method: 'DELETE', path: '/auth/tokens/:id', scope: 'base', baseOnly: true });
/** The alias map read back by the recovery of an alias write (live-direct.ts): this one key, global, and its answer is
 *  emptied before anyone holds it (the read only proves that the API answered). A route of its own, so the policy can
 *  let it through without the secret screen (row 7) while every other vault read still needs that screen. */
export const termAliasReadBackRoute = defineRoute<unknown>({ method: 'GET', path: '/vault/keys/hoody.realm-aliases', scope: 'base', secret: true });

/** How many list pages the boot-token cleanup reads (100 rows each); past it the list is partial: rejected. */
/** How long after a read that got no answer the recovery tries again. */
export const RECOVERY_UNREAD_MS = 30_000;
const LEASE = 'x-hoody-approver-lease';

export interface WireTimers { set(fn: () => void, ms: number): unknown; clear(h: unknown): void; now(): number }
const realTimers: WireTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => { clearTimeout(h as ReturnType<typeof setTimeout>); }, now: () => Date.now() };

export interface LiveWiring {
  /** The account's opened store (the CLI opened and checked it), or null: none could be used. */
  readonly area: (PersistArea & { readonly droppedTail?: boolean; refresh?(): boolean }) | null;
  /** Read-only by the person's choice (as row 6 reads it). */
  readonly readOnlyChoice?: boolean;
  /** Row 7: asked at each admission (secret-screen.ts secretRevealOf on the live renderer). */
  secretReveal(): boolean;
  /** The mount's screen asking, handed over once its renderer exists (TermBoot.screen): what `secretReveal` reads. */
  screen?(ask: SecretScreenAsk): void;
  /** Row 7 refused a call (TERM_SECRET_SCREEN): told once per refused call, a code only, so the person hears why. */
  onSecretScreen?(): void;
  /** The mount ends (dispose): whatever the wiring showed is taken back. */
  ended?(): void;
  /** Row 1's lock part (lock-host.ts state()); absent: never locked. */
  lockState?(): 'live' | 'locked';
  /** The client's per-request deadline, and when this process opened the store (boot-token recovery's clock). */
  readonly requestDeadlineMs: number;
  readonly storeOpenedAt: number;
  /** Tests only: http to a loopback API origin. */
  readonly loopbackHttp?: boolean;
  /** A refusal at the transport that names a bypass (a code only). */
  onBypass?(code: 'TERM_POLICY_BYPASS'): void;
  readonly timers?: WireTimers;
}

export interface LiveWire {
  readonly places: { readonly apiOrigin: string; readonly realmApiDomain: string; readonly proxyDomain: string | null };
  readonly policy: LivePolicy;
  readonly members: MembershipTable;
  readonly transport: Pick<Transport, 'hoody' | 'fetch'>;
  readonly gate: LiveGate;
  readonly producer: TermBootProducer;
  storeMode(): StoreMode;
  /** Before core starts: the change store on the journal (core's first read of its records is the journal's), the
   *  gate and the producer installed (core's boot-token `load()` then never builds a script tag). */
  install(): void;
  /** After core booted: the realm watched, the kept boot keys trimmed and the direct changes recovered (both only
   *  with the store writable). */
  start(): void;
  /** One recovery pass now (single flight: a pass asked for while one runs follows it). */
  recover(): Promise<readonly DirectRecovery[]>;
  /** The mount ends: everything `start` installed is taken back, timers cleared, the policy forgotten. */
  dispose(): void;
}

const sha = (v: string | Uint8Array): string => createHash('sha256').update(v).digest('hex');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const notSent = (): Record<string, unknown> => ({ status: 0, notSent: true, stale: true });
const refused = (r: Refusal): Record<string, unknown> => (r.kind === 'stale' ? { status: 0, notSent: true, stale: true, kind: 'stale', code: r.code } : { status: 0, notSent: true, kind: 'not_sent', code: r.code });
const codeRefusal = (code: string): Record<string, unknown> => ({ status: 0, notSent: true, kind: 'not_sent', code });

/** The request's headers as a plain record, or null when they are not one (a Headers object or pairs are not what core's plan hands over). */
function headerRecord(h: RequestInit['headers']): Record<string, string> | null {
  if (h === undefined || h === null) return {};
  if (!isObj(h) || Object.getPrototypeOf(h) !== Object.prototype) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) { if (typeof v !== 'string') return null; out[k] = v; }
  return out;
}

/** The boot key row a revoke is the change of: row 6's record for `DELETE /auth/tokens/<id>` of a kept boot key. */
interface KeptKeyRef { readonly keptBootKey: string }
const isKeptKeyRef = (r: unknown): r is KeptKeyRef => isObj(r) && typeof r.keptBootKey === 'string' && Object.keys(r).length === 1;

/** Row 3's selection from core's realm state. The pin is a realm id or null, never `all`: an all-realms
 *  access key's pin is `all`, which as a pin would refuse every computer in membership and let `realm=all` through on
 *  every agent route; such a key has no pin here and its selection is "All realms". */
export function selectionOf(selected: unknown, pinned: unknown): MemberSelection {
  const id = (v: unknown): string | null => (typeof v === 'string' && RE24.test(v) ? v : null);
  return { realm: id(selected), pin: id(pinned) };
}

export interface Bound { readonly route: unknown; readonly computer: string | null; readonly record: unknown; readonly tokenId: string | null; wired: boolean; taken: boolean }
/** Row 6 for a page's change: core's own guarded / holdAttempt record is written and read back before the send leaves
 *  (core refuses it unsent otherwise), as on the web; the terminal admits it while its store is writable (row 6 asks
 *  for a record only once the store is 'rw'). */
const CORE_HELD = Object.freeze({ coreHeld: true });
/** Routes only the terminal's own calls send, each with its bind: the agent sign-in and the boot-key revoke. */
const OWN_ONLY = new Set<unknown>([agentSignInRoutes.bootstrap, termTokenRevokeRoute]);
/** Money: any change whose path names a money word (wallet, top-up, reserve, rent, subscription, extension, purchase,
 *  checkout, invoice, pay, charge, buy, billing, credit, order) or whose body declares a price or charge key. Words
 *  and keys, not a route list: a money route declared later is refused by the same rule; every
 *  declared change route is walked by 'money: every declared money route is refused at the wire'. */
export const MONEY_WORDS: ReadonlySet<string> = new Set(['wallet', 'wallets', 'topup', 'top', 'topups', 'reserve', 'reservation', 'reservations', 'rent', 'rental', 'rentals', 'subscription', 'subscriptions', 'extend', 'extension', 'renew', 'purchase', 'purchases', 'checkout', 'invoice', 'invoices', 'pay', 'payment', 'payments', 'charge', 'charges', 'buy', 'billing', 'credit', 'credits', 'order', 'orders', 'transfer', 'transfers', 'bonus']);
export const MONEY_BODY_KEYS: ReadonlySet<string> = new Set(['amount', 'max_charge_cents', 'charge_cents', 'price_cents', 'amount_cents', 'rental_days', 'plan_id', 'expected_fee_bps']);
export function isMoneyRoute(route: unknown): boolean {
  const r = route as { path?: unknown; body?: unknown; scope?: unknown } | null;
  const p = r?.path;
  // Money is the Hoody API's (base or realm host); a computer's own routes (kit, agent) sell nothing.
  if (typeof p !== 'string' || (r!.scope !== 'base' && r!.scope !== 'realm')) return false;
  if (p.toLowerCase().split(/[^a-z0-9]+/).some((w) => MONEY_WORDS.has(w))) return true;
  return Array.isArray(r!.body) && r!.body.some((k) => typeof k === 'string' && MONEY_BODY_KEYS.has(k));
}
export interface Claim { readonly record: unknown; wired(): void; release(): void }

/** The recovery keys core writes through the storage seam in a live mount: the scripts writer's asks and drafts
 *  (core/script-asks.ts), the AI journal (ask/journal/storage.ts) and a Bot's unconfirmed spoken messages
 *  (pages/bots/voice/pending.ts). Each is the record of a send to a computer whose outcome may stay unknown: core
 *  writes it, reads it back and only then sends, exactly as on the web. */
export const SEAM_JOURNAL_KEYS: ReadonlySet<string> = new Set(['hub.v3.script-asks', 'hub_ai_req_v1', 'hub_ai_lease_v1', 'hub_ai_journal_v1', 'hub_voice_pending_v1']);

/** The host's area as the storage seam gets it: the journal takes writes of SEAM_JOURNAL_KEYS only (durable when the
 *  write returns: persist.ts, hub-store.ts). Every other recovery key stays closed: money (its sends never leave this
 *  build), and `hub.v3.changes`, which core writes through its own adapter. One removal is open: `hub.v3.changes` may be
 *  deleted here, which Remove all local data does once the person was shown its held changes and chose to forget them
 *  (registry `forget`; sign-out never purges it).
 *  The held boot-token mint records in that key are not the person's data: each is the only trace of a token that may
 *  exist, which the boot-token recovery revokes by its name. The seam never shows them, and the removal keeps them on
 *  the disk as they were (the lock's forget keeps them too: lock-host.ts bootMintRecords). A value that cannot be read
 *  is never removed, as it may hold one. So nothing reaches the disk through this that the adapter did not write.
 *  No area at all: nothing kept, nothing writable. Exported for tests. */
export function seamArea(area: PersistArea | null): PersistArea {
  const closed = (): never => { throw new Error('NOT_DURABLE'); };
  // `hub.v3.changes` as the seam shows it: without its held boot-mint records (null when nothing else is left). A value
  // that cannot be read is shown as it is.
  const changes = (a: PersistArea): string | null => {
    const raw = a.journalGet(CHANGE_STORE_KEY);
    if (raw === null) return null;
    let list: unknown;
    try { list = JSON.parse(raw); } catch { return raw; }
    if (!Array.isArray(list) || !list.some(bootMintRecord)) return raw;
    const rest = list.filter((r) => !bootMintRecord(r));
    return rest.length ? JSON.stringify(rest) : null;
  };
  return {
    readOnly: area ? area.readOnly : 'busy',
    journalGet: (k) => (!area ? null : k === CHANGE_STORE_KEY ? changes(area) : area.journalGet(k)),
    journalKeys: () => (area ? area.journalKeys().filter((k) => k !== CHANGE_STORE_KEY || changes(area) !== null) : []),
    journalSet: (k, v) => { if (!area || !SEAM_JOURNAL_KEYS.has(k)) closed(); area!.journalSet(k, v); },
    journalDel: (k) => {
      if (!area || !(SEAM_JOURNAL_KEYS.has(k) || k === CHANGE_STORE_KEY)) closed();
      if (k !== CHANGE_STORE_KEY) { area!.journalDel(k); return; }
      const mints = bootMintRecords(area!.journalGet(k));
      if (mints === null) closed();
      if (!mints!.length) { area!.journalDel(k); return; }
      const kept = JSON.stringify(mints);
      if (area!.journalGet(k) !== kept) area!.journalSet(k, kept);
    },
    get: (k) => (area ? area.get(k) : null), keys: () => (area ? area.keys() : []),
    set: (k, v) => { if (!area) closed(); area!.set(k, v); }, del: (k) => { if (!area) closed(); area!.del(k); },
    failed: () => !area || area.failed(),
  };
}

/** The terminal's own sends: each hands its record to its own call as an opaque key (CallInput.bind), matched by
 *  identity, never by route or computer, so another send of the same route never takes it. A bind holds for its own
 *  route and computer only, for one call at a time; a revoke's also for its own token id (the path's last segment). */
export function bindTable(): {
  bind(route: unknown, computer: string | null, record: unknown, tokenId?: string | null): { key: object; b: Bound };
  claim(meta: Pick<CallMeta, 'bind' | 'path'>, route: unknown, computer: string | null): Claim | null;
  delete(key: object): void;
} {
  const binds = new WeakMap<object, Bound>();
  return {
    bind(route, computer, record, tokenId = null) {
      const key = Object.freeze({});
      const b: Bound = { route, computer, record, tokenId, wired: false, taken: false };
      binds.set(key, b);
      return { key, b };
    },
    claim(meta, route, computer) {
      const b = meta.bind ? binds.get(meta.bind) : undefined;
      if (!b || b.route !== route || b.computer !== computer || b.taken) return null;
      if (b.tokenId !== null && String(meta.path).split('/').pop() !== encodeURIComponent(b.tokenId)) return null;
      b.taken = true;
      return { record: b.record, wired: () => { b.wired = true; }, release: () => { b.taken = false; } };
    },
    delete(key) { binds.delete(key); },
  };
}

// The account-end hook cannot be taken back (shared.js keeps every listener): ONE listener per session (per loaded
// shared.js), over the mounts that are open; a mount leaves the set when it closes.
const purgeHooked = new WeakSet<object>();
const purgeTargets = new Set<() => void>();

export function liveWire(client: HoodyClient, session: TermSession, fence: Fence, w: LiveWiring): LiveWire {
  const places = seamPlaces(client, { loopbackHttp: w.loopbackHttp === true });
  const timers = w.timers ?? realTimers;
  const area = w.area;
  const uid = client.identity.uid;
  const sid = client.identity.sid;
  let disposed = false;
  const storeMode = (): StoreMode => storeModeOf(area, w.readOnlyChoice === true);

  // ---- which record a change's send is given (row 6) ----
  // The terminal's own sends (the direct sites, the token revokes) hand their record to their own call: an opaque key
  // on that call's CallMeta (CallInput.bind), never matched by route or computer, so another send of the same route
  // never takes it. A revoke's record also names its token: the URL must end with that id.
  const binds = bindTable();
  const bind = binds.bind;
  const claimRecord = (meta: CallMeta | undefined, route: unknown, computer: string | null): Claim | null => {
    // Money never leaves this build (no billing, wallet, top-up, purchase, rent or subscription sends).
    if (isMoneyRoute(route)) return null;
    if (meta?.bind) return binds.claim(meta, route, computer);
    // The terminal's own sends leave only under the record handed to their own call.
    if (OWN_ONLY.has(route)) return null;
    // A page's change (no bind; the Keys page's own key create included): core's own record, admitted while the store
    // is writable. The boot-token producer's mint carries its bind like every other own send.
    return { record: CORE_HELD, wired: () => {}, release: () => {} };
  };

  // The boot-token mint's records while its own call is out (bindMint below): row 7 lets that call through on a
  // screen that cannot show a secret, because its value goes to the agent only. The Keys page mints on the same route
  // with core's record and shows its key, so its mint needs the secret screen like every other shown secret.
  const bootMints = new WeakSet<object>();

  // ---- the policy on the real records ----
  let probing: string | null = null;
  const members = new MembershipTable(uid, () => { policy.bump(); });
  const policy: LivePolicy = new LivePolicy({
    places,
    state: () => (disposed || fence.tripped() || !session.live() ? 'stale' : w.lockState?.() === 'locked' ? 'locked' : 'live'),
    session: () => ({ sid, generation: 0 }),
    account: () => uid,
    hoodyRoute,
    // The realm core routes to: a token's pin; the realm being probed while a switch asks; else the selection.
    realm: () => probing ?? (tokenSession() ? tokenRealm() || 'all' : selectedRealm()),
    tokenSession,
    introspection: tokenMeRoute,
    bootstrap: agentSignInRoutes.bootstrap,
    // Secret routes whose answer is never drawn: the agent sign-in itself (the secret is in its request, its answer
    // holds none) and the recovery's alias read-back (emptied). The boot-token mint passes by its record, not its route.
    unshownSecrets: new Set<unknown>([agentSignInRoutes.bootstrap, termAliasReadBackRoute]),
    unshownRecord: (r) => isObj(r) && bootMints.has(r),
    members,
    // The pin is a realm id or null, never `all`: an all-realms key has no pin here.
    selection: () => selectionOf(selectedRealm(), pinnedRealm()),
    routingAllows,
    computerOrigin: (leg, t, route, index) => {
      const p = { id: t.project }, c = { id: t.computer, server_name: t.server };
      return leg === 'agent' ? agentBaseFor(p, c) : buildPortUrl(p, c, String(route.kit), index ?? (typeof route.index === 'number' ? route.index : 1));
    },
    storeMode,
    recordKept: (r) => (r === CORE_HELD ? true : isKeptKeyRef(r)
      ? storeMode() === 'rw' && !!area && (readBootKeys(area) ?? []).some((k) => k.id === r.keptBootKey)
      : recordKept(area, r)),
    secretReveal: () => w.secretReveal(),
    onBypass: (c) => { try { w.onBypass?.(c); } catch { /* the host's */ } },
  });
  /** A row 7 refusal is told to the host (live-wiring.ts: one warn toast), on both legs and the computer preflight. */
  const told = (r: Refusal): Refusal => {
    if (r.code === 'TERM_SECRET_SCREEN') { try { w.onSecretScreen?.(); } catch { /* the host's */ } }
    return r;
  };

  // ---- the two legs ----
  const hoody: Transport['hoody'] = (method, url, body, opts, meta: CallMeta | undefined) => {
    if (fence.tripped()) return Promise.reject(notSent());
    const m = String(method).toUpperCase();
    const route: unknown = meta?.route;
    const base = opts.base ?? API_BASE;
    const abs = (base === API_BASE ? places.apiOrigin + API_BASE : String(base)) + String(url);
    const b = body === undefined ? null : body;
    const claim = isDeclared(route) && isChangeCall(route, m) && !isPostRead(route) ? claimRecord(meta, route, null) : null;
    // The switch probe goes to the realm being switched to (core/realm.ts): routed for that realm, this one call.
    probing = route === probeRoute ? switching() : null;
    let got: ReturnType<LivePolicy['admitLive']>;
    try { got = policy.admitLive({ family: route === probeRoute ? '12' : '1', leg: 'hoody', route, method: m, url: abs, body: b, record: claim?.record }); } finally { probing = null; }
    if (!got.ok) { claim?.release(); return Promise.reject(refused(told(got))); }
    const adm = got.admission;
    const json = b === null ? null : canonicalJson(b);
    if (policy.verifyAdmission(adm, { method: m, url: abs, bodyDigest: json === null ? null : sha(json) }) !== 'ok') { policy.end(adm); claim?.release(); return Promise.reject(codeRefusal('TERM_POLICY_BYPASS')); }
    const check = policy.beforeWire(adm);
    const mem = membershipCallOf(m, abs, places);
    const gen = mem ? members.begin() : 0;
    return fence.run((ended, live) => {
      const inner = opts.alive;
      const o: TermCallOpts = {
        ...opts, alive: () => live() && (typeof inner !== 'function' || inner()), signal: ended,
        wire: (attempt) => { if (!check(attempt)) return false; claim?.wired(); return true; },
      };
      return shared().apiCall(m, url, body === null ? undefined : body, null, undefined, o);
    }, { deadlineMs: opts.timeoutMs }).then(
      (v) => { if (mem) members.answer(mem, gen, true, v); return v; },
      (e: unknown) => { if (mem) members.answer(mem, gen, false, null); throw e; },
    ).finally(() => { policy.end(adm); claim?.release(); });
  };

  const fetchLeg: Transport['fetch'] = (url, init, meta: CallMeta | undefined) => {
    if (fence.tripped()) return Promise.reject(notSent());
    const route: unknown = meta?.route;
    const leg = isDeclared(route) && route.scope === 'agent' ? 'agent' : 'kit';
    const method = String(init.method ?? 'GET').toUpperCase();
    const final = headerRecord(init.headers);
    const raw = init.body;
    if (!final || !(raw === null || raw === undefined || typeof raw === 'string' || raw instanceof Uint8Array)) return Promise.reject(codeRefusal(final ? 'TERM_ROUTE_UNDECLARED' : 'TERM_CREDENTIAL_CLASS'));
    const body = raw === undefined ? null : raw;
    // The plan's headers, the person's own (a run route only), and the lease ticket's (the final stage only).
    const plan: Record<string, string> = {}, caller: Record<string, string> = {};
    const run = isDeclared(route) && route.run === true;
    const idem = isDeclared(route) && typeof route.idem === 'string' ? route.idem.toLowerCase() : null;
    for (const [k, v] of Object.entries(final)) {
      const n = k.toLowerCase();
      if (n === LEASE) continue;
      if (run && !(n === 'accept' || n === 'content-type' || n === idem)) caller[k] = v; else plan[k] = v;
    }
    const mt: Target | null | undefined = meta?.target;
    const target: CallTarget | null = mt && mt.project && mt.container
      ? { project: String(mt.project.id), computer: String(mt.container.id), server: typeof mt.container.server_name === 'string' ? mt.container.server_name : '' } : null;
    const nth = /^https:\/\/[^/.?#]*-(\d{1,5})\./.exec(String(url));
    const index = isDeclared(route) && typeof route.index === 'number' ? route.index : nth ? Number(nth[1]) : undefined;
    const claim = isDeclared(route) && isChangeCall(route, method) && !isPostRead(route) ? claimRecord(meta, route, target ? target.computer : null) : null;
    const got = policy.admitLive({ family: '2', leg, route, method, url: String(url), body, headers: plan, callerHeaders: caller, target, ...(index !== undefined ? { index } : {}), record: claim?.record });
    if (!got.ok) { claim?.release(); return Promise.reject(refused(told(got))); }
    const adm = got.admission;
    const fail = (code: string): Promise<never> => { policy.end(adm); claim?.release(); return Promise.reject(codeRefusal(code)); };
    if (!policy.seal(adm, final)) return fail('TERM_CREDENTIAL_CLASS');
    const digests = Object.entries(final).map(([k, v]) => [k.toLowerCase(), sha(v)] as const);
    if (policy.verifyAdmission(adm, { method, url: String(url), bodyDigest: body === null ? null : sha(body), headers: digests, cookie: false }) !== 'ok') return fail('TERM_POLICY_BYPASS');
    const check = policy.beforeWire(adm);
    // No cookie on a computer leg, whatever the plan asks: none is sent and none is kept.
    return fence.run((ended, live) => client.fetch(String(url), { ...init, credentials: 'omit' }, {
      session: { sid, generation: 0 },
      signal: ended,
      beforeWire: (attempt?: WireAttempt) => { if (!(live() && session.live() && check(attempt))) return false; claim?.wired(); return true; },
    }).then((res) => guardBody(res, ended)), { signal: init.signal ?? null }).finally(() => { policy.end(adm); claim?.release(); });
  };

  // ---- direct changes ----
  const gate: LiveGate = {
    async direct(site, place, send) {
      const route = (site === 'agent-bootstrap' ? agentSignInRoutes.bootstrap : vaultKeyPutRoute) as Route;
      const held = await holdDirectChange(site, route, place);
      if (!held.ok) throw codeRefusal(held.code === 'NOT_LISTED' || held.code === 'TARGET' ? 'NOT_DURABLE' : held.code);
      const { key, b } = bind(route, place ? place.computer : null, held.record);
      try {
        const v = await send(key);
        settleDirectChange(held.hold, 'definite', timers.now());
        return v;
      } catch (e) {
        // Refused before anything went out: nothing to read back. Once an attempt reached the wire only an answered
        // refusal is definite; a later policy refusal, a lost answer or a 5xx is unknown.
        const answered = isObj(e) && typeof e.status === 'number' && e.status >= 400 && e.status < 500 && e.notSent !== true;
        settleDirectChange(held.hold, b.wired && !(answered && outcomeOf(e, true) !== 'pending') ? 'unknown' : 'definite', timers.now());
        throw e;
      } finally { binds.delete(key); }
    },
    // The computer legs' census row (fetchLeg below): the policy's preflight, so core reads its refusal as not sent.
    early(route) {
      const r = policy.refuseEarly(route, '2');
      if (r) told(r);
      return r ? { code: r.code, ...(r.kind === 'stale' ? { stale: true } : {}) } : null;
    },
  };

  // ---- the boot-token producer and its cleanup ----
  const inner = termBootProducer({
    area: area ?? { readOnly: 'busy', failed: () => true, get: () => null, set: () => { throw new Error('no store'); } },
    templates: () => api(termTemplatesRoute, {}),
    now: () => timers.now(),
    bindMint: (record) => {
      const { key } = bind(tokenMintRoute, null, record);
      if (isObj(record)) bootMints.add(record);
      return { key, drop: () => { binds.delete(key); if (isObj(record)) bootMints.delete(record); } };
    },
  });
  // (A forget against a mint still out: boot-producer.ts fails that mint for every caller and keeps its token out of
  // memory.) While a token is in memory, no header, URL or other body may carry it.
  // A forget (or the mount's end) also drops every call still on its way back, a cached token's included: each
  // forget starts a new generation, and an answer of an older one is handed out as failed and never held again.
  let producerGen = 0;
  const producer: TermBootProducer = {
    async ensure(u, o) {
      const mine = producerGen;
      const got = await inner.ensure(u, o);
      // (The same failure boot-producer.ts throws: core's boot-token caller reads it as a failed ask.)
      if (mine !== producerGen || disposed) throw { token: '', state: 'failed' };
      if (got && typeof got.token === 'string' && got.token) policy.holdBootToken(got.token);
      return got;
    },
    forget() { producerGen++; inner.forget(); policy.dropBootToken(); },
  };
  const answeredGone = (e: unknown): boolean => isObj(e) && e.status === 404 && e.notSent !== true;
  const revokeWith = (id: string, record: unknown): Promise<'gone' | 'failed'> => {
    const { key } = bind(termTokenRevokeRoute, null, record, id);
    return api(termTokenRevokeRoute, { params: { id }, bind: key }).then((): 'gone' => 'gone', (e: unknown): 'gone' | 'failed' => (answeredGone(e) ? 'gone' : 'failed')).finally(() => { binds.delete(key); });
  };
  // GET /auth/tokens answers the account's whole list in ONE answer (no pages), or says `truncated: true` when the
  // account has more keys than the API lists. The whole list or nothing: a truncated list cannot show that a key is
  // absent, so the read fails and the mint record stays held (the next pass reads again).
  const listTokens = async (): Promise<readonly ListedToken[]> => {
    const a = await api(termTokensRoute, {});
    const rows = isObj(a) ? a.data : undefined;
    if (!isObj(a) || !Array.isArray(rows) || a.truncated !== undefined && a.truncated !== false) throw new Error('the token list is not whole');
    const out: ListedToken[] = [];
    for (const r of rows) {
      // The API's alias is always a string (AuthToken.alias allowNull false): a row with anything else cannot be
      // classified, so the list proves nothing and the mint record stays (never read as "no such name").
      if (!isObj(r) || typeof r.id !== 'string' || !r.id || typeof r.alias !== 'string') throw new Error('the token list is not whole');
      out.push({ id: r.id, alias: r.alias });
    }
    return out;
  };
  const recoveryDeps: DirectRecoveryDeps = {
    // Only an API answer resolves: the map, or the API's own "no such key" (404). A 5xx or a lost answer proves nothing.
    // (live-direct.ts frees on it only when the read started after the PUT could no longer land.)
    readAliases: () => api(termAliasReadBackRoute, { scrub: (a) => { if (isObj(a)) for (const k of Object.keys(a)) delete a[k]; } }).then(() => null, (e: unknown) => { if (answeredGone(e)) return null; throw e; }),
    // Only a status that shows the agent signed in (to this account, or to another one) settles a held sign-in.
    // Signed out, no identity yet, or a body agentLoginOf cannot read may be that sign-in still under way: kept.
    agentStatus: async (project, computer) => {
      const row = members.snapshot().find((r) => r.computer === computer && r.project === project && r.server);
      if (!row) return 'unread';
      try {
        const body = await api(agentSignInRoutes.status, { target: { project: { id: project }, container: { id: computer, server_name: row.server } } });
        const login = agentLoginOf(body, uid);
        return login === 'ready' || login === 'account' ? 'answered' : 'unread';
      } catch { return 'unread'; }
    },
    bootKeyAliases: () => { const k = area ? readBootKeys(area) : null; return k ? k.map((x) => x.alias) : null; },
    listTokens,
    // A stray token of a held mint: that mint's own record (still held) is the record of its revoke.
    revokeToken: (id, mint) => revokeWith(id, { id: mint.id, token: mint.incarnation }),
    requestDeadlineMs: w.requestDeadlineMs,
    storeOpenedAt: w.storeOpenedAt,
    now: () => timers.now(),
  };

  // ---- recovery: at start, when the holds change, and on a timer while a record waits for time to pass ----
  let running: Promise<readonly DirectRecovery[]> | null = null;
  let again = false;
  let timer: unknown = null;
  const schedule = (ms: number): void => {
    if (disposed) return;
    if (timer !== null) timers.clear(timer);
    timer = timers.set(() => { timer = null; void recover(); }, Math.max(1000, ms));
  };
  const recover = (): Promise<readonly DirectRecovery[]> => {
    if (disposed) return Promise.resolve([]);
    if (running) { again = true; return running; }
    const pass = (async (): Promise<readonly DirectRecovery[]> => {
      let out: readonly DirectRecovery[] = [];
      try { out = await recoverDirectChanges(storeMode(), recoveryDeps); } catch { out = []; }
      return out;
    })();
    running = pass;
    void pass.then((out) => {
      running = null;
      if (disposed) return;
      // A freed alias write: its PUT may have landed or not, and the names on screen are from before it. Read them again
      // (row 7 refuses that read unsent while the secret screen is off: the id is shown).
      if (out.some((r) => r.outcome === 'freed' && r.lock.includes('realm-alias-write'))) void reloadRealmAliases().catch(() => { /* the names stay as read */ });
      let wait = Infinity;
      for (const r of out) {
        if (r.outcome !== 'kept') continue;
        // A young mint or alias-write record is old enough at most this long from now (its clock started at the end of
        // its request, or at this process's store opening: both are in the past).
        if (r.why === 'young') wait = Math.min(wait, w.requestDeadlineMs + BOOT_LAND_MARGIN_MS + 1000);
        else if (r.why === 'in-flight') wait = Math.min(wait, SENDING_STALE_MS + 1000);
        else if (r.why === 'unread' || r.why === 'revoke' || r.why === 'unresolved') wait = Math.min(wait, RECOVERY_UNREAD_MS);
      }
      if (again) { again = false; void recover(); } else if (wait !== Infinity) schedule(wait);
    });
    return pass;
  };

  const offs: Array<() => void> = [];
  // The seam install() put over the session's local store (null before it and after dispose).
  let seam: KeyValueStore | null = null;
  // The account's end also takes, from the DISK, every kept key the web purges at sign-out (registry `purge: true`):
  // the session's own purge (client-shared.ts) walks only its memory stores. A removal the store refuses stays.
  const onPurge = (): void => {
    producer.forget();
    for (const r of PERSISTED) if (seam && registryEntry('local', r.key)?.purge) { try { seam.removeItem(r.key); } catch { /* read-only or failed: kept */ } }
  };
  let lastRealm: string | null = null;
  return {
    places, policy, members, transport: { hoody, fetch: fetchLeg }, gate, producer, storeMode, recover,
    install() {
      if (disposed) return;
      if (area) setChangeStoreAdapter(changeStoreOver(persistentStore(session.stores().local, area), { droppedTail: area.droppedTail === true }));
      // Core's money stores (plans, market, top-up, rent: persist.ts group `recovery`) take NO entry in this build: none
      // of their changes can be sent (row 6 above), and an entry written before the refused send would stay as "may
      // have gone through" (commerce keeps a claimed entry as held). Their writes are refused at the seam, so core's own
      // read-back refuses the change before anything is sent or kept. The scripts writer's asks and the AI journal are
      // kept (SEAM_JOURNAL_KEYS): their record is on disk before the send leaves. Preferences are kept as the seam keeps them.
      seam = persistentStore(session.stores().local, seamArea(area));
      session.seamLocal(seam);
      setLiveGate(gate);
      // A held boot-token mint is the only trace of a token that may exist (its recovery revokes it by name): no sign-out
      // forget drops it, and neither the sign-out warning nor the wipe's confirm offers it as a change to forget.
      setKeptAttemptLocks((lock) => lock.startsWith(BOOT_MINT_LOCK_PREFIX));
      (globalThis as { HubBootToken?: unknown }).HubBootToken = producer;
    },
    start() {
      if (disposed) return;
      // A realm switch clears the membership rows and voids every Admission minted before it.
      lastRealm = selectedRealm();
      offs.push(onCore(() => { const r = selectedRealm(); if (r !== lastRealm) { lastRealm = r; members.clear(); policy.bump(); } }));
      offs.push(subscribeAttempts(() => { if (!disposed) void recover(); }));
      // The account ends (sign-out, another account, any purge): the boot token leaves memory with it.
      purgeTargets.add(onPurge);
      if (!purgeHooked.has(shared())) { purgeHooked.add(shared()); onBeforeAuthPurge(() => { for (const f of [...purgeTargets]) f(); }); }
      if (storeMode() === 'rw' && area) {
        void revokeBootKeys('rw', area, (id) => revokeWith(id, { keptBootKey: id } satisfies KeptKeyRef), BOOT_KEYS_MAX - 1, () => timers.now()).catch(() => { /* kept for the next start */ });
        void recover();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs.splice(0)) { try { off(); } catch { /* gone */ } }
      if (timer !== null) { timers.clear(timer); timer = null; }
      purgeTargets.delete(onPurge);
      producer.forget();
      const g = globalThis as { HubBootToken?: unknown };
      if (g.HubBootToken === producer) delete g.HubBootToken;
      setLiveGate(null);
      setKeptAttemptLocks(null);
      setChangeStoreAdapter(null);
      seam = null;
      if (session.live()) session.seamLocal(null);
      policy.dispose();
      try { w.ended?.(); } catch { /* the host's */ }
    },
  };
}
