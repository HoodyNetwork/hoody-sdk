// Settings → Claude Code sends its changes through an api that follows the computer shown at the call. The hold is taken
// first, and the storage lock can be waited on while the person switches computer (the section stays mounted): the change
// must never go to the new computer under this one's hold.
import { afterEach, describe, expect, it } from 'vitest';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot, R1 } from '@core/test/env';
import type { Api } from './api';
import { claudeLock, sendClaude } from './claudeHold';
import type { ModelAt } from './modelHold';
import type { Settled } from './types';

afterEach(() => {
  setTarget(null);
  resetAttempts();
});

/** An api whose write answers only when the test says so; the read-back shows `acp.enabled`. */
function fakeApi() {
  const acp = { enabled: false };
  let answer: ((r: Settled<unknown>) => void) | null = null;
  let writes = 0;
  const api = {
    acpEnabled: () => {
      writes += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    },
    acp: async () => ({ ok: true, body: { report: { agents: [{ name: 'claude', enabled: acp.enabled }] } } }),
  } as unknown as Api;
  return { api, acp, answer: (r: Settled<unknown>) => answer?.(r), writes: () => writes };
}

describe('sendClaude with an api that follows the shown computer', () => {
  it('a computer switch while the hold is being taken sends nothing and lets the hold go', async () => {
    boot({ realm: R1 });
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendClaude(f.api, at, { kind: 'enabled', v: true });
    // The switch lands before holdAttempt answers.
    setTarget({ project: { id: 'p1' }, container: { id: 'c2' } });
    // A send that went out waits for its answer: answer it so the test ends either way.
    let done = false;
    void send.then(() => { done = true; });
    await expect.poll(() => done || f.writes() > 0).toBe(true);
    f.answer({ ok: true, body: {} });
    expect(await send).toEqual({ state: 'stale' });
    expect(f.writes()).toBe(0);
    expect(heldAttempts(claudeLock(at)!)).toEqual([]);
  });

  it('the same computer at the send: sent once and saved (control)', async () => {
    boot({ realm: R1 });
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendClaude(f.api, at, { kind: 'enabled', v: true });
    await expect.poll(() => f.writes()).toBe(1);
    f.acp.enabled = true;
    f.answer({ ok: true, body: {} });
    expect((await send).state).toBe('saved');
    expect(f.writes()).toBe(1);
    expect(heldAttempts(claudeLock(at)!)).toEqual([]);
  });
});
