// liveIO().stream over the multiplexed agent stream: Ask's sessions on one computer and realm share one
// GET /sessions:events connection and one budget slot; frames reach only their own session's handlers; an agent
// without the route falls back to each session's own stream.
import { streamBudget, type Target } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveIO, type StreamHandlers } from './data';
import { resetPauseBusForTests, subscribePause } from './pauseBus';

const computer = (t: Target): string => `${t.project.id}/${t.container.id}`;
const route = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const gets = (p: RegExp): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === 'GET' && p.test(route(c)));
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };
function handlers() {
  const log: string[] = [];
  const h: StreamHandlers = { open: () => log.push('open'), frame: (n, raw) => log.push(`${n} ${JSON.parse(raw).seq ?? ''}`.trim()), error: () => log.push('error') };
  return { h, log };
}
const frame = (sid: string, seq: number) => `event: turn_started\ndata: ${JSON.stringify({ session_id: sid, seq, incarnation: 'i1', event: { type: 'event.turn_started' } })}\n\n`;

describe('liveIO().stream over the multiplexed stream', () => {
  afterEach(() => streamBudget().reset());

  describe('an agent that multiplexes its streams', () => {
    beforeEach(() => {
      boot({ realm: R1 });
      onFetch((c: Call): Reply => (c.method === 'GET' && route(c) === '/sessions:events'
        ? { status: 200, headers: { 'content-type': 'text/event-stream' }, text: frame('s1', 4) + frame('s2', 9) + frame('s1', 5), delayMs: 5 }
        : { status: 404, body: { code: 'not_found' } }));
    });
    it('two sessions: one /sessions:events request with both ids and both cursors, one budget slot, each sees its own frames', async () => {
      const a = handlers(), b = handlers();
      let during = -1;
      const base = a.h.open;
      a.h.open = () => { during = streamBudget().slotsInUse(computer(TARGET)); base(); };
      liveIO(TARGET).stream('s1', { since: 3, incarnation: 'i1' }, R1, a.h);
      liveIO(TARGET).stream('s2', null, R1, b.h);
      await settle(20);
      const mux = gets(/^\/sessions:events$/);
      expect(mux.length).toBe(1);
      const u = new URL(mux[0]!.url);
      expect(u.searchParams.get('ids')).toBe('s1,s2');
      expect(u.searchParams.get('since')).toBe('s1:3');
      expect(u.searchParams.get('incarnation')).toBe('s1:i1');
      expect(u.searchParams.get('realm')).toBe(R1);
      expect(gets(/\/stream$/).length).toBe(0);
      expect(during).toBe(1);
      expect(a.log).toEqual(['open', 'turn_started 4', 'turn_started 5', 'error']);
      expect(b.log).toEqual(['open', 'turn_started 9', 'error']);
    });
  });

  describe('an agent without the multiplexed stream', () => {
    beforeEach(() => {
      boot({ realm: R1 });
      onFetch((c: Call): Reply => (c.method === 'GET' && route(c) === '/sessions/s1/stream'
        ? { status: 200, headers: { 'content-type': 'text/event-stream' }, text: 'event: turn_started\nid: 1\ndata: {"seq":1}\n\n' }
        : { status: 404, body: { code: 'not_found' } }));
    });
    it('the session opens its own stream with its own cursor, as before', async () => {
      const a = handlers();
      liveIO(TARGET).stream('s1', { since: 7, incarnation: 'i1' }, R1, a.h);
      await settle(20);
      expect(gets(/^\/sessions:events$/).length).toBe(1);
      const own = gets(/^\/sessions\/s1\/stream$/);
      expect(own.length).toBe(1);
      expect(new URL(own[0]!.url).searchParams.get('since')).toBe('7');
      expect(a.log).toEqual(['open', 'turn_started 1', 'error']);
      expect(streamBudget().slotsInUse(computer(TARGET))).toBe(0);
    });
  });
});

describe('liveIO().stream tees pause_state to the pause bus', () => {
  afterEach(() => { streamBudget().reset(); resetPauseBusForTests(); });
  const pauseFrame = `event: pause_state\ndata: ${JSON.stringify({ session_id: 's1', seq: 7, incarnation: 'i1', event: { type: 'event.pause_state', data: { paused: true, since_ms: 1700000000000, gen: 3 } } })}\n\n`;
  beforeEach(() => {
    boot({ realm: R1 });
    onFetch((c: Call): Reply => (c.method === 'GET' && route(c) === '/sessions:events'
      ? { status: 200, headers: { 'content-type': 'text/event-stream' }, text: frame('s1', 6) + pauseFrame, delayMs: 5 }
      : { status: 404, body: { code: 'not_found' } }));
  });
  it('the computer\'s subscriber gets the state, and the session\'s own handler still gets the frame', async () => {
    const got: unknown[] = [];
    subscribePause(TARGET.container.id, (s) => got.push(s));
    const a = handlers();
    liveIO(TARGET).stream('s1', null, R1, a.h);
    await settle(20);
    expect(got).toEqual([{ paused: true, sinceMs: 1700000000000, gen: 3 }]);
    expect(a.log).toEqual(['open', 'turn_started 6', 'pause_state 7', 'error']);
  });
  it('another computer\'s subscriber gets nothing', async () => {
    const got: unknown[] = [];
    subscribePause('some-other-computer', (s) => got.push(s));
    liveIO(TARGET).stream('s1', null, R1, handlers().h);
    await settle(20);
    expect(got).toEqual([]);
  });
});
