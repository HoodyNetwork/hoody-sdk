// The effort change's core hold (effortHold.ts). Its own sender and lock, never the model's; keyed by
// the project too (two projects can share a container id); a lost answer keeps it, a 400 refusal lets it go; Check again
// never frees it while the PATCH may still be out.
import { afterEach, describe, expect, it } from 'vitest';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { boot, R1 } from '@core/test/env';
import { modelLock, type ModelAt } from '../modelHold';
import { checkEffort, EFFORT_HOLD_BY, effortLock, sendEffort, type EffortApi, type HeldEffort } from './effortHold';
import type { Settled } from '../types';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const refused: Settled<unknown> = { ok: false, err: { kind: 'failed', code: 'bad_request', status: 400, retryAfter: null, details: {} } };

afterEach(() => resetAttempts());

/** An api whose PATCH answers only when the test says so; the list shows `list.effort`. */
function fakeApi() {
  // effort: what the list shows; undefined leaves the field out of the row.
  const list: { effort: unknown } = { effort: '' };
  let answer!: (r: Settled<unknown>) => void;
  let patches = 0;
  const api: EffortApi = {
    agentEffort: () => {
      patches += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    },
    agents: async () => ({ ok: true, body: { items: [{ name: 'helper', provenance: 'user', ...(list.effort === undefined ? {} : { effort: list.effort }) }], meta: { total: 1 } } }),
  };
  return { api, list, answer: (r: Settled<unknown>) => answer(r), patches: () => patches };
}

const heldOf = (lock: string): HeldEffort => {
  const h = heldAttempts(lock)[0]!;
  return { id: h.id, effort: (h.meta as { effort: HeldEffort['effort'] }).effort, metaVersion: h.metaVersion, inFlight: h.inFlight !== false };
};

describe('the effort hold', () => {
  it('is its own lock, not the model one', () => {
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    expect(effortLock(at, 'helper')).not.toBe(modelLock(at, 'helper'));
    expect(effortLock(at, 'helper')!.startsWith(`${EFFORT_HOLD_BY}:`)).toBe(true);
  });

  it('a lost answer keeps the hold; Check again does not free it while the PATCH is out, then does once answered', async () => {
    boot({ realm: R1 });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const lock = effortLock(at, 'helper')!;
    const f = fakeApi();
    const send = sendEffort(f.api, at, 'helper', 'high');
    await expect.poll(() => heldAttempts(lock).length).toBe(1);
    // The list already shows high (set elsewhere) while this PATCH is out: no proof, the hold stays.
    f.list.effort = 'high';
    expect((await checkEffort(f.api, at, 'helper', heldOf(lock))).state).toBe('not_confirmed');
    expect(heldAttempts(lock)).toHaveLength(1);
    f.list.effort = '';
    f.answer(lost);
    expect(await send).toEqual({ state: 'not_confirmed' });
    await expect.poll(() => heldAttempts(lock)[0]?.inFlight).toBe(false);
    f.list.effort = 'high';
    expect((await checkEffort(f.api, at, 'helper', heldOf(lock))).state).toBe('saved');
    expect(heldAttempts(lock)).toEqual([]);
    expect(f.patches()).toBe(1);
  });

  it('a held removal is proved only by an absent or empty effort, never by a malformed one', async () => {
    boot({ realm: R1 });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const lock = effortLock(at, 'helper')!;
    const f = fakeApi();
    f.list.effort = 'high';
    const send = sendEffort(f.api, at, 'helper', '');
    await expect.poll(() => f.patches()).toBe(1);
    f.answer(lost);
    expect(await send).toEqual({ state: 'not_confirmed' });
    for (const bad of [5, null, { level: '' }]) {
      f.list.effort = bad;
      expect((await checkEffort(f.api, at, 'helper', heldOf(lock))).state, JSON.stringify(bad)).toBe('not_confirmed');
      expect(heldAttempts(lock)).toHaveLength(1);
    }
    // An empty string proves it (the absent field is proved in Effort.test.tsx, whose list omits an unset effort).
    f.list.effort = '';
    expect((await checkEffort(f.api, at, 'helper', heldOf(lock))).state).toBe('saved');
    expect(heldAttempts(lock)).toEqual([]);
    expect(f.patches()).toBe(1);
  });

  it('a 400 refusal lets the hold go (nothing was written)', async () => {
    boot({ realm: R1 });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    const send = sendEffort(f.api, at, 'helper', 'xhigh');
    await expect.poll(() => f.patches()).toBe(1);
    f.answer(refused);
    expect((await send).state).toBe('failed');
    expect(heldAttempts(effortLock(at, 'helper')!)).toEqual([]);
  });

  it('a second change of the same agent is refused while one is held (nothing sent)', async () => {
    boot({ realm: R1 });
    const at: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const f = fakeApi();
    void sendEffort(f.api, at, 'helper', 'low');
    await expect.poll(() => f.patches()).toBe(1);
    expect(await sendEffort(f.api, at, 'helper', 'max')).toEqual({ state: 'held' });
    expect(f.patches()).toBe(1);
  });

  it('two projects sharing a container id hold apart', async () => {
    boot({ realm: R1 });
    const p1: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
    const p2: ModelAt = { project: 'p2', computer: 'c1', realm: R1 };
    expect(effortLock(p1, 'helper')).not.toBe(effortLock(p2, 'helper'));
    const f1 = fakeApi();
    void sendEffort(f1.api, p1, 'helper', 'low');
    await expect.poll(() => heldAttempts(effortLock(p1, 'helper')!).length).toBe(1);
    expect(heldAttempts(effortLock(p2, 'helper')!)).toEqual([]);
    const f2 = fakeApi();
    const send2 = sendEffort(f2.api, p2, 'helper', 'max');
    await expect.poll(() => f2.patches()).toBe(1);
    f2.list.effort = 'max';
    f2.answer({ ok: true, body: {} });
    expect((await send2).state).toBe('saved');
    expect(heldAttempts(effortLock(p1, 'helper')!)).toHaveLength(1);
  });

  it('a project id that cannot be named in a lock sends nothing', async () => {
    boot({ realm: R1 });
    const f = fakeApi();
    expect(await sendEffort(f.api, { project: 'p 1', computer: 'c1', realm: R1 }, 'helper', 'low')).toEqual({ state: 'not_held' });
    expect(f.patches()).toBe(0);
  });
});
