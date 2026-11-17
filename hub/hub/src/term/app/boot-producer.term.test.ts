// The terminal's boot-token producer and its
// kept boot keys. Real files (hub-store.ts), real core holds in fixture mounts; the mint is a fake standing for core's.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The mint's record (its full name) is on disk before the POST; the body is the web's; the id is kept, then the record freed; the value never reaches a file | 'a mint' |
// | 2 | The value is reused from memory within the mount; one ask per account | 'a mint' |
// | 2b | A kept entry carries the later of the answer's and the requested expiry (none or earlier answered: logout at day 30 still revokes it) | 'an answer with no expiry' |
// | 3 | Unknown outcome: record kept, nothing kept, and no new mint while it is held | 'outcomes' |
// | 4 | Definite refusal frees the record; a 2xx with no id, or an id that cannot be kept, is never handed out | 'outcomes' |
// | 5 | No mint without a writable store, room in the list, the template, or a press's mint | 'refused before anything' |
// | 6 | Revoke: oldest first down to the bound (7 at a start, 0 at logout); expired dropped unasked; a failure stops | 'revokeBootKeys' |
import { afterEach, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHANGE_STORE_KEY, setChangeStoreAdapter, type StoredChange } from '../../core/change-store';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type StoreIo, type TryLock } from '../../../scripts/term/build/hub-store';
import { persistentStore } from '../env/persist';
import { beginTermSession } from '../env/session';
import { fixtureBoot } from './boot';
import type { TermBoot } from './lifecycle';
import { changeStoreOver } from './live-records';
import { resetDirectMemory } from './live-direct';
import { BOOT_KEYS_KEY, BOOT_KEYS_MAX, readBootKeys, revokeBootKeys, type BootKey, type BootKeysArea } from './boot-keys';
import { bootPermsTree, termBootProducer } from './boot-producer';

setDefaultTimeout(30_000);

