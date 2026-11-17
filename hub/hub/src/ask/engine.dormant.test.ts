// A chat the computer put to sleep (GET /state live:false, no stream; the agent's turn route serves live chats only) is woken by the
// person's next message: the engine reopens it (POST /sessions with `attach`) once, then sends the turn once. A wake that is refused
// sends nothing and says so; the message is Not sent and Send again wakes first.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type { AskEngine } from './engine';
import { world, type World } from './accept/env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const count = (m: string) => w!.agent.log.filter((x) => x[0] === m).length;
const turns = () => w!.agent.log.filter((x) => x[0] === 'turn');
const last = (e: AskEngine) => Object.values(e.getSnapshot().conv.users).sort((a, b) => a.at - b.at).at(-1)!;

/** A chat with one finished exchange, reopened on a pinned engine (the AI page's), then put to sleep by the computer. */
async function asleep(o: Parameters<typeof world>[0] = {}) {
  w = world(o);
  const approval = (w.agent as any).approval.bind(w.agent);
  (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode: 'default' }));
  const first = await w.dock();
  first.setAuto(false);
  first.send('hi!');
  await w.flush(3000);
  const sid = first.record!.s! as string;
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(1000);
  w.agent.setDormant(sid, true);
  eng.wake();
  await w.flush(100);
  return { eng, sid };
}

describe('a chat asleep on the computer', () => {
  it('reads asleep, Send stays open, and the message wakes the chat once then goes as one turn', async () => {
    const { eng, sid } = await asleep();
    expect(eng.getSnapshot().dormant).toBe(true);
    expect(eng.canSend()).toBe(true);
    const a0 = count('attach'), t0 = turns().length;
    expect(eng.send('TEST TYPING')).toBe(true);
    await w!.flush(2000);
    expect(count('attach') - a0, 'woken exactly once').toBe(1);
    const sent = turns().slice(t0);
    expect(sent, 'exactly one turn').toHaveLength(1);
    expect(sent[0]![1]).toEqual([sid, 'TEST TYPING', expect.any(String)]);
    // The attach went before the turn.
    const order = w!.agent.log.map((x) => x[0]).filter((m) => m === 'attach' || m === 'turn').slice(-2);
    expect(order).toEqual(['attach', 'turn']);
    expect(last(eng).state).toBe('sent');
    expect(eng.getSnapshot().dormant).toBe(false);
  });

  it('a wake the computer refuses sends nothing: the message is Not sent with its reason, and Send again wakes then sends once', async () => {
    const { eng } = await asleep();
    const real = (w!.agent as any).attach.bind(w!.agent);
    let fails = 1;
    (w!.agent as any).attach = (...x: unknown[]) => {
      if (fails-- > 0) { (w!.agent as any).rec('attach', ...x); return Promise.reject({ status: 503, code: 'service_unavailable' }); }
      return real(...x);
    };
    const t0 = turns().length;
    eng.send('wake up');
    await w!.flush(1000);
    expect(last(eng)).toMatchObject({ state: 'notSent', reason: 'ask.attachFailed' });
    expect(turns().length - t0, 'nothing sent to the sleeping chat').toBe(0);
    expect(eng.getSnapshot().dormant).toBe(true);
    eng.resend(last(eng).id);
    await w!.flush(2000);
    expect(turns().length - t0).toBe(1);
    expect(last(eng).state).toBe('sent');
  });

  it('a chat the computer no longer has (404 on the wake) says so plainly; nothing is sent', async () => {
    const { eng } = await asleep();
    (w!.agent as any).attach = (...x: unknown[]) => { (w!.agent as any).rec('attach', ...x); return Promise.reject({ status: 404, code: 'not_found' }); };
    const t0 = turns().length;
    eng.send('anyone there?');
    await w!.flush(1000);
    expect(last(eng)).toMatchObject({ state: 'notSent', reason: 'ask.attachGone' });
    expect(turns().length - t0).toBe(0);
  });

  it('helper gates unavailable on the wake: Not sent with that reason, nothing sent', async () => {
    const { eng } = await asleep({ helperGatesUnavailable: true } as any);
    const t0 = turns().length;
    eng.send('wake up');
    await w!.flush(1000);
    expect(last(eng)).toMatchObject({ state: 'notSent', reason: 'ask.helperGatesOff' });
    expect(turns().length - t0).toBe(0);
  });

  it('a wake whose answer is lost: the message did not go (Not sent), and nothing is sent until the person presses again', async () => {
    const { eng } = await asleep();
    (w!.agent as any).attach = (...x: unknown[]) => { (w!.agent as any).rec('attach', ...x); return Promise.reject({ pending: true, kind: 'pending' }); };
    const t0 = turns().length;
    eng.send('wake up');
    await w!.flush(2000);
    expect(last(eng).state).toBe('notSent');
    expect(turns().length - t0).toBe(0);
  });

  it('a "/" draft on a sleeping chat goes the same way (one wake, one turn)', async () => {
    const { eng } = await asleep();
    const a0 = count('attach'), t0 = turns().length;
    eng.send('/help me');
    await w!.flush(2000);
    expect(count('attach') - a0).toBe(1);
    expect(turns().length - t0).toBe(1);
  });

  it('the Approve automatically switch on a sleeping chat wakes it first, then writes the mode once', async () => {
    const { eng } = await asleep();
    const y0 = count('yolo'), a0 = count('attach');
    expect(eng.setAuto(true)).toBe(true);
    await w!.flush(1000);
    expect(count('attach') - a0).toBe(1);
    expect(count('yolo') - y0).toBe(1);
    expect(eng.getSnapshot().auto.err).toBe('');
    expect(eng.getSnapshot().dormant).toBe(false);
  });

  it('the switch whose wake is refused writes nothing and says it could not', async () => {
    const { eng } = await asleep();
    (w!.agent as any).attach = (...x: unknown[]) => { (w!.agent as any).rec('attach', ...x); return Promise.reject({ status: 503, code: 'service_unavailable' }); };
    const y0 = count('yolo');
    eng.setAuto(true);
    await w!.flush(1000);
    expect(count('yolo') - y0).toBe(0);
    expect(eng.getSnapshot().auto).toMatchObject({ busy: false, err: 'ask.autoFailOn' });
  });

  it('reloaded (a fresh engine over the same journal) while asleep: still sendable, one wake, one turn', async () => {
    const { sid } = await asleep();
    const fresh = w!.pinned(sid);
    fresh.open();
    await w!.flush(1000);
    expect(fresh.getSnapshot().dormant).toBe(true);
    expect(fresh.canSend()).toBe(true);
    const a0 = count('attach'), t0 = turns().length;
    fresh.send('after reload');
    await w!.flush(2000);
    expect(count('attach') - a0).toBe(1);
    expect(turns().length - t0).toBe(1);
    expect(last(fresh).state).toBe('sent');
  });
});
