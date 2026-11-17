// A folder's pull requests and issues, on core. Every call names the folder's
// computer, its realm and the folder itself; the lists also name the repository (owner/repo from the identity read: the agent
// never infers it for a list). Agent facts (openapi githubListPRs / githubPullRequest / githubCheckoutPR / githubMergePR /
// githubListIssues / githubCreateIssue):
//   - The lists are GitHub's recent slice (newest-updated first, at most 200, no cursor); an empty list is an answer.
//   - A create, checkout or merge answers 200 only when the command ran and succeeded; a ran-but-failed command is 502
//     git_command_failed and a command killed on its deadline 503 with timed_out:true. Neither proves nothing was made
//     (gh can exit non-zero after GitHub made it, its answer lost on the way back), so both read as unknown. Only an
//     account store that could not be read is refused before the command runs. The 200 of a create carries no number:
//     gh prints the new link on its output.
//   - None of these is keyed (no idempotency key on the agent), so none is ever sent again by the Hub: a lost answer is
//     held under its lock until the person settles it (Check reads the list; the person picks theirs, never the Hub) or
//     dismisses it. A merge is proven by the list (the pull request reads merged); nothing proves a create or a checkout.
import { coreSource, defineRoute, heldChanges, stringOrEmpty as str, useChangesVersion, type HeldChange, type SourceTable } from '@core';
import { useMemo } from 'react';
import type { FolderAt } from './data';

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** gh runs up to 5 minutes on the agent, which answers within 7: the Hub waits
 *  past that, so only a call that truly ran over reads as unknown. */
export const SEND_TIMEOUT_MS = 450_000;
/** Refused before anything ran, whatever the status (a 5xx included): the account store could not be read. Every other
 *  5xx (git_command_failed and a timeout included) and a lost answer may have made it. */
const REFUSES = ['github_store_unavailable'];

const read = (path: string) => defineRoute({ method: 'GET', path, scope: 'agent', realm: 'realm', cwd: true, query: ['owner', 'repo', 'state'] });

export const prRoutes = {
  /** The repository's pull requests (owner/repo required; state open, closed or all). */
  pulls: read('/github/pr'),
  /** The repository's issues, pull requests left out (owner/repo required; state open, closed or all). */
  issues: read('/github/issues'),
  /** Opens an issue on the repository the folder's checkout belongs to. Not keyed: never sent again. */
  createIssue: defineRoute<unknown, { title: string; body: string }>({
    method: 'POST', path: '/github/issues', scope: 'agent', realm: 'realm', cwd: true, body: ['title', 'body'], refuses: REFUSES, keepDetails: true, timeoutMs: SEND_TIMEOUT_MS,
  }),
  /** Opens a pull request from the folder's current branch (gh pushes the branch first). Not keyed: never sent again. */
  createPull: defineRoute<unknown, { title: string; body: string; base?: string }>({
    method: 'POST', path: '/github/pr', scope: 'agent', realm: 'realm', cwd: true, body: ['title', 'body', 'base'], refuses: REFUSES, keepDetails: true, timeoutMs: SEND_TIMEOUT_MS,
  }),
  /** Checks a pull request's head out in the folder, detached from any branch. */
  checkoutPull: defineRoute<unknown, { number: number }>({
    method: 'POST', path: '/github/pr/checkout', scope: 'agent', realm: 'realm', cwd: true, body: ['number'], refuses: REFUSES, keepDetails: true, timeoutMs: SEND_TIMEOUT_MS,
  }),
  /** Merges a pull request on GitHub (its base branch changes; this API cannot undo it). */
  mergePull: defineRoute<unknown, { number: number; method: MergeMethod }>({
    method: 'POST', path: '/github/pr/merge', scope: 'agent', realm: 'realm', cwd: true, body: ['number', 'method'], refuses: REFUSES, keepDetails: true, timeoutMs: SEND_TIMEOUT_MS,
  }),
} as const;

export type ListState = 'open' | 'closed' | 'all';
export type PullState = 'open' | 'draft' | 'merged' | 'closed';
export type MergeMethod = 'merge' | 'squash' | 'rebase';
/** `repo`: the repository the list was read for (owner/name, lower case), so a merge is proven only by its own repository. */
export interface Pull { readonly number: number; readonly title: string; readonly state: PullState; readonly author: string; readonly head: string; readonly url: string; readonly repo: string }
export interface Issue { readonly number: number; readonly title: string; readonly state: 'open' | 'closed'; readonly author: string; readonly url: string }

