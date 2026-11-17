// Vitest: useNotesKept().claim takes a computer's hold only over the value stored
// now, and never while the prefs are not open. 1c: the record says sending (with its time) until the send answers;
// move takes the claim to a new id only while it is still this create's, confirmed by the store.
// 1e: every end of a hold is one conditional change inside the update function (release: that note, not sending;
// settle: that note), so it is decided again when core applies it over another tab's newer value. core's usePrefUpdate is faked so its status and stored value are set here.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Kept } from './holds';

const pref = vi.hoisted(() => ({
  status: 'ok' as string,
  /** What the prefs hold now (another tab may have stored since the last render). */
  stored: { computer: '', holds: {} } as Kept,
  /** The value the hook last rendered. */
  shown: { computer: '', holds: {} } as Kept,
  updates: 0,
  /** The last change, as core keeps it to apply again over another tab's value. */
  last: null as null | ((v: Kept) => Kept),
}));
vi.mock('@core', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useRealms: () => ({ selected: '' }),
  usePrefUpdate: () => ({
    value: pref.shown,
    status: pref.status,
    update: (fn: (v: Kept) => Kept) => { pref.updates++; pref.last = fn; pref.stored = fn(pref.stored); return true; },
  }),
}));
const { BEAT_EVERY, BEAT_GRACE, CONFIRM_FOR, inFlight, parseKept, SENDING_FOR, useInFlight, useNotesKept } = await import('./holds');
const { routes } = await import('./routes');

const A = { id: 'a1b2c3d4e5f6a7b8c9d0e1f2', parentId: 'p', name: 'Mine' };
const B = { id: 'b2c3d4e5f6a7b8c9d0e1f2a3', parentId: 'p', name: 'Another tab' };
const empty = (): Kept => ({ computer: '', holds: {} });

beforeEach(() => { pref.status = 'ok'; pref.stored = empty(); pref.shown = empty(); pref.updates = 0; pref.last = null; });

describe('claim', () => {
  it.each(['loading', 'locked', 'saving', 'unsaved'])('prefs %s: refused, nothing written', async (st) => {
    pref.status = st;
    const { result } = renderHook(() => useNotesKept());
    await expect(result.current.claim('c1', A)).resolves.toBe(false);
    expect(pref.updates).toBe(0);
  });

  it('a hold in the rendered value: refused, nothing written', async () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: B } };
    const { result } = renderHook(() => useNotesKept());
    await expect(result.current.claim('c1', A)).resolves.toBe(false);
    expect(pref.updates).toBe(0);
  });

  it('another tab stored a hold since the render: refused, and its hold is not written over', async () => {
    pref.stored = { computer: '', holds: { c1: B } };
    const { result } = renderHook(() => useNotesKept());
    await expect(result.current.claim('c1', A)).resolves.toBe(false);
    expect(pref.stored.holds.c1).toEqual(B);
  });

  it('free: written, and won once the store renders it held with this note', async () => {
    const { result, rerender } = renderHook(() => useNotesKept());
    let won: boolean | undefined;
    void result.current.claim('c1', A).then((v) => { won = v; });
    expect(pref.stored.holds.c1).toMatchObject({ ...A, phase: 'sending' });
    expect(inFlight(pref.stored.holds.c1)).toBe(true);
    await act(async () => { pref.shown = pref.stored; rerender(); });
    expect(won).toBe(true);
  });

  it('free when written, but the store renders another note held (another tab won): not won', async () => {
    const { result, rerender } = renderHook(() => useNotesKept());
    let won: boolean | undefined;
    void result.current.claim('c1', A).then((v) => { won = v; });
    await act(async () => { pref.shown = { computer: '', holds: { c1: B } }; rerender(); });
    expect(won).toBe(false);
  });
});

describe('move (a 409: the claim to the new id)', () => {
  const N = { id: 'c3d4e5f6a7b8c9d0e1f2a3b4', parentId: 'p', name: 'Mine' };
  it('still this create\'s: moved, marked sending, won once the store renders the new id', async () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: A } };
    const { result, rerender } = renderHook(() => useNotesKept());
    let won: boolean | undefined;
    void result.current.move('c1', A.id, N).then((v) => { won = v; });
    expect(pref.stored.holds.c1).toMatchObject({ ...N, phase: 'sending' });
    expect(won).toBeUndefined();
    await act(async () => { pref.shown = pref.stored; rerender(); });
    expect(won).toBe(true);
  });

  it('replaced by another tab: refused at once, nothing written over it', async () => {
    pref.shown = { computer: '', holds: { c1: A } };
    pref.stored = { computer: '', holds: { c1: B } };
    const { result } = renderHook(() => useNotesKept());
    await expect(result.current.move('c1', A.id, N)).resolves.toBe(false);
    expect(pref.stored.holds.c1).toEqual(B);
  });

  it('answered: the record stops saying sending, only for that note', () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: { ...A, phase: 'sending', sentAt: Date.now() } } };
    const { result } = renderHook(() => useNotesKept());
    act(() => { result.current.answered('c1', B.id); });
    expect(pref.stored.holds.c1?.phase).toBe('sending');
    act(() => { result.current.answered('c1', A.id); });
    expect(pref.stored.holds.c1).toEqual(A);
  });
});

