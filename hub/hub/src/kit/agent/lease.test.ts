// lease.ts: a chat the tab is not streaming but that is running or waiting holds a keep-alive lease; idle
// chats take none. Red-first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { agent } from '@core';
import { createStreamBudget, type Grant, type StreamBudget } from '@core';
import { TARGET } from '../../core/test/env';
import { createLeaseManager, leasedWatch, refKey, type LeaseManager, type LeaseState, type LeaseStore, type SessionRef } from './lease';

type Settled = Awaited<ReturnType<agent.AttachApi['acquire']>>;
const TTL = 15 * 60 * 1000;
const ok = (id: string, at: number): Settled => ({ ok: true, body: { lease_id: id, expires_at: new Date(at).toISOString() } });
const bad = (status: number, code = '', kind: 'failed' | 'pending' | 'stale' = 'failed'): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });

const REF: SessionRef = { computer: 'p1-c1', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', sid: 's1', target: TARGET };
const REF2: SessionRef = { computer: 'p1-c1', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', sid: 's2', target: TARGET };

/** A fake agent: the calls it got, in order, and what each next call answers (default: it works). */
function fakeAgent() {
  const calls: string[] = [];
  const script: { acquire: Settled[]; renew: Settled[]; release: Settled[] } = { acquire: [], renew: [], release: [] };
  let n = 0;
  const held = new Set<string>();
  const api: agent.AttachApi = {
    acquire: async (id) => {
      calls.push(`acquire ${id}`);
      const s = script.acquire.shift();
      if (s) return s;
      const lid = `L${++n}`;
      held.add(lid);
      return ok(lid, Date.now() + TTL);
    },
    renew: async (id, lease) => {
      calls.push(`renew ${id} ${lease}`);
      const s = script.renew.shift();
      if (s) return s;
      if (!held.has(lease)) return bad(404);
      return ok(lease, Date.now() + TTL);
    },
    release: async (id, lease, _realm, keepalive) => {
      calls.push(`release ${id} ${lease}${keepalive ? ' keepalive' : ''}`);
      const s = script.release.shift();
      if (s) return s;
      held.delete(lease);
      return { ok: true, body: { status: 'ok', released: true } };
    },
  };
  return { api, calls, script, held, restart: () => held.clear() };
}
function memStore(init: Record<string, string> = {}): LeaseStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, read: (r) => data[refKey(r)], write: (r, id) => { if (id === undefined) delete data[refKey(r)]; else data[refKey(r)] = id; } };
}

let fa: ReturnType<typeof fakeAgent>;
let store: ReturnType<typeof memStore>;
let m: LeaseManager;
const adv = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const names = (...p: string[]) => fa.calls.filter((c) => p.some((x) => c.startsWith(x)));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-27T17:00:00Z'));
  fa = fakeAgent();
  store = memStore();
  m = createLeaseManager({ api: () => fa.api, store, graceMs: 0 });
});
afterEach(() => { m.reset(); vi.useRealTimers(); });

describe('when a lease is needed', () => {
  it('idle takes none: no handle busy, nothing pinned', async () => {
    m.track(REF);
    m.track(REF, { streaming: false });
    await adv(1000);
    expect(fa.calls).toEqual([]);
  });
  it('busy and not streaming acquires once; busy while streaming takes none', async () => {
    const h = m.track(REF, { busy: true, streaming: true });
    await adv(1000);
    expect(fa.calls).toEqual([]);
    h.set({ streaming: false });
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1']);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L1' });
    expect(store.data[refKey(REF)]).toBe('L1');
  });
  it('a list-only view of a waiting chat (busy, never streamed) holds one', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    expect(m.state(REF).phase).toBe('held');
  });
  it('the stream is the session\'s: one handle streaming covers the busy view of another', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    const dock = m.track(REF, { streaming: true });
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
    dock.set({ streaming: false });
    await adv(10);
    expect(names('acquire').length).toBe(2);
  });
  it('one lease per session, however many handles; the last handle to close releases it', async () => {
    const a = m.track(REF, { busy: true }), b = m.track(REF, { busy: true });
    await adv(10);
    expect(names('acquire').length).toBe(1);
    a.close();
    await adv(10);
    expect(names('release').length).toBe(0);
    b.close();
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
    expect(m.state(REF).phase).toBe('none');
  });
  it('two sessions hold two leases', async () => {
    m.track(REF, { busy: true });
    m.track(REF2, { busy: true });
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1', 'acquire s2']);
  });
});

