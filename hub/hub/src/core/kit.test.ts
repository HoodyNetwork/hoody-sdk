// Agent and kit scopes: admission, the request that leaves, the rejection shape, outcomes.
import { describe, expect, it } from 'vitest';
import { api, outcomeOf, type HubError } from './api';
import { bump, setIdentity } from './ctx';
import { agentBaseFor, buildPortUrl } from './hosts';
import { inflightCount, newKey, retryAfterMs } from './kit';
import { setLiveGate } from './live-gate';
import { defineRoute, type Method } from './routes';
import { AGENT, boot, calls, deferred, onFetch, PROXY, R1, R2, settle, TARGET, UID } from './test/env';
import { resetToken } from './token';

const outcome = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: HubError) => e);
const kitHost = (kit: string, n: number) => `https://p1-c1-${kit}-${n}.sv1.${PROXY}`;

// The 31 non-chat agent Bot operations.
const OPS: Array<[Method, string]> = [
  ['GET', '/bots'], ['POST', '/bots'], ['POST', '/bots/resume'],
  ['GET', '/bots/:id'], ['PATCH', '/bots/:id'], ['DELETE', '/bots/:id'], ['PUT', '/bots/:id/guardrails'],
  ['POST', '/bots/:id/reset'], ['POST', '/bots/:id/forget'], ['GET', '/bots/:id/log'], ['GET', '/bots/:id/archive'],
  ['POST', '/bots/:id/purge'], ['GET', '/bots/:id/delegates'], ['POST', '/bots/:id/delegates/:s/stop'], ['GET', '/bots/:id/voice/check'],
  ['GET', '/bots/:id/channel-settings'], ['PATCH', '/bots/:id/channel-settings'], ['GET', '/bots/:id/channels'], ['POST', '/bots/:id/channels'],
  ['GET', '/bots/:id/channels/setup'], ['GET', '/bots/:id/channels/:c'], ['PATCH', '/bots/:id/channels/:c'], ['DELETE', '/bots/:id/channels/:c'],
  ['PUT', '/bots/:id/channels/:c/credentials'], ['POST', '/bots/:id/channels/:c/pairing'], ['DELETE', '/bots/:id/channels/:c/pairing'],
  ['POST', '/bots/:id/channels/:c/principals'], ['PATCH', '/bots/:id/channels/:c/principals/:p'], ['DELETE', '/bots/:id/channels/:c/principals/:p'],
  ['PATCH', '/bots/:id/channels/:c/chats/:x'], ['DELETE', '/bots/:id/channels/:c/chats/:x'],
];
const UNSCOPED: Array<[Method, string]> = [['GET', '/models'], ['GET', '/version'], ['GET', '/health'], ['GET', '/hoody/auth/status'], ['POST', '/hoody/auth/bootstrap']];
const ALL_OK = new Set(['GET /bots', 'POST /bots/resume']);
const PARAMS = { id: 'b1', s: 's1', c: 'c1', p: 'p1', x: 'x1' };
const hasBody = (m: Method) => m !== 'GET' && m !== 'DELETE' && m !== 'HEAD';
const opRoute = (m: Method, p: string) => defineRoute({ method: m, path: p, scope: 'agent', body: hasBody(m) ? ['x'] : undefined });
const filled = (p: string) => p.replace(/:(\w+)/g, (_, k: keyof typeof PARAMS) => PARAMS[k]);
const opInput = (m: Method, p: string, extra: object = {}) => ({ params: Object.fromEntries(Object.keys(PARAMS).filter((k) => p.includes(':' + k)).map((k) => [k, PARAMS[k as keyof typeof PARAMS]])), body: hasBody(m) ? { x: 1 } : undefined, ...extra });


