/**
 * The live tail: the stream query and client-side rest of P, the controller
 * against a fake stream and a manual clock (catch-up then stream, dedupe by id, frame grammar and
 * byte bounds, the 1/3/9 s reconnect policy, private, visibility and idle stops), and `hubStream`,
 * the adapter from a core stream to the controller's stream seam. Rows reach the caller through the
 * display boundary, start is idempotent and replaced streams are ignored, every reopen shares one
 * budget that only cursor progress refills, and truncated stubs become placeholders or a gap.
 */
import { describe, test, expect } from 'vitest';
import { createLive, hubStream, matches, streamPath } from './live';
import type { CoreStreamCall, FrameSink } from './live';
import { predicate } from './rules';
import { fakeClock, fakeLogsDb, query, rowsEvery, T0 } from './fake-kit';

const MIB = 1024 * 1024;
const deep = (x: unknown) => JSON.parse(JSON.stringify(x));
function P(view: Parameters<typeof predicate>[0], now = T0) {
  const r = predicate(view, now);
  if (!r.ok) throw new Error('predicate refused: ' + r.code);
  return r.P;
}
const row = (id: number, extra: Record<string, unknown> = {}) => ({ id, tsMs: T0 - 1000, level: 'info', status: 200, source: 'edge', kind: 'request', serviceName: 'files', url: '/f/' + id, ...extra });

