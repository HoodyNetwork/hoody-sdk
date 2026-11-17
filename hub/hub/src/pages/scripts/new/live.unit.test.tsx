// Vitest (New script): Make it live's own rules, at the hook. Discard releases only the deploy its screen
// showed: a record another tab moved meanwhile (a Try again now sending) is not discarded without its own warning. An idea
// that carries its own schedule never says it runs only when called.
import { act, render, renderHook, screen, userEvent } from '@app/testing';
import type { DraftRecord } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ existsOn: [] as Array<string | undefined>, writes: [] as Array<{ path: string }> }));
vi.mock('../data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useBoundSends: (b: { target: { container: { id: string } } } | null) => ({ shown: true, write: async (v: { path: string }) => { io.writes.push(v); return { outcome: 'pending' }; }, exists: async () => { io.existsOn.push(b?.target.container.id); return null; }, clock: async () => 1000 }),
    useAliasCreate: () => ({ mutateAsync: async () => ({ outcome: 'done' }) }),
  };
});

import strings from '../strings.en.json';
import { clearScriptStore } from './flowfix';
import { beginDeploy, markDeploy, nextAttempt, openRecord, readDraftRecord, sendAgain } from './records';
import { StepLive, useLive, type UseLive } from './StepLive';
import { snapshotOf, verdictFor } from './snapshot';
import { deployWrite } from './deploy';

const ID = 'bbbbbbbbbb';
const B = { target: { project: { id: 'p1' }, container: { id: 'c0a7150000000000000000a1' } }, realm: 'global', owner: 'fp1', exec: 1 };
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;

afterEach(async () => { await clearScriptStore(); });

describe('Make it live: Discard', () => {
  it('a Discard pressed on "Didn\'t deploy" after another tab\'s Try again is sending again does nothing', async () => {
    const o = await openRecord(ID, 'write', B as never);
    expect(o.ok).toBe(true);
    const m = await beginDeploy(rec(), { kind: 'write', path: 'notes.ts', opId: 'a'.repeat(32), sentAfter: 1000, attempt: 0 });
    expect(m.ok).toBe(true);
    await markDeploy(rec(), 'a'.repeat(32), 'didnt');
    const { result } = renderHook(() => useLive({
      way: 'write', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route: '/notes', snap: null, verdict: null,
      idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
    }));
    expect(result.current.live.k).toBe('didnt');
    const seen = { phase: 'didnt' as const, opId: result.current.op };
    // Another tab presses Try again before this tab's Discard lands.
    await act(async () => { await sendAgain(rec()); });
    let ok = true;
    await act(async () => { ok = await result.current.discard(seen); });
    expect(ok).toBe(false);
    expect(rec().state).toBe('deploying');
    expect(rec().deploy?.phase).toBe('sending');
  });
});

