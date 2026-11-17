// Acceptance tests (through seam.ts), group ENGINE: AskEngine + FakeAgent over the real journal on the production-faithful storage. The rule: an
// unknown outcome is never shown as done or failed (C9), and an entry (evidence that a request may have left) leaves the store
// only on proof. Each test names the case it pins; the "control:" tests pin the baseline behaviour.
//
// FakeAgent.confirm() answers `{}`. The agent's documented success body is `{status:"ok"}` (openapi: "the
// success signal is status ok"), and several tests below treat any other fulfilled body as NOT proof. The control test
// uses the `{status:'ok'}` body explicitly.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import * as C from '../conv';
import { scripts } from '../fake';
import { HANDLE, REQ, KEY, posts, settleReal, storedEntries, users, world, type World } from './env';
import { sweepReadFaults } from './storage-fake';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const unknownGate = (e: any) => e.getSnapshot().gates.some((g: any) => g.decision === 'unknown');
const decisions = (x: World) => storedEntries(x.fs).filter((e) => e.kind === 'decision');
const lastUser = (e: any) => users(e.getSnapshot(), C).at(-1);
const NOT_FOUND = { status: 404, code: 'not_found' };

/** An approval is parked and auto-approve is off. */
async function parked(o: Record<string, unknown> = {}) {
  w = world({ script: [scripts.approval], ...o });
  const eng = await w.dock();
  eng.setAuto(false);
  eng.send('Add a chart');
  await w.flush(500);
  expect(eng.getSnapshot().gates.length).toBeGreaterThan(0);
  return eng;
}

describe('a fulfilled decision reply proves nothing unless it is the documented success', () => {
  for (const [label, reply] of [['null', null], ['the string "pending"', 'pending'], ['{pending:true}', { pending: true }], ['{status:"pending"}', { status: 'pending' }], ['an array', []], ['a number', 7], ['{status:"error"}', { status: 'error' }]] as const) {
    it(`confirm resolving ${label}: the decision entry stays and the card says not sure`, async () => {
      const eng = await parked();
      (w!.agent as any).confirm = () => Promise.resolve(reply);
      eng.decide('once');
      await w!.flush(400);
      expect(decisions(w!)).toHaveLength(1);
      expect(unknownGate(eng)).toBe(true);
    });
  }
  it('control: the documented success {status:"ok"} settles: the entry goes and nothing is unknown', async () => {
    const eng = await parked();
    (w!.agent as any).confirm = () => Promise.resolve({ status: 'ok' });
    eng.decide('once');
    await w!.flush(400);
    expect(decisions(w!)).toHaveLength(0);
    expect(unknownGate(eng)).toBe(false);
  });
});

describe('a gate-resolution frame settles a decision only if it says something', () => {
  it('an event.gate_resolved naming neither an outcome nor a request id, then 409 stale_gate: the entry stays', async () => {
    const eng = await parked();
    let rej: (e: unknown) => void = () => {};
    (w!.agent as any).confirm = () => new Promise((_, r) => { rej = r; });
    eng.decide('once');
    await w!.flush(50);
    const sid = eng.record!.s!;
    const g = (w!.agent as any).ss.get(sid).gate;
    (w!.agent as any).emit(sid, undefined, 'event.gate_resolved', { kind: 'confirm', gate_id: g.dnum }, { id: g.id, generation: g.generation, type: 'confirm' });
    await w!.flush(50);
    rej({ status: 409, code: 'stale_gate' });
    await w!.flush(400);
    expect(decisions(w!), 'a frame with no outcome and no request id is not proof; neither is a bare 409').toHaveLength(1);
  });
  it('control: a frame with an outcome, then 409 stale_gate, settles (the gate was decided by someone)', async () => {
    const eng = await parked();
    let rej: (e: unknown) => void = () => {};
    (w!.agent as any).confirm = () => new Promise((_, r) => { rej = r; });
    eng.decide('once');
    await w!.flush(50);
    const sid = eng.record!.s!;
    const g = (w!.agent as any).ss.get(sid).gate;
    (w!.agent as any).emit(sid, undefined, 'event.gate_resolved', { kind: 'confirm', gate_id: g.dnum, outcome: 'answered' }, { id: g.id, generation: g.generation, type: 'confirm' });
    await w!.flush(50);
    rej({ status: 409, code: 'stale_gate' });
    await w!.flush(400);
    expect(decisions(w!)).toHaveLength(0);
  });
});

