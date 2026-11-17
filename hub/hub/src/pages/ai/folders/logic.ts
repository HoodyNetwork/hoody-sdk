// A folder's repository, read only: the agent's status, diff, log and branch answers → what the
// Repository tab draws, and an account failure → its typed words. Agent facts (its
// github.status / github.branch.list commands, openapi githubDiff / githubLog):
//   - status: {status:'ok', cloned:false} (not a work tree) or {cloned:true, branch, detached, ahead, behind, changed, untracked,
//     conflicts}. It is the checkout's own view: ahead/behind compare with the last fetch, never a check with GitHub, and the
//     answer names no fetch time, so the Hub labels it with the time it read it.
//   - diff: one unified-diff string; staged=true is the index, else the unstaged tree (disjoint views). It ends with
//     "…(output truncated)" when it hit the 1 MiB cap. Untracked files are in neither.
//   - log: the 100 newest commits {sha, subject, author, age}; an empty list is a repository with no commits yet.
//   - branches: [{name, upstream, current}].
//   - Account failures: one fixed code per kind, details.kind too.

import { stringOrEmpty as str } from '@core';

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

export type RepoStatus =
  | { readonly kind: 'repo'; readonly branch: string; readonly detached: boolean; readonly ahead: number; readonly behind: number; readonly changed: number; readonly untracked: number; readonly conflicts: number; readonly readAt: number }
  | { readonly kind: 'none' };

/** The status answer, read at `readAt` (ms). Anything that is not a clear answer throws (the read fails, never a guess). */
export function statusOf(raw: unknown, readAt: number): RepoStatus {
  if (!obj(raw) || raw.status !== 'ok') throw new Error('NOT_A_STATUS');
  if (raw.cloned === false) return { kind: 'none' };
  if (raw.cloned !== true) throw new Error('NOT_A_STATUS');
  return {
    kind: 'repo', branch: str(raw.branch), detached: raw.detached === true,
    ahead: count(raw.ahead), behind: count(raw.behind), changed: count(raw.changed), untracked: count(raw.untracked), conflicts: count(raw.conflicts),
    readAt,
  };
}

export const TRUNCATED = '…(output truncated)';
/** M modified, A added, D deleted, R renamed, U unmerged (a combined `diff --cc` section of a merge conflict). */
export type ChangeKind = 'M' | 'A' | 'D' | 'R' | 'U';
export interface FileDiff {
  /** The path after the change (the old one for a delete). */
  readonly path: string;
  /** A rename's old path. */
  readonly from: string | null;
  readonly kind: ChangeKind;
  readonly added: number;
  readonly removed: number;
  readonly binary: boolean;
  /** This file's own part of the diff, header included. */
  readonly text: string;
}
export interface Diff { readonly files: readonly FileDiff[]; readonly truncated: boolean }

// "a/x" or "b/x"; a quoted path ("\"a/sp ace\"") is unquoted with C escapes left as they are (names only, never used to read).
function side(p: string, pre: 'a/' | 'b/'): string | null {
  let s = p.trim();
  if (s === '/dev/null') return null;
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.startsWith(pre) ? s.slice(2) : s;
}

// The paths of a `diff --git a/X b/Y` line. Git quotes a name with special characters ("a/x\ty") but not one with
// spaces, so `a/my file b/my file` is read as two equal halves; a rename's halves differ, and its names come from the
// rename from/to lines instead. null when the line cannot be split.
function gitLinePaths(rest: string): [string, string] | null {
  const q = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/.exec(rest);
  if (q) return [q[1]!, q[2]!];
  if ((rest.length - 1) % 2 === 0) {
    const half = (rest.length - 1) / 2;
    const a = rest.slice(0, half), b = rest.slice(half + 1);
    if (rest[half] === ' ' && a.startsWith('a/') && b.startsWith('b/') && a.slice(2) === b.slice(2)) return [a, b];
  }
  return null;
}

/** The diff answer cut into files. A diff that is not a string throws. A file section is never dropped: one whose name
 *  cannot be read keeps its header's text as its name, so a change is never reported as no change. */
