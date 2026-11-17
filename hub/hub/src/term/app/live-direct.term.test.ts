// Direct changes: each listed direct api() change gets its own
// durable record before the send, so row 6 admits it; anything else stays refused. Real files (hub-store.ts), real core
// holds in fixture mounts; nothing is sent.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The three listed sites, by route identity; another route or site → NOT_LISTED | 'the listed sites' |
// | 2 | The record is on disk and confirmed before the send: row 6's recordKept is true | 'row 6 admits a listed direct change' |
// | 3 | A second send of the site while the first is out → HELD, unsent; per computer for the agent sign-in | 'one at a time' |
// | 4 | A definite answer frees the record; an unknown one keeps it across a kill: pending at the next mount, never resent | 'after the send' |
// | 5 | No writable store → NOT_DURABLE, nothing written | 'no store' |
// | 6 | Recovery: a held record whose request is over is freed only by a proving read (alias map, read once its PUT can
// |   | no longer land: end + deadline + 60 s; a 2xx agent status for the record's project and computer); a failed read,
// |   | a request still out and a read-only store keep it; nothing is sent again | 'recovery' |
// | 7 | Boot-token mint: one record per mint (op id, full name); freed when its name is in the kept boot keys,
// |   | or after every token of that exact name is revoked, or by an empty list read only once the POST can no longer
// |   | land (end of request + deadline + 60 s; an earlier process ended before this one opened the store) | 'boot-token recovery' |
import { afterEach, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { heldAttempts, holdAttempt } from '../../core/attempts';
import { agentSignInRoutes } from '../../core/agent-signin';
import { tokenMintRoute } from '../../core/boot-token';
import { vaultKeyPutRoute, vaultKeyRoute } from '../../core/realm';
import { redeemRoute, retrySetupRoute } from '../../core/setup';
import { CHANGE_STORE_KEY, setChangeStoreAdapter, type StoredChange } from '../../core/change-store';
import type { Route } from '../../core/routes';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type StoreIo, type TryLock } from '../../../scripts/term/build/hub-store';
import { persistentStore } from '../env/persist';
import { beginTermSession } from '../env/session';
import { fixtureBoot } from './boot';
import type { TermBoot } from './lifecycle';
import { changeStoreOver, recordKept } from './live-records';
import {
  BOOT_LAND_MARGIN_MS, DIRECT_SITES, bootAliasOf, holdDirectChange, noteMintHold, recoverDirectChanges, resetDirectMemory, settleDirectChange,
  type DirectRecoveryDeps, type DirectSite, type DirectTarget, type ListedToken, type MintTarget,
} from './live-direct';

setDefaultTimeout(30_000);

let flock: TryLock = () => true;
let home = '';
let dir = '';
const opened: number[][] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-direct-test-'));
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
function kill(): void { for (const fd of opened.at(-1)!.splice(0)) { try { fs.closeSync(fd); } catch { /* closed */ } } }
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
const P1 = 'a'.repeat(24), C1 = 'c'.repeat(24), C2 = 'd'.repeat(24);
const T1: DirectTarget = { project: P1, computer: C1 }, T2: DirectTarget = { project: P1, computer: C2 };
const OP1 = 'k3v9q2m7xa', OP2 = 'b0b0b0b0b0';
const M1: MintTarget = { op: OP1 }, M2: MintTarget = { op: OP2 };
const SITES: ReadonlyArray<readonly [DirectSite, Route, DirectTarget | MintTarget | null]> = [
  ['boot-token-mint', tokenMintRoute as Route, M1],
  ['agent-bootstrap', agentSignInRoutes.bootstrap as Route, T1],
  ['realm-alias-write', vaultKeyPutRoute as Route, null],
];
const partOf = (t: DirectTarget | MintTarget | null): string => (t === null ? '' : ':' + ('op' in t ? t.op : t.computer));
async function until(fn: () => boolean): Promise<void> { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); }

