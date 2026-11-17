// heldPlanEntry on the real core: which kept buy, pay or upgrade a resend dialog is opened for (key, ceiling, request
// signature), read from the stores now. Billing's staleKept check compares its key with the attempt's key.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bounds, createAttempt, heldPlanEntry, resetCommerce, type HeldPlanTarget } from './commerce';
import { dropPending, heldRequestSig, type PendingEntry } from './commerce-pure';
import { installWebLocks } from './test/web-locks';
import { envelope, noLocks, path, restoreStorage, shop, uidOf, UA, UB, type Call, type Reply } from './test/commerce-env';

const FAM = 'f00df00df00df00df00df00d';
const FAM2 = 'beefbeefbeefbeefbeefbeef';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Plus' } };
const DONE = { operation: { id: 'op1', subscription_id: 'sub1', kind: 'purchase', target_plan_id: 'v1', result: null }, subscription: { id: 'sub1', state: 'provisioning' }, replayed: false };

const buyRow = (o: Record<string, unknown> = {}) => ({ kind: 'buy', user_id: UA, key: 'k-buy', max_charge_cents: 900, at: 1, family_id: FAM, plan_id: 'v1', title: 'Plus', phase: 'held', ...o });
const payRow = (o: Record<string, unknown> = {}) => ({ kind: 'pay', user_id: UA, key: 'k-pay', max_charge_cents: 700, at: 1, sub_id: 'sub1', title: 'Plus', phase: 'held', ...o });
const upRow = (o: Record<string, unknown> = {}) => ({ kind: 'upgrade', user_id: UA, key: 'k-up', max_charge_cents: 450, at: 1, sub_id: 'x1', plan_id: 'pro-v1', title: 'Pro', phase: 'held', ...o });

const BUY: HeldPlanTarget = { kind: 'buy', familyId: FAM, planId: 'v1', subId: null };
const PAY: HeldPlanTarget = { kind: 'pay', subId: 'sub1', planId: null, familyId: null };
const UP: HeldPlanTarget = { kind: 'upgrade', subId: 'x1', planId: 'pro-v1', familyId: null };

function tab(o: { pending?: unknown[]; upgrade?: unknown[]; me?: string; identity?: string | null; post?: (c: Call) => Reply } = {}) {
  const local: Record<string, string> = {};
  if (o.pending) local.hub_money_pending = JSON.stringify(o.pending);
  if (o.upgrade) local.hub_money_upgrade = JSON.stringify(o.upgrade);
  const s = shop({ me: o.me, identity: o.identity, local, fetch: (c) => {
    const p = path(c);
    if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST' && o.post) return o.post(c);
    return { status: 404, body: {} };
  } });
  Object.assign(bounds, { read: 1000, post: 1000, op: 1000, list: 300, slack: 10 });
  return s;
}

beforeEach(() => { resetCommerce(); });
afterEach(() => { restoreStorage(); noLocks(); resetCommerce(); });

describe('heldPlanEntry: the entry for the target', () => {
  it('buy: the kept buy of the family, with its key, ceiling and request signature', () => {
    const row = buyRow();
    const s = tab({ pending: [payRow(), row], upgrade: [upRow()] });
    expect(heldPlanEntry(s.ctx(), BUY)).toEqual({ key: 'k-buy', maxCents: 900, sig: heldRequestSig(row as PendingEntry) });
  });
  it('pay: the kept payment of the subscription', () => {
    const row = payRow();
    const s = tab({ pending: [buyRow(), row], upgrade: [upRow()] });
    expect(heldPlanEntry(s.ctx(), PAY)).toEqual({ key: 'k-pay', maxCents: 700, sig: heldRequestSig(row as PendingEntry) });
  });
  it('upgrade: the kept upgrade of the subscription to that plan; planId null takes any plan', () => {
    const row = upRow();
    const s = tab({ pending: [buyRow(), payRow({ sub_id: 'x1' })], upgrade: [row] });
    const sig = heldRequestSig(row);
    expect(heldPlanEntry(s.ctx(), UP)).toEqual({ key: 'k-up', maxCents: 450, sig });
    expect(heldPlanEntry(s.ctx(), { ...UP, planId: null })).toEqual({ key: 'k-up', maxCents: 450, sig });
  });
  it('the kind decides the store: a pay of the same subscription is never the upgrade, nor the reverse', () => {
    const s = tab({ pending: [payRow({ sub_id: 'x1', key: 'k-pay-x1' })], upgrade: [upRow({ sub_id: 'sub1', key: 'k-up-sub1' })] });
    expect(heldPlanEntry(s.ctx(), { ...UP, subId: 'x1' })).toBeNull();
    expect(heldPlanEntry(s.ctx(), { ...PAY, subId: 'sub1' })).toBeNull();
    expect(heldPlanEntry(s.ctx(), { ...PAY, subId: 'x1' })?.key).toBe('k-pay-x1');
    expect(heldPlanEntry(s.ctx(), { ...UP, subId: 'sub1', planId: 'pro-v1' })?.key).toBe('k-up-sub1');
  });
  it('a buy matches by family alone (the plan version is not part of the target)', () => {
    const s = tab({ pending: [buyRow({ plan_id: 'v2' })] });
    expect(heldPlanEntry(s.ctx(), BUY)?.key).toBe('k-buy');
  });
});