describe('agent scope: realm on every call', () => {
  it('there are 31 Bot operations in the list', () => expect(OPS.length).toBe(31));
  for (const [m, p] of OPS) {
    const r = opRoute(m, p);
    it(`${m} ${p}: the selection, a captured Bot realm, and All mode`, async () => {
      boot({ realm: R1 });
      onFetch(() => ({ status: 200, body: {} }));
      await api(r, opInput(m, p));
      await api(r, opInput(m, p, { realm: R2 }));
      expect(calls.map((c) => c.url)).toEqual([`${AGENT}${filled(p)}?realm=${R1}`, `${AGENT}${filled(p)}?realm=${R2}`]);
      boot({ realm: 'all' });
      const e = await outcome(api(r, opInput(m, p)));
      if (ALL_OK.has(`${m} ${p}`)) expect(calls[0]!.url).toBe(`${AGENT}${p}?realm=all`);
      else { expect(e).toMatchObject({ code: 'AGENT_REALM_REQUIRED', notSent: true }); expect(calls.length).toBe(0); }
    });
  }
  it('a Global Bot is addressed as realm=global', async () => {
    boot({ realm: 'all' });
    await api(opRoute('GET', '/bots/:id'), { params: { id: 'g1' }, realm: 'global' });
    expect(calls[0]!.url).toBe(`${AGENT}/bots/g1?realm=global`);
  });
  for (const [m, p] of UNSCOPED) {
    it(`${m} ${p} never carries a realm`, async () => {
      boot({ realm: R1 });
      await api(opRoute(m, p), opInput(m, p, { realm: R2 }));
      expect(calls[0]!.url).toBe(`${AGENT}${p}`);
    });
  }
  it('a route cannot take realm as a query key of its own', async () => {
    boot({ realm: R1 });
    const r = defineRoute({ method: 'GET', path: '/bots', scope: 'agent', query: ['realm'] });
    expect(await outcome(api(r, { query: { realm: R2 } }))).toMatchObject({ code: 'AGENT_REALM_IN_PATH', notSent: true });
    expect(calls.length).toBe(0);
  });
  it('no agent URL (no server yet) → refused, nothing sent', async () => {
    boot({ realm: R1 });
    expect(await outcome(api(opRoute('GET', '/bots'), { target: { project: { id: 'p1' }, container: { id: 'c1' } } }))).toMatchObject({ code: 'NO_AGENT_URL' });
    expect(calls.length).toBe(0);
  });
  it('PUT /hoody/realm cannot even be declared', () => {
    expect(() => defineRoute({ method: 'PUT', path: '/hoody/realm', scope: 'agent', body: ['realm'] })).toThrow(/ROUTE_INVALID/);
  });
});

// A token session (an access key) is pinned to one realm, or to every realm ('all': only a key with no realm limit).
// Pinned to one realm, every agent call carries the pin whatever it names. Pinned to every realm it is an account
// session in All realms: a call that names its realm is sent in it (a Bot's or a chat's own
// realm, Global included, were all sent as 'all' and refused unsent).
describe('agent scope: a token session', () => {
  const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
  const record = (realm: string) => JSON.stringify({ v: 1, token: TOKEN, realm, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
  /** A tab whose session is an access key pinned to `pin` (origin.test.ts's token tab, on the served page). */
  const keyTab = (pin: string) => {
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record(pin) } });
    resetToken();
    setIdentity({ id: UID, banned: false });
    onFetch(() => ({ status: 200, body: {} }));
  };
  const one = opRoute('GET', '/bots/:id');

  it('pinned to every realm: a call that names its realm is sent in it, Global included', async () => {
    keyTab('all');
    await api(one, { params: { id: 'b1' }, realm: R1 });
    await api(one, { params: { id: 'g1' }, realm: 'global' });
    expect(calls.map((c) => c.url)).toEqual([`${AGENT}/bots/b1?realm=${R1}`, `${AGENT}/bots/g1?realm=global`]);
  });
  it('pinned to every realm: a call that names none goes in All realms (the list reads all; a one-realm route is refused unsent)', async () => {
    keyTab('all');
    expect(await outcome(api(one, { params: { id: 'b1' } }))).toMatchObject({ code: 'AGENT_REALM_REQUIRED', notSent: true });
    expect(calls.length).toBe(0);
    await api(opRoute('GET', '/bots'));
    expect(calls.map((c) => c.url)).toEqual([`${AGENT}/bots?realm=all`]);
  });
  it('pinned to one realm: unchanged, every call carries the pin whatever it names', async () => {
    keyTab(R1);
    await api(one, { params: { id: 'b1' }, realm: R2 });
    await api(one, { params: { id: 'g1' }, realm: 'global' });
    await api(one, { params: { id: 'b2' } });
    expect(calls.map((c) => c.url)).toEqual([`${AGENT}/bots/b1?realm=${R1}`, `${AGENT}/bots/g1?realm=${R1}`, `${AGENT}/bots/b2?realm=${R1}`]);
  });
});

