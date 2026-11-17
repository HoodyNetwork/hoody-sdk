// sessionApi and its readers: rename and the re-read of a chat. Each call is one declared route, sent once; a lost
// answer to a change is never "done"; an answer is read as what it says and the title shown is the one the agent stored.
import { afterEach, describe, expect, it } from 'vitest';
import { installTransport, type Transport } from '../transport';
import { boot, R1, R2, TARGET } from '../test/env';
import { closedOf, closeOf, deleteOf, loopsOf, presentOf, renameOf, sessionApi, sessionTitleOf, trimOf, turnsOf } from './session';

type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let reply: (r: Req) => { status: number; body?: unknown; network?: boolean } = () => ({ status: 200, body: { status: 'ok', name: 'Release checklist' } });
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(url, init) {
    const r = { url, init };
    reqs.push(r);
    const a = reply(r);
    if (a.network) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'content-type': 'application/json' } }));
  },
};
function page() { boot({ realm: R1 }); reqs = []; installTransport(tr); }
afterEach(() => { installTransport(null); reply = () => ({ status: 200, body: { status: 'ok', name: 'Release checklist' } }); });
const path = (r: Req) => new URL(r.url).pathname;

describe('sessionApi.rename', () => {
  it('PATCH /sessions/<id> with exactly {name}, sent once', async () => {
    page();
    await sessionApi(TARGET).rename('s1', 'Release checklist');
    expect(reqs.map((r) => [r.init.method, path(r)])).toEqual([['PATCH', '/api/v1/agent/sessions/s1']]);
    expect(JSON.parse(String(reqs[0]!.init.body))).toEqual({ name: 'Release checklist' });
  });
  it('an empty name is sent as "" (it clears the title), never left out', async () => {
    page();
    await sessionApi(TARGET).rename('s1', '');
    expect(JSON.parse(String(reqs[0]!.init.body))).toEqual({ name: '' });
  });
  it('the chat\'s own realm is named when given, the page\'s otherwise', async () => {
    page();
    await sessionApi(TARGET).rename('s1', 'a');
    await sessionApi(TARGET).rename('s1', 'a', R2);
    expect(reqs[0]!.url).toContain(`realm=${R1}`);
    expect(reqs[1]!.url).toContain(`realm=${R2}`);
    expect(reqs[1]!.url).not.toContain(R1);
  });
  it('a lost answer is sent once and settles as pending, never failed or done', async () => {
    page();
    reply = () => ({ status: 0, network: true });
    const r = await sessionApi(TARGET).rename('s1', 'a');
    expect(reqs.length).toBe(1);
    expect(r.ok).toBe(false);
    expect(renameOf(r)).toEqual({ k: 'unknown' });
  });
});

describe('renameOf', () => {
  it('the title shown is the one the agent stored (it sanitises and caps), not the one typed', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok', name: 'Release [redacted]' } });
    expect(renameOf(await sessionApi(TARGET).rename('s1', 'Release sk-secret'))).toEqual({ k: 'done', name: 'Release [redacted]' });
  });
  it('a cleared title is done with the empty name', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok', name: '' } });
    expect(renameOf(await sessionApi(TARGET).rename('s1', ''))).toEqual({ k: 'done', name: '' });
  });
  it('a 200 whose body names no stored title is unknown, not done (nothing is invented from what was typed)', async () => {
    page();
    for (const body of [{ status: 'ok' }, { status: 'ok', name: null }, { status: 'ok', name: 7 }, 'ok', null]) {
      reply = () => ({ status: 200, body });
      expect(renameOf(await sessionApi(TARGET).rename('s1', 'x'))).toEqual({ k: 'unknown' });
    }
  });
  // Parse at the boundary: the discriminator and every field read are checked; contradiction = unknown.
  it.each([
    ['status missing', { name: 'x' }], ['status failed with a name', { status: 'failed', name: 'Never stored' }], ['status not a string', { status: 1, name: 'x' }],
    ['status OK in capitals', { status: 'OK', name: 'x' }], ['name an array', { status: 'ok', name: ['x'] }], ['an array body', [{ status: 'ok', name: 'x' }]],
  ])('a 200 that is not the documented success (%s) stays unknown', async (_n, body) => {
    page();
    reply = () => ({ status: 200, body });
    expect(renameOf(await sessionApi(TARGET).rename('s1', 'x'))).toEqual({ k: 'unknown' });
  });
  it('a plain 404 is gone', async () => {
    page();
    reply = () => ({ status: 404, body: { code: 'not_found', message: 'x' } });
    expect(renameOf(await sessionApi(TARGET).rename('s1', 'x'))).toEqual({ k: 'gone' });
  });
  it('other refusals keep their status and code and are refused, never unknown', async () => {
    page();
    reply = () => ({ status: 400, body: { code: 'bad_request', message: 'x' } });
    expect(renameOf(await sessionApi(TARGET).rename('s1', 'x'))).toEqual({ k: 'refused', status: 400, code: 'bad_request' });
    reply = () => ({ status: 413, body: { code: 'payload_too_large', message: 'x' } });
    expect(renameOf(await sessionApi(TARGET).rename('s1', 'x'))).toMatchObject({ k: 'refused', status: 413 });
  });
  it('a server error on a change is not proof that nothing was saved: core settles it as pending, so it reads as unknown', async () => {
    page();
    for (const status of [500, 503]) {
      reply = () => ({ status, body: { code: 'internal_error', message: 'x' } });
      expect(renameOf(await sessionApi(TARGET).rename('s1', 'x'))).toEqual({ k: 'unknown' });
    }
  });
});

