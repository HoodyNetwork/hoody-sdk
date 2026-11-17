// The pause store: polling while a surface is on screen, gen ordering, one PUT at a
// time, a lost PUT answer is "may be" until a GET answers (never done, never failed), a refusal changes nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { agent } from '@core';
import { createPauseStore, type PauseStore } from './pause';

type Answer = Awaited<ReturnType<agent.PauseApi['get']>>;
const st = (paused: boolean, gen: number, since = paused ? 1000 : 0) => ({ paused, since_ms: since, gen });
const ok = (b: unknown): Answer => ({ ok: true, body: b });
const err = (kind: 'pending' | 'failed' | 'not_sent' | 'stale', status = 0, code = ''): Answer => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });

interface Fake { api: agent.PauseApi; gets: Array<(a: Answer) => void>; sets: Array<{ paused: boolean; answer: (a: Answer) => void }>; calls: string[] }
function fake(): Fake {
  const f: Fake = { gets: [], sets: [], calls: [], api: null as never };
  f.api = {
    get: () => { f.calls.push('get'); return new Promise<Answer>((r) => f.gets.push(r)); },
    set: (paused) => { f.calls.push(`set ${paused}`); return new Promise<Answer>((r) => f.sets.push({ paused, answer: r })); },
  };
  return f;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
let f: Fake;
let store: PauseStore;
let shown = true;
beforeEach(() => { vi.useFakeTimers(); f = fake(); shown = true; store = createPauseStore({ api: f.api, visible: () => shown }); });
afterEach(() => { store.reset(); vi.useRealTimers(); });
async function answerGet(a: Answer, i = f.gets.length - 1) { f.gets[i]!(a); await flush(); }

describe('reading', () => {
  it('the first hold reads at once; a second hold does not read again', async () => {
    store.hold();
    store.hold();
    expect(f.calls).toEqual(['get']);
    await answerGet(ok(st(true, 4)));
    expect(store.view().state).toEqual({ paused: true, sinceMs: 1000, gen: 4 });
  });
  it('polls every 30 s while held and shown, and stops when the last hold goes', async () => {
    const r1 = store.hold(), r2 = store.hold();
    await answerGet(ok(st(false, 1)));
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.calls).toEqual(['get', 'get']);
    await answerGet(ok(st(false, 1)));
    r1();
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.calls.length).toBe(3);
    await answerGet(ok(st(false, 1)));
    r2();
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.calls.length).toBe(3);
  });
  it('a hidden page does not poll; coming back reads at once; so does focus', async () => {
    store.hold();
    await answerGet(ok(st(false, 1)));
    shown = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.calls).toEqual(['get']);
    shown = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(f.calls).toEqual(['get', 'get']);
    await answerGet(ok(st(false, 1)));
    window.dispatchEvent(new Event('focus'));
    expect(f.calls).toEqual(['get', 'get', 'get']);
  });
  it('a read that answers while the page is hidden schedules nothing', async () => {
    store.hold();
    shown = false;
    await answerGet(ok(st(false, 1)));
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.calls).toEqual(['get']);
  });
  it('a failed read keeps the state held, says it could not read, retries soon, and clears when a read answers', async () => {
    store.hold();
    await answerGet(ok(st(true, 2)));
    await vi.advanceTimersByTimeAsync(30000);
    await answerGet(err('failed', 503, 'unavailable'));
    expect(store.view().state).toMatchObject({ paused: true });
    expect(store.view().error).toMatchObject({ code: 'unavailable', status: 503, of: 'read' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.calls.length).toBe(3);
    await answerGet(ok(st(true, 2)));
    expect(store.view().error).toBeNull();
  });
  it('an unreadable body is a failed read, not a state', async () => {
    store.hold();
    await answerGet(ok({ paused: 'yes' }));
    expect(store.view().state).toBeNull();
    expect(store.view().error).toMatchObject({ of: 'read', code: 'unreadable' });
  });
});

