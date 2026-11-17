// The commit and push answer table, row by row: each step is shown only with positive evidence.
import { describe, expect, it } from 'vitest';
import { commitAnswer, commitPushAnswer, matchingCommit, syncAnswer, type Reply } from './commit';

const ok = (data: unknown): Reply => ({ kind: 'answer', status: 200, code: null, details: {}, data });
const err = (status: number, code: string | null, details: Record<string, unknown> = {}, message = ''): Reply => ({ kind: 'answer', status, code, details, data: { message } });
const lost: Reply = { kind: 'lost' };

describe('commit and push: the answer table', () => {
  it('200 committed:true: commit created, pushed', () => {
    expect(commitPushAnswer(ok({ status: 'ok', success: true, committed: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'pushed' }, doNotCommitAgain: false });
  });
  it('200 committed:false: nothing new to commit, pushed', () => {
    expect(commitPushAnswer(ok({ status: 'ok', success: true, committed: false }))).toMatchObject({ commit: { state: 'nothing' }, push: { state: 'pushed' } });
  });
  it('200 without committed: the push is proven, the commit is not', () => {
    expect(commitPushAnswer(ok({ status: 'ok', success: true }))).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'pushed' } });
  });
  it('502 push_failed with committed:true: created; push failed with its reason; do not commit again', () => {
    const a = commitPushAnswer(err(502, 'push_failed', { committed: true, output: '! [rejected] main -> main (fetch first)' }, 'committed locally, but push failed: push failed'));
    expect(a).toMatchObject({ commit: { state: 'created' }, push: { state: 'failed' }, doNotCommitAgain: true });
    expect(a.push.reason).toContain('rejected');
  });
  it('502 push_failed without committed: the push failed, the commit is not proven', () => {
    expect(commitPushAnswer(err(502, 'push_failed', {}))).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'failed' } });
  });
  it('502 git_command_failed with committed:false: not committed (refused by the repository) with its output; push not run', () => {
    const a = commitPushAnswer(err(502, 'git_command_failed', { committed: false, output: 'pre-commit hook failed' }));
    expect(a).toMatchObject({ commit: { state: 'refused', output: 'pre-commit hook failed' }, push: { state: 'not_run' }, doNotCommitAgain: false });
  });
  it('502 git_command_failed without committed: the commit is not proven either way; push not run', () => {
    expect(commitPushAnswer(err(502, 'git_command_failed', {}))).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'not_run' } });
  });
  it('409 repository-state code: created only with committed:true, otherwise not run; push not run', () => {
    expect(commitPushAnswer(err(409, 'detached_head', { committed: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'not_run', code: 'detached_head' }, doNotCommitAgain: true });
    expect(commitPushAnswer(err(409, 'unsafe_transport_config', {}))).toMatchObject({ commit: { state: 'not_run' }, push: { state: 'not_run', code: 'unsafe_transport_config' }, doNotCommitAgain: false });
    expect(commitPushAnswer(err(409, 'detached_head', { committed: 'yes' }))).toMatchObject({ commit: { state: 'not_run' } });
  });
  it('409 unresolved_conflicts: not committed, the conflicts named', () => {
    expect(commitPushAnswer(err(409, 'unresolved_conflicts'))).toMatchObject({ commit: { state: 'refused', code: 'unresolved_conflicts' }, push: { state: 'not_run' } });
  });
  it('503 timed_out with committed:true: created; push unknown (partly done)', () => {
    expect(commitPushAnswer(err(503, 'service_unavailable', { timed_out: true, committed: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'unknown' }, doNotCommitAgain: true, tag: 'partly' });
  });
  it('503 timed_out with committed false or absent: both unknown (commit unknown)', () => {
    for (const d of [{ timed_out: true, committed: false }, { timed_out: true }]) {
      expect(commitPushAnswer(err(503, 'service_unavailable', d))).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'unknown' }, tag: 'commitUnknown' });
    }
  });
  it('a push_failed that timed out (whatever its status) is a push that may have reached GitHub: unknown, never failed', () => {
    for (const s of [502, 503]) {
      expect(commitPushAnswer(err(s, 'push_failed', { committed: true, timed_out: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'unknown' }, doNotCommitAgain: true, tag: 'partly' });
      expect(commitPushAnswer(err(s, 'push_failed', { timed_out: true }))).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'unknown' }, tag: 'commitUnknown' });
    }
  });
  it('any 5xx with committed:true proves the commit (never the push)', () => {
    expect(commitPushAnswer(err(500, 'internal_error', { committed: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'unknown' }, doNotCommitAgain: true, tag: 'partly' });
  });
  it('a 5xx that proves nothing, and a lost answer: both unknown', () => {
    for (const r of [err(503, 'service_unavailable'), err(500, 'internal_error'), lost]) {
      expect(commitPushAnswer(r)).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'unknown' }, tag: 'commitUnknown' });
    }
  });
  it('an account failure uses the typed words; a commit is created only with committed:true', () => {
    const a = commitPushAnswer(err(403, 'github_token_forbidden', { committed: true }));
    expect(a).toMatchObject({ commit: { state: 'created' }, push: { state: 'failed', account: 'token_forbidden' }, doNotCommitAgain: true });
    expect(a.push.reason).toBeUndefined();
    expect(commitPushAnswer(err(401, 'github_not_linked'))).toMatchObject({ commit: { state: 'not_run' }, push: { state: 'not_run', account: 'not_linked' } });
  });
  it('any other refusal (4xx) runs nothing', () => {
    expect(commitPushAnswer(err(400, 'bad_request'))).toMatchObject({ commit: { state: 'not_run' }, push: { state: 'not_run' } });
  });
  it('a reason is git\'s words, bounded and without control characters', () => {
    const a = commitPushAnswer(err(502, 'push_failed', { committed: true, output: `\u001b[31mx${'y'.repeat(5000)}` }));
    expect(a.push.reason!.length).toBeLessThanOrEqual(2000);
    expect(a.push.reason).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
  });
});