let flock: TryLock = () => true;
let home = '';
let dir = '';
const opened: number[][] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-boot-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, 'https://api.example.invalid', '64f0ada00000000000000001')!;
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
async function mounted<T>(area: HubStore, fn: () => Promise<T>): Promise<T> {
  const session = beginTermSession();
  const boot: TermBoot = fixtureBoot({ pageIds: ['keys'], page: 'keys', fx: null });
  try {
    await boot.start(session, () => {});
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
const allFiles = (): string => fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

const UID = '64f0ada00000000000000001';
const SECRET = 'hdy_C4NARYb00tT0kenValue000111';
const T0 = Date.parse('2026-11-12T00:00:00Z');
const DAY = 86_400_000;
const TEMPLATES = {
  data: [
    { name: 'read_only', permissions: { computers: { read: true } } },
    { name: 'full_access', permissions: { computers: { read: true, create: true }, financial: { wallet: { read: true, transfer: true, withdraw: true }, billing: { read: true, manage_payment_methods: true } }, resources: { create_tokens: false, vault: false, other: true }, admin: { users: false } } },
  ],
};
interface Sent { method: unknown; path: unknown; body: Record<string, unknown>; owner: unknown; records: StoredChange[] }
function fakeMint(area: HubStore, answer: () => Promise<unknown>, sent: Sent[]) {
  return async (method: unknown, p: unknown, body: unknown, opts?: { owner?: unknown } | null): Promise<unknown> => {
    sent.push({ method, path: p, body: body as Record<string, unknown>, owner: opts?.owner, records: stored(area) });
    return answer();
  };
}
const ok = (id = 'tok00000000001', exp = new Date(T0 + 90 * DAY).toISOString()) => async () => ({ data: { id, token: SECRET, expires_at: exp } });

describe('bootPermsTree', () => {
  test('the full_access tree, financial cut to three read leaves, create_tokens and vault on; nothing else touched', () => {
    expect(bootPermsTree(TEMPLATES)).toEqual({
      computers: { read: true, create: true },
      financial: { wallet: { read: true }, billing: { read: true }, server_rental: { view_marketplace: true } },
      resources: { create_tokens: true, vault: true, other: true },
      admin: { users: false },
    });
    expect(bootPermsTree(TEMPLATES.data)).toEqual(bootPermsTree(TEMPLATES));
    for (const a of [null, {}, { data: [] }, { data: [{ name: 'full_access' }] }, { data: [{ name: 'full_access', permissions: [] }] }]) expect(bootPermsTree(a)).toBeNull();
  });
});

describe('a mint', () => {
  test('record first, the web\'s body, the id kept, the record freed, the value in memory only', async () => {
    const area = open();
    await mounted(area, async () => {
      const sent: Sent[] = [];
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => 'k3v9q2m7xa' });
      const got = await p.ensure(UID, { mint: fakeMint(area, ok(), sent) });
      expect(got).toEqual({ token: SECRET, state: 'ok' });
      expect(sent).toHaveLength(1);
      const s = sent[0]!;
      // The record was on disk, with the token's full name, when the POST went.
      expect(s.records.map((r) => [r.meta?.base, r.attempt, r.admitting])).toEqual([['term.direct.boot-token-mint:k3v9q2m7xa', { alias: 'hoody-agent auto term k3v9q2m7xa' }, undefined]]);
      expect([s.method, s.path, s.owner]).toEqual(['POST', '/auth/tokens', UID]);
      expect(Object.keys(s.body).sort()).toEqual(['alias', 'allow_no_realm', 'event_access', 'expires_at', 'permissions', 'vault_access']);
      expect(s.body).toMatchObject({ alias: 'hoody-agent auto term k3v9q2m7xa', vault_access: true, event_access: true, allow_no_realm: true, permissions: bootPermsTree(TEMPLATES)! });
      expect(Date.parse(s.body.expires_at as string)).toBe(T0 + 90 * DAY);
      // The id and name are kept (never the value); the record is freed.
      expect(readBootKeys(area)).toEqual([{ id: 'tok00000000001', alias: 'hoody-agent auto term k3v9q2m7xa', expires_at: new Date(T0 + 90 * DAY).toISOString(), at: T0 }]);
      await until(() => stored(area).length === 0);
      expect(stored(area)).toEqual([]);
      expect(allFiles()).not.toContain(SECRET);
      expect(allFiles()).not.toContain('C4NARY');
      // Reused from memory: no second mint.
      expect(await p.ensure(UID, { mint: fakeMint(area, ok('tok2'), sent) })).toEqual({ token: SECRET, state: 'ok' });
      expect(await p.ensure(UID)).toEqual({ token: SECRET, state: 'ok' });
      expect(sent).toHaveLength(1);
      // forget() ends the memory: without a press's mint nothing is answered.
      p.forget();
      await expect(p.ensure(UID)).rejects.toEqual({ token: '', state: 'failed' });
    });
    area.close();
  });
  test('a forget overtakes a mint still out: its token is handed to nobody and never written to memory', async () => {
    const area = open();
    await mounted(area, async () => {
      const sent: Sent[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => 'k3v9q2m7xa' });
      const first = p.ensure(UID, { mint: fakeMint(area, async () => { await gate; return ok()(); }, sent) }).then((v) => v, (e: unknown) => e);
      await until(() => sent.length === 1);
      p.forget();
      // A caller in the gap is not handed the old ask.
      const rider = p.ensure(UID).then((v) => v, (e: unknown) => e);
      release();
      expect(await first).toEqual({ token: '', state: 'failed' });
      expect(await rider).toEqual({ token: '', state: 'failed' });
      // Nobody is waiting any more: the late answer left nothing in memory.
      await new Promise((r) => setTimeout(r, 20));
      await expect(p.ensure(UID)).rejects.toEqual({ token: '', state: 'failed' });
      // The key's id is kept, so the next start or `hoody logout` revokes it; the value is in no file.
      expect(readBootKeys(area)!.map((k) => k.id)).toEqual(['tok00000000001']);
      expect(sent).toHaveLength(1);
      expect(allFiles()).not.toContain(SECRET);
    });
    area.close();
  });
  test('an answer with no expiry (or an earlier one): the kept entry has the requested 90 days, so logout still revokes it at day 30', async () => {
    for (const [i, exp] of [undefined, new Date(T0 + 5 * DAY).toISOString()].entries()) {
      dir = hubStoreDir(home, `https://api${i}.example.invalid`, UID)!;
      const area = open();
      await mounted(area, async () => {
        const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => 'k3v9q2m7xa' });
        const answer = async () => ({ data: { id: 'tok00000000001', token: SECRET, ...(exp ? { expires_at: exp } : {}) } });
        expect(await p.ensure(UID, { mint: fakeMint(area, answer, []) })).toEqual({ token: SECRET, state: 'ok' });
        expect(readBootKeys(area)!.map((k) => k.expires_at)).toEqual([new Date(T0 + 90 * DAY).toISOString()]);
        const asked: string[] = [];
        expect(await revokeBootKeys('rw', area, async (id) => { asked.push(id); return 'gone'; }, 0, () => T0 + 30 * DAY)).toEqual({ revoked: 1, left: 0, ok: true });
        expect(asked).toEqual(['tok00000000001']);
      });
      area.close();
      resetDirectMemory();
    }
  });

  test('one ask per account: a second ensure rides the first; a token near its end is minted anew', async () => {
    const area = open();
    await mounted(area, async () => {
      const sent: Sent[] = [];
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      let n = 0, now = T0;
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => now, opId: () => `op${String(++n).padStart(8, '0')}` });
      const mint = fakeMint(area, async () => { await gate; return { data: { id: `tok${n}`, token: SECRET, expires_at: new Date(T0 + 20 * DAY).toISOString() } }; }, sent);
      const a = p.ensure(UID, { mint }), b = p.ensure(UID, { mint });
      await until(() => sent.length === 1);
      release();
      expect(await a).toEqual(await b);
      expect(sent).toHaveLength(1);
      await until(() => stored(area).length === 0);
      // 20 days of life: reused for 6 days, then (inside the 14-day skew) a new mint.
      now = T0 + 5 * DAY;
      await p.ensure(UID, { mint });
      expect(sent).toHaveLength(1);
      now = T0 + 7 * DAY;
      await p.ensure(UID, { mint });
      expect(sent).toHaveLength(2);
      expect(readBootKeys(area)!.map((k) => k.id)).toEqual(['tok1', 'tok2']);
    });
    area.close();
  });
});

