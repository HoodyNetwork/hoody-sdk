// What the terminal Hub keeps on disk (persist.ts): only listed keys, only values of the
// listed shape, and nothing shaped like a credential. The canary tests run over the REAL files (hub-store.ts).
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STORAGE_REGISTRY } from '../../core/registry';
import type { KeyValueStore } from '../../core/host-env';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type TryLock } from '../../../scripts/term/build/hub-store';
import { NotDurable, PERSISTED, persistRule, persistentStore, type PersistArea } from './persist';
import { SECRET_SHAPED } from './secret-shaped';
import { KINDS, validEntry } from '../../ask/journal/entries';
import { validRec } from '../../ask/logic';

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
let home = '';
let dir = '';
let flock: TryLock = () => true;
let store: HubStore;
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-persist-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, 'https://api.example.invalid', '64f0ada00000000000000001')!;
  store = openHubStore(dir, { home, tryLock: flock });
});
afterEach(() => { store.close(); fs.rmSync(home, { recursive: true, force: true }); });
/** Every byte under the store directory, as one string. */
const onDisk = (): string => fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const why = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof NotDurable ? `${e.code} ${e.why}` : `other: ${String(e)}`; } return 'kept'; };

const ACCOUNT = '64f0ada00000000000000001';
const change = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: `${ACCOUNT}\u0001computers.rename\u00016f1d`, pending: true, key: 'idem-2f6c1a', at: 1_800_000_000_000, fmt: 1, inc: 'a1B2', nonce: 'c3D4', oc: 'e5F6', t: 1_800_000_000_001,
  meta: { base: 'https://api.example.invalid', target: { project: { id: 'a'.repeat(24) }, computer: { id: 'b'.repeat(24) } }, realm: 'f'.repeat(24), by: ACCOUNT },
  sending: { tab: 't1', at: 1_800_000_000_002 }, ...over,
});
const CANARIES = ['hdy_live_4f9a8b7c6d5e4f3a2b1c', 'hbk_9f8e7d6c5b4a39281706', 'Bearer abcdefghijklmnop', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl', ['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' '), 'sk-abcdefghijklmnopqrstuv'] as const;
/** The JSON text with the canary's first character written as a \u escape: the same value once parsed, but the text
 *  no longer holds the canary, so only a check of the parsed strings can see it. */
const escapeFirst = (json: string, c: string): string => {
  expect(json.includes(c), c).toBe(true);
  return json.split(c).join(`\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}${c.slice(1)}`);
};

describe('the list of kept keys', () => {
  test('every kept key is a registry key of the local area, each listed once', () => {
    const local = new Set(STORAGE_REGISTRY.filter((e) => e.area === 'local' && 'key' in e).map((e) => (e as { key: string }).key));
    for (const r of PERSISTED) expect(local.has(r.key), r.key).toBe(true);
    expect(new Set(PERSISTED.map((r) => r.key)).size).toBe(PERSISTED.length);
  });
  test('exactly these keys, in these groups (a new one is a decision, not a side effect)', () => {
    expect(PERSISTED.map((r) => `${r.group} ${r.key}${r.check ? '' : ' (shape not written: refused)'}`)).toEqual([
      'recovery hub.v3.changes', 'recovery hub.v3.script-asks',
      'recovery hub_voice_pending_v1', 'recovery hub_ai_req_v1',
      'recovery hub_ai_lease_v1', 'recovery hub_ai_journal_v1',
      'recovery hub_money_pending', 'recovery hub_money_upgrade', 'recovery hub_market_pending', 'recovery hub.v3.topup_pending', 'recovery hub.v3.rent_pending',
      'preference hub_realm_colors', 'preference hub.v3.shell', 'preference hub_theme_v1', 'preference hub_hl_v1',
      'preference hub_boot_token_ttl_days',
    ]);
    // The realm selection is never kept, nor a session, a token or a draft.
    for (const k of ['hub_realm_v1', 'hoody_session', 'hoody_token', 'hub.v3.standalone_api']) expect(persistRule(k), k).toBeNull();
  });
});

describe('a key that is not on the list', () => {
  test('a canary written through every other registry key reaches no file, and still reads back in memory', () => {
    const s = persistentStore(memory(), store);
    const names = STORAGE_REGISTRY.filter((e) => e.area === 'local').map((e) => ('key' in e ? (e as { key: string }).key : `${(e as { prefix: string }).prefix}${ACCOUNT}`)).filter((k) => !persistRule(k));
    expect(names.length).toBeGreaterThan(20);
    names.forEach((k, i) => { s.setItem(k, `canary-${i}-value`); });
    names.forEach((k, i) => { expect(s.getItem(k), k).toBe(`canary-${i}-value`); });
    expect(onDisk()).not.toContain('canary-');
    for (const k of names) expect(onDisk().includes(k), k).toBe(false);
    expect(s.length).toBe(names.length);
  });
});

