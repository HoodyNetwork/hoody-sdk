// A folder's repository writes: Commit, Commit and push, Sync (and Push and Pull, its single
// directions), and Suggest a message. What the agent answered is mapped by commit.ts, step by step, with positive evidence
// only.
//   - The three writes share one lock per folder on its computer (REPO_WRITE_LOCK): while one may have gone through, no
//     other write of that folder is sent. Core holds an unknown outcome (a lost answer, any 5xx, a 200 whose body
//     leaves a step unknown: `settles`, and a refusal that leaves one unknown: `holds`) and never sends it again. Such a 200 reaches the page as a lost answer (core keeps
//     no body for a pending result): every step unknown until the person checks.
//   - A held write is freed only when its own answer proved every step (a 502 push_failed proves both: the commit landed
//     and the push did not), when the person says a commit in the history is theirs and nothing else is unknown, or when
//     they stop tracking it. No declared read proves a write on its own (no `proves`): a newer commit in the history may be
//     someone else's.
//   - Pushing again is the person's choice, through the ordinary Push: it stops tracking the held write first, after a
//     confirm that says so (Commit.tsx).
//   - Suggest a message changes nothing in the folder; it is never held and never sent again on its own (the call is billed).
//   - The branch changes (create, switch, delete) are writes of the folder too, under the same lock and the same
//     rules: one local git command each; a 200 proves it only when its body says git succeeded; git's own refusal (502
//     git_command_failed, not timed out) proves nothing changed; a lost answer, any other 5xx or a timeout is unknown and
//     held. The branch list shows the end state, never who made it, so no read proves one either.
//   - The worktree changes (add, remove; a remove with force after git refused a plain one) are the same: one local
//     git command each, the same lock, answer rules and holds; the worktree list shows the end state, never proof.
import { coreSource, refreshFresh, useRunner, type HeldChange, type SourceResult, type SourceTable, type Target } from '@core';
import { useCallback, useMemo } from 'react';
import { routes as aiRoutes } from '../routes';
import { defaults } from '../logic';
import { commitAnswer, commitPushAnswer, syncAnswer, wordsOf, type CommitPushAnswer, type CommitStep, type Reply, type SyncAnswer, type SyncDirection } from './commit';
import { folderOk, repoTable, type FolderAt } from './data';
import { accountFailureOf, type AccountFailure, type Branch } from './logic';
import { repoRoutes } from './routes';

export const REPO_WRITE_LOCK = 'agent.repo_write';
export type BranchOp = 'branchCreate' | 'branchSwitch' | 'branchDelete';
export type WorktreeOp = 'worktreeAdd' | 'worktreeRemove';
export type WriteOp = 'commit' | 'commitPush' | 'sync' | BranchOp | WorktreeOp;
export const BRANCH_OPS: readonly BranchOp[] = ['branchCreate', 'branchSwitch', 'branchDelete'];
export const WORKTREE_OPS: readonly WorktreeOp[] = ['worktreeAdd', 'worktreeRemove'];
export const isBranchOp = (op: WriteOp): op is BranchOp => (BRANCH_OPS as readonly string[]).includes(op);
export const isWorktreeOp = (op: WriteOp): op is WorktreeOp => (WORKTREE_OPS as readonly string[]).includes(op);

export interface WriteVars extends FolderAt {
  readonly op: WriteOp;
  /** Commit and Commit and push. */
  readonly message?: string;
  /** Sync: one direction, or both (fetch → pull → push). */
  readonly direction?: SyncDirection;
  /** A branch change: the branch it names. Adding a worktree: the NEW branch made for it (none: an existing ref). */
  readonly branch?: string;
  /** A worktree change: the worktree's absolute path. */
  readonly path?: string;
  /** Adding a worktree: the ref its new branch starts at, or the existing ref it uses (none: the current commit). */
  readonly startRef?: string;
  /** Removing a worktree: remove it even with uncommitted or untracked changes, discarding them (git's --force). A Push:
   *  replace the branch on GitHub (the agent's --force-with-lease), only after git refused a plain one. */
  readonly force?: boolean;
  /** When the person pressed it (ms): the held band says when the write was sent. */
  readonly sentAt: number;
}