describe('outcomes', () => {
  test('unknown: the record stays, nothing is kept, and no new mint goes out while it is held', async () => {
    const area = open();
    await mounted(area, async () => {
      for (const e of [{ kind: 'pending', pending: true }, { kind: 'pending', pending: true, status: 502 }]) {
        const sent: Sent[] = [];
        let asked = 0;
        const p = termBootProducer({ area, templates: async () => { asked++; return TEMPLATES; }, now: () => T0, opId: () => 'k3v9q2m7xa' });
        if (stored(area).length === 0) {
          await expect(p.ensure(UID, { mint: fakeMint(area, async () => { throw e; }, sent) })).rejects.toEqual({ token: '', state: 'failed' });
          expect(sent).toHaveLength(1);
          await new Promise((r) => setTimeout(r, 300));
          expect(stored(area).map((r) => r.meta?.base)).toEqual(['term.direct.boot-token-mint:k3v9q2m7xa']);
          expect(readBootKeys(area)).toEqual([]);
          asked = 0;
        }
        // Held: the next press mints nothing (not even the template is read).
        const q = termBootProducer({ area, templates: async () => { asked++; return TEMPLATES; }, now: () => T0, opId: () => 'zzzzzzzzzz' });
        await expect(q.ensure(UID, { mint: fakeMint(area, ok(), sent) })).rejects.toEqual({ token: '', state: 'failed' });
        expect(asked).toBe(0);
      }
    });
    area.close();
  });
  test('a definite refusal (or a refusal before the send) frees the record; the next press mints again', async () => {
    const area = open();
    await mounted(area, async () => {
      let n = 0;
      const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => `op${String(++n).padStart(8, '0')}` });
      for (const e of [{ kind: 'definite', status: 400, code: 'DUPLICATE_ALIAS' }, { kind: 'not_sent', notSent: true, code: 'NOT_ALLOWED' }, { status: 403 }]) {
        const sent: Sent[] = [];
        await expect(p.ensure(UID, { mint: fakeMint(area, async () => { throw e; }, sent) })).rejects.toEqual({ token: '', state: 'failed' });
        expect(sent).toHaveLength(1);
        await until(() => stored(area).length === 0);
        expect(stored(area)).toEqual([]);
      }
      expect(readBootKeys(area)).toEqual([]);
    });
    area.close();
  });
  test('a 2xx with no id or token, or an id that cannot be kept: never handed out, the record stays', async () => {
    const answers: Array<() => Promise<unknown>> = [async () => ({ data: { token: SECRET } }), async () => ({ data: { id: 'tok1' } }), async () => ({ data: { id: 'bad id!', token: SECRET } }), async () => null];
    for (const answer of answers) {
      const area = open();
      await mounted(area, async () => {
        const p = termBootProducer({ area, templates: async () => TEMPLATES, now: () => T0, opId: () => 'k3v9q2m7xa' });
        await expect(p.ensure(UID, { mint: fakeMint(area, answer, []) })).rejects.toEqual({ token: '', state: 'failed' });
        await new Promise((r) => setTimeout(r, 200));
        expect(stored(area)).toHaveLength(1);
        expect(readBootKeys(area)).toEqual([]);
      });
      area.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
    // The kept list cannot be written (the store refuses): the minted value is not handed out.
    const area = open();
    await mounted(area, async () => {
      const refusing: BootKeysArea = { readOnly: null, failed: () => false, get: (k) => area.get(k), set: () => { throw new Error('ENOSPC'); } };
      const p = termBootProducer({ area: refusing, templates: async () => TEMPLATES, now: () => T0, opId: () => 'k3v9q2m7xa' });
      await expect(p.ensure(UID, { mint: fakeMint(area, ok(), []) })).rejects.toEqual({ token: '', state: 'failed' });
      await new Promise((r) => setTimeout(r, 200));
      expect(stored(area)).toHaveLength(1);
      // Nothing was handed out, so nothing is in memory either.
      await expect(p.ensure(UID)).rejects.toEqual({ token: '', state: 'failed' });
    });
    area.close();
  });
});

