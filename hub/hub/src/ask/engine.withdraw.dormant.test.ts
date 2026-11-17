// Edit or Remove on a queued follow-up of a chat that fell asleep on the computer meanwhile. The agent's command routes serve a live chat
// only: a sleeping one it can see answers 409 session_closed, an unknown one 404. Either way
// nothing was taken back: the row stays, its press is answered once, and nothing is sent again. The person's next message wakes the chat
// once and is sent once; the queued message is never sent a second time by that wake.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as C from './conv';
import type { AskEngine } from './engine';
import type { FakeAgent } from './fake';
import { world, type World } from './accept/env';

// A journaled engine, as every page has: the wake (POST /sessions with attach) carries a lease ticket from the approver registry.
let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const users = (e: AskEngine) => C.blocks(e.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg as C.UserMsg);
/** Every request other than a withdraw that carried this text (a turn or a follow-up command). */
const carried = (agent: FakeAgent, text: string) => agent.log.filter((x) => x[0] !== 'withdraw' && JSON.stringify(x[1] ?? []).includes(text)).length;

/** A pinned chat (the AI page's) with a running turn and one follow-up queued behind it; then the agent restarts: the running turn ends
 *  (failed) and the chat comes back asleep, its queued follow-up still waiting (an agent never runs a turn on a sleeping chat). */
async function asleepWithQueued() {
  w = world({ pace: 200, holdQueued: true, queuedGapMs: 1e9 });
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
  eng.send('Build me a small dashboard');
  await w.flush(250);
  eng.send('Also add a README');
  await w.flush(10);
  const row = users(eng).find((u) => u.text === 'Also add a README')!;
  expect(row).toMatchObject({ state: 'queued' });
  expect(row.commandId).toBeTruthy();
  const ses = (w.agent as any).ss.get(sid);
  expect(ses.running, 'the turn still runs when the agent restarts').toBeTruthy();
  w.agent.setDormant(sid, true);
  (w.agent as any).endTurn(sid, ses.turns.find((x: any) => x.id === ses.running), 'failed', ses.running, () => undefined);
  eng.wake();
  await w.flush(100);
  expect(eng.getSnapshot().dormant).toBe(true);
  return { agent: w.agent, eng, flush: w.flush, row, sid };
}

describe('Edit and Remove on a queued message of a chat asleep on the computer', () => {
  it.each(['remove', 'edit'] as const)('%s: session_closed, the row stays, one withdraw, nothing sent again', async (then) => {
    const t = await asleepWithQueued();
    const sentBefore = carried(t.agent, 'Also add a README');
    const p = t.eng.withdraw(t.row.id, then);
    await t.flush(10);
    const r = await p;
    expect(r).toEqual({ k: 'refused', code: 'session_closed' });
    const after = users(t.eng).find((u) => u.id === t.row.id);
    expect(after, 'the row stays').toBeTruthy();
    expect(after!.state).toBe('queued');
    expect(after!.wd).toBe('closed');
    await t.flush(5000);
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
    expect(carried(t.agent, 'Also add a README'), 'nothing sent again').toBe(sentBefore);
  });

  it('an agent that no longer has the chat answers 404: the row stays, Edit/Remove are off, nothing sent again', async () => {
    const t = await asleepWithQueued();
    const sentBefore = carried(t.agent, 'Also add a README');
    (t.agent as any).withdraw = (...a: unknown[]) => { (t.agent as any).rec('withdraw', ...a); return Promise.reject({ status: 404, code: 'not_found' }); };
    const p = t.eng.withdraw(t.row.id, 'remove');
    await t.flush(10);
    expect(await p).toEqual({ k: 'refused', code: 'not_found' });
    expect(users(t.eng).find((u) => u.id === t.row.id)).toMatchObject({ state: 'queued', wd: 'off' });
    await t.flush(5000);
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
    expect(carried(t.agent, 'Also add a README')).toBe(sentBefore);
  });

  it('after a refused Remove, the next message wakes the chat once and is sent once; the queued message is not sent again', async () => {
    const t = await asleepWithQueued();
    const p = t.eng.withdraw(t.row.id, 'remove');
    await t.flush(10);
    expect(await p).toEqual({ k: 'refused', code: 'session_closed' });
    const sentBefore = carried(t.agent, 'Also add a README');
    const a0 = calls(t.agent, 'attach').length;
    const L0 = t.agent.log.length;
    expect(t.eng.send('One more thing')).toBe(true);
    await t.flush(3000);
    expect(calls(t.agent, 'attach').length - a0, 'woken once').toBe(1);
    // It goes once, after the wake: as a follow-up behind the message still queued (the agent starts it as a turn on the idle chat).
    const after = t.agent.log.slice(L0).map((x) => x[0] as string);
    const carriers = t.agent.log.slice(L0).filter((x) => JSON.stringify(x[1] ?? []).includes('One more thing'));
    expect(carriers, 'sent once').toHaveLength(1);
    expect(['turn', 'command']).toContain(carriers[0]![0]);
    expect(after.indexOf('attach')).toBeLessThan(after.indexOf(carriers[0]![0] as string));
    expect(users(t.eng).find((u) => u.text === 'One more thing')!.state).toBe('sent');
    await t.flush(5000);
    expect(carried(t.agent, 'Also add a README'), 'the queued message is not resent').toBe(sentBefore);
    expect(users(t.eng).filter((u) => u.text === 'Also add a README')).toHaveLength(1);
  });
});
