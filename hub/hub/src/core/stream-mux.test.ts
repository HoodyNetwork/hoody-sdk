// stream-mux.ts: per-session agent streams carried by one GET /sessions:events connection. Red-first:
// one stream for N sessions, per-session gaps, and the budget counts it once.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { createStreamBudget, type StreamBudget } from './stream-budget';
import { budgetedStream, streamComputer, type RankedStream } from './stream-live';
import { MAX_MUX, resetStreamMux, sessionStream } from './stream-mux';
import type { StreamInput, StreamState } from './kit-io';
import { boot, R1, R2, TARGET } from './test/env';
import { installWebLocks } from './test/web-locks';

const SSE = { 'content-type': 'text/event-stream' };
type Conn = { url: URL; init: RequestInit; push(s: string): void; end(): void; aborted(): boolean };
let conns: Conn[] = [];
/** Per path: the HTTP failure an open answers with. */
let fail: Record<string, number> = {};
const enc = new TextEncoder();
const transport: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    const u = new URL(url);
    const path = u.pathname.replace('/api/v1/agent', '');
    let ctl: ReadableStreamDefaultController<Uint8Array> | null = null;
    const signal = init.signal;
    const c: Conn = {
      url: u, init,
      push: (s) => { try { ctl?.enqueue(enc.encode(s)); } catch { /* closed */ } },
      end: () => { try { ctl?.close(); } catch { /* done */ } },
      aborted: () => !!signal?.aborted,
    };
    conns.push(c);
    const st = Object.keys(fail).find((p) => path === p || (p === '*single' && path.endsWith('/stream')));
    if (st) return Promise.resolve(new Response(JSON.stringify({ code: 'not_found', message: 'x' }), { status: fail[st]!, headers: { 'content-type': 'application/json' } }));
    const body = new ReadableStream<Uint8Array>({
      start(x) {
        ctl = x;
        signal?.addEventListener('abort', () => { try { x.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
      },
    });
    return Promise.resolve(new Response(body, { status: 200, headers: SSE }));
  },
};
const mux = defineRoute({ method: 'GET', path: '/sessions:events', scope: 'agent', query: ['ids', 'since', 'incarnation'], stream: { id: 4096, noId: 4096 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const single = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };
const muxConns = () => conns.filter((c) => c.url.pathname.endsWith('/sessions:events'));
const singleConns = () => conns.filter((c) => c.url.pathname.endsWith('/stream'));
const live = () => muxConns().filter((c) => !c.aborted());

const ev = (sid: string, seq: number, type = 'message_delta', inc = 'i1') =>
  `event: ${type}\ndata: ${JSON.stringify({ session_id: sid, seq, incarnation: inc, event: { type: 'event.' + type } })}\n\n`;
const ctl = (name: string, d: Record<string, unknown>) => `event: ${name}\ndata: ${JSON.stringify(d)}\n\n`;
const boundary = (sid: string, max: number) => ctl('replay_boundary', { session_id: sid, max_seq: max, incarnation: 'i1' });

let budget: StreamBudget;
beforeEach(() => {
  boot({ realm: R1 });
  conns = []; fail = {};
  installTransport(transport);
  installWebLocks();
  budget = createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 });
});
afterEach(() => { resetStreamMux(); budget.reset(); installTransport(null); });

type Rec = { h: RankedStream; events: Array<[string, string, string | undefined]>; states: StreamState[]; kinds(): string[]; names(): string[] };
function open(sid: string, o: { cursor?: { since: string | number; incarnation: string }; realm?: string; rank?: 'open' | 'dock' | 'visible' } = {}): Rec {
  const events: Rec['events'] = [], states: StreamState[] = [];
  const query: Record<string, string | number> = {};
  if (o.cursor) { query.since = o.cursor.since; query.incarnation = o.cursor.incarnation; }
  const input = {
    target: TARGET, realm: o.realm ?? R1, params: { id: sid }, query,
    onEvent: (n: string, d: string, id: string | undefined) => events.push([n, d, id]),
    onState: (s: StreamState) => states.push(s),
  } as StreamInput;
  const h = sessionStream({ mux, single, sid, key: `${o.realm ?? R1}/${sid}`, ...(o.rank ? { rank: o.rank } : {}) }, input, budget);
  return { h, events, states, kinds: () => states.map((s) => s.state), names: () => events.map((e) => e[0]) };
}
const seqs = (r: Rec) => r.events.filter((e) => e[0] === 'message_delta').map((e) => JSON.parse(e[1]).seq as number);
const q = (c: Conn, k: string) => c.url.searchParams.get(k);

describe('one stream for N sessions', () => {
  it('two sessions share one connection (ids in order) and one budget slot; each sees only its own frames, id = its seq', async () => {
    const a = open('a'), b = open('b');
    await settle();
    expect(muxConns().length).toBe(1);
    expect(q(muxConns()[0]!, 'ids')).toBe('a,b');
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(1);
    muxConns()[0]!.push(ev('a', 1) + ev('b', 1) + ev('b', 2) + boundary('a', 1) + boundary('b', 2));
    await settle();
    expect(a.kinds()).toEqual(['open']);
    expect(b.kinds()).toEqual(['open']);
    expect(seqs(a)).toEqual([1]);
    expect(seqs(b)).toEqual([1, 2]);
    expect(a.events[0]![2]).toBe('1');
    expect(a.names()).toEqual(['message_delta', 'replay_boundary']);
    expect(singleConns().length).toBe(0);
  });
  it('the caller cursor rides the connection as <id>:<value> lists', async () => {
    open('a', { cursor: { since: 120, incarnation: 'ia' } }); open('b'); open('c', { cursor: { since: 88, incarnation: 'ic' } });
    await settle();
    const c = muxConns()[0]!;
    expect(q(c, 'ids')).toBe('a,b,c');
    expect(q(c, 'since')).toBe('a:120,c:88');
    expect(q(c, 'incarnation')).toBe('a:ia,c:ic');
  });
  it('budget accounting counts the mux as one stream: four sessions and two other streams fit a budget of three', async () => {
    const ms = ['a', 'b', 'c', 'd'].map((s) => open(s));
    const others = ['x', 'y'].map((s) => budgetedStream(single, { target: TARGET, realm: R1, params: { id: s }, onEvent: () => {} } as StreamInput, { key: s }, budget));
    await settle(12);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(3);
    expect(muxConns().length).toBe(1);
    expect(ms.every((m) => m.kinds().join() === 'open')).toBe(true);
    others.forEach((o) => o.close());
  });
  it('another realm is another group (its own connection and slot)', async () => {
    open('a'); open('b', { realm: R2 });
    await settle();
    expect(muxConns().length).toBe(2);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(2);
  });
});

describe('adding a session', () => {
  it('never resets another session\'s cursor and never replays its events', async () => {
    const a = open('a', { cursor: { since: 5, incarnation: 'i1' } });
    await settle();
    muxConns()[0]!.push(ev('a', 6) + ev('a', 7) + boundary('a', 7) + ev('a', 8));
    await settle();
    const b = open('b');
    await settle();
    expect(muxConns().length).toBe(2);
    expect(muxConns()[0]!.aborted()).toBe(true);
    const c2 = muxConns()[1]!;
    expect(q(c2, 'ids')).toBe('a,b');
    expect(q(c2, 'since')).toBe('a:8');
    expect(q(c2, 'incarnation')).toBe('a:i1');
    // The server replays a's ring from its cursor; a repeat (≤ 8) and the second boundary are dropped.
    c2.push(ev('a', 7) + ev('a', 8) + boundary('a', 8) + ev('b', 1) + boundary('b', 1) + ev('a', 9));
    await settle();
    expect(seqs(a)).toEqual([6, 7, 8, 9]);
    expect(a.names().filter((n) => n === 'replay_boundary').length).toBe(1);
    expect(a.kinds()).toEqual(['open']);
    expect(a.names()).not.toContain('lagged');
    expect(seqs(b)).toEqual([1]);
    expect(b.kinds()).toEqual(['open']);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(1);
  });
  it('a continuing session that had no frame yet keeps the caller cursor', async () => {
    open('a', { cursor: { since: 40, incarnation: 'ia' } });
    await settle();
    open('b');
    await settle();
    expect(q(muxConns()[1]!, 'since')).toBe('a:40');
    expect(q(muxConns()[1]!, 'incarnation')).toBe('a:ia');
  });
  it('a burst of sessions joining together reconnects once', async () => {
    open('a');
    await settle();
    open('b'); open('c'); open('d');
    await settle();
    expect(muxConns().length).toBe(2);
    expect(q(muxConns()[1]!, 'ids')).toBe('a,b,c,d');
  });
  it('a real gap the server reports for a continuing session on the new connection is delivered, and its boundary again', async () => {
    const a = open('a');
    await settle();
    muxConns()[0]!.push(ev('a', 1) + boundary('a', 1));
    await settle();
    open('b');
    await settle();
    muxConns()[1]!.push(ctl('session_lagged', { session_id: 'a', code: 'replay_gap', min_seq: 500, max_seq: 600, incarnation: 'i1' }) + ev('a', 500) + boundary('a', 600));
    await settle();
    expect(a.names()).toEqual(['message_delta', 'replay_boundary', 'lagged', 'message_delta', 'replay_boundary']);
    expect(seqs(a)).toEqual([1, 500]);
  });
  it('a session leaving reconnects nothing; its frames go nowhere', async () => {
    const a = open('a'), b = open('b');
    await settle();
    b.h.close();
    await settle();
    expect(muxConns().length).toBe(1);
    expect(muxConns()[0]!.aborted()).toBe(false);
    muxConns()[0]!.push(ev('b', 1) + ev('a', 1));
    await settle();
    expect(b.events.length).toBe(0);
    expect(seqs(a)).toEqual([1]);
    a.h.close();
    await settle();
    expect(muxConns()[0]!.aborted()).toBe(true);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    expect(a.kinds()).toEqual(['open']);
  });
});

describe('per-session gaps, drops and ends', () => {
  it('a replay_gap for one session reaches only it, and its stream goes on', async () => {
    const a = open('a'), b = open('b');
    await settle();
    muxConns()[0]!.push(ev('a', 1) + ctl('session_lagged', { session_id: 'b', code: 'replay_gap', min_seq: 3, max_seq: 9, incarnation: 'i2' }) + ev('b', 3, 'message_delta', 'i2') + ev('a', 2));
    await settle();
    expect(a.names()).toEqual(['message_delta', 'message_delta']);
    expect(b.names()).toEqual(['lagged', 'message_delta']);
    expect(JSON.parse(b.events[0]![1]).code).toBe('replay_gap');
    expect(b.kinds()).toEqual(['open']);
  });
  it('after a replay_gap into a new incarnation, the session\'s lower seqs are delivered (its old cursor is gone)', async () => {
    const a = open('a');
    await settle();
    muxConns()[0]!.push(ev('a', 50) + ctl('session_lagged', { session_id: 'a', code: 'replay_gap', min_seq: 1, max_seq: 3, incarnation: 'i2' }) + ev('a', 1, 'message_delta', 'i2') + ev('a', 2, 'message_delta', 'i2'));
    await settle();
    expect(seqs(a)).toEqual([50, 1, 2]);
  });
  it('a session dropped for slowness (lagged) ends alone: lagged, then closed; the others go on', async () => {
    const a = open('a'), b = open('b');
    await settle();
    muxConns()[0]!.push(ctl('session_lagged', { session_id: 'b', code: 'lagged', resume: 'x' }) + ev('a', 1));
    await settle();
    expect(b.names()).toEqual(['lagged']);
    expect(b.kinds()).toEqual(['open', 'closed']);
    expect((b.states[1] as { reason: string }).reason).toBe('server');
    expect(a.kinds()).toEqual(['open']);
    expect(seqs(a)).toEqual([1]);
    expect(muxConns().length).toBe(1);
  });
  it('session_end is the session\'s own end frame, then closed; the stream end frame ends nobody else\'s twice', async () => {
    const a = open('a'), b = open('b');
    await settle();
    muxConns()[0]!.push(ctl('session_end', { session_id: 'a', reason: 'session not found' }));
    await settle();
    expect(a.names()).toEqual(['end']);
    expect(a.kinds()).toEqual(['open', 'closed']);
    expect(b.kinds()).toEqual(['open']);
    muxConns()[0]!.push(ctl('session_end', { session_id: 'b', reason: 'session closed' }) + ctl('end', { reason: 'no sessions left' }));
    muxConns()[0]!.end();
    await settle();
    expect(b.names()).toEqual(['end']);
    expect(b.kinds()).toEqual(['open', 'closed']);
    expect(a.kinds()).toEqual(['open', 'closed']);
  });
  it('a frame too large to read names no session: every session on the connection gets the gap state', async () => {
    const a = open('a'), b = open('b');
    await settle();
    muxConns()[0]!.push(`event: message_delta\ndata: ${'x'.repeat(5000)}\n\n`);
    await settle();
    expect(a.kinds()).toEqual(['open', 'gap']);
    expect(b.kinds()).toEqual(['open', 'gap']);
  });
});

describe('joins, gaps and members that end', () => {
  it('a join between a replay_gap and its replay asks for the whole ring of the new incarnation, never the old cursor', async () => {
    const a = open('a', { cursor: { since: 50, incarnation: 'old' } });
    await settle();
    muxConns()[0]!.push(ctl('session_lagged', { session_id: 'a', code: 'replay_gap', min_seq: 1, max_seq: 100, incarnation: 'new' }));
    await settle();
    open('b');
    await settle();
    const c2 = muxConns()[1]!;
    expect(q(c2, 'since')).toBeNull();
    expect(q(c2, 'incarnation')).toBe('a:new');
    expect(a.names()).toEqual(['lagged']);
  });
  it('a member closed by another member\'s open or gap handler hears nothing more', async () => {
    const events: string[] = [];
    let bh: { close(): void } | null = null;
    const mk = (sid: string, onState: (s: StreamState) => void) => sessionStream({ mux, single, sid, key: sid }, { target: TARGET, realm: R1, params: { id: sid }, query: {}, onEvent: () => {}, onState } as StreamInput, budget);
    mk('a', (s) => { events.push('a ' + s.state); bh?.close(); });
    bh = mk('b', (s) => events.push('b ' + s.state));
    await settle();
    muxConns()[0]!.push(`event: x\ndata: ${'x'.repeat(5000)}\n\n`);
    await settle();
    expect(events).toEqual(['a open', 'a gap']);
  });
  it('a member that ends by itself takes its rank away: a dock stream can then cut the visible group', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'open' }), b = open('b', { rank: 'visible' });
    await settle();
    muxConns()[0]!.push(ctl('session_end', { session_id: 'a', reason: 'session closed' }));
    await settle();
    expect(a.kinds()).toEqual(['open', 'closed']);
    const st: StreamState[] = [];
    const dock = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {}, onState: (x: StreamState) => st.push(x) } as StreamInput, { key: 'z', rank: 'dock' }, budget);
    await settle(30);
    expect(st.map((x) => x.state)).toContain('open');
    expect(b.kinds()).toEqual(['open', 'closed']);
    dock.close();
  });
  it('the same after a terminal session_lagged', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    open('a', { rank: 'open' }); const b = open('b', { rank: 'visible' });
    await settle();
    muxConns()[0]!.push(ctl('session_lagged', { session_id: 'a', code: 'lagged' }));
    await settle();
    const st: StreamState[] = [];
    const dock = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {}, onState: (x: StreamState) => st.push(x) } as StreamInput, { key: 'z', rank: 'dock' }, budget);
    await settle(30);
    expect(st.map((x) => x.state)).toContain('open');
    expect(b.kinds()).toEqual(['open', 'closed']);
    dock.close();
  });
  it('an already aborted caller gets one error {ABORTED} and joins nothing', async () => {
    const ac = new AbortController(); ac.abort();
    const states: StreamState[] = [];
    sessionStream({ mux, single, sid: 'a', key: 'a' }, { target: TARGET, realm: R1, params: { id: 'a' }, query: {}, signal: ac.signal, onEvent: () => {}, onState: (s: StreamState) => states.push(s) } as StreamInput, budget);
    await settle();
    expect(states.map((s) => s.state)).toEqual(['error']);
    expect((states[0] as { code: string }).code).toBe('ABORTED');
    expect(muxConns().length).toBe(0);
  });
  it('an already aborted caller takes no budget slot, cuts nothing and leaves the group rank as it was', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'visible' });
    await settle();
    const ac = new AbortController(); ac.abort();
    const states: StreamState[] = [];
    sessionStream({ mux, single, sid: 'b', key: 'b', rank: 'open' }, { target: TARGET, realm: R1, params: { id: 'b' }, query: {}, signal: ac.signal, onEvent: () => {}, onState: (s: StreamState) => states.push(s) } as StreamInput, budget);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(1);
    await settle(20);
    expect(states.map((s) => s.state)).toEqual(['error']);
    expect((states[0] as { code: string; status: number }).code).toBe('ABORTED');
    expect((states[0] as { status: number }).status).toBe(0);
    expect(a.kinds()).toEqual(['open']);
    expect(singleConns().length).toBe(0);
    expect(muxConns().length).toBe(1);
    // the group kept its own rank (visible): a dock stream still cuts it
    const st: StreamState[] = [];
    const dock = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {}, onState: (x: StreamState) => st.push(x) } as StreamInput, { key: 'z', rank: 'dock' }, budget);
    await settle(30);
    expect(st.map((x) => x.state)).toContain('open');
    expect(a.kinds()).toEqual(['open', 'closed']);
    dock.close();
  });
  it('an already aborted caller closed before its microtask hears nothing', async () => {
    const ac = new AbortController(); ac.abort();
    const states: StreamState[] = [];
    const h = sessionStream({ mux, single, sid: 'a', key: 'a' }, { target: TARGET, realm: R1, params: { id: 'a' }, query: {}, signal: ac.signal, onEvent: () => {}, onState: (s: StreamState) => states.push(s) } as StreamInput, budget);
    h.close();
    await settle();
    expect(states).toEqual([]);
  });
  it('a later abort ends that member alone with closed {aborted}; the others go on', async () => {
    const ac = new AbortController();
    const states: StreamState[] = [];
    sessionStream({ mux, single, sid: 'a', key: 'a' }, { target: TARGET, realm: R1, params: { id: 'a' }, query: {}, signal: ac.signal, onEvent: () => {}, onState: (s: StreamState) => states.push(s) } as StreamInput, budget);
    const b = open('b');
    await settle();
    ac.abort();
    await settle();
    expect(states.map((s) => s.state)).toEqual(['open', 'closed']);
    expect((states[1] as { reason: string }).reason).toBe('aborted');
    muxConns()[muxConns().length - 1]!.push(ev('b', 1));
    await settle();
    expect(b.kinds()).toEqual(['open']);
    expect(seqs(b)).toEqual([1]);
  });
});