describe('Make it live: Check', () => {
  it('Check reads the reservation\'s own computer, never the computer the editable draft names now', async () => {
    io.existsOn.length = 0;
    const o = await openRecord(ID, 'write', B as never);
    expect(o.ok).toBe(true);
    await beginDeploy(rec(), { kind: 'write', path: 'notes.ts', opId: 'c'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'c'.repeat(32), 'held');
    // The draft was moved to borealis since; the reservation is atlas's.
    const moved = { ...B, target: { project: { id: 'p1' }, container: { id: 'c0a7150000000000000000b2' } } };
    const { result } = renderHook(() => useLive({
      way: 'write', b: moved as never, draftId: ID, computer: 'borealis', compId: moved.target.container.id, route: '/notes', snap: null, verdict: null,
      idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
    }));
    await act(async () => { await result.current.checkAgain(); });
    expect(io.existsOn.length).toBeGreaterThan(0);
    expect(new Set(io.existsOn)).toEqual(new Set([B.target.container.id]));
  });
});

describe('Make it live: what it runs on', () => {
  it('an idea with its own schedule says so, never "only when its address is called"', () => {
    const api = { live: { k: 'confirm' }, link: { k: 'none' }, send: async () => undefined, checkAgain: async () => undefined, discard: async () => false, discardNote: false, canSend: true, op: null, again: () => undefined } as unknown as UseLive;
    render(<StepLive api={api} route="/health" computer="atlas" schedule={null} ownSchedule link={false} onAction={() => undefined} onTry={() => undefined} onOpen={() => undefined} onAnother={() => undefined} onDiscarded={() => undefined} />);
    expect(screen.getByText(strings['flow.rail.ideaOwn'])).toBeTruthy();
    expect(screen.queryByText(strings['flow.where.onlyCalled'])).toBeNull();
  });
});

describe('Make it live: Try again sends the reservation as stored', () => {
  const ok = async (code: string) => {
    const s = await snapshotOf(code, null, { project: B.target.project.id, compId: B.target.container.id, exec: 1 });
    if (!s.ok) throw new Error(s.why);
    return { snap: s.snapshot, verdict: verdictFor(s.snapshot, { verdict: 'ready', errors: [], missing: [] }) };
  };

  it('to the reservation\'s own path, never the address the draft holds now', async () => {
    io.writes.length = 0;
    await openRecord(ID, 'write', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'e'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'e'.repeat(32), 'didnt');
    const { snap, verdict } = await ok('export default () => new Response("n");');
    const { result } = renderHook(() => useLive({
      way: 'write', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route: '/elsewhere', snap, verdict,
      idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
    }));
    expect(result.current.live.k).toBe('didnt');
    await act(async () => { await result.current.send(); });
    expect(io.writes.map((w) => w.path)).toEqual(['default/1/notes.ts']);
    // The route guard names the address written to, not the draft's current one.
    expect((io.writes[0] as { expectRoute?: { route: string | null } }).expectRoute?.route).toBe('/notes');
  });

  it('after a reload (no address, no binding in the draft) Try again still resends the reservation', async () => {
    io.writes.length = 0;
    await openRecord(ID, 'write', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'd'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'd'.repeat(32), 'didnt');
    const { snap, verdict } = await ok('export default () => new Response("n");');
    const { result } = renderHook(() => useLive({
      way: 'write', b: null, draftId: ID, computer: 'atlas', compId: '', route: '', snap, verdict,
      idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
    }));
    expect(result.current.live.k).toBe('didnt');
    await act(async () => { await result.current.send(); });
    expect(io.writes.map((w) => w.path)).toEqual(['default/1/notes.ts']);
    expect((io.writes[0] as { expectRoute?: { route: string | null } }).expectRoute?.route).toBe('/notes');
  });

  it('never with code of another attempt than the one the reservation was made from', async () => {
    io.writes.length = 0;
    await openRecord(ID, 'ai', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'f'.repeat(32), sentAfter: 1000, attempt: 1 });
    await markDeploy(rec(), 'f'.repeat(32), 'didnt');
    const { snap, verdict } = await ok('export default () => new Response("n");');
    const { result } = renderHook(() => useLive({
      way: 'ai', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route: '/notes', snap, verdict,
      idea: null, fields: {}, link: null, attempt: 2, recordBinding: B as never,
    }));
    await act(async () => { await result.current.send(); });
    expect(io.writes).toHaveLength(0);
    expect(rec().deploy?.phase).toBe('didnt');
  });
});