describe('agent scope: the named agent URL and the transport', () => {
  it('agentBaseFor is the agent-1 host built by buildPortUrl', () => {
    expect(agentBaseFor(TARGET.project, TARGET.container)).toBe(`https://p1-c1-agent-1.sv1.${PROXY}`);
    expect(agentBaseFor(TARGET.project, TARGET.container)).toBe(buildPortUrl(TARGET.project, TARGET.container, 'agent', 1));
    expect(agentBaseFor(TARGET.project, { id: 'c1' })).toBe('');
  });
  it('a terminal label that would not fit is t-<N>', () => {
    const p = { id: 'a'.repeat(24) }, c = { id: 'b'.repeat(24), server_name: 's' };
    expect(buildPortUrl(p, c, 'terminal', 15001)).toBe(`https://${p.id}-${c.id}-t-15001.s.${PROXY}`);
    expect(buildPortUrl(p, c, 'terminal', 9999)).toBe(`https://${p.id}-${c.id}-terminal-9999.s.${PROXY}`);
  });
  it('credentials included; no Authorization or X-Hoody-* header; no-store; redirects not followed', async () => {
    boot({ realm: R1 });
    let init: RequestInit | undefined;
    const real = globalThis.fetch;
    globalThis.fetch = ((u: string, i: RequestInit) => { init = i; return real(u, i); }) as typeof fetch;
    await api(opRoute('POST', '/bots'), { body: { x: 1 } });
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
    expect(init?.redirect).toBe('manual');
    const names = Object.keys(init?.headers as object).map((k) => k.toLowerCase());
    expect(names.filter((k) => k === 'authorization' || k.startsWith('x-hoody-'))).toEqual([]);
  });
  it('GET /bots?realm=all falls back once to the plain listing on 400 realm_scope_unsupported', async () => {
    boot({ realm: 'all' });
    onFetch((c) => (c.url.endsWith('realm=all') ? { status: 400, body: { code: 'realm_scope_unsupported' } } : { status: 200, body: { items: [] } }));
    expect(await api(opRoute('GET', '/bots'))).toEqual({ items: [] });
    expect(calls.map((c) => c.url)).toEqual([`${AGENT}/bots?realm=all`, `${AGENT}/bots`]);
  });
  it('…and on no other error, and never for a secret call', async () => {
    boot({ realm: 'all' });
    onFetch(() => ({ status: 400, body: { code: 'bad_request' } }));
    expect(await outcome(api(opRoute('GET', '/bots')))).toMatchObject({ status: 400 });
    expect(calls.length).toBe(1);
    boot({ realm: 'all' });
    onFetch(() => ({ status: 400, body: { code: 'realm_scope_unsupported' } }));
    await outcome(api(defineRoute({ method: 'GET', path: '/bots', scope: 'agent', secret: true })));
    expect(calls.length).toBe(1);
  });
});

