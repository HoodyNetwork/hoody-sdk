// Vitest: the computer's definite refusal of a FIRST Make it live is shown
// as a refusal with its own words and Change address, never as "It may be live"; the draft is open again, so the next Make it
// live goes to the address the draft holds then. A refused resend (Try again of a reservation) still stays held.
import { act, renderHook } from '@app/testing';
import type { DraftRecord } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Write = { path: string; opId: string };
const io = vi.hoisted(() => ({ writes: [] as Write[], refuse: new Set<string>(), found: null as boolean | null, settle: null as { state: string } | null, settled: [] as string[], released: 0 }));
vi.mock('../data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useBoundSends: () => ({
      shown: true,
      // As hoody-exec answers a create whose address another route already answers: 409 ROUTE_EFFECT_CHANGED, nothing written.
      write: async (v: Write) => { io.writes.push(v); return io.refuse.has(v.path) ? { outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' } : { outcome: 'done', data: { path: v.path } }; },
      exists: async () => io.found,
      clock: async () => 1000,
      // Core's hold of the reservation's own send, and hoody-exec's journal (ops/settle), for a Check.
      heldOf: async (_k: string, _p: string, opId: string) => ({ hold: `h-${opId}` }),
      heldAt: async () => [],
      release: async () => { io.released++; return true; },
      settle: async (opId: string) => { io.settled.push(opId); return io.settle; },
    }),
    useAliasCreate: () => ({ mutateAsync: async () => ({ outcome: 'done' }) }),
  };
});

import { clearScriptStore } from './flowfix';
import { beginDeploy, markDeploy, openRecord, readDraftRecord } from './records';
import { useLive, type LiveIn } from './StepLive';
import { snapshotOf, verdictFor } from './snapshot';

const ID = 'ffffffffff';
const B = { target: { project: { id: 'p1' }, container: { id: 'c0a7150000000000000000a1' } }, realm: 'global', owner: 'fp1', exec: 1 };
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
const checked = async () => {
  const s = await snapshotOf('export default () => new Response("ok");', null, { project: B.target.project.id, compId: B.target.container.id, exec: 1 });
  if (!s.ok) throw new Error(s.why);
  return { snap: s.snapshot, verdict: verdictFor(s.snapshot, { verdict: 'ready', errors: [], missing: [] }) };
};
const input = (route: string, c: Awaited<ReturnType<typeof checked>>): LiveIn => ({
  way: 'write', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route, snap: c.snap, verdict: c.verdict,
  idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
});

afterEach(async () => { io.writes.length = 0; io.refuse.clear(); io.found = null; io.settle = null; io.settled.length = 0; io.released = 0; await clearScriptStore(); });

describe('Make it live refused on a first send', () => {
  it('shows the refusal with Change address, frees the draft, and the next Make it live goes to the new address', async () => {
    io.refuse.add('default/1/taken.ts');
    const c = await checked();
    const { result, rerender } = renderHook((p: LiveIn) => useLive(p), { initialProps: input('/taken', c) });
    await act(async () => { await result.current.send(); });
    expect(io.writes.map((w) => w.path)).toEqual(['default/1/taken.ts']);
    const live = result.current.live;
    expect(live.k).toBe('refused');
    if (live.k === 'refused') {
      expect(live.e.title).toEqual({ key: 'live.route.title' });
      expect(live.e.actions).toContain('changeAddress');
    }
    expect(rec()).toMatchObject({ state: 'open', deploy: null });
    // Change address: back to Where, a new address, Make it live again: a new reservation, a new op id, at the new address.
    act(() => { result.current.again(); });
    rerender(input('/free', c));
    expect(result.current.live.k).toBe('confirm');
    await act(async () => { await result.current.send(); });
    expect(io.writes.map((w) => w.path)).toEqual(['default/1/taken.ts', 'default/1/free.ts']);
    expect(io.writes[1]!.opId).not.toBe(io.writes[0]!.opId);
    expect(result.current.live.k).toBe('done');
  });

  it('a refused Try again of a reservation stays held ("It may be live"): an earlier send of it may have landed', async () => {
    io.refuse.add('default/1/notes.ts');
    await openRecord(ID, 'write', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'f'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'f'.repeat(32), 'didnt');
    const c = await checked();
    const { result } = renderHook(() => useLive(input('/notes', c)));
    expect(result.current.live.k).toBe('didnt');
    await act(async () => { await result.current.send(); });
    expect(result.current.live.k).toBe('held');
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { phase: 'held' } });
  });
});

// A Check that finds a script at a held write's path, whose op hoody-exec's journal settles refused or
// fenced, found another writer's file: never "It's live". The draft is open again, shown as the address taken with Change
// address, and the next Make it live goes to the new address under a new reservation.
describe('Check finds a script that is not this deploy\'s', () => {
  for (const state of ['not_sent', 'failed'] as const) {
    it(`the journal settles the op ${state === 'not_sent' ? 'fenced' : 'refused'}: the address taken, Change address, the draft open; the next Make it live goes to the new address`, async () => {
      await openRecord(ID, 'write', B as never);
      await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'f'.repeat(32), sentAfter: 1000, attempt: 0 });
      await markDeploy(rec(), 'f'.repeat(32), 'held');
      io.found = true;
      io.settle = { state };
      const c = await checked();
      const { result, rerender } = renderHook((p: LiveIn) => useLive(p), { initialProps: input('/notes', c) });
      expect(result.current.live.k).toBe('held');
      await act(async () => { await result.current.checkAgain(); });
      expect(io.settled).toEqual(['f'.repeat(32)]);
      expect(io.released).toBe(1);
      const live = result.current.live;
      expect(live.k).toBe('refused');
      if (live.k === 'refused') {
        expect(live.e.title).toEqual({ key: 'live.taken.title' });
        expect(live.e.actions).toEqual(['changeAddress']);
      }
      expect(rec()).toMatchObject({ state: 'open', deploy: null });
      expect(io.writes).toEqual([]);
      act(() => { result.current.again(); });
      rerender(input('/free', c));
      expect(result.current.live.k).toBe('confirm');
      await act(async () => { await result.current.send(); });
      expect(io.writes.map((w) => w.path)).toEqual(['default/1/free.ts']);
      expect(io.writes[0]!.opId).not.toBe('f'.repeat(32));
      expect(result.current.live.k).toBe('done');
    });
  }

  it('the journal settles the op committed: It\'s live, its hold freed', async () => {
    await openRecord(ID, 'write', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'f'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'f'.repeat(32), 'held');
    io.found = true;
    io.settle = { state: 'done' };
    const c = await checked();
    const { result } = renderHook(() => useLive(input('/notes', c)));
    await act(async () => { await result.current.checkAgain(); });
    expect(result.current.live.k).toBe('done');
    expect(io.released).toBe(1);
    expect(rec()).toMatchObject({ state: 'consumed' });
  });
});
