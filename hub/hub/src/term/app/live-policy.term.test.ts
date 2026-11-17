// The live mount's send policy, alone (live-policy.ts).
// Every admission row, then forgery, reuse and retry at the transport.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { defineRoute, type Route } from '../../core/routes';
import { LEFT_OUT_KITS, LivePolicy, canonicalJson, type CallTarget, type PolicyCall, type PolicyDeps } from './live-policy';
import { TILE_PROGRAMS } from '../../pages/board/embed/catalog';
import { MembershipTable, membershipCallOf, type MemberSelection } from './live-membership';
import type { WireAttempt } from '../host-types';

const ACCOUNT = '64f0ada00000000000000001';
const R1 = '1'.repeat(24), R2 = '2'.repeat(24);
const P1 = 'a'.repeat(24), C1 = 'c'.repeat(24), C2 = 'd'.repeat(24);
const API = 'https://api.example.invalid';
const RD = 'realms.example.invalid';
const PD = 'computers.example.invalid';
const places = { apiOrigin: API, realmApiDomain: RD, proxyDomain: PD };
const sha = (v: string): string => createHash('sha256').update(v).digest('hex');

const routes = {
  projects: defineRoute({ method: 'GET', path: '/projects', scope: 'realm', query: ['page'] }),
  project: defineRoute({ method: 'GET', path: '/projects/:id', scope: 'realm' }),
  create: defineRoute({ method: 'POST', path: '/projects', scope: 'realm', body: ['name'] }),
  wallet: defineRoute({ method: 'GET', path: '/wallet', scope: 'base' }),
  tokenMe: defineRoute({ method: 'GET', path: '/auth/tokens/me', scope: 'base' }),
  backup: defineRoute({ method: 'GET', path: '/users/me/backup-codes', scope: 'base', secret: true }),
  mint: defineRoute({ method: 'POST', path: '/auth/tokens', scope: 'base', body: ['alias'], secret: true }),
  run: defineRoute({ method: 'POST', path: '/', scope: 'kit', kit: 'exec', index: 1, run: true }),
  notes: defineRoute({ method: 'GET', path: '/notes', scope: 'kit', kit: 'notes', index: 1 }),
  browser: defineRoute({ method: 'GET', path: '/api/v1/browser/start', scope: 'kit', kit: 'browser', index: 1 }),
  bots: defineRoute({ method: 'GET', path: '/bots', scope: 'agent' }),
  pipe: defineRoute({ method: 'POST', path: '/p', scope: 'kit', kit: 'pipe', index: 1, upload: true }),
  pipeKeyed: defineRoute({ method: 'POST', path: '/p', scope: 'kit', kit: 'pipe', index: 1, upload: true, senderKey: true }),
  botPut: defineRoute({ method: 'PUT', path: '/bots/:id', scope: 'agent', body: ['name'], idem: 'Idempotency-Key', tickets: { lease: 'optional' } }),
  botPost: defineRoute({ method: 'POST', path: '/bots', scope: 'agent', body: ['name'] }),
  skills: defineRoute({ method: 'GET', path: '/skills', scope: 'agent', realm: 'realm', cwd: true }),
  botGet: defineRoute({ method: 'GET', path: '/bots/:id', scope: 'agent', realm: 'bot' }),
  optional: defineRoute({ method: 'GET', path: '/catalog', scope: 'agent', realm: 'opt' }),
  display: defineRoute({ method: 'GET', path: '/api/v1/x', scope: 'kit', kit: 'display', index: 1 }),
  code: defineRoute({ method: 'GET', path: '/api/v1/extensions', scope: 'kit', kit: 'code', index: 1 }),
  termSessions: defineRoute({ method: 'GET', path: '/api/v1/terminal/sessions', scope: 'kit', kit: 'terminal', index: 0 }),
  bootstrap: defineRoute<unknown, { token: string }>({ method: 'POST', path: '/hoody/auth/bootstrap', scope: 'agent', realm: 'none', body: ['token'] }),
};

const T1: CallTarget = { project: P1, computer: C1, server: 'node-1' };
const originOf = (leg: 'kit' | 'agent', t: CallTarget, route: Route, index: number | undefined): string =>
  `https://${t.project}-${t.computer}-${leg === 'agent' ? 'agent' : String(route.kit)}-${leg === 'agent' ? 1 : index ?? 1}.${t.server}.${PD}`;
const AGENT = `${originOf('agent', T1, routes.bots, 1)}/api/v1/agent`;
const NOTES = `${originOf('kit', T1, routes.notes, 1)}`;

/** A routing table written by hand (core's own rules are tested against it separately). */
const fakeRoute = (token: { pin: string | null } | null) => (m: string, path: string, _b: unknown, scope: 'base' | 'realm', realm: string, baseOnly: boolean): { base: string } | { refused: string } => {
  const baseOnlyPath = /^\/(?:wallet|users|auth\/tokens)(?:\/|$)/.test(path);
  if (token) {
    if (m === 'GET' && path === '/users/auth/me') return { base: token.pin ? `https://${token.pin}.${RD}/api/v1` : '/api/v1' };
    if (baseOnlyPath) return { refused: 'TOKEN_SESSION_REFUSED' };
    return { base: token.pin ? `https://${token.pin}.${RD}/api/v1` : '/api/v1' };
  }
  if (baseOnly || baseOnlyPath || scope === 'base' || realm === 'all') return { base: '/api/v1' };
  return { base: `https://${realm}.${RD}/api/v1` };
};

