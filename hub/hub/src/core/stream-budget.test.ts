// stream-budget.ts: at most 8 agent SSE streams per computer per browser, every kind counted, slots taken as
// Web Locks (ifAvailable), the change feed never preempted, aggregate demand per stream.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { resumableStream } from './stream-resume';
import { createStreamBudget, type Grant, type ModeInfo, type StreamBudget, type StreamKind, type Rank } from './stream-budget';
import { boot, R1, TARGET } from './test/env';
import { installWebLocks, type WebLocks } from './test/web-locks';
import { removeTestLocks } from './test/locks';

const C = 'p1-c1';
// Every case runs on the fake clock (installed before the locks and the budget): the budget's timers, the fake locks' turns
// and these waits share it, so a case runs the steps it would on an idle machine whatever the host load, without sleeping.
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(2); };

let locks: WebLocks;
let budget: StreamBudget;
beforeEach(() => { vi.useFakeTimers(); locks = installWebLocks(); budget = createStreamBudget({ retryMs: 30, cutWaitMs: 80, reserve: 0 }); });
// The tests below use reserve 0 (all 8 locks open to every kind) unless they build their own budget: the reserved-lock
// rule has its own describe at the end (`reserved`).
afterEach(() => { budget.reset(); vi.useRealTimers(); installTransport(null); });

interface Probe { opened: number; closed: number; grant: Grant | null; modes: ModeInfo[] }
function spec(key: string, o: { kind?: StreamKind; rank?: Rank; computer?: string; level?: 'stream' | 'state' | 'off' } = {}) {
  const p: Probe = { opened: 0, closed: 0, grant: null, modes: [] };
  const s = {
    computer: o.computer ?? C, key, kind: o.kind ?? 'session', level: o.level ?? 'stream', rank: o.rank,
    open: (g: Grant) => { p.opened++; p.grant = g; return { close: () => { p.closed++; } }; },
    onMode: (m: ModeInfo) => p.modes.push(m),
  };
  return { p, s };
}
function watch(key: string, o: Parameters<typeof spec>[1] = {}) {
  const { p, s } = spec(key, o);
  const w = budget.watch(s);
  return { p, w };
}
/** Waits for a state instead of a number of timer turns (a stalled machine runs the same steps, only later). Fails
 *  naming the state if it is not reached in `ms`, so a prerequisite that never came cannot pass silently. */
async function until(cond: () => boolean, what: string, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  let ok = cond();
  while (!ok && Date.now() < end) {
    await vi.advanceTimersByTimeAsync(1);
    ok = cond();
  }
  if (!ok) throw new Error(`until: ${what} was not reached in ${ms} ms`);
}
const heldNames = () => locks.held().map((h) => h.name).sort();
/** Runs `act` once, on a microtask right after the first lock request made from now on (the retry's lock request) and
 *  before any answer: the fake locks answer each request on a later timer turn, so this is "while the retry's requests
 *  are being answered" whatever the speed of the machine (a wall-clock wait is not). `fired()` says whether it ran. */
function afterNextLockRequest(act: () => void): { fired(): boolean } {
  const l = navigator.locks as unknown as { request: (...a: unknown[]) => Promise<unknown> };
  const real = l.request;
  let ran = false;
  l.request = (...a: unknown[]) => {
    l.request = real;
    queueMicrotask(() => { ran = true; act(); });
    return real(...a);
  };
  return { fired: () => ran };
}

