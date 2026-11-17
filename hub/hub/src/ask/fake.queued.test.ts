// Vitest: when the fixture agent keeps a follow-up queued behind a running turn. next() delivers the
// queued follow-ups at the turn's next step, before it takes that step's beat; a scripted hold takes no further step. So a follow-up
// sent before the turn reaches its hold is committed (how next_step), and one sent after stays queued. held(sid) says which.
import { describe, expect, it } from 'vitest';
import { FakeAgent, manualClock, scripts, type Beat } from './fake';
import * as L from './logic';

const REALM = 'global';
async function setup(script: Beat[][]) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: 'acct', pace: 10, script }, clock);
  const created = (await agent.create(L.createBody(REALM, 'c1')!, 'k1', REALM)) as { session_id: string };
  const sid = created.session_id;
  agent.stream(sid, null, REALM, { open: () => undefined, frame: () => undefined, error: () => undefined });
  clock.run(0);
  return { clock, agent, sid };
}
const script = (): Beat[][] => [[scripts.dashboard[0] as Beat, { k: 'hold' }]];
type Cmd = { command_id: string; state: string; how?: string };

describe('the fixture agent: a follow-up behind a held turn', () => {
  it('sent before the turn reaches its hold: not held yet, and the follow-up is committed at the next step', async () => {
    const { clock, agent, sid } = await setup(script());
    await agent.turn(sid, 'Build me a dashboard', 'kt');
    expect(agent.held(sid)).toBe(false);
    const c = (await agent.command(sid, 'and a chart', 'kc')) as Cmd;
    expect(c.state).toBe('queued');
    clock.run(200);
    expect(await agent.commandGet(sid, c.command_id)).toMatchObject({ state: 'committed', how: 'next_step' });
  });
  it('sent once held: the follow-up stays queued while the turn holds', async () => {
    const { clock, agent, sid } = await setup(script());
    await agent.turn(sid, 'Build me a dashboard', 'kt');
    clock.run(200);
    expect(agent.held(sid)).toBe(true);
    const c = (await agent.command(sid, 'and a chart', 'kc')) as Cmd;
    clock.run(1000);
    expect(await agent.commandGet(sid, c.command_id)).toMatchObject({ state: 'queued' });
    expect(agent.held(sid)).toBe(true);
  });
  it('no session, or no running turn, is never held', async () => {
    const { agent, sid } = await setup([[{ k: 'text', text: 'done' }]]);
    expect(agent.held('nope')).toBe(false);
    expect(agent.held(sid)).toBe(false);
  });
});
