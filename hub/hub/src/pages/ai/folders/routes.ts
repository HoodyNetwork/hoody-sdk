// The repository reads of a folder's page, declared once with core's defineRoute. Each goes to the
// folder's computer's agent, in the folder's realm (the realm picks the GitHub account), for the folder itself (X-Hoody-Cwd).
// The writes: commit, commit and push, sync, and the message suggestion; the branch changes: create,
// switch, delete; the worktree changes: add, remove. Each keeps the agent's details (keepDetails): they say which step ran (details.committed, timed_out, the
// sync steps, git's output). None is idempotent, and nothing is ever sent again on its own.
import { defineRoute } from '@core';

const read = (path: string, query?: readonly string[]) => defineRoute({ method: 'GET', path, scope: 'agent', realm: 'realm', cwd: true, ...(query ? { query } : {}) });

// The agent's own bounds: 30 s for a local git command, 5 min for each network step.
// The Hub waits a minute past them, so its own clock never ends a step the agent is still running.
const QUICK_MS = 90_000;
const STEP_MS = 6 * 60_000;
const write = (path: string, body: readonly string[], timeoutMs: number, refuses?: readonly string[]) =>
  defineRoute({ method: 'POST', path, scope: 'agent', realm: 'realm', cwd: true, body, keepDetails: true, timeoutMs, ...(refuses ? { refuses, readsStatus: true as const } : {}) });
// A branch or worktree change's git_command_failed is the agent's answer for a command that ran to its end and failed (a timed-out one is
// 503 service_unavailable): listed, core keeps that answer's real status, so
// writes.ts branchAnswer reads a refusal only from a 502 it really got. Its holds still keep anything unproven held. The
// success answer comes back with its real status too (readsStatus: {status, body}): only a 200 settles one (writes.ts).
const BRANCH_REFUSES = ['git_command_failed'] as const;

export const repoRoutes = {
  /** The checkout's branch, ahead/behind and change counts, or cloned:false. */
  status: read('/github/status'),
  /** The unified diff: the unstaged tree, or with staged=true the index. */
  diff: read('/github/diff', ['staged']),
  /** The 100 newest commits. */
  log: read('/github/log'),
  /** The local branches with their upstreams. */
  branches: read('/github/branches'),
  /** Every worktree of the folder's repository, its main checkout first (path, branch, detached, bare, locked). */
  worktrees: read('/github/worktrees'),
  /** owner/name of the checkout's GitHub repository (needs a linked account and a remote). */
  identity: read('/github/identity'),
  /** Stage everything and record it (200 = the agent's verbatim reply, committed:true). */
  commit: write('/github/commit', ['message'], QUICK_MS),
  /** Stage, record, then push (200 {committed}; once recorded, every refusal carries details.committed:true). */
  commitPush: write('/github/commit/push', ['message'], STEP_MS),
  /** fetch → pull → push, or one direction; stops at the first failing step (502 sync_step_failed lists the steps that ran).
   *  force: Push anyway, the agent's --force-with-lease on the push leg; sent only with direction push. */
  sync: write('/github/sync', ['direction', 'force'], 3 * STEP_MS),
  /** A message for the current diff, written by `model` (the diff goes to that model's provider, and the call is billed). */
  suggest: write('/github/commit/suggest-message', ['model'], STEP_MS),
  /** A new branch at the current commit, and the folder moves onto it (`git switch -c`; it tracks nothing yet). */
  branchCreate: write('/github/branch', ['branch'], QUICK_MS, BRANCH_REFUSES),
  /** The folder moves onto an existing branch (never forced: git refuses to overwrite local changes). */
  branchSwitch: write('/github/branch/switch', ['branch'], QUICK_MS, BRANCH_REFUSES),
  /** Deletes a local branch, FORCED (`git branch -D`: even unmerged; the branch on GitHub is not touched). */
  branchDelete: write('/github/branch/delete', ['branch'], QUICK_MS, BRANCH_REFUSES),
  /** A second working tree of the repository at an absolute path: on a NEW branch (git's -b, starting at start_ref or the
   *  current commit), or on an existing ref (start_ref). git refuses a non-empty path or a branch in use in another one. */
  worktreeAdd: write('/github/worktrees', ['path', 'branch', 'start_ref'], QUICK_MS, BRANCH_REFUSES),
  /** Deletes a linked worktree's folder (never the main one: a 400; its branch stays). Without force git refuses one with
   *  uncommitted or untracked changes, or a locked one; force:true DISCARDS those changes. */
  worktreeRemove: write('/github/worktrees/remove', ['path', 'force'], QUICK_MS, BRANCH_REFUSES),
} as const;
