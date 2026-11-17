// Run detail (money may be spent): the run's steps from getWorkflowRun; Cancel (running) and Resume (failed or cancelled, not
// yet resumed) behind a confirm, each sent once; a lost answer is never resent and Check again only reads; a lost Cancel
// of a run that finished another way says how it finished and never "cancelled"; Resume first holds the run's own chat
// open; a page that moved to another realm sends nothing.
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a router harness for the kit's links and action bars, not page code (as workflows.test.tsx)
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import type { Ctx } from '@core';
import { setRealm } from '@core/ctx';
import { boot, R1, R2 } from '@core/test/env';
import type { Run, RunDetail as Detail, RunState } from './runs';
import type { ActionApi, ActionSettled } from './runActions';
import { actionStoreFor, resetActionStores, rowMenuKinds, RunDetail } from './Runs';
import { resetResumeHolds, resumeHoldKeys, useRunLeases } from './runsData';
import strings from './Runs.strings.en.json';

const words = (k: keyof typeof strings, v: Record<string, string | number> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));

// A named run that is never listed did not start (a dropped resume
// is listed, failed with no step), and lifting the fence is only for someone sure nothing ran: a second Resume is paid.
describe('the never-listed words', () => {
  it('say the run most likely never started and lift the fence only when sure nothing ran', () => {
    expect(strings['seen.missing']).toContain('most likely never started');
    expect(strings['seen.missing']).not.toMatch(/dropped/);
    expect(strings['seen.missing']).toContain('If you are sure nothing ran, Stop tracking');
  });
});

const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
type LeasePhase = ReturnType<LeaseManager['state']>['phase'];
// The kit's links and action bars read the router: each render is inside one.
const inRouter = (el: ReactElement) => render(<RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => el }), history: createMemoryHistory({ initialEntries: ['/'] }) }) as never} />);
const LOST: ActionSettled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };

const run = (o: Partial<Run> = {}): Run => ({
  id: 'run-1', workflow: 'deploy', sid: 's-1', realm: 'global', state: 'running', step: 'build', startedAt: 1_700_000_000_000,
  finishedAt: null, cost: 0.5, error: null, lastStep: null, resumedFrom: null, cwd: null, ...o,
});
const detail = (r: Run): Detail => ({
  run: r,
  steps: [
    { id: 'fetch', ok: true, timedOut: false, ms: 1200, inTok: 300, outTok: 40, error: null },
    { id: 'build', ok: false, timedOut: false, ms: 900, inTok: null, outTok: null, error: 'exit 1' },
  ],
});

// `lists`: the listings read in turn (the last repeats); `runs`: one listing every time.
function fake(o: { cancel?: ActionSettled[]; resume?: ActionSettled[]; runs?: Run[]; lists?: Run[][]; get?: Detail | 'gone' | null } = {}) {
  const sent = { cancels: [] as string[], resumes: [] as Array<[string, string]>, lists: 0, gets: 0 };
  const make = (): ActionApi => ({
    cancel: async (id, ctx: Ctx | null) => { if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }; sent.cancels.push(id); return o.cancel?.shift() ?? { ok: true, body: {} }; },
    resume: async (id, sid, ctx) => { if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }; sent.resumes.push([id, sid]); return o.resume?.shift() ?? { ok: true, body: { status: 'ok', run_id: 'run-2' } }; },
    list: async (ctx) => { if (!ctx) return null; sent.lists++; return o.lists ? (o.lists.length > 1 ? o.lists.shift()! : o.lists[0] ?? []) : o.runs ?? []; },
    get: async (id, ctx) => { if (!ctx) return null; sent.gets++; return o.get === undefined ? detail(run({ id })) : o.get; },
  });
  return { sent, make };
}

// A lease manager whose chat ends in `phase` once ensured (`during`: runs while the hold is being taken).
function leaseFake(phase: LeasePhase = 'held', during?: () => void) {
  const tracked: Array<{ ref: LeaseRef; need: unknown; closed: boolean }> = [];
  const mgr = {
    track(ref: LeaseRef, need?: unknown): LeaseHandle {
      const t = { ref, need, closed: false };
      tracked.push(t);
      return { set() {}, close() { t.closed = true; } };
    },
    ensure: async () => { during?.(); },
    state: () => ({ phase }),
  } as unknown as LeaseManager;
  return { mgr, tracked };
}

