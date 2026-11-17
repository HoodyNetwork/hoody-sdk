// `--new-token` mint / revoke / cleanup, on real store
// files (hub-store.ts) against a fake API that keeps its own token table; nothing leaves the process.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The mint sends the proposal (one realm, route leaves, 12 h, full name), keeps the id on disk before handing out the key, never the value | 'mint' |
// | 2 | Refused, nothing sent: an access-key credential, All realms, a second instance (no store lock) | 'refusals' |
// | 3 | An answer wider than asked (realm, leaf, expiry) is revoked at once; no key handed out | 'scope as accepted' |
// | 4 | 2FA: OTP_REQUIRED asks the masked prompt once and resends with the code; no code = nothing made, intent dropped | '2fa' |
// | 5 | A lost answer keeps the intent; the next start finds the key by full name and revokes it before minting | 'lost answer' |
// | 6 | Lookup failed or empty too soon: intent kept, nothing minted; empty after the deadline: settled | 'lookup rules' |
// | 7 | Leaving revokes with one retry and prints one line; a failure keeps the intent for the next start | 'leave' |
// | 8 | A crash after the mint: the next start revokes the recorded id; a second instance revokes nothing | 'crash cleanup' |
import { afterEach, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type TryLock } from '../../../scripts/term/build/hub-store';
import { ALIAS_API, ALIAS_API_MAX, LEAVE_LINES, leavesTree, mintNewKey, NEW_KEY_KEY, NEW_KEY_LAND_MARGIN_MS, NEW_KEY_TTL_MS, newKeyAlias, readNewKeyIntent, revokeNewKeyOnLeave, settleNewKey, type MintDeps, type NewKeySend } from './new-token';
import { storeModeOf } from './live-records';

setDefaultTimeout(30_000);

const UID = '64f0ada00000000000000001';
const API = 'https://api.example.invalid';
const REALM = '64f0ada000000000000000aa';
const LEAVES = ['projects.read', 'resources.vault', 'computers.actions.logs'];
const T0 = Date.parse('2026-11-12T10:00:00.000Z');
const DEADLINE = 30_000;

let flock: TryLock = () => true;
let home = '';
let dir = '';
const stores: HubStore[] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-newkey-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, API, UID)!;
});
afterEach(() => {
  for (const s of stores.splice(0)) { try { s.close(); } catch { /* closed */ } }
  fs.rmSync(home, { recursive: true, force: true });
});
const open = (): HubStore => { const s = openHubStore(dir, { home, tryLock: flock }); stores.push(s); return s; };
let origin = 0;
/** A second store (another origin) in the same home: a clean start without deleting the first. */
const fresh = (): HubStore => { dir = hubStoreDir(home, `${API}:${++origin}`, UID)!; return open(); };

/** The API's refusal envelope: the code is `error`, never `code`. */
const apiErr = (status: number, error: string) => ({ status, body: { statusCode: status, error, message: 'refused' } });

interface Tok { id: string; alias: string; token: string; realm_ids: string[]; permissions: unknown; expires_at: string }
/** The rest of a token row as the API answers it (createAuthToken / listAuthTokens 200 schemas, openapi.json). */
const full = <T extends object>(t: T) => ({ ...t, prefix: 'hdy_kkkk', ip_whitelist: [], is_enabled: true, vault_access: true, event_access: true, created_at: '2026-11-12T10:00:00.000Z', updated_at: '2026-11-12T10:00:00.000Z' });
/** A fake API: a token table and a log of what was sent. `answer` shapes the POST answer; `drop` loses it after the
 *  table took the key; `fail` refuses calls of a method with a status. */
