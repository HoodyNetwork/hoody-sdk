// load() lists GET /realms plus the realms the alias map names; readRealmAliases
// reads the map (no map, 404, is empty; any other failure rejects); index exports the realm alias surface.
// A load commits only when it is the latest and its generation is alive; a failed alias read
// keeps the last aliases and skips the alias-based fallback (the restore check at boot still runs); a rename wins over
// an older read.
// A selection restored at boot opens only if GET /realms lists it; the tests of a selection
// GET /realms omits make it on this page (a switch); realm.asks9r3.test.ts covers the restore.
import { describe, expect, it } from 'vitest';
import * as core from './index';
import { gen, realm as selected } from './ctx';
import * as realm from './realm';
import { count, list, load, onRealmNotice, readRealmAliases, reloadRealmAliases, setAlias, switchTo, type RealmNotice } from './realm';
import { boot, calls, deferred, hostOf, onFetch, R1, R2, settle } from './test/env';

const R3 = 'ccccccccccccccccccccccc3';
const VAULT = '/api/v1/vault/keys/hoody.realm-aliases';
// The map's read carries its ETag, as the API's does (a rename refuses a read without one).
const aliasReply = (m: Record<string, string>) => ({ status: 200, body: { data: { value: JSON.stringify(m) } }, headers: { etag: '"aliases-v1"' } });
const realmsOf = (ids: string[], usage: Record<string, number> = {}) => ({ status: 200, body: { data: { realm_ids: ids, usage: Object.fromEntries(Object.entries(usage).map(([k, n]) => [k, { computers: n }])) } } });
const isVault = (url: string): boolean => url.includes('/vault/keys/');
/** The realm R3, named only by the alias map, selected by a switch on this page (never restored at boot). */
async function switchedToAliasOnly(): Promise<void> {
  boot({ realm: 'all' });
  onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : isVault(c.url) ? aliasReply({ [R3]: 'Three' }) : { status: 200, body: {} }));
  await load();
  expect(await switchTo(R3)).toBe(true);
}
function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); });
  return seen;
}

describe('the realm list is the union of GET /realms and the alias map', () => {
  it('a realm only the alias map names is listed once, after the listed ones; a listed one is not repeated', async () => {
    boot({ realm: 'all' });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1, R2]) : aliasReply({ [R3]: 'Three', [R1]: 'One' })));
    expect(await load()).toEqual([R1, R2, R3]);
    expect(list()).toEqual([R1, R2, R3]);
  });
  it('a realm named only by the alias map, switched to on this page, stays selected: no fallback, no bump, no notice', async () => {
    await switchedToAliasOnly();
    const seen = notices();
    const g = gen();
    expect(await load()).toEqual([R1, R3]);
    expect([selected(), localStorage.getItem('hub_realm_v1'), gen()]).toEqual([R3, R3, g]);
    expect(seen).toEqual([]);
    expect(core.realmAliases()).toEqual({ [R3]: 'Three' });
  });
  it('a failed alias read lists GET /realms alone when no aliases were read before', async () => {
    boot({ realm: 'all' });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R2]) : { status: 503, body: {} }));
    expect(await load()).toEqual([R2]);
  });
});

describe('what a load may commit', () => {
  it('a switch made while a load waits for the aliases is never undone by that load, and the load commits nothing', async () => {
    boot({ realm: 'all' });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1, R3], { [R1]: 1 }) : aliasReply({ [R3]: 'Three' })));
    await load();
    const slow = deferred();
    // The waiting load's own answer differs in every part: another list and other counts.
    onFetch(async (c) => { if (isVault(c.url)) { await slow.p; return aliasReply({ [R2]: 'Two' }); } return c.url.includes('/realms') ? realmsOf([R2], { [R2]: 7 }) : { status: 200, body: {} }; });
    const late = load();
    await settle();
    expect(await switchTo(R3)).toBe(true);
    const seen = notices();
    const state = () => [list(), core.realmAliases(), count(R1), count(R2), selected(), localStorage.getItem('hub_realm_v1'), gen()];
    const before = state();
    expect(before).toEqual([[R1, R3], { [R3]: 'Three' }, 1, null, R3, R3, gen()]);
    slow.res();
    await late;
    await settle();
    expect(state()).toEqual(before);
    expect(seen).toEqual([]);
  });
  it('an older load whose alias read finishes last never replaces the newer list or its counts', async () => {
    boot({ realm: 'all' });
    const slow = deferred();
    let n = 0, v = 0;
    onFetch(async (c) => {
      if (c.url.includes('/realms')) return ++n === 1 ? realmsOf([R1], { [R1]: 2 }) : realmsOf([R2], { [R2]: 7 });
      if (++v === 1) { await slow.p; return aliasReply({}); } // the older load's alias read
      return aliasReply({ [R3]: 'Three' });
    });
    const older = load();
    await settle();
    expect(await load()).toEqual([R2, R3]);
    slow.res();
    await older;
    expect([list(), count(R2), count(R1), count('all')]).toEqual([[R2, R3], 7, null, 7]);
  });
  it('an older load whose GET /realms finishes last never replaces the newer list or its counts', async () => {
    boot({ realm: 'all' });
    const slow = deferred();
    let n = 0;
    onFetch(async (c) => {
      if (c.url.includes('/realms')) { if (++n === 1) { await slow.p; return realmsOf([R1], { [R1]: 2 }); } return realmsOf([R2], { [R2]: 7 }); }
      return aliasReply({});
    });
    const older = load();
    await settle();
    expect(await load()).toEqual([R2]);
    slow.res();
    await older;
    expect([list(), count(R2), count(R1), count('all')]).toEqual([[R2], 7, null, 7]);
  });
  it('a failed alias read keeps the last aliases, so a selected alias-only realm stays listed and selected', async () => {
    await switchedToAliasOnly();
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : { status: 503, body: {} }));
    const g = gen();
    expect(await load()).toEqual([R1, R3]);
    expect([selected(), gen()]).toEqual([R3, g]);
    expect(seen).toEqual([]);
  });
  it('a failed alias read with no aliases read before never falls back a realm switched to on this page', async () => {
    boot({ realm: 'all' });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : isVault(c.url) ? { status: 503, body: {} } : { status: 200, body: {} }));
    expect(await switchTo(R3)).toBe(true);
    const g = gen();
    await load();
    expect([selected(), gen()]).toEqual([R3, g]);
  });
  it('a rename made while a load waits for the aliases is kept over that load\'s older read', async () => {
    boot({ realm: 'all' });
    const slow = deferred();
    let first = true;
    onFetch(async (c) => {
      if (c.url.includes('/realms')) return realmsOf([R1]);
      if (c.method === 'GET' && first) { first = false; await slow.p; return aliasReply({}); }
      return c.method === 'GET' ? aliasReply({}) : { status: 200, body: {} };
    });
    const late = load();
    await settle();
    await setAlias(R1, 'One');
    slow.res();
    await late;
    expect(core.realmAliases()).toEqual({ [R1]: 'One' });
  });
});