describe('before the stream is cut', () => {
  it('ensure() takes the lease while the stream is still counted live, and keeps it after the cut', async () => {
    const h = m.track(REF, { busy: true, streaming: true });
    await adv(10);
    expect(fa.calls).toEqual([]);
    await m.ensure(REF);
    expect(names('acquire')).toEqual(['acquire s1']);
    expect(m.state(REF).phase).toBe('held');
    await adv(10);
    expect(names('release')).toEqual([]);
    h.set({ streaming: false });
    await adv(10);
    expect(names('release', 'acquire')).toEqual(['acquire s1']);
  });
  it('a cut that did not happen: the stream reporting live again clears the cut, and the lease goes', async () => {
    const h = m.track(REF, { busy: true, streaming: true });
    await m.ensure(REF);
    expect(m.state(REF).phase).toBe('held');
    h.set({ streaming: true });
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
  });
  it('ensure() on an idle or untracked chat settles at once and takes nothing', async () => {
    await m.ensure(REF);
    m.track(REF);
    await m.ensure(REF);
    expect(fa.calls).toEqual([]);
  });
  it('ensure() settles when the acquire fails; the retry goes on in the background', async () => {
    m.track(REF, { busy: true, streaming: true });
    fa.script.acquire.push(bad(503));
    await m.ensure(REF);
    expect(m.state(REF).phase).toBe('failing');
  });
});

describe('renew and release', () => {
  it('renews at half the time left, again and again', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    await adv(TTL / 2 - 100);
    expect(names('renew')).toEqual([]);
    await adv(200);
    expect(names('renew')).toEqual(['renew s1 L1']);
    await adv(TTL / 2);
    expect(names('renew').length).toBe(2);
  });
  it('releases when the chat settles (busy false); the store forgets the lease', async () => {
    const h = m.track(REF, { busy: true });
    await adv(10);
    h.set({ busy: false });
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
    expect(store.data[refKey(REF)]).toBeUndefined();
    await adv(TTL);
    expect(names('renew')).toEqual([]);
  });
  it('a release the agent could not answer keeps the id in the store (a reload can renew or find it gone)', async () => {
    const h = m.track(REF, { busy: true });
    await adv(10);
    fa.script.release.push(bad(503));
    h.set({ busy: false });
    await adv(10);
    expect(store.data[refKey(REF)]).toBe('L1');
  });
  it('pagehide: releaseAll() releases every lease held, with keepalive', async () => {
    m.track(REF, { busy: true });
    m.track(REF2, { busy: true });
    await adv(10);
    m.releaseAll();
    await adv(10);
    expect(names('release').sort()).toEqual(['release s1 L1 keepalive', 'release s2 L2 keepalive']);
  });
});

describe('pinned: a Hub-started run, the create gap, a settings session', () => {
  it('a run is leased until it ends even while a stream is open and the chat shows idle', async () => {
    const run = m.track(REF, { pinned: true, streaming: true });
    await adv(10);
    expect(m.state(REF).phase).toBe('held');
    await adv(TTL * 2);
    expect(names('renew').length).toBeGreaterThanOrEqual(2);
    expect(names('release')).toEqual([]);
    run.set({ pinned: false });
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
  });
});