describe('the rank is current for the very next budget decision', () => {
  const dockStream = (st: StreamState[]) => budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {}, onState: (x: StreamState) => st.push(x) } as StreamInput, { key: 'z', rank: 'dock' }, budget);
  it('a join of a better session, then a dock stream at once: the group keeps its slot, the dock is refused', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'visible' });
    await settle();
    const b = open('b', { rank: 'open' });
    const st: StreamState[] = [];
    const dock = dockStream(st);
    await settle(30);
    expect(a.kinds()).toEqual(['open']);
    expect(b.kinds()).toEqual(['open']);
    expect(st.map((x) => x.state)).toEqual(['error']);
    dock.close();
  });
  it('closing the better session, then a dock stream at once: the dock cuts the visible group', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'open' }), b = open('b', { rank: 'visible' });
    await settle();
    a.h.close();
    const st: StreamState[] = [];
    const dock = dockStream(st);
    await settle(30);
    expect(st.map((x) => x.state)).toContain('open');
    expect(b.kinds()).toEqual(['open', 'closed']);
    dock.close();
  });
  it('a dock stream asked from the ended session\'s own terminal handler sees the rank without it', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const st: StreamState[] = [];
    let dock: { close(): void } | null = null;
    sessionStream({ mux, single, sid: 'a', key: 'a', rank: 'open' }, { target: TARGET, realm: R1, params: { id: 'a' }, query: {}, onEvent: () => {}, onState: (x: StreamState) => { if (x.state === 'closed') dock = dockStream(st); } } as StreamInput, budget);
    const b = open('b', { rank: 'visible' });
    await settle();
    muxConns()[0]!.push(ctl('session_end', { session_id: 'a', reason: 'session closed' }));
    await settle(30);
    expect(st.map((x) => x.state)).toContain('open');
    expect(b.kinds()).toEqual(['open', 'closed']);
    (dock as { close(): void } | null)?.close();
  });
  it('a member closed by another member\'s gap handler, both already open, hears no gap', async () => {
    const events: string[] = [];
    let bh: { close(): void } | null = null;
    const mk = (sid: string, onState: (s: StreamState) => void) => sessionStream({ mux, single, sid, key: sid }, { target: TARGET, realm: R1, params: { id: sid }, query: {}, onEvent: () => {}, onState } as StreamInput, budget);
    mk('a', (s) => { events.push('a ' + s.state); if (s.state === 'gap') bh?.close(); });
    bh = mk('b', (s) => events.push('b ' + s.state));
    await settle();
    expect(events).toEqual(['a open', 'b open']);
    muxConns()[0]!.push(`event: x\ndata: ${'x'.repeat(5000)}\n\n`);
    await settle();
    expect(events).toEqual(['a open', 'b open', 'a gap']);
  });
});