// Where a Resume's hold was handed (the page's keeper in production, runsData.ts adoptResumeHold).
type Adopted = Array<{ sid: string; from: string; h: LeaseHandle; known: readonly string[] }>;
function show(r: Run, f: ReturnType<typeof fake>, l = leaseFake(), runs: Run[] = [r], adopted: Adopted = []) {
  return inRouter(<RunDetail run={r} runs={runs} makeApi={f.make} manager={l.mgr} adopt={(ref, from, h, known = []) => { adopted.push({ sid: ref.sid, from, h, known }); }} chatHref={(sid, realm) => `/chat/${realm}/${sid}`} />);
}
const button = (name: string) => screen.queryByRole('button', { name });
const confirm = (name: string) => {
  fireEvent.click(button(name)!);
  const dialog = screen.getByRole('alertdialog');
  const go = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === name);
  fireEvent.click(go!);
};

beforeEach(() => { boot({ realm: R1 }); resetActionStores(); resetResumeHolds(); });
afterEach(cleanup);

describe('run detail', () => {
  it('lists the steps the agent keeps for the run, with their result, tokens and error', async () => {
    const f = fake();
    show(run(), f);
    await settle();
    expect(f.sent.gets).toBe(1);
    expect(screen.getByText('fetch')).toBeTruthy();
    expect(screen.getByText(words('step.ok'))).toBeTruthy();
    expect(screen.getByText(words('step.failed'))).toBeTruthy();
    expect(screen.getByText(words('step.tokens', { in: 300, out: 40 }))).toBeTruthy();
    expect(screen.getByText('exit 1')).toBeTruthy();
  });
  it('a run the agent no longer keeps says so; the listing row stays', async () => {
    show(run(), fake({ get: 'gone' }));
    await settle();
    expect(screen.getByText(words('steps.gone'))).toBeTruthy();
    expect(screen.getByText('deploy')).toBeTruthy();
  });
});