describe('commit only', () => {
  it('200: created; 409 nothing_to_commit: nothing new; 502 git_command_failed: refused with its output', () => {
    expect(commitAnswer(ok({ status: 'ok', success: true, committed: true }))).toMatchObject({ state: 'created' });
    expect(commitAnswer(err(409, 'nothing_to_commit'))).toMatchObject({ state: 'nothing' });
    expect(commitAnswer(err(502, 'git_command_failed', { output: 'hook said no' }))).toMatchObject({ state: 'refused', output: 'hook said no' });
  });
  it('a 200 that does not say committed:true is not a proven commit', () => {
    expect(commitAnswer(ok({ status: 'ok' }))).toMatchObject({ state: 'unknown' });
  });
  it('a 5xx or a lost answer: unknown; another refusal: not run', () => {
    expect(commitAnswer(err(503, 'service_unavailable'))).toMatchObject({ state: 'unknown' });
    expect(commitAnswer(lost)).toMatchObject({ state: 'unknown' });
    expect(commitAnswer(err(409, 'unresolved_conflicts'))).toMatchObject({ state: 'refused', code: 'unresolved_conflicts' });
    expect(commitAnswer(err(400, 'bad_request'))).toMatchObject({ state: 'not_run' });
  });
});

describe('sync: one result per step, stopping at the first failure', () => {
  const step = (s: string, result: Record<string, unknown>) => ({ step: `github.${s}`, result });
  it('200: every step done', () => {
    expect(syncAnswer(ok({ steps: [step('fetch', { status: 'ok' }), step('pull', { status: 'ok' }), step('push', { status: 'ok' })] }), 'full').steps).toEqual([
      { step: 'fetch', state: 'done' }, { step: 'pull', state: 'done' }, { step: 'push', state: 'done' },
    ]);
  });
  it('200 that leaves a step out: that step is unknown', () => {
    expect(syncAnswer(ok({ steps: [step('fetch', { status: 'ok' })] }), 'pull').steps).toEqual([{ step: 'fetch', state: 'done' }, { step: 'pull', state: 'unknown' }]);
  });
  it('502 sync_step_failed: the steps that ran, the failing one with its reason, the rest not run', () => {
    const a = syncAnswer(err(502, 'sync_step_failed', { failed_step: 'github.pull', steps: [step('fetch', { status: 'ok' }), step('pull', { status: 'error', message: 'CONFLICT (content): Merge conflict in a.ts' })] }), 'full');
    expect(a.steps).toEqual([
      { step: 'fetch', state: 'done' },
      { step: 'pull', state: 'failed', reason: 'CONFLICT (content): Merge conflict in a.ts' },
      { step: 'push', state: 'not_run' },
    ]);
  });
  it('a failing step with a repository-state code names it; a timed-out step is unknown', () => {
    expect(syncAnswer(err(502, 'sync_step_failed', { steps: [step('push', { status: 'error', code: 'detached_head' })] }), 'push').steps).toEqual([{ step: 'push', state: 'failed', code: 'detached_head' }]);
    expect(syncAnswer(err(502, 'sync_step_failed', { timed_out: true, steps: [step('fetch', { status: 'ok' }), step('pull', { status: 'ok' }), step('push', { status: 'error', timed_out: true })] }), 'full').steps.at(-1)).toEqual({ step: 'push', state: 'unknown' });
  });
  it('an account failure: the steps from details.operation, the failing one in typed words', () => {
    const a = syncAnswer(err(403, 'github_token_forbidden', { operation: { steps: [step('fetch', { status: 'ok' }), step('pull', { status: 'error' })] } }), 'full');
    expect(a.steps).toEqual([{ step: 'fetch', state: 'done' }, { step: 'pull', state: 'failed', account: 'token_forbidden' }, { step: 'push', state: 'not_run' }]);
  });
  it('an account failure whose list holds only the finished steps: those are done, the next one failed', () => {
    const a = syncAnswer(err(401, 'github_token_invalid', { operation: { steps: [step('fetch', { status: 'ok' }), step('pull', { status: 'ok' })] } }), 'full');
    expect(a.steps).toEqual([{ step: 'fetch', state: 'done' }, { step: 'pull', state: 'done' }, { step: 'push', state: 'failed', account: 'token_invalid' }]);
  });
  it('another refusal runs nothing; a 5xx or a lost answer leaves every step unknown', () => {
    expect(syncAnswer(err(400, 'bad_request'), 'full').steps.map((s) => s.state)).toEqual(['not_run', 'not_run', 'not_run']);
    expect(syncAnswer(lost, 'push').steps).toEqual([{ step: 'push', state: 'unknown' }]);
    expect(syncAnswer(err(500, 'internal_error'), 'pull').steps.map((s) => s.state)).toEqual(['unknown', 'unknown']);
  });
  it('a malformed step list proves nothing: unknown, never done', () => {
    expect(syncAnswer(err(502, 'sync_step_failed', { steps: 'x' }), 'pull').steps.map((s) => s.state)).toEqual(['unknown', 'unknown']);
  });
});

