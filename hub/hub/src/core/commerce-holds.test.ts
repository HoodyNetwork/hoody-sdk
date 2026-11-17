// One hold lifecycle in core. A claim writes phase 'sending' while the claiming tab holds
// the Web Lock hub_money_send:<key>; a definite answer drops the entry, any other end rewrites it 'held', then the lock
// goes. planHolds reads 'sending' only while some tab holds that lock; subscribePlanHolds tells every change.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bounds, createAttempt, planHolds, resetCommerce, subscribePlanHolds, type PlanHold } from './commerce';
import { installWebLocks } from './test/web-locks';
import { calls, envelope, gate, noLocks, path, restoreStorage, shop, typedErr, uidOf, UA, UB, type Call, type Reply } from './test/commerce-env';

const FAM = 'f00df00df00df00df00df00d';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Plus' } };
const DONE = { operation: { id: 'op1', subscription_id: 'sub1', kind: 'purchase', target_plan_id: 'v1', result: null }, subscription: { id: 'sub1', state: 'provisioning' }, replayed: false };
const UDONE = { operation: { id: 'op2', subscription_id: 'x1', kind: 'upgrade', target_plan_id: 'pro-v1', result: null }, subscription: { id: 'x1', state: 'active' }, replayed: false };
const jsonLocal = (k: string) => JSON.parse(localStorage.getItem(k) || '[]') as Array<Record<string, unknown>>;
const why = (r: unknown) => (r as { reason?: string }).reason;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Web Locks with modes and query() (test/web-locks.ts); `otherTabSends` holds a send lock as another tab. */
function fakeLocks() {
  const W = installWebLocks();
  const lm = () => (navigator as unknown as { locks: { request: (n: string, cb: () => unknown) => Promise<unknown> } }).locks;
  return {
    names: () => W.held().map((h) => h.name),
    /** Hold back every query() answer until the returned release. */
    deferQuery() {
      const l = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
      const real = l.query.bind(l);
      const g = gate();
      l.query = () => g.p.then(real);
      return g.open;
    },
    /** The next query() takes its snapshot now but answers only at the returned release (later queries answer at once). */
    snapQuery() {
      const l = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
      const real = l.query.bind(l);
      const g = gate();
      let first = true;
      l.query = () => { if (!first) return real(); first = false; const snap = real(); return g.p.then(() => snap); };
      return g.open;
    },
    closeTab: () => W.closeClient('tab2'),
    /** A reader in another tab watches a send lock (shared) until the returned release. */
    otherTabWatches(key: string) { const g = gate(); W.asClient('tab4', () => { void (lm() as unknown as { request: (n: string, o: unknown, cb: () => unknown) => Promise<unknown> }).request('hub_money_send:' + key, { mode: 'shared' }, () => g.p); }); return g.open; },
    /** Another tab holds the pending-store lock until the returned release. */
    otherTabHoldsStore() { const g = gate(); W.asClient('tab3', () => { void lm().request('hub_money_pending', () => g.p); }); return g.open; },
    otherTabSends(key: string) { const g = gate(); W.asClient('tab2', () => { void lm().request('hub_money_send:' + key, () => g.p); }); return g.open; },
  };
}

function money(post: (c: Call) => Reply | Promise<Reply>, o: Parameters<typeof shop>[0] = {}) {
  const s = shop({ ...o, fetch: (c) => {
    const p = path(c);
    if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST') return post(c);
    return { status: 404, body: {} };
  } });
  Object.assign(bounds, { read: 1000, post: 1000, op: 1000, list: 300, slack: 10 });
  return s;
}
const buyRow = (o: Record<string, unknown>) => ({ kind: 'buy', user_id: UA, key: 'k-' + Math.random().toString(36).slice(2), max_charge_cents: 900, at: 1, family_id: FAM, plan_id: 'v1', title: 'Plus', ...o });
const upRow = (o: Record<string, unknown>) => ({ kind: 'upgrade', user_id: UA, key: 'u-' + Math.random().toString(36).slice(2), max_charge_cents: 450, at: 1, sub_id: 'x1', plan_id: 'pro-v1', title: 'Pro', ...o });

beforeEach(() => { resetCommerce(); });
afterEach(() => { restoreStorage(); noLocks(); resetCommerce(); });

