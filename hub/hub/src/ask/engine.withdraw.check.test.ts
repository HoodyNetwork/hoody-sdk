// Check again on a queued follow-up whose take-back answer was lost, on a journaled engine (every page's). Check again only READS (C9):
// the row's command was admitted (the agent gave it a command id), so a read by its key that misses is a receipt the agent no longer
// keeps, and a retire could prove nothing about it; nothing is written to the agent, the row stays unknown and says so.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as C from './conv';
import type { AskEngine } from './engine';
import type { FakeAgent } from './fake';
import { actionsOf } from './rowActions';
import { world, type World } from './accept/env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const users = (e: AskEngine) => C.blocks(e.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg as C.UserMsg);
/** Every request that is not a read: a withdraw, a send, a retire. */
const WRITES = new Set(['withdraw', 'command', 'turn', 'create', 'commandKeyRetire', 'turnKeyRetire', 'createKeyRetire']);
const writes = (agent: FakeAgent) => agent.log.filter((x) => WRITES.has(String(x[0]))).length;

async function lostWithdraw() {
  w = world({ pace: 200, holdQueued: true, queuedGapMs: 1e9, withdraw: 'lost' });
  const eng = await w.dock();
  eng.send('Build me a small dashboard');
  await w.flush(250);
  eng.send('Also add a README');
  await w.flush(10);
  const row = users(eng).find((u) => u.text === 'Also add a README')!;
  expect(row).toMatchObject({ state: 'queued' });
  expect(row.commandId).toBeTruthy();
  expect(await eng.withdraw(row.id, 'remove')).toEqual({ k: 'unknown' });
  return { agent: w.agent, eng, row, flush: w.flush };
}

describe('Check again after a lost take-back answer (journaled)', () => {
  it('the read by key misses: no retire, nothing written, the row stays unknown with Check again only', async () => {
    const t = await lostWithdraw();
    (t.agent as any).commandByKey = (...a: unknown[]) => { (t.agent as any).rec('commandByKey', ...a); return Promise.reject({ status: 404, code: 'command_not_found', details: { retired: false } }); };
    const before = writes(t.agent);
    t.eng.check(t.row.id);
    await t.flush(50);
    expect(calls(t.agent, 'commandByKey').length, 'it was read').toBeGreaterThan(0);
    expect(calls(t.agent, 'commandKeyRetire'), 'Check again never retires an admitted key').toHaveLength(0);
    expect(writes(t.agent), 'nothing written to the agent').toBe(before);
    const now = users(t.eng).find((u) => u.id === t.row.id)!;
    expect(now).toMatchObject({ state: 'queued', wd: 'unknown' });
    expect(actionsOf(now, null)).toEqual(['check']);
  });
  it('the read finds it withdrawn: proven by a read alone, the row goes (it was a Remove)', async () => {
    const t = await lostWithdraw();
    const before = writes(t.agent);
    t.eng.check(t.row.id);
    await t.flush(50);
    expect(writes(t.agent)).toBe(before);
    expect(users(t.eng).some((u) => u.id === t.row.id)).toBe(false);
  });
});
