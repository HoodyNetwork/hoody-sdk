// Loop changes, the pure parts and the change store over a fake api: one intent per updateLoop; a timing change
// is stop + new, the new loop only after a proven delete; a lost create is checked with listLoops, never resent and never
// claimed by itself; an unknown outcome is never shown as done or refused (C9). Every change reads the chat's loops just
// before its send and sends nothing unless the loop is still listed and still offers it, as the identity the confirm
// captured (identOf). Starting a stopped loop again sends both limits as listed and is
// bound to them.
import { describe, expect, it } from 'vitest';
import {
  actionsFor, agrees, bodyOf, candidates, createChangeStore, draftOf, editRoutes, EMPTY_DRAFT, guardOf, identOf, intentBody, limitsOf, parseLoops, proofOf, SKEW_MS,
  type ChangeStore, type Draft, type Intent, type LoopsApi, type NewLoopBody, type Settled,
} from './edit';

const T = Date.parse('2026-10-29T12:00:00Z');
const ok = (body: unknown = { status: 'ok' }): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };
const refused = (status = 400, code = 'bad_request'): Settled => ({ ok: false, err: { kind: 'failed', code, status } });

type Sent = { op: string; id?: string; arg?: unknown };
type Listing = Awaited<ReturnType<LoopsApi['list']>>;
/** `list` answers the checks; `pre` the reads just before a send (default: L1 in a state offering the change). */
function fakeApi(o: { replies?: Partial<Record<'create' | 'update' | 'runNow' | 'remove', Settled[]>>; list?: Listing[]; pre?: Listing[] } = {}) {
  const sent: Sent[] = [];
  const next = (k: 'create' | 'update' | 'runNow' | 'remove') => o.replies?.[k]?.shift() ?? ok();
  const f = { s: null as ChangeStore | null };
  const api: LoopsApi = {
    list: async () => {
      const v = f.s?.view();
      if (v?.phase === 'running') {
        sent.push({ op: 'pre' });
        const resume = v.action === 'resume';
        return o.pre?.shift() ?? listed({ id: 'L1', state: resume ? 'paused' : 'running', paused: resume });
      }
      sent.push({ op: 'list' });
      return o.list?.shift() ?? { ok: false };
    },
    create: async (body) => (sent.push({ op: 'create', arg: body }), next('create')),
    update: async (id, i, g) => (sent.push({ op: 'update', id, arg: intentBody(i, g) }), next('update')),
    runNow: async (id) => (sent.push({ op: 'runNow', id }), next('runNow')),
    remove: async (id) => (sent.push({ op: 'remove', id }), next('remove')),
  };
  return { api, sent, f, writes: () => sent.filter((s) => s.op !== 'list' && s.op !== 'pre') };
}
function store(api: LoopsApi, loopId: string | null = 'L1', fake?: { s: ChangeStore | null }) {
  const s = createChangeStore({ api, loopId, now: () => T });
  if (fake) fake.s = s;
  return s;
}
const NEW: NewLoopBody = { prompt: 'Ping the build', interval: '10m', max_runs: 50 };
const listed = (...items: Array<Record<string, unknown>>) => ({ ok: true as const, items });

describe('intentBody: one intent per updateLoop', () => {
  it.each<[Intent, Record<string, unknown>]>([
    [{ k: 'pause' }, { paused: true }],
    [{ k: 'resume' }, { paused: false }],
    [{ k: 'extend', expiresIn: '3d', ms: 259_200_000 }, { expires_in: '3d' }],
    [{ k: 'extend', expiresIn: '', ms: 0 }, { expires_in: '' }],
    // the agent sets both limits from the body (absent = none): a start again always sends both
    [{ k: 'restart', maxCostUsd: 2, maxWallMs: 0 }, { max_cost_usd: 2, max_wall_ms: 0 }],
    [{ k: 'restart', maxCostUsd: 0, maxWallMs: 3_600_000 }, { max_cost_usd: 0, max_wall_ms: 3_600_000 }],
  ])('%j → %j', (i, body) => expect(intentBody(i)).toEqual(body));
});

describe('actionsFor', () => {
  it.each<[string, string[]]>([
    ['running', ['pause', 'runNow', 'extend', 'replace', 'delete']],
    ['firing', ['pause', 'extend', 'replace', 'delete']],
    ['paused', ['resume', 'runNow', 'extend', 'replace', 'delete']],
    ['error', ['resume', 'runNow', 'extend', 'replace', 'delete']],
    ['expired', ['extend', 'replace', 'delete']],
    // a stopped loop starts again (loops.update); a finished one (its run limit) does not
    ['stopped', ['restart', 'replace', 'delete']],
    ['ended', ['replace', 'delete']],
    ['', ['replace', 'delete']],
  ])('%s', (state, want) => expect(actionsFor(state)).toEqual(want));
});

