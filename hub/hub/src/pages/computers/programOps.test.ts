// The Programs tab's held actions (C9, and one shared restart lock): a restart is proved only by its own
// receipt, never by a fresh list (a program that kept running proves nothing); a restart this tab cannot read a
// receipt for (another page's send) stays held; any other action reads back only its own change.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useProgramOps, type ProgramAct } from './parts/programOps';

const C = { id: 'a'.repeat(24), project_id: 'p1', server_name: 'n12' };
type Receipt = 'completed' | 'failed' | 'unknown';

function fake(out: { outcome: string; code?: string; idem?: string }, receipt: Receipt = 'unknown') {
  const s = {
    mutateAsync: vi.fn(async (_v: unknown) => out),
    readBack: vi.fn(async (_a: ProgramAct) => true),
    holdOf: vi.fn(async (): Promise<string | undefined> => 'h1'),
    complete: vi.fn(async () => true),
    discard: vi.fn(async () => true),
    receipt: vi.fn(async (): Promise<Receipt> => receipt),
  };
  return s;
}

async function held(s: ReturnType<typeof fake>, a: ProgramAct) {
  const hook = renderHook(() => useProgramOps(() => s));
  await act(async () => { await hook.result.current.press(C, { id: '7' }, a); });
  expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
  return hook;
}

describe('programs tab: what proves a held action', () => {
  it('a restart is not freed by a fresh list: its receipt still running keeps it held', async () => {
    const s = fake({ outcome: 'pending', idem: 'k1' }, 'unknown');
    const hook = await held(s, 'restart');
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.receipt).toHaveBeenCalledWith(expect.objectContaining({ id: C.id, program: '7' }), 'k1');
    expect(s.readBack).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
    expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
  });

  it('a completed receipt completes the restart (lock and key go: the next Restart is new) and frees the row', async () => {
    const s = fake({ outcome: 'pending', idem: 'k1' }, 'completed');
    const hook = await held(s, 'restart');
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.complete).toHaveBeenCalledWith(expect.objectContaining({ id: C.id, program: '7' }), 'restart', 'h1');
    expect(hook.result.current.busy[`${C.id}:7`]).toBeUndefined();
  });

  it('a failed receipt discards the restart (proved not applied): failed, and the row is free', async () => {
    const s = fake({ outcome: 'pending', idem: 'k1' }, 'failed');
    const hook = await held(s, 'restart');
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.discard).toHaveBeenCalledWith(expect.objectContaining({ id: C.id, program: '7' }), 'restart', 'h1');
    expect(hook.result.current.busy[`${C.id}:7`]).toBe('failed');
  });

  it("a restart held by another page's send (no key here) stays held", async () => {
    const s = fake({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    const hook = await held(s, 'restart');
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.receipt).not.toHaveBeenCalled();
    expect(s.readBack).not.toHaveBeenCalled();
    expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
  });

  it('a held stop reads back its own change only', async () => {
    const s = fake({ outcome: 'pending' });
    const hook = await held(s, 'stop');
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.readBack).toHaveBeenCalledTimes(1);
    expect(s.readBack).toHaveBeenCalledWith('stop');
    expect(hook.result.current.busy[`${C.id}:7`]).toBeUndefined();
  });

  it('the restart change declares no list read (a fresh list would free it)', async () => {
    const { computersTable } = await import('./data');
    expect(computersTable.changes?.programRestart?.reads ?? []).toEqual([]);
  });
});