interface World {
  policy: LivePolicy;
  table: MembershipTable;
  bypasses: string[];
  set: { state: 'live' | 'locked' | 'stale'; sid: string; generation: number; store: 'none' | 'ro' | 'rw'; reveal: boolean; realm: string; token: boolean; kept: Set<unknown> };
}
function world(o: { token?: { pin: string | null }; route?: PolicyDeps['hoodyRoute']; origin?: PolicyDeps['computerOrigin']; proxyDomain?: string | null; sel?: MemberSelection; places?: Partial<PolicyDeps['places']> } = {}): World {
  const set: World['set'] = { state: 'live', sid: 's-1', generation: 1, store: 'rw', reveal: false, realm: R1, token: !!o.token, kept: new Set() };
  const bypasses: string[] = [];
  let policy: LivePolicy | null = null;
  const table = new MembershipTable(ACCOUNT, () => policy?.bump());
  policy = new LivePolicy({
    places: { ...places, proxyDomain: o.proxyDomain === undefined ? PD : o.proxyDomain, ...o.places },
    state: () => set.state,
    session: () => ({ sid: set.sid, generation: set.generation }),
    account: () => ACCOUNT,
    hoodyRoute: o.route ?? fakeRoute(o.token ?? null),
    realm: () => set.realm,
    tokenSession: () => set.token,
    introspection: routes.tokenMe,
    bootstrap: routes.bootstrap,
    unshownSecrets: new Set([routes.mint]),
    members: table,
    selection: () => o.sel ?? { realm: R1, pin: null },
    routingAllows: () => true,
    computerOrigin: o.origin ?? originOf,
    storeMode: () => set.store,
    recordKept: (r) => set.kept.has(r),
    secretReveal: () => set.reveal,
    onBypass: (c) => { bypasses.push(c); },
  });
  return { policy, table, bypasses, set };
}
/** The session's own computer list answered, naming C1 on node-1 in R1. */
function member(w: World, server = 'node-1'): void {
  const c = membershipCallOf('GET', `https://${R1}.${RD}/api/v1/computers`, places)!;
  w.table.answer(c, w.table.begin(), true, { data: { computers: [{ id: C1, project_id: P1, server_name: server, realm_ids: [R1] }] } });
}

const read = (url = `https://${R1}.${RD}/api/v1/projects?page=2`): PolicyCall => ({ family: '1', leg: 'hoody', route: routes.projects, method: 'GET', url, body: null });
const att = (method: string, url: string, body: string | null = null, extra: Partial<WireAttempt> = {}): WireAttempt => ({ method, url, bodyDigest: body === null ? null : sha(body), ...extra });
function admit(w: World, call: PolicyCall): object {
  const a = w.policy.admitLive(call);
  if (!('admission' in a)) throw new Error('refused: ' + a.code);
  return a.admission;
}
const code = (r: ReturnType<LivePolicy['admitLive']> | ReturnType<LivePolicy['refuseEarly']>): string => (r && 'code' in r ? r.code : 'ok');

describe('row 1: live, unlocked, the captured session', () => {
  test('locked and stale mounts refuse before anything else; a disposed policy refuses', () => {
    const w = world();
    w.set.state = 'locked';
    expect(code(w.policy.admitLive(read()))).toBe('TERM_LOCKED');
    expect(code(w.policy.refuseEarly(routes.create, '0a'))).toBe('TERM_LOCKED');
    w.set.state = 'stale';
    const r = w.policy.admitLive(read());
    expect(r).toMatchObject({ ok: false, notSent: true, kind: 'stale', code: 'TERM_STALE' });
    w.set.state = 'live';
    expect(code(w.policy.admitLive(read()))).toBe('ok');
    w.policy.dispose();
    expect(code(w.policy.admitLive(read()))).toBe('TERM_STALE');
  });
});

describe('row 2: declared by identity, the route\'s method and template, the census row\'s leg', () => {
  test.each([
    ['a copied route object', { route: { ...routes.projects } }],
    ['a plain shape', { route: { method: 'GET', path: '/projects', scope: 'realm' } }],
    ['another method', { method: 'POST' }],
    ['a path outside the template', { url: `https://${R1}.${RD}/api/v1/projects/x/y` }],
    ['a dot segment', { route: routes.project, url: `https://${R1}.${RD}/api/v1/projects/..` }],
    ['an encoded dot segment', { route: routes.project, url: `https://${R1}.${RD}/api/v1/projects/%2E%2e` }],
    ['an undeclared query key', { url: `https://${R1}.${RD}/api/v1/projects?page=1&admin=1` }],
    ['a family of another leg', { family: '3' }],
    ['an unknown family', { family: '11' }],
    ['a hoody route on the kit leg', { leg: 'kit', family: '2' }],
  ] as const)('%s → TERM_ROUTE_UNDECLARED', (_n, over) => {
    expect(code(world().policy.admitLive({ ...read(), ...over } as PolicyCall))).toBe('TERM_ROUTE_UNDECLARED');
  });
});

