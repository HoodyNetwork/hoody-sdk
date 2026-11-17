// Upload's rules, pure (uploading new names). uploadRun.ts runs them.
//
// Contract, in plain words:
//   - planOf(folder, taken, picked, choice): one row per picked file, in the order picked. A name the folder (or an
//     earlier row that will be sent) already holds is taken: the batch's choice is Keep both (the first free
//     `name-N`, still create only) or Skip. Only names that will be sent count as taken for later rows, so with Skip
//     a Keep-both name is never reserved.
//     A name the files program would refuse, or a path core cannot address, is refused (`bad`) and never sent. The
//     limits are checked before anything is sent: 10 GiB a file, 5,000 files and 50 GiB a batch.
//   - verdictOf(outcome) reads one sendFile outcome: done (2xx); taken (412: another file holds the name now;
//     nothing written); refused (400, 403, 404, 409, 413: answered before anything was written); not sent; or
//     unknown (every other answer, and no answer at all: it may have gone through).
//   - checkOf(entry, listing, hash) is Check again for an upload whose outcome is unknown, from reads only: the name
//     absent from a whole listing (not uploaded), there with the SHA-256 that was held (uploaded), there with other
//     bytes (another file has the name), or no verdict yet. A name a listing that is not whole does not show decides
//     nothing.
//   - The batch hold's meta (UploadMeta) names only what may matter after this tab is gone: the files being sent
//     and the ones whose outcome is unknown, plus how many picked files were never sent (`left`). metaOf reads it
//     back strictly: anything else is null, and only the warned Stop tracking frees such a hold.
import type { FileUploadOutcome } from '@core';
import { blockedPath, joinPath, nameIn, partsOf, type FreshFolder } from './logic';
import { keepBothName, nameProblem, type NameProblem } from './plan';

const GiB = 1024 ** 3;
/** A file, a batch's file count and its bytes. */
export const LIMITS = Object.freeze({ fileBytes: 10 * GiB, files: 5000, batchBytes: 50 * GiB });
/** The batch stops sending new files while this many outcomes are unknown (the hard stop). */
export const MAX_UNKNOWN = 10;

export type Choice = 'keep' | 'skip';
export interface PickedFile { readonly name: string; readonly size: number }
export interface PlanRow {
  /** Its place in the pick. */
  readonly i: number;
  readonly name: string;
  readonly size: number;
  /** The folder (or an earlier row) already holds this name. */
  readonly taken: boolean;
  /** The Keep-both name for a taken one (null: none free). */
  readonly keepAs: string | null;
  /** Why it can never be sent (a name the files program refuses, a path core cannot address, over 10 GiB). */
  readonly bad: NameProblem | 'tooBig' | 'noKeepName' | null;
}
export type PlanProblem = 'tooMany' | 'tooBig' | 'empty' | null;
export interface Plan { readonly rows: readonly PlanRow[]; readonly problem: PlanProblem; readonly bytes: number }

/** The plan for the picked files in `folder`, whose names are `taken` now. */
export function planOf(folder: string, taken: readonly string[], picked: readonly PickedFile[], choice: Choice = 'keep'): Plan {
  const names = new Set(taken);
  const rows: PlanRow[] = [];
  let bytes = 0;
  picked.forEach((f, i) => {
    bytes += f.size;
    const problem = nameProblem(f.name, folder, []);
    const isTaken = names.has(f.name);
    const keepAs = isTaken ? keepBothName(f.name, [...names]) : null;
    const bad: PlanRow['bad'] = problem ?? (f.size > LIMITS.fileBytes ? 'tooBig' : isTaken && (!keepAs || nameProblem(keepAs, folder, []) || !addressable(joinPath(folder, keepAs))) ? 'noKeepName' : null);
    rows.push({ i, name: f.name, size: f.size, taken: isTaken, keepAs, bad });
    // Every name this batch will write with this choice counts as taken for the rows after it (a taken row's own
    // name is in the set already; under Skip it writes nothing).
    if (!bad) { if (!isTaken) names.add(f.name); else if (choice === 'keep' && keepAs) names.add(keepAs); }
  });
  const problem: PlanProblem = !picked.length ? 'empty' : picked.length > LIMITS.files ? 'tooMany' : bytes > LIMITS.batchBytes ? 'tooBig' : null;
  return { rows, problem, bytes };
}

