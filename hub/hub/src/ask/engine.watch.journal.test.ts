// A Strict chat waiting at a gate holds the page's approver lease (the handle told
// Strict) through every degradation of its observation: a refused stream (budget), `state`, and a quiet-looking `off`. None of
// them tells the handle not Strict or closes it; only the gate leaving does. A follow-up queued meanwhile is settled by its KEY
// through the journal's check (checkJ), with no stream and no watch call or outside wake.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';

const handle = vi.hoisted(() => ({ strict: [] as boolean[], closed: 0, opened: 0 }));
vi.mock('@kit/agent/approver-live', () => ({
  approvers: () => ({
    open: () => {
      handle.opened++;
      return { sid: null, setStrict: (s: boolean) => { handle.strict.push(s); }, mintTicket: () => null, decide: () => null, close: () => { handle.closed++; } };
    },
    state: () => ({ phase: 'held' }), subscribe: () => () => undefined, stamp: () => 0, noteEpoch: () => undefined,
  }),
  resetApproversForTests: () => undefined,
}));
import * as C from './conv';
import type { AskEngine } from './engine';
import type { Beat } from './fake';
import type { StreamHandlers } from './data';
import { world, type World } from './accept/env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; handle.strict.length = 0; handle.closed = 0; handle.opened = 0; });

const GATE: Beat[][] = [[{ k: 'text', text: 'Looking. ' }, { k: 'confirm', tool: 'edit_file', params: { path: '/home/ada/x' } }, { k: 'text', text: 'Edited the file for you.' }]];

/** A Strict chat (approval `always`) whose first turn is parked at its gate, on a journal-backed dock engine. */
async function strictAtGate() {
  w = world({ script: GATE, approvalMode: 'always' });
  // Every stream the engine asks for; `refuse` answers the next ones as the budget does (no slot).
  let refuse = false;
  const real = w.agent.stream.bind(w.agent);
  (w.agent as any).stream = (id: string, cursor: any, realm: string, h: StreamHandlers, _rank?: unknown) => {
    if (refuse) { let closed = false; queueMicrotask(() => { if (!closed) h.error('budget'); }); return { close: () => { closed = true; } }; }
    return real(id, cursor, realm, h);
  };
  const eng = await w.dock();
  eng.setAuto(false);
  await w.flush(50);
  eng.send('hello');
  await w.flush(3000);
  const log = (m: string) => w!.agent.log.filter(([x]) => x === m).length;
  return { eng, log, refuse: () => { refuse = true; } };
}
const running = (eng: AskEngine) => C.running(C.current(eng.getSnapshot().conv));
const reply = (eng: AskEngine) => JSON.stringify(eng.getSnapshot().conv.turns.at(-1));

describe('a Strict chat at a gate keeps its approver lease through the watch levels (journal-backed)', () => {
  it('budget, state, then off: the handle stays Strict and open the whole time; the gate decides and its reply is read back', async () => {
    const { eng, refuse } = await strictAtGate();
    expect(eng.getSnapshot().gates).toHaveLength(1);
    expect(eng.activation()).toMatchObject({ journal: true, strict: true });
    expect(handle.strict).toEqual([true]);
    expect(handle.opened).toBe(1);
    // The stream slot goes: the next stream the engine asks for is refused.
    refuse();
    eng.setWatch('stream', 'visible');
    eng.setWatch('state');
    await w!.flush(6_000);
    eng.setWatch('stream', 'open');
    await w!.flush(6_000);
    eng.setWatch('state');
    await w!.flush(12_000);
    eng.setWatch('off');
    await w!.flush(12_000);
    expect(eng.getSnapshot().gates, 'the gate is still parked').toHaveLength(1);
    // A gate waiting only for the person is quiet (off reads nothing for it), and its lease is held all the same.
    expect(eng.quiet()).toBe(true);
    expect(handle.strict, 'no degradation told the handle not Strict').toEqual([true]);
    expect(handle.closed, 'no degradation closed the handle').toBe(0);
    // The tile is looked at again (state, the slot still refused) and the person decides; the turn ends through the 5 s state
    // reads (no stream), its reply is read back, and the lease is given back only now that the gate has left.
    eng.setWatch('state');
    await w!.flush(100);
    expect(handle.strict).toEqual([true]);
    eng.decide('once');
    await w!.flush(12_000);
    expect(running(eng)).toBe(false);
    expect(eng.getSnapshot().gates).toHaveLength(0);
    expect(reply(eng)).toContain('Edited the file for you.');
    expect(handle.strict).toEqual([true, false]);
  });

  it('a follow-up queued while the gate waits at state or off is settled by its key through the journal (checkJ)', async () => {
    for (const level of ['state', 'off'] as const) {
      const { eng, log, refuse } = await strictAtGate();
      refuse();
      eng.setWatch(level);
      await w!.flush(6_000);
      const checkJ = vi.spyOn(eng as any, 'checkJ');
      eng.send('also add a test');
      await w!.flush(500);
      const row = () => Object.values(eng.getSnapshot().conv.users).find((u) => u.text === 'also add a test');
      expect(row()?.state, level).toBe('queued');
      // The approval is answered elsewhere (the message itself never declines it), so the turn goes on and reads the message.
      w!.agent.declineGates();
      // No stream, no watch call, no outside wake: the engine's own 5 s reads settle it.
      await w!.flush(15_000);
      expect(checkJ.mock.calls.length, level).toBeGreaterThan(0);
      expect(row()?.state, level).toBe('sent');
      expect(log('command'), `${level}: never sent a second time`).toBeLessThanOrEqual(1);
      expect(handle.closed, level).toBe(0);
      w!.dispose(); w = null; handle.strict.length = 0; handle.closed = 0; handle.opened = 0;
    }
  });
});
