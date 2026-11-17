// A Check holds the fork's target lock T while it reads the key under it. When another tab's
// read hands the record to its session between the Check's first lookup and taking T, the Check finds the record moved; it must not then
// try T again (the lock it holds itself) and answer busy: no press can hold T while this Check does, so the made fork opens.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as Fk from '../fork';
import { installTryLocks } from './try-locks';
import { ACCOUNT, HANDLE, JOURNAL, REALM, world, type World } from './env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { vi.restoreAllMocks(); w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const flush = (n = 900) => w!.flush(n);
const agent = (): any => w!.agent as any;
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const seedDoc = (d: Record<string, any>) => { const all = JSON.parse(w!.fs.peek(JOURNAL)!); all.a[ACCOUNT] = d; w!.fs.seed(JOURNAL, JSON.stringify(all)); };
const spec = (bounds: readonly number[], turn: number): Fk.ForkSpec => ({ turn, pin: bounds[turn] as number });

async function parentChat() {
  w = world();
  const a = await w.dock();
  a.send('first');
  await flush(1500);
  const p = w.pinned(a.record!.s!);
  p.open();
  await flush(900);
  p.send('turn 2');
  await flush(1500);
  return { p, bounds: (await p.turnPins())! };
}

describe('a Check whose record another tab moves to its session while it takes T', () => {
  it('opens the made fork: the T it holds is its own, never "busy"', async () => {
    const { p, bounds } = await parentChat();
    agent().o.createLost = true;
    const out = (await p.fork(spec(bounds, 1))) as any;
    agent().o.createLost = false;
    expect(out).toMatchObject({ k: 'unknown', reason: 'lost' });
    const k1 = out.k1 as string;
    const sid = agent().createdByKey.get(k1) as string;
    expect(sid, 'the agent made the session').toBeTruthy();
    // The Check's second lookup is the one under T: just before it, another tab's read hands the record to its session.
    const real = w!.j.lookupK1.bind(w!.j);
    let n = 0;
    vi.spyOn(w!.j, 'lookupK1').mockImplementation((...a: Parameters<typeof real>) => {
      if (++n === 2) {
        const d = doc();
        const from = `${HANDLE}|${REALM}|create:${k1}`;
        if (d[from]) { d[`${HANDLE}|${REALM}|${sid}`] = { ...d[from], s: sid }; delete d[from]; seedDoc(d); }
      }
      return real(...a);
    });
    const chk = await p.checkFork(k1);
    expect(n, 'the move happened under T').toBeGreaterThanOrEqual(2);
    expect(chk, 'the made fork opens').toMatchObject({ k: 'opened', sid });
  });
});
