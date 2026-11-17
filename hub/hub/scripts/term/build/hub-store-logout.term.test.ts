// `hoody logout` and the terminal Hub's kept boot keys (build/hub-store-logout.ts). Real files in a private temp
// directory and the C library's flock; the revoke is a fake standing for the CLI's DELETE /auth/tokens/:id.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | No store for the account: nothing created, nothing sent | 'no store' |
// | 2 | Every kept key revoked, oldest first, the list emptied on disk | 'every kept key' |
// | 3 | A revoke that is refused or never answered keeps that key and every later one: 'kept', never 'done' | 'a revoke that did not answer' |
// | 4 | Another Hub holds the store: nothing sent | 'another Hub' |
// | 5 | A mint record still open: its key may exist, so 'kept' | 'a mint still open' |
// | 6 | A store that cannot be read: nothing sent, nothing set aside | 'a store that cannot be read' |
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ATTEMPT_ID_PREFIX, BOOT_KEYS_KEY, BOOT_MINT_LOCK, CHANGES_KEY, readBootKeys, type BootKey } from '../../../src/term/app/boot-keys';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type TryLock } from './hub-store';
import { revokeKeptBootKeys, type RevokeKeptBootKeysOptions } from './hub-store-logout';

const API = 'https://api.example.invalid';
const UID = '64f0ada00000000000000001';
const T0 = Date.parse('2026-11-12T00:00:00Z');
const DAY = 86_400_000;
let flock: TryLock = () => true;
let home = '';
let dir = '';
const held: HubStore[] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-store-logout-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, API, UID)!;
});
afterEach(() => {
  for (const s of held.splice(0)) s.close();
  fs.rmSync(home, { recursive: true, force: true });
});

const key = (i: number): BootKey => ({ id: `tok${i}`, alias: `hoody-agent auto term ${String(i).padStart(10, 'a')}`, expires_at: new Date(T0 + 60 * DAY).toISOString(), at: T0 + i });
/** A store as a Hub left it: the kept keys (and journal records), lock released. */
function seed(keys: readonly BootKey[], changes?: unknown[]): void {
  const s = openHubStore(dir, { home, tryLock: flock, now: () => T0 });
  s.set(BOOT_KEYS_KEY, JSON.stringify(keys));
  if (changes) s.journalSet(CHANGES_KEY, JSON.stringify(changes));
  s.close();
}
const keptIds = (): string[] | null => {
  const s = openHubStore(dir, { home, tryLock: flock });
  try { return readBootKeys(s)?.map((k) => k.id) ?? null; } finally { s.close(); }
};
function run(answers: Record<string, 'gone' | 'failed' | 'throw'> = {}, over: Partial<RevokeKeptBootKeysOptions> = {}) {
  const asked: string[] = [];
  const revoke = async (id: string): Promise<'gone' | 'failed'> => {
    asked.push(id);
    const a = answers[id] ?? 'gone';
    if (a === 'throw') throw new Error('the answer never came');
    return a;
  };
  return { asked, result: revokeKeptBootKeys({ home, apiOrigin: API, uid: UID, tryLock: flock, revoke, now: () => T0, ...over }) };
}
/** An open attempt record as core/attempts.ts writes it: id = prefix + account + lock + incarnation, meta.base = lock. */
const attempt = (lock: string) => ({ id: `${ATTEMPT_ID_PREFIX}${UID}\u0001${lock}\u0000${'c'.repeat(32)}`, at: T0, fmt: 1, meta: { base: lock, target: null, realm: null, identity: null, by: 'term.direct' } });