describe('when the agent says no', () => {
  it('410 on renew while needed: acquire again, a new lease', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    fa.script.renew.push(bad(410, 'attachment_expired'));
    await adv(TTL / 2 + 10);
    expect(names('acquire').length).toBe(2);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L2' });
    expect(store.data[refKey(REF)]).toBe('L2');
  });
  it('an agent restart (the lease is unknown: 404 on renew) acquires again', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    fa.restart();
    await adv(TTL / 2 + 10);
    expect(names('acquire').length).toBe(2);
    expect(m.state(REF).phase).toBe('held');
  });
  it('404 on acquire (closing or gone): phase gone, no retry loop; forget() allows a new try', async () => {
    fa.script.acquire.push(bad(404, 'not_found'));
    m.track(REF, { busy: true });
    await adv(60000);
    expect(names('acquire').length).toBe(1);
    expect(m.state(REF).phase).toBe('gone');
    fa.script.acquire.length = 0;
    m.forget(REF);
    await adv(10);
    expect(m.state(REF).phase).toBe('held');
  });
  it('a stale context (the page moved on) is gone as well, not a loop', async () => {
    fa.script.acquire.push(bad(0, '', 'stale'));
    m.track(REF, { busy: true });
    await adv(60000);
    expect(names('acquire').length).toBe(1);
    expect(m.state(REF).phase).toBe('gone');
  });
  it('503 and network failures retry after 1, 2, 5, 10, 10 s while needed, and stop when not', async () => {
    fa.script.acquire.push(bad(503), bad(503), bad(503), bad(503), bad(503));
    const h = m.track(REF, { busy: true });
    await adv(10);
    expect(m.state(REF).phase).toBe('failing');
    const at: number[] = [];
    let t = 10;
    for (const due of [1000, 3000, 8000, 18000]) {
      await adv(due - 5 - t); at.push(names('acquire').length); await adv(10); t = due + 5;
    }
    expect(at).toEqual([1, 2, 3, 4]);
    expect(names('acquire').length).toBe(5);
    h.set({ busy: false });
    await adv(60000);
    expect(names('acquire').length).toBe(5);
  });
  it('a renew that keeps failing retries until the lease runs out, then acquires a new one', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    for (let i = 0; i < 400; i++) fa.script.renew.push(bad(503));
    await adv(TTL + 5000);
    expect(names('renew').length).toBeGreaterThan(3);
    expect(names('acquire').length).toBe(2);
    expect(m.state(REF).phase).toBe('held');
  });
  it('an acquire that answers after the need ended is released at once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: agent.AttachApi = { ...fa.api, acquire: async (id, realm, ttl) => { await gate; return fa.api.acquire(id, realm, ttl); } };
    const mm = createLeaseManager({ api: () => slow, store, graceMs: 0 });
    const h = mm.track(REF, { busy: true });
    await adv(10);
    h.set({ busy: false });
    release();
    await adv(10);
    expect(names('acquire', 'release')).toEqual(['acquire s1', 'release s1 L1']);
    expect(mm.state(REF).phase).toBe('none');
    mm.reset();
  });
});

describe('a reload', () => {
  it('renews the lease the journal kept instead of minting another', async () => {
    fa.held.add('Lold');
    store.data[refKey(REF)] = 'Lold';
    m.track(REF, { busy: true });
    await adv(10);
    expect(fa.calls).toEqual(['renew s1 Lold']);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'Lold' });
  });
  it('an expired kept lease (410) or a forgotten one (404) is dropped and a new one acquired', async () => {
    store.data[refKey(REF)] = 'Lold';
    fa.script.renew.push(bad(410, 'attachment_expired'));
    m.track(REF, { busy: true });
    await adv(10);
    expect(fa.calls).toEqual(['renew s1 Lold', 'acquire s1']);
    expect(store.data[refKey(REF)]).toBe('L1');
  });
  it('a stale context on the kept lease\'s renew is gone: nothing else is tried', async () => {
    store.data[refKey(REF)] = 'Lold';
    fa.script.renew.push(bad(0, '', 'stale'));
    m.track(REF, { busy: true });
    await adv(60000);
    expect(fa.calls).toEqual(['renew s1 Lold']);
    expect(m.state(REF).phase).toBe('gone');
  });
  it('a kept lease and a renew that fails for another reason keeps trying that lease', async () => {
    store.data[refKey(REF)] = 'Lold';
    fa.script.renew.push(bad(503));
    m.track(REF, { busy: true });
    await adv(10);
    expect(m.state(REF).phase).toBe('failing');
    expect(names('acquire')).toEqual([]);
  });
});

describe('subscribers and reset', () => {
  it('phases are announced as they change', async () => {
    const seen: LeaseState['phase'][] = [];
    m.subscribe((_k, s) => { if (seen.at(-1) !== s.phase) seen.push(s.phase); });
    const h = m.track(REF, { busy: true });
    await adv(10);
    h.close();
    await adv(10);
    expect(seen).toEqual(['acquiring', 'held', 'none']);
  });
  it('reset drops everything without calling the agent', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    const before = fa.calls.length;
    m.reset();
    await adv(TTL * 2);
    expect(fa.calls.length).toBe(before);
  });
});

