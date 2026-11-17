// The engine's per-request decision bookkeeping (decisionProof / attemptOf / unknownDecisions). It is read only; the adapter
// judges a decision by it and by nothing else (C9): `applied` only when the agent took exactly this request, `elsewhere` when another
// request won the gate, `refused` for a definite refusal, and nothing at all while it is not known.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import type { AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const OTHER = 'hx-ffffffffffffffffffffffff';

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function parkedGate(o: Record<string, unknown> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script: [scripts.approval], ...o } as any, clock);
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
/** The request id of the next decision this page sends. */
function ridOf(agent: any): { rid: () => string; real: (sid: string, body: any, realm: string) => Promise<unknown> } {
  let rid = '';
  const real = agent.confirm.bind(agent);
  agent.confirm = (sid: string, body: any, realm: string) => { rid = body.request_id; agent.confirm = real; return agent.__next ? agent.__next(sid, body, realm) : real(sid, body, realm); };
  return { rid: () => rid, real };
}

describe('decisionProof: what each outcome of a decision is recorded as', () => {
  it('a decision the agent took is applied', async () => {
    const t = await parkedGate();
    const r = ridOf(t.agent);
    t.eng.decide('once');
    await t.flush(1000);
    expect(t.eng.decisionProof(r.rid())).toBe('applied');
  });

  it('another request won the gate (409 naming a different request): elsewhere, never applied', async () => {
    const t = await parkedGate();
    const r = ridOf(t.agent);
    (t.agent as any).__next = () => Promise.reject({ status: 409, code: 'gate_already_resolved', details: { outcome: 'answered', decision: 'approved', request_id: OTHER } });
    t.eng.decide('once');
    await t.flush(1000);
    expect(t.eng.decisionProof(r.rid())).toBe('elsewhere');
  });

  it('a definite refusal that is not "won elsewhere" (gate ended by timeout, stale gate) is refused, never applied', async () => {
    for (const [code, details] of [['gate_already_resolved', { outcome: 'timeout' }], ['stale_gate', {}]] as const) {
      const t = await parkedGate();
      const r = ridOf(t.agent);
      (t.agent as any).__next = () => Promise.reject({ status: 409, code, details });
      t.eng.decide('once');
      await t.flush(1000);
      expect(t.eng.decisionProof(r.rid()), code).toBe('refused');
    }
  });

  it('thin evidence is no proof: a non-409 reply naming our request, or a 409 answered with no request id', async () => {
    const t = await parkedGate();
    const r = ridOf(t.agent);
    (t.agent as any).__next = (sid: string, body: any, realm: string) => {
      void r.real(sid, body, realm);
      return Promise.reject({ status: 503, code: 'gate_already_resolved', details: { outcome: 'answered', decision: 'approved', request_id: body.request_id } });
    };
    t.eng.decide('once');
    await t.flush(1000);
    expect(t.eng.decisionProof(r.rid()), '503 naming our request id').toBeUndefined();
    const u = await parkedGate();
    const q = ridOf(u.agent);
    (u.agent as any).__next = () => Promise.reject({ status: 409, code: 'gate_already_resolved', details: { outcome: 'answered', decision: 'approved' } });
    u.eng.decide('once');
    await u.flush(1000);
    expect(u.eng.decisionProof(q.rid()), 'answered with no request id: refused, never elsewhere').toBe('refused');
    const v = await parkedGate();
    const z = ridOf(v.agent);
    (v.agent as any).__next = () => Promise.reject({ status: 400, code: 'gate_already_resolved', details: { outcome: 'answered', decision: 'approved', request_id: OTHER } });
    v.eng.decide('once');
    await v.flush(1000);
    expect(v.eng.decisionProof(z.rid()), 'a 400 naming another request: refused, never elsewhere').toBe('refused');
  });

  it('this page’s own request named as already applied is applied', async () => {
    const t = await parkedGate();
    const r = ridOf(t.agent);
    (t.agent as any).__next = (sid: string, body: any, realm: string) => {
      void r.real(sid, body, realm);
      return Promise.reject({ status: 409, code: 'gate_already_resolved', details: { outcome: 'answered', decision: 'approved', request_id: body.request_id } });
    };
    t.eng.decide('once');
    await t.flush(1000);
    expect(t.eng.decisionProof(r.rid())).toBe('applied');
  });

  it('a resolution frame whose request id is not ours proves nothing: the answer was lost, the frame is the gateway’s own', async () => {
    const t = await parkedGate({ decisionLost: true, decisionLag: 200 });
    const r = ridOf(t.agent);
    t.eng.decide('once');
    await t.flush(1500);
    expect(r.rid()).not.toBe('');
    // the gate closed on the frame, but the frame does not name this request: no proof either way
    expect(t.eng.decisionProof(r.rid())).toBeUndefined();
  });
});

describe('attemptOf and unknownDecisions: only this page’s own attempts', () => {
  it('an attempt imported from another tab (not ours) is neither returned nor listed as ours', async () => {
    const t = await parkedGate();
    const attempts: Map<string, any> = (t.eng as any).attempts;
    attempts.set('theirs', { rid: 'hx-theirs', status: 'unknown', kind: 'once', tool: '', text: '', own: false, tok: 1 });
    attempts.set('ours', { rid: 'hx-ours', status: 'unknown', kind: 'once', tool: '', text: '', own: true, tok: 2 });
    expect(t.eng.attemptOf('theirs')).toBeUndefined();
    expect(t.eng.attemptOf('ours')).toEqual({ rid: 'hx-ours', status: 'unknown' });
    expect(t.eng.unknownDecisions()).toEqual(['hx-ours']);
  });
});