describe('the sending record', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('stamped before its confirmation, it still reads in flight for a confirmation that took all its time and a request that took all its own', () => {
    const now = Date.now();
    const wait = CONFIRM_FOR + (routes.create.timeoutMs ?? 0) - 1;
    expect(routes.create.timeoutMs).toBeGreaterThan(0);
    expect(inFlight({ ...A, phase: 'sending', sentAt: now - wait }, now)).toBe(true);
    expect(SENDING_FOR).toBeGreaterThan(CONFIRM_FOR + (routes.create.timeoutMs ?? 0));
  });
  it('parseKept keeps phase and sentAt only when both are sound', () => {
    const k = parseKept({ holds: { c1: { ...A, phase: 'sending', sentAt: 5 }, c2: { ...B, phase: 'sending', sentAt: 'x' }, c3: { ...B, phase: 'other', sentAt: 5 } } });
    expect(k.holds.c1).toEqual({ ...A, phase: 'sending', sentAt: 5 });
    expect(k.holds.c2).toEqual(B);
    expect(k.holds.c3).toEqual(B);
  });

  it('reads in flight until the create timeout passes (and not for a time further ahead than SENDING_FOR), then renders again as unknown', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    // Its own ids: the page remembers per id the stamps it read.
    const C = { ...A, id: 'c3d4e5f6a7b8c9d0e1f2a3b4' };
    const now = Date.now();
    const m = Math.round(performance.now());
    // A stamp this far from the clock reads out only for BEAT_GRACE after this page first reads it (a clock jump may
    // have come just before; a live sender's next beat would come by then), not longer.
    for (const [i, at] of [now + SENDING_FOR, now + 10 * SENDING_FOR, now - SENDING_FOR].entries()) {
      const R = { ...C, id: `c${i}d4e5f6a7b8c9d0e1f2a3b4`.slice(0, 24), phase: 'sending' as const, sentAt: at };
      expect(inFlight(R, now, m)).toBe(true);
      expect(inFlight(R, now, m + BEAT_GRACE - 1)).toBe(true);
      expect(inFlight(R, now, m + BEAT_GRACE)).toBe(false);
    }
    const D = { ...A, id: 'd4e5f6a7b8c9d0e1f2a3b4c5' };
    const { result } = renderHook(() => useInFlight({ ...D, phase: 'sending', sentAt: now }));
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(SENDING_FOR - 10); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(20); });
    expect(result.current).toBe(false);
  });
});

describe('a clock change during a send', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('a stamp ahead of now (the clock went back mid-send) still reads in flight, and ends SENDING_FOR after its stamp', () => {
    const now = Date.now();
    const m = Math.round(performance.now());
    const ahead = { ...A, id: 'e5f6a7b8c9d0e1f2a3b4c5d6', phase: 'sending' as const, sentAt: now + 20_000 };
    // Read as the wall and monotonic clocks run together from here.
    expect(inFlight(ahead, now, m)).toBe(true);
    expect(inFlight(ahead, now + 20_000 + SENDING_FOR - 1, m + 20_000 + SENDING_FOR - 1)).toBe(true);
    expect(inFlight(ahead, now + 20_000 + SENDING_FOR, m + 20_000 + SENDING_FOR)).toBe(false);
  });

  it('the clock goes back while a deferred send waits: the hook keeps it in flight, and frees it once its time is up', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const start = Date.now();
    const rec = { ...A, id: 'f6a7b8c9d0e1f2a3b4c5d6e7', phase: 'sending' as const, sentAt: start };
    const { result } = renderHook(() => useInFlight(rec));
    expect(result.current).toBe(true);
    // The wall clock jumps 20 s back; the timer (monotonic) still fires at its first deadline.
    act(() => { vi.setSystemTime(start - 20_000); });
    act(() => { vi.advanceTimersByTime(SENDING_FOR + 1); });
    // Now the wall clock reads start - 20 s + SENDING_FOR: still within SENDING_FOR of the stamp.
    expect(result.current).toBe(true);
    // Its timer was set again: it frees the record once the wall clock passes the stamp's end.
    act(() => { vi.advanceTimersByTime(20_000 + 10); });
    expect(result.current).toBe(false);
  });
});