function fakeApi(o: { otp?: boolean; widen?: (t: Tok) => Tok; drop?: number; fail?: Partial<Record<'GET' | 'DELETE', number>>; noAnswer?: Partial<Record<'GET' | 'DELETE', number>>; noId?: boolean } = {}) {
  const table: Tok[] = [];
  const sent: { method: string; path: string; body?: unknown }[] = [];
  let n = 0, drops = o.drop ?? 0;
  const nf = { ...(o.noAnswer ?? {}) };
  const send: NewKeySend = async (method, p, body) => {
    sent.push({ method, path: p, body });
    if (method !== 'POST' && nf[method]) { nf[method]!--; throw new Error('no answer'); }
    if (method !== 'POST' && o.fail?.[method]) return apiErr(o.fail[method]!, 'Internal Server Error');
    if (method === 'GET') return { status: 200, body: { statusCode: 200, message: 'ok', data: table.map(({ token: _t, ...rest }) => full(rest)) } };
    if (method === 'DELETE') {
      const i = table.findIndex((t) => p === `/auth/tokens/${t.id}`);
      if (i < 0) return apiErr(404, 'TOKEN_NOT_FOUND');
      table.splice(i, 1);
      return { status: 200, body: { statusCode: 200, message: 'deleted' } };
    }
    const b = body as Record<string, unknown>;
    // createTokenSchema (auth-token.schemas.ts) `alias`: the server refuses any other name before anything else.
    if (typeof b.alias !== 'string' || b.alias.length < 1 || b.alias.length > 254 || !/^[a-zA-Z0-9 _-]*$/.test(b.alias)) return apiErr(400, 'Bad Request');
    if (o.otp && b.otp_code !== '123456') return apiErr(400, 'OTP_REQUIRED');
    let t: Tok = { id: (++n).toString(16).padStart(24, '0'), alias: b.alias as string, token: `hdy_${'k'.repeat(40)}${n}`, realm_ids: b.realm_ids as string[], permissions: b.permissions, expires_at: b.expires_at as string };
    if (o.widen) t = o.widen(t);
    table.push(t);
    if (drops > 0) { drops--; throw new Error('answer lost'); }
    return { status: 201, body: { statusCode: 201, message: 'created', data: full(o.noId ? { ...t, id: undefined } : t) } };
  };
  return { table, sent, send };
}

function deps(area: HubStore, send: NewKeySend, over: Partial<MintDeps> = {}): MintDeps {
  const clock = T0;
  return { mode: storeModeOf(area), area, send, requestDeadlineMs: DEADLINE, now: () => clock, credential: 'login', realm: REALM, host: 'api.example.invalid', leaves: LEAVES, askCode: async () => null, opId: () => 'abc123def0', ...over, ...(over.now ? {} : { now: () => clock }) };
}