/** The name a row is sent as with this choice (null: not sent). */
export const sendName = (r: PlanRow, choice: Choice): string | null => (r.bad ? null : !r.taken ? r.name : choice === 'keep' ? r.keepAs : null);

/** A path the files program's PUT can be sent to: one part or more, inside core's depth, no part core refuses. */
export const addressable = (path: string): boolean => partsOf(path).length >= 1 && !blockedPath(path);

export type Verdict =
  | { readonly at: 'done' }
  | { readonly at: 'taken' }
  | { readonly at: 'refused'; readonly code: string }
  | { readonly at: 'notSent'; readonly code: string }
  | { readonly at: 'unknown'; readonly why: string };

/** Answers to a create-only PUT that come before anything is written (the kit's putFile responses). */
const UNCHANGED = new Set([400, 403, 404, 409, 413]);
export function verdictOf(o: FileUploadOutcome): Verdict {
  if (o.outcome === 'done') return { at: 'done' };
  if (o.outcome === 'not_sent') return { at: 'notSent', code: o.code };
  if (o.outcome === 'unknown') return { at: 'unknown', why: o.why };
  const s = o.rejection.status;
  if (s === 412) return { at: 'taken' };
  if (UNCHANGED.has(s)) return { at: 'refused', code: o.rejection.code ?? String(s) };
  return { at: 'unknown', why: String(s) };
}

export type Check =
  | { readonly at: 'reading'; readonly hash: boolean }
  | { readonly at: 'failed' }
  | { readonly at: 'absent' }
  | { readonly at: 'uploaded' }
  | { readonly at: 'other' };
/** Check again for one upload, from a fresh listing of its folder and (when it is there) its SHA-256 read now. */
export function checkOf(e: UploadEntry, listing: FreshFolder | 'failed' | undefined, hash: string | 'failed' | undefined): Check {
  if (listing === undefined) return { at: 'reading', hash: false };
  if (listing === 'failed') return { at: 'failed' };
  const found = nameIn(listing, partsOf(e.path).at(-1) ?? '');
  if (found === 'unknown') return { at: 'failed' };
  if (found === 'absent') return { at: 'absent' };
  if (found.dir) return { at: 'other' };
  if (hash === undefined) return { at: 'reading', hash: true };
  if (hash === 'failed') return { at: 'failed' };
  return hash === e.sha256 ? { at: 'uploaded' } : { at: 'other' };
}

// ── the batch hold's meta ───────────────────────────────────────────────────────────────────────────────────
export interface UploadEntry {
  /** This file's own id in the batch (never reused). */
  readonly id: string;
  readonly path: string;
  readonly size: number;
  /** Lower-case hex SHA-256, as core computed it before the send. */
  readonly sha256: string;
  /** sending: the request may be out now; unknown: it went out and no answer says what happened. */
  readonly phase: 'sending' | 'unknown';
}
export interface UploadMeta {
  readonly v: 1;
  readonly batch: string;
  readonly computer: string;
  readonly computerName: string;
  readonly folder: string;
  readonly files: readonly UploadEntry[];
  /** Picked files never sent (this tab stopped, or was closed): they must be picked again. */
  readonly left: number;
}
const isStr = (x: unknown): x is string => typeof x === 'string';
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
function entryOf(x: unknown): UploadEntry | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Record<string, unknown>;
  if (!isStr(e.id) || !e.id || !isStr(e.path) || !addressable(e.path) || !isCount(e.size) || !isStr(e.sha256) || !/^[0-9a-f]{64}$/.test(e.sha256)) return null;
  if (e.phase !== 'sending' && e.phase !== 'unknown') return null;
  return { id: e.id, path: e.path, size: e.size, sha256: e.sha256, phase: e.phase };
}
/** The meta read back strictly (null: not whole). */
export function metaOf(x: unknown): UploadMeta | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as Record<string, unknown>;
  if (m.v !== 1 || !isStr(m.batch) || !m.batch || !isStr(m.computer) || !m.computer || !isStr(m.computerName) || !isStr(m.folder) || !m.folder.startsWith('/') || !isCount(m.left) || !Array.isArray(m.files)) return null;
  const files = m.files.map(entryOf);
  if (files.some((f) => f === null)) return null;
  return { v: 1, batch: m.batch, computer: m.computer, computerName: m.computerName, folder: m.folder, files: files as UploadEntry[], left: m.left };
}
