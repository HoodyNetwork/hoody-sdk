// Without Web Locks a top-up's first send would mint a key two tabs could each mint.
// It is refused ('noLocks'): no POST, no record. A top-up already held (its key stored) is still replayed by Check again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTopUp, resetCommerce } from './commerce';
import { boot, calls, onFetch, R1, UID } from './test/env';
import { removeTestLocks } from './test/locks';

const KEY = 'hub.v3.topup_pending';
const avail = () => ({ status: 200, body: { data: { card: { enabled: true }, crypto: { enabled: true } } } });
const keyOf = 'k'.repeat(24);
const posts = () => calls.filter((c) => c.method === 'POST');

beforeEach(() => { boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { vi.restoreAllMocks(); resetCommerce(); Reflect.deleteProperty(navigator, 'locks'); });

describe('top-up without Web Locks', () => {
  it('a first send is refused noLocks: no POST, nothing stored, the drawer is ready again', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    removeTestLocks();
    const t = createTopUp();
    await t.load();
    const r = await t.submit('10');
    expect(r).toMatchObject({ ok: false, reason: 'noLocks' });
    expect(posts()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(t.snapshot()).toMatchObject({ phase: 'ready', pending: null });
  });
  it('a held top-up (its key already stored) is still resent under that key by the confirmed resend (Check again only reads)', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ user_id: UID, key: keyOf, method: 'card', amount: '10.00', at: Date.now() }]));
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    removeTestLocks();
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().pending).toMatchObject({ key: keyOf });
    await t.resend(true);
    expect(posts()).toHaveLength(1);
    expect(JSON.stringify(posts()[0]!.body ?? '') + JSON.stringify(posts()[0]!.headers ?? '')).toContain(keyOf);
  });
  it('with Web Locks the first send goes out as before', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    await t.submit('10');
    expect(posts()).toHaveLength(1);
  });
});

// A Web Locks API that is present but never grants is no lock either.
describe('top-up with an unusable Web Locks API', () => {
  const broken = (how: 'throw' | 'reject') => Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: how === 'throw' ? () => { throw new DOMException('denied', 'SecurityError'); } : () => Promise.reject(new DOMException('denied', 'SecurityError')) },
  });
  for (const how of ['throw', 'reject'] as const) {
    it(`a first send (locks.request ${how}s) is refused noLocks: no POST, nothing stored`, async () => {
      onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
      const t = createTopUp();
      await t.load();
      broken(how);
      const r = await t.submit('10');
      expect(r).toMatchObject({ ok: false, reason: 'noLocks' });
      expect(posts()).toEqual([]);
      expect(localStorage.getItem(KEY)).toBeNull();
    });
    it(`a held top-up is still resent (confirmed) under its key (locks.request ${how}s)`, async () => {
      localStorage.setItem(KEY, JSON.stringify([{ user_id: UID, key: keyOf, method: 'card', amount: '10.00', at: Date.now() }]));
      onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
      broken(how);
      const t = createTopUp();
      await t.load();
      await t.resend(true);
      expect(posts()).toHaveLength(1);
      expect(JSON.stringify(posts()[0]!.body ?? '') + JSON.stringify(posts()[0]!.headers ?? '')).toContain(keyOf);
    });
  }
});
