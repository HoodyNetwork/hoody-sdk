// Fake agent answers for a folder's Repository tab, for the preview and the tests. One checkout, read only: a
// modified file and a new one not staged, a staged rename, a staged binary, a deleted file; three commits; two branches.
// Account failures answer with the agent's fixed code and status. Names from the
// fixture world (Ada). The folder page's link finds its computer in the account's whole list (folderRules).
import { accountContainersRoute, answers, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { routes as aiRoutes } from '../routes';
import { TRUNCATED, type AccountFailure } from './logic';
import { repoRoutes } from './routes';

// The sample line names the environment variable through ENV_PORT: the source text itself never holds an env-read token,
// so the test result cache does not take this fixture for code that reads the environment (the test runner's environment rule).
const ENV_PORT = ['process', 'env', 'PORT'].join('.');

export const UNSTAGED_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,3 +1,4 @@',
  ' import { start } from "./start";',
  '-start(8080);',
  `+const port = Number(${ENV_PORT} ?? 8080);`,
  '+start(port);',
  ' export {};',
  'diff --git a/docs/old.md b/docs/old.md',
  'deleted file mode 100644',
  'index 3333333..0000000',
  '--- a/docs/old.md',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-# Old notes',
  '-Gone.',
  '',
].join('\n');

export const STAGED_DIFF = [
  'diff --git a/src/util.ts b/src/helpers.ts',
  'similarity index 90%',
  'rename from src/util.ts',
  'rename to src/helpers.ts',
  'index 4444444..5555555 100644',
  '--- a/src/util.ts',
  '+++ b/src/helpers.ts',
  '@@ -1 +1 @@',
  '-export const one = 1;',
  '+export const one = 1 as const;',
  'diff --git a/assets/logo.png b/assets/logo.png',
  'new file mode 100644',
  'index 0000000..6666666',
  'Binary files /dev/null and b/assets/logo.png differ',
  '',
].join('\n');

