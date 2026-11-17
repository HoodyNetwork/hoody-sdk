// The approver lease, the engine's half: when the engine opens its lease handle, what it sends, which tickets
// each journaled call carries, and when the handle closes. The engine runs over the real journal and the FakeAgent; the page's manager is
// the real one over the lease harness (fake daemon), swapped in for approvers().
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApproverManager, type ApproverManager } from '@kit/agent/approver';
import { fakeDaemon } from '@kit/agent/approver.fakedaemon';
import { scripts } from '../fake';
import { world, type World } from './env';

const H = vi.hoisted(() => ({ mgr: null as unknown }));
vi.mock('@kit/agent/approver-live', () => ({ approvers: () => H.mgr, resetApproversForTests: () => {} }));

let w: World | null = null;
let d: ReturnType<typeof fakeDaemon>;
let mgr: ApproverManager;
let opened = 0;
let noted: Array<[string, string, number]> = [];
const W = 5_000_000;
beforeEach(() => {
  d = fakeDaemon(() => W);
  const real = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => 1000, wall: () => W }, account: () => 'acct', holder: 'hub-test', claim: d.core.claim });
  opened = 0; noted = [];
  mgr = { ...real, open: (ref, o) => { opened += 1; return real.open(ref, o); }, noteEpoch: (ref, e, s) => { noted.push([ref.sid ?? '', e, s]); real.noteEpoch(ref, e, s); } };
  H.mgr = mgr;
});
afterEach(() => { try { mgr.reset(); } catch { /* none */ } w?.dispose(); w = null; });

/** The fake agent, wrapped to remember what each journaled call carried (its tickets are the last argument). */
function spy(x: World, mode: 'default' | 'always') {
  const seen: { create: any[][]; confirm: any[][]; answer: any[][] } = { create: [], confirm: [], answer: [] };
  for (const m of ['create', 'confirm', 'answer'] as const) {
    const orig = (x.agent as any)[m].bind(x.agent);
    (x.agent as any)[m] = (...a: any[]) => { seen[m]!.push(a); return orig(...a); };
  }
  const approval = (x.agent as any).approval.bind(x.agent);
  (x.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode }));
  return seen;
}
const ticketsOf = (call: any[]): any[] => (Array.isArray(call.at(-1)) ? call.at(-1) : []);
/** A conversation with a parked approval is created on one engine; the engine under test reopens that session, which is when the
 *  engine reads the session's approval mode (a conversation this engine only just created has no read to learn from). */
async function parked(mode: 'default' | 'always') {
  w = world({ script: [scripts.approval] });
  const seen = spy(w, mode);
  const first = await w.dock();
  first.setAuto(false);
  first.send('Add a chart');
  await w.flush(500);
  const sid = first.record!.s!;
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(500);
  expect(eng.getSnapshot().gates.length, 'the reopened session shows the parked gate').toBeGreaterThan(0);
  return { eng, seen, sid, first };
}

describe('the engine and its lease handle', () => {
  it('opens no handle before a conversation needs it', async () => {
    w = world({ script: [scripts.approval] });
    await w.dock();
    await w.flush(100);
    expect(opened).toBe(0);
    expect(d.sent).toHaveLength(0);
  });

  it('a default-mode conversation: the create carries exactly the journal ticket (no handle opened for it), and the reopen only learns "not Strict" and sends nothing', async () => {
    w = world({ script: [scripts.approval] });
    const seen = spy(w, 'default');
    const first = await w.dock();
    first.send('Add a chart');
    await w.flush(500);
    expect(seen.create).toHaveLength(1);
    expect(ticketsOf(seen.create[0]!)).toHaveLength(1);
    expect(opened, 'a default create mints no lease ticket and opens no handle').toBe(0);
    const eng = w.pinned(first.record!.s!);
    eng.open();
    await w.flush(500);
    expect(opened).toBe(1);
    expect(d.sent, 'a non-Strict handle never calls the agent').toHaveLength(0);
  });

  it('Strict is learned from the approval read (mode always): the page acquires the lease for that session', async () => {
    const { sid, eng } = await parked('always');
    await w!.flush(100);
    expect(d.sent.filter((x) => x.op === 'acquire' && x.id === sid)).toHaveLength(1);
    expect(mgr.state({ computer: 'c0a7150000000000000000a1', realm: eng.record!.r, sid }).phase).toBe('held');
  });

  it('a decision on a default-mode conversation carries only the journal ticket and no lease generation', async () => {
    const { eng, seen } = await parked('default');
    eng.decide('once');
    await w!.flush(400);
    expect(seen.confirm).toHaveLength(1);
    expect(ticketsOf(seen.confirm[0]!)).toHaveLength(1);
    expect(seen.confirm[0]![1]).not.toHaveProperty('lease_generation');
  });

  it('a decision while the lease is displayed as held carries the lease ticket and its generation beside the journal ticket', async () => {
    const { eng, seen } = await parked('always');
    await w!.flush(100);
    eng.decide('once');
    await w!.flush(400);
    expect(seen.confirm).toHaveLength(1);
    expect(ticketsOf(seen.confirm[0]!)).toHaveLength(2);
    expect(seen.confirm[0]![1].lease_generation).toBe(1);
  });

  it('ending the engine closes its handle: the lease is given back', async () => {
    // Both engines of this conversation read the session as Strict and hold a handle on its lease: the lease goes back when the LAST
    // one ends. Production ends the dock's engine too whenever it is replaced (registry.ts engineFor: checkAlive() ends it,
    // engine.ts live()/end()), so the first engine is ended here as well.
    const { eng, first } = await parked('always');
    await w!.flush(100);
    expect(d.sent.filter((x) => x.op === 'release')).toHaveLength(0);
    eng.end();
    await w!.flush(100);
    expect(d.sent.filter((x) => x.op === 'release'), 'given back while the first engine still holds a handle').toHaveLength(0);
    first.end();
    await w!.flush(100);
    await vi.waitFor(() => expect(d.sent.filter((x) => x.op === 'release')).toHaveLength(1));
  });

  it('a state read that names an epoch tells the manager once, with the stamp taken before the read', async () => {
    w = world({ script: [scripts.approval] });
    const state = (w.agent as any).state.bind(w.agent);
    (w.agent as any).state = (sid: string, ...r: any[]) => state(sid, ...r).then((b: any) => ({ ...b, info: { epoch: 'e7' } }));
    spy(w, 'always');
    const first = await w.dock();
    first.send('Add a chart');
    await w.flush(500);
    const eng = w.pinned(first.record!.s!);
    eng.open();
    await w.flush(500);
    expect(noted.length).toBeGreaterThan(0);
    for (const [sid, e, stamp] of noted) { expect(sid).toBe(eng.record!.s); expect(e).toBe('e7'); expect(Number.isInteger(stamp)).toBe(true); }
  });
});

describe('the fake agent never answers with an approver field (a cap must only come from the lease routes)', () => {
  it('create and attach answers carry no approver_lease, lease or generation', async () => {
    w = world({});
    const c: any = await (w.agent as any).create({ realm: 'r' }, 'hx-' + 'a'.repeat(32), 'r');
    const a: any = await (w.agent as any).attach({ attach: c.session_id, realm: 'r' }, 'r');
    for (const out of [c, a]) expect(JSON.stringify(out)).not.toMatch(/approver|lease/);
  });
});