describe('Make it live: code of an attempt another tab moved past is never sent', () => {
  it('deployWrite compares the caller\'s attempt with the record read after its byte check, and sends nothing on a mismatch', async () => {
    io.writes.length = 0;
    await openRecord(ID, 'ai', B as never);
    const s0 = await snapshotOf('export default () => new Response("n");', null, { project: B.target.project.id, compId: B.target.container.id, exec: 1 });
    if (!s0.ok) throw new Error(s0.why);
    const verdict = verdictFor(s0.snapshot, { verdict: 'ready', errors: [], missing: [] });
    const sends = { shown: true, write: async (v: { path: string }) => { io.writes.push(v); return { outcome: 'pending' }; }, exists: async () => null, clock: async () => 1000 } as never;
    // The record says attempt 0 is current; this code is attempt 1's (a tab that has moved past, or one moved past it).
    const a = await deployWrite({ sends }, { draftId: ID, snapshot: s0.snapshot, verdict, path: 'default/1/notes.ts', attempt: 1 });
    expect(a).toEqual({ outcome: 'not_sent', code: 'STALE' });
    expect(io.writes).toHaveLength(0);
    expect(rec().state).toBe('open');
    const b = await deployWrite({ sends }, { draftId: ID, snapshot: s0.snapshot, verdict, path: 'default/1/notes.ts', attempt: 0 });
    expect(b.outcome).not.toBe('not_sent');
    expect(io.writes).toHaveLength(1);
  });
});

describe('a Try again this tab cannot send says why on the reservation, and Check fixes it', () => {
  it('after a reload (no checked code) Try again shows the refusal and Check the code, keeps Try again and Discard, sends nothing', async () => {
    io.writes.length = 0;
    await openRecord(ID, 'write', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'c'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'c'.repeat(32), 'didnt');
    const acts: string[] = [];
    function Live() {
      const api = useLive({ way: 'write', b: null, draftId: ID, computer: 'atlas', compId: '', route: '', snap: null, verdict: null, idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never });
      return <StepLive api={api} route="" computer="atlas" schedule={null} link={false} onAction={(a) => { acts.push(a); }} onTry={() => undefined} onOpen={() => undefined} onAnother={() => undefined} onDiscarded={() => undefined} />;
    }
    const user = userEvent.setup();
    render(<Live />);
    await user.click(await screen.findByRole('button', { name: strings['flow.live.act.tryAgain'] }));
    expect(await screen.findByText(strings['review.checkFirst'])).toBeTruthy();
    expect(io.writes).toHaveLength(0);
    expect(rec().deploy?.phase).toBe('didnt');
    expect(screen.getByRole('button', { name: strings['flow.live.act.tryAgain'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['flow.live.discard'] })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: strings['flow.live.act.checkCode'] }));
    expect(acts).toEqual(['checkCode']);
  });
});

describe('the byte check holds when the record moves during it', () => {
  it('a record current at the call that moves to a newer attempt while the bytes are checked: STALE, nothing sent or reserved', async () => {
    io.writes.length = 0;
    await openRecord(ID, 'ai', B as never);
    const s0 = await snapshotOf('export default () => new Response("n");', null, { project: B.target.project.id, compId: B.target.container.id, exec: 1 });
    if (!s0.ok) throw new Error(s0.why);
    const verdict = verdictFor(s0.snapshot, { verdict: 'ready', errors: [], missing: [] });
    const sends = { shown: true, write: async (v: { path: string }) => { io.writes.push(v); return { outcome: 'pending' }; }, exists: async () => null, clock: async () => 1000 } as never;
    // The attempt the record holds when deployWrite reads it (after the byte check's await): proves the move came first.
    const seen: number[] = [];
    const read = (id: string) => { const r = readDraftRecord(id); if (r && r !== 'unreadable') seen.push(r.current); return r; };
    expect(rec().current).toBe(0);
    const p = deployWrite({ sends, read }, { draftId: ID, snapshot: s0.snapshot, verdict, path: 'default/1/notes.ts', attempt: 0 });
    // Another tab starts attempt 1 while this one's bytes are checked.
    expect((await nextAttempt(rec(), false)).ok).toBe(true);
    const a = await p;
    expect(seen[0]).toBe(1);
    expect(a).toEqual({ outcome: 'not_sent', code: 'STALE' });
    expect(io.writes).toHaveLength(0);
    expect(rec().deploy).toBeFalsy();
  });
});