describe('a retired-key 409 is a refusal only when it says the request was not admitted', () => {
  type Route = 'create' | 'turn' | 'command';
  const CODES: Record<Route, string> = { create: 'create_key_retired', turn: 'turn_key_retired', command: 'command_key_retired' };
  async function failing(route: Route, err: unknown) {
    if (route === 'command') {
      w = world({ pace: 400 });
      const eng = await w.dock();
      eng.send('Build me a small dashboard');
      await w.flush(450);
      (w.agent as any).command = () => Promise.reject(err);
      eng.send('Also add a README');
      await w.flush(500);
      return eng;
    }
    w = world();
    const eng = await w.dock();
    if (route === 'create') {
      (w.agent as any).create = () => Promise.reject(err);
      eng.send('Build me a small dashboard');
      await w.flush(500);
      return eng;
    }
    eng.send('Build me a small dashboard');
    await w.flush(2000);
    (w.agent as any).turn = () => Promise.reject(err);
    eng.send('And a second look');
    await w.flush(500);
    return eng;
  }
  for (const route of ['create', 'turn', 'command'] as const) {
    for (const [label, details] of [['admitted:"unknown"', { admitted: 'unknown' }], ['no details', undefined], ['admitted:"true"', { admitted: 'true' }]] as const) {
      it(`${route}: 409 ${CODES[route]} with ${label}: the entry stays and the row is not sure, never Not sent`, async () => {
        const eng = await failing(route, { status: 409, code: CODES[route], ...(details ? { details } : {}) });
        expect(storedEntries(w!.fs).length, 'the request may have run: its entry is the only evidence').toBe(1);
        expect(lastUser(eng)?.state).toBe('unknown');
      });
    }
    it(`control: ${route}: 409 ${CODES[route]} with admitted:"false" is a definite refusal: Not sent, entry gone`, async () => {
      const eng = await failing(route, { status: 409, code: CODES[route], details: { admitted: 'false' } });
      expect(storedEntries(w!.fs)).toHaveLength(0);
      expect(lastUser(eng)?.state).toBe('notSent');
    });
  }
});

describe('an unreadable request store concludes nothing about an adopted decision', () => {
  /** A's decision answer is lost; B (another tab) adopts the unknown decision. */
  async function adopted() {
    w = world({ script: [scripts.approval], decisionLost: true, decisionLag: 1e9 });
    const a = await w.dock();
    a.setAuto(false);
    a.send('Add a chart');
    await w.flush(500);
    a.decide('once');
    await w.flush(400);
    const b = w.pinned(a.record!.s!, 'B');
    b.open();
    await w.flush(900);
    expect(unknownGate(b), 'B adopted the unknown decision').toBe(true);
    expect(decisions(w)).toHaveLength(1);
    return { a, b };
  }
  it('B\'s wake while every read of the request store fails, then a clean wake: B still holds the decision, and Allow does not POST a second one', async () => {
    const { b } = await adopted();
    w!.fs.blockReads(REQ);
    b.wake();
    await w!.flush(400);
    w!.fs.clearFaults();
    b.wake();
    await w!.flush(400);
    expect(unknownGate(b), 'the decision is still unknown to B').toBe(true);
    b.decide('once');
    await w!.flush(400);
    expect(posts(w!.agent, 'confirm'), 'a second decision POST was sent').toHaveLength(1);
    expect(decisions(w!)).toHaveLength(1);
  });
  it('the same with ONE failed read at ANY position during B\'s wake', async () => {
    const reached = await sweepReadFaults(6, async (k) => {
      const { b } = await adopted();
      const rule = w!.fs.failRead({ key: REQ, nth: k });
      b.wake();
      await w!.flush(400);
      const hit = rule.failed > 0;
      w!.fs.clearFaults();
      b.wake();
      await w!.flush(400);
      if (hit) {
        expect(unknownGate(b), `read #${k} failed during B's wake: the adopted decision was dropped`).toBe(true);
        b.decide('once');
        await w!.flush(400);
        expect(posts(w!.agent, 'confirm'), `read #${k}: a second decision POST was sent`).toHaveLength(1);
      }
      w!.dispose(); w = null;
      return { reached: hit };
    });
    expect(reached.length).toBeGreaterThanOrEqual(1);
  });
  it('control: after A dismisses the decision and the store is readable, B drops it (a successful scan is authoritative)', async () => {
    const { a, b } = await adopted();
    a.dismissDecision();
    await w!.flush(50);
    expect(decisions(w!)).toHaveLength(0);
    b.wake();
    await w!.flush(400);
    expect(unknownGate(b)).toBe(false);
  });
});

