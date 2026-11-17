// source.saved.test.ts: the read source shows this browser's saved copy only while the computer has not
// answered and nothing else is shown, drops it for good once it answers (never merged), and keeps a copy only of a settled
// chat: no turn running, no gate open, nothing unsure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConvBlock } from '@kit/agent/source';
import * as C from './conv';
import type { AskEngine, CardView, Snapshot } from './engine';
import { engineSource, type Host } from './source';

const cache = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), account: vi.fn(() => 'uid-a') }));
vi.mock('./transcriptCache', () => ({ readCached: cache.read, writeCached: cache.write, cacheAccount: cache.account }));

const HOST: Host = { computer: 'atlas', realm: 'Personal' };
const REF = { computer: 'atlas.a1b2', realm: 'global', sid: 's1' };
const SAVED: ConvBlock[] = [{ k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1 }, { k: 'reply', key: 'r1', text: 'All green.', streaming: false, final: true, cost: null, at: 2 }];

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    phase: 'ready', blocked: null, band: null, starting: false, conv: C.emptyConv('s1'), status: null, gates: [], gate: null,
    decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
    needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
    ...over,
  };
}
function engineOf(s: Snapshot) {
  let cur = s;
  const subs = new Set<() => void>();
  return {
    getSnapshot: () => cur,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    put(n: Snapshot) { cur = n; for (const f of [...subs]) f(); },
  } as unknown as AskEngine & { put(n: Snapshot): void };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { cache.read.mockReset(); cache.write.mockReset(); cache.write.mockResolvedValue(true); cache.account.mockReset(); cache.account.mockReturnValue('uid-a'); });
afterEach(() => { vi.useRealTimers(); });