describe('grace: a stream that is still opening is not a gap', () => {
  it('a busy chat takes its lease only after graceMs without a stream; a stream inside the grace takes none', async () => {
    const mm = createLeaseManager({ api: () => fa.api, store, graceMs: 1500 });
    const h = mm.track(REF, { busy: true });
    await adv(1400);
    expect(fa.calls).toEqual([]);
    h.set({ streaming: true });
    await adv(5000);
    expect(fa.calls).toEqual([]);
    h.set({ streaming: false });
    await adv(1400);
    expect(fa.calls).toEqual([]);
    await adv(200);
    expect(names('acquire')).toEqual(['acquire s1']);
    mm.reset();
  });
  it('pinned and about-to-be-cut chats do not wait', async () => {
    const mm = createLeaseManager({ api: () => fa.api, store, graceMs: 1500 });
    mm.track(REF, { pinned: true });
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1']);
    mm.track(REF2, { busy: true, streaming: true });
    await mm.ensure(REF2);
    expect(names('acquire')).toEqual(['acquire s1', 'acquire s2']);
    mm.reset();
  });
  it('a chat that turns urgent during the grace (pinned) is leased at once', async () => {
    const mm = createLeaseManager({ api: () => fa.api, store, graceMs: 1500 });
    const h = mm.track(REF, { busy: true });
    await adv(500);
    h.set({ pinned: true });
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1']);
    mm.reset();
  });
});

describe('leasedWatch: the stream budget and the lease together', () => {
  let budget: StreamBudget;
  beforeEach(() => { budget = createStreamBudget({ retryMs: 30, cutWaitMs: 500, reserve: 0 }); }); // reserve 0: all 8 locks open, so a full budget exists to cut from
  afterEach(() => budget.reset());
  const opener = (log: string[], name: string) => (g: Grant) => { log.push(`open ${name}`); void g; return { close: () => { log.push(`close ${name}`); } }; };

  it('a live stream holds no lease; a reconnect gap on a busy chat does; the stream coming back releases it', async () => {
    const log: string[] = [];
    let grant!: Grant;
    const mg = createLeaseManager({ api: () => fa.api, store });
    const w = leasedWatch({ ref: REF, level: 'stream', busy: true, open: (g) => { grant = g; return opener(log, 's1')(g); }, budget, leases: mg });
    await adv(100);
    expect(w.mode().mode).toBe('stream');
    await adv(5000);
    expect(fa.calls).toEqual([]);
    grant.live(false);
    await adv(1000);
    expect(fa.calls).toEqual([]);
    await adv(600);
    expect(names('acquire')).toEqual(['acquire s1']);
    grant.live(true);
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
    w.release();
    mg.reset();
  });
  it('a budget cut on a parked gate takes the lease before the stream closes', async () => {
    const log: string[] = [];
    const slow: agent.AttachApi = { ...fa.api, acquire: async (id, r, t) => { log.push('acquire'); await new Promise((x) => setTimeout(x, 100)); const out = await fa.api.acquire(id, r, t); log.push('acquired'); return out; } };
    const mm = createLeaseManager({ api: () => slow, store, graceMs: 0 });
    const victim = leasedWatch({ ref: REF, level: 'stream', rank: 'bot', kind: 'bot-session', busy: true, open: opener(log, 'victim'), budget, leases: mm });
    const others = Array.from({ length: 7 }, (_, i) => budget.watch({ computer: REF.computer, key: `o${i}`, kind: 'session', level: 'stream', rank: 'dock', open: opener(log, `o${i}`) }));
    await adv(200);
    log.length = 0;
    const feed = budget.watch({ computer: REF.computer, key: 'feed', kind: 'changes', level: 'stream', open: opener(log, 'feed') });
    await adv(500);
    expect(log.indexOf('acquired')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('acquired')).toBeLessThan(log.indexOf('close victim'));
    expect(log).toContain('open feed');
    expect(mm.state(REF).phase).toBe('held');
    victim.release(); feed.release(); others.forEach((x) => x.release());
    mm.reset();
  });
  it('a chat that is not busy is cut without any lease', async () => {
    const log: string[] = [];
    const idle = leasedWatch({ ref: REF, level: 'stream', rank: 'bot', kind: 'bot-session', busy: false, open: opener(log, 'idle'), budget, leases: m });
    const others = Array.from({ length: 7 }, (_, i) => budget.watch({ computer: REF.computer, key: `o${i}`, kind: 'session', level: 'stream', rank: 'dock', open: opener(log, `o${i}`) }));
    await adv(200);
    const feed = budget.watch({ computer: REF.computer, key: 'feed', kind: 'changes', level: 'stream', open: opener(log, 'feed') });
    await adv(300);
    expect(log).toContain('close idle');
    expect(fa.calls).toEqual([]);
    idle.release(); feed.release(); others.forEach((x) => x.release());
  });
  it('a chat that becomes busy while degraded is leased; releasing the watch closes the lease handle', async () => {
    const log: string[] = [];
    const w = leasedWatch({ ref: REF, level: 'state', busy: false, open: opener(log, 's1'), budget, leases: m });
    await adv(50);
    w.setBusy(true);
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1']);
    w.release();
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
  });
});