describe('a send: sending while out, then dropped or held', () => {
  it('buy, answer lost: sending (stored and read) while the POST is out, then held; the send lock is released', async () => {
    const L = fakeLocks();
    const g = gate();
    const s = money(async () => { await g.p; return { status: 502, body: { error: 'X' } }; });
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    await a.quote();
    const out = a.confirm(true);
    for (let i = 0; i < 20 && !calls.some((c) => c.method === 'POST'); i++) await tick();
    const key = jsonLocal('hub_money_pending')[0]!.key as string;
    expect(jsonLocal('hub_money_pending')[0]).toMatchObject({ phase: 'sending', family_id: FAM });
    expect(L.names()).toContain('hub_money_send:' + key);
    expect(await planHolds(s.ctx())).toEqual([expect.objectContaining({ kind: 'buy', key, family_id: FAM, plan_id: 'v1', phase: 'sending', max_charge_cents: 900 })]);
    g.open();
    expect(why(await out)).toBe('unknown');
    expect(jsonLocal('hub_money_pending')[0]).toMatchObject({ key, phase: 'held' });
    expect(L.names()).not.toContain('hub_money_send:' + key);
    expect(await planHolds(s.ctx())).toEqual([expect.objectContaining({ key, phase: 'held' })]);
  });
  it('buy, definite answer: the entry is dropped, no hold, the lock released, listeners told', async () => {
    const L = fakeLocks();
    const s = money(() => ({ status: 201, body: envelope(DONE) }));
    let told = 0;
    subscribePlanHolds(() => { told++; });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(jsonLocal('hub_money_pending')).toEqual([]);
    expect(await planHolds(s.ctx())).toEqual([]);
    expect(L.names()).toEqual([]);
    expect(told).toBeGreaterThanOrEqual(2); // the claim and the drop
  });
  it('upgrade, answer lost: sending then held, under hub_money_upgrade; the hold names the server and the target', async () => {
    fakeLocks();
    const g = gate();
    const s = money(async () => { await g.p; return { status: 0, network: true } as Reply; });
    const a = createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' });
    await a.quote();
    let told = 0;
    subscribePlanHolds(() => { told++; });
    const out = a.confirm(true);
    for (let i = 0; i < 20 && !calls.some((c) => c.method === 'POST'); i++) await tick();
    expect(told).toBe(1); // the claim's write
    expect(await planHolds(s.ctx())).toEqual([expect.objectContaining({ kind: 'upgrade', sub_id: 'x1', plan_id: 'pro-v1', phase: 'sending', title: 'Pro' })]);
    g.open();
    expect(why(await out)).toBe('unknown');
    expect(jsonLocal('hub_money_upgrade')[0]).toMatchObject({ phase: 'held' });
    expect(await planHolds(s.ctx())).toEqual([expect.objectContaining({ kind: 'upgrade', phase: 'held' })]);
  });
  it('a definite answer whose drop waits behind another tab\'s store lock keeps the send lock until the entry is gone', async () => {
    const L = fakeLocks();
    let free: () => void = () => undefined;
    const s = money(() => { free = L.otherTabHoldsStore(); return { status: 201, body: envelope(DONE) }; });
    let told = 0;
    subscribePlanHolds(() => { told++; });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true); // settles after the bounded cleanup wait
    const key = jsonLocal('hub_money_pending')[0]!.key as string;
    expect(L.names()).toContain('hub_money_send:' + key);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('sending');
    const before = told;
    free();
    for (let i = 0; i < 5; i++) await tick();
    expect(jsonLocal('hub_money_pending')).toEqual([]);
    expect(L.names()).toEqual([]);
    expect(told).toBeGreaterThan(before);
    expect(await planHolds(s.ctx())).toEqual([]);
  });
  it('upgrade, a definitive refusal: dropped', async () => {
    fakeLocks();
    const s = money(() => typedErr(409, 'PLAN_CHANGE_NOT_UPGRADE'));
    const a = createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' } });
    await a.quote();
    expect(why(await a.confirm(true))).toBe('refused');
    expect(await planHolds(s.ctx())).toEqual([]);
    void UDONE;
  });
  it('a retained held entry sent again: the same entry turns sending (no second entry), then held again', async () => {
    fakeLocks();
    const row = buyRow({ phase: 'held', key: 'kept-1' });
    const g = gate();
    const s = money(async () => { await g.p; return { status: 502, body: {} }; }, { local: { hub_money_pending: JSON.stringify([row]) } });
    const a = createAttempt('buy', { plan: PLAN });
    let told = 0;
    subscribePlanHolds(() => { told++; });
    const out = a.confirm(true);
    for (let i = 0; i < 20 && !calls.some((c) => c.method === 'POST'); i++) await tick();
    expect(jsonLocal('hub_money_pending')).toEqual([expect.objectContaining({ key: 'kept-1', phase: 'sending' })]);
    expect(calls.find((c) => c.method === 'POST')!.body.idempotency_key).toBe('kept-1');
    g.open();
    await out;
    expect(jsonLocal('hub_money_pending')).toEqual([expect.objectContaining({ key: 'kept-1', phase: 'held' })]);
    expect(told).toBe(2); // the claim, then the rewrite to held (no reader armed a watch here)
    void s;
  });
  it('a claim adopted from another entry sends nothing and leaves that entry as it was; the lock is released', async () => {
    const L = fakeLocks();
    const row = buyRow({ key: 'theirs', phase: 'held' });
    const s = money(() => ({ status: 201, body: envelope(DONE) }));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    localStorage.setItem('hub_money_pending', JSON.stringify([row])); // another tab claimed the family after this dialog opened
    expect(why(await a.confirm(true))).toBe('adopted');
    expect(jsonLocal('hub_money_pending')).toEqual([row]);
    expect(L.names()).toEqual([]);
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    void s;
  });
});