describe('storage events: another tab\'s change reaches this tab\'s engines', () => {
  it('control: B dismisses the unknown decision; A hears the storage event, heals and no longer shows it', async () => {
    w = world({ script: [scripts.approval], decisionLost: true, decisionLag: 1e9 });
    const a = await w.dock();
    a.setAuto(false);
    a.send('Add a chart');
    await w.flush(500);
    a.decide('once');
    await w.flush(400);
    const b = w.pinned(a.record!.s!, 'B');
    b.open();
    await w.flush(900);
    w.listen(a);
    expect(unknownGate(a)).toBe(true);
    w.asB(() => b.dismissDecision());
    await settleReal(5);
    await w.flush(400);
    expect(w.fs.events.some((e) => e.key === REQ), 'A heard the request store change').toBe(true);
    expect(decisions(w)).toHaveLength(0);
    expect(unknownGate(a)).toBe(false);
  });
});

describe('a conversation reset during the "sending" notification strands no never-sent entry', () => {
  it('newConversation() when the entry appears: no create POST, and the entry does not stay stored', async () => {
    w = world();
    const eng = await w.dock();
    let did = false;
    // The engine's own reset (keepDraft): the person's New waits while a message is on its way (the next test).
    eng.subscribe(() => {
      if (!did && storedEntries(w!.fs).length > 0) { did = true; eng.newConversation(true); }
    });
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(did).toBe(true);
    expect(posts(w.agent, 'create')).toHaveLength(0);
    expect(storedEntries(w.fs), 'the request never left: its entry must not outlive the cancelled send').toHaveLength(0);
  });
  it('the person\'s New when the entry appears does nothing: the first message goes', async () => {
    w = world();
    const eng = await w.dock();
    let did = false;
    eng.subscribe(() => {
      if (!did && storedEntries(w!.fs).length > 0) { did = true; eng.newConversation(); }
    });
    eng.send('Build me a small dashboard');
    await w.flush(1500);
    expect(did).toBe(true);
    expect(posts(w.agent, 'create')).toHaveLength(1);
    expect(eng.record?.s).toBeTruthy();
  });
  it('control: end() when the entry appears: no POST, no entry (fixed)', async () => {
    w = world();
    const eng = await w.dock();
    let did = false;
    eng.subscribe(() => { if (!did && storedEntries(w!.fs).length > 0) { did = true; eng.end(); } });
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(did).toBe(true);
    expect(posts(w.agent, 'create')).toHaveLength(0);
    expect(storedEntries(w.fs)).toHaveLength(0);
  });
});

describe('a send needs its evidence kept first', () => {
  it('control: quota full for the entry: nothing is sent, the row says Not sent, nothing else is lost', async () => {
    w = world();
    w.fs.quota = w.fs.used();
    const eng = await w.dock();
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(posts(w.agent, 'create')).toHaveLength(0);
    expect(lastUser(eng)?.state).toBe('notSent');
  });
  it('control: a request store that cannot be read: nothing is sent', async () => {
    w = world();
    w.fs.blockReads(REQ);
    const eng = await w.dock();
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(posts(w.agent, 'create')).toHaveLength(0);
    expect(lastUser(eng)?.state).toBe('notSent');
  });
  it('control: a request store that fails ONE read at ANY position during a send: whatever was POSTed has its entry (or was settled by proof), nothing earlier is lost', async () => {
    await sweepReadFaults(8, async (k) => {
      w = world({ createLost: true });
      const eng = await w.dock();
      eng.send('Build me a small dashboard');                    // its create answer is lost: the entry must stay
      await w.flush(200);
      const earlier = storedEntries(w.fs).map((e) => e.k);
      const rule = w.fs.failRead({ key: REQ, nth: k });
      eng.send('A second message');
      await w.flush(500);
      const hit = rule.failed > 0;
      w.fs.clearFaults();
      if (hit) {
        const now = storedEntries(w.fs).map((e) => e.k);
        for (const e of earlier) expect(now, `read #${k} failed during a second send: the first send's entry was lost`).toContain(e);
      }
      w.dispose(); w = null;
      return { reached: hit };
    });
  });
});

void HANDLE; void KEY; void NOT_FOUND;