describe('refused before anything', () => {
  test('no writable store, a full or unreadable list, no template, or no press\'s mint: no record, no POST', async () => {
    const area = open();
    await mounted(area, async () => {
      const sent: Sent[] = [];
      const run = async (a: BootKeysArea, templates: () => Promise<unknown> = async () => TEMPLATES, withMint = true): Promise<void> => {
        const p = termBootProducer({ area: a, templates, now: () => T0, opId: () => 'k3v9q2m7xa' });
        await expect(p.ensure(UID, withMint ? { mint: fakeMint(area, ok(), sent) } : undefined)).rejects.toEqual({ token: '', state: 'failed' });
      };
      await run({ readOnly: 'busy', failed: () => false, get: (k) => area.get(k), set: (k, v) => area.set(k, v) });
      await run({ readOnly: null, failed: () => true, get: (k) => area.get(k), set: (k, v) => area.set(k, v) });
      await run(area, async () => ({ data: [] }));
      await run(area, async () => { throw new Error('no answer'); });
      await run(area, undefined, false);
      const full: BootKey[] = Array.from({ length: BOOT_KEYS_MAX }, (_, i) => ({ id: `t${i}`, alias: `hoody-agent auto term ${String(i).padStart(10, 'a')}`, expires_at: new Date(T0 + DAY).toISOString(), at: T0 + i }));
      area.set(BOOT_KEYS_KEY, JSON.stringify(full));
      await run(area);
      area.set(BOOT_KEYS_KEY, '{"not":"a list"}');
      await run(area);
      expect(readBootKeys(area)).toBeNull();
      expect(sent).toEqual([]);
      expect(stored(area)).toEqual([]);
      await expect(termBootProducer({ area, templates: async () => TEMPLATES }).ensure('', { mint: fakeMint(area, ok(), sent) })).rejects.toEqual({ token: '', state: 'failed' });
    });
    area.close();
  });
});