describe('a dropped mux', () => {
  it('tells every session once; rejoining, every session resumes from its own cursor in one request, gaps per session', async () => {
    const a = open('a'), b = open('b');
    await settle();
    muxConns()[0]!.push(ev('a', 4) + ev('b', 11, 'message_delta', 'i9'));
    await settle();
    muxConns()[0]!.end();
    await settle();
    expect(a.kinds()).toEqual(['open', 'closed']);
    expect(b.kinds()).toEqual(['open', 'closed']);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    // Each caller resumes with the cursor it applied (Ask's engine does exactly this on error()).
    const a2 = open('a', { cursor: { since: 4, incarnation: 'i1' } }), b2 = open('b', { cursor: { since: 11, incarnation: 'i9' } });
    await settle();
    expect(muxConns().length).toBe(2);
    const c = muxConns()[1]!;
    expect(q(c, 'ids')).toBe('a,b');
    expect(q(c, 'since')).toBe('a:4,b:11');
    expect(q(c, 'incarnation')).toBe('a:i1,b:i9');
    c.push(ctl('session_lagged', { session_id: 'b', code: 'replay_gap', min_seq: 1, max_seq: 2, incarnation: 'i10' }) + ev('a', 5));
    await settle();
    expect(seqs(a2)).toEqual([5]);
    expect(a2.names()).not.toContain('lagged');
    expect(b2.names()).toEqual(['lagged']);
  });
  it('the budget cutting the mux for a better stream: every session gets one closed', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'visible' }), b = open('b', { rank: 'visible' });
    await settle();
    const better = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {} } as StreamInput, { key: 'z', rank: 'open' }, budget);
    await settle(30);
    expect(a.kinds()).toEqual(['open', 'closed']);
    expect(b.kinds()).toEqual(['open', 'closed']);
    expect(live().length).toBe(0);
    better.close();
  });
  it('no slot: every session gets one error {budget}, no request', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const held = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {} } as StreamInput, { key: 'z', rank: 'open' }, budget);
    await settle();
    const a = open('a', { rank: 'visible' }), b = open('b', { rank: 'visible' });
    await settle(20);
    expect(muxConns().length).toBe(0);
    expect(a.kinds()).toEqual(['error']);
    expect((a.states[0] as { code: string }).code).toBe('budget');
    expect(b.kinds()).toEqual(['error']);
    held.close();
  });
  it('a joining session with a better rank raises the group: a dock stream can no longer cut it', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'visible' });
    await settle();
    const b = open('b', { rank: 'open' });
    await settle();
    const states: StreamState[] = [];
    const dock = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {}, onState: (x: StreamState) => states.push(x) } as StreamInput, { key: 'z', rank: 'dock' }, budget);
    await settle(30);
    expect(a.kinds()).toEqual(['open']);
    expect(b.kinds()).toEqual(['open']);
    expect(states.map((x) => x.state)).toEqual(['error']);
    dock.close();
  });
  it('the group rank is the best member\'s: a dock session lifts a visible group past a visible stream', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const other = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 'z' }, onEvent: () => {}, onState: () => {} } as StreamInput, { key: 'z', rank: 'visible' }, budget);
    await settle();
    const a = open('a', { rank: 'dock' });
    await settle(30);
    expect(a.kinds()).toEqual(['open']);
    other.close();
  });
});

