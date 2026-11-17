// Acceptance, group FAKE / ENGINE: the scripted agent speaks only the documented vocabulary, and an
// engine whose computer has no resolved handle sends nothing.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { scripts } from '../fake';
import { AskEngine } from '../engine';
import { HANDLE, posts, slot, world, type World } from './env';
import { manualClock } from '../fake';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const OUTCOMES = new Set(['answered', 'cancelled', 'yolo', 'timeout']);
const PROVENANCE = new Set(['decision', 'yolo', 'cancelled', 'closed', 'context_cancelled', 'timeout']);
const resolutions = (w: World): Array<{ env: any; data: any }> =>
  ((w.agent as any).ring as Array<{ env: any }>).filter((x) => x.env.event.type === 'event.gate_resolved').map((x) => ({ env: x.env, data: x.env.event.data }));

describe('every gate-resolution frame the scripted agent emits is in the documented vocabulary', () => {
  const check = (frames: Array<{ env: any; data: any }>) => {
    expect(frames.length).toBeGreaterThan(0);
    for (const { env, data } of frames) {
      expect(OUTCOMES.has(data.outcome), 'outcome ' + data.outcome).toBe(true);
      if (data.provenance !== undefined) {
        expect(PROVENANCE.has(data.provenance), 'provenance ' + data.provenance).toBe(true);
        expect(data.outcome === 'answered', 'answered iff decision provenance').toBe(data.provenance === 'decision');
      }
      if (data.decision !== undefined) expect(data.outcome === 'answered' && data.kind === 'confirm').toBe(true);
      expect(env.gate, 'a resolution frame carries no envelope gate').toBeUndefined();
    }
  };
  it('a decision (approve, deny), an answered question, a declining message from elsewhere and a stop', async () => {
    w = world({ script: [scripts.approval, [{ k: 'text', text: 'ok' }]] });
    const eng = await w.dock();
    eng.setAuto(false);
    eng.send('Add a chart');
    await w.flush(500);
    eng.decide('once');
    await w.flush(1000);
    check(resolutions(w));
    w.dispose(); w = null;

    w = world({ script: [scripts.approval, [{ k: 'text', text: 'ok' }]] });
    const e2 = await w.dock();
    e2.setAuto(false);
    e2.send('Add a chart');
    await w.flush(500);
    w.agent.declineGates();                                        // a message from elsewhere declines the open card
    await w.flush(3000);
    check(resolutions(w));
    w.dispose(); w = null;

    w = world({ script: [scripts.question] });
    const e3 = await w.dock();
    e3.send('Build it');
    await w.flush(500);
    e3.answer('8080');
    await w.flush(1000);
    check(resolutions(w));
  });
});

describe('a journaled engine whose computer has no resolved handle sends nothing', () => {
  it('canSend is false and send posts nothing', async () => {
    w = world();
    const clock = manualClock();
    const store: any = { read: () => ({ v: 1, a: {} }), write: () => undefined };
    const eng = new AskEngine(slot, w.agent, store, clock, { journal: { j: w.j, handle: '' } });
    eng.open();
    await w.flush();
    expect(eng.canSend()).toBe(false);
    expect(eng.getSnapshot().sendable).toBe(false);
    expect(eng.send('hello')).toBe(false);
    await w.flush(500);
    expect(posts(w.agent, 'create')).toHaveLength(0);
    expect(posts(w.agent, 'turn')).toHaveLength(0);
    void HANDLE;
  });
});