describe('planHolds: what a reader sees', () => {
  it('sending with no tab holding its lock (the sender closed or crashed) reads held; no phase or a strange one reads held', async () => {
    fakeLocks();
    const rows = [buyRow({ phase: 'sending', at: 3 }), buyRow({ family_id: 'f00df00df00df00df00df00e', at: 2 }), buyRow({ family_id: 'f00df00df00df00df00df00f', phase: 'weird', at: 1 })];
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify(rows) } });
    expect((await planHolds(s.ctx())).map((h) => h.phase)).toEqual(['held', 'held', 'held']);
  });
  it('another tab sending: sending while it holds the lock; its release tells the listeners and the hold then reads held', async () => {
    const L = fakeLocks();
    const row = upRow({ phase: 'sending' });
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_upgrade: JSON.stringify([row]) } });
    const release = L.otherTabSends(row.key);
    await tick();
    let told = 0;
    subscribePlanHolds(() => { told++; });
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('sending');
    expect(told).toBe(0);
    release();
    await tick(); await tick();
    expect(told).toBe(1);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
  });
  it('the sending tab closes mid-send (its lock goes with it): the listeners are told and the hold reads held', async () => {
    const L = fakeLocks();
    const row = buyRow({ phase: 'sending' });
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([row]) } });
    L.otherTabSends(row.key);
    await tick();
    let told = 0;
    subscribePlanHolds(() => { told++; });
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('sending');
    L.closeTab();
    await tick(); await tick();
    expect(told).toBe(1);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
    expect(jsonLocal('hub_money_pending')[0]).toMatchObject({ phase: 'sending' }); // nothing rewrote it: the reader decides
  });
  it('without Web Locks no sender can be seen: every sending reads held', async () => {
    noLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({ phase: 'sending' })]) } });
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
  });
  it('only the displayed identity\'s buys and upgrades; payments left out; each hold listed, newest first (two upgrades to one plan)', async () => {
    fakeLocks();
    const pending = [buyRow({ at: 5, key: 'b1' }), buyRow({ user_id: UB, key: 'b2' }), { kind: 'pay', user_id: UA, key: 'p1', max_charge_cents: 1, at: 9, sub_id: 'x9' }];
    const ups = [upRow({ key: 'u1', sub_id: 'x1', at: 7 }), upRow({ key: 'u2', sub_id: 'x2', at: 6 }), upRow({ key: 'u3', user_id: UB })];
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify(pending), hub_money_upgrade: JSON.stringify(ups) } });
    expect((await planHolds(s.ctx())).map((h) => h.key)).toEqual(['u1', 'u2', 'b1']);
    s.show(null);
    expect(await planHolds(s.ctx())).toEqual([]);
  });
  it('holds are read from the stores alone: no request at all', async () => {
    fakeLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({})]) } });
    calls.length = 0;
    expect((await planHolds(s.ctx())).length).toBe(1);
    expect(calls).toEqual([]);
  });
});

