// A folder's repository reads, on core. Every read names the folder's computer, its realm and the folder itself; the
// top bar's computer and realm never enter it. Reads only, nothing is sent that changes anything.
import { coreSource, type SourceTable, type Target } from '@core';
import { branchesOf, diffOf, identityOf, logOf, statusOf, type Branch, type Commit, type Diff, type RepoIdentity, type RepoStatus } from './logic';
import { repoRoutes } from './routes';

/** Where a folder's reads go: its computer, its realm (one realm or global, never All realms) and the folder. */
export interface FolderAt { readonly target: Target; readonly realm: string; readonly cwd: string }
interface DiffAt extends FolderAt { readonly staged: boolean }

const where = (p: FolderAt) => ({ target: p.target, realm: p.realm, cwd: p.cwd });

export const repoTable = {
  reads: {
    status: { route: repoRoutes.status, input: where, select: (raw) => statusOf(raw, Date.now()), staleTime: 0 },
    diff: { route: repoRoutes.diff, input: (p: DiffAt) => ({ ...where(p), query: p.staged ? { staged: 'true' } : {} }), select: (raw) => diffOf(raw), staleTime: 0 },
    log: { route: repoRoutes.log, input: where, select: (raw) => logOf(raw), staleTime: 0 },
    branches: { route: repoRoutes.branches, input: where, select: (raw) => branchesOf(raw), staleTime: 0 },
    identity: { route: repoRoutes.identity, input: where, select: (raw) => identityOf(raw), staleTime: 60_000 },
  },
} satisfies SourceTable;

const source = coreSource('ai-repo', repoTable);

const RE24 = /^[0-9a-f]{24}$/;
/** A folder the reads can go to: an absolute path, one realm or global. */
export const folderOk = (p: FolderAt | null | undefined): p is FolderAt =>
  !!p && p.cwd.startsWith('/') && (p.realm === 'global' || RE24.test(p.realm)) && !!p.target.container.id;

const params = (p: FolderAt | null): FolderAt => p ?? ({ target: { project: { id: '' }, container: { id: '' } }, realm: '', cwd: '' });

export const useRepoStatus = (p: FolderAt | null) => source.useQuery<RepoStatus, FolderAt>('status', params(p), { enabled: folderOk(p) });
/** Both diffs: what is not staged and what is (a commit records both: the agent stages all). */
export const useRepoDiff = (p: FolderAt | null, staged: boolean, enabled = true) => source.useQuery<Diff, DiffAt>('diff', { ...params(p), staged }, { enabled: enabled && folderOk(p) });
export const useRepoLog = (p: FolderAt | null, enabled = true) => source.useQuery<readonly Commit[], FolderAt>('log', params(p), { enabled: enabled && folderOk(p) });
export const useRepoBranches = (p: FolderAt | null, enabled = true) => source.useQuery<readonly Branch[], FolderAt>('branches', params(p), { enabled: enabled && folderOk(p) });
export const useRepoIdentity = (p: FolderAt | null, enabled = true) => source.useQuery<RepoIdentity, FolderAt>('identity', params(p), { enabled: enabled && folderOk(p) });
