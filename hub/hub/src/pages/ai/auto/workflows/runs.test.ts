// The run parser and the pin rule: real agent shapes (its run row fields plus
// the realm the gateway stamps), one malformed row per field the parser reads, and the contradictions.
import { describe, expect, it } from 'vitest';
import { anyRunning, cutShort, ERROR_MAX, parseRun, parseRunDetail, parseRuns, PIN_CAP, pinsOf, resumable, runsOf, unstarted, type Run } from './runs';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const T0 = '2026-11-02T10:00:00.000000Z';
const T1 = '2026-11-02T10:05:00Z';

/** A running run exactly as GET /workflows/runs sends it for the global realm (realm_id omitted when empty, realm stamped). */
const row = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  run_id: 'run-1', workflow_name: 'release', session_id: 'sess-1', started_at: T0, current_step: 'build', current_idx: 2, total_steps: 5,
  status: 'running', realm: 'global', ...o,
});
const list = (items: unknown[], meta: Record<string, unknown> = { total: items.length }) => ({ items, meta });

describe('parseRun: a typed run, or null', () => {
  it('reads a running run of the global realm (realm_id omitted)', () => {
    expect(parseRun(row())).toEqual({
      id: 'run-1', workflow: 'release', sid: 'sess-1', realm: 'global', state: 'running', step: 'build',
      startedAt: Date.parse(T0), finishedAt: null, cost: null, error: null, lastStep: null, resumedFrom: null, cwd: null,
    });
  });
  it('reads a failed run of a realm with every optional field', () => {
    const r = parseRun(row({
      status: 'failed', realm: R1, realm_id: R1, finished_at: T1, cost: 0.0123, input_tokens: 10, output_tokens: 2, error: 'boom', last_step: 'test',
      resumed_from: 'run-0', cwd: '/home/user/app', owner_fingerprint: 'abc', computer_binding: 'c1',
    }));
    expect(r).toMatchObject({ state: 'failed', realm: R1, finishedAt: Date.parse(T1), cost: 0.0123, error: 'boom', lastStep: 'test', resumedFrom: 'run-0', cwd: '/home/user/app' });
  });
  it('realm_id "global" and an omitted realm_id both read as the global realm', () => {
    expect(parseRun(row({ realm_id: 'global' }))?.realm).toBe('global');
    expect(parseRun(row())?.realm).toBe('global');
  });
  it('a zero cost is no cost (the agent omits it)', () => {
    expect(parseRun(row({ cost: 0 }))?.cost).toBeNull();
  });
  it('the step and error text is one bounded line without controls', () => {
    const r = parseRun(row({ status: 'failed', finished_at: T1, error: `a\u001b[31m\nb ${'x'.repeat(400)}`, current_step: 'plan‮' }));
    expect(r?.error?.length).toBeLessThanOrEqual(300);
    expect(r?.error).not.toMatch(/[\u0000-\u001f‮]/);
    expect(r?.step).toBe('plan');
  });

  const bad: Array<[string, Record<string, unknown>]> = [
    ['no run_id', { run_id: undefined }],
    ['an empty run_id', { run_id: '' }],
    ['a run_id with a leading space', { run_id: ' run-1' }],
    ['a numeric run_id', { run_id: 7 }],
    ['an overlong run_id', { run_id: 'r'.repeat(129) }],
    ['no workflow_name', { workflow_name: undefined }],
    ['an empty workflow_name', { workflow_name: '' }],
    ['no session_id', { session_id: undefined }],
    ['no realm', { realm: undefined }],
    ['an uppercase realm', { realm: R1.toUpperCase(), realm_id: R1.toUpperCase() }],
    ['a short realm', { realm: 'abc', realm_id: 'abc' }],
    ['no status', { status: undefined }],
    ['a status outside the vocabulary', { status: 'paused' }],
    ['a status in another case', { status: 'Running' }],
    ['no started_at', { started_at: undefined }],
    ['an unreadable started_at', { started_at: 'yesterday' }],
    ['a numeric started_at', { started_at: 1730000000 }],
    ['a non-string finished_at', { status: 'failed', finished_at: 12 }],
    ['an unreadable finished_at', { status: 'failed', finished_at: 'later' }],
    ['no current_idx', { current_idx: undefined }],
    ['a fractional current_idx', { current_idx: 1.5 }],
    ['a negative current_idx', { current_idx: -1 }],
    ['no total_steps', { total_steps: undefined }],
    ['a string total_steps', { total_steps: '5' }],
    ['a null cost', { cost: null }],
    ['a negative cost', { cost: -1 }],
    ['a string cost', { cost: '1.5' }],
    ['a fractional input_tokens', { input_tokens: 1.5 }],
    ['a string output_tokens', { output_tokens: '2' }],
    ['a non-string error', { error: 5 }],
    ['a non-string current_step', { current_step: 3 }],
    ['a non-string last_step', { last_step: {} }],
    ['a non-string cwd', { cwd: [] }],
    ['an empty resumed_from', { resumed_from: '' }],
    ['a non-string resumed_from', { resumed_from: 4 }],
    ['a non-string realm_id', { realm_id: 9 }],
  ];
  for (const [what, o] of bad) {
    it(`malformed: ${what} → null`, () => {
      expect(parseRun(row(o))).toBeNull();
    });
  }

  const contradictions: Array<[string, Record<string, unknown>]> = [
    ['a running run with a finish time', { finished_at: T1 }],
    ['a finish time before the start', { status: 'completed', finished_at: '2026-11-02T09:00:00Z' }],
    ['realm_id naming another realm than the stamped one', { realm: R1, realm_id: 'bbbbbbbbbbbbbbbbbbbbbbb2' }],
    ['a realm that is not global with no realm_id', { realm: R1 }],
    ['an empty realm_id with a realm', { realm: R1, realm_id: '' }],
    ['a run that resumed itself', { resumed_from: 'run-1' }],
  ];
  for (const [what, o] of contradictions) {
    it(`contradiction: ${what} → null`, () => {
      expect(parseRun(row(o))).toBeNull();
    });
  }

  it('a row that is not an object → null', () => {
    for (const x of [null, undefined, 'run', 3, [], [row()]]) expect(parseRun(x)).toBeNull();
  });
  it('current_idx and total_steps are not a position: an index past the total is a loop, not a contradiction', () => {
    expect(parseRun(row({ current_idx: 9, total_steps: 5 }))).not.toBeNull();
  });
});