describe('gen ordering', () => {
  it('an older state (a late GET, an old event) is dropped; an equal or newer one is taken', async () => {
    store.hold();
    await answerGet(ok(st(true, 5)));
    store.apply({ paused: false, sinceMs: 0, gen: 4 });
    expect(store.view().state).toMatchObject({ paused: true, gen: 5 });
    store.apply({ paused: false, sinceMs: 0, gen: 6 });
    expect(store.view().state).toMatchObject({ paused: false, gen: 6 });
    store.apply({ paused: true, sinceMs: 9, gen: 6 }); // equal gen: taken
    expect(store.view().state).toMatchObject({ paused: true, sinceMs: 9, gen: 6 });
  });
  it('a GET that started before an event and answers after it cannot undo it', async () => {
    store.hold();
    await answerGet(ok(st(false, 1)));
    await vi.advanceTimersByTimeAsync(30000);
    store.apply({ paused: true, sinceMs: 9, gen: 2 });
    await answerGet(ok(st(false, 1)));
    expect(store.view().state).toMatchObject({ paused: true, gen: 2 });
  });
});

describe('set', () => {
  it('one PUT at a time: busy shows what is being done, a second press does nothing, the answer is the state', async () => {
    const p = store.set(true);
    expect(store.view().busy).toBe('pausing');
    void store.set(false);
    expect(f.calls).toEqual(['set true']);
    f.sets[0]!.answer(ok(st(true, 7)));
    await p;
    expect(store.view()).toMatchObject({ busy: null, unsure: null, error: null, state: { paused: true, gen: 7 } });
  });
  it('resume says resuming', async () => {
    void store.set(false);
    expect(store.view().busy).toBe('resuming');
  });
  it('a lost answer is "may be": unsure, the PUT is not sent again, a GET is, and its answer settles it', async () => {
    store.hold();
    await answerGet(ok(st(false, 1)));
    const p = store.set(true);
    f.sets[0]!.answer(err('pending'));
    await p;
    await flush();
    expect(store.view()).toMatchObject({ busy: null, unsure: { wanted: true }, state: { paused: false } });
    expect(f.calls).toEqual(['get', 'set true', 'get']);
    await answerGet(ok(st(true, 2)));
    expect(store.view()).toMatchObject({ unsure: null, state: { paused: true, gen: 2 } });
    expect(f.calls.filter((c) => c.startsWith('set')).length).toBe(1);
  });
  it('while unsure and the read keeps failing it stays unsure, retrying at 2, 5 and 10 s, and never resends', async () => {
    store.hold();
    await answerGet(ok(st(false, 1)));
    const p = store.set(true);
    f.sets[0]!.answer(err('pending'));
    await p;
    await flush();
    await answerGet(err('pending'));
    expect(store.view().unsure).toEqual({ wanted: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.gets.length).toBe(3);
    await answerGet(err('pending'));
    await vi.advanceTimersByTimeAsync(4999);
    expect(f.gets.length).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.gets.length).toBe(4);
    await answerGet(err('pending'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.gets.length).toBe(5);
    expect(store.view().unsure).toEqual({ wanted: true });
    expect(f.calls.filter((c) => c.startsWith('set')).length).toBe(1);
  });
  it('a 200 with an unreadable body is also "may be"', async () => {
    const p = store.set(true);
    f.sets[0]!.answer(ok({ nope: 1 }));
    await p;
    expect(store.view().unsure).toEqual({ wanted: true });
  });
  it('a refusal changes nothing: the state stays, the error says why, the next press clears it', async () => {
    store.hold();
    await answerGet(ok(st(false, 3)));
    const p = store.set(true);
    f.sets[0]!.answer(err('failed', 400, 'bad_request'));
    await p;
    expect(store.view()).toMatchObject({ busy: null, unsure: null, state: { paused: false, gen: 3 }, error: { code: 'bad_request', status: 400, of: 'set' } });
    void store.set(true);
    expect(store.view().error).toBeNull();
  });
  it('a request that was not sent is an error, never "may be"', async () => {
    const p = store.set(true);
    f.sets[0]!.answer(err('not_sent', 0, 'ROUTE_NOT_ALLOWED'));
    await p;
    expect(store.view()).toMatchObject({ unsure: null, error: { of: 'set', code: 'ROUTE_NOT_ALLOWED' } });
  });
  it('a stale answer (the page moved on) says nothing', async () => {
    const p = store.set(true);
    f.sets[0]!.answer(err('stale'));
    await p;
    expect(store.view()).toMatchObject({ busy: null, unsure: null, error: null });
  });
});

describe('reset', () => {
  it('forgets the view, stops the timer, and answers still on their way change nothing', async () => {
    store.hold();
    const p = store.set(true);
    store.reset();
    expect(store.view()).toEqual({ state: null, busy: null, unsure: null, error: null });
    f.sets[0]!.answer(ok(st(true, 9)));
    await p;
    await answerGet(ok(st(true, 9)));
    expect(store.view().state).toBeNull();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.gets.length).toBe(1);
  });
  it('subscribers are told of changes and can leave', async () => {
    const seen: number[] = [];
    const off = store.subscribe(() => seen.push(1));
    store.apply({ paused: true, sinceMs: 1, gen: 1 });
    off();
    store.apply({ paused: false, sinceMs: 0, gen: 2 });
    expect(seen.length).toBe(1);
  });
});