// ---- Regression cases ----
/** An agent whose calls answer when the test says so. */
function deferredAgent() {
  const calls: string[] = [];
  const pend: Array<{ kind: 'acquire' | 'renew' | 'release'; answer: (s: Settled) => void }> = [];
  const later = (kind: 'acquire' | 'renew' | 'release', line: string) => { calls.push(line); return new Promise<Settled>((answer) => { pend.push({ kind, answer }); }); };
  const api: agent.AttachApi = {
    acquire: (id) => later('acquire', `acquire ${id}`),
    renew: (id, lease) => later('renew', `renew ${id} ${lease}`),
    release: (id, lease, _r, keepalive) => later('release', `release ${id} ${lease}${keepalive ? ' keepalive' : ''}`),
  };
  const next = (kind: 'acquire' | 'renew' | 'release') => { const i = pend.findIndex((p) => p.kind === kind); return i < 0 ? null : pend.splice(i, 1)[0]!; };
  return { api, calls, next };
}

describe('releaseAll against requests still on their way', () => {
  it('an acquire in flight: its grant is released at once, never adopted, nothing renews', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    await adv(10);
    mm.releaseAll();
    d.next('acquire')!.answer(ok('LA', Date.now() + TTL));
    await adv(10);
    expect(d.calls).toEqual(['acquire s1', 'release s1 LA keepalive']);
    d.next('release')!.answer({ ok: true, body: {} });
    await adv(TTL * 2);
    expect(d.calls.length).toBe(2);
    expect(mm.state(REF)).toEqual({ phase: 'none' });
    expect(store.data[refKey(REF)]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    mm.reset();
  });
  it('a renew in flight: the released lease is not restored by its late answer', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    await adv(10);
    d.next('acquire')!.answer(ok('L1', Date.now() + TTL));
    await adv(10);
    await adv(TTL / 2 + 10);
    expect(d.calls).toEqual(['acquire s1', 'renew s1 L1']);
    mm.releaseAll();
    expect(d.calls).toEqual(['acquire s1', 'renew s1 L1', 'release s1 L1 keepalive']);
    d.next('renew')!.answer(ok('L1', Date.now() + TTL));
    d.next('release')!.answer({ ok: true, body: {} });
    await adv(TTL * 2);
    expect(mm.state(REF)).toEqual({ phase: 'none' });
    expect(d.calls.length).toBe(3);
    expect(store.data[refKey(REF)]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    mm.reset();
  });
  it('a stored lease\'s renew in flight (a reload): its answer is released too', async () => {
    const d = deferredAgent();
    store.data[refKey(REF)] = 'Lold';
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    await adv(10);
    mm.releaseAll();
    d.next('renew')!.answer(ok('Lold', Date.now() + TTL));
    await adv(10);
    expect(d.calls).toEqual(['renew s1 Lold', 'release s1 Lold keepalive']);
    d.next('release')!.answer({ ok: true, body: {} });
    await adv(10);
    expect(store.data[refKey(REF)]).toBeUndefined();
    mm.reset();
  });
  it('waits pending on sessions without a lease (grace, retry backoff) are cancelled', async () => {
    const mm = createLeaseManager({ api: () => fa.api, store, graceMs: 1500 });
    mm.track(REF, { busy: true });
    fa.script.acquire.push(bad(503), bad(503));
    mm.track(REF2, { pinned: true });
    await adv(10);
    expect(mm.state(REF2).phase).toBe('failing');
    mm.releaseAll();
    expect(vi.getTimerCount()).toBe(0);
    const n = fa.calls.length;
    await adv(60000);
    expect(fa.calls.length).toBe(n);
    mm.reset();
  });
  it('demand that is still there takes nothing while the page is leaving, and leases again on resume()', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    m.releaseAll();
    await adv(10);
    const late = m.track(REF2, { busy: true });
    await adv(5000);
    expect(names('acquire')).toEqual(['acquire s1']);
    m.resume();
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1', 'acquire s1', 'acquire s2']);
    late.close();
  });
  it('a confirmed release clears the journal id; an unanswered one keeps it', async () => {
    m.track(REF, { busy: true });
    m.track(REF2, { busy: true });
    await adv(10);
    fa.script.release.push({ ok: true, body: {} }, bad(0, 'NETWORK'));
    m.releaseAll();
    await adv(10);
    expect(store.data[refKey(REF)]).toBeUndefined();
    expect(store.data[refKey(REF2)]).toBe('L2');
  });
  it('an ensure() waiting at pagehide settles', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    let done = false;
    void mm.ensure(REF).then(() => { done = true; });
    await adv(10);
    expect(done).toBe(false);
    mm.releaseAll();
    await adv(10);
    expect(done).toBe(true);
    mm.reset();
  });
});