describe('row 3, Hoody leg: the URL is core\'s routing decision on the validated places', () => {
  test('realm read to the selected realm\'s host; base-only route to the API origin; realm `all` to the API origin', () => {
    const w = world();
    expect(code(w.policy.admitLive(read()))).toBe('ok');
    expect(code(w.policy.admitLive({ family: '1', leg: 'hoody', route: routes.wallet, method: 'GET', url: `${API}/api/v1/wallet`, body: null }))).toBe('ok');
    w.set.realm = 'all';
    expect(code(w.policy.admitLive(read(`${API}/api/v1/projects`)))).toBe('ok');
  });
  test.each([
    ['the API origin for a realm call', `${API}/api/v1/projects`],
    ['another realm\'s host', `https://${R2}.${RD}/api/v1/projects`],
    ['a look-alike realm domain', `https://${R1}.${RD}.evil.test/api/v1/projects`],
    ['http', `http://${R1}.${RD}/api/v1/projects`],
    ['no /api/v1', `https://${R1}.${RD}/projects`],
    ['user info', `https://x@${R1}.${RD}/api/v1/projects`],
  ])('%s → refused', (_n, url) => {
    expect(code(world().policy.admitLive(read(url)))).toBe('TERM_DESTINATION');
  });
  test('a routing answer outside the validated realm domain is refused, and core\'s refusal is the refusal', () => {
    const lying = world({ route: () => ({ base: `https://${R1}.evil.test/api/v1` }) });
    expect(code(lying.policy.admitLive(read(`https://${R1}.evil.test/api/v1/projects`)))).toBe('TERM_DESTINATION');
    const otherRealm = world({ route: () => ({ base: `https://${R2}.${RD}/api/v1` }) });
    expect(code(otherRealm.policy.admitLive(read(`https://${R2}.${RD}/api/v1/projects`)))).toBe('TERM_DESTINATION');
    const tok = world({ token: { pin: R1 } });
    expect(code(tok.policy.admitLive({ family: '1', leg: 'hoody', route: routes.wallet, method: 'GET', url: `${API}/api/v1/wallet`, body: null }))).toBe('TOKEN_SESSION_REFUSED');
  });
  test('introspection: the token session\'s own identity on the API origin only, before the base-only refusal', () => {
    const me = (url: string, o: Partial<PolicyCall> = {}): PolicyCall => ({ family: '1', leg: 'hoody', route: routes.tokenMe, method: 'GET', url, body: null, ...o });
    const tok = world({ token: { pin: R1 } });
    expect(code(tok.policy.admitLive(me(`${API}/api/v1/auth/tokens/me`)))).toBe('ok');
    expect(code(tok.policy.admitLive(me(`https://${R1}.${RD}/api/v1/auth/tokens/me`)))).toBe('TERM_DESTINATION');
    expect(code(tok.policy.admitLive(me(`${API}/api/v1/auth/tokens/me?x=1`)))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(world().policy.admitLive(me(`${API}/api/v1/auth/tokens/me`)))).toBe('TERM_DESTINATION');
  });
});