describe('the fallback keeps budgetedStream\'s contract exactly', () => {
  it('an agent without the mux route (404): each session opens its own stream with its own cursor, frames and terminal as today', async () => {
    fail = { '/sessions:events': 404 };
    const a = open('a', { cursor: { since: 3, incarnation: 'ia' } }), b = open('b');
    await settle(12);
    expect(muxConns().length).toBe(1);
    expect(singleConns().length).toBe(2);
    const sa = singleConns().find((c) => c.url.pathname.endsWith('/sessions/a/stream'))!;
    expect(q(sa, 'since')).toBe('3');
    expect(q(sa, 'incarnation')).toBe('ia');
    expect(a.kinds()).toEqual(['open']);
    expect(b.kinds()).toEqual(['open']);
    sa.push('event: message_delta\nid: 4\ndata: {"seq":4}\n\n');
    await settle();
    expect(a.events).toEqual([['message_delta', '{"seq":4}', '4']]);
    sa.end();
    await settle();
    expect(a.kinds()).toEqual(['open', 'closed']);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(1);
    // Remembered: the next session goes straight to its own stream.
    open('c');
    await settle();
    expect(muxConns().length).toBe(1);
    expect(singleConns().length).toBe(3);
    b.h.close();
  });
  it('a refused own stream after the fallback is the same one terminal as budgetedStream (error with the status)', async () => {
    fail = { '/sessions:events': 405, '*single': 404 };
    const a = open('a');
    await settle(12);
    expect(a.kinds()).toEqual(['error']);
    expect((a.states[0] as { status: number }).status).toBe(404);
  });
  it('close() after the fallback closes the own stream and frees its slot', async () => {
    fail = { '/sessions:events': 404 };
    const a = open('a');
    await settle(12);
    a.h.close();
    await settle();
    expect(singleConns()[0]!.aborted()).toBe(true);
    expect(budget.slotsInUse(streamComputer(TARGET))).toBe(0);
    expect(a.kinds()).toEqual(['open']);
  });
  it('a second watcher of the same session gets its own stream', async () => {
    open('a');
    const a2 = open('a');
    await settle();
    expect(muxConns().length).toBe(1);
    expect(singleConns().length).toBe(1);
    expect(a2.kinds()).toEqual(['open']);
  });
  it(`past ${MAX_MUX} sessions a session gets its own stream`, async () => {
    const ms = Array.from({ length: MAX_MUX }, (_, i) => open(`s${i}`));
    const extra = open('extra');
    await settle(12);
    expect(q(muxConns()[0]!, 'ids')!.split(',').length).toBe(MAX_MUX);
    expect(singleConns().length).toBe(1);
    expect(extra.kinds()).toEqual(['open']);
    expect(ms.length).toBe(MAX_MUX);
  });
  it('a 404 on a reconnect after a session was told open is a lost stream, never a fallback (no second open, no repeats)', async () => {
    const a = open('a');
    await settle();
    fail = { '/sessions:events': 404 };
    const b = open('b');
    await settle(12);
    expect(muxConns().length).toBe(2);
    expect(singleConns().length).toBe(0);
    expect(a.kinds()).toEqual(['open', 'error']);
    expect(b.kinds()).toEqual(['error']);
  });
  it('a 503 on the mux open is a lost stream for every session (no fallback)', async () => {
    fail = { '/sessions:events': 503 };
    const a = open('a'), b = open('b');
    await settle(12);
    expect(singleConns().length).toBe(0);
    expect(a.kinds()).toEqual(['error']);
    expect(b.kinds()).toEqual(['error']);
    expect((a.states[0] as { status: number }).status).toBe(503);
  });
});

