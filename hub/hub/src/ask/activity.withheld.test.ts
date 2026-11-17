// The activity read of a slot whose row stops naming its server gives up
// the round in flight on the old server, so its late answer never shows (or "restores") a count under the withheld slot; the
// next round goes to whatever the slot names now. A row naming the server again reads again on it.
import type * as Core from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskRecord, AskStore } from './logic';

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const X = 'node-amber';
const base = { account: '64f0ada00000000000000001', project: 'p1', computer: 'c1', realm: REALM, name: 'atlas' };
const onX = { ...base, server: X };
const tX = { project: { id: 'p1' }, container: { id: 'c1', server_name: X } } as never;
const tNone = { project: { id: 'p1' }, container: { id: 'c1' } } as never;

const pending: Array<() => void> = [];
const made: string[] = [];
let holdReads = false;
// Core's refusal while the row withholds the server (core/routing.ts, kit.ts admit): the old connection's reads go nowhere.
let refused = false;
const rec = (k1: string, s: string): AskRecord =>
  ({ p: 'p1', c: 'c1', r: REALM, s, t: null, k1, k2: k1 + '-2', rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: '' }) as AskRecord;

vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), fixtureModeActive: () => false }));
vi.mock('./data', () => ({
  readStore: (account: string): AskStore => ({ v: 1, a: { [account]: [rec('a', 's1')] } }),
  writeStore: () => {},
  liveIO: (t: { container: { server_name?: string } }) => {
    made.push(t.container.server_name ?? '');
    return {
      alive: () => true,
      state: () => refused ? Promise.reject({ kind: 'not_sent', notSent: true, code: 'NO_AGENT_URL' })
        : new Promise((res) => { const go = () => res({ state: 'running' }); if (holdReads) pending.push(go); else go(); }),
    };
  },
}));

const { activitySource, resetRegistryForTests } = await import('./registry');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers(); holdReads = false; refused = false; pending.length = 0; made.length = 0; });
afterEach(() => { resetRegistryForTests(); vi.useRealTimers(); });

describe('activity across a row that withholds the server', () => {
  it('a round in flight on X, then the slot loses its server: the late answer is dropped, no count shown', async () => {
    const src = activitySource(onX, tX);
    holdReads = true;
    const off = src.subscribe(() => {});
    await flush();
    expect(pending.length, 'one round out on X').toBe(1);
    const late = pending.shift()!;
    // The row now withholds the server: the page asks again with a serverless slot.
    const src2 = activitySource(base, tNone);
    const off2 = src2.subscribe(() => {});
    late();
    await flush();
    expect(src.get(), 'the X answer never shows under the withheld slot').toBeNull();
    expect(src2.get()).toBeNull();
    off(); off2();
  });

  it('named again: the slot reads again on X (the same connection, nothing replayed of the dropped round)', async () => {
    const src = activitySource(onX, tX);
    const off = src.subscribe(() => {});
    await flush();
    expect(src.get()?.running).toBe(1);
    refused = true;
    activitySource(base, tNone);
    await flush();
    expect(src.get(), 'the X count is not kept under the withheld slot').toBeNull();
    refused = false;
    activitySource(onX, tX);
    await flush();
    expect(src.get()?.running).toBe(1);
    expect(made, 'one connection, made on X').toEqual([X]);
    off();
  });
});