describe('revokeBootKeys', () => {
  const key = (i: number, exp = T0 + 30 * DAY): BootKey => ({ id: `t${i}`, alias: `hoody-agent auto term ${String(i).padStart(10, 'a')}`, expires_at: new Date(exp).toISOString(), at: T0 + i });
  test('a start finding the list full revokes the oldest; logout revokes all; expired dropped unasked; a failure stops', async () => {
    const area = open();
    const asked: string[] = [];
    const revoke = (answers: Record<string, 'gone' | 'failed'> = {}) => async (id: string) => { asked.push(id); return answers[id] ?? 'gone'; };
    // Stored out of order: the oldest is by `at`.
    area.set(BOOT_KEYS_KEY, JSON.stringify([key(3), key(1), key(2), key(4), key(5), key(6), key(7), key(0)]));
    expect(await revokeBootKeys('rw', area, revoke(), BOOT_KEYS_MAX - 1, () => T0)).toEqual({ revoked: 1, left: 7, ok: true });
    expect(asked).toEqual(['t0']);
    expect(readBootKeys(area)!.map((k) => k.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    // Not full: nothing to do at a start.
    asked.length = 0;
    expect(await revokeBootKeys('rw', area, revoke(), BOOT_KEYS_MAX - 1, () => T0)).toEqual({ revoked: 0, left: 7, ok: true });
    expect(asked).toEqual([]);
    // Logout, t3 failing: stops there, kept for the next try.
    expect(await revokeBootKeys('rw', area, revoke({ t3: 'failed' }), 0, () => T0)).toEqual({ revoked: 2, left: 5, ok: false });
    expect(asked).toEqual(['t1', 't2', 't3']);
    expect(readBootKeys(area)!.map((k) => k.id)).toEqual(['t3', 't4', 't5', 't6', 't7']);
    // Expired ones go without a request.
    area.set(BOOT_KEYS_KEY, JSON.stringify([key(1, T0 - 1), key(2), key(3, T0)]));
    asked.length = 0;
    expect(await revokeBootKeys('rw', area, revoke(), 0, () => T0)).toEqual({ revoked: 1, left: 0, ok: true });
    expect(asked).toEqual(['t2']);
    expect(readBootKeys(area)).toEqual([]);
    area.close();
  });
  test('a read-only store, or a list that cannot be read: nothing read back or sent', async () => {
    const area = open();
    area.set(BOOT_KEYS_KEY, JSON.stringify([key(1)]));
    const asked: string[] = [];
    const revoke = async (id: string): Promise<'gone'> => { asked.push(id); return 'gone'; };
    for (const mode of ['ro', 'none'] as const) expect(await revokeBootKeys(mode, area, revoke, 0, () => T0)).toEqual({ revoked: 0, left: null, ok: false });
    area.set(BOOT_KEYS_KEY, 'not json');
    expect(await revokeBootKeys('rw', area, revoke, 0, () => T0)).toEqual({ revoked: 0, left: null, ok: false });
    // A value carrying a key value is never read as a list.
    area.set(BOOT_KEYS_KEY, JSON.stringify([{ ...key(1), id: SECRET.slice(0, 30) }]));
    expect(readBootKeys(area)).toBeNull();
    expect(asked).toEqual([]);
    area.close();
  });
});
