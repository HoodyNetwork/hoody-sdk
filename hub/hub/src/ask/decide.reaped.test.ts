// decide.reaped.test.ts: a decision sent after the gateway reaped the session.
// With no stream and no attachment hold a parked gate counts as idle, and the session closes (the gateway's idle reap).
// /confirm and /answer then fail at the live-session check with 404 'session not live', which the gateway rewrites to 404 not_found;
// a realm-hidden session answers the same 404. A 404 says neither that the gate is gone nor that the decision was refused, so the page
// never offers "decide again" on it and proves nothing: it reads the session back, and that read settles the card (a dormant record has
// nothing parked; a live one still holding the gate keeps it, with the decision unknown and never sent again on its own). A journaled
// engine already reads a 404 as unknown (journal/proof.ts P3); the plain engine now follows the same rule (L.decisionProvesNothing).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import { classifyReply } from './journal/proof';
import { decisionProvesNothing, type AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function parked(script: unknown, o: Record<string, unknown> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script: [script], ...o } as any, clock);
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
  const sid = [...((agent as any).ss as Map<string, unknown>).keys()][0] as string;
  return { agent: agent as any, eng, flush, sid };
}
/** The next decision of `kind` answers 404 not_found (what the gateway says for a session that is not live), once; its request id and
 *  how many decisions reached the agent are recorded. */
function notLive(agent: any, kind: 'confirm' | 'answer'): { rid: () => string; calls: () => number } {
  let rid = '', calls = 0, once = true;
  const real = agent[kind].bind(agent);
  agent[kind] = (sid: string, body: any, realm: string) => {
    calls++;
    if (!once) return real(sid, body, realm);
    once = false; rid = body.request_id ?? '';
    return Promise.reject({ status: 404, code: 'not_found', message: 'session not found' });
  };
  return { rid: () => rid, calls: () => calls };
}
/** The gateway reaped the session while this page was not reading it (a hidden tab, a stream already down): the record is dormant, but
 *  nothing has told the page yet, so its card is still the one it drew. */
const reapQuietly = (agent: any, sid: string) => { agent.ss.get(sid).dormant = true; };
/** Every session read takes `ms` (a slow gateway), so what the page shows while it is out can be seen. */
const slowReads = (agent: any, ms: number) => {
  const real = agent.state.bind(agent);
  agent.state = (...a: unknown[]) => new Promise((res) => agent.clock.set(() => res(real(...a)), ms));
};
/** Access to the session is lost for now (hidden from this caller): every receipt, state and replay read answers 404 until restore(). */
function hideFor(agent: any): { receipts: () => number; readsAfter: () => number; restore: () => void } {
  const real = { receipt: agent.receipt.bind(agent), state: agent.state.bind(agent), replay: agent.replay.bind(agent) };
  let receipts = 0, readsAfter = 0;
  const no = () => Promise.reject({ status: 404, code: 'not_found', message: 'session not found' });
  agent.receipt = () => { receipts++; return no(); };
  agent.state = no; agent.replay = no;
  // Once access returns, the session's state reads are counted: only a retry the page scheduled itself can make one.
  const restore = () => { Object.assign(agent, real, { state: (...x: unknown[]) => { readsAfter++; return real.state(...x); } }); };
  return { receipts: () => receipts, readsAfter: () => readsAfter, restore };
}
/** Nothing else will read the session: the stream is closed (so its quiet watchdog reads nothing) and no read is scheduled. Only a read
 *  the path under test schedules itself can then reach the session. */
const streamDown = (eng: AskEngine) => {
  const e = eng as any;
  if (e.es) { e.es.close(); e.es = null; }
  if (e.rcTimer) { e.cancel(e.rcTimer); e.rcTimer = null; }
};
/** The connection line: neither lost nor reconnecting. */
const connOk = (eng: AskEngine) => (eng as any).conn;
const cards = (eng: AskEngine) => eng.getSnapshot().gates.map((c) => ({ decidable: c.decidable, decision: c.decision }));

