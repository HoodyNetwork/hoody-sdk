// A folder's commit, commit-and-push and sync answers → what each step shows. Each step is shown
// only with positive evidence: a commit is "created" only when the agent says committed:true, and anything that proves
// neither way leaves it unknown. Agent facts (its github.commit_push command and sync step failures,
// openapi githubCommitPush / githubSync):
//   - commit/push: 200 {status:'ok', success, committed} (committed false: the tree was clean and only earlier commits were
//     pushed); a 200 that says success:false or timed_out proves no push. After the commit landed every refusal carries
//     committed:true (flat in details, or under details.operation on an account failure): 502 push_failed (git's words in
//     details.output), 502 git_command_failed (the push-destination check after the commit), 409 with a repository-state
//     code, 503 with details.timed_out:true (the push may or may not have reached GitHub), and an account failure on the
//     push. A stage or commit step git rejects is 502 git_command_failed with details.committed:false.
//   - commit: 200 = committed; 409 nothing_to_commit; 502 git_command_failed (details.output); 409 unresolved_conflicts.
//   - sync: fetch → pull → push (direction 'pull': fetch → pull; 'push': push), stopping at the first failing step. 200
//     {steps}; 502 sync_step_failed {failed_step, steps:[{step:'github.<name>', result:{status, code?, message?,
//     timed_out?}}], timed_out?}; an account refusal answers its github_* code with the steps under details.operation; a
//     throttled step can reach the page as 429 rate_limited with the steps kept. Only a result that says ok or error
//     settles a step; a row that says neither, or one after the failing step, proves nothing.
//   - Details core dropped as too big (Reply.dropped) prove nothing either: every step they would have settled is unknown.
//   - Nothing here is ever sent again on its own: a lost answer is unknown until the person checks.
import { accountFailureOf, type AccountFailure, type Commit } from './logic';

/** An answer as the page got it: the agent's status, code, details and body; or none at all. */
export type Reply =
  | {
      readonly kind: 'answer'; readonly status: number; readonly code: string | null; readonly details: Readonly<Record<string, unknown>>; readonly data: unknown;
      /** Core dropped the details as too big: what they said is not known. */
      readonly dropped?: true;
    }
  | { readonly kind: 'lost' };

export type CommitState = 'created' | 'nothing' | 'refused' | 'unknown' | 'not_run';
export type PushState = 'pushed' | 'failed' | 'unknown' | 'not_run';
export type StepState = 'done' | 'failed' | 'unknown' | 'not_run';

export interface CommitStep {
  readonly state: CommitState;
  /** git's words on a refused commit. */
  readonly output?: string;
  /** The agent's code for a refused or not-run commit (unresolved_conflicts, a repository-state code). */
  readonly code?: string;
  readonly account?: AccountFailure;
}
export interface PushStep {
  readonly state: PushState;
  /** git's words on a failed push. */
  readonly reason?: string;
  /** The repository-state code that stopped it. */
  readonly code?: string;
  readonly account?: AccountFailure;
}
export interface CommitPushAnswer {
  readonly commit: CommitStep;
  readonly push: PushStep;
  /** A commit landed and did not reach GitHub (or may not have): pushing again is the way, never a second commit. */
  readonly doNotCommitAgain: boolean;
  /** The GitHub tag of an unknown outcome: the commit landed and the push is unknown, or the commit is unknown too. */
  readonly tag: 'partly' | 'commitUnknown' | null;
}
export type SyncStepName = 'fetch' | 'pull' | 'push';
export interface SyncStep {
  readonly step: SyncStepName;
  readonly state: StepState;
  readonly reason?: string;
  readonly code?: string;
  readonly account?: AccountFailure;
}
export type SyncDirection = 'full' | 'pull' | 'push';
export interface SyncAnswer { readonly steps: readonly SyncStep[] }

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const REASON_MAX = 2000;
const CONTROL = /\u001b\[[0-9;?]*[ -/]*[@-~]|[\u0000-\u0008\u000b-\u001f\u007f]/g;
/** git's words as the page shows them: control characters and escape sequences gone, bounded, trimmed. */
export function wordsOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(CONTROL, '').trim();
  if (!s) return undefined;
  return s.length > REASON_MAX ? `${s.slice(0, REASON_MAX - 1)}…` : s;
}
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const codeOf = (v: unknown): string | undefined => (typeof v === 'string' && CODE.test(v) ? v : undefined);
const messageOf = (r: Extract<Reply, { kind: 'answer' }>): string | undefined => (obj(r.data) ? wordsOf(r.data.message) : undefined);

/** Did a step change anything we cannot see (no answer, any 5xx, a 2xx that is not the success shape)? */
const proves = (r: Reply): r is Extract<Reply, { kind: 'answer' }> => r.kind === 'answer' && r.status >= 400 && r.status < 500;

