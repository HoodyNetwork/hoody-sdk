// The realm list keeps the realms only the alias map names, but a selection restored
// from storage at boot opens only if GET /realms lists it. One the alias map alone names (an empty realm, or one
// gone or no longer accessible: nothing local tells which) falls back to all realms once, with a 'realm-gone'
// notice marked `restored`, whatever the alias read gave. A switch made on this page is never undone this way.
import { describe, expect, it } from 'vitest';
import { gen, realm as selected } from './ctx';
import { list, load, onRealmNotice, switching, switchTo, type RealmNotice } from './realm';
import { boot, calls, deferred, onFetch, R1, R2, settle } from './test/env';

const R3 = 'ccccccccccccccccccccccc3';
const aliasReply = (m: Record<string, string>) => ({ status: 200, body: { data: { value: JSON.stringify(m) } } });
const realmsOf = (ids: string[]) => ({ status: 200, body: { data: { realm_ids: ids } } });
const isVault = (url: string): boolean => url.includes('/vault/keys/');
const realmsCalls = (): number => calls.filter((c) => c.url.includes('/realms')).length;
/** A world whose answers the test changes as it goes; each switch probe waits until the test answers it. */
function world(start: { realms: string[]; aliases: Record<string, string> }) {
  const w = { ...start, probes: [] as Array<(status: number) => void> };
  onFetch(async (c) => {
    if (c.url.includes('/realms')) return realmsOf(w.realms);
    if (isVault(c.url)) return aliasReply(w.aliases);
    const status = await new Promise<number>((r) => { w.probes.push(r); });
    return { status, body: {} };
  });
  return w;
}
function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); });
  return seen;
}

describe('a restored selection opens only if GET /realms lists it', () => {
  it('a restored realm only the alias map names falls back to all realms once, with one restored notice; it stays listed', async () => {
    boot({ realm: R3 });
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : aliasReply({ [R3]: 'Three' })));
    const g = gen();
    expect(await load()).toEqual([R1, R3]);
    expect([selected(), localStorage.getItem('hub_realm_v1'), gen()]).toEqual(['all', 'all', g + 1]);
    expect(seen).toEqual([{ kind: 'realm-gone', restored: true }]);
    await load();
    expect(seen.length).toBe(1);
    expect(list()).toEqual([R1, R3]);
  });
  it('the same when the alias read fails: the restore needs GET /realms alone', async () => {
    boot({ realm: R3 });
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : { status: 503, body: {} }));
    await load();
    expect([selected(), localStorage.getItem('hub_realm_v1')]).toEqual(['all', 'all']);
    expect(seen).toEqual([{ kind: 'realm-gone' }]);
  });
  it('a restored realm GET /realms lists stays, and later loads keep it even once the list omits it while the aliases name it', async () => {
    boot({ realm: R3 });
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1, R3]) : aliasReply({ [R3]: 'Three' })));
    const g = gen();
    await load();
    expect([selected(), gen()]).toEqual([R3, g]);
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : aliasReply({ [R3]: 'Three' })));
    await load();
    expect([selected(), gen()]).toEqual([R3, g]);
    expect(seen).toEqual([]);
  });
  it('a realm only the alias map names, switched to on this page, survives the next load', async () => {
    boot({ realm: R2 });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1, R2]) : isVault(c.url) ? aliasReply({ [R3]: 'Three' }) : { status: 200, body: {} }));
    await load();
    expect(await switchTo(R3)).toBe(true);
    const seen = notices();
    const g = gen();
    await load();
    expect([selected(), localStorage.getItem('hub_realm_v1'), gen()]).toEqual([R3, R3, g]);
    expect(seen).toEqual([]);
  });
  it('a switch made before the first load counts as this page\'s: a restored selection replaced by a switch is not dropped', async () => {
    boot({ realm: R2 });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : isVault(c.url) ? aliasReply({ [R3]: 'Three' }) : { status: 200, body: {} }));
    expect(await switchTo(R3)).toBe(true);
    const g = gen();
    await load();
    expect([selected(), gen()]).toEqual([R3, g]);
  });
  it('an answer without a realm list proves nothing: the restored selection stays, and the next listed answer still decides it', async () => {
    boot({ realm: R3 });
    const seen = notices();
    onFetch((c) => (c.url.includes('/realms') ? { status: 200, body: { data: {} } } : aliasReply({ [R3]: 'Three' })));
    const g = gen();
    await load();
    expect([selected(), gen()]).toEqual([R3, g]);
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : aliasReply({ [R3]: 'Three' })));
    await load();
    expect([selected(), localStorage.getItem('hub_realm_v1'), gen()]).toEqual(['all', 'all', g + 1]);
    expect(seen).toEqual([{ kind: 'realm-gone', restored: true }]);
  });
});