describe('subscribePlanHolds', () => {
  it('another tab\'s write of either store (and a cleared storage) tells; other keys do not; unsubscribe stops it', () => {
    money(() => ({ status: 500, body: {} }));
    let told = 0;
    const off = subscribePlanHolds(() => { told++; });
    for (const key of ['hub_money_pending', 'hub_money_upgrade', null]) window.dispatchEvent(new StorageEvent('storage', { key }));
    expect(told).toBe(3);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub_market_pending' }));
    expect(told).toBe(3);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub_money_pending' }));
    expect(told).toBe(3);
  });
  it('the displayed identity changing tells', () => {
    const s = money(() => ({ status: 500, body: {} }));
    let told = 0;
    subscribePlanHolds(() => { told++; });
    s.show(UB);
    expect(told).toBeGreaterThanOrEqual(1);
    const n = told;
    s.show(UB);
    expect(told).toBe(n);
  });
});

describe('reads that race the store, the identity and the watch', () => {
  it('a listener that reads again inside the notification after the sender closed sees held at once, told once', async () => {
    const L = fakeLocks();
    const row = buyRow({ phase: 'sending' });
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([row]) } });
    L.otherTabSends(row.key);
    await tick();
    const seen: string[] = [];
    const locksAtTell: string[][] = [];
    subscribePlanHolds(() => { locksAtTell.push(L.names()); void planHolds(s.ctx()).then((h) => { seen.push(h[0]!.phase); }); });
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('sending');
    L.closeTab();
    for (let i = 0; i < 10; i++) await tick();
    expect(seen).toEqual(['held']);
    expect(locksAtTell).toEqual([[]]); // told after the watch let go of its own shared hold
  });
  it('another reader watching a send lock (shared) is no sender: with no exclusive holder the hold reads held', async () => {
    const L = fakeLocks();
    const row = buyRow({ phase: 'sending' });
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([row]) } });
    const done = L.otherTabWatches(row.key);
    await tick();
    expect(L.names()).toEqual(['hub_money_send:' + row.key]);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
    done();
  });
  it('the displayed user changes while a read waits for the lock query: that read is superseded, never the other user\'s holds', async () => {
    const L = fakeLocks();
    const row = buyRow({ phase: 'sending' });
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([row]) } });
    const open = L.deferQuery();
    const r = planHolds(s.ctx()).then((h) => h, (e: unknown) => e);
    s.show(UB);
    open();
    expect(await r).toMatchObject({ superseded: true });
    expect(Array.isArray(await r)).toBe(false);
    s.show(null);
  });
  it('an entry dropped while a read waits for the lock query stays dropped in that read', async () => {
    const L = fakeLocks();
    const row = buyRow({ phase: 'sending' });
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([row]) } });
    const open = L.deferQuery();
    const r = planHolds(s.ctx());
    localStorage.removeItem('hub_money_pending');
    open();
    expect(await r).toEqual([]);
  });
  it('an unknown answer whose held rewrite waits behind another tab\'s store lock: the send lock still goes at the bound; the late rewrite writes nothing', async () => {
    const L = fakeLocks();
    let free: () => void = () => undefined;
    const s = money(() => { free = L.otherTabHoldsStore(); return { status: 502, body: {} }; });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect(why(await a.confirm(true))).toBe('unknown'); // after the bounded wait
    const key = jsonLocal('hub_money_pending')[0]!.key as string;
    expect(L.names()).not.toContain('hub_money_send:' + key);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
    free();
    for (let i = 0; i < 5; i++) await tick();
    expect(jsonLocal('hub_money_pending')[0]).toMatchObject({ key, phase: 'sending' }); // no sender: read held
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
  });
});