describe('reloadRealmAliases: the names shown are read again', () => {
  it('shows the stored map and tells the views; an emptied map empties the names', async () => {
    boot({ realm: 'all' });
    let map: Record<string, string> = { [R1]: 'Before' };
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : Object.keys(map).length ? aliasReply(map) : { status: 404, body: {} }));
    await load();
    expect(core.realmAliases()).toEqual({ [R1]: 'Before' });
    let looks = 0;
    onRealmNotice((n) => { if (n.kind === 'look') looks++; });
    map = { [R1]: 'After', [R2]: 'Two' };
    calls.length = 0;
    await reloadRealmAliases();
    expect(core.realmAliases()).toEqual({ [R1]: 'After', [R2]: 'Two' });
    expect(looks).toBe(1);
    // One read of the map on the base host; nothing is written.
    expect(calls.map((c) => [c.method, hostOf(c.url), c.url])).toEqual([['GET', 'base', VAULT]]);
    map = {};
    await reloadRealmAliases();
    expect(core.realmAliases()).toEqual({});
  });
  it('a failed read rejects and keeps the names; no view is told', async () => {
    boot({ realm: 'all' });
    let down = false;
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : down ? { status: 503, body: {} } : aliasReply({ [R1]: 'One' })));
    await load();
    let looks = 0;
    onRealmNotice((n) => { if (n.kind === 'look') looks++; });
    down = true;
    await expect(reloadRealmAliases()).rejects.toBeTruthy();
    expect(core.realmAliases()).toEqual({ [R1]: 'One' });
    expect(looks).toBe(0);
    await settle();
  });
  it('a rename made while the read is out wins over that older read', async () => {
    boot({ realm: 'all' });
    const slow = deferred();
    let hold = false;
    onFetch(async (c) => {
      if (c.url.includes('/realms')) return realmsOf([R1]);
      if (c.method === 'GET' && hold) { hold = false; await slow.p; return aliasReply({ [R1]: 'Old' }); }
      return c.method === 'GET' ? aliasReply({}) : { status: 200, body: {} };
    });
    await load();
    hold = true;
    const late = reloadRealmAliases();
    await settle();
    await setAlias(R1, 'New');
    slow.res();
    await late;
    expect(core.realmAliases()).toEqual({ [R1]: 'New' });
  });
});

describe('readRealmAliases', () => {
  it('reads the map on the base host', async () => {
    boot({ realm: R1 });
    onFetch(() => aliasReply({ [R2]: 'Two' }));
    expect(await readRealmAliases()).toEqual({ [R2]: 'Two' });
    expect(calls.map((c) => [c.method, hostOf(c.url), c.url])).toEqual([['GET', 'base', VAULT]]);
  });
  it('no map (404) is empty; any other failure rejects', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, body: {} }));
    expect(await readRealmAliases()).toEqual({});
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {} }));
    await expect(readRealmAliases()).rejects.toBeTruthy();
    await settle();
  });
});

describe('index exports', () => {
  it('names the realm alias surface, each the realm module\'s own function', () => {
    expect([core.setRealmAlias, core.setRealmTint, core.loadRealms, core.validateRealmAliases, core.foldRealmAlias, core.realmAliases, core.readRealmAliases])
      .toEqual([realm.setAlias, realm.setTint, realm.load, realm.validateRealmAliases, realm.foldRealmAlias, realm.aliases, realm.readRealmAliases]);
    expect(core.REALM_PALETTE).toBe(realm.PALETTE);
    const c: core.RealmColor = 'teal';
    expect(c).toBe('teal');
  });
});
