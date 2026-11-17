// Cancel and Resume of a workflow run (money may be spent), and the run's detail read. Each call is sent once, in the
// context it is given (null: nothing sent); a lost answer is never resent by the page: Check again re-reads the run
// (Cancel) or looks for a resume of it in the listing (Resume). Resume runs in the run's own chat only.
import { describe, expect, it, vi } from 'vitest';
import type * as core from '@core';
import type { Run } from './runs';
import { actionRoutes, CHILD_MISSING_MS, createActionStore, resumeOf, runActionApi, storeOffers, type ActionApi, type ActionSettled } from './runActions';

const run = (o: Partial<Run> = {}): Run => ({
  id: 'r1', workflow: 'deploy', sid: 's1', realm: 'global', state: 'failed', step: null, startedAt: 1_000, finishedAt: 2_000,
  cost: null, error: null, lastStep: null, resumedFrom: null, cwd: null, ...o,
});
const CTX = {} as never;
// runActionApi's reads through core's api, for the listing tests only (null: the real api).
const H = vi.hoisted(() => ({ api: null as null | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof core>();
  return { ...real, api: ((...a: unknown[]) => (H.api ? H.api(...a) : (real.api as (...x: unknown[]) => Promise<unknown>)(...a))) as typeof real.api };
});
const LOST: ActionSettled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };

function fake(o: { cancel?: ActionSettled[]; resume?: ActionSettled[]; list?: Array<Run[] | null> } = {}) {
  const sent: string[] = [];
  // The run each listing read was made about (the `about` argument; undefined = none).
  const abouts: Array<string | undefined> = [];
  const cancels = [...(o.cancel ?? [])], resumes = [...(o.resume ?? [])], lists = [...(o.list ?? [])];
  const api: ActionApi = {
    cancel: async (_id, ctx) => { if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }; sent.push('cancel'); return cancels.shift() ?? { ok: true, body: {} }; },
    resume: async (_id, sid, ctx) => { if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }; sent.push(`resume:${sid}`); return resumes.shift() ?? { ok: true, body: { status: 'ok', run_id: 'r2' } }; },
    list: async (ctx, about) => { if (!ctx) return null; sent.push('list'); abouts.push(about); return lists.length ? lists.shift() ?? null : []; },
    get: async () => null,
  };
  return { api, sent, abouts };
}

describe('the routes', () => {
  it('cancel and resume are the agent routes; resume sends only session_id and declares its refusals', () => {
    expect(actionRoutes.cancel).toMatchObject({ method: 'POST', path: '/workflows/runs/:runId/cancel' });
    expect(actionRoutes.resume).toMatchObject({ method: 'POST', path: '/workflows/runs/:runId/resume' });
    expect(actionRoutes.resume.body).toEqual(['session_id']);
    expect(actionRoutes.resume.refuses).toEqual(expect.arrayContaining(['session_busy', 'spend_cap', 'not_found']));
    expect(actionRoutes.get).toMatchObject({ method: 'GET', path: '/workflows/runs/:runId' });
  });
  it('with no context nothing is sent or read', async () => {
    const a = runActionApi('global');
    expect(await a.cancel('r1', null)).toEqual({ ok: false, err: { kind: 'not_sent', code: '', status: 0 } });
    expect(await a.resume('r1', 's1', null)).toEqual({ ok: false, err: { kind: 'not_sent', code: '', status: 0 } });
    expect(await a.list(null)).toBeNull();
    expect(await a.get('r1', null)).toBeNull();
  });
  // A row the parser cannot read may be the resume that blocks a second one.
  it('a listing with unreadable rows is a failed read', async () => {
    const row = { run_id: 'r1', workflow_name: 'deploy', session_id: 's1', started_at: '2026-11-11T00:00:00Z', current_idx: 0, total_steps: 1, status: 'failed', realm: 'global' };
    try {
      H.api = async () => ({ items: [row], meta: { total: 1 } });
      expect((await runActionApi('global').list(CTX))?.map((r) => r.id)).toEqual(['r1']);
      H.api = async () => ({ items: [row, { ...row, run_id: 'r2', status: 'weird' }], meta: { total: 2 } });
      expect(await runActionApi('global').list(CTX)).toBeNull();
      // Only an unreadable row that may be this run or a resume of it blocks.
      const about = async (items: unknown[]) => { H.api = async () => ({ items: [row, ...items], meta: { total: items.length + 1 } }); return runActionApi('global').list(CTX, 'r1'); };
      const long = { ...row, run_id: 'r5', workflow_name: 'w'.repeat(500) };
      expect((await about([long]))?.map((r) => r.id)).toEqual(['r1']);
      expect((await about([{ ...long, resumed_from: 'r9' }]))?.map((r) => r.id)).toEqual(['r1']);
      expect(await about([{ ...long, resumed_from: 'r1' }])).toBeNull();
      expect(await about([{ ...long, resumed_from: 7 }])).toBeNull();
      expect(await about([{ ...long, run_id: 'r1' }])).toBeNull();
      expect(await about([{ ...long, run_id: 5 }])).toBeNull();
      expect(await about(['x'])).toBeNull();
      // Two readable rows sharing an id are both skipped; a pair
      // resumed from this run blocks (it may have run steps), a pair resumed from another run does not.
      const dup = { ...row, run_id: 'c', status: 'failed', current_step: 'build' };
      expect(await about([{ ...dup, resumed_from: 'r1' }, { ...dup, resumed_from: 'r1' }])).toBeNull();
      expect((await about([{ ...dup, resumed_from: 'r9' }, { ...dup, resumed_from: 'r9' }]))?.map((r) => r.id)).toEqual(['r1']);
    } finally {
      H.api = null;
    }
  });
});