describe('only the newest started hold read is applied', () => {
  const settled = (p: Promise<unknown>) => p.then((h) => h, (e: unknown) => e);
  for (const kind of ['buy', 'upgrade'] as const) {
    it(`${kind}: a new claim while an older read waits; the older read, answering last, resolves with the newer read: sending`, async () => {
      const L = fakeLocks();
      const g = gate();
      // A dead sender's record of the OTHER store, so the read has something sending and queries the locks.
      const dead: Record<string, string> = kind === 'buy' ? { hub_money_upgrade: JSON.stringify([upRow({ key: 'dead-u', sub_id: 'x9', phase: 'sending' })]) }
        : { hub_money_pending: JSON.stringify([buyRow({ key: 'dead-b', phase: 'sending' })]) };
      const s = money(async () => { await g.p; return { status: 502, body: {} }; }, { local: dead });
      const open = L.snapQuery();
      const older = settled(planHolds(s.ctx())); // its snapshot: no send lock at all
      const a = kind === 'buy' ? createAttempt('buy', { plan: PLAN, title: 'Plus' }) : createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' });
      await a.quote();
      const out = a.confirm(true);
      for (let i = 0; i < 20 && !calls.some((c) => c.method === 'POST'); i++) await tick();
      const key = (kind === 'buy' ? jsonLocal('hub_money_pending') : jsonLocal('hub_money_upgrade')).find((e) => !String(e.key).startsWith('dead'))!.key as string;
      expect(L.names()).toContain('hub_money_send:' + key);
      expect((await planHolds(s.ctx())).find((h) => h.key === key)!.phase).toBe('sending');
      open();
      expect(((await older) as PlanHold[]).find((h) => h.key === key)!.phase).toBe('sending');
      g.open();
      expect(why(await out)).toBe('unknown');
    });
    it(`${kind}: a dead sender's kept key resent (same key) while an older read waits; the older read resolves with the newer: sending`, async () => {
      const L = fakeLocks();
      const g = gate();
      const KEPT = kind === 'buy' ? 'kept-b-0000000000001' : 'kept-u-0000000000001';
      const local: Record<string, string> = kind === 'buy'
        ? { hub_money_pending: JSON.stringify([buyRow({ key: KEPT, phase: 'sending' })]) }
        : { hub_money_upgrade: JSON.stringify([upRow({ key: KEPT, sub_id: 'x1', plan_id: 'pro-v1', phase: 'sending' })]) };
      const s = money(async () => { await g.p; return { status: 502, body: {} }; }, { local });
      const open = L.snapQuery();
      const older = settled(planHolds(s.ctx())); // KEPT already reads sending; its snapshot has no send lock
      const a = kind === 'buy' ? createAttempt('buy', { plan: PLAN, title: 'Plus' }) : createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' });
      await a.quote();
      let out = a.confirm(true);
      for (let i = 0; i < 20 && !calls.some((c) => c.method === 'POST'); i++) await tick();
      if (!calls.some((c) => c.method === 'POST')) { expect(why(await out)).toBe('adopted'); out = a.confirm(true); }
      for (let i = 0; i < 20 && !calls.some((c) => c.method === 'POST'); i++) await tick();
      expect(L.names()).toContain('hub_money_send:' + KEPT); // the resend is live under the same key
      expect((await planHolds(s.ctx())).find((h) => h.key === KEPT)!.phase).toBe('sending');
      open();
      expect(((await older) as PlanHold[]).find((h) => h.key === KEPT)!.phase).toBe('sending');
      g.open();
      expect(why(await out)).toBe('unknown');
    });
  }
  it('the newest read is applied even when it answers first; the older read resolves with it', async () => {
    const L = fakeLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({ key: 'b1', phase: 'sending' })]) } });
    const open = L.snapQuery();
    const first = settled(planHolds(s.ctx()));
    const second = await planHolds(s.ctx());
    expect(second[0]!.phase).toBe('held');
    open();
    expect(await first).toEqual(second);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('held');
  });
  it('two listeners reading on one notification both get current holds, every time', async () => {
    fakeLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({ key: 'b1', phase: 'sending' })]) } });
    const got: Record<'a' | 'b', unknown[]> = { a: [], b: [] };
    const offs = (['a', 'b'] as const).map((n) => subscribePlanHolds(() => { void planHolds(s.ctx()).then((h) => got[n].push(h), (e: unknown) => got[n].push(e)); }));
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new StorageEvent('storage', { key: 'hub_money_pending' }));
      for (let t = 0; t < 20 && (got.a.length <= i || got.b.length <= i); t++) await tick();
    }
    offs.forEach((off) => off());
    for (const n of ['a', 'b'] as const) {
      expect(got[n]).toHaveLength(3);
      for (const h of got[n]) expect(h).toEqual([expect.objectContaining({ key: 'b1', phase: 'held' })]);
    }
  });
  it('every read a later read superseded resolves with the newest started read', async () => {
    const L = fakeLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({ key: 'b1', phase: 'sending' })]) } });
    const open1 = L.snapQuery();
    const first = planHolds(s.ctx());
    const second = planHolds(s.ctx());
    open1();
    const third = planHolds(s.ctx());
    const last = await third;
    expect(await first).toEqual(last);
    expect(await second).toEqual(last);
  });
  it('a read waiting on the newest read follows again when an even newer read starts as that one answers', async () => {
    const L = fakeLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({ key: 'b1', phase: 'sending' })]) } });
    const open1 = L.snapQuery();
    const a = planHolds(s.ctx()); // waits at gate 1
    const openB = L.deferQuery();
    const b = planHolds(s.ctx()); // newer: waits at gate B
    let c: Promise<PlanHold[]> | null = null;
    // A subscriber that, as b answers, sees a store change and reads again before a resumes.
    void b.then(() => {
      localStorage.setItem('hub_money_pending', JSON.stringify([buyRow({ key: 'b1', phase: 'sending' }), buyRow({ key: 'b2', at: 2e12 })]));
      c = planHolds(s.ctx());
    });
    open1();
    for (let t = 0; t < 5; t++) await tick(); // a is superseded by b and waits on it
    openB();
    expect((await b).map((h) => h.key)).toEqual(['b1']);
    for (let t = 0; t < 5 && !c; t++) await tick();
    const newest = await c!;
    expect(newest.map((h) => h.key)).toEqual(['b2', 'b1']);
    expect(await a).toEqual(newest);
  });
  for (const back of [false, true]) {
    it(`the account switches while a superseded read waits on the newest${back ? ', then switches back' : ''}; the old caller is superseded, never handed the other account's holds`, async () => {
      const L = fakeLocks();
      const local = { hub_money_pending: JSON.stringify([buyRow({ key: 'a1', phase: 'sending' }), buyRow({ user_id: UB, key: 'B-private', phase: 'held' })]) };
      const s = money(() => ({ status: 500, body: {} }), { local });
      const open1 = L.snapQuery();
      const a = planHolds(s.ctx()).then((h) => h, (e: unknown) => e); // A, waits at gate 1
      const openB = L.deferQuery();
      const b = planHolds(s.ctx()); // A, newer: waits at gate B
      let c: Promise<unknown> | null = null;
      // As b answers, the account switches to B and B's holds are read before a resumes.
      void b.then(() => {
        s.switchTo(UB);
        s.show(UB);
        c = planHolds(s.ctx()).then((h) => h, (e: unknown) => e);
        if (back) { s.switchTo(UA); s.show(UA); }
      });
      open1();
      for (let t = 0; t < 5; t++) await tick(); // a passed its own owner check and now waits on b
      openB();
      expect((await b).map((h) => h.key)).toEqual(['a1']);
      for (let t = 0; t < 5 && !c; t++) await tick();
      expect(((await (c as Promise<unknown> | null)) as PlanHold[]).map((h) => h.key)).toEqual(['B-private']); // B's read answers at once, for B
      const old = await a;
      expect(old).toMatchObject({ superseded: true });
      expect(JSON.stringify(old)).not.toContain('B-private');
      s.show(null);
    });
  }
  it('the account switches during the following wait with no newer read; the old caller is superseded, not handed its stale holds', async () => {
    const L = fakeLocks();
    const s = money(() => ({ status: 500, body: {} }), { local: { hub_money_pending: JSON.stringify([buyRow({ key: 'a1', phase: 'sending' })]) } });
    const open1 = L.snapQuery();
    const a = planHolds(s.ctx()).then((h) => h, (e: unknown) => e); // A, waits at gate 1
    const openB = L.deferQuery();
    const b = planHolds(s.ctx()); // A, newer: waits at gate B
    void b.then(() => { s.switchTo(UB); s.show(UB); }); // as b answers for A, B signs in; nothing reads again
    open1();
    for (let t = 0; t < 5; t++) await tick();
    openB();
    expect((await b).map((h) => h.key)).toEqual(['a1']);
    expect(await a).toMatchObject({ superseded: true });
    s.show(null);
  });
  it('a resend of the same key queued behind the late held rewrite keeps its own sending phase and lock', async () => {
    const L = fakeLocks();
    let free: () => void = () => undefined;
    let n = 0;
    const g = gate();
    const s = money(async () => { n++; if (n === 1) { free = L.otherTabHoldsStore(); return { status: 502, body: {} }; } await g.p; return { status: 502, body: {} }; });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect(why(await a.confirm(true))).toBe('unknown');
    const key = jsonLocal('hub_money_pending')[0]!.key as string;
    const again = a.confirm(true); // the successor: same key, takes the send lock, its claim waits behind the store
    for (let i = 0; i < 10 && !L.names().includes('hub_money_send:' + key); i++) await tick();
    expect(L.names()).toContain('hub_money_send:' + key);
    free();
    for (let i = 0; i < 20 && n < 2; i++) await tick();
    expect(n).toBe(2);
    expect(jsonLocal('hub_money_pending')).toEqual([expect.objectContaining({ key, phase: 'sending' })]);
    expect(L.names()).toContain('hub_money_send:' + key);
    expect((await planHolds(s.ctx()))[0]!.phase).toBe('sending');
    g.open();
    expect(why(await again)).toBe('unknown');
  });
});