describe('the guard is in place before the work', () => {
  it('a subscriber that adds demand while acquiring starts no second acquire', async () => {
    let extra: ReturnType<LeaseManager['track']> | null = null;
    m.subscribe((_k, s) => { if (s.phase === 'acquiring' && !extra) extra = m.track(REF, { busy: true }); });
    const h = m.track(REF, { busy: true });
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1']);
    h.close();
    extra!.close();
    await adv(10);
    expect(names('release')).toEqual(['release s1 L1']);
    expect(store.data[refKey(REF)]).toBeUndefined();
    expect(fa.held.size).toBe(0);
  });
  it('a subscriber that adds demand while releasing waits for the release, then acquires once', async () => {
    const h = m.track(REF, { busy: true });
    await adv(10);
    let again: ReturnType<LeaseManager['track']> | null = null;
    m.subscribe((_k, s) => { if (s.phase === 'none' && !again) again = m.track(REF, { busy: true }); });
    h.close();
    await adv(10);
    expect(fa.calls).toEqual(['acquire s1', 'release s1 L1', 'acquire s1']);
    again!.close();
    await adv(10);
    expect(fa.held.size).toBe(0);
  });
});

describe('ensure() and an overdue lease', () => {
  it('after a long suspension ensure() takes a new lease before it settles, whatever timer is pending', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L1' });
    vi.setSystemTime(Date.now() + TTL + 5000); // the page slept: the clock moved, no timer ran
    const p = m.ensure(REF);
    await adv(10);
    await p;
    expect(names('acquire').length).toBe(2);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L2' });
    expect(m.state(REF).expiresAt!).toBeGreaterThan(Date.now());
  });
  it('after a long suspension ensure() waits for the replacement grant (a delayed answer), not for the timers', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    await adv(10);
    d.next('acquire')!.answer(ok('L1', Date.now() + TTL));
    await adv(10);
    expect(mm.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L1' });
    vi.setSystemTime(Date.now() + TTL + 5000); // the page slept: the lease ran out, no timer ran
    let done = false;
    void mm.ensure(REF).then(() => { done = true; });
    await adv(10);
    expect(d.calls).toEqual(['acquire s1', 'acquire s1']); // a new lease is asked for, not a renew of the dead one
    expect(done).toBe(false); // and ensure() is still waiting: the replacement has not been granted
    await adv(1000);
    expect(done).toBe(false);
    d.next('acquire')!.answer(ok('L2', Date.now() + TTL));
    await adv(10);
    expect(done).toBe(true);
    expect(mm.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L2' });
    mm.reset();
  });
});

