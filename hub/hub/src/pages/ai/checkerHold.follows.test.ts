// Settings → Advanced sends the checker's change through an api that follows the computer shown at the call. The hold is
// taken first, and the storage lock can be waited on while the person switches computer: the change must never go to the
// new computer under this one's hold.
import { afterEach, describe, expect, it } from 'vitest';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot, R1 } from '@core/test/env';
import type { Api } from './api';
import { checkerLock, sendChecker } from './checkerHold';
import type { ModelAt } from './modelHold';
import type { Settled } from './types';

const GUARD = { realm: R1, realmSettings: true };

afterEach(() => {
  setTarget(null);
  resetAttempts();
});

/** An api whose PUT answers only when the test says so; the read-back shows `jev.enabled`. */
function fakeApi() {
  const jev = { enabled: false };
  let answer: ((r: Settled<unknown>) => void) | null = null;
  let puts = 0;
  const api = {
    jevPut: () => {
      puts += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    },
    jev: async () => ({ ok: true, body: { enabled: jev.enabled } }),
  } as unknown as Api;
  return { api, jev, answer: (r: Settled<unknown>) => answer?.(r), puts: () => puts };
}

describe('sendChecker with an api that follows the shown computer', () => {
  it('a computer switch while the hold is being taken sends nothing and lets the hold go', async () => {
    boot({ realm: R1 });
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendChecker(f.api, at, R1, GUARD, { enabled: true });
    // The switch lands before holdAttempt answers.
    setTarget({ project: { id: 'p1' }, container: { id: 'c2' } });
    // A send that went out waits for its PUT answer: answer it so the test ends either way.
    let done = false;
    void send.then(() => { done = true; });
    await expect.poll(() => done || f.puts() > 0).toBe(true);
    f.answer({ ok: true, body: {} });
    expect(await send).toEqual({ state: 'stale' });
    expect(f.puts()).toBe(0);
    expect(heldAttempts(checkerLock(at)!)).toEqual([]);
  });

  it('the same computer at the send: sent once (control)', async () => {
    boot({ realm: R1 });
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendChecker(f.api, at, R1, GUARD, { enabled: true });
    await expect.poll(() => f.puts()).toBe(1);
    f.jev.enabled = true;
    f.answer({ ok: true, body: {} });
    expect((await send).state).not.toBe('stale');
    expect(f.puts()).toBe(1);
  });
});
