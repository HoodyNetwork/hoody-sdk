// The writer's wait for its turn (writer.ts waitStep) goes through the stream budget: the stream only nudges
// the next receipt read, so a budget that has no slot for it changes nothing but speed. Over core's real request path.
import { dropScriptAsks, readScriptAsks, streamBudget, type Target } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { advance, claimAnswer, forgetRuns, startRun, timing, type WriterRun } from './writer';

const route = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const streamGets = (): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === 'GET' && route(c) === '/sessions/s1/stream');
const ANSWER = 'Summary: it works\n```ts\nreturn 1;\n```';
const text = (t: string) => ({ kind: 'text', text: t });
let reads = 0;
let slotAtStream = -1;
function handler(c: Call): Reply {
  const p = route(c);
  if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: { turn_id: 't1', state: reads++ ? 'completed' : 'dispatched' } };
  if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: { messages: [{ role: 'user', blocks: [text('write it')] }, { role: 'assistant', blocks: [text(ANSWER)] }] } };
  if (c.method === 'GET' && p === '/sessions/s1/stream') { slotAtStream = streamBudget().slotsInUse(computer(TARGET)); return { status: 200, headers: { 'content-type': 'text/event-stream' }, text: '', delayMs: 60000 }; }
  return { status: 404, body: { code: 'not_found' } };
}
const env = { target: TARGET, realm: R1, owner: 'fp1' };
const begin = (): WriterRun => ({ ...startRun({ compId: 'c1', path: null, text: 'write it', realm: R1, owner: 'fp1' }, env, () => 'key-1'), sid: 's1', turnId: 't1', phase: 'wait' });
const computer = (t: Target): string => `${t.project.id}/${t.container.id}`;

describe('the writer waits through the stream budget', () => {
  beforeEach(async () => {
    boot({ realm: R1 });
    reads = 0; slotAtStream = -1;
    onFetch(handler);
    forgetRuns();
    const all = readScriptAsks();
    if (Array.isArray(all)) await dropScriptAsks(all);
    Object.assign(timing, { everyMs: 5, wakeMs: 2, maxMs: 3000 });
  });
  afterEach(() => { forgetRuns(); streamBudget().reset(); });

  it('with a free slot it reads the stream (one GET) holding a slot while it waits, and gives it back the moment the run ends', async () => {
    const r = await advance(begin());
    await claimAnswer(r);
    expect(r.outcome).toBe('done');
    expect(streamGets().length).toBe(1);
    expect(slotAtStream).toBe(1);
    // The stream would stay open for a minute: only the writer's own close() frees the slot now.
    expect(streamBudget().slotsInUse(computer(TARGET))).toBe(0);
  });
  it('with every slot held by dock streams it opens no stream, and the receipts still decide', async () => {
    const held = Array.from({ length: 7 }, (_, i) => streamBudget().watch({ computer: computer(TARGET), key: `o${i}`, kind: 'session', level: 'stream', rank: 'dock', open: () => ({ close: () => {} }) }));
    await new Promise((r) => setTimeout(r, 20));
    const r = await advance(begin());
    await claimAnswer(r);
    expect(r.outcome).toBe('done');
    expect(streamGets().length).toBe(0);
    held.forEach((x) => x.release());
  });
});
