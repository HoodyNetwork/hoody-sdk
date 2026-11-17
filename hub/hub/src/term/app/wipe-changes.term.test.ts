// Remove all local data, in a terminal, with a held change. The confirm names the held changes and the person chooses
// to forget them, so the wipe removes `hub.v3.changes` from the disk with the rest (registry `forget`). The storage seam
// (live-wire.ts seamArea) kept every removal of that key closed: only the change store's own adapter writes it. So the
// wipe's clear threw on it every time, after the preferences were already gone, and the wipe could never finish.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | the seam's clear removes a held change and the preferences from the disk and answers done | 'the wipe removes a held change' |
// | 2 | the seam still refuses to write that key, and refuses a money key's removal; no store: nothing removable | same test (controls) |
// | 3 | a held boot-token mint record stays on the disk as it was (the only trace of a token that may exist; the recovery
// |   | revokes it by its name, and the lock's forget keeps it too), and the seam never shows it, so the wipe's read-back
// |   | finds nothing left; a value that cannot be read is never removed | 'the wipe keeps a held boot-token mint record' |
// | 4 | after the wipe, `hoody logout` still revokes the kept boot key (term.boot_keys, which the wipe never touches) and
// |   | still counts the open mint, so it answers 'kept', never 'done' | 'after the wipe, hoody logout still revokes' |
import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY } from '../../core/change-store';
import type { KeyValueStore } from '../../core/host-env';
import { hubStoreDir, openHubStore, type HubStore } from '../../../scripts/term/build/hub-store';
import { revokeKeptBootKeys } from '../../../scripts/term/build/hub-store-logout';
import { NotDurable, persistentStore } from '../env/persist';
import { BOOT_KEYS_KEY } from './boot-keys';
import { BOOT_MINT_LOCK_PREFIX, bootAliasOf } from './live-direct';
import { seamArea } from './live-wire';

const ACCOUNT = '64f0ada00000000000000002';
const API_ORIGIN = 'https://api.example.invalid';
/** A change the person was shown as held (pending, no key yet), in the stored shape persist.ts checks. */
const HELD = { id: 'change-held-1', pending: true, t: 1_700_000_000_000, key: null };
/** A held boot-token mint (live-direct.ts holdDirectChange 'boot-token-mint'), in the stored shape persist.ts checks. */
const MINT = {
  id: ATTEMPT_PREFIX + ACCOUNT + '\u0001' + BOOT_MINT_LOCK_PREFIX + 'k3v9q2m7xa', pending: true, t: 1_700_000_000_000, key: null, inc: 'k3v9q2m7xa01',
  meta: { base: BOOT_MINT_LOCK_PREFIX + 'k3v9q2m7xa', target: null, realm: null, by: 'term.direct' }, attempt: { alias: bootAliasOf('k3v9q2m7xa') },
};
const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
const why = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof NotDurable ? `${e.code} ${e.why}` : `other: ${String(e)}`; } return 'done'; };

let home = '';
let dir = '';
const opened: HubStore[] = [];
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-wipe-changes-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, API_ORIGIN, ACCOUNT)!;
});
afterEach(() => {
  for (const s of opened.splice(0)) s.close();
  fs.rmSync(home, { recursive: true, force: true });
});
/** This Hub's store: it takes the lock. */
const open = (): HubStore => {
  const s = openHubStore(dir, { home, tryLock: () => true });
  opened.push(s);
  return s;
};