describe('hoody logout revokes the kept boot keys', () => {
  test('no store: nothing created, nothing sent; the same account with a store gets its key revoked', async () => {
    const none = run();
    expect(await none.result).toEqual({ state: 'none', revoked: 0, left: 0, open: 0 });
    expect(none.asked).toEqual([]);
    expect(fs.existsSync(path.join(home, '.hoody'))).toBe(false);
    // No home, no uid: nothing either.
    expect((await run({}, { home: undefined }).result).state).toBe('none');
    expect((await run({}, { uid: '' }).result).state).toBe('none');
    // Positive control: a store with one key.
    seed([key(1)]);
    const one = run();
    expect(await one.result).toEqual({ state: 'done', revoked: 1, left: 0, open: 0 });
    expect(one.asked).toEqual(['tok1']);
  });

  test('every kept key: revoked oldest first, the list emptied on disk', async () => {
    seed([key(3), key(1), key(2)]);
    const r = run();
    expect(await r.result).toEqual({ state: 'done', revoked: 3, left: 0, open: 0 });
    expect(r.asked).toEqual(['tok1', 'tok2', 'tok3']);
    expect(keptIds()).toEqual([]);
  });

  test('a revoke that did not answer (refused, or lost): that key and every later one stay listed; never done', async () => {
    seed([key(1), key(2), key(3)]);
    const lost = run({ tok2: 'throw' });
    expect(await lost.result).toEqual({ state: 'kept', revoked: 1, left: 2, open: 0 });
    expect(lost.asked).toEqual(['tok1', 'tok2']);
    expect(keptIds()).toEqual(['tok2', 'tok3']);
    const refused = run({ tok2: 'failed' });
    expect(await refused.result).toEqual({ state: 'kept', revoked: 0, left: 2, open: 0 });
    expect(keptIds()).toEqual(['tok2', 'tok3']);
    // Answered at last: the rest go.
    expect(await run().result).toEqual({ state: 'done', revoked: 2, left: 0, open: 0 });
    expect(keptIds()).toEqual([]);
  });

  test('another Hub holds the store: nothing sent; once it closes, the keys are revoked', async () => {
    seed([key(1), key(2)]);
    const other = openHubStore(dir, { home, tryLock: flock });
    held.push(other);
    expect(other.readOnly).toBeNull();
    const busy = run();
    expect(await busy.result).toEqual({ state: 'busy', revoked: 0, left: 2, open: 0 });
    expect(busy.asked).toEqual([]);
    held.splice(held.indexOf(other), 1);
    other.close();
    const after = run();
    expect(await after.result).toEqual({ state: 'done', revoked: 2, left: 0, open: 0 });
    expect(after.asked).toEqual(['tok1', 'tok2']);
  });

  test('a mint still open: the listed keys are revoked, and the result is kept (its key may exist)', async () => {
    seed([key(1)], [attempt(`${BOOT_MINT_LOCK}k3v9q2m7xa`)]);
    const r = run();
    expect(await r.result).toEqual({ state: 'kept', revoked: 1, left: 0, open: 1 });
    expect(r.asked).toEqual(['tok1']);
    // Positive control: an open record of another kind is not a mint.
    seed([key(2)], [attempt('term.direct.realm-alias-write')]);
    expect(await run().result).toEqual({ state: 'done', revoked: 1, left: 0, open: 0 });
  });

  test('a store that cannot be read: nothing sent, the file left where it is', async () => {
    seed([key(1)]);
    fs.writeFileSync(path.join(dir, 'store.json'), '{not json', { mode: 0o600 });
    const r = run();
    expect(await r.result).toEqual({ state: 'unreadable', revoked: 0, left: 0, open: 0 });
    expect(r.asked).toEqual([]);
    expect(fs.readdirSync(dir).sort()).toEqual(['journal.jsonl', 'lock', 'store.json']);
    expect(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')).toBe('{not json');
    // A list of another shape: the store opens, the list is not read, nothing sent.
    fs.rmSync(path.join(dir, 'store.json'));
    const s = openHubStore(dir, { home, tryLock: flock });
    s.set(BOOT_KEYS_KEY, '{"not":"a list"}');
    s.close();
    const odd = run();
    expect((await odd.result).state).toBe('unreadable');
    expect(odd.asked).toEqual([]);
  });
});
