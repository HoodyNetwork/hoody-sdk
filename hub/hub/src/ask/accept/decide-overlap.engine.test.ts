// The real engine's half of the attribution of overlapping decisions. decide() and answer() return THIS call's
// request id, or null when the engine took nothing; a call made while another waits for the cross-tab store lock takes nothing; the
// claimed call's attempt (and the request the agent receives) carries the returned id; and a card replaced while the lock is held is
// recorded as notTaken against the waiting call's own id, which the adapter answers as not_applied. The store lock is held by hand.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { AskEngine, type StoreIO } from '../engine';
import { engineActive, type ActiveDeps } from '../active';
import { scripts } from '../fake';
import { HANDLE, REALM, slot, world, type World } from './env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const flush = (n = 900) => w!.flush(n);
const sent = (route: 'confirm' | 'answer') => w!.agent.log.filter((x) => x[0] === route).map((x) => x[1] as any[]);

/** A parked gate (made by the dock engine `first`), reopened by an engine whose store lock waits until the test releases it. */
async function parked(script: unknown, lockMode: 'hold' | 'reject' = 'hold') {
  w = world({ script: [script as any] });
  const first = await w.dock();
  first.setAuto(false);
  first.send('Add a chart');
  await flush(500);
  const sid = first.record!.s!;
  const view = w.j.view(HANDLE, sid) as any;
  const waiting: Array<() => void> = [];
  const store = {
    read: (a: string) => view.read(a),
    write: (a: string, st: any, o?: any) => view.write(a, st, o),
    // As Web Locks: granted, it runs fn; a callback that throws rejects the request with that error.
    lock: (fn: () => void) => (lockMode === 'reject' ? Promise.reject(new Error('lock refused'))
      : new Promise<void>((done, fail) => { waiting.push(() => { try { fn(); done(); } catch (e) { fail(e); } }); })),
  } as StoreIO;
  const eng = new AskEngine(slot, w.agent, store, w.clock, { sid, journal: { j: w.j, handle: HANDLE } });
  eng.open();
  await flush(500);
  const card = eng.getSnapshot().gates[0];
  expect(card, 'the reopened engine shows the parked gate').toBeTruthy();
  const release = async () => { expect(waiting.length, 'a claim waits for the lock').toBe(1); waiting.shift()!(); await flush(900); };
  return { first, eng, sid, card: card!, seen: { id: card!.gate.id, generation: card!.gate.generation }, waiting, release };
}

/** The page's adapter over the engine (lease held, so the call reaches the engine); `rids` records what each decide/answer returned. */
function adapter(p: { eng: AskEngine; sid: string }) {
  const deps: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
    pending: () => [], onPending: () => () => undefined,
    set: (fn, ms) => w!.clock.set(fn, ms), clear: (id) => w!.clock.clear(id), decode: () => new Uint8Array(), waitMs: 5000,
  };
  const rids: Array<string | null> = [];
  const e = p.eng as any;
  for (const m of ['decide', 'answer'] as const) {
    const orig = e[m].bind(e);
    e[m] = (...a: any[]) => { const r = orig(...a); rids.push(r); return r; };
  }
  const src = engineActive({ current: () => p.eng, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: p.sid }, () => ({ computer: 'c', realm: REALM }), deps);
  src.subscribe(() => undefined);
  return { src, rids };
}