describe('resend (Send again of a held create)', () => {
  it('held and not out: marked sending, won once the store renders it', async () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: A } };
    const { result, rerender } = renderHook(() => useNotesKept());
    let won: boolean | undefined;
    void result.current.resend('c1', A).then((v) => { won = v; });
    expect(pref.stored.holds.c1).toMatchObject({ ...A, phase: 'sending' });
    await act(async () => { pref.shown = pref.stored; rerender(); });
    expect(won).toBe(true);
  });

  it('another note held, none held, or its send out elsewhere: refused, nothing written over it', async () => {
    const out = { ...A, phase: 'sending' as const, sentAt: Date.now() };
    for (const now of [{ c1: B }, {}, { c1: out }] as Array<Kept['holds']>) {
      pref.shown = pref.stored = { computer: '', holds: now };
      const { result } = renderHook(() => useNotesKept());
      await expect(result.current.resend('c1', A)).resolves.toBe(false);
      expect(pref.stored.holds).toEqual(now);
    }
  });
});

describe('release and settle: decided inside the update, again on every rebase', () => {
  const sendingA = () => ({ ...A, phase: 'sending' as const, sentAt: Date.now() });
  it('release: only that note, and never a sending record', () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: A, c2: sendingA() } };
    const { result } = renderHook(() => useNotesKept());
    act(() => { result.current.release('c1', B.id); });
    expect(pref.stored.holds.c1).toEqual(A);
    act(() => { result.current.release('c2', A.id); });
    expect(pref.stored.holds.c2?.phase).toBe('sending');
    act(() => { result.current.release('c1', A.id); });
    expect(pref.stored.holds.c1).toBeUndefined();
  });

  it('a release applied again over another tab that started sending the same note keeps the sending hold', () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: A } };
    const { result } = renderHook(() => useNotesKept());
    act(() => { result.current.release('c1', A.id); });
    expect(pref.stored.holds.c1).toBeUndefined();
    // Another tab stored first: core applies the same change again over that tab's value.
    const theirs: Kept = { computer: '', holds: { c1: sendingA() } };
    pref.stored = pref.last!(theirs);
    expect(pref.stored.holds.c1).toMatchObject({ id: A.id, phase: 'sending' });
  });

  it('a release applied again over another tab that holds a different note keeps that note', () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: A } };
    const { result } = renderHook(() => useNotesKept());
    act(() => { result.current.release('c1', A.id); });
    pref.stored = pref.last!({ computer: '', holds: { c1: B } });
    expect(pref.stored.holds.c1).toEqual(B);
  });

  it("settle: the sender's own note goes, its sending record included; another note stays", () => {
    pref.shown = pref.stored = { computer: '', holds: { c1: sendingA() } };
    const { result } = renderHook(() => useNotesKept());
    act(() => { result.current.settle('c1', B.id); });
    expect(pref.stored.holds.c1?.id).toBe(A.id);
    act(() => { result.current.settle('c1', A.id); });
    expect(pref.stored.holds.c1).toBeUndefined();
    pref.stored = pref.last!({ computer: '', holds: { c1: B } });
    expect(pref.stored.holds.c1).toEqual(B);
  });
});