const COMMITS = [
  { sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', subject: 'Read the port from the environment', author: 'Ada', age: '2 hours ago' },
  { sha: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890', subject: 'Add the start script', author: 'Ada', age: '3 days ago' },
  { sha: 'c3d4e5f60718293a4b5c6d7e8f90123456789012', subject: 'First commit', author: 'Ada', age: '2 weeks ago' },
];
const BRANCHES = [
  { name: 'main', upstream: 'origin/main', current: true },
  { name: 'try-port', upstream: '', current: false },
];
type FixtureWorktree = { path: string; branch: string; detached: boolean; bare: boolean; locked: boolean };
/** The main folder (listed first, as the agent does) and one linked worktree on try-port. */
export const WORKTREES: readonly FixtureWorktree[] = [
  { path: '/home/ada/shop', branch: 'main', detached: false, bare: false, locked: false },
  { path: '/home/ada/shop-try', branch: 'try-port', detached: false, bare: false, locked: false },
];

const ACCOUNT_STATUS: Record<AccountFailure, number> = {
  not_linked: 409, account_missing: 409, token_invalid: 409, token_forbidden: 403, store_corrupt: 409, store_unavailable: 503,
};

export interface RepoOpts {
  /** The folder is not in a work tree (status cloned:false). */
  none?: boolean;
  /** Nothing changed in tracked files. */
  clean?: boolean;
  /** Every read answers this account failure. */
  account?: AccountFailure;
  /** The status read fails with a gateway error. */
  statusFails?: boolean;
  /** The unstaged diff read fails with a gateway error. */
  diffFails?: boolean;
  /** The unstaged diff hit the agent's 1 MiB cap. */
  truncated?: boolean;
  /** A repository with no commits yet. */
  noCommits?: boolean;
  detached?: boolean;
  /** Files with a merge conflict (status conflicts). */
  conflicts?: number;
  /** Status answers; the other reads answer this account failure (the account changed after the status read). */
  readsAccount?: AccountFailure;
  /** Tests only: a diff answers once its gate settles (a function: read at each request, a new gate per read). */
  unstagedGate?: Promise<void> | (() => Promise<void>);
  stagedGate?: Promise<void> | (() => Promise<void>);
  /** Tests only: the branch list, read at each request (a change between reads); 'fail' answers that read with a gateway error. */
  branches?: () => readonly { name: string; upstream: string; current: boolean }[] | 'fail';
  /** Tests only: a branches read answers what the list was when the request arrived, once this gate settles. */
  branchesGate?: () => Promise<void> | undefined;
  /** Tests only: the worktree list, read at each request; 'fail' answers that read with a gateway error. */
  worktrees?: () => readonly FixtureWorktree[] | 'fail';
  /** Tests only: the diff texts, read at each request (a change between reads). */
  diffs?: () => { unstaged: string; staged: string };
  /** Tests only: sees each request as it arrives. */
  onSend?: (r: FixtureRequest) => void;
}

export function repoRules(o: RepoOpts = {}): FixtureRule[] {
  const seen = (r: FixtureRequest) => { o.onSend?.(r); };
  const fail = () => (o.account ? answers.refused(ACCOUNT_STATUS[o.account], `github_${o.account}`) : null);
  const readFail = () => (o.readsAccount ? answers.refused(ACCOUNT_STATUS[o.readsAccount], `github_${o.readsAccount}`) : null);
  return [
    reply(repoRoutes.status, (r) => {
      seen(r);
      if (o.statusFails) return answers.pending5xx();
      if (o.none) return answers.ok({ status: 'ok', cloned: false });
      return fail() ?? answers.ok({
        status: 'ok', cloned: true, branch: o.detached ? '' : 'main', detached: !!o.detached, ahead: 1, behind: 2,
        changed: o.clean ? 0 : 4, untracked: o.clean ? 0 : 1, conflicts: o.conflicts ?? 0, dirty: !o.clean, clean: !!o.clean,
      });
    }),
    reply(repoRoutes.diff, async (r) => {
      seen(r);
      const staged = r.query.staged === 'true';
      const g = staged ? o.stagedGate : o.unstagedGate;
      await (typeof g === 'function' ? g() : g);
      if (o.diffFails && !staged) return answers.pending5xx();
      const bad = readFail();
      if (bad) return bad;
      if (o.diffs) { const d = o.diffs(); return answers.ok({ status: 'ok', diff: staged ? d.staged : d.unstaged }); }
      if (o.clean) return fail() ?? answers.ok({ status: 'ok', diff: '' });
      const text = staged ? STAGED_DIFF : UNSTAGED_DIFF + (o.truncated ? TRUNCATED : '');
      return fail() ?? answers.ok({ status: 'ok', diff: text });
    }),
    reply(repoRoutes.log, (r) => { seen(r); return readFail() ?? fail() ?? answers.ok({ status: 'ok', commits: o.noCommits ? [] : COMMITS }); }),
    reply(repoRoutes.branches, async (r) => {
      seen(r);
      const list = o.branches ? o.branches() : o.noCommits ? [] : BRANCHES;
      await o.branchesGate?.();
      return list === 'fail' ? answers.pending5xx() : readFail() ?? fail() ?? answers.ok({ status: 'ok', branches: list });
    }),
    reply(repoRoutes.worktrees, (r) => {
      seen(r);
      const list = o.worktrees ? o.worktrees() : WORKTREES;
      return list === 'fail' ? answers.pending5xx() : readFail() ?? fail() ?? answers.ok({ status: 'ok', worktrees: list });
    }),
    reply(repoRoutes.identity, (r) => { seen(r); return fail() ?? answers.ok({ status: 'ok', owner: 'ada', repo: 'shop', full_name: 'ada/shop' }); }),
  ];
}

export interface FolderOpts {
  /** The account list fails (a 5xx). */
  computersFail?: boolean;
  /** The account list's rows, in place of the fixture world's computers. */
  computers?: readonly Record<string, unknown>[];
  /** Tests only: the account list's page `page` answers 5xx while this says so. */
  pageFails?: (page: number) => boolean;
  /** Tests only: the account list's page `page` answers once this promise settles (undefined: at once). */
  pageHold?: (page: number) => Promise<void> | undefined;
  /** Tests only: sees each request as it arrives. */
  onSend?: (r: FixtureRequest) => void;
}

/** GET /computers on the base host (every realm): the fixture world's computers, or the test's rows, one page of them
 *  as the API answers ?page=&limit= (page 1 and 100 rows when the query leaves them out). */
export function folderRules(o: FolderOpts = {}): FixtureRule[] {
  return [
    reply(accountContainersRoute, async (r) => {
      o.onSend?.(r);
      const page = Number(r.query.page ?? 1);
      await o.pageHold?.(page);
      if (o.computersFail || o.pageFails?.(page)) return answers.pending5xx();
      const rows = o.computers ?? fixtureWorld.computers.map((c) => ({ id: c.id, name: c.name, project_id: c.project_id, server_name: c.server_name, status: c.status }));
      const limit = Number(r.query.limit ?? 100);
      return answers.ok({ data: { computers: rows.slice((page - 1) * limit, page * limit) } });
    }),
  ];
}

/** The agent's error envelope: {code, message, details} (httpapi errors). */
export const agentError = (status: number, code: string, details: Record<string, unknown> = {}, message = 'refused'): FixtureAnswer => ({ status, body: { code, message, details } });

type Responder = FixtureAnswer | ((r: FixtureRequest) => FixtureAnswer | Promise<FixtureAnswer>);

export interface WriteOpts {
  /** Each write's answer (default: the success shape). */
  commit?: Responder;
  commitPush?: Responder;
  sync?: Responder;
  suggest?: Responder;
  /** The branch changes. */
  branchCreate?: Responder;
  branchSwitch?: Responder;
  branchDelete?: Responder;
  /** The worktree changes. */
  worktreeAdd?: Responder;
  worktreeRemove?: Responder;
  /** The agent list (Suggest a message reads the configured default agent's model); default: none configured. */
  agents?: Responder;
  /** Tests only: sees each request as it arrives. */
  onSend?: (r: FixtureRequest) => void;
}

const SYNC_OK = { status: 'ok', steps: ['fetch', 'pull', 'push'].map((s) => ({ step: `github.${s}`, result: { status: 'ok', success: true } })) };

const GIT_OK = (output: string) => answers.ok({ status: 'ok', success: true, exit_code: 0, timed_out: false, output });

/** The folder's writes: commit, commit and push, sync, the message suggestion, and the agent list it reads; the
 *  branch changes and worktree changes, answering git's success shape. */
export function writeRules(o: WriteOpts = {}): FixtureRule[] {
  const on = (d: Responder) => (r: FixtureRequest) => { o.onSend?.(r); return typeof d === 'function' ? d(r) : d; };
  return [
    reply(repoRoutes.commit, on(o.commit ?? answers.ok({ status: 'ok', success: true, committed: true }))),
    reply(repoRoutes.commitPush, on(o.commitPush ?? answers.ok({ status: 'ok', success: true, committed: true }))),
    reply(repoRoutes.sync, on(o.sync ?? ((r: FixtureRequest) => {
      const d = (r.body as { direction?: string } | null)?.direction;
      return answers.ok({ ...SYNC_OK, steps: SYNC_OK.steps.filter((s) => (d === 'pull' ? s.step !== 'github.push' : d === 'push' ? s.step === 'github.push' : true)) });
    }))),
    reply(repoRoutes.suggest, on(o.suggest ?? answers.ok({ status: 'ok', message: COMMITS[0]!.subject, cost_usd: 0 }))),
    reply(repoRoutes.branchCreate, on(o.branchCreate ?? GIT_OK("Switched to a new branch 'next'"))),
    reply(repoRoutes.branchSwitch, on(o.branchSwitch ?? GIT_OK("Switched to branch 'try-port'"))),
    reply(repoRoutes.branchDelete, on(o.branchDelete ?? GIT_OK('Deleted branch try-port (was b2c3d4e).'))),
    reply(repoRoutes.worktreeAdd, on(o.worktreeAdd ?? GIT_OK("Preparing worktree (new branch 'next')"))),
    reply(repoRoutes.worktreeRemove, on(o.worktreeRemove ?? GIT_OK(''))),
    reply(aiRoutes.agents, on(o.agents ?? answers.ok({ items: [{ name: 'general', model: '' }] }))),
  ];
}