describe('held changes (the journal)', () => {
  test('a record of the listed shape is on disk when setItem returns, and is read back from the files by the next Hub', () => {
    const s = persistentStore(memory(), store);
    const text = JSON.stringify([change()]);
    s.setItem('hub.v3.changes', text);
    expect(fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8')).toContain('idem-2f6c1a');
    expect(s.getItem('hub.v3.changes')).toBe(text);
    store.close();
    store = openHubStore(dir, { home, tryLock: flock });
    expect(persistentStore(memory(), store).getItem('hub.v3.changes')).toBe(text);
  });
  // The record core's guarded changes write on the real API: the page that asked, and the computer
  // named with its server's host name.
  test('a guarded page change (meta.page, a computer with its server_name) is kept', () => {
    const s = persistentStore(memory(), store);
    const guarded = (computer: unknown, page: unknown): string => JSON.stringify([change({ meta: { base: 'lock:keys.key_edit', target: { project: { id: 'a'.repeat(24) }, computer }, realm: null, by: 'q:PUT base /auth/tokens/:id@keys.key_edit/keys', page, identity: { uid: ACCOUNT } } })]);
    const text = guarded({ id: 'b'.repeat(24), server_name: 'node-teal' }, 'keys');
    expect(why(() => { s.setItem('hub.v3.changes', text); })).toBe('kept');
    expect(s.getItem('hub.v3.changes')).toBe(text);
    const container = JSON.stringify([change({ meta: { base: 'b', target: { project: { id: 'p' }, container: { id: 'c', server_name: 'host-1.example.invalid' } }, realm: null, page: 'computers' } })]);
    expect(why(() => { s.setItem('hub.v3.changes', container); })).toBe('kept');
    // core/changes.ts records on every send whether the change files across realms (ChangeMeta.across): kept, true or false.
    for (const across of [true, false]) expect(why(() => { s.setItem('hub.v3.changes', JSON.stringify([change({ meta: { base: 'b', target: null, realm: null, across } })])); })).toBe('kept');
    expect(why(() => { s.setItem('hub.v3.changes', guarded({ id: 'b'.repeat(24), server_name: 'Host_1' }, 'keys')); })).toBe('kept');
    for (const bad of [guarded({ id: 'b'.repeat(24), server_name: 'Host Name' }, 'keys'), guarded({ id: 'b'.repeat(24), server_name: '-flag' }, 'keys'), guarded({ id: 'b'.repeat(24), server_name: '..' }, 'keys'), guarded({ id: 'b'.repeat(24), server_name: 'h', note: 'x' }, 'keys'), guarded({ id: 'b'.repeat(24) }, 'a page'), guarded({ id: 'b'.repeat(24) }, 7)])
      expect(why(() => { s.setItem('hub.v3.changes', bad); }), bad.slice(-120)).toBe('NOT_DURABLE shape');
  });
  const refusedShapes: Array<[string, unknown]> = [
    ['a field the record does not have (the variables of a change)', [change({ variables: { name: 'x' } })]],
    ['an unknown field inside meta', [change({ meta: { base: 'https://api.example.invalid', target: null, realm: null, token: 'x' } })]],
    ['a cross-realm mark that is not a mark', [change({ meta: { base: 'https://api.example.invalid', target: null, realm: null, across: 'yes' } })]],
    ['an unknown field inside the target', [change({ meta: { base: 'b', target: { project: { id: 'p' }, computer: { id: 'c' }, note: 'x' }, realm: null } })]],
    ['an over-long key', [change({ key: 'k'.repeat(257) })]],
    ['an over-long string in the sender\'s metadata', [change({ attempt: { label: 'x'.repeat(257) } })]],
    ['metadata nested too deep', [change({ attempt: { a: { b: { c: { d: { e: 1 } } } } } })]],
    ['a metadata field name that is not a plain name', [change({ attempt: { 'a b': 1 } })]],
    ['not a list', change()],
    ['not JSON', 'x'],
  ];
  for (const [what, value] of refusedShapes) {
    test(`refused, nothing written: ${what}`, () => {
      const s = persistentStore(memory(), store);
      const before = onDisk();
      expect(why(() => { s.setItem('hub.v3.changes', typeof value === 'string' ? value : JSON.stringify(value)); })).toBe('NOT_DURABLE shape');
      expect(onDisk()).toBe(before);
      expect(s.getItem('hub.v3.changes')).toBeNull();
    });
  }
  test('a secret planted in a change (its variables, a field name, its metadata, its key) reaches neither file', () => {
    const s = persistentStore(memory(), store);
    for (const c of CANARIES) {
      expect(SECRET_SHAPED.test(c), c).toBe(true);
      const plants: unknown[] = [
        [change({ variables: { password: c } })],
        [change({ attempt: { [c]: 1 } })],
        [change({ attempt: { note: c } })],
        [change({ attempt: { list: [{ deep: c }] } })],
        [change({ meta: { base: 'https://api.example.invalid', target: null, realm: null, identity: { who: c } } })],
        [change({ meta: { base: 'https://api.example.invalid', target: null, realm: null, by: c } })],
        [change({ key: c })],
        [change({ id: `${ACCOUNT}\u0001${c}` })],
      ];
      for (const p of plants) expect(why(() => { s.setItem('hub.v3.changes', JSON.stringify(p)); }), JSON.stringify(p).slice(0, 120)).toBe('NOT_DURABLE shape');
    }
    const disk = onDisk();
    for (const c of CANARIES) expect(disk.includes(c), c).toBe(false);
    expect(disk).not.toContain('hdy_');
    // A plain record still goes through after all of those.
    expect(why(() => { s.setItem('hub.v3.changes', JSON.stringify([change({ attempt: { route: 'computers.rename', tries: 1, parts: ['a', 'b'] } })])); })).toBe('kept');
  });
  // The whole-text check hid the per-field checks. A JSON-escaped secret passes the
  // whole-text check, so only the field checks (metadata strings, the idempotency key) refuse these.
  const escapedPlants: Array<[string, (c: string) => unknown]> = [
    ['a string in the sender\'s metadata', (c) => [change({ attempt: { note: c } })]],
    ['a string in the identity metadata', (c) => [change({ meta: { base: 'https://api.example.invalid', target: null, realm: null, identity: { who: c } } })]],
    ['the idempotency key', (c) => [change({ key: c })]],
  ];
  for (const [where, plant] of escapedPlants) {
    test(`a JSON-escaped secret in ${where}: refused on write, not handed to core on read`, () => {
      for (const c of [CANARIES[0], CANARIES[5]]) {
        const text = escapeFirst(JSON.stringify(plant(c)), c);
        expect(SECRET_SHAPED.test(text), 'the whole-text check does not see it').toBe(false);
        const s = persistentStore(memory(), store);
        expect(why(() => { s.setItem('hub.v3.changes', text); }), c).toBe('NOT_DURABLE shape');
        expect(onDisk()).not.toContain(c.slice(1));
        store.journalSet('hub.v3.changes', text);
        expect(s.getItem('hub.v3.changes'), c).toBeNull();
        store.journalDel('hub.v3.changes');
      }
    });
  }
  test('every kept key has a shape check: none is refused as unchecked, none is kept unchecked', () => {
    expect(PERSISTED.filter((r) => r.check === null).map((r) => r.key)).toEqual([]);
  });
  test('a store that failed, or one another Hub holds, refuses the write (core then sends nothing)', () => {
    const text = JSON.stringify([change()]);
    const second = openHubStore(dir, { home, tryLock: flock });
    expect(second.readOnly).toBe('busy');
    expect(why(() => { persistentStore(memory(), second).setItem('hub.v3.changes', text); })).toBe('NOT_DURABLE read-only');
    second.close();
    const failing: PersistArea = { ...store, readOnly: null, failed: () => false, journalSet: () => { throw new Error('EIO'); } };
    expect(why(() => { persistentStore(memory(), failing).setItem('hub.v3.changes', text); })).toBe('NOT_DURABLE failed');
    const failed: PersistArea = { ...store, readOnly: null, failed: () => true };
    expect(why(() => { persistentStore(memory(), failed).setItem('hub.v3.changes', text); })).toBe('NOT_DURABLE failed');
    expect(why(() => { persistentStore(memory(), failed).removeItem('hub.v3.changes'); }), 'nothing held: nothing to remove').toBe('kept');
  });
  test('removing the last held change is durable too; a read-only store refuses the removal', () => {
    const s = persistentStore(memory(), store);
    s.setItem('hub.v3.changes', JSON.stringify([change()]));
    const second = openHubStore(dir, { home, tryLock: flock });
    expect(why(() => { persistentStore(memory(), second).removeItem('hub.v3.changes'); })).toBe('NOT_DURABLE read-only');
    second.close();
    s.removeItem('hub.v3.changes');
    expect(s.getItem('hub.v3.changes')).toBeNull();
    store.close();
    store = openHubStore(dir, { home, tryLock: flock });
    expect(store.journalGet('hub.v3.changes')).toBeNull();
  });
  test('a value on disk that this build would not have written is not handed to core', () => {
    store.journalSet('hub.v3.changes', JSON.stringify([change({ variables: { a: 1 } })]));
    expect(persistentStore(memory(), store).getItem('hub.v3.changes')).toBeNull();
  });
});

describe('the other records of a change whose outcome is not known', () => {
  const K16 = 'k'.repeat(16);
  const ask = { askId: 'a1', compId: 'c1', path: null, realm: null, owner: ACCOUNT, sessionId: null, turnId: null, phase: 'create', sentAt: 1, createKey: 'ck', turnKey: 'tk' };
  const draft = { draftId: 'abcdefghi1', mode: 'write', project: 'p1', compId: 'c1', realm: 'r1', owner: ACCOUNT, exec: 1, current: 0, retained: null, state: 'open', deploy: null, updatedAt: 1 };
  const good: Record<string, unknown> = {
    'hub.v3.script-asks': { v: 2, accounts: { [ACCOUNT]: [ask] }, drafts: { [ACCOUNT]: [draft] } },
    // commerce.ts:2195/2198 build these; claimFenced adds phase 'sending' before the POST, an unsettled end rewrites 'held'.
    'hub_money_pending': [{ kind: 'buy', user_id: ACCOUNT, key: 'key-1', max_charge_cents: 1500, at: 1, title: 'Plus', family_id: 'a'.repeat(24), plan_id: 'plus', phase: 'sending' }, { kind: 'pay', user_id: ACCOUNT, key: 'key-2', max_charge_cents: 0, at: 2, sub_id: 'sub_1', phase: 'held' }, { kind: 'pay', user_id: ACCOUNT, key: 'key-3', max_charge_cents: 0, at: 3, sub_id: 'sub_2' }],
    // commerce.ts:2197 builds it; claimUpgrade adds phase 'sending'.
    'hub_money_upgrade': [{ kind: 'upgrade', user_id: ACCOUNT, key: 'key-4', max_charge_cents: 2500, at: 4, sub_id: 'sub_1', plan_id: 'pro', title: 'Pro', phase: 'sending' }, { kind: 'upgrade', user_id: ACCOUNT, key: 'key-5', max_charge_cents: 0, at: 5, sub_id: 'sub_2', plan_id: 'plus', title: null }],
    'hub_market_pending': [{ user_id: ACCOUNT, offer_id: 'offer-1', days: '30', ceiling: 9900, key: K16, at: 1, name: 'ash-3', flights: [{ id: 'flight-01', at: 2 }], sent_at: 2, sends: ['flight-01'] }],
    'hub.v3.rent_pending': [{ user_id: ACCOUNT, server_id: 'srv-1', name: null, days: '7', at: 1, dismissed: false, sending: true, attempt: K16 }],
    'hub.v3.topup_pending': [{ user_id: ACCOUNT, key: K16, method: 'card', amount: '25.00', at: 1 }, { user_id: ACCOUNT, key: K16 + '2', method: 'crypto', amount: '100.00', at: 2, sending: K16, sending_at: 3 }],
  };
  /** One change to a good value that must refuse it: [what, the changed value]. */
  const row = (key: string, over: Record<string, unknown>, i = 0): unknown => (good[key] as Array<Record<string, unknown>>).map((r, j) => (j === i ? { ...r, ...over } : r));
  const bad: Array<[string, string, unknown]> = [
    ['hub.v3.script-asks', 'a prompt on an ask', { v: 2, accounts: { [ACCOUNT]: [{ ...ask, prompt: 'do it' }] }, drafts: {} }],
    ['hub.v3.script-asks', 'script text on a draft', { v: 2, accounts: {}, drafts: { [ACCOUNT]: [{ ...draft, text: 'echo' }] } }],
    ['hub.v3.script-asks', 'an unknown top-level field', { v: 2, accounts: {}, drafts: {}, extra: 1 }],
    ['hub.v3.script-asks', 'another version', { v: 3, accounts: {}, drafts: {} }],
    ['hub_money_pending', 'a card number field', row('hub_money_pending', { card: '4242' })],
    ['hub_money_pending', 'a negative charge', row('hub_money_pending', { max_charge_cents: -1 })],
    ['hub_money_pending', 'a payment that also names a plan', row('hub_money_pending', { plan_id: 'plus' }, 1)],
    ['hub_money_pending', 'an over-long title', row('hub_money_pending', { title: 'x'.repeat(201) })],
    ['hub_money_pending', 'a phase core never writes', row('hub_money_pending', { phase: 'sent' })],
    ['hub_money_upgrade', 'a buy or a payment under the upgrade key', row('hub_money_upgrade', { kind: 'buy' })],
    ['hub_money_upgrade', 'no plan', row('hub_money_upgrade', { plan_id: undefined })],
    ['hub_money_upgrade', 'a family (a buy\'s field)', row('hub_money_upgrade', { family_id: 'a'.repeat(24) })],
    ['hub_money_upgrade', 'a phase core never writes', row('hub_money_upgrade', { phase: 'done' })],
    ['hub_money_upgrade', 'an over-long title', row('hub_money_upgrade', { title: 'x'.repeat(201) })],
    ['hub_market_pending', 'an unknown field', row('hub_market_pending', { note: 'x' })],
    ['hub_market_pending', 'a short key', row('hub_market_pending', { key: 'short' })],
    ['hub_market_pending', 'an unknown field on a flight', row('hub_market_pending', { flights: [{ id: 'flight-01', at: 2, url: 'x' }] })],
    ['hub.v3.rent_pending', 'an unknown field', row('hub.v3.rent_pending', { token: 'x' })],
    ['hub.v3.rent_pending', 'days that are not a number', row('hub.v3.rent_pending', { days: '7d' })],
    ['hub.v3.topup_pending', 'a method that is not a short word', row('hub.v3.topup_pending', { method: 7 })],
    ['hub.v3.topup_pending', 'an over-long method', row('hub.v3.topup_pending', { method: 'x'.repeat(33) })],
    ['hub.v3.topup_pending', 'an amount that is not money', row('hub.v3.topup_pending', { amount: '25' })],
    ['hub.v3.topup_pending', 'a checkout address', row('hub.v3.topup_pending', { url: 'https://pay.example.invalid/s/abc' })],
    ['hub.v3.topup_pending', 'a sending stamp without its time', row('hub.v3.topup_pending', { sending: K16 })],
  ];
  test('a record of the listed shape is kept, key by key', () => {
    const s = persistentStore(memory(), store);
    for (const [k, v] of Object.entries(good)) {
      expect(why(() => { s.setItem(k, JSON.stringify(v)); }), k).toBe('kept');
      expect(JSON.parse(s.getItem(k)!), k).toEqual(v);
    }
    expect(store.journalKeys().sort()).toEqual(Object.keys(good).sort());
  });
  // A hold written before the method was named "card" (any stored word that is not the crypto one) is still a
  // record: core/commerce.ts reads it as the card method, so the terminal must keep it on disk.
  test('a top-up hold stored under an earlier method word is kept', () => {
    const s = persistentStore(memory(), store);
    const old = 'earlier-word';
    const v = row('hub.v3.topup_pending', { method: old });
    expect(why(() => { s.setItem('hub.v3.topup_pending', JSON.stringify(v)); })).toBe('kept');
    expect(JSON.parse(s.getItem('hub.v3.topup_pending')!)).toEqual(v);
  });
  for (const [k, what, v] of bad) {
    test(`${k}: refused, nothing written: ${what}`, () => {
      const s = persistentStore(memory(), store);
      const before = onDisk();
      expect(why(() => { s.setItem(k, JSON.stringify(v)); })).toBe('NOT_DURABLE shape');
      expect(onDisk()).toBe(before);
    });
  }
  test('a credential-shaped value in any of them is refused', () => {
    const s = persistentStore(memory(), store);
    expect(why(() => { s.setItem('hub_money_pending', JSON.stringify(row('hub_money_pending', { title: CANARIES[0] }))); })).toBe('NOT_DURABLE shape');
    expect(why(() => { s.setItem('hub_market_pending', JSON.stringify(row('hub_market_pending', { name: CANARIES[2] }))); })).toBe('NOT_DURABLE shape');
    expect(why(() => { s.setItem('hub.v3.rent_pending', JSON.stringify(row('hub.v3.rent_pending', { name: CANARIES[3] }))); })).toBe('NOT_DURABLE shape');
    expect(onDisk()).not.toContain('hdy_');
  });
  // A secret whose first character is JSON-escaped ("hdy_…") passes the whole-text check; the parsed strings
  // are checked one by one, field names included.
  const plants: Array<[string, string, string, unknown]> = [
    ['hub_money_pending', 'a title', CANARIES[0], row('hub_money_pending', { title: CANARIES[0] })],
    ['hub.v3.script-asks', 'an account name (a map key)', CANARIES[1], { v: 1, accounts: { [CANARIES[1]]: [ask] } }],
    ['hub_money_upgrade', 'a title', CANARIES[3], row('hub_money_upgrade', { title: CANARIES[3] })],
    ['hub_market_pending', 'a server name', CANARIES[2], row('hub_market_pending', { name: CANARIES[2] })],
    ['hub.v3.rent_pending', 'a server name', CANARIES[4], row('hub.v3.rent_pending', { name: CANARIES[4] })],
    ['hub.v3.script-asks', 'a script path', CANARIES[5], { v: 1, accounts: { [ACCOUNT]: [{ ...ask, path: CANARIES[5] }] } }],
  ];
  for (const [k, where, c, v] of plants) {
    test(`${k}: a JSON-escaped secret in ${where} is refused on write and not handed to core on read`, () => {
      const text = escapeFirst(JSON.stringify(v), c);
      expect(SECRET_SHAPED.test(text), 'the whole-text check does not see it').toBe(false);
      expect(JSON.stringify(JSON.parse(text))).toBe(JSON.stringify(v));
      const s = persistentStore(memory(), store);
      expect(why(() => { s.setItem(k, text); })).toBe('NOT_DURABLE shape');
      expect(onDisk()).not.toContain(c.slice(1));
      store.journalSet(k, text);
      // Never handed to core. The scripts writer's key reads as unreadable (so core never writes over it); the others as nothing.
      if (k === 'hub.v3.script-asks') expect(why(() => s.getItem(k))).toBe('NOT_DURABLE shape');
      else expect(s.getItem(k)).toBeNull();
    });
  }
});

describe('preferences (store.json)', () => {
  test('a colour, the folded menu, the theme and the highlight are kept across Hubs', () => {
    const s = persistentStore(memory(), store);
    s.setItem('hub_realm_colors', JSON.stringify({ ['f'.repeat(24)]: 'teal' }));
    s.setItem('hub.v3.shell', '{"collapsed":true}');
    s.setItem('hub_theme_v1', 'dark');
    s.setItem('hub_hl_v1', 'violet');
    store.close();
    store = openHubStore(dir, { home, tryLock: flock });
    const next = persistentStore(memory(), store);
    expect(next.getItem('hub_theme_v1')).toBe('dark');
    expect(next.getItem('hub.v3.shell')).toBe('{"collapsed":true}');
    expect(JSON.parse(next.getItem('hub_realm_colors')!)).toEqual({ ['f'.repeat(24)]: 'teal' });
    expect(next.getItem('hub_hl_v1')).toBe('violet');
    next.removeItem('hub_theme_v1');
    expect(next.getItem('hub_theme_v1')).toBeNull();
    expect(store.get('hub_theme_v1')).toBeNull();
  });
  test('a value of another shape works for this mount and is not written', () => {
    const s = persistentStore(memory(), store);
    const bad: Array<[string, string]> = [['hub_theme_v1', 'solarized'], ['hub.v3.shell', '{"collapsed":true,"token":"x"}'], ['hub_realm_colors', '{"not-a-realm":"teal"}'], ['hub_realm_colors', JSON.stringify({ ['f'.repeat(24)]: CANARIES[0] })], ['hub_hl_v1', CANARIES[0]!]];
    for (const [k, v] of bad) {
      s.setItem(k, v);
      expect(s.getItem(k), k).toBe(v);
      expect(store.get(k), k).toBeNull();
    }
    expect(onDisk()).not.toContain('solarized');
    expect(onDisk()).not.toContain('hdy_');
  });
  test('a read-only store: the choice holds for this mount, nothing is written, the stored one is untouched', () => {
    store.set('hub_theme_v1', 'dark');
    const second = openHubStore(dir, { home, tryLock: flock });
    const s = persistentStore(memory(), second);
    expect(s.getItem('hub_theme_v1')).toBe('dark');
    s.setItem('hub_theme_v1', 'light');
    expect(s.getItem('hub_theme_v1')).toBe('light');
    s.removeItem('hub_theme_v1');
    expect(s.getItem('hub_theme_v1')).toBeNull();
    second.close();
    expect(store.get('hub_theme_v1')).toBe('dark');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'))).toEqual({ v: 1, keys: { hub_theme_v1: 'dark' } });
  });
  test('the names the store lists are the memory keys and the kept keys that hold a value, each once', () => {
    const s = persistentStore(memory(), store);
    s.setItem('some.memory.key', '1');
    s.setItem('hub_theme_v1', 'dark');
    s.setItem('hub.v3.changes', JSON.stringify([change()]));
    const names = Array.from({ length: s.length }, (_, i) => s.key(i));
    expect(names.sort()).toEqual(['hub.v3.changes', 'hub_theme_v1', 'some.memory.key']);
    expect(s.key(s.length)).toBeNull();
  });
});

// The AI journal (ask/journal): the write-ahead record of every AI chat request. Without it on disk no chat message
// leaves the terminal ("could not keep a record of this send"); with anything but identities in it a prompt would be kept.
describe('the AI journal', () => {
  const H = 'ash.1a2b', K1 = 'hx-' + 'a'.repeat(32), K2 = 'hx-' + 'b'.repeat(32), KQ = 'hx-' + 'c'.repeat(24), R = 'f'.repeat(24);
  const entry = { k: K2, kind: 'turn', h: H, r: R, s: 'ses_1', c: K1, ct: 'b'.repeat(24), at: 1_800_000_000_000 };
  const created = { k: K1, kind: 'create', h: H, r: 'global', s: null, c: K1, ct: 'b'.repeat(24), at: 1 };
  const decided = { k: KQ, kind: 'decision', h: H, r: R, s: 'ses_1', c: K1, ct: 'b'.repeat(24), g: 'gate-1', gn: 2, f: 1, at: 2 };
  const rec = { p: 'p1', c: 'b'.repeat(24), r: R, s: 'ses_1', t: 'turn_1', k1: K1, k2: K2, rc: 'custom', n: null, at: 5, i: null, q: 0, ph: 'working', l: 'en', h: H };
  const fork = { ...rec, s: null, t: null, fk: { s: 'ses_0', i: 3 }, rp: true };
  const doc = (v: unknown, acct: string = ACCOUNT): string => JSON.stringify({ v: 1, a: { [acct]: v } });
  const name = (e: { h: string; k: string }): string => `${e.h}:${e.k}`;
  const id = (r: { h: string; r: string; s: string | null; k1: string }): string => `${r.h}|${r.r}|${r.s ?? 'create:' + r.k1}`;
  const good: Array<[string, string]> = [
    ['hub_ai_req_v1', doc({ [name(entry)]: entry, [name(created)]: created, [name(decided)]: decided })],
    ['hub_ai_req_v1', doc({})],
    ['hub_ai_lease_v1', doc({ [`${H}:ses_1`]: 'lease-0123456789' })],
    ['hub_ai_journal_v1', doc({ [id(rec)]: rec, [id(fork)]: fork })],
    ['hub_ai_journal_v1', doc({ [id(rec)]: { ...rec, kp: true, w: true, k3: ['hx-' + 'd'.repeat(32)], dk: [K2], u: 'turn_1', da: { 'gate-1': KQ } } })],
    // What the journal's writers store without the dock validator's normal form (records.ts claimFirst, turnFenced): an
    // empty list, a repeated key, a key that is also k2. Each must be kept, or that chat could not send again.
    ['hub_ai_journal_v1', doc({ [id(rec)]: { ...rec, dk: [], na: [] } })],
    ['hub_ai_journal_v1', doc({ [id(rec)]: { ...rec, dk: [K2, K2], na: [K2] } })],
    ['hub_ai_journal_v1', doc({ [id(rec)]: { ...rec, k3: [K2], kw: [K2, K1], kwf: [], c3: {}, da: {}, dr: {}, dg: [] } })],
    ['hub_ai_journal_v1', doc({ [id({ ...fork, xb: true } as never)]: { ...fork, rp: undefined, xb: true, xs: 'ses:9:' } })],
    ['hub_ai_lease_v1', doc({ [`${H}:ses:1:`]: 'lease-1', [`a:b.1a2b:ses_2`]: 'lease-2' })],
    // A computer NAMED like a key: its handle is its name, so the records of that computer are kept (the web keeps them).
    ...['sk-integration-tests.1a2b', 'hdy_staging01.9f3c', 'my-sk-production-box-1.00ff'].flatMap((h): [string, string][] => [
      ['hub_ai_req_v1', doc({ [`${h}:${K2}`]: { ...entry, h } })],
      ['hub_ai_lease_v1', doc({ [`${h}:ses_1`]: 'lease-1' })],
      ['hub_ai_journal_v1', doc({ [`${h}|${R}|ses_1`]: { ...rec, h } })],
    ]),
    ['hub_voice_pending_v1', doc({ ['b'.repeat(24)]: { v: 1, rows: [{ realm: R, bot: 'bot_1', conn: 'conn-01', utt: 3, at: 1_800_000_000_000 }] } })],
  ];
  test('the fixtures are what the journal itself reads (its own validators accept them)', () => {
    for (const e of [entry, created, decided]) expect(validEntry(e)).toEqual(e as never);
    expect(validRec(rec)).not.toBeNull();
    expect(validRec(fork)?.fk).toEqual({ s: 'ses_0', i: 3 });
    // The kinds the seam accepts are the journal's own list: each kind of entry is kept, an unknown one is not.
    const s = persistentStore(memory(), store);
    for (const kind of KINDS) expect(why(() => { s.setItem('hub_ai_req_v1', doc({ [name(entry)]: { ...entry, kind } })); }), kind).toBe('kept');
    expect(why(() => { s.setItem('hub_ai_req_v1', doc({ [name(entry)]: { ...entry, kind: 'note' } })); })).toBe('NOT_DURABLE shape');
  });
  test('its three stores are kept: on disk when the write returns, read back after a restart', () => {
    for (const [key, text] of good) {
      const s = persistentStore(memory(), store);
      expect(why(() => { s.setItem(key, text); }), key).toBe('kept');
      expect(s.getItem(key), key).toBe(text);
      store.close();
      store = openHubStore(dir, { home, tryLock: flock });
      expect(persistentStore(memory(), store).getItem(key), key).toBe(text);
      persistentStore(memory(), store).removeItem(key);
      expect(store.journalGet(key), key).toBeNull();
    }
  });
  const bad: Array<[string, string, string]> = [
    ['hub_ai_req_v1', 'the text of a message on an entry', doc({ [name(entry)]: { ...entry, text: 'hello' } })],
    ['hub_ai_req_v1', 'a digest of the text', doc({ [name(entry)]: { ...entry, td: 'a'.repeat(64) } })],
    ['hub_ai_req_v1', 'an entry under another name', doc({ [`${H}:${K1}`]: entry })],
    ['hub_ai_req_v1', 'a key that is not a request key', doc({ [`${H}:nope`]: { ...entry, k: 'nope' } })],
    ['hub_ai_req_v1', 'a list', doc([entry])],
    ['hub_ai_req_v1', 'another layout version', JSON.stringify({ v: 2, a: { [ACCOUNT]: {} } })],
    ['hub_ai_req_v1', 'an unknown top-level field', JSON.stringify({ v: 1, a: { [ACCOUNT]: {} }, extra: 1 })],
    ['hub_ai_req_v1', 'a credential as the account name', doc({}, CANARIES[0])],
    ['hub_ai_req_v1', 'a credential as a gate id', doc({ [name(decided)]: { ...decided, g: CANARIES[0] } })],
    ['hub_ai_lease_v1', 'a lease id with a space', doc({ [`${H}:ses_1`]: 'a b' })],
    ['hub_ai_lease_v1', 'a credential as the lease id', doc({ [`${H}:ses_1`]: CANARIES[1] })],
    ['hub_ai_lease_v1', 'a name without a session', doc({ [H]: 'lease-1' })],
    ['hub_ai_journal_v1', 'a title on a record', doc({ [id(rec)]: { ...rec, title: 'My chat' } })],
    ['hub_ai_journal_v1', 'a draft on a record', doc({ [id(rec)]: { ...rec, d: 'unsent words' } })],
    ['hub_ai_journal_v1', 'a record under another id', doc({ [`${H}|${R}|ses_2`]: rec })],
    ['hub_ai_journal_v1', 'a record the dock would not read', doc({ [id(rec)]: { ...rec, ph: 'thinking' } })],
    ['hub_ai_journal_v1', 'a record without its computer', doc({ [`undefined|${R}|ses_1`]: { ...rec, h: undefined } })],
    ['hub_ai_journal_v1', 'more than a fork identity', doc({ [id(fork)]: { ...fork, fk: { s: 'ses_0', i: 3, text: 'x' } } })],
    ['hub_ai_journal_v1', 'words in a list of keys (the dock would drop them on read)', doc({ [id(rec)]: { ...rec, dk: [K2, 'remember this'] } })],
    ['hub_ai_journal_v1', 'words as a decision\'s request id', doc({ [id(rec)]: { ...rec, da: { 'gate-1': 'remember this' } } })],
    ['hub_ai_journal_v1', 'a mark that is not a mark', doc({ [id(rec)]: { ...rec, kp: 'yes' } })],
    ['hub_ai_journal_v1', 'words as a queued command id', doc({ [id(rec)]: { ...rec, k3: [K1], c3: { [K1]: 'remember this' } } })],
    ['hub_ai_journal_v1', 'words as a settled gate', doc({ [id(rec)]: { ...rec, dg: ['remember this'] } })],
    ['hub_ai_journal_v1', 'words as the session a marker names', doc({ [id(fork)]: { ...fork, rp: undefined, xb: true, xs: 'remember this' } })],
    ['hub_ai_req_v1', 'a key after a key-like handle', doc({ [`sk-integration-tests.1a2b:${K2}`]: { ...entry, h: 'sk-integration-tests.1a2b', g: 'hdy_' + 'a'.repeat(40) } })],
    ['hub_ai_lease_v1', 'a key as the session of a key-like handle', doc({ ['sk-integration-tests.1a2b:hdy_' + 'a'.repeat(40)]: 'lease-1' })],
    ['hub_ai_lease_v1', 'a key as a lease id', doc({ [`${H}:ses_1`]: 'hdy_' + 'a'.repeat(40) })],
    ['hub_ai_journal_v1', 'a key in a field beside a key-like handle', doc({ [`sk-integration-tests.1a2b|${R}|ses_1`]: { ...rec, h: 'sk-integration-tests.1a2b', u: 'hdy_' + 'a'.repeat(40) } })],
    ['hub_voice_pending_v1', 'the words of a spoken message', doc({ ['b'.repeat(24)]: { v: 1, rows: [{ realm: R, bot: 'bot_1', conn: 'conn-01', utt: 3, at: 1, text: 'hello' }] } })],
    ['hub_voice_pending_v1', 'a sender on a row', doc({ ['b'.repeat(24)]: { v: 1, rows: [{ realm: R, bot: 'bot_1', conn: 'conn-01', utt: 3, at: 1, from: 'ada' }] } })],
    ['hub_voice_pending_v1', 'another layout of an entry', doc({ ['b'.repeat(24)]: { v: 2, rows: [] } })],
    ['hub_voice_pending_v1', 'an entry that is not per computer', doc({ v: 1, rows: [] })],
  ];
  for (const [key, what, text] of bad) {
    test(`${key}: ${what} is refused, and nothing of it reaches the disk`, () => {
      const s = persistentStore(memory(), store);
      expect(why(() => { s.setItem(key, text); })).toBe('NOT_DURABLE shape');
      expect(store.journalGet(key)).toBeNull();
    });
  }
  test('a stored value this build would not have written reads as unreadable, never as an empty journal', () => {
    for (const [key, , text] of bad.slice(0, 1).concat(bad.slice(9, 10), bad.slice(12, 13))) {
      store.journalSet(key, text);
      const s = persistentStore(memory(), store);
      expect(why(() => s.getItem(key)), key).toBe('NOT_DURABLE shape');
      store.journalDel(key);
      expect(s.getItem(key), key).toBeNull();
    }
  });
  test('a store another Hub holds, or one that failed, keeps nothing of the journal (the send is then refused)', () => {
    const [key, text] = good[0]!;
    const second = openHubStore(dir, { home, tryLock: flock });
    expect(why(() => { persistentStore(memory(), second).setItem(key, text); })).toBe('NOT_DURABLE read-only');
    second.close();
    const failed: PersistArea = { ...store, readOnly: null, failed: () => true };
    expect(why(() => { persistentStore(memory(), failed).setItem(key, text); })).toBe('NOT_DURABLE failed');
  });
});