describe('bodyOf: the form', () => {
  const d = (o: Partial<Draft>): Draft => ({ ...EMPTY_DRAFT, prompt: 'Check CI', ...o });
  it.each<[Partial<Draft>, string]>([
    [{ prompt: '  ' }, 'prompt'],
    [{ every: '' }, 'every'],
    [{ every: '0' }, 'every'],
    [{ every: '1.5' }, 'every'],
    [{ every: '-2' }, 'every'],
    [{ maxRuns: '' }, 'maxRuns'],
    [{ maxRuns: '0' }, 'maxRuns'],
    [{ maxRuns: '2.5' }, 'maxRuns'],
    [{ every: '2', unit: 'h', ends: '1h' }, 'endsShort'],
    // a written limit is above 0; 0 would read as "no limit" at the agent, so it is refused, not sent.
    [{ maxCost: '0' }, 'maxCost'],
    [{ maxCost: '0.00' }, 'maxCost'],
    [{ maxCost: '-1' }, 'maxCost'],
    [{ maxCost: '1.234' }, 'maxCost'],
    [{ maxCost: '1e3' }, 'maxCost'],
    [{ maxCost: '$5' }, 'maxCost'],
    [{ maxWall: '0' }, 'maxWall'],
    [{ maxWall: '1.5' }, 'maxWall'],
    [{ maxWall: '-3' }, 'maxWall'],
  ])('%j is refused (%s)', (o, problem) => expect(bodyOf(d(o))).toEqual({ problem }));

  it('minutes, hours and days become the agent tokens; the prompt is trimmed', () => {
    expect(bodyOf(d({ prompt: ' Check CI ', every: '1', unit: 'min' }))).toEqual({ body: { prompt: 'Check CI', interval: '1m', max_runs: 50 }, intervalMs: 60_000 });
    expect(bodyOf(d({ every: '2', unit: 'h', maxRuns: '3' }))).toEqual({ body: { prompt: 'Check CI', interval: '2h', max_runs: 3 }, intervalMs: 7_200_000 });
    expect(bodyOf(d({ every: '1', unit: 'd' }))).toMatchObject({ body: { interval: '1d' }, intervalMs: 86_400_000 });
  });

  it('an end time and "run once now" are sent only when chosen; run once now allows an end before the first tick', () => {
    expect(bodyOf(d({ every: '2', unit: 'h', ends: '1h', fireNow: true }))).toEqual({ body: { prompt: 'Check CI', interval: '2h', max_runs: 50, expires_in: '1h', fire_now: true }, intervalMs: 7_200_000 });
    expect(bodyOf(d({ every: '1', unit: 'h', ends: '1h' }))).toMatchObject({ body: { expires_in: '1h' } });
    const plain = bodyOf(d({}));
    expect('body' in plain && ('expires_in' in plain.body || 'fire_now' in plain.body)).toBe(false);
  });

  it('the spending and running-time limits are sent only when written, as dollars and ms', () => {
    expect(bodyOf(d({ maxCost: ' 2.5 ', maxWall: '3', wallUnit: 'h' }))).toEqual({
      body: { prompt: 'Check CI', interval: '30m', max_runs: 50, max_cost_usd: 2.5, max_wall_ms: 10_800_000 },
      intervalMs: 1_800_000,
    });
    expect(bodyOf(d({ maxWall: '45', wallUnit: 'min' }))).toMatchObject({ body: { max_wall_ms: 2_700_000 } });
    expect(bodyOf(d({ maxWall: '2', wallUnit: 'd' }))).toMatchObject({ body: { max_wall_ms: 172_800_000 } });
    const plain = bodyOf(d({ maxCost: '  ', maxWall: '' }));
    expect('body' in plain && ('max_cost_usd' in plain.body || 'max_wall_ms' in plain.body)).toBe(false);
  });

  it('draftOf keeps the loop\'s limits, so Replace does not drop them (rounded up, never to a lower limit)', () => {
    const base = { promptFull: 'p', intervalMs: 3_600_000, runs: { max: 5 } };
    expect(draftOf({ ...base, maxCostUsd: 2.5, maxWallMs: 7_200_000 })).toMatchObject({ maxCost: '2.5', maxWall: '2', wallUnit: 'h' });
    expect(draftOf({ ...base, maxCostUsd: 1.1, maxWallMs: 90_000 })).toMatchObject({ maxCost: '1.1', maxWall: '2', wallUnit: 'min' });
    expect(draftOf({ ...base, maxCostUsd: 0.123, maxWallMs: 86_400_000 })).toMatchObject({ maxCost: '0.13', maxWall: '1', wallUnit: 'd' });
    expect(draftOf({ ...base, maxCostUsd: 0, maxWallMs: 0 })).toMatchObject({ maxCost: '', maxWall: '' });
    expect(draftOf(base)).toMatchObject({ maxCost: '', maxWall: '' });
    // no tolerance, so a limit a hair above a cent never rounds down (nor to 0).
    expect(draftOf({ ...base, maxCostUsd: 1.0000000001 })).toMatchObject({ maxCost: '1.01' });
    expect(draftOf({ ...base, maxCostUsd: 0.0000000001 })).toMatchObject({ maxCost: '0.01' });
    expect(draftOf({ ...base, maxCostUsd: 0.29 })).toMatchObject({ maxCost: '0.29' });
    // past 2^53 cents the exact value is written (never a lower one); a running time past safe ms is refused
    // by the form rather than written lower.
    expect(Number(draftOf({ ...base, maxCostUsd: 95951982453163.25 }).maxCost)).toBeGreaterThanOrEqual(95951982453163.25);
    const huge = draftOf({ ...base, maxWallMs: 9_007_199_254_740_991 });
    expect(Number(huge.maxWall) * 60_000).toBeGreaterThanOrEqual(9_007_199_254_740_991);
    expect(bodyOf(huge)).toEqual({ problem: 'maxWallBig' });
    expect(bodyOf({ ...huge, maxWall: '', maxCost: '1234567890123456' })).toEqual({ problem: 'maxCostBig' });
    // a large limit the agent took makes a draft the form still accepts, unchanged.
    for (const l of [{ maxCostUsd: 999999.999 }, { maxWallMs: 60_000_060_000 }, { maxCostUsd: 1e12, maxWallMs: 1e13 }]) {
      const dr = draftOf({ ...base, ...l });
      expect(bodyOf({ ...dr })).toHaveProperty('body');
    }
    const again = bodyOf({ ...draftOf({ ...base, maxCostUsd: 2.5, maxWallMs: 7_200_000 }) });
    expect(again).toMatchObject({ body: { max_cost_usd: 2.5, max_wall_ms: 7_200_000 } });
  });

  it('the create route lets both limits through', () => {
    expect(editRoutes.create.body).toEqual(expect.arrayContaining(['max_cost_usd', 'max_wall_ms']));
  });

  it('draftOf picks the largest whole unit', () => {
    expect(draftOf({ promptFull: 'p', intervalMs: 172_800_000, runs: { max: 9 } })).toMatchObject({ every: '2', unit: 'd', maxRuns: '9' });
    expect(draftOf({ promptFull: 'p', intervalMs: 10_800_000, runs: { max: 0 } })).toMatchObject({ every: '3', unit: 'h', maxRuns: '50' });
    expect(draftOf({ promptFull: 'p', intervalMs: 5_400_000, runs: { max: 1 } })).toMatchObject({ every: '90', unit: 'min' });
  });
});

