// liveIO().stream (Ask and the GitHub run follower) goes through the stream budget: ranks dock / visible,
// a stream the budget has no slot for ends with error() like a lost connection, and the callers retry as they do.
import { streamBudget, type Rank, type Target } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveIO, type StreamHandlers } from './data';

const computer = (t: Target): string => `${t.project.id}/${t.container.id}`;
const route = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const streamGets = (): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === 'GET' && route(c) === '/sessions/s1/stream');
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };
function handlers() {
  const log: string[] = [];
  const h: StreamHandlers = { open: () => log.push('open'), frame: (n) => log.push('frame ' + n), error: () => log.push('error') };
  return { h, log };
}
function hold(n: number, rank: Rank, closed: string[] = []) {
  return Array.from({ length: n }, (_, i) => streamBudget().watch({ computer: computer(TARGET), key: `h${rank}${i}`, kind: 'session', level: 'stream', rank, open: () => ({ close: () => { closed.push(`h${rank}${i}`); } }) }));
}

describe('liveIO().stream through the stream budget', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    onFetch((c: Call): Reply => (c.method === 'GET' && route(c) === '/sessions/s1/stream'
      ? { status: 200, headers: { 'content-type': 'text/event-stream' }, text: 'event: turn_started\nid: 1\ndata: {"seq":1}\n\n' }
      : { status: 404, body: { code: 'not_found' } }));
  });
  afterEach(() => streamBudget().reset());

  it('a free slot: the stream holds one slot while it is open and its frames arrive; the server ending it tells the caller once and frees the slot', async () => {
    const { h, log } = handlers();
    let during = -1;
    const base = h.open;
    h.open = () => { during = streamBudget().slotsInUse(computer(TARGET)); base(); };
    const s = liveIO(TARGET).stream('s1', null, R1, h);
    await settle();
    expect(streamGets().length).toBe(1);
    expect(during).toBe(1);
    expect(log).toEqual(['open', 'frame turn_started', 'error']);
    expect(streamBudget().slotsInUse(computer(TARGET))).toBe(0);
    s!.close();
    expect(log.length).toBe(3);
  });
  it('no slot (seven better streams hold them all): no request, one error()', async () => {
    const held = hold(7, 'open');
    await settle();
    const { h, log } = handlers();
    liveIO(TARGET).stream('s1', null, R1, h);
    await settle();
    expect(streamGets().length).toBe(0);
    expect(log).toEqual(['error']);
    held.forEach((x) => x.release());
  });
  it('Ask\'s default rank is dock: it takes a slot from a visible stream, which is closed', async () => {
    const closed: string[] = [];
    const held = hold(7, 'visible', closed);
    await settle();
    const { h, log } = handlers();
    liveIO(TARGET).stream('s1', null, R1, h);
    await settle(30);
    expect(streamGets().length).toBe(1);
    expect(log).toContain('open');
    expect(closed.length).toBe(1);
    held.forEach((x) => x.release());
  });
  it('the GitHub follower asks for visible: an equal rank takes nothing, so against seven visible streams it gets no slot', async () => {
    const held = hold(7, 'visible');
    await settle();
    const { h, log } = handlers();
    liveIO(TARGET).stream('s1', null, R1, h, 'visible');
    await settle(30);
    expect(streamGets().length).toBe(0);
    expect(log).toEqual(['error']);
    held.forEach((x) => x.release());
  });
});
