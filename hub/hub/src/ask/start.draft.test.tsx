// Vitest: a start (New chat's first message, sent on the place's dock engine) carries its own text only. An image waiting in the
// dock's draft for the same computer stays in the draft and never rides the new chat's first turn.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as A from './attach';
import * as C from './conv';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type FakeOptions } from './fake';
import type { AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
// A real PNG header (signature + a 1×1 IHDR with its CRC): the agent reads the header, not only the signature.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89];

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  const store = memStore();
  const eng = new AskEngine(slot, agent, store, clock);
  const revoked: string[] = [];
  eng.revokeUrl = (u) => { revoked.push(u); };
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await act(async () => {
      await drain();
      for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
    });
  };
  eng.open();
  await flush();
  return { agent, eng, store, clock, flush, revoked, snap: () => eng.getSnapshot() };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const users = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg);
let n = 0;
const image = (name: string, size = 1200) => {
  const b = new Uint8Array(size); b.set(PNG); for (let i = PNG.length; i < size; i++) b[i] = (i * 7 + n) % 256;
  const id = 'i' + ++n;
  return A.prepare(id, name, b, () => 'blob:' + id);
};

describe("a start never takes the dock's draft", () => {
  it('the new chat goes with its text alone; the dock draft keeps its image', async () => {
    const t = await setup();
    t.eng.send('first');
    await t.flush(2000);
    t.eng.attach([image('dock-draft.png')], '');
    await t.flush();
    expect(t.snap().att.items.map((x: A.Att) => x.name)).toEqual(['dock-draft.png']);
    const told: string[] = [];
    t.eng.queueStart('What is running on atlas?', (o) => told.push(o));
    await t.flush(3000);
    expect(told).toEqual(['sent']);
    const turns = calls(t.agent, 'turn');
    const last = turns[turns.length - 1] as any;
    expect(last[1][1]).toBe('What is running on atlas?');
    expect(last[1][3]).toBeUndefined();
    expect(users(t.snap()).map((u: any) => [u.text, u.imgs?.length ?? 0])).toEqual([['What is running on atlas?', 0]]);
    expect(t.snap().att.items.map((x: A.Att) => x.name)).toEqual(['dock-draft.png']);
    expect(t.revoked).toEqual([]);
  });
});
