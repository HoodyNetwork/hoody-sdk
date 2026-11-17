// Vitest: a decision another tab, client or person applied first is said so in one line
// ("Decided in another tab or app"), never a silent close; a gate that ended any other way (timed out, superseded)
// closes as before, and this page's own decision still folds to its own line.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import type { AskStore } from './logic';
import strings from '@kit/agent/Conversation.strings.en.json';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const OTHER = 'hx-ffffffffffffffffffffffff';

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function parkedGate() {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script: [scripts.approval] }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  eng.setAuto(false);
  eng.send('Add a chart');
  await flush(500);
  expect(eng.getSnapshot().gate).toMatchObject({ kind: 'confirm', tool: 'bash' });
  return { agent, eng, flush };
}
/** Another tab's decision lands first; this page's then gets the agent's refusal with the given details. */
function beatenBy(agent: any, details: Record<string, unknown>, decideFirst = true) {
  const real = agent.confirm.bind(agent);
  agent.confirm = (sid: string, body: any, realm: string) => {
    agent.confirm = real;
    if (decideFirst) void real(sid, { ...body, request_id: OTHER }, realm);
    return Promise.reject({ status: 409, code: 'gate_already_resolved', details });
  };
}
const decided = (eng: AskEngine) => C.blocks(eng.getSnapshot().conv, 0).filter((b) => b.k === 'decided').map((b: any) => b.d);

describe('a decision applied elsewhere first', () => {
  it('the card closes with one "Decided in another tab or app" line naming the action', async () => {
    const t = await parkedGate();
    beatenBy(t.agent, { outcome: 'answered', decision: 'approved', request_id: OTHER });
    t.eng.decide('once');
    await t.flush(1000);
    expect(decided(t.eng)).toEqual([{ kind: 'elsewhere', tool: 'bash', text: 'npm install chart.js', step: expect.any(Number) }]);
    expect(t.eng.getSnapshot().gate).toBeNull();
    expect((strings as Record<string, string>)['agent.d.elsewhere']).toBe('Decided in another tab or app');
  });
  it('a denial elsewhere reads the same: which way it went is the other side\'s, never shown as this page\'s', async () => {
    const t = await parkedGate();
    beatenBy(t.agent, { outcome: 'answered', decision: 'denied', request_id: OTHER });
    t.eng.decide('deny', 'Not now');
    await t.flush(1000);
    expect(decided(t.eng).map((d) => d.kind)).toEqual(['elsewhere']);
  });
  it('a gate that ended another way (timed out, superseded) closes as before, with no line', async () => {
    const t = await parkedGate();
    beatenBy(t.agent, { outcome: 'timeout' }, false);
    t.eng.decide('once');
    await t.flush(50);
    expect(decided(t.eng)).toEqual([]);
  });
  it('this page\'s own decision, refused as already applied, still folds to its own line', async () => {
    const t = await parkedGate();
    const real = (t.agent as any).confirm.bind(t.agent);
    (t.agent as any).confirm = (sid: string, body: any, realm: string) => {
      (t.agent as any).confirm = real;
      void real(sid, body, realm);
      return Promise.reject({ status: 409, code: 'gate_already_resolved', details: { outcome: 'answered', decision: 'approved', request_id: body.request_id } });
    };
    t.eng.decide('once');
    await t.flush(1000);
    expect(decided(t.eng).map((d) => d.kind)).toEqual(['once']);
  });
});
