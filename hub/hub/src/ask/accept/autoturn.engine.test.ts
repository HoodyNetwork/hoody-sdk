// "Auto-approve this reply" over the real journal and the FakeAgent. The policy is born with the row's key and
// rides every request under it; a send that cannot go as a fresh turn is not sent at all; a lost answer reads the receipt by
// key and never POSTs again; the agent's refusals map to words, never to a resend without the policy.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { AskEngine } from '../engine';
import * as C from '../conv';
import type { Beat } from '../fake';
import { HANDLE, KEY, REALM, settleReal, slot, users, world, type World } from './env';
import * as S from './seam';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const quick: Beat[] = [{ k: 'text', text: 'Done' }];
const long: Beat[] = [{ k: 'text', text: 'Working' }, { k: 'hold' }];
const rows = (e: any) => users(e.getSnapshot(), C) as C.UserMsg[];
const turnCalls = (w: World) => w.agent.log.filter(([m]) => m === 'turn').map(([, a]) => a);
const policyOf = (args: unknown[]) => (args.find((x) => typeof x === 'object' && x !== null && 'policy' in (x as object)) as { policy?: string } | undefined)?.policy;

/** A dock whose first exchange has ended: the chat is open and idle. */
async function idle(o: Parameters<typeof world>[0] = {}) {
  w = world({ script: [quick], ...o });
  const dock = await w.dock();
  dock.send('Hello');
  await w.flush(500);
  expect(C.routeFor(dock.getSnapshot().conv)).toBe('turn');
  return dock;
}

describe('Auto-approve this reply: the policy rides its own turn only', () => {
  it('a fresh turn carries ?policy=auto_approve under its own key; the next plain message carries none', async () => {
    const dock = await idle();
    const before = turnCalls(w!).length;
    expect(dock.autoTurnBlock()).toBeNull();
    expect(dock.send('Fix the tests', false, undefined, 'auto_approve')).toBe(true);
    await w!.flush(500);
    const mine = turnCalls(w!).slice(before);
    expect(mine).toHaveLength(1);
    expect(policyOf(mine[0]!)).toBe('auto_approve');
    const row = rows(dock).find((u) => u.text === 'Fix the tests')!;
    expect(row.auto).toBe(true);
    expect(mine[0]![2]).toBe(row.key);
    dock.send('And the docs');
    await w!.flush(500);
    const next = turnCalls(w!).slice(before + 1);
    expect(next).toHaveLength(1);
    expect(policyOf(next[0]!), 'never sticky').toBeUndefined();
    expect(rows(dock).find((u) => u.text === 'And the docs')!.auto).toBeUndefined();
  });

  it('the first message (a create) is refused with its words and nothing is sent', async () => {
    w = world({ script: [quick] });
    const dock = await w.dock();
    expect(dock.autoTurnBlock()).toBe('ask.autoTurnLater');
    expect(dock.send('Hello', false, undefined, 'auto_approve')).toBe(false);
    await w.flush(200);
    expect(rows(dock)).toHaveLength(0);
    expect(w.agent.log.some(([m]) => m === 'create' || m === 'turn')).toBe(false);
  });

  it('while a turn runs it is refused: no follow-up goes without the policy', async () => {
    w = world({ script: [quick, long] });
    const dock = await w.dock();
    dock.send('Hello');
    await w.flush(500);
    dock.send('Start the long job');
    await w.flush(100);
    expect(C.routeFor(dock.getSnapshot().conv)).toBe('command');
    const n = w.agent.log.length;
    expect(dock.autoTurnBlock()).toBe('ask.autoTurnLater');
    expect(dock.send('Also this', false, undefined, 'auto_approve')).toBe(false);
    await w.flush(100);
    expect(w.agent.log.slice(n).some(([m]) => m === 'command' || m === 'turn')).toBe(false);
  });

  it('a page prefill owes a new conversation: it is refused, so the policy never rides the create that would follow', async () => {
    const dock = await idle();
    dock.wantFresh();
    expect(dock.autoTurnBlock()).toBe('ask.autoTurnLater');
    const posts = w!.agent.log.filter(([m]) => m === 'create' || m === 'turn').length;
    expect(dock.send('Fix the tests', false, undefined, 'auto_approve')).toBe(false);
    await w!.flush(400);
    expect(w!.agent.log.filter(([m]) => m === 'create' || m === 'turn').length, 'nothing sent').toBe(posts);
  });
  it('without a journal it is not offered and nothing is sent', async () => {
    w = world({ script: [quick] });
    const store = { read: () => ({ v: 1, a: {} }), write: () => undefined } as any;
    const eng = new AskEngine(slot, w.agent, store, w.clock, {});
    eng.open();
    await w.flush();
    expect(eng.autoTurnBlock()).toBe('ask.autoTurnUnavailable');
    expect(eng.send('Hi', false, undefined, 'auto_approve')).toBe(false);
  });
});