// setRank moves a stream's budget rank in place. Read from the budget: a dock stream at limit 1 is
// refused while the held stream outranks it, and cuts it once it ranks below.
describe('setRank: a rank drop in place', () => {
  const dockStream = (st: StreamState[], key = 'z') => budgetedStream(single, { target: TARGET, realm: R1, params: { id: key }, onEvent: () => {}, onState: (x: StreamState) => st.push(x) } as StreamInput, { key, rank: 'dock' }, budget);
  /** The budget, with every set() its watches get counted. */
  const spied = (b: StreamBudget, sets: unknown[]): StreamBudget => ({
    ...b,
    watch: (spec) => { const w = b.watch(spec); return { ...w, set: (l, r) => { sets.push([l, r]); w.set(l, r); } }; },
  });

  it('a member dropping to bot: the dock is refused before, cuts it after; one connection throughout', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'open' });
    await settle();
    const st1: StreamState[] = [];
    const d1 = dockStream(st1, 'z1');
    await settle(30);
    expect(st1.map((x) => x.state)).not.toContain('open');
    d1.close();
    a.h.setRank('bot');
    expect(muxConns().length).toBe(1);
    const st2: StreamState[] = [];
    const d2 = dockStream(st2, 'z2');
    await settle(30);
    expect(st2.map((x) => x.state)).toContain('open');
    expect(a.kinds()).toEqual(['open', 'closed']);
    expect(muxConns().length).toBe(1);
    d2.close();
  });

  it('a drop that leaves another member at open keeps the group at open; the second drop lowers it', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const a = open('a', { rank: 'open' }), b = open('b', { rank: 'open' });
    await settle();
    a.h.setRank('bot');
    const st1: StreamState[] = [];
    const d1 = dockStream(st1, 'z1');
    await settle(30);
    expect(st1.map((x) => x.state)).not.toContain('open');
    expect(b.kinds()).toEqual(['open']);
    d1.close();
    b.h.setRank('bot');
    const st2: StreamState[] = [];
    const d2 = dockStream(st2, 'z2');
    await settle(30);
    expect(st2.map((x) => x.state)).toContain('open');
    expect(b.kinds()).toEqual(['open', 'closed']);
    d2.close();
  });

  it('the rank it has, or after close(), sends nothing and throws nothing (mux member and budgetedStream)', async () => {
    const sets: unknown[] = [];
    budget = spied(createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 }), sets);
    const a = open('a', { rank: 'visible' });
    const s = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 's' }, onEvent: () => {}, onState: () => {} } as StreamInput, { key: 's', rank: 'dock' }, budget);
    await settle();
    const base = sets.length;
    a.h.setRank('visible');
    s.setRank('dock');
    expect(sets.length).toBe(base);
    a.h.close();
    s.close();
    expect(() => { a.h.setRank('bot'); s.setRank('bot'); }).not.toThrow();
    expect(sets.length).toBe(base);
  });

  // The drop itself must wake allocation. A raw budget watch (a stream that waits; budgetedStream never
  // does) waits from before the drop, nothing else touches the budget after it, and retryMs is far past the test, so
  // only the drop's own set() can admit it.
  it('a dock watch already waiting is admitted by the drop alone (budgetedStream and mux member)', async () => {
    for (const kind of ['single', 'mux'] as const) {
      budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 600000, cutWaitMs: 20 });
      const inc: RankedStream = kind === 'mux'
        ? open('a', { rank: 'open' }).h
        : budgetedStream(single, { target: TARGET, realm: R1, params: { id: 's' }, onEvent: () => {}, onState: () => {} } as StreamInput, { key: 's', rank: 'open' }, budget);
      await settle();
      const w = budget.watch({ computer: streamComputer(TARGET), key: `w-${kind}`, kind: 'session', level: 'stream', rank: 'dock', open: () => ({ close: () => {} }) });
      await settle(30);
      expect(w.mode().mode, kind).not.toBe('stream');
      inc.setRank('bot');
      await settle(80);
      expect(w.mode().mode, kind).toBe('stream');
      w.release();
      inc.close();
    }
  });

  // A handle whose member is over moves nothing, wherever its session went.
  // Each ends with a live member's drop reaching the same spy: a count that stayed still proves nothing without it.
  it('a member that ended on its own: its handle writes nothing to the budget, while another member holds the group', async () => {
    const sets: unknown[] = [];
    budget = spied(createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 }), sets);
    const a = open('a', { rank: 'open' }), b = open('b', { rank: 'dock' });
    await settle();
    muxConns()[0]!.push(ctl('session_end', { session_id: 'a', reason: 'session closed' }));
    await settle();
    expect(a.kinds()).toEqual(['open', 'closed']);
    expect(b.kinds()).toEqual(['open']);
    const base = sets.length;
    a.h.setRank('bot');
    expect(sets.length).toBe(base);
    b.h.setRank('bot');
    expect(sets.length).toBe(base + 1);
    expect(sets.at(-1)).toEqual(['stream', 'bot']);
    b.h.close();
  });

  it('a stale handle does not move the member that replaced it in the same group', async () => {
    const sets: unknown[] = [];
    budget = spied(createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 }), sets);
    const a = open('a', { rank: 'visible' }), b = open('b', { rank: 'dock' });
    await settle();
    muxConns()[0]!.push(ctl('session_end', { session_id: 'a', reason: 'session closed' }));
    await settle();
    expect(a.kinds()).toEqual(['open', 'closed']);
    const a2 = open('a', { rank: 'visible' });
    await settle();
    expect(a2.kinds()).toEqual(['open']);
    // It joined: one live connection carries both sessions, and nothing fell back to a single-session stream.
    expect(live().length).toBe(1);
    expect(q(live()[0]!, 'ids')!.split(',').sort()).toEqual(['a', 'b']);
    expect(singleConns().length).toBe(0);
    const base = sets.length;
    a.h.setRank('bot');
    expect(sets.length).toBe(base);
    a2.h.setRank('dock');
    expect(sets.length).toBe(base + 1);
    expect(sets.at(-1)).toEqual(['stream', 'dock']);
    a2.h.close();
    b.h.close();
  });

  it('a stale handle does not move the group that replaced its own under the same key', async () => {
    const sets: unknown[] = [];
    budget = spied(createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 }), sets);
    const c = open('c', { rank: 'visible' });
    await settle();
    const conns = muxConns().length;
    muxConns().at(-1)!.push(ctl('session_end', { session_id: 'c', reason: 'session closed' }));
    await settle();
    expect(c.kinds()).toEqual(['open', 'closed']);
    const c2 = open('c', { rank: 'visible' });
    await settle();
    expect(c2.kinds()).toEqual(['open']);
    // Its own connection: the first group went with its only member.
    expect(muxConns().length).toBe(conns + 1);
    expect(live().length).toBe(1);
    const base = sets.length;
    c.h.setRank('bot');
    expect(sets.length).toBe(base);
    c2.h.setRank('bot');
    expect(sets.length).toBe(base + 1);
    expect(sets.at(-1)).toEqual(['stream', 'bot']);
    c2.h.close();
  });

  it('a surviving member\'s drop during a reconnect lands: the group\'s rank follows it at once', async () => {
    const sets: unknown[] = [];
    budget = spied(createStreamBudget({ limit: 3, reserve: 0, retryMs: 30, cutWaitMs: 40 }), sets);
    const a = open('a', { rank: 'open' }), b = open('b', { rank: 'dock' });
    await settle();
    expect(muxConns().length).toBe(1);
    // c's join starts the reconnect; a drops before the new connection is up.
    const c = open('c', { rank: 'dock' });
    expect(muxConns().length).toBe(1);
    const base = sets.length;
    expect(sets.at(-1)).toEqual(['stream', 'open']);
    a.h.setRank('bot');
    expect(sets.length).toBe(base + 1);
    expect(sets.at(-1)).toEqual(['stream', 'dock']);
    await settle();
    expect(muxConns().length).toBe(2);
    expect(live().length).toBe(1);
    expect(sets.at(-1)).toEqual(['stream', 'dock']);
    expect(a.kinds().filter((k) => k === 'closed')).toEqual([]);
    a.h.close(); b.h.close(); c.h.close();
  });

  it('budgetedStream dropping to bot: the dock cuts it after, not before; it opened once', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    const st: StreamState[] = [];
    const s = budgetedStream(single, { target: TARGET, realm: R1, params: { id: 's' }, onEvent: () => {}, onState: (x: StreamState) => st.push(x) } as StreamInput, { key: 's', rank: 'open' }, budget);
    await settle();
    const st1: StreamState[] = [];
    const d1 = dockStream(st1, 'z1');
    await settle(30);
    expect(st1.map((x) => x.state)).not.toContain('open');
    d1.close();
    s.setRank('bot');
    const st2: StreamState[] = [];
    const d2 = dockStream(st2, 'z2');
    await settle(30);
    expect(st2.map((x) => x.state)).toContain('open');
    expect(st.map((x) => x.state)).toContain('closed');
    expect(singleConns().filter((c) => c.url.pathname.endsWith('/sessions/s/stream')).length).toBe(1);
    d2.close();
  });
});
