// The active source passes the engine's usage-limit reading through (rateLimit(), read from the snapshot each time, so
// the source's subscribe is what tells a surface it moved), and a released source reads none.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { engineActive, type ActiveDeps } from './active';
import { parseRateLimit } from '@kit/agent/rateLimit';
import { TARGET } from '../core/test/env';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const SLOT = { account: 'acc', project: 'P1', computer: 'C1', realm: REF.realm, name: 'atlas' };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
  decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
  needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
  ...over,
});
function fake() {
  let s = snap();
  const subs = new Set<() => void>();
  const put = (p: Partial<Snapshot>) => { s = { ...s, ...p }; for (const f of [...subs]) f(); };
  const eng = {
    slot: SLOT,
    getSnapshot: () => s,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: TARGET }, strict: false }),
  } as unknown as AskEngine;
  return { eng, put };
}
const deps = (): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
});
const reading = parseRateLimit({
  status: 'allowed', is_using_overage: false, overage_status: '', observed_at: 1, rev: 2, epoch: 1,
  windows: [{ name: 'five_hour', utilization: 0.92, has_utilization: true, resets_at: 4_102_444_800, limiting: true }],
})!;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('active source usage-limit passthrough', () => {
  it('reads none until the engine holds a reading, then that reading, and its subscribe tells the change', () => {
    const f = fake();
    const src = engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps());
    expect(src.rateLimit!()).toBeNull();
    const told = vi.fn();
    const off = src.subscribe(told);
    f.put({ rateLimit: reading });
    expect(told).toHaveBeenCalled();
    expect(src.rateLimit!()).toBe(reading);
    off();
    src.release();
  });

  it('a released source reads none, whatever the engine holds', () => {
    const f = fake();
    f.put({ rateLimit: reading });
    const src = engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps());
    expect(src.rateLimit!()).toBe(reading);
    src.release();
    expect(src.rateLimit!()).toBeNull();
  });
});
