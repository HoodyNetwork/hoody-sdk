// Remove all local data, in a terminal, refuses while this account's store cannot delete: another Hub holds the store
// (this mount opened it read-only) or a write to it failed. It went ahead before. On a read-only
// store a preference's removal only hid it for the mount (persist.ts removeItem), the wipe's read-back took it for
// gone, the page said the data was removed, and the next start read it from the disk again.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | cannotDelete: null on the store this Hub holds; 'busy' on a second opener's; 'failed' after a failed write or with no store | 'cannotDelete' |
// | 2 | clear() on a read-only store removes nothing and throws; on this Hub's store every kept key leaves the disk | 'clear' |
// | 3 | clear() with a delete that fails throws once the rest were removed, and that key still reads back | 'a delete that fails' |
// | 4 | removeLocalData answers 'store' (busy, failed) before anything is read; a store that can delete goes on to the session check | 'removeLocalData' |
import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { KeyValueStore } from '../../core/host-env';
import { removeLocalData, type LocalWipeWarning } from '../../core/local-wipe';
import { hubStoreDir, openHubStore, type HubStore } from '../../../scripts/term/build/hub-store';
import { NotDurable, persistentStore, type PersistArea } from './persist';
import { beginTermSession, type TermSession } from './session';

const ACCOUNT = '64f0ada00000000000000001';
const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
const why = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof NotDurable ? `${e.code} ${e.why}` : `other: ${String(e)}`; } return 'done'; };

/** A store in memory, as hub-store's area: `failDel` names a key whose delete throws, `failed` a store whose write failed. */
function fakeArea(o: { readOnly?: 'busy'; failed?: boolean; failDel?: string } = {}): PersistArea & { kv: Map<string, string> } {
  const kv = new Map<string, string>();
  const journal = new Map<string, string>();
  return {
    kv,
    readOnly: o.readOnly ?? null,
    journalGet: (k) => journal.get(k) ?? null, journalKeys: () => [...journal.keys()],
    journalSet: (k, v) => { journal.set(k, v); }, journalDel: (k) => { journal.delete(k); },
    get: (k) => kv.get(k) ?? null, keys: () => [...kv.keys()],
    set: (k, v) => { kv.set(k, v); },
    del: (k) => { if (k === o.failDel) throw new Error('EIO'); kv.delete(k); },
    failed: () => o.failed === true,
  };
}

let home = '';
let dir = '';
const opened: HubStore[] = [];
let session: TermSession | null = null;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-wipe-store-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, 'https://api.example.invalid', ACCOUNT)!;
});
afterEach(() => {
  session?.end();
  session = null;
  for (const s of opened.splice(0)) s.close();
  fs.rmSync(home, { recursive: true, force: true });
});
/** This Hub's store (it takes the lock), or a second opener's: the lock is held, so it is read-only. */
const open = (holder: boolean): HubStore => {
  const s = openHubStore(dir, { home, tryLock: () => holder });
  opened.push(s);
  return s;
};
const onDisk = (): string => fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

test('cannotDelete', () => {
  const mine = open(true);
  expect(persistentStore(memory(), mine).cannotDelete?.()).toBeNull();
  const second = open(false);
  expect(second.readOnly).toBe('busy');
  expect(persistentStore(memory(), second).cannotDelete?.()).toBe('busy');
  expect(persistentStore(memory(), fakeArea({ failed: true })).cannotDelete?.()).toBe('failed');
  // No usable store: live-wire's seamArea reads as read-only AND failed. That is not another Hub's doing.
  expect(persistentStore(memory(), fakeArea({ readOnly: 'busy', failed: true })).cannotDelete?.()).toBe('failed');
});

test('clear', () => {
  const mine = open(true);
  const seam = persistentStore(memory(), mine);
  seam.setItem('hub_theme_v1', 'dark');
  seam.setItem('hub_hl_v1', 'lime');
  seam.setItem('note', 'memory only');
  expect(onDisk()).toContain('hub_theme_v1');
  // A second Hub for the same account: it reads the same keys and can remove none of them.
  const other = persistentStore(memory(), open(false));
  expect(other.getItem('hub_theme_v1')).toBe('dark');
  expect(why(() => other.clear?.())).toBe('NOT_DURABLE read-only');
  expect(other.getItem('hub_theme_v1')).toBe('dark');
  expect(other.getItem('hub_hl_v1')).toBe('lime');
  expect(onDisk()).toContain('hub_theme_v1');
  // Positive control: the Hub that holds the store removes every key, from the disk too.
  expect(why(() => seam.clear?.())).toBe('done');
  expect(seam.length).toBe(0);
  expect(seam.getItem('hub_theme_v1')).toBeNull();
  expect(seam.getItem('note')).toBeNull();
  expect(mine.get('hub_theme_v1')).toBeNull();
  expect(mine.get('hub_hl_v1')).toBeNull();
});

test('a delete that fails', () => {
  const area = fakeArea({ failDel: 'hub_theme_v1' });
  const seam = persistentStore(memory(), area);
  seam.setItem('hub_theme_v1', 'dark');
  seam.setItem('hub_hl_v1', 'lime');
  expect(why(() => seam.clear?.())).toBe('NOT_DURABLE failed');
  // The other key went; the one whose delete failed still reads back, so the wipe's read-back sees it.
  expect(area.kv.has('hub_hl_v1')).toBe(false);
  expect(seam.getItem('hub_theme_v1')).toBe('dark');
  expect(seam.length).toBe(1);
});

test('removeLocalData', async () => {
  const shown: LocalWipeWarning = { account: ACCOUNT, holds: [], asks: [], payments: 'settled' };
  open(true); // another Hub holds this account's store
  session = beginTermSession();
  session.seamLocal(persistentStore(session.stores().local, open(false)));
  expect(await removeLocalData(shown)).toEqual({ kind: 'store', why: 'busy' });
  session.seamLocal(persistentStore(session.stores().local, fakeArea({ failed: true })));
  expect(await removeLocalData(shown)).toEqual({ kind: 'store', why: 'failed' });
  // Positive control: a store that can delete passes this check. The next one refuses here (no signed-in session).
  session.seamLocal(persistentStore(session.stores().local, fakeArea()));
  expect(await removeLocalData(shown)).toEqual({ kind: 'changed' });
});
