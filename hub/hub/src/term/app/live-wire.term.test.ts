// The send policy wired into the live boot, driven
// through REAL core callers (api, run, directChange) on a fake client that records every request. Real store files
// (hub-store.ts), real core holds. No network: the client answers from memory.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A bad API origin or proxy domain refuses the boot before anything is installed or sent | 'bad places refuse the boot' |
// | 2 | Every Hoody request leaves with the attempt the policy admitted; a client that passes no attempt, or another URL or body, sends nothing and the bypass is reported | 'hoody leg is bound to its attempt' |
// | 3 | No bearer on a computer, ever: kit and agent calls carry no Authorization, no cookie, no X-Hoody-* beyond the route's; a client that adds its bearer is refused at the final check | 'no bearer on a computer' |
// | 4 | Destination: a computer not in the session's own list, another server, the API origin, a realm host, another proxy domain, a look-alike suffix → refused, nothing sent; the same computer after the list answered → sent | 'destination' |
// | 5 | No cookie: `credentials: include` is sent as omit; an attempt that says a cookie is attached is refused | 'no cookie' |
// | 6 | Boot token: in the bootstrap body to the captured agent only, after membership; in a query, a header or another route's body → refused; its record is on disk before the send; never in the journal | 'boot token' |
// | 7 | Run headers: the person's Authorization reaches a run route byte for byte, and no other route | 'run headers' |
// | 8 | Row 6 at the wire: a change is sent only under a record bound to that very send (a direct site's, the mint's, a kept boot key's). Any other change, with or without a core hold, on either leg → refused, nothing sent, no record touched; a second Hub (ro) → TERM_READ_ONLY; no store → NOT_DURABLE | 'a change needs its record' (+ ': read-only and no store'), 'another change\'s record is never this send\'s', 'a direct record is its own computer\'s' |
// | 9 | Direct changes: refused before anything went out → the record is freed (definite); an unknown answer after the wire → kept; each core site names itself with a literal | 'direct changes settle' |
// | 10 | Recovery runs again when the holds change and on a timer while a record waits (unread; a young mint record), never only at the next start | 'recovery reruns' |
// | 11 | selection().pin is a realm id or null, never `all` | 'the pin is an id or null' |
// | 12 | The producer is installed for core (no script tag), and gone after the mount | 'producer installed' |
// | 13 | The key list is one whole answer (no pages); a list the API cut short (`truncated`) resolves nothing: no revoke, the record stays | 'recovery: only an API answer, and the whole list' |
// | 14 | An alias write freed by its read-back: the names shown are read again (only while the secret screen is there) | 'an alias write freed by its read-back: the names are read again' |
// | 15 | A caller that joins a mint an earlier forget already ended is dropped with it | 'producer: the token is held, and a forget beats a late mint' |
// | 16 | Two mints left unknown: each stray key is revoked under its own mint's record | 'recovery: only an API answer, and the whole list' |
// | 17 | Money (plan purchase, upgrade) through core's own claim: refused for the store before anything is sent; no entry in memory or on disk, no hold shown; read-only, writable and no store | 'money: a plan purchase or upgrade leaves nothing behind' |
// | 18 | Row 7 on the shared key-mint route: without the secret screen the Keys page's mint (its key is shown once) is refused unsent; the boot mint's own call (its bound record) is sent; with the screen the Keys mint is sent | 'row 7: the key mint needs the secret screen; only the boot mint\'s own call passes without it' |
// | 19 | A held boot-token mint is never in the sign-out warning or the wipe's confirm (core keeps its record through the forget); pages and the producer still see it; the mount's end takes the rule back | 'a held boot-token mint is never offered to the sign-out or the wipe as a change to forget' |
import { afterEach, beforeAll, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { api } from '../../core/api';
import { deriveVerifier, ITER_DEFAULT, LOCK_PREFIX, resetAppLock, type LockRecord } from '../../core/applock';
import { createMemoryLocks } from '../../core/host-locks-memory';
import { agentSignInRoutes } from '../../core/agent-signin';
import { attemptKept, heldAttempts, holdAttempt } from '../../core/attempts';
import { agentBootToken, tokenMintRoute } from '../../core/boot-token';
import { sessionRoutes } from '../../core/agent/session';
import { CHANGE_STORE_KEY, changeStoreTab, type StoredChange } from '../../core/change-store';
import { commerceRoutes, createAttempt, planHolds } from '../../core/commerce';
import { hostEnv } from '../../core/host-env';
import { hasWebLocks } from '../../core/commerce-pure';
import { containersRoute } from '../../core/computer';
import { capture, setRealm, type Target } from '../../core/ctx';
import { partitioned, run } from '../../core/kit-io';
import { signOutHolds } from '../../core/lifecycle';
import { localWipeWarning } from '../../core/local-wipe.pure';
import { localStore } from '../../core/host-env';
import { putDraftRecord, putScriptAsk, readDraftRecords, readScriptAsks, type DraftRecord, type ScriptAsk } from '../../core/script-asks';
import { Entries } from '../../ask/journal/entries';
import { Leases } from '../../ask/journal/leases';
import { Records } from '../../ask/journal/records';
import { resetStoresForTests } from '../../ask/journal/storage';
import type { Entry } from '../../ask/journal/types';
import { directChange, liveGateInstalled } from '../../core/live-gate';
import { aliases, aliasOf, displayName, readRealmAliases, reloadRealmAliases, shortId, vaultKeyPutRoute } from '../../core/realm';
import { defineRoute, type CallInput, type Route } from '../../core/routes';
import { clearAuthTokens } from '../../core/session';
import { transport } from '../../core/transport';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type StoreIo, type TryLock } from '../../../scripts/term/build/hub-store';
import { chunkLoadFailed, isChunkLoadError } from '../../shell/staleChunk';
import { beginTermSession } from '../env/session';
import { expectTraps } from '../env/strict-globals';
import type { ClientCallControls, HoodyClient, WireAttempt } from '../host-types';
import { liveBoot } from './boot.live';
import { bootAliasOf, holdDirectChange, noteMintHold, resetDirectMemory, settleDirectChange, BOOT_LAND_MARGIN_MS } from './live-direct';
import { canonicalJson } from './live-policy';
import { IDLE_TICK_MS, installTermLock, type TermLockHost } from './lock-host';
import { BOOT_KEYS_KEY } from './boot-keys';
import { requestPasswordReset, resendVerification } from '../../core/account-mail';
import { bindTable, RECOVERY_UNREAD_MS, selectionOf, termTokenRevokeRoute, type LiveWiring, type WireTimers } from './live-wire';

setDefaultTimeout(30_000);

const UID = '64f0ada00000000000000001';
const P1 = 'a'.repeat(24), C1 = 'c'.repeat(24), C2 = 'd'.repeat(24);
const BEARER = 'hdy_WIREcanary0123456789abcdefXYZ';
const BOOT = 'hdy_BOOTcanary0123456789abcdefXYZ';
const API = 'https://api.example.invalid', REALM_DOMAIN = 'realm.invalid', PROXY = 'px.invalid';
const T1: Target = { project: { id: P1 }, container: { id: C1, server_name: 'srv1' } };
const T2: Target = { project: { id: P1 }, container: { id: C2, server_name: 'srv1' } };
const sha = (v: string | Uint8Array): string => createHash('sha256').update(v).digest('hex');

const kitRead = defineRoute({ method: 'GET', path: '/wt/info', scope: 'kit', kit: 'files', index: 1, query: ['q'] });
const kitPost = defineRoute({ method: 'POST', path: '/wt/make', scope: 'kit', kit: 'files', index: 1, body: ['name'] });
const runGet = defineRoute({ method: 'GET', path: '/', scope: 'kit', kit: 'exec', index: 1, run: true });
const hoodyPost = defineRoute({ method: 'POST', path: '/wt/things', scope: 'base', body: ['name'] });
const hoodyRead = defineRoute({ method: 'GET', path: '/wt/things', scope: 'base', query: ['q'] });

interface Hit { leg: 'api' | 'computer'; method: string; url: string; headers: Record<string, string>; body: string | null; journal: string }
interface Quirks { noAttempt?: boolean; otherUrl?: boolean; otherBody?: boolean; leakBearer?: boolean; cookie?: boolean }
type Answer = { status?: number; body?: unknown; code?: string };

function fakeClient(places: { apiOrigin?: string; proxyDomain?: string } = {}) {
  const hits: Hit[] = [];
  const quirks: Quirks = {};
  const inits: RequestInit[] = [];
  let journal: () => string = () => '';
  const answers: Record<string, Answer | (() => Answer)> = {
    'GET /users/auth/me': { body: { data: { id: UID, username: 'ada', email: 'ada@example.com' } } },
    'GET /realms': { body: { data: { realm_ids: [] } } },
    'GET /computers': { body: { data: { computers: [{ id: C1, project_id: P1, server_name: 'srv1', realm_ids: [] }], pagination: { totalPages: 1 } } } },
  };
  const answerOf = (key: string): Answer => { const a = answers[key]; return typeof a === 'function' ? a() : a ?? { status: 404, code: 'NOT_FOUND' }; };
  const client: HoodyClient = {
    identity: { kind: 'account', uid: UID, sid: 's1' },
    apiOrigin: places.apiOrigin ?? API,
    realmApiDomain: REALM_DOMAIN,
    proxyDomain: places.proxyDomain ?? PROXY,
    request: (method, p, body, o) => {
      const url = (o.base === undefined || o.base === '/api/v1' ? API + '/api/v1' : o.base) + p;
      const text = body === null || body === undefined ? null : canonicalJson(body);
      const attempt: WireAttempt = { method, url: quirks.otherUrl ? url + '&x=1' : url, bodyDigest: quirks.otherBody ? sha('{}') : text === null ? null : sha(text) };
      if (!o.beforeWire(quirks.noAttempt ? undefined : attempt)) return Promise.reject({ status: 0, notSent: true, stale: true });
      hits.push({ leg: 'api', method, url, headers: { authorization: `Bearer ${BEARER}` }, body: text, journal: journal() });
      const a = answerOf(`${method} ${p.split('?')[0]}`);
      const status = a.status ?? 200;
      return status >= 200 && status < 300 ? Promise.resolve(structuredClone(a.body ?? {})) : Promise.reject({ status, ...(a.code ? { code: a.code } : {}) });
    },
    fetch: (url: string, init: RequestInit, o?: ClientCallControls) => {
      inits.push(init);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
      if (quirks.leakBearer) headers.authorization = `Bearer ${BEARER}`;
      const body = typeof init.body === 'string' ? init.body : null;
      const method = String(init.method ?? 'GET');
      const attempt: WireAttempt = { method, url, bodyDigest: body === null ? null : sha(body), headers: Object.entries(headers).map(([n, v]) => [n, sha(v)] as const), cookie: quirks.cookie === true };
      if (!o || !o.beforeWire(quirks.noAttempt ? undefined : attempt)) return Promise.reject({ status: 0, notSent: true, stale: true });
      hits.push({ leg: 'computer', method, url, headers, body, journal: journal() });
      const a = answerOf(`${method} ${new URL(url).pathname}`);
      return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json', 'set-cookie': 'sid=fromcomputer' } }));
    },
  };
  return { client, hits, quirks, answers, inits, setJournal: (f: () => string) => { journal = f; } };
}

let flock: TryLock = () => true;
let home = '';
let dir = '';
const opened: number[][] = [];
const sessions: Array<ReturnType<typeof beginTermSession>> = [];
const boots: Array<ReturnType<typeof liveBoot>> = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-wire-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, API, UID)!;
});
afterEach(async () => {
  for (const b of boots.splice(0)) await b.dispose('term-abort').catch(() => {});
  for (const s of sessions.splice(0)) s.end();
  resetDirectMemory();
  for (const fds of opened.splice(0)) for (const fd of fds) { try { fs.closeSync(fd); } catch { /* closed */ } }
  fs.rmSync(home, { recursive: true, force: true });
});
function openStore(): HubStore {
  const fds: number[] = [];
  opened.push(fds);
  const io: StoreIo = { ...fs, openSync: ((...a: Parameters<typeof fs.openSync>) => { const fd = fs.openSync(...a); fds.push(fd); return fd; }) as typeof fs.openSync };
  return openHubStore(dir, { home, tryLock: flock, io });
}

function manualTimers(): WireTimers & { fire(): number; waits(): number[]; advance(ms: number): void } {
  let now = 1_000_000;
  let pending: Array<{ fn: () => void; ms: number }> = [];
  return {
    set: (fn, ms) => { const h = { fn, ms }; pending.push(h); return h; },
    clear: (h) => { pending = pending.filter((x) => x !== h); },
    now: () => now,
    advance: (ms) => { now += ms; },
    waits: () => pending.map((x) => x.ms),
    fire: () => { const run = pending; pending = []; for (const x of run) { now += x.ms; x.fn(); } return run.length; },
  };
}

