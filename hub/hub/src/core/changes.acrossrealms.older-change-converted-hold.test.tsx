// An older build's hold (converted to an older change, outcome unknown) and an older
// build's send still out bar a press of the same lock base filed the other way, both directions, from memory and
// under the store lock alone, keeping the base boundary. The case: 2 mutation callbacks must become 1.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, R1 } from './test/env';
import type * as C from './changes';
import type * as Ctx from './ctx';
import type * as Q from './query';
import type * as Routes from './routes';
import type * as Env from './test/env';

type G = { C: typeof C; query: typeof Q; routes: typeof Routes; env: typeof Env; ctx: typeof Ctx };
type Vars = { id: string };
const KEY = 'hub.v3.changes';

async function graph(): Promise<G> {
  const saved: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; saved.push([k, localStorage.getItem(k)!]); }
  vi.resetModules();
  const env = await import('./test/env');
  env.boot({ realm: R1 });
  for (const [k, v] of saved) localStorage.setItem(k, v);
  const C2 = await import('./changes');
  C2.reloadChangesForTests();
  return { C: C2, query: await import('./query'), routes: await import('./routes'), env, ctx: await import('./ctx') };
}
const deletes = (g: G): number => g.env.calls.filter((c) => c.method === 'DELETE').length;
function removeOf(g: G, lock: string, across: boolean) {
  const rt = g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar3/containers/:id', scope: 'realm' });
  return g.query.defineMutation<Vars>(rt, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock, ...(across ? { acrossRealms: true } : {}) });
}
/** The stored records as an older build writes them (no record format). */
function olderFormat(): void {
  const recs = JSON.parse(localStorage.getItem(KEY)!) as Array<Record<string, unknown>>;
  for (const r of recs) delete r.fmt;
  localStorage.setItem(KEY, JSON.stringify(recs));
}
const stored = (): Array<{ id: string }> => JSON.parse(localStorage.getItem(KEY) ?? '[]') as Array<{ id: string }>;
const quarantinedIds = (): number => stored().filter((r) => r.id.includes('\u0000q~')).length;

/** An older build's pending hold of `lock` (filed `olderAcross` or not), then a press filed the other way. */
async function olderHoldThenPress(lock: string, olderAcross: boolean, cold: boolean): Promise<{ g1: G; g2: G; res: { outcome: string } }> {
  const g1 = await graph(); g1.env.onFetch(() => ({ status: 502, body: {} }));
  expect((await removeOf(g1, lock, olderAcross).run({ id: 'c9' })).outcome).toBe('pending');
  olderFormat();
  const g2 = await graph(); g2.env.onFetch(() => ({ status: 502, body: {} }));
  await g2.env.settle(20);
  if (cold) g2.C.resetChanges();
  const res = await removeOf(g2, lock, !olderAcross).run({ id: 'c9' });
  return { g1, g2, res };
}
/** An older build's send of `lock` still out in another tab (a live stamp), then a press filed the other way. */
async function olderSendThenPress(lock: string, olderAcross: boolean, cold: boolean): Promise<{ g1: G; g2: G; res: { outcome: string; error?: { code?: string } } }> {
  const g1 = await graph(); g1.env.onFetch(() => new Promise(() => {}));
  void removeOf(g1, lock, olderAcross).run({ id: 'c9' });
  await g1.env.settle(20);
  olderFormat();
  const g2 = await graph(); g2.env.onFetch(() => ({ status: 502, body: {} }));
  await g2.env.settle(20);
  if (cold) g2.C.resetChanges();
  const res = await removeOf(g2, lock, !olderAcross).run({ id: 'c9' }) as { outcome: string; error?: { code?: string } };
  return { g1, g2, res };
}

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.restoreAllMocks(); });

describe('an older change (converted hold) bars a press filed the other way', () => {
  it('a realm-scoped older hold, then an across press: refused, one callback in all', async () => {
    const { g1, g2, res } = await olderHoldThenPress('ar3.q1', false, false);
    expect(quarantinedIds()).toBe(1);
    expect(res.outcome).toBe('not_sent');
    expect(deletes(g1) + deletes(g2)).toBe(1);
  });
  it('an unscoped (across) older hold, then a realm-scoped press: refused, one callback', async () => {
    const { g1, g2, res } = await olderHoldThenPress('ar3.q2', true, false);
    expect(quarantinedIds()).toBe(1);
    expect(res.outcome).toBe('not_sent');
    expect(deletes(g1) + deletes(g2)).toBe(1);
  });
  it('cold store-lock admission (memory reset): a realm-scoped older hold refuses an across press', async () => {
    const { g1, g2, res } = await olderHoldThenPress('ar3.q3', false, true);
    expect(res.outcome).toBe('not_sent');
    expect(deletes(g1) + deletes(g2)).toBe(1);
  });
  it('cold store-lock admission: an unscoped older hold refuses a realm-scoped press', async () => {
    const { g1, g2, res } = await olderHoldThenPress('ar3.q4', true, true);
    expect(res.outcome).toBe('not_sent');
    expect(deletes(g1) + deletes(g2)).toBe(1);
  });
  it('the hold stays an older change after the refusal (nothing freed or rewritten)', async () => {
    await olderHoldThenPress('ar3.q5', false, false);
    expect(quarantinedIds()).toBe(1);
    expect(stored()).toHaveLength(1);
  });
  it('base boundary: an older hold of another lock base refuses nothing', async () => {
    const g1 = await graph(); g1.env.onFetch(() => ({ status: 502, body: {} }));
    await removeOf(g1, 'ar3.q6', false).run({ id: 'c9' });
    olderFormat();
    const g2 = await graph(); g2.env.onFetch(() => ({ status: 502, body: {} }));
    await g2.env.settle(20);
    expect((await removeOf(g2, 'ar3.q7', true).run({ id: 'c9' })).outcome).toBe('pending');
    expect(deletes(g2)).toBe(1);
  });
});

