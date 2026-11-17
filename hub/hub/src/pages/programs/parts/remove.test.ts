// Remove a program (parts/remove.ts) against the daemon's real answers (those of
// its program removal): each answer's meaning, one send per confirm, and a lost answer held until a fresh list proves it.
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, programRoutes, queryClient, reply, type FixtureRule, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { checkRemove, dismissRemoveAttempt, refusalOf, removeHolds, removeRoute, removeStore, runRemove } from './remove';

type Answer = { status: number; body: unknown };
const prog = (id: number, name: string, kit = false) => ({ id, name, status: 'stopped', states_known: true, hoody_kit: kit, instances: [] });
interface World { listed: number[]; sends: string[]; reads: number; answer: (id: string) => Answer; overview?: () => Answer }
function boot(w: World): Target {
  const rules: FixtureRule[] = [
    reply(programRoutes.overview, () => {
      w.reads++;
      return w.overview ? w.overview() : answers.ok({ programs: w.listed.map((id) => prog(id, `p${id}`)), features: [] });
    }),
    reply(removeRoute, (req) => {
      const id = /\/programs\/remove\/([^/?]+)/.exec(req.path)?.[1] ?? '';
      w.sends.push(id);
      return w.answer(id);
    }),
  ];
  bootFixtureCore({ rules });
  queryClient.clear();
  return snapshot().target as Target;
}
const ok = (id: string): Answer => ({ status: 200, body: { success: true, id: Number(id) } });
const K = 'part|prog:7';

beforeEach(() => {
  resetChanges();
  removeStore.reset();
});

describe('what a refusal means (the daemon\'s fixed sentences, on this id)', () => {
  it.each([
    [400, 'Program with ID 7 not found', 'already'],
    [400, 'Program with ID 77 not found', 'refused'],
    [400, 'program 7 was removed but its configuration was NOT removed (see daemon log); it is swept at the next daemon start', 'leftover'],
    [400, 'program 7 was removed but its configuration was NOT removed (see daemon log), and another row still holds id 7', 'leftover'],
    [400, 'program 71 was removed but its configuration was NOT removed (see daemon log)', 'refused'],
    [400, 'Failed to remove program with ID 7', 'refused'],
    [400, 'program 7 was removed, but the reload failed', 'unclear'],
    [400, 'program 71 was removed, but the reload failed', 'refused'],
    [400, null, 'unclear'],
    [400, '  ', 'unclear'],
    [403, 'Program with ID 7 not found', 'refused'],
    [404, null, 'refused'],
    [undefined, null, 'refused'],
  ] as const)('%s %j is %s', (status, raw, want) => {
    expect(refusalOf(status, raw, '7')).toBe(want);
  });
});