interface Mounted { f: ReturnType<typeof fakeClient>; boot: ReturnType<typeof liveBoot>; area: HubStore | null; bypasses: string[]; timers: ReturnType<typeof manualTimers> }
async function mount(o: { area?: HubStore | null; wiring?: Partial<LiveWiring>; f?: ReturnType<typeof fakeClient>; list?: boolean } = {}): Promise<Mounted> {
  const f = o.f ?? fakeClient();
  const area = o.area === undefined ? openStore() : o.area;
  const bypasses: string[] = [];
  const timers = manualTimers();
  if (area) f.setJournal(() => area.journalGet(CHANGE_STORE_KEY) ?? '');
  const session = beginTermSession();
  sessions.push(session);
  const boot = liveBoot(f.client, { profile: 'p', realmId: 'all' }, () => '/', {
    area, secretReveal: () => false, requestDeadlineMs: 30_000, storeOpenedAt: timers.now(), onBypass: (c) => { bypasses.push(c); }, timers, ...o.wiring,
  });
  boots.push(boot);
  await boot.start(session, () => {});
  // The session's own list answers: the membership table learns C1 on srv1.
  if (o.list !== false) await api(containersRoute, { query: { page: 1, limit: 100 } });
  return { f, boot, area, bypasses, timers };
}
/** The first mount ended and a second one started on the same client and store, with other wiring. */
async function mountAgain(m: Mounted, wiring: Partial<LiveWiring>): Promise<Mounted> {
  await m.boot.dispose('term-abort');
  boots.splice(boots.indexOf(m.boot), 1);
  sessions.pop()!.end();
  return mount({ f: m.f, area: m.area, wiring });
}
const computerHits = (m: Mounted): Hit[] => m.f.hits.filter((h) => h.leg === 'computer');
const codeOf = (e: unknown): string => String((e as { code?: unknown } | null)?.code ?? '');
async function refusedWith(p: Promise<unknown>): Promise<string> { try { await p; return 'SENT'; } catch (e) { return codeOf(e) || 'REJECTED'; } }
/** A refusal as core hands it to the page: its code, and whether core says nothing was sent. */
async function refusal(p: Promise<unknown>): Promise<string> { try { await p; return 'SENT'; } catch (e) { const x = e as { code?: unknown; kind?: unknown; notSent?: unknown }; return `${String(x.code)}/${String(x.kind)}/${String(x.notSent)}`; } }
const journalOf = (area: HubStore): string => area.journalGet(CHANGE_STORE_KEY) ?? '';

test('bad places refuse the boot', async () => {
  for (const places of [{ apiOrigin: 'https://api.example.invalid/path' }, { apiOrigin: 'http://api.example.invalid' }, { apiOrigin: 'https://user@api.example.invalid' }, { proxyDomain: 'https://px.invalid' }, { proxyDomain: 'api.example.invalid' }, { proxyDomain: REALM_DOMAIN }]) {
    const f = fakeClient(places);
    const session = beginTermSession();
    sessions.push(session);
    const boot = liveBoot(f.client, { profile: 'p', realmId: 'all' }, () => '/', { area: null, secretReveal: () => false, requestDeadlineMs: 1, storeOpenedAt: 0 });
    boots.push(boot);
    const code = await boot.start(session, () => {}).then(() => 'BOOTED', (e: unknown) => codeOf(e));
    expect(code, JSON.stringify(places)).toBe(Object.hasOwn(places, 'apiOrigin') ? 'TERM_API_ORIGIN' : 'TERM_PROXY_DOMAIN');
    expect(f.hits).toEqual([]);
    expect(liveGateInstalled()).toBe(false);
    await boot.dispose('term-abort').catch(() => {});
    boots.pop();
    session.end();
    sessions.pop();
  }
});

test('hoody leg is bound to its attempt', async () => {
  const m = await mount();
  // Boot and the list went out through the policy, each with the API bearer the client adds, to the API origin only.
  expect(m.f.hits.map((h) => `${h.method} ${h.url.split('?')[0]}`)).toEqual(expect.arrayContaining([`GET ${API}/api/v1/users/auth/me`, `GET ${API}/api/v1/computers`]));
  expect(m.bypasses).toEqual([]);
  m.f.answers['GET /wt/things'] = { body: { data: 1 } };
  await api(hoodyRead, { query: { q: 'a' } });
  const before = m.f.hits.length;
  for (const quirk of ['noAttempt', 'otherUrl'] as const) {
    m.f.quirks[quirk] = true;
    expect(await refusedWith(api(hoodyRead, { query: { q: 'a' } })), quirk).not.toBe('SENT');
    m.f.quirks[quirk] = false;
  }
  expect(m.f.hits.length).toBe(before);
  expect(m.bypasses).toEqual(['TERM_POLICY_BYPASS', 'TERM_POLICY_BYPASS']);
  // An undeclared route, a route copy and a call with no route never reach the client.
  for (const meta of [undefined, { route: { ...hoodyRead }, method: 'GET', path: '/wt/things', query: {}, body: null }]) {
    expect(await refusedWith(transport().hoody('GET', '/wt/things', null, {}, meta as never))).toBe('TERM_ROUTE_UNDECLARED');
  }
  // A declared route sent to another place than core's routing chose.
  expect(await refusedWith(transport().hoody('GET', '/wt/things', null, { base: `https://${'b'.repeat(24)}.${REALM_DOMAIN}/api/v1` }, { route: hoodyRead, method: 'GET', path: '/wt/things', query: {}, body: null }))).toBe('TERM_DESTINATION');
  expect(await refusedWith(transport().hoody('GET', '/wt/things', null, { base: 'https://elsewhere.invalid/api/v1' }, { route: hoodyRead, method: 'GET', path: '/wt/things', query: {}, body: null }))).toBe('TERM_DESTINATION');
  expect(m.f.hits.length).toBe(before);
});

test('no bearer on a computer', async () => {
  const m = await mount();
  m.f.answers['GET /wt/info'] = { body: { ok: true } };
  m.f.answers['GET /api/v1/agent/hoody/auth/status'] = { body: { authenticated: false } };
  await api(kitRead, { target: T1 });
  await api(agentSignInRoutes.status, { target: T1 });
  const sent = computerHits(m);
  expect(sent.length).toBe(2);
  for (const h of sent) {
    expect(h.url.startsWith(`https://${P1}-${C1}-`), h.url).toBe(true);
    expect(new URL(h.url).host.endsWith(`.srv1.${PROXY}`)).toBe(true);
    expect(Object.keys(h.headers).sort()).toEqual(['accept']);
    expect(JSON.stringify(h)).not.toContain(BEARER);
  }
  // The API bearer went to the API origin only.
  for (const h of m.f.hits) expect(h.headers.authorization === `Bearer ${BEARER}`).toBe(h.leg === 'api' && h.url.startsWith(API + '/'));
  // Mutant client: it adds its bearer to a computer request (and says so in its attempt) → refused at the final check.
  m.f.quirks.leakBearer = true;
  expect(await refusedWith(api(kitRead, { target: T1 }))).not.toBe('SENT');
  expect(await refusedWith(api(agentSignInRoutes.status, { target: T1 }))).not.toBe('SENT');
  expect(computerHits(m).length).toBe(2);
  expect(m.bypasses).toEqual(['TERM_POLICY_BYPASS', 'TERM_POLICY_BYPASS']);
});

test('destination', async () => {
  const m = await mount({ list: false });
  m.f.answers['GET /wt/info'] = { body: { ok: true } };
  // No row yet: unknown is a refusal, with core's own routing check saying yes (it has no evidence).
  expect(await refusedWith(api(kitRead, { target: T1 }))).not.toBe('SENT');
  expect(computerHits(m)).toEqual([]);
  await api(containersRoute, { query: { page: 1, limit: 100 } });
  await api(kitRead, { target: T1 });
  expect(computerHits(m).length).toBe(1);
  // A computer the list does not hold; the right computer on another server.
  expect(await refusedWith(api(kitRead, { target: T2 }))).not.toBe('SENT');
  expect(await refusedWith(api(kitRead, { target: { project: T1.project, container: { id: C1, server_name: 'srv2' } } }))).not.toBe('SENT');
  // A forged plan at the transport: the API origin, a realm host, another proxy domain, a look-alike suffix, another computer's host.
  const good = computerHits(m)[0]!.url;
  const host = new URL(good).host;
  const meta = { route: kitRead, method: 'GET', path: '/wt/info', query: {}, body: null, target: T1 };
  for (const url of [
    `${API}/wt/info`, `https://${'b'.repeat(24)}.${REALM_DOMAIN}/wt/info`, good.replace(PROXY, 'px2.invalid'), good.replace(PROXY, PROXY + '.evil.invalid'),
    good.replace(host, host.replace(C1, C2)), good.replace('https://', 'http://'), good.replace(host, 'user@' + host),
  ]) {
    expect(await refusedWith(transport().fetch(url, { method: 'GET', headers: { Accept: 'application/json' } }, meta)), url).toBe('TERM_DESTINATION');
  }
  expect(computerHits(m).length).toBe(1);
  // A realm switch clears the table: the same computer is unknown again until the list answers.
  m.boot.wire()!.members.clear();
  expect(await refusedWith(api(kitRead, { target: T1 }))).not.toBe('SENT');
  expect(computerHits(m).length).toBe(1);
});

test('no cookie', async () => {
  const m = await mount();
  m.f.answers['GET /api/v1/agent/hoody/auth/status'] = { body: {} };
  // The agent plan asks `credentials: include` (core/kit.ts); the client is handed omit, and its answer's Set-Cookie comes back on no later request.
  await api(agentSignInRoutes.status, { target: T1 });
  await api(agentSignInRoutes.status, { target: T1 });
  expect(m.f.inits.map((i) => i.credentials)).toEqual(['omit', 'omit']);
  for (const h of computerHits(m)) expect(Object.keys(h.headers)).not.toContain('cookie');
  m.f.quirks.cookie = true;
  expect(await refusedWith(api(agentSignInRoutes.status, { target: T1 }))).not.toBe('SENT');
  expect(computerHits(m).length).toBe(2);
  // A cookie header on a plan is refused before the client is asked.
  const url = computerHits(m)[0]!.url;
  expect(await refusedWith(transport().fetch(url, { method: 'GET', headers: { Accept: 'application/json', Cookie: 'a=b' } }, { route: agentSignInRoutes.status, method: 'GET', path: '/hoody/auth/status', query: {}, body: null, target: T1 }))).toBe('TERM_CREDENTIAL_CLASS');
  expect(m.f.inits.length).toBe(3);
});

test('boot token', async () => {
  const m = await mount();
  const area = m.area!;
  const wire = m.boot.wire()!;
  wire.policy.holdBootToken(BOOT);
  m.f.answers['POST /api/v1/agent/hoody/auth/bootstrap'] = { body: { ok: true } };
  m.f.answers['GET /wt/info'] = { body: {} };
  const place = { project: P1, computer: C1 };
  // In a query, in a run header, in another route's body: refused, nothing sent.
  expect(await refusedWith(api(kitRead, { target: T1, query: { q: BOOT } }))).not.toBe('SENT');
  expect(await refusedWith(run(runGet as Route, T1, '/', { headers: { 'X-Mine': `v ${BOOT}` } }))).not.toBe('SENT');
  const make = await holdAttempt('wire.test.make', { by: 'wire:test' });
  expect(await refusedWith(api(kitPost, { target: T1, body: { name: BOOT } }))).not.toBe('SENT');
  expect(computerHits(m)).toEqual([]);
  // A computer that is not in the session's list: refused before anything went out, and its record freed.
  expect(await refusedWith(directChange('agent-bootstrap', { project: P1, computer: C2 }, (bind) => api(agentSignInRoutes.bootstrap, { target: T2, body: { token: BOOT }, recovers: true, bind })))).not.toBe('SENT');
  expect(heldAttempts().filter((h) => h.lock.startsWith('term.direct.agent-bootstrap'))).toEqual([]);
  // The one allowed send: the bootstrap body, to the captured agent, its record on disk before the wire.
  await directChange('agent-bootstrap', place, (bind) => api(agentSignInRoutes.bootstrap, { target: T1, body: { token: BOOT }, recovers: true, bind }));
  const sent = computerHits(m);
  expect(sent.length).toBe(1);
  expect(sent[0]!.url).toMatch(new RegExp(`^https://${P1}-${C1}-[^/]*\\.srv1\\.px\\.invalid/api/v1/agent/hoody/auth/bootstrap$`));
  expect(JSON.parse(sent[0]!.body!)).toEqual({ token: BOOT });
  expect(JSON.stringify(sent[0]!.headers) + sent[0]!.url).not.toContain(BOOT);
  expect(sent[0]!.journal).toContain(`term.direct.agent-bootstrap:${C1}`);
  expect(heldAttempts().filter((h) => h.lock.startsWith('term.direct.agent-bootstrap'))).toEqual([]);
  // Without the gate's record (a plain api() of the same route): row 6 refuses it, even while another send's record is out.
  expect(await refusedWith(api(agentSignInRoutes.bootstrap, { target: T1, body: { token: BOOT }, recovers: true }))).not.toBe('SENT');
  expect(computerHits(m).length).toBe(1);
  if (make.ok) make.hold.release();
  // The canary is in no record.
  expect(journalOf(area)).not.toContain(BOOT);
  expect(fs.readdirSync(dir).map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('\n')).not.toContain(BOOT);
  // Dropped: the same value is an ordinary string again.
  wire.policy.dropBootToken();
  await api(kitRead, { target: T1, query: { q: BOOT } });
  expect(computerHits(m).length).toBe(2);
});