test('the wipe removes a held change from the disk; the seam still refuses to write one', () => {
  const holder = open();
  holder.journalSet(CHANGE_STORE_KEY, JSON.stringify([HELD]));
  const seam = persistentStore(memory(), seamArea(holder));
  seam.setItem('hub_theme_v1', 'dark');
  expect(holder.get('hub_theme_v1')).toBe('dark');
  // clear() is optional on a KeyValueStore; the disk reads after it are what prove the removal.
  expect(why(() => seam.clear?.())).toBe('done');
  expect(holder.journalGet(CHANGE_STORE_KEY)).toBeNull();
  expect(holder.get('hub_theme_v1')).toBeNull();
  // Read back from the disk by a fresh open, as the next start does.
  holder.close();
  opened.splice(opened.indexOf(holder), 1);
  const again = open();
  expect(again.journalGet(CHANGE_STORE_KEY)).toBeNull();
  expect(again.get('hub_theme_v1')).toBeNull();
  // Controls: the seam writes no change record (only the change store's adapter does), money stays closed, and with
  // no store nothing is removable.
  expect(() => { seamArea(again).journalSet(CHANGE_STORE_KEY, JSON.stringify([HELD])); }).toThrow('NOT_DURABLE');
  expect(() => { seamArea(again).journalDel('hub_money_pending'); }).toThrow('NOT_DURABLE');
  expect(() => { seamArea(null).journalDel(CHANGE_STORE_KEY); }).toThrow('NOT_DURABLE');
  expect(again.journalGet(CHANGE_STORE_KEY)).toBeNull();
});

test('the wipe keeps a held boot-token mint record on the disk, as it was; the seam never shows it', () => {
  const holder = open();
  const both = JSON.stringify([HELD, MINT]), mintOnly = JSON.stringify([MINT]);
  holder.journalSet(CHANGE_STORE_KEY, both);
  const seam = persistentStore(memory(), seamArea(holder));
  seam.setItem('hub_theme_v1', 'dark');
  // What core's storage shows: the person's held change only.
  expect(seam.getItem(CHANGE_STORE_KEY)).toBe(JSON.stringify([HELD]));
  expect(why(() => seam.clear?.())).toBe('done');
  // The wipe's read-back finds nothing left; the disk holds the mint record, byte for byte as the adapter wrote it.
  expect([seam.length, seam.key(0), seam.getItem(CHANGE_STORE_KEY)]).toEqual([0, null, null]);
  expect(holder.journalGet(CHANGE_STORE_KEY)).toBe(mintOnly);
  expect(holder.get('hub_theme_v1')).toBeNull();
  holder.close();
  opened.splice(opened.indexOf(holder), 1);
  const again = open();
  expect(again.journalKeys()).toEqual([CHANGE_STORE_KEY]);
  expect(again.journalGet(CHANGE_STORE_KEY)).toBe(mintOnly);
  // A second wipe, with only the mint record left: nothing to remove, nothing changed.
  expect(why(() => persistentStore(memory(), seamArea(again)).clear?.())).toBe('done');
  expect(again.journalGet(CHANGE_STORE_KEY)).toBe(mintOnly);
  // A value that cannot be read may hold one: the wipe fails and it stays.
  again.journalSet(CHANGE_STORE_KEY, '{not json');
  expect(why(() => persistentStore(memory(), seamArea(again)).clear?.())).toBe('NOT_DURABLE failed');
  expect(again.journalGet(CHANGE_STORE_KEY)).toBe('{not json');
});

test('after the wipe, hoody logout still revokes the kept boot key and still sees the open mint', async () => {
  const holder = open();
  const KEPT = { id: 'tok-kept-1', alias: bootAliasOf('a1b2c3d4e5'), expires_at: '2099-01-01T00:00:00.000Z', at: 1_700_000_000_000 };
  holder.journalSet(CHANGE_STORE_KEY, JSON.stringify([HELD, MINT]));
  holder.set(BOOT_KEYS_KEY, JSON.stringify([KEPT]));
  expect(why(() => persistentStore(memory(), seamArea(holder)).clear?.())).toBe('done');
  holder.close();
  opened.splice(opened.indexOf(holder), 1);
  // `hoody logout` (scripts/term/build/hub-store-logout.ts), in its own process after the Hub ended.
  const sent: string[] = [];
  const r = await revokeKeptBootKeys({ home, apiOrigin: API_ORIGIN, uid: ACCOUNT, tryLock: () => true, revoke: async (id) => { sent.push(id); return 'gone'; } });
  expect(sent).toEqual(['tok-kept-1']);
  // The open mint may have made a key the list does not name: counted, so the logout says it kept something.
  expect(r).toEqual({ state: 'kept', revoked: 1, left: 0, open: 1 });
});