type FakeStream = { path: string; h: FrameSink; closed: boolean; close(): void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function harness(o: any = {}) {
  const clock = fakeClock();
  const db = fakeLogsDb(o.rows || []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streams: FakeStream[] = [], gets: string[] = [], got: number[] = [], events: string[] = [], shown: any[] = [];
  const live = createLive({
    P: o.P || P({ source: 'visits' }), dbId: o.dbId, clock,
    get: (path: string) => { gets.push(path); return o.get ? o.get(path, gets.length) : Promise.resolve(db.answer(path)); },
    stream: (path, h) => { const s: FakeStream = { path, h, closed: false, close() { s.closed = true; } }; streams.push(s); return s; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: (r: any[]) => { got.push(...r.map((x) => x.id)); shown.push(...r); },
    event: (e) => events.push(e),
    lost: o.lost, visible: o.visible,
  });
  const last = () => streams[streams.length - 1] as FakeStream;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (r: any) => last().h.frame({ id: String(r.id), data: JSON.stringify(r) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batch = (rs: any[]) => last().h.frame({ data: JSON.stringify(rs) });
  return { clock, db, live, streams, gets, got, events, shown, last, entry, batch };
}

describe('stream query and the client-side predicate', () => {
  test('the stream carries only what the server filters', () => {
    expect(query(streamPath(P({ source: 'visits', severity: 'problems', search: '/api', method: 'POST' }), 42))).toEqual({ source: 'edge', kind: 'request', excludeService: 'bots', afterId: '42' });
    expect(query(streamPath(P({ source: 'bots', severity: 'failed' }), 0))).toEqual({ source: 'edge', kind: 'request', serviceName: 'bots', level: 'error' });
    expect(query(streamPath(P({ source: 'decisions', severity: 'problems' }), 7))).toEqual({ source: 'backend', level: 'warn,error', afterId: '7' });
    expect(streamPath(P({ source: 'changes' }), 1)).toBe(null);
  });

  test('matches applies the window, the source keys, severity, search, method and Bot URL', () => {
    const v = P({ source: 'visits', severity: 'problems' });
    expect(matches(v, row(1, { status: 404 }))).toBe(true);
    expect(matches(v, row(1, { status: 200 }))).toBe(false);
    expect(matches(v, row(1, { status: undefined }))).toBe(false); // no status: not a problem, as minStatus
    expect(matches(v, row(1, { status: 500, serviceName: 'bots' }))).toBe(false);
    expect(matches(v, row(1, { status: 500, tsMs: T0 - 3_600_001 }))).toBe(false);
    expect(matches(v, row(1, { status: 500, kind: 'system' }))).toBe(false);
    const failed = P({ source: 'visits', severity: 'failed' });
    expect(matches(failed, row(1, { status: 404 }))).toBe(false);
    expect(matches(failed, row(1, { status: 503 }))).toBe(true);
    expect(matches(P({ source: 'visits', search: '/API/Users' }), row(1, { url: '/api/users/7?x=1' }))).toBe(true);
    expect(matches(P({ source: 'visits', search: '/cafÉ' }), row(1, { url: '/café' }))).toBe(false); // A-Z only
    expect(matches(P({ source: 'visits', search: '0AF7651916CD43DD' }), row(1, { traceId: '0af7651916cd43dd' }))).toBe(true);
    expect(matches(P({ source: 'visits', search: '0af7651916cd43dd' }), row(1, { traceId: '0af7651916cd43de' }))).toBe(false);
    expect(matches(P({ source: 'visits', search: '404' }), row(1, { status: 404 }))).toBe(true);
    expect(matches(P({ source: 'visits', search: '404' }), row(1, { status: 405 }))).toBe(false);
    expect(matches(P({ source: 'visits', method: 'POST' }), row(1, { method: 'GET' }))).toBe(false);
    const ex = 'bu_' + '0'.repeat(24);
    const b = P({ source: 'bots', botUrl: ex });
    expect(matches(b, row(1, { serviceName: 'bots', data: { bot_exposure: ex } }))).toBe(true);
    expect(matches(b, row(1, { serviceName: 'bots', data: { bot_exposure: 'bu_' + '1'.repeat(24) } }))).toBe(false);
    expect(matches(b, row(1, { serviceName: 'bots' }))).toBe(false);
    // The level pair is a comma list the server already applied: it is not compared with the row's level.
    expect(matches(P({ source: 'bots', severity: 'problems' }), row(1, { serviceName: 'bots', level: 'warn' }))).toBe(true);
    expect(matches(P({ source: 'decisions', severity: 'problems' }), row(1, { source: 'backend', kind: 'decision', level: 'error' }))).toBe(true);
  });
});

describe('open: catch-up, then the stream; rows deduplicated by id', () => {
  test('catch-up from the largest id seen, then the stream from the newest id read', async () => {
    const t = harness({ dbId: 100, rows: [row(99), row(101), row(102, { serviceName: 'bots' }), row(103)] });
    await t.live.start();
    expect(t.gets.length).toBe(1);
    expect(query(t.gets[0])).toMatchObject({ afterId: '100', limit: '1000', excludeService: 'bots' });
    expect(t.got).toEqual([101, 103]);
    expect(query(t.last().path).afterId).toBe('103');
    expect(t.events).toEqual(['open']);
    t.batch([row(103), row(104), row(102)]);
    t.entry(row(105));
    t.entry(row(105));
    t.entry(row(106, { serviceName: 'bots' })); // seen, advances the cursor, not shown
    t.entry(row(106));
    expect(t.got).toEqual([101, 103, 104, 105]);
    expect(t.live.dbId).toBe(106);
  });

  test('nothing seen yet: no catch-up, the stream opens without a cursor', async () => {
    const t = harness();
    await t.live.start();
    expect(t.gets).toEqual([]);
    expect(query(t.last().path).afterId).toBeUndefined();
  });

  test('1,000 rows on catch-up: "1,000+" and a gap, and the stream opens at the newest end', async () => {
    const t = harness({ dbId: 5, rows: rowsEvery(1500, T0 - 1000, 6) });
    await t.live.start();
    expect(t.got.length).toBe(1000);
    expect(t.events).toEqual(['overflow', 'gap', 'open']);
    expect(query(t.last().path).afterId).toBeUndefined();
    const u = harness({ dbId: 5, rows: rowsEvery(999, T0 - 1000, 6) });
    await u.live.start();
    expect(u.events).toEqual(['open']);
    expect(query(u.last().path).afterId).toBe('1004');
  });
});

describe('frame grammar and byte bounds', () => {
  test('an entry over 512 KiB (counted in UTF-8 bytes) or unparseable is a gap; nothing is shown', async () => {
    const t = harness();
    await t.live.start();
    t.last().h.frame({ id: '9', data: JSON.stringify(row(9, { url: '/' + 'é'.repeat(270_000) })) });
    t.last().h.frame({ id: '10', data: '{"id":10,' });
    t.last().h.frame({ id: '11', data: '7' });
    expect(t.events).toEqual(['open', 'gap', 'gap', 'gap']);
    expect(t.got).toEqual([]);
    t.entry(row(12, { url: '/' + 'a'.repeat(400_000) }));
    t.entry(row(13, { url: '/' + '\u{1F600}'.repeat(100_000) })); // 400,000 bytes: 4 per astral character
    expect(t.got).toEqual([12, 13]);
  });

  test('an initial batch over 4 MiB is dropped unparsed: gap, then catch-up and a new stream', async () => {
    const t = harness({ dbId: 50, rows: [row(51)] });
    await t.live.start();
    const first = t.last();
    first.h.frame({ data: '[' + 'x'.repeat(4 * MIB) });
    await t.clock.advance(999);
    expect(first.closed).toBe(true);
    expect(t.events).toEqual(['open', 'gap']);
    await t.clock.advance(1);
    expect(t.events).toEqual(['open', 'gap', 'open']);
    expect(t.gets.length).toBe(2);
    expect(query(t.last().path).afterId).toBe('51');
    t.last().h.frame({ data: JSON.stringify([row(60, { url: '/' + 'a'.repeat(4 * MIB) })]) }); // valid JSON, still over
    await t.clock.advance(2999); // no row moved the cursor since the last reopen: 3 s now
    expect(t.events).toEqual(['open', 'gap', 'open', 'gap']);
    await t.clock.advance(1);
    expect(t.got).toEqual([51]);
    expect(t.events).toEqual(['open', 'gap', 'open', 'gap', 'open']);
  });

  test('event gap, event reset (catch-up and reopen), keepalives and id-less non-arrays are handled', async () => {
    const t = harness({ dbId: 1, rows: [row(2)] });
    await t.live.start();
    t.last().h.frame({ event: 'gap' });
    t.last().h.frame({ data: '' });
    t.last().h.frame({ data: 'hello' });
    expect(t.events).toEqual(['open', 'gap']);
    const s1 = t.last();
    t.db.rows.push(row(3));
    s1.h.frame({ event: 'reset' });
    await t.clock.advance(1000);
    expect(s1.closed).toBe(true);
    expect(t.events).toEqual(['open', 'gap', 'reset', 'open']);
    expect(t.got).toEqual([2, 3]);
    expect(query(t.last().path).afterId).toBe('3');
  });
});

describe('reconnect, private, visibility, idle', () => {
  test('a close retries after 1, 3 and 9 s with a catch-up each time, then pauses; Resume starts again', async () => {
    const t = harness({ dbId: 1 });
    await t.live.start();
    const at: number[] = [];
    for (let i = 0; i < 3; i++) {
      t.last().h.close();
      const before = t.streams.length;
      for (let k = 0; t.streams.length === before && k < 60; k++) await t.clock.advance(500); // bounded: a mutant fails, never hangs
      at.push(t.clock.now() - T0);
    }
    expect(at).toEqual([1000, 4000, 13000]);
    expect(t.gets.length).toBe(4);
    t.last().h.close();
    await t.clock.advance(60_000);
    expect(t.streams.length).toBe(4);
    expect(t.events[t.events.length - 1]).toBe('paused');
    await t.live.resume();
    expect(t.streams.length).toBe(5);
  });

  test('a frame that moves the cursor refills the retry budget; a failed catch-up counts as a close', async () => {
    let fail = false;
    const t = harness({ dbId: 1, get: () => (fail ? Promise.reject({ status: 0 }) : Promise.resolve({ entries: [] })) });
    await t.live.start();
    t.last().h.close();
    await t.clock.advance(1000);
    t.entry(row(2));
    t.last().h.close();
    await t.clock.advance(999);
    expect(t.streams.length).toBe(2);
    await t.clock.advance(1);
    expect(t.streams.length).toBe(3); // 1 s again, not 3 s
    fail = true;
    t.last().h.close();
    await t.clock.advance(3000); // the second retry (3 s): its catch-up fails, which spends the third (9 s)
    expect(t.gets.length).toBe(4);
    expect(t.streams.length).toBe(3);
    fail = false;
    await t.clock.advance(8999);
    expect(t.streams.length).toBe(3);
    await t.clock.advance(1);
    expect(t.streams.length).toBe(4);
  });

  test('401/403 on reopen is private: no more retries', async () => {
    const t = harness();
    await t.live.start();
    t.last().h.close({ status: 403 });
    await t.clock.advance(60_000);
    expect(t.events).toEqual(['open', 'private']);
    expect(t.streams.length).toBe(1);
    await t.live.resume();
    expect(t.streams.length).toBe(1);
  });

  test('a hidden page at retry time stops instead of reopening; a lost ticket stops everything', async () => {
    let shown = true;
    const t = harness({ visible: () => shown });
    await t.live.start();
    shown = false;
    t.last().h.close();
    await t.clock.advance(60_000);
    expect(t.streams.length).toBe(1);
    // The stop is said (the controller turns Live off and shows the note with Resume), never silent.
    expect(t.events[t.events.length - 1]).toBe('hidden');
    let gone = false;
    const u = harness({ lost: () => gone });
    await u.live.start();
    gone = true;
    u.entry(row(5));
    u.last().h.close();
    await u.clock.advance(60_000);
    expect(u.got).toEqual([]);
    expect(u.streams.length).toBe(1);
    expect(u.clock.pending()).toBe(0);
  });

  test('10 minutes without interaction stop the tail; touch() postpones it', async () => {
    const t = harness();
    await t.live.start();
    await t.clock.advance(9 * 60_000);
    t.live.touch();
    await t.clock.advance(9 * 60_000);
    expect(t.last().closed).toBe(false);
    await t.clock.advance(60_000);
    expect(t.last().closed).toBe(true);
    expect(t.events).toEqual(['open', 'idle']);
    expect(t.clock.pending()).toBe(0);
  });

  test('stop() closes the stream and clears every timer', async () => {
    const t = harness();
    await t.live.start();
    t.last().h.close();
    expect(t.clock.pending()).toBe(2);
    t.live.stop();
    expect(t.clock.pending()).toBe(0);
    await t.clock.advance(60_000);
    expect(t.streams.length).toBe(1);
    expect(t.clock.pending()).toBe(0);
  });
});


// ── the core stream adapter ──────────────────────────────────────────────────
type CoreCall = { path: string; c: CoreStreamCall; closed: number; refused?: string; close(): void };
function viaCore(o: { refuse?: string; noCore?: boolean; dbId?: number } = {}) {
  const opened: CoreCall[] = [];
  const open = o.noCore ? null : (path: string, c: CoreStreamCall) => {
    const s: CoreCall = { path, c, closed: 0, refused: o.refuse, close() { s.closed++; } };
    opened.push(s);
    return s;
  };
  const clock = fakeClock();
  const got: number[] = [], events: string[] = [];
  const live = createLive({
    P: P({ source: 'visits' }), dbId: o.dbId, clock,
    get: () => Promise.resolve({ entries: [] }),
    stream: hubStream(open),
    rows: (r) => got.push(...r.map((x) => x.id as number)), event: (e) => events.push(e),
  });
  return { opened, clock, got, events, live };
}

describe('hubStream: a core stream as the controller stream', () => {
  test('events become frames, an oversized frame a gap, a reset a reopen', async () => {
    const h = viaCore({ dbId: 4 });
    await h.live.start();
    expect(h.opened.length).toBe(1);
    const s = h.opened[0] as CoreCall;
    expect(s.path).toBe('/_logs/stream?source=edge&kind=request&excludeService=bots&afterId=4');
    s.c.onState({ state: 'open', status: 200 });
    s.c.onEvent('message', JSON.stringify(row(5)), '5');
    s.c.onEvent('message', JSON.stringify([row(6), row(7)]), undefined);
    s.c.onEvent('message', JSON.stringify(row(5)), '5');
    expect(h.got).toEqual([5, 6, 7]);
    s.c.onState({ state: 'gap', reason: 'frame_too_large' });
    expect(h.events).toEqual(['open', 'gap']);
    s.c.onEvent('reset', '', undefined);
    await h.clock.advance(1000);
    expect(h.events).toEqual(['open', 'gap', 'reset', 'open']);
    expect(s.closed).toBe(1);
    expect(h.opened.length).toBe(2);
    h.live.stop();
  });

  test('a 401/403 on open is private; a network close retries after 1 s', async () => {
    const a = viaCore();
    await a.live.start();
    a.opened[0]!.c.onState({ state: 'error', status: 403, code: 'forbidden', retryAfterMs: null });
    await a.clock.advance(20_000);
    expect(a.events).toEqual(['open', 'private']);
    expect(a.opened.length).toBe(1);
    const b = viaCore();
    await b.live.start();
    b.opened[0]!.c.onState({ state: 'closed', reason: 'network' });
    await b.clock.advance(999);
    expect(b.opened.length).toBe(1);
    await b.clock.advance(1);
    expect(b.opened.length).toBe(2);
    b.live.stop();
  });

  test('after stop, late events and states from the closed stream are ignored', async () => {
    const h = viaCore();
    await h.live.start();
    const s = h.opened[0] as CoreCall;
    h.live.stop();
    expect(s.closed).toBe(1);
    s.c.onEvent('message', JSON.stringify(row(9)), '9');
    s.c.onState({ state: 'gap', reason: 'frame_too_large' });
    s.c.onState({ state: 'closed', reason: 'aborted' });
    await h.clock.advance(20_000);
    expect(h.got).toEqual([]);
    expect(h.events).toEqual(['open']);
    expect(h.opened.length).toBe(1);
  });

  test('one close per stream: a second closed state does not schedule a second retry', async () => {
    const h = viaCore();
    await h.live.start();
    h.opened[0]!.c.onState({ state: 'error', status: 502, code: 'bad_gateway' });
    h.opened[0]!.c.onState({ state: 'closed', reason: 'server' });
    await h.clock.advance(1000);
    expect(h.opened.length).toBe(2);
    await h.clock.advance(3000);
    expect(h.opened.length).toBe(2);
    h.live.stop();
  });

  test('the adapter alone: nothing reaches the handler after close() or after the first end, which comes once', async () => {
    const opened: CoreCall[] = [];
    const open = (path: string, c: CoreStreamCall) => { const x: CoreCall = { path, c, closed: 0, close() { x.closed++; } }; opened.push(x); return x; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames: any[] = [], closes: unknown[] = [];
    const via = hubStream(open);
    const h: FrameSink = { frame: (f) => frames.push(f), close: (e) => closes.push(e) };
    const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
    const one = via('/_logs/stream', h);
    opened[0]!.c.onEvent('message', '[]', undefined);
    expect(frames.length).toBe(1);
    one.close();
    expect(opened[0]!.closed).toBe(1);
    opened[0]!.c.onEvent('message', '[]', undefined);
    opened[0]!.c.onState({ state: 'gap', reason: 'frame_too_large' });
    opened[0]!.c.onState({ state: 'closed', reason: 'aborted' });
    await flush();
    expect(frames.length).toBe(1);
    expect(closes).toEqual([]);
    via('/_logs/stream', h);
    opened[1]!.c.onState({ state: 'error', status: 502, code: 'bad_gateway' });
    opened[1]!.c.onState({ state: 'closed', reason: 'server' });
    opened[1]!.c.onEvent('message', '[]', undefined);
    opened[1]!.c.onState({ state: 'gap', reason: 'frame_too_large' });
    expect(closes).toEqual([]);
    await flush();
    expect(deep(closes)).toEqual([{ state: 'error', status: 502, code: 'bad_gateway' }]);
    expect(frames.length).toBe(1);
  });

  test('a refused stream (or no core) closes after open, never before; retries, then pauses', async () => {
    for (const o of [{ refuse: 'ROUTE_NOT_ALLOWED' }, { noCore: true }]) {
      const h = viaCore(o);
      await h.live.start();
      await h.clock.advance(0);
      expect(h.events).toEqual(['open']);
      await h.clock.advance(1000 + 3000 + 9000);
      expect(h.events).toEqual(['open', 'open', 'open', 'open', 'paused']);
      if (!o.noCore) expect(h.opened.length).toBe(4);
      h.live.stop();
    }
  });
});

// ── lifecycle, budget, stubs and the display boundary ──────────────
describe('one opening at a time, replaced streams ignored', () => {
  test('concurrent start() and resume() open one catch-up and one stream; stop() closes it', async () => {
    const t = harness({ dbId: 3, rows: [row(4)] });
    await Promise.all([t.live.start(), t.live.start(), t.live.resume()]);
    expect(t.gets.length).toBe(1);
    expect(t.streams.length).toBe(1);
    await t.live.start();
    expect(t.streams.length).toBe(1);
    t.live.stop();
    expect(t.streams.every((x) => x.closed)).toBe(true);
  });

  test('stop() while the catch-up is in flight opens nothing when it answers', async () => {
    let answer: (v: unknown) => void = () => {};
    const t = harness({ dbId: 3, get: () => new Promise((res) => { answer = res; }) });
    const p = t.live.start();
    t.live.stop();
    answer({ entries: [row(4)] });
    await p;
    expect(t.streams.length).toBe(0);
    expect(t.events).toEqual([]);
    expect(t.got).toEqual([]);
  });

  test('a replaced stream\'s late frames and close are ignored', async () => {
    const t = harness({ dbId: 1, rows: [row(2)] });
    await t.live.start();
    const s1 = t.last();
    s1.h.frame({ event: 'reset' });
    await t.clock.advance(1000);
    expect(t.streams.length).toBe(2);
    s1.h.frame({ id: '99', data: JSON.stringify(row(99)) });
    s1.h.close();
    await t.clock.advance(60_000);
    expect(t.got).not.toContain(99);
    expect(t.streams.length).toBe(2);
    expect(t.events).not.toContain('paused');
  });

  test('after a reset, the closed stream\'s frames and close before the reopen are ignored', async () => {
    const t = harness({ dbId: 1 });
    await t.live.start();
    const s1 = t.last();
    s1.h.frame({ event: 'reset' });
    s1.h.frame({ id: '7', data: JSON.stringify(row(7)) });
    s1.h.close();
    await t.clock.advance(1000);
    expect(t.got).toEqual([]);
    expect(t.streams.length).toBe(2);
    await t.clock.advance(60_000);
    expect(t.streams.length).toBe(2);
  });
});

describe('one reopen budget, refilled only by cursor progress', () => {
  test('keepalives, an empty batch and already-seen rows do not refill the budget', async () => {
    const t = harness({ dbId: 5 });
    await t.live.start();
    t.last().h.close();
    await t.clock.advance(1000);
    expect(t.streams.length).toBe(2);
    t.last().h.frame({ data: '' });
    t.batch([]);
    t.entry(row(4));
    t.last().h.close();
    await t.clock.advance(1000);
    expect(t.streams.length).toBe(2); // 3 s now, not 1 s
    await t.clock.advance(2000);
    expect(t.streams.length).toBe(3);
  });

  test('resets and over-bound batches without progress spend the same budget, then pause', async () => {
    const t = harness({ dbId: 5 });
    await t.live.start();
    const at: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i % 2) t.last().h.frame({ data: '[' + 'x'.repeat(4 * MIB) }); else t.last().h.frame({ event: 'reset' });
      const before = t.streams.length;
      for (let k = 0; t.streams.length === before && k < 60; k++) await t.clock.advance(500); // bounded: a mutant fails, never hangs
      at.push(t.clock.now() - T0);
    }
    expect(at).toEqual([1000, 4000, 13000]);
    t.last().h.frame({ event: 'reset' });
    await t.clock.advance(60_000);
    expect(t.streams.length).toBe(4);
    expect(t.events[t.events.length - 1]).toBe('paused');
  });

  test('a page hidden when a reset reopen is due stops the tail', async () => {
    let shown = true;
    const t = harness({ dbId: 5, visible: () => shown });
    await t.live.start();
    t.last().h.frame({ event: 'reset' });
    shown = false;
    await t.clock.advance(60_000);
    expect(t.streams.length).toBe(1);
    expect(t.clock.pending()).toBe(0);
    expect(t.events[t.events.length - 1]).toBe('hidden');
  });
});

describe('server-truncated stubs and the display boundary', () => {
  const stub = (id: unknown, extra: Record<string, unknown> = {}) => ({ id, tsMs: T0 - 1000, kind: 'request', level: 'info', projectId: 'p', containerId: 'c', serviceName: 'files', source: 'edge', traceId: 't', truncated: true, originalFrameBytes: 900_000, ...extra });

  test('a stub that may belong to the view is shown as a placeholder; one known to be outside is not', async () => {
    const failed = harness({ P: P({ source: 'visits', severity: 'failed', search: '/api', method: 'POST' }) });
    await failed.live.start();
    failed.entry(stub(7));
    expect(failed.got).toEqual([7]);
    expect(failed.shown[0]).toMatchObject({ id: 7, truncated: true });
    failed.entry(stub(8, { serviceName: 'bots' })); // visits leave out the bots service
    failed.entry(stub(9, { tsMs: T0 - 2 * 3_600_000 })); // before the window
    expect(failed.got).toEqual([7]);
    const bots = harness({ P: P({ source: 'bots', severity: 'failed' }) });
    await bots.live.start();
    bots.entry(stub(10, { serviceName: 'bots', level: 'info' })); // the level is known: not failed
    bots.entry(stub(11, { serviceName: 'bots', level: 'error' }));
    expect(bots.got).toEqual([11]);
    expect(bots.live.dbId).toBe(11);
    const ex = harness({ P: P({ source: 'bots', botUrl: 'bu_' + 'a'.repeat(24) }) });
    await ex.live.start();
    ex.entry(stub(12, { serviceName: 'bots' })); // the stub carries no data: the Bot URL filter cannot rule it out
    expect(ex.got).toEqual([12]);
  });

  test('a stub without an id (the server\'s reduced stub) is a gap', async () => {
    const t = harness();
    await t.live.start();
    t.last().h.frame({ id: '12', data: JSON.stringify({ projectId: 'p', containerId: 'c', truncated: true, originalFrameBytes: 9e6 }) });
    t.batch([row(13), { projectId: 'p', truncated: true }]);
    t.batch([{ foo: 1 }, { id: 'x' }]); // malformed rows that are not stubs: skipped, no gap
    expect(t.events).toEqual(['open', 'gap', 'gap']);
    expect(t.got).toEqual([13]);
  });

  test('rows reach the caller scrubbed; matching used the row as the server filtered it', async () => {
    const KEY = 'hbk_' + 'A'.repeat(30);
    const t = harness({ P: P({ source: 'visits', search: KEY.slice(0, 12) }) });
    await t.live.start();
    t.entry(row(20, { url: '/x/' + KEY, data: { password: 'p' } }));
    expect(t.got).toEqual([20]);
    expect(t.shown[0].url).toBe('/x/[REDACTED]');
    expect(t.shown[0].data.password).toBe('[REDACTED]');
  });
});

