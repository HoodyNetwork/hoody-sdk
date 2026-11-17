// realm.ts: selection, switching with a probe, fallback, teardown order, aliases, colours, rows.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { api, setOtpPrompt } from './api';
import { alive, capture, gen, realm as selected, startLoggingOut } from './ctx';
import {
  aliasRules, count, endAccount, filterRows, load, noAccessRealm, onRealmNotice, PALETTE, onTeardown, parseRealmAliases, rowRealms, setAlias, setTint,
  switchTo, tint, validateRealmAliases, type RealmNotice,
} from './realm';
import { defineRoute } from './routes';
import { boot, calls, deferred, DOMAIN, hostOf, onFetch, OTHER, R1, R2, sessionToken, settle } from './test/env';
import { monorepoPath } from './test/monorepo';

function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); });
  return seen;
}
const realmsReply = (ids: string[]) => ({ status: 200, body: { data: { realm_ids: ids, usage: { [R1]: { computers: 2 }, [R2]: { computers: 3 } } } } });

describe('stored selection', () => {
  it('anything but a 24-hex id reads as all', () => {
    localStorage.setItem('hub_realm_v1', 'nope');
    boot({ realm: undefined });
    expect(selected()).toBe('all');
  });
  it('a stored realm neither the API lists nor the alias map names falls back to all, stores it, bumps and says so', async () => {
    boot({ realm: R1 });
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? realmsReply([R2]) : { status: 404, body: {} }));
    const g = gen();
    await load();
    expect(selected()).toBe('all');
    expect(localStorage.getItem('hub_realm_v1')).toBe('all');
    expect(gen()).toBe(g + 1);
    expect(seen).toEqual([{ kind: 'realm-gone' }]);
  });
  it('a listed realm is kept; the list is read from the base host with usage counts', async () => {
    boot({ realm: R1 });
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? realmsReply([R1, R2]) : { status: 404, body: {} }));
    await load();
    expect(selected()).toBe(R1);
    expect(seen).toEqual([]);
    expect(calls.filter((c) => c.url.includes('/realms')).map((c) => [hostOf(c.url), c.url.split('?')[1]])).toEqual([['base', 'include_usage=true']]);
    expect([count(R1), count(R2), count('all')]).toEqual([2, 3, 5]);
  });
});

describe('switching', () => {
  it('probes the target host, then stores the selection and bumps once', async () => {
    boot({ realm: R1 });
    const g = gen();
    expect(await switchTo(R2)).toBe(true);
    expect(calls.map((c) => [hostOf(c.url), c.url.replace(/^https:\/\/[^/]+/, '')])).toEqual([[`${R2}.${DOMAIN}`, '/api/v1/projects?page=1&limit=1']]);
    expect(selected()).toBe(R2);
    expect(localStorage.getItem('hub_realm_v1')).toBe(R2);
    expect(gen()).toBe(g + 1);
  });
  it('a target that does not answer changes nothing and says so', async () => {
    boot({ realm: R1 });
    const seen = notices();
    onFetch(() => ({ status: 503, body: {} }));
    const g = gen();
    expect(await switchTo(R2)).toBe(false);
    expect([selected(), gen()]).toEqual([R1, g]);
    expect(seen).toEqual([{ kind: 'switch-failed', target: R2, current: R1 }]);
  });
  it('a newer switch supersedes an older probe', async () => {
    boot({ realm: R1 });
    const slow = deferred();
    onFetch(async (c) => { if (c.url.includes(R2)) await slow.p; return { status: 200, body: {} }; });
    const first = switchTo(R2);
    await settle();
    expect(await switchTo('all')).toBe(true);
    slow.res();
    expect(await first).toBe(false);
    expect(selected()).toBe('all');
  });
  it('all needs no probe; a value that is not all or 24-hex is not a selection', async () => {
    boot({ realm: R1 });
    expect(await switchTo('all')).toBe(true);
    expect(calls.length).toBe(0);
    expect(await switchTo('global')).toBe(false);
    expect(await switchTo(R1.toUpperCase())).toBe(false);
  });
  it('a switch tears views down and closes the 2FA prompt before the generation moves', async () => {
    boot({ realm: R1 });
    const order: string[] = [];
    onTeardown((r) => order.push('teardown:' + r + ':' + gen()));
    setOtpPrompt({ ask: async () => null, cancel: () => order.push('otp:' + gen()) });
    const g = gen();
    await switchTo(R2);
    expect(order).toEqual([`teardown:switch:${g}`, `otp:${g}`]);
    setOtpPrompt(null);
  });
  for (const [name, change] of [
    ['sign-out', () => startLoggingOut()],
    ['the account ended', () => endAccount('signout')],
    ['another user signed in', () => localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'sid0000000000002' }))],
    ['the same user signed in again (new sid)', () => localStorage.setItem('access_token', sessionToken('64f0c0ffee0000000000c0de', { sid: 'sid0000000000009' }))],
  ] as const) {
    it(`a probe that answers after ${name} commits nothing`, async () => {
      boot({ realm: R1 });
      const d = deferred();
      onFetch(async () => { await d.p; return { status: 200, body: {} }; });
      const p = switchTo(R2);
      await settle();
      change();
      d.res();
      expect(await p).toBe(false);
      expect(localStorage.getItem('hub_realm_v1')).not.toBe(R2);
    });
  }
});

