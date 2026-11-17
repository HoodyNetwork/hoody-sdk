// Acceptance, group CORE: the REAL core api() and liveIO with a transport fake. The six by-key members and the Bot message read
// go out as the agent's by-key routes say, and they are NOT admissions: no Idempotency-Key, no
// journal ticket, no body on a read, and the guard hands them out without one. Wire requests are counted in three classes
// by kind: ADMISSION POSTs (a keyed send), BY-KEY READS and BY-KEY RETIRES.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, calls, onFetch, settle, TARGET, UID, R1 } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { liveIO } from '../data';
import { guardIO } from '../journal';
import { resetPageForTests } from '../journal/testing';
import { botMessageByKey, classifyBotMessage, readBotMessage } from '../recover';
import { classifyKeyRead, classifyKeyRetire } from '../journal/proof';

const K = 'hx-' + 'a'.repeat(32);
const SID = 'sess-1';
const isRetire = (c: { method: string; url: string }) => c.method === 'POST' && /\/retire(\?|$)/.test(c.url);
const isRead = (c: { method: string; url: string }) => c.method === 'GET' && /\/(by-key|session-create-keys)\//.test(c.url);
const admissions = () => calls.filter((c) => c.method === 'POST' && !isRetire(c));
const retires = () => calls.filter(isRetire);
const reads = () => calls.filter(isRead);

beforeEach(() => {
  resetPageForTests();
  boot();
  setIdentity({ id: UID, banned: false });
  calls.length = 0;
});
afterEach(() => { calls.length = 0; });

const members: Array<[string, string, string, (io: any) => Promise<unknown>]> = [
  ['createKeyGet', 'GET', `/session-create-keys/${K}`, (io) => io.createKeyGet(K, R1)],
  ['createKeyRetire', 'POST', `/session-create-keys/${K}/retire`, (io) => io.createKeyRetire(K, R1)],
  ['turnByKey', 'GET', `/sessions/${SID}/turns/by-key/${K}`, (io) => io.turnByKey(SID, K, R1)],
  ['turnKeyRetire', 'POST', `/sessions/${SID}/turns/by-key/${K}/retire`, (io) => io.turnKeyRetire(SID, K, R1)],
  ['commandByKey', 'GET', `/sessions/${SID}/commands/by-key/${K}`, (io) => io.commandByKey(SID, K, R1)],
  ['commandKeyRetire', 'POST', `/sessions/${SID}/commands/by-key/${K}/retire`, (io) => io.commandKeyRetire(SID, K, R1)],
];

describe('the six by-key members are the agent\'s by-key routes, and none is an admission', () => {
  for (const [name, method, path, call] of members) {
    it(`${name}: ${method} …${path.replace(K, '<key>')} in the entry's realm, no Idempotency-Key, no body on a read; through the guard without a ticket`, async () => {
      onFetch(() => ({ status: 200, body: { retired: true, admitted: 'false' } }));
      const io = guardIO(liveIO(TARGET), { acct: UID, container: TARGET.container.id });
      await call(io);
      await settle(5);
      expect(calls).toHaveLength(1);
      const c = calls[0]!;
      expect(c.method).toBe(method);
      const u = new URL(c.url);
      expect(u.pathname.endsWith('/api/v1/agent' + path), u.pathname).toBe(true);
      expect(c.headers['idempotency-key'], 'an unkeyed call').toBeUndefined();
      expect(u.searchParams.get('realm') ?? c.headers['x-hoody-realm'], 'the entry\'s realm').toBe(R1);
      if (method === 'GET') expect(c.body).toBeNull();
      else expect(c.body).toEqual({});
      expect(admissions(), 'not an admission POST').toHaveLength(0);
      expect(method === 'GET' ? reads() : retires()).toHaveLength(1);
    });
  }
  it('the reads cache nothing the second time: each Check again is a request of its own', async () => {
    onFetch(() => ({ status: 404, body: { code: 'turn_not_found', message: 'x', details: { retired: false } } }));
    const io = liveIO(TARGET);
    await io.turnByKey(SID, K, R1).catch(() => {});
    await io.turnByKey(SID, K, R1).catch(() => {});
    expect(reads()).toHaveLength(2);
  });
});