const UNKNOWN_BOTH: CommitPushAnswer = { commit: { state: 'unknown' }, push: { state: 'unknown' }, doNotCommitAgain: false, tag: 'commitUnknown' };

/** The agent's committed fact: flat in details, or under details.operation (account failures). */
function committedOf(d: Readonly<Record<string, unknown>>): unknown {
  if (d.committed !== undefined) return d.committed;
  return obj(d.operation) ? d.operation.committed : undefined;
}
const commitStateOf = (committed: unknown): CommitState => (committed === true ? 'created' : committed === false ? 'nothing' : 'unknown');
/** The push is not proven: the commit is what the agent says it is. */
function pushUnknown(committed: unknown): CommitPushAnswer {
  const commit: CommitStep = { state: commitStateOf(committed) };
  return { commit, push: { state: 'unknown' }, doNotCommitAgain: committed === true, tag: committed === true ? 'partly' : commit.state === 'unknown' ? 'commitUnknown' : null };
}

/** commit/push's answer, row by row. */
export function commitPushAnswer(r: Reply): CommitPushAnswer {
  if (r.kind === 'lost') return UNKNOWN_BOTH;
  if (r.status >= 200 && r.status < 300) {
    if (!obj(r.data) || r.data.status !== 'ok') return UNKNOWN_BOTH;
    // "Pushed" only when the body says so: success:false or timed_out leaves the push unknown.
    if (r.data.success === false || r.data.timed_out === true) return pushUnknown(r.data.committed);
    return { commit: { state: commitStateOf(r.data.committed) }, push: { state: 'pushed' }, doNotCommitAgain: false, tag: null };
  }
  if (r.dropped) return UNKNOWN_BOTH;
  const committed = committedOf(r.details);
  // A push that timed out may or may not have reached GitHub, whatever status or code carries it.
  if (r.status >= 500 && r.details.timed_out === true) return committed === true ? pushUnknown(true) : UNKNOWN_BOTH;
  if (r.status === 502 && r.code === 'push_failed') {
    const reason = wordsOf(r.details.output) ?? messageOf(r);
    const commit: CommitStep = { state: committed === true ? 'created' : committed === false ? 'nothing' : 'unknown' };
    return { commit, push: { state: 'failed', ...(reason ? { reason } : {}) }, doNotCommitAgain: committed === true, tag: null };
  }
  if (r.status === 502 && r.code === 'git_command_failed') {
    const output = wordsOf(r.details.output);
    // committed:true: the push-destination check after the commit failed, so the push never ran.
    if (committed === true) return { commit: { state: 'created', ...(output ? { output } : {}) }, push: { state: 'not_run' }, doNotCommitAgain: true, tag: null };
    const commit: CommitStep = committed === false ? { state: 'refused', ...(output ? { output } : {}) } : { state: 'unknown' };
    return { commit, push: { state: 'not_run' }, doNotCommitAgain: false, tag: committed === false ? null : 'commitUnknown' };
  }
  // Any other 5xx: the push is not proven; the commit is, when the agent says it landed.
  if (r.status >= 500) return committed === true ? pushUnknown(true) : UNKNOWN_BOTH;
  // A 4xx: a definite refusal. The commit landed only when the agent says so.
  const code = codeOf(r.code);
  const account = accountFailureOf(r.code) ?? undefined;
  if (code === 'unresolved_conflicts') return { commit: { state: 'refused', code }, push: { state: 'not_run' }, doNotCommitAgain: false, tag: null };
  const landed = committed === true;
  const commit: CommitStep = { state: landed ? 'created' : 'not_run' };
  // An account refusal after the commit was the push's own: it did not reach GitHub.
  const push: PushStep = account
    ? { state: landed ? 'failed' : 'not_run', account }
    : { state: 'not_run', ...(code && r.status === 409 ? { code } : {}) };
  return { commit, push, doNotCommitAgain: landed, tag: null };
}

/** commit's answer (Commit without push). */
export function commitAnswer(r: Reply): CommitStep {
  if (r.kind === 'lost') return { state: 'unknown' };
  if (r.status >= 200 && r.status < 300) {
    // The agent's 200 is the commit's verbatim reply: only committed:true proves it.
    return { state: obj(r.data) && r.data.committed === true ? 'created' : 'unknown' };
  }
  if (r.dropped) return { state: 'unknown' };
  // The agent says the commit landed, whatever refused after it.
  if (committedOf(r.details) === true) return { state: 'created' };
  // A timeout may or may not have committed, whatever status or code carries it.
  if (r.status >= 500 && r.details.timed_out === true) return { state: 'unknown' };
  if (r.status === 409 && r.code === 'nothing_to_commit') return { state: 'nothing' };
  if (r.status === 502 && r.code === 'git_command_failed') {
    const output = wordsOf(r.details.output);
    return { state: 'refused', ...(output ? { output } : {}) };
  }
  if (!proves(r)) return { state: 'unknown' };
  const code = codeOf(r.code);
  if (code === 'unresolved_conflicts') return { state: 'refused', code };
  const account = accountFailureOf(r.code) ?? undefined;
  return { state: 'not_run', ...(account ? { account } : {}), ...(code && r.status === 409 && !account ? { code } : {}) };
}

