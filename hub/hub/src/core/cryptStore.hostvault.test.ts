// cryptStore's vault comes from the host env (core/host-env.ts), read when an account opens, and stays that account's:
// a host whose vault changes while the account is open (web: another IndexedDB factory) never gets that account's
// operations, and the next account opening reads the host's vault again.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryVault } from './crypt/memory-vault';
import type { Vault } from './crypt/vault';
import { cryptIdleForTests, cryptPartitioned, cryptReady, forgetThisBrowser, resetCryptForTests } from './cryptStore';
import { hostEnv } from './host-env';
import { boot, UID } from './test/env';

const home = () => cryptPartitioned('hub_home_v1', { scope: 'account', purge: true });
const keysOf = (v: ReturnType<typeof memoryVault>) => v.dump().keys.filter((k) => k.startsWith(UID + '/'));

let first = memoryVault();
let second = memoryVault();
let current: Vault = first;
let spy: { mockRestore(): void } | null = null;

beforeEach(async () => {
  boot();
  first = memoryVault();
  second = memoryVault();
  current = first;
  spy = vi.spyOn(hostEnv(), 'vault', 'get').mockImplementation(() => current);
  resetCryptForTests(null, { newPage: true }); // no test vault: the store reads the host env's
  await cryptReady();
  await cryptIdleForTests();
});
afterEach(() => {
  spy?.mockRestore();
  spy = null;
});

it('the account opens on the host env\'s vault', async () => {
  expect(home().set({ h: 1 })).toBe(true);
  await cryptIdleForTests();
  expect(keysOf(first).length).toBeGreaterThan(0);
  expect(keysOf(second)).toEqual([]);
});

it('a host vault replaced while the account is open gets none of its operations: Forget deletes the keys it opened with', async () => {
  expect(home().set({ h: 1 })).toBe(true);
  await cryptIdleForTests();
  expect(keysOf(first).length).toBeGreaterThan(0);
  current = second;
  expect(home().set({ h: 2 })).toBe(true); // a write after the change: sealed and stored with the opened vault's key
  await cryptIdleForTests();
  expect(keysOf(second)).toEqual([]);
  expect(await forgetThisBrowser()).toBe(true);
  await cryptIdleForTests();
  expect(keysOf(first)).toEqual([]); // the keys the account opened with are gone, not some other vault's
  expect(first.dump().accounts.find((r) => r.account === UID)?.epoch).toBeTruthy(); // and Forget's record is there
});

it('the next account opening reads the host env\'s vault again', async () => {
  current = second;
  resetCryptForTests(null, { newPage: true }); // the open account closes, as at the end of a mount
  await cryptReady();
  expect(home().set({ h: 3 })).toBe(true);
  await cryptIdleForTests();
  expect(keysOf(second).length).toBeGreaterThan(0);
});