describe('a load never falls back over a switch the person started', () => {
  it('a switch pending when the first load would drop the restored realm commits; nothing is left switching', async () => {
    boot({ realm: R3 });
    const seen = notices();
    const aliases = deferred(), probe = deferred();
    onFetch(async (c) => {
      if (c.url.includes('/realms')) return realmsOf([R1]);
      if (isVault(c.url)) { await aliases.p; return aliasReply({ [R3]: 'Three' }); }
      await probe.p;
      return { status: 200, body: {} };
    });
    const first = load();
    await settle();
    const going = switchTo(R1);
    await settle();
    aliases.res();
    await first;
    expect(selected()).toBe(R3); // the switch decides
    probe.res();
    expect(await going).toBe(true);
    expect([selected(), localStorage.getItem('hub_realm_v1'), switching()]).toEqual([R1, R1, null]);
    expect(seen).toEqual([]);
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : aliasReply({ [R3]: 'Three' })));
    await load();
    expect(selected()).toBe(R1);
  });
  it('when that switch fails, the restored realm is decided again at once: it falls back with one restored notice', async () => {
    boot({ realm: R3 });
    const seen = notices();
    const aliases = deferred(), probe = deferred();
    onFetch(async (c) => {
      if (c.url.includes('/realms')) return realmsOf([R1]);
      if (isVault(c.url)) { await aliases.p; return aliasReply({ [R3]: 'Three' }); }
      await probe.p;
      return { status: 503, body: {} };
    });
    const first = load();
    await settle();
    const going = switchTo(R1);
    await settle();
    aliases.res();
    await first;
    const g = gen();
    probe.res();
    expect(await going).toBe(false);
    for (let i = 0; i < 10; i++) await settle();
    expect([selected(), localStorage.getItem('hub_realm_v1'), switching(), gen()]).toEqual(['all', 'all', null, g + 1]);
    expect(seen.filter((n) => n.kind === 'realm-gone')).toEqual([{ kind: 'realm-gone', restored: true }]);
    expect(realmsCalls()).toBe(2); // the first load and exactly one reload
  });
  it('the reload after a failed switch reads afresh: a list that now includes the restored realm keeps it', async () => {
    boot({ realm: R3 });
    const seen = notices();
    const w = world({ realms: [R1], aliases: { [R3]: 'Three' } });
    const going = switchTo(R1);
    await settle();
    await load();
    w.realms = [R1, R3];
    w.probes.shift()?.(503);
    expect(await going).toBe(false);
    for (let i = 0; i < 10; i++) await settle();
    expect([selected(), switching()]).toEqual([R3, null]);
    expect(seen.filter((n) => n.kind === 'realm-gone')).toEqual([]);
    expect(realmsCalls()).toBe(2);
  });
});

describe('confirmation still counts during a switch; the ordinary fallback waits too', () => {
  it('a load that lists the restored realm while a switch is pending confirms it: a later omission after the switch fails keeps it', async () => {
    boot({ realm: R3 });
    const seen = notices();
    const w = world({ realms: [R1, R3], aliases: { [R3]: 'Three' } });
    const going = switchTo(R1);
    await settle();
    await load();
    w.realms = [R1];
    w.probes.shift()?.(503);
    expect(await going).toBe(false);
    for (let i = 0; i < 10; i++) await settle();
    expect([selected(), localStorage.getItem('hub_realm_v1'), switching()]).toEqual([R3, R3, null]);
    expect(seen.filter((n) => n.kind === 'realm-gone')).toEqual([]);
  });
  for (const ok of [true, false]) {
    it(`a realm chosen on this page that a load drops (both sources) waits for a pending switch, which then ${ok ? 'commits' : 'fails and the fallback runs once'}`, async () => {
      boot({ realm: R2 });
      const w = world({ realms: [R1, R2], aliases: { [R3]: 'Three' } });
      await load();
      const first = switchTo(R3);
      await settle();
      w.probes.shift()?.(200);
      expect(await first).toBe(true);
      const seen = notices();
      const going = switchTo(R1);
      await settle();
      w.realms = [R1];
      w.aliases = {};
      const g = gen();
      await load();
      expect([selected(), gen(), switching()]).toEqual([R3, g, R1]);
      const before = realmsCalls();
      w.probes.shift()?.(ok ? 200 : 503);
      expect(await going).toBe(ok);
      for (let i = 0; i < 10; i++) await settle();
      if (ok) {
        expect([selected(), localStorage.getItem('hub_realm_v1'), switching()]).toEqual([R1, R1, null]);
        expect(seen.filter((n) => n.kind === 'realm-gone')).toEqual([]);
        expect(realmsCalls()).toBe(before);
      } else {
        expect([selected(), localStorage.getItem('hub_realm_v1'), switching(), gen()]).toEqual(['all', 'all', null, g + 1]);
        expect(seen.filter((n) => n.kind === 'realm-gone')).toEqual([{ kind: 'realm-gone' }]);
        expect(realmsCalls()).toBe(before + 1);
      }
    });
  }
  it('a committed switch ends a deferred decision: a later unrelated failed switch reloads nothing', async () => {
    boot({ realm: R3 });
    const w = world({ realms: [R1, R2], aliases: { [R3]: 'Three' } });
    const a = switchTo(R1);
    await settle();
    await load(); // defers: R3 is restored and GET /realms omits it
    const b = switchTo(R2);
    await settle();
    w.probes[1]?.(200);
    expect(await b).toBe(true);
    w.probes[0]?.(200);
    expect(await a).toBe(false);
    const seen = notices();
    const before = realmsCalls();
    const c = switchTo(R1);
    await settle();
    w.probes[2]?.(503);
    expect(await c).toBe(false);
    for (let i = 0; i < 10; i++) await settle();
    expect([selected(), switching()]).toEqual([R2, null]);
    expect(realmsCalls()).toBe(before);
    expect(seen.filter((n) => n.kind === 'realm-gone')).toEqual([]);
  });
});
