// Vitest: the editor's own proof names the send it concerns. A Check that answers after a later send is pending
// frees nothing of that later send: it stays held.
import { act, renderHook } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { how: 'complete' | 'discard'; kind: 'write' | 'restore'; vars: unknown; hold: unknown };
const calls: Call[] = [];
let holdSeq = 0;
let noHold = false;
/** Rows core still holds from an earlier mount, per mutation (empty: none). */
const heldRows: Record<'write' | 'restore', unknown[]> = { write: [], restore: [] };
const settled: unknown[] = [];
let settleAnswer: (v: { data: { outcome: string } }) => void = () => undefined;

const mut = (kind: 'write' | 'restore') => ({
  get pending() { return heldRows[kind].length > 0; },
  isPending: false,
  // The pending answer names the hold of its own send; holdOf (a lookup by the computer the shell shows by then) is never asked.
  mutateAsync: async () => ({ outcome: 'pending' as const, ...(noHold ? {} : { hold: `hold-${kind}-${++holdSeq}` }) }),
  held: () => heldRows[kind] as never,
  holdOf: async () => { throw new Error('holdOf is never asked after a send'); },
  complete: async (vars?: unknown, hold?: unknown) => { calls.push({ how: 'complete', kind, vars, hold }); },
  discard: async (vars?: unknown, hold?: unknown) => { calls.push({ how: 'discard', kind, vars, hold }); },
  settle: async () => undefined,
});
const write = mut('write');
const restore = mut('restore');

vi.mock('./data', () => ({
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useVersions: () => ({ refetch: async () => undefined, data: undefined }),
  useValidate: () => ({ mutateAsync: async () => ({ data: { verdict: 'ready' } }) }),
  useWrite: () => write,
  useRestore: () => restore,
  useSettle: () => ({ mutateAsync: (v: unknown) => new Promise((res) => { settled.push(v); settleAnswer = res as never; }), readBack: async () => false, holdOf: async () => undefined }),
}));

import { useEditor } from './parts/useEditor';

const item = { id: 'atlas.00a1~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.00a1', path: 'a.ts', name: 'a', route: '/a', description: '', managed: false } as never;
const comp = { id: 'c1', caps: { revisions: true, history: false }, instances: [] } as never;
const t = ((k: string) => k) as never;