describe('one confirmed removal', () => {
  it('a 2xx is said only after a fresh list no longer has the program', async () => {
    const w: World = { listed: [7, 8], sends: [], reads: 0, answer: (id) => { w.listed = w.listed.filter((x) => String(x) !== id); return ok(id); } };
    const target = boot(w);
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBe('removed');
    expect(w.sends).toEqual(['7']);
    expect(w.reads).toBe(1);
    expect(removeStore.get(K)).toBeUndefined();
  });

  it('a 2xx the list does not show yet stays "accepted, not shown yet" with Check again; nothing is sent again', async () => {
    const w: World = { listed: [7], sends: [], reads: 0, answer: ok };
    const target = boot(w);
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBeUndefined();
    expect(removeStore.get(K)).toMatchObject({ status: 'unknown', accepted: true, stuck: true });
    expect(removeStore.get(K)?.hold).toBeUndefined();
    // A second confirm while it is unknown sends nothing.
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBeUndefined();
    w.listed = [];
    expect(await checkRemove(K, removeStore.get(K))).toBe(true);
    expect(w.sends).toEqual(['7']);
    expect(removeStore.get(K)).toBeUndefined();
  });

  it('a lost answer (5xx) is held, never failed: Check again reads only, and frees it once the list has dropped it', async () => {
    const w: World = { listed: [7], sends: [], reads: 0, answer: () => ({ status: 500, body: { success: false, error: 'PERSIST: failed to save the program list: No space left on device' } }) };
    const target = boot(w);
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBeUndefined();
    const held = removeStore.get(K);
    expect(held).toMatchObject({ status: 'unknown', stuck: true });
    expect(held?.hold).toEqual(expect.any(String));
    expect(held?.accepted).toBeUndefined();
    expect(removeHolds(target)).toEqual([{ id: '7', name: 'p7', hold: held?.hold, own: true }]);
    // Still listed: a check proves nothing and frees nothing.
    expect(await checkRemove(K, removeStore.get(K))).toBe(false);
    expect(removeHolds(target)).toHaveLength(1);
    // A new confirm of the same program is refused by core unsent, and shows the same hold (never "not sent").
    removeStore.reset();
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBeUndefined();
    expect(removeStore.get(K)).toMatchObject({ status: 'unknown', hold: held?.hold });
    w.listed = [];
    expect(await checkRemove(K, removeStore.get(K))).toBe(true);
    expect(removeHolds(target)).toEqual([]);
    expect(w.sends).toEqual(['7']);
  });

  it('an overview that is not the daemon\'s list proves nothing', async () => {
    const w: World = { listed: [7], sends: [], reads: 0, answer: () => ({ status: 502, body: { error: 'BAD_GATEWAY' } }), overview: () => ({ status: 200, body: { features: [] } }) };
    const target = boot(w);
    await runRemove(K, { id: '7', name: 'p7', target });
    expect(removeStore.get(K)).toMatchObject({ status: 'unknown', stuck: true });
    expect(removeHolds(target)).toHaveLength(1);
    w.overview = () => ({ status: 500, body: {} });
    expect(await checkRemove(K, removeStore.get(K))).toBe(false);
    expect(removeHolds(target)).toHaveLength(1);
  });

  it('a warned Dismiss frees exactly the shown hold; the note of a newer send stays', async () => {
    const w: World = { listed: [7], sends: [], reads: 0, answer: () => ({ status: 502, body: { error: 'BAD_GATEWAY' } }) };
    const target = boot(w);
    await runRemove(K, { id: '7', name: 'p7', target });
    const shown = removeStore.get(K);
    if (!shown) throw new Error('no attempt');
    expect(await dismissRemoveAttempt(K, { ...shown, hold: 'not-that-send' })).toBe(false);
    expect(removeHolds(target)).toHaveLength(1);
    expect(await dismissRemoveAttempt(K, shown)).toBe(true);
    expect(removeHolds(target)).toEqual([]);
    expect(removeStore.get(K)).toBeUndefined();
  });

  it('"not found" says it was already gone; the leftover sentence says removed with a note; neither is a refusal', async () => {
    const w: World = { listed: [], sends: [], reads: 0, answer: () => ({ status: 400, body: { success: false, error: 'Program with ID 7 not found' } }) };
    const target = boot(w);
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBe('already');
    w.answer = () => ({ status: 400, body: { success: false, error: 'program 7 was removed but its configuration was NOT removed (see daemon log); it is swept at the next daemon start' } });
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBe('leftover');
    expect(removeStore.get(K)).toBeUndefined();
    expect(removeHolds(target)).toEqual([]);
  });

  it('any other 400 is refused: nothing held, the rejection kept for the details', async () => {
    const w: World = { listed: [7], sends: [], reads: 0, answer: () => ({ status: 400, body: { success: false, error: 'Failed to remove program with ID 7' } }) };
    const target = boot(w);
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBeUndefined();
    expect(removeStore.get(K)).toMatchObject({ status: 'refused' });
    expect(removeStore.get(K)?.error?.status).toBe(400);
    expect(removeHolds(target)).toEqual([]);
    expect(w.reads).toBe(0);
  });

  it('a 400 with no text may have removed it: unknown, read back, never refused', async () => {
    const w: World = { listed: [7], sends: [], reads: 0, answer: () => ({ status: 400, body: {} }) };
    const target = boot(w);
    expect(await runRemove(K, { id: '7', name: 'p7', target })).toBeUndefined();
    expect(removeStore.get(K)).toMatchObject({ status: 'unknown', stuck: true });
    expect(w.reads).toBe(1);
  });
});
