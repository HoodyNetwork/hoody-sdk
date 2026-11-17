// The account's Realm limit as realm.ts holds it: read with the realm list, replaced by every list answer, absent when
// the answer carries none (today's answer: nothing shown, nothing turned off), cleared when the account ends, and never
// committed by a list answer that arrives after its context died.
import { describe, expect, it } from 'vitest';
import { endAccount, load, realmCap, switchTo } from './realm';
import { realmCapShown } from './realms';
import { boot, deferred, onFetch, R1, R2 } from './test/env';

const reply = (cap?: unknown) => ({ status: 200, body: { data: { realm_ids: [R1, R2], usage: {}, ...(cap === undefined ? {} : { cap }) } } });
const answer = (cap?: unknown) => onFetch((c) => (c.url.includes('/realms') ? reply(cap) : c.url.includes('/projects') ? { status: 200, body: { data: [] } } : { status: 404, body: {} }));

describe('the Realm limit on the realm list', () => {
  it('an answer without a cap: none held, nothing to show', async () => {
    boot({ realm: R1 });
    answer();
    await load();
    expect(realmCap()).toBeNull();
    expect(realmCapShown()).toEqual({ k: 'none' });
  });
  it('the cap of the answer is held, and the next answer replaces it', async () => {
    boot({ realm: R1 });
    answer({ max: 5, used: 3, reached: false });
    await load();
    expect(realmCap()).toEqual({ max: 5, used: 3, reached: false });
    expect(realmCapShown()).toEqual({ k: 'use', used: 3, max: 5, reached: false, upgrade: false });
    answer({ max: 5, used: 5, reached: true });
    await load();
    expect(realmCapShown()).toEqual({ k: 'use', used: 5, max: 5, reached: true, upgrade: true });
    answer();
    await load();
    expect(realmCap()).toBeNull();
  });
  it('an answer without `used` (a sign-in limited to realms): unknown, never zero', async () => {
    boot({ realm: R1 });
    answer({ max: 50, reached: false });
    await load();
    expect(realmCap()).toEqual({ max: 50, used: null, reached: false });
  });
  it('the account ending clears it', async () => {
    boot({ realm: R1 });
    answer({ max: 5, used: 5, reached: true });
    await load();
    expect(realmCap()).not.toBeNull();
    endAccount('signout');
    expect(realmCap()).toBeNull();
    expect(realmCapShown()).toEqual({ k: 'none' });
  });
  it('a list answer that arrives after a realm switch commits nothing', async () => {
    boot({ realm: R1 });
    const late = deferred<{ status: number; body: unknown }>();
    onFetch((c) => (c.url.includes('/realms') ? late.p : c.url.includes('/projects') ? { status: 200, body: { data: [] } } : { status: 404, body: {} }));
    const first = load();
    expect(await switchTo(R2)).toBe(true);
    late.res(reply({ max: 5, used: 5, reached: true }));
    // The late answer is stale: the read rejects as stale and nothing of it is kept.
    await expect(first).rejects.toMatchObject({ kind: 'stale' });
    expect(realmCap()).toBeNull();
  });
  it('a realm switch clears the count read before it', async () => {
    boot({ realm: R1 });
    answer({ max: 5, used: 5, reached: true });
    await load();
    expect(realmCap()).not.toBeNull();
    expect(await switchTo(R2)).toBe(true);
    expect(realmCap()).toBeNull();
    expect(realmCapShown()).toEqual({ k: 'none' });
  });
});
