// Vitest: the fixture agent's interrupt, as the agent carries it out (its command route, kind
// interrupt: "stops the work the session was running when the interrupt was sent, then delivers the text as a new turn ...
// Its receipt says whether work was running (interrupted)"; the daemon's own wire test, whose interrupt arrives while a
// confirmation is parked). Running, gated and idle sessions; the key rules both ways.
import { describe, expect, it } from 'vitest';
import { FakeAgent, manualClock, type Beat } from './fake';
import * as L from './logic';

const REALM = 'global';
async function setup(script: Beat[][]) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: 'acct', pace: 10, script }, clock);
  const frames: string[] = [];
  const payloads: string[] = [];
  const created = (await agent.create(L.createBody(REALM, 'c1')!, 'k1', REALM)) as { session_id: string };
  const sid = created.session_id;
  agent.stream(sid, null, REALM, { open: () => undefined, frame: (name: string, data: unknown) => { frames.push(name); payloads.push(String(data)); }, error: () => undefined });
  clock.run(0);
  return { clock, agent, sid, frames, payloads };
}
const hold: Beat[] = [{ k: 'text', text: 'working' }, { k: 'hold' }];
const done: Beat[] = [{ k: 'text', text: 'switched' }];
type Receipt = { command_id: string; kind: string; state: string; how?: string; turn_id?: string; interrupted?: boolean; duplicate?: boolean };

describe('the fixture agent\'s interrupt', () => {
  it('running: the turn ends cancelled, the text starts a NEW turn, and the receipt says work was stopped', async () => {
    const { clock, agent, sid } = await setup([hold, done]);
    const t = (await agent.turn(sid, 'go', 'kt')) as { turn_id: string };
    clock.run(100);
    const r = (await agent.interrupt(sid, 'do plan B', 'ki')) as Receipt;
    expect(r).toMatchObject({ kind: 'interrupt', state: 'committed', how: 'new_turn', interrupted: true });
    expect(r.turn_id).not.toBe(t.turn_id);
    expect(await agent.receipt(sid, t.turn_id)).toMatchObject({ state: 'cancelled', effects_may_have_occurred: true });
    clock.run(100);
    expect(await agent.receipt(sid, r.turn_id as string)).toMatchObject({ state: 'completed' });
  });

  it('gated: the parked gate is released as cancelled (no decision), the cancelled step never runs, the text starts the next turn', async () => {
    const { clock, agent, sid, frames, payloads } = await setup([[{ k: 'confirm', tool: 'bash', params: { command: 'ls' } }, { k: 'text', text: 'after the gate' }], done]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    expect(await agent.state(sid)).toHaveProperty('pending_gate');
    const r = (await agent.interrupt(sid, 'forget it', 'ki')) as Receipt;
    expect(r.interrupted).toBe(true);
    expect(frames).toContain('gate_resolved');
    expect(await agent.state(sid)).not.toHaveProperty('pending_gate');
    clock.run(100);
    // The payloads, not the event names: the step the gate guarded never streamed, and the next turn's own text did (so the capture works).
    expect(payloads.some((x) => x.includes('after the gate'))).toBe(false);
    expect(payloads.some((x) => x.includes('switched'))).toBe(true);
    expect(await agent.receipt(sid, r.turn_id as string)).toMatchObject({ state: 'completed' });
  });

  it('idle: nothing was running, so it is a plain send (interrupted false) that still starts a new turn', async () => {
    const { clock, agent, sid } = await setup([done]);
    const r = (await agent.interrupt(sid, 'hello', 'ki')) as Receipt;
    expect(r).toMatchObject({ kind: 'interrupt', state: 'committed', how: 'new_turn', interrupted: false });
    clock.run(100);
    expect(await agent.receipt(sid, r.turn_id as string)).toMatchObject({ state: 'completed' });
  });

  it('a parked HELPER gate alone is work: the gate is released and the receipt says interrupted true (the daemon counts parked gates)', async () => {
    // The helper outlives the lead's turn: the lead finishes, the helper's approval is still parked, nothing is running.
    const { clock, agent, sid, frames } = await setup([[{ k: 'helper', tool: 'bash', params: { command: 'helper step' }, lifeMs: 60_000 }, { k: 'text', text: 'lead done' }], done]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    expect(agent.parked(sid)).toMatchObject({ lead: [], helpers: [expect.any(String)] });
    expect(await agent.state(sid)).not.toHaveProperty('pending_gate');
    const r = (await agent.interrupt(sid, 'forget it', 'ki')) as Receipt;
    expect(r.interrupted, 'only a helper gate was parked, and releasing it is stopping work').toBe(true);
    expect(agent.parked(sid)).toEqual({ lead: [], helpers: [] });
    expect(frames).toContain('gate_resolved');
  });

  it('the same key and text answers the stored receipt and stops nothing twice; another text, or a message, under the key is idempotency_key_reused', async () => {
    const { clock, agent, sid } = await setup([hold, done, done]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    const a = (await agent.interrupt(sid, 'do plan B', 'ki')) as Receipt;
    clock.run(100);
    const again = (await agent.interrupt(sid, 'do plan B', 'ki')) as Receipt;
    expect(again).toMatchObject({ command_id: a.command_id, turn_id: a.turn_id, interrupted: true, duplicate: true });
    await expect(agent.interrupt(sid, 'something else', 'ki')).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
    await expect(agent.command(sid, 'do plan B', 'ki')).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
    await expect(agent.interrupt(sid, 'x', 'ks-unused')).resolves.toBeTruthy();
  });

  it('a lost answer is read back by the key (its receipt), and a retire of an admitted key changes nothing', async () => {
    const { clock, agent, sid } = await setup([hold, done]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    const a = (await agent.interrupt(sid, 'do plan B', 'ki')) as Receipt;
    expect(await agent.commandByKey(sid, 'ki')).toMatchObject({ command_id: a.command_id, kind: 'interrupt', interrupted: true });
    expect(await agent.commandKeyRetire(sid, 'ki')).toMatchObject({ retired: false, admitted: 'true' });
  });

  it('a retired key admits nothing: the interrupt is refused command_key_retired', async () => {
    const { agent, sid } = await setup([done]);
    expect(await agent.commandKeyRetire(sid, 'ki')).toMatchObject({ retired: true, admitted: 'false' });
    await expect(agent.interrupt(sid, 'hello', 'ki')).rejects.toMatchObject({ status: 409, code: 'command_key_retired' });
  });
});
