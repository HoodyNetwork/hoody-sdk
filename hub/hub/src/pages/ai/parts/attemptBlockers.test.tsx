// useBlockedBy: a host passes a fresh list of the same stores each render; the hook subscribes once, not once a render.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useBlockedBy, type AttemptBlocker } from './attemptBlockers';

/** A store with a record map, counting its subscribes and unsubscribes. */
function store() {
  const rows = new Map<string, unknown>();
  const subs = new Set<() => void>();
  let v = 0;
  const s = {
    subscribes: 0,
    unsubscribes: 0,
    get: (k: string) => rows.get(k),
    subscribe(fn: () => void) { s.subscribes++; subs.add(fn); return () => { s.unsubscribes++; subs.delete(fn); }; },
    version: () => v,
    set(k: string, x: unknown) { rows.set(k, x); v++; for (const f of [...subs]) f(); },
  };
  return s satisfies AttemptBlocker & { set(k: string, x: unknown): void };
}

let seen: boolean[] = [];
function Host({ stores, k, tick }: { stores: AttemptBlocker[]; k: string | null; tick: number }) {
  void tick;
  seen.push(useBlockedBy([...stores], k));
  return null;
}

afterEach(() => { cleanup(); seen = []; });

describe('useBlockedBy', () => {
  it('subscribes once across re-renders that pass a fresh list of the same stores', () => {
    const a = store(), b = store();
    const { rerender } = render(<Host stores={[a, b]} k="x" tick={0} />);
    for (let i = 1; i <= 5; i++) rerender(<Host stores={[a, b]} k="x" tick={i} />);
    expect([a.subscribes, b.subscribes, a.unsubscribes, b.unsubscribes]).toEqual([1, 1, 0, 0]);
  });

  it('still re-renders and answers when a store gains or loses a record for the key', () => {
    const a = store(), b = store();
    render(<Host stores={[a, b]} k="x" tick={0} />);
    expect(seen.at(-1)).toBe(false);
    act(() => { b.set('x', { phase: 'unknown' }); });
    expect(seen.at(-1)).toBe(true);
    act(() => { b.set('x', undefined); });
    expect(seen.at(-1)).toBe(false);
    act(() => { a.set('other', 1); });
    expect(seen.at(-1)).toBe(false);
  });

  it('a different list of stores resubscribes: the old one is released, the new one heard', () => {
    const a = store(), b = store();
    const { rerender } = render(<Host stores={[a]} k="x" tick={0} />);
    rerender(<Host stores={[b]} k="x" tick={1} />);
    expect([a.subscribes, a.unsubscribes, b.subscribes, b.unsubscribes]).toEqual([1, 1, 1, 0]);
    act(() => { b.set('x', 1); });
    expect(seen.at(-1)).toBe(true);
    act(() => { a.set('x', 1); });
    expect(a.unsubscribes).toBe(1);
  });

  it('a list of the same length with one store replaced resubscribes: the replaced one is released, its successor heard', () => {
    const a = store(), b = store(), c = store();
    const { rerender } = render(<Host stores={[a, b]} k="x" tick={0} />);
    rerender(<Host stores={[a, c]} k="x" tick={1} />);
    expect([a.unsubscribes, b.unsubscribes, c.subscribes]).toEqual([1, 1, 1]);
    act(() => { c.set('x', 1); });
    expect(seen.at(-1)).toBe(true);
    act(() => { b.set('x', 1); });
    expect(b.unsubscribes).toBe(1);
  });

  it('a null key is never blocked, and unmount releases every subscription', () => {
    const a = store(), b = store();
    // A store that holds a record for every key it is asked about: only the null key itself keeps the answer false.
    const any: AttemptBlocker = { get: () => ({ phase: 'unknown' }), subscribe: () => () => {}, version: () => 0 };
    a.set('x', 1);
    const { unmount } = render(<Host stores={[a, b, any]} k={null} tick={0} />);
    expect(seen.at(-1)).toBe(false);
    unmount();
    expect([a.unsubscribes, b.unsubscribes]).toEqual([1, 1]);
  });
});
