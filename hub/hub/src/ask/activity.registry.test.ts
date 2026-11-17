// Vitest (activity registry): the count is read only while someone shows it, from the shared
// store (another tab's conversations count too), and never shown stale: once nobody looks (last subscriber gone,
// the page hidden) the old count is forgotten, and the next look shows nothing until a new round answers.
import type * as Core from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskRecord, AskStore } from './logic';

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot = { account: '64f0ada00000000000000001', project: 'p1', computer: 'c1', realm: REALM, name: 'atlas' };
const target = {} as never;

// The agent and the shared store, both in memory and controllable.
const answers = new Map<string, { state: string } | { status: number }>();
const pending: Array<() => void> = [];
let holdReads = false;
let stored: AskRecord[] = [];
const rec = (k1: string, s: string): AskRecord =>
  ({ p: 'p1', c: 'c1', r: REALM, s, t: null, k1, k2: k1 + '-2', rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: '' }) as AskRecord;

// The live agent (the test setup installs the fixture transport, which would swap in the scripted agent).
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), fixtureModeActive: () => false }));
vi.mock('./data', () => ({
  readStore: (account: string): AskStore => ({ v: 1, a: { [account]: stored.map((x) => ({ ...x })) } }),
  writeStore: () => {},
  liveIO: () => ({
    alive: () => true,
    state: (sid: string) => new Promise((res, rej) => {
      const go = () => { const a = answers.get(sid); if (a && 'status' in a) rej(a); else res(a); };
      if (holdReads) pending.push(go); else go();
    }),
  }),
}));

const { activitySource, pokeActivity, resetRegistryForTests, ACTIVITY_EVERY_MS } = await import('./registry');
const { bump } = await import('../core/ctx');

let hidden = false;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function setHidden(h: boolean) { hidden = h; document.dispatchEvent(new Event('visibilitychange')); }

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  hidden = false; holdReads = false; pending.length = 0; answers.clear();
  stored = [rec('a', 's1')];
  answers.set('s1', { state: 'running' });
});
afterEach(() => { resetRegistryForTests(); vi.useRealTimers(); });

describe('activity registry', () => {
  it('reads while subscribed, again every interval, and stops when nobody looks', async () => {
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.get()?.running).toBe(1);
    answers.set('s1', { state: 'idle' });
    await vi.advanceTimersByTimeAsync(ACTIVITY_EVERY_MS);
    expect(src.get()?.running).toBe(0);
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the last subscriber leaving forgets the count: the next look shows nothing until a new round answers', async () => {
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.get()?.running).toBe(1);
    off();
    expect(src.get()).toBeNull();
    answers.set('s1', { state: 'idle' });
    holdReads = true;
    const off2 = src.subscribe(() => {});
    await flush();
    expect(src.get()).toBeNull();   // the old "1 running" never comes back
    for (const go of pending.splice(0)) go();
    await flush();
    expect(src.get()?.running).toBe(0);
    off2();
  });

  it('the page hidden forgets the count; shown again, nothing until a new round answers', async () => {
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.get()?.running).toBe(1);
    setHidden(true);
    expect(src.get()).toBeNull();
    answers.set('s1', { state: 'idle' });
    holdReads = true;
    setHidden(false);
    await flush();
    expect(src.get()).toBeNull();
    for (const go of pending.splice(0)) go();
    await flush();
    expect(src.get()?.running).toBe(0);
    off();
  });

  it('a round in flight when nobody looks any more never fills the count later', async () => {
    const src = activitySource(slot, target);
    holdReads = true;
    const off = src.subscribe(() => {});
    await flush();
    off();
    for (const go of pending.splice(0)) go();
    await flush();
    expect(src.get()).toBeNull();
  });

  it('a conversation another tab wrote to the shared store counts on the next round', async () => {
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.get()?.running).toBe(1);
    stored = [rec('b', 's2'), ...stored];   // another tab's new conversation, now waiting on the person
    answers.set('s2', { state: 'parked' });
    await vi.advanceTimersByTimeAsync(ACTIVITY_EVERY_MS);
    expect(src.get()).toMatchObject({ running: 2, waiting: 1 });
    off();
  });

  it('one failed read: unknown (null), never the previous count', async () => {
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.get()?.running).toBe(1);
    answers.set('s1', { status: 503 });
    await vi.advanceTimersByTimeAsync(ACTIVITY_EVERY_MS);
    expect(src.get()).toBeNull();
    off();
  });
});