describe('own proofs name their send', () => {
  beforeEach(() => { calls.length = 0; holdSeq = 0; noHold = false; heldRows.write = []; heldRows.restore = []; settled.length = 0; });

  it('a Check for an earlier send never frees a later send', async () => {
    const { result } = renderHook(() => useEditor(item, comp, () => undefined, t));
    await act(async () => { result.current.setText?.('export default 2;\n'); });
    // First save goes pending; the person starts a Check, which is still reading.
    await act(async () => { await result.current.save(); });
    expect(result.current.locked).toBe(true);
    let checked!: Promise<void>;
    await act(async () => { checked = result.current.check(); });
    // Meanwhile the hold is closed knowingly and a second save goes pending.
    await act(async () => { result.current.force(); });
    await act(async () => { result.current.setText?.('export default 3;\n'); });
    await act(async () => { await result.current.save(); });
    // The first Check answers "committed" now: it concerns the first send, not the second.
    await act(async () => { settleAnswer({ data: { outcome: 'committed' } }); await checked; });
    expect(calls).toEqual([]);
  });

  it('a proof frees only the mutation that sent, with its variables and hold', async () => {
    const { result } = renderHook(() => useEditor(item, comp, () => undefined, t));
    await act(async () => { result.current.setText?.('export default 2;\n'); });
    await act(async () => { await result.current.save(); });
    let checked!: Promise<void>;
    await act(async () => { checked = result.current.check(); });
    await act(async () => { settleAnswer({ data: { outcome: 'committed' } }); await checked; });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ how: 'complete', kind: 'write', hold: 'hold-write-1' });
    expect(calls[0]?.vars).toMatchObject({ compId: 'c1', path: 'a.ts' });
  });

  it('a refused send discards with variables and the hold, never discard(undefined, hold)', async () => {
    const { result } = renderHook(() => useEditor(item, comp, () => undefined, t));
    await act(async () => { result.current.setText?.('export default 2;\n'); });
    await act(async () => { await result.current.save(); });
    let checked!: Promise<void>;
    await act(async () => { checked = result.current.check(); });
    await act(async () => { settleAnswer({ data: { outcome: 'refused' } }); await checked; });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ how: 'discard', kind: 'write', hold: 'hold-write-1' });
    expect(calls[0]?.vars).toBeTruthy();
  });

  it('a Check right after a pending save frees the send by the hold its answer named', async () => {
    const { result } = renderHook(() => useEditor(item, comp, () => undefined, t));
    await act(async () => { result.current.setText?.('export default 2;\n'); });
    await act(async () => { await result.current.save(); });
    let checked!: Promise<void>;
    await act(async () => { checked = result.current.check(); });
    await act(async () => { settleAnswer({ data: { outcome: 'committed' } }); await checked; });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ how: 'complete', kind: 'write', hold: 'hold-write-1' });
  });

  it('a proof that finds no hold keeps the pending note instead of clearing the change', async () => {
    const { result } = renderHook(() => useEditor(item, comp, () => undefined, t));
    await act(async () => { result.current.setText?.('export default 2;\n'); });
    noHold = true;
    await act(async () => { await result.current.save(); });
    let checked!: Promise<void>;
    await act(async () => { checked = result.current.check(); });
    await act(async () => { settleAnswer({ data: { outcome: 'committed' } }); await checked; });
    expect(calls).toEqual([]);
    expect(result.current.locked).toBe(true);
    expect(result.current.note?.kind).toBe('pending');
  });

  it('after a remount, Check again asks the op of the held row and frees it by that row\'s hold', async () => {
    for (const kind of ['write', 'restore'] as const) {
      calls.length = 0;
      settled.length = 0;
      heldRows.write = [];
      heldRows.restore = [];
      // An earlier mount's send of this script on this computer, still held: this mount sent nothing.
      heldRows[kind] = [{ hold: `hold-old-${kind}`, at: 1, identity: { path: 'a.ts', opId: `op-old-${kind}` }, target: { container: { id: 'c1' } }, account: 'u' }];
      const { result, unmount } = renderHook(() => useEditor(item, comp, () => undefined, t));
      await act(async () => {});
      expect(result.current.locked).toBe(true);
      let checked!: Promise<void>;
      await act(async () => { checked = result.current.check(); });
      expect(settled).toEqual([expect.objectContaining({ compId: 'c1', opId: `op-old-${kind}` })]);
      await act(async () => { settleAnswer({ data: { outcome: 'committed' } }); await checked; });
      expect(calls).toEqual([expect.objectContaining({ how: 'complete', kind, hold: `hold-old-${kind}` })]);
      unmount();
    }
  });

  it('after a remount, a held row of another script or computer, or one naming no op, is never checked', async () => {
    for (const row of [
      { hold: 'h1', at: 1, identity: { path: 'b.ts', opId: 'op1' }, target: { container: { id: 'c1' } }, account: 'u' },
      { hold: 'h2', at: 1, identity: { path: 'a.ts', opId: 'op2' }, target: { container: { id: 'c2' } }, account: 'u' },
      { hold: 'h3', at: 1, identity: { path: 'a.ts' }, target: { container: { id: 'c1' } }, account: 'u' },
    ]) {
      settled.length = 0;
      heldRows.write = [row];
      const { result, unmount } = renderHook(() => useEditor(item, comp, () => undefined, t));
      await act(async () => { await result.current.check(); });
      expect(settled).toEqual([]);
      expect(calls).toEqual([]);
      unmount();
    }
  });
});