describe('Cancel', () => {
  it('is offered for a running run only, asks first, is sent once, and says cancelled once the run reads cancelled', async () => {
    const f = fake({ runs: [run({ state: 'cancelled' })] });
    show(run(), f);
    await settle();
    expect(button(words('act.resume'))).toBeNull();
    fireEvent.click(button(words('act.cancel'))!);
    expect(screen.getByText(words('cancel.body'))).toBeTruthy();
    expect(f.sent.cancels).toHaveLength(0);
    const go = Array.from(screen.getByRole('alertdialog').querySelectorAll('button')).find((b) => b.textContent === words('cancel.confirm'));
    fireEvent.click(go!);
    await settle();
    expect(f.sent.cancels).toEqual(['run-1']);
    expect(f.sent.lists).toBe(1);
    expect(screen.getByText(words('out.cancel.done'))).toBeTruthy();
  });
  it('accepted while the run still reads running: not called cancelled and not offered again; Stop tracking offers it again', async () => {
    const f = fake({ runs: [run()] });
    show(run(), f);
    await settle();
    confirm(words('act.cancel'));
    await settle();
    expect(screen.getByText(words('out.cancel.accepted'))).toBeTruthy();
    expect(screen.getByText(words('seen.running'))).toBeTruthy();
    expect(screen.queryByText(words('out.cancel.done'))).toBeNull();
    expect(button(words('act.cancel'))).toBeNull();
    // Stop tracking asks first: nothing is forgotten until the question is confirmed.
    fireEvent.click(screen.getByRole('button', { name: words('forget') }));
    await settle();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(button(words('act.cancel'))).toBeNull();
    fireEvent.click(Array.from(screen.getByRole('alertdialog').querySelectorAll('button')).find((b) => b.textContent === words('forgetGo'))!);
    await settle();
    expect(button(words('act.cancel'))).not.toBeNull();
    expect(f.sent.cancels).toHaveLength(1);
  });
  it('a finished run offers no Cancel', async () => {
    show(run({ state: 'completed', finishedAt: 1_700_000_100_000 }), fake());
    await settle();
    expect(button(words('act.cancel'))).toBeNull();
  });
  it('a lost answer is unsure, is not offered again, and Check again only reads: still running', async () => {
    const f = fake({ cancel: [LOST], runs: [run()] });
    show(run(), f);
    await settle();
    confirm(words('act.cancel'));
    await settle();
    expect(screen.getByText(words('out.cancel.unsure'))).toBeTruthy();
    expect(button(words('act.cancel'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    await settle();
    expect(f.sent.lists).toBe(1);
    expect(f.sent.cancels).toHaveLength(1);
    expect(screen.getByText(words('seen.running'))).toBeTruthy();
  });
  it.each<[RunState, keyof typeof strings]>([['completed', 'out.ended.completed'], ['failed', 'out.ended.failed']])(
    'a lost answer then the run reads %s: it says how it finished and never that it was cancelled', async (state, key) => {
      const f = fake({ cancel: [LOST], runs: [run({ state })] });
      show(run(), f);
      await settle();
      confirm(words('act.cancel'));
      await settle();
      fireEvent.click(screen.getByRole('button', { name: /check again/i }));
      await settle();
      expect(screen.getByText(words(key))).toBeTruthy();
      expect(screen.queryByText(words('out.cancel.done'))).toBeNull();
    },
  );
  it('a lost answer then the run reads cancelled: cancelled', async () => {
    const f = fake({ cancel: [LOST], runs: [run({ state: 'cancelled' })] });
    show(run(), f);
    await settle();
    confirm(words('act.cancel'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    await settle();
    expect(screen.getByText(words('out.cancel.done'))).toBeTruthy();
  });
});

describe('Resume', () => {
  const failed = run({ state: 'failed', finishedAt: 1_700_000_100_000, error: 'exit 1' });
  it('holds the run\'s own chat open, then resumes the run there once; resumed once its new run is listed', async () => {
    const f = fake({ lists: [[failed], [failed, run({ id: 'run-2', resumedFrom: 'run-1' })]] });
    const l = leaseFake('held');
    show(failed, f, l);
    await settle();
    expect(button(words('act.cancel'))).toBeNull();
    confirm(words('act.resume'));
    await settle();
    expect(l.tracked.map((x) => [x.ref.sid, x.ref.realm, x.need])).toEqual([['s-1', 'global', { pinned: true }]]);
    expect(f.sent.resumes).toEqual([['run-1', 's-1']]);
    expect(screen.getByText(words('out.resume.done'))).toBeTruthy();
  });
  it('an accepted resume whose new run is not listed yet is not called resumed', async () => {
    const f = fake({ lists: [[failed]] });
    show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(screen.getByText(words('out.resume.accepted'))).toBeTruthy();
    // Stop tracking is offered here too: its words warn that a new Resume may be a second paid run.
    expect(screen.getByRole('button', { name: words('forget') })).toBeTruthy();
    expect(words('out.resume.accepted')).toMatch(/Stop tracking.*second paid run/);
    expect(screen.queryByText(words('out.resume.done'))).toBeNull();
    expect(button(words('act.resume'))).toBeNull();
  });
  it('a resume that went is not offered again after its message is dismissed (the listing still shows the old row)', async () => {
    const f = fake({ lists: [[failed], [failed, run({ id: 'run-2', resumedFrom: 'run-1' })]] });
    show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    await settle();
    expect(button(words('act.resume'))).toBeNull();
    expect(f.sent.resumes).toHaveLength(1);
  });
  it('the page moves while the chat is being held: nothing is sent', async () => {
    const f = fake();
    inRouter(<RunDetail run={{ ...failed, realm: R1 }} runs={[]} makeApi={f.make} manager={leaseFake('held', () => setRealm(R2)).mgr} />);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(f.sent.resumes).toHaveLength(0);
  });
  it('a hold that did not take, or whose resume was refused, ends at once', async () => {
    const l = leaseFake('failing');
    show(failed, fake(), l);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(l.tracked.map((x) => x.closed)).toEqual([true]);
    cleanup();
    resetActionStores();
    const l2 = leaseFake('held');
    show(failed, fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } }] }), l2);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(l2.tracked.map((x) => x.closed)).toEqual([true]);
    // The busy chat is offered beside the refusal (and in the facts).
    expect(screen.getAllByRole('link', { name: words('chat') }).map((x) => x.getAttribute('href'))).toEqual(['/chat/global/s-1', '/chat/global/s-1']);
  });
  it('a chat that is closed or cannot be held sends nothing and says so', async () => {
    const f = fake();
    show(failed, f, leaseFake('gone'));
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(f.sent.resumes).toHaveLength(0);
    expect(screen.getByText(words('out.resume.gone'))).toBeTruthy();
    cleanup();
    resetActionStores();
    show(failed, f, leaseFake('failing'));
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(f.sent.resumes).toHaveLength(0);
    expect(screen.getByText(words('out.unheld'))).toBeTruthy();
  });
  it('a run already resumed is not offered again', async () => {
    show(failed, fake(), leaseFake(), [failed, run({ id: 'run-2', resumedFrom: 'run-1' })]);
    await settle();
    expect(button(words('act.resume'))).toBeNull();
  });
  it.each<[ActionSettled, keyof typeof strings]>([
    [{ ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } }, 'out.busy'],
    [{ ok: false, err: { kind: 'failed', code: 'spend_cap', status: 409 } }, 'out.spendCap'],
    [{ ok: false, err: { kind: 'failed', code: 'approval_policy_unsatisfiable', status: 409 } }, 'out.policy'],
    [{ ok: false, err: { kind: 'failed', code: 'forbidden', status: 403 } }, 'out.refused.resume'],
  ])('a refusal is named and nothing is resent: %j', async (answer, key) => {
    const f = fake({ resume: [answer] });
    show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(screen.getByText(words(key))).toBeTruthy();
    expect(f.sent.resumes).toHaveLength(1);
  });
  it('the spending-limit words also cover a spending-limit file the agent cannot read', () => {
    expect(words('out.spendCap')).toMatch(/file/);
  });
  it('a lost answer is unsure: Resume is not offered again and Check again says a resumed run is listed, never done', async () => {
    const f = fake({ resume: [LOST], lists: [[failed], [failed, run({ id: 'run-2', resumedFrom: 'run-1' })]] });
    show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(screen.getByText(words('out.resume.unsure'))).toBeTruthy();
    expect(button(words('act.resume'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    await settle();
    expect(f.sent.resumes).toHaveLength(1);
    expect(screen.getByText(words('seen.unclear'))).toBeTruthy();
    expect(screen.queryByText(words('out.resume.done'))).toBeNull();
  });
  it('reopened, an unsure resume is still unsure: no second resume', async () => {
    const f = fake({ resume: [LOST] });
    const r = show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    r.unmount();
    show(failed, f);
    await settle();
    expect(screen.getByText(words('out.resume.unsure'))).toBeTruthy();
    expect(button(words('act.resume'))).toBeNull();
    expect(f.sent.resumes).toHaveLength(1);
  });
  it('the page moved to another realm: no action is offered and nothing is sent', async () => {
    const f = fake();
    inRouter(<RunDetail run={{ ...failed, realm: R1 }} runs={[]} makeApi={f.make} manager={leaseFake().mgr} />);
    await settle();
    act(() => setRealm(R2));
    await settle();
    expect(button(words('act.resume'))).toBeNull();
    expect(screen.getByText(words('moved'))).toBeTruthy();
    expect(f.sent.resumes).toHaveLength(0);
  });
});

// The Resume's hold goes to the page, never ends on a timer.
describe('Resume hold handoff', () => {
  const failed = run({ state: 'failed', finishedAt: 1_700_000_100_000, error: 'exit 1' });
  it('a Resume that went hands its hold to the page and does not close it, then or when the detail closes', async () => {
    const l = leaseFake('held');
    const adopted: Adopted = [];
    const r = show(failed, fake({ lists: [[failed], [failed, run({ id: 'run-2', resumedFrom: 'run-1' })]] }), l, [failed], adopted);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(adopted.map((x) => [x.sid, x.from])).toEqual([['s-1', 'run-1']]);
    r.unmount();
    await settle();
    expect(l.tracked.map((x) => x.closed)).toEqual([false]);
    expect(adopted).toHaveLength(1);
  });
  it('a refused Resume hands nothing over and closes its hold', async () => {
    const l = leaseFake('held');
    const adopted: Adopted = [];
    show(failed, fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } }] }), l, [failed], adopted);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(adopted).toHaveLength(0);
    expect(l.tracked.map((x) => x.closed)).toEqual([true]);
  });
  // the runs already resumed from it are handed over with the hold, so they never stand for this Resume.
  it('hands over the runs already resumed from it (an earlier Resume\'s, ended) with the hold', async () => {
    const adopted: Adopted = [];
    // An earlier resume its chat dropped before any step started: Resume is still offered.
    const earlier = run({ id: 'run-0', resumedFrom: 'run-1', state: 'failed', step: null, finishedAt: 1_700_000_050_000 });
    show(failed, fake({ lists: [[failed, earlier]] }), leaseFake('held'), [failed, earlier], adopted);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(adopted.map((x) => x.known)).toEqual([['run-0']]);
  });
  // the store's own read right before the send seeds `known` too.
  it('hands over the runs its own read before the send listed, even ones the detail\'s listing did not show yet', async () => {
    const adopted: Adopted = [];
    const fresh = run({ id: 'run-0', resumedFrom: 'run-1', state: 'failed', step: null, finishedAt: 1_700_000_050_000 });
    show(failed, fake({ lists: [[failed, fresh]] }), leaseFake('held'), [failed], adopted);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(adopted.map((x) => x.known)).toEqual([['run-0']]);
  });
  // a refused retry takes back its own hold only, never an earlier Resume's that the page keeps.
  it('after Stop tracking, a refused retry closes its own hold and leaves the earlier Resume\'s hold with the page', async () => {
    const l = leaseFake('held');
    renderHook(() => useRunLeases([failed], l.mgr));
    const f = fake({ lists: [[failed]], resume: [{ ok: true, body: {} }, { ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } }] });
    inRouter(<RunDetail run={failed} runs={[failed]} makeApi={f.make} manager={l.mgr} />);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(screen.getByText(words('out.resume.accepted'))).toBeTruthy();
    expect(resumeHoldKeys()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: words('forget') }));
    fireEvent.click(Array.from(screen.getByRole('alertdialog').querySelectorAll('button')).find((b) => b.textContent === words('forgetGo'))!);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(f.sent.resumes).toHaveLength(2);
    expect(screen.getByText(words('out.busy'))).toBeTruthy();
    expect(l.tracked.map((x) => x.closed)).toEqual([false, true]);
    expect(resumeHoldKeys()).toHaveLength(1);
  });
});