describe('slots: Web Locks, ifAvailable, one per stream', () => {
  it('a stream holds hoody-agent-stream:<computer>:<n> for its life and frees it on release', async () => {
    const a = watch('s1');
    await settle();
    expect(a.p.opened).toBe(1);
    expect(a.w.mode()).toEqual({ mode: 'stream' });
    expect(heldNames()).toEqual([`hoody-agent-stream:${C}:1`]);
    a.w.release();
    await settle();
    expect(a.p.closed).toBe(1);
    expect(heldNames()).toEqual([]);
  });
  it('the 9th stream of equal rank degrades (budget), and gets a slot when one is released', async () => {
    const ws = Array.from({ length: 9 }, (_, i) => watch(`s${i}`));
    await settle(12);
    expect(ws.slice(0, 8).every((x) => x.w.mode().mode === 'stream')).toBe(true);
    expect(ws[8]!.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
    expect(ws[8]!.p.opened).toBe(0);
    expect(locks.held().length).toBe(8);
    ws[0]!.w.release();
    await settle(12);
    expect(ws[8]!.w.mode()).toEqual({ mode: 'stream' });
    expect(locks.held().length).toBe(8);
  });
  it('every kind counts: sessions, the change feed, Bot log streams and Bot session streams', async () => {
    const ks: StreamKind[] = ['session', 'session', 'session', 'changes', 'bot-log', 'bot-log', 'bot-session', 'bot-session'];
    const ws = ks.map((k, i) => watch(`k${i}`, { kind: k }));
    const extra = watch('x', { kind: 'bot-session' });
    await settle(12);
    expect(ws.every((x) => x.w.mode().mode === 'stream')).toBe(true);
    expect(extra.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
  });
  it('computers are separate budgets', async () => {
    const a = Array.from({ length: 8 }, (_, i) => watch(`a${i}`));
    const b = watch('b0', { computer: 'p1-c2' });
    await settle(12);
    expect(b.w.mode()).toEqual({ mode: 'stream' });
    expect(heldNames()).toContain('hoody-agent-stream:p1-c2:1');
    a.forEach((x) => x.w.release());
  });
  it('another tab holding every slot degrades (locks); it gets one when that tab goes away', async () => {
    for (let n = 1; n <= 8; n++) locks.asClient('other', () => { void navigator.locks.request(`hoody-agent-stream:${C}:${n}`, { ifAvailable: true }, () => new Promise<void>(() => {})); });
    await settle();
    const a = watch('s1');
    await settle(12);
    expect(a.w.mode()).toEqual({ mode: 'degraded', why: 'locks' });
    expect(a.p.opened).toBe(0);
    locks.closeClient('other');
    await settle(40);
    expect(a.w.mode()).toEqual({ mode: 'stream' });
  });
  it('without navigator.locks the count still caps at 8 inside the tab', async () => {
    removeTestLocks();
    const ws = Array.from({ length: 9 }, (_, i) => watch(`s${i}`));
    await settle(12);
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(8);
    expect(ws[8]!.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
  });
  it('a watch released while its slot is still being taken opens nothing and frees the lock', async () => {
    const a = watch('s1');
    for (let i = 0; i < 4; i++) await Promise.resolve();
    a.w.release();
    await settle(12);
    expect(a.p.opened).toBe(0);
    expect(heldNames()).toEqual([]);
  });
});

describe('priority: the change feed is never preempted', () => {
  it('a full budget of ordinary streams gives way to the change feed: the lowest rank, newest, is cut', async () => {
    const ws = Array.from({ length: 8 }, (_, i) => watch(`s${i}`, { rank: 'visible' }));
    await settle(12);
    const feed = watch('feed', { kind: 'changes' });
    await settle(12);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
    expect(ws[7]!.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
    expect(ws[7]!.p.closed).toBe(1);
    expect(ws.slice(0, 7).every((x) => x.w.mode().mode === 'stream')).toBe(true);
    expect(locks.held().length).toBe(8);
  });
  it('nothing preempts the change feed: eight higher-ranked streams leave it and 7 others', async () => {
    const feed = watch('feed', { kind: 'changes' });
    await settle();
    const ws = Array.from({ length: 9 }, (_, i) => watch(`o${i}`, { rank: 'open' }));
    await settle(20);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
    expect(feed.p.closed).toBe(0);
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(7);
  });
  it('a change feed that asks later takes its slot from the worst-ranked stream', async () => {
    const feed = watch('feed', { kind: 'changes', level: 'off' });
    const ws = Array.from({ length: 8 }, (_, i) => watch(`s${i}`));
    await settle(12);
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(8);
    feed.w.set('stream');
    await settle(20);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(7);
  });
  it('rank order: open, focused, dock, visible, bot; an equal rank never preempts', async () => {
    const low = Array.from({ length: 8 }, (_, i) => watch(`b${i}`, { kind: 'bot-session', rank: 'bot' }));
    await settle(12);
    const order: Rank[] = ['visible', 'dock', 'focused', 'open'];
    const ups = order.map((r, i) => watch(`u${i}`, { rank: r }));
    await settle(30);
    expect(ups.every((x) => x.w.mode().mode === 'stream')).toBe(true);
    expect(low.filter((x) => x.w.mode().mode === 'stream').length).toBe(4);
    // the newest of the lowest rank went first
    expect(low.slice(4).every((x) => x.w.mode().mode === 'degraded')).toBe(true);
    const same = watch('late-bot', { kind: 'bot-session', rank: 'bot' });
    await settle(12);
    expect(same.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
    expect(low.slice(0, 4).every((x) => x.w.mode().mode === 'stream')).toBe(true);
  });
  // The Bot's own session stream is an ordinary session stream (kind 'session') that BotSource holds at rank
  // 'bot'. Under pressure it is the one closed, never a chat in view.
  it('a Bot session stream at rank bot is cut before any chat stream in view, though both are session streams', async () => {
    const chats = Array.from({ length: 7 }, (_, i) => watch(`chat${i}`, { kind: 'session', rank: 'visible' }));
    const bot = watch('bot-sid', { kind: 'session', rank: 'bot' });
    await settle(12);
    expect(bot.w.mode()).toEqual({ mode: 'stream' });
    const late = watch('chat-late', { kind: 'session', rank: 'visible' });
    await settle(30);
    expect(late.w.mode()).toEqual({ mode: 'stream' });
    expect(chats.every((x) => x.w.mode().mode === 'stream')).toBe(true);
    expect(bot.w.mode().mode).toBe('degraded');
  });
});

describe('aggregate demand: the strongest watch on a stream wins', () => {
  it('a tile going passive does not close a conversation the dock still watches; one open, one close', async () => {
    const dock = spec('s1', { rank: 'dock' });
    const wd = budget.watch(dock.s);
    const tile = spec('s1', { rank: 'visible' });
    const wt = budget.watch(tile.s);
    await settle();
    expect(dock.p.opened + tile.p.opened).toBe(1);
    wt.set('state');
    await settle();
    expect(wd.mode()).toEqual({ mode: 'stream' });
    expect(dock.p.closed + tile.p.closed).toBe(0);
    wd.set('state');
    await settle();
    expect(dock.p.closed + tile.p.closed).toBe(1);
    expect(wd.mode()).toEqual({ mode: 'state' });
    wd.release(); wt.release();
  });
  it('the rank is the best among the watches that want the stream', async () => {
    const full = Array.from({ length: 8 }, (_, i) => watch(`f${i}`, { rank: 'dock' }));
    const a = watch('s1', { rank: 'visible' });
    await settle(12);
    expect(a.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
    full.forEach((x) => x.w.release());
    await settle(12);
    const w2 = budget.watch(spec('s1', { rank: 'open' }).s);
    const fill = Array.from({ length: 7 }, (_, i) => watch(`g${i}`, { rank: 'dock' }));
    await settle(12);
    const newcomer = watch('n', { rank: 'dock' });
    await settle(12);
    // s1 is held at rank open (via w2) so the dock newcomer cannot cut it; a dock stream goes instead or waits
    expect(a.w.mode()).toEqual({ mode: 'stream' });
    expect(newcomer.w.mode().mode).toBe('degraded');
    w2.set('state');
    await settle(20);
    expect(a.w.mode().mode).toBe('degraded');
    expect(newcomer.w.mode()).toEqual({ mode: 'stream' });
    fill.forEach((x) => x.w.release());
  });
  it('the best rank wins whichever watch came first', async () => {
    const first = budget.watch(spec('s1', { rank: 'open' }).s);
    const second = budget.watch(spec('s1', { rank: 'visible' }).s);
    const fill = Array.from({ length: 7 }, (_, i) => watch(`g${i}`, { rank: 'dock' }));
    await settle(12);
    const newcomer = watch('n', { rank: 'dock' });
    await settle(12);
    expect(first.mode()).toEqual({ mode: 'stream' });
    expect(newcomer.w.mode().mode).toBe('degraded');
    fill.forEach((x) => x.w.release());
    second.release();
  });
  it('the last release closes the stream and frees the slot', async () => {
    const x = spec('s1'), y = spec('s1');
    const wx = budget.watch(x.s), wy = budget.watch(y.s);
    await settle();
    wx.release();
    await settle();
    expect(x.p.closed + y.p.closed).toBe(0);
    wy.release();
    await settle();
    expect(x.p.closed + y.p.closed).toBe(1);
    expect(heldNames()).toEqual([]);
  });
});

describe('what the opener reports', () => {
  it('live(false) is a gap (degraded, reconnecting) with the slot kept; live(true) is a stream again', async () => {
    const a = watch('s1');
    await settle();
    a.p.grant!.live(false);
    expect(a.w.mode()).toEqual({ mode: 'degraded', why: 'reconnecting' });
    expect(heldNames().length).toBe(1);
    a.p.grant!.live(true);
    expect(a.w.mode()).toEqual({ mode: 'stream' });
    expect(a.p.modes.map((m) => m.mode)).toEqual(['stream', 'degraded', 'stream']);
  });
  it('ended() frees the slot and does not reopen by itself; retry() asks again', async () => {
    const a = watch('s1');
    await settle();
    a.p.grant!.ended();
    await settle(12);
    expect(a.w.mode()).toEqual({ mode: 'degraded', why: 'closed' });
    expect(heldNames()).toEqual([]);
    await settle(40);
    expect(a.p.opened).toBe(1);
    a.w.retry();
    await settle(12);
    expect(a.p.opened).toBe(2);
    expect(a.w.mode()).toEqual({ mode: 'stream' });
  });
  it('a stale grant (an earlier open) cannot change the mode', async () => {
    const a = watch('s1');
    await settle();
    const old = a.p.grant!;
    a.w.set('state'); await settle();
    a.w.set('stream'); await settle(12);
    old.live(false);
    old.ended();
    expect(a.w.mode()).toEqual({ mode: 'stream' });
  });
  it('an opener that refuses (returns null) is degraded closed, slot freed', async () => {
    const w = budget.watch({ computer: C, key: 'x', kind: 'session', level: 'stream', open: () => null });
    await settle(12);
    expect(w.mode()).toEqual({ mode: 'degraded', why: 'closed' });
    expect(heldNames()).toEqual([]);
  });
  it('a throwing opener does not break the others', async () => {
    budget.watch({ computer: C, key: 'bad', kind: 'session', level: 'stream', open: () => { throw new Error('boom'); } });
    const ok = watch('ok');
    await settle(12);
    expect(ok.w.mode()).toEqual({ mode: 'stream' });
  });
  it('level state and off open nothing and hold nothing', async () => {
    const a = watch('s1', { level: 'state' }), b = watch('s2', { level: 'off' });
    await settle();
    expect([a.w.mode(), b.w.mode()]).toEqual([{ mode: 'state' }, { mode: 'off' }]);
    expect(a.p.opened + b.p.opened).toBe(0);
    expect(heldNames()).toEqual([]);
  });
});

describe('with resumableStream: a gateway 503 backs off, degraded, then streams', () => {
  const route = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
  it('503 + Retry-After: degraded reconnecting while it waits (the lease rule reads this); the stream resumes', async () => {
    boot({ realm: R1 });
    let n = 0;
    const tr: Transport = {
      hoody: () => Promise.reject(new Error('x')),
      fetch(_url, init) {
        n++;
        if (n === 1) return Promise.resolve(new Response('{"code":"agent_starting"}', { status: 503, headers: { 'retry-after': '1', 'content-type': 'application/json' } }));
        const body = new ReadableStream<Uint8Array>({ start(ctl) { init.signal?.addEventListener('abort', () => { try { ctl.error(new DOMException('a', 'AbortError')); } catch { /* done */ } }); } });
        return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
      },
    };
    installTransport(tr);
    const modes: ModeInfo[] = [];
    const w = budget.watch({
      computer: C, key: 's1', kind: 'session', level: 'stream', onMode: (m) => modes.push(m),
      open: (g) => {
        const h = resumableStream(route, {
          params: { id: 's1' }, target: TARGET, realm: R1, onEvent: () => {},
          onState: (s) => { if (s.state === 'open') g.live(true); else if (s.state === 'reconnecting' || s.state === 'paused') g.live(false); else if (s.state === 'closed') g.ended(); },
        });
        return h.refused ? null : h;
      },
    });
    await settle(30);
    expect(w.mode()).toEqual({ mode: 'degraded', why: 'reconnecting' });
    await vi.advanceTimersByTimeAsync(1100);
    await settle(10);
    expect(w.mode()).toEqual({ mode: 'stream' });
    expect(n).toBe(2);
    w.release();
    await settle(10);
    expect(heldNames()).toEqual([]);
  });
});

describe('until() (the waits of the cases below)', () => {
  it('a state that is reached ends the wait at once; one that never comes fails the case naming it', async () => {
    let n = 0;
    await until(() => ++n >= 3, 'three polls');
    expect(n).toBe(3);
    await expect(until(() => false, 'a state that never comes', 20)).rejects.toThrow('until: a state that never comes was not reached in 20 ms');
  });
});

describe('beforeCut: the owner of a stream about to be cut takes what it needs first', () => {
  async function full() {
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const calls: string[] = [];
    const ws = Array.from({ length: 8 }, (_, i) => {
      const { p, s } = spec(`s${i}`, { rank: 'visible' });
      const w = budget.watch({ ...s, beforeCut: i === 7 ? () => { calls.push('before'); return hold; } : undefined });
      return { p, w };
    });
    await until(() => ws.every((x) => x.p.opened === 1), 'all eight streams open');
    return { ws, go, calls };
  }
  it('the hook runs before the stream closes; the cut waits for it, then the better stream gets the slot', async () => {
    const { ws, go, calls } = await full();
    const feed = watch('feed', { kind: 'changes' });
    await until(() => calls.length === 1, 'the owner\'s hook ran');
    expect(calls).toEqual(['before']);
    expect(ws[7]!.p.closed).toBe(0);
    expect(feed.w.mode().mode).toBe('degraded');
    go();
    await until(() => ws[7]!.p.closed === 1 && feed.p.opened === 1, 'the cut done and the feed streaming');
    expect(ws[7]!.p.closed).toBe(1);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
  });
  it('a hook that never answers waits at most cutWaitMs (80 ms here, on a fake clock), then the cut goes ahead', async () => {
    vi.useFakeTimers(); // the budget's own timer and the fake locks' turns run on one clock: exact at any machine speed
    const calls: string[] = [];
    const ws = Array.from({ length: 8 }, (_, i) => {
      const { p, s } = spec(`s${i}`, { rank: 'visible' });
      const w = budget.watch({ ...s, beforeCut: i === 7 ? () => { calls.push('before'); return new Promise<void>(() => {}); } : undefined });
      return { p, w };
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(ws.every((x) => x.p.opened === 1)).toBe(true);
    const feed = watch('feed', { kind: 'changes' });
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toEqual(['before']);
    expect(ws[7]!.p.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(50); // 60 ms after the hook started: inside the cap
    expect(ws[7]!.p.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(40); // past it
    expect(ws[7]!.p.closed).toBe(1);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
  });
  it('no hook when the stream is released by its owner or its level drops: nothing is being cut', async () => {
    const calls: string[] = [];
    const { s } = spec('s1');
    const w = budget.watch({ ...s, beforeCut: () => { calls.push('x'); } });
    await settle();
    w.set('state');
    await settle();
    w.release();
    await settle();
    expect(calls).toEqual([]);
  });
});

// ---- Regression cases ----
const other = (n: number, who = 'other') => { locks.asClient(who, () => { void navigator.locks.request(`hoody-agent-stream:${C}:${n}`, { ifAvailable: true }, () => new Promise<void>(() => {})); }); };

describe('the reserved change-feed slot and lock pressure', () => {
  it('another tab holds 7 locks and this tab streams a Bot: the change feed takes the Bot\'s slot', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await settle();
    const bot = watch('b1', { kind: 'bot-session' });
    await settle(12);
    expect(bot.w.mode()).toEqual({ mode: 'stream' });
    const feed = watch('feed', { kind: 'changes' });
    await settle(30);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
    expect(bot.p.closed).toBe(1);
    expect(bot.w.mode().mode).toBe('degraded');
    expect(locks.held().length).toBe(8);
  });
  it('equal ranks never preempt under lock pressure: the newcomer waits (locks)', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await settle();
    const a = watch('s1');
    await settle(12);
    const b = watch('s2');
    await settle(20);
    expect(a.w.mode()).toEqual({ mode: 'stream' });
    expect(a.p.closed).toBe(0);
    expect(b.w.mode()).toEqual({ mode: 'degraded', why: 'locks' });
  });
  it('a better-ranked session stream replaces a worse one the same way (not only the feed)', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await settle();
    const bot = watch('b1', { kind: 'bot-log' });
    await settle(12);
    const open = watch('s1', { rank: 'open' });
    await settle(30);
    expect(open.w.mode()).toEqual({ mode: 'stream' });
    expect(bot.p.closed).toBe(1);
  });
  it('with a feed wanted the other kinds hold only locks 1..7 and the feed holds 8', async () => {
    const feed = watch('feed', { kind: 'changes' });
    const ws = Array.from({ length: 8 }, (_, i) => watch(`s${i}`));
    await settle(20);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(7);
    expect(ws[7]!.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
    expect(heldNames()).toContain(`hoody-agent-stream:${C}:8`);
    expect(locks.held().length).toBe(8);
    // another tab arriving takes nothing from the feed's lock: it finds 8 held, none free
    feed.w.release();
    await settle(20);
    expect(ws[7]!.w.mode()).toEqual({ mode: 'stream' });
  });
  it('without a feed wanted all 8 slots serve the other kinds', async () => {
    const ws = Array.from({ length: 8 }, (_, i) => watch(`s${i}`));
    await settle(20);
    expect(ws.every((x) => x.w.mode().mode === 'stream')).toBe(true);
  });
  it('the feed itself is never cut by a later stream of any rank', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await settle();
    const feed = watch('feed', { kind: 'changes' });
    await settle(12);
    const o = watch('s1', { rank: 'open' });
    await settle(30);
    expect(feed.p.closed).toBe(0);
    expect(o.w.mode()).toEqual({ mode: 'degraded', why: 'locks' });
  });
});

describe('a refusing opener frees the budget for the rest', () => {
  it('limit 1: a higher-ranked opener that returns null does not leave the cut stream waiting forever', async () => {
    const b = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 20 });
    const low = spec('low', { rank: 'bot' });
    const lw = b.watch(low.s);
    await settle(12);
    expect(lw.mode()).toEqual({ mode: 'stream' });
    const hi = b.watch({ ...spec('hi', { rank: 'open' }).s, open: () => null });
    await settle(30);
    expect(hi.mode()).toEqual({ mode: 'degraded', why: 'closed' });
    expect(lw.mode()).toEqual({ mode: 'stream' });
    expect(low.p.opened).toBe(2);
    expect(b.slotsInUse(C)).toBe(1);
    b.reset();
  });
  it('limit 1: a throwing opener does the same', async () => {
    const b = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 20 });
    const low = spec('low', { rank: 'bot' });
    const lw = b.watch(low.s);
    await settle(12);
    const hi = b.watch({ ...spec('hi', { rank: 'open' }).s, open: () => { throw new Error('boom'); } });
    await settle(30);
    expect(hi.mode()).toEqual({ mode: 'degraded', why: 'closed' });
    expect(lw.mode()).toEqual({ mode: 'stream' });
    b.reset();
  });
  it('nine equal watches, the second opener refuses: the ninth takes the free slot', async () => {
    const ws = Array.from({ length: 9 }, (_, i) => budget.watch(i === 1 ? { ...spec(`s${i}`).s, open: () => null } : spec(`s${i}`).s));
    await settle(30);
    expect(ws[1]!.mode()).toEqual({ mode: 'degraded', why: 'closed' });
    expect(ws.filter((w, i) => i !== 1 && w.mode().mode === 'stream').length).toBe(8);
    expect(budget.slotsInUse(C)).toBe(8);
  });
});

describe('a cut is decided again after beforeCut', () => {
  async function full() {
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const calls: string[] = [];
    const ws = Array.from({ length: 8 }, (_, i) => {
      const { p, s } = spec(`s${i}`, { rank: 'visible' });
      const w = budget.watch({ ...s, beforeCut: i === 7 ? () => { calls.push('before'); return hold; } : undefined });
      return { p, w };
    });
    await until(() => ws.every((x) => x.p.opened === 1), 'all eight streams open');
    return { ws, go, calls };
  }
  it('the competing watch released while the hook runs: the stream stays, no close and no reopen', async () => {
    const { ws, go, calls } = await full();
    const feed = watch('feed', { kind: 'changes' });
    await until(() => calls.length === 1, 'the owner\'s hook ran');
    expect(calls).toEqual(['before']);
    feed.w.release();
    go();
    await settle(20);
    expect(ws[7]!.p.closed).toBe(0);
    expect(ws[7]!.p.opened).toBe(1);
    expect(ws[7]!.w.mode()).toEqual({ mode: 'stream' });
    expect(budget.slotsInUse(C)).toBe(8);
  });
  it('the competing watch dropped to state while the hook runs: the stream stays', async () => {
    const { ws, go, calls } = await full();
    const feed = watch('feed', { kind: 'changes' });
    await until(() => calls.length === 1, 'the owner\'s hook ran');
    feed.w.set('state');
    go();
    await settle(20);
    expect(ws[7]!.p.closed).toBe(0);
    expect(ws[7]!.w.mode()).toEqual({ mode: 'stream' });
  });
  it('a lock-pressure cut is revalidated too: the better watch released during the hook', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await until(() => locks.held().length === 7, 'locks.held().length === 7');
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const bot = spec('b1', { kind: 'bot-session' });
    const entered: string[] = [];
    budget.watch({ ...bot.s, beforeCut: () => { entered.push('hook'); return hold; } });
    await until(() => bot.p.opened === 1, 'bot.p.opened === 1');
    const feed = watch('feed', { kind: 'changes' });
    await until(() => entered.length === 1, 'entered.length === 1');
    expect(entered).toEqual(['hook']); // the pressure cut really started
    feed.w.release();
    go();
    await settle(20);
    expect(bot.p.closed).toBe(0);
    expect(bot.p.opened).toBe(1);
  });
  it('an owner whose hook throws is cut anyway, and the hook really ran', async () => {
    const calls: string[] = [];
    const ws = Array.from({ length: 8 }, (_, i) => {
      const { p, s } = spec(`s${i}`, { rank: 'visible' });
      return { p, w: budget.watch({ ...s, beforeCut: () => { calls.push(`s${i}`); throw new Error('boom'); } }) };
    });
    await until(() => ws.every((x) => x.p.opened === 1), 'ws.every((x) => x.p.opened === 1)');
    const feed = watch('feed', { kind: 'changes' });
    await until(() => ws[7]!.p.closed === 1 && feed.p.opened === 1, 'ws[7]!.p.closed === 1 && feed.p.opened === 1');
    expect(calls).toEqual(['s7']);
    expect(ws[7]!.p.closed).toBe(1);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
  });
  it('an owner whose hook returns a promise that rejects (at once, or after a wait) is cut anyway, and the hook really ran', async () => {
    for (const later of [false, true]) {
      const calls: string[] = [];
      const ws = Array.from({ length: 8 }, (_, i) => {
        const { p, s } = spec(`s${later ? 'b' : 'a'}${i}`, { rank: 'visible' });
        const beforeCut = async () => { calls.push(`s${i}`); if (later) await new Promise((r) => setTimeout(r, 5)); throw new Error('boom'); };
        return { p, w: budget.watch({ ...s, beforeCut }) };
      });
      await until(() => ws.every((x) => x.p.opened === 1), 'ws.every((x) => x.p.opened === 1)');
      const feed = watch(`feed${later ? 'b' : 'a'}`, { kind: 'changes' });
      await until(() => ws[7]!.p.closed === 1 && feed.p.opened === 1, 'ws[7]!.p.closed === 1 && feed.p.opened === 1');
      expect(calls).toEqual(['s7']);
      expect(feed.w.mode()).toEqual({ mode: 'stream' });
      budget.reset();
      await settle(8);
    }
  });
});

describe('watches that outlive reset()', () => {
  it('an old watch released after reset and key reuse does not split the new entry', async () => {
    const a = spec('s', {});
    const old = budget.watch(a.s);
    await settle(8);
    budget.reset();
    const b = spec('s', {});
    const fresh = budget.watch(b.s);
    old.release();
    const c = spec('s', {});
    const third = budget.watch(c.s);
    await settle(12);
    expect(b.p.opened).toBe(1);
    expect(c.p.opened).toBe(0);
    expect(budget.slotsInUse(C)).toBe(1);
    expect(fresh.mode()).toEqual({ mode: 'stream' });
    expect(third.mode()).toEqual({ mode: 'stream' });
  });
  it('an old watch\'s set/retry/release after reset do nothing', async () => {
    const a = spec('s', {});
    const old = budget.watch(a.s);
    await settle(8);
    budget.reset();
    old.set('stream', 'open');
    old.retry();
    old.release();
    await settle(8);
    expect(a.p.opened).toBe(1);
    expect(budget.slotsInUse(C)).toBe(0);
  });
});

describe('which stream lock pressure cuts', () => {
  it('the worst rank goes first, and the newest of that rank', async () => {
    for (let n = 1; n <= 5; n++) other(n);
    await settle();
    const dock = watch('d1', { rank: 'dock' });
    const botOld = watch('b1', { kind: 'bot-log' });
    const botNew = watch('b2', { kind: 'bot-log' });
    await settle(20);
    expect(locks.held().length).toBe(8);
    const open = watch('o1', { rank: 'open' });
    await settle(30);
    expect(open.w.mode()).toEqual({ mode: 'stream' });
    expect(botNew.p.closed).toBe(1);
    expect(botOld.p.closed).toBe(0);
    expect(dock.p.closed).toBe(0);
    const open2 = watch('o2', { rank: 'open' });
    await settle(30);
    expect(open2.w.mode()).toEqual({ mode: 'stream' });
    expect(botOld.p.closed).toBe(1);
    expect(dock.p.closed).toBe(0);
  });
  it('the cut stream is told it was a budget cut', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await settle();
    const bot = watch('b1', { kind: 'bot-session' });
    await settle(12);
    watch('feed', { kind: 'changes' });
    await settle(30);
    expect(bot.p.modes).toContainEqual({ mode: 'degraded', why: 'budget' });
  });
});

describe('lock numbers', () => {
  it('the feed takes the last lock, the others count up from 1', async () => {
    watch('s1');
    watch('s2');
    watch('feed', { kind: 'changes' });
    await settle(20);
    expect(heldNames()).toEqual([`hoody-agent-stream:${C}:1`, `hoody-agent-stream:${C}:2`, `hoody-agent-stream:${C}:8`]);
  });
});

describe('the reserved lock: the last lock is the feed\'s alone', () => {
  let rb: StreamBudget;
  beforeEach(() => { rb = createStreamBudget({ retryMs: 30, cutWaitMs: 80 }); });
  afterEach(() => rb.reset());
  const ordinary = (b: StreamBudget, n: number, tag = 's') => Array.from({ length: n }, (_, i) => { const x = spec(`${tag}${i}`); return { p: x.p, w: b.watch(x.s) }; });
  it('eight ordinary streams: seven run on locks 1..7, the eighth waits (budget), lock 8 stays free', async () => {
    const ws = ordinary(rb, 8);
    await settle(30);
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(7);
    expect(ws[7]!.w.mode()).toEqual({ mode: 'degraded', why: 'budget' });
    expect(heldNames()).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `hoody-agent-stream:${C}:${n}`));
  });
  it('with a lock below held by another tab the others still never take lock 8', async () => {
    other(1);
    await settle();
    const ws = ordinary(rb, 7);
    await settle(30);
    expect(ws.filter((x) => x.w.mode().mode === 'stream').length).toBe(6);
    expect(ws.filter((x) => x.w.mode().why === 'locks').length).toBe(1);
    expect(heldNames()).not.toContain(`hoody-agent-stream:${C}:8`);
    const feed = rb.watch(spec('feed', { kind: 'changes' }).s);
    await settle(30);
    expect(feed.mode()).toEqual({ mode: 'stream' });
    expect(heldNames()).toContain(`hoody-agent-stream:${C}:8`);
  });
  it('another tab with eight ordinary streams cannot starve this tab\'s change feed: it takes lock 8', async () => {
    const tabA = ordinary(rb, 8);
    await settle(30);
    const tabB = createStreamBudget({ retryMs: 30, cutWaitMs: 80 });
    const feed = spec('feed', { kind: 'changes' });
    const fw = tabB.watch(feed.s);
    await settle(30);
    expect(fw.mode()).toEqual({ mode: 'stream' });
    expect(heldNames()).toContain(`hoody-agent-stream:${C}:8`);
    expect(tabA.filter((x) => x.w.mode().mode === 'stream').length).toBe(7);
    tabB.reset();
  });
  it('the other tab\'s locks 1..7 held, this tab\'s feed still has lock 8', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await settle();
    const feed = spec('feed', { kind: 'changes' });
    const fw = rb.watch(feed.s);
    await settle(30);
    expect(fw.mode()).toEqual({ mode: 'stream' });
  });
  it('the limit of Web Locks: a second feed finds lock 8 held and, with 1..7 held elsewhere too, waits (locks)', async () => {
    for (let n = 1; n <= 8; n++) other(n);
    await settle();
    const fw = rb.watch(spec('feed', { kind: 'changes' }).s);
    await settle(30);
    expect(fw.mode()).toEqual({ mode: 'degraded', why: 'locks' });
  });
  it('a second feed takes a free lock below 8 when another tab\'s feed holds 8', async () => {
    other(8);
    await settle();
    const fw = rb.watch(spec('feed', { kind: 'changes' }).s);
    await settle(30);
    expect(fw.mode()).toEqual({ mode: 'stream' });
    expect(heldNames()).toContain(`hoody-agent-stream:${C}:7`);
  });
});

