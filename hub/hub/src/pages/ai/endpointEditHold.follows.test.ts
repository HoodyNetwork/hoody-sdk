// The endpoint edit sends through an api that follows the computer shown at the call. The models' digest and the hold come
// first, and the storage lock can be waited on while the person switches computer: the edit must never go to the new
// computer under this one's hold.
import { afterEach, describe, expect, it } from 'vitest';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import type { Api } from './api';
import { editLock, sendEdit, type EditAt } from './endpointEditHold';
import type { Saved } from './flows-endpoint';
import type { Settled } from './types';

const AT: EditAt = { project: 'p1', computer: 'c1' };
const EP = 'my-ep';
const BEFORE: Saved = { name: 'My endpoint', base_url: 'https://x.example/v1', models: ['m1'] };
const AFTER: Saved = { name: 'Renamed', base_url: 'https://x.example/v1', models: ['m1'] };

afterEach(() => {
  setTarget(null);
  resetAttempts();
});

/** An api whose PATCH answers only when the test says so. */
function fakeApi() {
  let answer: ((r: Settled<unknown>) => void) | null = null;
  let patches = 0;
  const api = {
    customPatch: () => {
      patches += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    },
  } as unknown as Api;
  return { api, answer: (r: Settled<unknown>) => answer?.(r), patches: () => patches };
}

describe('sendEdit with an api that follows the shown computer', () => {
  it('a computer switch while the edit is being prepared and held sends nothing and lets the hold go', async () => {
    boot();
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const f = fakeApi();
    const send = sendEdit(f.api, AT, EP, BEFORE, AFTER);
    // The switch lands before the digest and the hold are done.
    setTarget({ project: { id: 'p1' }, container: { id: 'c2' } });
    // A send that went out waits for its PATCH answer: answer it so the test ends either way.
    let done = false;
    void send.then(() => { done = true; });
    await expect.poll(() => done || f.patches() > 0).toBe(true);
    f.answer({ ok: true, body: {} });
    expect(await send).toEqual({ state: 'stale' });
    expect(f.patches()).toBe(0);
    expect(heldAttempts(editLock(AT, EP)!)).toEqual([]);
  });

  it('the same computer at the send: sent once and saved (control)', async () => {
    boot();
    setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
    const f = fakeApi();
    const send = sendEdit(f.api, AT, EP, BEFORE, AFTER);
    await expect.poll(() => f.patches()).toBe(1);
    f.answer({ ok: true, body: {} });
    expect((await send).state).toBe('saved');
    expect(f.patches()).toBe(1);
    expect(heldAttempts(editLock(AT, EP)!)).toEqual([]);
  });
});