/** What a held write keeps (core persists it): never the message, which stays in this tab only (sentMessages). */
export interface WriteIdentity {
  computer: string;
  realm: string;
  cwd: string;
  op: WriteOp;
  direction?: SyncDirection;
  /** A branch change's branch (a name in the folder's own repository, shown on the held band); a worktree's new branch. */
  branch?: string;
  /** A worktree change's path, start ref and force (a path on the folder's own computer, shown on the held band); a
   *  forced Push's force. */
  path?: string;
  startRef?: string;
  force?: boolean;
  sentAt: number;
}

const bodyOf = (v: WriteVars): Record<string, unknown> =>
  isBranchOp(v.op) ? { branch: v.branch ?? '' }
  : v.op === 'worktreeAdd' ? { path: v.path ?? '', ...(v.branch ? { branch: v.branch } : {}), ...(v.startRef ? { start_ref: v.startRef } : {}) }
  : v.op === 'worktreeRemove' ? { path: v.path ?? '', force: v.force === true }
  : v.op === 'sync' ? { ...(v.direction && v.direction !== 'full' ? { direction: v.direction } : {}), ...(isForcedPush(v) ? { force: true } : {}) }
  : { message: v.message ?? '' };

/** A readsStatus route's success answer (the branch and worktree routes): the status the agent really answered with, 0 when none was read. */
const statusOf = (raw: unknown): number => (isObj(raw) && typeof raw.status === 'number' ? raw.status : 0);
const bodyOfAnswer = (raw: unknown): unknown => (isObj(raw) ? raw.body : undefined);

const change = (route: typeof repoRoutes.commit, reads: readonly string[] = ['status', 'log'], withStatus = false) => ({
  route,
  input: (v: WriteVars) => ({ target: v.target, realm: v.realm, cwd: v.cwd, body: bodyOf(v) }),
  // The page's status and history (a branch change: its branches) are read again after every answer; they never prove the
  // write (see the top).
  reads,
  lock: REPO_WRITE_LOCK,
  // One folder is one checkout whatever realm a link names it in, and the page's realm is the link's, not the top bar's:
  // the hold counts in every realm view.
  acrossRealms: true,
  lockKey: (v: WriteVars) => ({ computer: v.target.container.id, cwd: v.cwd }),
  identity: (v: WriteVars): WriteIdentity => ({
    computer: v.target.container.id, realm: v.realm, cwd: v.cwd, op: v.op, ...(v.op === 'sync' ? { direction: v.direction ?? 'full' } : {}),
    ...(isBranchOp(v.op) ? { branch: v.branch ?? '' } : {}),
    ...(isWorktreeOp(v.op) ? {
      path: v.path ?? '', ...(v.branch ? { branch: v.branch } : {}), ...(v.startRef ? { startRef: v.startRef } : {}),
      ...(v.op === 'worktreeRemove' ? { force: v.force === true } : {}),
    } : {}),
    ...(isForcedPush(v) ? { force: true } : {}),
    sentAt: v.sentAt,
  }),
  // A branch or worktree route answers {status, body} (readsStatus): the page keeps the body, as for the others.
  select: (raw: unknown) => (withStatus ? bodyOfAnswer(raw) : raw),
  // A 200 settles the write only when its body proves every step (commit.ts); otherwise core holds it. A branch change
  // (or worktree change) settles only on the 200 it really got (any other status, or none read, is held): never a status built here.
  settles: (raw: unknown, v: WriteVars) => withStatus
    ? statusOf(raw) === 200 && !anyUnknown(answerOf(v, { kind: 'answer', status: 200, code: null, details: {}, data: bodyOfAnswer(raw) }))
    : !anyUnknown(answerOf(v, { kind: 'answer', status: 200, code: null, details: {}, data: raw })),
  // A refusal that leaves a step unknown (details dropped as too big, a commit that landed under an account failure
  // with the push not proven) is held by core like a lost answer, never by this page alone.
  holds: (a: { code?: string; status?: number; details?: Record<string, unknown>; detailsDropped?: true }, v: WriteVars) =>
    anyUnknown(answerOf(v, { kind: 'answer', status: a.status ?? 400, code: a.code ?? null, details: a.details ?? {}, data: {}, ...(a.detailsDropped ? { dropped: true as const } : {}), ...(a.status === undefined ? { guessed: true as const } : {}) })),
});

