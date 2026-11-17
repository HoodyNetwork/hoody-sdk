// boot.ts: which screen the standalone Hub shows, from what storage holds and what the link chose.
import { describe, expect, it } from 'vitest';
import type { StandaloneApi, StandaloneApiSet, StandaloneChoice } from '@core/origin';
import { decideStart, defaultChoiceUrl, hostOf, siteOf, storedApi, type BootDeps, type StoredAuth } from './boot';
import type { FileMemory } from './fileMemory';

const API: StandaloneApi = { origin: 'https://hoody.test', realmApiDomain: 'api.hoody.test', proxyDomain: 'c.hoody.test' };
const RECORD = JSON.stringify({ v: 1, origin: API.origin, realm: API.realmApiDomain, proxy: API.proxyDomain });
const DEFAULT: StandaloneChoice = { origin: API.origin, asked: 'default' };
const ALT: StandaloneChoice = { origin: 'https://other.hoody.test', asked: 'alt' };

function deps(o: { record?: string | null; auth?: StoredAuth; set?: StandaloneApiSet; choice?: StandaloneChoice | null; throws?: boolean; memory?: FileMemory }): BootDeps & { sets: StandaloneApi[]; reads: number } {
  const sets: StandaloneApi[] = [];
  let held: StandaloneApi | null = null;
  let reads = 0;
  return {
    sets,
    get reads() { return reads; },
    read: () => { reads += 1; if (o.throws) throw new Error('denied'); return o.record ?? null; },
    storedAuth: () => o.auth ?? 'none',
    set: (cfg: StandaloneApi): StandaloneApiSet => { sets.push(cfg); const r = o.set ?? 'set'; if (r === 'set') held = cfg; return r; },
    current: () => held,
    choice: () => (o.choice === undefined ? DEFAULT : o.choice),
    memory: () => o.memory ?? 'off',
  };
}
const blocked = (why: 'signed_in' | 'storage' | 'memory' | 'invalid', choice: StandaloneChoice | null = DEFAULT) => ({ kind: 'first-run', step: 'blocked', why, choice });

describe('decideStart', () => {
  it('a stored session opens the Hub on its own Hoody', () => {
    for (const auth of ['account', 'token'] as const) {
      const d = deps({ record: RECORD, auth });
      expect(decideStart(d)).toEqual({ kind: 'app', api: API });
      expect(d.sets).toEqual([API]);
    }
  });

  it('a stored session keeps its Hoody whatever the link asks', () => {
    for (const choice of [ALT, { origin: API.origin, asked: 'refused' } as const, { origin: 'http://localhost:3000', asked: 'local' } as const]) {
      const d = deps({ record: RECORD, auth: 'account', choice });
      expect(decideStart(d)).toEqual({ kind: 'app', api: API });
      expect(d.sets).toEqual([API]);
    }
  });

  it('no session: sign in to the link\'s choice, nothing named yet, whatever record is stored', () => {
    for (const record of [null, RECORD]) {
      const d = deps({ record });
      expect(decideStart(d)).toEqual({ kind: 'first-run', step: 'sign-in', choice: DEFAULT });
      expect(d.sets).toEqual([]);
      expect(decideStart(deps({ record, choice: ALT }))).toEqual({ kind: 'first-run', step: 'sign-in', choice: ALT });
    }
  });

  it('a session with no Hoody on record never opens the Hub: it asks to sign out first', () => {
    const d = deps({ auth: 'account' });
    expect(decideStart(d)).toEqual(blocked('signed_in'));
    expect(d.sets).toEqual([]);
  });

  it('a stored record shared.js refuses is never used, and nothing rewrites it', () => {
    expect(decideStart(deps({ record: RECORD, auth: 'account', set: 'signed_in' }))).toEqual(blocked('signed_in'));
    // Not a bug: a record naming an origin this file does not list (shared.js answers 'invalid') reads as no record,
    // so a session beside it cannot be placed: "Sign out first", and only that one set attempt, which writes nothing.
    const d = deps({ record: RECORD, auth: 'token', set: 'invalid', choice: ALT });
    expect(decideStart(d)).toEqual(blocked('signed_in', ALT));
    expect(d.sets).toEqual([API]);
    expect(decideStart(deps({ record: RECORD, auth: 'account', set: 'storage' }))).toEqual(blocked('storage'));
  });

  it('a file page whose stores could not be kept in memory never reads storage or signs in', () => {
    const d = deps({ record: RECORD, auth: 'account', memory: 'failed' });
    expect(decideStart(d)).toEqual(blocked('memory'));
    expect(d.sets).toEqual([]);
    expect(d.reads).toBe(0);
  });

  it('a file page kept in memory decides as any other', () => {
    expect(decideStart(deps({ record: RECORD, auth: 'token', memory: 'on' }))).toEqual({ kind: 'app', api: API });
  });

  it('unreadable storage says so; an unreadable record reads as none', () => {
    expect(decideStart(deps({ auth: 'unreadable' }))).toEqual(blocked('storage'));
    expect(decideStart(deps({ throws: true }))).toEqual({ kind: 'first-run', step: 'sign-in', choice: DEFAULT });
    expect(decideStart(deps({ throws: true, auth: 'account' }))).toEqual(blocked('signed_in'));
  });

  it('no Hoody this file lists (a page that did not load completely): no sign-in', () => {
    expect(decideStart(deps({ choice: null }))).toEqual(blocked('invalid', null));
  });
});

describe('storedApi', () => {
  it('reads the record shared.js writes, and nothing else', () => {
    expect(storedApi(() => RECORD)).toEqual(API);
    for (const bad of ['', 'x', '[]', '{"v":2,"origin":"https://a.test"}', '{"v":1}', 'null']) expect([bad, storedApi(() => bad)]).toEqual([bad, null]);
  });
});

describe('defaultChoiceUrl', () => {
  it('drops every hoody key as written and keeps the rest of the address as written', () => {
    expect(defaultChoiceUrl('https://files.example/hub/hoody-hub.html?hoody=dev')).toBe('https://files.example/hub/hoody-hub.html');
    expect(defaultChoiceUrl('file:///home/me/hoody-hub.html?x=1&hoody=localhost:3000&hoody=dev#/billing')).toBe('file:///home/me/hoody-hub.html?x=1#/billing');
    expect(defaultChoiceUrl('https://files.example/hoody-hub.html?hoody&a=%20b')).toBe('https://files.example/hoody-hub.html?a=%20b');
    expect(defaultChoiceUrl('https://files.example/hoody-hub.html')).toBe('https://files.example/hoody-hub.html');
    expect(defaultChoiceUrl('https://files.example/hoody-hub.html#/?hoody=dev')).toBe('https://files.example/hoody-hub.html#/?hoody=dev');
  });
});

describe('hostOf and siteOf', () => {
  it('the host of an origin, and the site a person knows: without a leading api. label', () => {
    expect(hostOf('https://api.example.test:8443')).toBe('api.example.test:8443');
    expect(siteOf('https://api.example.test')).toBe('example.test');
    expect(siteOf('https://other.example.test')).toBe('other.example.test');
    expect(siteOf('http://localhost:3000')).toBe('localhost:3000');
    expect(siteOf('https://api.test')).toBe('api.test');
  });
});
