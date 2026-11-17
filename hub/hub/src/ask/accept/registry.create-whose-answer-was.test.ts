// Acceptance, through the real registry (its store, its lifecycle listeners): the dock shows an unknown create after a reload,
// and pinned engines are healed and checked like the dock's.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Data from '../data';

const opts = vi.hoisted(() => ({ createLost: false, hang: false }));
vi.mock('../data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('../fake');
  const { realClock } = await import('../engine');
  return {
    ...real,
    liveIO: (t: { container: { id: string } }) => {
      const agent = new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'], createLost: opts.createLost }, realClock);
      // A create that never answers: the request stays in flight.
      return real.withFixtureDest(opts.hang ? Object.assign(Object.create(agent), { create: () => new Promise(() => undefined) }) : agent, t.container.id);
    },
  };
});

// The mocked data module loads first: its factory imports the engine, which imports data (a cycle the other order deadlocks).
import '../data';
import { bump } from '../../core/ctx';
import { AskEngine } from '../engine';
import * as C from '../conv';
import { ACCOUNT, HANDLE, JOURNAL, REQ, slot, storedEntries, users, world, type World } from './env';
import * as S from './seam';

let w: World | null = null;
afterEach(async () => {
  const R = await import('../registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  opts.createLost = false;
  opts.hang = false;
  w?.dispose();
  w = null;
});

const COMPUTER = { project: slot.project, id: slot.computer, name: 'atlas' };
const dir = { resolve: (h: string) => (h === HANDLE ? COMPUTER : null), handleOf: (id: string) => (id === COMPUTER.id ? HANDLE : null) };
const target = { project: { id: slot.project }, container: { id: slot.computer, server_name: 'atlas' } } as any;

describe('A5, S4: a create whose answer was lost is still on the dock after a reload', () => {
  it('the dock of the next page life shows it as a message that may have left (Check / Dismiss), not an empty chat', async () => {
    w = world();
    const R = await import('../registry');
    R.setComputerDirectory(dir);
    opts.createLost = true;
    const eng = R.engineFor(slot, target);
    await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 3000 });
    eng.send('Build me a small dashboard');
    await vi.waitFor(() => expect(storedEntries(w!.fs)).toHaveLength(1), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 200));
    // the page life ends; a new one starts over the same bytes
    R.resetRegistryForTests();
    R.setComputerDirectory(dir);
    opts.createLost = false;
    const again = R.engineFor(slot, target);
    await vi.waitFor(() => expect(again.getSnapshot().phase).toBe('ready'), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 100));
    expect(users(again.getSnapshot(), C).length, 'the dock reloaded with no trace of the request').toBeGreaterThanOrEqual(1);
    expect(R.unsettledSends()).toHaveLength(1);
  });
});

describe('S9: a pinned conversation lives by the same lifecycle as the dock', () => {
  it('a storage event of another tab heals and wakes the pinned engine', async () => {
    w = world();
    const R = await import('../registry');
    R.setComputerDirectory(dir);
    const h = R.openRef(ACCOUNT, { computer: HANDLE, realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'sess-1' });
    expect(h).not.toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    const heal = vi.spyOn(AskEngine.prototype, 'heal');
    window.dispatchEvent(new StorageEvent('storage', { key: REQ }));
    expect(heal).toHaveBeenCalled();
    h!.release();
  });
  it('an account change checks the pinned engine at once', async () => {
    w = world();
    const R = await import('../registry');
    R.setComputerDirectory(dir);
    const h = R.openRef(ACCOUNT, { computer: HANDLE, realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'sess-1' });
    expect(h).not.toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    const alive = vi.spyOn(AskEngine.prototype, 'checkAlive');
    bump('account' as any);
    expect(alive).toHaveBeenCalled();
    h!.release();
  });
});

describe('another tab\'s dismissal of a request in flight stays dismissed, however many storage events arrive', () => {
  it('the registry\'s listener reads and heals; it writes nothing, and the name stays absent after the other tab is gone', async () => {
    w = world();
    const R = await import('../registry');
    R.setComputerDirectory(dir);
    opts.hang = true;
    const eng = R.engineFor(slot, target);
    await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 3000 });
    eng.send('Build me a small dashboard');
    await vi.waitFor(() => expect(storedEntries(w!.fs)).toHaveLength(1), { timeout: 3000 });
    const e = storedEntries(w.fs)[0] as { h: string; k: string };
    expect(S.dismiss(w.jB, { h: e.h, k: e.k })).toBe(true);
    expect(storedEntries(w.fs)).toHaveLength(0);
    const writes = vi.spyOn(w.fs, 'setItem');
    for (let i = 0; i < 4; i++) { window.dispatchEvent(new StorageEvent('storage', { key: REQ })); await new Promise((r) => setTimeout(r, 20)); }
    expect(writes, 'a tab wrote the dismissed request back').not.toHaveBeenCalled();
    expect(storedEntries(w.fs)).toHaveLength(0);
  });
});

describe('a record-write failure sends nothing, and a reload shows nothing pending or orphaned', () => {
  it('the chat-record store refuses writes: no entry, no request; the next page life is empty', async () => {
    w = world();
    const R = await import('../registry');
    R.setComputerDirectory(dir);
    const eng = R.engineFor(slot, target);
    await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 3000 });
    w.fs.blockWrites(JOURNAL);
    eng.send('Build me a small dashboard');
    await new Promise((r) => setTimeout(r, 200));
    expect(storedEntries(w.fs), 'an entry was admitted').toHaveLength(0);
    expect(R.unsettledSends()).toHaveLength(0);
    R.resetRegistryForTests();
    w.fs.clearFaults();
    R.setComputerDirectory(dir);
    const again = R.engineFor(slot, target);
    await vi.waitFor(() => expect(again.getSnapshot().phase).toBe('ready'), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 100));
    expect(users(again.getSnapshot(), C), 'a row of the unsent request came back').toHaveLength(0);
    expect(R.unsettledSends()).toHaveLength(0);
  });
});