describe('row 3, computer legs: positive membership, the proxy domain, the target\'s server', () => {
  const notes = (o: Partial<PolicyCall> = {}): PolicyCall => ({ family: '3', leg: 'kit', route: routes.notes, method: 'GET', url: `${NOTES}/notes`, body: null, target: T1, index: 1, headers: { Accept: 'application/json' }, ...o });
  test('unknown is a refusal while routingAllows answers true; the same target after the session\'s own list answered is admitted', () => {
    const w = world();
    expect(code(w.policy.admitLive(notes()))).toBe('TERM_DESTINATION');
    member(w);
    expect(code(w.policy.admitLive(notes()))).toBe('ok');
    expect(code(w.policy.admitLive({ family: '2', leg: 'agent', route: routes.bots, method: 'GET', url: `${AGENT}/bots?realm=${R1}`, body: null, target: T1, headers: { Accept: 'application/json' } }))).toBe('ok');
  });
  test('the right computer on another server, another computer, no target, no proxy domain → refused', () => {
    const w = world();
    member(w, 'node-2');
    expect(code(w.policy.admitLive(notes()))).toBe('TERM_DESTINATION');
    const w2 = world(); member(w2);
    expect(code(w2.policy.admitLive(notes({ target: { ...T1, computer: C2 }, url: `${originOf('kit', { ...T1, computer: C2 }, routes.notes, 1)}/notes` })))).toBe('TERM_DESTINATION');
    expect(code(w2.policy.admitLive(notes({ target: null })))).toBe('TERM_DESTINATION');
    const w3 = world({ proxyDomain: null }); member(w3);
    expect(code(w3.policy.admitLive(notes()))).toBe('TERM_DESTINATION');
  });
  test.each([
    ['the API host', () => API],
    ['under the realm API domain', () => `https://x.${RD}`],
    ['a look-alike proxy suffix', (_l: string, t: CallTarget) => `https://x.${t.server}.${PD}.evil.test`],
    ['another server than the target\'s', () => `https://x.node-9.${PD}`],
    ['a path on the origin', (_l: string, t: CallTarget) => `https://x.${t.server}.${PD}/p`],
  ])('an address builder answering %s → refused', (_n, origin) => {
    const w = world({ origin: origin as PolicyDeps['computerOrigin'] });
    member(w);
    const url = (origin as (l: string, t: CallTarget) => string)('kit', T1) + '/notes';
    expect(code(w.policy.admitLive(notes({ url })))).toBe('TERM_DESTINATION');
  });
  test('places that overlap: a computer address under the realm API domain or equal to the API host is still refused', () => {
    const w = world({ origin: (_l, t) => `https://x.${t.server}.${PD}`, places: { realmApiDomain: `node-1.${PD}` } });
    member(w);
    expect(code(w.policy.admitLive(notes({ url: `https://x.node-1.${PD}/notes` })))).toBe('TERM_DESTINATION');
    const v = world({ origin: (_l, t) => `https://api.${t.server}.${PD}`, places: { apiOrigin: `https://api.node-1.${PD}` } });
    member(v);
    expect(code(v.policy.admitLive(notes({ url: `https://api.node-1.${PD}/notes` })))).toBe('TERM_DESTINATION');
  });
  test('a URL that is not under the computer\'s own origin, or carries an undeclared query → refused', () => {
    const w = world(); member(w);
    expect(code(w.policy.admitLive(notes({ url: `${NOTES}.evil.test/notes` })))).toBe('TERM_DESTINATION');
    // Same length as the computer's origin, another host: the prefix itself is compared, not only what follows it.
    expect(code(w.policy.admitLive(notes({ url: `${NOTES.replace('node-1', 'node-2')}/notes` })))).toBe('TERM_DESTINATION');
    w.set.kept.add('r');
    const dot = (id: string): PolicyCall => ({ family: '0c', leg: 'agent', route: routes.botPut, method: 'PUT', url: `${AGENT}/bots/${id}?realm=${R1}`, body: '{"name":"n"}', target: T1, headers: { Accept: 'application/json' }, record: 'r' });
    expect(code(w.policy.admitLive(dot('b1')))).toBe('ok');
    expect(code(w.policy.admitLive(dot('..')))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(w.policy.admitLive(dot('%2e')))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(w.policy.admitLive(notes({ url: `${NOTES}/notes?x=1` })))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(w.policy.admitLive(notes({ url: `${NOTES}/notes?realm=${R1}` })))).toBe('TERM_ROUTE_UNDECLARED');
  });
  // The agent leg's realm= by value, as core sends it (kit.ts agentRealm, admit).
  describe('the agent realm= value', () => {
    const agentCall = (route: Route, q: string): PolicyCall => ({ family: '2', leg: 'agent', route, method: 'GET', url: `${AGENT}${route.path.replace(':id', 'b1')}${q}`, body: null, target: T1, headers: { Accept: 'application/json' } });
    const verdict = (sel: MemberSelection, route: Route, q: string): string => { const w = world({ sel }); member(w); return code(w.policy.admitLive(agentCall(route, q))); };
    const ONE: MemberSelection = { realm: R1, pin: null }, ALL: MemberSelection = { realm: null, pin: null }, PIN: MemberSelection = { realm: R1, pin: R1 };
    test.each([
      // One realm selected: that realm, or the Global realm.
      ['one realm: its own', ONE, routes.botGet, `?realm=${R1}`, 'ok'],
      ['one realm: global (a Global Bot)', ONE, routes.botGet, '?realm=global', 'ok'],
      ['one realm: the list route with the realm', ONE, routes.bots, `?realm=${R1}`, 'ok'],
      ['one realm: another realm id', ONE, routes.botGet, `?realm=${R2}`, 'TERM_DESTINATION'],
      ['one realm: all on the list route', ONE, routes.bots, '?realm=all', 'TERM_DESTINATION'],
      // All realms: any realm id or global; all only on a list route.
      ['all realms: all on the list route', ALL, routes.bots, '?realm=all', 'ok'],
      ['all realms: a realm id', ALL, routes.botGet, `?realm=${R2}`, 'ok'],
      ['all realms: all on a realm route (botPut kind)', ALL, routes.skills, '?realm=all', 'TERM_DESTINATION'],
      ['all realms: all on a bot route', ALL, routes.botGet, '?realm=all', 'TERM_DESTINATION'],
      // An access key's pin: exactly the pin.
      ['pin: the pin', PIN, routes.botGet, `?realm=${R1}`, 'ok'],
      ['pin: the pin on the list route', PIN, routes.bots, `?realm=${R1}`, 'ok'],
      ['pin: the selected realm that is not the pin', { realm: R2, pin: R1 }, routes.botGet, `?realm=${R2}`, 'TERM_DESTINATION'],
      ['pin: another realm id', PIN, routes.botGet, `?realm=${R2}`, 'TERM_DESTINATION'],
      ['pin: global', PIN, routes.botGet, '?realm=global', 'TERM_DESTINATION'],
      ['pin: all on the list route', { realm: null, pin: R1 }, routes.bots, '?realm=all', 'TERM_DESTINATION'],
      // Shape: one value, a real realm word; none only on an optional route.
      ['a duplicate realm', ONE, routes.botGet, `?realm=${R1}&realm=${R1}`, 'TERM_DESTINATION'],
      ['a duplicate realm, the second foreign', ONE, routes.botGet, `?realm=${R1}&realm=${R2}`, 'TERM_DESTINATION'],
      ['junk', ALL, routes.botGet, '?realm=../x', 'TERM_DESTINATION'],
      ['upper-case id', ALL, routes.botGet, `?realm=${'A'.repeat(24)}`, 'TERM_DESTINATION'],
      ['empty', ONE, routes.botGet, '?realm=', 'TERM_DESTINATION'],
      ['missing on a bot route', ONE, routes.botGet, '', 'TERM_DESTINATION'],
      ['missing on an optional route', ONE, routes.optional, '', 'ok'],
      ['given on an optional route', ONE, routes.optional, `?realm=${R1}`, 'ok'],
    ] as const)('%s → %s', (_n, sel, route, q, want) => {
      expect(verdict(sel, route, q)).toBe(want);
    });
    test('botPut (a realm route, a change): realm=all and a foreign id are refused, its own realm admitted', () => {
      const w = world(); member(w); w.set.kept.add('r');
      const put = (q: string): PolicyCall => ({ family: '0c', leg: 'agent', route: routes.botPut, method: 'PUT', url: `${AGENT}/bots/b1${q}`, body: '{"name":"n"}', target: T1, headers: { Accept: 'application/json' }, record: 'r' });
      expect(code(w.policy.admitLive(put(`?realm=${R1}`)))).toBe('ok');
      expect(code(w.policy.admitLive(put('?realm=all')))).toBe('TERM_DESTINATION');
      expect(code(w.policy.admitLive(put(`?realm=${R2}`)))).toBe('TERM_DESTINATION');
      expect(code(w.policy.admitLive(put(`?realm=${R1}&realm=all`)))).toBe('TERM_DESTINATION');
    });
  });
});