describe('proofOf: only the loop reading in the asked state settles a lost answer; run now and end time never', () => {
  const L = (o: Record<string, unknown> = {}) => ({ id: 'L1', paused: false, state: 'running', run_count: 3, ...o });
  const at = (ms: number) => new Date(T + ms).toISOString();
  const hour: Intent = { k: 'extend', expiresIn: '1h', ms: 3_600_000 };
  const never: Intent = { k: 'extend', expiresIn: '', ms: 0 };
  const again: Intent = { k: 'restart', maxCostUsd: 2, maxWallMs: 0 };
  // One row per proof case: what each read can and cannot prove.
  const rows: [string, Parameters<typeof proofOf>, 'done' | 'unknown'][] = [
    ['delete: the loop gone', ['delete', null, undefined], 'done'],
    ['delete: the loop still listed', ['delete', null, L()], 'unknown'],
    ['a missing loop proves no pause', ['pause', { k: 'pause' }, undefined], 'unknown'],
    ['pause: a plain pause', ['pause', { k: 'pause' }, L({ paused: true, state: 'paused' })], 'done'],
    ['pause: still running', ['pause', { k: 'pause' }, L()], 'unknown'],
    ['pause: the loop expired on its own (paused, state expired)', ['pause', { k: 'pause' }, L({ paused: true, state: 'expired' })], 'unknown'],
    ['pause: the loop ended on its own', ['pause', { k: 'pause' }, L({ paused: true, state: 'ended' })], 'unknown'],
    ['pause: a limit stopped it', ['pause', { k: 'pause' }, L({ paused: true, state: 'stopped' })], 'unknown'],
    ['pause: the breaker tripped', ['pause', { k: 'pause' }, L({ paused: true, state: 'error' })], 'unknown'],
    ['resume: running', ['resume', { k: 'resume' }, L()], 'done'],
    ['resume: firing', ['resume', { k: 'resume' }, L({ state: 'firing' })], 'done'],
    ['resume: still paused', ['resume', { k: 'resume' }, L({ paused: true, state: 'paused' })], 'unknown'],
    ['resume: expired', ['resume', { k: 'resume' }, L({ state: 'expired' })], 'unknown'],
    ['run now: a paused loop whose count rose (an earlier run, or an earlier forgotten request)', ['runNow', null, L({ paused: true, state: 'paused', run_count: 8 })], 'unknown'],
    ['run now: a running loop whose timer counted a run', ['runNow', null, L({ run_count: 4 })], 'unknown'],
    ['run now: firing', ['runNow', null, L({ state: 'firing' })], 'unknown'],
    ['end time: 1 h asked, the end 1 h away (an earlier change may have set it)', ['extend', hour, L({ expires_at: at(3_600_000) })], 'unknown'],
    ['end time: 1 h asked, the end 7 d away', ['extend', hour, L({ expires_at: at(7 * 86_400_000) })], 'unknown'],
    ['end time: never asked, no end', ['extend', never, L()], 'unknown'],
    ['start again: running again with the limits it sent', ['restart', again, L({ max_cost_usd: 2 })], 'done'],
    ['start again: firing with the limits it sent', ['restart', again, L({ state: 'firing', max_cost_usd: 2 })], 'done'],
    ['start again: running, but with another spending limit (another change)', ['restart', again, L({ max_cost_usd: 5 })], 'unknown'],
    ['start again: running, but with no spending limit', ['restart', again, L()], 'unknown'],
    ['start again: running, with a running-time limit it did not send', ['restart', again, L({ max_cost_usd: 2, max_wall_ms: 60_000 })], 'unknown'],
    ['start again: still stopped', ['restart', again, L({ paused: true, state: 'stopped' })], 'unknown'],
    ['start again: paused (not what it asked)', ['restart', again, L({ paused: true, state: 'paused' })], 'unknown'],
    ['start again: the loop gone', ['restart', again, undefined], 'unknown'],
  ];
  it.each(rows)('%s', (_name, args, want) => {
    expect(proofOf(...args)).toBe(want);
  });
});

describe('candidates: the look-alikes of a lost create', () => {
  const C = (id: string, o: Record<string, unknown> = {}) => ({ id, prompt: 'Ping the build', interval_ms: 600_000, created_at: new Date(T).toISOString(), ...o });
  it('same prompt and interval, made since the send (less skew), newest first', () => {
    const got = candidates([
      C('a', { created_at: new Date(T + 1000).toISOString() }),
      C('b', { created_at: new Date(T + 5000).toISOString() }),
      C('old', { created_at: new Date(T - SKEW_MS - 1).toISOString() }),
      C('edge', { created_at: new Date(T - SKEW_MS).toISOString() }),
      C('prompt', { prompt: 'Other' }),
      C('every', { interval_ms: 300_000 }),
      C('nodate', { created_at: undefined }),
    ], NEW, 600_000, T);
    expect(got.map((c) => c.id)).toEqual(['b', 'a', 'edge']);
  });
  it('the prompt compares trimmed', () => {
    expect(candidates([C('a', { prompt: ' Ping the build ' })], { ...NEW, prompt: 'Ping the build ' }, 600_000, T)).toHaveLength(1);
  });
});