describe('an older build\'s live send bars a press filed the other way', () => {
  it('a realm-scoped older send out in another tab, then an across press: BUSY, nothing sent', async () => {
    const { g2, res } = await olderSendThenPress('ar3.l1', false, false);
    expect(res).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    expect(deletes(g2)).toBe(0);
  });
  it('an unscoped older send out in another tab, then a realm-scoped press: BUSY, nothing sent', async () => {
    const { g2, res } = await olderSendThenPress('ar3.l2', true, false);
    expect(res).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    expect(deletes(g2)).toBe(0);
  });
  it('cold store-lock admission, both directions: BUSY, nothing sent', async () => {
    const a = await olderSendThenPress('ar3.l3', false, true);
    expect(a.res).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    expect(deletes(a.g2)).toBe(0);
    const b = await olderSendThenPress('ar3.l4', true, true);
    expect(b.res).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    expect(deletes(b.g2)).toBe(0);
  });
  it('base boundary: an older send of another lock base bars nothing', async () => {
    const g1 = await graph(); g1.env.onFetch(() => new Promise(() => {}));
    void removeOf(g1, 'ar3.l5', false).run({ id: 'c9' });
    await g1.env.settle(20);
    olderFormat();
    const g2 = await graph(); g2.env.onFetch(() => ({ status: 502, body: {} }));
    await g2.env.settle(20);
    expect((await removeOf(g2, 'ar3.l6', true).run({ id: 'c9' })).outcome).toBe('pending');
    expect(deletes(g2)).toBe(1);
  });
});

describe('the boundaries of the barrier filed the other way', () => {
  // Such a base cannot be declared any more (changes.ts lockBase; changes.lockname.test.tsx).
  it('lock "ar3.b1@other" (a name that reads like a realm id of lock "ar3.b1") cannot be declared', async () => {
    const g = await graph();
    expect(() => removeOf(g, 'ar3.b1@other', true)).toThrow(/no @, # or NUL/);
    expect(() => removeOf(g, 'ar3.b1', true)).not.toThrow();
  });
  it('account boundary: another account\'s older hold and older send bar nothing (same-length account id)', async () => {
    const g1 = await graph(); g1.env.onFetch(() => ({ status: 502, body: {} }));
    await removeOf(g1, 'ar3.a1', false).run({ id: 'c9' });
    const g0 = await graph(); g0.env.onFetch(() => new Promise(() => {}));
    void removeOf(g0, 'ar3.a2', false).run({ id: 'c9' });
    await g0.env.settle(20);
    olderFormat();
    // Both records filed under another account whose id has this one's length.
    const recs = JSON.parse(localStorage.getItem(KEY)!) as Array<{ id: string }>;
    for (const r of recs) r.id = r.id.replace('64f0c0ffee0000000000c0de\u0001', '64f0c0ffee0000000000beef\u0001');
    localStorage.setItem(KEY, JSON.stringify(recs));
    const g2 = await graph(); g2.env.onFetch(() => ({ status: 502, body: {} }));
    await g2.env.settle(20);
    expect(stored().map((r) => r.id.startsWith('64f0c0ffee0000000000beef\u0001'))).toEqual([true, true]);
    expect((await removeOf(g2, 'ar3.a1', true).run({ id: 'c9' })).outcome).toBe('pending');
    expect((await removeOf(g2, 'ar3.a2', true).run({ id: 'c9' })).outcome).toBe('pending');
    expect(deletes(g2)).toBe(2);
  });
  it('a current hold of another change filed the other way stays per change: it never bars this one', async () => {
    const g1 = await graph(); g1.env.onFetch(() => ({ status: 502, body: {} }));
    expect((await removeOf(g1, 'ar3.b3', false).run({ id: 'c8' })).outcome).toBe('pending');
    const g2 = await graph(); g2.env.onFetch(() => ({ status: 502, body: {} }));
    expect((await removeOf(g2, 'ar3.b3', true).run({ id: 'c9' })).outcome).toBe('pending');
    expect(deletes(g2)).toBe(1);
  });
});