describe('heldPlanEntry: none', () => {
  it('nothing held: null for every kind', () => {
    const s = tab();
    for (const t of [BUY, PAY, UP]) expect(heldPlanEntry(s.ctx(), t)).toBeNull();
  });
  it('no identity shown: null even with an entry kept', () => {
    const s = tab({ identity: null, pending: [buyRow(), payRow()], upgrade: [upRow()] });
    for (const t of [BUY, PAY, UP]) expect(heldPlanEntry(s.ctx(), t)).toBeNull();
  });
  it('another family, subscription or plan: null', () => {
    const s = tab({ pending: [buyRow({ family_id: FAM2 }), payRow({ sub_id: 'sub2' })], upgrade: [upRow({ plan_id: 'max-v1' })] });
    expect(heldPlanEntry(s.ctx(), BUY)).toBeNull();
    expect(heldPlanEntry(s.ctx(), PAY)).toBeNull();
    expect(heldPlanEntry(s.ctx(), UP)).toBeNull();
    expect(heldPlanEntry(s.ctx(), { ...UP, subId: 'x2', planId: null })).toBeNull();
  });
  it('a target without its id finds nothing (no family / no subscription)', () => {
    const s = tab({ pending: [buyRow(), payRow()], upgrade: [upRow()] });
    expect(heldPlanEntry(s.ctx(), { ...BUY, familyId: null })).toBeNull();
    expect(heldPlanEntry(s.ctx(), { ...PAY, subId: null })).toBeNull();
    expect(heldPlanEntry(s.ctx(), { ...UP, subId: null })).toBeNull();
  });
  it('another account\'s entries are never returned, while that account\'s own are once it is shown', () => {
    const s = tab({ pending: [buyRow({ user_id: UB }), payRow({ user_id: UB })], upgrade: [upRow({ user_id: UB })] });
    for (const t of [BUY, PAY, UP]) expect(heldPlanEntry(s.ctx(), t)).toBeNull();
    s.switchTo(UB, '2');
    s.show(UB);
    expect(heldPlanEntry(s.ctx(), BUY)?.key).toBe('k-buy');
    expect(heldPlanEntry(s.ctx(), PAY)?.key).toBe('k-pay');
    expect(heldPlanEntry(s.ctx(), UP)?.key).toBe('k-up');
  });
  it('the shown account\'s entry wins over another account\'s on the same target', () => {
    const s = tab({ pending: [buyRow({ user_id: UB, key: 'k-b' }), buyRow({ key: 'k-a' })], upgrade: [upRow({ user_id: UB, key: 'u-b' }), upRow({ key: 'u-a' })] });
    expect(heldPlanEntry(s.ctx(), BUY)?.key).toBe('k-a');
    expect(heldPlanEntry(s.ctx(), UP)?.key).toBe('u-a');
  });
  it('a malformed stored entry is not returned', () => {
    const s = tab({ pending: [buyRow({ key: '' }), payRow({ max_charge_cents: -1 })], upgrade: [upRow({ sub_id: 'bad id!' })] });
    for (const t of [BUY, PAY, UP]) expect(heldPlanEntry(s.ctx(), t)).toBeNull();
  });
});

describe('heldPlanEntry: read from the store now (cleared, settled, replaced)', () => {
  it('cleared: after the entry is dropped from the store, null', async () => {
    installWebLocks();
    const row = buyRow();
    const s = tab({ pending: [row, payRow()] });
    expect(heldPlanEntry(s.ctx(), BUY)?.key).toBe('k-buy');
    await dropPending(row as PendingEntry);
    expect(heldPlanEntry(s.ctx(), BUY)).toBeNull();
    expect(heldPlanEntry(s.ctx(), PAY)?.key).toBe('k-pay');
    localStorage.removeItem('hub_money_pending');
    expect(heldPlanEntry(s.ctx(), PAY)).toBeNull();
  });
  it('settled: an adopted buy resent with a definite answer is dropped; heldPlanEntry then finds none', async () => {
    installWebLocks();
    const s = tab({ pending: [buyRow({ key: 'k-kept' })], post: () => ({ status: 201, body: envelope(DONE) }) });
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    expect(a.snapshot().key).toBe('k-kept');
    expect(heldPlanEntry(s.ctx(), BUY)?.key).toBe('k-kept');
    await a.confirm(true);
    expect(heldPlanEntry(s.ctx(), BUY)).toBeNull();
  });
  it('staleKept: equal to the adopted attempt key while kept; different once another tab replaced the entry', () => {
    const s = tab({ pending: [buyRow({ key: 'k-kept' })] });
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    const staleKept = () => { const cs = a.snapshot(); return !!cs.key && heldPlanEntry(s.ctx(), BUY)?.key !== cs.key; };
    expect(staleKept()).toBe(false);
    localStorage.setItem('hub_money_pending', JSON.stringify([buyRow({ key: 'k-newer' })]));
    expect(heldPlanEntry(s.ctx(), BUY)?.key).toBe('k-newer');
    expect(staleKept()).toBe(true);
    localStorage.removeItem('hub_money_pending');
    expect(staleKept()).toBe(true);
  });
  it('a ceiling change in the store shows in maxCents and sig at once', () => {
    const s = tab({ upgrade: [upRow()] });
    const before = heldPlanEntry(s.ctx(), UP)!;
    localStorage.setItem('hub_money_upgrade', JSON.stringify([upRow({ max_charge_cents: 999 })]));
    const after = heldPlanEntry(s.ctx(), UP)!;
    expect(after.maxCents).toBe(999);
    expect(after.sig).not.toBe(before.sig);
    expect(after.key).toBe(before.key);
  });
});