describe('the listed sites', () => {
  test('exactly three, each with its own route by identity and a named recovery owner', () => {
    expect(Object.keys(DIRECT_SITES).sort()).toEqual(['agent-bootstrap', 'boot-token-mint', 'realm-alias-write']);
    for (const [site, route] of SITES) { expect(DIRECT_SITES[site].route).toBe(route); expect(DIRECT_SITES[site].recovery.length).toBeGreaterThan(10); }
  });
  test('another route at a site, a copy of the route, an unknown site, and the guarded senders\' routes → NOT_LISTED', async () => {
    const area = open();
    await mounted(area, async () => {
      expect(await holdDirectChange('boot-token-mint', vaultKeyPutRoute as Route)).toEqual({ ok: false, code: 'NOT_LISTED' });
      expect(await holdDirectChange('boot-token-mint', { ...tokenMintRoute } as Route)).toEqual({ ok: false, code: 'NOT_LISTED' });
      expect(await holdDirectChange('realm-alias-write', vaultKeyRoute as Route)).toEqual({ ok: false, code: 'NOT_LISTED' });
      for (const r of [redeemRoute, retrySetupRoute]) for (const [site] of SITES) expect((await holdDirectChange(site, r as Route, T1)).ok).toBe(false);
      expect(await holdDirectChange('toString' as DirectSite, tokenMintRoute as Route)).toEqual({ ok: false, code: 'NOT_LISTED' });
      expect(await holdDirectChange('__proto__' as DirectSite, tokenMintRoute as Route)).toEqual({ ok: false, code: 'NOT_LISTED' });
    });
    expect(area.journalGet(CHANGE_STORE_KEY) ?? '[]').toBe('[]');
    area.close();
  });
  test('the agent sign-in names one computer and its project, a mint its op id; the alias write names none', async () => {
    const area = open();
    await mounted(area, async () => {
      const bad: unknown[] = [null, { computer: C1 }, { project: P1 }, { project: P1, computer: '' }, { project: P1, computer: 'C'.repeat(24) },
        { project: P1, computer: 'c'.repeat(23) }, { project: P1, computer: `${C1}:x` }, { project: `${P1}x`, computer: C1 }, { project: 1, computer: C1 },
        { get project(): string { throw new Error('x'); }, computer: C1 }];
      for (const t of [...bad, M1, { ...T1, op: OP1 }]) expect(await holdDirectChange('agent-bootstrap', agentSignInRoutes.bootstrap as Route, t as DirectTarget)).toEqual({ ok: false, code: 'TARGET' });
      // A mint names its op id only: 10 of [a-z0-9].
      const badMint: unknown[] = [null, T1, { op: '' }, { op: 'K3V9Q2M7XA' }, { op: `${OP1}x` }, { op: 'k3v9q2m7x' }, { op: 'k3v9q2m7x-' }, { op: OP1, computer: C1 }, { op: 7 },
        { get op(): string { throw new Error('x'); } }];
      for (const t of badMint) expect(await holdDirectChange('boot-token-mint', tokenMintRoute as Route, t as MintTarget)).toEqual({ ok: false, code: 'TARGET' });
      expect(await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route, T1)).toEqual({ ok: false, code: 'TARGET' });
      expect(await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route, M1)).toEqual({ ok: false, code: 'TARGET' });
    });
    expect(area.journalGet(CHANGE_STORE_KEY) ?? '[]').toBe('[]');
    area.close();
  });
});

