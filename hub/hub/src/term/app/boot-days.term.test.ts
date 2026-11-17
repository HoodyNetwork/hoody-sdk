// The agent sign-in days in a terminal (Account page, "Days signed in"): the value the page saves is kept in this
// account's store on disk (term/env/persist.ts, a preference row), and the boot-token producer asks for that many days
// when it mints (boot-producer.ts bootTtlDays); with none kept, or a value of another shape, it asks for 90. A short
// life is still reused within the mount, never past its end, and the kept keys it leaves behind take no room once
// they have ended.
//
// Real store files (hub-store.ts) and real core holds in a fixture mount; the mint is a fake standing for core's, and
// answers the expiry it was asked for.
import { afterEach, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHANGE_STORE_KEY, setChangeStoreAdapter, type StoredChange } from '../../core/change-store';
import type { KeyValueStore } from '../../core/host-env';
import { readAgentDays, saveAgentDays } from '../../pages/account/data';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type StoreIo, type TryLock } from '../../../scripts/term/build/hub-store';
import { persistentStore } from '../env/persist';
import { beginTermSession } from '../env/session';
import { fixtureBoot } from './boot';
import type { TermBoot } from './lifecycle';
import { changeStoreOver } from './live-records';
import { resetDirectMemory } from './live-direct';
import { BOOT_KEYS_KEY, BOOT_KEYS_MAX, readBootKeys, type BootKey } from './boot-keys';
import { termBootProducer } from './boot-producer';

setDefaultTimeout(30_000);

const KEY = 'hub_boot_token_ttl_days';
const UID = '64f0ada00000000000000001';
const SECRET = 'hdy_C4NARYd4ysT0kenValue000111';
const T0 = Date.parse('2026-11-12T00:00:00Z');
const DAY = 86_400_000;
const TEMPLATES = { data: [{ name: 'full_access', permissions: { computers: { read: true }, resources: {} } }] };