describe('Is this your commit?', () => {
  const log = [{ sha: 'a1b2c3d', subject: 'Fix the header', author: 'ada', age: '1 minute ago' }, { sha: '9f8e7d6', subject: 'Older', author: 'ada', age: '1 day ago' }];
  it('offers the newest commit whose subject is the message\'s first line, never more than one', () => {
    expect(matchingCommit(log, 'Fix the header\n\nlonger body')?.sha).toBe('a1b2c3d');
    expect(matchingCommit(log, 'Something else')).toBeNull();
    expect(matchingCommit(log, '   ')).toBeNull();
  });
});

describe('only explicit evidence settles a step', () => {
  const step = (s: string, result: Record<string, unknown>) => ({ step: `github.${s}`, result });
  it('a 200 that is not the success shape: no claim of Pushed (success:false, timed_out, no committed)', () => {
    expect(commitPushAnswer(ok({}))).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'unknown' } });
    expect(commitPushAnswer(ok({ status: 'ok', success: false, committed: true, timed_out: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'unknown' }, doNotCommitAgain: true, tag: 'partly' });
    expect(commitPushAnswer(ok({ status: 'ok', success: false, committed: true }))).toMatchObject({ commit: { state: 'created' }, push: { state: 'unknown' } });
  });
  it('an account failure: the commit facts under details.operation count (the published shape)', () => {
    const a = commitPushAnswer(err(403, 'github_token_forbidden', { operation: { committed: true } }));
    expect(a).toMatchObject({ commit: { state: 'created' }, push: { state: 'failed', account: 'token_forbidden' }, doNotCommitAgain: true });
    expect(commitAnswer(err(403, 'github_token_forbidden', { operation: { committed: true } }))).toMatchObject({ state: 'created' });
  });
  it('dropped details prove nothing: an account failure or refusal whose facts were too big is unknown, never not run', () => {
    const dropped: Reply = { kind: 'answer', status: 403, code: 'github_token_forbidden', details: {}, data: {}, dropped: true };
    expect(commitPushAnswer(dropped)).toMatchObject({ commit: { state: 'unknown' }, push: { state: 'unknown' } });
    expect(commitAnswer(dropped)).toMatchObject({ state: 'unknown' });
    expect(syncAnswer(dropped, 'full').steps.map((s) => s.state)).toEqual(['unknown', 'unknown', 'unknown']);
  });
  it('an account failure with no readable step list: every step unknown', () => {
    expect(syncAnswer(err(503, 'github_store_unavailable', {}), 'full').steps.map((s) => s.state)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(syncAnswer(err(403, 'github_token_forbidden', {}), 'pull').steps.map((s) => s.state)).toEqual(['unknown', 'unknown']);
  });
  it('a step whose result says neither ok nor error is unknown, and so is every step after it', () => {
    const a = syncAnswer(err(502, 'sync_step_failed', { steps: [step('fetch', { status: 'ok' }), step('pull', {}), step('push', { status: 'error', message: 'x' })] }), 'full');
    expect(a.steps.map((s) => s.state)).toEqual(['done', 'unknown', 'unknown']);
  });
  it('a row after the failing step contradicts the stop: unknown, never not run', () => {
    const a = syncAnswer(err(502, 'sync_step_failed', { steps: [step('fetch', { status: 'error', message: 'no network' }), step('pull', { status: 'ok' })] }), 'full');
    expect(a.steps.map((s) => s.state)).toEqual(['failed', 'unknown', 'not_run']);
  });
  it('502 git_command_failed with committed:true (the push-destination check after the commit): created, push not run, do not commit again', () => {
    const a = commitPushAnswer(err(502, 'git_command_failed', { committed: true, exit_code: 2, timed_out: false, output: "No such remote 'origin'" }));
    expect(a).toMatchObject({ commit: { state: 'created', output: "No such remote 'origin'" }, push: { state: 'not_run' }, doNotCommitAgain: true, tag: null });
  });
  it('commit only: a timeout on any 5xx is unknown, never refused', () => {
    expect(commitAnswer(err(502, 'git_command_failed', { timed_out: true }))).toMatchObject({ state: 'unknown' });
    expect(commitAnswer(err(503, 'service_unavailable', { timed_out: true, committed: true }))).toMatchObject({ state: 'created' });
  });
});

describe('step evidence under any code', () => {
  const step = (s: string, result: Record<string, unknown>) => ({ step: `github.${s}`, result });
  it('a 429 that kept the steps: the finished steps done, the throttled one failed with its code, nothing after it run', () => {
    const a = syncAnswer(err(429, 'rate_limited', { steps: [step('fetch', { status: 'ok' }), step('pull', { status: 'ok' }), step('push', { status: 'error', code: 'rate_limited' })] }), 'full');
    expect(a.steps).toEqual([{ step: 'fetch', state: 'done' }, { step: 'pull', state: 'done' }, { step: 'push', state: 'failed', code: 'rate_limited' }]);
  });
});

describe('details dropped from a plain refusal', () => {
  it('a sync 4xx with no account code whose details were too big: every step unknown, never not run', () => {
    const dropped: Reply = { kind: 'answer', status: 409, code: 'diverged_branch', details: {}, data: {}, dropped: true };
    expect(syncAnswer(dropped, 'full').steps.map((s) => s.state)).toEqual(['unknown', 'unknown', 'unknown']);
  });
});