export interface SuggestVars extends FolderAt { readonly model: string }

const BRANCH_READS = ['status', 'branches'] as const;
// Adding a worktree may make a branch too; removing one leaves the branches as they are.
const WORKTREE_ADD_READS = ['status', 'worktrees', 'branches'] as const;
const WORKTREE_REMOVE_READS = ['status', 'worktrees'] as const;

/** One worktree of the folder's repository (the agent's list). `main`: the repository's main working folder, which the
 *  agent lists first and never removes. */
export interface Worktree {
  readonly path: string;
  readonly branch: string;
  readonly detached: boolean;
  readonly bare: boolean;
  readonly locked: boolean;
  readonly main: boolean;
}

/** The worktrees read's list: entries without a path are left out; only the agent's first entry is the main one. */
export function worktreesOf(raw: unknown): Worktree[] {
  const list = isObj(raw) && Array.isArray(raw.worktrees) ? raw.worktrees : [];
  return list.flatMap((w: unknown, i: number): Worktree[] => (isObj(w) && typeof w.path === 'string' && w.path ? [{
    path: w.path, branch: typeof w.branch === 'string' ? w.branch : '', detached: w.detached === true, bare: w.bare === true,
    locked: w.locked === true, main: i === 0,
  }] : []));
}

const table = {
  reads: {
    ...repoTable.reads,
    /** The configured default agent's model in the folder's realm (Suggest a message uses it, else Hoody Free). */
    agents: {
      route: aiRoutes.agents,
      input: (p: FolderAt) => ({ target: p.target, realm: p.realm }),
      select: (raw: unknown) => defaults(raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : []).helper.effective,
      staleTime: 60_000,
    },
    /** The folder's worktrees: its Worktrees view and a worktree change's checks. */
    worktrees: { route: repoRoutes.worktrees, input: (p: FolderAt) => ({ target: p.target, realm: p.realm, cwd: p.cwd }), select: (raw: unknown) => worktreesOf(raw), staleTime: 0 },
  },
  changes: {
    commit: change(repoRoutes.commit),
    commitPush: change(repoRoutes.commitPush),
    sync: change(repoRoutes.sync),
    branchCreate: change(repoRoutes.branchCreate, BRANCH_READS, true),
    branchSwitch: change(repoRoutes.branchSwitch, BRANCH_READS, true),
    branchDelete: change(repoRoutes.branchDelete, BRANCH_READS, true),
    worktreeAdd: change(repoRoutes.worktreeAdd, WORKTREE_ADD_READS, true),
    worktreeRemove: change(repoRoutes.worktreeRemove, WORKTREE_REMOVE_READS, true),
    suggest: {
      route: repoRoutes.suggest,
      input: (v: SuggestVars) => ({ target: v.target, realm: v.realm, cwd: v.cwd, body: { model: v.model } }),
      reads: [],
      select: (raw: unknown) => raw,
    },
  },
} satisfies SourceTable;

const source = coreSource('ai-repo', table);

/** A read's params as JSON with object keys sorted (as the query hash orders them): equal only for the same params. */
const paramsJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** The folder's branches (or worktrees) from a request sent now (core refreshFresh own: never a read already out, never the
 *  cache), or null when that read failed or no page holds the folder's read. What a Check again shows as "now"
 *  (Commit.tsx). Only the read of exactly these params counts (the whole target, server_name included): a cached read of
 *  the same folder under other target metadata is not this one. */
async function freshRead<T>(key: 'branches' | 'worktrees', at: FolderAt): Promise<T | null> {
  const ours = source.readTarget(key, { computer: at.target.container.id });
  const want = paramsJson(at);
  const same = (k: readonly unknown[]): boolean => paramsJson(k[7]) === want;
  const r = await refreshFresh((k) => ours(k) && same(k), { own: true });
  return r.state === 'fresh' && r.answers.length === 1 ? (r.answers[0]!.data as T) : null;
}
export const freshBranches = (at: FolderAt) => freshRead<readonly Branch[]>('branches', at);
export const freshWorktrees = (at: FolderAt) => freshRead<readonly Worktree[]>('worktrees', at);

