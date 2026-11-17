// Vitest: the fixture agent's stop, as the agent carries it out (its command route: kind stop
// "stops all of the session's work ... and supersedes every message and interrupt sent before it that has not been
// delivered"; stopped[] is "Empty when nothing was running"). Idle, running, gated and queued sessions; the key
// rules both ways; nothing scheduled before the stop runs after it.
import { describe, expect, it } from 'vitest';
import { FakeAgent, manualClock, type Beat } from './fake';
import * as L from './logic';

const REALM = 'global';
async function setup(script: Beat[][], o: { holdQueued?: boolean; decisionLost?: boolean; decisionLag?: number } = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: 'acct', pace: 10, script, ...o }, clock);
  const frames: string[] = [];
  const created = (await agent.create(L.createBody(REALM, 'c1')!, 'k1', REALM)) as { session_id: string };
  const sid = created.session_id;
  agent.stream(sid, null, REALM, { open: () => undefined, frame: (name) => void frames.push(name), error: () => undefined });
  clock.run(0);
  return { clock, agent, sid, frames };
}
const hold: Beat[] = [{ k: 'text', text: 'working' }, { k: 'hold' }];

describe('the fixture agent\'s stop', () => {
  it('idle: a committed stop with nothing stopped', async () => {
    const { agent, sid } = await setup([hold]);
    const r = (await agent.stop(sid, 'ks')) as Record<string, unknown>;
    expect(r).toMatchObject({ kind: 'stop', state: 'committed', stopped: [] });
  });

  it('running: the turn ends cancelled (earlier steps may have run) and the session is listed as stopped', async () => {
    const { clock, agent, sid, frames } = await setup([hold]);
    const t = (await agent.turn(sid, 'go', 'kt')) as { turn_id: string };
    clock.run(100);
    expect(frames).toContain('stream_chunk');
    const r = (await agent.stop(sid, 'ks')) as Record<string, unknown>;
    expect(r.stopped).toEqual([{ kind: 'session', id: sid, outcome: 'stopped' }]);
    expect(await agent.receipt(sid, t.turn_id)).toMatchObject({ state: 'cancelled', effects_may_have_occurred: true });
    expect(frames.at(-1)).toBe('agent_done');
  });

  it('gated: the parked gate is resolved superseded, and the turn\'s later steps never run', async () => {
    const { clock, agent, sid, frames } = await setup([[{ k: 'confirm', tool: 'bash', params: { command: 'ls' } }, { k: 'text', text: 'after the gate' }]]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    expect(await agent.state(sid)).toHaveProperty('pending_gate');
    await agent.stop(sid, 'ks');
    expect(frames).toContain('gate_resolved');
    expect(await agent.state(sid)).not.toHaveProperty('pending_gate');
    const n = frames.length;
    clock.run(5000);
    expect(frames.slice(n)).toEqual([]);
    expect(frames).not.toContain('stream_chunk');
  });

  it('queued: an undelivered follow-up is superseded and never starts a turn', async () => {
    const { clock, agent, sid, frames } = await setup([hold, hold], { holdQueued: true });
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    const c = (await agent.command(sid, 'and then', 'kc')) as { command_id: string; state: string };
    expect(c.state).toBe('queued');
    await agent.stop(sid, 'ks');
    expect(await agent.commandGet(sid, c.command_id)).toMatchObject({ state: 'superseded' });
    clock.run(5000);
    expect(frames).not.toContain('command_committed');
    expect((await agent.state(sid)) as Record<string, unknown>).not.toHaveProperty('turn_since');
  });

  it('a message sent while idle and stopped before its turn starts never starts', async () => {
    const { clock, agent, sid, frames } = await setup([hold]);
    const c = (await agent.command(sid, 'go', 'km')) as { turn_id: string };
    const r = (await agent.stop(sid, 'ks')) as Record<string, unknown>;
    expect(r.stopped).toEqual([{ kind: 'session', id: sid, outcome: 'stopped' }]);
    clock.run(5000);
    expect(frames).not.toContain('command_committed');
    expect(frames).not.toContain('stream_chunk');
    expect((await agent.state(sid)) as Record<string, unknown>).not.toHaveProperty('turn_since');
    expect(await agent.receipt(sid, c.turn_id)).toMatchObject({ state: 'cancelled' });
  });

  it('a turn sent while an idle message\'s start is pending is refused in flight, as on the agent', async () => {
    const { clock, agent, sid } = await setup([hold, hold]);
    await agent.command(sid, 'go', 'km');
    await expect(agent.turn(sid, 'also', 'kt')).rejects.toMatchObject({ status: 409, code: 'turn_in_flight' });
    clock.run(100);
    expect(agent.peek(sid).running).not.toBeNull();
  });

  it('a decision whose answer was lost, overtaken by a stop, never touches a later turn\'s gate', async () => {
    const gated: Beat[] = [{ k: 'confirm', tool: 'bash', params: { command: 'ls' } }, { k: 'text', text: 'after the gate' }];
    const { clock, agent, sid, frames } = await setup([gated, gated], { decisionLost: true, decisionLag: 500 });
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    const first = ((await agent.state(sid)) as { pending_gate_ref: { id: string; generation: number } }).pending_gate_ref;
    await expect(agent.confirm(sid, { gate_id: first.id, generation: first.generation, approved: true, remember: false, request_id: 'r1' })).rejects.toMatchObject({ pending: true });
    await agent.stop(sid, 'ks');
    await agent.turn(sid, 'again', 'kt2');
    clock.run(100);
    const second = ((await agent.state(sid)) as { pending_gate_ref: { id: string } }).pending_gate_ref;
    expect(second.id).not.toBe(first.id);
    const n = frames.length;
    clock.run(2000);
    expect(frames.slice(n)).toEqual([]);
    expect(((await agent.state(sid)) as { pending_gate_ref: { id: string } }).pending_gate_ref.id).toBe(second.id);
  });

  it('keys: the same stop key answers the same receipt; a key another command used is refused both ways', async () => {
    const { clock, agent, sid } = await setup([hold]);
    const a = (await agent.stop(sid, 'ks')) as { command_id: string };
    expect(await agent.stop(sid, 'ks')).toMatchObject({ command_id: a.command_id, duplicate: true });
    await expect(agent.command(sid, 'hi', 'ks')).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    await agent.command(sid, 'hi', 'km');
    await expect(agent.stop(sid, 'km')).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
  });
});
