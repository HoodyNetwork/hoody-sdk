// The storage fake is itself a test subject: the acceptance suite is only as honest as it is. These pin the browser behaviours
// the journal depends on (see the header of storage-fake.ts) and the real core adapter's behaviour ON TOP of them: that is what
// a Map-backed stub hides.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { partitioned } from '@core';
import { ACCOUNT, REQ, world, type World } from './env';
import { FakeLocalStorage, installFakeStorage, quotaError, sweepReadFaults } from './storage-fake';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('FakeLocalStorage: the Storage interface', () => {
  it('stores strings, reads absent keys as null, keeps insertion order, length and key(i)', () => {
    const fs = new FakeLocalStorage();
    fs.setItem('a', 1 as any);
    fs.setItem('b', 'x');
    expect(fs.getItem('a')).toBe('1');
    expect(fs.getItem('zzz')).toBeNull();
    expect([fs.length, fs.key(0), fs.key(1), fs.key(2)]).toEqual([2, 'a', 'b', null]);
    fs.removeItem('a');
    fs.clear();
    expect(fs.length).toBe(0);
  });
  it('a quota failure throws QuotaExceededError (code 22) and leaves the old value; removal and clear never need quota', () => {
    const fs = new FakeLocalStorage();
    fs.quota = 20;
    fs.setItem('k', 'v'.repeat(10));
    let err: any = null;
    try { fs.setItem('k', 'v'.repeat(40)); } catch (e) { err = e; }
    expect(err?.name).toBe('QuotaExceededError');
    expect(err?.code).toBe(22);
    expect(fs.getItem('k')).toBe('v'.repeat(10));
    try { fs.setItem('other', 'w'.repeat(15)); err = null; } catch (e) { err = e; }
    expect(err?.name).toBe('QuotaExceededError');
    fs.removeItem('k');
    expect(fs.used()).toBe(0);
  });
  it('a denied browser throws SecurityError on every access', () => {
    const fs = new FakeLocalStorage();
    fs.denied = true;
    for (const op of [() => fs.getItem('k'), () => fs.setItem('k', 'v'), () => fs.removeItem('k'), () => fs.clear(), () => fs.length]) {
      expect(op).toThrow(/insecure|SecurityError/i);
    }
  });
});

describe('FakeLocalStorage: faults', () => {
  it('failRead({nth}) fails exactly the nth read of that key and no other read; the bytes are untouched', () => {
    const fs = new FakeLocalStorage();
    fs.setItem('k', 'v');
    fs.setItem('o', 'w');
    const rule = fs.failRead({ key: 'k', nth: 2 });
    expect(fs.getItem('k')).toBe('v');
    expect(() => fs.getItem('k')).toThrow();
    expect(fs.getItem('o')).toBe('w');
    expect(fs.getItem('k')).toBe('v');
    expect([rule.seen, rule.failed]).toEqual([3, 1]);
    expect(fs.peek('k')).toBe('v');
  });
  it('blockReads / blockWrites hold until clearFaults; a refused write changes nothing', () => {
    const fs = new FakeLocalStorage();
    fs.setItem('k', 'v');
    fs.blockWrites('k');
    expect(() => fs.setItem('k', 'new')).toThrow();
    expect(() => fs.removeItem('k')).toThrow();
    expect(fs.peek('k')).toBe('v');
    fs.blockReads('k');
    expect(() => fs.getItem('k')).toThrow();
    fs.clearFaults();
    expect(fs.getItem('k')).toBe('v');
    fs.setItem('k', 'new');
    expect(fs.getItem('k')).toBe('new');
  });
  it('the call log records what was asked, by whom, and whether it threw', () => {
    const fs = new FakeLocalStorage();
    fs.failRead({ key: 'k' });
    try { fs.getItem('k'); } catch { /* the fault */ }
    fs.asTab('B', () => fs.setItem('k', 'v'));
    expect(fs.calls.map((c) => [c.op, c.key, c.tab, c.threw])).toEqual([['get', 'k', 'A', true], ['set', 'k', 'B', false]]);
  });
});

describe('FakeLocalStorage: storage events', () => {
  it('another tab\'s change reaches this tab as an async storage event; this tab\'s own writes never do', async () => {
    const fs = new FakeLocalStorage();
    const un = installFakeStorage(fs);
    const seen: any[] = [];
    const on = (e: any) => seen.push({ key: e.key, o: e.oldValue, n: e.newValue });
    globalThis.addEventListener('storage', on);
    try {
      fs.setItem('k', '1');                                      // own write
      fs.asTab('B', () => fs.setItem('k', '2'));
      expect(seen).toHaveLength(0);                              // asynchronous
      await tick(); await tick();
      expect(seen).toEqual([{ key: 'k', o: '1', n: '2' }]);
      fs.asTab('B', () => fs.setItem('k', '2'));                 // same value: no event
      fs.asTab('B', () => fs.removeItem('absent'));              // nothing to remove: no event
      fs.asTab('B', () => fs.clear());
      await tick(); await tick();
      expect(seen.map((x) => x.key)).toEqual(['k', null]);
    } finally { globalThis.removeEventListener('storage', on); un(); }
  });
  it('manual mode holds events until flushEvents (a tab that has not yet heard)', () => {
    const fs = new FakeLocalStorage();
    fs.eventMode = 'manual';
    fs.asTab('B', () => fs.setItem('k', '1'));
    expect(fs.pendingEvents()).toBe(1);
    fs.flushEvents();
    expect([fs.pendingEvents(), fs.events.length]).toEqual([0, 1]);
  });
});

describe('the real core partitioned() over the fake: what the journal actually sees', () => {
  it('one logical read is several browser reads; a throw on any of them reads as "nothing stored" through get()', () => {
    w = world();
    const p = partitioned(REQ, { scope: 'account' });
    expect(p.set({ a: 1 })).toBe(true);
    const before = w.fs.readsOf(REQ);
    expect(p.get()).toEqual({ a: 1 });
    expect(w.fs.readsOf(REQ)).toBe(before + 1);
    w.fs.failRead({ key: REQ });
    expect(p.get()).toBeNull();                                  // core swallows the failure: the hazard
    expect(p.read()).toEqual({ value: { a: 1 }, reset: null });  // and the bytes were never touched
  });
  it('a quota failure on set makes core return false and keeps the old document', () => {
    w = world();
    const p = partitioned(REQ, { scope: 'account' });
    expect(p.set({ a: 1 })).toBe(true);
    w.fs.quota = w.fs.used();
    expect(p.set({ a: 1, b: 'x'.repeat(50) })).toBe(false);
    expect(p.get()).toEqual({ a: 1 });
  });
  it('the account partition is the shown account: another account sees nothing of this one', async () => {
    w = world();
    const p = partitioned(REQ, { scope: 'account' });
    p.set({ mine: true });
    const { showAccount, OTHER } = await import('./env');
    showAccount(OTHER);
    expect(p.get()).toBeNull();
    showAccount(ACCOUNT);
    expect(p.get()).toEqual({ mine: true });
  });
});

describe('sweepReadFaults', () => {
  it('runs a scenario at each read position until the operation stops reaching them', async () => {
    const seenAt: number[] = [];
    const ks = await sweepReadFaults(10, (k) => { seenAt.push(k); return { reached: k <= 3 }; });
    expect(ks).toEqual([1, 2, 3]);
    expect(seenAt).toEqual([1, 2, 3, 4]);
    void quotaError;
  });
});