describe('programs tab: the warned Dismiss of a held action', () => {
  for (const a of ['start', 'stop', 'boot', 'restart'] as const) {
    it(`Dismiss on a held ${a} has core let go (key kept) and frees the row`, async () => {
      const s = { ...fake({ outcome: 'pending', ...(a === 'restart' ? { idem: 'k1' } : {}) }), dismiss: vi.fn(async () => true) };
      const hook = renderHook(() => useProgramOps(() => s));
      await act(async () => { await hook.result.current.press(C, { id: '7' }, a); });
      expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
      expect(hook.result.current.canDismiss).toBe(true);
      await act(async () => { await hook.result.current.dismiss(C.id, '7'); });
      expect(s.dismiss).toHaveBeenCalledWith(expect.objectContaining({ id: C.id, program: '7', act: a }), a, 'h1');
      expect(hook.result.current.busy[`${C.id}:7`]).toBeUndefined();
      expect(s.complete).not.toHaveBeenCalled();
    });
  }

  it('without a core dismiss the tab offers none and Dismiss changes nothing', async () => {
    const s = fake({ outcome: 'pending' });
    const hook = await held(s, 'stop');
    expect(hook.result.current.canDismiss).toBe(false);
    await act(async () => { await hook.result.current.dismiss(C.id, '7'); });
    expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
  });
});

describe('programs tab: a restart Check reads only its own key', () => {
  it("an older key's completed receipt never completes a newer restart held under the shared lock", async () => {
    const s = { ...fake({ outcome: 'pending', idem: 'k1' }, 'completed'), heldKey: vi.fn((): string | null | undefined => 'k1') };
    const hook = renderHook(() => useProgramOps(() => s));
    await act(async () => { await hook.result.current.press(C, { id: '7' }, 'restart'); });
    // Another page proved k1 and restarted again: k2 is what core holds now.
    s.heldKey.mockReturnValue('k2');
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.receipt).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
    expect(hook.result.current.busy[`${C.id}:7`]).toBeUndefined();
  });
});

