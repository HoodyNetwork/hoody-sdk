// The engine keeps the Claude Code account's usage-limit reading from event.rate_limit and
// from event.replay's rate_limit, live or read back through /replay. A reading replaces the one held only when it supersedes it
// (protocol.RateLimitSupersedes: another epoch, or a greater rev in the same one), so an older frame never puts an older reading
// back; a replay without the field says nothing; and the reading is account state, kept across a new incarnation and a lagged
// stream (nothing clears it: the chip ages each window out at its reset). It belongs to its session: another conversation
// opened in the slot starts with none.
import { describe, expect, it } from 'vitest';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import type { AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}

async function setup(o: { parked?: boolean } = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...(o.parked ? { script: [scripts.approval] } : {}) }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  // Approve automatically is On by default: off, the approval script's turn stays parked at its gate (running).
  if (o.parked) eng.setAuto(false);
  eng.send('Build me a small dashboard');
  await flush(2000);
  const sid = eng.record!.s!;
  // FakeAgent.emit is private: the daemon pushing a frame is not part of the AgentIO surface the engine sees.
  const raw = agent as unknown as { emit(sid: string, turnId: string | undefined, type: string, data: Record<string, unknown>): void };
  const emit = (type: string, data: Record<string, unknown>) => raw.emit(sid, undefined, type, data);
  return { agent, eng, flush, sid, emit, held: () => eng.getSnapshot().rateLimit };
}

/** A daemon RateLimitState: the 5-hour window at `util`, limiting. */
const state = (rev: number, epoch = 1, util = 0.5) => ({
  status: 'allowed', is_using_overage: false, overage_status: '', observed_at: 1, rev, epoch,
  windows: [{ name: 'five_hour', utilization: util, has_utilization: true, resets_at: 4_102_444_800, limiting: true }],
});
const util = (r: unknown) => (r as { windows: { utilization: number }[] } | undefined)?.windows[0]?.utilization;