describe('sessionApi.read and sessionTitleOf', () => {
  it('GET /sessions/<id>, a read, in the chat\'s realm', async () => {
    page();
    reply = () => ({ status: 200, body: { session: { id: 's1', name: 'Mine' } } });
    const r = await sessionApi(TARGET).read('s1', R2);
    expect(reqs.map((x) => [x.init.method, path(x)])).toEqual([['GET', '/api/v1/agent/sessions/s1']]);
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
    expect(sessionTitleOf(r, 's1')).toEqual({ name: 'Mine', auto: false });
  });
  it('an unnamed chat reads as the empty name; an unreadable answer or a failed read reads as null (unknown, not empty)', async () => {
    page();
    reply = () => ({ status: 200, body: { session: { id: 's1' } } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toEqual({ name: '', auto: false });
    reply = () => ({ status: 200, body: { nope: 1 } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toBeNull();
    reply = () => ({ status: 404, body: { code: 'not_found', message: 'x' } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toBeNull();
    reply = () => ({ status: 200, body: { session: { id: 's1', name: 5 } } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toBeNull();
  });
  // The read-back must be THE captured chat, not any chat with a matching title.
  it.each([
    ['another chat\'s id', { session: { id: 'other-chat', name: 'First' } }], ['no id', { session: { name: 'First' } }], ['an empty session', { session: {} }],
    ['id a number', { session: { id: 1, name: 'First' } }], ['id an array', { session: { id: ['s1'], name: 'First' } }], ['session an array', { session: [{ id: 's1' }] }],
    ['session null', { session: null }], ['name an object', { session: { id: 's1', name: {} } }],
  ])('a read-back with %s proves nothing: null', async (_n, body) => {
    page();
    reply = () => ({ status: 200, body });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toBeNull();
  });
  it('a title the agent made itself reads as automatic; a name a person set, or none, does not', async () => {
    page();
    reply = () => ({ status: 200, body: { session: { id: 's1', name: 'Plan the backup job', name_auto: true } } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toEqual({ name: 'Plan the backup job', auto: true });
    reply = () => ({ status: 200, body: { session: { id: 's1', name: 'Mine', name_auto: false } } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toEqual({ name: 'Mine', auto: false });
  });
  it.each([
    ['name_auto true with an empty name', { id: 's1', name: '', name_auto: true }], ['name_auto true with no name', { id: 's1', name_auto: true }],
    ['name_auto a string', { id: 's1', name: 'Mine', name_auto: 'yes' }], ['name_auto a number', { id: 's1', name: 'Mine', name_auto: 1 }],
  ])('a read-back with %s cannot be: null (unknown)', async (_n, session) => {
    page();
    reply = () => ({ status: 200, body: { session } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toBeNull();
  });
  it('the matching chat\'s own title, and its unnamed state, are read', async () => {
    page();
    reply = () => ({ status: 200, body: { session: { id: 's1', name: 'First' } } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toEqual({ name: 'First', auto: false });
    reply = () => ({ status: 200, body: { session: { id: 's1' } } });
    expect(sessionTitleOf(await sessionApi(TARGET).read('s1'), 's1')).toEqual({ name: '', auto: false });
  });
});

// Close, and what a close needs to say (loops) and to prove (the chat is no longer attached) ----
const okBody = (body: unknown) => ({ ok: true, body }) as const;
const bad = (kind: 'pending' | 'failed' | 'stale', status: number, code = '') => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } }) as const;

describe('sessionApi.close and loops', () => {
  it('close: POST /sessions/<id>/close, no body, the chat\'s realm, sent once', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok' } });
    await sessionApi(TARGET).close('s1', R2);
    expect(reqs.map((r) => [r.init.method, path(r)])).toEqual([['POST', '/api/v1/agent/sessions/s1/close']]);
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
    expect(String(reqs[0]!.init.body ?? '')).toBe('');
  });
  it('close never carries ?hard (that is delete)', async () => {
    page();
    await sessionApi(TARGET).close('s1');
    expect(reqs[0]!.url).not.toContain('hard');
  });
  it('a lost close answer is sent once and settles unknown, never done', async () => {
    page();
    reply = () => ({ status: 0, network: true });
    const r = await sessionApi(TARGET).close('s1');
    expect(reqs.length).toBe(1);
    expect(closeOf(r)).toEqual({ k: 'unknown' });
  });
  it('loops: GET /sessions/<id>/loops with limit=0 (the whole list, one page), a read', async () => {
    page();
    reply = () => ({ status: 200, body: { items: [], meta: { total: 0 } } });
    await sessionApi(TARGET).loops('s1', R2);
    expect(reqs.map((r) => [r.init.method, path(r)])).toEqual([['GET', '/api/v1/agent/sessions/s1/loops']]);
    expect(reqs[0]!.url).toContain('limit=0');
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
  });
});

describe('closeOf: one parser for the close answer', () => {
  it('done only for {status:"ok"}', () => {
    expect(closeOf(okBody({ status: 'ok' }))).toEqual({ k: 'done' });
  });
  it.each([
    ['no status', {}], ['failed status', { status: 'failed' }], ['OK capitals', { status: 'OK' }], ['a number', { status: 1 }], ['an array', []], ['null', null], ['text', 'ok'],
  ])('a 200 with %s is not proof: unknown', (_n, body) => {
    expect(closeOf(okBody(body))).toEqual({ k: 'unknown' });
  });
  it('a lost answer, a 5xx and a stale context are unknown; 404 is not live (the chat may be closed already); other refusals keep status and code', () => {
    expect(closeOf(bad('pending', 0))).toEqual({ k: 'unknown' });
    expect(closeOf(bad('pending', 503, 'unavailable'))).toEqual({ k: 'unknown' });
    expect(closeOf(bad('stale', 0))).toEqual({ k: 'unknown' });
    expect(closeOf(bad('failed', 404, 'not_found'))).toEqual({ k: 'notLive' });
    expect(closeOf(bad('failed', 403, 'forbidden'))).toEqual({ k: 'refused', status: 403, code: 'forbidden' });
  });
});

describe('closedOf: a read proves "no longer attached" only when every channel of the answer says so about THIS chat', () => {
  // The gateway's two real shapes: a persisted chat is {session:{...daemon summary},
  // attached:true only while this gateway's hub holds it, started, ...}; a live chat with no turn yet is {session:{id, live:true,
  // started:false, ...}, attached:true, started}. The daemon summary says `attached` / `attached_clients` (omitted when false/zero).
  const sess = (extra: Record<string, unknown> = {}, top: Record<string, unknown> = {}, id = 's1') => okBody({ session: { id, ...extra }, ...top });
  it('nothing says attached (the agent omits the flags when false): closed', () => {
    expect(closedOf(sess(), 's1')).toBe('closed');
    expect(closedOf(sess({ attached: false }), 's1')).toBe('closed');
    expect(closedOf(sess({ attached: false, attached_clients: 0 }, { attached: false }), 's1')).toBe('closed');
    expect(closedOf(sess({ live: false }), 's1')).toBe('closed');
  });
  it('the daemon summary says attached: open (also with other clients)', () => {
    expect(closedOf(sess({ attached: true, attached_clients: 1 }), 's1')).toBe('open');
    expect(closedOf(sess({ attached: true }), 's1')).toBe('open');
    expect(closedOf(sess({ attached_clients: 2, attached: true }), 's1')).toBe('open');
  });
  it('this gateway\'s hub still holds it (top-level attached:true, the live-draft shape included): open', () => {
    expect(closedOf(sess({ live: true, started: false }, { attached: true, started: {} }), 's1')).toBe('open');
    expect(closedOf(sess({}, { attached: true }), 's1')).toBe('open');
    expect(closedOf(sess({ attached: true }, { attached: true }), 's1')).toBe('open');
  });
  it('a summary that says live: open', () => {
    expect(closedOf(sess({ live: true }), 's1')).toBe('open');
  });
  it('the channels disagree (the hub holds it but the summary says not attached, or the reverse is a malformed flag): unknown', () => {
    expect(closedOf(sess({ attached: false }, { attached: true }), 's1')).toBe('unknown');
    expect(closedOf(sess({ attached: false, attached_clients: 0, live: true }), 's1')).toBe('unknown');
  });
  it('a 404 is gone; a lost read, 5xx or other refusal is unknown', () => {
    expect(closedOf(bad('failed', 404, 'not_found'), 's1')).toBe('gone');
    expect(closedOf(bad('failed', 500), 's1')).toBe('unknown');
    expect(closedOf(bad('pending', 0), 's1')).toBe('unknown');
    expect(closedOf(bad('failed', 403, 'forbidden'), 's1')).toBe('unknown');
  });
  it.each([
    ['another chat', sess({}, {}, 's2')], ['no id', okBody({ session: {} })], ['no session', okBody({})], ['an array session', okBody({ session: [] })],
    ['a null session', okBody({ session: null })], ['a numeric id', okBody({ session: { id: 1 } })], ['an array body', okBody([])],
    ['attached as text', sess({ attached: 'no' })], ['attached as a number', sess({ attached: 0 })],
    ['top-level attached as text', sess({}, { attached: 'yes' })], ['top-level attached as a number', sess({}, { attached: 1 })], ['top-level attached null', sess({}, { attached: null })],
    ['live as text', sess({ live: 'yes' })], ['live as a number', sess({ live: 1 })],
    ['not attached but clients > 0 (a contradiction)', sess({ attached: false, attached_clients: 2 })],
    ['clients negative', sess({ attached: true, attached_clients: -1 })], ['clients as text', sess({ attached_clients: '1' })],
    ['clients fractional', sess({ attached: true, attached_clients: 1.5 })],
  ])('%s: unknown, never closed', (_n, r) => {
    expect(closedOf(r as never, 's1')).toBe('unknown');
  });
});

describe('loopsOf: the count of loops a close would stop, or "unknown"', () => {
  const page1 = (items: unknown[], total: unknown = items.length) => okBody({ items, meta: { total } });
  const loop = (state: unknown, extra: Record<string, unknown> = {}) => ({ id: 'l', session_id: 's1', state, ...extra });
  it('counts the loops that are still scheduled: running, paused (it resumes) and firing; ended ones are not stopped by a close', () => {
    expect(loopsOf(page1([]), 's1')).toEqual({ k: 'count', n: 0 });
    expect(loopsOf(page1([loop('running'), loop('paused'), loop('firing')]), 's1')).toEqual({ k: 'count', n: 3 });
    expect(loopsOf(page1([loop('expired'), loop('stopped'), loop('ended'), loop('error')]), 's1')).toEqual({ k: 'count', n: 0 });
    expect(loopsOf(page1([loop('running'), loop('paused', { paused: true }), loop('budget_stopped_is_not_a_state' as never)]), 's1')).toEqual({ k: 'unknown' });
  });
  it('a row of another chat, or one that does not say whose it is, is a contradiction: unknown', () => {
    expect(loopsOf(page1([loop('running')]), 's1')).toEqual({ k: 'count', n: 1 });
    expect(loopsOf(page1([loop('running', { session_id: 's9' })]), 's1')).toEqual({ k: 'unknown' });
    expect(loopsOf(page1([{ id: 'l', state: 'running' }]), 's1')).toEqual({ k: 'unknown' });
    expect(loopsOf(page1([loop('running', { session_id: 1 })]), 's1')).toEqual({ k: 'unknown' });
  });
  it.each([
    ['a failed read', bad('failed', 500)], ['a lost read', bad('pending', 0)], ['404', bad('failed', 404)],
    ['no items', okBody({ meta: { total: 0 } })], ['items not an array', okBody({ items: {}, meta: { total: 0 } })],
    ['no meta', okBody({ items: [] })], ['no total', okBody({ items: [], meta: {} })],
    ['total as text', page1([], '0')], ['total negative', page1([], -1)], ['total fractional', page1([], 0.5)],
    ['more loops than the page holds', page1([loop('running')], 3)], ['fewer than the page holds', page1([loop('running'), loop('running')], 1)],
    ['a row that is not an object', page1([null])], ['a row without a state', page1([{ id: 'l', session_id: 's1' }])], ['a row with a numeric state', page1([loop(1)])],
    ['an unknown state', page1([loop('sleeping')])],
    ['an array body', okBody([])], ['null', okBody(null)],
  ])('%s: unknown, never zero', (_n, r) => {
    expect(loopsOf(r as never, 's1')).toEqual({ k: 'unknown' });
  });
});

describe('sessionApi.delete: a hard delete of one chat, sent once', () => {
  it('DELETE /sessions/<id>?hard=true, no body, the chat\'s own realm', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok', closed: false, hard: true } });
    await sessionApi(TARGET).delete('s1', R2);
    expect(reqs.map((r) => [r.init.method, path(r)])).toEqual([['DELETE', '/api/v1/agent/sessions/s1']]);
    expect(reqs[0]!.url).toContain('hard=true');
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
    expect(String(reqs[0]!.init.body ?? '')).toBe('');
  });
  it('close never carries ?hard and delete always does', async () => {
    page();
    await sessionApi(TARGET).close('s1');
    await sessionApi(TARGET).delete('s1');
    expect(reqs[0]!.url).not.toContain('hard');
    expect(reqs[1]!.url).toContain('hard=true');
  });
  it('a lost answer is sent once and settles unknown, never done', async () => {
    page();
    reply = () => ({ status: 0, network: true });
    const r = await sessionApi(TARGET).delete('s1');
    expect(reqs.length).toBe(1);
    expect(deleteOf(r)).toEqual({ k: 'unknown' });
  });
  it('on the wire, a 200 with the documented body is done', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok', closed: true, hard: true } });
    expect(deleteOf(await sessionApi(TARGET).delete('s1'))).toEqual({ k: 'done' });
  });
  it.each([[201], [202], [203], [206]])('on the wire, a %i carrying the documented body is unknown, never done (only a 200 proves the record is gone)', async (status) => {
    page();
    reply = () => ({ status, body: { status: 'ok', closed: true, hard: true } });
    const r = await sessionApi(TARGET).delete('s1');
    expect(reqs.length).toBe(1);
    expect(deleteOf(r)).toEqual({ k: 'unknown' });
  });
  it.each([
    ['409 session_live', 409, 'session_live', { k: 'live' }],
    ['404 not_found', 404, 'not_found', { k: 'notFound' }],
  ])('on the wire, %s settles %j', async (_n, status, code, want) => {
    page();
    reply = () => ({ status, body: { error: { code, message: 'x' }, code, message: 'x' } });
    const r = await sessionApi(TARGET).delete('s1');
    expect(reqs.length).toBe(1);
    expect(deleteOf(r)).toEqual(want);
  });
  it.each([
    ['503 session_terminating', 503, 'session_terminating'], ['503 service_unavailable', 503, 'service_unavailable'], ['500 internal', 500, 'internal'], ['502 with no code', 502, ''],
  ])('on the wire, %s is unknown (a 5xx is read back, never trusted as "nothing deleted")', async (_n, status, code) => {
    page();
    reply = () => ({ status, body: { error: { code, message: 'x' }, code, message: 'x' } });
    const r = await sessionApi(TARGET).delete('s1');
    expect(reqs.length).toBe(1);
    expect(deleteOf(r)).toEqual({ k: 'unknown' });
  });
});

describe('deleteOf: one parser for the delete answer', () => {
  it('done only for {status:"ok", hard:true} (closed may be either)', () => {
    expect(deleteOf(okBody({ status: 'ok', closed: true, hard: true }))).toEqual({ k: 'done' });
    expect(deleteOf(okBody({ status: 'ok', closed: false, hard: true }))).toEqual({ k: 'done' });
    expect(deleteOf(okBody({ status: 'ok', hard: true }))).toEqual({ k: 'done' });
  });
  it.each([
    ['hard false (only closed)', { status: 'ok', closed: true, hard: false }], ['no hard', { status: 'ok', closed: true }], ['hard "true"', { status: 'ok', hard: 'true' }],
    ['no status', { hard: true }], ['status failed', { status: 'failed', hard: true }], ['an array', []], ['null', null], ['text', 'ok'],
  ])('a 200 with %s is not proof: unknown', (_n, body) => {
    expect(deleteOf(okBody(body))).toEqual({ k: 'unknown' });
  });
  it('lost, stale and 5xx answers are unknown; 409 session_live is "attached elsewhere"; 404 is not found; other refusals keep status and code', () => {
    expect(deleteOf(bad('pending', 0))).toEqual({ k: 'unknown' });
    expect(deleteOf(bad('pending', 503, 'unavailable'))).toEqual({ k: 'unknown' });
    expect(deleteOf(bad('stale', 0))).toEqual({ k: 'unknown' });
    expect(deleteOf(bad('failed', 500, 'internal'))).toEqual({ k: 'unknown' });
    expect(deleteOf(bad('failed', 502, ''))).toEqual({ k: 'unknown' });
    expect(deleteOf(bad('failed', 503, 'session_terminating'))).toEqual({ k: 'unknown' });
    expect(deleteOf(bad('failed', 409, 'session_live'))).toEqual({ k: 'live' });
    expect(deleteOf(bad('failed', 409, 'other'))).toEqual({ k: 'refused', status: 409, code: 'other' });
    expect(deleteOf(bad('failed', 404, 'not_found'))).toEqual({ k: 'notFound' });
    expect(deleteOf(bad('failed', 403, 'forbidden'))).toEqual({ k: 'refused', status: 403, code: 'forbidden' });
  });
});

describe('presentOf: what a read says about whether chat s1 exists', () => {
  it('there only for a session that names this chat', () => {
    expect(presentOf(okBody({ session: { id: 's1' } }), 's1')).toBe('there');
    expect(presentOf(okBody({ session: { id: 's2' } }), 's1')).toBe('unknown');
    expect(presentOf(okBody({}), 's1')).toBe('unknown');
    expect(presentOf(okBody(null), 's1')).toBe('unknown');
  });
  it('a plain 404 is absent (missing or hidden: the gateway does not say); every other failure is unknown', () => {
    expect(presentOf(bad('failed', 404, 'not_found'), 's1')).toBe('absent');
    expect(presentOf(bad('pending', 404, 'not_found'), 's1')).toBe('unknown');
    expect(presentOf(bad('failed', 500, ''), 's1')).toBe('unknown');
    expect(presentOf(bad('pending', 0), 's1')).toBe('unknown');
    expect(presentOf(bad('stale', 0), 's1')).toBe('unknown');
  });
});

describe('sessionApi.trim and turns', () => {
  it('trim: POST /sessions/<id>/trim with exactly {turn_idx}, sent once, a change; 0 is a real index', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok', outcome: 'done' } });
    await sessionApi(TARGET).trim('s1', 0, R2);
    expect(reqs.map((r) => [r.init.method, path(r)])).toEqual([['POST', '/api/v1/agent/sessions/s1/trim']]);
    expect(JSON.parse(String(reqs[0]!.init.body))).toEqual({ turn_idx: 0 });
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
  });
  it('trim: only a 200 with the done body is done; a 202 (or any other 2xx) with a done-shaped body is unknown, never done', async () => {
    page();
    reply = () => ({ status: 200, body: { status: 'ok', outcome: 'done' } });
    expect(trimOf(await sessionApi(TARGET).trim('s1', 1))).toEqual({ k: 'done' });
    for (const st of [201, 202, 203, 206]) {
      reply = () => ({ status: st, body: { status: 'ok', outcome: 'done' } });
      expect(trimOf(await sessionApi(TARGET).trim('s1', 1))).toEqual({ k: 'unknown' });
    }
    reply = () => ({ status: 202, body: { status: 'pending' } });
    expect(trimOf(await sessionApi(TARGET).trim('s1', 1))).toEqual({ k: 'unknown' });
  });
  it('trim: a lost answer is sent once and never again', async () => {
    page();
    reply = () => ({ status: 0, network: true });
    const r = await sessionApi(TARGET).trim('s1', 3);
    expect(reqs.length).toBe(1);
    expect(trimOf(r)).toEqual({ k: 'unknown' });
  });
  it('trim is a change: core settles a lost answer and a 5xx as pending, never failed', async () => {
    page();
    reply = () => ({ status: 0, network: true });
    const lost = await sessionApi(TARGET).trim('s1', 3);
    expect(lost.ok).toBe(false);
    expect(!lost.ok && lost.err.kind).toBe('pending');
    // Only a change reads "still running" as may-have-gone-through: a trim answered 409 in_progress is unknown, never refused.
    reply = () => ({ status: 409, body: { code: 'in_progress', message: 'x' } });
    const running = await sessionApi(TARGET).trim('s1', 3);
    expect(!running.ok && running.err.kind).toBe('pending');
    expect(trimOf(running)).toEqual({ k: 'unknown' });
  });
  it('trim: a 500 trim_failed is the daemon saying nothing was trimmed: a definite failure with its code kept, never pending', async () => {
    page();
    reply = () => ({ status: 500, body: { code: 'trim_failed', message: 'the trim could not be saved; nothing was trimmed' } });
    const r = await sessionApi(TARGET).trim('s1', 1);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.err.kind).toBe('failed');
    expect(!r.ok && r.err.status).toBe(500);
    expect(!r.ok && r.err.code).toBe('trim_failed');
    expect(trimOf(r)).toEqual({ k: 'failed' });
    expect(reqs.length).toBe(1);
  });
  it('trim: core settles only the exact 500 trim_failed (and, since refuses holds at any status, a 502 or 503 naming it) as a refusal; every other 5xx is pending; trimOf reads all of them unknown', async () => {
    page();
    // [answer, the kind core settles it as]. A 502 or 503 that names trim_failed is a notApplied rejection at core (a route's `refuses`
    // applies at any status), but trimOf demands status 500 as well, so the dialog still keeps the attempt and reads the chat back.
    const cases: Array<[{ status: number; body?: unknown }, 'pending' | 'failed']> = [
      [{ status: 500, body: { code: 'internal_error', message: 'x' } }, 'pending'],
      [{ status: 500 }, 'pending'],
      [{ status: 500, body: { code: 'something_else' } }, 'pending'],
      [{ status: 502, body: { code: 'trim_failed' } }, 'failed'],
      [{ status: 503, body: { code: 'trim_failed' } }, 'failed'],
      [{ status: 504 }, 'pending'],
    ];
    for (const [a, kind] of cases) {
      reply = () => a;
      const r = await sessionApi(TARGET).trim('s1', 1);
      expect(r.ok, JSON.stringify(a)).toBe(false);
      expect(!r.ok && r.err.kind, JSON.stringify(a)).toBe(kind);
      expect(trimOf(r), JSON.stringify(a)).toEqual({ k: 'unknown' });
    }
  });
  it('trim: the route lists trim_failed as a refusal (the generated catalogue does not carry the agent\'s own codes)', async () => {
    const { sessionRoutes } = await import('./session');
    expect((sessionRoutes.trim as { refuses?: readonly string[] | null }).refuses).toEqual(['trim_failed']);
  });
  it('trim: the route waits longer than the gateway does (its result wait is 90 s)', async () => {
    const { sessionRoutes } = await import('./session');
    expect((sessionRoutes.trim as { timeoutMs?: number }).timeoutMs).toBeGreaterThan(90_000);
    expect((sessionRoutes.trim as { readsStatus?: boolean }).readsStatus).toBe(true);
  });
  it('turns: GET /sessions/<id>/transcript with no after_turn (the whole history), a read', async () => {
    page();
    reply = () => ({ status: 200, body: { session_id: 's1', turns_total: 0, turns_returned: 0, after_turn: 0, turn_boundaries: [], messages: [] } });
    await sessionApi(TARGET).turns('s1', R2);
    expect(reqs.map((r) => [r.init.method, path(r)])).toEqual([['GET', '/api/v1/agent/sessions/s1/transcript']]);
    expect(reqs[0]!.url).not.toContain('after_turn');
    expect(reqs[0]!.url).toContain(`realm=${R2}`);
  });
  it('turns: only a 200 is a transcript; a 202 (or any other 2xx) carrying a valid transcript body is unknown, never a count', async () => {
    page();
    const body = { session_id: 's1', realm: R2, turns_total: 2, turns_returned: 2, after_turn: 0, turn_boundaries: [1, 3], messages: [{}, {}, {}, {}] };
    reply = () => ({ status: 200, body });
    expect(turnsOf(await sessionApi(TARGET).turns('s1', R2), 's1', R2)).toEqual({ k: 'count', n: 2 });
    for (const st of [201, 202, 203, 206]) {
      reply = () => ({ status: st, body });
      expect(turnsOf(await sessionApi(TARGET).turns('s1', R2), 's1', R2)).toEqual({ k: 'unknown' });
    }
  });
  it('turns: the route reads its status', async () => {
    const { sessionRoutes } = await import('./session');
    expect((sessionRoutes.transcript as { readsStatus?: boolean }).readsStatus).toBe(true);
  });
  it('turns is a read: a 409 in_progress is a plain failure (only a change reads it as may-have-gone-through), never pending', async () => {
    page();
    reply = () => ({ status: 409, body: { code: 'in_progress', message: 'x' } });
    const r = await sessionApi(TARGET).turns('s1');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.err.kind).toBe('failed');
    expect(turnsOf(r, 's1', R2)).toEqual({ k: 'unknown' });
  });
});

describe('trimOf: one parser for the trim answer', () => {
  it('done only for 200 {status:"ok", outcome:"done"}', () => {
    expect(trimOf(okBody({ status: 'ok', outcome: 'done' }))).toEqual({ k: 'done' });
  });
  it.each([
    ['pending (202)', { status: 'pending', request_id: 'r1' }], ['no outcome', { status: 'ok' }], ['outcome unknown', { status: 'ok', outcome: 'outcome_unknown' }],
    ['outcome refused', { status: 'ok', outcome: 'refused' }], ['status failed', { status: 'failed', outcome: 'done' }], ['OK capitals', { status: 'OK', outcome: 'done' }],
    ['only outcome', { outcome: 'done' }], ['empty', {}], ['an array', []], ['null', null], ['text', 'ok'],
  ])('a success status with %s is not proof: unknown, never done', (_n, body) => {
    expect(trimOf(okBody(body))).toEqual({ k: 'unknown' });
  });
  it('a lost answer, a stale context and a 5xx that is not trim_failed are unknown', () => {
    expect(trimOf(bad('pending', 0))).toEqual({ k: 'unknown' });
    expect(trimOf(bad('stale', 0))).toEqual({ k: 'unknown' });
    for (const st of [500, 502, 503, 504]) expect(trimOf(bad('failed', st, 'internal_error')), String(st)).toEqual({ k: 'unknown' });
    expect(trimOf(bad('pending', 503, 'unavailable'))).toEqual({ k: 'unknown' });
  });
  it('500 trim_failed is a definite failure: nothing was trimmed', () => {
    expect(trimOf(bad('failed', 500, 'trim_failed'))).toEqual({ k: 'failed' });
  });
  it('409 turn_in_flight and delegated_session are refusals with their code; another 409 keeps status and code', () => {
    expect(trimOf(bad('failed', 409, 'turn_in_flight'))).toEqual({ k: 'refused', status: 409, code: 'turn_in_flight' });
    expect(trimOf(bad('failed', 409, 'delegated_session'))).toEqual({ k: 'refused', status: 409, code: 'delegated_session' });
    expect(trimOf(bad('failed', 409, 'other'))).toEqual({ k: 'refused', status: 409, code: 'other' });
  });
  it('404 is not live (the chat may be closed): never done, never "deleted"', () => {
    expect(trimOf(bad('failed', 404, 'not_found'))).toEqual({ k: 'notLive' });
  });
  it('other refusals keep status and code', () => {
    expect(trimOf(bad('failed', 400, 'bad_request'))).toEqual({ k: 'refused', status: 400, code: 'bad_request' });
    expect(trimOf(bad('failed', 403, 'forbidden'))).toEqual({ k: 'refused', status: 403, code: 'forbidden' });
  });
});

describe('turnsOf: how many finished turns the chat has, from its whole transcript', () => {
  const t = (o: Record<string, unknown> = {}) => okBody({ session_id: 's1', realm: R2, turns_total: 3, turns_returned: 3, after_turn: 0, turn_boundaries: [1, 3, 5], messages: [{}, {}, {}, {}, {}, {}], ...o });
  it('counts a complete, consistent read of this chat', () => {
    expect(turnsOf(t(), 's1', R2)).toEqual({ k: 'count', n: 3 });
    expect(turnsOf(t({ turns_total: 0, turns_returned: 0, turn_boundaries: [] }), 's1', R2)).toEqual({ k: 'count', n: 0 });
    expect(turnsOf(t({ turns_total: 0, turns_returned: 0, turn_boundaries: [], messages: [] }), 's1', R2)).toEqual({ k: 'count', n: 0 });
  });
  it('the chat\'s realm must be the one the daemon names: the same, normalized (global or a 24-hex id)', () => {
    expect(turnsOf(t({ realm: 'global' }), 's1', 'global')).toEqual({ k: 'count', n: 3 });
    expect(turnsOf(t(), 's1', R2)).toEqual({ k: 'count', n: 3 });
  });
  it.each([
    ['another realm', { realm: R1 }], ['no realm', { realm: undefined }], ['a numeric realm', { realm: 5 }], ['an empty realm', { realm: '' }],
    ['global when the chat is in a realm', { realm: 'global' }], ['upper-case hex (the daemon writes lower case)', { realm: R2.toUpperCase() }], ['all', { realm: 'all' }],
  ])('%s: unknown, never a count', (_n, o) => {
    expect(turnsOf(t(o), 's1', R2)).toEqual({ k: 'unknown' });
  });
  it('the captured realm itself must be a realm: an empty or malformed one never matches', () => {
    expect(turnsOf(t({ realm: '' }), 's1', '')).toEqual({ k: 'unknown' });
    expect(turnsOf(t({ realm: 'nope' }), 's1', 'nope')).toEqual({ k: 'unknown' });
    expect(turnsOf(t({ realm: 'global' }), 's1', R2)).toEqual({ k: 'unknown' });
  });
  it('a turn that emitted nothing is -1 (none yet) or repeats the last index, and is still a turn', () => {
    expect(turnsOf(t({ turn_boundaries: [-1, -1, 1] }), 's1', R2)).toEqual({ k: 'count', n: 3 });
    expect(turnsOf(t({ turn_boundaries: [1, 1, 5] }), 's1', R2)).toEqual({ k: 'count', n: 3 });
    expect(turnsOf(t({ turn_boundaries: [-1, 0, 0] }), 's1', R2)).toEqual({ k: 'count', n: 3 });
  });
  it('a mid-turn tail after the last boundary is fine (messages past it are not a turn)', () => {
    expect(turnsOf(t({ turn_boundaries: [1, 3, 4] }), 's1', R2)).toEqual({ k: 'count', n: 3 });
  });
  it.each([
    ['another chat', { session_id: 's9' }], ['no session id', { session_id: undefined }], ['a numeric session id', { session_id: 1 }],
    ['a slice (after_turn 1)', { after_turn: 1, turns_returned: 2, turn_boundaries: [3, 5] }], ['no after_turn', { after_turn: undefined }], ['after_turn as text', { after_turn: '0' }],
    ['returned fewer than total', { turns_returned: 2, turn_boundaries: [1, 3] }], ['boundaries disagree with total', { turn_boundaries: [1, 3] }],
    ['total negative', { turns_total: -1, turns_returned: -1, turn_boundaries: [] }], ['total fractional', { turns_total: 1.5, turns_returned: 1.5 }],
    ['total as text', { turns_total: '3' }], ['no total', { turns_total: undefined }], ['no returned', { turns_returned: undefined }],
    ['no boundaries', { turn_boundaries: undefined }], ['boundaries not an array', { turn_boundaries: {} }],
    ['boundaries that go back ([5,1,...])', { turn_boundaries: [5, 1, 5] }], ['a boundary that goes back to -1', { turn_boundaries: [1, -1, 5] }],
    ['a boundary past the messages (6 messages, index 6)', { turn_boundaries: [1, 3, 6] }], ['a boundary far past the messages', { turn_boundaries: [1, 3, 99] }],
    ['no messages field', { messages: undefined }], ['messages an object', { messages: {} }], ['messages as text', { messages: 'x' }], ['messages null', { messages: null }],
    ['no messages at all but a boundary', { messages: [], turn_boundaries: [1, 3, 5] }],
    ['a fractional boundary', { turn_boundaries: [1, 2.5, 5] }], ['a boundary below -1', { turn_boundaries: [1, -2, 5] }], ['a boundary as text', { turn_boundaries: [1, '3', 5] }],
  ])('%s: unknown, never a count', (_n, o) => {
    expect(turnsOf(t(o), 's1', R2)).toEqual({ k: 'unknown' });
  });
  it.each([['a failed read', bad('failed', 500)], ['a lost read', bad('pending', 0)], ['404', bad('failed', 404)], ['an array body', okBody([])], ['null', okBody(null)], ['text', okBody('x')]])(
    '%s: unknown', (_n, r) => {
      expect(turnsOf(r as never, 's1', R2)).toEqual({ k: 'unknown' });
    });
});