describe('programs tab: a restart held by another page', () => {
  it("is marked as the Programs page's, so the tab points there instead of a Check that cannot prove it", async () => {
    const s = fake({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    const hook = await held(s, 'restart');
    expect(hook.result.current.elsewhere[`${C.id}:7`]).toBe(true);
  });

  it('a restart this tab sent is its own (it has the receipt key)', async () => {
    const s = fake({ outcome: 'pending', idem: 'k1' });
    const hook = await held(s, 'restart');
    expect(hook.result.current.elsewhere[`${C.id}:7`]).toBeUndefined();
  });
});

describe('programs tab: a restart held under the shared lock by another page', () => {
  it("a held change another page sent is marked foreign: this tab's Dismiss cannot release it (core frees only its own sender's)", async () => {
    for (const a of ['stop', 'restart'] as const) {
      const s = { ...fake({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }), heldKey: vi.fn(() => 'k9'), dismiss: vi.fn(async () => true) };
      const hook = renderHook(() => useProgramOps(() => s));
      await act(async () => { await hook.result.current.press(C, { id: '7' }, a); });
      expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
      expect(hook.result.current.foreign[`${C.id}:7`]).toBe(true);
    }
  });

  it('READ_BACK_FIRST is this page\'s own earlier send (after a remount too): held, never foreign', async () => {
    for (const a of ['stop', 'restart'] as const) {
      const s = { ...fake({ outcome: 'not_sent', code: 'READ_BACK_FIRST' }), heldKey: vi.fn(() => 'k9'), dismiss: vi.fn(async () => true) };
      const hook = renderHook(() => useProgramOps(() => s));
      await act(async () => { await hook.result.current.press(C, { id: '7' }, a); });
      expect(hook.result.current.busy[`${C.id}:7`]).toBe('pending');
      expect(hook.result.current.foreign[`${C.id}:7`]).toBeUndefined();
    }
  });

  it('a change this tab sent is not foreign', async () => {
    const s = fake({ outcome: 'pending', idem: 'k1' });
    const hook = await held(s, 'restart');
    expect(hook.result.current.foreign[`${C.id}:7`]).toBeUndefined();
  });

  it("reads that restart's receipt by the key core keeps for it, and is not marked as the other page's", async () => {
    const s = { ...fake({ outcome: 'not_sent', code: 'READ_BACK_FIRST' }, 'completed'), heldKey: vi.fn(() => 'k9') };
    const hook = renderHook(() => useProgramOps(() => s));
    await act(async () => { await hook.result.current.press(C, { id: '7' }, 'restart'); });
    expect(hook.result.current.elsewhere[`${C.id}:7`]).toBeUndefined();
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(s.receipt).toHaveBeenCalledWith(expect.objectContaining({ program: '7' }), 'k9');
    expect(s.complete).toHaveBeenCalled();
    expect(hook.result.current.busy[`${C.id}:7`]).toBeUndefined();
  });

  it('once nothing is held any more (the other page proved it), Check frees the row', async () => {
    let key: string | undefined = 'k9';
    const s = { ...fake({ outcome: 'not_sent', code: 'READ_BACK_FIRST' }, 'unknown'), heldKey: vi.fn(() => key) };
    const hook = renderHook(() => useProgramOps(() => s));
    await act(async () => { await hook.result.current.press(C, { id: '7' }, 'restart'); });
    key = undefined;
    await act(async () => { await hook.result.current.settled(C.id, '7'); });
    expect(hook.result.current.busy[`${C.id}:7`]).toBeUndefined();
  });

  it('the receipt verdict: only completed + restarted applied; completed + failed stopped and did not start', async () => {
    const { restartVerdict } = await import('./data');
    expect(restartVerdict({ state: 'completed', outcome: 'restarted' })).toBe('completed');
    expect(restartVerdict({ state: 'completed', outcome: 'failed' })).toBe('failed');
    expect(restartVerdict({ state: 'completed' })).toBe('unknown');
    expect(restartVerdict({ state: 'unknown' })).toBe('unknown');
  });
});

describe('programs tab: a range program stops and restarts as a whole, as on the Programs page', () => {
  it('reads the range from the overview', async () => {
    const { computersTable } = await import('./data');
    const raw = { programs: [{ id: 9, name: 'pool', status: 'running', port_range: { start: 16000, end: 16002 }, instances: [] }, { id: 1, name: 'web', status: 'running', instances: [] }] };
    const got = computersTable.reads?.programs?.select?.(raw, { id: C.id } as never) as Record<string, Array<{ id: string; range?: boolean }>>;
    expect(got[C.id]?.find((p) => p.id === '9')?.range).toBe(true);
    expect(got[C.id]?.find((p) => p.id === '1')?.range).toBeFalsy();
  });

  it('a boot press says boot: true itself (the builder has no default)', async () => {
    const s = fake({ outcome: 'done' });
    const hook = renderHook(() => useProgramOps(() => s));
    await act(async () => { await hook.result.current.press(C, { id: '1' }, 'boot'); });
    expect(s.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ program: '1', act: 'boot', boot: true }));
  });

  it('sends a range program as range; the builder adds all for a whole stop or restart, never for a start', async () => {
    const s = fake({ outcome: 'done' });
    const hook = renderHook(() => useProgramOps(() => s));
    await act(async () => { await hook.result.current.press(C, { id: '9', range: true }, 'restart'); });
    await act(async () => { await hook.result.current.press(C, { id: '9', range: true }, 'start'); });
    expect(s.mutateAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({ program: '9', act: 'restart', range: true }));
    const { computersTable } = await import('./data');
    const start = s.mutateAsync.mock.calls[1]?.[0] as Parameters<NonNullable<NonNullable<typeof computersTable.changes>[string]['input']>>[0];
    expect((computersTable.changes?.programStart?.input?.(start) as { body: Record<string, unknown> }).body).not.toHaveProperty('all');
  });

  it("the lock identity and body carry all, the same as the Programs page's", async () => {
    const { computersTable, subjectOf } = await import('./data');
    const v = { ...subjectOf(C), program: '9', range: true };
    for (const k of ['programStop', 'programRestart']) {
      const ch = computersTable.changes?.[k];
      expect(ch?.lockKey?.(v)).toEqual({ id: '9', port: null, all: true });
      expect((ch?.input?.(v) as { body: Record<string, unknown> }).body.all).toBe(true);
    }
  });
});