export function diffOf(raw: unknown): Diff {
  if (!obj(raw) || raw.status !== 'ok' || typeof raw.diff !== 'string') throw new Error('NOT_A_DIFF');
  let text = raw.diff.replace(/\r\n/g, '\n');
  const truncated = text.trimEnd().endsWith(TRUNCATED);
  if (truncated) text = text.trimEnd().slice(0, -TRUNCATED.length);
  const files: FileDiff[] = [];
  const parts = text.split(/^(?=diff --(?:git|cc|combined) )/m).filter((p) => /^diff --(?:git|cc|combined) /.test(p));
  for (const part of parts) {
    const lines = part.split('\n');
    const head = lines[0] ?? '';
    const combined = !head.startsWith('diff --git ');
    let oldP: string | null | undefined, newP: string | null | undefined, from: string | null = null;
    let kind: ChangeKind = combined ? 'U' : 'M';
    let added = 0, removed = 0, binary = false, inHunk = false;
    for (const l of lines.slice(1)) {
      if (!inHunk) {
        if (l.startsWith('--- ')) oldP = side(l.slice(4), 'a/');
        else if (l.startsWith('+++ ')) newP = side(l.slice(4), 'b/');
        else if (!combined && l.startsWith('new file mode')) kind = 'A';
        else if (!combined && l.startsWith('deleted file mode')) kind = 'D';
        else if (l.startsWith('rename from ')) { from = l.slice(12); kind = 'R'; }
        else if (l.startsWith('rename to ')) newP = l.slice(10);
        else if (l.startsWith('Binary files ')) binary = true;
        else if (l.startsWith('@@')) inHunk = true;
        continue;
      }
      // A combined hunk line has one column per parent: a '+' in any counts as added, a '-' as removed.
      const cols = combined ? l.slice(0, 2) : l.slice(0, 1);
      if (cols.includes('+')) added++;
      else if (cols.includes('-')) removed++;
    }
    let path = (kind === 'D' ? oldP : newP) ?? null;
    if (!path) {
      const rest = head.replace(/^diff --(?:git|cc|combined) /, '');
      if (combined) path = side(rest, 'b/');
      else {
        const two = gitLinePaths(rest);
        path = two ? side(two[kind === 'D' ? 0 : 1]!, kind === 'D' ? 'a/' : 'b/') : rest.trim();
      }
    }
    files.push({ path: path || head, from, kind, added, removed, binary, text: part.replace(/\n$/, '') });
  }
  return { files, truncated };
}

export interface Commit { readonly sha: string; readonly subject: string; readonly author: string; readonly age: string }
export function logOf(raw: unknown): readonly Commit[] {
  if (!obj(raw) || raw.status !== 'ok' || !Array.isArray(raw.commits)) throw new Error('NOT_A_LOG');
  return raw.commits.filter(obj).map((c) => ({ sha: str(c.sha), subject: str(c.subject), author: str(c.author), age: str(c.age) })).filter((c) => /^[0-9a-f]{4,64}$/.test(c.sha));
}

export interface Branch { readonly name: string; readonly upstream: string; readonly current: boolean }
export function branchesOf(raw: unknown): readonly Branch[] {
  if (!obj(raw) || raw.status !== 'ok' || !Array.isArray(raw.branches)) throw new Error('NOT_BRANCHES');
  return raw.branches.filter(obj).map((b) => ({ name: str(b.name), upstream: str(b.upstream), current: b.current === true })).filter((b) => b.name !== '');
}

export interface RepoIdentity { readonly fullName: string }
export function identityOf(raw: unknown): RepoIdentity {
  if (!obj(raw) || raw.status !== 'ok') throw new Error('NOT_AN_IDENTITY');
  const full = str(raw.full_name) || (str(raw.owner) && str(raw.repo) ? `${str(raw.owner)}/${str(raw.repo)}` : '');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(full)) throw new Error('NOT_AN_IDENTITY');
  return { fullName: full };
}

/** The account failure kinds the agent names; any other code is not an account failure. */
export const ACCOUNT_FAILURES = ['not_linked', 'account_missing', 'token_invalid', 'token_forbidden', 'store_corrupt', 'store_unavailable'] as const;
export type AccountFailure = (typeof ACCOUNT_FAILURES)[number];
/** A read's error code → its account failure, or null when it is another failure. */
export function accountFailureOf(code: string | null | undefined): AccountFailure | null {
  const k = (code ?? '').replace(/^github_/, '');
  return (ACCOUNT_FAILURES as readonly string[]).includes(k) && (code ?? '').startsWith('github_') ? (k as AccountFailure) : null;
}
