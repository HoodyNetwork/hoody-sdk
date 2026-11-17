// The pinned attachment hold is taken only for a chat the engine has READ and found
// ready. A chat that is still being looked at, blocked (gone, forbidden, offline) or ended makes ZERO attachment requests: the
// pinned handle used to be taken as soon as the chat's address was known, so a gone chat POSTed /attachments (and the host showed
// "a change may have gone through" for each). A hold already taken is kept through a transient block (a hold too few lets the agent
// close the chat under a waiting approval) and is closed only by release().
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { engineActive, type ActiveDeps } from './active';
import { createLeaseManager } from '@kit/agent/lease';
import { TARGET } from '../core/test/env';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
  decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
  needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
  ...over,
});
function fake(init: Partial<Snapshot> = {}, sid = 'S') {
  let s = snap(init);
  const subs = new Set<() => void>();
  const put = (p: Partial<Snapshot>) => { s = { ...s, ...p }; for (const f of [...subs]) f(); };
  const eng = {
    getSnapshot: () => s,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid, target: TARGET }, strict: false }),
  } as unknown as AskEngine;
  const set = (id: string) => { sid = id; for (const f of [...subs]) f(); };
  return { eng, put, set };
}
/** The real lease manager over a counting api: `acquire` is the attachment POST. */
function realLeases() {
  const calls: string[] = [];
  const api: any = {
    acquire: async (id: string) => { calls.push('acquire ' + id); return { ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }; },
    renew: async () => ({ ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }),
    release: async (id: string, lease: string) => { calls.push('release ' + lease); return { ok: true, body: { status: 'ok', released: true } }; },
  };
  const mgr = createLeaseManager({ api: () => api, store: { read: () => undefined, write: () => undefined }, graceMs: 0 });
  let taken = 0;
  const track = mgr.track.bind(mgr);
  const leases: any = { ...mgr, track: (r: any, n: any) => { taken += 1; return track(r, n); }, state: mgr.state.bind(mgr), subscribe: mgr.subscribe.bind(mgr) };
  return { calls, leases, taken: () => taken };
}
const deps = (over: Partial<ActiveDeps> = {}): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000, ...over,
});
const open = (f: ReturnType<typeof fake>, over: Partial<ActiveDeps> = {}) => engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps(over));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the pinned attachment hold is taken only for a ready chat', () => {
  it.each(['blocked', 'ended', 'checking'] as const)('a %s chat makes zero attachment requests, however often the surface subscribes or the engine changes', async (phase) => {
    const f = fake({ phase, blocked: phase === 'blocked' ? { key: 'ask.gone', act: 'retry', tone: 'warn', agent: true } : null });
    const L = realLeases();
    const src = open(f, { leases: L.leases });
    const off = src.subscribe(() => undefined);
    src.subscribe(() => undefined);
    f.put({ version: 2 });
    f.put({ version: 3 });
    await vi.advanceTimersByTimeAsync(50);
    expect(L.taken(), 'no handle taken').toBe(0);
    expect(L.calls, 'no attachment POST').toEqual([]);
    off();
    src.release();
    expect(L.calls).toEqual([]);
  });

  it('a chat that was being looked at and turns out ready is held exactly once', async () => {
    const f = fake({ phase: 'checking' });
    const L = realLeases();
    const src = open(f, { leases: L.leases });
    src.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(20);
    expect(L.taken()).toBe(0);
    f.put({ phase: 'ready' });
    f.put({ version: 2 });
    await vi.advanceTimersByTimeAsync(50);
    expect(L.taken()).toBe(1);
    expect(L.calls).toEqual(['acquire S']);
    src.release();
  });

  it('a chat that was being looked at and turns out gone is never held', async () => {
    const f = fake({ phase: 'checking' });
    const L = realLeases();
    const src = open(f, { leases: L.leases });
    src.subscribe(() => undefined);
    f.put({ phase: 'blocked', blocked: { key: 'ask.gone', act: 'retry', tone: 'warn', agent: true } });
    await vi.advanceTimersByTimeAsync(50);
    expect(L.calls).toEqual([]);
    src.release();
  });

  it('a hold taken while ready is kept through a transient block, not taken twice when the chat is ready again, and closed by release', async () => {
    const f = fake();
    const L = realLeases();
    const src = open(f, { leases: L.leases });
    src.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls).toEqual(['acquire S']);
    f.put({ phase: 'blocked', blocked: { key: 'ask.offline', act: 'retry', tone: 'warn', agent: true } });
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls, 'kept: nothing released').toEqual(['acquire S']);
    f.put({ phase: 'ready', blocked: null });
    await vi.advanceTimersByTimeAsync(20);
    expect(L.taken()).toBe(1);
    src.release();
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls).toEqual(['acquire S', 'release L1']);
  });

  it('a holder\'s watch level (2c: state, off, a worse rank) reaches the engine and never lets the attachment hold go; release does', async () => {
    const f = fake();
    const watched: unknown[][] = [];
    (f.eng as any).setWatch = (...a: unknown[]) => { watched.push(a); };
    const L = realLeases();
    // The registry's handle forwards a holder's watch to the engine (RefHandle.watch); a stand-in that does the same.
    const src = engineActive({ current: () => f.eng, release: () => undefined, watch: (w: any, r: any) => (f.eng as any).setWatch(w, r) } as any, REF, host, deps({ leases: L.leases }));
    src.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls).toEqual(['acquire S']);
    src.watch('state');
    src.watch('off');
    src.watch('stream', 'visible');
    await vi.advanceTimersByTimeAsync(20);
    expect(watched).toEqual([['state', undefined], ['off', undefined], ['stream', 'visible']]);
    expect(L.calls, 'the hold stays pinned whatever the watch level').toEqual(['acquire S']);
    src.release();
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls).toEqual(['acquire S', 'release L1']);
  });

  it('the chat\'s address changes while it is blocked: the new address is held only once it is ready', async () => {
    const f = fake();
    const L = realLeases();
    const src = open(f, { leases: L.leases });
    src.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(20);
    f.put({ phase: 'blocked', blocked: { key: 'ask.gone', act: 'retry', tone: 'warn', agent: true } });
    f.set('S2');
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls, 'no hold for the new, unread address').toEqual(['acquire S']);
    f.put({ phase: 'ready', blocked: null });
    await vi.advanceTimersByTimeAsync(20);
    expect(L.calls).toContain('acquire S2');
    src.release();
  });
});
