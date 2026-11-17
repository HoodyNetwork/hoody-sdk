// An older build's hold under the variables' digest is never sent twice
// after an upgrade (a throwing lockKey refuses the press); no stored record keeps an older build's keyBytes
// (writeChanges never writes them; only an older build's record, without the format marker, carries them, and load
// converts it).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY, readChanges, writeChanges, type StoredChange } from './change-store';
import { defineMutation, varsDigest } from './query';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, settle } from './test/env';

const SECRET = 'planted-secret-sec1b-Qw3';
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const raw = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const posts = (): number => calls.filter((c) => c.method === 'POST').length;

describe('an older build\'s hold of a throwing-lockKey change is never sent again after the upgrade', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { C.resetChanges(); });
  const route = defineRoute({ method: 'POST', path: '/sec1b/up', scope: 'agent', body: ['password'] });
  // What an older build did with a throwing lockKey: the variables were the identity. `old` stands for it (same
  // shared lock, so the same scope and id).
  const old = defineMutation<{ password: string }>(route, { input: (v) => ({ body: { password: v.password } }), lock: 'sec1b.up', lockKey: (v) => v, page: 'programs' });
  const now = defineMutation<{ password: string }>(route, { input: (v) => ({ body: { password: v.password } }), lock: 'sec1b.up', lockKey: () => { throw new Error('page bug'); }, page: 'programs' });
  it('the old pending hold stays stored; the upgraded press sends nothing (INPUT_INVALID)', async () => {
    const vars = { password: SECRET };
    const r = await old.run(vars);
    expect(r.outcome).toBe('pending');
    expect(posts()).toBe(1);
    C.reloadChangesForTests(); // the upgrade
    const again = await now.run(vars);
    expect(again).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    expect(posts()).toBe(1);
    expect(readChanges()?.filter((x) => x.pending).length).toBe(1);
  });
});

describe('no stored record keeps an older build\'s keyBytes', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { C.resetChanges(); });
  const route = defineRoute({ method: 'POST', path: '/sec1b/kb', scope: 'agent', body: ['n', 'password'], idem: true });
  const m = defineMutation<{ n: number; password: string }>(route, { input: (v) => ({ body: v }), lock: 'sec1b.kb', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  async function legacy(): Promise<{ digest: string; rec: StoredChange }> {
    const vars = { n: 1, password: SECRET };
    expect((await m.run(vars)).outcome).toBe('pending');
    const digest = await varsDigest(vars);
    const list = JSON.parse(raw()) as Array<Record<string, unknown>>;
    list[0]!.keyBytes = digest; // as an older build stored it: with keyBytes, without the format marker
    delete list[0]!.fmt;
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    return { digest, rec: readChanges()![0]! };
  }
  it('at load the record converts without them: its held change stays held, as an older change under a fresh id', async () => {
    const { digest, rec } = await legacy();
    expect(raw()).toContain(digest);
    C.reloadChangesForTests();
    await flush();
    expect(raw()).not.toContain(digest);
    const back = readChanges()!;
    const scope = rec.id.slice(0, rec.id.indexOf('\u0000'));
    expect(back.map((x) => [x.id.startsWith(scope + '\u0000q~'), x.id === rec.id, x.pending, x.key, x.t, x.inc === rec.inc, x.fmt, 'keyBytes' in x])).toEqual([[true, false, true, null, rec.t, false, 1, false]]);
  });
  it('an unrelated write never copies them forward (writeChanges drops them from every record)', async () => {
    const { digest } = await legacy();
    const list = readChanges()!;
    expect(list[0]!.keyBytes).toBe(digest);
    expect(writeChanges([...list, { id: 'other\u0001x\u0000y', pending: false, key: null, t: 1 }])).toBe(true);
    expect(raw()).not.toContain(digest);
    expect(readChanges()!.length).toBe(2);
  });
});
