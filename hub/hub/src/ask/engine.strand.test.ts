// A row that reaches a send path it cannot leave from never stays Sending… with nothing to land it.
// createWith (no create key), dispatch (no session, no turn body) and command (no session, no text) settle the row: Not sent
// when its key never left, unknown when an earlier send of the same key may have (the record or the stored record holds it as
// k2 with w, in kw or in k3; or there is no record to prove it fresh). Rows in any other state are left alone.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock } from './fake';
import type { AskStore } from './logic';

beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup() {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM] }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { clock, agent, eng, flush };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const row = (eng: AskEngine, id: string) => (eng as any).conv.users[id] as C.UserMsg | undefined;
/** A row put straight into the conversation, as a broken caller would leave it. */
function inject(eng: AskEngine, o: Partial<C.UserMsg> & { id: string; via: C.UserMsg['via'] }): void {
  const u = { text: 'Check the port', at: 0, key: 'hx-' + 'ab'.repeat(16), state: 'sending', turnId: null, commandId: null, reason: '', ...o } as C.UserMsg;
  (eng as any).conv = C.addUser((eng as any).conv, u);
}
/** An engine whose first turn has finished: the record holds the session. */
async function withSession() {
  const t = await setup();
  expect(t.eng.send('Build me a small dashboard')).toBe(true);
  await t.flush(2000);
  expect(t.eng.record?.s).toBeTruthy();
  return t;
}

describe('a row that cannot leave is settled, never left Sending…', () => {
  it('createWith: no create key can be minted, so the first message is Not sent and nothing is created', async () => {
    const t = await setup();
    // The row's own key mints as usual; the create key cannot be minted (key() answers null, as a page without a random source).
    const real = (t.eng as any).key.bind(t.eng);
    (t.eng as any).key = (route?: string) => (route === 'create' ? null : real(route));
    expect(t.eng.send('Build me a small dashboard')).toBe(true);
    const id = Object.keys((t.eng as any).conv.users)[0]!;
    await t.flush(2000);
    expect(row(t.eng, id)).toMatchObject({ state: 'notSent', reason: 'ask.startNotSent' });
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('dispatch with no record at all: unknown (nothing proves the key fresh), nothing sent, no throw', async () => {
    const t = await setup();
    inject(t.eng, { id: 'uX', via: 'turn' });
    expect(() => (t.eng as any).dispatch('uX')).not.toThrow();
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
    await t.flush(500);
    expect(calls(t.agent, 'turn')).toHaveLength(0);
  });
  it('dispatch on a record that lost its session, holding nothing of this key: Not sent', async () => {
    const t = await withSession();
    const before = calls(t.agent, 'turn').length;
    (t.eng as any).rec.s = null;
    (t.eng as any).storedOf = () => undefined;
    inject(t.eng, { id: 'uX', via: 'turn' });
    (t.eng as any).dispatch('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'notSent', reason: 'ask.startNotSent' });
    expect(calls(t.agent, 'turn')).toHaveLength(before);
  });
  it('dispatch on a record that lost its session but still holds this key as pending: unknown', async () => {
    const t = await withSession();
    const rec = (t.eng as any).rec;
    const key = 'hx-' + 'ef'.repeat(16);
    rec.s = null; rec.k2 = key; rec.w = true;
    inject(t.eng, { id: 'uX', via: 'turn', key });
    (t.eng as any).dispatch('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('dispatch with no turn body under a fresh key: Not sent, no turn', async () => {
    const t = await withSession();
    const before = calls(t.agent, 'turn').length;
    inject(t.eng, { id: 'uX', via: 'turn', text: '' });
    (t.eng as any).dispatch('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'notSent', reason: 'ask.startNotSent' });
    await t.flush(500);
    expect(calls(t.agent, 'turn')).toHaveLength(before);
  });
  it('dispatch with no turn body under the key the record already sent with: unknown, since that send may have left', async () => {
    const t = await withSession();
    const rec = (t.eng as any).rec;
    rec.w = true;
    inject(t.eng, { id: 'uX', via: 'turn', text: '', key: rec.k2 });
    (t.eng as any).dispatch('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('dispatch with no turn body under a displaced unsettled key (kw): unknown', async () => {
    const t = await withSession();
    const key = 'hx-' + '12'.repeat(16);
    (t.eng as any).rec.kw = [key];
    inject(t.eng, { id: 'uX', via: 'turn', text: '', key });
    (t.eng as any).dispatch('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('dispatch with no turn body under a key only the stored record holds (another tab moved it): unknown', async () => {
    const t = await withSession();
    const rec = (t.eng as any).rec;
    const key = 'hx-' + '34'.repeat(16);
    for (const [i, stored] of [{ ...rec, k2: key, w: true }, { ...rec, kw: [key] }].entries()) {
      (t.eng as any).storedOf = () => stored;
      const id = 'uS' + i;
      inject(t.eng, { id, via: 'turn', text: '', key });
      (t.eng as any).dispatch(id);
      expect(row(t.eng, id)).toMatchObject({ state: 'unknown', reason: '' });
    }
  });
  it('command with no text under a fresh key: Not sent, no follow-up', async () => {
    const t = await withSession();
    inject(t.eng, { id: 'uX', via: 'command', text: '' });
    (t.eng as any).command('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'notSent', reason: 'ask.startNotSent' });
    await t.flush(500);
    expect(calls(t.agent, 'command')).toHaveLength(0);
  });
  it('command with no text under a key already held in k3: unknown', async () => {
    const t = await withSession();
    const key = 'hx-' + 'cd'.repeat(16);
    (t.eng as any).rec.k3 = [key];
    inject(t.eng, { id: 'uX', via: 'command', text: '', key });
    (t.eng as any).command('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('command with no text under a key only the stored record holds in k3: unknown', async () => {
    const t = await withSession();
    const key = 'hx-' + '56'.repeat(16);
    (t.eng as any).storedOf = () => ({ ...(t.eng as any).rec, k3: [key] });
    inject(t.eng, { id: 'uX', via: 'command', text: '', key });
    (t.eng as any).command('uX');
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('command with no record at all: unknown, nothing sent, no throw', async () => {
    const t = await setup();
    inject(t.eng, { id: 'uX', via: 'command' });
    expect(() => (t.eng as any).command('uX')).not.toThrow();
    expect(row(t.eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
    expect(calls(t.agent, 'command')).toHaveLength(0);
  });
  it('a row in any other state is left as it is', async () => {
    const t = await withSession();
    for (const state of ['queued', 'unknown', 'sent'] as const) {
      const id = 'u' + state;
      inject(t.eng, { id, via: 'command', text: '', state });
      (t.eng as any).command(id);
      expect(row(t.eng, id)?.state).toBe(state);
    }
  });
});
