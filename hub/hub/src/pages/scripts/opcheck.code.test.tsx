// Vitest on core's real change source: a Check's error toast names the code of its OWN proof. Two Checks of one hook may
// overlap (a new send remembered while an earlier proof still waits for its discard): each toast keeps its own code, and the
// earlier Check never forgets the newer send. A Check that proves nothing shows no code and claims no refusal.
import { CoreQueryProvider, queryClient } from '@core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Reply } from '@core/test/env';
import { useOpCheck, type OpSent } from './parts/opcheck';
import strings from './strings.en.json';

type Shown = { title: string; body?: string; tone?: string };
const toasts = vi.hoisted(() => [] as Shown[]);
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: Shown) => { toasts.push(c); return 'toast-1'; } }));

const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
/** What the computer answers for each op id. */
const answers: Record<string, { state: string; code?: string }> = {};
const reply = (c: { url: string; method: string; body: { opId?: string } | null }): Reply => {
  if (c.url.includes('/ops/settle')) return { status: 200, body: { opId: c.body?.opId, ...(answers[c.body?.opId ?? ''] ?? { state: 'forgotten' }) } };
  return { status: 200, body: {} };
};

/** One send's record, with a complete and a discard the test can hold open. */
function sendRec(opId: string, hold: string) {
  let release: () => void = () => {};
  const freeing = new Promise<void>((res) => { release = res; });
  const m = {
    complete: vi.fn(async () => { await freeing; return true; }),
    discard: vi.fn(async () => { await freeing; return true; }),
    held: () => [{ hold, target: TARGET }] as never,
  };
  const rec: OpSent = { compId: 'c1', exec: 1, opId, m, vars: {} as never, hold: Promise.resolve(hold) };
  return { rec, m, release };
}

const failedBody = (code: string) => strings['check.failedFix'].replace('{{code}}', code);

describe('the code a Check names', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    toasts.length = 0;
    for (const k of Object.keys(answers)) delete answers[k];
    onFetch(reply);
    setTarget(TARGET);
  });

  it('two overlapping refusals: each toast names its own code', async () => {
    answers.opA = { state: 'refused', code: 'CODE_A' };
    answers.opB = { state: 'refused', code: 'CODE_B' };
    const hook = renderHook(() => useOpCheck(), { wrapper: CoreQueryProvider });
    const a = sendRec('opA', 'hA');
    const b = sendRec('opB', 'hB');
    const endA = vi.fn();
    const endB = vi.fn();
    const noRead = async () => {};
    hook.result.current.remember(a.rec, 'place');
    let first: Promise<void> | undefined;
    // A's refusal is proved; its discard is still out when B is sent and checked.
    await act(async () => { first = hook.result.current.checkWith('place', endA, noRead); await flush(); });
    expect(a.m.discard).toHaveBeenCalledTimes(1);
    expect(endA).not.toHaveBeenCalled();
    hook.result.current.remember(b.rec, 'place');
    b.release();
    await act(async () => { await hook.result.current.checkWith('place', endB, noRead); await flush(); });
    a.release();
    await act(async () => { await first; await flush(); });
    expect(endA).toHaveBeenCalledTimes(1);
    expect(endB).toHaveBeenCalledTimes(1);
    const failed = toasts.filter((x) => x.title === strings['check.failed']);
    expect(failed.map((x) => x.body)).toEqual([failedBody('CODE_B'), failedBody('CODE_A')]);
    expect(failed.every((x) => x.tone === 'error')).toBe(true);
  });

  it('an answer that proves nothing: no code shown, nothing claims a refusal, the read-back runs', async () => {
    answers.opU = { state: 'forgotten' };
    const hook = renderHook(() => useOpCheck(), { wrapper: CoreQueryProvider });
    const u = sendRec('opU', 'hU');
    u.release();
    const end = vi.fn();
    const readBack = vi.fn(async () => {});
    hook.result.current.remember(u.rec, 'place');
    await act(async () => { await hook.result.current.checkWith('place', end, readBack); await flush(); });
    expect(readBack).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
    expect(u.m.discard).not.toHaveBeenCalled();
    expect(u.m.complete).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
    let v: string | undefined;
    await act(async () => { v = await hook.result.current.check('place'); await flush(); });
    expect(v).toBe('unknown');
  });

  it.each([
    ['refused', 'discard'],
    ['committed', 'complete'],
  ] as const)('a send remembered while an earlier %s Check frees its hold is still checked (%s)', async (state, freed) => {
    answers.opA = { state, code: 'CODE_A' };
    answers.opB = { state: 'committed' };
    const hook = renderHook(() => useOpCheck(), { wrapper: CoreQueryProvider });
    const a = sendRec('opA', 'hA');
    const b = sendRec('opB', 'hB');
    b.release();
    hook.result.current.remember(a.rec, 'place');
    let first: Promise<string> | undefined;
    await act(async () => { first = hook.result.current.check('place'); await flush(); });
    expect(a.m[freed]).toHaveBeenCalledTimes(1);
    hook.result.current.remember(b.rec, 'place');
    a.release();
    let vA: string | undefined;
    await act(async () => { vA = await first; await flush(); });
    expect(vA).toBe(state === 'refused' ? 'failed' : 'done');
    let vB: string | undefined;
    await act(async () => { vB = await hook.result.current.check('place'); await flush(); });
    expect(vB).toBe('done');
    expect(b.m.complete).toHaveBeenCalledTimes(1);
    expect(b.m.complete).toHaveBeenCalledWith({}, 'hB');
    expect(b.m.discard).not.toHaveBeenCalled();
    // B's proof forgot B: a further Check has nothing to prove.
    let again: string | undefined;
    await act(async () => { again = await hook.result.current.check('place'); await flush(); });
    expect(again).toBe('unknown');
  });
});