// Recent's phases come from the store read each round starts with, whatever the agent answers,
// and stay while nobody looks; never back to the phase read when Recent opened (C9: an unknown send stays unknown).
describe('Recent phases from the round\'s store read (C9)', () => {
  const unsettled = (k1: string, s: string): AskRecord => ({ ...rec(k1, s), k3: ['t2'] }) as AskRecord;
  it('an unknown send shown after a good round stays unknown when an unrelated read fails', async () => {
    stored = [unsettled('a', 's1'), rec('b', 's2')];
    answers.set('s2', { state: 'idle' });
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.phases()).toEqual({ a: 'unknown', b: 'completed' });
    answers.set('s2', { status: 503 });
    await vi.advanceTimersByTimeAsync(ACTIVITY_EVERY_MS);
    expect(src.get()).toBeNull();
    expect(src.phases()).toEqual({ a: 'unknown', b: 'completed' });
    off();
  });
  it('a newer failed or stopped outcome stays when the next round fails', async () => {
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    stored = [{ ...rec('a', 's1'), ph: 'failed' } as AskRecord, { ...rec('c', 's3'), ph: 'cancelled' } as AskRecord];
    answers.set('s3', { status: 503 });
    await vi.advanceTimersByTimeAsync(ACTIVITY_EVERY_MS);
    expect(src.get()).toBeNull();
    expect(src.phases()).toEqual({ a: 'failed', c: 'cancelled' });
    off();
  });
  it('a first round that fails after another tab\'s change still carries the stored phase', async () => {
    stored = [unsettled('a', 's1')];
    answers.set('s1', { status: 503 });
    const src = activitySource(slot, target);
    const seen: Array<Readonly<Record<string, string>> | null> = [];
    const off = src.subscribe(() => seen.push(src.phases()));
    await flush();
    expect(src.get()).toBeNull();
    expect(src.phases()).toEqual({ a: 'unknown' });
    expect(seen).toContainEqual({ a: 'unknown' });
    off();
  });
  it('the phases are told before the agent answers (a slow agent never holds Recent on the opened phase)', async () => {
    stored = [unsettled('a', 's1')];
    holdReads = true;
    const src = activitySource(slot, target);
    let told = 0;
    const off = src.subscribe(() => { told++; });
    await flush();
    expect(told).toBe(1);
    expect(src.phases()).toEqual({ a: 'unknown' });
    expect(src.get()).toBeNull();
    for (const go of pending.splice(0)) go();
    await flush();
    off();
  });
  it('a look while a round is in flight reads the phases from the store at once', async () => {
    holdReads = true;
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.phases()).toEqual({ a: 'completed' });
    stored = [unsettled('a', 's1')];      // another tab's send, while this slot's agent read is still out
    pokeActivity(slot);                   // Recent opened
    expect(src.phases()).toEqual({ a: 'unknown' });
    for (const go of pending.splice(0)) go();
    await flush();
    off();
  });
  it('a context switch drops the old context\'s phases; a look reads them again', async () => {
    stored = [unsettled('a', 's1')];
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    off();
    expect(src.phases()).toEqual({ a: 'unknown' });
    bump('realm' as never);
    expect(src.phases()).toBeNull();
    const again = src.subscribe(() => {});
    expect(src.phases()).toEqual({ a: 'unknown' });
    again();
  });
  it('the page hidden or the last subscriber gone forgets the count, never the phases', async () => {
    stored = [unsettled('a', 's1')];
    const src = activitySource(slot, target);
    const off = src.subscribe(() => {});
    await flush();
    setHidden(true);
    expect(src.get()).toBeNull();
    expect(src.phases()).toEqual({ a: 'unknown' });
    setHidden(false);
    off();
    expect(src.get()).toBeNull();
    expect(src.phases()).toEqual({ a: 'unknown' });
  });
});

// a round for a slot made before the server was known may wait out a
// /state timeout on no host. When a caller names the server, that round is given up: the next round starts at once on the server,
// and the old round's late answer is never shown.
describe('a slot whose server becomes known while its first round waits', () => {
  it('starts the server\'s round at once, and drops the given-up round\'s late answer', async () => {
    holdReads = true;
    const off0 = activitySource(slot, target).subscribe(() => {});
    await flush();
    expect(pending, 'the first round waits').toHaveLength(1);
    const src = activitySource({ ...slot, server: 'node-amber' }, target);
    const off1 = src.subscribe(() => {});
    await flush();
    expect(pending, 'a round on the server started now, not after the waiting one').toHaveLength(2);
    const [old, now] = pending.splice(0);
    now!();
    await flush();
    expect(src.get()?.running).toBe(1);
    answers.set('s1', { state: 'idle' });
    old!();
    await flush();
    expect(src.get()?.running, 'the given-up round answered late: not shown').toBe(1);
    off1();
    off0();
  });
});