/** A Reply whose status this page filled in because core did not keep one (a held answer, or a refusal without its
 *  status). commit.ts reads the filled-in status as before; branchAnswer never takes it as proof. */
export type WriteReply = Reply | (Extract<Reply, { kind: 'answer' }> & { readonly guessed: true });

/** A change's result as commit.ts reads it; null when nothing of this send is known (not sent, or an earlier send's hold). */
export function replyOf(r: Pick<SourceResult<unknown>, 'outcome' | 'code' | 'status' | 'details' | 'detailsDropped' | 'data'> | undefined): WriteReply | null {
  if (!r) return null;
  if (r.outcome === 'done') return { kind: 'answer', status: 200, code: null, details: {}, data: r.data };
  if (r.outcome === 'failed') {
    return { kind: 'answer', status: r.status ?? 400, code: r.code ?? null, details: r.details ?? {}, data: {}, ...(r.detailsDropped ? { dropped: true as const } : {}), ...(r.status === undefined ? { guessed: true as const } : {}) };
  }
  if (r.outcome !== 'pending' || r.code === 'READ_BACK_FIRST' || r.code === 'HELD_BY_OTHER') return null;
  // A pending answer keeps its code and details, not its status (core): any 5xx. The agent answers push_failed,
  // git_command_failed and sync_step_failed as 502 (a timed-out push_failed is 503 and says timed_out, which commit.ts
  // reads before the code); every other code reads as an unknown 5xx. The status is filled in (guessed): a branch change
  // never reads it as proof (branchAnswer).
  if (!r.code && !r.details && !r.detailsDropped) return { kind: 'lost' };
  const status = r.code === 'push_failed' || r.code === 'git_command_failed' || r.code === 'sync_step_failed' ? 502 : 500;
  return { kind: 'answer', status, code: r.code ?? null, details: r.details ?? {}, data: {}, ...(r.detailsDropped ? { dropped: true as const } : {}), guessed: true };
}

/** A branch change's answer (a worktree change's too: one git command each), from positive evidence only:
 *  - done: a 200 whose body says git succeeded (status ok and success true) and does not say it timed out;
 *  - refused: git ran and said no: a 502 git_command_failed the answer really carried (never a status filled in for a
 *    held answer), whose details say it did not time out: nothing changed, git's words kept;
 *  - not_run: refused before git ran (a 4xx: a name the agent's ref rules refuse, an account failure), with no timeout;
 *  - unknown: anything else (a lost answer or status, a 200 that does not say so, any timeout (top level or under
 *    details.operation, the account-failure envelope), another 5xx, details dropped). */