describe('endAccount', () => {
  it('once per page: teardown, then the bump; every context dies', () => {
    boot({ realm: R1 });
    const ctx = capture();
    const order: string[] = [];
    onTeardown((r) => order.push(r + ':' + gen()));
    const g = gen();
    expect(endAccount('logout')).toBe(true);
    expect(endAccount('logout')).toBe(false);
    expect(order).toEqual([`logout:${g}`]);
    expect(gen()).toBe(g + 1);
    expect(alive(ctx)).toBe(false);
  });
  it('every purge (clearAuthTokens) ends the account before storage goes', async () => {
    boot({ realm: R1 });
    const seen: Array<string | null> = [];
    onTeardown(() => seen.push(localStorage.getItem('access_token') ? 'token' : null));
    const { clearAuthTokens } = await import('./session');
    clearAuthTokens();
    expect(seen).toEqual(['token']);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('hub_realm_v1')).toBeNull();
    expect(await switchTo(R2)).toBe(false);
  });
});

describe('colours (local)', () => {
  it('invalid stored entries are dropped; a valid one is kept; unset colours derive from the id', () => {
    boot({ realm: R1, storage: { hub_realm_colors: JSON.stringify({ [R1]: 'blue', [R2]: 'neon', x: 'red' }) } });
    expect(tint(R1)).toBe('blue');
    expect(tint(R2)).toBe(PALETTE[parseInt(R2.slice(-6), 16) % PALETTE.length]);
    expect(tint('nope')).toBe('');
    boot({ realm: R1, storage: { hub_realm_colors: '{bad' } });
    expect(tint(R1)).toBe(PALETTE[parseInt(R1.slice(-6), 16) % PALETTE.length]);
  });
  it('picking a colour writes only hub_realm_colors and sends nothing', () => {
    boot({ realm: R1 });
    expect(setTint(R1, 'teal')).toBe(true);
    expect(setTint(R1, 'neon' as never)).toBe(false);
    expect(JSON.parse(localStorage.getItem('hub_realm_colors') || '{}')).toEqual({ [R1]: 'teal' });
    expect(tint(R1)).toBe('teal');
    expect(calls.length).toBe(0);
  });
});