describe('Auto-approve this reply: no request under its key without the policy', () => {
  it('a lost answer: the row is unknown, Check status reads the receipt by key, and no second turn POST goes', async () => {
    const dock = await idle();
    const real = w!.agent.turn.bind(w!.agent);
    let lose = true;
    (w!.agent as any).turn = (...a: any[]) => {
      const p = (real as any)(...a);
      if (!lose) return p;
      lose = false;
      return p.then(() => Promise.reject({ status: 502, pending: true }));
    };
    const before = turnCalls(w!).length;
    dock.send('Fix the tests', false, undefined, 'auto_approve');
    await w!.flush(500);
    const row = rows(dock).find((u) => u.text === 'Fix the tests')!;
    expect(row.state).toBe('unknown');
    dock.check(row.id);
    await w!.flush(1000);
    const mine = turnCalls(w!).slice(before);
    expect(mine, 'one POST under the key, never a second').toHaveLength(1);
    expect(policyOf(mine[0]!)).toBe('auto_approve');
    // The receipt read by key settled it from the agent's own record (the transcript row), never by a send.
    expect(rows(dock).filter((u) => u.text === 'Fix the tests').map((u) => u.state)).toEqual(['sent']);
  });

  it('Send again after a definite refusal keeps the policy (a new key, born with it)', async () => {
    const dock = await idle();
    (w!.agent as any).o.busy = true;
    dock.send('Fix the tests', false, undefined, 'auto_approve');
    await w!.flush(300);
    const row = rows(dock).find((u) => u.text === 'Fix the tests')!;
    expect(row.state).toBe('notSent');
    (w!.agent as any).o.busy = false;
    const before = turnCalls(w!).length;
    dock.resend(row.id);
    await w!.flush(500);
    const mine = turnCalls(w!).slice(before);
    expect(mine).toHaveLength(1);
    expect(policyOf(mine[0]!), 'the resend carries the policy').toBe('auto_approve');
    expect(mine[0]![2]).not.toBe(row.key);
  });

  it('Send again while a turn runs is refused with its words: never a follow-up without the policy', async () => {
    w = world({ script: [quick, long] });
    const dock = await w.dock();
    dock.send('Hello');
    await w.flush(500);
    (w.agent as any).o.busy = true;
    dock.send('Fix the tests', false, undefined, 'auto_approve');
    await w.flush(300);
    const row = rows(dock).find((u) => u.text === 'Fix the tests')!;
    expect(row.state).toBe('notSent');
    (w.agent as any).o.busy = false;
    dock.send('Start the long job');
    await w.flush(100);
    expect(C.routeFor(dock.getSnapshot().conv)).toBe('command');
    const n = w.agent.log.length;
    dock.resend(row.id);
    await w.flush(100);
    expect(w.agent.log.slice(n).some(([m]) => m === 'command' || m === 'turn')).toBe(false);
    const after = rows(dock).find((u) => u.id === row.id)!;
    expect(after.state).toBe('notSent');
    expect(after.reason).toBe('ask.autoTurnLater');
  });

  it('the first turn of an existing session (the gate, firstTurn) carries the policy', async () => {
    // The create answered and the first turn never arrived: the chat exists with no known turn, so a person's Send goes through the
    // gate (a supersede under a fresh key), and the policy rides that POST.
    w = world({ script: [quick] });
    const real = (w.agent as any).turn.bind(w.agent);
    (w.agent as any).turn = () => Promise.reject({ status: 0, pending: true, kind: 'pending' });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(600);
    const sid = a.record!.s!;
    (w.agent as any).turn = real;
    const eng = w.pinned(sid, 'B');
    eng.open();
    await w.flush(900);
    const lost = rows(eng).find((u) => u.state === 'unknown');
    if (lost) { eng.check(lost.id); await w.flush(400); await settleReal(); await w.flush(400); }
    expect(eng.autoTurnBlock()).toBeNull();
    expect(eng.record!.t, 'no known turn: the send goes through the gate').toBeFalsy();
    const before = turnCalls(w).length;
    expect(eng.send('Fix the tests', false, undefined, 'auto_approve')).toBe(true);
    await w.flush(400); await settleReal(); await w.flush(400);
    const mine = turnCalls(w).slice(before);
    expect(mine).toHaveLength(1);
    expect(policyOf(mine[0]!)).toBe('auto_approve');
  });
});

