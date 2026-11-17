// Starting a workflow run from the Hub (money may be spent). A start opens a new chat and spends; the agent does not
// deduplicate it (an Idempotency-Key is refused), so a start whose answer was lost is NEVER sent again: Check again reads
// the run listing and only offers runs that may be it, never claimed by itself. A spending-limit refusal is named.
import { describe, expect, it } from 'vitest';
import type { Param } from './logic';
import type { Run } from './runs';
import { RUN_SKEW_MS, createRunStore, runBodyOf, runCandidates, runStartRoutes, workflowRunApi, type ListSettled, type RunApi, type StartSettled } from './runApi';

const P = (name: string, required = false, dflt: string | null = null): Param => ({ name, required, default: dflt });

describe('runBodyOf: the start body from the declared params and the prompt', () => {
  it('sends each declared param as typed, and the prompt only when it has text', () => {
    expect(runBodyOf([P('repo', true), P('branch', false, 'main')], { repo: 'shop', branch: 'dev' }, '')).toEqual({ body: { inputs: { repo: 'shop', branch: 'dev' } } });
    expect(runBodyOf([], {}, '  Check CI  ')).toEqual({ body: { inputs: {}, prompt: '  Check CI  ' } });
    expect(runBodyOf([], {}, '   ')).toEqual({ body: { inputs: {} } });
  });
  it('a required param left empty is the problem, named; nothing is built', () => {
    expect(runBodyOf([P('repo', true), P('tag', true)], { repo: 'shop', tag: '  ' }, '')).toEqual({ problem: 'tag' });
    expect(runBodyOf([P('repo', true)], {}, '')).toEqual({ problem: 'repo' });
  });
  it('inputs named like inherited properties are sent as typed, and an empty one is not read from the prototype', () => {
    const r = runBodyOf([P('__proto__', true), P('constructor'), P('toString')], { ['__proto__']: 'x', constructor: 'y' }, '');
    expect(JSON.parse(JSON.stringify(r))).toEqual(JSON.parse('{"body":{"inputs":{"__proto__":"x","constructor":"y"}}}'));
    expect(Object.hasOwn((r as { body: { inputs: object } }).body.inputs, '__proto__')).toBe(true);
    expect(runBodyOf([P('constructor', true)], {}, '')).toEqual({ problem: 'constructor' });
  });
  it('an optional param left empty is not sent (the agent then uses its default); undeclared values are never sent', () => {
    expect(runBodyOf([P('branch', false, 'main')], { branch: '', extra: 'x' }, '')).toEqual({ body: { inputs: {} } });
  });
});

const run = (o: Partial<Run>): Run => ({
  id: 'r1', workflow: 'deploy', sid: 's1', realm: 'global', state: 'running', step: null, startedAt: 1_000_000,
  finishedAt: null, cost: null, error: null, lastStep: null, resumedFrom: null, cwd: null, ...o,
});

describe('runCandidates: the runs a lost start may have made', () => {
  const sent = 1_000_000;
  it('the same workflow in the same realm, started since the send (less the skew), newest first', () => {
    const rows = [
      run({ id: 'a', startedAt: sent + 5_000 }),
      run({ id: 'b', startedAt: sent + 60_000 }),
      run({ id: 'c', startedAt: sent - RUN_SKEW_MS - 1 }),
      run({ id: 'd', workflow: 'other', startedAt: sent + 1 }),
      run({ id: 'e', realm: 'aaaaaaaaaaaaaaaaaaaaaaaa', startedAt: sent + 1 }),
      run({ id: 'f', startedAt: sent - RUN_SKEW_MS + 1 }),
    ];
    expect(runCandidates(rows, 'deploy', 'global', sent).map((r) => r.id)).toEqual(['b', 'a', 'f']);
  });
});

describe('the start route', () => {
  it('is the agent runWorkflow route, sending only inputs and prompt, and declares spend_cap as a refusal', () => {
    expect(runStartRoutes.start).toMatchObject({ method: 'POST', path: '/workflows/:name/runs' });
    expect(runStartRoutes.start.body).toEqual(['inputs', 'prompt']);
    expect(runStartRoutes.start.refuses).toEqual(expect.arrayContaining(['spend_cap']));
  });
});

function fake(o: { start?: StartSettled[]; list?: ListSettled[] } = {}) {
  const sent: Array<{ op: string; arg?: unknown }> = [];
  const starts = [...(o.start ?? [])];
  const lists = [...(o.list ?? [])];
  const api: RunApi = {
    start: async (body) => (sent.push({ op: 'start', arg: body }), starts.shift() ?? { ok: true, body: { session_id: 's9', run_id: 'r9', job_id: 'j9' } }),
    list: async () => (sent.push({ op: 'list' }), lists.shift() ?? { ok: true, runs: [], skipped: 0 }),
  };
  return { api, sent, starts: () => sent.filter((x) => x.op === 'start') };
}
const lost: StartSettled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };

