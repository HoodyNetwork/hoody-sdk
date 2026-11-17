// The fixture agent's seeded chats: the AI page's fixture chats (pages/ai/parts/fixtures.chats.ts chatWorld) exist on the scripted agent
// before anything opens them, settled at once whatever the pace; a last turn may stay parked at a gate. Two more show the working row's
// words for the AI page's shots: s-compact parks while it compacts the conversation, s-think while the model works on a reply.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { FakeAgent, manualClock, scripts, type FakeOptions } from './fake';
import * as C from './conv';
import { world, type World } from './accept/env';
import { workOf } from './source';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';

function agent(o: Partial<FakeOptions> = {}) {
  return new FakeAgent({ account: ACCOUNT, pace: 260, realms: [REALM], seed: scripts.seed, ...o }, manualClock());
}

describe('FakeOptions.seed', () => {
  it('the default seed makes the AI page\'s fixture chats, by their ids, with no clock run', async () => {
    const a = agent();
    const list = await a.sessions(REALM);
    expect(list.items.map((x: any) => x.id).sort()).toEqual(['s-compact', 's-old', 's-think', 's-today', 's-wait']);
    expect(list.items.find((x: any) => x.id === 's-old')).toMatchObject({ first_message: 'Plan the backup job' });
  });
  it('s-old is at rest: two turns ended (the second failed), its transcript holds both prompts and the tools', async () => {
    const a = agent();
    const ts = (await a.turns('s-old')).turns.map((t: any) => t.state);
    expect(ts.sort()).toEqual(['completed', 'failed']);
    const st: any = await a.state('s-old');
    expect(st.current_turn_id ?? null).toBeNull();
    const tr: any = await a.transcript('s-old');
    const text = JSON.stringify(tr);
    expect(text).toContain('Plan the backup job');
    expect(text).toContain('Run it once now');
    expect(text).toContain('write_file');
    expect(text).toContain('hook_held');
  });
  it('s-today and s-wait: the last turn runs, parked at a confirm the state names', async () => {
    const a = agent();
    for (const sid of ['s-today', 's-wait']) {
      const st: any = await a.state(sid);
      expect(st.current_turn_id, sid).toBeTruthy();
      expect(JSON.stringify(st), sid).toContain('confirm');
    }
    expect((await a.turns('s-today')).turns.map((t: any) => t.state)).toContain('completed');
  });
  it('without a seed the agent starts empty, as before', async () => {
    const a = agent({ seed: undefined });
    expect((await a.sessions(REALM)).items).toEqual([]);
  });
  it('a pinned engine opens a seeded chat: s-old reads both prompts, its steps show a failure and an unknown outcome, nothing is sent', async () => {
    w = world({ pace: 260, seed: scripts.seed });
    const eng = w.pinned('s-old');
    eng.open();
    await w.flush(3000);
    const bs = C.blocks(eng.getSnapshot().conv, 0);
    expect(bs.filter((b: any) => b.k === 'user').map((b: any) => b.msg.text)).toEqual(['Plan the backup job', 'Run it once now']);
    // The second turn's steps: a failed one and one of unknown outcome (C9). The turn's own failed line (proved by the agent's turn
    // list on a cold open) is pinned in engine.coldfail.test.ts.
    const trails = bs.filter((b: any) => b.k === 'trail') as any[];
    expect(trails).toHaveLength(2);
    expect([trails[1].failed, trails[1].unknown]).toEqual([true, true]);
    expect(bs.some((b: any) => b.k === 'hooks')).toBe(true);
    expect(w.agent.log.filter((x) => x[0] === 'turn' || x[0] === 'command')).toHaveLength(0);
  });
  it('a pinned engine opens s-today: its last turn is followed, parked at the confirm', async () => {
    w = world({ pace: 260, seed: scripts.seed });
    const eng = w.pinned('s-today');
    eng.open();
    await w.flush(3000);
    const snap = eng.getSnapshot();
    expect(C.running(C.current(snap.conv))).toBe(true);
    expect(JSON.stringify(snap)).toContain('npm');
  });
  it.each([['s-compact', 'compacting'], ['s-think', 'thinking']] as const)('a pinned engine opens %s: its last turn runs and the working row reads %s', async (sid, work) => {
    w = world({ pace: 260, seed: scripts.seed });
    const eng = w.pinned(sid);
    eng.open();
    await w.flush(3000);
    const snap = eng.getSnapshot();
    expect(C.running(C.current(snap.conv))).toBe(true);
    expect(workOf(snap)).toEqual({ work });
  });
});