const num = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);
/** A link the page may open: http(s) only (the strings are GitHub's, redacted by the agent, never trusted as markup). */
export const safeUrl = (v: unknown): string => {
  const s = str(v);
  try { return /^https?:$/.test(new URL(s).protocol) ? s : ''; } catch { return ''; }
};
const PULL_STATES: readonly PullState[] = ['open', 'draft', 'merged', 'closed'];

/** The pull request list of `repo` (owner/name). Anything that is not a list answer throws (the read fails, never a
 *  guess); a row without a number is dropped (nothing could act on it). */
export function pullsOf(raw: unknown, repo: string): readonly Pull[] {
  if (!obj(raw) || raw.status !== 'ok' || !Array.isArray(raw.pulls)) throw new Error('NOT_PULLS');
  return raw.pulls.filter(obj).map((p): Pull => {
    const st = str(p.state);
    const state: PullState = (PULL_STATES as readonly string[]).includes(st) ? (st as PullState) : p.merged === true ? 'merged' : p.draft === true ? 'draft' : 'closed';
    return { number: num(p.number), title: str(p.title), state, author: str(p.author), head: str(p.head), url: safeUrl(p.url), repo: repoKey(repo) };
  }).filter((p) => p.number > 0);
}

export function issuesOf(raw: unknown): readonly Issue[] {
  if (!obj(raw) || raw.status !== 'ok' || !Array.isArray(raw.issues)) throw new Error('NOT_ISSUES');
  return raw.issues.filter(obj).map((i): Issue => ({
    number: num(i.number), title: str(i.title), state: str(i.state) === 'closed' ? 'closed' : 'open', author: str(i.author), url: safeUrl(i.url),
  })).filter((i) => i.number > 0);
}

/** Whether a send's 200 says gh ran to the end. Any other 200 (an older agent, a cut command) may have gone through:
 *  core keeps it held (settles), as a lost answer. */
export const ran = (raw: unknown): raw is Record<string, unknown> => obj(raw) && raw.success === true && raw.timed_out !== true;

/** What a create's 200 says: made, with the link gh printed when there is one. A 200 that does not say the command
 *  succeeded proves nothing (unknown; core holds it: settles). */
