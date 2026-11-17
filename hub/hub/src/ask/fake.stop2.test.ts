// Vitest: the fixture agent's stop and cancel as the agent carries them out: follow-ups a
// stop superseded carry reason "stop" and superseded_by (the stop's command id) on their receipts and in one
// event.command_settled; a turn a stop or cancel ended keeps the text it had streamed in its transcript.
import { describe, expect, it } from 'vitest';
import { FakeAgent, manualClock, type Beat } from './fake';
import * as L from './logic';

const REALM = 'global';
async function setup(script: Beat[][], o: { holdQueued?: boolean } = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: 'acct', pace: 10, script, ...o }, clock);
  const frames: Array<{ name: string; data: unknown }> = [];
  const created = (await agent.create(L.createBody(REALM, 'c1')!, 'k1', REALM)) as { session_id: string };
  const sid = created.session_id;
  agent.stream(sid, null, REALM, { open: () => undefined, frame: (name: string, data: unknown) => void frames.push({ name, data }), error: () => undefined });
  clock.run(0);
  return { clock, agent, sid, frames };
}
const hold: Beat[] = [{ k: 'text', text: 'working on it' }, { k: 'hold' }];
const said = async (agent: FakeAgent, sid: string) => JSON.stringify(await agent.transcript(sid));

describe('the fixture agent\'s stop and cancel, as the agent', () => {
  it('a superseded follow-up names the stop: reason stop, superseded_by, and one event.command_settled', async () => {
    const { clock, agent, sid, frames } = await setup([hold, hold], { holdQueued: true });
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    const c = (await agent.command(sid, 'and then', 'kc')) as { command_id: string };
    const r = (await agent.stop(sid, 'ks')) as { command_id: string };
    expect(await agent.commandGet(sid, c.command_id)).toMatchObject({ state: 'superseded', reason: 'stop', superseded_by: r.command_id });
    const settled = frames.filter((f) => f.name === 'command_settled');
    expect(settled).toHaveLength(1);
    const d = settled[0]!.data;
    const env = (typeof d === 'string' ? JSON.parse(d) : d) as { event: unknown };
    expect(env.event).toEqual({ type: 'event.command_settled', data: { command_ids: [c.command_id], state: 'superseded', reason: 'stop', superseded_by: r.command_id } });
  });
  it('a stop with nothing queued sends no command_settled', async () => {
    const { clock, agent, sid, frames } = await setup([hold]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    await agent.stop(sid, 'ks');
    expect(frames.map((f) => f.name)).not.toContain('command_settled');
  });
  it('a stopped turn keeps the text it streamed in the transcript', async () => {
    const { clock, agent, sid } = await setup([hold]);
    await agent.turn(sid, 'go', 'kt');
    clock.run(100);
    await agent.stop(sid, 'ks');
    clock.run(100);
    expect(await said(agent, sid)).toContain('working on it');
  });
  it('a cancelled turn keeps the text it streamed in the transcript', async () => {
    const { clock, agent, sid } = await setup([hold]);
    const t = (await agent.turn(sid, 'go', 'kt')) as { turn_id: string };
    clock.run(100);
    await agent.cancel(sid, t.turn_id);
    clock.run(100);
    expect(await said(agent, sid)).toContain('working on it');
  });
});