describe('row 6 admits a listed direct change', () => {
  test.each(SITES)('%s: its record is on disk and confirmed before the send', async (site, route, target) => {
    const area = open();
    await mounted(area, async () => {
      // Without a record row 6 has nothing to admit.
      expect(recordKept(area, undefined)).toBe(false);
      const got = await holdDirectChange(site, route, target);
      if (!got.ok) throw new Error(got.code);
      expect(recordKept(area, got.record)).toBe(true);
      expect(stored(area).map((r) => r.meta?.base)).toEqual([`term.direct.${site}${partOf(target)}`]);
      // The agent sign-in's record names its project, a mint's the token's full name (what their recovery reads with);
      // the alias write carries nothing.
      expect(stored(area).map((r) => r.attempt ?? null)).toEqual([target === null ? null : 'op' in target ? { alias: `hoody-agent auto term ${target.op}` } : { project: target.project }]);
      // The record is plain: no route body, no token, no secret.
      expect(area.journalGet(CHANGE_STORE_KEY)).not.toMatch(/hdy_|token"|value"/);
      settleDirectChange(got.hold, 'definite');
    });
    area.close();
  });
});

describe('one at a time', () => {
  test('a second send of the site while the first is out → HELD, unsent; a mint per op id', async () => {
    const area = open();
    await mounted(area, async () => {
      const a = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1);
      expect(a.ok).toBe(true);
      expect(await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1)).toMatchObject({ ok: false, code: 'HELD' });
      expect((await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M2)).ok).toBe(true);
      // Another site is its own lock.
      expect((await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route)).ok).toBe(true);
    });
    area.close();
  });
  test('the agent sign-in: per computer', async () => {
    const area = open();
    await mounted(area, async () => {
      const bs = agentSignInRoutes.bootstrap as Route;
      expect((await holdDirectChange('agent-bootstrap', bs, T1)).ok).toBe(true);
      expect((await holdDirectChange('agent-bootstrap', bs, T2)).ok).toBe(true);
      expect(await holdDirectChange('agent-bootstrap', bs, T1)).toMatchObject({ ok: false, code: 'HELD' });
    });
    area.close();
  });
});

describe('after the send', () => {
  test('a definite answer frees the record: row 6 no longer finds it, the next send is admitted', async () => {
    const area = open();
    await mounted(area, async () => {
      const a = await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route);
      if (!a.ok) throw new Error(a.code);
      settleDirectChange(a.hold, 'definite');
      await until(() => stored(area).length === 0);
      expect(stored(area)).toEqual([]);
      expect(recordKept(area, a.record)).toBe(false);
      expect((await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route)).ok).toBe(true);
    });
    area.close();
  });
  test('an unknown outcome keeps it: after a kill it is pending at the next mount and the site is refused HELD', async () => {
    const one = open();
    let record: unknown;
    await mounted(one, async () => {
      const a = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1);
      if (!a.ok) throw new Error(a.code);
      record = a.record;
      settleDirectChange(a.hold, 'unknown');
      // Kept, not freed later either: a free would land within this wait.
      await new Promise((r) => setTimeout(r, 300));
      expect(stored(one)).toHaveLength(1);
    });
    kill();
    const two = open();
    await mounted(two, async () => {
      expect(heldAttempts(`term.direct.boot-token-mint:${OP1}`)).toHaveLength(1);
      expect(recordKept(two, record)).toBe(true);
      expect(await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1)).toMatchObject({ ok: false, code: 'HELD' });
    });
    two.close();
  });
});

describe('no store', () => {
  test('a second Hub (read-only) or a failed store: NOT_DURABLE, nothing written', async () => {
    const first = open();
    const second = open();
    await mounted(second, async () => {
      expect(await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1)).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    });
    await mounted({ ...first, failed: () => true }, async () => {
      expect(await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route)).toMatchObject({ ok: false, code: 'NOT_DURABLE' });
    });
    expect(first.journalGet(CHANGE_STORE_KEY)).toBeNull();
    first.close();
  });
});

