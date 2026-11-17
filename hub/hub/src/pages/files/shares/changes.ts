// The changes of a storage share: share a folder, turn a share off or on, change its access, try a failed one
// again, stop sharing. Pure: the variables each send carries, the lock each holds, what a fresh list proves, and which
// refusals leave the outcome unknown. data.ts declares them on the page's core source; core sends each once.
//
// The API has no idempotency key on any of them. A lost answer is never sent again: core holds the change and reads
// the share lists back, and only a fresh list frees it. A list that does not show the change proves nothing (the
// servers may still be working on it), so the change stays held until a later read shows it or the person stops
// tracking it. A 409 is held too: the API answers 409 both when nothing was written and when the change was saved
// but its follow-up was busy, and the answer does not say which; the 409 itself is never taken as proof either way.
// A create carries the ids of the shares of that folder to that computer a whole, fresh list held just before the send
// (`before`): only a share that is not one of them, with the access that was asked, is this send's.
import type { ShareList, ShareMode, ShareRow } from './wire';

export const CREATE_LOCK = 'files.share_create';
export const CHANGE_LOCK = 'files.share_change';
export const STOP_LOCK = 'files.share_stop';

/** `expiresAt`: Unix seconds; absent sends none (the share has no end). `before`: the ids of the shares of this folder
 *  to this computer a whole, fresh list held just before the send (beforeOf); it is not sent. */
export interface CreateVars { source: string; path: string; target: string; mode: ShareMode; before: readonly string[]; expiresAt?: number }
/** `path`: the shared folder, kept with the held change so it can be named; it is not sent. */
export interface EnabledVars { source: string; share: string; path: string; enabled: boolean }
export interface ModeVars { source: string; share: string; path: string; mode: ShareMode }
export interface RetryVars { source: string; share: string; path: string }
/** `target`: the receiving computer, or '' for a share with a whole project. */
export interface StopVars { source: string; share: string; path: string; target: string }

type Verdict = 'applied' | undefined;
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const lists = (answers: readonly (readonly unknown[])[]): ShareList[] =>
  answers.flat().filter((a): a is ShareList => !!a && typeof a === 'object' && Array.isArray((a as ShareList).rows));

const sameShare = (r: ShareRow, source: string, path: string, target: string) => r.sourceComputerId === source && r.sourcePath === path && r.targetComputerId === target;

/** The ids of the shares of `path` from `source` to `target` in a whole list of what `source` gives, or null when the
 *  list is not one (absent, another computer's or a received list, or holding rows it could not read). */
export function beforeOf(list: ShareList | undefined, v: { readonly source: string; readonly path: string; readonly target: string }): string[] | null {
  if (!list || list.dropped !== 0 || (list.of !== `given:${v.source}` && list.of !== 'allGiven')) return null;
  return list.rows.filter((r) => sameShare(r, v.source, v.path, v.target)).map((r) => r.id);
}

/** A new share is proved only by a fresh list holding a share of that folder from that computer to that computer that
 *  was not there before the send (`before`) and has the access that was asked. Without a `before` nothing proves it. */
export function createProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const i = rec(identity);
  const source = str(i.source), path = str(i.path), target = str(i.target);
  if (!source || !path || !target || (i.mode !== 'readonly' && i.mode !== 'readwrite')) return undefined;
  if (!Array.isArray(i.before) || !i.before.every((x) => typeof x === 'string')) return undefined;
  const before = i.before as string[];
  return lists(answers).some((l) => l.rows.some((r) => sameShare(r, source, path, target) && !before.includes(r.id) && r.mode === i.mode)) ? 'applied' : undefined;
}

const rowIn = (answers: readonly (readonly unknown[])[], share: string, source: string) =>
  lists(answers).flatMap((l) => l.rows).filter((r) => r.id === share && r.sourceComputerId === source);

/** Off or on is proved only by a fresh list in which that share reads the way it was sent. */
export function enabledProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const i = rec(identity);
  if (!str(i.share) || !str(i.source) || typeof i.enabled !== 'boolean') return undefined;
  const rows = rowIn(answers, str(i.share), str(i.source));
  return rows.length > 0 && rows.every((r) => r.enabled === i.enabled) ? 'applied' : undefined;
}

/** A change of access is proved only by a fresh list in which that share has the access that was sent. */
export function modeProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const i = rec(identity);
  if (!str(i.share) || !str(i.source) || (i.mode !== 'readonly' && i.mode !== 'readwrite')) return undefined;
  const rows = rowIn(answers, str(i.share), str(i.source));
  return rows.length > 0 && rows.every((r) => r.mode === i.mode) ? 'applied' : undefined;
}

/** Try again is proved only by a fresh list in which that share is on and no longer failed. A share that failed
 *  again reads the same as one never retried, so it proves nothing. */
export function retryProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const i = rec(identity);
  if (!str(i.share) || !str(i.source)) return undefined;
  const rows = rowIn(answers, str(i.share), str(i.source));
  return rows.length > 0 && rows.every((r) => r.enabled && r.status === 'active') ? 'applied' : undefined;
}

/** Stop sharing is proved only by a fresh, whole list that would hold the share and does not: what its source
 *  computer gives, what its target receives, or every share of the realm view. A list with unread rows proves nothing. */
export function stopProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const i = rec(identity);
  const share = str(i.share), source = str(i.source), target = str(i.target);
  if (!share || !source) return undefined;
  const would = (l: ShareList) => l.of === `given:${source}` || (target !== '' && l.of === `received:${target}`) || l.of === 'allGiven';
  const seen = lists(answers).filter((l) => would(l) && l.dropped === 0);
  return seen.length > 0 && seen.every((l) => !l.rows.some((r) => r.id === share)) ? 'applied' : undefined;
}

/** A create refused with 409 may still have made the share, unless the API named the one refusal that writes nothing. */
export const createHolds = (a: { readonly code?: string; readonly status?: number }): boolean => a.status === 409 && a.code !== 'SHARE_MOUNT_PATH_COLLISION';
/** A change or a stop refused with 409 may have been saved. */
export const changeHolds = (a: { readonly status?: number }): boolean => a.status === 409;

/** The refusals the Hub has its own sentence for (strings `err.<key>`); anything else keeps the kit's words. */
export type ShareRefusal = 'limit' | 'collision' | 'self' | 'owner' | 'path';

export function refusalOf(o: { readonly kind: string; readonly code?: string; readonly facts?: { readonly status?: number } } | undefined): ShareRefusal | null {
  if (!o || o.kind !== 'failed') return null;
  if (o.code === 'SERVER_STORAGE_SHARE_LIMIT') return 'limit';
  if (o.code === 'SHARE_MOUNT_PATH_COLLISION') return 'collision';
  if (o.code === 'SELF_SHARE') return 'self';
  if (o.facts?.status === 403) return 'owner';
  if (o.facts?.status === 400 || o.facts?.status === 422) return 'path';
  return null;
}
