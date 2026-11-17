// Vitest: the live list after a computer switch. An action that awaited across the switch still holds
// the old refetch: its read answers that caller with the old computer's rows (a check proves a change against the
// computer it was sent to), but it never cancels the new computer's read and never puts the old rows on the page. The
// account, the realm and the generation count as the computer does: the account can change with no generation bump.
// Coming back to an earlier computer (A → B → A) does not make a refetch held from the first visit current again, no
// render ever returns another context's rows, a refetch of the new computer made between its commit and the passive
// effects is not aborted, and StrictMode's effect replay still leaves a live read. Not covered by these tests (renderHook
// runs render and commit together inside act): a render React discards, and a read settling between the render of a new
// context and its commit. The hook moves its current `load` only at commit and checks it again when a read ends, and
// rows are returned only for the context they were read for, so neither shows rows under the new context.
import { act, renderHook } from '@app/testing';
import { StrictMode, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Load = { computer: string; signal: AbortSignal; resolve: (v: object) => void; reject: (e: unknown) => void };
const ctl = vi.hoisted(() => ({ target: 'A' as string | null, gen: 1, account: 'u1', realm: 'all', loads: [] as Load[] }));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    fixtureModeActive: () => false,
    useCore: () => ({ gen: ctl.gen, account: ctl.account, realm: ctl.realm }),
    useCurrentComputer: () => (ctl.target === null ? null : { container: { id: ctl.target } }),
    capture: (t?: { container: { id: string } } | null) => ({ computer: t?.container.id ?? '' }),
    api: async (_route: unknown, input: { ctx: { computer: string }; signal: AbortSignal }) => input,
    version: async () => ({}),
  };
});
vi.mock('./live', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadSchedules: async (call: (name: string) => Promise<{ ctx: { computer: string }; signal: AbortSignal }>) => {
    const inp = await call('overview');
    return new Promise((resolve, reject) => ctl.loads.push({ computer: inp.ctx.computer, signal: inp.signal, resolve, reject }));
  },
}));

const { useSchedules } = await import('./data');

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const answer = async (l: Load | undefined, tag: string) => {
  await act(async () => {
    l?.resolve({ tag });
    await Promise.resolve();
  });
};
type Data = { computer: string; tag: string } | undefined;
const shown = (r: { current: { data: unknown } }) => r.current.data as Data;

afterEach(() => {
  ctl.target = 'A';
  ctl.gen = 1;
  ctl.account = 'u1';
  ctl.realm = 'all';
  ctl.loads = [];
});