export type Made = { readonly kind: 'made'; readonly url: string; readonly number: number } | { readonly kind: 'unknown' };
export function madeOf(raw: unknown, what: 'issues' | 'pull'): Made {
  if (!ran(raw)) return { kind: 'unknown' };
  const re = what === 'issues' ? /https?:\/\/[^\s"'<>]+\/issues\/(\d+)/g : /https?:\/\/[^\s"'<>]+\/pull\/(\d+)/g;
  const all = [...str(raw.output).matchAll(re)];
  const last = all[all.length - 1];
  const url = last ? safeUrl(last[0]) : '';
  return { kind: 'made', url, number: url && last ? Number(last[1]) : 0 };
}

/** The titles that may be the one sent: the same words, spaces at the ends and runs of spaces ignored, any case. The
 *  person picks; the Hub never claims one. */
export const sameTitle = (a: string, b: string): boolean => norm(a) !== '' && norm(a) === norm(b);
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
/** A repository's name as the proofs compare it (GitHub names are case-insensitive). */
export const repoKey = (fullName: string): string => fullName.toLowerCase();

/** A list read: the folder plus the repository (from the identity read) and the state shown. */
export interface ListAt extends FolderAt { readonly owner: string; readonly repo: string; readonly state: ListState }
export interface CreateVars extends FolderAt { readonly title: string; readonly body: string }
export interface PullCreateVars extends CreateVars { readonly base: string }
export interface PullVars extends FolderAt { readonly number: number }
/** `repo`: the repository of the list the pull request was picked from (owner/name). */
export interface MergeVars extends PullVars { readonly method: MergeMethod; readonly repo: string }

/** One change of a folder: its computer, realm and path; the lists and banners show only this folder's holds. */
const folderKey = (v: FolderAt) => ({ computer: v.target.container.id, realm: v.realm, cwd: v.cwd });
export type SendIdentity = { readonly computer: string; readonly realm: string; readonly cwd: string } & ({ readonly title: string } | { readonly number: number });

export const ISSUE_LOCK = 'agent.github_issue_create';
export const PULL_LOCK = 'agent.github_pr_create';
export const CHECKOUT_LOCK = 'agent.github_pr_checkout';
export const MERGE_LOCK = 'agent.github_pr_merge';

const where = (p: FolderAt) => ({ target: p.target, realm: p.realm, cwd: p.cwd });

export const prTable = {
  reads: {
    pulls: { route: prRoutes.pulls, input: (p: ListAt) => ({ ...where(p), query: { owner: p.owner, repo: p.repo, state: p.state } }), select: (raw, p: ListAt) => pullsOf(raw, `${p.owner}/${p.repo}`), staleTime: 0 },
    issues: { route: prRoutes.issues, input: (p: ListAt) => ({ ...where(p), query: { owner: p.owner, repo: p.repo, state: p.state } }), select: (raw) => issuesOf(raw), staleTime: 0 },
  },
  changes: {
    // A create is held per folder and title, the title compared as Check compares it (sameTitle: case and spacing do not
    // make another issue), so an equal title waits for the first in every tab. The held identity keeps the words as sent
    // (no secret: the title is the person's own words for GitHub; the body is never part of it). Nothing proves it: the
    // person picks.
    createIssue: {
      route: prRoutes.createIssue,
      input: (v: CreateVars) => ({ ...where(v), body: { title: v.title.trim(), body: v.body } }),
      lock: ISSUE_LOCK,
      lockKey: (v: CreateVars) => ({ ...folderKey(v), title: norm(v.title) }),
      identity: (v: CreateVars): SendIdentity => ({ ...folderKey(v), title: v.title.trim() }),
      select: (raw) => madeOf(raw, 'issues'),
      settles: (raw) => madeOf(raw, 'issues').kind === 'made',
      reads: ['issues'],
    },
    createPull: {
      route: prRoutes.createPull,
      input: (v: PullCreateVars) => ({ ...where(v), body: { title: v.title.trim(), body: v.body, ...(v.base.trim() ? { base: v.base.trim() } : {}) } }),
      lock: PULL_LOCK,
      lockKey: (v: PullCreateVars) => ({ ...folderKey(v), title: norm(v.title) }),
      identity: (v: PullCreateVars): SendIdentity => ({ ...folderKey(v), title: v.title.trim() }),
      select: (raw) => madeOf(raw, 'pull'),
      settles: (raw) => madeOf(raw, 'pull').kind === 'made',
      reads: ['pulls'],
    },
    // One checkout at a time in a folder: a second one would move the same checkout.
    checkoutPull: {
      route: prRoutes.checkoutPull,
      input: (v: PullVars) => ({ ...where(v), body: { number: v.number } }),
      lock: CHECKOUT_LOCK,
      lockKey: (v: PullVars) => folderKey(v),
      identity: (v: PullVars): SendIdentity => ({ ...folderKey(v), number: v.number }),
      select: () => undefined,
      settles: ran,
    },
    // A merge is proven by a fresh list of ITS repository that reads it merged (core reads back every pulls list on the
    // computer, other folders' too: each row names its repository); a list that does not show it merged proves nothing.
    mergePull: {
      route: prRoutes.mergePull,
      input: (v: MergeVars) => ({ ...where(v), body: { number: v.number, method: v.method } }),
      lock: MERGE_LOCK,
      lockKey: (v: MergeVars) => ({ ...folderKey(v), number: v.number }),
      identity: (v: MergeVars): SendIdentity & { repo: string } => ({ ...folderKey(v), number: v.number, repo: repoKey(v.repo) }),
      select: () => undefined,
      settles: ran,
      reads: ['pulls'],
      proves: (identity, answers) => {
        const { number: n, repo } = identity as { number?: unknown; repo?: unknown };
        if (typeof repo !== 'string' || !repo) return undefined;
        return (answers[0] ?? []).some((list) => Array.isArray(list) && (list as readonly Pull[]).some((p) => p.repo === repo && p.number === n && p.state === 'merged')) ? 'applied' : undefined;
      },
    },
  },
} satisfies SourceTable;

const SOURCE = 'ai-repo-prs';
const source = coreSource(SOURCE, prTable);

const RE24 = /^[0-9a-f]{24}$/;
const listOk = (p: ListAt | null): p is ListAt =>
  !!p && p.cwd.startsWith('/') && (p.realm === 'global' || RE24.test(p.realm)) && !!p.target.container.id && !!p.owner && !!p.repo;
const params = (p: ListAt | null): ListAt => p ?? ({ target: { project: { id: '' }, container: { id: '' } }, realm: '', cwd: '', owner: '', repo: '', state: 'open' });

export const usePulls = (p: ListAt | null, enabled = true) => source.useQuery<readonly Pull[], ListAt>('pulls', params(p), { enabled: enabled && listOk(p) });
export const useIssues = (p: ListAt | null, enabled = true) => source.useQuery<readonly Issue[], ListAt>('issues', params(p), { enabled: enabled && listOk(p) });
export const useCreateIssue = () => source.useMutation<Made, CreateVars>('createIssue');
export const useCreatePull = () => source.useMutation<Made, PullCreateVars>('createPull');
export const useCheckoutPull = () => source.useMutation<undefined, PullVars>('checkoutPull');
export const useMergePull = () => source.useMutation<undefined, MergeVars>('mergePull');
export const heldBy = (key: keyof typeof prTable.changes, h: HeldChange) => source.heldBy(key, h);
/** Read both lists again (the Repository tab's Read again on these views). */
export const refreshLists = (): Promise<void> => source.invalidate(['pulls', 'issues']);

/** This folder's held sends of a lock, oldest first, read in the folder's own realm (never the top bar's: a folder page
 *  shows its own realm's holds). Re-read when core's changes move. */
export function useFolderHeld(lock: string, at: FolderAt): readonly HeldChange[] {
  const version = useChangesVersion();
  return useMemo(() => {
    const k = folderKey(at);
    return heldChanges(lock, { realm: at.realm }).filter((h) => {
      const i = (h.identity ?? {}) as Record<string, unknown>;
      return i.computer === k.computer && i.realm === k.realm && i.cwd === k.cwd;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, at.target.container.id, at.realm, at.cwd, version]);
}

/** The forms this page life sent, by folder and title, whose outcome was made or unknown: a second submit of one asks
 *  first ("This may create a second issue"). In memory only: a reload forgets it (the held band keeps what is unknown). */
const sentForms = new Set<string>();
const formKey = (kind: 'issue' | 'pull', v: CreateVars) => [kind, v.target.container.id, v.realm, v.cwd, norm(v.title)].join('\u0000');
export const markSent = (kind: 'issue' | 'pull', v: CreateVars): void => { sentForms.add(formKey(kind, v)); };
export const wasSent = (kind: 'issue' | 'pull', v: CreateVars): boolean => sentForms.has(formKey(kind, v));

/** What gh printed for a send that may have gone through: the agent's details.output (keepDetails; the agent redacts tokens
 *  from it), trimmed; '' when there is none. */
export const outputOf = (r: { details?: Record<string, unknown> } | undefined): string => {
  const o = r?.details?.output;
  return typeof o === 'string' ? o.trim() : '';
};
/** gh's output per held send, by its hold token, for this page life only: core keeps details on the send's result, never
 *  on the held change, so a reload or another tab shows the band without it. A hold this page completes or dismisses
 *  drops its entry (forgetOutput); one settled elsewhere (core's read-back, another tab) ages out: only the OUTPUT_MAX
 *  newest are kept (each at most core's 8 KiB of details). */
export const OUTPUT_MAX = 16;
const heldOutputs = new Map<string, string>();
export const noteOutput = (r: { outcome: string; hold?: string; details?: Record<string, unknown> }): void => {
  const o = outputOf(r);
  if (r.outcome !== 'pending' || !r.hold || !o) return;
  heldOutputs.delete(r.hold);
  heldOutputs.set(r.hold, o);
  for (const k of heldOutputs.keys()) { if (heldOutputs.size <= OUTPUT_MAX) break; heldOutputs.delete(k); }
};
export const forgetOutput = (hold: string): void => { heldOutputs.delete(hold); };
/** The hold's entry goes once core says the hold was completed or dismissed (true); a refused call keeps it. */
export const forgetOutputIf = (hold: string) => (ok: boolean): boolean => { if (ok) forgetOutput(hold); return ok; };
export const heldOutput = (hold: string | undefined): string => (hold ? heldOutputs.get(hold) ?? '' : '');
/** Tests only. */
export const heldOutputCount = (): number => heldOutputs.size;
/** Tests only. */
export const forgetSent = (): void => { sentForms.clear(); heldOutputs.clear(); };