describe('idempotency keys', () => {
  const create = defineRoute({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const plain = defineRoute({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'] });
  it('a route with idem sends the key as Idempotency-Key, unchanged; it requires one', async () => {
    boot({ realm: R1 });
    await api(create, { body: { x: 1 }, idem: 'hub-ask-AbC_123.~' });
    expect(calls[0]!.headers['idempotency-key']).toBe('hub-ask-AbC_123.~');
    expect(await outcome(api(create, { body: { x: 1 } }))).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID', notSent: true });
  });
  it('a route without idem refuses a key; no Idempotency-Key leaves', async () => {
    boot({ realm: R1 });
    expect(await outcome(api(plain, { body: { x: 1 }, idem: 'k' }))).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
    await api(plain, { body: { x: 1 } });
    expect(calls.length).toBe(1);
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
  });
  for (const [what, key] of [['empty', ''], ['a space', 'a b'], ['a newline', 'a\nb'], ['non-ASCII', 'clé'], ['256 characters', 'k'.repeat(256)], ['a number', 12345]] as const) {
    it(`a key with ${what} is refused unsent`, async () => {
      boot({ realm: R1 });
      expect(await outcome(api(create, { body: { x: 1 }, idem: key as string }))).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID', notSent: true });
      expect(calls.length).toBe(0);
    });
  }
  it('a Hoody API route refuses a key; a read cannot declare one', async () => {
    boot({ realm: R1 });
    const r = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
    expect(await outcome(api(r, { params: { id: 'c1' }, idem: 'k1' }))).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
    expect(() => defineRoute({ method: 'GET', path: '/s', scope: 'agent', idem: true })).toThrow(/ROUTE_INVALID/);
  });
  it('newKey has the kit shape and is fresh', () => {
    const a = newKey(), b = newKey();
    expect(a).toMatch(/^hub-[A-Za-z0-9_-]{26}$/);
    expect(a).not.toBe(b);
  });
});

describe('kit scope: the host comes from the target and the route index only', () => {
  const logs = defineRoute({ method: 'GET', path: '/_logs', scope: 'kit', kit: 'logs', index: 1, query: ['limit', 'afterId'], maxBytes: 4 << 20 });
  const write = defineRoute({ method: 'POST', path: '/api/v1/terminal/write', scope: 'kit', kit: 'terminal', index: (n) => n === 0 || (n >= 15001 && n <= 19999), body: ['input', 'enter'] });
  it('a program URL; credentials omitted; query encoded', async () => {
    boot({ realm: R1 });
    let init: RequestInit | undefined;
    const real = globalThis.fetch;
    globalThis.fetch = ((u: string, i: RequestInit) => { init = i; return real(u, i); }) as typeof fetch;
    await api(logs, { index: 1, query: { limit: 5, afterId: 'a/b' } });
    expect(calls[0]!.url).toBe(`${kitHost('logs', 1)}/_logs?limit=5&afterId=a%2Fb`);
    expect(init?.credentials).toBe('omit');
  });
  it('an index the route does not take is refused unsent', async () => {
    boot({ realm: R1 });
    for (const index of [2, 1.5, -1]) expect(await outcome(api(logs, { index }))).toMatchObject({ code: 'ROUTE_NOT_ALLOWED', notSent: true });
    expect(await outcome(api(write, { body: { input: 'ls' } }))).toMatchObject({ code: 'ROUTE_NOT_ALLOWED' }); // a predicate needs a concrete index
    expect(await outcome(api(write, { index: 7, body: { input: 'ls' } }))).toMatchObject({ code: 'ROUTE_NOT_ALLOWED' });
    await api(write, { index: 15001, body: { input: 'ls', enter: false } });
    expect(calls.map((c) => c.url)).toEqual([`${kitHost('terminal', 15001)}/api/v1/terminal/write`]);
  });
  it('a route declared with one index uses it when the caller names none', async () => {
    boot({ realm: R1 });
    await api(logs, { query: { limit: 1 } });
    expect(calls[0]!.url).toBe(`${kitHost('logs', 1)}/_logs?limit=1`);
  });
  it('no realm on a kit call; no target → NO_KIT_URL', async () => {
    boot({ realm: R1 });
    await api(logs, { index: 1 });
    expect(calls[0]!.url).not.toContain('realm=');
    expect(await outcome(api(logs, { index: 1, target: { project: { id: 'p1' }, container: { id: 'c1' } } }))).toMatchObject({ code: 'NO_KIT_URL' });
  });
  it('maxBytes may only lower the route bound', async () => {
    boot({ realm: R1 });
    expect(await outcome(api(logs, { index: 1, maxBytes: (4 << 20) + 1 }))).toMatchObject({ code: 'MAXBYTES_INVALID' });
    expect(await outcome(api(logs, { index: 1, maxBytes: 1000 }))).toMatchObject({ ok: {} });
  });
  it('a guard sees the query that leaves and must say true', async () => {
    boot({ realm: R1 });
    const seen: unknown[] = [];
    const g = defineRoute({ method: 'PATCH', path: '/bots/:id', scope: 'agent', query: ['expect_uid'], body: ['name'], guard: (q) => { seen.push(q.query); return q.query.expect_uid === 'u-1'; } });
    expect(await outcome(api(g, { params: { id: 'b1' }, query: { expect_uid: 'u-2' }, body: { name: 'n' } }))).toMatchObject({ code: 'ROUTE_NOT_ALLOWED' });
    await api(g, { params: { id: 'b1' }, query: { expect_uid: 'u-1' }, body: { name: 'n' } });
    expect(seen).toEqual([{ expect_uid: 'u-2' }, { expect_uid: 'u-1' }]);
    expect(calls.length).toBe(1);
  });
  it('framed: a GET declared framed:false and every change are refused; other GETs go out', async () => {
    boot({ realm: R1, framed: true });
    const a = defineRoute({ method: 'GET', path: '/a', scope: 'agent', realm: 'none' });
    const b = defineRoute({ method: 'GET', path: '/b', scope: 'agent', realm: 'none', framed: false });
    const c = defineRoute({ method: 'POST', path: '/c', scope: 'agent', realm: 'none', body: [] });
    expect(await outcome(api(a))).toMatchObject({ ok: {} });
    expect(await outcome(api(b))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED', notSent: true });
    expect(await outcome(api(c, { body: {} }))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED', notSent: true });
    expect(calls.length).toBe(1);
  });
});

describe('the rejection shape and Retry-After', () => {
  const r = defineRoute({ method: 'GET', path: '/version', scope: 'agent' });
  const cases: Array<[number, unknown, string]> = [
    [401, { code: 'x' }, 'private'], [403, {}, 'private'], [400, {}, 'bad_request'], [422, {}, 'bad_request'], [404, {}, 'refused'],
    [409, {}, 'refused'], [429, { code: 'quota' }, 'quota'], [429, {}, 'rate_limited'], [500, {}, 'unavailable'], [503, {}, 'unavailable'],
  ];
  for (const [status, body, kind] of cases) {
    it(`${status} ${JSON.stringify(body)} → ${kind}`, async () => {
      boot({ realm: R1 });
      onFetch(() => ({ status, body }));
      expect(await outcome(api(r))).toMatchObject({ kind, status });
    });
  }
  it('the code comes from code or error, at most 64 characters; details kept', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'busy', details: { a: 1 } } }));
    expect(await outcome(api(r))).toMatchObject({ code: 'busy', details: { a: 1 } });
    onFetch(() => ({ status: 409, body: { code: 'x'.repeat(65) } }));
    expect(await outcome(api(r))).toMatchObject({ code: null });
  });
  it('a 2xx that is not JSON or is bad JSON is unavailable; empty is {}', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, text: 'hello', headers: { 'content-type': 'text/plain' } }));
    expect(await outcome(api(r))).toMatchObject({ kind: 'unavailable', code: 'NOT_JSON' });
    onFetch(() => ({ status: 200, text: '{bad' }));
    expect(await outcome(api(r))).toMatchObject({ kind: 'unavailable', code: 'BAD_JSON' });
    onFetch(() => ({ status: 200, text: '' }));
    expect(await outcome(api(r))).toEqual({ ok: {} });
  });
  it('an answer over its bound is too_large; a redirect is redirected', async () => {
    boot({ realm: R1 });
    const small = defineRoute({ method: 'GET', path: '/version', scope: 'agent', maxBytes: 10 });
    onFetch(() => ({ status: 200, body: { long: 'x'.repeat(50) } }));
    expect(await outcome(api(small))).toMatchObject({ kind: 'too_large' });
    onFetch(() => ({ status: 302, text: '' }));
    expect(await outcome(api(r))).toMatchObject({ kind: 'redirected', status: 302 });
  });
  it('Retry-After seconds and IMF-fixdate; anything else unknown', async () => {
    expect(retryAfterMs('7')).toBe(7000);
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs(new Date(Date.now() + 10000).toUTCString())).toBeGreaterThan(5000);
    boot({ realm: R1 });
    onFetch(() => ({ status: 429, body: {}, headers: { 'retry-after': '3' } }));
    expect(await outcome(api(r))).toMatchObject({ retryAfterMs: 3000, retryAfter: 3 });
  });
});