// Against a real hoody-exec, a settle is itself a guarded send. One whose own answer was lost (the computer did
// not answer) stays held, and core refuses the next settle (READ_BACK_FIRST) until a read-back proves it changed nothing. Without
// a read-back first, every later Check answers "not known" for good, even with the computer back.
describe('a Check after a settle whose own answer was lost', () => {
  /** The computer does not answer at all (stopped): its settle and its health read (core's read-back) both fail. */
  let down = false;
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    toasts.length = 0;
    down = false;
    for (const k of Object.keys(answers)) delete answers[k];
    onFetch((c) => (down && (c.url.includes('/ops/settle') || c.url.includes('/exec/health')) ? { status: 502, body: '' } : reply(c as never)));
    setTarget(TARGET);
  });

  it('the next Check, the computer back, asks again and proves the op: done, its hold completed', async () => {
    answers.opL = { state: 'committed' };
    const hook = renderHook(() => useOpCheck(), { wrapper: CoreQueryProvider });
    const s = sendRec('opL', 'hL');
    s.release();
    const end = vi.fn();
    const readBack = vi.fn(async () => {});
    hook.result.current.remember(s.rec, 'place');
    down = true;
    await act(async () => { await hook.result.current.checkWith('place', end, readBack); await flush(); });
    expect(end).not.toHaveBeenCalled();
    expect(readBack).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.url.includes('/ops/settle'))).toHaveLength(1);
    // The computer is back: the held settle is read back first, then the op is asked again.
    down = false;
    calls.length = 0;
    await act(async () => { await hook.result.current.checkWith('place', end, readBack); await flush(); });
    expect(calls.filter((c) => c.url.includes('/ops/settle'))).toHaveLength(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(s.m.complete).toHaveBeenCalledTimes(1);
    expect(s.m.discard).not.toHaveBeenCalled();
  });

  // Only this settle's own held send is read back. With none held, a Check makes
  // no health read of its own and waits for no other read-back.
  it('a Check with no settle held reads nothing back: no health read, one settle', async () => {
    answers.opN = { state: 'committed' };
    const hook = renderHook(() => useOpCheck(), { wrapper: CoreQueryProvider });
    const s = sendRec('opN', 'hN');
    s.release();
    const end = vi.fn();
    hook.result.current.remember(s.rec, 'place');
    calls.length = 0;
    await act(async () => { await hook.result.current.checkWith('place', end, async () => {}); await flush(); });
    expect(calls.filter((c) => c.url.includes('/exec/health'))).toEqual([]);
    expect(calls.filter((c) => c.url.includes('/ops/settle'))).toHaveLength(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('while the computer still does not answer, each Check stays not known and frees nothing', async () => {
    answers.opM = { state: 'refused', code: 'X' };
    const hook = renderHook(() => useOpCheck(), { wrapper: CoreQueryProvider });
    const s = sendRec('opM', 'hM');
    s.release();
    const end = vi.fn();
    hook.result.current.remember(s.rec, 'place');
    down = true;
    for (let i = 0; i < 2; i++) await act(async () => { await hook.result.current.checkWith('place', end, async () => {}); await flush(); });
    expect(end).not.toHaveBeenCalled();
    expect(s.m.complete).not.toHaveBeenCalled();
    expect(s.m.discard).not.toHaveBeenCalled();
    expect(toasts.filter((x) => x.title === strings['check.failed'])).toEqual([]);
  });
});