describe('rows and 403', () => {
  it('row realms: realm_ids, else a top-level realm, else bot.realm', () => {
    expect(rowRealms({ realm_ids: [R1, 'x', R2] })).toEqual([R1, R2]);
    expect(rowRealms({ realm: 'global' })).toEqual(['global']);
    expect(rowRealms({ bot: { realm: R2 } })).toEqual([R2]);
    expect(rowRealms(null)).toEqual([]);
  });
  it('all keeps every row; a realm keeps only its own', () => {
    const rows = [{ realm_ids: [R1] }, { realm_ids: [R2] }, { realm: R1 }];
    expect(filterRows(rows, 'all').length).toBe(3);
    expect(filterRows(rows, R1)).toEqual([rows[0], rows[2]]);
  });
  it('"Open in" only for a known realm other than the selection', () => {
    boot({ realm: R1 });
    expect(noAccessRealm(R2)).toBe(R2);
    expect(noAccessRealm(R1)).toBeNull();
    expect(noAccessRealm(undefined)).toBeNull();
    expect(calls.length).toBe(0);
  });
});

// ---- aliases ----
const SIDECAR_AT = monorepoPath(process.env.HOODY_SIDECAR_METHODS, 'hoody-sdk-generator', 'hoody-sdk', 'sidecar', 'methods.ts');
const SIDECAR = SIDECAR_AT ?? '';

// Outside the monorepo there is no sidecar to compare with: skipped. Inside it a missing file fails.
describe.skipIf(SIDECAR_AT === null)('aliases: the rules are the sidecar rules', () => {
  it('the sidecar source is present (a missing file is a failure, not a skip)', () => expect(existsSync(SIDECAR)).toBe(true));
  const src = existsSync(SIDECAR) ? readFileSync(SIDECAR, 'utf8') : '';
  it('same vault key, maximum length, reserved words', () => {
    expect(/const REALM_ALIASES_VAULT_KEY = '([^']+)'/.exec(src)?.[1]).toBe(aliasRules.key);
    expect(Number(/const REALM_ALIAS_MAX_LEN = (\d+);/.exec(src)?.[1])).toBe(aliasRules.maxLen);
    const m = /RESERVED_REALM_ALIASES[^=]*= new Set\(\[([^\]]*)\]\)/.exec(src);
    const words = (m?.[1] ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    expect([...words].sort()).toEqual([...aliasRules.reserved].sort());
  });
  it('same invisible ranges, id pattern and control rule', () => {
    const block = /const INVISIBLE_RANGES[^=]*= \[([\s\S]*?)\n\];/.exec(src)?.[1] ?? '';
    const ranges = [...block.matchAll(/\[(0x[0-9a-f]+),\s*(0x[0-9a-f]+)\]/gi)].map((r) => [parseInt(r[1] as string, 16), parseInt(r[2] as string, 16)]);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges).toEqual(aliasRules.invisible.map((r) => [r[0], r[1]]));
    const entry = /function validAliasEntry[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(entry).toContain(`/${aliasRules.idPattern}/`);
    expect(entry).toContain(`/${aliasRules.control}/`);
  });
});

const ZWSP = '​', BOM = '﻿', SHY = '­', RLO = '‮', TAG = '\u{e0041}';
const REFUSED: Array<[string, unknown, string]> = [
  ['all', 'all', 'reserved'], ['none', 'none', 'reserved'], ['every', 'every', 'reserved'], ['any', 'any', 'reserved'], ['global', 'global', 'reserved'],
  ['All', 'All', 'reserved'], ['GLOBAL', 'GLOBAL', 'reserved'], ['a<ZWSP>ll', 'a' + ZWSP + 'll', 'reserved'], ['<BOM>none', BOM + 'none', 'reserved'],
  ['ev<SHY>ery', 'ev' + SHY + 'ery', 'reserved'], ['<RLO>any', RLO + 'any', 'reserved'], ['glob<TAG>al', 'glob' + TAG + 'al', 'reserved'],
  ['  any  ', '  any  ', 'reserved'], ['65 chars', 'x'.repeat(65), 'length'], ['newline', 'a\nb', 'control'], ['DEL', 'a\x7fb', 'control'],
  ['C1', 'a\x85b', 'control'], ['number', 7, 'control'],
];
const ACCEPTED = ['Production', 'all hands', 'Team Global', 'allow', 'tallness', 'nonexistent', 'globally', 'everyone', 'x'.repeat(64), 'Prod ✓'];