describe('what a by-key answer looks like to the classifier, through the real core', () => {
  const id = (route: 'create' | 'turn' | 'command') => ({ acct: UID, h: 'atlas.tlas', k: K, route });
  const run = async (f: () => Promise<unknown>) => { try { return { ok: true as const, b: await f() }; } catch (e) { return { ok: false as const, e }; } };
  it('a 404 turn_not_found with details {retired:false} reaches the classifier as a miss; with {retired:true, admitted:"false"} as a fenced key', async () => {
    const io = liveIO(TARGET);
    onFetch(() => ({ status: 404, body: { code: 'turn_not_found', message: 'x', details: { retired: false } } }));
    expect(classifyKeyRead(id('turn'), await run(() => io.turnByKey(SID, K, R1)))).toMatchObject({ t: 'unknown', why: 'miss' });
    onFetch(() => ({ status: 404, body: { code: 'turn_not_found', message: 'x', details: { retired: true, admitted: 'false' } } }));
    expect(classifyKeyRead(id('turn'), await run(() => io.turnByKey(SID, K, R1))).t).toBe('notAdmitted');
  });
  it('a 404 create_not_found is a miss; a bare 404 not_found (a hidden session) is not', async () => {
    const io = liveIO(TARGET);
    onFetch(() => ({ status: 404, body: { code: 'create_not_found', message: 'x' } }));
    expect(classifyKeyRead(id('create'), await run(() => io.createKeyGet(K, R1))).why).toBe('miss');
    onFetch(() => ({ status: 404, body: { code: 'not_found', message: 'session not found' } }));
    expect(classifyKeyRead(id('turn'), await run(() => io.turnByKey(SID, K, R1))).why).toBe('readFailed');
  });
  it('a retire answered 503 with Retry-After, and one whose answer is lost, are unknown', async () => {
    const io = liveIO(TARGET);
    onFetch(() => ({ status: 503, headers: { 'retry-after': '2' }, body: { code: 'service_unavailable', message: 'x', details: { admitted: 'unknown' } } }));
    expect(classifyKeyRetire(id('command'), await run(() => io.commandKeyRetire(SID, K, R1))).t).toBe('unknown');
    onFetch(() => ({ status: 200, network: true }));
    expect(classifyKeyRetire(id('turn'), await run(() => io.turnKeyRetire(SID, K, R1))).t).toBe('unknown');
  });
  it('a 409 turn_fences_exhausted keeps its code and is unknown (never send a replacement)', async () => {
    const io = liveIO(TARGET);
    onFetch(() => ({ status: 409, body: { code: 'turn_fences_exhausted', message: 'x', details: { admitted: 'unknown' } } }));
    const r = await run(() => io.turnKeyRetire(SID, K, R1));
    expect(r.ok).toBe(false);
    expect((r as any).e.code).toBe('turn_fences_exhausted');
    expect(classifyKeyRetire(id('turn'), r).t).toBe('unknown');
  });
});

describe('B6d: a Bot message by its key', () => {
  it('GET /bots/{id}/messages/by-key/{key} in the Bot\'s realm: no Idempotency-Key, no body, a read (not an admission)', async () => {
    onFetch(() => ({ status: 200, body: { message_id: 'msg-1', state: 'posted', turn_id: 'turn-9' } }));
    const r = await readBotMessage({ target: TARGET, realm: R1, bot: 'bot1', key: 'hx-' + 'b'.repeat(32) });
    expect(r).toEqual({ t: 'found', id: 'msg-1', state: 'posted', turn: 'turn-9' });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.method).toBe('GET');
    expect(new URL(c.url).pathname.endsWith('/api/v1/agent/bots/bot1/messages/by-key/hx-' + 'b'.repeat(32))).toBe(true);
    expect(c.headers['idempotency-key']).toBeUndefined();
    expect(c.body).toBeNull();
    expect(admissions()).toHaveLength(0);
    expect(botMessageByKey.method).toBe('GET');
  });
  it('queued, missing (proves nothing, no retire is ever sent), accepting (503 + Retry-After) and unknown', async () => {
    const read = () => readBotMessage({ target: TARGET, realm: R1, bot: 'bot1', key: K });
    onFetch(() => ({ status: 200, body: { message_id: 'msg-1', state: 'queued' } }));
    expect(await read()).toEqual({ t: 'found', id: 'msg-1', state: 'queued' });
    onFetch(() => ({ status: 404, body: { code: 'message_not_found', message: 'x' } }));
    expect(await read()).toEqual({ t: 'missing' });
    onFetch(() => ({ status: 503, headers: { 'retry-after': '1' }, body: { code: 'service_unavailable', message: 'accepting' } }));
    expect(await read()).toEqual({ t: 'accepting' });
    onFetch(() => ({ status: 404, body: { code: 'not_found', message: 'bot not found' } }));
    expect(await read()).toEqual({ t: 'unknown' });
    onFetch(() => ({ status: 200, network: true }));
    expect(await read()).toEqual({ t: 'unknown' });
    // The same status and code without Retry-After is the Bot runtime not being configured, not "accepting".
    onFetch(() => ({ status: 503, body: { code: 'service_unavailable', message: 'the Bot runtime is not configured' } }));
    expect(await read()).toEqual({ t: 'unknown' });
    expect(calls.length).toBe(6);
    expect(retires(), 'a Bot message has no retire').toHaveLength(0);
    expect(admissions()).toHaveLength(0);
  });
  it('the classifier is an allow-list: a receipt without a posted turn or with an unknown state concludes nothing', () => {
    expect(classifyBotMessage({ ok: true, b: { message_id: 'msg-1', state: 'posted' } })).toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: true, b: { message_id: 'msg-1', state: 'weird' } })).toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: true, b: { state: 'queued' } })).toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: true, b: null })).toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: false, e: { status: 503, code: 'bad_gateway' } })).toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: false, e: { status: 503, code: 'service_unavailable' } }), 'no Retry-After: not the accepting answer').toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: false, e: { status: 503, code: 'service_unavailable', retryAfter: 0 } }), 'a zero wait is no evidence').toEqual({ t: 'unknown' });
    expect(classifyBotMessage({ ok: false, e: { status: 503, code: 'service_unavailable', retryAfter: 1 } })).toEqual({ t: 'accepting' });
    expect(classifyBotMessage({ ok: false, e: { status: 503, code: 'service_unavailable', retryAfterMs: 1000 } })).toEqual({ t: 'accepting' });
  });
  it('a key or Bot id that is not a plain segment reads nothing and sends nothing', async () => {
    expect(await readBotMessage({ target: TARGET, realm: R1, bot: '../x', key: K })).toEqual({ t: 'unknown' });
    expect(await readBotMessage({ target: TARGET, realm: R1, bot: 'bot1', key: 'a/b' })).toEqual({ t: 'unknown' });
    expect(calls).toHaveLength(0);
  });
});
