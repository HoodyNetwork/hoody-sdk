// Vitest (real core): the hold a READ_BACK_FIRST answer carries is the refused press's own: looked up
// under the computer and realm of the press, never those shown once the run comes back. A script's lock key is its
// path only (the computer is in core's scope), so a lookup after a switch would name another computer's send.
import { answers, bootFixtureCore, fixtureWorld, reply } from '@core';
import { bump, setRealm, setTarget, type Target } from '@core/ctx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { realmNow } from './data';
import { liveAct, liveHold, liveSettle } from './live-act';
import type { SchedRow } from './logic';
import { routes } from './routes';

// Two fixture computers (a kit URL needs a real server) and two realms the first one is in.
const world = (i: number) => {
  const c = fixtureWorld.computers[i];
  if (!c) throw new Error('fixture computer missing');
  return c;
};
const comp = (i: number): Target => ({ project: { id: world(i).project_id }, container: { id: world(i).id, server_name: world(i).server_name } });
const A = comp(0);
const B = comp(1);
const script = (computer: string): SchedRow => ({ src: 'exec', key: 'exec:/srv/backup.sh', ref: { path: '/srv/backup.sh', computer } }) as unknown as SchedRow;
const loop = (computer: string): SchedRow => ({ src: 'loop', key: 'loop:l1', ref: { sid: 'sess_01', loop: 'loop_1a2b3c4d', computer } }) as unknown as SchedRow;

beforeEach(() => {
  bootFixtureCore({ rules: ['execTrigger', 'loopDelete'].map((n) => reply(routes[n as 'execTrigger'], answers.lost())) });
});
afterEach(() => { setTarget(null); setRealm('all'); bump('switch'); });

describe('a READ_BACK_FIRST answer names the refused press\'s own held send', () => {
  it('a computer switch while the run awaits does not attach the other computer\'s hold', async () => {
    setTarget(B);
    const onB = await liveAct('exec.run', script(B.container.id));
    expect(onB, JSON.stringify(onB)).toMatchObject({ outcome: "pending" });
    setTarget(A);
    const onA = await liveAct('exec.run', script(A.container.id));
    expect(onA.outcome).toBe('pending');
    expect(onA.hold).not.toBe(onB.hold);
    // A fresh press on A; the person switches to B before it comes back.
    const pressed = liveAct('exec.run', script(A.container.id));
    setTarget(B);
    const refused = await pressed;
    expect(refused).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: onA.hold });
    // Back on A, the warned Dismiss frees A's send only: B's stays held.
    setTarget(A);
    await liveSettle('exec.run', script(A.container.id), undefined, refused.hold);
    setTarget(B);
    expect(await liveAct('exec.run', script(B.container.id))).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', hold: onB.hold });
    setTarget(A);
    expect((await liveAct('exec.run', script(A.container.id))).outcome).toBe('pending');
  });

  it('the realm a loop op records (realmNow) is the realm its lock is held in', async () => {
    const R1 = world(0).realm_ids[0] as string;
    const R2 = fixtureWorld.realms.map((r) => r.id).find((id) => id !== R1) as string;
    setTarget(A);
    setRealm(R1); bump('switch');
    const sentIn = realmNow();
    const r = await liveAct('loop.del', loop(A.container.id));
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'pending' });
    expect(sentIn).toBe(R1);
    expect(await liveHold('loop.del', loop(A.container.id))).toBe(r.hold);
    setRealm(R2); bump('switch');
    expect(realmNow()).not.toBe(sentIn);
    expect(await liveHold('loop.del', loop(A.container.id))).toBeUndefined();
  });
});