test('run headers', async () => {
  const m = await mount();
  m.f.answers['GET /'] = { body: 'ok' };
  m.f.answers['GET /wt/info'] = { body: {} };
  const mine = { Authorization: 'Basic cGVyc29uOnBhc3M=', 'X-Mine': 'one two' };
  await run(runGet as Route, T1, '/', { headers: mine });
  const sent = computerHits(m);
  expect(sent.length).toBe(1);
  expect(sent[0]!.headers.authorization).toBe(mine.Authorization);
  expect(sent[0]!.headers['x-mine']).toBe('one two');
  expect(JSON.stringify(sent[0])).not.toContain(BEARER);
  // The same headers on a route that is not a run route: refused (forged at the transport; core's admit refuses them earlier).
  const meta = { route: kitRead, method: 'GET', path: '/wt/info', query: {}, body: null, target: T1 };
  const url = sent[0]!.url.replace(/\/$/, '').replace(/-exec-/, '-files-') + '/wt/info';
  const forged: Array<Record<string, string>> = [{ Accept: 'application/json', Authorization: mine.Authorization }, { Accept: 'application/json', 'X-Mine': '1' }, { Accept: 'application/json', 'X-Hoody-Cwd': '/' }];
  for (const headers of forged) {
    expect(await refusedWith(transport().fetch(url, { method: 'GET', headers }, meta)), JSON.stringify(headers)).toMatch(/^TERM_(CREDENTIAL_CLASS|DESTINATION)$/);
  }
  // On a run route an X-Hoody-* or proxy header of the person's is still refused.
  const runMeta = { route: runGet, method: 'GET', path: '/', query: {}, body: null, target: T1 };
  expect(await refusedWith(transport().fetch(sent[0]!.url, { method: 'GET', headers: { Accept: 'application/json', 'X-Hoody-Cwd': '/' } }, runMeta))).toBe('TERM_CREDENTIAL_CLASS');
  expect(computerHits(m).length).toBe(1);
});

test('a change needs its record', async () => {
  const m = await mount();
  m.f.answers['POST /wt/things'] = { body: { data: { id: 1 } } };
  m.f.answers['POST /wt/make'] = { body: {} };
  const changes = (): number => m.f.hits.filter((h) => h.method !== 'GET').length;
  // A page's change: core writes its own record before the send (guarded / holdAttempt, as on the web); with the store
  // writable the terminal admits it, on both legs.
  expect(await refusedWith(api(hoodyPost, { body: { name: 'a' } }))).toBe('SENT');
  expect(await refusedWith(api(kitPost, { target: T1, body: { name: 'a' } }))).toBe('SENT');
  expect(changes()).toBe(2);
  // Money never leaves this build: a wallet transfer, a top-up, a market reserve or rent, a plan buy, pay, upgrade or
  // auto-renew is refused at the wire, unsent, with a page hold out or without.
  const got = await holdAttempt('wire.test.things', { by: 'wire:test' });
  expect(got.ok).toBe(true);
  const before = journalOf(m.area!);
  const money: Array<[Route, CallInput<unknown>]> = [
    [commerceRoutes.transferRoute as Route, { body: { amount: 100, idempotency_key: 'k-0123456789abcdef', expected_fee_bps: 0 } }],
    [commerceRoutes.claimRoute as Route, { body: {} }],
    [commerceRoutes.checkoutRoute as Route, { body: { amount: 500, idempotency_key: 'k-0123456789abcdef' } }],
    [commerceRoutes.invoiceRoute as Route, { body: { amount: 500, idempotency_key: 'k-0123456789abcdef' } }],
    [commerceRoutes.reserveRoute as Route, { params: { id: 'o1' }, body: { days: 30, max_charge_cents: 1, idempotency_key: 'k-0123456789abcdef' } }],
    [commerceRoutes.rentRoute as Route, { params: { id: 's1' }, body: { rental_days: 30, max_charge_cents: 1 } }],
    [commerceRoutes.buyRoute as Route, { body: { plan_id: 'v1', idempotency_key: 'k-0123456789abcdef', max_charge_cents: 1 } }],
    [commerceRoutes.payRoute as Route, { params: { id: 'x1' }, body: { idempotency_key: 'k-0123456789abcdef', max_charge_cents: 1 } }],
    [commerceRoutes.upgradeRoute as Route, { params: { id: 'x1' }, body: { plan_id: 'v2', idempotency_key: 'k-0123456789abcdef', max_charge_cents: 1 } }],
    [commerceRoutes.autoRenewRoute as Route, { params: { id: 'x1' }, body: { auto_renew: false } }],
  ];
  for (const [route, input] of money) expect(await refusal(api(route, input)), route.path).toBe('NOT_DURABLE/not_sent/true');
  // The terminal's own routes, sent without their own record (a plain api()), are refused unsent too.
  expect(await refusedWith(api(agentSignInRoutes.bootstrap, { target: T1, body: { token: BOOT }, recovers: true }))).not.toBe('SENT');
  expect(await refusal(api(termTokenRevokeRoute, { params: { id: 'tokA' } }))).toBe('NOT_DURABLE/not_sent/true');
  expect(changes()).toBe(2);
  // The page's hold was not taken or changed by any of them.
  expect(journalOf(m.area!)).toBe(before);
  // The Keys page's own key create is the boot mint's route, sent without a bind: a page change under core's record,
  // never under the producer's mint record even while one is out (live-wire.ts claimRecord). Its key is shown once, so
  // this mount (no secret screen) refuses it unsent at row 7; 'row 7: ...' below sends it where the key can be shown.
  m.f.answers['POST /auth/tokens'] = { body: { data: {} } };
  expect(await refusedWith(api(tokenMintRoute, { body: { alias: 'probe-key0' }, scrub: () => {} }))).not.toBe('SENT');
  expect(changes()).toBe(2);
  const mint = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, { op: 'q1w2e3r4t5' });
  if (!mint.ok) throw new Error(mint.code);
  const records: unknown[] = [];
  const policy = m.boot.wire()!.policy;
  const admit = policy.admitLive.bind(policy);
  policy.admitLive = (c) => { if (c.method === 'POST') records.push(c.record); return admit(c); };
  expect(await refusedWith(api(tokenMintRoute, { body: { alias: 'probe-key' }, scrub: () => {} }))).not.toBe('SENT');
  policy.admitLive = admit;
  expect(changes()).toBe(2);
  expect(records).toEqual([{ coreHeld: true }]);
  expect(heldAttempts().filter((h) => h.lock.startsWith('term.direct.boot-token-mint')).length).toBe(1);
  settleDirectChange(mint.hold, 'definite');
  expect(heldAttempts().filter((h) => h.lock.includes('wire.test.things')).length).toBe(1);
  if (got.ok) got.hold.release();
});

test('row 7: the key mint needs the secret screen; only the boot mint\'s own call passes without it', async () => {
  // This mount cannot show a secret (secretReveal false: the main screen, no TTY, or TERM=dumb).
  const m = await mount();
  const MINTED = 'hdy_BOOTcanary0123456789abcdefXYZ';
  const exp = new Date(Date.now() + 90 * 86_400_000).toISOString();
  m.f.answers['POST /auth/tokens'] = { body: { data: { id: 'tokM', token: MINTED, expires_at: exp } } };
  m.f.answers['GET /auth/tokens/templates'] = { body: { data: [{ name: 'full_access', permissions: { resources: {} } }] } };
  const mints = (): number => m.f.hits.filter((h) => h.method === 'POST' && h.url.split('?')[0] === `${API}/api/v1/auth/tokens`).length;
  const policy = m.boot.wire()!.policy;
  const admit = policy.admitLive.bind(policy);
  const codes: string[] = [];
  policy.admitLive = (c) => { const r = admit(c); if (c.method === 'POST') codes.push(r.ok ? 'ok' : String(r.code)); return r; };
  // New key and New share (keys/routes.ts create, no bind): minted here, the shown-once key could never be shown or
  // copied, so it is refused unsent, like Copy key.
  expect(await refusal(api(tokenMintRoute, { body: { alias: 'probe-new' }, scrub: () => {} }))).toMatch(/\/not_sent\/true$/);
  expect(codes).toEqual(['TERM_SECRET_SCREEN']);
  expect(mints()).toBe(0);
  // The boot-token mint on the same route, its record bound to its own call as core/boot-token.ts mintFor sends it:
  // its value goes to the agent only, so it is sent.
  const boot = await m.boot.wire()!.producer.ensure(UID, {
    mint: (_m, _p, body, o) => { const bind = (o as { bind?: object } | null)?.bind; return api(tokenMintRoute, { body: body as Record<string, unknown>, ...(bind ? { bind } : {}) }); },
  });
  policy.admitLive = admit;
  expect(boot.token).toBe(MINTED);
  expect(codes).toEqual(['TERM_SECRET_SCREEN', 'ok']);
  expect(mints()).toBe(1);
  // Where a secret can be shown, the Keys page's mint is sent (a page change under core's record).
  await mountAgain(m, { secretReveal: () => true });
  expect(await refusedWith(api(tokenMintRoute, { body: { alias: 'probe-new' }, scrub: () => {} }))).toBe('SENT');
  expect(mints()).toBe(2);
});

test('a change needs its record: read-only and no store', async () => {
  // A second Hub: the store is held by the first opener, so this one is read-only.
  const first = openStore();
  const second = openStore();
  expect(second.readOnly).toBe('busy');
  const ro = await mount({ area: second });
  expect(ro.boot.wire()!.storeMode()).toBe('ro');
  expect(await refusedWith(api(hoodyPost, { body: { name: 'a' } }))).toBe('TERM_READ_ONLY');
  expect(ro.f.hits.filter((h) => h.method === 'POST')).toEqual([]);
  await ro.boot.dispose('term-abort');
  boots.pop();
  sessions.pop()!.end();
  first.close();
  // No store at all: changes are off, with a memory hold or without (never a fallback to memory).
  const none = await mount({ area: null });
  expect(none.boot.wire()!.storeMode()).toBe('none');
  await holdAttempt('wire.test.none', { by: 'wire:test' }).catch(() => null);
  expect(await refusedWith(api(hoodyPost, { body: { name: 'a' } }))).toBe('NOT_DURABLE');
  expect(none.f.hits.filter((h) => h.method === 'POST')).toEqual([]);
});

test('the account mail asks, which core sends past the transport: refused unsent in a read-only Hub and in one with no store, sent in a writable one', async () => {
  const mails = (m: Mounted) => m.f.hits.filter((h) => h.method === 'POST' && /\/auth\/(forgot-password|resend-verification)$/.test(h.url)).map((h) => h.url.split('/auth/')[1]);
  const end = async (m: Mounted) => { await m.boot.dispose('term-abort'); boots.pop(); sessions.pop()!.end(); };
  // Read-only by the person's choice.
  const chosen = await mount({ wiring: { readOnlyChoice: true } });
  expect(chosen.boot.wire()!.storeMode()).toBe('ro');
  expect(await requestPasswordReset('ada@example.com')).toEqual({ kind: 'refused', why: 'read-only' });
  expect(await resendVerification('ada@example.com')).toEqual({ kind: 'refused', why: 'read-only' });
  expect(mails(chosen)).toEqual([]);
  await end(chosen);
  chosen.area!.close();
  // A second Hub on a store the first one holds.
  const first = openStore();
  const second = openStore();
  const ro = await mount({ area: second });
  expect(ro.boot.wire()!.storeMode()).toBe('ro');
  expect(await requestPasswordReset('ada@example.com')).toEqual({ kind: 'refused', why: 'read-only' });
  expect(mails(ro)).toEqual([]);
  await end(ro);
  first.close();
  // No usable store: changes are off, these too.
  const none = await mount({ area: null });
  expect(none.boot.wire()!.storeMode()).toBe('none');
  expect(await requestPasswordReset('ada@example.com')).toEqual({ kind: 'refused', why: 'read-only' });
  expect(await resendVerification('ada@example.com')).toEqual({ kind: 'refused', why: 'read-only' });
  expect(mails(none)).toEqual([]);
  await end(none);
  // A writable Hub sends each ask, once.
  const rw = await mount();
  expect(rw.boot.wire()!.storeMode()).toBe('rw');
  await requestPasswordReset('ada@example.com');
  await resendVerification('ada@example.com');
  expect(mails(rw)).toEqual(['forgot-password', 'resend-verification']);
});