describe('outcomes through the kit', () => {
  const change = defineRoute({ method: 'POST', path: '/bots/:id/reset', scope: 'agent', body: [] });
  it('a 503 or no answer to a change is pending; a 4xx is failed', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {} }));
    expect(outcomeOf(await outcome(api(change, { params: { id: 'b1' }, body: {} })))).toBe('pending');
    onFetch(() => ({ status: 0, network: true }));
    expect(outcomeOf(await outcome(api(change, { params: { id: 'b1' }, body: {} })))).toBe('pending');
    onFetch(() => ({ status: 404, body: {} }));
    expect(outcomeOf(await outcome(api(change, { params: { id: 'b1' }, body: {} })))).toBe('failed');
  });
  it('a generation bump aborts a call in flight: a read is stale, a change pending', async () => {
    boot({ realm: R1 });
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: {}, delayMs: 50 }; });
    const read = outcome(api(defineRoute({ method: 'GET', path: '/bots', scope: 'agent' })));
    const write = outcome(api(change, { params: { id: 'b1' }, body: {} }));
    await settle();
    expect(inflightCount()).toBe(2);
    bump('switch');
    d.res();
    expect(await read).toMatchObject({ kind: 'stale' });
    expect(await write).toMatchObject({ kind: 'pending' });
    expect(inflightCount()).toBe(0);
  });
  it('a live terminal gate that refuses early: not sent, nothing leaves; no gate (the web) or a null answer: it goes out', async () => {
    boot({ realm: R1 });
    const asked: string[] = [];
    let answer: { code: string; stale?: boolean } | null = { code: 'TERM_READ_ONLY' };
    setLiveGate({ direct: (_site, _place, send) => send(undefined), early: (r) => { asked.push(`${r.method} ${r.path}`); return answer; } });
    try {
      expect(await outcome(api(change, { params: { id: 'b1' }, body: {} }))).toMatchObject({ kind: 'not_sent', notSent: true, code: 'TERM_READ_ONLY' });
      answer = { code: 'TERM_STALE', stale: true };
      expect(await outcome(api(change, { params: { id: 'b1' }, body: {} }))).toMatchObject({ notSent: true, stale: true });
      expect(calls.length).toBe(0);
      answer = null;
      expect(await outcome(api(change, { params: { id: 'b1' }, body: {} }))).toMatchObject({ ok: {} });
      expect(asked).toEqual(['POST /bots/:id/reset', 'POST /bots/:id/reset', 'POST /bots/:id/reset']);
    } finally { setLiveGate(null); }
    expect(await outcome(api(change, { params: { id: 'b1' }, body: {} }))).toMatchObject({ ok: {} });
    expect(calls.length).toBe(2);
  });
  it('preflight_refused only from an origin a simple GET proved', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 0, network: true }));
    const post = defineRoute({ method: 'POST', path: '/x', scope: 'agent', realm: 'none', body: ['a'] });
    const get = defineRoute({ method: 'GET', path: '/version', scope: 'agent' });
    expect(await outcome(api(post, { body: { a: 1 }, recovers: true }))).toMatchObject({ kind: 'pending', code: 'NETWORK' });
    onFetch(() => ({ status: 200, body: {} }));
    await api(get);
    onFetch(() => ({ status: 0, network: true }));
    // Refused by the browser before it was sent: a known outcome, but kit rejections carry no notSent, so C9 keeps it pending.
    expect(await outcome(api(post, { body: { a: 1 }, recovers: true }))).toMatchObject({ kind: 'pending', code: 'preflight_refused' });
  });
});