describe('reset', () => {
  it('settles pending ensure() waiters and leaves old handles dead', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    const h = mm.track(REF, { busy: true });
    let done = false;
    void mm.ensure(REF).then(() => { done = true; });
    await adv(10);
    mm.reset();
    d.next('acquire')!.answer(ok('L1', Date.now() + TTL));
    await adv(10);
    expect(done).toBe(true);
    const n = d.calls.length;
    h.set({ busy: false });
    h.set({ busy: true });
    h.close();
    await adv(TTL);
    expect(d.calls.length).toBe(n);
    expect(mm.state(REF)).toEqual({ phase: 'none' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('a release that was never answered', () => {
  it('after resume() the kept id is renewed again (the agent may still know it)', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    fa.script.release.push(bad(0, 'NETWORK'));
    m.releaseAll();
    await adv(10);
    expect(store.data[refKey(REF)]).toBe('L1');
    fa.held.add('L1');
    m.resume();
    await adv(10);
    expect(names('renew')).toEqual(['renew s1 L1']);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L1' });
  });
});

describe('an old handle cannot touch a session made after reset', () => {
  it('closing it does not remove the new session of the same chat', async () => {
    const old = m.track(REF, { busy: true });
    await adv(10);
    m.reset();
    m.track(REF, { busy: true });
    await adv(10);
    expect(m.state(REF)).toMatchObject({ phase: 'held' });
    old.close();
    old.set({ busy: false });
    await adv(10);
    expect(m.state(REF)).toMatchObject({ phase: 'held' });
    expect(names('release')).toEqual([]);
  });
});

describe('a grant whose expiry is already past', () => {
  it('four grants in the past (a clock ahead of the agent) make one acquire and a renew at half the default hold, not a loop', async () => {
    for (let i = 0; i < 4; i++) fa.script.acquire.push(ok(`P${i}`, Date.now() - 5000));
    fa.held.add('P0');
    m.track(REF, { busy: true });
    await adv(10);
    expect(names('acquire').length).toBe(1);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'P0' });
    await adv(59000);
    expect(names('renew').length).toBe(0);
    await adv(2000);
    expect(names('renew')).toEqual(['renew s1 P0']);
    expect(names('acquire').length).toBe(1);
  });
});

describe('the computer is the ref\'s own', () => {
  async function wire() {
    const { boot, R1 } = await import('../../core/test/env');
    const { installTransport } = await import('../../core/transport');
    const { setTarget } = await import('../../core/ctx');
    boot({ realm: R1 });
    const urls: string[] = [];
    installTransport({
      hoody: () => Promise.reject(new Error('x')),
      fetch(url, init) {
        urls.push(`${init.method} ${new URL(url).host}`);
        const body = init.method === 'DELETE' ? {} : { lease_id: 'LX', expires_at: new Date(Date.now() + TTL).toISOString() };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
      },
    });
    return { R1, urls, setTarget, done: () => { installTransport(null); setTarget(TARGET); } };
  }
  it('another computer selected when the chat is first tracked, and again later: every request still goes to the chat\'s', async () => {
    const w = await wire();
    w.setTarget({ project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } });
    const mm = createLeaseManager({ graceMs: 0 });
    mm.track({ computer: 'p1-c1', realm: w.R1, sid: 's1', target: TARGET }, { busy: true });
    await adv(10);
    w.setTarget({ project: { id: 'p3' }, container: { id: 'c3', server_name: 'sv3' } });
    await adv(TTL / 2 + 10);
    mm.releaseAll();
    await adv(10);
    expect(w.urls.length).toBe(3);
    expect(w.urls.every((u) => u.includes('p1-c1'))).toBe(true);
    mm.reset();
    w.done();
  });
  it('no computer selected at all: the same', async () => {
    const w = await wire();
    w.setTarget(null);
    const mm = createLeaseManager({ graceMs: 0 });
    mm.track({ computer: 'p1-c1', realm: w.R1, sid: 's1', target: TARGET }, { busy: true });
    await adv(10);
    w.setTarget({ project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } });
    await adv(TTL / 2 + 10);
    expect(w.urls.every((u) => u.includes('p1-c1'))).toBe(true);
    expect(w.urls.length).toBe(2);
    mm.reset();
    w.done();
  });
  it('a ref with no target is gone: nothing is sent', async () => {
    const w = await wire();
    const mm = createLeaseManager({ graceMs: 0 });
    const ref = { computer: 'p1-c1', realm: w.R1, sid: 's1' } as unknown as SessionRef;
    mm.track(ref, { busy: true });
    await adv(5000);
    expect(w.urls).toEqual([]);
    expect(mm.state(ref).phase).toBe('gone');
    mm.reset();
    w.done();
  });
});

describe('the freeze tests named more than they proved', () => {
  it('the retry wait stays at 10 s: acquire attempts at 1, 3, 8, 18, 28, 38 s', async () => {
    fa.script.acquire.push(bad(503), bad(503), bad(503), bad(503), bad(503), bad(503));
    const T0 = Date.now();
    m.track(REF, { busy: true });
    const before: number[] = [], after: number[] = [];
    for (const due of [1000, 3000, 8000, 18000, 28000, 38000]) {
      await adv(due - 10 - (Date.now() - T0));
      before.push(names('acquire').length);
      await adv(20);
      after.push(names('acquire').length);
    }
    expect(before).toEqual([1, 2, 3, 4, 5, 6]);
    expect(after).toEqual([2, 3, 4, 5, 6, 7]);
  });
  it('a kept lease answered 404 is dropped and a new one acquired', async () => {
    store.data[refKey(REF)] = 'Lold';
    fa.script.renew.push(bad(404, 'attachment_not_found'));
    m.track(REF, { busy: true });
    await adv(10);
    expect(fa.calls).toEqual(['renew s1 Lold', 'acquire s1']);
    expect(store.data[refKey(REF)]).toBe('L1');
  });
  it('a kept lease and a renew that fails for another reason is renewed again after the backoff', async () => {
    store.data[refKey(REF)] = 'Lold';
    fa.held.add('Lold');
    fa.script.renew.push(bad(503));
    m.track(REF, { busy: true });
    await adv(10);
    expect(m.state(REF).phase).toBe('failing');
    await adv(1100);
    expect(names('renew')).toEqual(['renew s1 Lold', 'renew s1 Lold']);
    expect(names('acquire')).toEqual([]);
    expect(m.state(REF)).toMatchObject({ phase: 'held', leaseId: 'Lold' });
  });
});