describe('Auto-approve this reply: the agent\'s refusals', () => {
  it('the ordinary path with the session\'s approval mode read first (turnOut, auto chip Off) carries the policy', async () => {
    w = world({ script: [quick, quick] });
    const dock = await w.dock();
    dock.setAuto(false);
    dock.send('Hello');
    await w.flush(800);
    expect(C.routeFor(dock.getSnapshot().conv)).toBe('turn');
    const before = turnCalls(w).length;
    expect(dock.send('Fix the tests', false, undefined, 'auto_approve')).toBe(true);
    await w.flush(800);
    const mine = turnCalls(w).slice(before);
    expect(mine).toHaveLength(1);
    expect(policyOf(mine[0]!)).toBe('auto_approve');
  });
  it('a journal-less retype of a lost message is refused: the lost key is never asked again, with or without the policy', async () => {
    w = world({ script: [quick] });
    let st: any = { v: 1, a: {} };
    const store = { read: () => JSON.parse(JSON.stringify(st)), write: (_a: string, x: any) => { if (x) st = JSON.parse(JSON.stringify(x)); } } as any;
    (w.agent as any).create = () => Promise.reject({ status: 0, pending: true, kind: 'pending' });
    const a = new AskEngine(slot, w.agent, store, w.clock, {});
    a.open();
    await w.flush();
    a.send('Hello');
    await w.flush(600);
    a.end();
    const b = new AskEngine(slot, w.agent, store, w.clock, {});
    b.open();
    await w.flush(600);
    const lost = rows(b).find((u) => u.state === 'unknown' && !u.text);
    expect(lost, 'the reload kept the lost key without its text').toBeTruthy();
    const posts = w.agent.log.filter(([m]) => m === 'create' || m === 'turn').length;
    expect(b.send('Hello', false, undefined, 'auto_approve')).toBe(false);
    await w.flush(600);
    expect(w.agent.log.filter(([m]) => m === 'create' || m === 'turn').length, 'nothing sent').toBe(posts);
    expect(rows(b).find((u) => u.id === lost!.id), 'the lost row is untouched').toMatchObject({ state: 'unknown', text: lost!.text });
  });
  it('a Strict chat (409 approval_policy_active) is Not sent with its own words, and nothing is sent again', async () => {
    const dock = await idle({ strictApproval: true });
    const before = turnCalls(w!).length;
    dock.send('Fix the tests', false, undefined, 'auto_approve');
    await w!.flush(500);
    const row = rows(dock).find((u) => u.text === 'Fix the tests')!;
    expect(row.state).toBe('notSent');
    expect(row.reason).toBe('ask.autoTurnStrict');
    expect(turnCalls(w!).slice(before)).toHaveLength(1);
  });

  it('a 422 idempotency_key_reused on its key is "may have gone through" (the journal reads it as unknown), never a resend', async () => {
    const dock = await idle();
    (w!.agent as any).turn = (...a: any[]) => { w!.agent.log.push(['turn', a]); return Promise.reject({ status: 422, code: 'idempotency_key_reused' }); };
    const before = turnCalls(w!).length;
    dock.send('Fix the tests', false, undefined, 'auto_approve');
    await w!.flush(500);
    const row = rows(dock).find((u) => u.text === 'Fix the tests')!;
    expect(row.state).toBe('unknown');
    await w!.flush(1000);
    expect(turnCalls(w!).slice(before)).toHaveLength(1);
  });

  it('the test seam puts the journal ticket in the tickets slot, never in the policy slot', async () => {
    w = world({ script: [quick] });
    const c = (await w.agent.create({ realm: REALM } as any, 'hx-' + 'd'.repeat(32), REALM)) as { session_id: string };
    const io = S.guarded(w.agent as any);
    const e = { k: KEY('e'), kind: 'turn', h: HANDLE, r: REALM, s: c.session_id, c: KEY('c'), ct: slot.computer, at: 1 } as S.Entry;
    expect(S.beginEntry(w.j, e)).toBe('ok');
    await S.sendThroughDoor(w.j, e, e.k, S.newToken(), () => (io as any).turn(c.session_id, 'hello', e.k, REALM));
    const mine = turnCalls(w);
    expect(mine).toHaveLength(1);
    expect(policyOf(mine[0]!), 'a plain turn carries no policy').toBeUndefined();
  });
  it('the fake agent binds the policy to the key: the same key with another policy is 422', async () => {
    w = world({ script: [quick] });
    const c = (await w.agent.create({ realm: REALM } as any, 'hx-' + 'd'.repeat(32), REALM)) as { session_id: string };
    const k = 'hx-' + 'e'.repeat(32);
    await w.agent.turn(c.session_id, 'go', k, REALM, undefined, 'auto_approve');
    await w.flush(300);
    await expect(w.agent.turn(c.session_id, 'go', k, REALM)).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
    await expect(w.agent.turn(c.session_id, 'go', k, REALM, undefined, 'auto_approve')).resolves.toMatchObject({ duplicate: true });
  });
});