test('money: a plan purchase or upgrade leaves nothing behind', async () => {
  // core/commerce.ts claims a purchase in its own store (claimFenced, claimUpgrade: the entry is written `sending`
  // and read back BEFORE the POST), and keeps a claimed entry as held when the POST is then refused. No such change
  // can be sent from this build, so the store takes no entry: the claim's read-back refuses it, nothing is sent,
  // nothing is kept, and no hold is shown. (commerce's send lock reads `navigator` itself: declared below.)
  expectTraps('navigator');
  const FAM = 'f00df00df00df00df00df00d';
  const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Plus' } };
  for (const mode of ['ro', 'rw', 'none'] as const) {
    const first = mode === 'ro' ? openStore() : null;
    const area = mode === 'none' ? null : openStore();
    const f = fakeClient();
    f.answers['GET /subserver-subscriptions/quote'] = { body: { data: { charge_cents: 900, price_cents_per_month: 900 } } };
    f.answers['GET /subserver-subscriptions/x1/quote'] = { body: { data: { charge_cents: 450 } } };
    f.answers['POST /subserver-subscriptions'] = { body: { data: {} } };
    f.answers['POST /subserver-subscriptions/x1/upgrade'] = { body: { data: {} } };
    const m = await mount({ area, f });
    expect(m.boot.wire()!.storeMode()).toBe(mode);
    expect(hasWebLocks()).toBe(true);
    const memory = sessions.at(-1)!.stores().local;
    for (const [kind, target, key] of [['buy', { plan: PLAN, title: 'Plus' }, 'hub_money_pending'], ['upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' }, 'hub_money_upgrade']] as const) {
      const a = createAttempt(kind, target as never);
      expect(await a.quote()).toMatchObject({ charge_cents: kind === 'buy' ? 900 : 450 });
      // The answer the panel gets: not sent, for the store. Never 'unknown' ("may have gone through").
      expect(await a.confirm(true)).toEqual({ ok: false, reason: 'store', notSent: true });
      expect(a.snapshot()).toMatchObject({ phase: 'review', notice: 'store', pending: false, result: null });
      expect(m.f.hits.filter((h) => h.method !== 'GET')).toEqual([]);
      // No entry anywhere: not in the store core reads, not in memory under it, not in the files.
      expect(hostEnv().local!.getItem(key)).toBeNull();
      expect(memory.getItem(key)).toBeNull();
      if (area) { expect(area.journalGet(key)).toBeNull(); expect(journalOf(area)).toBe(''); }
      expect(await planHolds(capture())).toEqual([]);
      // A new panel on the same target has nothing retained to resend.
      expect(createAttempt(kind, target as never).snapshot()).toMatchObject({ pending: false, key: null });
    }
    if (mode !== 'none') expect(fs.readdirSync(dir).map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('\n')).not.toContain('hub_money');
    await m.boot.dispose('term-abort');
    boots.pop();
    sessions.pop()!.end();
    first?.close();
    area?.close();
  }
});

