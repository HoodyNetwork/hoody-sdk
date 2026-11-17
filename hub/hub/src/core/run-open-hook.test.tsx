// run-open-hook.test.tsx: useRunOpen(), the Apps Open machine bound to the current computer or an explicit one.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bump, setTarget, type Target } from './ctx';
import { useRunOpen } from './run-open-hook';
import { boot, calls, onFetch, settle, TARGET } from './test/env';

async function flush(): Promise<void> { for (let i = 0; i < 10; i++) await settle(); }

describe('useRunOpen', () => {
  it('no computer: null, nothing sent', async () => {
    boot();
    act(() => { setTarget(null); });
    const { result } = renderHook(() => useRunOpen());
    await act(flush);
    expect(result.current).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('a computer: the machine sends to that computer\'s run kit, credentials omitted', async () => {
    boot();
    act(() => { setTarget(TARGET); });
    onFetch(() => ({ status: 200, body: { version: 1, features: [] } }));
    const { result } = renderHook(() => useRunOpen());
    await act(flush);
    expect(result.current).not.toBeNull();
    await act(async () => { await result.current!.capabilities(); });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.url).toMatch(/-run-1\./);
    expect(calls[0]!.url).toMatch(/\/api\/v1\/run\/capabilities$/);
    expect(calls[0]!.credentials).toBe('omit');
  });
  it('an account or realm switch gives a new machine; the old one\'s sends are refused unsent', async () => {
    boot();
    act(() => { setTarget(TARGET); });
    onFetch(() => ({ status: 200, body: { version: 1, features: [] } }));
    const { result } = renderHook(() => useRunOpen());
    await act(flush);
    const old = result.current!;
    act(() => { bump('switch'); setTarget(TARGET); });
    await act(flush);
    expect(result.current).not.toBe(old);
    const n = calls.length;
    await act(async () => { await old.capabilities(); });
    expect(calls.length).toBe(n);
  });
  it('unmount aborts: a machine held past its view sends nothing', async () => {
    boot();
    act(() => { setTarget(TARGET); });
    onFetch(() => ({ status: 200, body: { version: 1, features: [] } }));
    const { result, unmount } = renderHook(() => useRunOpen());
    await act(flush);
    const m = result.current!;
    unmount();
    const n = calls.length;
    await act(async () => { await m.capabilities(); });
    expect(calls.length).toBe(n);
  });

  describe('explicit target', () => {
    const OTHER: Target = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } };
    const caps = { status: 200, body: { version: 1, features: [] } };

    it('sends to the given computer, not the current one', async () => {
      boot();
      act(() => { setTarget(TARGET); });
      onFetch(() => caps);
      const { result } = renderHook(() => useRunOpen({ target: OTHER }));
      await act(flush);
      await act(async () => { await result.current!.capabilities(); });
      expect(calls[0]!.url).toMatch(/^https:\/\/p2-c2-run-1\.sv2\./);
    });
    it('with no current computer it still has a machine for the given one', async () => {
      boot();
      act(() => { setTarget(null); });
      const { result } = renderHook(() => useRunOpen({ target: OTHER }));
      await act(flush);
      expect(result.current).not.toBeNull();
    });
    it('target null: no machine even with a current computer', async () => {
      boot();
      act(() => { setTarget(TARGET); });
      const { result } = renderHook(() => useRunOpen({ target: null }));
      await act(flush);
      expect(result.current).toBeNull();
      expect(calls).toHaveLength(0);
    });
    it('a new Target object for the same computer keeps the machine', async () => {
      boot();
      const { result, rerender } = renderHook(({ t }) => useRunOpen({ target: t }), { initialProps: { t: { ...OTHER } as Target } });
      await act(flush);
      const first = result.current;
      expect(first).not.toBeNull();
      rerender({ t: { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } } });
      await act(flush);
      expect(result.current).toBe(first);
    });
    it('another computer: the old machine is never handed out again and its sends are refused unsent', async () => {
      boot();
      onFetch(() => caps);
      const seen: Array<unknown> = [];
      const { result, rerender } = renderHook(({ t }) => { const m = useRunOpen({ target: t }); seen.push(m); return m; }, { initialProps: { t: OTHER } });
      await act(flush);
      const old = result.current!;
      seen.length = 0;
      rerender({ t: TARGET });
      // The render right after the switch already hands out no machine for the old computer.
      expect(seen[0]).toBeNull();
      await act(flush);
      expect(result.current).not.toBeNull();
      expect(result.current).not.toBe(old);
      const n = calls.length;
      await act(async () => { await old.capabilities(); });
      expect(calls.length).toBe(n);
      await act(async () => { await result.current!.capabilities(); });
      expect(calls[n]!.url).toMatch(/^https:\/\/p1-c1-run-1\.sv1\./);
    });
  });
});
