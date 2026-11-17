// Settings → Default model sends through an api that follows the computer shown at the call. The hold is taken first, and
// the storage lock can be waited on while the person switches computer: the change must never go to the new computer.
import { afterEach, describe, expect, it } from 'vitest';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot, R1 } from '@core/test/env';
import { modelLock, sendHeld, type ModelAt } from './modelHold';
import type { ModelApi } from './flows-default';
import type { Settled } from './types';

const FREE = 'hoody-ai/hoody-free';
const GPT = 'openai/gpt-5';

afterEach(() => {
  setTarget(null);
  resetAttempts();
});

/** An api whose PATCH answers only when the test says so; the list shows `list.model`. */
function fakeApi() {
  const list = { model: FREE };
  let answer: ((r: Settled<unknown>) => void) | null = null;
  let patches = 0;
  const api: ModelApi = {
    agentModel: () => {
      patches += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    },
    agents: async () => ({ ok: true, body: { items: [{ name: 'helper', provenance: 'user', model: list.model }], meta: { total: 1 } } }),
  };
  return { api, list, answer: (r: Settled<unknown>) => answer?.(r), patches: () => patches };
}

describe('sendHeld with an api that follows the shown computer', () => {
  it('a computer switch while the hold is being taken sends nothing and lets the hold go', async () => {
    boot({ realm: R1 });
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendHeld(f.api, at, 'helper', GPT, false, { defaultAgent: '' }, { followsShown: true });
    // The switch lands before holdAttempt answers.
    setTarget({ project: { id: 'p1' }, container: { id: 'c2' } });
    // A send that went out waits for its PATCH answer: answer it so the test ends either way.
    let done = false;
    void send.then(() => { done = true; });
    await expect.poll(() => done || f.patches() > 0).toBe(true);
    f.answer({ ok: true, body: {} });
    expect(await send).toEqual({ state: 'stale' });
    expect(f.patches()).toBe(0);
    expect(heldAttempts(modelLock(at, 'helper')!)).toEqual([]);
  });

  it('the same computer at the send: sent once and saved', async () => {
    boot({ realm: R1 });
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendHeld(f.api, at, 'helper', GPT, false, { defaultAgent: '' }, { followsShown: true });
    await expect.poll(() => f.patches()).toBe(1);
    f.list.model = GPT;
    f.answer({ ok: true, body: {} });
    expect((await send).state).toBe('saved');
    expect(f.patches()).toBe(1);
    expect(heldAttempts(modelLock(at, 'helper')!)).toEqual([]);
  });
});