describe('requests that outlive what they were asked before', () => {
  it('a GET that started before a lost PUT cannot settle it; only a read started after can', async () => {
    store.hold();
    await answerGet(ok(st(false, 1)));
    void store.refresh(); // a poll's GET is out (gets[1])
    const p = store.set(true);
    f.sets[0]!.answer(err('pending'));
    await p;
    await flush();
    await answerGet(ok(st(false, 1)), 1); // the older GET answers with the old state
    expect(store.view().unsure).toEqual({ wanted: true });
    expect(f.gets.length).toBe(3); // the recovery read was queued behind it and has started
    await answerGet(err('pending'), 2);
    expect(store.view().unsure).toEqual({ wanted: true });
    await vi.advanceTimersByTimeAsync(2000);
    await answerGet(ok(st(true, 2)), f.gets.length - 1);
    expect(store.view()).toMatchObject({ unsure: null, state: { paused: true, gen: 2 } });
  });
  it('a read that was out before a reset cannot release the guard of the read after it', async () => {
    store.hold();
    store.reset();
    store.hold();
    expect(f.gets.length).toBe(2); // old (0) and new (1)
    await answerGet(ok(st(true, 7)), 0); // the old one answers: changes nothing and frees nothing
    expect(store.view().state).toBeNull();
    void store.refresh();
    await flush();
    expect(f.gets.length).toBe(2); // still one read out for this generation
    await answerGet(ok(st(false, 1)), 1);
    expect(store.view().state).toEqual({ paused: false, sinceMs: 0, gen: 1 });
  });
  it('after a reset no listener or poll wakes the discarded store; a release from before it counts for nothing', async () => {
    const old = store.hold();
    await answerGet(ok(st(false, 1)));
    store.reset();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.gets.length).toBe(1);
    const fresh = store.hold();
    expect(f.gets.length).toBe(2);
    old(); // must not take away the new hold
    await answerGet(ok(st(false, 1)));
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.gets.length).toBe(3);
    fresh();
  });
  it('retries at 2, 5 and 10 s, then falls back to the poll interval (30 s)', async () => {
    store.hold();
    await answerGet(err('pending'));
    await vi.advanceTimersByTimeAsync(2000); await answerGet(err('pending'));
    await vi.advanceTimersByTimeAsync(5000); await answerGet(err('pending'));
    await vi.advanceTimersByTimeAsync(10000); await answerGet(err('pending'));
    expect(f.gets.length).toBe(4);
    await vi.advanceTimersByTimeAsync(29999);
    expect(f.gets.length).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.gets.length).toBe(5);
  });
});
