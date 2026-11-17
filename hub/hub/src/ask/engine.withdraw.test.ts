// Taking back a queued follow-up (Remove, Edit) against the scripted agent. The agent decides under its queue lock: withdrawn (it will
// never be delivered), taken (already on its way: NOT taken back), ended (it had ended without reaching the chat). The row goes only on
// withdrawn; every other answer keeps it and says what is true. A lost answer is unknown: the row stays, nothing is asked again under the
// same press, and Check status only reads the receipt. An agent without the route (404) leaves the row as it always was.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import { actionsOf, canResend, canEdit } from './rowActions';

beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 200, realms: [REALM], holdQueued: true, queuedGapMs: 50, ...o }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent, eng, flush };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const users = (e: AskEngine) => C.blocks(e.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg as C.UserMsg);
/** A running turn with one follow-up queued behind it; returns the queued row. */
async function queued(t: Awaited<ReturnType<typeof setup>>) {
  t.eng.send('Build me a small dashboard');
  await t.flush(250);
  t.eng.send('Also add a README');
  await t.flush(10);
  const row = users(t.eng)[1]!;
  expect(row).toMatchObject({ text: 'Also add a README', state: 'queued' });
  expect(row.commandId).toBeTruthy();
  return row;
}
describe('a queued follow-up offers Edit and Remove', () => {
  it('both are on offer on a queued row with its command id and text; neither on a sent row', async () => {
    const t = await setup();
    const row = await queued(t);
    expect(actionsOf(row, null)).toEqual(['editQueued', 'withdraw']);
    expect(actionsOf(users(t.eng)[0]!, null)).toEqual([]);
    // A queued row whose text a reload lost can be removed, never edited.
    expect(actionsOf({ ...row, text: '' }, null)).toEqual(['withdraw']);
    // Without a command id there is nothing to name to the agent.
    expect(actionsOf({ ...row, commandId: null }, null)).toEqual([]);
  });
});

describe('answers that do not hold together, a real 404, a row with files', () => {
  // The receipt must agree with the outcome (daemon withdrawCommand): withdrawn = superseded/withdrawn; taken = committed, or queued while a
  // delivery holds it; ended = any other settled state. Anything else is not an answer: unknown, the row stays, no text comes back.
  it.each<[string, Record<string, unknown>]>([
    ['withdrawn + committed', { outcome: 'withdrawn', command: { state: 'committed', how: 'next_step' } }],
    ['withdrawn + queued', { outcome: 'withdrawn', command: { state: 'queued' } }],
    ['withdrawn + superseded by a stop', { outcome: 'withdrawn', command: { state: 'superseded', reason: 'stop' } }],
    ['taken + withdrawn receipt', { outcome: 'taken', command: { state: 'superseded', reason: 'withdrawn' } }],
    ['taken + refused', { outcome: 'taken', command: { state: 'refused', reason: 'hook' } }],
    ['ended + committed', { outcome: 'ended', command: { state: 'committed' } }],
    ['ended + queued', { outcome: 'ended', command: { state: 'queued' } }],
    ['ended + withdrawn receipt', { outcome: 'ended', command: { state: 'superseded', reason: 'withdrawn' } }],
    ['no state', { outcome: 'withdrawn', command: {} }],
  ])('%s: unknown, the row stays queued, Edit gets no text', async (_n, body) => {
    const t = await setup();
    const row = await queued(t);
    (t.agent as any).withdraw = async () => ({ ...body, command: { command_id: row.commandId, kind: 'message', ...(body.command as object) } });
    expect(await t.eng.withdraw(row.id, 'edit')).toEqual({ k: 'unknown' });
    expect(t.eng.getSnapshot().conv.users[row.id]).toMatchObject({ state: 'queued', wd: 'unknown', text: 'Also add a README' });
  });
  it('a 404 is not taken on trust as an old agent: the command is read back, and its receipt settles the row', async () => {
    const t = await setup();
    const row = await queued(t);
    (t.agent as any).withdraw = () => Promise.reject({ status: 404, code: 'not_found' });
    (t.agent as any).commandGet = async () => ({ command_id: row.commandId, kind: 'message', state: 'superseded', reason: 'stop' });
    expect(await t.eng.withdraw(row.id, 'remove')).toEqual({ k: 'refused', code: 'not_found' });
    await t.flush();
    expect(t.eng.getSnapshot().conv.users[row.id]?.state, 'the receipt said it ended').toBe('superseded');
  });
  it('after a withdraw 404, "cannot be taken back here" shows only once the read proves it still queued; an inconclusive read stays unknown', async () => {
    const t = await setup();
    const row = await queued(t);
    (t.agent as any).withdraw = () => Promise.reject({ status: 404, code: 'not_found' });
    (t.agent as any).commandGet = () => Promise.reject({ status: 404, code: 'not_found' });
    await t.eng.withdraw(row.id, 'remove');
    await t.flush();
    expect(t.eng.getSnapshot().conv.users[row.id]?.wd, 'the read was also 404: nothing proven').toBe('unknown');
    (t.agent as any).commandGet = async () => ({ command_id: row.commandId, kind: 'message', state: 'queued' });
    t.eng.check(row.id);
    await t.flush();
    expect(t.eng.getSnapshot().conv.users[row.id]?.wd, 'the read proves it still queued: an agent without the route').toBe('off');
  });
  it('a queued row with files offers Remove but not Edit (Edit would bring back the text without its files)', async () => {
    const t = await setup();
    const row = await queued(t);
    const f = { id: 'f1', kind: 'text' as const, name: 'build.log', text: 'error', bytes: 5, lines: 1 };
    expect(actionsOf({ ...row, files: [f] } as C.UserMsg, null)).toEqual(['withdraw']);
    expect(await t.eng.withdraw(row.id, 'edit').then(async (r) => r), 'a row without files still edits').toMatchObject({ k: 'withdrawn' });
    const t2 = await setup();
    const row2 = await queued(t2);
    t2.eng['conv'] = C.patchUser(t2.eng['conv'], row2.id, { files: [f] } as Partial<C.UserMsg>);
    expect(await t2.eng.withdraw(row2.id, 'edit'), 'the engine refuses Edit on a row with files, asking nothing').toEqual({ k: 'refused', code: 'not_withdrawable' });
    expect(calls(t2.agent, 'withdraw')).toHaveLength(0);
  });
});

