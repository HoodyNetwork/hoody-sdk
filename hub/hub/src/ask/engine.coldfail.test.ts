// A chat opened cold (no record of its turns on this browser, e.g. a seeded or another browser's chat pinned by its id) shows
// its last turn's failure only when the agent proves it: the agent's turn list names the same failed turn as the newest both
// before and after the transcript read (no other turn admitted around it), and the transcript ends with the agent's close
// marker for that code. Anything less claims nothing (C9): no failed line, no "done".
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { scripts } from './fake';
import * as C from './conv';
import { world, type World } from './accept/env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

async function openOld(patch?: (w: World) => void) {
  w = world({ pace: 260, seed: scripts.seed });
  patch?.(w);
  const eng = w.pinned('s-old');
  eng.open();
  await w.flush(3000);
  return C.blocks(eng.getSnapshot().conv, 0) as any[];
}
const failedLines = (bs: any[]) => bs.filter((b) => b.k === 'outcome' && b.state === 'failed');

describe('cold open of a chat whose last turn failed', () => {
  it('the agent proves the failure: the kit failed line with its code, the marker text never shown as reply', async () => {
    const bs = await openOld();
    const f = failedLines(bs);
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe('context_overflow');
    // The failure belongs to the last turn: it follows the last prompt.
    const lastUser = bs.map((b) => b.k).lastIndexOf('user');
    expect(bs.indexOf(f[0])).toBeGreaterThan(lastUser);
    expect(JSON.stringify(bs.filter((b) => b.k === 'reply'))).not.toContain('[response failed');
    // Nothing is sent by opening.
    expect(w!.agent.log.filter((x) => x[0] === 'turn' || x[0] === 'command')).toHaveLength(0);
  });

  it('the turn list cannot be read: no failed line (unknown is never failed)', async () => {
    const bs = await openOld((w) => { (w.agent as any).turns = () => Promise.reject({ status: 503 }); });
    expect(failedLines(bs)).toHaveLength(0);
    expect(bs.filter((b) => b.k === 'user')).toHaveLength(2);
  });

  it('the two turn-list reads disagree (another turn was admitted around the transcript read): no failed line', async () => {
    let n = 0;
    const bs = await openOld((w) => {
      const real = w.agent.turns.bind(w.agent);
      (w.agent as any).turns = (sid: string) => real(sid).then((b: any) => (++n === 1 ? b : { ...b, turns: [{ turn_id: 'tNEWER', state: 'dispatched' }, ...b.turns] }));
    });
    expect(n).toBeGreaterThanOrEqual(2);
    expect(failedLines(bs)).toHaveLength(0);
  });

  it('the agent says the newest turn completed: a close marker in the transcript is not taken as a failure', async () => {
    const bs = await openOld((w) => {
      const real = w.agent.turns.bind(w.agent);
      (w.agent as any).turns = (sid: string) => real(sid).then((b: any) => ({ ...b, turns: b.turns.map((t: any, i: number) => (i === 0 ? { turn_id: t.turn_id, state: 'completed' } : t)) }));
    });
    expect(failedLines(bs)).toHaveLength(0);
  });

  it('the agent names another code than the marker: no failed line', async () => {
    const bs = await openOld((w) => {
      const real = w.agent.turns.bind(w.agent);
      (w.agent as any).turns = (sid: string) => real(sid).then((b: any) => ({ ...b, turns: b.turns.map((t: any, i: number) => (i === 0 ? { ...t, error_code: 'provider_error' } : t)) }));
    });
    expect(failedLines(bs)).toHaveLength(0);
    expect(bs.filter((b) => b.k === 'unsure')).toHaveLength(1);
  });

  // The turn list names no code for its newest failed turn, and the transcript ends with an older turn's marker (a trim left it
  // last): an empty code proves no marker is that turn's, so the last turn reads "Couldn't tell", never failed with the old code.
  for (const [name, entry] of [['missing', (t: any) => ({ turn_id: t.turn_id, state: 'failed' })], ['empty', (t: any) => ({ ...t, error_code: '' })]] as const) {
    it(`the agent names no code (${name}) for its newest failed turn: the marker is not attributed to it`, async () => {
      const bs = await openOld((w) => {
        const real = w.agent.turns.bind(w.agent);
        (w.agent as any).turns = (sid: string) => real(sid).then((b: any) => ({ ...b, turns: b.turns.map((t: any, i: number) => (i === 0 ? entry(t) : t)) }));
      });
      expect(failedLines(bs)).toHaveLength(0);
      expect(bs.filter((b) => b.k === 'unsure')).toHaveLength(1);
      expect(w!.agent.log.filter((x) => x[0] === 'turn' || x[0] === 'command')).toHaveLength(0);
    });
  }

  it('Check again on the unsure turn reads the turn list and the transcript again and sends nothing', async () => {
    let lists = 0;
    let eng: ReturnType<World['pinned']> | null = null;
    await openOld((w) => {
      const real = w.agent.turns.bind(w.agent);
      (w.agent as any).turns = (sid: string) => { lists++; return real(sid).then((b: any) => ({ ...b, turns: b.turns.map((t: any, i: number) => (i === 0 ? { turn_id: t.turn_id, state: 'failed' } : t)) })); };
      const pin = w.pinned.bind(w);
      (w as any).pinned = (sid: string) => (eng = pin(sid));
    });
    const before = lists;
    eng!.checkOutcome();
    await w!.flush(3000);
    expect(lists).toBe(before + 2);
    expect(w!.agent.log.filter((x) => x[0] === 'turn' || x[0] === 'command')).toHaveLength(0);
    expect((C.blocks(eng!.getSnapshot().conv, 0) as any[]).filter((b) => b.k === 'unsure')).toHaveLength(1);
  });
});