describe('parseLoops: one reader of the listing; anything contradictory is unreadable', () => {
  const L = (id: string, more: Record<string, unknown> = {}) => ({ id, session_id: 'S', state: 'running', ...more });
  it('reads a whole listing whose parts agree', () => {
    expect(parseLoops({ items: [L('a'), L('b')], meta: { total: 2 } }, 'S')?.map((l) => l.id)).toEqual(['a', 'b']);
    expect(parseLoops({ items: [], meta: { total: 0 } }, 'S')).toEqual([]);
  });
  it.each<[string, unknown]>([
    ['no envelope', null],
    ['items not a list', { items: {}, meta: { total: 0 } }],
    ['no meta', { items: [L('a')] }],
    ['total missing', { items: [L('a')], meta: {} }],
    ['total disagrees with the items (a window)', { items: [L('a')], meta: { total: 2 } }],
    ['a page window set', { items: [L('a')], meta: { total: 1, page: 1, limit: 1 } }],
    ['a row that is not an object', { items: [L('a'), 'b'], meta: { total: 2 } }],
    ['a row with no id', { items: [L('a'), L('')], meta: { total: 2 } }],
    ['the same id twice', { items: [L('a'), L('a')], meta: { total: 2 } }],
    ["a row of another chat", { items: [L('a'), L('b', { session_id: 'X' })], meta: { total: 2 } }],
    ['a row with no session', { items: [L('a', { session_id: undefined })], meta: { total: 1 } }],
    ['a row with no state', { items: [L('a', { state: 3 })], meta: { total: 1 } }],
  ])('%s', (_n, body) => expect(parseLoops(body, 'S')).toBeNull());
});

describe('identOf: what a loop confirm is bound to', () => {
  it.each<[string, Parameters<typeof identOf>, string | null]>([
    ['pause on a running L1', ['pause', 'L1', [{ id: 'L1', state: 'running' }]], 'loop\nL1\npause'],
    ['pause on a paused L1 (no longer offered)', ['pause', 'L1', [{ id: 'L1', state: 'paused' }]], null],
    ['delete on L1 gone (another loop listed)', ['delete', 'L1', [{ id: 'L2', state: 'running' }]], null],
    ['extend on an expired L1 (it starts it again)', ['extend', 'L1', [{ id: 'L1', state: 'expired' }]], 'loop\nL1\nextend\nstarts'],
    ['extend on a running L1', ['extend', 'L1', [{ id: 'L1', state: 'running' }]], 'loop\nL1\nextend'],
    ['pause on a firing L1 means the same as on a running one', ['pause', 'L1', [{ id: 'L1', state: 'firing' }]], 'loop\nL1\npause'],
    ['run now on a firing L1 (refused while firing)', ['runNow', 'L1', [{ id: 'L1', state: 'firing' }]], null],
    ['no loop id', ['delete', null, [{ id: 'L1', state: 'running' }]], null],
    ['start again on a stopped L1 carries its limits', ['restart', 'L1', [{ id: 'L1', state: 'stopped', max_cost_usd: 2 }]], 'loop\nL1\nrestart\n2\n0'],
    ['start again on a stopped L1 with no limits', ['restart', 'L1', [{ id: 'L1', state: 'stopped' }]], 'loop\nL1\nrestart\n0\n0'],
    ['start again on a finished L1 (its run limit: not offered)', ['restart', 'L1', [{ id: 'L1', state: 'ended' }]], null],
    ['start again on a running L1 (not offered)', ['restart', 'L1', [{ id: 'L1', state: 'running' }]], null],
    ['replace carries the limits (its new loop starts from them)', ['replace', 'L1', [{ id: 'L1', state: 'running', max_cost_usd: 2, max_wall_ms: 60_000 }]], 'loop\nL1\nreplace\n2\n60000'],
    ['replace on a loop with no limits', ['replace', 'L1', [{ id: 'L1', state: 'paused' }]], 'loop\nL1\nreplace\n0\n0'],
  ])('%s', (_n, args, want) => expect(identOf(...args)).toBe(want));
});

describe('agrees: a read means what the confirm was opened for', () => {
  it.each<[string, Parameters<typeof agrees>, boolean]>([
    ['an end time shown on a running loop, read running', ['extend', '', 'loop\nL1\nextend'], true],
    ['an end time shown on a running loop, read expired (it would start it)', ['extend', '', 'loop\nL1\nextend\nstarts'], false],
    ['an end time shown on an expired loop, read expired', ['extend', 'starts', 'loop\nL1\nextend\nstarts'], true],
    ['an end time shown on an expired loop, read running', ['extend', 'starts', 'loop\nL1\nextend'], false],
    ['a pause', ['pause', '', 'loop\nL1\npause'], true],
    ['a start again shown with a $2 limit, read with it', ['restart', '2\n0', 'loop\nL1\nrestart\n2\n0'], true],
    ['a start again shown with a $2 limit, read with $5 (another limit)', ['restart', '2\n0', 'loop\nL1\nrestart\n5\n0'], false],
    ['a start again shown with no limits, read with a running-time limit', ['restart', '0\n0', 'loop\nL1\nrestart\n0\n3600000'], false],
    ['a replace shown with no limits, read with a $5 limit (set meanwhile)', ['replace', '0\n0', 'loop\nL1\nreplace\n5\n0'], false],
    ['a replace shown with a $5 limit, read with it', ['replace', '5\n0', 'loop\nL1\nreplace\n5\n0'], true],
  ])('%s', (_n, args, want) => expect(agrees(...args)).toBe(want));
});