describe('the start store', () => {
  const body = { inputs: { repo: 'shop' } };
  it('a 202 is Started, with its chat and run', async () => {
    const f = fake();
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global', now: () => 1_000_000 });
    await s.start(body);
    expect(s.view()).toMatchObject({ phase: 'done', sessionId: 's9', runId: 'r9' });
    expect(f.starts()).toHaveLength(1);
  });
  it('a 202 without a session id is not claimed: it may have started, and is checked like a lost answer', async () => {
    const f = fake({ start: [{ ok: true, body: { job_id: 'j9' } }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global', now: () => 1_000_000 });
    await s.start(body);
    expect(s.view()).toMatchObject({ phase: 'unsure', why: 'unread' });
  });
  it('says why it is unsure: no answer, or an error answer that does not say', async () => {
    const cases: Array<[StartSettled, string]> = [
      [lost, 'lost'],
      [{ ok: false, err: { kind: 'failed', code: '', status: 0 } }, 'lost'],
      [{ ok: false, err: { kind: 'failed', code: 'admission_unconfirmed', status: 503 } }, 'error'],
      [{ ok: false, err: { kind: 'failed', code: '', status: 502 } }, 'error'],
    ];
    for (const [answer, why] of cases) {
      const s = createRunStore({ api: fake({ start: [answer] }).api, workflow: 'deploy', realm: 'global' });
      await s.start(body);
      expect(s.view()).toMatchObject({ phase: 'unsure', why });
    }
  });
  it('a check reports the listed rows it could not read (one may be the run)', async () => {
    const f = fake({ start: [lost], list: [{ ok: true, runs: [], skipped: 2 }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    await s.start(body);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'read', candidates: [], skipped: 2 });
  });
  it('a spending-limit refusal is a refusal named as one; nothing started', async () => {
    const f = fake({ start: [{ ok: false, err: { kind: 'failed', code: 'spend_cap', status: 409 } }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    await s.start(body);
    expect(s.view()).toMatchObject({ phase: 'refused', spendCap: true });
  });
  it('an unconfirmed admission, a server error or no answer may have started a run: unsure, never refused', async () => {
    for (const err of [{ kind: 'failed', code: 'admission_unconfirmed', status: 503 }, { kind: 'failed', code: '', status: 502 }, { kind: 'failed', code: '', status: 0 }] as const) {
      const f = fake({ start: [{ ok: false, err }] });
      const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
      await s.start(body);
      expect(s.view().phase).toBe('unsure');
    }
  });
  it('a call core never sent is not a start: a new one may be sent', async () => {
    const f = fake({ start: [{ ok: false, err: { kind: 'not_sent', code: '', status: 0 } }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    await s.start(body);
    expect(s.view()).toMatchObject({ phase: 'refused', spendCap: false, notSent: true });
    await s.start(body);
    expect(f.starts()).toHaveLength(2);
  });
  it('another refusal is a refusal, not a spending limit', async () => {
    const f = fake({ start: [{ ok: false, err: { kind: 'failed', code: 'not_found', status: 404 } }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    await s.start(body);
    expect(s.view()).toMatchObject({ phase: 'refused', spendCap: false });
  });
  it('a lost answer is never sent again: start is refused while unsure, Check again only reads and offers look-alikes', async () => {
    const f = fake({ start: [lost], list: [{ ok: true, runs: [run({ id: 'x', startedAt: 1_000_500 }), run({ id: 'old', startedAt: 1 })], skipped: 0 }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global', now: () => 1_000_000 });
    await s.start(body);
    expect(s.view().phase).toBe('unsure');
    await s.start(body);
    expect(f.starts()).toHaveLength(1);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'read' });
    const v = s.view();
    expect(v.phase === 'unsure' ? v.candidates.map((r) => r.id) : null).toEqual(['x']);
    expect(f.starts()).toHaveLength(1);
  });
  it('a check that cannot read says so and offers nothing', async () => {
    const f = fake({ start: [lost], list: [{ ok: false }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    await s.start(body);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'failed', candidates: [] });
  });
  it('picking a look-alike says it is the person\'s choice; it stays unclaimed by the store itself', async () => {
    const f = fake({ start: [lost], list: [{ ok: true, runs: [run({ id: 'x', sid: 'sx', startedAt: 1_000_500 })], skipped: 0 }] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global', now: () => 1_000_000 });
    await s.start(body);
    await s.check();
    s.pick('nope');
    expect(s.view().phase).toBe('unsure');
    s.pick('x');
    expect(s.view()).toMatchObject({ phase: 'done', picked: true, runId: 'x', sessionId: 'sx' });
  });
  it('Stop tracking forgets the unknown start; nothing is sent, and a new start is then allowed', async () => {
    const f = fake({ start: [lost] });
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    await s.start(body);
    s.forget();
    expect(s.view().phase).toBe('idle');
    await s.start(body);
    expect(f.starts()).toHaveLength(2);
  });
  it('a refused or done start can be cleared; while one is out nothing else is sent', async () => {
    let release: (v: StartSettled) => void = () => undefined;
    const f = fake();
    f.api.start = (b) => (f.sent.push({ op: 'start', arg: b }), new Promise<StartSettled>((r) => { release = r; }));
    const s = createRunStore({ api: f.api, workflow: 'deploy', realm: 'global' });
    const p = s.start(body);
    await s.start(body);
    expect(f.starts()).toHaveLength(1);
    release({ ok: true, body: { session_id: 's1', run_id: null } });
    await p;
    expect(s.view()).toMatchObject({ phase: 'done', sessionId: 's1', runId: null });
    s.clear();
    expect(s.view().phase).toBe('idle');
  });
});

describe('workflowRunApi: calls only in the context the start belongs to', () => {
  it("with no context (the page no longer shows the start’s place) it sends nothing and reads nothing", async () => {
    const a = workflowRunApi('deploy', 'global');
    expect(await a.start({ inputs: {} }, null)).toEqual({ ok: false, err: { kind: 'not_sent', code: '', status: 0 } });
    expect(await a.list(null)).toEqual({ ok: false });
  });
});