describe('decide and answer over the real engine, with the store lock held', () => {
  it('decide: the overlapping call takes nothing; the claimed call is sent and proved under its own id', async () => {
    const p = await parked(scripts.approval);
    const r1 = p.eng.decide('once', undefined, p.seen);
    expect(typeof r1, 'the first call returns its request id').toBe('string');
    expect(p.eng.getSnapshot().gates[0]!.held, 'the card waits for the lock').toBe('claiming');
    expect(p.eng.decide('once', undefined, p.seen), 'a second decide while the first is claiming takes nothing').toBeNull();
    expect(p.eng.decide('deny', 'no', p.seen), 'nor does a different choice').toBeNull();
    expect(p.waiting.length, 'only the first call asked for the lock').toBe(1);
    expect(p.eng.claimWaiting(r1!), 'the first call\'s claim waits').toBe(true);
    expect(sent('confirm'), 'nothing is sent before the lock').toHaveLength(0);
    await p.release();
    expect(sent('confirm'), 'exactly one decision went').toHaveLength(1);
    expect(JSON.stringify(sent('confirm')[0]), 'the request the agent got carries the returned id').toContain(r1!);
    expect(p.eng.decisionProof(r1!), 'the returned id is the one proved').toBe('applied');
    expect(p.eng.claimWaiting(r1!), 'a claim that ran no longer waits').toBe(false);
  });

  it('a claim whose run throws after taking the card is never run again unlocked: one send, no false notTaken; the adapter says unknown', async () => {
    // run() throws once its attempt is stored (the send fails synchronously). The lock request then rejects, as Web Locks does; that is
    // not a refused lock, so the claim must not run again unlocked (it would find its own attempt and prove notTaken: a false not_applied).
    const a = await parked(scripts.approval);
    let posts = 0;
    (a.eng as any).postDecision = () => { posts++; throw new Error('send threw'); };
    const { src, rids } = adapter(a);
    const res = src.decide(src.snapshot().gates[0]!.ref, { choice: 'once' } as any);
    const ra = rids[0]!;
    expect(a.eng.claimWaiting(ra)).toBe(true);
    a.waiting.shift()!();
    await flush(900);
    expect(posts, 'the claim ran once').toBe(1);
    expect(a.eng.claimWaiting(ra), 'a claim whose run threw no longer waits').toBe(false);
    expect(a.eng.decisionProof(ra), 'never proved not taken: it may have gone').not.toBe('notTaken');
    expect(a.eng.attemptOf(a.card.key)?.rid, 'its attempt stays').toBe(ra);
    await flush(6000);
    expect(await res, 'not known, never not_applied').toEqual({ k: 'unknown' });
    src.release();
  });

  it('claimWaiting is never set waiting for good when the lock request is refused', async () => {
    // The lock request is refused: the claim runs unlocked (StoreBase.lock) and is sent; it does not wait.
    const b = await parked(scripts.approval, 'reject');
    const rb = b.eng.decide('once', undefined, b.seen)!;
    await flush(900);
    expect(b.eng.claimWaiting(rb), 'a refused lock leaves no id waiting').toBe(false);
    expect(b.eng.decisionProof(rb), 'and the claim ran unlocked').toBe('applied');
  });

  it('claimWaiting ends on reset, and a grant after it sends nothing', async () => {
    // The engine resets (end) while the claim waits: no id stays waiting, and the late grant sends nothing.
    const c = await parked(scripts.approval);
    const rc = c.eng.decide('once', undefined, c.seen)!;
    expect(c.eng.claimWaiting(rc)).toBe(true);
    c.eng.end();
    expect(c.eng.claimWaiting(rc), 'reset drops the waiting id').toBe(false);
    c.waiting.shift()!();
    await flush(900);
    expect(c.eng.claimWaiting(rc), 'a grant after the reset leaves nothing waiting').toBe(false);
    expect(sent('confirm'), 'the late grant sent nothing').toHaveLength(0);
  });

  it('decide: the attempt stored when the lock is granted is the returned id', async () => {
    const p = await parked(scripts.approval);
    const io = w!.agent as any;
    const confirm = io.confirm.bind(io);
    let atSend: unknown;
    io.confirm = (...a: any[]) => { atSend = p.eng.attemptOf(p.card.key); return confirm(...a); };
    const rid = p.eng.decide('once', undefined, p.seen);
    expect(p.eng.attemptOf(p.card.key), 'no attempt before the lock').toBeUndefined();
    await p.release();
    expect(atSend, 'the attempt out while it was sent is this call').toMatchObject({ rid, status: 'sending' });
  });

  it('answer: the overlapping call takes nothing; the claimed call is sent and proved under its own id', async () => {
    const p = await parked(scripts.question);
    expect(p.card.gate.kind).toBe('question');
    const r1 = p.eng.answer('8080', p.seen);
    expect(typeof r1, 'the first call returns its request id').toBe('string');
    expect(p.eng.getSnapshot().gates[0]!.held).toBe('claiming');
    expect(p.eng.answer('3000', p.seen), 'a second answer while the first is claiming takes nothing').toBeNull();
    expect(p.eng.decide('once', undefined, p.seen), 'a decide on a question card takes nothing').toBeNull();
    expect(p.waiting.length).toBe(1);
    const io = w!.agent as any;
    const answer = io.answer.bind(io);
    let atSend: unknown;
    io.answer = (...a: any[]) => { atSend = p.eng.attemptOf(p.card.key); return answer(...a); };
    await p.release();
    expect(sent('answer'), 'exactly one answer went').toHaveLength(1);
    expect(atSend, 'the attempt out while it was sent is the returned id').toMatchObject({ rid: r1, status: 'sending' });
    expect(JSON.stringify(sent('answer')[0])).toContain('8080');
    expect(p.eng.decisionProof(r1!)).toBe('applied');
  });

  for (const kind of ['confirm', 'question'] as const) {
    it(`${kind}: a card decided elsewhere while the lock is held proves notTaken for the waiting call, and the adapter answers not_applied`, async () => {
      const p = await parked(kind === 'confirm' ? scripts.approval : scripts.question);
      const { src, rids } = adapter(p);
      const ref = src.snapshot().gates[0]!.ref;
      const res = kind === 'confirm' ? src.decide(ref, { choice: 'once' } as any) : src.answer(ref, '8080' as any);
      expect(rids, 'the adapter call was taken').toHaveLength(1);
      const rid = rids[0]!;
      expect(typeof rid).toBe('string');
      // Another engine (another tab) decides the same gate while this one waits for the lock.
      if (kind === 'confirm') p.first.decide('once'); else p.first.answer('3000');
      await flush(900);
      const before = sent(kind === 'confirm' ? 'confirm' : 'answer').length;
      await p.release();
      expect(p.eng.decisionProof(rid), 'the waiting call is recorded as not taken, under its own id').toBe('notTaken');
      expect(p.eng.claimWaiting(rid), 'and it no longer waits').toBe(false);
      expect(p.eng.attemptOf(p.card.key)?.rid, 'no attempt carries the waiting call').not.toBe(rid);
      expect(sent(kind === 'confirm' ? 'confirm' : 'answer'), 'the waiting call sent nothing').toHaveLength(before);
      expect(await res, 'the adapter answers not_applied, never unknown').toEqual({ k: 'refused', code: 'not_applied' });
      src.release();
    });
  }
});