describe('row 4: credential class', () => {
  const runCall = (o: Partial<PolicyCall> = {}): PolicyCall => ({ family: '3', leg: 'kit', route: routes.run, method: 'POST', url: `${originOf('kit', T1, routes.run, 1)}/`, body: null, target: T1, index: 1, headers: { Accept: 'application/json' }, record: 'r', ...o });
  const ready = (): World => { const w = world(); member(w); w.set.kept.add('r'); return w; };
  test('the Hoody leg carries no credential of its own', () => {
    for (const h of ['Authorization', 'cookie', 'Proxy-Authorization']) expect(code(world().policy.admitLive({ ...read(), headers: { [h]: 'x' } }))).toBe('TERM_CREDENTIAL_CLASS');
  });
  test('a computer plan: only its allowlist, no cookie, no other X-Hoody-*, the lease never on the plan', () => {
    for (const h of ['Cookie', 'Authorization', 'X-Hoody-Realm', 'X-Hoody-Approver-Lease', 'X-Other']) expect(code(ready().policy.admitLive(runCall({ headers: { [h]: 'x' } })))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(ready().policy.admitLive(runCall({ headers: { Accept: 'a', accept: 'b' } })))).toBe('TERM_CREDENTIAL_CLASS');
  });
  test('the pipe headers only on an upload route that declares them (the sender key only with senderKey)', () => {
    const up = (route: Route, h: Record<string, string>): PolicyCall => ({ family: '6', leg: 'kit', route, method: 'POST', url: `${originOf('kit', T1, route, 1)}/p`, body: null, stream: { path: '/f', size: 1, mtimeMs: 1, length: 1 }, target: T1, index: 1, headers: h, record: 'r' });
    expect(code(ready().policy.admitLive(up(routes.pipe, { 'X-Hoody-Pipe': 'mimeType=text/plain' })))).toBe('ok');
    expect(code(ready().policy.admitLive(up(routes.pipe, { 'X-Hoody-Pipe-Sender-Key': 'k' })))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(ready().policy.admitLive(up(routes.pipeKeyed, { 'X-Hoody-Pipe-Sender-Key': 'k' })))).toBe('ok');
    expect(code(ready().policy.admitLive({ ...runCall(), headers: { 'X-Hoody-Pipe': 'x' } }))).toBe('TERM_CREDENTIAL_CLASS');
  });
  test('each plan header only on a route the web sends it on', () => {
    const w = ready();
    const skills = (h: Record<string, string>): PolicyCall => ({ family: '2', leg: 'agent', route: routes.skills, method: 'GET', url: `${AGENT}/skills?realm=${R1}`, body: null, target: T1, headers: h });
    expect(code(w.policy.admitLive(skills({ Accept: 'application/json', 'X-Hoody-Cwd': '/w' })))).toBe('ok');
    expect(code(w.policy.admitLive({ ...skills({ Accept: 'application/json', 'X-Hoody-Cwd': '/w' }), route: routes.bots, url: `${AGENT}/bots?realm=${R1}` }))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(w.policy.admitLive(skills({ 'Content-Type': 'application/json' })))).toBe('TERM_CREDENTIAL_CLASS');
    for (const h of ['If-Match', 'If-None-Match', 'X-Expected-Length', 'X-Idempotency-Key']) expect(code(w.policy.admitLive(skills({ [h]: '1' })))).toBe('TERM_CREDENTIAL_CLASS');
    const post = { family: '0a', leg: 'agent', route: routes.botPost, method: 'POST', url: `${AGENT}/bots?realm=${R1}`, body: '{"name":"n"}', target: T1, record: 'r' } as const;
    expect(code(w.policy.admitLive({ ...post, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }))).toBe('ok');
    expect(code(w.policy.admitLive({ ...post, headers: { 'Idempotency-Key': 'k' } }))).toBe('TERM_CREDENTIAL_CLASS');
  });
  test('the person\'s own headers reach a run route only, their Authorization included; never a cookie or X-Hoody-*', () => {
    expect(code(ready().policy.admitLive(runCall({ callerHeaders: { Authorization: 'Bearer mine', 'X-Trace': '1' } })))).toBe('ok');
    expect(code(ready().policy.admitLive(runCall({ callerHeaders: { Cookie: 'a=b' } })))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(ready().policy.admitLive(runCall({ callerHeaders: { 'X-Hoody-Cwd': '/' } })))).toBe('TERM_CREDENTIAL_CLASS');
    const w = ready();
    expect(code(w.policy.admitLive({ family: '3', leg: 'kit', route: routes.notes, method: 'GET', url: `${NOTES}/notes`, body: null, target: T1, callerHeaders: { Authorization: 'x' } }))).toBe('TERM_CREDENTIAL_CLASS');
  });
  test('a held boot token: only in the bootstrap body to the captured agent; anywhere else refused', () => {
    const TOKEN = 'hdy_' + 'Q'.repeat(40);
    const w = ready();
    w.policy.holdBootToken(TOKEN);
    const boot = (o: Partial<PolicyCall> = {}): PolicyCall => ({ family: '0a', leg: 'agent', route: routes.bootstrap, method: 'POST', url: `${AGENT}/hoody/auth/bootstrap`, body: JSON.stringify({ token: TOKEN }), target: T1, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, record: 'r', ...o });
    expect(code(w.policy.admitLive(boot()))).toBe('ok');
    expect(code(w.policy.admitLive(boot({ url: `${AGENT}/hoody/auth/bootstrap?t=${TOKEN}` })))).not.toBe('ok');
    expect(code(w.policy.admitLive(boot({ headers: { Accept: `x${TOKEN}y` } })))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(w.policy.admitLive(runCall({ callerHeaders: { Authorization: `Bearer ${TOKEN}` } })))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(w.policy.admitLive({ family: '0a', leg: 'agent', route: routes.botPut, method: 'PUT', url: `${AGENT}/bots/b1?realm=${R1}`, body: JSON.stringify({ name: `n${TOKEN}` }), target: T1, headers: { Accept: 'application/json' }, record: 'r' }))).toBe('TERM_CREDENTIAL_CLASS');
    expect(code(w.policy.admitLive({ ...read(), url: `https://${R1}.${RD}/api/v1/projects?page=${TOKEN}` }))).toBe('TERM_CREDENTIAL_CLASS');
    // Bootstrap on another computer: no membership → destination first.
    expect(code(w.policy.admitLive(boot({ target: { ...T1, computer: C2 }, url: `${originOf('agent', { ...T1, computer: C2 }, routes.bootstrap, 1)}/api/v1/agent/hoody/auth/bootstrap` })))).toBe('TERM_DESTINATION');
    w.policy.dropBootToken();
    expect(code(w.policy.admitLive({ ...read(), url: `https://${R1}.${RD}/api/v1/projects?page=${TOKEN}` }))).toBe('ok');
  });
});