test('direct changes settle', async () => {
  const m = await mount();
  const place = { project: P1, computer: C1 };
  const held = (): string[] => heldAttempts().filter((h) => h.lock.startsWith('term.direct.')).map((h) => h.lock);
  // An unknown answer after the wire (a 5xx from the way there): the record stays, and a second send is refused unsent.
  m.f.answers['POST /api/v1/agent/hoody/auth/bootstrap'] = { status: 502 };
  expect(await refusedWith(directChange('agent-bootstrap', place, (bind) => api(agentSignInRoutes.bootstrap, { target: T1, body: { token: BOOT }, recovers: true, bind })))).not.toBe('SENT');
  expect(held()).toEqual([`term.direct.agent-bootstrap:${C1}`]);
  const posts = (): number => computerHits(m).filter((h) => h.method === 'POST').length;
  expect(posts()).toBe(1);
  expect(await refusedWith(directChange('agent-bootstrap', place, (bind) => api(agentSignInRoutes.bootstrap, { target: T1, body: { token: BOOT }, recovers: true, bind })))).toBe('HELD');
  expect(posts()).toBe(1);
  // A site's record covers only that site's own route: another route sent under it finds no record and stays unsent.
  let during: string[] = [];
  expect(await refusedWith(directChange('realm-alias-write', null, (bind) => { during = held(); return api(agentSignInRoutes.bootstrap, { target: T1, body: { token: BOOT }, recovers: true, bind }); }))).not.toBe('SENT'); // (a secret route: core withholds the refusal's code)
  expect(during).toEqual([`term.direct.agent-bootstrap:${C1}`, 'term.direct.realm-alias-write']);
  expect(posts()).toBe(1);
  expect(held()).toEqual([`term.direct.agent-bootstrap:${C1}`]);
  // Each core site names itself with a literal constant, once, and with its own route.
  const src = (f: string): string => fs.readFileSync(path.resolve(import.meta.dir, '..', '..', 'core', f), 'utf8');
  expect(src('agent-signin.ts').match(/directChange\('agent-bootstrap', \{ project: target\.project\.id, computer: target\.container\.id \}, \(bind\) => api\(agentSignInRoutes\.bootstrap,/g)?.length).toBe(1);
  expect(src('realm.ts').match(/directChange\('realm-alias-write', null, \(bind\) => api\(vaultKeyPutRoute,/g)?.length).toBe(1);
  for (const f of ['agent-signin.ts', 'realm.ts']) expect(src(f).match(/directChange\(/g)?.length, f).toBe(1);
  // The only send of each route in its file is the one inside its directChange.
  expect(src('agent-signin.ts').match(/\bapi\(agentSignInRoutes\.bootstrap/g)?.length).toBe(1);
  expect(src('agent-signin.ts')).toMatch(/directChange\('agent-bootstrap', [^\n]*\(bind\) => api\(agentSignInRoutes\.bootstrap, [^\n]*\.\.\.\(bind \? \{ bind \} : \{\}\)/);
  expect(src('realm.ts').match(/\bapi\(vaultKeyPutRoute/g)?.length).toBe(1);
  expect(src('realm.ts')).toMatch(/directChange\('realm-alias-write', [^\n]*\(bind\) => api\(vaultKeyPutRoute, [^\n]*\.\.\.\(bind \? \{ bind \} : \{\}\)/);
});

test('recovery reruns', async () => {
  const m = await mount();
  const wire = m.boot.wire()!;
  const lockOf = (h: { lock: string }): string => h.lock;
  // An agent sign-in left unknown by this mount; its computer then leaves the session's list (no status read possible).
  const got = await holdDirectChange('agent-bootstrap', agentSignInRoutes.bootstrap as Route, { project: P1, computer: C1 });
  if (!got.ok) throw new Error(got.code);
  settleDirectChange(got.hold, 'unknown');
  wire.members.clear();
  let reads = 0;
  let status: unknown = { auth_active: false };
  m.f.answers['GET /api/v1/agent/hoody/auth/status'] = () => { reads++; return { body: status }; };
  expect((await wire.recover()).map((r) => r.outcome)).toEqual(['kept']);
  await Promise.resolve();
  // It is tried again on a timer, not at the next start.
  expect(m.timers.waits()).toEqual([RECOVERY_UNREAD_MS]);
  expect(m.timers.fire()).toBe(1);
  await wire.recover();
  expect(reads).toBe(0);
  expect(heldAttempts().map(lockOf)).toEqual([`term.direct.agent-bootstrap:${C1}`]);
  // The list answers again. A status that shows the agent signed out, or with no identity yet, keeps the hold (the
  // sign-in may still be under way). Once it shows the account signed in, a change of the holds (another hold taken)
  // starts a pass by itself, which reads and frees.
  await api(containersRoute, { query: { page: 1, limit: 100 } });
  expect((await wire.recover()).map((r) => r.outcome)).toEqual(['kept']);
  expect(reads).toBe(1);
  status = {};
  expect((await wire.recover()).map((r) => r.outcome)).toEqual(['kept']);
  expect(reads).toBe(2);
  expect(heldAttempts().map(lockOf)).toEqual([`term.direct.agent-bootstrap:${C1}`]);
  status = { account_id: UID, auth_active: true, owner_fingerprint: 'fp', restriction: 'none' };
  const other = await holdAttempt('wire.test.other', { by: 'wire:test' });
  for (let i = 0; i < 200 && heldAttempts().some((h) => h.lock.startsWith('term.direct.')); i++) await new Promise((r) => setTimeout(r, 5));
  expect(reads).toBe(3);
  expect(heldAttempts().map(lockOf)).toEqual(['wire.test.other']);
  if (other.ok) other.hold.release();

  // A young boot-token mint record (an empty token list read too soon after the mint): kept, and read again by the
  // timer once it is old enough; then freed. Never left for the next start.
  m.f.answers['GET /auth/tokens'] = { body: { data: [], meta: { total: 0 } } };
  const mint = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, { op: 'k3v9q2m7xa' });
  if (!mint.ok) throw new Error(mint.code);
  noteMintHold(mint.hold);
  settleDirectChange(mint.hold, 'unknown', m.timers.now());
  // (A pass that still sees the request as out waits for the stamp to go stale; the next change of the holds replaces it.)
  for (let i = 0; i < 200 && !(m.timers.waits().length === 1 && m.timers.waits()[0]! <= 30_000 + BOOT_LAND_MARGIN_MS + 1000); i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(heldAttempts().map(lockOf)).toEqual(['term.direct.boot-token-mint:k3v9q2m7xa']);
  expect(heldAttempts()[0]!.meta).toEqual({ alias: bootAliasOf('k3v9q2m7xa') });
  const waits = m.timers.waits();
  expect(waits.length).toBe(1);
  expect(waits[0]!).toBeGreaterThan(BOOT_LAND_MARGIN_MS);
  expect(waits[0]!).toBe(30_000 + BOOT_LAND_MARGIN_MS + 1000);
  expect(m.timers.fire()).toBe(1);
  for (let i = 0; i < 200 && heldAttempts().length; i++) await new Promise((r) => setTimeout(r, 5));
  expect(heldAttempts()).toEqual([]);
  // Disposed: no timer is left and no pass runs.
  await m.boot.dispose('term-abort');
  boots.pop();
  expect(m.timers.waits()).toEqual([]);
  expect(await wire.recover()).toEqual([]);
});

test('locked: nothing leaves', async () => {
  let lock: 'live' | 'locked' = 'live';
  const m = await mount({ wiring: { lockState: () => lock } });
  m.f.answers['GET /wt/things'] = { body: {} };
  await api(hoodyRead, {});
  const n = m.f.hits.length;
  lock = 'locked';
  expect(await refusedWith(api(hoodyRead, {}))).not.toBe('SENT');
  expect(await refusedWith(api(kitRead, { target: T1 }))).not.toBe('SENT');
  expect(m.f.hits.length).toBe(n);
  lock = 'live';
  await api(hoodyRead, {});
  expect(m.f.hits.length).toBe(n + 1);
});

test('the lease and the body', async () => {
  const m = await mount();
  m.f.answers['GET /api/v1/agent/hoody/auth/status'] = { body: {} };
  m.f.answers['GET /api/v1/agent/wt/lease'] = { body: {} };
  await api(agentSignInRoutes.status, { target: T1 });
  const statusUrl = computerHits(m)[0]!.url;
  const leased = defineRoute({ method: 'GET', path: '/wt/lease', scope: 'agent', realm: 'none', tickets: { lease: 'optional' } });
  const lease = { Accept: 'application/json', 'X-Hoody-Approver-Lease': 'ticket-one' };
  // The lease ticket's header is no plan header: it passes only at the seal, on a route that declares the ticket.
  const res = await transport().fetch(statusUrl.replace('/hoody/auth/status', '/wt/lease'), { method: 'GET', headers: lease }, { route: leased, method: 'GET', path: '/wt/lease', query: {}, body: null, target: T1 });
  expect((res as Response).status).toBe(200);
  expect(computerHits(m).at(-1)!.headers['x-hoody-approver-lease']).toBe('ticket-one');
  const n = computerHits(m).length;
  const statusMeta = { route: agentSignInRoutes.status, method: 'GET', path: '/hoody/auth/status', query: {}, body: null, target: T1 };
  expect(await refusedWith(transport().fetch(statusUrl, { method: 'GET', headers: lease }, statusMeta))).toBe('TERM_CREDENTIAL_CLASS');
  // A body that is not text or bytes cannot be bound to its digest: refused before the policy is asked.
  for (const body of [new Blob(['x']), new ReadableStream(), new URLSearchParams('a=1')]) {
    expect(await refusedWith(transport().fetch(statusUrl, { method: 'GET', headers: { Accept: 'application/json' }, body: body as never }, statusMeta))).toBe('TERM_ROUTE_UNDECLARED');
  }
  expect(await refusedWith(transport().fetch(statusUrl, { method: 'GET', headers: new Headers({ Accept: 'application/json' }) }, statusMeta))).toBe('TERM_CREDENTIAL_CLASS');
  expect(computerHits(m).length).toBe(n);
});

test('another change\'s record is never this send\'s', async () => {
  const m = await mount();
  const area = m.area!;
  m.f.answers['POST /wt/things'] = { body: {} };
  m.f.answers['DELETE /api/v1/agent/sessions/s1'] = { body: {} };
  m.f.answers['POST /wt/make'] = { body: {} };
  const changes = (): number => m.f.hits.filter((h) => h.method !== 'GET').length;
  // A guarded change A is out on computer C1: its record is on disk, stamped as being sent by this process, fresh, and
  // between two of its own sends (nothing holds it at the wire).
  const got = await holdAttempt('wire.test.mcp-save', { by: 'wire:test' });
  if (!got.ok) throw new Error(got.code);
  const row = (JSON.parse(journalOf(area)) as Array<{ id: string; meta?: object }>).find((r) => r.id.includes('wire.test.mcp-save'))!;
  for (const target of [null, { project: { id: P1 }, computer: { id: C1 } }, { project: { id: P1 }, container: { id: C1 } }]) {
    area.journalSet(CHANGE_STORE_KEY, JSON.stringify([{ ...row, sending: { tab: changeStoreTab(), at: Date.now() }, meta: { ...row.meta, target } }]));
    const before = journalOf(area);
    const sentBefore = changes();
    // The settings-session close (pages/ai/settings/rules/Session.ts io.close: best effort, no record of its own) to
    // that same computer, a Hoody change and a kit change on it: each leaves as a page change under core's own record,
    // never under A's.
    expect(await refusedWith(api(sessionRoutes.delete as Route, { target: T1, realm: 'global', params: { id: 's1' }, query: { hard: true }, recovers: true }))).toBe('SENT');
    expect(await refusedWith(api(hoodyPost, { body: { name: 'b' } }))).toBe('SENT');
    expect(await refusedWith(api(kitPost, { target: T1, body: { name: 'b' } }))).toBe('SENT');
    expect(changes()).toBe(sentBefore + 3);
    // A's record was not taken or changed by any of them.
    expect(journalOf(area)).toBe(before);
  }
  got.hold.release();
});

test('a direct record is its own computer\'s', async () => {
  const f = fakeClient();
  f.answers['GET /computers'] = { body: { data: { computers: [{ id: C1, project_id: P1, server_name: 'srv1', realm_ids: [] }, { id: C2, project_id: P1, server_name: 'srv1', realm_ids: [] }], pagination: { totalPages: 1 } } } };
  f.answers['POST /api/v1/agent/hoody/auth/bootstrap'] = { body: { ok: true } };
  const m = await mount({ f });
  const send = (t: Target) => (bind: object | undefined): Promise<unknown> => api(agentSignInRoutes.bootstrap, { target: t, body: { token: BOOT }, recovers: true, bind });
  expect(await refusedWith(directChange('agent-bootstrap', { project: P1, computer: C2 }, send(T1)))).not.toBe('SENT');
  expect(computerHits(m)).toEqual([]);
  await directChange('agent-bootstrap', { project: P1, computer: C2 }, send(T2));
  expect(computerHits(m).map((h) => new URL(h.url).hostname.includes(C2))).toEqual([true]);
  // Two changes out at once, each with its own record: each leaves under its own, to its own computer; neither takes
  // the other's.
  let release!: () => void;
  const gateOpen = new Promise<void>((r) => { release = r; });
  const realFetch = f.client.fetch.bind(f.client);
  const journals: string[] = [];
  (f.client as { fetch: HoodyClient['fetch'] }).fetch = async (url, init, o) => { if (init.method === 'POST') { journals.push(journalOf(m.area!)); await gateOpen; } return realFetch(url, init, o); };
  const seenRecords: unknown[] = [];
  const policy = m.boot.wire()!.policy;
  const admit = policy.admitLive.bind(policy);
  policy.admitLive = (c) => { if (c.method === 'POST') seenRecords.push(c.record); return admit(c); };
  const both = [directChange('agent-bootstrap', { project: P1, computer: C1 }, send(T1)), directChange('agent-bootstrap', { project: P1, computer: C2 }, send(T2))];
  for (let i = 0; i < 400 && journals.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  expect(journals.length).toBe(2);
  for (const c of [C1, C2]) expect(journals[1]).toContain(`term.direct.agent-bootstrap:${c}`);
  release();
  await Promise.all(both);
  expect(computerHits(m).slice(1).map((h) => (new URL(h.url).hostname.includes(C1) ? C1 : C2)).sort()).toEqual([C1, C2].sort());
  // Each send was admitted under the record of its own computer's hold.
  expect(seenRecords.length).toBe(2);
  expect(new Set(seenRecords.map((r) => (r as { id: string }).id)).size).toBe(2);
  expect((seenRecords[0] as { id: string }).id).toContain(C1);
  expect((seenRecords[1] as { id: string }).id).toContain(C2);
  (f.client as { fetch: HoodyClient['fetch'] }).fetch = realFetch;
  // Row 3 forgets the computers of the realm that was left: a switch clears the table.
  expect(m.boot.wire()!.members.snapshot().length).toBe(2);
  try {
    setRealm('b'.repeat(24));
    expect(m.boot.wire()!.members.snapshot()).toEqual([]);
  } finally { setRealm('all'); }
});

test('a kept boot key is the record of its own revoke', async () => {
  const m = await mount();
  const policy = m.boot.wire()!.policy;
  const call = (id: string) => ({ family: '1' as const, leg: 'hoody' as const, route: termTokenRevokeRoute, method: 'DELETE', url: `${API}/api/v1/auth/tokens/${id}`, body: null, record: { keptBootKey: id } });
  const none = policy.admitLive(call('tokA'));
  expect(none.ok ? 'ADMITTED' : none.code).toBe('NOT_DURABLE');
  m.area!.set(BOOT_KEYS_KEY, JSON.stringify([{ id: 'tokA', alias: bootAliasOf('k3v9q2m7xa'), expires_at: '2027-01-01T00:00:00.000Z', at: 1 }]));
  const other = policy.admitLive(call('tokB'));
  expect(other.ok ? 'ADMITTED' : other.code).toBe('NOT_DURABLE');
  const kept = policy.admitLive(call('tokA'));
  expect(kept.ok).toBe(true);
  if (kept.ok) policy.end(kept.admission);
});

test('a bind is its own call\'s', () => {
  const t = bindTable();
  const R1 = { path: '/a' }, R2 = { path: '/b' };
  // Two revokes out at once: each claims only its own record, under its own token id.
  const a = t.bind(termTokenRevokeRoute, null, 'rec-A', 'tokA');
  const b = t.bind(termTokenRevokeRoute, null, 'rec-B', 'tok B');
  expect(t.claim({ bind: a.key, path: '/auth/tokens/tokB' }, termTokenRevokeRoute, null)).toBeNull();
  expect(t.claim({ bind: b.key, path: '/auth/tokens/tokA' }, termTokenRevokeRoute, null)).toBeNull();
  // (The id as it sits in the path: encoded.)
  expect(t.claim({ bind: b.key, path: '/auth/tokens/tok B' }, termTokenRevokeRoute, null)).toBeNull();
  const ca = t.claim({ bind: a.key, path: '/auth/tokens/tokA' }, termTokenRevokeRoute, null);
  const cb = t.claim({ bind: b.key, path: '/auth/tokens/tok%20B' }, termTokenRevokeRoute, null);
  expect([ca?.record, cb?.record]).toEqual(['rec-A', 'rec-B']);
  // One call at a time: while it is out, a second call with the same key is refused; freed, it may leave again.
  expect(t.claim({ bind: a.key, path: '/auth/tokens/tokA' }, termTokenRevokeRoute, null)).toBeNull();
  ca!.release();
  expect(t.claim({ bind: a.key, path: '/auth/tokens/tokA' }, termTokenRevokeRoute, null)?.record).toBe('rec-A');
  // A bind holds for its own route and computer only; a key nobody bound, or one dropped, holds nothing.
  const d = t.bind(R1, 'c1', 'rec-D');
  expect(t.claim({ bind: d.key, path: '/a' }, R2, 'c1')).toBeNull();
  expect(t.claim({ bind: d.key, path: '/a' }, R1, 'c2')).toBeNull();
  expect(t.claim({ bind: d.key, path: '/a' }, R1, null)).toBeNull();
  expect(t.claim({ bind: Object.freeze({}), path: '/a' }, R1, 'c1')).toBeNull();
  const cd = t.claim({ bind: d.key, path: '/a' }, R1, 'c1');
  expect(cd?.record).toBe('rec-D');
  cd!.wired();
  expect(d.b.wired).toBe(true);
  cd!.release();
  t.delete(d.key);
  expect(t.claim({ bind: d.key, path: '/a' }, R1, 'c1')).toBeNull();
});

test('a page change during an alias write keeps the alias its record', async () => {
  // The alias write is out (its record bound to its own call); a vault PUT of another key from a page goes
  // out meanwhile as a page change, never under the alias's record, which stays held until its own send settles.
  // (A vault PUT is a secret route: with the secret screen shown.)
  const m = await mount({ wiring: { secretReveal: () => true } });
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  m.f.answers['PUT /vault/keys/hoody.realm-aliases'] = { body: { data: { key: 'hoody.realm-aliases' } } };
  m.f.answers['PUT /vault/keys/page.note'] = { body: { data: { key: 'page.note' } } };
  const realRequest = m.f.client.request.bind(m.f.client);
  (m.f.client as { request: HoodyClient['request'] }).request = (method, p, body, o) => (p.startsWith('/vault/keys/hoody.realm-aliases') ? realRequest(method, p, body, o).then((v) => gate.then(() => v)) : realRequest(method, p, body, o));
  const seen: Array<[string, unknown]> = [];
  const policy = m.boot.wire()!.policy;
  const admit = policy.admitLive.bind(policy);
  policy.admitLive = (c) => { if (c.method === 'PUT') seen.push([c.url.slice(c.url.lastIndexOf('/') + 1).split('?')[0]!, c.record]); return admit(c); };
  const held = (): string[] => heldAttempts().filter((h) => h.lock.startsWith('term.direct.')).map((h) => h.lock);
  const out = directChange('realm-alias-write', null, (bind) => api(vaultKeyPutRoute, { params: { key: 'hoody.realm-aliases' }, body: { value: '{}' }, ...(bind ? { bind } : {}) }));
  for (let i = 0; i < 200 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
  expect(held()).toEqual(['term.direct.realm-alias-write']);
  expect(await refusedWith(api(vaultKeyPutRoute, { params: { key: 'page.note' }, body: { value: 'x' } }))).toBe('SENT');
  expect(held()).toEqual(['term.direct.realm-alias-write']);
  release();
  await out;
  policy.admitLive = admit;
  (m.f.client as { request: HoodyClient['request'] }).request = realRequest;
  expect(held()).toEqual([]);
  expect(seen.map((x) => x[0])).toEqual(['hoody.realm-aliases', 'page.note']);
  expect((seen[0]![1] as { id?: string }).id).toMatch(/realm-alias-write/);
  expect(seen[1]![1]).toEqual({ coreHeld: true });
});

test('recovery: only an API answer, and the whole list', async () => {
  const m = await mount();
  const wire = m.boot.wire()!;
  const direct = (): string[] => heldAttempts().filter((h) => h.lock.startsWith('term.direct.')).map((h) => h.lock);
  const settled = async (): Promise<void> => { for (let i = 0; i < 200 && direct().length; i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); } };
  // An alias write left unknown; the read-back answers 502 (a proxy's): that proves nothing, the record stays.
  m.f.answers['GET /vault/keys/hoody.realm-aliases'] = { status: 502 };
  const alias = await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route, null);
  if (!alias.ok) throw new Error(alias.code);
  settleDirectChange(alias.hold, 'unknown', m.timers.now());
  for (let i = 0; i < 20; i++) { await wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(direct()).toEqual(['term.direct.realm-alias-write']);
  expect(m.f.hits.filter((h) => h.url.includes('/vault/keys/')).length).toBeGreaterThan(0);
  // The API's own "no such key" is an answer, but read right after the PUT it proves nothing: that PUT (no map yet, so
  // no If-Match) may still land over a map written after it. Kept until it can no longer land, then freed.
  delete m.f.answers['GET /vault/keys/hoody.realm-aliases'];
  const aliasReads = (): number => m.f.hits.filter((h) => h.method === 'GET' && h.url.includes('/vault/keys/hoody.realm-aliases')).length;
  const read404 = aliasReads();
  for (let i = 0; i < 20; i++) { await wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(aliasReads()).toBeGreaterThan(read404);
  expect(await wire.recover()).toEqual([{ lock: 'term.direct.realm-alias-write', outcome: 'kept', why: 'young' }]);
  expect(direct()).toEqual(['term.direct.realm-alias-write']);
  m.timers.advance(30_000 + BOOT_LAND_MARGIN_MS + 1000);
  await settled();
  expect(direct()).toEqual([]);

  // The key list is ONE answer with every key of the account, as the API sends it (no pages, no count): a mint left
  // unknown whose key is row 140 of 150 is found, revoked under the mint's record, freed.
  const listReads = (): Hit[] => m.f.hits.filter((h) => h.method === 'GET' && h.url.split('?')[0] === `${API}/api/v1/auth/tokens`);
  const whole = (stray: string, name: string): Array<{ id: string; alias: string }> => Array.from({ length: 150 }, (_, i) => (i === 140 ? { id: stray, alias: name } : { id: `t${i}`, alias: 'other' }));
  {
    const op = 'k3v9q2m7xa', name = bootAliasOf(op), stray = `stray-${op}`;
    m.f.answers['GET /auth/tokens'] = { body: { statusCode: 200, message: 'Tokens retrieved', data: whole(stray, name) } };
    // The revoke is not answered by the API at first (a 502 on the way): the token may live, the record stays.
    m.f.answers[`DELETE /auth/tokens/${stray}`] = { status: 502 };
    const mint = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, { op });
    if (!mint.ok) throw new Error(mint.code);
    settleDirectChange(mint.hold, 'unknown', m.timers.now());
    const tries = (): Hit[] => m.f.hits.filter((h) => h.method === 'DELETE' && h.url === `${API}/api/v1/auth/tokens/${stray}`);
    for (let i = 0; i < 200 && tries().length === 0; i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
    expect(tries().length).toBeGreaterThan(0);
    expect(tries()[0]!.journal).toContain('term.direct.boot-token-mint');
    // One read per pass, with no query: the route takes none.
    expect(listReads().length).toBeGreaterThan(0);
    expect(listReads().every((h) => h.url === `${API}/api/v1/auth/tokens`)).toBe(true);
    const before = listReads().length;
    await wire.recover();
    expect(listReads().length - before).toBeLessThanOrEqual(2);
    expect(direct()).toEqual([`term.direct.boot-token-mint:${op}`]);
    // Already gone (404) is as good as revoked.
    m.f.answers[`DELETE /auth/tokens/${stray}`] = { status: 404, code: 'NOT_FOUND' };
    await settled();
    expect(direct()).toEqual([]);
  }
  // Two mints left unknown, both keys in the list: each key is revoked under ITS mint's record, never the other's.
  {
    const ops = ['a1a1a1a1a1', 'b2b2b2b2b2'];
    const policy = wire.policy;
    const admit = policy.admitLive.bind(policy);
    const under: Array<[string, string]> = [];
    policy.admitLive = (c) => { if (c.method === 'DELETE') under.push([c.url.slice(c.url.lastIndexOf('/') + 1), String((c.record as { id?: unknown } | undefined)?.id)]); return admit(c); };
    // (Listed in the other order than the holds were taken.)
    m.f.answers['GET /auth/tokens'] = { body: { statusCode: 200, message: 'Tokens retrieved', data: [{ id: `stray-${ops[1]}`, alias: bootAliasOf(ops[1]!) }, { id: `stray-${ops[0]}`, alias: bootAliasOf(ops[0]!) }] } };
    const ids: Record<string, string> = {};
    // (The first mint's own revoke is not answered at first, so its record is still held, and still the first one
    // held, when the second mint's key is revoked.)
    for (const op of ops) {
      m.f.answers[`DELETE /auth/tokens/stray-${op}`] = op === ops[0] ? { status: 502 } : { body: {} };
      const mint = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, { op });
      if (!mint.ok) throw new Error(mint.code);
      ids[op] = mint.hold.id;
      settleDirectChange(mint.hold, 'unknown', m.timers.now());
    }
    for (let i = 0; i < 200 && direct().length > 1; i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
    expect(direct()).toEqual([`term.direct.boot-token-mint:${ops[0]}`]);
    m.f.answers[`DELETE /auth/tokens/stray-${ops[0]}`] = { body: {} };
    await settled();
    expect(direct()).toEqual([]);
    policy.admitLive = admit;
    for (const op of ops) expect(new Set(under.filter((u) => u[0] === `stray-${op}`).map((u) => u[1]))).toEqual(new Set([ids[op]!]));
  }
  // A list the API cut short (`truncated: true`: more keys than it lists) cannot show that a key is absent, or that
  // the one found is the only one: nothing is revoked on it, nothing is freed, the record stays.
  {
    const op = 'p8w1z5c4rb', name = bootAliasOf(op), stray = `stray-${op}`;
    // (The third list is not cut short but has a row with no id: not whole either. The API's alias is a string, never
    // null (AuthToken.alias allowNull false): a row whose alias is anything else cannot be classified, so it is not
    // whole either, never read as "no such name".)
    const noId = [...whole('none', 'other'), { alias: name }];
    const badAlias = (alias: unknown) => [...whole('none', 'other'), { id: '1'.repeat(24), alias }];
    for (const [data, cut] of [[whole(stray, name), true], [whole('none', 'other'), true], [noId, false], [badAlias(17), false], [badAlias(null), false], [badAlias({ x: name }), false], [[...whole('none', 'other'), { id: '2'.repeat(24) }], false]] as const) {
      m.f.answers['GET /auth/tokens'] = { body: { statusCode: 200, message: 'Tokens retrieved', data, ...(cut ? { truncated: true } : {}) } };
      m.f.answers[`DELETE /auth/tokens/${stray}`] = { status: 404, code: 'NOT_FOUND' };
      const held = direct().length > 0;
      if (!held) {
        const mint = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, { op });
        if (!mint.ok) throw new Error(mint.code);
        settleDirectChange(mint.hold, 'unknown', m.timers.now());
        // Old enough that a WHOLE list without the key would free it.
        m.timers.advance(30_000 + BOOT_LAND_MARGIN_MS + 60_000);
      }
      const before = listReads().length;
      for (let i = 0; i < 40 && listReads().length < before + 3; i++) { await wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
      expect(listReads().length).toBeGreaterThan(before);
      expect(direct()).toEqual([`term.direct.boot-token-mint:${op}`]);
      expect(m.f.hits.filter((h) => h.method === 'DELETE' && h.url.endsWith(stray))).toEqual([]);
    }
    // Whole again (an explicit false is whole too): resolved.
    m.f.answers['GET /auth/tokens'] = { body: { statusCode: 200, message: 'Tokens retrieved', data: whole(stray, name), truncated: false } };
    await settled();
    expect(direct()).toEqual([]);
    expect(m.f.hits.filter((h) => h.method === 'DELETE' && h.url.endsWith(stray)).length).toBe(1);
  }
});

test('an alias write freed by its read-back: the names are read again', async () => {
  const R = 'e'.repeat(24);
  const f = fakeClient();
  const stored = (map: Record<string, string>): void => { f.answers['GET /vault/keys/hoody.realm-aliases'] = { body: { data: { value: JSON.stringify(map) } } }; };
  stored({ [R]: 'Before' });
  const m = await mount({ f, wiring: { secretReveal: () => true } });
  const wire = m.boot.wire()!;
  await reloadRealmAliases();
  expect(aliases()).toEqual({ [R]: 'Before' });
  // A rename whose PUT got no answer: the hold is kept, and the map on the server is no longer the one shown (the
  // PUT landed, or another Hub wrote).
  const alias = await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route, null);
  if (!alias.ok) throw new Error(alias.code);
  settleDirectChange(alias.hold, 'unknown', m.timers.now());
  // (Read once the PUT can no longer land: before that the read-back frees nothing.)
  m.timers.advance(30_000 + BOOT_LAND_MARGIN_MS + 1000);
  stored({ [R]: 'After' });
  const direct = (): number => heldAttempts().filter((h) => h.lock.startsWith('term.direct.')).length;
  for (let i = 0; i < 200 && direct(); i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(direct()).toBe(0);
  // The read-back freed the hold; the names shown are the server's, not the ones from before the write.
  for (let i = 0; i < 200 && aliases()[R] !== 'After'; i++) await new Promise((r) => setTimeout(r, 5));
  expect(aliases()).toEqual({ [R]: 'After' });
  expect(aliasOf(R)).toBe('After');
  // An emptied map empties the names too.
  const again = await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route, null);
  if (!again.ok) throw new Error(again.code);
  settleDirectChange(again.hold, 'unknown', m.timers.now());
  m.timers.advance(30_000 + BOOT_LAND_MARGIN_MS + 1000);
  delete f.answers['GET /vault/keys/hoody.realm-aliases'];
  for (let i = 0; i < 200 && direct(); i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  for (let i = 0; i < 200 && Object.keys(aliases()).length; i++) await new Promise((r) => setTimeout(r, 5));
  expect(aliases()).toEqual({});
  // Without the secret screen nothing is read for it (the id is shown): the hold is still freed by its own read-back.
  const off = await mountAgain(m, { secretReveal: () => false });
  stored({ [R]: 'Unseen' });
  const third = await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route, null);
  if (!third.ok) throw new Error(third.code);
  settleDirectChange(third.hold, 'unknown', off.timers.now());
  off.timers.advance(30_000 + BOOT_LAND_MARGIN_MS + 1000);
  for (let i = 0; i < 200 && direct(); i++) { void off.boot.wire()!.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(direct()).toBe(0);
  await new Promise((r) => setTimeout(r, 30));
  expect(aliases()).toEqual({});
});

test('an alias write: an answered PUT holds nothing; a lost answer is held until the PUT can no longer land', async () => {
  // (A vault PUT is a secret route: with the secret screen shown.)
  const m = await mount({ wiring: { secretReveal: () => true } });
  const wire = m.boot.wire()!;
  const direct = (): string[] => heldAttempts().filter((h) => h.lock.startsWith('term.direct.')).map((h) => h.lock);
  const puts = (): number => m.f.hits.filter((h) => h.method === 'PUT').length;
  const reads = (): number => m.f.hits.filter((h) => h.method === 'GET' && h.url.includes('/vault/keys/hoody.realm-aliases')).length;
  const write = (): Promise<unknown> => directChange('realm-alias-write', null, (bind) => api(vaultKeyPutRoute, { params: { key: 'hoody.realm-aliases' }, body: { value: '{}' }, ...(bind ? { bind } : {}) }));
  const onDisk = (): boolean => journalOf(m.area!).includes('term.direct.realm-alias-write');
  const gone = async (): Promise<void> => { for (let i = 0; i < 200 && onDisk(); i++) await new Promise((r) => setTimeout(r, 5)); };
  const ok = { body: { data: { key: 'hoody.realm-aliases' } } };
  // Answered: its record is freed at once.
  m.f.answers['PUT /vault/keys/hoody.realm-aliases'] = ok;
  expect(await refusedWith(write())).toBe('SENT');
  expect(direct()).toEqual([]);
  await gone();
  expect(onDisk()).toBe(false);
  expect(puts()).toBe(1);
  // No answer (a 504 on the way; no map stored, so the read-back answers 404 at once): held, and a new write is refused
  // unsent while that PUT may still land.
  m.f.answers['PUT /vault/keys/hoody.realm-aliases'] = { status: 504 };
  expect(await refusedWith(write())).not.toBe('SENT');
  expect(puts()).toBe(2);
  const before = reads();
  for (let i = 0; i < 20; i++) { await wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(reads()).toBeGreaterThan(before);
  expect(await wire.recover()).toEqual([{ lock: 'term.direct.realm-alias-write', outcome: 'kept', why: 'young' }]);
  expect(direct()).toEqual(['term.direct.realm-alias-write']);
  m.f.answers['PUT /vault/keys/hoody.realm-aliases'] = ok;
  expect(await refusedWith(write())).toBe('HELD');
  expect(puts()).toBe(2);
  // Once it can no longer land, the same read frees it, and the next write goes out under a new record.
  m.timers.advance(30_000 + BOOT_LAND_MARGIN_MS + 1000);
  for (let i = 0; i < 200 && direct().length; i++) { void wire.recover(); await new Promise((r) => setTimeout(r, 5)); }
  expect(direct()).toEqual([]);
  await gone();
  expect(await refusedWith(write())).toBe('SENT');
  expect(puts()).toBe(3);
});

test('producer: the token is held, and a forget beats a late mint', async () => {
  const m = await mount();
  const producer = m.boot.wire()!.producer;
  const MINTED = 'hdy_MINTcanary0123456789abcdefXYZ', LATE = 'hdy_LATEcanary0123456789abcdefXYZ';
  m.f.answers['GET /auth/tokens/templates'] = { body: { data: [{ name: 'full_access', permissions: { resources: {} } }] } };
  m.f.answers['GET /wt/info'] = { body: {} };
  const exp = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const a = await producer.ensure(UID, { mint: async () => ({ data: { token: MINTED, id: 'tokA', expires_at: exp } }) });
  expect(a.token).toBe(MINTED);
  // While it is in memory no URL may carry it.
  expect(await refusedWith(api(kitRead, { target: T1, query: { q: MINTED } }))).not.toBe('SENT');
  expect(computerHits(m)).toEqual([]);
  producer.forget();
  await api(kitRead, { target: T1, query: { q: MINTED } });
  expect(computerHits(m).length).toBe(1);
  // A forget while a mint is out: its answer is dropped, not kept in memory and not handed out.
  let entered = false, release!: () => void;
  const gateOpen = new Promise<void>((r) => { release = r; });
  const p = producer.ensure(UID, { mint: async () => { entered = true; await gateOpen; return { data: { token: LATE, id: 'tokB', expires_at: exp } }; } }).then((v) => v, (e: unknown) => e as { token: string });
  for (let i = 0; i < 400 && !entered; i++) await new Promise((r) => setTimeout(r, 5));
  expect(entered).toBe(true);
  producer.forget();
  // A caller that asks before the old mint has answered may be handed that mint's answer: it is dropped with it.
  const rider = producer.ensure(UID).then((v) => v, (e: unknown) => e as { token: string });
  release();
  expect((await p).token).toBe('');
  expect((await rider).token).toBe('');
  await new Promise((r) => setTimeout(r, 10));
  expect((await producer.ensure(UID).then((v) => v, (e: unknown) => e as { token: string })).token).toBe('');
  await api(kitRead, { target: T1, query: { q: LATE } });
  expect(computerHits(m).length).toBe(2);
  // The producer hands its mint record to its own call (a bind), dropped once that call is over: the same key on a
  // later call holds nothing.
  {
    let seen: unknown;
    const e = await producer.ensure(UID, { mint: async (_m, _p, _b, o) => { seen = (o as { bind?: unknown } | null)?.bind; return { data: { token: MINTED, id: 'tokE', expires_at: exp } }; } });
    expect(e.token).toBe(MINTED);
    expect(typeof seen).toBe('object');
    producer.forget();
    const body = { alias: bootAliasOf('c3c3c3c3c3'), permissions: {}, vault_access: true, event_access: true, allow_no_realm: true, expires_at: exp };
    const posts = m.f.hits.filter((h) => h.method === 'POST').length;
    expect(await refusedWith(api(tokenMintRoute as Route, { body, bind: seen as object }))).not.toBe('SENT');
    expect(m.f.hits.filter((h) => h.method === 'POST').length).toBe(posts);
  }
  // A forget while a CACHED token's answer is on its way back: the pending call is dropped too, and
  // the token is not held as the policy's boot token again.
  {
    const c = await producer.ensure(UID, { mint: async () => ({ data: { token: MINTED, id: 'tokD', expires_at: exp } }) });
    expect(c.token).toBe(MINTED);
    const pending = producer.ensure(UID).then((v) => v, (e: unknown) => e as { token: string });
    producer.forget();
    expect((await pending).token).toBe('');
    const hits = computerHits(m).length;
    await api(kitRead, { target: T1, query: { q: MINTED } });
    expect(computerHits(m).length).toBe(hits + 1);
  }
  // The account ends: the token leaves memory with it.
  const b = await producer.ensure(UID, { mint: async () => ({ data: { token: MINTED, id: 'tokC', expires_at: exp } }) });
  expect(b.token).toBe(MINTED);
  clearAuthTokens();
  expect((await producer.ensure(UID).then((v) => v, (e: unknown) => e as { token: string })).token).toBe('');
});

test('web-only send sites are inert', async () => {
  const m = await mount();
  const before = m.f.hits.length;
  const realFetch = globalThis.fetch;
  let raw = 0;
  (globalThis as { fetch: unknown }).fetch = () => { raw++; return Promise.reject(new Error('raw fetch in a terminal')); };
  try {
    // core/boot-token.ts load(): the terminal's producer is there, so no script tag is built (a read of `document`
    // would fail this test: the strict globals record it). The ask reaches the producer, which answers no token
    // without a press; 'UNAVAILABLE' would mean the script path was taken.
    const code = await agentBootToken(capture()).then(() => 'TOKEN', (e: unknown) => codeOf(e));
    expect(code).toBe('BOOT_TOKEN_FAILED');
    // shell/staleChunk.ts: a failed page load that looks like a missing bundle file. Its check stops at its first
    // read of the page (`navigator`, then `document`: a terminal has neither) and asks for no file over the network.
    const gone = new TypeError('Failed to fetch dynamically imported module: https://hub.example.invalid/assets/page-abc.js');
    expect(isChunkLoadError(gone)).toBe(true);
    expectTraps('navigator', 'document');
    const ended = await chunkLoadFailed(gone).then(() => 'shown', () => 'stopped');
    expect(ended).toBe('stopped');
    expect(raw).toBe(0);
    expect(m.f.hits.length).toBe(before);
  } finally { (globalThis as { fetch: unknown }).fetch = realFetch; }
});

test('read-only: a refused change leaves nothing behind', async () => {
  // The first Hub holds the store and has a change out (its row is on disk, stamped as sending).
  const first = openStore();
  const row = JSON.stringify([{ id: 'attempt\u0002wire.test.kept\u0000inc1', sending: { tab: 'first-hub', at: 1_000_000 } }]);
  first.journalSet(CHANGE_STORE_KEY, row);
  const second = openStore();
  const ro = await mount({ area: second });
  expect(ro.boot.wire()!.storeMode()).toBe('ro');
  // Core's own claim is refused first: a read-only Hub cannot write the record, so no hold exists, in memory or on disk.
  const got = await holdAttempt('wire.test.ro', { by: 'wire:test' });
  expect(got.ok ? 'HELD' : got.code).toBe('NOT_DURABLE');
  expect(heldAttempts().filter((h) => h.lock === 'wire.test.ro')).toEqual([]);
  // A send that reaches the transport anyway (core's upgrade paths read the first Hub's kept row back) leaves nothing
  // either: refused unsent as read-only, whatever row is on disk, and the first Hub's row is as it was.
  expect(await refusedWith(api(hoodyPost, { body: { name: 'a' } }))).toBe('TERM_READ_ONLY');
  expect(ro.f.hits.filter((h) => h.method !== 'GET')).toEqual([]);
  expect(heldAttempts().filter((h) => h.lock === 'wire.test.ro')).toEqual([]);
  expect(first.journalGet(CHANGE_STORE_KEY)).toBe(row);
  first.close();
});

test('realm names without the secret screen: the id is shown', async () => {
  const R = 'b'.repeat(24);
  const f = fakeClient();
  f.answers['GET /vault/keys/hoody.realm-aliases'] = { body: { data: { value: JSON.stringify({ [R]: 'Work' }) } } };
  const m = await mount({ f });
  // The alias read is a vault read: refused unsent while no secret-safe screen exists (row 7).
  const read = await readRealmAliases().then(() => 'READ', (e: unknown) => String((e as { kind?: unknown }).kind));
  expect(read).toBe('not_sent');
  expect(m.f.hits.filter((h) => h.url.includes('/vault/'))).toEqual([]);
  // A realm then shows by its short id: not an error, not an empty name.
  expect(aliasOf(R)).toBeNull();
  expect(displayName(R)).toEqual({ kind: 'short', text: shortId(R) });
  expect(shortId(R).length).toBeGreaterThan(0);
  // With the screen there, the same read goes out: once at boot (an account session loads its realm names),
  // and once more for the call.
  const shown = await mountAgain(m, { secretReveal: () => true });
  const vault = () => shown.f.hits.filter((h) => h.url.includes('/vault/')).length;
  expect(vault()).toBe(1);
  await readRealmAliases();
  expect(vault()).toBe(2);
});

test('passcode set by the other Hub: this one locks', async () => {
  // This Hub opens second (read-only, the store is the first Hub's) while no passcode exists; the first then sets one.
  resetAppLock();
  const first = openStore();
  const second = openStore();
  expect(second.readOnly).toBe('busy');
  let host: TermLockHost | null = null;
  const m = await mount({ area: second, wiring: { lockState: () => (host ? host.state() : 'live') } });
  const wire = m.boot.wire()!;
  let tick: () => void = () => {};
  const clock = { mono: 0 };
  const lock = installTermLock({
    area: second, uid: () => UID, sessionOk: () => true, locks: createMemoryLocks().locks,
    bump: () => { wire.policy.bump(); }, wipe: () => {}, leave: () => {},
    every: (fn, ms) => { expect(ms).toBe(IDLE_TICK_MS); tick = fn; return () => { tick = () => {}; }; },
    now: () => m.timers.now(), mono: () => clock.mono,
  });
  host = lock;
  try {
    expect(lock.startLocked).toBe(false);
    m.f.answers['GET /wt/things'] = { body: {} };
    m.f.answers['GET /wt/info'] = { body: {} };
    await api(hoodyRead, {});
    const before = m.f.hits.length;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
    const rec: LockRecord = { v: 1, kdf: 'pbkdf2-sha256', iter: ITER_DEFAULT, salt: b64(salt), hash: b64(await deriveVerifier('482913', salt, ITER_DEFAULT)), rev: 'AAAAAAAAAAA=', digits: true, idleMin: 1, onLeave: false, tries: { n: 0, until: 0, pending: null, out: false } };
    first.set(LOCK_PREFIX + UID, JSON.stringify(rec));
    // Idle past the record's minutes: the next check re-reads the store, finds the passcode and locks.
    clock.mono = 61_000;
    tick();
    expect(lock.state()).toBe('locked');
    // Locked: nothing leaves on either leg, and the unlock belongs to the Hub that holds the store.
    expect(await refusedWith(api(hoodyRead, {}))).not.toBe('SENT');
    expect(await refusedWith(api(kitRead, { target: T1 }))).not.toBe('SENT');
    expect(m.f.hits.length).toBe(before);
    expect(await lock.tryUnlock('482913')).toEqual({ k: 'refused', why: 'other-hub' });
  } finally { lock.stop(); resetAppLock(); first.close(); }
});

test('the pin is an id or null', () => {
  const R = 'b'.repeat(24);
  expect(selectionOf('all', 'all')).toEqual({ realm: null, pin: null });
  expect(selectionOf(R, R)).toEqual({ realm: R, pin: R });
  expect(selectionOf(R, null)).toEqual({ realm: R, pin: null });
  for (const bad of ['all', 'global', '', R.toUpperCase(), R + 'a', undefined, 7]) expect(selectionOf('all', bad).pin, String(bad)).toBeNull();
});

test('producer installed', async () => {
  const g = globalThis as { HubBootToken?: { ensure?: unknown } };
  expect(g.HubBootToken).toBeUndefined();
  const m = await mount();
  expect(typeof g.HubBootToken?.ensure).toBe('function');
  expect(g.HubBootToken).toBe(m.boot.wire()!.producer as never);
  expect(liveGateInstalled()).toBe(true);
  // With no press there is no mint: the producer answers no token and sends nothing.
  const before = m.f.hits.length;
  const a = await m.boot.wire()!.producer.ensure(UID).then((v) => v, (e: unknown) => e as { token?: unknown });
  expect(a.token).toBe('');
  expect(m.f.hits.length).toBe(before);
  await m.boot.dispose('term-abort');
  boots.pop();
  expect(g.HubBootToken).toBeUndefined();
  expect(liveGateInstalled()).toBe(false);
});

test('a POST read leaves as a read: no store, a read-only store', async () => {
  const resolve = (await import('../../pages/scripts/routes')).routes.resolve;
  for (const which of ['none', 'ro'] as const) {
    // A store already open in another Hub makes the next one read-only.
    const first = which === 'ro' ? openStore() : null;
    const m = await mount({ area: which === 'none' ? null : openStore() });
    if (which === 'ro') expect(m.boot.wire()!.storeMode()).toBe('ro');
    m.f.answers['POST /api/v1/exec/route/resolve'] = { body: { data: { owner: null } } };
    expect(await refusedWith(api(resolve, { target: T1, index: 1, body: { path: '/x' } }))).toBe('SENT');
    expect(m.f.hits.filter((h) => h.method === 'POST' && h.url.includes('/exec/route/resolve')).length).toBe(1);
    // A real change on the same leg is refused before it is entered (kit asks the gate early): not sent, never pending.
    const refusal = await api(kitPost, { target: T1, body: { name: 'a' } }).then(() => null, (e: unknown) => e as { kind?: unknown; code?: unknown; notSent?: unknown });
    expect(refusal).toMatchObject({ kind: 'not_sent', notSent: true, code: which === 'ro' ? 'TERM_READ_ONLY' : 'NOT_DURABLE' });
    expect(m.f.hits.filter((h) => h.url.includes('/wt/make'))).toEqual([]);
    expect(m.bypasses).toEqual([]);
    first?.close();
    for (const b of boots.splice(0)) await b.dispose('term-abort').catch(() => {});
    for (const s of sessions.splice(0)) s.end();
  }
});

// In a live mount the write-ahead records of the scripts writer (a build, a draft) and of the AI
// journal (every chat request) were refused at the storage seam, so no build started and no chat message left.
test('write-ahead records: the scripts writer and the AI journal are kept on disk before a send; money stays closed', async () => {
  resetStoresForTests();
  const m = await mount();
  const acct = String(capture().account);
  const reopened = (key: string): string | null => { const again = openHubStore(dir, { home, tryLock: flock }); try { return again.journalGet(key); } finally { again.close(); } };
  // A New script draft and its build's ask (core/script-asks.ts): stored, read back, and in the account store's journal.
  const draft: DraftRecord = { draftId: 'abcdefghi1', mode: 'ai', project: 'p1', compId: 'c1', realm: 'global', owner: 'no-writer', exec: 1, current: 0, retained: null, state: 'open', deploy: null, updatedAt: 5 };
  const ask: ScriptAsk = { askId: 'a1', compId: 'c1', path: 'drafts/abcdefghi1/1.js', realm: 'global', owner: 'no-writer', sessionId: null, turnId: null, phase: 'create', sentAt: 6, createKey: 'ck-1', turnKey: 'tk-1' };
  expect(await putDraftRecord(draft, null)).toBe('ok');
  expect(await putScriptAsk(ask, null)).toBe('ok');
  expect(readDraftRecords()).toEqual([draft]);
  expect(readScriptAsks()).toEqual([ask]);
  expect(JSON.parse(reopened('hub.v3.script-asks')!)).toEqual({ v: 2, accounts: { [acct]: [ask] }, drafts: { [acct]: [draft] } });
  // The AI journal's door (ask/journal/entries.ts put): one entry per request, on disk when put() answers.
  const K1 = 'hx-' + 'a'.repeat(32), K2 = 'hx-' + 'b'.repeat(32);
  const entry: Entry = { k: K2, kind: 'turn', h: 'ash.1a2b', r: 'global', s: 'ses_1', c: K1, ct: 'c1', at: 7 };
  const entries = new Entries();
  expect(entries.put(entry, acct)).toBe('ok');
  expect(entries.put(entry, acct)).toBe('exists');
  expect(entries.scan()).toMatchObject({ s: 'ok', acct, entries: [entry] });
  expect(JSON.parse(reopened('hub_ai_req_v1')!)).toEqual({ v: 1, a: { [acct]: { ['ash.1a2b:' + K2]: entry } } });
  expect(new Leases().set('ash.1a2b', 'ses_1', 'lease-1')).toBe(true);
  expect(JSON.parse(reopened('hub_ai_lease_v1')!)).toEqual({ v: 1, a: { [acct]: { 'ash.1a2b:ses_1': 'lease-1' } } });
  const rec = { p: 'p1', c: 'c1', r: 'global', s: 'ses_1', t: null, k1: K1, k2: K2, rc: 'custom', n: null, at: 7, i: null, q: 0, ph: 'sending', l: 'en', h: 'ash.1a2b' };
  const recs = partitioned('hub_ai_journal_v1', { scope: 'account' });
  expect(recs.update(() => ({ set: { 'ash.1a2b|global|ses_1': rec } }), { keepOthers: true })).toBe('ok');
  expect(recs.readTri()).toEqual({ s: 'ok', v: { 'ash.1a2b|global|ses_1': rec }, acct });
  expect(reopened('hub_ai_journal_v1')).toContain('ash.1a2b|global|ses_1');
  // Never the words of a message: an entry or a record that carries any is not kept, and the store stays as it was.
  expect(recs.update(() => ({ set: { 'ash.1a2b|global|ses_1': { ...rec, title: 'hello' } } }), { keepOthers: true })).toBe('failed');
  expect(recs.readTri()).toEqual({ s: 'ok', v: { 'ash.1a2b|global|ses_1': rec }, acct });
  // Money stays closed at the seam (its sends never leave this build): nothing is kept, so core refuses before sending.
  const pending = JSON.stringify([{ kind: 'pay', user_id: acct, key: 'key-1', max_charge_cents: 0, at: 1, sub_id: 'sub_1' }]);
  for (const key of ['hub_money_pending', 'hub.v3.topup_pending', 'hub.v3.rent_pending', 'hub_market_pending', 'hub_money_upgrade']) {
    expect(() => { localStore().setItem(key, pending); }, key).toThrow('NOT_DURABLE');
    expect(m.area!.journalGet(key), key).toBeNull();
  }
});

test('write-ahead records: no store, or a store another Hub holds, keeps none (the send is refused, as before)', async () => {
  resetStoresForTests();
  const acctOf = (): string => String(capture().account);
  const draft: DraftRecord = { draftId: 'abcdefghi2', mode: 'ai', project: 'p1', compId: 'c1', realm: 'global', owner: 'no-writer', exec: 1, current: 0, retained: null, state: 'open', deploy: null, updatedAt: 5 };
  const entry: Entry = { k: 'hx-' + 'b'.repeat(32), kind: 'create', h: 'ash.1a2b', r: 'global', s: null, c: 'hx-' + 'b'.repeat(32), ct: 'c1', at: 7 };
  const none = await mount({ area: null });
  expect(await putDraftRecord(draft, null)).toBe('refused');
  expect(new Entries().put(entry, acctOf())).toBe('failed');
  expect(readDraftRecords()).toEqual([]);
  await none.boot.dispose('term-abort');
  boots.splice(boots.indexOf(none.boot), 1);
  sessions.pop()!.end();
  resetStoresForTests();
  const first = openStore();
  const second = openStore();
  expect(second.readOnly).toBe('busy');
  await mount({ area: second });
  expect(await putDraftRecord(draft, null)).toBe('refused');
  expect(new Entries().put(entry, acctOf())).toBe('failed');
  expect(first.journalGet('hub.v3.script-asks')).toBeNull();
  expect(first.journalGet('hub_ai_req_v1')).toBeNull();
  first.close();
});


// What the journal's own writers store is kept as they store it (a check that wanted the
// dock validator's normal form refused these, and the chat's first message could then never be sent again).
test('write-ahead records: the chat record writers (a first-message claim, a fenced turn) are kept as they write', async () => {
  resetStoresForTests();
  const m = await mount();
  const acct = String(capture().account);
  const H = 'ash.1a2b', K1 = 'hx-' + 'a'.repeat(32), K2 = 'hx-' + 'b'.repeat(32), ID = `${H}|global|ses_1`;
  const rec = { p: 'p1', c: 'c1', r: 'global', s: 'ses_1', t: null, k1: K1, k2: K2, rc: 'custom', n: null, at: 7, i: null, q: 0, ph: 'opening', l: 'en', h: H };
  const recs = partitioned('hub_ai_journal_v1', { scope: 'account' });
  const stored = (): Record<string, unknown> => ((JSON.parse(m.area!.journalGet('hub_ai_journal_v1')!) as { a: Record<string, Record<string, Record<string, unknown>>> }).a[acct]![ID]!);
  const records = new Records(() => [], () => new Set<string>(), () => []);
  // Send (again) on a first-message row: claimFirst with the record's own key and no dismissed key stores `dk: []`.
  expect(recs.update(() => ({ set: { [ID]: rec } }), { keepOthers: true })).toBe('ok');
  expect(await records.claimFirst(H, 'global', 'ses_1', K1, K2)).toBe('ok');
  expect(stored()).toEqual({ ...rec, dk: [], ph: 'sending' });
  // A fenced turn whose key is already dismissed but not proven unsent: the key is stored in dk a second time.
  expect(recs.update(() => ({ set: { [ID]: { ...rec, dk: [K2] } } }), { keepOthers: true })).toBe('ok');
  expect(await records.turnFenced(H, 'global', 'ses_1', K1, K2)).not.toBeNull();
  expect(stored()).toEqual({ ...rec, dk: [K2, K2], na: [K2] });
  // The person dismisses a first message owed elsewhere (claimFirst with no key), then the turn is known.
  expect(await records.claimFirst(H, 'global', 'ses_1', K1, null)).toBe('ok');
  expect(await records.turnKept(H, 'global', 'ses_1', K1, K2, 'turn_1')).not.toBeNull();
  expect(stored()).toMatchObject({ t: 'turn_1', ph: 'working' });
});

test('write-ahead records: a spoken message whose fate is unknown is kept, and leaves the disk when the account ends', async () => {
  resetStoresForTests();
  const m = await mount();
  const acct = String(capture().account);
  const voice = partitioned('hub_voice_pending_v1', { scope: 'account+computer', area: 'local', purge: true });
  const entry = { v: 1, rows: [{ realm: 'global', bot: 'bot_1', conn: 'conn-01', utt: 3, at: 7 }] };
  expect(voice.update(() => ({ set: entry }), { part: 'c1' })).toBe('ok');
  expect(JSON.parse(m.area!.journalGet('hub_voice_pending_v1')!)).toEqual({ v: 1, a: { [acct]: { c1: entry } } });
  expect(voice.update(() => ({ set: { v: 1, rows: [{ ...entry.rows[0], text: 'hello' }] } }), { part: 'c1' })).toBe('failed');
  expect(new Entries().put({ k: 'hx-' + 'b'.repeat(32), kind: 'create', h: 'ash.1a2b', r: 'global', s: null, c: 'hx-' + 'b'.repeat(32), ct: 'c1', at: 7 }, acct)).toBe('ok');
  // Sign-out (any purge): the key the web purges goes from the disk too; the journal of requests stays, as on the web.
  clearAuthTokens();
  expect(m.area!.journalGet('hub_voice_pending_v1')).toBeNull();
  expect(m.area!.journalGet('hub_ai_req_v1')).not.toBeNull();
});

// A computer may be named like a key; its handle is that name. The web keeps its records, and so does the terminal
// (an earlier credential scan read the handle and no chat could be sent to that computer).
test('write-ahead records: a computer named like a key keeps its chat records; a key anywhere else is still refused', async () => {
  resetStoresForTests();
  const m = await mount();
  const acct = String(capture().account);
  const K = 'hx-' + 'c'.repeat(32);
  for (const h of ['sk-integration-tests.1a2b', 'hdy_staging01.9f3c']) {
    const e: Entry = { k: K, kind: 'create', h, r: 'global', s: null, c: K, ct: 'c1', at: 7 };
    expect(new Entries().put(e, acct), h).toBe('ok');
    expect(new Leases().set(h, 'ses_1', 'lease-1'), h).toBe(true);
    expect(new Entries().put({ ...e, k: 'hx-' + 'd'.repeat(32), g: 'hdy_' + 'a'.repeat(40) }, acct), h).not.toBe('ok');
  }
  expect(m.area!.journalGet('hub_ai_req_v1')).toContain('sk-integration-tests.1a2b:' + K);
  expect(m.area!.journalGet('hub_ai_req_v1')).not.toContain('hdy_' + 'a'.repeat(40));
});

// core/script-asks.ts never writes over a value it cannot read (a newer layout, a damaged one): its reads answer 'unreadable'
// and its writes refuse. The seam must say "unreadable", never "nothing stored", or the next write would replace the
// unsettled asks of every account with one row.
test('write-ahead records: a stored scripts value of a newer layout is never written over', async () => {
  resetStoresForTests();
  const m = await mount();
  const acct = String(capture().account);
  const newer = JSON.stringify({ v: 3, accounts: { [acct]: [{ later: true }] }, drafts: {} });
  m.area!.journalSet('hub.v3.script-asks', newer);
  const draft: DraftRecord = { draftId: 'abcdefghi1', mode: 'ai', project: 'p1', compId: 'c1', realm: 'global', owner: 'no-writer', exec: 1, current: 0, retained: null, state: 'open', deploy: null, updatedAt: 5 };
  const ask: ScriptAsk = { askId: 'a1', compId: 'c1', path: 'drafts/abcdefghi1/1.js', realm: 'global', owner: 'no-writer', sessionId: null, turnId: null, phase: 'create', sentAt: 6, createKey: 'ck-1', turnKey: 'tk-1' };
  expect(await putScriptAsk(ask, null)).not.toBe('ok');
  expect(await putDraftRecord(draft, null)).not.toBe('ok');
  expect(m.area!.journalGet('hub.v3.script-asks')).toBe(newer);
  expect(readScriptAsks()).toBe('unreadable');
});

// A held boot-token mint record is the only trace of a token that may exist (its recovery revokes it by name). The live
// wiring names its lock to core (core/attempts.ts setKeptAttemptLocks), so the sign-out warning and the wipe's confirm
// never offer it as a change to forget, while the pages and the producer still see it; the mount's end takes it back.
test('a held boot-token mint is never offered to the sign-out or the wipe as a change to forget', async () => {
  const m = await mount();
  const mint = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, { op: 'p4s8d2f6g1' });
  if (!mint.ok) throw new Error(mint.code);
  settleDirectChange(mint.hold, 'unknown', m.timers.now());
  const other = await holdAttempt('wire.test.kept', { by: 'wire:test' });
  if (!other.ok) throw new Error(other.code);
  other.hold.sent();
  expect(heldAttempts().map((h) => h.id).sort()).toEqual([mint.hold.id, other.hold.id].sort());
  expect(signOutHolds().map((h) => h.id)).toEqual([other.hold.id]);
  expect(localWipeWarning()?.holds.map((h) => h.ref.id)).toEqual([other.hold.id]);
  const rec = (JSON.parse(m.area!.journalGet(CHANGE_STORE_KEY) ?? '[]') as StoredChange[]).find((r) => r.id === mint.hold.id);
  expect(rec && attemptKept(rec)).toBe(true);
  await m.boot.dispose('term-abort');
  boots.splice(boots.indexOf(m.boot), 1);
  expect(rec && attemptKept(rec)).toBe(false);
});
