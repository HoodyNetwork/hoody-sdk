// Vitest: the top-up pending store is never cut. It holds one row per account
// (holdTopUp); the old slice(-8) dropped another account's held top-up when a 9th account on this browser stored
// one, losing its "may have gone through" and freeing a second top-up with no warning.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTopUp, resetCommerce } from './commerce';
import { boot, calls, onFetch, R1, UID } from './test/env';

const KEY = 'hub.v3.topup_pending';
const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<{ user_id: string; key: string }>;
const posts = () => calls.filter((c) => c.method !== 'GET');
const env = (data: unknown) => ({ status: 200, body: { data } });
const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
const held = (i: number) => ({ user_id: `other-account-${i}`, key: `othertab-topup-key-${String(i).padStart(4, '0')}`, method: 'card', amount: '10.00', at: Date.now() - 60_000 + i });

beforeEach(() => { localStorage.removeItem(KEY); boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { vi.restoreAllMocks(); resetCommerce(); localStorage.removeItem(KEY); });

describe('the top-up pending store is never cut', () => {
  it('8 other accounts each hold a top-up: this account\'s 9th row is stored and every older row is kept', async () => {
    const theirs = Array.from({ length: 8 }, (_, i) => held(i));
    localStorage.setItem(KEY, JSON.stringify(theirs));
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise(() => {})));
    const t = createTopUp();
    await t.load();
    void t.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await vi.waitFor(() => expect(stored()).toHaveLength(9));
    const all = stored();
    expect(all.filter((x) => x.user_id !== UID)).toEqual(theirs);
    expect(all.filter((x) => x.user_id === UID)).toHaveLength(1);
  });
});