describe('recovery', () => {
  interface Calls { aliases: number; status: Array<[string, string]>; lists?: number; revoked?: string[] }
  interface Opts {
    aliases?: 'ok' | 'fail'; status?: 'answered' | 'unread' | 'throw';
    kept?: readonly string[] | null; list?: readonly ListedToken[] | 'fail'; revoke?: 'gone' | 'failed' | 'throw'; opened?: number; at?: number;
  }
  function deps(o: Opts, calls: Calls): DirectRecoveryDeps {
    return {
      readAliases: async () => { calls.aliases++; if (o.aliases === 'fail') throw new Error('no answer'); return {}; },
      agentStatus: async (p, c) => { calls.status.push([p, c]); if (o.status === 'throw') throw new Error('x'); return o.status ?? 'answered'; },
      bootKeyAliases: () => (o.kept === undefined ? [] : o.kept),
      listTokens: async () => { calls.lists = (calls.lists ?? 0) + 1; if (o.list === 'fail') throw new Error('no answer'); return o.list ?? []; },
      revokeToken: async (id) => { (calls.revoked ??= []).push(id); if (o.revoke === 'throw') throw new Error('x'); return o.revoke ?? 'gone'; },
      requestDeadlineMs: DEADLINE,
      storeOpenedAt: o.opened ?? Date.now(),
      now: () => o.at ?? Date.now(),
    };
  }
  const DEADLINE = 30_000;
  // Three unknown outcomes left by a killed mount: an alias write, a sign-in on C1, a boot-token mint.
  async function leaveThree(): Promise<void> {
    const one = open();
    await mounted(one, async () => {
      for (const [site, route, target] of SITES) {
        const a = await holdDirectChange(site, route, target);
        if (!a.ok) throw new Error(a.code);
        settleDirectChange(a.hold, 'unknown');
      }
      // The answers' writes have landed: no stored record still carries a sending stamp.
      await until(() => stored(one).length === 3 && stored(one).every((r) => r.sending === undefined));
      expect(stored(one).every((r) => r.sending === undefined)).toBe(true);
    });
    kill();
  }
  const outcomes = (r: Awaited<ReturnType<typeof recoverDirectChanges>>): Record<string, string> =>
    Object.fromEntries(r.map((x) => [x.lock, x.outcome === 'freed' ? 'freed' : `kept:${x.why}`]));

  test('a proving read frees the sign-in; the alias write and a just-ended mint stay until their request can no longer land; nothing is sent again', async () => {
    await leaveThree();
    const two = open();
    await mounted(two, async () => {
      const calls: Calls = { aliases: 0, status: [] };
      const r = await recoverDirectChanges('rw', deps({}, calls));
      expect(outcomes(r)).toEqual({
        'term.direct.realm-alias-write': 'kept:young',
        [`term.direct.agent-bootstrap:${C1}`]: 'freed',
        [`term.direct.boot-token-mint:${OP1}`]: 'kept:young',
      });
      // The sign-in was read back on the computer it went to, with the project its record named.
      expect(calls).toEqual({ aliases: 1, status: [[P1, C1]], lists: 1 });
      await until(() => stored(two).length === 2);
      expect(stored(two).map((x) => x.meta?.base).sort()).toEqual([`term.direct.boot-token-mint:${OP1}`, 'term.direct.realm-alias-write']);
      // The map answered, but a first PUT (no map yet: no If-Match) may still land over a newer write: none is sent.
      expect(await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route)).toMatchObject({ ok: false, code: 'HELD' });
      // Once neither request can land, the same reads free both.
      const late: Calls = { aliases: 0, status: [] };
      const r2 = await recoverDirectChanges('rw', deps({ at: Date.now() + DEADLINE + BOOT_LAND_MARGIN_MS + 1000 }, late));
      expect(outcomes(r2)).toEqual({ 'term.direct.realm-alias-write': 'freed', [`term.direct.boot-token-mint:${OP1}`]: 'freed' });
      expect(late).toEqual({ aliases: 1, status: [], lists: 1 });
      await until(() => stored(two).length === 0);
      expect(stored(two)).toEqual([]);
      // Freed by the proof: the site sends again only on a new press, under a new record.
      expect((await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route)).ok).toBe(true);
    });
    two.close();
  });

  test('a failed read keeps the record (pending at the next mount too)', async () => {
    await leaveThree();
    const two = open();
    await mounted(two, async () => {
      for (const status of ['unread', 'throw'] as const) {
        const calls: Calls = { aliases: 0, status: [] };
        const r = await recoverDirectChanges('rw', deps({ aliases: 'fail', status, list: 'fail' }, calls));
        expect(outcomes(r)).toEqual({
          'term.direct.realm-alias-write': 'kept:unread',
          [`term.direct.agent-bootstrap:${C1}`]: 'kept:unread',
          [`term.direct.boot-token-mint:${OP1}`]: 'kept:unread',
        });
        expect(calls.revoked).toBeUndefined();
      }
      await new Promise((r) => setTimeout(r, 300));
      expect(stored(two)).toHaveLength(3);
    });
    two.close();
  });

  test('a read-only store (a second Hub) or no store reads nothing and frees nothing', async () => {
    await leaveThree();
    const two = open();
    await mounted(two, async () => {
      for (const mode of ['ro', 'none'] as const) {
        const calls: Calls = { aliases: 0, status: [] };
        expect(await recoverDirectChanges(mode, deps({ list: [{ id: 't1', alias: bootAliasOf(OP1) }] }, calls))).toEqual([]);
        expect(calls).toEqual({ aliases: 0, status: [] });
      }
      expect(stored(two)).toHaveLength(3);
    });
    two.close();
  });

  test('a request still out is never read back; other senders\' holds and a malformed record are left alone', async () => {
    const area = open();
    await mounted(area, async () => {
      const a = await holdDirectChange('realm-alias-write', vaultKeyPutRoute as Route);
      if (!a.ok) throw new Error(a.code);
      const calls: Calls = { aliases: 0, status: [] };
      expect(outcomes(await recoverDirectChanges('rw', deps({}, calls)))).toEqual({ 'term.direct.realm-alias-write': 'kept:in-flight' });
      expect(calls.aliases).toBe(0);
      settleDirectChange(a.hold, 'definite');
      await until(() => stored(area).length === 0);
    });
    area.close();
    // Records under the prefix that no site wrote (an unknown site, a sign-in without its project, a sign-in with an extra
    // part), and a hold of another sender: never read back, never freed.
    const two = open();
    await mounted(two, async () => {
      const made = [
        await holdAttempt('term.direct.other', { by: 'term.direct' }),
        await holdAttempt(`term.direct.agent-bootstrap:${C1}`, { by: 'term.direct' }),
        await holdAttempt(`term.direct.agent-bootstrap:${C2}:x`, { by: 'term.direct', meta: { project: P1 } }),
        await holdAttempt('term.direct.realm-alias-write', { by: 'keys:create' }),
      ];
      for (const m of made) { if (!m.ok) throw new Error(m.code); m.hold.sent(); }
      await until(() => stored(two).length === 4 && stored(two).every((r) => r.sending === undefined));
      const calls: Calls = { aliases: 0, status: [] };
      expect(outcomes(await recoverDirectChanges('rw', deps({}, calls)))).toEqual({
        'term.direct.other': 'kept:unknown',
        [`term.direct.agent-bootstrap:${C1}`]: 'kept:unknown',
        [`term.direct.agent-bootstrap:${C2}:x`]: 'kept:unknown',
      });
      expect(calls).toEqual({ aliases: 0, status: [] });
      expect(stored(two)).toHaveLength(4);
    });
    two.close();
  });
});

