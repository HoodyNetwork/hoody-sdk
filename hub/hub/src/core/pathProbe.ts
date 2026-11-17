// pathProbe.ts: what a path a chat names is on the chat's computer, and that computer's home folder.
// Both are read-only reads on the computer the chat is bound to, made only when a person opens
// a path's menu; nothing here sends a change.
//
//   fileStat    GET /api/v1/files/stat/*parts on the computer's files program (kit 'files', port 1): 'folder', 'file'
//               or 'other' (a pipe, socket or device). A 404 is a path the computer does not have; any other refusal
//               or failure tells nothing (statProblem). Keyed by the computer and the path, in the shown realm.
//   agentHome   GET /sessions/cwds `home` on the computer's agent, in the chat's realm: the agent's home folder, the
//               one a `~/` path names on that computer (never the browser's). Read once per computer and realm and
//               kept; null when the agent names none or names one that is not a clean absolute folder.
//   expandHome  a `~` or `~/…` path written against that home, or null when it is neither or cannot be one.
import { normalizeDirPath, partsOfPath } from './files-path';
import type { HubError } from './api';
import type { Target } from './ctx';
import { defineQuery } from './query';
import { defineRoute } from './routes';

/** What a path is on the computer. A symlink is what it points at. */
export type PathKind = 'folder' | 'file' | 'other';
/** Why a stat told nothing: the computer has no such path, refused the read (403), or the read failed. */
export type StatProblem = 'missing' | 'refused' | 'failed';

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** A stat answer is a few hundred bytes; 16 KiB bounds it. */
export const fileStatRoute = defineRoute({ method: 'GET', path: '/api/v1/files/stat/*parts', scope: 'kit', kit: 'files', index: 1, maxBytes: 16 * 1024, timeoutMs: 5000 });

/** The stat answer's path_type as a PathKind; anything else (no field, an unknown type) is not an answer. */
export function kindOfStat(raw: unknown): PathKind {
  const t = obj(raw)?.path_type;
  if (t === 'Dir' || t === 'SymlinkDir') return 'folder';
  if (t === 'File' || t === 'SymlinkFile') return 'file';
  if (t === 'Fifo' || t === 'Socket' || t === 'CharDevice' || t === 'BlockDevice') return 'other';
  throw new Error('NOT_A_STAT');
}

/** Why a fileStat read told nothing. Only the files program's own 404 is "no such path". */
export function statProblem(e: unknown): StatProblem {
  const x = e as HubError | null;
  if (x?.status === 404) return 'missing';
  if (x?.status === 403) return 'refused';
  return 'failed';
}

export interface StatInput { readonly target: Target; readonly path: string }

/** A path's parts as the stat sends them (`//`, `.` and a trailing `/` folded), or null when it cannot name one
 *  (relative, `..`, NUL, a part the files program cannot take): the read is then never made. */
export const statParts = (path: string): string[] | null => {
  const clean = normalizeDirPath(path);
  return clean === null ? null : partsOfPath(clean);
};

export const fileStat = defineQuery<unknown, PathKind, StatInput>(fileStatRoute, {
  input: (p) => ({ target: p.target, params: { parts: statParts(p.path) ?? [] } }),
  select: kindOfStat,
});

export const agentHomeRoute = defineRoute({ method: 'GET', path: '/sessions/cwds', scope: 'agent', realm: 'realm' });

/** The answer's home: a clean absolute folder (no control characters), or null. */
export function homeOfCwds(raw: unknown): string | null {
  const h = obj(raw)?.home;
  if (typeof h !== 'string' || /[\u0000-\u001f\u007f]/.test(h)) return null;
  const clean = normalizeDirPath(h);
  return clean !== null && clean === (h.replace(/\/+$/, '') || '/') ? clean : null;
}

export interface HomeInput { readonly target: Target; readonly realm: string }

/** The agent's home folder never moves while it runs: one read per computer and realm, kept. */
export const agentHome = defineQuery<unknown, string | null, HomeInput>(agentHomeRoute, {
  input: (p) => ({ target: p.target, realm: p.realm }),
  select: homeOfCwds,
  staleTime: Infinity,
});

/** `~` or `~/rest` against `home`; null for any other path (`~user/…` included) or a result that is not clean. */
export function expandHome(path: string, home: string): string | null {
  if (path !== '~' && !path.startsWith('~/')) return null;
  const joined = path === '~' ? home : (home === '/' ? '' : home) + path.slice(1);
  const clean = normalizeDirPath(joined);
  return clean !== null && clean === (joined.replace(/\/+$/, '') || '/') ? clean : null;
}
