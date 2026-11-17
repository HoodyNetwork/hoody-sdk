// lease-live.ts: the lease manager hears the page go and come back, and an account change. Each test is red
// against a mutant (a handler removed, a reason widened, a DELETE added).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { agent } from '@core';
import { TARGET } from '../../core/test/env';
import { bump } from '../../core/ctx';
import { createLeaseManager, leases, type LeaseManager, type SessionRef } from './lease';
import { wireLeases } from './lease-live';

type Settled = Awaited<ReturnType<agent.AttachApi['acquire']>>;
const TTL = 15 * 60 * 1000;
const REF: SessionRef = { computer: 'p1-c1', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', sid: 's1', target: TARGET };
const ok = (id: string, at: number): Settled => ({ ok: true, body: { lease_id: id, expires_at: new Date(at).toISOString() } });

function fakeAgent() {
  const calls: string[] = [];
  let n = 0;
  const api: agent.AttachApi = {
    acquire: async (id) => { calls.push(`acquire ${id}`); return ok(`L${++n}`, Date.now() + TTL); },
    renew: async (id, lease) => { calls.push(`renew ${id} ${lease}`); return ok(lease, Date.now() + TTL); },
    release: async (id, lease, _realm, keepalive) => { calls.push(`release ${id} ${lease}${keepalive ? ' keepalive' : ''}`); return { ok: true, body: { status: 'ok' } }; },
  };
  return { api, calls };
}

/** An agent whose acquire answers only when the test says so. */
function deferredAgent() {
  const calls: string[] = [];
  let res: (s: Settled) => void = () => undefined;
  const api: agent.AttachApi = {
    acquire: (id) => { calls.push(`acquire ${id}`); return new Promise<Settled>((r) => { res = r; }); },
    renew: async (id, lease) => { calls.push(`renew ${id} ${lease}`); return ok(lease, Date.now() + TTL); },
    release: async (id, lease, _realm, keepalive) => { calls.push(`release ${id} ${lease}${keepalive ? ' keepalive' : ''}`); return { ok: true, body: { status: 'ok' } }; },
  };
  return { api, calls, resolveAcquire: (s: Settled) => res(s) };
}

let fa: ReturnType<typeof fakeAgent>;
let m: LeaseManager;
let win: EventTarget;
let doc: EventTarget;
let bumps: Set<(reason: string) => void>;
let off: () => void;
const fire = (t: EventTarget, name: string) => t.dispatchEvent(new Event(name));
const adv = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const names = (...p: string[]) => fa.calls.filter((c) => p.some((x) => c.startsWith(x)));
const fakeBump = (reason: string) => { for (const l of [...bumps]) l(reason); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
  fa = fakeAgent();
  m = createLeaseManager({ api: () => fa.api, graceMs: 0 });
  win = new EventTarget();
  doc = new EventTarget();
  bumps = new Set();
  off = wireLeases(m, { win, doc, onBump: (l) => { bumps.add(l); return () => { bumps.delete(l); }; } });
});
afterEach(() => { off(); m.reset(); vi.useRealTimers(); });

/** One pinned chat with its lease held. */
async function held() {
  const h = m.track(REF, { pinned: true });
  await adv(10);
  expect(m.state(REF).phase).toBe('held');
  return h;
}

describe('pagehide and pageshow', () => {
  it('pagehide gives the lease back with keepalive', async () => {
    await held();
    fire(win, 'pagehide');
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1 keepalive']);
    expect(m.state(REF).phase).toBe('none');
  });
  it('nothing is taken while the page is going', async () => {
    const h = await held();
    fire(win, 'pagehide');
    await adv(10);
    h.set({ busy: true });
    await adv(5000);
    expect(names('acquire')).toHaveLength(1);
  });
  it('pageshow takes a lease again for the demand that is still there', async () => {
    await held();
    fire(win, 'pagehide');
    await adv(10);
    fire(win, 'pageshow');
    await adv(10);
    expect(names('acquire')).toHaveLength(2);
    expect(m.state(REF).phase).toBe('held');
    expect(m.state(REF).leaseId).toBe('L2');
  });
  it('the first pageshow of a page that never left changes nothing', async () => {
    await held();
    fire(win, 'pageshow');
    await adv(10);
    expect(fa.calls).toEqual(['acquire s1']);
  });
});

