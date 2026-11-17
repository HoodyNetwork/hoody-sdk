// fixture-boot.test.tsx: core boots on fixtureWorld without shared.js (no test/env here on purpose).
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { memoryVault } from './crypt/memory-vault';
import { cryptIdleForTests, cryptReady, resetCryptForTests } from './cryptStore';
import { api } from './api';
import { containersRoute } from './computer';
import { snapshot, tokenRealm, tokenSession } from './ctx';
import { meRoute } from './lifecycle';
import { bootFixtureCore, fixtureSession } from './fixture-boot';
import { can, useCan } from './token';
import { notificationSummary, onNotificationSummary } from './notifications';
import { accountPref, useAccountPref } from './prefs';
import { aliasOf, list, realmsRoute, tint } from './realm';
import { answers, reply } from './transport';
import { clearAuthTokens } from './session';
import { fixtureWorld as W } from './world';

const parseOrder = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

describe('bootFixtureCore', () => {
  it('Ada, Personal and atlas, with the realm names and tints known at once', () => {
    bootFixtureCore();
    const s = snapshot();
    expect(s.identity).toMatchObject({ id: W.account.id, username: W.account.username });
    expect(s.realm).toBe(W.realm('Personal').id);
    expect(s.target).toMatchObject({ container: { id: W.current.id } });
    expect(list()).toEqual(W.realms.map((r) => r.id));
    expect(aliasOf(W.realm('Acme client').id)).toBe('Acme client');
    expect(tint(W.realm('Acme client').id)).toBe(W.realm('Acme client').tint);
  });
  it('useAccountPref works on a registered key (hub_home_v1) and sign-out purges it', async () => {
    resetCryptForTests(memoryVault()); // happy-dom has no IndexedDB
    bootFixtureCore();
    await act(() => cryptReady());
    function Home() { const [order, set] = useAccountPref('hub_home_v1', parseOrder); return <button onClick={() => set(['news', 'computers'])}>{order.join(',') || 'empty'}</button>; }
    const v = render(<Home />);
    expect(v.container.textContent).toBe('empty');
    act(() => { v.container.querySelector('button')?.click(); });
    expect(v.container.textContent).toBe('news,computers');
    await act(() => cryptIdleForTests()); // sealed and stored in the background
    expect(localStorage.getItem('hub_home_v1')).not.toBeNull();
    expect(localStorage.getItem('hub_home_v1')).not.toContain('news');
    act(() => { clearAuthTokens(); });
    expect(localStorage.getItem('hub_home_v1')).toBeNull();
    v.unmount();
  });
  it('an unregistered key is still refused', () => {
    bootFixtureCore();
    expect(() => accountPref('hub_not_registered_v1', parseOrder)).toThrow('STORE_UNREGISTERED');
  });
  it('each boot starts fresh unless keepStorage; storage seeds after the reset; options pass through', () => {
    bootFixtureCore();
    localStorage.setItem('hub_home_v1', 'x'); localStorage.setItem('unrelated', 'y');
    bootFixtureCore({ keepStorage: true });
    expect(localStorage.getItem('hub_home_v1')).toBe('x');
    const g = snapshot().gen;
    bootFixtureCore({ realm: W.realm('Acme client').id, target: null, storage: { hub_first_run_seen: '1' } });
    expect(localStorage.getItem('hub_home_v1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('y');
    expect(localStorage.getItem('hub_first_run_seen')).toBe('1');
    expect(snapshot()).toMatchObject({ realm: W.realm('Acme client').id, target: null });
    expect(snapshot().gen).toBeGreaterThan(g);
  });
  it("page rules win over core's, and core answers the rest", async () => {
    bootFixtureCore({ rules: [reply(meRoute, answers.ok({ data: { id: W.account.id, username: 'page-said', is_banned: false } }))] });
    expect(await api(meRoute)).toMatchObject({ data: { username: 'page-said' } });
    expect(await api(realmsRoute)).toMatchObject({ data: { realm_ids: W.realms.map((r) => r.id) } });
  });
  it("the bell answers from the world's notifications", async () => {
    bootFixtureCore();
    await new Promise<void>((r) => { const off = onNotificationSummary((x) => { if (x) { off(); r(); } }); });
    expect(notificationSummary()).toMatchObject({ uid: W.account.id, unread_count: W.notifications.filter((n) => !n.read).length });
  });
  it('GET /computers answers the world computers of the selected realm', async () => {
    bootFixtureCore({ realm: W.realm('Acme client').id });
    const r = (await api(containersRoute, { query: { page: 1, limit: 100 } })) as { data: { computers: { name: string }[] } };
    expect(r.data.computers.map((c) => c.name)).toEqual(W.computers.filter((c) => c.realm_ids.includes(W.realm('Acme client').id)).map((c) => c.name));
  });
  it('refuses on a live page (shared.js loaded) and clears nothing', () => {
    localStorage.setItem('access_token', 'real');
    (globalThis as { storedSession?: unknown }).storedSession = () => null;
    try {
      expect(() => bootFixtureCore()).toThrow('FIXTURES_REFUSED');
      expect(localStorage.getItem('access_token')).toBe('real');
    } finally { delete (globalThis as { storedSession?: unknown }).storedSession; localStorage.removeItem('access_token'); }
  });
});

describe('Home fixture controls', () => {
  it('bootFixtureCore({ realm: "all" }) selects all realms; { target: null } boots with no current computer', () => {
    bootFixtureCore({ realm: 'all', target: null });
    expect(snapshot().realm).toBe('all');
    expect(snapshot().target).toBeNull();
    // Personal holds more than one computer for the pick-one view.
    expect(W.computers.filter((c) => c.realm_ids.includes(W.realms[0]!.id)).length).toBeGreaterThan(1);
  });
});

describe('fixtureSession: a page fixture state boots as a limited token session', () => {
  it('useCan answers from the listed caps; account-only and unlisted actions are refused; a plain boot is an account session again', () => {
    bootFixtureCore({ rules: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'computers.actions.start'] })] });
    expect(tokenSession()).toBe(true);
    expect(can('computers.actions.start')).toBe(true);
    expect(can('computers.actions.stop')).toBe(false);
    expect(can('account')).toBe(false);
    let seen: boolean[] = [];
    function Probe() { seen = [useCan('computers.actions.start'), useCan('computers.delete')]; return null; }
    render(<Probe />);
    expect(seen).toEqual([true, false]);
    expect(tokenRealm()).toBe(snapshot().realm);
    bootFixtureCore();
    expect(tokenSession()).toBe(false);
    expect(can('computers.actions.stop')).toBe(true);
  });
  it('a pinned realm, and the flag pairs (events, vault) from their names', () => {
    const R2 = W.realm('Acme client').id;
    bootFixtureCore({ rules: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'events'], realm: R2 })] });
    expect(tokenRealm()).toBe(R2);
    expect(can('events')).toBe(true);
    expect(can('vault')).toBe(false);
  });
});
