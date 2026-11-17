// Check again never frees a hold whose send may still be out. A list that already
// shows the model (someone else set it while this PATCH is out) is no proof this PATCH is done: it could still land after
// a second change. checkHeld frees through core's checked free ('proved'), which core refuses while the send is out;
// once the send was answered (sent), the same Check again frees it.
import { afterEach, describe, expect, it } from 'vitest';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { boot, R1 } from '@core/test/env';
import { checkHeld, MODEL_HOLD_BY, modelLock, sendHeld, type HeldModel, type ModelAt } from './modelHold';
import type { ModelApi } from './flows-default';
import type { Settled } from './types';

const FREE = 'hoody-ai/hoody-free';
const GPT = 'openai/gpt-5';
const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };

afterEach(() => resetAttempts());

/** An api whose PATCH answers only when the test says so; the list shows `list.model`. */
function fakeApi() {
  const list = { model: FREE };
  let answer!: (r: Settled<unknown>) => void;
  let patches = 0;
  const api: ModelApi = {
    agentModel: () => {
      patches += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    },
    agents: async () => ({ ok: true, body: { items: [{ name: 'helper', provenance: 'user', model: list.model }], meta: { total: 1 } } }),
  };
  return { api, list, answer: (r: Settled<unknown>) => answer(r), patches: () => patches };
}

describe('Check again while the send may still be out', () => {
  it('a list already showing the model keeps the hold while the PATCH is out; once it was answered, Check again frees it', async () => {
    boot({ realm: R1 });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const lock = modelLock(at, 'helper')!;
    const f = fakeApi();
    const send = sendHeld(f.api, at, 'helper', GPT, false, { defaultAgent: '' });
    await expect.poll(() => heldAttempts(lock).length).toBe(1);
    const h = heldAttempts(lock)[0]!;
    expect(h.by).toBe(MODEL_HOLD_BY);
    const held: HeldModel = { id: h.id, model: GPT, unknown: false, metaVersion: h.metaVersion, inFlight: true };
    // Someone else set GPT-5 meanwhile: the list shows it, but this PATCH is still out.
    f.list.model = GPT;
    expect(await checkHeld(f.api, at, 'helper', held)).toEqual({ state: 'not_confirmed' });
    expect(heldAttempts(lock).map((x) => x.id)).toEqual([h.id]);
    // The PATCH's answer is lost and the list, read back, no longer shows GPT-5: the hold stays, its send answered.
    f.list.model = FREE;
    f.answer(lost);
    expect(await send).toEqual({ state: 'not_confirmed' });
    await expect.poll(() => heldAttempts(lock)[0]?.inFlight).toBe(false);
    expect(heldAttempts(lock).map((x) => x.id)).toEqual([h.id]);
    // Now the list shows it and nothing is out: Check again frees the hold, and sent nothing.
    f.list.model = GPT;
    expect(await checkHeld(f.api, at, 'helper', { ...held, inFlight: false })).toEqual({ state: 'saved' });
    expect(heldAttempts(lock)).toEqual([]);
    expect(f.patches()).toBe(1);
  });
});

// A container id alone is not unique across projects. Two computers in different projects with the same
// container id, realm and agent never share a hold: the other one neither shows it (so offers no Check again on it), nor is
// refused by it, nor frees it by saving.
describe('two projects sharing a container id', () => {
  it("a hold on one project's computer is not the other's: not shown there, not refusing its change, not freed by its save", async () => {
    boot({ realm: R1 });
    const p1: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const p2: ModelAt = { project: 'p2', computer: 'c1', realm: R1 };
    const lock1 = modelLock(p1, 'helper')!;
    const lock2 = modelLock(p2, 'helper')!;
    expect(lock1).not.toBe(lock2);
    const f1 = fakeApi();
    const send = sendHeld(f1.api, p1, 'helper', GPT, false, { defaultAgent: '' });
    await expect.poll(() => heldAttempts(lock1).length).toBe(1);
    expect(heldAttempts(lock2)).toEqual([]);
    const h = heldAttempts(lock1)[0]!;
    expect(h.identity).toEqual({ project: 'p1', computer: 'c1', realm: R1, agent: 'helper' });
    // The p1 PATCH is answered lost: its hold stays, nothing out.
    f1.answer(lost);
    expect(await send).toEqual({ state: 'not_confirmed' });
    await expect.poll(() => heldAttempts(lock1)[0]?.inFlight).toBe(false);
    // p2's computer already shows GPT-5, but its row reads no hold (its own lock), so it offers no Check again that could free p1's.
    expect(heldAttempts(lock2)).toEqual([]);
    const f2 = fakeApi();
    f2.list.model = GPT;
    // A change on p2 is its own: not refused as held, sent once.
    const send2 = sendHeld(f2.api, p2, 'helper', FREE, false, { defaultAgent: '' });
    await expect.poll(() => f2.patches()).toBe(1);
    expect(heldAttempts(lock2).length).toBe(1);
    f2.answer({ ok: true, body: {} });
    f2.list.model = FREE;
    expect((await send2).state).toBe('saved');
    expect(heldAttempts(lock2)).toEqual([]);
    expect(heldAttempts(lock1).map((x) => x.id)).toEqual([h.id]);
    expect(f1.patches()).toBe(1);
  });

  it('a project id that cannot be named in a lock sends nothing', async () => {
    boot({ realm: R1 });
    const f = fakeApi();
    expect(await sendHeld(f.api, { project: 'p 1', computer: 'c1', realm: R1 }, 'helper', GPT, false, { defaultAgent: '' })).toEqual({ state: 'not_held' });
    expect(f.patches()).toBe(0);
  });
});
