// Shared rig for the commerce suites: users, API-shaped rows and replies, and a booted tab that stands in for the
// old fake shell (identity shown, stored session, context bump) on the real core.
import { vi } from 'vitest';
import { budgets } from '../commerce';
import { market as M } from '../commerce-pure';
import { bump, capture, setIdentity } from '../ctx';
import { boot, calls, onFetch, OTHER, R1, sessionToken, signIn, UID, type Call, type Reply } from './env';

export { calls, R1 };
export type { Call, Reply };
export const UA = UID;
export const UB = OTHER;
export const R2X = 'cccccccccccccccccccccccc';
export const DIRS = [['A→B', UA, UB], ['B→A', UB, UA]] as const;

/** The path of a call without host or /api/v1 prefix. */
export const path = (c: Call): string => c.url.replace(/^https:\/\/[^/]+/, '').replace(/^\/api\/v1/, '');
/** The subscription route's own 2xx to the money request `c` made (subserver-subscription.routes.ts accepted():
 *  operation, subscription, replayed): a buy admits a 'purchase' and an upgrade an 'upgrade', each of the plan its body
 *  sent; a pay a 'resume'. A buy's new subscription is `buySub`. */
export function accepted(c: Call, o: { buySub?: string; state?: string; replayed?: boolean; result?: string | null } = {}) {
  const m = /^\/subserver-subscriptions\/([^/?]+)\/(pay|upgrade)$/.exec(path(c).split('?')[0]!);
  const kind = m ? (m[2] === 'pay' ? 'resume' : 'upgrade') : 'purchase';
  const sub = m ? decodeURIComponent(m[1]!) : (o.buySub ?? 'x1');
  const plan = kind !== 'resume' && c.body && typeof c.body.plan_id === 'string' ? c.body.plan_id : null;
  return {
    operation: { id: 'op1', subscription_id: sub, kind, target_plan_id: plan, result: o.result ?? null },
    subscription: { id: sub, state: o.state ?? 'provisioning' }, replayed: o.replayed ?? false,
  };
}
/** The user the bearer token of a call names. */
export const uidOf = (c: Call): string | null => {
  const b = (c.headers['authorization'] || '').replace(/^Bearer /, '');
  try { return (JSON.parse(atob(b.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { id?: string }).id ?? null; } catch { return null; }
};
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Machines outlive their test unless drained: a rent or reserve left mid-admission or mid-POST moves on in a later
// test (its next timers land on that test's fake clock), writing its row into that test's store (34 rows for
// 33 on a slow machine). A suite wraps its machines in tracked() and awaits
// drainMachines() in an afterEach that runs before resetCommerce and the clock's removal.
const realImmediate = globalThis.setImmediate; // captured at import, before any test fakes the clock
type Machine = { dispose(): void; snapshot(): { state: string } };
const machines: Machine[] = [];
export function tracked<T extends Machine>(m: T): T { machines.push(m); return m; }
const MONEY_KEYS = ['hub.v3.rent_pending', 'hub_market_pending', 'hub.v3.topup_pending', 'hub_money_pending'];
/** Disposes every tracked machine, then runs the clock until none is 'posting', or fails the test.
 *  While 'posting' a disposed machine still moves: an admission not yet sent goes back to idle and sends nothing; a POST
 *  already out ends on its answer or its posting deadline (a timer dispose leaves running: budgets.postingMs, 30 s by
 *  default), and that move may write its own row. Rounds of 1 s of fake time plus a real turn of the event loop run
 *  until no machine is 'posting' and, for 3 rounds, no call and no money store changed; past 60 rounds it throws,
 *  naming the machines still posting.
 *  Not awaited: writes a machine queued on the pending-store lock (queueRent, marketPendingDrop, marketRetryAt). Run
 *  after their test, what they can touch of the next one (tests in commerce-purchase.test.ts, 'a write queued on the
 *  lock and run after its test, against the next test's store'):
 *  - rent: a queued write lands only while rentQueued holds its id, and resetCommerce clears rentQueued (pinned by a
 *    test). This holds only until a queueRent for the same rent id fills it again before the old callback runs.
 *  - reserve (marketRetryAt, marketPendingDrop): each writes only when it finds its own key, and keys are fresh in
 *    every test, so a late one leaves the next test's hub_market_pending byte for byte, invalid rows and malformed
 *    JSON included (pinned by a test for the drop).
 *  - a lock a test holds and never releases is that test's fake (heldLocks), and noLocks drops it, so nothing queued
 *    on it runs. No test pins this. */
export async function drainMachines(): Promise<void> {
  const all = machines.splice(0);
  for (const m of all) m.dispose();
  if (!all.length || !vi.isFakeTimers()) return;
  // Read past a test's own storage breaks (instance spies): the prototype's method on the instance.
  const read = (k: string): string | null => { try { return Storage.prototype.getItem.call(localStorage, k); } catch { return '?'; } };
  const look = (): string => calls.length + '|' + MONEY_KEYS.map(read).join('|');
  const posting = (): number => all.filter((m) => m.snapshot().state === 'posting').length;
  let last = look(), still = 0;
  for (let i = 0; i < 60; i++) {
    await vi.advanceTimersByTimeAsync(1000);
    await new Promise<void>((r) => { realImmediate(r); });
    const now = look();
    still = now === last ? still + 1 : 0;
    last = now;
    if (still >= 3 && posting() === 0) return;
  }
  throw new Error(`drainMachines: not drained after 60 rounds (${posting()} of ${all.length} machines still posting; stores ${still >= 3 ? 'still' : 'still moving'})`);
}
export const never = () => new Promise<Reply>(() => { /* never answers */ });
export const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
export const posts = (): Call[] => calls.filter((c) => c.method !== 'GET' && path(c) !== '/users/auth/refresh');
export const hostOf = (c: Call): string => (/^https:\/\/([^/]+)/.exec(c.url) || [, 'base'])[1] as string;

// Rows and replies in the API's shapes (the shapes the old suites used).
export const envelope = (data: unknown, total?: number) => ({ statusCode: 200, data, ...(total !== undefined ? { total } : {}) });
export function stockRaw(over: Record<string, unknown> = {}) {
  return {
    id: 's1', name: 'rack-us-1', country: 'US', region: 'us-east', city: 'New York', datacenter: 'NYC-DC1', model: 'Intel Xeon E5-2680 v4',
    is_vm: false, category: 'compute', featured: false, popularity_rank: 1, setup_time_minutes: 15, delivery_hours: 0,
    pricing: { prices: { '1': '12.00' }, setup_fee: '25.00', setup_fee_cents: 2500, price_tiers: { '1': { price: '12.00', hold_days: 1, total_first_payment: '37.00' } } },
    specs: { cpu: { model: 'Xeon E5', cores: 8 }, ram: { capacity_gb: 32 }, disks: { total_gb: 500 }, network: {}, additional: { ipv4_count: 1 } },
    ...over,
  };
}
export function offerRaw(over: Record<string, unknown> = {}) {
  return {
    id: 'o1', name: 'epyc-fra-1', country: 'DE', region: 'eu-central', city: 'Frankfurt', datacenter: 'FRA-DC2', cpu_model: 'AMD EPYC 7763',
    cpu_cores: 64, cpu_threads: 128, ram_gb: 256, disks: [{ count: 2, capacity_gb: 1000, type: 'NVMe' }], bandwidth_mbps: 10000, traffic_tb: 100,
    traffic_unlimited: false, ipv4_count: 5, pricing_rules: { '7': 7000 }, hold_rules: { '7': 2 }, setup_fee_cents: 2500, setup_fee_rules: null,
    delivery_hours: 48, setup_time_minutes: 30, stock: 3, ...over,
  };
}
export const typedErr = (status: number, code: string | null, details?: unknown): Reply =>
  ({ status, body: { statusCode: status, error: code, code, message: 'err', data: details ?? {} } });
export const RENT_201 = { statusCode: 201, message: 'ok', data: { rental: { id: 'rr1', server_id: 's1', status: 'active' } } };
export const reserve201 = (replayed = false, offer = 'o1') => ({
  statusCode: 201, message: 'ok',
  data: { reservation: { id: 'rv1', offer_id: offer, days: 7, state: 'pending', created_at: new Date(Date.now() + 500).toISOString() }, replayed },
});
export const rows = () => ({ stock: M.normalizeStockRow(stockRaw(), 0), offer: M.normalizeOfferRow(offerRaw(), 0) });

export interface ShopOpts {
  /** The stored session's user (default UA). */
  me?: string;
  /** The identity the Hub displays: default `me`; null = a failed boot (none). */
  identity?: string | null;
  selected?: string;
  /** Local / session storage to start with (a reload keeps these). */
  local?: Record<string, string>;
  session?: Record<string, string>;
  fetch?: (c: Call) => Reply | Promise<Reply> | undefined;
}
export const snapshotStores = () => {
  const dump = (s: Storage) => { const o: Record<string, string> = {}; for (let i = 0; i < s.length; i++) { const k = s.key(i)!; o[k] = s.getItem(k)!; } return o; };
  return { local: dump(localStorage), session: dump(sessionStorage) };
};
/** A booted tab: stored session `me`, `identity` shown, the fetch handler (anything it leaves undefined answers 404). */
export function shop(o: ShopOpts = {}) {
  const me = o.me ?? UA;
  const exp = Math.floor(Date.now() / 1000);
  const storage: Record<string, string> = o.local && o.local.access_token ? { ...o.local } : {
    access_token: sessionToken(me, { sid: 'sid-' + me.slice(-4), exp: exp + 3600 }),
    refresh_token: sessionToken(me, { sid: 'sid-' + me.slice(-4), exp: exp + 86400 }),
    ...(o.local ?? {}),
  };
  boot({ realm: o.selected && o.selected !== 'all' ? o.selected : undefined, signedIn: false, identity: false, storage });
  for (const [k, v] of Object.entries(o.session ?? {})) sessionStorage.setItem(k, v);
  const shown = o.identity === undefined ? me : o.identity;
  if (shown) setIdentity({ id: shown, banned: false });
  if (o.fetch) onFetch((c) => o.fetch!(c) ?? { status: 404, body: { error: 'unmocked' } });
  return {
    ctx: () => capture(),
    show(id: string | null) { setIdentity(id ? { id, banned: false } : null); },
    /** Another account signs in (the stored session moves). */
    switchTo(uid: string, n?: string) {
      const e = Math.floor(Date.now() / 1000);
      const sid = n ? 'sid-n' + n : 'sid-' + uid.slice(-4); // no `n`: the same session id (tokens renewed), else a new session
      localStorage.setItem('access_token', sessionToken(uid, { sid, exp: e + 3600 }));
      localStorage.setItem('refresh_token', sessionToken(uid, { sid, exp: e + 86400 }));
    },
    bump() { bump('test'); },
    signIn,
  };
}
export type Shop = ReturnType<typeof shop>;

/** A tab whose purchase routes answer from `on(call)`; anything else answers an empty list / the caller's identity. */
export function shopFor(on: (c: Call) => Reply | Promise<Reply> | undefined, o: ShopOpts = {}): Shop {
  const s = shop({
    ...o,
    fetch: (c) => {
      const r = on(c);
      if (r) return r;
      const p = path(c);
      if (p === '/rentals' || p.startsWith('/reservations')) return { status: 200, body: envelope([]) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return { status: 404, body: { error: 'unmocked' } };
    },
  });
  fast();
  return s;
}
/** Short Market budgets (the old suites' `fast`). */
export function fast(): void { Object.assign(budgets, { postingMs: 400, reconcileMs: 400, checkMs: 400, readRetryMs: 5 }); }

/** navigator.locks for one tab whose pending-store lock a test can hold (FIFO per lock name, as Web Locks). */
export function heldLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const request = (n: string, a: unknown, b?: unknown) => {
    const fn = (typeof a === 'function' ? a : b) as () => unknown;
    const r = (tails.get(n) || Promise.resolve()).then(fn);
    tails.set(n, r.then(() => undefined, () => undefined));
    return r;
  };
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  let open: (() => void) | null = null;
  return {
    hold() { const g = gate(); open = g.open; void request('hub_money_pending', () => g.p); },
    release() { if (open) open(); open = null; },
  };
}
export const noLocks = () => { Reflect.deleteProperty(navigator, 'locks'); };

const spies: Array<{ mockRestore: () => void }> = [];
/** Undo breakKey / rewriteKey (the suites call it after every test). */
export function restoreStorage(): void { while (spies.length) spies.pop()!.mockRestore(); }
function patch(op: 'getItem' | 'setItem', f: (orig: (k: string, v?: string) => unknown, self: Storage, k: string, v?: string) => unknown): void {
  const orig = Storage.prototype[op] as unknown as (...a: string[]) => unknown;
  spies.push(vi.spyOn(localStorage, op as 'getItem').mockImplementation(function (this: Storage, k: string, v?: string) {
    return f((kk, vv) => orig.call(this, kk, vv as string), this, k, v);
  } as never));
}
/** Break one localStorage key: `how` 'throw' makes the op throw, 'drop' ignores a write; `only` = the 1-based calls on that key to break. */
export function breakKey(op: 'getItem' | 'setItem', key: string, how: 'throw' | 'drop', only?: number[]): void {
  let n = 0;
  patch(op, (orig, _self, k, v) => {
    if (k === key && (!only || only.includes(++n))) { if (how === 'throw') throw new Error('storage'); return undefined; }
    return orig(k, v);
  });
}
/** Rewrite what a setItem of `key` stores. */
export function rewriteKey(key: string, f: (v: string) => string): void {
  patch('setItem', (orig, _self, k, v) => orig(k, k === key ? f(v as string) : v));
}