export type BranchAnswer =
  | { readonly state: 'done' }
  | { readonly state: 'refused'; readonly output?: string }
  | { readonly state: 'not_run'; readonly account?: AccountFailure; readonly code?: string }
  | { readonly state: 'unknown' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Whether an answer says a command timed out: at its top level, or under `operation` (the account-failure envelope). */
const timedOut = (o: Readonly<Record<string, unknown>>) => o.timed_out === true || (isObj(o.operation) && o.operation.timed_out === true);

export function branchAnswer(r: WriteReply): BranchAnswer {
  if (r.kind === 'lost') return { state: 'unknown' };
  if (r.status >= 200 && r.status < 300) return isObj(r.data) && r.data.status === 'ok' && r.data.success === true && !timedOut(r.data) ? { state: 'done' } : { state: 'unknown' };
  if (r.dropped || 'guessed' in r || timedOut(r.details)) return { state: 'unknown' };
  if (r.status === 502 && r.code === 'git_command_failed' && r.details.timed_out === false) {
    const output = wordsOf(r.details.output);
    return { state: 'refused', ...(output ? { output } : {}) };
  }
  if (r.status >= 400 && r.status < 500) {
    const account = accountFailureOf(r.code) ?? undefined;
    return { state: 'not_run', ...(account ? { account } : r.code ? { code: r.code } : {}) };
  }
  return { state: 'unknown' };
}

/** A Push sent with force (only the push direction carries it; the agent ignores it on the fetch and pull legs). */
export const isForcedPush = (v: Pick<WriteVars, 'op' | 'direction' | 'force'>): boolean => v.op === 'sync' && v.direction === 'push' && v.force === true;

/** One write's answer, as the band shows it. */
export type WriteAnswer =
  | { readonly op: 'commit'; readonly commit: CommitStep }
  | { readonly op: 'commitPush'; readonly pushRefused?: true; readonly answer: CommitPushAnswer }
  | { readonly op: 'sync'; readonly direction: SyncDirection; readonly force?: true; readonly pushRefused?: true; readonly answer: SyncAnswer }
  | { readonly op: BranchOp; readonly branch: string; readonly answer: BranchAnswer }
  | { readonly op: WorktreeOp; readonly path: string; readonly force: boolean; readonly branch?: string; readonly answer: BranchAnswer };

export const isBranchAnswer = (a: WriteAnswer): a is Extract<WriteAnswer, { op: BranchOp }> => isBranchOp(a.op);
export const isWorktreeAnswer = (a: WriteAnswer): a is Extract<WriteAnswer, { op: WorktreeOp }> => isWorktreeOp(a.op);

/** What a write names besides its op: enough to word it and read its answer. */
export type WriteNames = Pick<WriteVars, 'op' | 'direction' | 'branch' | 'path' | 'startRef' | 'force'>;

export function answerOf(v: WriteNames, reply: WriteReply): WriteAnswer {
  if (isBranchOp(v.op)) return { op: v.op, branch: v.branch ?? '', answer: branchAnswer(reply) };
  if (isWorktreeOp(v.op)) {
    // An add that may make a branch names it: an unknown add is checked against the branch list too. Without a branch and a
    // start ref, git makes one named after the path's last part.
    const made = v.op !== 'worktreeAdd' ? '' : v.branch ? v.branch : v.startRef ? '' : (v.path ?? '').split('/').filter(Boolean).pop() ?? '';
    return { op: v.op, path: v.path ?? '', force: v.force === true, ...(made ? { branch: made } : {}), answer: branchAnswer(reply) };
  }
  if (v.op === 'commit') return { op: 'commit', commit: commitAnswer(reply) };
  // pushRefused: the agent answered with the push's own refusal code (502 push_failed, 502 sync_step_failed), not steps
  // kept under another code (429 rate_limited, an account code): only then may Push anyway be offered.
  const refusedBy = (code: string) => (reply.kind === 'answer' && reply.code === code ? { pushRefused: true as const } : {});
  if (v.op === 'commitPush') return { op: 'commitPush', ...refusedBy('push_failed'), answer: commitPushAnswer(reply) };
  const direction = v.direction ?? 'full';
  return { op: 'sync', direction, ...(isForcedPush(v) ? { force: true as const } : {}), ...refusedBy('sync_step_failed'), answer: syncAnswer(reply, direction) };
}

/** Is any step of the answer still unknown? Only an answer with none frees its hold. */
export function anyUnknown(a: WriteAnswer): boolean {
  if (a.op === 'commit') return a.commit.state === 'unknown';
  if (a.op === 'commitPush') return a.answer.commit.state === 'unknown' || a.answer.push.state === 'unknown';
  if (a.op === 'sync') return a.answer.steps.some((s) => s.state === 'unknown');
  return a.answer.state === 'unknown';
}

// The message each held write was sent with, in this tab only (keyed by its hold): "Is this your commit?" compares the
// history with it. A held write read back from storage after a reload has none, and the check then lists the commits
// without offering one.
const messages = new Map<string, string>();
export const sentMessage = (hold: string | undefined): string | undefined => (hold ? messages.get(hold) : undefined);
export const keepMessage = (hold: string | undefined, message: string | undefined): void => {
  if (hold && message) messages.set(hold, message);
};
/** Tests only. */
export const forgetMessages = (): void => messages.clear();

const OPS: readonly WriteOp[] = ['commit', 'commitPush', 'sync', ...BRANCH_OPS, ...WORKTREE_OPS];

/** The folder's writes: one runner each, all held under the folder's one lock. */
export function useRepoWrites(at: FolderAt) {
  const computer = at.target.container.id;
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.cwd === at.cwd, [computer, at.cwd]);
  const vars = useCallback(
    (i: Record<string, unknown>): WriteVars => ({
      target: at.target as Target, realm: String(i.realm ?? ''), cwd: String(i.cwd ?? ''), op: (i.op as WriteOp) ?? 'commit',
      ...(typeof i.direction === 'string' ? { direction: i.direction as SyncDirection } : {}),
      ...(typeof i.branch === 'string' ? { branch: i.branch } : {}), ...(typeof i.path === 'string' ? { path: i.path } : {}),
      ...(typeof i.startRef === 'string' ? { startRef: i.startRef } : {}), ...(typeof i.force === 'boolean' ? { force: i.force } : {}),
      sentAt: typeof i.sentAt === 'number' ? i.sentAt : 0,
    }),
    [at],
  );
  const commitM = source.useMutation<unknown, WriteVars>('commit');
  const pushM = source.useMutation<unknown, WriteVars>('commitPush');
  const syncM = source.useMutation<unknown, WriteVars>('sync');
  const createM = source.useMutation<unknown, WriteVars>('branchCreate');
  const switchM = source.useMutation<unknown, WriteVars>('branchSwitch');
  const deleteM = source.useMutation<unknown, WriteVars>('branchDelete');
  const addM = source.useMutation<unknown, WriteVars>('worktreeAdd');
  const removeM = source.useMutation<unknown, WriteVars>('worktreeRemove');
  const heldBy = useMemo(() => {
    const by = (key: WriteOp) => (h: HeldChange) => source.heldBy(key, h);
    return {
      commit: by('commit'), commitPush: by('commitPush'), sync: by('sync'), branchCreate: by('branchCreate'), branchSwitch: by('branchSwitch'), branchDelete: by('branchDelete'),
      worktreeAdd: by('worktreeAdd'), worktreeRemove: by('worktreeRemove'),
    };
  }, []);
  const runners: Record<WriteOp, ReturnType<typeof useRunner<WriteVars>>> = {
    commit: useRunner<WriteVars>(commitM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.commit }),
    commitPush: useRunner<WriteVars>(pushM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.commitPush }),
    sync: useRunner<WriteVars>(syncM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.sync }),
    branchCreate: useRunner<WriteVars>(createM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.branchCreate }),
    branchSwitch: useRunner<WriteVars>(switchM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.branchSwitch }),
    branchDelete: useRunner<WriteVars>(deleteM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.branchDelete }),
    worktreeAdd: useRunner<WriteVars>(addM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.worktreeAdd }),
    worktreeRemove: useRunner<WriteVars>(removeM, { lock: REPO_WRITE_LOCK, pick, vars, heldBy: heldBy.worktreeRemove }),
  };
  // The held write is its own runner's (heldBy 'self'); the others see it as another's.
  const heldOp = OPS.find((k) => runners[k].held && !runners[k].elsewhere) ?? null;
  const held = heldOp ? runners[heldOp] : null;
  const busy = OPS.some((k) => runners[k].busy);
  return { runners, heldOp, held, busy, blocked: busy || OPS.some((k) => !!runners[k].held), ok: folderOk(at) };
}

/** The model Suggest a message uses: the configured default agent's, else Hoody Free (never another agent's). */
export const useSuggestModel = (at: FolderAt) => source.useQuery<string, FolderAt>('agents', at, { enabled: folderOk(at) });
export const useSuggest = () => source.useMutation<unknown, SuggestVars>('suggest');
/** The folder's worktrees (the Worktrees view; held open while a worktree change's outcome is unknown). */
export const useRepoWorktrees = (at: FolderAt, enabled = true) => source.useQuery<readonly Worktree[], FolderAt>('worktrees', at, { enabled: enabled && folderOk(at) });