describe('parseRuns: the whole listing', () => {
  it('lists newest first (the agent sends oldest first); equal start times keep the agent order reversed', () => {
    const a = row({ run_id: 'a', started_at: '2026-11-02T10:00:00Z' });
    const b = row({ run_id: 'b', started_at: '2026-11-02T11:00:00Z' });
    const c = row({ run_id: 'c', started_at: '2026-11-02T10:00:00Z' });
    expect(parseRuns(list([a, b, c])).runs.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('counts a row it cannot read and keeps the others', () => {
    const l = parseRuns(list([row({ run_id: 'a' }), row({ run_id: 'b', status: 'paused' }), 'junk']));
    expect(l.runs.map((r) => r.id)).toEqual(['a']);
    expect(l.skipped).toBe(2);
  });
  it('two rows sharing a run id are both dropped: neither is trusted', () => {
    const l = parseRuns(list([row({ run_id: 'a' }), row({ run_id: 'a', status: 'completed', finished_at: T1 }), row({ run_id: 'b' })]));
    expect(l.runs.map((r) => r.id)).toEqual(['b']);
    expect(l.skipped).toBe(2);
  });
  it('an empty listing is no runs', () => {
    expect(parseRuns(list([]))).toEqual({ runs: [], skipped: 0 });
  });
  const unreadable: Array<[string, unknown]> = [
    ['not an object', 'runs'],
    ['no items', { meta: { total: 0 } }],
    ['items not an array', { items: {}, meta: { total: 0 } }],
    ['no meta', { items: [] }],
    ['a total that is not the item count', list([row()], { total: 3 })],
    ['a page window (not the whole listing)', list([row()], { total: 1, page: 1, limit: 50 })],
    ['a limit', list([row()], { total: 1, limit: 50 })],
    ['a null body', null],
  ];
  for (const [what, raw] of unreadable) {
    it(`unreadable: ${what} throws, it never reads as no runs`, () => {
      expect(() => parseRuns(raw)).toThrow();
    });
  }
});

const run = (o: Partial<Run> & { id: string }): Run => ({
  workflow: 'release', sid: `s-${o.id}`, realm: 'global', state: 'running', step: null, startedAt: 0, finishedAt: null, cost: null, error: null,
  lastStep: null, resumedFrom: null, cwd: null, ...o,
});

describe('pinsOf: which running runs keep their chat open', () => {
  it('pins only running runs, in the order given (newest first)', () => {
    const runs = [run({ id: 'a' }), run({ id: 'b', state: 'completed' }), run({ id: 'c', state: 'failed' }), run({ id: 'd', state: 'cancelled' }), run({ id: 'e' })];
    expect(pinsOf(runs)).toEqual({ pinned: [runs[0], runs[4]], beyond: 0 });
  });
  it(`pins at most ${PIN_CAP} and counts the rest as beyond`, () => {
    const runs = Array.from({ length: 11 }, (_, i) => run({ id: `r${i}` }));
    const p = pinsOf(runs);
    expect(p.pinned.map((r) => r.id)).toEqual(runs.slice(0, PIN_CAP).map((r) => r.id));
    expect(p.beyond).toBe(3);
  });
  it('a chat two running rows share is pinned once and the second row is not beyond', () => {
    const runs = [run({ id: 'a', sid: 's' }), run({ id: 'b', sid: 's' })];
    expect(pinsOf(runs)).toEqual({ pinned: [runs[0]], beyond: 0 });
  });
  it('two running rows that share a chat past the cap count that chat once', () => {
    const runs = [...Array.from({ length: PIN_CAP }, (_, i) => run({ id: `r${i}`, sid: `s${i}` })), run({ id: 'x', sid: 'ninth' }), run({ id: 'y', sid: 'ninth' })];
    const p = pinsOf(runs);
    expect(p.pinned).toHaveLength(PIN_CAP);
    expect(p.beyond).toBe(1);
  });
  it('the same session id in two realms is two chats', () => {
    const runs = [run({ id: 'a', sid: 's' }), run({ id: 'b', sid: 's', realm: R1 })];
    expect(pinsOf(runs).pinned).toHaveLength(2);
  });
  it('nothing listed, nothing pinned', () => {
    expect(pinsOf(undefined)).toEqual({ pinned: [], beyond: 0 });
  });
});

describe('small rules', () => {
  it('anyRunning is true only for a running run', () => {
    expect(anyRunning(undefined)).toBe(false);
    expect(anyRunning([run({ id: 'a', state: 'failed' })])).toBe(false);
    expect(anyRunning([run({ id: 'a', state: 'failed' }), run({ id: 'b' })])).toBe(true);
  });
  it('runsOf keeps one workflow in one realm (the name is the identity only within a realm); a null realm keeps every realm', () => {
    const runs = [run({ id: 'a' }), run({ id: 'b', realm: R1 }), run({ id: 'c', workflow: 'other' })];
    expect(runsOf(runs, 'release', 'global').map((r) => r.id)).toEqual(['a']);
    expect(runsOf(runs, 'release', null).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

// The single-run read (getWorkflowRun: {run: row + steps}) and which runs can be resumed.
describe('parseRunDetail: a run with its steps, or null', () => {
  const step = (o: Record<string, unknown> = {}) => ({ step_id: 'build', success: true, duration_ms: 71840, input_tokens: 1284, output_tokens: 412, ...o });
  it('reads the run and each step as the agent sends it', () => {
    const d = parseRunDetail({ run: { ...row({ status: 'failed', finished_at: T1, error: 'check exited 1' }), steps: [step(), step({ step_id: 'check', success: false, timed_out: true, error: 'exit\u001b[31m 1\n', input_tokens: 0, output_tokens: 0, duration_ms: 0 })] } });
    expect(d?.run).toMatchObject({ id: 'run-1', state: 'failed' });
    expect(d?.steps).toEqual([
      { id: 'build', ok: true, timedOut: false, ms: 71840, inTok: 1284, outTok: 412, error: null },
      // The step error is cleaned by the same rule as the run's own error (one line, controls gone, bounded).
      { id: 'check', ok: false, timedOut: true, ms: null, inTok: null, outTok: null, error: parseRun(row({ error: 'exit\u001b[31m 1\n' }))?.error },
    ]);
  });
  it('a run without steps has none (an empty list, never invented)', () => {
    expect(parseRunDetail({ run: row() })?.steps).toEqual([]);
  });
  it('null for an answer that is not a run, a malformed run, or any malformed step', () => {
    expect(parseRunDetail(null)).toBeNull();
    expect(parseRunDetail(row())).toBeNull();
    expect(parseRunDetail({ run: { ...row(), status: 'odd' } })).toBeNull();
    expect(parseRunDetail({ run: { ...row(), steps: 'x' } })).toBeNull();
    for (const bad of [{ step_id: '' }, { success: 'yes' }, { duration_ms: -1 }, { input_tokens: 1.5 }, { error: 5 }, { timed_out: 'no' }]) {
      expect(parseRunDetail({ run: { ...row(), steps: [step(bad)] } })).toBeNull();
    }
  });
  it('bounds a step error like the run error', () => {
    const d = parseRunDetail({ run: { ...row(), steps: [step({ success: false, error: 'x'.repeat(ERROR_MAX + 50) })] } });
    expect((d?.steps[0]?.error ?? '').length).toBeLessThanOrEqual(ERROR_MAX);
  });
});

describe('resumable: a failed or cancelled run nobody has resumed, or whose resume ended without finishing', () => {
  const r = (o: Partial<Run>): Run => ({ ...(parseRun(row())!), ...o });
  it('only failed and cancelled runs', () => {
    expect(resumable(r({ state: 'failed', finishedAt: 1 }), [])).toBe(true);
    expect(resumable(r({ state: 'cancelled', finishedAt: 1 }), [])).toBe(true);
    expect(resumable(r({ state: 'running' }), [])).toBe(false);
    expect(resumable(r({ state: 'completed', finishedAt: 1 }), [])).toBe(false);
  });
  it('not while a resume of it runs or after one completed; again after a failed or cancelled resume', () => {
    const base = r({ id: 'a', state: 'failed', finishedAt: 1 });
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'a', state: 'running' })])).toBe(false);
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'a', state: 'completed', finishedAt: 2 })])).toBe(false);
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'a', state: 'failed', finishedAt: 2, step: null, lastStep: null })])).toBe(true);
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'zz', state: 'running' })])).toBe(true);
  });
  // the listing, not page memory, keeps a reload from offering it again.
  it('not after a resume of it that started a step and then failed or was cancelled: that run carries the work on', () => {
    const base = r({ id: 'a', state: 'failed', finishedAt: 1 });
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'a', state: 'failed', finishedAt: 2, step: 'build' })])).toBe(false);
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'a', state: 'cancelled', finishedAt: 2, step: null, lastStep: 'build' })])).toBe(false);
    expect(resumable(base, [
      r({ id: 'b', resumedFrom: 'a', state: 'failed', finishedAt: 2, step: null, lastStep: null }),
      r({ id: 'c', resumedFrom: 'a', state: 'failed', finishedAt: 3, step: 'test' }),
    ])).toBe(false);
  });
  it('unstarted: a resume that ended before any step started (its chat dropped or refused it)', () => {
    expect(unstarted(r({ state: 'failed', finishedAt: 2, step: null, lastStep: null }))).toBe(true);
    expect(unstarted(r({ state: 'cancelled', finishedAt: 2, step: null, lastStep: null }))).toBe(true);
    expect(unstarted(r({ state: 'failed', finishedAt: 2, step: 'build', lastStep: null }))).toBe(false);
    expect(unstarted(r({ state: 'failed', finishedAt: 2, step: null, lastStep: 'build' }))).toBe(false);
    expect(unstarted(r({ state: 'running', step: null, lastStep: null }))).toBe(false);
    expect(unstarted(r({ state: 'completed', finishedAt: 2, step: null, lastStep: null }))).toBe(false);
    // A run whose daemon went away reads failed with no finish time; its steps may not have been saved.
    expect(unstarted(r({ state: 'failed', finishedAt: null, step: null, lastStep: null }))).toBe(false);
  });
  it('a resume whose daemon went away (failed, no finish time, no step) still keeps the run from being resumed again', () => {
    const base = r({ id: 'a', state: 'failed', finishedAt: 1 });
    expect(resumable(base, [r({ id: 'b', resumedFrom: 'a', state: 'failed', finishedAt: null, step: null, lastStep: null })])).toBe(false);
  });
  it('cutShort: failed or cancelled with no finish time and no step', () => {
    expect(cutShort(r({ state: 'failed', finishedAt: null, step: null, lastStep: null }))).toBe(true);
    expect(cutShort(r({ state: 'failed', finishedAt: 2, step: null, lastStep: null }))).toBe(false);
    expect(cutShort(r({ state: 'failed', finishedAt: null, step: 'build', lastStep: null }))).toBe(false);
    expect(cutShort(r({ state: 'running', finishedAt: null, step: null, lastStep: null }))).toBe(false);
  });
});