describe('resumeOf: the run in the listing that resumed `id`, newest first', () => {
  it('finds a resume started from the run, none for others', () => {
    expect(resumeOf([run({ id: 'b', resumedFrom: 'r1', startedAt: 5 }), run({ id: 'c', resumedFrom: 'r1', startedAt: 9 }), run({ id: 'd', resumedFrom: 'x' })], 'r1')?.id).toBe('c');
    expect(resumeOf([run({ id: 'd', resumedFrom: 'x' })], 'r1')).toBeNull();
  });
});

describe('the action store: one Cancel or Resume per run, sent once', () => {
  it('Cancel sends once; accepted, it reads the run and is done only when the run reads cancelled', async () => {
    const f = fake({ list: [[run({ state: 'cancelled' })]] });
    const s = createActionStore(f.api);
    const p = s.cancel(run({ state: 'running', finishedAt: null }), CTX);
    await s.cancel(run({ state: 'running', finishedAt: null }), CTX);
    await p;
    expect(f.sent).toEqual(['cancel', 'list']);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'cancel' });
  });
  it('an accepted Cancel whose run still reads running, or finished another way, is never called cancelled', async () => {
    const f = fake({ list: [[run({ state: 'running', finishedAt: null })], [run({ state: 'completed' })]] });
    const s = createActionStore(f.api);
    await s.cancel(run({ state: 'running', finishedAt: null }), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'cancel', accepted: true, observed: 'running' });
    await s.check(CTX);
    expect(s.view()).toEqual({ phase: 'ended', kind: 'cancel', state: 'completed' });
    expect(f.sent.filter((x) => x === 'cancel')).toHaveLength(1);
  });
  it('an action that ran stays fenced after its message is dismissed: the old row cannot send it again', async () => {
    const child = run({ id: 'r2', resumedFrom: 'r1', state: 'failed', step: 'build' });
    const f = fake({ list: [[run()], [run(), child], [run({ state: 'cancelled' })]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'resume' });
    s.clear();
    // The listing the page still shows has no resume of it yet: the store alone keeps it from being sent again.
    await s.resume(run(), CTX);
    const c = createActionStore(f.api);
    await c.cancel(run({ state: 'running', finishedAt: null }), CTX);
    expect(c.view()).toMatchObject({ phase: 'done', kind: 'cancel' });
    c.clear();
    await c.cancel(run({ state: 'running', finishedAt: null }), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1', 'cancel']);
    expect(s.fenced('resume') && c.fenced('cancel')).toBe(true);
  });
  it('a refused action is not fenced: nothing ran, so it may be sent again', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } }] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.fenced('resume')).toBe(false);
    await s.resume(run(), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1', 'resume:s1']);
  });
  it('the place is read after the hold: a page that moved or closed meanwhile sends nothing', async () => {
    const f = fake();
    const s = createActionStore(f.api);
    let place: unknown = CTX;
    await s.resume(run(), () => place as never, { ready: async () => { place = null; return 'held'; } });
    expect(f.sent).toEqual([]);
    expect(s.view()).toMatchObject({ phase: 'refused', why: 'notSent' });
  });
  it('Check again never takes a resume listed before this one was sent for it', async () => {
    const old = run({ id: 'r0', resumedFrom: 'r1', state: 'failed', startedAt: 1_500 });
    const f = fake({ resume: [LOST], list: [[run(), old], [run(), old], [run(), old, run({ id: 'r2', resumedFrom: 'r1', state: 'running', finishedAt: null, startedAt: 3_000 })]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', observed: 'none' });
    // A new one is listed, but a lost answer names none: it may be another tab's, so it is never this one's.
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', observed: 'unclear' });
  });
  it('Resume reads the runs first, goes to the run\'s own chat once, and is done only when its new run is listed', async () => {
    const child = run({ id: 'r2', resumedFrom: 'r1', state: 'running', finishedAt: null, step: 'build' });
    const f = fake({ list: [[run()], [run()], [run(), child]] });
    const s = createActionStore(f.api);
    await s.resume(run({ sid: 'chat-9' }), CTX);
    expect(f.sent).toEqual(['list', 'resume:chat-9', 'list']);
    // Accepted is not resumed: the chat may still discard the queued command.
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'none' });
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'resume', found: 'r2' });
    // Every read, before the send and Check again, is about this run, so an
    // unreadable resume of it blocks.
    expect(f.abouts).toEqual(['r1', 'r1', 'r1']);
  });
  // The accepted answer names the new run; only that run settles the Resume.
  it('an accepted Resume is settled by the run its answer names, never by another run resumed from it', async () => {
    const other = run({ id: 'r9', resumedFrom: 'r1', state: 'failed', startedAt: 2_500 });
    const mine = run({ id: 'r2', resumedFrom: 'r1', state: 'running', finishedAt: null, step: 'build', startedAt: 3_000 });
    const f = fake({ resume: [{ ok: true, body: { status: 'ok', run_id: 'r2' } }], list: [[run()], [run(), other], [run(), other, mine]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'none' });
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'resume', found: 'r2' });
  });
  it("after Stop tracking, the earlier Resume's run never settles the next Resume", async () => {
    const first = run({ id: 'r2', resumedFrom: 'r1', state: 'failed', startedAt: 3_000 });
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }, LOST], list: [[run()], [run()], [run()], [run(), first]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', accepted: true, observed: 'none' });
    s.forget();
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: false });
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'none' });
  });
  it('an answer naming no usable run (none, the run itself, one listed before) is never settled from the listing', async () => {
    for (const body of [{}, { run_id: 'r1' }, { run_id: 'r0' }, { run_id: 7 }, { run_id: 'a b' }]) {
      const old = run({ id: 'r0', resumedFrom: 'r1', state: 'failed', startedAt: 1_500 });
      const f = fake({ resume: [{ ok: true, body }], list: [[run(), old], [run(), old, run({ id: 'r2', resumedFrom: 'r1', state: 'running', finishedAt: null, step: 'build', startedAt: 3_000 })]] });
      const s = createActionStore(f.api);
      await s.resume(run(), CTX);
      expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'unclear' });
    }
  });
  // The listing read right before the send is the fence a reload or another tab still has.
  it('a run with a resume that started a step (even one that then failed) is refused before the send', async () => {
    for (const state of ['running', 'completed', 'failed', 'cancelled'] as const) {
      const prior = run({ id: 'r2', resumedFrom: 'r1', state, step: 'build', finishedAt: state === 'running' ? null : 3_000 });
      const f = fake({ list: [[run(), prior]] });
      const s = createActionStore(f.api);
      await s.resume(run(), CTX);
      expect(f.sent).toEqual(['list']);
      expect(s.view()).toMatchObject({ phase: 'refused', kind: 'resume', why: 'resumed' });
      expect(s.fenced('resume')).toBe(false);
    }
  });
  it('a resume of it running with no step yet does not refuse here: the agent refuses a second one while it is claimed', async () => {
    const claim = run({ id: 'r0', resumedFrom: 'r1', state: 'running', step: null, finishedAt: null, startedAt: 1_500 });
    const f = fake({ list: [[run(), claim]] });
    await createActionStore(f.api).resume(run(), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1']);
  });
  // The agent lists its claim as running before the chat's last checks, which can still refuse it.
  it('an accepted Resume whose named run reads running with no step yet stays unsure (starting), never done', async () => {
    const claim = run({ id: 'r2', resumedFrom: 'r1', state: 'running', step: null, finishedAt: null, startedAt: 3_000 });
    const f = fake({ list: [[run()], [run(), claim], [run(), { ...claim, step: 'build' }]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'starting' });
    expect(s.fenced('resume')).toBe(true);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'resume', found: 'r2' });
  });
  it('an accepted Resume whose named run reads failed with no finish time (its daemon went away) stays unsure: cut', async () => {
    const crashed = run({ id: 'r2', resumedFrom: 'r1', state: 'failed', step: null, lastStep: null, finishedAt: null, startedAt: 3_000 });
    const f = fake({ list: [[run()], [run(), crashed], [run(), crashed]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    // Never called resumed (it may have run nothing), never dropped (it may have run steps).
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'cut' });
    await s.resume(run(), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1']);
    // A fresh page (a reload) is refused before the send too.
    const c = createActionStore(f.api);
    await c.resume(run(), CTX);
    expect(c.view()).toMatchObject({ phase: 'refused', kind: 'resume', why: 'resumed' });
  });
  it('a resume that ended before any step started does not block: nothing of it ran', async () => {
    const dropped = run({ id: 'r0', resumedFrom: 'r1', state: 'failed', step: null, lastStep: null, startedAt: 1_500 });
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }], list: [[run(), dropped]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1']);
  });
  // The agent lists a resume its chat dropped or refused as a failed run that never started a step.
  it('an accepted Resume whose named run ended before any step started is dropped, not done, and may be sent again', async () => {
    const gone = run({ id: 'r2', resumedFrom: 'r1', state: 'failed', step: null, lastStep: null, startedAt: 3_000 });
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }, { ok: true, body: { run_id: 'r3' } }], list: [[run()], [run(), gone], [run(), gone]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toEqual({ phase: 'refused', kind: 'resume', why: 'dropped' });
    expect(s.fenced('resume')).toBe(false);
    await s.resume(run(), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1', 'resume:s1']);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'none' });
  });
  // Another tab's dropped resume must not lift this one's fence.
  it('a lost Resume is never dropped from the listing: an unstarted run listed may be another tab\'s', async () => {
    const f = fake({ resume: [LOST], list: [[run()], [run(), run({ id: 'r2', resumedFrom: 'r1', state: 'failed', step: null, lastStep: null, startedAt: 3_000 })]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', observed: 'unclear' });
    expect(s.fenced('resume')).toBe(true);
  });
  // After Stop tracking of a Resume with no named run, a run listed later may be that one's.
  it('after Stop tracking of a Resume with no named run, a later lost Resume is never settled by the listing rule', async () => {
    const late = run({ id: 'r2', resumedFrom: 'r1', state: 'failed', step: 'build', startedAt: 3_000 });
    const f = fake({ resume: [LOST, LOST], list: [[run()], [run()], [run(), late]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    s.forget();
    await s.resume(run(), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: false, observed: 'unclear' });
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1', 'resume:s1']);
  });
  it('a named run still settles a Resume after an earlier one was let go without a named run', async () => {
    const mine = run({ id: 'r3', resumedFrom: 'r1', state: 'running', finishedAt: null, step: 'build', startedAt: 3_000 });
    const f = fake({ resume: [LOST, { ok: true, body: { run_id: 'r3' } }], list: [[run()], [run()], [run(), mine]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    s.forget();
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'resume', found: 'r3' });
  });
  // A run named by an earlier Resume of this store is never taken for this Resume's run.
  it('an answer naming the run an earlier Resume of this store named is not taken as this one\'s run', async () => {
    const first = run({ id: 'r2', resumedFrom: 'r1', state: 'running', finishedAt: null, step: 'build', startedAt: 3_000 });
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }, { ok: true, body: { run_id: 'r2' } }], list: [[run()], [run()], [run()], [run(), first]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    s.forget();
    await s.resume(run(), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'none' });
  });
  it('a named run that is listed as resumed from another run does not settle this Resume', async () => {
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }], list: [[run()], [run(), run({ id: 'r2', resumedFrom: 'zz', state: 'running', finishedAt: null, step: 'build' })]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'none' });
  });
  // "Check again" has an end for a named run that is never listed.
  it('a named run still unlisted CHILD_MISSING_MS after the answer is said as most likely never started, still fenced', async () => {
    let now = 1_000;
    const f = fake({ list: [[run()], [run()], [run()]] });
    const s = createActionStore(f.api, () => now);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'none' });
    now += CHILD_MISSING_MS;
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'none' });
    now += 1;
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: true, observed: 'missing' });
    expect(s.fenced('resume')).toBe(true);
  });
  // The hold handed to the page knows the runs the store's own pre-send read listed.
  it('known(): the runs resumed from it that the read before the send listed, and runs earlier Resumes here named', async () => {
    const old = run({ id: 'r0', resumedFrom: 'r1', state: 'failed', startedAt: 1_500 });
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }, LOST], list: [[run(), old], [run(), old], [run(), old]] });
    const s = createActionStore(f.api);
    expect(s.known()).toEqual([]);
    await s.resume(run(), CTX);
    expect(s.known()).toEqual(['r0']);
    s.forget();
    await s.resume(run(), CTX);
    expect([...s.known()].sort()).toEqual(['r0', 'r2']);
  });
  // Each attempt gets its own snapshot right before its send, before its answer names its run.
  it('sending: called once right before the send with that attempt\'s known runs; never its own run', async () => {
    const old = run({ id: 'r0', resumedFrom: 'r1', state: 'failed', startedAt: 1_500 });
    const f = fake({ resume: [{ ok: true, body: { run_id: 'r2' } }, { ok: true, body: { run_id: 'r3' } }], list: [[run(), old], [run(), old], [run(), old], [run(), old]] });
    const s = createActionStore(f.api);
    const got: Array<readonly string[]> = [];
    const at: string[][] = [];
    await s.resume(run(), CTX, { sending: (k) => { got.push(k); at.push([...f.sent]); } });
    s.forget();
    await s.resume(run(), CTX, { sending: (k) => { got.push(k); at.push([...f.sent]); } });
    expect(got.map((k) => [...k].sort())).toEqual([['r0'], ['r0', 'r2']]);
    expect(at).toEqual([['list'], ['list', 'resume:s1', 'list', 'list']]);
    const z: unknown[] = [];
    await createActionStore(fake({ list: [null] }).api).resume(run(), CTX, { sending: (k) => z.push(k) });
    expect(z).toEqual([]);
  });
  it('a Resume whose first read of the runs fails sends nothing', async () => {
    const f = fake({ list: [null] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(f.sent).toEqual(['list']);
    expect(s.view()).toMatchObject({ phase: 'refused', kind: 'resume', why: 'unread' });
    expect(s.fenced('resume')).toBe(false);
  });
  it('a busy or gone chat, a spending limit and another refusal are named; nothing ran', async () => {
    for (const [code, status, why] of [['session_busy', 409, 'busy'], ['not_found', 404, 'gone'], ['spend_cap', 409, 'spendCap'], ['approval_policy_unsatisfiable', 409, 'policy'], ['bad_request', 400, 'refused']] as const) {
      const s = createActionStore(fake({ resume: [{ ok: false, err: { kind: 'failed', code, status } }] }).api);
      await s.resume(run(), CTX);
      expect(s.view()).toMatchObject({ phase: 'refused', kind: 'resume', why });
    }
  });
  it('Resume first holds the run\'s chat open: held sends; a closed chat or one that cannot be held sends nothing', async () => {
    for (const [hold, sent, why] of [['held', 1, null], ['gone', 0, 'gone'], ['failed', 0, 'unheld']] as const) {
      const f = fake();
      const s = createActionStore(f.api);
      await s.resume(run(), CTX, { ready: async () => hold });
      expect(f.sent.filter((x) => x.startsWith('resume'))).toHaveLength(sent);
      expect(s.view()).toMatchObject(why ? { phase: 'refused', why } : { phase: 'unsure', accepted: true });
    }
  });
  it('a lost resume is unsure and never resent; Check again only reads the listing and says a resume is listed', async () => {
    const f = fake({ resume: [LOST], list: [[run()], [run()], [run(), run({ id: 'r2', resumedFrom: 'r1', state: 'running', finishedAt: null })]] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume' });
    await s.resume(run(), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'none' });
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', observed: 'unclear' });
    expect(f.sent.filter((x) => x.startsWith('resume'))).toHaveLength(1);
  });
  it('a lost cancel is unsure; Check again reads the run state: cancelled is done, still running stays unsure', async () => {
    const f = fake({ cancel: [LOST], list: [[run({ state: 'running', finishedAt: null })], [run({ state: 'cancelled' })]] });
    const s = createActionStore(f.api);
    await s.cancel(run({ state: 'running', finishedAt: null }), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'cancel', observed: 'running' });
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'cancel' });
    expect(f.sent.filter((x) => x === 'cancel')).toHaveLength(1);
  });
  it('a lost cancel whose run then reads completed or failed is ended as that state, never claimed cancelled', async () => {
    for (const state of ['completed', 'failed'] as const) {
      const f = fake({ cancel: [LOST], list: [[run({ state })]] });
      const s = createActionStore(f.api);
      await s.cancel(run({ state: 'running', finishedAt: null }), CTX);
      await s.check(CTX);
      expect(s.view()).toEqual({ phase: 'ended', kind: 'cancel', state });
    }
  });
  it('a lost cancel whose run is no longer listed stays unsure (not found), never done', async () => {
    const f = fake({ cancel: [LOST], list: [[]] });
    const s = createActionStore(f.api);
    await s.cancel(run({ state: 'running', finishedAt: null }), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'cancel', observed: 'none' });
  });
  it('a check that cannot read says so; Stop tracking forgets; a call never sent allows another', async () => {
    const f = fake({ resume: [LOST, { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }], list: [[], null] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    await s.check(CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'failed' });
    expect(s.fenced('resume')).toBe(true);
    s.forget();
    expect(s.fenced('resume')).toBe(false);
    expect(s.view().phase).toBe('idle');
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'refused', why: 'notSent' });
    await s.resume(run(), CTX);
    expect(f.sent.filter((x) => x.startsWith('resume'))).toHaveLength(3);
  });
});