describe('the beat', () => {
  const FAKE: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] };
  afterEach(() => { vi.useRealTimers(); });
  // Each case reads its own note id: the page remembers per id what it read last.
  const note = (n: number) => ({ id: `beat${String(n).padStart(3, '0')}0000000000000000000`.slice(0, 24), parentId: 'p', name: 'Beat' });

  it('the sender stamps its record again every BEAT_EVERY while it is out, and stops when it settles', async () => {
    vi.useFakeTimers(FAKE);
    const N = note(1);
    const { result } = renderHook(() => useNotesKept());
    void result.current.claim('c1', N);
    const first = pref.stored.holds.c1?.sentAt ?? 0;
    act(() => { vi.advanceTimersByTime(BEAT_EVERY); });
    expect(pref.stored.holds.c1?.sentAt).toBe(first + BEAT_EVERY);
    act(() => { result.current.settle('c1', N.id); });
    const n = pref.updates;
    act(() => { vi.advanceTimersByTime(5 * BEAT_EVERY); });
    expect(pref.updates).toBe(n);
    expect(pref.stored.holds.c1).toBeUndefined();
  });

  it('stops when the send answered unknown, and never stamps another note\'s record', () => {
    vi.useFakeTimers(FAKE);
    const N = note(2);
    const { result } = renderHook(() => useNotesKept());
    void result.current.claim('c1', N);
    // Another tab's note takes the computer: the beat leaves its record as it is.
    const theirs = { ...B, phase: 'sending' as const, sentAt: 7 };
    pref.stored = { computer: '', holds: { c1: theirs } };
    act(() => { vi.advanceTimersByTime(BEAT_EVERY); });
    expect(pref.stored.holds.c1).toEqual(theirs);
    pref.stored = { computer: '', holds: { c1: { ...N, phase: 'sending', sentAt: 9 } } };
    act(() => { result.current.answered('c1', N.id); });
    const n = pref.updates;
    act(() => { vi.advanceTimersByTime(5 * BEAT_EVERY); });
    expect(pref.updates).toBe(n);
    expect(pref.stored.holds.c1).toEqual(N);
  });

  it('a refused claim starts no beat, and a beat ends SENDING_FOR after its start or when the hook unmounts', async () => {
    vi.useFakeTimers(FAKE);
    pref.stored = { computer: '', holds: { c1: B } };
    const one = renderHook(() => useNotesKept());
    await act(async () => { await one.result.current.claim('c1', note(3)); });
    let n = pref.updates;
    act(() => { vi.advanceTimersByTime(3 * BEAT_EVERY); });
    expect(pref.updates).toBe(n);
    pref.stored = empty();
    let won: boolean | undefined;
    void one.result.current.claim('c2', note(4)).then((v) => { won = v; });
    await act(async () => { pref.shown = pref.stored; one.rerender(); });
    expect(won).toBe(true);
    act(() => { vi.advanceTimersByTime(BEAT_EVERY); });
    expect(pref.stored.holds.c2?.phase).toBe('sending');
    act(() => { vi.advanceTimersByTime(SENDING_FOR); });
    n = pref.updates;
    act(() => { vi.advanceTimersByTime(3 * BEAT_EVERY); });
    expect(pref.updates).toBe(n);
    void one.result.current.claim('c3', note(5));
    one.unmount();
    n = pref.updates;
    act(() => { vi.advanceTimersByTime(3 * BEAT_EVERY); });
    expect(pref.updates).toBe(n);
  });

  it('the wall clock jumps forward or back by more than SENDING_FOR during a beating send: it stays in flight', () => {
    vi.useFakeTimers(FAKE);
    for (const [i, jump] of [[6, 10 * SENDING_FOR], [7, -10 * SENDING_FOR]] as const) {
      const N = note(i);
      const t0 = Date.now();
      const m0 = Math.round(performance.now());
      expect(inFlight({ ...N, phase: 'sending', sentAt: t0 }, t0, m0)).toBe(true);
      // Just after the jump, before the next beat: the old stamp is far from the wall clock, read 1 s later.
      expect(inFlight({ ...N, phase: 'sending', sentAt: t0 }, t0 + jump, m0 + 1_000)).toBe(true);
      // The beat stamps it by the new clock: read through the wall clock again.
      const beat = t0 + jump + BEAT_EVERY;
      expect(inFlight({ ...N, phase: 'sending', sentAt: beat }, beat, m0 + BEAT_EVERY)).toBe(true);
      // The sender is gone (no more beats): it ends SENDING_FOR after its last stamp, by either clock.
      expect(inFlight({ ...N, phase: 'sending', sentAt: beat }, beat + SENDING_FOR - 1, m0 + BEAT_EVERY + SENDING_FOR - 1)).toBe(true);
      expect(inFlight({ ...N, phase: 'sending', sentAt: beat }, beat + SENDING_FOR, m0 + BEAT_EVERY + SENDING_FOR)).toBe(false);
    }
  });

  it('a record a closed tab left, read later: out for BEAT_GRACE after this page first reads it, then free, as each new stamp', () => {
    const N = note(8);
    const t = Date.now();
    const m = Math.round(performance.now());
    const old = { ...N, phase: 'sending' as const, sentAt: t - 5 * SENDING_FOR };
    expect(inFlight(old, t, m)).toBe(true);
    expect(inFlight(old, t + BEAT_GRACE, m + BEAT_GRACE)).toBe(false);
    const ahead = { ...N, phase: 'sending' as const, sentAt: t + 5 * SENDING_FOR };
    expect(inFlight(ahead, t + BEAT_GRACE, m + BEAT_GRACE)).toBe(true);
    expect(inFlight(ahead, t + 2 * BEAT_GRACE, m + 2 * BEAT_GRACE)).toBe(false);
  });

  it('a reader that first reads the record just after a clock jump holds it, and the next beat keeps it out', () => {
    for (const [i, jump] of [[10, 10 * SENDING_FOR], [11, -10 * SENDING_FOR]] as const) {
      const N = note(i);
      const t0 = Date.now();
      const m0 = Math.round(performance.now());
      // Stamped at t0 by the sender; the clock jumps; this page reads it for the first time 1 s later.
      expect(inFlight({ ...N, phase: 'sending', sentAt: t0 }, t0 + jump + 1_000, m0 + 1_000)).toBe(true);
      // Its sender's next beat (by the new clock) comes before BEAT_GRACE runs out.
      const beat = t0 + jump + BEAT_EVERY;
      expect(inFlight({ ...N, phase: 'sending', sentAt: t0 }, beat - 1, m0 + BEAT_EVERY - 1)).toBe(true);
      expect(inFlight({ ...N, phase: 'sending', sentAt: beat }, beat, m0 + BEAT_EVERY)).toBe(true);
    }
  });

  it('a sender seen live closes, then the clock jumps forward: the record frees within BEAT_GRACE', () => {
    const N = note(12);
    const t0 = Date.now();
    const m0 = Math.round(performance.now());
    const rec = { ...N, phase: 'sending' as const, sentAt: t0 };
    expect(inFlight(rec, t0 + 1_000, m0 + 1_000)).toBe(true);
    expect(inFlight(rec, t0 + 10 * SENDING_FOR, m0 + 1_000 + BEAT_GRACE - 1)).toBe(true);
    expect(inFlight(rec, t0 + 10 * SENDING_FOR, m0 + 1_000 + BEAT_GRACE)).toBe(false);
  });

  it('rendered: a closed sender, then the clock jumps forward: the shown hold clears within BEAT_GRACE, with no store change', () => {
    vi.useFakeTimers(FAKE);
    const N = note(14);
    const rec = { ...N, phase: 'sending' as const, sentAt: Date.now() };
    const { result } = renderHook(() => useInFlight(rec));
    expect(result.current).toBe(true);
    // Its sender is gone: no beat comes. 10 s on, the wall clock jumps far forward.
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current).toBe(true);
    act(() => { vi.setSystemTime(Date.now() + 10 * SENDING_FOR); });
    act(() => { vi.advanceTimersByTime(BEAT_GRACE); });
    expect(result.current).toBe(false);
  });

  it('rendered: a stamp far ahead (the clock went back after a closed sender) clears BEAT_GRACE after it is first shown', () => {
    vi.useFakeTimers(FAKE);
    const N = note(15);
    const rec = { ...N, phase: 'sending' as const, sentAt: Date.now() + 10 * SENDING_FOR };
    const { result } = renderHook(() => useInFlight(rec));
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(BEAT_GRACE - 10); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(20); });
    expect(result.current).toBe(false);
  });

  it('a refused Send again (the send is out) leaves the sender\'s beat running', async () => {
    vi.useFakeTimers(FAKE);
    const N = note(13);
    const { result, rerender } = renderHook(() => useNotesKept());
    let won: boolean | undefined;
    void result.current.claim('c1', N).then((v) => { won = v; });
    await act(async () => { pref.shown = pref.stored; rerender(); });
    expect(won).toBe(true);
    // Send again of the same note while it is out: refused, nothing written by it.
    const n = pref.updates;
    await act(async () => { await expect(result.current.resend('c1', N)).resolves.toBe(false); });
    expect(pref.updates).toBe(n + 1);
    const before = pref.stored.holds.c1?.sentAt ?? 0;
    act(() => { vi.advanceTimersByTime(BEAT_EVERY); });
    expect(pref.stored.holds.c1?.sentAt).toBe(before + BEAT_EVERY);
    act(() => { result.current.settle('c1', N.id); });
  });

  it('a jump during a beating send: the reader hook stays in flight across it and frees SENDING_FOR after the last beat', () => {
    vi.useFakeTimers(FAKE);
    const N = note(9);
    let rec = { ...N, phase: 'sending' as const, sentAt: Date.now() };
    const { result, rerender } = renderHook(() => useInFlight(rec));
    expect(result.current).toBe(true);
    act(() => { vi.setSystemTime(Date.now() + 10 * SENDING_FOR); });
    act(() => { vi.advanceTimersByTime(BEAT_EVERY); });
    rec = { ...rec, sentAt: Date.now() };
    rerender();
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(SENDING_FOR - 10); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(20); });
    expect(result.current).toBe(false);
  });
});