describe('the saved copy while the computer is read', () => {
  it('shows the copy with its time while checking and nothing else is shown; nothing in it can be acted on', async () => {
    cache.read.mockResolvedValue({ blocks: SAVED, at: 1234 });
    const eng = engineOf(snap({ phase: 'checking' }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    const fn = vi.fn();
    src.subscribe(fn);
    expect(src.snapshot().blocks).toEqual([]);
    await settle();
    expect(fn).toHaveBeenCalled();
    const s = src.snapshot();
    expect(s.saved).toEqual({ at: 1234 });
    expect(s.blocks.map((b) => b.key)).toEqual(['u1', 'r1']);
    expect(s.facts.state).toBe('loading');
    expect(src.can('send').ok).toBe(false);
  });

  it('the computer\'s answer replaces it whole and for good, even an empty one; a late copy is never shown', async () => {
    cache.read.mockResolvedValue({ blocks: SAVED, at: 1234 });
    const eng = engineOf(snap({ phase: 'checking' }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.subscribe(() => {});
    await settle();
    expect(src.snapshot().saved).toBeDefined();
    eng.put(snap({ phase: 'ready' }));
    expect(src.snapshot().saved).toBeUndefined();
    expect(src.snapshot().blocks).toEqual([]);
    eng.put(snap({ phase: 'checking' }));
    expect(src.snapshot().saved, 'a reconnect does not bring it back').toBeUndefined();

    let late: (v: unknown) => void = () => {};
    cache.read.mockReturnValue(new Promise((r) => { late = r; }));
    const eng2 = engineOf(snap({ phase: 'checking' }));
    const src2 = engineSource({ current: () => eng2, release: () => {} }, REF, () => HOST);
    src2.snapshot();
    eng2.put(snap({ phase: 'ready' }));
    src2.snapshot();
    late({ blocks: SAVED, at: 1 });
    await settle();
    expect(src2.snapshot().saved).toBeUndefined();
  });

  it('a reason line (cannot reach) is shown instead of the copy, never beside it', async () => {
    cache.read.mockResolvedValue({ blocks: SAVED, at: 1234 });
    const eng = engineOf(snap({ phase: 'checking', band: { k: 'unreachable' } as Snapshot['band'] }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.subscribe(() => {});
    await settle();
    expect(src.snapshot().saved).toBeUndefined();
    expect(src.snapshot().blocks.map((b) => b.key)).toEqual(['reach']);
  });
});

describe('what is kept', () => {
  it('a settled chat is kept once, after the wait; an unchanged view is not kept again', async () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    const eng = engineOf(snap({ dormant: true }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.snapshot();
    expect(cache.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.write).toHaveBeenCalledTimes(1);
    expect(cache.write.mock.calls[0]![0]).toEqual(REF);
    eng.put(snap({ dormant: true }));
    src.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.write).toHaveBeenCalledTimes(1);
  });
  it('a view written while another is still being written is written again when the chat returns to it', async () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    let finishB!: (v: boolean) => void;
    const A = snap({ dormant: true });
    const eng = engineOf(A);
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.write).toHaveBeenCalledTimes(1);
    cache.write.mockImplementationOnce(() => new Promise<boolean>((r) => { finishB = r; }));
    const u = { id: 'u1', text: 'Fix the tests', at: 1, key: '', via: 'turn' as const, state: 'sent' as const, turnId: null, commandId: null, reason: '' };
    const c = C.addTurn(C.addUser(C.emptyConv('s1'), u), { user: 'u1', now: 1 });
    eng.put(snap({ dormant: true, conv: { ...c, loose: [], turns: c.turns.map((t) => ({ ...t, history: true, endedAt: 2 })) } }));
    src.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.write).toHaveBeenCalledTimes(2);
    eng.put(snap({ dormant: true }));
    src.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    finishB(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(cache.write, 'A again, after B').toHaveBeenCalledTimes(3);
  });
  it('a refused write (the account still opening) is tried again by the next settled view, even an unchanged one', async () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    cache.write.mockResolvedValueOnce(false);
    const eng = engineOf(snap({ dormant: true }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.write).toHaveBeenCalledTimes(1);
    eng.put(snap({ dormant: true }));
    src.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.write).toHaveBeenCalledTimes(2);
  });

  const notKept: Array<[string, Partial<Snapshot>]> = [
    ['a turn running', { status: 'working' }],
    ['an open gate card', { gates: [{ key: 'c1', gate: { kind: 'confirm', id: 'g1', generation: 2, cause: '', risk: 'low', leaseRequired: false, dnum: null, tool: 'bash' }, helper: false, addressing: false, decision: null, held: null, decidable: true } as CardView] }],
    ['still checking', { phase: 'checking' }],
    ['a conversation whose last outcome is unsure', { conv: { ...C.emptyConv('s1'), unsure: true } }],
    ['a turn whose outcome is unsure', (() => { const c = C.addTurn(C.emptyConv('s1'), { now: 1 }); return { conv: { ...c, turns: c.turns.map((t) => ({ ...t, history: true, unsure: true as const })) } }; })()],
    ['a decision of unknown outcome', { decision: { pending: false, unknown: true } }],
    ['a decision on its way', { decision: { pending: true, unknown: false } }],
    ['a send of unknown outcome', { conv: { ...C.emptyConv('s1'), users: { u1: { id: 'u1', text: 'hi', at: 1, key: 'k1', via: 'turn', state: 'unknown', turnId: null, commandId: null, reason: '' } } } }],
  ];
  for (const [what, over] of notKept) {
    it(`nothing is kept with ${what}`, () => {
      vi.useFakeTimers();
      cache.read.mockResolvedValue(null);
      const src = engineSource({ current: () => engineOf(snap({ dormant: true, ...over })), release: () => {} }, REF, () => HOST);
      src.snapshot();
      vi.advanceTimersByTime(1000);
      expect(cache.write).not.toHaveBeenCalled();
    });
  }

  it('the copy is written for the account shown when the view settled, never the one shown when the wait ends', () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    const eng = engineOf(snap({ dormant: true }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.snapshot();
    cache.account.mockReturnValue('uid-b');
    vi.advanceTimersByTime(1000);
    expect(cache.write).toHaveBeenCalledTimes(1);
    expect(cache.write.mock.calls[0]![3], 'bound to the settling account (writeCached keeps nothing for another)').toBe('uid-a');
  });
  it('signed out when the view settles: nothing is scheduled', () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    cache.account.mockReturnValue('');
    const eng = engineOf(snap({ dormant: true }));
    engineSource({ current: () => eng, release: () => {} }, REF, () => HOST).snapshot();
    vi.advanceTimersByTime(1000);
    expect(cache.write).not.toHaveBeenCalled();
  });
  it('an engine that moved on during the wait (another snapshot, not read yet) keeps nothing', () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    const eng = engineOf(snap({ dormant: true }));
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.snapshot();
    eng.put(snap({ dormant: true, status: 'working' }));
    vi.advanceTimersByTime(1000);
    expect(cache.write).not.toHaveBeenCalled();
  });
  it('a released source keeps nothing it had waiting', () => {
    vi.useFakeTimers();
    cache.read.mockResolvedValue(null);
    const src = engineSource({ current: () => engineOf(snap({ dormant: true })), release: () => {} }, REF, () => HOST);
    src.snapshot();
    src.release();
    vi.advanceTimersByTime(1000);
    expect(cache.write).not.toHaveBeenCalled();
  });
});