describe('a cut is revalidated against everything a hook can change', () => {
  it('a hook that releases the competing watch and then throws leaves the stream alone', async () => {
    const b = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 50 });
    const hi = b.watch({ ...spec('hi', { rank: 'open' }).s, level: 'off' });
    const low = spec('low', { rank: 'bot' });
    b.watch({ ...low.s, beforeCut: () => { hi.release(); throw new Error('boom'); } });
    await settle(12);
    expect(low.p.opened).toBe(1);
    hi.set('stream');
    await settle(20);
    expect(low.p.opened).toBe(1);
    expect(low.p.closed).toBe(0);
    b.reset();
  });
  it('a lock that came free during the hook is taken instead of cutting the stream', async () => {
    for (let n = 1; n <= 7; n++) other(n);
    await until(() => locks.held().length === 7, 'locks.held().length === 7');
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const bot = spec('b1', { kind: 'bot-session' });
    const entered: string[] = [];
    budget.watch({ ...bot.s, beforeCut: () => { entered.push('hook'); return hold; } });
    await until(() => bot.p.opened === 1, 'bot.p.opened === 1');
    const feed = watch('feed', { kind: 'changes' });
    await until(() => entered.length === 1, 'entered.length === 1');
    expect(entered).toEqual(['hook']);
    locks.closeClient('other');
    go();
    await settle(30);
    expect(bot.p.opened).toBe(1);
    expect(bot.p.closed).toBe(0);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
    expect(locks.held().length).toBe(2); // the Bot's and the feed's: the lock found free was not leaked
    expect(budget.slotsInUse(C)).toBe(2);
  });
  it('the contender released while the post-hook lock retry is pending: the stream stays', async () => {
    for (let n = 2; n <= 8; n++) other(n);
    await until(() => locks.held().length === 7, 'locks.held().length === 7');
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const entered: string[] = [];
    const bot = spec('b1', { kind: 'bot-session' });
    budget.watch({ ...bot.s, beforeCut: () => { entered.push('hook'); return hold; } });
    await until(() => bot.p.opened === 1, 'bot.p.opened === 1');
    const feed = watch('feed', { kind: 'changes' });
    await until(() => entered.length === 1, 'entered.length === 1');
    expect(entered).toEqual(['hook']);
    const mid = afterNextLockRequest(() => feed.w.release()); // the retry asks for lock after lock, each answered on a later turn
    go();
    await settle(40);
    expect(mid.fired()).toBe(true);
    expect(bot.p.closed).toBe(0);
    expect(bot.p.opened).toBe(1);
  });
  it('the victim promoted while the post-hook lock retry is pending: it stays', async () => {
    for (let n = 2; n <= 8; n++) other(n);
    await until(() => locks.held().length === 7, 'locks.held().length === 7');
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const entered: string[] = [];
    const b = spec('b1', { kind: 'bot-session' });
    const bw = budget.watch({ ...b.s, beforeCut: () => { entered.push('hook'); return hold; } });
    await until(() => b.p.opened === 1, 'b.p.opened === 1');
    const v = watch('v', { rank: 'visible' });
    await until(() => entered.length === 1, 'entered.length === 1');
    expect(entered).toEqual(['hook']);
    const mid = afterNextLockRequest(() => bw.set('stream', 'open'));
    go();
    await settle(40);
    expect(mid.fired()).toBe(true);
    expect(b.p.closed).toBe(0);
    expect(b.p.opened).toBe(1);
    expect(v.w.mode()).toEqual({ mode: 'degraded', why: 'locks' });
  });
  it('the victim promoted during its hook stays; the one that is worst now yields', async () => {
    for (let n = 1; n <= 6; n++) other(n);
    await until(() => locks.held().length === 6, 'locks.held().length === 6');
    let go!: () => void;
    const hold = new Promise<void>((r) => { go = r; });
    const entered: string[] = [];
    const b = spec('b', { kind: 'bot-session' });
    const bw = budget.watch({ ...b.s, beforeCut: () => { entered.push('b'); return hold; } });
    await until(() => b.p.opened === 1, 'b.p.opened === 1');
    const v = watch('v', { rank: 'visible' });
    await until(() => locks.held().length === 8, 'locks.held().length === 8');
    expect(locks.held().length).toBe(8);
    const feed = watch('feed', { kind: 'changes' });
    await until(() => entered.length === 1, 'entered.length === 1');
    expect(entered).toEqual(['b']);
    bw.set('stream', 'open');
    go();
    await settle(40);
    expect(b.p.closed).toBe(0);
    expect(v.p.closed).toBe(1);
    expect(feed.w.mode()).toEqual({ mode: 'stream' });
  });
});