// The Runs list's row menu: its listing may be older than the run's store (an accepted or unsure Resume, a Cancel).
describe('the row menu of the Runs list', () => {
  const failed = run({ state: 'failed', finishedAt: 1_700_000_100_000 });
  it('offers Cancel run for a running run and Resume for a resumable one', () => {
    expect(rowMenuKinds(run(), [run()], 'scope')).toEqual(['cancel']);
    expect(rowMenuKinds(failed, [failed], 'scope')).toEqual(['resume']);
    expect(rowMenuKinds(run({ state: 'completed', finishedAt: 1_700_000_100_000 }), [], 'scope')).toEqual([]);
  });
  it('hides Resume once that run\'s store is fenced, also while the listing still shows the old row', async () => {
    const f = fake({ lists: [[failed], [failed, run({ id: 'run-2', resumedFrom: 'run-1', state: 'running', step: 'build' })]] });
    const s = actionStoreFor('scope', failed, f.make);
    await s.resume(failed, {} as Ctx);
    expect(s.fenced('resume')).toBe(true);
    // The stale listing has no resume of it.
    expect(rowMenuKinds(failed, [failed], 'scope')).toEqual([]);
    // Another place's store of the same run id is its own.
    expect(rowMenuKinds(failed, [failed], 'other')).toEqual(['resume']);
    expect(rowMenuKinds(failed, [failed], null)).toEqual([]);
  });
  it('hides Cancel run while a Cancel of that run is out or unsure', async () => {
    const f = fake({ cancel: [LOST] });
    const s = actionStoreFor('scope', run(), f.make);
    await s.cancel(run(), {} as Ctx);
    expect(rowMenuKinds(run(), [run()], 'scope')).toEqual([]);
    s.forget();
    expect(rowMenuKinds(run(), [run()], 'scope')).toEqual(['cancel']);
  });
  it('asking the menu never makes a store', async () => {
    rowMenuKinds(failed, [failed], 'scope');
    const f = fake({ runs: [failed] });
    // The first store made for the run is the detail's, with the detail's calls: the menu left none behind.
    await actionStoreFor('scope', failed, f.make).resume(failed, {} as Ctx);
    expect(f.sent.resumes).toHaveLength(1);
  });
});

describe('the agent\'s lineage refusals in the run detail', () => {
  const failed = run({ state: 'failed', finishedAt: 1_700_000_100_000 });
  it('superseded: says nothing started, links the newer run, and offers Resume no more', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'resume_superseded', status: 409, notApplied: true, instead: 'run-9' } }] });
    show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(screen.getByText(words('out.superseded'))).toBeTruthy();
    const link = screen.getByRole('link', { name: words('out.superseded.open') });
    expect(link.getAttribute('href')).toContain('runsel=run-9');
    expect(button(words('act.resume'))).toBeNull();
    expect(f.sent.resumes).toHaveLength(1);
  });
  it('history unreadable: says nothing started and to try again; Resume stays offered', async () => {
    const f = fake({ resume: [{ ok: false, err: { kind: 'failed', code: 'resume_lineage_unknown', status: 503, notApplied: true } }] });
    show(failed, f);
    await settle();
    confirm(words('act.resume'));
    await settle();
    expect(screen.getByText(words('out.lineage'))).toBeTruthy();
    expect(button(words('act.resume'))).toBeTruthy();
  });
});