describe('boot-token recovery', () => {
  const DEADLINE = 30_000;
  const NAME = bootAliasOf(OP1);
  interface Seen { lists: number; revoked: string[] }
  function bdeps(o: { kept?: readonly string[] | null; list?: readonly ListedToken[] | 'fail'; revoke?: 'gone' | 'failed' | 'throw'; opened: number; at: number }, seen: Seen): DirectRecoveryDeps {
    return {
      readAliases: async () => { throw new Error('not asked'); },
      agentStatus: async () => 'unread',
      bootKeyAliases: () => (o.kept === undefined ? [] : o.kept),
      listTokens: async () => { seen.lists++; if (o.list === 'fail') throw new Error('no answer'); return o.list ?? []; },
      revokeToken: async (id) => { seen.revoked.push(id); if (o.revoke === 'throw') throw new Error('x'); return o.revoke ?? 'gone'; },
      requestDeadlineMs: DEADLINE, storeOpenedAt: o.opened, now: () => o.at,
    };
  }
  // A mint left unknown by a killed mount; the next mount opened the store at `opened`.
  async function leaveMint(): Promise<void> {
    const one = open();
    await mounted(one, async () => {
      const a = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1);
      if (!a.ok) throw new Error(a.code);
      settleDirectChange(a.hold, 'unknown');
      await until(() => stored(one).length === 1 && stored(one)[0]!.sending === undefined);
    });
    kill();
  }
  async function recover(o: Parameters<typeof bdeps>[0]): Promise<{ out: string; seen: Seen; left: number; area: HubStore }> {
    const two = open();
    const seen: Seen = { lists: 0, revoked: [] };
    let out = '';
    await mounted(two, async () => {
      const r = await recoverDirectChanges('rw', bdeps(o, seen));
      out = r.map((x) => (x.outcome === 'freed' ? 'freed' : `kept:${x.why}`)).join(',');
      await new Promise((res) => setTimeout(res, 200));
    });
    const left = stored(two).length;
    two.close();
    return { out, seen, left, area: two };
  }
  const T0 = 1_900_000_000_000;
  const DUE = T0 + DEADLINE + BOOT_LAND_MARGIN_MS;

  test('its name already in the kept boot keys: the mint finished; freed, nothing listed or revoked', async () => {
    await leaveMint();
    expect(await recover({ kept: ['hoody-agent auto term zzzzzzzzzz', NAME], opened: T0, at: T0 })).toMatchObject({ out: 'freed', seen: { lists: 0, revoked: [] }, left: 0 });
  });
  test('a token of exactly that name in the list: revoked, then freed; another name is left alone', async () => {
    await leaveMint();
    const list = [{ id: 'other1', alias: 'hoody-agent auto term zzzzzzzzzz' }, { id: 'stray1', alias: NAME }, { id: 'near', alias: `${NAME} ` }];
    expect(await recover({ list, opened: T0, at: T0 })).toMatchObject({ out: 'freed', seen: { lists: 1, revoked: ['stray1'] }, left: 0 });
  });
  test('two mints left unknown: each stray key is revoked under its own mint record', async () => {
    const one = open();
    await mounted(one, async () => {
      for (const t of [M1, M2]) {
        const a = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, t);
        if (!a.ok) throw new Error(a.code);
        settleDirectChange(a.hold, 'unknown');
      }
      await until(() => stored(one).length === 2 && stored(one).every((r) => r.sending === undefined));
    });
    kill();
    const two = open();
    const under: Array<[string, string]> = [];
    await mounted(two, async () => {
      // (Listed in the other order than the records were written.)
      const d = bdeps({ list: [{ id: 'strayB', alias: bootAliasOf(OP2) }, { id: 'strayA', alias: NAME }], opened: T0, at: T0 }, { lists: 0, revoked: [] });
      const r = await recoverDirectChanges('rw', { ...d, revokeToken: async (id, mint) => { under.push([id, mint.lock]); return 'gone'; } });
      expect(r.map((x) => x.outcome)).toEqual(['freed', 'freed']);
      await new Promise((res) => setTimeout(res, 200));
    });
    two.close();
    expect(under.sort()).toEqual([['strayA', `term.direct.boot-token-mint:${OP1}`], ['strayB', `term.direct.boot-token-mint:${OP2}`]]);
  });
  test('a revoke that fails keeps the record (it blocks new mints until a later pass)', async () => {
    await leaveMint();
    for (const revoke of ['failed', 'throw'] as const) {
      expect(await recover({ list: [{ id: 'stray1', alias: NAME }], revoke, opened: T0, at: T0 })).toMatchObject({ out: 'kept:revoke', seen: { revoked: ['stray1'] }, left: 1 });
    }
  });
  test('an empty list frees it only once the POST can no longer land: store opened + deadline + 60 s', async () => {
    await leaveMint();
    expect(await recover({ list: [], opened: T0, at: DUE })).toMatchObject({ out: 'kept:young', left: 1 });
    expect(await recover({ list: [], opened: T0, at: DUE + 1 })).toMatchObject({ out: 'freed', left: 0 });
  });
  test('a list that fails, or kept boot keys that cannot be read: kept, nothing revoked', async () => {
    await leaveMint();
    expect(await recover({ list: 'fail', opened: T0, at: DUE + 1 })).toMatchObject({ out: 'kept:unread', seen: { revoked: [] }, left: 1 });
    expect(await recover({ kept: null, opened: T0, at: DUE + 1 })).toMatchObject({ out: 'kept:unread', seen: { lists: 0 }, left: 1 });
  });
  test('this process\'s own mint is judged from the end of its request, never from the store\'s opening', async () => {
    const area = open();
    await mounted(area, async () => {
      const a = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M1);
      const b = await holdDirectChange('boot-token-mint', tokenMintRoute as Route, M2);
      if (!a.ok || !b.ok) throw new Error('hold');
      noteMintHold(a.hold); noteMintHold(b.hold);
      // a: its unknown answer came at T0 + 10 min. b: no end time noted (its answer never settled here).
      settleDirectChange(a.hold, 'unknown', T0 + 600_000);
      b.hold.sent();
      await until(() => stored(area).length === 2 && stored(area).every((r) => r.sending === undefined));
      const seen: Seen = { lists: 0, revoked: [] };
      const at = (t: number) => recoverDirectChanges('rw', bdeps({ list: [], opened: T0, at: t }, seen));
      const view = (r: Awaited<ReturnType<typeof at>>) => Object.fromEntries(r.map((x) => [x.lock, x.outcome === 'freed' ? 'freed' : `kept:${x.why}`]));
      expect(view(await at(DUE + 1))).toEqual({ [`term.direct.boot-token-mint:${OP1}`]: 'kept:young', [`term.direct.boot-token-mint:${OP2}`]: 'kept:young' });
      expect(view(await at(DUE + 600_000 + 1))).toEqual({ [`term.direct.boot-token-mint:${OP1}`]: 'freed', [`term.direct.boot-token-mint:${OP2}`]: 'kept:young' });
    });
    area.close();
  });
  test('a mint record whose stored name is not its op\'s: kept as unknown, nothing listed', async () => {
    const area = open();
    await mounted(area, async () => {
      for (const meta of [{ alias: bootAliasOf(OP2) }, { alias: 'x' }, null]) {
        const m = await holdAttempt(`term.direct.boot-token-mint:${OP1}`, meta ? { by: 'term.direct', meta } : { by: 'term.direct' });
        if (!m.ok) throw new Error(m.code);
        m.hold.sent();
        await until(() => stored(area).length === 1 && stored(area)[0]!.sending === undefined);
        const seen: Seen = { lists: 0, revoked: [] };
        const r = await recoverDirectChanges('rw', bdeps({ list: [{ id: 's', alias: bootAliasOf(OP1) }], opened: T0, at: DUE + 1 }, seen));
        expect(r).toEqual([{ lock: `term.direct.boot-token-mint:${OP1}`, outcome: 'kept', why: 'unknown' }]);
        expect(seen).toEqual({ lists: 0, revoked: [] });
        m.hold.release();
        await until(() => stored(area).length === 0);
      }
    });
    area.close();
  });
});