const STEPS: Readonly<Record<SyncDirection, readonly SyncStepName[]>> = { full: ['fetch', 'pull', 'push'], pull: ['fetch', 'pull'], push: ['push'] };
const NAMES: readonly SyncStepName[] = ['fetch', 'pull', 'push'];

// The agent's step rows in order, read strictly: a row that does not name a known step, or a list that is not one, is null
// (proves nothing).
function rowsOf(v: unknown): { step: SyncStepName; result: Record<string, unknown> }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { step: SyncStepName; result: Record<string, unknown> }[] = [];
  for (const row of v) {
    if (!obj(row) || typeof row.step !== 'string' || !obj(row.result)) return null;
    const name = row.step.replace(/^github\./, '') as SyncStepName;
    if (!NAMES.includes(name)) return null;
    out.push({ step: name, result: row.result });
  }
  return out;
}

const okResult = (x: Record<string, unknown>): boolean => x.status === 'ok' && x.success !== false;
/** Only an explicit error settles a step as failed (or timed out, as unknown). */
const errorResult = (x: Record<string, unknown>): boolean => x.status === 'error' || (x.status !== 'ok' && x.success === false);

/** sync's answer: one result per step of the direction; a step with no result is unknown (or not run after a failure). */
export function syncAnswer(r: Reply, direction: SyncDirection): SyncAnswer {
  const want = STEPS[direction];
  const all = (state: StepState): SyncAnswer => ({ steps: want.map((step) => ({ step, state })) });
  if (r.kind === 'lost') return all('unknown');
  if (r.status >= 200 && r.status < 300) {
    const rows = obj(r.data) ? rowsOf(r.data.steps) : null;
    if (!rows) return all('unknown');
    return { steps: want.map((step) => ({ step, state: rows.some((x) => x.step === step && okResult(x.result)) ? 'done' : 'unknown' })) };
  }
  if (r.dropped) return all('unknown');
  const account = accountFailureOf(r.code) ?? undefined;
  // The steps as the agent kept them, under whatever code carries them (502 sync_step_failed, an account code, 429).
  const rows = rowsOf(r.details.steps !== undefined ? r.details.steps : obj(r.details.operation) ? r.details.operation.steps : undefined);
  if (!rows || !rows.length) return account || !proves(r) ? all('unknown') : all('not_run');
  const steps: SyncStep[] = [];
  let stopped = false;
  let unsure = false;
  for (const step of want) {
    const row = rows.find((x) => x.step === step);
    // After a step that proved nothing, nothing after it is known either.
    if (unsure) { steps.push({ step, state: 'unknown' }); continue; }
    // A row after the failing step contradicts the stop: it proves nothing.
    if (stopped) { steps.push({ step, state: row ? 'unknown' : 'not_run' }); continue; }
    // No row: an account refusal stopped at this step; otherwise nothing says whether it ran.
    if (!row) {
      if (account) { stopped = true; steps.push({ step, state: 'failed', account }); } else steps.push({ step, state: 'unknown' });
      continue;
    }
    const res = row.result;
    if (okResult(res)) { steps.push({ step, state: 'done' }); continue; }
    if (!errorResult(res)) { unsure = true; steps.push({ step, state: 'unknown' }); continue; }
    stopped = true;
    // The failing step: a timed-out command may or may not have reached GitHub.
    if (res.timed_out === true || r.details.timed_out === true) { steps.push({ step, state: 'unknown' }); continue; }
    if (account) { steps.push({ step, state: 'failed', account }); continue; }
    const code = codeOf(res.code);
    const reason = code ? undefined : wordsOf(res.message) ?? wordsOf(res.output);
    steps.push({ step, state: 'failed', ...(code ? { code } : {}), ...(reason ? { reason } : {}) });
  }
  return { steps };
}

/** "Is this your commit?": the newest commit whose subject is the message's first line, offered, never claimed. */
export function matchingCommit(log: readonly Commit[], message: string): Commit | null {
  const first = message.split('\n')[0]!.trim();
  if (!first) return null;
  return log.find((c) => c.subject.trim() === first) ?? null;
}