describe('Remove', () => {
  it('withdrawn: the row goes, the message is never delivered, one withdraw only', async () => {
    const t = await setup();
    const row = await queued(t);
    const r = await t.eng.withdraw(row.id, 'remove');
    expect(r).toEqual({ k: 'withdrawn' });
    expect(users(t.eng).some((u) => u.id === row.id)).toBe(false);
    await t.flush(8000);
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
    expect(calls(t.agent, 'command')).toHaveLength(1);
    const msgs = JSON.stringify([...(t.agent as any).ss.values()].map((s: any) => s.msgs));
    expect(msgs).not.toContain('Also add a README');
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('taken: the row stays and says it was already sent; it then shows as delivered, never as removed', async () => {
    const t = await setup({ withdraw: 'taken' });
    const row = await queued(t);
    const r = await t.eng.withdraw(row.id, 'remove');
    expect(r).toEqual({ k: 'taken' });
    const now = t.eng.getSnapshot().conv.users[row.id];
    expect(now).toMatchObject({ state: 'queued', wd: 'taken' });
    expect(actionsOf(now!, null)).toEqual([]);
    await t.flush(8000);
    const after = users(t.eng).find((u) => u.text.includes('Also add a README'));
    expect(after?.state).toBe('sent');
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
  });
  it('ended: the row stays with the true outcome (not delivered), never shown as removed by the press', async () => {
    const t = await setup({ withdraw: 'ended' });
    const row = await queued(t);
    const r = await t.eng.withdraw(row.id, 'remove');
    expect(r).toEqual({ k: 'ended' });
    const now = t.eng.getSnapshot().conv.users[row.id];
    expect(now).toBeTruthy();
    expect(now!.state).toBe('superseded');
    expect(actionsOf(now!, null)).toEqual([]);
  });
  it('an agent without the route (404): the row stays queued as before, the actions go, and it is still delivered', async () => {
    const t = await setup({ withdraw: 'missing' });
    const row = await queued(t);
    const r = await t.eng.withdraw(row.id, 'remove');
    expect(r).toEqual({ k: 'refused', code: 'not_found' });
    expect(t.eng.getSnapshot().conv.users[row.id]?.wd, 'nothing proven until the read answers').toBe('unknown');
    await t.flush();
    const now = t.eng.getSnapshot().conv.users[row.id];
    expect(now, 'the read proved it still queued').toMatchObject({ state: 'queued', wd: 'off' });
    expect(actionsOf(now!, null)).toEqual([]);
    await t.flush(8000);
    expect(users(t.eng).find((u) => u.text.includes('Also add a README'))?.state).toBe('sent');
  });
  it('a definite refusal that changed nothing (withdraw_write_failed): still queued, Remove offered again', async () => {
    const t = await setup({ withdraw: 'writeFailed' });
    const row = await queued(t);
    const r = await t.eng.withdraw(row.id, 'remove');
    expect(r).toEqual({ k: 'refused', code: 'withdraw_write_failed' });
    const now = t.eng.getSnapshot().conv.users[row.id]!;
    expect(now.state).toBe('queued');
    expect(now.wd).toBeUndefined();
    expect(now.reason).toBe('ask.withdrawFailed');
    expect(actionsOf(now, null)).toEqual(['editQueued', 'withdraw']);
  });
  it('a lost answer: unknown, the row stays, no second withdraw and no resend; Check status reads the receipt and the row goes once it proves withdrawn', async () => {
    const t = await setup({ withdraw: 'lost' });
    const row = await queued(t);
    const r = await t.eng.withdraw(row.id, 'remove');
    expect(r).toEqual({ k: 'unknown' });
    const now = t.eng.getSnapshot().conv.users[row.id]!;
    expect(now).toMatchObject({ state: 'queued', wd: 'unknown' });
    expect(actionsOf(now, null), 'only Check again: a read, never Edit, Remove or Send again').toEqual(['check']);
    // A second press on the same row asks nothing.
    expect(await t.eng.withdraw(row.id, 'remove')).toEqual({ k: 'refused', code: 'not_withdrawable' });
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
    t.eng.check(row.id);
    await t.flush();
    expect(calls(t.agent, 'commandGet').length).toBeGreaterThan(0);
    expect(users(t.eng).some((u) => u.id === row.id)).toBe(false);
    await t.flush(8000);
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
    expect(calls(t.agent, 'command')).toHaveLength(1);
  });
  it('an unconfirmed answer whose withdrawal did not happen: unknown until a read proves otherwise; delivered shows as sent', async () => {
    const t = await setup({ withdraw: 'unconfirmed' });
    const row = await queued(t);
    expect(await t.eng.withdraw(row.id, 'remove')).toEqual({ k: 'unknown' });
    t.eng.check(row.id);
    await t.flush();
    // Still queued at the agent: not proven either way, the row keeps saying so.
    expect(t.eng.getSnapshot().conv.users[row.id]).toMatchObject({ state: 'queued', wd: 'unknown' });
    await t.flush(8000);
    expect(users(t.eng).find((u) => u.text.includes('Also add a README'))?.state).toBe('sent');
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
  });
});

describe('Edit', () => {
  it('withdrawn: the text comes back for the composer and the row goes', async () => {
    const t = await setup();
    const row = await queued(t);
    expect(await t.eng.withdraw(row.id, 'edit')).toEqual({ k: 'withdrawn', text: 'Also add a README' });
    expect(users(t.eng).some((u) => u.id === row.id)).toBe(false);
    await t.flush(8000);
    expect(calls(t.agent, 'command')).toHaveLength(1);
  });
  it('taken: no text comes back', async () => {
    const t = await setup({ withdraw: 'taken' });
    const row = await queued(t);
    expect(await t.eng.withdraw(row.id, 'edit')).toEqual({ k: 'taken' });
    expect(t.eng.getSnapshot().conv.users[row.id]).toMatchObject({ wd: 'taken' });
  });
  it('a lost answer later proven withdrawn by Check status: the row stays as Taken back with its text, Edit (never Send again) brings it back', async () => {
    const t = await setup({ withdraw: 'lost' });
    const row = await queued(t);
    expect(await t.eng.withdraw(row.id, 'edit')).toEqual({ k: 'unknown' });
    t.eng.check(row.id);
    await t.flush();
    const now = t.eng.getSnapshot().conv.users[row.id]!;
    expect(now).toMatchObject({ state: 'notSent', reason: 'ask.withdrawn', text: 'Also add a README' });
    expect(canResend(now)).toBe(false);
    expect(canEdit(now)).toBe(true);
    expect(t.eng.takeBack(row.id)).toBe('Also add a README');
    expect(calls(t.agent, 'command')).toHaveLength(1);
  });
});