describe('AskEngine usage-limit reading', () => {
  it('no frame yet: no reading on the snapshot', async () => {
    const t = await setup();
    expect(t.held()).toBeUndefined();
  });

  it('event.rate_limit installs the reading; a newer rev replaces it, an older rev of the same epoch never does', async () => {
    const t = await setup();
    t.emit('event.rate_limit', { state: state(3, 1, 0.4) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.4);
    t.emit('event.rate_limit', { state: state(5, 1, 0.8) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.8);
    t.emit('event.rate_limit', { state: state(4, 1, 0.6) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.8);
    // Another daemon lifetime always wins, whatever its rev.
    t.emit('event.rate_limit', { state: state(1, 2, 0.2) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.2);
  });

  it('an older live frame never replaces a newer replay reading', async () => {
    const t = await setup();
    t.emit('event.replay', { messages: [], rate_limit: state(7, 1, 0.92) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.92);
    t.emit('event.rate_limit', { state: state(6, 1, 0.5) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.92);
  });

  it('a replay without rate_limit, or with an unreadable one, keeps the reading (absent is never "cleared")', async () => {
    const t = await setup();
    t.emit('event.rate_limit', { state: state(2, 1, 0.75) });
    await t.flush(100);
    t.emit('event.replay', { messages: [] });
    t.emit('event.replay', { messages: [], rate_limit: { rev: 9 } });
    t.emit('event.rate_limit', { state: null });
    await t.flush(100);
    expect(util(t.held())).toBe(0.75);
  });

  it('frames the page missed while its stream was down are read back from /replay, newest kept', async () => {
    const t = await setup();
    t.agent.dropStreams(t.sid);
    t.emit('event.rate_limit', { state: state(4, 1, 0.9) });
    t.emit('event.rate_limit', { state: state(3, 1, 0.3) });
    await t.flush(5000);
    expect(util(t.held())).toBe(0.9);
  });

  it('a status check while a turn runs reads a missed reading from the /replay body (the reopened stream starts past it)', async () => {
    const t = await setup({ parked: true });
    expect(t.eng.getSnapshot().gate).toMatchObject({ kind: 'confirm' });
    t.agent.dropStreams(t.sid);
    t.emit('event.rate_limit', { state: state(4, 1, 0.88) });
    const last = (t.agent as unknown as { seq: number }).seq; // the rate_limit frame's seq (private in the fake)
    t.agent.log.length = 0;
    t.eng.checkNow();
    await t.flush(5000);
    // The stream came back past the replay's last frame (the rate_limit one), so only /replay carried the reading.
    const reopen = t.agent.log.filter((x) => x[0] === 'stream').map((x) => x[1][1] as { since: number });
    expect(reopen.length).toBe(1);
    expect(reopen[0]!.since).toBeGreaterThanOrEqual(last);
    expect(util(t.held())).toBe(0.88);
  });

  it('a replay read in one incarnation, answered after the next one’s live frame, never puts the older reading back (1b)', async () => {
    const t = await setup({ parked: true }); // a turn running: a finished one reads nothing again
    const fake = t.agent as unknown as { replay(sid: string): Promise<unknown>; inc: string; seq: number; ring: unknown[] };
    const orig = fake.replay.bind(t.agent);
    // Every /replay answer is taken when asked (that incarnation's frames) and held until released, in order.
    const releases: Array<() => void> = [];
    let held = 0;
    fake.replay = (sid: string) => {
      held++;
      const body = orig(sid);
      return new Promise((res) => { releases.push(() => res(body)); });
    };
    // A daemon restart under the open stream: incarnation B's first frame (a new rate-limit epoch) starts a resync
    // that keeps the stream, and its /replay read is held.
    fake.inc = 'inc-8'; fake.seq = 0; fake.ring = [];
    t.emit('event.rate_limit', { state: state(1, 2, 0.5) });
    await t.flush(100);
    expect(held).toBe(1);
    expect(util(t.held())).toBe(0.5);
    // Another restart before that read answers: incarnation C's reading arrives live.
    fake.inc = 'inc-9'; fake.seq = 0; fake.ring = [];
    t.emit('event.rate_limit', { state: state(1, 3, 0.7) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.7);
    // B's answer is dropped (another incarnation): its reading never comes back, however its epoch compares, and
    // not only once the read that follows it (held here) has answered.
    releases.shift()!();
    await t.flush(100);
    expect(held).toBe(2);
    expect(util(t.held())).toBe(0.7);
    for (const r of releases.splice(0)) r();
    await t.flush(5000);
    expect(util(t.held())).toBe(0.7);
  });

  it('the reading is account state: a new incarnation and a lagged stream keep it', async () => {
    const t = await setup();
    t.emit('event.rate_limit', { state: state(2, 1, 0.71) });
    await t.flush(100);
    t.agent.reattach();
    await t.flush(5000);
    expect(util(t.held())).toBe(0.71);
    t.emit('event.usage_update', { n: 1 });
    await t.flush(5000);
    expect(util(t.held())).toBe(0.71);
  });

  it('a /clear turn in the same conversation keeps it', async () => {
    const t = await setup();
    t.emit('event.rate_limit', { state: state(2, 1, 0.64) });
    await t.flush(100);
    t.eng.send('/clear');
    await t.flush(3000);
    expect(t.eng.record!.s).toBe(t.sid);
    expect(util(t.held())).toBe(0.64);
  });

  it('another conversation started in the slot shows none, and an old-session reading never lands on it', async () => {
    const t = await setup();
    t.emit('event.rate_limit', { state: state(2, 1, 0.83) });
    await t.flush(100);
    expect(util(t.held())).toBe(0.83);
    t.eng.newConversation();
    await t.flush(100);
    expect(t.held()).toBeUndefined();
    t.eng.send('A native question');
    await t.flush(2000);
    expect(t.eng.record!.s).toBeTruthy();
    expect(t.eng.record!.s).not.toBe(t.sid);
    expect(t.held()).toBeUndefined();
    t.emit('event.rate_limit', { state: state(3, 1, 0.9) });
    await t.flush(100);
    expect(t.held()).toBeUndefined();
  });
});
