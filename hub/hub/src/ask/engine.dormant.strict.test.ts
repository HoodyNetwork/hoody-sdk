// A Strict chat (approvals: always) the computer put to sleep, on the AI page's active source. The engine asks for the approver lease
// only while a gate card is parked (engine.ts reconcileApproverHandle), and the agent grants it for a LIVE chat only, so a sleeping chat
// has none. While it sleeps the missing lease does not hold Send back (as the attachment lease): the message wakes the chat (the shared
// wake, POST /sessions with `attach`, approval not asserted) and goes as one turn; a gate the turn parks takes the lease the normal way.
// Awake, nothing changes: a Strict chat without its lease still waits for it (custody rules unchanged).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { WAIT_MS, engineActive, liveDeps, type ActiveDeps } from './active';
import { world, type World } from './accept/env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const count = (m: string) => w!.agent.log.filter((x) => x[0] === m).length;

/** A Strict chat with one finished exchange on a pinned engine, wrapped as the AI page's active source; the approver lease is not held
 *  (no gate parked; and a sleeping chat cannot get one). */
async function strictChat(sleep: boolean) {
  // The chat is Strict on the agent: its approval read names `always`, and an attach asserting another mode is refused.
  w = world({ approvalMode: 'always' });
  const first = await w.dock();
  first.setAuto(false);
  first.send('hi!');
  await w.flush(3000);
  const sid = first.record!.s! as string;
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(1000);
  if (sleep) { w.agent.setDormant(sid, true); eng.wake(); await w.flush(200); }
  const x = w;
  const d: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: { track: () => () => undefined, state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
    pending: (h) => x.j.pending(h), onPending: (fn) => x.j.subscribe(fn), set: (fn, ms) => x.clock.set(fn, ms), clear: (id) => x.clock.clear(id),
    decode: liveDeps().decode, waitMs: WAIT_MS,
  };
  const src = engineActive({ current: () => eng, release: () => undefined }, eng.activation().ref as any, () => ({ computer: 'atlas', realm: 'Personal' }), d);
  return { eng, sid, src };
}

describe('a Strict chat asleep on the computer', () => {
  it('Send is open while it sleeps; the message wakes it once and goes as one turn, the wake asserting no Strict approval', async () => {
    const { eng, sid, src } = await strictChat(true);
    expect(eng.activation().strict).toBe(true);
    expect(eng.getSnapshot().dormant).toBe(true);
    expect(src.can('send')).toEqual({ ok: true });
    const a0 = count('attach'), t0 = count('turn');
    const out = src.send({ text: 'TEST TYPING' });
    await w!.flush(3000);
    await out;
    expect(count('attach') - a0, 'woken once').toBe(1);
    const turns = w!.agent.log.filter((x) => x[0] === 'turn').slice(t0);
    expect(turns, 'one turn').toHaveLength(1);
    expect(turns[0]![1]).toEqual([sid, 'TEST TYPING', expect.any(String)]);
    const att = (w!.agent.log.filter((x) => x[0] === 'attach').at(-1)![1] as unknown[])[0] as Record<string, unknown>;
    // The wake asserts no approval policy: the agent keeps the chat's own (an assertion of another mode is refused).
    expect('approval' in att).toBe(false);
  });

  it('a wake the computer refuses sends nothing: Not sent with its reason', async () => {
    const { eng, src } = await strictChat(true);
    (w!.agent as any).attach = (...a: unknown[]) => { (w!.agent as any).rec('attach', ...a); return Promise.reject({ status: 503, code: 'service_unavailable' }); };
    const t0 = count('turn');
    void src.send({ text: 'TEST TYPING' });
    await w!.flush(3000);
    expect(count('turn') - t0).toBe(0);
    const u = Object.values(eng.getSnapshot().conv.users).sort((a, b) => a.at - b.at).at(-1)!;
    expect(u).toMatchObject({ state: 'notSent', reason: 'ask.attachFailed' });
  });

  it('awake, a Strict chat without its lease still waits for it (unchanged)', async () => {
    const { src } = await strictChat(false);
    const c = src.can('send');
    expect(c.ok).toBe(false);
    expect(c.ok ? null : c.missing).toEqual(['approver']);
  });
});