describe('aliases: the sidecar vectors', () => {
  for (const [label, v, reason] of REFUSED) {
    it(`refuses ${label} (${reason})`, () => {
      let err: unknown;
      try { validateRealmAliases({ [R1]: v }); } catch (e) { err = e; }
      expect(err).toMatchObject({ code: 'ALIAS_INVALID', reason, id: R1, notSent: true });
    });
  }
  for (const v of ACCEPTED) it(`accepts ${JSON.stringify(v.slice(0, 12))}`, () => expect(validateRealmAliases({ [R1]: v })).toEqual({ [R1]: v }));
  it('an empty alias is a removal; a bad id or shape is refused; the reserved refusal names the folded word', () => {
    expect(validateRealmAliases({ [R1]: '', [R2]: 'B' })).toEqual({ [R2]: 'B' });
    expect(() => validateRealmAliases({ [R1.toUpperCase()]: 'A' })).toThrow();
    expect(() => validateRealmAliases(['x'])).toThrow();
    let err: { word?: string } = {};
    try { validateRealmAliases({ [R1]: ' A' + ZWSP + 'll ' }); } catch (e) { err = e as { word?: string }; }
    expect(err.word).toBe('all');
  });
  it('a corrupt stored map reads as nothing; invalid entries are dropped one by one', () => {
    for (const raw of ['', '{', '[]', 'null', '"x"', 7]) expect(parseRealmAliases(raw)).toEqual({});
    expect(parseRealmAliases(JSON.stringify({ [R1]: 'A', [R2]: 'b\nc', zz: 'x' }))).toEqual({ [R1]: 'A' });
  });
});

describe('aliases: rename', () => {
  const VAULT = '/api/v1/vault/keys/hoody.realm-aliases';
  // The API answers the map's read with its ETag (a read without one is refused unsent: realm.ifmatch.test.ts).
  const etag = { etag: '"aliases-v1"' };
  it('reads the map, changes one entry, writes the whole map on the base host', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: { value: JSON.stringify({ [R2]: 'Two' }) } }, headers: etag } : { status: 200, body: {} }));
    expect(await setAlias(R1, 'One')).toEqual({ [R2]: 'Two', [R1]: 'One' });
    expect(calls.map((c) => [c.method, hostOf(c.url), c.url])).toEqual([['GET', 'base', VAULT], ['PUT', 'base', VAULT]]);
    expect(JSON.parse(calls[1]!.body.value)).toEqual({ [R2]: 'Two', [R1]: 'One' });
  });
  it('a corrupt stored value is replaced by a clean map; no map (404) is empty', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: { value: '{bad' } }, headers: etag } : { status: 200, body: {} }));
    await setAlias(R1, 'One');
    expect(JSON.parse(calls[1]!.body.value)).toEqual({ [R1]: 'One' });
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 404, body: {} } : { status: 200, body: {} }));
    expect(await setAlias(R1, 'One')).toEqual({ [R1]: 'One' });
  });
  it('a refused name sends nothing at all', async () => {
    boot({ realm: R1 });
    await expect(setAlias(R1, 'global')).rejects.toMatchObject({ code: 'ALIAS_INVALID', reason: 'reserved' });
    expect(calls.length).toBe(0);
  });
  it('a write whose outcome is unknown is pending, not retried', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 404, body: {} } : { status: 0, network: true }));
    await expect(setAlias(R1, 'One')).rejects.toMatchObject({ kind: 'pending' });
    expect(calls.filter((c) => c.method === 'PUT').length).toBe(1);
  });
});

describe('a call through the realm host after a switch', () => {
  it('uses the new selection', async () => {
    boot({ realm: R1 });
    await switchTo(R2);
    calls.length = 0;
    await api(defineRoute({ method: 'GET', path: '/computers', scope: 'realm' }));
    expect(calls.map((c) => hostOf(c.url))).toEqual([`${R2}.${DOMAIN}`]);
  });
});