describe('rows 5-8', () => {
  test('row 5: the Board\'s framed browser, display and code programs; the terminal kit\'s data routes stay', () => {
    // Pinned: the list, each a Board tile program (a kit name: the `satisfies KitName[]` holds it at typecheck).
    expect([...LEFT_OUT_KITS].sort()).toEqual(['browser', 'code', 'display']);
    for (const k of LEFT_OUT_KITS) expect(TILE_PROGRAMS as readonly string[]).toContain(k);
    const w = world(); member(w);
    const kitGet = (route: Route, path: string, index = 1): PolicyCall => ({ family: '3', leg: 'kit', route, method: 'GET', url: `${originOf('kit', T1, route, index)}${path}`, body: null, target: T1, index, headers: { Accept: 'application/json' } });
    expect(code(w.policy.admitLive(kitGet(routes.browser, '/api/v1/browser/start')))).toBe('TERM_NOT_IN_TERMINAL');
    expect(code(w.policy.admitLive(kitGet(routes.display, '/api/v1/x')))).toBe('TERM_NOT_IN_TERMINAL');
    expect(code(w.policy.admitLive(kitGet(routes.code, '/api/v1/extensions')))).toBe('TERM_NOT_IN_TERMINAL');
    for (const r of [routes.browser, routes.display, routes.code]) expect(code(w.policy.refuseEarly(r, '3'))).toBe('TERM_NOT_IN_TERMINAL');
    expect(code(w.policy.admitLive(kitGet(routes.termSessions, '/api/v1/terminal/sessions', 0)))).toBe('ok');
  });
  test('row 6: a change needs its own fsynced record; no store, a read-only Hub', () => {
    const w = world();
    const create: PolicyCall = { family: '0a', leg: 'hoody', route: routes.create, method: 'POST', url: `https://${R1}.${RD}/api/v1/projects`, body: { name: 'x' }, record: 'rec-1' };
    expect(code(w.policy.admitLive(create))).toBe('NOT_DURABLE');
    w.set.kept.add('rec-2');
    expect(code(w.policy.admitLive(create))).toBe('NOT_DURABLE');
    w.set.kept.add('rec-1');
    expect(code(w.policy.admitLive(create))).toBe('ok');
    w.set.store = 'ro';
    expect(code(w.policy.admitLive(create))).toBe('TERM_READ_ONLY');
    expect(code(w.policy.refuseEarly(routes.create, '0a'))).toBe('TERM_READ_ONLY');
    w.set.store = 'none';
    expect(code(w.policy.admitLive(create))).toBe('NOT_DURABLE');
    expect(code(w.policy.refuseEarly(routes.create, '0c'))).toBe('NOT_DURABLE');
    expect(code(w.policy.refuseEarly(routes.projects, '1'))).toBe('ok');
  });
  test('row 7: a shown secret needs the secret screen; an unshown one (the boot-token mint) passes by identity', () => {
    const w = world();
    const backup: PolicyCall = { family: '1', leg: 'hoody', route: routes.backup, method: 'GET', url: `${API}/api/v1/users/me/backup-codes`, body: null };
    expect(code(w.policy.admitLive(backup))).toBe('TERM_SECRET_SCREEN');
    expect(code(w.policy.refuseEarly(routes.backup, '1'))).toBe('TERM_SECRET_SCREEN');
    w.set.kept.add('m');
    expect(code(w.policy.admitLive({ family: '0a', leg: 'hoody', route: routes.mint, method: 'POST', url: `${API}/api/v1/auth/tokens`, body: { alias: 'a' }, record: 'm' }))).toBe('ok');
    w.set.reveal = true;
    expect(code(w.policy.admitLive(backup))).toBe('ok');
  });
  test('row 8: a read carries no body', () => {
    expect(code(world().policy.admitLive({ ...read(), body: {} }))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(world().policy.admitLive({ ...read(), body: '' }))).toBe('TERM_ROUTE_UNDECLARED');
  });
  test('early refusal checks the route and its census row only', () => {
    const w = world();
    expect(code(w.policy.refuseEarly({ ...routes.create }, '0a'))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(w.policy.refuseEarly(routes.create, '0b'))).toBe('TERM_ROUTE_UNDECLARED');
    expect(code(w.policy.refuseEarly(routes.create, '99' as never))).toBe('TERM_ROUTE_UNDECLARED');
    w.set.kept.add('x');
    expect(code(w.policy.refuseEarly(routes.create, '0a'))).toBe('ok');
  });
});