// The agent's own lineage fence: it refuses, before anything starts, a Resume of
// a run that a newer run of the same original run supersedes (409 resume_superseded, details.resume_run_id names the run to
// resume instead) and one whose history it could not read (503 resume_lineage_unknown).
describe('the agent refuses a Resume by the run\'s lineage', () => {
  it('the route declares both codes, so core reads them as refusals made before anything started', () => {
    expect(actionRoutes.resume.refuses).toEqual(expect.arrayContaining(['resume_superseded', 'resume_lineage_unknown']));
  });
  it('the wire parser keeps the refusal, its proof and the run named instead (a plain id only)', async () => {
    const thrown = (o: Record<string, unknown>) => { H.api = async () => { throw o; }; return runActionApi('global').resume('r1', 's1', CTX); };
    try {
      expect(await thrown({ kind: 'refused', status: 409, code: 'resume_superseded', notApplied: true, details: { resume_run_id: 'r7' } }))
        .toEqual({ ok: false, err: { kind: 'failed', code: 'resume_superseded', status: 409, notApplied: true, instead: 'r7' } });
      for (const bad of [7, '', ' r7', 'a b', 'x'.repeat(200), 'r1', null]) {
        const r = await thrown({ kind: 'refused', status: 409, code: 'resume_superseded', notApplied: true, details: { resume_run_id: bad } });
        expect(r.ok === false && 'instead' in r.err).toBe(false);
      }
      // Another code never carries a run to resume instead.
      const busy = await thrown({ kind: 'refused', status: 409, code: 'session_busy', notApplied: true, details: { resume_run_id: 'r7' } });
      expect(busy.ok === false && 'instead' in busy.err).toBe(false);
      expect(await thrown({ kind: 'unavailable', status: 503, code: 'resume_lineage_unknown', notApplied: true }))
        .toEqual({ ok: false, err: { kind: 'failed', code: 'resume_lineage_unknown', status: 503, notApplied: true } });
    } finally {
      H.api = null;
    }
  });
  it('superseded: nothing started, the newer run is named, and this run is not offered again from here', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'resume_superseded', status: 409, notApplied: true, instead: 'r7' } }] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toEqual({ phase: 'refused', kind: 'resume', why: 'superseded', instead: 'r7' });
    expect(s.fenced('resume')).toBe(true);
    s.clear();
    await s.resume(run(), CTX);
    expect(f.sent.filter((x) => x !== 'list')).toEqual(['resume:s1']);
  });
  it('superseded with no run named still says so', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'resume_superseded', status: 409, notApplied: true } }] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toEqual({ phase: 'refused', kind: 'resume', why: 'superseded' });
  });
  it('history unreadable (503 the agent proved changed nothing): refused, not unsure, and may be sent again', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'resume_lineage_unknown', status: 503, notApplied: true } }] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toEqual({ phase: 'refused', kind: 'resume', why: 'lineage' });
    expect(s.fenced('resume')).toBe(false);
  });
  it('a 503 with that code but without the proof stays unsure and fenced', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'resume_lineage_unknown', status: 503 } }] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume', accepted: false });
    expect(s.fenced('resume')).toBe(true);
  });
  it('a lost answer carrying the code is still unsure', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'pending', code: 'resume_superseded', status: 409 } }] });
    const s = createActionStore(f.api);
    await s.resume(run(), CTX);
    expect(s.view()).toMatchObject({ phase: 'unsure', kind: 'resume' });
  });
});