describe('--new-token mint, revoke and cleanup', () => {
  test('mint', async () => {
    const s = open(), api = fakeApi();
    const r = await mintNewKey(deps(s, api.send));
    expect(r.k).toBe('ok');
    if (r.k !== 'ok') return;
    const post = api.sent.find((x) => x.method === 'POST')!.body as Record<string, unknown>;
    expect(post.alias).toBe('hoody hub api-example-invalid 2026-11-12 abc123def0');
    expect(post.realm_ids).toEqual([REALM]);
    expect(post.permissions).toEqual({ projects: { read: true }, resources: { vault: true }, computers: { actions: { logs: true } } });
    expect(post.expires_at).toBe('2026-11-12T22:00:00.000Z');
    expect(NEW_KEY_TTL_MS).toBe(12 * 3_600_000);
    expect(r.token.startsWith('hdy_')).toBe(true);
    // The id and the accepted expiry are on disk (a reopened store reads them); the value is nowhere in the store.
    s.close();
    const again = open();
    const kept = readNewKeyIntent(again);
    expect(kept).toEqual({ op: 'abc123def0', alias: post.alias as string, at: T0, id: r.id, expires_at: r.expires_at });
    for (const f of fs.readdirSync(dir)) expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toContain(r.token);
  });

  test('refusals', async () => {
    const s = open(), api = fakeApi();
    expect(await mintNewKey(deps(s, api.send, { credential: 'key' }))).toEqual({ k: 'refused', why: 'key-credential' });
    expect(await mintNewKey(deps(s, api.send, { realm: 'all' }))).toEqual({ k: 'refused', why: 'all-realms' });
    const second = open();
    expect(second.readOnly).toBe('busy');
    expect(await mintNewKey(deps(second, api.send))).toEqual({ k: 'refused', why: 'not-holder' });
    expect(await mintNewKey(deps(s, api.send, { leaves: ['nodots'] }))).toEqual({ k: 'refused', why: 'scope' });
    expect(await mintNewKey(deps(s, api.send, { opId: () => 'BAD' }))).toEqual({ k: 'refused', why: 'scope' });
    expect(api.sent.filter((x) => x.method === 'POST')).toEqual([]);
    expect(s.get(NEW_KEY_KEY)).toBeNull();
  });

  test('scope as accepted', async () => {
    const cases: ((t: Tok) => Tok)[] = [
      (t) => ({ ...t, realm_ids: [] }),
      (t) => ({ ...t, realm_ids: ['64f0ada000000000000000bb'] }),
      (t) => ({ ...t, token: 'k'.repeat(40) }),
      (t) => ({ ...t, alias: `${t.alias} other` }),
      (t) => ({ ...t, realm_ids: [REALM, '64f0ada000000000000000bb'] }),
      (t) => ({ ...t, permissions: { ...(t.permissions as object), financial: { wallet: { write: true } } } }),
      (t) => ({ ...t, permissions: { ...(t.permissions as object), resources: 'all' } }),
      (t) => ({ ...t, expires_at: new Date(Date.parse(t.expires_at) + 3_600_000).toISOString() }),
      (t) => ({ ...t, expires_at: null as unknown as string }),
    ];
    for (const widen of cases) {
      const s = fresh(), api = fakeApi({ widen });
      const r = await mintNewKey(deps(s, api.send));
      expect(r).toEqual({ k: 'failed', why: 'widened', kept: false });
      expect(api.table).toEqual([]);
      expect(s.get(NEW_KEY_KEY)).toBeNull();
    }
    // Narrower than asked is accepted (the server may grant less).
    const s = fresh(), api = fakeApi({ widen: (t) => ({ ...t, permissions: { projects: { read: true } }, expires_at: new Date(Date.parse(t.expires_at) - 60_000).toISOString() }) });
    expect((await mintNewKey(deps(s, api.send))).k).toBe('ok');
  });

  test('2fa', async () => {
    const s = open();
    let asked = 0;
    const api = fakeApi({ otp: true });
    const r = await mintNewKey(deps(s, api.send, { askCode: async () => { asked++; return '123456'; } }));
    expect(r.k).toBe('ok');
    expect(asked).toBe(1);
    const posts = api.sent.filter((x) => x.method === 'POST').map((x) => (x.body as Record<string, unknown>).otp_code);
    expect(posts).toEqual([undefined, '123456']);
    // No code given: nothing made, the intent dropped, no second POST.
    const s2 = fresh();
    const api2 = fakeApi({ otp: true });
    expect(await mintNewKey(deps(s2, api2.send))).toEqual({ k: 'failed', why: 'otp', kept: false });
    expect(api2.sent.filter((x) => x.method === 'POST')).toHaveLength(1);
    expect(s2.get(NEW_KEY_KEY)).toBeNull();
    // A wrong code is a definite refusal: intent dropped.
    const api3 = fakeApi({ otp: true });
    const r3 = await mintNewKey(deps(s2, api3.send, { askCode: async () => '999999' }));
    expect(r3).toEqual({ k: 'failed', why: 'api', code: 'OTP_REQUIRED', kept: false });
    expect(s2.get(NEW_KEY_KEY)).toBeNull();
    // The resend's answer is lost after the person took two minutes: the kept intent is aged from the RESEND,
    // so the next start inside that send's deadline does not settle it as old.
    const s3 = fresh();
    let clock = T0;
    const api4 = fakeApi({ otp: true, drop: 1 });
    const r4 = await mintNewKey(deps(s3, api4.send, { now: () => clock, askCode: async () => { clock = T0 + 120_000; return '123456'; } }));
    expect(r4).toEqual({ k: 'failed', why: 'unknown', kept: true });
    expect(readNewKeyIntent(s3)).toMatchObject({ op: 'abc123def0', at: T0 + 120_000, alias: 'hoody hub api-example-invalid 2026-11-12 abc123def0' });
  });

  test('lost answer', async () => {
    const s = open(), api = fakeApi({ drop: 1 });
    let clock = T0;
    expect(await mintNewKey(deps(s, api.send, { now: () => clock }))).toEqual({ k: 'failed', why: 'unknown', kept: true });
    expect(api.table).toHaveLength(1);
    expect(readNewKeyIntent(s)).toMatchObject({ op: 'abc123def0', at: T0 });
    // A 2xx with no id is the same: kept for the name lookup.
    // Next start: found by its full name, revoked, then a new key is minted.
    clock = T0 + 5_000;
    const r = await mintNewKey(deps(s, api.send, { now: () => clock, opId: () => 'zzz999yyy0' }));
    expect(r.k).toBe('ok');
    expect(api.table.map((t) => t.alias)).toEqual(['hoody hub api-example-invalid 2026-11-12 zzz999yyy0']);
    const noId = fakeApi({ noId: true });
    const s2 = fresh();
    expect(await mintNewKey(deps(s2, noId.send))).toEqual({ k: 'failed', why: 'unknown', kept: true });
    expect(readNewKeyIntent(s2)).toMatchObject({ op: 'abc123def0' });
    expect((readNewKeyIntent(s2) as { id?: string }).id).toBeUndefined();
  });

  test('lookup rules', async () => {
    const s = open();
    const alias = newKeyAlias('api.example.invalid', T0, 'abc123def0')!;
    s.set(NEW_KEY_KEY, JSON.stringify({ op: 'abc123def0', alias, at: T0 }));
    const base = { mode: storeModeOf(s), area: s, requestDeadlineMs: DEADLINE } as const;
    // A failed lookup (no answer, 5xx, a truncated list): kept, and the mint sends nothing.
    for (const api of [fakeApi({ noAnswer: { GET: 2 } }), fakeApi({ fail: { GET: 503 } })]) {
      expect(await settleNewKey({ ...base, send: api.send, now: () => T0 + 600_000 })).toEqual({ k: 'kept', why: 'lookup' });
      const m = await mintNewKey(deps(s, api.send, { now: () => T0 + 600_000 }));
      expect(m).toEqual({ k: 'refused', why: 'unsettled' });
      expect(api.sent.filter((x) => x.method === 'POST')).toEqual([]);
    }
    const truncated: NewKeySend = async () => ({ status: 200, body: { data: [], truncated: true } });
    expect(await settleNewKey({ ...base, send: truncated, now: () => T0 + 600_000 })).toEqual({ k: 'kept', why: 'lookup' });
    // Empty too soon after the mint: kept (it may still land).
    const empty = fakeApi();
    const edge = T0 + DEADLINE + NEW_KEY_LAND_MARGIN_MS;
    expect(await settleNewKey({ ...base, send: empty.send, now: () => edge })).toEqual({ k: 'kept', why: 'young' });
    expect(s.get(NEW_KEY_KEY)).not.toBeNull();
    // Empty after it: settled, the intent dropped.
    expect(await settleNewKey({ ...base, send: empty.send, now: () => edge + 1 })).toEqual({ k: 'settled', revoked: 0 });
    expect(s.get(NEW_KEY_KEY)).toBeNull();
    // A match whose revoke fails: kept.
    s.set(NEW_KEY_KEY, JSON.stringify({ op: 'abc123def0', alias, at: T0 }));
    const held = fakeApi({ fail: { DELETE: 500 } });
    held.table.push({ id: 'f'.repeat(24), alias, token: 'x', realm_ids: [REALM], permissions: {}, expires_at: '' }, { id: 'e'.repeat(24), alias: `${alias}x`, token: 'y', realm_ids: [REALM], permissions: {}, expires_at: '' });
    expect(await settleNewKey({ ...base, send: held.send, now: () => T0 + 1 })).toEqual({ k: 'kept', why: 'revoke' });
    // Revoke works: only the exact name is revoked.
    const ok = fakeApi();
    ok.table.push(...held.table);
    expect(await settleNewKey({ ...base, send: ok.send, now: () => T0 + 1 })).toEqual({ k: 'settled', revoked: 1 });
    expect(ok.table.map((t) => t.id)).toEqual(['e'.repeat(24)]);
    // An intent of another shape (or a credential-shaped one) is unread: kept, nothing sent.
    s.set(NEW_KEY_KEY, JSON.stringify({ op: 'abc123def0', alias, at: T0, token: 'hdy_aaaaaaaaaaaa' }));
    const none = fakeApi();
    expect(await settleNewKey({ ...base, send: none.send })).toEqual({ k: 'kept', why: 'unread' });
    expect(none.sent).toEqual([]);
    s.set(NEW_KEY_KEY, JSON.stringify({ op: 'abc123def0', alias, at: T0, note: 'x' }));
    expect(await settleNewKey({ ...base, send: none.send })).toEqual({ k: 'kept', why: 'unread' });
    // A recorded id whose key is already gone (404) settles; one whose revoke fails is kept.
    s.set(NEW_KEY_KEY, JSON.stringify({ op: 'abc123def0', alias, at: T0, id: 'a'.repeat(24) }));
    const down = fakeApi({ fail: { DELETE: 503 } });
    expect(await settleNewKey({ ...base, send: down.send })).toEqual({ k: 'kept', why: 'revoke' });
    expect(await mintNewKey(deps(s, down.send))).toEqual({ k: 'refused', why: 'unsettled' });
    expect(down.sent.filter((x) => x.method === 'GET' || x.method === 'POST')).toEqual([]);
    expect(await settleNewKey({ ...base, send: none.send })).toEqual({ k: 'settled', revoked: 1 });
    expect(s.get(NEW_KEY_KEY)).toBeNull();
  });

  test('leave', async () => {
    const s = open(), api = fakeApi();
    const r = await mintNewKey(deps(s, api.send));
    if (r.k !== 'ok') throw new Error('mint');
    const alias = readNewKeyIntent(s) as { alias: string };
    // One failure, then the retry removes it.
    const flaky = fakeApi({ noAnswer: { DELETE: 1 } });
    flaky.table.push(...api.table);
    const out = await revokeNewKeyOnLeave({ mode: 'rw', area: s, send: flaky.send, requestDeadlineMs: DEADLINE, id: r.id, alias: alias.alias, expiresAt: r.expires_at, removeWith: 'hoody tokens delete' });
    expect(out).toEqual({ ok: true, line: LEAVE_LINES.removed });
    expect(flaky.sent.filter((x) => x.method === 'DELETE')).toHaveLength(2);
    expect(s.get(NEW_KEY_KEY)).toBeNull();
    // Two failures: one line naming the key, its expiry and the command; the intent stays.
    const s2 = fresh();
    const api2 = fakeApi();
    const r2 = await mintNewKey(deps(s2, api2.send));
    if (r2.k !== 'ok') throw new Error('mint');
    const down = fakeApi({ fail: { DELETE: 503 } });
    const out2 = await revokeNewKeyOnLeave({ mode: 'rw', area: s2, send: down.send, requestDeadlineMs: DEADLINE, id: r2.id, alias: 'hoody hub api-example-invalid 2026-11-12 abc123def0', expiresAt: r2.expires_at, removeWith: 'hoody tokens delete' });
    expect(out2.ok).toBe(false);
    expect(out2.line).toBe(`The Hub's access key "hoody hub api-example-invalid 2026-11-12 abc123def0" could not be removed; it expires at ${r2.expires_at}. Remove it with \`hoody tokens delete\`.`);
    expect(out2.line).not.toContain(r2.token);
    expect(down.sent.filter((x) => x.method === 'DELETE')).toHaveLength(2);
    expect(readNewKeyIntent(s2)).toMatchObject({ id: r2.id });
  });

  test('crash cleanup', async () => {
    const s = open(), api = fakeApi();
    const r = await mintNewKey(deps(s, api.send));
    if (r.k !== 'ok') throw new Error('mint');
    // The mount crashed (no leave). A second instance while the first still holds the lock revokes nothing.
    const second = open();
    expect(await settleNewKey({ mode: storeModeOf(second), area: second, send: api.send, requestDeadlineMs: DEADLINE })).toEqual({ k: 'kept', why: 'not-holder' });
    expect(api.table).toHaveLength(1);
    // The next start that holds the lock revokes the recorded id (no lookup) and mints anew.
    s.close(); second.close(); stores.splice(0);
    const next = open();
    const before = api.sent.length;
    const r2 = await mintNewKey(deps(next, api.send, { opId: () => 'n3wn3wn3w0' }));
    expect(r2.k).toBe('ok');
    expect(api.sent.slice(before).map((x) => x.method)).toEqual(['DELETE', 'POST']);
    expect(api.table.map((t) => t.alias)).toEqual(['hoody hub api-example-invalid 2026-11-12 n3wn3wn3w0']);
  });

  test('store fails, 5xx', async () => {
    const s = open(), api = fakeApi();
    // The intent cannot be written: nothing is sent.
    const bad = { readOnly: null, failed: () => false, get: (k: string) => s.get(k), set: () => { throw new Error('disk'); }, del: (k: string) => s.del(k) } as unknown as HubStore;
    expect(await mintNewKey(deps(bad, api.send))).toEqual({ k: 'refused', why: 'store' });
    expect(api.sent.filter((x) => x.method === 'POST')).toEqual([]);
    // A 5xx answer to the mint: the outcome is unknown, the intent stays for the name lookup.
    const sent: string[] = [];
    const busy: NewKeySend = async (method) => { sent.push(method); return method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} }; };
    expect(await mintNewKey(deps(s, busy))).toEqual({ k: 'failed', why: 'unknown', kept: true });
    expect(readNewKeyIntent(s)).toMatchObject({ op: 'abc123def0', at: T0 });
  });

  test('helpers', () => {
    expect(leavesTree(['a.b', 'a.c.d'])).toEqual({ a: { b: true, c: { d: true } } });
    expect(leavesTree(['a.b', 'a.b.c'])).toBeNull();
    expect(leavesTree(['a.b.c', 'a.b'])).toBeNull();
    expect(leavesTree(['A.b'])).toBeNull();
    expect(newKeyAlias('api.example.com', T0, 'abc123def0')).toBe('hoody hub api-example-com 2026-11-12 abc123def0');
    expect(newKeyAlias('evil host', T0, 'abc123def0')).toBeNull();
    expect(newKeyAlias('a:b:c', T0, 'abc123def0')).toBeNull();
    expect(newKeyAlias('api.example.com:8443', T0, 'abc123def0')).toBe('hoody hub api-example-com-8443 2026-11-12 abc123def0');
    expect(newKeyAlias('api.example.com', T0, 'ABC')).toBeNull();
  });

  // The API's token-create schema: alias pattern ^[a-zA-Z0-9 _-]*$, maxLength 254.
  test('every key name passes the API alias rule', () => {
    expect(ALIAS_API.source).toBe('^[a-zA-Z0-9 _-]*$');
    expect(ALIAS_API_MAX).toBe(254);
    const hosts = ['api.example.com', 'api.example.com:8443', '127.0.0.1:3000', 'localhost', 'a-b.c-d.example', `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.dd:65535`];
    for (const h of hosts) for (const at of [0, T0, Date.parse('9999-12-31T23:59:59Z')]) {
      const a = newKeyAlias(h, at, 'abc123def0');
      expect(a, h).not.toBeNull();
      expect(/^[a-zA-Z0-9 _-]*$/.test(a!), a!).toBe(true);
      expect(a!.length).toBeLessThanOrEqual(254);
    }
  });
});