describe('the change store', () => {
  describe("a confirm's open read never adopts a meaning the row did not show", () => {
    it('an end time opened on a running loop reads nothing when the listing shows it expired', async () => {
      const f = fakeApi({ list: [listed({ id: 'L1', state: 'expired' })] });
      expect(await store(f.api, 'L1', f.f).identify('extend', '')).toBeNull();
    });
    it('an end time opened on an expired loop reads its starting meaning', async () => {
      const f = fakeApi({ list: [listed({ id: 'L1', state: 'expired' })] });
      expect(await store(f.api, 'L1', f.f).identify('extend', 'starts')).toBe('loop\nL1\nextend\nstarts');
    });
    it('an end time opened on an expired loop reads nothing when the listing shows it running', async () => {
      const f = fakeApi({ list: [listed({ id: 'L1', state: 'running' })] });
      expect(await store(f.api, 'L1', f.f).identify('extend', 'starts')).toBeNull();
    });
    it('Never is refused unsent when the loop reads expired at the send, whatever was confirmed', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'expired' })] });
      const s = store(f.api, 'L1', f.f);
      await s.run('extend', { k: 'extend', expiresIn: '', ms: 0 }, 'loop\nL1\nextend\nstarts');
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'changed' });
    });
    it('a new end on an expired loop confirmed as starting it is sent', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'expired' })] });
      const s = store(f.api, 'L1', f.f);
      await s.run('extend', { k: 'extend', expiresIn: '1d', ms: 86_400_000 }, 'loop\nL1\nextend\nstarts');
      expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { expires_in: '1d' } }]);
    });
  });

  describe('start again: both limits as listed, bound to them', () => {
    const again: Intent = { k: 'restart', maxCostUsd: 2, maxWallMs: 0 };
    const id = `loop\nL1\nrestart\n${limitsOf({ max_cost_usd: 2 })}`;
    it('sends one PATCH with both limits; its answer is told only from a read showing it running with them', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 }), listed({ id: 'L1', state: 'running', paused: false, max_cost_usd: 2 })] });
      const s = store(f.api, 'L1', f.f);
      await s.run('restart', again, id);
      expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { max_cost_usd: 2, max_wall_ms: 0 } }]);
      expect(f.sent.filter((x) => x.op === 'pre')).toHaveLength(2);
      expect(s.view()).toMatchObject({ phase: 'done', fromRead: true, action: 'restart' });
    });
    // The agent answers {status: ok} with no state, also when the loop was started meanwhile and only its limits were set.
    it.each<[string, Listing]>([
      ['the read shows it still stopped', listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 })],
      ['the read shows it running with other limits (another change)', listed({ id: 'L1', state: 'running', paused: false, max_cost_usd: 5 })],
      ['the read shows it running with a running-time limit added', listed({ id: 'L1', state: 'running', paused: false, max_cost_usd: 2, max_wall_ms: 60_000 })],
      ['the loop is not listed', listed({ id: 'L2', state: 'running', paused: false })],
      ['the read failed', { ok: false }],
    ])('an answered start again stays unknown when %s; nothing is sent again', async (_n, after) => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 }), after] });
      const s = store(f.api, 'L1', f.f);
      await s.run('restart', again, id);
      expect(s.view()).toMatchObject({ phase: 'unsure', action: 'restart', fromRead: false });
      expect(f.writes()).toHaveLength(1);
    });
    it('a refused start again is told as refused, with no read after it', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 })], replies: { update: [refused()] } });
      const s = store(f.api, 'L1', f.f);
      await s.run('restart', again, id);
      expect(s.view()).toMatchObject({ phase: 'refused' });
      expect(f.sent.filter((x) => x.op === 'pre')).toHaveLength(1);
    });
    it.each<[string, Listing]>([
      ['its limit changed after the confirm', listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 5 })],
      ['a running-time limit was added', listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2, max_wall_ms: 60_000 })],
      ['it is running again already', listed({ id: 'L1', state: 'running', paused: false, max_cost_usd: 2 })],
      ['it finished instead (no start again)', listed({ id: 'L1', state: 'ended', paused: true, max_cost_usd: 2 })],
    ])('nothing is sent when %s', async (_n, pre) => {
      const f = fakeApi({ pre: [pre] });
      const s = store(f.api, 'L1', f.f);
      await s.run('restart', again, id);
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'changed' });
    });
    it('nothing is sent without its limits (no intent)', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'stopped', paused: true })] });
      const s = store(f.api, 'L1', f.f);
      await s.run('restart', undefined, 'loop\nL1\nrestart\n0\n0');
      expect(f.sent).toEqual([]);
    });
    it('a lost answer is settled only by a read showing it running again', async () => {
      const f = fakeApi({
        pre: [listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 })],
        replies: { update: [lost] },
        list: [listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 }), listed({ id: 'L1', state: 'running', paused: false, max_cost_usd: 5 }), listed({ id: 'L1', state: 'running', paused: false, max_cost_usd: 2 })],
      });
      const s = store(f.api, 'L1', f.f);
      await s.run('restart', again, id);
      expect(s.view()).toMatchObject({ phase: 'unsure' });
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
      // running with another limit: another change, not this one's
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'done', fromRead: true, action: 'restart' });
      expect(f.writes()).toHaveLength(1);
    });
  });

  describe('the read before the send: nothing is sent unless the loop still offers the change it was confirmed for', () => {
    it.each<[string, 'pause' | 'delete' | 'extend' | 'resume', string | null, Listing]>([
      ['a Pause confirmed on running L1, L1 now stopped', 'pause', 'loop\nL1\npause', listed({ id: 'L1', state: 'stopped', paused: true })],
      ['a Delete confirmed on L1, L1 gone', 'delete', 'loop\nL1\ndelete', listed({ id: 'L2', state: 'running' })],
      ['a Delete confirmed for another loop (B), this store is L1', 'delete', 'loop\nL2\ndelete', listed({ id: 'L1', state: 'running' })],
      ['an end time confirmed, L1 now ended', 'extend', 'loop\nL1\nextend', listed({ id: 'L1', state: 'ended' })],
      ['an end time confirmed on running L1, L1 now expired (it would start it again)', 'extend', 'loop\nL1\nextend', listed({ id: 'L1', state: 'expired' })],
      ['an end time confirmed on expired L1, L1 now running', 'extend', 'loop\nL1\nextend\nstarts', listed({ id: 'L1', state: 'running' })],
      ['a Resume (unconfirmed), L1 now running', 'resume', null, listed({ id: 'L1', state: 'running' })],
    ])('%s', async (_n, a, expect_, pre) => {
      const f = fakeApi({ pre: [pre] });
      const s = store(f.api, 'L1', f.f);
      await s.run(a, a === 'extend' ? { k: 'extend', expiresIn: '1h', ms: 3_600_000 } : undefined, expect_);
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'changed' });
    });
    it('the read failing sends nothing either', async () => {
      const f = fakeApi({ pre: [{ ok: false }] });
      const s = store(f.api, 'L1', f.f);
      await s.run('delete', undefined, 'loop\nL1\ndelete');
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'readFailed' });
    });
    it('a Replace confirmed on L1 deletes nothing when L1 no longer offers it', async () => {
      const f = fakeApi({ pre: [listed()] });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, 'loop\nL1\nreplace\n0\n0');
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'changed' });
    });
    // Replace is bound to the limits the row showed; one set meanwhile deletes nothing.
    it('a Replace confirmed on L1 with no limits deletes nothing when L1 now has a spending limit', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'running', max_cost_usd: 5 })] });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, 'loop\nL1\nreplace\n0\n0');
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'changed' });
    });
    it('a Replace confirmed with the limits L1 still has deletes, then creates', async () => {
      const f = fakeApi({ pre: [listed({ id: 'L1', state: 'running', max_cost_usd: 5 })] });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, 'loop\nL1\nreplace\n5\n0');
      expect(f.writes()[0]).toEqual({ op: 'remove', id: 'L1' });
    });
    it('the same identity is sent', async () => {
      const f = fakeApi();
      const s = store(f.api, 'L1', f.f);
      await s.run('delete', undefined, 'loop\nL1\ndelete');
      expect(f.writes()).toEqual([{ op: 'remove', id: 'L1' }]);
    });
  });

  it('pause sends one update with one intent and reads done on a 2xx', async () => {
    const f = fakeApi();
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { paused: true } }]);
    expect(s.view()).toMatchObject({ phase: 'done', action: 'pause' });
    expect(s.holds()).toBe(false);
  });

  it('extend needs its intent; without one nothing is sent', async () => {
    const f = fakeApi();
    const s = store(f.api, 'L1', f.f);
    await s.run('extend', undefined, null);
    expect(f.sent).toEqual([]);
    await s.run('extend', { k: 'extend', expiresIn: '1h', ms: 3_600_000 }, null);
    expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { expires_in: '1h' } }]);
  });

  it('delete and run now use their own calls', async () => {
    const f = fakeApi();
    const s = store(f.api, 'L1', f.f);
    await s.run('runNow', undefined, null);
    s.clear();
    await s.run('delete', undefined, null);
    expect(f.writes()).toEqual([{ op: 'runNow', id: 'L1' }, { op: 'remove', id: 'L1' }]);
  });

  it('a 4xx is refused; a lost answer is unsure and holds the store; nothing else is sent while it is', async () => {
    const f = fakeApi({ replies: { update: [refused(), lost] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    expect(s.view()).toMatchObject({ phase: 'refused', refusal: { status: 400 } });
    s.clear();
    await s.run('pause', undefined, null);
    expect(s.view().phase).toBe('unsure');
    expect(s.holds()).toBe(true);
    await s.run('resume', undefined, null);
    await s.run('delete', undefined, null);
    await s.replace(NEW, 600_000, null);
    expect(f.writes()).toHaveLength(2);
    s.clear();
    expect(s.view().phase).toBe('unsure');
  });

  it('a lost pause: a read without the flag proves nothing, a failed read says so, a read with it settles done', async () => {
    const f = fakeApi({ replies: { update: [lost] }, list: [listed({ id: 'L1', paused: false }), { ok: false }, listed({ id: 'L1', paused: true, state: 'paused' })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same', reading: false });
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'failed' });
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'done', observed: null, refusal: null });
    expect(f.writes()).toHaveLength(1);
  });

  it('check does nothing unless unsure; forget drops an unsure change without sending', async () => {
    const f = fakeApi({ replies: { update: [lost] } });
    const s = store(f.api, 'L1', f.f);
    await s.check();
    expect(f.sent).toEqual([]);
    await s.run('pause', undefined, null);
    s.forget();
    expect(s.view().phase).toBe('idle');
    expect(f.writes()).toHaveLength(1);
  });

  it('a lost delete is done once the loop reads gone', async () => {
    const f = fakeApi({ replies: { remove: [lost] }, list: [listed()] });
    const s = store(f.api, 'L1', f.f);
    await s.run('delete', undefined, null);
    await s.check();
    expect(s.view().phase).toBe('done');
  });

  it('a lost run now is never settled by a read: the count rising shows the loop as it is, and it stays unknown', async () => {
    const f = fakeApi({ replies: { runNow: [lost] }, list: [listed({ id: 'L1', paused: true, state: 'paused', run_count: 8, expires_at: '' })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('runNow', undefined, null);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same', now: { state: 'paused', runCount: 8, expiresAt: '' } });
    expect(f.writes()).toEqual([{ op: 'runNow', id: 'L1' }]);
  });

  it('a lost end time is never settled by a read, even one showing the asked end', async () => {
    const end = new Date(T + 3_600_000).toISOString();
    const f = fakeApi({ replies: { update: [lost] }, list: [listed({ id: 'L1', state: 'running', run_count: 3, expires_at: end })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('extend', { k: 'extend', expiresIn: '1h', ms: 3_600_000 }, null);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', now: { expiresAt: end } });
  });

  it('a lost pause a read settles is told as read, not as the answer', async () => {
    const f = fakeApi({ replies: { update: [lost] }, list: [listed({ id: 'L1', paused: true, state: 'paused' })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    expect(s.view().fromRead).toBe(false);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'done', fromRead: true, now: null });
  });

  it('a read that answers after Stop tracking settles nothing', async () => {
    let answer!: (r: Listing) => void;
    const f = fakeApi({ replies: { update: [lost] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    f.api.list = () => new Promise((res) => (answer = res));
    const late = s.check();
    s.forget();
    answer(listed({ id: 'L1', paused: true, state: 'paused' }));
    await late;
    expect(s.view()).toMatchObject({ phase: 'idle', action: null, reading: false, observed: null });
  });

  it('a read that answers after the person moved on settles nothing', async () => {
    let answer!: (r: Listing) => void;
    const f = fakeApi({ replies: { update: [lost, lost] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    const list = f.api.list;
    f.api.list = () => ((f.api.list = list), new Promise((res) => (answer = res)));
    const late = s.check();
    s.forget();
    expect(s.view().phase).toBe('idle');
    await s.run('resume', undefined, null);
    expect(s.view()).toMatchObject({ phase: 'unsure', action: 'resume' });
    answer(listed({ id: 'L1', paused: false, state: 'running' }));
    await late;
    expect(s.view()).toMatchObject({ phase: 'unsure', action: 'resume', reading: false });
  });

  it('after a forgotten pause, a delete is sent and settles on its own answer', async () => {
    let answer!: (r: Settled) => void;
    const f = fakeApi({ replies: { update: [lost] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, null);
    s.forget();
    f.api.remove = () => new Promise((res) => (answer = res));
    const del = s.run('delete', undefined, null);
    expect(s.view()).toMatchObject({ phase: 'running', action: 'delete' });
    await new Promise((r) => setTimeout(r, 0)); // the read before the send
    answer(ok());
    await del;
    expect(s.view()).toMatchObject({ phase: 'done', action: 'delete' });
  });

  describe('replace = stop + new', () => {
    it('deletes, then creates once the delete answered', async () => {
      const f = fakeApi({ replies: { create: [ok({ loop: { id: 'L2' } })] } });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      expect(f.writes()).toEqual([{ op: 'remove', id: 'L1' }, { op: 'create', arg: NEW }]);
      expect(s.view()).toMatchObject({ phase: 'done', action: 'replace', step: 'create', newId: 'L2', hadOld: true });
    });

    it('a delete answered 404 proves nothing (another owner or realm answers it too): nothing new is started', async () => {
      const f = fakeApi({ replies: { remove: [refused(404, 'not_found')], create: [ok({ loop: { id: 'L2' } })] } });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      expect(f.writes().map((w) => w.op)).toEqual(['remove']);
      expect(s.view()).toMatchObject({ phase: 'refused', step: 'delete' });
    });

    it('a delete refused otherwise starts nothing new', async () => {
      const f = fakeApi({ replies: { remove: [refused()] } });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      expect(f.writes().map((w) => w.op)).toEqual(['remove']);
      expect(s.view()).toMatchObject({ phase: 'refused', step: 'delete' });
    });

    it('a refused delete, dismissed and tried again, deletes first again', async () => {
      const f = fakeApi({ replies: { remove: [refused(), ok()], create: [ok({ loop: { id: 'L2' } })] } });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      s.clear();
      await s.replace(NEW, 600_000, null);
      expect(f.writes().map((w) => `${w.op}:${w.id ?? ''}`)).toEqual(['remove:L1', 'remove:L1', 'create:']);
    });

    it('waiting for the press, the new loop can be let go: nothing is sent', async () => {
      const f = fakeApi({ replies: { remove: [lost] }, list: [listed()] });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      await s.check();
      expect(s.view().awaitingCreate).toBe(true);
      s.forget();
      expect(s.view()).toMatchObject({ phase: 'idle', awaitingCreate: false });
      expect(s.holds()).toBe(false);
      await s.startNew();
      expect(f.writes().map((w) => w.op)).toEqual(['remove']);
    });

    it('a lost delete starts nothing; a check proving it gone waits for the press; startNew creates once', async () => {
      const f = fakeApi({ replies: { remove: [lost], create: [ok({ loop: { id: 'L2' } })] }, list: [listed({ id: 'L1' }), listed()] });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      expect(s.view()).toMatchObject({ phase: 'unsure', step: 'delete' });
      await s.startNew();
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
      expect(f.writes().map((w) => w.op)).toEqual(['remove']);
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'idle', awaitingCreate: true });
      expect(s.holds()).toBe(true);
      expect(f.writes().map((w) => w.op)).toEqual(['remove']);
      await s.startNew();
      await s.startNew();
      expect(f.writes().map((w) => w.op)).toEqual(['remove', 'create']);
      expect(s.view()).toMatchObject({ phase: 'done', newId: 'L2', awaitingCreate: false });
    });

    it('the new loop refused after the delete reads as such', async () => {
      const f = fakeApi({ replies: { create: [refused()] } });
      const s = store(f.api, 'L1', f.f);
      await s.replace(NEW, 600_000, null);
      expect(s.view()).toMatchObject({ phase: 'refused', step: 'create', hadOld: true });
    });
  });

  describe('a new loop (no old one)', () => {
    it('creates straight away', async () => {
      const f = fakeApi({ replies: { create: [ok({ loop: { id: 'L9' } })] } });
      const s = store(f.api, null, f.f);
      await s.replace(NEW, 600_000, null);
      expect(f.writes()).toEqual([{ op: 'create', arg: NEW }]);
      expect(s.view()).toMatchObject({ phase: 'done', newId: 'L9', hadOld: false });
    });

    it('a 2xx without a readable loop id is unsure, never done', async () => {
      const f = fakeApi({ replies: { create: [ok({ status: 'ok' })] } });
      const s = store(f.api, null, f.f);
      await s.replace(NEW, 600_000, null);
      expect(s.view()).toMatchObject({ phase: 'unsure', step: 'create' });
    });

    it('a lost create is never sent again; check lists look-alikes and claims none; pick settles only a listed one', async () => {
      const mine = { id: 'L9', prompt: 'Ping the build', interval_ms: 600_000, created_at: new Date(T).toISOString() };
      const f = fakeApi({ replies: { create: [lost] }, list: [listed(), listed(mine)] });
      const s = store(f.api, null, f.f);
      await s.replace(NEW, 600_000, null);
      expect(s.view()).toMatchObject({ phase: 'unsure', step: 'create' });
      await s.replace(NEW, 600_000, null);
      await s.startNew();
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', candidates: [] });
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', candidates: [mine] });
      s.pick('L-other');
      expect(s.view().phase).toBe('unsure');
      s.pick('L9');
      expect(s.view()).toMatchObject({ phase: 'done', newId: 'L9', candidates: [] });
      expect(f.writes()).toEqual([{ op: 'create', arg: NEW }]);
      expect(f.sent.filter((x) => x.op === 'list')).toHaveLength(2);
      expect(f.sent.filter((x) => x.op === 'pre')).toHaveLength(0);
    });

    it('run without an old loop sends nothing', async () => {
      const f = fakeApi();
      const s = store(f.api, null, f.f);
      await s.run('pause', undefined, null);
      await s.run('delete', undefined, null);
      expect(f.writes()).toEqual([]);
    });
  });
});

// The agent's loop_preconditions capability: with it each PATCH carries the loop as the read just
// before the send showed it (if_max_cost_usd, if_max_wall_ms; if_state where the state is the change's meaning), and the agent
// changes nothing unless that still holds when the change lands (409 loop_changed). A start again sent with if_state stopped
// that the agent answers ok was started by this request: told from the answer, no read after it.
describe('guarded changes (loop_preconditions)', () => {
  const again: Intent = { k: 'restart', maxCostUsd: 2, maxWallMs: 0 };
  const id = `loop\nL1\nrestart\n${limitsOf({ max_cost_usd: 2 })}`;
  const stopped = listed({ id: 'L1', state: 'stopped', paused: true, max_cost_usd: 2 });
  it('intentBody adds the guard to the one intent', () => {
    expect(intentBody(again, { state: 'stopped', maxCostUsd: 2, maxWallMs: 0 })).toEqual({ max_cost_usd: 2, max_wall_ms: 0, if_state: 'stopped', if_max_cost_usd: 2, if_max_wall_ms: 0 });
    expect(intentBody({ k: 'pause' }, { maxCostUsd: 0.25, maxWallMs: 90_000 })).toEqual({ paused: true, if_max_cost_usd: 0.25, if_max_wall_ms: 90_000 });
  });
  it('a start again sends if_state stopped with the listed limits, and its ok answer is told as done from the answer', async () => {
    const f = fakeApi({ pre: [stopped] });
    const s = store(f.api, 'L1', f.f);
    await s.run('restart', again, id, true);
    expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { max_cost_usd: 2, max_wall_ms: 0, if_state: 'stopped', if_max_cost_usd: 2, if_max_wall_ms: 0 } }]);
    expect(f.sent.filter((x) => x.op === 'pre')).toHaveLength(1);
    expect(s.view()).toMatchObject({ phase: 'done', fromRead: false, action: 'restart' });
  });
  it('a start again the agent answers loop_changed is refused: nothing changed, nothing sent again', async () => {
    const f = fakeApi({ pre: [stopped], replies: { update: [refused(409, 'loop_changed')] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('restart', again, id, true);
    expect(s.view()).toMatchObject({ phase: 'refused', refusal: { code: 'loop_changed', status: 409 } });
    expect(f.writes()).toHaveLength(1);
  });
  it('a lost guarded start again stays unknown (the read after it may still tell it)', async () => {
    const f = fakeApi({ pre: [stopped], replies: { update: [lost] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('restart', again, id, true);
    expect(s.view()).toMatchObject({ phase: 'unsure' });
  });
  it('a pause carries the state and the limits the read showed', async () => {
    const f = fakeApi({ pre: [listed({ id: 'L1', state: 'firing', paused: false, max_cost_usd: 0.25, max_wall_ms: 90_000 })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('pause', undefined, 'loop\nL1\npause', true);
    expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { paused: true, if_state: 'firing', if_max_cost_usd: 0.25, if_max_wall_ms: 90_000 } }]);
  });
  it('a resume names the loop paused, so one that stopped or expired after the read is refused, never told resumed', async () => {
    const f = fakeApi({ pre: [listed({ id: 'L1', state: 'paused', paused: true })], replies: { update: [refused(409, 'loop_changed')] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('resume', undefined, 'loop\nL1\nresume', true);
    expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { paused: false, if_state: 'paused', if_max_cost_usd: 0, if_max_wall_ms: 0 } }]);
    expect(s.view()).toMatchObject({ phase: 'refused', refusal: { code: 'loop_changed' } });
  });
  it('an end time on a paused loop names it paused, so one that expired after the read is not started by it, Never included', async () => {
    const f = fakeApi({ pre: [listed({ id: 'L1', state: 'paused', paused: true })], replies: { update: [refused(409, 'loop_changed')] } });
    const s = store(f.api, 'L1', f.f);
    await s.run('extend', { k: 'extend', expiresIn: '', ms: 0 }, 'loop\nL1\nextend', true);
    expect(f.writes()).toEqual([{ op: 'update', id: 'L1', arg: { expires_in: '', if_state: 'paused', if_max_cost_usd: 0, if_max_wall_ms: 0 } }]);
    expect(s.view()).toMatchObject({ phase: 'refused', refusal: { code: 'loop_changed' } });
  });
  it('a state the agent does not list is not named (the limits still are)', async () => {
    expect(guardOf({ k: 'pause' }, { state: 'warming', max_cost_usd: 1 })).toEqual({ maxCostUsd: 1, maxWallMs: 0 });
  });
  it('an end time that starts an expired loop names it expired; on a running loop it names running', async () => {
    const f = fakeApi({ pre: [listed({ id: 'L1', state: 'expired', max_cost_usd: 1 }), listed({ id: 'L1', state: 'running', paused: false })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('extend', { k: 'extend', expiresIn: '1d', ms: 86_400_000 }, 'loop\nL1\nextend\nstarts', true);
    s.clear();
    await s.run('extend', { k: 'extend', expiresIn: '3d', ms: 259_200_000 }, 'loop\nL1\nextend', true);
    expect(f.writes()).toEqual([
      { op: 'update', id: 'L1', arg: { expires_in: '1d', if_state: 'expired', if_max_cost_usd: 1, if_max_wall_ms: 0 } },
      { op: 'update', id: 'L1', arg: { expires_in: '3d', if_state: 'running', if_max_cost_usd: 0, if_max_wall_ms: 0 } },
    ]);
  });
  it('run now and delete carry no guard (not loop PATCHes)', async () => {
    const f = fakeApi({ pre: [listed({ id: 'L1', state: 'running', paused: false })] });
    const s = store(f.api, 'L1', f.f);
    await s.run('runNow', undefined, null, true);
    expect(f.writes()).toEqual([{ op: 'runNow', id: 'L1' }]);
  });
});