// The Runs list's row menu and the run's detail ask the same question of the run's store.
describe('storeOffers: whether a run\'s store still lets an action be offered', () => {
  it('no store yet offers; an accepted, unsure, settled or fenced action is not offered; a plain refusal is', async () => {
    expect(storeOffers(undefined, 'resume')).toBe(true);
    const child = run({ id: 'r2', resumedFrom: 'r1', state: 'failed', step: 'build' });
    const done = createActionStore(fake({ list: [[run()], [run(), child]] }).api);
    await done.resume(run(), CTX);
    expect(storeOffers(done, 'resume')).toBe(false);
    done.clear();
    // Its message dismissed: the fence alone keeps it from being offered on a stale row.
    expect(done.view()).toEqual({ phase: 'idle' });
    expect(storeOffers(done, 'resume')).toBe(false);
    expect(storeOffers(done, 'cancel')).toBe(true);
    const lost = createActionStore(fake({ resume: [LOST] }).api);
    await lost.resume(run(), CTX);
    expect(storeOffers(lost, 'resume')).toBe(false);
    expect(storeOffers(lost, 'cancel')).toBe(false);
    lost.forget();
    expect(storeOffers(lost, 'resume')).toBe(true);
    const busy = createActionStore(fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } }] }).api);
    await busy.resume(run(), CTX);
    expect(storeOffers(busy, 'resume')).toBe(true);
  });
});