describe('the journal id of a newer lease survives an older release', () => {
  it('a pagehide release answered after resume() does not clear the lease taken since', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    await adv(10);
    d.next('acquire')!.answer(ok('L1', Date.now() + TTL));
    await adv(10);
    mm.releaseAll();
    mm.resume();
    await adv(10);
    d.next('acquire')!.answer(ok('L2', Date.now() + TTL));
    await adv(10);
    expect(store.data[refKey(REF)]).toBe('L2');
    d.next('release')!.answer({ ok: true, body: {} });
    await adv(10);
    expect(store.data[refKey(REF)]).toBe('L2');
    mm.reset();
  });
});

describe('callbacks during releaseAll and expiry', () => {
  it('a subscriber that resumes on the release notification renews nothing that is being deleted', async () => {
    const d = deferredAgent();
    const mm = createLeaseManager({ api: () => d.api, store, graceMs: 0 });
    mm.track(REF, { busy: true });
    await adv(10);
    d.next('acquire')!.answer(ok('L1', Date.now() + TTL));
    await adv(10);
    let once = false;
    mm.subscribe((_k, st) => { if (st.phase === 'none' && !once) { once = true; mm.resume(); } });
    mm.releaseAll();
    await adv(10);
    expect(d.calls.filter((c) => c.startsWith('renew'))).toEqual([]);
    expect(d.calls).toEqual(['acquire s1', 'release s1 L1 keepalive', 'acquire s1']);
    d.next('release')!.answer({ ok: true, body: {} });
    d.next('acquire')!.answer(ok('L2', Date.now() + TTL));
    await adv(10);
    expect(mm.state(REF)).toMatchObject({ phase: 'held', leaseId: 'L2' });
    expect(store.data[refKey(REF)]).toBe('L2');
    mm.reset();
  });
  it('a subscriber that closes the handle and tracks the chat again keeps the new session through releaseAll', async () => {
    const h = m.track(REF, { busy: true });
    await adv(10);
    let again: ReturnType<LeaseManager['track']> | null = null;
    m.subscribe((_k, st) => { if (st.phase === 'none' && !again) { h.close(); again = m.track(REF, { busy: true }); } });
    m.releaseAll();
    await adv(10);
    m.resume();
    await adv(10);
    expect(names('acquire')).toEqual(['acquire s1', 'acquire s1']);
    expect(m.state(REF)).toMatchObject({ phase: 'held' });
    const p = m.ensure(REF);
    await adv(10);
    await p;
    again!.close();
    await adv(10);
    expect(fa.held.size).toBe(0);
  });
  it('a demand change made by a subscriber during the expiry notification starts one acquire, and every grant is released', async () => {
    const h = m.track(REF, { busy: true });
    await adv(10);
    vi.setSystemTime(Date.now() + TTL + 5000);
    let once = false;
    m.subscribe((_k, st) => { if (st.phase === 'none' && !once) { once = true; h.set({ pinned: true }); } });
    const p = m.ensure(REF);
    await adv(10);
    await p;
    expect(names('acquire').length).toBe(2);
    h.close();
    await adv(10);
    expect(names('release')).toEqual(['release s1 L2']);
    expect(fa.held.size).toBe(1); // L1 expired at the agent in this scenario (the clock jumped); only L2 was ever released here
    expect(store.data[refKey(REF)]).toBeUndefined();
  });
  it('releaseAll called from the expiry notification leaves nothing adopted and nothing running', async () => {
    m.track(REF, { busy: true });
    await adv(10);
    vi.setSystemTime(Date.now() + TTL + 5000);
    let once = false;
    m.subscribe((_k, st) => { if (st.phase === 'none' && !once) { once = true; m.releaseAll(); } });
    const p = m.ensure(REF);
    await adv(10);
    await p;
    await adv(TTL * 2);
    expect(names('acquire').length).toBe(1);
    expect(m.state(REF)).toEqual({ phase: 'none' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