describe('freeze and resume', () => {
  it('freeze gives the lease back with keepalive', async () => {
    await held();
    fire(doc, 'freeze');
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1 keepalive']);
  });
  it('resume takes it again', async () => {
    await held();
    fire(doc, 'freeze');
    await adv(10);
    fire(doc, 'resume');
    await adv(10);
    expect(names('acquire')).toHaveLength(2);
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('an account change', () => {
  for (const reason of ['account', 'signout', 'logout']) {
    it(`'${reason}' drops the leases locally and sends no DELETE`, async () => {
      const h = await held();
      fakeBump(reason);
      await adv(10);
      expect(names('release')).toEqual([]);
      expect(m.state(REF).phase).toBe('none');
      // The old handle is dead: it can neither take a lease nor keep one alive.
      h.set({ busy: true, pinned: true });
      h.close();
      // Past the renewal point (half the TTL) and past the expiry: no old timer is left to renew, acquire or release.
      await adv(TTL + 60_000);
      expect(fa.calls).toEqual(['acquire s1']);
    });
  }
  it('an acquire still on its way when the account changes adopts nothing and releases nothing', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, graceMs: 0 });
    const offLive = wireLeases(mm, { win, doc, onBump: (l) => { bumps.add(l); return () => { bumps.delete(l); }; } });
    mm.track(REF, { pinned: true });
    await adv(10);
    expect(d.calls).toEqual(['acquire s1']);
    expect(mm.state(REF).phase).toBe('acquiring');
    fakeBump('account');
    const told: string[] = [];
    const unsub = mm.subscribe((_k, st) => { told.push(st.phase); });
    d.resolveAcquire(ok('LATE', Date.now() + TTL));
    await adv(TTL + 60_000);
    unsub();
    expect(told).not.toContain('held');
    expect(mm.state(REF).phase).toBe('none');
    expect(mm.state(REF).leaseId).toBeUndefined();
    expect(d.calls).toEqual(['acquire s1']);
    offLive();
    mm.reset();
  });
  it('a new handle after the change takes its own lease', async () => {
    await held();
    fakeBump('account');
    m.track(REF, { pinned: true });
    await adv(10);
    expect(names('acquire')).toHaveLength(2);
    expect(m.state(REF).phase).toBe('held');
    expect(m.state(REF).leaseId).toBe('L2');
  });
  it('a switch of realm or computer is not an account change', async () => {
    await held();
    fakeBump('switch');
    fakeBump('fallback');
    fakeBump('suspended');
    await adv(10);
    expect(m.state(REF).phase).toBe('held');
    expect(names('release')).toEqual([]);
  });
});

describe('the wiring', () => {
  it('removes every listener when told to', async () => {
    await held();
    off();
    fire(win, 'pagehide');
    fire(doc, 'freeze');
    fakeBump('account');
    await adv(10);
    expect(names('release')).toEqual([]);
    expect(m.state(REF).phase).toBe('held');
    expect(bumps.size).toBe(0);
  });
  it('after disposal a pageshow or resume no longer takes leases again', async () => {
    await held();
    fire(win, 'pagehide');
    await adv(10);
    off();
    fire(win, 'pageshow');
    fire(doc, 'resume');
    await adv(5000);
    expect(names('acquire')).toHaveLength(1);
    expect(m.state(REF).phase).toBe('none');
  });
  it('a page with no window or document wires only the bump', () => {
    off();
    off = wireLeases(m, { win: null, doc: null, onBump: (l) => { bumps.add(l); return () => { bumps.delete(l); }; } });
    expect(bumps.size).toBe(1);
  });
});

describe('the page\'s one manager, leases()', () => {
  it('hears the page and the real account bump', () => {
    const p = leases();
    const gone = vi.spyOn(p, 'releaseAll'), back = vi.spyOn(p, 'resume'), reset = vi.spyOn(p, 'reset');
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('freeze'));
    document.dispatchEvent(new Event('resume'));
    expect(gone).toHaveBeenCalledTimes(2);
    expect(back).toHaveBeenCalledTimes(2);
    bump('switch');
    expect(reset).not.toHaveBeenCalled();
    bump('account');
    bump('signout');
    bump('logout');
    expect(reset).toHaveBeenCalledTimes(3);
    expect(leases()).toBe(p);
  });
});