describe('the Admission at the transport: forgery', () => {
  const URL1 = `https://${R1}.${RD}/api/v1/projects?page=2`;
  test('the genuine admission passes once, with the actual arguments', () => {
    const w = world();
    const a = admit(w, read());
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('ok');
    expect(w.bypasses).toEqual([]);
    expect(w.policy.descriptor(a)).toMatchObject({ family: '1', leg: 'hoody', method: 'GET', urlDigest: sha(URL1), bodyDigest: null, bodyKind: 'none', sid: 's-1', generation: 1, policyGeneration: 0 });
    // No value leaves the policy, the URL included.
    expect(JSON.stringify(w.policy.descriptor(a))).not.toContain('projects');
    expect(w.policy.descriptor(a)).not.toHaveProperty('url');
  });
  test.each([
    ['no proof', () => undefined],
    ['a forged object', () => ({})],
    ['a frozen look-alike', () => Object.freeze(Object.create(null))],
    ['a copy of a genuine admission', (a: object) => ({ ...a })],
  ])('%s → TERM_POLICY_BYPASS, reported as a code', (_n, forge) => {
    const w = world();
    const a = admit(w, read());
    expect(w.policy.verifyAdmission(forge(a), att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    expect(w.bypasses).toEqual(['TERM_POLICY_BYPASS']);
  });
  test.each([
    ['method', att('POST', URL1)],
    ['URL', att('GET', `https://${R1}.${RD}/api/v1/projects?page=3`)],
    ['origin', att('GET', `https://${R2}.${RD}/api/v1/projects?page=2`)],
    ['body', att('GET', URL1, '{}')],
  ])('an actual %s that disagrees → refused, and the genuine record ends', (_n, actual) => {
    const w = world();
    const a = admit(w, read());
    expect(w.policy.verifyAdmission(a, actual)).toBe('TERM_POLICY_BYPASS');
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
  });
  test('a proof that names no record is reported every time; a record that ended normally reports its reuse once', () => {
    const w = world();
    expect(w.policy.verifyAdmission({}, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    expect(w.policy.verifyAdmission({}, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    expect(w.bypasses).toHaveLength(2);
    const a = admit(w, read());
    w.policy.end(a);
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    expect(w.policy.beforeWire(a)(att('GET', URL1))).toBe(false);
    expect(w.bypasses).toHaveLength(3);
  });
  test('the descriptor is frozen: changing it after admission changes nothing', () => {
    const w = world();
    const a = admit(w, read());
    const d = w.policy.descriptor(a) as unknown as Record<string, unknown>;
    expect(() => { d.urlDigest = sha('https://evil.test/'); }).toThrow();
    expect(() => { d.url = 'https://evil.test/'; }).toThrow();
    expect(w.policy.verifyAdmission(a, att('GET', 'https://evil.test/'))).toBe('TERM_POLICY_BYPASS');
  });
  test('an admission of mount A in mount B, and after A ended', () => {
    const A = world(), B = world();
    const a = admit(A, read());
    expect(B.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    A.policy.dispose();
    expect(A.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    expect(A.policy.descriptor(a)).toBeNull();
  });
  test('a JSON body is bound by its canonical digest: key order does not matter, a value does', () => {
    const w = world();
    w.set.kept.add('r');
    const a = admit(w, { family: '0a', leg: 'hoody', route: routes.create, method: 'POST', url: `https://${R1}.${RD}/api/v1/projects`, body: { name: 'x', z: [1, { b: 2, a: 1 }] }, record: 'r' });
    expect(w.policy.descriptor(a)?.bodyDigest).toBe(sha(canonicalJson({ z: [1, { a: 1, b: 2 }], name: 'x' }) as string));
    expect(w.policy.verifyAdmission(a, att('POST', `https://${R1}.${RD}/api/v1/projects`, '{"name":"y","z":[1,{"a":1,"b":2}]}'))).toBe('TERM_POLICY_BYPASS');
    expect(canonicalJson({ a: Infinity })).toBeNull();
    expect(canonicalJson(new Date())).toBeNull();
  });
});

describe('the Admission at the transport: reuse in the same mount', () => {
  const URL1 = `https://${R1}.${RD}/api/v1/projects?page=2`;
  test('one admission, two transport calls: the second is refused, whatever its arguments', () => {
    const w = world();
    const a = admit(w, read());
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('ok');
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
  });
  test('reused after its call ended (answer, timeout, cancellation)', () => {
    const w = world();
    const a = admit(w, read());
    w.policy.end(a);
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    const b = admit(w, read());
    expect(w.policy.verifyAdmission(b, att('GET', URL1))).toBe('ok');
    w.policy.end(b);
    expect(w.policy.beforeWire(b)(att('GET', URL1))).toBe(false);
  });
  test('a permission change without a sid change (policy generation), a membership change, a session change', () => {
    const w = world();
    const a = admit(w, read());
    w.policy.bump();
    expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    const b = admit(w, read());
    member(w); // the table changed: the policy generation moved
    expect(w.policy.verifyAdmission(b, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    const c = admit(w, read());
    w.set.generation = 2;
    expect(w.policy.verifyAdmission(c, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    const d = admit(w, read());
    w.set.sid = 's-2';
    expect(w.policy.verifyAdmission(d, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
    const e = admit(w, read());
    w.set.state = 'locked';
    expect(w.policy.verifyAdmission(e, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
  });
});

describe('retries: every attempt against the record', () => {
  const URL1 = `https://${R1}.${RD}/api/v1/projects?page=2`;
  test('the same attempt passes; another method, URL or body, or no attempt, is refused and ends the record', () => {
    for (const bad of [att('POST', URL1), att('GET', URL1 + '&x=1'), att('GET', URL1, 'x'), undefined]) {
      const w = world();
      const a = admit(w, read());
      expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('ok');
      const bw = w.policy.beforeWire(a);
      expect(bw(att('GET', URL1))).toBe(true);
      expect(bw(bad)).toBe(false);
      expect(bw(att('GET', URL1))).toBe(false);
      // One record, one report, however often it is refused afterwards.
      expect(w.bypasses).toEqual(['TERM_POLICY_BYPASS']);
      expect(w.policy.verifyAdmission(a, att('GET', URL1))).toBe('TERM_POLICY_BYPASS');
      expect(w.bypasses).toEqual(['TERM_POLICY_BYPASS']);
    }
  });
  test('a retry before the claim, after a permission change, or under a forged proof is refused', () => {
    const w = world();
    const a = admit(w, read());
    expect(w.policy.beforeWire(a)(att('GET', URL1))).toBe(false);
    const b = admit(w, read());
    expect(w.policy.verifyAdmission(b, att('GET', URL1))).toBe('ok');
    w.policy.bump();
    expect(w.policy.beforeWire(b)(att('GET', URL1))).toBe(false);
    expect(w.policy.beforeWire({})(att('GET', URL1))).toBe(false);
  });
});

describe('a computer send\'s two stages: final headers, no cookie', () => {
  const put = (): PolicyCall => ({ family: '0c', leg: 'agent', route: routes.botPut, method: 'PUT', url: `${AGENT}/bots/b1?realm=${R1}`, body: '{"name":"n"}', target: T1, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': 'k-1' }, record: 'r' });
  const ready = (): World => { const w = world(); member(w); w.set.kept.add('r'); return w; };
  const finalHeaders = (lease?: string): Record<string, string> => ({ Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': 'k-1', ...(lease ? { 'X-Hoody-Approver-Lease': lease } : {}) });
  const wire = (h: Record<string, string>, cookie = false): WireAttempt => att('PUT', `${AGENT}/bots/b1?realm=${R1}`, '{"name":"n"}', { headers: Object.entries(h).map(([n, v]) => [n.toLowerCase(), sha(v)] as const), cookie });
  test('unsealed: the transport refuses; sealed with the spent lease: the final headers pass', () => {
    const w = ready();
    const a = admit(w, put());
    expect(w.policy.verifyAdmission(a, wire(finalHeaders()))).toBe('TERM_POLICY_BYPASS');
    const b = admit(w, put());
    expect(w.policy.seal(b, finalHeaders('lease-1'))).toBe(true);
    expect(w.policy.seal(b, finalHeaders('lease-1'))).toBe(false);
    expect(w.policy.verifyAdmission(b, wire(finalHeaders('lease-1')))).toBe('ok');
    expect(w.policy.beforeWire(b)(wire(finalHeaders('lease-1')))).toBe(true);
    expect(w.policy.beforeWire(b)(wire(finalHeaders('lease-2')))).toBe(false);
  });
  test.each([
    ['a changed plan value', { ...finalHeaders(), 'Idempotency-Key': 'k-2' }],
    ['a dropped plan header', { Accept: 'application/json', 'Content-Type': 'application/json' }],
    ['an added header other than the lease', { ...finalHeaders(), Authorization: 'Bearer x' }],
    ['a duplicate name', { ...finalHeaders(), accept: 'application/json' }],
  ])('seal refuses %s', (_n, h) => {
    const w = ready();
    expect(w.policy.seal(admit(w, put()), h)).toBe(false);
  });
  test('the attempt carries a cookie, a header the seal did not see, or no header list → refused', () => {
    for (const actual of [wire(finalHeaders(), true), wire({ ...finalHeaders(), Authorization: 'Bearer cli' }), att('PUT', `${AGENT}/bots/b1?realm=${R1}`, '{"name":"n"}')]) {
      const w = ready();
      const a = admit(w, put());
      expect(w.policy.seal(a, finalHeaders())).toBe(true);
      expect(w.policy.verifyAdmission(a, actual)).toBe('TERM_POLICY_BYPASS');
    }
  });
  test('the lease is added at seal only on a route that declares a lease ticket', () => {
    const w = ready();
    const a = admit(w, { family: '0a', leg: 'agent', route: routes.botPost, method: 'POST', url: `${AGENT}/bots?realm=${R1}`, body: '{"name":"n"}', target: T1, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, record: 'r' });
    expect(w.policy.seal(a, { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Hoody-Approver-Lease': 'l' })).toBe(false);
    expect(w.policy.seal(a, { Accept: 'application/json', 'Content-Type': 'application/json' })).toBe(true);
  });
  test('a Hoody admission cannot be sealed (its client adds its own headers)', () => {
    const w = world();
    expect(w.policy.seal(admit(w, read()), {})).toBe(false);
  });
});