let flock: TryLock = () => true;
let home = '';
let dir = '';
const opened: number[][] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-boot-days-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, 'https://api.example.invalid', UID)!;
});
afterEach(() => {
  setChangeStoreAdapter(null);
  resetDirectMemory();
  for (const fds of opened.splice(0)) for (const fd of fds) { try { fs.closeSync(fd); } catch { /* closed */ } }
  fs.rmSync(home, { recursive: true, force: true });
});
function open(): HubStore {
  const fds: number[] = [];
  opened.push(fds);
  const io: StoreIo = { ...fs, openSync: ((...a: Parameters<typeof fs.openSync>) => { const fd = fs.openSync(...a); fds.push(fd); return fd; }) as typeof fs.openSync };
  return openHubStore(dir, { home, tryLock: flock, io });
}
/** A mount over `area`: core's local keys go through the persist seam, as the live boot puts it (live-wire.ts install). */
async function mounted<T>(area: HubStore, fn: () => Promise<T>): Promise<T> {
  const session = beginTermSession();
  const boot: TermBoot = fixtureBoot({ pageIds: ['keys'], page: 'keys', fx: null });
  try {
    await boot.start(session, () => {});
    session.seamLocal(persistentStore(session.stores().local, area));
    setChangeStoreAdapter(changeStoreOver(persistentStore(session.stores().local, area), { droppedTail: area.droppedTail }));
    return await fn();
  } finally {
    setChangeStoreAdapter(null);
    await boot.dispose('term-quit');
    session.end();
  }
}
const stored = (area: HubStore): StoredChange[] => JSON.parse(area.journalGet(CHANGE_STORE_KEY) ?? '[]') as StoredChange[];
async function until(fn: () => boolean): Promise<void> { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); }
const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(String(k)) ?? null, setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: (k) => { m.delete(String(k)); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
/** A mint that answers the expiry it was asked for (or none), recording each body. */
function echoMint(bodies: Record<string, unknown>[], withExpiry = true) {
  return async (_m: unknown, _p: unknown, body: unknown): Promise<unknown> => {
    const b = body as Record<string, unknown>;
    bodies.push(b);
    return { data: { id: `tok${String(bodies.length).padStart(11, '0')}`, token: SECRET, ...(withExpiry ? { expires_at: b.expires_at } : {}) } };
  };
}
const askedDays = (b: Record<string, unknown> | undefined): number => (Date.parse(String(b?.expires_at)) - T0) / DAY;

describe('the days the Account page saves', () => {
  test('are kept in this account\'s store, and read back after the Hub starts again', async () => {
    const area = open();
    await mounted(area, async () => {
      // Control: the page's own save and read.
      expect(saveAgentDays(30)).toBe(true);
      expect(readAgentDays()).toBe(30);
      // On disk, not only in this mount's memory.
      expect(area.get(KEY)).toBe('30');
    });
    area.close();
    const again = open();
    expect(again.get(KEY)).toBe('30');
    await mounted(again, async () => { expect(readAgentDays()).toBe(30); });
    again.close();
  });
  test('a value of another shape never reaches the disk', () => {
    const area = open();
    const s = persistentStore(memory(), area);
    s.setItem(KEY, '45');
    expect(area.get(KEY)).toBe('45');
    for (const bad of ['0', '366', '1000', '007', '1.5', '30days', ' 30', '-5', '', SECRET]) {
      s.setItem(KEY, bad);
      expect(area.get(KEY), bad).toBe('45');
    }
    area.close();
  });
});

describe('a mint', () => {
  test('asks for the kept days; none kept, or a value of another shape, asks for 90', async () => {
    const rows: Array<[string | null, number]> = [['30', 30], ['1', 1], ['365', 365], [null, 90], ['0', 90], ['366', 90], ['007', 90], ['1.5', 90], ['30days', 90]];
    const area = open();
    await mounted(area, async () => {
      for (const [i, [kept, days]] of rows.entries()) {
        if (kept === null) area.del(KEY); else area.set(KEY, kept);
        // Each row starts with no kept boot key and no mint record (a fresh producer: nothing in memory).
        area.set(BOOT_KEYS_KEY, '[]');
        await until(() => stored(area).length === 0);
        expect(stored(area)).toEqual([]);
        const bodies: Record<string, unknown>[] = [];
        const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => `d${String(i).padStart(9, '0')}` });
        expect(await p.ensure(UID, { mint: echoMint(bodies) }), String(kept)).toEqual({ token: SECRET, state: 'ok' });
        expect(bodies).toHaveLength(1);
        expect(askedDays(bodies[0]), String(kept)).toBe(days);
        expect(readBootKeys(area)!.map((k) => k.expires_at), String(kept)).toEqual([new Date(T0 + days * DAY).toISOString()]);
      }
    });
    area.close();
  });
  test('a short life is reused within the mount until half of it is gone, then minted anew', async () => {
    const area = open();
    area.set(KEY, '7');
    await mounted(area, async () => {
      const bodies: Record<string, unknown>[] = [];
      let now = T0, n = 0;
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => now, opId: () => `s${String(++n).padStart(9, '0')}` });
      const mint = echoMint(bodies);
      expect(await p.ensure(UID, { mint })).toEqual({ token: SECRET, state: 'ok' });
      expect(askedDays(bodies[0])).toBe(7);
      // Control: 4 of 7 days left, the memory token is answered without a mint.
      now = T0 + 3 * DAY;
      expect(await p.ensure(UID)).toEqual({ token: SECRET, state: 'ok' });
      expect(bodies).toHaveLength(1);
      // 3 days left, under half the life: not answered from memory; a press's mint mints anew.
      now = T0 + 4 * DAY;
      await expect(p.ensure(UID)).rejects.toEqual({ token: '', state: 'failed' });
      await until(() => stored(area).length === 0);
      expect(await p.ensure(UID, { mint })).toEqual({ token: SECRET, state: 'ok' });
      expect(bodies).toHaveLength(2);
    });
    area.close();
  });
  test('an answer with no expiry is not reused past the life it was asked for', async () => {
    const area = open();
    area.set(KEY, '2');
    await mounted(area, async () => {
      const bodies: Record<string, unknown>[] = [];
      let now = T0;
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => now, opId: () => 'e000000001' });
      expect(await p.ensure(UID, { mint: echoMint(bodies, false) })).toEqual({ token: SECRET, state: 'ok' });
      expect(askedDays(bodies[0])).toBe(2);
      // Control: half a day in, reused.
      now = T0 + DAY / 2;
      expect(await p.ensure(UID)).toEqual({ token: SECRET, state: 'ok' });
      // A day and a half in (half a day left of the 2 asked for): not reused, though the assumed 21 days would allow it.
      now = T0 + 1.5 * DAY;
      await expect(p.ensure(UID)).rejects.toEqual({ token: '', state: 'failed' });
    });
    area.close();
  });
  test('a kept entry past its expiry takes no room: a long mount of short lives keeps minting', async () => {
    const area = open();
    const list = (exp: number): BootKey[] => Array.from({ length: BOOT_KEYS_MAX }, (_, i) => ({ id: `old${i}`, alias: `hoody-agent auto term ${String(i).padStart(10, 'a')}`, expires_at: new Date(exp + i).toISOString(), at: T0 - 2 * DAY + i }));
    await mounted(area, async () => {
      const bodies: Record<string, unknown>[] = [];
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => 'x000000001' });
      // Control: eight entries that have not ended fill the list, and nothing is sent.
      area.set(BOOT_KEYS_KEY, JSON.stringify(list(T0 + DAY)));
      await expect(p.ensure(UID, { mint: echoMint(bodies) })).rejects.toEqual({ token: '', state: 'failed' });
      expect(bodies).toEqual([]);
      // Eight entries that ended a day ago (one-day lives of this mount): the mint goes out, and they are dropped unasked.
      area.set(BOOT_KEYS_KEY, JSON.stringify(list(T0 - DAY)));
      expect(await p.ensure(UID, { mint: echoMint(bodies) })).toEqual({ token: SECRET, state: 'ok' });
      expect(bodies).toHaveLength(1);
      expect(readBootKeys(area)!.map((k) => k.id)).toEqual(['tok00000000001']);
    });
    area.close();
  });
});
