import { fixtureWorld } from './world';
// The dev shell in fixture mode: boot, the realm switcher and sign-out run on core's own fixtures alone.
import { afterEach, describe, expect, it } from 'vitest';
import { bump, gen, identity, realm, resetCore } from './ctx';
import { resetLifecycle } from './lifecycle';
import { resetRealm, setAlias } from './realm';
import { bootLive, configureLifecycle, FIXTURE_REALM, initLive, loadRealms, logout, onRealmNotice, realmCount, realmList, startFixtureMode, switchRealm, type RealmNotice } from './shell';
import { coreFixtures, FIXTURE_REALM_2 } from './index.fixtures';
import { readSetupState, redeemInvite, resetSetup, retrySetup } from './setup';
import { installTransport } from './transport';
import { boot, calls } from './test/env';

afterEach(() => { installTransport(null); boot(); });

function dev(state: keyof typeof coreFixtures.states = 'default') {
  localStorage.clear();
  bump('test-boot');
  resetCore();
  resetRealm();
  resetLifecycle();
  const navs: string[] = [];
  const ctl = startFixtureMode(coreFixtures.states[state]);
  configureLifecycle({ navigate: (u) => navs.push(u) });
  initLive();
  return { navs, ctl };
}

describe('dev shell on core fixtures', () => {
  it("boots ready as the world's Ada with its realms; nothing touches the network", async () => {
    dev();
    const r = await bootLive();
    expect(r.state).toBe('ready');
    const ids = fixtureWorld.realms.map((x) => x.id);
    expect(ids.slice(0, 2)).toEqual([FIXTURE_REALM, FIXTURE_REALM_2]);
    if (r.state === 'ready') expect(await r.realms).toEqual(ids);
    expect(identity()).toMatchObject({ username: 'ada', banned: false });
    expect(realmList()).toEqual(ids);
    expect(realmCount('all')).toBe(fixtureWorld.computers.length);
    expect(calls).toEqual([]);
  });
  it('the switcher switches and bumps', async () => {
    dev();
    await bootLive();
    const g = gen();
    expect(await switchRealm(FIXTURE_REALM_2)).toBe(true);
    expect([realm(), gen()]).toEqual([FIXTURE_REALM_2, g + 1]);
  });
  it('switchFails: refused, said so, nothing moved', async () => {
    dev('switchFails');
    await bootLive();
    const seen: RealmNotice[] = [];
    onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); });
    const before = realm();
    expect(await switchRealm(FIXTURE_REALM_2)).toBe(false);
    expect(realm()).toBe(before);
    expect(seen).toEqual([{ kind: 'switch-failed', target: FIXTURE_REALM_2, current: before }]);
  });
  it('suspended boots banned', async () => {
    dev('suspended');
    expect(await bootLive()).toEqual({ state: 'banned' });
  });
  it('sign-out leaves for sign-in', async () => {
    const { navs } = dev();
    await bootLive();
    await loadRealms();
    logout();
    await new Promise((r) => setTimeout(r, 10));
    expect(navs).toEqual(['/auth/login']);
  });
});

describe('setup states on core fixtures', () => {
  it.each([
    ['default', { kind: 'empty', freeSetup: false }], ['setupInvite', { kind: 'invite', signupCodeFailed: false }], ['setupInviteFailed', { kind: 'invite', signupCodeFailed: true }],
    ['setupCapacity', { kind: 'capacity' }], ['setupMailbox', { kind: 'mailbox' }], ['setupExpired', { kind: 'expired' }],
    ['setupEmpty', { kind: 'empty', freeSetup: true }],
  ] as const)('%s', async (state, want) => {
    dev(state);
    await bootLive();
    expect(await readSetupState()).toEqual(want);
    resetSetup();
    expect(await redeemInvite('code')).toEqual({ outcome: 'done', data: 'refresh' });
    expect(await retrySetup()).toEqual({ outcome: 'done', data: 'queued' });
    expect(calls).toEqual([]);
  });
});

describe('lifecycleFixtures: the shared computer Start/Resume/Stop answers for page fixture states', () => {
  it('unknown: the start may have gone through and stays held (a second press is refused unsent); refused and ok answer as named', async () => {
    const { computerLifecycle } = await import('./power');
    const { lifecycleFixtures } = await import('./fixtures');
    const id = fixtureWorld.computers.find((c) => c.realm_ids.includes(FIXTURE_REALM))!.id;
    dev();
    installTransport(null);
    startFixtureMode([...lifecycleFixtures.unknown, ...coreFixtures.states.default]);
    expect((await bootLive()).state).toBe('ready');
    const first = await computerLifecycle.run({ id, op: 'start' });
    expect(first.outcome).toBe('pending');
    expect((await computerLifecycle.run({ id, op: 'start' })).error?.code).toBe('READ_BACK_FIRST');
    dev();
    installTransport(null);
    startFixtureMode([...lifecycleFixtures.refused, ...coreFixtures.states.default]);
    expect((await bootLive()).state).toBe('ready');
    expect((await computerLifecycle.run({ id, op: 'start' })).outcome).toBe('failed');
    dev();
    installTransport(null);
    startFixtureMode([...lifecycleFixtures.ok, ...coreFixtures.states.default]);
    expect((await bootLive()).state).toBe('ready');
    expect((await computerLifecycle.run({ id, op: 'stop' })).outcome).toBe('done');
  });
});

describe('core fixtures: realm names', () => {
  it('a rename goes through: the alias map read carries an ETag, as the API sends', async () => {
    dev();
    await bootLive();
    await expect(setAlias(FIXTURE_REALM, 'Renamed')).resolves.toMatchObject({ [FIXTURE_REALM]: 'Renamed' });
  });
});