describe('schedules list: a late refetch after a computer switch', () => {
  it('a stale refetch neither cancels the new computer\'s read nor shows the old rows, yet answers its caller with them', async () => {
    const { result, rerender } = renderHook(() => useSchedules());
    await settle();
    expect(ctl.loads.map((l) => l.computer)).toEqual(['A']);
    await answer(ctl.loads[0], 'A1');
    expect(shown(result)).toMatchObject({ computer: 'A', tag: 'A1' });

    const stale = result.current.refetch;
    ctl.target = 'B';
    rerender();
    await settle();
    expect(shown(result)).toBeUndefined();
    const forB = ctl.loads[1];
    expect(forB?.computer).toBe('B');

    let back: { data?: unknown } | undefined;
    await act(async () => {
      void stale().then((r) => (back = r));
      await Promise.resolve();
      await Promise.resolve();
    });
    const lateA = ctl.loads[2];
    expect(lateA?.computer).toBe('A');
    expect(forB?.signal.aborted).toBe(false);

    await answer(lateA, 'A2');
    await settle();
    expect(back?.data).toMatchObject({ computer: 'A', tag: 'A2' });
    expect(shown(result)).toBeUndefined();

    await answer(forB, 'B1');
    expect(shown(result)).toMatchObject({ computer: 'B', tag: 'B1' });
  });

  it('a stale refetch whose read fails leaves the new computer\'s list alone', async () => {
    const { result, rerender } = renderHook(() => useSchedules());
    await settle();
    const stale = result.current.refetch;
    ctl.target = 'B';
    rerender();
    await settle();
    await answer(ctl.loads[1], 'B1');
    await act(async () => {
      void stale();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      ctl.loads[2]?.reject(new Error('boom'));
      await Promise.resolve();
    });
    await settle();
    expect(shown(result)).toMatchObject({ computer: 'B', tag: 'B1' });
    expect(result.current.error).toBeNull();
  });

  it('the current refetch is unchanged: it replaces the read in flight and shows its own answer', async () => {
    const { result } = renderHook(() => useSchedules());
    await settle();
    const first = ctl.loads[0];
    await act(async () => {
      void result.current.refetch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(first?.signal.aborted).toBe(true);
    await answer(first, 'A-old');
    expect(shown(result)).toBeUndefined();
    await answer(ctl.loads[1], 'A-new');
    expect(shown(result)).toMatchObject({ computer: 'A', tag: 'A-new' });
  });

  it('a refetch held from a first visit to A stays detached after A → B → A', async () => {
    const { result, rerender } = renderHook(() => useSchedules());
    await settle();
    await answer(ctl.loads[0], 'A1');
    const held = result.current.refetch;
    ctl.target = 'B';
    rerender();
    await settle();
    ctl.target = 'A';
    rerender();
    await settle();
    const again = ctl.loads[2];
    expect(again?.computer).toBe('A');
    let back: { data?: unknown } | undefined;
    await act(async () => {
      void held().then((r) => (back = r));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(again?.signal.aborted).toBe(false);
    await answer(ctl.loads[3], 'A-held');
    await settle();
    expect(back?.data).toMatchObject({ computer: 'A', tag: 'A-held' });
    expect(shown(result)).toBeUndefined();
    await answer(again, 'A2');
    expect(shown(result)).toMatchObject({ computer: 'A', tag: 'A2' });
  });

  it('a refetch of the new computer made right after the switch commits stands: no cleanup or start aborts it', async () => {
    let fire = false;
    let back: { data?: unknown } | undefined;
    const { result, rerender } = renderHook(() => {
      const r = useSchedules();
      // Runs after the commit and before the passive effects: the old computer's cleanup and the new one's start.
      useLayoutEffect(() => {
        if (!fire) return;
        fire = false;
        void r.refetch().then((x) => (back = x));
      });
      return r;
    });
    await settle();
    await answer(ctl.loads[0], 'A1');
    ctl.target = 'B';
    fire = true;
    rerender();
    await settle();
    const forB = ctl.loads[1];
    expect(forB?.computer).toBe('B');
    expect(ctl.loads).toHaveLength(2);
    expect(forB?.signal.aborted).toBe(false);
    await answer(forB, 'B1');
    await settle();
    expect(back?.data).toMatchObject({ computer: 'B', tag: 'B1' });
    expect(shown(result)).toMatchObject({ computer: 'B', tag: 'B1' });
  });

  it.each([
    ['never settles', false],
    ['rejects later', true],
  ])('under StrictMode\'s effect replay a live read still runs and fills the list (the aborted first read %s)', async (_name, rejects) => {
    const { result } = renderHook(() => useSchedules(), { wrapper: StrictMode });
    await settle();
    const aborted = ctl.loads.filter((l) => l.signal.aborted);
    const live = ctl.loads.filter((l) => !l.signal.aborted);
    expect(aborted).toHaveLength(1);
    expect(live).toHaveLength(1);
    if (rejects) {
      await act(async () => {
        aborted[0]?.reject(new DOMException('aborted', 'AbortError'));
        await Promise.resolve();
      });
      await settle();
      expect(result.current.error).toBeNull();
      expect(live[0]?.signal.aborted).toBe(false);
      expect(ctl.loads).toHaveLength(2);
    }
    await answer(live[0], 'A1');
    expect(shown(result)).toMatchObject({ computer: 'A', tag: 'A1' });
  });

  it('no render returns the old computer\'s rows, not even the first render after the switch', async () => {
    const seen: { target: string | null; computer: string | undefined }[] = [];
    const { rerender } = renderHook(() => {
      const r = useSchedules();
      seen.push({ target: ctl.target, computer: (r.data as Data)?.computer });
      return r;
    });
    await settle();
    await answer(ctl.loads[0], 'A1');
    expect(seen.at(-1)).toEqual({ target: 'A', computer: 'A' });
    ctl.target = 'B';
    rerender();
    await settle();
    const afterSwitch = seen.filter((r) => r.target === 'B');
    expect(afterSwitch.length).toBeGreaterThan(0);
    expect(afterSwitch.every((r) => r.computer === undefined)).toBe(true);
  });

  it.each([
    ['an account change with no generation bump', () => (ctl.account = 'u2')],
    ['a realm change', () => (ctl.realm = '0123456789abcdef01234567')],
  ])('%s reads again and makes the old refetch stale', async (_name, change) => {
    const { result, rerender } = renderHook(() => useSchedules());
    await settle();
    const stale = result.current.refetch;
    change();
    rerender();
    await settle();
    expect(shown(result)).toBeUndefined();
    expect(ctl.loads[0]?.signal.aborted).toBe(true);
    const fresh = ctl.loads[1];
    expect(fresh?.computer).toBe('A');
    await act(async () => {
      void stale();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fresh?.signal.aborted).toBe(false);
    await answer(ctl.loads[2], 'A-stale');
    await settle();
    expect(shown(result)).toBeUndefined();
    await answer(fresh, 'A-new');
    expect(shown(result)).toMatchObject({ tag: 'A-new' });
  });

  it('a generation change makes the old refetch stale too', async () => {
    const { result, rerender } = renderHook(() => useSchedules());
    await settle();
    await answer(ctl.loads[0], 'A1');
    const stale = result.current.refetch;
    ctl.gen = 2;
    rerender();
    await settle();
    const fresh = ctl.loads[1];
    await act(async () => {
      void stale();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fresh?.signal.aborted).toBe(false);
    await answer(ctl.loads[2], 'A-stale');
    await settle();
    expect(shown(result)).toBeUndefined();
    await answer(fresh, 'A-gen2');
    expect(shown(result)).toMatchObject({ tag: 'A-gen2' });
  });
});