describe('a decision answered 404 not_found is not a refusal: the session is read back', () => {
  it('reaped (an approval): no card to decide again, nothing proved refused, and the read finds the chat dormant', async () => {
    const t = await parked(scripts.approval);
    expect(cards(t.eng)).toEqual([{ decidable: true, decision: null }]);
    reapQuietly(t.agent, t.sid);
    slowReads(t.agent, 300);
    const n = notLive(t.agent, 'confirm');
    t.eng.decide('once');
    await t.flush(50);
    // While the read is out the card is not offered again: the decision's fate is not known yet.
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    expect(t.eng.decisionProof(n.rid())).toBeUndefined();
    await t.flush(1000);
    expect(cards(t.eng)).toEqual([]);
    expect(t.eng.getSnapshot().dormant).toBe(true);
    expect(t.eng.decisionProof(n.rid())).toBeUndefined();
    expect(n.calls()).toBe(1);
  });

  it('reaped (a question): the same for an answer', async () => {
    const t = await parked(scripts.question);
    expect(cards(t.eng)).toEqual([{ decidable: true, decision: null }]);
    reapQuietly(t.agent, t.sid);
    slowReads(t.agent, 300);
    const n = notLive(t.agent, 'answer');
    t.eng.answer('main');
    await t.flush(50);
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    await t.flush(1000);
    expect(cards(t.eng)).toEqual([]);
    expect(t.eng.getSnapshot().dormant).toBe(true);
    expect(n.calls()).toBe(1);
  });

  it('the read finds the session live with the gate still parked: the decision stays unknown and is never sent again on its own', async () => {
    const t = await parked(scripts.approval);
    const n = notLive(t.agent, 'confirm');
    t.eng.decide('once');
    await t.flush(2000);
    expect(t.agent.parked(t.sid).lead.length).toBe(1);
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    expect(t.eng.decisionProof(n.rid())).toBeUndefined();
    expect(n.calls()).toBe(1);
    expect(t.eng.getSnapshot().dormant).toBe(false);
  });

  it('the definite refusals are unchanged: a gate named gone, and a refusal that names no gate, are proved refused', async () => {
    for (const [status, code] of [[409, 'stale_gate'], [409, 'no_pending_gate'], [403, 'forbidden'], [400, 'bad_request']] as const) {
      const t = await parked(scripts.approval);
      let rid = '';
      const real = t.agent.confirm.bind(t.agent);
      t.agent.confirm = (_sid: string, body: any) => { rid = body.request_id; t.agent.confirm = real; return Promise.reject({ status, code }); };
      t.eng.decide('once');
      await t.flush(1000);
      expect(t.eng.decisionProof(rid), code).toBe('refused');
      expect(t.eng.attemptOf(t.eng.getSnapshot().gates[0]?.key ?? 'none'), code).toBeUndefined();
    }
  });

  it('a 404 that names this request as resolved still proves nothing: the card is read back, never shown applied', async () => {
    const t = await parked(scripts.approval);
    let rid = '', calls = 0;
    const real = t.agent.confirm.bind(t.agent);
    t.agent.confirm = (sid: string, body: any, realm: string) => {
      calls++;
      if (calls > 1) return real(sid, body, realm);
      rid = body.request_id;
      return Promise.reject({ status: 404, code: 'gate_already_resolved', details: { request_id: rid, outcome: 'answered' } });
    };
    t.eng.decide('once');
    await t.flush(2000);
    expect(t.eng.decisionProof(rid)).toBeUndefined();
    expect(t.agent.parked(t.sid).lead.length).toBe(1);
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    expect(calls).toBe(1);
  });

  it('the read back answers 404 too (the session hidden for now): the chat is not called gone, and the read is tried again', async () => {
    const t = await parked(scripts.approval);
    const n = notLive(t.agent, 'confirm');
    let hidden = 2, reads = 0;
    const real = t.agent.state.bind(t.agent);
    t.agent.state = (...a: unknown[]) => { reads++; if (hidden > 0) { hidden--; return Promise.reject({ status: 404, code: 'not_found', message: 'session not found' }); } return real(...a); };
    t.eng.decide('once');
    await t.flush(50);
    expect(reads).toBeGreaterThan(0);
    expect(t.eng.getSnapshot().blocked).toBeNull();
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    await t.flush(30000);
    // Access came back: the read found the session live with the gate still parked.
    expect(hidden).toBe(0);
    expect(reads).toBeGreaterThan(2);
    expect(t.eng.getSnapshot().blocked).toBeNull();
    expect(t.eng.getSnapshot().phase).toBe('ready');
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    expect(t.eng.decisionProof(n.rid())).toBeUndefined();
    expect(n.calls()).toBe(1);
  });

  it('with no decision in doubt, a read that answers 404 still means the chat is gone', async () => {
    const t = await parked(scripts.approval);
    const real = t.agent.state.bind(t.agent);
    t.agent.state = () => Promise.reject({ status: 404, code: 'not_found', message: 'session not found' });
    t.eng.wake();
    await t.flush(5000);
    t.agent.state = real;
    expect(t.eng.getSnapshot().blocked?.key).toBe('ask.gone');
  });

  it('the dock resumes with the turn running while access is lost for now: a 404 receipt is not called gone, and the chat recovers', async () => {
    const t = await parked(scripts.approval);
    const n = notLive(t.agent, 'confirm');
    t.eng.decide('once');
    await t.flush(50);
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    const off = hideFor(t.agent);
    t.eng.suspend();
    t.eng.resume();
    await t.flush(200);
    expect(off.receipts()).toBeGreaterThan(0);
    expect(t.eng.getSnapshot().blocked).toBeNull();
    expect(connOk(t.eng)).toEqual({ lost: true, reconnecting: true });
    off.restore();
    await t.flush(30000);
    // The page read the session again by itself, and the connection came back.
    expect(off.readsAfter()).toBeGreaterThan(0);
    expect(connOk(t.eng)).toEqual({ lost: false, reconnecting: false });
    expect(t.eng.getSnapshot().blocked).toBeNull();
    expect(t.eng.getSnapshot().phase).toBe('ready');
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    expect(n.calls()).toBe(1);
  });

  it('a receipt poll answered 404 while a decision is in doubt is not called gone; the session is read again', async () => {
    const t = await parked(scripts.approval);
    notLive(t.agent, 'confirm');
    t.eng.decide('once');
    await t.flush(50);
    const off = hideFor(t.agent);
    // The receipt poll's entry (a finished or ended turn reads its receipt; the poll repeats it).
    (t.eng as any).receipt();
    await t.flush(200);
    expect(off.receipts()).toBeGreaterThan(0);
    expect(t.eng.getSnapshot().blocked).toBeNull();
    off.restore();
    await t.flush(30000);
    expect(off.readsAfter()).toBeGreaterThan(0);
    expect(connOk(t.eng)).toEqual({ lost: false, reconnecting: false });
    expect(t.eng.getSnapshot().blocked).toBeNull();
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
  });

  it('only the hidden receipt\'s own retry reads again: a receipt poll with nothing else reading recovers by itself', async () => {
    const t = await parked(scripts.approval);
    notLive(t.agent, 'confirm');
    t.eng.decide('once');
    await t.flush(2000);
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
    streamDown(t.eng);
    const off = hideFor(t.agent);
    (t.eng as any).receipt();
    await t.flush(200);
    expect(off.receipts()).toBe(1);
    off.restore();
    await t.flush(30000);
    expect(off.readsAfter()).toBeGreaterThan(0);
    expect(connOk(t.eng)).toEqual({ lost: false, reconnecting: false });
    expect(t.eng.getSnapshot().blocked).toBeNull();
  });

  it('only the resync\'s own retry reads again: Check status while access is lost recovers by itself once it returns', async () => {
    const t = await parked(scripts.approval);
    notLive(t.agent, 'confirm');
    t.eng.decide('once');
    await t.flush(2000);
    streamDown(t.eng);
    const off = hideFor(t.agent);
    t.eng.checkNow();
    await t.flush(200);
    expect(off.receipts()).toBe(1);
    expect(connOk(t.eng)).toEqual({ lost: true, reconnecting: true });
    off.restore();
    await t.flush(30000);
    expect(off.readsAfter()).toBeGreaterThan(0);
    expect(connOk(t.eng)).toEqual({ lost: false, reconnecting: false });
    expect(t.eng.getSnapshot().blocked).toBeNull();
    expect(cards(t.eng)).toEqual([{ decidable: false, decision: 'unknown' }]);
  });

  it('one rule for both engines: the journal reads every 404 decision reply as unknown, and so does the plain engine', () => {
    for (const route of ['confirm', 'answer'] as const) {
      for (const code of ['not_found', 'session_not_found', 'stale_gate']) {
        const v = classifyReply({ acct: ACCOUNT, h: 'h1', k: 'k1', route, gate: 'G1', gen: 1 } as any, { ok: false, e: { status: 404, code } });
        expect(v.t, `${route} ${code}`).toBe('unknown');
      }
    }
    expect(decisionProvesNothing(404)).toBe(true);
    for (const st of [400, 403, 409, 410, 429, 500, undefined]) expect(decisionProvesNothing(st), String(st)).toBe(false);
  });
});
